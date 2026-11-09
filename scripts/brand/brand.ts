/** Gera ícone/splash/arte da loja usando os mesmos sprites do jogo. Uso: scripts/render-assets.mjs */
import '@fontsource/fredoka/700.css';
import { buildPlanetSprite, buildStarTile, drawPlayer, glow, PLANET_PALETTES } from '../../src/game/sprites';
import { skinById } from '../../src/game/skins';

const q = new URLSearchParams(location.search);
const kind = q.get('kind') ?? 'icon';
const W = Number(q.get('w') ?? 1024);
const H = Number(q.get('h') ?? 1024);
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = W;
c.height = H;
const x = c.getContext('2d')!;

function bg(): void {
  const g = x.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, '#1a0840');
  g.addColorStop(0.6, '#3a1170');
  g.addColorStop(1, '#5c1a8a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const neb = x.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, Math.max(W, H) * 0.6);
  neb.addColorStop(0, 'rgba(255,79,216,0.35)');
  neb.addColorStop(1, 'rgba(255,79,216,0)');
  x.fillStyle = neb;
  x.fillRect(0, 0, W, H);
  const neb2 = x.createRadialGradient(W * 0.2, H * 0.85, 0, W * 0.2, H * 0.85, Math.max(W, H) * 0.5);
  neb2.addColorStop(0, 'rgba(60,140,255,0.35)');
  neb2.addColorStop(1, 'rgba(60,140,255,0)');
  x.fillStyle = neb2;
  x.fillRect(0, 0, W, H);
  const tile = buildStarTile(512, 120, 2.6, 7);
  for (let ty = 0; ty < H; ty += 512) for (let tx = 0; tx < W; tx += 512) x.drawImage(tile, tx, ty);
}

function planet(cx: number, cy: number, r: number, kindP: keyof typeof PLANET_PALETTES, pal: number, ringed: boolean, seed: number): void {
  const sp = buildPlanetSprite(kindP, PLANET_PALETTES[kindP][pal], r, seed, ringed);
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.drawImage(sp.atmo, cx - sp.atmo.width / 2, cy - sp.atmo.height / 2);
  x.restore();
  if (sp.ringBack) {
    x.save();
    x.translate(cx, cy);
    x.rotate(-0.35);
    x.drawImage(sp.ringBack, -sp.ringBack.width / 2, -sp.ringBack.height / 2);
    x.restore();
  }
  x.drawImage(sp.surface, cx - r, cy - r);
  x.drawImage(sp.light, cx - r, cy - r);
  if (sp.ringFront) {
    x.save();
    x.translate(cx, cy);
    x.rotate(-0.35);
    x.drawImage(sp.ringFront, -sp.ringFront.width / 2, -sp.ringFront.height / 2);
    x.restore();
  }
}

function hero(cx: number, cy: number, R: number, rot = -0.2, skin = 'bloop', mood: 'idle' | 'happy' | 'fly' = 'happy'): void {
  const s = skinById(skin);
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = 0.7;
  x.drawImage(glow(s.light, 128), cx - R * 2.8, cy - R * 2.8, R * 5.6, R * 5.6);
  x.restore();
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  drawPlayer(x, s, R, { t: 0.6, blink: 0, lookX: 0.3, lookY: -0.2, sx: 1, sy: 1, mood, lx: -0.6, ly: -0.8 });
  x.restore();
}

function trail(fromX: number, fromY: number, toX: number, toY: number, size: number): void {
  x.save();
  x.globalCompositeOperation = 'lighter';
  const cols = ['#ffffff', '#ffe27a', '#ff9de6'];
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    const px = fromX + (toX - fromX) * t + Math.sin(t * 9) * size * 0.3;
    const py = fromY + (toY - fromY) * t;
    const r = size * (0.2 + t * 0.8);
    x.globalAlpha = 0.2 + t * 0.6;
    x.drawImage(glow(cols[i % 3], 64), px - r, py - r, r * 2, r * 2);
  }
  x.restore();
}

function logo(cx: number, cy: number, size: number): void {
  x.save();
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `700 ${size}px Fredoka`;
  const lines: [string, string, string, string][] = [
    ['BLOOP', '#ffc2f0', '#ff5cc8', '#5a1a8f'],
    ['ORBIT', '#b6f7ff', '#5ef0ff', '#1a3d8f'],
  ];
  lines.forEach(([t, c1, c2, sh], i) => {
    const y = cy + (i - 0.5) * size * 0.9;
    x.fillStyle = sh;
    x.fillText(t, cx, y + size * 0.07);
    const g = x.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0.1, '#ffffff');
    g.addColorStop(0.55, c1);
    g.addColorStop(1, c2);
    x.shadowColor = c2;
    x.shadowBlur = size * 0.25;
    x.fillStyle = g;
    x.fillText(t, cx, y);
    x.shadowBlur = 0;
  });
  x.restore();
}

async function main(): Promise<void> {
  await document.fonts.load('700 40px Fredoka');
  const k = Math.min(W, H);
  if (kind === 'icon' || kind === 'icon-bg') bg();
  if (kind === 'icon' || kind === 'icon-fg') {
    const f = kind === 'icon-fg' ? 0.62 : 1; // zona segura do ícone adaptativo
    const ox = W / 2;
    const oy = H / 2;
    planet(ox + k * 0.04 * f, oy + k * 0.2 * f, k * 0.27 * f, 'rocky', 0, kind === 'icon', 11);
    trail(ox + k * 0.05 * f, oy + k * 0.05 * f, ox - k * 0.08 * f, oy - k * 0.2 * f, k * 0.05 * f);
    hero(ox - k * 0.08 * f, oy - k * 0.2 * f, k * 0.17 * f, -0.35, 'bloop', 'happy');
  }
  if (kind === 'splash') {
    bg();
    hero(W / 2, H / 2 - k * 0.1, k * 0.09, -0.2);
    logo(W / 2, H / 2 + k * 0.12, k * 0.1);
  }
  if (kind === 'feature') {
    bg();
    planet(W * 0.83, H * 0.78, H * 0.38, 'gas', 0, true, 21);
    planet(W * 0.1, H * 0.2, H * 0.17, 'candy', 0, false, 22);
    planet(W * 0.62, H * 0.12, H * 0.1, 'terra', 0, false, 23);
    trail(W * 0.8, H * 0.45, W * 0.68, H * 0.28, H * 0.05);
    hero(W * 0.68, H * 0.28, H * 0.12, -0.6, 'bloop', 'happy');
    logo(W * 0.32, H * 0.52, H * 0.26);
  }
  document.title = 'ready';
}
main();
