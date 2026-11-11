/* ============================================================
 *  GARIMPO BRUTO — multijogador (até 4), anfitrião com autoridade.
 *  ANFITRIÃO: roda tudo (terreno, ouro, economia, bots, fogo, mina) com o save dele.
 *    - quem entra recebe 'init' (semente, máquinas, árvores queimadas) + o terreno em partes
 *      (diferença compacta do terreno gerado — o resto vem da semente);
 *    - ~10 retratos/s: jogadores, bots, máquinas (pose + articulações), dinheiro, fogo e as
 *      edições do terreno desde o último retrato (só células que mudaram, em cm).
 *  CONVIDADO: não simula. O próprio garimpeiro anda aqui na hora (posição dele vale); cavar,
 *    despejar e dirigir são pedidos ao anfitrião (entrada ~15/s). O resto é suavizado entre
 *    retratos (~150 ms atrás). Dinheiro/ouro do time é um só (o do save do anfitrião).
 *  Mina subterrânea: só o anfitrião entra nesta versão (convidados veem um aviso).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { bigMoment, notify } from '../../ui/notify';
import { buildExportTruck, C } from './models';
import { Heli, newCtl, Pickup, Worker, type Ctl, type Kind, type Machine } from './machines';
import { encodeTerrain } from './save';
import type { GbNet, NetMsg } from './net';
import type { Garimpo } from './game';

/** cores das camisas: anfitrião, convidados 1..3 */
export const PCOL = [C.shirt as number, 0xd8462e, 0x3fae4a, 0x9a4ad0];
export const KINDS: Kind[] = ['pickup', 'truck', 'excavator', 'dozer', 'heli'];
const SNAP_DT = 0.1;
const INPUT_DT = 1 / 15;
const DELAY = 0.16;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clampMap = (v: number) => Math.max(8, Math.min(184, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpA = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

export interface Peer {
  id: string;
  name: string;
  slot: number;
}

/** plaquinha com o nome sobre a cabeça */
export function nameTag(name: string, color: number): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 64;
  const x = cv.getContext('2d')!;
  x.font = '800 34px Fredoka, system-ui, sans-serif';
  const w = Math.min(240, x.measureText(name).width + 34);
  const c = '#' + color.toString(16).padStart(6, '0');
  x.fillStyle = 'rgba(20,12,6,.72)';
  x.beginPath();
  x.roundRect(128 - w / 2, 6, w, 52, 26);
  x.fill();
  x.lineWidth = 5;
  x.strokeStyle = c;
  x.stroke();
  x.fillStyle = '#fff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 128, 34, 220);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  // tamanho fixo na tela (legível longe, não cobre a tela de perto)
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, fog: false, sizeAttenuation: false }));
  sp.scale.set(0.3, 0.075, 1);
  sp.position.y = 2.3;
  sp.renderOrder = 20;
  return sp;
}
/** plaquinhas somem colado na câmera (e longe demais) */
function tagVis(sp: THREE.Sprite, cam: THREE.Camera): void {
  const p = sp.parent;
  if (!p) return;
  const d = cam.position.distanceTo(p.position);
  sp.visible = d > 3.5 && d < 90;
}
function dropTag(sp: THREE.Sprite): void {
  sp.removeFromParent();
  sp.material.map?.dispose();
  sp.material.dispose();
}

/* ======================================================================
 *  ANFITRIÃO
 * ====================================================================== */
interface Remote extends Peer {
  worker: Worker;
  tag: THREE.Sprite;
  ctl: Ctl;
  foot: Ctl;
  cy: number;
  m: Machine | null;
  x: number;
  z: number;
  yaw: number;
  sp: number;
}

export class MpHost {
  readonly peers = new Map<string, Remote>();
  private offs: (() => void)[] = [];
  private acc = 0;
  private seq = 0;
  private evs: unknown[][] = [];
  private burn = new Map<number, number>();
  private burnDirty = new Set<number>();
  private econT = 0;
  /** a tela da sala atualiza a lista */
  onPeers: (() => void) | null = null;

