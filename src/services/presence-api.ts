/**
 * CONTRATO DO "ONLINE OPCIONAL" (estilo: você joga sozinho e, do nada, outro jogador
 * aparece na sua partida como fantasma). Implementação real: src/services/presence.ts
 * (agente social). Jogos usam só esta interface; sem internet, `joinPresence` devolve
 * uma sessão vazia (ou com bots, se o jogo pedir).
 */
export interface PeerState {
  id: string;
  name: string;
  skin: string; // id de skin ou 'custom'
  avatar?: unknown; // config do personagem personalizado, se houver
  /** estado livre definido pelo jogo, ex.: { x, y, angle, dist } */
  s: Record<string, number>;
  emote?: string; // atalho rápido exibido sobre a cabeça (ver social)
  bot?: boolean;
}

export interface PresenceSession {
  /** envie seu estado ~5x/s */
  send(s: Record<string, number>): void;
  /** atalho rápido ('joinha', 'vamos', 'uau', ...) */
  emote(code: string): void;
  onPeers(cb: (peers: PeerState[]) => void): void;
  leave(): void;
  readonly online: boolean;
}

export type JoinPresence = (gameId: string, opts?: { botsIfAlone?: number; seed?: number }) => Promise<PresenceSession>;
