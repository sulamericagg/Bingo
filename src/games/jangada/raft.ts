/* ============================================================
 *  JANGADA BLOOP — a jangada: grade de pisos (CELL m) que cresce
 *  pela beirada, peças por cima (nível 0 = convés, 1 = andar de cima),
 *  redes na água ao lado, ligações automáticas de cerca/parede
 *  (máscara N/L/S/O, como as cercas de Noites), colisão, chão para
 *  andar (convés, andar de cima, rampa da escada), dano/conserto e
 *  serialização compacta (rede + salvamento). Sem DOM.
 *  RaftView: as malhas (pisos juntos numa malha só; peças com cache).
 * ============================================================ */
import * as THREE from 'three';
import { bagAdd, PIECE, PIECES, type Bag, type ItemId, type PieceDef, type PK } from './data';
import { CELL, DECK, FLOOR_H, MAT, floorGeo, foundationGeo, initMats, linkGeo, merge, pieceGeo, sph, stairsGeo, box, cyl } from './models';

export interface RPiece {
  id: number;
  k: PK;
  x: number;
  z: number;
  lv: number;
  /** rotação em quartos de volta */
  ro: number;
  hp: number;
  /** estado da peça (fogueira, purificador, horta, baú, rede, vela, âncora, lampião) */
  d?: PieceData;
}
export interface PieceData {
  /** fogueira: nível, combustível (s), assando [item, s restantes], prontos */
  lv?: number;
  fuel?: number;
  cook?: [ItemId, number][];
  done?: ItemId[];
  /** purificador: água pronta */
  w?: number;
  wt?: number;
  /** horta: plantou? crescimento 0..1 */
  g?: number;
  /** baú / rede */
  bag?: Bag;
  /** vela/âncora/lampião ligado; vela: direção (rad) */
  on?: boolean;
  yaw?: number;
}
export type Reason = '' | 'occ' | 'edge' | 'nofloor' | 'support' | 'tier' | 'low' | 'far' | 'max';

const OFF = 64;
export const ck = (x: number, z: number) => (x + OFF) * 256 + (z + OFF);
export const cellOf = (v: number) => Math.round(v / CELL);
const N4: [number, number, number][] = [
  [1, 0, -1],
  [2, 1, 0],
  [4, 0, 1],
  [8, -1, 0],
];
const LIMIT = 24;

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y0: number;
  y1: number;
  id: number;
}

export class Raft {
  pieces: RPiece[] = [];
  /** superfície por nível: piso (0) / andar (1) / rede (0, água) */
  surf: Map<number, number>[] = [new Map(), new Map()];
  /** objeto por nível */
  obj: Map<number, number>[] = [new Map(), new Map()];
  ver = 0;
  hpVer = 0;
  private nextId = 1;
  private byId = new Map<number, RPiece>();
  private boxCache: Box[] = [];
  private boxVer = -1;