  constructor(
    private g: Garimpo,
    readonly net: GbNet,
  ) {
    const w = g.w!;
    w.T.startNet();
    w.onBurn = (n, b) => {
      const q = Math.round(b * 20) / 20;
      if (this.burn.get(n) !== q) {
        this.burn.set(n, q);
        this.burnDirty.add(n);
      }
    };
    this.offs.push(
      net.on('join', (m) => this.join(m)),
      net.on('leave', (m) => this.leave(String(m.id))),
      net.on('i', (m) => this.input(m)),
      net.on('a', (m) => this.action(m)),
    );
  }

  get count(): number {
    return this.peers.size + 1;
  }
  list(): Peer[] {
    return [{ id: this.net.me.id, name: this.net.me.name, slot: 0 }, ...[...this.peers.values()].map((p) => ({ id: p.id, name: p.name, slot: p.slot }))];
  }
  event(e: unknown[]): void {
    if (this.peers.size) this.evs.push(e);
  }

  private join(m: NetMsg): void {
    const id = String(m.id ?? '');
    if (!id) return;
    if (this.peers.has(id)) this.leave(id, true);
    if (this.peers.size >= 3) return;
    const g = this.g;
    const w = g.w!;
    const used = new Set([...this.peers.values()].map((p) => p.slot));
    let slot = 1;
    while (used.has(slot)) slot++;
    const name = String(m.name ?? 'Bloop').slice(0, 24);
    const wk = new Worker(PCOL[slot]);
    wk.cargo.cap = g.barrowCap();
    wk.digPow = g.shovelPow();
    const hp = g.cur!.pos;
    const a = slot * 2.1;
    wk.place(clampMap(hp.x + Math.sin(a) * 3), clampMap(hp.z + Math.cos(a) * 3), a, w);
    w.scene.add(wk.group);
    const tag = nameTag(name, PCOL[slot]);
    wk.group.add(tag);
    const p = wk.group.position;
    const r: Remote = { id, name, slot, worker: wk, tag, ctl: newCtl(), foot: newCtl(), cy: 0, m: null, x: p.x, z: p.z, yaw: a, sp: 0 };
    this.peers.set(id, r);
    this.sendInit(r);
    g.water?.netReset();
    this.sendPeers();
    notify(t('gb.mp.joined', '{n} entrou no garimpo!', { n: name }), { icon: 'user', kind: 'good' });
    audio.coin(1);
    this.onPeers?.();
  }
  private sendInit(r: Remote): void {
    const g = this.g;
    const s = g.sv!;
    const ter = encodeTerrain(g.w!.T);
    const CH = 48000;
    const parts = Math.ceil(ter.length / CH);
    this.net.send({
      t: 'init',
      to: r.id,
      seed: s.seed,
      diff: s.diff,
      slot: r.slot,
      x: r2(r.x),
      z: r2(r.z),
      yaw: r2(r.yaw),
      parts,
      ms: g.ms.map((m) => [KINDS.indexOf(m.kind), r2(m.pos.x), r2(m.pos.z), r2(m.yaw()), r2(m.cargo.vol), r2(m.cargo.gold)]),
      burn: [...this.burn],
      money: Math.floor(s.money),
      upg: s.upg,
      rain: g.rainOn ? 1 : 0,
      ps: this.list().map((p) => [p.id, p.name, p.slot]),
    });
    for (let i = 0; i < parts; i++) this.net.send({ t: 'tp', to: r.id, i, d: ter.slice(i * CH, (i + 1) * CH) });
  }
  private sendPeers(): void {
    this.net.send({ t: 'pe', ps: this.list().map((p) => [p.id, p.name, p.slot]) });
  }
  private leave(id: string, silent = false): void {
    const r = this.peers.get(id);
    if (!r) return;
    if (r.m) this.freeSeat(r);
    dropTag(r.tag);
    r.worker.group.removeFromParent();
    r.worker.dispose();
    this.peers.delete(id);
    if (!silent) {
      notify(t('gb.mp.left', '{n} saiu', { n: r.name }), { icon: 'user' });
      this.sendPeers();
    }
    this.onPeers?.();
  }
  private input(m: NetMsg): void {
    const r = this.peers.get(String(m.from));
    if (!r) return;
    r.x = clampMap(num(m.x, r.x));
    r.z = clampMap(num(m.z, r.z));
    r.yaw = num(m.yaw, r.yaw);
    r.sp = Math.max(0, Math.min(4, num(m.sp)));
    r.cy = num(m.cy, r.cy);
    const c = Array.isArray(m.c) ? (m.c as unknown[]) : [];
    const k = r.ctl;
    const cl = (v: unknown) => Math.max(-1, Math.min(1, num(v)));
    k.mx = cl(c[0]);
    k.my = cl(c[1]);
    k.rx = cl(c[2]);
    k.ry = cl(c[3]);
    k.gas = Math.max(0, cl(c[4]));
    k.brake = Math.max(0, cl(c[5]));
    k.act = !!c[6];
    k.act2 = !!c[7];
    k.up = !!c[8];
    k.down = !!c[9];
    k.drive = c[10] === undefined ? true : !!c[10];
    k.expert = !!c[11];
    k.hand = !!c[12];
    k.auto = c[13] === undefined ? true : !!c[13];
    k.gearSel = Math.max(-1, Math.min(6, Math.round(num(c[14], 1))));
    k.diff = !!c[15];
    k.mode4 = Math.max(0, Math.min(2, Math.round(num(c[16], 1)))) as 0 | 1 | 2;
    k.pressure = Math.max(0, Math.min(2, Math.round(num(c[17], 1)))) as 0 | 1 | 2;
  }
  private action(m: NetMsg): void {
    const r = this.peers.get(String(m.from));
    if (!r) return;
    const g = this.g;
    if (m.k === 'enter') {
      const idx = Math.round(num(m.m, -1));
      const mc = g.ms[idx];
      if (!mc || r.m || this.taken(mc)) {
        this.net.send({ t: 'seat', to: r.id, m: -1 });
        return;
      }
      r.m = mc;
      mc.veh?.wake();
      if (mc.veh) mc.veh.input.hand = false;
      r.worker.group.visible = false;
      this.net.send({ t: 'seat', to: r.id, m: idx });
    } else if (m.k === 'exit') {
      if (r.m) this.freeSeat(r);
    } else if (m.k === 'buy' && typeof m.id === 'string' && m.id.length < 16) {
      if (g.buy(m.id)) this.event(['buy', m.id, r.name]);
    } else if (m.k === 'proc') g.proc?.netAction(r.id, r.worker, m); // beneficiamento (proc/)
  }
  private freeSeat(r: Remote): void {
    const mc = r.m!;
    r.m = null;
    mc.group.updateMatrixWorld();
    const d = mc.door.clone();
    mc.group.localToWorld(d);
    r.worker.place(clampMap(d.x), clampMap(d.z), mc.yaw(), this.g.w!);
    r.x = r.worker.group.position.x;
    r.z = r.worker.group.position.z;
    r.worker.group.visible = true;
    if (mc.veh) {
      mc.veh.input.gas = mc.veh.input.brake = mc.veh.input.steer = 0;
      mc.veh.input.hand = true;
    }
    this.g.drivers.find((d) => d.truck === mc)?.resume();
  }
  /** máquina com alguém dentro (o anfitrião ou um convidado) */
  taken(mc: Machine): boolean {
    if (mc === this.g.cur) return true;
    for (const p of this.peers.values()) if (p.m === mc) return true;
    return false;
  }
  /** controle de quem está dirigindo `mc` (convidado), ou null */
  seat(mc: Machine): Remote | null {
    for (const p of this.peers.values()) if (p.m === mc) return p;
    return null;
  }
  tags(cam: THREE.Camera): void {
    for (const p of this.peers.values()) tagVis(p.tag, cam);
  }
  /** upgrades comprados: vale para os carrinhos dos convidados também */
  applyUpgrades(): void {
    for (const p of this.peers.values()) {
      p.worker.cargo.cap = this.g.barrowCap();
      p.worker.digPow = this.g.shovelPow();
    }
  }

