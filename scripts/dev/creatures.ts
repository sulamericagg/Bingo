// Galeria de desenvolvimento: ?sheet=0..4 (60 por folha), ?legend (lendários grandes),
// ?anim=s00-legendary (animado), ?icons=0..4 (ícones com fundo/silhueta), ?collection (tela Coleção)
import { CREATURES } from '../../src/creatures/catalog';
import { drawCreature, renderCreatureIcon } from '../../src/creatures/render';
import { SEASONS } from '../../src/creatures/seasons';

const q = new URLSearchParams(location.search);
const app = document.getElementById('app')!;

function cell(id: string, size: number, t = 0.0, still = true): HTMLElement {
  const cr = CREATURES.find((c) => c.id === id)!;
  const d = document.createElement('div');
  d.className = 'card';
  const cv = document.createElement('canvas');
  cv.width = cv.height = size * 2;
  cv.style.width = cv.style.height = size + 'px';
  const c = cv.getContext('2d')!;
  c.scale(2, 2);
  c.translate(size / 2, size / 2);
  drawCreature(c, id, size * 0.78, t, { still });
  d.append(cv);
  d.insertAdjacentHTML('beforeend', `<b>${cr.name}</b><small>${cr.id} · ${cr.design.arch}</small>`);
  return d;
}

async function main() {
  await document.fonts?.ready;
  if (q.has('sheet')) {
    const s0 = Number(q.get('sheet')) * 12;
    for (let s = s0; s < s0 + 12; s++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<div class="season">${String(s).padStart(2, '0')} ${SEASONS[s].theme}</div>`;
      for (const r of ['common', 'medio', 'rare', 'epic', 'legendary']) row.append(cell(`s${String(s).padStart(2, '0')}-${r}`, 130));
      app.append(row);
    }
  } else if (q.has('legend')) {
    const g = document.createElement('div');
    g.className = 'big';
    const part = Number(q.get('legend') || 0);
    for (let s = part * 30; s < part * 30 + 30; s++) g.append(cell(`s${String(s).padStart(2, '0')}-legendary`, 200, 1.3, false));
    app.append(g);
  } else if (q.has('icons')) {
    const s0 = Number(q.get('icons')) * 12;
    const g = document.createElement('div');
    g.style.cssText = 'display:grid;grid-template-columns:repeat(10,72px);gap:6px';
    for (const cr of CREATURES.slice(s0 * 5, s0 * 5 + 60)) g.append(renderCreatureIcon(cr.id, 72, { locked: cr.rarity === 'medio' }));
    app.append(g);
  } else if (q.has('anim')) {
    const id = q.get('anim')!;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 600;
    app.append(cv);
    const c = cv.getContext('2d')!;
    const loop = (ms: number) => {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, 600, 600);
      c.translate(300, 300);
      drawCreature(c, id, 360, ms / 1000);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else if (q.has('collection')) {
    const { registerCreatures } = await import('../../src/creatures/register');
    registerCreatures();
    const { openCollection } = await import('../../src/creatures/collection');
    openCollection();
  }
  document.title = 'ready';
}
main();
