/* ============================================================
 *  GARIMPO — COMEÇO DO ZERO (save novo): a pé, com bateia, pá e uma mochila, na beira do rio.
 *  O acampamento começa VAZIO (só a barraca, a fogueira, o rio e uma calha velha quebrada) e
 *  cresce conforme você CONSTRÓI, com obra animada (andaime, martelo, o prédio subindo em
 *  camadas que "encaixam"):
 *    1) cavar → bateia no rio → 1º ouro → vender no barco do comprador;
 *    2) carrinho de mão; 3) consertar a calha; 4) galpão do ouro; 5) lavadora; 6) garagem;
 *    depois máquinas na loja (picape, caminhão, escavadeira, trator, helicóptero) e a mina.
 *  Cada passo é um objetivo com ícone + voz + seta. O "fantasma" azul mostra onde vai o próximo
 *  prédio; perto dele aparece o botão "Construir". Menu "Construir" (martelo) lista tudo.
 *  Saves antigos (sem `camp`) = tudo construído (não existe CampBuild).
 *  Ganchos em game.ts (procure "CAMP:").
 * ============================================================ */
import './camp.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import { music } from '../../../audio';
import { sfx } from '../../../3d/common/sfx';
import { bigMoment, notify } from '../../../ui/notify';
import { speak } from '../../voo/voice';
import { buildBarrow } from '../models';
import { buildSluice } from '../proc/models';
import { GOLD_PRICE, type SlotSave } from '../save';
import { IC, type IconKey } from '../icons';
import type { Garimpo } from '../game';
import type { Action } from '../rp/hud';
import { addPlacer, Site } from './site';
import { SI, type SIcon } from './icons';
import { buildPlank, buildScaffold, ghostMat, iconSprite, setGhost } from './models';

export type BId = 'barrow' | 'sluice' | 'stock' | 'plant' | 'garage' | 'houses';
export interface CampSave {
  v: 1;
  /** construções feitas */
  built: string[];
  /** quando (s de jogo) cada passo ficou pronto: dig, pan, sell, barrow, …, pickup */
  log: Record<string, number>;
  /** a abertura já passou */
  intro: boolean;
}
/** dinheiro inicial do começo do zero (pouquinho) */
export const CAMP_MONEY = [80, 40, 25, 10];
/** "baldinho" de terra antes do carrinho (m³) */
export const BAG = 0.06;
export function freshCamp(): CampSave {
  return { v: 1, built: [], log: {}, intro: false };
}

interface Foot {
  x: number;
  z: number;
  yaw: number;
  hx: number;
  hz: number;
  h: number;
}
interface Def {
  id: BId;
  icon: SIcon;
  name: () => string;
  price: number;
  needs: BId | null;
  /** faz parte da sequência de objetivos */
  chain: boolean;
  /** duração da obra (s) */
  dur: number;
  done: () => string;
}
/* ---------------- equilíbrio (normal: ouro a 10/g) ----------------
 *  1º ouro ~1 min · carrinho ~3 min · calha ~6 min · galpão ~9 min · lavadora ~15 min ·
 *  garagem ~17 min · picape (900, loja) ~20–22 min. Conta: bolsão ~80 g/m³ na superfície;
 *  bateia ~85 % e ~35 s; calha ~68 % (com a limpeza); ouro a 10/g (normal). */
export const DEFS: Def[] = [
  { id: 'barrow', icon: 'barrow', name: () => t('gb.c.b.barrow', 'Carrinho de mão'), price: 110, needs: null, chain: true, dur: 3.6, done: () => t('gb.c.d.barrow', 'Carrinho pronto! Pegue o carrinho: cabe muito mais terra.') },
  { id: 'sluice', icon: 'sluice', name: () => t('gb.c.b.sluice', 'Consertar a calha'), price: 200, needs: 'barrow', chain: true, dur: 4.2, done: () => t('gb.c.d.sluice', 'Calha consertada! Despeje a terra na calha: a água separa o ouro.') },
  { id: 'stock', icon: 'shed', name: () => t('gb.c.b.stock', 'Galpão do ouro'), price: 450, needs: 'sluice', chain: true, dur: 5.2, done: () => t('gb.c.d.stock', 'Galpão do ouro pronto! Guarde o ouro aqui: o caminhão vem buscar e paga.') },
  { id: 'plant', icon: 'plant', name: () => t('gb.c.b.plant', 'Lavadora'), price: 700, needs: 'stock', chain: true, dur: 6.8, done: () => t('gb.c.d.plant', 'A lavadora chegou! Despeje a terra na moega e ela lava sozinha.') },
  { id: 'garage', icon: 'garage', name: () => t('gb.c.b.garage', 'Garagem'), price: 200, needs: 'plant', chain: true, dur: 6.0, done: () => t('gb.c.d.garage', 'Garagem pronta! Agora dá para comprar máquinas na loja.') },
  { id: 'houses', icon: 'house', name: () => t('gb.c.b.houses', 'Casinhas'), price: 300, needs: 'stock', chain: false, dur: 5.0, done: () => t('gb.c.d.houses', 'Casinhas prontas! Dá para dormir nelas.') },
];
const CHAIN = DEFS.filter((d) => d.chain).map((d) => d.id);
type Goal = 'dig' | 'pan' | 'sell' | BId | 'pickup' | 'done';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const _v = new THREE.Vector3();
const ease = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));

