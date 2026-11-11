/* ============================================================
 *  MUNDO online — veículos fabricáveis sincronizados.
 *  Autoridade do DONO: quem dirige (ou dirigiu por último / montou)
 *  simula a física no próprio aparelho e manda o estado ~10×/s; nos
 *  outros o veículo é um espelho cinemático interpolado (rodas giram
 *  pela velocidade, esterço e motor vêm do dono). Entrar num veículo
 *  de outro = pedir o volante (servidor decide); o dono antigo passa
 *  as toras da caçamba ao novo dono (somem lá, nascem aqui).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { t } from '../../../i18n';
import { decodeDesign, encodeDesign, type Vehicle } from './content/vehicles';
import type { NetSession } from './net';
import type { WorldGame } from './worldgame';

export interface VRec {
  n: string;
  d: string;
  s: number[];
  f: number;
  hp: number;
  it: [string, number][];
  cs: number[];
  o: string;
  drv: boolean;
}
interface Snap {
  t: number;
  p: number[];
}
/** atraso de interpolação (ms): ~1,3 pacote */
const DELAY = 130;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _ql = new THREE.Quaternion();
const _qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0);
const _cv = new CANNON.Vec3();

export class VehNet {
  readonly byNid = new Map<string, Vehicle>();
  private own = new Map<string, string>();
  private drv = new Map<string, boolean>();
  private snaps = new Map<Vehicle, Snap[]>();
  private cargoSp = new Map<Vehicle, number[]>();
  private stillT = new Map<Vehicle, number>();
  private sentParked = new Set<Vehicle>();
  private lastSent = new Map<Vehicle, number[]>();
  private applying = false;
  private pendingDrive = '';
  private sendT = 0;
  private finT = 0;
  private seq = 0;

  constructor(
    private sess: NetSession,
    private g: WorldGame,
  ) {}

  private get vm() {
    return this.g.sb!.vm;
  }
  private get you(): string {
    return this.sess.you;
  }
  ownerOf(v: Vehicle): string {
    return this.own.get(v.nid) ?? '';
  }

  /** liga nos ganchos do gerente e remonta a lista do servidor */
  attach(list: VRec[]): void {
    const vm = this.vm;
    // online: a lista vem do servidor (não do save local)
    this.applying = true;
    vm.clear();
    this.applying = false;
    vm.onSpawn = (v) => {
      if (this.applying) return;
      v.nid = this.you.slice(0, 12) + ':' + Date.now().toString(36) + (this.seq++).toString(36);
      this.byNid.set(v.nid, v);
      this.own.set(v.nid, this.you);
      const b = v.body;
      this.sess.send({ t: 'va', n: v.nid, d: encodeDesign(v.design), s: [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].map(r3), f: r3(v.fuel), hp: r3(v.hp), it: [...v.items] });
    };
    vm.onRemove = (v) => {
      this.forget(v);
      if (this.applying || !v.nid) return;
      this.sess.send({ t: 'vd', n: v.nid });
    };
    for (const r of list) this.add(r);
  }

  private forget(v: Vehicle): void {
    this.byNid.delete(v.nid);
    this.snaps.delete(v);
    this.cargoSp.delete(v);
    this.stillT.delete(v);
    this.sentParked.delete(v);
    this.lastSent.delete(v);
  }

  private add(r: VRec): void {
    if (this.byNid.has(r.n)) return;
    const d = decodeDesign(r.d);
    if (!d || !Array.isArray(r.s) || r.s.length !== 7) return;
    this.applying = true;
    const v = this.vm.spawn(d, r.s[0], r.s[2], 0, { x: r.s[0], y: r.s[1], z: r.s[2], q: [r.s[3], r.s[4], r.s[5], r.s[6]], fuel: r.f, hp: r.hp, items: Array.isArray(r.it) ? r.it : [] } as never, r.s[1]);
    this.applying = false;
    if (!v) return;
    v.nid = r.n;
    this.byNid.set(r.n, v);
    this.own.set(r.n, r.o);
    this.drv.set(r.n, !!r.drv);
    this.cargoSp.set(v, Array.isArray(r.cs) ? r.cs : []);
    if (r.o !== this.you) {
      v.setRemote(true);
      v.park();
      v.syncModel();
    }
    v.netBusy = !!r.drv && r.o !== this.you;
  }

