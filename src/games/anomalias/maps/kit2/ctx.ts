/* ============================================================
 *  ANOMALIAS — kit dos mapas "Lanchonete" e "Posto 24h".
 *  MapCtx monta o cenário em CAMADAS (sala × material) que viram UMA
 *  malha mesclada cada; a luz da noite é "assada" na cor dos vértices
 *  (luminárias = pontos de luz com alcance, por sala → nada vaza pela
 *  parede), então o custo em tempo real é só Lambert + 1 luz ambiente.
 *  Uma lanterna do núcleo (luz real) soma por cima normalmente.
 *
 *  Convenções: metros, Y para cima. Personagens/objetos "olham" para +Z
 *  com rotação 0. `spawn.yaw` é o rotation.y da câmera (0 = olhando −Z).
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../../../3d/common/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnomalyKind, AnomalySlot, InteractDef, MapBuild, RoomDef, Vec3 } from '../types';

export type Tier = 0 | 1 | 2 | 3;

export interface LightPt {
  x: number;
  y: number;
  z: number;
  col: THREE.Color;
  /** intensidade (1 ≈ luminária de teto comum) */
  i: number;
  /** alcance (m) — some suave até lá */
  reach: number;
  /** raio do "núcleo" (m): até aqui a luz quase não cai */
  core: number;
  /** quanto ignora a direção da face (0 = Lambert, 1 = ilumina tudo igual) */
  flat: number;
  /** luminária que só joga luz para baixo (forro fica na penumbra) */
  down?: boolean;
}

export interface MatDef {
  map?: THREE.Texture;
  /** repetições por metro do UV projetado */
  uv?: number;
  /** sem luz assada (neon, telas) → MeshBasic */
  glow?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  /** desenha depois (vidro, decalques) */
  order?: number;
  alphaTest?: number;
  depthWrite?: boolean;
  /** polygonOffset negativo (decalque colado) */
  decal?: boolean;
  /** mistura aditiva (halos, feixes de luz) */
  additive?: boolean;
  /** mantém o UV da geometria (quads com a textura inteira: sombras, halos, placas) */
  rawUv?: boolean;
}

/**
 * GeoBuilder do kit: `colored()` junta uma geometria que já tem cor por vértice (carros,
 * Bloops) e, com `rawUv`, `geo()` mantém o UV original (quads com a textura inteira).
 */
export class KitBuilder extends GeoBuilder {
  rawUv = false;
  private raw: THREE.BufferGeometry[] = [];
  private prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') ng.deleteAttribute(k);
    return ng;
  }
  override geo(g: THREE.BufferGeometry, col: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    if (!this.rawUv) return super.geo(g, col, x, y, z, rx, ry, rz);
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = this.prep(g);
    if (!ng.getAttribute('uv')) ng.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ng.getAttribute('position').count * 2), 2));
    const n = ng.getAttribute('position').count;
    const c = new Float32Array(n * 3);
    _c.set(col).convertSRGBToLinear();
    for (let i = 0; i < n; i++) (c[i * 3] = _c.r), (c[i * 3 + 1] = _c.g), (c[i * 3 + 2] = _c.b);
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.raw.push(ng);
    return this;
  }
  /** geometria com cor própria (já posicionada); `tint` multiplica a cor */
  colored(g: THREE.BufferGeometry, tint?: string): this {
    const ng = this.prep(g.clone());
    const pos = ng.getAttribute('position');
    const nor = ng.getAttribute('normal');
    const uv = new Float32Array(pos.count * 2);
    const us = this.uvScale;
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i));
      const ay = Math.abs(nor.getY(i));
      const az = Math.abs(nor.getZ(i));
      if (ay >= ax && ay >= az) (uv[i * 2] = pos.getX(i) * us), (uv[i * 2 + 1] = pos.getZ(i) * us);
      else if (ax >= az) (uv[i * 2] = pos.getZ(i) * us), (uv[i * 2 + 1] = pos.getY(i) * us);
      else (uv[i * 2] = pos.getX(i) * us), (uv[i * 2 + 1] = pos.getY(i) * us);
    }
    ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (!ng.getAttribute('color')) ng.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.count * 3).fill(1), 3));
    if (tint) {
      _c.set(tint).convertSRGBToLinear();
      const ca = ng.getAttribute('color') as THREE.BufferAttribute;
      for (let i = 0; i < ca.count; i++) ca.setXYZ(i, ca.getX(i) * _c.r, ca.getY(i) * _c.g, ca.getZ(i) * _c.b);
    }
    this.raw.push(ng);
    return this;
  }
  override get empty(): boolean {
    return super.empty && !this.raw.length;
  }
  override build(): THREE.BufferGeometry {
    const parts = this.raw;
    this.raw = [];
    if (!super.empty) parts.push(super.build());
    const g = parts.length ? mergeGeometries(parts, false)! : new THREE.BufferGeometry();
    for (const p of parts) p.dispose();
    g.computeBoundingSphere();
    return g;
  }
}

