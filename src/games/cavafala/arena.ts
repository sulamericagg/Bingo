/* ============================================================
 *  CAVA & FALA — MODO "ARENA CAVA-CAVA" (2–4 Bloops, você + bots).
 *  Ilha flutuante que encolhe (todo mundo cava + a borda desmorona).
 *  Empurre os rivais para o vazio com engenhocas de desenho animado;
 *  quanto maior a % de "splat", mais longe o Bloop voa. Último de pé vence.
 *  Bots agem sozinhos (é PvP), com 3 dificuldades; treino = bots não atacam.
 * ============================================================ */
import * as THREE from 'three';
import { sfx } from '../../3d/common/sfx';
import { t } from '../../i18n';
import { bigMoment, notify, objective } from '../../ui/notify';
import type { Hat } from './bloop';
import { M } from './data';
import { canPay, costOf, gadgetById, noMods, type GDef } from './gadgets';
import type { Diff } from './save';
import { PAZINHA, type Actor, type ModeCtl, type World } from './world';

interface BotAI {
  st: 'roam' | 'dig' | 'fight' | 'flee';
  think: number;
  target: Actor | null;
  react: number;
  aimErr: number;
  speedK: number;
  edge: number;
  aggro: number;
  wander: THREE.Vector3;
  fireT: number;
  hitT: number;
}

export interface ArenaResult {
  win: boolean;
  place: number;
  total: number;
  coins: number;
  time: number;
  kos: number;
}

const NAMES = ['Pipoca', 'Jujuba', 'Bolota', 'Tatu', 'Fofão', 'Paçoca'];
const COLS = ['#ff8a3a', '#5ad6a0', '#b08aff', '#ffd34a', '#ff5a8a', '#5ab0ff'];
const HATS: Hat[] = ['cap', 'crown', 'bow', 'straw', 'beanie', 'helmet'];
const BOT_GADGETS = ['escudo', 'bolhas', 'luva', 'tornado', 'trampolim', 'ventilador', 'cavabomba', 'martelo', 'neve', 'muralha', 'geleia', 'boneco'];
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

export class ArenaMode implements ModeCtl {
  time = 0;
  private phase: 'count' | 'play' | 'end' = 'count';
  private count = 3.5;
  private Rcur: number;
  private shrinkT = 40;
  private warnT = -1;
  private placeN: number;
  private kos = 0;
  private clouds = new THREE.Group();
  private bots: Actor[] = [];
  private lastBeat = 4;

