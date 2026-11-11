/* ============================================================
 *  NIGHTKIT — montador de mapas das Anomalias (creche, cabanas).
 *  - "baldes" de geometria por (zona, material): cada sala vira poucas
 *    malhas mescladas (≈ 6–9 chamadas de desenho por sala)
 *  - paredes com recortes de porta/janela, rodapé, meia-parede, moldura,
 *    batentes; colisores gerados junto
 *  - peças soltas (alvos de anomalia) com o mesmo sistema de materiais
 *  - luz assada (bake.ts), halos/poças de luz aditivos, sombras de contato
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../../../3d/common/geo';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AnomalyKind, AnomalySlot, InteractDef, MapBuild, RoomDef, Vec3 } from '../types';
import { Baker, type BakeLight, type LightGroup } from './bake';
import { glowTex } from './tex';

export type Tier = 0 | 1 | 2 | 3;

export interface MatDef {
  map?: THREE.Texture;
  normal?: THREE.Texture;
  /** repetições da textura por metro (UV projetado no mundo) */
  uv?: number;
  color?: THREE.ColorRepresentation;
  side?: THREE.Side;
  transparent?: boolean;
  opacity?: number;
  /** sem luz (lâmpadas, telas, janelas de noite) */
  basic?: boolean;
  /** some quando a energia cai (lâmpadas principais) */
  power?: boolean;
  alphaTest?: number;
  depthWrite?: boolean;
  /** cor por vértice (padrão: sim) */
  vc?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveMap?: THREE.Texture;
  polygonOffset?: number;
}

type Handler = (on: boolean) => void;
export type KindMap = Partial<Record<AnomalyKind, Handler[]>>;

export interface SlotSpec {
  id: string;
  room: string;
  object: THREE.Object3D;
  kinds: KindMap;
  /** som que o núcleo deve tocar no lugar enquanto a anomalia estiver ligada */
  sound?: string;
  /** (v1.1) NPC do núcleo (id de npcSpots) — os tipos podem vir com lista vazia [] */
  npc?: string;
  minNight?: number;
  anchor?: Vec3;
}

const _v = new THREE.Vector3();

export type G = (key: string) => GeoBuilder;

