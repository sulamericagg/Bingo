/**
 * POLÍTICA CENTRAL DE ANÚNCIOS — limites de frequência, tetos diários, estatísticas e log de depuração.
 *
 * Não depende de AdMob nem de telas: só decide "pode agora?" e anota o que aconteceu.
 *  - canInterstitial(): todos os limites globais (AD_BREAKS em src/config.ts, ajustáveis pelo servidor)
 *  - rewardedLeft(kind): teto diário de vídeos premiados opcionais por tipo (AD_REWARDED.dailyCaps)
 *  - adStat(): contadores por dia e por jogo (impressões de intersticial/banner, vídeos vistos, ofertas)
 *  - adLog(): com ?debug (ou ?adsdebug) mostra no canto da tela cada decisão de anúncio
 *  - setHostProbe(): o hub informa qual jogo está aberto, se há partida em andamento e se é 3D
 *
 * Estado fica em localStorage 'bw-ads' (separado do save principal para não precisar de migração).
 */
import { AD_BREAKS, AD_REWARDED, AD_STATS } from '../config';
import { save } from '../core/storage';

/* ============================== configuração (local + remota) ============================== */

type Breaks = typeof AD_BREAKS;
type Rewarded = typeof AD_REWARDED;
/** Valores efetivos (padrões de config.ts, sobrescritos pelo servidor quando houver). */
export const breaks: Breaks = { ...AD_BREAKS, exitOnlyGames: [...AD_BREAKS.exitOnlyGames] };
export const rewardedCfg: Rewarded = { ...AD_REWARDED, dailyCaps: { ...AD_REWARDED.dailyCaps }, ownDoubleGames: [...AD_REWARDED.ownDoubleGames] };

const clampNum = (v: unknown, lo: number, hi: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : null;
};

/**
 * Aplica ajustes vindos do servidor (campo `ads` do GET /api/challenges). Só números conhecidos,
 * sempre dentro de faixas seguras (o servidor nunca consegue, por exemplo, tirar o intervalo mínimo).
 */
export function applyRemoteAdConfig(raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const r = raw as Record<string, unknown>;
  const ranges: Partial<Record<keyof Breaks, [number, number]>> = {
    minGapSec: [60, 1800],
    afterRewardedSec: [0, 1800],
    sessionWarmupSec: [60, 3600],
    newPlayerGraceMin: [0, 1440],
    maxPerSession: [0, 30],
    maxPerHour: [0, 20],
    runsBetween: [1, 20],
    freeRunsPerGame: [0, 20],
    freeRunsTotal: [0, 50],
    afterPurchaseMin: [5, 1440],
    exitMinPlaySec: [0, 1800],
  };
  for (const [k, [lo, hi]] of Object.entries(ranges) as [keyof Breaks, [number, number]][]) {
    const v = clampNum(r[k], lo, hi);
    if (v !== null) (breaks as Record<string, unknown>)[k] = v;
  }
  if (Array.isArray(r.exitOnlyGames)) breaks.exitOnlyGames = r.exitOnlyGames.filter((x) => typeof x === 'string').slice(0, 50);
  const caps = r.rewardedDailyCaps;
  if (caps && typeof caps === 'object')
    for (const [k, v] of Object.entries(caps as Record<string, unknown>)) {
      const n = clampNum(v, 0, 50);
      if (n !== null) rewardedCfg.dailyCaps[k] = n;
    }
  const dmin = clampNum(r.doubleMinCoins, 0, 1000);
  const dmax = clampNum(r.doubleMaxCoins, 0, 5000);
  if (dmin !== null) rewardedCfg.doubleMinCoins = dmin;
  if (dmax !== null) rewardedCfg.doubleMaxCoins = dmax;
  if (r.enabled === false) breaks.maxPerSession = 0; // desliga intersticiais (premiados continuam)
  adLog('config remota aplicada', 'info');
}

/* ============================== estado persistido ============================== */

