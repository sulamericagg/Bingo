import { makeCanvas, rgba, rng, TAU } from './math';

/* ============================================================
 *  PLANETAS — textura giratória + iluminação fixa (look 3D)
 * ============================================================ */

export type PlanetKind = 'terra' | 'gas' | 'ice' | 'lava' | 'candy' | 'rocky' | 'toxic' | 'crystal';

interface PlanetPalette {
  a: string;
  b: string;
  c: string;
  d: string;
  atmo: string;
}

export const PLANET_PALETTES: Record<PlanetKind, PlanetPalette[]> = {
  terra: [
    { a: '#3fb4ff', b: '#1846c9', c: '#5fe38a', d: '#2c9a52', atmo: '#8fd8ff' },
    { a: '#4fe3d0', b: '#0f6e8f', c: '#f6e7a1', d: '#d0a95b', atmo: '#9ffcf0' },
  ],
  gas: [
    { a: '#ffd59a', b: '#f29a4e', c: '#d4602f', d: '#fff1d6', atmo: '#ffb878' },
    { a: '#b9a6ff', b: '#7a5cf0', c: '#4b2fb8', d: '#e4dcff', atmo: '#b29cff' },
    { a: '#9ff0ff', b: '#4fb5e6', c: '#2a74b8', d: '#e6fbff', atmo: '#9fe6ff' },
  ],
  ice: [{ a: '#f4fdff', b: '#9ed8ff', c: '#5fa8e8', d: '#ffffff', atmo: '#c8f3ff' }],
  lava: [{ a: '#5a2121', b: '#1e0707', c: '#ff7a1a', d: '#ffd04a', atmo: '#ff6a3d' }],
  candy: [
    { a: '#ff8fd2', b: '#ff4fa8', c: '#ffe1f3', d: '#ffffff', atmo: '#ffa6e0' },
    { a: '#8ffff0', b: '#36d1c4', c: '#fff3a6', d: '#ffffff', atmo: '#9ffff2' },
  ],
  rocky: [
    { a: '#cbbcff', b: '#6a55c8', c: '#4a3aa0', d: '#e6deff', atmo: '#b9a8ff' },
    { a: '#ffcfb0', b: '#c0715a', c: '#8f4a3a', d: '#ffe6d8', atmo: '#ffb79a' },
  ],
  toxic: [{ a: '#d4ff6b', b: '#4ca318', c: '#2f6e0c', d: '#f4ffc0', atmo: '#c4ff7a' }],
  crystal: [{ a: '#ffc3fb', b: '#a74dff', c: '#6dfcff', d: '#ffffff', atmo: '#e19bff' }],
};

export interface PlanetSprite {
  surface: HTMLCanvasElement;
  light: HTMLCanvasElement;
  atmo: HTMLCanvasElement;
  ringBack: HTMLCanvasElement | null;
  ringFront: HTMLCanvasElement | null;
  ringTilt: number;
  size: number; // px (diâmetro do disco)
}

