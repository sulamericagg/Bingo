/** Folha de contato: N genomas aleatórios (ou de sementes fixas) numa grade — prova de variedade. */
import { genome, RARITY_IDS } from './genome';
import { genomeIcon } from './draw';
import { seedFrom } from './rng';

export function contactSheet(n = 100, salt = 'sheet', cols = 10, cell = 120): HTMLCanvasElement {
  const rows = Math.ceil(n / cols);
  const cv = document.createElement('canvas');
  const lab = 26;
  cv.width = cols * cell;
  cv.height = rows * (cell + lab);
  const c = cv.getContext('2d')!;
  c.fillStyle = '#1a0b3d';
  c.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < n; i++) {
    const g = genome(seedFrom(salt, i));
    const ic = genomeIcon(g, cell - 8);
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * (cell + lab);
    c.drawImage(ic, x + 4, y + 4, cell - 8, cell - 8);
    c.fillStyle = '#fff';
    c.font = '600 12px Fredoka, sans-serif';
    c.textAlign = 'center';
    c.fillText(g.name, x + cell / 2, y + cell + 6);
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.font = '500 9px Fredoka, sans-serif';
    c.fillText(`${RARITY_IDS[g.rarity]} · ${g.element} · ${g.shape} · ${g.material}`, x + cell / 2, y + cell + 18);
  }
  return cv;
}
