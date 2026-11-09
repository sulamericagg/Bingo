/**
 * CAMPEONATOS — lista (próximos/ao vivo/encerrados), inscrição com Fichas de Campeonato
 * (não compráveis), contagem regressiva, "Jogar rodada", chave/classificação e resultado
 * com resgate do prêmio em moedas (bancado pelo sistema — sem apostas).
 */
import { addCoins } from '../core/economy';
import { bus } from '../core/events';
import { success, tap } from '../core/haptics';
import { listGames } from '../hub/registry';
import { fmt, t } from '../i18n';
import { icon } from '../ui/icons';
import { getPlayer } from '../services/online';
import { api, me } from './net';
import { gameAvailable, playChampionshipRound, type ChampScoreResult } from './champ-context';
import { fmtCountdown, openSheet, skinThumb, toast, type Sheet } from './sheet';
import { addBadge, addFichas, getFichas, persistSocial, social } from './store';

interface Round {
  game: string;
  seed: number;
  start: number;
  end: number;
  label: string;
}
interface Standing {
  pid: string;
  name: string;
  skin: string;
  score: number | null;
  out: boolean;
}
interface ChampView {
  id: string;
  name: string;
  special: boolean;
  entry: number;
  prize: number;
  prizePer: number;
  signups: number;
  status: 'signup' | 'live' | 'done' | 'cancelled';
  round: number;
  rounds: Round[];
  standings: Standing[][];
  results: { pid: string; name: string; skin: string; place: number; prize: number; score: number }[] | null;
  cancelReason: string | null;
  now: number;
  me: { signed: boolean; canPlay?: boolean; attempts?: number; best?: number | null; out?: number | null; place?: number | null; prize?: number; refund?: boolean; claimed?: boolean };
}

const MAX_ATTEMPTS = 5;
let sheet: Sheet | null = null;
let items: ChampView[] = [];
let skew = 0; // relógio do servidor - local
let timers: number[] = [];
let detailId = '';

export function gameLabel(id: string): string {
  const g = listGames().find((x) => x.id === id);
  if (g) return g.name;
  const n: Record<string, string> = { orbit: 'Bloop Orbit', tubo: t('game.tubo', 'Tubo'), rally: t('game.rally', 'Rally'), tycoon: t('game.tycoon', 'Tycoon') };
  return n[id] ?? id;
}

const now = () => Date.now() + skew;

/** Nomes dos campeonatos automáticos vêm do servidor em pt; traduz os conhecidos. */
function champName(n: string): string {
  if (n === 'Campeonato Relâmpago') return t('champ.n.flash', 'Campeonato Relâmpago');
  if (n === 'Copa de Fim de Semana') return t('champ.n.weekend', 'Copa de Fim de Semana');
  return n;
}

function roundLabel(i: number): string {
  return [t('champ.r1', 'Classificatória'), t('champ.r2', 'Semifinal'), t('champ.r3', 'Final')][i] ?? t('champ.rn', 'Rodada {n}', { n: i + 1 });
}

function statusChip(c: ChampView): string {
  const L = {
    signup: t('champ.st.signup', 'Inscrições abertas'),
    live: t('champ.st.live', 'Ao vivo'),
    done: t('champ.st.done', 'Encerrado'),
    cancelled: t('champ.st.cancelled', 'Cancelado'),
  };
  return `<span class="sc-chipst ${c.status}">${L[c.status]}</span>`;
}

function countdownText(c: ChampView): string {
  const n = now();
  if (c.status === 'signup') return t('champ.startsin', 'Começa em {t}', { t: `<span class="sc-cd">${fmtCountdown(c.rounds[0].start - n)}</span>` });
  if (c.status === 'live') return t('champ.roundends', '{r} termina em {t}', { r: roundLabel(c.round), t: `<span class="sc-cd">${fmtCountdown(c.rounds[c.round].end - n)}</span>` });
  if (c.status === 'cancelled')
    return c.cancelReason === 'few_signups'
      ? t('champ.c.few', 'Poucos inscritos — fichas devolvidas.')
      : c.cancelReason === 'nobody_played'
        ? t('champ.c.nobody', 'Ninguém jogou — fichas devolvidas.')
        : t('champ.c.admin', 'Cancelado — fichas devolvidas.');
  return t('champ.ended', 'Encerrado');
}

