/* ============================================================
 *  GARIMPO BRUTO — BENEFICIAMENTO (recuperar o ouro com água).
 *  Terra levada não é ouro no bolso: o ouro precisa ser RECUPERADO, como no garimpo de verdade
 *  (classificar → lavar → concentrar em calha com riffles/tapete → limpar o concentrado na
 *  bateia ou na mesa → secar e pesar). Etapas do jogo:
 *   - COMEÇO (à mão): na beira d'água (rio, lago, represa) ou no tambor d'água, o garimpeiro
 *     com terra no carrinho usa a PENEIRA + BATEIA (pan.ts). Recupera quase tudo e acha pepitas.
 *   - MEIO: CALHA (sluice) comprada na loja e posta num riacho/correnteza (ou com baldes de
 *     água): despeja terra, ela processa sozinha; a inclinação e a água mudam a recuperação
 *     (medidor com zona verde); de tempos em tempos LIMPAR (clean.ts) → bateia ou lavadora.
 *   - FIM: a LAVADORA ganha grelha, trommel, calhas extras, mesa vibratória e sala do ouro;
 *     cada uma aumenta a vazão e/ou a recuperação % (placa em cima da lavadora). O concentrado
 *     vai para a "caixa do ouro": automático (perde um pouco) ou à mão (bateia, bônus).
 *   - REJEITO: o que não foi recuperado sai com o rejeito (monte de areia com teor de ouro):
 *     dá para cavar e passar de novo com equipamento melhor.
 *  Online: o anfitrião simula calhas, lavadora e rejeitos; a bateia é local de cada jogador e
 *  o resultado vai como ação (o anfitrião confere com o material que o jogador tirou).
 *  Ganchos no jogo (game.ts): start, step/stepGuest, plantStep (rateMul/plantFeed/tailGrade),
 *  receiverAt, openShop/buy, persist, setTier, teardown; mp.ts: tick (netTake), snap
 *  (netApply), action (netAction); save.ts: campo `proc`.
 * ============================================================ */
import './proc.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import { sfx } from '../../../3d/common/sfx';
import { bigMoment, notify } from '../../../ui/notify';
import { CELL, MAT_SAND, V, type Terrain } from '../terrain';
import type { Receiver, Worker } from '../machines';
import type { Garimpo } from '../game';
import type { NetMsg } from '../net';
import { PIC, type PicKey } from './icons';
import { PanGame, type PanResult } from './pan';
import { CleanGame } from './clean';
import { Badge, buildBarrel, buildGoldRoom, buildGrizzly, buildRuns, buildShaker, buildSluice, buildStake, type SluiceMesh } from './models';

type Diff = 0 | 1 | 2 | 3;
export interface ProcSave {
  v: 1;
  /** melhorias da lavadora: grelha, trommel, calhas, mesa, sala do ouro (0/1) */
  upg: number[];
  manual: boolean;
  /** caixa de concentrado da lavadora (g) */
  bin: number;
  inv: number;
  sl: { x: number; z: number; yaw: number; slope: number; load: number; gold: number; conc: number; mat: number; water: number }[];
  tl: { x: number; z: number }[];
  combo: number;
}

/* ---------------- números (equilíbrio) ---------------- */
/** recuperação da lavadora sem melhorias, por dificuldade */
const REC0 = [0.62, 0.52, 0.47, 0.42];
export const UPG = [
  { id: 'grizzly', icon: 'grizzly' as PicKey, price: 500, rec: 0.05, rate: 1.2 },
  { id: 'trommel', icon: 'trommel' as PicKey, price: 2200, rec: 0.13, rate: 1.5 },
  { id: 'runs', icon: 'sluice' as PicKey, price: 4000, rec: 0.13, rate: 1.0 },
  { id: 'shaker', icon: 'shaker' as PicKey, price: 7500, rec: 0.09, rate: 1.0 },
  { id: 'goldroom', icon: 'goldroom' as PicKey, price: 12000, rec: 0, rate: 1.0 },
];
/** limpeza automática (concentrado → barra): sem nada, com mesa, com sala do ouro */
const FIN = [0.86, 0.92, 0.97];
export const SLUICE_PRICE = 450;
const SLUICE_MAX = 3;
/** calha: vazão (m³/s com água boa), recuperação na zona verde, tapete cheio (m³) */
const SL_RATE = 0.045;
const SL_REC = [0.9, 0.84, 0.8, 0.76];
const SL_MAT = 1.2;
/** inclinação (5 posições): fator na velocidade da água */
const SLOPE_K = [0.45, 0.7, 1.0, 1.35, 1.85];
const SLOPE_A = [0.03, 0.06, 0.09, 0.13, 0.18];
/** zona verde da velocidade */
const Z0 = 0.75;
const Z1 = 1.3;
/** balde d'água na calha: 1 balde ≈ 16 s de lavagem */
const SL_WATER_USE = 0.06;
/** chance de pepita por carrinho (multiplica g/5) e fração do ouro que vira pepita */
const NUG_K = [1.3, 1.0, 0.9, 0.8];

interface Sluice {
  x: number;
  z: number;
  yaw: number;
  slope: number;
  load: number;
  gold: number;
  conc: number;
  mat: number;
  water: number;
  /** derivados (por passo) */
  flow: number;
  speed: number;
  rec: number;
  run: number;
  tailV: number;
  tailG: number;
  m: SluiceMesh;
}
interface Pend {
  gold: number;
  vol: number;
  x: number;
  z: number;
  yaw: number;
  src: 'barrow' | 'sluice' | 'bin';
  i: number;
}
interface Tail {
  x: number;
  z: number;
  g: number;
  stake: THREE.Group;
  badge: Badge;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fmtG = (g: number) => (g < 10 ? g.toFixed(1).replace('.', ',') : Math.round(g).toLocaleString('pt-BR'));
const _v = new THREE.Vector3();

export class ProcSystem {
  private g: Garimpo;
  private diff: Diff;
  upg = [0, 0, 0, 0, 0];
  manual = false;
  bin = 0;
  inv = 0;
  combo = 0;
  private sl: Sluice[] = [];
  private tails: Tail[] = [];
  private pend = new Map<string, Pend>();
  /** rejeito da lavadora ainda não depositado (g) */
  private tailGold = 0;
  private toastG = 0;
  private toastT = 0;
  private group = new THREE.Group();
  private parts: { grizzly?: THREE.Object3D; runs?: { root: THREE.Group; waters: THREE.Mesh[] }; shaker?: ReturnType<typeof buildShaker>; room?: THREE.Object3D } = {};
  private badge = new Badge('gold', 2.6);
  private barrel: THREE.Group;
  private barrelPos = { x: 0, z: 0 };
  /** minijogo aberto */
  private game: PanGame | CleanGame | null = null;
  private ui: { bar: HTMLDivElement; panel: HTMLDivElement; gauge: HTMLCanvasElement } | null = null;
  private barKey = '';
  private panelKey = '';
  private uiT = 0;
  private tailT = 0;
  private lastWater = 0;
  private nearSl = -1;
  private nearPlant = false;
  private canPan = false;
  private time = 0;
  private netT = 0;
  private dirty = true;
  /** para testes: força a beira d'água */
  forceWater = false;

