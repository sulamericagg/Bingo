/* ============================================================
 *  CASA 3D · ATIVIDADES — COZINHA LIVRE
 *  Geladeira → ingredientes com física. Tábua (CORTAR: fatias → cubinhos).
 *  Fogão: frigideira (frita, doura, queima, PEGA FOGO), panela (sopa,
 *  transborda), forno (assa; junta massa → bolo/pizza). Liquidificador
 *  (sem tampa se encher demais!). Pia + escorredor. Lixeira. Extintor.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { t } from '../../i18n';
import { sfx } from '../sfx';
import type { ItemRec } from '../engine';
import type { ActDef } from '../ui';
import { hitBox, itemHit, v3, type Ctx, type Spot } from './core';
import { BURNT, ING, INGS, ingName, madeName, type Bit, type Method } from './data';
import type { Dishes } from './dishes';
import { blenderGeo, boardGeo, flameGeo, jarGeo, panGeo, potGeo, rackGeo, trashGeo } from './models';
import type { Prop } from './props';
import { Fixture, freeSpot, ringShapes, Rig } from './spots';
import { bump } from './store';
import { ingColor } from './ui';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const UPN = new THREE.Vector3(0, 1, 0);
const NOT_CHOP = new Set(['leite', 'farinha', 'arroz', 'macarrao', 'chocolate']);

function addM(p: { m: Method[] }, m: Method): void {
  if (!p.m.includes(m)) p.m.push(m);
}

/* =================================================================== */
class Stove {
  rig: Rig;
  on = false;
  panL: THREE.Vector3;
  potL: THREE.Vector3;
  pot: Prop[] = [];
  potT = 0;
  oven: Prop[] = [];
  ovenT = 0;
  fire: { g: THREE.Group; hp: number; t: number; soot: number } | null = null;
  private flames: THREE.Mesh[] = [];
  private rings: THREE.Mesh[] = [];
  private liquid: THREE.Mesh;
  private ovenGlow: THREE.Mesh;
  private fxT = 0;
  private sizzleT = 0;
  private stirring = 0;
  private lastPoint = new THREE.Vector3();
  private ovenWarned = 0;
  spots: Spot[];

