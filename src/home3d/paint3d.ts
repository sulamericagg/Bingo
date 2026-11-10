/* ============================================================
 *  PINTAR (3D) — o rolo é uma ferramenta NA MÃO: dá para andar e olhar pintando.
 *   - spray onde a mira aponta (FPS) ou onde o dedo arrasta (Vista aérea)
 *   - paredes: pincelada contínua (interpola entre quadros, sem "pontilhado")
 *   - chão: segurar ~0,5 s troca a cor do piso (mantém o estilo)
 *   - móveis: segurar ~0,35 s troca a cor do móvel (com "pop")
 *   - desfazer (até 20 passos), respingos de tinta
 *  Formato salvo = o mesmo do 2D (paint[room], floor "estilo:cor", item.color).
 * ============================================================ */
import * as THREE from 'three';
import { canUse, palColor, parsePaintSpec, surface } from './adapter';
import type { Engine, ItemRec, RoomRec, WallRec } from './engine';
import { sfx } from './sfx';
import { popObj } from './ghost';

export interface PaintHit {
  wall?: WallRec;
  uv?: THREE.Vector2;
  item?: ItemRec;
  floor?: RoomRec;
  point: THREE.Vector3;
  normal?: THREE.Vector3;
}
type Undo =
  | { k: 'wall'; room: RoomRec; cover: Uint8Array; paint: string | null; base: string | null }
  | { k: 'floor'; room: RoomRec; spec: string }
  | { k: 'item'; it: ItemRec; color: string | undefined };

export class Paint3D {
  /** "<corIdx>:<acabamento>" (mesmo formato do 2D) */
  spec = '12:solid';
  /** spray travado (tocar no botão liga/desliga; segurar também pinta) */
  latched = false;
  private undo: Undo[] = [];
  private stroke = new Set<unknown>();
  private last: { w: WallRec; u: number; v: number } | null = null;
  private dwell: { key: unknown; t: number } | null = null;
  private tick = 0;
  onChange?: () => void;
  onDone?: (room: RoomRec) => void;
  constructor(readonly eng: Engine) {}

  get color(): string {
    return parsePaintSpec(this.spec)?.col ?? '#ff9ad5';
  }
  get colorIdx(): number {
    return Number(this.spec.split(':')[0]) || 0;
  }
  canUndo(): boolean {
    return this.undo.length > 0;
  }
  /** fim de uma pincelada (soltou o botão / dedo) */
  end(): void {
    this.stroke.clear();
    this.last = null;
    this.dwell = null;
  }
  private remember(key: unknown, u: Undo): void {
    if (this.stroke.has(key)) return;
    this.stroke.add(key);
    this.undo.push(u);
    if (this.undo.length > 20) this.undo.shift();
    this.onChange?.();
  }
  /** uma "borrifada" (chame a cada quadro enquanto pinta) */
  spray(h: PaintHit | null, dt: number): void {
    if (!h) {
      this.last = null;
      return;
    }
    const role = this.eng.role;
    if (h.wall && h.uv) {
      if (!canUse(role, 'paint')) return;
      const w = h.wall,
        room = w.room;
      this.remember(room, { k: 'wall', room, cover: room.cover.slice(), paint: room.paint, base: room.base });
      // pincelada contínua: passos de ~1/3 do raio entre o ponto anterior e o atual
      const R = 0.42;
      const steps: [number, number][] = [];
      if (this.last && this.last.w === w) {
        const du = (h.uv.x - this.last.u) * w.len,
          dv = (h.uv.y - this.last.v) * 2.7;
        const n = Math.min(24, Math.ceil(Math.hypot(du, dv) / (R / 3)));
        for (let i = 1; i <= n; i++) steps.push([this.last.u + ((h.uv.x - this.last.u) * i) / n, this.last.v + ((h.uv.y - this.last.v) * i) / n]);
      } else steps.push([h.uv.x, h.uv.y]);
      let fresh = false;
      for (const [u, v] of steps) fresh = this.eng.paintAt(w, u, v, R, this.spec) || fresh;
      this.last = { w, u: h.uv.x, v: h.uv.y };
      this.tick -= dt;
      if (this.tick <= 0) {
        this.tick = 0.05;
        const n = h.normal ?? w.normal;
        this.eng.emit(h.point.x, h.point.y, h.point.z, n.x * 0.6 + (Math.random() - 0.5) * 0.4, -0.2 + Math.random() * 0.3, n.z * 0.6 + (Math.random() - 0.5) * 0.4, { tile: 3, color: this.color, life: 0.45, size: 0.03, grav: 6 });
        if (fresh && Math.random() < 0.4) sfx.paint();
      }
      return;
    }
    this.last = null;
    const key = h.item ?? h.floor;
    if (!key) return;
    if (!this.dwell || this.dwell.key !== key) this.dwell = { key, t: 0 };
    this.dwell.t += dt;
    if (Math.random() < dt * 12) this.eng.emit(h.point.x, h.point.y + 0.02, h.point.z, (Math.random() - 0.5) * 0.8, 0.6, (Math.random() - 0.5) * 0.8, { tile: 3, color: this.color, life: 0.4, size: 0.03, grav: 6 });
    if (h.item && this.dwell.t > 0.35) {
      const it = h.item;
      if (!canUse(role, 'decorate')) return;
      const col = String(this.colorIdx);
      if (it.data.color === col) return;
      this.remember(it, { k: 'item', it, color: it.data.color });
      it.data.color = col;
      this.eng.remodel(it);
      popObj(it.obj, 0.12);
      this.eng.burst(h.point.x, h.point.y, h.point.z, 14, 'chunk', this.color, 1.6);
      this.eng.changed = true;
      sfx.paint();
      this.dwell.t = -9;
    } else if (h.floor && this.dwell.t > 0.5) {
      const r = h.floor;
      if (!canUse(role, 'paint')) return;
      const [st] = surface(r.design.floor, 'wood:15');
      const spec = st + ':' + this.colorIdx;
      if (r.design.floor === spec) return;
      this.remember(r.floor, { k: 'floor', room: r, spec: r.design.floor });
      r.design.floor = spec;
      this.eng.refreshSurfaces(r);
      this.eng.burst(h.point.x, 0.05, h.point.z, 22, 'chunk', this.color, 2.2);
      this.eng.changed = true;
      sfx.paint();
      this.dwell.t = -9;
    }
  }
  doUndo(): void {
    const u = this.undo.pop();
    if (!u) return;
    if (u.k === 'wall') {
      u.room.cover.set(u.cover);
      u.room.paint = u.paint;
      u.room.base = u.base;
      for (const w of u.room.walls) this.eng.redrawWall(w);
    } else if (u.k === 'floor') {
      u.room.design.floor = u.spec;
      this.eng.refreshSurfaces(u.room);
    } else {
      if (u.color === undefined) delete u.it.data.color;
      else u.it.data.color = u.color;
      if (this.eng.items.includes(u.it)) this.eng.remodel(u.it);
    }
    this.eng.changed = true;
    sfx.click();
    this.onChange?.();
  }
  setColor(idx: number, finish?: string): void {
    const fin = finish ?? this.spec.split(':')[1] ?? 'solid';
    this.spec = idx + ':' + fin;
    this.onChange?.();
  }
  setFinish(f: string): void {
    this.spec = this.colorIdx + ':' + f;
    this.onChange?.();
  }
  swatch(): string {
    return palColor(this.colorIdx);
  }
}