  /** jangada inicial: 2×2 pisos */
  static starter(): Raft {
    const r = new Raft();
    for (const [x, z] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ])
      r.add({ id: 0, k: 'found', x, z, lv: 0, ro: 0, hp: PIECE.found.hp });
    return r;
  }

  get(id: number): RPiece | undefined {
    return this.byId.get(id);
  }
  def(p: RPiece): PieceDef {
    return PIECE[p.k];
  }
  surfAt(x: number, z: number, lv: number): RPiece | undefined {
    const id = this.surf[lv]?.get(ck(x, z));
    return id ? this.byId.get(id) : undefined;
  }
  objAt(x: number, z: number, lv: number): RPiece | undefined {
    const id = this.obj[lv]?.get(ck(x, z));
    return id ? this.byId.get(id) : undefined;
  }
  isFound(x: number, z: number): boolean {
    return this.surfAt(x, z, 0)?.k === 'found';
  }
  get tiles(): number {
    let n = 0;
    for (const p of this.pieces) if (p.k === 'found') n++;
    return n;
  }
  /** maior nível de fogueira na jangada */
  fireLv(): number {
    let lv = 0;
    for (const p of this.pieces) if (p.k === 'fire') lv = Math.max(lv, p.d?.lv ?? 1);
    return lv;
  }
  count(k: PK): number {
    let n = 0;
    for (const p of this.pieces) if (p.k === k) n++;
    return n;
  }
  /** limites (m) dos pisos: [x0, z0, x1, z1] */
  bounds(): [number, number, number, number] {
    let x0 = 1e9,
      z0 = 1e9,
      x1 = -1e9,
      z1 = -1e9;
    for (const p of this.pieces)
      if (p.k === 'found') {
        x0 = Math.min(x0, p.x);
        z0 = Math.min(z0, p.z);
        x1 = Math.max(x1, p.x);
        z1 = Math.max(z1, p.z);
      }
    if (x0 > x1) return [-1, -1, 1, 1];
    return [(x0 - 0.5) * CELL, (z0 - 0.5) * CELL, (x1 + 0.5) * CELL, (z1 + 0.5) * CELL];
  }
  center(): [number, number] {
    const b = this.bounds();
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  private add(p: RPiece): RPiece {
    if (!p.id) p.id = this.nextId++;
    else this.nextId = Math.max(this.nextId, p.id + 1);
    const d = PIECE[p.k];
    this.pieces.push(p);
    this.byId.set(p.id, p);
    if (d.slot === 'found' || d.slot === 'water' || d.slot === 'surf') this.surf[p.lv].set(ck(p.x, p.z), p.id);
    else this.obj[p.lv].set(ck(p.x, p.z), p.id);
    if (!p.d) p.d = initData(p.k);
    this.ver++;
    return p;
  }

  /** dá para pôr? ('' = sim) */
  canPlace(k: PK, x: number, z: number, lv: number, fireLv: number): Reason {
    const d = PIECE[k];
    if (Math.abs(x) > LIMIT || Math.abs(z) > LIMIT) return 'max';
    if ((d.fire ?? 0) > fireLv) return 'tier';
    const c = ck(x, z);
    if (d.slot === 'found' || d.slot === 'water') {
      if (lv !== 0) return 'nofloor';
      if (this.surf[0].has(c)) return 'occ';
      for (const [, dx, dz] of N4) if (this.isFound(x + dx, z + dz)) return '';
      return 'edge';
    }
    if (d.slot === 'surf') {
      if (lv !== 1) return 'nofloor';
      if (this.surf[1].has(c)) return 'occ';
      if (!this.isFound(x, z)) return 'nofloor';
      const below = this.objAt(x, z, 0);
      if (below && (below.k === 'stairs' || below.k === 'sail')) return 'occ';
      if (below && (below.k === 'pillar' || below.k === 'wall')) return '';
      for (const [, dx, dz] of N4) if (this.surf[1].has(ck(x + dx, z + dz))) return '';
      return 'support';
    }
    // objeto
    const s = this.surfAt(x, z, lv);
    if (!s || s.k === 'net') return 'nofloor';
    if (lv === 1 && !d.up) return 'nofloor';
    if (this.obj[lv].has(c)) return 'occ';
    if (lv === 0 && this.surf[1].has(c) && (k === 'sail' || k === 'stairs')) return 'low';
    return '';
  }
  place(k: PK, x: number, z: number, lv: number, ro: number, id = 0): RPiece {
    return this.add({ id, k, x, z, lv, ro: ((ro % 4) + 4) % 4, hp: PIECE[k].hp });
  }
  /** tira a peça (e o que ficou sem apoio). Devolve as removidas */
  remove(id: number): RPiece[] {
    const p = this.byId.get(id);
    if (!p) return [];
    const out: RPiece[] = [];
    const rm = (q: RPiece) => {
      if (!this.byId.has(q.id)) return;
      this.byId.delete(q.id);
      this.pieces.splice(this.pieces.indexOf(q), 1);
      const d = PIECE[q.k];
      const map = d.slot === 'obj' ? this.obj[q.lv] : this.surf[q.lv];
      if (map.get(ck(q.x, q.z)) === q.id) map.delete(ck(q.x, q.z));
      out.push(q);
    };
    rm(p);
    if (p.k === 'found') {
      const o = this.objAt(p.x, p.z, 0);
      if (o) rm(o);
      const f = this.surfAt(p.x, p.z, 1);
      if (f) {
        rm(f);
        const o1 = this.objAt(p.x, p.z, 1);
        if (o1) rm(o1);
      }
      // redes que ficaram soltas
      for (const [, dx, dz] of N4) {
        const n = this.surfAt(p.x + dx, p.z + dz, 0);
        if (n?.k === 'net' && !N4.some(([, ex, ez]) => this.isFound(n.x + ex, n.z + ez))) rm(n);
      }
    }
    if (p.k === 'floor') {
      const o1 = this.objAt(p.x, p.z, 1);
      if (o1) rm(o1);
    }
    this.ver++;
    return out;
  }
  /** dano (mordida): true se quebrou */
  damage(id: number, dmg: number): boolean {
    const p = this.byId.get(id);
    if (!p) return false;
    p.hp = Math.max(0, p.hp - dmg);
    this.hpVer++;
    if (p.hp <= 0) {
      this.remove(id);
      return true;
    }
    return false;
  }
  repair(id: number): void {
    const p = this.byId.get(id);
    if (!p) return;
    p.hp = PIECE[p.k].hp;
    this.hpVer++;
  }

  /** máscara de ligação (cerca/parede) */
  mask(p: RPiece): number {
    let m = 0;
    for (const [bit, dx, dz] of N4) {
      const n = this.objAt(p.x + dx, p.z + dz, p.lv);
      if (n && (n.k === 'rail' || n.k === 'wall')) m |= bit;
    }
    return m;
  }

  /** pisos da beirada (o tubarão escolhe um) */
  edgeTiles(): RPiece[] {
    return this.pieces.filter((p) => p.k === 'found' && N4.some(([, dx, dz]) => !this.surf[0].has(ck(p.x + dx, p.z + dz))));
  }

  /* ------------------------------ física ------------------------------ */
  /** altura do chão (relativa ao mar parado, sem o balanço) sob (x, z) para quem tem os pés em `y`; null = água */
  groundAt(x: number, z: number, y: number, step = 0.55): number | null {
    const cx = cellOf(x);
    const cz = cellOf(z);
    let best: number | null = null;
    const consider = (h: number) => {
      if (h <= y + step && (best === null || h > best)) best = h;
    };
    if (this.isFound(cx, cz)) consider(DECK);
    if (this.surf[1].has(ck(cx, cz))) consider(DECK + FLOOR_H);
    const o = this.objAt(cx, cz, 0);
    if (o?.k === 'stairs') {
      // rampa: sobe para +Z local girado por ro
      const lx = x - cx * CELL;
      const lz = z - cz * CELL;
      const [ax, az] = rot(lx, lz, -o.ro);
      const tt = Math.max(0, Math.min(1, (az + CELL / 2) / CELL));
      if (Math.abs(ax) < CELL * 0.45) consider(DECK + tt * FLOOR_H);
    }
    return best;
  }
  /** teto acima de y (para não atravessar o andar de cima pulando) */
  ceilAt(x: number, z: number, y: number): number {
    const cx = cellOf(x);
    const cz = cellOf(z);
    const f = DECK + FLOOR_H - 0.12;
    if (this.surf[1].has(ck(cx, cz)) && y < f - 0.3 && this.objAt(cx, cz, 0)?.k !== 'stairs') return f;
    return 1e9;
  }
  /** caixas de colisão (cerca, parede, objetos) */
  boxes(): Box[] {
    if (this.boxVer === this.ver) return this.boxCache;
    const out: Box[] = [];
    const add = (p: RPiece, cx: number, cz: number, hx: number, hz: number, y0: number, y1: number) => {
      const by = p.lv * FLOOR_H + DECK;
      out.push({ x0: cx - hx, z0: cz - hz, x1: cx + hx, z1: cz + hz, y0: by + y0, y1: by + y1, id: p.id });
    };
    for (const p of this.pieces) {
      const cx = p.x * CELL;
      const cz = p.z * CELL;
      switch (p.k) {
        case 'rail':
        case 'wall': {
          const t = p.k === 'wall' ? 0.13 : 0.08;
          const hgt = p.k === 'wall' ? 2.3 : 1.05;
          add(p, cx, cz, t, t, 0, hgt);
          const m = this.mask(p);
          for (const [bit, dx, dz] of N4) {
            if (!(m & bit)) continue;
            const L = CELL / 2;
            add(p, cx + (dx * L) / 2, cz + (dz * L) / 2, dx ? L / 2 : t, dz ? L / 2 : t, 0, hgt);
          }
          if (!m) add(p, cx, cz, p.k === 'wall' ? CELL * 0.4 : 0.25, t, 0, hgt);
          break;
        }
        case 'pillar':
          add(p, cx, cz, 0.14, 0.14, 0, FLOOR_H);
          break;
        case 'chest':
        case 'purifier':
        case 'fire':
        case 'anchor': {
          const [hx, hz] = p.ro % 2 ? [0.32, 0.45] : [0.45, 0.32];
          add(p, cx, cz, p.k === 'chest' || p.k === 'anchor' ? hx : 0.36, p.k === 'chest' || p.k === 'anchor' ? hz : 0.36, 0, 0.7);
          break;
        }
        case 'bed': {
          const [hx, hz] = p.ro % 2 ? [0.7, 0.48] : [0.48, 0.7];
          add(p, cx, cz, hx, hz, 0, 0.5);
          break;
        }
        case 'planter':
          add(p, cx, cz, 0.55, 0.55, 0, 0.45);
          break;
        case 'sail':
        case 'lamp':
        case 'flag':
          add(p, cx, cz, 0.12, 0.12, 0, 2.5);
          break;
      }
    }
    this.boxCache = out;
    this.boxVer = this.ver;
    return out;
  }

  /* ------------------------------ rede/salvar ------------------------------ */
  serialize(): unknown[] {
    return this.pieces.map((p) => [p.id, PIECE[p.k].idx, p.x, p.z, p.lv, p.ro, Math.round(p.hp), p.d && Object.keys(p.d).length ? p.d : 0]);
  }
  static from(a: unknown): Raft {
    const r = new Raft();
    if (!Array.isArray(a)) return Raft.starter();
    for (const e of a) {
      if (!Array.isArray(e)) continue;
      const def = PIECES[Number(e[1])];
      if (!def) continue;
      const p: RPiece = { id: Number(e[0]) | 0, k: def.id, x: Number(e[2]) | 0, z: Number(e[3]) | 0, lv: Number(e[4]) ? 1 : 0, ro: (Number(e[5]) | 0) % 4, hp: Math.max(1, Number(e[6]) || def.hp) };
      if (e[7] && typeof e[7] === 'object') p.d = e[7] as PieceData;
      r.add(p);
    }
    if (!r.tiles) return Raft.starter();
    return r;
  }
  /** aplica uma lista completa (convidado), mantendo os objetos para a malha comparar */
  load(a: unknown): void {
    const n = Raft.from(a);
    this.pieces = n.pieces;
    this.surf = n.surf;
    this.obj = n.obj;
    this.byId = n.byId;
    this.nextId = n.nextId;
    this.ver++;
    this.hpVer++;
  }
}

