/**
 * DUELO — framework genérico para jogos solo virarem online (servidor: server/duel.ts, DO DuelRoom).
 * Todo mundo joga o MESMO desafio (mesma semente), ao mesmo tempo, vendo o progresso dos outros.
 *
 *   const entry = takeDuel('cor') ?? freshDuel('cor');           // grupo / link / botão "Duelo"
 *   const duel = startDuel({
 *     game: 'cor', root, title: 'Pintou, Ganhou!', rank: 'score', limitSec: 150, entry,
 *     start(seed, round) { ... começa a rodada com essa semente ... },
 *     stop() { ... para a rodada (tempo acabou / revanche) ... },
 *     exit() { ... volta para o menu do jogo ... },
 *   });
 *   duel.progress(pontos, 0..1);   // durante a rodada (o duelo limita a ~5/s)
 *   duel.finish(pontos);           // terminou (o tempo conta sozinho)
 *
 * Telas (tudo aqui, por cima do jogo): sala (código, QR, chamar amigos, quem chegou, COMEÇAR),
 * contagem 3‑2‑1, barra ao vivo com todos, "esperando os outros" e o pódio com REVANCHE.
 * No grupo, o líder é o anfitrião e a partida começa sozinha quando todos chegam.
 */
import { t } from '../i18n';
import { icon } from '../ui/icons';
import { notify } from '../ui/notify';
import { audio } from '../core/audio';
import { tap } from '../core/haptics';
import { pushBack } from '../core/back';
import { api, me, wsUrl } from '../social/net';
import { duelInviteGame, type DuelEntry, newDuelCode, DUEL_CODE_RE } from './duel-link';
import './duel.css';

export { freshDuel, takeDuel, registerDuelGame } from './duel-link';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const DUEL_COLORS = ['#ffd34a', '#5ef0ff', '#ff5cae', '#7dff9a'];
const FRIENDS_SVG = `<svg viewBox="0 0 32 24" width="1.4em" height="1.05em" aria-hidden="true"><circle cx="11" cy="8" r="5" fill="currentColor"/><path d="M1 23c0-6 4.5-9 10-9s10 3 10 9z" fill="currentColor"/><circle cx="23" cy="7" r="4" fill="currentColor" opacity=".75"/><path d="M19 13.5c1.2-.4 2.5-.5 4-.5 4.6 0 8 2.6 8 8h-8.5c-.3-3-1.6-5.7-3.5-7.5z" fill="currentColor" opacity=".75"/></svg>`;
export const friendsIcon = (): string => FRIENDS_SVG;

export interface DuelPlayer {
  id: string;
  name: string;
  skin: string;
  s: number;
  p: number;
  done: boolean;
  ms: number;
  on: boolean;
}
interface RoomState {
  phase: 'lobby' | 'count' | 'play' | 'done';
  host: string;
  round: number;
  seed: number;
  at: number;
  limit: number;
  rank: 'score' | 'time';
  n: number;
  players: DuelPlayer[];
}
interface Rank {
  id: string;
  name: string;
  skin: string;
  s: number;
  ms: number;
  done: boolean;
  place: number;
}

/* ================================ rede ================================ */

type Who = { id: string; name: string; skin: string };
class DuelNet {
  ws: WebSocket | null = null;
  state: RoomState | null = null;
  you = '';
  /** Date.now() local − Date.now() do servidor */
  skew = 0;
  onState: ((s: RoomState) => void) | null = null;
  onPeer: ((id: string, s: number, p: number, x?: unknown) => void) | null = null;
  onRes: ((r: Rank[]) => void) | null = null;
  onClose: (() => void) | null = null;
  closed = false;

  constructor(
    readonly game: string,
    readonly code: string,
  ) {}

