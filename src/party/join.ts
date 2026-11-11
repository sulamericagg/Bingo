/**
 * ENTRAR NA SALA DE UM AMIGO SEM CÓDIGO (leve, pacote principal).
 *  - Quem abre uma sala (voo, noites, garimpo, mundo, duelo) avisa os amigos: reportPlaying(jogo, código)
 *    → os amigos veem "Fulano está jogando — Entrar" (FriendInfo.playing = "<jogo>.<CÓDIGO>").
 *  - openJoin("<jogo>.<CÓDIGO>") abre o jogo já entrando na sala (o jogo usa partySeat(...).code()).
 *  - Convite de amigo para a sala: friends invite kind 'game', game = "j-<jogo>-<código>" (minúsculas).
 */
import { partyLaunch } from './contract';

export interface JoinRef {
  game: string;
  code: string;
  /** duelo: jogo do duelo */
  duel?: string;
}
const RE = /^([a-z]{2,12})\.(?:([a-z]{2,12})\.)?([A-Z0-9]{5,6})$/;
export function parseJoin(j: string | undefined): JoinRef | null {
  const m = RE.exec(j ?? '');
  if (!m) return null;
  return m[1] === 'duel' && m[2] ? { game: m[2], code: m[3], duel: m[2] } : m[2] ? null : { game: m[1], code: m[3] };
}
export const joinStr = (game: string, code: string, duel = false): string => (duel ? `duel.${game}.${code}` : `${game}.${code}`);
/** convite: "j-voo-k7q2m" / "j-duel-cor-k7q2m" */
export const joinInvite = (j: string): string => 'j-' + j.replace(/\./g, '-').toLowerCase();
export function parseJoinInvite(g: string | undefined): JoinRef | null {
  const m = /^j-([a-z]{2,12})-(?:([a-z]{2,12})-)?([a-z0-9]{5,6})$/.exec(g ?? '');
  if (!m) return null;
  return parseJoin(m[2] ? `${m[1]}.${m[2]}.${m[3].toUpperCase()}` : `${m[1]}.${m[3].toUpperCase()}`);
}

/** Abre o jogo já entrando na sala do amigo. */
export async function openJoin(r: JoinRef): Promise<boolean> {
  if (r.duel) {
    const d = await import('./duel-link');
    return d.openDuel(r.duel, r.code);
  }
  const [reg, hub] = await Promise.all([import('../hub/registry'), import('../hub/hub')]);
  const def = reg.listGames().find((g) => g.id === r.game);
  if (!def) return false;
  hub.closeHost();
  partyLaunch(r.game, 'join-' + r.code.toLowerCase(), { host: false, n: 2, code: r.code });
  await new Promise((res) => setTimeout(res, 60));
  await hub.launchGame(def);
  return true;
}

/* ---------- "estou jogando numa sala aberta" (os amigos veem Entrar) ---------- */
let cur = '';
let timer = 0;
async function post(j: string): Promise<void> {
  try {
    const { api, me } = await import('../social/net');
    const p = await me();
    if (p.id) await api('/friends/playing', { id: p.id, j });
  } catch {
    /* offline */
  }
}
export function reportPlaying(game: string, code: string, duel = false): void {
  const j = joinStr(game, code, duel);
  if (j === cur) return;
  cur = j;
  clearInterval(timer);
  void post(j);
  timer = window.setInterval(() => void post(cur), 45_000);
}
export function stopPlaying(): void {
  if (!cur) return;
  cur = '';
  clearInterval(timer);
  void post('');
}