interface DayStats {
  [game: string]: Record<string, number>;
}
interface AdState {
  /** horários (ms) dos intersticiais exibidos (últimas 24 h) */
  shows: number[];
  lastRewardedAt: number;
  /** partidas terminadas por jogo (para as "primeiras partidas grátis") */
  runs: Record<string, number>;
  /** partidas (qualquer jogo) desde o último intersticial */
  runsSinceAd: number;
  /** vídeos premiados por tipo no dia `day` */
  day: number;
  rewarded: Record<string, number>;
  /** estatísticas: dia (AAAA-MM-DD) → jogo → contador */
  stats: Record<string, DayStats>;
  /** último dia enviado ao servidor */
  sentDay?: string;
}

const KEY = 'bw-ads';
const dayNum = (t = Date.now()): number => Math.floor((t - new Date(t).getTimezoneOffset() * 60000) / 86400000);
const dayStr = (t = Date.now()): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load(): AdState {
  const base: AdState = { shows: [], lastRewardedAt: 0, runs: {}, runsSinceAd: 0, day: dayNum(), rewarded: {}, stats: {} };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (raw && typeof raw === 'object') return { ...base, ...raw, shows: Array.isArray(raw.shows) ? raw.shows : [] };
  } catch {
    /* sem storage: só memória */
  }
  return base;
}
const st: AdState = load();
let saveT = 0;
function persistAds(): void {
  clearTimeout(saveT);
  saveT = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(st));
    } catch {
      /* cheio/bloqueado */
    }
  }, 50);
}
function rollDay(): void {
  const d = dayNum();
  if (st.day !== d) {
    st.day = d;
    st.rewarded = {};
  }
}

/* ============================== sessão / contexto ============================== */

/** Início da sessão (carregou o app). */
const sessionStart = Date.now();
let sessionShows = 0;
let lastPurchaseAt = 0;

/** Chamado pelo billing (via ads.notePurchase): nada de intersticial logo depois de alguém pagar. */
export function notePurchaseAt(): void {
  lastPurchaseAt = Date.now();
}

export interface HostProbe {
  /** um minigame do hub está aberto em tela cheia */
  active: boolean;
  game: string | null;
  /** handle.inMatch() — undefined quando o jogo não informa */
  inMatch?: boolean;
  /** cena 3D (three.js) visível — tela de jogo em paisagem */
  is3d: boolean;
  /** "Sair do jogo?" / pausa do hub aberta */
  confirm: boolean;
  /** ms desde que o jogo abriu */
  openMs: number;
}
let probe: (() => HostProbe) | null = null;
/** O hub registra como ler o estado do game host (evita import circular hub ↔ ads). */
export function setHostProbe(fn: () => HostProbe): void {
  probe = fn;
}
export function hostProbe(): HostProbe | null {
  try {
    return probe ? probe() : null;
  } catch {
    return null;
  }
}
/** Jogo "dono" do anúncio para as estatísticas: minigame aberto, senão Orbit/hub. */
export function adGame(): string {
  const p = hostProbe();
  if (p?.active && p.game) return p.game;
  return document.querySelector('#menu.on') ? 'hub' : 'orbit';
}

/* ---------- janela de "tela de resultado" (para banner em jogos sem inMatch) ---------- */
let resultAt = 0;
/** Abre a janela depois de um 'run-end'; fecha no próximo toque do jogador no jogo. */
export function openResultWindow(): void {
  resultAt = Date.now();
}
export function closeResultWindow(): void {
  resultAt = 0;
}
export const resultWindowOpen = (): boolean => resultAt > 0;
export const resultWindowAge = (): number => (resultAt ? Date.now() - resultAt : 0);

/* ============================== intersticial ============================== */

