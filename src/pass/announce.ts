/* ============================================================
 *  POP-UPS AUTOMÁTICOS POR DATA + FAIXA DA LOJA
 *   - anúncio da temporada nova: 1x por temporada ('sNN' em pass.seen)
 *   - "últimos 3 dias": 1x por temporada ('sNN-end')
 *   ?debug&announce força o pop-up (teste).
 * ============================================================ */
import './pass.css';
import { persist, save } from '../core/storage';
import type { SeasonInfo } from '../creatures/seasons';
import { t } from '../i18n';
import { icon } from '../ui/icons';
import { drawSeasonArt, mixHex } from './art';
import { passSeason } from './catalog';
import { creatureIcon, loadSeasonCreatureNames } from './creatures-bridge';
import { activeSeason, isPremium, seasonLeftMs } from './state';

const DAY = 86400000;

function theme(el: HTMLElement, s: SeasonInfo): void {
  const [bg, a, b] = s.palette;
  el.style.setProperty('--s-bg', bg);
  el.style.setProperty('--s-a', a);
  el.style.setProperty('--s-b', b);
  el.style.setProperty('--s-a-dim', mixHex(a, bg, 0.55));
}

function art(w: number, hgt: number, s: SeasonInfo): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * dpr;
  c.height = hgt * dpr;
  c.style.height = hgt + 'px';
  const x = c.getContext('2d')!;
  x.scale(dpr, dpr);
  drawSeasonArt(x, w, hgt, s, 0);
  return c;
}

export async function maybeAnnounce(): Promise<void> {
  const s = activeSeason();
  if (!s || document.querySelector('.pa-overlay, .pass-panel')) return;
  const force = /[?&]debug\b/.test(location.search) && /[?&]announce\b/.test(location.search);
  const seen = save.pass.seen;
  const left = seasonLeftMs(s);
  let kind: 'new' | 'end' | null = null;
  if (force) kind = /[?&]announce=end\b/.test(location.search) ? 'end' : 'new';
  else if (!seen.includes(s.id)) kind = 'new';
  else if (left < 3 * DAY && !seen.includes(s.id + '-end')) kind = 'end';
  if (!kind) return;
  seen.push(kind === 'new' ? s.id : s.id + '-end');
  if (seen.length > 40) seen.splice(0, seen.length - 40);
  persist();
  await loadSeasonCreatureNames(s.index);
  const king = passSeason(s.index).levels[49].prem;
  const ov = document.createElement('div');
  ov.className = 'pa-overlay';
  theme(ov, s);
  const card = document.createElement('div');
  card.className = 'pa-card';
  card.appendChild(art(380, 190, s));
  const kingBox = document.createElement('div');
  kingBox.className = 'pa-king';
  kingBox.appendChild(await creatureIcon(king.id, 120, s.palette, 'legendary'));
  const body = document.createElement('div');
  body.className = 'pa-body';
  const daysLeft = Math.max(1, Math.ceil(left / DAY));
  body.innerHTML =
    kind === 'new'
      ? `<div class="pa-kicker">${t('pass.ann.new', 'Novo Passe Estelar!')}</div><div class="pa-title">${s.theme}</div><div class="pa-text">${t('pass.ann.newText', '50 níveis, 5 bichinhos exclusivos e o rei da temporada: {k}.', { k: king.name })}</div>`
      : `<div class="pa-kicker">${icon('clock', { size: 16 })} ${t('pass.ann.end', 'Últimos {n} dias!', { n: daysLeft })}</div><div class="pa-title">${s.theme}</div><div class="pa-text">${isPremium() ? t('pass.ann.endPrem', 'Corra para resgatar tudo antes que a temporada acabe!') : t('pass.ann.endFree', 'Os prêmios desta temporada nunca mais voltam. Ainda dá tempo!')}</div>`;
  const btns = document.createElement('div');
  btns.className = 'pa-btns';
  const later = document.createElement('button');
  later.className = 'pa-later';
  later.textContent = t('pass.ann.later', 'Depois');
  const go = document.createElement('button');
  go.className = 'pa-go';
  go.textContent = t('pass.ann.go', 'Ver passe');
  btns.append(later, go);
  body.appendChild(btns);
  card.append(kingBox, body);
  ov.appendChild(card);
  document.body.appendChild(ov);
  const close = () => ov.remove();
  later.onclick = close;
  ov.onclick = (e) => e.target === ov && close();
  go.onclick = () => {
    close();
    import('./ui').then((m) => m.openPassUI());
  };
}

/** Faixa da temporada (loja/hub): arte + nome + contagem; abre o passe. */
export function seasonBanner(el: HTMLElement): void {
  const s = activeSeason();
  if (!s) return;
  const b = document.createElement('div');
  b.className = 'season-banner';
  theme(b, s);
  const w = Math.max(280, el.clientWidth || 340);
  b.appendChild(art(w, 84, s));
  const txt = document.createElement('div');
  txt.innerHTML = `<b>${t('pass.title', 'Passe Estelar')}: ${s.theme}</b><small>${t('pass.endsIn', 'Termina em {t}', { t: `${Math.ceil(seasonLeftMs(s) / DAY)}d` })}</small>`;
  b.appendChild(txt);
  b.onclick = () => import('./ui').then((m) => m.openPassUI());
  el.appendChild(b);
}
