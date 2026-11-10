/* ============================================================
 *  VISTA AÉREA — casa de bonecas vista de cima (3/4):
 *  a câmera voa suave da primeira pessoa até o alto, paredes rebaixadas para
 *  ver dentro de todos os cômodos, pinça = zoom, arrastar = passear, dois dedos
 *  girando = girar. Dá para tocar num móvel (menu), mover (arrastar o fantasma),
 *  colocar do catálogo e AMPLIAR A CASA (placas "+" nas bordas, com preço).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../i18n';
import { ROOM_D, ROOM_W, WALL_H } from './adapter';
import { extraId, freeSlots, HOUSE, MAX_ROOMS, roomFrame, type Engine, type ItemRec, type RoomRec } from './engine';
import type { Decor } from './decor';
import type { Paint3D } from './paint3d';
import { sfx } from './sfx';
import { button, el } from './ui';

const UP = new THREE.Vector3(0, 1, 0);
const V = new THREE.Vector3();
/** preço de cada cômodo extra (moedas): sobe a cada um */
export const roomPrice = (extras: number) => 800 + extras * 400;

interface Pose {
  p: THREE.Vector3;
  q: THREE.Quaternion;
}

export class Aerial {
  yaw = 0.35;
  pitch = 0.98;
  dist = 13;
  target = new THREE.Vector3();
  active = false;
  /** voo da câmera (0..1) */
  private fly = 1;
  private flyFrom: Pose = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
  private flyTo: Pose | null = null;
  private flyDone: (() => void) | null = null;
  private ptrs = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private pinch0 = 0;
  private ang0 = 0;
  private mid0 = { x: 0, y: 0 };
  private dragGhost: THREE.Vector3 | null = null;
  private ray = new THREE.Raycaster();
  private tiles: { mesh: THREE.Mesh; row: number; col: number; id: string; price: number }[] = [];
  private tileMat = new Map<number, THREE.MeshBasicMaterial>();
  private tileGeo = new THREE.PlaneGeometry(ROOM_W - 0.4, ROOM_D - 0.4);
  readonly ui: HTMLDivElement;
  private left: HTMLDivElement;
  onToast?: (s: string) => void;
  /** pintar arrastando o dedo (Vista aérea) */
  paint: Paint3D | null = null;
  painting = false;
  private paintPid = -1;
  private paintXY: [number, number] = [0, 0];
  /** comprar um cômodo extra (o index liga na loja); true = pago */
  buyRoom?: (id: string, price: number) => Promise<boolean>;
  /** cômodo novo pronto (index avisa o resto: festa, salvar) */
  onRoomAdded?: (r: RoomRec) => void;

  constructor(
    readonly eng: Engine,
    readonly layer: HTMLElement,
    readonly decor: Decor,
  ) {
    this.ui = el('div', 'h3-layer');
    this.ui.style.pointerEvents = 'none';
    this.left = el('div', 'h3-left');
    this.left.style.pointerEvents = 'auto';
    this.ui.appendChild(this.left);
    layer.appendChild(this.ui);
    this.ui.style.display = 'none';
  }

  private orbitPose(out: Pose): Pose {
    const cp = Math.cos(this.pitch);
    out.p.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    const m = new THREE.Matrix4().lookAt(out.p, this.target, UP);
    out.q.setFromRotationMatrix(m);
    return out;
  }
  private startFly(to: Pose | null, done: (() => void) | null): void {
    const cam = this.eng.camera;
    this.flyFrom.p.copy(cam.position);
    this.flyFrom.q.copy(cam.quaternion);
    this.flyTo = to;
    this.fly = 0;
    this.flyDone = done;
  }

