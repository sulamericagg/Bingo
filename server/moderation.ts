/**
 * Filtro de chat (kid-safe) — a lógica pura vive em shared/moderation.ts (o app usa a mesma regra offline).
 * Aqui ficam só as partes que dependem do KV.
 */
export * from '../shared/moderation';

/* ---------------- KV: banidos / silenciados / palavras extras ---------------- */

export const KV_WORDS = 'chat:words';
export const banKey = (pid: string) => 'chatban:' + pid;
export const muteKey = (pid: string) => 'chatmute:' + pid;

export async function loadExtraWords(env: Env): Promise<string[]> {
  try {
    const v = await env.DATA.get(KV_WORDS, 'json');
    return Array.isArray(v) ? (v as unknown[]).map(String).slice(0, 500) : [];
  } catch {
    return [];
  }
}

