/* ============================================================
 *  ANOMALIAS (kit2) — lado de fora à noite: céu estrelado, chão de
 *  grama (textura do módulo de natureza), árvores escuras instanciadas
 *  (src/3d/nature, com vento), touceiras. A neblina do mapa esconde o fim.
 * ============================================================ */
import * as THREE from 'three';
import { natureMat, natureTexCanvas, natureTree, natureTuft, windTime, type TreeKind, type TerrainLayer } from '../../../../3d/nature';
import type { MapCtx } from './ctx';
import { nightSkyTex, toTex } from './tex';

/** cúpula do céu (não recebe neblina) */
export function skyDome(ctx: MapCtx, top = '#070a1e', hor = '#1c2448', r = 110): THREE.Mesh {
  const tex = ctx.track(nightSkyTex(top, hor));
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  (m.material as THREE.MeshBasicMaterial).toneMapped = false;
  m.renderOrder = -10;
  m.name = 'ceu';
  ctx.track(m.geometry);
  ctx.track(m.material as THREE.Material);
  ctx.root.add(m);
  // estrelas nítidas (pontos de 1–2 px, uma chamada)
  const n = 700;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let sd = 11;
  const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    const az = rr() * Math.PI * 2;
    const el = Math.asin(0.08 + rr() * 0.92);
    const R = r * 0.95;
    pos[i * 3] = Math.cos(el) * Math.cos(az) * R;
    pos[i * 3 + 1] = Math.sin(el) * R;
    pos[i * 3 + 2] = Math.cos(el) * Math.sin(az) * R;
    const b = (0.25 + rr() * 0.75) * Math.min(1, 0.3 + Math.sin(el) * 1.2);
    col[i * 3] = b;
    col[i * 3 + 1] = b * 0.97;
    col[i * 3 + 2] = b * (0.9 + rr() * 0.2);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const sm = new THREE.PointsMaterial({ size: ctx.tier >= 2 ? 1.8 : 1.4, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false, transparent: true });
  const stars = new THREE.Points(sg, sm);
  stars.renderOrder = -9;
  stars.name = 'estrelas';
  ctx.track(sg);
  ctx.track(sm);
  m.add(stars);
  // segue a câmera de quem estiver desenhando (jogador ou monitor) e cabe no plano distante dela;
  // de quebra informa a posição da câmera (portas automáticas) mesmo sem visibleFrom()
  m.frustumCulled = false;
  stars.frustumCulled = false;
  m.onBeforeRender = (_r, _s, cam) => {
    m.position.copy(cam.position);
    const far = (cam as THREE.PerspectiveCamera).far ?? 100;
    m.scale.setScalar(Math.min(1, (far * 0.85) / r));
    m.updateMatrixWorld(true);
    ctx.hint(cam.position);
  };
  return m;
}

/** material com textura do módulo de natureza (textura própria → pode ser descartada com o mapa) */
export function natureLayerTex(name: TerrainLayer): THREE.CanvasTexture {
  return toTex(natureTexCanvas(name));
}

/** árvores escuras em volta (InstancedMesh por espécie; LOD pelo nível) */
export function treeBelt(ctx: MapCtx, room: string, pts: [number, number, number][], kinds: TreeKind[] = ['broad', 'pine', 'oak']): void {
  const lod = (ctx.tier <= 1 ? 1 : 0) as 0 | 1;
  const night = new THREE.Color(0.2, 0.25, 0.36);
  const mat = natureMat({ amp: 0.003, y0: 1.2, rustle: 0.02, wrap: 0.4 });
  ctx.adopt(room, mat, false, night);
  const byKind = new Map<TreeKind, [number, number, number][]>();
  pts.forEach((p, i) => {
    const k = kinds[i % kinds.length];
    if (!byKind.has(k)) byKind.set(k, []);
    byKind.get(k)!.push(p);
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const cols: Record<string, [string, string, string]> = {
    broad: ['#4a8a4a', '#2a5a3a', '#5a3a26'],
    pine: ['#3a7a5a', '#1f4a3a', '#4a3020'],
    oak: ['#5a9a4a', '#2f6a34', '#5a3a26'],
    birch: ['#9ac86a', '#5a8a3a', '#e8e0d0'],
    twisty: ['#5a6a8a', '#363a5e', '#3a2a3a'],
  };
  byKind.forEach((list, k) => {
    const [leaf, leaf2, trunk] = cols[k] ?? cols.broad;
    const geo = natureTree({ kind: k, h: 6, trunk, leaf, leaf2, lod, seed: 7 + list.length });
    ctx.track(geo);
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, z, sc], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (x * 13.1 + z * 7.7) % 6.28);
      m4.compose(new THREE.Vector3(x, 0, z), q, s.setScalar(sc));
      im.setMatrixAt(i, m4);
    });
    im.computeBoundingSphere();
    im.name = 'arvores';
    ctx.root.add(im);
  });
  ctx.onUpdate((_dt, t) => (windTime.value = t));
}

/** touceiras de capim (InstancedMesh) */
export function tufts(ctx: MapCtx, room: string, pts: [number, number][]): void {
  if (ctx.tier === 0 || !pts.length) return;
  const geo = ctx.track(natureTuft('#2f6a2a', '#7aa84a', 7, 0.5));
  const mat = natureMat({ amp: 0.02, y0: 0.05, rustle: 0.01 });
  ctx.adopt(room, mat, false, new THREE.Color(0.22, 0.27, 0.38));
  const im = new THREE.InstancedMesh(geo, mat, pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach(([x, z], i) => {
    m4.makeRotationY((x * 3.7 + z) % 6.28).setPosition(x, -0.05, z);
    im.setMatrixAt(i, m4);
  });
  im.computeBoundingSphere();
  im.name = 'capim';
  ctx.root.add(im);
}

/** pontos aleatórios num retângulo, longe de uma lista de retângulos proibidos */
export function scatter(n: number, x0: number, z0: number, x1: number, z1: number, avoid: [number, number, number, number][], seed = 1, smin = 0.8, smax = 1.3): [number, number, number][] {
  let s = seed * 7919 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: [number, number, number][] = [];
  let tries = 0;
  while (out.length < n && tries++ < n * 30) {
    const x = x0 + r() * (x1 - x0);
    const z = z0 + r() * (z1 - z0);
    if (avoid.some(([a, b, c, d]) => x > a && x < c && z > b && z < d)) continue;
    if (out.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < 9)) continue;
    out.push([x, z, smin + r() * (smax - smin)]);
  }
  return out;
}
