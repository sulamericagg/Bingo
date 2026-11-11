/**
 * Visualizador dos mapas do Anomalias (Lanchonete, Posto 24h).
 *   npx vite --port 4321  →  http://localhost:4321/scripts/dev/anomalias-map2.html?map=fastfood&tier=1
 * Parâmetros: ?map=fastfood|posto24h &tier=0..3 &view=<sala>|spawn|cam:<sala>:<i> &panel=0 &power=0
 * Teclas: WASD/setas andar · Q/E sobe/desce · Shift rápido · arrastar = olhar · O = órbita · P = painel · L = energia
 * API (Playwright): window.__am = { ready, build, view(name), cam(room,i), apply(slot,kind,on,v), clear(), stats(), fps }
 */
import '@fontsource/fredoka/700.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AnomalyKind, MapBuild, MapDef } from '../../src/games/anomalias/maps/types';

const MAPS: Record<string, () => Promise<{ default: MapDef }>> = {
  fastfood: () => import('../../src/games/anomalias/maps/fastfood/index'),
  posto24h: () => import('../../src/games/anomalias/maps/posto24h/index'),
};

const q = new URLSearchParams(location.search);
const mapId = q.get('map') ?? 'fastfood';
const tier = Number(q.get('tier') ?? 1) as 0 | 1 | 2 | 3;

const renderer = new THREE.WebGLRenderer({ antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier >= 2 ? 1.5 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 180);
camera.rotation.order = 'YXZ';
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

let build: MapBuild;
let yaw = 0;
let pitch = 0;
let orbit: OrbitControls | null = null;
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === 'o') toggleOrbit();
  if (e.key === 'p') panel.classList.toggle('hide');
  if (e.key === 'l') setPower(!power);
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let drag = false;
renderer.domElement.addEventListener('pointerdown', () => (drag = true));
addEventListener('pointerup', () => (drag = false));
addEventListener('pointermove', (e) => {
  if (!drag || orbit) return;
  yaw -= e.movementX * 0.004;
  pitch = Math.max(-1.4, Math.min(1.4, pitch - e.movementY * 0.004));
});

function toggleOrbit(): void {
  if (orbit) {
    orbit.dispose();
    orbit = null;
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.asin(d.y);
  } else {
    orbit = new OrbitControls(camera, renderer.domElement);
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    orbit.target.copy(camera.position).addScaledVector(d, 8);
  }
}

function lookAt(pos: { x: number; y: number; z: number }, look: { x: number; y: number; z: number }): void {
  camera.position.set(pos.x, pos.y, pos.z);
  const dx = look.x - pos.x;
  const dy = look.y - pos.y;
  const dz = look.z - pos.z;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(dy, Math.hypot(dx, dz));
  if (orbit) orbit.target.set(look.x, look.y, look.z);
}

type View = { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } };
function view(name: string): boolean {
  if (name === 'spawn') {
    camera.position.set(build.spawn.pos.x, build.spawn.pos.y + 1.6, build.spawn.pos.z);
    yaw = build.spawn.yaw;
    pitch = -0.05;
    return true;
  }
  if (name.startsWith('cam:')) {
    const [, r, i] = name.split(':');
    return cam(r, Number(i));
  }
  const views = (build.root.userData.views ?? {}) as Record<string, View>;
  const v = views[name];
  if (v) {
    lookAt(v.pos, v.look);
    return true;
  }
  const r = build.rooms.find((rr) => rr.id === name);
  if (!r) return false;
  const c = { x: (r.min.x + r.max.x) / 2, y: 1.4, z: (r.min.z + r.max.z) / 2 };
  lookAt({ x: r.min.x + (r.max.x - r.min.x) * 0.12, y: 1.6, z: r.max.z - (r.max.z - r.min.z) * 0.12 }, c);
  return true;
}
function cam(room: string, i: number): boolean {
  const r = build.rooms.find((rr) => rr.id === room);
  const c = r?.cams[i];
  if (!c) return false;
  lookAt(c.pos, c.look);
  return true;
}

let power = true;
function setPower(on: boolean): void {
  power = on;
  build.setPower(on);
}

const active = new Map<string, { kind: AnomalyKind; v: number }>();
function apply(slotId: string, kind: AnomalyKind, on: boolean, v = 0): boolean {
  const s = build.slots.find((x) => x.id === slotId);
  if (!s) return false;
  const cur = active.get(slotId);
  if (cur) s.apply(cur.kind, false, cur.v);
  active.delete(slotId);
  if (on) {
    s.apply(kind, true, v);
    active.set(slotId, { kind, v });
  }
  return true;
}
function clear(): void {
  for (const id of [...active.keys()]) apply(id, 'move', false);
}