  constructor(
    readonly k: Kitchen,
    item: ItemRec,
  ) {
    const ctx = k.ctx;
    this.rig = new Rig(ctx.eng, item);
    const { w, h, d } = this.rig;
    this.panL = v3(-w * 0.22, h, d * 0.2);
    this.potL = v3(w * 0.22, h, -d * 0.2);
    const pan = new THREE.Mesh(panGeo(), k.mat);
    pan.position.copy(this.panL);
    const pot = new THREE.Mesh(potGeo(), k.mat);
    pot.position.copy(this.potL);
    this.rig.root.add(pan, pot);
    // chamas azuis do queimador (ligado)
    for (const L of [this.panL, this.potL]) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.012, 5, 18), new THREE.MeshBasicMaterial({ color: '#5ab0ff', toneMapped: false }));
      r.rotation.x = Math.PI / 2;
      r.position.copy(L).setY(L.y + 0.004);
      r.visible = false;
      this.rig.root.add(r);
      this.rings.push(r);
    }
    this.liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.124, 0.124, 0.012, 18), new THREE.MeshLambertMaterial({ color: '#bfe6ff' }));
    this.liquid.position.copy(this.potL).setY(this.potL.y + 0.1);
    this.liquid.visible = false;
    this.rig.root.add(this.liquid);
    this.ovenGlow = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, h * 0.36), new THREE.MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
    this.ovenGlow.position.set(0, 0.15 + h * 0.225, d / 2 + 0.013);
    this.rig.root.add(this.ovenGlow);
    this.rig.addBody(this.panL.clone(), ringShapes(0.15, 0.06, 8));
    this.rig.addBody(this.potL.clone(), ringShapes(0.135, 0.18, 10));
    const panBox = { min: v3(this.panL.x - 0.17, h - 0.02, this.panL.z - 0.17), max: v3(this.panL.x + 0.3, h + 0.14, this.panL.z + 0.17) };
    const potBox = { min: v3(this.potL.x - 0.17, h - 0.02, this.potL.z - 0.17), max: v3(this.potL.x + 0.17, h + 0.24, this.potL.z + 0.17) };
    const self = this;
    const toggle = (): ActDef => ({ id: 'k-stove', label: this.on ? t('act.btn.stoveOff', 'DESLIGAR FOGÃO') : t('act.btn.stoveOn', 'LIGAR FOGÃO'), icon: 'fix' });
    const fireActs = (h: Prop | null): ActDef[] => (this.fire && h?.kind !== 'ext' ? [{ id: 'k-fire', label: t('act.btn.fire', 'APAGAR FOGO!'), icon: 'clean', size: 'big' }] : []);
    this.spots = [
      {
        id: 'stove',
        hit(_ray, tg) {
          const d = itemHit(item, tg);
          if (d !== null) self.lastPoint.copy(tg.point);
          return d;
        },
        label: () => t('act.lbl.stove', 'Fogão') + (this.fire ? ' · ' + t('act.lbl.fire', 'PEGANDO FOGO!') : this.on ? ' · ' + t('act.lbl.on', 'ligado') : '') + (this.oven.length ? ' · ' + t('act.lbl.oven', 'forno: {n}', { n: this.oven.length }) : ''),
        acts: (h) => {
          const L = fireActs(h);
          if (!h) {
            L.push({ ...toggle(), size: L.length ? undefined : 'big' });
            if (this.oven.length) L.push({ id: 'k-oven', label: t('act.btn.ovenOpen', 'ABRIR FORNO'), icon: 'grab' });
          }
          return L;
        },
        tap: (id) => this.tap(id),
        place: (p) => (k.ctx.props.isFood(p) ? (this.isOvenPoint() ? this.rig.world(0, 0.35, this.rig.d / 2 + 0.05) : this.rig.world(this.panL.x, this.panL.y + 0.18, this.panL.z)) : null),
        placeLabel: () => (this.isOvenPoint() ? t('act.btn.inOven', 'NO FORNO') : t('act.btn.inPan', 'NA FRIGIDEIRA')),
      },
      {
        id: 'pan',
        hit: (ray) => hitBox(ray, this.rig.root, panBox.min, panBox.max),
        label: () => {
          const n = this.inPan().length;
          const burnt = this.inPan().some((p) => p.cook >= BURNT);
          return t('act.lbl.pan', 'Frigideira') + (this.fire ? ' · ' + t('act.lbl.fire', 'PEGANDO FOGO!') : burnt ? ' · ' + t('act.lbl.burning', 'queimando!') : n ? (this.on ? ' · ' + t('act.lbl.frying', 'fritando') : ' · ' + t('act.lbl.items', '{n} coisas', { n })) : ' · ' + t('act.lbl.empty', 'vazia'));
        },
        acts: (h) => {
          const L = fireActs(h);
          if (!h) {
            L.push({ ...toggle(), size: L.length ? undefined : 'big' });
            if (this.inPan().length) L.push({ id: 'k-stirpan', label: t('act.btn.stir', 'MEXER'), icon: 'rotate', hold: true });
          }
          return L;
        },
        tap: (id) => this.tap(id),
        hold: (id, dt) => id === 'k-stirpan' && this.stir(dt, true),
        place: (p) => (k.ctx.props.isFood(p) ? this.rig.world(this.panL.x, this.panL.y + 0.18, this.panL.z) : null),
        placeLabel: () => t('act.btn.inPan', 'NA FRIGIDEIRA'),
      },
      {
        id: 'pot',
        hit: (ray) => hitBox(ray, this.rig.root, potBox.min, potBox.max),
        label: () => t('act.lbl.pot', 'Panela') + (this.pot.length ? ' · ' + (this.on ? t('act.lbl.boiling', 'fervendo') + ' · ' : '') + t('act.lbl.items', '{n} coisas', { n: this.pot.length }) : ' · ' + t('act.lbl.empty', 'vazia')),
        acts: (h) => {
          const L = fireActs(h);
          if (!h) {
            if (this.pot.length && this.potT >= 0.45) L.push({ id: 'k-soup', label: t('act.btn.serveSoup', 'SERVIR'), icon: 'eat', size: 'big' });
            L.push({ ...toggle(), size: L.length ? undefined : 'big' });
            if (this.pot.length) L.push({ id: 'k-stirpot', label: t('act.btn.stir', 'MEXER'), icon: 'rotate', hold: true });
          }
          return L;
        },
        tap: (id) => this.tap(id),
        hold: (id, dt) => id === 'k-stirpot' && this.stir(dt, false),
        place: (p) => (k.ctx.props.isFood(p) ? this.rig.world(this.potL.x, this.potL.y + 0.4, this.potL.z) : null),
        placeLabel: () => t('act.btn.inPot', 'NA PANELA'),
      },
    ];
  }
  private isOvenPoint(): boolean {
    const l = this.rig.local(this.lastPoint, V2);
    return l.y < this.rig.h * 0.72 && l.z > 0;
  }
  firePos(out = new THREE.Vector3()): THREE.Vector3 {
    return this.rig.world(this.panL.x, this.panL.y + 0.1, this.panL.z, out);
  }
  inPan(): Prop[] {
    const c = this.rig.world(this.panL.x, this.panL.y, this.panL.z, V);
    return this.k.ctx.props.list.filter((p) => !p.held && !p.hidden && this.k.ctx.props.isFood(p) && p.obj.position.y > c.y - 0.03 && p.obj.position.y < c.y + 0.3 && Math.hypot(p.obj.position.x - c.x, p.obj.position.z - c.z) < 0.17);
  }
  tap(id: string): boolean {
    const ctx = this.k.ctx;
    switch (id) {
      case 'k-stove':
        this.on = !this.on;
        sfx.click();
        if (this.on) (sfx.fire(), ctx.ui.hint(t('act.hint.stoveOn', 'Fogo ligado! Jogue coisas na frigideira ou na panela'), 2200));
        return true;
      case 'k-fire':
        this.k.grabExtinguisher();
        return true;
      case 'k-oven':
        this.openOven();
        return true;
      case 'k-soup':
        this.serveSoup();
        return true;
    }
    return false;
  }
  private stir(dt: number, pan: boolean): void {
    const ctx = this.k.ctx;
    ctx.pose('spoon');
    ctx.fps.hand.stir = 1;
    this.stirring = 0.2;
    this.fxT -= dt;
    if (this.fxT > 0) return;
    this.fxT = 0.12;
    if (pan) {
      for (const p of this.inPan()) p.body?.velocity.set((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6), p.body?.wakeUp();
      sfx.sizzle();
    } else {
      const c = this.rig.world(this.potL.x, this.potL.y + 0.12, this.potL.z, V);
      ctx.eng.burst(c.x, c.y, c.z, 3, 'foam', '#e8f6ff', 0.5);
      sfx.bubble();
    }
  }
  private serveSoup(): void {
    const ctx = this.k.ctx;
    const bits: Bit[] = this.pot.map((p) => ({ ...ctx.props.bit(p), cook: Math.max(p.cook, this.potT), m: [...new Set<Method>([...p.m, 'boil'])] }));
    for (const p of this.pot) ctx.props.remove(p);
    this.pot = [];
    this.potT = 0;
    this.liquid.visible = false;
    const bowl = ctx.props.spawn('bowl', {}, ctx.front(0.5, -0.2));
    this.k.dishes.fill(bowl, bits);
    ctx.hand(bowl);
  }
  private openOven(): void {
    const ctx = this.k.ctx;
    const items = this.oven;
    this.oven = [];
    const T = this.ovenT;
    this.ovenT = 0;
    this.ovenWarned = 0;
    const has = (id: string) => items.find((p) => p.ing === id);
    const out = this.rig.world(0, 0.45, this.rig.d / 2 + 0.25);
    let made: string | null = null;
    let used: Prop[] = [];
    if (T >= 0.45 && has('farinha') && (has('ovo') || items.some((p) => p.made === 'friedegg'))) {
      made = has('chocolate') ? 'choccake' : 'cake';
      used = items.filter((p) => ['farinha', 'ovo', 'leite', 'chocolate'].includes(p.ing) || p.made === 'friedegg');
    } else if (T >= 0.45 && has('farinha') && has('queijo') && has('tomate')) {
      made = 'pizza';
      used = items.filter((p) => ['farinha', 'queijo', 'tomate', 'cogumelo', 'pimentao', 'cebola', 'milho'].includes(p.ing));
    }
    const rest = items.filter((p) => !used.includes(p));
    for (const p of used) ctx.props.remove(p);
    sfx.whoosh();
    ctx.eng.burst(out.x, out.y, out.z, 10, 'poof', T > 1.8 ? '#555060' : '#fff2e0', 1);
    if (made) {
      const m = ctx.props.spawn('made', { made, cook: Math.min(T, 1.9), m: ['bake'] }, out);
      ctx.hand(m);
      ctx.ui.hint(T > 1.8 ? t('act.hint.ovenBurnt', 'Saiu do forno... meio tostado!') : t('act.hint.ovenMade', 'Saiu do forno: {n}!', { n: made === 'pizza' ? t('act.made.pizza', 'Pizza') : t('act.made.cake', 'Bolo') }), 2200);
    }
    rest.forEach((p, i) => {
      p.cook = Math.max(p.cook, T);
      if (T >= 0.45) addM(p, 'bake');
      ctx.props.tint(p);
      ctx.props.unhide(p, out.clone().add(v3((i % 3) * 0.08 - 0.08, i * 0.05, 0)), v3((Math.random() - 0.5) * 0.8, 1.5, 1.4));
    });
  }
  /** chamado pela ação COLOCAR / por cair no forno */
  toOven(p: Prop): void {
    this.k.ctx.props.hide(p);
    this.oven.push(p);
    sfx.drop();
  }
  update(dt: number): void {
    const ctx = this.k.ctx;
    const props = ctx.props;
    this.rig.follow();
    if (!this.rig.root.visible) return;
    this.stirring -= dt;
    for (const r of this.rings) {
      r.visible = this.on;
      if (this.on) r.scale.setScalar(1 + Math.sin(ctx.eng.time * 30 + r.id) * 0.04);
    }
    const pan = this.inPan();
    // ovo cai na frigideira → quebra; milho estoura; massa vira panqueca
    for (const p of pan) {
      if (p.ing === 'ovo' && !p.made && p.cut === 0 && p.kind === 'ing') {
        const pos = p.obj.position.clone();
        props.remove(p);
        props.spawn('made', { made: 'friedegg', ing: 'ovo', cook: p.cook }, pos.setY(pos.y + 0.02));
        sfx.splat();
        ctx.ui.hint(t('act.hint.egg', 'Crec! Ovo na frigideira'), 1400);
        return;
      }
    }
    if (this.on && pan.length) {
      const has = (id: string) => pan.find((p) => p.ing === id && (p.kind === 'ing' || p.made === 'friedegg'));
      const fl = has('farinha'),
        eg = pan.find((p) => p.ing === 'ovo'),
        mk = has('leite');
      if (fl && eg && mk) {
        const pos = fl.obj.position.clone();
        for (const p of [fl, eg, mk]) props.remove(p);
        props.spawn('made', { made: 'pancake', cook: 0.2, m: ['fry'] }, pos.setY(pos.y + 0.05));
        ctx.ui.hint(t('act.hint.pancake', 'Virou massa de panqueca!'), 1600);
        sfx.swish();
        return;
      }
      const slow = this.stirring > 0 ? 0.65 : 1;
      let maxCook = 0;
      for (const p of pan) {
        const before = p.cook;
        p.cook += (dt / 7) * (p.cook > 0.9 ? slow : 1);
        if (p.cook >= 0.45) addM(p, 'fry');
        props.tint(p);
        maxCook = Math.max(maxCook, p.cook);
        if (before < 1 && p.cook >= 1) ctx.ui.hint(t('act.hint.done', '{n} no ponto! Tire antes que queime', { n: p.made ? madeName(p.made) : ingName(p.ing) }), 1800, 1);
        if (before < BURNT && p.cook >= BURNT) ctx.ui.hint(t('act.hint.burning', 'Cheiro de queimado!!'), 2000, 2, true);
        if (p.ing === 'milho' && p.kind === 'ing' && p.cook > 0.6) {
          this.popcorn(p);
          return;
        }
      }
      if (maxCook > 2.2 && !this.fire) this.startFire();
      this.sizzleT -= dt;
      if (this.sizzleT <= 0) {
        this.sizzleT = 0.45;
        sfx.sizzle();
      }
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.12;
        const c = this.rig.world(this.panL.x, this.panL.y + 0.06, this.panL.z, V);
        const smoke = maxCook > 1.2;
        ctx.eng.emit(c.x + (Math.random() - 0.5) * 0.15, c.y, c.z + (Math.random() - 0.5) * 0.15, 0, 0.4, 0, { tile: 2, color: smoke ? '#4a4466' : '#ffffff', life: 1.2, size: smoke ? 0.16 : 0.08, grow: 0.25 });
      }
    }
    // panela: engole o que cai dentro
    const pc = this.rig.world(this.potL.x, this.potL.y, this.potL.z, V2);
    for (const p of props.list) {
      if (p.held || p.hidden || !props.isFood(p)) continue;
      const o = p.obj.position;
      if (o.y > pc.y + 0.03 && o.y < pc.y + 0.55 && Math.hypot(o.x - pc.x, o.z - pc.z) < 0.125) {
        props.hide(p);
        this.pot.push(p);
        ctx.eng.burst(pc.x, pc.y + 0.15, pc.z, 6, 'foam', '#bfe6ff', 0.8);
        sfx.bubble();
        if (this.pot.length > 9) this.overflow();
        break;
      }
    }
    if (this.pot.length) {
      this.liquid.visible = true;
      (this.liquid.material as THREE.MeshLambertMaterial).color.copy(this.k.dishes.mixColor(this.pot.map((p) => props.bit(p)), '#bfe6ff', 0.4 - Math.min(0.3, this.potT * 0.2)));
      this.liquid.position.y = this.potL.y + 0.06 + Math.min(0.1, this.pot.length * 0.012);
      if (this.on) {
        const before = this.potT;
        this.potT += dt / 8;
        if (before < 1 && this.potT >= 1) ctx.ui.hint(t('act.hint.soup', 'A panela está pronta: SERVIR'), 2000, 1);
        if (Math.random() < dt * 8) ctx.eng.emit(pc.x + (Math.random() - 0.5) * 0.18, this.liquid.getWorldPosition(V).y + 0.01, pc.z + (Math.random() - 0.5) * 0.18, 0, 0.25, 0, { tile: 0, color: '#ffffff', life: 0.4, size: 0.035 });
        if (Math.random() < dt * 2) ctx.eng.emit(pc.x, pc.y + 0.25, pc.z, 0, 0.5, 0, { tile: 2, color: '#ffffff', life: 1.4, size: 0.12, grow: 0.3 });
        if (Math.random() < dt * 3) sfx.bubble();
      }
    } else this.liquid.visible = false;
    // forno
    const glow = this.ovenGlow.material as THREE.MeshBasicMaterial;
    glow.opacity += ((this.on && this.oven.length ? 0.6 + Math.sin(ctx.eng.time * 5) * 0.08 : 0) - glow.opacity) * Math.min(1, dt * 4);
    if (this.on && this.oven.length) {
      const before = this.ovenT;
      this.ovenT += dt / 9;
      if (before < 1 && this.ovenT >= 1) (ctx.ui.hint(t('act.hint.ovenReady', 'Plim! O forno está pronto'), 2200, 1), sfx.catch());
      if (this.ovenT > 1.8) {
        if (!this.ovenWarned) (this.ovenWarned = 1, ctx.ui.hint(t('act.hint.ovenSmoke', 'Fumaça saindo do forno!'), 2200, 2, true));
        if (Math.random() < dt * 5) {
          const o = this.rig.world(0, this.rig.h * 0.7, this.rig.d / 2 + 0.05, V);
          ctx.eng.emit(o.x, o.y, o.z, 0, 0.5, 0.2, { tile: 2, color: '#4a4466', life: 1.4, size: 0.14, grow: 0.3 });
        }
      }
    }
    // fogo
    if (this.fire) this.updateFire(dt);
  }
  private popcorn(corn: Prop): void {
    const ctx = this.k.ctx;
    const pos = corn.obj.position.clone();
    ctx.props.remove(corn);
    const n = ctx.eng.q.tier <= 1 ? 6 : 10;
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!ctx.props) return;
        ctx.props.spawn('made', { made: 'popcorn', cook: 1, m: ['fry'] }, pos.clone().add(v3(0, 0.05, 0)), v3((Math.random() - 0.5) * 3, 2.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3));
        sfx.pop();
      }, i * 110);
    }
    ctx.ui.hint(t('act.hint.popcorn', 'PIPOCA! Pra todo lado!'), 2000, 1);
    bump('fun', 6);
  }
  private overflow(): void {
    const ctx = this.k.ctx;
    const c = this.rig.world(this.potL.x, this.potL.y + 0.5, this.potL.z);
    for (let i = 0; i < 2; i++) {
      const p = this.pot.shift();
      if (p) ctx.props.unhide(p, c.clone().add(v3(0, i * 0.1, 0)), v3((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2));
    }
    ctx.props.splat('juice', this.rig.world(this.potL.x + 0.2, this.rig.h + 0.001, this.potL.z + 0.15), UPN, 18);
    ctx.ui.hint(t('act.hint.overflow', 'Transbordou! Panela cheia demais'), 2000, 1);
    sfx.splat();
  }
  private startFire(): void {
    const ctx = this.k.ctx;
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(flameGeo(), ctx.props.glowMat);
      f.position.set((i - 1) * 0.07, 0, (i % 2) * 0.05 - 0.02);
      f.scale.setScalar(0.8 + i * 0.2);
      g.add(f);
      this.flames.push(f);
    }
    g.position.copy(this.panL).setY(this.panL.y + 0.03);
    this.rig.root.add(g);
    this.fire = { g, hp: 1, t: 0, soot: 0 };
    sfx.fire();
    ctx.ui.hint(t('act.hint.fire', 'FOGO!! Pegue o extintor!'), 3000, 3, true);
  }
  private updateFire(dt: number): void {
    const f = this.fire!;
    const ctx = this.k.ctx;
    f.t += dt;
    this.flames.forEach((m, i) => {
      const s = (0.85 + i * 0.2) * (0.75 + 0.25 * Math.sin(ctx.eng.time * (13 + i * 3) + i)) * (0.4 + 0.6 * f.hp);
      m.scale.set(s, s * (1.1 + 0.3 * Math.sin(ctx.eng.time * 9 + i)), s);
    });
    const p = this.firePos(V);
    if (Math.random() < dt * 14) ctx.eng.emit(p.x + (Math.random() - 0.5) * 0.2, p.y + 0.2, p.z + (Math.random() - 0.5) * 0.2, 0, 0.9, 0, { tile: 2, color: '#3a3550', life: 1.8, size: 0.2, grow: 0.45 });
    if (Math.random() < dt * 10) ctx.eng.emit(p.x, p.y + 0.15, p.z, (Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6, { tile: 1, color: '#ffb02e', life: 0.6, size: 0.06, grav: -0.5 });
    if (Math.random() < dt * 1.5) sfx.fire();
    for (const q of this.inPan()) (q.cook = Math.max(q.cook, 2.3)), ctx.props.tint(q);
    f.soot -= dt;
    if (f.t > 6 && f.soot <= 0) {
      f.soot = 6;
      // fuligem em cima do fogão (desenho animado, sem estrago de verdade)
      ctx.props.splat('mud', this.rig.world((Math.random() - 0.5) * this.rig.w * 0.6, this.rig.h + 0.002, (Math.random() - 0.5) * this.rig.d * 0.5), UPN, 16);
    }
  }
  /** jato do extintor: devolve true se acertou o fogo */
  spray(o: THREE.Vector3, dir: THREE.Vector3, dt: number): boolean {
    if (!this.fire) return false;
    const p = this.firePos(V);
    const to = V2.copy(p).sub(o);
    const dist = to.length();
    if (dist > 3.2 || to.normalize().dot(dir) < 0.9) return false;
    this.fire.hp -= dt * 0.75;
    const ctx = this.k.ctx;
    ctx.eng.burst(p.x, p.y + 0.05, p.z, 3, 'foam', '#ffffff', 0.9);
    if (this.fire.hp <= 0) {
      this.rig.root.remove(this.fire.g);
      this.flames = [];
      this.fire = null;
      this.on = false;
      ctx.props.splat('frosting', this.rig.world(this.panL.x, this.rig.h + 0.003, this.panL.z + 0.05), UPN, 26);
      ctx.ui.hint(t('act.hint.fireOut', 'Fogo apagado! Ufa!'), 2200, 3);
      ctx.ui.showCard(t('act.card.hero', 'Bombeiro da cozinha'), 0, t('act.dish.coins', '+{c} moedas', { c: ctx.coin(3) }), 2000);
      sfx.clean();
      bump('fun', 8);
    }
    return true;
  }
  dispose(): void {
    for (const p of [...this.pot, ...this.oven]) this.k.ctx.props.remove(p);
    for (const r of this.rings) (r.geometry.dispose(), (r.material as THREE.Material).dispose());
    this.liquid.geometry.dispose();
    (this.liquid.material as THREE.Material).dispose();
    this.ovenGlow.geometry.dispose();
    (this.ovenGlow.material as THREE.Material).dispose();
    this.rig.dispose();
  }
}

