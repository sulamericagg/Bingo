/* ============================================================
 *  FÁBRICA ESTELAR — "Minha Fábrica" (modo ocioso persistente).
 *  Produz moedas enquanto você está fora (teto de 8h).
 * ============================================================ */
import { audio } from '../../core/audio';
import { addCoins, spend } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { FpsLimiter, QualityGovernor } from '../../core/quality';
import { save } from '../../core/storage';
import type { MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { showRewarded } from '../../services/ads';
import { icon } from '../../ui/icons';
import { IDLE_CAP_H, IDLE_MAX_LVL, IDLE_UPGS, idleRate, idleUpgCost, idleUpgDesc, idleUpgName, ITEM_INDEX, PLOT_COLORS, type IdleUpg } from './data';
import { FactoryView } from './render';
import { idleFill, idlePending, persistTycoon, tycoonSave } from './save';
import { clearStars, Plot, updateStars } from './sim';

const DROP_ORDER = ['dA1', 'dA2', 'dA3', 'dB1', 'dB2', 'dB3', 'dC1', 'dC2', 'dC3'];
const UPG_ORDER = ['uA1', 'uB1', 'uC1', 'uA2', 'uB2', 'uC2'];
const BELT_OF: Record<string, string> = { A: 'bA', B: 'bB', C: 'bC' };

/** Itens visíveis da fábrica ociosa conforme os níveis. */
function idleItems(lv: Record<IdleUpg, number>): string[] {
  const out = new Set<string>(['bA']);
  const nd = Math.min(9, 1 + lv.drill + Math.floor(lv.drill / 3));
  for (let i = 0; i < nd; i++) {
    out.add(DROP_ORDER[i]);
    out.add(BELT_OF[DROP_ORDER[i][1]]);
  }
  const nu = Math.min(6, Math.ceil(lv.polish * 0.75));
  for (let i = 0; i < nu; i++) {
    out.add(UPG_ORDER[i]);
    out.add(BELT_OF[UPG_ORDER[i][1]]);
  }
  if (lv.belt >= 1) out.add('h1');
  if (lv.belt >= 3) out.add('d1');
  if (lv.belt >= 5) out.add('h2');
  if (lv.belt >= 7) out.add('d2');
  if (lv.drill >= IDLE_MAX_LVL && lv.polish >= IDLE_MAX_LVL && lv.belt >= IDLE_MAX_LVL) out.add('turbo');
  return [...out];
}

export function startIdle(root: HTMLElement, onBack: () => void, quality: QualityGovernor): MiniGameHandle {
  const ts = tycoonSave();
  let firstTime = false;
  if (!ts.last) {
    ts.last = Date.now();
    firstTime = true;
    persistTycoon();
  }
  const el = document.createElement('div');
  el.className = 'ty-root';
  root.appendChild(el);
  const cv = document.createElement('canvas');
  cv.className = 'ty-cv';
  el.appendChild(cv);
  clearStars();
  const plot = new Plot(0, 0, 0, t('tycoon.myFactory', 'Minha Fábrica'), save.skin || 'bloop', PLOT_COLORS[0], true);
  const apply = (anim: boolean) => {
    for (const id of idleItems(ts.lv)) plot.buildNow(ITEM_INDEX[id], anim ? view.time : -99, anim ? view : null);
  };
  const q = quality.settings;
  const view = new FactoryView(cv, { glows: q.glows, budget: q.particleBudget });
  view.showPrices = false;
  view.drawPads = false;
  const limiter = new FpsLimiter(q.fpsCap);
  apply(false);

  const ui = document.createElement('div');
  ui.className = 'ty-hud';
  ui.innerHTML = `
    <div class="ty-top">
      <button class="ty-btn ty-ic" data-a="back" aria-label="${t('tycoon.back', 'Voltar')}">${icon('home', { size: 26 })}</button>
      <div class="ty-pill" style="margin-left:auto">${icon('coin', { size: 24 })}<span data-v="wallet"></span></div>
    </div>
    <div class="ty-idle">
      <div class="ty-card">
        <div style="display:flex;align-items:center;gap:8px">
          ${icon('coins', { size: 40 })}
          <div style="flex:1">
            <div style="font-size:13px;opacity:.8">${t('tycoon.idle.ready', 'Pronto para coletar')}</div>
            <div style="font-size:28px;font-weight:700;color:#fff36b" data-v="pending">0</div>
          </div>
          <div style="text-align:right;font-size:12px;opacity:.85" data-v="rate"></div>
        </div>
        <div class="ty-meter"><i data-v="fill"></i></div>
        <div style="display:flex;gap:8px">
          <button class="ty-btn ty-gold" style="flex:1;padding:10px" data-a="collect">${t('tycoon.idle.collect', 'Coletar')}</button>
          <button class="ty-btn ty-pink" style="flex:1;padding:10px" data-a="double">${icon('video', { size: 20 })}${t('tycoon.idle.collect2', 'Coletar x2')}</button>
        </div>
      </div>
      <div class="ty-card" data-v="upgs"></div>
    </div>`;
  el.appendChild(ui);
  const $ = (s: string) => ui.querySelector(s) as HTMLElement;
  const wWallet = $('[data-v=wallet]');
  const wPending = $('[data-v=pending]');
  const wRate = $('[data-v=rate]');
  const wFill = $('[data-v=fill]');
  const bCollect = $('[data-a=collect]') as HTMLButtonElement;
  const bDouble = $('[data-a=double]') as HTMLButtonElement;
  const wUpgs = $('[data-v=upgs]');

  function renderUpgs(): void {
    wUpgs.innerHTML = IDLE_UPGS.map((u) => {
      const lv = ts.lv[u];
      const max = lv >= IDLE_MAX_LVL;
      const cost = idleUpgCost(u, lv);
      const pips = Array.from({ length: IDLE_MAX_LVL }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="ty-upg"><div class="ty-n"><b>${idleUpgName(u)}</b><small>${idleUpgDesc(u)}</small><div class="ty-lv">${pips}</div></div>
        <button class="ty-btn ty-green" data-u="${u}" ${max || save.coins < cost ? 'disabled' : ''}>${max ? t('tycoon.idle.max', 'Máximo') : `${icon('coin', { size: 18 })}${fmt(cost)}`}</button></div>`;
    }).join('');
    wUpgs.querySelectorAll<HTMLButtonElement>('[data-u]').forEach((b) =>
      b.addEventListener('click', () => {
        const u = b.dataset.u as IdleUpg;
        const lv = ts.lv[u];
        if (lv >= IDLE_MAX_LVL) return;
        // coleta antes de subir a taxa (justo com o tempo já passado)
        const pend = idlePending();
        if (!spend({ coins: idleUpgCost(u, lv) })) return;
        if (pend > 0) addCoins(pend);
        ts.last = Date.now();
        ts.lv[u] = lv + 1;
        persistTycoon();
        audio.unlock2();
        tap('medium');
        apply(true);
        refresh();
        renderUpgs();
      }),
    );
  }

  let lastPend = -1;
  function refresh(): void {
    const pend = idlePending();
    wWallet.textContent = fmt(save.coins);
    if (pend !== lastPend) {
      lastPend = pend;
      wPending.textContent = fmt(pend);
    }
    const rate = idleRate(ts.lv);
    const fill = idleFill();
    wRate.innerHTML = `${t('tycoon.idle.rate', '{n} por hora', { n: fmt(rate) })}<br>${
      fill >= 1 ? t('tycoon.idle.full', 'Cofre cheio!') : t('tycoon.idle.cap', 'Enche em {h}h', { h: Math.ceil(IDLE_CAP_H * (1 - fill)) })
    }`;
    wFill.style.width = `${fill * 100}%`;
    bCollect.disabled = pend < 1;
    bDouble.disabled = pend < 1;
  }

  const collect = (mult: number, amount: number) => {
    addCoins(amount * mult);
    ts.last = Date.now();
    persistTycoon();
    audio.cash();
    success();
    view.text(6.5, 8.2, '+' + fmt(amount * mult), '#ffe680');
    view.confetti(6.5, 8.6, 30);
    plot.cofreFlash = 1;
    refresh();
    renderUpgs();
  };
  bCollect.addEventListener('click', () => {
    const a = idlePending();
    if (a >= 1) collect(1, a);
  });
  bDouble.addEventListener('click', async () => {
    const a = idlePending();
    if (a < 1) return;
    bDouble.disabled = true;
    const ok = await showRewarded();
    if (destroyed) return;
    if (ok) collect(2, a);
    else refresh();
  });
  $('[data-a=back]').addEventListener('click', () => {
    audio.click();
    destroy();
    onBack();
  });

  const resize = () => {
    const w = el.clientWidth || window.innerWidth;
    const h = el.clientHeight || window.innerHeight;
    view.resize(w, h, quality.settings.dprCap, 9.4, [plot]);
    const panel = (ui.querySelector('.ty-idle') as HTMLElement).offsetHeight || h * 0.45;
    const freeH = (h - panel - 50) * view.dpr;
    view.zoom = Math.min(1, view.W / (9.4 * view.S), freeH / (11.6 * view.S));
    view.camX = 4;
    view.camY = 5 + (panel * view.dpr) / 2 / (view.S * view.zoom) - (25 * view.dpr) / (view.S * view.zoom);
  };

  let destroyed = false;
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let uiT = 0;
  let wanderT = 0;
  function frame(now: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (paused || !limiter.shouldRender(now)) return;
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    wanderT -= dt;
    if (wanderT <= 0) {
      wanderT = 2 + Math.random() * 3;
      plot.tx = 1 + Math.random() * 6;
      plot.ty = 8.2 + Math.random() * 1.4;
    }
    plot.stepWalker(dt, false);
    plot.update(dt, view.time, null, false);
    updateStars([plot], dt, null);
    plot.bank = 0;
    view.draw([plot], dt, view.time);
    uiT -= dt;
    if (uiT <= 0) {
      uiT = 0.5;
      refresh();
    }
  }
  const onVis = () => (paused = document.hidden);
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', resize);
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVis);
    view.clearFx();
    clearStars();
    el.remove();
  }
  renderUpgs();
  refresh();
  resize();
  requestAnimationFrame(() => {
    resize();
    if (firstTime) view.text(4, 5, t('tycoon.idle.started', 'Sua fábrica começou a produzir!'), '#7dffb0');
  });
  raf = requestAnimationFrame(frame);
  return {
    destroy,
    pause: () => (paused = true),
    resume: () => {
      paused = false;
      last = performance.now();
    },
  };
}
