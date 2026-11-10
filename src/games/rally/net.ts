/* ============================================================
 *  RALLY LUNAR — "online opcional": outros jogadores aparecem na sua corrida
 *  Usa o contrato src/services/presence-api.ts. Sem o serviço (ou offline),
 *  simula visitantes locais ("fantasmas") que dirigem com física própria.
 * ============================================================ */
import type { JoinPresence, PeerState, PresenceSession } from '../../services/presence-api';
import { SKINS } from '../../game/skins';
import { effectiveStats, VEHICLES } from './data';
import { Car, DT, type Input } from './physics';
import type { Terrain } from './terrain';
import { EMOTES } from './draw';

export interface RemotePeer {
  id: string;
  name: string;
  skin: string;
  vehicle: number;
  bot: boolean;
  /** alvo (último estado recebido) */
  tx: number;
  ty: number;
  ta: number;
  d: number;
  /** desenhado (suavizado) */
  x: number;
  y: number;
  a: number;
  spin: number;
  emote: string;
  emoteT: number;
  lastEmote: string;
  // só bots
  car: Car | null;
  inp: Input;
  life: number;
  nextEmote: number;
  resetT: number;
  fresh: boolean;
}

const BOT_NAMES = ['Tica', 'Zeca', 'Luma', 'Bento', 'Nina', 'Pipo', 'Juju', 'Caco', 'Mel', 'Tito', 'Bia', 'Lelo', 'Dudu', 'Fifi'];

export class Lobby {
  peers = new Map<string, RemotePeer>();
  session: PresenceSession | null = null;
  online = false;
  onJoin: ((p: RemotePeer) => void) | null = null;
  onLeave: ((p: RemotePeer) => void) | null = null;
  private sendAcc = 0;
  private botTimer = 14 + Math.random() * 14;
  private botCount = 0;
  private realCount = 0;
  private destroyed = false;
  private flipReact = -1;
  /** só para testes: força bots a aparecerem logo */
  fastBots = false;
  /** "Jogar sozinho": nenhum bot aparece (visitantes reais continuam) */
  private solo = false;

  setSolo(on: boolean): void {
    this.solo = on;
    if (!on) return;
    for (const p of [...this.peers.values()]) {
      if (!p.bot) continue;
      this.peers.delete(p.id);
      this.botCount--;
    }
  }

  constructor(private terrain: Terrain) {}

  async start(seed: number): Promise<void> {
    try {
      const mods = import.meta.glob<{ joinPresence?: JoinPresence; default?: JoinPresence }>('../../services/presence.ts');
      const loader = mods['../../services/presence.ts'];
      if (!loader) return;
      const mod = await loader().catch(() => null);
      const join = mod?.joinPresence ?? mod?.default;
      if (!join || this.destroyed) return;
      const s = await join('rally', { botsIfAlone: 0, seed });
      if (this.destroyed) {
        s.leave();
        return;
      }
      this.session = s;
      this.online = s.online;
      s.onPeers((list) => this.syncPeers(list));
    } catch {
      this.session = null;
    }
  }

  private syncPeers(list: PeerState[]): void {
    const seen = new Set<string>();
    for (const ps of list) {
      seen.add(ps.id);
      let p = this.peers.get(ps.id);
      const st = ps.s ?? {};
      if (!p) {
        p = this.mk(ps.id, ps.name || '?', ps.skin === 'custom' ? 'bloop' : ps.skin, st.v ?? 0, !!ps.bot);
        p.x = p.tx = st.x ?? 0;
        p.y = p.ty = st.y ?? 0;
        p.a = p.ta = st.a ?? 0;
        this.peers.set(ps.id, p);
        this.realCount++;
        this.onJoin?.(p);
      }
      if (st.x !== undefined) p.tx = st.x;
      if (st.y !== undefined) p.ty = st.y;
      if (st.a !== undefined) p.ta = st.a;
      if (st.d !== undefined) p.d = st.d;
      if (st.v !== undefined) p.vehicle = Math.max(0, Math.min(VEHICLES.length - 1, st.v | 0));
      if (ps.emote && ps.emote !== p.lastEmote) this.showEmote(p, ps.emote);
      p.lastEmote = ps.emote ?? '';
    }
    for (const [id, p] of this.peers) {
      if (!p.car && !seen.has(id)) {
        this.peers.delete(id);
        this.realCount--;
        this.onLeave?.(p);
      }
    }
  }

  private mk(id: string, name: string, skin: string, vehicle: number, bot: boolean): RemotePeer {
    return { id, name, skin, vehicle, bot, tx: 0, ty: 0, ta: 0, d: 0, x: 0, y: 0, a: 0, spin: 0, emote: '', emoteT: 0, lastEmote: '', car: null, inp: { gas: true, brake: false }, life: 0, nextEmote: 8 + Math.random() * 10, resetT: 0, fresh: true };
  }

  showEmote(p: RemotePeer, code: string): void {
    p.emote = code;
    p.emoteT = 2.6;
  }

