/**
 * PROGRAMA BETA (Ajustes) + conta (@nome editável) + botão "Reportar bug".
 *
 *  - Ajustes ganha: linha do @nome (editar), selo "Beta" no perfil e o interruptor do Programa Beta.
 *  - Beta ligado: botãozinho flutuante e arrastável "bug" em todas as telas → folha de relatório
 *    (categoria, descrição, contexto automático, foto opcional do jogo). Fila offline.
 *  - Sacudir o aparelho também abre o relatório (opcional, desligado por padrão).
 *  - Erro inesperado (window.onerror) → "Algo deu errado — enviar relatório?" (só beta).
 */
import './beta.css';
import { pushBack } from '../core/back';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { t } from '../i18n';
import { CATEGORIES, buildReport, initFeedbackSync, queuedCount, submitReport, type FeedbackCategory } from '../services/feedback';
import { setErrorPrompt, type ErrEntry } from '../services/errors';
import { profile, saveProfile } from '../services/profile';
import { icon } from './icons';
import { openProfileEditor } from './onboarding';

const BUG_SVG = `<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><ellipse cx="16" cy="19" rx="8" ry="9.5" fill="#ff5c7a" stroke="#2a0b5c" stroke-width="2.4"/><circle cx="16" cy="9" r="5" fill="#2a0b5c"/><path d="M16 10v18M8 15l-5-3M24 15l5-3M8 21H2M24 21h6M9 26l-4 4M23 26l4 4M13 5l-2-3M19 5l2-3" stroke="#2a0b5c" stroke-width="2.2" stroke-linecap="round" fill="none"/><circle cx="12.5" cy="17" r="1.6" fill="#fff"/><circle cx="19.5" cy="22" r="1.6" fill="#fff"/></svg>`;

const POS_KEY = 'bw-bugbtn-pos';
const SHAKE_KEY = 'bw-beta-shake';

const catLabel = (c: FeedbackCategory): string =>
  ({
    physics: t('beta.cat.physics', 'Física'),
    crash: t('beta.cat.crash', 'Jogo travou'),
    visual: t('beta.cat.visual', 'Visual'),
    sound: t('beta.cat.sound', 'Som'),
    shop: t('beta.cat.shop', 'Loja'),
    other: t('beta.cat.other', 'Outro'),
  })[c];

let bugBtn: HTMLButtonElement | null = null;
let sheetOpen = false;

/* ============================== botão flutuante ============================== */

function mountBugButton(): void {
  if (bugBtn || !profile.beta) return;
  const b = document.createElement('button');
  b.className = 'beta-bug';
  b.setAttribute('aria-label', t('beta.report', 'Reportar bug'));
  b.innerHTML = BUG_SVG;
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (p && typeof p.x === 'number') {
      b.style.left = `${Math.min(innerWidth - 44, Math.max(0, p.x))}px`;
      b.style.top = `${Math.min(innerHeight - 44, Math.max(0, p.y))}px`;
    }
  } catch {
    /* */
  }
  // arrastar (pointer) sem disparar o clique
  let sx = 0;
  let sy = 0;
  let ox = 0;
  let oy = 0;
  let moved = false;
  let down = false;
  b.addEventListener('pointerdown', (e) => {
    down = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    const r = b.getBoundingClientRect();
    ox = r.left;
    oy = r.top;
    b.setPointerCapture(e.pointerId);
  });
  b.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    b.style.left = `${Math.min(innerWidth - 44, Math.max(0, ox + dx))}px`;
    b.style.top = `${Math.min(innerHeight - 44, Math.max(0, oy + dy))}px`;
    b.style.right = 'auto';
    b.style.bottom = 'auto';
  });
  b.addEventListener('pointerup', () => {
    down = false;
    if (moved) {
      const r = b.getBoundingClientRect();
      try {
        localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
      } catch {
        /* */
      }
    }
  });
  b.addEventListener('click', (e) => {
    if (moved) {
      e.preventDefault();
      moved = false;
      return;
    }
    openReportSheet();
  });
  document.body.appendChild(b);
  bugBtn = b;
}

function unmountBugButton(): void {
  bugBtn?.remove();
  bugBtn = null;
}

/* ============================== folha de relatório ============================== */

