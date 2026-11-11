/* ============================================================
 *  ANOMALIAS (kit2) — texturas geradas em canvas (zero bytes no APK).
 *  Pisos, paredes, forro, asfalto, concreto, letreiros e ícones de comida.
 *  Texturas "neutras" (cinza claro) são tingidas pela cor do vértice.
 * ============================================================ */
import * as THREE from 'three';

type C2 = CanvasRenderingContext2D;
export const FONT = "'Fredoka', 'Trebuchet MS', 'Arial Rounded MT Bold', sans-serif";

export function cv(w: number, h = w): [HTMLCanvasElement, C2] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
let seed = 7;
export function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
export function reseed(s: number): void {
  seed = Math.max(1, Math.floor(s) % 2147483646);
}

export function toTex(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** ruído fino somado à imagem (granulado de material) */
function grain(x: C2, w: number, h: number, amt: number, s = 1): void {
  reseed(s * 131);
  const id = x.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  x.putImageData(id, 0, 0);
}
/** manchas suaves grandes (sujeira, desgaste) */
function blotches(x: C2, w: number, h: number, n: number, col: string, a: number, rmin: number, rmax: number, s = 3): void {
  reseed(s * 977);
  for (let i = 0; i < n; i++) {
    const cx = rnd() * w;
    const cy = rnd() * h;
    const r = rmin + rnd() * (rmax - rmin);
    for (const [ox, oy] of [
      [0, 0],
      [w, 0],
      [-w, 0],
      [0, h],
      [0, -h],
    ]) {
      const gr = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r);
      gr.addColorStop(0, col.replace('A', String(a)));
      gr.addColorStop(1, col.replace('A', '0'));
      x.fillStyle = gr;
      x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
    }
  }
}

/** piso xadrez (cores reais; vértice branco) — `n` casas por repetição */
export function checkerTex(a: string, b: string, n = 4, size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  const s = size / n;
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      x.fillStyle = (i + j) % 2 ? b : a;
      x.fillRect(i * s, j * s, s, s);
      // brilho de cera no canto
      const gr = x.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0.06)');
      x.fillStyle = gr;
      x.fillRect(i * s, j * s, s, s);
    }
  x.strokeStyle = 'rgba(40,30,30,0.35)';
  x.lineWidth = 1.5;
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * s, 0);
    x.lineTo(i * s, size);
    x.moveTo(0, i * s);
    x.lineTo(size, i * s);
    x.stroke();
  }
  blotches(x, size, size, 6, 'rgba(60,40,30,A)', 0.07, 20, 60);
  grain(x, size, size, 10);
  return toTex(c);
}

/** azulejo/lajota com rejunte — cor real */
export function tileTex(base: string, grout: string, nx = 4, ny = 4, size = 256, vary = 0.06, s = 1): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = grout;
  x.fillRect(0, 0, size, size);
  const w = size / nx;
  const h = size / ny;
  const g = Math.max(1.5, size * 0.012);
  reseed(s * 31 + nx);
  const col = new THREE.Color();
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      col.set(base).multiplyScalar(1 + (rnd() - 0.5) * vary * 2);
      x.fillStyle = '#' + col.getHexString();
      x.fillRect(i * w + g / 2, j * h + g / 2, w - g, h - g);
      const gr = x.createLinearGradient(i * w, j * h, i * w, j * h + h);
      gr.addColorStop(0, 'rgba(255,255,255,0.16)');
      gr.addColorStop(0.5, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.08)');
      x.fillStyle = gr;
      x.fillRect(i * w + g / 2, j * h + g / 2, w - g, h - g);
    }
  grain(x, size, size, 8, s);
  return toTex(c);
}

/** pastilha hexagonal (banheiro) */
export function hexTex(a: string, b: string, grout: string, size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = grout;
  x.fillRect(0, 0, size, size);
  const r = size / 8;
  const hh = Math.sqrt(3) * r;
  reseed(5);
  for (let j = -1; j < 6; j++)
    for (let i = -1; i < 7; i++) {
      const cx = i * r * 1.5;
      const cy = j * hh + (i % 2 ? hh / 2 : 0);
      x.fillStyle = rnd() < 0.12 ? b : a;
      x.beginPath();
      for (let k = 0; k < 6; k++) {
        const an = (k / 6) * Math.PI * 2;
        const px = cx + Math.cos(an) * (r - 1.6);
        const py = cy + Math.sin(an) * (r - 1.6);
        if (k) x.lineTo(px, py);
        else x.moveTo(px, py);
      }
      x.fill();
    }
  grain(x, size, size, 8);
  return toTex(c);
}

