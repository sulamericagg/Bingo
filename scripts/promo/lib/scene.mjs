// Captura genérica de QUALQUER tela do Bloop World (hub, minigames, bichinho, casa 2D/3D, passes...).
// Mesmo princípio do capture.mjs (Orbit): relógio virtual (rAF + performance.now), Math.random com semente,
// rede externa bloqueada, save de jogador veterano injetado. Cada quadro = screenshot -> ffmpeg.
import { spawn } from 'node:child_process';
import { SAVE_KEY, makeSave } from './capture.mjs';

export const GL_ARGS = ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];

/** Script injetado antes do carregamento da página. */
function vclockInit({ seed, save, key, css, extraLs }) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    if (!sessionStorage.getItem('__promoInit')) {
      sessionStorage.setItem('__promoInit', '1');
      localStorage.setItem(key, JSON.stringify(save));
      for (const [k, v] of Object.entries(extraLs || {})) localStorage.setItem(k, v);
    }
  } catch {}
  let vt = 1000;
  let id = 0;
  const q = new Map();
  window.requestAnimationFrame = (cb) => {
    q.set(++id, cb);
    return id;
  };
  window.cancelAnimationFrame = (i) => q.delete(i);
  // laços de "benchmark" (while performance.now() - t0 < X) travariam com o relógio parado:
  // depois de muitas leituras sem um passo do relógio, o tempo começa a andar devagar.
  let reads = 0;
  let drift = 0;
  performance.now = () => {
    if (++reads > 400) drift += 0.5;
    return vt + drift;
  };
  const clock = {
    auto: true,
    get t() {
      return vt;
    },
    step(ms) {
      vt += ms + drift;
      drift = 0;
      reads = 0;
      const cbs = [...q.values()];
      q.clear();
      for (const cb of cbs) {
        try {
          cb(vt);
        } catch (e) {
          console.error(e);
        }
      }
      if (window.__promoTick) window.__promoTick(ms);
    },
  };
  window.__vclock = clock;
  setInterval(() => {
    if (clock.auto) clock.step(16.67);
  }, 16);
  const all = `*{caret-color:transparent!important}` + (css || '');
  const addCss = () => {
    const st = document.createElement('style');
    st.id = '__promo-css';
    st.textContent = all;
    document.head.appendChild(st);
  };
  if (document.head) addCss();
  else document.addEventListener('DOMContentLoaded', addCss);
}

/** Abre uma página do app com relógio virtual. */
export async function openScene(browser, base, { url, w = 540, h = 960, dpr = 2, seed = 1, save = {}, css = '', extraLs = {}, locale = 'pt-BR' }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, locale, hasTouch: false });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => r.abort());
  await ctx.addInitScript(vclockInit, { seed, save: makeSave(save.skin ?? 'bloop', save.trail ?? 'rainbow', save), key: SAVE_KEY, css, extraLs });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const D = process.env.PROMO_DEBUG ? (...a) => console.log('[scene]', ...a) : () => {};
  await page.goto(`${base}/${url}`);
  D('goto ok');
  await page.waitForLoadState('load');
  D('load ok');
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]));
  D('fonts ok');
  return { ctx, page, errors };
}

/** Avança o relógio virtual `sec` segundos (renderizando), sem capturar. */
export async function run(page, sec, sub = 16.67) {
  await page.evaluate(
    ([sec, sub]) => {
      window.__vclock.auto = false;
      const n = Math.round((sec * 1000) / sub);
      for (let i = 0; i < n; i++) window.__vclock.step(sub);
    },
    [sec, sub],
  );
}

/** Deixa o relógio andar em tempo real (para carregamentos/transições CSS). */
export async function realtime(page, ms) {
  await page.evaluate(() => (window.__vclock.auto = true));
  await page.waitForTimeout(ms);
  await page.evaluate(() => (window.__vclock.auto = false));
}

/** Grava `sec` segundos a 30 qps. speed: multiplicador do relógio. onFrame(page, t) opcional. */
export async function recordScene(page, out, { sec, fps = 30, speed = 1, w, h, onFrame, sub = 2 }) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await page.evaluate(() => (window.__vclock.auto = false));
  const frames = Math.round(sec * fps);
  const ms = (1000 / fps) * speed;
  for (let f = 0; f < frames; f++) {
    if (onFrame) await onFrame(page, f / fps);
    await page.evaluate(
      ([ms, sub]) => {
        for (let i = 0; i < sub; i++) window.__vclock.step(ms / sub);
      },
      [ms, sub],
    );
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, animations: 'allow', caret: 'initial', scale: 'device' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  return out;
}
