/**
 * Bancada do Caça Bloop (dev): /scripts/dev/caca.html
 *   ?sheet&n=100&salt=x&cols=10&cell=120   folha de contato de genomas aleatórios
 *   ?evo&n=8                                 linhas com as 3 evoluções de cada genoma
 *   ?rar=4&n=40                              só genomas da raridade escolhida (procura sementes)
 *   ?mg=aneis|ritmo|runa|esquiva|memoria&diff=0.5&t=1.4   minigame congelado em t segundos
 *   ?map&lat=-23.56&lon=-46.65               mapa procedural (3×3 tiles) com as aparições
 */
import { contactSheet } from '../../src/caca/sheet';
import { genome, rarityOf, type Rarity } from '../../src/caca/genome';
import { genomeIcon } from '../../src/caca/draw';
import { seedFrom } from '../../src/caca/rng';
import { makeMinigame, type GameKind } from '../../src/caca/minigames';
import { ProceduralTileProvider, THEMES, WZ } from '../../src/caca/world';
import { project } from '../../src/caca/geo';
import { spawnsAround } from '../../src/caca/spawns';
import { drawGenome } from '../../src/caca/draw';

const q = new URLSearchParams(location.search);
const n = +(q.get('n') || 100);
await document.fonts.load('700 20px Fredoka').catch(() => {});

if (q.has('evo')) {
  const cv = document.createElement('canvas');
  const cell = 140;
  cv.width = cell * 3 * 2 + 20;
  cv.height = Math.ceil(n / 2) * (cell + 20);
  const c = cv.getContext('2d')!;
  for (let i = 0; i < n; i++) {
    for (let e = 0; e < 3; e++) {
      const g = genome(seedFrom('evo', i), e);
      const x = (i % 2) * (cell * 3 + 20) + e * cell;
      const y = Math.floor(i / 2) * (cell + 20);
      c.drawImage(genomeIcon(g, cell - 6), x + 3, y + 3, cell - 6, cell - 6);
      c.fillStyle = '#fff';
      c.font = '600 12px Fredoka';
      c.textAlign = 'center';
      c.fillText(g.name, x + cell / 2, y + cell + 10);
    }
  }
  document.body.appendChild(cv);
} else if (q.has('rar')) {
  const want = +(q.get('rar') || 4) as Rarity;
  const cv = document.createElement('canvas');
  const cols = 8;
  const cell = 130;
  cv.width = cols * cell;
  cv.height = Math.ceil(n / cols) * (cell + 18);
  const c = cv.getContext('2d')!;
  let found = 0;
  for (let i = 0; found < n && i < 2e7; i++) {
    const sd = seedFrom('rar', want, i);
    if (rarityOf(sd) !== want) continue;
    const g = genome(sd);
    const x = (found % cols) * cell;
    const y = Math.floor(found / cols) * (cell + 18);
    c.drawImage(genomeIcon(g, cell - 6), x + 3, y + 3, cell - 6, cell - 6);
    c.fillStyle = '#fff';
    c.font = '600 12px Fredoka';
    c.textAlign = 'center';
    c.fillText(g.rarity === 5 ? g.name + ' ★' : g.name, x + cell / 2, y + cell + 8);
    found++;
  }
  document.body.appendChild(cv);
} else if (q.get('mg')) {
  const W = 412;
  const H = 640;
  const cv = document.createElement('canvas');
  cv.width = W * 2;
  cv.height = H * 2;
  cv.style.width = W + 'px';
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  const mg = makeMinigame(q.get('mg') as GameKind, { w: W, h: H, diff: +(q.get('diff') || 0.5), hint: q.has('hint'), seed: seedFrom('mg', q.get('mg')!), el: (q.get('el') as never) || 'fogo', auto: q.has('auto'), fx: () => {} });
  const T = +(q.get('t') || 1.4);
  if (q.get('mg') === 'runa' && !q.has('auto')) mg.down(60, 60);
  for (let t = 0; t < T; t += 1 / 60) mg.update(1 / 60);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#5a3fd0');
  g.addColorStop(1, '#2a1366');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  mg.draw(c);
  document.body.appendChild(cv);
} else if (q.has('map')) {
  const lat = +(q.get('lat') || -23.5614);
  const lon = +(q.get('lon') || -46.6559);
  const th = THEMES[(q.get('theme') as 'dia') || 'dia'];
  const [wx, wy] = project(lat, lon, WZ);
  const tx = Math.floor(wx / 256);
  const ty = Math.floor(wy / 256);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 768;
  const c = cv.getContext('2d')!;
  const tp = new ProceduralTileProvider();
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) c.drawImage(tp.getTile(tx + i, ty + j, 256, th), (i + 1) * 256, (j + 1) * 256);
  const ox = (tx - 1) * 256;
  const oy = (ty - 1) * 256;
  for (const s of spawnsAround(lat, lon, Date.now())) {
    const [x, y] = project(s.lat, s.lon, WZ);
    c.save();
    c.translate(x - ox, y - oy);
    drawGenome(c, s.g, 40, 0, { still: true });
    c.restore();
  }
  document.body.appendChild(cv);
} else {
  document.body.appendChild(contactSheet(n, q.get('salt') || 'sheet', +(q.get('cols') || 10), +(q.get('cell') || 120)));
}
document.title = 'ready';
