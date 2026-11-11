/**
 * Orientação da tela. O app é retrato; as cenas 3D pedem paisagem.
 *
 * Android: o manifest fixa "portrait" (menu nunca gira, nem antes do JS subir) e o JS troca a
 * orientação pedida da Activity pelo plugin nativo BloopOrientation (setRequestedOrientation, que
 * SOBREPÕE o valor do manifest; fallback @capacitor/screen-orientation). configChanges inclui orientation|screenSize|screenLayout, então a
 * WebView não é recriada ao girar. A API web screen.orientation.lock não funciona na WebView sem
 * tela cheia, por isso no nativo usamos só o plugin.
 *
 * ensureLandscape(): pede paisagem, ESPERA o plugin, confere depois de ~800 ms se a tela girou de
 * verdade, tenta de novo ('landscape-primary'); se ainda assim ficar em pé mostra um aviso pequeno
 * (não bloqueia) com "Girar agora" / "Jogar em pé" (lembrado por jogo) e manda um relatório
 * automático (limitado) para o painel Beta, para sabermos em quais aparelhos falha.
 */
import { registerPlugin } from '@capacitor/core';
import { t } from '../i18n';
import { isNative } from './platform';

type Lock = 'portrait' | 'landscape' | 'any' | 'landscape-primary' | 'portrait-primary';
export interface LockResult {
  ok: boolean;
  err?: string;
}

/** Plugin nativo do próprio app (MainActivity): setRequestedOrientation na thread de UI;
 *  paisagem = SENSOR_LANDSCAPE, 'any' = FULL_USER. Fallback: @capacitor/screen-orientation. */
interface BloopOrientationPlugin {
  set(o: { mode: 'portrait' | 'landscape' | 'sensor' }): Promise<{ requested: number; current: string }>;
}
const Native = registerPlugin<BloopOrientationPlugin>('BloopOrientation');

async function plugin() {
  return (await import('@capacitor/screen-orientation')).ScreenOrientation;
}

/** últimas tentativas (diagnóstico: window.__bloopOrient no ?debug e nos relatórios) */
const trail: string[] = [];
function note(s: string): void {
  trail.push(`${Math.round(performance.now())}:${s}`);
  if (trail.length > 24) trail.shift();
}
export const orientationTrail = (): string[] => trail.slice();

/** Pede a orientação e ESPERA a resposta. Nunca lança. */
export async function lockOrientation(o: Lock): Promise<LockResult> {
  if (isNative) {
    const mode = o === 'any' ? 'sensor' : o.startsWith('landscape') ? 'landscape' : 'portrait';
    let err = '';
    try {
      const r = await withTimeout(Native.set({ mode }), 2000);
      note(`native ${mode} ok req=${r?.requested} cur=${r?.current}`);
      return { ok: true };
    } catch (e) {
      err = 'native:' + String((e as Error)?.message ?? e).slice(0, 80);
      note(`native ${mode} ERR ${err}`);
      console.warn('[orientation] nativo falhou, tentando plugin', e);
    }
    try {
      await withTimeout((await plugin()).lock({ orientation: o }), 2000);
      note(`plugin ${o} ok`);
      return { ok: true, err };
    } catch (e) {
      err += ' plugin:' + String((e as Error)?.message ?? e).slice(0, 80);
      note(`plugin ${o} ERR`);
      console.warn('[orientation] plugin falhou', o, e);
      return { ok: false, err };
    }
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (!so?.lock) return { ok: false, err: 'no-api' };
    await so.lock(o);
    note(`lock ${o} ok`);
    return { ok: true };
  } catch (e) {
    const err = String((e as Error)?.message ?? e).slice(0, 120);
    note(`lock ${o} ERR ${err}`);
    return { ok: false, err };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const tm = setTimeout(() => rej(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(tm), res(v)),
      (e) => (clearTimeout(tm), rej(e)),
    );
  });
}

/** Tipo informado pelo sistema (plugin no nativo; screen.orientation na web). */
export async function orientationType(): Promise<string> {
  try {
    if (isNative) return (await withTimeout((await plugin()).orientation(), 1000)).type;
  } catch {
    /* cai para a API web */
  }
  return screen.orientation?.type ?? '';
}

/** A tela está deitada agora? (sistema OU medidas da janela) */
export async function isLandscapeNow(): Promise<boolean> {
  if (innerWidth > innerHeight) return true;
  return (await orientationType()).startsWith('landscape');
}

/* ---------------- escolha "jogar em pé" por jogo ---------------- */
const PKEY = 'bw-portrait3d';
function portraitSet(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(PKEY) || '[]') as string[]);
  } catch {
    return new Set();
  }
}
export function prefersPortrait(game: string): boolean {
  return portraitSet().has(game);
}
export function setPrefersPortrait(game: string, on: boolean): void {
  const s = portraitSet();
  if (on) s.add(game);
  else s.delete(game);
  try {
    localStorage.setItem(PKEY, JSON.stringify([...s]));
  } catch {
    /* sem storage */
  }
}

/* ---------------- paisagem garantida ---------------- */
let seq = 0;
let prompt: HTMLElement | null = null;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type LandscapeOutcome = 'landscape' | 'portrait-chosen' | 'failed' | 'cancelled';

/**
 * Pede paisagem para `game` com verificação e nova tentativa. Cancelada por requestPortrait()
 * ou por outra chamada. Se o jogador escolheu "Jogar em pé" para esse jogo, não insiste.
 */
