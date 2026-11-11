/* ============================================================
 *  BICHOS — cérebros (rodam no tique de IA; longe do jogador o
 *  tique é mais lento). Animais: passear, pastar, comer no alto,
 *  fugir em bando, seguir o líder, revoada/cardume, dormir, ser
 *  atraído por comida, namorar. Monstros: uma mecânica cada.
 *  Os bichos só decidem ALVO e VELOCIDADE; o gerente move.
 * ============================================================ */
import type { MobManager } from './manager';
import { angDiff } from './manager';
import type { Mob } from './mob';

const TAU = Math.PI * 2;

function goTo(m: Mob, x: number, z: number, speed: number): void {
  m.tx = x;
  m.tz = z;
  m.want = speed;
}
function stop(m: Mob): void {
  m.want = 0;
  m.tx = m.x;
  m.tz = m.z;
  m.path = null;
}
function face(m: Mob, x: number, z: number): void {
  m.tx = x;
  m.tz = z;
}

/** persegue com A* quando o caminho direto trava */
function chase(c: MobManager, m: Mob, x: number, z: number, speed: number): void {
  goTo(m, x, z, speed);
  if (m.st !== 'windup' && m.st !== 'charge') m.st = 'chase';
  const far = Math.hypot(x - m.x, z - m.z);
  if (m.flying || m.def.habitat === 'water') return;
  if (m.wantPath || (m.path && Math.hypot(x - m.pathGX, z - m.pathGZ) > 4 && c.time - m.pathT > 1.5)) c.requestPath(m, x, z);
  if (m.path && far < 3) m.path = null;
}

/** ponto aleatório válido perto de (cx,cz) */
function wanderPoint(c: MobManager, m: Mob, cx: number, cz: number, r: number): boolean {
  for (let k = 0; k < 4; k++) {
    const a = Math.random() * TAU;
    const d = r * (0.3 + Math.random() * 0.7);
    const x = cx + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d;
    const g = c.ground(m, x, z);
    const w = m.cave ? -Infinity : c.water(x, z);
    const wet = w > g + 0.5;
    const hab = m.def.habitat;
    if (hab === 'water' && !wet) continue;
    if (hab === 'ground' && wet) continue;
    if (!m.def.climb && !m.flying && Math.abs(g - m.y) > d * 0.9 + 1) continue;
    m.tx = x;
    m.tz = z;
    return true;
  }
  return false;
}

/** líder do grupo = membro vivo de menor uid por perto */
function leaderOf(c: MobManager, m: Mob): Mob {
  let best = m;
  if (!m.group) return m;
  c.near(m.x, m.z, 30, (o) => {
    if (o.group === m.group && o.sp === m.sp && o.uid < best.uid && o.alive) best = o;
  });
  return best;
}

function alarmGroup(c: MobManager, m: Mob, until: number): void {
  if (!m.group) return;
  c.near(m.x, m.z, 15, (o) => {
    if (o.group === m.group && !o.tamed && o.alarm < until) o.alarm = until;
  });
}

const wantsFood = (m: Mob, held: string | null): boolean => !!held && (!!m.def.tame?.food.includes(held) || (!!m.def.breed?.includes(held) && m.tamed));

/** pequenos pulinhos de quem anda saltando */
function hopTick(m: Mob, dt: number): void {
  if (m.def.hops && m.grounded && m.want > 0.3 && Math.random() < dt * 3) {
    m.vy = 2.5 + m.def.radius * 2;
    m.grounded = false;
  }
}

function takeOff(m: Mob): void {
  const d = m.def;
  if (!d.alt) return;
  m.flying = true;
  m.grounded = false;
  m.alt = d.alt[0] + Math.random() * (d.alt[1] - d.alt[0]);
  m.st = 'fly';
}

/* ======================================================================
 *  ANIMAIS
 * ====================================================================== */
