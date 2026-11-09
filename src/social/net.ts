/**
 * Rede do social: base da API/WebSocket e identidade do jogador.
 * Reaproveita o jogador do ranking/online (src/services/online.ts) — nunca cria outro id.
 */
import { ONLINE } from '../config';
import { save } from '../core/storage';
import { apiBase, displayName, ensurePlayer } from '../services/leaderboard';

export { apiBase };

export function wsUrl(path: string): string {
  const base = apiBase() || location.origin;
  return base.replace(/^http/, 'ws') + '/api' + path;
}

export async function me(): Promise<{ id: string; name: string; skin: string; avatar?: unknown }> {
  const p = await ensurePlayer(1500);
  return { id: p.id, name: p.name || displayName(), skin: save.skin, ...(save.skin === 'custom' ? { avatar: save.avatar } : {}) };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** fetch JSON com timeout; lança ApiError com a mensagem do servidor. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ONLINE.timeoutMs);
  try {
    const res = await fetch(`${apiBase()}/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* */
    }
    if (!res.ok) throw new ApiError(res.status, data?.error ?? 'http', data?.message ?? `HTTP ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'offline', 'offline');
  } finally {
    clearTimeout(timer);
  }
}
