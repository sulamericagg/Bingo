/* ============================================================
 *  BLOOP PINK — modo "Fábrica" (centro de distribuição).
 *  Loop: bilhetinho de pedido chega → pegar os produtos nas estantes (cesta) →
 *  mesa de embalagem: MONTAR caixa → COLOCAR itens → FITA → caixa pronta →
 *  carregar até o caminhão (subir a rampa) e soltar lá dentro (física, empilha) →
 *  DESPACHAR → o caminhão volta com o pagamento. Chão sujo = escorrega.
 *  Upgrades: frota, esteira até a doca, 2ª doca, embaladora, robô separador,
 *  carregador automático (tudo automático no fim).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { music, sfx } from '../../audio';
import { HeightGround, type FpBox } from '../../3d/fpkit';
import { npcSpec } from '../../3d/paper';
import type { Tier } from '../../core/quality';
import { brandCanvas } from './brand';
import { money, PRODUCTS, PROD, type Product } from './catalog';
import { capOf, FACTORY_UPS, SHAPE_DIM, slotCap, SLOT_D, TRUCKS, xpNeed, type FactoryUp } from './data';
import { Engine } from './engine';
import { buildFurniture } from './furniture';
import { Hud } from './hud';
import { ic } from './icons';
import { Nav, Walker } from './npc';
import type { Loose } from './phys';
import { productMesh, ProductField, type PlacedItem } from './products';
import type { FactorySave } from './save';
import { Builder, rbox } from './shapes';
import { thumbUrl } from './thumb';
import { confetti } from './shop';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* planta (m): galpão x∈[-10,10] z∈[-14,0]; doca na parede x=10, vão z∈[-6,-2] */
const X0 = -10;
const X1 = 10;
const Z0 = -14;
const Z1 = 0;
const H = 5;
const DOCK_Z = [-5.6, -2.4] as const;
const TABLE = new THREE.Vector3(2.5, 0, -4);
const BED = { x0: 12.7, x1: 18.3, z0: -5.05, z1: -2.95, y: 0.95 };
const RAMP = { x0: 10.2, x1: 12.7, z0: -4.6, z1: -3.4 };
const CONV_Y = 0.85;

interface Ticket {
  id: number;
  lines: { p: Product; n: number; got: number }[];
  pay: number;
  age: number;
}
interface Rack {
  p: Product;
  g: THREE.Group;
  x: number;
  z: number;
  r: number;
}
type PackStage = 'none' | 'folded' | 'filled' | 'taped';

export interface FactoryOpts {
  root: HTMLElement;
  tier: Tier;
  save: FactorySave;
  onPause(): void;
  onSave(s: FactorySave): void;
  onCoins(n: number): void;
}

export class Factory {
  readonly e: Engine;
  readonly hud: Hud;
  readonly s: FactorySave;
  private nav = new Nav(-11, -15, 21, 1);
  private field: ProductField;
  private racks: Rack[] = [];
  private tickets: Ticket[] = [];
  private nextTicket = 1;
  private ticketT = 2;
  /** cesta na mão: itens pegos */
  private basket: Product[] = [];
  private basketMesh: THREE.Group | null = null;
  /** mesa de embalagem */
  private pack: { stage: PackStage; items: Product[]; ticket: Ticket | null; mesh: THREE.Group | null } = { stage: 'none', items: [], ticket: null, mesh: null };
  private truck: { g: THREE.Group; phase: 'dock' | 'away' | 'back'; t: number; loaded: Loose[]; pay: number } | null = null;
  private tool = 0;
  private useHeld = false;
  private aim: { kind: string; rack?: Rack; l?: Loose; d?: { x: number; z: number } } | null = null;
  private colliders: FpBox[] = [];
  private robots: { w: Walker; st: string; t: number; carry: Product[] }[] = [];
  private conveyor: { mesh: THREE.Group; items: { l: Loose | null; m: THREE.Object3D; k: number; ticketPay: number }[] } | null = null;
  private saveT = 0;
  private hudT = 0;
  private day = { shipped: 0, earned: 0 };
  private combo = 0;
  private comboT = 0;
  private destroyed = false;

  constructor(private o: FactoryOpts) {
    this.s = o.save;
    const e = new Engine(o.root, o.tier, 'pink-factory');
    this.e = e;
    this.field = new ProductField(e.kit, false);
    e.scene.add(this.field.group);
    this.buildHall();
    this.buildRacks();
    this.spawnTruck('dock');
    if (this.has('conveyor')) this.buildConveyor();
    for (const d of this.s.dirt) e.addDirt(d.x, d.z, d.k, d.a);
    if (!this.s.dirt.length) for (let i = 0; i < 5; i++) e.addDirt(-6 + Math.random() * 12, -2 - Math.random() * 9, i % 2 ? 'dirt' : 'spill', 0.6);
    if (this.has('picker')) this.spawnRobot();
    // chão: rampa + carroceria (sobe andando)
    e.fp.tune.gravity = 18;
    e.fp.ground = new HeightGround((x, z) => this.heightAt(x, z), { stepUp: 0.25, maxSlope: 0.75 });
    e.fp.place(-2, -1.5);
    e.fpc.yaw = Math.PI * 0.9;
    e.onTrip = (l) => this.onTrip(l);
    e.phys.onHit = (l, v) => {
      if (v > 3 && l.kind === 'parcel') sfx.play('drop', { db: -4 });
    };
    this.hud = new Hud(o.root, {
      pause: () => o.onPause(),
      tablet: () => this.openUpgrades(),
      toggleOpen: () => this.dispatch(),
      use: (d) => {
        this.useHeld = d;
        if (d) this.doUse();
      },
      act2: () => this.act2(),
      run: (d) => {
        if (d) e.running = !e.running;
        this.hud.run(e.running);
      },
      drop: () => this.drop(),
      rotate() {},
      cancel() {},
      slot: (i) => {
        if (i === 1 && (e.carry || this.basket.length)) return;
        this.tool = i;
        sfx.play('tap');
      },
      goals: () => this.showTickets(true),
    });
    e.camv.mountButton(this.hud.top, { label: t('pink.cam', 'Câmera') });
    // botão do topo vira "Despachar" (caminhão)
    e.frame = (dt) => this.frame(dt);
    for (let i = 0; i < 2; i++) this.newTicket();
    this.showTickets(true);
    this.refreshHud();
    music.play('pinkFactory');
    e.start();
    if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__pinkF = this.debugApi();
  }

  private has(u: FactoryUp): boolean {
    return this.s.ups.includes(u);
  }
  private heightAt(x: number, z: number): number {
    if (z > RAMP.z0 && z < RAMP.z1 && x > RAMP.x0 && x < RAMP.x1) return ((x - RAMP.x0) / (RAMP.x1 - RAMP.x0)) * BED.y;
    if (x >= RAMP.x1 && x < BED.x1 && z > BED.z0 && z < BED.z1) return BED.y;
    return 0;
  }

