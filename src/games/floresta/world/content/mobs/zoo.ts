/* ============================================================
 *  ZOOLÓGICO DE DEPURAÇÃO (dev-zoo.html) — não entra no app.
 *  ?mode=grid    todas as espécies, animação escolhida (idle/walk/run/graze/sleep/attack/fly)
 *  ?mode=savana  manada na savana (IA ligada, nascimento automático)
 *  ?mode=night   monstros à noite perseguindo o "jogador"
 *  ?mode=dragon | golem | hydra   lutas de chefe com piloto automático
 *  ?mode=perf    100 animais + 20 monstros na tela, mede tempos
 *  &tier=0..3  &anim=walk  &phase=2  &t=0.5 (hora do dia)
 *  window.__zoo expõe tudo para o Playwright.
 *  Textos de depuração (botões) não são traduzidos de propósito.
 * ============================================================ */
import * as THREE from 'three';
import { MobManager } from './manager';
import { ALL_MOBS } from './registry';
import type { BiomeId, Lair, MobHost, PlayerView } from './types';
import type { Mob } from './mob';

const Q = new URLSearchParams(location.search);
const MODE = Q.get('mode') ?? 'grid';
const TIER = Math.max(0, Math.min(3, Number(Q.get('tier') ?? 3))) as 0 | 1 | 2 | 3;

/* ------------------------------ cena ------------------------------ */
const app = document.getElementById('app') ?? document.body;
const renderer = new THREE.WebGLRenderer({ antialias: TIER >= 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TIER >= 2 ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
const hemi = new THREE.HemisphereLight(0xdff4ff, 0x6a5a7a, 1.6);
const sun = new THREE.DirectionalLight(0xfff2d8, 1.8);
sun.position.set(40, 80, 20);
scene.add(hemi, sun);
scene.fog = new THREE.Fog(0xcfeaf2, 80, 260);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

/* ------------------------------ terreno de mentira ------------------------------ */
let hillAmp = MODE === 'grid' || MODE === 'dragon' || MODE === 'golem' || MODE === 'hydra' ? 0 : 1;
let biomeOf: (x: number, z: number) => BiomeId = () => 'bosque';
const pools: { x: number; z: number; r: number }[] = [];
const strips: { z0: number; z1: number }[] = [];
function baseH(x: number, z: number): number {
  let h = 0.5 + (Math.sin(x * 0.045) * Math.cos(z * 0.038) * 3 + Math.sin(x * 0.11 + z * 0.07) * 0.8 + 2.2) * hillAmp;
  for (const p of pools) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.r) h = Math.min(h, -2.2 * (1 - (d / p.r) ** 2) - 0.3);
  }
  for (const s of strips) if (z > s.z0 && z < s.z1) h = Math.min(h, -1.6);
  return h;
}
function waterL(x: number, z: number): number {
  for (const p of pools) if (Math.hypot(x - p.x, z - p.z) < p.r + 1) return 0;
  for (const s of strips) if (z > s.z0 - 1 && z < s.z1 + 1) return 0;
  return -Infinity;
}

/* ------------------------------ jogador de mentira ------------------------------ */
const pl: PlayerView & { hp: number; vx: number; vz: number } = { x: 0, y: 0, z: 0, yaw: 0, grounded: true, alive: true, held: null, hp: 100, vx: 0, vz: 0 };
const plMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshLambertMaterial({ color: 0x5ab0ff }));
plMesh.visible = MODE !== 'grid';
scene.add(plMesh);
let dayT = Number(Q.get('t') ?? (MODE === 'night' ? 0.92 : 0.45));
let hurtFlash = 0;
const log: string[] = [];
const host: MobHost = {
  heightAt: baseH,
  waterLevel: waterL,
  biomeAt: (x, z) => biomeOf(x, z),
  dayTime: () => dayT,
  nightCount: () => (MODE === 'night' ? 4 : 0),
  player: () => pl,
  hurtPlayer: (dmg, kind) => {
    pl.hp -= dmg;
    hurtFlash = 1;
    if (pl.hp <= 0) pl.hp = 100;
    log.push(`hit ${dmg} ${kind}`);
  },
  effect: (e, s) => log.push(`effect ${e} ${s.toFixed(1)}`),
  playerMods: () => ({ armor: 0.3, fireRes: MODE === 'dragon' ? 0.5 : 0, coldRes: 0, poisonRes: 0, light: false, stealth: 0 }),
  drop: (id, n) => log.push(`drop ${id}×${n}`),
  shake: (a) => (shake = Math.max(shake, a)),
};
let shake = 0;