  /** um passo do anfitrião: garimpeiros dos convidados (posição deles, pá/carrinho aqui) */
  step(dt: number): void {
    const g = this.g;
    const env = g.env;
    for (const r of this.peers.values()) {
      if (r.m) {
        // pickup do convidado descarregando na moega
        if (r.m instanceof Pickup && r.ctl.act2 && r.m.pos.distanceTo(g.hopperPos(new THREE.Vector3())) < 9) r.m.unload(dt, g.hopperRecv);
        continue;
      }
      const wk = r.worker;
      wk.group.visible = true;
      wk.group.position.x = r.x;
      wk.group.position.z = r.z;
      wk.group.rotation.y = r.yaw;
      wk.extMove = r.sp;
      const f = r.foot;
      Object.assign(f, r.ctl);
      f.mx = f.my = 0;
      const saved = env.camYaw;
      env.camYaw = r.cy;
      wk.update(dt, f, env);
      env.camYaw = saved;
    }
  }

  /** retratos (~10/s), mesmo com a tela de pausa aberta */
  tick(dt: number): void {
    this.acc += dt;
    if (this.acc < SNAP_DT) return;
    this.acc = Math.min(this.acc - SNAP_DT, SNAP_DT);
    const g = this.g;
    const w = g.w;
    const s = g.sv;
    if (!w || !s) return;
    if (!this.peers.size) {
      // ninguém olhando: só acompanha o que já "foi mandado" (o próximo a entrar recebe tudo no init)
      w.T.takeNetDelta();
      this.burnDirty.clear();
      return;
    }
    if (this.net.buffered > 400_000) return; // rede engasgada: espera (o delta do terreno não se perde)
    const seatIdx = (mc: Machine | null) => (mc ? g.ms.indexOf(mc) : -1);
    const host = g.worker!;
    const pl: unknown[] = [[this.net.me.id, ...host.netState(), r2(host.cargo.gold), g.inMine ? -2 : g.cur === host ? -1 : seatIdx(g.cur)]];
    for (const r of this.peers.values()) pl.push([r.id, ...r.worker.netState(), r2(r.worker.cargo.gold), seatIdx(r.m)]);
    const ms = g.ms.map((m) => {
      const v = m.veh;
      const p = m.pos;
      const q = v ? v.q : m.group.quaternion;
      return [KINDS.indexOf(m.kind), r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w), r2(v ? v.speed : 0), r2(v ? v.input.steer : 0), r2(m.cargo.vol), r2(m.cargo.gold), m.netSusp(), m.netExtra()];
    });
    const msg: NetMsg = {
      t: 's',
      n: this.seq++,
      tm: r3(g.time),
      mo: Math.floor(s.money),
      st: r2(s.stock),
      rn: g.rainOn ? 1 : 0,
      ps: r2(g.plantSpinK),
      pl,
      bt: g.miners.map((b) => b.worker.netState()),
      ms,
    };
    const ex = g.exportPose();
    if (ex) msg.ex = ex;
    const tr = w.T.takeNetDelta();
    if (tr) msg.tr = tr;
    const wa = g.water?.netTake();
    if (wa) msg.wa = wa;
    const pr = g.proc?.netTake();
    if (pr) msg.pr = pr;
    const fire = g.fire;
    if (fire?.active) {
      msg.fi = fire.netPts();
      const tg = fire.target();
      if (tg) msg.ft = [r2(tg.x), r2(tg.z)];
    }
    if (this.burnDirty.size) {
      msg.bu = [...this.burnDirty].map((n) => [n, this.burn.get(n) ?? 0]);
      this.burnDirty.clear();
    }
    this.econT -= SNAP_DT;
    if (this.econT <= 0) {
      this.econT = 1;
      msg.ec = [s.upg.shovel, s.upg.barrow, s.upg.plant, s.bots.drivers, s.bots.miners, s.mineOpen ? 1 : 0, g.ug?.carts.length ?? 0, g.ug?.bots.length ?? 0];
    }
    if (this.evs.length) {
      msg.ev = this.evs;
      this.evs = [];
    }
    this.net.send(msg);
  }

  dispose(): void {
    for (const f of this.offs) f();
    for (const id of [...this.peers.keys()]) this.leave(id, true);
    if (this.g.w) {
      this.g.w.T.stopNet();
      this.g.w.onBurn = null;
    }
    this.net.leave();
  }
}

