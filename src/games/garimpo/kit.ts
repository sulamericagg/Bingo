/* ============================================================
 *  GARIMPO BRUTO — kit de modelagem procedural.
 *  Peças com cantos arredondados (normais suaves), 3 "baldes" de material por peça
 *  (pintura Phong, metal/vidro brilhante, luzes), sujeira/desgaste na cor por vértice,
 *  adesivos de um atlas em canvas (logo "Bloop Máquinas", faixas zebradas, placas).
 *  LOD: setLod(1) antes de montar = menos segmentos e sem detalhes miúdos.
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Bucket = 'paint' | 'shiny' | 'glow';

export const MAT = {
  paint: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 28, specular: 0x262626 }),
  shiny: new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 90, specular: 0x9a9a9a }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
};

let LOD: 0 | 1 = 0;
/** 0 = alto (detalhes), 1 = baixo (menos triângulos) */
export function setLod(l: 0 | 1): void {
  LOD = l;
}
export const lod = (): 0 | 1 => LOD;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _d = new THREE.Color();

interface Wear {
  /** abaixo desta altura (local) a pintura vai ficando suja de terra */
  y: number;
  /** força 0..1 */
  k: number;
}

export class Kit {
  private parts: Record<Bucket, THREE.BufferGeometry[]> = { paint: [], shiny: [], glow: [] };
  private decals: THREE.BufferGeometry[] = [];
  bucket: Bucket = 'paint';
  wear: Wear | null = null;
  constructor(wear?: Wear) {
    this.wear = wear ?? null;
  }
  /** usa o balde b nas próximas peças */
  use(b: Bucket): this {
    this.bucket = b;
    return this;
  }
  add(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const geo = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.deleteAttribute('uv');
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    geo.applyMatrix4(_m);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    _c.setHex(color).convertSRGBToLinear();
    const P = geo.attributes.position.array as Float32Array;
    const w = this.bucket === 'paint' ? this.wear : null;
    _d.setHex(0x6b3a1e).convertSRGBToLinear();
    for (let i = 0; i < n; i++) {
      let r = _c.r;
      let gg = _c.g;
      let b = _c.b;
      if (w) {
        const py = P[i * 3 + 1];
        const px = P[i * 3];
        const pz = P[i * 3 + 2];
        // terra respingada embaixo + manchas
        const sp = Math.sin(px * 7.1 + pz * 3.3) * Math.sin(pz * 5.7 - px * 2.1);
        let f = Math.max(0, Math.min(1, (w.y - py) / 0.9)) * w.k + Math.max(0, sp - 0.55) * 0.6 * w.k;
        f = Math.min(0.75, f);
        r += (_d.r - r) * f;
        gg += (_d.g - gg) * f;
        b += (_d.b - b) * f;
      }
      col[i * 3] = r;
      col[i * 3 + 1] = gg;
      col[i * 3 + 2] = b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts[this.bucket].push(geo);
    return this;
  }
  /** caixa de cantos arredondados (r = raio do chanfro) */
  rbox(w: number, h: number, d: number, r: number, c: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
    if (rr <= 0.005 || LOD) return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
    return this.add(new RoundedBoxGeometry(w, h, d, 2, rr), c, x, y, z, rx, ry, rz);
  }
  box(w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz);
  }
  /** cilindro deitado no eixo x */
  cylX(r: number, w: number, c: number, x = 0, y = 0, z = 0, seg = 12): this {
    return this.add(new THREE.CylinderGeometry(r, r, w, LOD ? Math.max(6, seg >> 1) : seg), c, x, y, z, 0, 0, Math.PI / 2);
  }
  cylZ(r: number, len: number, c: number, x = 0, y = 0, z = 0, rx = 0, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, LOD ? Math.max(5, seg >> 1) : seg), c, x, y, z, Math.PI / 2 + rx, 0, 0);
  }
  cyl(rt: number, rb: number, h: number, c: number, x = 0, y = 0, z = 0, seg = 10, rx = 0, ry = 0, rz = 0): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, LOD ? Math.max(5, seg >> 1) : seg), c, x, y, z, rx, ry, rz);
  }
  ball(r: number, c: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, detail = 1): this {
    return this.add(new THREE.IcosahedronGeometry(r, LOD ? 0 : detail), c, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  /** só no LOD alto (parafusos, frisos, alças) */
  fine(fn: (k: this) => void): this {
    if (!LOD) fn(this);
    return this;
  }
  /** peça extrudada de um contorno 2D (perfil no plano YZ, espessura em X) — lâminas, braços */
  profile(pts: [number, number][], thick: number, c: number, x = 0, y = 0, z = 0, bevel = 0.03): this {
    const sh = new THREE.Shape(pts.map(([a, b]) => new THREE.Vector2(a, b)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick, bevelEnabled: !LOD && bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: LOD ? 3 : 6 });
    g.translate(0, 0, -thick / 2);
    // perfil (x2d,y2d) → (z,y); espessura → x
    g.rotateY(-Math.PI / 2);
    return this.add(g, c, x, y, z);
  }
  /** adesivo (região do atlas) — plano virado para +z local, girado por ry */
  decal(region: keyof typeof REG, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0): this {
    if (LOD) return this;
    const g = new THREE.PlaneGeometry(w, h);
    const R = REG[region];
    const uv = g.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i += 2) {
      uv[i] = R[0] + uv[i] * R[2];
      uv[i + 1] = 1 - (R[1] + (1 - uv[i + 1]) * R[3]);
    }
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s.set(1, 1, 1));
    g.applyMatrix4(_m);
    this.decals.push(g);
    return this;
  }
  /** monta: Group com até 4 malhas (pintura, brilho, luzes, adesivos) */
  build(shadow = true): THREE.Group {
    const grp = new THREE.Group();
    for (const b of ['paint', 'shiny', 'glow'] as Bucket[]) {
      const list = this.parts[b];
      if (!list.length) continue;
      const g = mergeGeometries(list, false)!;
      for (const p of list) p.dispose();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, MAT[b]);
      m.castShadow = shadow && b !== 'glow';
      m.receiveShadow = false;
      grp.add(m);
    }
    if (this.decals.length) {
      const g = mergeGeometries(this.decals, false)!;
      for (const p of this.decals) p.dispose();
      const m = new THREE.Mesh(g, decalMat());
      m.renderOrder = 2;
      grp.add(m);
    }
    this.parts = { paint: [], shiny: [], glow: [] };
    this.decals = [];
    return grp;
  }
  /** só a geometria pintada (para instanciar) */
  geometry(): THREE.BufferGeometry {
    const all = [...this.parts.paint, ...this.parts.shiny, ...this.parts.glow];
    const g = mergeGeometries(all, false)!;
    for (const p of all) p.dispose();
    this.parts = { paint: [], shiny: [], glow: [] };
    g.computeBoundingSphere();
    return g;
  }
}

