/* ============================================================
 *  BICHOS — lutas de chefe (fases, golpes avisados no chão, lacaios)
 *  e covis (posição determinística por célula de 900 m + cenário).
 *
 *  Brasalume (dragoa): F1 chão — sopro em cone (aviso 1,2 s) e rabada;
 *    F2 (<66%) voa — rasantes em linha deixando fogo, 3× e depois TOMBO
 *    (aviso em círculo) e fica tonta 3,5 s (dano ×1,5); no ar só leva
 *    dano à distância. F3 (<33%) — chão mais rápido + Brasinhas + tombos.
 *  Colosso Geodo: casca dura (×0,3) — só o núcleo exposto depois do
 *    soco (×1,6) ou explosivos (×0,9). Pedras arremessadas, F2 ondas de
 *    choque (pule!), F3 estalactites + Pedriscos.
 *  Nenúfera (hidra-lírio): o corpo só apanha quando as 3 cabeças-flor
 *    murcham; cada cabeça murcha solta um Botão-Cura que, se não for
 *    colhido em 6 s, desabrocha e revive uma cabeça. F2 mergulha e
 *    emerge debaixo do jogador, chamando Girinões.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../../i18n';
import type { MobManager } from './manager';
import { angDiff } from './manager';
import type { Mob } from './mob';
import type { DamageKind, Lair, MobHost } from './types';
import type { Telegraph } from './fx';

export const LAIR_CELL = 900;

function hash(i: number, j: number, s: number): number {
  let h = (i * 374761393 + j * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** covil da célula (i,j) — determinístico; null se não houver */
export function lairAt(host: MobHost, i: number, j: number): Lair | null {
  if (hash(i, j, 1) > 0.8) return null;
  const x = (i + (hash(i, j, 2) - 0.5) * 0.5) * LAIR_CELL;
  const z = (j + (hash(i, j, 3) - 0.5) * 0.5) * LAIR_CELL;
  if (Math.hypot(x, z) < 420) return null;
  const b = host.biomeAt(x, z);
  let boss: string;
  if (b === 'montanha' || b === 'deserto' || b === 'savana') boss = 'brasalume';
  else if (b === 'pantano' || b === 'tropical' || b === 'bambu') boss = 'nenufera';
  else if (b === 'cristal' || b === 'nevado' || b === 'cogumelos' || b === 'outono' || b === 'bosque' || b === 'cerejeiras') boss = 'colosso_geodo';
  else return null;
  const g = host.heightAt(x, z);
  if (boss !== 'nenufera' && host.waterLevel(x, z) > g) return null;
  return { key: `${boss}@${i},${j}`, boss, x, y: boss === 'colosso_geodo' ? g - 34 : g, z, r: boss === 'brasalume' ? 34 : boss === 'nenufera' ? 26 : 22 };
}

/* ------------------------------ cenário dos covis ------------------------------ */
function lam(c: string, e = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color: c, flatShading: true, emissive: e ? c : '#000000', emissiveIntensity: e });
}
export function lairProps(l: Lair): THREE.Group {
  const g = new THREE.Group();
  g.position.set(l.x, l.y, l.z);
  const rnd = (k: number) => hash(Math.round(l.x), Math.round(l.z), k);
  if (l.boss === 'brasalume') {
    const basalt = lam('#4a3a50');
    const ember = lam('#ff8a2e', 0.9);
    const gold = lam('#ffd34a', 0.25);
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const h = 6 + rnd(i) * 8;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, h, 6), basalt);
      p.position.set(Math.cos(a) * l.r, h / 2 - 0.5, Math.sin(a) * l.r);
      g.add(p);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 0.6, 6), ember);
      top.position.set(p.position.x, h - 0.2, p.position.z);
      g.add(top);
    }
    // ninho com tesouro
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), basalt);
      r.position.set(Math.cos(a) * 6 - 10, 0.4, Math.sin(a) * 6 - 10);
      g.add(r);
    }
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.12, 8), gold);
      c.position.set(-10 + (rnd(20 + i) - 0.5) * 6, 0.1 + (i % 3) * 0.12, -10 + (rnd(40 + i) - 0.5) * 6);
      g.add(c);
    }
  } else if (l.boss === 'colosso_geodo') {
    const rock = lam('#5a5468');
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd(i);
      const col = i % 2 ? '#ff7ab0' : '#7af0ff';
      const cl = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const h = 2 + rnd(i * 3 + k) * 4;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.5 + k * 0.15, h, 5), lam(col, 0.7));
        c.position.set((k - 1) * 0.6, h / 2, (k % 2) * 0.5);
        c.rotation.z = (k - 1) * 0.35;
        cl.add(c);
      }
      cl.position.set(Math.cos(a) * l.r, 0, Math.sin(a) * l.r);
      g.add(cl);
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rnd(50 + i), 0), rock);
      r.position.set(Math.cos(a + 0.2) * (l.r - 3), 0.3, Math.sin(a + 0.2) * (l.r - 3));
      g.add(r);
    }
  } else {
    const pad = lam('#4aa85a');
    const stem = lam('#6a8a3a');
    const bloom = lam('#ff8ac8', 0.35);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd(i) * 0.3;
      const r = l.r * (0.55 + rnd(30 + i) * 0.45);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(1.2 + rnd(i) * 1.2, 1.2 + rnd(i) * 1.2, 0.12, 9), pad);
      d.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      g.add(d);
      if (i % 3 === 0) {
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3, 5), stem);
        s.position.set(Math.cos(a) * (l.r + 2), 1.5, Math.sin(a) * (l.r + 2));
        g.add(s);
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), bloom);
        f.position.set(s.position.x, 3.1, s.position.z);
        g.add(f);
      }
    }
  }
  return g;
}

