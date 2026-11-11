/* ============================================================
 *  NOITES · CONSTRUÇÃO — vista 3D.
 *   - InstancedMesh por variante (peça × forma); quando algo muda
 *     só as peças cuja variante/posição mudou trocam de instância;
 *   - pop-in com poeira, tremida ao levar golpe, rachaduras e tom
 *     escuro pela vida, barras de vida (billboard instanciado);
 *   - portões com folhas animadas (abrem para jogadores/ajudantes);
 *   - fantasma (verde/vermelho), ladrilhos da grade e ícone do motivo.
 * ============================================================ */
import * as THREE from 'three';
import type { Particles } from '../../../3d/common/particles';
import { sfx } from '../../../3d/common/sfx';
import { glowMat, iconSprite, vcMat } from '../models';
import type { Sim } from '../sim';
import { bic } from './icons';
import { CELL, PIECE, PIECES, variantOf, type PK } from './pieces';
import { crackGeo, gateLeaf, pieceGeo } from './models';
import { cellOf, type BPiece } from './state';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color('#ffffff');
const HURT = new THREE.Color('#7a5a54');

/** InstancedMesh que cresce e troca instâncias por id (remoção por troca com a última) */
class VIM {
  im: THREE.InstancedMesh;
  ids: number[] = [];
  slot = new Map<number, number>();
  constructor(
    private scene: THREE.Scene,
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    cap = 16,
    private colors = false,
  ) {
    this.im = this.mk(cap);
  }
  private mk(cap: number): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(this.geo, this.mat, cap);
    im.count = 0;
    im.frustumCulled = false;
    if (this.colors) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
    this.scene.add(im);
    return im;
  }
  has(id: number): boolean {
    return this.slot.has(id);
  }
  set(id: number, m: THREE.Matrix4): void {
    let i = this.slot.get(id);
    if (i === undefined) {
      i = this.ids.length;
      if (i >= this.im.instanceMatrix.count) {
        const old = this.im;
        const im = this.mk(old.instanceMatrix.count * 2);
        (im.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
        if (old.instanceColor && im.instanceColor) (im.instanceColor.array as Float32Array).set(old.instanceColor.array as Float32Array);
        this.scene.remove(old);
        old.dispose();
        this.im = im;
      }
      this.ids.push(id);
      this.slot.set(id, i);
      this.im.count = this.ids.length;
      if (this.im.instanceColor) this.im.setColorAt(i, WHITE);
    }
    this.im.setMatrixAt(i, m);
    this.im.instanceMatrix.needsUpdate = true;
  }
  color(id: number, c: THREE.Color): void {
    const i = this.slot.get(id);
    if (i === undefined || !this.im.instanceColor) return;
    this.im.setColorAt(i, c);
    this.im.instanceColor.needsUpdate = true;
  }
  remove(id: number): void {
    const i = this.slot.get(id);
    if (i === undefined) return;
    const last = this.ids.length - 1;
    if (i !== last) {
      const lid = this.ids[last];
      this.im.getMatrixAt(last, _m);
      this.im.setMatrixAt(i, _m);
      if (this.im.instanceColor) {
        this.im.getColorAt(last, _c);
        this.im.setColorAt(i, _c);
        this.im.instanceColor.needsUpdate = true;
      }
      this.ids[i] = lid;
      this.slot.set(lid, i);
    }
    this.ids.pop();
    this.slot.delete(id);
    this.im.count = this.ids.length;
    this.im.instanceMatrix.needsUpdate = true;
  }
  dispose(): void {
    this.scene.remove(this.im);
    this.im.dispose();
  }
}

interface GateRig {
  g: THREE.Group;
  l: THREE.Mesh;
  r: THREE.Mesh;
  open: number;
  side: number;
  want: boolean;
}
interface PV {
  kind: PK;
  vk: string;
  rot: number;
  x: number;
  z: number;
  y: number;
  born: number;
  shake: number;
  hp: number;
  crack: number;
  gate?: GateRig;
}

export interface GhostCell {
  x: number;
  z: number;
  ok: boolean;
  kind: PK;
  shape: number;
  rot: number;
}
export interface GhostView {
  mode: 'place' | 'del' | 'fix' | 'up';
  cells: GhostCell[];
  /** peças destacadas (desmontar/consertar/melhorar) */
  hl: number[];
  /** ícone do motivo ('' = tudo certo) e onde mostrar */
  reason: string;
  rx: number;
  rz: number;
  /** centro da grade desenhada */
  gx: number;
  gz: number;
  free: boolean;
}

