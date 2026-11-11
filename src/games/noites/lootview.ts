/* ============================================================
 *  NOITES — coisas soltas no chão (toras, galhos, pedras...).
 *  Instanciadas por tipo (barato), com contorno claro para achar
 *  de longe, pilhas que crescem e o "voo até a mão" ao pegar.
 * ============================================================ */
import * as THREE from 'three';
import type { Loot, Sim } from './sim';
import { itemGeo, vcMat } from './models';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

interface Kind {
  body: THREE.InstancedMesh;
  edge: THREE.InstancedMesh;
  n: number;
}
interface Fly {
  m: THREE.Mesh;
  t: number;
  x: number;
  y: number;
  z: number;
  /** destino (atualizado a cada quadro) */
  to: () => THREE.Vector3;
}

/** posição de cada peça de uma pilha (0..n-1) em volta do centro */
function pileSpot(k: string, i: number, out: THREE.Vector3): number {
  if (k === 'wood') {
    // toras: pirâmide 3-2-1
    const row = i < 3 ? 0 : i < 5 ? 1 : 2;
    const col = i < 3 ? i - 1 : i < 5 ? i - 3.5 : 0;
    out.set(0, row * 0.22, col * 0.27);
    return 0;
  }
  const a = i * 2.4;
  const r = i ? 0.16 + i * 0.03 : 0;
  out.set(Math.cos(a) * r, i > 3 ? 0.12 : 0, Math.sin(a) * r);
  return a;
}

export class LootView {
  private kinds = new Map<string, Kind>();
  private bodyMat = vcMat();
  private edgeMat = new THREE.MeshBasicMaterial({ color: '#fff7c0', side: THREE.BackSide, transparent: true, opacity: 0.75, fog: false, depthWrite: false });
  private flies: Fly[] = [];
  private time = 0;
  /** brilho extra à noite (contorno mais forte) */
  night = 0;

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
  ) {}

  private kind(k: string): Kind {
    let o = this.kinds.get(k);
    if (o) return o;
    const g = itemGeo(k);
    const body = new THREE.InstancedMesh(g, this.bodyMat, 32);
    const edge = new THREE.InstancedMesh(g, this.edgeMat, 32);
    body.frustumCulled = edge.frustumCulled = false;
    edge.renderOrder = -1;
    this.scene.add(edge, body);
    o = { body, edge, n: 0 };
    this.kinds.set(k, o);
    return o;
  }
  private grow(o: Kind, need: number): void {
    if (need <= o.body.instanceMatrix.count) return;
    const cap = Math.max(need, o.body.instanceMatrix.count * 2);
    const g = o.body.geometry;
    this.scene.remove(o.body, o.edge);
    o.body.dispose();
    o.edge.dispose();
    o.body = new THREE.InstancedMesh(g, this.bodyMat, cap);
    o.edge = new THREE.InstancedMesh(g, this.edgeMat, cap);
    o.body.frustumCulled = o.edge.frustumCulled = false;
    o.edge.renderOrder = -1;
    this.scene.add(o.edge, o.body);
  }

  /** pega: copia a peça e faz voar até a mão (destino dinâmico) */
  fly(k: string, x: number, y: number, z: number, to: () => THREE.Vector3): void {
    if (this.flies.length > 12) return;
    const m = new THREE.Mesh(itemGeo(k), this.bodyMat);
    m.position.set(x, y, z);
    this.scene.add(m);
    this.flies.push({ m, t: 0, x, y, z, to });
  }

  update(dt: number, camX: number, camZ: number, maxD = 60): void {
    this.time += dt;
    for (const o of this.kinds.values()) o.n = 0;
    const L = this.sim.loot;
    const pulse = 1.1 + Math.sin(this.time * 4) * 0.025;
    for (const l of L) {
      if (l.d > 0) continue;
      if (Math.abs(l.x - camX) > maxD || Math.abs(l.z - camZ) > maxD) continue;
      const o = this.kind(l.k);
      const pieces = Math.min(l.n, l.k === 'wood' ? 6 : 5);
      this.grow(o, o.n + pieces);
      for (let i = 0; i < pieces; i++) this.put(o, l, i, pulse);
    }
    for (const o of this.kinds.values()) {
      o.body.count = o.edge.count = o.n;
      o.body.instanceMatrix.needsUpdate = o.edge.instanceMatrix.needsUpdate = true;
    }
    this.edgeMat.opacity = 0.55 + this.night * 0.35 + Math.sin(this.time * 4) * 0.08;
    // voando para a mão
    for (const f of this.flies) {
      f.t += dt;
      const k = Math.min(1, f.t / 0.32);
      const e = k * k * (3 - 2 * k);
      const d = f.to();
      // sobe um pouco (pop) e vai
      const hop = Math.sin(k * Math.PI) * 0.5;
      f.m.position.set(f.x + (d.x - f.x) * e, f.y + (d.y - f.y) * e + hop, f.z + (d.z - f.z) * e);
      f.m.scale.setScalar(k < 0.2 ? 1 + k * 1.5 : 1.3 * (1 - (k - 0.2) / 0.8) + 0.05);
      f.m.rotation.y += dt * 10;
    }
    if (this.flies.some((f) => f.t >= 0.32)) {
      for (const f of this.flies) if (f.t >= 0.32) this.scene.remove(f.m);
      this.flies = this.flies.filter((f) => f.t < 0.32);
    }
  }
  private put(o: Kind, l: Loot, i: number, pulse: number): void {
    const a = pileSpot(l.k, i, _v);
    const rot = (l.id * 1.7) % 6.283;
    const spin = l.rest ? 0 : this.time * 9 + l.id;
    // gira o deslocamento da pilha pela direção da peça
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const px = l.x + _v.x * c - _v.z * s;
    const pz = l.z + _v.x * s + _v.z * c;
    const py = l.y - 0.1 + _v.y;
    _q.setFromEuler(_e.set(l.rest ? 0 : spin * 0.7, rot + a + (l.k === 'wood' ? Math.PI / 2 : 0), l.rest ? 0 : spin));
    o.body.setMatrixAt(o.n, _m.compose(_s.set(px, py, pz), _q, _v.setScalar(1)));
    o.edge.setMatrixAt(o.n, _m.compose(_s.set(px, py - 0.02, pz), _q, _v.setScalar(pulse)));
    o.n++;
  }

  dispose(): void {
    for (const o of this.kinds.values()) {
      this.scene.remove(o.body, o.edge);
      o.body.dispose();
      o.edge.dispose();
    }
    for (const f of this.flies) this.scene.remove(f.m);
    this.bodyMat.dispose();
    this.edgeMat.dispose();
  }
}
