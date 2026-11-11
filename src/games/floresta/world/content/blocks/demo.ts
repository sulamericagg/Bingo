/* ============================================================
 *  BLOCOS — página de demonstração / debug (scripts/dev/blocos.html).
 *  ?cena=casa|caverna|icones|atlas  &tier=0..3  &giro=1 (câmera girando)
 *  &cam=x,y,z,alvoX,alvoY,alvoZ  &worker=0
 *  Toque/clique: tira o bloco mirado · botão direito / 2 dedos: coloca o selecionado.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../../i18n';
import { buildAtlas } from './atlas';
import { buildCave, buildHouse, demoHeight, demoTerrain } from './demoscene';
import { drawBlockIcon } from './icons';
import { BLOCKS, CAT_NAMES } from './registry';
import { Render } from './types';
import { BlockWorld } from './world';

export interface DemoHandle {
  world: BlockWorld | null;
  dispose(): void;
}

export function startBlocksDemo(host: HTMLElement, qs: URLSearchParams): DemoHandle {
  const cena = qs.get('cena') ?? 'casa';
  if (cena === 'icones') return iconSheet(host);
  if (cena === 'atlas') return atlasSheet(host);
  const tier = Math.max(0, Math.min(3, Number(qs.get('tier') ?? 2))) as 0 | 1 | 2 | 3;
  const cave = cena === 'caverna';

  const renderer = new THREE.WebGLRenderer({ antialias: tier >= 2, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, [1, 1.25, 1.6, 2][tier]));
  renderer.setSize(host.clientWidth, host.clientHeight);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const sky = cave ? 0x120a20 : 0x9fd8ff;
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(sky, cave ? 10 : 40, cave ? 42 : 140);
  const cam = new THREE.PerspectiveCamera(55, host.clientWidth / host.clientHeight, 0.1, 400);
  const hemi = new THREE.HemisphereLight(cave ? 0x6a5a9a : 0xdff2ff, cave ? 0x201828 : 0x6a5a3a, cave ? 0.95 : 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dc, cave ? 0.15 : 1.9);
  sun.position.set(-30, 50, -20);
  scene.add(sun);

  // "terreno do motor": malha de altura simples (como o heightfield do Mundo Aberto)
  if (!cave) {
    const S = 120;
    const geo = new THREE.PlaneGeometry(S, S, S, S);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const g1 = new THREE.Color('#6cc24a');
    const g2 = new THREE.Color('#58a83e');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + 5;
      const z = pos.getZ(i) + 4;
      pos.setXYZ(i, x, demoHeight(x, z), z);
      const c = g1.clone().lerp(g2, (Math.sin(x * 0.7) * Math.cos(z * 0.5) + 1) * 0.5);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  const world = new BlockWorld({ parent: scene, tier, terrain: cave ? null : demoTerrain, worker: qs.get('worker') !== '0' });
  const tb0 = performance.now();
  buildHouse(world.store);
  buildCave(world.store);
  const fillMs = performance.now() - tb0;
  const mesh = world.remeshAll();

  // câmera
  const target = new THREE.Vector3();
  let yaw = 0.75;
  let pitch = 0.32;
  let dist = 30;
  if (cave) {
    target.set(53, -16, 13);
    yaw = 2.6;
    pitch = 0.12;
    dist = 7.5;
  } else target.set(9, 6, 5);
  const camQ = qs.get('cam')?.split(',').map(Number);
  const place = () => {
    if (camQ && camQ.length === 6) {
      cam.position.set(camQ[0], camQ[1], camQ[2]);
      cam.lookAt(camQ[3], camQ[4], camQ[5]);
      return;
    }
    cam.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, target.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    cam.lookAt(target);
  };
  place();
  world.focus.copy(target);

  // luzes reais dos blocos que brilham (pool)
  const pool: THREE.PointLight[] = [];
  for (let i = 0; i < world.q.pointLights; i++) {
    const L = new THREE.PointLight(0xffffff, 0, 9, 1.6);
    scene.add(L);
    pool.push(L);
  }
  let lightT = 0;
  const updLights = () => {
    const ls = world.lightsNear(target.x, target.y, target.z, 26, pool.length);
    pool.forEach((L, i) => {
      const l = ls[i];
      if (!l) {
        L.intensity = 0;
        return;
      }
      L.position.set(l.x, l.y, l.z);
      L.color.set(l.color);
      L.intensity = (l.level / 15) * (cave ? 3.2 : 1.6);
      L.distance = 4 + l.level * 0.6;
    });
  };
  updLights();

  // HUD
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:8px;top:8px;right:8px;font:600 12px/1.35 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre-wrap';
  host.appendChild(hud);
  const sel = BLOCKS.filter((b) => b.render !== Render.None);
  let selIx = sel.findIndex((b) => b.id === 'terra');
  const info = () => {
    const s = world.stats;
    hud.textContent =
      `${t('blk.demo.title', 'Blocos do Bloop World')} · ${cave ? t('blk.demo.caverna', 'Caverna') : t('blk.demo.casa', 'Casa e morro')} · ${t('blk.demo.nivel', 'Qualidade')} ${tier}\n` +
      `${BLOCKS.length - 1} ${t('blk.demo.blocos', 'blocos')} · ${s.chunks} ${t('blk.demo.pedacos', 'pedaços')} · ${s.draws} draw calls · ${s.tris} tri\n` +
      `${t('blk.demo.montar', 'malha')}: ${mesh.ms.toFixed(1)} ms (${mesh.chunks}) · ${t('blk.demo.encher', 'encher')}: ${fillMs.toFixed(1)} ms · atlas ${buildAtlas().ms.toFixed(1)} ms\n` +
      `${t('blk.demo.colocar', 'Colocar')}: ${sel[selIx].name()} (${CAT_NAMES[sel[selIx].cat]()})`;
  };
  info();
  (window as unknown as { __blocos: unknown }).__blocos = { world, mesh, fillMs, atlasMs: buildAtlas().ms };

  // entrada: arrastar gira, roda/pinça aproxima, toque tira, direito coloca, [ ] troca bloco
  let drag = false;
  let moved = 0;
  let lx = 0;
  let ly = 0;
  const el = renderer.domElement;
  const ray = (ev: PointerEvent | MouseEvent) => {
    const r = el.getBoundingClientRect();
    const v = new THREE.Vector3(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
    return world.pick(cam.position.x, cam.position.y, cam.position.z, v.x, v.y, v.z, 60);
  };
  el.addEventListener('pointerdown', (e) => {
    drag = true;
    moved = 0;
    lx = e.clientX;
    ly = e.clientY;
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    moved += Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly);
    yaw -= (e.clientX - lx) * 0.006;
    pitch = Math.max(-0.6, Math.min(1.3, pitch + (e.clientY - ly) * 0.005));
    lx = e.clientX;
    ly = e.clientY;
    place();
  });
  el.addEventListener('pointerup', (e) => {
    drag = false;
    if (moved > 6) return;
    const h = ray(e);
    if (!h) return;
    if (e.button === 2) world.setBlock(h.x + h.nx, h.y + h.ny, h.z + h.nz, sel[selIx].num, Math.round(yaw / (Math.PI / 2)) & 3);
    else world.setBlock(h.x, h.y, h.z, 0);
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('wheel', (e) => {
    dist = Math.max(3, Math.min(90, dist * (1 + Math.sign(e.deltaY) * 0.1)));
    place();
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.key === ']') selIx = (selIx + 1) % sel.length;
    if (e.key === '[') selIx = (selIx - 1 + sel.length) % sel.length;
    info();
  };
  addEventListener('keydown', onKey);
  const onResize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight);
    cam.aspect = host.clientWidth / host.clientHeight;
    cam.updateProjectionMatrix();
  };
  addEventListener('resize', onResize);

  const giro = qs.get('giro') === '1';
  let raf = 0;
  let last = performance.now();
  let gravT = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (giro && !camQ) {
      yaw += dt * 0.15;
      place();
    }
    gravT += dt;
    if (gravT > 0.15) {
      gravT = 0;
      world.tickGravity();
    }
    if (world.remesh()) info();
    lightT += dt;
    if (lightT > 0.5) {
      lightT = 0;
      updLights();
    }
    renderer.render(scene, cam);
  };
  loop();
  requestAnimationFrame(() => requestAnimationFrame(() => (document.title = 'ready')));

  return {
    world,
    dispose() {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
      world.dispose();
      renderer.dispose();
      el.remove();
      hud.remove();
    },
  };
}

/* ------------------------------ folhas de ícones / atlas ------------------------------ */
function iconSheet(host: HTMLElement): DemoHandle {
  const list = BLOCKS.filter((b) => b.render !== Render.None);
  const S = 56;
  const cols = Math.max(4, Math.floor(host.clientWidth / (S + 8)));
  const c = document.createElement('canvas');
  const rows = Math.ceil(list.length / cols);
  c.width = cols * (S + 8);
  c.height = rows * (S + 8) + 8;
  c.style.cssText = 'display:block;background:#f4ecff';
  const x = c.getContext('2d')!;
  list.forEach((b, i) => {
    const px = (i % cols) * (S + 8) + 4;
    const py = Math.floor(i / cols) * (S + 8) + 4;
    x.fillStyle = '#e4d8f8';
    x.fillRect(px - 2, py - 2, S + 4, S + 4);
    drawBlockIcon(x, b.num, px, py, S);
  });
  host.style.overflow = 'auto';
  host.appendChild(c);
  document.title = 'ready';
  return { world: null, dispose: () => c.remove() };
}

function atlasSheet(host: HTMLElement): DemoHandle {
  const a = buildAtlas();
  const c = a.colorCanvas;
  c.style.cssText = 'display:block;width:min(100vw,100vh);image-rendering:pixelated;background:repeating-conic-gradient(#ccc 0 25%,#fff 0 50%) 0 0/16px 16px';
  host.appendChild(c);
  document.title = 'ready';
  return { world: null, dispose: () => c.remove() };
}