/* ======================================================================
 *  CONVIDADO
 * ====================================================================== */
export interface GuestInit {
  seed: number;
  diff: 0 | 1 | 2 | 3;
  slot: number;
  x: number;
  z: number;
  yaw: number;
  ms: number[][];
  burn: [number, number][];
  money: number;
  upg: { shovel: number; barrow: number; plant: number };
  rain: number;
  terrain: string;
  peers: [string, string, number][];
}

/** convidado: espera o 'init' e as partes do terreno (com tempo-limite) */
export function awaitInit(net: GbNet, timeoutMs = 20000): Promise<GuestInit> {
  return new Promise((resolve, reject) => {
    let init: NetMsg | null = null;
    const parts: string[] = [];
    let got = 0;
    const offs: (() => void)[] = [];
    const done = (e: Error | null) => {
      clearTimeout(timer);
      for (const f of offs) f();
      if (e) return reject(e);
      const m = init!;
      resolve({
        seed: num(m.seed) | 0,
        diff: (Math.max(0, Math.min(3, num(m.diff, 1))) | 0) as 0 | 1 | 2 | 3,
        slot: Math.max(1, Math.min(3, num(m.slot, 1))) | 0,
        x: num(m.x, 96),
        z: num(m.z, 96),
        yaw: num(m.yaw),
        ms: Array.isArray(m.ms) ? m.ms : [],
        burn: Array.isArray(m.burn) ? m.burn : [],
        money: num(m.money),
        upg: Object.assign({ shovel: 0, barrow: 0, plant: 0 }, m.upg || {}),
        rain: num(m.rain),
        terrain: parts.join(''),
        peers: Array.isArray(m.ps) ? m.ps : [],
      });
    };
    const check = () => {
      if (init && got >= num(init.parts)) done(null);
    };
    const timer = setTimeout(() => done(new Error('timeout')), timeoutMs);
    offs.push(
      net.on('init', (m) => {
        init = m;
        check();
      }),
      net.on('tp', (m) => {
        const i = num(m.i, -1);
        if (i < 0 || i > 400 || parts[i] !== undefined) return;
        parts[i] = String(m.d ?? '');
        got++;
        check();
      }),
    );
    net.onClose((why) => done(new Error(why)));
  });
}