export class MapKit {
  readonly root = new THREE.Group();
  readonly baker = new Baker();
  readonly rooms: RoomDef[] = [];
  readonly colliders: { min: Vec3; max: Vec3 }[] = [];
  readonly slots: AnomalySlot[] = [];
  readonly interacts: InteractDef[] = [];
  readonly npcSpots: MapBuild['npcSpots'] = [];
  private mats = new Map<string, THREE.Material>();
  private matUv = new Map<string, number>();
  private zones = new Map<string, Map<string, GeoBuilder>>();
  private zoneGroups = new Map<string, THREE.Group>();
  private powerMats: { m: THREE.MeshBasicMaterial; on: THREE.Color; off: THREE.Color }[] = [];
  private powerObjs: THREE.Object3D[] = [];
  private anims = new Set<(dt: number, t: number) => void>();
  private time = 0;
  private shadowList: number[] = [];
  readonly roomBox = new Map<string, THREE.Box3>();
  private disposables: { dispose(): void }[] = [];
  /**
   * Visibilidade por sala (PVS): sala onde a câmera está → zonas desenhadas.
   * Sem entrada = tudo. Peças soltas entram na zona da sala onde estão.
   */
  pvs: Record<string, string[]> = {};
  /** zonas cujas peças soltas (detalhes) são desenhadas, por sala da câmera (padrão: só a própria) */
  near: Record<string, string[]> = {};
  private details = new Map<string, THREE.Group>();
  /** vãos entre zonas (portas, arcos, janelas internas) — corte por portal */
  readonly portals: { a: string; b: string; box: THREE.Box3; walk: boolean }[] = [];
  /** vãos mais longe que isto (m) não abrem a sala do outro lado (janelas de casinhas ao longe) */
  portalDist = 1e9;
  portal(a: string, b: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, walk = true): void {
    if (this.xf) {
      const [ax, az] = this.wxz(x0, z0);
      const [bx, bz] = this.wxz(x1, z1);
      [x0, z0, x1, z1] = [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
      y0 = this.wy(y0);
      y1 = this.wy(y1);
    }
    this.portals.push({ a, b, walk, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  }
  /** subgrupo de detalhes da zona (peças soltas: só desenhadas de perto) */
  detail(zone: string): THREE.Group {
    let d = this.details.get(zone);
    if (!d) {
      d = new THREE.Group();
      d.name = 'detail:' + zone;
      this.zoneGroup(zone).add(d);
      this.details.set(zone, d);
    }
    return d;
  }
  /** segmentos do bisel (nível 0: 1) */
  readonly bevel: number;

  constructor(
    readonly id: string,
    readonly tier: Tier,
  ) {
    this.root.name = 'map:' + id;
    this.bevel = tier === 0 ? 1 : 2;
  }

  /* ------------------------------ bloco local (casinha girada) ------------------------------ */
  private xf: { cx: number; cz: number; y0: number; ry: number; c: number; s: number; id: number } | null = null;
  private xfN = 0;
  private xBuilders: { zone: string; key: string; b: GeoBuilder; m: THREE.Matrix4; id: number }[] = [];
  /**
   * A partir daqui as coordenadas são LOCAIS a (cx, y0, cz) girado de ry (múltiplo de 90°):
   * g(), part(), mesh(), halo(), pool(), light(), solid(), portal(), shadow(), room(), npc(),
   * interact().at, inst() e place() convertem sozinhos. Feche com end().
   */
  begin(cx: number, cz: number, ry: number, y0 = 0): void {
    this.xf = { cx, cz, y0, ry, c: Math.cos(ry), s: Math.sin(ry), id: ++this.xfN };
  }
  end(): void {
    this.xf = null;
  }
  /** local → mundo (x, z) */
  wxz(x: number, z: number): [number, number] {
    const f = this.xf;
    if (!f) return [x, z];
    return [f.cx + x * f.c + z * f.s, f.cz - x * f.s + z * f.c];
  }
  wy(y: number): number {
    return y + (this.xf?.y0 ?? 0);
  }
  wry(ry: number): number {
    return ry + (this.xf?.ry ?? 0);
  }
  /** posiciona um objeto (coordenadas locais do bloco atual) */
  place(o: THREE.Object3D, x: number, y: number, z: number, ry = 0): THREE.Object3D {
    const [a, b] = this.wxz(x, z);
    o.position.set(a, this.wy(y), b);
    o.rotation.y = this.wry(ry);
    return o;
  }
  private quarter(): boolean {
    return !!this.xf && (Math.round(this.xf.ry / (Math.PI / 2)) & 1) === 1;
  }

  /* ------------------------------ materiais ------------------------------ */
  def(key: string, d: MatDef): THREE.Material {
    let m: THREE.Material;
    if (d.basic) {
      const bm = new THREE.MeshBasicMaterial({ vertexColors: d.vc ?? true, map: d.map ?? null, color: d.color ?? 0xffffff, transparent: !!d.transparent, opacity: d.opacity ?? 1, side: d.side ?? THREE.FrontSide, depthWrite: d.depthWrite ?? true, toneMapped: false, alphaTest: d.alphaTest ?? 0 });
      if (d.power) this.powerMats.push({ m: bm, on: bm.color.clone(), off: bm.color.clone().multiplyScalar(0.12) });
      m = bm;
    } else {
      const o: THREE.MeshLambertMaterialParameters = { vertexColors: d.vc ?? true, color: d.color ?? 0xffffff, side: d.side ?? THREE.FrontSide, transparent: !!d.transparent, opacity: d.opacity ?? 1, alphaTest: d.alphaTest ?? 0, depthWrite: d.depthWrite ?? true };
      if (d.map) o.map = d.map;
      if (d.normal && this.tier >= 2) {
        o.normalMap = d.normal;
        o.normalScale = new THREE.Vector2(0.6, 0.6);
      }
      if (d.emissive) o.emissive = new THREE.Color(d.emissive);
      if (d.emissiveMap) o.emissiveMap = d.emissiveMap;
      m = this.baker.mat(o);
    }
    if (d.polygonOffset) {
      m.polygonOffset = true;
      m.polygonOffsetFactor = -d.polygonOffset;
      m.polygonOffsetUnits = -d.polygonOffset;
    }
    this.mats.set(key, m);
    this.matUv.set(key, d.uv ?? 1);
    return m;
  }
  private aliases = new Map<string, string>();
  /** `key` passa a usar o balde/material de `target` (menos chamadas de desenho) */
  alias(key: string, target: string): void {
    this.aliases.set(key, target);
  }
  private res(key: string): string {
    return this.aliases.get(key) ?? key;
  }
  mat(key: string): THREE.Material {
    key = this.res(key);
    const m = this.mats.get(key);
    if (!m) throw new Error('material? ' + key);
    return m;
  }
  private builder(key: string): GeoBuilder {
    const b = new GeoBuilder();
    // o GeoBuilder converte sRGB→linear duas vezes (Color.set já converte); compensamos aqui
    const bb = b as unknown as { push: (...a: unknown[]) => GeoBuilder };
    const orig = bb.push;
    bb.push = function (...a: unknown[]) {
      a[1] = fixCol(a[1] as string);
      return orig.apply(this, a);
    };
    b.bevel = this.bevel;
    b.uvScale = this.matUv.get(key) ?? 1;
    return b;
  }

  /* ------------------------------ zonas (geometria estática mesclada) ------------------------------ */
  /** construtor estático da zona (sala) para o material `key` */
  g(zone: string, key: string): GeoBuilder {
    key = this.res(key);
    const f = this.xf;
    if (f) {
      let e = this.xBuilders.find((x) => x.zone === zone && x.key === key && x.id === f.id);
      if (!e) {
        if (!this.mats.has(key)) throw new Error('material? ' + key);
        const m = new THREE.Matrix4().makeRotationY(f.ry).setPosition(f.cx, f.y0, f.cz);
        e = { zone, key, b: this.builder(key), m, id: f.id };
        this.xBuilders.push(e);
      }
      return e.b;
    }
    let z = this.zones.get(zone);
    if (!z) this.zones.set(zone, (z = new Map()));
    let b = z.get(key);
    if (!b) {
      if (!this.mats.has(key)) throw new Error('material? ' + key);
      z.set(key, (b = this.builder(key)));
    }
    return b;
  }
  /** grupo (nó da cena) da zona — peças podem ser penduradas aqui direto */
  zoneGroup(zone: string): THREE.Group {
    let grp = this.zoneGroups.get(zone);
    if (!grp) {
      grp = new THREE.Group();
      grp.name = 'zone:' + zone;
      this.root.add(grp);
      this.zoneGroups.set(zone, grp);
    }
    return grp;
  }
  /** função de atalho: z('wood').box(...) */
  zone(zone: string): G {
    return (key) => this.g(zone, key);
  }

  /** peça solta (alvo de anomalia, porta, brinquedo): geometria local na origem → Group */
  part(build: (g: G) => void, x = 0, y = 0, z = 0, ry = 0, parent: THREE.Object3D = this.root, name = ''): THREE.Group {
    const bs = new Map<string, GeoBuilder>();
    build((key) => {
      key = this.res(key);
      let b = bs.get(key);
      if (!b) {
        if (!this.mats.has(key)) throw new Error('material? ' + key);
        bs.set(key, (b = this.builder(key)));
      }
      return b;
    });
    const grp = new THREE.Group();
    grp.name = name;
    for (const [key, b] of bs) {
      if (b.empty) continue;
      const mesh = new THREE.Mesh(b.build(), this.mats.get(key)!);
      mesh.userData.matKey = key;
      mesh.name = 'p:' + key;
      if ((this.mats.get(key) as THREE.MeshBasicMaterial).transparent) mesh.renderOrder = 2;
      grp.add(mesh);
    }
    if (this.xf && (parent === this.root || parent.name.startsWith('zone:') || parent.name.startsWith('detail:'))) this.place(grp, x, y, z, ry);
    else {
      grp.position.set(x, y, z);
      grp.rotation.y = ry;
    }
    parent.add(grp);
    return grp;
  }

  /** malha instanciada com material assado (geometria clonada: os atributos de luz são por instância) */
  inst(geo: THREE.BufferGeometry, key: string, xf: { x: number; y: number; z: number; ry?: number; rx?: number; rz?: number; s?: number; sx?: number; sy?: number; sz?: number; col?: THREE.ColorRepresentation }[], parent: THREE.Object3D = this.root): THREE.InstancedMesh {
    const im = new THREE.InstancedMesh(geo.clone(), this.mat(key), Math.max(1, xf.length));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const c = new THREE.Color();
    xf.forEach((t, i) => {
      const sc = t.s ?? 1;
      let [tx, tz] = [t.x, t.z];
      let ty = t.y;
      let try_ = t.ry ?? 0;
      if (parent === this.root && this.xf) {
        [tx, tz] = this.wxz(t.x, t.z);
        ty = this.wy(t.y);
        try_ = this.wry(try_);
      }
      m4.compose(_v.set(tx, ty, tz), q.setFromEuler(e.set(t.rx ?? 0, try_, t.rz ?? 0)), s.set(t.sx ?? sc, t.sy ?? sc, t.sz ?? sc));
      im.setMatrixAt(i, m4);
      if (t.col !== undefined) im.setColorAt(i, c.set(t.col));
    });
    im.count = xf.length;
    im.computeBoundingSphere();
    parent.add(im);
    return im;
  }

  /* ------------------------------ salas ------------------------------ */
  room(id: string, name: string, x0: number, z0: number, x1: number, z1: number, h: number, cams: [number, number, number, number, number, number][], y0 = 0): RoomDef {
    if (this.xf) {
      const [ax, az] = this.wxz(x0, z0);
      const [bx, bz] = this.wxz(x1, z1);
      [x0, z0, x1, z1] = [ax, az, bx, bz];
      cams = cams.map(([a, b, c, d, e, f]) => {
        const [p, q] = this.wxz(a, c);
        const [r2, s2] = this.wxz(d, f);
        return [p, this.wy(b), q, r2, this.wy(e), s2];
      });
      y0 = this.wy(y0);
    }
    const r: RoomDef = {
      id,
      name,
      min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) },
      max: { x: Math.max(x0, x1), y: y0 + h, z: Math.max(z0, z1) },
      cams: cams.map(([a, b, c, d, e, f]) => ({ pos: { x: a, y: b, z: c }, look: { x: d, y: e, z: f } })),
    };
    this.rooms.push(r);
    // caixa de luz: um pouco além do miolo da parede (meia espessura)
    this.roomBox.set(id, new THREE.Box3(new THREE.Vector3(r.min.x - 0.07, y0 - 0.3, r.min.z - 0.07), new THREE.Vector3(r.max.x + 0.07, y0 + h + 0.5, r.max.z + 0.07)));
    return r;
  }
  /** luz assada presa a uma sala (null = solta: ilumina tudo no alcance) */
  light(room: string | null, x: number, y: number, z: number, color: THREE.ColorRepresentation, i: number, r: number, g: LightGroup = 'main', down = true): void {
    [x, z] = this.wxz(x, z);
    y = this.wy(y);
    this.baker.add(x, y, z, color, i, r, g, room ? this.roomBox.get(room) : undefined, down);
  }

  /** luz assada presa a uma caixa local [x0,y0,z0,x1,y1,z1] (varanda, lado de fora) */
  lightB(bx: [number, number, number, number, number, number], x: number, y: number, z: number, color: THREE.ColorRepresentation, i: number, r: number, g: LightGroup = 'night', down = false): BakeLight {
    const [ax, az] = this.wxz(bx[0], bx[2]);
    const [bbx, bbz] = this.wxz(bx[3], bx[5]);
    const box = new THREE.Box3(new THREE.Vector3(Math.min(ax, bbx), this.wy(bx[1]), Math.min(az, bbz)), new THREE.Vector3(Math.max(ax, bbx), this.wy(bx[4]), Math.max(az, bbz)));
    [x, z] = this.wxz(x, z);
    return this.baker.add(x, this.wy(y), z, color, i, r, g, box, down);
  }

  /* ------------------------------ colisão ------------------------------ */
  solid(x0: number, z0: number, x1: number, z1: number, h = 1.2, y0 = 0): void {
    if (this.xf) {
      const [ax, az] = this.wxz(x0, z0);
      const [bx, bz] = this.wxz(x1, z1);
      [x0, z0, x1, z1] = [ax, az, bx, bz];
      y0 = this.wy(y0);
    }
    this.colliders.push({ min: { x: Math.min(x0, x1), y: y0, z: Math.min(z0, z1) }, max: { x: Math.max(x0, x1), y: y0 + h, z: Math.max(z0, z1) } });
  }
  /** colisor centrado (w × d), girado em múltiplos de 90° */
  solidC(cx: number, cz: number, w: number, d: number, ry = 0, h = 1.2, y0 = 0): void {
    if (this.xf) {
      const xf = this.xf;
      [cx, cz] = this.wxz(cx, cz);
      ry = this.wry(ry);
      y0 = this.wy(y0);
      this.xf = null;
      this.solidC(cx, cz, w, d, ry, h, y0);
      this.xf = xf;
      return;
    }
    const q = Math.round(ry / (Math.PI / 2)) & 1;
    const hw = (q ? d : w) / 2;
    const hd = (q ? w : d) / 2;
    this.solid(cx - hw, cz - hd, cx + hw, cz + hd, h, y0);
  }

  /* ------------------------------ luz falsa: halos e poças ------------------------------ */
  private haloMat = new Map<string, THREE.SpriteMaterial>();
  /** halo aditivo (brilho ao redor da lâmpada). main = apaga com a energia */
  halo(x: number, y: number, z: number, size: number, color: THREE.ColorRepresentation, main = true, parent: THREE.Object3D = this.root, opacity = 0.55): THREE.Sprite | null {
    if (parent === this.root && this.xf) {
      [x, z] = this.wxz(x, z);
      y = this.wy(y);
    }
    if (this.tier === 0 && size < 0.4) return null;
    const key = new THREE.Color(color).getHexString() + opacity;
    let m = this.haloMat.get(key);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, fog: true });
      this.haloMat.set(key, m);
      this.disposables.push(m);
    }
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.setScalar(size);
    s.renderOrder = 5;
    s.userData.noBake = true;
    parent.add(s);
    if (main) this.powerObjs.push(s);
    return s;
  }
  private poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  /** poça de luz aditiva num plano (chão: normal y; parede: rx) — liga/desliga com visible */
  pool(x: number, y: number, z: number, w: number, d: number, color: THREE.ColorRepresentation, opacity = 0.35, parent: THREE.Object3D = this.root, main = false, rot?: [number, number, number]): THREE.Mesh {
    if (parent === this.root && this.xf) {
      [x, z] = this.wxz(x, z);
      y = this.wy(y);
      if (this.quarter()) [w, d] = [d, w];
      if (rot) rot = [rot[0], this.wry(rot[1]), rot[2]];
    }
    const m = new THREE.MeshBasicMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
    this.disposables.push(m);
    const p = new THREE.Mesh(this.poolGeo, m);
    p.position.set(x, y, z);
    p.scale.set(w, 1, d);
    if (rot) p.rotation.set(rot[0], rot[1], rot[2]);
    p.renderOrder = 3;
    p.userData.noBake = true;
    parent.add(p);
    if (main) this.powerObjs.push(p);
    return p;
  }

  /* ------------------------------ sombras de contato ------------------------------ */
  shadow(x: number, z: number, rx: number, rz = rx, y = 0.004, a = 0.5): void {
    if (this.xf) {
      [x, z] = this.wxz(x, z);
      y = this.wy(y);
      if (this.quarter()) [rx, rz] = [rz, rx];
    }
    this.shadowList.push(x, y, z, rx, rz, a);
  }

  /** malha avulsa com UV próprio (quadro, tapete, placa) */
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material | string, x: number, y: number, z: number, ry = 0, parent: THREE.Object3D = this.root, rx = 0): THREE.Mesh {
    const m = new THREE.Mesh(geo, typeof mat === 'string' ? this.mat(mat) : mat);
    if (parent === this.root && this.xf) {
      [x, z] = this.wxz(x, z);
      y = this.wy(y);
      ry = this.wry(ry);
    }
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0, 'YXZ');
    parent.add(m);
    return m;
  }
  /** material avulso com textura própria (sem cor por vértice) */
  tmat(map: THREE.Texture | null, o: MatDef = {}): THREE.Material {
    const key = '_t' + this.mats.size;
    return this.def(key, { ...o, map: map ?? undefined, vc: false });
  }

  /* ------------------------------ slots / tarefas / npcs ------------------------------ */
  slot(s: SlotSpec): AnomalySlot {
    let n = 1;
    for (const k in s.kinds) n = Math.max(n, s.kinds[k as AnomalyKind]!.length);
    const kinds = Object.keys(s.kinds) as AnomalyKind[];
    const slot: AnomalySlot & { sound?: string } = {
      id: s.id,
      room: s.room,
      kinds,
      object: s.object,
      variants: n,
      apply: (kind, on, variant) => {
        const hs = s.kinds[kind];
        if (!hs || !hs.length) return;
        hs[((variant % hs.length) + hs.length) % hs.length](on);
      },
    };
    if (s.sound) slot.sound = s.sound;
    if (s.npc) slot.npc = s.npc;
    if (s.minNight) slot.minNight = s.minNight;
    if (s.anchor) slot.anchor = s.anchor;
    s.object.userData.slot = s.id;
    this.slots.push(slot);
    return slot;
  }
  /**
   * Tarefa. `states` = estados visuais do mapa; o núcleo manda 'todo' (→ 1º estado),
   * 'done' (→ último) e 'want:<item>' (→ onWant). Os nomes próprios continuam valendo.
   */
  interact(d: InteractDef & { states?: string[]; onWant?: (item: string) => void }): void {
    if (this.xf) {
      const [x, z] = this.wxz(d.at.x, d.at.z);
      d.at = { x, y: this.wy(d.at.y), z };
    }
    const own = d.setState;
    const st = d.states;
    if (own && st?.length)
      d.setState = (s: string) => {
        if (s === 'todo') own(st[0]);
        else if (s === 'done') own(st[st.length - 1]);
        else if (s.startsWith('want:')) d.onWant?.(s.slice(5));
        else own(s);
      };
    this.interacts.push(d);
  }
  /**
   * Lugar de NPC (o núcleo desenha o Bloop). `yaw` aqui é na convenção dos modelos do mapa
   * (frente = +z); convertido para a do contrato (frente = −z com yaw 0).
   */
  npc(id: string, room: string, x: number, y: number, z: number, yaw: number, pose: 'stand' | 'sit' | 'lie', look: { color?: string; scale?: number; hat?: string } = {}): void {
    [x, z] = this.wxz(x, z);
    y = this.wy(y);
    yaw = this.wry(yaw) + Math.PI;
    this.npcSpots.push({ id, room, pos: { x, y, z }, yaw, pose, ...look });
  }

  /** animação por quadro (ventilador, móbile, fogo); devolve função para remover */
  anim(f: (dt: number, t: number) => void): () => void {
    this.anims.add(f);
    return () => this.anims.delete(f);
  }

  /* ------------------------------ navegação do Bocudo (v1.1) ------------------------------ */
  /** pontos extras por sala; com `chain`, ligados em sequência (trilha) e os vãos ao mais próximo */
  readonly navPts: Record<string, { pts: Vec3[]; chain: boolean }> = {};
  navAdd(room: string, pts: [number, number][], chain = false, y = 0): void {
    const e = (this.navPts[room] ??= { pts: [], chain });
    e.chain = e.chain || chain;
    for (const [x, z] of pts) {
      const [a, b] = this.wxz(x, z);
      e.pts.push({ x: a, y: this.wy(y), z: b });
    }
  }
  /** sem pontos próprios a sala usa o centro */
  private buildNav(): { nodes: Vec3[]; links: [number, number][] } {
    const nodes: Vec3[] = [];
    const links: [number, number][] = [];
    const byRoom = new Map<string, number[]>();
    const add = (room: string, i: number) => {
      if (!byRoom.has(room)) byRoom.set(room, []);
      byRoom.get(room)!.push(i);
    };
    const chained = new Set<string>();
    for (const r of this.rooms) {
      const e = this.navPts[r.id];
      if (e && e.pts.length) {
        const first = nodes.length;
        for (const p of e.pts) {
          nodes.push(p);
          add(r.id, nodes.length - 1);
        }
        if (e.chain) {
          chained.add(r.id);
          for (let i = first; i < nodes.length - 1; i++) links.push([i, i + 1]);
        }
      } else {
        nodes.push({ x: (r.min.x + r.max.x) / 2, y: r.min.y, z: (r.min.z + r.max.z) / 2 });
        add(r.id, nodes.length - 1);
      }
    }
    const roomNodes = new Map(byRoom);
    for (const p of this.portals) {
      if (!p.walk) continue;
      const c = p.box.getCenter(new THREE.Vector3());
      const i = nodes.push({ x: c.x, y: p.box.min.y, z: c.z }) - 1;
      for (const rid of [p.a, p.b]) {
        const list = roomNodes.get(rid);
        if (!list) continue;
        if (chained.has(rid)) {
          let best = list[0];
          let bd = Infinity;
          for (const j of list) {
            const d = Math.hypot(nodes[j].x - c.x, nodes[j].z - c.z);
            if (d < bd) (bd = d), (best = j);
          }
          links.push([i, best]);
        } else for (const j of byRoom.get(rid) ?? []) links.push([i, j]);
        add(rid, i);
      }
    }
    // dentro de cada sala comum: todos os pontos se ligam
    for (const [rid, list] of byRoom) {
      if (chained.has(rid)) continue;
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) if (!links.some(([x, y]) => (x === list[a] && y === list[b]) || (x === list[b] && y === list[a]))) links.push([list[a], list[b]]);
    }
    return { nodes, links };
  }

  /* ------------------------------ fechamento ------------------------------ */
  finish(spawn: { pos: Vec3; yaw: number }, extra: Partial<MapBuild> = {}): MapBuild {
    // 1) zonas → malhas (blocos locais transformados e mesclados junto)
    const xgeo = new Map<string, THREE.BufferGeometry[]>();
    for (const e of this.xBuilders) {
      if (e.b.empty) continue;
      const geo = e.b.build();
      geo.applyMatrix4(e.m);
      const k2 = e.zone + '\u0000' + e.key;
      if (!xgeo.has(k2)) xgeo.set(k2, []);
      xgeo.get(k2)!.push(geo);
      if (!this.zones.get(e.zone)?.has(e.key)) this.g(e.zone, e.key);
    }
    for (const [zone, bs] of this.zones) {
      const grp = this.zoneGroup(zone);
      for (const [key, b] of bs) {
        const more = xgeo.get(zone + '\u0000' + key) ?? [];
        if (b.empty && !more.length) continue;
        const own = b.empty ? null : b.build();
        const list = own ? [own, ...more] : more;
        let geo = list[0];
        if (list.length > 1) {
          geo = mergeGeometries(list, false)!;
          for (const x of list) x.dispose();
          geo.computeBoundingSphere();
        }
        const mesh = new THREE.Mesh(geo, this.mats.get(key)!);
        mesh.name = zone + ':' + key;
        mesh.matrixAutoUpdate = false;
        if ((this.mats.get(key) as THREE.MeshBasicMaterial).transparent) mesh.renderOrder = 2;
        grp.add(mesh);
      }
    }
    // 2) sombras de contato (1 chamada)
    if (this.shadowList.length) {
      const n = this.shadowList.length / 6;
      const m = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false, blending: THREE.MultiplyBlending, premultipliedAlpha: true, toneMapped: false });
      const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, n);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const [x, y, z, rx, rz] = this.shadowList.slice(i * 6, i * 6 + 6);
        m4.makeScale(rx * 2, 1, rz * 2).setPosition(x, y, z);
        im.setMatrixAt(i, m4);
      }
      im.renderOrder = 1;
      im.userData.noBake = true;
      im.userData.global = true;
      im.computeBoundingSphere();
      this.root.add(im);
      this.disposables.push(m);
    }
    // 3) luz assada
    this.baker.bakeAll(this.root);
    // 4) peças soltas → zona da sala onde estão (para o corte por sala)
    const zoneSet = new Set(this.zoneGroups.values());
    for (const r of this.rooms) this.detail(r.id);
    const sorted = this.rooms.slice().sort((a, b) => vol(a) - vol(b));
    const box = new THREE.Box3();
    const ctr = new THREE.Vector3();
    for (const o of this.root.children.slice()) {
      if (zoneSet.has(o as THREE.Group) || o.userData.global) continue;
      box.setFromObject(o, false);
      if (box.isEmpty()) o.getWorldPosition(ctr);
      else box.getCenter(ctr);
      const r = sorted.find((rr) => ctr.x >= rr.min.x && ctr.x <= rr.max.x && ctr.z >= rr.min.z && ctr.z <= rr.max.z && ctr.y >= rr.min.y - 0.5 && ctr.y <= rr.max.y + 0.5);
      if (r) this.detail(r.id).attach(o);
      else {
        // fora de todas as salas (criatura na janela, árvore): sala mais próxima até 3 m
        let best: RoomDef | null = null;
        let bd = 3;
        for (const rr of this.rooms) {
          const dx = Math.max(rr.min.x - ctr.x, 0, ctr.x - rr.max.x);
          const dz = Math.max(rr.min.z - ctr.z, 0, ctr.z - rr.max.z);
          const d = Math.hypot(dx, dz);
          if (d < bd) (bd = d), (best = rr);
        }
        if (best) this.detail(best.id).attach(o);
      }
    }
    const zoneOf = new Map<string, THREE.Group[]>();
    for (const r of this.rooms) {
      const list = this.pvs[r.id];
      if (!list) continue;
      zoneOf.set(
        r.id,
        list.map((z) => this.zoneGroups.get(z)).filter((g): g is THREE.Group => !!g),
      );
    }
    const allZones = [...this.zoneGroups.values()];
    const allDet = [...this.details.entries()];
    const nearOf = new Map<string, Set<string>>();
    for (const r of this.rooms) nearOf.set(r.id, new Set(this.near[r.id] ?? [r.id]));
    let lastRoom: string | null | undefined;
    // detalhes: some de longe (camada 1 = invisível para a câmera padrão) — independe de .visible (anomalias)
    const farK = [0.7, 0.85, 1.3, 1.8][this.tier];
    const dets: { o: THREE.Object3D; ms: THREE.Object3D[]; r: number; far: boolean; c: THREE.Vector3 }[] = [];
    // cada detalhe ganha um "suporte" (Group identidade): o corte por distância mexe só no
    // suporte.visible — não briga com anomalias (.visible do objeto) nem com camadas do núcleo
    for (const [, d] of this.details)
      for (const o of d.children.slice()) {
        const hold = new THREE.Group();
        hold.name = 'hold';
        d.add(hold);
        hold.add(o);
        box.setFromObject(o, false);
        const r = box.isEmpty() ? 0.3 : box.getSize(ctr).length() / 2;
        const c = box.isEmpty() ? new THREE.Vector3() : o.worldToLocal(box.getCenter(new THREE.Vector3()));
        dets.push({ o, ms: [hold], r, far: false, c });
      }
    const wp = new THREE.Vector3();
    const frustum = new THREE.Frustum();
    const m4 = new THREE.Matrix4();
    const usePortals = this.portals.length > 0;
    const portals = this.portals;
    const zg = this.zoneGroups;
    const dg = this.details;
    const visSet = new Set<string>();
    /** zonas vistas a partir da sala `id`: atravessa até 3 vãos que estejam dentro do frustum */
    const pDist = this.portalDist;
    const camP = new THREE.Vector3();
    const portalCull = (id: string, cam: THREE.Camera) => {
      cam.getWorldPosition(camP);
      frustum.setFromProjectionMatrix(m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      visSet.clear();
      visSet.add(id);
      let front = [id];
      for (let depth = 0; depth < 3 && front.length; depth++) {
        const next: string[] = [];
        for (const z of front)
          for (const pt of portals) {
            const o = pt.a === z ? pt.b : pt.b === z ? pt.a : null;
            if (!o || visSet.has(o)) continue;
            if (!frustum.intersectsBox(pt.box)) continue;
            if (pt.box.distanceToPoint(camP) > pDist) continue;
            visSet.add(o);
            next.push(o);
          }
        front = next;
      }
      for (const [z, g] of zg) g.visible = visSet.has(z) || (!roomIds.has(z) && !z.startsWith('_'));
      for (const [z, d] of dg) d.visible = visSet.has(z);
    };
    const roomIds = new Set(this.rooms.map((r) => r.id));
    const cull = (cam: THREE.Camera) => {
      const p = cam.getWorldPosition(ctr);
      for (const e of dets) {
        if (!e.o.parent?.parent?.visible) continue;
        wp.copy(e.c);
        e.o.localToWorld(wp);
        const far = wp.distanceTo(p) > (4 + 16 * e.r) * farK;
        if (far !== e.far) {
          e.far = far;
          for (const m of e.ms) m.visible = !far;
        }
      }
      const r = sorted.find((rr) => p.x >= rr.min.x && p.x <= rr.max.x && p.z >= rr.min.z && p.z <= rr.max.z && p.y >= rr.min.y - 0.5 && p.y <= rr.max.y + 0.5);
      if (usePortals) {
        if (r) portalCull(r.id, cam);
        else for (const g of allZones) g.visible = true;
        if (!r) for (const [, d] of allDet) d.visible = true;
        return;
      }
      const id = r && zoneOf.has(r.id) ? r.id : null;
      if (id === lastRoom) return;
      lastRoom = id;
      if (!id) {
        for (const g of allZones) g.visible = true;
        for (const [, d] of allDet) d.visible = true;
        return;
      }
      const vis = zoneOf.get(id)!;
      for (const g of allZones) g.visible = vis.includes(g);
      const nr = nearOf.get(id)!;
      for (const [z, d] of allDet) d.visible = nr.has(z);
    };
    // corte automático: antes de cada render da cena que contém o mapa (inclusive câmeras de segurança)
    let hooked: THREE.Scene | null = null;
    let prevHook: THREE.Scene['onBeforeRender'] | null = null;
    const onAdded = () => {
      let sc: THREE.Object3D | null = this.root;
      while (sc && !(sc as THREE.Scene).isScene) sc = sc.parent;
      if (!sc || sc === hooked) return;
      hooked = sc as THREE.Scene;
      prevHook = hooked.onBeforeRender;
      const prev = prevHook;
      hooked.onBeforeRender = function (...a: Parameters<THREE.Scene['onBeforeRender']>) {
        prev.apply(this, a);
        cull(a[2]);
      };
    };
    this.root.addEventListener('added', onAdded);
    const K = this;
    const nav = this.buildNav();
    const build: MapBuild & { cull: (c: THREE.Camera) => void } = {
      id: this.id,
      root: this.root,
      rooms: this.rooms,
      spawn,
      colliders: this.colliders,
      slots: this.slots,
      interacts: this.interacts,
      npcSpots: this.npcSpots,
      setPower(on: boolean) {
        K.baker.power.value = on ? 1 : 0;
        for (const p of K.powerMats) p.m.color.copy(on ? p.on : p.off);
        for (const o of K.powerObjs) o.visible = on;
      },
      cull,
      nav,
      update(dt: number) {
        K.time += dt;
        for (const f of K.anims) f(dt, K.time);
      },
      dispose() {
        if (hooked && prevHook) hooked.onBeforeRender = prevHook;
        K.root.removeEventListener('added', onAdded);
        K.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
        });
        for (const m of K.mats.values()) m.dispose();
        for (const d of K.disposables) d.dispose();
        K.baker.dispose();
        K.root.removeFromParent();
      },
      ...extra,
    };
    return build;
  }
}

