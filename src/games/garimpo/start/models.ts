/* ============================================================
 *  GARIMPO — COMEÇO DO ZERO: modelos procedurais leves do primeiro acampamento
 *  (barraca de lona, fogueira, calha velha quebrada, píer com o barco do comprador,
 *  canoa da chegada), andaimes/tábuas da obra, material "fantasma" e plaquinhas de ícone.
 *  Tudo com o Kit do jogo (geometria fundida, poucas chamadas de desenho).
 * ============================================================ */
import * as THREE from 'three';
import { Kit } from '../kit';
import { C } from '../models';
import { buildSluice } from '../proc/models';

/** barraca de lona em "A" com a porta virada para +z, estacas e cordas */
export function buildTent(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit({ y: 0.2, k: 0.4 });
  const L = 2.6;
  const W = 2.3;
  const H = 1.7;
  const side = Math.hypot(W / 2, H);
  const a = Math.atan2(H, W / 2);
  // dois panos de lona (laranja-terra queimado) + faixa mais escura na barra
  for (const s of [1, -1]) {
    k.box(0.04, side, L, 0xd9893a, (s * W) / 4, H / 2, 0, 0, 0, s * (Math.PI / 2 - a));
    k.box(0.05, 0.18, L + 0.02, 0xa85a22, (s * W) / 2 - s * 0.06, 0.12, 0, 0, 0, s * (Math.PI / 2 - a));
  }
  // fundo fechado (triângulo) e porta aberta (abas dobradas)
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-W / 2, 0, 0, W / 2, 0, 0, 0, H, 0], 3));
  tri.computeVertexNormals();
  k.add(tri.clone(), 0xc77a32, 0, 0.01, -L / 2);
  k.add(tri.clone().rotateY(Math.PI), 0xc77a32, 0, 0.01, -L / 2);
  const flap = new THREE.BufferGeometry();
  flap.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, W * 0.42, 0, 0.35, 0, H * 0.92, 0], 3));
  flap.computeVertexNormals();
  k.add(flap.clone(), 0xe9a050, 0.05, 0.01, L / 2);
  k.add(flap.clone().rotateY(Math.PI), 0xe9a050, 0.05, 0.01, L / 2);
  k.add(flap.clone().scale(-1, 1, 1), 0xe9a050, -0.05, 0.01, L / 2);
  k.add(flap.clone().scale(-1, 1, 1).rotateY(Math.PI), 0xe9a050, -0.05, 0.01, L / 2);
  // interior escuro (aparece pela porta)
  k.add(tri.clone().scale(0.92, 0.92, 1), 0x3a2414, 0, 0.02, L / 2 - 0.3);
  // mastros e cumeeira
  for (const z of [L / 2 + 0.05, -L / 2 - 0.05]) k.cyl(0.035, 0.035, H + 0.15, C.wood, 0, (H + 0.15) / 2, z, 6);
  k.cylZ(0.03, L + 0.2, C.woodL, 0, H + 0.02, 0, 0, 6);
  // estacas + cordas
  for (const z of [L / 2 + 0.05, -L / 2 - 0.05]) {
    const zz = z + Math.sign(z) * 0.9;
    k.box(0.05, 0.25, 0.05, C.woodL, 0, 0.1, zz);
    const dy = H;
    const dz = zz - z;
    const len = Math.hypot(dy, dz);
    k.add(new THREE.CylinderGeometry(0.01, 0.01, len, 4), 0xe8dcc0, 0, H / 2 + 0.05, (z + zz) / 2, Math.atan2(-dz, dy), 0, 0);
  }
  // colchonete e mochila na porta
  k.rbox(0.8, 0.1, 1.6, 0.04, 0x3a7fc0, 0.2, 0.06, -0.1);
  k.rbox(0.42, 0.5, 0.3, 0.08, 0x5a7a3a, -0.65, 0.25, L / 2 + 0.45);
  k.rbox(0.3, 0.16, 0.08, 0.04, 0x46602c, -0.65, 0.22, L / 2 + 0.62);
  g.add(k.build());
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** fogueira: pedras em roda, lenha cruzada, chamas (sprites aditivos) e luz que tremula */
export interface Campfire {
  root: THREE.Group;
  update(t: number, night: number): void;
  dispose(): void;
}
let flameTex: THREE.Texture | null = null;
export function glowTexture(): THREE.Texture {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}
export function buildCampfire(tier: number): Campfire {
  const root = new THREE.Group();
  const k = new Kit();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    k.ball(0.16, i % 2 ? 0x8a8278 : 0x6e675e, Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55, 1.2, 0.7, 1, 0);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI + 0.3;
    k.cyl(0.06, 0.07, 0.9, 0x5a3a20, 0, 0.16, 0, 6, 0, a, Math.PI / 2 - 0.25);
  }
  k.cyl(0.32, 0.36, 0.04, 0x2a1a10, 0, 0.02, 0, 10);
  root.add(k.build());
  const tex = glowTexture();
  const flames: THREE.Sprite[] = [];
  const cols = [0xffd27a, 0xff9a3a, 0xff6a2a];
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: cols[i % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    root.add(s);
    flames.push(s);
  }
  const light = tier >= 2 ? new THREE.PointLight(0xff9a4a, 0, 14, 1.6) : null;
  if (light) {
    light.position.set(0, 1.0, 0);
    root.add(light);
  }
  return {
    root,
    update(t, night) {
      for (let i = 0; i < flames.length; i++) {
        const ph = t * (5 + i * 1.3) + i * 2.1;
        const f = flames[i];
        const k2 = 0.7 + Math.sin(ph) * 0.2 + Math.sin(ph * 2.7) * 0.1;
        f.position.set(Math.sin(i * 2.4) * 0.12, 0.35 + i * 0.12 + Math.sin(ph * 0.7) * 0.05, Math.cos(i * 2.4) * 0.12);
        f.scale.set(0.55 * k2, 0.9 * k2 * (1 - i * 0.1), 1);
        (f.material as THREE.SpriteMaterial).opacity = 0.55 + night * 0.35;
      }
      if (light) light.intensity = night * (2.2 + Math.sin(t * 9) * 0.3 + Math.sin(t * 23) * 0.2);
    },
    dispose() {
      root.removeFromParent();
      for (const f of flames) (f.material as THREE.Material).dispose();
    },
  };
}

