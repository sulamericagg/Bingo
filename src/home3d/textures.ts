/* ============================================================
 *  Texturas procedurais (canvas pequeno → CanvasTexture), em cache.
 *  Tudo é liberado em disposeTextures() ao sair do 3D.
 * ============================================================ */
import * as THREE from 'three';
import { gameFont } from '../i18n/font';
import { MESS_COLORS, parsePaintSpec, type MessKind } from './adapter';

import { INK, canvas, shade } from '../3d/common/tex';

export { INK, canvas, shade };
const texCache = new Map<string, THREE.Texture>();
const owned = new Set<THREE.Texture>();

export function track<T extends THREE.Texture>(t: T): T {
  owned.add(t);
  return t;
}
export function disposeTextures(): void {
  for (const t of owned) t.dispose();
  owned.clear();
  texCache.clear();
}
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const q = i % 2 ? r * 0.45 : r;
    c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  c.closePath();
  c.fill();
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  c.fill();
}

/* ---------------- piso (repetível) ---------------- */
export function floorTexture(style: string, col: string, aniso: number): THREE.Texture {
  const key = 'f:' + style + col;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 128;
  const [cv, c] = canvas(S, S);
  const r = rng(hash(key));
  const lo = shade(col, -0.12),
    hi = shade(col, 0.12),
    ink = shade(col, -0.3);
  c.fillStyle = col;
  c.fillRect(0, 0, S, S);
  switch (style) {
    case 'wood':
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? lo : col;
        c.fillRect(0, i * 32, S, 32);
        c.fillStyle = ink;
        c.fillRect(0, i * 32 + 30, S, 2);
        const off = (i * 53) % S;
        c.fillRect(off, i * 32, 2, 32);
        c.globalAlpha = 0.25;
        for (let k = 0; k < 4; k++) {
          c.fillStyle = hi;
          c.fillRect(r() * S, i * 32 + 6 + r() * 20, 20 + r() * 30, 2);
        }
        c.globalAlpha = 1;
      }
      break;
    case 'tile':
    case 'marble':
      c.fillStyle = hi;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) c.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
      if (style === 'marble') {
        c.strokeStyle = lo;
        c.lineWidth = 1.5;
        for (let k = 0; k < 6; k++) {
          c.beginPath();
          let x = r() * S,
            y = r() * S;
          c.moveTo(x, y);
          for (let j = 0; j < 5; j++) c.lineTo((x += (r() - 0.5) * 40), (y += r() * 20));
          c.stroke();
        }
      }
      break;
    case 'carpet':
      for (let i = 0; i < 900; i++) {
        c.fillStyle = r() > 0.5 ? lo : hi;
        c.fillRect(r() * S, r() * S, 2, 2);
      }
      break;
    case 'checker':
      c.fillStyle = shade(col, 0.55);
      c.fillRect(0, 0, 64, 64);
      c.fillRect(64, 64, 64, 64);
      break;
    case 'stone':
      for (let i = 0; i < 9; i++) {
        c.fillStyle = r() > 0.5 ? lo : hi;
        c.beginPath();
        c.ellipse((i % 3) * 43 + 21, Math.floor(i / 3) * 43 + 21, 18, 16, r(), 0, Math.PI * 2);
        c.fill();
      }
      break;
    case 'grass':
      c.strokeStyle = hi;
      for (let i = 0; i < 140; i++) {
        const x = r() * S,
          y = r() * S;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (r() - 0.5) * 6, y - 6);
        c.stroke();
      }
      break;
    case 'stars':
      c.fillStyle = hi;
      for (let i = 0; i < 6; i++) star(c, r() * S, r() * S, 6 + r() * 6);
      break;
    case 'hex':
      c.strokeStyle = lo;
      c.lineWidth = 3;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          const cx = x * 32 + (y % 2) * 16,
            cy = y * 28;
          c.beginPath();
          for (let k = 0; k < 6; k++) c.lineTo(cx + Math.cos((k * Math.PI) / 3) * 16, cy + Math.sin((k * Math.PI) / 3) * 16);
          c.closePath();
          c.stroke();
        }
      break;
    case 'stripes':
      c.fillStyle = hi;
      for (let i = 0; i < 4; i++) c.fillRect(i * 32, 0, 16, S);
      break;
    case 'dots':
      c.fillStyle = hi;
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) c.beginPath(), c.arc(x * 32 + 16 + (y % 2) * 16, y * 32 + 16, 6, 0, 7), c.fill();
      break;
    case 'candy':
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.55;
      for (let i = -2; i < 6; i++) {
        c.beginPath();
        c.moveTo(i * 32, 0);
        c.lineTo(i * 32 + 16, 0);
        c.lineTo(i * 32 + 16 + S, S);
        c.lineTo(i * 32 + S, S);
        c.fill();
      }
      c.globalAlpha = 1;
      break;
  }
  const t = track(new THREE.CanvasTexture(cv));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  texCache.set(key, t);
  return t;
}