  /* ------------------------------ galpão ------------------------------ */
  private buildHall(): void {
    const k = this.e.kit;
    const e = this.e;
    const b = new Builder();
    const floor = k.surf('fFloor', 'concrete', { rough: 1, envK: 0.8, normalK: 0.6, color: '#d8d4d0' });
    const wall = k.surf('fWall', 'shutter', { rough: 1, envK: 0.5, color: '#f0e6ec' });
    const wallLow = k.surf('fWallLow', 'plaster', { color: '#ffd3e6', rough: 1 });
    b.addW(new THREE.PlaneGeometry(X1 - X0 + 14, Z1 - Z0 + 8).rotateX(-Math.PI / 2), floor, 3.5, 0, (Z0 + Z1) / 2 + 2);
    // faixas amarelas de segurança
    const yel = k.plain('yellow', '#f2c21a', 0.7);
    for (const x of [-1, 6]) b.add(new THREE.BoxGeometry(0.1, 0.004, 12), yel, x, 0.004, -7);
    b.add(new THREE.BoxGeometry(7, 0.004, 0.1), yel, 2.5, 0.004, -1.2);
    const wallBox = (x0: number, z0: number, x1: number, z1: number, mat: THREE.Material, h = H) => {
      const w = Math.max(0.2, x1 - x0);
      const d = Math.max(0.2, z1 - z0);
      b.addW(new THREE.BoxGeometry(w, h, d), mat, (x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      this.colliders.push({ x0, z0, x1, z1 });
      e.phys.addStatic((x0 + x1) / 2, h / 2, (z0 + z1) / 2, w / 2, h / 2, d / 2);
    };
    wallBox(X0 - 0.2, Z0 - 0.2, X1 + 0.2, Z0, wall);
    wallBox(X0 - 0.2, Z0, X0, Z1 + 0.2, wall);
    wallBox(X0, Z1, X1, Z1 + 0.2, wall);
    wallBox(X1, Z0, X1 + 0.2, DOCK_Z[0], wall);
    wallBox(X1, DOCK_Z[1], X1 + 0.2, Z1 + 0.2, wall);
    b.addW(new THREE.BoxGeometry(0.2, H - 3.2, DOCK_Z[1] - DOCK_Z[0]), wall, X1 + 0.1, 3.2 + (H - 3.2) / 2, (DOCK_Z[0] + DOCK_Z[1]) / 2);
    // barrado rosa embaixo das paredes
    b.addW(new THREE.BoxGeometry(X1 - X0, 1.2, 0.02), wallLow, 0, 0.6, Z0 + 0.012);
    b.addW(new THREE.BoxGeometry(0.02, 1.2, Z1 - Z0), wallLow, X0 + 0.012, 0.6, (Z0 + Z1) / 2);
    // logo grande na parede do fundo
    b.add(new THREE.PlaneGeometry(6, 1.5), k.canvasMat('fLogo', brandCanvas(1024, 256), { emissive: 0.15 }), 0, 3.4, Z0 + 0.02);
    // teto com treliça + luminárias industriais
    const metal = k.plain('truss', '#8a8f9a', 0.5, 0.7);
    b.addW(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(Math.PI / 2), k.surf('fRoof', 'metal', { rough: 1, color: '#b8bcc4' }), 0, H, (Z0 + Z1) / 2);
    for (let z = Z0 + 2; z < Z1; z += 3) b.add(new THREE.BoxGeometry(X1 - X0, 0.12, 0.12), metal, 0, H - 0.3, z);
    const lampM = k.plain('fLamp', '#ffffff', 0.4, 0, { emissive: '#fff6ea', ei: 1.4 });
    for (let x = -6; x <= 6; x += 6)
      for (let z = -3; z >= -12; z -= 4.5) {
        b.add(new THREE.CylinderGeometry(0.3, 0.45, 0.25, 18, 1, true), k.plain('fLampShade', '#3a3d44', 0.5, 0.6, { side: THREE.DoubleSide }), x, H - 1.1, z);
        b.add(new THREE.CircleGeometry(0.28, 16).rotateX(Math.PI / 2), lampM, x, H - 1.2, z);
        b.add(new THREE.CylinderGeometry(0.01, 0.01, 1, 4), metal, x, H - 0.5, z);
      }
    // mesa de embalagem (bancada grande) + rolo de fita + caixas desmontadas
    const wood = k.surf('benchTop', 'woodLight', { rough: 0.9 });
    b.add(rbox(2.4, 0.06, 1.1, 0.02, 2), wood, TABLE.x, 0.9, TABLE.z);
    for (const dx of [-1.1, 1.1]) for (const dz of [-0.45, 0.45]) b.add(new THREE.BoxGeometry(0.06, 0.88, 0.06), metal, TABLE.x + dx, 0.44, TABLE.z + dz);
    b.add(rbox(2.3, 0.03, 1.0, 0.01, 1), metal, TABLE.x, 0.25, TABLE.z);
    for (let i = 0; i < 6; i++) b.add(new THREE.BoxGeometry(0.7, 0.012, 0.5), k.surf('cardFlat', 'cardboard', { rough: 1 }), TABLE.x - 0.7, 0.27 + i * 0.014, TABLE.z, 0, i * 0.05, 0);
    b.add(new THREE.TorusGeometry(0.07, 0.03, 8, 16).rotateX(Math.PI / 2), k.plain('tapeRoll', '#e8dcb8', 0.4), TABLE.x + 0.9, 0.96, TABLE.z - 0.35);
    // impressora de bilhetes
    b.add(rbox(0.35, 0.25, 0.3, 0.04, 2), k.plain('printer', '#f4f0f2', 0.4), TABLE.x + 0.95, 1.05, TABLE.z + 0.3);
    b.add(new THREE.PlaneGeometry(0.15, 0.2).rotateX(-0.6), k.plain('ticketPaper', '#fff8d0', 0.8), TABLE.x + 0.95, 1.22, TABLE.z + 0.42);
    this.colliders.push({ x0: TABLE.x - 1.2, z0: TABLE.z - 0.55, x1: TABLE.x + 1.2, z1: TABLE.z + 0.55 });
    e.phys.addStatic(TABLE.x, 0.45, TABLE.z, 1.2, 0.465, 0.55);
    // doca: plataforma lá fora (asfalto) e para-choques
    b.addW(new THREE.PlaneGeometry(14, 12).rotateX(-Math.PI / 2), k.surf('fAsph', 'asphalt', { rough: 1 }), X1 + 7, 0.003, -4);
    for (const z of [DOCK_Z[0] - 0.1, DOCK_Z[1] + 0.1]) b.add(rbox(0.25, 0.5, 0.3, 0.05, 1), k.plain('bumper', '#26222a', 0.8), X1 + 0.3, 0.6, z);
    // muro lá fora (limite)
    const brick = k.surf('fBrick', 'brick', { rough: 1 });
    wallBox(X1 + 0.2, -10.4, X1 + 14, -10.2, brick, 2.5);
    wallBox(X1 + 0.2, 2.2, X1 + 14, 2.4, brick, 2.5);
    wallBox(X1 + 13.8, -10.2, X1 + 14, 2.2, brick, 2.5);
    e.scene.add(b.build({ receive: true }));
    e.scene.background = new THREE.Color('#cfe6ff');
    e.hemi.intensity = 0.45;
    e.sun.position.set(14, 12, 6);
    if (this.e.tier >= 2)
      for (const x of [-5, 5]) {
        const pl = new THREE.PointLight('#fff4e4', 10, 14, 1.3);
        pl.position.set(x, H - 1.4, -7);
        e.scene.add(pl);
      }
    this.refreshCollision();
  }
  private refreshCollision(): void {
    const c = [...this.colliders, ...this.truckColliders()];
    this.e.setColliders(c);
    this.nav.rebuild(c, 0.26);
  }
  private truckColliders(): FpBox[] {
    if (!this.truck || this.truck.phase !== 'dock') return [{ x0: X1, z0: DOCK_Z[0], x1: X1 + 0.3, z1: DOCK_Z[1] }];
    // laterais da carroceria e da rampa
    return [
      { x0: BED.x0, z0: BED.z0 - 0.15, x1: BED.x1 + 2.2, z1: BED.z0 },
      { x0: BED.x0, z0: BED.z1, x1: BED.x1 + 2.2, z1: BED.z1 + 0.15 },
      { x0: BED.x1, z0: BED.z0, x1: BED.x1 + 2.2, z1: BED.z1 },
      // lados da rampa (cair da rampa = não deixa)
      { x0: RAMP.x0 + 0.3, z0: RAMP.z0 - 0.4, x1: RAMP.x1, z1: RAMP.z0 },
      { x0: RAMP.x0 + 0.3, z0: RAMP.z1, x1: RAMP.x1, z1: RAMP.z1 + 0.4 },
    ];
  }

  private buildRacks(): void {
    const unlockedP = PRODUCTS.filter((p) => p.lvl <= Math.max(3, this.s.lvl + 2));
    const pick = unlockedP.filter((_, i) => i % Math.max(1, Math.floor(unlockedP.length / 22)) === 0).slice(0, 22);
    let i = 0;
    const put = (x: number, z: number, r: number) => {
      const p = pick[i++ % pick.length];
      const m = buildFurniture(this.e.kit, 'shelf');
      m.group.position.set(x, 0, z);
      m.group.rotation.y = (r * Math.PI) / 2;
      this.e.scene.add(m.group);
      m.group.updateMatrixWorld(true);
      this.racks.push({ p, g: m.group, x, z, r });
      const w = r % 2 ? 0.46 : 1.2;
      const d = r % 2 ? 1.2 : 0.46;
      this.colliders.push({ x0: x - w / 2, z0: z - d / 2, x1: x + w / 2, z1: z + d / 2 });
      this.e.phys.addStatic(x, 0.9, z, w / 2, 0.9, d / 2);
    };
    for (let k = 0; k < 7; k++) put(-8.2 + k * 1.25, Z0 + 0.3, 0);
    for (let k = 0; k < 7; k++) put(X0 + 0.3, -11.6 + k * 1.3, 1);
    for (let k = 0; k < 4; k++) put(-4.6 + k * 1.25, -7.5, 0);
    for (let k = 0; k < 4; k++) put(-4.6 + k * 1.25, -8.0, 2);
    // produtos nas estantes (estoque infinito do fornecedor)
    const items: PlacedItem[] = [];
    const q = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (const rk of this.racks) {
      const [w, hh, d] = SHAPE_DIM[rk.p.shape];
      const c = slotCap(rk.p.shape);
      for (const y of [0.165, 0.545, 0.925, 1.305])
        for (let sx = 0; sx < 4; sx++) {
          const yaw = (rk.r * Math.PI) / 2;
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
          for (let n = 0; n < Math.min(capOf(rk.p.shape), c.nx * c.nz); n++) {
            const col = n % c.nx;
            const row = Math.floor(n / c.nx) % c.nz;
            const lx = -0.45 + sx * 0.3 + (col - (c.nx - 1) / 2) * (w + 0.012);
            const lz = 0.02 + SLOT_D / 2 - d / 2 - 0.02 - row * (d + 0.012);
            const p = new THREE.Vector3(lx, y, lz).applyMatrix4(rk.g.matrixWorld);
            items.push({ p: rk.p, m: new THREE.Matrix4().compose(p, q, one) });
          }
          void hh;
        }
    }
    this.field.rebuild(items);
  }

  /* ------------------------------ caminhão ------------------------------ */
  private truckModel(): THREE.Group {
    const k = this.e.kit;
    const b = new Builder();
    const white = k.plain('fTruckW', '#f7f4f2', 0.3, 0.2, { envK: 1.2 });
    const pink = k.plain('fTruckP', '#ff8cc0', 0.35, 0.2, { envK: 1.2 });
    const dark = k.plain('fTruckD', '#26222a', 0.6);
    const floorM = k.surf('bedFloor', 'wood', { rough: 1, color: '#b89070' });
    const L = BED.x1 - BED.x0;
    const cx = (BED.x0 + BED.x1) / 2;
    // carroceria aberta atrás: piso, laterais, teto, frente
    b.addW(new THREE.BoxGeometry(L, 0.1, BED.z1 - BED.z0 + 0.3), floorM, cx, BED.y - 0.05, -4);
    b.add(new THREE.BoxGeometry(L, 2.3, 0.08), white, cx, BED.y + 1.15, BED.z0 - 0.08);
    b.add(new THREE.BoxGeometry(L, 2.3, 0.08), white, cx, BED.y + 1.15, BED.z1 + 0.08);
    b.add(new THREE.BoxGeometry(L, 0.08, BED.z1 - BED.z0 + 0.25), white, cx, BED.y + 2.3, -4);
    b.add(new THREE.BoxGeometry(0.08, 2.3, BED.z1 - BED.z0 + 0.25), white, BED.x1 + 0.04, BED.y + 1.15, -4);
    b.add(new THREE.PlaneGeometry(L * 0.8, 0.9), k.canvasMat('fTruckLogo', brandCanvas(800, 200)), cx, BED.y + 1.3, BED.z0 - 0.125, 0, Math.PI, 0);
    b.add(new THREE.PlaneGeometry(L * 0.8, 0.9), k.canvasMat('fTruckLogo', brandCanvas(800, 200)), cx, BED.y + 1.3, BED.z1 + 0.125);
    // cabine
    b.add(rbox(1.7, 1.9, 2.3, 0.25, 3), pink, BED.x1 + 1.0, 1.3, -4);
    b.add(rbox(0.05, 0.8, 2.0, 0.1, 2), k.glass('fTruckGlass', '#304050', 0.85), BED.x1 + 1.86, 1.7, -4);
    // rodas e chassi
    b.add(rbox(L + 1.8, 0.25, 1.8, 0.05, 1), dark, cx + 0.9, 0.55, -4);
    for (const x of [BED.x0 + 0.9, BED.x0 + 1.9, BED.x1 + 1.2]) for (const z of [-5.1, -2.9]) b.add(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 18).rotateX(Math.PI / 2), dark, x, 0.45, z);
    // rampa (prancha metálica)
    const ramp = new THREE.BoxGeometry(Math.hypot(RAMP.x1 - RAMP.x0, BED.y), 0.05, RAMP.z1 - RAMP.z0);
    b.add(ramp, k.plain('rampM', '#9aa0aa', 0.35, 0.9, { envK: 1.2 }), (RAMP.x0 + RAMP.x1) / 2, BED.y / 2, -4, 0, 0, Math.atan2(BED.y, RAMP.x1 - RAMP.x0));
    for (let i = 1; i < 6; i++) b.add(new THREE.BoxGeometry(0.03, 0.02, RAMP.z1 - RAMP.z0), dark, RAMP.x0 + i * 0.4, (i * 0.4 / (RAMP.x1 - RAMP.x0)) * BED.y + 0.035, -4, 0, 0, Math.atan2(BED.y, RAMP.x1 - RAMP.x0));
    return b.build({ shadow: this.e.tier >= 3 });
  }
  private truckBodies: import('cannon-es').Body[] = [];
  private spawnTruck(phase: 'dock' | 'back'): void {
    const g = this.truckModel();
    this.e.scene.add(g);
    this.truck = { g, phase, t: 0, loaded: [], pay: 0 };
    if (phase === 'back') g.position.x = 20;
    else this.truckPhys(true);
    this.refreshCollision();
  }
  private truckPhys(on: boolean): void {
    const ph = this.e.phys;
    for (const b of this.truckBodies) ph.removeStatic(b);
    this.truckBodies = [];
    if (!on) return;
    const cx = (BED.x0 + BED.x1) / 2;
    const L = (BED.x1 - BED.x0) / 2;
    this.truckBodies.push(ph.addStatic(cx, BED.y - 0.05, -4, L, 0.05, (BED.z1 - BED.z0) / 2 + 0.15));
    this.truckBodies.push(ph.addStatic(cx, BED.y + 1.15, BED.z0 - 0.08, L, 1.15, 0.04));
    this.truckBodies.push(ph.addStatic(cx, BED.y + 1.15, BED.z1 + 0.08, L, 1.15, 0.04));
    this.truckBodies.push(ph.addStatic(BED.x1 + 0.04, BED.y + 1.15, -4, 0.04, 1.15, 1.2));
    // rampa como caixa inclinada (aproximação: degrau baixo)
    this.truckBodies.push(ph.addStatic((RAMP.x0 + RAMP.x1) / 2 + 0.6, BED.y * 0.35, -4, 0.6, BED.y * 0.35, 0.6));
  }
  private cap(): number {
    return TRUCKS[this.s.truck].cap * (this.has('dock2') ? 1.5 : 1);
  }
  private inTruck(l: Loose): boolean {
    const p = l.body.position;
    return p.x > BED.x0 - 0.1 && p.x < BED.x1 + 0.1 && p.z > BED.z0 - 0.1 && p.z < BED.z1 + 0.1 && p.y > BED.y - 0.2;
  }
  private dispatch(): void {
    const tr = this.truck;
    if (!tr || tr.phase !== 'dock') return;
    const loaded = this.e.phys.items.filter((l) => l.kind === 'parcel' && this.inTruck(l));
    if (!loaded.length) {
      sfx.play('wrong');
      this.hud.banner('truck', t('pink.f.empty', 'Carregue caixas prontas no caminhão primeiro!'), 1800);
      return;
    }
    // jogador dentro do caminhão? sai antes
    if (this.e.fp.x > X1 - 0.2) this.e.fp.place(X1 - 1, -4);
    tr.pay = loaded.reduce((a, l) => a + ((l.data.pay as number) ?? 0), 0);
    for (const l of loaded) this.e.removeLoose(l);
    tr.loaded = [];
    tr.phase = 'away';
    tr.t = 0;
    this.truckPhys(false);
    this.refreshCollision();
    sfx.play('truck');
    this.hud.banner('truck', t('pink.f.sent', 'Caminhão saiu com {n} caixas!', { n: loaded.length }), 2000);
    this.day.shipped += loaded.length;
    this.s.shipped += loaded.length;
    this.addXp(loaded.length * 12);
  }
  private truckUpdate(dt: number): void {
    const tr = this.truck;
    if (!tr) return;
    tr.t += dt;
    if (tr.phase === 'away') {
      const k = Math.min(1, tr.t / 3);
      tr.g.position.x = k * k * 30;
      if (tr.t > TRUCKS[this.s.truck].trip / 3) {
        tr.phase = 'back';
        tr.t = 0;
        sfx.play('backup');
      }
    } else if (tr.phase === 'back') {
      const k = Math.min(1, tr.t / 3);
      tr.g.position.x = (1 - (k * (2 - k))) * 30;
      if (k >= 1) {
        tr.phase = 'dock';
        tr.g.position.x = 0;
        this.truckPhys(true);
        this.refreshCollision();
        // pagamento
        const pay = Math.round(tr.pay);
        this.s.money += pay;
        this.day.earned += pay;
        sfx.play('cash');
        this.hud.banner('cash', t('pink.f.paid', 'Entregas pagas: +{v}', { v: money(pay) }), 2400);
        this.hud.flash();
        // moedas do app: 1 a cada 60
        if (pay > 0) this.o.onCoins(Math.max(1, Math.round(pay / 60)));
        this.save();
      }
    }
  }

  /* ------------------------------ esteira (upgrade) ------------------------------ */
  private buildConveyor(): void {
    const k = this.e.kit;
    const b = new Builder();
    const belt = k.plain('belt', '#2a2a30', 0.7);
    const rail = k.plain('beltRail', '#c8ccd4', 0.3, 0.8);
    const x0 = TABLE.x + 1.3;
    const x1 = X1 - 0.4;
    b.add(new THREE.BoxGeometry(x1 - x0, 0.06, 0.6), belt, (x0 + x1) / 2, CONV_Y, -4);
    for (const z of [-4.33, -3.67]) b.add(new THREE.BoxGeometry(x1 - x0, 0.1, 0.05), rail, (x0 + x1) / 2, CONV_Y + 0.02, z);
    for (let x = x0 + 0.3; x < x1; x += 1.2) for (const z of [-4.3, -3.7]) b.add(new THREE.BoxGeometry(0.06, CONV_Y, 0.06), rail, x, CONV_Y / 2, z);
    const g = b.build();
    this.e.scene.add(g);
    this.conveyor = { mesh: g, items: [] };
    this.colliders.push({ x0, z0: -4.35, x1, z1: -3.65 });
    this.refreshCollision();
  }

  /* ------------------------------ robô separador ------------------------------ */
  private spawnRobot(): void {
    const w = new Walker(npcSpec('#c0c8d8', '#6a7a8a'), -2, -3, 0.36);
    w.speed = 1.8;
    this.e.scene.add(w.char.root);
    this.robots.push({ w, st: 'idle', t: 0, carry: [] });
  }

  /* ------------------------------ bilhetes ------------------------------ */
  private newTicket(): void {
    if (this.tickets.length >= 5) return;
    const lv = this.s.lvl;
    const n = Math.min(5, 1 + Math.floor(Math.random() * (2 + lv / 6)));
    const lines: Ticket['lines'] = [];
    const pool = [...new Set(this.racks.map((r) => r.p))];
    for (let i = 0; i < n; i++) {
      const p = pool[Math.floor(Math.random() * pool.length)];
      const ex = lines.find((l) => l.p === p);
      if (ex) ex.n++;
      else lines.push({ p, n: 1, got: 0 });
    }
    const pay = Math.round(lines.reduce((a, l) => a + l.p.mkt * 0.35 * l.n, 0) + 8 + lv * 2);
    this.tickets.push({ id: this.nextTicket++, lines, pay, age: 0 });
    sfx.play('ding', { db: -6 });
    this.showTickets(true);
  }
  private get cur(): Ticket | null {
    return this.pack.ticket ?? this.tickets[0] ?? null;
  }
  private showTickets(show: boolean): void {
    const tk = this.cur;
    let html = '';
    if (this.s.tut < 1) html += `<div class="row tut">${ic('ticket', 22)}<span>${esc(t('pink.f.tut', 'Pegue os produtos do bilhete nas estantes e leve à mesa de embalagem'))}</span></div>`;
    if (tk) {
      html += `<div class="row">${ic('ticket', 22)}<b style="margin:0;color:#3a0d2a">#${tk.id}</b><span style="margin-left:auto">${ic('coin', 16)}${esc(money(tk.pay))}</span></div>`;
      for (const l of tk.lines) {
        const have = Math.min(l.n, this.basket.filter((p) => p === l.p).length + this.pack.items.filter((p) => p === l.p).length);
        html += `<div class="row${have >= l.n ? ' done' : ''}"><img src="${thumbUrl(l.p)}" width="28" height="23" alt=""><span>${esc(l.p.name)}</span><b>${have}/${l.n}</b></div>`;
      }
      if (this.tickets.length > 1) html += `<div class="row" style="font-size:12px">${ic('ticket', 16)} +${this.tickets.length - 1}</div>`;
    }
    this.hud.goals(html, show);
  }

  /* ------------------------------ ações ------------------------------ */
  private aimUpdate(): void {
    const e = this.e;
    const c = e.carry;
    let info: Factory['aim'] = null;
    let hint = '';
    let hicon = '';
    let use: [string, string, boolean] = ['hand', '', false];
    let act2: [string | null, string] = [null, ''];
    if (this.tool === 1) {
      const h = e.floorHit(3);
      const d = h ? e.dirtAt(h.x, h.z) : null;
      if (h && d) {
        info = { kind: 'mop', d: { x: h.x, z: h.z } };
        hint = t('pink.h.clean', 'Segure para limpar');
        hicon = 'mop';
      }
      use = ['mop', t('pink.u.clean', 'Limpar'), !!info];
    } else {
      const nearTable = Math.hypot(e.fp.x - TABLE.x, e.fp.z - TABLE.z) < 1.9;
      // estante?
      const R = 2.4;
      let rack: Rack | null = null;
      let rd = R;
      const b3 = new THREE.Box3();
      const hit = new THREE.Vector3();
      for (const rk of this.racks) {
        const w = rk.r % 2 ? 0.46 : 1.2;
        const d = rk.r % 2 ? 1.2 : 0.46;
        b3.min.set(rk.x - w / 2, 0, rk.z - d / 2);
        b3.max.set(rk.x + w / 2, 1.8, rk.z + d / 2);
        if (e.ray.intersectBox(b3, hit)) {
          const dd = hit.distanceTo(e.ray.origin);
          if (dd < rd) {
            rd = dd;
            rack = rk;
          }
        }
      }
      const l = e.phys.pick(e.ray, R, (x) => x.kind !== 'shard');
      if (nearTable && !c && this.lookingAtTable()) {
        info = { kind: 'table' };
        const st = this.pack.stage;
        hicon = 'tape';
        if (st === 'none') {
          use = ['box', t('pink.f.fold', 'Montar caixa'), true];
          hint = t('pink.f.table', 'Mesa de embalagem');
        } else if (st === 'folded' || st === 'filled') {
          const can = this.basket.length > 0;
          const full = this.packComplete();
          if (full) use = ['tape', t('pink.f.tape', 'Passar fita'), true];
          else use = ['boxOpen', t('pink.f.put', 'Colocar'), can];
          hint = full ? t('pink.f.ready', 'Tudo dentro! Feche com fita.') : can ? t('pink.f.putHint', 'Coloque os itens do bilhete na caixa') : t('pink.f.need', 'Faltam itens do bilhete');
        } else if (st === 'taped') {
          use = ['hand', t('pink.u.pick', 'Pegar'), true];
          hint = t('pink.f.done', 'Caixa pronta! Leve ao caminhão.');
          hicon = 'box';
        }
        if ((st === 'folded' || st === 'filled') && this.pack.items.length === 0) act2 = ['close', t('pink.cancel', 'Cancelar')];
      } else if (rack && !c && (!l || rd < l.mesh.position.distanceTo(e.ray.origin))) {
        info = { kind: 'rack', rack };
        hint = rack.p.name;
        hicon = 'shelf';
        const want = this.cur?.lines.some((x) => x.p === rack!.p);
        use = ['hand', t('pink.u.pick', 'Pegar'), this.basket.length < 8];
        if (want) hicon = 'ticket';
        if (this.basket.length) act2 = ['drop', t('pink.f.back', 'Devolver')];
      } else if (l && !c && !this.basket.length) {
        info = { kind: 'pick', l };
        hint = l.kind === 'parcel' ? t('pink.f.parcel', 'Caixa pronta') : PROD[l.data.p as string]?.name ?? '';
        hicon = 'box';
        use = ['hand', t('pink.u.pick', 'Pegar'), true];
      } else if (c?.kind === 'parcel') {
        hint = e.fp.y > 0.5 ? t('pink.f.dropIn', 'Solte a caixa aqui dentro!') : t('pink.f.toTruck', 'Leve até o caminhão (suba a rampa)');
        hicon = 'truck';
        use = ['drop', t('pink.drop', 'Soltar'), true];
        info = { kind: 'dropParcel' };
        if (this.conveyor && Math.abs(e.fp.z + 4) < 1.2 && e.fp.x > TABLE.x + 1 && e.fp.x < TABLE.x + 3) {
          info = { kind: 'conveyor' };
          use = ['conveyor', t('pink.f.belt', 'Na esteira'), true];
        }
      }
    }
    this.aim = info;
    this.hud.hint(hicon, hint);
    this.hud.use(use[0], use[1], use[2]);
    this.hud.act2(act2[0], act2[1]);
  }
  private lookingAtTable(): boolean {
    const e = this.e;
    const b3 = new THREE.Box3(new THREE.Vector3(TABLE.x - 1.3, 0, TABLE.z - 0.6), new THREE.Vector3(TABLE.x + 1.3, 1.3, TABLE.z + 0.6));
    return !!e.ray.intersectBox(b3, new THREE.Vector3());
  }
  private packComplete(): boolean {
    const tk = this.pack.ticket;
    if (!tk) return false;
    return tk.lines.every((l) => this.pack.items.filter((p) => p === l.p).length >= l.n);
  }
  private doUse(): void {
    const a = this.aim;
    const e = this.e;
    if (!a) return;
    if (a.kind === 'rack' && a.rack) {
      if (this.basket.length >= 8) return;
      this.basket.push(a.rack.p);
      sfx.play('pick');
      this.refreshBasket();
      this.showTickets(false);
      if (this.s.tut < 1 && this.cur && this.cur.lines.every((l) => this.basket.filter((p) => p === l.p).length >= l.n)) this.hud.banner('tape', t('pink.f.toTable', 'Agora vá à mesa de embalagem!'), 2000);
    } else if (a.kind === 'table') this.tableAction();
    else if (a.kind === 'pick' && a.l) e.pickUp(a.l);
    else if (a.kind === 'dropParcel') this.drop();
    else if (a.kind === 'conveyor') this.toConveyor();
  }
  private act2(): void {
    const a = this.aim;
    if (a?.kind === 'rack' && this.basket.length) {
      this.basket.pop();
      sfx.play('tap');
      this.refreshBasket();
      this.showTickets(false);
    } else if (a?.kind === 'table' && this.pack.stage !== 'none' && !this.pack.items.length) {
      this.clearPack();
    }
  }
  private tableAction(): void {
    const p = this.pack;
    if (p.stage === 'none') {
      if (!this.tickets.length) {
        this.hud.banner('ticket', t('pink.f.noTicket', 'Sem bilhete agora — espere o próximo!'), 1500);
        return;
      }
      p.stage = 'folded';
      p.ticket = this.tickets[0];
      sfx.play('fold');
      this.e.fpc.kick(0.3);
    } else if (p.stage === 'folded' || p.stage === 'filled') {
      if (this.packComplete()) {
        p.stage = 'taped';
        sfx.play('tape');
        this.e.fpc.kick(0.4);
        if (this.has('packer')) this.takeParcel(true);
      } else {
        // coloca na caixa o que é do bilhete
        const tk = p.ticket!;
        let moved = 0;
        for (const l of tk.lines) {
          let need = l.n - p.items.filter((x) => x === l.p).length;
          for (let i = this.basket.length - 1; i >= 0 && need > 0; i--)
            if (this.basket[i] === l.p) {
              p.items.push(l.p);
              this.basket.splice(i, 1);
              need--;
              moved++;
            }
        }
        if (!moved) {
          sfx.play('wrong');
          this.hud.banner('ticket', t('pink.f.wrong', 'Esses itens não são do bilhete!'), 1500);
        } else {
          p.stage = 'filled';
          sfx.play('place');
        }
        this.refreshBasket();
      }
    } else if (p.stage === 'taped') this.takeParcel(false);
    this.refreshPackMesh();
    this.showTickets(false);
  }
  private takeParcel(auto: boolean): void {
    const p = this.pack;
    const tk = p.ticket!;
    this.tickets.splice(this.tickets.indexOf(tk), 1);
    const l = this.e.spawnBox(null, 0, TABLE.x, 1.2, TABLE.z, { kind: 'parcel', data: { pay: tk.pay, ticket: tk.id } });
    this.clearPack();
    this.combo++;
    this.comboT = 30;
    this.hud.combo(this.combo);
    this.addXp(6 + tk.lines.length * 2);
    if (this.s.tut < 1) {
      this.s.tut = 1;
      this.hud.banner('truck', t('pink.f.tutTruck', 'Leve a caixa para o caminhão e toque em DESPACHAR!'), 2600);
    }
    if (auto || this.conveyor) {
      if (this.conveyor && auto) {
        this.e.phys.remove(l);
        this.conveyor.items.push({ l, m: l.mesh, k: 0, ticketPay: tk.pay });
        return;
      }
    }
    if (!auto) this.e.pickUp(l);
  }
  private toConveyor(): void {
    const c = this.e.carry;
    if (!c || !this.conveyor) return;
    const m = c.mesh;
    this.e.consumeCarry();
    this.e.scene.add(m);
    // re-cria como solto mas sem física enquanto anda
    const l = this.e.spawnBox(null, 0, TABLE.x + 1.5, CONV_Y + 0.2, -4, { kind: 'parcel', data: { ...c.data } });
    this.e.phys.remove(l);
    m.removeFromParent();
    this.conveyor.items.push({ l, m: l.mesh, k: 0, ticketPay: (c.data.pay as number) ?? 0 });
    sfx.play('place');
  }
  private clearPack(): void {
    const p = this.pack;
    // itens que estavam na caixa voltam para a cesta
    this.basket.push(...p.items);
    p.items = [];
    p.stage = 'none';
    p.ticket = null;
    this.refreshPackMesh();
    this.refreshBasket();
  }
  private refreshPackMesh(): void {
    const p = this.pack;
    if (p.mesh) {
      p.mesh.removeFromParent();
      p.mesh = null;
    }
    if (p.stage === 'none') return;
    const m = this.e.boxMesh(null, 0.5, 0.34, 0.38, p.stage !== 'taped', 0);
    if (p.stage !== 'taped')
      p.items.forEach((pr, i) => {
        const pm = productMesh(this.e.kit, pr);
        pm.position.set(-0.15 + (i % 3) * 0.15, -0.16, -0.08 + Math.floor(i / 3) * 0.16);
        pm.scale.setScalar(Math.min(1, 0.3 / SHAPE_DIM[pr.shape][1]));
        m.add(pm);
      });
    m.position.set(TABLE.x + 0.15, 0.93 + 0.17, TABLE.z);
    this.e.scene.add(m);
    p.mesh = m;
  }
  private refreshBasket(): void {
    // cesta na mão (1ª pessoa) — malha simples presa na câmera
    if (this.basketMesh) {
      this.basketMesh.removeFromParent();
      this.basketMesh = null;
    }
    if (!this.basket.length) return;
    const g = new THREE.Group();
    const k = this.e.kit;
    const bm = k.plain('basket', '#ff5fa2', 0.5, 0, { side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.13, 16, 1, true), bm);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.13, 16).rotateX(-Math.PI / 2), bm);
    bottom.position.y = -0.065;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20, Math.PI), k.plain('basketH', '#ffffff', 0.4));
    handle.position.y = 0.06;
    g.add(body, bottom, handle);
    this.basket.slice(0, 6).forEach((p, i) => {
      const pm = productMesh(k, p);
      pm.scale.setScalar(Math.min(0.8, 0.16 / SHAPE_DIM[p.shape][1]));
      pm.position.set(-0.06 + (i % 3) * 0.06, -0.05, -0.04 + Math.floor(i / 3) * 0.07);
      g.add(pm);
    });
    g.position.set(0.22, -0.32, -0.55);
    g.rotation.set(0.25, 0, 0);
    this.e.camera.add(g);
    this.basketMesh = g;
  }
  private drop(): void {
    const c = this.e.carry;
    if (!c) return;
    const inTruck = this.e.fp.y > 0.5;
    const l = this.e.dropCarry(undefined, inTruck ? new THREE.Vector3(this.e.fp.x - Math.sin(this.e.fpc.yaw) * 0.6, this.e.fp.y + 0.9, this.e.fp.z - Math.cos(this.e.fpc.yaw) * 0.6) : undefined);
    if (l && inTruck) {
      sfx.play('place');
      this.hud.float(this.o.root.clientWidth / 2, this.o.root.clientHeight * 0.45, ic('check', 26));
      const n = this.e.phys.items.filter((x) => x.kind === 'parcel' && this.inTruck(x)).length + 1;
      if (n >= this.cap()) this.hud.banner('truck', t('pink.f.full', 'Caminhão cheio! Toque em DESPACHAR.'), 2000);
    }
  }
  private onTrip(l: Loose): void {
    if (l.kind === 'parcel') this.hud.banner('dirty', t('pink.oops', 'Opa! Tropeçou!'), 1400);
    // a cesta derruba produtos
    if (this.basket.length) {
      for (const p of this.basket.splice(0, Math.min(3, this.basket.length))) this.e.spawnItem(p.id, this.e.fp.x, 1, this.e.fp.z, new THREE.Vector3((Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3));
      this.refreshBasket();
    }
  }

  /* ------------------------------ upgrades (painel) ------------------------------ */
  private openUpgrades(): void {
    if (this.hud.overlay) return;
    const s = this.s;
    const row = (icon: string, name: string, sub: string, btn: string) => `<div class="pk-line">${ic(icon, 30)}<span class="grow"><b>${esc(name)}</b><br><small>${sub}</small></span>${btn}</div>`;
    let html = `<h2>${ic('factory', 30)}${esc(t('pink.f.title', 'Centro de distribuição'))}</h2>`;
    html += `<div class="pk-stats"><div class="pk-stat">${ic('coin', 28)}<span>${esc(t('pink.f.cash', 'Caixa'))}<b>${esc(money(s.money))}</b></span></div><div class="pk-stat">${ic('box', 28)}<span>${esc(t('pink.f.shipped', 'Enviadas'))}<b>${s.shipped}</b></span></div><div class="pk-stat">${ic('star', 28)}<span>${esc(t('pink.f.level', 'Nível'))}<b>${s.lvl}</b></span></div></div>`;
    html += `<div class="pk-sec">${ic('truck', 22)}${esc(t('pink.f.fleet', 'Frota'))}</div>`;
    TRUCKS.forEach((tr, i) => {
      const own = s.truck >= i;
      html += row('truck', tr.name, `${ic('box', 12)} ${tr.cap}`, own ? ic('check', 26) : i === s.truck + 1 ? `<button class="pk-b g" data-tr="${i}" ${s.money >= tr.price ? '' : 'disabled'}>${ic('coin', 16)}${esc(money(tr.price))}</button>` : ic('lock', 22));
    });
    html += `<div class="pk-sec">${ic('conveyor', 22)}${esc(t('pink.f.auto', 'Automação'))}</div>`;
    for (const u of FACTORY_UPS) {
      const own = s.ups.includes(u.id);
      const lock = s.lvl < u.lvl;
      html += row(u.id === 'conveyor' ? 'conveyor' : u.id === 'picker' || u.id === 'loader' ? 'robot' : u.id === 'dock2' ? 'truck' : 'tape', u.name, `★${u.lvl}`, own ? ic('check', 26) : lock ? `<b>★${u.lvl}</b>` : `<button class="pk-b g" data-up="${u.id}" ${s.money >= u.price ? '' : 'disabled'}>${ic('coin', 16)}${esc(money(u.price))}</button>`);
    }
    html += `<div class="pk-row"><button class="pk-b w" data-a="x">${ic('close', 22)}${esc(t('pink.close', 'Fechar'))}</button></div>`;
    const d = this.hud.panel(html);
    d.querySelector('[data-a=x]')!.addEventListener('click', () => this.hud.closePanel());
    d.querySelectorAll<HTMLElement>('[data-tr]').forEach((b) =>
      b.addEventListener('click', () => {
        const i = +b.dataset.tr!;
        if (s.money < TRUCKS[i].price) return;
        s.money -= TRUCKS[i].price;
        s.truck = i;
        sfx.play('levelup');
        this.hud.closePanel();
        this.openUpgrades();
      }),
    );
    d.querySelectorAll<HTMLElement>('[data-up]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = FACTORY_UPS.find((x) => x.id === b.dataset.up)!;
        if (s.money < u.price) return;
        s.money -= u.price;
        s.ups.push(u.id);
        if (u.id === 'conveyor') this.buildConveyor();
        if (u.id === 'picker') this.spawnRobot();
        sfx.play('levelup');
        this.hud.closePanel();
        this.openUpgrades();
        this.save();
      }),
    );
  }

  /* ------------------------------ XP ------------------------------ */
  private addXp(n: number): void {
    const s = this.s;
    s.xp += n;
    while (s.lvl < 100 && s.xp >= xpNeed(s.lvl)) {
      s.xp -= xpNeed(s.lvl);
      s.lvl++;
      sfx.play('levelup');
      const d = this.hud.panel(`<h2>${ic('star', 34)}${esc(t('pink.levelUp', 'Nível {n}!', { n: s.lvl }))}</h2><div class="pk-row"><button class="pk-b g">${ic('check', 24)}${esc(t('pink.ok', 'Oba!'))}</button></div>`);
      confetti(d);
      d.querySelector('button')!.addEventListener('click', () => this.hud.closePanel());
    }
    this.refreshHud();
  }
  private refreshHud(): void {
    const s = this.s;
    const e = this.e;
    this.hud.money(money(s.money));
    this.hud.day('factory', t('pink.dayShort', 'Dia {n}', { n: s.day }), '');
    this.hud.level(s.lvl, s.xp / xpNeed(s.lvl));
    const loaded = this.e.phys.items.filter((l) => l.kind === 'parcel' && this.inTruck(l)).length;
    const b = this.hud.el.querySelector('[data-a=open]') as HTMLElement;
    const key = `${loaded}/${Math.round(this.cap())}:${this.truck?.phase}`;
    if (b.dataset.k !== key) {
      b.dataset.k = key;
      b.classList.toggle('closed', this.truck?.phase !== 'dock' || !loaded);
      b.classList.toggle('pulse', loaded >= this.cap());
      b.innerHTML = `${ic('truck', 26)}<span>${this.truck?.phase === 'dock' ? `${esc(t('pink.f.dispatch', 'Despachar'))} ${loaded}/${Math.round(this.cap())}` : esc(t('pink.f.onRoad', 'Na estrada...'))}</span>`;
      b.setAttribute('aria-label', t('pink.f.dispatch', 'Despachar'));
    }
    const c = e.carry;
    const slot0 = c ? { icon: 'box', label: t('pink.hand', 'Mãos') } : this.basket.length ? { icon: 'bag', n: this.basket.length, label: t('pink.hand', 'Mãos') } : { icon: 'hand', label: t('pink.hand', 'Mãos') };
    this.hud.hot([slot0, { icon: 'mop', label: t('pink.mop', 'Esfregão') }], this.tool);
    this.hud.carrying(!!c);
    // medidores: limpeza / bilhetes / caminhão
    let dirt = 0;
    for (const d of e.dirt) dirt += d.a;
    this.hud.meters(Math.min(100, this.combo * 20), 100 - dirt * 8, (loaded / this.cap()) * 100);
  }

  /* ------------------------------ quadro ------------------------------ */
  private frame(dt: number): void {
    const e = this.e;
    const lock = !!this.hud.overlay;
    const d = e.dirtAt(e.fp.x, e.fp.z);
    const wet = d && (d.k === 'spill' || d.k === 'glass');
    e.movePlayer(dt, lock, wet ? 1 : 0);
    // chão sujo/molhado: escorrega e derruba (mais se estiver correndo)
    if (!lock && (e.carry || this.basket.length) && e.fp.speedK > 0.5) {
      const risk = (wet ? (e.running ? 1.4 : 0.35) : d ? (e.running ? 0.4 : 0.05) : e.running ? 0.04 : 0) * dt;
      if (Math.random() < risk) e.trip();
    }
    if (!lock) {
      this.aimUpdate();
      if (this.useHeld && this.aim?.kind === 'mop' && this.aim.d) {
        e.cleanAt(this.aim.d.x, this.aim.d.z, dt * 1.6);
        if (Math.random() < dt * 2.2) sfx.play('mop');
      }
    }
    e.phys.step(dt);
    this.truckUpdate(dt);
    // esteira: caixas andam até a doca e entram no caminhão
    const cv = this.conveyor;
    if (cv) {
      const x0 = TABLE.x + 1.4;
      const x1 = X1 - 0.5;
      for (let i = cv.items.length - 1; i >= 0; i--) {
        const it = cv.items[i];
        it.k += dt * 0.9;
        const x = x0 + it.k;
        it.m.position.set(Math.min(x, x1), CONV_Y + 0.2, -4);
        if (!it.m.parent) e.scene.add(it.m);
        if (x >= x1 && this.truck?.phase === 'dock') {
          // entra no caminhão
          const l = it.l!;
          l.body.position.set(BED.x0 + 0.5 + Math.random() * 3.5, BED.y + 0.6, -4 + (Math.random() - 0.5) * 1.2);
          l.body.velocity.set(1, 0, 0);
          e.phys.world.addBody(l.body);
          e.phys.items.push(l);
          cv.items.splice(i, 1);
          sfx.play('drop', { db: -6 });
        }
      }
    }
    // carregador automático: despacha cheio
    if (this.has('loader') && this.truck?.phase === 'dock' && e.phys.items.filter((l) => l.kind === 'parcel' && this.inTruck(l)).length >= this.cap()) this.dispatch();
    // robô separador: pega os itens do bilhete e deixa na mesa (vira cesta do jogador se ele estiver lá)
    for (const r of this.robots) {
      r.t += dt;
      const tk = this.cur;
      if (r.st === 'idle' && tk && r.t > 2) {
        const miss = tk.lines.find((l) => this.pack.items.filter((p) => p === l.p).length + this.basket.filter((p) => p === l.p).length + r.carry.filter((p) => p === l.p).length < l.n);
        const rack = miss ? this.racks.find((rk) => rk.p === miss.p) : null;
        if (rack) {
          const yaw = (rack.r * Math.PI) / 2;
          r.w.go(this.nav, rack.x + Math.sin(yaw) * 0.8, rack.z + Math.cos(yaw) * 0.8);
          r.st = 'go';
          (r as unknown as { want: Product }).want = rack.p;
        }
        r.t = 0;
      } else if (r.st === 'go' && r.w.arrived) {
        r.carry.push((r as unknown as { want: Product }).want);
        r.st = 'back';
        r.w.go(this.nav, TABLE.x - 0.4, TABLE.z + 1);
      } else if (r.st === 'back' && r.w.arrived) {
        // entrega na mesa: se não há caixa montada, monta
        if (this.pack.stage === 'none' && this.tickets.length) {
          this.pack.stage = 'folded';
          this.pack.ticket = this.tickets[0];
        }
        if (this.pack.ticket) {
          this.pack.items.push(...r.carry);
          this.pack.stage = 'filled';
          if (this.packComplete() && this.has('packer')) {
            this.pack.stage = 'taped';
            sfx.play('tape', { db: -6 });
            this.takeParcel(true);
          }
          this.refreshPackMesh();
        }
        r.carry = [];
        r.st = 'idle';
        r.t = 0;
      }
      r.w.update(dt, e.camera, []);
    }
    // novos bilhetes
    this.ticketT -= dt;
    if (this.ticketT <= 0) {
      this.ticketT = Math.max(10, 26 - this.s.lvl * 0.4);
      this.newTicket();
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        this.hud.combo(0);
      }
    }
    this.hudT += dt;
    if (this.hudT > 0.25) {
      this.hudT = 0;
      this.refreshHud();
    }
    this.saveT += dt;
    if (this.saveT > 30) {
      this.saveT = 0;
      this.save();
    }
  }

  toSave(): FactorySave {
    this.s.dirt = this.e.dirt.map((d) => ({ x: d.x, z: d.z, a: d.a, k: d.k }));
    return this.s;
  }
  save(): void {
    this.o.onSave(this.toSave());
  }
  back(): boolean {
    if (this.hud.overlay) {
      this.hud.closePanel();
      return true;
    }
    return false;
  }
  setPaused(p: boolean): void {
    this.e.paused = p;
    this.e.input.show(!p);
  }
  private debugApi(): Record<string, unknown> {
    return {
      f: this,
      s: this.s,
      tp: (x: number, z: number, yaw = 0, pitch = 0) => {
        this.e.fp.place(x, z, this.heightAt(x, z));
        this.e.fpc.yaw = yaw;
        this.e.fpc.pitch = pitch;
      },
      fillBasket: () => {
        const tk = this.cur;
        if (tk) for (const l of tk.lines) for (let i = 0; i < l.n; i++) this.basket.push(l.p);
        this.refreshBasket();
        this.showTickets(false);
      },
      pack: () => {
        this.tableAction();
        this.tableAction();
        this.tableAction();
      },
      parcelToTruck: (n = 3) => {
        for (let i = 0; i < n; i++) this.e.spawnBox(null, 0, BED.x0 + 0.6 + i * 0.55, BED.y + 0.5 + (i % 2) * 0.4, -4 + ((i % 3) - 1) * 0.5, { kind: 'parcel', data: { pay: 30 } });
      },
      dispatch: () => this.dispatch(),
      money: (n: number) => (this.s.money += n),
      level: (n: number) => (this.s.lvl = n),
      up: (u: FactoryUp) => {
        this.s.ups.push(u);
        if (u === 'conveyor') this.buildConveyor();
        if (u === 'picker') this.spawnRobot();
      },
      cam: (m: 'fp' | 'tp' | 'front') => this.e.camv.set(m),
      sim: (sec: number) => {
        for (let i = 0; i < sec * 30; i++) this.frame(1 / 30);
      },
    };
  }
  dispose(): void {
    this.destroyed = true;
    for (const r of this.robots) r.w.dispose();
    this.hud.dispose();
    this.field.dispose();
    this.e.dispose();
    void this.destroyed;
    music.play('pink');
  }
}