export function thinkAnimal(c: MobManager, m: Mob, dt: number): void {
  const d = m.def;
  const T = c.time;
  const p = c.pl;
  m.stT -= dt;
  m.atkCd -= dt;
  const sense = (d.sense ?? 8) * (1 - c.mods.stealth * 0.6);
  const canFly = !!d.alt && d.habitat !== 'water';
  // toca escondida
  if (m.under) {
    if (T > m.b) {
      m.under = false;
      c.emitFx('dust', m.x, m.y, m.z, 6, 0.4, 2);
    }
    stop(m);
    return;
  }
  // 1) revida (neutros com ataque)
  if (m.aggro > T && d.attack && p.alive && !m.tamed) {
    melee(c, m, dt);
    return;
  }
  // 2) medo
  let scared = m.alarm > T;
  if (!m.tamed && !scared && d.temper === 'skittish' && m.dist < sense && !wantsFood(m, p.held)) {
    scared = true;
    m.alarm = T + 4;
    alarmGroup(c, m, T + 4);
  }
  if (scared && !m.tamed) {
    if (m.st === 'sleep') m.st = 'idle';
    // cavadores somem na toca
    if (d.burrows && m.dist < 5 && Math.random() < 0.35 && !m.flying) {
      m.under = true;
      m.b = T + 4 + Math.random() * 4;
      c.emitFx('dust', m.x, m.y, m.z, 8, 0.4, 2);
      c.sound('burrow', m.x, m.y, m.z);
      return;
    }
    if (canFly && !m.flying && (d.habitat === 'air' || m.dist < 8)) takeOff(m);
    const ax = m.x - p.x;
    const az = m.z - p.z;
    const al = Math.hypot(ax, az) || 1;
    goTo(m, m.x + (ax / al) * 14 + (Math.random() - 0.5) * 4, m.z + (az / al) * 14 + (Math.random() - 0.5) * 4, d.run);
    m.st = 'flee';
    hopTick(m, dt);
    return;
  }
  // 3) amigo: segue o dono
  if (m.tamed) {
    if (m.dist > 40 && d.habitat !== 'water') {
      const a = Math.random() * TAU;
      m.x = p.x + Math.cos(a) * 4;
      m.z = p.z + Math.sin(a) * 4;
      m.y = c.ground(m, m.x, m.z, p.y);
      m.cave = c.plCave;
      return;
    }
    if (m.dist > 8) {
      chase(c, m, p.x, p.z, m.dist > 16 ? d.run : d.speed * 1.8);
      m.st = 'follow';
      hopTick(m, dt);
      return;
    }
  }
  // 4) atraído por comida na mão
  if (wantsFood(m, p.held) && m.dist < 10 && !m.flying && d.habitat !== 'water') {
    m.st = 'follow';
    if (m.dist > 2 + m.radius) goTo(m, p.x, p.z, d.speed * 1.4);
    else {
      stop(m);
      face(m, p.x, p.z);
    }
    hopTick(m, dt);
    return;
  }
  // 5) namoro
  if (m.love > T) {
    let mate: Mob | null = null;
    let md = 1e9;
    c.near(m.x, m.z, 10, (o, d2) => {
      if (o !== m && o.sp === m.sp && o.love > T && o.age >= 1 && d2 < md) {
        md = d2;
        mate = o;
      }
    });
    if (mate) {
      const o = mate as Mob;
      if (Math.sqrt(md) < m.radius + o.radius + 0.4) c.breed(m, o);
      else goTo(m, o.x, o.z, d.speed);
      if (Math.random() < dt * 2) c.emitFx('heart', m.x, m.y + d.plan.body[1] * m.scale + 0.4, m.z, 1, 0.2, 1);
      return;
    }
  }
  // 6) produtos (ovos)
  if (d.lays && m.tamed && m.age >= 1 && m.produceT <= T) {
    if (m.produceT > 0) c.host.drop(d.lays, 1, m.x, m.y + 0.2, m.z);
    m.produceT = T + 200 + Math.random() * 120;
  }
  // 7) sono
  const sleepy = d.nocturnal ? !c.isNight : c.isNight;
  if (sleepy && d.habitat !== 'water' && !m.tamed) {
    if (m.flying) {
      // desce para dormir
      m.alt = Math.max(0, m.alt - dt * 3);
      goTo(m, m.x, m.z, d.speed * 0.4);
      if (m.alt <= 0.3) {
        m.flying = false;
        m.grounded = false;
      }
      return;
    }
    if (m.st !== 'sleep') {
      m.st = 'sleep';
      stop(m);
    }
    return;
  }
  if (m.st === 'sleep') m.st = 'idle';
  // 8) revoada / cardume
  if (d.flock) {
    flockStep(c, m, dt);
    return;
  }
  // 9) voadores solitários: plana / pousa
  if (canFly && (m.flying || d.habitat === 'air')) {
    airStep(c, m, dt);
    return;
  }
  // 10) manada: não se afasta do líder
  if (d.herd && m.group) {
    const L = leaderOf(c, m);
    if (L !== m) {
      const dl = Math.hypot(L.x - m.x, L.z - m.z);
      if (dl > 9) {
        const off = (m.uid % 7) - 3;
        goTo(m, L.x + off, L.z + ((m.uid * 3) % 7) - 3, dl > 16 ? d.run * 0.7 : d.speed * 1.3);
        m.st = 'wander';
        hopTick(m, dt);
        return;
      }
    }
  }
  idleCycle(c, m, dt);
}

