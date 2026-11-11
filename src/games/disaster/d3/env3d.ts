/* ============================================================
 *  AMBIENTE 3D DO "SOBREVIVA AOS DESASTRES" (docs/DISASTER-DESIGN.md §10):
 *  céu com nuvens/sol/lua/estrelas e mar com ondas de Gerstner, Fresnel e espuma
 *  (src/games/jangada/ocean.ts), terreno com as texturas da natureza (src/3d/nature),
 *  árvores/arbustos/flores/grama de lâminas instanciadas, fachadas texturizadas,
 *  adereços (carros, bancos, postes, guarda-sóis, pirulitos...), horizonte por mapa
 *  (prédios, montanhas, dunas, floresta, estação espacial), chuva/neve/brasas e um
 *  material de fluido estilizado (água, lava, gosma, neve, gelatina, chocolate, espuma, lama).
 *  Orçamento por nível: Mínimo sem grama/sombras/normal map; Alto com tudo.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BlobShadows, GrassField, natureBush, natureFlowers, natureMat, natureQ, natureRock, natureTree, natureTexture, splatAttributes, setSplat, terrainMaterial, TL, NL, windTime, natureAnisotropy, type GrassSource, type TreeKind } from '../../../3d/nature';
import { Ocean, Sky, skyAt, waterTex, type SkyCols } from '../../jangada/ocean';
import type { Tier } from '../../../core/quality';
import type { MapId, Scenario } from '../scenarios';
import { softSprite, flameSprite } from './extra3d';

const TAU = Math.PI * 2;

/* ------------------------------ biomas ------------------------------ */

type Ring = 'hills' | 'mountains' | 'dunes' | 'city' | 'forest' | 'candy' | 'space' | 'sea';
type Facade = 'plaster' | 'brick' | 'wood' | 'candy' | 'metal' | 'adobe';
interface Biome {
  sea: boolean;
  /** camada do chão de jogo e tom (cor do vértice) */
  top: keyof typeof TL;
  tint: string;
  /** camada da borda/praia */
  edge: keyof typeof TL;
  edgeTint: string;
  ring: Ring;
  ringTint: string;
  trees: { kind: TreeKind; h: number; trunk: string; leaf: string; leaf2: string; n: number }[];
  bushes: string[];
  flowers: boolean;
  grass: boolean;
  /** caminhos (terra) ou ruas (asfalto) entre as casas */
  paths: 'dirt' | 'road' | 'none' | 'candy' | 'metal';
  props: string[];
  facade: Facade;
  /** hora do dia (jangada skyAt: 0 amanhecer, 0,4 meio-dia, 0,7 tarde, 0,88 noite) */
  tod: number;
  /** cor do mar (raso/fundo) quando diferente */
  seaTint?: [string, string];
  fence: 'wood' | 'rock' | 'rail' | 'hedge' | 'candy' | 'none';
}

const OAK = (n: number): Biome['trees'][number] => ({ kind: 'oak', h: 6.5, trunk: '#6e4a2c', leaf: '#5cb84a', leaf2: '#2f7a3a', n });
const B: Record<MapId, Biome> = {
  vila: { sea: true, top: 'grass', tint: '#8fd35a', edge: 'sand', edgeTint: '#f0dca0', ring: 'hills', ringTint: '#6aa84a', trees: [OAK(10), { kind: 'blossom', h: 5.5, trunk: '#6a4a32', leaf: '#ffb8d8', leaf2: '#e87ab0', n: 5 }], bushes: ['#4a9a3a', '#6ab84a'], flowers: true, grass: true, paths: 'dirt', props: ['bench', 'lamp', 'mailbox', 'car', 'fence'], facade: 'plaster', tod: 0.36, fence: 'wood' },
  praia: { sea: true, top: 'sand', tint: '#f2dca2', edge: 'sand', edgeTint: '#f6e4b0', ring: 'sea', ringTint: '#5aa848', trees: [{ kind: 'palm', h: 8, trunk: '#9a7a52', leaf: '#5ab83a', leaf2: '#2f7a24', n: 14 }], bushes: ['#5aa848'], flowers: false, grass: false, paths: 'none', props: ['umbrella', 'chair', 'surf', 'lamp'], facade: 'plaster', tod: 0.64, fence: 'rail' },
  cidade: { sea: true, top: 'grass', tint: '#7fbf5a', edge: 'gravel', edgeTint: '#a8a8b0', ring: 'city', ringTint: '#8a92a8', trees: [{ kind: 'broad', h: 6, trunk: '#5a4a3a', leaf: '#5aaa48', leaf2: '#2f6a32', n: 6 }], bushes: ['#4a8a3a'], flowers: false, grass: false, paths: 'road', props: ['car', 'car', 'lamp', 'bench', 'hydrant', 'trash', 'cone'], facade: 'brick', tod: 0.42, fence: 'rail' },
  floresta: { sea: false, top: 'forestFloor', tint: '#7ab84a', edge: 'grass', edgeTint: '#6aa83a', ring: 'forest', ringTint: '#3f7a3a', trees: [{ kind: 'pine', h: 9, trunk: '#5a3a26', leaf: '#3f8a4a', leaf2: '#1f5a32', n: 12 }, OAK(6), { kind: 'birch', h: 8, trunk: '#e8e0d0', leaf: '#8ac85a', leaf2: '#4a8a3a', n: 5 }], bushes: ['#3f8a3a', '#5aa848', '#2f6a32'], flowers: true, grass: true, paths: 'dirt', props: ['log', 'rock', 'mushroom', 'fence'], facade: 'wood', tod: 0.34, fence: 'wood' },
  ilha: { sea: true, top: 'grass', tint: '#7fd35a', edge: 'sand', edgeTint: '#f6e2a8', ring: 'sea', ringTint: '#5ab848', trees: [{ kind: 'palm', h: 8.5, trunk: '#9a7a52', leaf: '#5ab83a', leaf2: '#2f7a24', n: 10 }, { kind: 'broad', h: 6, trunk: '#6e4a2c', leaf: '#4fa83a', leaf2: '#2a6a24', n: 4 }], bushes: ['#4a9a3a', '#ff7a8a'], flowers: true, grass: true, paths: 'dirt', props: ['umbrella', 'surf', 'rock'], facade: 'plaster', tod: 0.4, fence: 'rock' },
  montanha: { sea: false, top: 'grass', tint: '#8ac85a', edge: 'stone', edgeTint: '#a0a0a8', ring: 'mountains', ringTint: '#8a8a98', trees: [{ kind: 'pine', h: 9, trunk: '#5a3a26', leaf: '#3f7a4a', leaf2: '#1f4a32', n: 12 }, { kind: 'snowpine', h: 8, trunk: '#5a3a26', leaf: '#3f7a4a', leaf2: '#1f4a32', n: 4 }], bushes: ['#4a8a3a'], flowers: true, grass: true, paths: 'dirt', props: ['fence', 'log', 'rock', 'lamp'], facade: 'wood', tod: 0.3, fence: 'wood' },
  parque: { sea: false, top: 'grass', tint: '#86d35a', edge: 'gravel', edgeTint: '#d8c8a8', ring: 'hills', ringTint: '#7ab84a', trees: [OAK(6), { kind: 'cloud', h: 6, trunk: '#6a4a32', leaf: '#7ac85a', leaf2: '#3a8a3a', n: 4 }], bushes: ['#5aa848', '#ff7ac8'], flowers: true, grass: true, paths: 'candy', props: ['balloon', 'bench', 'lamp', 'cone'], facade: 'plaster', tod: 0.4, fence: 'rail' },
  porto: { sea: true, top: 'gravel', tint: '#b8b0a0', edge: 'stone', edgeTint: '#8a8a90', ring: 'city', ringTint: '#7a8aa0', trees: [{ kind: 'broad', h: 5.5, trunk: '#5a4a3a', leaf: '#5aaa48', leaf2: '#2f6a32', n: 3 }], bushes: ['#4a8a3a'], flowers: false, grass: false, paths: 'road', props: ['crates', 'crates', 'barrel', 'lamp', 'car'], facade: 'brick', tod: 0.62, fence: 'rail' },
  deserto: { sea: false, top: 'sand', tint: '#f0c27a', edge: 'sand', edgeTint: '#e8b06a', ring: 'dunes', ringTint: '#e8a860', trees: [{ kind: 'acacia', h: 5.5, trunk: '#7a5a3a', leaf: '#8ab84a', leaf2: '#5a8a2a', n: 4 }, { kind: 'palm', h: 7, trunk: '#9a7a52', leaf: '#6ab83a', leaf2: '#3a7a24', n: 3 }], bushes: ['#8aa84a'], flowers: false, grass: false, paths: 'none', props: ['cactus', 'cactus', 'rock', 'barrel'], facade: 'adobe', tod: 0.44, fence: 'rock' },
  estacao: { sea: false, top: 'gravel', tint: '#9aa6c8', edge: 'stone', edgeTint: '#7a86a8', ring: 'space', ringTint: '#5a6a98', trees: [], bushes: [], flowers: false, grass: false, paths: 'metal', props: ['antenna', 'crates', 'dish', 'light'], facade: 'metal', tod: 0.9, fence: 'rail' },
  polo: { sea: true, top: 'snow', tint: '#f4f8ff', edge: 'snow', edgeTint: '#e8f0ff', ring: 'mountains', ringTint: '#dfe8f8', trees: [{ kind: 'snowpine', h: 8, trunk: '#5a3a26', leaf: '#3f6a5a', leaf2: '#1f4a3a', n: 10 }], bushes: [], flowers: false, grass: false, paths: 'none', props: ['snowman', 'igloo', 'fence', 'lamp'], facade: 'wood', tod: 0.32, seaTint: ['#2a6a98', '#0a2a58'], fence: 'wood' },
  fazenda: { sea: false, top: 'grass', tint: '#9ad35a', edge: 'dirt', edgeTint: '#a07848', ring: 'hills', ringTint: '#8ac85a', trees: [OAK(8), { kind: 'broad', h: 6, trunk: '#6e4a2c', leaf: '#6ab84a', leaf2: '#3a7a2a', n: 4 }], bushes: ['#5aa848', '#ffd23f'], flowers: true, grass: true, paths: 'dirt', props: ['hay', 'hay', 'fence', 'barrel', 'scarecrow'], facade: 'wood', tod: 0.38, fence: 'wood' },
  doces: { sea: true, top: 'sand', tint: '#ffb4dc', edge: 'sand', edgeTint: '#ffe0f0', ring: 'candy', ringTint: '#ffb8e0', trees: [{ kind: 'cloud', h: 6, trunk: '#fff3fb', leaf: '#ff9ad5', leaf2: '#ff5aa5', n: 6 }, { kind: 'blossom', h: 5.5, trunk: '#fff3fb', leaf: '#9fe8ff', leaf2: '#5ac8ff', n: 4 }], bushes: ['#ff7ac8', '#7ad8ff', '#ffe14d'], flowers: false, grass: false, paths: 'candy', props: ['lollipop', 'lollipop', 'cane', 'gumdrop', 'gumdrop'], facade: 'candy', tod: 0.4, seaTint: ['#ff9ad5', '#c84a9a'], fence: 'candy' },
};
export function biomeOf(id: MapId): Biome {
  return B[id] ?? B.vila;
}