/** obra em andamento */
interface Fx {
  id: BId | 'portal';
  t: number;
  dur: number;
  foots: Foot[];
  center: THREE.Vector3;
  size: number;
  y0: number;
  y1: number;
  plane: THREE.Plane;
  mats: Map<THREE.Mesh, THREE.Material | THREE.Material[]>;
  clones: THREE.Material[];
  targets: THREE.Object3D[];
  scaff: THREE.Group[];
  ring: THREE.LineSegments;
  planks: { m: THREE.Mesh; t: number; a: THREE.Vector3; b: THREE.Vector3 }[];
  step: number;
  sparkled?: boolean;
  camA: number;
  temp: THREE.Object3D | null;
  done: () => void;
}

export class CampBuild {
  readonly st: CampSave;
  site: Site;
  private g: Garimpo;
  private s: SlotSave;
  private guest: boolean;
  private goalEl: HTMLDivElement | null = null;
  private btn: HTMLButtonElement | null = null;
  private goalK = '';
  private openT = 0;
  private chkT = 0;
  private ghostId: string | null = null;
  private ghostObj: THREE.Object3D | null = null;
  private marker: THREE.Sprite;
  private fx: Fx | null = null;
  private time = 0;
  /** construção escolhida no menu (opcionais, ex.: casinhas) */
  private focus: BId | null = null;
  private saidNo = 0;
  private celebrated = false;

  constructor(g: Garimpo, s: SlotSave, st: CampSave, guest = false) {
    this.g = g;
    this.s = s;
    this.st = st;
    this.guest = guest;
    const w = g.w!;
    this.site = new Site(w, w.tier);
    addPlacer(w, this.site.lay.placer);
    // calha consertada: a velha some (a nova é uma calha de verdade do beneficiamento)
    if (this.has('sluice')) this.site.broken.visible = false;
    for (const id of ['plant', 'stock', 'garage', 'houses'] as BId[]) w.setBuilt(id, this.has(id));
    w.setBuilt('portal', !!s.mineOpen);
    this.marker = iconSprite(SI.hammer, '#8fe6ff', 1.3);
    this.marker.visible = false;
    w.scene.add(this.marker);
  }

  /* ============================== estado ============================== */
  has(id: string): boolean {
    return this.st.built.includes(id);
  }
  /** rede (convidado): o anfitrião construiu */
  netBuilt(list: string[]): void {
    for (const id of list) if (!this.has(id)) this.finishBuild(id as BId, true);
  }
  private def(id: BId): Def {
    return DEFS.find((d) => d.id === id)!;
  }
  private unlocked(d: Def): boolean {
    return !this.has(d.id) && (!d.needs || this.has(d.needs));
  }
  /** próxima construção da sequência */
  private nextChain(): Def | null {
    for (const id of CHAIN) if (!this.has(id)) return this.def(id);
    return null;
  }
  private logAt(k: string): void {
    if (this.st.log[k] === undefined) this.st.log[k] = Math.round(this.s.played);
  }
  private goal(): Goal {
    const L = this.st.log;
    if (L.dig === undefined && !this.has('barrow')) return 'dig';
    if (L.pan === undefined && !this.has('barrow')) return 'pan';
    if (L.sell === undefined && !this.has('barrow')) return 'sell';
    const n = this.nextChain();
    if (n) return n.id;
    if (!this.g.ms.some((m) => m.kind === 'pickup') && L.pickup === undefined) return 'pickup';
    return 'done';
  }
  /** jogador terminou uma bateia com ouro */
  onPan(g: number): void {
    this.logAt('dig');
    if (g > 0.005) this.logAt('pan');
  }
  get busy(): boolean {
    return !!this.fx;
  }
  private get money(): number {
    return this.s.money;
  }
  private pepita(): number {
    return this.g.rp?.st.inv.pepita ?? 0;
  }
  /** onde dormir: barraca sempre; casinhas quando prontas */
  sleepSpots(): { x: number; z: number }[] {
    const tn = this.site.lay.tent;
    return this.has('houses') ? [tn, ...this.g.w!.map.houses] : [tn];
  }
  nearPier(): boolean {
    const p = this.g.cur?.pos;
    if (!p || this.g.cur !== this.g.worker) return false;
    const b = this.site.lay.buyer;
    return Math.hypot(p.x - b.x, p.z - b.z) < 5;
  }

