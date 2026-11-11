/* ============================================================
 *  JANGADA BLOOP — bichos (originais, fofos):
 *   - MORDELÃO: tubarão roxinho de bochecha rosa. Rodeia a jangada,
 *     escolhe um piso da beirada e mordisca (crec crec!). Três lançadas
 *     e ele foge emburrado. Persegue quem estiver nadando.
 *   - CAPITÃO BU: fantasminha pirata que chega à noite num barquinho
 *     fantasma e tenta pegar coisas do baú (ou apagar a fogueira).
 *     Uma lançada ou a luz da lanterna e ele foge gritando "uiii!".
 *  A lógica roda no anfitrião/solo; os convidados só recebem a pose.
 * ============================================================ */
import * as THREE from 'three';
import { DECK } from './models';
import { ghostModel, ghostShipModel, sharkModel } from './models';

export type SharkSt = 'away' | 'circle' | 'approach' | 'bite' | 'flee' | 'hunt';
export const SHARK_ST: SharkSt[] = ['away', 'circle', 'approach', 'bite', 'flee', 'hunt'];

const TAU = Math.PI * 2;
const angTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export interface SharkCtx {
  /** centro da jangada */
  cx: number;
  cz: number;
  /** pisos da beirada: [id, x, z, nx, nz] (nx/nz = para fora) */
  edges(): [number, number, number, number, number][];
  /** quem está nadando: [id, x, y, z] */
  swimmers(): [string, number, number, number][];
  bite(tileId: number, x: number, z: number): void;
  biteMe(who: string): void;
  waterH(x: number, z: number): number;
  warn(): void;
  fin(x: number, z: number): void;
  wait: [number, number];
  enabled: boolean;
}

