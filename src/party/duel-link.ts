/**
 * DUELO — parte LEVE (entra no pacote principal): registro dos jogos com duelo, pedidos pendentes
 * (grupo, link/QR bloopworld://duelo/<jogo>/<CÓDIGO>, convite de amigo) e o código do duelo.
 * A interface e a rede ficam em ./duel.ts (carregado junto com o jogo).
 */
import { consumePartySeat, partySeat, registerPartyGame } from './contract';

/** ícone "amigos" (dois Bloops) — usado no hub, no grupo e nos menus de duelo */
export const FRIENDS_SVG = `<svg viewBox="0 0 32 24" width="1.4em" height="1.05em" aria-hidden="true"><circle cx="11" cy="8" r="5" fill="currentColor"/><path d="M1 23c0-6 4.5-9 10-9s10 3 10 9z" fill="currentColor"/><circle cx="23" cy="7" r="4" fill="currentColor" opacity=".75"/><path d="M19 13.5c1.2-.4 2.5-.5 4-.5 4.6 0 8 2.6 8 8h-8.5c-.3-3-1.6-5.7-3.5-7.5z" fill="currentColor" opacity=".75"/></svg>`;

export const DUEL_ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DUEL_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
export const DUEL_GAME_RE = /^[a-z]{2,12}$/;
export const newDuelCode = (): string => Array.from({ length: 5 }, () => DUEL_ALPHA[Math.floor(Math.random() * DUEL_ALPHA.length)]).join('');

/** Jogos com duelo (para o hub/grupo e para validar links). */
export const DUEL_GAMES = new Set<string>();

export interface DuelEntry {
  game: string;
  code: string;
  /** cria a sala (anfitrião) — senão só entra */
  create: boolean;
  /** veio do grupo: o anfitrião começa sozinho quando todos chegarem */
  party: boolean;
  /** quantos o grupo espera */
  n: number;
}

/** Um jogo solo se declara "joga em duelo": o grupo leva todo mundo para o mesmo duelo. */
export function registerDuelGame(game: string): void {
  DUEL_GAMES.add(game);
  registerPartyGame(game, { mode: 'duel' });
}

let pending: DuelEntry | null = null;
/** Link/QR/convite: o jogo abre já entrando no duelo `code`. */
export function setPendingDuel(game: string, code: string): void {
  pending = { game, code, create: false, party: false, n: 2 };
}
/** O jogo abriu: deve começar um duelo? (link/convite ou o grupo). Consome o pedido. */
export function takeDuel(game: string): DuelEntry | null {
  if (pending && pending.game === game) {
    const p = pending;
    pending = null;
    return p;
  }
  const seat = partySeat(game);
  if (seat) {
    consumePartySeat(game);
    return { game, code: seat.code(5, DUEL_ALPHA), create: seat.host, party: true, n: seat.n };
  }
  return null;
}
/** Botão "Duelo" no menu do jogo: sala nova (eu sou o anfitrião). */
export const freshDuel = (game: string): DuelEntry => ({ game, code: newDuelCode(), create: true, party: false, n: 2 });

/** "cor/K7Q2M" ou "cor.K7Q2M" → { game, code } */
export function parseDuelCode(v: string): { game: string; code: string } | null {
  const m = /^([a-z]{2,12})[/.\-]([A-Za-z2-9]{5})$/.exec(v.trim());
  if (!m) return null;
  const code = m[2].toUpperCase();
  return DUEL_CODE_RE.test(code) ? { game: m[1], code } : null;
}
/** Convite de amigo (servidor aceita só [a-z0-9-]): "duel-cor-k7q2m" */
export const duelInviteGame = (game: string, code: string): string => `duel-${game}-${code.toLowerCase()}`;
export function parseDuelInvite(g: string | undefined): { game: string; code: string } | null {
  const m = /^duel-([a-z]{2,12})-([a-z2-9]{5})$/.exec(g ?? '');
  return m ? parseDuelCode(`${m[1]}/${m[2]}`) : null;
}

/** Abre o jogo `game` direto no duelo `code` (link/QR/convite). */
export async function openDuel(game: string, code: string): Promise<boolean> {
  const [reg, hub] = await Promise.all([import('../hub/registry'), import('../hub/hub')]);
  const def = reg.listGames().find((g) => g.id === game);
  if (!def) return false;
  setPendingDuel(game, code);
  hub.closeHost();
  await new Promise((r) => setTimeout(r, 60));
  await hub.launchGame(def);
  return true;
}