function idleCycle(c: MobManager, m: Mob, dt: number): void {
  const d = m.def;
  const reached = Math.hypot(m.tx - m.x, m.tz - m.z) < 0.8;
  if (m.stT <= 0 || (m.st === 'wander' && reached) || m.st === 'chase' || m.st === 'flee' || m.st === 'follow' || m.st === 'fly' || m.st === 'windup') {
    const r = Math.random();
    const cx = m.tamed ? c.pl.x : m.homeX;
    const cz = m.tamed ? c.pl.z : m.homeZ;
    if ((d.graze || d.browse) && r < 0.4 && d.habitat !== 'water') {
      m.st = 'graze';
      m.stT = 3 + Math.random() * 5;
      stop(m);
    } else if (r < 0.78 && wanderPoint(c, m, cx, cz, m.tamed ? 6 : d.habitat === 'water' ? 10 : 12)) {
      m.st = 'wander';
      m.stT = 9;
      m.want = d.speed * (0.7 + Math.random() * 0.5);
      if (d.habitat === 'water') m.alt = 0.2 + Math.random() * 0.6;
    } else {
      m.st = 'idle';
      m.stT = 1.5 + Math.random() * 3.5;
      stop(m);
    }
  }
  hopTick(m, dt);
}

function flockStep(c: MobManager, m: Mob, dt: number): void {
  const d = m.def;
  if (d.alt && !m.flying && d.habitat === 'air') takeOff(m);
  const L = leaderOf(c, m);
  if (L === m) {
    if (m.stT <= 0 || Math.hypot(m.tx - m.x, m.tz - m.z) < 2) {
      wanderPoint(c, m, m.homeX, m.homeZ, d.habitat === 'water' ? 14 : 26);
      m.stT = 6 + Math.random() * 6;
      m.want = d.speed;
      if (d.alt && m.flying) m.alt = d.alt[0] + Math.random() * (d.alt[1] - d.alt[0]);
      if (d.habitat === 'water') m.alt = 0.2 + Math.random() * 0.6;
      // revoadas de animais que também andam: às vezes pousam
      if (d.habitat !== 'air' && d.alt && m.flying && Math.random() < 0.4) {
        m.flying = false;
        m.grounded = false;
      } else if (d.habitat !== 'air' && d.alt && !m.flying && Math.random() < 0.25) takeOff(m);
    }
    m.st = m.flying ? 'fly' : 'wander';
    return;
  }
  // boids: coesão + alinhamento + ir com o líder
  let cx = 0;
  let cz = 0;
  let ax = 0;
  let az = 0;
  let n = 0;
  c.near(m.x, m.z, 9, (o) => {
    if (o === m || o.group !== m.group) return;
    cx += o.x;
    cz += o.z;
    ax += Math.sin(o.yaw);
    az += Math.cos(o.yaw);
    n++;
  });
  const off = ((m.uid * 2.39996) % TAU);
  let tx = L.x + Math.cos(off) * 2.5;
  let tz = L.z + Math.sin(off) * 2.5;
  if (n) {
    tx = tx * 0.5 + (cx / n + ax / n * 3) * 0.5;
    tz = tz * 0.5 + (cz / n + az / n * 3) * 0.5;
  }
  const dl = Math.hypot(tx - m.x, tz - m.z);
  goTo(m, tx, tz, dl > 3 ? d.speed * 1.35 : d.speed * 0.8);
  if (L.flying !== m.flying) {
    if (L.flying) takeOff(m);
    else {
      m.flying = false;
      m.grounded = false;
    }
  }
  if (m.flying) m.alt += ((L.alt + Math.sin(c.time + m.uid) * 0.8) - m.alt) * Math.min(1, dt);
  if (d.habitat === 'water') m.alt += (L.alt - m.alt) * Math.min(1, dt);
  m.st = m.flying ? 'fly' : 'wander';
}