export class Shark {
  readonly root: THREE.Group;
  private tail: THREE.Object3D;
  private jaw: THREE.Object3D;
  st: SharkSt = 'away';
  x = 40;
  z = 40;
  y = -3;
  yaw = 0;
  hp = 3;
  timer = 50;
  target: [number, number, number, number, number] | null = null;
  huntId = '';
  private orbitA = 0;
  private biteT = 0;
  private sw = 0;
  /** pancada recente (anima) */
  hurtT = 0;
  chomp = 0;
  constructor() {
    const m = sharkModel();
    this.root = m.root;
    this.tail = m.tail;
    this.jaw = m.jaw;
    this.root.scale.setScalar(0.95);
  }
  /** lado do anfitrião */
  sim(dt: number, c: SharkCtx): void {
    this.timer -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    const sp = (tx: number, tz: number, v: number) => {
      const a = Math.atan2(tx - this.x, tz - this.z);
      this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 3);
      this.x += Math.sin(this.yaw) * v * dt;
      this.z += Math.cos(this.yaw) * v * dt;
      return Math.hypot(tx - this.x, tz - this.z);
    };
    const swim = c.swimmers();
    switch (this.st) {
      case 'away':
        this.y = -4;
        if (this.timer <= 0 && c.enabled) {
          this.st = 'circle';
          const a = Math.random() * TAU;
          this.x = c.cx + Math.cos(a) * 32;
          this.z = c.cz + Math.sin(a) * 32;
          this.orbitA = a;
          this.timer = 7 + Math.random() * 6;
          this.hp = 3;
          c.warn();
        }
        break;
      case 'circle': {
        this.orbitA += dt * 0.32;
        const R = 9 + Math.sin(this.orbitA * 2) * 1.5;
        sp(c.cx + Math.cos(this.orbitA) * R, c.cz + Math.sin(this.orbitA) * R, 3.4);
        this.y = c.waterH(this.x, this.z) - 0.42;
        const near = swim.filter((s) => Math.hypot(s[1] - this.x, s[3] - this.z) < 18);
        if (near.length) {
          this.st = 'hunt';
          this.huntId = near[0][0];
          this.timer = 14;
        } else if (this.timer <= 0) {
          const e = c.edges();
          if (e.length) {
            this.target = e[Math.floor(Math.random() * e.length)];
            this.st = 'approach';
            this.timer = 14;
          } else this.timer = 5;
        }
        break;
      }
      case 'approach': {
        const t = this.target!;
        const d = sp(t[1] + t[3] * 2.7, t[2] + t[4] * 2.7, 4);
        this.y = c.waterH(this.x, this.z) - 0.42;
        if (d < 0.6 || this.timer <= 0) {
          this.st = 'bite';
          this.timer = 16 + Math.random() * 6;
          this.biteT = 0.6;
        }
        break;
      }
      case 'bite': {
        const t = this.target!;
        const a = Math.atan2(-t[3], -t[4]);
        this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 5);
        this.x += (t[1] + t[3] * 2.1 - this.x) * Math.min(1, dt * 3);
        this.z += (t[2] + t[4] * 2.1 - this.z) * Math.min(1, dt * 3);
        this.y = c.waterH(this.x, this.z) - 0.02 + Math.sin(this.sw * 9) * 0.05;
        this.biteT -= dt;
        if (this.biteT <= 0) {
          this.biteT = 1.7;
          this.chomp = 1;
          c.bite(t[0], t[1], t[2]);
          // o piso ainda existe? senão escolhe outro
          if (!c.edges().some((e) => e[0] === t[0])) {
            this.st = 'circle';
            this.timer = 4 + Math.random() * 4;
          }
        }
        if (this.timer <= 0) {
          this.st = 'circle';
          this.timer = 8;
        }
        break;
      }
      case 'hunt': {
        const s = swim.find((q) => q[0] === this.huntId);
        if (!s || this.timer <= 0) {
          this.st = 'circle';
          this.timer = 6;
          break;
        }
        const d = sp(s[1], s[3], 4.6);
        this.y = Math.min(c.waterH(this.x, this.z) - 0.42, s[2] + 0.4);
        if (d < 1.3) {
          this.chomp = 1;
          c.biteMe(s[0]);
          this.st = 'circle';
          this.timer = 10;
          this.orbitA = Math.atan2(this.z - c.cz, this.x - c.cx);
        }
        break;
      }
      case 'flee': {
        const a = Math.atan2(this.x - c.cx, this.z - c.cz);
        this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 4);
        this.x += Math.sin(this.yaw) * 7 * dt;
        this.z += Math.cos(this.yaw) * 7 * dt;
        this.y = c.waterH(this.x, this.z) - 0.6 - Math.max(0, 3 - this.timer) * 0.8;
        if (this.timer <= 0) {
          this.st = 'away';
          this.timer = c.wait[0] + Math.random() * (c.wait[1] - c.wait[0]);
        }
        break;
      }
    }
    if (this.st !== 'away' && this.st !== 'bite' && Math.random() < dt * 0.6) c.fin(this.x, this.z);
  }
  /** levou uma lançada; true = fugiu */
  hit(dmg: number): boolean {
    if (this.st === 'away' || this.st === 'flee') return false;
    this.hp -= dmg;
    this.hurtT = 0.5;
    if (this.hp <= 0) {
      this.st = 'flee';
      this.timer = 6;
      return true;
    }
    if (this.st === 'bite') {
      // recua um pouquinho
      this.biteT = 2;
    }
    return false;
  }
  get active(): boolean {
    return this.st !== 'away';
  }
  get danger(): boolean {
    return this.st === 'approach' || this.st === 'bite' || this.st === 'hunt';
  }
  /** visual (todos) */
  view(dt: number): void {
    this.sw += dt * (this.st === 'bite' ? 2 : 1);
    if (this.chomp > 0) this.chomp = Math.max(0, this.chomp - dt * 2.5);
    this.root.visible = this.st !== 'away';
    this.root.position.set(this.x, this.y, this.z);
    const hurt = this.hurtT > 0 ? Math.sin(this.hurtT * 40) * 0.25 : 0;
    this.root.rotation.set(this.st === 'bite' ? -0.32 - Math.sin(Math.min(1, this.chomp) * Math.PI) * 0.15 : 0, this.yaw + hurt, Math.sin(this.sw * 2.2) * 0.06);
    this.tail.rotation.y = Math.sin(this.sw * (this.st === 'flee' ? 14 : 7)) * 0.45;
    this.jaw.rotation.x = Math.sin(Math.min(1, this.chomp) * Math.PI) * 0.6 + (this.st === 'bite' || this.st === 'hunt' ? 0.12 : 0);
  }
  pose(): number[] {
    return [Math.round(this.x * 10) / 10, Math.round(this.y * 10) / 10, Math.round(this.z * 10) / 10, Math.round(this.yaw * 100) / 100, SHARK_ST.indexOf(this.st), Math.round(this.chomp * 10) / 10, this.hurtT > 0 ? 1 : 0];
  }
  setPose(a: number[]): void {
    const k = 0.35;
    this.x += (a[0] - this.x) * k;
    this.y += (a[1] - this.y) * k;
    this.z += (a[2] - this.z) * k;
    this.yaw += angTo(this.yaw, a[3]) * k;
    this.st = SHARK_ST[a[4]] ?? 'away';
    if (a[5] > this.chomp) this.chomp = a[5];
    if (a[6]) this.hurtT = 0.3;
  }
}

