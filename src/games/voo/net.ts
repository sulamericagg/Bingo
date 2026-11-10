/* ============================================================
 *  POUSO FORÇADO — gancho para o online (ainda não ligado).
 *  O jogo hoje roda no aparelho (você + ajudantes Bloop). Para co-op
 *  online, uma implementação de VooNet troca o estado de cada jogador
 *  (posição/ação) e o ANFITRIÃO (quem tem o menor id) é o dono da
 *  simulação: ele envia o voo, as emergências e os passageiros; os
 *  outros só mandam a própria entrada. Até 4 jogadores (um por papel).
 * ============================================================ */
import type { Sim } from './sim';

export interface VooPeer {
  id: string;
  name: string;
  skin: string;
  role: number;
  /** estado livre: x, z, yaw, act, hold, seated */
  s: Record<string, number>;
}
export interface VooNet {
  readonly online: boolean;
  readonly isHost: boolean;
  /** envia o estado do jogador local (~10x/s) */
  sendMe(s: Record<string, number>): void;
  /** anfitrião: envia o "retrato" do mundo (~5x/s) */
  sendWorld?(w: unknown): void;
  onPeers(cb: (peers: VooPeer[]) => void): void;
  onWorld?(cb: (w: unknown) => void): void;
  leave(): void;
}

/** sem rede: tudo local */
export class LocalNet implements VooNet {
  readonly online = false;
  readonly isHost = true;
  sendMe(): void {}
  onPeers(): void {}
  leave(): void {}
}

/** estado compacto do jogador local (para quando o online existir) */
export function myState(sim: Sim): Record<string, number> {
  const p = sim.players[sim.me];
  return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100, y: Math.round(p.yaw * 100) / 100, h: p.hold, st: p.seated ? 1 : 0 };
}
