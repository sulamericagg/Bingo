/* ============================================================
 *  JANGADA BLOOP — CHEFES nas ilhas mais longe (originais, sem sangue:
 *  dano de desenho animado, estrelinhas, "boing").
 *
 *  MEGALODONTE (Recife do Megalodonte): tubarão gigante com coluna de
 *  9 ossos que ondula ao nadar, mandíbula que abre, guelras, nadadeiras.
 *   - rodeia → AVISO (barbatana alta, "!") → INVESTIDA: QTE "arraste"
 *     para desviar. Desviou? Ele passa de lado e mostra as GUELRAS
 *     brilhando (ponto fraco, dano x2,5) por alguns segundos.
 *   - SALTO por baixo: bolhas em volta → QTE "toque rápido" para fugir;
 *     ele erra o pulo e fica com o OLHO exposto.
 *   - fase 2 (metade da vida): mais rápido + RABANADA (onda): QTE "segure".
 *  POLVO GIGANTE (Abismo do Polvo): cabeça enorme e 8 tentáculos com 10
 *  ossos cada (ondulam, levantam, batem, agarram).
 *   - TAPA: tentáculo sobe em cima de você (sombra na água) → QTE
 *     "arraste"; se errar, o tentáculo fica preso na água com as VENTOSAS
 *     brilhando (acerte para machucar).
 *   - AGARRÃO: QTE "toque rápido" para se soltar.
 *   - TINTA: QTE "toque" para limpar a tela.
 *   - fase 2: depois de cada tentáculo preso os OLHOS ficam expostos.
 *  Mira de arpão (projétil) e lança (perto). O anfitrião simula e pede
 *  QTE a quem é o alvo; todos veem a pose (rede 5 Hz).
 * ============================================================ */
import * as THREE from 'three';
import type { QteDir, QteKind, QteReq } from './qte';
import { dizzyStars, krakenModel, megaModel, type KrakenModel, type MegaModel } from './models2';

export type BossKind = 'mega' | 'kraken';
export interface BossTarget {
  id: string;
  x: number;
  y: number;
  z: number;
}
export interface BossCtx {
  targets(): BossTarget[];
  water(x: number, z: number): number;
  /** pede um QTE ao alvo; o resultado volta por qteResult(id, ok) */
  qte(target: string, req: QteReq, id: number): void;
  hurt(target: string, dmg: number, fromX: number, fromZ: number, boatDmg: number): void;
  fx(k: string, x: number, y: number, z: number): void;
  /** 0 tranquilo · 1 normal · 2 aventura */
  diff: number;
}
export interface HitSphere {
  x: number;
  y: number;
  z: number;
  r: number;
  /** multiplicador de dano (ponto fraco > 1) */
  w: number;
  part: number;
}
const TAU = Math.PI * 2;
const angTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const DK = [1.4, 1, 0.78];
const _v = new THREE.Vector3();

