/**
 * Página de composição de artes de marketing (dev-only). Usada por scripts/promo/*.mjs via Playwright:
 *   await page.evaluate((spec) => window.__promo.render(spec), spec)  → retorna dataURL PNG/JPEG
 * Usa os mesmos sprites/personagens do jogo, então as artes acompanham as mudanças do jogo.
 */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { buildPlanetSprite, buildStarTile, drawPlayer, glow, PLANET_PALETTES, type PlanetKind } from '../../src/game/sprites';
import { SKINS, TRAILS, skinById, RARITY_INFO, type Skin } from '../../src/game/skins';
import { drawTeamRossLockup, drawTeamRossMark } from './teamross';

type Ctx = CanvasRenderingContext2D;
interface Spec {
  kind: string;
  w: number;
  h: number;
  t?: number;
  format?: 'png' | 'jpeg';
  shots?: Record<string, string>;
  [k: string]: unknown;
}

const TAU = Math.PI * 2;
const c = document.getElementById('c') as HTMLCanvasElement;
let x = c.getContext('2d')!;
let W = 0;
let H = 0;
const imgs: Record<string, HTMLImageElement> = {};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const easeOutBack = (t: number) => {
  t = clamp(t, 0, 1);
  const c1 = 1.70158;
  return 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* ============================== base ============================== */

const PALS: Record<string, [string, string, string, string, string]> = {
  violet: ['#14062f', '#3a1170', '#5c1a8a', 'rgba(255,79,216,0.38)', 'rgba(60,140,255,0.35)'],
  ocean: ['#03102a', '#0a3a66', '#0d5a7a', 'rgba(60,255,208,0.30)', 'rgba(90,110,255,0.35)'],
  sunset: ['#1c0626', '#5c1638', '#8a2a3a', 'rgba(255,150,60,0.38)', 'rgba(255,60,140,0.35)'],
  toxic: ['#02140f', '#0a4532', '#0d5a48', 'rgba(196,255,60,0.28)', 'rgba(0,224,192,0.30)'],
  core: ['#120428', '#43105e', '#6a1a8a', 'rgba(208,79,255,0.4)', 'rgba(255,92,168,0.35)'],
};
let starTile: HTMLCanvasElement | null = null;
const planetCache = new Map<string, ReturnType<typeof buildPlanetSprite>>();

function bg(pal = 'violet', seed = 0): void {
  const [a, b, cc, n1, n2] = PALS[pal] ?? PALS.violet;
  const g = x.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, a);
  g.addColorStop(0.6, b);
  g.addColorStop(1, cc);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const M = Math.max(W, H);
  const neb = (fx: number, fy: number, r: number, col: string) => {
    const gg = x.createRadialGradient(W * fx, H * fy, 0, W * fx, H * fy, M * r);
    gg.addColorStop(0, col);
    gg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    x.fillStyle = gg;
    x.fillRect(0, 0, W, H);
  };
  neb(0.75 - (seed % 3) * 0.1, 0.25, 0.6, n1);
  neb(0.2, 0.85, 0.5, n2);
  if (!starTile) starTile = buildStarTile(512, 120, 2.6, 7);
  for (let ty = 0; ty < H; ty += 512) for (let tx = 0; tx < W; tx += 512) x.drawImage(starTile, tx, ty);
}

function planet(cx: number, cy: number, r: number, kind: PlanetKind, pal: number, ringed: boolean, seed: number, tilt = -0.35): void {
  const key = `${kind}|${pal}|${Math.round(r)}|${seed}|${ringed}`;
  let sp = planetCache.get(key);
  if (!sp) {
    sp = buildPlanetSprite(kind, PLANET_PALETTES[kind][pal % PLANET_PALETTES[kind].length], r, seed, ringed);
    planetCache.set(key, sp);
  }
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.drawImage(sp.atmo, cx - sp.atmo.width / 2, cy - sp.atmo.height / 2);
  x.restore();
  const ring = (img: HTMLCanvasElement | undefined) => {
    if (!img) return;
    x.save();
    x.translate(cx, cy);
    x.rotate(tilt);
    x.drawImage(img, -img.width / 2, -img.height / 2);
    x.restore();
  };
  ring(sp.ringBack ?? undefined);
  x.drawImage(sp.surface, cx - r, cy - r);
  x.drawImage(sp.light, cx - r, cy - r);
  ring(sp.ringFront ?? undefined);
}