/** reboco pintado (neutro ~0.92) — tingido pela cor do vértice */
export function plasterTex(size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#ececec';
  x.fillRect(0, 0, size, size);
  blotches(x, size, size, 14, 'rgba(255,255,255,A)', 0.25, 20, 70, 11);
  blotches(x, size, size, 10, 'rgba(120,120,120,A)', 0.07, 30, 90, 12);
  grain(x, size, size, 14, 2);
  return toTex(c);
}

/** forro de placas (0,6 m) com furinhos */
export function ceilingTex(size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#e9e7e2';
  x.fillRect(0, 0, size, size);
  reseed(9);
  x.fillStyle = 'rgba(80,80,80,0.18)';
  for (let i = 0; i < 900; i++) x.fillRect(rnd() * size, rnd() * size, 1.4, 1.4);
  x.strokeStyle = '#b9b6ae';
  x.lineWidth = 5;
  x.strokeRect(0, 0, size, size);
  x.strokeStyle = 'rgba(255,255,255,0.7)';
  x.lineWidth = 1.5;
  x.strokeRect(4, 4, size - 8, size - 8);
  return toTex(c);
}

/** carpete (neutro) */
export function carpetTex(size = 128): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#c8c8c8';
  x.fillRect(0, 0, size, size);
  grain(x, size, size, 60, 4);
  blotches(x, size, size, 6, 'rgba(90,90,90,A)', 0.12, 10, 30, 5);
  return toTex(c);
}

/** asfalto (cor real) com pedrisco e remendos */
export function asphaltTex(size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#3a3b40';
  x.fillRect(0, 0, size, size);
  blotches(x, size, size, 10, 'rgba(20,20,26,A)', 0.35, 20, 70, 21);
  blotches(x, size, size, 6, 'rgba(110,110,116,A)', 0.12, 20, 60, 22);
  reseed(23);
  for (let i = 0; i < 1600; i++) {
    const v = 55 + rnd() * 50;
    x.fillStyle = `rgb(${v},${v},${v + 4})`;
    x.fillRect(rnd() * size, rnd() * size, 1 + rnd() * 1.4, 1 + rnd() * 1.4);
  }
  // rachadura fina
  x.strokeStyle = 'rgba(15,15,18,0.55)';
  x.lineWidth = 1.2;
  x.beginPath();
  let px = rnd() * size;
  let py = 0;
  x.moveTo(px, py);
  while (py < size) {
    px += (rnd() - 0.5) * 18;
    py += 8 + rnd() * 10;
    x.lineTo(px, py);
  }
  x.stroke();
  grain(x, size, size, 16, 6);
  return toTex(c);
}

/** concreto em placas (pátio do posto, calçada) — neutro claro */
export function concreteTex(size = 256, joints = 2): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#c9c7c2';
  x.fillRect(0, 0, size, size);
  blotches(x, size, size, 12, 'rgba(90,85,80,A)', 0.14, 20, 80, 31);
  blotches(x, size, size, 4, 'rgba(40,40,40,A)', 0.16, 14, 30, 32);
  grain(x, size, size, 22, 7);
  x.strokeStyle = 'rgba(60,58,55,0.7)';
  x.lineWidth = 2;
  const s = size / joints;
  for (let i = 0; i <= joints; i++) {
    x.beginPath();
    x.moveTo(i * s, 0);
    x.lineTo(i * s, size);
    x.moveTo(0, i * s);
    x.lineTo(size, i * s);
    x.stroke();
  }
  return toTex(c);
}