interface Snap {
  tm: number;
  m: NetMsg;
}
interface Avatar {
  w: Worker;
  tag: THREE.Sprite | null;
  slot: number;
}

export class MpGuest {
  private buf: Snap[] = [];
  private clock = -1;
  private latest = -1;
  private avatars = new Map<string, Avatar>();
  private bots: Worker[] = [];
  private offs: (() => void)[] = [];
  private inAcc = 0;
  private latch = { act: false, act2: false };
  private expMesh: THREE.Group | null = null;
  private firePts = new Float32Array(90 * 4);
  private fireN = 0;
  private lastN = -1;
  readonly names = new Map<string, { name: string; slot: number }>();
  /** máquinas com alguém dentro (índices) */
  readonly taken = new Set<number>();
  fireTgt: { x: number; z: number } | null = null;
  fireOn = false;
  plantSpin = 0;
  /** pedi para entrar nesta máquina (aguardando o anfitrião) */
  asking = -1;
  /** onde o anfitrião acha que estou (-1 a pé) e há quanto tempo discorda */
  private seatBad = 0;
  ready = false;

  constructor(
    private g: Garimpo,
    readonly net: GbNet,
  ) {
    this.offs.push(
      net.on('s', (m) => this.snap(m)),
      net.on('seat', (m) => {
        const idx = Math.round(num(m.m, -1));
        const want = this.asking;
        this.asking = -1;
        if (idx >= 0 && idx === want && this.g.ms[idx]) this.g.enterNet(this.g.ms[idx]);
        else notify(t('gb.mp.busy', 'Alguém já está nessa máquina'), { icon: 'warning', kind: 'warn' });
      }),
      net.on('pe', (m) => this.setPeers(m.ps)),
    );
  }
  setPeers(ps: unknown): void {
    this.names.clear();
    for (const p of (ps as [string, string, number][]) ?? []) this.names.set(String(p[0]), { name: String(p[1]), slot: num(p[2]) | 0 });
    this.g.onPeersChanged();
  }
  list(): Peer[] {
    return [...this.names].map(([id, p]) => ({ id, name: p.name, slot: p.slot })).sort((a, b) => a.slot - b.slot);
  }