export function openReportSheet(opts: { category?: FeedbackCategory; prefill?: string } = {}): void {
  if (sheetOpen) return;
  sheetOpen = true;
  // a "foto" sai ANTES da folha aparecer (o canvas do jogo ainda está na tela)
  const draft = buildReport(opts.category ?? 'other', '', true, profile.handle);
  let cat: FeedbackCategory = opts.category ?? 'physics';
  const root = document.createElement('div');
  root.className = 'beta-sheet-bg';
  root.innerHTML = `
    <div class="beta-sheet" role="dialog" aria-modal="true">
      <header><b>${BUG_SVG} ${t('beta.report', 'Reportar bug')}</b><button class="icon-btn close" data-x aria-label="${t('common.close', 'Fechar')}">${icon('close')}</button></header>
      <div class="beta-label">${t('beta.whatHappened', 'O que aconteceu?')}</div>
      <div class="beta-cats">${CATEGORIES.map((c) => `<button data-cat="${c}" class="${c === cat ? 'on' : ''}">${catLabel(c)}</button>`).join('')}</div>
      <textarea maxlength="1000" rows="4" placeholder="${t('beta.descPh', 'Conte com suas palavras: o que você fez, o que esperava e o que aconteceu.')}"></textarea>
      <label class="beta-shot"><input type="checkbox" ${draft.shot ? 'checked' : 'disabled'} /> <span>${draft.shot ? t('beta.attachShot', 'Anexar foto do jogo') : t('beta.noShot', 'Sem foto desta tela')}</span>${draft.shot ? `<img alt="" src="${draft.shot}" />` : ''}</label>
      <p class="beta-ctx">${t('beta.ctxNote', 'Vamos anexar: versão do app, aparelho, tela atual, qualidade gráfica e os últimos erros. Nada de dados pessoais.')}</p>
      <button class="btn btn-green" data-send>${t('beta.send', 'Enviar relatório')}</button>
    </div>`;
  document.body.appendChild(root);
  const ta = root.querySelector('textarea')!;
  if (opts.prefill) ta.value = opts.prefill;
  root.querySelectorAll<HTMLButtonElement>('[data-cat]').forEach(
    (b) =>
      (b.onclick = () => {
        cat = b.dataset.cat as FeedbackCategory;
        haptics.tap('light');
        root.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
      }),
  );
  let pop = () => {};
  const close = () => {
    pop();
    sheetOpen = false;
    root.remove();
  };
  pop = pushBack(close);
  root.querySelector<HTMLButtonElement>('[data-x]')!.onclick = close;
  root.addEventListener('pointerdown', (e) => e.target === root && close());
  const send = root.querySelector<HTMLButtonElement>('[data-send]')!;
  send.onclick = async () => {
    const text = ta.value.trim();
    if (text.length < 3) {
      ta.focus();
      ta.classList.add('bad');
      haptics.tap('heavy');
      return;
    }
    send.disabled = true;
    const withShot = root.querySelector<HTMLInputElement>('.beta-shot input')!.checked;
    const r = { ...draft, category: cat, text: text.slice(0, 1000), t: Date.now() };
    if (!withShot) delete r.shot;
    const res = await submitReport(r);
    close();
    bus.emit('toast', res === 'sent' ? t('beta.sent', 'Valeu! Relatório enviado.') : t('beta.queued', 'Guardado! Enviamos quando a internet voltar.'));
  };
  setTimeout(() => ta.focus(), 200);
}

/* ============================== erro inesperado ============================== */

function offerErrorReport(e: ErrEntry): void {
  if (!profile.beta || sheetOpen || document.querySelector('.beta-err')) return;
  const el = document.createElement('div');
  el.className = 'beta-err';
  el.innerHTML = `<span>${icon('warning', { size: 22 })} ${t('beta.errAsk', 'Algo deu errado — enviar relatório?')}</span><button data-y>${t('beta.errYes', 'Enviar')}</button><button data-n aria-label="${t('common.close', 'Fechar')}">${icon('close', { size: 18 })}</button>`;
  document.body.appendChild(el);
  const kill = () => el.remove();
  el.querySelector<HTMLButtonElement>('[data-y]')!.onclick = () => {
    kill();
    openReportSheet({ category: 'crash', prefill: '' });
  };
  el.querySelector<HTMLButtonElement>('[data-n]')!.onclick = kill;
  setTimeout(kill, 9000);
  void e;
}

/* ============================== sacudir ============================== */

let shakeOn = false;
let lastShake = 0;
function onMotion(e: DeviceMotionEvent): void {
  const a = e.accelerationIncludingGravity;
  if (!a || a.x == null || a.y == null || a.z == null) return;
  const g = Math.hypot(a.x, a.y, a.z);
  if (g > 28 && Date.now() - lastShake > 4000) {
    lastShake = Date.now();
    openReportSheet();
  }
}
function setShake(on: boolean): void {
  if (on === shakeOn) return;
  shakeOn = on;
  if (on) window.addEventListener('devicemotion', onMotion);
  else window.removeEventListener('devicemotion', onMotion);
}
const shakePref = (): boolean => {
  try {
    return localStorage.getItem(SHAKE_KEY) === '1';
  } catch {
    return false;
  }
};