/** calha velha largada na beira: torta, perna quebrada, sem água, tábuas soltas */
export function buildBrokenSluice(): THREE.Group {
  const s = buildSluice();
  s.water.visible = false;
  s.heap.visible = false;
  s.conc.visible = false;
  s.tilt.rotation.set(0.12, 0, 0.32);
  s.tilt.position.y = 0.55;
  // perna da cauda quebrada (deitada no chão)
  const l = s.legs[0];
  l.rotation.z = 1.35;
  l.position.y = 0.12;
  for (const lg of s.legs) lg.scale.y = 0.6;
  const k = new Kit({ y: 0.3, k: 0.7 });
  k.box(0.9, 0.05, 0.22, C.woodL, 1.1, 0.04, 0.3, 0, 0.6, 0);
  k.box(0.7, 0.05, 0.2, C.wood, 1.3, 0.09, -0.4, 0, -0.3, 0.05);
  k.box(0.6, 0.05, 0.18, 0x6a4a30, -0.9, 0.04, -1.2, 0, 1.2, 0);
  s.root.add(k.build());
  // ferrugem: escurece tudo um pouco
  s.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material && !(m.material as THREE.Material).transparent) {
      const mm = (m.material as THREE.MeshLambertMaterial).clone();
      if ('color' in mm) mm.color.multiplyScalar(0.72).lerp(new THREE.Color(0x8a4a26), 0.25);
      m.material = mm;
    }
  });
  return s.root;
}

