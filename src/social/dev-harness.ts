/* Página de desenvolvimento (dev-social.html) — NÃO faz parte do jogo. */
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { registerGame, reportRun } from '../hub/registry';
import { initOnline } from '../services/online';
import { renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import { drawEmoteBubble, EMOTE_CODES, openEmoteWheel } from './emotes';
import { openChampionshipsPanel, openPlayerProfile, openSocial, registerSocial } from './register';

const theme = { bg: ['#000', '#111'] as [string, string], accent: '#f0f', accent2: '#0ff', title: ['#fff', '#fff'] as [string, string] };
for (const [id, name] of [['orbit', 'Bloop Orbit'], ['tubo', 'Tubo'], ['rally', 'Rally']]) {
  registerGame({
    id,
    name,
    tagline: '',
    icon: 'planet',
    theme,
    async launch(root, exit) {
      root.innerHTML = `<div style="color:#fff;padding:40px;font-size:22px">Jogo falso: ${name} <button id="end">Terminar (score 150)</button></div>`;
      root.querySelector('#end')!.addEventListener('click', () => {
        reportRun({ game: id, score: 150, coins: 0, durationSec: 30 });
        exit();
      });
      return { destroy() {} };
    },
  });
}
initOnline();
registerSocial();
const bar = document.getElementById('bar')!;
const add = (l: string, f: () => void) => {
  const b = document.createElement('button');
  b.textContent = l;
  b.onclick = f;
  bar.appendChild(b);
};
add('chat', () => openSocial('chat'));
add('amigos', () => openSocial('friends'));
add('ajustes', () => openSocial('settings'));
add('campeonatos', () => openChampionshipsPanel());
add('perfil', () => openPlayerProfile());
add('roda', () => openEmoteWheel((c) => (picked = { c, t0: performance.now() })));
(window as any).__social = { openSocial, openChampionshipsPanel, openPlayerProfile, openEmoteWheel };

// demo dos balões
let picked: { c: string; t0: number } | null = null;
const cv = document.getElementById('emo') as HTMLCanvasElement;
const W = 380,
  H = 520;
const d = Math.min(2, devicePixelRatio || 1);
cv.width = W * d;
cv.height = H * d;
cv.style.width = W + 'px';
cv.style.height = H + 'px';
const x = cv.getContext('2d')!;
const skins = ['bloop', 'king', 'bloop', 'king', 'bloop', 'king', 'bloop', 'king'].map((s) => renderSkinPreview(skinById(s), 70, 0.4, { backdrop: false }));
const t0 = performance.now();
function frame() {
  const t = (performance.now() - t0) / 1000;
  x.setTransform(d, 0, 0, d, 0, 0);
  x.fillStyle = '#1d0f4a';
  x.fillRect(0, 0, W, H);
  EMOTE_CODES.forEach((code, i) => {
    const cx = 95 + (i % 2) * 190;
    const cy = 120 + Math.floor(i / 2) * 120;
    x.drawImage(skins[i], cx - 35, cy - 25, 70, 70);
    drawEmoteBubble(x, code, cx, cy - 14, 0.9, Math.min(2.2, ((t + i * 0.1) % 3.2) + 0.5));
  });
  if (picked) drawEmoteBubble(x, picked.c, W / 2, H - 20, 1, (performance.now() - picked.t0) / 1000) || (picked = null);
  requestAnimationFrame(frame);
}
frame();
