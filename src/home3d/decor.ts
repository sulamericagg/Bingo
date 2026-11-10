/* ============================================================
 *  DECORAR (3D) — compartilhado pela primeira pessoa e pela Vista aérea:
 *   - tocar num móvel (inclusive TAPETE) → menu pequeno: Mover · Girar · Cor · Estilo · Guardar
 *   - Mover/novo do catálogo → fantasma translúcido do modelo + pegada no chão,
 *     grade de 25 cm, encosta nas paredes, empurrãozinho automático para o lugar livre
 *     mais perto (vermelho só quando não cabe mesmo). Barra pequena: Girar · Cancelar · Colocar.
 *   - Catálogo: gaveta de baixo com abas (Móveis, Decoração, Parede, Piso, Luz, Plantas,
 *     Diversão, Cozinha e banho), miniaturas, preço / liberado e quantos já tem na casa.
 *  Os objetos interativos (pia, fogão, mesa) continuam sendo ItemRec comuns: dá para
 *  pendurar atividades depois via eng.items (kind) sem mexer aqui.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../i18n';
import { drawFurn } from '../home/render-room';
import { furnById } from '../home/catalog';
import {
  canUse, dimsOf, FLOOR_STYLES, ROOM_D, ROOM_W, itemColor, itemToPlace, KINDS, kindOf, PALETTE, placeItemXY, quarterOf, setQuarter, surface, WALL_STYLES, type Kind,
} from './adapter';
import type { Engine, ItemRec, RoomRec } from './engine';
import { Ghost, popObj } from './ghost';
import { GRID, solveFloor, solveWall } from './placer';
import { sfx } from './sfx';
import type { Cost3D, RoomItem3D, Shop3D } from './types';
import { el, esc, ICON } from './ui';

export const CATALOG_TABS: { id: string; label: () => string; kinds: Kind[]; surf?: 'floor' | 'wall'; icon: string }[] = [
  { id: 'furn', icon: 'sofa', label: () => t('home3d.cat.furn', 'Móveis'), kinds: ['sofa', 'armchair', 'chair', 'stool', 'beanbag', 'bed', 'bunk', 'table', 'desk', 'partytable', 'counter', 'bookcase', 'wardrobe', 'toybox'] },
  { id: 'deco', icon: 'star', label: () => t('home3d.cat.deco2', 'Decoração'), kinds: ['teddy', 'balloons', 'aquarium', 'guitar', 'garland'] },
  { id: 'wall', icon: 'wall', label: () => t('home3d.cat.wall2', 'Parede'), kinds: ['poster', 'painting', 'mirror', 'clock', 'window', 'shelf'], surf: 'wall' },
  { id: 'floor', icon: 'floor', label: () => t('home3d.cat.floor', 'Piso e tapetes'), kinds: ['rug'], surf: 'floor' },
  { id: 'light', icon: 'bulb', label: () => t('home3d.cat.light', 'Luz'), kinds: ['floorlamp', 'tablelamp', 'fireplace', 'discoball'] },
  { id: 'plant', icon: 'leaf', label: () => t('home3d.cat.plant', 'Plantas'), kinds: ['plant', 'cactus'] },
  { id: 'fun', icon: 'party', label: () => t('home3d.cat.fun', 'Diversão'), kinds: ['tv', 'arcade', 'piano', 'speaker', 'computer'] },
  { id: 'kb', icon: 'cake', label: () => t('home3d.cat.kb', 'Cozinha e banho'), kinds: ['fridge', 'stove', 'sink', 'bathtub', 'toilet'] },
];

interface Moving {
  it: ItemRec | null;
  data: RoomItem3D;
  room: RoomRec;
  isNew: boolean;
  /** solução atual (local do cômodo) */
  x: number;
  y: number;
  z: number;
  ok: boolean;
  /** último ponto pedido (para re-encaixar ao girar) */
  want: { room: RoomRec; x: number; y: number; z: number } | null;
}

const V = new THREE.Vector3();
const BM = new THREE.Matrix4();
const BR = new THREE.Ray();
const BB = new THREE.Box3();
const BP = new THREE.Vector3();
const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const thumbs = new Map<string, string>();
export function furnThumb(id: string): string {
  let u = thumbs.get(id);
  if (u) return u;
  const d = furnById(id);
  if (!d) return '';
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 84;
  const x = c.getContext('2d')!;
  const s = Math.min(82 / d.w, 70 / d.h, 1.4);
  x.translate(48, d.wall ? 42 : 78);
  x.scale(s, s);
  drawFurn(x, d);
  u = c.toDataURL();
  thumbs.set(id, u);
  return u;
}