/* =================================================================== */
/** tábua + liquidificador em cima de um balcão/mesa */
class Prep {
  rig: Rig;
  boardL: THREE.Vector3;
  blendL: THREE.Vector3;
  blend: Prop[] = [];
  blending = 0;
  private jar: THREE.Mesh;
  private juice: THREE.Mesh;
  private chopT = 0;
  private chops = new Map<number, number>();
  spots: Spot[];

  constructor(
    readonly k: Kitchen,
    item: ItemRec,
  ) {
    this.rig = new Rig(k.ctx.eng, item);
    const { w, h, d } = this.rig;
    this.boardL = v3(-w / 2 + 0.27, h, 0.02);
    this.blendL = v3(w / 2 - 0.16, h, -d / 2 + 0.16);
    const board = new THREE.Mesh(boardGeo(), k.mat);
    board.position.copy(this.boardL);
    const base = new THREE.Mesh(blenderGeo(), k.mat);
    base.position.copy(this.blendL);
    this.jar = new THREE.Mesh(jarGeo(), k.ctx.props.glassMat);
    this.jar.position.copy(this.blendL).setY(h + 0.145);
    this.juice = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.055, 1, 14), new THREE.MeshLambertMaterial({ color: '#ff9a2e' }));
    this.juice.visible = false;
    this.rig.root.add(board, base, this.jar, this.juice);
    this.rig.addBody(this.boardL.clone(), [[new CANNON.Box(new CANNON.Vec3(0.21, 0.0125, 0.14)), new CANNON.Vec3(0, 0.0125, 0)]]);
    this.rig.addBody(this.blendL.clone(), [[new CANNON.Box(new CANNON.Vec3(0.09, 0.075, 0.09)), new CANNON.Vec3(0, 0.075, 0)], ...ringShapes(0.085, 0.25, 8, false).map(([s, o, q]) => [s, new CANNON.Vec3(o.x, o.y + 0.15, o.z), q] as [CANNON.Shape, CANNON.Vec3, CANNON.Quaternion?])]);
    // caixas de mira generosas (dedão no celular): pegam também a frente do tampo
    const bMin = v3(this.boardL.x - 0.25, h - 0.25, this.boardL.z - 0.18),
      bMax = v3(this.boardL.x + 0.25, h + 0.2, Math.max(this.boardL.z + 0.18, d / 2 + 0.04));
    const lMin = v3(this.blendL.x - 0.13, h - 0.2, this.blendL.z - 0.13),
      lMax = v3(this.blendL.x + 0.13, h + 0.45, Math.max(this.blendL.z + 0.13, d / 2 + 0.04));
    this.spots = [
      {
        id: 'board',
        hit: (ray) => hitBox(ray, this.rig.root, bMin, bMax),
        label: () => t('act.lbl.board', 'Tábua de cortar') + (this.onBoard().length ? ' · ' + this.onBoard().map((p) => (p.made ? '' : ingName(p.ing))).filter(Boolean).slice(0, 2).join(', ') : ''),
        acts: (h) => (h ? [] : this.onBoard().length ? [{ id: 'k-chop', label: t('act.btn.chop', 'CORTAR'), icon: 'break', size: 'big', hold: true }] : []),
        hold: (id, dt) => id === 'k-chop' && this.chop(dt),
        place: (p) => (k.ctx.props.isFood(p) ? this.rig.world(this.boardL.x, this.boardL.y + 0.12, this.boardL.z) : null),
        placeLabel: () => t('act.btn.onBoard', 'NA TÁBUA'),
      },
      {
        id: 'blender',
        hit: (ray) => hitBox(ray, this.rig.root, lMin, lMax),
        label: () => t('act.lbl.blender', 'Liquidificador') + (this.blend.length ? ' · ' + t('act.lbl.items', '{n} coisas', { n: this.blend.length }) : ' · ' + t('act.lbl.empty', 'vazio')),
        acts: (h) => (!h && this.blend.length && this.blending <= 0 ? [{ id: 'k-blend', label: t('act.btn.blend', 'BATER'), icon: 'rotate', size: 'big' }] : []),
        tap: (id) => (id === 'k-blend' ? (this.startBlend(), true) : false),
        place: (p) => (k.ctx.props.isFood(p) ? this.rig.world(this.blendL.x, this.blendL.y + 0.55, this.blendL.z) : null),
        placeLabel: () => t('act.btn.inBlender', 'NO LIQUIDIFICADOR'),
      },
    ];
  }
  onBoard(): Prop[] {
    const L = this.k.ctx.props.list;
    return L.filter((p) => {
      if (p.held || p.hidden || !this.k.ctx.props.isFood(p)) return false;
      const l = this.rig.local(p.obj.position, V);
      return Math.abs(l.x - this.boardL.x) < 0.23 && Math.abs(l.z - this.boardL.z) < 0.16 && l.y > this.boardL.y - 0.02 && l.y < this.boardL.y + 0.3;
    });
  }
  private chop(dt: number): void {
    const ctx = this.k.ctx;
    ctx.pose('knife');
    ctx.fps.hand.chop = 1;
    this.chopT -= dt;
    if (this.chopT > 0) return;
    this.chopT = 0.2;
    const list = this.onBoard().sort((a, b) => a.cut - b.cut);
    const p = list.find((q) => q.kind === 'ing' && q.cut < 2) ?? list[0];
    if (!p) return;
    sfx.chop();
    const pos = p.obj.position;
    ctx.eng.burst(pos.x, pos.y + 0.03, pos.z, 3, 'chunk', ING.get(p.ing)?.flesh ?? '#ffffff', 0.8);
    if (p.kind !== 'ing' || p.cut >= 2) {
      if (p.made !== 'popcorn') ctx.ui.hint(t('act.hint.chopMax', 'Já está bem picadinho!'), 1200);
      return;
    }
    if (NOT_CHOP.has(p.ing)) {
      ctx.ui.hint(t('act.hint.noChop', 'Isso não se corta... mas pode ir na panela!'), 1500);
      p.body?.velocity.set(0, 1.5, 0);
      p.body?.wakeUp();
      return;
    }
    const n = (this.chops.get(p.uid) ?? 0) + 1;
    this.chops.set(p.uid, n);
    if (p.ing === 'ovo') {
      // ovo na tábua: crec!
      const at = pos.clone();
      ctx.props.remove(p);
      ctx.props.spawn('made', { made: 'friedegg', ing: 'ovo', cook: 0 }, at.setY(at.y + 0.02));
      ctx.props.splat('juice', at.clone().setY(this.rig.h + 0.03), UPN, 12);
      ctx.ui.hint(t('act.hint.eggBoard', 'Crec! Ovo quebrado na tábua...'), 1500);
      return;
    }
    if (n < 2) return;
    this.chops.delete(p.uid);
    const at = pos.clone();
    const pieces = p.cut === 0 ? 3 : 2;
    const o = { ing: p.ing, cut: p.cut + 1, cook: p.cook, m: p.m, garden: p.garden };
    ctx.props.remove(p);
    for (let i = 0; i < pieces; i++) {
      const q = ctx.props.spawn('ing', o, at.clone().add(v3((i - (pieces - 1) / 2) * 0.05, 0.03, (Math.random() - 0.5) * 0.04)), v3((i - (pieces - 1) / 2) * 0.25, 0.5 + Math.random() * 0.3, (Math.random() - 0.5) * 0.15));
      if (q.cook) ctx.props.tint(q);
    }
    sfx.swish();
  }
  private startBlend(): void {
    const ctx = this.k.ctx;
    this.blending = 2.2;
    sfx.whoosh();
    if (this.blend.length > 5) {
      // sem tampa!
      const c = this.rig.world(this.blendL.x, this.blendL.y + 0.4, this.blendL.z);
      ctx.eng.burst(c.x, c.y, c.z, 30, 'chunk', this.k.dishes.mixColor(this.blend.map((p) => ctx.props.bit(p))).getStyle(), 3);
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * 6.28,
          r = 0.6 + Math.random() * 0.9;
        ctx.props.splat('juice', v3(c.x + Math.cos(a) * r, 0.01, c.z + Math.sin(a) * r), UPN, 22 + i * 4);
      }
      ctx.ui.hint(t('act.hint.lid', 'ESQUECEU A TAMPA! Suco pra todo lado!'), 2400, 2, true);
      sfx.splat();
      bump('fun', 6);
      const lost = this.blend.splice(0, this.blend.length - 3);
      for (const p of lost) ctx.props.remove(p);
    }
  }
  update(dt: number): void {
    const ctx = this.k.ctx;
    const props = ctx.props;
    this.rig.follow();
    if (!this.rig.root.visible) return;
    // liquidificador engole o que cai na jarra
    const c = this.rig.world(this.blendL.x, this.blendL.y, this.blendL.z, V2);
    for (const p of props.list) {
      if (p.held || p.hidden || !props.isFood(p)) continue;
      const o = p.obj.position;
      if (o.y > c.y + 0.15 && o.y < c.y + 0.75 && Math.hypot(o.x - c.x, o.z - c.z) < 0.1) {
        props.hide(p);
        this.blend.push(p);
        sfx.drop();
        break;
      }
    }
    const fill = Math.min(1, this.blend.length / 5);
    this.juice.visible = this.blend.length > 0;
    if (this.juice.visible) {
      const hh = 0.03 + fill * 0.2;
      this.juice.scale.set(1, hh, 1);
      this.juice.position.copy(this.blendL).setY(this.blendL.y + 0.16 + hh / 2);
      (this.juice.material as THREE.MeshLambertMaterial).color.copy(this.k.dishes.mixColor(this.blend.map((p) => props.bit(p)), '#ffffff', this.blending > 0 ? 0.05 : 0.5));
    }
    if (this.blending > 0) {
      this.blending -= dt;
      const j = Math.sin(ctx.eng.time * 70) * 0.006;
      this.jar.position.x = this.blendL.x + j;
      this.juice.rotation.y += dt * 40;
      if (Math.random() < dt * 9) sfx.vacuum();
      if (this.blending <= 0) {
        this.jar.position.x = this.blendL.x;
        const bits: Bit[] = this.blend.map((p) => ({ ...props.bit(p), cut: 2, m: [...new Set<Method>([...p.m, 'blend'])] }));
        for (const p of this.blend) props.remove(p);
        this.blend = [];
        const cup = props.spawn('cup', {}, this.rig.world(this.blendL.x - 0.18, this.blendL.y + 0.1, this.blendL.z + 0.12));
        this.k.dishes.fill(cup, bits);
        sfx.catch();
      }
    }
  }
  dispose(): void {
    for (const p of this.blend) this.k.ctx.props.remove(p);
    this.juice.geometry.dispose();
    (this.juice.material as THREE.Material).dispose();
    this.rig.dispose();
  }
}