/* ------------------------------ atlas de adesivos ------------------------------ */
/** regiões [u, v, largura, altura] em frações do atlas (v de cima para baixo) */
const REG = {
  logo: [0, 0, 0.5, 0.25],
  logoDark: [0.5, 0, 0.5, 0.25],
  hazard: [0, 0.25, 0.5, 0.125],
  hazardV: [0.5, 0.25, 0.125, 0.5],
  plate: [0, 0.375, 0.25, 0.125],
  num1: [0.25, 0.375, 0.125, 0.125],
  num2: [0.375, 0.375, 0.125, 0.125],
  warn: [0.625, 0.25, 0.125, 0.125],
  grille: [0.75, 0.25, 0.25, 0.25],
  gold: [0, 0.5, 0.5, 0.25],
  stripe: [0, 0.75, 0.5, 0.0625],
} as const;
export type DecalRegion = keyof typeof REG;

let decalM: THREE.MeshLambertMaterial | null = null;
function decalMat(): THREE.MeshLambertMaterial {
  if (decalM) return decalM;
  const W = 1024;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  const rect = (r: readonly number[]) => [r[0] * W, r[1] * H, r[2] * W, r[3] * H] as const;
  const font = (px: number, w = 800) => `${w} ${px}px Fredoka, 'Arial Black', sans-serif`;
  // logo "Bloop Máquinas": bolha + engrenagem + texto
  const logo = (r: readonly number[], fg: string, bg: string | null) => {
    const [a, b, w, h] = rect(r);
    x.save();
    x.translate(a, b);
    if (bg) {
      x.fillStyle = bg;
      x.beginPath();
      x.roundRect(8, 8, w - 16, h - 16, 40);
      x.fill();
    }
    // engrenagem
    x.fillStyle = fg;
    const cx = h * 0.5;
    const cy = h * 0.5;
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      const rr = i % 2 ? h * 0.3 : h * 0.37;
      x.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
    }
    x.fill();
    x.fillStyle = bg ?? 'rgba(0,0,0,0)';
    if (!bg) x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(cx, cy, h * 0.15, 0, Math.PI * 2);
    x.fill();
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = fg;
    x.font = font(h * 0.34);
    x.textBaseline = 'middle';
    x.fillText('BLOOP', h * 0.95, h * 0.36);
    x.font = font(h * 0.2, 700);
    x.fillText('MÁQUINAS', h * 0.97, h * 0.68);
    x.restore();
  };
  logo(REG.logo, '#1d1b18', null);
  logo(REG.logoDark, '#ffffff', null);
  // faixa zebrada
  {
    const [a, b, w, h] = rect(REG.hazard);
    x.save();
    x.beginPath();
    x.rect(a, b, w, h);
    x.clip();
    x.fillStyle = '#ffc61a';
    x.fillRect(a, b, w, h);
    x.fillStyle = '#1b1a18';
    for (let i = -h; i < w + h; i += h * 0.9) {
      x.beginPath();
      x.moveTo(a + i, b + h);
      x.lineTo(a + i + h * 0.45, b + h);
      x.lineTo(a + i + h * 0.45 + h, b);
      x.lineTo(a + i + h, b);
      x.fill();
    }
    x.restore();
    const [a2, b2, w2, h2] = rect(REG.hazardV);
    x.save();
    x.beginPath();
    x.rect(a2, b2, w2, h2);
    x.clip();
    x.fillStyle = '#ffc61a';
    x.fillRect(a2, b2, w2, h2);
    x.fillStyle = '#1b1a18';
    for (let i = -w2; i < h2 + w2; i += w2 * 0.9) {
      x.beginPath();
      x.moveTo(a2, b2 + i);
      x.lineTo(a2, b2 + i + w2 * 0.45);
      x.lineTo(a2 + w2, b2 + i + w2 * 0.45 + w2);
      x.lineTo(a2 + w2, b2 + i + w2);
      x.fill();
    }
    x.restore();
  }
  // placa
  {
    const [a, b, w, h] = rect(REG.plate);
    x.fillStyle = '#f2f2ec';
    x.beginPath();
    x.roundRect(a + 6, b + 10, w - 12, h - 20, 12);
    x.fill();
    x.fillStyle = '#2a5bb0';
    x.fillRect(a + 6, b + 10, w - 12, h * 0.22);
    x.fillStyle = '#111';
    x.font = font(h * 0.42);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('GRM-0' + 7, a + w / 2, b + h * 0.6);
    x.textAlign = 'left';
  }
  for (const [k, n] of [
    ['num1', '01'],
    ['num2', '02'],
  ] as const) {
    const [a, b, w, h] = rect(REG[k]);
    x.fillStyle = '#1b1a18';
    x.font = font(h * 0.7);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(n, a + w / 2, b + h / 2);
    x.textAlign = 'left';
  }
  // triângulo de aviso
  {
    const [a, b, w, h] = rect(REG.warn);
    x.fillStyle = '#ffc61a';
    x.strokeStyle = '#1b1a18';
    x.lineWidth = 10;
    x.beginPath();
    x.moveTo(a + w / 2, b + 12);
    x.lineTo(a + w - 10, b + h - 12);
    x.lineTo(a + 10, b + h - 12);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#1b1a18';
    x.fillRect(a + w / 2 - 6, b + h * 0.35, 12, h * 0.3);
    x.fillRect(a + w / 2 - 6, b + h * 0.72, 12, 12);
  }
  // grade de radiador (para frentes)
  {
    const [a, b, w, h] = rect(REG.grille);
    x.fillStyle = '#16171a';
    x.beginPath();
    x.roundRect(a + 4, b + 4, w - 8, h - 8, 14);
    x.fill();
    x.fillStyle = '#4a4e55';
    for (let i = 0; i < 9; i++) x.fillRect(a + 16, b + 18 + i * (h - 36) / 9, w - 32, (h - 36) / 18);
  }
  // selo dourado
  {
    const [a, b, w, h] = rect(REG.gold);
    const g = x.createLinearGradient(a, b, a, b + h);
    g.addColorStop(0, '#fff2a8');
    g.addColorStop(0.5, '#ffcc2e');
    g.addColorStop(1, '#c98a08');
    x.fillStyle = g;
    x.beginPath();
    x.roundRect(a + 8, b + 8, w - 16, h - 16, 30);
    x.fill();
    x.fillStyle = '#5a3a00';
    x.font = font(h * 0.32);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('OURO', a + w / 2, b + h / 2);
    x.textAlign = 'left';
  }
  // friso fino
  {
    const [a, b, w, h] = rect(REG.stripe);
    x.fillStyle = '#1b1a18';
    x.fillRect(a, b + h * 0.2, w, h * 0.25);
    x.fillStyle = '#ffffff';
    x.fillRect(a, b + h * 0.55, w, h * 0.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  decalM = new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.05, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
  return decalM;
}

/** estica um objeto de altura 1 (eixo y) entre dois pontos no referencial do pai */
const _a = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
export function stretch(m: THREE.Object3D, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
  _a.set(bx - ax, by - ay, bz - az);
  const len = _a.length();
  m.position.set(ax, ay, az);
  m.quaternion.setFromUnitVectors(UP, _a.multiplyScalar(1 / (len || 1)));
  m.scale.set(1, len, 1);
}