  /* ---------------- entrar / sair ---------------- */
  enter(room: RoomRec | null): void {
    this.active = true;
    this.ui.style.display = '';
    for (const r of this.eng.rooms) r.ceil.visible = false;
    this.focusHouse(room);
    this.startFly(null, null);
    this.layer.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    this.layer.addEventListener('wheel', this.wheel, { passive: false });
    this.renderLeft();
    this.refreshTiles();
    this.decor.spawnAt = () => {
      const r = this.eng.roomAt(this.target.x, this.target.z) ?? this.nearestRoom();
      const l = r.group.worldToLocal(this.target.clone());
      return { room: r, x: Math.max(0.6, Math.min(ROOM_W - 0.6, l.x)), z: Math.max(0.6, Math.min(ROOM_D - 0.6, l.z)) };
    };
  }
  /** voa de volta para a primeira pessoa; `to` = pose do olho */
  leave(to: Pose, done: () => void): void {
    this.decor.reset();
    this.startFly(to, () => {
      this.exit();
      done();
    });
  }
  exit(): void {
    this.active = false;
    this.painting = false;
    this.paintPid = -1;
    this.flyTo = null;
    this.fly = 1;
    this.ui.style.display = 'none';
    for (const r of this.eng.rooms) {
      r.ceil.visible = true;
      for (const w of r.walls) (w.cut = 1), (w.holder.scale.y = 1);
    }
    for (const it of this.eng.items) if (it.info.wall) it.obj.visible = it.state !== 'broken';
    for (const tl of this.tiles) tl.mesh.visible = false;
    this.layer.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.layer.removeEventListener('wheel', this.wheel);
    this.ptrs.clear();
  }
  private nearestRoom(): RoomRec {
    let best = this.eng.rooms[0],
      bd = 1e9;
    for (const r of this.eng.rooms) {
      const d = r.center.distanceToSquared(this.target);
      if (d < bd) (bd = d), (best = r);
    }
    return best;
  }
  /** enquadra a casa inteira (ou um cômodo, mais perto) */
  focusHouse(room: RoomRec | null): void {
    if (room) {
      this.target.copy(room.center);
      this.dist = 9.5;
    } else {
      const b = new THREE.Box3();
      for (const r of this.eng.rooms) b.expandByPoint(V.set(r.min.x, 0, r.min.y)).expandByPoint(V.set(r.max.x, 0, r.max.y));
      b.getCenter(this.target);
      this.target.y = 0;
      this.dist = Math.min(26, 4 + Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.58);
    }
  }
  private renderLeft(): void {
    this.left.innerHTML = '';
    for (const r of this.eng.rooms) {
      const b = button(roomName(r.id), 'build');
      b.onclick = () => {
        sfx.click();
        this.decor.select(null);
        this.target.copy(r.center);
        this.dist = 9.5;
      };
      this.left.appendChild(b);
    }
  }

