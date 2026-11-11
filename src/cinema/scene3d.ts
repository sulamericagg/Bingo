/* ============================================================
 *  BLOOP CINEMA — modo 3D (three.js, carregado sob demanda).
 *  - Mesmos atores do 2D: corpo do Bloop em 3D (cor/forma do avatar),
 *    rosto/expressões projetados como textura (mesmo desenho do 2D),
 *    acessório de cabeça e costas como "recortes" (sprites), bracinhos
 *    e pezinhos animados pelo MESMO rig das poses 2D.
 *  - Cenários: fundo pintado do 2D vira o "painel" do fundo + adereços 3D.
 *  - Cenário importado do Bloop Studio (Criação) — ver loadStudioSet().
 *  Renderiza num canvas WebGL fora da tela e copia para o quadro 2D
 *  (onde entram balões, efeitos e marca d'água).
 * ============================================================ */
import * as THREE from 'three';
import { bgBitmap, bgDef, BG_W, BG_X0, BG_Y0 } from './bg2d';
import { actorH, ease, type ActorEval, type Renderer3D } from './engine';
import { FLOOR_Y, STAGE_W, type Cam3dPreset, type CamKey, type CastMember, type Project, type ShotRef } from './format';
import type { ActorScreen } from './fx2d';
import { blendRig, drawBackTex, drawFaceTex, drawHeadTex, radiusFor, restRig, type Rig } from './rig2d';
import { SHAPES } from '../game/avatar-gfx';
import { drawCreature } from '../creatures/render';
import { lookSig } from '../makeup/format';

const U = 0.6; // metros por unidade do palco
const INK = 0x2a0b5c;
const wx = (x: number) => (x - STAGE_W / 2) * U;
const wz = (z: number) => z * 0.9;

let gradTex: THREE.DataTexture | null = null;
function toonGrad(): THREE.DataTexture {
  if (gradTex) return gradTex;
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradTex = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  gradTex.minFilter = gradTex.magFilter = THREE.NearestFilter;
  gradTex.needsUpdate = true;
  return gradTex;
}
const mats = new Map<string, THREE.Material>();
function toon(color: string | number): THREE.MeshToonMaterial {
  const k = 't' + color;
  let m = mats.get(k) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: toonGrad() });
    mats.set(k, m);
  }
  return m;
}
const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });

/* ---------------------------- adereços ---------------------------- */
function mesh(g: THREE.BufferGeometry, color: string | number, outline = true): THREE.Mesh {
  const m = new THREE.Mesh(g, toon(color));
  if (outline) {
    const o = new THREE.Mesh(g, inkMat);
    o.scale.setScalar(1.06);
    m.add(o);
  }
  return m;
}
const BOX = (w: number, h: number, d: number, c: string, x = 0, y = 0, z = 0) => {
  const m = mesh(new THREE.BoxGeometry(w, h, d), c);
  m.position.set(x, y + h / 2, z);
  return m;
};
const CYL = (r0: number, r1: number, h: number, c: string, x = 0, y = 0, z = 0, seg = 12) => {
  const m = mesh(new THREE.CylinderGeometry(r0, r1, h, seg), c);
  m.position.set(x, y + h / 2, z);
  return m;
};
const BALL = (r: number, c: string, x = 0, y = 0, z = 0) => {
  const m = mesh(new THREE.SphereGeometry(r, 16, 12), c);
  m.position.set(x, y, z);
  return m;
};
const CONE = (r: number, h: number, c: string, x = 0, y = 0, z = 0) => {
  const m = mesh(new THREE.ConeGeometry(r, h, 12), c);
  m.position.set(x, y + h / 2, z);
  return m;
};
function group(...o: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  o.forEach((x) => g.add(x));
  return g;
}
const at = (o: THREE.Object3D, x: number, z: number, ry = 0, s = 1) => {
  o.position.x += x;
  o.position.z += z;
  o.rotation.y = ry;
  o.scale.multiplyScalar(s);
  return o;
};

