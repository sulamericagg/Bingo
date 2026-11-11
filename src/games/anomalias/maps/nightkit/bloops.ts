/* ============================================================
 *  NIGHTKIT — personagens do cenário:
 *  - Bebê Bloop (mesmo desenho dos Bloops do Noites: corpo redondo,
 *    olhos grandes com brilho, bochechas rosadas) em versão bebê:
 *    macacãozinho com pezinhos, chupeta, topete. O rosto é uma textura
 *    de canvas no corpo: trocar de rosto = trocar de material (barato).
 *    Rostos: dormindo, acordado, "anômalo" (olhos acesos + bocão de
 *    dentinhos de vampiro), sorrisão, olhar parado.
 *  - Bicho espiando (criatura fofa-assustadora de bocão e presas).
 *  - Silhueta de hóspede (vulto escuro na janela).
 *  2 chamadas de desenho por bebê, 2 pela criatura, 1 pela silhueta.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapKit } from './kit';
import { cv, texOf } from './tex';

const TAU = Math.PI * 2;

export type BabyFace = 'sleep' | 'awake' | 'angry' | 'grin' | 'stare';
export interface BabyCol {
  body: string;
  onesie: string;
  accent: string;
  eye: string;
  /** touca/laço */
  hat?: 'cap' | 'bow' | 'none';
}

export const BABY_COLS: BabyCol[] = [
  { body: '#ff9ec7', onesie: '#fff3b0', accent: '#ffb84d', eye: '#5a2a8a', hat: 'bow' },
  { body: '#8fd3ff', onesie: '#ffd6e8', accent: '#ff7aa8', eye: '#1e4a8a', hat: 'cap' },
  { body: '#9be8b4', onesie: '#d6e6ff', accent: '#6a8cff', eye: '#1e6a3a', hat: 'none' },
  { body: '#c9a8ff', onesie: '#c8f5e0', accent: '#3ec08a', eye: '#4a2a8a', hat: 'bow' },
  { body: '#ffd27a', onesie: '#e6d6ff', accent: '#9a6aff', eye: '#7a4a10', hat: 'cap' },
  { body: '#ffb39a', onesie: '#d0f0ff', accent: '#3aa0e0', eye: '#7a2a20', hat: 'none' },
];