export async function ensureLandscape(game: string): Promise<LandscapeOutcome> {
  const my = ++seq;
  hidePrompt();
  if (prefersPortrait(game)) {
    note(`${game}: em pé (escolha)`);
    return 'portrait-chosen';
  }
  const tries: Lock[] = ['landscape', 'landscape-primary'];
  const fails: string[] = [];
  for (const o of tries) {
    const r = await lockOrientation(o);
    if (my !== seq) return 'cancelled';
    if (!r.ok) fails.push(`${o}:${r.err}`);
    // a rotação nativa leva um instante para refletir em innerWidth/innerHeight
    await wait(800);
    if (my !== seq) return 'cancelled';
    if (await isLandscapeNow()) {
      note(`${game}: paisagem`);
      return 'landscape';
    }
    // web sem a API (desktop): não adianta insistir nem avisar
    if (!isNative && r.err === 'no-api') return 'failed';
  }
  if (my !== seq) return 'cancelled';
  const type = await orientationType();
  note(`${game}: AINDA EM PÉ (${type} ${innerWidth}x${innerHeight})`);
  reportFailure(game, fails, type);
  // último recurso: libera o sensor para o jogador girar com a mão (o aviso explica)
  await lockOrientation('any');
  if (my !== seq) return 'cancelled';
  showPrompt(game, my);
  return 'failed';
}

/** Volta para o retrato padrão do app (menu e telas 2D). Cancela pedidos de paisagem pendentes. */
export function requestPortrait(): Promise<LockResult> {
  seq++;
  hidePrompt();
  return lockOrientation('portrait');
}
export function restorePortrait(): void {
  void requestPortrait();
}

function hidePrompt(): void {
  prompt?.remove();
  prompt = null;
}

function showPrompt(game: string, my: number): void {
  hidePrompt();
  ensureCss();
  const el = document.createElement('div');
  el.className = 'or-prompt';
  el.setAttribute('role', 'status');
  el.innerHTML = `<span class="or-ph"></span><b></b><button class="or-go"></button><button class="or-stay"></button>`;
  el.querySelector('b')!.textContent = t('orient.rotate', 'Gire o celular');
  const go = el.querySelector<HTMLButtonElement>('.or-go')!;
  const stay = el.querySelector<HTMLButtonElement>('.or-stay')!;
  go.textContent = t('orient.rotateNow', 'Girar agora');
  stay.textContent = t('orient.playPortrait', 'Jogar em pé');
  const onResize = () => {
    if (innerWidth > innerHeight) close();
  };
  const close = () => {
    removeEventListener('resize', onResize);
    if (prompt === el) hidePrompt();
  };
  addEventListener('resize', onResize);
  go.onclick = async () => {
    if (my !== seq) return close();
    go.disabled = true;
    await lockOrientation('landscape');
    await wait(800);
    go.disabled = false;
    if (await isLandscapeNow()) close();
  };
  stay.onclick = () => {
    setPrefersPortrait(game, true);
    close();
    void requestPortrait();
  };
  prompt = el;
  document.body.appendChild(el);
}

let css = false;
function ensureCss(): void {
  if (css) return;
  css = true;
  const s = document.createElement('style');
  s.textContent = `.or-prompt{position:fixed;left:50%;top:calc(env(safe-area-inset-top,0px) + 10px);transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 12px;border-radius:999px;background:rgba(20,10,40,.92);color:#fff;font:600 14px/1.2 var(--font,system-ui),sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.35);max-width:calc(100vw - 32px);white-space:nowrap}
.or-prompt b{font-weight:700}
.or-prompt button{all:unset;box-sizing:border-box;border-radius:999px;padding:7px 12px;font:700 13px/1 var(--font,system-ui),sans-serif;cursor:pointer;text-align:center}
.or-prompt .or-go{background:#ffd23f;color:#2a1450}.or-prompt .or-stay{background:rgba(255,255,255,.16);color:#fff}
.or-prompt button:disabled{opacity:.6}
.or-ph{flex:none;width:12px;height:19px;border:2px solid #fff;border-radius:4px;animation:orph 1.6s ease-in-out infinite}
@keyframes orph{0%,30%{transform:rotate(0)}60%,100%{transform:rotate(-90deg)}}
@media (max-width:380px){.or-prompt{white-space:normal;flex-wrap:wrap;justify-content:center;border-radius:18px}}`;
  document.head.appendChild(s);
}

/* ---------------- relatório automático (painel Beta) ---------------- */
const RKEY = 'bw-orient-report';
export function reportFailure(game: string, fails: string[], type: string): void {
  if (!isNative) return; // só aparelhos reais interessam ao painel
  try {
    const now = Date.now();
    const last = JSON.parse(localStorage.getItem(RKEY) || '{}') as Record<string, number>;
    // no máximo 1 por jogo a cada 12 h e 3 por dia no total
    const day = Object.values(last).filter((v) => now - v < 864e5).length;
    if (now - (last[game] ?? 0) < 432e5 || day >= 3) return;
    last[game] = now;
    localStorage.setItem(RKEY, JSON.stringify(last));
  } catch {
    return;
  }
  void (async () => {
    try {
      const { buildReport, submitReport } = await import('../services/feedback');
      const text =
        `[auto] Tela não girou para paisagem no 3D. jogo=${game} tipo=${type || '?'} janela=${innerWidth}x${innerHeight}` +
        ` falhas=${fails.join(',') || 'nenhuma (lock ok, mas continuou em pé)'} trilha=${trail.slice(-8).join(' | ')}`;
      await submitReport(buildReport('visual', text, false, 'auto-orient'));
    } catch (e) {
      console.warn('[orientation] relatório', e);
    }
  })();
}

if (typeof window !== 'undefined' && /[?&]debug\b/.test(location.search)) {
  (window as unknown as { __bloopOrient: unknown }).__bloopOrient = { trail: orientationTrail, prefersPortrait, setPrefersPortrait };
}