/** Conta uma partida terminada (qualquer jogo, inclusive o Orbit). */
export function noteRun(game: string): void {
  st.runs[game] = (st.runs[game] ?? 0) + 1;
  st.runsSinceAd++;
  persistAds();
}
export const runsOf = (game: string): number => st.runs[game] ?? 0;
export const runsSinceAd = (): number => st.runsSinceAd;

export type BreakReason = 'run-end' | 'exit' | 'orbit' | 'game';
export interface BreakCtx {
  game?: string;
  reason?: BreakReason;
  /** pausa na saída: quanto tempo jogou e se terminou partida nesta visita */
  playedSec?: number;
  runsThisVisit?: number;
}

/** Decide se um intersticial pode aparecer agora. `suppressed` = isenções de compra/tempo sem anúncios. */
export function canInterstitial(ctx: BreakCtx, suppressed: boolean): { ok: boolean; why: string } {
  const now = Date.now();
  const no = (why: string) => ({ ok: false, why });
  if (suppressed) return no('isento (sem anúncios/Clube/passe/tempo livre)');
  if (breaks.maxPerSession <= 0) return no('desligado (config)');
  if (document.querySelector('.ob-root')) return no('tutorial inicial aberto');
  if (now - sessionStart < breaks.sessionWarmupSec * 1000) return no(`início da sessão (${Math.ceil((breaks.sessionWarmupSec * 1000 - (now - sessionStart)) / 1000)}s)`);
  if (save.firstSeen && now - save.firstSeen < breaks.newPlayerGraceMin * 60000) return no('jogador novo');
  if (lastPurchaseAt && now - lastPurchaseAt < breaks.afterPurchaseMin * 60000) return no('logo depois de uma compra');
  const last = Math.max(save.lastInterstitial || 0, st.shows[st.shows.length - 1] ?? 0);
  if (now - last < breaks.minGapSec * 1000) return no(`intervalo (${Math.ceil((breaks.minGapSec * 1000 - (now - last)) / 1000)}s)`);
  if (st.lastRewardedAt && now - st.lastRewardedAt < breaks.afterRewardedSec * 1000) return no('acabou de ver vídeo premiado');
  if (sessionShows >= breaks.maxPerSession) return no('teto da sessão');
  if (st.shows.filter((t) => now - t < 3600000).length >= breaks.maxPerHour) return no('teto por hora');
  const totalRuns = (save.runs || 0) + Object.entries(st.runs).reduce((a, [g, n]) => (g === 'orbit' ? a : a + n), 0);
  if (totalRuns < breaks.freeRunsTotal) return no('primeiras partidas');
  const g = ctx.game;
  if (g && g !== 'orbit' && g !== 'hub' && runsOf(g) < breaks.freeRunsPerGame) return no(`primeiras partidas de ${g}`);
  if (ctx.reason === 'exit') {
    if ((ctx.runsThisVisit ?? 0) < 1 && (ctx.playedSec ?? 0) < breaks.exitMinPlaySec) return no('saiu rápido do jogo');
  } else if (st.runsSinceAd < breaks.runsBetween) return no(`partidas desde o último (${st.runsSinceAd}/${breaks.runsBetween})`);
  return { ok: true, why: '' };
}

export function noteInterstitial(game: string): void {
  const now = Date.now();
  st.shows = [...st.shows.filter((t) => now - t < 86400000), now].slice(-50);
  st.runsSinceAd = 0;
  sessionShows++;
  bump(game, 'interstitial');
}

/* ============================== premiados ============================== */

export function capOf(kind: string): number {
  return rewardedCfg.dailyCaps[kind] ?? rewardedCfg.dailyCaps.default ?? 10;
}
/** Quantos vídeos desse tipo ainda podem ser oferecidos hoje. */
export function rewardedLeft(kind: string): number {
  rollDay();
  return Math.max(0, capOf(kind) - (st.rewarded[kind] ?? 0));
}
export function noteRewarded(game: string, kind: string, completed: boolean): void {
  rollDay();
  if (completed) {
    st.lastRewardedAt = Date.now();
    st.rewarded[kind] = (st.rewarded[kind] ?? 0) + 1;
    bump(game, 'rewarded');
    bump(game, 'rw_' + kind);
  } else bump(game, 'rewarded_skip');
}
export const lastRewardedAt = (): number => st.lastRewardedAt;