export async function openChampionships(): Promise<void> {
  closeChampionships();
  sheet = openSheet(t('champ.title', 'Campeonatos'), 'trophy', { id: 'sc-champ' });
  const f = document.createElement('div');
  f.className = 'sc-fichas';
  f.id = 'sc-fichas';
  sheet.head.querySelector('h2')!.after(f);
  updateFichas();
  sheet.onClose(() => {
    timers.forEach((x) => clearInterval(x));
    timers = [];
    sheet = null;
    detailId = '';
  });
  sheet.body.innerHTML = `<div class="sc-empty">${t('champ.loading', 'Carregando...')}</div>`;
  await refresh();
  timers.push(window.setInterval(tickCountdowns, 1000));
  timers.push(window.setInterval(refresh, 15000));
}

export function closeChampionships(): void {
  sheet?.close();
}

function updateFichas(): void {
  const el = document.getElementById('sc-fichas');
  if (el) el.innerHTML = `${icon('ticket', { size: 24 })}<span>${getFichas()}</span>`;
  el?.setAttribute('aria-label', t('champ.fichas', 'Fichas de Campeonato: {n}', { n: getFichas() }));
}

async function refresh(): Promise<void> {
  const s = sheet;
  if (!s) return;
  const pid = getPlayer()?.id ?? (await me().catch(() => ({ id: '' }))).id;
  try {
    const r = await api<{ items: ChampView[] }>('/champ/list' + (pid ? `?me=${encodeURIComponent(pid)}` : ''));
    items = r.items;
    if (items[0]) skew = items[0].now - Date.now();
  } catch {
    if (sheet === s && !items.length) {
      s.body.innerHTML = `<div class="sc-empty">${icon('cloud-off', { size: 56 })}${t('champ.offline', 'Sem conexão. Os campeonatos precisam de internet.')}</div>`;
    }
    return;
  }
  if (sheet !== s) return;
  if (detailId) renderDetail(detailId);
  else renderList();
}

function tickCountdowns(): void {
  if (!sheet) return;
  sheet.body.querySelectorAll<HTMLElement>('[data-cd]').forEach((el) => {
    const c = items.find((x) => x.id === el.dataset.cd);
    if (c) el.innerHTML = countdownText(c);
  });
  // virou a fase? recarrega
  const n = now();
  if (items.some((c) => (c.status === 'signup' && n >= c.rounds[0].start) || (c.status === 'live' && n >= c.rounds[c.round].end))) refresh();
}

function renderList(): void {
  const s = sheet!;
  s.body.innerHTML = '';
  const intro = document.createElement('p');
  intro.className = 'sc-note';
  intro.style.margin = '0 2px 10px';
  intro.textContent = t('champ.intro', 'Use Fichas de Campeonato para se inscrever. Ganhe fichas jogando todo dia. Prêmios em moedas!');
  s.body.appendChild(intro);
  const visible = items.filter((c) => c.status !== 'cancelled' || c.me.signed);
  if (!visible.length) {
    s.body.insertAdjacentHTML('beforeend', `<div class="sc-empty">${icon('calendar', { size: 56 })}${t('champ.none', 'Nenhum campeonato agendado agora.')}</div>`);
    return;
  }
  const order = { live: 0, signup: 1, done: 2, cancelled: 3 };
  for (const c of [...visible].sort((a, b) => order[a.status] - order[b.status] || a.rounds[0].start - b.rounds[0].start)) s.body.appendChild(card(c));
}

function card(c: ChampView): HTMLElement {
  const el = document.createElement('div');
  el.className = 'sc-card' + (c.special ? ' special' : '') + (c.status === 'live' ? ' live' : '');
  el.innerHTML = `<div class="sc-card-top">${icon(c.special ? 'crown' : 'trophy', { size: 34 })}<h3></h3>${statusChip(c)}</div>
    <div class="sc-meta"><span>${icon('coins', { size: 20 })}<b>${fmt(c.prize)}</b>&nbsp;${t('champ.prize', 'de prêmio')}</span>
      <span>${icon('user', { size: 18 })}${t('champ.signups', '{n} inscritos', { n: c.signups })}</span>
      <span>${icon('ticket', { size: 18 })}${t('champ.entry', '{n} ficha(s)', { n: c.entry })}</span></div>
    <div class="sc-games">${c.rounds
      .map(
        (r, i) =>
          `<div class="sc-game${c.status === 'live' && i === c.round ? ' cur' : ''}${(c.status === 'live' && i < c.round) || c.status === 'done' ? ' past' : ''}">${roundLabel(i)}<b>${gameLabel(r.game)}</b></div>`,
      )
      .join('')}</div>
    <div class="sc-meta" data-cd="${c.id}">${countdownText(c)}</div>
    <div class="sc-card-actions"></div>`;
  el.querySelector('h3')!.textContent = champName(c.name);
  const acts = el.querySelector('.sc-card-actions') as HTMLElement;
  for (const b of actions(c)) acts.appendChild(b);
  return el;
}