function hero(cx: number, cy: number, R: number, rot = -0.2, skin: string | Skin = 'bloop', mood: 'idle' | 'happy' | 'fly' = 'happy', t = 0.6, glowA = 0.7): void {
  const s = typeof skin === 'string' ? skinById(skin) : skin;
  if (glowA > 0) {
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = glowA;
    x.drawImage(glow(s.light, 128), cx - R * 2.8, cy - R * 2.8, R * 5.6, R * 5.6);
    x.restore();
  }
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  drawPlayer(x, s, R, { t, blink: 0, lookX: 0.3, lookY: -0.2, sx: 1, sy: 1, mood, lx: -0.6, ly: -0.8 });
  x.restore();
}

function trail(fromX: number, fromY: number, toX: number, toY: number, size: number, cols = ['#ffffff', '#ffe27a', '#ff9de6']): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 44; i++) {
    const t = i / 44;
    const px = fromX + (toX - fromX) * t + Math.sin(t * 9) * size * 0.3;
    const py = fromY + (toY - fromY) * t;
    const r = size * (0.2 + t * 0.8);
    x.globalAlpha = 0.2 + t * 0.6;
    x.drawImage(glow(cols[i % cols.length], 64), px - r, py - r, r * 2, r * 2);
  }
  x.restore();
}

function logo(cx: number, cy: number, size: number, oneLine = false): void {
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `700 ${size}px Fredoka`;
  const lines: [string, string, string, string][] = [
    ['BLOOP', '#ffc2f0', '#ff5cc8', '#5a1a8f'],
    ['ORBIT', '#b6f7ff', '#5ef0ff', '#1a3d8f'],
  ];
  const draw = (t: string, c1: string, c2: string, sh: string, X: number, y: number) => {
    x.lineJoin = 'round';
    x.lineWidth = size * 0.12;
    x.strokeStyle = sh;
    x.strokeText(t, X, y + size * 0.07);
    x.fillStyle = sh;
    x.fillText(t, X, y + size * 0.07);
    const g = x.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0.1, '#ffffff');
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    x.shadowColor = c2;
    x.shadowBlur = size * 0.25;
    x.fillStyle = g;
    x.fillText(t, X, y);
    x.shadowBlur = 0;
  };
  if (oneLine) {
    const w1 = x.measureText('BLOOP ').width;
    const w2 = x.measureText('ORBIT').width;
    const x0 = cx - (w1 + w2) / 2;
    x.textAlign = 'left';
    draw(...lines[0], x0, cy);
    draw(...lines[1], x0 + w1, cy);
  } else lines.forEach(([t, c1, c2, sh], i) => draw(t, c1, c2, sh, cx, cy + (i - 0.5) * size * 0.9));
  x.restore();
}

/**
 * Texto de marketing: Fredoka 700, contorno grosso, sombra. Palavras entre *asteriscos* ganham destaque.
 * Retorna a altura usada.
 */
function headline(text: string, cx: number, cy: number, size: number, o: { maxW?: number; hl?: string; fill?: string; stroke?: string; lh?: number; align?: 'center' | 'left' } = {}): number {
  const lines = text.split('\n');
  const maxW = o.maxW ?? W * 0.9;
  x.save();
  x.font = `700 ${size}px Fredoka`;
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, x.measureText(l.replace(/\*/g, '')).width);
  if (widest > maxW) size *= maxW / widest;
  x.font = `700 ${size}px Fredoka`;
  const lh = size * (o.lh ?? 1.04);
  const y0 = cy - ((lines.length - 1) * lh) / 2;
  x.textBaseline = 'middle';
  x.lineJoin = 'round';
  lines.forEach((line, i) => {
    const parts = line.split('*');
    const full = parts.join('');
    const lw = x.measureText(full).width;
    let X = (o.align ?? 'center') === 'center' ? cx - lw / 2 : cx;
    const y = y0 + i * lh;
    x.textAlign = 'left';
    // contorno e sombra (passada inteira)
    x.shadowColor = 'rgba(10,0,30,0.55)';
    x.shadowBlur = size * 0.18;
    x.shadowOffsetY = size * 0.06;
    x.lineWidth = size * 0.2;
    x.strokeStyle = o.stroke ?? '#21063f';
    x.strokeText(full, X, y);
    x.shadowColor = 'transparent';
    parts.forEach((p, k) => {
      if (!p) return;
      const hl = k % 2 === 1;
      const g = x.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      if (hl) {
        g.addColorStop(0, '#fffbd0');
        g.addColorStop(0.5, o.hl ?? '#ffe14a');
        g.addColorStop(1, '#ffa31a');
      } else {
        g.addColorStop(0, '#ffffff');
        g.addColorStop(1, o.fill ?? '#ffe3fb');
      }
      x.fillStyle = g;
      x.fillText(p, X, y);
      X += x.measureText(p).width;
    });
  });
  x.restore();
  return lines.length * lh;
}

function rrect(X: number, Y: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + w, Y, X + w, Y + h, r);
  x.arcTo(X + w, Y + h, X, Y + h, r);
  x.arcTo(X, Y + h, X, Y, r);
  x.arcTo(X, Y, X + w, Y, r);
  x.closePath();
}

