/* ============================================================
 *  HOSPITAL — kit de construção: caixas/cilindros com UV em metros,
 *  colisores, paredes com vãos de porta, portas com dobradiça, lâmpadas
 *  (painel emissivo + poça de luz falsa), "assar" a geometria estática
 *  (uma malha por material) e o ajudante de pontos de anomalia.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnomalyKind, AnomalySlot, Vec3 } from '../types';
import { poolTex } from './tex';

export type Box = { min: Vec3; max: Vec3 };

/** UV em metros para BoxGeometry (cada face: u/v = tamanho real / tile) */
export function boxGeo(w: number, h: number, d: number, tile = 0, vFull = false): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  if (!tile) return g;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // ordem das faces: +x, -x, +y, -y, +z, -z (4 vértices cada)
  const dims: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++)
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, vFull && f !== 2 && f !== 3 ? uv.getY(k) : (uv.getY(k) * dims[f][1]) / tile);
    }
  uv.needsUpdate = true;
  return g;
}

const DYN = 'dyn';
export const markDyn = <T extends THREE.Object3D>(o: T): T => {
  o.userData[DYN] = true;
  return o;
};

export interface Lamp {
  group: THREE.Group;
  panel: THREE.Mesh;
  pool: THREE.Mesh | null;
  room: string;
  /** a criança apagou (tarefa) */
  user: boolean;
  mode: 'normal' | 'flicker' | 'red' | 'off' | 'blue';
  flickOn: boolean;
  flickT: number;
}

export interface Door {
  pivot: THREE.Group;
  open: number;
  room: string;
  col: Box;
  /** colisor da folha aberta (fica rente à parede) */
  leafCol: Box;
  set(state: -1 | 0 | 1): void;
}