/* ============================== Capitão Bu ============================== */
export type GhostSt = 'none' | 'ship' | 'sneak' | 'steal' | 'escape' | 'scared';
export const GHOST_ST: GhostSt[] = ['none', 'ship', 'sneak', 'steal', 'escape', 'scared'];
export interface GhostCtx {
  cx: number;
  cz: number;
  deckY: number;
  /** alvo: baú [id, x, z] ou fogueira; null = nada */
  target(): [number, number, number, 'chest' | 'fire'] | null;
  steal(id: number, kind: 'chest' | 'fire'): boolean;
  /** luz forte por perto (lampião / lanterna) 0..1 */
  light(x: number, z: number): number;
  giggle(x: number, y: number, z: number): void;
  boo(x: number, y: number, z: number): void;
}
export class Ghost {
  readonly root = new THREE.Group();
  readonly ship: THREE.Group;
  private body: THREE.Mesh;
  private bag: THREE.Mesh;
  st: GhostSt = 'none';
  x = 0;
  y = 0;
  z = 0;
  sx = 0;
  sz = 0;
  yaw = 0;
  timer = 0;
  carrying = false;
  /** quanto já foi iluminado (lanterna) */
  lit = 0;
  private t = 0;
  private tgt: [number, number, number, 'chest' | 'fire'] | null = null;
  constructor() {
    const g = ghostModel();
    this.root.add(g.root);
    this.body = g.body;
    this.bag = g.bag;
    this.ship = ghostShipModel();
    this.root.visible = false;
    this.ship.visible = false;
  }
  /** começa a visita (anfitrião) */
  arrive(cx: number, cz: number): void {
    const a = Math.random() * TAU;
    this.sx = cx + Math.cos(a) * 26;
    this.sz = cz + Math.sin(a) * 26;
    this.x = this.sx;
    this.z = this.sz;
    this.y = 1.2;
    this.st = 'ship';
    this.timer = 3;
    this.carrying = false;
    this.lit = 0;
  }
  sim(dt: number, c: GhostCtx): void {
    if (this.st === 'none') return;
    this.timer -= dt;
    const move = (tx: number, ty: number, tz: number, v: number) => {
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.01) {
        const k = Math.min(1, (v * dt) / d);
        this.x += dx * k;
        this.z += dz * k;
        this.yaw = Math.atan2(dx, dz);
      }
      this.y += (ty - this.y) * Math.min(1, dt * 2);
      return d;
    };
    const slow = 1 - c.light(this.x, this.z) * 0.6;
    switch (this.st) {
      case 'ship':
        this.y = 1.4;
        if (this.timer <= 0) {
          this.st = 'sneak';
          this.tgt = c.target();
          c.boo(this.x, this.y, this.z);
          if (!this.tgt) {
            this.st = 'escape';
            this.timer = 10;
          }
        }
        break;
      case 'sneak': {
        const t = this.tgt!;
        const d = move(t[1], c.deckY + 0.5, t[2], 1.7 * slow);
        if (d < 0.7) {
          this.st = 'steal';
          this.timer = 2.2;
        }
        if (Math.random() < dt * 0.25) c.giggle(this.x, this.y, this.z);
        break;
      }
      case 'steal':
        this.y = c.deckY + 0.45 + Math.sin(this.t * 6) * 0.05;
        if (this.timer <= 0) {
          const t = this.tgt!;
          this.carrying = c.steal(t[0], t[3]);
          c.giggle(this.x, this.y, this.z);
          this.st = 'escape';
          this.timer = 14;
        }
        break;
      case 'escape': {
        const d = move(this.sx, 1.6, this.sz, 2.4);
        if (d < 1 || this.timer <= 0) {
          this.st = 'none';
        }
        break;
      }
      case 'scared':
        this.y += dt * 3.5;
        this.x += Math.sin(this.yaw) * dt * 4;
        this.z += Math.cos(this.yaw) * dt * 4;
        if (this.timer <= 0) this.st = 'none';
        break;
    }
  }
  /** espantado: true se estava com coisas roubadas (cai na água) */
  scare(fromX: number, fromZ: number): boolean {
    if (this.st === 'none' || this.st === 'scared') return false;
    const had = this.carrying;
    this.st = 'scared';
    this.timer = 3;
    this.yaw = Math.atan2(this.x - fromX, this.z - fromZ);
    this.carrying = false;
    return had;
  }
  get active(): boolean {
    return this.st !== 'none';
  }
  get onRaft(): boolean {
    return this.st === 'sneak' || this.st === 'steal' || this.st === 'escape';
  }
  view(dt: number, wave: (x: number, z: number) => number): void {
    this.t += dt;
    const on = this.st !== 'none';
    this.root.visible = on;
    this.ship.visible = on && this.st !== 'scared';
    if (!on) return;
    this.root.position.set(this.x, this.y + Math.sin(this.t * 2.2) * 0.12, this.z);
    this.root.rotation.y = this.yaw + Math.sin(this.t * 1.3) * 0.15;
    const sc = this.st === 'scared' ? 1 + Math.sin(this.t * 30) * 0.08 : 1;
    this.body.scale.set(sc, sc * (1 + Math.sin(this.t * 4) * 0.04), sc);
    this.bag.visible = this.carrying;
    this.ship.position.set(this.sx, wave(this.sx, this.sz) - 0.1, this.sz);
    this.ship.rotation.y = Math.atan2(this.sx, this.sz) + Math.PI / 2;
    this.ship.rotation.z = Math.sin(this.t * 0.9) * 0.05;
    const mat = this.body.material as THREE.MeshLambertMaterial;
    mat.opacity = 0.55 + Math.sin(this.t * 3) * 0.12 + (this.st === 'scared' ? -0.2 : 0);
  }
  pose(): number[] {
    return [Math.round(this.x * 10) / 10, Math.round(this.y * 10) / 10, Math.round(this.z * 10) / 10, Math.round(this.yaw * 100) / 100, GHOST_ST.indexOf(this.st), this.carrying ? 1 : 0, Math.round(this.sx), Math.round(this.sz)];
  }
  setPose(a: number[]): void {
    const k = 0.35;
    const st = GHOST_ST[a[4]] ?? 'none';
    if (this.st === 'none' && st !== 'none') {
      this.x = a[0];
      this.y = a[1];
      this.z = a[2];
    }
    this.x += (a[0] - this.x) * k;
    this.y += (a[1] - this.y) * k;
    this.z += (a[2] - this.z) * k;
    this.yaw = a[3];
    this.st = st;
    this.carrying = !!a[5];
    this.sx = a[6];
    this.sz = a[7];
  }
}
export { DECK };
