/** Galeria de cosméticos (dev): npx vite --port 4302 → /scripts/gallery/gallery.html
 *  Parâmetros: ?only=id1,id2  ?big=96 (raio grande)  ?t=1.2 (congela o tempo)  ?sec=skins,small,shop,trails */
import { drawPlayer, type PlayerPose } from '../../src/game/sprites';
import { RARITY_INFO, SKINS, TRAILS, type Skin } from '../../src/game/skins';
import { renderSkinPreview, renderTrailPreview } from '../../src/game/preview';
import { Particles } from '../../src/game/particles';
import { emitTrail } from '../../src/game/trails';

const q = new URLSearchParams(location.search);
const only = q.get('only')?.split(',');
const BIG = Number(q.get('big') ?? 46);
const freeze = q.has('t') ? Number(q.get('t')) : null;
const secs = (q.get('sec') ?? 'skins,small,shop,trails').split(',');
const DPR = 2;
const app = document.getElementById('app')!;
const skins = only ? SKINS.filter((s) => only.includes(s.id)) : SKINS;
const trails = only ? TRAILS.filter((s) => only.includes(s.id)) : TRAILS;

const priceText = (p: Skin['price']) =>
  p.event ? `evento:${p.event}` : p.iap ? `iap:${p.iap}` : p.gems ? `${p.gems} gemas` : p.coins ? `${p.coins} moedas` : p.ads ? `${p.ads} vídeos` : 'grátis';

function section(title: string, w?: number): HTMLDivElement {
  const h = document.createElement('h2');
  h.textContent = title;
  app.appendChild(h);
  const g = document.createElement('div');
  g.className = 'grid';
  if (w) g.style.setProperty('--w', `${w}px`);
  app.appendChild(g);
  return g;
}
function canvas(w: number, h: number, cls = ''): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w * DPR;
  c.height = h * DPR;
  c.style.width = `${w}px`;
  c.style.height = `${h}px`;
  if (cls) c.className = cls;
  return [c, c.getContext('2d')!];
}
function card(g: HTMLElement, c: HTMLElement, name: string, sub: string, rarity: string): void {
  const d = document.createElement('div');
  d.className = 'card';
  d.appendChild(c);
  const n = document.createElement('div');
  n.innerHTML = `<b>${name}</b><small class="r-${rarity}">${RARITY_INFO[rarity as 'common'].label} · ${sub}</small>`;
  d.appendChild(n);
  g.appendChild(d);
}

type Draw = (t: number) => void;
const loops: Draw[] = [];
const pose = (t: number, mood: PlayerPose['mood']): PlayerPose => ({ t, blink: t % 3 > 2.85 ? 1 : 0, lookX: Math.sin(t * 0.8) * 0.5, lookY: 0.2, sx: 1, sy: 1, mood, lx: -0.55, ly: -0.83 });

if (secs.includes('skins')) {
  const g = section(`Skins (${SKINS.length}) — grande`, BIG * 3.7 + 12);
  for (const s of skins) {
    const W = BIG * 3.7;
    const [c, x] = canvas(W, W, 'space');
    card(g, c, s.name, `${s.id} · ${priceText(s.price)}`, s.rarity);
    loops.push((t) => {
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      x.clearRect(0, 0, W, W);
      x.translate(W / 2, W * 0.58);
      drawPlayer(x, s, BIG, pose(t, 'idle'));
    });
  }
}

if (secs.includes('small')) {
  const g = section('Tamanho do jogo (R=15) — idle / voo / feliz / morto', 150);
  for (const s of skins) {
    const [c, x] = canvas(140, 60, 'space');
    card(g, c, s.name, s.id, s.rarity);
    loops.push((t) => {
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      x.clearRect(0, 0, 140, 60);
      (['idle', 'fly', 'happy', 'dead'] as const).forEach((m, i) => {
        x.save();
        x.translate(18 + i * 35, 34);
        drawPlayer(x, s, 15, pose(t, m));
        x.restore();
      });
    });
  }
}

if (secs.includes('shop')) {
  const g = section('Prévias da loja (renderSkinPreview 92px)', 104);
  for (const s of skins) card(g, renderSkinPreview(s, 92, freeze ?? 0.4), s.name, priceText(s.price), s.rarity);
  const g2 = section(`Prévias de rastro (renderTrailPreview 92px) — ${TRAILS.length}`, 104);
  for (const tr of trails) card(g2, renderTrailPreview(tr, 92), tr.name, `${tr.id} · ${priceText(tr.price)}`, tr.rarity);
}

if (secs.includes('trails')) {
  const g = section('Rastros ao vivo', 232);
  for (const tr of trails) {
    const W = 220;
    const H = 150;
    const [c, x] = canvas(W, H, 'space');
    card(g, c, tr.name, `${tr.id} · ${priceText(tr.price)}`, tr.rarity);
    const fx = new Particles(500);
    let last = 0;
    let px = 0;
    let py = 0;
    let vx = 0;
    let vy = 0;
    const path = (t: number): [number, number] => [W / 2 + Math.sin(t * 1.3) * 80, H / 2 + Math.sin(t * 2.6) * 40];
    loops.push((t) => {
      const dt = Math.min(0.05, Math.max(0.001, t - last));
      last = t;
      const [nx, ny] = path(t);
      vx = (nx - px) / dt;
      vy = (ny - py) / dt;
      px = nx;
      py = ny;
      if (Math.hypot(vx, vy) < 5000) emitTrail(fx, tr, px, py, vx, vy, t, 15);
      fx.update(dt);
      x.setTransform(DPR, 0, 0, DPR, 0, 0);
      x.clearRect(0, 0, W, H);
      fx.draw(x);
      x.translate(px, py);
      x.rotate(Math.atan2(vy, vx) + Math.PI / 2);
      drawPlayer(x, SKINS[0], 15, { ...pose(t, 'fly'), lookX: 0, lookY: -1 });
    });
  }
}

const t0 = performance.now();
let frames = 0;
function frame(): void {
  const t = freeze ?? (performance.now() - t0) / 1000;
  for (const f of loops) f(t);
  if (++frames === 40) document.title = 'ready';
  requestAnimationFrame(frame);
}
frame();