  /** mensagens da sala (true = era de veículo) */
  onMsg(m: Record<string, any>): boolean {
    switch (m.t) {
      case 'va':
        this.add(m as VRec);
        return true;
      case 'vd': {
        const v = this.byNid.get(m.n);
        if (v) {
          if (this.vm.driving === v) this.g.sb!.forceExitVehicle();
          this.applying = true;
          this.vm.remove(v);
          this.applying = false;
          this.forget(v);
        }
        return true;
      }
      case 'vs': {
        const now = performance.now();
        for (const e of m.l as unknown[][]) {
          const v = this.byNid.get(e[0] as string);
          if (!v || !v.remote) continue;
          let a = this.snaps.get(v);
          if (!a) this.snaps.set(v, (a = []));
          a.push({ t: now, p: e.slice(1) as number[] });
          if (a.length > 8) a.shift();
        }
        return true;
      }
      case 'vf': {
        const v = this.byNid.get(m.n);
        if (v && v.remote) {
          v.fuel = +m.f || 0;
          v.hp = +m.hp || 0;
          v.broken = v.hp <= 0;
          v.items.clear();
          if (Array.isArray(m.it)) for (const [k, n] of m.it) v.items.set(k, n);
          if (Array.isArray(m.cs)) this.cargoSp.set(v, m.cs);
        }
        return true;
      }
      case 'vo':
        this.owner(m.n, m.o, !!m.drv, m.by);
        return true;
      case 'vc': {
        const v = this.byNid.get(m.n);
        if (v && !v.remote) this.spawnCargo(v, m.c);
        return true;
      }
    }
    return false;
  }

  /** dono mudou */
  private owner(n: string, o: string, drv: boolean, by: string): void {
    const v = this.byNid.get(n);
    if (!v) return;
    const prev = this.own.get(n) ?? '';
    this.own.set(n, o);
    this.drv.set(n, drv);
    v.netBusy = drv && o !== this.you;
    if (o === this.you && v.remote) {
      // virou meu: liga a física a partir do último retrato
      const a = this.snaps.get(v);
      const last = a?.[a.length - 1];
      v.setRemote(false);
      if (last) {
        const p = last.p;
        v.body.position.set(p[0], p[1], p[2]);
        v.body.quaternion.set(p[3], p[4], p[5], p[6]);
        v.body.velocity.set(p[7], p[8], p[9]);
      }
      this.snaps.delete(v);
      v.unpark();
      // dono anterior saiu do mundo: as toras guardadas na ficha voltam aqui
      if (!prev || (prev !== this.you && !this.sess.peers.has(prev))) {
        const cs = this.cargoSp.get(v) ?? [];
        if (cs.length) this.spawnCargo(v, cs.map((sp) => [sp, 1]));
      }
      this.cargoSp.set(v, []);
    } else if (o !== this.you && !v.remote) {
      // perdi o volante: passa as toras e vira espelho
      if (this.vm.driving === v) this.g.sb!.forceExitVehicle();
      const c = this.takeCargo(v);
      if (o) this.sess.send({ t: 'vc', n, to: o, c });
      this.cargoSp.set(v, c.map((x) => x[0]));
      v.setRemote(true);
      this.sentParked.delete(v);
    }
    if (by === this.you && this.pendingDrive === n) {
      this.pendingDrive = '';
      if (o === this.you) this.g.sb!.drive(v);
      else this.g.hud.toast(t('mundo.vehBusy', 'Outra pessoa está dirigindo'), 'warn');
    }
  }