  constructor(g: Garimpo, s: import('../save').SlotSave) {
    this.g = g;
    this.diff = s.diff;
    const w = g.w!;
    w.scene.add(this.group);
    const p = s.proc;
    if (p && p.v === 1) {
      this.upg = [0, 1, 2, 3, 4].map((i) => (p.upg?.[i] ? 1 : 0));
      this.manual = !!p.manual;
      this.bin = num(p.bin);
      this.inv = num(p.inv);
      this.combo = num(p.combo);
      for (const q of p.sl || []) {
        const sl = this.addSluice(q.x, q.z, q.yaw);
        sl.slope = clamp(Math.round(num(q.slope, 2)), 0, 4);
        sl.load = num(q.load);
        sl.gold = num(q.gold);
        sl.conc = num(q.conc);
        sl.mat = num(q.mat);
        sl.water = num(q.water);
      }
      for (const q of p.tl || []) this.addTail(q.x, q.z);
    }
    // tambor d'água ao lado da moega (bateia sem rio)
    this.barrel = buildBarrel();
    _v.set(-5.0, 0, 5.6);
    w.plant.root.localToWorld(_v);
    this.barrelPos = { x: _v.x, z: _v.z };
    this.barrel.position.set(_v.x, w.T.heightAt(_v.x, _v.z), _v.z);
    this.barrel.rotation.y = w.plant.root.rotation.y;
    this.group.add(this.barrel);
    w.addCircle({ x: _v.x, z: _v.z, r: 0.55 });
    // placa da recuperação em cima da lavadora
    _v.set(0, 6.0, 1.5);
    w.plant.root.localToWorld(_v);
    this.badge.sprite.position.copy(_v);
    this.group.add(this.badge.sprite);
    this.applyParts();
    // rejeitos carregados: cor de areia de novo (o save do terreno não guarda o material)
    for (const tl of this.tails) this.paintSand(tl.x, tl.z, 3.2);
    this.buildUi();
  }

  /* ============================== números ============================== */
  /** recuperação da lavadora (primária, antes da limpeza) */
  plantRec(): number {
    let r = REC0[this.diff];
    for (let i = 0; i < UPG.length; i++) if (this.upg[i]) r += UPG[i].rec;
    return Math.min(0.95, r);
  }
  /** limpeza automática */
  finRec(): number {
    return this.upg[4] ? FIN[2] : this.upg[3] ? FIN[1] : FIN[0];
  }
  /** recuperação total mostrada (automático) */
  totalRec(): number {
    return this.plantRec() * this.finRec();
  }
  /** multiplicador da vazão da lavadora (grelha, trommel) */
  rateMul(): number {
    let k = 1;
    for (let i = 0; i < UPG.length; i++) if (this.upg[i]) k *= UPG[i].rate;
    return k;
  }

  /* ============================== lavadora (ganchos) ============================== */
  /** lavadora lavou v m³ com g gramas: concentra (vai para a caixa), o resto é rejeito. Devolve g para o estoque já. */
  plantFeed(v: number, gold: number): number {
    const rec = this.plantRec();
    this.bin += gold * rec;
    this.tailGold += gold * (1 - rec);

    void v;
    return 0;
  }
  /** teor do rejeito que sai agora (g/m³) e marca o monte */
  tailGrade(vol: number, x: number, z: number): number {
    const gr = vol > 1e-4 ? this.tailGold / vol : 0;
    this.tailGold = 0;
    this.markTail(x, z, 2.2);
    return Math.min(3000, gr);
  }

  /* ============================== passo ============================== */
  step(dt: number): void {
    const g = this.g;
    const w = g.w;
    const s = g.sv;
    if (!w || !s) return;
    this.time += dt;
    const host = !g.guest;
    if (host) {
      // caixa do ouro: automático escoa para o estoque (com perda); manual espera a bateia
      if (!this.manual && this.bin > 1e-4) {
        const d = Math.min(this.bin, dt * Math.max(0.6, this.bin * 0.35));
        this.bin -= d;
        const got = d * this.finRec();
        this.tailGold += d - got;
        s.stock += got;
        this.toastG += got;
      }
      for (let i = 0; i < this.sl.length; i++) this.sluiceStep(this.sl[i], dt);
      this.waterBuckets();
    }
    // aviso "+g" quando a lavadora termina
    this.toastT -= dt;
    if (this.toastG > 0.05 && this.toastT <= 0 && (s.plantVol < 1e-3 || this.toastG > 20) && this.bin < 0.05) {
      g.toast('+' + fmtG(this.toastG) + ' g');
      audio.coin(2);
      this.toastG = 0;
      this.toastT = 1.5;
    }
    this.visuals(dt);
    this.tailT -= dt;
    if (this.tailT <= 0) {
      this.tailT = 2;
      this.measureTails();
    }
    this.uiUpdate();
  }