/* ============================== Ajustes ============================== */

function rowsHtml(): string {
  const h = profile.handle;
  const st = profile.handleStatus;
  const chip =
    st === 'pending'
      ? `<em class="acc-chip">${t('acc.pending', 'pendente')}</em>`
      : st === 'conflict'
        ? `<em class="acc-chip bad">${t('acc.conflict', 'escolha outro')}</em>`
        : '';
  return `
    <button class="toggle acc-row" data-acc-edit><span><span class="plate round sm plate-cyan">${icon('user', { size: 22 })}</span><span>${h ? `<b class="acc-at">@${h}</b>` : t('acc.noHandle', 'Escolha seu @')} ${chip}</span></span><b class="acc-edit">${icon('pencil', { size: 20 })}</b></button>
    <label class="toggle"><span><span class="plate round sm plate-pink beta-plate">${BUG_SVG}</span><span>${t('beta.program', 'Programa Beta')}<small class="acc-sub">${t('beta.programSub', 'Teste novidades e reporte bugs')}</small></span></span><input type="checkbox" data-beta ${profile.beta ? 'checked' : ''} /><i></i></label>
    ${
      profile.beta
        ? `<label class="toggle"><span><span class="plate round sm plate-violet">${icon('vibration', { size: 22 })}</span><span>${t('beta.shake', 'Sacudir para reportar')}</span></span><input type="checkbox" data-shake ${shakePref() ? 'checked' : ''} /><i></i></label>
           <button class="btn btn-ghost acc-report" data-acc-report>${t('beta.report', 'Reportar bug')}${queuedCount() ? ` · ${t('beta.inQueue', '{n} na fila', { n: queuedCount() })}` : ''}</button>`
        : ''
    }`;
}

function renderAccount(): void {
  const panel = document.querySelector('#settings .panel');
  const prof = panel?.querySelector('.profile');
  if (!panel || !prof) return;
  let box = panel.querySelector<HTMLElement>('.acc-box');
  if (!box) {
    box = document.createElement('div');
    box.className = 'acc-box';
    prof.insertAdjacentElement('afterend', box);
  }
  box.innerHTML = rowsHtml();
  // selo Beta no perfil
  const meta = prof.querySelector('.profile-meta');
  let badge = meta?.querySelector('.beta-badge');
  if (profile.beta && meta && !badge) {
    badge = document.createElement('span');
    badge.className = 'beta-badge';
    badge.textContent = t('beta.badge', 'Beta');
    meta.prepend(badge);
  } else if (!profile.beta) badge?.remove();

  box.querySelector<HTMLElement>('[data-acc-edit]')!.onclick = () => void openProfileEditor().then(renderAccount);
  box.querySelector<HTMLInputElement>('[data-beta]')!.onchange = (e) => {
    const on = (e.target as HTMLInputElement).checked;
    profile.beta = on;
    if (on && !profile.betaSince) profile.betaSince = Date.now();
    saveProfile();
    haptics.tap('medium');
    applyBeta();
    if (on) bus.emit('toast', t('beta.welcome', 'Bem-vindo ao Programa Beta! Toque no inseto para reportar.'));
    renderAccount();
  };
  const sh = box.querySelector<HTMLInputElement>('[data-shake]');
  if (sh)
    sh.onchange = () => {
      try {
        localStorage.setItem(SHAKE_KEY, sh.checked ? '1' : '0');
      } catch {
        /* */
      }
      applyBeta();
    };
  const rep = box.querySelector<HTMLElement>('[data-acc-report]');
  if (rep) rep.onclick = () => openReportSheet();
}

function applyBeta(): void {
  if (profile.beta) mountBugButton();
  else unmountBugButton();
  setShake(profile.beta && shakePref());
  setErrorPrompt(profile.beta ? offerErrorReport : null);
}

export function initBeta(): void {
  initFeedbackSync();
  applyBeta();
  const settings = document.getElementById('settings');
  if (settings) {
    renderAccount();
    new MutationObserver(() => settings.classList.contains('on') && renderAccount()).observe(settings, { attributes: true, attributeFilter: ['class'] });
  }
  bus.on('profile', () => {
    if (settings?.classList.contains('on')) renderAccount();
  });
  bus.on('lang', renderAccount);
  (window as unknown as { bloopReport?: () => void }).bloopReport = () => openReportSheet();
}
