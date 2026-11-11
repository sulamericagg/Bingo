/* ============================================================
 *  FPKIT — chão por mapa de altura (terreno, ilha, floresta).
 *  - encaixe no chão SEM tremor: grudado, segue descidas até `stepDown` e subidas até `stepUp`
 *    por quadro sem virar "queda" (nada de cair 1 cm a cada quadro em rampa);
 *  - limite de rampa: subida mais íngreme que `maxSlope` bloqueia (o controlador desliza no outro eixo);
 *  - tolerância: lombadas < `bumpTol` nunca bloqueiam (grama, raízes, emendas de malha).
 *  A suavização VISUAL do olho fica na FpCamera (tuning.eyeSmooth).
 * ============================================================ */

export interface FpGroundOptions {
  /** subida máxima "de graça" por passo (m) — degrau/meio-fio */
  stepUp?: number;
  /** descida máxima que ainda gruda no chão (m); acima disso, cai com gravidade */
  stepDown?: number;
  /** inclinação máxima subível (rad). Padrão 0.8 (~46°) */
  maxSlope?: number;
  /** distância da amostra de inclinação (m) */
  probe?: number;
  /** lombadas menores que isto nunca bloqueiam (m) */
  bumpTol?: number;
}

/** o que o chão precisa saber do corpo */
export interface FpGroundBody {
  y: number;
  vy: number;
  grounded: boolean;
}

export class HeightGround {
  stepUp: number;
  stepDown: number;
  maxSlope: number;
  probe: number;
  bumpTol: number;
  constructor(
    public heightAt: (x: number, z: number) => number,
    o: FpGroundOptions = {},
  ) {
    this.stepUp = o.stepUp ?? 0.35;
    this.stepDown = o.stepDown ?? 0.45;
    this.maxSlope = o.maxSlope ?? 0.8;
    this.probe = o.probe ?? 0.3;
    this.bumpTol = o.bumpTol ?? 0.04;
  }
  /** dá para andar de (fx,fz) até (tx,tz) com os pés em y? */
  canWalk(fx: number, fz: number, tx: number, tz: number, y: number): boolean {
    const h = this.heightAt(tx, tz);
    const dh = h - y;
    if (dh > this.stepUp) return false; // parede/degrau alto
    if (dh <= 0) return true; // plano ou descida
    // subida: olha a inclinação À FRENTE do passo (amostra fixa — não depende do dt, então
    // passinhos lentos não "escalam" rampa íngreme; degrau baixo com chão plano depois passa)
    const dx = tx - fx;
    const dz = tz - fz;
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return true;
    const p = this.probe;
    const rise = this.heightAt(tx + (dx / d) * p, tz + (dz / d) * p) - h;
    if (rise <= this.bumpTol) return true;
    return rise / p <= Math.tan(this.maxSlope);
  }
  /** gravidade + encaixe no chão. Chame depois do movimento horizontal. */
  settle(b: FpGroundBody, dt: number, gravity: number, x: number, z: number): void {
    const h = this.heightAt(x, z);
    if (b.grounded && b.vy <= 0) {
      const dy = b.y - h;
      if (dy <= this.stepDown && -dy <= this.stepUp) {
        b.y = h;
        b.vy = 0;
        return;
      }
      b.grounded = false;
    }
    b.vy -= gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= h) {
      b.y = h;
      b.vy = 0;
      b.grounded = true;
    }
  }
}
