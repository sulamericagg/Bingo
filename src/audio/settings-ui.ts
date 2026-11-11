/* ============================================================
 *  Ajustes de áudio: sliders Volume / Música / Efeitos (ícone primeiro).
 *  Entram logo abaixo dos interruptores "Efeitos sonoros" e "Música" do
 *  modal de Ajustes (index.html). Valores ficam no aparelho (engine.mix).
 * ============================================================ */
import { t } from '../i18n';
import { engine, type Mix } from './engine';
import { play } from './sound';
import { hydrateIcons } from '../ui/icons';

const CSS = `
.bw-mix{display:flex;flex-direction:column;gap:6px;margin:2px 0 8px}
.bw-mix label{display:flex;align-items:center;gap:12px;padding:4px 6px}
.bw-mix input[type=range]{flex:1;min-width:0;height:28px;accent-color:#ff7ad9;background:transparent}
.bw-mix .bw-mix-v{min-width:2.6em;text-align:right;font-weight:800;opacity:.75;font-variant-numeric:tabular-nums}
`;

export function mountMixSliders(rebuild = false): void {
  const anchor = document.querySelector('[data-setting="music"]')?.closest('label');
  if (!anchor) return;
  let box = document.getElementById('bw-mix');
  if (box && !rebuild) return;
  if (!document.getElementById('bw-mix-css')) {
    const st = document.createElement('style');
    st.id = 'bw-mix-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  if (!box) {
    box = document.createElement('div');
    box.id = 'bw-mix';
    box.className = 'bw-mix';
    anchor.insertAdjacentElement('afterend', box);
  }
  const rows: [keyof Mix, string, string, string][] = [
    ['vol', 'sound', 'plate-gold', t('cin.dub.volume', 'Volume')],
    ['music', 'music', 'plate-pink', t('settings.music', 'Música')],
    ['sfx', 'sound', 'plate-cyan', t('settings.sound', 'Efeitos sonoros')],
  ];
  box.innerHTML = rows
    .map(
      ([k, ic, plate, label]) =>
        `<label title="${label}"><span class="plate round sm ${plate}" data-icon="${ic}" aria-hidden="true"></span>` +
        `<input type="range" min="0" max="100" step="5" data-mix="${k}" aria-label="${label}" value="${Math.round(engine.mix[k] * 100)}" />` +
        `<b class="bw-mix-v">${Math.round(engine.mix[k] * 100)}</b></label>`,
    )
    .join('');
  hydrateIcons(box);
  box.querySelectorAll<HTMLInputElement>('input[data-mix]').forEach((inp) => {
    const k = inp.dataset.mix as keyof Mix;
    const out = inp.parentElement!.querySelector('.bw-mix-v')!;
    inp.oninput = () => {
      engine.unlock();
      const v = Number(inp.value) / 100;
      out.textContent = inp.value;
      engine.setMix({ [k]: v });
    };
    // amostra do nível ao soltar (efeitos/volume)
    inp.onchange = () => {
      if (k !== 'music') play('hub.coin', { force: true });
    };
  });
}