  open(who: Who, create: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        const q = new URLSearchParams({ id: who.id, name: who.name.slice(0, 24), skin: /^[a-z0-9_-]{1,24}$/.test(who.skin) ? who.skin : 'bloop', ...(create ? { create: '1' } : {}) });
        ws = new WebSocket(wsUrl(`/duel/${this.game}/${this.code}?${q}`));
      } catch {
        return reject(new Error('offline'));
      }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          /* */
        }
        reject(new Error('timeout'));
      }, 8000);
      ws.onmessage = (e) => {
        let m: any;
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === 'reject') {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error(String(m.reason)));
          }
          return;
        }
        if (m.t === 'state') {
          if (typeof m.now === 'number') this.skew = Date.now() - m.now;
          if (m.you) this.you = m.you;
          this.state = m.s as RoomState;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            this.ws = ws;
            resolve();
          }
          this.onState?.(this.state);
        } else if (m.t === 'p') {
          const p = this.state?.players.find((x) => x.id === m.id);
          if (p) (p.s = m.s), (p.p = m.p);
          this.onPeer?.(m.id, m.s, m.p, m.x);
        } else if (m.t === 'res') this.onRes?.(m.ranks as Rank[]);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error('offline'));
          return;
        }
        if (this.ws === ws) {
          this.ws = null;
          if (!this.closed) this.onClose?.();
        }
      };
      ws.onerror = () => {};
    });
  }
  send(m: unknown): void {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m));
  }
  close(): void {
    this.closed = true;
    try {
      this.ws?.close();
    } catch {
      /* */
    }
    this.ws = null;
  }
}

/* ================================ placar ao vivo (reutilizável) ================================ */

export interface BarRow {
  id: string;
  name: string;
  skin?: string;
  /** valor mostrado (pontos, metros...) */
  v: number;
  /** 0..1 */
  p: number;
  me?: boolean;
  done?: boolean;
  off?: boolean;
}
/**
 * Placar ao vivo compacto (uma linha por jogador: cor, nome, barra, valor). Não captura toques.
 * Usado pelo duelo e pelos jogos de presença no grupo (Desastre, Rally...).
 */
