/* ============================================================
 *  GARIMPO BRUTO — sistema de ÁGUA (liga a simulação ao jogo).
 *  - lago e represa viram água simulada (o disco estático do lago some); world.waterY passa a
 *    ler a simulação (balde, helicóptero, partículas e "fundo demais" funcionam em enchentes);
 *  - tempo: chuva automática por dificuldade, enche a represa (bacia de captação) e o lago;
 *    seca longa evapora (o lago encolhe; nascente impede que suma);
 *  - represa → cano → tanque da lavadora (sem água a lavagem desacelera); poços, bombas com
 *    gerador (diesel) e canos ponto a ponto; dinamite;
 *  - consequências: correnteza arrasta/levanta máquinas, empurra o garimpeiro, apaga fogo,
 *    alaga o estoque (perde parte do ouro), lama; avisos com sirene (linguagem de criança);
 *  - save compacto e retrato de rede (só o anfitrião simula).
 *  Ganchos no jogo: construtor (start), step (anfitrião e convidado), wash (lavadora),
 *  shopHtml/buy (loja), save (persist), dispose (teardown), netTake/netApply/netReset (mp.ts).
 * ============================================================ */
import './water.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { sfx } from '../../../3d/common/sfx';
import { notify } from '../../../ui/notify';
import { CELL, V, type Terrain } from '../terrain';
import type { DamInfo } from './dam';
import type { Garimpo } from '../game';
import { TN, TS, WA, WCS, WN, WaterSim } from './sim';
import { WaterRender } from './render';
import { buildDynamite, buildPipe, buildPump, buildWell, WIC } from './props';
import { FloodFx } from './fx';

type Diff = 0 | 1 | 2 | 3;
export interface WaterSave {
  v: 1;
  /** profundidades (mm, RLE, base64) */
  d: string;
  tank: number;
  inv: { dyn: number; well: number; pump: number; pipe: number };
  wells: { x: number; z: number; w: number }[];
  pumps: { x: number; z: number; fuel: number; to: [number, number] | null }[];
  wx: { auto: number; t: number; dry: number };
  lake0: number;
  /** plantas derrubadas pela enchente / canos (índices em map.trees) */
  fel?: number[];
}

/** captação da chuva na represa e no lago (m³/s com chuva cheia) */
const CATCH_RES = [0.35, 0.6, 1.1, 1.5];
const CATCH_LAKE = 0.5;
/** água grátis que chega na lavadora (m³/s) — no fácil sobra, no difícil precisa da represa */
const FREE_IN = [1e9, 0.6, 0.18, 0.06];
const WATER_PER = 2.0;
const TANK = 25;
const RES_PIPE = 0.5;
/** erodibilidade do aterro e do vertedouro */
const DAM_ERO = [0.3, 0.45, 1.0, 1.3];
const SPILL_ERO = [0, 0, 0.55, 0.9];
/** chuva automática: [intervalo min, max, duração min, max] (s) */
const RAIN_EV: [number, number, number, number][] = [
  [700, 1000, 50, 90],
  [480, 800, 70, 130],
  [360, 600, 110, 190],
  [280, 480, 150, 240],
];
export const W_PRICE = { dyn: 250, well: 1500, pump: 1200, pipe: 350, fuel: 60 };
const W_MAX = { dyn: 6, well: 3, pump: 3, pipe: 6 };
const PUMP_Q = 0.35;
const WELL_CAP = 160;
const WELL_RECHARGE = 0.035;
const FUEL_S = 1 / 480;
/** profundidade em que a máquina flutua (m) */
const FLOAT: Record<string, number> = { pickup: 0.9, truck: 1.5, excavator: 2.2, dozer: 2.0 };

interface Pump {
  x: number;
  z: number;
  fuel: number;
  to: [number, number] | null;
  mesh: THREE.Object3D;
  pipe: THREE.Mesh | null;
  run: boolean;
  why: number;
}
interface Well {
  x: number;
  z: number;
  w: number;
  mesh: THREE.Object3D;
}
interface Charge {
  x: number;
  z: number;
  t: number;
  mesh: THREE.Object3D;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const _v = new THREE.Vector3();

export class WaterSystem {
  readonly sim: WaterSim;
  readonly render: WaterRender;
  readonly fx: FloodFx;
  private T: Terrain;
  private dam: DamInfo;
  private diff: Diff;
  private resCells = new Int32Array(0);
  private lakeCells = new Int32Array(0);
  /** células da crista (fora o vertedouro) para detectar brecha */
  private crestCells = new Int32Array(0);
  /** soleira do vertedouro (gasta com transbordamento no difícil) */
  private spillCells = new Int32Array(0);
  private minSpill = 1e9;
  private almostT = -1e9;
  private resCap = 1;
  private lake0 = 1;
  private outlet = { x: 0, z: 0 };
  private acc = 0;
  private eroT = 0;
  private slowT = 0;
  private qT = 0;
  private fireT = 0;
  private time = 0;
  tank = TANK;
  inv = { dyn: 0, well: 0, pump: 0, pipe: 0 };
  private wells: Well[] = [];
  private pumps: Pump[] = [];
  private charges: Charge[] = [];
  private wx = { auto: 0, t: 0, dry: 0 };
  private resLevel = -1e9;
  private resVol = 0;
  private lakeVol = 0;
  private minCrest = 1e9;
  private spill0 = 0;
  /** 0 nada, 1 quase cheia, 2 transbordando, 3 brecha */
  state = 0;
  private stateShown = -1;
  private stockLost = 0;
  private stockT = 0;
  private stockLostG = 0;
  private dryNoteT = 0;
  private pipeFrom = -1;
  private pipeGhost: THREE.Line | null = null;
  private outletMesh: THREE.Mesh | null = null;
  private group = new THREE.Group();
  private ui: { chip: HTMLDivElement; bar: HTMLDivElement; ban: HTMLDivElement } | null = null;
  private barKey = '';
  private propsVer = 1;
  private netProps = -1;
  private netBan = -1;
  /** medição: ms da simulação (média) */
  prof = { sim: 0, render: 0, steps: 0 };
  private markPatched: ((i0: number, j0: number, i1: number, j1: number) => void) | null = null;