export abstract class Boss {
  abstract readonly kind: BossKind;
  readonly root = new THREE.Group();
  st = 'off';
  t = 0;
  hp = 1;
  max = 1;
  x: number;
  z: number;
  y = -8;
  yaw = 0;
  target = '';
  /** QTE pendente */
  qid = 0;
  qok: boolean | null = null;
  qT = 0;
  private static qn = 1;
  hurtT = 0;
  readonly stars = dizzyStars();
  constructor(
    public cx: number,
    public cz: number,
    hpBase: number,
    diff: number,
  ) {
    this.x = cx;
    this.z = cz;
    this.max = this.hp = Math.round(hpBase * [0.7, 1, 1.35][diff]);
    this.stars.scale.setScalar(4);
    this.stars.visible = false;
    this.root.add(this.stars);
  }
  get active(): boolean {
    return this.st !== 'off' && this.st !== 'gone';
  }
  get fighting(): boolean {
    return this.active && this.st !== 'defeated';
  }
  get phase2(): boolean {
    return this.hp <= this.max * 0.5;
  }
  protected askQte(c: BossCtx, kind: QteKind, dur: number, dir?: QteDir): void {
    this.qid = Boss.qn++;
    this.qok = null;
    this.qT = dur * DK[c.diff] + 1.2;
    const n = kind === 'mash' ? [6, 9, 12][c.diff] : undefined;
    c.qte(this.target, { kind, dur: dur * DK[c.diff], dir, n }, this.qid);
  }
  qteResult(id: number, ok: boolean): void {
    if (id === this.qid && this.qok === null) this.qok = ok;
  }
  protected tgt(c: BossCtx): BossTarget | null {
    return c.targets().find((p) => p.id === this.target) ?? null;
  }
  protected pickTarget(c: BossCtx): BossTarget | null {
    const l = c.targets();
    if (!l.length) return null;
    const p = l.reduce((a, b) => (Math.hypot(a.x - this.x, a.z - this.z) < Math.hypot(b.x - this.x, b.z - this.z) ? a : b));
    this.target = p.id;
    return p;
  }
  /** acertou (dano já multiplicado): true = derrotado agora */
  hit(dmg: number): boolean {
    if (!this.fighting || this.st === 'intro') return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.hurtT = 0.5;
    if (this.hp <= 0) {
      this.st = 'defeated';
      this.t = 7;
      return true;
    }
    return false;
  }
  abstract sim(dt: number, c: BossCtx): void;
  abstract view(dt: number, time: number, water: (x: number, z: number) => number): void;
  abstract hitSpheres(): HitSphere[];
  abstract pose(): number[];
  abstract setPose(a: number[]): void;
  /** ponto para a câmera da apresentação */
  abstract focus(out: THREE.Vector3): THREE.Vector3;
  /** começa a luta */
  wake(): void {
    if (this.st !== 'off') return;
    this.st = 'intro';
    this.t = 3.6;
  }
}

