/* ============================================================
 *  DEV — visualizador dos mapas das Anomalias (sem o núcleo).
 *  /scripts/dev/anomalias-map.html?map=creche&tier=1
 *    &room=<id>            vai para a vista de primeira pessoa da sala
 *    &cam=<id>:<i>         câmera de segurança i da sala
 *    &pos=x,y,z&yaw=&pitch= pose livre
 *    &slot=<id>:<kind>:<v> liga anomalias (vírgula separa várias)
 *    &power=0  &ui=0  &cols=1 (colisores)
 *  Teclado: WASD/setas anda, Q/E desce/sobe, Shift corre; arrastar = olhar.
 *  window.__v: API para o Playwright (goRoom, goCam, slot, power, info).
 * ============================================================ */
import * as THREE from 'three';
import type { AnomalyKind, MapBuild, MapDef } from '../../src/games/anomalias/maps/types';

const LOADERS: Record<string, () => Promise<{ default: MapDef }>> = {
  creche: () => import('../../src/games/anomalias/maps/creche'),
  cabanas: () => import('../../src/games/anomalias/maps/cabanas'),
};

const q = new URLSearchParams(location.search);
// no jogo o núcleo desenha o Bocudo nas anomalias 'creature'; aqui o mapa mostra o modelo próprio
(globalThis as { __anoOwnCreature?: boolean }).__anoOwnCreature = q.get('bocudo') !== '0';
const mapId = q.get('map') ?? 'creche';
const tier = Number(q.get('tier') ?? 1) as 0 | 1 | 2 | 3;

const app = document.getElementById('app')!;
const ui = document.getElementById('ui')!;
const hud = document.getElementById('hud')!;
if (q.get('ui') === '0') {
  ui.classList.add('hide');
  hud.style.display = 'none';
  document.getElementById('tog')!.style.display = 'none';
}
document.getElementById('tog')!.onclick = () => ui.classList.toggle('hide');

const renderer = new THREE.WebGLRenderer({ antialias: tier >= 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// igual ao núcleo (core/world.ts): sem tone mapping, hemisférica de env.ambient, lanterna
renderer.toneMapping = THREE.NoToneMapping;
app.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.05, 120);
scene.add(cam);
// lanterna opcional (o núcleo deve ter uma)
const flash = new THREE.SpotLight('#fff4dc', q.get('flash') === '1' ? 6 : 0, 14, 0.5, 0.6, 1.4);
cam.add(flash);
cam.add(flash.target);
flash.target.position.set(0, 0, -1);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
});

let yaw = 0;
let pitch = 0;
const keys = new Set<string>();
addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => (drag = { x: e.clientX, y: e.clientY }));
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  yaw -= (e.clientX - drag.x) * 0.005;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - (e.clientY - drag.y) * 0.005));
  drag = { x: e.clientX, y: e.clientY };
});

function applyPose(): void {
  cam.rotation.set(pitch, yaw, 0, 'YXZ');
}
function lookAt(px: number, py: number, pz: number, lx: number, ly: number, lz: number): void {
  cam.position.set(px, py, pz);
  const dx = lx - px;
  const dy = ly - py;
  const dz = lz - pz;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(dy, Math.hypot(dx, dz));
  applyPose();
}

let B: MapBuild;
const active = new Map<string, { kind: AnomalyKind; v: number }>();
let helpers: THREE.Object3D | null = null;

interface Win {
  __v: unknown;
  __fps: { n: number };
}
const W = window as unknown as Win;
W.__fps = { n: 0 };