function airStep(c: MobManager, m: Mob, _dt: number): void {
  const d = m.def;
  if (m.flying) {
    if (m.stT <= 0 || Math.hypot(m.tx - m.x, m.tz - m.z) < 3) {
      if (Math.random() < 0.3 && d.plan.legs?.n) {
        // pousa um pouco
        m.flying = false;
        m.grounded = false;
        m.st = 'idle';
        m.stT = 5 + Math.random() * 8;
        stop(m);
        return;
      }
      wanderPoint(c, m, m.homeX, m.homeZ, 30);
      m.stT = 6 + Math.random() * 6;
      m.want = d.speed;
      if (d.alt) m.alt = d.alt[0] + Math.random() * (d.alt[1] - d.alt[0]);
    }
    m.st = 'fly';
    return;
  }
  if (m.stT <= 0) {
    takeOff(m);
    wanderPoint(c, m, m.homeX, m.homeZ, 30);
    m.want = d.speed;
    m.stT = 8;
    return;
  }
  if (d.graze && m.grounded && m.st === 'idle' && Math.random() < 0.02) {
    m.st = 'graze';
  }
}

/* ======================================================================
 *  MONSTROS
 * ====================================================================== */
export function thinkMonster(c: MobManager, m: Mob, dt: number): void {
  const d = m.def;
  const T = c.time;
  const p = c.pl;
  m.stT -= dt;
  m.atkCd -= dt;
  // de dia, monstros da superfície vão embora (somem num puf)
  if (!m.cave && !c.isNight && m.st !== 'vanish' && d.spawn.every((r) => r.time === 'night') && m.dist > 5 && m.aggro < T) {
    m.st = 'vanish';
    m.stT = 6;
  }
  if (m.st === 'vanish') {
    const ax = m.x - p.x;
    const az = m.z - p.z;
    const al = Math.hypot(ax, az) || 1;
    goTo(m, m.x + (ax / al) * 8, m.z + (az / al) * 8, d.speed);
    if (m.stT <= 0) c.kill(m, false);
    return;
  }
  if (m.st === 'stun') {
    stop(m);
    if (Math.random() < dt * 5) c.emitFx('star', m.x, m.y + d.plan.body[1] * m.scale * 1.2, m.z, 1, 0.3, 1);
    if (m.stT <= 0) m.st = 'chase';
    return;
  }
  const dark = c.isNight || m.cave;
  const sense = (d.sense ?? 14) * (dark ? 1 : 0.7) * (1 - c.mods.stealth * 0.5);
  const engaged = p.alive && (m.aggro > T || m.dist < sense);
  if (!engaged) {
    if (m.under) m.under = false;
    if (d.mech === 'charge') {
      // parece uma pedra quietinha
      if (m.st !== 'sleep') {
        m.st = 'sleep';
        stop(m);
      }
      return;
    }
    idleCycle(c, m, dt);
    m.want *= 0.7;
    return;
  }
  if (m.st === 'sleep' || m.st === 'idle' || m.st === 'wander' || m.st === 'graze') m.st = 'chase';
  if (m.aggro < T + 5) m.aggro = T + 5;
  switch (d.mech) {
    case 'hop':
      hopMech(c, m);
      break;
    case 'spit':
    case 'freeze':
    case 'web':
      rangedMech(c, m);
      break;
    case 'burrow':
      burrowMech(c, m);
      break;
    case 'swarm':
      swarmMech(c, m, dt);
      break;
    case 'phase':
      phaseMech(c, m, dt);
      break;
    case 'charge':
      chargeMech(c, m);
      break;
    case 'blink':
      blinkMech(c, m);
      break;
    case 'spores':
      sporeMech(c, m);
      break;
    case 'stalk':
      stalkMech(c, m);
      break;
    case 'shy':
      if (c.mods.light && m.dist < 9) {
        const ax = m.x - p.x;
        const az = m.z - p.z;
        const al = Math.hypot(ax, az) || 1;
        goTo(m, m.x + (ax / al) * 8, m.z + (az / al) * 8, d.run);
        m.st = 'flee';
      } else swarmMech(c, m, dt);
      break;
    default:
      melee(c, m, dt);
      if (d.mech === 'split') hopTick(m, dt);
  }
}

