/* ============================================================
 *  CAVA & FALA — ponte entre a sala online (net.ts) e a partida (world/arena/restore).
 *   - manda o SEU Bloop 10×/s (o anfitrião junta os bots no mesmo pacote)
 *   - manda cavadas, engenhocas, espumas, acertos e o que você falou
 *   - aplica o que chega: bonecos interpolados, terreno, engenhocas iguais,
 *     empurrões (quem atirou decide o acerto), placar/borda/vila do anfitrião
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import type { ArenaMode } from './arena';
import type { Hat } from './bloop';
import { gadgetById, MODULES, noMods, type Mods, type ModuleId, type SizeMod } from './gadgets';
import type { BotState, CavaNet, NetEvent, Num3 } from './net';
import type { RestoreMode } from './restore';
import { PAZINHA, type Actor, type Slot, type World, type WorldNet } from './world';

export type RoundInit = Extract<NetEvent, { t: 'init' }>;

/** cores e chapéus dos jogadores por lugar na sala (anfitrião = 0) */
export const PCOLS = ['#ff5cc8', '#3f8cff', '#f4f0ff', '#e83a3a'];
/** bots online: só as cores que não se confundem com as dos jogadores (laranja, verde, roxo, amarelo) */
export const BOT_KS = [0, 1, 2, 3];
export const PHATS: Hat[] = ['', 'cap', 'bow', 'beanie'];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: THREE.Vector3): Num3 => [r2(v.x), r2(v.y), r2(v.z)];
const fin = (v: unknown, lim = 1e4): number => (typeof v === 'number' && isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const SIZES: SizeMod[] = ['normal', 'grande', 'pequeno', 'gigante'];
const MOD_IDS = new Set<string>(MODULES.map((m) => m.id));

/** engenhoca vinda da rede: só valores conhecidos */
export function cleanMods(m: unknown): Mods {
  const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
  const out = noMods();
  if (SIZES.includes(o.size as SizeMod)) out.size = o.size as SizeMod;
  if (typeof o.mat === 'number' && o.mat >= 0 && o.mat < 16) out.mat = Math.floor(o.mat);
  out.double = o.double === true;
  out.fast = o.fast === true;
  if (Array.isArray(o.modules)) out.modules = o.modules.filter((x): x is ModuleId => typeof x === 'string' && MOD_IDS.has(x)).slice(0, 4);
  return out;
}

function flags(a: Actor): number {
  return (a.shieldT > 0 ? 1 : 0) | (a.trapT > 0 ? 2 : 0) | (a.mounted ? 4 : 0);
}
const held = (a: Actor): string => a.slots[a.sel]?.g.id ?? '';

export interface BindModes {
  arena: ArenaMode | null;
  restore: RestoreMode | null;
}

/** liga a partida à sala; devolve a função para desligar */
export class Binder implements WorldNet {
  private offs: (() => void)[] = [];
  private stT = 0;
  constructor(
    private net: CavaNet,
    private w: World,
    private m: BindModes,
  ) {
    w.net = this;
    w.onStep = (dt) => this.tick(dt);
    this.offs.push(net.onEvent((from, e) => this.on(from, e)));
  }
  dispose(): void {
    for (const f of this.offs) f();
    this.offs.length = 0;
    if (this.w.net === this) this.w.net = null;
    this.w.onStep = null;
  }

  /* ------------------------------ saída ------------------------------ */
  private tick(dt: number): void {
    this.stT -= dt;
    if (this.stT > 0) return;
    this.stT = 0.1;
    const a = this.w.me;
    const p = a.body.p;
    const e: NetEvent = { t: 'state', x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(a.yaw), pitch: r2(a.pitch), pct: Math.round(a.pct), f: flags(a), g: held(a) };
    if (this.net.isHost) {
      const bots: BotState[] = [];
      for (const b of this.w.actors) if (b.ai && !b.remote && b.nid && b.alive) bots.push([b.nid, r2(b.body.p.x), r2(b.body.p.y), r2(b.body.p.z), r2(b.yaw), Math.round(b.pct), flags(b), held(b)]);
      if (bots.length) e.bots = bots;
    }
    this.net.send(e);
  }
  dig(x: number, y: number, z: number, r: number, p: number): void {
    this.net.send({ t: 'dig', x: r2(x), y: r2(y), z: r2(z), r: r2(r), p: r2(p) });
  }
  build(a: Actor, g: { id: string }, mods: Mods, pos: THREE.Vector3, yaw: number, tp: THREE.Vector3 | null): void {
    if (!a.nid || a.remote) return;
    this.net.send({ t: 'build', a: a.nid, id: g.id, mods, x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), yaw: r2(yaw), ...(tp ? { tp: r3(tp) } : {}) });
  }
  fire(a: Actor, s: Slot, o: THREE.Vector3, d: THREE.Vector3): void {
    if (!a.nid || a.remote) return;
    this.net.send({ t: 'fire', a: a.nid, id: s.g.id, mods: s.mods, o: r3(o), d: [Math.round(d.x * 1000) / 1000, Math.round(d.y * 1000) / 1000, Math.round(d.z * 1000) / 1000] });
  }
  hit(target: Actor, dx: number, dy: number, dz: number, power: number, by: Actor): void {
    if (!target.nid) return;
    this.net.send({ t: 'hit', target: target.nid, dx: r2(dx), dy: r2(dy), dz: r2(dz), power: r2(power), by: by.nid ?? '' });
  }
  voice(_a: Actor, text: string): void {
    const s = text.trim().slice(0, 40);
    if (s) this.net.send({ t: 'voice', a: this.w.me.nid ?? this.net.me.id, text: s });
  }

  /* ------------------------------ entrada ------------------------------ */
  private puppet(nid: unknown): Actor | null {
    if (typeof nid !== 'string') return null;
    const a = this.w.actorByNid(nid);
    return a && a.remote ? a : null;
  }
  private on(from: string, e: NetEvent): void {
    const w = this.w;
    switch (e.t) {
      case 'state': {
        const a = this.puppet(from);
        if (a) w.pushSnap(a, fin(e.x), fin(e.y), fin(e.z), fin(e.yaw), fin(e.pitch, 2), fin(e.pct, 999), fin(e.f, 255) | 0, String(e.g ?? ''));
        if (from === this.net.hostId && Array.isArray(e.bots))
          for (const b of e.bots) {
            const ba = Array.isArray(b) ? this.puppet(b[0]) : null;
            if (ba) w.pushSnap(ba, fin(b[1]), fin(b[2]), fin(b[3]), fin(b[4]), -0.1, fin(b[5], 999), fin(b[6], 255) | 0, String(b[7] ?? ''));
          }
        break;
      }
      case 'dig':
        if (fin(e.r, 8) > 0) w.netDig(fin(e.x), fin(e.y), fin(e.z), fin(e.r, 8), fin(e.p, 6));
        break;
      case 'build': {
        const a = this.puppet(e.a);
        const g = gadgetById(String(e.id));
        if (!a || !g || !a.alive) break;
        w.netCreate(a, g, cleanMods(e.mods), fin(e.x), fin(e.y), fin(e.z), fin(e.yaw), Array.isArray(e.tp) ? new THREE.Vector3(fin(e.tp[0]), fin(e.tp[1]), fin(e.tp[2])) : null);
        break;
      }
      case 'fire': {
        const a = this.puppet(e.a);
        const g = e.id === PAZINHA.id ? null : gadgetById(String(e.id));
        if (!a || !g || !a.alive || !Array.isArray(e.o) || !Array.isArray(e.d)) break;
        const d = new THREE.Vector3(fin(e.d[0], 1), fin(e.d[1], 1), fin(e.d[2], 1));
        if (d.lengthSq() < 0.01) break;
        w.netFire(a, g, cleanMods(e.mods), new THREE.Vector3(fin(e.o[0]), fin(e.o[1]), fin(e.o[2])), d.normalize());
        break;
      }
      case 'hit': {
        const tg = w.actorByNid(String(e.target));
        if (!tg || tg.remote || !tg.alive) break;
        // quem atirou decide; aqui só aplica (com limite)
        const by = w.actorByNid(String(e.by));
        w.applyKnock(tg, fin(e.dx, 1.5), fin(e.dy, 1.5), fin(e.dz, 1.5), Math.min(4, Math.max(0, fin(e.power, 4))), by);
        break;
      }
      case 'voice': {
        const a = this.puppet(e.a) ?? this.puppet(from);
        const text = String(e.text ?? '').slice(0, 40);
        if (a && text) {
          w.netVoice(a, text);
          notify(`${a.name}: “${text}”`, { icon: 'megaphone', key: 'voice-' + a.nid, ms: 2600 });
        }
        break;
      }
      case 'crumble':
        if (from === this.net.hostId) this.m.arena?.netCrumble(fin(e.n, 99) | 0, !!e.w);
        break;
      case 'go':
        if (from === this.net.hostId) this.m.arena?.netGo();
        break;
      case 'out':
        if (from === e.id) this.m.arena?.netOut(String(e.id), String(e.by ?? ''));
        break;
      case 'ko':
        if (from === this.net.hostId) this.m.arena?.netKo(String(e.id), fin(e.place, 8) | 0, String(e.by ?? ''));
        break;
      case 'end':
        if (from !== this.net.hostId) break;
        if (this.m.arena && e.places && typeof e.places === 'object') this.m.arena.netEnd(e.places);
        if (this.m.restore) this.m.restore.finish(!!e.win);
        break;
      case 'restore':
        this.m.restore?.netRestore(fin(e.i, 999) | 0, e.k === 'ok' && from === this.net.hostId ? 'ok' : 'pz');
        break;
      case 'clock':
        if (from === this.net.hostId) this.m.restore?.netClock(fin(e.time, 1e5));
        break;
    }
  }

  /** alguém saiu no meio da partida */
  left(id: string, name: string): void {
    notify(t('cavafala.net.left', '{n} saiu da sala', { n: name }), { icon: 'user', key: 'left-' + id });
    if (this.m.arena) this.m.arena.netLeave(id);
    else {
      const a = this.w.actorByNid(id);
      if (a && a.remote) this.w.removeActor(a);
    }
  }
  /** o anfitrião mudou */
  hostChanged(oldHost: string): void {
    if (!this.net.isHost) return;
    notify(t('cavafala.net.nowHost', 'Agora você é o anfitrião da sala!'), { icon: 'star', kind: 'good' });
    this.m.arena?.becomeHost(oldHost);
    this.m.restore?.becomeHost();
  }
}
