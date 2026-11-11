/**
 * PAUSAS DE ANÚNCIO EM TODOS OS JOGOS (sem mexer em cada jogo) — docs/ANUNCIOS.md
 *
 *  - Intersticial nas pausas naturais dos minigames do hub:
 *      · depois do 'run-end' (reportRun), quando a tela de resultado já está na tela e o jogo
 *        diz que não há partida em andamento (inMatch() !== true);
 *      · ao sair do jogo para o hub (bus 'host-close'), se jogou um pouco.
 *    Sempre passando pelos limites globais de src/services/adpolicy.ts (AD_BREAKS em config.ts).
 *  - "Dobrar recompensa" padrão: cartão discreto no topo depois do 'run-end' de jogos que
 *    reportam moedas e não têm o próprio botão de vídeo no resultado. Nunca junto com intersticial.
 *  - offerRewarded(kind, onReward): API pequena para os jogos (+1 vida, continuar, dicas...)
 *    com teto diário por tipo.
 *  - Config remota (campo `ads` do GET /api/challenges) e envio opcional das estatísticas.
 *
 * O Orbit (jogo embutido, fora do game host) continua com as próprias pausas (src/ui/ui.ts),
 * que agora usam os mesmos limites globais.
 */
import { ONLINE } from '../config';
import { addCoins } from '../core/economy';
import { bus } from '../core/events';
import { isNative } from '../core/platform';
import type { RunReport } from '../hub/registry';
import { fmt, t } from '../i18n';
import { icon } from '../ui/icons';
import { notify } from '../ui/notify';
import {
  adGame,
  adLog,
  applyRemoteAdConfig,
  breaks,
  bump,
  closeResultWindow,
  flushAdStats,
  hostProbe,
  noteRun,
  openResultWindow,
  resultWindowAge,
  resultWindowOpen,
  rewardedCfg,
  rewardedLeft,
} from './adpolicy';
import { maybeInterstitial, rewardedAvailable, scheduleBanner, showRewarded } from './ads';

/* ============================== API para os jogos ============================== */

export type RewardKind = 'double' | 'life' | 'continue' | 'hint' | (string & {});

/** Ainda dá para oferecer um vídeo desse tipo hoje? (use para mostrar/esconder o botão) */
export function canOfferRewarded(kind: RewardKind): boolean {
  return rewardedAvailable() && rewardedLeft(kind) > 0;
}

/**
 * Mostra um vídeo premiado opcional e chama `onReward` só se o jogador assistiu até o fim.
 * Respeita o teto diário do tipo (AD_REWARDED.dailyCaps). Resolve true quando recompensou.
 *
 *   if (canOfferRewarded('life')) botao.hidden = false;
 *   botao.onclick = () => offerRewarded('life', () => this.revive());
 */
export async function offerRewarded(kind: RewardKind, onReward: () => void, opts: { quiet?: boolean } = {}): Promise<boolean> {
  if (rewardedLeft(kind) <= 0) {
    adLog(`premiado ${kind}: teto diário atingido`, 'skip');
    if (!opts.quiet) notify(t('ads.capReached', 'Limite de vídeos de hoje atingido'), { icon: 'video', kind: 'warn' });
    return false;
  }
  const ok = await showRewarded(kind);
  if (!ok) {
    if (!opts.quiet) notify(t('ads.videoUnavailable', 'Vídeo indisponível agora'), { icon: 'video', kind: 'warn' });
    return false;
  }
  try {
    onReward();
  } catch (e) {
    console.warn('[ads] onReward', e);
  }
  return true;
}

/* ============================== pausas ============================== */

let runEndAt = 0;
let lastRewardStart = 0;
let offerEl: HTMLElement | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** O minigame aberto está numa pausa segura agora? (resultado/menu, não jogando) */
function safeBreak(game: string): boolean {
  const p = hostProbe();
  if (!p?.active || p.game !== game) return false;
  if (p.confirm) return false;
  if (p.inMatch === true) return false; // o jogo emendou outra partida
  if (document.querySelector('.fake-ad, .ob-root')) return false;
  return true;
}