/* ---------------- parede (desenhada direto no canvas da parede, para poder pintar) ---------------- */
export function drawWallpaper(c: CanvasRenderingContext2D, style: string, col: string, W: number, H: number, seed: string): void {
  const r = rng(hash(seed));
  const lo = shade(col, -0.1),
    hi = shade(col, 0.18);
  c.fillStyle = col;
  c.fillRect(0, 0, W, H);
  const U = 22;
  switch (style) {
    case 'stripes':
      c.fillStyle = hi;
      for (let x = 0; x < W; x += U * 1.6) c.fillRect(x, 0, U * 0.7, H);
      break;
    case 'dots':
      c.fillStyle = hi;
      for (let y = U / 2, j = 0; y < H; y += U, j++) for (let x = (j % 2) * (U / 2); x < W; x += U) c.beginPath(), c.arc(x, y, 3.5, 0, 7), c.fill();
      break;
    case 'brick':
      c.fillStyle = lo;
      for (let y = 0, j = 0; y < H; y += 12, j++) {
        c.fillRect(0, y, W, 2);
        for (let x = (j % 2) * 14; x < W; x += 28) c.fillRect(x, y, 2, 12);
      }
      break;
    case 'wood':
      for (let x = 0; x < W; x += 18) {
        c.fillStyle = (x / 18) % 2 ? lo : col;
        c.fillRect(x, 0, 18, H);
        c.fillStyle = shade(col, -0.25);
        c.fillRect(x, 0, 1.5, H);
      }
      break;
    case 'stars':
      c.fillStyle = hi;
      for (let i = 0; i < (W * H) / 500; i++) star(c, r() * W, r() * H, 3 + r() * 4);
      break;
    case 'hearts':
      c.fillStyle = hi;
      for (let y = 10, j = 0; y < H; y += U, j++) for (let x = 10 + (j % 2) * 11; x < W; x += U) heart(c, x, y, 5);
      break;
    case 'waves':
      c.strokeStyle = hi;
      c.lineWidth = 3;
      for (let y = 8; y < H; y += 14) {
        c.beginPath();
        for (let x = 0; x <= W; x += 4) c.lineTo(x, y + Math.sin(x / 8) * 3);
        c.stroke();
      }
      break;
    case 'tile':
      c.fillStyle = hi;
      for (let y = 0; y < H; y += 16) for (let x = 0; x < W; x += 16) c.fillRect(x + 1, y + 1, 14, 14);
      break;
    case 'check':
      c.fillStyle = hi;
      for (let y = 0, j = 0; y < H; y += 16, j++) for (let x = (j % 2) * 16; x < W; x += 32) c.fillRect(x, y, 16, 16);
      break;
    case 'clouds':
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i = 0; i < W / 40; i++) {
        const x = r() * W,
          y = r() * H * 0.8;
        for (let k = 0; k < 3; k++) c.beginPath(), c.arc(x + k * 8, y + (k === 1 ? -4 : 0), 7, 0, 7), c.fill();
      }
      break;
    case 'space':
      c.fillStyle = shade(col, -0.6);
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff';
      for (let i = 0; i < W / 3; i++) c.fillRect(r() * W, r() * H, 1.4, 1.4);
      c.fillStyle = hi;
      for (let i = 0; i < 3; i++) star(c, r() * W, r() * H, 4);
      break;
    default: {
      // tinta lisa com leve variação
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, hi);
      g.addColorStop(1, col);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
  }
  // rodapé
  c.fillStyle = shade(col, -0.35);
  c.fillRect(0, H - 5, W, 5);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(0, H - 5, W, 1);
}