function pill(text: string, cx: number, cy: number, size: number, o: { bg?: string; bg2?: string; fg?: string; sub?: string } = {}): void {
  x.save();
  x.font = `700 ${size}px Fredoka`;
  const subSize = size * 0.5;
  const tw = x.measureText(text).width;
  x.font = `600 ${subSize}px Fredoka`;
  const sw = o.sub ? x.measureText(o.sub).width : 0;
  const w = Math.max(tw, sw) + size * 1.6;
  const h = o.sub ? size * 2.1 : size * 1.6;
  x.shadowColor = 'rgba(0,0,0,0.45)';
  x.shadowBlur = size * 0.5;
  x.shadowOffsetY = size * 0.12;
  rrect(cx - w / 2, cy - h / 2, w, h, h * 0.3);
  const g = x.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
  g.addColorStop(0, o.bg ?? '#3dff8f');
  g.addColorStop(1, o.bg2 ?? '#12b860');
  x.fillStyle = g;
  x.fill();
  x.shadowColor = 'transparent';
  x.lineWidth = size * 0.1;
  x.strokeStyle = 'rgba(255,255,255,0.75)';
  x.stroke();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = o.fg ?? '#ffffff';
  if (o.sub) {
    x.font = `600 ${subSize}px Fredoka`;
    x.globalAlpha = 0.9;
    x.fillText(o.sub, cx, cy - size * 0.5);
    x.globalAlpha = 1;
    x.font = `700 ${size}px Fredoka`;
    x.fillText(text, cx, cy + size * 0.28);
  } else {
    x.font = `700 ${size}px Fredoka`;
    x.fillText(text, cx, cy + size * 0.04);
  }
  x.restore();
}

/** "Celular" com a captura do jogo: cantos arredondados, borda luminosa. */
function phone(img: HTMLImageElement, cx: number, cy: number, w: number, tilt = 0, crop?: [number, number, number, number]): void {
  const [sx, sy, sw, sh] = crop ?? [0, 0, img.width, img.height];
  const h = (w * sh) / sw;
  const r = w * 0.07;
  x.save();
  x.translate(cx, cy);
  x.rotate(tilt);
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = w * 0.08;
  x.shadowOffsetY = w * 0.03;
  rrect(-w / 2 - w * 0.025, -h / 2 - w * 0.025, w * 1.05, h + w * 0.05, r * 1.25);
  const g = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.5, '#ffc8f2');
  g.addColorStop(1, '#9ff4ff');
  x.fillStyle = g;
  x.fill();
  x.shadowColor = 'transparent';
  rrect(-w / 2, -h / 2, w, h, r);
  x.save();
  x.clip();
  x.drawImage(img, sx, sy, sw, sh, -w / 2, -h / 2, w, h);
  x.restore();
  x.restore();
}

function sparkle(cx: number, cy: number, r: number, color = '#ffffff', alpha = 1): void {
  x.save();
  x.globalAlpha = alpha;
  x.globalCompositeOperation = 'lighter';
  x.drawImage(glow(color, 64), cx - r * 1.6, cy - r * 1.6, r * 3.2, r * 3.2);
  x.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const rad = i % 2 ? r * 0.22 : r;
    x.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  x.closePath();
  x.fillStyle = color;
  x.fill();
  x.restore();
}

/** Grade de personagens com halo de raridade. */
function skinGrid(X: number, Y: number, w: number, cols: number, list: Skin[], t = 0.5, labels = false): number {
  const cell = w / cols;
  const R = cell * 0.27;
  list.forEach((s, i) => {
    const cx = X + (i % cols) * cell + cell / 2;
    const cy = Y + Math.floor(i / cols) * cell + cell / 2;
    const col = RARITY_INFO[s.rarity].color;
    x.save();
    rrect(cx - cell * 0.45, cy - cell * 0.45, cell * 0.9, cell * 0.9, cell * 0.18);
    const g = x.createRadialGradient(cx, cy - cell * 0.1, 0, cx, cy, cell * 0.6);
    g.addColorStop(0, col + '66');
    g.addColorStop(1, 'rgba(20,6,50,0.75)');
    x.fillStyle = g;
    x.fill();
    x.lineWidth = Math.max(2, cell * 0.025);
    x.strokeStyle = col;
    x.stroke();
    x.restore();
    hero(cx, cy + (labels ? -cell * 0.04 : cell * 0.03), R, 0, s, 'happy', t + i * 0.37, 0.35);
    if (labels) {
      x.save();
      x.font = `600 ${cell * 0.1}px Fredoka`;
      x.textAlign = 'center';
      x.fillStyle = '#ffffff';
      x.fillText(s.name, cx, cy + cell * 0.36);
      x.restore();
    }
  });
  return Math.ceil(list.length / cols) * cell;
}