const P = {
  tree: (c = '#3ecf6e') => group(CYL(0.12, 0.16, 1.2, '#8a5a3c'), BALL(0.75, c, 0, 1.6, 0), BALL(0.5, c, 0.4, 1.3, 0.2)),
  pine: (c = '#1f8a5a') => group(CYL(0.08, 0.1, 0.4, '#6b4429'), CONE(0.7, 1.0, c, 0, 0.35), CONE(0.5, 0.8, c, 0, 0.95), CONE(0.32, 0.6, c, 0, 1.45)),
  bed: () => group(BOX(1.4, 0.35, 2.2, '#4f7dff', 0, 0.15), BOX(1.4, 0.8, 0.12, '#a86a3f', 0, 0, -1.1), BOX(0.9, 0.15, 0.5, '#ffffff', 0, 0.5, -0.75)),
  desk: () => group(BOX(1.4, 0.08, 0.7, '#c98a55', 0, 0.7), BOX(0.08, 0.7, 0.6, '#a86a3f', -0.62, 0), BOX(0.08, 0.7, 0.6, '#a86a3f', 0.62, 0)),
  chair: () => group(BOX(0.5, 0.06, 0.5, '#ff8f3b', 0, 0.42), BOX(0.5, 0.5, 0.06, '#ff8f3b', 0, 0.45, -0.22), CYL(0.03, 0.03, 0.42, '#5b5b6e', 0.2, 0, 0.2), CYL(0.03, 0.03, 0.42, '#5b5b6e', -0.2, 0, 0.2)),
  lamp: () => group(CYL(0.03, 0.03, 1.2, '#5b5b6e'), CONE(0.25, 0.3, '#ffd93b', 0, 1.15)),
  bench: () => group(BOX(1.6, 0.08, 0.45, '#c98a55', 0, 0.45), BOX(1.6, 0.35, 0.06, '#c98a55', 0, 0.55, -0.2), BOX(0.06, 0.45, 0.4, '#5b5b6e', -0.7, 0), BOX(0.06, 0.45, 0.4, '#5b5b6e', 0.7, 0)),
  umbrella: () => group(CYL(0.03, 0.03, 2.0, '#ffffff'), CONE(1.1, 0.45, '#ff5c5c', 0, 1.8)),
  palm: () => {
    const g = group(CYL(0.1, 0.16, 2.6, '#a86a3f'));
    for (let i = 0; i < 6; i++) {
      const l = BOX(1.4, 0.05, 0.35, '#3ecf6e', 0.6, 2.5, 0);
      const pv = new THREE.Group();
      pv.add(l);
      pv.rotation.y = (i / 6) * Math.PI * 2;
      pv.rotation.z = -0.25;
      g.add(pv);
    }
    return g;
  },
  rock: (c = '#9a92b8') => group(BALL(0.4, c, 0, 0.25, 0)),
  fridge: () => group(BOX(0.9, 2.0, 0.7, '#ffffff'), BOX(0.05, 0.5, 0.05, '#5b5b6e', -0.35, 1.2, 0.36)),
  counter: () => group(BOX(2.6, 0.9, 0.7, '#ff8f3b'), BOX(2.7, 0.08, 0.75, '#ffffff', 0, 0.9), BOX(0.7, 0.04, 0.5, '#2b2440', -0.5, 0.98)),
  table: () => group(BOX(1.4, 0.08, 0.9, '#c98a55', 0, 0.75), CYL(0.05, 0.05, 0.75, '#a86a3f', -0.6, 0, -0.35), CYL(0.05, 0.05, 0.75, '#a86a3f', 0.6, 0, -0.35), CYL(0.05, 0.05, 0.75, '#a86a3f', -0.6, 0, 0.35), CYL(0.05, 0.05, 0.75, '#a86a3f', 0.6, 0, 0.35)),
  cake: () => group(CYL(0.28, 0.28, 0.25, '#ff8fb8', 0, 0.83), CYL(0.2, 0.2, 0.18, '#fff3e0', 0, 1.08), BALL(0.05, '#ff2e3a', 0, 1.3, 0)),
  throne: () => group(BOX(1.0, 0.5, 0.8, '#ffd93b'), BOX(1.0, 1.6, 0.15, '#d42a4a', 0, 0.3, -0.35), BOX(0.9, 0.12, 0.7, '#d42a4a', 0, 0.5)),
  pillar: () => group(CYL(0.25, 0.25, 3, '#c4bce0'), BOX(0.7, 0.15, 0.7, '#a9a1c4', 0, 2.95)),
  streetlamp: () => group(CYL(0.05, 0.06, 2.6, '#2b2440'), BALL(0.18, '#ffe14f', 0, 2.7, 0)),
  car: (c = '#3fc8ff') => group(BOX(1.8, 0.5, 0.9, c, 0, 0.2), BOX(1.0, 0.4, 0.85, c, -0.1, 0.7), CYL(0.18, 0.18, 0.1, '#2b2440', -0.55, 0.0, 0.47), CYL(0.18, 0.18, 0.1, '#2b2440', 0.55, 0.0, 0.47)),
  mic: () => group(CYL(0.02, 0.02, 1.4, '#5b5b6e'), BALL(0.08, '#2b2440', 0, 1.45, 0), CYL(0.25, 0.25, 0.04, '#5b5b6e')),
  mushroom: () => group(CYL(0.08, 0.1, 0.3, '#fff3e0'), BALL(0.22, '#ff5c5c', 0, 0.32, 0)),
  cactus: () => group(CYL(0.18, 0.2, 1.4, '#3ecf6e'), CYL(0.1, 0.1, 0.5, '#3ecf6e', 0.3, 0.6, 0), BALL(0.18, '#3ecf6e', 0, 1.4, 0)),
  snowman: () => group(BALL(0.45, '#ffffff', 0, 0.45, 0), BALL(0.32, '#ffffff', 0, 1.1, 0), CONE(0.06, 0.25, '#ff8f3b', 0, 1.1, 0.3)),
  lolly: (c = '#ff5c8a') => group(CYL(0.04, 0.04, 1.6, '#ffffff'), CYL(0.5, 0.5, 0.1, c, 0, 1.6, 0)),
  grave: () => group(BOX(0.6, 0.8, 0.15, '#8a82ad')),
  chest: () => group(BOX(0.9, 0.5, 0.6, '#a86a3f'), BOX(0.92, 0.2, 0.62, '#c98a55', 0, 0.5)),
  coral: () => group(CYL(0.06, 0.1, 0.8, '#ff8fb8'), CYL(0.05, 0.05, 0.5, '#ff8fb8', 0.18, 0.4, 0), BALL(0.12, '#ff8fb8', 0, 0.82, 0)),
  tank: () => group(CYL(0.6, 0.6, 1.2, '#a86a3f', 0, 0.8), CYL(0.04, 0.04, 0.8, '#2b2440', -0.4), CYL(0.04, 0.04, 0.8, '#2b2440', 0.4)),
  rocket: () => group(CYL(0.35, 0.35, 1.8, '#ffffff'), CONE(0.35, 0.6, '#ff5c5c', 0, 1.8)),
  board: () => group(BOX(3.0, 1.4, 0.08, '#2f7a55', 0, 0.9)),
  spot: () => group(CYL(0.15, 0.25, 0.4, '#2b2440')),
};

