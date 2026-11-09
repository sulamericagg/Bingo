/**
 * Regras do @nome (handle) — compartilhadas entre o servidor (fonte da verdade) e o app
 * (validação na hora, inclusive offline). O servidor ainda confere a lista extra do KV.
 */
import { buildExtra, filterMessage, hasPersonalInfo, type Extra } from './moderation';

export const HANDLE_RE = /^[a-z0-9][a-z0-9_.]{1,14}[a-z0-9_]$/;
export const HANDLE_MIN = 3;
export const HANDLE_MAX = 16;

const RESERVED = new Set(
  'admin administrador adm root system sistema suporte support ajuda help staff equipe team oficial official moderador moderator mod mods bloop bloopworld bloop_world teamross team_ross ross null undefined anonimo anonymous everyone here todos bot robo claude cloudflare'.split(
    ' ',
  ),
);
const RESERVED_PREFIX = ['admin', 'mod_', 'moder', 'staff', 'suporte', 'support', 'oficial', 'official', 'teamross', 'team_ross', 'bloop_oficial', 'bloopworld'];
/* redes sociais / contato, como pedaço do nome (o filtro de chat só pega palavra inteira) */
const CONTACT_PARTS = ['insta', 'whats', 'wpp', 'zapzap', 'tiktok', 'snapchat', 'discord', 'telegram', 'gmail', 'hotmail', 'outlook', 'youtube', 'twitch', 'kwai', 'facebook', 'celular', 'telefone', 'email', 'roblox', 'twitter'];

export const normalizeHandle = (s: string): string => s.trim().replace(/^@+/, '').toLowerCase();

/** Valida formato + palavras reservadas + moderação (sem rede). null = ok. */
export function handleRuleProblem(h: string, extra?: Extra): 'invalid' | 'blocked' | null {
  if (!HANDLE_RE.test(h) || h.includes('..')) return 'invalid';
  if (RESERVED.has(h) || RESERVED.has(h.replace(/[_.\d]/g, '')) || RESERVED_PREFIX.some((p) => h.startsWith(p))) return 'blocked';
  if ((h.match(/\d/g) ?? []).length >= 6) return 'blocked'; // parece telefone/documento
  if (CONTACT_PARTS.some((p) => h.includes(p))) return 'blocked';
  if (hasPersonalInfo(h)) return 'blocked';
  const ex = extra ?? buildExtra([]);
  const variants = [h.replace(/[_.]/g, ' '), h.replace(/[_.\d]/g, ' '), h.replace(/[_.]/g, ''), h.replace(/[_.\d]/g, '')];
  for (const v of variants) {
    if (!v.trim()) continue;
    if (hasPersonalInfo(v)) return 'blocked';
    const r = filterMessage(v, ex);
    if (!r.ok || r.filtered) return 'blocked';
  }
  return null;
}

/** Apelido (nome exibido): 2–20 letras, sem palavrão/dado pessoal. null = ok. */
export function nickProblem(name: string, extra?: Extra): 'short' | 'long' | 'pii' | 'bad' | null {
  const clean = name.replace(/\s+/g, ' ').trim();
  if ([...clean].length < 2) return 'short';
  if ([...clean].length > 20) return 'long';
  if (hasPersonalInfo(clean)) return 'pii';
  const r = filterMessage(clean, extra);
  if (!r.ok) return r.reason === 'pii' ? 'pii' : 'bad';
  if (r.filtered) return 'bad';
  return null;
}
