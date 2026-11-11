/**
 * CONTRATO "JOGAR JUNTO" DO GRUPO (docs/PARTY.md) — leve, sem dependências pesadas.
 *
 * Quando o líder do grupo aperta JOGAR, todos recebem { game, room }. Para entrar na MESMA sala:
 *   - jogos com presença (services/presence.ts): automático — joinPresence(gameId) usa partyRoomFor(gameId)
 *     e conecta em /api/presence/<gameId>?party=<room> (sala só do grupo, sem lobby).
 *   - Corrida Orbital: automático (services/multiplayer.ts usa partyRoomFor('race')).
 *   - jogo com sala própria (voo, noites, garimpo, mundo aberto): registerPartyGame('meu-jogo') no register.ts
 *     e, ao abrir, `partySeat('meu-jogo')` → { room, code(n), host, leader } — o líder cria a sala com o
 *     código derivado da sala do grupo e os outros entram nela (tentando de novo até o líder abrir).
 *   - jogo sem online próprio: DUELO (src/party/duel.ts) — registerDuelGame('meu-jogo') e, ao abrir,
 *     takeDuel('meu-jogo') diz se é para começar um duelo (grupo, link ou botão "Duelo").
 * "Esse jogo ainda é solo" só aparece para jogos que não se registraram (hoje: os que estão em obra).
 */
import { bus } from '../core/events';

export interface PartyGame {
  /** entrar na sala `room` do grupo (abrir o jogo e conectar). Se ausente, o grupo só abre o jogo pelo hub. */
  join?(room: string): void | Promise<void>;
  /** como o grupo joga junto (só para o relatório/ajuda): 'room' sala própria · 'presence' · 'duel' · 'together' */
  mode?: 'room' | 'presence' | 'duel' | 'together';
}

/** Jogos que já usam presença (services/presence.ts): entram na sala do grupo sozinhos. */
export const PRESENCE_GAMES = ['disaster', 'band', 'floresta', 'cozinha', 'rally', 'tycoon'];
/** Jogos de criar/explorar sem placar: o grupo abre junto com a faixa "juntos" (src/party/together.ts). */
export const TOGETHER_GAMES = ['caca', 'studio', 'cinema'];
/** Jogos que outro time está terminando (ainda solo no grupo). */
export const PARTY_WIP = ['cavafala', 'anomalias'];

const games = new Map<string, PartyGame>();
interface Cur {
  game: string;
  room: string;
  at: number;
  /** eu sou o líder (quem apertou JOGAR) */
  host: boolean;
  /** id do líder */
  leader: string;
  /** quantos do grupo estavam online quando o líder apertou JOGAR */
  n: number;
}
let cur: Cur | null = null;
const ROOM_TTL = 30 * 60_000;

/** Um jogo declara que sabe jogar com o grupo. */
export function registerPartyGame(gameId: string, g: PartyGame = {}): void {
  games.set(gameId, g);
}
export function partyGame(gameId: string): PartyGame | null {
  return games.get(gameId) ?? (PRESENCE_GAMES.includes(gameId) ? { mode: 'presence' } : null);
}
export const partyGameSupported = (gameId: string): boolean => !!partyGame(gameId);

/** Entra na sala `roomId` do grupo para o jogo `gameId` (chamado pelo grupo; jogos podem chamar também). */
export function partyLaunch(gameId: string, roomId: string, o: { host?: boolean; leader?: string; n?: number } = {}): void {
  cur = { game: gameId, room: roomId, at: Date.now(), host: !!o.host, leader: o.leader ?? '', n: Math.max(1, o.n ?? 2) };
  bus.emit('party-launch', { game: gameId, room: roomId });
}

/** Sala do grupo para este jogo (aceita variações "cozinha-123" de "cozinha"), ou null se jogando sozinho. */
export function partyRoomFor(gameId: string): string | null {
  if (!cur || Date.now() - cur.at > ROOM_TTL) return null;
  return gameId === cur.game || gameId.startsWith(cur.game + '-') ? cur.room : null;
}

/** Código curto e estável derivado da sala do grupo (mesmo para todos do grupo). */
export function partyCode(room: string, len = 5, alpha = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1234567;
  for (let i = 0; i < room.length; i++) {
    h1 = Math.imul(h1 ^ room.charCodeAt(i), 16777619) >>> 0;
    h2 = Math.imul(h2 ^ room.charCodeAt(i), 2246822519) >>> 0;
  }
  let out = '';
  for (let i = 0; i < len; i++) {
    const v = i % 2 ? h2 : h1;
    out += alpha[(v >>> ((i * 5) % 27)) % alpha.length];
    if (i % 2) h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489917) >>> 0;
    else h1 = Math.imul(h1 ^ (h1 >>> 15), 2654435761) >>> 0;
  }
  return out;
}

export interface PartySeat {
  room: string;
  /** sou o anfitrião (o líder do grupo) */
  host: boolean;
  /** id do líder */
  leader: string;
  /** quantos do grupo devem chegar */
  n: number;
  /** o líder apertou JOGAR há pouco (≤ 20 s) */
  fresh: boolean;
  /** código curto derivado da sala (tamanho/alfabeto do jogo) */
  code(len?: number, alpha?: string): string;
}
/** Lugar no jogo que o grupo abriu: quem é o anfitrião, qual o código. null = não veio do grupo. */
export function partySeat(gameId: string): PartySeat | null {
  const room = partyRoomFor(gameId);
  if (!room || !cur) return null;
  const c = cur;
  return { room, host: c.host, leader: c.leader, n: c.n, fresh: Date.now() - c.at < 20_000, code: (len, alpha) => partyCode(room, len, alpha) };
}
/** O jogo já usou a sala do grupo (sair e abrir de novo sozinho não deve voltar para ela). */
export function consumePartySeat(gameId: string): void {
  if (cur && partyRoomFor(gameId)) cur = null;
}
export function clearPartyRoom(): void {
  cur = null;
}
