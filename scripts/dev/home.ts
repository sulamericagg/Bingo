/**
 * Página de desenvolvimento da Casa, Planeta & Amigos.
 *   npx vite --port 4371  →  http://localhost:4371/scripts/dev/home.html?mock
 * Parâmetros: ?mock (força API local) &coins=5000 &reset (limpa dados locais) &variety (6 casas aleatórias lado a lado)
 * No console: __home (debug da tela), __combos (contagem do catálogo).
 */
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { save, persistNow } from '../../src/core/storage';
import { registerHome, openHome } from '../../src/home/register';
import { countCombinations, randomDesign, sciBig, PLANET_FIELDS, EXTERIOR_FIELDS, FURNITURE, FLOORS, WALLS, ROOM_IDS } from '../../src/home/catalog';
import { planetSceneCanvas } from '../../src/home/render-planet';

const q = new URLSearchParams(location.search);
if (q.has('reset')) {
  for (const k of ['bw-home-mock-v1', 'bw-home-cache-v1', 'bw-home-own-v1', 'bw-home-thumb']) localStorage.removeItem(k);
  sessionStorage.clear();
}
if (q.has('coins')) save.coins = Number(q.get('coins'));
persistNow();

const c = countCombinations();
console.info('[casa] catálogo:', { planetFields: PLANET_FIELDS.length, exteriorFields: EXTERIOR_FIELDS.length, furniture: FURNITURE.length, floors: FLOORS.length, walls: WALLS.length, rooms: ROOM_IDS.length });
console.info('[casa] combinações:\n  ' + c.lines.join('\n  '));
console.info(`[casa] planeta=${c.planet} exterior=${c.exterior} interior=${c.interior}\n[casa] TOTAL=${c.total} (${sciBig(c.total)})`);
(window as unknown as Record<string, unknown>).__combos = { planet: String(c.planet), exterior: String(c.exterior), interior: String(c.interior), total: String(c.total), sci: sciBig(c.total), lines: c.lines };

if (q.has('variety')) {
  document.body.style.cssText = 'margin:0;display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#12082e;padding:4px;font-family:Fredoka,sans-serif;color:#fff';
  const seeds = [11, 202, 3333, 40404, 555, 66];
  const w = Math.floor((innerWidth - 12) / 2);
  const h = Math.floor((innerHeight - 40) / 3);
  for (const s of seeds) {
    const d = randomDesign(s);
    const cv = planetSceneCanvas(d, w * 2, h * 2, { R: Math.min(w, h) * 0.62, cy: h * 1.18, name: 'casa' + s });
    cv.style.cssText = `width:${w}px;height:${h}px;border-radius:10px`;
    document.body.appendChild(cv);
  }
  const p = document.createElement('div');
  p.style.cssText = 'grid-column:1/3;text-align:center;font-size:13px';
  p.textContent = `${sciBig(c.total)} combinações`;
  document.body.appendChild(p);
  document.title = 'ready';
} else {
  registerHome();
  void openHome({}).then(async () => {
    (window as unknown as { __home: unknown }).__home = (await import('../../src/home/screen')).__homeDebug;
    document.title = 'ready';
  });
}