  /** toras na caçamba (as minhas, físicas) → lista [espécie, valor]; tira do mundo */
  private takeCargo(v: Vehicle): [number, number][] {
    const out: [number, number][] = [];
    const g = this.g;
    for (const b of v.cargo) {
      const l = g.logs.find((x) => x.b === b);
      if (!l) continue;
      out.push([l.sp, l.val]);
      g.removeLog(l);
    }
    v.cargo.clear();
    v.cargoMass = 0;
    return out.slice(0, 40);
  }
  private spawnCargo(v: Vehicle, c: unknown): void {
    if (!Array.isArray(c)) return;
    const g = this.g;
    const s = v.lay.cargo[0];
    if (!s) return;
    const per = Math.max(1, Math.floor((s.hl * 2) / 0.6));
    c.slice(0, 40).forEach((e, i) => {
      const [sp, val] = Array.isArray(e) ? e : [0, 1];
      const row = i % per;
      const lay = Math.floor(i / per);
      const p = v.toWorld(s.x, 0.45 + lay * 0.55, s.z - s.hl + 0.3 + row * 0.6, _cv);
      g.addLog(p.x, p.y, p.z, v.body.velocity.x, v.body.velocity.y, v.body.velocity.z, +sp || 0, +val || 1, v.yaw);
    });
  }

  /** o jogador tocou Dirigir: true = pode entrar já; false = pediu o volante (entra quando o servidor der) */
  canDrive(v: Vehicle): boolean {
    if (!v.nid) return true;
    if (!v.remote && this.ownerOf(v) === this.you) {
      this.sess.send({ t: 'vo', n: v.nid, take: 1, drv: 1 });
      return true;
    }
    if (v.netBusy) {
      this.g.hud.toast(t('mundo.vehBusy', 'Outra pessoa está dirigindo'), 'warn');
      return false;
    }
    this.pendingDrive = v.nid;
    this.sess.send({ t: 'vo', n: v.nid, take: 1, drv: 1 });
    return false;
  }
  exited(v: Vehicle): void {
    if (v.nid) this.sess.send({ t: 'vo', n: v.nid, drv: 0 });
    this.sendFin(v);
  }

  private sendFin(v: Vehicle): void {
    const cs: number[] = [];
    for (const b of v.cargo) {
      const l = this.g.logs.find((x) => x.b === b);
      if (l) cs.push(l.sp);
    }
    this.sess.send({ t: 'vf', n: v.nid, f: r3(v.fuel), hp: r3(v.hp), it: [...v.items], cs: cs.slice(0, 40) });
  }

  /** antes do passo da física: velocidade dos espelhos (rodas giram) */
  pre(dt: number): void {
    const now = performance.now() - DELAY;
    for (const v of this.vm.list) {
      if (!v.remote) continue;
      const a = this.snaps.get(v);
      const last = a?.[a.length - 1];
      if (!last) continue;
      const p = last.p;
      const moving = Math.hypot(p[7], p[8], p[9]) > 0.15 || Math.abs(p[10]) > 0.05 || (a!.length > 1 && now < last.t);
      let st = this.stillT.get(v) ?? 0;
      st = moving ? 0 : st + dt;
      this.stillT.set(v, st);
      if (moving) v.unpark();
      else if (st > 1 && !v.parked) v.park();
      if (v.parked) continue;
      v.body.velocity.set(p[7], p[8], p[9]);
      v.body.angularVelocity.set(0, p[10], 0);
      v.netSteer = p[11];
      v.netEngine = (p[12] & 1) !== 0;
      v.lights = (p[12] & 2) !== 0;
      v.speed = Math.hypot(p[7], p[9]);
    }
  }