function vignette(a = 0.5): void {
  const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,12,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
}

const SHOWCASE = ['phoenix', 'dragon', 'cyber', 'king', 'galaxy', 'unicorn', 'robot', 'ninja', 'wizard', 'capy', 'astro', 'pirate', 'kitty', 'crystal', 'lava', 'samurai'];
const pickSkins = (n: number) => SHOWCASE.map(skinById).filter((s, i, a) => a.indexOf(s) === i).slice(0, n);
const countPlus = (n: number) => `${Math.floor(n / 5) * 5}+`;

/* ============================== composições ============================== */

type Fn = (s: Spec) => void | Promise<void>;
const K: Record<string, Fn> = {};

/** Texto sobreposto ao vídeo (fundo transparente). */
K.overlay = (s) => {
  x.save();
  const size = Number(s.size ?? 150);
  const y = H * Number(s.y ?? 0.2);
  // faixa escura suave atrás do texto para legibilidade
  if (s.band !== false) {
    x.globalAlpha = s.t != null ? clamp(Number(s.t) / 0.15, 0, 1) : 1;
    const bh = size * (String(s.text).split('\n').length + 0.9);
    const g = x.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
    g.addColorStop(0, 'rgba(10,0,30,0)');
    g.addColorStop(0.5, 'rgba(10,0,30,0.45)');
    g.addColorStop(1, 'rgba(10,0,30,0)');
    x.fillStyle = g;
    x.fillRect(0, y - bh / 2, W, bh);
  }
  // animação de entrada (t em s): "pop" com leve rebote
  if (s.t != null) {
    const t = Number(s.t);
    const k = 1 + 0.32 * Math.exp(-t * 11) * Math.cos(t * 15);
    x.globalAlpha = s.fadeIn === false ? 1 : clamp(t / 0.08, 0, 1);
    x.translate(W / 2, y);
    x.scale(k, k);
    x.translate(-W / 2, -y);
  }
  headline(String(s.text), W / 2, y, size, { maxW: W * 0.82 });
  if (s.sub) {
    x.save();
    x.font = `600 ${size * 0.34}px Fredoka`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = '#ffffff';
    x.shadowColor = 'rgba(0,0,0,0.7)';
    x.shadowBlur = 12;
    x.fillText(String(s.sub), W / 2, y + size * (String(s.text).split('\n').length * 0.52 + 0.45));
    x.restore();
  }
  x.restore();
};

/** Marca d'água pequena (logo) para os vídeos. */
K.watermark = () => {
  logo(W * 0.5, H * 0.5, H * 0.36, true);
};

/** Cartão final animado (t em segundos). layout: v | h | sq */
K.endcard = (s) => {
  const t = Number(s.t ?? 2);
  const L = String(s.layout ?? 'v');
  bg('violet', 1);
  const k = Math.min(W, H);
  const drift = t * 6;
  // planetas decorativos com leve parallax
  if (L === 'h') {
    planet(W * 0.12, H * 0.82 + drift, H * 0.3, 'gas', 0, true, 21);
    planet(W * 0.9, H * 0.18 - drift * 0.5, H * 0.16, 'candy', 0, false, 22);
  } else {
    planet(W * 0.98, H * (L === 'sq' ? 0.95 : 0.98) + drift, k * 0.36, 'gas', 0, true, 21);
    planet(W * 0.1, H * 0.1 - drift * 0.5, k * 0.16, 'candy', 0, false, 22);
    planet(W * 0.92, H * 0.3, k * 0.07, 'ice', 0, false, 25);
  }
  vignette(0.35);
  const a1 = easeOutBack(t / 0.45);
  const heroIn = easeOutBack((t - 0.1) / 0.5);
  const bob = Math.sin(t * 3) * k * 0.012;
  if (L === 'h') {
    const hx = W * 0.27;
    const hy = H * 0.5 + bob;
    trail(hx + W * 0.2, hy + H * 0.25, hx, hy, H * 0.05);
    hero(hx, hy, H * 0.17 * heroIn, -0.3, String(s.skin ?? 'bloop'), 'happy', t);
    x.save();
    x.translate(W * 0.62, H * 0.36);
    x.scale(a1, a1);
    logo(0, 0, H * 0.22);
    x.restore();
  } else {
    const hy = (L === 'sq' ? H * 0.3 : H * 0.27) + bob;
    trail(W * 0.7, hy + k * 0.24, W * 0.5, hy, k * 0.045);
    hero(W * 0.5, hy, k * 0.15 * heroIn, -0.25, String(s.skin ?? 'bloop'), 'happy', t);
    x.save();
    x.translate(W * 0.5, L === 'sq' ? H * 0.62 : H * 0.5);
    x.scale(a1, a1);
    logo(0, 0, k * (L === 'sq' ? 0.17 : 0.2));
    x.restore();
  }
  const fade = (t0: number) => easeOut((t - t0) / 0.35);
  const lx = L === 'h' ? W * 0.62 : W * 0.5;
  const tagY = L === 'h' ? H * 0.63 : L === 'sq' ? H * 0.8 : H * 0.66;
  x.save();
  x.globalAlpha = fade(0.45);
  x.font = `600 ${k * 0.045}px Fredoka`;
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = 10;
  if (L !== 'sq') x.fillText(String(s.tagline ?? 'Um toque. Infinitas galáxias.'), lx, tagY - k * 0.06);
  x.restore();
  const pIn = easeOutBack((t - 0.7) / 0.4);
  if (pIn > 0) {
    x.save();
    x.translate(lx, L === 'sq' ? H * 0.9 : tagY + k * 0.06);
    const pulse = 1 + Math.max(0, Math.sin((t - 1.2) * 5)) * 0.03;
    x.scale(pIn * pulse, pIn * pulse);
    pill('Grátis na Google Play', 0, 0, k * (L === 'sq' ? 0.05 : 0.055), { sub: 'BAIXE AGORA' });
    x.restore();
  }
  x.save();
  x.globalAlpha = fade(1.0);
  const sy = L === 'h' ? H * 0.88 : L === 'sq' ? H * 0.06 : H * 0.88;
  studioLine(lx, sy, k * (L === 'sq' ? 0.034 : 0.045));
  x.restore();
};

