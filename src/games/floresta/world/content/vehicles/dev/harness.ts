/* ============================================================
 *  dev-veiculos.html — garagem de depuração: inventário trapaça,
 *  fabricar peças, montar, dirigir no terreno de teste, carregar toras
 *  e comparar o consumo subindo a rampa vazio × carregado.
 *  window.__mveic expõe tudo para testes automáticos (Playwright).
 * ============================================================ */
import * as THREE from 'three';
import { Sandbox, RAMP_Z0, RAMP_Z1, RAMP_DEG } from './sandbox';
import { VehicleManager } from '../manager';
import { ChaseCam } from '../camera';
import { Vehicle } from '../vehicle';
import { MemInventory, craftMissing, assemble, missingParts } from '../crafting';
import { BLUEPRINT } from '../blueprints';
import { RAW_MATS, PART } from '../parts';
import { analyze, cloneDesign, newDesign, place, type VehicleDesign } from '../design';
import { DriveHud } from '../hud';
import { openGarage, type GarageHandle } from '../garage';

const root = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
root.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9ad8ff');
scene.fog = new THREE.Fog('#9ad8ff', 60, 150);
const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xffffff, 0x5a7a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.camera.left = sun.shadow.camera.bottom = -40;
sun.shadow.camera.right = sun.shadow.camera.top = 40;
scene.add(sun, sun.target);

const sb = new Sandbox(scene);
const mgr = new VehicleManager(sb, scene, 3);
const chase = new ChaseCam(sb);
const inv = new MemInventory();
for (const m of RAW_MATS) inv.give(m, 999);
inv.give('combustivel', 20);
inv.give('bateria', 10);
inv.give('kit_reparo', 5);

let hud: DriveHud | null = null;
let garage: GarageHandle | null = null;
const status = document.getElementById('status')!;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

/* ------------------------------ ações ------------------------------ */
function drive(v: Vehicle): void {
  mgr.enter(v);
  chase.reset();
  hud?.destroy();
  hud = new DriveHud(root, v, {
    exit: () => {
      mgr.exit();
      hud?.destroy();
      hud = null;
    },
    refuel: () => refuel(v),
    repair: () => (inv.count('kit_reparo') && v.repair('kit_reparo') ? (inv.take('kit_reparo', 1), true) : false),
    hitch: () => {
      if (v.hitch) v.unhitch();
      else {
        const t = mgr.trailerNear(v);
        if (t) v.hitchTo(t, 4);
      }
    },
    canHitch: () => !!v.hitch || !!mgr.trailerNear(v),
    camDrag: (dx, dy) => chase.drag(dx, dy),
  });
}
function refuel(v: Vehicle): number {
  let used = 0;
  for (const id of ['carvao', 'tora', 'combustivel', 'bateria']) {
    const k = v.refuel(id, inv.count(id));
    if (k) inv.take(id, k);
    used += k;
  }
  return used;
}
function spawnDesign(d: VehicleDesign, x = 0, z = 0, yaw = 0, consume = true): Vehicle | null {
  if (consume) {
    craftMissing(d, inv, 'oficina');
    if (!assemble(d, inv)) return null;
  }
  const v = mgr.spawn(cloneDesign(d), x, z, yaw);
  if (v) refuel(v);
  return v;
}
/** monta a picape peça a peça (como o jogador faria na grade, com simetria) */
function assemblePickupByHand(): VehicleDesign {
  const d = newDesign('vp_chassi_m', 'Picape de teste');
  d.paint = '#3a8aff';
  place(d, 'vp_roda_borracha', 0, 1, 0, true);
  place(d, 'vp_roda_borracha', 0, 4, 0, true);
  place(d, 'vp_farol', 0, 0, 0, true);
  place(d, 'vp_motor_comb', 1, 0, 0, false);
  place(d, 'vp_tanque', 2, 0, 0, false);
  place(d, 'vp_compartimento', 0, 1, 0, false);
  place(d, 'vp_banco', 2, 1, 0, false);
  place(d, 'vp_cacamba', 0, 2, 0, false);
  place(d, 'vp_engate', 3, 5, 0, false);
  return d;
}
function loadLogs(v: Vehicle, n: number): void {
  // toras atravessadas (eixo X do veículo) se a caçamba tiver 1,5 m de largura; senão no comprido
  const s = v.lay.cargo[0];
  if (!s) return;
  const across = s.hw * 2 >= 1.45;
  const span = across ? s.hl * 2 : s.hw * 2;
  const per = Math.max(1, Math.floor(span / 0.56));
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / per);
    const k = (i % per) - (per - 1) / 2;
    const off = k * 0.58 + (row % 2 ? 0.1 : 0);
    const p = across ? v.toWorld(s.x, 0.4 + row * 0.6, s.z + off) : v.toWorld(s.x + off, 0.4 + row * 0.6, s.z);
    sb.addLog(p.x, p.y, p.z, v.yaw + (across ? 0 : Math.PI / 2));
  }
}
function place0(v: Vehicle, x: number, z: number, yaw: number): void {
  v.unpark();
  v.body.position.set(x, sb.heightAt(x, z) + Vehicle.spawnHeight(v.design), z);
  v.body.quaternion.setFromEuler(0, yaw, 0);
  v.body.velocity.setZero();
  v.body.angularVelocity.setZero();
}

