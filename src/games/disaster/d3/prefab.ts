/* ============================================================
 *  SOBREVIVA AOS DESASTRES 3D — casas PRÉ-MOLDADAS e destrutíveis.
 *
 *  Cada casa é montada pelo sistema a partir de peças padronizadas (como placas de concreto
 *  pré-moldado): painéis de parede, painéis com janela (vidro à parte), painel da porta, pilares de
 *  canto, placas do telhado (laje), mureta, chaminé e toldo. Desenho barato: UMA malha instanciada por
 *  tipo de peça para a vila inteira (~15 chamadas de desenho), forro interno e vidro em malhas próprias.
 *
 *  Dano por peça (HP) com fontes diferentes (impacto/explosão, tremor, vento, tornado, onda). Peça sem
 *  HP SOLTA: vira corpo do cannon (a própria peça voa, gira e cai) — ou, sem orçamento de corpos ou num
 *  golpe forte demais, explode em lascas (partículas instanciadas, sem física). Conectividade: placa do
 *  telhado só fica de pé se ligada (pelas vizinhas) a uma placa apoiada numa parede/pilar vivo; parede
 *  sem vizinha nem laje em cima tomba; mureta/chaminé/toldo caem junto com quem as segura.
 *  Corpos soltos dormem/apagam (encolhem) e voltam ao "pool"; limite de corpos ativos por qualidade.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Tier } from '../../../core/quality';

/** caixa de colisão do Bloop (mesmo formato do Box do game3d) */
export interface PBox {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}
export interface PrefabHost {
  world: CANNON.World;
  statics: PBox[];
  tier: Tier;
  /** poeira (sprites do jogo) */
  puff(x: number, y: number, z: number, n: number, sp: number): void;
  /** som de quebra perto do jogador */
  crack(x: number, z: number, big: boolean): void;
  /** o telhado da casa i caiu/voou (deixa de ser abrigo) */
  roofLost(i: number): void;
}
export interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** lado da escada (−1/1): sem janela nem mureta desse lado */
  side: number;
  wall: string;
  roof: string;
  /** fachada (textura) */
  facade: THREE.Texture;
}

type Kind = 'wall' | 'win' | 'door' | 'pillar' | 'roof' | 'rail' | 'chim' | 'awn';
const HP: Record<Kind, number> = { wall: 100, win: 60, door: 120, pillar: 170, roof: 85, rail: 30, chim: 45, awn: 25 };
/** peso (massa ~ volume × densidade) */
const DENS = 260;
const T = 0.24;
/** tamanhos nominais das geometrias unitárias (UV em metros nessas medidas) */
const NOM = { w: 1.5, h: 3.2 };
const BUDGET = [6, 10, 18, 28];
const CHIPS = [48, 90, 150, 220];

interface Part {
  m: Mesh;
  i: number;
}
interface Piece {
  k: Kind;
  h: number;
  x: number;
  y: number;
  z: number;
  /** meia-medida local (x ao longo, y altura, z espessura) */
  hx: number;
  hy: number;
  hz: number;
  q: THREE.Quaternion;
  sc: THREE.Vector3;
  hp: number;
  max: number;
  /** 0 de pé, 1 solta (corpo), 2 sumiu */
  st: 0 | 1 | 2;
  /** queda agendada (s) — cascata da conectividade */
  fall: number;
  boxes: PBox[];
  sbs: CANNON.Body[];
  parts: Part[];
  col: THREE.Color;
  /** vizinhas que seguram (paredes/pilares na mesma linha; placas adjacentes) */
  nb: number[];
  /** apoios: placas → paredes/pilares embaixo; paredes → placas em cima */
  sup: number[];
  /** peça-mãe (mureta/chaminé → placa; toldo → porta) */
  parent: number;
  glass: number;
  body: CANNON.Body | null;
  life: number;
  fade: number;
}
interface Mesh {
  key: string;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  im: THREE.InstancedMesh | null;
  mats: THREE.Matrix4[];
  cols: THREE.Color[];
  dirty: boolean;
  shadow: boolean;
}
interface Chip {
  on: boolean;
  p: THREE.Vector3;
  v: THREE.Vector3;
  r: THREE.Euler;
  w: THREE.Vector3;
  s: number;
  life: number;
}
export interface HouseInfo {
  pieces: number[];
  roof: number[];
  walls: number[];
  dirty: boolean;
  lost: boolean;
}

/* ---------------------------- geometria ---------------------------- */

/** caixa não indexada com UV em metros (tile 2 m), cor e "keep" (1 = não tingir com a cor da casa) */
function box(out: THREE.BufferGeometry[], cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: number | string, keep: number, ao = true): void {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const c = new THREE.Color(col);
  const cl = new Float32Array(pos.count * 3);
  const kp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx;
    const y = pos.getY(i) + cy;
    const z = pos.getZ(i) + cz;
    if (Math.abs(nor.getY(i)) > 0.5) uv.setXY(i, x / 2, z / 2);
    else if (Math.abs(nor.getX(i)) > 0.5) uv.setXY(i, z / 2, y / 2);
    else uv.setXY(i, x / 2, y / 2);
    // oclusão barata: pé da peça mais escuro
    const k = ao ? 0.8 + 0.2 * Math.min(1, Math.max(0, (y + NOM.h / 2) / 1.2)) : 1;
    cl[i * 3] = c.r * k;
    cl[i * 3 + 1] = c.g * k;
    cl[i * 3 + 2] = c.b * k;
    kp[i] = keep;
  }
  g.translate(cx, cy, cz);
  g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
  g.setAttribute('keep', new THREE.BufferAttribute(kp, 1));
  out.push(g);
}
function merge(parts: THREE.BufferGeometry[], sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.scale(sx, sy, sz);
  g.computeBoundingSphere();
  return g;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}