  /** envia o estado (chame todo frame; limita a ~5x/s) */
  send(dt: number, x: number, y: number, a: number, d: number, v: number): void {
    if (!this.session) return;
    this.sendAcc += dt;
    if (this.sendAcc < 0.2) return;
    this.sendAcc = 0;
    try {
      this.session.send({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, a: Math.round(a * 100) / 100, d: Math.round(d), v });
    } catch {
      /* rede caiu: segue offline */
    }
  }

  emote(code: string): void {
    try {
      this.session?.emote(code);
    } catch {
      /* */
    }
  }

  /** o jogador fez manobra: algum visitante comemora */
  reactFlip(): void {
    if (this.flipReact < 0) this.flipReact = 0.5 + Math.random() * 0.6;
  }

  spawnBot(playerX: number, ahead = Math.random() < 0.5): RemotePeer {
    const id = 'bot' + Math.floor(Math.random() * 1e9);
    const name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const free = SKINS.filter((s) => s.id !== 'custom');
    const skin = free[Math.floor(Math.random() * Math.min(free.length, 24))].id;
    const vi = Math.floor(Math.random() * VEHICLES.length);
    const p = this.mk(id, name, skin, vi, true);
    const def = VEHICLES[vi];
    const st = effectiveStats(def.id, { motor: 1 + Math.floor(Math.random() * 3), tires: 2, susp: 2, tank: 0 });
    st.power *= 0.9 + Math.random() * 0.12;
    const car = new Car(def, st);
    car.place(Math.max(2, playerX + (ahead ? 9 + Math.random() * 6 : -14 - Math.random() * 6)), this.terrain);
    p.car = car;
    p.life = 55 + Math.random() * 70;
    p.x = p.tx = car.x;
    p.y = p.ty = car.y;
    this.peers.set(id, p);
    this.botCount++;
    this.showEmote(p, 'oi');
    this.onJoin?.(p);
    return p;
  }

  /** passo de jogo (bots + suavização). gravity/grip do lugar de cada carro */
  update(dt: number, steps: number, playerX: number, playerSpeed: number, running: boolean): void {
    // bots aparecem quando não há ninguém de verdade
    if (running && this.realCount <= 0 && !this.solo) {
      this.botTimer -= dt * (this.fastBots ? 6 : 1);
      if (this.botTimer <= 0 && this.botCount < 2 && playerX > 40) {
        this.spawnBot(playerX);
        this.botTimer = 25 + Math.random() * 30;
      }
    }
    if (this.flipReact >= 0) {
      this.flipReact -= dt;
      if (this.flipReact < 0) {
        for (const p of this.peers.values()) if (p.car && Math.random() < 0.7) this.showEmote(p, Math.random() < 0.6 ? 'uau' : 'joinha');
        this.flipReact = -1;
      }
    }
    const k = 1 - Math.exp(-dt * 10);
    for (const p of this.peers.values()) {
      if (p.emoteT > 0) p.emoteT -= dt;
      const car = p.car;
      if (car) {
        this.driveBot(p, car, playerX, playerSpeed);
        const z = this.terrain.zone(car.x);
        for (let i = 0; i < steps; i++) car.step(p.inp, this.terrain, z.gravity, z.grip, true);
        p.x = car.x;
        p.y = car.y;
        p.a = car.a;
        p.d = car.x;
        p.spin = car.wheels[0].spin;
        if (car.roofTime > 0.5 || car.headHit) {
          p.resetT += dt;
          if (p.resetT > 1) {
            car.place(car.x + 2, this.terrain);
            p.resetT = 0;
          }
        }
        p.life -= dt;
        p.nextEmote -= dt;
        if (p.nextEmote <= 0) {
          this.showEmote(p, EMOTES[Math.floor(Math.random() * EMOTES.length)]);
          p.nextEmote = 12 + Math.random() * 14;
        }
        if (p.life <= 0) {
          this.peers.delete(p.id);
          this.botCount--;
          this.onLeave?.(p);
        }
      } else {
        // interpolação de quem é real
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        let da = p.ta - p.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        p.a += da * k;
        p.spin -= (Math.abs(p.tx - p.x) * 8 + 0.1) * dt * 6;
      }
    }
  }

  private driveBot(p: RemotePeer, car: Car, playerX: number, playerSpeed: number): void {
    const a = car.a;
    const inp = p.inp;
    const gap = car.x - playerX;
    // elástico: não some de vista para sempre
    car.st.topSpeed = car.def.topSpeed * (gap > 40 ? 0.7 : gap < -30 ? 1.25 : 1) * (playerSpeed < 1 && gap > 10 ? 0.5 : 1);
    if (car.wheelsOnGround === 0) {
      inp.gas = a < -0.15;
      inp.brake = a > 0.35;
    } else {
      inp.gas = a < 0.75;
      inp.brake = a > 1.0;
    }
  }

  destroy(): void {
    this.destroyed = true;
    try {
      this.session?.leave();
    } catch {
      /* */
    }
    this.session = null;
    this.peers.clear();
  }
}

export { DT };
