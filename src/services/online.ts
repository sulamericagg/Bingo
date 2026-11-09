/**
 * Conexão com o servidor online (Cloudflare Worker em server/).
 * Presentes enviados pelo painel admin, códigos promocionais e desafios.
 *
 * Tudo aqui falha em silêncio quando não há internet: o jogo continua offline.
 * Este módulo NÃO tem interface; a UI chama estas funções.
 *
 * IMPORTANTE: claimGifts() e redeemCode() JÁ aplicam a recompensa no save
 * (via applyReward) no momento em que o servidor confirma. Não chame
 * applyReward de novo com o resultado delas — só use o retorno para mostrar
 * a animação/tela de prêmio (o evento bus 'reward' também é emitido).
 */
import { ONLINE } from '../config';
import { addCoins, addGems, unlockSkin, unlockTrail } from '../core/economy';
import { bus } from '../core/events';
import { isAndroid, isNative } from '../core/platform';
import { persistNow, save } from '../core/storage';
import type { Gift, PublicChallenge, RedeemResult, RewardPack } from '../../shared/reward';
import { onNoAdsPurchased } from './ads';

export type { Gift, PublicChallenge, RedeemResult, RewardPack } from '../../shared/reward';

const PLAYER_KEY = 'bo-player';

interface StoredPlayer {
  id: string;
  name: string;
  /** Nome escolhido pelo jogador que ainda não foi enviado ao servidor. */
  pendingName?: string;
}

let player: StoredPlayer | null = readPlayer();
let inbox: Gift[] = [];
let syncing: Promise<Gift[]> | null = null;
/** null = ainda não tentou; true/false = resultado da última requisição. */
let reachable: boolean | null = null;

/** Resultado da última tentativa de falar com o servidor (para a UI mostrar "Sem conexão"). */
export const onlineReachable = (): boolean | null => reachable;
function markReach(ok: boolean): void {
  if (reachable !== ok) {
    reachable = ok;
    bus.emit('online', ok);
  }
}