/** painel de parede pré-moldado (local: x ao longo, z para fora); unitário */
function gWallOut(): THREE.BufferGeometry {
  return cached('wallO', () => {
    const W = NOM.w;
    const H = NOM.h;
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, 0, W, H, T, '#ffffff', 0);
    // juntas das placas (frisos verticais), rodapé de pedra e cimalha
    box(o, -W / 2 + 0.035, 0, T / 2 + 0.012, 0.07, H, 0.03, '#c9c4bc', 0);
    box(o, W / 2 - 0.035, 0, T / 2 + 0.012, 0.07, H, 0.03, '#c9c4bc', 0);
    box(o, 0, -H / 2 + 0.16, T / 2 + 0.03, W, 0.32, 0.06, '#8d8a93', 1);
    box(o, 0, H / 2 - 0.08, T / 2 + 0.03, W, 0.16, 0.07, '#f3eee6', 1);
    return merge(o, 1 / W, 1 / H, 1 / T);
  });
}
/** forro interno (pintura clara + rodapé) */
function gWallIn(): THREE.BufferGeometry {
  return cached('wallI', () => {
    const W = NOM.w;
    const H = NOM.h;
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, -T / 2 - 0.012, W, H, 0.024, '#ffffff', 0);
    box(o, 0, -H / 2 + 0.07, -T / 2 - 0.035, W, 0.14, 0.03, '#7a5a3e', 1, false);
    return merge(o, 1 / W, 1 / H, 1 / T);
  });
}
const WIN = { x: 0.44, y0: 0.95, y1: 2.3 };
function gWinOut(): THREE.BufferGeometry {
  return cached('winO', () => {
    const W = NOM.w;
    const H = NOM.h;
    const o: THREE.BufferGeometry[] = [];
    const b = -H / 2;
    const sw = (W / 2 - WIN.x) / 2;
    box(o, -W / 2 + sw, 0, 0, sw * 2, H, T, '#ffffff', 0);
    box(o, W / 2 - sw, 0, 0, sw * 2, H, T, '#ffffff', 0);
    box(o, 0, b + WIN.y0 / 2, 0, WIN.x * 2, WIN.y0, T, '#ffffff', 0);
    box(o, 0, b + (WIN.y1 + H) / 2, 0, WIN.x * 2, H - WIN.y1, T, '#ffffff', 0);
    box(o, -W / 2 + 0.035, 0, T / 2 + 0.012, 0.07, H, 0.03, '#c9c4bc', 0);
    box(o, W / 2 - 0.035, 0, T / 2 + 0.012, 0.07, H, 0.03, '#c9c4bc', 0);
    box(o, 0, b + 0.16, T / 2 + 0.03, W, 0.32, 0.06, '#8d8a93', 1);
    box(o, 0, H / 2 - 0.08, T / 2 + 0.03, W, 0.16, 0.07, '#f3eee6', 1);
    // moldura branca, peitoril saliente, cruzeta, floreira com flores
    const fy = b + (WIN.y0 + WIN.y1) / 2;
    const fh = WIN.y1 - WIN.y0;
    box(o, -WIN.x - 0.04, fy, T / 2 + 0.02, 0.09, fh + 0.16, 0.05, '#fbf8f2', 1, false);
    box(o, WIN.x + 0.04, fy, T / 2 + 0.02, 0.09, fh + 0.16, 0.05, '#fbf8f2', 1, false);
    box(o, 0, b + WIN.y1 + 0.05, T / 2 + 0.02, WIN.x * 2 + 0.17, 0.1, 0.05, '#fbf8f2', 1, false);
    box(o, 0, b + WIN.y0 - 0.04, T / 2 + 0.06, WIN.x * 2 + 0.3, 0.08, 0.14, '#fbf8f2', 1, false);
    box(o, 0, fy, 0, 0.05, fh, 0.06, '#fbf8f2', 1, false);
    box(o, 0, fy + 0.08, 0, WIN.x * 2, 0.05, 0.06, '#fbf8f2', 1, false);
    box(o, 0, b + WIN.y0 - 0.2, T / 2 + 0.15, WIN.x * 2 + 0.1, 0.2, 0.2, '#8a5a3a', 1, false);
    for (let k = 0; k < 5; k++) box(o, -WIN.x + 0.1 + k * ((WIN.x * 2 - 0.2) / 4), b + WIN.y0 - 0.06, T / 2 + 0.15, 0.13, 0.12, 0.13, ['#ff6fa8', '#ffe14d', '#ff5a5a', '#c48cff', '#ffffff'][k], 1, false);
    return merge(o, 1 / W, 1 / H, 1 / T);
  });
}
function gWinIn(): THREE.BufferGeometry {
  return cached('winI', () => {
    const W = NOM.w;
    const H = NOM.h;
    const o: THREE.BufferGeometry[] = [];
    const b = -H / 2;
    const z = -T / 2 - 0.012;
    const sw = (W / 2 - WIN.x) / 2;
    box(o, -W / 2 + sw, 0, z, sw * 2, H, 0.024, '#ffffff', 0);
    box(o, W / 2 - sw, 0, z, sw * 2, H, 0.024, '#ffffff', 0);
    box(o, 0, b + WIN.y0 / 2, z, WIN.x * 2, WIN.y0, 0.024, '#ffffff', 0);
    box(o, 0, b + (WIN.y1 + H) / 2, z, WIN.x * 2, H - WIN.y1, 0.024, '#ffffff', 0);
    box(o, 0, b + 0.07, z - 0.02, W, 0.14, 0.03, '#7a5a3e', 1, false);
    box(o, 0, b + WIN.y0 - 0.03, z - 0.05, WIN.x * 2 + 0.2, 0.06, 0.12, '#f4efe6', 1, false);
    return merge(o, 1 / W, 1 / H, 1 / T);
  });
}
function gGlass(): THREE.BufferGeometry {
  return cached('glass', () => {
    const g = new THREE.BoxGeometry((WIN.x * 2) / NOM.w, (WIN.y1 - WIN.y0) / NOM.h, 0.04 / T);
    g.translate(0, (-NOM.h / 2 + (WIN.y0 + WIN.y1) / 2) / NOM.h, 0);
    return g;
  });
}
/** painel da porta (tamanho real: vão 1,8 × 2,2) — por altura */
const DOOR_W = 2.6;
function gDoorOut(h: number): THREE.BufferGeometry {
  return cached('doorO' + h, () => {
    const W = DOOR_W;
    const o: THREE.BufferGeometry[] = [];
    const b = -h / 2;
    box(o, -1.1, 0, 0, 0.4, h, T, '#ffffff', 0);
    box(o, 1.1, 0, 0, 0.4, h, T, '#ffffff', 0);
    box(o, 0, b + (2.2 + h) / 2, 0, 1.8, h - 2.2, T, '#ffffff', 0);
    box(o, -W / 2 + 0.035, 0, T / 2 + 0.012, 0.07, h, 0.03, '#c9c4bc', 0);
    box(o, W / 2 - 0.035, 0, T / 2 + 0.012, 0.07, h, 0.03, '#c9c4bc', 0);
    box(o, -1.15, b + 0.16, T / 2 + 0.03, 0.3, 0.32, 0.06, '#8d8a93', 1);
    box(o, 1.15, b + 0.16, T / 2 + 0.03, 0.3, 0.32, 0.06, '#8d8a93', 1);
    box(o, 0, h / 2 - 0.08, T / 2 + 0.03, W, 0.16, 0.07, '#f3eee6', 1);
    // batente de madeira e folhas abertas para dentro (encostadas na parede)
    box(o, -0.95, b + 1.15, T / 2 + 0.03, 0.12, 2.3, 0.07, '#7a4e2e', 1, false);
    box(o, 0.95, b + 1.15, T / 2 + 0.03, 0.12, 2.3, 0.07, '#7a4e2e', 1, false);
    box(o, 0, b + 2.26, T / 2 + 0.03, 2.02, 0.12, 0.07, '#7a4e2e', 1, false);
    box(o, -1.36, b + 1.07, -T / 2 - 0.06, 0.88, 2.12, 0.06, '#a8683a', 1, false);
    box(o, 1.36, b + 1.07, -T / 2 - 0.06, 0.88, 2.12, 0.06, '#a8683a', 1, false);
    box(o, -1.36, b + 1.5, -T / 2 - 0.1, 0.5, 0.6, 0.03, '#c98c58', 1, false);
    box(o, 1.36, b + 1.5, -T / 2 - 0.1, 0.5, 0.6, 0.03, '#c98c58', 1, false);
    // número da casa (placa) e luminária
    box(o, 1.12, b + 1.75, T / 2 + 0.04, 0.22, 0.16, 0.03, '#2a3a6a', 1, false);
    box(o, -1.12, b + 2.05, T / 2 + 0.08, 0.14, 0.24, 0.12, '#ffe9a8', 1, false);
    return merge(o, 1 / W, 1 / h, 1 / T);
  });
}
function gDoorIn(h: number): THREE.BufferGeometry {
  return cached('doorI' + h, () => {
    const W = DOOR_W;
    const o: THREE.BufferGeometry[] = [];
    const b = -h / 2;
    const z = -T / 2 - 0.012;
    box(o, -1.1, 0, z, 0.4, h, 0.024, '#ffffff', 0);
    box(o, 1.1, 0, z, 0.4, h, 0.024, '#ffffff', 0);
    box(o, 0, b + (2.2 + h) / 2, z, 1.8, h - 2.2, 0.024, '#ffffff', 0);
    return merge(o, 1 / W, 1 / h, 1 / T);
  });
}
function gUnit(key: string, col: string, keep: number, ao = true): THREE.BufferGeometry {
  return cached(key, () => {
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, 0, 1, 1, 1, col, keep, ao);
    return merge(o);
  });
}
/** placa do telhado: laje com borda + forro embaixo (o forro vai na malha "ceil") */
function gRoof(): THREE.BufferGeometry {
  return cached('roof', () => {
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, 0, 2, 0.3, 2, '#ffffff', 0, false);
    box(o, 0, -0.17, 0, 1.96, 0.04, 1.96, '#f0ece4', 1, false);
    return merge(o, 1 / 2, 1 / 0.3, 1 / 2);
  });
}
function gRail(): THREE.BufferGeometry {
  return cached('rail', () => {
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, 0, 1, 1, 1, '#ffffff', 0, false);
    box(o, 0, 0.55, 0, 1.0, 0.1, 1.5, '#f3eee6', 1, false);
    return merge(o);
  });
}
function gChim(): THREE.BufferGeometry {
  return cached('chim', () => {
    const o: THREE.BufferGeometry[] = [];
    box(o, 0, 0, 0, 0.6, 1.0, 0.6, '#a0523d', 1, false);
    box(o, 0, 0.55, 0, 0.74, 0.12, 0.74, '#6e3a2c', 1, false);
    return merge(o, 1 / 0.6, 1, 1 / 0.6);
  });
}
function gAwn(): THREE.BufferGeometry {
  return cached('awn', () => {
    const o: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 6; k++) box(o, -1.05 + (k + 0.5) * 0.35, 0, 0, 0.35, 0.08, 0.85, k % 2 ? '#ffffff' : '#ffffff', k % 2, false);
    const g = merge(o);
    g.rotateX(0.22);
    g.scale(1 / 2.1, 1 / 0.12, 1 / 0.9);
    return g;
  });
}