interface SetDef {
  props: [keyof typeof P, number, number, number?, number?][];
  walls?: string;
}
const SETS: Record<string, SetDef> = {
  bedroom: { walls: '#d9c8ff', props: [['bed', -3.2, -1.6, 0.3], ['desk', 3.4, -2.4], ['chair', 3.4, -1.7, Math.PI], ['lamp', 2.8, -2.4]] },
  classroom: { walls: '#ffe9a8', props: [['desk', -3.2, -0.8], ['chair', -3.2, -0.2, Math.PI], ['desk', 3.2, -0.8], ['chair', 3.2, -0.2, Math.PI], ['table', 0, -2.4], ['board', 0, -3.2]] },
  park: { props: [['tree', -4.2, -2.2, 0, 1.2], ['tree', 4.4, -2.6, 0, 1.4], ['bench', 2.6, -2.0], ['rock', -2.2, -1.4], ['pine', -5.5, -3.2]] },
  beach: { props: [['umbrella', -3.0, -1.6], ['palm', 4.3, -2.2], ['rock', 2.0, -1.0], ['chest', -1.6, -2.4, 0.4]] },
  kitchen: { walls: '#c9f5e6', props: [['counter', -3.0, -2.6], ['fridge', 4.0, -2.6], ['table', 1.6, -1.2], ['cake', 1.6, -1.2]] },
  space: { props: [['rocket', 4.2, -2.4], ['rock', -3.0, -1.2, 0, 1.4], ['rock', -1.2, -2.6]] },
  castle: { walls: '#9d94bd', props: [['throne', 0, -2.8], ['pillar', -3.2, -2.4], ['pillar', 3.2, -2.4], ['chest', -4.5, -1.4]] },
  street: { props: [['streetlamp', 2.6, -1.6], ['car', -3.2, -2.2], ['streetlamp', -5.0, -1.6]] },
  stage: { walls: '#2a0b5c', props: [['mic', 0.4, -0.6], ['spot', -4.0, 1.6], ['spot', 4.0, 1.6]] },
  forest: { props: [['pine', -4.0, -2.0, 0, 1.3], ['pine', 4.0, -2.4, 0, 1.5], ['tree', 1.8, -3.0], ['mushroom', -1.6, -1.0], ['mushroom', 2.5, -0.8, 0, 0.7]] },
  underwater: { props: [['coral', -3.0, -1.6], ['coral', 3.4, -2.0, 0, 1.3], ['chest', 2.0, -2.6], ['rock', -1.2, -2.4]] },
  snow: { props: [['pine', -4.2, -2.4, 0, 1.3], ['snowman', 3.2, -1.6], ['pine', 4.6, -3.0]] },
  desert: { props: [['cactus', -3.6, -1.8], ['cactus', 4.0, -2.6, 0, 1.3], ['rock', 1.6, -1.6]] },
  candy: { props: [['lolly', -3.6, -1.8], ['lolly', 3.6, -2.2, 0, 1.2], ['cake', 1.2, -1.6]] },
  haunted: { props: [['grave', -2.6, -1.8], ['grave', 3.2, -2.2], ['pine', -4.6, -2.8]] },
  rooftop: { props: [['tank', 3.8, -2.4], ['streetlamp', -3.6, -2.0]] },
};

/* ---------------------------- Bloop Studio ---------------------------- */
/**
 * Formato mínimo que entendemos de uma Criação do Bloop Studio.
 * TODO(studio): quando src/studio/format.ts existir, trocar por `import type { Creation } from '../studio/format'`
 * e usar o parser oficial (versões/migrações). Até lá aceitamos qualquer JSON com uma lista de objetos
 * primitivos ({ shape|type: 'box'|'sphere'|'cylinder'|'cone', pos|p, rot|r (graus), scale|s, color }).
 */