  private snap(m: NetMsg): void {
    const n = num(m.n, -1);
    if (n <= this.lastN && this.lastN - n < 1000) return;
    this.lastN = n;
    const g = this.g;
    const s = g.sv;
    const w = g.w;
    if (!s || !w) return;
    // imediato (não interpola): economia, chuva, terreno, fogo, eventos
    s.money = num(m.mo, s.money);
    s.stock = num(m.st, s.stock);
    g.rainOn = !!m.rn;
    this.plantSpin = num(m.ps);
    if (typeof m.tr === 'string' && m.tr) w.T.applyNetDelta(m.tr);
    if (m.wa) g.water?.netApply(m.wa);
    if (m.pr) g.proc?.netApply(m.pr);
    const fi = m.fi as number[] | undefined;
    this.fireOn = !!fi;
    this.fireN = 0;
    if (fi) {
      for (let i = 0; i + 2 < fi.length && this.fireN < 90; i += 3) {
        const k = this.fireN++ * 4;
        this.firePts[k] = fi[i];
        this.firePts[k + 1] = w.T.heightAt(fi[i], fi[i + 1]);
        this.firePts[k + 2] = fi[i + 1];
        this.firePts[k + 3] = fi[i + 2];
      }
    }
    const ft = m.ft as number[] | undefined;
    this.fireTgt = ft ? { x: ft[0], z: ft[1] } : null;
    g.alert(this.fireOn ? t('gb.fireAlert', 'FOGO! Apague com água') : null);
    for (const [tn, b] of (m.bu as [number, number][]) ?? []) w.burnTree(tn, b);
    const ec = m.ec as number[] | undefined;
    if (ec) {
      s.upg.shovel = ec[0];
      s.upg.barrow = ec[1];
      s.upg.plant = ec[2];
      s.bots.drivers = ec[3];
      s.bots.miners = ec[4];
      s.mineOpen = !!ec[5];
      g.netUg = { carts: ec[6], bots: ec[7] };
      g.worker!.cargo.cap = g.barrowCap();
    }
    for (const e of (m.ev as unknown[][]) ?? []) this.event(e);
    // máquinas novas (compradas por alguém)
    const ms = (m.ms as number[][]) ?? [];
    for (let i = g.ms.length; i < ms.length; i++) {
      const a = ms[i];
      const kind = KINDS[a[0]];
      if (!kind) break;
      g.addMachine(kind, a[1], a[3], 0);
    }
    this.taken.clear();
    for (const p of (m.pl as unknown[][]) ?? []) {
      const seat = p[p.length - 1] as number;
      if (seat >= 0) this.taken.add(seat);
      if (p[0] === this.net.me.id) this.mine(p as number[], seat);
    }
    this.buf.push({ tm: num(m.tm), m });
    if (this.buf.length > 24) this.buf.splice(0, this.buf.length - 24);
    this.latest = num(m.tm);
    if (this.clock < 0) this.clock = this.latest - DELAY;
    this.ready = true;
  }
  /** a minha linha no retrato: carga do carrinho e conferência do lugar */
  private mine(p: number[], seat: number): void {
    const g = this.g;
    const wk = g.worker!;
    wk.cargo.vol = p[7] * wk.cargo.cap;
    wk.cargo.gold = p[10];
    const myIdx = g.cur && g.cur !== wk ? g.ms.indexOf(g.cur) : -1;
    if (myIdx >= 0 && seat !== myIdx) {
      // o anfitrião não me pôs nessa máquina (ou tirou): depois de 1,5 s, desço
      this.seatBad += SNAP_DT;
      if (this.seatBad > 1.5) {
        this.seatBad = 0;
        g.exitNet(false);
      }
    } else this.seatBad = 0;
  }
  private event(e: unknown[]): void {
    const g = this.g;
    const k = e[0];
    if (k === 'sold') {
      const pay = num(e[1]);
      bigMoment(t('gb.sold', 'Vendido! +{n}', { n: pay.toLocaleString('pt-BR') }), { icon: 'coins', sub: Math.round(num(e[2])) + ' g' });
      audio.cash();
    } else if (k === 'toast') g.toast(String(e[1] ?? '').slice(0, 16));
    else if (k === 'fire') g.say(t('gb.fireStart', 'FOGO na mata! Pegue água no lago e apague!'), 'fire');
    else if (k === 'fireOut') {
      g.say(t('gb.fireOut', 'Fogo apagado! Muito bem!'));
      audio.cash();
    } else if (k === 'stockBurn') notify(t('gb.stockBurn', 'O fogo chegou no estoque! Perdeu {n} g', { n: Math.round(num(e[1])) }), { icon: 'fire', kind: 'bad' });
    else if (k === 'buy') {
      const name = g.itemName(String(e[1]));
      if (name) bigMoment(t('gb.mp.bought', '{p} comprou: {n}', { p: String(e[2] ?? ''), n: name }), { icon: 'gift' });
      audio.cash();
    } else if (k === 'hostBuy') {
      const name = g.itemName(String(e[1]));
      if (name) bigMoment(t('gb.bought', 'Comprou: {n}', { n: name }), { icon: 'gift' });
    }
  }