interface Layer {
  room: string;
  key: string;
  gb: KitBuilder;
}

interface RoomState {
  def: RoomDef;
  amb: THREE.Color;
  outdoor: boolean;
  /** multiplicador de luz da sala (anomalia 'light') */
  k: number;
  tint: THREE.Color;
  flicker: number;
  mats: THREE.Material[];
}

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();

/** luz assada nos vértices (cor *= ambiente + Σ luzes) */
export function bakeGeo(geo: THREE.BufferGeometry, lights: LightPt[], amb: THREE.Color, m?: THREE.Matrix4, floorBox?: { min: Vec3; max: Vec3 } | null): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const col = geo.getAttribute('color') as THREE.BufferAttribute;
  if (!pos || !nor || !col) return;
  if (m) _nm.getNormalMatrix(m);
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nor, i);
    if (m) {
      _v.applyMatrix4(m);
      _n.applyMatrix3(_nm).normalize();
    }
    let r = amb.r;
    let g = amb.g;
    let b = amb.b;
    for (const L of lights) {
      const dx = L.x - _v.x;
      const dy = L.y - _v.y;
      const dz = L.z - _v.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > L.reach * L.reach) continue;
      const d = Math.sqrt(d2) || 1e-4;
      const ndl = Math.max(0, ((_n.x * dx + _n.y * dy + _n.z * dz) / d + 0.15) / 1.15);
      const dn = L.down ? 0.08 + 0.92 * Math.min(1, Math.max(0, (dy / d) * 1.5)) : 1;
      const fall = 1 / (1 + Math.max(0, d - L.core) ** 2 / 2.4);
      const t = Math.min(1, Math.max(0, (d - L.reach * 0.55) / (L.reach * 0.45)));
      const a = L.i * fall * dn * (1 - t * t * (3 - 2 * t)) * (ndl * (1 - L.flat) + L.flat);
      r += L.col.r * a;
      g += L.col.g * a;
      b += L.col.b * a;
    }
    // canto escuro do piso junto às paredes (oclusão barata)
    if (floorBox && _n.y > 0.9 && _v.y < 0.06) {
      const e = Math.min(_v.x - floorBox.min.x, floorBox.max.x - _v.x, _v.z - floorBox.min.z, floorBox.max.z - _v.z);
      const k = 0.62 + 0.38 * Math.min(1, Math.max(0, e / 0.7));
      r *= k;
      g *= k;
      b *= k;
    }
    // compressão suave (nada estoura em branco)
    const mx = Math.max(r, g, b);
    if (mx > 1.15) {
      const s = (1.15 + (mx - 1.15) * 0.35) / mx;
      r *= s;
      g *= s;
      b *= s;
    }
    col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
  }
  col.needsUpdate = true;
}

export interface WallHole {
  /** centro ao longo da parede (m, a partir do início) */
  at: number;
  w: number;
  y0: number;
  y1: number;
}
export interface WallOpts {
  h?: number;
  t?: number;
  /** cor de cada lado [lado −, lado +] (lado − = menor x/z) */
  col?: [string, string];
  /** barrado inferior (cor por lado) — '' = sem */
  low?: [string, string];
  lowH?: number;
  mat?: [string, string];
  holes?: WallHole[];
  collide?: boolean;
  /** rodapé */
  base?: boolean;
}

