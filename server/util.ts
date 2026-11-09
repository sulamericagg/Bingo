/** Utilitários HTTP e aleatórios do Worker. */

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const MAX_BODY = 512 * 1024;

export async function readJson<T = Record<string, any>>(req: Request): Promise<T> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_BODY) throw new HttpError(413, 'too_large', 'Corpo da requisição muito grande');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', 'Corpo da requisição muito grande');
  if (!text) return {} as T;
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object') throw new Error();
    return v as T;
  } catch {
    throw new HttpError(400, 'bad_json', 'JSON inválido');
  }
}

/* ---------------- Aleatórios ---------------- */

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomString(len: number, alphabet = CODE_ALPHABET): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  // 256 % 31 tem viés mínimo; aceitável para códigos promocionais.
  for (const b of bytes) s += alphabet[b % alphabet.length];
  return s;
}

/** Código aleatório no formato PREFIXO-XXXX-XXXX (ex.: BLP-7KQ2-M9XA). */
export function randomCode(prefix = 'BLP'): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  const body = `${randomString(4)}-${randomString(4)}`;
  return p ? `${p}-${body}` : body;
}

export function randomId(len = 10): string {
  return randomString(len, 'abcdefghijkmnpqrstuvwxyz23456789');
}

export function randomPlayerName(): string {
  const n = new Uint16Array(1);
  crypto.getRandomValues(n);
  return `Bloop#${1000 + (n[0] % 9000)}`;
}

export const PLAYER_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

export function cleanName(v: unknown): string {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20);
}

export function num(v: unknown, max = 1e12): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

/** Data opcional (ms ou string ISO) → ms ou null. */
export function optDate(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(String(v));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ---------------- Base64url / bytes ---------------- */

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

/** Comparação em tempo constante (mesmo tamanho garantido por hash). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
