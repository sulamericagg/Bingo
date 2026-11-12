/* ============================================================
 *  BLOOP PINK — modo "Minha Loja" (franquia).
 *  Loop: tablet (pedir, móveis, reforma, equipe, preços) → caminhão → caixas →
 *  carregar/abrir/repor → abrir a loja → clientes (olham, provam, compram, falam) →
 *  caixa (troco) → sujeira/esfregão → fim do dia (resumo, metas, nível).
 *  ?debug expõe window.__pink.
 * ============================================================ */
import * as THREE from 'three';
import type * as CANNON from 'cannon-es';
import { fmt, t } from '../../i18n';
import { sfx, music } from '../../audio';
import { npcSpec } from '../../3d/paper';
import type { FpBox } from '../../3d/fpkit';
import type { Tier } from '../../core/quality';
import { CAT, CATS, demand, money, PRODUCTS, PROD, seasonAt, unlocked, type CatId, type Product } from './catalog';
import { capOf, FIX_DOOR, FIX_WALLS, FIX_WINDOW, FLOORS, FURN, LIGHTS, PAINTS, SHAPE_DIM, SIGNS, SLOT_D, SLOT_W, slotCap, STAFF, STAFF_NAMES, TABLET_UP, xpNeed, type FurnDef, type FurnKind, type Goal, type StaffKind } from './data';
import { Engine } from './engine';
import { buildFurniture, type FurnModel } from './furniture';
import { Hud } from './hud';
import { ic } from './icons';
import { Nav, Walker } from './npc';
import type { Loose } from './phys';
import { ProductField, type PlacedItem } from './products';
import type { FurnSave, ShopSave } from './save';
import { floorBounds, LAY, Store3D } from './store3d';
import { BUILDING_LVL, BUILDING_PRICE, nextStage, pendingWall, rentOf, salesArea, stageOf, stagePrice } from './grow';
import { Tablet, type TabletHost, type TabletTab } from './tablet';
import { CheckoutUI } from './checkout';
import { Builder, rbox } from './shapes';
import { BRAND_NAME, brandCanvas } from './brand';
import { BoxViews, boxRow, chunks, Ghosts, r2, Remotes, type BoxRow, type GhostRow, type ShopNet } from './coop';
import type { NetEvent } from '../jangada/net';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const DAY_LEN = 300; // s de 8h às 20h
const OPEN_H = 8;
const CLOSE_H = 20;
const DIRT_K = ['dirt', 'spill', 'glass', 'mud'] as const;

interface SlotW {
  pos: THREE.Vector3;
  yaw: number;
  i: number;
}
interface Furn {
  sv: FurnSave;
  def: FurnDef;
  model: FurnModel;
  g: THREE.Group;
  box: FpBox;
  body: CANNON.Body | null;
  slots: SlotW[];
  queue: Cust[];
  staff: Staff | null;
  busy: number;
}
type CustSt = 'walkIn' | 'enter' | 'shop' | 'look' | 'tester' | 'testing' | 'toQueue' | 'queue' | 'paying' | 'leave' | 'gone';
interface Cust {
  id: number;
  w: Walker;
  st: CustSt;
  wants: Product[];
  basket: Product[];
  mood: number;
  patience: number;
  t: number;
  target: { f: Furn; si: number } | null;
  tester: Furn | null;
  ck: Furn | null;
  tried: boolean;
  said: Set<string>;
  pay: 'card' | 'cash';
  exitX: number;
}
interface Staff {
  i: number;
  k: StaffKind;
  name: string;
  w: Walker;
  st: string;
  t: number;
  box: Loose | null;
  task: { f: Furn; si: number } | null;
  ck: Furn | null;
}
interface Fly {
  p: Product;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  mesh: THREE.Object3D;
  done: () => void;
}

export interface ShopOpts {
  root: HTMLElement;
  tier: Tier;
  save: ShopSave;
  onPause(): void;
  onSave(s: ShopSave): void;
  onCoins(n: number): void;
  /** loja em grupo (coop.ts): anfitrião = dono do save; convidado = só a vista + pedidos ao anfitrião */
  net?: ShopNet | null;
}
export type RenovAct = 'walls' | 'window' | 'door' | 'paint' | 'floor' | 'sign' | 'light' | 'grow' | 'own';
type ActO = 'order' | 'renov' | 'hit' | 'hire' | 'fire' | 'lic' | 'tab' | 'price' | 'auto' | 'open' | 'place' | 'move' | 'mop';

export class Shop implements TabletHost {
  readonly e: Engine;
  readonly hud: Hud;
  readonly s: ShopSave;
  private store: Store3D;
  private field: ProductField;
  private nav: Nav;
  private furn: Furn[] = [];
  private custs: Cust[] = [];
  private staff: Staff[] = [];
  private flies: Fly[] = [];
  private tablet: Tablet | null = null;
  private ck: CheckoutUI | null = null;
  private ckCust: Cust | null = null;
  private build: { k: FurnKind; ghost: THREE.Group; r: number; move: Furn | null; ok: boolean; x: number; z: number; paid: number } | null = null;
  private fieldDirty = true;
  private navDirty = true;
  private wallBodies: CANNON.Body[] = [];
  /** hora do dia (h) */
  hour = OPEN_H;
  phase: 'prep' | 'open' | 'closing' | 'summary' = 'prep';
  private spawnT = 3;
  private nextCust = 1;
  private useHeld = false;
  private useRep = 0;
  private tool = 0; // 0 mãos/caixa · 1 esfregão
  private mopT = 0;
  private aimInfo: { kind: string; f?: Furn; si?: number; l?: Loose; d?: { x: number; z: number } } | null = null;
  private day = { rev: 0, cost: 0, cust: 0, happy: 0, sold: 0 };
  private combo = 0;
  private comboT = 0;
  private truck: { g: THREE.Group; t: number; boxes: [string, number][]; wrong: boolean; phase: number; dropped: number } | null = null;
  private pendingOrders: { boxes: [string, number][]; eta: number; wrong: boolean }[] = [];
  private saveT = 0;
  private scores = { beauty: 0, clean: 100, stock: 0 };
  private trashL: Loose[] = [];
  private dirtT = 0;
  private bin: THREE.Group;
  private binBody: CANNON.Body | null = null;
  /** lixeira de caixas: no estoque (com doca) ou no canto do fundo da garagem */
  readonly binPos = new THREE.Vector2(4.35, -15.3);
  private destroyed = false;
  /* grupo */
  private net: ShopNet | null;
  private remotes: Remotes | null = null;
  private ghosts: Ghosts | null = null;
  private boxViews: BoxViews | null = null;
  private netOffs: (() => void)[] = [];
  private netT = { p: 0, st: 0, sync: 0, bx: 0, dirt: 0 };
  private lastFu = '';
  private lastMt = '';
  private fuSeq = 0;
  private fuIn: { q: number; parts: FurnSave[][]; got: number } | null = null;
  private mopAcc: { x: number; z: number; a: number } | null = null;
  private lastCoins = 0;
  /** convidado na loja de outra pessoa */
  get guest(): boolean {
    return !!this.net && !this.net.host;
  }
  private wasNear = false;
  private fpsT = 0;
  private lastLock = false;

  constructor(private o: ShopOpts) {
    this.s = o.save;
    this.net = o.net ?? null;
    const e = new Engine(o.root, o.tier, 'pink');
    this.e = e;
    this.store = new Store3D(e.kit);
    e.scene.add(this.store.root);
    this.field = new ProductField(e.kit, o.tier >= 3);
    e.scene.add(this.field.group);
    this.nav = new Nav(-16, -17, 16, 4.2);
    // lixeira de caixas (no estoque, ou no fundo da garagem enquanto não tem estoque)
    this.bin = buildFurniture(e.kit, 'bin').group;
    e.scene.add(this.bin);
    this.store.onRebuilt = () => this.rebuildColliders();
    this.store.apply(this.s.renov);
    // móveis salvos
    for (const f of this.s.furn) this.addFurn(f, false);
    // caixas salvas e sacos de lixo
    for (const b of this.s.boxes) e.spawnBox(b.p, b.n, b.x, Math.max(0.2, b.y), b.z, { open: b.open });
    for (const tr of this.s.trash) this.trashL.push(e.spawnTrash(tr.x, tr.z));
    for (const d of this.s.dirt) e.addDirt(d.x, d.z, d.k, d.a);
    if (this.guest) {
      /* convidado: sujeira, equipe e caixas vêm do anfitrião */
    } else if (!this.s.dirt.length && !this.s.renov.walls && this.s.day === 1) {
      // loja abandonada: poeira e pegadas
      const fb = floorBounds(this.s.renov);
      for (let i = 0; i < 7; i++) e.addDirt(fb.x0 + 0.6 + Math.random() * (fb.x1 - fb.x0 - 1.2), -1.2 - Math.random() * (-fb.zB - 2), i % 3 ? 'dirt' : 'mud', 0.5 + Math.random() * 0.6);
    }
    if (!this.guest) for (const m of this.s.staff) this.spawnStaff(m.k, m.name, m.c);
    if (!this.s.goals.length && !this.guest) this.newGoals();
    // jogador: na calçada olhando a loja
    e.fp.place(0.4, 4.0);
    e.fpc.yaw = 0;
    e.fpc.pitch = 0.08;
    e.onTrip = (l, vx, vz) => this.spill(l, vx, vz);
    e.phys.onHit = (l, v) => this.onImpact(l, v);
    this.hud = new Hud(o.root, {
      pause: () => o.onPause(),
      tablet: () => this.openTablet(),
      toggleOpen: () => this.toggleOpen(),
      use: (d) => this.use(d),
      act2: () => this.act2(),
      run: (d) => {
        e.running = d ? !e.running : e.running;
        this.hud.run(e.running);
      },
      drop: () => this.drop(),
      rotate: () => this.rotateBuild(),
      cancel: () => this.cancelBuild(),
      slot: (i) => this.selTool(i),
      goals: () => {
        this.refreshGoals(true);
      },
    });
    e.camv.mountButton(this.hud.top, { label: t('pink.cam', 'Câmera') });
    this.hud.run(false);
    e.frame = (dt) => this.frame(dt);
    this.refreshGoals(true);
    this.updateHudStatic();
    if (this.net) this.netInit();
    e.start();
    if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__pink = this.debugApi();
  }

  /* =============================== mundo / colisão =============================== */
  private rebuildColliders(): void {
    const e = this.e;
    // lixeira acompanha o tamanho da loja
    const fb = floorBounds(this.s.renov);
    if (fb.stock) this.binPos.set(4.35, -15.3);
    else {
      // canto do fundo que não atrapalha a próxima parede a quebrar
      const pw = pendingWall(this.s.renov)?.wall ?? nextStage(this.s.renov)?.wall ?? null;
      const far = (x: number, z: number) => !pw || Math.hypot(x - Math.max(pw.x0, Math.min(pw.x1, x)), z - Math.max(Math.min(pw.z0, pw.z1), Math.min(Math.max(pw.z0, pw.z1), z))) > 1.2;
      const cand: [number, number][] = [
        [fb.x1 - 0.5, fb.zB + 0.5],
        [fb.x0 + 0.5, fb.zB + 0.5],
      ];
      const [bx, bz] = cand.find(([x, z]) => far(x, z)) ?? cand[0];
      this.binPos.set(bx, bz);
    }
    this.bin.position.set(this.binPos.x, 0, this.binPos.y);
    if (this.binBody) e.phys.removeStatic(this.binBody);
    this.binBody = e.phys.addStatic(this.binPos.x, 0.5, this.binPos.y, 0.35, 0.5, 0.35);
    // caixas/lixo que ficaram dentro da parede nova não existem (a parede só some)
    for (const b of this.wallBodies) e.phys.removeStatic(b);
    this.wallBodies = [];
    for (const [x, y, z, hx, hy, hz] of this.store.physBoxes) this.wallBodies.push(e.phys.addStatic(x, y, z, hx, hy, hz));
    this.navDirty = true;
  }
  private colliders(): FpBox[] {
    const out = [...this.store.colliders, ...this.store.outsideColliders];
    for (const f of this.furn) if (!f.def.flat) out.push(f.box);
    out.push({ x0: this.binPos.x - 0.4, z0: this.binPos.y - 0.4, x1: this.binPos.x + 0.4, z1: this.binPos.y + 0.4 });
    // porta de enrolar fechada
    if (!this.store.backOpen && floorBounds(this.s.renov).stock) out.push({ x0: -LAY.backDoor, z0: LAY.zBack - 0.15, x1: LAY.backDoor, z1: LAY.zBack + 0.05 });
    return out;
  }
  private refreshCollision(): void {
    const c = this.colliders();
    this.e.setColliders(c);
    this.nav.rebuild(c.filter((b) => b.x1 - b.x0 < 30), 0.26);
    this.navDirty = false;
  }

