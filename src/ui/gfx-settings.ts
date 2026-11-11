/* ============================================================
 *  Ajustes > Gráficos: aparelho detectado + nível escolhido,
 *  botões grandes Auto / Mínimo / Baixo / Médio / Alto,
 *  chave "Economia de bateria" (30 fps em todo o app) e
 *  "Testar meu aparelho de novo".
 * ============================================================ */
import { tap } from '../core/haptics';
import { batterySaver, lastDetection, setBatterySaver, type QualityGovernor, type QualityMode, type Tier } from '../core/quality';
import { t } from '../i18n';
import { icon } from './icons';

const CSS = `
.gfxs{display:flex;flex-direction:column;gap:10px;padding:12px 4px;border-bottom:1px solid rgba(255,255,255,.08)}
.gfxs-head{display:flex;align-items:center;gap:12px;font-size:17px}
.gfxs-dev{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);text-align:left}
.gfxs-dev svg{flex:none}
.gfxs-dev b{display:block;font-size:16px;font-weight:700;line-height:1.2;word-break:break-word}
.gfxs-dev small{display:block;font-size:13px;opacity:.75;line-height:1.25;margin-top:2px}
.gfxs-lv{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.gfxs-lv button{font:inherit;color:inherit;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:64px;padding:6px 2px;border-radius:14px;
  border:2px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
.gfxs-lv button span{font-size:12.5px;font-weight:700;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.gfxs-lv button.on{background:linear-gradient(180deg,#9ff8ff,#2f86e0);border-color:#d8fdff;color:#12063a;box-shadow:0 3px 0 rgba(20,5,60,.5)}
.gfxs-lv button.rec:not(.on){border-color:rgba(94,240,255,.55)}
.gfxs-lv button:active{transform:translateY(2px)}
.gfxs .toggle{border-bottom:0;padding:6px 4px}
.gfxs-retest{font:inherit;font-weight:700;font-size:15px;color:inherit;display:flex;align-items:center;justify-content:center;gap:10px;min-height:52px;border-radius:16px;
  border:2px solid rgba(255,255,255,.22);background:rgba(255,255,255,.06);cursor:pointer;touch-action:manipulation}
.gfxs-retest:active{transform:translateY(2px)}
`;
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** Nome do nível no idioma atual (chaves estáticas: o extrator de i18n enxerga). */
export function tierName(n: Tier): string {
  return [t('quality.0', 'Mínimo'), t('quality.1', 'Baixo'), t('quality.2', 'Médio'), t('quality.3', 'Alto')][n];
}