function initData(k: PK): PieceData | undefined {
  switch (k) {
    case 'fire':
      return { lv: 1, fuel: 60, cook: [], done: [] };
    case 'purifier':
      return { fuel: 0, w: 0, wt: 0 };
    case 'planter':
      return { g: -1 };
    case 'chest':
    case 'net':
      return { bag: {} };
    case 'sail':
      return { on: false, yaw: 0 };
    case 'anchor':
    case 'lamp':
      return { on: k === 'lamp' };
    default:
      return undefined;
  }
}
export function rot(x: number, z: number, ro: number): [number, number] {
  const r = ((ro % 4) + 4) % 4;
  if (r === 0) return [x, z];
  if (r === 1) return [z, -x];
  if (r === 2) return [-x, -z];
  return [-z, x];
}
export const pieceBag = (p: RPiece): Bag => (p.d!.bag ??= {});
export function bagMove(from: Bag, to: Bag, id: ItemId, n: number): number {
  const m = Math.min(n, from[id] ?? 0);
  if (m <= 0) return 0;
  bagAdd(from, { [id]: m }, -1);
  bagAdd(to, { [id]: m });
  return m;
}

/* ============================== malhas ============================== */
interface PV {
  key: string;
  obj: THREE.Object3D;
  /** partes animadas */
  flame?: THREE.Mesh;
  light?: THREE.PointLight;
  cloth?: THREE.Mesh;
  plants?: THREE.Mesh;
  water?: THREE.Mesh;
  chain?: THREE.Mesh;
  glow?: THREE.Mesh;
  flagCloth?: THREE.Mesh;
  items?: THREE.Group;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function cachedGeo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}