  /* =============================== móveis =============================== */
  private furnBox(k: FurnKind, x: number, z: number, r: number): FpBox {
    const d = FURN[k];
    const w = r % 2 ? d.d : d.w;
    const dd = r % 2 ? d.w : d.d;
    return { x0: x - w / 2, z0: z - dd / 2, x1: x + w / 2, z1: z + dd / 2 };
  }
  private addFurn(sv: FurnSave, fresh: boolean): Furn {
    const def = FURN[sv.k];
    const model = buildFurniture(this.e.kit, sv.k);
    const g = model.group;
    g.position.set(sv.x, 0, sv.z);
    g.rotation.y = (sv.r * Math.PI) / 2;
    this.e.scene.add(g);
    g.updateMatrixWorld(true);
    if (!sv.s || sv.s.length !== model.slots.length) sv.s = model.slots.map((_, i) => sv.s?.[i] ?? null);
    const yaw = (sv.r * Math.PI) / 2;
    const slots: SlotW[] = model.slots.map((sp, i) => {
      const p = new THREE.Vector3(sp.x, sp.y, sp.z).applyMatrix4(g.matrixWorld);
      let sy = yaw + (sp.face > 0 ? 0 : Math.PI);
      if (sv.k === 'tableRound') sy = yaw + Math.atan2(sp.x, sp.z);
      return { pos: p, yaw: sy, i };
    });
    const box = this.furnBox(sv.k, sv.x, sv.z, sv.r);
    const body = def.flat ? null : this.e.phys.addStatic(sv.x, def.h / 2, sv.z, (box.x1 - box.x0) / 2, def.h / 2, (box.z1 - box.z0) / 2);
    const f: Furn = { sv, def, model, g, box, body, slots, queue: [], staff: null, busy: 0 };
    this.furn.push(f);
    if (fresh) this.s.furn.push(sv);
    this.fieldDirty = true;
    this.navDirty = true;
    return f;
  }
  private removeFurn(f: Furn): void {
    f.g.removeFromParent();
    if (f.body) this.e.phys.removeStatic(f.body);
    this.furn.splice(this.furn.indexOf(f), 1);
    this.s.furn.splice(this.s.furn.indexOf(f.sv), 1);
    for (const c of f.queue) this.custLeave(c, false);
    this.fieldDirty = true;
    this.navDirty = true;
  }
  /** posições dos produtos nas vagas */
  private rebuildField(): void {
    const items: PlacedItem[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    for (const f of this.furn)
      f.slots.forEach((sl) => {
        const v = f.sv.s[sl.i];
        if (!v || v[1] <= 0) return;
        const p = PROD[v[0]];
        if (!p) return;
        const [w, hh, d] = SHAPE_DIM[p.shape];
        const c = slotCap(p.shape);
        const cs = Math.cos(sl.yaw);
        const sn = Math.sin(sl.yaw);
        q.setFromAxisAngle(up, sl.yaw);
        for (let i = 0; i < v[1]; i++) {
          const col = i % c.nx;
          const row = Math.floor(i / c.nx) % c.nz;
          const lay = Math.floor(i / (c.nx * c.nz));
          const lx = (col - (c.nx - 1) / 2) * (w + 0.012);
          const lz = SLOT_D / 2 - d / 2 - 0.02 - row * (d + 0.012);
          const wx = sl.pos.x + lx * cs + lz * sn;
          const wz = sl.pos.z - lx * sn + lz * cs;
          m.compose(new THREE.Vector3(wx, sl.pos.y + lay * hh, wz), q, one);
          items.push({ p, m: m.clone() });
        }
      });
    this.field.rebuild(items);
    this.fieldDirty = false;
  }
  furnCount(k: FurnKind): number {
    return this.furn.filter((f) => f.sv.k === k).length;
  }

  /* =============================== tablet (host) =============================== */
  price(p: Product): number {
    return Math.max(0.5, Math.round(p.mkt * (this.s.prices[p.id] ?? 1) * 10) / 10);
  }
  private pay(n: number): boolean {
    if (this.s.money < n) {
      sfx.play('wrong');
      this.hud.banner('coin', t('pink.noMoney', 'Dinheiro insuficiente!'), 1500);
      return false;
    }
    this.s.money -= n;
    this.day.cost += n;
    this.updateHudStatic();
    return true;
  }
  order(cart: Record<string, number>): boolean {
    if (this.guest) {
      const tot = Object.entries(cart).reduce((a, [id, n]) => a + (PROD[id] && n > 0 ? PROD[id].cost * PROD[id].box * n : 0), 0);
      return tot > 0 && this.ask('order', [cart], tot - Math.min(this.s.coupons, tot * 0.5), 'truck', t('pink.ordered', 'Pedido feito! O caminhão já vem.'));
    }
    let tot = 0;
    const boxes: [string, number][] = [];
    for (const [id, n] of Object.entries(cart)) {
      const p = PROD[id];
      if (!p || n <= 0) continue;
      tot += p.cost * p.box * n;
      for (let i = 0; i < n; i++) boxes.push([id, p.box]);
    }
    if (!boxes.length) return false;
    // cupom de desconto (veio errado antes)
    const disc = Math.min(this.s.coupons, tot * 0.5);
    if (!this.pay(tot - disc)) return false;
    this.s.coupons -= disc;
    const up = TABLET_UP[this.s.tab];
    const wrong = boxes.length >= 2 && Math.random() < up.bo * 0.6 && this.s.day > 1;
    this.pendingOrders.push({ boxes, eta: 6 + Math.random() * 5, wrong });
    sfx.play('cash');
    this.hud.banner('truck', t('pink.ordered', 'Pedido feito! O caminhão já vem.'), 2000);
    if (this.s.tut === 3) this.setTut(4);
    return true;
  }
  buyFurniture(k: FurnKind): void {
    const d = FURN[k];
    if (this.guest) {
      // convidado: paga quando o anfitrião colocar o móvel (o dinheiro é um só)
      if (!this.canPay(d.price)) return;
      this.closeTablet();
      this.startBuild(k, null, 0);
      return;
    }
    if (!this.pay(d.price)) return;
    this.closeTablet();
    this.startBuild(k, null, d.price);
  }
  renov(action: RenovAct, v?: string | number): boolean {
    if (this.guest) return this.ask('renov', [action, v ?? null], 0, 'paint', t('pink.net.sent', 'Feito! A loja é de todo mundo.'));
    const r = this.s.renov;
    let price = 0;
    const lv = this.s.lvl;
    switch (action) {
      case 'walls':
        price = FIX_WALLS;
        break;
      case 'window':
        price = FIX_WINDOW;
        break;
      case 'door':
        price = FIX_DOOR;
        break;
      case 'paint':
        if (!r.walls || r.paint === v) return false;
        price = 80;
        break;
      case 'floor': {
        const f = FLOORS.find((x) => x.id === v);
        if (!f || lv < f.lvl) return false;
        price = f.price;
        break;
      }
      case 'sign': {
        const f = SIGNS.find((x) => x.id === v);
        if (!f || lv < f.lvl) return false;
        price = f.price;
        break;
      }
      case 'light': {
        const f = LIGHTS[v as number];
        if (!f || lv < f.lvl) return false;
        price = f.price;
        break;
      }
      case 'grow': {
        // comprar a sala do lado: depois é quebrar a parede com a marreta
        const st = nextStage(r);
        if (!st || lv < st.lvl) return false;
        price = stagePrice(r, st);
        break;
      }
      case 'own':
        if (r.own || lv < BUILDING_LVL) return false;
        price = BUILDING_PRICE;
        break;
    }
    if (!this.pay(price)) return false;
    if (action === 'walls') r.walls = true;
    else if (action === 'window') r.window = true;
    else if (action === 'door') r.door = true;
    else if (action === 'paint') r.paint = v as string;
    else if (action === 'floor') r.floor = v as typeof r.floor;
    else if (action === 'sign') r.sign = v as typeof r.sign;
    else if (action === 'light') r.light = v as number;
    else if (action === 'grow') {
      r.sz++;
      r.hits = 0;
    } else if (action === 'own') r.own = true;
    this.store.apply(r);
    sfx.play('sparkle');
    this.hud.flash();
    this.addXp(Math.round(price / 25));
    if (action === 'grow') {
      this.closeTablet();
      this.tool = 2;
      this.syncTool();
      this.updateHudStatic();
      this.hud.banner('hammer', t('pink.grow.smash', 'Sala comprada! Pegue a marreta e quebre a parede!'), 3200);
    } else if (action === 'own') {
      this.closeTablet();
      sfx.play('levelup');
      confetti(this.hud.el);
      this.hud.banner('key', t('pink.grow.owned', 'O prédio é seu! Acabou o aluguel.'), 3600);
    }
    this.save();
    return true;
  }
  hire(k: StaffKind): boolean {
    const d = STAFF[k];
    if (this.guest) return this.ask('hire', [k], d.hire, d.icon, t('pink.net.sent', 'Feito! A loja é de todo mundo.'));
    if (!this.pay(d.hire)) return false;
    const used = new Set(this.s.staff.map((m) => m.name));
    const name = STAFF_NAMES.find((n) => !used.has(n)) ?? 'Bloop';
    const c = d.robot ? '#c0c8d8' : d.color;
    this.s.staff.push({ k, name, c });
    this.spawnStaff(k, name, c);
    sfx.play('ding');
    this.hud.banner(d.icon, t('pink.hired', '{n} chegou para trabalhar!', { n: name }), 2000);
    this.save();
    return true;
  }
  fire(i: number): void {
    const m = this.s.staff[i];
    if (!m) return;
    if (this.guest) {
      this.ask('fire', [i], 0);
      this.s.staff.splice(i, 1);
      return;
    }
    this.s.staff.splice(i, 1);
    const st = this.staff.find((x) => x.name === m.name && x.k === m.k);
    if (st) {
      if (st.box) this.staffDropBox(st);
      if (st.ck) st.ck.staff = null;
      st.w.dispose();
      this.staff.splice(this.staff.indexOf(st), 1);
    }
    this.save();
  }
  buyLicense(c: CatId): boolean {
    const cat = CAT[c];
    if (this.s.lic.includes(c) || this.s.lvl < cat.lvl) return false;
    if (this.guest) {
      if (!this.ask('lic', [c], cat.price, cat.icon, t('pink.license', 'Nova licença: {n}!', { n: cat.name }))) return false;
      this.s.lic.push(c);
      return true;
    }
    if (!this.pay(cat.price)) return false;
    this.s.lic.push(c);
    sfx.play('levelup');
    this.hud.banner(cat.icon, t('pink.license', 'Nova licença: {n}!', { n: cat.name }), 2400);
    this.save();
    return true;
  }
  upgradeTablet(): boolean {
    const nx = TABLET_UP[this.s.tab + 1];
    if (this.guest) {
      if (!nx || !this.ask('tab', [], nx.price, 'tablet')) return false;
      this.s.tab++;
      return true;
    }
    if (!nx || !this.pay(nx.price)) return false;
    this.s.tab++;
    sfx.play('sparkle');
    this.save();
    return true;
  }
  setPrice(id: string, mult: number): void {
    this.s.prices[id] = Math.round(mult * 100) / 100;
    if (this.guest) this.ask('price', [id, mult], 0);
  }
  setAuto(on: boolean): void {
    this.s.auto = on;
    if (this.guest) this.ask('auto', [on], 0);
  }
  stockOf(id: string): number {
    let n = 0;
    for (const f of this.furn) for (const v of f.sv.s) if (v && v[0] === id) n += v[1];
    for (const l of this.e.phys.items) if (l.kind === 'box' && l.data.p === id) n += (l.data.n as number) ?? 0;
    if (this.e.carry?.data.p === id) n += (this.e.carry.data.n as number) ?? 0;
    return n;
  }
  openTablet(tab?: TabletTab): void {
    if (this.tablet || this.build) return;
    this.ck?.cancel();
    sfx.play('click');
    this.tablet = new Tablet(this.o.root, this, tab ?? (this.s.tut <= 2 && !this.s.renov.walls ? 'renov' : this.s.tut === 2 ? 'furn' : 'shop'));
    if (this.s.tut === 1) this.setTut(2);
  }
  closeTablet(): void {
    this.tablet?.dispose();
    this.tablet = null;
  }
  close(): void {
    this.closeTablet();
  }
  get panelOpen(): boolean {
    return !!this.tablet || !!this.hud.overlay;
  }
  /** fecha painéis (botão voltar): true se fechou algo */
  back(): boolean {
    if (this.tablet) {
      this.closeTablet();
      return true;
    }
    if (this.ck) {
      this.ck.cancel();
      return true;
    }
    if (this.build) {
      this.cancelBuild();
      return true;
    }
    return false;
  }

  /* =============================== construção =============================== */
  private startBuild(k: FurnKind, move: Furn | null, paid: number): void {
    const ghost = buildFurniture(this.e.kit, k).group;
    ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = this.e.kit.plain('ghostOk', '#5ee08a', 0.5, 0, { transparent: true, opacity: 0.55, emissive: '#2a8a4a', ei: 0.4 });
    });
    this.e.scene.add(ghost);
    if (move) move.g.visible = false;
    this.build = { k, ghost, r: move?.sv.r ?? 0, move, ok: false, x: 0, z: 0, paid };
    this.hud.build(true);
    this.hud.banner(FURN[k].icon, t('pink.placeHint', 'Mire no chão e toque em COLOCAR'), 2200);
    if (move) {
      this.e.removeLoose; // nada
    }
  }
  private updateBuild(): void {
    const b = this.build!;
    const yaw = this.e.fpc.yaw;
    const hit = this.e.floorHit(6);
    let x: number;
    let z: number;
    if (hit) {
      x = hit.x;
      z = hit.z;
    } else {
      x = this.e.fp.x - Math.sin(yaw) * 2.2;
      z = this.e.fp.z - Math.cos(yaw) * 2.2;
    }
    const sn = 0.25;
    x = Math.round(x / sn) * sn;
    z = Math.round(z / sn) * sn;
    const box = this.furnBox(b.k, x, z, b.r);
    const fb = floorBounds(this.s.renov);
    let ok = box.x0 >= fb.x0 + 0.05 && box.x1 <= fb.x1 - 0.05 && box.z0 >= fb.zB + 0.05 && box.z1 <= -0.3;
    // não tapa a porta (portão inteiro na garagem) nem o vão do estoque
    const dw = fb.garage ? 2.4 : LAY.door + 0.4;
    if (ok && box.z1 > -1.6 && box.x1 > -dw && box.x0 < dw) ok = false;
    if (ok && fb.stock && box.z0 < fb.zB + 1.3 && box.x1 > LAY.part[0] - 0.2 && box.x0 < LAY.part[1] + 0.2) ok = false;
    // nem a parede que vai ser quebrada / a lixeira
    const bw = this.store.brk?.box;
    if (ok && bw && box.x0 < bw.max.x + 0.3 && box.x1 > bw.min.x - 0.3 && box.z0 < bw.max.z + 0.3 && box.z1 > bw.min.z - 0.3) ok = false;
    if (ok && box.x0 < this.binPos.x + 0.5 && box.x1 > this.binPos.x - 0.5 && box.z0 < this.binPos.y + 0.5 && box.z1 > this.binPos.y - 0.5) ok = false;
    if (ok && !FURN[b.k].flat)
      for (const f of this.furn) {
        if (f === b.move || f.def.flat) continue;
        const o = f.box;
        if (box.x0 < o.x1 - 0.02 && box.x1 > o.x0 + 0.02 && box.z0 < o.z1 - 0.02 && box.z1 > o.z0 + 0.02) {
          ok = false;
          break;
        }
      }
    // colunas das expansões
    if (ok) for (const c of this.store.colliders) if (c.x1 - c.x0 < 0.6 && c.z1 - c.z0 < 0.6 && box.x0 < c.x1 && box.x1 > c.x0 && box.z0 < c.z1 && box.z1 > c.z0) ok = false;
    // não em cima do jogador
    if (ok && !FURN[b.k].flat && this.e.fp.x > box.x0 - 0.3 && this.e.fp.x < box.x1 + 0.3 && this.e.fp.z > box.z0 - 0.3 && this.e.fp.z < box.z1 + 0.3) ok = false;
    b.ok = ok;
    b.x = x;
    b.z = z;
    b.ghost.position.set(x, 0, z);
    b.ghost.rotation.y = (b.r * Math.PI) / 2;
    const mat = ok ? this.e.kit.plain('ghostOk', '#5ee08a', 0.5, 0, { transparent: true, opacity: 0.55, emissive: '#2a8a4a', ei: 0.4 }) : this.e.kit.plain('ghostBad', '#ff5a6e', 0.5, 0, { transparent: true, opacity: 0.55, emissive: '#8a1a2a', ei: 0.4 });
    b.ghost.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = mat;
    });
    this.hud.use(ok ? 'check' : 'close', t('pink.place', 'Colocar'), ok);
    this.hud.hint(FURN[b.k].icon, FURN[b.k].name);
  }
  private placeBuild(): void {
    const b = this.build;
    if (!b || !b.ok) {
      sfx.play('wrong');
      return;
    }
    if (this.guest) {
      // o anfitrião coloca (e paga); a lista de móveis volta já com ele
      if (b.move) {
        this.ask('move', [b.move.sv.id, b.x, b.z, b.r], 0);
        b.move.g.visible = true;
      } else if (!this.ask('place', [b.k, b.x, b.z, b.r], FURN[b.k].price)) return;
      sfx.play('place');
      sfx.play('sparkle');
      this.endBuild();
      return;
    }
    if (b.move) {
      const f = b.move;
      const slots = f.sv.s;
      this.removeFurn(f);
      this.addFurn({ id: f.sv.id, k: f.sv.k, x: b.x, z: b.z, r: b.r, s: slots }, true);
    } else {
      this.addFurn({ id: this.s.nextId++, k: b.k, x: b.x, z: b.z, r: b.r, s: [] }, true);
      this.addXp(5);
    }
    sfx.play('place');
    sfx.play('sparkle');
    this.endBuild();
    if (this.s.tut === 2 && this.furn.some((f) => f.def.group === 'shelf') && this.furn.some((f) => f.def.group === 'checkout')) this.setTut(3);
    this.save();
  }
  private rotateBuild(): void {
    if (!this.build) return;
    this.build.r = (this.build.r + 1) % 4;
    sfx.play('tap');
  }
  private cancelBuild(): void {
    const b = this.build;
    if (!b) return;
    if (b.move) b.move.g.visible = true;
    else this.s.money += b.paid;
    this.endBuild();
    this.updateHudStatic();
  }
  private endBuild(): void {
    const b = this.build;
    if (!b) return;
    b.ghost.removeFromParent();
    b.ghost.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.build = null;
    this.hud.build(false);
  }

  /* =============================== ações do jogador =============================== */
  private selTool(i: number): void {
    if (i === this.tool) return;
    if (i === 2 && !pendingWall(this.s.renov)) return;
    if (i === 1 && this.e.carry) {
      this.hud.banner('drop', t('pink.handsFull', 'Solte o que está carregando primeiro'), 1500);
      return;
    }
    this.tool = i;
    sfx.play('tap');
    this.syncTool();
  }
  private hammer: THREE.Object3D | null = null;
  /** marreta na mão (1ª pessoa) quando a ferramenta 2 está escolhida */
  private syncTool(): void {
    if (this.tool === 2 && !pendingWall(this.s.renov)) this.tool = 0;
    if (this.tool === 2) {
      if (!this.hammer) {
        const k = this.e.kit;
        const b = new Builder();
        b.add(new THREE.CylinderGeometry(0.022, 0.026, 0.62, 10), k.surf('hammerWood', 'wood', { rough: 0.7, color: '#c8905a' }), 0, 0, 0);
        b.add(rbox(0.2, 0.09, 0.09, 0.015, 2), k.plain('hammerHead', '#5a6070', 0.35, 0.8, { envK: 1.2 }), 0, 0.3, 0);
        b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.14, 10), k.plain('hammerGrip', '#ff5fa2', 0.6), 0, -0.24, 0);
        const g = b.build();
        g.rotation.set(-0.5, 0, 0.35);
        const w = new THREE.Group();
        w.add(g);
        this.hammer = w;
      }
      this.e.setTool(this.hammer);
    } else this.e.setTool(null);
  }
  private smashCd = 0;
  /** uma marretada na parede: rachadura, lascas, poeira; na última a parede cai */
  private smash(): void {
    if (this.smashCd > 0) return;
    const r = this.s.renov;
    const P = pendingWall(r);
    const w = this.store.brk;
    if (!P || !w) return;
    this.smashCd = 0.5;
    this.e.swingTool();
    const hit = this.e.ray.intersectBox(w.box, new THREE.Vector3()) ?? w.box.getCenter(new THREE.Vector3());
    window.setTimeout(() => {
      if (this.destroyed) return;
      sfx.play('smash');
      this.e.fpc.addShake(0.35);
      this.e.fpc.kick(0.6);
      const back = this.e.ray.direction.clone().multiplyScalar(-0.15);
      this.e.chips(hit.x + back.x, hit.y, hit.z + back.z, '#d8cfc4', 5);
      this.e.chips(hit.x + back.x, hit.y, hit.z + back.z, '#b0644a', 3);
      this.puff(hit.x + back.x, hit.y, hit.z + back.z, '#e8e0d4', 6, 0.12);
      if (this.guest) {
        this.ask('hit', [], 0);
        return;
      }
      this.wallHit();
    }, 150);
  }
  /** anfitrião: conta a marretada (do dono ou de um amigo) */
  private wallHit(): void {
    const r = this.s.renov;
    const P = pendingWall(r);
    if (!P) return;
    r.hits++;
    if (r.hits < P.hits) {
      this.store.apply(r);
      if (r.hits === Math.ceil(P.hits / 2)) this.hud.banner('hammer', t('pink.grow.half', 'Tá quase! Continua!'), 1400);
      return;
    }
    // caiu!
    const w = this.store.brk!;
    const seg = w.seg;
    r.op++;
    r.hits = 0;
    this.store.apply(r);
    this.syncTool();
    sfx.play('crumble');
    sfx.play('sparkle');
    this.e.fpc.addShake(1.2);
    this.hud.flash();
    confetti(this.hud.el);
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const n = Math.min(9, 3 + Math.floor(len / 2));
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const x = seg.x0 + (seg.x1 - seg.x0) * k + (Math.random() - 0.5) * 0.6;
      const z = seg.z0 + (seg.z1 - seg.z0) * k + (Math.random() - 0.5) * 0.6;
      this.trashL.push(this.e.spawnRubble(x, z, new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2)));
      this.e.addDirt(x + (Math.random() - 0.5), z + (Math.random() - 0.5), 'dirt', 0.8);
      this.puff(x, 1 + Math.random() * 1.5, z, '#e8e0d4', 10, 0.3);
    }
    this.addXp(40 + r.op * 20);
    this.hud.banner('sparkle', t('pink.grow.done', 'A loja cresceu! Leve o entulho para a lixeira.'), 3600);
    this.save();
  }
  /** poeira (bolinhas que crescem e somem) */
  private dustTex: THREE.Texture | null = null;
  puff(x: number, y: number, z: number, color: string, n: number, sz: number): void {
    if (!this.dustTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,.9)');
      gr.addColorStop(0.5, 'rgba(255,255,255,.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      this.dustTex = new THREE.CanvasTexture(c);
    }
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.dustTex, color, transparent: true, depthWrite: false, opacity: 0.55 });
      const m = new THREE.Sprite(mat);
      const s0 = sz * (1.2 + Math.random() * 1.2);
      m.scale.setScalar(s0);
      m.position.set(x + (Math.random() - 0.5) * sz, y + (Math.random() - 0.5) * sz, z + (Math.random() - 0.5) * sz);
      this.e.scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 0.5 - 0.1, (Math.random() - 0.5) * 1.2);
      const life0 = 1.2 + Math.random() * 0.8;
      let life = life0;
      this.fx.push((dt) => {
        life -= dt;
        m.position.addScaledVector(v, dt);
        v.multiplyScalar(1 - dt * 1.5);
        m.scale.setScalar(s0 * (1 + (1 - life / life0) * 1.6));
        mat.opacity = 0.55 * Math.min(1, life / life0 * 1.5);
        if (life <= 0) {
          m.removeFromParent();
          mat.dispose();
          return false;
        }
        return true;
      });
    }
  }
  private use(down: boolean): void {
    this.useHeld = down;
    if (!down) return;
    this.useRep = 0.3;
    this.doUse(true);
  }
  private doUse(first: boolean): void {
    if (this.build) {
      if (first) this.placeBuild();
      return;
    }
    const a = this.aimInfo;
    const e = this.e;
    const c = e.carry;
    if (!a) {
      if (first && c && (c.kind === 'box' || c.kind === 'parcel') && !c.data.open && (c.data.n as number) > 0) this.openBox(c);
      return;
    }
    switch (a.kind) {
      case 'pick':
        if (first && a.l) {
          e.pickUp(a.l);
          if (a.l.kind === 'trash') this.trashL.splice(this.trashL.indexOf(a.l), 1);
        }
        break;
      case 'open':
        if (first && c) this.openBox(c);
        break;
      case 'stock':
        if (a.f && a.si !== undefined) this.stockOne(a.f, a.si);
        break;
      case 'bin':
        if (first && c) this.toBin();
        break;
      case 'refill':
        if (a.l && c) this.refillFromLoose(a.l);
        break;
      case 'serve':
        if (first && a.f) this.serve(a.f);
        break;
      case 'mop':
        break;
      case 'tester':
        if (first && a.f) this.playerTest(a.f);
        break;
      case 'smash':
        this.smash();
        break;
      case 'sign':
        if (first) this.toggleOpen();
        break;
    }
  }
  private act2(): void {
    const a = this.aimInfo;
    if (a?.kind === 'move-ok' && a.f) {
      // mover móvel (mãos vazias)
      this.startBuild(a.f.sv.k, a.f, 0);
      return;
    }
    if (a?.kind === 'take' && a.f && a.si !== undefined) this.takeOne(a.f, a.si);
  }
  private drop(): void {
    const c = this.e.carry;
    if (!c) return;
    this.e.dropCarry();
    if (c.kind === 'trash') this.trashL.push(c);
  }
  private openBox(l: Loose): void {
    l.data.open = true;
    this.e.refreshBox(l);
    sfx.play('boxOpen');
  }
  private stockOne(f: Furn, si: number): void {
    const e = this.e;
    const c = e.carry;
    if (!c || !c.data.open) return;
    const pid = c.data.p as string;
    const p = PROD[pid];
    const n = (c.data.n as number) ?? 0;
    if (!p || n <= 0) return;
    const v = f.sv.s[si];
    if (v && v[0] !== pid && v[1] > 0) {
      sfx.play('wrong');
      return;
    }
    const cap = capOf(p.shape);
    const have = v && v[0] === pid ? v[1] : 0;
    // produto voando + contagem (a vaga reserva já)
    const pending = this.flies.filter((x) => x.p === p).length;
    if (have + pending >= cap) {
      sfx.play('wrong');
      return;
    }
    c.data.n = n - 1;
    const sl = f.slots[si];
    const mesh = productMeshCached(this, p);
    const from = new THREE.Vector3();
    e.camera.getWorldPosition(from);
    from.y -= 0.35;
    from.x += -Math.sin(e.fpc.yaw) * 0.5;
    from.z += -Math.cos(e.fpc.yaw) * 0.5;
    e.scene.add(mesh);
    this.flies.push({
      p,
      from,
      to: sl.pos.clone(),
      t: 0,
      mesh,
      done: () => {
        const vv = f.sv.s[si];
        if (vv && vv[0] === pid) vv[1]++;
        else f.sv.s[si] = [pid, 1];
        this.fieldDirty = true;
        sfx.play('place', { rate: 1 + Math.min(0.5, (f.sv.s[si]?.[1] ?? 0) * 0.03) });
      },
    });
    if (c.kind === 'item') {
      e.consumeCarry();
    } else if ((c.data.n as number) % 3 === 0 || (c.data.n as number) === 0) e.refreshBox(c);
    if (this.s.tut === 4) this.setTut(5);
  }
  private takeOne(f: Furn, si: number): void {
    const c = this.e.carry;
    const v = f.sv.s[si];
    if (!c || !v || v[1] <= 0 || !c.data.open) return;
    if (c.data.p && c.data.p !== v[0] && (c.data.n as number) > 0) return;
    c.data.p = v[0];
    c.data.n = ((c.data.n as number) ?? 0) + 1;
    v[1]--;
    if (v[1] <= 0) f.sv.s[si] = null;
    this.fieldDirty = true;
    this.e.refreshBox(c);
    sfx.play('pick');
  }
  private refillFromLoose(l: Loose): void {
    const c = this.e.carry!;
    if (l.kind !== 'item') return;
    c.data.p ??= l.data.p;
    c.data.n = ((c.data.n as number) ?? 0) + 1;
    this.e.removeLoose(l);
    this.e.refreshBox(c);
    sfx.play('pick');
  }
  private toBin(): void {
    const c = this.e.carry;
    if (!c) return;
    const wasTrash = c.kind === 'trash';
    const leftover = (c.data.n as number) ?? 0;
    this.e.consumeCarry();
    sfx.play('drop');
    if (wasTrash) {
      sfx.play('sparkle');
      this.addXp(4);
      this.hud.banner('sparkle', t('pink.trashGone', 'Lixo fora! A loja ficou mais bonita.'), 1600);
    } else if (leftover > 0) this.hud.banner('box', t('pink.wasted', 'Opa! {n} produtos foram para o lixo.', { n: leftover }), 1800);
    this.save();
  }
  private playerTest(f: Furn): void {
    sfx.play('spray');
    this.sprayFx(f);
    this.hud.bubble('me', 'sparkle', t('pink.smell', 'Hmm, que cheirinho!'), 'good', 1600);
  }
  private sprayFx(f: Furn): void {
    const pos = new THREE.Vector3(0, 1.15, 0).applyMatrix4(f.g.matrixWorld);
    const mat = this.e.kit.plain('mist', '#ffd3e6', 1, 0, { transparent: true, opacity: 0.5, emissive: '#ffb3d1', ei: 0.6 });
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.03 + Math.random() * 0.03, 6, 5), mat);
      m.position.copy(pos);
      this.e.scene.add(m);
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6);
      let life = 1.2;
      const tick = (dt: number) => {
        life -= dt;
        m.position.addScaledVector(v, dt);
        m.scale.multiplyScalar(1 + dt * 1.5);
        if (life <= 0) {
          m.removeFromParent();
          m.geometry.dispose();
          return false;
        }
        return true;
      };
      this.fx.push(tick);
    }
  }
  private fx: ((dt: number) => boolean)[] = [];

  /* =============================== tropeço / vidro =============================== */
  private spill(l: Loose, vx: number, vz: number): void {
    // caixa aberta: produtos voam para fora
    const n = (l.data.n as number) ?? 0;
    const pid = l.data.p as string | null;
    if (!pid || n <= 0) return;
    const out = Math.min(n, l.data.open ? 8 : 3);
    if (!l.data.open) {
      l.data.open = true;
      this.e.refreshBox(l);
    }
    l.data.n = n - out;
    this.e.refreshBox(l);
    const p = l.body.position;
    for (let i = 0; i < out; i++) {
      const v = new THREE.Vector3(vx * (0.6 + Math.random() * 0.6) + (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, vz * (0.6 + Math.random() * 0.6) + (Math.random() - 0.5) * 2);
      this.e.spawnItem(pid, p.x + (Math.random() - 0.5) * 0.3, p.y + 0.25, p.z + (Math.random() - 0.5) * 0.3, v);
    }
    this.hud.banner('dirty', t('pink.oops', 'Opa! Tropeçou!'), 1400);
  }
  private onImpact(l: Loose, v: number): void {
    if (l.kind !== 'item') return;
    const p = PROD[l.data.p as string];
    if (!p) return;
    if (p.glass && v > 2.4) {
      // quebrou!
      const pos = l.body.position;
      const x = pos.x;
      const z = pos.z;
      this.e.removeLoose(l);
      sfx.play('glassBreak');
      this.e.shards(x, z, '#e8f6ff');
      this.e.addDirt(x, z, 'glass', 1);
      this.e.addDirt(x + 0.1, z + 0.1, 'spill', 1);
      this.e.fpc.addShake(0.2);
      this.day.cost += p.cost;
      const sc = this.e.toScreen(x, 0.3, z);
      if (sc) this.hud.float(sc[0], sc[1], `−${esc(money(p.cost))}`, '#ff5a6e');
    } else if (v > 1.5) sfx.play('drop', { db: -6, rate: 1.5 });
  }

  /* =============================== mira / dica =============================== */
  private aimUpdate(): void {
    const e = this.e;
    const ray = e.ray;
    const c = e.carry;
    let info: Shop['aimInfo'] = null;
    let hint = '';
    let hicon = '';
    let use: [string, string, boolean] = ['hand', '', false];
    let act2: [string | null, string] = [null, ''];
    const R = 2.6;
    // 0) marreta: parede rachada
    if (this.tool === 2 && !c) {
      const w = this.store.brk;
      const P = pendingWall(this.s.renov);
      const hp = w ? ray.intersectBox(w.box, new THREE.Vector3()) : null;
      if (w && P && hp && hp.distanceTo(ray.origin) < 2.8) {
        info = { kind: 'smash' };
        hint = `${P.name} ${this.s.renov.hits}/${P.hits}`;
        hicon = 'hammer';
        use = ['hammer', t('pink.u.smash', 'Quebrar'), true];
      } else {
        hint = t('pink.h.smashAim', 'Mire na parede rachada');
        hicon = 'hammer';
        use = ['hammer', t('pink.u.smash', 'Quebrar'), false];
      }
    } else if (this.tool === 1 && !c) {
      const h = e.floorHit(3);
      const d = h ? e.dirtAt(h.x, h.z) ?? this.nearDirt(h.x, h.z) : null;
      if (h && d) {
        info = { kind: 'mop', d: { x: h.x, z: h.z } };
        hint = t('pink.h.clean', 'Segure para limpar');
        hicon = 'mop';
        use = ['mop', t('pink.u.clean', 'Limpar'), true];
      } else use = ['mop', t('pink.u.clean', 'Limpar'), false];
    } else {
      // 2) vaga de produto (repor / tirar)
      let best: { f: Furn; si: number; d: number } | null = null;
      if (c && c.data.open) {
        const _v = new THREE.Vector3();
        for (const f of this.furn) {
          if (!f.slots.length) continue;
          if (_v.copy(f.g.position).sub(ray.origin).lengthSq() > 16) continue;
          for (const sl of f.slots) {
            _v.copy(sl.pos).setY(sl.pos.y + 0.08).sub(ray.origin);
            const along = _v.dot(ray.direction);
            if (along < 0.2 || along > R) continue;
            const perp2 = _v.lengthSq() - along * along;
            if (perp2 < 0.2 * 0.2 && (!best || along < best.d)) best = { f, si: sl.i, d: along };
          }
        }
      }
      // 3) objeto solto
      const l = e.phys.pick(ray, R, (x) => x.kind !== 'shard');
      const lDist = l ? l.mesh.position.distanceTo(ray.origin) : 99;
      if (best && (!l || best.d < lDist)) {
        const v = best.f.sv.s[best.si];
        const pid = c!.data.p as string;
        const p = PROD[pid];
        const n = (c!.data.n as number) ?? 0;
        if (p) {
          const cap = capOf(p.shape);
          if (v && v[0] !== pid && v[1] > 0) {
            hint = t('pink.h.other', 'Aqui já tem outro produto');
            hicon = 'close';
            use = ['boxOpen', t('pink.u.stock', 'Repor'), false];
          } else if (n <= 0) {
            hint = t('pink.h.empty', 'Caixa vazia! Jogue no lixo dos fundos');
            hicon = 'bin';
            use = ['boxOpen', t('pink.u.stock', 'Repor'), false];
          } else {
            const have = v ? v[1] : 0;
            info = { kind: 'stock', f: best.f, si: best.si };
            hint = `${p.name} ${have}/${cap}`;
            hicon = 'shelf';
            use = ['boxOpen', t('pink.u.stock', 'Repor'), have < cap];
          }
          if (v && v[0] === pid && v[1] > 0) {
            if (!info) info = { kind: 'take', f: best.f, si: best.si };
            act2 = ['up', t('pink.u.take', 'Tirar')];
          }
        } else if (v && v[1] > 0 && n === 0) {
          // caixa vazia e aberta: pode tirar produtos de uma vaga
          info = { kind: 'take', f: best.f, si: best.si };
          hint = PROD[v[0]]?.name ?? '';
          hicon = 'shelf';
          act2 = ['up', t('pink.u.take', 'Tirar')];
        }
      } else if (l && !c) {
        info = { kind: 'pick', l };
        const lp = l.data.p ? PROD[l.data.p as string] : null;
        hint = l.kind === 'trash' ? t('pink.h.trash', 'Saco de lixo') : lp ? `${lp.name}${l.kind === 'box' ? ` · ${l.data.n}` : ''}` : t('pink.h.box', 'Caixa');
        hicon = l.kind === 'trash' ? 'trash' : l.kind === 'item' ? 'hand' : 'box';
        use = ['hand', t('pink.u.pick', 'Pegar'), true];
      } else if (l && c && c.data.open && l.kind === 'item' && (!c.data.p || c.data.p === l.data.p) && c.kind === 'box') {
        info = { kind: 'refill', l };
        hint = PROD[l.data.p as string]?.name ?? '';
        hicon = 'boxOpen';
        use = ['boxOpen', t('pink.u.putBack', 'Guardar'), true];
      }
      // 4) lixeira
      if (!info && c && Math.hypot(e.fp.x - this.binPos.x, e.fp.z - this.binPos.y) < 1.8) {
        info = { kind: 'bin' };
        hint = t('pink.h.bin', 'Lixeira de caixas');
        hicon = 'bin';
        use = ['bin', t('pink.u.bin', 'Jogar fora'), true];
      }
      // 4b) plaquinha da porta: virar = abrir/fechar a loja
      if (!info && !c) {
        const sp = this.store.doorSignPos;
        const v = sp.clone().sub(ray.origin);
        const along = v.dot(ray.direction);
        if (along > 0.2 && along < 2.6 && v.lengthSq() - along * along < 0.3 * 0.3) {
          info = { kind: 'sign' };
          const open = this.phase === 'open';
          hint = open ? t('pink.h.signClose', 'Virar para FECHADO') : t('pink.h.signOpen', 'Virar para ABERTO');
          hicon = open ? 'closed' : 'open';
          use = [open ? 'closed' : 'open', t('pink.u.flip', 'Virar'), this.phase === 'prep' || this.phase === 'open'];
        }
      }
      // 5) caixa (atender) / provador / mover móvel
      if (!info) {
        const fb = this.aimFurn(R);
        if (fb) {
          const g = fb.def.group;
          if (g === 'checkout' && fb.sv.k !== 'selfcheck' && !c) {
            const head = fb.queue[0];
            const waiting = head && head.st === 'queue' && head.w.arrived;
            if (fb.staff) {
              hint = t('pink.h.staffed', '{n} está no caixa', { n: fb.staff.name });
              hicon = 'register';
            } else if (waiting) {
              info = { kind: 'serve', f: fb };
              hint = t('pink.h.serve', 'Cliente esperando!');
              hicon = 'register';
              use = ['register', t('pink.u.serve', 'Atender'), true];
            } else {
              hint = t('pink.h.noCust', 'Nenhum cliente na fila');
              hicon = 'register';
            }
          } else if (g === 'tester' && !c) {
            info = { kind: 'tester', f: fb };
            hint = fb.def.name;
            hicon = fb.def.icon;
            use = ['sparkle', t('pink.u.try', 'Provar'), true];
          } else if (!c) {
            hint = fb.def.name;
            hicon = fb.def.icon;
          }
          if (!c && this.phase !== 'open') {
            info ??= { kind: 'move-ok', f: fb };
            if (info.kind !== 'move-ok') this.moveTarget = fb;
            act2 = ['sofa', t('pink.u.move', 'Mover')];
          }
        }
      }
      if (!info && c) {
        if ((c.kind === 'box' || c.kind === 'parcel') && !c.data.open && (c.data.n as number) > 0) {
          info = { kind: 'open' };
          use = ['boxOpen', t('pink.u.open', 'Abrir'), true];
          hint = PROD[c.data.p as string]?.name ?? '';
          hicon = 'box';
        } else if (c.kind === 'trash') {
          hint = t('pink.h.toBin', 'Leve para a lixeira dos fundos');
          hicon = 'bin';
          use = ['bin', t('pink.u.bin', 'Jogar fora'), false];
        } else if (c.data.open) {
          const p = PROD[c.data.p as string];
          hint = p ? t('pink.h.aimShelf', 'Mire numa prateleira para repor') : t('pink.h.empty', 'Caixa vazia! Jogue no lixo dos fundos');
          hicon = p ? 'shelf' : 'bin';
          use = ['boxOpen', t('pink.u.stock', 'Repor'), false];
        }
      }
    }
    this.aimInfo = info;
    if (info?.kind === 'move-ok') this.moveTarget = info.f ?? null;
    if (act2[0] === 'sofa' && info?.kind !== 'move-ok') {
      // mover com outra ação no botão grande
      const mt = this.moveTarget;
      if (mt) this.aimInfo = info;
    }
    this.hud.hint(hicon, hint);
    this.hud.use(use[0], use[1], use[2]);
    this.hud.act2(act2[0], act2[1]);
  }
  private moveTarget: Furn | null = null;
  private nearDirt(x: number, z: number): { x: number; z: number } | null {
    for (const d of this.e.dirt) if (Math.hypot(d.x - x, d.z - z) < d.r * 0.8 + 0.3) return d;
    return null;
  }
  private aimFurn(R: number): Furn | null {
    const b3 = new THREE.Box3();
    const hit = new THREE.Vector3();
    let best: Furn | null = null;
    let bd = R;
    for (const f of this.furn) {
      if (!f.g.visible) continue;
      b3.min.set(f.box.x0, 0, f.box.z0);
      b3.max.set(f.box.x1, Math.max(0.3, f.def.h), f.box.z1);
      const r = this.e.ray.intersectBox(b3, hit);
      if (!r) continue;
      const d = hit.distanceTo(this.e.ray.origin);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  /* =============================== loja aberta / dia =============================== */
  private toggleOpen(): void {
    if (this.phase === 'summary') return;
    if (this.guest) {
      if (this.phase === 'prep' && !this.furn.some((f) => f.def.group === 'checkout')) {
        sfx.play('wrong');
        this.hud.banner('register', t('pink.needCheckout', 'Compre um caixa antes de abrir!'), 2000);
        return;
      }
      this.ask('open', [], 0);
      sfx.play('door');
      return;
    }
    if (this.phase === 'prep') {
      if (!this.furn.some((f) => f.def.group === 'checkout')) {
        sfx.play('wrong');
        this.hud.banner('register', t('pink.needCheckout', 'Compre um caixa antes de abrir!'), 2000);
        return;
      }
      this.phase = 'open';
      sfx.play('door');
      music.setState('calm');
      this.hud.banner('open', t('pink.opened', 'Loja aberta!'), 1600);
      this.spawnT = 2;
      if (this.s.tut === 5) this.setTut(6);
    } else if (this.phase === 'open') {
      this.phase = 'closing';
      this.hud.banner('closed', t('pink.closing', 'Fechando... atenda quem ficou.'), 1800);
    }
    this.updateHudStatic();
  }
  private skyAt(h: number): void {
    const e = this.e;
    const k = (h - 6) / 14; // 0 manhã .. 1 noite
    const sky = new THREE.Color();
    const sunC = new THREE.Color();
    if (k < 0.75) {
      sky.setHSL(0.57, 0.65, 0.78 - Math.abs(k - 0.4) * 0.15);
      sunC.set('#fff3e0');
    } else {
      const s = Math.min(1, (k - 0.75) / 0.25);
      sky.set('#bfe3ff').lerp(new THREE.Color('#ff9a7a'), Math.min(1, s * 1.6)).lerp(new THREE.Color('#2a2a5a'), Math.max(0, s - 0.45) * 1.8);
      sunC.set('#ffd0a0').lerp(new THREE.Color('#ff8a5a'), s);
    }
    (e.scene.background as THREE.Color).copy(sky);
    (e.scene.fog as THREE.Fog).color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.15);
    const a = Math.PI * (0.15 + k * 0.7);
    e.sun.position.set(Math.cos(a) * -14, Math.max(2, Math.sin(a) * 16), 10);
    e.sun.color.copy(sunC);
    const lv = this.s.renov.light;
    const night = Math.max(0, k - 0.8) * 5;
    e.sun.intensity = 1.6 * (1 - night * 0.7);
    e.hemi.intensity = (0.32 + lv * 0.06) * (1 - night * 0.3);
    e.amb.intensity = 0.04 + lv * 0.03;
    e.r.toneMappingExposure = 0.9 + lv * 0.03;
  }
  private dayTick(dt: number): void {
    if (this.phase === 'open') {
      this.hour += (dt / DAY_LEN) * (CLOSE_H - OPEN_H);
      if (this.hour >= CLOSE_H) {
        this.hour = CLOSE_H;
        this.phase = 'closing';
        this.hud.banner('moon', t('pink.lateClose', 'Hora de fechar!'), 1800);
        this.updateHudStatic();
      }
      // clientes
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const beauty = this.scores.beauty;
        const base = 16 - this.s.rep * 0.06 - beauty * 0.05 - Math.min(20, this.s.lvl) * 0.2;
        const s = seasonAt(this.s.day);
        this.spawnT = Math.max(3.2, base) * (s?.all ? 0.6 : s ? 0.8 : 1) * (0.7 + Math.random() * 0.6);
        const maxC = Math.min(4 + Math.min(10, Math.floor(this.s.lvl / 2)), 2 + Math.floor(salesArea(this.s.renov) / 9));
        if (this.custs.length < maxC) this.spawnCust();
      }
    } else if (this.phase === 'closing') {
      if (!this.custs.length) this.endDay();
    }
    if (this.phase === 'prep') this.hour = OPEN_H;
  }
  private endDay(): void {
    this.phase = 'summary';
    const s = this.s;
    const wages = s.staff.reduce((a, m) => a + STAFF[m.k].wage, 0);
    const rent = rentOf(s.renov, s.lvl);
    s.money -= wages + rent;
    this.day.cost += wages + rent;
    const prof = this.day.rev - this.day.cost;
    s.hist.push({ d: s.day, rev: Math.round(this.day.rev), prof: Math.round(prof), cust: this.day.cust, happy: this.day.happy });
    if (s.hist.length > 60) s.hist.shift();
    // moedas do app: 1 a cada B$ 40 vendidos (mín. 5)
    const coins = Math.max(5, Math.round(this.day.rev / 40));
    this.lastCoins = coins;
    this.o.onCoins(coins);
    music.setState('victory', { bars: 4 });
    sfx.play('levelup');
    const goals = s.goals;
    const g = goals.map((x) => `<div class="pk-stat">${ic(x.done ? 'check' : 'goal', 26)}<span>${esc(this.goalText(x))}</span></div>`).join('');
    const d = this.hud.panel(`<h2>${ic('moon', 30)}${esc(t('pink.dayEnd', 'Fim do dia {n}', { n: s.day }))}</h2>
      <div class="pk-stats">
        <div class="pk-stat">${ic('cash', 30)}<span>${esc(t('pink.sum.rev', 'Vendas'))}<b>${esc(money(this.day.rev))}</b></span></div>
        <div class="pk-stat">${ic('people', 30)}<span>${esc(t('pink.sum.cust', 'Clientes'))}<b>${this.day.cust} · ${ic('smile', 16)}${this.day.happy}</b></span></div>
        <div class="pk-stat">${ic('house', 30)}<span>${esc(t('pink.sum.rent', 'Aluguel + equipe'))}<b>−${esc(money(wages + rent))}</b></span></div>
        <div class="pk-stat">${ic(prof >= 0 ? 'up' : 'sad', 30)}<span>${esc(t('pink.sum.profit', 'Lucro'))}<b style="color:${prof >= 0 ? '#2fa35a' : '#e8336f'}">${esc(money(prof))}</b></span></div>
        <div class="pk-stat">${ic('coin', 30)}<span>${esc(t('pink.sum.coins', 'Moedas Bloop'))}<b>+${coins}</b></span></div>
        <div class="pk-stat">${ic('heart', 30)}<span>${esc(t('pink.t.rep', 'Reputação'))}<b>${Math.round(s.rep)}%</b></span></div>
      </div><div class="pk-sec">${ic('goal', 22)}${esc(t('pink.goals', 'Metas'))}</div><div class="pk-stats">${g}</div>
      <div class="pk-row"><button class="pk-b g" data-a="next">${ic('sun', 26)}${esc(t('pink.nextDay', 'Próximo dia'))}</button></div>`);
    d.querySelector('[data-a=next]')!.addEventListener('click', () => this.nextDay());
  }
  private nextDay(): void {
    const s = this.s;
    this.hud.closePanel();
    this.hud.fade(true);
    window.setTimeout(() => {
      if (this.destroyed) return;
      s.day++;
      this.day = { rev: 0, cost: 0, cust: 0, happy: 0, sold: 0 };
      this.phase = 'prep';
      this.hour = OPEN_H;
      this.combo = 0;
      this.hud.combo(0);
      this.newGoals();
      // pedido automático: repõe o que vendeu e acabou
      if (s.auto && s.lvl >= 22) {
        const cart: Record<string, number> = {};
        for (const f of this.furn) for (const v of f.sv.s) if (v && v[1] <= 2 && PROD[v[0]]) cart[v[0]] = 1;
        if (Object.keys(cart).length) this.order(cart);
      }
      // sujeira de um dia para o outro (pó)
      if (Math.random() < 0.5) this.e.addDirt(-2 + Math.random() * 4, -0.8, 'mud', 0.4);
      const ss = seasonAt(s.day);
      this.hud.banner(ss ? 'sparkle' : 'sun', ss ? ss.name : t('pink.dayN', 'Dia {n}', { n: s.day }), 2200);
      this.save();
      this.hud.fade(false);
      this.updateHudStatic();
      this.refreshGoals(true);
    }, 650);
  }

  /* =============================== metas =============================== */
  private newGoals(): void {
    const s = this.s;
    const lv = s.lvl;
    const R = () => Math.random();
    const cats = CATS.filter((c) => lv >= c.lvl && (c.price === 0 || s.lic.includes(c.id)));
    const pool: Goal[] = [
      { k: 'serve', n: 4 + Math.floor(lv * 0.8 + R() * 3), have: 0, xp: 30 + lv * 5, cash: 60 + lv * 10 },
      { k: 'earn', n: Math.round((150 + lv * 60) / 10) * 10, have: 0, xp: 40 + lv * 6, cash: 80 + lv * 12 },
      { k: 'clean', n: 80, have: 0, xp: 25 + lv * 4, cash: 50 + lv * 8 },
      { k: 'combo', n: 3 + Math.min(6, Math.floor(lv / 4)), have: 0, xp: 35 + lv * 5, cash: 70 + lv * 10 },
    ];
    if (cats.length) {
      const c = cats[Math.floor(R() * cats.length)];
      pool.push({ k: 'cat', n: 3 + Math.floor(lv * 0.4), have: 0, cat: c.id, xp: 30 + lv * 5, cash: 60 + lv * 10 });
    }
    if (this.furn.some((f) => f.def.group === 'tester')) pool.push({ k: 'tester', n: 3 + Math.floor(lv / 5), have: 0, xp: 30 + lv * 4, cash: 50 + lv * 8 });
    pool.sort(() => R() - 0.5);
    s.goals = pool.slice(0, 3);
  }
  private goalText(g: Goal): string {
    switch (g.k) {
      case 'serve':
        return t('pink.g.serve', 'Atender {n} clientes', { n: g.n }) + ` (${Math.min(g.have, g.n)}/${g.n})`;
      case 'earn':
        return t('pink.g.earn', 'Vender {n}', { n: money(g.n) }) + ` (${Math.round(Math.min(g.have, g.n))})`;
      case 'clean':
        return t('pink.g.clean', 'Fechar com a loja {n}% limpa', { n: g.n });
      case 'combo':
        return t('pink.g.combo', 'Fazer combo ×{n}', { n: g.n });
      case 'cat':
        return t('pink.g.cat', 'Vender {n} de {c}', { n: g.n, c: CAT[g.cat as CatId]?.name ?? '' }) + ` (${Math.min(g.have, g.n)}/${g.n})`;
      case 'tester':
        return t('pink.g.tester', '{n} clientes usarem os provadores', { n: g.n }) + ` (${Math.min(g.have, g.n)}/${g.n})`;
      default:
        return '';
    }
  }
  private goalProgress(k: Goal['k'], add: number, cat?: string): void {
    for (const g of this.s.goals) {
      if (g.done || g.k !== k || (g.cat && g.cat !== cat)) continue;
      if (k === 'combo') g.have = Math.max(g.have, add);
      else g.have += add;
      if (g.have >= g.n) {
        g.done = true;
        this.s.money += g.cash;
        this.addXp(g.xp);
        sfx.play('goal');
        this.hud.banner('goal', t('pink.goalDone', 'Meta cumprida! +{c}', { c: money(g.cash) }), 2200);
        this.hud.flash();
      }
    }
    this.refreshGoals(false);
  }
  private tutText(): [string, string] | null {
    switch (this.s.tut) {
      case 0:
        return ['door', t('pink.tut.0', 'Entre na sua loja!')];
      case 1:
        return ['tablet', t('pink.tut.1', 'Abra o tablet (botão no topo)')];
      case 2:
        return ['sofa', t('pink.tut.2', 'Compre uma prateleira e um caixa no tablet')];
      case 3:
        return ['cart', t('pink.tut.3', 'Peça produtos no tablet (Pedidos)')];
      case 4:
        return ['box', floorBounds(this.s.renov).stock ? t('pink.tut.4', 'Pegue a caixa nos fundos, abra e reponha a prateleira') : t('pink.tut.4f', 'Pegue a caixa na calçada, abra e reponha a prateleira')];
      case 5:
        return ['open', t('pink.tut.5', 'Toque em ABRIR a loja!')];
      default:
        return null;
    }
  }
  private setTut(n: number): void {
    if (n <= this.s.tut) return;
    this.s.tut = n;
    sfx.play('goal');
    this.refreshGoals(true);
  }
  private refreshGoals(show: boolean): void {
    const tut = this.tutText();
    let html = '';
    if (tut) html += `<div class="row tut">${ic(tut[0], 22)}<span>${esc(tut[1])}</span></div>`;
    else
      for (const g of this.s.goals) {
        const pct = g.k === 'clean' ? '' : `${Math.min(100, Math.round((g.have / g.n) * 100))}%`;
        html += `<div class="row${g.done ? ' done' : ''}">${ic(g.done ? 'check' : g.k === 'cat' ? CAT[g.cat as CatId]?.icon ?? 'goal' : g.k === 'serve' ? 'people' : g.k === 'earn' ? 'cash' : g.k === 'clean' ? 'mop' : g.k === 'combo' ? 'combo' : 'sparkle', 20)}<span>${esc(this.goalText(g))}</span><b>${pct}</b></div>`;
      }
    this.hud.goals(html, show || !!tut);
  }

  /* =============================== XP / nível =============================== */
  private addXp(n: number): void {
    const s = this.s;
    s.xp += n;
    while (s.lvl < 100 && s.xp >= xpNeed(s.lvl)) {
      s.xp -= xpNeed(s.lvl);
      s.lvl++;
      this.levelUp(s.lvl);
    }
    this.updateHudStatic();
  }
  private levelUp(lv: number): void {
    sfx.play('levelup');
    this.hud.flash();
    const news: string[] = [];
    for (const k of Object.keys(FURN) as FurnKind[]) if (FURN[k].lvl === lv) news.push(ic(FURN[k].icon, 30));
    for (const k of Object.keys(STAFF) as StaffKind[]) if (STAFF[k].lvl === lv) news.push(ic(STAFF[k].icon, 30));
    for (const c of CATS) if (c.lvl === lv && c.price) news.push(ic(c.icon, 30));
    const d = this.hud.panel(`<h2>${ic('star', 34)}${esc(t('pink.levelUp', 'Nível {n}!', { n: lv }))}</h2>${news.length ? `<div>${esc(t('pink.unlocked', 'Liberado:'))}</div><div class="pk-row">${news.join('')}</div>` : ''}<div class="pk-row"><button class="pk-b g">${ic('check', 24)}${esc(t('pink.ok', 'Oba!'))}</button></div>`);
    confetti(d);
    d.querySelector('button')!.addEventListener('click', () => this.hud.closePanel());
    window.setTimeout(() => d.isConnected && this.hud.overlay === d && this.hud.closePanel(), 5000);
  }

  /* =============================== clientes =============================== */
  private spawnCust(): void {
    const side = Math.random() < 0.5 ? -1 : 1;
    const cols = ['#ff8cc0', '#c3a6ff', '#8fdcff', '#ffd34a', '#9fe6c8', '#ffb27a', '#ff6b8f', '#b48cff', '#7fd1c7', '#f7c1a8'];
    const pri = cols[Math.floor(Math.random() * cols.length)];
    const sec = cols[Math.floor(Math.random() * cols.length)];
    const heads = ['h_none', 'h_bow', 'h_flower', 'h_crown', 'h_cap', 'h_bunny'];
    const spec = npcSpec(pri, sec, { head: heads[Math.floor(Math.random() * heads.length)] as never });
    const w = new Walker(spec, side * 10, 2.4 + Math.random() * 1.2, 0.36);
    w.look = `${pri}|${sec}|${(spec.avatar as { parts: { head: string } }).parts.head}`;
    w.speed = 1.1 + Math.random() * 0.4;
    this.e.scene.add(w.char.root);
    // desejos: produtos liberados (alguns que a loja não tem — "cadê?")
    const avail = PRODUCTS.filter((p) => unlocked(p, this.s.lvl, this.s.lic));
    const weights = avail.map((p) => demand(p, this.s.day));
    const stocked = new Set<string>();
    for (const f of this.furn) for (const v of f.sv.s) if (v && v[1] > 0) stocked.add(v[0]);
    const nw = 1 + (Math.random() < 0.45 ? 1 : 0) + (Math.random() < 0.15 ? 1 : 0);
    const wants: Product[] = [];
    for (let i = 0; i < nw; i++) {
      // 75%: algo que a loja vende (se tiver), 25%: qualquer coisa liberada
      let p: Product | null = null;
      if (stocked.size && Math.random() < 0.75) {
        const list = avail.filter((x) => stocked.has(x.id));
        p = pickW(list, list.map((x) => demand(x, this.s.day)));
      } else p = pickW(avail, weights);
      if (p && !wants.includes(p)) wants.push(p);
    }
    const c: Cust = { id: this.nextCust++, w, st: 'walkIn', wants, basket: [], mood: 60, patience: 55 + Math.random() * 20, t: 0, target: null, tester: null, ck: null, tried: false, said: new Set(), pay: Math.random() < 0.55 ? 'card' : 'cash', exitX: -side * 11 };
    w.go(this.nav, 0.3 * side, 1.3);
    this.custs.push(c);
  }
  private say(c: Cust | Staff, key: string, icon: string, txt: string, kind: '' | 'good' | 'bad' = '', ms = 2600): void {
    const id = 'id' in c ? 'c' + c.id : 's' + c.i;
    if ('said' in c) {
      if (c.said.has(key)) return;
      c.said.add(key);
    }
    this.hud.bubble(id, icon, txt, kind, ms);
  }
  private findProduct(p: Product, near: Walker): { f: Furn; si: number } | null {
    let best: { f: Furn; si: number } | null = null;
    let bd = 1e9;
    for (const f of this.furn)
      for (const sl of f.slots) {
        const v = f.sv.s[sl.i];
        if (!v || v[0] !== p.id || v[1] <= 0) continue;
        const d = Math.hypot(sl.pos.x - near.x, sl.pos.z - near.z);
        if (d < bd) {
          bd = d;
          best = { f, si: sl.i };
        }
      }
    return best;
  }
  private approach(f: Furn, si: number): [number, number] {
    const sl = f.slots[si];
    const off = f.sv.k === 'tableRound' ? 0.75 : f.sv.k === 'table' ? 0.65 : 0.6;
    return [sl.pos.x + Math.sin(sl.yaw) * off, sl.pos.z + Math.cos(sl.yaw) * off];
  }
  private frontOf(f: Furn, d: number): [number, number] {
    const yaw = (f.sv.r * Math.PI) / 2;
    return [f.sv.x + Math.sin(yaw) * d, f.sv.z + Math.cos(yaw) * d];
  }
  private testerFor(cat: CatId): FurnKind | null {
    if (cat === 'perfume' || cat === 'splash') return 'testPerfume';
    if (cat === 'lips' || cat === 'face' || cat === 'skin') return 'testMakeup';
    if (cat === 'nails') return 'testNails';
    return null;
  }
  private custUpdate(c: Cust, dt: number): void {
    const w = c.w;
    c.t += dt;
    const nav = this.nav;
    switch (c.st) {
      case 'walkIn':
        if (w.arrived) {
          if (this.phase !== 'open') return this.custLeave(c, false);
          c.st = 'enter';
          w.go(nav, (Math.random() - 0.5) * 1.2, -1.6);
          sfx.play('door', { db: -6 });
        }
        break;
      case 'enter':
        if (w.arrived) {
          // primeira impressão
          const b = this.scores.beauty;
          const cl = this.scores.clean;
          c.mood += (b - 50) * 0.35 + (cl - 60) * 0.3;
          if (cl < 40) this.say(c, 'dirty', 'dirty', t('pink.say.dirty', 'Loja suja!'), 'bad');
          else if (b > 68) this.say(c, 'pretty', 'love', t('pink.say.pretty', 'Que loja linda!'), 'good');
          else if (b < 30) this.say(c, 'ugly', 'sad', t('pink.say.ugly', 'Que loja feia...'), 'bad');
          c.st = 'shop';
          c.t = 0;
        }
        break;
      case 'shop': {
        const p = c.wants[0];
        if (!p) {
          // terminou: vai ao caixa (ou embora)
          if (!c.basket.length) {
            c.mood -= 8;
            this.say(c, 'nothing', 'sad', t('pink.say.nothing', 'Não achei nada...'), 'bad');
            return this.custLeave(c, true);
          }
          return this.goQueue(c);
        }
        const tg = this.findProduct(p, w);
        if (!tg) {
          c.wants.shift();
          c.mood -= 12;
          this.say(c, 'miss' + p.id, 'question', t('pink.say.where', 'Cadê o {p}?', { p: p.name }), 'bad', 3200);
          w.wait = 1.2;
          return;
        }
        // provador antes (se tiver um da categoria)
        const tk = this.testerFor(p.cat);
        const tf = tk && !c.tried ? this.furn.find((f) => f.sv.k === tk) : null;
        if (tf && Math.random() < 0.65) {
          c.tried = true;
          c.tester = tf;
          const [x, z] = this.frontOf(tf, 0.75);
          w.go(nav, x, z);
          c.st = 'tester';
          return;
        }
        c.target = tg;
        const [x, z] = this.approach(tg.f, tg.si);
        w.go(nav, x, z);
        c.st = 'look';
        c.t = 0;
        break;
      }
      case 'tester':
        if (w.arrived) {
          const f = c.tester!;
          w.face(f.sv.x, f.sv.z);
          c.st = 'testing';
          c.t = 0;
          w.act = 0;
          sfx.play('spray', { db: -4 });
          this.sprayFx(f);
          c.mood += 12;
          this.goalProgress('tester', 1);
          this.say(c, 'test', 'sparkle', f.sv.k === 'testPerfume' ? t('pink.say.smell', 'Que cheiro bom!') : f.sv.k === 'testNails' ? t('pink.say.nails', 'Amei essa cor!') : t('pink.say.makeup', 'Ficou lindo em mim!'), 'good');
        }
        break;
      case 'testing':
        w.act = c.t < 1.2 ? (c.t * 0.8) % 1 : -1;
        if (c.t > 2.2) {
          w.act = -1;
          c.st = 'shop';
        }
        break;
      case 'look': {
        if (!c.target) {
          c.st = 'shop';
          break;
        }
        if (!w.arrived) {
          if (c.t > 25) {
            c.st = 'shop';
            c.t = 0;
          }
          break;
        }
        const { f, si } = c.target;
        const sl = f.slots[si];
        w.face(sl.pos.x, sl.pos.z);
        if (c.t < 1.0) break;
        const p = c.wants.shift()!;
        const v = f.sv.s[si];
        c.target = null;
        if (!v || v[0] !== p.id || v[1] <= 0) {
          c.wants.unshift(p);
          c.st = 'shop';
          break;
        }
        const pf = this.price(p) / p.mkt;
        let prob = 1.18 - Math.max(0, pf - 1) * 2.2 + (c.tried ? 0.15 : 0) + (c.mood - 60) * 0.004;
        if (pf < 0.95) prob += 0.15;
        if (pf > 1.32) {
          this.say(c, 'exp' + p.id, 'expensive', t('pink.say.expensive', 'Muito caro!'), 'bad');
          c.mood -= 8;
          prob = Math.min(prob, 0.12);
        }
        if (Math.random() < prob) {
          v[1]--;
          if (v[1] <= 0) f.sv.s[si] = null;
          this.fieldDirty = true;
          c.basket.push(p);
          w.act = 0.6;
          window.setTimeout(() => (w.act = -1), 350);
          if (pf < 0.9 && Math.random() < 0.4) this.say(c, 'cheap', 'love', t('pink.say.cheap', 'Que barato!'), 'good');
        }
        c.st = 'shop';
        c.t = 0;
        break;
      }
      case 'toQueue':
      case 'queue': {
        const ck = c.ck;
        if (!ck || !this.furn.includes(ck)) return this.goQueue(c);
        const qi = ck.queue.indexOf(c);
        // posição na fila
        const [x, z] = this.queueSpot(ck, qi);
        const lastT = w.path[w.path.length - 1];
        if (!lastT || Math.hypot(lastT.x - x, lastT.y - z) > 0.3) {
          if (w.arrived && Math.hypot(w.x - x, w.z - z) > 0.3) w.go(nav, x, z);
        }
        if (w.arrived) {
          c.st = 'queue';
          w.face(ck.sv.x, ck.sv.z);
          c.patience -= dt * (qi === 0 ? 0.7 : 1);
          if (c.patience < 18) this.say(c, 'slow', 'clock', t('pink.say.slow', 'Tá demorando...'), 'bad');
          if (c.patience <= 0) {
            c.mood -= 30;
            this.say(c, 'gave', 'sad', t('pink.say.gaveUp', 'Desisti!'), 'bad', 3000);
            this.returnBasket(c);
            return this.custLeave(c, true);
          }
          // atendimento automático (funcionária ou autoatendimento)
          if (qi === 0 && (ck.staff || ck.sv.k === 'selfcheck') && ck.staff?.st !== 'away') {
            if (ck.staff && Math.hypot(ck.staff.w.x - this.cashierSpot(ck)[0], ck.staff.w.z - this.cashierSpot(ck)[1]) > 0.5) break;
            ck.busy += dt;
            const per = ck.sv.k === 'selfcheck' ? 1.6 : ck.sv.k === 'checkout2' ? 0.8 : 1.3;
            if (ck.busy > 1.5 + c.basket.length * per) {
              ck.busy = 0;
              sfx.play('beep');
              this.finishSale(c, { wrongChange: 0, secs: 6 });
            }
          }
        }
        break;
      }
      case 'paying':
        break;
      case 'leave':
        if (w.arrived) {
          if (c.t < 100 && w.z > 1) {
            // na calçada: anda até a esquina
            c.t = 100;
            w.go(nav, c.exitX, 2.6 + Math.random());
          } else if (c.t >= 100) {
            c.st = 'gone';
          }
        }
        break;
    }
  }
  private queueSpot(ck: Furn, i: number): [number, number] {
    const yaw = (ck.sv.r * Math.PI) / 2;
    const d = 0.85 + i * 0.7;
    // fila sai em diagonal para não bater nas coisas
    const sx = Math.sin(yaw);
    const sz = Math.cos(yaw);
    const x = ck.sv.x + sx * d + Math.cos(yaw) * Math.min(i, 3) * 0.15;
    const z = ck.sv.z + sz * d - Math.sin(yaw) * Math.min(i, 3) * 0.15;
    const [ci, cj] = this.nav.nearestFree(x, z);
    return [this.nav.x0 + (ci + 0.5) * this.nav.cell, this.nav.z0 + (cj + 0.5) * this.nav.cell];
  }
  private cashierSpot(ck: Furn): [number, number] {
    return this.frontOf(ck, -0.78);
  }
  private goQueue(c: Cust): void {
    const cks = this.furn.filter((f) => f.def.group === 'checkout');
    if (!cks.length) {
      this.say(c, 'nock', 'register', t('pink.say.noCheckout', 'Cadê o caixa?'), 'bad');
      this.returnBasket(c);
      return this.custLeave(c, true);
    }
    // menor fila (autoatendimento e caixas com gente andam mais rápido)
    cks.sort((a, b) => a.queue.length - (a.staff || a.sv.k === 'selfcheck' ? 0.5 : 0) - (b.queue.length - (b.staff || b.sv.k === 'selfcheck' ? 0.5 : 0)));
    const ck = cks[0];
    if (c.ck) c.ck.queue.splice(c.ck.queue.indexOf(c), 1);
    c.ck = ck;
    ck.queue.push(c);
    c.st = 'toQueue';
    const [x, z] = this.queueSpot(ck, ck.queue.length - 1);
    c.w.go(this.nav, x, z);
    if (ck.queue.length >= 4) this.say(c, 'line', 'queue', t('pink.say.line', 'Que fila!'), 'bad');
  }
  private returnBasket(c: Cust): void {
    if (!c.basket.length) return;
    // devolução: os itens voltam numa caixinha perto do caixa
    const p = c.basket[0];
    const same = c.basket.filter((x) => x === p).length;
    const at = c.ck ? this.frontOf(c.ck, 1.1) : [c.w.x, c.w.z];
    this.e.spawnBox(p.id, same, at[0], 0.4, at[1], { open: true });
    c.basket = [];
  }
  private custLeave(c: Cust, served: boolean): void {
    if (c.ck) {
      const i = c.ck.queue.indexOf(c);
      if (i >= 0) c.ck.queue.splice(i, 1);
      c.ck = null;
    }
    if (this.ckCust === c) this.ck?.cancel();
    if (served) {
      this.day.cust++;
      this.s.totalCust++;
      if (c.mood >= 55) this.day.happy++;
      this.s.rep = Math.max(5, Math.min(100, this.s.rep * 0.94 + Math.max(0, Math.min(100, c.mood)) * 0.06));
    }
    c.st = 'leave';
    c.t = 0;
    c.w.go(this.nav, (Math.random() - 0.5) * 0.8, 1.4);
  }
  private serve(ck: Furn): void {
    const c = ck.queue[0];
    if (!c || this.ck) return;
    // vai para trás do balcão
    const [sx, sz] = this.cashierSpot(ck);
    this.e.fp.place(sx, sz);
    this.e.fpc.lookAt(sx, 1.5, sz, ck.sv.x + Math.sin((ck.sv.r * Math.PI) / 2) * 1.2, 0.9, ck.sv.z + Math.cos((ck.sv.r * Math.PI) / 2) * 1.2);
    c.st = 'paying';
    this.ckCust = c;
    this.ck = new CheckoutUI(this.o.root, {
      items: c.basket.map((p) => ({ p, price: this.price(p) })),
      pay: c.pay,
      auto: ck.sv.k === 'checkout2',
      onDone: (r) => {
        this.ck = null;
        this.ckCust = null;
        this.finishSale(c, r);
      },
      onCancel: () => {
        this.ck = null;
        this.ckCust = null;
        if (c.st === 'paying') c.st = 'queue';
      },
    });
  }
  private finishSale(c: Cust, r: { wrongChange: number; secs: number }): void {
    let tot = 0;
    let cost = 0;
    for (const p of c.basket) {
      const pr = this.price(p);
      tot += pr;
      cost += p.cost;
      this.s.sold[p.id] = (this.s.sold[p.id] ?? 0) + 1;
      this.goalProgress('cat', 1, p.cat);
      this.day.sold++;
    }
    c.mood += 10 - r.wrongChange * 8 - Math.max(0, r.secs - 20) * 0.5;
    const happy = c.mood >= 55;
    // combo: clientes felizes seguidos
    if (happy) {
      this.combo = this.comboT > 0 || this.combo === 0 ? this.combo + 1 : 1;
      this.comboT = 40;
    } else this.combo = 0;
    this.s.bestCombo = Math.max(this.s.bestCombo, this.combo);
    this.hud.combo(this.combo);
    if (this.combo >= 2) sfx.play('combo', { rate: 1 + Math.min(10, this.combo) * 0.04 });
    const mult = 1 + Math.min(1, Math.max(0, this.combo - 1) * 0.1);
    this.s.money += tot;
    this.day.rev += tot;
    this.updateHudStatic(true);
    const xp = Math.round(c.basket.reduce((a, p) => a + 1 + this.price(p) / 10, 0) * mult);
    this.addXp(xp);
    this.goalProgress('serve', 1);
    this.goalProgress('earn', tot);
    this.goalProgress('combo', this.combo);
    const sc = this.e.toScreen(c.w.x, 1.6, c.w.z);
    if (sc) this.hud.float(sc[0], sc[1], `+${esc(money(tot))}`);
    sfx.play('bag');
    if (happy) this.say(c, 'bye', c.mood > 85 ? 'love' : 'smile', c.mood > 85 ? t('pink.say.love', 'Amei! Volto amanhã!') : t('pink.say.thanks', 'Obrigada!'), 'good');
    else this.say(c, 'bye', 'sad', t('pink.say.meh', 'Hmm...'), 'bad');
    void cost;
    c.basket = [];
    this.custLeave(c, true);
  }

  /* =============================== equipe =============================== */
  private spawnStaff(k: StaffKind, name: string, color: string): void {
    const d = STAFF[k];
    const spec = d.robot ? npcSpec('#c0c8d8', '#6a7a8a', { eyes: 'e_cute' as never }) : npcSpec(color, '#ffffff', { head: 'h_bow' as never });
    // chega pela calçada e entra pela porta
    const side = Math.random() < 0.5 ? -1 : 1;
    const w = new Walker(spec, side * (8 + Math.random() * 2), 2.6 + Math.random() * 0.8, 0.36);
    w.look = d.robot ? '#c0c8d8|#6a7a8a|r' : `${color}|#ffffff|h_bow`;
    w.speed = d.robot ? 1.9 : 1.45;
    this.e.scene.add(w.char.root);
    this.staff.push({ i: this.staff.length + 100, k, name, w, st: 'idle', t: 0, box: null, task: null, ck: null });
  }
  private staffDropBox(st: Staff): void {
    if (!st.box) return;
    const l = st.box;
    st.box = null;
    l.mesh.removeFromParent();
    this.e.scene.add(l.mesh);
    l.body.position.set(st.w.x, 0.5, st.w.z);
    l.body.velocity.setZero();
    this.e.phys.world.addBody(l.body);
    this.e.phys.items.push(l);
  }
  /** canto dos fundos (estoque, ou o fundo da garagem) */
  backSpot(): [number, number] {
    const fb = floorBounds(this.s.renov);
    if (fb.stock) return [-1.5 + Math.random() * 3, -13.8];
    return [fb.x0 + 0.8 + Math.random() * 1.2, fb.zB + 0.9];
  }
  private staffUpdate(st: Staff, dt: number): void {
    const w = st.w;
    st.t += dt;
    const nav = this.nav;
    if (st.k === 'cashier') {
      if (!st.ck || !this.furn.includes(st.ck)) {
        st.ck = this.furn.find((f) => (f.sv.k === 'checkout' || f.sv.k === 'checkout2') && !f.staff) ?? null;
        if (st.ck) {
          st.ck.staff = st;
          const [x, z] = this.cashierSpot(st.ck);
          w.go(nav, x, z);
        }
      } else if (w.arrived) {
        w.face(st.ck.sv.x, st.ck.sv.z);
        // o jogador está atendendo neste caixa? então espera
      }
      return;
    }
    if (st.k === 'cleaner' || st.k === 'robotClean') {
      if (st.st === 'idle' || (st.st === 'go' && w.arrived)) {
        const d = this.e.dirt.length ? this.e.dirt.reduce((a, b) => (b.a * 2 - Math.hypot(b.x - w.x, b.z - w.z) * 0.1 > a.a * 2 - Math.hypot(a.x - w.x, a.z - w.z) * 0.1 ? b : a)) : null;
        if (st.st === 'go' && d && Math.hypot(d.x - w.x, d.z - w.z) < 0.9) {
          st.st = 'clean';
          st.t = 0;
        } else if (d && st.st === 'idle') {
          w.go(nav, d.x, d.z);
          st.st = 'go';
        } else if (!d && st.t > 4) {
          st.t = 0;
          w.go(nav, ...this.backSpot());
        } else if (st.st === 'go') st.st = 'idle';
      }
      if (st.st === 'clean') {
        w.act = (st.t * 1.5) % 1;
        const got = this.e.cleanAt(w.x, w.z, dt * (st.k === 'robotClean' ? 1.4 : 0.8));
        if (st.t > 0.4 && Math.floor(st.t / 0.6) !== Math.floor((st.t - dt) / 0.6)) sfx.play('mop', { db: -10 });
        if (!got) {
          w.act = -1;
          st.st = 'idle';
          st.t = 0;
        }
      }
      return;
    }
    // repositor(a): caixa do estoque → vaga vazia do mesmo produto
    if (st.st === 'idle' && st.t > 1) {
      st.t = 0;
      // vaga com espaço cujo produto tem caixa no chão
      const boxes = this.e.phys.items.filter((l) => l.kind === 'box' && (l.data.n as number) > 0 && l.data.p);
      let pick: { l: Loose; f: Furn; si: number } | null = null;
      for (const f of this.furn)
        for (const sl of f.slots) {
          const v = f.sv.s[sl.i];
          const pid = v?.[0];
          const have = v?.[1] ?? 0;
          if (pid) {
            if (have >= capOf(PROD[pid].shape) * 0.6) continue;
            const l = boxes.find((b) => b.data.p === pid);
            if (l) {
              pick = { l, f, si: sl.i };
              break;
            }
          }
        }
      if (!pick) {
        // vaga vazia + qualquer caixa sem lugar
        for (const l of boxes) {
          const has = this.furn.some((f) => f.sv.s.some((v) => v && v[0] === l.data.p));
          if (has) continue;
          for (const f of this.furn) {
            const sl = f.slots.find((x) => !f.sv.s[x.i]);
            if (sl) {
              pick = { l, f, si: sl.i };
              break;
            }
          }
          if (pick) break;
        }
      }
      if (pick) {
        st.task = { f: pick.f, si: pick.si };
        st.box = pick.l;
        this.e.phys.remove(pick.l);
        st.st = 'toBox';
        const p = pick.l.mesh.position;
        w.go(nav, p.x, p.z);
        (st as Staff & { bx: number; bz: number }).bx = p.x;
      }
    } else if (st.st === 'toBox' && w.arrived) {
      st.st = 'carry';
      const tk = st.task!;
      const [x, z] = this.approach(tk.f, tk.si);
      w.go(nav, x, z);
    } else if (st.st === 'carry') {
      // caixa acima da cabeça
      if (st.box) {
        st.box.mesh.position.set(w.x, 1.05, w.z);
        st.box.mesh.rotation.set(0, w.yaw, 0);
      }
      if (w.arrived) {
        st.st = 'fill';
        st.t = 0;
      }
    } else if (st.st === 'fill') {
      const tk = st.task;
      const l = st.box;
      if (!tk || !l || !this.furn.includes(tk.f)) {
        if (l) this.staffDropBox(st);
        st.st = 'idle';
        return;
      }
      w.face(tk.f.slots[tk.si].pos.x, tk.f.slots[tk.si].pos.z);
      if (st.box) st.box.mesh.position.set(w.x + Math.sin(w.yaw) * 0.3, 0.9, w.z + Math.cos(w.yaw) * 0.3);
      const rate = st.k === 'robotStock' ? 0.18 : 0.32;
      if (st.t > rate) {
        st.t = 0;
        const pid = l.data.p as string;
        const v = tk.f.sv.s[tk.si];
        const cap = capOf(PROD[pid].shape);
        if ((v && v[0] !== pid) || (v && v[1] >= cap) || (l.data.n as number) <= 0) {
          // terminou: caixa vazia → lixo; sobrando → devolve ao chão do estoque
          if ((l.data.n as number) <= 0) {
            l.mesh.removeFromParent();
            st.box = null;
          } else {
            st.st = 'return';
            w.go(nav, ...this.backSpot());
            return;
          }
          st.st = 'idle';
          st.task = null;
          return;
        }
        l.data.n = (l.data.n as number) - 1;
        if (v) v[1]++;
        else tk.f.sv.s[tk.si] = [pid, 1];
        this.fieldDirty = true;
        sfx.play('place', { db: -8 });
      }
    } else if (st.st === 'return' && w.arrived) {
      this.staffDropBox(st);
      st.st = 'idle';
      st.task = null;
    }
  }

  /* =============================== caminhão =============================== */
  private truckModel(): THREE.Group {
    const k = this.e.kit;
    const b = new Builder();
    const pink = k.plain('truckPink', '#ff8cc0', 0.35, 0.2, { envK: 1.2 });
    const white = k.plain('truckWhite', '#f7f4f2', 0.3, 0.2, { envK: 1.2 });
    const dark = k.plain('truckDark', '#26222a', 0.6);
    b.add(rbox(2.3, 2.4, 4.2, 0.12, 3), white, 0, 1.75, 0);
    b.add(rbox(2.2, 1.6, 1.6, 0.25, 3), pink, 0, 1.25, 2.9);
    b.add(rbox(2.0, 0.7, 0.05, 0.1, 2), k.glass('truckGlass', '#304050', 0.85), 0, 1.6, 3.71, -0.25);
    b.add(new THREE.PlaneGeometry(3.6, 0.9), k.canvasMat('truckLogo', brandCanvas(800, 200)), 1.16, 2.1, 0, 0, Math.PI / 2, 0);
    b.add(new THREE.PlaneGeometry(3.6, 0.9), k.canvasMat('truckLogo', brandCanvas(800, 200)), -1.16, 2.1, 0, 0, -Math.PI / 2, 0);
    for (const sz of [-1.3, 1.5, 2.9]) for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18).rotateZ(Math.PI / 2), dark, sx * 1.0, 0.42, sz);
    b.add(rbox(2.3, 0.2, 0.1, 0.04, 1), dark, 0, 0.5, -2.12);
    const g = b.build({ shadow: this.e.tier >= 3 });
    const wrap = new THREE.Group();
    wrap.add(g);
    return wrap;
  }
  private truckUpdate(dt: number): void {
    for (const o of this.pendingOrders) o.eta -= dt;
    if (!this.truck && this.pendingOrders.length && this.pendingOrders[0].eta <= 0) {
      const o = this.pendingOrders.shift()!;
      const g = this.truckModel();
      this.e.scene.add(g);
      this.truck = { g, t: 0, boxes: o.boxes, wrong: o.wrong, phase: 0, dropped: 0 };
      sfx.play('truck');
    }
    const tr = this.truck;
    if (!tr) return;
    tr.t += dt;
    const g = tr.g;
    const dock = floorBounds(this.s.renov).stock;
    // COM ESTOQUE (beco): 0 chega pelo beco, 1 dá ré até a porta de enrolar, 2 descarrega, 3 vai embora
    // GARAGEM/SEM ESTOQUE (rua): 0 vem pela rua, 1 encosta de ré no meio-fio, 2 joga as caixas na calçada, 3 vai embora
    if (tr.phase === 0) {
      const k = Math.min(1, tr.t / 3.2);
      const e = 1 - Math.pow(1 - k, 3);
      if (dock) g.position.set(-22 + e * 22, 0, -21.5);
      else g.position.set(-24 + e * 22, 0, 6.4);
      g.rotation.y = Math.PI / 2;
      if (k >= 1) {
        tr.phase = 1;
        tr.t = 0;
        sfx.play('backup');
      }
    } else if (tr.phase === 1) {
      const k = Math.min(1, tr.t / 2.4);
      const e = k * k * (3 - 2 * k);
      if (dock) {
        g.rotation.y = (Math.PI / 2) * (1 - Math.min(1, k * 1.4)) + Math.PI * Math.min(1, k * 1.4);
        g.position.set(0, 0, -21.5 + e * 2.3);
      } else {
        g.rotation.y = (Math.PI / 2) * (1 - Math.min(1, k * 1.3));
        g.position.set(-2 + e * 2, 0, 6.4 + Math.sin(e * Math.PI) * 0.6 + e * 0.5);
      }
      if (k >= 1) {
        tr.phase = 2;
        tr.t = 0;
        sfx.play('shutter');
      }
    } else if (tr.phase === 2) {
      // porta abre, caixas "pulam" para fora com física
      const due = Math.floor((tr.t - 1.0) / 0.35);
      if (due >= tr.dropped && tr.boxes.length) {
        tr.dropped++;
        let [pid, cnt] = tr.boxes.shift()!;
        if (tr.wrong && tr.boxes.length === 0) {
          // "deu BO": veio produto errado
          const alts = PRODUCTS.filter((p) => p.id !== pid && p.lvl <= this.s.lvl + 3);
          const alt = alts[Math.floor(Math.random() * alts.length)];
          this.s.coupons += PROD[pid].cost * PROD[pid].box;
          pid = alt.id;
          cnt = alt.box;
          this.hud.banner('bug', t('pink.wrongItem', 'Deu BO! Veio produto errado. Ganhou cupom de desconto.'), 3200);
        }
        const x = (Math.random() - 0.5) * 1.6;
        if (dock) this.e.spawnBox(pid, cnt, x, 1.2 + Math.random() * 0.4, LAY.zBack + 0.3, { vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.2, 2.2 + Math.random() * 1.6) });
        else this.e.spawnBox(pid, cnt, x, 1.3 + Math.random() * 0.3, 4.4, { vel: new THREE.Vector3(x * 1.4 + (Math.random() - 0.5), 1.4, -2.4 - Math.random() * 1.2) });
        sfx.play('drop', { db: -4 });
      }
      if (!tr.boxes.length && tr.t > 2.5) {
        tr.phase = 3;
        tr.t = 0;
        sfx.play('truck');
        sfx.play('shutter');
        this.hud.banner('box', dock ? t('pink.arrived', 'Chegou o estoque! Caixas nos fundos.') : t('pink.arrivedFront', 'Chegou o estoque! Caixas na calçada.'), 2200);
        if (this.s.tut === 3) this.setTut(4);
      }
    } else if (tr.phase === 3) {
      const k = Math.min(1, tr.t / 3);
      if (dock) {
        g.position.set(-k * k * 24, 0, -19.2 - k * 2.3);
        g.rotation.y = Math.PI + Math.min(1, k * 2) * (Math.PI / 2);
      } else {
        g.position.set(k * k * 26, 0, 6.9 - Math.min(1, k * 2) * 0.5);
        g.rotation.y = Math.min(1, k * 2) * (Math.PI / 2);
      }
      if (k >= 1) {
        g.removeFromParent();
        g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
        this.truck = null;
      }
    }
  }

  /* =============================== pontuações =============================== */
  private computeScores(): void {
    const s = this.s;
    const r = s.renov;
    let b = 8;
    b += r.walls ? 18 : 0;
    b += r.window ? 8 : 0;
    b += r.door ? 4 : 0;
    b += FLOORS.find((f) => f.id === r.floor)?.beauty ?? 0;
    b += SIGNS.find((f) => f.id === r.sign)?.beauty ?? 0;
    b += LIGHTS[r.light]?.beauty ?? 0;
    let fb = 0;
    for (const f of this.furn) fb += f.def.beauty;
    const area = salesArea(r);
    const zB = stageOf(r).zB;
    b += Math.min(40, fb * (120 / area) * 0.9);
    b -= this.trashL.length * 5;
    // caixas largadas no salão
    for (const l of this.e.phys.items) if ((l.kind === 'box' || l.kind === 'item') && l.mesh.position.z > zB && l.mesh.position.z < 0) b -= 1.5;
    this.scores.beauty = Math.max(0, Math.min(100, b));
    let dirt = 0;
    for (const d of this.e.dirt) dirt += d.a * (d.k === 'spill' || d.k === 'glass' ? 2.5 : 1);
    this.scores.clean = Math.max(0, Math.min(100, 100 - dirt * (100 / area) * 4.5 - this.trashL.length * 6));
    let tot = 0;
    let full = 0;
    for (const f of this.furn)
      for (const v of f.sv.s) {
        tot++;
        if (v && v[1] > 0) full += Math.min(1, v[1] / Math.max(1, capOf(PROD[v[0]].shape) * 0.5));
      }
    this.scores.stock = tot ? (full / tot) * 100 : 0;
    this.hud.meters(this.scores.beauty, this.scores.clean, this.scores.stock);
  }

  /* =============================== HUD =============================== */
  private updateHudStatic(bump = false): void {
    const s = this.s;
    this.hud.money(money(s.money), bump);
    const hh = Math.floor(this.hour);
    const mm = Math.floor((this.hour - hh) * 6) * 10;
    const night = this.hour >= 18.5;
    const ss = seasonAt(s.day);
    this.hud.day(night ? 'moon' : 'sun', `${t('pink.dayShort', 'Dia {n}', { n: s.day })} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, ss?.name ?? '');
    this.hud.level(s.lvl, s.xp / xpNeed(s.lvl));
    this.hud.open(this.phase === 'open', this.phase === 'prep' && s.tut >= 5);
    const c = this.e.carry;
    const slot0 = c ? { icon: c.kind === 'trash' ? 'trash' : c.data.open ? 'boxOpen' : 'box', n: c.kind === 'box' ? ((c.data.n as number) ?? 0) : undefined, label: t('pink.hand', 'Mãos') } : { icon: 'hand', label: t('pink.hand', 'Mãos') };
    const hot = [slot0, { icon: 'mop', label: t('pink.mop', 'Esfregão') }];
    if (pendingWall(s.renov)) hot.push({ icon: 'hammer', label: t('pink.hammer', 'Marreta') });
    this.hud.hot(hot, this.tool);
    this.hud.carrying(!!c);
  }

  /* =============================== quadro =============================== */
  private frame(dt: number): void {
    const e = this.e;
    if (this.navDirty) this.refreshCollision();
    const lock = !!this.tablet || !!this.ck || !!this.hud.overlay;
    // escorregar em poça/cacos correndo
    const d = e.dirtAt(e.fp.x, e.fp.z);
    const wet = d && (d.k === 'spill' || d.k === 'glass');
    e.movePlayer(dt, lock, wet ? 1 : 0);
    if (e.running && !lock && e.fp.speedK > 0.6 && e.carry && e.carry.kind !== 'trash') {
      const risk = (wet ? 1.6 : d ? 0.5 : 0.07) * dt;
      if (Math.random() < risk) e.trip();
    } else if (e.running && wet && e.fp.speedK > 0.7 && Math.random() < dt * 0.8) e.trip();
    // tutorial: entrou
    if (this.s.tut === 0 && e.fp.z < -1) this.setTut(1);
    // ações contínuas (segurar)
    if (this.build) this.updateBuild();
    else if (!lock) {
      this.aimUpdate();
      if (this.useHeld) {
        const a = this.aimInfo;
        if (a?.kind === 'mop' && a.d) {
          this.mopT += dt;
          e.cleanAt(a.d.x, a.d.z, dt * 1.6);
          if (this.guest) {
            const m = (this.mopAcc ??= { x: a.d.x, z: a.d.z, a: 0 });
            m.x = a.d.x;
            m.z = a.d.z;
            m.a += dt * 1.6;
          }
          if (this.mopT > 0.45) {
            this.mopT = 0;
            sfx.play('mop');
            e.fpc.kick(0.25);
          }
          if (!e.dirtAt(a.d.x, a.d.z) && !this.nearDirt(a.d.x, a.d.z)) {
            sfx.play('sparkle');
            this.useHeld = false;
          }
        } else if (a?.kind === 'smash') this.smash();
        else if (a?.kind === 'stock') {
          this.useRep -= dt;
          if (this.useRep <= 0) {
            this.useRep = 0.16;
            this.doUse(false);
          }
        }
      }
    }
    if (this.smashCd > 0) this.smashCd -= dt;
    // produtos voando para a prateleira
    for (let i = this.flies.length - 1; i >= 0; i--) {
      const f = this.flies[i];
      f.t += dt / 0.22;
      const k = Math.min(1, f.t);
      f.mesh.position.lerpVectors(f.from, f.to, k);
      f.mesh.position.y += Math.sin(k * Math.PI) * 0.25;
      f.mesh.rotation.y = k * 6;
      if (k >= 1) {
        f.mesh.removeFromParent();
        f.done();
        this.flies.splice(i, 1);
      }
    }
    for (let i = this.fx.length - 1; i >= 0; i--) if (!this.fx[i](dt)) this.fx.splice(i, 1);
    if (this.fieldDirty) this.rebuildField();
    e.phys.step(dt);
    // clientes e equipe
    const walkers = [...this.custs.map((c) => c.w), ...this.staff.map((s) => s.w)];
    for (let i = this.custs.length - 1; i >= 0; i--) {
      const c = this.custs[i];
      this.custUpdate(c, dt);
      c.w.update(dt, e.camera, walkers);
      if (c.st === 'gone') {
        c.w.dispose();
        this.hud.dropBubble('c' + c.id);
        this.custs.splice(i, 1);
      }
    }
    for (const st of this.staff) {
      this.staffUpdate(st, dt);
      st.w.update(dt, e.camera, walkers);
    }
    // balões seguem as cabeças: só os 4 mais perto, sem um tampar o outro
    const vis: { id: string; x: number; y: number; d: number }[] = [];
    for (const c of this.custs) {
      const id = 'c' + c.id;
      if (!this.hud.hasBubble(id)) continue;
      const sc = e.toScreen(c.w.x, 1.35, c.w.z);
      const d = Math.hypot(c.w.x - e.fp.x, c.w.z - e.fp.z);
      if (!sc || d > 14) this.hud.moveBubble(id, 0, 0, false);
      else vis.push({ id, x: sc[0], y: sc[1], d });
    }
    vis.sort((a, b) => a.d - b.d);
    const placed: { x: number; y: number }[] = [];
    for (const [i, v] of vis.entries()) {
      if (i >= 4) {
        this.hud.moveBubble(v.id, 0, 0, false);
        continue;
      }
      let y = v.y;
      for (let k = 0; k < 4; k++) {
        const hit = placed.find((p) => Math.abs(p.x - v.x) < 130 && Math.abs(p.y - y) < 30);
        if (!hit) break;
        y = hit.y - 32;
      }
      placed.push({ x: v.x, y });
      this.hud.moveBubble(v.id, v.x, y, true);
    }
    if (lock !== this.lastLock) {
      this.lastLock = lock;
      e.input.show(!lock);
      this.hud.modal(lock);
    }
    if (this.hud.hasBubble('me')) {
      const sc = e.toScreen(e.fp.x - Math.sin(e.fpc.yaw) * 1.2, 1.5, e.fp.z - Math.cos(e.fpc.yaw) * 1.2);
      this.hud.moveBubble('me', sc?.[0] ?? 0, sc?.[1] ?? 0, !!sc);
    }
    // portas automáticas: alguém perto da porta
    let near = Math.hypot(e.fp.x, e.fp.z) < (this.store.isGarage ? 3.2 : 2);
    if (!near) for (const w of walkers) if (Math.abs(w.x) < 1.6 && Math.abs(w.z) < 1.8) near = true;
    if (!near && this.net) for (const w of [...(this.remotes?.positions() ?? []), ...(this.ghosts?.positions() ?? [])]) if (Math.abs(w.x) < 1.6 && Math.abs(w.z) < 1.8) near = true;
    if (near && !this.wasNear && this.phase === 'open') sfx.play('door', { db: -8 });
    this.wasNear = near;
    const wantShutter = this.truck && this.truck.phase >= 2 && this.truck.phase < 3 && floorBounds(this.s.renov).stock ? 1 : 0;
    const wasOpen = this.store.backOpen;
    this.store.signOpen = this.phase === 'open';
    const garageOpen = this.store.isGarage && (this.phase === 'open' || this.phase === 'closing' || (!!this.truck && this.truck.phase === 2));
    this.store.update(dt, e.time, near || garageOpen, wantShutter);
    if (wasOpen !== this.store.backOpen) this.navDirty = true;
    if (!this.guest) {
      this.dayTick(dt);
      this.truckUpdate(dt);
    }
    if (this.net) this.netTick(dt);
    // sujeira trazida pelos clientes (pegadas)
    this.dirtT -= dt;
    if (this.dirtT <= 0) {
      this.dirtT = 2.5;
      for (const c of this.custs) {
        if (c.w.z < -0.5 && c.w.z > stageOf(this.s.renov).zB && c.w.vel > 0.3 && Math.random() < 0.06) e.addDirt(c.w.x, c.w.z, Math.random() < 0.3 ? 'mud' : 'dirt', 0.25);
      }
    }
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0 && this.combo) {
        this.combo = 0;
        this.hud.combo(0);
      }
    }
    // relógio, céu, pontuações (a cada ~0,25 s)
    this.fpsT += dt;
    if (this.fpsT > 0.25) {
      this.fpsT = 0;
      this.skyAt(this.hour);
      this.computeScores();
      this.updateHudStatic();
      if (this.phase === 'open' && this.custs.length > 5) music.setState('tension');
      else if (this.phase === 'open') music.setState('calm');
      // meta de limpeza: confere ao fechar
      if (this.phase === 'closing' && !this.guest) for (const g of this.s.goals) if (g.k === 'clean' && !g.done && this.scores.clean >= g.n) this.goalProgress('clean', g.n);
    }
    this.saveT += dt;
    if (this.saveT > 30 && !this.guest) {
      this.saveT = 0;
      this.save();
    }
    sfx.listener?.(e.camera.position.x, e.camera.position.y, e.camera.position.z, 0, 0, -1);
  }

  /* =============================== grupo (coop.ts) =============================== */
  private canPay(n: number): boolean {
    if (this.s.money >= n) return true;
    sfx.play('wrong');
    this.hud.banner('coin', t('pink.noMoney', 'Dinheiro insuficiente!'), 1500);
    return false;
  }
  /** convidado: pede ao anfitrião (confere o dinheiro aqui para responder na hora; o anfitrião confirma) */
  private ask(o: ActO, a: unknown[], cost: number, icon?: string, msg?: string): boolean {
    if (cost > 0 && !this.canPay(cost)) return false;
    this.net?.net.send({ t: 'act', o, a });
    if (cost > 0) {
      this.s.money -= cost;
      this.updateHudStatic(true);
      sfx.play('cash');
    }
    if (icon && msg) this.hud.banner(icon, msg, 1600);
    return true;
  }
  private netInit(): void {
    const n = this.net!;
    const net = n.net;
    this.remotes = new Remotes(this.e.scene, this.hud.el, net);
    if (!n.host) {
      this.ghosts = new Ghosts(this.e.scene);
      this.boxViews = new BoxViews(this.e.scene, (p, k, open) => this.e.boxMesh(PROD[p] ?? null, 0.5, 0.34, 0.38, open, k));
    }
    this.netOffs.push(net.onEvent((from, ev) => this.onNet(from, ev)));
    this.netOffs.push(
      net.onRoster((why, id) => {
        if (why === 'leave') this.remotes?.remove(id);
        if (why === 'join' && this.net?.host) this.sendInit(id);
        this.hud.players(net.peers.length);
      }),
    );
    this.hud.players(net.peers.length);
    if (n.host) this.sendInit();
    else net.send({ t: 'rdy' });
  }
  /** anfitrião → quem entrou (ou todos): a loja sem móveis/caixas (vêm logo depois, em 'fu'/'bx') */
  private sendInit(to?: string): void {
    const lite: ShopSave = { ...this.s, furn: [], boxes: [], trash: [], dirt: [], hist: [], sold: {} };
    this.net?.net.send({ t: 'init', s: lite, h: this.hour, ph: this.phase }, to);
    this.lastFu = '';
    this.lastMt = '';
    this.netT.sync = 0.8;
    this.netT.dirt = 1;
  }
  private onNet(from: string, ev: NetEvent): void {
    const n = this.net;
    if (!n || this.destroyed) return;
    if (ev.t === 'p') {
      this.remotes?.set(from, ev);
      return;
    }
    if (n.host) {
      if (ev.t === 'rdy') {
        this.lastFu = '';
        this.lastMt = '';
        this.netT.sync = 1;
        this.netT.dirt = 1;
      } else if (ev.t === 'want') this.sendInit(from);
      else if (ev.t === 'act') this.doAct(from, ev);
      return;
    }
    if (from !== n.net.hostId) return;
    if (ev.t === 'st') this.applySt(ev);
    else if (ev.t === 'fu') this.applyFu(ev);
    else if (ev.t === 'mt') this.applyMt(ev);
    else if (ev.t === 'bx' && Array.isArray(ev.l)) this.boxViews?.sync(ev.l as BoxRow[]);
  }
  /** anfitrião: executa o pedido de um convidado (validado como se fosse o próprio jogador) */
  private doAct(from: string, ev: NetEvent): void {
    const a = Array.isArray(ev.a) ? (ev.a as unknown[]) : [];
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
    const who = this.net?.net.peers.find((p) => p.id === from)?.name ?? 'Bloop';
    const note = (icon: string, what: string) => this.hud.banner(icon, t('pink.net.did', '{n}: {w}', { n: who, w: what }), 1800);
    switch (ev.o as ActO) {
      case 'order': {
        const cart: Record<string, number> = {};
        if (a[0] && typeof a[0] === 'object') for (const [k, v] of Object.entries(a[0] as Record<string, unknown>)) if (PROD[k] && Number.isFinite(num(v))) cart[k] = Math.max(0, Math.min(30, Math.floor(num(v))));
        if (this.order(cart)) note('cart', t('pink.net.ordered', 'pediu produtos'));
        break;
      }
      case 'renov':
        if (['walls', 'window', 'door', 'paint', 'floor', 'sign', 'light', 'grow', 'own'].includes(String(a[0])) && this.renov(String(a[0]) as Parameters<Shop['renov']>[0], (a[1] ?? undefined) as string | number | undefined)) note('paint', t('pink.net.renov', 'reformou a loja'));
        break;
      case 'hire':
        if (STAFF[a[0] as StaffKind]) this.hire(a[0] as StaffKind);
        break;
      case 'fire':
        this.fire(num(a[0]));
        break;
      case 'lic':
        if (CAT[a[0] as CatId]) this.buyLicense(a[0] as CatId);
        break;
      case 'tab':
        this.upgradeTablet();
        break;
      case 'price':
        if (PROD[String(a[0])] && Number.isFinite(num(a[1]))) this.setPrice(String(a[0]), Math.max(0.5, Math.min(1.5, num(a[1]))));
        break;
      case 'auto':
        this.setAuto(!!a[0]);
        break;
      case 'open':
        this.toggleOpen();
        break;
      case 'place':
      case 'move': {
        const x = num(a[1]);
        const z = num(a[2]);
        const r = ((Math.round(num(a[3])) % 4) + 4) % 4;
        if (!Number.isFinite(x + z + r) || Math.abs(x) > 20 || z > 0 || z < -20) break;
        if (ev.o === 'place') {
          const k = a[0] as FurnKind;
          const d = FURN[k];
          if (!d || this.s.lvl < d.lvl || !this.pay(d.price)) break;
          this.addFurn({ id: this.s.nextId++, k, x, z, r, s: [] }, true);
          this.addXp(5);
          sfx.play('place');
          note(d.icon, d.name);
        } else {
          const f = this.furn.find((q) => q.sv.id === num(a[0]));
          if (!f || this.build?.move === f) break;
          const slots = f.sv.s;
          this.removeFurn(f);
          this.addFurn({ id: f.sv.id, k: f.sv.k, x, z, r, s: slots }, true);
          sfx.play('place');
        }
        this.save();
        break;
      }
      case 'hit':
        this.wallHit();
        break;
      case 'mop': {
        const x = num(a[0]);
        const z = num(a[1]);
        const am = num(a[2]);
        if (Number.isFinite(x + z + am)) this.e.cleanAt(x, z, Math.min(2, Math.max(0, am)));
        break;
      }
    }
  }
  private applySt(ev: NetEvent): void {
    const s = this.s;
    const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const before = s.money;
    s.money = num(ev.m, s.money);
    s.xp = num(ev.xp, s.xp);
    const lv = num(ev.lv, s.lvl);
    if (lv > s.lvl && s.lvl > 0) {
      sfx.play('levelup');
      this.hud.banner('star', t('pink.levelUp', 'Nível {n}!', { n: lv }), 2200);
    }
    s.lvl = lv;
    s.day = num(ev.d, s.day);
    s.rep = num(ev.r, s.rep);
    this.hour = num(ev.h, this.hour);
    const ph = String(ev.ph) as Shop['phase'];
    if (['prep', 'open', 'closing', 'summary'].includes(ph) && ph !== this.phase) this.guestPhase(ph, num(ev.cn, 5));
    if (Array.isArray(ev.w)) this.ghosts?.sync(ev.w as GhostRow[]);
    if (Array.isArray(ev.dt)) this.e.syncDirt(ev.dt as [number, number, number, number][]);
    this.updateHudStatic(s.money > before + 0.5);
  }
  private sumPanel: HTMLDivElement | null = null;
  private guestPhase(ph: Shop['phase'], coins: number): void {
    const was = this.phase;
    this.phase = ph;
    if (ph === 'open') {
      sfx.play('door');
      music.setState('calm');
      this.hud.banner('open', t('pink.opened', 'Loja aberta!'), 1600);
    } else if (ph === 'closing') this.hud.banner('closed', t('pink.closing', 'Fechando... atenda quem ficou.'), 1800);
    else if (ph === 'summary') {
      this.o.onCoins(coins);
      music.setState('victory', { bars: 4 });
      sfx.play('levelup');
      if (!this.hud.overlay && !this.tablet) {
        const d = this.hud.panel(`<h2>${ic('moon', 30)}${esc(t('pink.dayEnd', 'Fim do dia {n}', { n: this.s.day }))}</h2>
          <div class="pk-stats"><div class="pk-stat">${ic('coin', 30)}<span>${esc(t('pink.sum.coins', 'Moedas Bloop'))}<b>+${coins}</b></span></div></div>
          <div style="font-weight:700">${esc(t('pink.net.waitNext', 'O líder começa o próximo dia.'))}</div>
          <div class="pk-row"><button class="pk-b g">${ic('check', 24)}${esc(t('pink.ok', 'Oba!'))}</button></div>`);
        this.sumPanel = d;
        d.querySelector('button')!.addEventListener('click', () => {
          if (this.hud.overlay === d) this.hud.closePanel();
        });
      }
    } else if (ph === 'prep' && was === 'summary') {
      if (this.sumPanel && this.hud.overlay === this.sumPanel) this.hud.closePanel();
      this.sumPanel = null;
      const ss = seasonAt(this.s.day);
      this.hud.banner(ss ? 'sparkle' : 'sun', ss ? ss.name : t('pink.dayN', 'Dia {n}', { n: this.s.day }), 2200);
    }
  }
  private applyFu(ev: NetEvent): void {
    const q = Number(ev.q);
    const i = Number(ev.i);
    const n = Number(ev.n);
    if (!Number.isInteger(i) || !Number.isInteger(n) || n < 1 || n > 40 || i < 0 || i >= n || !Array.isArray(ev.l)) return;
    if (!this.fuIn || this.fuIn.q !== q) this.fuIn = { q, parts: new Array(n), got: 0 };
    if (!this.fuIn.parts[i]) {
      this.fuIn.parts[i] = ev.l as FurnSave[];
      this.fuIn.got++;
    }
    if (this.fuIn.got < n) return;
    const list = this.fuIn.parts.flat().filter((f) => f && FURN[f.k] && Number.isFinite(f.x) && Number.isFinite(f.z));
    this.fuIn = null;
    const byId = new Map(list.map((f) => [f.id, f]));
    for (const f of [...this.furn]) {
      const nf = byId.get(f.sv.id);
      if (nf && nf.k === f.sv.k && nf.x === f.sv.x && nf.z === f.sv.z && nf.r === f.sv.r) continue;
      if (this.build?.move === f) this.cancelBuild();
      this.removeFurn(f);
    }
    const cell = (v: unknown): [string, number] | null => (Array.isArray(v) && PROD[v[0]] ? [v[0], Number(v[1]) || 0] : null);
    for (const nf of list) {
      const f = this.furn.find((x) => x.sv.id === nf.id);
      const st = Array.isArray(nf.s) ? nf.s : [];
      if (f) f.sv.s = f.slots.map((_, k) => cell(st[k]));
      else this.addFurn({ id: nf.id, k: nf.k, x: nf.x, z: nf.z, r: nf.r, s: st.map(cell) }, true);
    }
    this.fieldDirty = true;
    this.navDirty = true;
  }
  private applyMt(ev: NetEvent): void {
    const s = this.s;
    const m = ev as unknown as Partial<ShopSave>;
    if (m.renov && typeof m.renov === 'object' && JSON.stringify(m.renov) !== JSON.stringify(s.renov)) {
      s.renov = { ...s.renov, ...m.renov };
      this.store.apply(s.renov);
    }
    if (Array.isArray(m.lic)) s.lic = m.lic.filter((c) => typeof c === 'string');
    if (Array.isArray(m.staff)) s.staff = m.staff;
    if (m.prices && typeof m.prices === 'object') s.prices = m.prices;
    if (typeof m.tab === 'number') s.tab = m.tab;
    if (typeof m.auto === 'boolean') s.auto = m.auto;
    if (Array.isArray(m.goals)) s.goals = m.goals;
    if (typeof m.coupons === 'number') s.coupons = m.coupons;
    if (typeof m.tut === 'number') s.tut = m.tut;
    this.refreshGoals(false);
    this.updateHudStatic();
  }
  private netLast = 0;
  private netTick(frameDt: number): void {
    const n = this.net!;
    const net = n.net;
    const e = this.e;
    const T = this.netT;
    this.remotes?.update(frameDt, e.camera, (x, y, z) => e.toScreen(x, y, z));
    this.ghosts?.update(frameDt, e.camera);
    // ritmo da rede em tempo real (o dt do quadro é limitado a 50 ms: em aparelho lento o jogo anda devagar, a rede não)
    const now = performance.now();
    const dt = this.netLast ? Math.min(1, (now - this.netLast) / 1000) : frameDt;
    this.netLast = now;
    if (net.closed) return;
    const alone = net.peers.length < 2;
    T.p += dt;
    if (T.p >= 0.1 && !alone) {
      T.p = 0;
      net.send({ t: 'p', x: r2(e.fp.x), z: r2(e.fp.z), y: r2(e.fp.y), a: r2(e.fpc.yaw + Math.PI), s: r2(Math.hypot(e.fp.vx, e.fp.vz)) });
    }
    if (!n.host) {
      T.st += dt;
      const m = this.mopAcc;
      if (m && T.st >= 0.25) {
        T.st = 0;
        net.send({ t: 'act', o: 'mop', a: [r2(m.x), r2(m.z), r2(m.a)] });
        this.mopAcc = null;
      }
      return;
    }
    if (alone) return;
    const s = this.s;
    T.st += dt;
    if (T.st >= 0.2) {
      T.st = 0;
      const w: GhostRow[] = [];
      for (const c of this.custs) w.push(['c' + c.id, r2(c.w.x), r2(c.w.z), r2(c.w.yaw), r2(c.w.vel), c.w.look]);
      for (const st of this.staff) w.push(['s' + st.i, r2(st.w.x), r2(st.w.z), r2(st.w.yaw), r2(st.w.vel), st.w.look]);
      const msg: NetEvent = { t: 'st', m: r2(s.money), xp: s.xp, lv: s.lvl, d: s.day, h: r2(this.hour), ph: this.phase, r: r2(s.rep), w };
      if (this.phase === 'summary') msg.cn = this.lastCoins;
      T.dirt += 0.2;
      if (T.dirt >= 1) {
        T.dirt = 0;
        msg.dt = e.dirt.slice(0, 80).map((d) => [r2(d.x), r2(d.z), r2(d.a), DIRT_K.indexOf(d.k)]);
      }
      net.send(msg);
    }
    T.sync += dt;
    if (T.sync >= 1) {
      T.sync = 0;
      const fu = JSON.stringify(s.furn);
      if (fu !== this.lastFu) {
        this.lastFu = fu;
        const q = ++this.fuSeq;
        const parts = chunks(s.furn, 10);
        parts.forEach((l, i) => net.send({ t: 'fu', q, i, n: parts.length, l }));
      }
      const mt = { renov: s.renov, lic: s.lic, staff: s.staff, prices: s.prices, tab: s.tab, auto: s.auto, goals: s.goals, coupons: s.coupons, tut: s.tut };
      const ms = JSON.stringify(mt);
      if (ms !== this.lastMt) {
        this.lastMt = ms;
        net.send({ t: 'mt', ...mt });
      }
    }
    T.bx += dt;
    if (T.bx >= 0.5) {
      T.bx = 0;
      const l: BoxRow[] = [];
      for (const it of e.phys.items) if (it.kind === 'box' && l.length < 40) l.push(boxRow(String(it.data.p ?? ''), Number(it.data.n) || 0, !!it.data.open, it.body.position, it.body.quaternion));
      net.send({ t: 'bx', l });
    }
  }
  /** quantos Bloops na loja (grupo) */
  get players(): number {
    return this.net ? this.net.net.peers.length : 1;
  }

  /* =============================== salvar =============================== */
  toSave(): ShopSave {
    const s = this.s;
    s.boxes = [];
    for (const l of this.e.phys.items) if (l.kind === 'box' && l.data.p) s.boxes.push({ p: l.data.p as string, n: (l.data.n as number) ?? 0, x: l.body.position.x, y: l.body.position.y, z: l.body.position.z, open: !!l.data.open });
    const c = this.e.carry;
    if (c && c.kind === 'box' && c.data.p) s.boxes.push({ p: c.data.p as string, n: (c.data.n as number) ?? 0, x: this.e.fp.x, y: 0.5, z: this.e.fp.z, open: !!c.data.open });
    for (const st of this.staff) if (st.box && st.box.data.p) s.boxes.push({ p: st.box.data.p as string, n: (st.box.data.n as number) ?? 0, x: st.w.x, y: 0.5, z: st.w.z, open: true });
    // produtos soltos voltam numa caixa aberta (não some estoque)
    for (const l of this.e.phys.items) if (l.kind === 'item' && l.data.p) s.boxes.push({ p: l.data.p as string, n: 1, x: l.body.position.x, y: 0.3, z: l.body.position.z, open: true });
    s.trash = this.trashL.map((l) => ({ x: l.body.position.x, z: l.body.position.z }));
    if (c?.kind === 'trash') s.trash.push({ x: this.e.fp.x, z: this.e.fp.z });
    s.dirt = this.e.dirt.map((d) => ({ x: d.x, z: d.z, a: d.a, k: d.k }));
    // pedidos ainda não entregues viram caixas na próxima vez
    const [bx, bz] = this.backSpot();
    for (const o of this.pendingOrders) for (const [p, n] of o.boxes) s.boxes.push({ p, n, x: bx + Math.random() * 0.6, y: 0.5, z: bz, open: false });
    if (this.truck && this.truck.phase < 3) for (const [p, n] of this.truck.boxes) s.boxes.push({ p, n, x: bx + Math.random() * 0.6, y: 0.5, z: bz, open: false });
    return s;
  }
  save(): void {
    if (this.guest) return;
    this.o.onSave(this.toSave());
  }

  setPaused(p: boolean): void {
    this.e.paused = p;
    this.e.input.show(!p);
    this.hud.modal(p);
    this.lastLock = p;
  }

  /* =============================== testes =============================== */
  private debugApi(): Record<string, unknown> {
    return {
      shop: this,
      s: this.s,
      money: (n: number) => {
        this.s.money += n;
        this.updateHudStatic();
      },
      level: (n: number) => {
        this.s.lvl = n;
        this.updateHudStatic();
      },
      tut: (n: number) => (this.s.tut = n),
      place: (k: FurnKind, x: number, z: number, r = 0) => this.addFurn({ id: this.s.nextId++, k, x, z, r, s: [] }, true),
      fill: (pid?: string) => {
        const list = PRODUCTS.filter((p) => unlocked(p, this.s.lvl, this.s.lic));
        let i = 0;
        for (const f of this.furn)
          f.slots.forEach((sl) => {
            const p = pid ? PROD[pid] : list[i++ % list.length];
            f.sv.s[sl.i] = [p.id, capOf(p.shape)];
          });
        this.fieldDirty = true;
      },
      renov: (r: Partial<ShopSave['renov']>) => {
        Object.assign(this.s.renov, r);
        this.store.apply(this.s.renov);
      },
      open: () => this.toggleOpen(),
      cust: (n = 1) => {
        for (let i = 0; i < n; i++) this.spawnCust();
      },
      tablet: (tab?: TabletTab) => this.openTablet(tab),
      closeTablet: () => this.closeTablet(),
      tp: (x: number, z: number, yaw = 0, pitch = 0) => {
        this.e.fp.place(x, z);
        this.e.fpc.yaw = yaw;
        this.e.fpc.pitch = pitch;
      },
      box: (pid: string, x: number, z: number, open = false) => this.e.spawnBox(pid, PROD[pid].box, x, 0.5, z, { open }),
      carry: (pid: string, open = true) => {
        const l = this.e.spawnBox(pid, PROD[pid].box, this.e.fp.x, 0.5, this.e.fp.z, { open });
        this.e.pickUp(l);
      },
      trip: () => this.e.trip(),
      run: (on: boolean) => (this.e.running = on),
      hour: (h: number) => {
        this.hour = h;
        this.skyAt(h);
      },
      phase: () => this.phase,
      custs: () => this.custs.map((c) => ({ st: c.st, x: c.w.x, z: c.w.z, basket: c.basket.length })),
      serveNow: () => {
        const ck = this.furn.find((f) => f.queue[0]?.w.arrived);
        if (ck) this.serve(ck);
        return !!ck;
      },
      ckAuto: () => this.ck?.autoComplete(),
      scores: () => ({ ...this.scores }),
      hire: (k: StaffKind) => this.hire(k),
      order: (cart: Record<string, number>) => this.order(cart),
      dirt: (x: number, z: number, k: 'dirt' | 'spill' | 'glass' | 'mud' = 'spill') => this.e.addDirt(x, z, k, 1),
      cam: (m: 'fp' | 'tp' | 'front') => this.e.camv.set(m),
      endDay: () => this.endDay(),
      save: () => this.toSave(),
      /** simula N segundos sem desenhar (testes em GPU por software) */
      sim: (sec: number) => {
        for (let i = 0; i < sec * 30; i++) {
          this.e.time += 1 / 30;
          this.frame(1 / 30);
        }
      },
    };
  }

  dispose(): void {
    this.destroyed = true;
    for (const f of this.netOffs) f();
    this.netOffs = [];
    this.remotes?.dispose();
    this.ghosts?.dispose();
    this.boxViews?.dispose();
    this.closeTablet();
    this.ck?.cancel();
    this.endBuild();
    for (const c of this.custs) c.w.dispose();
    for (const s of this.staff) s.w.dispose();
    this.hud.dispose();
    this.field.dispose();
    this.store.dispose();
    this.e.dispose();
  }
}

/* ------------------------------ util ------------------------------ */
function pickW<T>(list: T[], w: number[]): T | null {
  if (!list.length) return null;
  const tot = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * tot;
  for (let i = 0; i < list.length; i++) {
    r -= w[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}
import { productMesh } from './products';
function productMeshCached(sh: Shop, p: Product): THREE.Object3D {
  return productMesh(sh.e.kit, p);
}
/** confete em DOM (barato) */
export function confetti(host: HTMLElement): void {
  const cols = ['#ff5fa2', '#ffd34a', '#8fdcff', '#c3a6ff', '#5ee08a', '#ffffff'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.style.cssText = `position:absolute;left:${50 + (Math.random() - 0.5) * 20}%;top:40%;width:8px;height:12px;background:${cols[i % cols.length]};border-radius:2px;pointer-events:none;z-index:30`;
    host.appendChild(p);
    const a = Math.random() * Math.PI * 2;
    const v = 120 + Math.random() * 260;
    p.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px,${Math.sin(a) * v + 240}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    window.setTimeout(() => p.remove(), 2100);
  }
}
export { BRAND_NAME, PAINTS, SLOT_W, fmt };
