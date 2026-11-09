/**
 * Comemoração PADRÃO de "Novo recorde!" — usada por todos os jogos.
 * Faixa dourada que "pula" por cima da tela + confete em CSS + fanfarra + vibração.
 * Não bloqueia toques (pointer-events: none) e some sozinha.
 */
import { audio } from '../core/audio';
import { success } from '../core/haptics';
import { t } from '../i18n';
import { icon } from './icons';

const CSS = `
.rec-wrap{position:fixed;inset:0;pointer-events:none;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding-top:max(18vh,env(safe-area-inset-top))}
.rec-band{display:flex;align-items:center;gap:10px;padding:10px 22px 10px 14px;border-radius:22px;background:linear-gradient(180deg,#ffe680,#ffb03a);border:3px solid #2a0b5c;box-shadow:0 5px 0 #2a0b5c,0 0 40px rgba(255,200,60,.7);color:#2a0b5c;font:700 clamp(22px,7vw,34px) var(--font,'Fredoka',system-ui,sans-serif);animation:rec-in .45s cubic-bezier(.2,1.7,.4,1) both, rec-out .3s ease-in 1.9s forwards}
.rec-band small{display:block;font-size:.5em;opacity:.85;margin-top:-2px}
.rec-band .ico{animation:rec-wob .6s ease-in-out infinite alternate}
.rec-c{position:absolute;top:22vh;width:9px;height:14px;border-radius:2px;animation:rec-fall 1.6s ease-in forwards}
@keyframes rec-in{0%{transform:translateY(-40px) scale(.4);opacity:0}100%{transform:none;opacity:1}}
@keyframes rec-out{to{transform:translateY(-30px) scale(.9);opacity:0}}
@keyframes rec-wob{from{transform:rotate(-10deg)}to{transform:rotate(10deg) scale(1.1)}}
@keyframes rec-fall{0%{transform:translate(0,0) rotate(0);opacity:1}100%{transform:translate(var(--dx),70vh) rotate(var(--r));opacity:0}}
`;
let cssDone = false;
let lastAt = -1e9;

/** Mostra a comemoração. `detail` = valor do recorde já formatado (ex.: "1.240 m"). */
export function celebrateRecord(detail = ''): void {
  const now = performance.now();
  if (now - lastAt < 1500) return; // nunca duas seguidas
  lastAt = now;
  if (!cssDone) {
    cssDone = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const w = document.createElement('div');
  w.className = 'rec-wrap';
  w.innerHTML = `<div class="rec-band">${icon('trophy', { size: 44 })}<div>${t('record.new', 'Novo recorde!')}${detail ? `<small>${detail}</small>` : ''}</div></div>`;
  const cols = ['#ff4f8b', '#4fc3ff', '#ffe14f', '#6dff8a', '#b388ff'];
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('i');
    c.className = 'rec-c';
    c.style.left = `${8 + Math.random() * 84}%`;
    c.style.background = cols[i % cols.length];
    c.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    c.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
    c.style.animationDelay = `${Math.random() * 0.35}s`;
    w.appendChild(c);
  }
  document.body.appendChild(w);
  audio.record();
  success();
  setTimeout(() => w.remove(), 2400);
}