/* ------------------------------ controle da luta ------------------------------ */
interface Puddle {
  x: number;
  z: number;
  ttl: number;
}
interface Bud {
  m: Mob;
  ttl: number;
}

export class BossCtl {
  readonly kind: string;
  main!: Mob;
  readonly heads: Mob[] = [];
  private buds: Bud[] = [];
  private minions: Mob[] = [];
  phase = 1;
  readonly phases = 3;
  st = 'intro';
  private t = 0;
  private cd = 0;
  private count = 0;
  private lockYaw = 0;
  private tx = 0;
  private tz = 0;
  private dirX = 0;
  private dirZ = 1;
  private tickT = 0;
  private puddles: Puddle[] = [];
  private tele: Telegraph | null = null;
  private ringHit = false;
  private summonT = 0;
  private slamT = 0;
  private exposed = 0;
  private bodyOpen = 0;
  private subT = 0;
  active = true;
  done = false;
  private endT = 0;
  readonly props: THREE.Group;

  constructor(
    readonly mgr: MobManager,
    readonly lair: Lair,
  ) {
    this.kind = lair.boss;
    this.props = lairProps(lair);
    mgr.scene.add(this.props);
    const L = lair;
    if (this.kind === 'nenufera') {
      this.main = mgr.spawn('nenufera', L.x, L.z, { y: L.y + 2, persistent: true });
      this.main.pinned = true;
      for (let i = 0; i < 3; i++) {
        const h = mgr.spawn('nenufera_cabeca', L.x, L.z, { y: L.y + 2, persistent: true });
        h.part = i;
        h.pinned = true;
        h.boss = this;
        h.a = 1 + i * 0.8;
        this.heads.push(h);
      }
      this.placeHydra(0);
    } else {
      // chega voando / levanta do chão a alguns metros
      const a = Math.atan2(mgr.pl.x - L.x, mgr.pl.z - L.z);
      this.main = mgr.spawn(this.kind, L.x - Math.sin(a) * 8, L.z - Math.cos(a) * 8, { y: L.y + 2, persistent: true });
      this.main.yaw = a;
    }
    this.main.boss = this;
    this.main.st = 'boss';
    this.main.cave = this.kind === 'colosso_geodo';
    this.t = 2.2;
    mgr.sound('roar', L.x, L.y, L.z);
    mgr.host.shake?.(0.5);
    mgr.toast(t('mob.ui.bossAwake', '{n} despertou!', { n: this.main.def.name() }));
  }

  get name(): string {
    return this.main.def.name();
  }
  /** 0..1 */
  get hpFrac(): number {
    return Math.max(0, this.main.hp / this.main.maxHp);
  }
  /** texto curto do estado (vulnerável etc.) para a barra */
  get hint(): string {
    if (this.kind === 'brasalume' && this.st === 'stunned') return t('mob.ui.vulnerable', 'Vulnerável!');
    if (this.kind === 'colosso_geodo' && this.exposed > this.mgr.time) return t('mob.ui.coreOpen', 'Núcleo exposto!');
    if (this.kind === 'nenufera' && this.bodyOpen > this.mgr.time) return t('mob.ui.vulnerable', 'Vulnerável!');
    if (this.kind === 'brasalume' && this.main.flying) return t('mob.ui.flying', 'No ar — use ataques à distância');
    if (this.buds.length) return t('mob.ui.buds', 'Colha os botões-cura!');
    return '';
  }

  private setPhase(p: number): void {
    if (p <= this.phase) return;
    this.phase = p;
    this.mgr.emit('bossPhase', this);
    this.mgr.sound('roar', this.main.x, this.main.y, this.main.z);
    this.mgr.host.shake?.(0.4);
  }