  /* ============================== sítios das obras ============================== */
  private foots(id: BId | 'portal'): Foot[] {
    const w = this.g.w!;
    const m = w.map;
    const lay = this.site.lay;
    const off = (x: number, z: number, yaw: number, lz: number) => ({ x: x + Math.sin(yaw) * lz, z: z + Math.cos(yaw) * lz });
    switch (id) {
      case 'barrow':
        return [{ ...lay.bench, hx: 0.6, hz: 1.0, h: 1.0 }];
      case 'sluice':
        return [{ ...lay.sluice, hx: 0.6, hz: 2.2, h: 1.4 }];
      case 'stock': {
        const c = off(m.stock.x, m.stock.z, 0, -1.5);
        return [{ x: c.x, z: c.z, yaw: 0, hx: 4.8, hz: 2.6, h: 4.4 }];
      }
      case 'plant': {
        const c = off(m.plant.x, m.plant.z, m.plant.rot, -1.8);
        return [{ x: c.x, z: c.z, yaw: m.plant.rot, hx: 3.6, hz: 5.8, h: 6.2 }];
      }
      case 'garage':
        return [{ x: m.garage.x, z: m.garage.z, yaw: 0, hx: 6.2, hz: 4.6, h: 5.2 }];
      case 'houses':
        return m.houses.map((h) => ({ x: h.x, z: h.z, yaw: h.rot, hx: 2.6, hz: 2.6, h: 4.6 }));
      case 'portal': {
        const p = w.portal;
        return [{ x: p.x, z: p.z, yaw: p.yaw, hx: 2.6, hz: 1.4, h: 5.2 }];
      }
    }
  }
  /** centro do lugar da obra (seta, distância do botão) */
  private siteOf(id: BId): { x: number; z: number; r: number } {
    const f = this.foots(id);
    let x = 0;
    let z = 0;
    for (const q of f) {
      x += q.x;
      z += q.z;
    }
    x /= f.length;
    z /= f.length;
    if (id === 'houses') {
      // casinhas: a mais perto do jogador
      const p = this.g.cur!.pos;
      let best = f[0];
      for (const q of f) if (Math.hypot(q.x - p.x, q.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z)) best = q;
      return { x: best.x, z: best.z, r: 7 };
    }
    const r = Math.max(f[0].hx, f[0].hz) + 4.5;
    return { x, z, r };
  }

  /* ============================== fantasma do próximo prédio ============================== */
  private refreshGhost(): void {
    if (this.guest) return;
    const want = this.fx ? null : (this.focus && !this.has(this.focus) ? this.focus : this.nextChain()?.id ?? null);
    // antes do 1º ouro vendido o carrinho ainda não aparece (um passo de cada vez)
    const show = want && (want !== 'barrow' || this.st.log.sell !== undefined) ? want : null;
    if (show === this.ghostId) return;
    this.clearGhost();
    this.ghostId = show;
    if (!show) return;
    const w = this.g.w!;
    const T = w.T;
    if (show === 'barrow') {
      const b = buildBarrow().root;
      const p = this.site.lay.bench;
      b.position.set(p.x, T.heightAt(p.x, p.z), p.z);
      b.rotation.y = p.yaw;
      setGhost(b, true);
      w.scene.add(b);
      this.ghostObj = b;
    } else if (show === 'sluice') {
      const sl = buildSluice();
      sl.water.visible = sl.heap.visible = sl.conc.visible = false;
      const p = this.site.lay.sluice;
      sl.root.position.set(p.x, T.heightAt(p.x, p.z) + 0.05, p.z);
      sl.root.rotation.y = p.yaw;
      setGhost(sl.root, true);
      w.scene.add(sl.root);
      this.ghostObj = sl.root;
    } else {
      const b = w.bld.get(show);
      if (b)
        for (const o of b.objs) {
          if ((o as THREE.Light).isLight || (o as THREE.Sprite).isSprite) continue;
          o.visible = true;
          setGhost(o, true);
        }
    }
    const si = this.siteOf(show);
    const top = Math.max(...this.foots(show).map((f) => f.h));
    this.marker.position.set(si.x, T.heightAt(si.x, si.z) + top + 1.6, si.z);
    this.marker.visible = true;
  }
  private clearGhost(): void {
    const id = this.ghostId;
    this.ghostId = null;
    this.marker.visible = false;
    if (this.ghostObj) {
      this.ghostObj.removeFromParent();
      this.ghostObj.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.ghostObj = null;
    }
    if (!id || id === 'barrow' || id === 'sluice') return;
    const b = this.g.w!.bld.get(id);
    if (!b) return;
    for (const o of b.objs) {
      setGhost(o, false);
      o.visible = b.on;
    }
  }

  /* ============================== passo ============================== */
  step(dt: number): void {
    const g = this.g;
    this.time += dt;
    const night = g.rp ? Math.max(0, Math.min(1, (g.rp as unknown as { sky: { dark: number } }).sky.dark ?? 0)) : 0;
    this.site.update(dt, g.w!.camera, night);
    ghostMat.opacity = 0.22 + Math.sin(this.time * 3) * 0.08;
    if (this.marker.visible) this.marker.position.y += Math.sin(this.time * 2.4) * 0.004;
    if (this.fx) this.fxStep(dt);
    if (this.guest) return;
    // objetivos (4×/s)
    this.chkT -= dt;
    if (this.chkT <= 0) {
      this.chkT = 0.25;
      const wk = g.worker!;
      if (this.st.log.dig === undefined && wk.cargo.vol >= wk.cargo.cap * 0.6) this.logAt('dig');
      if (this.st.log.pickup === undefined && g.ms.some((m) => m.kind === 'pickup')) this.logAt('pickup');
      this.goalUi();
      this.refreshGhost();
    }
    if (this.openT > 0) {
      this.openT -= dt;
      if (this.openT <= 0) this.goalEl?.classList.remove('open');
    }
  }