  /* ---------------- calhas ---------------- */
  private addSluice(x: number, z: number, yaw: number): Sluice {
    const m = buildSluice();
    const sl: Sluice = { x, z, yaw, slope: 2, load: 0, gold: 0, conc: 0, mat: 0, water: 0, flow: 0, speed: 0, rec: 0, run: 0, tailV: 0, tailG: 0, m };
    this.placeMesh(sl);
    this.group.add(m.root);
    this.sl.push(sl);
    this.dirty = true;
    return sl;
  }
  private placeMesh(sl: Sluice): void {
    const T = this.g.w!.T;
    const m = sl.m;
    // cabeça mais alta que a cauda: ângulo da inclinação
    const hy = T.heightAt(sl.x + Math.sin(sl.yaw) * 1.6, sl.z + Math.cos(sl.yaw) * 1.6);
    const ty = T.heightAt(sl.x - Math.sin(sl.yaw) * 1.6, sl.z - Math.cos(sl.yaw) * 1.6);
    m.root.position.set(sl.x, Math.min(hy, ty) - 0.05, sl.z);
    m.root.rotation.y = sl.yaw;
    m.tilt.position.y = 0.95 + Math.max(0, hy - ty) * 0.5;
    m.tilt.rotation.x = -SLOPE_A[sl.slope] * 1.6;
    // pernas da cauda acompanham
    const drop = Math.sin(SLOPE_A[sl.slope] * 1.6) * 3.2;
    for (const l of m.legs) {
      l.scale.y = Math.max(0.15, (m.tilt.position.y - drop) / 0.95);
      l.position.y = m.tilt.position.y - drop;
    }
  }
  private headPos(sl: Sluice, out: THREE.Vector3): THREE.Vector3 {
    return out.set(sl.x + Math.sin(sl.yaw) * 1.6, 0, sl.z + Math.cos(sl.yaw) * 1.6);
  }
  private tailPos(sl: Sluice, out: THREE.Vector3): THREE.Vector3 {
    return out.set(sl.x - Math.sin(sl.yaw) * 2.6, 0, sl.z - Math.cos(sl.yaw) * 2.6);
  }
  /** água chegando na cabeça: correnteza (simulação) — 0..2 */
  private flowAt(sl: Sluice): number {
    const W = this.g.water;
    if (!W) return 0;
    const sim = W.sim;
    let best = 0;
    for (let k = -1; k <= 1; k++) {
      const x = sl.x + Math.sin(sl.yaw) * (1.6 - k * 1.4);
      const z = sl.z + Math.cos(sl.yaw) * (1.6 - k * 1.4);
      const c = sim.cellOf(x, z);
      const d = sim.d[c];
      if (d < 0.03) continue;
      const u = Math.hypot(sim.ux[c], sim.uz[c]);
      best = Math.max(best, d * (0.25 + u) * 4);
    }
    return Math.min(2, best);
  }
  private sluiceStep(sl: Sluice, dt: number): void {
    const stream = this.flowAt(sl);
    let flow = stream;
    if (flow < 0.25 && sl.water > 0) flow = 0.85;
    sl.flow = flow;
    sl.speed = flow * SLOPE_K[sl.slope];
    const sp = sl.speed;
    // fora da zona: devagar entope (lavagem lenta, ouro preso na lama); rápido demais leva o ouro
    const off = sp < Z0 ? (Z0 - sp) / Z0 : sp > Z1 ? (sp - Z1) / Z1 : 0;
    const zone = clamp(1 - off * 1.15, 0.3, 1);
    const matK = sl.mat <= SL_MAT ? 1 : clamp(1 - ((sl.mat - SL_MAT) / SL_MAT) * 0.45, 0.55, 1);
    const over = sl.load > 0.3 ? 0.8 : 1;
    sl.rec = SL_REC[this.diff] * zone * matK * over;
    sl.run = 0;
    if (sl.load > 1e-4 && flow > 0.05) {
      const rate = SL_RATE * Math.min(1, flow) * (sp < Z0 ? clamp(sp / Z0, 0.3, 1) : 1);
      const v = Math.min(sl.load, rate * dt);
      const gg = (sl.gold * v) / sl.load;
      sl.load -= v;
      sl.gold -= gg;
      if (sl.load < 1e-4) sl.load = sl.gold = 0;
      sl.conc += gg * sl.rec;
      sl.tailV += v;
      sl.tailG += gg * (1 - sl.rec);
      sl.mat += v;
      sl.run = 1;
      if (stream < 0.25) sl.water = Math.max(0, sl.water - dt * SL_WATER_USE);
      if (sl.tailV > 0.12) {
        this.tailPos(sl, _v);
        const T = this.g.w!.T;
        T.deposit(_v.x, _v.z, sl.tailV, 1.3, sl.tailG / sl.tailV);
        T.relax(_v.x, _v.z, 2);
        this.markTail(_v.x, _v.z, 1.6);
        sl.tailV = sl.tailG = 0;
      }
    }
  }
  /** balde d'água jogado perto da cabeça da calha enche o reservatório dela */
  private waterBuckets(): void {
    const wk = this.g.worker;
    if (!wk) return;
    const wv = wk.water;
    if (wv < this.lastWater - 1e-4) {
      const used = this.lastWater - wv;
      for (const sl of this.sl) {
        this.headPos(sl, _v);
        if (Math.hypot(wk.group.position.x - _v.x, wk.group.position.z - _v.z) < 3.2) {
          sl.water = Math.min(1, sl.water + used * 0.9);
          break;
        }
      }
    }
    this.lastWater = wv;
  }
  /** recebedor: moega da calha (pá, carrinho, caçamba) */
  receiverAt(x: number, y: number, z: number, slack: number): Receiver | null {
    for (const sl of this.sl) {
      this.headPos(sl, _v);
      const gy = this.g.w!.T.heightAt(_v.x, _v.z);
      if (Math.hypot(x - _v.x, z - _v.z) < 1.0 + slack * 0.6 && y > gy - 1 && y < gy + 5) {
        return {
          take: (vol, gold) => {
            if (this.g.guest) return vol;
            sl.load += vol;
            sl.gold += gold;
            return vol;
          },
        };
      }
    }
    return null;
  }