/* ------------------------------ texturas de fachada ------------------------------ */

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t2 = new THREE.CanvasTexture(c);
  if (srgb) t2.colorSpace = THREE.SRGBColorSpace;
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.anisotropy = 4;
  return t2;
}
function noiseFill(x: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, n: number, sz: number): void {
  for (let i = 0; i < n; i++) {
    const v = Math.round(base + (Math.random() - 0.5) * amp);
    x.fillStyle = `rgba(${v},${v},${v},${0.15 + Math.random() * 0.25})`;
    x.fillRect(Math.random() * w, Math.random() * h, sz * (0.5 + Math.random()), sz * (0.5 + Math.random()));
  }
}
const facadeCache = new Map<Facade, THREE.CanvasTexture>();
/** azulejo de parede (≈ 2 m × 2 m), claro: multiplica a cor da casa */
export function facadeTex(f: Facade): THREE.CanvasTexture {
  const c = facadeCache.get(f);
  if (c) return c;
  const t2 = canvasTex(256, 256, (x) => {
    const W = 256;
    if (f === 'brick') {
      x.fillStyle = '#d8d0c8';
      x.fillRect(0, 0, W, W);
      const bh = 16;
      for (let r = 0; r < W / bh; r++) {
        const off = r % 2 ? 24 : 0;
        for (let cc = -1; cc < W / 48 + 1; cc++) {
          const v = 220 + Math.round((Math.random() - 0.5) * 40);
          x.fillStyle = `rgb(${v},${v - 6},${v - 10})`;
          x.fillRect(cc * 48 + off + 2, r * bh + 2, 44, bh - 3);
        }
      }
      noiseFill(x, W, W, 200, 80, 900, 2);
    } else if (f === 'wood') {
      x.fillStyle = '#ece4d8';
      x.fillRect(0, 0, W, W);
      for (let r = 0; r < 8; r++) {
        const v = 236 + Math.round((Math.random() - 0.5) * 22);
        x.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
        x.fillRect(0, r * 32 + 2, W, 28);
        x.fillStyle = 'rgba(80,50,30,.35)';
        x.fillRect(0, r * 32 + 29, W, 3);
        for (let k = 0; k < 6; k++) {
          x.strokeStyle = 'rgba(120,80,50,.12)';
          x.beginPath();
          const yy = r * 32 + 6 + Math.random() * 20;
          x.moveTo(0, yy);
          x.bezierCurveTo(80, yy + 3, 160, yy - 3, W, yy);
          x.stroke();
        }
      }
    } else if (f === 'candy') {
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, W, W);
      x.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 26; i++) {
        x.fillStyle = ['rgba(255,140,200,.28)', 'rgba(120,210,255,.28)', 'rgba(255,225,80,.3)'][i % 3];
        x.beginPath();
        x.arc(Math.random() * W, Math.random() * W, 6 + Math.random() * 8, 0, TAU);
        x.fill();
      }
      // cobertura de glacê no alto (escorrendo)
      x.fillStyle = 'rgba(255,255,255,.9)';
      x.beginPath();
      x.moveTo(0, 0);
      for (let i = 0; i <= 8; i++) x.quadraticCurveTo(i * 32 - 16, 30 + Math.random() * 20, i * 32, 12);
      x.lineTo(W, 0);
      x.fill();
    } else if (f === 'metal') {
      x.fillStyle = '#dfe6f2';
      x.fillRect(0, 0, W, W);
      for (let r = 0; r < 2; r++)
        for (let cc = 0; cc < 2; cc++) {
          const g = x.createLinearGradient(cc * 128, r * 128, cc * 128 + 128, r * 128 + 128);
          g.addColorStop(0, '#f2f6fc');
          g.addColorStop(1, '#c8d2e4');
          x.fillStyle = g;
          x.fillRect(cc * 128 + 3, r * 128 + 3, 122, 122);
          x.fillStyle = '#8a96b0';
          for (const [a, b] of [
            [10, 10],
            [116, 10],
            [10, 116],
            [116, 116],
          ]) {
            x.beginPath();
            x.arc(cc * 128 + a, r * 128 + b, 3, 0, TAU);
            x.fill();
          }
        }
    } else {
      // reboco (plaster) / adobe: manchas suaves + respingos
      x.fillStyle = f === 'adobe' ? '#f2e2c8' : '#f4f0ea';
      x.fillRect(0, 0, W, W);
      noiseFill(x, W, W, f === 'adobe' ? 210 : 225, 60, 1800, 3);
      x.fillStyle = 'rgba(0,0,0,.04)';
      for (let i = 0; i < 14; i++) {
        x.beginPath();
        x.arc(Math.random() * W, Math.random() * W, 14 + Math.random() * 30, 0, TAU);
        x.fill();
      }
    }
  });
  facadeCache.set(f, t2);
  return t2;
}
let winTexC: THREE.CanvasTexture | null = null;
/** janelas de prédio (horizonte da cidade): 4×8 janelas, algumas acesas */
function windowTex(): THREE.CanvasTexture {
  if (winTexC) return winTexC;
  winTexC = canvasTex(128, 256, (x) => {
    x.fillStyle = '#c8cedc';
    x.fillRect(0, 0, 128, 256);
    for (let r = 0; r < 8; r++)
      for (let cc = 0; cc < 4; cc++) {
        const lit = Math.random() < 0.25;
        x.fillStyle = lit ? '#ffe2a0' : Math.random() < 0.5 ? '#5a7aa8' : '#4a6a98';
        x.fillRect(cc * 32 + 6, r * 32 + 7, 20, 20);
        x.fillStyle = 'rgba(255,255,255,.35)';
        x.fillRect(cc * 32 + 6, r * 32 + 7, 20, 4);
      }
  });
  return winTexC;
}

/* ------------------------------ geometria com UV no mundo ------------------------------ */

/** caixa com UV em metros (u ao longo da face, v na altura) + cor por vértice */
export function boxUV(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: THREE.Color, tile = 2): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const y = pos.getY(i) + cy;
    const z = pos.getZ(i) + cz;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  g.translate(cx, cy, cz);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    // oclusão barata: base um pouco mais escura
    const ao = 0.82 + 0.18 * Math.min(1, Math.max(0, (pos.getY(i) + 0.05) / 1.4));
    arr[i * 3] = col.r * ao;
    arr[i * 3 + 1] = col.g * ao;
    arr[i * 3 + 2] = col.b * ao;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
/** geometria qualquer com cor (para os adereços) */
function colored(src: THREE.BufferGeometry, col: string | THREE.Color, m?: THREE.Matrix4): THREE.BufferGeometry {
  const g = (src.index ? src.toNonIndexed() : src.clone()) as THREE.BufferGeometry;
  if (m) g.applyMatrix4(m);
  const c = new THREE.Color(col);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}
const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();
function mtx(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  return M4.compose(V1.set(x, y, z), Q.setFromEuler(new THREE.Euler(rx, ry, rz)), V2.set(sx, sy, sz)).clone();
}

/* ------------------------------ adereços ------------------------------ */