/** tapete emborrachado colorido (cantinho kids) */
export function rubberTex(size = 256): THREE.CanvasTexture {
  const [c, x] = cv(size);
  const cols = ['#ff7a6b', '#ffd35a', '#6bd0ff', '#8ee07a', '#c79bff', '#ff9ad0'];
  const n = 4;
  const s = size / n;
  reseed(41);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      x.fillStyle = cols[(i * 2 + j * 3) % cols.length];
      x.fillRect(i * s, j * s, s, s);
      // encaixe de quebra-cabeça
      x.fillStyle = cols[(i * 2 + j * 3 + 1) % cols.length];
      x.beginPath();
      x.arc(i * s + s, j * s + s / 2, s * 0.12, 0, Math.PI * 2);
      x.fill();
    }
  grain(x, size, size, 12, 9);
  return toTex(c);
}

/** madeira (neutra-quente; o vértice tinge) */
export function woodTex(size = 256, planks = 4): THREE.CanvasTexture {
  const [c, x] = cv(size);
  const ph = size / planks;
  reseed(51);
  for (let p = 0; p < planks; p++) {
    const v = 0.86 + rnd() * 0.14;
    x.fillStyle = `rgb(${232 * v},${214 * v},${190 * v})`;
    x.fillRect(0, p * ph, size, ph);
    for (let k = 0; k < 18; k++) {
      x.strokeStyle = `rgba(110,70,40,${0.05 + rnd() * 0.08})`;
      x.lineWidth = 1 + rnd() * 2;
      x.beginPath();
      const y = p * ph + rnd() * ph;
      x.moveTo(0, y);
      for (let xx = 0; xx <= size; xx += 16) x.lineTo(xx, y + Math.sin(xx * 0.03 + k) * 2.5);
      x.stroke();
    }
    x.fillStyle = 'rgba(60,35,20,0.35)';
    x.fillRect(0, p * ph, size, 1.5);
  }
  grain(x, size, size, 10, 8);
  return toTex(c);
}

/** inox escovado (neutro) */
export function steelTex(size = 128): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = '#d4d6da';
  x.fillRect(0, 0, size, size);
  reseed(61);
  for (let i = 0; i < 260; i++) {
    const y = rnd() * size;
    x.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.25)' : 'rgba(80,85,95,0.16)';
    x.lineWidth = 0.6 + rnd();
    x.beginPath();
    x.moveTo(0, y);
    x.lineTo(size, y + (rnd() - 0.5) * 2);
    x.stroke();
  }
  return toTex(c);
}

/** vidro: reflexo em faixas diagonais (transparente) */
export function glassTex(size = 128): THREE.CanvasTexture {
  const [c, x] = cv(size);
  x.fillStyle = 'rgb(255,255,255)';
  x.fillRect(0, 0, size, size);
  x.globalCompositeOperation = 'source-over';
  const gr = x.createLinearGradient(0, 0, size, size);
  gr.addColorStop(0, 'rgba(160,190,230,1)');
  gr.addColorStop(0.35, 'rgba(120,150,200,1)');
  gr.addColorStop(0.42, 'rgba(230,240,255,1)');
  gr.addColorStop(0.5, 'rgba(120,150,200,1)');
  gr.addColorStop(0.7, 'rgba(140,170,215,1)');
  gr.addColorStop(0.74, 'rgba(210,225,250,1)');
  gr.addColorStop(1, 'rgba(120,150,200,1)');
  x.fillStyle = gr;
  x.fillRect(0, 0, size, size);
  return toTex(c);
}

/** sombra redonda borrada (alfa) */
export function blobTex(size = 64): THREE.CanvasTexture {
  const [c, x] = cv(size);
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, size, size);
  return toTex(c, false);
}

/** brilho (halo de lâmpada / poça de luz) — aditivo */
export function haloTex(size = 64): THREE.CanvasTexture {
  const [c, x] = cv(size);
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, size, size);
  return toTex(c, false);
}