/** "Um jogo da [selo] TEAM Ross" em uma linha. */
function studioLine(cx: number, cy: number, size: number): void {
  x.save();
  x.font = `600 ${size}px Fredoka`;
  const a = 'Um jogo da ';
  const b = 'TEAM Ross';
  const wa = x.measureText(a).width;
  x.font = `700 ${size * 1.1}px Fredoka`;
  const wb = x.measureText(b).width;
  const m = size * 1.5;
  const total = wa + m + size * 0.35 + wb;
  let X = cx - total / 2;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.font = `600 ${size}px Fredoka`;
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = size * 0.3;
  x.fillText(a, X, cy);
  X += wa;
  x.shadowBlur = 0;
  drawTeamRossMark(x, X + m / 2, cy, m);
  X += m + size * 0.35;
  x.font = `700 ${size * 1.1}px Fredoka`;
  x.fillStyle = '#ffffff';
  x.shadowBlur = size * 0.3;
  x.fillText(b, X, cy);
  x.restore();
}

/** Screenshot da Play Store: título grande em cima + captura do jogo num "celular". */
K.store = (s) => {
  const pal = String(s.pal ?? 'violet');
  bg(pal, Number(s.seed ?? 0));
  const seed = Number(s.seed ?? 0);
  // decoração
  const kinds: PlanetKind[] = ['gas', 'candy', 'ice', 'lava', 'crystal', 'terra', 'toxic'];
  planet(W * (seed % 2 ? 0.08 : 0.92), H * 0.93, W * 0.2, kinds[seed % kinds.length], seed, seed % 3 === 0, 30 + seed);
  planet(W * (seed % 2 ? 0.95 : 0.06), H * 0.36, W * 0.07, kinds[(seed + 2) % kinds.length], seed + 1, false, 40 + seed);
  const top = H * 0.155;
  headline(String(s.title), W / 2, top, W * 0.12, { maxW: W * 0.9 });
  if (s.sub) {
    x.save();
    x.font = `600 ${W * 0.042}px Fredoka`;
    x.textAlign = 'center';
    x.fillStyle = 'rgba(255,255,255,0.92)';
    x.shadowColor = 'rgba(0,0,0,0.6)';
    x.shadowBlur = 10;
    x.fillText(String(s.sub), W / 2, top + W * 0.215);
    x.restore();
  }
  const content = String(s.content ?? 'shot');
  if (content === 'skins') {
    const list = SKINS.filter((k) => !k.price.event).slice();
    list.sort((a, b) => ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(b.rarity) - ['common', 'rare', 'epic', 'legendary', 'mythic'].indexOf(a.rarity));
    skinGrid(W * 0.06, H * 0.33, W * 0.88, 4, list.slice(0, 20), 0.4);
  } else if (content === 'trails' && imgs.shot) {
    phone(imgs.shot, W / 2, H * 0.655, W * 0.6, 0);
  } else if (imgs.shot) {
    phone(imgs.shot, W / 2, H * 0.655, W * 0.6, Number(s.tilt ?? 0));
  }
  if (s.badge) {
    x.save();
    x.translate(W * 0.8, H * 0.31);
    x.rotate(0.12);
    pill(String(s.badge), 0, 0, W * 0.045, { bg: '#ffe14a', bg2: '#ff9f1a', fg: '#4a1a00' });
    x.restore();
  }
};