/* ============================== Megalodonte ============================== */
const MEGA_ST = ['off', 'intro', 'circle', 'tele', 'charge', 'exposed', 'dive', 'breach', 'tail', 'defeated', 'gone'];
export class Megalodon extends Boss {
  readonly kind = 'mega' as const;
  readonly m: MegaModel;
  private orbit = 0;
  private sw = 0;
  private speed = 3;
  private jaw = 0;
  private attacks = 0;
  private exposedPart = 0;
  private tx = 0;
  private tz = 0;
  private leap = 0;
  constructor(cx: number, cz: number, diff: number) {
    super(cx, cz, 40, diff);
    this.m = megaModel();
    this.root.add(this.m.root);
    this.root.visible = false;
    this.stars.position.set(0, 2.6, -1.6);
  }
  sim(dt: number, c: BossCtx): void {
    this.t -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.qT > 0) {
      this.qT -= dt;
      if (this.qT <= 0 && this.qok === null) this.qok = false;
    }
    const dk = DK[c.diff];
    const fast = this.phase2 ? 1.25 : 1;
    const move = (tx: number, tz: number, v: number, turn = 2.2) => {
      const a = Math.atan2(tx - this.x, tz - this.z);
      this.yaw += angTo(this.yaw, a) * Math.min(1, dt * turn);
      this.x += Math.sin(this.yaw) * v * dt;
      this.z += Math.cos(this.yaw) * v * dt;
      this.speed = v;
      return Math.hypot(tx - this.x, tz - this.z);
    };
    const w = c.water(this.x, this.z);
    switch (this.st) {
      case 'off':
      case 'gone':
        return;
      case 'intro': {
        // salta para fora d'água na frente de quem chegou
        const p = this.tgt(c) ?? this.pickTarget(c);
        if (p && this.t > 3.4) {
          const a = Math.atan2(p.x - this.cx, p.z - this.cz);
          this.x = p.x - Math.sin(a) * 22;
          this.z = p.z - Math.cos(a) * 22;
          this.yaw = a + Math.PI / 2;
        }
        const k = 1 - this.t / 3.6;
        this.leap = Math.sin(Math.min(1, k * 1.6) * Math.PI);
        this.y = w - 2 + this.leap * 6;
        this.x += Math.sin(this.yaw) * 7 * dt;
        this.z += Math.cos(this.yaw) * 7 * dt;
        this.jaw = this.leap;
        if (this.t <= 0) {
          this.leap = 0;
          this.st = 'circle';
          this.t = 3;
        }
        break;
      }
      case 'circle': {
        const p = this.tgt(c) ?? this.pickTarget(c);
        if (!p) {
          // ninguém por perto: volta para casa
          move(this.cx, this.cz, 4);
          this.y = w - 1.2;
          break;
        }
        this.orbit += dt * 0.32 * fast;
        const R = 17;
        move(p.x + Math.cos(this.orbit) * R, p.z + Math.sin(this.orbit) * R, 6.5 * fast);
        this.y += (w - 0.95 - this.y) * Math.min(1, dt * 2);
        this.jaw = Math.max(0, this.jaw - dt);
        if (this.t <= 0) {
          this.pickTarget(c);
          this.attacks++;
          if (this.phase2 && this.attacks % 3 === 0) {
            this.st = 'tail';
            this.t = 1.0 * dk;
            c.fx('megaRoar', this.x, w, this.z);
          } else if (this.attacks % 3 === 2) {
            this.st = 'dive';
            this.t = 1.4;
          } else {
            this.st = 'tele';
            this.t = 1.25 * dk / fast;
            c.fx('megaWarn', this.x, w, this.z);
          }
        }
        break;
      }
      case 'tele': {
        const p = this.tgt(c);
        if (!p) {
          this.st = 'circle';
          this.t = 2;
          break;
        }
        // vira para o alvo, barbatana alta
        const a = Math.atan2(p.x - this.x, p.z - this.z);
        this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 5);
        this.y += (w - 0.5 - this.y) * Math.min(1, dt * 3);
        this.speed = 1.5;
        if (this.t <= 0) {
          this.st = 'charge';
          this.tx = p.x;
          this.tz = p.z;
          this.t = 3;
          this.askQte(c, 'swipe', 1.15, Math.random() < 0.5 ? 'l' : 'r');
          c.fx('megaCharge', this.x, w, this.z);
        }
        break;
      }
      case 'charge': {
        const p = this.tgt(c);
        if (p) {
          this.tx += (p.x - this.tx) * Math.min(1, dt * 1.2);
          this.tz += (p.z - this.tz) * Math.min(1, dt * 1.2);
        }
        const d = move(this.tx, this.tz, 15 * fast, 3);
        this.y += (w - 0.7 - this.y) * Math.min(1, dt * 3);
        this.jaw = Math.min(1, this.jaw + dt * 2);
        if (d < 3.2 || this.t <= 0) {
          const ok = this.qok === true;
          this.qok = null;
          this.qT = 0;
          if (ok) {
            // desviou: passa de lado e mostra as guelras
            this.yaw += 0.6;
            this.st = 'exposed';
            this.exposedPart = 1;
            this.t = 4.2 / dk;
            c.fx('dodge', this.x, w, this.z);
          } else {
            if (p) c.hurt(this.target, [9, 13, 18][c.diff], this.x, this.z, 30);
            c.fx('megaBite', this.x, w, this.z);
            this.st = 'circle';
            this.t = 3 + Math.random() * 2;
            this.orbit = Math.atan2(this.z - (p?.z ?? this.cz), this.x - (p?.x ?? this.cx));
          }
          this.jaw = 0.4;
        }
        break;
      }
      case 'exposed': {
        // nada devagar, de lado, guelras brilhando
        this.x += Math.sin(this.yaw) * 2.2 * dt;
        this.z += Math.cos(this.yaw) * 2.2 * dt;
        this.speed = 2.2;
        this.y += (w - 0.35 - this.y) * Math.min(1, dt * 3);
        if (this.t <= 0) {
          this.exposedPart = 0;
          this.st = 'circle';
          this.t = 3.5;
        }
        break;
      }
      case 'dive': {
        const p = this.tgt(c);
        this.y += (w - 9 - this.y) * Math.min(1, dt * 1.5);
        if (p) move(p.x, p.z, 7, 3);
        if (this.t <= 0 && p) {
          this.st = 'breach';
          this.t = 2.6 * dk;
          this.tx = p.x;
          this.tz = p.z;
          this.askQte(c, 'mash', 2.4);
          c.fx('bubbles', p.x, w, p.z);
        }
        break;
      }
      case 'breach': {
        // embaixo do alvo, subindo
        this.x += (this.tx - this.x) * Math.min(1, dt * 2);
        this.z += (this.tz - this.z) * Math.min(1, dt * 2);
        this.y += (w - 4 - this.y) * Math.min(1, dt * 1.2);
        if (this.t <= 0 || this.qok !== null) {
          const ok = this.qok === true;
          this.qok = null;
          this.qT = 0;
          this.st = 'intro';
          this.t = 2.3;
          this.leap = 0;
          if (ok) {
            // erra o pulo: cai de lado e mostra o olho
            this.x = this.tx + 5;
            c.fx('dodge', this.x, w, this.z);
            this.exposedPart = 2;
          } else {
            c.hurt(this.target, [10, 15, 20][c.diff], this.x, this.z, 35);
            c.fx('megaBite', this.x, w, this.z);
            this.exposedPart = 0;
          }
          c.fx('megaSplash', this.x, w, this.z);
          this.st = 'leap';
        }
        break;
      }
      case 'leap': {
        this.t -= 0;
        const k = 1 - this.t / 2.3;
        this.leap = Math.sin(Math.min(1, k) * Math.PI);
        this.y = w - 1.5 + this.leap * 7;
        this.x += Math.sin(this.yaw) * 6 * dt;
        this.z += Math.cos(this.yaw) * 6 * dt;
        if (this.t <= 0) {
          this.leap = 0;
          c.fx('megaSplash', this.x, w, this.z);
          if (this.exposedPart === 2) {
            this.st = 'exposed';
            this.t = 3.6 / dk;
          } else {
            this.st = 'circle';
            this.t = 3;
          }
        }
        break;
      }
      case 'tail': {
        const p = this.tgt(c);
        if (p) {
          const a = Math.atan2(p.x - this.x, p.z - this.z) + Math.PI;
          this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 5);
        }
        this.y += (w - 0.6 - this.y) * Math.min(1, dt * 3);
        if (this.t <= 0) {
          this.st = 'wave';
          this.t = 1.6 * dk + 0.4;
          this.askQte(c, 'hold', 1.6);
          c.fx('megaTail', this.x, w, this.z);
        }
        break;
      }
      case 'wave': {
        if (this.qok !== null || this.t <= 0) {
          const ok = this.qok === true;
          this.qok = null;
          this.qT = 0;
          if (!ok) c.hurt(this.target, [6, 9, 12][c.diff], this.x, this.z, 20);
          else c.fx('dodge', this.x, w, this.z);
          this.st = 'circle';
          this.t = 3;
        }
        break;
      }
      case 'defeated': {
        this.y += (w - 0.2 - this.y) * Math.min(1, dt * 2);
        this.speed = 0.5;
        if (this.t <= 0) {
          this.st = 'gone';
          this.root.visible = false;
        }
        break;
      }
    }
  }
  view(dt: number, time: number, water: (x: number, z: number) => number): void {
    const vis = this.active || this.st === 'defeated';
    this.root.visible = vis;
    if (!vis) return;
    void water;
    this.sw += dt * (1.2 + this.speed * 0.45);
    const r = this.m.root;
    this.root.position.set(this.x, this.y, this.z);
    const def = this.st === 'defeated';
    const roll = def ? Math.PI * Math.min(1, (7 - this.t) / 1.5) : this.st === 'exposed' ? 0.75 : 0;
    const pitch = this.st === 'intro' || this.st === 'leap' ? -0.9 * (this.leap > 0 ? Math.cos(this.leap * Math.PI * 0.5) * 1.2 - 0.3 : 0) : this.st === 'charge' ? 0.05 : 0;
    this.root.rotation.set(0, this.yaw, 0);
    r.rotation.set(pitch, 0, roll + (this.hurtT > 0 ? Math.sin(this.hurtT * 40) * 0.12 : 0));
    const B = this.m.bones;
    const amp = def ? 0.04 : 0.1 + Math.min(0.22, this.speed * 0.012);
    for (let i = 1; i < B.length; i++) B[i].rotation.y = Math.sin(this.sw * 2.4 - i * 0.65) * amp * Math.pow(i / (B.length - 1), 1.1) * 1.6;
    this.m.jaw.rotation.x = Math.max(this.jaw * 0.75, this.st === 'tele' ? 0.3 + Math.sin(time * 9) * 0.1 : 0.05);
    const glow = this.st === 'exposed' ? 0.55 + Math.sin(time * 10) * 0.3 : 0;
    for (const g of this.m.gills) (g.material as THREE.MeshBasicMaterial).opacity = this.exposedPart === 1 ? glow : 0;
    this.m.mat.emissive.setRGB(this.hurtT > 0 ? 0.5 : this.exposedPart === 2 && this.st === 'exposed' ? 0.15 + Math.sin(time * 10) * 0.1 : 0, this.hurtT > 0 ? 0.4 : 0, this.hurtT > 0 ? 0.1 : 0);
    this.stars.visible = def;
    this.stars.rotation.y = time * 3;
    this.stars.position.y = def ? -2.4 : 2.6;
  }
  hitSpheres(): HitSphere[] {
    const out: HitSphere[] = [];
    if (!this.fighting) return out;
    const B = this.m.bones;
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < B.length - 1; i += 1) {
      B[i].getWorldPosition(_v);
      out.push({ x: _v.x, y: _v.y, z: _v.z, r: i < 6 ? 1.6 : 1.0, w: 1, part: 0 });
    }
    if (this.st === 'exposed') {
      if (this.exposedPart === 1)
        for (const g of this.m.gills) {
          g.getWorldPosition(_v);
          const p = new THREE.Vector3(1.24 * Math.sign(g.position.x || 1), 0, -0.5);
          g.localToWorld(p);
          out.push({ x: p.x, y: p.y, z: p.z, r: 1.1, w: 2.5, part: 1 });
        }
      else {
        this.m.eye.getWorldPosition(_v);
        out.push({ x: _v.x, y: _v.y, z: _v.z, r: 1.4, w: 2.5, part: 2 });
      }
    }
    return out;
  }
  pose(): number[] {
    return [MEGA_ST.indexOf(this.st) >= 0 ? MEGA_ST.indexOf(this.st) : this.st === 'leap' ? 11 : this.st === 'wave' ? 12 : 0, r1(this.x), r1(this.y), r1(this.z), r2(this.yaw), Math.round(this.hp), this.max, this.exposedPart, r1(this.jaw), r1(this.leap), r1(this.speed), this.hurtT > 0 ? 1 : 0, r1(this.t)];
  }
  setPose(a: number[]): void {
    const st = a[0] === 11 ? 'leap' : a[0] === 12 ? 'wave' : (MEGA_ST[a[0]] ?? 'off');
    if (this.st === 'off' && st !== 'off') {
      this.x = a[1];
      this.y = a[2];
      this.z = a[3];
    }
    this.st = st;
    const k = 0.4;
    this.x += (a[1] - this.x) * k;
    this.y += (a[2] - this.y) * k;
    this.z += (a[3] - this.z) * k;
    this.yaw += angTo(this.yaw, a[4]) * k;
    this.hp = a[5];
    this.max = a[6];
    this.exposedPart = a[7];
    this.jaw = a[8];
    this.leap = a[9];
    this.speed = a[10];
    if (a[11]) this.hurtT = 0.3;
    this.t = a[12];
  }
  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y + 1, this.z);
  }
}