/** ataque corpo a corpo genérico com aviso (recuo) antes do golpe */
function melee(c: MobManager, m: Mob, dt: number): void {
  const a = m.def.attack;
  const p = c.pl;
  if (!a) return;
  const reach = a.reach + m.radius;
  if (m.st === 'windup') {
    face(m, p.x, p.z);
    m.want = 0;
    if (m.stT <= 0) {
      if (m.dist <= reach + 0.7 && p.alive) c.hurtPlayer(m, a.dmg, a.kind ?? 'melee', 4, a.effect);
      m.atkCd = a.cd;
      m.st = 'chase';
      m.pose.lunge = 1;
    }
    return;
  }
  if (m.dist <= reach && m.atkCd <= 0) {
    m.st = 'windup';
    m.stT = a.windup;
    m.want = 0;
    face(m, p.x, p.z);
    return;
  }
  chase(c, m, p.x, p.z, m.dist < reach * 0.8 ? 0 : m.def.run);
  hopTick(m, dt);
}

function hopMech(c: MobManager, m: Mob): void {
  const a = m.def.attack!;
  const p = c.pl;
  if (!m.grounded) return;
  if (m.st === 'windup') {
    face(m, p.x, p.z);
    m.want = 0;
    if (m.stT <= 0) {
      const vy = 7.5;
      const tf = (2 * vy) / 20;
      const dx = p.x - m.x;
      const dz = p.z - m.z;
      const k = Math.min(1, 12 / (Math.hypot(dx, dz) / tf || 1));
      m.vx = (dx / tf) * k;
      m.vz = (dz / tf) * k;
      m.vy = vy;
      m.grounded = false;
      m.leap = true;
      m.st = 'chase';
      m.atkCd = a.cd;
    }
    return;
  }
  if (m.dist < 9 && m.dist > 1.5 && m.atkCd <= 0) {
    m.st = 'windup';
    m.stT = a.windup;
    stop(m);
    return;
  }
  chase(c, m, p.x, p.z, m.def.speed);
}

function rangedMech(c: MobManager, m: Mob): void {
  const d = m.def;
  const a = d.attack!;
  const p = c.pl;
  if (m.st === 'windup') {
    face(m, p.x, p.z);
    m.want = 0;
    if (m.stT <= 0) {
      const pr = a.proj!;
      c.mobShoot(m, pr.speed, pr.col, pr.r, !!pr.arc, a.dmg, { m, kind: a.kind ?? 'ranged', effect: a.effect, eff: a.effect === 'teia' ? 2 : 3 });
      m.atkCd = a.cd * (0.85 + Math.random() * 0.3);
      m.st = 'chase';
      m.pose.lunge = 1;
    }
    return;
  }
  const keep = Math.min(a.reach * 0.6, 8);
  const ax = m.x - p.x;
  const az = m.z - p.z;
  const al = Math.hypot(ax, az) || 1;
  if (m.dist < keep - 2) goTo(m, m.x + (ax / al) * 6, m.z + (az / al) * 6, d.run);
  else if (m.dist > a.reach * 0.85) chase(c, m, p.x, p.z, d.run);
  else {
    // anda de lado (círculo) mantendo distância
    const s = m.uid % 2 ? 1 : -1;
    goTo(m, m.x + (-az / al) * 4 * s, m.z + (ax / al) * 4 * s, d.speed);
  }
  if (m.dist <= a.reach && m.atkCd <= 0) {
    m.st = 'windup';
    m.stT = a.windup;
    m.want = 0;
  }
}