/* ------------------------------ painel ------------------------------ */
const panel = document.getElementById('panel')!;
if (q.get('panel') === '0') panel.classList.add('hide');
document.getElementById('toggle')!.onclick = () => panel.classList.toggle('hide');
function btn(txt: string, f: () => void, parent: HTMLElement = panel): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = txt;
  b.onclick = f;
  parent.appendChild(b);
  return b;
}
function h3(t: string): void {
  const e = document.createElement('h3');
  e.textContent = t;
  panel.appendChild(e);
}
function fillPanel(): void {
  panel.innerHTML = '';
  h3('Mapa');
  for (const k of Object.keys(MAPS)) btn(k, () => (location.search = `?map=${k}&tier=${tier}`));
  for (const t of [0, 1, 2, 3]) btn('tier ' + t, () => (location.search = `?map=${mapId}&tier=${t}`));
  btn('energia', () => setPower(!power));
  btn('spawn', () => view('spawn'));
  btn('limpar anomalias', () => (clear(), fillPanel()));
  h3('Salas e câmeras');
  for (const r of build.rooms) {
    const d = document.createElement('div');
    btn(r.name, () => view(r.id), d);
    r.cams.forEach((_, i) => btn('cam ' + (i + 1), () => cam(r.id, i), d));
    panel.appendChild(d);
  }
  h3(`Anomalias (${build.slots.length})`);
  for (const s of build.slots) {
    const d = document.createElement('div');
    d.className = 'slot';
    const sp = document.createElement('span');
    sp.textContent = s.id;
    sp.title = s.room + ' — ' + s.kinds.join(', ');
    d.appendChild(sp);
    const sel = document.createElement('select');
    for (const k of s.kinds) sel.add(new Option(k, k));
    d.appendChild(sel);
    const vs = document.createElement('select');
    for (let i = 0; i < (s.variants ?? 1); i++) vs.add(new Option('v' + i, String(i)));
    d.appendChild(vs);
    const b = btn('▶', () => {
      const on = !active.has(s.id);
      apply(s.id, sel.value as AnomalyKind, on, Number(vs.value));
      b.classList.toggle('on', on);
    }, d);
    const go = btn('👁', () => {
      const p = new THREE.Vector3();
      s.object.getWorldPosition(p);
      const r = build.rooms.find((rr) => rr.id === s.room)!;
      const c = new THREE.Vector3((r.min.x + r.max.x) / 2, 1.6, (r.min.z + r.max.z) / 2);
      const dir = c.clone().sub(p).setY(0);
      if (dir.length() < 0.5) dir.set(0, 0, 1);
      dir.normalize();
      const eye = p.clone().addScaledVector(dir, 3.2).setY(1.6);
      lookAt(eye, p);
    }, d);
    go.title = 'olhar';
    panel.appendChild(d);
  }
}

/* ------------------------------ loop ------------------------------ */
const hud = document.getElementById('hud')!;
const fps = { n: 0, v: 0, t0: performance.now(), c0: 0 };
let last = performance.now();
function loop(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (orbit) orbit.update();
  else {
    const sp = (keys.has('shift') ? 9 : 3) * dt;
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    if (keys.has('w') || keys.has('arrowup')) camera.position.addScaledVector(f, sp);
    if (keys.has('s') || keys.has('arrowdown')) camera.position.addScaledVector(f, -sp);
    if (keys.has('d') || keys.has('arrowright')) camera.position.addScaledVector(r, sp);
    if (keys.has('a') || keys.has('arrowleft')) camera.position.addScaledVector(r, -sp);
    if (keys.has('e')) camera.position.y += sp;
    if (keys.has('q')) camera.position.y -= sp;
    camera.rotation.set(pitch, yaw, 0);
  }
  build.update?.(dt);
  build.visibleFrom?.(camera.position);
  renderer.render(scene, camera);
  fps.n++;
  if (now - fps.t0 > 1000) {
    fps.v = (fps.n - fps.c0) * 1000 / (now - fps.t0);
    fps.c0 = fps.n;
    fps.t0 = now;
  }
  const p = camera.position;
  const room = build.rooms.find((r) => p.x >= r.min.x && p.x <= r.max.x && p.z >= r.min.z && p.z <= r.max.z && p.y >= r.min.y && p.y <= r.max.y);
  const info = renderer.info.render;
  hud.textContent = `${build.id} t${tier}  ${fps.v.toFixed(0)} fps  calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k\n${room?.name ?? '—'}  (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`;
  requestAnimationFrame(loop);
}

async function main(): Promise<void> {
  const def = (await MAPS[mapId]()).default;
  const t0 = performance.now();
  build = await def.build({ tier });
  const ms = performance.now() - t0;
  scene.add(build.root);
  const at = build.atmosphere;
  scene.background = new THREE.Color(at?.background ?? '#0b0620');
  if (at?.fog) scene.fog = new THREE.Fog(at.fog.color, at.fog.near, at.fog.far);
  if (q.get('power') === '0') setPower(false);
  view(q.get('view') ?? 'spawn');
  fillPanel();
  requestAnimationFrame(loop);
  const counts: Record<string, number> = {};
  for (const s of build.slots) for (const k of s.kinds) counts[k] = (counts[k] ?? 0) + 1;
  (window as unknown as { __am: unknown }).__am = { ready: true, build, buildMs: ms, view, cam, apply, clear, setPower, renderer, fps, counts, camera, scene };
  document.title = 'ready';
}
void main();