export class MapCtx {
  readonly root = new THREE.Group();
  readonly rooms: RoomDef[] = [];
  readonly colliders: { min: Vec3; max: Vec3 }[] = [];
  readonly slots: AnomalySlot[] = [];
  readonly interacts: InteractDef[] = [];
  readonly npcSpots: MapBuild['npcSpots'] = [];
  readonly lights: (LightPt & { rooms: string[] })[] = [];
  private groups = new Map<string, THREE.Group>();
  private sees = new Map<string, string[]>();
  /** grupo de uma sala (o que só se vê de perto: camadas e peças da sala) */
  roomGroup(room: string): THREE.Group {
    let g = this.groups.get(room);
    if (!g) {
      g = new THREE.Group();
      g.name = 'sala:' + room;
      this.root.add(g);
      this.groups.set(room, g);
    }
    return g;
  }
  /** de dentro de `room` só se enxergam estas salas (paredes sem janela escondem o resto) */
  see(room: string, rooms: string[]): void {
    this.sees.set(room, [room, ...rooms]);
  }
  /** referências entre módulos do mesmo mapa (portas, mesas…) */
  readonly refs = new Map<string, THREE.Object3D>();
  private rs = new Map<string, RoomState>();
  private layers = new Map<string, Layer>();
  private matDefs = new Map<string, MatDef>();
  private mats = new Map<string, THREE.Material>();
  private disp = new Set<{ dispose(): void }>();
  private updaters: ((dt: number, t: number) => void)[] = [];
  private time = 0;
  power = true;
  readonly ambient: THREE.AmbientLight;

