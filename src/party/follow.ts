/**
 * GRUPO NO HUB, AO VIVO:
 *  - o LÍDER passa entre os jogos → o carrossel de todos acompanha, com o selo "♛ <líder> escolhendo…"
 *  - VOTAÇÃO (o líder liga no saguão): cada um escolhe o jogo na própria tela (o jogo do carrossel = o voto);
 *    os votos aparecem nas cartas (fotinhos); no JOGAR do líder vence o mais votado (empate: o do líder)
 * Carregado por register.ts (registerParty). O hub expõe selectGameById / cardEl / setLaunchFilter.
 */
import { bus } from '../core/events';
import { t } from '../i18n';
import { cardEl, isHostActive, selectGameById, selectedGame, setLaunchFilter } from '../hub/hub';
import { listGames } from '../hub/registry';
import { isLeader, sendFocus, setVoteMode, squad, voteFor, voteWinner, type SquadView } from './squad';

let thumb: ((skin: string, size?: number, avatar?: unknown) => HTMLImageElement) | null = null;
void import('../social/sheet').then((m) => (thumb = m.skinThumb));

function clearMarks(): void {
  document.querySelectorAll('.pf-banner, .pf-votes').forEach((e) => e.remove());
}

function render(): void {
  clearMarks();
  const v = squad();
  renderVoteBtn(v);
  if (!v || v.members.filter((m) => m.on).length < 2) return;
  const leader = v.members.find((m) => m.id === v.leader);
  if (v.vote) {
    // votos: fotinhos de quem votou em cada carta
    const by = new Map<string, typeof v.members>();
    for (const [id, g] of Object.entries(v.votes ?? {})) {
      const m = v.members.find((x) => x.id === id);
      if (m) by.set(g, [...(by.get(g) ?? []), m]);
    }
    for (const [g, ms] of by) {
      const show = cardEl(g)?.querySelector('.hc-show');
      if (!show) continue;
      const el = document.createElement('div');
      el.className = 'pf-votes';
      for (const m of ms) if (thumb) el.appendChild(thumb(m.skin, 26, m.avatar));
      el.appendChild(document.createTextNode(` ${ms.length}`));
      show.appendChild(el);
    }
    return;
  }
  // líder escolhendo (só para os outros)
  if (!isLeader() && v.focus && leader) {
    const show = cardEl(v.focus)?.querySelector('.hc-show');
    if (!show) return;
    const el = document.createElement('div');
    el.className = 'pf-banner';
    if (thumb) el.appendChild(thumb(leader.skin, 26, leader.avatar));
    const s = document.createElement('span');
    const cfg = Object.entries(v.cfg ?? {})
      .map(([k, x]) => `${k}: ${x}`)
      .join(' · ');
    s.innerHTML = `<i class="pf-crown">♛</i> `;
    s.appendChild(document.createTextNode(t('pf.choosing', '{w} escolhendo…', { w: leader.handle ? '@' + leader.handle : leader.name }) + (cfg ? ' · ' + cfg : '')));
    el.appendChild(s);
    show.appendChild(el);
  }
}

/** botão "Votação" no saguão do grupo (o líder liga/desliga; os outros veem se está ligada) */
function renderVoteBtn(v: SquadView | null): void {
  const side = document.querySelector('#pl-lobby .pl-side');
  let b = side?.querySelector<HTMLButtonElement>('.pf-votebtn');
  if (!side || !v) return void b?.remove();
  if (!b) {
    b = document.createElement('button');
    b.className = 'pf-votebtn';
    b.onclick = () => {
      const s = squad();
      if (s && isLeader()) setVoteMode(!s.vote);
    };
    side.prepend(b);
  }
  b.classList.toggle('on', !!v.vote);
  b.disabled = !isLeader();
  b.textContent = (v.vote ? '🗳 ' : '♛ ') + (v.vote ? t('pf.voteOn', 'Votação!') : isLeader() ? t('pf.vote', 'Votação') : t('pf.leaderPicks', 'Líder escolhe'));
}

/* ---------- "Fulano está jogando — ENTRAR" na carta do jogo (amigos com sala aberta desse jogo) ---------- */
let stripFor = '';
let lastFetch = 0;
async function renderPlaying(id: string): Promise<void> {
  stripFor = id;
  document.querySelectorAll('.pf-playing').forEach((e) => e.remove());
  if (squad()) return; // no grupo ninguém precisa entrar em sala: o líder leva todo mundo
  const show = cardEl(id)?.querySelector('.hc-show');
  if (!show) return;
  const el = document.createElement('div');
  el.className = 'pf-playing';
  show.appendChild(el);
  const fp = await import('./friends-play');
  if (stripFor !== id || !el.isConnected) return;
  fp.playingStrip(el, id);
  if (Date.now() - lastFetch > 20_000) lastFetch = Date.now();
}

let lastVote = '';
let started = false;
export function startFollow(): void {
  if (started) return;
  started = true;
  bus.on('hub-select', (id: string) => {
    void renderPlaying(id);
    const v = squad();
    if (!v) return;
    if (v.vote) {
      if (id !== lastVote) (lastVote = id), voteFor(id);
    } else if (isLeader()) sendFocus(id);
  });
  bus.on('squad-focus', (f: { game: string }) => {
    const v = squad();
    if (!v || isLeader() || v.vote || isHostActive()) return render();
    selectGameById(f.game);
    render();
  });
  let wasVote = false;
  let wasLeader = false;
  bus.on('squad', (v: SquadView | null) => {
    if (v) {
      // virou votação: meu voto é o jogo que estou olhando
      if (v.vote && !wasVote) {
        lastVote = '';
        const g = selectedGame();
        if (g) (lastVote = g.id), voteFor(g.id);
      }
      // virei líder (ou o grupo começou): conto para os outros onde estou
      if (isLeader() && (!wasLeader || (!v.vote && wasVote))) {
        const g = selectedGame();
        if (g) sendFocus(g.id);
      }
      // entrei no grupo agora: acompanho o líder
      if (!isLeader() && !v.vote && v.focus && !isHostActive()) selectGameById(v.focus, true);
      wasVote = !!v.vote;
      wasLeader = isLeader();
    } else wasVote = wasLeader = false;
    render();
  });
  // JOGAR do líder na votação: abre o mais votado
  setLaunchFilter((def) => {
    const v = squad();
    if (!v?.vote || !isLeader()) return def;
    const w = voteWinner(def.id);
    if (w) setVoteMode(false);
    return (w && listGames().find((g) => g.id === w)) || def;
  });
  render();
  const g = selectedGame();
  if (g) void renderPlaying(g.id);
}
