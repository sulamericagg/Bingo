/* ============================================================
 *  TV BLOOP — rede: grade ao vivo, filmes, votos e "Enviar para a TV".
 *  Servidor: /api/tv/* e /api/ugc/* (docs/LOJA-TV.md).
 * ============================================================ */
import { ONLINE } from '../config';
import { apiBase, ensurePlayer } from '../services/leaderboard';
import { TV, type TvAiReject, type TvNow, type TvPayload } from '../../shared/ugc';
import { getLang } from '../i18n';
import type { Project } from './format';
import { getClip } from './store';

export class TvError extends Error {
  constructor(
    public code: string,
    public status = 0,
  ) {
    super(code);
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeout = ONLINE.timeoutMs): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    throw new TvError('offline');
  } finally {
    clearTimeout(timer);
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* */
  }
  if (!res.ok) throw new TvError(data?.error ?? 'http', res.status);
  return data as T;
}

/** Miniatura de um filme de jogador (a do meio das 3 enviadas). */
export const kidThumbUrl = (id: string): string => `${apiBase()}/api/ugc/thumb?id=${encodeURIComponent(id)}&n=1`;

export const myId = async (): Promise<string> => (await ensurePlayer(1500)).id;

/** Grade + diferença do relógio (servidor − aparelho), corrigida pela metade da ida e volta. */
export async function fetchNow(): Promise<{ now: TvNow; offset: number }> {
  const t0 = Date.now();
  const now = await call<TvNow>('GET', '/tv/now');
  const t1 = Date.now();
  return { now, offset: now.now - (t0 + t1) / 2 };
}

export async function fetchFilm(id: string): Promise<{ id: string; title: string; author: string; payload: TvPayload }> {
  return call('GET', `/tv/film?f=${encodeURIComponent(id)}`, undefined, 30_000);
}

export async function vote(film: string): Promise<{ votes: number; voted: boolean }> {
  return call('POST', '/tv/vote', { id: await myId(), film });
}

export async function voted(film: string): Promise<boolean> {
  const pid = await myId();
  if (!pid) return false;
  return (await call<{ voted: boolean }>('GET', `/tv/voted?pid=${encodeURIComponent(pid)}&f=${encodeURIComponent(film)}`)).voted;
}

export async function report(film: string, reason: string): Promise<void> {
  await call('POST', '/ugc/report', { id: await myId(), item: film, reason });
}

export interface MyFilm {
  id: string;
  name: string;
  review?: 'pending' | 'approved' | 'rejected' | 'hidden';
  reviewReason?: string;
  created: number;
  dur?: number;
}

export async function myFilms(): Promise<MyFilm[]> {
  const pid = await myId();
  if (!pid) return [];
  return (await call<{ items: MyFilm[] }>('GET', `/ugc/mine?type=filme&pid=${encodeURIComponent(pid)}`)).items;
}

function blobB64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).replace(/^data:[^,]*,/, ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });
}

export type SubmitError = 'offline' | 'too-big' | 'too-long' | 'name' | 'empty' | 'daily-limit' | 'banned' | 'invalid' | 'rate' | 'ai';

/**
 * Monta o envio (projeto + vozes em base64 + o que o aparelho entendeu de cada voz + 3 fotos) e manda.
 * O servidor transcreve as vozes com a IA e pode recusar na hora (`error: 'ai'`, com as falas a corrigir).
 */
export async function submitFilm(p: Project, thumbs: string[], onProgress?: (k: number) => void): Promise<{ ok: true } | { ok: false; error: SubmitError; ai?: TvAiReject }> {
  const pid = await myId();
  if (!pid) return { ok: false, error: 'offline' };
  const clips: TvPayload['clips'] = {};
  const ids = new Set<string>();
  for (const s of p.scenes) for (const h of s.shots) for (const l of h.lines) if (l.audio) ids.add(l.audio);
  let size = JSON.stringify(p).length + thumbs.reduce((n, x) => n + x.length, 0);
  let i = 0;
  for (const id of ids) {
    const row = await getClip(id).catch(() => null);
    onProgress?.(++i / Math.max(1, ids.size) * 0.5);
    if (!row) continue;
    const b64 = await blobB64(row.blob);
    size += b64.length;
    if (size > TV.maxBytes) return { ok: false, error: 'too-big' };
    clips[id] = { mime: (row.blob.type || 'audio/webm').slice(0, 60), b64, dur: row.dur };
    if (typeof row.tx === 'string') clips[id].tx = row.tx.slice(0, 500);
  }
  try {
    const r = await call<{ ok: boolean; error?: SubmitError; ai?: TvAiReject }>('POST', '/tv/submit', { id: pid, title: p.title, project: p, clips, thumbs, lang: getLang() }, 90_000);
    onProgress?.(1);
    return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'invalid', ai: r.ai };
  } catch (e) {
    const err = e as TvError;
    return { ok: false, error: err.status === 413 ? 'too-big' : err.status === 429 ? 'rate' : err.status === 403 ? 'banned' : 'offline' };
  }
}