  /* ---------------- rejeitos ---------------- */
  private markTail(x: number, z: number, r: number): void {
    this.paintSand(x, z, r);
    for (const tl of this.tails) if (Math.hypot(tl.x - x, tl.z - z) < 7) return;
    this.addTail(x, z);
  }
  private addTail(x: number, z: number): void {
    const stake = buildStake();
    const w = this.g.w!;
    const ox = x + 2.4;
    stake.position.set(ox, w.T.heightAt(ox, z), z);
    this.group.add(stake);
    const badge = new Badge('tail', 1.8);
    badge.sprite.position.set(ox, stake.position.y + 2.3, z);
    badge.set('0 g');
    this.group.add(badge.sprite);
    this.tails.push({ x, z, g: 0, stake, badge });
    this.dirty = true;
  }
  /** terra solta com cor de areia (rejeito lavado) */
  private paintSand(x: number, z: number, r: number): void {
    const T: Terrain = this.g.w!.T;
    const i0 = Math.max(0, Math.floor((x - r) / CELL));
    const i1 = Math.min(V - 1, Math.ceil((x + r) / CELL));
    const j0 = Math.max(0, Math.floor((z - r) / CELL));
    const j1 = Math.min(V - 1, Math.ceil((z + r) / CELL));
    let any = false;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * V + i;
        if (T.h[k] > T.h0[k] + 0.03 && Math.hypot(i * CELL - x, j * CELL - z) < r && T.mat[k] !== MAT_SAND) {
          T.mat[k] = MAT_SAND;
          any = true;
        }
      }
    if (any) T.markRect(i0, j0, i1, j1);
  }
  /** ouro que sobrou nos montes (terra solta × teor) */
  private measureTails(): void {
    const T = this.g.w!.T;
    const CA = CELL * CELL;
    for (const tl of this.tails) {
      const R = 4;
      const i0 = Math.max(0, Math.floor((tl.x - R) / CELL));
      const i1 = Math.min(V - 1, Math.ceil((tl.x + R) / CELL));
      const j0 = Math.max(0, Math.floor((tl.z - R) / CELL));
      const j1 = Math.min(V - 1, Math.ceil((tl.z + R) / CELL));
      let gsum = 0;
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const k = j * V + i;
          const loose = T.h[k] - T.h0[k];
          if (loose > 0.01) gsum += loose * CA * T.pay[k];
        }
      if (!this.g.guest) tl.g = gsum;
      tl.badge.set('≈ ' + fmtG(tl.g) + ' g');
      tl.badge.sprite.visible = tl.g > 0.05;
    }
  }

  /* ---------------- visual ---------------- */
  private visuals(dt: number): void {
    const g = this.g;
    const spin = g.plantSpinK;
    this.badge.set(Math.round(this.totalRec() * 100) + '%');
    const P = this.parts;
    if (P.runs) for (const wm of P.runs.waters) (wm.material as THREE.MeshPhongMaterial).map!.offset.y -= dt * (0.4 + spin * 1.6);
    if (P.shaker) {
      P.shaker.deck.position.x = Math.sin(this.time * 40) * 0.025 * spin;
      (P.shaker.water.material as THREE.MeshPhongMaterial).map!.offset.x -= dt * 0.8 * spin;
    }
    const w = g.w!;
    for (const sl of this.sl) {
      const m = sl.m;
      const on = sl.flow > 0.05;
      m.water.visible = on;
      const wm = m.water.material as THREE.MeshPhongMaterial;
      wm.map!.offset.y += dt * (0.3 + Math.min(2, sl.speed) * 1.4);
      wm.opacity = 0.45 + Math.min(1, sl.flow) * 0.35;
      const cm = m.conc.material as THREE.MeshLambertMaterial;
      cm.opacity = clamp(sl.mat / SL_MAT, 0, 1) * 0.85;
      m.heap.scale.y = 0.01 + Math.min(1, sl.load / 0.25);
      m.heap.visible = sl.load > 0.003;
      if (sl.run && Math.random() < 0.5) {
        this.tailPos(sl, _v);
        const y = w.T.heightAt(_v.x, _v.z) + 0.5;
        w.drops.spawn(_v.x + Math.sin(sl.yaw) * 0.9, y, _v.z + Math.cos(sl.yaw) * 0.9, -Math.sin(sl.yaw) * 1.2, 0.4, -Math.cos(sl.yaw) * 1.2, 0.07, 0.6, 0.8, 1);
        if (Math.random() < 0.4) w.clods.spawn(_v.x + Math.sin(sl.yaw) * 0.9, y, _v.z + Math.cos(sl.yaw) * 0.9, -Math.sin(sl.yaw) * 0.9, 0.2, -Math.cos(sl.yaw) * 0.9, 0.05, 0.62, 0.55, 0.45);
      }
    }
  }
  /** monta/mostra as peças das melhorias na lavadora */
  private applyParts(): void {
    const w = this.g.w!;
    const pl = w.plant;
    const T = w.T;
    const P = this.parts;
    // trommel da lavadora só com a melhoria
    pl.trommel.visible = !!this.upg[1];
    const sit = (o: THREE.Object3D, lx: number, lz: number, solid: number) => {
      _v.set(lx, 0, lz);
      pl.root.localToWorld(_v);
      o.position.set(lx, T.heightAt(_v.x, _v.z) - pl.root.position.y, lz);
      pl.root.add(o);
      if (solid > 0) w.addCircle({ x: _v.x, z: _v.z, r: solid });
    };
    if (this.upg[0] && !P.grizzly) {
      P.grizzly = buildGrizzly();
      pl.root.add(P.grizzly);
    }
    if (this.upg[2] && !P.runs) {
      P.runs = buildRuns();
      pl.root.add(P.runs.root);
    }
    if (this.upg[3] && !P.shaker) {
      P.shaker = buildShaker();
      sit(P.shaker.root, -4.2, -5.4, 1.4);
    }
    if (this.upg[4] && !P.room) {
      P.room = buildGoldRoom();
      sit(P.room, -7.4, -4.6, 1.9);
      P.room.rotation.y = Math.PI / 2;
      this.g.w!.blockers.push({ x: _v.x, z: _v.z, r: 2.2, y: P.room.position.y + pl.root.position.y + 2.8 });
    }
    pl.root.updateMatrixWorld(true);
  }

  /* ============================== jogador: bateia, calha, caixa ============================== */
  private atWater(): boolean {
    if (this.forceWater) return true;
    const wk = this.g.worker!;
    const w = this.g.w!;
    const p = wk.group.position;
    if (Math.hypot(p.x - this.barrelPos.x, p.z - this.barrelPos.z) < 2.6) return true;
    for (const d of [1.3, 2.2]) {
      const x = p.x + Math.sin(wk.group.rotation.y) * d;
      const z = p.z + Math.cos(wk.group.rotation.y) * d;
      if (w.waterY(x, z) > w.T.heightAt(x, z) + 0.08) return true;
    }
    return false;
  }
  private onFoot(): boolean {
    const g = this.g;
    return !!g.worker && g.cur === g.worker && !g.inMine;
  }
  /** abre a bateia com o carrinho (a pé, na água) */
  startPan(): void {
    const g = this.g;
    const wk = g.worker!;
    if (this.game || !this.onFoot() || wk.cargo.vol < 0.004) return;
    const gold = wk.cargo.gold;
    const vol = wk.cargo.vol;
    // pepita: carrinhos ricos às vezes trazem uma (no garimpo de verdade é a fração grossa)
    let nug = 0;
    const chance = clamp(gold / 5, 0, 0.5) * NUG_K[this.diff];
    if (gold > 0.3 && Math.random() < chance) nug = gold * (0.25 + Math.random() * 0.15);
    this.request({ op: 'take', src: 'barrow' });
    this.open(
      (root, done) =>
        new PanGame(root, { mode: 'full', gold: gold - nug, nugget: nug, diff: this.diff, tier: g.w!.tier, sieve: true, combo: this.combo, done }),
      vol,
    );
  }
  /** limpa a calha mais perto */
  startClean(i: number): void {
    const sl = this.sl[i];
    if (this.game || !sl || sl.conc < 0.01) return;
    const grams = sl.conc;
    this.request({ op: 'take', src: 'sluice', i });
    this.pauseWorld(true);
    const root = this.root();
    this.game = new CleanGame(root, grams, this.g.w!.tier, (c) => {
      this.game = null;
      if (c === 'pan') {
        this.open((r, done) => new PanGame(r, { mode: 'clean', gold: grams, nugget: 0, diff: this.diff, tier: this.g.w!.tier, sieve: false, combo: this.combo, done }), 0.02);
      } else {
        this.pauseWorld(false);
        this.request(c === 'plant' ? { op: 'toPlant' } : { op: 'pan', g: 0, cancel: 1 });
        if (c === 'plant') notify(t('gb.p.toPlant', 'Concentrado na lavadora: {n} g', { n: fmtG(grams) }), { icon: 'arrow-up', kind: 'good' });
      }
    });
  }
  /** limpa a caixa da lavadora na bateia (modo manual) */
  startBin(): void {
    if (this.game || this.bin < 0.05) return;
    const grams = this.bin;
    this.request({ op: 'take', src: 'bin' });
    this.open((r, done) => new PanGame(r, { mode: 'clean', gold: grams, nugget: 0, diff: this.diff, tier: this.g.w!.tier, sieve: false, combo: this.combo, done }), 0.02);
  }
  private root(): HTMLElement {
    return (document.querySelector('.gb-root') as HTMLElement | null) ?? document.body;
  }
  private open(mk: (root: HTMLElement, done: (r: PanResult) => void) => PanGame, vol: number): void {
    this.pauseWorld(true);
    void vol;
    this.game = mk(this.root(), (r) => {
      this.game = null;
      this.pauseWorld(false);
      this.request({ op: 'pan', g: r2(r.grams), lost: r2(r.lost), cancel: r.cancelled ? 1 : 0, combo: r.combo });
      if (!r.cancelled) {
        this.combo = r.combo;
        if (r.grams > 0.005) {
          this.g.toast('+' + fmtG(r.grams) + ' g');
          audio.coin(3);
        }
        if (r.nug > 0) bigMoment(t('gb.p.nugget', 'Pepita de {n} g!', { n: fmtG(r.nug) }), { icon: 'star' });
        if (r.combo >= 2) notify(t('gb.p.combo', 'Bateia limpa ×{n}! +{m}', { n: r.combo, m: Math.min(50, r.combo * 5) }), { icon: 'star', kind: 'good' });
      }
    });
  }
  private pauseWorld(on: boolean): void {
    const g = this.g;
    g.hud?.setVisible(!on);
    if (this.ui) this.ui.bar.hidden = this.ui.panel.hidden = on;
    if (on) {
      g.pause();
      if (g.worker) g.worker.extMove = -1;
    } else g.resume();
  }

  /* ---------------- ações (local no anfitrião, pedido na rede no convidado) ---------------- */
  private request(m: Record<string, unknown>): void {
    const g = this.g;
    if (g.guest) {
      (g.mp as unknown as { action(k: string, e: Record<string, unknown>): void }).action('proc', m);
      return;
    }
    this.apply('me', g.worker!, m);
  }
  /** mp.ts (anfitrião): ação de um convidado */
  netAction(id: string, wk: Worker, m: NetMsg): void {
    this.apply(id, wk, m);
  }
  private apply(who: string, wk: Worker, m: Record<string, unknown>): void {
    const g = this.g;
    const s = g.sv!;
    const op = m.op;
    const p = wk.group.position;
    if (op === 'take') {
      // devolve o que estava pendente (não deveria acontecer)
      this.restore(who, wk, 0);
      const src = m.src;
      if (src === 'barrow') {
        if (wk.cargo.vol < 1e-4) return;
        this.pend.set(who, { gold: wk.cargo.gold, vol: wk.cargo.vol, x: p.x, z: p.z, yaw: wk.group.rotation.y, src: 'barrow', i: -1 });
        wk.cargo.vol = wk.cargo.gold = 0;
      } else if (src === 'sluice') {
        const i = Math.round(num(m.i, -1));
        const sl = this.sl[i];
        if (!sl || Math.hypot(sl.x - p.x, sl.z - p.z) > 8) return;
        this.pend.set(who, { gold: sl.conc, vol: 0.03, x: sl.x, z: sl.z, yaw: sl.yaw, src: 'sluice', i });
        sl.conc = 0;
        sl.mat = 0;
      } else if (src === 'bin') {
        this.pend.set(who, { gold: this.bin, vol: 0.03, x: p.x, z: p.z, yaw: 0, src: 'bin', i: -1 });
        this.bin = 0;
      }
    } else if (op === 'pan') {
      const pd = this.pend.get(who);
      if (!pd) return;
      this.pend.delete(who);
      const lost = clamp(num(m.lost), 0, pd.gold);
      if (m.cancel) {
        // desistiu: o material volta (menos o ouro que caiu)
        this.restoreP(pd, wk, lost);
        this.tailsAt(pd, 0, lost);
        return;
      }
      const got = clamp(num(m.g), 0, pd.gold);
      s.stock += got;
      this.tailsAt(pd, pd.vol, pd.gold - got);
      const combo = clamp(Math.round(num(m.combo)), 0, 99);
      if (combo >= 2) s.money += Math.min(50, combo * 5);
      if (who !== 'me' && got > 0.005) g.toast('+' + fmtG(got) + ' g');
    } else if (op === 'toPlant') {
      const pd = this.pend.get(who);
      if (!pd) return;
      this.pend.delete(who);
      this.bin += pd.gold;
      if (this.manual && who === 'me') this.say('bin', t('gb.p.binManual', 'Lavadora no modo à mão: limpe a caixa do ouro na bateia!'));
    } else if (op === 'place') {
      if (this.inv <= 0 || this.sl.length >= SLUICE_MAX) return;
      const x = clamp(num(m.x, p.x), 8, 184);
      const z = clamp(num(m.z, p.z), 8, 184);
      if (Math.hypot(x - p.x, z - p.z) > 6) return;
      this.inv--;
      this.addSluice(x, z, num(m.yaw));
      sfx.thunk();
      if (who === 'me') this.say('sl', t('gb.p.tipSluice2', 'Ponha a calha na correnteza (ou jogue baldes de água) e despeje terra na moega!'));
    } else if (op === 'slope') {
      const sl = this.sl[Math.round(num(m.i, -1))];
      if (!sl) return;
      sl.slope = clamp(sl.slope + (num(m.d) > 0 ? 1 : -1), 0, 4);
      this.placeMesh(sl);
      this.dirty = true;
    } else if (op === 'mode') {
      this.manual = !this.manual;
      this.dirty = true;
    }
  }
  private restore(who: string, wk: Worker, lost: number): void {
    const pd = this.pend.get(who);
    if (!pd) return;
    this.pend.delete(who);
    this.restoreP(pd, wk, lost);
  }
  private restoreP(pd: Pend, wk: Worker, lost: number): void {
    const gold = Math.max(0, pd.gold - lost);
    if (pd.src === 'barrow') {
      wk.cargo.vol += pd.vol;
      wk.cargo.gold += gold;
    } else if (pd.src === 'sluice' && this.sl[pd.i]) this.sl[pd.i].conc += gold;
    else this.bin += gold;
  }
  /** o que a bateia não pegou vira rejeito na beira d'água (atrás do garimpeiro) */
  private tailsAt(pd: Pend, vol: number, gold: number): void {
    const T = this.g.w!.T;
    if (pd.src === 'bin') {
      this.tailGold += gold;
      return;
    }
    const x = pd.x - Math.sin(pd.yaw) * 1.6;
    const z = pd.z - Math.cos(pd.yaw) * 1.6;
    const v = Math.max(vol, 0.01);
    if (vol > 0.004 || gold > 0.001) {
      T.deposit(x, z, v, 0.9, gold / v);
      this.markTail(x, z, 1.2);
    }
  }

  /* ============================== interface ============================== */
  private buildUi(): void {
    const root = this.root();
    const bar = document.createElement('div');
    bar.className = 'gbp-bar';
    bar.setAttribute('data-touch-ignore', '');
    bar.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (!b) return;
      e.stopPropagation();
      this.act(b.dataset.p!);
    });
    const panel = document.createElement('div');
    panel.className = 'gbp-panel';
    panel.hidden = true;
    panel.setAttribute('data-touch-ignore', '');
    panel.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-p]');
      if (!b) return;
      e.stopPropagation();
      this.act(b.dataset.p!);
    });
    const gauge = document.createElement('canvas');
    gauge.className = 'gbp-gauge';
    gauge.width = 216;
    gauge.height = 116;
    root.append(bar, panel);
    this.ui = { bar, panel, gauge };
  }
  private act(k: string): void {
    const g = this.g;
    sfx.click();
    tap('light');
    if (k === 'pan') this.startPan();
    else if (k === 'clean') {
      if (this.nearSl >= 0) this.startClean(this.nearSl);
      else if (this.nearPlant) this.startBin();
    } else if (k === 'place') {
      const wk = g.worker!;
      const y = wk.group.rotation.y;
      const p = wk.group.position;
      // calha na frente do garimpeiro, cabeça para trás (ele despeja nela)
      this.request({ op: 'place', x: r2(p.x + Math.sin(y) * 3), z: r2(p.z + Math.cos(y) * 3), yaw: r2(y + Math.PI) });
    } else if (k === 'up' || k === 'dn') {
      if (this.nearSl >= 0) this.request({ op: 'slope', i: this.nearSl, d: k === 'up' ? 1 : -1 });
    } else if (k === 'mode') {
      this.request({ op: 'mode' });
      notify(!this.manual ? t('gb.p.modeHand', 'Sala do ouro: à mão (bateia, mais ouro)') : t('gb.p.modeAuto', 'Sala do ouro: automático'), { icon: 'gear' });
    }
  }
  private uiUpdate(): void {
    const ui = this.ui;
    const g = this.g;
    if (!ui || this.game) return;
    this.uiT -= 1;
    if (this.uiT > 0) return;
    this.uiT = 6;
    const hudOn = !!g.hud && !document.querySelector('.gb-scr[data-ov]');
    const foot = hudOn && this.onFoot();
    const wk = g.worker;
    const p = wk ? g.cur!.pos : _v.set(0, 0, 0);
    // calha perto, lavadora perto
    this.nearSl = -1;
    let bd = 6;
    for (let i = 0; i < this.sl.length; i++) {
      const d = Math.hypot(this.sl[i].x - p.x, this.sl[i].z - p.z);
      if (d < bd) {
        bd = d;
        this.nearSl = i;
      }
    }
    const pr = g.w!.map.plant;
    this.nearPlant = hudOn && !g.inMine && Math.hypot(pr.x - p.x, pr.z - p.z) < 14;
    this.canPan = foot && !!wk && wk.cargo.vol > 0.004 && this.atWater();
    if (this.canPan && g.sv && !g.sv.tips.includes('pan1')) {
      g.sv.tips.push('pan1');
      g.say(t('gb.p.tipPan', 'Água! Lave a terra na bateia: você pega mais ouro e acha pepitas!'));
    }
    // botões
    const btns: string[] = [];
    const b = (k: string, ic: PicKey, hot = false, n: number | null = null) => btns.push(`<button class="gbp-b ${hot ? 'hot' : ''}" data-p="${k}">${PIC[ic]}${n !== null ? `<small>${n}</small>` : ''}</button>`);
    if (foot) {
      if (this.canPan) b('pan', 'pan', true);
      if (this.inv > 0 && this.sl.length < SLUICE_MAX) b('place', 'sluice', false, this.inv);
      if (this.nearSl >= 0 && this.sl[this.nearSl].conc > 0.05) b('clean', 'clean', this.sl[this.nearSl].mat > SL_MAT * 0.8);
      else if (this.nearPlant && this.bin > 0.2 && this.manual) b('clean', 'clean', true);
    }
    const key = btns.join('');
    if (key !== this.barKey) {
      this.barKey = key;
      ui.bar.innerHTML = key;
    }
    ui.bar.hidden = !hudOn;
    // painel: calha (medidor) ou lavadora (recuperação)
    let pk = '';
    if (hudOn && this.nearSl >= 0 && !g.inMine) {
      const sl = this.sl[this.nearSl];
      pk = 's' + this.nearSl;
      if (this.panelKey !== pk) {
        ui.panel.innerHTML = `<span class="gbp-ico">${PIC.sluice}</span><button class="gbp-b" data-p="dn">${PIC.slopeDn}</button><span class="gbp-gw"></span><button class="gbp-b" data-p="up">${PIC.slopeUp}</button>
          <div class="gbp-meter" data-m="w">${PIC.barrel}<i><u></u></i></div><div class="gbp-meter" data-m="m">${PIC.clean}<i><u></u></i></div><div class="gbp-rpct"><b></b></div>`;
        ui.panel.querySelector('.gbp-gw')!.appendChild(ui.gauge);
      }
      this.drawGauge(sl.speed, sl.rec);
      const us = ui.panel.querySelectorAll<HTMLElement>('.gbp-meter u');
      const wl = sl.flow > 0.25 && sl.water <= 0 ? Math.min(1, sl.flow) : Math.max(sl.water, Math.min(1, sl.flow));
      us[0].style.width = Math.round(wl * 100) + '%';
      us[0].style.background = wl < 0.15 ? '#ff6a3a' : '#5ab8ff';
      const mk = sl.mat / SL_MAT;
      us[1].style.width = Math.round(Math.min(1, mk) * 100) + '%';
      us[1].style.background = mk > 1 ? '#ff3a2a' : mk > 0.8 ? '#ffb31a' : '#5fd36a';
      ui.panel.querySelector('.gbp-rpct b')!.textContent = Math.round(sl.rec * 100) + '%';
    } else if (this.nearPlant && hudOn) {
      pk = 'p' + (this.manual ? 1 : 0) + this.upg.join('');
      if (this.panelKey !== pk) {
        const icons = UPG.map((u, i) => `<i class="${this.upg[i] ? 'on' : ''}" style="display:flex;opacity:${this.upg[i] ? 1 : 0.3}">${PIC[u.icon]}</i>`).join('');
        ui.panel.innerHTML = `<div class="gbp-rpct">${PIC.vial}<b></b></div><span style="display:flex;gap:2px">${icons}</span><div class="gbp-meter" data-m="b">${PIC.goldroom}<i><u></u></i></div><button class="gbp-b ${this.manual ? 'on' : ''}" data-p="mode">${this.manual ? PIC.hand : PIC.auto}</button>`;
      }
      ui.panel.querySelector('.gbp-rpct b')!.textContent = Math.round(this.totalRec() * 100) + '%';
      const u = ui.panel.querySelector<HTMLElement>('.gbp-meter u');
      if (u) u.style.width = Math.round(Math.min(1, this.bin / 30) * 100) + '%';
    }
    if (pk !== this.panelKey) this.panelKey = pk;
    ui.panel.hidden = !pk;
  }
  /** medidor (arco): zona verde, agulha = velocidade da água na calha */
  private drawGauge(sp: number, rec: number): void {
    const c = this.ui!.gauge;
    const x = c.getContext('2d')!;
    x.clearRect(0, 0, c.width, c.height);
    const cx = c.width / 2;
    const cy = c.height - 8;
    const R = c.height - 22;
    const MAX = 2.4;
    const a = (v: number) => Math.PI + (clamp(v, 0, MAX) / MAX) * Math.PI;
    x.lineWidth = 16;
    const arc = (v0: number, v1: number, col: string) => {
      x.strokeStyle = col;
      x.beginPath();
      x.arc(cx, cy, R, a(v0), a(v1));
      x.stroke();
    };
    arc(0, Z0, '#ffb31a');
    arc(Z0, Z1, '#3fcf5a');
    arc(Z1, MAX, '#ff4a2a');
    // ícones nas pontas: lama (devagar) e ouro indo embora (rápido)
    x.fillStyle = '#6b4a2a';
    x.beginPath();
    x.arc(cx - R - 2, cy - 4, 6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#ffcf2e';
    x.beginPath();
    x.arc(cx + R + 2, cy - 4, 5, 0, Math.PI * 2);
    x.fill();
    const an = a(sp);
    x.strokeStyle = '#fff';
    x.lineWidth = 5;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(cx, cy);
    x.lineTo(cx + Math.cos(an) * (R + 4), cy + Math.sin(an) * (R + 4));
    x.stroke();
    x.fillStyle = rec > 0.7 ? '#3fcf5a' : rec > 0.5 ? '#ffb31a' : '#ff4a2a';
    x.beginPath();
    x.arc(cx, cy, 9, 0, Math.PI * 2);
    x.fill();
  }

  /* ============================== loja ============================== */
  isItem(id: string): boolean {
    return id.startsWith('p.');
  }
  private names(): string[] {
    return [t('gb.p.grizzly', 'Grelha (pedras fora)'), t('gb.p.trommel', 'Trommel (peneira que gira)'), t('gb.p.runs', 'Calhas extras'), t('gb.p.shaker', 'Mesa vibratória'), t('gb.p.goldroom', 'Sala do ouro (balança)')];
  }
  itemName(id: string): string {
    if (id === 'p.sluice') return t('gb.p.sluice', 'Calha (sluice)');
    const i = UPG.findIndex((u) => 'p.' + u.id === id);
    return i >= 0 ? this.names()[i] : '';
  }
  shopHtml(money: number): string {
    const coin = '<svg viewBox="0 0 24 24" fill="none" stroke="#9a6400" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffcf2e"/></svg>';
    const nm = this.names();
    const have = this.inv + this.sl.length;
    const item = (id: string, ic: PicKey, name: string, price: number, done: boolean, sub: string) => {
      const can = !done && money >= price;
      return `<div class="gb-item ${done ? 'owned' : ''}"><div class="gb-ico gbp-ico">${PIC[ic]}</div><span>${esc(name)}</span><small>${sub}</small><button class="gb-price" data-buy="${id}" ${can ? '' : 'disabled'}>${done ? PIC.star : coin}${done ? esc(t('gb.max', 'Máximo')) : price.toLocaleString('pt-BR')}</button></div>`;
    };
    let h = item('p.sluice', 'sluice', t('gb.p.sluice', 'Calha (sluice)'), SLUICE_PRICE, have >= SLUICE_MAX, have ? '×' + have : '&nbsp;');
    const base = this.plantRec();
    UPG.forEach((u, i) => {
      // mostra quanto sobe a recuperação (ou a limpeza automática)
      const gain = i === 4 ? Math.round((FIN[2] - this.finRec()) * base * 100) : i === 3 ? Math.round(u.rec * 100 + (FIN[1] - FIN[0]) * 100) : Math.round(u.rec * 100);
      const sub = this.upg[i] ? '&nbsp;' : `+${Math.max(0, gain)}%${u.rate > 1 ? ' ⚡' : ''}`;
      h += item('p.' + u.id, u.icon, nm[i], u.price, !!this.upg[i], sub);
    });
    return h;
  }
  buy(id: string): boolean {
    const s = this.g.sv!;
    if (id === 'p.sluice') {
      if (this.inv + this.sl.length >= SLUICE_MAX || s.money < SLUICE_PRICE) return false;
      s.money -= SLUICE_PRICE;
      this.inv++;
      audio.cash();
      window.setTimeout(() => this.g.say(t('gb.p.tipSluice', 'Calha: a pé, toque no botão da calha para pôr no chão. Melhor num riacho!')), 300);
      this.dirty = true;
      return true;
    }
    const i = UPG.findIndex((u) => 'p.' + u.id === id);
    if (i < 0 || this.upg[i] || s.money < UPG[i].price) return false;
    s.money -= UPG[i].price;
    this.upg[i] = 1;
    this.applyParts();
    audio.cash();
    bigMoment(t('gb.p.recNow', 'Recuperação: {n}%', { n: Math.round(this.totalRec() * 100) }), { icon: 'star', sub: this.names()[i] });
    this.dirty = true;
    return true;
  }

  /* ============================== save / rede ============================== */
  save(): ProcSave {
    return {
      v: 1,
      upg: [...this.upg],
      manual: this.manual,
      bin: r2(this.bin),
      inv: this.inv,
      sl: this.sl.map((s) => ({ x: r2(s.x), z: r2(s.z), yaw: r2(s.yaw), slope: s.slope, load: r2(s.load), gold: r2(s.gold), conc: r2(s.conc), mat: r2(s.mat), water: r2(s.water) })),
      tl: this.tails.map((q) => ({ x: r2(q.x), z: r2(q.z) })),
      combo: this.combo,
    };
  }
  /** anfitrião: retrato (a cada 0,5 s; completo a cada 3 s ou quando algo mudou) */
  netTake(): Record<string, unknown> | null {
    this.netT -= 0.1;
    if (this.netT > 0 && !this.dirty) return null;
    this.netT = 0.5;
    this.dirty = false;
    return {
      u: this.upg.join(''),
      m: this.manual ? 1 : 0,
      b: r2(this.bin),
      i: this.inv,
      s: this.sl.map((s) => [r2(s.x), r2(s.z), r2(s.yaw), s.slope, r2(s.load), r2(s.conc), r2(s.mat), r2(s.water), r2(s.flow), r2(s.speed), r2(s.rec), s.run]),
      t: this.tails.map((q) => [r2(q.x), r2(q.z), r2(q.g)]),
    };
  }
  netApply(o: unknown): void {
    if (!o || typeof o !== 'object') return;
    const m = o as Record<string, unknown>;
    const u = String(m.u ?? '');
    const up = [0, 1, 2, 3, 4].map((i) => (u[i] === '1' ? 1 : 0));
    if (up.join('') !== this.upg.join('')) {
      this.upg = up;
      this.applyParts();
    }
    this.manual = !!m.m;
    this.bin = num(m.b);
    this.inv = num(m.i);
    const ss = Array.isArray(m.s) ? (m.s as number[][]) : [];
    for (let i = 0; i < ss.length; i++) {
      const a = ss[i];
      let sl = this.sl[i];
      if (!sl) sl = this.addSluice(num(a[0]), num(a[1]), num(a[2]));
      const slope = clamp(num(a[3], 2), 0, 4);
      if (slope !== sl.slope) {
        sl.slope = slope;
        this.placeMesh(sl);
      }
      sl.load = num(a[4]);
      sl.conc = num(a[5]);
      sl.mat = num(a[6]);
      sl.water = num(a[7]);
      sl.flow = num(a[8]);
      sl.speed = num(a[9]);
      sl.rec = num(a[10]);
      sl.run = num(a[11]);
    }
    const tt = Array.isArray(m.t) ? (m.t as number[][]) : [];
    for (let i = 0; i < tt.length; i++) {
      if (!this.tails[i]) this.addTail(num(tt[i][0]), num(tt[i][1]));
      this.tails[i].g = num(tt[i][2]);
    }
  }

  setTier(tier: number): void {
    this.badge.sprite.visible = true;
    void tier;
  }
  private said = new Set<string>();
  private say(k: string, text: string): void {
    if (this.said.has(k)) return;
    this.said.add(k);
    this.g.say(text);
  }
  dispose(): void {
    this.game?.dispose();
    this.game = null;
    this.ui?.bar.remove();
    this.ui?.panel.remove();
    this.ui = null;
    this.badge.dispose();
    for (const tl of this.tails) tl.badge.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    const P = this.parts;
    for (const o of [P.grizzly, P.runs?.root, P.shaker?.root, P.room]) if (o) o.removeFromParent();
  }

  /** testes (Playwright) */
  debug = {
    info: () => ({ upg: this.upg.join(''), rec: this.totalRec(), plantRec: this.plantRec(), fin: this.finRec(), bin: this.bin, sl: this.sl.map((s) => ({ x: s.x, z: s.z, load: s.load, conc: s.conc, mat: s.mat, flow: s.flow, speed: s.speed, rec: s.rec, slope: s.slope, water: s.water })), tails: this.tails.map((q) => ({ x: q.x, z: q.z, g: q.g })) }),
    game: () => this.game,
    upgradeAll: () => {
      this.upg = [1, 1, 1, 1, 1];
      this.applyParts();
    },
    sluice: (x: number, z: number, yaw: number) => this.addSluice(x, z, yaw),
    clean: (i: number) => this.startClean(i),
    pan: () => this.startPan(),
  };
}