/** Feature graphic 1024x500. */
K.feature = (s) => {
  bg('violet', 2);
  planet(W * 0.86, H * 0.82, H * 0.38, 'gas', 0, true, 21);
  planet(W * 0.07, H * 0.16, H * 0.15, 'candy', 0, false, 22);
  planet(W * 0.6, H * 0.1, H * 0.08, 'terra', 0, false, 23);
  vignette(0.3);
  trail(W * 0.86, H * 0.5, W * 0.74, H * 0.3, H * 0.05);
  hero(W * 0.74, H * 0.3, H * 0.13, -0.6, 'bloop', 'happy');
  hero(W * 0.9, H * 0.18, H * 0.06, 0.3, 'phoenix', 'happy', 1.2, 0.4);
  hero(W * 0.63, H * 0.7, H * 0.065, -0.2, 'dragon', 'happy', 0.2, 0.4);
  logo(W * 0.3, H * 0.44, H * 0.25);
  x.save();
  x.font = `600 ${H * 0.07}px Fredoka`;
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = 10;
  x.fillText(String(s.tagline ?? 'Pule de planeta em planeta!'), W * 0.3, H * 0.83);
  x.restore();
};

/** Post Instagram 1080x1080 (variant 1..3). */
K.post = (s) => {
  const v = Number(s.variant ?? 1);
  if (v === 1) {
    bg('violet', 3);
    planet(W * 0.5, H * 1.02, W * 0.42, 'gas', 1, true, 51, -0.15);
    planet(W * 0.12, H * 0.12, W * 0.08, 'candy', 0, false, 52);
    vignette(0.35);
    trail(W * 0.62, H * 0.75, W * 0.5, H * 0.52, W * 0.035);
    hero(W * 0.5, H * 0.52, W * 0.11, -0.25, 'bloop', 'happy');
    logo(W * 0.5, H * 0.22, W * 0.13);
    headline('Só um *toque.*', W / 2, H * 0.75, W * 0.085);
    studioLine(W / 2, H * 0.93, W * 0.03);
  } else if (v === 2) {
    bg('core', 4);
    headline(`*${countPlus(SKINS.length)}* personagens\npara colecionar`, W / 2, H * 0.14, W * 0.075);
    const list = pickSkins(12);
    skinGrid(W * 0.13, H * 0.27, W * 0.74, 4, list, 0.3);
    logo(W * 0.5, H * 0.93, W * 0.055, true);
  } else {
    bg('ocean', 5);
    if (imgs.shot) phone(imgs.shot, W * 0.74, H * 0.52, W * 0.36, 0.06, [0, imgs.shot.height * 0.08, imgs.shot.width, imgs.shot.height * 0.84]);
    headline('Qual é o\nseu *recorde?*', W * 0.06, H * 0.3, W * 0.085, { align: 'left', maxW: W * 0.5 });
    x.save();
    x.font = `600 ${W * 0.034}px Fredoka`;
    x.fillStyle = '#ffffff';
    x.shadowColor = 'rgba(0,0,0,0.6)';
    x.shadowBlur = 8;
    x.fillText('Marque um amigo', W * 0.06, H * 0.47);
    x.fillText('e desafie!', W * 0.06, H * 0.515);
    x.restore();
    hero(W * 0.2, H * 0.76, W * 0.075, -0.2, 'cyber', 'happy');
    logo(W * 0.24, H * 0.93, W * 0.045, true);
  }
};

/** Story 1080x1920 (variant 1..2). */
K.story = (s) => {
  const v = Number(s.variant ?? 1);
  if (v === 1) {
    bg('violet', 6);
    logo(W / 2, H * 0.12, W * 0.13);
    if (imgs.shot) phone(imgs.shot, W / 2, H * 0.475, W * 0.5, -0.03);
    headline('Pule de planeta\nem *planeta!*', W / 2, H * 0.81, W * 0.085);
    pill('Grátis na Google Play', W / 2, H * 0.92, W * 0.045, { sub: 'BAIXE AGORA' });
  } else {
    bg('sunset', 7);
    headline('Escolha o\nseu *Bloop!*', W / 2, H * 0.11, W * 0.11);
    const list = pickSkins(12);
    skinGrid(W * 0.11, H * 0.215, W * 0.78, 3, list, 0.8, true);
    pill(`${countPlus(SKINS.length)} personagens  +  ${TRAILS.length} rastros`, W / 2, H * 0.875, W * 0.04, { bg: '#ffe14a', bg2: '#ff9f1a', fg: '#4a1a00' });
    logo(W / 2, H * 0.95, W * 0.055, true);
  }
};