const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  sph: new THREE.SphereGeometry(0.5, 12, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  tor: new THREE.TorusGeometry(0.4, 0.12, 6, 14),
};
/** monta um adereço (geometria em coordenadas locais, base no chão) */
function propGeo(kind: string, r: () => number, accent: string): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  const P = (g: THREE.BufferGeometry, col: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0, rx = 0, rz = 0) => parts.push(colored(g, col, mtx(x, y, z, ry, sx, sy, sz, rx, rz)));
  switch (kind) {
    case 'car': {
      const c = accent;
      P(G.box, c, 0, 0.55, 0, 1.7, 0.6, 3.6);
      P(G.box, c, 0, 1.05, -0.2, 1.5, 0.55, 1.9);
      P(G.box, '#bfe6ff', 0, 1.05, -0.2, 1.52, 0.4, 1.6);
      P(G.box, '#2a2a38', 0, 0.42, 1.82, 1.6, 0.25, 0.08);
      P(G.box, '#ffe9a0', -0.55, 0.62, 1.81, 0.3, 0.16, 0.06);
      P(G.box, '#ffe9a0', 0.55, 0.62, 1.81, 0.3, 0.16, 0.06);
      P(G.box, '#ff5050', -0.6, 0.62, -1.81, 0.3, 0.14, 0.06);
      P(G.box, '#ff5050', 0.6, 0.62, -1.81, 0.3, 0.14, 0.06);
      for (const [x, z] of [
        [-0.85, 1.15],
        [0.85, 1.15],
        [-0.85, -1.15],
        [0.85, -1.15],
      ])
        P(G.cyl, '#1e1e26', x, 0.34, z, 0.68, 0.3, 0.68, 0, 0, Math.PI / 2);
      break;
    }
    case 'bench':
      P(G.box, '#b8864f', 0, 0.45, 0, 1.8, 0.08, 0.5);
      P(G.box, '#b8864f', 0, 0.8, -0.22, 1.8, 0.35, 0.06);
      P(G.box, '#3a3a48', -0.75, 0.22, 0, 0.08, 0.45, 0.45);
      P(G.box, '#3a3a48', 0.75, 0.22, 0, 0.08, 0.45, 0.45);
      break;
    case 'lamp':
    case 'light':
      P(G.cyl6, '#3a3a52', 0, 1.6, 0, 0.12, 3.2, 0.12);
      P(G.box, '#3a3a52', 0.25, 3.2, 0, 0.6, 0.08, 0.1);
      P(G.sph, '#fff2c0', 0.5, 3.05, 0, 0.36, 0.3, 0.36);
      break;
    case 'mailbox':
      P(G.box, '#6a4a2a', 0, 0.5, 0, 0.1, 1, 0.1);
      P(G.box, accent, 0, 1.1, 0, 0.35, 0.3, 0.55);
      break;
    case 'hydrant':
      P(G.cyl, '#ff4a3a', 0, 0.35, 0, 0.34, 0.7, 0.34);
      P(G.sph, '#ff4a3a', 0, 0.72, 0, 0.36, 0.3, 0.36);
      P(G.cyl, '#ff4a3a', 0, 0.45, 0, 0.6, 0.12, 0.12, 0, 0, Math.PI / 2);
      break;
    case 'trash':
      P(G.cyl, '#3f8a5a', 0, 0.45, 0, 0.6, 0.9, 0.6);
      P(G.cyl, '#2f6a44', 0, 0.92, 0, 0.66, 0.06, 0.66);
      break;
    case 'cone':
      P(G.cone, '#ff8a2a', 0, 0.35, 0, 0.5, 0.7, 0.5);
      P(G.box, '#ffffff', 0, 0.42, 0, 0.36, 0.08, 0.36);
      P(G.box, '#ff8a2a', 0, 0.02, 0, 0.6, 0.04, 0.6);
      break;
    case 'umbrella': {
      P(G.cyl6, '#f4f4f4', 0, 1.2, 0, 0.06, 2.4, 0.06);
      const cols = [accent, '#ffffff'];
      for (let i = 0; i < 8; i++) {
        const g = new THREE.ConeGeometry(1.4, 0.55, 2, 1, true, (i / 8) * TAU, TAU / 8);
        parts.push(colored(g, cols[i % 2], mtx(0, 2.45, 0)));
        g.dispose();
      }
      break;
    }
    case 'chair':
      P(G.box, accent, 0, 0.3, 0, 0.6, 0.06, 1.2, 0, -0.15);
      P(G.box, accent, 0, 0.6, -0.55, 0.6, 0.06, 0.6, 0, 1.0);
      P(G.box, '#ffffff', 0, 0.15, 0, 0.62, 0.3, 0.04);
      break;
    case 'surf':
      P(G.sph, accent, 0, 1.0, 0, 0.55, 2.2, 0.12, 0, 0, 0.12);
      P(G.box, '#ffffff', 0, 1.0, 0.05, 0.08, 1.8, 0.02, 0, 0, 0.12);
      break;
    case 'crates':
      P(G.box, '#c98a4a', 0, 0.45, 0, 0.9, 0.9, 0.9);
      P(G.box, '#a8743f', 0.95, 0.45, 0.1, 0.9, 0.9, 0.9, 0.2);
      P(G.box, '#c98a4a', 0.4, 1.35, 0.05, 0.9, 0.9, 0.9, -0.3);
      break;
    case 'barrel':
      P(G.cyl, accent, 0, 0.55, 0, 0.8, 1.1, 0.8);
      P(G.cyl, '#3a3a48', 0, 0.25, 0, 0.82, 0.06, 0.82);
      P(G.cyl, '#3a3a48', 0, 0.85, 0, 0.82, 0.06, 0.82);
      break;
    case 'log':
      P(G.cyl, '#7a5233', 0, 0.35, 0, 0.7, 2.6, 0.7, r() * 3, 0, Math.PI / 2);
      break;
    case 'mushroom':
      P(G.cyl, '#fff3e8', 0, 0.35, 0, 0.3, 0.7, 0.3);
      P(G.sph, '#ff4a4a', 0, 0.75, 0, 1.0, 0.55, 1.0);
      P(G.sph, '#ffffff', 0.2, 0.92, 0.15, 0.16, 0.08, 0.16);
      P(G.sph, '#ffffff', -0.2, 0.9, -0.1, 0.13, 0.07, 0.13);
      break;
    case 'balloon':
      P(G.cyl6, '#ffffff', 0, 1.2, 0, 0.02, 2.4, 0.02);
      P(G.sph, accent, 0, 2.7, 0, 0.8, 0.95, 0.8);
      break;
    case 'cactus':
      P(G.cyl, '#4a9a3a', 0, 1.2, 0, 0.6, 2.4, 0.6);
      P(G.sph, '#4a9a3a', 0, 2.4, 0, 0.6, 0.5, 0.6);
      P(G.cyl, '#4a9a3a', 0.55, 1.4, 0, 0.36, 0.9, 0.36, 0, 0, Math.PI / 2);
      P(G.cyl, '#4a9a3a', 0.85, 1.8, 0, 0.34, 0.9, 0.34);
      P(G.sph, '#ff7ac8', 0, 2.62, 0, 0.25, 0.18, 0.25);
      break;
    case 'antenna':
      P(G.cyl6, '#a8b0c8', 0, 2, 0, 0.12, 4, 0.12);
      P(G.sph, '#ff3355', 0, 4.1, 0, 0.25, 0.25, 0.25);
      P(G.box, '#a8b0c8', 0, 3, 0, 1.2, 0.06, 0.06);
      break;
    case 'dish':
      P(G.cyl6, '#a8b0c8', 0, 0.7, 0, 0.2, 1.4, 0.2);
      P(G.sph, '#e8eef8', 0, 1.6, 0, 1.8, 0.5, 1.8, 0, 0.6);
      break;
    case 'snowman':
      P(G.sph, '#ffffff', 0, 0.5, 0, 1.0, 1.0, 1.0);
      P(G.sph, '#ffffff', 0, 1.25, 0, 0.72, 0.72, 0.72);
      P(G.sph, '#ffffff', 0, 1.8, 0, 0.5, 0.5, 0.5);
      P(G.cone, '#ff8a2a', 0, 1.82, 0.28, 0.08, 0.3, 0.08, 0, Math.PI / 2);
      P(G.cyl, '#2a2a38', 0, 2.1, 0, 0.36, 0.3, 0.36);
      P(G.box, '#ff3355', 0, 1.55, 0, 0.62, 0.1, 0.62);
      break;
    case 'igloo': {
      const g = new THREE.SphereGeometry(1.4, 14, 8, 0, TAU, 0, Math.PI / 2);
      parts.push(colored(g, '#eef6ff', mtx(0, 0, 0)));
      g.dispose();
      P(G.box, '#dde8f8', 0, 0.45, 1.3, 0.8, 0.9, 0.7);
      break;
    }
    case 'hay':
      P(G.cyl, '#e8c25a', 0, 0.55, 0, 1.3, 1.1, 1.3, 0, 0, Math.PI / 2);
      P(G.cyl, '#c89a3a', 0, 0.55, 0, 1.32, 0.08, 1.32, 0, 0, Math.PI / 2);
      break;
    case 'scarecrow':
      P(G.box, '#7a5233', 0, 1.1, 0, 0.12, 2.2, 0.12);
      P(G.box, '#7a5233', 0, 1.6, 0, 1.6, 0.1, 0.1);
      P(G.box, '#3f7acf', 0, 1.4, 0, 0.6, 0.7, 0.3);
      P(G.sph, '#f4d48a', 0, 2.05, 0, 0.45, 0.45, 0.45);
      P(G.cone, '#c89a3a', 0, 2.35, 0, 0.7, 0.4, 0.7);
      break;
    case 'lollipop':
      P(G.cyl6, '#ffffff', 0, 1.3, 0, 0.12, 2.6, 0.12);
      P(G.cyl, accent, 0, 3.0, 0, 1.6, 0.25, 1.6, 0, Math.PI / 2);
      P(G.tor, '#ffffff', 0, 3.0, 0.14, 1.4, 1.4, 0.6);
      break;
    case 'cane': {
      for (let i = 0; i < 6; i++) P(G.cyl6, i % 2 ? '#ffffff' : '#ff3d5a', 0, 0.25 + i * 0.5, 0, 0.2, 0.5, 0.2);
      const g = new THREE.TorusGeometry(0.4, 0.1, 6, 12, Math.PI);
      parts.push(colored(g, '#ff3d5a', mtx(0.4, 3.0, 0)));
      g.dispose();
      break;
    }
    case 'gumdrop':
      P(G.sph, accent, 0, 0.35, 0, 1.2, 1.0, 1.2);
      P(G.cyl, accent, 0, 0.12, 0, 1.2, 0.25, 1.2);
      break;
    case 'rock': {
      const g = natureRock(Math.floor(r() * 9) + 1, '#7a8a5a', 0.3);
      parts.push(colored(g, '#9a9aa5', mtx(0, 0, 0, r() * 3, 1 + r(), 0.7 + r() * 0.6, 1 + r())));
      break;
    }
    case 'fence':
      for (let i = 0; i < 3; i++) P(G.box, '#c8a070', -1 + i, 0.5, 0, 0.12, 1, 0.12);
      P(G.box, '#d8b080', 0, 0.75, 0, 2.3, 0.1, 0.06);
      P(G.box, '#d8b080', 0, 0.4, 0, 2.3, 0.1, 0.06);
      break;
    default:
      return null;
  }
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return m;
}