/** Barrinhas de nível (1..4 cheias; 0 = "A" de automático). */
function bars(n: number, auto = false): string {
  if (auto)
    return `<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true"><path d="M15 2 L18 10 L26 11 L20 16 L22 24 L15 20 L8 24 L10 16 L4 11 L12 10 Z" fill="currentColor"/></svg>`;
  let s = '<svg width="30" height="26" viewBox="0 0 30 26" aria-hidden="true">';
  for (let i = 0; i < 4; i++) {
    const h = 7 + i * 5.5;
    s += `<rect x="${2 + i * 7}" y="${25 - h}" width="5" height="${h}" rx="1.5" fill="currentColor" opacity="${i <= n ? 1 : 0.25}"/>`;
  }
  return s + '</svg>';
}
const PHONE = `<svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><rect x="9" y="2" width="16" height="30" rx="4" fill="#5ef0ff" stroke="#2a0b5c" stroke-width="2.5"/><rect x="12" y="6" width="10" height="19" rx="1.5" fill="#2a0b5c" opacity=".35"/><circle cx="17" cy="28.5" r="1.6" fill="#2a0b5c"/></svg>`;
const BATTERY = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="3" y="7" width="16" height="10" rx="2.5" fill="#fff" stroke="#2a0b5c" stroke-width="1.8"/><rect x="19.5" y="10" width="2" height="4" rx="1" fill="#2a0b5c"/><rect x="5" y="9" width="7" height="6" rx="1" fill="#3ee07a"/></svg>`;

export interface GfxSettingsDeps {
  /** governor do hub (modo + nível atual) */
  gov: QualityGovernor;
  /** troca o modo (o dono aplica e persiste) */
  setMode: (m: QualityMode) => void;
  /** roda o teste do aparelho de novo (tela de carregamento) */
  retest: () => Promise<void>;
}

/** Renderiza a seção "Gráficos" dentro de `host` (substitui o conteúdo). */
export function renderGfxSettings(host: HTMLElement, d: GfxSettingsDeps): void {
  css();
  host.className = 'gfxs';
  const det = lastDetection();
  const rec = det ? (det.tier as Tier) : null;
  const mode = d.gov.mode;
  const cur = d.gov.tier;
  const dev = det?.dev || t('gfx.thisDevice', 'Este aparelho');
  const line2 = rec !== null ? t('gfx.recommended', 'Recomendado: {tier}', { tier: tierName(rec) }) + (det?.gpu ? ' · ' + det.gpu : '') : '';
  const levels: [QualityMode, string, string][] = [
    ['auto', t('gfx.auto', 'Auto'), bars(0, true)],
    [0, tierName(0), bars(0)],
    [1, tierName(1), bars(1)],
    [2, tierName(2), bars(2)],
    [3, tierName(3), bars(3)],
  ];
  host.innerHTML = `
    <div class="gfxs-head"><span class="plate round sm plate-gold">${icon('bolt')}</span><span>${esc(t('settings.gfx', 'Gráficos'))}: <b>${esc(mode === 'auto' ? t('gfx.autoNow', 'Auto ({tier})', { tier: tierName(cur) }) : tierName(cur))}</b></span></div>
    <div class="gfxs-dev">${PHONE}<div><b>${esc(dev)}</b><small>${esc(line2)}</small></div></div>
    <div class="gfxs-lv" role="radiogroup" aria-label="${esc(t('settings.gfxAria', 'Qualidade gráfica'))}">
      ${levels
        .map(
          ([m, label, ic]) =>
            `<button type="button" role="radio" aria-checked="${m === mode}" data-gm="${m}" class="${m === mode ? 'on' : ''}${m === rec ? ' rec' : ''}">${ic}<span>${esc(label)}</span></button>`,
        )
        .join('')}
    </div>
    <label class="toggle"><span><span class="plate round sm plate-green">${BATTERY}</span><span>${esc(t('gfx.battery', 'Economia de bateria'))}<small style="display:block;font-size:12.5px;opacity:.7">${esc(t('gfx.batteryHint', 'Limita a 30 quadros por segundo'))}</small></span></span><input type="checkbox" class="gfxs-bat" ${batterySaver() ? 'checked' : ''}/><i></i></label>
    <button type="button" class="gfxs-retest">${icon('refresh', { size: 24 })}<span>${esc(t('gfx.retest', 'Testar meu aparelho de novo'))}</span></button>`;
  host.querySelectorAll<HTMLButtonElement>('[data-gm]').forEach((b) => {
    b.onclick = () => {
      tap('light');
      const v = b.dataset.gm!;
      d.setMode(v === 'auto' ? 'auto' : (Number(v) as Tier));
      renderGfxSettings(host, d);
    };
  });
  const bat = host.querySelector<HTMLInputElement>('.gfxs-bat')!;
  bat.onchange = () => {
    tap('light');
    setBatterySaver(bat.checked);
    d.gov.refresh();
  };
  const rt = host.querySelector<HTMLButtonElement>('.gfxs-retest')!;
  rt.onclick = async () => {
    tap('light');
    rt.disabled = true;
    try {
      await d.retest();
    } finally {
      if (host.isConnected) renderGfxSettings(host, d);
    }
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