/* ------------------------------ chão ------------------------------ */
const ground = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
scene.add(ground);
const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3ab0e0, transparent: true, opacity: 0.7 }));
water.position.y = 0;
scene.add(water);
const BCOL: Partial<Record<BiomeId, string>> = { savana: '#d8c45a', bosque: '#6cc24a', deserto: '#f0d494', nevado: '#eef4fb', pantano: '#6a8a4a', montanha: '#a4a48e', outono: '#c49a4a', cogumelos: '#7a6ad0', caverna: '#6a6478', cristal: '#b8dcf8' };
function buildGround(size = 260, seg = 130): void {
  const g = new THREE.PlaneGeometry(size, size, seg, seg).rotateX(-Math.PI / 2);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + camC.x;
    const z = pos.getZ(i) + camC.z;
    const h = baseH(x, z);
    pos.setY(i, h);
    c.set(BCOL[biomeOf(x, z)] ?? '#6cc24a');
    if (h < -0.2) c.set('#c8b88a');
    c.offsetHSL(0, 0, (Math.sin(x * 1.3) * Math.sin(z * 1.7)) * 0.03);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.translate(camC.x, 0, camC.z);
  ground.geometry.dispose();
  ground.geometry = g;
  water.visible = pools.length > 0 || strips.length > 0;
}
const camC = new THREE.Vector3();

/* ------------------------------ gerente ------------------------------ */
const hud = document.createElement('div');
hud.style.cssText = 'position:fixed;inset:0;pointer-events:none;overflow:hidden';
document.body.appendChild(hud);
const mgr = new MobManager(host, scene, renderer, TIER, hud);
mgr.on('toast', (msg) => log.push('toast ' + msg));

/* ------------------------------ câmera ------------------------------ */
let orbitYaw = 0.6;
let orbitPitch = 0.45;
let orbitDist = 30;
const orbitTarget = new THREE.Vector3();
let follow: 'orbit' | 'player' = 'orbit';
let drag = false;
let lx = 0;
let ly = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = true;
  lx = e.clientX;
  ly = e.clientY;
});
addEventListener('pointerup', () => (drag = false));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  orbitYaw -= (e.clientX - lx) * 0.005;
  orbitPitch = Math.max(0.05, Math.min(1.4, orbitPitch + (e.clientY - ly) * 0.005));
  lx = e.clientX;
  ly = e.clientY;
});
addEventListener('wheel', (e) => (orbitDist = Math.max(4, Math.min(220, orbitDist * (1 + Math.sign(e.deltaY) * 0.1)))));
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

/* ------------------------------ rótulos ------------------------------ */
const labels: { m: Mob; el: HTMLDivElement }[] = [];
function label(m: Mob): void {
  const el = document.createElement('div');
  el.textContent = m.def.name();
  el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);font:600 11px Fredoka,system-ui;color:#fff;text-shadow:0 1px 2px #2a0b5c,0 0 3px #2a0b5c;white-space:nowrap';
  hud.appendChild(el);
  labels.push({ m, el });
}
const _v = new THREE.Vector3();
function syncLabels(): void {
  for (const l of labels) {
    const m = l.m;
    if (m.dead) {
      l.el.style.display = 'none';
      continue;
    }
    _v.set(m.x, m.y + mgr.render.models[m.sp].height * m.scale + 0.25, m.z).project(camera);
    const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1 && m.camD < 70;
    l.el.style.display = vis ? '' : 'none';
    if (vis) {
      l.el.style.left = ((_v.x + 1) * 0.5 * innerWidth).toFixed(0) + 'px';
      l.el.style.top = ((1 - _v.y) * 0.5 * innerHeight).toFixed(0) + 'px';
    }
  }
}

/* ------------------------------ modos ------------------------------ */
type Anim = 'idle' | 'walk' | 'run' | 'graze' | 'sleep' | 'attack' | 'fly';
let anim: Anim = (Q.get('anim') as Anim) ?? 'walk';
const slots = new Map<Mob, [number, number]>();
let pilot: ((dt: number) => void) | null = null;
let lair: Lair | null = null;