  /* ------------------------------ dano ------------------------------ */
  onDamage(m: Mob, amt: number, kind: DamageKind): number {
    if (this.done) return 0;
    if (this.kind === 'brasalume') {
      if (kind === 'fire') amt *= 0.2;
      if (m.flying && m.y - this.mgr.ground(m, m.x, m.z) > 3.5 && kind === 'melee') return 0;
      if (this.st === 'stunned') amt *= 1.5;
      return amt;
    }
    if (this.kind === 'colosso_geodo') {
      if (this.exposed > this.mgr.time) return amt * 1.6;
      if (kind === 'blast') return amt * 0.9;
      return amt * 0.3;
    }
    // hidra
    if (m === this.main) return this.bodyOpen > this.mgr.time ? amt : 0;
    if (m.def.id === 'nenufera_cabeca') {
      if (m.st === 'sleep' || m.phased) return 0;
      if (amt >= m.hp - 0.5) {
        this.wilt(m);
        return 0;
      }
      return amt;
    }
    return amt; // botão-cura
  }

  onPartDown(m: Mob): void {
    if (m === this.main) this.defeat();
    const bi = this.buds.findIndex((b) => b.m === m);
    if (bi >= 0) {
      this.buds.splice(bi, 1);
      this.mgr.emitFx('sparkle', m.x, m.y + 1, m.z, 10, 0.4, 2, '#7affc4');
    }
  }

  onLand(m: Mob): void {
    if (m !== this.main) return;
    if (this.kind === 'brasalume' && this.st === 'slam') {
      const c = this.mgr;
      c.host.shake?.(0.8);
      c.sound('slam', m.x, m.y, m.z);
      c.emitFx('dust', m.x, m.y, m.z, 26, 4, 6);
      c.emitFx('fire', m.x, m.y + 0.5, m.z, 14, 3, 3);
      if (Math.hypot(c.pl.x - m.x, c.pl.z - m.z) < 7.5) c.hurtPlayer(m, 12, 'blast', 14);
      this.st = 'stunned';
      this.t = 3.5;
      m.want = 0;
    }
  }

  private defeat(): void {
    if (!this.active) return;
    this.active = false;
    this.endT = 4;
    for (const h of this.heads) if (h.alive) this.mgr.kill(h, false);
    for (const b of this.buds) if (b.m.alive) this.mgr.kill(b.m, false);
    for (const mi of this.minions) if (mi.alive) this.mgr.kill(mi, false);
    this.buds.length = 0;
    this.puddles.length = 0;
    if (this.tele) this.tele.done = true;
    const m = this.main;
    this.mgr.fx.poof(m.x, m.y + 2, m.z, 4, m.def.plan.glow);
    this.mgr.emitFx('star', m.x, m.y + 3, m.z, 20, 3, 5);
    this.mgr.toast(t('mob.ui.bossDown', 'Vitória contra {n}! Que tesouro!', { n: this.name }));
    this.mgr.bossDefeated(this);
  }

  /* ------------------------------ quadro ------------------------------ */
  update(dt: number): void {
    if (!this.active) {
      this.endT -= dt;
      if (this.endT <= 0) this.done = true;
      return;
    }
    const c = this.mgr;
    const p = c.pl;
    // se o jogador fugir para longe, a luta "dorme" (o chefe volta a ficar inteiro)
    if (Math.hypot(p.x - this.lair.x, p.z - this.lair.z) > this.lair.r + 70 || !p.alive) {
      this.reset();
      return;
    }
    this.t -= dt;
    this.cd -= dt;
    this.stepPuddles(dt);
    if (this.kind === 'brasalume') this.dragon(dt);
    else if (this.kind === 'colosso_geodo') this.golem(dt);
    else this.hydra(dt);
    for (let i = this.minions.length - 1; i >= 0; i--) if (!this.minions[i].alive) this.minions.splice(i, 1);
  }

  /** jogador fugiu: some e volta inteiro na próxima visita */
  reset(): void {
    this.active = false;
    this.done = true;
    for (const m of [this.main, ...this.heads, ...this.buds.map((b) => b.m), ...this.minions]) m.dead = true;
    if (this.tele) this.tele.done = true;
    this.dispose();
  }

  dispose(): void {
    this.props.removeFromParent();
    this.props.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  private summon(id: string, n: number, r: number): void {
    const c = this.mgr;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const m = c.spawn(id, this.main.x + Math.cos(a) * r, this.main.z + Math.sin(a) * r, { y: this.main.y + 2, cave: this.main.cave, persistent: true });
      m.aggro = c.time + 120;
      c.fx.poof(m.x, m.y + 0.5, m.z, 0.8);
      this.minions.push(m);
    }
  }

  private face(m: Mob, x: number, z: number, dt: number, rate = 2.5): void {
    const ty = Math.atan2(x - m.x, z - m.z);
    const d = angDiff(m.yaw, ty);
    m.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  private stepPuddles(dt: number): void {
    const c = this.mgr;
    this.tickT -= dt;
    const tick = this.tickT <= 0;
    if (tick) this.tickT = 0.4;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const q = this.puddles[i];
      q.ttl -= dt;
      if (q.ttl <= 0) {
        this.puddles.splice(i, 1);
        continue;
      }
      if (Math.random() < dt * 6) c.emitFx('fire', q.x, c.ground(null, q.x, q.z) + 0.2, q.z, 1, 0.8, 1.2);
      if (tick && Math.hypot(c.pl.x - q.x, c.pl.z - q.z) < 1.9) c.hurtPlayer(this.main, 3, 'fire', 1, 'queimando', 2);
    }
  }