/** céu noturno (faixa equiretangular) com estrelas e lua */
export function nightSkyTex(top: string, hor: string, moon = true): THREE.CanvasTexture {
  const [c, x] = cv(1024, 256);
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top);
  gr.addColorStop(0.75, hor);
  gr.addColorStop(1, hor);
  x.fillStyle = gr;
  x.fillRect(0, 0, 1024, 256);
  // névoa da Via Láctea (as estrelas são pontos à parte)
  reseed(71);
  for (let i = 0; i < 60; i++) {
    const px = 500 + (rnd() - 0.5) * 700;
    const py = 20 + ((px - 150) / 700) * 90 + (rnd() - 0.5) * 40;
    const r = 20 + rnd() * 40;
    const g2 = x.createRadialGradient(px, py, 0, px, py, r);
    g2.addColorStop(0, 'rgba(160,170,230,0.05)');
    g2.addColorStop(1, 'rgba(160,170,230,0)');
    x.fillStyle = g2;
    x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  if (moon) {
    const mx = 300;
    const my = 60;
    const g2 = x.createRadialGradient(mx, my, 0, mx, my, 24);
    g2.addColorStop(0, 'rgba(255,248,220,0.35)');
    g2.addColorStop(1, 'rgba(255,248,220,0)');
    x.fillStyle = g2;
    x.fillRect(mx - 24, my - 24, 48, 48);
    x.fillStyle = '#fff6da';
    x.beginPath();
    x.arc(mx, my, 7, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = top;
    x.beginPath();
    x.arc(mx + 3.5, my - 2, 6, 0, Math.PI * 2);
    x.fill();
  }
  const t = toTex(c, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/* ------------------------------ comida (ícones) ------------------------------ */

export type Food = 'burger' | 'cheese' | 'fries' | 'soda' | 'shake' | 'nuggets' | 'hotdog' | 'pie' | 'icecream' | 'juice' | 'salad' | 'donut';

/** desenha um ícone de comida centrado em (cx,cy), tamanho s (≈ diâmetro) */
export function drawFood(x: C2, f: Food, cx: number, cy: number, s: number): void {
  const r = s / 2;
  x.save();
  x.translate(cx, cy);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  const ol = Math.max(1.5, s * 0.045);
  const fillO = (col: string, path: () => void) => {
    x.beginPath();
    path();
    x.fillStyle = col;
    x.fill();
    x.strokeStyle = '#3a1d18';
    x.lineWidth = ol;
    x.stroke();
  };
  const rr = (X: number, Y: number, W: number, H: number, R: number) => {
    x.moveTo(X + R, Y);
    x.arcTo(X + W, Y, X + W, Y + H, R);
    x.arcTo(X + W, Y + H, X, Y + H, R);
    x.arcTo(X, Y + H, X, Y, R);
    x.arcTo(X, Y, X + W, Y, R);
    x.closePath();
  };
  switch (f) {
    case 'burger':
    case 'cheese': {
      fillO('#e9a24a', () => rr(-r * 0.86, r * 0.18, r * 1.72, r * 0.42, r * 0.18));
      fillO('#7a3b22', () => rr(-r * 0.92, -r * 0.08, r * 1.84, r * 0.3, r * 0.14));
      if (f === 'cheese') fillO('#ffd23a', () => (x.moveTo(-r * 0.9, -r * 0.1), x.lineTo(r * 0.9, -r * 0.1), x.lineTo(r * 0.55, r * 0.14), x.lineTo(r * 0.2, -r * 0.02), x.lineTo(-r * 0.3, r * 0.16), x.closePath()));
      fillO('#5cc64a', () => {
        x.moveTo(-r * 0.95, -r * 0.14);
        for (let i = 0; i <= 8; i++) x.lineTo(-r * 0.95 + (i / 8) * r * 1.9, -r * 0.14 + (i % 2 ? r * 0.12 : -r * 0.02));
        x.lineTo(r * 0.95, -r * 0.22);
        x.lineTo(-r * 0.95, -r * 0.22);
        x.closePath();
      });
      fillO('#f2a94e', () => (x.moveTo(-r * 0.9, -r * 0.2), x.quadraticCurveTo(-r * 0.9, -r * 0.92, 0, -r * 0.92), x.quadraticCurveTo(r * 0.9, -r * 0.92, r * 0.9, -r * 0.2), x.closePath()));
      x.fillStyle = '#fff3d0';
      for (const [a, b] of [
        [-0.4, -0.6],
        [0.05, -0.72],
        [0.42, -0.52],
        [-0.12, -0.42],
      ]) {
        x.beginPath();
        x.ellipse(a * r, b * r, r * 0.07, r * 0.035, 0.4, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'fries': {
      const cols = ['#ffd45a', '#ffc93a', '#ffdd70'];
      for (let i = -3; i <= 3; i++) fillO(cols[(i + 3) % 3], () => rr(i * r * 0.17 - r * 0.07, -r * 0.95 + Math.abs(i) * r * 0.08, r * 0.14, r * 0.9, r * 0.04));
      fillO('#e8423a', () => (x.moveTo(-r * 0.7, -r * 0.22), x.lineTo(r * 0.7, -r * 0.22), x.lineTo(r * 0.52, r * 0.92), x.lineTo(-r * 0.52, r * 0.92), x.closePath()));
      x.fillStyle = '#ffd45a';
      x.beginPath();
      x.arc(0, r * 0.32, r * 0.2, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'soda':
    case 'juice': {
      const body = f === 'soda' ? '#3aa0ff' : '#ff9a2a';
      fillO(body, () => (x.moveTo(-r * 0.55, -r * 0.55), x.lineTo(r * 0.55, -r * 0.55), x.lineTo(r * 0.42, r * 0.95), x.lineTo(-r * 0.42, r * 0.95), x.closePath()));
      fillO('#ffffff', () => rr(-r * 0.62, -r * 0.72, r * 1.24, r * 0.2, r * 0.08));
      x.strokeStyle = '#3a1d18';
      x.lineWidth = ol * 1.4;
      x.beginPath();
      x.moveTo(r * 0.12, -r * 0.7);
      x.lineTo(r * 0.3, -r * 1.0);
      x.stroke();
      x.strokeStyle = f === 'soda' ? '#ff5a6a' : '#5ad06a';
      x.lineWidth = ol * 0.8;
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.75)';
      x.beginPath();
      x.arc(0, r * 0.2, r * 0.22, 0, Math.PI * 2);
      x.fill();
      break;
    }
    case 'shake':
    case 'icecream': {
      if (f === 'shake') {
        fillO('#ff9ac6', () => (x.moveTo(-r * 0.5, -r * 0.3), x.lineTo(r * 0.5, -r * 0.3), x.lineTo(r * 0.38, r * 0.95), x.lineTo(-r * 0.38, r * 0.95), x.closePath()));
        fillO('#fff7f0', () => (x.arc(-r * 0.22, -r * 0.38, r * 0.3, Math.PI, 0), x.arc(r * 0.22, -r * 0.38, r * 0.3, Math.PI, 0), x.closePath()));
        fillO('#ff3a5a', () => x.arc(0, -r * 0.82, r * 0.14, 0, Math.PI * 2));
      } else {
        fillO('#e8b06a', () => (x.moveTo(-r * 0.45, -r * 0.1), x.lineTo(r * 0.45, -r * 0.1), x.lineTo(0, r * 0.98), x.closePath()));
        fillO('#9a6aff', () => x.arc(0, -r * 0.35, r * 0.45, 0, Math.PI * 2));
        fillO('#fff2d0', () => x.arc(-r * 0.12, -r * 0.62, r * 0.3, 0, Math.PI * 2));
      }
      break;
    }
    case 'nuggets': {
      fillO('#ffcc33', () => rr(-r * 0.85, -r * 0.1, r * 1.7, r * 0.95, r * 0.12));
      for (const [a, b] of [
        [-0.4, -0.25],
        [0.1, -0.35],
        [0.5, -0.2],
        [-0.12, -0.05],
      ])
        fillO('#e09a3a', () => x.ellipse(a * r, b * r, r * 0.28, r * 0.22, a, 0, Math.PI * 2));
      break;
    }
    case 'hotdog': {
      fillO('#eeb062', () => rr(-r * 0.95, -r * 0.18, r * 1.9, r * 0.55, r * 0.26));
      fillO('#c8483a', () => rr(-r * 1.0, -r * 0.3, r * 2.0, r * 0.3, r * 0.15));
      x.strokeStyle = '#ffd23a';
      x.lineWidth = ol * 1.6;
      x.beginPath();
      for (let i = 0; i <= 10; i++) x.lineTo(-r * 0.8 + (i / 10) * r * 1.6, -r * 0.16 + (i % 2 ? -r * 0.07 : r * 0.04));
      x.stroke();
      break;
    }
    case 'pie': {
      fillO('#e9b46a', () => rr(-r * 0.9, -r * 0.4, r * 1.8, r * 0.8, r * 0.3));
      x.strokeStyle = '#b8702a';
      x.lineWidth = ol;
      for (let i = -2; i <= 2; i++) {
        x.beginPath();
        x.moveTo(i * r * 0.3 - r * 0.1, -r * 0.25);
        x.lineTo(i * r * 0.3 + r * 0.1, r * 0.25);
        x.stroke();
      }
      break;
    }
    case 'salad': {
      fillO('#ffffff', () => (x.moveTo(-r * 0.9, -r * 0.05), x.quadraticCurveTo(0, r * 1.15, r * 0.9, -r * 0.05), x.closePath()));
      for (const [a, b, col] of [
        [-0.4, -0.2, '#5cc64a'],
        [0.1, -0.3, '#3aa83a'],
        [0.45, -0.15, '#5cc64a'],
        [-0.05, -0.05, '#ff5a4a'],
        [0.3, -0.38, '#ffcc33'],
      ] as [number, number, string][])
        fillO(col, () => x.arc(a * r, b * r, r * 0.22, 0, Math.PI * 2));
      break;
    }
    case 'donut': {
      fillO('#e9a25a', () => x.arc(0, 0, r * 0.85, 0, Math.PI * 2));
      fillO('#ff8ac0', () => x.arc(0, -r * 0.03, r * 0.72, 0, Math.PI * 2));
      x.fillStyle = '#2a1222';
      x.beginPath();
      x.arc(0, 0, r * 0.25, 0, Math.PI * 2);
      x.fill();
      for (let i = 0; i < 9; i++) {
        x.fillStyle = ['#fff', '#5ad0ff', '#ffe04a'][i % 3];
        const an = i * 0.7;
        x.fillRect(Math.cos(an) * r * 0.5, Math.sin(an) * r * 0.5, r * 0.1, r * 0.04);
      }
      break;
    }
  }
  x.restore();
}

export function roundRect(x: C2, X: number, Y: number, W: number, H: number, R: number): void {
  x.beginPath();
  x.moveTo(X + R, Y);
  x.arcTo(X + W, Y, X + W, Y + H, R);
  x.arcTo(X + W, Y + H, X, Y + H, R);
  x.arcTo(X, Y + H, X, Y, R);
  x.arcTo(X, Y, X + W, Y, R);
  x.closePath();
}

/** texto com contorno */
export function label(x: C2, s: string, cx: number, cy: number, px: number, fill: string, stroke = '', weight = 700, align: CanvasTextAlign = 'center'): void {
  x.font = `${weight} ${px}px ${FONT}`;
  x.textAlign = align;
  x.textBaseline = 'middle';
  if (stroke) {
    x.lineWidth = px * 0.16;
    x.strokeStyle = stroke;
    x.lineJoin = 'round';
    x.strokeText(s, cx, cy);
  }
  x.fillStyle = fill;
  x.fillText(s, cx, cy);
}

/** letreiro neon: tubo com halo (fundo transparente) */
export function neonText(s: string, col: string, w = 512, h = 128, px = 78): THREE.CanvasTexture {
  const [c, x] = cv(w, h);
  x.font = `700 ${px}px ${FONT}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.shadowColor = col;
  x.shadowBlur = px * 0.35;
  x.strokeStyle = col;
  x.lineWidth = px * 0.11;
  x.strokeText(s, w / 2, h / 2 + 2);
  x.shadowBlur = 0;
  x.strokeStyle = '#ffffff';
  x.lineWidth = px * 0.04;
  x.strokeText(s, w / 2, h / 2 + 2);
  return toTex(c, false);
}

export async function fontsReady(): Promise<void> {
  try {
    await Promise.race([document.fonts.load(`700 40px Fredoka`), new Promise((r) => setTimeout(r, 600))]);
  } catch {
    /* sem fonte: cai no fallback */
  }
}
