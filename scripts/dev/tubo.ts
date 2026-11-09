// Página de desenvolvimento: vitrine do hub + abre o jogo direto (?play abre na hora).
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { listGames } from '../../src/hub/registry';
import { registerTubo } from '../../src/games/tubo/register';
import { t } from '../../src/i18n';

registerTubo();
const g = listGames().find((x) => x.id === 'tubo')!;
const $ = (id: string) => document.getElementById(id)!;
const card = $('card');
card.style.background = `linear-gradient(${g.theme.bg[0]}, ${g.theme.bg[1]})`;
$('name').textContent = g.name;
$('name').style.color = g.theme.title[0];
$('tag').textContent = g.tagline;
const play = $('play') as HTMLButtonElement;
play.textContent = t('hub.play', 'JOGAR');
play.style.background = g.theme.accent;

const cv = $('sc') as HTMLCanvasElement;
const ctx = cv.getContext('2d')!;
let raf = 0;
const t0 = performance.now();
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = cv.clientWidth;
  const h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr)) cv.width = Math.round(w * dpr);
  if (cv.height !== Math.round(h * dpr)) cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const tt = (window as any).__showT ?? (now - t0) / 1000;
  g.drawShowcase!(ctx, w, h, tt);
}
raf = requestAnimationFrame(frame);

async function start() {
  cancelAnimationFrame(raf);
  $('menu').style.display = 'none';
  const root = $('root');
  root.style.display = 'block';
  const h = await g.launch(root, () => {
    root.style.display = 'none';
    $('menu').style.display = 'flex';
    raf = requestAnimationFrame(frame);
  });
  (window as any).__tubo = h;
}
play.onclick = start;
if (location.search.includes('play')) start();
