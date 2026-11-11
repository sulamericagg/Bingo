/* ============================================================
 *  Tela "Ajustando os gráficos pro seu aparelho…" (mascote + barra).
 *  Fica por cima de tudo enquanto src/core/devicecheck.ts mede o aparelho.
 *  O mascote é desenhado UMA vez e pula por CSS (compositor): não disputa
 *  o processador/GPU com o teste.
 * ============================================================ */
import { SplashScreen } from '@capacitor/splash-screen';
import { runDeviceCheck, type DeviceCheckResult } from '../core/devicecheck';
import { bus } from '../core/events';
import { isNative } from '../core/platform';
import { skinById } from '../game/skins';
import { drawPlayer } from '../game/character';
import { t } from '../i18n';
import { tierName } from './gfx-settings';

const CSS = `
.gfxc{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px 16px;box-sizing:border-box;
  background:radial-gradient(120% 80% at 50% 30%,#2a1466 0%,#140a3a 55%,#0b0620 100%);color:#fff;font-family:'Fredoka',system-ui,sans-serif;text-align:center;transition:opacity .28s;touch-action:none;user-select:none}
.gfxc.out{opacity:0}
.gfxc-mascot{width:132px;height:132px;animation:gfxc-hop 0.9s cubic-bezier(.3,.7,.4,1) infinite alternate;filter:drop-shadow(0 10px 18px rgba(94,240,255,.25))}
.gfxc-shadow{width:84px;height:14px;margin-top:-14px;border-radius:50%;background:rgba(0,0,0,.35);animation:gfxc-sh 0.9s cubic-bezier(.3,.7,.4,1) infinite alternate}
@keyframes gfxc-hop{from{transform:translateY(0) scale(1.06,.94)}to{transform:translateY(-26px) scale(.97,1.03)}}
@keyframes gfxc-sh{from{transform:scale(1);opacity:.9}to{transform:scale(.7);opacity:.5}}
.gfxc h1{margin:8px 0 0;font-size:clamp(20px,5.6vw,28px);font-weight:700;line-height:1.2;max-width:min(92vw,440px);text-shadow:0 3px 0 rgba(20,5,60,.6)}
.gfxc p{margin:0;font-size:16px;font-weight:500;opacity:.8;min-height:1.3em}
.gfxc-bar{width:min(78vw,340px);height:22px;border-radius:999px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.22);overflow:hidden;box-sizing:border-box}
.gfxc-bar i{display:block;height:100%;width:4%;border-radius:999px;background:linear-gradient(90deg,#5ef0ff,#8a5cff 60%,#ff5cc8);box-shadow:inset 0 2px 0 rgba(255,255,255,.45);transition:width .18s linear}
.gfxc-gear{display:inline-block;animation:gfxc-spin 1.6s linear infinite}
@keyframes gfxc-spin{to{transform:rotate(360deg)}}
.gfxc.done .gfxc-bar i{background:linear-gradient(90deg,#3ee07a,#a8ffc6)}
@media (prefers-reduced-motion:reduce){.gfxc-mascot,.gfxc-shadow,.gfxc-gear{animation:none}}
`;

function mascot(size: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = Math.round(size * dpr);
  cv.className = 'gfxc-mascot';
  try {
    const x = cv.getContext('2d')!;
    x.scale(dpr, dpr);
    x.translate(size / 2, size * 0.56);
    drawPlayer(x, skinById('bloop'), size * 0.28, { t: 0.4, blink: 0, lookX: 0.1, lookY: -0.15, sx: 1, sy: 1, mood: 'happy', lx: -0.6, ly: -0.8, still: true });
  } catch {
    /* sem mascote: segue só com a barra */
  }
  return cv;
}

/**
 * Mostra a tela, roda o teste e some. `retest`: veio do Ajustes (texto diferente, sem splash).
 * Resolve sempre (o teste nunca lança).
 */
export async function showDeviceCheck(opts: { retest?: boolean } = {}): Promise<DeviceCheckResult> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.className = 'gfxc';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  const title = document.createElement('h1');
  const sub = document.createElement('p');
  let finished = false;
  const texts = () => {
    title.textContent = t('gfxcheck.title', 'Ajustando os gráficos pro seu aparelho…');
    if (!finished) sub.textContent = opts.retest ? t('gfxcheck.subRetest', 'Testando de novo…') : t('gfxcheck.sub', 'Só na primeira vez. Já já a gente brinca!');
  };
  texts();
  // 1ª abertura em outro idioma: o dicionário chega alguns ms depois
  const offLang = bus.on('lang', texts);
  const bar = document.createElement('div');
  bar.className = 'gfxc-bar';
  const fill = document.createElement('i');
  bar.appendChild(fill);
  const sh = document.createElement('div');
  sh.className = 'gfxc-shadow';
  root.append(mascot(132), sh, title, bar, sub);
  document.body.appendChild(root);
  if (isNative && !opts.retest) SplashScreen.hide({ fadeOutDuration: 150 }).catch(() => {});

  // deixa a tela pintar antes de começar a medir
  await new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  let shown = 0.04;
  const res = await runDeviceCheck({
    onProgress: (f) => {
      if (f > shown) {
        shown = f;
        fill.style.width = Math.round(Math.max(4, f * 100)) + '%';
      }
    },
  });
  fill.style.width = '100%';
  root.classList.add('done');
  finished = true;
  sub.textContent = t('gfxcheck.done', 'Pronto! Gráficos: {tier}', { tier: tierName(res.tier) });
  await new Promise((r) => setTimeout(r, 650));
  root.classList.add('out');
  await new Promise((r) => setTimeout(r, 300));
  offLang();
  root.remove();
  style.remove();
  return res;
}