/** Thumbnail do YouTube 1280x720. */
K.thumb = () => {
  bg('violet', 8);
  if (imgs.shot) {
    x.save();
    x.globalAlpha = 0.9;
    phone(imgs.shot, W * 0.82, H * 0.55, W * 0.24, 0.08, [0, imgs.shot.height * 0.1, imgs.shot.width, imgs.shot.height * 0.8]);
    x.restore();
  }
  planet(W * 0.55, H * 1.08, H * 0.4, 'gas', 0, true, 61, -0.1);
  trail(W * 0.66, H * 0.86, W * 0.56, H * 0.56, H * 0.05);
  hero(W * 0.56, H * 0.54, H * 0.18, -0.25, 'phoenix', 'happy');
  headline('SÓ UM\n*TOQUE!*', W * 0.035, H * 0.5, H * 0.21, { align: 'left', maxW: W * 0.4 });
  logo(W * 0.62, H * 0.13, H * 0.1, true);
  sparkle(W * 0.56, H * 0.36, H * 0.04);
  sparkle(W * 0.2, H * 0.72, H * 0.03, '#fff36b');
};

/** Header Twitter/X 1500x500 (zona segura: centro; o avatar cobre o canto inferior esquerdo). */
K.header = () => {
  bg('violet', 9);
  planet(W * 0.05, H * 0.2, H * 0.22, 'candy', 0, false, 71);
  planet(W * 0.96, H * 0.95, H * 0.5, 'gas', 0, true, 72);
  vignette(0.3);
  logo(W * 0.5, H * 0.42, H * 0.22, true);
  x.save();
  x.font = `600 ${H * 0.075}px Fredoka`;
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.shadowColor = 'rgba(0,0,0,0.6)';
  x.shadowBlur = 10;
  x.fillText('Um toque. Infinitas galáxias.  Grátis na Google Play', W * 0.5, H * 0.66);
  x.restore();
  const list = pickSkins(6);
  list.forEach((sk, i) => hero(W * (0.27 + i * 0.092), H * 0.86, H * 0.065, (i - 2.5) * 0.08, sk, 'happy', i * 0.3, 0.35));
  studioLine(W * 0.84, H * 0.1, H * 0.045);
};

/** Card de desafio com código promocional (parametrizável). */
K.challenge = (s) => {
  bg('core', 10);
  planet(W * 0.9, H * 0.08, W * 0.12, 'candy', 0, false, 81);
  planet(W * 0.0, H * 1.03, W * 0.25, 'gas', 2, true, 82);
  vignette(0.35);
  logo(W / 2, H * 0.08, W * 0.06, true);
  headline('*DESAFIO*', W / 2, H * 0.17, W * 0.17, { hl: '#ffcf4f' });
  const goal = String(s.goal ?? 'Faça mais de 100 pontos');
  headline(goal, W / 2, H * 0.27, W * 0.07, { maxW: W * 0.86 });
  hero(W / 2, H * 0.42, W * 0.12, -0.15, String(s.skin ?? 'campeao'), 'happy');
  // caixa do código
  const bw = W * 0.82;
  const bh = H * 0.2;
  const by = H * 0.53;
  x.save();
  rrect(W / 2 - bw / 2, by, bw, bh, W * 0.05);
  x.fillStyle = 'rgba(10,2,30,0.72)';
  x.fill();
  x.setLineDash([W * 0.03, W * 0.018]);
  x.lineWidth = W * 0.008;
  x.strokeStyle = '#ffe14a';
  x.stroke();
  x.setLineDash([]);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `600 ${W * 0.04}px Fredoka`;
  x.fillStyle = 'rgba(255,255,255,0.85)';
  x.fillText('USE O CÓDIGO', W / 2, by + bh * 0.2);
  x.restore();
  headline(String(s.code ?? 'SEUCODIGO'), W / 2, by + bh * 0.55, W * 0.13, { maxW: bw * 0.88, fill: '#fff6b0' });
  x.save();
  x.textAlign = 'center';
  x.font = `600 ${W * 0.036}px Fredoka`;
  x.fillStyle = '#9ff4ff';
  x.fillText(String(s.where ?? 'Resgate dentro do jogo'), W / 2, by + bh * 0.88);
  x.restore();
  headline(`Prêmio: *${String(s.reward ?? '500 moedas')}*`, W / 2, H * 0.8, W * 0.06, { maxW: W * 0.88 });
  if (s.until) {
    x.save();
    x.textAlign = 'center';
    x.font = `600 ${W * 0.036}px Fredoka`;
    x.fillStyle = '#ffffff';
    x.shadowColor = 'rgba(0,0,0,0.7)';
    x.shadowBlur = 10;
    x.fillText(`Válido até ${String(s.until)}`, W / 2, H * 0.855);
    x.restore();
  }
  pill('Grátis na Google Play', W / 2, H * 0.92, W * 0.04, { sub: 'BAIXE O BLOOP ORBIT' });
};

