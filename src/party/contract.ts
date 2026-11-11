/**
 * CONTRATO "JOGAR JUNTO" DO GRUPO (docs/PARTY.md) — leve, sem dependências pesadas.
 *
 * Quando o líder do grupo aperta JOGAR, todos recebem { game, room }. Para entrar na MESMA sala:
 *   - jogos com presença (services/presence.ts): automático — joinPresence(gameId) usa partyRoomFor(gameId)
 *     e conecta em /api/presence/<gameId>?party=<room> (sala só do grupo, sem lobby).
 *   - Corrida Orbital: automático (services/multiplayer.ts usa partyRoomFor('race')).
 *   - outro jogo com online próprio: registerPartyGame('meu-jogo', { join(room) { ... } }) e/ou
 *     ler partyRoomFor('meu-jogo') ao conectar; ouvir bus 'party-launch' ({ game, room }).
 * Jogos sem online: os membros veem "Esse jogo ainda é solo".
 */
import { bus } from '../core/events';

export interface PartyGame {
  /** entrar na sala `room` do grupo (abrir o jogo e conectar). Se ausente, o grupo só abre o jogo pelo hub. */
  join?(room: string): void | Promise<void>;
}

/** Jogos que já usam presença (services/presence.ts): entram na sala do grupo sozinhos. */
export const PRESENCE_GAMES = ['disaster', 'band', 'floresta', 'cozinha', 'rally', 'tycoon'];

const games = new Map<string, PartyGame>();
let cur: { game: string; room: string; at: number } | null = null;
const ROOM_TTL = 30 * 60_000;

/** Um jogo declara que sabe jogar com o grupo. */
export function registerPartyGame(gameId: string, g: PartyGame = {}): void {
  games.set(gameId, g);
}
export function partyGame(gameId: string): PartyGame | null {
  return games.get(gameId) ?? (PRESENCE_GAMES.includes(gameId) ? {} : null);
}
export const partyGameSupported = (gameId: string): boolean => !!partyGame(gameId);

/** Entra na sala `roomId` do grupo para o jogo `gameId` (chamado pelo grupo; jogos podem chamar também). */
export function partyLaunch(gameId: string, roomId: string): void {
  cur = { game: gameId, room: roomId, at: Date.now() };
  bus.emit('party-launch', { game: gameId, room: roomId });
}

/** Sala do grupo para este jogo (aceita variações "cozinha-123" de "cozinha"), ou null se jogando sozinho. */
export function partyRoomFor(gameId: string): string | null {
  if (!cur || Date.now() - cur.at > ROOM_TTL) return null;
  return gameId === cur.game || gameId.startsWith(cur.game + '-') ? cur.room : null;
}
export function clearPartyRoom(): void {
  cur = null;
}