/* ------------------------------ teste: subida ------------------------------ */
interface SlopeResult {
  logs: number;
  cargoMass: number;
  totalMass: number;
  time: number;
  dist: number;
  climb: number;
  fuel: number;
  fuelPer100m: number;
  avgSpeed: number;
  reachedTop: boolean;
}
let auto: null | { v: Vehicle; target: number; t: number; z0: number; y0: number; f0: number; d0: number; done: (r: SlopeResult) => void; logs: number } = null;
function startAuto(v: Vehicle, target: number, logs: number, done: (r: SlopeResult) => void): void {
  v.fuel = v.stats.tank;
  auto = { v, target, t: 0, z0: v.body.position.z, y0: v.body.position.y, f0: v.fuelUsed, d0: v.odometer, done, logs };
}
function runSlope(v: Vehicle, target: number, logs: number): Promise<SlopeResult> {
  return new Promise((done) => startAuto(v, target, logs, done));
}
function autoStep(dt: number): void {
  if (!auto) return;
  const a = auto;
  const v = a.v;
  a.t += dt;
  v.input.throttle = a.target / v.cruiseCap;
  v.input.steer = Math.max(-1, Math.min(1, -v.body.position.x * 0.15 - angleTo(v.yaw, 0) * 1.5));
  const p = v.body.position;
  if (p.z < RAMP_Z1 + 2 || a.t > 60) {
    const r: SlopeResult = {
      logs: a.logs,
      cargoMass: v.cargoMass,
      totalMass: v.totalMass,
      time: a.t,
      dist: v.odometer - a.d0,
      climb: p.y - a.y0,
      fuel: v.fuelUsed - a.f0,
      fuelPer100m: ((v.fuelUsed - a.f0) / Math.max(1, v.odometer - a.d0)) * 100,
      avgSpeed: (v.odometer - a.d0) / a.t,
      reachedTop: p.z < RAMP_Z1 + 2,
    };
    v.input.throttle = 0;
    v.input.brake = true;
    auto = null;
    setTimeout(() => (v.input.brake = false), 600);
    a.done(r);
  }
}
const angleTo = (a: number, b: number) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/* ------------------------------ teclado ------------------------------ */
const keys = new Set<string>();
window.addEventListener('keydown', (e) => keys.add(e.code));
window.addEventListener('keyup', (e) => keys.delete(e.code));

/* ------------------------------ laço ------------------------------ */
let last = performance.now();
let simSpeed = 1;
function frame(now: number): void {
  const rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const steps = simSpeed;
  for (let s = 0; s < steps; s++) step(rdt);
  render(rdt);
  requestAnimationFrame(frame);
}
function step(dt: number): void {
  const v = mgr.driving;
  if (v && !auto) {
    hud?.apply(dt, keys);
  }
  autoStep(dt);
  if (v) mgr.focus.set(v.body.position.x, 0, v.body.position.z);
  mgr.preStep(dt);
  sb.world.step(1 / 60, dt, 4);
  mgr.postStep(dt);
}
function render(dt: number): void {
  sb.syncLogs();
  const v = mgr.driving ?? mgr.list[0];
  if (v) {
    chase.update(cam, v, dt);
    sun.position.set(v.body.position.x + 30, v.body.position.y + 50, v.body.position.z + 20);
    sun.target.position.set(v.body.position.x, v.body.position.y, v.body.position.z);
  } else {
    cam.position.set(14, 10, 14);
    cam.lookAt(0, 0, 0);
  }
  hud?.update(dt);
  if (!garage) renderer.render(scene, cam);
  if (v) {
    const s = v.stats;
    status.textContent = `${s.kind} | ${(v.speed * 3.6).toFixed(0)} km/h | massa ${v.totalMass.toFixed(1)} (carga ${v.cargoMass.toFixed(0)}, ${v.cargo.size} toras) | comb ${v.fuel.toFixed(1)}/${s.tank} | gasto ${v.fuelUsed.toFixed(2)} | hp ${v.hp.toFixed(0)}`;
  }
}
requestAnimationFrame(frame);