/** píer de madeira (entra na água em −z) com o barco do comprador amarrado e um toldo listrado */
export function buildPier(len = 6.5): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit({ y: 0.1, k: 0.6 });
  const W = 1.8;
  for (let i = 0; i < Math.round(len / 0.32); i++) k.box(W, 0.07, 0.28, i % 3 ? C.woodL : 0x9a6c40, 0, 0.62, -i * 0.32);
  for (let i = 0; i <= Math.floor(len / 2); i++) for (const s of [1, -1]) k.cyl(0.09, 0.1, 2.4, C.wood, (s * W) / 2, -0.55, -i * 2, 6);
  for (const s of [1, -1]) k.box(0.08, 0.08, len, C.wood, (s * W) / 2, 0.9, -len / 2 + 0.2);
  // barco: casco de madeira pintado, toldo listrado, balança na proa
  const bx = W / 2 + 1.25;
  const bz = -len + 1.8;
  const hull = new THREE.CylinderGeometry(0.85, 0.55, 3.8, 12, 1, false, 0, Math.PI);
  hull.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).rotateZ(Math.PI);
  hull.scale(1, 0.75, 1);
  k.add(hull, 0x2f8fbf, bx, 0.38, bz);
  k.box(1.5, 0.08, 3.6, 0xf3efe6, bx, 0.36, bz);
  k.box(1.62, 0.12, 3.8, 0xd23a2a, bx, 0.4, bz);
  for (let i = 0; i < 6; i++) k.box(1.5, 0.02, 0.36, i % 2 ? 0xffd23a : 0xf3efe6, bx, 2.02 + Math.sin((i / 5) * Math.PI) * 0.12, bz - 0.9 + i * 0.36);
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ])
    k.cyl(0.035, 0.035, 1.6, C.wood, bx + sx * 0.66, 1.2, bz + sz * 0.95, 5);
  // balancinha dourada e caixotes
  k.rbox(0.42, 0.3, 0.42, 0.04, C.wood, bx, 0.6, bz + 1.2);
  k.use('shiny').cyl(0.2, 0.2, 0.04, C.gold, bx - 0.15, 0.82, bz + 1.2, 10).cyl(0.02, 0.02, 0.4, C.steel, bx + 0.1, 0.95, bz + 1.2, 5).use('paint');
  k.rbox(0.5, 0.4, 0.5, 0.03, 0x9a6c40, bx + 0.35, 0.62, bz - 0.9);
  // mesinha do comprador na entrada do píer
  k.rbox(1.2, 0.08, 0.6, 0.03, C.woodL, 0, 1.4, -0.7);
  for (const [sx, sz] of [
    [0.5, 0.22],
    [-0.5, 0.22],
    [0.5, -0.22],
    [-0.5, -0.22],
  ])
    k.box(0.06, 0.75, 0.06, C.wood, sx, 1.02, -0.7 + sz);
  k.use('shiny').cyl(0.16, 0.16, 0.03, C.gold, -0.3, 1.47, -0.7, 10).use('paint');
  g.add(k.build());
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** canoa de madeira (chegada do Bloop na abertura): proa em +z */
export function buildCanoe(): THREE.Group {
  const g = new THREE.Group();
  const k = new Kit();
  const hull = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  hull.scale(0.55, 0.42, 2.0);
  k.add(hull, 0x8a5a32, 0, 0.4, 0);
  const rim = new THREE.TorusGeometry(1, 0.05, 4, 24).rotateX(Math.PI / 2);
  rim.scale(0.55, 1, 2.0);
  k.add(rim, 0x5a3a20, 0, 0.4, 0);
  k.box(0.9, 0.05, 0.2, C.woodL, 0, 0.32, -0.6);
  k.box(0.9, 0.05, 0.2, C.woodL, 0, 0.32, 0.8);
  // trouxa: mochila, bateia e pá
  k.rbox(0.4, 0.42, 0.3, 0.08, 0x5a7a3a, 0, 0.5, -1.2);
  k.use('shiny').cyl(0.32, 0.08, 0.1, C.steel, 0.12, 0.45, 1.25, 14, 0.3, 0, 0).use('paint');
  k.cylZ(0.03, 1.4, C.woodL, -0.25, 0.55, 0.3, 0.1, 5);
  k.use('shiny').box(0.22, 0.03, 0.26, C.steel, -0.25, 0.6, 1.05).use('paint');
  g.add(k.build());
  return g;
}