/** Selo do estúdio 1024x1024. */
K.teamross = (s) => {
  if (s.transparent) x.clearRect(0, 0, W, H);
  else {
    const g = x.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H / 2, W * 0.75);
    g.addColorStop(0, '#2a0f55');
    g.addColorStop(1, '#0b0620');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  }
  drawTeamRossLockup(x, W / 2, H * 0.42, W * 0.46);
};

/** Moldura transparente do vídeo horizontal (painéis laterais). */
K.hframe = (s) => {
  const cw = Number(s.cw ?? 608);
  const cx0 = (W - cw) / 2;
  // escurece as laterais
  const gl = x.createLinearGradient(0, 0, cx0, 0);
  gl.addColorStop(0, 'rgba(8,2,26,0.78)');
  gl.addColorStop(1, 'rgba(8,2,26,0.35)');
  x.fillStyle = gl;
  x.fillRect(0, 0, cx0, H);
  const gr = x.createLinearGradient(W - cx0, 0, W, 0);
  gr.addColorStop(0, 'rgba(8,2,26,0.35)');
  gr.addColorStop(1, 'rgba(8,2,26,0.78)');
  x.fillStyle = gr;
  x.fillRect(W - cx0, 0, cx0, H);
  // borda luminosa em volta do vídeo central
  x.save();
  x.shadowColor = '#ff5cc8';
  x.shadowBlur = 30;
  x.strokeStyle = 'rgba(255,255,255,0.85)';
  x.lineWidth = 6;
  x.strokeRect(cx0 - 3, -10, cw + 6, H + 20);
  x.restore();
  // esquerda: logo + estúdio
  logo(cx0 / 2, H * 0.4, cx0 * 0.2);
  x.save();
  x.font = `600 ${cx0 * 0.06}px Fredoka`;
  x.textAlign = 'center';
  x.fillStyle = '#ffffff';
  x.fillText('Um toque. Infinitas galáxias.', cx0 / 2, H * 0.6);
  x.restore();
  studioLine(cx0 / 2, H * 0.86, cx0 * 0.05);
  // direita: destaques
  const items = (s.items as string[]) ?? [];
  const rx = W - cx0 / 2;
  const n = items.length;
  items.forEach((it, i) => {
    const y = H * 0.5 + (i - (n - 1) / 2) * H * 0.13;
    sparkle(W - cx0 + cx0 * 0.12, y, cx0 * 0.03, i % 2 ? '#7dfcff' : '#ffe14a');
    headline(it, rx + cx0 * 0.04, y, cx0 * 0.075, { maxW: cx0 * 0.72 });
  });
  pill('Grátis na Google Play', rx, H * 0.88, cx0 * 0.05);
};

/** Selo pequeno para o loop quadrado. */
K.loopbadge = () => {
  const g = x.createLinearGradient(0, H * 0.8, 0, H);
  g.addColorStop(0, 'rgba(8,2,26,0)');
  g.addColorStop(1, 'rgba(8,2,26,0.7)');
  x.fillStyle = g;
  x.fillRect(0, H * 0.8, W, H * 0.2);
  logo(W / 2, H * 0.93, W * 0.06, true);
  headline('Só um *toque.*', W / 2, H * 0.1, W * 0.075);
};

/* ============================== API ============================== */

async function loadImg(src: string): Promise<HTMLImageElement> {
  const im = new Image();
  im.src = src;
  await im.decode();
  return im;
}

async function render(spec: Spec): Promise<string> {
  await document.fonts.load('700 40px Fredoka');
  await document.fonts.load('600 40px Fredoka');
  W = spec.w;
  H = spec.h;
  if (c.width !== W || c.height !== H) {
    c.width = W;
    c.height = H;
    x = c.getContext('2d')!;
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, W, H);
  for (const k of Object.keys(imgs)) delete imgs[k];
  for (const [k, v] of Object.entries(spec.shots ?? {})) imgs[k] = await loadImg(v);
  const fn = K[spec.kind];
  if (!fn) throw new Error('kind desconhecido: ' + spec.kind);
  await fn(spec);
  return spec.format === 'jpeg' ? c.toDataURL('image/jpeg', 0.92) : c.toDataURL('image/png');
}

(window as unknown as { __promo: unknown }).__promo = {
  render,
  info: () => ({ skins: SKINS.length, trails: TRAILS.length }),
};
document.title = 'ready';