/* ------------------------------ barra de botões ------------------------------ */
const bar = document.getElementById('bar')!;
const btn = (label: string, f: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = f;
  bar.appendChild(b);
};
btn('Oficina', () => showGarage());
btn('Picape', () => {
  mgr.clear();
  sb.clearLogs();
  const v = spawnDesign(BLUEPRINT.get('picape')!.design, 0, 0, 0);
  if (v) drive(v);
});
btn('+6 toras', () => mgr.driving && loadLogs(mgr.driving, 6));
function spawnBp(id: string): Vehicle | null {
  mgr.clear();
  sb.clearLogs();
  const bp = BLUEPRINT.get(id)!;
  const x = id === 'barco' ? 40 : 0;
  const z = id === 'barco' ? 18 : id === 'ultraleve' ? 70 : 0;
  const v = spawnDesign(bp.design, x, z, 0);
  if (bp.trailer && v) {
    const tr = spawnDesign(bp.trailer, x, z + v.lay.hl + 3.4, 0);
    if (tr) v.hitchTo(tr, 4);
  }
  if (v) drive(v);
  return v;
}
for (const id of ['carrinho', 'carroca', 'kart', 'trator', 'caminhao', 'escavadeira', 'barco', 'ultraleve', 'helicoptero']) btn(id, () => spawnBp(id));

function showGarage(): void {
  if (garage) return;
  hud?.destroy();
  hud = null;
  bar.style.display = 'none';
  garage = openGarage(root, {
    inv,
    station: 'oficina',
    onClose: () => {
      garage = null;
      bar.style.display = '';
      if (mgr.driving) drive(mgr.driving);
    },
    onBuild: (d) => {
      mgr.clear();
      sb.clearLogs();
      const v = spawnDesign(d, 0, 0, 0, false);
      garage?.close();
      if (v) drive(v);
    },
  });
}

/* ------------------------------ API de teste ------------------------------ */
const api = {
  mgr,
  sb,
  spawnBp,
  inv,
  BLUEPRINT,
  PART,
  analyze,
  setSimSpeed: (n: number) => (simSpeed = n),
  craftPickupParts(): Record<string, number> {
    const d = BLUEPRINT.get('picape')!.design;
    const before = Object.fromEntries([...missingParts(d, inv)]);
    craftMissing(d, inv, 'oficina');
    return before;
  },
  assemblePickupByHand,
  build(d: VehicleDesign): boolean {
    mgr.clear();
    sb.clearLogs();
    if (!assemble(d, inv)) return false;
    const v = mgr.spawn(d, 0, 0, 0);
    if (!v) return false;
    refuel(v);
    drive(v);
    return true;
  },
  loadLogs: (n: number) => mgr.driving && loadLogs(mgr.driving, n),
  clearLogs: () => sb.clearLogs(),
  toStart: () => mgr.driving && place0(mgr.driving, 0, RAMP_Z0 + 12, 0),
  runSlope: (target: number, logs: number) => runSlope(mgr.driving!, target, logs),
  /** mesma coisa, mas simulando sem desenhar (rápido; para testes). `until` = parar no meio (m de subida) */
  runSlopeSync(target: number, logs: number, stopAfter = Infinity): SlopeResult | null {
    let res: SlopeResult | null = null;
    startAuto(mgr.driving!, target, logs, (r) => (res = r));
    const z0 = mgr.driving!.body.position.z;
    for (let i = 0; i < 60 * 70 && auto; i++) {
      step(1 / 60);
      if (z0 - mgr.driving!.body.position.z > stopAfter) {
        auto = null;
        mgr.driving!.input.throttle = 0;
        break;
      }
    }
    return res;
  },
  simulate(sec: number): void {
    for (let i = 0; i < sec * 60; i++) step(1 / 60);
  },
  garage: () => showGarage(),
  garageHandle: () => garage,
  info: () => ({ ramp: { z0: RAMP_Z0, z1: RAMP_Z1, deg: RAMP_DEG } }),
  v: () => mgr.driving,
  hud: () => hud,
  cam,
  chase,
};
(window as unknown as { __mveic: typeof api }).__mveic = api;