/* ------------------------------ fluido estilizado ------------------------------ */

const FLUID_VS = /* glsl */ `
varying vec3 vW; varying vec3 vC; varying vec3 vN;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vC = color; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FLUID_FS = /* glsl */ `
uniform float uTime; uniform vec3 uDeep; uniform vec3 uShal; uniform vec3 uSky; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunC;
uniform float uEmis; uniform float uOpa; uniform float uSpec; uniform float uFlow; uniform sampler2D uNrm; uniform vec3 uFog; uniform float uFogD; uniform float uKind;
varying vec3 vW; varying vec3 vC; varying vec3 vN;
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec2 p = vW.xz;
  vec3 n1 = texture2D(uNrm, p * 0.07 + uTime * vec2(0.03, 0.02) * uFlow).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(uNrm, p * 0.21 - uTime * vec2(0.025, 0.04) * uFlow).xyz * 2.0 - 1.0;
  vec3 N = normalize(vN + vec3(n1.x + n2.x, 0.0, n1.y + n2.y) * 0.32);
  float F = 0.03 + 0.97 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 R = reflect(-V, N);
  vec3 refl = mix(uHor, uSky, clamp(R.y * 1.6, 0.0, 1.0));
  float foam = clamp(vC.r, 0.0, 1.0);
  vec3 body = mix(uDeep, uShal, 0.45 + 0.35 * n1.z);
  vec3 col;
  if (uKind > 1.5) {
    // lava: brilho que pulsa + crosta escura em placas
    float cr = smoothstep(0.55, 0.75, texture2D(uNrm, p * 0.05 + uTime * 0.006).a);
    float hot = 0.6 + 0.4 * sin(uTime * 2.0 + p.x * 0.4) * sin(p.y * 0.5 - uTime * 1.3);
    col = mix(uShal * (1.2 + hot * 0.6), uDeep * 0.35, cr * 0.85) + uShal * foam * 0.6;
  } else if (uKind > 0.5) {
    // opaco/fosco (neve, lama, chocolate): luz difusa simples
    float d = 0.55 + 0.45 * max(dot(N, normalize(uSun)), 0.0);
    col = body * d + vec3(1.0) * foam * 0.4;
    col += uSunC * pow(max(dot(R, normalize(uSun)), 0.0), 40.0) * min(uSpec, 1.0);
    if (uSpec > 1.5) {
      // chocolate brilhante: reflexo fraco tingido + brilho estreito e forte (cobertura de bolo)
      col = mix(col, refl * body * 2.2, F * 0.45);
      col += uSunC * pow(max(dot(R, normalize(uSun)), 0.0), 160.0) * uSpec;
      col += vec3(1.0, 0.85, 0.7) * pow(1.0 - max(dot(N, V), 0.0), 3.0) * 0.12;
    }
  } else {
    col = mix(body, refl, F * 0.8);
    col += uSunC * pow(max(dot(R, normalize(uSun)), 0.0), 120.0) * uSpec * 2.0;
    col = mix(col, vec3(0.97, 0.99, 1.0), foam * 0.9);
  }
  col += uShal * uEmis;
  float fd = length(cameraPosition - vW) * uFogD;
  col = mix(col, uFog, clamp(1.0 - exp(-fd * fd), 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(uOpa + F * 0.3 + foam * 0.5, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export interface FluidLook {
  deep: string;
  shal: string;
  opa: number;
  emis: number;
  spec: number;
  flow: number;
  /** 0 = água (reflexo), 1 = fosco, 2 = lava */
  kind: number;
}
export const FLUID_LOOK: Record<string, FluidLook> = {
  water: { deep: '#0e4a8a', shal: '#3ab6e8', opa: 0.72, emis: 0, spec: 1, flow: 1, kind: 0 },
  jelly: { deep: '#c82a8a', shal: '#ff8ad0', opa: 0.8, emis: 0.12, spec: 1.2, flow: 0.6, kind: 0 },
  bubble: { deep: '#a8d8f8', shal: '#ffffff', opa: 0.9, emis: 0.15, spec: 0.8, flow: 0.4, kind: 1 },
  choco: { deep: '#3a1808', shal: '#8a4e26', opa: 1, emis: 0.04, spec: 2.2, flow: 0.35, kind: 1 },
  goo: { deep: '#2a8a2a', shal: '#9af04a', opa: 0.92, emis: 0.25, spec: 0.9, flow: 0.5, kind: 0 },
  lava: { deep: '#3a0a04', shal: '#ff7a1a', opa: 1, emis: 0.9, spec: 0, flow: 0.25, kind: 2 },
  snow: { deep: '#c8d8f0', shal: '#ffffff', opa: 1, emis: 0.05, spec: 0.2, flow: 0, kind: 1 },
  mud: { deep: '#4a2e16', shal: '#8a6440', opa: 1, emis: 0, spec: 0.3, flow: 0.3, kind: 1 },
};

/* ------------------------------ partículas de clima ------------------------------ */

class Weather {
  rain: THREE.LineSegments;
  snow: THREE.Points;
  embers: THREE.Points;
  private rv: Float32Array;
  constructor(scene: THREE.Scene, tier: Tier) {
    const nR = [300, 600, 1000, 1400][tier];
    const rg = new THREE.BufferGeometry();
    this.rv = new Float32Array(nR * 3);
    for (let i = 0; i < nR; i++) {
      this.rv[i * 3] = (Math.random() - 0.5) * 50;
      this.rv[i * 3 + 1] = Math.random() * 24;
      this.rv[i * 3 + 2] = (Math.random() - 0.5) * 50;
    }
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nR * 6), 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xb8d0f0, transparent: true, opacity: 0.45, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
    const mk = (n: number, size: number, color: number, add: boolean, map: THREE.Texture) => {
      const g = new THREE.BufferGeometry();
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        a[i * 3] = (Math.random() - 0.5) * 50;
        a[i * 3 + 1] = Math.random() * 20;
        a[i * 3 + 2] = (Math.random() - 0.5) * 50;
      }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      const p = new THREE.Points(g, new THREE.PointsMaterial({ map, color, size, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      p.frustumCulled = false;
      p.visible = false;
      scene.add(p);
      return p;
    };
    this.snow = mk([250, 500, 800, 1100][tier], 0.22, 0xffffff, false, softSprite());
    this.embers = mk([80, 160, 260, 360][tier], 0.28, 0xffa040, true, softSprite());
  }
  update(dt: number, cx: number, cz: number, wind: number, rain: number, snow: number, embers: number): void {
    this.rain.visible = rain > 0.01;
    if (this.rain.visible) {
      const a = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
      const o = a.array as Float32Array;
      const rv = this.rv;
      const n = rv.length / 3;
      for (let i = 0; i < n; i++) {
        rv[i * 3 + 1] -= dt * 22;
        rv[i * 3] += wind * dt * 3;
        if (rv[i * 3 + 1] < 0) {
          rv[i * 3 + 1] += 24;
          rv[i * 3] = (Math.random() - 0.5) * 50;
          rv[i * 3 + 2] = (Math.random() - 0.5) * 50;
        }
        const x = cx + rv[i * 3];
        const y = rv[i * 3 + 1];
        const z = cz + rv[i * 3 + 2];
        o[i * 6] = x;
        o[i * 6 + 1] = y;
        o[i * 6 + 2] = z;
        o[i * 6 + 3] = x - wind * 0.08;
        o[i * 6 + 4] = y + 0.7;
        o[i * 6 + 5] = z;
      }
      a.needsUpdate = true;
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.45 * rain;
    }
    const drift = (p: THREE.Points, vy: number, sw: number, on: number) => {
      p.visible = on > 0.01;
      if (!p.visible) return;
      const a = p.geometry.getAttribute('position') as THREE.BufferAttribute;
      const o = a.array as Float32Array;
      const n = o.length / 3;
      for (let i = 0; i < n; i++) {
        o[i * 3] += (wind * 2 + Math.sin(i + o[i * 3 + 1]) * sw) * dt;
        o[i * 3 + 1] += vy * dt * (0.6 + (i % 5) * 0.12);
        if (o[i * 3 + 1] < 0 || o[i * 3 + 1] > 22 || Math.abs(o[i * 3] - cx) > 26 || Math.abs(o[i * 3 + 2] - cz) > 26) {
          o[i * 3] = cx + (Math.random() - 0.5) * 50;
          o[i * 3 + 1] = vy < 0 ? 20 : Math.random() * 2;
          o[i * 3 + 2] = cz + (Math.random() - 0.5) * 50;
        }
      }
      a.needsUpdate = true;
      (p.material as THREE.PointsMaterial).opacity = on;
    };
    drift(this.snow, -2.6, 0.8, snow);
    drift(this.embers, 2.2, 1.6, embers);
  }
}

/* ------------------------------ ambiente ------------------------------ */

export interface EnvHost {
  scene: THREE.Scene;
  level: THREE.Group;
  statics: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; oneWay?: boolean; ground?: boolean }[];
  solid(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: string | number, oneWay?: boolean, visible?: boolean): void;
  houses: { x: number; z: number; w: number; d: number }[];
}

export class Env3D {
  sky: Sky;
  ocean: Ocean | null = null;
  cols: SkyCols;
  biome: Biome = B.vila;
  tod = 0.4;
  private tier: Tier;
  private scene: THREE.Scene;
  private grass: GrassField | null = null;
  private blobs: BlobShadows | null = null;
  private weather: Weather;
  private group = new THREE.Group();
  private nrm: THREE.DataTexture;
  fluidMat: THREE.ShaderMaterial;
  wallMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  lampMat: THREE.MeshBasicMaterial;
  private seaY = -0.55;
  /** maré visual do mar (o tsunami recua o mar antes da onda) */
  seaLift = 0;
  private planet: THREE.Mesh | null = null;
  /** materiais que acendem de noite (postes, janelas do horizonte) */
  private litMats: THREE.MeshStandardMaterial[] = [];
  night = 0;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, tier: Tier) {
    this.scene = scene;
    this.tier = tier;
    natureAnisotropy(renderer);
    this.sky = new Sky(tier);
    scene.add(this.sky.group);
    this.cols = skyAt(0.4, 0);
    this.weather = new Weather(scene, tier);
    scene.add(this.group);
    this.nrm = waterTex(tier <= 1 ? 128 : 256);
    this.fluidMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color() },
        uShal: { value: new THREE.Color() },
        uSky: { value: new THREE.Color() },
        uHor: { value: new THREE.Color() },
        uSun: { value: new THREE.Vector3(0.5, 0.8, 0.3) },
        uSunC: { value: new THREE.Color() },
        uEmis: { value: 0 },
        uOpa: { value: 0.8 },
        uSpec: { value: 1 },
        uFlow: { value: 1 },
        uKind: { value: 0 },
        uNrm: { value: this.nrm },
        uFog: { value: new THREE.Color() },
        uFogD: { value: 0.006 },
      },
      vertexShader: FLUID_VS,
      fragmentShader: FLUID_FS,
      vertexColors: true,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });
    this.wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, map: facadeTex('plaster') });
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0x8ac8f0, roughness: 0.08, metalness: 0.35, emissive: 0xffd88a, emissiveIntensity: 0 });
    this.lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
    // morro: material de terreno (topo de grama, paredes de pedra pela normal)
    this.stoneMat = terrainMaterial({ tier, noSplat: true, topLayer: 'grass' }) as unknown as THREE.MeshStandardMaterial;
    const gr = natureTexture('grass').clone();
    gr.wrapS = gr.wrapT = THREE.RepeatWrapping;
    this.grassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: gr });
  }
  stoneMat: THREE.MeshStandardMaterial;
  grassMat: THREE.MeshStandardMaterial;

  /** visual do fluido (água, lava...) para o material da superfície */
  setFluid(skin: string): void {
    const L = FLUID_LOOK[skin] ?? FLUID_LOOK.water;
    const u = this.fluidMat.uniforms;
    u.uDeep.value.set(L.deep);
    u.uShal.value.set(L.shal);
    u.uOpa.value = this.tier <= 0 ? Math.max(0.85, L.opa) : L.opa;
    u.uEmis.value = L.emis;
    u.uSpec.value = L.spec;
    u.uFlow.value = L.flow;
    u.uKind.value = L.kind;
  }

  private clear(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mt = m.material as THREE.Material;
      if (mt !== this.wallMat && mt !== this.glassMat && mt !== this.lampMat && mt !== this.stoneMat && mt !== this.grassMat) mt.dispose();
    });
    this.group.clear();
    (this.grass as unknown as { dispose?: () => void } | null)?.dispose?.();
    this.grass = null;
    this.blobs?.dispose();
    this.blobs = null;
    if (this.ocean) {
      this.scene.remove(this.ocean.mesh);
      this.ocean.dispose();
      this.ocean = null;
    }
    this.planet = null;
    this.litMats = [];
  }

  /**
   * Monta o ambiente do mapa em volta do que o jogo já construiu (casas, torres, morro):
   * terreno, mar, horizonte, vegetação, adereços e a cerca da borda (com colisão invisível).
   */
  build(sc: Scenario, r: () => number, host: EnvHost, R: number): void {
    this.clear();
    const b = (this.biome = biomeOf(sc.map.id));
    const tn = sc.tune;
    this.tod = tn?.night || tn?.fog ? 0.89 : b.tod;
    this.cols = skyAt(this.tod, 0, this.cols);
    this.wallMat.map = facadeTex(b.facade);
    this.wallMat.needsUpdate = true;
    // ---- mar (Jangada) ----
    if (b.sea) {
      this.ocean = new Ocean(this.tier, this.sky.cloudTex);
      this.scene.add(this.ocean.mesh);
      this.ocean.setIsles([{ x: 0, z: 0, r: (R + 3) / 0.82, ph0: r() * 6, ph1: r() * 6, peak: 1.2 }]);
    }
    const blocked = (x: number, z: number, m = 0.6) => host.statics.some((s) => s.y1 > 0.05 && !s.ground && x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m);
    // ---- caminhos/ruas: do centro até cada casa (pintados no terreno por vértice) ----
    const paths: [number, number, number, number][] = [];
    if (b.paths !== 'none') for (const h of host.houses) paths.push([0, 0, h.x, h.z - h.d / 2 - 1.2]);
    const pathD = (x: number, z: number) => {
      let best = 99;
      for (const [ax, az, bx, bz] of paths) {
        const vx = bx - ax;
        const vz = bz - az;
        const l2 = vx * vx + vz * vz || 1;
        const tt = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
        best = Math.min(best, Math.hypot(x - ax - vx * tt, z - az - vz * tt));
      }
      return best;
    };
    const pathW = b.paths === 'road' ? 2.2 : 1.1;
    // ---- terreno (anéis polares: denso perto, ralo longe) ----
    const rings: number[] = [];
    const span = b.sea ? R + 30 : 170;
    for (let rr = 0; rr <= span; ) {
      rings.push(rr);
      rr += rr < R - 4 ? 1.4 : rr < R + 8 ? 0.8 : rr < 70 ? 3 : 8;
    }
    const segs = this.tier <= 0 ? 72 : 112;
    const nV = rings.length * segs;
    const pos = new Float32Array(nV * 3);
    const col = new Float32Array(nV * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const SP = splatAttributes(geo, nV);
    const w = new Float32Array(NL);
    const cTop = new THREE.Color(b.tint);
    const cEdge = new THREE.Color(b.edgeTint);
    const cRing = new THREE.Color(b.ringTint);
    const cPath = new THREE.Color(b.paths === 'road' ? '#5a5e6a' : b.paths === 'candy' ? '#ffe0a0' : b.paths === 'metal' ? '#7a86a8' : '#b08a5a');
    const cc = new THREE.Color();
    const ph = r() * 6;
    const hAt = (x: number, z: number, rr: number) => {
      const a = Math.atan2(z, x);
      if (rr <= R + 0.4) return 0;
      if (b.sea) {
        // praia: desce até o mar (largura varia em volta da ilha)
        const re = R + 3 + 4 * (0.5 + 0.5 * Math.sin(3 * a + ph)) + 2 * Math.sin(5 * a + ph * 1.7);
        if (rr < re) return -((rr - R) / (re - R)) * 0.8;
        return -0.8 - Math.min(7, (rr - re) * 0.45);
      }
      // terra: barranco suave na borda e relevo para fora
      const bank = Math.min(1, (rr - R) / 3) * 1.4;
      const far = Math.max(0, rr - R - 6);
      const n = Math.sin(a * 5 + ph) * 0.5 + Math.sin(a * 11 + ph * 2) * 0.25 + Math.sin(a * 2.3 + rr * 0.05) * 0.5;
      const amp = b.ring === 'mountains' ? 0.32 : b.ring === 'dunes' ? 0.1 : b.ring === 'forest' ? 0.08 : b.ring === 'space' ? 0 : 0.12;
      return bank + far * (0.05 + amp * (0.9 + n)) + (b.ring === 'dunes' ? Math.sin(rr * 0.12 + a * 3) * Math.min(6, far * 0.2) : 0);
    };
    for (let i = 0; i < rings.length; i++) {
      const rr = rings[i];
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * TAU + (i % 2 ? Math.PI / segs : 0);
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        const y = hAt(x, z, rr);
        const v = i * segs + s;
        pos[v * 3] = x;
        pos[v * 3 + 1] = y;
        pos[v * 3 + 2] = z;
        w.fill(0);
        const inPlay = rr <= R + 0.4;
        const pd = inPlay ? pathD(x, z) : 99;
        const n = Math.sin(x * 0.31 + z * 0.17) * Math.sin(z * 0.23 - x * 0.11);
        if (inPlay) {
          w[TL[b.top]] = 1;
          cc.copy(cTop).multiplyScalar(0.92 + 0.12 * n);
          if ((b.top === 'grass' || b.top === 'forestFloor') && b.ring !== 'candy') {
            if (n > 0.35) w[TL.dryGrass] = (n - 0.35) * 1.4;
            if (n < -0.6) w[TL.dirt] = (-n - 0.6) * 2;
          }
          if (pd < pathW) {
            const k = 1 - pd / pathW;
            w.fill(0);
            const pl = b.paths === 'road' || b.paths === 'metal' ? TL.stone : b.paths === 'candy' ? TL.sand : TL.dirt;
            w[pl] = 1;
            cc.lerp(cPath, Math.min(1, k * 1.6));
          }
          // borda do chão de jogo: mistura com a da praia/barranco
          if (rr > R - 2.5) {
            const k = (rr - (R - 2.5)) / 2.9;
            w[TL[b.edge]] += k * 2;
            cc.lerp(cEdge, k);
          }
        } else if (b.sea) {
          w[TL[b.edge]] = 1;
          cc.copy(cEdge);
          if (y < -0.9) {
            w[TL.sand] = 1;
            cc.multiplyScalar(0.8);
          }
        } else {
          const k = Math.min(1, (rr - R) / 18);
          w[TL[b.edge]] = 1 - k;
          const far = b.ring === 'mountains' ? (y > 22 ? 'snow' : y > 9 ? 'stone' : 'grass') : b.ring === 'dunes' ? 'sand' : b.ring === 'space' ? 'gravel' : b.ring === 'forest' ? 'forestFloor' : b.top === 'snow' ? 'snow' : 'grass';
          w[TL[far as keyof typeof TL]] += k + 0.01;
          cc.copy(cEdge).lerp(far === 'snow' ? cc.set('#f4f8ff') : far === 'stone' ? cc.set('#9a98a5') : cRing, k);
          if (b.ring === 'mountains' && y > 22) cc.set('#f6f9ff');
        }
        setSplat(SP, v, w);
        col[v * 3] = cc.r;
        col[v * 3 + 1] = cc.g;
        col[v * 3 + 2] = cc.b;
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < rings.length - 1; i++)
      for (let s = 0; s < segs; s++) {
        const a0 = i * segs + s;
        const a1 = i * segs + ((s + 1) % segs);
        const b0 = (i + 1) * segs + s;
        const b1 = (i + 1) * segs + ((s + 1) % segs);
        idx.push(a0, a1, b0, a1, b1, b0);
      }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tm = terrainMaterial({ tier: this.tier });
    const terr = new THREE.Mesh(geo, tm);
    terr.receiveShadow = true;
    this.group.add(terr);

    // ---- piso de metal da estação espacial (placas com luzes azuis) ----
    if (b.paths === 'metal') {
      const deck = canvasTex(256, 256, (x) => {
        x.fillStyle = '#5a6488';
        x.fillRect(0, 0, 256, 256);
        for (let r2 = 0; r2 < 4; r2++)
          for (let c2 = 0; c2 < 4; c2++) {
            const v = 120 + Math.round(Math.random() * 30);
            x.fillStyle = `rgb(${v - 20},${v - 10},${v + 30})`;
            x.fillRect(c2 * 64 + 2, r2 * 64 + 2, 60, 60);
            x.fillStyle = 'rgba(255,255,255,.12)';
            x.fillRect(c2 * 64 + 2, r2 * 64 + 2, 60, 6);
            x.fillStyle = '#3a4466';
            for (const [a2, b2] of [
              [8, 8],
              [56, 8],
              [8, 56],
              [56, 56],
            ]) {
              x.beginPath();
              x.arc(c2 * 64 + a2, r2 * 64 + b2, 2.5, 0, TAU);
              x.fill();
            }
          }
        x.fillStyle = '#7ae0ff';
        x.fillRect(0, 126, 256, 4);
        x.fillRect(126, 0, 4, 256);
      });
      deck.repeat.set(R / 4, R / 4);
      const dm = new THREE.Mesh(new THREE.CircleGeometry(R + 0.3, 64), new THREE.MeshStandardMaterial({ map: deck, roughness: 0.45, metalness: 0.55, emissive: 0x2a6aa8, emissiveMap: deck, emissiveIntensity: 0.35 }));
      dm.rotation.x = -Math.PI / 2;
      dm.position.y = 0.012;
      dm.receiveShadow = true;
      this.group.add(dm);
    }
    // ---- cerca da borda (+ colisão invisível: ninguém sai da ilha) ----
    const nPost = Math.round((TAU * R) / 2.4);
    const fenceParts: THREE.BufferGeometry[] = [];
    const fenceCol = b.fence === 'candy' ? '#ff7ac8' : b.fence === 'rail' ? '#d8dce8' : b.fence === 'rock' ? '#9a9aa5' : '#c8a070';
    for (let i = 0; i < nPost; i++) {
      const a = (i / nPost) * TAU;
      const x = Math.cos(a) * (R + 0.2);
      const z = Math.sin(a) * (R + 0.2);
      if (blocked(x, z, 0.3)) continue;
      if (b.fence === 'rock') fenceParts.push(colored(natureRock(1 + (i % 7), '#7a8a5a', 0.4), '#a0a0aa', mtx(x, 0, z, a, 1.1, 0.8, 1.1)));
      else if (b.fence !== 'none') {
        fenceParts.push(colored(G.box, fenceCol, mtx(x, 0.55, z, -a, 0.14, 1.1, 0.14)));
        const a2 = ((i + 0.5) / nPost) * TAU;
        fenceParts.push(colored(G.box, b.fence === 'candy' ? (i % 2 ? '#ffffff' : '#ff3d8b') : fenceCol, mtx(Math.cos(a2) * (R + 0.2), 0.8, Math.sin(a2) * (R + 0.2), -a2 + Math.PI / 2, 2.5, 0.09, 0.06)));
        fenceParts.push(colored(G.box, fenceCol, mtx(Math.cos(a2) * (R + 0.2), 0.45, Math.sin(a2) * (R + 0.2), -a2 + Math.PI / 2, 2.5, 0.09, 0.06)));
      }
    }
    if (fenceParts.length) this.addMerged(fenceParts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true);
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      const x = Math.cos(a) * (R + 0.6);
      const z = Math.sin(a) * (R + 0.6);
      const half = (TAU * (R + 0.6)) / 28 / 2 + 0.2;
      const ca = Math.abs(Math.cos(a));
      const sa = Math.abs(Math.sin(a));
      host.solid(x - half * sa - 0.4 * ca, -1, z - half * ca - 0.4 * sa, x + half * sa + 0.4 * ca, 2.6, z + half * ca + 0.4 * sa, 0, false, false);
    }

    // ---- horizonte ----
    this.ring(b, r, R);

    // ---- vegetação (fora das casas/caminhos) ----
    const nq = natureQ(this.tier);
    this.blobs = new BlobShadows(this.group, 128, nq.blobAlpha);
    this.blobs.begin();
    const tmat = natureMat({ amp: 0.003, y0: 1.2, rustle: 0.02, wrap: 0.45 });
    const treeK = this.tier <= 0 ? 0.55 : this.tier === 1 ? 0.75 : 1;
    for (const sp of b.trees) {
      const g = natureTree({ kind: sp.kind, h: sp.h, trunk: sp.trunk, leaf: sp.leaf, leaf2: sp.leaf2, seed: Math.floor(r() * 99), lod: this.tier <= 1 ? 1 : 0 });
      const xf: [number, number, number, number][] = [];
      // dentro da ilha (poucas, com tronco que colide) + muitas fora (horizonte)
      const nIn = Math.round(sp.n * 0.35 * treeK);
      const nOut = Math.round(sp.n * (b.sea ? 0.4 : 2.2) * treeK);
      for (let k = 0, guard = 0; k < nIn && guard < 300; guard++) {
        const a = r() * TAU;
        const rr = 6 + Math.sqrt(r()) * (R - 9);
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (blocked(x, z, 2.2) || pathD(x, z) < pathW + 1 || Math.hypot(x, z) < 5) continue;
        xf.push([x, z, 0.8 + r() * 0.4, r() * TAU]);
        host.solid(x - 0.3, 0, z - 0.3, x + 0.3, sp.h * 0.5, z + 0.3, 0, false, false);
        k++;
      }
      for (let k = 0; k < nOut; k++) {
        const a = r() * TAU;
        const rr = b.sea ? R + 1.5 + r() * 4 : R + 3 + r() * (b.ring === 'forest' ? 50 : 30);
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        xf.push([x, z, 0.9 + r() * 0.6, r() * TAU]);
      }
      const im = new THREE.InstancedMesh(g, tmat, Math.max(1, xf.length));
      xf.forEach(([x, z, s, ry], i) => {
        const rr = Math.hypot(x, z);
        const y = hAt(x, z, rr);
        im.setMatrixAt(i, mtx(x, y, z, ry, s, s, s));
        if (rr < R + 6) this.blobs!.push(x, y, z, 1.6 * s);
      });
      im.count = xf.length;
      im.computeBoundingSphere();
      im.castShadow = this.tier >= 2;
      im.receiveShadow = true;
      this.group.add(im);
    }
    // arbustos, flores e pedras (instanciados, tingidos)
    const dmat = natureMat({ amp: 0.004, y0: 0.05, rustle: 0.01, wrap: 0.5, tintGray: true });
    const deco = (g: THREE.BufferGeometry, n: number, cols: string[], sc2: number, inside: boolean) => {
      const items: [number, number, number, number, string][] = [];
      for (let k = 0, guard = 0; k < n && guard < n * 8; guard++) {
        const a = r() * TAU;
        const rr = inside ? 3 + Math.sqrt(r()) * (R - 3.5) : R + 0.8 + r() * (b.sea ? 2.5 : 10);
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (inside && (blocked(x, z, 0.8) || pathD(x, z) < pathW)) continue;
        items.push([x, z, sc2 * (0.7 + r() * 0.6), r() * TAU, cols[Math.floor(r() * cols.length)]]);
        k++;
      }
      if (!items.length) return;
      const im = new THREE.InstancedMesh(g, dmat, items.length);
      const c = new THREE.Color();
      items.forEach(([x, z, s, ry, cl], i) => {
        im.setMatrixAt(i, mtx(x, hAt(x, z, Math.hypot(x, z)), z, ry, s, s, s));
        im.setColorAt(i, c.set(cl));
      });
      im.computeBoundingSphere();
      im.receiveShadow = true;
      this.group.add(im);
    };
    const dk = this.tier <= 0 ? 0.5 : this.tier === 1 ? 0.75 : 1;
    if (b.bushes.length) {
      deco(natureBush(3, this.tier <= 1 ? 1 : 0), Math.round(16 * dk), b.bushes, 1.1, true);
      deco(natureBush(7, 1), Math.round(26 * dk), b.bushes, 1.4, false);
    }
    if (b.flowers) deco(natureFlowers(5), Math.round(30 * dk), ['#ffffff', '#ffe14d', '#ff7ac8', '#9b5de5'], 1, true);
    deco(natureRock(4, '#6a8a4a', 0.4), Math.round(10 * dk), ['#a0a0aa', '#8a8a94'], 0.7, true);
    this.blobs.end();
    // ---- grama de lâminas (Médio/Alto) ----
    if (b.grass && nq.grass) {
      const base = new THREE.Color(b.tint);
      const src: GrassSource = {
        height: (x, z) => hAt(x, z, Math.hypot(x, z)),
        cell: (x, z, out) => {
          const rr = Math.hypot(x, z);
          if (rr > R - 0.5) return 0;
          if (blocked(x, z, 0.4) || pathD(x, z) < pathW + 0.3) return 0;
          out[0] = base.r * 0.55;
          out[1] = base.g * 0.62;
          out[2] = base.b * 0.4;
          out[3] = 0.85;
          return 0.9;
        },
      };
      this.grass = new GrassField(this.group, src, nq.grass, { width: 1.3, height: 0.8 });
    }
    // ---- adereços ----
    this.props(b, r, host, R, blocked, pathD, pathW);
  }

  private addMerged(parts: THREE.BufferGeometry[], mat: THREE.Material, shadow: boolean): THREE.Mesh | null {
    if (!parts.length) return null;
    const m = mergeGeometries(parts, false);
    for (const p of parts) p.dispose();
    if (!m) return null;
    m.computeVertexNormals();
    const mesh = new THREE.Mesh(m, mat);
    mesh.castShadow = shadow && this.tier >= 2;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  private props(b: Biome, r: () => number, host: EnvHost, R: number, blocked: (x: number, z: number, m?: number) => boolean, pathD: (x: number, z: number) => number, pathW: number): void {
    const parts: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[] = [];
    const accents = ['#ff5a5a', '#3f8cff', '#ffd23f', '#4fc36f', '#9b5de5', '#ff9a3a'];
    const n = Math.round((this.tier <= 0 ? 10 : 16) * (b.props.length ? 1 : 0));
    for (let i = 0, guard = 0; i < n && guard < 400; guard++) {
      const kind = b.props[Math.floor(r() * b.props.length)];
      const a = r() * TAU;
      const big = kind === 'car' || kind === 'igloo' || kind === 'crates';
      const rr = 4 + Math.sqrt(r()) * (R - 6);
      let x = Math.cos(a) * rr;
      let z = Math.sin(a) * rr;
      // carros e postes na beira das ruas/caminhos
      if ((kind === 'car' || kind === 'lamp') && host.houses.length) {
        const h = host.houses[Math.floor(r() * host.houses.length)];
        const t2 = 0.3 + r() * 0.5;
        const px = h.x * t2;
        const pz = (h.z - h.d / 2 - 1.2) * t2;
        const l = Math.hypot(h.x, h.z - h.d / 2 - 1.2) || 1;
        const off = (pathW + (kind === 'car' ? 1.4 : 0.6)) * (r() < 0.5 ? -1 : 1);
        x = px + (-(h.z - h.d / 2 - 1.2) / l) * off;
        z = pz + (h.x / l) * off;
      }
      if (blocked(x, z, big ? 2.2 : 1) || (kind !== 'car' && kind !== 'lamp' && pathD(x, z) < pathW + 0.5) || Math.hypot(x, z) > R - 2 || Math.hypot(x, z) < 3) continue;
      const g = propGeo(kind, r, accents[Math.floor(r() * accents.length)]);
      if (!g) continue;
      const ry = kind === 'car' ? Math.atan2(x, z) + Math.PI / 2 + (r() < 0.5 ? 0 : Math.PI) : r() * TAU;
      g.applyMatrix4(mtx(x, 0, z, ry));
      (kind === 'lamp' || kind === 'light' ? lamps : parts).push(g);
      // colisão: os grandes viram obstáculo/plataforma
      if (kind === 'car') {
        const c = Math.abs(Math.cos(ry));
        const s = Math.abs(Math.sin(ry));
        const hx = 0.85 * c + 1.8 * s;
        const hz = 0.85 * s + 1.8 * c;
        host.solid(x - hx, 0, z - hz, x + hx, 1.3, z + hz, 0, false, false);
      } else if (kind === 'crates' || kind === 'hay' || kind === 'igloo' || kind === 'gumdrop') host.solid(x - 0.6, 0, z - 0.6, x + 0.6, kind === 'gumdrop' ? 0.7 : 0.9, z + 0.6, 0, false, false);
      i++;
    }
    this.addMerged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 }), true);
    // postes: haste + lâmpada que acende de noite
    if (lamps.length) {
      const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffd88a, emissiveIntensity: 0 });
      this.litMats.push(lm);
      this.addMerged(lamps, lm, true);
    }
  }

  /** horizonte: prédios, montanhas, dunas, floresta, doces, estação espacial ou só mar */
  private ring(b: Biome, r: () => number, R: number): void {
    if (b.ring === 'city') {
      // prédios com janelas (instanciados em 1 desenho)
      const n = this.tier <= 0 ? 40 : 70;
      const mat = new THREE.MeshStandardMaterial({ map: windowTex(), roughness: 0.7, emissive: 0xffe2a0, emissiveIntensity: 0, emissiveMap: windowTex() });
      this.litMats.push(mat);
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(g, mat, n);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.05;
        const rr = (b.sea ? R + 30 : R + 14) + r() * 40;
        const w = 6 + r() * 8;
        const h = 12 + r() * 36;
        im.setMatrixAt(i, mtx(Math.cos(a) * rr, b.sea ? -2 : 0, Math.sin(a) * rr, -a, w, h, w));
        im.setColorAt(i, c.set(['#e8ecf4', '#f4e8d8', '#d8e4f8', '#f0d8d8', '#d8f0e4'][i % 5]));
      }
      im.computeBoundingSphere();
      this.group.add(im);
      // prédios em escala de UV: textura repete por andares
      mat.map!.repeat.set(1, 1);
    } else if (b.ring === 'mountains') {
      const n = 14;
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.2;
        const rr = 150 + r() * 60;
        const h = 45 + r() * 50;
        const g = new THREE.ConeGeometry(30 + r() * 25, h, 7, 3);
        const pos = g.getAttribute('position') as THREE.BufferAttribute;
        const cl = new Float32Array(pos.count * 3);
        const cr = new THREE.Color();
        for (let k = 0; k < pos.count; k++) {
          const yy = pos.getY(k) / h + 0.5;
          pos.setX(k, pos.getX(k) * (0.85 + 0.3 * Math.sin(k * 7.1)));
          cr.set(yy > 0.62 ? '#f6f9ff' : yy > 0.3 ? '#8a8aa0' : '#5a7a5a');
          cl[k * 3] = cr.r;
          cl[k * 3 + 1] = cr.g;
          cl[k * 3 + 2] = cr.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
        g.translate(Math.cos(a) * rr, h / 2 - 4, Math.sin(a) * rr);
        g.deleteAttribute('uv');
        parts.push(g.toNonIndexed());
        g.dispose();
      }
      this.addMerged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }), false);
    } else if (b.ring === 'candy') {
      const parts: THREE.BufferGeometry[] = [];
      const cols = ['#ffb8e0', '#9fe8ff', '#ffe680', '#c8a8ff', '#a8f0c0'];
      for (let i = 0; i < 26; i++) {
        const a = r() * TAU;
        const rr = R + 22 + r() * 60;
        const s = 6 + r() * 12;
        parts.push(colored(G.sph, cols[i % cols.length], mtx(Math.cos(a) * rr, -2, Math.sin(a) * rr, 0, s * 2, s * 1.6, s * 2)));
        if (i % 3 === 0) {
          parts.push(colored(G.cyl6, '#ffffff', mtx(Math.cos(a) * rr, s, Math.sin(a) * rr, 0, 0.6, s * 3, 0.6)));
          parts.push(colored(G.cyl, cols[(i + 2) % cols.length], mtx(Math.cos(a) * rr, s * 2.5, Math.sin(a) * rr, a, s * 1.4, 1.2, s * 1.4, Math.PI / 2)));
        }
      }
      this.addMerged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), false);
    } else if (b.ring === 'space') {
      // módulos da estação, domos e um planeta no céu
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        const rr = R + 10 + r() * 20;
        const x = Math.cos(a) * rr;
        const z = Math.sin(a) * rr;
        if (i % 2) parts.push(colored(G.sph, '#c8d2e8', mtx(x, 0, z, 0, 10 + r() * 6, 8 + r() * 6, 10 + r() * 6)));
        else parts.push(colored(G.cyl, '#dfe6f2', mtx(x, 3, z, a, 5, 10 + r() * 10, 5)));
        parts.push(colored(G.box, '#5ac8ff', mtx(x, 1.2, z, a, 4, 0.3, 0.3)));
      }
      this.addMerged(parts, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.5, emissive: 0x2a3a6a, emissiveIntensity: 0.25 }), false);
      const pt = new THREE.Mesh(
        new THREE.SphereGeometry(60, 32, 20),
        new THREE.MeshBasicMaterial({
          fog: false,
          map: canvasTex(256, 128, (x) => {
            const g = x.createLinearGradient(0, 0, 0, 128);
            g.addColorStop(0, '#5ac8ff');
            g.addColorStop(0.5, '#3a7acf');
            g.addColorStop(1, '#2a4a9a');
            x.fillStyle = g;
            x.fillRect(0, 0, 256, 128);
            x.fillStyle = 'rgba(90,200,120,.8)';
            for (let i = 0; i < 9; i++) {
              x.beginPath();
              x.ellipse(Math.random() * 256, 30 + Math.random() * 70, 20 + Math.random() * 30, 8 + Math.random() * 14, Math.random(), 0, TAU);
              x.fill();
            }
            x.fillStyle = 'rgba(255,255,255,.6)';
            for (let i = 0; i < 14; i++) x.fillRect(Math.random() * 256, Math.random() * 128, 30 + Math.random() * 40, 3);
          }),
        }),
      );
      pt.position.set(-260, 170, -330);
      this.group.add(pt);
      this.planet = pt;
    } else if (b.ring === 'forest' || b.ring === 'hills' || b.ring === 'dunes') {
      // horizonte de colinas/árvores baixas (silhueta suave na névoa)
      if (b.ring === 'forest' || b.ring === 'hills') {
        const g = natureTree({ kind: b.ring === 'forest' ? 'pine' : 'oak', h: 10, trunk: '#5a3a26', leaf: '#3f7a4a', leaf2: '#1f4a32', seed: 9, lod: 1 });
        const n = this.tier <= 0 ? 60 : 140;
        const im = new THREE.InstancedMesh(g, natureMat({ amp: 0.002, y0: 2, wrap: 0.4 }), n);
        for (let i = 0; i < n; i++) {
          const a = r() * TAU;
          const rr = R + 30 + r() * 90;
          const s = 1 + r() * 0.8;
          im.setMatrixAt(i, mtx(Math.cos(a) * rr, Math.max(0, (rr - R - 6) * 0.08), Math.sin(a) * rr, r() * 6, s, s, s));
        }
        im.computeBoundingSphere();
        this.group.add(im);
      }
    }
  }

  /** por quadro: céu, mar, luzes, grama, clima */
  update(dt: number, time: number, cam: THREE.PerspectiveCamera, o: { storm: number; flash: number; wind: number; rain: number; snow: number; embers: number; heat: number; fog: number; pushX: number; pushZ: number }, sun: THREE.DirectionalLight, hemi: THREE.HemisphereLight, fogObj: THREE.FogExp2): void {
    windTime.value = time;
    const c = skyAt(this.tod, o.storm, this.cols);
    this.night = c.night;
    // calor: sol mais forte e céu esbranquiçado
    if (o.heat > 0) {
      c.hor.lerp(new THREE.Color('#fff2c8'), o.heat * 0.5);
      c.sunI *= 1 + o.heat * 0.5;
    }
    this.sky.update(cam, time, dt, c, o.storm);
    if (this.ocean) {
      this.ocean.update(cam, time, 0.8 + o.storm * 0.9, 0, 0, c, fogObj.density, o.storm, c.deep);
      this.ocean.mesh.position.y = this.seaY + this.seaLift;
      if (this.biome.seaTint) {
        const u = this.ocean.mat.uniforms;
        u.uShallow.value.set(this.biome.seaTint[0]);
        u.uDeep.value.set(this.biome.seaTint[1]);
      }
    }
    // luz do sol/ambiente do céu
    const dir = c.night > 0.5 ? c.moon : c.dir;
    sun.position.set(cam.position.x + dir.x * 60, Math.max(8, dir.y * 60), cam.position.z + dir.z * 60);
    sun.color.copy(c.sun);
    sun.intensity = (c.night > 0.5 ? 0.9 : c.sunI * 1.55) + o.flash * 2.5;
    hemi.color.copy(c.zen).lerp(c.amb, 0.5);
    hemi.groundColor.set(this.biome.top === 'snow' ? '#8a96b0' : this.biome.top === 'sand' ? '#a08a60' : '#5a6a40');
    hemi.intensity = c.ambI * (c.night > 0.5 ? 1.5 : 1.55) + o.flash * 2;
    fogObj.color.copy(c.fog);
    fogObj.density = 0.0055 + o.storm * 0.006 + o.fog * 0.045 + o.snow * 0.02;
    if (this.biome.ring === 'space') fogObj.density *= 0.4;
    // janelas e postes acendem de noite / na tempestade
    const lit = Math.min(1, c.night + o.storm * 0.6);
    this.glassMat.emissiveIntensity = lit * 0.9;
    for (const m of this.litMats) m.emissiveIntensity = lit * 0.8;
    // fluido
    const u = this.fluidMat.uniforms;
    u.uTime.value = time;
    u.uSky.value.copy(c.zen);
    u.uHor.value.copy(c.hor);
    u.uSun.value.copy(dir);
    u.uSunC.value.copy(c.sun).multiplyScalar(c.sunI);
    u.uFog.value.copy(c.fog);
    u.uFogD.value = fogObj.density;
    this.grass?.update(cam.position.x, cam.position.y, cam.position.z, o.pushX, o.pushZ, 0.6);
    this.weather.update(dt, cam.position.x, cam.position.z, o.wind, o.rain, o.snow, o.embers);
    if (this.planet) this.planet.rotation.y += dt * 0.01;
  }

  /** material de fogo (aditivo) para quem precisar */
  static flame(): THREE.SpriteMaterial {
    return new THREE.SpriteMaterial({ map: flameSprite(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  }
}