  constructor(
    private g: Garimpo,
    s: import('../save').SlotSave,
  ) {
    const w = g.w!;
    this.T = w.T;
    this.dam = w.map.dam!;
    this.diff = s.diff;
    const T = this.T;
    const sim = new WaterSim(T);
    this.sim = sim;
    this.setupDam();
    // terreno mexido (pá, lâmina, caçamba, erosão, rede) → chão da água e malha refeitos
    const orig = T.markRect.bind(T);
    const patched = (i0: number, j0: number, i1: number, j1: number) => {
      orig(i0, j0, i1, j1);
      sim.terrainEdited(i0 * CELL, j0 * CELL, i1 * CELL, j1 * CELL);
      this.render.terrainEdited(i0 * CELL, j0 * CELL, i1 * CELL, j1 * CELL);
    };
    T.markRect = patched;
    this.markPatched = orig;
    this.render = new WaterRender(sim, T);
    this.render.setTier(w.tier);
    w.scene.add(this.render.group, this.group);
    this.fx = new FloodFx(w, sim, this.dam, (document.querySelector('.gb-root') as HTMLElement | null) ?? document.body);
    // o disco estático do lago sai: a água simulada assume
    const lakeMesh = (w as unknown as { water?: THREE.Mesh }).water;
    if (lakeMesh) lakeMesh.visible = false;
    w.waterY = (x: number, z: number) => sim.surfaceAt(x, z, 0.06);
    // estado salvo ou cheio inicial
    const ws = s.water;
    const m = w.map;
    let loaded = false;
    if (ws && ws.v === 1) {
      loaded = sim.decode(ws.d);
      for (const n of ws.fel || []) this.fx.fell(n, false);
      this.tank = ws.tank ?? TANK;
      Object.assign(this.inv, ws.inv || {});
      this.wx = Object.assign({ auto: 0, t: 0, dry: 0 }, ws.wx || {});
      for (const p of ws.wells || []) this.addWell(p.x, p.z, p.w);
      for (const p of ws.pumps || []) {
        const pu = this.addPump(p.x, p.z, p.fuel);
        if (p.to) this.connect(pu, p.to[0], p.to[1]);
      }
    }
    if (!loaded) {
      sim.fill(m.lake.x, m.lake.z, m.lake.level, m.lake.r + 40);
      sim.fill(this.dam.x, this.dam.z, this.dam.spill - 0.4, Math.max(this.dam.A, this.dam.B) + 4);
    }
    this.lake0 = ws?.lake0 || Math.max(1, this.poolVol(this.lakeCells));
    if (!this.wx.t) this.wx.t = this.rnd(RAIN_EV[this.diff][0], RAIN_EV[this.diff][1]);
    this.outletPipe();
    this.buildUi();
    this.measure();
    this.render.rebuildAll();
  }