  /** seta do objetivo (undefined = sem objetivo: o jogo usa a seta normal) */
  arrow(): { x: number; z: number; icon: IconKey } | null | undefined {
    if (this.guest || this.fx) return this.fx ? null : undefined;
    const goal = this.goal();
    if (goal === 'done' || goal === 'pickup') return undefined;
    const lay = this.site.lay;
    const g = this.g;
    const wk = g.worker!;
    if (g.cur !== wk) return undefined;
    const p = wk.group.position;
    const near = (q: { x: number; z: number }, r: number) => Math.hypot(q.x - p.x, q.z - p.z) < r;
    const out = (q: { x: number; z: number }, icon: IconKey, r = 3) => (near(q, r) ? null : { x: q.x, z: q.z, icon });
    if (goal === 'dig') return out(lay.placer, 'shovel', 4);
    if (goal === 'pan') return wk.cargo.vol > 0.004 ? out(lay.pan, 'pan', 2.2) : out(lay.placer, 'shovel', 4);
    if (goal === 'sell') return this.pepita() > 0.01 ? out(lay.buyer, 'coin', 3.5) : wk.cargo.vol > 0.004 ? out(lay.pan, 'pan', 2.2) : out(lay.placer, 'shovel', 4);
    // construir: tem dinheiro → lugar da obra
    const d = this.def(this.focus && !this.has(this.focus) && this.unlocked(this.def(this.focus)) ? this.focus : (goal as BId));
    if (this.money >= d.price) {
      const si = this.siteOf(d.id);
      return out(si, 'hammer', si.r - 1);
    }
    return this.earnTarget();
  }
  /** juntando dinheiro: o próximo passo do "ciclo do ouro" */
  private earnTarget(): { x: number; z: number; icon: IconKey } | null {
    const g = this.g;
    const wk = g.worker!;
    const p = wk.group.position;
    const lay = this.site.lay;
    const m = g.w!.map;
    const dist = (q: { x: number; z: number }) => Math.hypot(q.x - p.x, q.z - p.z);
    const out = (q: { x: number; z: number }, icon: IconKey, r = 3) => (dist(q) < r ? null : { x: q.x, z: q.z, icon });
    // vende de vez em quando (não a cada bateia): ~4 g de ouro na mochila
    if (this.pepita() > 4) {
      if (this.has('stock') && dist(m.stock) < dist(lay.buyer)) return out(m.stock, 'bar', 7);
      return out(lay.buyer, 'coin', 3.5);
    }
    // calha com bastante concentrado: limpar
    const sls = (g.proc?.debug.sls() ?? []) as { x: number; z: number; conc: number; mat: number }[];
    const dirty = sls.find((q) => q.conc > 2 && q.mat > 0.9);
    if (dirty) return out(dirty, 'pan', 3);
    if (wk.fill > 0.85) {
      if (this.has('plant')) {
        g.hopperPos(_v);
        const hp = { x: _v.x, z: _v.z };
        const sl = sls[0];
        if (!sl || dist(hp) < dist(sl)) return out(hp, 'plant', 5);
      }
      if (sls.length) return out(sls[0], 'dump', 2.5);
      return out(lay.pan, 'pan', 2.2);
    }
    // cavar: no cascalho bom do rio (a calha fica ao lado); sem calha e com lavadora, na jazida do acampamento
    const dig = this.has('plant') && !sls.length ? m.deposits[0] : lay.placer;
    return out(dig, 'shovel', 5);
  }

  /* ============================== botões de ação (perto) ============================== */
  actions(): Action[] {
    const g = this.g;
    if (this.guest || this.fx || g.cur !== g.worker || g.inMine) return [];
    const out: Action[] = [];
    const p = g.worker!.group.position;
    const b = this.site.lay.buyer;
    const pep = this.pepita();
    if (Math.hypot(p.x - b.x, p.z - b.z) < 4.5 && pep > 0.005) {
      const pay = Math.max(1, Math.round(pep * GOLD_PRICE[this.s.diff]));
      out.push({ id: 'csell', icon: 'boat', label: t('gb.c.sell', 'Vender ouro'), sub: ['coin', '+' + pay], cls: 'green', run: () => this.sell() });
    }
    for (const d of DEFS) {
      if (!this.unlocked(d)) continue;
      if (d.id === 'barrow' && this.st.log.sell === undefined) continue;
      if (!d.chain && this.focus !== d.id && this.ghostId !== d.id) continue;
      if (d.chain && this.nextChain()?.id !== d.id) continue;
      const si = this.siteOf(d.id);
      if (Math.hypot(p.x - si.x, p.z - si.z) > si.r) continue;
      out.push({ id: 'cb-' + d.id, icon: 'hammer', label: t('gb.c.build', 'Construir'), sub: ['coin', String(d.price)], cls: this.money >= d.price ? 'green' : '', run: () => this.tryBuild(d) });
    }
    return out;
  }
  private sell(): void {
    const g = this.g;
    const pep = this.pepita();
    if (pep <= 0.005 || !g.rp) return;
    const pay = Math.max(1, Math.round(pep * GOLD_PRICE[this.s.diff]));
    g.rp.addItem('pepita', -pep);
    this.s.money += pay;
    this.s.sold += pep;
    audio.cash();
    sfx.sparkle();
    tap('medium');
    bigMoment(t('gb.sold', 'Vendido! +{n}', { n: pay.toLocaleString('pt-BR') }), { icon: 'coins', sub: (pep < 10 ? pep.toFixed(1) : Math.round(pep)) + ' g' });
    const first = this.st.log.sell === undefined;
    this.logAt('sell');
    if (first) window.setTimeout(() => this.say(t('gb.c.firstSale', 'Seu primeiro dinheiro! Junte mais para construir um carrinho de mão.')), 1600);
    g.persist();
  }
  private tryBuild(d: Def): void {
    if (this.fx || !this.unlocked(d)) return;
    if (this.money < d.price) {
      if (this.time - this.saidNo > 3) {
        this.saidNo = this.time;
        notify(t('gb.c.need', 'Faltam {n} moedas', { n: Math.ceil(d.price - this.money) }), { icon: 'coin', kind: 'warn' });
        speak(t('gb.c.needSay', 'Ainda falta dinheiro. Garimpe mais um pouco!'), { gap: 600 });
      }
      return;
    }
    this.s.money -= d.price;
    this.startFx(d.id, () => this.finishBuild(d.id));
  }