export class LiveBar {
  readonly el: HTMLDivElement;
  private rows = new Map<string, HTMLElement>();
  private order: string[] = [];
  constructor(
    root: HTMLElement,
    private fmt: (v: number) => string = (v) => String(Math.round(v)),
    pos: 'top' | 'bottom' | 'left' = 'top',
  ) {
    this.el = document.createElement('div');
    this.el.className = 'dl-bar dl-' + pos;
    this.el.setAttribute('aria-hidden', 'true');
    root.appendChild(this.el);
  }
  set(list: BarRow[]): void {
    const ids = list.map((r) => r.id);
    if (ids.join() !== this.order.join()) {
      this.el.innerHTML = '';
      this.rows.clear();
      list.forEach((r, i) => {
        const row = document.createElement('div');
        row.className = 'dl-row';
        row.style.setProperty('--c', DUEL_COLORS[i % DUEL_COLORS.length]);
        row.innerHTML = `<i class="dl-dot"></i><b class="dl-nm"></b><span class="dl-track"><span class="dl-fill"></span></span><em class="dl-v"></em>`;
        this.el.appendChild(row);
        this.rows.set(r.id, row);
      });
      this.order = ids;
    }
    // quem está na frente fica em cima (sem reconstruir o DOM: só a ordem visual)
    const sorted = list.slice().sort((a, b) => Number(b.done) - Number(a.done) || b.p - a.p || b.v - a.v);
    for (const r of list) {
      const row = this.rows.get(r.id)!;
      row.style.order = String(sorted.indexOf(r));
      row.classList.toggle('me', !!r.me);
      row.classList.toggle('done', !!r.done);
      row.classList.toggle('off', !!r.off);
      const nm = row.querySelector('.dl-nm') as HTMLElement;
      const n = r.me ? t('duel.you', 'Você') : r.name;
      if (nm.textContent !== n) nm.textContent = n;
      (row.querySelector('.dl-fill') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, r.p)) * 100)}%`;
      (row.querySelector('.dl-v') as HTMLElement).textContent = r.done ? '✓ ' + this.fmt(r.v) : this.fmt(r.v);
    }
  }
  destroy(): void {
    this.el.remove();
  }
}

/* ================================ duelo ================================ */

export interface DuelOpts {
  game: string;
  /** onde as telas do duelo aparecem (a raiz do jogo) */
  root: HTMLElement;
  title: string;
  /** quem ganha: mais pontos ('score') ou terminar primeiro ('time') */
  rank: 'score' | 'time';
  /** tempo máximo da rodada (s) — depois disso o pódio sai com quem tiver */
  limitSec: number;
  entry: DuelEntry;
  /** como mostrar os pontos (padrão: número) */
  fmt?(s: number): string;
  /** onde fica a barra ao vivo */
  hud?: 'top' | 'bottom' | 'left';
  /** começa a rodada (todos com a mesma semente) */
  start(seed: number, round: number): void;
  /** para a rodada atual (o tempo acabou ou o duelo terminou sem você) */
  stop?(): void;
  /** saiu do duelo: volte ao menu do jogo */
  exit(): void;
  /** fantasma dos outros (opcional): o que eles mandaram em progress(.., x) */
  onGhost?(id: string, x: unknown): void;
}

export interface DuelCtl {
  /** pontos e progresso (0..1) durante a rodada; `x` = dado pequeno de fantasma (opcional) */
  progress(score: number, prog: number, x?: unknown): void;
  /** terminei (pontos finais) */
  finish(score: number): void;
  /** rodada valendo agora (entre o JÁ! e o fim) */
  readonly playing: boolean;
  readonly online: boolean;
  /** sai do duelo (sem chamar exit) */
  leave(): void;
}

const fmtTime = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return s < 60 ? s.toFixed(1).replace('.', t('cor.decimal', ',')) + 's' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

let thumbMod: typeof import('../social/sheet') | null = null;
void import('../social/sheet').then((m) => (thumbMod = m));
function avatar(skin: string, size: number): string {
  const wrap = document.createElement('span');
  wrap.className = 'dl-ava';
  wrap.style.width = wrap.style.height = size + 'px';
  if (thumbMod) {
    try {
      wrap.appendChild(thumbMod.skinThumb(skin, size));
    } catch {
      /* */
    }
  }
  return wrap.outerHTML;
}

/** Começa (cria/entra) um duelo e cuida de todas as telas. */
export function startDuel(o: DuelOpts): DuelCtl {
  const layer = document.createElement('div');
  layer.className = 'dl-layer';
  o.root.appendChild(layer);
  let net: DuelNet | null = null;
  let who: Who | null = null;
  let dead = false;
  let screen: HTMLElement | null = null;
  let popBack: (() => void) | null = null;
  let bar: LiveBar | null = null;
  let round = 0;
  let playing = false;
  let finished = false;
  let t0 = 0;
  let myScore = 0;
  let myProg = 0;
  let lastSend = 0;
  let sendTimer = 0;
  let clock = 0;
  let autoStartT = 0;
  let lastRanks: Rank[] | null = null;
  let waitEl: HTMLElement | null = null;
  const fmt = o.fmt ?? ((s: number) => String(Math.round(s)));
  const fmtRank = (r: { s: number; ms: number; done: boolean }) => (o.rank === 'time' ? (r.done ? fmtTime(r.ms) : '—') : fmt(r.s));

  const setScreen = (el: HTMLElement | null, back?: () => void) => {
    screen?.remove();
    popBack?.();
    popBack = null;
    screen = el;
    if (el) {
      layer.appendChild(el);
      if (back) popBack = pushBack(back);
    }
  };
  const isHost = () => !!net?.state && net.state.host === net.you;

  /* ---------------- conexão ---------------- */
  const connect = async (code: string, create: boolean) => {
    setScreen(card(`<div class="dl-wait">${FRIENDS_SVG}<b>${esc(t('duel.connecting', 'Entrando no duelo…'))}</b><i class="dl-spin"></i></div><button class="dl-btn ghost" data-x>${icon('close', { size: 22 })}</button>`), () => leave(true));
    screen!.querySelector('[data-x]')!.addEventListener('click', () => leave(true));
    try {
      who = who ?? (await me());
    } catch {
      who = null;
    }
    if (dead) return;
    if (!who?.id) return fail(t('duel.offline', 'Sem internet agora — o duelo precisa de conexão.'));
    // quem não é o anfitrião espera a sala abrir (o líder pode demorar um pouquinho)
    const tries = create ? 1 : 25;
    for (let i = 0; i < tries && !dead; i++) {
      const n = new DuelNet(o.game, code);
      try {
        await n.open(who, create);
        if (dead) return n.close();
        net = n;
        bind(n);
        return;
      } catch (e) {
        const why = (e as Error).message;
        if (why === 'no_room' && i < tries - 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        if (dead) return;
        return fail(
          why === 'no_room' || why === 'bad_code'
            ? t('duel.noRoom', 'Duelo não encontrado. Confira o código!')
            : why === 'full'
              ? t('duel.full', 'Esse duelo está cheio (4).')
              : why === 'started'
                ? t('duel.started', 'Esse duelo já começou. Espere a próxima!')
                : t('duel.offline', 'Sem internet agora — o duelo precisa de conexão.'),
        );
      }
    }
  };
  const fail = (msg: string) => {
    notify(msg, { icon: 'cloud-off', kind: 'bad' });
    leave(true);
  };

  const bind = (n: DuelNet) => {
    if (n.you && isHost()) n.send({ t: 'cfg', rank: o.rank, limit: o.limitSec, n: o.entry.n });
    n.onState = (s) => onState(s);
    n.onPeer = (id, _s, _p, x) => {
      refreshBar();
      if (x !== undefined) o.onGhost?.(id, x);
    };
    n.onRes = (r) => showResults(r);
    n.onClose = () => {
      if (dead) return;
      notify(t('duel.lost', 'A conexão do duelo caiu.'), { icon: 'cloud-off', kind: 'warn' });
      stopRound();
      leave(true);
    };
    onState(n.state!);
  };

  /* ---------------- estados ---------------- */
  const onState = (s: RoomState) => {
    if (dead) return;
    if (s.phase === 'lobby') {
      if (playing) stopRound();
      showLobby(s);
    } else if (s.phase === 'count' || s.phase === 'play') {
      if (s.round !== round) beginRound(s);
      else refreshBar();
    } else if (s.phase === 'done') {
      // entrou numa sala que acabou de terminar: fica na sala até a revanche
      if (!lastRanks && !playing) showLobby(s);
      else refreshBar();
    }
  };

  /* ---------------- sala ---------------- */
  let lobbyEl: HTMLElement | null = null;
  const showLobby = (s: RoomState) => {
    if (!net) return;
    lastRanks = null;
    const host = isHost();
    if (!lobbyEl || screen !== lobbyEl) {
      lobbyEl = card('');
      lobbyEl.classList.add('dl-lobby');
      setScreen(lobbyEl, () => leave(true));
      lobbyEl.addEventListener('click', (e) => onLobbyClick(e));
    }
    const code = net.code;
    const ppl = s.players
      .map((p, i) => `<div class="dl-pl ${p.on ? '' : 'off'}" style="--c:${DUEL_COLORS[i % 4]}">${avatar(p.skin, 46)}<b>${esc(p.id === net!.you ? t('duel.you', 'Você') : p.name)}</b>${p.id === s.host ? `<i class="dl-crown">${icon('crown', { size: 18 })}</i>` : ''}</div>`)
      .join('');
    const empty = Array.from({ length: Math.max(0, Math.min(4, Math.max(2, o.entry.n)) - s.players.length) }, () => `<div class="dl-pl empty"><span class="dl-ava q">?</span><b>…</b></div>`).join('');
    const canGo = host && s.players.filter((p) => p.on).length >= 2;
    (lobbyEl.querySelector('.dl-card') as HTMLElement).innerHTML = `
      <header class="dl-head"><button class="dl-btn round ghost" data-x aria-label="${esc(t('duel.exit', 'Sair'))}">${icon('close', { size: 24 })}</button>
        <div class="dl-ttl"><b>${icon('trophy', { size: 26 })}${esc(t('duel.title', 'Duelo'))}</b><small>${esc(o.title)}</small></div></header>
      <div class="dl-mid">
        <div class="dl-pls">${ppl}${empty}</div>
        ${o.entry.party ? '' : `<div class="dl-code"><small>${esc(t('duel.code', 'CÓDIGO'))}</small><b>${code
          .split('')
          .map((c) => `<i>${c}</i>`)
          .join('')}</b><button class="dl-btn round" data-qr aria-label="QR">${icon('link', { size: 22 })}</button></div>`}
        <div class="dl-rules">${o.rank === 'time' ? icon('clock', { size: 22 }) + esc(t('duel.ruleTime', 'Mesmo desafio para todos: quem terminar primeiro vence!')) : icon('star', { size: 22 }) + esc(t('duel.ruleScore', 'Mesmo desafio para todos: quem fizer mais pontos vence!'))}</div>
      </div>
      <div class="dl-acts">
        ${o.entry.party ? '' : `<button class="dl-btn" data-call>${FRIENDS_SVG}<span>${esc(t('duel.call', 'Chamar amigo'))}</span></button>`}
        ${host ? `<button class="dl-btn go" data-go ${canGo ? '' : 'disabled'}>${icon('play', { size: 28 })}<span>${esc(t('duel.go', 'Começar!'))}</span></button>` : `<div class="dl-hostwait"><i class="dl-spin sm"></i>${esc(t('duel.waitHost', 'Esperando o anfitrião começar…'))}</div>`}
      </div>`;
    // grupo: o anfitrião começa sozinho quando todos chegarem (ou depois de 25 s com quem estiver)
    clearTimeout(autoStartT);
    if (host && o.entry.party) {
      const here = s.players.filter((p) => p.on).length;
      autoStartT = window.setTimeout(() => net?.state?.phase === 'lobby' && net.send({ t: 'start' }), here >= o.entry.n ? 1200 : 25_000);
    }
  };
  const onLobbyClick = (e: Event) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || !net) return;
    audio.click();
    tap('light');
    if (b.dataset.x !== undefined) return leave(true);
    if (b.dataset.go !== undefined) {
      b.disabled = true;
      net.send({ t: 'start' });
    } else if (b.dataset.qr !== undefined) void showQr();
    else if (b.dataset.call !== undefined) void callFriends();
  };

  const showQr = async () => {
    if (!net) return;
    const { bloopLink, drawBloopQr } = await import('../ui/scan');
    const d = document.createElement('div');
    d.className = 'dl-pop';
    const link = bloopLink('duelo', `${o.game}/${net.code}`);
    d.innerHTML = `<div class="dl-card sm"><canvas></canvas><b class="dl-bigcode">${net.code}</b><p>${esc(t('duel.qrHint', 'Seu amigo toca em Escanear e aponta a câmera aqui.'))}</p><div class="dl-acts"><button class="dl-btn" data-share>${icon('link', { size: 22 })}<span>${esc(t('duel.share', 'Mandar link'))}</span></button><button class="dl-btn go" data-ok>${icon('check', { size: 22 })}</button></div></div>`;
    layer.appendChild(d);
    const pop = pushBack(() => d.remove());
    void drawBloopQr(d.querySelector('canvas')!, link, 220).catch(() => {});
    d.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (e.target === d || b?.dataset.ok !== undefined) {
        pop();
        d.remove();
      } else if (b?.dataset.share !== undefined) {
        const text = t('duel.shareTxt', 'Duelo comigo no {g} (Bloop World)! Código: {c}', { g: o.title, c: net!.code });
        try {
          if (navigator.share) await navigator.share({ title: 'Bloop World', text, url: link });
          else {
            await navigator.clipboard?.writeText(`${text} ${link}`);
            notify(t('duel.copied', 'Link copiado!'), { icon: 'link' });
          }
        } catch {
          /* cancelou */
        }
      }
    });
  };

  const callFriends = async () => {
    if (!net || !who) return;
    const { cachedSocial, refreshFriendsNow } = await import('../services/home');
    const d = document.createElement('div');
    d.className = 'dl-pop';
    d.innerHTML = `<div class="dl-card sm"><b class="dl-h2">${FRIENDS_SVG}${esc(t('duel.call', 'Chamar amigo'))}</b><div class="dl-frs"><i class="dl-spin"></i></div><div class="dl-acts"><button class="dl-btn" data-qr>${icon('link', { size: 22 })}<span>QR</span></button><button class="dl-btn go" data-ok>${icon('check', { size: 22 })}</button></div></div>`;
    layer.appendChild(d);
    const pop = pushBack(() => d.remove());
    const box = d.querySelector('.dl-frs') as HTMLElement;
    const fill = () => {
      const fr = cachedSocial()
        .friends.slice()
        .sort((a, b) => Number(b.online) - Number(a.online))
        .slice(0, 12);
      box.innerHTML = fr.length
        ? fr.map((f) => `<button class="dl-fr ${f.online ? 'on' : ''}" data-id="${esc(f.id)}">${avatar(f.skin, 34)}<span>${esc(f.handle ? '@' + f.handle : f.name)}</span><i class="dl-fdot"></i></button>`).join('')
        : `<p>${esc(t('duel.noFriends', 'Sem amigos ainda — mostre o QR para alguém do seu lado!'))}</p>`;
    };
    fill();
    void refreshFriendsNow().then(() => d.isConnected && fill());
    d.addEventListener('click', async (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (e.target === d || b?.dataset.ok !== undefined) {
        pop();
        d.remove();
        return;
      }
      if (b?.dataset.qr !== undefined) {
        pop();
        d.remove();
        return void showQr();
      }
      if (b?.dataset.id && net && who) {
        b.disabled = true;
        try {
          const r = await api<{ result: string }>('/friends/invite', { id: who.id, to: b.dataset.id, kind: 'game', game: duelInviteGame(o.game, net.code) });
          notify(r.result === 'sent' ? t('duel.invSent', 'Convite enviado!') : r.result === 'wait' ? t('fr.inv.wait', 'Você acabou de convidar. Espere um pouquinho.') : t('fr.inv.nf', 'Vocês precisam ser amigos.'), { icon: r.result === 'sent' ? 'party' : 'warning' });
          b.classList.add('sent');
        } catch {
          b.disabled = false;
          notify(t('friends.offline', 'Sem conexão. Tente de novo.'), { icon: 'cloud-off' });
        }
      }
    });
  };

  /* ---------------- rodada ---------------- */
  const beginRound = (s: RoomState) => {
    round = s.round;
    finished = false;
    playing = false;
    myScore = 0;
    myProg = 0;
    lastRanks = null;
    waitEl?.remove();
    waitEl = null;
    clearTimeout(autoStartT);
    setScreen(null);
    lobbyEl = null;
    const startLocal = s.at + (net?.skew ?? 0);
    const cd = document.createElement('div');
    cd.className = 'dl-count';
    layer.appendChild(cd);
    let shown = -1;
    const tick = () => {
      if (dead || round !== s.round) return cd.remove();
      const left = startLocal - Date.now();
      const n = Math.ceil(left / 1000);
      if (left <= 0) {
        cd.innerHTML = `<b class="go">${esc(t('duel.goNow', 'JÁ!'))}</b>`;
        audio.perfect?.(2);
        tap('heavy');
        setTimeout(() => cd.remove(), 650);
        startPlay(s);
        return;
      }
      if (n !== shown && n <= 3) {
        shown = n;
        cd.innerHTML = `<b>${n}</b><small>${esc(o.title)}</small>`;
        audio.tick?.(3 - n);
        tap('light');
      }
      requestAnimationFrame(tick);
    };
    tick();
    if (!bar) bar = new LiveBar(layer, o.rank === 'time' ? (v) => `${Math.round(v * 100)}%` : fmt, o.hud ?? 'top');
    bar.el.hidden = false;
    refreshBar();
  };
  const startPlay = (s: RoomState) => {
    playing = true;
    t0 = performance.now();
    try {
      o.start(s.seed, s.round);
    } catch (e) {
      console.warn('[duelo] start', e);
    }
    // relógio do limite (o servidor também encerra sozinho)
    clearInterval(clock);
    const limitAt = Date.now() + s.limit * 1000;
    const tm = document.createElement('div');
    tm.className = 'dl-clock';
    bar?.el.prepend(tm);
    clock = window.setInterval(() => {
      const left = Math.max(0, limitAt - Date.now());
      tm.innerHTML = `${icon('clock', { size: 14 })}<b>${Math.ceil(left / 1000)}</b>`;
      tm.classList.toggle('low', left < 10_000);
      if (left <= 0) {
        clearInterval(clock);
        if (playing && !finished) {
          if (o.rank === 'score') ctl.finish(myScore);
          else stopRound();
        }
      }
    }, 250);
  };
  const stopRound = () => {
    clearInterval(clock);
    bar?.el.querySelector('.dl-clock')?.remove();
    if (playing) {
      playing = false;
      try {
        o.stop?.();
      } catch {
        /* */
      }
    }
  };
  const refreshBar = () => {
    const s = net?.state;
    if (!bar || !s) return;
    // por pontos: a barra mostra a pontuação em relação ao líder; por tempo: o progresso do desafio
    const sc = (p: DuelPlayer) => (p.id === net!.you ? myScore : p.s);
    const top = Math.max(1, ...s.players.map(sc));
    bar.set(
      s.players.map((p) => ({
        id: p.id,
        name: p.name,
        skin: p.skin,
        v: o.rank === 'time' ? (p.id === net!.you ? myProg : p.p) : sc(p),
        p: o.rank === 'time' ? (p.id === net!.you ? myProg : p.p) : sc(p) / top,
        me: p.id === net!.you,
        done: p.done || (p.id === net!.you && finished),
        off: !p.on,
      })),
    );
  };
  const flush = () => {
    sendTimer = 0;
    lastSend = performance.now();
    net?.send({ t: 'p', s: Math.round(myScore), p: Math.round(myProg * 1000) / 1000, ...(pendingX !== undefined ? { x: pendingX } : {}) });
    pendingX = undefined;
  };
  let pendingX: unknown;

  /* ---------------- pódio ---------------- */
  const showResults = (ranks: Rank[]) => {
    if (dead) return;
    lastRanks = ranks;
    stopRound();
    waitEl?.remove();
    waitEl = null;
    if (bar) bar.el.hidden = true;
    const meR = ranks.find((r) => r.id === net?.you);
    const win = meR?.place === 1;
    if (win) audio.record?.();
    else audio.coin?.();
    tap(win ? 'heavy' : 'medium');
    const top = [ranks.find((r) => r.place === 2 && r !== ranks[0]) ?? ranks[1], ranks[0], ranks[2]];
    const block = (r: Rank | undefined, h: number, cls: string) =>
      r
        ? `<div class="dl-pod ${cls} ${r.id === net?.you ? 'me' : ''}"><div class="dl-podav">${avatar(r.skin, cls === 'p1' ? 64 : 52)}${r.place === 1 ? `<i class="dl-crown big">${icon('crown', { size: 30 })}</i>` : ''}</div><b class="dl-podn">${esc(r.id === net?.you ? t('duel.you', 'Você') : r.name)}</b><em>${esc(fmtRank(r))}</em><div class="dl-step" style="height:${h}px"><span>${r.place}</span></div></div>`
        : `<div class="dl-pod ${cls} empty"></div>`;
    const el = card(`
      <header class="dl-head"><div class="dl-ttl c"><b>${win ? icon('trophy', { size: 30 }) + esc(t('duel.win', 'Você venceu!')) : esc(t('duel.place', '{n}º lugar!', { n: meR?.place ?? ranks.length }))}</b><small>${esc(o.title)}</small></div></header>
      <div class="dl-podium">${block(top[0], 62, 'p2')}${block(top[1], 92, 'p1')}${block(top[2], 40, 'p3')}</div>
      ${ranks.length > 3 ? `<div class="dl-rest">${ranks
        .slice(3)
        .map((r) => `<span>${r.place}. ${esc(r.name)} · ${esc(fmtRank(r))}</span>`)
        .join('')}</div>` : ''}
      <div class="dl-acts"><button class="dl-btn ghost" data-x>${icon('close', { size: 24 })}<span>${esc(t('duel.exit', 'Sair'))}</span></button><button class="dl-btn go" data-again>${icon('refresh', { size: 26 })}<span>${esc(t('duel.again', 'Revanche!'))}</span></button></div>`);
    el.classList.add('dl-res', win ? 'win' : 'lose');
    setScreen(el, () => leave(true));
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b) return;
      audio.click();
      if (b.dataset.x !== undefined) leave(true);
      else if (b.dataset.again !== undefined) {
        b.disabled = true;
        net?.send({ t: 'again' });
      }
    });
  };

  const leave = (toMenu: boolean) => {
    if (dead) return;
    dead = true;
    clearTimeout(autoStartT);
    clearInterval(clock);
    clearTimeout(sendTimer);
    if (playing) {
      playing = false;
      try {
        o.stop?.();
      } catch {
        /* */
      }
    }
    net?.close();
    setScreen(null);
    layer.remove();
    if (toMenu) o.exit();
  };

  const ctl: DuelCtl = {
    progress(score, prog, x) {
      if (!playing || finished) return;
      myScore = score;
      myProg = Math.max(myProg, Math.max(0, Math.min(1, prog)));
      if (x !== undefined) pendingX = x;
      refreshBar();
      const since = performance.now() - lastSend;
      if (since > 200) flush();
      else if (!sendTimer) sendTimer = window.setTimeout(flush, 200 - since);
    },
    finish(score) {
      if (!playing || finished || dead) return;
      finished = true;
      myScore = score;
      myProg = 1;
      clearTimeout(sendTimer);
      sendTimer = 0;
      net?.send({ t: 'fin', s: Math.round(score), ms: Math.round(performance.now() - t0) });
      clearInterval(clock);
      bar?.el.querySelector('.dl-clock')?.remove();
      playing = false;
      refreshBar();
      // esperando os outros (o pódio aparece sozinho)
      if (!lastRanks && (net?.state?.players.filter((p) => p.on).length ?? 1) > 1) {
        waitEl = document.createElement('div');
        waitEl.className = 'dl-waitchip';
        waitEl.innerHTML = `<i class="dl-spin sm"></i>${esc(t('duel.waitOthers', 'Esperando os outros…'))}`;
        layer.appendChild(waitEl);
      }
    },
    get playing() {
      return playing && !finished;
    },
    get online() {
      return !!net;
    },
    leave: () => leave(false),
  };

  void connect(o.entry.code && DUEL_CODE_RE.test(o.entry.code) ? o.entry.code : newDuelCode(), o.entry.create);
  return ctl;
}

function card(html: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'dl-scr';
  d.innerHTML = `<div class="dl-card">${html}</div>`;
  // o conteúdo fica dentro do cartão; quem chama trata cliques no próprio .dl-scr
  return d;
}

/**
 * Botão "Duelo" pronto para menus de jogos (ícone de amigos + texto curto).
 * `cls` = classes do botão no estilo do jogo.
 */
export function duelButtonHtml(cls = ''): string {
  return `<button class="dl-menubtn ${cls}" data-duel>${FRIENDS_SVG}<span>${esc(t('duel.menu', 'Duelo online'))}</span></button>`;
}