/** tinta no formato do 2D ("<corIdx>:<acabamento>" | "pass:<id>") num retângulo */
export function paintFill(c: CanvasRenderingContext2D, spec: string, x: number, y: number, w: number, h: number, _W: number, H: number): void {
  const p = parsePaintSpec(spec);
  if (!p) return;
  const col = p.col;
  c.save();
  c.beginPath();
  c.rect(x, y, w, h);
  c.clip();
  if (p.finish === 'gradient') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(col, 0.45));
    g.addColorStop(1, shade(col, -0.15));
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
  } else {
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
    if (p.finish === 'stripes') {
      c.fillStyle = shade(col, 0.35);
      for (let sx = Math.floor(x / 16) * 16; sx < x + w; sx += 16) c.fillRect(sx, y, 6, h);
    } else if (p.finish === 'stars') {
      c.fillStyle = shade(col, 0.5);
      for (let sy = Math.floor(y / 16) * 16; sy < y + h + 16; sy += 16) for (let sx = Math.floor(x / 16) * 16; sx < x + w + 16; sx += 16) star(c, sx + ((sy / 16) % 2) * 8, sy, 3.5);
    } else if (p.finish === 'glitter') {
      for (let sy = Math.floor(y / 4) * 4; sy < y + h; sy += 4)
        for (let sx = Math.floor(x / 4) * 4; sx < x + w; sx += 4) {
          const k = (sx * 7 + sy * 13) % 11;
          if (k < 2) {
            c.fillStyle = k ? '#ffffff' : '#fff2a0';
            c.fillRect(sx, sy, 1.5, 1.5);
          }
        }
    }
  }
  c.restore();
}