  /* ============================== obra animada ============================== */
  private startFx(id: BId | 'portal', done: () => void): void {
    const g = this.g;
    const w = g.w!;
    const T = w.T;
    this.clearGhost();
    const foots = this.foots(id);
    const center = new THREE.Vector3();
    let y0 = 1e9;
    let y1 = -1e9;
    for (const f of foots) {
      const y = T.heightAt(f.x, f.z);
      center.x += f.x / foots.length;
      center.z += f.z / foots.length;
      y0 = Math.min(y0, y - 0.3);
      y1 = Math.max(y1, y + f.h + 0.4);
    }
    center.y = T.heightAt(center.x, center.z);
    let targets: THREE.Object3D[] = [];
    let temp: THREE.Object3D | null = null;
    if (id === 'barrow') {
      const b = buildBarrow().root;
      const p = this.site.lay.bench;
      b.position.set(p.x, T.heightAt(p.x, p.z), p.z);
      b.rotation.y = p.yaw;
      w.scene.add(b);
      targets = [b];
      temp = b;
    } else if (id === 'sluice') {
      const sl = buildSluice();
      sl.water.visible = sl.heap.visible = sl.conc.visible = false;
      const p = this.site.lay.sluice;
      sl.root.position.set(p.x, T.heightAt(p.x, p.z) + 0.05, p.z);
      sl.root.rotation.y = p.yaw;
      w.scene.add(sl.root);
      targets = [sl.root];
      temp = sl.root;
      this.site.broken.visible = false;
    } else {
      const b = w.bld.get(id);
      if (b) targets = b.objs.filter((o) => !(o as THREE.Light).isLight && !(o as THREE.Sprite).isSprite);
      for (const o of targets) o.visible = true;
    }
    // recorte: só aparece o que está abaixo da "linha da obra" (sobe em degraus que encaixam)
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), y0);
    const mats = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const clones: THREE.Material[] = [];
    const cache = new Map<THREE.Material, THREE.Material>();
    for (const o of targets)
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        mats.set(m, m.material);
        const one = (mt: THREE.Material) => {
          let cl = cache.get(mt);
          if (!cl) {
            cl = mt.clone();
            cl.clippingPlanes = [plane];
            cl.clipShadows = true;
            cache.set(mt, cl);
            clones.push(cl);
          }
          return cl;
        };
        m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
      });
    const r = g.renderer;
    if (r) r.localClippingEnabled = true;
    // andaimes + linha dourada da obra
    const scaff: THREE.Group[] = [];
    const ringPts: number[] = [];
    for (const f of foots) {
      const sc = buildScaffold(f.hx + 0.35, f.hz + 0.35, f.h);
      sc.position.set(f.x, T.heightAt(f.x, f.z), f.z);
      sc.rotation.y = f.yaw;
      sc.scale.y = 0.01;
      w.scene.add(sc);
      scaff.push(sc);
      const c = [
        [-f.hx, -f.hz],
        [f.hx, -f.hz],
        [f.hx, f.hz],
        [-f.hx, f.hz],
      ].map(([a, b]) => [f.x + Math.cos(f.yaw) * a + Math.sin(f.yaw) * b, f.z - Math.sin(f.yaw) * a + Math.cos(f.yaw) * b]);
      for (let i = 0; i < 4; i++) {
        const a = c[i];
        const b = c[(i + 1) % 4];
        ringPts.push(a[0], 0, a[1], b[0], 0, b[1]);
      }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(ringPts, 3));
    const ring = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.95 }));
    w.scene.add(ring);
    const size = Math.max(...foots.map((f) => Math.max(f.hx, f.hz, f.h * 0.7)));
    const cam = w.camera.position;
    const big = foots.length > 1 ? 1.25 : 1;
    this.fx = {
      id,
      t: 0,
      dur: (DEFS.find((d) => d.id === id)?.dur ?? 5) * (g.w!.tier <= 0 ? 0.85 : 1),
      foots,
      center,
      size: size * big,
      y0,
      y1,
      plane,
      mats,
      clones,
      targets,
      scaff,
      ring,
      planks: [],
      step: -1,
      camA: Math.atan2(cam.x - center.x, cam.z - center.z),
      temp,
      done,
    };
    // o Bloop vira para a obra e martela
    const wk = g.worker!;
    if (g.cur === wk && !g.inMine && id !== 'portal') wk.group.rotation.y = Math.atan2(center.x - wk.group.position.x, center.z - wk.group.position.z);
    g.hud?.setVisible(false);
    music.setState('victory', { bars: 2 });
    sfx.click();
    speak(t('gb.c.building', 'Mãos à obra!'), { gap: 300 });
  }
  private fxStep(dt: number): void {
    const f = this.fx!;
    const g = this.g;
    const w = g.w!;
    const T = w.T;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    // degraus: cada um sobe rápido e "encaixa" (som + poeira + tábua voando)
    const N = Math.max(4, Math.round(f.dur * 1.6));
    const q = Math.min(N - 1, Math.floor(k * N));
    const fr = k * N - q;
    const prog = k >= 1 ? 1 : (q + ease(Math.min(1, fr * 2.6))) / N;
    const cut = f.y0 + (f.y1 - f.y0) * prog;
    f.plane.constant = cut;
    for (let i = 0; i < f.ring.geometry.attributes.position.count; i++) f.ring.geometry.attributes.position.setY(i, cut + 0.02);
    f.ring.geometry.attributes.position.needsUpdate = true;
    (f.ring.material as THREE.LineBasicMaterial).opacity = 0.6 + Math.sin(f.t * 12) * 0.35;
    // andaime: sobe logo no começo, desce no fim
    const sk = f.t < 0.6 ? ease(f.t / 0.6) : k > 0.92 ? Math.max(0.01, 1 - (k - 0.92) / 0.08) : 1;
    for (const sc of f.scaff) sc.scale.y = Math.max(0.01, sk);
    const wk = g.worker!;
    if (q !== f.step && k < 1) {
      f.step = q;
      sfx.thunk();
      tap('light');
      // poeira em volta
      for (const ft of f.foots)
        for (let i = 0; i < 6; i++) {
          const a = Math.random() * Math.PI * 2;
          const x = ft.x + Math.cos(a) * (ft.hx + 0.4);
          const z = ft.z + Math.sin(a) * (ft.hz + 0.4);
          w.clods.spawn(x, T.heightAt(x, z) + 0.2, z, Math.cos(a) * 1.4, 1.2 + Math.random(), Math.sin(a) * 1.4, 0.08 + Math.random() * 0.08, 0.78, 0.6, 0.42);
        }
      // tábua voa do Bloop até a linha da obra
      const m = buildPlank();
      const a = wk.group.position.clone().add(_v.set(0, 1.4, 0));
      const ft = f.foots[q % f.foots.length];
      const b = new THREE.Vector3(ft.x + (Math.random() - 0.5) * ft.hx, Math.min(f.y1, cut + 0.6), ft.z + (Math.random() - 0.5) * ft.hz);
      m.position.copy(a);
      w.scene.add(m);
      f.planks.push({ m, t: 0, a, b });
    }
    for (let i = f.planks.length - 1; i >= 0; i--) {
      const p = f.planks[i];
      p.t += dt / 0.55;
      const u = Math.min(1, p.t);
      p.m.position.lerpVectors(p.a, p.b, u);
      p.m.position.y += Math.sin(u * Math.PI) * 2.2;
      p.m.rotation.set(u * 5, u * 3, 0);
      p.m.scale.setScalar(1 - Math.max(0, u - 0.85) * 6);
      if (u >= 1) {
        p.m.removeFromParent();
        f.planks.splice(i, 1);
      }
    }
    // martelo
    if (f.t >= f.dur) wk.hammer = -1;
    else if (g.cur === wk && f.id !== 'portal') {
      wk.hammer = (f.t * 2.4) % 1;
      if (Math.floor(f.t * 2.4) !== Math.floor((f.t - dt) * 2.4)) sfx.knob();
    }
    // pronto: a obra fica girando mais um pouquinho para admirar (brilho)
    if (f.t >= f.dur && !f.temp?.userData.shown) {
      if (f.temp) f.temp.userData.shown = true;
      if (!f.sparkled) {
        f.sparkled = true;
        this.sparkle(f);
      }
    }
    if (f.t >= f.dur + 1.5) this.endFx();
  }
  /** câmera da obra: gira devagar em volta do prédio (true = a obra controla a câmera) */
  camera(dt: number, cam: THREE.PerspectiveCamera): boolean {
    const f = this.fx;
    if (!f) return false;
    void dt;
    const k = f.t / (f.dur + 1.5);
    const a = f.camA + 0.9 * ease(k) - 0.25;
    const R = Math.max(6, f.size * 2.3 + 4);
    const T = this.g.w!.T;
    const x = f.center.x + Math.sin(a) * R;
    const z = f.center.z + Math.cos(a) * R;
    const y = Math.max(T.heightAt(x, z) + 1.5, f.center.y + Math.max(2.5, f.size * 0.9) + 1.5 - k * 0.8);
    cam.position.set(x, y, z);
    cam.lookAt(f.center.x, f.center.y + Math.min(f.y1 - f.center.y, f.size) * 0.4, f.center.z);
    this.g.w!.follow(f.center.x, f.center.z);
    return true;
  }
  private endFx(): void {
    const f = this.fx!;
    this.fx = null;
    for (const [m, mt] of f.mats) m.material = mt;
    for (const c of f.clones) c.dispose();
    for (const sc of f.scaff) {
      sc.removeFromParent();
      sc.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    f.ring.removeFromParent();
    f.ring.geometry.dispose();
    for (const p of f.planks) p.m.removeFromParent();
    if (f.temp) {
      f.temp.removeFromParent();
      f.temp.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    const g = this.g;
    if (g.worker) g.worker.hammer = -1;
    if (!f.sparkled) this.sparkle(f);
    g.hud?.setVisible(true);
    f.done();
  }
  /** brilho de festa quando a obra fica pronta */
  private sparkle(f: Fx): void {
    const g = this.g;
    const w = g.w!;
    for (let i = 0; i < 70; i++) {
      const ft = f.foots[i % f.foots.length];
      const x = ft.x + (Math.random() - 0.5) * ft.hx * 2;
      const z = ft.z + (Math.random() - 0.5) * ft.hz * 2;
      const gold = i % 3 !== 0;
      w.drops.spawn(x, f.y1 - 0.5, z, (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3, 0.12, gold ? 1 : 0.6, gold ? 0.82 : 0.9, gold ? 0.2 : 1);
    }
    sfx.sparkle();
    audio.cash();
    music.sting('levelup');
    tap('heavy');
    if (g.worker) g.worker.hammer = -1;
  }
  private finishBuild(id: BId, quiet = false): void {
    const g = this.g;
    const w = g.w!;
    if (!this.has(id)) this.st.built.push(id);
    this.logAt(id);
    if (this.focus === id) this.focus = null;
    if (id === 'barrow') {
      const wk = g.worker!;
      wk.setNoBarrow(false);
      wk.cargo.cap = g.barrowCap();
      const p = this.site.lay.bench;
      if (!this.guest) wk.dropAt(p.x, p.z, p.yaw);
    } else if (id === 'sluice') {
      this.site.broken.visible = false;
      const p = this.site.lay.sluice;
      if (!this.guest && g.proc && !g.proc.hasSluiceNear(p.x, p.z, 1.5)) g.proc.placeSluice(p.x, p.z, p.yaw);
    } else w.setBuilt(id, true);
    if (quiet) return;
    g.host?.event(['cbuild', id]);
    const d = this.def(id);
    bigMoment(t('gb.c.built', 'Construído: {n}', { n: d.name() }), { icon: 'star' });
    window.setTimeout(() => this.say(d.done()), 900);
    this.goalK = '';
    g.persist();
  }
  /** a mina abriu (loja): obra animada do portal */
  portalFx(): void {
    const w = this.g.w!;
    if (w.built('portal') || this.fx) {
      w.setBuilt('portal', true);
      return;
    }
    this.startFx('portal', () => {
      w.setBuilt('portal', true);
      bigMoment(t('gb.c.mine', 'A mina abriu!'), { icon: 'star' });
    });
  }

  /* ============================== interface ============================== */
  private say(text: string): void {
    this.g.say(text);
  }
  /** chip do objetivo + botão do martelo (depois que o HUD existe) */
  attachUi(): void {
    const hud = this.g.hud;
    if (!hud || this.guest || this.goalEl) return;
    const el = document.createElement('div');
    el.className = 'gbc-goal';
    el.setAttribute('data-touch-ignore', '');
    el.addEventListener('click', () => {
      sfx.click();
      this.openGoal(true);
    });
    hud.el.appendChild(el);
    this.goalEl = el;
    const b = document.createElement('button');
    b.className = 'gb-b gbc-hammer';
    b.setAttribute('data-touch-ignore', '');
    b.innerHTML = SI.hammer;
    b.setAttribute('aria-label', t('gb.c.build', 'Construir'));
    b.addEventListener('click', () => {
      sfx.click();
      this.openMenu();
    });
    hud.el.querySelector('.gb-tr')?.prepend(b);
    this.btn = b;
  }
  private openGoal(voice: boolean): void {
    this.goalEl?.classList.add('open');
    this.openT = 4.2;
    if (voice) {
      const tx = this.goalEl?.dataset.say;
      if (tx) speak(tx, { gap: 300 });
    }
  }
  /** chip do objetivo: ícone + frase curta (abre 4 s e recolhe) + barrinha de moedas */
  private goalUi(): void {
    const el = this.goalEl;
    if (!el) return;
    const goal = this.goal();
    const shopBtn = this.g.hud?.el.querySelector('.gb-shop');
    shopBtn?.classList.toggle('gbc-pulse', goal === 'pickup');
    let icon: SIcon = 'shovel';
    let txt = '';
    let sayTx = '';
    let prog = -1;
    let ico2: SIcon | null = null;
    if (goal === 'dig') {
      icon = 'shovel';
      txt = t('gb.c.g.dig', 'Cave a terra boa com a pá');
      sayTx = t('gb.c.s.dig', 'Bem-vindo ao garimpo! Siga a seta e cave a terra perto do rio com a pá.');
    } else if (goal === 'pan') {
      icon = 'pan';
      txt = t('gb.c.g.pan', 'Lave a terra na bateia, na beira do rio');
      sayTx = t('gb.c.s.pan', 'Agora leve a terra até a água e lave na bateia!');
    } else if (goal === 'sell') {
      icon = 'sell';
      txt = t('gb.c.g.sell', 'Venda o ouro no barco');
      sayTx = t('gb.c.s.sell', 'Ouro! Leve até o barco do comprador e venda.');
    } else if (goal === 'pickup') {
      icon = 'pickup';
      txt = t('gb.c.g.pickup', 'Compre a picape na loja');
      sayTx = t('gb.c.s.pickup', 'Agora compre a sua primeira picape na loja!');
    } else if (goal === 'done') {
      if (!this.celebrated && this.st.log.pickup !== undefined && !this.st.log.done) {
        this.celebrated = true;
        this.logAt('done');
        bigMoment(t('gb.c.doneBig', 'Seu garimpo cresceu!'), { icon: 'star', sub: t('gb.c.doneSub', 'Agora é com você') });
        this.say(t('gb.c.s.done', 'Seu garimpo cresceu! Agora é com você: máquinas, mina e muito ouro.'));
      }
      el.hidden = true;
      if (this.btn) this.btn.hidden = DEFS.every((d) => this.has(d.id));
      return;
    } else {
      const d = this.def(goal);
      ico2 = d.icon;
      if (this.money >= d.price) {
        icon = 'hammer';
        txt = t('gb.c.g.build', 'Construa: {b}', { b: d.name() });
        sayTx = t('gb.c.s.build', 'Já dá para construir: {b}! Siga a seta até o lugar brilhando e toque em Construir.', { b: d.name() });
      } else {
        icon = 'coin';
        txt = t('gb.c.g.save', 'Junte {n} para: {b}', { n: d.price, b: d.name() });
        sayTx = t('gb.c.s.save', 'Junte moedas para construir: {b}.', { b: d.name() });
        prog = Math.max(0, Math.min(1, this.money / d.price));
      }
    }
    el.hidden = false;
    const key = goal + '|' + icon;
    if (key !== this.goalK) {
      const first = !this.goalK;
      this.goalK = key;
      el.innerHTML = `<div class="gbc-gi">${SI[icon]}${ico2 ? `<i>${SI[ico2]}</i>` : ''}</div><div class="gbc-gt"><b>${esc(txt)}</b><span class="gbc-bar"><u></u></span></div>`;
      el.dataset.say = sayTx;
      el.classList.toggle('prog', prog >= 0);
      this.openGoal(false);
      window.setTimeout(() => speak(sayTx, { gap: 400 }), first ? 1600 : 400);
      sfx.ding();
    }
    const u = el.querySelector<HTMLElement>('.gbc-bar u');
    if (u && prog >= 0) u.style.width = Math.round(prog * 100) + '%';
    el.classList.toggle('ready', icon === 'hammer');
    this.btn?.classList.toggle('gbc-pulse', icon === 'hammer');
  }

  /** menu "Construir": tudo o que dá para construir, com preço; trancado mostra cadeado */
  openMenu(): void {
    const g = this.g;
    const cards = DEFS.map((d) => {
      const done = this.has(d.id);
      const open = this.unlocked(d) && (d.id !== 'barrow' || this.st.log.sell !== undefined);
      const can = open && this.money >= d.price;
      const next = this.nextChain()?.id === d.id;
      const cls = done ? 'done' : !open ? 'locked' : next ? 'next' : '';
      const badge = done ? SI.check : !open ? SI.lock : '';
      return `<button class="gbc-card ${cls}" data-b="${d.id}" ${open ? '' : 'disabled'}><div class="gbc-ci">${SI[d.icon]}${badge ? `<em>${badge}</em>` : ''}</div><span>${esc(d.name())}</span>${done ? '<small>&nbsp;</small>' : `<small class="${can ? 'ok' : ''}">${SI.coin}${d.price}</small>`}</button>`;
    }).join('');
    const mach = `<div class="gbc-card ${this.has('garage') ? '' : 'locked'}" data-shop><div class="gbc-ci">${SI.pickup}${this.has('garage') ? '' : `<em>${SI.lock}</em>`}</div><span>${esc(t('gb.c.machines', 'Máquinas (loja)'))}</span><small>&nbsp;</small></div>`;
    const d = g.overlay(`<button class="gb-b gb-x" data-x>${IC.close}</button><h2>${SI.hammer.replace('<svg', '<svg style="width:26px;height:26px;vertical-align:-6px"')} ${esc(t('gb.c.build', 'Construir'))}</h2><div class="gbc-grid">${cards}${mach}</div>`, 'gbc-menu');
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-x]')) return g.closeOv();
      if (el.closest('[data-shop]')) {
        if (!this.has('garage')) return;
        g.closeOv();
        g.openShop();
        return;
      }
      const b = el.closest<HTMLElement>('[data-b]');
      if (!b || (b as HTMLButtonElement).disabled) return;
      const id = b.dataset.b as BId;
      if (this.has(id)) return;
      sfx.click();
      this.focus = id;
      g.closeOv();
      this.goalK = '';
      this.refreshGhost();
      const df = this.def(id);
      this.say(this.money >= df.price ? t('gb.c.s.go', 'Siga a seta até o lugar brilhando e toque em Construir!') : t('gb.c.s.save', 'Junte moedas para construir: {b}.', { b: df.name() }));
    });
  }

  /** testes / relatório */
  debug = {
    goal: () => this.goal(),
    defs: () => DEFS.map((d) => ({ id: d.id, price: d.price, dur: d.dur })),
    log: () => ({ ...this.st.log }),
    build: (id: BId) => {
      const d = this.def(id);
      this.s.money = Math.max(this.s.money, d.price);
      this.tryBuild(d);
    },
    finish: (id: BId) => this.finishBuild(id, true),
    fx: () => (this.fx ? { id: this.fx.id, t: this.fx.t, dur: this.fx.dur } : null),
    layout: () => this.site.lay,
    menu: () => this.openMenu(),
    sell: () => this.sell(),
  };

  dispose(): void {
    if (this.fx) {
      const f = this.fx;
      for (const [m, mt] of f.mats) m.material = mt;
      this.fx = null;
    }
    this.clearGhost();
    this.marker.removeFromParent();
    this.site.dispose();
    this.goalEl?.remove();
    this.btn?.remove();
  }
}