/* ------------------------------ rosto em textura ------------------------------ */
function faceCanvas(c: BabyCol, f: BabyFace, glow: boolean): HTMLCanvasElement {
  const W = 256;
  const H = 128;
  const [cn, x] = cv(W, H);
  // corpo: degradê leve (mais claro em cima) — no mapa de brilho, preto
  if (glow) {
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
  } else {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(c.body, 0.18));
    g.addColorStop(0.55, c.body);
    g.addColorStop(1, shade(c.body, -0.12));
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  const cx = W * 0.25; // frente da esfera (+z)
  const ey = 54;
  const ex = 19;
  const eyeR = 13;
  if (!glow) {
    // bochechas
    x.fillStyle = 'rgba(255,110,160,0.45)';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(cx + s * 33, 72, 10, 6, 0, 0, TAU);
      x.fill();
    }
  }
  const openEye = (s: number, iris: string, pupil = 0.55, hi = true) => {
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.ellipse(cx + s * ex, ey, eyeR, eyeR * 1.15, 0, 0, TAU);
    x.fill();
    x.fillStyle = iris;
    x.beginPath();
    x.ellipse(cx + s * ex + 1.5, ey + 2, eyeR * pupil, eyeR * pupil * 1.15, 0, 0, TAU);
    x.fill();
    if (hi) {
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(cx + s * ex + 4, ey - 4, 3.6, 0, TAU);
      x.fill();
    }
  };
  switch (f) {
    case 'sleep':
      if (glow) break;
      x.strokeStyle = shade(c.body, -0.55);
      x.lineWidth = 3.2;
      x.lineCap = 'round';
      for (const s of [-1, 1]) {
        x.beginPath();
        x.arc(cx + s * ex, ey - 2, 8, 0.25, Math.PI - 0.25);
        x.stroke();
      }
      break;
    case 'awake':
      if (glow) break;
      openEye(-1, c.eye);
      openEye(1, c.eye);
      x.strokeStyle = shade(c.body, -0.55);
      x.lineWidth = 2.6;
      x.beginPath();
      x.arc(cx, 76, 6, 0.3, Math.PI - 0.3);
      x.stroke();
      break;
    case 'stare':
      if (glow) break;
      openEye(-1, '#111', 0.18, false);
      openEye(1, '#111', 0.18, false);
      x.fillStyle = shade(c.body, -0.55);
      x.fillRect(cx - 5, 80, 10, 2.5);
      break;
    case 'angry':
    case 'grin': {
      const angry = f === 'angry';
      const eyeCol = angry ? '#ff2a2a' : '#eaffff';
      // olhos acesos (o mapa de brilho repete só eles)
      for (const s of [-1, 1]) {
        x.fillStyle = glow ? eyeCol : angry ? '#ff3a3a' : '#f4ffff';
        x.beginPath();
        if (angry) {
          x.moveTo(cx + s * (ex - 11), ey - 6 + 6);
          x.lineTo(cx + s * (ex + 12), ey - 10 + 0);
          x.lineTo(cx + s * (ex + 9), ey + 9);
          x.lineTo(cx + s * (ex - 9), ey + 8);
        } else x.ellipse(cx + s * ex, ey - 2, eyeR * 1.1, eyeR * 1.25, 0, 0, TAU);
        x.closePath();
        x.fill();
        if (!glow) {
          x.fillStyle = angry ? '#5a0000' : '#101010';
          x.beginPath();
          x.ellipse(cx + s * ex + (angry ? s * 1 : 0), ey + (angry ? 1 : -2), 2.2, angry ? 6 : 3, 0, 0, TAU);
          x.fill();
        }
      }
      if (glow) break;
      // sobrancelhas bravas
      if (angry) {
        x.strokeStyle = shade(c.body, -0.6);
        x.lineWidth = 4;
        x.lineCap = 'round';
        for (const s of [-1, 1]) {
          x.beginPath();
          x.moveTo(cx + s * (ex + 12), ey - 18);
          x.lineTo(cx + s * (ex - 8), ey - 11);
          x.stroke();
        }
      }
      // bocão aberto com presinhas
      const mw = angry ? 30 : 40;
      const my = 78;
      const mh = angry ? 26 : 16;
      x.fillStyle = '#5a0a24';
      x.beginPath();
      if (angry) x.ellipse(cx, my + 4, mw * 0.8, mh * 0.75, 0, 0, TAU);
      else {
        x.moveTo(cx - mw, my - 4);
        x.quadraticCurveTo(cx, my + mh * 2.2, cx + mw, my - 4);
        x.quadraticCurveTo(cx, my + 6, cx - mw, my - 4);
      }
      x.fill();
      x.fillStyle = '#ff6a8a';
      x.beginPath();
      x.ellipse(cx, my + (angry ? 14 : 10), mw * 0.4, 5, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#ffffff';
      const fang = (px: number, py: number, len: number, up = false) => {
        x.beginPath();
        x.moveTo(px - 3.5, py);
        x.lineTo(px, py + (up ? -len : len));
        x.lineTo(px + 3.5, py);
        x.fill();
      };
      if (angry) {
        fang(cx - 10, my - 7, 11);
        fang(cx + 10, my - 7, 11);
        for (let i = -2; i <= 2; i++) fang(cx + i * 4.5, my + 18, 4, true);
      } else for (let i = -4; i <= 4; i++) fang(cx + i * 7.5, my - 3 + Math.abs(i) * -0.6, i === -3 || i === 3 ? 10 : 5);
      break;
    }
  }
  if (!glow) {
    // brilho de luz em cima (esfera de vinil)
    const hg = x.createRadialGradient(cx - 24, 18, 0, cx - 24, 18, 26);
    hg.addColorStop(0, 'rgba(255,255,255,0.35)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = hg;
    x.fillRect(0, 0, W, 50);
  }
  return cn;
}

function shade(hex: string, t: number): string {
  const c = new THREE.Color(hex);
  if (t > 0) c.lerp(new THREE.Color(1, 1, 1), t);
  else c.multiplyScalar(1 + t);
  return '#' + c.getHexString();
}

const faceMats = new WeakMap<MapKit, Map<string, THREE.Material>>();
function faceMat(k: MapKit, c: BabyCol, f: BabyFace): THREE.Material {
  let m = faceMats.get(k);
  if (!m) faceMats.set(k, (m = new Map()));
  const key = c.body + c.eye + f;
  let mat = m.get(key);
  if (!mat) {
    const glow = f === 'angry' || f === 'grin';
    const t = texOf(faceCanvas(c, f, false), false);
    mat = k.tmat(t, glow ? { emissive: '#ffffff', emissiveMap: texOf(faceCanvas(c, f, true), false) } : {});
    m.set(key, mat);
  }
  return mat;
}

export interface Baby {
  g: THREE.Group;
  body: THREE.Mesh;
  parts: THREE.Group;
  paci: THREE.Object3D;
  face: BabyFace;
  setFace(f: BabyFace): void;
  setPose(p: 'lie' | 'sit' | 'stand'): void;
  col: BabyCol;
  inner: THREE.Group;
}

const R = 0.17;
let sphereGeo: THREE.SphereGeometry | null = null;

/** Bebê Bloop. Origem: no chão/colchão sob o bebê. pose: deitado (barriga p/ cima), sentado, em pé */
export function babyBloop(k: MapKit, col: BabyCol, pose: 'lie' | 'sit' | 'stand', face: BabyFace = 'sleep', parent: THREE.Object3D = k.root): Baby {
  if (!sphereGeo || !sphereGeo.attributes.position) sphereGeo = new THREE.SphereGeometry(R, k.tier === 0 ? 18 : 26, k.tier === 0 ? 12 : 18);
  const g = new THREE.Group();
  const inner = new THREE.Group(); // corpo em pé, centro da esfera em y = R
  g.add(inner);
  const body = new THREE.Mesh(sphereGeo, faceMat(k, col, face));
  body.scale.set(1, 0.94, 1);
  body.position.y = R * 0.94;
  inner.add(body);
  const parts = k.part((gg) => {
    const p = gg('paint');
    // macacão (metade de baixo, um pouco maior) + gola
    const on = new THREE.SphereGeometry(R * 1.035, 22, 10, 0, TAU, Math.PI * 0.53, Math.PI * 0.47);
    on.scale(1, 0.94, 1);
    p.geo(on, col.onesie, 0, R * 0.94, 0);
    p.torus(R * 0.98, 0.012, 0, R * 0.94 - R * 0.09, 0, shade(col.onesie, -0.12), Math.PI / 2, 24);
    // botões de pressão
    for (let i = 0; i < 3; i++) p.sph(0.011, 0, R * 0.62 - i * 0.045, R * 0.99 - i * 0.012, col.accent, 1, 1, 0.6, 6);
    // estrelinha/coração bordado
    p.sph(0.022, R * 0.55, R * 0.55, R * 0.8, col.accent, 1, 1, 0.4, 8);
    // pezinhos (macacão com pé)
    for (const s of [-1, 1]) p.sph(0.06, s * 0.075, 0.035, R * 0.55, col.onesie, 0.85, 0.6, 1.25, 10);
    // bracinhos
    for (const s of [-1, 1]) p.sph(0.05, s * R * 1.0, R * 0.78, R * 0.25, col.body, 0.8, 1, 0.9, 10);
    // topete
    p.torus(0.035, 0.012, -0.01, R * 1.88 + 0.03, 0, shade(col.body, -0.2), 0, 12, 0, Math.PI * 1.4);
    p.sph(0.03, 0, R * 1.86, 0, shade(col.body, -0.12), 1, 0.8, 1, 8);
    if (col.hat === 'bow') {
      p.sph(0.04, -0.045, R * 1.85, 0.03, col.accent, 1, 0.7, 0.5, 8);
      p.sph(0.04, 0.045, R * 1.85, 0.03, col.accent, 1, 0.7, 0.5, 8);
      p.sph(0.022, 0, R * 1.85, 0.035, shade(col.accent, -0.15), 1, 1, 1, 8);
    } else if (col.hat === 'cap') {
      const cap = new THREE.SphereGeometry(R * 1.04, 20, 8, 0, TAU, 0, Math.PI * 0.32);
      cap.scale(1, 0.94, 1);
      p.geo(cap, col.accent, 0, R * 0.94, 0);
      p.sph(0.035, 0, R * 1.94, 0, '#ffffff', 1, 1, 1, 8);
    }
  }, 0, 0, 0, 0, inner);
  // chupeta (peça própria: some quando a boca abre)
  const paci = k.part((gg) => {
    const p = gg('paint');
    p.sph(0.034, 0, 0, 0, col.accent, 1, 0.75, 0.32, 12);
    p.torus(0.022, 0.0065, 0, -0.005, 0.02, shade(col.accent, 0.3), 0, 14);
    p.sph(0.012, 0, 0, -0.012, '#fff3d6', 1, 1, 1, 6);
  }, 0, R * 0.94 - 0.05, R * 0.97, 0, inner);
  // chupeta entra na MESMA malha do corpo (1 chamada a menos): esconder = drawRange
  const pm = parts.children[0] as THREE.Mesh;
  const cm = paci.children[0] as THREE.Mesh;
  const pg = cm.geometry.clone();
  pg.translate(paci.position.x, paci.position.y, paci.position.z);
  const base = pm.geometry.getAttribute('position').count;
  const merged = mergeGeometries([pm.geometry, pg], false)!;
  pm.geometry.dispose();
  pg.dispose();
  cm.geometry.dispose();
  pm.geometry = merged;
  inner.remove(paci);
  const setPaci = (on: boolean) => merged.setDrawRange(0, on ? Infinity : base);
  const setPose = (pp: 'lie' | 'sit' | 'stand') => {
    inner.rotation.set(0, 0, 0);
    inner.position.set(0, 0, 0);
    if (pp === 'lie') {
      inner.rotation.x = -Math.PI / 2 + 0.12;
      inner.position.set(0, R * 0.92, R * 0.94 - 0.02);
    } else if (pp === 'stand') inner.position.y = 0.04;
  };
  setPose(pose);
  parent.add(g);
  const baby: Baby = {
    g,
    body,
    parts,
    paci,
    face,
    col,
    inner,
    setPose,
    setFace(f) {
      baby.face = f;
      body.material = faceMat(k, col, f);
      setPaci(f === 'sleep' || f === 'awake');
    },
  };
  baby.setFace(face);
  return baby;
}

/* ------------------------------ criatura espiando ------------------------------ */
export interface Creature {
  g: THREE.Group;
  eyes: THREE.Mesh;
}
/**
 * Criatura (fofa-assustadora): bolota roxa escura, orelhinhas pontudas,
 * BOCÃO com duas presas de vampiro, olhos amarelos acesos, mãozinhas de 3 garras.
 * Origem no chão, olhando para +z. Altura ≈ 1.1 m × s.
 */
export function creature(k: MapKit, s = 1, parent: THREE.Object3D = k.root, mood: 'grin' | 'open' = 'open'): Creature {
  const g = new THREE.Group();
  const body = k.part((gg) => {
    const p = gg('paint');
    const purple = '#3a1c52';
    const dark = '#26103a';
    p.sph(0.5, 0, 0.55, 0, purple, 1, 1.05, 0.92, 22);
    p.sph(0.3, 0, 0.38, 0.28, '#4a2866', 1.1, 0.9, 0.6, 16); // barriga
    // orelhas
    p.lathe([[0.12, 0], [0.08, 0.12], [0.0, 0.3]], -0.3, 0.95, -0.02, dark, 8, 0, 0.45);
    p.lathe([[0.12, 0], [0.08, 0.12], [0.0, 0.3]], 0.3, 0.95, -0.02, dark, 8, 0, -0.45);
    // boca (bocão) — elipse escura saliente
    p.sph(0.3, 0, 0.47, 0.37, '#5a0a24', 1.15, 0.55, 0.32, 18);
    p.sph(0.17, 0, 0.42, 0.44, '#c2365a', 1.2, 0.35, 0.25, 12); // língua
    // presas
    for (const sx of [-1, 1]) p.lathe([[0.04, 0], [0.025, 0.06], [0, 0.13]], sx * 0.15, 0.62, 0.43, '#ffffff', 8, Math.PI, 0);
    // dentinhos de baixo
    for (let i = -2; i <= 2; i++) p.lathe([[0.018, 0], [0, 0.045]], i * 0.06, 0.33, 0.46, '#f4f0ff', 6);
    // mãos com garras (seguram a borda de onde espiam)
    for (const sx of [-1, 1]) {
      p.sph(0.11, sx * 0.48, 0.62, 0.3, purple, 1, 0.8, 1, 12);
      for (let i = -1; i <= 1; i++) p.lathe([[0.022, 0], [0, 0.07]], sx * 0.48 + i * 0.05, 0.6, 0.4, '#e8e0ff', 6, Math.PI / 2, 0);
    }
    // pés
    for (const sx of [-1, 1]) p.sph(0.14, sx * 0.22, 0.05, 0.12, dark, 1, 0.5, 1.3, 12);
    // pupilas (fendas) — na frente dos olhos acesos
    for (const sx of [-1, 1]) p.sph(0.025, sx * 0.19, 0.84, 0.47, '#140a00', 0.7, 2.2, 0.5, 8);
    if (mood === 'grin') p.sph(0.31, 0, 0.5, 0.36, '#3a1c52', 1.16, 0.3, 0.3, 14);
  }, 0, 0, 0, 0, g);
  void body;
  const eyeGeo = new THREE.SphereGeometry(0.1, 16, 10);
  eyeGeo.scale(1.15, 0.85, 0.45);
  const eyes = new THREE.Group();
  const eyeMat = eyeMatFor(k);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(sx * 0.19, 0.84, 0.43);
    e.rotation.y = sx * 0.3;
    e.rotation.z = -sx * 0.25;
    eyes.add(e);
  }
  g.add(eyes);
  g.scale.setScalar(s);
  parent.add(g);
  g.userData.noBake = false;
  return { g, eyes: eyes.children[0] as THREE.Mesh };
}
const eyeMats = new WeakMap<MapKit, THREE.Material>();
function eyeMatFor(k: MapKit): THREE.Material {
  let m = eyeMats.get(k);
  if (!m) {
    const key = '_crEye';
    try {
      m = k.mat(key);
    } catch {
      m = k.def(key, { basic: true, vc: false, color: '#ffe23a' });
    }
    eyeMats.set(k, m);
  }
  return m;
}

/** silhueta escura (hóspede/vulto) em pé, ~1.5 m × s, origem no chão */
export function silhouette(k: MapKit, s = 1, parent: THREE.Object3D = k.root, hat = false): THREE.Group {
  const g = k.part((gg) => {
    const p = gg('paint');
    const c = '#0c0a14';
    p.lathe([[0.0, 0], [0.32, 0.02], [0.36, 0.3], [0.33, 0.7], [0.24, 0.95], [0.12, 1.05], [0, 1.08]], 0, 0, 0, c, 14);
    p.sph(0.22, 0, 1.2, 0, c, 1, 1.05, 1, 14);
    if (hat) {
      p.cyl(0.3, 0.3, 0.03, 0, 1.34, 0, c, 16);
      p.cyl(0.16, 0.18, 0.2, 0, 1.36, 0, c, 14);
    }
  }, 0, 0, 0, 0, parent);
  g.scale.setScalar(s);
  return g;
}