  constructor(readonly tier: Tier) {
    // "Lambert × luz ambiente π" = cor assada exata
    this.ambient = new THREE.AmbientLight(0xffffff, Math.PI);
    this.root.add(this.ambient);
    this.root.name = 'anomap';
    // camada global (sombras de contato, vidros): uma chamada de desenho para o mapa todo
    const def: RoomDef = { id: '_all', name: '', min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 }, cams: [] };
    this.rs.set('_all', { def, amb: new THREE.Color(0, 0, 0), outdoor: true, k: 1, tint: new THREE.Color(1, 1, 1), flicker: 0, mats: [] });
  }
  /** material efetivo: nos níveis baixos madeira/inox viram cor lisa (menos materiais e chamadas) */
  private mkey(key: string): string {
    if (this.tier <= 1 && (key === 'wood' || key === 'steel' || key === 'plate')) return 'vc';
    return key;
  }
  private mroom(room: string, key: string): string {
    return key === 'shadow' || key === 'glass' ? '_all' : room;
  }

  /* ------------------------------ salas e luzes ------------------------------ */
  room(id: string, name: string, min: [number, number, number], max: [number, number, number], amb: string, ambK = 1, outdoor = false): RoomDef {
    const def: RoomDef = { id, name, min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] }, cams: [] };
    this.rooms.push(def);
    this.rs.set(id, { def, amb: new THREE.Color(amb).multiplyScalar(ambK), outdoor, k: 1, tint: new THREE.Color(1, 1, 1), flicker: 0, mats: [] });
    return def;
  }
  /** câmera de segurança da sala (canto alto) */
  cam(room: string, pos: [number, number, number], look: [number, number, number]): void {
    this.rs.get(room)!.def.cams.push({ pos: { x: pos[0], y: pos[1], z: pos[2] }, look: { x: look[0], y: look[1], z: look[2] } });
  }
  light(rooms: string[], x: number, y: number, z: number, col: string, i = 1, reach = 8, core = 0.6, flat = 0.15, down = false): LightPt {
    const L = { x, y, z, col: new THREE.Color(col), i, reach, core, flat, rooms, down };
    this.lights.push(L);
    return L;
  }
  roomAmb(room: string): THREE.Color {
    return this.rs.get(room)!.amb;
  }
  lightsFor(room: string): LightPt[] {
    return this.lights.filter((l) => l.rooms.includes(room));
  }

  /* ------------------------------ materiais e camadas ------------------------------ */
  defMat(key: string, d: MatDef): void {
    this.matDefs.set(key, d);
    if (d.map) this.disp.add(d.map);
  }
  /** material de uma sala (cada sala tem as suas instâncias: piscar/apagar por sala) */
  mat(room: string, key: string): THREE.Material {
    key = this.mkey(key);
    room = this.mroom(room, key);
    const mk = room + '|' + key;
    let m = this.mats.get(mk);
    if (m) return m;
    const d = this.matDefs.get(key) ?? {};
    const common = {
      map: d.map ?? null,
      vertexColors: true,
      transparent: !!d.transparent,
      opacity: d.opacity ?? 1,
      side: d.side ?? THREE.FrontSide,
      alphaTest: d.alphaTest ?? 0,
      depthWrite: d.depthWrite ?? !d.transparent,
    };
    if (d.glow) {
      const b = new THREE.MeshBasicMaterial(common);
      b.toneMapped = false;
      m = b;
    } else m = new THREE.MeshLambertMaterial(common);
    if (d.additive) {
      m.blending = THREE.AdditiveBlending;
      m.depthWrite = false;
    }
    if (d.decal) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -2;
      m.polygonOffsetUnits = -2;
    }
    m.userData.glow = !!d.glow;
    m.userData.base = 1;
    this.mats.set(mk, m);
    this.rs.get(room)?.mats.push(m);
    this.disp.add(m);
    return m;
  }
  /** material próprio (quadro, tela) entra no controle de energia/luz da sala */
  adopt(room: string, m: THREE.Material, glow = false, baseCol?: THREE.Color): THREE.Material {
    m.userData.glow = glow;
    if (baseCol) {
      m.userData.baseCol = baseCol;
      (m as THREE.MeshLambertMaterial).color.copy(baseCol);
    }
    this.rs.get(room)?.mats.push(m);
    this.disp.add(m);
    return m;
  }
  /**
   * Quadro/tela/placa: plano com a textura inteira. glow = acende sozinho (tela, letreiro);
   * senão recebe a luz assada da sala. Origem no centro; olha para +Z girado por ry.
   */
  picture(room: string, tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, ry = 0, glow = false, parent: THREE.Object3D = this.roomGroup(room)): THREE.Mesh {
    const pg = new THREE.PlaneGeometry(w, h, glow ? 1 : 2, glow ? 1 : 2);
    const n = pg.getAttribute('position').count;
    pg.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
    const mat = glow ? new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }) : new THREE.MeshLambertMaterial({ map: tex, vertexColors: true });
    if (glow) mat.toneMapped = false;
    this.adopt(room, mat, glow);
    this.disp.add(tex);
    const m = new THREE.Mesh(pg, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    if (!glow) this.bakeMesh(room, m);
    this.disp.add(pg);
    return m;
  }
  isGlow(key: string): boolean {
    return !!this.matDefs.get(this.mkey(key))?.glow;
  }
  /** construtor da camada (sala, material) — tudo vira uma malha no final */
  g(room: string, key = 'vc'): KitBuilder {
    const uvKey = key;
    key = this.mkey(key);
    room = this.mroom(room, key);
    const k = room + '|' + key;
    let L = this.layers.get(k);
    if (!L) {
      const gb = new KitBuilder();
      gb.rawUv = !!this.matDefs.get(key)?.rawUv;
      this.tune(gb, uvKey);
      L = { room, key, gb };
      this.layers.set(k, L);
    }
    return L.gb;
  }
  /** construtor solto (peças de anomalia, tarefas) */
  gb(key = 'vc'): KitBuilder {
    const gb = new KitBuilder();
    gb.rawUv = !!this.matDefs.get(key)?.rawUv;
    this.tune(gb, key);
    return gb;
  }
  /** detalhe por nível: bisel só nas peças grandes nos níveis baixos (triângulos!) */
  private tune(gb: GeoBuilder, key: string): void {
    gb.uvScale = this.matDefs.get(key)?.uv ?? 1;
    gb.bevel = this.tier === 0 ? 0 : this.tier >= 2 ? 2 : 1;
    gb.minBevel = this.tier >= 3 ? 0.025 : this.tier === 2 ? 0.05 : 0.14;
  }
  /** geometria solta → malha posicionada, com a luz da sala assada na posição final */
  mesh(room: string, gb: GeoBuilder | THREE.BufferGeometry, key: string, x = 0, y = 0, z = 0, ry = 0, parent: THREE.Object3D = this.roomGroup(room)): THREE.Mesh {
    const geo = gb instanceof GeoBuilder ? gb.build() : gb;
    const m = new THREE.Mesh(geo, this.mat(room, key));
    m.position.set(x, y, z);
    m.rotation.y = ry;
    parent.add(m);
    m.updateWorldMatrix(true, false);
    if (!this.isGlow(key)) this.bakeMesh(room, m);
    this.disp.add(geo);
    return m;
  }
  /** assa a luz numa geometria já posicionada (usa a matriz do objeto no mundo) */
  bakeMesh(room: string, m: THREE.Mesh, geo: THREE.BufferGeometry = m.geometry): void {
    m.updateWorldMatrix(true, false);
    bakeGeo(geo, this.lightsFor(room), this.roomAmb(room), m.matrixWorld);
  }
  /** geometria extra (variações) assada como se estivesse no lugar de `m` */
  bakeAs(room: string, m: THREE.Object3D, geo: THREE.BufferGeometry): THREE.BufferGeometry {
    m.updateWorldMatrix(true, false);
    bakeGeo(geo, this.lightsFor(room), this.roomAmb(room), m.matrixWorld);
    this.disp.add(geo);
    return geo;
  }
  /** luz assada num ponto (para tingir instâncias: produtos, bolinhas) */
  lightAt(room: string, x: number, y: number, z: number, nx = 0, ny = 1, nz = 0): THREE.Color {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x, y, z], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, ny, nz], 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1], 3));
    bakeGeo(g, this.lightsFor(room), this.roomAmb(room));
    const c = g.getAttribute('color');
    const out = new THREE.Color(c.getX(0), c.getY(0), c.getZ(0));
    g.dispose();
    return out;
  }
  track<T extends { dispose(): void }>(o: T): T {
    this.disp.add(o);
    return o;
  }
  onUpdate(f: (dt: number, t: number) => void): void {
    this.updaters.push(f);
  }

  /* ------------------------------ colisão ------------------------------ */
  box(x0: number, z0: number, x1: number, z1: number, y0 = 0, y1 = 3): void {
    this.colliders.push({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y1, z: Math.max(z0, z1) } });
  }
  /** colisão de um objeto de largura w (x) e profundidade d (z) centrado em (x,z), girado em ry múltiplo de 90° */
  boxAt(x: number, z: number, w: number, d: number, ry = 0, h = 1.2): void {
    const q = Math.round(ry / (Math.PI / 2)) % 2 !== 0;
    const hw = (q ? d : w) / 2;
    const hd = (q ? w : d) / 2;
    this.box(x - hw, z - hd, x + hw, z + hd, 0, h);
  }

  /* ------------------------------ paredes ------------------------------ */
  /**
   * Parede alinhada a um eixo, de (x0,z0) a (x1,z1), com furos (portas/janelas).
   * Cada face pertence à sua sala (luz assada sem vazar): rooms = [lado −, lado +].
   */
  wall(rooms: [string, string], x0: number, z0: number, x1: number, z1: number, o: WallOpts = {}): void {
    const h = o.h ?? 3.2;
    const t = o.t ?? 0.16;
    const alongX = Math.abs(z1 - z0) < 1e-6;
    const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
    const sx = alongX ? Math.min(x0, x1) : x0;
    const sz = alongX ? z0 : Math.min(z0, z1);
    const holes = (o.holes ?? []).slice().sort((a, b) => a.at - b.at);
    const cols = o.col ?? ['#e8e2d6', '#e8e2d6'];
    const lows = o.low ?? ['', ''];
    const lowH = o.lowH ?? 1.05;
    const mats = o.mat ?? ['wall', 'wall'];
    // spans [a,b,y0,y1]
    const spans: [number, number, number, number][] = [];
    let cur = 0;
    for (const hl of holes) {
      const a = hl.at - hl.w / 2;
      const b = hl.at + hl.w / 2;
      if (a > cur) spans.push([cur, a, 0, h]);
      if (hl.y0 > 0) spans.push([a, b, 0, hl.y0]);
      if (hl.y1 < h) spans.push([a, b, hl.y1, h]);
      cur = b;
    }
    if (cur < len) spans.push([cur, len, 0, h]);
    for (let side = 0; side < 2; side++) {
      const room = rooms[side];
      if (!room) continue;
      const g = this.g(room, mats[side]);
      const sgn = side === 0 ? -1 : 1;
      const off = (sgn * t) / 4;
      for (const [a, b, y0, y1] of spans) {
        const L = b - a;
        if (L < 0.005 || y1 - y0 < 0.005) continue;
        const cx = alongX ? sx + (a + b) / 2 : sx + off;
        const cz = alongX ? sz + off : sz + (a + b) / 2;
        const segH = (ya: number, yb: number, col: string) => {
          if (yb - ya < 0.005) return;
          const bg = new THREE.BoxGeometry(alongX ? L : t / 2, yb - ya, alongX ? t / 2 : L, Math.max(1, Math.ceil(L / 0.6)), Math.max(1, Math.ceil((yb - ya) / 0.6)), 1);
          bg.translate(0, (yb - ya) / 2, 0);
          g.geo(bg, col, cx, ya, cz);
        };
        if (lows[side] && y0 < lowH) {
          segH(y0, Math.min(y1, lowH), lows[side]);
          segH(Math.max(y0, lowH), y1, cols[side]);
        } else segH(y0, y1, cols[side]);
      }
      // rodapé e friso (só nos trechos que tocam o chão)
      const dg = this.g(room, 'vc');
      for (const [a, b, y0, y1] of spans) {
        const L = b - a;
        if (L < 0.05) continue;
        const cx = alongX ? sx + (a + b) / 2 : sx + sgn * (t / 2 + 0.012);
        const cz = alongX ? sz + sgn * (t / 2 + 0.012) : sz + (a + b) / 2;
        if (o.base !== false && y0 === 0) dg.sharp(alongX ? L : 0.024, 0.1, alongX ? 0.024 : L, cx, 0, cz, '#5a4a44');
        if (lows[side] && y0 < lowH && y1 > lowH) dg.sharp(alongX ? L : 0.03, 0.05, alongX ? 0.03 : L, cx, lowH - 0.02, cz, '#f6efe2');
      }
    }
    if (o.collide !== false) {
      let c0 = 0;
      const doors = holes.filter((hl) => hl.y0 <= 0.01);
      const add = (a: number, b: number) => {
        if (b - a < 0.01) return;
        if (alongX) this.box(sx + a, sz - t / 2, sx + b, sz + t / 2, 0, h);
        else this.box(sx - t / 2, sz + a, sx + t / 2, sz + b, 0, h);
      };
      for (const d of doors) {
        add(c0, d.at - d.w / 2);
        c0 = d.at + d.w / 2;
      }
      add(c0, len);
    }
  }

  /** chão/teto quadriculado em pedaços (luz assada precisa de vértices) */
  floor(room: string, key: string, x0: number, z0: number, x1: number, z1: number, col = '#ffffff', y = 0, ceiling = false, step = 0.5): void {
    const w = x1 - x0;
    const d = z1 - z0;
    const pg = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(d / step)));
    pg.rotateX(ceiling ? Math.PI / 2 : -Math.PI / 2);
    const g = this.g(room, key);
    const ao = g.ao;
    g.ao = false;
    g.geo(pg, col, (x0 + x1) / 2, y, (z0 + z1) / 2);
    g.ao = ao;
  }

  /* ------------------------------ montagem final ------------------------------ */
  finish(id: string, spawn: { pos: Vec3; yaw: number }, extra: Partial<MapBuild> = {}): MapBuild {
    for (const L of this.layers.values()) {
      if (L.gb.empty) continue;
      const geo = L.gb.build();
      if (!this.isGlow(L.key)) {
        const st = this.rs.get(L.room)!;
        bakeGeo(geo, this.lightsFor(L.room), st.amb, undefined, st.outdoor ? null : st.def);
      }
      const m = new THREE.Mesh(geo, this.mat(L.room, L.key));
      const d = this.matDefs.get(L.key);
      if (d?.order) m.renderOrder = d.order;
      m.name = L.room + ':' + L.key;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      (L.room === '_all' ? this.root : this.roomGroup(L.room)).add(m);
      this.disp.add(geo);
    }
    this.layers.clear();
    this.fixAnchors();
    const self = this;
    return {
      id,
      root: this.root,
      rooms: this.rooms,
      spawn,
      colliders: this.colliders,
      slots: this.slots,
      interacts: this.interacts,
      npcSpots: this.npcSpots,
      visibleFrom(p: Vec3) {
        self.cullFrom(p);
      },
      setPower(on: boolean) {
        self.power = on;
        self.refreshRooms();
      },
      update(dt: number) {
        self.time += dt;
        for (const f of self.updaters) f(dt, self.time);
        self.tickRooms();
      },
      dispose() {
        self.root.removeFromParent();
        for (const d of self.disp) d.dispose();
        self.disp.clear();
      },
      ...extra,
    };
  }

  private viewer = new THREE.Vector3(1e9, 0, 0);
  /**
   * Porta automática: gira um filho interno da folha (o pivô continua livre para a
   * anomalia 'door'). Abre quando a última posição de visibleFrom() está a menos de r m.
   */
  autoDoor(piv: THREE.Object3D, angle: number, cx: number, cz: number, r = 2.3): void {
    const inner = new THREE.Group();
    for (const c of [...piv.children]) inner.add(c);
    piv.add(inner);
    this.onUpdate((dt) => {
      const near = Math.hypot(this.viewer.x - cx, this.viewer.z - cz) < r;
      const t = near ? angle : 0;
      inner.rotation.y += (t - inner.rotation.y) * Math.min(1, dt * 6);
    });
  }
  /** posição de uma câmera que vai desenhar (só a do jogador, abaixo de 2,6 m, conta para as portas) */
  hint(p: Vec3): void {
    if (p.y < 2.6) this.viewer.set(p.x, p.y, p.z);
  }
  private cullFrom(p: Vec3): void {
    this.hint(p);
    const r = this.rooms.find((d) => p.x >= d.min.x && p.x <= d.max.x && p.z >= d.min.z && p.z <= d.max.z && p.y >= d.min.y - 0.5 && p.y <= d.max.y + 0.5);
    const list = r ? this.sees.get(r.id) : undefined;
    for (const [id, g] of this.groups) g.visible = !list || list.includes(id);
  }

  /**
   * Âncora da foto (v1.1): se o centro do objeto cai dentro de um colisor (porta fechada no vão,
   * objeto encostado na parede), puxa o ponto para dentro da sala, para o raio da foto enxergá-lo.
   */
  private fixAnchors(): void {
    const b = new THREE.Box3();
    const c = new THREE.Vector3();
    const inside = (p: THREE.Vector3) => this.colliders.some((k) => p.x > k.min.x - 0.05 && p.x < k.max.x + 0.05 && p.z > k.min.z - 0.05 && p.z < k.max.z + 0.05 && p.y > k.min.y && p.y < k.max.y);
    this.root.updateMatrixWorld(true);
    for (const s of this.slots) {
      if (s.anchor) continue;
      b.setFromObject(s.object);
      if (b.isEmpty()) continue;
      b.getCenter(c);
      if (!inside(c)) continue;
      const r = this.rs.get(s.room)!.def;
      const tx = (r.min.x + r.max.x) / 2;
      const tz = (r.min.z + r.max.z) / 2;
      const d = Math.hypot(tx - c.x, tz - c.z) || 1;
      for (let k = 1; k <= 12 && inside(c); k++) {
        c.x += ((tx - c.x) / d) * 0.1;
        c.z += ((tz - c.z) / d) * 0.1;
      }
      s.anchor = { x: c.x, y: c.y, z: c.z };
    }
  }

  /* ------------------------------ luz por sala (energia / anomalia) ------------------------------ */
  /** anomalia de luz da sala: k = brilho (1 normal), tint = cor, flicker = 0 nada, 1 piscando */
  setRoomLight(room: string, k: number, tint = '#ffffff', flicker = 0): void {
    const st = this.rs.get(room);
    if (!st) return;
    st.k = k;
    st.tint.set(tint);
    st.flicker = flicker;
    this.applyRoom(st, 1);
  }
  private refreshRooms(): void {
    for (const st of this.rs.values()) this.applyRoom(st, 1);
  }
  private tickRooms(): void {
    for (const st of this.rs.values()) {
      if (!st.flicker) continue;
      const t = this.time;
      // piscada irregular de lâmpada com mau contato
      const n = Math.sin(t * 23.1) * Math.sin(t * 7.3 + 1.2) + Math.sin(t * 3.1) * 0.6;
      const f = n > 0.55 ? 0.18 : n > 0.35 ? 0.55 : 1;
      this.applyRoom(st, f);
    }
  }
  private applyRoom(st: RoomState, f: number): void {
    const pw = this.power ? 1 : st.outdoor ? 0.55 : 0.16;
    for (const m of st.mats) {
      const mm = m as THREE.MeshLambertMaterial;
      const glow = m.userData.glow as boolean;
      if (m.userData.keep) continue;
      const k = (glow ? (this.power ? 1 : 0.12) : pw) * st.k * f;
      _c.copy(st.tint).multiplyScalar(k);
      if (m.userData.baseCol) _c.multiply(m.userData.baseCol as THREE.Color);
      mm.color.copy(_c);
    }
  }
}