async function onRunEnd(r: RunReport): Promise<void> {
  const p = hostProbe();
  noteRun(r.game);
  // Orbit e corrida do Orbit têm as próprias pausas (src/ui/ui.ts); aqui só os minigames do game host
  if (!p?.active || !p.game) return;
  const game = p.game;
  const at = (runEndAt = Date.now());
  openResultWindow();
  scheduleBanner();
  await sleep(breaks.runEndDelayMs);
  if (runEndAt !== at || !safeBreak(game)) return adLog(`run-end ${game}: não é pausa segura`, 'skip');
  if (lastRewardStart >= at) return adLog(`run-end ${game}: o jogo já ofereceu vídeo`, 'skip');
  if (breaks.exitOnlyGames.includes(game)) {
    adLog(`run-end ${game}: só na saída (rodadas emendadas)`, 'skip');
  } else if (await maybeInterstitial({ game, reason: 'run-end' })) return;
  // sem intersticial nesta pausa → oferta opcional de dobrar (nunca os dois juntos)
  if (runEndAt !== at || !safeBreak(game)) return;
  offerDouble(game, r);
}

async function onHostClose(c: { game: string; playedSec: number; runs: number }): Promise<void> {
  closeResultWindow();
  hideOffer();
  if (!c?.game) return;
  await sleep(450); // o hub já voltou para a tela
  if (document.querySelector('#game-host.on')) return; // abriu outro jogo
  await maybeInterstitial({ game: c.game, reason: 'exit', playedSec: c.playedSec, runsThisVisit: c.runs });
}

/* ============================== "Dobrar recompensa" ============================== */

const OFFER_CSS = `
.ad-offer{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translate(-50%,-140%);z-index:2147482000;
  width:min(92vw,360px);display:flex;align-items:center;gap:10px;padding:10px 10px 10px 12px;border-radius:18px;
  background:linear-gradient(180deg,#3b1f7a,#24124f);color:#fff;box-shadow:0 0 0 2px #ffcf3f,0 10px 28px rgba(0,0,0,.45);
  font:600 14px/1.2 inherit;transition:transform .35s cubic-bezier(.2,1.4,.4,1)}
.ad-offer.on{transform:translate(-50%,0)}
.ad-offer .ao-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:#ffcf3f;color:#3a2600}
.ad-offer .ao-tx{flex:1;min-width:0}
.ad-offer b{display:block;font-size:15px}
.ad-offer small{display:block;opacity:.85;font-size:12px;margin-top:2px}
.ad-offer .ao-go{flex:none;border:0;border-radius:12px;padding:9px 12px;background:#2fd16b;color:#05301a;font:800 13px/1 inherit;display:flex;gap:4px;align-items:center;cursor:pointer}
.ad-offer .ao-go:disabled{opacity:.6}
.ad-offer .ao-x{flex:none;border:0;background:transparent;color:#fff;opacity:.7;width:28px;height:28px;display:grid;place-items:center;cursor:pointer;padding:0}
.ad-offer .ao-bar{position:absolute;left:14px;right:14px;bottom:4px;height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden}
.ad-offer .ao-bar i{display:block;height:100%;background:#ffcf3f;transform-origin:left;animation:ao-t var(--ao-t,9s) linear forwards}
@keyframes ao-t{to{transform:scaleX(0)}}`;

let hideT = 0;
function hideOffer(): void {
  clearTimeout(hideT);
  const el = offerEl;
  offerEl = null;
  if (!el) return;
  el.classList.remove('on');
  setTimeout(() => el.remove(), 350);
}