function btn(cls: string, html: string, run?: () => void, disabled = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'sc-btn ' + cls;
  b.innerHTML = html;
  b.disabled = disabled;
  if (run) b.onclick = run;
  return b;
}

function actions(c: ChampView): HTMLButtonElement[] {
  const m = c.me;
  const out: HTMLButtonElement[] = [];
  const view = () => btn('ghost', icon('target', { size: 20 }) + t('champ.view', 'Ver chave'), () => renderDetail(c.id));
  if (c.status === 'signup') {
    if (m.signed) out.push(btn('ghost', icon('check', { size: 20 }) + t('champ.signed', 'Inscrito!'), undefined, true));
    else {
      const enough = getFichas() >= c.entry;
      out.push(btn('violet', icon('ticket', { size: 22 }) + t('champ.signup', 'Inscrever-se ({n})', { n: c.entry }), () => signup(c), !enough));
      if (!enough) {
        const n = btn('ghost sm', t('champ.nofichas', 'Faltam fichas: jogue amanhã para ganhar mais'), undefined, true);
        out.push(n);
      }
    }
  } else if (c.status === 'live') {
    if (m.canPlay) {
      const left = MAX_ATTEMPTS - (m.attempts ?? 0);
      const b = btn('green', `<span class="sc-play">${t('champ.play', 'Jogar rodada')}<small>${t('champ.left', '{n} tentativa(s)', { n: left })}</small></span>`, () => play(c), left <= 0);
      b.style.flex = '1.4';
      out.push(b);
    }
    out.push(view());
  } else {
    const claimFichas = m.refund && !m.claimed;
    const claimCoins = !m.refund && (m.prize ?? 0) > 0 && !m.claimed;
    if (claimFichas) out.push(btn('gold', icon('ticket', { size: 22 }) + t('champ.claimf', 'Resgatar {n} ficha(s)', { n: c.entry }), () => claim(c)));
    else if (claimCoins) out.push(btn('gold', icon('coins', { size: 22 }) + t('champ.claimc', 'Resgatar {n}', { n: fmt(m.prize ?? 0) }), () => claim(c)));
    if (c.status === 'done') out.push(btn('ghost', icon('trophy', { size: 20 }) + t('champ.results', 'Resultado'), () => renderDetail(c.id)));
  }
  return out;
}

async function signup(c: ChampView): Promise<void> {
  if (getFichas() < c.entry) return toast(t('champ.nofichas2', 'Você não tem fichas suficientes.'), 'ticket');
  const ident = await me().catch(() => null);
  if (!ident?.id) return toast(t('champ.offline2', 'Sem conexão agora.'), 'cloud-off');
  try {
    const r = await api<{ ok: boolean; entry: number; champ: ChampView }>('/champ/signup', { id: c.id, pid: ident.id, name: ident.name, skin: ident.skin });
    if (r.entry > 0) addFichas(-r.entry);
    updateFichas();
    success();
    toast(t('champ.signedok', 'Inscrição feita! Volte quando começar.'), 'check');
    await refresh();
  } catch (e) {
    toast((e as Error).message === 'offline' ? t('champ.offline2', 'Sem conexão agora.') : (e as Error).message, 'warning');
  }
}

async function play(c: ChampView): Promise<void> {
  const r = c.rounds[c.round];
  if (!gameAvailable(r.game)) return toast(t('champ.nogame', 'Este jogo ainda não está disponível nesta versão.'), 'warning');
  tap('medium');
  const id = c.id;
  closeChampionships();
  const ok = await playChampionshipRound({ champId: id, round: c.round, game: r.game, seed: r.seed }, () => {
    openChampionships().then(() => {
      detailId = id;
      refresh();
    });
  });
  if (!ok) {
    toast(t('champ.nogame', 'Este jogo ainda não está disponível nesta versão.'), 'warning');
    openChampionships();
  }
}

