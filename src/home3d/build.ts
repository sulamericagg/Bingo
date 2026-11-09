/* ============================================================
 *  MODO CONSTRUÇÃO — "visão de cima" tipo casa de bonecas:
 *  câmera orbital (pinça = zoom, dois dedos = girar, arrastar = mover),
 *  paredes do lado da câmera recortadas, grade no chão, catálogo para
 *  colocar/mover/girar/recolorir móveis com fantasma verde/vermelho,
 *  piso e papel de parede por cômodo, troca de cômodo.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../i18n';
import {
  canUse, defaultColorIdx, FLOOR_STYLES, itemColor, KIND_ORDER, KINDS, kindOf, PALETTE, placeToXY, ROOM_D, ROOM_W, surface, WALL_H, WALL_STYLES, WALL_T,
  type Kind,
} from './adapter';
import type { Engine, ItemRec, RoomRec } from './engine';
import { sfx } from './sfx';
import { button, el, esc, lockTip } from './ui';

const CATS: { id: string; label: () => string; kinds: Kind[] }[] = [
  { id: 'seat', label: () => t('home3d.cat.seat', 'Sentar'), kinds: ['sofa', 'armchair', 'chair', 'stool', 'beanbag', 'bed', 'bunk'] },
  { id: 'table', label: () => t('home3d.cat.table', 'Mesas'), kinds: ['table', 'desk', 'partytable', 'counter', 'toybox', 'bookcase', 'wardrobe'] },
  { id: 'fun', label: () => t('home3d.cat.fun', 'Diversão'), kinds: ['tv', 'arcade', 'aquarium', 'piano', 'guitar', 'speaker', 'computer', 'teddy', 'balloons', 'discoball'] },
  { id: 'deco', label: () => t('home3d.cat.deco', 'Enfeites'), kinds: ['plant', 'cactus', 'rug', 'floorlamp', 'tablelamp', 'fireplace', 'garland'] },
  { id: 'wall', label: () => t('home3d.cat.wall', 'Parede'), kinds: ['poster', 'painting', 'shelf', 'mirror', 'clock', 'window'] },
  { id: 'kb', label: () => t('home3d.cat.kb', 'Cozinha e banho'), kinds: ['fridge', 'stove', 'sink', 'bathtub', 'toilet'] },
];
const UP = new THREE.Vector3(0, 1, 0);

export class Build {
  room: RoomRec;
  yaw = 0.6;
  pitch = 0.95;
  dist = 8.5;
  target = new THREE.Vector3();
  sel: ItemRec | null = null;
  /** item novo ainda não confirmado */
  ghost: ItemRec | null = null;
  private valid = true;
  private dragFrom: { x: number; y: number } | null = null;
  private dragItem = false;
  private ptrs = new Map<number, { x: number; y: number }>();
  private pinch0 = 0;
  private ang0 = 0;
  private ray = new THREE.Raycaster();
  private grid: THREE.GridHelper;
  readonly ui: HTMLDivElement;
  private cat: HTMLDivElement;
  private side: HTMLDivElement;
  private left: HTMLDivElement;
  private catSel = 'seat';
  private variant = 0;
  private surfPanel: 'floor' | 'wall' | null = null;
  private orig = new Map<ItemRec, { p: THREE.Vector3; q: THREE.Quaternion }>();
  private tintMats = new Map<ItemRec, THREE.Material>();
  active = false;
  onToast?: (s: string) => void;

  constructor(
    readonly eng: Engine,
    readonly layer: HTMLElement,
    room: RoomRec,
  ) {
    this.room = room;
    this.target.copy(room.center);
    this.grid = new THREE.GridHelper(ROOM_W, 12, 0xffffff, 0xffffff);
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.18;
    gm.depthWrite = false;
    this.grid.visible = false;
    eng.scene.add(this.grid);
    this.ui = el('div', 'h3-layer');
    this.ui.style.pointerEvents = 'none';
    this.left = el('div', 'h3-left');
    this.side = el('div', 'h3-side');
    this.cat = el('div', 'h3-cat');
    this.ui.append(this.left, this.side, this.cat);
    for (const e of [this.left, this.side, this.cat]) e.style.pointerEvents = 'auto';
    layer.appendChild(this.ui);
    this.ui.style.display = 'none';
  }

  /* ---------------- entrar / sair ---------------- */
  enter(room: RoomRec): void {
    this.active = true;
    this.setRoom(room);
    this.ui.style.display = '';
    for (const r of this.eng.rooms) r.ceil.visible = false;
    this.grid.visible = true;
    this.layer.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    this.layer.addEventListener('wheel', this.wheel, { passive: false });
    this.renderSide();
  }
  exit(): void {
    if (this.ghost) this.cancelGhost();
    this.select(null);
    this.active = false;
    this.ui.style.display = 'none';
    this.cat.classList.remove('on');
    for (const r of this.eng.rooms) {
      r.ceil.visible = true;
      for (const w of r.walls) (w.cut = 1), w.holder.scale.set(1, 1, 1);
    }
    this.grid.visible = false;
    this.layer.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.layer.removeEventListener('wheel', this.wheel);
  }
  setRoom(r: RoomRec): void {
    this.room = r;
    this.target.copy(r.center);
    this.grid.position.set(r.center.x, 0.004, r.center.z);
    this.grid.rotation.y = r.rotY;
    this.renderLeft();
  }

  /* ---------------- UI ---------------- */
  private renderLeft(): void {
    this.left.innerHTML = '';
    for (const r of this.eng.rooms) {
      const b = button(roomName(r.id), 'build');
      if (r === this.room) b.classList.add('sel');
      b.onclick = () => {
        sfx.click();
        this.select(null);
        this.setRoom(r);
      };
      this.left.appendChild(b);
    }
  }
  renderSide(): void {
    this.side.innerHTML = '';
    const role = this.eng.role;
    const add = (id: string, label: string, icon: string, allowed: boolean, fn: () => void) => {
      const b = button(label, icon);
      b.dataset.id = id;
      if (!allowed) {
        b.classList.add('lock');
        b.insertAdjacentHTML('beforeend', `<span class="lk"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg></span>`);
        b.style.position = 'relative';
        b.onclick = () => lockTip(this.layer, b, t('home3d.lock.role', 'O dono da casa não liberou isso para você'));
      } else
        b.onclick = () => {
          sfx.click();
          fn();
        };
      this.side.appendChild(b);
    };
    const deco = canUse(role, 'decorate');
    if (this.ghost) {
      add('place', t('home3d.build.place', 'Colocar'), 'check', true, () => this.confirmGhost());
      add('rot', t('home3d.build.rotate', 'Girar'), 'rotate', true, () => this.rotateSel());
      add('cancel', t('home3d.build.cancel', 'Cancelar'), 'exit', true, () => this.cancelGhost());
    } else if (this.sel) {
      add('rot', t('home3d.build.rotate', 'Girar'), 'rotate', deco, () => this.rotateSel());
      add('color', t('home3d.build.color', 'Cor'), 'color', deco, () => this.colorSel());
      add('del', t('home3d.build.remove', 'Guardar'), 'trash', deco, () => this.removeSel());
      add('done', t('home3d.build.done', 'Pronto'), 'check', true, () => this.select(null));
    } else {
      add('add', t('home3d.build.add', 'Móveis'), 'plus', deco, () => this.toggleCat('furn'));
      add('floor', t('home3d.build.floor', 'Piso'), 'floor', canUse(role, 'build'), () => this.toggleCat('floor'));
      add('wall', t('home3d.build.wall', 'Parede'), 'wall', canUse(role, 'build'), () => this.toggleCat('wall'));
    }
  }
  private toggleCat(kind: 'furn' | 'floor' | 'wall'): void {
    const on = this.cat.classList.contains('on') && (kind === 'furn' ? this.surfPanel === null : this.surfPanel === kind);
    if (on) {
      this.cat.classList.remove('on');
      return;
    }
    this.surfPanel = kind === 'furn' ? null : kind;
    this.renderCat();
    this.cat.classList.add('on');
  }
  private renderCat(): void {
    const c = this.cat;
    c.innerHTML = '';
    const tabs = el('div', 'tabs');
    const grid = el('div', 'grid');
    c.append(tabs, grid);
    if (this.surfPanel) {
      const isFloor = this.surfPanel === 'floor';
      const [cur, curCol] = surface(isFloor ? this.room.design.floor : this.room.design.wall, isFloor ? 'wood:15' : 'paint:14');
      const styles = isFloor ? FLOOR_STYLES : WALL_STYLES;
      for (const s of styles) {
        const b = el('button', 'h3-chip' + (s === cur ? ' sel' : ''), esc(t((isFloor ? 'home3d.floor.' : 'home3d.wall.') + s, surfName(s))));
        b.onclick = () => this.setSurface(s, PALETTE.indexOf(curCol as (typeof PALETTE)[number]));
        tabs.appendChild(b);
      }
      PALETTE.forEach((col, i) => {
        const sw = el('div', 'h3-sw' + (col === curCol ? ' sel' : ''));
        sw.style.background = col;
        sw.onclick = () => this.setSurface(cur, i);
        grid.appendChild(sw);
      });
      return;
    }
    for (const ct of CATS) {
      const b = el('button', 'h3-chip' + (ct.id === this.catSel ? ' sel' : ''), esc(ct.label()));
      b.onclick = () => {
        this.catSel = ct.id;
        this.renderCat();
      };
      tabs.appendChild(b);
    }
    const vs = [t('home3d.var.0', 'Clássico'), t('home3d.var.1', 'Fofo'), t('home3d.var.2', 'Moderno')];
    vs.forEach((v, i) => {
      const b = el('button', 'h3-chip' + (i === this.variant ? ' sel' : ''), esc(v));
      b.style.marginLeft = i === 0 ? 'auto' : '';
      b.onclick = () => {
        this.variant = i;
        this.renderCat();
      };
      tabs.appendChild(b);
    });
    const ct = CATS.find((x) => x.id === this.catSel)!;
    for (const k of ct.kinds) {
      const col = PALETTE[defaultColorIdx(k, this.variant)];
      const b = el('button', 'h3-chip', `<i style="background:${col}"></i>${esc(t('home3d.furn.' + k, KINDS[k].name))}`);
      b.onclick = () => this.spawnGhost(k + this.variant);
      grid.appendChild(b);
    }
  }
  private setSurface(style: string, colIdx: number): void {
    const r = this.room;
    const spec = style + ':' + Math.max(0, colIdx);
    if (this.surfPanel === 'floor') r.design.floor = spec;
    else {
      r.design.wall = spec;
      r.paint = null;
      r.cover.fill(0);
      if (this.eng.design.paint) delete this.eng.design.paint[r.id];
    }
    this.eng.refreshSurfaces(r);
    this.eng.changed = true;
    sfx.pick();
    this.renderCat();
  }

  /* ---------------- seleção / edição ---------------- */
  select(it: ItemRec | null): void {
    if (this.sel && this.sel !== it) this.tint(this.sel, null);
    this.sel = it;
    if (it) this.tint(it, '#ffd84a');
    this.renderSide();
  }
  private tint(it: ItemRec, col: string | null): void {
    if (!it.solid) return;
    if (col === null) {
      const m = this.tintMats.get(it);
      if (m) {
        (it.solid.material as THREE.Material).dispose();
        it.solid.material = m;
        this.tintMats.delete(it);
      }
      return;
    }
    if (!this.tintMats.has(it)) {
      this.tintMats.set(it, it.solid.material as THREE.Material);
      it.solid.material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: col, emissiveIntensity: 0.3 });
    }
    (it.solid.material as THREE.MeshLambertMaterial).emissive.set(col);
  }
  private rotateSel(): void {
    const it = this.ghost ?? this.sel;
    if (!it || it.info.wall) return;
    it.data.r3 = ((it.data.r3 ?? (it.data.flip ? 2 : 0)) + 1) % 4;
    it.data.flip = it.data.r3 === 2;
    this.eng.rehome(it);
    this.checkValid(it);
    this.eng.changed = true;
  }
  private colorSel(): void {
    const it = this.sel;
    if (!it) return;
    const cur = PALETTE.indexOf(itemColor(it.data) as (typeof PALETTE)[number]);
    it.data.color = String((cur + 1) % PALETTE.length);
    this.tint(it, null);
    this.eng.remodel(it);
    this.tint(it, '#ffd84a');
    this.eng.changed = true;
  }
  private removeSel(): void {
    const it = this.sel;
    if (!it) return;
    this.select(null);
    const arr = it.room.design.items;
    arr.splice(arr.indexOf(it.data), 1);
    // sujeira ligada ao móvel sai junto
    this.eng.mess = this.eng.mess.filter((m) => !(m.moved && m.room === it.room.id && m.moved.itemId === it.data.id && m.moved.ox === it.data.x && m.moved.oy === it.data.y));
    this.eng.burst(it.obj.position.x, 0.3, it.obj.position.z, 16, 'poof', '#ffffff', 1.4);
    this.eng.removeItem(it);
    this.eng.changed = true;
    sfx.poof();
  }
  private spawnGhost(id: string): void {
    if (this.ghost) this.cancelGhost();
    this.cat.classList.remove('on');
    this.select(null);
    const { kind } = kindOf(id);
    const loc = this.room.group.worldToLocal(this.target.clone());
    const xy = placeToXY(kind, { x: loc.x, y: KINDS[kind].wall ? 1.4 : 0, z: KINDS[kind].wall ? 0 : loc.z });
    const data = { id, x: xy.x, y: xy.y };
    this.room.design.items.push(data);
    const it = this.eng.addItem(this.room, data);
    this.ghost = it;
    this.checkValid(it);
    this.renderSide();
    sfx.pick();
  }
  private confirmGhost(): void {
    const g = this.ghost;
    if (!g) return;
    if (!this.valid) {
      sfx.thud();
      this.onToast?.(t('home3d.toast.noSpace', 'Não cabe aqui'));
      return;
    }
    this.tint(g, null);
    this.ghost = null;
    this.eng.changed = true;
    this.eng.burst(g.obj.position.x, 0.2, g.obj.position.z, 18, 'spark', '#ffe27a', 2);
    sfx.fix();
    this.renderSide();
  }
  private cancelGhost(): void {
    const g = this.ghost;
    if (!g) return;
    this.ghost = null;
    this.tint(g, null);
    const arr = g.room.design.items;
    arr.splice(arr.indexOf(g.data), 1);
    this.eng.removeItem(g);
    this.renderSide();
  }
  /** encaixe + checagem de sobreposição (AABB no plano do cômodo) */
  private checkValid(it: ItemRec): boolean {
    let ok = true;
    if (!it.info.wall && !it.info.flat && !it.info.ceil) {
      const r = it.room;
      const l = r.group.worldToLocal(it.homeP.clone());
      const r3 = (it.data.r3 ?? 0) % 2;
      const hx = r3 ? it.dims.d / 2 : it.dims.w / 2,
        hz = r3 ? it.dims.w / 2 : it.dims.d / 2;
      for (const o of this.eng.items) {
        if (o === it || o.room !== r || o.info.wall || o.info.flat || o.info.ceil) continue;
        const ol = r.group.worldToLocal(o.homeP.clone());
        const or3 = (o.data.r3 ?? 0) % 2;
        const ohx = or3 ? o.dims.d / 2 : o.dims.w / 2,
          ohz = or3 ? o.dims.w / 2 : o.dims.d / 2;
        if (Math.abs(ol.x - l.x) < ohx + hx - 0.03 && Math.abs(ol.z - l.z) < ohz + hz - 0.03) {
          ok = false;
          break;
        }
      }
    }
    this.valid = ok;
    this.tint(it, ok ? '#5dff8a' : '#ff5c5c');
    return ok;
  }

  /* ---------------- gestos ---------------- */
  private pick(x: number, y: number): THREE.Intersection[] {
    const r = this.layer.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.eng.camera);
    return this.ray.intersectObjects(this.eng.pickables, false);
  }
  private floorPoint(x: number, y: number): THREE.Vector3 | null {
    const r = this.layer.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.eng.camera);
    const p = new THREE.Vector3();
    return this.ray.ray.intersectPlane(new THREE.Plane(UP, 0), p);
  }
  private down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,.h3-cat,.h3-side,.h3-left,.h3-top')) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      this.ang0 = Math.atan2(b.y - a.y, b.x - a.x);
      this.dragItem = false;
      return;
    }
    this.dragFrom = { x: e.clientX, y: e.clientY };
    this.dragItem = false;
    const cur = this.ghost ?? this.sel;
    const hit = this.pick(e.clientX, e.clientY).find((h) => h.object.userData?.type === 'item');
    const it = hit?.object.userData.item as ItemRec | undefined;
    if (cur && it === cur && canUse(this.eng.role, 'decorate')) {
      this.dragItem = true;
      if (!this.orig.has(cur)) this.orig.set(cur, { p: cur.homeP.clone(), q: cur.homeQ.clone() });
    }
  };
  private move = (e: PointerEvent) => {
    if (!this.ptrs.has(e.pointerId)) return;
    const prev = this.ptrs.get(e.pointerId)!;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch0 > 0) this.dist = Math.max(3.5, Math.min(16, (this.dist * this.pinch0) / d));
      this.yaw -= ang - this.ang0;
      this.pinch0 = d;
      this.ang0 = ang;
      return;
    }
    const cur = this.ghost ?? this.sel;
    if (this.dragItem && cur) {
      this.dragTo(cur, e.clientX, e.clientY);
      return;
    }
    // arrastar = mover a câmera (botão direito ou shift = girar)
    const dx = e.clientX - prev.x,
      dy = e.clientY - prev.y;
    if (e.buttons === 2 || e.shiftKey) {
      this.yaw -= dx * 0.008;
      this.pitch = Math.max(0.45, Math.min(1.35, this.pitch + dy * 0.006));
      return;
    }
    const k = this.dist * 0.0022;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    this.target.x -= (rx * dx - fx * dy) * k;
    this.target.z -= (rz * dx - fz * dy) * k;
    this.target.x = Math.max(this.room.min.x - 1, Math.min(this.room.max.x + 1, this.target.x));
    this.target.z = Math.max(this.room.min.y - 1, Math.min(this.room.max.y + 1, this.target.z));
  };
  private up = (e: PointerEvent) => {
    if (!this.ptrs.has(e.pointerId)) return;
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size === 1) {
      this.pinch0 = 0;
      return;
    }
    const from = this.dragFrom;
    this.dragFrom = null;
    const cur = this.ghost ?? this.sel;
    if (this.dragItem && cur) {
      this.dragItem = false;
      if (!this.ghost) {
        if (this.valid) {
          this.orig.delete(cur);
          this.eng.changed = true;
          sfx.drop();
        } else {
          // volta para onde estava
          const o = this.orig.get(cur);
          if (o) {
            const l = cur.room.group.worldToLocal(o.p.clone());
            const xy = placeToXY(cur.kind, l);
            cur.data.x = xy.x;
            cur.data.y = xy.y;
            this.eng.rehome(cur);
            this.orig.delete(cur);
          }
          this.tint(cur, '#ffd84a');
          sfx.thud();
        }
      }
      return;
    }
    // toque curto = selecionar
    if (from && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 8 && !this.ghost) {
      const hit = this.pick(e.clientX, e.clientY).find((h) => h.object.userData?.type === 'item');
      const it = hit?.object.userData.item as ItemRec | undefined;
      if (it && it.room !== this.room) this.setRoom(it.room);
      this.select(it && canUse(this.eng.role, 'decorate') ? it : null);
      if (it) sfx.click();
    }
  };
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = Math.max(3.5, Math.min(16, this.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  };
  private dragTo(it: ItemRec, x: number, y: number): void {
    const r = it.room;
    if (it.info.wall) {
      // desliza na parede do fundo
      const rect = this.layer.getBoundingClientRect();
      this.ray.setFromCamera(new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1), this.eng.camera);
      const n = r.walls[0].normal;
      const p0 = r.group.localToWorld(new THREE.Vector3(0, 0, WALL_T));
      const hit = this.ray.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, p0), new THREE.Vector3());
      if (!hit) return;
      const l = r.group.worldToLocal(hit);
      l.y = Math.max(0.6, Math.min(WALL_H - it.dims.h - 0.05, l.y - it.dims.h / 2));
      const xy = placeToXY(it.kind, { x: Math.round(l.x * 10) / 10, y: l.y, z: 0 });
      it.data.x = xy.x;
      it.data.y = xy.y;
      this.eng.rehome(it);
      this.valid = true;
      return;
    }
    const p = this.floorPoint(x, y);
    if (!p) return;
    const l = r.group.worldToLocal(p);
    l.x = Math.round(l.x * 10) / 10;
    l.z = Math.round(l.z * 10) / 10;
    const xy = placeToXY(it.kind, { x: l.x, y: 0, z: l.z });
    it.data.x = xy.x;
    it.data.y = xy.y;
    this.eng.rehome(it);
    this.checkValid(it);
  }

  /* ---------------- laço ---------------- */
  update(dt: number): void {
    if (!this.active) return;
    if (this.eng.camera.parent) this.eng.camera.rotation.order = 'YXZ';
    const cam = this.eng.camera;
    const cp = Math.cos(this.pitch);
    cam.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    cam.lookAt(this.target);
    cam.updateMatrixWorld();
    // paredes viradas para a câmera: recorte baixinho (casa de bonecas)
    const dx = this.target.x - cam.position.x,
      dz = this.target.z - cam.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    for (const r of this.eng.rooms)
      for (const w of r.walls) {
        const facing = (w.normal.x * dx + w.normal.z * dz) / dl;
        const goal = facing > 0.3 ? 0.12 : 1;
        w.cut += (goal - w.cut) * Math.min(1, dt * 8);
        w.holder.scale.y = w.cut;
      }
    // itens de parede seguem a parede recortada
    for (const it of this.eng.items) {
      if (!it.info.wall) continue;
      const w = it.room.walls[0];
      it.obj.visible = it.state !== 'broken' && w.cut > 0.6;
    }
    void ROOM_D;
    void KIND_ORDER;
  }
  dispose(): void {
    this.exit();
    for (const [it, m] of this.tintMats) {
      (it.solid!.material as THREE.Material).dispose();
      it.solid!.material = m;
    }
    this.eng.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.ui.remove();
  }
}
export function roomName(r: string): string {
  return r === 'kitchen'
    ? t('home3d.room.kitchen', 'Cozinha')
    : r === 'bath'
      ? t('home3d.room.bath', 'Banheiro')
      : r === 'bedroom'
        ? t('home3d.room.bedroom', 'Quarto')
        : r === 'party'
          ? t('home3d.room.party', 'Salão de festa')
          : t('home3d.room.living', 'Sala');
}
function surfName(s: string): string {
  return (
    ({
      wood: 'Madeira', tile: 'Azulejo', carpet: 'Carpete', checker: 'Xadrez', stone: 'Pedra', grass: 'Gramado', stars: 'Estrelas', hex: 'Colmeia', stripes: 'Listras',
      dots: 'Bolinhas', marble: 'Mármore', candy: 'Doce', paint: 'Pintura', brick: 'Tijolos', hearts: 'Corações', waves: 'Ondas', check: 'Xadrez', clouds: 'Nuvens', space: 'Espaço',
    } as Record<string, string>)[s] ?? s
  );
}