/* ============================== estatísticas ============================== */

/** Soma 1 (ou n) no contador `what` do jogo no dia de hoje. */
export function bump(game: string, what: string, n = 1): void {
  const d = dayStr();
  const day = (st.stats[d] ??= {});
  const g = (day[game] ??= {});
  g[what] = (g[what] ?? 0) + n;
  const days = Object.keys(st.stats).sort();
  while (days.length > AD_STATS.keepDays) delete st.stats[days.shift()!];
  persistAds();
}

/** Estatísticas locais (para o painel admin / depuração): dia → jogo → contadores. */
export function adStats(): Record<string, DayStats> {
  return JSON.parse(JSON.stringify(st.stats));
}

/**
 * Envia os dias completos ainda não enviados (opcional: só com AD_STATS.endpoint configurado).
 * `post` é injetado por quem chama (src/services/adbreaks.ts) para não depender do módulo online.
 */
export async function flushAdStats(post: (path: string, body: unknown) => Promise<unknown>, player: string): Promise<void> {
  if (!AD_STATS.endpoint) return;
  const today = dayStr();
  const days = Object.keys(st.stats)
    .filter((d) => d < today && (!st.sentDay || d > st.sentDay))
    .sort();
  if (!days.length) return;
  try {
    await post(AD_STATS.endpoint, { id: player, days: Object.fromEntries(days.map((d) => [d, st.stats[d]])) });
    st.sentDay = days[days.length - 1];
    persistAds();
  } catch {
    /* tenta de novo na próxima sessão */
  }
}

/* ============================== log de depuração (?debug) ============================== */

export const ADS_DEBUG = typeof location !== 'undefined' && /[?&](debug|adsdebug)\b/.test(location.search);
let logEl: HTMLElement | null = null;
const lines: { t: number; msg: string; kind: string }[] = [];

/** Com ?debug: mostra no canto da tela cada decisão de anúncio (o que dispararia e por que não). */
export function adLog(msg: string, kind: 'fire' | 'skip' | 'info' | 'reward' = 'info'): void {
  if (!ADS_DEBUG) return;
  console.info('[ads]', msg);
  lines.push({ t: Date.now(), msg, kind });
  while (lines.length > 7) lines.shift();
  if (!logEl) {
    logEl = document.createElement('div');
    logEl.className = 'ads-dbg';
    logEl.style.cssText =
      'position:fixed;left:6px;top:calc(env(safe-area-inset-top,0px) + 64px);z-index:2147483600;max-width:min(86vw,360px);pointer-events:none;font:600 11px/1.35 ui-monospace,monospace;color:#fff;display:flex;flex-direction:column;gap:2px';
    document.body.appendChild(logEl);
  }
  const col: Record<string, string> = { fire: '#e0398a', skip: '#3a3f5c', info: '#1f6f8b', reward: '#2e8b3a' };
  logEl.innerHTML = lines
    .map((l) => {
      const s = new Date(l.t).toTimeString().slice(0, 8);
      return `<div style="background:${col[l.kind]}e6;padding:3px 6px;border-radius:6px">${s} ${l.msg.replace(/</g, '&lt;')}</div>`;
    })
    .join('');
}

/** ?debug&adsfast: encurta os tempos para testar no navegador (nunca em produção sem ?debug). */
if (ADS_DEBUG && /[?&]adsfast\b/.test(location.search)) {
  Object.assign(breaks, { minGapSec: 25, sessionWarmupSec: 10, newPlayerGraceMin: 0, afterRewardedSec: 15, freeRunsTotal: 0, freeRunsPerGame: 1, runsBetween: 1, exitMinPlaySec: 10 });
}