async function main(): Promise<void> {
  const t0 = performance.now();
  const def = (await LOADERS[mapId]()).default;
  B = await def.build({ tier });
  const buildMs = performance.now() - t0;
  scene.add(B.root);
  const env = B.env ?? {};
  scene.background = new THREE.Color(env.fog ?? '#0a0f1f');
  scene.fog = new THREE.Fog(env.fog ?? '#0a0f1f', env.fogNear ?? 5, env.fogFar ?? 24);
  scene.add(new THREE.HemisphereLight(env.sky ?? '#8796c8', env.ground ?? '#3a2f4a', env.ambient ?? 1.15));
  cam.position.set(B.spawn.pos.x, B.spawn.pos.y + 1.6, B.spawn.pos.z);
  yaw = B.spawn.yaw;
  applyPose();
  if (q.get('room')) goRoom(q.get('room')!, Number(q.get('view') ?? 0));
  if (q.get('cam')) {
    const [r, i] = q.get('cam')!.split(':');
    goCam(r, Number(i ?? 0));
  }
  if (q.get('pos')) {
    const [x, y, z] = q.get('pos')!.split(',').map(Number);
    cam.position.set(x, y, z);
    yaw = Number(q.get('yaw') ?? 0);
    pitch = Number(q.get('pitch') ?? 0);
    applyPose();
  }
  for (const s of (q.get('slot') ?? '').split(',').filter(Boolean)) {
    const [id, kind, v] = s.split(':');
    setSlot(id, kind as AnomalyKind, Number(v ?? 0), true);
  }
  if (q.get('power') === '0') B.setPower(false);
  if (q.get('cols') === '1') toggleHelpers();
  buildUI(buildMs);
  let last = performance.now();
  let fpsT = 0;
  let fpsN = 0;
  let fps = 0;
  const loop = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    move(dt);
    B.update?.(dt);
    renderer.render(scene, cam);
    W.__fps.n++;
    fpsN++;
    fpsT += dt;
    if (fpsT > 0.5) {
      fps = fpsN / fpsT;
      fpsN = 0;
      fpsT = 0;
      const r = renderer.info.render;
      const room = B.rooms.find((rr) => cam.position.x >= rr.min.x && cam.position.x <= rr.max.x && cam.position.z >= rr.min.z && cam.position.z <= rr.max.z);
      hud.textContent = `${fps.toFixed(0)} fps · ${r.calls} calls · ${(r.triangles / 1000).toFixed(1)}k tri · ${room?.name ?? '-'} · ${cam.position.x.toFixed(1)},${cam.position.y.toFixed(1)},${cam.position.z.toFixed(1)} yaw ${yaw.toFixed(2)}`;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  // espera 2 quadros e avisa o Playwright
  requestAnimationFrame(() => requestAnimationFrame(() => (document.title = 'ready')));
}

function move(dt: number): void {
  const sp = (keys.has('shift') ? 6 : 2.5) * dt;
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  if (keys.has('w') || keys.has('arrowup')) cam.position.addScaledVector(f, sp);
  if (keys.has('s') || keys.has('arrowdown')) cam.position.addScaledVector(f, -sp);
  if (keys.has('a') || keys.has('arrowleft')) cam.position.addScaledVector(r, -sp);
  if (keys.has('d') || keys.has('arrowright')) cam.position.addScaledVector(r, sp);
  if (keys.has('q')) cam.position.y -= sp;
  if (keys.has('e')) cam.position.y += sp;
  applyPose();
}

function goRoom(id: string, view = 0): void {
  const r = B.rooms.find((x) => x.id === id);
  if (!r) return;
  const views = (B.root.userData.views ?? {}) as Record<string, [number, number, number, number?][]>;
  const v = views[id]?.[view];
  if (v) {
    cam.position.set(v[0], (r.min.y ?? 0) + 1.6, v[1]);
    yaw = v[2];
    pitch = v[3] ?? -0.08;
  } else {
    cam.position.set((r.min.x + r.max.x) / 2, r.min.y + 1.6, r.max.z - 0.5);
    yaw = 0;
    pitch = -0.1;
  }
  applyPose();
}
function goCam(id: string, i: number): void {
  const r = B.rooms.find((x) => x.id === id);
  const c = r?.cams[i];
  if (!c) return;
  lookAt(c.pos.x, c.pos.y, c.pos.z, c.look.x, c.look.y, c.look.z);
}
function setSlot(id: string, kind: AnomalyKind, v: number, on: boolean): void {
  const s = B.slots.find((x) => x.id === id);
  if (!s) return console.warn('slot?', id);
  const prev = active.get(id);
  if (prev) s.apply(prev.kind, false, prev.v);
  active.delete(id);
  if (on) {
    s.apply(kind, true, v);
    active.set(id, { kind, v });
  }
}
function toggleHelpers(): void {
  if (helpers) {
    scene.remove(helpers);
    helpers = null;
    return;
  }
  helpers = new THREE.Group();
  for (const c of B.colliders) {
    const b = new THREE.Box3(new THREE.Vector3(c.min.x, c.min.y, c.min.z), new THREE.Vector3(c.max.x, c.max.y, c.max.z));
    helpers.add(new THREE.Box3Helper(b, new THREE.Color('#ff3a6a')));
  }
  for (const r of B.rooms) {
    const b = new THREE.Box3(new THREE.Vector3(r.min.x, r.min.y, r.min.z), new THREE.Vector3(r.max.x, r.max.y, r.max.z));
    helpers.add(new THREE.Box3Helper(b, new THREE.Color('#3aff9a')));
    for (const c of r.cams) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: '#ffe23a' }));
      m.position.set(c.pos.x, c.pos.y, c.pos.z);
      helpers.add(m);
    }
  }
  for (const n of B.npcSpots) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), new THREE.MeshBasicMaterial({ color: '#3ad0ff' }));
    m.position.set(n.pos.x, n.pos.y + 0.2, n.pos.z);
    helpers.add(m);
  }
  for (const it of B.interacts) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshBasicMaterial({ color: '#7aff3a' }));
    m.position.set(it.at.x, 0.1, it.at.z);
    helpers.add(m);
  }
  scene.add(helpers);
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, txt: string, parent: HTMLElement, onclick?: () => void): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.textContent = txt;
  parent.appendChild(e);
  if (onclick) e.addEventListener('click', onclick);
  return e;
}