/* ------------------------------ ajudantes de anomalia ------------------------------ */

export type ApplyFn = (on: boolean, v: number) => void;

/** cria um ponto de anomalia; cada tipo tem sua função (variação = v % variações) */
export function addSlot(ctx: MapCtx, id: string, room: string, object: THREE.Object3D, fns: Partial<Record<AnomalyKind, ApplyFn>>, variants = 3): AnomalySlot {
  const kinds = Object.keys(fns) as AnomalyKind[];
  const s: AnomalySlot = {
    id,
    room,
    kinds,
    object,
    variants,
    apply(kind, on, variant) {
      const f = fns[kind];
      if (f) f(on, Math.abs(variant | 0));
    },
  };
  object.userData.slot = id;
  ctx.slots.push(s);
  return s;
}

/** guarda o estado do objeto para restaurar ao desligar */
function snap(o: THREE.Object3D): () => void {
  const p = o.position.clone();
  const r = o.rotation.clone();
  const s = o.scale.clone();
  const vis = o.visible;
  return () => {
    o.position.copy(p);
    o.rotation.copy(r);
    o.scale.copy(s);
    o.visible = vis;
  };
}

export const A = {
  /** some */
  hide(o: THREE.Object3D): ApplyFn {
    return (on) => (o.visible = !on);
  },
  /** desloca (variações = lista de [dx,dy,dz,dRy]) */
  move(o: THREE.Object3D, offs: [number, number, number, number?][]): ApplyFn {
    const back = snap(o);
    return (on, v) => {
      back();
      if (!on) return;
      const [dx, dy, dz, dr] = offs[v % offs.length];
      o.position.x += dx;
      o.position.y += dy;
      o.position.z += dz;
      o.rotation.y += dr ?? 0;
    };
  },
  /** gira (variações = [rx, ry, rz, dy]) — dy compensa o "de cabeça pra baixo" */
  rot(o: THREE.Object3D, rots: [number, number, number, number?][]): ApplyFn {
    const back = snap(o);
    return (on, v) => {
      back();
      if (!on) return;
      const [rx, ry, rz, dy] = rots[v % rots.length];
      o.rotation.x += rx;
      o.rotation.y += ry;
      o.rotation.z += rz;
      o.position.y += dy ?? 0;
    };
  },
  scale(o: THREE.Object3D, ks: number[]): ApplyFn {
    const back = snap(o);
    return (on, v) => {
      back();
      if (on) o.scale.multiplyScalar(ks[v % ks.length]);
    };
  },
  /** mostra um dos objetos (pré-montados e escondidos) */
  show(list: THREE.Object3D[]): ApplyFn {
    for (const o of list) o.visible = false;
    return (on, v) => {
      for (const o of list) o.visible = false;
      if (on) list[v % list.length].visible = true;
    };
  },
  /** troca o objeto por outro (esconde o original, mostra a variação) */
  swap(o: THREE.Object3D, list: THREE.Object3D[]): ApplyFn {
    const sh = A.show(list);
    return (on, v) => {
      o.visible = !on;
      sh(on, v);
    };
  },
  /** troca a geometria da malha (cores/rostos alternativos, já assados) */
  geo(m: THREE.Mesh, list: THREE.BufferGeometry[]): ApplyFn {
    const base = m.geometry;
    return (on, v) => {
      m.geometry = on ? list[v % list.length] : base;
    };
  },
  /** troca o material */
  mat(m: THREE.Mesh, list: THREE.Material[]): ApplyFn {
    const base = m.material;
    return (on, v) => {
      m.material = on ? list[v % list.length] : base;
    };
  },
  /** troca a textura do material (quadro / tela / placa) */
  tex(mat: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial, list: THREE.Texture[]): ApplyFn {
    const base = mat.map;
    return (on, v) => {
      mat.map = on ? list[v % list.length] : base;
      mat.needsUpdate = true;
    };
  },
  /** várias funções juntas */
  all(...fs: ApplyFn[]): ApplyFn {
    return (on, v) => {
      for (const f of fs) f(on, v);
    };
  },
  /** escolhe uma função por variação */
  pick(...fs: ApplyFn[]): ApplyFn {
    let last = -1;
    return (on, v) => {
      const i = v % fs.length;
      if (last >= 0 && last !== i) fs[last](false, 0);
      fs[i](on, 0);
      last = on ? i : -1;
    };
  },
};

/** animação ligada/desligada pela anomalia (tremer = "som", girar, flutuar…) */
export function anim(ctx: MapCtx, o: THREE.Object3D, f: (o: THREE.Object3D, t: number, v: number) => void): ApplyFn {
  let on = false;
  let v = 0;
  const back = snap(o);
  ctx.onUpdate((_dt, t) => {
    if (!on) return;
    back();
    f(o, t, v);
  });
  return (o2, v2) => {
    on = o2;
    v = v2;
    back();
  };
}
/** "som estranho vindo dali": o objeto treme de leve (o núcleo toca o som na posição do objeto) */
export function buzz(ctx: MapCtx, o: THREE.Object3D, amp = 0.012, hint = 'buzz'): ApplyFn {
  o.userData.soundHint = hint;
  return anim(ctx, o, (oo, t) => {
    const k = Math.sin(t * 9) > 0.2 ? 1 : 0;
    oo.position.x += Math.sin(t * 61) * amp * k;
    oo.rotation.z += Math.sin(t * 53) * amp * 2 * k;
  });
}