function setupGrid(): void {
  mgr.autoSpawn = false;
  mgr.aiOn = false;
  hillAmp = 0;
  const animals = ALL_MOBS.map((d, i) => [d, i] as const).filter(([d]) => d.kind === 'animal' && d.habitat !== 'water');
  const fish = ALL_MOBS.map((d, i) => [d, i] as const).filter(([d]) => d.habitat === 'water');
  const mons = ALL_MOBS.map((d, i) => [d, i] as const).filter(([d]) => d.kind === 'monster' && d.habitat !== 'water');
  const bosses = ALL_MOBS.map((d, i) => [d, i] as const).filter(([d]) => d.kind === 'boss');
  const cols = 10;
  const sp = 4.2;
  let z = 0;
  const row = (list: (readonly [(typeof ALL_MOBS)[number], number])[], spacing: number) => {
    list.forEach(([, i], k) => {
      const x = ((k % cols) - (cols - 1) / 2) * spacing;
      const zz = z + Math.floor(k / cols) * spacing;
      const m = mgr.spawn(i, x, zz, { persistent: true });
      m.yaw = Math.PI * 0.15;
      slots.set(m, [x, zz]);
      label(m);
    });
    z += Math.ceil(list.length / cols) * spacing;
  };
  row(animals, sp);
  strips.push({ z0: z - 1.5, z1: z + Math.ceil(fish.length / cols) * sp + 1.5 });
  row(fish, sp);
  z += 2;
  row(mons, sp);
  z += 4;
  row(bosses, 14);
  camC.set(0, 0, z / 2);
  orbitTarget.set(0, 0, z * 0.4);
  orbitDist = 52;
  orbitPitch = 0.6;
  orbitYaw = Math.PI;
}

function applyGridAnim(): void {
  for (const [m, [x, z]] of slots) {
    m.x = x;
    m.z = z;
    const d = m.def;
    m.tx = x + Math.sin(m.yaw) * 50;
    m.tz = z + Math.cos(m.yaw) * 50;
    m.st = 'idle';
    m.want = 0;
    const canFly = d.habitat === 'air' || !!d.alt;
    if (d.habitat === 'water') {
      m.want = anim === 'run' ? d.run : anim === 'idle' || anim === 'sleep' ? 0 : d.speed;
      m.alt = 0.5;
      continue;
    }
    m.flying = anim === 'fly' && canFly && d.kind !== 'boss' ? true : d.plan.form === 'ghost';
    if (m.flying) m.alt = d.plan.form === 'ghost' ? 0.8 : 2.2;
    if (d.id === 'brasalume' && anim === 'fly') {
      m.flying = true;
      m.alt = 6;
    }
    switch (anim) {
      case 'walk':
        m.want = Math.max(0.8, d.speed);
        m.st = 'wander';
        break;
      case 'run':
        m.want = Math.max(2, d.run);
        m.st = 'flee';
        break;
      case 'graze':
        m.st = 'graze';
        break;
      case 'sleep':
        m.st = 'sleep';
        m.flying = false;
        break;
      case 'attack':
        m.st = (mgr.time * 1.5) % 2 < 1.2 ? 'windup' : 'idle';
        if (d.kind === 'boss') m.pose.lunge = Math.sin(mgr.time * 3) * 0.8;
        break;
      case 'fly':
        m.want = m.flying ? d.speed : 0;
        break;
    }
    if (!m.flying && m.grounded === false && !d.hops) m.grounded = true;
  }
}

function spawnRing(ids: string[], n: number, r0: number, r1: number, cx = 0, cz = 0): Mob[] {
  const out: Mob[] = [];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = r0 + Math.random() * (r1 - r0);
    out.push(mgr.spawn(ids[i % ids.length], cx + Math.cos(a) * r, cz + Math.sin(a) * r));
  }
  return out;
}

function setupSavana(): void {
  biomeOf = (x, z) => (Math.hypot(x - 60, z + 40) < 30 ? 'pantano' : 'savana');
  pools.push({ x: 60, z: -40, r: 22 });
  mgr.autoSpawn = true;
  mgr.budget.animals = 90;
  // uma manada grande perto da câmera
  let g = 900;
  const herd = (id: string, n: number, cx: number, cz: number) => {
    g++;
    for (let i = 0; i < n; i++) mgr.spawn(id, cx + (Math.random() - 0.5) * 10, cz + (Math.random() - 0.5) * 10, { group: g });
  };
  herd('zebrilha', 9, -6, 8);
  herd('gnuvem', 8, 10, 14);
  herd('pescolhudo', 3, -16, 22);
  herd('pernaltona', 3, 4, 26);
  herd('bicoverde', 8, 0, 12);
  herd('orelhito', 2, -10, 0);
  herd('capivolta', 4, 48, -26);
  herd('sapolho', 4, 46, -22);
  pl.x = 0;
  pl.z = -18;
  orbitTarget.set(0, 2, 10);
  orbitDist = 36;
  orbitPitch = 0.38;
  orbitYaw = 3.6;
}