function burrowMech(c: MobManager, m: Mob): void {
  const a = m.def.attack!;
  const p = c.pl;
  if (m.st === 'windup') {
    m.want = 0;
    if (m.stT <= 0) {
      m.under = false;
      m.vy = 8;
      m.grounded = false;
      c.emitFx('dust', m.x, m.y, m.z, 14, 1.2, 4);
      c.sound('burrow', m.x, m.y, m.z);
      if (Math.hypot(p.x - m.x, p.z - m.z) < 2.4) c.hurtPlayer(m, a.dmg, a.kind ?? 'blast', 9);
      m.st = 'stun';
      m.stT = 2.6;
      m.atkCd = a.cd;
    }
    return;
  }
  if (!m.under) {
    m.under = true;
    c.emitFx('dust', m.x, m.y, m.z, 8, 0.6, 2);
  }
  chase(c, m, p.x, p.z, m.def.run);
  if (m.dist < 3 && m.atkCd <= 0 && p.grounded) {
    m.st = 'windup';
    m.stT = a.windup;
    m.x = p.x;
    m.z = p.z;
    m.y = c.ground(m, m.x, m.z, p.y);
    stop(m);
    c.fx.telegraph({ kind: 'circle', x: m.x, y: m.y, z: m.z, yaw: 0, size: 2.4, width: 0, dur: a.windup });
  }
}

function swarmMech(c: MobManager, m: Mob, dt: number): void {
  const d = m.def;
  const a = d.attack!;
  const p = c.pl;
  if (m.st === 'charge') {
    goTo(m, p.x, p.z, d.run * 1.3);
    if (m.dist < a.reach + 0.3) {
      c.hurtPlayer(m, a.dmg, a.kind ?? 'melee', 2, a.effect, 2);
      m.st = 'chase';
      m.atkCd = a.cd + Math.random();
    }
    if (m.stT <= 0) m.st = 'chase';
    return;
  }
  m.a += dt * (1.1 + (m.uid % 3) * 0.35) * (m.uid % 2 ? 1 : -1);
  const R = 2.6 + (m.uid % 3) * 0.7;
  goTo(m, p.x + Math.cos(m.a) * R, p.z + Math.sin(m.a) * R, d.run);
  m.st = 'chase';
  if (m.flying) m.alt = 1.1 + Math.sin(c.time * 2 + m.uid) * 0.4;
  if (m.atkCd <= 0 && m.dist < R + 2 && Math.random() < dt * 1.4) {
    m.st = 'charge';
    m.stT = 1.2;
  }
}

function phaseMech(c: MobManager, m: Mob, dt: number): void {
  const p = c.pl;
  m.a += dt;
  if (m.a > (m.phased ? 2.2 : 3.6)) {
    m.a = 0;
    m.phased = !m.phased;
    c.emitFx('sparkle', m.x, m.y + 0.6, m.z, 6, 0.5, 1.5, '#bfd8ff');
  }
  if (m.phased) {
    // atravessa tudo e vai para as costas do jogador
    const bx = p.x - Math.sin(p.yaw) * 2.4;
    const bz = p.z - Math.cos(p.yaw) * 2.4;
    goTo(m, bx, bz, m.def.run * 1.5);
    m.st = 'chase';
    return;
  }
  melee(c, m, dt);
}

function chargeMech(c: MobManager, m: Mob): void {
  const d = m.def;
  const a = d.attack!;
  const p = c.pl;
  if (m.st === 'windup') {
    m.want = 0;
    if (m.stT <= 0) {
      m.st = 'charge';
      m.stT = 1.4;
      m.tx = m.x + Math.sin(m.yaw) * 40;
      m.tz = m.z + Math.cos(m.yaw) * 40;
      m.want = d.run;
      m.b = 0;
      m.blocked = 0;
    }
    return;
  }
  if (m.st === 'charge') {
    m.want = d.run;
    if (!m.b && m.dist < m.radius + 1.0) {
      c.hurtPlayer(m, a.dmg, a.kind ?? 'blast', 11);
      m.b = 1;
    }
    if (m.blocked > 0 || m.stT <= 0) {
      m.st = 'stun';
      m.stT = m.blocked > 0 ? 2.4 : 1.2;
      m.spd = 0;
      stop(m);
      c.emitFx('dust', m.x, m.y, m.z, 8, 0.6, 2);
      c.host.shake?.(0.2);
    }
    return;
  }
  if (m.dist < 15 && m.dist > 2.5 && m.atkCd <= 0) {
    m.st = 'windup';
    m.stT = a.windup;
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    stop(m);
    m.tx = p.x;
    m.tz = p.z;
    m.atkCd = a.cd;
    c.fx.telegraph({ kind: 'line', x: m.x, y: m.y, z: m.z, yaw: m.yaw, size: 16, width: 1.1, dur: a.windup });
    return;
  }
  chase(c, m, p.x, p.z, m.dist < 2.5 ? 0 : d.speed * 2);
}