function buildUI(buildMs: number): void {
  ui.innerHTML = '';
  el('div', `${mapId} · tier ${tier} · montagem ${buildMs.toFixed(0)} ms · ${B.slots.length} anomalias · ${B.interacts.length} tarefas`, ui);
  const top = el('div', '', ui);
  let pw = true;
  el('button', 'energia', top, () => {
    pw = !pw;
    B.setPower(pw);
  });
  el('button', 'colisores', top, toggleHelpers);
  el('button', 'lanterna', top, () => (flash.intensity = flash.intensity ? 0 : 6));
  el('button', 'limpar', top, () => {
    for (const id of [...active.keys()]) setSlot(id, 'move', 0, false);
    buildUI(buildMs);
  });
  el('h3', 'Salas', ui);
  for (const r of B.rooms) {
    const row = el('div', '', ui);
    row.className = 'row';
    el('button', r.name, row, () => goRoom(r.id));
    r.cams.forEach((_c, i) => el('button', 'cam' + (i + 1), row, () => goCam(r.id, i)));
  }
  el('h3', 'Anomalias', ui);
  for (const s of B.slots) {
    const row = el('div', `${s.id} (${s.room}) `, ui);
    row.className = 'row';
    for (const k of s.kinds)
      for (let v = 0; v < (s.variants ?? 1); v++) {
        const b = el('button', `${k}${(s.variants ?? 1) > 1 ? v : ''}`, row, () => {
          const a = active.get(s.id);
          const on = !(a && a.kind === k && a.v === v);
          setSlot(s.id, k, v, on);
          row.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
          if (on) b.classList.add('on');
        });
      }
  }
  el('h3', 'Tarefas', ui);
  for (const it of B.interacts) {
    const row = el('div', `${it.id} [${it.kind}] `, ui);
    row.className = 'row';
    const st = (it as { states?: string[] }).states ?? [];
    for (const s of st) el('button', s, row, () => it.setState?.(s));
    el('button', 'ir', row, () => {
      cam.position.set(it.at.x, 1.6, it.at.z);
      const p = new THREE.Vector3();
      it.object.getWorldPosition(p);
      lookAt(it.at.x, 1.6, it.at.z, p.x, p.y, p.z);
    });
  }
}

