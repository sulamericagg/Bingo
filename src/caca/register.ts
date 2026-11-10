/* ============================================================
 *  CAÇA BLOOP — registro no hub. Leve: o jogo (mapa, genoma, batalhas) é importado sob demanda.
 *  Vitrine: três bichinhos procedurais pulando num mapinha com o círculo de alcance.
 * ============================================================ */
import { t } from '../i18n';
import { registerGame } from '../hub/registry';

type DrawMod = typeof import('./draw') & { genome: typeof import('./genome').genome; seedFrom: typeof import('./rng').seedFrom };
let mod: DrawMod | null = null;
let loading = false;
function ensureMod(): void {
  if (mod || loading) return;
  loading = true;
  void Promise.all([import('./draw'), import('./genome'), import('./rng')]).then(([d, g, r]) => {
    mod = { ...d, genome: g.genome, seedFrom: r.seedFrom };
  });
}

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3a2a9a');
  g.addColorStop(1, '#43c08a');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // grade de ruas
  x.strokeStyle = 'rgba(255,255,255,0.22)';
  x.lineWidth = Math.max(3, w * 0.012);
  const s = Math.min(w, h) * 0.28;
  const off = (time * 12) % s;
  x.beginPath();
  for (let gx = -s + off; gx < w + s; gx += s) (x.moveTo(gx, 0), x.lineTo(gx, h));
  for (let gy = -s + off * 0.5; gy < h + s; gy += s) (x.moveTo(0, gy), x.lineTo(w, gy));
  x.stroke();
  const cx = w / 2;
  const cy = h * 0.62;
  x.setLineDash([10, 8]);
  x.lineDashOffset = -time * 14;
  x.strokeStyle = 'rgba(255,255,255,0.8)';
  x.lineWidth = 3;
  x.beginPath();
  x.ellipse(cx, cy, Math.min(w, h) * 0.42, Math.min(w, h) * 0.2, 0, 0, Math.PI * 2);
  x.stroke();
  x.setLineDash([]);
  ensureMod();
  if (!mod) return;
  const sz = Math.min(w, h) * 0.34;
  const k = Math.floor(time / 4);
  for (let i = 0; i < 3; i++) {
    const gg = mod.genome(mod.seedFrom('vitrine', k, i));
    x.save();
    x.translate(cx + (i - 1) * sz * 0.95, cy - sz * 0.15 + (i === 1 ? -sz * 0.12 : 0));
    mod.drawGenome(x, gg, sz * (i === 1 ? 1.15 : 0.9) * Math.min(1.1, mod.fitScale(gg, 44)), time + i);
    x.restore();
  }
}

let done = false;
export function registerCaca(): void {
  if (done) return;
  done = true;
  registerGame({
    id: 'caca',
    get name() {
      return t('caca.name', 'Caça Bloop');
    },
    get tagline() {
      return t('caca.tagline', 'Ande por aí e encontre bichinhos únicos!');
    },
    icon: 'target',
    theme: { bg: ['#3a2a9a', '#43c08a'], accent: '#43c08a', accent2: '#ffd23a', title: ['#f2fff6', '#b8ffd6'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