function offerDouble(game: string, r: RunReport): void {
  if (rewardedCfg.ownDoubleGames.includes(game)) return;
  const coins = Math.round(r.coins || 0);
  if (coins <= 0 && !r.won) return adLog(`dobrar ${game}: sem moedas na partida`, 'skip');
  if (!canOfferRewarded('double')) return adLog(`dobrar ${game}: teto diário/sem vídeo`, 'skip');
  const bonus = Math.max(rewardedCfg.doubleMinCoins, Math.min(rewardedCfg.doubleMaxCoins, coins));
  if (bonus <= 0) return;
  hideOffer();
  if (!document.getElementById('ad-offer-css')) {
    const s = document.createElement('style');
    s.id = 'ad-offer-css';
    s.textContent = OFFER_CSS;
    document.head.appendChild(s);
  }
  const el = document.createElement('div');
  el.className = 'ad-offer';
  el.setAttribute('role', 'dialog');
  el.style.setProperty('--ao-t', `${rewardedCfg.doubleShowSec}s`);
  el.innerHTML = `<div class="ao-ic">${icon('coin', { size: 26 })}</div>
    <div class="ao-tx"><b>${t('ads.dbl.title', 'Dobrar recompensa')}</b><small>${t('ads.dbl.sub', '+{n} moedas com um vídeo curtinho', { n: fmt(bonus) })}</small></div>
    <button class="ao-go">${icon('video', { size: 18 })}${t('ads.dbl.watch', 'Assistir')}</button>
    <button class="ao-x" aria-label="${t('ads.dbl.no', 'Agora não')}">${icon('close', { size: 16 })}</button>
    <div class="ao-bar"><i></i></div>`;
  // toques no cartão não contam como "voltou a jogar"
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(el);
  offerEl = el;
  void el.offsetWidth;
  el.classList.add('on');
  bump(game, 'offer_double');
  adLog(`oferta "Dobrar" (+${bonus}) em ${game}`, 'info');
  const go = el.querySelector<HTMLButtonElement>('.ao-go')!;
  el.querySelector<HTMLButtonElement>('.ao-x')!.onclick = () => hideOffer();
  go.onclick = async () => {
    go.disabled = true;
    clearTimeout(hideT);
    const ok = await offerRewarded('double', () => {
      addCoins(bonus);
      bump(game, 'double_coins', bonus);
      notify(t('ads.dbl.done', '+{n} moedas! Recompensa dobrada', { n: fmt(bonus) }), { icon: 'coin', kind: 'good' });
    });
    if (!ok) go.disabled = false;
    hideOffer();
  };
  hideT = window.setTimeout(hideOffer, rewardedCfg.doubleShowSec * 1000);
}

/* ============================== remoto / estatísticas ============================== */

function apiUrl(path: string): string {
  const base = (ONLINE.apiBase || (isNative ? ONLINE.nativeApiBase : '')).replace(/\/+$/, '');
  return `${base}/api${path}`;
}
function playerId(): string {
  try {
    return JSON.parse(localStorage.getItem('bo-player') || '{}').id || '';
  } catch {
    return '';
  }
}

async function fetchRemote(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ONLINE.timeoutMs);
  try {
    const res = await fetch(apiUrl('/challenges'), { signal: ctrl.signal });
    if (!res.ok) return;
    const data = (await res.json()) as { ads?: unknown };
    if (data && data.ads) applyRemoteAdConfig(data.ads);
  } catch {
    /* offline: fica com os padrões */
  } finally {
    clearTimeout(timer);
  }
  const id = playerId();
  if (id)
    await flushAdStats(async (path, body) => {
      const r = await fetch(apiUrl(path), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(String(r.status));
    }, id);
}

/* ============================== init ============================== */

let started = false;
export function initAdBreaks(): void {
  if (started) return;
  started = true;
  bus.on('run-end', (r: RunReport) => void onRunEnd(r));
  bus.on('host-close', (c: { game: string; playedSec: number; runs: number }) => void onHostClose(c));
  bus.on('host-open', () => {
    closeResultWindow();
    hideOffer();
  });
  bus.on('rewarded-start', () => {
    lastRewardStart = Date.now();
  });
  // primeiro toque depois do resultado = o jogador seguiu (de novo/menu): banner reavalia já
  bus.on('host-input', () => {
    if (resultWindowOpen() && resultWindowAge() > 800) {
      closeResultWindow();
      scheduleBanner();
    }
  });
  window.setTimeout(() => void fetchRemote(), 8000);
  adLog(`anúncios: pausas centrais ligadas (${adGame()})`, 'info');
}
