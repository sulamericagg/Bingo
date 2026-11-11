/* ============================================================
 *  BLOOP STUDIO — pincel de relevo (ferramenta Terreno).
 *  1 dedo pincela (segurar parado continua subindo/baixando);
 *  2 dedos movem a câmera (o editor cancela o traço). Cada traço
 *  é UM passo de desfazer.
 * ============================================================ */
import * as THREE from 'three';
import type { Studio } from '../studio';
import type { SculptHook } from './editor';
import { TerrainField, type Brush } from '../world/field';
import { TERRAIN_MATS } from '../format';

export class Sculptor implements SculptHook {
  brush: Brush = 'raise';
  size = 4;
  strength = 0.6;
  level = 2;
  mat = 1;
  private ray = new THREE.Raycaster();
  private last: THREE.Vector3 | null = null;
  private start: { p: THREE.Vector3; h: number } | null = null;
  private target = 0;
  private tx: ReturnType<Studio['editor']['beginTx']> | null = null;
  private timer = 0;
  private lastT = 0;
  private dirtyView = false;
  readonly ring: THREE.Mesh;

  constructor(private s: Studio) {
    const g = new THREE.RingGeometry(0.92, 1, 48);
    g.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: '#ffd34a', transparent: true, opacity: 0.85, depthTest: false }));
    this.ring.renderOrder = 998;
    this.ring.visible = false;
    s.scene.add(this.ring);
  }

  /** garante relevo no doc/mundo (Plano); false se o mundo não aceita relevo */
  ensureField(): TerrainField | null {
    const s = this.s;
    if (s.world.kind !== 'flat') return null;
    if (!s.world.field) {
      s.editor.doc.terrain = new TerrainField().encode();
      s.syncWorld();
    }
    return s.world.field ?? null;
  }

  private hit(x: number, y: number): THREE.Vector3 | null {
    const r = this.s.canvas.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.s.camera);
    const hits = this.ray.intersectObjects(this.s.world.pickables(), false);
    return hits[0]?.point.clone() ?? null;
  }

  down(x: number, y: number): boolean {
    const f = this.ensureField();
    if (!f) return false;
    const p = this.hit(x, y);
    if (!p) return false;
    this.tx = this.s.editor.beginTx();
    this.last = p;
    const h = f.heightAt(p.x, p.z);
    this.start = { p, h };
    this.target = this.brush === 'level' ? this.level : h;
    this.lastT = performance.now();
    if (this.brush !== 'ramp' && this.brush !== 'lake') {
      this.apply(0.06);
      clearInterval(this.timer);
      this.timer = window.setInterval(() => this.tick(), 50);
    }
    this.showRing(p);
    return true;
  }

  move(x: number, y: number): void {
    const p = this.hit(x, y);
    if (!p) return;
    this.last = p;
    this.showRing(p);
    if (this.brush === 'ramp') this.previewRamp();
  }

  private tick(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    this.apply(dt);
  }

  private apply(dt: number): void {
    const f = this.s.world.field;
    if (!f || !this.last) return;
    const b = this.brush;
    const k = this.strength * dt * (b === 'smooth' ? 1.5 : 1);
    const ch = f.brush(b, this.last.x, this.last.z, this.size, k, { target: this.target, mat: this.mat });
    if (ch) {
      this.dirtyView = true;
      this.s.world.terrainView?.refresh();
      this.ring.position.y = f.heightAt(this.last.x, this.last.z) + 0.08;
    }
  }

  private rampBase: Float32Array | null = null;
  private previewRamp(): void {
    const f = this.s.world.field;
    if (!f || !this.start || !this.last) return;
    if (!this.rampBase) this.rampBase = f.h.slice();
    f.h.set(this.rampBase);
    f.ramp(this.start.p.x, this.start.p.z, this.start.h, this.last.x, this.last.z, this.start.h + this.level, this.size);
    this.s.world.terrainView?.refresh();
    this.dirtyView = true;
  }

  up(): void {
    clearInterval(this.timer);
    const f = this.s.world.field;
    const s = this.s;
    if (f && this.last && this.start) {
      if (this.brush === 'ramp') this.previewRamp();
      if (this.brush === 'lake') {
        if (!f.removeLakeAt(this.last.x, this.last.z)) {
          const g = f.heightAt(this.last.x, this.last.z);
          // cava a bacia e põe a água um pouco abaixo da borda
          for (let i = 0; i < 6; i++) f.brush('level', this.last.x, this.last.z, this.size, 1, { target: g - 2.4 });
          f.brush('smooth', this.last.x, this.last.z, this.size * 1.2, 0.6);
          f.addLake(Math.round(this.last.x * 2) / 2, Math.round(this.last.z * 2) / 2, this.size * 1.6, Math.round((g - 0.35) * 100) / 100);
        }
        this.dirtyView = true;
        s.world.terrainView?.refresh();
      }
    }
    this.rampBase = null;
    if (this.tx) {
      if (this.dirtyView && f) {
        s.keepWorld = true;
        if (f.isEmpty()) delete s.editor.doc.terrain;
        else s.editor.doc.terrain = f.encode();
      }
      s.editor.endTx(this.tx, 'terrain');
      s.keepWorld = false;
    }
    this.tx = null;
    this.dirtyView = false;
    this.start = null;
    this.ring.visible = false;
  }

  private showRing(p: THREE.Vector3): void {
    this.ring.visible = true;
    this.ring.position.set(p.x, p.y + 0.08, p.z);
    this.ring.scale.setScalar(this.size);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(this.brush === 'lower' ? '#ff7a9a' : this.brush === 'water' || this.brush === 'lake' ? '#5ec8ff' : '#ffd34a');
  }

  get matName(): string {
    return TERRAIN_MATS[this.mat];
  }

  dispose(): void {
    clearInterval(this.timer);
    this.s.scene.remove(this.ring);
    this.ring.geometry.dispose();
    (this.ring.material as THREE.Material).dispose();
  }
}