export class Decor {
  sel: ItemRec | null = null;
  mv: Moving | null = null;
  readonly ghost: Ghost;
  private selRing: THREE.Mesh;
  /** grade de 25 cm no cômodo enquanto move (mostra o encaixe) */
  private grid: THREE.LineSegments;
  private popup: HTMLDivElement;
  private bar: HTMLDivElement;
  readonly drawer: HTMLDivElement;
  private tab = 'furn';
  private ask: HTMLDivElement | null = null;
  private ray = new THREE.Raycaster();
  /** chamado quando algo muda (o HUD re-renderiza botões) */
  onState?: () => void;
  /** cômodo onde o catálogo aplica piso/parede e onde nasce o móvel novo */
  spawnAt?: () => { room: RoomRec; x: number; z: number; y?: number } | null;

  constructor(
    readonly eng: Engine,
    readonly layer: HTMLElement,
    readonly toast: (s: string) => void,
    readonly shop: Shop3D | undefined,
  ) {
    this.ghost = new Ghost(eng);
    const rg = new THREE.RingGeometry(0.5, 0.56, 40);
    rg.rotateX(-Math.PI / 2);
    this.selRing = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.9, depthWrite: false }));
    this.selRing.renderOrder = 5;
    this.selRing.visible = false;
    eng.scene.add(this.selRing);
    // linhas nas coordenadas locais do cômodo (as mesmas da grade de encaixe)
    const pts: number[] = [];
    for (let x = GRID * 2; x < ROOM_W - 0.1; x += GRID) pts.push(x, 0, 0.12, x, 0, ROOM_D - 0.12);
    for (let z = GRID * 2; z < ROOM_D - 0.1; z += GRID) pts.push(0.12, 0, z, ROOM_W - 0.12, 0, z);
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false }));
    this.grid.visible = false;
    eng.scene.add(this.grid);
    this.popup = el('div', 'h3-pop');
    this.bar = el('div', 'h3-mbar');
    this.drawer = el('div', 'h3-drawer');
    for (const e of [this.popup, this.bar, this.drawer]) layer.appendChild(e);
    this.bar.style.display = 'none';
    this.popup.style.display = 'none';
  }

  get busy(): boolean {
    return !!this.mv || this.drawerOpen;
  }
  get drawerOpen(): boolean {
    return this.drawer.classList.contains('on');
  }
  private get canDeco(): boolean {
    return canUse(this.eng.role, 'decorate');
  }

  /* ---------------- escolher com o dedo ---------------- */
  /** item sob o ponto da tela (tapetes incluídos: se nada mais alto, vale o chão embaixo) */
  pickAt(cx: number, cy: number): ItemRec | null {
    const r = this.layer.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1), this.eng.camera);
    return this.pickRay(this.ray.ray);
  }
  pickRay(ray: THREE.Ray, maxDist = 30): ItemRec | null {
    this.ray.ray.copy(ray);
    this.ray.far = maxDist;
    const hits = this.ray.intersectObjects(this.eng.pickables, false);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud?.type === 'item') {
        const it = ud.item as ItemRec;
        if (it.state === 'broken' || !it.obj.visible) continue;
        if (it.info.flat) break; // tapete: confere abaixo (algo em cima do tapete ganha)
        return it;
      }
      if (ud?.type === 'wall') break;
    }
    // mira assistida: a caixa inteira do móvel conta (balões, cadeiras vazadas, pernas finas)
    {
      let best: ItemRec | null = null,
        bd = maxDist;
      const wallHit = hits.find((h) => h.object.userData?.type === 'wall');
      if (wallHit) bd = Math.min(bd, wallHit.distance + 0.05);
      for (const it of this.eng.items) {
        if (it.info.flat || it.state === 'broken' || !it.obj.visible) continue;
        BM.copy(it.obj.matrixWorld).invert();
        BR.copy(ray).applyMatrix4(BM);
        BB.min.set(-it.dims.w / 2, 0, -it.dims.d / 2);
        BB.max.set(it.dims.w / 2, it.dims.h, it.dims.d / 2);
        if (BR.intersectBox(BB, BP)) {
          BP.applyMatrix4(it.obj.matrixWorld);
          const d = BP.distanceTo(ray.origin);
          if (d < bd) (bd = d), (best = it);
        }
      }
      if (best) return best;
    }
    // chão: tapete cuja pegada contém o ponto
    const p = ray.intersectPlane(PLANE, V);
    if (!p || p.distanceTo(ray.origin) > maxDist) return null;
    const room = this.eng.roomAt(p.x, p.z);
    if (!room) return null;
    const l = room.group.worldToLocal(p.clone());
    let best: ItemRec | null = null;
    for (const it of this.eng.items) {
      if (it.room !== room || !it.info.flat || it.state === 'broken') continue;
      const c = room.group.worldToLocal(it.homeP.clone());
      const q = quarterOf(it.data) % 2;
      const hx = (q ? it.dims.d : it.dims.w) / 2,
        hz = (q ? it.dims.w : it.dims.d) / 2;
      if (Math.abs(l.x - c.x) <= hx && Math.abs(l.z - c.z) <= hz) best = it;
    }
    return best;
  }

  /* ---------------- seleção + menu ---------------- */
  select(it: ItemRec | null): void {
    if (this.mv) return;
    this.sel = it && this.canDeco ? it : null;
    this.selRing.visible = !!this.sel && !this.sel.info.wall;
    if (this.sel) {
      const s = Math.max(this.sel.dims.w, this.sel.dims.d) * 0.95;
      this.selRing.scale.set(s, 1, s);
      sfx.click();
    }
    this.renderPopup();
    this.onState?.();
  }
  private renderPopup(): void {
    const it = this.sel;
    this.popup.innerHTML = '';
    if (!it) {
      this.popup.style.display = 'none';
      return;
    }
    this.popup.style.display = '';
    const name = el('div', 'nm');
    name.textContent = t('home3d.furn.' + it.kind, KINDS[it.kind].name);
    this.popup.appendChild(name);
    const row = el('div', 'rw');
    const add = (id: string, icon: string, label: string, fn: () => void) => {
      const b = el('button', 'h3-pb', `${ICON[icon] ?? ''}<span>${esc(label)}</span>`);
      b.type = 'button';
      b.dataset.id = id;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      row.appendChild(b);
    };
    add('move', 'move', t('home3d.pop.move', 'Mover'), () => this.startMove(it));
    if (!it.info.wall && !it.info.ceil) add('rot', 'rotate', t('home3d.build.rotate', 'Girar'), () => this.rotateInPlace(it));
    add('color', 'color', t('home3d.build.color', 'Cor'), () => this.recolor(it));
    add('style', 'swap', t('home3d.pop.style', 'Estilo'), () => void this.restyle(it));
    add('store', 'box', t('home3d.build.remove', 'Guardar'), () => this.store(it));
    add('close', 'x', '', () => this.select(null));
    this.popup.appendChild(row);
  }
  /** acompanha o móvel na tela */
  private placePopup(): void {
    const it = this.sel;
    if (!it || this.mv) return;
    V.copy(it.obj.position);
    V.y += it.info.wall ? it.dims.h : Math.min(it.dims.h, 1.6) + 0.1;
    V.project(this.eng.camera);
    const r = this.layer.getBoundingClientRect();
    if (V.z > 1) {
      this.popup.style.opacity = '0';
      return;
    }
    const pw = this.popup.offsetWidth || 260,
      ph = this.popup.offsetHeight || 70;
    let x = ((V.x + 1) / 2) * r.width - pw / 2;
    let y = ((1 - V.y) / 2) * r.height - ph - 14;
    x = Math.max(8, Math.min(r.width - pw - 8, x));
    y = Math.max(52, Math.min(r.height - ph - 90, y));
    this.popup.style.opacity = '1';
    this.popup.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }

  /* ---------------- ações rápidas ---------------- */
  private rotateInPlace(it: ItemRec): void {
    const room = it.room;
    const l = room.group.worldToLocal(it.homeP.clone());
    const data = { ...it.data };
    setQuarter(data, (quarterOf(it.data) - (KINDS[it.kind] && isSide(it.kind) ? 1 : 0) + 1) % 4);
    const s = solveFloor(room, this.eng.items, data, it, l.x, l.z);
    if (!s.ok) {
      this.toastOnce(t('home3d.toast.noTurn', 'Sem espaço para girar aqui'));
      sfx.thud();
      return;
    }
    this.apply(it, room, data, s.x, 0, s.z);
    popObj(it.obj, 0.1, 300);
    sfx.click();
  }
  private recolor(it: ItemRec): void {
    const cur = PALETTE.indexOf(itemColor(it.data) as (typeof PALETTE)[number]);
    // cores liberadas: 12 grátis + as que o jogador comprou no 2D
    let n = cur;
    for (let i = 0; i < PALETTE.length; i++) {
      n = (n + 1) % PALETTE.length;
      if (n < 12 || !this.shop || this.shop.owns('pcol:' + n)) break;
    }
    it.data.color = String(n);
    this.eng.remodel(it);
    this.eng.changed = true;
    sfx.pick();
  }
  private async restyle(it: ItemRec): Promise<void> {
    const { kind, v } = kindOf(it.data.id);
    const nv = (v + 1) % 3;
    const id = kind + nv;
    if (!(await this.acquire(id))) return;
    const room = it.room;
    const data: RoomItem3D = { ...it.data, id };
    const l = room.group.worldToLocal(it.homeP.clone());
    const s = KINDS[kind].wall ? null : solveFloor(room, this.eng.items, data, it, l.x, l.z);
    if (s && !s.ok) {
      this.toastOnce(t('home3d.toast.noSpace', 'Não cabe aqui'));
      return;
    }
    // troca o modelo: remove e cria de novo com o novo id
    const arr = room.design.items as RoomItem3D[];
    const idx = arr.indexOf(it.data);
    if (s) {
      const xy = placeItemXY(data, { x: s.x, y: 0, z: s.z });
      data.x = xy.x;
      data.y = xy.y;
    }
    arr[idx] = data;
    this.eng.removeItem(it);
    const fresh = this.eng.addItem(room, data);
    this.eng.changed = true;
    this.eng.burst(fresh.obj.position.x, 0.4, fresh.obj.position.z, 10, 'spark', '#ffe27a', 1.4);
    sfx.pick();
    this.sel = null;
    this.select(fresh);
  }
  private store(it: ItemRec): void {
    this.select(null);
    const arr = it.room.design.items;
    const i = arr.indexOf(it.data);
    if (i >= 0) arr.splice(i, 1);
    this.eng.burst(it.obj.position.x, 0.3, it.obj.position.z, 16, 'poof', '#ffffff', 1.4);
    this.eng.removeItem(it);
    this.eng.changed = true;
    sfx.poof();
    this.toastOnce(t('home3d.toast.stored', 'Guardado! Pegue de novo no catálogo.'));
  }

  /* ---------------- mover / novo ---------------- */
  startMove(it: ItemRec): void {
    if (!this.canDeco || it.state === 'broken') return;
    this.select(null);
    const l = it.room.group.worldToLocal(it.homeP.clone());
    this.mv = { it, data: { ...it.data }, room: it.room, isNew: false, x: l.x, y: l.y, z: l.z, ok: true, want: null };
    // o original some (o fantasma é ele): sem colisão com o jogador enquanto move
    it.obj.visible = false;
    if (it.body) it.body.collisionResponse = false;
    this.ghost.setItem(this.mv.data, it.room.id);
    this.ghost.setGoal(it.room, l.x, l.y, l.z, this.yawOf(this.mv.data), true);
    this.showBar();
    sfx.pick();
    this.onState?.();
  }
  /** móvel novo do catálogo: nasce na frente do jogador (ou no centro da vista) */
  spawn(id: string): void {
    const sp = this.spawnAt?.();
    if (!sp) return;
    if (this.mv) this.cancel();
    this.closeCatalog();
    this.select(null);
    const data: RoomItem3D = { id, x: 180, y: 300 };
    this.mv = { it: null, data, room: sp.room, isNew: true, x: sp.x, y: 0, z: sp.z, ok: true, want: null };
    this.ghost.setItem(data, sp.room.id);
    this.aimLocal(sp.room, sp.x, sp.y ?? 1.4, sp.z);
    this.ghost.snap();
    this.showBar();
    sfx.pick();
    this.onState?.();
  }
  private yawOf(d: RoomItem3D): number {
    return KINDS[kindOf(d.id).kind].wall || KINDS[kindOf(d.id).kind].ceil ? 0 : (quarterOf(d) * Math.PI) / 2;
  }
  /** mira com um raio (centro da tela no FPS, dedo na vista aérea) */
  aimRay(ray: THREE.Ray, opts: { minD?: number; maxD?: number; room?: RoomRec | null } = {}): void {
    const m = this.mv;
    if (!m) return;
    const info = KINDS[kindOf(m.data.id).kind];
    if (info.wall) {
      // parede do fundo do cômodo onde está (ou o que está sob a mira)
      const fp = ray.intersectPlane(PLANE, V.clone());
      const room = opts.room ?? ((fp && this.eng.roomAt(fp.x, fp.z)) || m.room);
      const n = room.walls[0].normal;
      const p0 = room.group.localToWorld(new THREE.Vector3(0, 0, 0.12));
      const hit = ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), new THREE.Vector3());
      if (!hit) return;
      const l = room.group.worldToLocal(hit);
      this.aimLocal(room, l.x, l.y, l.z);
      return;
    }
    let p = ray.intersectPlane(PLANE, V);
    const minD = opts.minD ?? 0,
      maxD = opts.maxD ?? 60;
    const flat = new THREE.Vector3(ray.direction.x, 0, ray.direction.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    if (!p) p = V.copy(ray.origin).addScaledVector(flat, maxD).setY(0);
    const dx = p.x - ray.origin.x,
      dz = p.z - ray.origin.z;
    const d = Math.hypot(dx, dz);
    if (d < minD) p.set(ray.origin.x + flat.x * minD, 0, ray.origin.z + flat.z * minD);
    else if (d > maxD) p.set(ray.origin.x + (dx / d) * maxD, 0, ray.origin.z + (dz / d) * maxD);
    const room = opts.room ?? this.eng.roomAt(p.x, p.z) ?? m.room;
    const l = room.group.worldToLocal(p.clone());
    this.aimLocal(room, l.x, 0, l.z);
  }
  private lastKey = '';
  private lastMv: Moving | null = null;
  aimLocal(room: RoomRec, x: number, y: number, z: number): void {
    const m = this.mv;
    if (!m) return;
    if (m !== this.lastMv) (this.lastMv = m), (this.lastKey = '');
    m.want = { room, x, y, z };
    const info = KINDS[kindOf(m.data.id).kind];
    const self = m.it;
    if (info.wall) {
      const { kind, v } = kindOf(m.data.id);
      const s = solveWall(room, this.eng.items, m.data, self, x, y - dimsOf(kind, v).h / 2);
      m.room = room;
      m.x = s.x;
      m.y = s.y;
      m.z = s.z;
      m.ok = s.ok;
    } else if (info.ceil) {
      m.room = room;
      const pl = itemToPlace({ ...m.data, ...placeItemXY(m.data, { x, y: 0, z }) });
      m.x = pl.x;
      m.y = pl.y;
      m.z = pl.z;
      m.ok = true;
    } else {
      // mesma casa da grade de antes: nada a recalcular (economiza no celular fraco)
      const key = room.id + ':' + Math.round(x / GRID) + ':' + Math.round(z / GRID) + ':' + quarterOf(m.data);
      if (key === this.lastKey) return;
      this.lastKey = key;
      const s = solveFloor(room, this.eng.items, m.data, self, x, z);
      m.room = room;
      m.x = s.x;
      m.y = 0;
      m.z = s.z;
      m.ok = s.ok;
    }
    this.ghost.setGoal(m.room, m.x, m.y, m.z, this.yawOf(m.data), m.ok);
    this.renderBar();
  }
  rotate(): void {
    const m = this.mv;
    if (!m) return;
    const info = KINDS[kindOf(m.data.id).kind];
    if (info.wall || info.ceil) return;
    const base = isSide(kindOf(m.data.id).kind) ? 1 : 0;
    setQuarter(m.data, (quarterOf(m.data) - base + 1) % 4);
    const w = m.want ?? { room: m.room, x: m.x, y: m.y, z: m.z };
    this.aimLocal(w.room, w.x, w.y, w.z);
    sfx.click();
  }
  async confirm(): Promise<void> {
    const m = this.mv;
    if (!m) return;
    if (!m.ok) {
      sfx.thud();
      this.toastOnce(t('home3d.toast.noSpace', 'Não cabe aqui'));
      return;
    }
    if (m.isNew && !(await this.acquire(m.data.id))) return;
    if (this.mv !== m) return;
    this.mv = null;
    this.ghost.hide();
    this.hideBar();
    if (m.isNew) {
      const xy = placeItemXY(m.data, { x: m.x, y: m.y, z: m.z });
      m.data.x = xy.x;
      m.data.y = xy.y;
      m.room.design.items.push(m.data);
      const it = this.eng.addItem(m.room, m.data);
      popObj(it.obj, 0.2);
      this.eng.burst(it.obj.position.x, 0.25, it.obj.position.z, 18, 'spark', '#ffe27a', 2);
    } else if (m.it) {
      this.apply(m.it, m.room, m.data, m.x, m.y, m.z);
      m.it.obj.visible = true;
      popObj(m.it.obj);
      if (m.it.body) m.it.body.collisionResponse = true;
      this.eng.burst(m.it.obj.position.x, 0.15, m.it.obj.position.z, 12, 'poof', '#ffffff', 1.2);
    }
    this.eng.changed = true;
    sfx.drop();
    this.onState?.();
  }
  cancel(): void {
    const m = this.mv;
    if (!m) return;
    this.mv = null;
    this.ghost.hide();
    this.hideBar();
    if (m.it) {
      m.it.obj.visible = m.it.state !== 'broken';
      if (m.it.body) m.it.body.collisionResponse = true;
      this.eng.homeItem(m.it);
    }
    this.onState?.();
  }
  /** grava a nova posição/cômodo/giro de um móvel existente */
  private apply(it: ItemRec, room: RoomRec, data: RoomItem3D, x: number, y: number, z: number): void {
    const xy = placeItemXY(data, { x, y, z });
    if (room !== it.room) {
      const from = it.room.design.items;
      const i = from.indexOf(it.data);
      if (i >= 0) from.splice(i, 1);
      room.design.items.push(it.data);
      it.room = room;
    }
    it.data.x = xy.x;
    it.data.y = xy.y;
    if (data.r3 !== undefined) it.data.r3 = data.r3;
    if (data.flip !== undefined) it.data.flip = data.flip;
    else delete it.data.flip;
    it.fromMess = false;
    this.eng.rehome(it);
    this.eng.changed = true;
  }

  /* ---------------- barra de mover ---------------- */
  private showBar(): void {
    this.bar.style.display = '';
    this.renderBar(true);
  }
  private hideBar(): void {
    this.bar.style.display = 'none';
  }
  private barSig = '';
  private renderBar(force = false): void {
    const m = this.mv;
    if (!m) return;
    const info = KINDS[kindOf(m.data.id).kind];
    const sig = (info.wall || info.ceil ? 'w' : 'f') + (m.ok ? 1 : 0);
    if (sig === this.barSig && !force) return;
    this.barSig = sig;
    this.bar.innerHTML = '';
    const add = (id: string, icon: string, label: string, cls: string, fn: () => void) => {
      const b = el('button', 'h3-mb ' + cls, `${ICON[icon] ?? ''}<span>${esc(label)}</span>`);
      b.type = 'button';
      b.dataset.id = id;
      b.onclick = (e) => {
        e.stopPropagation();
        fn();
      };
      this.bar.appendChild(b);
    };
    if (!info.wall && !info.ceil) add('rot', 'rotate', t('home3d.build.rotate', 'Girar'), '', () => this.rotate());
    add('cancel', 'x', t('home3d.build.cancel', 'Cancelar'), '', () => this.cancel());
    add('place', 'check', t('home3d.build.place', 'Colocar'), m.ok ? 'go' : 'go off', () => void this.confirm());
  }

  /* ---------------- catálogo ---------------- */
  toggleCatalog(): void {
    if (this.drawerOpen) this.closeCatalog();
    else this.openCatalog();
  }
  openCatalog(tab?: string): void {
    if (!this.canDeco) return;
    if (this.mv) this.cancel();
    this.select(null);
    if (tab) this.tab = tab;
    this.renderCatalog();
    this.drawer.classList.add('on');
    sfx.click();
    this.onState?.();
  }
  closeCatalog(): void {
    if (!this.drawerOpen) return;
    this.drawer.classList.remove('on');
    this.ask?.remove();
    this.ask = null;
    this.onState?.();
  }
  private countOf(id: string): number {
    let n = 0;
    for (const r of this.eng.rooms) for (const it of r.design.items) if (it.id === id) n++;
    return n;
  }
  private costOf(id: string): Cost3D {
    return (furnById(id)?.cost as Cost3D | undefined) ?? { kind: 'free' };
  }
  private isOwned(id: string): boolean {
    const c = this.costOf(id);
    return !this.shop || c.kind === 'free' || this.shop.owns('furn:' + id) || this.countOf(id) > 0;
  }
  renderCatalog(): void {
    const d = this.drawer;
    d.innerHTML = '';
    const head = el('div', 'hd');
    const tabs = el('div', 'tabs');
    for (const tb of CATALOG_TABS) {
      const b = el('button', 'tab' + (tb.id === this.tab ? ' sel' : ''), `${ICON[tb.icon] ?? ''}<span>${esc(tb.label())}</span>`);
      b.type = 'button';
      b.onclick = () => {
        this.tab = tb.id;
        sfx.click();
        this.renderCatalog();
      };
      tabs.appendChild(b);
    }
    const x = el('button', 'cls', ICON.x);
    x.type = 'button';
    x.setAttribute('aria-label', t('home3d.cat.close', 'Fechar'));
    x.onclick = () => this.closeCatalog();
    head.append(tabs, x);
    d.appendChild(head);
    const body = el('div', 'body');
    d.appendChild(body);
    const tb = CATALOG_TABS.find((c) => c.id === this.tab) ?? CATALOG_TABS[0];
    if (tb.surf && canUse(this.eng.role, 'build')) body.appendChild(this.surfaceRow(tb.surf));
    const row = el('div', 'cards');
    for (const k of tb.kinds)
      for (let v = 0; v < 3; v++) {
        const id = k + v;
        const def = furnById(id);
        if (!def) continue;
        const own = this.isOwned(id);
        const n = this.countOf(id);
        const c = this.costOf(id);
        const price = own ? (n ? `<em class="n">×${n}</em>` : `<em class="ok">${ICON.check}</em>`) : c.kind === 'coins' ? `<em class="pr">●${c.n}</em>` : c.kind === 'gems' ? `<em class="pr gem">◆${c.n}</em>` : c.kind === 'video' ? `<em class="pr">▶</em>` : `<em class="pr lock">${ICON.lock}</em>`;
        const b = el('button', 'card', `<img src="${furnThumb(id)}" alt="" width="64" height="56"><span>${esc(def.name())}</span>${price}`);
        b.type = 'button';
        b.onclick = () => this.spawn(id);
        row.appendChild(b);
      }
    body.appendChild(row);
  }
  private surfaceRow(kind: 'floor' | 'wall'): HTMLElement {
    const room = this.spawnAt?.()?.room ?? this.eng.rooms[0];
    const wrap = el('div', 'surf');
    const isFloor = kind === 'floor';
    const [cur, curCol] = surface(isFloor ? room.design.floor : room.design.wall, isFloor ? 'wood:15' : 'paint:14');
    const styles = isFloor ? FLOOR_STYLES : WALL_STYLES;
    const sRow = el('div', 'chips');
    for (const s of styles) {
      const b = el('button', 'h3-chip' + (s === cur ? ' sel' : ''), esc(t((isFloor ? 'home3d.floor.' : 'home3d.wall.') + s, surfName(s))));
      b.type = 'button';
      b.onclick = () => this.setSurface(room, kind, s, PALETTE.indexOf(curCol as (typeof PALETTE)[number]));
      sRow.appendChild(b);
    }
    const cRow = el('div', 'chips');
    PALETTE.forEach((col, i) => {
      const sw = el('div', 'h3-sw' + (col === curCol ? ' sel' : ''));
      sw.style.background = col;
      sw.onclick = () => this.setSurface(room, kind, cur, i);
      cRow.appendChild(sw);
    });
    wrap.append(sRow, cRow);
    return wrap;
  }
  private setSurface(r: RoomRec, kind: 'floor' | 'wall', style: string, colIdx: number): void {
    const spec = style + ':' + Math.max(0, colIdx);
    if (kind === 'floor') r.design.floor = spec;
    else {
      r.design.wall = spec;
      r.paint = null;
      r.base = null;
      r.cover.fill(0);
      if (this.eng.design.paint) delete this.eng.design.paint[r.id];
    }
    this.eng.refreshSurfaces(r);
    this.eng.changed = true;
    sfx.pick();
    this.renderCatalog();
  }

  /* ---------------- compra ---------------- */
  /** confirma e cobra (pequeno balão no topo); true = pode usar */
  async acquire(id: string): Promise<boolean> {
    if (this.isOwned(id)) return true;
    const c = this.costOf(id);
    if (c.kind === 'pass' || c.kind === 'event') {
      this.toastOnce(c.kind === 'pass' ? t('home.buy.pass', 'Exclusivo do Passe! Desbloqueie no Passe.') : t('home.buy.event', 'Exclusivo de evento especial!'));
      return false;
    }
    const name = furnById(id)?.name() ?? id;
    const q =
      c.kind === 'coins'
        ? t('home3d.buy.coins', 'Liberar {name} por {n} moedas?', { name, n: c.n })
        : c.kind === 'gems'
          ? t('home3d.buy.gems', 'Liberar {name} por {n} gemas?', { name, n: c.n })
          : t('home3d.buy.video', 'Assistir um vídeo para liberar {name}?', { name });
    if (!(await this.confirmBox(q))) return false;
    const ok = await this.shop!.buy('furn:' + id, c);
    if (!ok) {
      this.toastOnce(t('home.buy.poor', 'Ainda não dá. Jogue para ganhar mais!'));
      sfx.thud();
      return false;
    }
    sfx.sparkle();
    return true;
  }
  /** caixinha de sim/não pequena (fica no 3D; os diálogos do 2D ficam escondidos atrás) */
  confirmBox(text: string): Promise<boolean> {
    this.ask?.remove();
    const box = el('div', 'h3-ask', `<p>${esc(text)}</p>`);
    const no = el('button', 'h3-btn', `<span>${esc(t('home3d.no', 'Agora não'))}</span>`);
    const yes = el('button', 'h3-btn sel', `${ICON.check}<span>${esc(t('home3d.yes', 'Sim!'))}</span>`);
    const row = el('div', 'rw');
    row.append(no, yes);
    box.appendChild(row);
    this.layer.appendChild(box);
    this.ask = box;
    return new Promise((res) => {
      const done = (v: boolean) => {
        box.remove();
        if (this.ask === box) this.ask = null;
        res(v);
      };
      no.onclick = () => done(false);
      yes.onclick = () => done(true);
    });
  }

  /* ---------------- avisos ---------------- */
  private lastToast = '';
  private lastToastT = 0;
  toastOnce(s: string): void {
    const now = performance.now();
    if (s === this.lastToast && now - this.lastToastT < 1800) return;
    this.lastToast = s;
    this.lastToastT = now;
    this.toast(s);
  }

  /* ---------------- laço ---------------- */
  update(dt: number): void {
    this.ghost.update(dt);
    const mv = this.mv;
    const info = mv ? KINDS[kindOf(mv.data.id).kind] : null;
    this.grid.visible = !!mv && !info!.wall && !info!.ceil;
    if (mv) {
      this.grid.position.copy(mv.room.group.position).setY(0.008);
      this.grid.rotation.y = mv.room.rotY;
    }
    if (this.sel) {
      if (!this.eng.items.includes(this.sel)) this.select(null);
      else {
        this.selRing.position.set(this.sel.obj.position.x, 0.025, this.sel.obj.position.z);
        this.selRing.rotation.y += dt * 0.8;
        this.placePopup();
      }
    }
  }
  /** esconde tudo (troca de modo / sair) */
  reset(): void {
    this.cancel();
    this.select(null);
    this.closeCatalog();
  }
  dispose(): void {
    this.reset();
    this.ghost.dispose();
    this.eng.scene.remove(this.selRing, this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.selRing.geometry.dispose();
    (this.selRing.material as THREE.Material).dispose();
    for (const e of [this.popup, this.bar, this.drawer]) e.remove();
  }
}
const isSide = (k: Kind) => k === 'bed' || k === 'bunk';
export function surfName(s: string): string {
  return (
    ({
      wood: 'Madeira', tile: 'Azulejo', carpet: 'Carpete', checker: 'Xadrez', stone: 'Pedra', grass: 'Gramado', stars: 'Estrelas', hex: 'Colmeia', stripes: 'Listras',
      dots: 'Bolinhas', marble: 'Mármore', candy: 'Doce', paint: 'Pintura', brick: 'Tijolos', hearts: 'Corações', waves: 'Ondas', check: 'Xadrez', clouds: 'Nuvens', space: 'Espaço',
    } as Record<string, string>)[s] ?? s
  );
}