export function buildPlanetSprite(kind: PlanetKind, pal: PlanetPalette, rPx: number, seed: number, ringed: boolean): PlanetSprite {
  const R = Math.max(4, Math.round(rPx));
  const D = R * 2;
  const r = rng(seed);
  const [surface, s] = makeCanvas(D, D);
  s.save();
  s.beginPath();
  s.arc(R, R, R, 0, TAU);
  s.clip();
  const g = s.createRadialGradient(R * 0.7, R * 0.7, R * 0.1, R, R, R * 1.1);
  g.addColorStop(0, pal.a);
  g.addColorStop(1, pal.b);
  s.fillStyle = g;
  s.fillRect(0, 0, D, D);

  const blob = (cx: number, cy: number, rad: number, color: string, alpha = 1, lobes = 7) => {
    s.globalAlpha = alpha;
    s.fillStyle = color;
    s.beginPath();
    for (let i = 0; i <= lobes * 3; i++) {
      const a = (i / (lobes * 3)) * TAU;
      const rr = rad * (0.75 + r() * 0.45);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y);
      else s.quadraticCurveTo(cx + Math.cos(a - 0.15) * rr * 1.1, cy + Math.sin(a - 0.15) * rr * 1.1, x, y);
    }
    s.closePath();
    s.fill();
    s.globalAlpha = 1;
  };

  const crater = (cx: number, cy: number, rad: number, dark: string, lit: string) => {
    s.fillStyle = dark;
    s.globalAlpha = 0.55;
    s.beginPath();
    s.arc(cx, cy, rad, 0, TAU);
    s.fill();
    s.globalAlpha = 0.6;
    s.strokeStyle = lit;
    s.lineWidth = Math.max(1, rad * 0.22);
    s.beginPath();
    s.arc(cx + rad * 0.12, cy + rad * 0.12, rad * 0.92, Math.PI * 0.1, Math.PI * 1.0);
    s.stroke();
    s.globalAlpha = 1;
  };

  switch (kind) {
    case 'terra': {
      for (let i = 0; i < 6; i++) blob(r() * D, r() * D, R * (0.25 + r() * 0.35), pal.c, 1, 5);
      for (let i = 0; i < 5; i++) blob(r() * D, r() * D, R * (0.1 + r() * 0.15), pal.d, 0.9, 4);
      s.globalAlpha = 0.5;
      for (let i = 0; i < 7; i++) {
        s.strokeStyle = '#ffffff';
        s.lineWidth = R * (0.04 + r() * 0.06);
        s.lineCap = 'round';
        const y = r() * D;
        const x = r() * D;
        s.beginPath();
        s.moveTo(x, y);
        s.bezierCurveTo(x + R * 0.3, y - R * 0.1, x + R * 0.5, y + R * 0.1, x + R * 0.8, y);
        s.stroke();
      }
      s.globalAlpha = 1;
      break;
    }
    case 'gas': {
      const cols = [pal.a, pal.b, pal.c, pal.d];
      let y = 0;
      while (y < D) {
        const h = R * (0.08 + r() * 0.22);
        s.fillStyle = cols[Math.floor(r() * cols.length)];
        s.globalAlpha = 0.55 + r() * 0.45;
        s.beginPath();
        s.moveTo(0, y);
        const amp = R * 0.05;
        for (let x = 0; x <= D; x += D / 12) s.lineTo(x, y + Math.sin(x * 0.05 + y) * amp);
        for (let x = D; x >= 0; x -= D / 12) s.lineTo(x, y + h + Math.sin(x * 0.04 + y) * amp);
        s.closePath();
        s.fill();
        y += h * 0.85;
      }
      s.globalAlpha = 1;
      // grande tempestade
      s.fillStyle = pal.c;
      s.globalAlpha = 0.8;
      s.beginPath();
      s.ellipse(R * (0.6 + r() * 0.8), R * (0.6 + r() * 0.8), R * 0.28, R * 0.16, 0, 0, TAU);
      s.fill();
      s.fillStyle = pal.d;
      s.globalAlpha = 0.6;
      s.beginPath();
      s.ellipse(R * 1.0, R * 1.0, R * 0.12, R * 0.07, 0, 0, TAU);
      s.fill();
      s.globalAlpha = 1;
      break;
    }
    case 'ice': {
      for (let i = 0; i < 8; i++) blob(r() * D, r() * D, R * (0.15 + r() * 0.3), pal.d, 0.55, 5);
      s.strokeStyle = pal.c;
      s.lineWidth = Math.max(1, R * 0.03);
      s.globalAlpha = 0.7;
      for (let i = 0; i < 9; i++) {
        let x = r() * D;
        let y = r() * D;
        s.beginPath();
        s.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.5) * R * 0.6;
          y += (r() - 0.5) * R * 0.6;
          s.lineTo(x, y);
        }
        s.stroke();
      }
      s.globalAlpha = 1;
      break;
    }
    case 'lava': {
      for (let i = 0; i < 7; i++) blob(r() * D, r() * D, R * (0.2 + r() * 0.3), '#3a1010', 0.8, 6);
      s.lineCap = 'round';
      for (let pass = 0; pass < 2; pass++) {
        s.strokeStyle = pass === 0 ? pal.c : pal.d;
        s.lineWidth = pass === 0 ? Math.max(2, R * 0.09) : Math.max(1, R * 0.03);
        s.shadowColor = pal.c;
        s.shadowBlur = pass === 0 ? R * 0.25 : 0;
        const rr = rng(seed + 99);
        for (let i = 0; i < 8; i++) {
          let x = rr() * D;
          let y = rr() * D;
          s.beginPath();
          s.moveTo(x, y);
          for (let k = 0; k < 5; k++) {
            x += (rr() - 0.5) * R * 0.55;
            y += (rr() - 0.5) * R * 0.55;
            s.lineTo(x, y);
          }
          s.stroke();
        }
      }
      s.shadowBlur = 0;
      break;
    }
    case 'candy': {
      s.translate(R, R);
      const n = 10;
      for (let i = 0; i < n; i++) {
        s.fillStyle = i % 2 ? pal.c : pal.b;
        s.beginPath();
        s.moveTo(0, 0);
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          const a = (i / n) * TAU + t * 1.6;
          s.lineTo(Math.cos(a) * R * 1.5 * t, Math.sin(a) * R * 1.5 * t);
        }
        for (let k = 10; k >= 0; k--) {
          const t = k / 10;
          const a = ((i + 1) / n) * TAU + t * 1.6;
          s.lineTo(Math.cos(a) * R * 1.5 * t, Math.sin(a) * R * 1.5 * t);
        }
        s.fill();
      }
      s.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 14; i++) {
        s.fillStyle = ['#ffffff', '#fff36b', '#7dfcff', '#ff6bd5'][i % 4];
        s.save();
        s.translate(r() * D, r() * D);
        s.rotate(r() * TAU);
        s.beginPath();
        s.roundRect(-R * 0.06, -R * 0.02, R * 0.12, R * 0.04, R * 0.02);
        s.fill();
        s.restore();
      }
      break;
    }
    case 'rocky': {
      for (let i = 0; i < 5; i++) blob(r() * D, r() * D, R * (0.2 + r() * 0.3), pal.c, 0.35, 6);
      for (let i = 0; i < 11; i++) crater(r() * D, r() * D, R * (0.06 + r() * 0.18), pal.c, pal.d);
      break;
    }
    case 'toxic': {
      for (let i = 0; i < 9; i++) blob(r() * D, r() * D, R * (0.12 + r() * 0.25), pal.c, 0.6, 5);
      for (let i = 0; i < 14; i++) {
        s.fillStyle = pal.d;
        s.globalAlpha = 0.6;
        s.beginPath();
        s.arc(r() * D, r() * D, R * (0.02 + r() * 0.06), 0, TAU);
        s.fill();
      }
      s.globalAlpha = 1;
      break;
    }
    case 'crystal': {
      for (let i = 0; i < 16; i++) {
        const cx = r() * D;
        const cy = r() * D;
        const sz = R * (0.12 + r() * 0.22);
        const rot = r() * TAU;
        s.save();
        s.translate(cx, cy);
        s.rotate(rot);
        s.fillStyle = i % 3 === 0 ? pal.c : i % 3 === 1 ? pal.a : pal.b;
        s.globalAlpha = 0.85;
        s.beginPath();
        s.moveTo(0, -sz);
        s.lineTo(sz * 0.5, 0);
        s.lineTo(0, sz);
        s.lineTo(-sz * 0.5, 0);
        s.closePath();
        s.fill();
        s.fillStyle = '#ffffff';
        s.globalAlpha = 0.5;
        s.beginPath();
        s.moveTo(0, -sz);
        s.lineTo(sz * 0.5, 0);
        s.lineTo(0, 0);
        s.closePath();
        s.fill();
        s.restore();
      }
      s.globalAlpha = 1;
      break;
    }
  }
  s.restore();

  /* ---------- iluminação fixa: sombra + especular + borda (fresnel) ---------- */
  const [light, l] = makeCanvas(D, D);
  l.beginPath();
  l.arc(R, R, R, 0, TAU);
  l.clip();
  const sh = l.createRadialGradient(R * 0.62, R * 0.55, R * 0.15, R * 0.85, R * 0.85, R * 1.45);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(0.55, 'rgba(8,2,30,0.18)');
  sh.addColorStop(0.85, 'rgba(8,2,30,0.62)');
  sh.addColorStop(1, 'rgba(4,0,18,0.85)');
  l.fillStyle = sh;
  l.fillRect(0, 0, D, D);
  const rim = l.createRadialGradient(R, R, R * 0.8, R, R, R);
  rim.addColorStop(0, rgba(pal.atmo, 0));
  rim.addColorStop(1, rgba(pal.atmo, 0.55));
  l.fillStyle = rim;
  l.fillRect(0, 0, D, D);
  const spec = l.createRadialGradient(R * 0.62, R * 0.52, 0, R * 0.62, R * 0.52, R * 0.55);
  spec.addColorStop(0, 'rgba(255,255,255,0.42)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  l.fillStyle = spec;
  l.fillRect(0, 0, D, D);
  // contorno suave do lado escuro (contraste com o fundo)
  l.strokeStyle = 'rgba(0,0,0,0.25)';
  l.lineWidth = Math.max(1, R * 0.04);
  l.beginPath();
  l.arc(R, R, R - l.lineWidth / 2, 0, TAU);
  l.stroke();

  /* ---------- atmosfera externa ---------- */
  const AR = Math.round(R * 1.55);
  const [atmo, a] = makeCanvas(AR * 2, AR * 2);
  const ag = a.createRadialGradient(AR, AR, R * 0.9, AR, AR, AR);
  ag.addColorStop(0, rgba(pal.atmo, 0.55));
  ag.addColorStop(0.25, rgba(pal.atmo, 0.22));
  ag.addColorStop(1, rgba(pal.atmo, 0));
  a.fillStyle = ag;
  a.fillRect(0, 0, AR * 2, AR * 2);

  /* ---------- anéis ---------- */
  let ringBack: HTMLCanvasElement | null = null;
  let ringFront: HTMLCanvasElement | null = null;
  const tilt = 0.32;
  if (ringed) {
    const RW = Math.round(R * 2.1);
    const RH = Math.round(R * 2.1 * tilt) + 4;
    const drawRing = (front: boolean) => {
      const [c, x] = makeCanvas(RW * 2, RH * 2);
      x.translate(RW, RH);
      x.scale(1, tilt);
      const rr = rng(seed + 7);
      for (let i = 0; i < 6; i++) {
        const rad = R * (1.3 + i * 0.13);
        x.strokeStyle = i % 2 ? pal.d : pal.a;
        x.globalAlpha = 0.35 + rr() * 0.45;
        x.lineWidth = R * (0.06 + rr() * 0.07);
        x.beginPath();
        if (front) x.arc(0, 0, rad, 0, Math.PI);
        else x.arc(0, 0, rad, Math.PI, TAU);
        x.stroke();
      }
      return c;
    };
    ringBack = drawRing(false);
    ringFront = drawRing(true);
  }

  return { surface, light, atmo, ringBack, ringFront, ringTilt: tilt, size: D };
}