async function claim(c: ChampView): Promise<void> {
  const pid = getPlayer()?.id ?? '';
  try {
    const r = await api<{ coins: number; fichas: number }>('/champ/claim', { id: c.id, pid });
    if (r.coins) {
      addCoins(r.coins);
      if (c.me.place === 1) {
        social.champWins++;
        persistSocial();
        addBadge('champ');
      } else if ((c.me.place ?? 9) <= 3) addBadge('finalist');
      success();
      toast(t('champ.gotcoins', 'Você ganhou {n} moedas!', { n: fmt(r.coins) }), 'coins', 3500);
    }
    if (r.fichas) {
      addFichas(r.fichas);
      toast(t('champ.gotfichas', '{n} ficha(s) devolvida(s).', { n: r.fichas }), 'ticket');
    }
    updateFichas();
    await refresh();
  } catch {
    toast(t('champ.offline2', 'Sem conexão agora.'), 'cloud-off');
  }
}

/* ---------------- chave / resultado ---------------- */

function renderDetail(id: string): void {
  const s = sheet;
  const c = items.find((x) => x.id === id);
  if (!s || !c) return;
  detailId = id;
  const mine = getPlayer()?.id ?? '';
  s.body.innerHTML = '';
  const back = btn('ghost sm', icon('home', { size: 18 }) + t('champ.back', 'Todos os campeonatos'), () => {
    detailId = '';
    renderList();
  });
  back.style.marginBottom = '8px';
  s.body.appendChild(back);
  const top = card(c);
  top.querySelector('.sc-card-actions')!.replaceChildren(...actions(c).filter((b) => !b.textContent?.includes(t('champ.view', 'Ver chave')) && !b.textContent?.includes(t('champ.results', 'Resultado'))));
  s.body.appendChild(top);

  if (c.results?.length) {
    const pod = document.createElement('div');
    pod.className = 'sc-podium';
    const order = [1, 0, 2].filter((i) => c.results![i]);
    for (const i of order) {
      const r = c.results[i];
      const p = document.createElement('div');
      p.className = `sc-pod p${r.place}`;
      p.appendChild(skinThumb(r.skin, r.place === 1 ? 64 : 52));
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = r.name + (r.pid === mine ? ` (${t('champ.you', 'você')})` : '');
      const blk = document.createElement('div');
      blk.className = 'blk';
      blk.innerHTML = `${r.place}º<br>${icon('coin', { size: 16 })}${fmt(r.prize)}`;
      p.append(nm, blk);
      pod.appendChild(p);
    }
    s.body.appendChild(pod);
  }

  const br = document.createElement('div');
  br.className = 'sc-bracket';
  c.rounds.forEach((r, i) => {
    const col = document.createElement('div');
    col.className = 'sc-col';
    col.innerHTML = `<h4>${roundLabel(i)}<br><small>${gameLabel(r.game)}</small></h4>`;
    const st = c.standings[i] ?? [];
    if (!st.length) col.insertAdjacentHTML('beforeend', `<div class="sc-slot"><span class="n" style="opacity:.6">${c.status === 'signup' || (c.status === 'live' && i > c.round) ? t('champ.tbd', 'a definir') : '—'}</span></div>`);
    for (const p of st) {
      const sl = document.createElement('div');
      sl.className = 'sc-slot' + (p.out ? ' out' : '') + (p.pid === mine ? ' me' : '');
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = p.name;
      const sc = document.createElement('span');
      sc.className = 's';
      sc.textContent = p.score === null ? '-' : fmt(p.score);
      sl.append(n, sc);
      col.appendChild(sl);
    }
    br.appendChild(col);
  });
  s.body.appendChild(br);
  const rules = document.createElement('p');
  rules.className = 'sc-note';
  rules.textContent = t(
    'champ.rules',
    'Regras: todos jogam a mesma fase na rodada (melhor de {n} tentativas). Metade de cima avança. Se só uma pessoa jogar, ela leva o prêmio todo. Se ninguém jogar ou houver só 1 inscrito, as fichas são devolvidas.',
    { n: MAX_ATTEMPTS },
  );
  s.body.appendChild(rules);
}

/* resultado de cada partida de campeonato */
bus.on('champ-score', (r: ChampScoreResult) => {
  if (r.ok) toast(t('champ.scoreok', 'Pontuação enviada: {s} (melhor: {b})', { s: fmt(r.score), b: fmt(r.best ?? r.score) }), 'check', 3500);
  else toast(r.message && r.message !== 'offline' ? r.message : t('champ.scorefail', 'Não foi possível enviar a pontuação.'), 'warning', 3500);
});
bus.on('fichas', updateFichas);
