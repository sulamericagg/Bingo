/* ============================================================
 *  MUNDO — trilhos e vagonetes para a mineração.
 *  Trilhos são peças na grade de 2 m (retos; viram sozinhos nas
 *  esquinas porque o vagonete procura o próximo trilho à frente,
 *  à esquerda ou à direita). Trilho turbo empurra até 14 m/s.
 *  Subidas/descidas: o vagonete interpola a altura entre trilhos.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { geoms as G, mat4, mergeParts } from '../fps/models';
import type { Entity, MundoAPI } from './engine';
import type { Sandbox } from './survival';
import { PDEFS, type Piece } from './build';

let GEO: THREE.BufferGeometry | null = null;
function cartGeo(): THREE.BufferGeometry {
  if (GEO) return GEO;
  const B = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) => ({ g: G.box, c, m: mat4(x, y, z, sx, sy, sz) });
  const W = (x: number, z: number) => ({ g: G.cyl, c: '#3a3a4a', m: mat4(x, 0.22, z, 0.2, 0.12, 0.2, 0, 0, Math.PI / 2) });
  GEO = mergeParts([B(0, 0.45, 0, 1.1, 0.12, 1.5, '#5a5668'), B(-0.55, 0.75, 0, 0.1, 0.6, 1.5, '#8a8696'), B(0.55, 0.75, 0, 0.1, 0.6, 1.5, '#8a8696'), B(0, 0.75, -0.75, 1.2, 0.6, 0.1, '#8a8696'), B(0, 0.75, 0.75, 1.2, 0.6, 0.1, '#8a8696'), B(0, 1.06, -0.75, 1.24, 0.08, 0.14, '#ffd34a'), B(0, 1.06, 0.75, 1.24, 0.08, 0.14, '#ffd34a'), W(-0.48, -0.5), W(0.48, -0.5), W(-0.48, 0.5), W(0.48, 0.5)]);
  return GEO;
}
let MAT: THREE.MeshLambertMaterial | null = null;

const key = (x: number, z: number) => Math.round(x * 2) + ',' + Math.round(z * 2);

export class Cart implements Entity {
  kind = 'cart';
  id = 0;
  x: number;
  y: number;
  z: number;
  r = 0.8;
  h = 1.1;
  hp = 999;
  /** célula atual (centro) e direção (±1 em x ou z) */
  cx: number;
  cz: number;
  dx = 0;
  dz = 1;
  s = 0;
  v = 0;
  mesh: THREE.Mesh;
  constructor(
    private carts: Carts,
    api: MundoAPI,
    p: Piece,
  ) {
    this.cx = p.x;
    this.cz = p.z;
    this.x = p.x;
    this.y = p.y;
    this.z = p.z;
    if (p.r & 1) {
      this.dx = 1;
      this.dz = 0;
    }
    MAT ??= new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(cartGeo(), MAT);
    api.scene.add(this.mesh);
  }
  update(dt: number, api: MundoAPI): boolean {
    const C = this.carts;
    const cur = C.rail(this.cx, this.cz);
    if (!cur) {
      // trilho sumiu: vira item de novo
      api.give('vagonete', 1);
      if (C.riding === this) C.leave();
      return false;
    }
    const riding = C.riding === this;
    const ctl = C.ctl();
    // força: joystick para frente/trás + turbo + atrito + gravidade nas rampas
    if (riding) this.v += -ctl.my * 9 * dt;
    if (PDEFS.get(cur.id)?.rail === 2) this.v += Math.sign(this.v || 1) * 18 * dt;
    const nxt = C.rail(this.cx + this.dx * 2, this.cz + this.dz * 2);
    if (nxt) this.v += (cur.y - nxt.y) * 6 * dt;
    this.v *= 1 - Math.min(1, dt * (riding && ctl.my ? 0.15 : 0.6));
    if (this.v > 14) this.v = 14;
    if (this.v < -14) this.v = -14;
    this.s += this.v * dt;
    // chegou na próxima célula?
    let guard = 0;
    while ((this.s >= 2 || this.s < 0) && guard++ < 4) {
      if (this.s >= 2) {
        const n = this.next(this.cx, this.cz, this.dx, this.dz, riding ? ctl.mx : 0);
        if (!n) {
          this.s = 2;
          this.v = -this.v * 0.3;
          if (Math.abs(this.v) > 1) audio.click();
          break;
        }
        this.cx += this.dx * 2;
        this.cz += this.dz * 2;
        this.dx = n[0];
        this.dz = n[1];
        this.s -= 2;
      } else {
        const b = C.rail(this.cx - this.dx * 2, this.cz - this.dz * 2);
        if (!b) {
          this.s = 0;
          this.v = -this.v * 0.3;
          break;
        }
        this.cx -= this.dx * 2;
        this.cz -= this.dz * 2;
        this.s += 2;
      }
    }
    const a = C.rail(this.cx, this.cz)!;
    const b = C.rail(this.cx + this.dx * 2, this.cz + this.dz * 2);
    const k = this.s / 2;
    this.x = this.cx + this.dx * this.s;
    this.z = this.cz + this.dz * this.s;
    this.y = a.y + ((b ? b.y : a.y) - a.y) * k;
    this.mesh.position.set(this.x, this.y + 0.05, this.z);
    this.mesh.rotation.set(b ? Math.atan2(b.y - a.y, 2) * (this.dz || this.dx) * -1 * 0 : 0, Math.atan2(this.dx, this.dz), 0);
    if (b && b.y !== a.y) this.mesh.rotation.x = -Math.atan2(b.y - a.y, 2);
    return true;
  }
  /** próxima direção na célula seguinte: reto, ou vira (preferindo o lado do joystick) */
  private next(cx: number, cz: number, dx: number, dz: number, steer: number): [number, number] | null {
    const C = this.carts;
    const nx = cx + dx * 2;
    const nz = cz + dz * 2;
    if (!C.rail(nx, nz)) return null;
    const straight = C.rail(nx + dx * 2, nz + dz * 2);
    // esquerda/direita relativas à direção
    const L: [number, number] = [dz, -dx];
    const R: [number, number] = [-dz, dx];
    const l = C.rail(nx + L[0] * 2, nz + L[1] * 2);
    const r = C.rail(nx + R[0] * 2, nz + R[1] * 2);
    if (steer < -0.4 && l) return L;
    if (steer > 0.4 && r) return R;
    if (straight) return [dx, dz];
    if (l && !r) return L;
    if (r && !l) return R;
    if (l) return L;
    return [dx, dz];
  }
  interact(): void {
    if (this.carts.riding === this) this.carts.leave();
    else this.carts.board(this);
  }
  hit(_d: number, from: string, api: MundoAPI): void {
    // golpe de picareta/mão desmonta o vagonete (devolve o item)
    if (from !== 'player') return;
    api.give('vagonete', 1);
    this.carts.remove(this);
  }
  dispose(api: MundoAPI): void {
    api.scene.remove(this.mesh);
  }
}

