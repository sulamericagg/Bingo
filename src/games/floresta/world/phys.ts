/* ============================================================
 *  MUNDO ABERTO — física (cannon-es) só onde importa:
 *  toras soltas (corpos de 3 esferas: rolam, empilham, caem em buracos),
 *  chão como heightfield dos pedaços perto das toras/jogador,
 *  malhas de cavernas/escavações (trimesh) por seção,
 *  troncos de árvores perto (cilindros estáticos, de um pool),
 *  veículos e jogador como corpos cinemáticos (empurram as toras),
 *  peças construídas como caixas estáticas.
 * ============================================================ */
import * as CANNON from 'cannon-es';
import type { Chunk } from './chunk';
import { CH } from './gen';
import { TREE_STRIDE, TState } from './chunk';

export const G_GROUND = 1;
export const G_LOG = 2;
export const G_STATIC = 4;
export const G_KIN = 8;

export const LOG_R = 0.27;
export const LOG_HALF = 0.62;

export class Phys {
  readonly w: CANNON.World;
  readonly groundMat = new CANNON.Material('ground');
  readonly logMat = new CANNON.Material('log');
  private hf = new Map<Chunk, CANNON.Body>();
  private mesh = new Map<string, CANNON.Body>();
  private treePool: CANNON.Body[] = [];
  private treeUsed = 0;
  private treeT = 0;
  private boxes = new Map<number, CANNON.Body>();
  private lastSync = 0;

  constructor() {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
    w.broadphase = new CANNON.SAPBroadphase(w);
    w.allowSleep = true;
    (w.solver as CANNON.GSSolver).iterations = 7;
    w.defaultContactMaterial.friction = 0.4;
    w.addContactMaterial(new CANNON.ContactMaterial(this.groundMat, this.logMat, { friction: 0.55, restitution: 0.12 }));
    w.addContactMaterial(new CANNON.ContactMaterial(this.logMat, this.logMat, { friction: 0.45, restitution: 0.1 }));
    this.w = w;
  }

  /** corpo de tora: 3 esferas no eixo X (rola de lado, tomba, empilha) */
  logBody(x: number, y: number, z: number, yaw: number): CANNON.Body {
    const b = new CANNON.Body({
      mass: 3,
      material: this.logMat,
      linearDamping: 0.12,
      angularDamping: 0.35,
      collisionFilterGroup: G_LOG,
      collisionFilterMask: G_GROUND | G_LOG | G_STATIC | G_KIN,
      allowSleep: true,
      sleepSpeedLimit: 0.25,
      sleepTimeLimit: 0.7,
    });
    const s = new CANNON.Sphere(LOG_R);
    b.addShape(s, new CANNON.Vec3(-LOG_HALF + LOG_R * 0.6, 0, 0));
    b.addShape(s, new CANNON.Vec3(0, 0, 0));
    b.addShape(s, new CANNON.Vec3(LOG_HALF - LOG_R * 0.6, 0, 0));
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(0, yaw, 0);
    this.w.addBody(b);
    return b;
  }
  removeBody(b: CANNON.Body): void {
    this.w.removeBody(b);
  }