/** remo (na mão do Bloop na canoa) */
export function buildPaddle(): THREE.Group {
  const k = new Kit();
  k.cyl(0.025, 0.025, 1.5, C.woodL, 0, 0, 0, 5);
  k.box(0.18, 0.4, 0.03, C.wood, 0, -0.85, 0);
  const g = new THREE.Group();
  g.add(k.build());
  return g;
}

/* ---------------- obra: andaime, tábuas, fantasma ---------------- */
/** andaime de madeira em volta de uma caixa (meia-largura hx, meia-prof hz, altura h) */
export function buildScaffold(hx: number, hz: number, h: number): THREE.Group {
  const k = new Kit({ y: 0.4, k: 0.5 });
  const levels = Math.max(1, Math.round(h / 1.6));
  const nx = Math.max(1, Math.round((hx * 2) / 2.4));
  const nz = Math.max(1, Math.round((hz * 2) / 2.4));
  const poles: [number, number][] = [];
  for (let i = 0; i <= nx; i++) {
    poles.push([-hx + (i * hx * 2) / nx, -hz]);
    poles.push([-hx + (i * hx * 2) / nx, hz]);
  }
  for (let j = 1; j < nz; j++) {
    poles.push([-hx, -hz + (j * hz * 2) / nz]);
    poles.push([hx, -hz + (j * hz * 2) / nz]);
  }
  for (const [x, z] of poles) k.cyl(0.05, 0.06, h + 0.4, 0xb08a5a, x, (h + 0.4) / 2, z, 5);
  for (let l = 1; l <= levels; l++) {
    const y = (l / levels) * h;
    k.box(hx * 2 + 0.2, 0.06, 0.24, C.woodL, 0, y, -hz - 0.05);
    k.box(hx * 2 + 0.2, 0.06, 0.24, C.woodL, 0, y, hz + 0.05);
    k.box(0.24, 0.06, hz * 2 + 0.2, C.woodL, -hx - 0.05, y, 0);
    k.box(0.24, 0.06, hz * 2 + 0.2, C.woodL, hx + 0.05, y, 0);
    // diagonais
    if (l === 1)
      for (const s of [1, -1]) {
        const L = Math.hypot(hx * 2, y);
        k.add(new THREE.BoxGeometry(0.05, L, 0.05), 0x9a7448, 0, y / 2, s * (hz + 0.02), 0, 0, Math.atan2(hx * 2, y));
      }
  }
  const g = new THREE.Group();
  g.add(k.build());
  return g;
}
const plankGeo = new THREE.BoxGeometry(1.4, 0.08, 0.26);
const plankMat = new THREE.MeshLambertMaterial({ color: 0xb8875a });
export function buildPlank(): THREE.Mesh {
  const m = new THREE.Mesh(plankGeo, plankMat);
  m.castShadow = true;
  return m;
}

/** material "fantasma" (onde a construção vai ficar): azul-claro translúcido, sem sombra */
export const ghostMat = new THREE.MeshBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.3, depthWrite: false });
const GHOST_KEY = '__ghostOrig';
export function setGhost(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const u = m.userData as Record<string, unknown>;
    if (on) {
      if (!u[GHOST_KEY]) u[GHOST_KEY] = { mat: m.material, cast: m.castShadow };
      m.material = ghostMat;
      m.castShadow = false;
    } else if (u[GHOST_KEY]) {
      const o0 = u[GHOST_KEY] as { mat: THREE.Material; cast: boolean };
      m.material = o0.mat;
      m.castShadow = o0.cast;
      delete u[GHOST_KEY];
    }
  });
}

/** plaquinha redonda com ícone SVG flutuando (sprite; sempre de frente) */
export function iconSprite(svg: string, ring = '#ffcf2e', size = 1.1): THREE.Sprite {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const img = new Image();
  img.onload = () => {
    const c = cv.getContext('2d')!;
    c.fillStyle = 'rgba(36,20,10,.8)';
    c.beginPath();
    c.arc(48, 48, 44, 0, 7);
    c.fill();
    c.strokeStyle = ring;
    c.lineWidth = 5;
    c.stroke();
    c.drawImage(img, 18, 18, 60, 60);
    tex.needsUpdate = true;
  };
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" '));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  sp.scale.setScalar(size);
  sp.renderOrder = 8;
  return sp;
}