export class Carts {
  riding: Cart | null = null;
  private idx = new Map<string, Piece>();
  private ver = -1;
  constructor(private sb: Sandbox) {}
  ctl(): { mx: number; my: number } {
    return (this.sb as unknown as { g: { hud: { ctl: { mx: number; my: number } } } }).g.hud.ctl;
  }
  /** índice dos trilhos por célula (refeito quando as peças mudam) */
  rail(x: number, z: number): Piece | undefined {
    const ps = this.sb.builds.pieces;
    if (ps.length !== this.ver) {
      this.ver = ps.length;
      this.idx.clear();
      for (const p of ps) if (PDEFS.get(p.id)?.rail) this.idx.set(key(p.x, p.z), p);
    }
    return this.idx.get(key(x, z));
  }
  spawnOn(p: Piece): void {
    const sb = this.sb;
    sb.builds.remove(p);
    // trilho mais perto (até 2 m)
    let best: Piece | null = null;
    let bd = 2.2 * 2.2;
    for (const q of sb.builds.pieces) {
      if (!PDEFS.get(q.id)?.rail) continue;
      const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
      if (d < bd && Math.abs(q.y - p.y) < 2) {
        bd = d;
        best = q;
      }
    }
    this.ver = -1;
    if (!best) {
      sb.give('vagonete', 1);
      sb.toast(t('mundo.cartRail', 'Coloque o vagonete em cima de um trilho'), 'warn');
      return;
    }
    sb.addEntity(new Cart(this, sb, best));
  }
  label(e: Entity): string | null {
    if (!(e instanceof Cart)) return null;
    return this.riding === e ? t('mundo.leaveCart', 'Descer') : t('mundo.ride', 'Andar de vagonete');
  }
  board(c: Cart): void {
    this.riding = c;
    audio.click();
    this.sb.toast(t('mundo.cartHelp', 'Joystick para frente/trás; para os lados escolhe a curva'));
  }
  leave(): void {
    const c = this.riding;
    this.riding = null;
    if (!c) return;
    const g = (this.sb as unknown as { g: { px: number; py: number; pz: number; world: { floorAt(x: number, y: number, z: number): number } } }).g;
    g.px = c.x + c.dz * 1.4;
    g.pz = c.z - c.dx * 1.4;
    g.py = g.world.floorAt(g.px, c.y + 1.5, g.pz);
  }
  /** câmera/jogador montados no vagonete (chamado no lugar de andar) */
  ride(g: { px: number; py: number; pz: number; camera: THREE.PerspectiveCamera; yaw: number; pitch: number }): void {
    const c = this.riding!;
    g.px = c.x;
    g.py = c.y + 0.5;
    g.pz = c.z;
    g.camera.position.set(c.x, c.y + 1.9, c.z);
    g.camera.rotation.set(g.pitch, g.yaw, 0, 'YXZ');
  }
  remove(c: Cart): void {
    if (this.riding === c) this.leave();
    this.sb.removeEntity(c);
  }
  update(_dt: number): void {
    /* os vagonetes são entidades; aqui só o índice */
  }
  toJSON(): number[][] {
    const out: number[][] = [];
    for (const e of this.sb.entities()) if (e instanceof Cart) out.push([e.cx, e.cz, e.dx, e.dz, Math.round(e.s * 10) / 10]);
    return out;
  }
  load(a: unknown): void {
    if (!Array.isArray(a)) return;
    for (const r of a as number[][]) {
      const p = this.rail(r[0], r[1]);
      if (!p) continue;
      const c = new Cart(this, this.sb, p);
      c.dx = r[2];
      c.dz = r[3];
      c.s = r[4] || 0;
      this.sb.addEntity(c);
    }
  }
  dispose(): void {
    this.riding = null;
  }
}