/* ============================================================
 *  GLOW / MOEDA / GEMA / ASTEROIDE
 * ============================================================ */

const glowCache = new Map<string, HTMLCanvasElement>();
export function glow(color: string, size = 64): HTMLCanvasElement {
  const key = color + size;
  let c = glowCache.get(key);
  if (c) return c;
  const [cv, x] = makeCanvas(size, size);
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.25, rgba(color.length === 7 ? color : '#ffffff', 0.55));
  g.addColorStop(1, rgba(color.length === 7 ? color : '#ffffff', 0));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  glowCache.set(key, cv);
  c = cv;
  return c;
}

export function buildCoin(px: number): HTMLCanvasElement {
  const R = Math.max(4, Math.round(px));
  const [c, x] = makeCanvas(R * 2 + 2, R * 2 + 2);
  x.translate(R + 1, R + 1);
  const g = x.createLinearGradient(-R, -R, R, R);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.45, '#ffcf2e');
  g.addColorStop(1, '#d98a00');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  x.strokeStyle = '#a85d00';
  x.lineWidth = R * 0.12;
  x.stroke();
  x.fillStyle = '#ffb400';
  x.beginPath();
  x.arc(0, 0, R * 0.68, 0, TAU);
  x.fill();
  // estrela
  x.fillStyle = '#fff3a0';
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? R * 0.22 : R * 0.5;
    x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.7)';
  x.beginPath();
  x.ellipse(-R * 0.35, -R * 0.4, R * 0.25, R * 0.12, -0.7, 0, TAU);
  x.fill();
  return c;
}