/* =================================================================== */
class Sink {
  rig: Rig;
  rackL: THREE.Vector3;
  water = false;
  private fxT = 0;
  private washed = 0;
  spots: Spot[];
  constructor(
    readonly k: Kitchen,
    readonly item: ItemRec,
  ) {
    this.rig = new Rig(k.ctx.eng, item);
    const { w, h } = this.rig;
    this.rackL = v3(w / 2 - 0.15, h, 0.02);
    const rack = new THREE.Mesh(rackGeo(), k.mat);
    rack.position.copy(this.rackL);
    this.rig.root.add(rack);
    const rMin = v3(this.rackL.x - 0.15, h - 0.02, this.rackL.z - 0.17),
      rMax = v3(this.rackL.x + 0.15, h + 0.3, this.rackL.z + 0.17);
    this.spots = [
      {
        id: 'sink',
        hit: (ray, tg) => {
          const a = itemHit(item, tg);
          const b = hitBox(ray, this.rig.root, rMin, rMax);
          return a === null ? b : b === null ? a : Math.min(a, b);
        },
        label: () => {
          const dirty = this.inBasin().filter((p) => p.dirty > 0).length;
          return t('act.lbl.sink', 'Pia') + (dirty ? ' · ' + t('act.lbl.dirtyN', '{n} sujos', { n: dirty }) : '') + (this.racked().length ? ' · ' + t('act.lbl.rack', 'escorredor: {n}', { n: this.racked().length }) : '');
        },
        acts: (hd) => {
          const L: ActDef[] = [];
          if (hd) return L;
          if (this.inBasin().some((p) => p.dirty > 0)) L.push({ id: 's-wash', label: t('act.btn.wash', 'LAVAR'), icon: 'clean', size: 'big', hold: true });
          if (this.racked().length) L.push({ id: 's-take', label: t('act.btn.takePlate', 'PEGAR LOUÇA'), icon: 'grab', size: L.length ? undefined : 'big' });
          L.push({ id: 's-tap', label: this.water ? t('act.btn.tapOff', 'FECHAR TORNEIRA') : t('act.btn.tapOn', 'ABRIR TORNEIRA'), icon: 'drop', size: 'small' });
          return L;
        },
        tap: (id) => {
          if (id === 's-tap') return (this.water = !this.water), sfx.click(), true;
          if (id === 's-take') {
            const r = this.racked();
            const top = r[r.length - 1];
            if (top) k.ctx.hand(top);
            return true;
          }
          return false;
        },
        hold: (id, dt) => id === 's-wash' && this.wash(dt),
        place: (p) => (k.dishes.isDish(p) || k.ctx.props.isFood(p) ? this.rig.world(0, this.rig.h + 0.12, 0) : null),
        placeLabel: (p) => (k.dishes.isDish(p) && p.dirty > 0 ? t('act.btn.inSink', 'NA PIA') : t('act.btn.inSink', 'NA PIA')),
      },
    ];
  }
  inBasin(): Prop[] {
    return this.k.ctx.props.list.filter((p) => {
      if (p.held || p.hidden || p.racked) return false;
      const l = this.rig.local(p.obj.position, V);
      return Math.abs(l.x) < this.rig.w * 0.27 && Math.abs(l.z) < this.rig.d * 0.3 && l.y > this.rig.h - 0.05 && l.y < this.rig.h + 0.35;
    });
  }
  racked(): Prop[] {
    return this.k.ctx.props.list.filter((p) => p.racked && (p as Prop & { rackOf?: Sink }).rackOf === this);
  }
  /** põe a louça limpa empilhada no escorredor */
  rack(p: Prop): void {
    const list = this.racked();
    let y = this.rig.h + 0.02;
    for (const q of list) y += q.kind === 'plate' ? 0.026 : q.kind === 'bowl' ? 0.04 : 0.13;
    const pos = this.rig.world(this.rackL.x, y + (p.kind === 'plate' ? 0.0125 : p.kind === 'bowl' ? 0.035 : 0.065), this.rackL.z);
    this.k.ctx.props.pin(p, pos, this.rig.root.quaternion);
    p.racked = true;
    (p as Prop & { rackOf?: Sink }).rackOf = this;
  }
  private wash(dt: number): void {
    const ctx = this.k.ctx;
    ctx.pose('sponge');
    ctx.fps.hand.scrub = 1;
    const dirty = this.inBasin().filter((p) => p.dirty > 0 && this.k.dishes.isDish(p));
    this.fxT -= dt;
    if (this.fxT <= 0) {
      this.fxT = 0.07;
      const c = this.rig.world((Math.random() - 0.5) * 0.3, this.rig.h + 0.06, (Math.random() - 0.5) * 0.2, V);
      ctx.eng.burst(c.x, c.y, c.z, 3, 'foam', '#ffffff', 0.7);
      ctx.eng.emit(c.x, c.y + 0.05, c.z, (Math.random() - 0.5) * 0.3, 0.5, (Math.random() - 0.5) * 0.3, { tile: 0, color: '#d9f2ff', life: 1.2, size: 0.05, grow: 0.04, grav: -0.15 });
      if (Math.random() < 0.3) sfx.squeak();
      else if (Math.random() < 0.3) sfx.scrub();
    }
    for (const p of dirty) {
      ctx.props.setDirty(p, Math.max(0, p.dirty - dt * (this.water ? 0.9 : 0.55)));
      if (p.dirty <= 0) {
        const at = p.obj.position;
        ctx.eng.burst(at.x, at.y + 0.08, at.z, 12, 'spark', '#bff7ff', 1.4);
        sfx.clean();
        this.rack(p);
        this.washed++;
        const got = ctx.coin(1);
        bump('hyg', 1);
        ctx.ui.hint(t('act.hint.washed', 'Brilhando!') + (got ? ' +' + got : ''), 1200, 1);
      }
    }
  }
  update(dt: number): void {
    this.rig.follow();
    if (!this.rig.root.visible) return;
    if (this.water && Math.random() < dt * 30) {
      const ctx = this.k.ctx;
      const o = this.rig.world(0, this.rig.h + 0.2, -this.rig.d / 2 + 0.17, V);
      ctx.eng.emit(o.x, o.y, o.z, 0, -0.5, 0, { tile: 0, color: '#8fd3ff', life: 0.35, size: 0.03, grav: 6 });
      if (Math.random() < 0.1) sfx.bubble();
    }
    // pratos encostados no escorredor acompanham a pia
    for (const p of this.racked()) if (p.body && p.body.type !== CANNON.Body.KINEMATIC) p.racked = false;
  }
  dispose(): void {
    this.rig.dispose();
  }
}