  /* ====================================== DRAGOA ====================================== */
  private mouth(m: Mob): [number, number, number] {
    const s = m.scale;
    return [m.x + Math.sin(m.yaw) * 4.4 * s, m.y + 5.0 * s, m.z + Math.cos(m.yaw) * 4.4 * s];
  }

  private dragon(dt: number): void {
    const c = this.mgr;
    const m = this.main;
    const p = c.pl;
    const L = this.lair;
    const frac = this.hpFrac;
    if (frac < 0.66 && this.phase === 1) {
      this.setPhase(2);
      this.st = 'takeoff';
      this.t = 1.6;
      this.count = 0;
      c.toast(t('mob.ui.dragonFly', 'Brasalume levantou voo!'));
    }
    if (frac < 0.33 && this.phase === 2 && !m.flying && this.st !== 'slam') {
      this.setPhase(3);
      this.summonT = 0;
      this.slamT = c.time + 20;
      c.toast(t('mob.ui.enraged', '{n} ficou furiosa!', { n: this.name }));
    }
    switch (this.st) {
      case 'intro':
        m.want = 0;
        this.face(m, p.x, p.z, dt);
        m.pose.lunge = Math.sin(this.t * 6) * 0.3;
        if (this.t <= 0) this.st = 'walk';
        return;
      case 'walk': {
        this.face(m, p.x, p.z, dt, 2);
        m.tx = p.x;
        m.tz = p.z;
        const d = m.dist;
        m.want = d > 9 ? (this.phase === 3 ? 6 : 4) : 0;
        if (this.phase === 3) {
          this.summonT -= dt;
          if (this.summonT <= 0 && this.minions.length < 6) {
            this.summonT = 18;
            this.summon('brasinha', 4, 6);
          }
          if (c.time > this.slamT) {
            this.slamT = c.time + 26;
            this.st = 'takeoff';
            this.t = 1.4;
            this.count = 99;
            return;
          }
        }
        if (this.cd > 0) return;
        if (d < 8) {
          this.st = 'swipe';
          this.t = 0.9;
          m.want = 0;
          this.tele = c.fx.telegraph({ kind: 'circle', x: m.x, y: m.y, z: m.z, yaw: 0, size: 8, width: 0, dur: 0.9 });
        } else if (d < 22) {
          this.st = 'breathAim';
          const w = this.phase === 3 ? 0.9 : 1.25;
          this.t = w;
          m.want = 0;
          this.lockYaw = Math.atan2(p.x - m.x, p.z - m.z);
          m.yaw = this.lockYaw;
          const [mx, , mz] = this.mouth(m);
          this.tele = c.fx.telegraph({ kind: 'cone', x: mx, y: c.ground(m, mx, mz), z: mz, yaw: this.lockYaw, size: 17, width: 0.5, dur: w });
        }
        return;
      }
      case 'swipe':
        m.want = 0;
        m.yaw += dt * (this.t < 0.35 ? 18 : 0);
        if (this.t <= 0) {
          if (m.dist < 8.5) c.hurtPlayer(m, 8, 'melee', 12);
          c.emitFx('dust', m.x, m.y, m.z, 14, 5, 3);
          this.st = 'walk';
          this.cd = 1.4;
        }
        return;
      case 'breathAim':
        m.want = 0;
        m.yaw = this.lockYaw;
        m.pose.lunge = -0.5;
        if (this.t <= 0) {
          this.st = 'breath';
          this.t = 1.6;
          this.tickT = 0;
          c.sound('fire', m.x, m.y, m.z);
        }
        return;
      case 'breath': {
        m.want = 0;
        m.yaw = this.lockYaw;
        m.pose.lunge = 0.6;
        const [mx, my, mz] = this.mouth(m);
        for (let i = 0; i < 4; i++) {
          const a = this.lockYaw + (Math.random() - 0.5) * 0.9;
          const sp = 10 + Math.random() * 8;
          c.fx.emitVel('fire', mx, my, mz, Math.sin(a) * sp, -3 + Math.random() * 2, Math.cos(a) * sp, 1, 1.1, 0.45);
        }
        if (this.tickT <= 0) {
          this.tickT = 0.3;
          const dx = p.x - mx;
          const dz = p.z - mz;
          const dd = Math.hypot(dx, dz);
          if (dd < 17 && Math.abs(angDiff(this.lockYaw, Math.atan2(dx, dz))) < 0.5) c.hurtPlayer(m, 5, 'fire', 2, 'queimando', 3);
        }
        if (this.t <= 0) {
          this.st = 'walk';
          this.cd = this.phase === 3 ? 1.2 : 2.2;
        }
        return;
      }
      case 'takeoff':
        m.flying = true;
        m.grounded = false;
        m.alt = Math.min(16, m.alt + dt * 12);
        m.want = 0;
        c.sound('flap', m.x, m.y, m.z);
        if (this.t <= 0) {
          this.st = this.count >= 3 ? 'slamAim' : 'circle';
          this.t = 3;
          if (this.st === 'slamAim') this.beginSlam();
        }
        return;
      case 'circle': {
        const a = c.time * 0.55;
        m.tx = L.x + Math.cos(a) * 24;
        m.tz = L.z + Math.sin(a) * 24;
        m.want = 15;
        m.alt += (16 - m.alt) * dt;
        if (this.t <= 0) {
          // mira o rasante passando pelo jogador
          let dx = p.x - L.x;
          let dz = p.z - L.z;
          const dl = Math.hypot(dx, dz);
          if (dl < 2) {
            dx = Math.cos(a);
            dz = Math.sin(a);
          } else {
            dx /= dl;
            dz /= dl;
          }
          // perpendicular ao raio, para cruzar a arena
          const s = this.count % 2 ? 1 : -1;
          this.dirX = -dz * s;
          this.dirZ = dx * s;
          this.tx = p.x - this.dirX * 24;
          this.tz = p.z - this.dirZ * 24;
          const yaw = Math.atan2(this.dirX, this.dirZ);
          this.tele = c.fx.telegraph({ kind: 'line', x: this.tx, y: c.ground(null, p.x, p.z), z: this.tz, yaw, size: 48, width: 2.6, dur: 1.7 });
          this.st = 'strafeAim';
          this.t = 1.7;
        }
        return;
      }
      case 'strafeAim':
        m.tx = this.tx;
        m.tz = this.tz;
        m.want = Math.min(26, Math.hypot(this.tx - m.x, this.tz - m.z) * 2);
        m.alt += (12 - m.alt) * dt * 2;
        if (this.t <= 0) {
          m.x += (this.tx - m.x) * 0.5;
          m.z += (this.tz - m.z) * 0.5;
          m.yaw = Math.atan2(this.dirX, this.dirZ);
          this.st = 'strafe';
          this.t = 2.6;
          this.tickT = 0;
          c.sound('roar', m.x, m.y, m.z);
        }
        return;
      case 'strafe': {
        m.tx = this.tx + this.dirX * 60;
        m.tz = this.tz + this.dirZ * 60;
        m.yaw = Math.atan2(this.dirX, this.dirZ);
        m.spd = m.want = 21;
        m.alt += (5.5 - m.alt) * dt * 3;
        // rastro de fogo no chão
        if (Math.random() < dt * 9) this.puddles.push({ x: m.x + (Math.random() - 0.5) * 2, z: m.z + (Math.random() - 0.5) * 2, ttl: 2.2 });
        c.emitFx('fire', m.x, m.y + 1, m.z, 2, 1, 2);
        if (Math.hypot(p.x - m.x, p.z - m.z) < 3 && p.y > m.y - 2 && this.cd <= 0) {
          c.hurtPlayer(m, 7, 'fire', 10, 'queimando', 2);
          this.cd = 1;
        }
        if (this.t <= 0) {
          this.count++;
          this.st = this.count >= 3 ? 'slamAim' : 'circle';
          this.t = 2.4;
          if (this.st === 'slamAim') this.beginSlam();
        }
        return;
      }
      case 'slamAim':
        m.tx = this.tx;
        m.tz = this.tz;
        m.want = Math.min(24, Math.hypot(this.tx - m.x, this.tz - m.z) * 2.5);
        m.alt += (14 - m.alt) * dt * 2;
        if (this.t <= 0) {
          m.x = this.tx;
          m.z = this.tz;
          m.flying = false;
          m.vy = -26;
          m.want = 0;
          m.spd = 0;
          this.st = 'slam';
          this.t = 3;
        }
        return;
      case 'slam':
        m.want = 0;
        if (this.t <= 0) {
          // segurança: se não tocou o chão
          this.onLand(m);
        }
        return;
      case 'stunned':
        m.want = 0;
        m.pose.lunge = 0;
        m.st = 'boss';
        if (Math.random() < dt * 8) c.emitFx('star', m.x, m.y + 5.5, m.z, 1, 1.2, 1);
        if (this.t <= 0) {
          this.cd = 1;
          if (this.phase === 2) {
            this.st = 'takeoff';
            this.t = 1.6;
            this.count = 0;
          } else this.st = 'walk';
        }
        return;
    }
  }