function blinkMech(c: MobManager, m: Mob): void {
  const p = c.pl;
  const T = c.time;
  if (m.st === 'windup' && m.c === 1) {
    m.want = 0;
    if (m.stT <= 0) {
      c.fx.poof(m.x, m.y, m.z, 0.8, '#ffd34a');
      m.x = p.x - Math.sin(p.yaw) * 2.4;
      m.z = p.z - Math.cos(p.yaw) * 2.4;
      m.y = c.ground(m, m.x, m.z, p.y);
      c.emitFx('sparkle', m.x, m.y + 1, m.z, 10, 0.5, 2, '#ffd34a');
      m.c = 0;
      m.stT = 0.45;
      face(m, p.x, p.z);
      m.yaw = Math.atan2(p.x - m.x, p.z - m.z);
    }
    return;
  }
  if (m.st !== 'windup' && m.b <= T && m.dist < 18 && m.dist > 4) {
    m.st = 'windup';
    m.c = 1;
    m.stT = 0.7;
    m.b = T + 6;
    c.emitFx('sparkle', m.x, m.y + 1, m.z, 8, 0.4, 1.5, '#ffd34a');
    return;
  }
  melee(c, m, 0);
}

function sporeMech(c: MobManager, m: Mob): void {
  const a = m.def.attack!;
  const p = c.pl;
  if (m.st === 'windup') {
    m.want = 0;
    if (m.stT <= 0) {
      c.emitFx('smoke', m.x, m.y + 0.6, m.z, 18, a.reach * 0.6, 2.5, '#9affe0');
      c.emitFx('sparkle', m.x, m.y + 0.6, m.z, 10, a.reach * 0.5, 2, '#9affe0');
      c.sound('pop', m.x, m.y, m.z);
      if (m.dist < a.reach) c.hurtPlayer(m, a.dmg, a.kind ?? 'poison', 1, a.effect ?? 'sono', 4);
      m.st = 'chase';
      m.atkCd = a.cd;
    }
    return;
  }
  if (m.dist < a.reach * 0.8 && m.atkCd <= 0) {
    m.st = 'windup';
    m.stT = a.windup;
    stop(m);
    c.fx.telegraph({ kind: 'circle', x: m.x, y: m.y, z: m.z, yaw: 0, size: a.reach, width: 0, dur: a.windup });
    return;
  }
  chase(c, m, p.x, p.z, m.def.run);
}

/** só anda quando o jogador NÃO está olhando */
function stalkMech(c: MobManager, m: Mob): void {
  const p = c.pl;
  const toMob = Math.atan2(m.x - p.x, m.z - p.z);
  const seen = Math.abs(angDiff(p.yaw, toMob)) < 0.95 && m.dist < 45;
  if (seen && m.st !== 'windup') {
    m.want = 0;
    m.spd = 0;
    m.st = 'idle';
    return;
  }
  melee(c, m, 0);
}

/** chamado quando um bicho toca o chão depois de pular/cair */
export function onLand(c: MobManager, m: Mob): void {
  if (m.boss) {
    m.boss.onLand(m);
    return;
  }
  if (m.leap) {
    m.leap = false;
    m.vx *= 0.2;
    m.vz *= 0.2;
    const a = m.def.attack;
    c.emitFx('dust', m.x, m.y, m.z, 6, 0.5, 2);
    if (a && m.dist < a.reach + m.radius + 0.4) c.hurtPlayer(m, a.dmg, a.kind ?? 'melee', 6, a.effect);
  }
}