  /* ---------------- ampliar ---------------- */
  refreshTiles(): void {
    for (const tl of this.tiles) this.eng.scene.remove(tl.mesh);
    this.tiles = [];
    if (!this.eng.editable || !this.buyRoom) return;
    const ids = this.eng.rooms.map((r) => r.id);
    const extras = ids.filter((id) => id.startsWith('x')).length;
    const price = roomPrice(extras);
    for (const s of freeSlots(ids)) {
      const f = roomFrame(s.row, s.col);
      const mesh = new THREE.Mesh(this.tileGeo, this.tileMaterial(price));
      mesh.rotation.x = -Math.PI / 2;
      const cx = f.rotY === 0 ? f.x + ROOM_W / 2 : f.x - ROOM_W / 2;
      const cz = f.rotY === 0 ? f.z + ROOM_D / 2 : f.z - ROOM_D / 2;
      mesh.position.set(cx, 0.02, cz);
      mesh.renderOrder = 3;
      mesh.visible = this.active;
      this.eng.scene.add(mesh);
      this.tiles.push({ mesh, row: s.row, col: s.col, id: s.id, price });
    }
  }
  private tileMaterial(price: number): THREE.MeshBasicMaterial {
    let m = this.tileMat.get(price);
    if (m) return m;
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 256;
    const x = c.getContext('2d')!;
    x.fillStyle = 'rgba(255,255,255,0.16)';
    x.strokeStyle = '#ffffff';
    x.lineWidth = 8;
    x.setLineDash([22, 14]);
    x.beginPath();
    x.roundRect(8, 8, 304, 240, 26);
    x.fill();
    x.stroke();
    x.setLineDash([]);
    x.fillStyle = '#ffd84a';
    x.beginPath();
    x.arc(160, 104, 46, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.fillRect(150, 76, 20, 56);
    x.fillRect(132, 94, 56, 20);
    x.font = '700 30px Fredoka, system-ui, sans-serif';
    x.textAlign = 'center';
    x.fillStyle = '#ffffff';
    x.fillText(t('home3d.expand.tile', 'Ampliar casa'), 160, 186);
    x.fillStyle = '#ffd84a';
    x.fillText('● ' + price, 160, 222);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    this.tileMat.set(price, m);
    return m;
  }
  private async expand(tile: { row: number; col: number; id: string; price: number }): Promise<void> {
    if (this.eng.rooms.length >= MAX_ROOMS) return;
    const ok = await this.decor.confirmBox(t('home3d.expand.ask', 'Construir um cômodo novo aqui por {n} moedas?', { n: tile.price }));
    if (!ok || !this.buyRoom) return;
    if (!(await this.buyRoom(tile.id, tile.price))) {
      this.onToast?.(t('home.buy.poor', 'Ainda não dá. Jogue para ganhar mais!'));
      sfx.thud();
      return;
    }
    const pal = ['wood:15', 'tile:7', 'carpet:13', 'marble:19', 'stripes:14'];
    const n = this.eng.rooms.length;
    const rd = { id: extraId(tile.row, tile.col), floor: pal[n % pal.length], wall: ['paint:14', 'dots:13', 'stripes:7', 'clouds:8'][n % 4], items: [] };
    this.eng.design.rooms.push(rd);
    const room = this.eng.addRoom(rd);
    if (!room) return;
    room.ceil.visible = false;
    this.eng.changed = true;
    this.refreshTiles();
    this.renderLeft();
    this.target.copy(room.center);
    this.dist = 10;
    for (let i = 0; i < 10; i++) {
      const p = room.group.localToWorld(new THREE.Vector3(Math.random() * ROOM_W, 0.2, Math.random() * ROOM_D));
      this.eng.burst(p.x, p.y, p.z, 6, 'poof', '#ffffff', 1.6);
    }
    sfx.sparkle();
    this.onToast?.(t('home3d.expand.done', 'Cômodo novo pronto!'));
    this.onRoomAdded?.(room);
  }

  /* ---------------- gestos ---------------- */
  private setRay(x: number, y: number): THREE.Ray {
    const r = this.layer.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.eng.camera);
    return this.ray.ray;
  }
  private floorAt(x: number, y: number): THREE.Vector3 | null {
    return this.setRay(x, y).intersectPlane(new THREE.Plane(UP, 0), new THREE.Vector3());
  }
  private uiTarget(e: PointerEvent): boolean {
    return !!(e.target as HTMLElement).closest('button,.h3-drawer,.h3-pop,.h3-mbar,.h3-left,.h3-top,.h3-ask,.h3-coach');
  }
  private down = (e: PointerEvent) => {
    if (this.uiTarget(e) || this.fly < 1) return;
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      this.ang0 = Math.atan2(b.y - a.y, b.x - a.x);
      this.mid0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.dragGhost = null;
      return;
    }
    if (this.painting && this.paint && !this.decor.mv) {
      this.paintPid = e.pointerId;
      this.paintXY = [e.clientX, e.clientY];
      return;
    }
    // tocar no móvel já escolhido = começar a arrastar na hora
    const d = this.decor;
    if (!d.mv && d.sel && this.eng.editable !== undefined) {
      const hit = d.pickAt(e.clientX, e.clientY);
      if (hit === d.sel) d.startMove(hit);
    }
    if (d.mv) {
      const p = this.floorAt(e.clientX, e.clientY);
      this.dragGhost = p ? p.sub(d.ghost.pos).setY(0) : new THREE.Vector3();
      if (this.dragGhost.length() > 2.5) this.dragGhost.set(0, 0, 0);
    }
  };
  private move = (e: PointerEvent) => {
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) return;
    const dx = e.clientX - pt.x,
      dy = e.clientY - pt.y;
    pt.x = e.clientX;
    pt.y = e.clientY;
    if (this.ptrs.size >= 2) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch0 > 0) this.dist = Math.max(4, Math.min(28, (this.dist * this.pinch0) / Math.max(20, d)));
      this.yaw -= ang - this.ang0;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pan(mid.x - this.mid0.x, mid.y - this.mid0.y);
      this.mid0 = mid;
      this.pinch0 = d;
      this.ang0 = ang;
      return;
    }
    if (e.pointerId === this.paintPid) {
      this.paintXY = [e.clientX, e.clientY];
      return;
    }
    if (this.dragGhost && this.decor.mv) {
      const ray = this.setRay(e.clientX, e.clientY).clone();
      // desloca o raio pelo "pegador" (o dedo não cobre o móvel)
      const p = ray.intersectPlane(new THREE.Plane(UP, 0), new THREE.Vector3());
      if (p) {
        p.sub(this.dragGhost);
        this.decor.aimRay(new THREE.Ray(this.eng.camera.position.clone(), p.sub(this.eng.camera.position).normalize()));
      }
      return;
    }
    if (e.buttons === 2 || e.shiftKey) {
      this.yaw -= dx * 0.008;
      this.pitch = Math.max(0.5, Math.min(1.4, this.pitch + dy * 0.006));
      return;
    }
    this.pan(dx, dy);
  };
  private pan(dx: number, dy: number): void {
    const k = this.dist * 0.0021;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    this.target.x -= (rx * dx - fx * dy) * k;
    this.target.z -= (rz * dx - fz * dy) * k;
    this.target.x = Math.max(HOUSE_MIN().x - 3, Math.min(HOUSE_MAX().x + 3, this.target.x));
    this.target.z = Math.max(HOUSE_MIN().z - 3, Math.min(HOUSE_MAX().z + 3, this.target.z));
  }
  private up = (e: PointerEvent) => {
    const pt = this.ptrs.get(e.pointerId);
    if (!pt) return;
    this.ptrs.delete(e.pointerId);
    if (e.pointerId === this.paintPid) {
      this.paintPid = -1;
      this.paint?.end();
      return;
    }
    if (this.ptrs.size >= 1) {
      this.pinch0 = 0;
      const [a] = [...this.ptrs.values()];
      a.sx = a.x;
      a.sy = a.y;
      return;
    }
    const tap = Math.hypot(e.clientX - pt.sx, e.clientY - pt.sy) < 10 && performance.now() - pt.t < 450;
    if (this.dragGhost) {
      this.dragGhost = null;
      if (tap && this.decor.mv && this.decor.ghost.valid) {
        /* toque curto no fantasma: só mira */
      }
      return;
    }
    if (!tap || this.decor.mv) return;
    // placa "+": ampliar
    this.setRay(e.clientX, e.clientY);
    const tl = this.ray.intersectObjects(this.tiles.map((x) => x.mesh), false)[0];
    if (tl) {
      const tile = this.tiles.find((x) => x.mesh === tl.object);
      if (tile) {
        sfx.click();
        void this.expand(tile);
        return;
      }
    }
    const it = this.decor.pickAt(e.clientX, e.clientY);
    this.decor.select(it);
  };
  /** pinta o que está sob o dedo: parede (uv), móvel ou chão */
  private paintAt(x: number, y: number, dt: number): void {
    const p = this.paint;
    if (!p) return;
    this.setRay(x, y);
    const hits = this.ray.intersectObjects(this.eng.pickables, false);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud?.type === 'wall' && h.uv) return p.spray({ wall: ud.wall, uv: h.uv, point: h.point }, dt);
      if (ud?.type === 'item' && !(ud.item as ItemRec).info.flat) return p.spray({ item: ud.item, point: h.point }, dt);
    }
    const f = this.floorAt(x, y);
    const room = f && this.eng.roomAt(f.x, f.z);
    p.spray(room && f ? { floor: room, point: f } : null, dt);
    // segurar parado também conta (chão/móvel trocam de cor depois de um instante)
  }
  private wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.dist = Math.max(4, Math.min(28, this.dist * (1 + Math.sign(e.deltaY) * 0.1)));
  };

  /* ---------------- laço ---------------- */
  update(dt: number): void {
    if (!this.active) return;
    if (this.paintPid >= 0) this.paintAt(this.paintXY[0], this.paintXY[1], dt);
    const cam = this.eng.camera;
    const goal = this.flyTo ?? this.orbitPose({ p: new THREE.Vector3(), q: new THREE.Quaternion() });
    if (this.fly < 1) {
      this.fly = Math.min(1, this.fly + dt / 0.75);
      const e = this.fly < 0.5 ? 4 * this.fly ** 3 : 1 - Math.pow(-2 * this.fly + 2, 3) / 2;
      cam.position.lerpVectors(this.flyFrom.p, goal.p, e);
      // arco: sobe um pouco no meio do voo
      cam.position.y += Math.sin(e * Math.PI) * 1.2;
      cam.quaternion.slerpQuaternions(this.flyFrom.q, goal.q, e);
      if (this.fly >= 1 && this.flyDone) {
        const f = this.flyDone;
        this.flyDone = null;
        f();
        return;
      }
    } else {
      cam.position.lerp(goal.p, 1 - Math.exp(-dt * 12));
      cam.quaternion.slerp(goal.q, 1 - Math.exp(-dt * 12));
    }
    cam.updateMatrixWorld();
    const leaving = !!this.flyTo;
    // paredes: só ficam altas as do FUNDO (atrás do ponto que a câmera olha e viradas para ela);
    // todas as outras baixam (casa de bonecas: dá para ver dentro de todos os cômodos)
    const far = this.dist > 11;
    const dx = this.target.x - cam.position.x,
      dz = this.target.z - cam.position.z;
    const dl = Math.hypot(dx, dz) || 1;
    const vx = dx / dl,
      vz = dz / dl;
    for (const r of this.eng.rooms)
      for (const w of r.walls) {
        const facing = w.normal.x * vx + w.normal.z * vz;
        const half = w.side === 'n' || w.side === 's' ? ROOM_D / 2 : ROOM_W / 2;
        const wx = r.center.x - w.normal.x * half,
          wz = r.center.z - w.normal.z * half;
        const beyond = (wx - this.target.x) * vx + (wz - this.target.z) * vz > (far ? 2 : 0.5);
        const keep = beyond && facing < -0.3;
        const goalCut = leaving ? 1 : keep ? (far ? 0.55 : 1) : 0.13;
        w.cut += (goalCut - w.cut) * Math.min(1, dt * 7);
        w.holder.scale.y = w.cut;
      }
    for (const it of this.eng.items) {
      if (!it.info.wall) continue;
      it.obj.visible = it.state !== 'broken' && it.room.walls[0].cut > 0.6 && !(this.decor.mv?.it === it);
    }
    const mv = this.decor.mv;
    for (const tl of this.tiles) {
      tl.mesh.visible = !leaving && !mv;
      tl.mesh.position.y = 0.02 + Math.sin(this.eng.time * 2 + tl.col) * 0.01;
    }
    void WALL_H;
  }
  dispose(): void {
    this.exit();
    for (const tl of this.tiles) this.eng.scene.remove(tl.mesh);
    this.tileGeo.dispose();
    for (const m of this.tileMat.values()) {
      m.map?.dispose();
      m.dispose();
    }
    this.ui.remove();
  }
}
const HOUSE_MIN = () => ({ x: HOUSE.minX, z: HOUSE.minZ });
const HOUSE_MAX = () => ({ x: HOUSE.maxX, z: HOUSE.maxZ });

export function roomName(r: string): string {
  const m = /^x(\d)_(-?\d+)$/.exec(r);
  if (m) return t('home3d.room.extra', 'Cômodo novo {n}', { n: (m[1] === '0' ? 'N' : 'S') + (Number(m[2]) + 1) });
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