export function buildGem(px: number): HTMLCanvasElement {
  const R = Math.max(5, Math.round(px));
  const [c, x] = makeCanvas(R * 2 + 2, R * 2 + 2);
  x.translate(R + 1, R + 1);
  const top = -R;
  const mid = -R * 0.3;
  const pts: [number, number][] = [
    [-R * 0.55, top], [R * 0.55, top], [R, mid], [0, R], [-R, mid],
  ];
  const g = x.createLinearGradient(0, -R, 0, R);
  g.addColorStop(0, '#9ffcff');
  g.addColorStop(0.5, '#3fb8ff');
  g.addColorStop(1, '#7b3dff');
  x.fillStyle = g;
  x.beginPath();
  pts.forEach(([px2, py], i) => (i ? x.lineTo(px2, py) : x.moveTo(px2, py)));
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = R * 0.08;
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.55)';
  x.beginPath();
  x.moveTo(-R * 0.55, top);
  x.lineTo(0, mid);
  x.lineTo(-R, mid);
  x.closePath();
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.25)';
  x.beginPath();
  x.moveTo(R * 0.55, top);
  x.lineTo(0, mid);
  x.lineTo(R, mid);
  x.closePath();
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.45)';
  x.lineWidth = R * 0.05;
  x.beginPath();
  x.moveTo(-R, mid);
  x.lineTo(R, mid);
  x.moveTo(0, mid);
  x.lineTo(0, R);
  x.stroke();
  return c;
}