/* ============================== Polvo Gigante ============================== */
/** modos de cada tentáculo */
const T_IDLE = 0;
const T_RAISE = 1;
const T_SLAM = 2;
const T_STUCK = 3;
const T_GRAB = 4;
const T_HURT = 5;
const KRAKEN_ST = ['off', 'intro', 'idle', 'attack', 'ink', 'exposed', 'defeated', 'gone'];
export class Kraken extends Boss {
  readonly kind = 'kraken' as const;
  readonly m: KrakenModel;
  /** [modo, alvo x, alvo z, tempo] por tentáculo */
  tent: [number, number, number, number][] = [];
  private cur = -1;
  private rise = 0;
  private attacks = 0;
  private eyesOpen = 0;
  inkT = 0;
  private shadow: THREE.Mesh;
  constructor(cx: number, cz: number, diff: number) {
    super(cx, cz, 46, diff);
    this.m = krakenModel();
    this.root.add(this.m.root);
    this.root.visible = false;
    for (let i = 0; i < 8; i++) this.tent.push([T_IDLE, 0, 0, 0]);
    this.stars.position.set(0, 6.5, 0);
    this.shadow = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff3a5a', transparent: true, opacity: 0.5, depthWrite: false }));
    this.shadow.visible = false;
    this.shadow.renderOrder = 4;
  }
  get shadowMesh(): THREE.Mesh {
    return this.shadow;
  }
  sim(dt: number, c: BossCtx): void {
    this.t -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.qT > 0) {
      this.qT -= dt;
      if (this.qT <= 0 && this.qok === null) this.qok = false;
    }
    const dk = DK[c.diff];
    for (const tt of this.tent) tt[3] -= dt;
    switch (this.st) {
      case 'off':
      case 'gone':
        return;
      case 'intro': {
        const p = this.tgt(c) ?? this.pickTarget(c);
        if (p && this.t > 3.5) {
          const a = Math.atan2(p.x - this.cx, p.z - this.cz);
          this.x = p.x - Math.sin(a) * 16;
          this.z = p.z - Math.cos(a) * 16;
          this.yaw = a;
        }
        this.rise = Math.min(1, this.rise + dt / 3);
        if (this.t <= 0) {
          this.st = 'idle';
          this.t = 2.5;
        }
        break;
      }
      case 'idle': {
        const p = this.tgt(c) ?? this.pickTarget(c);
        if (p) {
          // chega perto do alvo devagar (alcance dos tentáculos)
          const d = Math.hypot(p.x - this.x, p.z - this.z);
          const a = Math.atan2(p.x - this.x, p.z - this.z);
          this.yaw += angTo(this.yaw, a) * Math.min(1, dt * 1.5);
          if (d > 12) {
            this.x += Math.sin(a) * 2.2 * dt;
            this.z += Math.cos(a) * 2.2 * dt;
          }
        }
        if (this.t <= 0 && p) {
          this.attacks++;
          // tentáculo mais perto do alvo
          let best = 0;
          let bd = 1e9;
          this.tent.forEach((tt, i) => {
            if (tt[0] !== T_IDLE) return;
            const a = (i / 8) * TAU;
            const bx = this.x + Math.cos(a) * 3.4;
            const bz = this.z + Math.sin(a) * 3.4;
            const d = Math.hypot(p.x - bx, p.z - bz);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          this.cur = best;
          const tt = this.tent[best];
          tt[1] = p.x;
          tt[2] = p.z;
          if (this.attacks % 4 === 0) {
            this.st = 'ink';
            this.t = 1.2;
            c.fx('krakenInk', this.x, 2, this.z);
            this.askQte(c, 'tap', 1.6);
          } else if (this.attacks % 3 === 0) {
            tt[0] = T_GRAB;
            tt[3] = 2.6 * dk;
            this.st = 'attack';
            this.t = 2.6 * dk;
            this.askQte(c, 'mash', 2.4);
            c.fx('krakenGrab', p.x, 0, p.z);
          } else {
            tt[0] = T_RAISE;
            tt[3] = 1.3 * dk / (this.phase2 ? 1.2 : 1);
            this.st = 'attack';
            this.t = tt[3];
            this.askQte(c, 'swipe', 1.35, Math.random() < 0.5 ? 'l' : 'r');
            c.fx('krakenRaise', p.x, 0, p.z);
          }
        }
        break;
      }
      case 'attack': {
        const tt = this.tent[this.cur];
        const p = this.tgt(c);
        if (tt[0] === T_RAISE) {
          // segue o alvo enquanto levanta (a sombra mostra onde vai bater)
          if (p) {
            tt[1] += (p.x - tt[1]) * Math.min(1, dt * 1.5);
            tt[2] += (p.z - tt[2]) * Math.min(1, dt * 1.5);
          }
          if (tt[3] <= 0) {
            tt[0] = T_SLAM;
            tt[3] = 0.45;
          }
        } else if (tt[0] === T_SLAM) {
          if (tt[3] <= 0) {
            const ok = this.qok === true;
            this.qok = null;
            this.qT = 0;
            c.fx('krakenSlam', tt[1], 0, tt[2]);
            if (!ok && p && Math.hypot(p.x - tt[1], p.z - tt[2]) < 4.5) c.hurt(this.target, [8, 12, 16][c.diff], tt[1], tt[2], 25);
            else c.fx('dodge', tt[1], 0, tt[2]);
            // fica preso na água: ventosas brilham (ponto fraco)
            tt[0] = T_STUCK;
            tt[3] = 4.5 / dk;
            this.st = 'idle';
            this.t = tt[3] + 0.8;
            if (this.phase2) this.eyesOpen = tt[3];
          }
        } else if (tt[0] === T_GRAB) {
          if (this.qok !== null || tt[3] <= 0) {
            const ok = this.qok === true;
            this.qok = null;
            this.qT = 0;
            if (!ok) c.hurt(this.target, [8, 12, 16][c.diff], tt[1], tt[2], 25);
            else c.fx('dodge', tt[1], 0, tt[2]);
            tt[0] = ok ? T_STUCK : T_HURT;
            tt[3] = ok ? 3.5 / dk : 1.2;
            this.st = 'idle';
            this.t = 2.5;
          }
        } else {
          this.st = 'idle';
          this.t = 1.5;
        }
        break;
      }
      case 'ink':
        if (this.qok !== null || this.t <= -1.4) {
          const ok = this.qok === true;
          this.qok = null;
          this.qT = 0;
          if (!ok) c.fx('inked', 0, 0, 0);
          this.st = 'idle';
          this.t = 2.5;
        }
        break;
      case 'defeated':
        this.rise = Math.max(0, this.rise - dt / 6);
        if (this.t <= 0) {
          this.st = 'gone';
          this.root.visible = false;
        }
        break;
    }
    // tentáculos voltam
    for (const tt of this.tent)
      if ((tt[0] === T_STUCK || tt[0] === T_HURT) && tt[3] <= 0) {
        tt[0] = T_IDLE;
      }
    if (this.eyesOpen > 0) this.eyesOpen -= dt;
  }
  /** acertou um tentáculo/cabeça (parte) */
  hitPart(part: number, dmg: number): boolean {
    if (part >= 10 && part < 20) {
      const tt = this.tent[part - 10];
      if (tt && tt[0] === T_STUCK) {
        tt[0] = T_HURT;
        tt[3] = 1.2;
      }
    }
    return this.hit(dmg);
  }
  view(dt: number, time: number, water: (x: number, z: number) => number): void {
    const vis = this.active || this.st === 'defeated';
    this.root.visible = vis;
    this.shadow.visible = false;
    if (!vis) return;
    const w = water(this.x, this.z);
    this.y = w - 9 + this.rise * 8.4 + Math.sin(time * 0.9) * 0.3;
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(0, this.yaw, this.hurtT > 0 ? Math.sin(this.hurtT * 30) * 0.06 : 0);
    const head = this.m.head;
    head.scale.set(1 + Math.sin(time * 1.6) * 0.03, 1 - Math.sin(time * 1.6) * 0.03, 1);
    const def = this.st === 'defeated';
    this.m.mat.emissive.setRGB(this.hurtT > 0 ? 0.4 : this.eyesOpen > 0 ? 0.12 + Math.sin(time * 9) * 0.08 : 0, this.hurtT > 0 ? 0.35 : 0, this.hurtT > 0 ? 0.1 : this.eyesOpen > 0 ? 0.15 : 0);
    this.m.eyes.scale.setScalar(this.eyesOpen > 0 ? 1.15 + Math.sin(time * 8) * 0.05 : 1);
    this.stars.visible = def;
    this.stars.rotation.y = time * 2;
    const inv = new THREE.Matrix4().copy(this.root.matrixWorld).invert();
    this.root.updateMatrixWorld(true);
    inv.copy(this.root.matrixWorld).invert();
    this.tent.forEach((tt, i) => {
      const T = this.m.tentacles[i];
      const B = T.bones;
      const mode = tt[0];
      // direção do alvo no espaço do polvo
      const lp = _v.set(tt[1], 0, tt[2]).applyMatrix4(inv);
      const baseA = (i / 8) * TAU;
      const bx = Math.cos(baseA) * 3.4;
      const bz = Math.sin(baseA) * 3.4;
      const toT = Math.atan2(lp.x - bx, lp.z - bz);
      const outA = Math.atan2(bx, bz);
      let yawT = outA;
      const curl: number[] = [];
      const ph = time * 1.4 + i * 0.8;
      if (mode === T_IDLE || mode === T_HURT) {
        for (let j = 0; j < B.length; j++) curl.push(0.12 + Math.sin(ph - j * 0.55) * 0.12 + (j > 6 ? 0.18 : 0));
        if (mode === T_HURT) for (let j = 0; j < B.length; j++) curl[j] = -0.15 + Math.sin(time * 30 + j) * 0.08;
        if (def) for (let j = 0; j < B.length; j++) curl[j] = 0.3;
      } else if (mode === T_RAISE) {
        yawT = toT;
        const k = Math.min(1, 1 - tt[3] / 1.4);
        for (let j = 0; j < B.length; j++) curl.push(-0.06 * k + (j > 5 ? -0.12 * k : 0) + Math.sin(time * 6 - j) * 0.03);
        // sombra no alvo
        this.shadow.visible = true;
        this.shadow.position.set(tt[1], water(tt[1], tt[2]) + 0.08, tt[2]);
        this.shadow.scale.setScalar(1.6 - k * 0.6);
        (this.shadow.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(time * 14) * 0.2;
      } else if (mode === T_SLAM || mode === T_STUCK) {
        yawT = toT;
        const dist = Math.hypot(lp.x - bx, lp.z - bz);
        const k = mode === T_SLAM ? Math.min(1, 1 - tt[3] / 0.45) : 1;
        // deita na direção do alvo (o primeiro trecho faz a curva)
        const lay = (Math.PI / 2) * k;
        const reach = Math.max(0, Math.min(1, (dist - 2) / 8));
        for (let j = 0; j < B.length; j++) curl.push(j < 3 ? lay / 3 + (1 - reach) * 0.15 : j === 3 ? -0.02 : 0.02 + Math.sin(time * 3 + j) * (mode === T_STUCK ? 0.02 : 0));
      } else if (mode === T_GRAB) {
        yawT = toT;
        for (let j = 0; j < B.length; j++) curl.push(j < 3 ? 0.42 : j < 7 ? 0.05 : 0.55 + Math.sin(time * 8 + j) * 0.05);
      }
      T.base.rotation.y += angTo(T.base.rotation.y, yawT) * Math.min(1, dt * 6);
      for (let j = 0; j < B.length; j++) B[j].rotation.x += (curl[j] - B[j].rotation.x) * Math.min(1, dt * (mode === T_SLAM ? 14 : 4));
      (T.glow.material as THREE.MeshBasicMaterial).opacity = mode === T_STUCK ? 0.45 + Math.sin(time * 9 + i) * 0.25 : 0;
    });
  }
  hitSpheres(): HitSphere[] {
    const out: HitSphere[] = [];
    if (!this.fighting) return out;
    this.root.updateMatrixWorld(true);
    // cabeça
    this.m.eyes.getWorldPosition(_v);
    const hp = this.m.head.localToWorld(new THREE.Vector3(0, 2.2, 0));
    out.push({ x: hp.x, y: hp.y, z: hp.z, r: 2.6, w: this.eyesOpen > 0 ? 2.5 : 0.5, part: 1 });
    this.tent.forEach((tt, i) => {
      const B = this.m.tentacles[i].bones;
      for (let j = 2; j < B.length; j += 2) {
        B[j].getWorldPosition(_v);
        out.push({ x: _v.x, y: _v.y, z: _v.z, r: 0.75, w: tt[0] === T_STUCK ? (j === 4 || j === 6 ? 2 : 1) : 0.3, part: 10 + i });
      }
    });
    return out;
  }
  pose(): number[] {
    const a = [KRAKEN_ST.indexOf(this.st), r1(this.x), r1(this.z), r2(this.yaw), Math.round(this.hp), this.max, r2(this.rise), r1(this.eyesOpen), this.hurtT > 0 ? 1 : 0];
    for (const tt of this.tent) a.push(tt[0], r1(tt[1]), r1(tt[2]), r1(tt[3]));
    return a;
  }
  setPose(a: number[]): void {
    const st = KRAKEN_ST[a[0]] ?? 'off';
    if (this.st === 'off' && st !== 'off') {
      this.x = a[1];
      this.z = a[2];
    }
    this.st = st;
    this.x += (a[1] - this.x) * 0.4;
    this.z += (a[2] - this.z) * 0.4;
    this.yaw += angTo(this.yaw, a[3]) * 0.4;
    this.hp = a[4];
    this.max = a[5];
    this.rise = a[6];
    this.eyesOpen = a[7];
    if (a[8]) this.hurtT = 0.3;
    for (let i = 0; i < 8; i++) {
      const b = 9 + i * 4;
      this.tent[i] = [a[b], a[b + 1], a[b + 2], a[b + 3]];
    }
  }
  focus(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.x, this.y + 4, this.z);
  }
}
function r1(v: number): number {
  return Math.round(v * 10) / 10;
}
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}