  /** depois do passo: pose interpolada dos espelhos + toras de desenho */
  post(): void {
    const now = performance.now() - DELAY;
    const gl = this.g.ghostLogs;
    gl.length = 0;
    for (const v of this.vm.list) {
      if (!v.remote) continue;
      const a = this.snaps.get(v);
      if (a && a.length) {
        let i = a.length - 1;
        while (i > 0 && a[i - 1].t > now) i--;
        const b = a[i];
        const s0 = i > 0 ? a[i - 1] : null;
        const bp = v.body.position;
        const bq = v.body.quaternion;
        if (s0 && now >= s0.t && now <= b.t) {
          const k = (now - s0.t) / Math.max(1, b.t - s0.t);
          const p0 = s0.p;
          const p1 = b.p;
          bp.set(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k);
          _q0.set(p0[3], p0[4], p0[5], p0[6]);
          _q1.set(p1[3], p1[4], p1[5], p1[6]);
          _ql.slerpQuaternions(_q0, _q1, k);
          bq.set(_ql.x, _ql.y, _ql.z, _ql.w);
        } else {
          // depois do último retrato: extrapola um pouco pela velocidade
          const p = b.p;
          const ex = Math.min(0.25, Math.max(0, (now - b.t) / 1000));
          bp.set(p[0] + p[7] * ex, p[1] + p[8] * ex, p[2] + p[9] * ex);
          bq.set(p[3], p[4], p[5], p[6]);
        }
        v.body.aabbNeedsUpdate = true;
      }
      // toras da caçamba (só desenho)
      const last = a?.[a.length - 1];
      const n = last ? last.p[13] | 0 : (this.cargoSp.get(v)?.length ?? 0);
      const s = v.lay.cargo[0];
      if (!n || !s) continue;
      const sps = this.cargoSp.get(v) ?? [];
      const per = Math.max(1, Math.floor((s.hl * 2) / 0.6));
      const vq = v.body.quaternion;
      for (let i = 0; i < Math.min(n, 40); i++) {
        const row = i % per;
        const lay = Math.floor(i / per);
        const p = v.toWorld(s.x, 0.3 + lay * 0.5, s.z - s.hl + 0.3 + row * 0.6, _cv);
        const q = new THREE.Quaternion(vq.x, vq.y, vq.z, vq.w).multiply(_qy);
        gl.push({ x: p.x, y: p.y, z: p.z, q, sp: sps[i] ?? 0 });
      }
    }
  }

  /** por quadro (envio) */
  tick(dt: number): void {
    this.sendT -= dt;
    this.finT -= dt;
    if (this.sendT > 0) return;
    this.sendT = 0.1;
    const l: unknown[] = [];
    const fin = this.finT <= 0;
    if (fin) this.finT = 2;
    for (const v of this.vm.list) {
      if (v.remote || !v.nid || this.ownerOf(v) !== this.you) continue;
      if (v.parked) {
        if (this.sentParked.has(v)) continue;
        this.sentParked.add(v);
        this.sendFin(v);
      } else {
        this.sentParked.delete(v);
        if (fin) this.sendFin(v);
      }
      const b = v.body;
      // quase parado (rampa, tremidinha da física): manda só a cada 1 s
      const lp = this.lastSent.get(v);
      const now = performance.now();
      if (lp && !v.parked && now - lp[7] < 1000 && Math.abs(lp[0] - b.position.x) + Math.abs(lp[1] - b.position.y) + Math.abs(lp[2] - b.position.z) < 0.04 && Math.abs(lp[3] - b.quaternion.x) + Math.abs(lp[4] - b.quaternion.y) + Math.abs(lp[5] - b.quaternion.z) + Math.abs(lp[6] - b.quaternion.w) < 0.004) continue;
      this.lastSent.set(v, [b.position.x, b.position.y, b.position.z, b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w, now]);
      const bits = (v.engineOn ? 1 : 0) | (v.lights ? 2 : 0) | (v.driver ? 4 : 0) | (v.broken ? 8 : 0) | (v.parked ? 16 : 0);
      l.push([v.nid, r3(b.position.x), r3(b.position.y), r3(b.position.z), r3(b.quaternion.x), r3(b.quaternion.y), r3(b.quaternion.z), r3(b.quaternion.w), v.parked ? 0 : r3(b.velocity.x), v.parked ? 0 : r3(b.velocity.y), v.parked ? 0 : r3(b.velocity.z), v.parked ? 0 : r3(b.angularVelocity.y), r3(v.steerAngle), bits, v.cargo.size]);
      if (l.length >= 24) break;
    }
    if (l.length) this.sess.send({ t: 'vs', l });
  }
}