export interface StudioLike {
  format?: string;
  v?: number;
  name?: string;
  objects?: StudioObj[];
  parts?: StudioObj[];
}
interface StudioObj {
  shape?: string;
  type?: string;
  pos?: number[];
  p?: number[];
  rot?: number[];
  r?: number[];
  scale?: number[];
  s?: number[];
  color?: string | number;
  c?: string | number;
}
export function loadStudioSet(json: unknown): THREE.Group | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as StudioLike;
  const list = j.objects ?? j.parts;
  if (!Array.isArray(list) || !list.length) return null;
  const g = new THREE.Group();
  for (const o of list.slice(0, 600)) {
    const shape = String(o.shape ?? o.type ?? 'box').toLowerCase();
    const geo =
      shape.includes('sph') || shape === 'ball'
        ? new THREE.SphereGeometry(0.5, 14, 10)
        : shape.includes('cyl')
          ? new THREE.CylinderGeometry(0.5, 0.5, 1, 14)
          : shape.includes('cone')
            ? new THREE.ConeGeometry(0.5, 1, 14)
            : new THREE.BoxGeometry(1, 1, 1);
    const col = o.color ?? o.c ?? '#c9b8a3';
    const m = mesh(geo, typeof col === 'number' ? col : String(col));
    const p = o.pos ?? o.p ?? [0, 0, 0];
    const r = o.rot ?? o.r ?? [0, 0, 0];
    const s = o.scale ?? o.s ?? [1, 1, 1];
    m.position.set(+p[0] || 0, +p[1] || 0, +p[2] || 0);
    m.rotation.set(((+r[0] || 0) * Math.PI) / 180, ((+r[1] || 0) * Math.PI) / 180, ((+r[2] || 0) * Math.PI) / 180);
    m.scale.set(+s[0] || 1, +s[1] || 1, +s[2] || 1);
    g.add(m);
  }
  // cabe no palco (~10 m)
  const box = new THREE.Box3().setFromObject(g);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min(1, 10 / Math.max(0.01, size.x, size.z));
  g.scale.setScalar(k);
  g.position.y = -box.min.y * k;
  return g;
}

/* ---------------------------- ator 3D ---------------------------- */
/** textura do rosto: 256 px; com maquiagem, maior conforme a qualidade (até 512) */
let facePxMax = 256;

class Actor3D {
  root = new THREE.Group();
  body = new THREE.Group();
  private bodyMesh: THREE.Mesh;
  private faceTex: THREE.CanvasTexture;
  private faceCv: HTMLCanvasElement;
  private faceKey = '';
  private facePx = 256;
  private arms: { up: THREE.Mesh; hand: THREE.Mesh }[] = [];
  private feet: THREE.Mesh[] = [];
  head: THREE.Sprite | null = null;
  private back: THREE.Sprite | null = null;
  private cre: { sp: THREE.Sprite; cv: HTMLCanvasElement; tex: THREE.CanvasTexture; last: number } | null = null;
  private shadow: THREE.Mesh;
  readonly R: number;
  readonly footBase: number;
  readonly topY: number;
  private sig: string;