let flameGeo: THREE.BufferGeometry | null = null;
let clothGeo: THREE.BufferGeometry | null = null;

export class RaftView {
  readonly group = new THREE.Group();
  private found: THREE.Mesh | null = null;
  private views = new Map<number, PV>();
  private ver = -1;
  private hpBucket = '';
  private lights = 0;
  constructor(
    private raft: Raft,
    private maxLights: number,
  ) {
    initMats();
  }
  /** refaz o que mudou */
  sync(force = false): void {
    const r = this.raft;
    const bucket = r.pieces
      .filter((p) => p.k === 'found')
      .map((p) => Math.ceil((p.hp / PIECE.found.hp) * 4))
      .join('');
    if (!force && r.ver === this.ver && bucket === this.hpBucket) return;
    if (force || r.ver !== this.ver || bucket !== this.hpBucket) this.rebuildFound();
    this.hpBucket = bucket;
    if (r.ver === this.ver && !force) return;
    this.ver = r.ver;
    const seen = new Set<number>();
    this.lights = 0;
    for (const p of r.pieces) {
      if (p.k === 'found') continue;
      seen.add(p.id);
      const key = this.keyOf(p);
      const v = this.views.get(p.id);
      if (v && v.key === key) {
        if (v.light) this.lights++;
        continue;
      }
      if (v) this.drop(v);
      this.views.set(p.id, this.make(p, key));
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        this.drop(v);
        this.views.delete(id);
      }
  }
  private keyOf(p: RPiece): string {
    let k = `${p.k}|${p.x}|${p.z}|${p.lv}|${p.ro}`;
    if (p.k === 'rail' || p.k === 'wall') k += '|' + this.raft.mask(p);
    if (p.k === 'fire') k += '|' + (p.d?.lv ?? 1);
    return k;
  }
  private drop(v: PV): void {
    this.group.remove(v.obj);
    v.light?.dispose();
  }
  private rebuildFound(): void {
    if (this.found) {
      this.group.remove(this.found);
      this.found.geometry.dispose();
    }
    const list: THREE.BufferGeometry[] = [];
    for (const p of this.raft.pieces) {
      if (p.k !== 'found') continue;
      const g = foundationGeo(Math.abs(p.x * 7 + p.z * 13) % 11).clone();
      const k = p.hp / PIECE.found.hp;
      if (k < 0.99) {
        // estragado: mais escuro e avermelhado
        const c = g.getAttribute('color') as THREE.BufferAttribute;
        for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * (0.55 + k * 0.45), c.getY(i) * (0.45 + k * 0.55), c.getZ(i) * (0.45 + k * 0.55));
      }
      g.translate(p.x * CELL, 0, p.z * CELL);
      list.push(g);
    }
    if (!list.length) return;
    this.found = new THREE.Mesh(merge(list), MAT.wood);
    this.found.castShadow = this.found.receiveShadow = true;
    this.group.add(this.found);
  }
  private make(p: RPiece, key: string): PV {
    const g = new THREE.Group();
    g.position.set(p.x * CELL, p.lv * FLOOR_H, p.z * CELL);
    g.rotation.y = (-p.ro * Math.PI) / 2;
    const v: PV = { key, obj: g };
    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material = MAT.wood) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    switch (p.k) {
      case 'rail':
      case 'wall': {
        g.rotation.y = 0;
        const mask = this.raft.mask(p);
        mesh(cachedGeo(`${p.k}${mask}`, () => linkGeo(p.k as 'rail' | 'wall', mask)));
        break;
      }
      case 'floor':
        g.position.y = 0;
        mesh(cachedGeo('floor', floorGeo));
        break;
      case 'stairs':
        mesh(cachedGeo('stairs', stairsGeo));
        break;
      case 'net': {
        const geo = cachedGeo('net', () =>
          merge([box(CELL, 0.1, 0.1, '#a8703a', 0, 0.05, -CELL / 2), box(CELL, 0.1, 0.1, '#a8703a', 0, 0.05, CELL / 2), box(0.1, 0.1, CELL, '#a8703a', -CELL / 2, 0.05, 0), box(0.1, 0.1, CELL, '#a8703a', CELL / 2, 0.05, 0), cyl(0.18, 0.18, 0.5, '#ff8ab8', -CELL / 2, 0, -CELL / 2, 0, 0, Math.PI / 2, 6), cyl(0.18, 0.18, 0.5, '#ffd34a', CELL / 2, 0, CELL / 2, 0, 0, Math.PI / 2, 6)]),
        );
        mesh(geo, MAT.vc);
        const n = new THREE.Mesh(new THREE.PlaneGeometry(CELL, CELL), MAT.net);
        n.rotation.x = -Math.PI / 2;
        n.position.y = 0.02;
        g.add(n);
        v.items = new THREE.Group();
        g.add(v.items);
        break;
      }
      default: {
        const lv = p.k === 'fire' ? (p.d?.lv ?? 1) : 0;
        mesh(cachedGeo(`${p.k}${lv}`, () => pieceGeo(p.k, lv)), p.k === 'flag' || p.k === 'purifier' || p.k === 'fire' ? MAT.vc : MAT.wood);
      }
    }
    if (p.k === 'fire') {
      flameGeo ??= new THREE.ConeGeometry(0.22, 0.7, 7, 1, true).translate(0, 0.35, 0);
      const f = new THREE.Mesh(flameGeo, MAT.flame);
      f.position.y = DECK + 0.08;
      g.add(f);
      const f2 = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: '#ffe680', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
      f2.scale.setScalar(0.55);
      f.add(f2);
      v.flame = f;
      if (this.lights < this.maxLights) {
        v.light = new THREE.PointLight('#ff9a40', 0, 9, 1.6);
        v.light.position.y = DECK + 0.9;
        g.add(v.light);
        this.lights++;
      }
      v.items = new THREE.Group();
      g.add(v.items);
    }
    if (p.k === 'lamp') {
      const gl = new THREE.Mesh(cachedGeo('lampglow', () => merge([box(0.26, 0.32, 0.26, '#fff1a0', 0, 0, 0), box(0.3, 0.05, 0.3, '#8a94a8', 0, 0.18, 0)])), MAT.glow);
      gl.position.set(0.3, DECK + 1.3, 0);
      g.add(gl);
      v.glow = gl;
      if (this.lights < this.maxLights) {
        v.light = new THREE.PointLight('#ffd890', 0, 10, 1.5);
        v.light.position.set(0.3, DECK + 1.3, 0);
        g.add(v.light);
        this.lights++;
      }
    }
    if (p.k === 'sail') {
      clothGeo ??= (() => {
        const c = new THREE.PlaneGeometry(2.5, 3.2, 6, 6);
        const pos = c.getAttribute('position');
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          pos.setZ(i, (1 - (x / 1.25) ** 2) * 0.45 * (1 - ((y - 0.2) / 1.8) ** 2));
        }
        c.computeVertexNormals();
        const col = new Float32Array(pos.count * 3);
        for (let i = 0; i < pos.count; i++) {
          const stripe = Math.floor((pos.getY(i) + 1.6) / 0.8) % 2;
          col.set(stripe ? [1, 0.95, 0.85] : [1, 0.55, 0.7], i * 3);
        }
        c.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return c;
      })();
      const cl = new THREE.Mesh(clothGeo, MAT.cloth);
      cl.position.set(0, DECK + 2.6, 0.25);
      g.add(cl);
      v.cloth = cl;
    }
    if (p.k === 'planter') {
      const pl = new THREE.Mesh(cachedGeo('plants', () => merge([...[-0.3, 0, 0.3].flatMap((x) => [-0.3, 0.3].map((z) => sph(0.16, '#4cc05a', x, 0.15, z, 1, 1.4, 1, 6))), sph(0.08, '#c89a4a', 0.15, 0.05, 0.15, 1, 0.7, 1, 6)])), MAT.vc);
      pl.position.y = DECK + 0.38;
      g.add(pl);
      v.plants = pl;
    }
    if (p.k === 'purifier') {
      const w = new THREE.Mesh(cachedGeo('purw', () => cyl(0.26, 0.26, 0.03, '#7fe8ff', 0, 0, 0, 0, 0, 0, 10)), MAT.water);
      w.position.y = DECK + 0.78;
      g.add(w);
      v.water = w;
      flameGeo ??= new THREE.ConeGeometry(0.22, 0.7, 7, 1, true).translate(0, 0.35, 0);
      const f = new THREE.Mesh(flameGeo, MAT.flame);
      f.scale.setScalar(0.45);
      f.position.y = DECK + 0.05;
      g.add(f);
      v.flame = f;
    }
    if (p.k === 'anchor') {
      const c = new THREE.Mesh(cachedGeo('chain', () => cyl(0.03, 0.03, 1, '#6a6a7a', 0, -0.5, 0, 0, 0, 0, 4)), MAT.vc);
      c.position.set(0.75, DECK + 0.8, 0);
      g.add(c);
      v.chain = c;
    }
    if (p.k === 'flag') {
      const fc = new THREE.Mesh(
        cachedGeo('flagc', () => {
          const pg = new THREE.PlaneGeometry(1, 0.62, 5, 1).translate(0.5, 0, 0);
          const col = new Float32Array(pg.getAttribute('position').count * 3);
          for (let i = 0; i < col.length / 3; i++) col.set([1, 0.31, 0.64], i * 3);
          pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
          return pg;
        }),
        MAT.cloth,
      );
      fc.position.set(0.04, DECK + 2.25, 0);
      const face = new THREE.Mesh(cachedGeo('flagface', () => merge([sph(0.18, '#ffffff', 0.45, 0, 0.02, 1, 1, 0.15), sph(0.06, '#123a5c', 0.5, 0.03, 0.05, 1, 1, 0.3)])), MAT.vc);
      fc.add(face);
      g.add(fc);
      v.flagCloth = fc;
    }
    this.group.add(g);
    return v;
  }
  /** animação por quadro (fogo, vela, horta, água, rede) */
  animate(time: number, night: number, tier: number): void {
    for (const p of this.raft.pieces) {
      const v = this.views.get(p.id);
      if (!v) continue;
      const d = p.d;
      if (p.k === 'fire' && v.flame) {
        const lit = (d?.fuel ?? 0) > 0;
        const lv = d?.lv ?? 1;
        v.flame.visible = lit;
        const fl = 0.85 + Math.sin(time * 17 + p.id) * 0.08 + Math.sin(time * 29) * 0.05;
        v.flame.scale.set((0.8 + lv * 0.25) * fl, (0.8 + lv * 0.3) * (fl + 0.1), (0.8 + lv * 0.25) * fl);
        if (v.light) v.light.intensity = lit ? (0.6 + night * 2.2) * (0.85 + lv * 0.2) * fl : 0;
        this.showItems(v, d?.cook?.map((c) => c[0]).concat(d?.done ?? []) ?? [], DECK + 0.62, 0.18);
      }
      if (p.k === 'purifier' && v.water && v.flame) {
        v.flame.visible = (d?.fuel ?? 0) > 0;
        v.water.visible = (d?.w ?? 0) > 0 || (d?.fuel ?? 0) > 0;
        v.water.position.y = DECK + 0.7 + Math.min(3, d?.w ?? 0) * 0.03 + Math.sin(time * 8) * 0.004;
        (v.water.material as THREE.MeshBasicMaterial).color.set((d?.w ?? 0) > 0 ? '#9af4ff' : '#4a9ac8');
      }
      if (p.k === 'lamp') {
        const on = d?.on !== false;
        if (v.light) v.light.intensity = on ? 0.4 + night * 2 : 0;
        if (v.glow) v.glow.visible = on;
      }
      if (p.k === 'sail' && v.cloth) {
        const on = !!d?.on;
        v.cloth.scale.y += ((on ? 1 : 0.18) - v.cloth.scale.y) * 0.1;
        v.cloth.position.y = DECK + 4.3 - v.cloth.scale.y * 1.6;
        v.cloth.rotation.y = (d?.yaw ?? 0) + (p.ro * Math.PI) / 2 + Math.sin(time * 1.3) * 0.03;
        v.cloth.scale.z = on ? 1 + Math.sin(time * 2.1 + p.id) * 0.12 : 0.3;
      }
      if (p.k === 'planter' && v.plants) {
        const g = d?.g ?? -1;
        v.plants.visible = g >= 0;
        const s = Math.max(0.15, Math.min(1, g));
        v.plants.scale.set(s, s, s);
      }
      if (p.k === 'anchor' && v.chain) {
        const on = !!d?.on;
        v.chain.scale.y += ((on ? 3.5 : 0.4) - v.chain.scale.y) * 0.08;
      }
      if (p.k === 'flag' && v.flagCloth) v.flagCloth.rotation.y = Math.sin(time * 2.4 + p.id) * 0.35 + 0.3;
      if (p.k === 'net' && v.items) this.showItems(v, Object.keys(d?.bag ?? {}) as ItemId[], 0.12, 0.35);
      if (p.k === 'chest' && tier < 0) continue;
    }
  }
  private itemGeo = new Map<string, THREE.BufferGeometry>();
  private showItems(v: PV, ids: ItemId[], y: number, r: number): void {
    const g = v.items;
    if (!g) return;
    const key = ids.join(',');
    if (g.userData.k === key) return;
    g.userData.k = key;
    g.clear();
    ids.slice(0, 6).forEach((id, i) => {
      const col = ITEM_COL[id] ?? '#ffffff';
      let geo = this.itemGeo.get(col);
      if (!geo) {
        geo = merge([sph(0.1, col, 0, 0, 0, 1.6, 0.7, 1)]);
        this.itemGeo.set(col, geo);
      }
      const m = new THREE.Mesh(geo, MAT.vc);
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2;
      m.position.set(Math.cos(a) * r * (ids.length > 1 ? 1 : 0), y, Math.sin(a) * r * (ids.length > 1 ? 1 : 0));
      g.add(m);
    });
  }
  dispose(): void {
    this.found?.geometry.dispose();
    for (const v of this.views.values()) this.drop(v);
    this.views.clear();
  }
}
const ITEM_COL: Partial<Record<ItemId, string>> = { fish: '#8ad0ff', fishc: '#ffad5a', bigfish: '#6aa8ff', bigfishc: '#ff9a3a', potato: '#d8b06a', potatoc: '#e8963a', wood: '#d8955a', plastic: '#7fd8ff', leaf: '#5cc85a', coco: '#8a5a32', rope: '#e8c27a', scrap: '#b8c4d8', seed: '#c89a4a', water: '#4fd8ff' };