  private beginSlam(): void {
    const c = this.mgr;
    const p = c.pl;
    // dentro da arena
    const dx = p.x - this.lair.x;
    const dz = p.z - this.lair.z;
    const dl = Math.hypot(dx, dz);
    const k = dl > this.lair.r - 6 ? (this.lair.r - 6) / dl : 1;
    this.tx = this.lair.x + dx * k;
    this.tz = this.lair.z + dz * k;
    this.t = 1.9;
    this.tele = c.fx.telegraph({ kind: 'circle', x: this.tx, y: c.ground(null, this.tx, this.tz), z: this.tz, yaw: 0, size: 7.5, width: 0, dur: 1.9 });
  }

  /* ====================================== COLOSSO ====================================== */
  private golem(dt: number): void {
    const c = this.mgr;
    const m = this.main;
    const p = c.pl;
    const frac = this.hpFrac;
    if (frac < 0.6 && this.phase === 1) {
      this.setPhase(2);
      c.toast(t('mob.ui.golemQuake', 'O chão treme! Pule as ondas de choque!'));
    }
    if (frac < 0.3 && this.phase === 2) {
      this.setPhase(3);
      this.summonT = 0;
      c.toast(t('mob.ui.golemCeiling', 'O teto está desabando!'));
    }
    if (this.exposed > c.time && Math.random() < dt * 10) c.emitFx('sparkle', m.x + Math.sin(m.yaw) * 1.4, m.y + 3.4, m.z + Math.cos(m.yaw) * 1.4, 1, 0.5, 1, '#ff7ab0');
    m.pose.flash = this.exposed > c.time ? 0.25 + Math.sin(c.time * 12) * 0.15 : m.pose.flash;
    if (this.phase === 3) {
      this.summonT -= dt;
      if (this.summonT <= 0 && this.minions.length < 6) {
        this.summonT = 20;
        this.summon('pedrisco', 3, 5);
      }
      this.slamT -= dt;
      if (this.slamT <= 0) {
        this.slamT = 3.2;
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = i === 0 ? 0.5 : 1.5 + Math.random() * 3;
          const x = p.x + Math.cos(a) * r;
          const z = p.z + Math.sin(a) * r;
          const y = c.ground(null, x, z, p.y);
          c.fx.telegraph({
            kind: 'circle', x, y, z, yaw: 0, size: 1.7, width: 0, dur: 1.3,
            onFire: () => {
              c.emitFx('dust', x, y + 0.3, z, 10, 0.8, 3);
              c.emitFx('smoke', x, y + 0.5, z, 4, 0.6, 1);
              if (Math.hypot(c.pl.x - x, c.pl.z - z) < 1.8) c.hurtPlayer(m, 9, 'blast', 5);
            },
          });
        }
      }
    }
    switch (this.st) {
      case 'intro':
        m.want = 0;
        this.face(m, p.x, p.z, dt);
        if (this.t <= 0) this.st = 'walk';
        return;
      case 'walk': {
        this.face(m, p.x, p.z, dt, 1.5);
        m.tx = p.x;
        m.tz = p.z;
        m.want = m.dist > 4.5 ? m.def.speed : 0;
        if (this.cd > 0) return;
        if (m.dist < 6.5) {
          this.st = 'slamWind';
          this.t = 1.1;
          m.want = 0;
          this.tx = m.x + Math.sin(m.yaw) * 3.2;
          this.tz = m.z + Math.cos(m.yaw) * 3.2;
          this.tele = c.fx.telegraph({ kind: 'circle', x: this.tx, y: m.y, z: this.tz, yaw: 0, size: 5, width: 0, dur: 1.1 });
        } else if (this.phase >= 2 && this.count % 3 === 2) {
          this.st = 'quakeWind';
          this.t = 1.0;
          m.want = 0;
          this.count++;
        } else {
          this.st = 'throwWind';
          this.t = 0.9;
          m.want = 0;
          this.count++;
        }
        return;
      }
      case 'slamWind':
        m.want = 0;
        m.pose.lunge = -0.7;
        m.pose.flap = 1;
        if (this.t <= 0) {
          m.pose.lunge = 1;
          m.pose.flap = 0;
          c.host.shake?.(0.5);
          c.sound('slam', this.tx, m.y, this.tz);
          c.emitFx('dust', this.tx, m.y, this.tz, 18, 2.5, 4);
          if (Math.hypot(p.x - this.tx, p.z - this.tz) < 5) c.hurtPlayer(m, 10, 'blast', 10);
          this.exposed = c.time + 2.6;
          this.st = 'recover';
          this.t = 2.6;
        }
        return;
      case 'recover':
        m.want = 0;
        if (this.t <= 0) {
          this.st = 'walk';
          this.cd = 0.8;
        }
        return;
      case 'throwWind':
        m.want = 0;
        this.face(m, p.x, p.z, dt, 3);
        m.pose.flap = 1;
        if (this.t <= 0) {
          m.pose.flap = 0;
          const tf = m.dist / 15;
          c.fx.telegraph({ kind: 'circle', x: p.x, y: c.ground(null, p.x, p.z, p.y), z: p.z, yaw: 0, size: 2, width: 0, dur: Math.max(0.4, tf) });
          c.mobShoot(m, 15, '#8a8a9a', 0.7, true, 8, { m, kind: 'blast' }, m.y + 6);
          this.st = 'walk';
          this.cd = this.phase === 3 ? 1.2 : 1.8;
        }
        return;
      case 'quakeWind':
        m.want = 0;
        m.pose.flap = 1;
        m.pose.lunge = -0.4;
        if (this.t <= 0) {
          m.pose.flap = 0;
          m.pose.lunge = 1;
          c.host.shake?.(0.6);
          c.sound('slam', m.x, m.y, m.z);
          this.tele = c.fx.telegraph({ kind: 'ring', x: m.x, y: m.y, z: m.z, yaw: 0, size: 18, width: 0, dur: 1.8 });
          this.ringHit = false;
          this.tx = m.x;
          this.tz = m.z;
          this.st = 'quake';
          this.t = 1.8;
        }
        return;
      case 'quake': {
        m.want = 0;
        const R = 18 * (1 - this.t / 1.8);
        const d = Math.hypot(p.x - this.tx, p.z - this.tz);
        if (!this.ringHit && Math.abs(d - R) < 0.9 && p.grounded) {
          this.ringHit = true;
          c.hurtPlayer(m, 7, 'blast', 8);
        }
        if (Math.random() < dt * 30) {
          const a = Math.random() * Math.PI * 2;
          c.emitFx('dust', this.tx + Math.cos(a) * R, m.y, this.tz + Math.sin(a) * R, 1, 0.3, 2);
        }
        if (this.t <= 0) {
          this.st = 'walk';
          this.cd = 1.2;
        }
        return;
      }
    }
  }

  /* ====================================== HIDRA-LÍRIO ====================================== */
  private placeHydra(dt: number): void {
    const b = this.main;
    const sink = this.st === 'sub' ? 1 : 0;
    b.c += (sink - b.c) * Math.min(1, dt * 2 || 1);
    const g = this.mgr.ground(null, b.x, b.z);
    const w = this.mgr.water(b.x, b.z);
    const top = Math.max(g, w - 0.7);
    b.y = top - b.c * 4;
    b.grounded = true;
    for (const h of this.heads) {
      const a = (h.part / 3) * Math.PI * 2 + 0.5;
      h.x = b.x + Math.cos(a) * 3.8;
      h.z = b.z + Math.sin(a) * 3.8;
      h.y = b.y + 0.3 - b.c * 2;
      h.grounded = true;
      h.phased = this.st === 'sub';
    }
  }

  private wilt(h: Mob): void {
    const c = this.mgr;
    h.hp = 1;
    h.st = 'sleep';
    h.want = 0;
    c.emitFx('leaf', h.x, h.y + 4, h.z, 12, 1, 2);
    c.sound('pop', h.x, h.y, h.z);
    // botão-cura nasce na beira do corpo
    const a = Math.random() * Math.PI * 2;
    const bx = this.main.x + Math.cos(a) * 6.5;
    const bz = this.main.z + Math.sin(a) * 6.5;
    const bud = c.spawn('flor_cura', bx, bz, { y: this.main.y + 2, persistent: true });
    bud.boss = this;
    bud.pinned = true;
    bud.y = Math.max(c.ground(null, bx, bz), c.water(bx, bz) - 0.2);
    this.buds.push({ m: bud, ttl: 6 });
    c.fx.poof(bx, bud.y + 0.5, bz, 0.8, '#7affc4');
    if (this.heads.every((x) => x.st === 'sleep')) {
      this.bodyOpen = c.time + 7;
      c.toast(t('mob.ui.hydraOpen', 'As cabeças murcharam! Ataque o bulbo!'));
      c.sound('roar', this.main.x, this.main.y, this.main.z);
    }
  }

  private regrow(h: Mob, frac: number): void {
    h.st = 'boss';
    h.hp = Math.round(h.maxHp * frac);
    this.mgr.emitFx('heart', h.x, h.y + 4.5, h.z, 8, 0.8, 2, '#7affc4');
    this.mgr.emitFx('leaf', h.x, h.y + 4, h.z, 8, 1, 2);
  }

  private hydra(dt: number): void {
    const c = this.mgr;
    const b = this.main;
    const p = c.pl;
    const T = c.time;
    if (this.hpFrac < 0.5 && this.phase === 1) {
      this.setPhase(2);
      this.subT = T + 4;
      c.toast(t('mob.ui.hydraDive', 'Nenúfera mergulhou! Cuidado com as bolhas!'));
    }
    if (this.hpFrac < 0.2 && this.phase === 2) this.setPhase(3);
    // botões-cura
    for (let i = this.buds.length - 1; i >= 0; i--) {
      const bd = this.buds[i];
      bd.ttl -= dt;
      bd.m.pose.squash = Math.sin(T * 8) * 0.06 * (1 + (6 - bd.ttl) * 0.3);
      if (!bd.m.alive) {
        this.buds.splice(i, 1);
        continue;
      }
      if (bd.ttl <= 0) {
        this.buds.splice(i, 1);
        c.kill(bd.m, false);
        b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.06);
        const w = this.heads.find((h) => h.st === 'sleep');
        if (w) this.regrow(w, 0.5);
        this.bodyOpen = 0;
        c.toast(t('mob.ui.budBloom', 'Um botão desabrochou e curou a Nenúfera!'));
      }
    }
    // corpo aberto acabou: tudo cresce de novo
    if (this.bodyOpen && T > this.bodyOpen) {
      this.bodyOpen = 0;
      for (const h of this.heads) if (h.st === 'sleep') this.regrow(h, 0.6);
    }
    b.pose.flash = this.bodyOpen > T ? 0.3 + Math.sin(T * 10) * 0.2 : b.pose.flash;
    b.yaw += angDiff(b.yaw, Math.atan2(p.x - b.x, p.z - b.z)) * Math.min(1, dt);
    // mergulho (F2+)
    if (this.phase >= 2 && this.st !== 'sub' && T > this.subT && !this.bodyOpen && !this.buds.length) {
      this.st = 'sub';
      this.t = 1.2;
      this.count = 0;
      c.emitFx('splash', b.x, b.y + 1, b.z, 20, 3, 4);
      c.sound('splash', b.x, b.y, b.z);
    }
    if (this.st === 'sub') {
      if (this.t <= 0 && this.count === 0) {
        this.count = 1;
        const dx = p.x - this.lair.x;
        const dz = p.z - this.lair.z;
        const dl = Math.hypot(dx, dz);
        const k = dl > this.lair.r - 5 ? (this.lair.r - 5) / dl : 1;
        this.tx = this.lair.x + dx * k;
        this.tz = this.lair.z + dz * k;
        this.tele = c.fx.telegraph({
          kind: 'circle', x: this.tx, y: c.ground(null, this.tx, this.tz), z: this.tz, yaw: 0, size: 5, width: 0, dur: 1.6,
          onFire: () => {
            b.x = this.tx;
            b.z = this.tz;
            this.st = 'guard';
            this.subT = c.time + 20;
            c.emitFx('splash', b.x, b.y + 1, b.z, 30, 4, 6);
            c.host.shake?.(0.5);
            if (Math.hypot(c.pl.x - b.x, c.pl.z - b.z) < 5) c.hurtPlayer(b, 10, 'blast', 12);
            this.summon('girinao', 3, 7);
          },
        });
      }
      if (Math.random() < dt * 12) c.emitFx('splash', this.tx + (Math.random() - 0.5) * 6, c.water(this.tx, this.tz), this.tz + (Math.random() - 0.5) * 6, 1, 0.2, 1);
      this.placeHydra(dt);
      return;
    }
    if (this.st === 'intro' && this.t <= 0) this.st = 'guard';
    this.placeHydra(dt);
    // cabeças
    for (const h of this.heads) {
      if (h.st === 'sleep') continue;
      h.a -= dt;
      const ty = Math.atan2(p.x - h.x, p.z - h.z);
      h.yaw += angDiff(h.yaw, ty) * Math.min(1, dt * 3);
      const d = Math.hypot(p.x - h.x, p.z - h.z);
      if (h.st === 'windup') {
        h.stT -= dt;
        h.pose.lunge = -0.7;
        if (h.stT <= 0) {
          h.pose.lunge = 1;
          if (h.b === 1) {
            if (Math.hypot(p.x - h.tx, p.z - h.tz) < 2.4) c.hurtPlayer(h, 7, 'melee', 8);
            c.emitFx('splash', h.tx, h.y + 0.5, h.tz, 8, 1, 3);
          } else {
            c.mobShoot(h, 12, '#c8ff4a', 0.3, true, 4, { m: h, kind: 'poison', effect: 'slow', eff: 2 }, h.y + 4.6);
          }
          h.st = 'boss';
          h.a = (this.phase >= 2 ? 1.8 : 2.6) + Math.random() * 1.5;
        }
        continue;
      }
      if (h.a <= 0 && this.st !== 'intro') {
        h.st = 'windup';
        if (d < 8.5) {
          h.b = 1;
          h.stT = 0.75;
          h.tx = h.x + Math.sin(ty) * 4.5;
          h.tz = h.z + Math.cos(ty) * 4.5;
          c.fx.telegraph({ kind: 'circle', x: h.tx, y: c.ground(null, h.tx, h.tz), z: h.tz, yaw: 0, size: 2.4, width: 0, dur: 0.75 });
        } else {
          h.b = 0;
          h.stT = 0.6;
        }
      }
    }
  }
}