/* ---------------------------- texturas e materiais ---------------------------- */

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
let roofTexC: THREE.CanvasTexture | null = null;
/** laje do telhado: placas quadradas com rejunte e manchas (clara: multiplica a cor do telhado) */
function roofTex(): THREE.CanvasTexture {
  if (roofTexC) return roofTexC;
  roofTexC = canvasTex(256, 256, (x) => {
    x.fillStyle = '#e8e2da';
    x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const v = 236 + Math.round((Math.random() - 0.5) * 26);
        x.fillStyle = `rgb(${v},${v - 3},${v - 8})`;
        x.fillRect(c * 64 + 3, r * 64 + 3, 58, 58);
      }
    for (let i = 0; i < 1600; i++) {
      const v = 180 + Math.random() * 60;
      x.fillStyle = `rgba(${v},${v},${v},.18)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
  return roofTexC;
}
let floorTexC: THREE.CanvasTexture | null = null;
/** piso de tábuas (de dentro da casa) */
function floorTex(): THREE.CanvasTexture {
  if (floorTexC) return floorTexC;
  floorTexC = canvasTex(256, 256, (x) => {
    x.fillStyle = '#b07a4a';
    x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) {
      const off = (r * 97) % 256;
      for (let c = -1; c < 2; c++) {
        const v = Math.round((Math.random() - 0.5) * 36);
        x.fillStyle = `rgb(${190 + v},${130 + v},${80 + v})`;
        x.fillRect(c * 160 + off + 2, r * 32 + 2, 156, 28);
      }
      for (let k = 0; k < 10; k++) {
        x.strokeStyle = 'rgba(90,50,20,.15)';
        x.beginPath();
        const yy = r * 32 + 4 + Math.random() * 24;
        x.moveTo(0, yy);
        x.bezierCurveTo(90, yy + 2, 170, yy - 2, 256, yy);
        x.stroke();
      }
    }
  });
  return floorTexC;
}
/** material que recebe a cor da instância só onde keep = 0 (frisos/molduras guardam a própria cor) */
function tintMat(o: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float keep;')
      .replace('#include <color_vertex>', THREE.ShaderChunk.color_vertex.replace('vColor.xyz *= instanceColor.xyz;', 'vColor.xyz *= mix(instanceColor.xyz, vec3(1.0), keep);'));
  };
  m.customProgramCacheKey = () => 'dzprefab';
  return m;
}

/* ---------------------------- sistema ---------------------------- */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();
const Y = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Prefab {
  group = new THREE.Group();
  pieces: Piece[] = [];
  houses: HouseInfo[] = [];
  private meshes = new Map<string, Mesh>();
  private mats: THREE.Material[] = [];
  private loose: number[] = [];
  private chips: Chip[] = [];
  private chipIm: THREE.InstancedMesh;
  private chipHead = 0;
  private chipLive = 0;
  private host: PrefabHost;
  private budget: number;
  private statics: THREE.Mesh[] = [];
  private glassMat: THREE.Material;
  /** dano total recebido (testes/QA) */
  broken = 0;

  constructor(scene: THREE.Scene, host: PrefabHost, glassMat: THREE.Material) {
    this.host = host;
    this.glassMat = glassMat;
    this.budget = BUDGET[host.tier];
    scene.add(this.group);
    const n = CHIPS[host.tier];
    const cg = new THREE.BoxGeometry(1, 1, 1);
    this.chipIm = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ roughness: 0.85 }), n);
    this.chipIm.frustumCulled = false;
    this.chipIm.castShadow = false;
    for (let i = 0; i < n; i++) {
      this.chipIm.setMatrixAt(i, ZERO);
      this.chipIm.setColorAt(i, _c.set('#ffffff'));
      this.chips.push({ on: false, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 0.2, life: 0 });
    }
    scene.add(this.chipIm);
  }

  /** limpa tudo (nova rodada). As caixas/corpos estáticos somem com o clearLevel do jogo. */
  clear(): void {
    for (const i of this.loose) {
      const p = this.pieces[i];
      if (p.body) this.host.world.removeBody(p.body);
    }
    for (const m of this.meshes.values()) {
      if (m.im) {
        this.group.remove(m.im);
        m.im.dispose();
      }
    }
    for (const s of this.statics) {
      this.group.remove(s);
      s.geometry.dispose();
    }
    for (const m of this.mats) m.dispose();
    this.statics = [];
    this.mats = [];
    this.meshes.clear();
    this.pieces = [];
    this.houses = [];
    this.loose = [];
    for (const c of this.chips) c.on = false;
    for (let i = 0; i < this.chips.length; i++) this.chipIm.setMatrixAt(i, ZERO);
    this.chipIm.instanceMatrix.needsUpdate = true;
    this.chipLive = 0;
    this.broken = 0;
  }

  private matWall!: THREE.MeshStandardMaterial;
  private matIn!: THREE.MeshStandardMaterial;
  private matTrim!: THREE.MeshStandardMaterial;
  private matRoof!: THREE.MeshStandardMaterial;

  /** materiais da rodada (a fachada muda por mapa) */
  begin(facade: THREE.Texture): void {
    this.clear();
    this.matWall = tintMat({ map: facade, roughness: 0.9 });
    // dentro: um pouco de luz própria (rebate da janela/porta) — parede de dentro não vira um painel chapado
    this.matIn = tintMat({ roughness: 0.95, emissive: 0x302820 });
    this.matTrim = tintMat({ roughness: 0.8 });
    this.matRoof = tintMat({ map: roofTex(), roughness: 0.92 });
    this.mats.push(this.matWall, this.matIn, this.matTrim, this.matRoof);
  }

  private mesh(key: string, geo: THREE.BufferGeometry, mat: THREE.Material, shadow = true): Mesh {
    let m = this.meshes.get(key);
    if (!m) {
      m = { key, geo, mat, im: null, mats: [], cols: [], dirty: false, shadow };
      this.meshes.set(key, m);
    }
    return m;
  }
  private inst(p: Piece, m: Mesh, col: THREE.Color): void {
    _m.compose(_v.set(p.x, p.y, p.z), p.q, p.sc);
    m.mats.push(_m.clone());
    m.cols.push(col.clone());
    p.parts.push({ m, i: m.mats.length - 1 });
  }
  private addPiece(k: Kind, h: number, x: number, y: number, z: number, hx: number, hy: number, hz: number, ry: number, col: THREE.Color, collide: boolean): Piece {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry);
    const along = Math.abs(Math.cos(ry)) > 0.5;
    const p: Piece = {
      k,
      h,
      x,
      y,
      z,
      hx,
      hy,
      hz,
      q,
      sc: new THREE.Vector3(hx * 2, hy * 2, hz * 2),
      hp: HP[k],
      max: HP[k],
      st: 0,
      fall: 0,
      boxes: [],
      sbs: [],
      parts: [],
      col: col.clone(),
      nb: [],
      sup: [],
      parent: -1,
      glass: -1,
      body: null,
      life: 0,
      fade: 0,
    };
    if (collide) {
      const ax = along ? hx : hz;
      const az = along ? hz : hx;
      this.addBox(p, x - ax, y - hy, z - az, x + ax, y + hy, z + az);
    }
    this.pieces.push(p);
    this.houses[h].pieces.push(this.pieces.length - 1);
    return p;
  }
  private addBox(p: Piece, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    const b: PBox = { x0, y0, z0, x1, y1, z1 };
    p.boxes.push(b);
    this.host.statics.push(b);
    const sb = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2)) });
    sb.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    this.host.world.addBody(sb);
    p.sbs.push(sb);
  }

  /** monta uma casa com peças padronizadas; devolve o índice da casa */
  addHouse(s: HouseSpec): number {
    const hi = this.houses.length;
    const info: HouseInfo = { pieces: [], roof: [], walls: [], dirty: false, lost: false };
    this.houses.push(info);
    const { x, z, w, d, h } = s;
    const x0 = x - w / 2;
    const x1 = x + w / 2;
    const z0 = z - d / 2;
    const z1 = z + d / 2;
    const cw = new THREE.Color(s.wall);
    // pintura de dentro: a cor da casa bem clarinha (cada casa tem o seu tom)
    const cin = new THREE.Color(s.wall).lerp(new THREE.Color('#fff8ee'), 0.72);
    const ctrim = new THREE.Color(s.wall).offsetHSL(0, -0.05, -0.16);
    const croof = new THREE.Color(s.roof);
    const mWO = this.mesh('wallO', gWallOut(), this.matWall);
    const mWI = this.mesh('wallI', gWallIn(), this.matIn, false);
    const mNO = this.mesh('winO', gWinOut(), this.matWall);
    const mNI = this.mesh('winI', gWinIn(), this.matIn, false);
    const mG = this.mesh('glass', gGlass(), this.glassMat, false);
    const mDO = this.mesh('doorO' + h, gDoorOut(h), this.matWall);
    const mDI = this.mesh('doorI' + h, gDoorIn(h), this.matIn, false);
    const mP = this.mesh('pillar', gUnit('pillarG', '#ffffff', 0), this.matTrim);
    const mR = this.mesh('roof', gRoof(), this.matRoof);
    const mL = this.mesh('rail', gRail(), this.matTrim);
    const mC = this.mesh('chim', gChim(), this.matTrim);
    const mA = this.mesh('awn', gAwn(), this.matTrim, false);
    const P = 0.42;
    // pilares de canto
    const pil: number[] = [];
    for (const [px, pz] of [
      [x0 + P / 2 - 0.06, z0 + P / 2 - 0.06],
      [x1 - P / 2 + 0.06, z0 + P / 2 - 0.06],
      [x0 + P / 2 - 0.06, z1 - P / 2 + 0.06],
      [x1 - P / 2 + 0.06, z1 - P / 2 + 0.06],
    ]) {
      const p = this.addPiece('pillar', hi, px, h / 2, pz, P / 2, h / 2, P / 2, 0, ctrim, true);
      this.inst(p, mP, ctrim);
      pil.push(this.pieces.length - 1);
      info.walls.push(this.pieces.length - 1);
    }
    /** uma parede entre a e b (coordenada ao longo), na linha fixa `at`; lado: 'f','b','l','r' */
    const wallLine = (side: 'f' | 'b' | 'l' | 'r', a: number, b: number, at: number, ends: [number, number], door: boolean): void => {
      const alongX = side === 'f' || side === 'b';
      const ry = side === 'f' ? Math.PI : side === 'b' ? 0 : side === 'l' ? -Math.PI / 2 : Math.PI / 2;
      const segs: { a: number; b: number; kind: Kind }[] = [];
      const pushRun = (ra: number, rb: number, wins: boolean) => {
        const L = rb - ra;
        if (L < 0.3) return;
        const n = Math.max(1, Math.round(L / 1.55));
        for (let k = 0; k < n; k++) {
          const sa = ra + (L * k) / n;
          const sb = ra + (L * (k + 1)) / n;
          const win = wins && L / n >= 0.85 && (n === 1 ? true : n === 2 ? k === 1 : k % 2 === 1);
          segs.push({ a: sa, b: sb, kind: win ? 'win' : 'wall' });
        }
      };
      const ladderSide = (side === 'l' && s.side < 0) || (side === 'r' && s.side > 0);
      if (door) {
        const c = alongX ? x : z;
        pushRun(a, c - DOOR_W / 2, true);
        segs.push({ a: c - DOOR_W / 2, b: c + DOOR_W / 2, kind: 'door' });
        pushRun(c + DOOR_W / 2, b, true);
      } else pushRun(a, b, !ladderSide);
      const idx: number[] = [];
      for (const sg of segs) {
        const len = sg.b - sg.a;
        const c = (sg.a + sg.b) / 2;
        const px = alongX ? c : at;
        const pz = alongX ? at : c;
        const p = this.addPiece(sg.kind, hi, px, h / 2, pz, len / 2, h / 2, T / 2, ry, cw, sg.kind !== 'door');
        const pi = this.pieces.length - 1;
        if (sg.kind === 'door') {
          // vão livre: colisão só nos batentes e na verga
          const ax = alongX;
          const lo = c - len / 2;
          const hiE = c + len / 2;
          const t0 = at - T / 2;
          const t1 = at + T / 2;
          const bx = (u0: number, u1: number, y0: number, y1: number) => (ax ? this.addBox(p, u0, y0, t0, u1, y1, t1) : this.addBox(p, t0, y0, u0, t1, y1, u1));
          bx(lo, lo + 0.4, 0, h);
          bx(hiE - 0.4, hiE, 0, h);
          bx(lo + 0.4, hiE - 0.4, 2.2, h);
          this.inst(p, mDO, cw);
          this.inst(p, mDI, cin);
          // toldo sobre a porta (cai junto)
          const aw = this.addPiece('awn', hi, px, 2.62, pz - 0.5, 1.05, 0.06, 0.45, 0, croof, false);
          aw.parent = pi;
          this.inst(aw, mA, croof);
        } else if (sg.kind === 'win') {
          this.inst(p, mNO, cw);
          this.inst(p, mNI, cin);
          _m.compose(_v.set(px, h / 2, pz), p.q, p.sc);
          mG.mats.push(_m.clone());
          mG.cols.push(new THREE.Color('#ffffff'));
          p.glass = mG.mats.length - 1;
        } else {
          this.inst(p, mWO, cw);
          this.inst(p, mWI, cin);
        }
        idx.push(pi);
        info.walls.push(pi);
      }
      // vizinhas na linha (e os pilares das pontas)
      for (let k = 0; k < idx.length; k++) {
        const p = this.pieces[idx[k]];
        if (k > 0) p.nb.push(idx[k - 1]);
        if (k < idx.length - 1) p.nb.push(idx[k + 1]);
        if (k === 0) {
          p.nb.push(ends[0]);
          this.pieces[ends[0]].nb.push(idx[k]);
        }
        if (k === idx.length - 1) {
          p.nb.push(ends[1]);
          this.pieces[ends[1]].nb.push(idx[k]);
        }
      }
    };
    const inset = P - 0.06;
    wallLine('f', x0 + inset, x1 - inset, z0 + T / 2, [pil[0], pil[1]], true);
    wallLine('b', x0 + inset, x1 - inset, z1 - T / 2, [pil[2], pil[3]], false);
    wallLine('l', z0 + inset, z1 - inset, x0 + T / 2, [pil[0], pil[2]], false);
    wallLine('r', z0 + inset, z1 - inset, x1 - T / 2, [pil[1], pil[3]], false);
    // laje do telhado em placas (passa 0,2 m das paredes)
    const rx0 = x0 - 0.2;
    const rz0 = z0 - 0.2;
    const RW = w + 0.4;
    const RD = d + 0.4;
    const nx = Math.max(2, Math.round(RW / 2.2));
    const nz = Math.max(2, Math.round(RD / 2.2));
    const tw = RW / nx;
    const td = RD / nz;
    const grid: number[][] = [];
    for (let i = 0; i < nx; i++) {
      grid.push([]);
      for (let j = 0; j < nz; j++) {
        const cx = rx0 + (i + 0.5) * tw;
        const cz = rz0 + (j + 0.5) * td;
        const p = this.addPiece('roof', hi, cx, h + 0.15, cz, tw / 2, 0.15, td / 2, 0, croof, true);
        this.inst(p, mR, croof);
        const pi = this.pieces.length - 1;
        grid[i].push(pi);
        info.roof.push(pi);
        // apoios: paredes/pilares embaixo da placa
        for (const wi of info.walls) {
          const wp = this.pieces[wi];
          const b = wp.boxes[0];
          if (!b) continue;
          if (b.x1 > cx - tw / 2 - 0.05 && b.x0 < cx + tw / 2 + 0.05 && b.z1 > cz - td / 2 - 0.05 && b.z0 < cz + td / 2 + 0.05) {
            p.sup.push(wi);
            wp.sup.push(pi);
          }
        }
      }
    }
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nz; j++) {
        const p = this.pieces[grid[i][j]];
        if (i > 0) p.nb.push(grid[i - 1][j]);
        if (i < nx - 1) p.nb.push(grid[i + 1][j]);
        if (j > 0) p.nb.push(grid[i][j - 1]);
        if (j < nz - 1) p.nb.push(grid[i][j + 1]);
      }
    // mureta (frente, fundo e o lado sem escada) e chaminé
    const rail = (tile: number, px: number, pz: number, len: number, alongX: boolean) => {
      const p = this.addPiece('rail', hi, px, h + 0.3 + 0.14, pz, alongX ? len / 2 : 0.07, 0.14, alongX ? 0.07 : len / 2, 0, ctrim, false);
      p.parent = tile;
      this.inst(p, mL, ctrim);
    };
    for (let i = 0; i < nx; i++) {
      rail(grid[i][0], rx0 + (i + 0.5) * tw, rz0 + 0.07, tw, true);
      rail(grid[i][nz - 1], rx0 + (i + 0.5) * tw, rz0 + RD - 0.07, tw, true);
    }
    const railX = s.side > 0 ? 0 : nx - 1;
    for (let j = 0; j < nz; j++) rail(grid[railX][j], s.side > 0 ? rx0 + 0.07 : rx0 + RW - 0.07, rz0 + (j + 0.5) * td, td, false);
    {
      const ti = grid[s.side < 0 ? nx - 1 : 0][nz - 1];
      const tp = this.pieces[ti];
      const cx = s.side < 0 ? x1 - 0.8 : x0 + 0.8;
      const p = this.addPiece('chim', hi, cx, h + 0.3 + 0.5, z1 - 0.8, 0.3, 0.5, 0.3, 0, new THREE.Color('#ffffff'), true);
      p.parent = ti;
      void tp;
      this.inst(p, mC, new THREE.Color('#ffffff'));
    }
    // piso de tábuas, tapete e degrau da porta (estáticos, um desenho só no fim)
    {
      const o: THREE.BufferGeometry[] = [];
      box(o, x, 0.025, z, w - 0.2, 0.05, d - 0.2, '#ffffff', 1, false);
      this.staticParts.floor.push(...o);
      const r: THREE.BufferGeometry[] = [];
      box(r, x + (s.side < 0 ? 0.5 : -0.5), 0.06, z + 0.3, Math.min(2.6, w - 2.2), 0.02, Math.min(2.2, d - 2), croof.clone().lerp(new THREE.Color('#ffffff'), 0.35).getHex(), 1, false);
      box(r, x, 0.06, z0 - 0.55, 2.2, 0.12, 0.9, '#b9b2a6', 1, false);
      this.staticParts.misc.push(...r);
    }
    return hi;
  }
  private staticParts: { floor: THREE.BufferGeometry[]; misc: THREE.BufferGeometry[] } = { floor: [], misc: [] };

  /** cria as malhas instanciadas (depois de todas as casas) */
  finish(): void {
    const shadow = this.host.tier >= 2;
    for (const m of this.meshes.values()) {
      const n = m.mats.length;
      if (!n) continue;
      const im = new THREE.InstancedMesh(m.geo, m.mat, n);
      for (let i = 0; i < n; i++) {
        im.setMatrixAt(i, m.mats[i]);
        im.setColorAt(i, m.cols[i]);
      }
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = shadow && m.shadow;
      im.receiveShadow = true;
      // peças voam: sem recorte por esfera (poucas malhas)
      im.frustumCulled = false;
      m.im = im;
      this.group.add(im);
    }
    if (this.staticParts.floor.length) {
      const g = merge(this.staticParts.floor);
      const fm = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.8, vertexColors: true });
      this.mats.push(fm);
      const mm = new THREE.Mesh(g, fm);
      mm.receiveShadow = true;
      this.group.add(mm);
      this.statics.push(mm);
    }
    if (this.staticParts.misc.length) {
      const g = merge(this.staticParts.misc);
      const mm = new THREE.Mesh(g, this.matTrim);
      mm.receiveShadow = true;
      this.group.add(mm);
      this.statics.push(mm);
    }
    this.staticParts = { floor: [], misc: [] };
  }

  /* ------------------------------ estado ------------------------------ */

  /** fração de placas do telhado ainda de pé */
  roofLeft(h: number): number {
    const r = this.houses[h]?.roof;
    if (!r || !r.length) return 0;
    let n = 0;
    for (const i of r) if (this.pieces[i].st === 0) n++;
    return n / r.length;
  }
  wallsLeft(h: number): number {
    const r = this.houses[h]?.walls;
    if (!r || !r.length) return 0;
    let n = 0;
    for (const i of r) if (this.pieces[i].st === 0) n++;
    return n / r.length;
  }
  /** peças soltas caindo/voando rápido que acertam (x,y,z) — perigo para quem está embaixo */
  hitsAt(x: number, y: number, z: number, h: number): boolean {
    for (const li of this.loose) {
      const p = this.pieces[li];
      const b = p.body;
      if (!b || p.fade > 0) continue;
      const v = b.velocity;
      // só o que é pesado e vem rápido (parede, laje, pilar); mureta/toldo/vidro não derrubam ninguém
      if (p.k === 'rail' || p.k === 'awn' || p.k === 'chim' || v.x * v.x + v.y * v.y + v.z * v.z < 49) continue;
      const r = Math.max(p.hx, p.hy, p.hz) * 0.75 + 0.3;
      if (Math.abs(b.position.x - x) < r && Math.abs(b.position.z - z) < r && b.position.y - r < y + h && b.position.y + r > y) return true;
    }
    return false;
  }
  get activeBodies(): number {
    return this.loose.length;
  }

  /* ------------------------------ dano ------------------------------ */

  /** tira HP; sem HP a peça solta (ou explode em lascas). (ix,iy,iz) = velocidade do empurrão */
  hit(i: number, dmg: number, ix: number, iy: number, iz: number, shatter = false): void {
    const p = this.pieces[i];
    if (!p || p.st !== 0 || dmg <= 0) return;
    p.hp -= dmg;
    // vidro estoura cedo
    if (p.glass >= 0 && p.hp < p.max * 0.75) this.breakGlass(p, ix, iz);
    if (p.hp <= 0) {
      if (shatter || dmg > p.max * 2.2) this.crumble(i, ix, iy, iz);
      else this.detach(i, ix, iy, iz);
      return;
    }
    // trincado: a peça escurece
    this.tint(p, 0.62 + 0.38 * (p.hp / p.max));
  }
  private tint(p: Piece, k: number): void {
    for (const pt of p.parts) {
      const im = pt.m.im;
      if (!im) continue;
      im.setColorAt(pt.i, _c.copy(pt.m.cols[pt.i]).multiplyScalar(k));
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  private breakGlass(p: Piece, ix: number, iz: number): void {
    const mG = this.meshes.get('glass');
    if (!mG?.im || p.glass < 0) return;
    mG.im.setMatrixAt(p.glass, ZERO);
    mG.im.instanceMatrix.needsUpdate = true;
    p.glass = -1;
    _c.set('#bfe6ff');
    const y = p.y - p.hy + (WIN.y0 + WIN.y1) / 2;
    for (let k = 0; k < 7; k++) this.chip(p.x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 0.4, ix * 0.3 + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, iz * 0.3 + (Math.random() - 0.5) * 3, 0.07 + Math.random() * 0.08, _c);
    this.host.crack(p.x, p.z, false);
  }
  /** a peça sai do lugar: colisão some, a peça vira um corpo que voa/tomba */
  private detach(i: number, vx: number, vy: number, vz: number): void {
    const p = this.pieces[i];
    if (p.st !== 0) return;
    if (this.loose.length >= this.budget || p.hx * p.hy * p.hz < 0.002) {
      this.crumble(i, vx, vy, vz);
      return;
    }
    this.release(p);
    p.st = 1;
    p.fall = 0;
    const mass = Math.max(4, p.hx * p.hy * p.hz * 8 * DENS * 0.1);
    const b = new CANNON.Body({ mass, shape: new CANNON.Box(new CANNON.Vec3(p.hx, p.hy, p.hz)) });
    b.position.set(p.x, p.y, p.z);
    b.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
    b.velocity.set(vx, vy, vz);
    // giro: paredes tombam para fora, placas rodopiam
    const sp = Math.min(6, 0.6 + Math.hypot(vx, vy, vz) * 0.35);
    b.angularVelocity.set((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp);
    if (p.k === 'wall' || p.k === 'win' || p.k === 'door' || p.k === 'pillar') {
      // eixo local x (ao longo da parede) → tomba para fora (+z local)
      _v.set(1, 0, 0).applyQuaternion(p.q);
      const tip = 1.2 + Math.random() * 0.8;
      b.angularVelocity.set(_v.x * tip, b.angularVelocity.y * 0.3, _v.z * tip);
    }
    b.linearDamping = 0.04;
    b.angularDamping = 0.08;
    b.allowSleep = true;
    b.sleepSpeedLimit = 0.35;
    b.sleepTimeLimit = 0.8;
    this.host.world.addBody(b);
    p.body = b;
    p.life = 0;
    p.fade = 0;
    this.loose.push(i);
    this.tint(p, 0.85);
    this.host.puff(p.x, p.y - p.hy + 0.3, p.z, 3, 3);
    this.host.crack(p.x, p.z, p.k !== 'rail' && p.k !== 'awn');
  }
  /** explode em lascas (golpe forte ou sem orçamento de corpos) */
  private crumble(i: number, vx: number, vy: number, vz: number): void {
    const p = this.pieces[i];
    if (p.st === 2) return;
    if (p.st === 0) this.release(p);
    if (p.body) {
      this.host.world.removeBody(p.body);
      p.body = null;
      const li = this.loose.indexOf(i);
      if (li >= 0) this.loose.splice(li, 1);
    }
    p.st = 2;
    for (const pt of p.parts) {
      if (!pt.m.im) continue;
      pt.m.im.setMatrixAt(pt.i, ZERO);
      pt.m.dirty = true;
    }
    const n = Math.min(10, 3 + Math.round(p.hx * p.hy * 4));
    _c.copy(p.col).multiplyScalar(0.85);
    for (let k = 0; k < n; k++) {
      _v.set((Math.random() - 0.5) * 2 * p.hx, (Math.random() - 0.5) * 2 * p.hy, (Math.random() - 0.5) * 2 * p.hz).applyQuaternion(p.q);
      this.chip(p.x + _v.x, p.y + _v.y, p.z + _v.z, vx * 0.6 + (Math.random() - 0.5) * 5, vy * 0.6 + 2 + Math.random() * 4, vz * 0.6 + (Math.random() - 0.5) * 5, 0.12 + Math.random() * 0.22, _c);
    }
    this.host.puff(p.x, p.y, p.z, 4, 4);
    this.host.crack(p.x, p.z, true);
  }
  /** tira colisão e marca a casa para checar apoios */
  private release(p: Piece): void {
    for (const b of p.boxes) {
      b.y0 = -60;
      b.y1 = -59;
    }
    for (const sb of p.sbs) this.host.world.removeBody(sb);
    p.sbs = [];
    if (p.glass >= 0) this.breakGlass(p, 0, 0);
    this.houses[p.h].dirty = true;
    this.broken++;
  }

  /** explosão/impacto: dano e empurrão que caem com a distância */
  blast(x: number, y: number, z: number, r: number, power: number): void {
    const R2 = r * 2.2;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.st !== 0) continue;
      const dx = p.x - x;
      const dy = p.y - y;
      const dz = p.z - z;
      const d = Math.hypot(dx, dy * 0.7, dz);
      const reach = R2 + Math.max(p.hx, p.hz);
      if (d > reach) continue;
      const f = 1 - d / reach;
      const k = power * f;
      const l = d || 1;
      const sp = 3 + k * 0.08;
      // golpe leve (granizo, destroço de vento): só vidro, mureta, toldo e chaminé — a estrutura aguenta
      const light = power < 40;
      if (light && (p.k === 'wall' || p.k === 'door' || p.k === 'pillar' || p.k === 'roof')) continue;
      let dmg = k * (p.k === 'pillar' ? 0.6 : 1);
      if (light && p.k === 'win') dmg = Math.min(dmg, Math.max(0, p.hp - p.max * 0.5));
      this.hit(i, dmg, (dx / l) * sp, 2 + sp * 0.7, (dz / l) * sp, f > 0.75 && power > 150);
    }
    this.pushLoose(x, z, R2 + 1, power * 0.08);
  }
  /** tremor: dano aleatório (peças altas e soltinhas primeiro) */
  quake(dt: number, k: number): void {
    if (k <= 0.05) return;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.st !== 0) continue;
      const kf = p.k === 'chim' || p.k === 'rail' || p.k === 'awn' ? 3 : p.k === 'roof' ? 0.9 : p.k === 'pillar' ? 0.45 : p.k === 'win' ? 1.2 : 1;
      if (Math.random() > dt * 2.2) continue;
      // golpes desiguais: algumas peças aguentam, outras rompem
      const dmg = k * kf * (-Math.log(Math.random() + 1e-4)) * 2.1;
      this.hit(i, dmg, (Math.random() - 0.5) * 2, 0.5, (Math.random() - 0.5) * 2);
    }
    for (const li of this.loose) {
      const b = this.pieces[li].body;
      if (b && Math.random() < dt * 3 * k) {
        b.wakeUp();
        b.velocity.x += (Math.random() - 0.5) * 1.5 * k;
        b.velocity.z += (Math.random() - 0.5) * 1.5 * k;
      }
    }
  }
  /** vento (direção dx,dz normalizada; força 0..1): fachada de barlavento, vidros, mureta, telhado */
  wind(dt: number, dx: number, dz: number, s: number): void {
    if (s <= 0.02) return;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.st !== 0) continue;
      let ex = 0.4;
      if (p.k === 'wall' || p.k === 'win' || p.k === 'door') {
        _v.set(0, 0, 1).applyQuaternion(p.q);
        ex = Math.max(0, -(_v.x * dx + _v.z * dz));
      }
      // a laje só voa inteira (blowRoof, decidido pelo jogo): o vento arranca o que é leve e estoura vidros
      const kf = p.k === 'rail' || p.k === 'awn' ? 12 : p.k === 'chim' ? 6 : p.k === 'win' ? 8 : p.k === 'roof' || p.k === 'pillar' ? 0 : 0.6;
      let dmg = kf * ex * s * dt * (0.5 + Math.random());
      // janela: o vento estoura o vidro, mas o painel (parede) fica de pé
      if (p.k === 'win') dmg = Math.min(dmg, Math.max(0, p.hp - p.max * 0.5));
      if (dmg > 0) this.hit(i, dmg, dx * (6 + 8 * s), 2 + 4 * s, dz * (6 + 8 * s));
    }
    for (const li of this.loose) {
      const b = this.pieces[li].body;
      if (!b) continue;
      b.wakeUp();
      b.applyForce(new CANNON.Vec3(dx * b.mass * 9 * s, b.mass * 2 * s, dz * b.mass * 9 * s));
    }
  }
  /** tornado: o funil arranca peças perto e suga as soltas */
  vortex(dt: number, x: number, z: number, r: number, k: number): void {
    const R = r + 3;
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.st !== 0) continue;
      const dx = p.x - x;
      const dz = p.z - z;
      const d = Math.hypot(dx, dz);
      if (d > R + Math.max(p.hx, p.hz)) continue;
      const f = Math.max(0.15, 1 - d / R);
      // a laje só sai pelo ripRoof do jogo (mesma regra de antes: tempo em cima da casa)
      const kf = p.k === 'rail' || p.k === 'awn' || p.k === 'chim' ? 3 : p.k === 'roof' ? 0 : p.k === 'win' ? 1 : p.k === 'pillar' ? 0.1 : 0.22;
      const l = d || 1;
      // tangencial + para cima
      this.hit(i, 70 * k * f * kf * dt * (0.5 + Math.random()), (-dz / l) * 9 - (dx / l) * 2, 8 + 6 * f, (dx / l) * 9 - (dz / l) * 2);
    }
    for (const li of this.loose) {
      const b = this.pieces[li].body;
      if (!b) continue;
      const ex = x - b.position.x;
      const ez = z - b.position.z;
      const dist = Math.hypot(ex, ez);
      if (dist > 11) continue;
      b.wakeUp();
      const kf = b.mass * (1 - dist / 11) * 26;
      b.applyForce(new CANNON.Vec3((ex / (dist || 1)) * kf - (ez / (dist || 1)) * kf, kf * (b.position.y < 9 ? 1.1 : -0.3), (ez / (dist || 1)) * kf + (ex / (dist || 1)) * kf));
    }
  }
  /** frente de onda (tsunami/lava): bate nas peças baixas logo atrás da frente */
  wave(dt: number, front: number, dir: number, level: number, power: number): void {
    for (let i = 0; i < this.pieces.length; i++) {
      const p = this.pieces[i];
      if (p.st !== 0 || p.y - p.hy > level - 0.2) continue;
      const u = (front - p.x) * dir;
      if (u < -0.5 || u > 2.5) continue;
      const kf = p.k === 'win' ? 2 : p.k === 'awn' || p.k === 'rail' ? 3 : p.k === 'door' ? 0.45 : p.k === 'pillar' || p.k === 'roof' ? 0 : 0.3;
      let dmg = power * kf * dt * (0.6 + Math.random() * 0.8);
      if (p.k === 'win') dmg = Math.min(dmg, Math.max(0, p.hp - p.max * 0.5));
      this.hit(i, dmg, dir * 7, 1.5, (Math.random() - 0.5) * 2);
    }
  }
  /** o telhado inteiro voa (tornado/rajada/pisão): placas sobem rodando na direção do vento */
  blowRoof(h: number, dx: number, dz: number): void {
    const info = this.houses[h];
    if (!info) return;
    const list = info.pieces.filter((i) => {
      const k = this.pieces[i].k;
      return this.pieces[i].st === 0 && (k === 'roof' || k === 'rail' || k === 'chim' || k === 'awn');
    });
    list.sort(() => Math.random() - 0.5);
    for (const i of list) {
      const p = this.pieces[i];
      // as primeiras voam inteiras; o resto vira lascas (orçamento)
      if (p.k === 'roof' && this.loose.length < this.budget) this.detach(i, dx * (4 + Math.random() * 5), 7 + Math.random() * 5, dz * (4 + Math.random() * 5));
      else this.crumble(i, dx * 5, 5, dz * 5);
    }
    info.lost = true;
  }
  private pushLoose(x: number, z: number, r: number, k: number): void {
    for (const li of this.loose) {
      const b = this.pieces[li].body;
      if (!b) continue;
      const dx = b.position.x - x;
      const dz = b.position.z - z;
      const d = Math.hypot(dx, dz);
      if (d > r) continue;
      b.wakeUp();
      const f = (1 - d / r) * k * b.mass * 0.6;
      b.applyImpulse(new CANNON.Vec3((dx / (d || 1)) * f, f * 1.2, (dz / (d || 1)) * f));
    }
  }

  /* ------------------------------ apoios ------------------------------ */

  private alive(i: number): boolean {
    const p = this.pieces[i];
    return !!p && p.st === 0 && p.fall <= 0;
  }
  private checkSupport(h: number): void {
    const info = this.houses[h];
    info.dirty = false;
    const P = this.pieces;
    // paredes vivas: se quase todas caíram, a laje vem abaixo
    let wl = 0;
    for (const i of info.walls) if (this.alive(i)) wl++;
    const weak = wl / Math.max(1, info.walls.length) < 0.34;
    // placas: ancoradas (apoio vivo embaixo) e ligadas às ancoradas pelas vizinhas
    const seen = new Set<number>();
    const queue: number[] = [];
    if (!weak)
      for (const i of info.roof)
        if (this.alive(i) && P[i].sup.some((s) => this.alive(s))) {
          seen.add(i);
          queue.push(i);
        }
    while (queue.length) {
      const i = queue.pop()!;
      for (const n of P[i].nb)
        if (!seen.has(n) && this.alive(n) && P[n].k === 'roof') {
          seen.add(n);
          queue.push(n);
        }
    }
    for (const i of info.roof) if (this.alive(i) && !seen.has(i)) this.schedule(i, 0.05 + Math.random() * 0.35);
    // paredes/pilares sem vizinha viva nem laje em cima tombam
    for (const i of info.walls) {
      if (!this.alive(i)) continue;
      const p = P[i];
      const held = p.nb.some((n) => this.alive(n)) || p.sup.some((s) => this.alive(s));
      if (!held) this.schedule(i, 0.2 + Math.random() * 0.5);
    }
    // penduradas: mureta/chaminé (placa), toldo (porta)
    for (const i of info.pieces) {
      const p = P[i];
      if (p.parent >= 0 && this.alive(i) && !this.alive(p.parent)) this.schedule(i, 0.02 + Math.random() * 0.15);
    }
  }
  private schedule(i: number, t: number): void {
    const p = this.pieces[i];
    if (p.st !== 0 || p.fall > 0) return;
    p.fall = t;
    this.falling.push(i);
  }
  private falling: number[] = [];

  /* ------------------------------ quadro ------------------------------ */

  update(dt: number): void {
    // quedas agendadas (cascata)
    for (let k = this.falling.length - 1; k >= 0; k--) {
      const i = this.falling[k];
      const p = this.pieces[i];
      if (p.st !== 0) {
        this.falling.splice(k, 1);
        continue;
      }
      p.fall -= dt;
      if (p.fall <= 0) {
        p.fall = 0;
        this.falling.splice(k, 1);
        this.detach(i, (Math.random() - 0.5) * 1.2, -0.5, (Math.random() - 0.5) * 1.2);
      }
    }
    for (let h = 0; h < this.houses.length; h++) {
      const info = this.houses[h];
      if (info.dirty) this.checkSupport(h);
      if (!info.lost && info.roof.length && this.roofLeft(h) < 0.55) {
        info.lost = true;
        this.host.roofLost(h);
      }
    }
    // peças soltas: seguem o corpo; dormiu ou passou do tempo → encolhe e some
    for (let k = this.loose.length - 1; k >= 0; k--) {
      const i = this.loose[k];
      const p = this.pieces[i];
      const b = p.body!;
      p.life += dt;
      const bad = !Number.isFinite(b.position.x + b.position.y + b.position.z);
      if (p.fade <= 0 && (bad || b.position.y < -8 || p.life > 9 || (p.life > 1.5 && b.sleepState === CANNON.Body.SLEEPING))) p.fade = 0.001;
      let sk = 1;
      if (p.fade > 0) {
        p.fade += dt;
        sk = Math.max(0, 1 - p.fade / 0.9);
        if (sk <= 0 || bad) {
          this.host.world.removeBody(b);
          p.body = null;
          p.st = 2;
          this.loose.splice(k, 1);
          for (const pt of p.parts) {
            if (!pt.m.im) continue;
            pt.m.im.setMatrixAt(pt.i, ZERO);
            pt.m.dirty = true;
          }
          continue;
        }
      }
      _q.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
      _m.compose(_v.set(b.position.x, b.position.y - (1 - sk) * p.hy, b.position.z), _q, _s.copy(p.sc).multiplyScalar(sk));
      for (const pt of p.parts) {
        if (!pt.m.im) continue;
        pt.m.im.setMatrixAt(pt.i, _m);
        pt.m.dirty = true;
      }
    }
    for (const m of this.meshes.values()) {
      if (!m.dirty || !m.im) continue;
      m.dirty = false;
      m.im.instanceMatrix.needsUpdate = true;
    }
    // lascas (balística simples, quicam no chão e encolhem)
    if (this.chipLive > 0) {
      let live = 0;
      for (let i = 0; i < this.chips.length; i++) {
        const c = this.chips[i];
        if (!c.on) continue;
        c.life -= dt;
        if (c.life <= 0) {
          c.on = false;
          this.chipIm.setMatrixAt(i, ZERO);
          continue;
        }
        live++;
        c.v.y -= 22 * dt;
        c.p.addScaledVector(c.v, dt);
        if (c.p.y < c.s * 0.5) {
          c.p.y = c.s * 0.5;
          c.v.y = Math.abs(c.v.y) * 0.3;
          c.v.x *= 0.6;
          c.v.z *= 0.6;
          c.w.multiplyScalar(0.6);
        }
        c.r.x += c.w.x * dt;
        c.r.y += c.w.y * dt;
        c.r.z += c.w.z * dt;
        const sk = Math.min(1, c.life / 0.6);
        _m.compose(c.p, _q.setFromEuler(c.r), _s.setScalar(c.s * sk));
        this.chipIm.setMatrixAt(i, _m);
      }
      this.chipLive = live;
      this.chipIm.instanceMatrix.needsUpdate = true;
    }
  }
  private chip(x: number, y: number, z: number, vx: number, vy: number, vz: number, s: number, col: THREE.Color): void {
    const i = this.chipHead++ % this.chips.length;
    const c = this.chips[i];
    c.on = true;
    c.p.set(x, y, z);
    c.v.set(vx, vy, vz);
    c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    c.w.set((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14);
    c.s = s;
    c.life = 1.8 + Math.random() * 1.4;
    this.chipIm.setColorAt(i, col);
    if (this.chipIm.instanceColor) this.chipIm.instanceColor.needsUpdate = true;
    this.chipLive++;
  }
  /** peças da casa i ainda de pé (para quem quiser mirar) */
  standing(h: number): number {
    return this.houses[h]?.pieces.filter((i) => this.pieces[i].st === 0).length ?? 0;
  }
  dispose(): void {
    this.clear();
    this.chipIm.geometry.dispose();
    (this.chipIm.material as THREE.Material).dispose();
    this.chipIm.removeFromParent();
    this.group.removeFromParent();
  }
  /** usado pelo e2e: quebra tudo num raio (nada além de blast) */
  debugBlast(x: number, z: number): void {
    this.blast(x, 1.5, z, 3, 260);
  }
}
void _e;
