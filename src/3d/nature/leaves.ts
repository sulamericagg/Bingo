/* ============================================================
 *  NATUREZA — tufos de folhas (níveis Médio/Alto): quadradinhos que
 *  SEMPRE olham para a câmera (billboard no vertex shader), com textura
 *  de tufo arredondado (alphaTest, sem ordenação de transparência).
 *  Ficam meio enterrados na casca das bolhas da copa: só a borda
 *  aparece, e a silhueta da árvore vira "fofa" em vez de poligonal.
 *  Normal = normal da copa inteira e cor = mesma oclusão da copa
 *  (luz envolvente igual): não aparecem como manchas. ~10-20 tri/árvore.
 * ============================================================ */
import * as THREE from 'three';
import { Mesher, leafColor, type Lump } from './mesher';
import { rng } from './noise';
import { natureWind, type WindOpts } from './wind';

let atlas: THREE.CanvasTexture | null = null;
/** 2×2 tufos redondos claros (a cor vem do vértice): folhinhas arredondadas, topo mais claro, sem contorno */
export function leafAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const R = rng(77);
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * 128 + 64;
    const oy = Math.floor(cell / 2) * 128 + 64;
    // corpo do tufo (garante silhueta cheia) + folhinhas redondas na borda
    const n = 34 + cell * 4;
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2;
        const d = pass ? 30 + R() * 22 : Math.sqrt(R()) * 34;
        const lx = ox + Math.cos(a) * d;
        const ly = oy + Math.sin(a) * d;
        const rr = pass ? 7 + R() * 6 : 12 + R() * 8;
        // luz de cima-esquerda: folhas do topo mais claras
        const lit = 0.5 - ((ly - oy) / 64) * 0.35 - ((lx - ox) / 64) * 0.15;
        const g = Math.round(205 + Math.max(-1, Math.min(1, lit)) * 40 + (R() - 0.5) * 16);
        const gr = x.createRadialGradient(lx - rr * 0.3, ly - rr * 0.3, rr * 0.1, lx, ly, rr);
        gr.addColorStop(0, `rgb(${Math.min(255, g + 18)},${Math.min(255, g + 18)},${Math.min(255, g + 18)})`);
        gr.addColorStop(1, `rgb(${g - 22},${g - 22},${g - 22})`);
        x.fillStyle = gr;
        x.beginPath();
        x.ellipse(lx, ly, rr, rr * 0.82, a, 0, Math.PI * 2);
        x.fill();
      }
  }
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  return atlas;
}

/** material dos tufos: alphaTest, billboard (olha para a câmera), vento e luz envolvente */
export function leafCardMat(o: WindOpts = {}): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: leafAtlas(), alphaTest: 0.45, side: THREE.DoubleSide });
  natureWind(m, { ...o, noFlip: true });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    prev.call(m, sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCorner;').replace(
      '#include <project_vertex>',
      `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  float bbS = length( instanceMatrix[0].xyz );
#else
  float bbS = 1.0;
#endif
mvPosition = modelViewMatrix * mvPosition;
bbS *= length( modelMatrix[0].xyz );
mvPosition.xy += aCorner * bbS;
gl_Position = projectionMatrix * mvPosition;`,
    );
  };
  const key = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => key() + 'bb1';
  return m;
}

const _c = new THREE.Color();

/**
 * Tufos sobre as bolhas registradas na geometria da árvore (userData.lumps): poucos e grandes,
 * só na borda (lados e topo). Devolve null se a árvore não tem copa de bolhas.
 */
export function natureLeafCards(tree: THREE.BufferGeometry, perLump = 5, seed = 1): THREE.BufferGeometry | null {
  const lumps = tree.userData.lumps as Lump[] | undefined;
  if (!lumps || !lumps.length) return null;
  const m = new Mesher();
  const uv: number[] = [];
  const corner: number[] = [];
  const R = rng(seed * 131 + 9);
  for (const L of lumps) {
    const cp = L.cp;
    const sz = Math.min(L.sx, L.sz);
    const n = Math.max(2, Math.round(perLump * Math.min(1.5, sz / 1.4)));
    for (let i = 0; i < n; i++) {
      // na borda: ângulos espalhados, altura do meio para cima
      const th = (i / n) * Math.PI * 2 + R() * 0.8;
      const dy = -0.15 + R() * 0.85;
      const r = Math.sqrt(Math.max(0, 1 - dy * dy));
      const dx = Math.cos(th) * r;
      const dz = Math.sin(th) * r;
      // centro um pouco DENTRO da casca: metade do tufo sobra para fora
      const k = 0.78;
      const px = L.x + dx * L.sx * k;
      const py = L.y + dy * L.sy * k;
      const pz = L.z + dz * L.sz * k;
      let qx = (px - cp.cx) / cp.rx;
      let qy = (py - cp.cy) / cp.ry;
      let qz = (pz - cp.cz) / cp.rz;
      const ql = Math.hypot(qx, qy, qz) || 1;
      qx /= ql;
      qy /= ql;
      qz /= ql;
      const half = sz * (0.42 + R() * 0.14);
      // mesma cor da casca da copa naquele ponto (um tiquinho mais clara: as pontas pegam luz)
      leafColor(cp, L.x + dx * L.sx, L.y + dy * L.sy, L.z + dz * L.sz, L.tone, _c);
      _c.multiplyScalar(1.05);
      const cell = Math.floor(R() * 4);
      const u0 = (cell % 2) * 0.5;
      const v0 = Math.floor(cell / 2) * 0.5;
      const base = m.nv;
      const rot = R() * Math.PI * 2;
      const cr = Math.cos(rot);
      const sr = Math.sin(rot);
      for (const [a, b, uu, vv] of [
        [-1, -1, u0, v0],
        [1, -1, u0 + 0.5, v0],
        [1, 1, u0 + 0.5, v0 + 0.5],
        [-1, 1, u0, v0 + 0.5],
      ]) {
        m.vert(px, py, pz, qx, qy + cp.lift, qz, _c.r, _c.g, _c.b);
        uv.push(uu, vv);
        corner.push((a * cr - b * sr) * half, (a * sr + b * cr) * half);
      }
      m.quad(base, base + 1, base + 2, base + 3);
    }
  }
  const g = m.build();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  // os cantos crescem na tela: esfera de recorte maior
  g.boundingSphere!.radius += 2;
  return g;
}