  constructor(readonly cast: CastMember) {
    this.sig = Actor3D.sigOf(cast);
    const h = actorH(0) * U;
    this.R = radiusFor(h) * (cast.size ?? 1);
    const R = this.R;
    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sx = sc.getContext('2d')!;
    const gr = sx.createRadialGradient(32, 32, 2, 32, 32, 30);
    gr.addColorStop(0, 'rgba(20,0,40,.45)');
    gr.addColorStop(1, 'rgba(20,0,40,0)');
    sx.fillStyle = gr;
    sx.fillRect(0, 0, 64, 64);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.4, R * 2.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.root.add(this.shadow, this.body);
    this.faceCv = document.createElement('canvas');
    this.facePx = cast.makeup ? facePxMax : 256;
    this.faceCv.width = this.faceCv.height = this.facePx;
    this.faceTex = new THREE.CanvasTexture(this.faceCv);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;

    if (cast.kind === 'creature' && cast.creature) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      const s = R * 2.9;
      sp.scale.set(s, s, 1);
      sp.position.y = s * 0.45;
      this.body.add(sp);
      this.cre = { sp, cv, tex, last: -1 };
      this.bodyMesh = new THREE.Mesh();
      this.footBase = 0;
      this.topY = s * 0.9;
      return;
    }
    const av = cast.avatar!;
    const shp = SHAPES[av.parts.body] ?? SHAPES.b_blob;
    this.footBase = shp.bottom * R * 0.88 + R * 0.19;
    const P0 = av.colors.primary;
    const S0 = av.colors.secondary;
    // corpo: esfera com a proporção da forma 2D
    const hy = (shp.bottom - shp.top) / 2;
    const cy = (shp.bottom + shp.top) / 2; // deslocamento do centro (2D: +y = baixo)
    const geo = new THREE.SphereGeometry(R, 32, 24);
    this.bodyMesh = mesh(geo, P0);
    this.bodyMesh.scale.set(shp.side, hy, Math.min(shp.side, hy) * 0.92);
    this.bodyMesh.position.y = -cy * R;
    // barriguinha
    const belly = new THREE.Mesh(new THREE.SphereGeometry(R * 0.62, 20, 14), toon(S0));
    belly.scale.set(1, 0.85, 0.5);
    belly.position.set(0, -R * 0.38 - cy * R, R * 0.58 * Math.min(shp.side, hy));
    if (av.parts.pattern === 'p_belly' || av.parts.material === 'm_duo') this.body.add(belly);
    // orelhas do "Orelhudo"
    if (av.parts.body === 'b_cat') for (const s of [-1, 1]) this.body.add(at(CONE(R * 0.32, R * 0.6, P0, 0, -cy * R + R * 0.65, 0), s * R * 0.55, 0, 0));
    this.body.add(this.bodyMesh);
    // rosto projetado (UV planar frontal)
    const fg = new THREE.SphereGeometry(R * 1.012, 40, 28, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.08, Math.PI * 0.84);
    const pos = fg.getAttribute('position');
    const uv = fg.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (R * 2.6), 0.5 + pos.getY(i) / (R * 2.6));
    uv.needsUpdate = true; // phi = π/2 já é a frente (+Z)
    const face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, depthWrite: false }));
    face.renderOrder = 2;
    const fw = new THREE.Group();
    fw.add(face);
    fw.scale.copy(this.bodyMesh.scale);
    fw.position.copy(this.bodyMesh.position);
    this.body.add(fw);
    // braços
    const armGeo = new THREE.CylinderGeometry(R * 0.1, R * 0.1, 1, 8);
    armGeo.translate(0, 0.5, 0);
    const handGeo = new THREE.SphereGeometry(R * 0.16, 12, 8);
    for (let i = 0; i < 2; i++) {
      const up = mesh(armGeo, mixHex(P0, '#1a0830', 0.3));
      const hand = mesh(handGeo, P0);
      this.body.add(up, hand);
      this.arms.push({ up, hand });
    }
    // pés
    if (shp.feet)
      for (let i = 0; i < 2; i++) {
        const f = mesh(new THREE.SphereGeometry(R * 0.28, 14, 10), mixHex(P0, '#1a0830', 0.3));
        f.scale.set(1, 0.62, 1.25);
        this.root.add(f);
        this.feet.push(f);
      }
    this.topY = -shp.top * R;
    // acessórios recortados
    const mk = (draw: (x: CanvasRenderingContext2D) => boolean, scale: number, y: number, z: number): THREE.Sprite | null => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 256;
      const x = cv.getContext('2d')!;
      x.translate(128, 128);
      if (!draw(x)) return null;
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
      sp.scale.set(scale, scale, 1);
      sp.position.set(0, y, z);
      this.body.add(sp);
      return sp;
    };
    this.head = mk((x) => drawHeadTex(x, av, 256 / 4.2, 0.4), R * 4.2, -cy * R, R * 0.2);
    this.back = mk((x) => drawBackTex(x, av, 256 / 4.2, 0.4), R * 4.2, -cy * R, -R * 0.6);
    if (this.back) this.back.renderOrder = -1;
  }

  static sigOf(c: CastMember): string {
    return JSON.stringify([c.kind, c.avatar, c.creature, c.size, lookSig(c.makeup)]);
  }
  matches(c: CastMember): boolean {
    return Actor3D.sigOf(c) === this.sig;
  }

  update(a: ActorEval, rig: Rig): void {
    const R = this.R;
    const flip = a.face === -1 ? -1 : 1;
    this.root.position.set(wx(a.x), 0, wz(a.z));
    this.root.rotation.y = (a.face * Math.PI) / 3 + (rig.spin < 1 ? Math.acos(Math.max(-1, Math.min(1, rig.spin))) * (a.face || 1) : 0);
    const lift = (rig.hop - rig.dy * 0.9) * R + a.y * U;
    this.shadow.scale.setScalar(Math.max(0.4, 1 - Math.max(0, rig.hop) * 0.25));
    this.shadow.position.y = 0.01;
    // corpo
    const b = this.body;
    b.position.set(rig.shiver ? Math.sin(a.at * 50) * R * 0.03 : 0, this.footBase + lift, 0);
    b.rotation.set(rig.lean * 0.9, 0, 0);
    if (rig.lie) {
      b.rotation.x = -rig.lie * Math.PI * 0.5;
      b.position.y = R * 0.8 + lift * 0.2;
      b.position.z = -R * 0.6 * rig.lie;
    }
    b.scale.set(rig.sx, rig.sy, rig.sx);
    if (a.cap) {
      // cabeça capturada (o Bloop é cabeça e corpo): vira, inclina e deita
      b.rotation.y += a.cap.yaw * 0.9 * flip;
      b.rotation.x += a.cap.pit * 0.6;
      b.rotation.z += -a.cap.rol * 0.8 * flip;
    }
    if (this.cre) {
      const t = a.at;
      if (t - this.cre.last > 1 / 15 || this.cre.last < 0) {
        this.cre.last = t;
        const x = this.cre.cv.getContext('2d')!;
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, 256, 256);
        x.translate(128, 128);
        x.scale(flip, 1);
        const mood = a.expr === 'happy' || a.expr === 'laughing' || a.expr === 'love' ? 'happy' : a.expr === 'sad' || a.expr === 'crying' ? 'sad' : a.expr === 'sleepy' ? 'sleep' : 'idle';
        drawCreature(x, this.cast.creature!, 200, t, { mood });
        this.cre.tex.needsUpdate = true;
      }
      this.cre.sp.scale.y = R * 2.9 * (1 + a.talk * 0.06);
      return;
    }
    // braços: ombro → mão (rig 2D: x lateral, y para baixo)
    const sy0 = -0.12 * R;
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      const hx = (i ? rig.hrx : rig.hlx) * flip;
      const hy = i ? rig.hry : rig.hly;
      const front = i ? rig.hrf : rig.hlf;
      const s = new THREE.Vector3(sd * flip * 0.72 * R, sy0 + 0, 0);
      const h = new THREE.Vector3(hx * R * 0.9, -hy * R, (0.15 + front * 0.65) * R);
      const { up, hand } = this.arms[i];
      const d = h.clone().sub(s);
      const len = Math.max(0.01, d.length());
      up.position.copy(s);
      up.scale.set(1, len, 1);
      up.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      hand.position.copy(h);
    }
    // pés
    this.feet.forEach((f, i) => {
      const fx = i ? rig.frx : rig.flx;
      const ly = i ? rig.fry : rig.fly;
      const base = i ? 0.42 : -0.42;
      f.position.set(base * R * 0.9, R * 0.17 + ly * R + Math.max(0, lift) * (rig.hop > 0 ? 1 : 0), (fx - base) * R * flip * 0.9);
    });
    // rosto (só redesenha quando muda)
    const talkQ = Math.round(a.talk * 8);
    const blinkQ = Math.round(a.blink * 4);
    const animated = a.expr === 'crying' || a.expr === 'laughing' || a.expr === 'sleepy' || a.expr === 'love' || a.expr === 'dizzy' || a.expr === 'scared' || a.expr === 'sad' || a.expr === 'confused' || a.expr === 'wink';
    const cq = a.cap ? Object.values(a.cap).map((v) => Math.round(v * 12)).join(',') + (a.capMouth ? 'm' : '') : '';
    const key = `${a.expr}|${talkQ}|${blinkQ}|${animated || a.cap ? Math.floor(a.at * 15) : 0}|${Math.round(rig.lookX * 4)}|${Math.round(rig.lookY * 4)}|${cq}`;
    if (key !== this.faceKey) {
      this.faceKey = key;
      const x = this.faceCv.getContext('2d')!;
      x.setTransform(1, 0, 0, 1, 0, 0);
      const FP = this.facePx;
      x.clearRect(0, 0, FP, FP);
      const Rpx = FP / 2.6;
      x.translate(FP / 2, FP / 2);
      drawFaceTex(x, this.cast.avatar!, Rpx, a.expr, a.talk, a.blink, a.at, rig.lookX, rig.lookY, this.cast.makeup, a.cap, !!a.capMouth);
      this.faceTex.needsUpdate = true;
    }
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mm = m.material as THREE.Material & { map?: THREE.Texture | null };
      if (mm && !mats.has('t' + ((mm as THREE.MeshToonMaterial).color?.getHexString?.() ?? '')) && mm !== inkMat) {
        mm.map?.dispose();
      }
    });
    this.faceTex.dispose();
  }
}

