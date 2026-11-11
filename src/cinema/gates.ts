/* ============================================================
 *  BLOOP CINEMA — Pro (Clube Bloop ou qualquer Passe premium),
 *  limites grátis, aviso amigável (sem produto novo de compra) e
 *  filtro de texto (mesmo filtro do chat).
 * ============================================================ */
import { maskLongText } from '../../shared/moderation';
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { isPremium } from '../pass/state';
import { musicPremium } from '../pass/mstate';
import { homePremium } from '../pass/home/state';
import { openClub, openPass } from '../pass/register';
import { notify } from '../ui/notify';
import { FREE_MAX_PROJECTS, FREE_MAX_SEC, PRO_MAX_SEC } from './data';

const DEBUG_PRO = typeof location !== 'undefined' && /[?&]cinemapro\b/.test(location.search) && /[?&]debug\b/.test(location.search);

/** Cinema Pro: assinantes do Clube Bloop ou quem tem um Passe premium (Estelar, Musical ou Casa). */
export function isPro(): boolean {
  if (DEBUG_PRO) return true;
  try {
    return isPremium() || musicPremium() || homePremium();
  } catch {
    return false;
  }
}
export const maxSeconds = (): number => (isPro() ? PRO_MAX_SEC : FREE_MAX_SEC);
export const maxProjects = (): number => (isPro() ? Infinity : FREE_MAX_PROJECTS);

export type PaywallReason = '3d' | 'time' | 'projects' | 'item' | 'watermark' | 'face';

const REASON: Record<PaywallReason, () => string> = {
  '3d': () => t('cin.pw.3d', 'O modo 3D é do Cinema Pro.'),
  time: () => t('cin.pw.time', 'Filmes grátis vão até 60 segundos. No Pro, até 5 minutos!'),
  projects: () => t('cin.pw.projects', 'Você já tem 3 filmes. No Pro, filmes sem limite!'),
  item: () => t('cin.pw.item', 'Esse item é do Cinema Pro.'),
  watermark: () => t('cin.pw.watermark', 'Tirar a marca d’água é do Cinema Pro.'),
  face: () => t('cin.pw.face', 'Seu tempo de rosto de hoje acabou (o mesmo do Bloop Espelho). No Pro, grave com o rosto sem limite!'),
};

/** Aviso amigável do Pro. Não vende nada novo: aponta para o Clube e os Passes que já existem. */
export function paywall(reason: PaywallReason): void {
  if (document.querySelector('.cin-pw')) return;
  const el = document.createElement('div');
  el.className = 'cin-sheet-bg cin-pw';
  el.innerHTML = `
    <div class="cin-sheet" role="dialog" aria-modal="true">
      <div class="cin-pw-star">★</div>
      <h3>${t('cin.pw.title', 'Cinema Pro')}</h3>
      <p class="cin-pw-why">${REASON[reason]()}</p>
      <ul class="cin-pw-list">
        <li>🎥 ${t('cin.pw.f3d', 'Modo 3D com câmeras de cinema')}</li>
        <li>⏱️ ${t('cin.pw.flong', 'Vídeos de até 5 minutos')}</li>
        <li>📁 ${t('cin.pw.fproj', 'Filmes sem limite')}</li>
        <li>✨ ${t('cin.pw.fextra', 'Cenários, poses e efeitos extras')}</li>
        <li>💧 ${t('cin.pw.fwm', 'Marca d’água opcional')}</li>
      </ul>
      <p class="cin-pw-how">${t('cin.pw.how', 'Já vem junto com o Clube Bloop ou com qualquer Passe premium.')}</p>
      <div class="cin-row">
        <button class="cin-btn pri" data-a="club">${t('cin.pw.club', 'Ver Clube Bloop')}</button>
        <button class="cin-btn" data-a="pass">${t('cin.pw.pass', 'Ver Passes')}</button>
      </div>
      <button class="cin-btn ghost" data-a="no">${t('cin.pw.later', 'Agora não')}</button>
    </div>`;
  const close = () => {
    pop();
    el.remove();
  };
  const pop = pushBack(close);
  const born = performance.now();
  el.addEventListener('click', (e) => {
    if (performance.now() - born < 450) return;
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
    if (e.target === el || a === 'no') close();
    else if (a === 'club') {
      close();
      openClub();
    } else if (a === 'pass') {
      close();
      openPass();
    }
  });
  document.body.appendChild(el);
}

/**
 * Limpa um texto de balão/título com o filtro do chat: palavrões viram ###, contatos/links somem.
 * Mostra um aviso pequeno quando algo foi trocado.
 */
export function cleanText(s: string, max = 140): string {
  const r = maskLongText(s, max);
  if (r.pii) notify(t('cin.safe.pii', 'Sem contatos, links ou endereços nos filmes, tá?'), { kind: 'warn', icon: 'shield' });
  else if (r.filtered) notify(t('cin.safe.bad', 'Algumas palavras foram trocadas por ###.'), { kind: 'warn', icon: 'shield' });
  return r.text;
}