/* =================================================================== */
class Trash {
  fx: Fixture;
  fill = 0;
  private bag: THREE.Mesh;
  spots: Spot[];
  constructor(
    readonly k: Kitchen,
    fx: Fixture,
  ) {
    this.fx = fx;
    const m = new THREE.Mesh(trashGeo(), k.mat);
    this.bag = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: '#262238' }));
    this.bag.position.y = 0.3;
    this.bag.scale.set(1, 0.5, 1);
    this.bag.visible = false;
    fx.root.add(m, this.bag);
    const min = v3(-0.2, 0, -0.2),
      max = v3(0.2, 0.55, 0.2);
    this.spots = [
      {
        id: 'trash',
        hit: (ray) => hitBox(ray, fx.root, min, max),
        label: () => t('act.lbl.trash', 'Lixeira') + ` (${this.fill}/8)` + (this.fill >= 8 ? ' · ' + t('act.lbl.full', 'cheia!') : ''),
        acts: (h) => (!h && this.fill >= 3 ? [{ id: 't-out', label: t('act.btn.trashOut', 'TIRAR O LIXO'), icon: 'trash', size: 'big' }] : []),
        tap: (id) => (id === 't-out' ? (this.takeOut(), true) : false),
        place: (p) => (p.kind !== 'ext' && p.kind !== 'bag' ? fx.world(0, 0.75, 0) : null),
        placeLabel: () => t('act.btn.inTrash', 'NO LIXO'),
      },
    ];
  }
  private takeOut(): void {
    const ctx = this.k.ctx;
    this.fill = 0;
    this.bag.visible = false;
    const b = ctx.props.spawn('bag', { keep: true }, this.fx.world(0, 0.7, 0));
    ctx.hand(b);
    sfx.pick();
    ctx.ui.hint(t('act.hint.bag', 'Agora leve pra fora!'), 1800);
  }
  update(): void {
    const ctx = this.k.ctx;
    const c = this.fx.root.position;
    for (const p of ctx.props.list) {
      if (p.held || p.hidden || p.kind === 'ext' || p.kind === 'bag' || p.racked) continue;
      const o = p.obj.position;
      if (o.y > 0.4 && o.y < 1.0 && Math.hypot(o.x - c.x, o.z - c.z) < 0.19) {
        if (this.k.dishes.isDish(p)) {
          p.body?.velocity.set((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2);
          ctx.ui.hint(t('act.hint.notTrash', 'Ei! Louça não é lixo!'), 1500);
          sfx.boing();
          continue;
        }
        if (this.fill >= 8) {
          p.body?.velocity.set((Math.random() - 0.5) * 2, 3.5, (Math.random() - 0.5) * 2);
          ctx.ui.hint(t('act.hint.trashFull', 'Lixeira cheia! Tire o lixo'), 1600, 1);
          sfx.boing();
          continue;
        }
        ctx.props.remove(p);
        this.fill++;
        this.bag.visible = true;
        this.bag.position.y = 0.12 + this.fill * 0.045;
        sfx.drop();
        ctx.eng.burst(c.x, 0.55, c.z, 4, 'poof', '#ffffff', 0.5);
        break;
      }
    }
  }
  dispose(): void {
    this.bag.geometry.dispose();
    (this.bag.material as THREE.Material).dispose();
    this.fx.dispose();
  }
}