  constructor(
    private w: World,
    private o: { bots: number; diff: Diff; practice: boolean; R: number; topY: number },
    private onEnd: (r: ArenaResult) => void,
  ) {
    this.Rcur = o.R;
    const n = Math.max(1, Math.min(3, o.bots));
    this.placeN = n + 1;
    const ring = o.R * 0.55;
    const pos = (i: number) => {
      const a = (i / (n + 1)) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * ring,
        z = Math.sin(a) * ring;
      return new THREE.Vector3(x, w.T.groundY(x, z, o.topY + 6) + 0.3, z);
    };
    const me = w.me;
    me.body.p.copy(pos(0));
    this.face(me, 0, 0);
    this.kit(me);
    const used = new Set<number>();
    for (let i = 0; i < n; i++) {
      let k = Math.floor(Math.random() * NAMES.length);
      while (used.has(k)) k = (k + 1) % NAMES.length;
      used.add(k);
      const a = w.addActor(NAMES[k], COLS[k], pos(i + 1), false, HATS[k], COLS[(k + 2) % COLS.length]);
      const d = o.diff;
      a.ai = {
        st: 'roam',
        think: 0.5 + Math.random(),
        target: null,
        react: [1.3, 0.75, 0.4][d],
        aimErr: [0.2, 0.1, 0.045][d],
        speedK: [0.72, 0.88, 1][d],
        edge: [3.2, 2.6, 2.2][d],
        aggro: o.practice ? 0 : [0.5, 0.75, 1][d],
        wander: new THREE.Vector3(),
        fireT: 1,
        hitT: 0,
      } satisfies BotAI;
      this.face(a, 0, 0);
      this.kit(a);
      this.bots.push(a);
    }
    // nuvens lá embaixo (o "vazio")
    const m = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: new THREE.Color('#6a7aa0'), transparent: true, opacity: 0.85 });
    const g = new THREE.SphereGeometry(1, 10, 8);
    for (let i = 0; i < 26; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const s = new THREE.Mesh(g, m);
        s.position.set(k * 2.4 - 3, Math.sin(k * 2) * 0.5, (k % 2) * 1.4);
        s.scale.setScalar(2.2 + Math.random() * 2);
        c.add(s);
      }
      const a = Math.random() * Math.PI * 2;
      const R = 12 + Math.random() * 70;
      c.position.set(Math.cos(a) * R, -6 - Math.random() * 18 + (i % 4 === 0 ? 40 : 0), Math.sin(a) * R);
      c.scale.y = 0.5;
      this.clouds.add(c);
    }
    w.scene.add(this.clouds);
    w.setSky('#7ac8ff', '#e0f4ff', 1, '#bfe6ff');
    objective(o.practice ? t('cavafala.arena.objPractice', 'Treino: teste engenhocas nos rivais') : t('cavafala.arena.obj', 'Empurre os rivais para fora da ilha!'));
    bigMoment(t('cavafala.arena.ready', 'Preparar...'), { sub: t('cavafala.arena.title', 'Arena Cava-Cava') });
  }

  private face(a: Actor, x: number, z: number): void {
    a.yaw = Math.atan2(-(x - a.body.p.x), -(z - a.body.p.z));
    a.pitch = -0.15;
  }
  private kit(a: Actor): void {
    a.inv = { [M.Grama]: 14, [M.Terra]: 24, [M.Argila]: 22, [M.Areia]: 22, [M.Pedra]: 8, [M.Cristal]: 3, [M.Ouro]: 1 };
    if (!a.isPlayer) a.slots.push(this.w.makeSlot(PAZINHA, noMods()));
    a.slots.push(this.w.makeSlot(gadgetById('canhao')!, noMods()));
    a.sel = a.slots.length - 1;
    if (a.isPlayer) this.w.updateHot();
  }

  status(): string {
    const all = this.w.actors.filter((a) => !a.helper);
    return all
      .map((a) => `<span class="cf-chip${a.alive ? '' : ' out'}${a.isPlayer ? ' me' : ''}"><i style="--c:${a.color}"></i>${a.name} ${Math.round(a.pct)}%</span>`)
      .join('');
  }

  update(dt: number): void {
    if (this.phase === 'end') return;
    if (this.phase === 'count') {
      const before = Math.ceil(this.count);
      this.count -= dt;
      for (const a of this.w.actors) a.move.set(0, 0, 0);
      this.w.me.body.v.x = this.w.me.body.v.z = 0;
      const now = Math.ceil(this.count);
      if (now !== before && now > 0 && now <= 3) {
        bigMoment(String(now));
        sfx.click();
      }
      if (this.count <= 0) {
        this.phase = 'play';
        bigMoment(t('cavafala.arena.go', 'Cava!'), { color: 'linear-gradient(90deg,#ff8a3a,#ffd34a)' });
        sfx.swish();
        notify(t('cavafala.arena.tip', 'Cave para juntar material e FALE para criar engenhocas!'), { ms: 4000 });
      }
      return;
    }
    this.time += dt;
    // encolhe a borda
    this.shrinkT -= dt;
    if (this.shrinkT < 2.5 && this.warnT < 0) {
      this.warnT = 2.5;
      notify(t('cavafala.arena.crumble', 'A borda vai desmoronar!'), { kind: 'warn', key: 'crumble' });
      sfx.whoosh();
    }
    if (this.warnT > 0) {
      this.warnT -= dt;
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * (this.Rcur - 0.5),
          z = Math.sin(a) * (this.Rcur - 0.5);
        this.w.fx.dust(x, this.o.topY + 0.3, z, '#c8a070', 2);
      }
    }
    if (this.shrinkT <= 0 && this.Rcur > 6) {
      this.shrinkT = 11;
      this.warnT = -1;
      this.crumble();
    }
    for (const b of this.bots) if (b.alive) this.think(b, dt);
    // batida de tensão quando sobram 2
    const alive = this.w.actors.filter((a) => a.alive && !a.helper);
    if (alive.length === 2 && this.lastBeat > 0) {
      this.lastBeat = 0;
      notify(t('cavafala.arena.final', 'Duelo final!'), { kind: 'warn' });
    }
  }

  private crumble(): void {
    const T = this.w.T;
    const R = this.Rcur;
    const step = 1.3 / R;
    for (let a = 0; a < Math.PI * 2; a += step) {
      const x = Math.cos(a) * (R + 0.6),
        z = Math.sin(a) * (R + 0.6);
      for (let y = this.o.topY - 12; y <= this.o.topY + 3; y += 1.6) T.dig(x, y, z, 1.9, null, 6);
      if (Math.random() < 0.25) this.w.fx.chunks(x, this.o.topY, z, Math.cos(a), 0.2, Math.sin(a), '#9a6a3f', 2, 3);
    }
    this.Rcur -= 1.7;
    sfx.bump();
    this.w.fx.addShake(0.25);
  }

  /* ------------------------------ IA dos bots ------------------------------ */
  private think(a: Actor, dt: number): void {
    const ai = a.ai as BotAI;
    const w = this.w;
    const T = w.T;
    const p = a.body.p;
    ai.think -= dt;
    ai.fireT -= dt;
    ai.hitT = Math.max(0, ai.hitT - dt);
    a.move.set(0, 0, 0);
    if (a.trapT > 0) return;
    // escolhe alvo / estado
    if (ai.think <= 0) {
      ai.think = ai.react * (0.7 + Math.random() * 0.6);
      const tot = Object.values(a.inv).reduce((s, v) => s + (v ?? 0), 0);
      const foes = w.actors.filter((x) => x !== a && x.alive && !x.helper);
      const decoy = w.structs.find((s) => s.g.beh === 'decoy' && !s.dead && s.owner !== a);
      ai.target = foes.length ? foes.reduce((b, x) => (x.body.p.distanceToSquared(p) - (x.isPlayer ? 20 : 0) < b.body.p.distanceToSquared(p) ? x : b)) : null;
      if (ai.aggro <= 0) ai.st = Math.random() < 0.5 ? 'dig' : 'roam';
      else if (tot < 30) ai.st = 'dig';
      else ai.st = Math.random() < ai.aggro ? 'fight' : Math.random() < 0.5 ? 'dig' : 'roam';
      if (ai.st === 'roam') {
        const an = Math.random() * Math.PI * 2;
        ai.wander.set(Math.cos(an) * this.Rcur * 0.4, 0, Math.sin(an) * this.Rcur * 0.4);
      }
      // tenta criar uma engenhoca
      if (ai.aggro > 0 && Math.random() < 0.35 + ai.aggro * 0.25) this.tryBuild(a, ai);
      // engana-se com o boneco
      if (decoy && Math.random() < 0.5) ai.target = null;
      void decoy;
    }
    // segurança: borda / buraco à frente
    const rr = Math.hypot(p.x, p.z);
    let toC = false;
    if (rr > this.Rcur - ai.edge) toC = true;
    // movimento por estado
    let goal: THREE.Vector3 | null = null;
    const tg = ai.target;
    if (ai.st === 'fight' && tg) {
      const s = a.slots[a.sel];
      const melee = s && (s.g.beh === 'glove' || s.g.beh === 'hammer');
      const want = melee ? 2 : 8;
      const d = tg.body.p.distanceTo(p);
      V.copy(tg.body.p).sub(p).setY(0).normalize();
      if (d > want + 2) goal = tg.body.p;
      else if (d < want - 2 && !melee) goal = V2.copy(p).addScaledVector(V, -3);
      // mira com erro
      const lead = V2.copy(tg.body.p).addScaledVector(tg.body.v, d / 24).add(V.set(0, 0.8 + d * 0.012, 0));
      const eye = V.copy(p).setY(p.y + 1.3);
      const dir = lead.sub(eye).normalize();
      const err = ai.aimErr * (1 + Math.min(2, d / 12));
      dir.x += (Math.random() - 0.5) * err;
      dir.y += (Math.random() - 0.5) * err * 0.6;
      dir.z += (Math.random() - 0.5) * err;
      dir.normalize();
      a.yaw = Math.atan2(-dir.x, -dir.z);
      a.pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
      // escolhe arma pela distância
      const want2 = a.slots.findIndex((x) => (d < 3 ? x.g.beh === 'glove' || x.g.beh === 'hammer' : x.g.kind === 'weapon' && x.g.beh !== 'glove' && x.g.beh !== 'hammer'));
      if (want2 >= 0 && want2 !== a.sel) a.sel = want2;
      const sel = a.slots[a.sel];
      if (sel && sel.g.kind === 'weapon' && ai.fireT <= 0 && d < (sel.g.beh === 'glove' || sel.g.beh === 'hammer' ? 3 : 20)) {
        ai.fireT = ai.react * 0.9 + Math.random() * 0.6;
        w.useSlot(a, sel, true, dt, eye.clone(), dir);
      }
      // escudo se apanhou há pouco
      const sh = a.slots.find((x) => x.g.beh === 'shield');
      if (sh && a.lastHit && ai.hitT <= 0 && a.shieldCd <= 0 && a.body.air > 0.2) {
        ai.hitT = 3;
        w.useSlot(a, sh, true, dt, eye.clone(), dir);
      }
    } else if (ai.st === 'dig') {
      // cava um pouco à frente (para o centro) e junta material
      a.digCd -= dt;
      const c = V.set(-p.x, 0, -p.z).normalize();
      a.yaw = Math.atan2(-c.x, -c.z);
      if (a.digCd <= 0) {
        a.digCd = 0.45;
        const eye = V2.copy(p).setY(p.y + 1.3);
        const dir = new THREE.Vector3(c.x * 0.8, -0.7, c.z * 0.8).normalize();
        w.digFrom(a, eye, dir, { R: 0.9, power: 1, reach: 4 });
      }
      if (Math.random() < 0.01) goal = V.set((Math.random() - 0.5) * this.Rcur, 0, (Math.random() - 0.5) * this.Rcur).clone();
    } else goal = ai.wander;
    if (toC) goal = V.set(0, p.y, 0).clone();
    if (goal) {
      V.copy(goal).sub(p).setY(0);
      const d = V.length();
      if (d > 0.6) {
        V.multiplyScalar(1 / d);
        // não anda para buraco/vazio
        const ax = p.x + V.x * 1.4,
          az = p.z + V.z * 1.4;
        const gy = T.groundY(ax, az, p.y + 1.5, p.y - 3);
        if (gy === -Infinity && !toC) V.set(-p.x, 0, -p.z).normalize();
        a.move.copy(V);
        if (ai.st !== 'fight' || !tg) a.yaw = Math.atan2(-V.x, -V.z);
        if (a.body.onGround && T.sample(p.x + V.x * 0.7, p.y + 0.55, p.z + V.z * 0.7) > 0) a.wantJump = true;
      }
    }
  }

  private tryBuild(a: Actor, ai: BotAI): void {
    const w = this.w;
    const opts = BOT_GADGETS.map((id) => gadgetById(id)!).filter((g) => g && !a.slots.some((s) => s.g.id === g.id) && canPay(a.inv, costOf(g, noMods())));
    if (!opts.length) return;
    let g: GDef = opts[Math.floor(Math.random() * opts.length)];
    // ventilador/trampolim só faz sentido perto do alvo
    const tg = ai.target;
    if ((g.beh === 'fan' || g.beh === 'wall') && tg) {
      if (tg.body.p.distanceTo(a.body.p) > 7) g = opts.find((x) => x.kind === 'weapon' || x.kind === 'tool') ?? g;
      else {
        V.copy(tg.body.p).sub(a.body.p);
        a.yaw = Math.atan2(-V.x, -V.z);
      }
    }
    if (g.kind === 'struct' && g.beh !== 'fan' && g.beh !== 'trampoline' && g.beh !== 'decoy' && g.beh !== 'wall' && g.beh !== 'jelly') return;
    w.create(a, g, noMods(), 'bot');
    if (g.kind !== 'struct' && a.slots.length > 5) a.slots.splice(1, 1);
  }

  /* ------------------------------ eventos ------------------------------ */
  onOut(a: Actor): void {
    if (!a.alive || this.phase === 'end') return;
    const w = this.w;
    if (this.o.practice && a.isPlayer) {
      // treino: volta para a ilha
      a.body.p.set(0, this.o.topY + 4, 0);
      a.body.v.set(0, 0, 0);
      a.pct = 0;
      notify(t('cavafala.arena.respawn', 'Treino: você voltou para a ilha.'), { key: 'resp' });
      return;
    }
    if (this.o.practice && !a.isPlayer) {
      a.body.p.set((Math.random() - 0.5) * 6, this.o.topY + 5, (Math.random() - 0.5) * 6);
      a.body.v.set(0, 0, 0);
      a.pct = 0;
      if (a.lastHit?.isPlayer) {
        this.kos++;
        bigMoment(t('cavafala.arena.ko', 'Plof! {n} caiu!', { n: a.name }));
      }
      return;
    }
    a.alive = false;
    a.place = this.placeN--;
    sfx.whoosh();
    if (a.lastHit?.isPlayer && !a.isPlayer) this.kos++;
    bigMoment(a.isPlayer ? t('cavafala.arena.youFell', 'Você caiu!') : t('cavafala.arena.ko', 'Plof! {n} caiu!', { n: a.name }), { sub: a.lastHit && a.lastHit !== a ? t('cavafala.arena.by', 'empurrado por {n}', { n: a.lastHit.name }) : '' });
    if (a.isPlayer) {
      // vira espectador lá no alto
      a.body.p.set(0, this.o.topY + 14, this.o.R + 8);
      a.body.v.set(0, 0, 0);
      a.yaw = 0;
      a.pitch = -0.55;
      setTimeout(() => this.end(), 1800);
      return;
    }
    const alive = w.actors.filter((x) => x.alive && !x.helper);
    if (alive.length <= 1) {
      if (alive[0]) alive[0].place = 1;
      setTimeout(() => this.end(), 1200);
    }
  }

  private end(): void {
    if (this.phase === 'end') return;
    this.phase = 'end';
    const me = this.w.me;
    const total = this.bots.length + 1;
    const place = me.alive ? 1 : me.place || total;
    const win = place === 1;
    if (win) {
      me.model?.say('!');
      this.w.fx.confetti(me.body.p.x, me.body.p.y + 2, me.body.p.z, 80);
      sfx.sparkle();
    }
    for (const b of this.bots) if (b.alive && b.model) b.model.cheer = 1;
    objective(null);
    const coins = (win ? 30 : 8 + (total - place) * 6) + this.kos * 5;
    this.onEnd({ win, place, total, coins, time: this.time, kos: this.kos });
  }

  dispose(): void {
    objective(null);
    this.w.scene.remove(this.clouds);
  }
}