const colFix = new Map<string, string>();
const _fc = new THREE.Color();
function fixCol(c: string): string {
  let v = colFix.get(c);
  if (!v) {
    // queremos linear(linear(x)) = linear(c)  →  x = sRGB-encode dos números sRGB de c
    _fc.set(c);
    const t = { r: 0, g: 0, b: 0 };
    _fc.getRGB(t, THREE.SRGBColorSpace);
    _fc.setRGB(t.r, t.g, t.b, THREE.LinearSRGBColorSpace);
    v = '#' + _fc.getHexString();
    colFix.set(c, v);
  }
  return v;
}

function vol(r: RoomDef): number {
  return (r.max.x - r.min.x) * (r.max.z - r.min.z);
}

/** textura da sombra de contato: branco no centro → multiplicação escurece (premultiplicada) */
let _blob: THREE.CanvasTexture | null = null;
function blobTex(): THREE.CanvasTexture {
  if (_blob) return _blob;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  // multiplicativo: preto = escurece, branco = nada. Desenhamos branco com miolo escuro.
  x.fillStyle = '#fff';
  x.fillRect(0, 0, S, S);
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(70,70,80,1)');
  g.addColorStop(0.5, 'rgba(150,150,160,1)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  _blob = new THREE.CanvasTexture(c);
  return _blob;
}

/* ============================================================
 *  Ajudantes de geometria subdividida (a luz assada precisa de vértices
 *  no meio das paredes/chão para o degradê ficar suave).
 * ============================================================ */
const STEP = 0.5;
/** caixa de cantos vivos subdividida; (x,y,z) = centro da BASE */
export function sbox(b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0, step = STEP): GeoBuilder {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(h / step)), Math.max(1, Math.ceil(d / step)));
  g.translate(0, h / 2, 0);
  return b.geo(g, col, x, y, z, 0, ry, 0);
}
/** plano horizontal subdividido (chão, teto: up=false vira para baixo) */
export function splane(b: GeoBuilder, x0: number, z0: number, x1: number, z1: number, y: number, col: string, up = true, step = STEP): GeoBuilder {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(z1 - z0);
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(d / step)));
  g.rotateX(up ? -Math.PI / 2 : Math.PI / 2);
  return b.geo(g, col, (x0 + x1) / 2, y, (z0 + z1) / 2);
}
/** plano vertical subdividido; ry = 0 → virado para +z */
export function vplane(b: GeoBuilder, w: number, h: number, x: number, y: number, z: number, col: string, ry = 0, step = STEP): GeoBuilder {
  const g = new THREE.PlaneGeometry(w, h, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(h / step)));
  g.translate(0, h / 2, 0);
  return b.geo(g, col, x, y, z, 0, ry, 0);
}
/** triângulo (empena) extrudado: base w em y, altura h, espessura t (centrado em z); ry gira */
export function gable(b: GeoBuilder, w: number, h: number, t: number, x: number, y: number, z: number, col: string, ry = 0): GeoBuilder {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0);
  sh.lineTo(w / 2, 0);
  sh.lineTo(0, h);
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false, steps: 1 });
  g.translate(0, 0, -t / 2);
  return b.geo(g, col, x, y, z, 0, ry, 0);
}
/** placa inclinada centrada (telhado): comprimento L ao longo de x local, largura W em z, inclinação rz */
export function slab(b: GeoBuilder, L: number, W: number, t: number, x: number, y: number, z: number, col: string, rz: number, ry = 0, step = 0.6): GeoBuilder {
  const g = new THREE.BoxGeometry(L, t, W, Math.max(1, Math.ceil(L / step)), 1, Math.max(1, Math.ceil(W / step)));
  return b.geo(g, col, x, y, z, 0, ry, rz);
}
/** faixa (caminho) ao longo de uma polilinha no chão */
export function ribbon(b: GeoBuilder, pts: [number, number][], w: number, y: number, col: string): GeoBuilder {
  const pos: number[] = [];
  const idx: number[] = [];
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const n = Math.max(2, Math.ceil(curve.getLength() / 0.6));
  const sp = curve.getSpacedPoints(n);
  for (let i = 0; i <= n; i++) {
    const p = sp[i];
    const q = sp[Math.min(n, i + 1)];
    const o = sp[Math.max(0, i - 1)];
    const dx = q.x - o.x;
    const dz = q.z - o.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l;
    const nz = dx / l;
    const ww = w * (0.92 + 0.08 * Math.sin(i * 1.7));
    pos.push(p.x + (nx * ww) / 2, y, p.z + (nz * ww) / 2, p.x - (nx * ww) / 2, y, p.z - (nz * ww) / 2);
    if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // normais para cima sempre (a ordem dos vértices pode inverter)
  const nn = g.getAttribute('normal');
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  return b.geo(g, col, 0, 0, 0);
}
/** disco horizontal (tapete redondo) com UV 0..1 (textura inteira) */
export function disc(r: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.CircleGeometry(r, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}
/** retângulo com UV 0..1 (quadro, placa, tela) virado para +z */
export function quad(w: number, h: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(w, h);
}