function readPlayer(): StoredPlayer | null {
  try {
    const raw = localStorage.getItem(PLAYER_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    return p && typeof p.id === 'string' ? p : null;
  } catch {
    return null;
  }
}

function writePlayer(): void {
  try {
    if (player) localStorage.setItem(PLAYER_KEY, JSON.stringify(player));
  } catch {
    /* ignora */
  }
}

function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function ensureLocalPlayer(): StoredPlayer {
  if (!player) {
    player = { id: uuid(), name: '' };
    writePlayer();
  }
  return player;
}

/** Base da API: mesma origem na web; URL configurada no app nativo. */
function apiUrl(path: string): string {
  const base = (ONLINE.apiBase || (isNative ? ONLINE.nativeApiBase : '')).replace(/\/+$/, '');
  return `${base}/api${path}`;
}

const platform = (): string => (isAndroid ? 'android' : isNative ? 'native' : 'web');

async function post<T>(path: string, body: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ONLINE.timeoutMs);
  try {
    const res = await fetch(apiUrl(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as T;
    markReach(true);
    return data;
  } catch (e) {
    markReach(false);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Jogador ---------------- */

/** Jogador local ({ id, name }) ou null se o jogo ainda não chamou initOnline(). */
export function getPlayer(): { id: string; name: string } | null {
  return player ? { id: player.id, name: player.pendingName || player.name } : null;
}

/** Troca o apelido (até 20 caracteres). Envia ao servidor em segundo plano. */
export function setPlayerName(name: string): void {
  const clean = name.replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (!clean) return;
  const p = ensureLocalPlayer();
  p.pendingName = clean;
  writePlayer();
  bus.emit('player', getPlayer());
  syncNow().catch(() => {});
}

/**
 * Registra/sincroniza o jogador em segundo plano. Não bloqueia e nunca lança erro.
 * Emite bus 'inbox' (Gift[]) quando houver presentes pendentes.
 */
export async function initOnline(): Promise<void> {
  const p = ensureLocalPlayer();
  try {
    if (!p.name) {
      const r = await post<{ id: string; name: string }>('/player/register', {
        id: p.id,
        name: p.pendingName,
        platform: platform(),
        version: __APP_VERSION__,
      });
      p.id = r.id;
      p.name = r.name;
      if (p.pendingName === r.name) delete p.pendingName;
      writePlayer();
      bus.emit('player', getPlayer());
    }
    await syncNow();
  } catch {
    /* offline: tenta de novo na próxima abertura */
  }
}

/** Envia estatísticas e busca presentes pendentes. Em caso de erro devolve a última lista conhecida. */
export function syncNow(): Promise<Gift[]> {
  if (syncing) return syncing;
  const p = ensureLocalPlayer();
  syncing = (async () => {
    try {
      const r = await post<{ name: string; inbox: Gift[] }>('/player/sync', {
        id: p.id,
        best: save.best,
        runs: save.runs,
        coins: save.coins,
        gems: save.gems,
        name: p.pendingName,
        platform: platform(),
        version: __APP_VERSION__,
      });
      if (r.name) {
        if (p.pendingName && r.name === p.pendingName) delete p.pendingName;
        if (r.name !== p.name) {
          p.name = r.name;
          bus.emit('player', getPlayer());
        }
        writePlayer();
      }
      inbox = Array.isArray(r.inbox) ? r.inbox : [];
      bus.emit('inbox', inbox);
    } catch {
      /* offline */
    }
    return inbox;
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Presentes pendentes da última sincronização (sem rede). */
export const getInbox = (): Gift[] => inbox;

/**
 * Resgata presentes da caixa de entrada. JÁ APLICA as recompensas no save
 * e devolve os pacotes recebidos (para a UI mostrar). Idempotente no servidor.
 */
export async function claimGifts(ids: string[]): Promise<RewardPack[]> {
  if (!ids.length || !player) return [];
  try {
    const r = await post<{ rewards: RewardPack[]; claimed?: string[] }>('/inbox/claim', { id: player.id, giftIds: ids });
    const rewards = Array.isArray(r.rewards) ? r.rewards : [];
    for (const pack of rewards) applyReward(pack);
    const done = new Set(r.claimed ?? ids);
    inbox = inbox.filter((g) => !done.has(g.id));
    bus.emit('inbox', inbox);
    return rewards;
  } catch {
    return [];
  }
}

/**
 * Resgata um código digitado pelo jogador (maiúsculas/minúsculas, espaços e hífens não importam).
 * Se ok, a recompensa JÁ FOI APLICADA. error: 'invalid' | 'expired' | 'used' | 'limit' | 'network'.
 */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const p = ensureLocalPlayer();
  try {
    const r = await post<RedeemResult>('/redeem', { id: p.id, code, platform: platform(), version: __APP_VERSION__ });
    if (r.ok && r.reward) applyReward(r.reward);
    return r.ok ? { ok: true, reward: r.reward } : { ok: false, error: r.error ?? 'invalid' };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Desafios ativos (vídeos/posts com código). Lista vazia se offline. */
export async function fetchChallenges(): Promise<PublicChallenge[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ONLINE.timeoutMs);
  try {
    const res = await fetch(apiUrl('/challenges'), { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { challenges?: PublicChallenge[] };
    markReach(true);
    return Array.isArray(data.challenges) ? data.challenges : [];
  } catch {
    markReach(false);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------- Recompensas ---------------- */

const int = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Entrega um pacote no save local e emite bus 'reward' (pack). */
export function applyReward(pack: RewardPack): void {
  if (!pack) return;
  if (int(pack.coins)) addCoins(int(pack.coins));
  if (int(pack.gems)) addGems(int(pack.gems));
  for (const id of pack.skins ?? []) unlockSkin(String(id));
  for (const id of pack.trails ?? []) unlockTrail(String(id));
  if (pack.noAds && !save.noAds) {
    save.noAds = true;
    onNoAdsPurchased();
  }
  if (pack.boosts) {
    const b = (save.boosts ??= { shield: 0, magnet: 0, headstart: 0 });
    b.shield = (b.shield ?? 0) + int(pack.boosts.shield);
    b.magnet = (b.magnet ?? 0) + int(pack.boosts.magnet);
    b.headstart = (b.headstart ?? 0) + int(pack.boosts.headstart);
  }
  persistNow();
  bus.emit('wallet');
  bus.emit('reward', pack);
}