  private rnd(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  /** piso da erosão (chão natural embaixo do aterro), erodibilidade e células da represa */
  private setupDam(): void {
    const sim = this.sim;
    const D = this.dam;
    const vx = -D.uz;
    const vz = D.ux;
    const W = D.i1 - D.i0 + 1;
    const res: number[] = [];
    const crest: number[] = [];
    const spill: number[] = [];
    let cap = 0;
    for (let cj = 0; cj < WN; cj++)
      for (let ci = 0; ci < WN; ci++) {
        const k = cj * WN + ci;
        const x = (ci + 0.5) * WCS;
        const z = (cj + 0.5) * WCS;
        const px = x - D.x;
        const pz = z - D.z;
        const lu = px * D.ux + pz * D.uz;
        const lv = px * vx + pz * vz;
        const e = Math.hypot(lu / D.A, lv / D.B);
        if (e > 2.4) continue;
        if (e < 1.02) {
          res.push(k);
          cap += Math.max(0, D.spill - sim.b[k]) * WA;
        }
        // piso: chão natural (antes do aterro), se estiver na janela gerada
        let s = 0;
        let n = 0;
        for (let b = 0; b <= 3; b++)
          for (let a = 0; a <= 3; a++) {
            const i = ci * 3 + a;
            const j = cj * 3 + b;
            if (i < D.i0 || i > D.i1 || j < D.j0 || j > D.j1) continue;
            s += D.nat[(j - D.j0) * W + i - D.i0];
            n++;
          }
        const r = Math.hypot(px, pz);
        const sd = e > 1e-4 ? r * (1 - 1 / e) : -D.A;
        const isSpill = lu > 0 && Math.abs(lv) < 2.6 && sd > -2 && sd < 14;
        if (n && sd > -0.5 && sd < 22) {
          const natural = s / n;
          if (sim.b[k] - natural > 0.3) {
            sim.floor[k] = Math.min(sim.floor[k], natural);
            sim.erod[k] = isSpill ? SPILL_ERO[this.diff] : DAM_ERO[this.diff];
          }
        }
        if (sd > 0 && sd < 5 && !isSpill && sim.b[k] > D.crest - 0.45) crest.push(k);
        if (isSpill && sd > 0.5 && sd < 4.5) spill.push(k);
      }
    this.resCells = Int32Array.from(res);
    this.crestCells = Int32Array.from(crest);
    this.spillCells = Int32Array.from(spill);
    this.resCap = Math.max(1, cap);
    const lk: number[] = [];
    const L = this.g.w!.map.lake;
    for (let cj = 0; cj < WN; cj++)
      for (let ci = 0; ci < WN; ci++) if (Math.hypot((ci + 0.5) * WCS - L.x, (cj + 0.5) * WCS - L.z) < L.r + 6) lk.push(cj * WN + ci);
    this.lakeCells = Int32Array.from(lk);
    // saída do cano da lavadora: ponto mais fundo da bacia, do lado do aterro
    let best = res[0] ?? 0;
    for (const k of res) if (sim.b[k] < sim.b[best]) best = k;
    this.outlet = { x: ((best % WN) + 0.5) * WCS, z: (((best / WN) | 0) + 0.5) * WCS };
    this.spill0 = D.spill;
  }

  private poolVol(cells: Int32Array): number {
    let v = 0;
    for (let q = 0; q < cells.length; q++) v += this.sim.d[cells[q]] * WA;
    return v;
  }
  private measure(): void {
    const st = this.sim.poolStats(this.resCells);
    this.resLevel = st.level;
    this.resVol = st.vol;
    this.lakeVol = this.poolVol(this.lakeCells);
    let mc = 1e9;
    for (let q = 0; q < this.crestCells.length; q++) mc = Math.min(mc, this.sim.b[this.crestCells[q]]);
    this.minCrest = mc;
    let ms = 1e9;
    for (let q = 0; q < this.spillCells.length; q++) ms = Math.min(ms, this.sim.b[this.spillCells[q]]);
    this.minSpill = ms;
  }

  /* ============================== passo ============================== */
  step(dt: number): void {
    const g = this.g;
    const w = g.w;
    if (!w) return;
    this.time += dt;
    if (g.guest) {
      this.present(dt);
      return;
    }
    const sim = this.sim;
    // simulação em passo fixo (máx. 3 por quadro; atrasou demais → descarta)
    const h = w.tier === 0 ? 1 / 20 : 1 / 30;
    this.acc += dt;
    let n = 0;
    const t0 = performance.now();
    while (this.acc >= h && n < 3) {
      sim.step(h);
      this.acc -= h;
      n++;
    }
    if (n >= 3) this.acc = 0;
    this.eroT += dt;
    if (this.eroT >= 0.2) {
      sim.erode(this.eroT, 1.5);
      this.eroT = 0;
    }
    const t1 = performance.now();
    this.prof.sim += (t1 - t0 - this.prof.sim) * 0.05;
    this.prof.steps = n;
    this.forces(dt);
    this.slowT += dt;
    if (this.slowT >= 1) {
      this.slow(this.slowT);
      this.slowT = 0;
    }
    this.qT += dt;
    if (this.qT >= 0.25) {
      this.quarter(this.qT);
      this.qT = 0;
    }
    this.chargesStep(dt);
    this.present(dt);
  }

  /** o que todo mundo vê (convidado também): malha, respingos, cano em andamento, HUD */
  private present(dt: number): void {
    const g = this.g;
    const w = g.w!;
    const t0 = performance.now();
    this.render.setLight(_v.copy(w.sun.position).sub(w.sun.target.position), (w.scene.fog as THREE.Fog).color, 1 - w.rainK * 0.35);
    this.render.update(this.time, w.camera.position);
    this.splashes(dt);
    this.fx.update(dt, this.time, w.camera.position);
    this.prof.render += (performance.now() - t0 - this.prof.render) * 0.05;
    if (this.pipeFrom >= 0) this.ghostPipe();
    this.uiUpdate();
  }

  /* ---------------- máquinas e garimpeiro na correnteza ---------------- */
  private forces(dt: number): void {
    const g = this.g;
    const sim = this.sim;
    for (const m of g.ms) {
      const v = m.veh;
      if (!v) continue;
      const k = sim.cellOf(v.pos.x, v.pos.z);
      const d = sim.d[k];
      if (d < 0.15) {
        this.stuck.delete(m);
        continue;
      }
      // máquina parada no fundo da água por 6 s: o guincho tira para a margem (nunca se perde)
      if (d > (FLOAT[m.kind] ?? 1.5) * 0.7 && Math.hypot(v.vel.x, v.vel.z) < 1.2) {
        const st = (this.stuck.get(m) ?? 0) + dt;
        this.stuck.set(m, st);
        if (st > 6) {
          this.stuck.delete(m);
          const p = this.dryNear(v.pos.x, v.pos.z);
          if (p) {
            v.place(p.x, p.z, v.yaw(), this.T);
            notify(t('gb.w.rescue', 'O guincho tirou a máquina da água!'), { icon: 'refresh' });
          }
          continue;
        }
      } else this.stuck.delete(m);
      const surf = sim.b[k] + d;
      const sub = Math.max(0, Math.min(1, (surf - (v.pos.y - 0.6)) / (FLOAT[m.kind] ?? 1.5)));
      if (sub <= 0) continue;
      const ux = sim.ux[k];
      const uz = sim.uz[k];
      const sp = Math.hypot(ux, uz);
      if (sp > 0.3 || sub > 0.4) v.wake();
      // empuxo (fica "leve", as rodas perdem atrito) e arrasto da correnteza
      v.vel.y += 9.81 * 0.85 * sub * dt;
      v.vel.y *= 1 - Math.min(1, dt * 1.5 * sub);
      const kd = (0.25 + sub * 1.1) * Math.min(1, d);
      v.vel.x += (ux - v.vel.x) * Math.min(1, kd * dt);
      v.vel.z += (uz - v.vel.z) * Math.min(1, kd * dt);
    }
    const wk = g.worker;
    if (wk && g.cur === wk && !g.inMine) {
      const p = wk.group.position;
      const k = sim.cellOf(p.x, p.z);
      const d = sim.d[k];
      if (d > 0.25) {
        const f = Math.min(1, (d - 0.25) * 2) * 0.55;
        p.x += sim.ux[k] * f * dt;
        p.z += sim.uz[k] * f * dt;
      }
    }
  }

  /** gancho da câmera (game.camera): cinema da brecha e tremor */
  camFx(cam: THREE.PerspectiveCamera, dt: number): void {
    if (this.g.inMine) return this.fx.endCine();
    this.fx.camFx(cam, dt);
  }
  /** pedras e torrões saindo da brecha (onde a água corre muito) */
  private breachDebris(): void {
    const sim = this.sim;
    const w = this.g.w!;
    for (let t = 0; t < TN * TN; t++) {
      if (!sim.awake[t] || sim.hotV[t] < 3) continue;
      const k = sim.hot[t];
      if (k < 0) continue;
      const x = ((k % WN) + 0.5) * WCS;
      const z = (((k / WN) | 0) + 0.5) * WCS;
      if (Math.random() < 0.12) this.fx.spawn(x, z, 1);
      const y = sim.b[k] + sim.d[k];
      for (let q = 0; q < 3; q++) w.clods.spawn(x + (Math.random() - 0.5) * 1.5, y, z + (Math.random() - 0.5) * 1.5, sim.ux[k] * 0.5 + (Math.random() - 0.5), 1 + Math.random() * 2, sim.uz[k] * 0.5 + (Math.random() - 0.5), 0.08 + Math.random() * 0.1, 0.45, 0.26, 0.13);
    }
  }
  /** plantas embaixo de um cano saem (o cano deita no chão) */
  private clearTrees(ax: number, az: number, bx: number, bz: number): void {
    const trees = this.g.w!.map.trees;
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    trees.forEach((tr, n) => {
      if (tr.kind === 4) return;
      let u = ((tr.x - ax) * dx + (tr.z - az) * dz) / L2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const r = tr.kind <= 2 ? 1.3 * tr.s : 0.9;
      if (Math.hypot(ax + dx * u - tr.x, az + dz * u - tr.z) < r) this.fx.fell(n, false);
    });
  }

  private stuck = new Map<object, number>();
  /** chão seco mais perto (anel por anel, até 40 m) */
  private dryNear(x: number, z: number): { x: number; z: number } | null {
    for (let r = 3; r <= 40; r += 1.5)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a / 16) * Math.PI * 2) * r;
        const pz = z + Math.sin((a / 16) * Math.PI * 2) * r;
        if (px < 10 || pz < 10 || px > 182 || pz > 182) continue;
        if (this.sim.depthAt(px, pz) > 0.02) continue;
        const T = this.T;
        if (Math.abs(T.heightAt(px + 1.5, pz) - T.heightAt(px - 1.5, pz)) > 1.2 || Math.abs(T.heightAt(px, pz + 1.5) - T.heightAt(px, pz - 1.5)) > 1.2) continue;
        return { x: px, z: pz };
      }
    return null;
  }

  /* ---------------- 4 Hz: bombas, poços, tanque, fogo, estoque ---------------- */
  private quarter(dt: number): void {
    this.fx.knock();
    this.breachDebris();
    const g = this.g;
    const s = g.sv!;
    const sim = this.sim;
    const m = g.w!.map;
    const plant = m.plant;
    // tanque da lavadora: entrada grátis + cano da represa
    if (this.tank < TANK) {
      this.tank = Math.min(TANK, this.tank + Math.min(FREE_IN[this.diff] * dt, TANK));
      if (this.tank < TANK) this.tank += sim.take(this.outlet.x, this.outlet.z, Math.min(RES_PIPE * dt, TANK - this.tank));
    }
    // poços recarregam (mais rápido na chuva)
    for (const wl of this.wells) wl.w = Math.min(WELL_CAP, wl.w + (WELL_RECHARGE + 0.12 * g.w!.rainK) * dt);
    // bombas
    for (const p of this.pumps) {
      p.run = false;
      if (!p.to) {
        p.why = 1;
        continue;
      }
      if (p.fuel <= 0) {
        p.why = 2;
        continue;
      }
      const toPlant = Math.hypot(p.to[0] - plant.x, p.to[1] - plant.z) < 12;
      if (toPlant && this.tank > TANK - 0.5) {
        p.why = 4;
        continue;
      }
      if (!toPlant && this.nearRes(p.to[0], p.to[1]) && this.resLevel > this.spill0 - 0.3) {
        p.why = 4;
        continue;
      }
      let want = PUMP_Q * dt;
      if (toPlant) want = Math.min(want, TANK - this.tank);
      let got = 0;
      const wl = this.wells.find((q) => Math.hypot(q.x - p.x, q.z - p.z) < 6 && q.w > 0.3);
      if (wl) {
        got = Math.min(want, wl.w);
        wl.w -= got;
      } else got = sim.take(p.x, p.z, want);
      if (got < want * 0.05) {
        p.why = 3;
        continue;
      }
      p.run = true;
      p.why = 0;
      p.fuel = Math.max(0, p.fuel - FUEL_S * dt);
      if (toPlant) this.tank += got;
      else sim.add(p.to[0], p.to[1], got);
    }
    // fogo: a água apaga (só onde tem lâmina d'água)
    const fire = g.fire;
    this.fireT -= dt;
    if (fire?.active && this.fireT <= 0) {
      this.fireT = 0.5;
      for (let tj = 0; tj < TN; tj++)
        for (let ti = 0; ti < TN; ti++) {
          if (!sim.wetT[tj * TN + ti]) continue;
          for (let j = tj * TS; j < tj * TS + TS; j += 3)
            for (let i = ti * TS; i < ti * TS + TS; i += 3) if (sim.d[j * WN + i] > 0.08) fire.douse((i + 0.5) * WCS, (j + 0.5) * WCS);
        }
    }
    // estoque alagado: perde parte do ouro (no máximo 25% por enchente)
    const ds = sim.depthAt(m.stock.x, m.stock.z);
    this.stockT -= dt;
    if (ds > 0.35 && s.stock > 1 && this.stockLost < 0.25) {
      const lose = s.stock * Math.min(0.25 - this.stockLost, 0.02 * dt);
      s.stock -= lose;
      this.stockLost += 0.02 * dt;
      this.stockLostG += lose;
      if (this.stockT <= 0) {
        this.stockT = 8;
        notify(t('gb.w.stockWet', 'A água entrou no estoque! A correnteza levou {n} g', { n: Math.max(1, Math.round(this.stockLostG)) }), { icon: 'drop', kind: 'bad' });
        this.stockLostG = 0;
      }
    } else if (ds < 0.05) this.stockLost = Math.max(0, this.stockLost - dt * 0.002);
  }
  private nearRes(x: number, z: number): boolean {
    const D = this.dam;
    const px = x - D.x;
    const pz = z - D.z;
    return Math.hypot((px * D.ux + pz * D.uz) / (D.A + 6), (px * -D.uz + pz * D.ux) / (D.B + 6)) < 1;
  }

  /** lavadora: pede `req` m³ de terra; devolve quanto pode lavar com a água do tanque */
  wash(req: number): number {
    if (req <= 0 || this.g.guest) return req;
    const need = req * WATER_PER;
    if (this.tank >= need) {
      this.tank -= need;
      return req;
    }
    const ok = this.tank / WATER_PER;
    this.tank = 0;
    if (this.time > this.dryNoteT) {
      this.dryNoteT = this.time + 40;
      this.g.say(t('gb.w.dryPlant', 'A lavadora está sem água! Encha a represa ou ligue uma bomba.'));
    }
    return ok;
  }

  /* ---------------- 1 Hz: chuva, seca, captação, avisos ---------------- */
  private slow(dtS: number): void {
    const g = this.g;
    const w = g.w!;
    const sim = this.sim;
    const rk = w.rainK;
    // tempo automático (chuva vem e vai)
    const ev = RAIN_EV[this.diff];
    this.wx.t -= dtS;
    if (this.wx.t <= 0) {
      if (this.wx.auto) {
        this.wx.auto = 0;
        this.wx.t = this.rnd(ev[0], ev[1]);
        if (g.rainOn) {
          g.rainOn = false;
          g.hud?.setRainIcon(false);
        }
      } else {
        this.wx.auto = 1;
        this.wx.t = this.rnd(ev[2], ev[3]);
        if (!g.rainOn) {
          g.rainOn = true;
          g.hud?.setRainIcon(true);
          notify(t('gb.w.rainComing', 'Vai chover! A represa vai encher.'), { icon: 'drop' });
        }
      }
    }
    if (rk > 0.3) this.wx.dry = 0;
    else this.wx.dry += dtS;
    // chuva direta na água − evaporação (seca longa evapora mais)
    const evap = 0.000012 + Math.min(1, this.wx.dry / 900) * 0.00011;
    sim.slow(dtS, rk * 0.00025 - evap * (1 - rk), 0.0012);
    // captação: a chuva que cai na encosta escorre para a represa e para o lago (pelo riacho)
    if (rk > 0.05) {
      sim.add(this.dam.x - this.dam.ux * 2, this.dam.z - this.dam.uz * 2, CATCH_RES[this.diff] * rk * dtS);
      const c = this.dam.creek;
      const mouth = c[Math.max(0, c.length - 3)];
      if (mouth) sim.add(mouth.x, mouth.z, CATCH_LAKE * rk * dtS);
    }
    // nascente: o lago nunca some
    this.measure();
    if (this.lakeVol < this.lake0 * 0.55) {
      const L = w.map.lake;
      sim.add(L.x, L.z, (this.lake0 * 0.55 - this.lakeVol) * 0.02 * dtS + 0.05 * dtS);
    }
    // grama encharcada vira lama (e seca devagar)
    this.soak();
    this.warnings();
  }

  /** umidade do terreno onde a água passou (lama) — some devagar quando seca */
  private soakMap = new Map<number, number>();
  private soak(): void {
    const sim = this.sim;
    const T = this.T;
    let i0 = V;
    let j0 = V;
    let i1 = -1;
    let j1 = -1;
    let n = 0;
    for (let t = 0; t < TN * TN && n < 400; t++) {
      if (!sim.wetT[t] || !sim.awake[t]) continue;
      const ci0 = (t % TN) * TS;
      const cj0 = ((t / TN) | 0) * TS;
      for (let cj = cj0; cj < cj0 + TS; cj++)
        for (let ci = ci0; ci < ci0 + TS; ci++) {
          const d = sim.d[cj * WN + ci];
          if (d < 0.02) continue;
          const k = (cj * 3 + 1) * V + ci * 3 + 1;
          if (T.wet[k] > 0.8) continue;
          n++;
          for (let b = 0; b < 3; b++)
            for (let a = 0; a < 3; a++) {
              const kk = k + (b - 1) * V + (a - 1);
              if (!this.soakMap.has(kk)) this.soakMap.set(kk, T.wet[kk]);
              T.wet[kk] = Math.min(1, T.wet[kk] + 0.35);
            }
          if (ci * 3 < i0) i0 = ci * 3;
          if (cj * 3 < j0) j0 = cj * 3;
          if (ci * 3 + 3 > i1) i1 = ci * 3 + 3;
          if (cj * 3 + 3 > j1) j1 = cj * 3 + 3;
        }
    }
    // secando (só uma parte por segundo, sem pressa)
    let q = 0;
    for (const [kk, w0] of this.soakMap) {
      if (q++ > 300) break;
      const ci = Math.min(WN - 1, ((kk % V) / 3) | 0);
      const cj = Math.min(WN - 1, ((kk / V / 3) | 0));
      if (sim.d[cj * WN + ci] > 0.01) continue;
      T.wet[kk] = Math.max(w0, T.wet[kk] - 0.01);
      if (T.wet[kk] <= w0 + 1e-3) this.soakMap.delete(kk);
      else if (q % 40 === 0) {
        const i = kk % V;
        const j = (kk / V) | 0;
        if (i < i0) i0 = i;
        if (j < j0) j0 = j;
        if (i > i1) i1 = i;
        if (j > j1) j1 = j;
      }
    }
    if (i1 >= 0 && (i1 - i0) * (j1 - j0) < 90000) this.markPatched?.(i0, j0, i1, j1);
  }

  private warnings(): void {
    const g = this.g;
    let st = 0;
    const lvl = this.resLevel;
    // brecha: crista ou soleira do vertedouro bem abaixo do projeto e a água ainda passando
    const low = Math.min(this.minCrest, this.minSpill + 0.25);
    if (low < this.spill0 - 0.3 && lvl > low + 0.1) st = 3;
    else if (lvl > this.spill0 + 0.03 || (this.state === 2 && lvl > this.spill0 - 0.02)) st = 2;
    else if (lvl > this.spill0 - 0.15 || (this.state === 1 && lvl > this.spill0 - 0.3)) st = 1;
    if (st === 3 && this.state !== 3) {
      audio.siren(3.2);
      if (!g.inMine) this.fx.startCine();
      g.say(t('gb.w.breach', 'A barragem rompeu! Fique longe do riacho e das baixadas!'));
    } else if (st === 2 && this.state < 2) {
      audio.siren(1.6);
      g.say(this.diff >= 2 ? t('gb.w.overflowHard', 'A represa transbordou! A água está gastando a barragem. Abra uma vala ou bombeie água!') : t('gb.w.overflow', 'A represa encheu e a água sai pelo vertedouro.'));
    } else if (st === 1 && this.state === 0 && this.time - this.almostT > 90) {
      this.almostT = this.time;
      audio.siren(1);
      notify(t('gb.w.almost', 'A represa está quase cheia!'), { icon: 'warning', kind: 'warn' });
    } else if (st === 0 && this.state === 3) notify(t('gb.w.calm', 'A água baixou. Ufa!'), { icon: 'drop', kind: 'good' });
    this.state = st;
  }

  /* ---------------- respingos (brecha, cachoeiras, frente da onda) ---------------- */
  private splT = 0;
  private splashes(dt: number): void {
    const w = this.g.w!;
    const sim = this.sim;
    this.splT += dt;
    if (this.splT < 0.06) return;
    this.splT = 0;
    const cam = w.camera.position;
    let n = [2, 3, 6, 9][w.tier] ?? 4;
    for (let t = 0; t < TN * TN && n > 0; t++) {
      if (sim.hotV[t] < 2.2) continue;
      const k = sim.hot[t];
      if (k < 0) continue;
      const x = ((k % WN) + Math.random()) * WCS;
      const z = (((k / WN) | 0) + Math.random()) * WCS;
      if (Math.abs(x - cam.x) + Math.abs(z - cam.z) > 70) continue;
      const y = sim.b[k] + sim.d[k];
      const ux = sim.ux[k];
      const uz = sim.uz[k];
      const sp = sim.hotV[t];
      const nq = sp > 3.5 ? 4 : 2;
      for (let q = 0; q < nq; q++) w.drops.spawn(x, y + 0.05, z, ux * 0.6 + (Math.random() - 0.5) * 2, 1.5 + Math.random() * sp * 0.7, uz * 0.6 + (Math.random() - 0.5) * 2, 0.08 + Math.random() * 0.1, 0.88, 0.9, 0.9);
      n--;
    }
  }

  /* ---------------- dinamite ---------------- */
  private chargesStep(dt: number): void {
    const w = this.g.w!;
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i];
      const before = Math.ceil(c.t);
      c.t -= dt;
      if (Math.random() < 0.5) w.clods.spawn(c.x, c.mesh.position.y + 0.55, c.z, (Math.random() - 0.5) * 1.2, 1.2, (Math.random() - 0.5) * 1.2, 0.03, 1, 0.8, 0.2);
      if (Math.ceil(c.t) !== before && c.t > 0) {
        this.g.toast(String(Math.ceil(c.t)));
        sfx.knob();
      }
      if (c.t <= 0) {
        this.boom(c.x, c.z);
        this.group.remove(c.mesh);
        this.charges.splice(i, 1);
      }
    }
  }
  private boom(x: number, z: number): void {
    const g = this.g;
    const w = g.w!;
    const T = this.T;
    const y = T.heightAt(x, z);
    const vol = T.dig(x, y - 1.7, z, 2.6, 40, 2.2);
    const gold = T.goldOut;
    const gr = vol > 0 ? gold / vol : 0;
    // 60% volta como terra solta em volta (o resto vira pó)
    for (let q = 0; q < 6; q++) {
      const a = (q / 6) * Math.PI * 2 + Math.random() * 0.5;
      T.deposit(x + Math.cos(a) * 3.6, z + Math.sin(a) * 3.6, (vol * 0.6) / 6, 1.6, gr);
    }
    T.relax(x, z, 5, 0.8);
    for (let q = 0; q < 40; q++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 3 + Math.random() * 6;
      w.clods.spawn(x, y + 0.3, z, Math.cos(a) * sp, 4 + Math.random() * 7, Math.sin(a) * sp, 0.1 + Math.random() * 0.15, 0.55, 0.28, 0.14);
    }
    sfx.bump();
    sfx.crash();
    audio.tick(0);
    // empurra máquinas e o garimpeiro perto
    for (const m of g.ms) {
      const v = m.veh;
      if (!v) continue;
      const dx = v.pos.x - x;
      const dz = v.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d < 7 && d > 0.1) {
        v.wake();
        const f = (7 - d) * 0.8;
        v.vel.x += (dx / d) * f;
        v.vel.z += (dz / d) * f;
        v.vel.y += f * 0.5;
      }
    }
    const wk = g.worker;
    if (wk) {
      const p = wk.group.position;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < 4 && d > 0.05) {
        p.x = x + ((p.x - x) / d) * 4.2;
        p.z = z + ((p.z - z) / d) * 4.2;
      }
    }
  }

  /* ---------------- colocar coisas (a pé, na frente do garimpeiro) ---------------- */
  private front(dist: number): { x: number; z: number } | null {
    const wk = this.g.worker;
    if (!wk) return null;
    const p = wk.group.position;
    const a = wk.group.rotation.y;
    return { x: Math.max(10, Math.min(182, p.x + Math.sin(a) * dist)), z: Math.max(10, Math.min(182, p.z + Math.cos(a) * dist)) };
  }
  private addWell(x: number, z: number, wv = WELL_CAP): Well {
    const mesh = buildWell();
    mesh.position.set(x, this.T.heightAt(x, z), z);
    this.group.add(mesh);
    const wl = { x, z, w: wv, mesh };
    this.wells.push(wl);
    this.g.w!.addCircle({ x, z, r: 1.1 });
    this.propsVer++;
    return wl;
  }
  private addPump(x: number, z: number, fuel = 1): Pump {
    const mesh = buildPump();
    mesh.position.set(x, this.T.heightAt(x, z), z);
    this.group.add(mesh);
    const p: Pump = { x, z, fuel, to: null, mesh, pipe: null, run: false, why: 1 };
    this.pumps.push(p);
    this.g.w!.addCircle({ x, z, r: 0.9 });
    this.propsVer++;
    return p;
  }
  private connect(p: Pump, x: number, z: number): void {
    if (p.pipe) this.group.remove(p.pipe);
    p.to = [x, z];
    this.clearTrees(p.x, p.z, x, z);
    p.pipe = buildPipe(this.T, p.x, p.z, x, z);
    this.group.add(p.pipe);
    this.propsVer++;
  }
  private outletPipe(): void {
    const pl = this.g.w!.map.plant;
    const D = this.dam;
    const ax = D.x + D.ux * (D.A + 2);
    const az = D.z + D.uz * (D.A + 2);
    this.clearTrees(ax, az, pl.x, pl.z);
    this.outletMesh = buildPipe(this.T, ax, az, pl.x, pl.z, true);
    this.group.add(this.outletMesh);
  }
  /** um toque na barra de água (convidado: vira pedido ao anfitrião, como cavar/despejar) */
  private act(k: string): void {
    const g = this.g;
    if (g.cur !== g.worker || g.inMine) return;
    sfx.click();
    const dist = k === 'dyn' ? 1.6 : k === 'well' ? 2.2 : k === 'pump' ? 2.0 : 0.8;
    const f = this.front(dist)!;
    if (k === 'pipe') {
      if (this.inv.pipe <= 0) return;
      const p = this.nearPump(8, true);
      if (p < 0) return void notify(t('gb.w.needPump', 'Chegue perto de uma bomba sem cano'), { icon: 'warning', kind: 'warn' });
      this.pipeFrom = p;
      notify(t('gb.w.pipeWalk', 'Ande até onde a água deve chegar (represa ou lavadora) e toque no ✓'), { icon: 'drop', ms: 4500 });
      return;
    }
    if (k === 'cancel') {
      this.pipeFrom = -1;
      this.clearGhost();
      return;
    }
    let p = -1;
    if (k === 'end') {
      p = this.pipeFrom;
      const pu = this.pumps[p];
      if (!pu) return;
      const d = Math.hypot(f.x - pu.x, f.z - pu.z);
      if (d < 3) return;
      if (d > 120) return void notify(t('gb.w.pipeLong', 'Cano comprido demais (máx. 120 m)'), { icon: 'warning', kind: 'warn' });
      this.pipeFrom = -1;
      this.clearGhost();
    } else if (k === 'fuel') p = this.nearPump(5, false);
    if (k === 'well' && this.sim.depthAt(f.x, f.z) > 0.05) return void notify(t('gb.w.notInWater', 'Não dá para pôr dentro da água'), { icon: 'warning', kind: 'warn' });
    const mp = g.mp as { action?: (k: string, e: Record<string, unknown>) => void } | null;
    if (g.guest && mp?.action) {
      mp.action('water', { w: k, x: Math.round(f.x * 100) / 100, z: Math.round(f.z * 100) / 100, p });
      return;
    }
    if (this.doAct(k, f.x, f.z, p)) {
      if (k === 'dyn') g.say(t('gb.w.dynGo', 'Dinamite acesa! Corra para longe!'));
      else if (k === 'well') g.say(t('gb.w.wellTip', 'Poço pronto! Ponha uma bomba do lado e ligue um cano.'));
      else if (k === 'pump') g.say(t('gb.w.pumpTip', 'Bomba pronta! Ela puxa água do poço ou da água onde estiver. Agora ligue um cano.'));
      else if (k === 'end') sfx.thunk();
    }
  }
  /** anfitrião: pedido de um convidado (posição dele) */
  remoteAct(m: Record<string, unknown>): void {
    const k = String(m.w ?? '');
    const x = Number(m.x);
    const z = Number(m.z);
    const p = Number(m.p ?? -1);
    if (!Number.isFinite(x) || !Number.isFinite(z) || x < 4 || z < 4 || x > 188 || z > 188) return;
    if (k === 'end' || k === 'fuel') {
      const pu = this.pumps[p];
      if (!pu || Math.hypot(pu.x - x, pu.z - z) > (k === 'end' ? 125 : 8)) return;
    }
    this.doAct(k, x, z, p);
  }
  /** faz de fato (só no anfitrião / sozinho): gasta o estoque do time */
  private doAct(k: string, x: number, z: number, p: number): boolean {
    const s = this.g.sv!;
    if (k === 'dyn' && this.inv.dyn > 0) {
      const mesh = buildDynamite();
      mesh.position.set(x, this.T.heightAt(x, z), z);
      this.group.add(mesh);
      this.charges.push({ x, z, t: 4, mesh });
      this.inv.dyn--;
    } else if (k === 'well' && this.inv.well > 0 && this.sim.depthAt(x, z) <= 0.05) {
      this.addWell(x, z);
      this.inv.well--;
    } else if (k === 'pump' && this.inv.pump > 0) {
      this.addPump(x, z);
      this.inv.pump--;
    } else if (k === 'end' && this.inv.pipe > 0 && this.pumps[p] && !this.pumps[p].to) {
      this.connect(this.pumps[p], x, z);
      this.inv.pipe--;
    } else if (k === 'fuel' && this.pumps[p]) {
      if (s.money < W_PRICE.fuel) {
        notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
        return false;
      }
      s.money -= W_PRICE.fuel;
      this.pumps[p].fuel = 1;
      audio.cash();
    } else return false;
    this.invVer++;
    return true;
  }
  private invVer = 1;
  private netInv = -1;
  private nearPump(r: number, free: boolean): number {
    const wk = this.g.worker;
    if (!wk) return -1;
    const p = wk.group.position;
    let best = -1;
    let bd = r;
    this.pumps.forEach((q, i) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < bd && (!free || !q.to)) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
  private ghostPipe(): void {
    const p = this.pumps[this.pipeFrom];
    const f = this.front(0.8);
    if (!p || !f) return;
    if (!this.pipeGhost) {
      const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      this.pipeGhost = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x5ab8ff }));
      this.pipeGhost.frustumCulled = false;
      this.group.add(this.pipeGhost);
    }
    const a = this.pipeGhost.geometry.getAttribute('position') as THREE.BufferAttribute;
    a.setXYZ(0, p.x, this.T.heightAt(p.x, p.z) + 0.5, p.z);
    a.setXYZ(1, f.x, this.T.heightAt(f.x, f.z) + 0.5, f.z);
    a.needsUpdate = true;
  }
  private clearGhost(): void {
    if (!this.pipeGhost) return;
    this.group.remove(this.pipeGhost);
    this.pipeGhost.geometry.dispose();
    this.pipeGhost = null;
  }

  /* ============================== interface ============================== */
  private buildUi(): void {
    const wrap = this.g.w ? document.querySelector('.gb-root') : null;
    const root = (wrap as HTMLElement | null) ?? document.body;
    const chip = document.createElement('div');
    chip.className = 'gbw-chip';
    chip.innerHTML = `${WIC.dam}<i><u></u></i>${WIC.tank}<i><u></u></i>`;
    const bar = document.createElement('div');
    bar.className = 'gbw-bar';
    bar.setAttribute('data-touch-ignore', '');
    bar.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-w]');
      if (!b) return;
      e.stopPropagation();
      this.act(b.dataset.w!);
    });
    const ban = document.createElement('div');
    ban.className = 'gbw-ban';
    ban.hidden = true;
    root.append(chip, bar, ban);
    this.ui = { chip, bar, ban };
  }
  private uiT = 0;
  private uiUpdate(): void {
    const ui = this.ui;
    if (!ui) return;
    this.uiT -= 1;
    if (this.uiT > 0) return;
    this.uiT = 6;
    const g = this.g;
    const hudOn = !!g.hud && !document.querySelector('.gb-scr[data-ov]');
    ui.chip.hidden = !hudOn || g.inMine;
    const res = Math.max(0, Math.min(1, this.resVol / this.resCap));
    const us = ui.chip.querySelectorAll('u');
    (us[0] as HTMLElement).style.width = Math.round(res * 100) + '%';
    (us[1] as HTMLElement).style.width = Math.round((this.tank / TANK) * 100) + '%';
    ui.chip.classList.toggle('low', this.tank < TANK * 0.2 && this.diff >= 1);
    ui.chip.classList.toggle('hi', this.state >= 1);
    // barra de ferramentas (só a pé, fora da mina, anfitrião/sozinho)
    const foot = hudOn && g.cur === g.worker && !g.inMine;
    const btns: string[] = [];
    const b = (k: string, ic: string, n: number | null) => btns.push(`<button class="gb-b" data-w="${k}">${ic}${n !== null ? `<span>${n}</span>` : ''}</button>`);
    if (foot) {
      if (this.pipeFrom >= 0) {
        b('end', WIC.end, null);
        b('cancel', WIC.cancel, null);
      } else {
        if (this.inv.dyn) b('dyn', WIC.dyn, this.inv.dyn);
        if (this.inv.well) b('well', WIC.well, this.inv.well);
        if (this.inv.pump) b('pump', WIC.pump, this.inv.pump);
        if (this.inv.pipe && this.nearPump(8, true) >= 0) b('pipe', WIC.pipe, this.inv.pipe);
        const np = this.nearPump(5, false);
        if (np >= 0 && this.pumps[np].fuel < 0.8) b('fuel', WIC.fuel, W_PRICE.fuel);
      }
    }
    const key = btns.join('');
    if (key !== this.barKey) {
      this.barKey = key;
      ui.bar.innerHTML = key;
    }
    // faixa de aviso
    const st = this.state;
    if (st !== this.stateShown) {
      this.stateShown = st;
      const txt = st === 3 ? t('gb.w.banBreach', 'BARRAGEM ROMPEU!') : st === 2 ? t('gb.w.banOver', 'Represa transbordando') : st === 1 ? t('gb.w.banAlmost', 'Represa quase cheia') : '';
      ui.ban.hidden = !txt;
      ui.ban.className = 'gbw-ban s' + st;
      ui.ban.innerHTML = txt ? `${WIC.drop}<b>${esc(txt)}</b>` : '';
    }
  }

  /* ============================== loja ============================== */
  isItem(id: string): boolean {
    return id.startsWith('w.');
  }
  private names(): Record<string, string> {
    return {
      dyn: t('gb.w.dyn', 'Dinamite'),
      well: t('gb.w.well', 'Poço'),
      pump: t('gb.w.pump', 'Bomba com gerador'),
      pipe: t('gb.w.pipe', 'Cano'),
    };
  }
  /** itens da loja no mesmo formato de .gb-item */
  shopHtml(money: number): string {
    const nm = this.names();
    const placed = { dyn: 0, well: this.wells.length, pump: this.pumps.length, pipe: this.pumps.filter((p) => p.to).length };
    const coin = '<svg viewBox="0 0 24 24" fill="none" stroke="#9a6400" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffcf2e"/></svg>';
    return (['dyn', 'well', 'pump', 'pipe'] as const)
      .map((k) => {
        const have = this.inv[k] + placed[k];
        const done = have >= W_MAX[k];
        const price = W_PRICE[k];
        const can = !done && money >= price;
        return `<div class="gb-item ${done ? 'owned' : ''}"><div class="gb-ico gbw-ico">${WIC[k]}</div><span>${esc(nm[k])}</span><small>${this.inv[k] ? '×' + this.inv[k] : '&nbsp;'}</small><button class="gb-price" data-buy="w.${k}" ${can ? '' : 'disabled'}>${coin}${price.toLocaleString('pt-BR')}</button></div>`;
      })
      .join('');
  }
  buy(id: string): boolean {
    const k = id.slice(2) as keyof typeof W_MAX;
    const s = this.g.sv!;
    if (!(k in W_MAX)) return false;
    const placed = k === 'well' ? this.wells.length : k === 'pump' ? this.pumps.length : k === 'pipe' ? this.pumps.filter((p) => p.to).length : 0;
    if (this.inv[k] + placed >= W_MAX[k] || s.money < W_PRICE[k]) return false;
    s.money -= W_PRICE[k];
    this.inv[k]++;
    this.invVer++;
    audio.cash();
    const tips: Record<string, string> = {
      dyn: t('gb.w.tipDyn', 'Dinamite: toque no botão a pé para acender. Abre buracos (e barragens!).'),
      well: t('gb.w.tipWell', 'Poço: toque no botão a pé para cavar ali. Dá água devagar e enche de novo.'),
      pump: t('gb.w.tipPump', 'Bomba: coloque perto de um poço, do lago ou de uma enchente.'),
      pipe: t('gb.w.tipPipe', 'Cano: perto da bomba toque no botão, ande até a represa ou a lavadora e toque no ✓.'),
    };
    window.setTimeout(() => this.g.say(tips[k]), 300);
    return true;
  }

  /* ============================== save / rede ============================== */
  save(): WaterSave {
    const r = (v: number) => Math.round(v * 100) / 100;
    return {
      v: 1,
      d: this.sim.encode(),
      tank: r(this.tank),
      inv: { ...this.inv },
      wells: this.wells.map((w) => ({ x: r(w.x), z: r(w.z), w: r(w.w) })),
      pumps: this.pumps.map((p) => ({ x: r(p.x), z: r(p.z), fuel: r(p.fuel), to: p.to ? [r(p.to[0]), r(p.to[1])] : null })),
      wx: { auto: this.wx.auto, t: Math.round(this.wx.t), dry: Math.round(this.wx.dry) },
      lake0: Math.round(this.lake0),
      fel: [...this.fx.felled],
    };
  }
  /** anfitrião: alguém entrou → o próximo retrato manda a água toda e as peças */
  netReset(): void {
    this.sim.netStart();
    this.netProps = -1;
    this.netBan = -1;
    this.netInv = -1;
    this.netFel = true;
  }
  private netFel = false;
  /** anfitrião: parte do retrato (~10/s): ladrilhos mudados (a 5 Hz), peças quando mudam, aviso */
  private netT = 0;
  netTake(): Record<string, unknown> | null {
    const o: Record<string, unknown> = {};
    this.netT++;
    if (this.netT % 2 === 0) {
      const d = this.sim.netTake();
      if (d) o.d = d;
    }
    if (this.netProps !== this.propsVer) {
      this.netProps = this.propsVer;
      o.p = [this.wells.map((w) => [Math.round(w.x * 10), Math.round(w.z * 10)]), this.pumps.map((p) => [Math.round(p.x * 10), Math.round(p.z * 10), p.to ? Math.round(p.to[0] * 10) : -1, p.to ? Math.round(p.to[1] * 10) : -1])];
    }
    if (this.netInv !== this.invVer) {
      this.netInv = this.invVer;
      o.i = [this.inv.dyn, this.inv.well, this.inv.pump, this.inv.pipe];
    }
    if (this.netFel) {
      this.netFel = false;
      o.f = [...this.fx.felled];
      this.fx.fellNew.length = 0;
    } else if (this.fx.fellNew.length) o.f = this.fx.fellNew.splice(0);
    if (this.netBan !== this.state) {
      this.netBan = this.state;
      o.s = this.state;
    }
    return Object.keys(o).length ? o : null;
  }
  netApply(o: unknown): void {
    if (!o || typeof o !== 'object') return;
    const m = o as { d?: unknown; p?: unknown; s?: unknown; i?: unknown; f?: unknown };
    if (typeof m.d === 'string') this.sim.netApply(m.d);
    if (Array.isArray(m.i)) [this.inv.dyn, this.inv.well, this.inv.pump, this.inv.pipe] = (m.i as number[]).map((v) => Math.max(0, Number(v) | 0));
    if (Array.isArray(m.f)) for (const n of m.f as number[]) if (Number.isInteger(n) && !this.fx.felled.has(n)) this.fx.fell(n, true);
    if (typeof m.s === 'number') {
      if (m.s === 3 && this.state !== 3) {
        audio.siren(3);
        if (!this.g.inMine) this.fx.startCine();
      }
      this.state = m.s;
    }
    if (Array.isArray(m.p)) {
      for (const w of this.wells) this.group.remove(w.mesh);
      for (const p of this.pumps) {
        this.group.remove(p.mesh);
        if (p.pipe) this.group.remove(p.pipe);
      }
      this.wells = [];
      this.pumps = [];
      const [ws, ps] = m.p as [number[][], number[][]];
      for (const a of ws ?? []) this.addWell(a[0] / 10, a[1] / 10);
      for (const a of ps ?? []) {
        const p = this.addPump(a[0] / 10, a[1] / 10);
        if (a[2] >= 0) this.connect(p, a[2] / 10, a[3] / 10);
      }
    }
  }

  setTier(t: number): void {
    this.render.setTier(t);
  }

  /** testes */
  debug = {
    breach: (w = 3) => {
      // abre uma brecha no meio do aterro (como uma escavadeira faria)
      const D = this.dam;
      const vx = -D.uz;
      const vz = D.ux;
      for (let s = -2; s <= 12; s += 0.5)
        for (let l = -w / 2; l <= w / 2; l += 0.5) {
          const x = D.x + D.ux * (D.A + s) + vx * (l + 5);
          const z = D.z + D.uz * (D.A + s) + vz * (l + 5);
          this.T.dig(x, D.floor + 1.2 - Math.max(0, s - 2) * 0.55, z, 0.8, 5, 6);
        }
    },
    fill: (lv: number) => this.sim.fill(this.dam.x, this.dam.z, lv, Math.max(this.dam.A, this.dam.B) + 3),
    drain: (f: number) => {
      for (const k of this.resCells) this.sim.d[k] *= f;
      this.sim.wakeAll();
    },
    rain: (on: boolean) => {
      this.g.rainOn = on;
      this.wx.auto = on ? 1 : 0;
      this.wx.t = on ? 1e6 : 1e6;
    },
    give: () => Object.assign(this.inv, { dyn: 3, well: 1, pump: 2, pipe: 2 }),
    act: (k: string) => this.act(k),
    info: () => ({ res: this.resVol, cap: this.resCap, level: this.resLevel, spill: this.spill0, crest: this.minCrest, lake: this.lakeVol, lake0: this.lake0, tank: this.tank, state: this.state, active: this.sim.activeTiles, vol: this.sim.totalVolume(), sed: this.sim.totalSed(), simMs: this.prof.sim, renderMs: this.prof.render, pumps: this.pumps.map((p) => [p.run, p.why, p.fuel]), wells: this.wells.map((w) => w.w) }),
    dam: () => this.dam,
  };

  dispose(): void {
    if (this.markPatched) {
      this.T.markRect = this.markPatched;
      this.markPatched = null;
    }
    this.clearGhost();
    this.fx.dispose();
    this.render.dispose();
    this.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.group.removeFromParent();
    this.ui?.chip.remove();
    this.ui?.bar.remove();
    this.ui?.ban.remove();
    this.ui = null;
  }
}
