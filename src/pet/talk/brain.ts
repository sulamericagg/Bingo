/* ============================================================
 *  CÉREBRO da conversa: tenta a IA do servidor (POST /api/ai/pet) e,
 *  se não der (offline, sem chave, erro, limite do dia), usa o bot local.
 *
 *  Limite do app: 20 respostas de IA por dia grátis, +20 por vídeo premiado,
 *  ilimitado para Pro (Clube Bloop ou passe premium). O bot local é sempre grátis.
 *  Só TEXTO sai do aparelho (sem áudio, sem nome real) — ver docs/IA.md.
 * ============================================================ */
import { dayNumber } from '../../core/storage';
import { getLang } from '../../i18n';
import { clubActive, passPremiumActive } from '../../services/ads';
import { apiBase } from '../../services/leaderboard';
import { me } from '../../social/net';
import { localReply } from './bot';
import { PET_ACTIONS, PET_EMOTIONS, type PetSnapshot, type TalkReply, type TalkTurn } from './types';

export const AI_FREE_PER_DAY = 20;
export const AI_AD_BONUS = 20;
const KEY = 'bo.petTalk';

interface Prefs {
  voice: string;
  day: number;
  used: number;
  bonus: number;
  transcript: boolean;
  /** IA desligada pelo jogador (só bot local) */
  aiOff: boolean;
  /** já viu a explicação (privacidade) */
  intro: boolean;
}

function load(): Prefs {
  const d: Prefs = { voice: 'fofinho', day: dayNumber(), used: 0, bonus: 0, transcript: false, aiOff: false, intro: false };
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') Object.assign(d, v);
  } catch {
    /* sem armazenamento: usa o padrão */
  }
  if (d.day !== dayNumber()) {
    d.day = dayNumber();
    d.used = 0;
    d.bonus = 0;
  }
  return d;
}
let prefs = load();
function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* ok */
  }
}
export function talkPrefs(): Readonly<Prefs> {
  if (prefs.day !== dayNumber()) prefs = load();
  return prefs;
}
export function setTalkPref<K extends keyof Prefs>(k: K, v: Prefs[K]): void {
  prefs[k] = v;
  store();
}

export const isPro = (): boolean => clubActive() || passPremiumActive();

/** Respostas de IA que ainda restam hoje (Infinity para Pro). */
export function aiLeft(): number {
  if (isPro()) return Infinity;
  const p = talkPrefs();
  return Math.max(0, AI_FREE_PER_DAY + p.bonus - p.used);
}
export function addAiBonus(): void {
  talkPrefs();
  prefs.bonus += AI_AD_BONUS;
  store();
}

/* ------------------------------ servidor ------------------------------ */

/** Sem chave/IA no servidor: não tenta de novo por um tempo. */
let aiDownUntil = 0;
let pidCache: string | null = null;

async function playerId(): Promise<string> {
  if (pidCache !== null) return pidCache;
  const r = await Promise.race([me().catch(() => null), new Promise<null>((res) => setTimeout(() => res(null), 1500))]);
  pidCache = r?.id ?? '';
  return pidCache;
}

async function askServer(text: string, snap: PetSnapshot, history: TalkTurn[]): Promise<TalkReply | 'down' | 'rate'> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${apiBase()}/api/ai/pet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        pid: await playerId(),
        lang: getLang(),
        text,
        pet: { name: snap.name, food: snap.food, clean: snap.clean, fun: snap.fun, energy: snap.energy, level: snap.level, sleeping: snap.sleeping },
        history: history.slice(-8),
      }),
    });
    if (res.status === 429) return 'rate';
    if (!res.ok) {
      aiDownUntil = Date.now() + (res.status === 503 || res.status === 404 ? 10 * 60000 : 60000);
      return 'down';
    }
    const j = (await res.json()) as Partial<TalkReply>;
    if (typeof j.reply !== 'string' || !j.reply.trim()) return 'down';
    return {
      reply: j.reply.slice(0, 240),
      emotion: (PET_EMOTIONS as readonly string[]).includes(String(j.emotion)) ? (j.emotion as TalkReply['emotion']) : 'happy',
      action: (PET_ACTIONS as readonly string[]).includes(String(j.action)) ? (j.action as TalkReply['action']) : undefined,
      source: j.source === 'safety' ? 'safety' : 'ai',
    };
  } catch {
    aiDownUntil = Date.now() + 60000;
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

export interface AskResult extends TalkReply {
  /** o limite grátis de hoje acabou (resposta veio do bot local) → oferecer vídeo */
  capped?: boolean;
}

/** Pergunta ao bichinho. Nunca falha: no pior caso responde o bot local. */
export async function ask(text: string, snap: PetSnapshot, history: TalkTurn[]): Promise<AskResult> {
  const p = talkPrefs();
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  if (!p.aiOff && online && Date.now() >= aiDownUntil) {
    if (aiLeft() <= 0) return { ...localReply(text, snap, getLang(), history), capped: true };
    const r = await askServer(text, snap, history);
    if (r !== 'down' && r !== 'rate') {
      if (r.source === 'ai') {
        prefs.used++;
        store();
      }
      return r;
    }
  }
  return localReply(text, snap, getLang(), history);
}

/** Para testes/diagnóstico. */
export function resetAiDown(): void {
  aiDownUntil = 0;
}
