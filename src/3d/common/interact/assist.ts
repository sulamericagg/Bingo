/* ============================================================
 *  AJUDAS DE JOGO (kit de interação 3D): perdoar o jogador.
 *   - Hesitation: dica só se o jogador HESITAR ("ensinar fazendo").
 *   - Rescuer: nada se perde — item que saiu da área ou ficou parado
 *     num lugar inalcançável volta (com "puf").
 *   - solveThrow / magnet: arremesso assistido e "ímã" que puxa o que
 *     voa perto de um lugar que aceita (diversão > precisão).
 *   - Squash: mola de amassar/esticar para dar suco a qualquer objeto.
 * ============================================================ */
import type * as THREE from 'three';
import { Spring } from './controls';

/**
 * Hesitação: o mesmo passo (`key`) há tempo demais → 1 (dica suave) → 2 (dica forte).
 * poke() = o jogador fez algo útil (reinicia o relógio sem trocar de passo).
 */
export class Hesitation {
  private key = '';
  t = 0;
  constructor(
    public soft = 3.5,
    public strong = 7,
  ) {}
  update(key: string, dt: number): 0 | 1 | 2 {
    if (key !== this.key) {
      this.key = key;
      this.t = 0;
    } else this.t += dt;
    if (!key) return 0;
    return this.t >= this.strong ? 2 : this.t >= this.soft ? 1 : 0;
  }
  poke(): void {
    this.t = Math.min(this.t, 0);
  }
}

export interface RescueState {
  /** tempo parado num lugar inalcançável */
  stuck: number;
}
export interface RescueOpts {
  min: [number, number, number];
  max: [number, number, number];
  /** a mão alcança este ponto? */
  reachable: (x: number, y: number, z: number) => boolean;
  /** s parado num lugar inalcançável até voltar */
  wait?: number;
}
/** 'ok' | 'out' (saiu da área: volte já) | 'stuck' (parado onde ninguém alcança) */
export class Rescuer {
  constructor(readonly o: RescueOpts) {}
  check(s: RescueState, x: number, y: number, z: number, speed2: number, dt: number): 'ok' | 'out' | 'stuck' {
    const { min, max } = this.o;
    if (x < min[0] || y < min[1] || z < min[2] || x > max[0] || y > max[1] || z > max[2]) return 'out';
    if (speed2 < 0.05 && !this.o.reachable(x, y, z)) {
      s.stuck += dt;
      if (s.stuck > (this.o.wait ?? 2)) {
        s.stuck = 0;
        return 'stuck';
      }
    } else s.stuck = 0;
    return 'ok';
  }
}

/**
 * Velocidade para ir de `from` até `to` em `tf` segundos sob gravidade `g` (parábola exata).
 */
export function solveThrow(from: THREE.Vector3, to: THREE.Vector3, g: { x: number; y: number; z: number }, tf: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set((to.x - from.x) / tf - 0.5 * g.x * tf, (to.y - from.y) / tf - 0.5 * g.y * tf, (to.z - from.z) / tf - 0.5 * g.z * tf);
}

/** ímã: puxa a velocidade horizontal na direção de (tx,tz). k ~ 1..2 (por segundo) */
export function magnet(pos: { x: number; z: number }, vel: { x: number; z: number }, tx: number, tz: number, k: number, dt: number): void {
  vel.x += (tx - pos.x) * k * 9 * dt;
  vel.z += (tz - pos.z) * k * 9 * dt;
  const damp = Math.max(0, 1 - dt * 6);
  vel.x *= damp;
  vel.z *= damp;
}

/** amassar/esticar: kick() no impacto; sx/sy para a escala */
export class Squash {
  private s = new Spring(320, 9);
  kick(a = 0.35): void {
    this.s.v -= a * 14;
  }
  update(dt: number): void {
    this.s.step(0, dt);
  }
  get sy(): number {
    return 1 + this.s.x;
  }
  get sx(): number {
    return 1 - this.s.x * 0.5;
  }
}