function disposeTree(g: THREE.Object3D): void {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.MeshBasicMaterial | undefined;
    if (mat && mat.map) {
      mat.map.dispose();
      mat.dispose();
    }
  });
}

function mixHex(a: string, b: string, k: number): string {
  const A = parseInt(a.slice(1, 7), 16);
  const B = parseInt(b.slice(1, 7), 16);
  const ch = (s: number) => Math.round(((A >> s) & 255) * (1 - k) + ((B >> s) & 255) * k);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

/* ---------------------------- renderizador ---------------------------- */
export class Scene3D implements Renderer3D {
  private gl: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private set = new THREE.Group();
  private setKey = '';
  private actors = new Map<string, Actor3D>();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private rig: Rig = restRig();
  private seen = new Set<string>();
  readonly canvas: HTMLCanvasElement;

  constructor(tier: number) {
    facePxMax = tier >= 2 ? 512 : tier === 1 ? 384 : 256;
    this.canvas = document.createElement('canvas');
    this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: tier >= 2, alpha: false, powerPreference: 'default' });
    // sem preserveDrawingBuffer: o quadro é copiado para o canvas 2D (drawImage) logo depois do
    // render, na mesma tarefa — preservar o buffer obrigava uma cópia extra do quadro inteiro na GPU
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8a6ab0, 1.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    this.sun.position.set(3, 8, 6);
    this.scene.add(this.hemi, this.sun, this.set);
  }

  /** Cenários em cache (troca de cena numa transição não reconstrói nada a cada quadro). */
  private sets = new Map<string, { g: THREE.Group; sky: THREE.Color; night: boolean; dusk: boolean }>();
  private buildSet(ref: ShotRef): void {
    const sc = ref.scene;
    const key = `${sc.bg}|${sc.light}|${sc.studio ? sc.studio.name + JSON.stringify(sc.studio.json).length : ''}`;
    if (key === this.setKey) return;
    this.setKey = key;
    let e = this.sets.get(key);
    if (e) this.sets.delete(key);
    else e = this.makeSet(ref);
    this.sets.set(key, e);
    // no máximo 3 cenários vivos
    while (this.sets.size > 3) {
      const [k0, old] = this.sets.entries().next().value!;
      this.sets.delete(k0);
      this.set.remove(old.g);
      disposeTree(old.g);
    }
    for (const v of this.sets.values()) {
      v.g.visible = v === e;
      if (!v.g.parent) this.set.add(v.g);
    }
    this.scene.background = e.sky;
    this.scene.fog = new THREE.Fog(e.sky, 14, 40);
    this.hemi.intensity = e.night ? 0.7 : 1.6;
    this.hemi.color.set(e.dusk ? 0xffc9a0 : e.night ? 0x8899ff : 0xffffff);
    this.sun.intensity = e.night ? 0.5 : 1.6;
  }

  private makeSet(ref: ShotRef): { g: THREE.Group; sky: THREE.Color; night: boolean; dusk: boolean } {
    const sc = ref.scene;
    const g = new THREE.Group();
    const def = bgDef(sc.bg);
    const night = sc.light === 'night';
    const dusk = sc.light === 'dusk';
    const sky = new THREE.Color(def.sky).multiplyScalar(night ? 0.35 : dusk ? 0.8 : 1);
    const out = { g, sky, night, dusk };
    // chão
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 48), toon(def.floor));
    floor.rotation.x = -Math.PI / 2;
    g.add(floor);
    const studio = sc.studio ? loadStudioSet(sc.studio.json) : null;
    if (studio) {
      g.add(studio);
      return out;
    }
    // painel do fundo: a parte de cima (sem chão) do cenário 2D, espelhada nas laterais
    const bm = bgBitmap(sc.bg, sc.light, 60);
    const ppu = bm.width / BG_W;
    const cut = document.createElement('canvas');
    const topH = (FLOOR_Y - 0.25 - BG_Y0) * ppu;
    cut.width = bm.width;
    cut.height = Math.round(topH);
    cut.getContext('2d')!.drawImage(bm, 0, 0, bm.width, topH, 0, 0, bm.width, topH);
    const tex = new THREE.CanvasTexture(cut);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.MirroredRepeatWrapping;
    tex.repeat.x = 3;
    tex.offset.x = -1;
    const wW = BG_W * U * 1.25;
    const wH = (FLOOR_Y - 0.25 - BG_Y0) * U * 1.25;
    const back = new THREE.Mesh(new THREE.PlaneGeometry(wW * 3, wH), new THREE.MeshBasicMaterial({ map: tex, fog: false }));
    back.position.set(wx(BG_X0 + BG_W / 2), wH / 2, -3.6);
    g.add(back);
    const sd = SETS[sc.bg] ?? { props: [] };
    if (sd.walls)
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(9, wH), new THREE.MeshToonMaterial({ color: sd.walls, gradientMap: toonGrad(), side: THREE.DoubleSide }));
        w.position.set(s * wW * 0.5, wH / 2, 0.9);
        w.rotation.y = (s * Math.PI) / 2;
        g.add(w);
      }
    for (const [name, x, z, ry, s] of sd.props) {
      const f = P[name] as (c?: string) => THREE.Group;
      g.add(at(f(), x, z, ry ?? 0, s ?? 1));
    }
    return out;
  }

  private actorFor(c: CastMember): Actor3D {
    let a = this.actors.get(c.id);
    if (a && !a.matches(c)) {
      this.scene.remove(a.root);
      a.dispose();
      a = undefined;
    }
    if (!a) {
      a = new Actor3D(c);
      this.actors.set(c.id, a);
      this.scene.add(a.root);
    }
    return a;
  }

  private camPose(k: CamKey, ref: ShotRef, tl: number, list: ActorEval[]): { pos: THREE.Vector3; tgt: THREE.Vector3; fov: number } {
    const preset: Cam3dPreset = k.p3 ?? 'wide';
    const zoom = Math.max(0.4, k.zoom);
    const yaw = ((k.yaw ?? 0) * Math.PI) / 180;
    const head = (id?: string): THREE.Vector3 | null => {
      const a = id ? list.find((s) => s.cast.id === id) : undefined;
      if (!a) return null;
      const r = this.actors.get(a.cast.id);
      return new THREE.Vector3(wx(a.x), (r ? r.footBase + r.topY * 0.6 : 1) + a.y * U, wz(a.z));
    };
    let cx = 0;
    if (list.length) cx = list.reduce((s, a) => s + wx(a.x), 0) / list.length;
    const panX = (k.x - STAGE_W / 2) * U;
    const c = new THREE.Vector3(cx * 0.6 + panX, 0.85, 0);
    const shotK = tl / Math.max(0.1, ref.shot.dur);
    switch (preset) {
      case 'closeup': {
        const h = head(k.focus) ?? c.clone().setY(1.1);
        const d = 3.6 / zoom;
        // de frente para o rosto (meio caminho entre a plateia e para onde o ator olha)
        const fa = list.find((s) => s.cast.id === k.focus);
        const ang = yaw + ((fa?.face ?? 0) * Math.PI) / 6;
        return { pos: new THREE.Vector3(h.x + Math.sin(ang) * d, h.y + 0.35, h.z + Math.cos(ang) * d), tgt: h.clone().add(new THREE.Vector3(0, 0.05, 0)), fov: 34 };
      }
      case 'ots': {
        const B = head(k.focus) ?? c.clone();
        const A = head(k.focus2) ?? new THREE.Vector3(B.x - 2, B.y, B.z);
        const dir = A.clone().sub(B).setY(0);
        if (dir.lengthSq() < 0.01) dir.set(-1, 0, 0);
        dir.normalize();
        // lado do ombro: o que fica mais perto da plateia (+z)
        const side = new THREE.Vector3(-dir.z, 0, dir.x);
        if (side.z < 0) side.multiplyScalar(-1);
        const pos = A.clone()
          .add(dir.multiplyScalar(3.0 / zoom))
          .add(side.multiplyScalar(1.7))
          .add(new THREE.Vector3(0, 0.75, 0));
        return { pos, tgt: B.clone().add(new THREE.Vector3(0, -0.1, 0)), fov: 40 };
      }
      case 'orbit': {
        const ang = yaw + (shotK - 0.5) * 1.6;
        const d = 7.5 / zoom;
        return { pos: new THREE.Vector3(c.x + Math.sin(ang) * d, 2.3, Math.cos(ang) * d), tgt: c, fov: 40 };
      }
      case 'dolly': {
        const d = (10 - ease('inout', shotK) * 5) / zoom;
        const f = head(k.focus) ?? c;
        return { pos: new THREE.Vector3(f.x + Math.sin(yaw) * d, 1.6, f.z + Math.cos(yaw) * d), tgt: f, fov: 38 };
      }
      case 'low':
        return { pos: new THREE.Vector3(c.x + Math.sin(yaw) * 5, 0.25, 5.5 / zoom), tgt: new THREE.Vector3(c.x, 1.5, 0), fov: 44 };
      case 'high':
        return { pos: new THREE.Vector3(c.x + Math.sin(yaw) * 4, 7.5 / zoom, 6 / zoom), tgt: c, fov: 40 };
      case 'side':
        return { pos: new THREE.Vector3(c.x + 7.5 / zoom, 1.5, 2.5), tgt: c, fov: 40 };
      default: {
        const d = 9.5 / zoom;
        return { pos: new THREE.Vector3(c.x + Math.sin(yaw) * d, 2.4 + (zoom - 1) * -0.4, Math.cos(yaw) * d), tgt: new THREE.Vector3(c.x, 0.95, 0), fov: 40 };
      }
    }
  }

  render(ctx: CanvasRenderingContext2D, W: number, H: number, _p: Project, ref: ShotRef, tl: number, list: ActorEval[], shx: number, shy: number): ActorScreen[] {
    this.buildSet(ref);
    if (this.canvas.width !== W || this.canvas.height !== H) this.gl.setSize(W, H, false);
    // atores
    const seen = this.seen;
    seen.clear();
    for (const a of list) {
      const ac = this.actorFor(a.cast);
      seen.add(a.cast.id);
      blendRig(a.prevPose, a.pose, a.poseW, a.at + a.seed * 0.13, this.rig);
      if (a.face !== 0) this.rig.lookX += 0.45;
      ac.update(a, this.rig);
      ac.root.visible = true;
    }
    for (const [id, ac] of this.actors) if (!seen.has(id)) ac.root.visible = false;
    // câmera
    const keys = ref.shot.cam;
    let i = 0;
    for (let k = 0; k < keys.length; k++) if (keys[k].t <= tl) i = k;
    const A = this.camPose(keys[i], ref, tl, list);
    let pos = A.pos;
    let tgt = A.tgt;
    let fov = A.fov;
    const n = keys[i + 1];
    if (n) {
      const B = this.camPose(n, ref, tl, list);
      const u = ease(n.ease, (tl - keys[i].t) / Math.max(0.01, n.t - keys[i].t));
      pos = A.pos.clone().lerp(B.pos, u);
      tgt = A.tgt.clone().lerp(B.tgt, u);
      fov = A.fov + (B.fov - A.fov) * u;
    }
    this.cam.aspect = W / H;
    this.cam.fov = fov;
    this.cam.position.copy(pos);
    this.cam.lookAt(tgt);
    this.cam.updateProjectionMatrix();
    this.gl.render(this.scene, this.cam);
    ctx.save();
    if (shx || shy) {
      ctx.translate(W / 2 + shx, H / 2 + shy);
      ctx.scale(1.04, 1.04);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.drawImage(this.canvas, 0, 0, W, H);
    ctx.restore();
    // posições na tela
    const out: ActorScreen[] = [];
    const v = new THREE.Vector3();
    for (const a of list) {
      const ac = this.actors.get(a.cast.id)!;
      v.set(wx(a.x), a.y * U, wz(a.z)).project(this.cam);
      const fx = (v.x * 0.5 + 0.5) * W + shx;
      const fy = (-v.y * 0.5 + 0.5) * H + shy;
      const behind = v.z > 1;
      v.set(wx(a.x), ac.footBase + ac.topY + a.y * U, wz(a.z)).project(this.cam);
      const hy = (-v.y * 0.5 + 0.5) * H + shy;
      v.set(wx(a.x), ac.footBase + a.y * U, wz(a.z)).project(this.cam);
      const my = (-v.y * 0.5 + 0.5) * H + shy;
      const ppu = Math.max(4, (fy - hy) / (actorH(0) * 0.85));
      out.push({ cast: a.cast.id, x: fx, y: fy, headY: hy, mouthY: my, ppu, visible: !behind && fx > -W * 0.2 && fx < W * 1.2 });
    }
    return out;
  }

  dispose(): void {
    for (const a of this.actors.values()) a.dispose();
    this.actors.clear();
    disposeTree(this.set);
    this.set.clear();
    this.sets.clear();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}