/** câmera a `dist` m do objeto, do lado do centro da sala, olhando para ele */
function aimAt(o: THREE.Object3D, roomId: string, dist = 2.6, side = 0): void {
  const b = new THREE.Box3().setFromObject(o, false);
  const c = b.isEmpty() ? o.getWorldPosition(new THREE.Vector3()) : b.getCenter(new THREE.Vector3());
  const r = B.rooms.find((x) => x.id === roomId);
  const rc = r ? new THREE.Vector3((r.min.x + r.max.x) / 2, 0, (r.min.z + r.max.z) / 2) : cam.position.clone();
  const d = new THREE.Vector3(rc.x - c.x, 0, rc.z - c.z);
  if (d.lengthSq() < 0.01) d.set(0, 0, 1);
  d.normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), side);
  let px = c.x + d.x * dist;
  let pz = c.z + d.z * dist;
  if (r) {
    px = Math.min(r.max.x - 0.25, Math.max(r.min.x + 0.25, px));
    pz = Math.min(r.max.z - 0.25, Math.max(r.min.z + 0.25, pz));
  }
  lookAt(px, (r?.min.y ?? 0) + 1.6, pz, c.x, c.y, c.z);
}
function aimSlot(id: string, dist = 2.6, side = 0): void {
  const s = B.slots.find((x) => x.id === id);
  if (s) aimAt(s.object, s.room, dist, side);
}

W.__v = {
  aimSlot,
  aimInteract: (id: string, dist = 2.2, side = 0) => {
    const it = B.interacts.find((x) => x.id === id);
    if (it) aimAt(it.object, it.room, dist, side);
  },
  goRoom,
  goCam,
  lookAt,
  setSlot,
  power: (on: boolean) => B.setPower(on),
  build: () => B,
  slots: () => B.slots.map((s) => ({ id: s.id, room: s.room, kinds: s.kinds, variants: s.variants ?? 1 })),
  rooms: () => B.rooms.map((r) => ({ id: r.id, name: r.name, cams: r.cams.length })),
  interacts: () => B.interacts.map((i) => ({ id: i.id, kind: i.kind, room: i.room, states: (i as { states?: string[] }).states })),
  setState: (id: string, s: string) => B.interacts.find((i) => i.id === id)?.setState?.(s),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs?.length }),
  /** malhas visíveis dentro do frustum, agrupadas por nome (para caçar chamadas de desenho) */
  draws: () => {
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const out: Record<string, number> = {};
    const walk = (o: THREE.Object3D, path: string) => {
      if (!o.visible) return;
      const m = o as THREE.Mesh;
      const nm = o.name || o.type;
      if ((m.isMesh || (o as THREE.Sprite).isSprite) && o.layers.test(cam.layers) && (!o.frustumCulled || ((m.geometry.boundingSphere || m.geometry.computeBoundingSphere(), true) && fr.intersectsSphere(new THREE.Sphere().copy(m.geometry.boundingSphere!).applyMatrix4(o.matrixWorld))))) {
        const key = path.startsWith('zone:') && nm.startsWith('p:') ? path + '/part' : path + '/' + (nm.includes(':') ? 'shell' : nm);
        out[key] = (out[key] ?? 0) + 1;
      }
      for (const c of o.children) walk(c, o.name.startsWith('zone:') ? o.name : path ? path : nm);
    };
    for (const c of B.root.children) walk(c, '');
    return Object.entries(out).sort((a, b) => b[1] - a[1]);
  },
  pose: () => ({ x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw, pitch }),
  setPose: (x: number, y: number, z: number, yy: number, pp: number) => {
    cam.position.set(x, y, z);
    yaw = yy;
    pitch = pp;
    applyPose();
  },
};

main().catch((e) => {
  console.error(e);
  document.title = 'error';
  hud.textContent = String(e?.stack ?? e);
  hud.style.display = 'block';
});