function setupNight(): void {
  biomeOf = (x) => (x > 30 ? 'outono' : x < -30 ? 'cogumelos' : 'bosque');
  mgr.autoSpawn = true;
  mgr.budget.monsters = 24;
  spawnRing(['gosmito', 'fantasmim', 'pulapulga', 'cuspilho', 'espantalhao', 'fungo_bufa', 'pedrolho', 'zumbizim', 'zumbizim', 'zumbizim', 'casco_guarda', 'escorpinho', 'nevasquinho', 'espiadinha'], 18, 8, 20);
  scene.background = new THREE.Color('#1a1840');
  pilot = (dt) => {
    // corre em círculos
    const a = mgr.time * 0.25;
    const tx = Math.cos(a) * 10;
    const tz = Math.sin(a) * 10;
    movePl(tx - pl.x, tz - pl.z, dt, 4);
  };
  orbitDist = 26;
  orbitPitch = 0.6;
}

function setupBoss(kind: 'brasalume' | 'colosso_geodo' | 'nenufera'): void {
  mgr.autoSpawn = false;
  hillAmp = 0;
  if (kind === 'nenufera') {
    pools.push({ x: 0, z: 0, r: 24 });
    biomeOf = () => 'pantano';
  } else if (kind === 'colosso_geodo') {
    biomeOf = () => 'caverna';
    scene.background = new THREE.Color('#2a2440');
    (scene.fog as THREE.Fog).color.set('#2a2440');
  } else biomeOf = () => 'montanha';
  lair = { key: 'zoo-' + kind, boss: kind, x: 0, y: 0, z: 0, r: kind === 'brasalume' ? 34 : kind === 'nenufera' ? 26 : 22 };
  pl.x = 0;
  pl.z = -20;
  const b = mgr.startBoss(lair);
  const ph = Number(Q.get('phase') ?? 1);
  if (ph > 1) b.main.hp = b.main.maxHp * (ph === 2 ? 0.6 : 0.3);
  follow = 'player';
  let shootT = 0;
  let meleeT = 0;
  let strafe = 1;
  pilot = (dt) => {
    // piloto: mantém distância, anda de lado, foge de avisos e atira
    const m = b.main;
    const dx = m.x - pl.x;
    const dz = m.z - pl.z;
    const d = Math.hypot(dx, dz) || 1;
    const want = kind === 'nenufera' ? 13 : 14;
    let mx = (dx / d) * (d - want) * 0.5 + (-dz / d) * strafe * 3;
    let mz = (dz / d) * (d - want) * 0.5 + (dx / d) * strafe * 3;
    for (const t of mgr.fx.tele) {
      if (t.kind === 'circle' && Math.hypot(pl.x - t.x, pl.z - t.z) < t.size + 1) {
        mx += (pl.x - t.x) * 3;
        mz += (pl.z - t.z) * 3;
      }
    }
    if (Math.hypot(pl.x, pl.z) > lair!.r - 9) {
      mx -= pl.x * 0.5;
      mz -= pl.z * 0.5;
    }
    if (Math.random() < dt * 0.3) strafe = -strafe;
    movePl(mx, mz, dt, 6);
    pl.yaw = Math.atan2(dx, dz);
    shootT -= dt;
    const target = kind === 'nenufera' ? (b.heads.find((h) => h.alive && h.st !== 'sleep') ?? b.main) : m;
    if (shootT <= 0) {
      shootT = 0.45;
      const ty = target.y + (target === m ? mgr.render.models[m.sp].height * 0.45 : 4.4);
      const sx = pl.x;
      const sy = pl.y + 1.4;
      const sz = pl.z;
      const tx = target.x - sx;
      const tyy = ty - sy;
      const tz = target.z - sz;
      const dd = Math.hypot(tx, tyy, tz);
      mgr.shoot(sx, sy, sz, (tx / dd) * 32, (tyy / dd) * 32 + 2, (tz / dd) * 32, 9, '#ffe07a', 4);
    }
    // corpo a corpo quando tonta / exposto
    meleeT -= dt;
    if (d < 9 && meleeT <= 0) {
      meleeT = 0.6;
      mgr.hitArc(pl.x, pl.z, pl.yaw, 6, 1, 6);
    }
    // colhe botões-cura
    for (const o of mgr.mobs) if (o.def.id === 'flor_cura' && o.alive && Math.random() < dt * 0.35) mgr.damage(o, 10);
  };
}