export class Kit {
  readonly root = new THREE.Group();
  readonly colliders: Box[] = [];
  readonly slots: AnomalySlot[] = [];
  readonly lamps: Lamp[] = [];
  readonly doors: Door[] = [];
  private mats = new Map<string, THREE.Material>();
  private geos: THREE.BufferGeometry[] = [];
  readonly textures: THREE.Texture[] = [];
  private poolT: THREE.Texture;
  readonly lampOn: THREE.MeshBasicMaterial;
  readonly lampOff: THREE.MeshLambertMaterial;
  readonly lampRed: THREE.MeshBasicMaterial;
  readonly lampBlue: THREE.MeshBasicMaterial;
  readonly poolMat: THREE.MeshBasicMaterial;
  power = true;
  /** material único das cores sólidas assadas (cor por vértice) */
  readonly vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(readonly tier: number) {
    this.poolT = this.keep(poolTex());
    this.lampOn = new THREE.MeshBasicMaterial({ color: '#f4f8ff' });
    this.lampOff = new THREE.MeshLambertMaterial({ color: '#5a5e6e' });
    this.lampRed = new THREE.MeshBasicMaterial({ color: '#ff3355' });
    this.lampBlue = new THREE.MeshBasicMaterial({ color: '#4d7bff' });
    this.poolMat = new THREE.MeshBasicMaterial({ map: this.poolT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  }

  keep<T extends THREE.Texture>(t: T): T {
    this.textures.push(t);
    return t;
  }
  geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geos.push(g);
    return g;
  }
  /** material Lambert em cache (cor, textura opcional) */
  lam(color: string, map?: THREE.Texture, key = ''): THREE.MeshLambertMaterial {
    const k = 'L' + color + (map ? map.uuid : '') + key;
    let m = this.mats.get(k) as THREE.MeshLambertMaterial | undefined;
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color, map: map ?? null });
      this.mats.set(k, m);
    }
    return m;
  }
  basic(color: string, map?: THREE.Texture, key = ''): THREE.MeshBasicMaterial {
    const k = 'B' + color + (map ? map.uuid : '') + key;
    let m = this.mats.get(k) as THREE.MeshBasicMaterial | undefined;
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, map: map ?? null });
      this.mats.set(k, m);
    }
    return m;
  }
  /** material próprio (quadros/telas que trocam de textura) */
  own(map: THREE.Texture, basic = false): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial {
    return basic ? new THREE.MeshBasicMaterial({ map }) : new THREE.MeshLambertMaterial({ map });
  }

  /** caixa com a BASE em y (centro em x,z) */
  box(p: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, tile = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.geo(boxGeo(w, h, d, tile)), m);
    o.position.set(x, y + h / 2, z);
    o.rotation.y = ry;
    p.add(o);
    return o;
  }
  /** cilindro com a base em y */
  cyl(p: THREE.Object3D, m: THREE.Material, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 10): THREE.Mesh {
    const o = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(rt, rb, h, seg)), m);
    o.position.set(x, y + h / 2, z);
    p.add(o);
    return o;
  }
  sph(p: THREE.Object3D, m: THREE.Material, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 12): THREE.Mesh {
    const o = new THREE.Mesh(this.geo(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 4))), m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    p.add(o);
    return o;
  }
  /** plano vertical virado para +Z local (quadros, telas) */
  plane(p: THREE.Object3D, m: THREE.Material, w: number, h: number, x: number, y: number, z: number, ry = 0): THREE.Mesh {
    const o = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(w, h)), m);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    p.add(o);
    return o;
  }

  /** grupo dinâmico (não é assado) num pai, posição local */
  group(p: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Group {
    const g = markDyn(new THREE.Group());
    g.position.set(x, y, z);
    g.rotation.y = ry;
    p.add(g);
    return g;
  }

  /* ------------------------------ colisão ------------------------------ */
  col(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 3): Box {
    const b = { min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) } };
    this.colliders.push(b);
    return b;
  }
  /** caixa local de um grupo (rotação 0/90/180/270) → mundo */
  colIn(o: THREE.Object3D, x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 3): Box {
    o.updateWorldMatrix(true, false);
    const a = new THREE.Vector3(x0, y0, z0).applyMatrix4(o.matrixWorld);
    const b = new THREE.Vector3(x1, y1, z1).applyMatrix4(o.matrixWorld);
    return this.col(a.x, a.z, b.x, b.z, Math.min(a.y, b.y), Math.max(a.y, b.y));
  }
  /** ponto local → mundo */
  w(o: THREE.Object3D, x: number, y: number, z: number): Vec3 {
    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3(x, y, z).applyMatrix4(o.matrixWorld);
    return { x: v.x, y: v.y, z: v.z };
  }

  /* ------------------------------ paredes ------------------------------ */
  /** parede ao longo de X em z, de x0 a x1, com vãos [centro, largura] (verga acima de 2,25 m) */
  wallX(m: THREE.Material, z: number, x0: number, x1: number, gaps: [number, number][] = [], H = 3, T = 0.2): void {
    const gs = [...gaps].sort((a, b) => a[0] - b[0]);
    let cur = x0;
    const seg = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 0.01) return;
      const o = new THREE.Mesh(this.geo(boxGeo(b - a, y1 - y0, T, 2, true)), m);
      o.position.set((a + b) / 2, (y0 + y1) / 2, z);
      this.root.add(o);
      if (y0 < 1) this.col(a, z - T / 2, b, z + T / 2, y0, y1);
      this.fixWallUV(o, y0, y1, H);
    };
    for (const [c, wd] of gs) {
      seg(cur, c - wd / 2, 0, H);
      seg(c - wd / 2, c + wd / 2, 2.25, H);
      cur = c + wd / 2;
    }
    seg(cur, x1, 0, H);
  }
  wallZ(m: THREE.Material, x: number, z0: number, z1: number, gaps: [number, number][] = [], H = 3, T = 0.2): void {
    const gs = [...gaps].sort((a, b) => a[0] - b[0]);
    let cur = z0;
    const seg = (a: number, b: number, y0: number, y1: number) => {
      if (b - a < 0.01) return;
      const o = new THREE.Mesh(this.geo(boxGeo(T, y1 - y0, b - a, 2, true)), m);
      o.position.set(x, (y0 + y1) / 2, (a + b) / 2);
      this.root.add(o);
      if (y0 < 1) this.col(x - T / 2, a, x + T / 2, b, y0, y1);
      this.fixWallUV(o, y0, y1, H);
    };
    for (const [c, wd] of gs) {
      seg(cur, c - wd / 2, 0, H);
      seg(c - wd / 2, c + wd / 2, 2.25, H);
      cur = c + wd / 2;
    }
    seg(cur, z1, 0, H);
  }
  /** v da textura da parede = altura absoluta / H (verga continua o desenho da parede) */
  private fixWallUV(o: THREE.Mesh, y0: number, y1: number, H: number): void {
    const uv = o.geometry.getAttribute('uv') as THREE.BufferAttribute;
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue;
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        const v = uv.getY(k);
        uv.setY(k, (y0 + v * (y1 - y0)) / H);
      }
    }
    uv.needsUpdate = true;
  }

  /** batente + folha da porta. Vão em (gx, wz) na parede ao longo de X; `into` = -1 (norte) / +1 (sul). */
  door(room: string, gx: number, wz: number, into: -1 | 1, wd: number, leafCol: string, frameM: THREE.Material): Door {
    const T = 0.26;
    this.box(this.root, frameM, 0.09, 2.25, T, gx - wd / 2 - 0.02, 0, wz);
    this.box(this.root, frameM, 0.09, 2.25, T, gx + wd / 2 + 0.02, 0, wz);
    this.box(this.root, frameM, wd + 0.22, 0.1, T, gx, 2.22, wz);
    const pivot = this.group(this.root, gx - wd / 2 + 0.03, 0, wz);
    const L = wd - 0.08;
    const leaf = this.lam(leafCol);
    this.box(pivot, leaf, L, 2.15, 0.05, L / 2, 0.02, 0);
    this.box(pivot, this.lam('#1d2a40'), 0.28, 0.42, 0.06, L / 2, 1.35, 0); // visor
    this.box(pivot, this.lam('#c8ccd8'), 0.14, 0.04, 0.14, L - 0.12, 1.0, 0); // maçaneta
    const open = (into * Math.PI) / 2 * -1;
    pivot.rotation.y = open;
    const col = { min: { x: gx - wd / 2, y: 0, z: wz - 0.06 }, max: { x: gx + wd / 2, y: 2.2, z: wz + 0.06 } };
    // folha aberta: perpendicular à parede, para dentro da sala
    const hx = gx - wd / 2;
    const leafColB = { min: { x: hx - 0.05, y: 0, z: into < 0 ? wz - L : wz }, max: { x: hx + 0.08, y: 2.2, z: into < 0 ? wz : wz + L } };
    this.colliders.push(leafColB);
    const d: Door = {
      pivot,
      open,
      room,
      col,
      leafCol: leafColB,
      set: (st) => {
        const i = this.colliders.indexOf(col);
        if (st === 0) {
          pivot.rotation.y = 0;
          if (i < 0) this.colliders.push(col);
        } else {
          pivot.rotation.y = st === 1 ? open * 0.35 : open;
          if (i >= 0) this.colliders.splice(i, 1);
        }
      },
    };
    this.doors.push(d);
    return d;
  }

  /** lâmpada de teto (painel + moldura + poça de luz no chão), dinâmica */
  lamp(room: string, x: number, z: number, w = 1.2, d = 0.5, H = 3, pool = true): Lamp {
    const g = this.group(this.root, x, 0, z);
    this.box(this.root, this.lam('#d8dce6'), w + 0.12, 0.05, d + 0.12, x, H - 0.06, z);
    const panel = this.box(g, this.lampOn, w, 0.03, d, 0, H - 0.085, 0);
    let pm: THREE.Mesh | null = null;
    if (pool) {
      pm = new THREE.Mesh(this.geo(new THREE.PlaneGeometry(1, 1)), this.poolMat);
      pm.rotation.x = -Math.PI / 2;
      pm.position.set(0, 0.015, 0);
      pm.scale.set(w * 3.4, d * 5.6 + 1.2, 1);
      pm.renderOrder = 1;
      g.add(pm);
    }
    const l: Lamp = { group: g, panel, pool: pm, room, user: true, mode: 'normal', flickOn: true, flickT: 0 };
    this.lamps.push(l);
    return l;
  }
  refreshLamp(l: Lamp): void {
    const lit = this.power && l.user && l.mode !== 'off' && (l.mode !== 'flicker' || l.flickOn);
    l.panel.material = !lit ? this.lampOff : l.mode === 'red' ? this.lampRed : l.mode === 'blue' ? this.lampBlue : this.lampOn;
    if (l.pool) l.pool.visible = lit && l.mode !== 'red' && l.mode !== 'blue';
  }
  updateLamps(dt: number): void {
    for (const l of this.lamps) {
      if (l.mode !== 'flicker') continue;
      l.flickT -= dt;
      if (l.flickT <= 0) {
        l.flickOn = !l.flickOn;
        l.flickT = l.flickOn ? 0.05 + Math.random() * 0.5 : 0.04 + Math.random() * 0.12;
        this.refreshLamp(l);
      }
    }
  }
  setPower(on: boolean): void {
    this.power = on;
    for (const l of this.lamps) this.refreshLamp(l);
  }

  /* ------------------------------ anomalias ------------------------------ */
  /**
   * Ponto de anomalia padrão. Transformações (move/rotate/scale) são relativas à pose inicial;
   * 'color' pinta as malhas marcadas com userData.paint (ou todas).
   */
  slot(
    id: string,
    room: string,
    obj: THREE.Object3D,
    o: {
      kinds: AnomalyKind[];
      move?: [number, number, number?][];
      colors?: string[];
      pic?: { mesh: THREE.Mesh; tex: THREE.Texture[] };
      extra?: THREE.Object3D[];
      swap?: THREE.Object3D;
      lamp?: Lamp;
      door?: Door;
      npc?: string;
      minNight?: number;
      anchor?: Vec3;
      variants?: number;
      /** altura do objeto (virar de ponta-cabeça) */
      h?: number;
    },
  ): AnomalySlot {
    markDyn(obj);
    const basePos = obj.position.clone();
    const baseRot = obj.rotation.clone();
    const baseScale = obj.scale.clone();
    // malhas pintáveis: medidas na 1ª vez (depois do compact)
    let paint: THREE.Mesh[] | null = null;
    let orig: THREE.Material[] = [];
    const paintList = (): THREE.Mesh[] => {
      if (paint) return paint;
      const p: THREE.Mesh[] = [];
      obj.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh && m.userData.paint) p.push(m);
      });
      if (!p.length)
        obj.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh && m !== o.pic?.mesh) p.push(m);
        });
      orig = p.map((m) => m.material as THREE.Material);
      paint = p;
      return p;
    };
    for (const e of o.extra ?? []) {
      markDyn(e);
      e.visible = false;
    }
    if (o.swap) {
      markDyn(o.swap);
      o.swap.visible = false;
    }
    const nv = o.variants ?? Math.max(1, o.move?.length ?? 0, o.colors?.length ?? 0, o.pic ? o.pic.tex.length - 1 : 0, o.extra?.length ?? 0, 2);
    let h = o.h ?? 0;
    const s: AnomalySlot = {
      id,
      room,
      kinds: o.kinds,
      object: obj,
      variants: nv,
      npc: o.npc,
      minNight: o.minNight,
      anchor: o.anchor,
      apply: (kind, on, v) => {
        switch (kind) {
          case 'move': {
            obj.position.copy(basePos);
            obj.rotation.copy(baseRot);
            if (on && o.move?.length) {
              const [dx, dz, ry] = o.move[v % o.move.length];
              obj.position.x += dx;
              obj.position.z += dz;
              obj.rotation.y += ry ?? 0;
            }
            break;
          }
          case 'missing':
            obj.visible = !on;
            break;
          case 'extra':
            if (o.extra?.length) o.extra[v % o.extra.length].visible = on;
            break;
          case 'swap':
            obj.visible = !on;
            if (o.swap) o.swap.visible = on;
            break;
          case 'color': {
            const cs = o.colors ?? ['#ff3b5c', '#45d16b', '#3f6bff', '#ffcf2e'];
            paintList().forEach((m, i) => (m.material = on ? this.lam(cs[v % cs.length]) : orig[i]));
            break;
          }
          case 'scale':
            obj.scale.copy(baseScale);
            if (on) obj.scale.multiplyScalar([1.7, 0.5, 1.4][v % 3]);
            break;
          case 'rotate':
            obj.position.copy(basePos);
            obj.rotation.copy(baseRot);
            if (on) {
              if (v % 2 === 0) {
                if (!h) {
                  const b = new THREE.Box3().setFromObject(obj);
                  h = b.isEmpty() ? 0.5 : b.max.y - b.min.y;
                }
                obj.rotation.z = Math.PI;
                obj.position.y += h;
              } else obj.rotation.y += Math.PI * 0.5;
            }
            break;
          case 'picture':
            if (o.pic) {
              const m = o.pic.mesh.material as THREE.MeshLambertMaterial;
              m.map = o.pic.tex[on ? 1 + (v % (o.pic.tex.length - 1)) : 0];
              m.needsUpdate = true;
            }
            break;
          case 'light':
            if (o.lamp) {
              o.lamp.mode = on ? (['flicker', 'red', 'off', 'blue'] as const)[v % 4] : 'normal';
              o.lamp.flickOn = true;
              this.refreshLamp(o.lamp);
            }
            break;
          case 'door':
            o.door?.set(on ? ((v % 2) as 0 | 1) : -1);
            break;
          default:
            break;
        }
      },
    };
    this.slots.push(s);
    return s;
  }

  /* ------------------------------ assar ------------------------------ */
  /** junta toda geometria estática por material (poucas chamadas de desenho) */
  bake(): void {
    this.root.updateMatrixWorld(true);
    const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const kill: THREE.Mesh[] = [];
    const visit = (o: THREE.Object3D) => {
      if (o.userData[DYN]) return;
      const m = o as THREE.Mesh;
      if (m.isMesh && !Array.isArray(m.material)) {
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
        let key: THREE.Material = m.material;
        const lm = m.material as THREE.MeshLambertMaterial;
        if (lm.isMeshLambertMaterial && !lm.map && !lm.transparent && lm.emissive.getHex() === 0) {
          // cor sólida → cor por vértice: todas viram UMA malha
          const n = g.getAttribute('position').count;
          const col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) {
            col[i * 3] = lm.color.r;
            col[i * 3 + 1] = lm.color.g;
            col[i * 3 + 2] = lm.color.b;
          }
          g.setAttribute('color', new THREE.BufferAttribute(col, 3));
          key = this.vcMat;
        }
        const list = by.get(key) ?? [];
        list.push(g);
        by.set(key, list);
        kill.push(m);
      }
      for (const c of o.children) visit(c);
    };
    for (const c of this.root.children) visit(c);
    for (const m of kill) m.removeFromParent();
    for (const [mat, list] of by) {
      // índices: mergeGeometries exige todos indexados ou todos não
      const ready = list.every((g) => g.index) ? list : list.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(ready, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      this.geos.push(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    // geometria original das malhas estáticas não é mais usada
  }

  /** junta as malhas de um grupo dinâmico (por material) — menos chamadas por objeto */
  compact(g: THREE.Object3D, keep: THREE.Object3D[] = []): void {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
    const by = new Map<string, { mat: THREE.Material; paint: boolean; list: THREE.Mesh[] }>();
    for (const c of g.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || keep.includes(m) || Array.isArray(m.material) || !m.visible) continue;
      let mat = m.material as THREE.Material;
      const lm = mat as THREE.MeshLambertMaterial;
      const vc = !m.userData.paint && lm.isMeshLambertMaterial && !lm.map && !lm.transparent && lm.emissive.getHex() === 0;
      if (vc) mat = this.vcMat;
      const key = mat.uuid + (m.userData.paint ? 'p' : '');
      const e = by.get(key) ?? { mat, paint: !!m.userData.paint, list: [] };
      e.list.push(m);
      by.set(key, e);
    }
    for (const e of by.values()) {
      if (e.list.length < 2) continue;
      const geos = e.list.map((m) => {
        const gg = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        for (const k of Object.keys(gg.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') gg.deleteAttribute(k);
        const out = gg.index ? gg.toNonIndexed() : gg;
        if (e.mat === this.vcMat) {
          const c = (m.material as THREE.MeshLambertMaterial).color;
          const n = out.getAttribute('position').count;
          const col = new Float32Array(n * 3);
          for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
          out.setAttribute('color', new THREE.BufferAttribute(col, 3));
        }
        return out;
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      this.geos.push(merged);
      const mm = new THREE.Mesh(merged, e.mat);
      if (e.paint) mm.userData.paint = true;
      g.add(mm);
      for (const m of e.list) m.removeFromParent();
    }
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const t of this.textures) t.dispose();
    this.mats.forEach((m) => m.dispose());
    this.lampOn.dispose();
    this.lampOff.dispose();
    this.lampRed.dispose();
    this.lampBlue.dispose();
    this.poolMat.dispose();
    this.vcMat.dispose();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mm = m.material as THREE.Material;
        if (mm && !this.isShared(mm)) mm.dispose();
      }
    });
  }
  private isShared(m: THREE.Material): boolean {
    for (const v of this.mats.values()) if (v === m) return true;
    return false;
  }
}
