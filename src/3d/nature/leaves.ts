/* ============================================================
 *  NATUREZA — cartões de folhas (níveis Médio/Alto): quadradinhos com
 *  textura de raminho (alphaTest, sem ordenação de transparência) na
 *  casca das bolhas da copa. Quebram a silhueta poligonal: a borda
 *  da árvore vira "folhagem". Normal = normal da copa inteira (a luz
 *  casa com as bolhas), cor = mesma oclusão da copa. ~48 tri/árvore.
 * ============================================================ */
import * as THREE from 'three';
import { Mesher, leafColor, type Lump } from './mesher';
import { rng } from './noise';
import { natureWind, type WindOpts } from './wind';

let atlas: THREE.CanvasTexture | null = null;
/** 2×2 raminhos brancos (a cor vem do vértice) com nervuras levemente escuras */
export function leafAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const R = rng(77);
  // cada célula: um tufo arredondado de folhinhas sobrepostas (borda recortada = silhueta fofa)
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 128 + 64;
    const oy = Math.floor(cell / 2) * 128 + 64;
    const n = 46 + cell * 4;
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2;
      const d = Math.sqrt(R()) * 44;
      const lx = ox + Math.cos(a) * d;
      const ly = oy + Math.sin(a) * d;
      const L = 10 + R() * 7;
      const W = 6 + R() * 3.5;
      x.save();
      x.translate(lx, ly);
      x.rotate(a + Math.PI / 2 + (R() - 0.5) * 1.2);
      const g = 200 + Math.floor((1 - d / 44) * 25 + R() * 30);
      x.fillStyle = `rgb(${g},${g},${g})`;
      x.strokeStyle = 'rgba(90,90,90,0.3)';
      x.lineWidth = 1.2;
      x.beginPath();
      x.moveTo(0, -L);
      x.quadraticCurveTo(W, -L * 0.1, 0, L);
      x.quadraticCurveTo(-W, -L * 0.1, 0, -L);
      x.fill();
      x.stroke();
      x.restore();
    }
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  return atlas;
}

/** material dos cartões: alphaTest, dois lados SEM inverter a normal (verso não fica preto), vento */
export function leafCardMat(o: WindOpts = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: leafAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
  natureWind(m, { ...o, noFlip: true });
  return m;
}

const _c = new THREE.Color();

/**
 * Cartões sobre as bolhas registradas na geometria da árvore (userData.lumps).
 * Devolve null se a árvore não tem copa de bolhas (pinheiro, palmeira...).
 */
export function natureLeafCards(tree: THREE.BufferGeometry, perLump = 10, seed = 1): THREE.BufferGeometry | null {
  const lumps = tree.userData.lumps as Lump[] | undefined;
  if (!lumps || !lumps.length) return null;
  const m = new Mesher();
  const uv: number[] = [];
  const R = rng(seed * 131 + 9);
  for (const L of lumps) {
    const cp = L.cp;
    const sz = Math.min(L.sx, L.sz);
    const n = Math.max(3, Math.round(perLump * Math.min(1.6, sz / 1.3)));
    for (let i = 0; i < n; i++) {
      // direção na casca, só metade de cima e os lados (embaixo ninguém vê)
      const th = R() * Math.PI * 2;
      const dy = -0.4 + R() * 1.25;
      const r = Math.sqrt(Math.max(0, 1 - Math.min(1, dy * dy)));
      const dx = Math.cos(th) * r;
      const dz = Math.sin(th) * r;
      const px = L.x + dx * L.sx * 0.98;
      const py = L.y + Math.min(1, dy) * L.sy * 0.98;
      const pz = L.z + dz * L.sz * 0.98;
      // normal da copa inteira
      let qx = (px - cp.cx) / cp.rx;
      let qy = (py - cp.cy) / cp.ry;
      let qz = (pz - cp.cz) / cp.rz;
      const ql = Math.hypot(qx, qy, qz) || 1;
      qx /= ql;
      qy /= ql;
      qz /= ql;
      const nx = qx;
      const ny = qy + cp.lift;
      const nz = qz;
      // plano do cartão: meio para fora, meio ao acaso (na silhueta muitos ficam de lado → borda de folhas)
      const rx = R() * 2 - 1;
      const ry = R() * 2 - 1;
      const rz = R() * 2 - 1;
      let ox = dx * 0.45 + rx * 0.55;
      let oy = Math.min(1, dy) * 0.3 + ry * 0.55;
      let oz = dz * 0.45 + rz * 0.55;
      const ol = Math.hypot(ox, oy, oz) || 1;
      ox /= ol;
      oy /= ol;
      oz /= ol;
      // base do plano: u ⟂ o, v = o × u
      let ux = -oz;
      let uy = 0;
      let uz = ox;
      let ul = Math.hypot(ux, uz);
      if (ul < 1e-3) {
        ux = 1;
        uz = 0;
        ul = 1;
      }
      ux /= ul;
      uz /= ul;
      let vx = oy * uz - oz * uy;
      let vy = oz * ux - ox * uz;
      let vz = ox * uy - oy * ux;
      const rot = R() * Math.PI * 2;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      const ax = ux * cr + vx * sr;
      const ay = uy * cr + vy * sr;
      const az = uz * cr + vz * sr;
      vx = vx * cr - ux * sr;
      vy = vy * cr - uy * sr;
      vz = vz * cr - uz * sr;
      const half = sz * (0.34 + R() * 0.16);
      leafColor(cp, px, py, pz, L.tone + 0.25, _c);
      _c.multiplyScalar(1.08);
      const cell = Math.floor(R() * 4);
      const u0 = (cell % 2) * 0.5;
      const v0 = Math.floor(cell / 2) * 0.5;
      const base = m.nv;
      const corners = [
        [-1, -1, u0, v0],
        [1, -1, u0 + 0.5, v0],
        [1, 1, u0 + 0.5, v0 + 0.5],
        [-1, 1, u0, v0 + 0.5],
      ];
      for (const [a, b, uu, vv] of corners) {
        // empurra o centro para fora da casca: a folhagem passa da borda da bolha
        const push = half * 0.3;
        m.vert(px + (ax * a + vx * b) * half + dx * push, py + (ay * a + vy * b) * half + Math.max(0, dy) * push * 0.6, pz + (az * a + vz * b) * half + dz * push, nx, ny, nz, _c.r, _c.g, _c.b);
        uv.push(uu, vv);
      }
      m.quad(base, base + 1, base + 2, base + 3);
    }
  }
  const g = m.build();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
