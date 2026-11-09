/**
 * Ranking global (cliente). Envia a pontuação no fim da partida quando ela pode
 * melhorar o recorde do jogador (geral ou da semana) e busca o placar.
 * Falha em silêncio quando offline; envios pendentes são tentados de novo depois.
 */
import { ONLINE } from '../config';
import { bus } from '../core/events';
import { isNative } from '../core/platform';
import { save } from '../core/storage';
import type { RunResult } from '../game/game';
import { isoWeek, type LbResponse, type LbScope } from '../../shared/leaderboard';
import { getPlayer, initOnline } from './online';

export type { LbResponse, LbRow, LbScope } from '../../shared/leaderboard';

const KEY = 'bo-lb';

interface LbLocal {
  /** maior pontuação já aceita pelo servidor */
  all: number;
  week: number;
  weekKey: string;
  /** envio que falhou (sem rede) */
  pending?: { score: number; duration: number };
}

function readLocal(): LbLocal {
  let v: LbLocal | null = null;
  try {
    v = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    /* ignora */
  }
  const wk = isoWeek();
  if (!v || typeof v.all !== 'number') v = { all: 0, week: 0, weekKey: wk };
  if (v.weekKey !== wk) {
    v.week = 0;
    v.weekKey = wk;
  }
  return v;
}

function writeLocal(v: LbLocal): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* ignora */
  }
}

/** Base da API: mesma origem na web; URL configurada no app nativo. */
export function apiBase(): string {
  return (ONLINE.apiBase || (isNative ? ONLINE.nativeApiBase : '')).replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ONLINE.timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api${path}`, { ...init, signal: ctrl.signal });
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

let ensuring: Promise<void> | null = null;

/** Garante um id de jogador (registra em segundo plano se o jogo ainda não fez isso). */
async function playerId(): Promise<{ id: string; name: string }> {
  let p = getPlayer();
  if (!p || !p.name) {
    ensuring ??= initOnline().finally(() => (ensuring = null));
    if (!p) await ensuring; // sem id local ainda: espera criar
    p = getPlayer();
  }
  return p ?? { id: '', name: '' };
}

/** Nome mostrado no ranking/corrida (antes do registro no servidor: "Bloop#NNNN" derivado do id). */
export function displayName(): string {
  const p = getPlayer();
  if (p?.name) return p.name;
  let h = 0;
  for (const c of p?.id ?? 'bloop') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `Bloop#${1000 + (h % 9000)}`;
}

/** Garante id/nome do jogador, esperando no máximo `ms` pelo registro online. */
export async function ensurePlayer(ms = 1500): Promise<{ id: string; name: string }> {
  await Promise.race([playerId().catch(() => null), new Promise((r) => setTimeout(r, ms))]);
  return { id: getPlayer()?.id ?? '', name: displayName() };
}

/**
 * Envia a pontuação se ela pode entrar no ranking (novo recorde geral ou da semana).
 * `duration` em segundos (tempo jogando) — o servidor rejeita pontuações impossíveis.
 */
export async function submitScore(score: number, duration: number): Promise<void> {
  const local = readLocal();
  if (score <= 0 || (score <= local.all && score <= local.week)) return;
  const p = await playerId();
  if (!p.id) return;
  try {
    const r = await request<{ ok: boolean; best?: { all: number; week: number } }>('/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: p.id, name: p.name || displayName(), score, skin: save.skin, duration: Math.round(duration * 1000) }),
    });
    const now = readLocal();
    if (r.ok && r.best) {
      now.all = Math.max(now.all, r.best.all ?? score);
      now.week = Math.max(now.week, r.best.week ?? score);
    }
    if (now.pending && now.pending.score <= score) delete now.pending;
    writeLocal(now);
    bus.emit('leaderboard-submitted', score);
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status && status >= 400 && status < 500) return; // rejeitado: não tenta de novo
    const now = readLocal();
    if (!now.pending || now.pending.score < score) now.pending = { score, duration };
    writeLocal(now);
  }
}

/** Tenta de novo um envio que ficou pendente (sem rede na hora). */
export function retryPending(): void {
  const { pending } = readLocal();
  if (pending) submitScore(pending.score, pending.duration).catch(() => {});
}

/** Placar (top 100 + posição do jogador). null se offline/servidor indisponível. */
export async function fetchLeaderboard(scope: LbScope): Promise<LbResponse | null> {
  try {
    const me = getPlayer()?.id ?? '';
    return await request<LbResponse>(`/leaderboard?scope=${scope}${me ? `&me=${encodeURIComponent(me)}` : ''}`);
  } catch {
    return null;
  }
}

let inited = false;

/** Liga o envio automático no fim de cada partida normal (o modo corrida não conta). */
export function initLeaderboard(): void {
  if (inited) return;
  inited = true;
  bus.on('gameover', (r: RunResult) => {
    if (r.score > 0) submitScore(r.score, r.duration ?? 0).catch(() => {});
  });
  setTimeout(retryPending, 4000);
}