  /** caixa cinemática (veículo/jogador/peça móvel) */
  kinBox(id: number, hx: number, hy: number, hz: number): CANNON.Body {
    let b = this.boxes.get(id);
    if (b) return b;
    b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, collisionFilterGroup: G_KIN, collisionFilterMask: G_LOG });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    this.w.addBody(b);
    this.boxes.set(id, b);
    return b;
  }
  /** move um corpo cinemático com velocidade coerente (empurra o que estiver no caminho) */
  moveKin(b: CANNON.Body, x: number, y: number, z: number, yaw: number, pitch: number, roll: number, dt: number): void {
    if (dt > 0) {
      b.velocity.set((x - b.position.x) / dt, (y - b.position.y) / dt, (z - b.position.z) / dt);
      if (b.velocity.lengthSquared() > 900) b.velocity.set(0, 0, 0);
    }
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(roll, yaw, pitch, 'YXZ');
  }

  /** caixa estática (peça construída) */
  staticBox(x: number, y: number, z: number, hx: number, hy: number, hz: number, yaw: number): CANNON.Body {
    const b = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: G_STATIC, collisionFilterMask: G_LOG });
    b.addShape(new CANNON.Box(new CANNON.Vec3(hx, hy, hz)));
    b.position.set(x, y, z);
    b.quaternion.setFromEuler(0, yaw, 0);
    this.w.addBody(b);
    return b;
  }

  /** trimesh de uma seção escavada (chave única) — null remove */
  setMesh(key: string, pos: Float32Array | null, idx: Uint32Array | null): void {
    const old = this.mesh.get(key);
    if (old) {
      this.w.removeBody(old);
      this.mesh.delete(key);
    }
    if (!pos || !idx || idx.length < 3) return;
    const shape = new CANNON.Trimesh(Array.from(pos), Array.from(idx));
    const b = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: G_GROUND, collisionFilterMask: G_LOG });
    b.addShape(shape);
    this.w.addBody(b);
    this.mesh.set(key, b);
    // acorda as toras por perto (o chão mudou)
    for (const o of this.w.bodies) if (o.type === CANNON.Body.DYNAMIC) o.wakeUp();
  }
  hasMesh(key: string): boolean {
    return this.mesh.has(key);
  }

  /**
   * Mantém o chão físico só nos pedaços em volta dos pontos ativos (jogador + toras acordadas).
   * Pedaços "volumétricos" (cavados) usam trimesh por seção, não heightfield.
   */
  syncGround(chunks: Map<string, Chunk>, pts: number[], now: number): void {
    if (now - this.lastSync < 0.25) return;
    this.lastSync = now;
    const want = new Set<Chunk>();
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const cx = Math.floor(pts[i] / CH);
      const cz = Math.floor(pts[i + 1] / CH);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          const c = chunks.get(cx + dx + ',' + (cz + dz));
          if (c && !c.vol) want.add(c);
        }
    }
    for (const [c, b] of this.hf) {
      if (!want.has(c) || c.vol) {
        this.w.removeBody(b);
        c.dropBody();
        this.hf.delete(c);
      }
    }
    for (const c of want) {
      if (this.hf.has(c)) continue;
      const b = c.makeBody(this.groundMat, G_GROUND);
      b.collisionFilterMask = G_LOG;
      this.w.addBody(b);
      this.hf.set(c, b);
    }
  }
  /** pedaço editado: atualiza o heightfield se existir */
  touchChunk(c: Chunk): void {
    if (this.hf.has(c)) {
      c.syncBody();
      for (const o of this.w.bodies) if (o.type === CANNON.Body.DYNAMIC) o.wakeUp();
    }
  }
  forgetChunk(c: Chunk): void {
    const b = this.hf.get(c);
    if (b) {
      this.w.removeBody(b);
      c.dropBody();
      this.hf.delete(c);
    }
    const pre = c.key() + '/';
    for (const [k, mb] of this.mesh)
      if (k.startsWith(pre)) {
        this.w.removeBody(mb);
        this.mesh.delete(k);
      }
  }

  /** troncos perto dos pontos ativos viram cilindros estáticos (pool fixo) */
  syncTrees(chunks: Map<string, Chunk>, pts: number[], hidden: Set<string>, dt: number): void {
    this.treeT -= dt;
    if (this.treeT > 0) return;
    this.treeT = 0.4;
    let n = 0;
    const R2 = 12 * 12;
    for (const c of chunks.values()) {
      for (let i = 0; i < c.nt && n < 48; i++) {
        if (c.tstate[i] !== TState.Grown) continue;
        const o = i * TREE_STRIDE;
        const x = c.trees[o];
        const z = c.trees[o + 2];
        let near = false;
        for (let k = 0; k + 1 < pts.length; k += 2) {
          const dx = pts[k] - x;
          const dz = pts[k + 1] - z;
          if (dx * dx + dz * dz < R2) {
            near = true;
            break;
          }
        }
        if (!near || hidden.has(c.key() + ':' + i)) continue;
        let b = this.treePool[n];
        if (!b) {
          b = new CANNON.Body({ mass: 0, material: this.groundMat, collisionFilterGroup: G_STATIC, collisionFilterMask: G_LOG });
          b.addShape(new CANNON.Cylinder(0.32, 0.4, 5, 8));
          this.treePool.push(b);
        }
        if (n >= this.treeUsed) this.w.addBody(b);
        const sc = c.trees[o + 4];
        b.position.set(x, c.trees[o + 1] + 2.4, z);
        (b.shapes[0] as CANNON.Cylinder).boundingSphereRadius = 2.6;
        b.shapes[0].updateBoundingSphereRadius();
        void sc;
        b.aabbNeedsUpdate = true;
        n++;
      }
    }
    for (let i = n; i < this.treeUsed; i++) this.w.removeBody(this.treePool[i]);
    this.treeUsed = n;
  }

  step(dt: number): void {
    this.w.step(1 / 60, dt, 3);
  }

  dispose(): void {
    for (const b of [...this.w.bodies]) this.w.removeBody(b);
    this.hf.clear();
    this.mesh.clear();
    this.boxes.clear();
  }
}
