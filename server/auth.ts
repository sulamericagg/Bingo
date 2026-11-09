/**
 * Autenticação do painel admin.
 * Senha = segredo ADMIN_PASSWORD. O login troca a senha por um token de sessão
 * assinado com HMAC-SHA256 (chave derivada da senha) que expira em SESSION_HOURS.
 * Trocar a senha invalida todas as sessões.
 */
import { b64url, fromB64url, HttpError, json, readJson, sha256, timingSafeEqual } from './util';

const SESSION_HOURS = 72;
const MAX_FAILS = 8;
const FAIL_WINDOW_S = 15 * 60;

async function hmacKey(password: string): Promise<CryptoKey> {
  const raw = await sha256('bloop-orbit/admin-session/v1:' + password);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function requirePassword(env: Env): string {
  const pw = env.ADMIN_PASSWORD;
  if (!pw) throw new HttpError(503, 'no_password', 'O segredo ADMIN_PASSWORD ainda não foi configurado na Cloudflare.');
  return pw;
}

export async function createToken(password: string, now = Date.now()): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + SESSION_HOURS * 3600_000;
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ iat: now, exp: expiresAt, n: crypto.randomUUID() })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(password), new TextEncoder().encode(payload));
  return { token: `${payload}.${b64url(sig)}`, expiresAt };
}

export async function verifyToken(password: string, token: string): Promise<boolean> {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return false;
  let sigBytes: Uint8Array;
  try {
    sigBytes = fromB64url(sig);
  } catch {
    return false;
  }
  // verify() do WebCrypto já compara em tempo constante.
  const ok = await crypto.subtle.verify('HMAC', await hmacKey(password), sigBytes, new TextEncoder().encode(payload));
  if (!ok) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return typeof data.exp === 'number' && data.exp > Date.now();
  } catch {
    return false;
  }
}

/** Lança 401 se a requisição não tiver um token válido. */
export async function requireAdmin(req: Request, env: Env): Promise<void> {
  const pw = requirePassword(env);
  const h = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m || !(await verifyToken(pw, m[1].trim()))) throw new HttpError(401, 'unauthorized', 'Sessão expirada. Entre novamente.');
}

export async function handleLogin(req: Request, env: Env): Promise<Response> {
  const pw = requirePassword(env);
  const ip = req.headers.get('cf-connecting-ip') ?? 'local';
  const rlKey = 'rl:login:' + ip;
  const fails = Number((await env.DATA.get(rlKey)) ?? 0);
  if (fails >= MAX_FAILS) {
    return json({ error: 'rate_limited', message: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, 429);
  }
  const body = await readJson<{ password?: string }>(req);
  const given = String(body.password ?? '');
  const ok = timingSafeEqual(await sha256(given), await sha256(pw));
  if (!ok) {
    await env.DATA.put(rlKey, String(fails + 1), { expirationTtl: FAIL_WINDOW_S });
    return json({ error: 'wrong_password', message: 'Senha incorreta.' }, 401);
  }
  if (fails) await env.DATA.delete(rlKey);
  return json(await createToken(pw));
}