/* =================================================================== */
export class Kitchen {
  readonly mat: THREE.Material;
  stoves: Stove[] = [];
  sinks: Sink[] = [];
  prep: Prep | null = null;
  trash: Trash | null = null;
  ext: Prop | null = null;
  private fridges: { item: ItemRec; spot: Spot }[] = [];
  private pickT = 0;
  private sprayT = 0;
  constructor(
    readonly ctx: Ctx,
    readonly dishes: Dishes,
  ) {
    this.mat = ctx.props.newMat();
    this.refresh(true);
  }
  /** acompanha móveis que entraram/saíram (construção, festa) */
  refresh(first = false): void {
    const ctx = this.ctx;
    const stoveItems = ctx.items('stove');
    for (const s of [...this.stoves]) if (!s.rig.alive) (s.dispose(), this.stoves.splice(this.stoves.indexOf(s), 1));
    for (const it of stoveItems) if (!this.stoves.some((s) => s.rig.item === it)) this.stoves.push(new Stove(this, it));
    for (const s of [...this.sinks]) if (!s.rig.alive) (s.dispose(), this.sinks.splice(this.sinks.indexOf(s), 1));
    const kroom = ctx.eng.roomById('kitchen');
    const sinkItems = ctx.items('sink').filter((i) => i.room === kroom);
    for (const it of sinkItems.length ? sinkItems : ctx.items('sink')) if (!this.sinks.some((s) => s.item === it)) this.sinks.push(new Sink(this, it));
    if (this.prep && !this.prep.rig.alive) (this.prep.dispose(), (this.prep = null));
    if (!this.prep) {
      const kitchen = ctx.eng.roomById('kitchen');
      const host =
        ctx.items('counter').find((i) => i.room === kitchen) ??
        ctx.items(['table', 'desk']).find((i) => i.room === kitchen) ??
        ctx.items('counter')[0] ??
        ctx.items(['table', 'partytable', 'desk'])[0];
      if (host) this.prep = new Prep(this, host);
    }
    this.fridges = this.fridges.filter((f) => ctx.eng.items.includes(f.item));
    for (const it of ctx.items('fridge')) if (!this.fridges.some((f) => f.item === it)) this.fridges.push({ item: it, spot: this.fridgeSpot(it) });
    if (first) {
      const room = ctx.eng.roomById('kitchen') ?? this.fridges[0]?.item.room ?? ctx.eng.rooms[0];
      const near = this.sinks[0]?.rig.root.position ?? this.stoves[0]?.rig.root.position;
      const sp = room ? freeSpot(ctx.eng, room, 0.4, 0.4, near) : null;
      if (sp) this.trash = new Trash(this, new Fixture(ctx.eng, room, sp.p, sp.yaw, { w: 0.36, d: 0.36, h: 0.5 }));
      // louça inicial no escorredor
      const sink = this.sinks[0];
      const kinds: ('plate' | 'bowl' | 'cup')[] = ['bowl', 'plate', 'plate', 'plate', 'plate'];
      for (const k of kinds) {
        const p = ctx.props.spawn(k, {}, (sink?.rig.world(0, sink.rig.h + 0.4, 0) ?? room.center.clone().setY(1)).clone());
        if (sink) sink.rack(p);
      }
    }
    this.ensureExt();
  }
  private ensureExt(): void {
    const ctx = this.ctx;
    if (this.ext && ctx.props.list.includes(this.ext)) return;
    const fr = this.fridges[0]?.item;
    const pos = fr ? fr.obj.position.clone().add(V.set(fr.dims.w / 2 + 0.15, 0.2, fr.dims.d / 2 + 0.15).applyQuaternion(fr.obj.quaternion)) : (ctx.eng.roomById('kitchen') ?? ctx.eng.rooms[0]).center.clone().setY(0.3);
    this.ext = ctx.props.spawn('ext', { keep: true }, pos);
  }
  grabExtinguisher(): void {
    this.ensureExt();
    const ctx = this.ctx;
    if (this.ext) {
      ctx.hand(this.ext);
      sfx.whoosh();
      ctx.ui.hint(t('act.hint.spray', 'Mire no fogo e segure BORRIFAR'), 2200, 3);
    }
  }
  private fridgeSpot(item: ItemRec): Spot {
    const ctx = this.ctx;
    return {
      id: 'fridge',
      hit: (_r, tg) => itemHit(item, tg),
      label: () => t('act.lbl.fridge', 'Geladeira'),
      acts: (h) => (h ? [] : [{ id: 'f-open', label: ctx.ui.picking ? t('act.btn.fridgeClose', 'FECHAR') : t('act.btn.fridge', 'ABRIR GELADEIRA'), icon: 'grab', size: 'big' }]),
      tap: (id) => {
        if (id !== 'f-open') return false;
        if (ctx.ui.picking) return ctx.ui.closePick(), true;
        sfx.click();
        ctx.ui.openPick(
          INGS.map((i) => ({ id: i.id, label: ingName(i.id), color: ingColor(i.id) })),
          (id2) => {
            const p = ctx.props.spawn('ing', { ing: id2 }, ctx.front(0.45, -0.15));
            ctx.hand(p);
            sfx.pick();
          },
          'fridge',
        );
        this.pickT = 0;
        return true;
      },
      place: (p) => (ctx.props.isFood(p) && p.kind === 'ing' && p.cut === 0 && p.cook < 0.2 ? item.obj.position.clone().setY(1) : null),
      placeLabel: () => t('act.btn.store', 'GUARDAR'),
    };
  }
  /** guardar na geladeira (tchau) */
  storeInFridge(p: Prop): boolean {
    const f = this.fridges.find((x) => x.item.obj.position.distanceTo(p.obj.position) < 2.5);
    if (!f) return false;
    this.ctx.props.remove(p, true);
    sfx.catch();
    return true;
  }
  /** colocar algo via botão: casos especiais (forno, geladeira) */
  placed(spotId: string, p: Prop, at: THREE.Vector3): boolean {
    if (spotId === 'fridge') return this.storeInFridge(p);
    if (spotId === 'stove') {
      const s = this.stoves.find((x) => x.spots[0] && at.distanceTo(x.rig.root.position) < 1.5 && x.rig.local(at, V).y < x.rig.h * 0.6);
      if (s) return s.toOven(p), true;
    }
    return false;
  }
  get spots(): Spot[] {
    const L: Spot[] = [];
    for (const s of this.stoves) L.push(...s.spots);
    for (const s of this.sinks) L.push(...s.spots);
    if (this.prep) L.push(...this.prep.spots);
    if (this.trash) L.push(...this.trash.spots);
    for (const f of this.fridges) L.push(f.spot);
    return L;
  }
  /** botões quando mira um ingrediente solto */
  aimActs(p: Prop): ActDef[] {
    const L: ActDef[] = [];
    const sk = this.sinks.find((s) => s.inBasin().includes(p));
    if (sk && p.dirty > 0) L.push({ id: 's-wash', label: t('act.btn.wash', 'LAVAR'), icon: 'clean', size: 'big', hold: true });
    if (this.prep && this.prep.onBoard().includes(p)) L.push({ id: 'k-chop', label: t('act.btn.chop', 'CORTAR'), icon: 'break', size: 'big', hold: true });
    const st = this.stoves.find((s) => s.inPan().includes(p));
    if (st) L.push({ id: 'k-stove', label: st.on ? t('act.btn.stoveOff', 'DESLIGAR FOGÃO') : t('act.btn.stoveOn', 'LIGAR FOGÃO'), icon: 'fix', size: 'small' });
    return L;
  }
  aimTap(id: string, p: Prop): boolean {
    if (id === 'k-stove') {
      const st = this.stoves.find((s) => s.inPan().includes(p));
      return st ? st.tap(id) : false;
    }
    return false;
  }
  aimHold(id: string, dt: number, p?: Prop): void {
    if (id === 'k-chop') this.prep?.spots[0].hold?.(id, dt, null);
    if (id === 's-wash') (this.sinks.find((s) => p && s.inBasin().includes(p)) ?? this.sinks[0])?.spots[0].hold?.(id, dt, null);
  }
  /** extintor */
  spray(dt: number): void {
    const ctx = this.ctx;
    const cam = ctx.eng.camera;
    const dir = cam.getWorldDirection(new THREE.Vector3());
    const o = cam.position.clone();
    ctx.pose('grab');
    for (let i = 0; i < 3; i++) {
      const s = 3.5 + Math.random() * 1.5;
      ctx.eng.emit(o.x + dir.x * 0.4, o.y + dir.y * 0.4 - 0.12, o.z + dir.z * 0.4, dir.x * s + (Math.random() - 0.5) * 0.5, dir.y * s + (Math.random() - 0.5) * 0.5, dir.z * s + (Math.random() - 0.5) * 0.5, { tile: 0, color: '#ffffff', life: 0.6, size: 0.06, grow: 0.35, grav: 1.5 });
    }
    if (Math.random() < dt * 8) sfx.spray();
    let hit = false;
    for (const s of this.stoves) hit = s.spray(o, dir, dt) || hit;
    this.sprayT -= dt;
    // espuma no chão onde mira (bagunça de desenho animado)
    if (!hit && this.sprayT <= 0) {
      const tg = ctx.fps.target;
      if (tg.dist < 3 && (tg.type === 'decal' || tg.type === 'none' || tg.type === 'item')) {
        this.sprayT = 1.6;
        if (tg.point.y < 0.05) ctx.props.splat('frosting', tg.point, UPN, 18);
      }
    }
  }
  get fire(): boolean {
    return this.stoves.some((s) => s.fire);
  }
  update(dt: number): void {
    for (const s of this.stoves) s.update(dt);
    for (const s of this.sinks) s.update(dt);
    this.prep?.update(dt);
    this.trash?.update();
    // fecha a fileira da geladeira quando se afasta
    if (this.ctx.ui.picking && this.ctx.ui.pickOwner === 'fridge' && this.fridges.length) {
      const cam = this.ctx.eng.camera.position;
      const near = this.fridges.some((f) => Math.hypot(f.item.obj.position.x - cam.x, f.item.obj.position.z - cam.z) < 3);
      this.pickT = near ? 0 : this.pickT + dt;
      if (this.pickT > 0.6) this.ctx.ui.closePick();
    }
  }
  dispose(): void {
    for (const s of this.stoves) s.dispose();
    for (const s of this.sinks) s.dispose();
    this.prep?.dispose();
    this.trash?.dispose();
  }
}