  /** por quadro: pose suavizada de todo mundo (~150 ms atrás do anfitrião) */
  frame(dt: number): void {
    const g = this.g;
    const w = g.w;
    if (!w || !this.buf.length) return;
    // relógio: anda com o tempo real e se aproxima devagar do "último retrato − atraso"
    this.clock += dt;
    const target = this.latest - DELAY;
    if (Math.abs(target - this.clock) > 1) this.clock = target;
    else this.clock += (target - this.clock) * Math.min(1, dt * 1.5);
    let i1 = this.buf.findIndex((b) => b.tm >= this.clock);
    if (i1 < 0) i1 = this.buf.length - 1;
    const i0 = Math.max(0, i1 - 1);
    const s0 = this.buf[i0];
    const s1 = this.buf[i1];
    const span = s1.tm - s0.tm;
    const k = span > 1e-4 ? Math.max(0, Math.min(1, (this.clock - s0.tm) / span)) : 1;
    // máquinas
    const m0 = (s0.m.ms as unknown[][]) ?? [];
    const m1 = (s1.m.ms as unknown[][]) ?? [];
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion();
    for (let i = 0; i < m1.length && i < g.ms.length; i++) {
      const mc = g.ms[i];
      const b = m1[i] as [number, number, number, number, number, number, number, number, number, number, number, number, number[], number[]];
      const a = (m0[i] as typeof b) ?? b;
      if (KINDS[b[0]] !== mc.kind) continue;
      q0.set(a[4], a[5], a[6], a[7]).normalize();
      q1.set(b[4], b[5], b[6], b[7]).normalize();
      q0.slerp(q1, k);
      const ea = a[13] ?? [];
      const eb = b[13] ?? [];
      const heli = mc instanceof Heli;
      const ex = eb.map((v, j) => (ea[j] === undefined ? v : heli && j >= 6 ? lerpA(ea[j], v, k) : lerp(ea[j], v, k)));
      const sa = a[12] ?? [];
      mc.netSetSusp(b[12]?.map((v, j) => lerp(sa[j] ?? v, v, k)));
      mc.cargo.vol = b[10];
      mc.cargo.gold = b[11];
      mc.netApply(lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k), q0, lerp(a[8], b[8], k), lerp(a[9], b[9], k), ex, dt);
      mc.sync(dt);
    }
    // jogadores (menos eu)
    const p0 = new Map(((s0.m.pl as unknown[][]) ?? []).map((p) => [p[0] as string, p as number[]]));
    const seen = new Set<string>();
    for (const pr of (s1.m.pl as unknown[][]) ?? []) {
      const id = pr[0] as string;
      if (id === this.net.me.id) continue;
      seen.add(id);
      const b = pr.slice(1) as number[];
      const a = (p0.get(id)?.slice(1) as number[]) ?? b;
      const seat = b[b.length - 1];
      let av = this.avatars.get(id);
      const info = this.names.get(id);
      const slot = info?.slot ?? (id === this.net.hostId ? 0 : 1);
      if (!av || av.slot !== slot) {
        if (av) this.dropAvatar(av);
        const wk = new Worker(PCOL[slot]);
        wk.cargo.cap = g.barrowCap();
        w.scene.add(wk.group);
        const tag = nameTag(info?.name ?? 'Bloop', PCOL[slot]);
        wk.group.add(tag);
        av = { w: wk, tag, slot };
        this.avatars.set(id, av);
      }
      av.w.group.visible = seat === -1;
      if (seat !== -1) continue;
      av.w.netPose([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerpA(a[3], b[3], k), b[4], b[5], b[6], b[7], b[8]], dt);
    }
    for (const [id, av] of this.avatars)
      if (!seen.has(id)) {
        this.dropAvatar(av);
        this.avatars.delete(id);
      }
    // garimpeiros ajudantes
    const b1 = (s1.m.bt as number[][]) ?? [];
    const b0 = (s0.m.bt as number[][]) ?? [];
    while (this.bots.length < b1.length) {
      const wk = new Worker();
      wk.cargo.cap = 0.14;
      w.scene.add(wk.group);
      this.bots.push(wk);
    }
    while (this.bots.length > b1.length) {
      const wk = this.bots.pop()!;
      wk.group.removeFromParent();
      wk.dispose();
    }
    this.bots.forEach((wk, i) => {
      const b = b1[i];
      const a = b0[i] ?? b;
      wk.netPose([lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerpA(a[3], b[3], k), b[4], b[5], b[6], b[7], b[8]], dt);
    });
    // caminhão de exportação
    const e1 = s1.m.ex as number[] | undefined;
    if (e1) {
      const e0 = (s0.m.ex as number[] | undefined) ?? e1;
      if (!this.expMesh) {
        this.expMesh = buildExportTruck();
        w.scene.add(this.expMesh);
      }
      this.expMesh.visible = true;
      const x = lerp(e0[0], e1[0], k);
      const z = lerp(e0[1], e1[1], k);
      this.expMesh.position.set(x, w.T.heightAt(x, z), z);
      this.expMesh.rotation.y = lerpA(e0[2], e1[2], k);
    } else if (this.expMesh) this.expMesh.visible = false;
    // fogo
    w.flames.update(performance.now() / 1000, this.firePts, this.fireOn ? this.fireN : 0);
  }

  /** manda a minha entrada (~15/s); toques curtos não se perdem */
  sendInput(ctl: Ctl, dt: number): void {
    if (ctl.act) this.latch.act = true;
    if (ctl.act2) this.latch.act2 = true;
    this.inAcc += dt;
    if (this.inAcc < INPUT_DT) return;
    this.inAcc = 0;
    const g = this.g;
    const wk = g.worker!;
    const p = wk.group.position;
    const b = (v: boolean) => (v ? 1 : 0);
    this.net.send({
      t: 'i',
      x: r2(p.x),
      z: r2(p.z),
      yaw: r3(wk.group.rotation.y),
      sp: r2(wk.speedNow),
      cy: r3(g.camYawNow),
      c: [r2(ctl.mx), r2(ctl.my), r2(ctl.rx), r2(ctl.ry), r2(ctl.gas), r2(ctl.brake), b(this.latch.act || ctl.act), b(this.latch.act2 || ctl.act2), b(ctl.up), b(ctl.down), b(ctl.drive), b(ctl.expert), b(ctl.hand), b(ctl.auto), ctl.gearSel, b(ctl.diff), ctl.mode4, ctl.pressure],
    });
    this.latch.act = this.latch.act2 = false;
  }
  action(k: string, extra: Record<string, unknown> = {}): void {
    this.net.send({ t: 'a', k, ...extra });
  }

  tags(cam: THREE.Camera): void {
    for (const av of this.avatars.values()) if (av.tag) tagVis(av.tag, cam);
  }
  private dropAvatar(av: Avatar): void {
    if (av.tag) dropTag(av.tag);
    av.w.group.removeFromParent();
    av.w.dispose();
  }
  dispose(): void {
    for (const f of this.offs) f();
    for (const av of this.avatars.values()) this.dropAvatar(av);
    this.avatars.clear();
    for (const wk of this.bots) wk.dispose();
    this.bots = [];
    this.net.leave();
  }
}