/* ---------------- manchas (decalques) ---------------- */
export function splatTexture(kind: MessKind, seed: number): THREE.Texture {
  const v = seed % 3;
  const key = 's:' + kind + v;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 128;
  const [cv, c] = canvas(S, S);
  const r = rng(hash(key));
  const cols = MESS_COLORS[kind];
  if (kind === 'crumbs' || kind === 'confetti' || kind === 'balloon-pop') {
    for (let i = 0; i < (kind === 'crumbs' ? 40 : 34); i++) {
      const a = r() * 6.28,
        d = Math.sqrt(r()) * 52;
      c.fillStyle = cols[i % cols.length];
      c.save();
      c.translate(64 + Math.cos(a) * d, 64 + Math.sin(a) * d);
      c.rotate(r() * 3);
      if (kind === 'crumbs') c.beginPath(), c.arc(0, 0, 2 + r() * 3.5, 0, 7), c.fill();
      else if (kind === 'confetti') c.fillRect(-4, -2, 8, 4);
      else c.beginPath(), c.moveTo(-8, 0), c.quadraticCurveTo(0, -7, 8, 0), c.quadraticCurveTo(0, 3, -8, 0), c.fill();
      c.restore();
    }
  } else {
    // mancha com respingos
    const base = cols[0];
    c.fillStyle = base;
    c.beginPath();
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 6.283;
      const rr = 30 + r() * 16 + (i % 3 === 0 ? 10 : 0);
      c.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
    for (let i = 0; i < 9; i++) {
      const a = r() * 6.28,
        d = 46 + r() * 14;
      c.beginPath();
      c.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 3 + r() * 6, 0, 7);
      c.fill();
    }
    if (cols[1]) {
      c.fillStyle = cols[1];
      c.globalAlpha = 0.85;
      for (let i = 0; i < 5; i++) c.beginPath(), c.arc(44 + r() * 40, 44 + r() * 40, 5 + r() * 8, 0, 7), c.fill();
    }
    if (cols[2]) {
      c.fillStyle = cols[2];
      for (let i = 0; i < 6; i++) c.beginPath(), c.arc(40 + r() * 48, 40 + r() * 48, 2.5, 0, 7), c.fill();
    }
    c.globalAlpha = 0.5;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.ellipse(52, 50, 12, 6, -0.5, 0, 7);
    c.fill();
    c.globalAlpha = 1;
  }
  const t = track(new THREE.CanvasTexture(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** borrão macio redondo (sombra de contato / espuma / brilho) */
export function blobTexture(kind: 'shadow' | 'foam' | 'glow' | 'spark'): THREE.Texture {
  const key = 'b:' + kind;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 64;
  const [cv, c] = canvas(S, S);
  if (kind === 'spark') {
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(32, 2);
    c.quadraticCurveTo(32, 32, 62, 32);
    c.quadraticCurveTo(32, 32, 32, 62);
    c.quadraticCurveTo(32, 32, 2, 32);
    c.quadraticCurveTo(32, 32, 32, 2);
    c.fill();
  } else if (kind === 'foam') {
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#bfe8ff';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(32, 32, 26, 0, 7);
    c.fill();
    c.stroke();
    c.fillStyle = '#e8f7ff';
    c.beginPath();
    c.arc(24, 24, 7, 0, 7);
    c.fill();
  } else {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    const col = kind === 'shadow' ? '30,10,60' : '255,240,200';
    g.addColorStop(0, `rgba(${col},${kind === 'shadow' ? 0.55 : 1})`);
    g.addColorStop(0.6, `rgba(${col},${kind === 'shadow' ? 0.25 : 0.4})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  }
  const t = track(new THREE.CanvasTexture(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/* ---------------- arte de quadros/pôsteres/telas ---------------- */
export function artTexture(kind: 'poster' | 'painting' | 'tv' | 'arcade' | 'computer' | 'mirror' | 'window' | 'clock', seed: number, col: string): THREE.Texture {
  const key = 'a:' + kind + (seed % 4) + col;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 128;
  const [cv, c] = canvas(S, S);
  const r = rng(seed * 977 + 3);
  if (kind === 'window') {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, '#8fd3ff');
    g.addColorStop(1, '#d9f3ff');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      const x = r() * S,
        y = 20 + r() * 50;
      for (let k = 0; k < 3; k++) c.beginPath(), c.arc(x + k * 12, y - (k === 1 ? 6 : 0), 10, 0, 7), c.fill();
    }
    c.fillStyle = '#7fd36a';
    c.beginPath();
    c.ellipse(64, 140, 110, 40, 0, 0, 7);
    c.fill();
    c.fillStyle = col;
    c.fillRect(60, 0, 8, S);
    c.fillRect(0, 60, S, 8);
  } else if (kind === 'mirror') {
    const g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#d8f2ff');
    g.addColorStop(1, '#9cc6e8');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.moveTo(20, 100);
    c.lineTo(60, 20);
    c.lineTo(76, 20);
    c.lineTo(36, 100);
    c.fill();
  } else if (kind === 'clock') {
    c.fillStyle = '#fffaf0';
    c.beginPath();
    c.arc(64, 64, 60, 0, 7);
    c.fill();
    c.fillStyle = INK;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      c.beginPath();
      c.arc(64 + Math.cos(a) * 48, 64 + Math.sin(a) * 48, 4, 0, 7);
      c.fill();
    }
    c.strokeStyle = INK;
    c.lineWidth = 6;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(64, 64);
    c.lineTo(64, 28);
    c.moveTo(64, 64);
    c.lineTo(90, 70);
    c.stroke();
  } else if (kind === 'tv' || kind === 'arcade' || kind === 'computer') {
    const g = c.createLinearGradient(0, 0, 0, S);
    g.addColorStop(0, kind === 'arcade' ? '#2a1a63' : '#3fa0ff');
    g.addColorStop(1, kind === 'arcade' ? '#8a3a6e' : '#8a5cff');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    // personagem bolinha na tela (desenho original)
    c.fillStyle = '#ffc93d';
    c.beginPath();
    c.arc(64, 72, 26, 0, 7);
    c.fill();
    c.fillStyle = INK;
    c.beginPath();
    c.arc(55, 66, 4, 0, 7);
    c.arc(73, 66, 4, 0, 7);
    c.fill();
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) star(c, r() * S, r() * 40, 2 + r() * 3);
    if (kind === 'arcade') {
      c.fillStyle = '#4fd67a';
      c.fillRect(10, 110, 108, 8);
    }
  } else {
    // pôster / quadro: arte abstrata original com formas
    c.fillStyle = shade(col, 0.6);
    c.fillRect(0, 0, S, S);
    const cols = ['#ff5c7a', '#ffc93d', '#3fa0ff', '#4fd67a', '#c46bff', col];
    if (kind === 'painting') {
      const g = c.createLinearGradient(0, 0, 0, S);
      g.addColorStop(0, '#ffd9a3');
      g.addColorStop(1, '#ff9ab0');
      c.fillStyle = g;
      c.fillRect(0, 0, S, S);
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(90, 36, 16, 0, 7);
      c.fill();
      c.fillStyle = cols[seed % 5];
      c.beginPath();
      c.moveTo(0, S);
      c.lineTo(40, 60);
      c.lineTo(80, S);
      c.fill();
      c.fillStyle = cols[(seed + 2) % 5];
      c.beginPath();
      c.moveTo(40, S);
      c.lineTo(90, 70);
      c.lineTo(S + 10, S);
      c.fill();
    } else {
      for (let i = 0; i < 6; i++) {
        c.fillStyle = cols[Math.floor(r() * cols.length)];
        const x = r() * S,
          y = r() * S,
          s = 14 + r() * 26;
        if (i % 3 === 0) star(c, x, y, s);
        else if (i % 3 === 1) c.beginPath(), c.arc(x, y, s * 0.7, 0, 7), c.fill();
        else heart(c, x, y, s * 0.6);
      }
      c.fillStyle = INK;
      c.font = gameFont(700, 18);
      c.textAlign = 'center';
      c.fillText('BLOOP', 64, 118);
    }
  }
  const t = track(new THREE.CanvasTexture(cv));
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}