export function buildAsteroid(px: number, seed: number): HTMLCanvasElement {
  const R = Math.max(4, Math.round(px));
  const [c, x] = makeCanvas(R * 2 + 4, R * 2 + 4);
  const r = rng(seed);
  x.translate(R + 2, R + 2);
  x.beginPath();
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = R * (0.78 + r() * 0.22);
    x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  const g = x.createRadialGradient(-R * 0.4, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
  g.addColorStop(0, '#ff8a7a');
  g.addColorStop(0.5, '#a33a4a');
  g.addColorStop(1, '#3a0c1e');
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = '#ff4f6a';
  x.lineWidth = Math.max(1, R * 0.12);
  x.stroke();
  for (let i = 0; i < 4; i++) {
    x.fillStyle = 'rgba(40,0,15,0.45)';
    x.beginPath();
    x.arc((r() - 0.5) * R, (r() - 0.5) * R, R * (0.12 + r() * 0.15), 0, TAU);
    x.fill();
  }
  return c;
}

/* ============================================================
 *  FUNDO — estrelas em tiles + nebulosas
 * ============================================================ */

export function buildStarTile(size: number, count: number, maxR: number, seed: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(size, size);
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const px = r() * size;
    const py = r() * size;
    const rad = 0.4 + r() * maxR;
    const tint = r();
    x.fillStyle = tint < 0.15 ? '#ffd9a8' : tint < 0.3 ? '#a8d8ff' : '#ffffff';
    x.globalAlpha = 0.35 + r() * 0.65;
    x.beginPath();
    x.arc(px, py, rad, 0, TAU);
    x.fill();
    if (rad > maxR * 0.75) {
      x.globalAlpha *= 0.5;
      x.fillRect(px - rad * 3, py - 0.4, rad * 6, 0.8);
      x.fillRect(px - 0.4, py - rad * 3, 0.8, rad * 6);
    }
  }
  return c;
}

export function buildNebula(size: number, colors: string[], seed: number): HTMLCanvasElement {
  const [c, x] = makeCanvas(size, size);
  const r = rng(seed);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const cx = size * (0.25 + r() * 0.5);
    const cy = size * (0.25 + r() * 0.5);
    const rad = size * (0.15 + r() * 0.3);
    const col = colors[i % colors.length];
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, rgba(col, 0.22));
    g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
  }
  return c;
}

/* ============================================================
 *  PERSONAGEM — implementação em ./character.ts
 * ============================================================ */

export { drawPlayer, type PlayerPose } from './character';