const GRID_VS = `varying vec3 wp; void main(){ vec4 w = modelMatrix*vec4(position,1.0); wp = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const GRID_FS = `uniform vec2 c; uniform float cell; uniform vec3 col; uniform float rad; varying vec3 wp;
void main(){
  vec2 g = abs(fract(wp.xz/cell + 0.5) - 0.5) * cell;
  float l = 1.0 - smoothstep(0.015, 0.05, min(g.x, g.y));
  float d = length(wp.xz - c);
  float a = l * (1.0 - smoothstep(rad*0.45, rad, d));
  if (a < 0.01) discard;
  gl_FragColor = vec4(col, a*0.75);
}`;

export class BuildView {
  /** prévia de construção (preenchida pelo controlador a cada quadro) */
  ghost: GhostView | null = null;
  private body = new Map<string, VIM>();
  private glow = new Map<string, VIM>();
  private crack = new Map<string, VIM>();
  private recs = new Map<number, PV>();
  private anim = new Set<number>();
  private mat = vcMat();
  private glowM = glowMat('#ffb040', 0.92);
  private crackM = vcMat();
  private ver = -1;
  private hpVer = -1;
  private time = 0;
  private first = true;
  private hitSfxT = 0;
  // fantasma
  private gGroup = new THREE.Group();
  private gMeshes: THREE.Mesh[] = [];
  private gMat: Record<string, THREE.MeshBasicMaterial> = {};
  private tiles: THREE.InstancedMesh;
  private grid: THREE.Mesh;
  private gridU: { c: { value: THREE.Vector2 }; cell: { value: number }; col: { value: THREE.Color }; rad: { value: number } };
  private why: THREE.Sprite | null = null;
  private whyK = '';
  private spriteCache = new Map<string, THREE.Sprite>();
  // barras
  private barBg: THREE.InstancedMesh;
  private barFg: THREE.InstancedMesh;

  constructor(
    private scene: THREE.Scene,
    private sim: Sim,
    private parts: Particles,
  ) {
    const mk = (c: string, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, fog: false });
    this.gMat = { ok: mk('#8affc0', 0.62), bad: mk('#ff4a5e', 0.62), del: mk('#ff4a5e', 0.6), fix: mk('#ffd34a', 0.55), up: mk('#7ad0ff', 0.6) };
    scene.add(this.gGroup);
    this.tiles = new THREE.InstancedMesh(new THREE.PlaneGeometry(CELL * 0.94, CELL * 0.94).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.38, depthWrite: false, fog: false }), 24);
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3).fill(1), 3);
    this.tiles.count = 0;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = 2;
    scene.add(this.tiles);
    this.gridU = { c: { value: new THREE.Vector2() }, cell: { value: CELL }, col: { value: new THREE.Color('#fff6c8') }, rad: { value: 6.5 } };
    this.grid = new THREE.Mesh(new THREE.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.gridU, vertexShader: GRID_VS, fragmentShader: GRID_FS, transparent: true, depthWrite: false }));
    this.grid.visible = false;
    this.grid.renderOrder = 1;
    scene.add(this.grid);
    const bm = (c: string) => new THREE.MeshBasicMaterial({ color: c, depthWrite: false, depthTest: false, transparent: true, fog: false });
    this.barBg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.08, 0.24), bm('#1a0a30'), 48);
    this.barFg = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.15).translate(0.5, 0, 0.001), bm('#ffffff'), 48);
    this.barFg.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(48 * 3).fill(1), 3);
    for (const b of [this.barBg, this.barFg]) {
      b.count = 0;
      b.frustumCulled = false;
      b.renderOrder = 20;
      scene.add(b);
    }
  }

  private st() {
    return this.sim.build;
  }

  /* ------------------------------ sincronia ------------------------------ */
  private vim(map: Map<string, VIM>, key: string, geo: THREE.BufferGeometry, mat: THREE.Material, colors = false): VIM {
    let v = map.get(key);
    if (!v) map.set(key, (v = new VIM(this.scene, geo, mat, 16, colors)));
    return v;
  }
  private detach(id: number, pv: PV): void {
    this.body.get(pv.vk)?.remove(id);
    this.glow.get(pv.vk)?.remove(id);
    for (const lv of [1, 2]) this.crack.get(pv.vk + ':' + lv)?.remove(id);
    if (pv.gate) {
      this.scene.remove(pv.gate.g);
      pv.gate = undefined;
    }
  }
  private matrix(pv: PV, id: number): THREE.Matrix4 {
    let s = 1;
    let y = pv.y;
    let ox = 0;
    let oz = 0;
    let tilt = 0;
    if (pv.born >= 0) {
      const t = Math.min(1, (this.time - pv.born) / 0.42);
      const c1 = 1.9;
      s = t >= 1 ? 1 : Math.max(0.02, 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2));
      y += (1 - Math.min(1, t * 1.6)) * 0.5;
    }
    if (pv.shake > 0) {
      const k = pv.shake / 0.35;
      ox = Math.sin(this.time * 70 + id) * 0.05 * k;
      oz = Math.cos(this.time * 63 + id) * 0.05 * k;
      tilt = Math.sin(this.time * 50) * 0.05 * k;
    }
    _q.setFromAxisAngle(UP, pv.rot);
    if (tilt) _q.multiply(_q2.setFromAxisAngle(_p.set(1, 0, 0), tilt));
    return _m.compose(_p.set(pv.x + ox, y, pv.z + oz), _q, _s.set(s, s * (pv.born >= 0 ? 2 - Math.min(1, s) : 1), s));
  }
  private write(id: number, pv: PV): void {
    const m = this.matrix(pv, id);
    if (pv.gate) {
      pv.gate.g.position.setFromMatrixPosition(m);
      pv.gate.g.quaternion.setFromRotationMatrix(m);
      pv.gate.g.scale.setFromMatrixScale(m);
    }
    this.body.get(pv.vk)?.set(id, m);
    if (this.glow.has(pv.vk)) this.glow.get(pv.vk)!.set(id, m);
    if (pv.crack) this.crack.get(pv.vk + ':' + pv.crack)?.set(id, m);
  }
  private tint(id: number, pv: PV): void {
    const d = PIECE[pv.kind];
    const f = Math.max(0, Math.min(1, pv.hp / d.hp));
    _c.copy(WHITE).lerp(HURT, (1 - f) * 0.75);
    this.body.get(pv.vk)?.color(id, _c);
    if (pv.gate) {
      for (const m of [pv.gate.l, pv.gate.r]) (m.material as THREE.MeshLambertMaterial).color.copy(_c);
    }
    const lv = f < 0.3 ? 2 : f < 0.65 ? 1 : 0;
    if (lv !== pv.crack) {
      if (pv.crack) this.crack.get(pv.vk + ':' + pv.crack)?.remove(id);
      pv.crack = lv;
      if (lv) {
        const sh = +pv.vk.split(':')[1];
        this.vim(this.crack, pv.vk + ':' + lv, crackGeo(pv.kind, sh, lv), this.crackM).set(id, this.matrix(pv, id));
      }
    }
  }
  private sync(meX: number, meZ: number): void {
    const B = this.st();
    const alive = new Set<number>();
    const H = this.sim.w;
    for (const p of B.pieces) {
      alive.add(p.id);
      const d = PIECES[p.k];
      const [shape, rot] = variantOf(d, B.mask(p), p.ro);
      const vk = d.id + ':' + shape;
      let pv = this.recs.get(p.id);
      const y = H.height(p.x, p.z);
      if (pv && (pv.vk !== vk || pv.kind !== d.id)) {
        // trocou de variante (vizinho mudou) ou melhorou de nível
        const up = pv.kind !== d.id;
        this.detach(p.id, pv);
        pv.vk = vk;
        pv.kind = d.id;
        pv.crack = 0;
        if (up) {
          pv.born = this.time;
          pv.hp = p.hp;
          this.parts.burst(p.x, y + 0.8, p.z, 16, 'spark', '#7ad0ff', 2.4);
          this.parts.burst(p.x, y + 0.2, p.z, 8, 'poof', '#e8dcc0', 1.4);
        }
      }
      if (!pv) {
        pv = { kind: d.id, vk, rot, x: p.x, z: p.z, y, born: this.first ? -1 : this.time, shake: 0, hp: p.hp, crack: 0 };
        this.recs.set(p.id, pv);
        if (!this.first) {
          this.parts.burst(p.x, y + 0.15, p.z, 10, 'poof', '#e8dcc0', 1.6);
          this.parts.burst(p.x, y + 0.6, p.z, 6, 'chunk', d.col, 2);
          if (Math.hypot(p.x - meX, p.z - meZ) < 22) sfx.thunk();
        }
      }
      pv.rot = rot;
      pv.x = p.x;
      pv.z = p.z;
      pv.y = y;
      if (d.id === 'gate' && !pv.gate) pv.gate = this.mkGate();
      const g = pieceGeo(d.id, shape);
      if (!pv.gate) this.vim(this.body, vk, g.geo, this.mat, true);
      if (g.glow) this.vim(this.glow, vk, g.glow, this.glowM);
      if (pv.born >= 0) this.anim.add(p.id);
      this.write(p.id, pv);
      this.tint(p.id, pv);
    }
    for (const [id, pv] of this.recs) {
      if (alive.has(id)) continue;
      this.detach(id, pv);
      this.recs.delete(id);
      this.anim.delete(id);
      const d = PIECE[pv.kind];
      const broke = pv.hp < d.hp * 0.34;
      this.parts.burst(pv.x, pv.y + 0.6, pv.z, broke ? 22 : 12, 'chunk', d.col, broke ? 3.4 : 2.2);
      this.parts.burst(pv.x, pv.y + 0.3, pv.z, broke ? 14 : 8, 'poof', '#d8ccb0', 1.8);
      if (Math.hypot(pv.x - meX, pv.z - meZ) < 24) (broke ? sfx.crash : sfx.pop)();
    }
    this.first = false;
  }
  private hpSync(meX: number, meZ: number): void {
    for (const p of this.st().pieces) {
      const pv = this.recs.get(p.id);
      if (!pv || pv.hp === p.hp) continue;
      const d = PIECE[pv.kind];
      if (p.hp < pv.hp - 0.01) {
        pv.shake = 0.35;
        this.anim.add(p.id);
        this.parts.burst(p.x, pv.y + d.h * 0.5, p.z, 4, 'chunk', d.col, 2.2);
        this.parts.burst(p.x, pv.y + d.h * 0.6, p.z, 3, 'spark', '#ffe6a0', 2);
        if (this.hitSfxT <= 0 && Math.hypot(p.x - meX, p.z - meZ) < 16) {
          this.hitSfxT = 0.25;
          sfx.chop();
        }
      } else if (p.hp > pv.hp + 0.5) {
        this.parts.burst(p.x, pv.y + d.h * 0.6, p.z, 14, 'spark', '#ffd34a', 2.2);
        if (Math.hypot(p.x - meX, p.z - meZ) < 22) sfx.fix();
      }
      pv.hp = p.hp;
      this.tint(p.id, pv);
    }
  }
  private mkGate(): GateRig {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(pieceGeo('gate').geo, this.mat));
    const leafMat = () => new THREE.MeshLambertMaterial({ vertexColors: true });
    const l = new THREE.Mesh(gateLeaf(), leafMat());
    l.position.z = 0.6;
    const r = new THREE.Mesh(gateLeaf(), leafMat());
    r.position.z = -0.6;
    r.rotation.y = Math.PI;
    g.add(l, r);
    this.scene.add(g);
    return { g, l, r, open: 0, side: 1, want: false };
  }

  /* ------------------------------ quadro ------------------------------ */
  update(dt: number, camera: THREE.Camera, meX: number, meZ: number): void {
    this.time += dt;
    this.hitSfxT -= dt;
    const B = this.st();
    if (this.ver !== B.ver) {
      this.ver = B.ver;
      this.hpVer = B.hpVer;
      this.sync(meX, meZ);
      this.hpSync(meX, meZ);
    } else if (this.hpVer !== B.hpVer) {
      this.hpVer = B.hpVer;
      this.hpSync(meX, meZ);
    } else this.hpSync(meX, meZ);
    // animações (pop-in e tremidas)
    for (const id of this.anim) {
      const pv = this.recs.get(id);
      if (!pv) {
        this.anim.delete(id);
        continue;
      }
      pv.shake = Math.max(0, pv.shake - dt);
      const done = (pv.born < 0 || this.time - pv.born > 0.45) && pv.shake <= 0;
      if (done) pv.born = -1;
      this.write(id, pv);
      if (done) this.anim.delete(id);
    }
    this.updGates(dt, meX, meZ);
    // chamas
    const fl = 0.85 + Math.sin(this.time * 17) * 0.08 + Math.sin(this.time * 31) * 0.05;
    this.glowM.opacity = fl;
    this.updBars(camera, meX, meZ);
    this.updGhost();
  }
  private updGates(dt: number, meX: number, meZ: number): void {
    for (const p of this.st().pieces) {
      const pv = this.recs.get(p.id);
      const G = pv?.gate;
      if (!pv || !G) continue;
      let best = 2.4;
      let side = G.side;
      const ax = Math.cos(pv.rot);
      const az = -Math.sin(pv.rot);
      for (const pl of this.sim.players) {
        if (pl.faint > 0) continue;
        const d = Math.hypot(pl.x - p.x, pl.z - p.z);
        if (d < best) {
          best = d;
          side = Math.sign((pl.x - p.x) * ax + (pl.z - p.z) * az) || 1;
        }
      }
      const want = best < 2.4;
      if (want && !G.want) {
        G.side = side;
        if (Math.hypot(p.x - meX, p.z - meZ) < 14) sfx.door();
      }
      G.want = want;
      const tgt = want ? 1 : 0;
      G.open += (tgt - G.open) * Math.min(1, dt * (want ? 7 : 4));
      const a = G.open * 1.3 * G.side;
      G.l.rotation.y = a;
      G.r.rotation.y = Math.PI - a;
    }
  }
  private updBars(camera: THREE.Camera, meX: number, meZ: number): void {
    const list: { p: BPiece; d: number }[] = [];
    for (const p of this.st().pieces) {
      const def = PIECES[p.k];
      if (p.hp >= def.hp - 0.01) continue;
      const d = Math.hypot(p.x - meX, p.z - meZ);
      if (d < 20) list.push({ p, d });
    }
    list.sort((a, b) => a.d - b.d);
    const n = Math.min(48, list.length);
    for (let i = 0; i < n; i++) {
      const p = list[i].p;
      const def = PIECES[p.k];
      const pv = this.recs.get(p.id);
      const f = Math.max(0, p.hp / def.hp);
      const y = (pv?.y ?? 0) + Math.min(def.h, 2.2) + 0.45;
      this.barBg.setMatrixAt(i, _m.compose(_p.set(p.x, y, p.z), camera.quaternion, _s.set(1, 1, 1)));
      // barra cheia à esquerda: desloca no espaço da câmera
      _p.set(-0.5, 0, 0).applyQuaternion(camera.quaternion);
      this.barFg.setMatrixAt(i, _m.compose(_s.set(p.x + _p.x, y + _p.y, p.z + _p.z), camera.quaternion, _p.set(Math.max(0.02, f), 1, 1)));
      this.barFg.setColorAt(i, _c.set(f > 0.6 ? '#5aff7a' : f > 0.3 ? '#ffd34a' : '#ff4a5e'));
    }
    this.barBg.count = n;
    this.barFg.count = n;
    this.barBg.instanceMatrix.needsUpdate = true;
    this.barFg.instanceMatrix.needsUpdate = true;
    if (this.barFg.instanceColor) this.barFg.instanceColor.needsUpdate = true;
  }

  /* ------------------------------ fantasma ------------------------------ */
  private updGhost(): void {
    const g = this.ghost;
    let used = 0;
    let tn = 0;
    const W = this.sim.w;
    const pulse = 0.45 + Math.sin(this.time * 7) * 0.15;
    for (const k in this.gMat) this.gMat[k].opacity = k === 'ok' || k === 'bad' ? 0.62 + Math.sin(this.time * 5) * 0.08 : pulse + 0.1;
    if (g) {
      const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
        let m = this.gMeshes[used];
        if (!m) {
          m = new THREE.Mesh(geo, mat);
          m.renderOrder = 3;
          this.gMeshes.push(m);
          this.gGroup.add(m);
        }
        m.geometry = geo;
        m.material = mat;
        m.visible = true;
        used++;
        return m;
      };
      for (const c of g.cells) {
        const geo = pieceGeo(c.kind, c.shape).geo;
        const m = mesh(geo, g.mode === 'place' ? (c.ok ? this.gMat.ok : this.gMat.bad) : this.gMat[g.mode]);
        const y = W.height(c.x, c.z);
        m.position.set(c.x, y + 0.02, c.z);
        m.rotation.set(0, c.rot, 0);
        m.scale.setScalar(1);
        if (tn < 24) {
          this.tiles.setMatrixAt(tn, _m.compose(_p.set(c.x, y + 0.05, c.z), _q.identity(), _s.set(1, 1, 1)));
          this.tiles.setColorAt(tn, _c.set(g.mode !== 'place' ? (g.mode === 'del' ? '#ff4a5e' : g.mode === 'fix' ? '#ffd34a' : '#7ad0ff') : c.ok ? '#6dffa8' : '#ff4a5e'));
          tn++;
        }
      }
      for (const id of g.hl) {
        const pv = this.recs.get(id);
        if (!pv) continue;
        const sh = +pv.vk.split(':')[1];
        const geo = pieceGeo(pv.kind, sh).geo;
        const m = mesh(geo, this.gMat[g.mode === 'place' ? 'bad' : g.mode]);
        m.position.set(pv.x, pv.y + 0.01, pv.z);
        m.rotation.set(0, pv.rot, 0);
        m.scale.setScalar(1.06 + Math.sin(this.time * 7) * 0.02);
        if (tn < 24) {
          this.tiles.setMatrixAt(tn, _m.compose(_p.set(pv.x, pv.y + 0.05, pv.z), _q.identity(), _s.set(1, 1, 1)));
          this.tiles.setColorAt(tn, _c.set(g.mode === 'del' ? '#ff4a5e' : g.mode === 'fix' ? '#ffd34a' : '#7ad0ff'));
          tn++;
        }
      }
      if (g.mode !== 'place' && !g.hl.length && tn < 24) {
        // ferramenta sem alvo: só o ladrilho da célula mirada
        const cx = cellOf(g.gx) * CELL;
        const cz = cellOf(g.gz) * CELL;
        this.tiles.setMatrixAt(tn, _m.compose(_p.set(cx, W.height(cx, cz) + 0.05, cz), _q.identity(), _s.set(1, 1, 1)));
        this.tiles.setColorAt(tn, _c.set('#ffffff'));
        tn++;
      }
      // grade
      this.grid.visible = !g.free;
      if (!g.free) {
        const cx = cellOf(g.gx) * CELL;
        const cz = cellOf(g.gz) * CELL;
        this.grid.position.set(cx, W.height(cx, cz) + 0.045, cz);
        this.gridU.c.value.set(g.gx, g.gz);
      }
      // motivo
      if (g.reason) {
        if (this.whyK !== g.reason) {
          if (this.why) this.why.visible = false;
          let sp = this.spriteCache.get(g.reason);
          if (!sp) {
            sp = iconSprite(bic(g.reason, 48), '#ffffff');
            sp.renderOrder = 21;
            (sp.material as THREE.SpriteMaterial).depthTest = false;
            this.spriteCache.set(g.reason, sp);
            this.scene.add(sp);
          }
          this.why = sp;
          this.whyK = g.reason;
        }
        const w = this.why!;
        w.visible = true;
        w.position.set(g.rx, W.height(g.rx, g.rz) + 2.3 + Math.sin(this.time * 4) * 0.1, g.rz);
        w.scale.setScalar(1.1);
      } else if (this.why) this.why.visible = false;
    } else {
      this.grid.visible = false;
      if (this.why) this.why.visible = false;
      this.whyK = '';
    }
    for (let i = used; i < this.gMeshes.length; i++) this.gMeshes[i].visible = false;
    this.tiles.count = tn;
    this.tiles.instanceMatrix.needsUpdate = true;
    if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
  }

  /** onde a peça está (para o controlador) */
  rec(id: number): { x: number; z: number; y: number } | undefined {
    return this.recs.get(id);
  }

  dispose(): void {
    for (const m of [this.body, this.glow, this.crack]) for (const v of m.values()) v.dispose();
    for (const pv of this.recs.values()) if (pv.gate) this.scene.remove(pv.gate.g);
    this.scene.remove(this.gGroup, this.tiles, this.grid, this.barBg, this.barFg);
    for (const s of this.spriteCache.values()) this.scene.remove(s);
    this.recs.clear();
  }
}