function movePl(mx: number, mz: number, dt: number, speed: number): void {
  const l = Math.hypot(mx, mz);
  if (l > 0.01) {
    const k = Math.min(speed, l * 2) / l;
    pl.x += mx * k * dt;
    pl.z += mz * k * dt;
  }
}

function setupPerf(): void {
  biomeOf = () => 'savana';
  mgr.autoSpawn = false;
  const ani = ALL_MOBS.filter((d) => d.kind === 'animal' && d.habitat !== 'water' && d.radius < 1.2).map((d) => d.id);
  const mon = ALL_MOBS.filter((d) => d.kind === 'monster' && d.habitat !== 'water').map((d) => d.id);
  // na frente da câmera
  for (let i = 0; i < 100; i++) mgr.spawn(ani[i % ani.length], (Math.random() - 0.5) * 70, 10 + Math.random() * 60, { group: 1 + (i % 12) });
  for (let i = 0; i < 20; i++) mgr.spawn(mon[i % mon.length], (Math.random() - 0.5) * 40, 14 + Math.random() * 30);
  pl.x = 0;
  pl.z = 0;
  dayT = 0.95; // noite: monstros ativos, animais dormindo/andando
  dayT = Number(Q.get('t') ?? 0.95);
  orbitTarget.set(0, 0, 30);
  orbitDist = 52;
  orbitPitch = 0.42;
  orbitYaw = Math.PI;
}

switch (MODE) {
  case 'savana':
    setupSavana();
    break;
  case 'night':
    setupNight();
    break;
  case 'dragon':
    setupBoss('brasalume');
    break;
  case 'golem':
    setupBoss('colosso_geodo');
    break;
  case 'hydra':
    setupBoss('nenufera');
    break;
  case 'perf':
    setupPerf();
    break;
  default:
    setupGrid();
}
buildGround();

/* ------------------------------ painel ------------------------------ */
const panel = document.createElement('div');
panel.style.cssText = 'position:fixed;left:8px;bottom:8px;display:flex;flex-wrap:wrap;gap:4px;max-width:96vw;font:12px system-ui;z-index:5';
document.body.appendChild(panel);
const btn = (txt: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = 'padding:4px 8px;border-radius:8px;border:0;background:#2a0b5ccc;color:#fff';
  b.onclick = fn;
  panel.appendChild(b);
};
for (const m of ['grid', 'savana', 'night', 'dragon', 'golem', 'hydra', 'perf']) btn(m, () => (location.search = '?mode=' + m + '&tier=' + TIER));
if (MODE === 'grid') for (const a of ['idle', 'walk', 'run', 'graze', 'sleep', 'attack', 'fly'] as Anim[]) btn('▶' + a, () => (anim = a));
btn('day/night', () => (dayT = dayT > 0.25 && dayT < 0.75 ? 0.95 : 0.45));
const stats = document.createElement('pre');
stats.style.cssText = 'position:fixed;right:8px;top:8px;margin:0;padding:6px 8px;background:#0008;color:#fff;font:11px/1.35 monospace;z-index:5;pointer-events:none';
document.body.appendChild(stats);
const red = document.createElement('div');
red.style.cssText = 'position:fixed;inset:0;pointer-events:none;box-shadow:inset 0 0 120px #ff2040;opacity:0';
document.body.appendChild(red);

/* ------------------------------ laço ------------------------------ */
let last = performance.now();
let frameMs = 16;
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
const perfLog: { frame: number; ai: number; move: number; render: number; gpuish: number }[] = [];
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t0 = performance.now();
  // luz do dia
  const day = Math.max(0, Math.sin((dayT - 0.25) * Math.PI * 2));
  hemi.intensity = 0.35 + day * 1.3;
  sun.intensity = 0.15 + day * 1.7;
  hemi.color.set(day > 0.2 ? 0xdff4ff : 0x8a9aff);
  if (MODE !== 'golem' && MODE !== 'night') {
    const sky = new THREE.Color(day > 0.2 ? '#9ad8f8' : '#1a1840');
    scene.background = sky;
    (scene.fog as THREE.Fog).color.copy(sky);
  }
  // jogador
  if (keys.size) {
    const f = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
    const s = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const cy = orbitYaw + Math.PI;
    movePl(Math.sin(cy) * f + Math.cos(cy) * -s, Math.cos(cy) * f - Math.sin(cy) * -s, dt, 7);
  } else pilot?.(dt);
  pl.y = baseH(pl.x, pl.z);
  plMesh.position.set(pl.x, pl.y + 0.85, pl.z);
  if (MODE === 'grid') applyGridAnim();
  // câmera
  const tgt = follow === 'player' && lair ? _v.set((pl.x * 0.6), pl.y + 2, (pl.z * 0.6)) : orbitTarget;
  if (follow === 'player' && lair) {
    // atrás do jogador olhando o chefe
    const b = mgr.bosses[0];
    if (b) {
      const bx = b.main.x;
      const bz = b.main.z;
      const a = Math.atan2(bx - pl.x, bz - pl.z);
      const fly = Math.max(0, b.main.y - pl.y - 2);
      const back = 15 + fly * 0.6;
      camera.position.set(pl.x - Math.sin(a) * back, pl.y + 8 + fly * 0.3, pl.z - Math.cos(a) * back);
      camera.lookAt((pl.x + bx) / 2, pl.y + 3 + fly * 0.6, (pl.z + bz) / 2);
    }
  } else {
    camera.position.set(tgt.x + Math.sin(orbitYaw) * Math.cos(orbitPitch) * orbitDist, tgt.y + Math.sin(orbitPitch) * orbitDist, tgt.z + Math.cos(orbitYaw) * Math.cos(orbitPitch) * orbitDist);
    camera.lookAt(tgt);
  }
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 2);
  }
  mgr.update(dt, camera);
  const t1 = performance.now();
  renderer.render(scene, camera);
  const t2 = performance.now();
  syncLabels();
  hurtFlash = Math.max(0, hurtFlash - dt * 3);
  red.style.opacity = hurtFlash.toFixed(2);
  frameMs = frameMs * 0.9 + (t2 - t0) * 0.1;
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc >= 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
    const c = mgr.counts();
    const r = renderer.info.render;
    const s = mgr.stats;
    stats.textContent =
      `mode ${MODE} tier ${TIER}  fps ${fps.toFixed(0)}\n` +
      `animais ${c.animals}  monstros ${c.monsters}  chefes ${c.bosses}\n` +
      `perto ${mgr.render.stats.near}  impostor ${mgr.render.stats.far}\n` +
      `IA ${s.ai.toFixed(2)}ms  mover ${s.move.toFixed(2)}ms  sync ${s.render.toFixed(2)}ms\n` +
      `quadro CPU ${frameMs.toFixed(1)}ms  draws ${r.calls}  tris ${(r.triangles / 1000).toFixed(0)}k\n` +
      `fx ${mgr.fx.particleCount}  jogador ${pl.hp.toFixed(0)}hp` +
      (mgr.bosses[0] ? `\nchefe ${mgr.bosses[0].st} F${mgr.bosses[0].phase} ${(mgr.bosses[0].hpFrac * 100).toFixed(0)}%` : '');
    perfLog.push({ frame: frameMs, ai: s.ai, move: s.move, render: s.render, gpuish: t2 - t1 });
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as { __zoo: unknown }).__zoo = {
  mgr,
  pl,
  log,
  perfLog,
  setAnim: (a: Anim) => (anim = a),
  setDay: (t: number) => (dayT = t),
  info: () => ({ fps, frameMs, counts: mgr.counts(), stats: { ...mgr.stats }, render: { ...mgr.render.stats }, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
  boss: () => mgr.bosses[0] ?? null,
  setBossHp: (f: number) => {
    const b = mgr.bosses[0];
    if (b) b.main.hp = b.main.maxHp * f;
  },
  camera,
  orbit: (yaw: number, pitch: number, dist: number, x?: number, y?: number, z?: number) => {
    orbitYaw = yaw;
    orbitPitch = pitch;
    orbitDist = dist;
    if (x !== undefined) orbitTarget.set(x, y ?? 0, z ?? 0);
  },
};
