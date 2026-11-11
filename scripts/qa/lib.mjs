// Bloop World — QA helpers (Playwright). Usado por scripts/qa/*.mjs  (npm run qa)
// Playwright vem do node_modules local ou do global (/opt/node22/lib/node_modules).
import { createRequire } from 'node:module';
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SHOTS = process.env.QA_SHOTS || join(ROOT, 'shots-qa');
mkdirSync(SHOTS, { recursive: true });

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try { return req('playwright'); } catch { /* global */ }
  let g = '/opt/node22/lib/node_modules';
  try { g = execSync('npm root -g').toString().trim(); } catch { /* default */ }
  return createRequire(join(g, 'noop.js'))('playwright');
}
export const pw = loadPlaywright();
export const { chromium, devices } = pw;

export const URL = process.env.QA_URL || 'http://127.0.0.1:5310/';
export const PROFILES = {
  pixel: { ...devices['Pixel 7'], deviceScaleFactor: 1 },
  land844: { viewport: { width: 844, height: 390 }, screen: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent },
  land740: { viewport: { width: 740, height: 360 }, screen: { width: 740, height: 360 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent },
  land915: { viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, userAgent: devices['Pixel 7'].userAgent },
};

// Ruído esperado num navegador sem backend / GPU por software
const NOISE = /Failed to load resource|ERR_CONNECTION|ERR_NAME|net::|WebSocket|GPU stall|GL Driver|swiftshader|AudioContext|the server responded with a status of|\[ads\]|AdMob|adsbygoogle|speechSynthesis|ReadPixels|GroupMarkerNotSet|Automatic fallback to software WebGL|THREE\.WebGLRenderer: Context Lost|getUserMedia|NotAllowedError|Permission|geolocation|serviceWorker|\/api\//i;

let browser = null;
export async function getBrowser() {
  if (browser) return browser;
  browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--js-flags=--expose-gc', '--disable-renderer-backgrounding'],
  });
  return browser;
}
export async function closeBrowser() { if (browser) { await browser.close().catch(() => {}); browser = null; } }

const STATE_FILE = join(SHOTS, '.qa-state.json');

/** Abre uma página no perfil pedido. opts: { fresh, throttle, q, locale, url } */
export async function open(profile = 'pixel', opts = {}) {
  const b = await getBrowser();
  const ctxOpts = { ...PROFILES[profile], locale: opts.locale || 'pt-BR', permissions: ['microphone', 'camera', 'geolocation'], geolocation: { latitude: -23.55, longitude: -46.63 } };
  if (!opts.fresh && existsSync(STATE_FILE)) ctxOpts.storageState = STATE_FILE;
  const ctx = await b.newContext(ctxOpts);
  if (opts.lang) await ctx.addInitScript((l) => { try { localStorage.setItem('bo-lang', l); } catch {} }, opts.lang);
  await ctx.addInitScript(() => {
    // o log de anúncios do ?debug não aparece para o jogador; tira das capturas
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.ads-dbg{display:none!important}'; document.head.appendChild(s); });
    // contexto de áudio: quantos existem e quantos seguem tocando
    const AC = window.AudioContext;
    if (AC) { const all = []; window.AudioContext = function (...a) { const c = new AC(...a); all.push(c); return c; }; window.AudioContext.prototype = AC.prototype; window.__qaAudio = () => ({ total: all.length, running: all.filter((c) => c.state === 'running').length }); }
  });
  if (opts.gl !== false) await trackGL(ctx);
  const page = await ctx.newPage();
  if (opts.rotate) {
    // rotação simulada: screen.orientation.lock() do app vira um resize da janela (como o aparelho girando)
    const sizes = opts.rotate;
    await page.exposeFunction('__qaRotate', async (o) => {
      const want = /landscape/.test(o) ? sizes.landscape : /portrait/.test(o) ? sizes.portrait : null;
      if (want) await page.setViewportSize({ width: want[0], height: want[1] }).catch(() => {});
      page.__qaLocks = (page.__qaLocks || []).concat(o);
    });
    await ctx.addInitScript(() => {
      const so = screen.orientation;
      if (so) {
        so.lock = (o) => window.__qaRotate(o);
        so.unlock = () => {};
        try { Object.defineProperty(so, 'type', { get: () => (innerWidth > innerHeight ? 'landscape-primary' : 'portrait-primary') }); } catch { /* ok */ }
      }
    });
  }
  const errs = [];
  const warns = [];
  page.on('console', (m) => {
    const t = m.text();
    if (NOISE.test(t)) return;
    if (m.type() === 'error') errs.push('console.error: ' + t.slice(0, 400));
    else if (m.type() === 'warning') warns.push(t.slice(0, 300));
  });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.stack || e.message).slice(0, 600)));
  const cdp = await ctx.newCDPSession(page);
  if (opts.throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.throttle });
  const base = opts.url || URL;
  await page.goto(base + (base.includes('?') ? '&' : '?') + 'debug' + (opts.q || ''), { waitUntil: 'load' });
  return { ctx, page, errs, warns, cdp };
}

/** Espera o hub (#menu.on) e o __bloop do ?debug. Passa pelo onboarding da 1ª abertura. */
export async function waitHub(page, { nick = 'Tester' } = {}) {
  for (let i = 0; i < 120; i++) {
    const st = await page.evaluate(() => ({ hub: !!document.querySelector('#menu.on'), ob: !!document.querySelector('.ob-root'), dbg: !!window.__bloop, intro: !!document.querySelector('.bo-intro, .gfxc') }));
    if (st.ob) {
      const nickEl = await page.$('#ob-nick');
      if (nickEl && nick) { await nickEl.fill(nick).catch(() => {}); }
      await page.waitForTimeout(600);
      const later = await page.$('#ob-later');
      if (later && await later.isVisible()) await later.click({ force: true }).catch(() => {});
      await page.waitForTimeout(800);
      continue;
    }
    if (st.hub && st.dbg && !st.intro) { await page.waitForTimeout(700); return true; }
    if (st.intro && i > 2) await page.touchscreen.tap(20, 200).catch(() => {}); // pula a abertura
    await page.waitForTimeout(500);
  }
  return false;
}

/** Cria o perfil-base (onboarding + teste da GPU feitos) e guarda o storageState. */
export async function ensureBaseState(force = false) {
  if (!force && existsSync(STATE_FILE)) return;
  const { ctx, page } = await open('pixel', { fresh: true });
  const ok = await waitHub(page, { nick: 'Tester' });
  if (!ok) throw new Error('hub não abriu na 1ª execução');
  await page.evaluate(() => { const s = window.__bloop.save; s.coins = 50000; s.gems = 500; });
  await page.waitForTimeout(1500);
  await ctx.storageState({ path: STATE_FILE });
  await ctx.close();
}

export async function shot(page, name) {
  const p = join(SHOTS, name.replace(/[^\w.-]+/g, '_') + '.png');
  await page.screenshot({ path: p }).catch(() => {});
  return p.replace(ROOT + '/', '');
}
export async function back(page) { return page.evaluate(() => window.__bloop.ui.back()); }

export async function tapAt(page, x, y) { await page.touchscreen.tap(x, y); }
export async function tapSel(page, sel) {
  const el = typeof sel === 'string' ? await page.$(sel) : sel;
  if (!el) return false;
  const bb = await el.boundingBox();
  if (!bb) return false;
  await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
  return true;
}
/** arrasto multi-ponto por CDP (joystick, câmera) */
export async function drag(cdp, from, to, steps = 12, stepMs = 25, id = 1) {
  const tp = (x, y) => [{ x, y, id, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(from[0], from[1]) });
  for (let i = 1; i <= steps; i++) {
    const x = from[0] + (to[0] - from[0]) * i / steps, y = from[1] + (to[1] - from[1]) * i / steps;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(x, y) });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
/** segura o joystick numa direção por ms */
export async function hold(cdp, from, to, ms = 1200) {
  const tp = (x, y) => [{ x, y, id: 7, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(from[0], from[1]) });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6) }); await new Promise((r) => setTimeout(r, 30)); }
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(to[0], to[1] + ((Date.now() / 50) % 2)) }); await new Promise((r) => setTimeout(r, 100)); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Contadores de recursos para achar vazamentos (canvas, contextos WebGL vivos, heap, áudio) */
export async function resources(page, cdp) {
  try { await cdp.send('HeapProfiler.collectGarbage'); } catch { /* ok */ }
  const r = await page.evaluate(() => ({
    canvases: document.querySelectorAll('canvas').length,
    nodes: document.getElementsByTagName('*').length,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    audios: document.querySelectorAll('audio,video').length,
    glLive: window.__qaGL ? window.__qaGL.live() : -1,
    glAttached: window.__qaGL ? window.__qaGL.attached() : -1,
  }));
  try { const m = await cdp.send('Performance.getMetrics'); const g = (n) => (m.metrics.find((x) => x.name === n) || {}).value; r.listeners = g('JSEventListeners'); r.docs = g('Documents'); } catch { /* ok */ }
  return r;
}
/** Instala um contador de contextos WebGL (antes do app carregar). */
export async function trackGL(ctx) {
  await ctx.addInitScript(() => {
    // WeakRef: um contexto que o jogo largou e o coletor de lixo levou não conta como vivo
    const live = [];
    const seen = new WeakSet();
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...a) {
      const c = orig.call(this, type, ...a);
      if (c && /webgl/.test(String(type)) && !seen.has(c)) { seen.add(c); live.push({ c: new WeakRef(c), cv: new WeakRef(this) }); }
      return c;
    };
    window.__qaGL = {
      live: () => live.filter((x) => { const c = x.c.deref(); return c && !c.isContextLost(); }).length,
      attached: () => live.filter((x) => { const c = x.c.deref(); const cv = x.cv.deref(); return c && !c.isContextLost() && cv && cv.isConnected; }).length,
    };
  });
}

/** Elementos clicáveis fora da tela, tapados ou embaixo do banner; texto cortado. */
export async function audit(page, rootSel = 'body') {
  return page.evaluate((rootSel) => {
    const out = [];
    const W = innerWidth, H = innerHeight;
    const root = document.querySelector(rootSel) || document.body;
    const visible = (el) => { let p = el; while (p && p !== document.documentElement) { const c = getComputedStyle(p); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false; p = p.parentElement; } return true; };
    const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ([...el.classList].slice(0, 2).map((c) => '.' + c).join('')) + ' "' + (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 22) + '"';
    const btns = [...root.querySelectorAll('button, [role=button], .btn, a[href]')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 3 && r.height > 3 && visible(el); });
    for (const el of btns) {
      const r = el.getBoundingClientRect();
      let scroll = false; let p = el.parentElement;
      while (p) { const c = getComputedStyle(p); if (/(auto|scroll)/.test(c.overflowX + c.overflowY)) { scroll = true; break; } if (/(hidden|clip)/.test(c.overflowX + c.overflowY)) { const pr = p.getBoundingClientRect(); if (r.left >= pr.right - 1 || r.right <= pr.left + 1 || r.top >= pr.bottom - 1 || r.bottom <= pr.top + 1) { scroll = true; break; } } p = p.parentElement; }
      if (!scroll && (r.right > W + 1 || r.bottom > H + 1 || r.left < -1 || r.top < -1)) out.push(`CUT ${name(el)} [${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}]`);
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > W || cy > H || scroll) continue;
      const hit = document.elementFromPoint(cx, cy);
      if (hit && !el.contains(hit) && !hit.contains(el) && hit.tagName !== 'CANVAS') out.push(`BLOCKED ${name(el)} by ${name(hit)}`);
    }
    // sobreposição entre botões (HUD)
    for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
      const a = btns[i].getBoundingClientRect(), b = btns[j].getBoundingClientRect();
      if (btns[i].contains(btns[j]) || btns[j].contains(btns[i])) continue;
      const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ix > 8 && iy > 8 && ix * iy > 0.25 * Math.min(a.width * a.height, b.width * b.height)) out.push(`OVERLAP ${name(btns[i])} x ${name(btns[j])}`);
    }
    for (const el of root.querySelectorAll('h1,h2,h3,h4,b,small,span,p,div,button,label')) {
      if (el.children.length > 0 && el.tagName !== 'BUTTON') continue;
      const t = (el.textContent || '').trim(); if (!t || t.length < 2) continue;
      const r = el.getBoundingClientRect(); if (r.width < 4 || !visible(el)) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 4 && cs.textOverflow !== 'ellipsis' && cs.overflow !== 'visible' && cs.overflowX !== 'visible') out.push(`TEXTCLIP "${t.slice(0, 30)}"`);
      if (/undefined|NaN|\[object|\{\{|^[a-z]+\.[a-zA-Z]+\.[a-zA-Z.]+$/.test(t) && t.length < 80) out.push(`BADTEXT "${t.slice(0, 40)}"`);
    }
    return [...new Set(out)];
  }, rootSel);
}

/** Botões de debug visíveis (joaninha/beta, fps, etc.) */
export async function debugUi(page) {
  return page.evaluate(() => [...document.querySelectorAll('button, [role=button], .fps, [class*=debug], [id*=debug], [class*=beta-bug], [class*=bug]')]
    .filter((el) => { const r = el.getBoundingClientRect(); const c = getComputedStyle(el); return r.width > 3 && c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05; })
    .filter((el) => /debug|bug|🐞|fps|beta/i.test((el.className || '') + ' ' + el.id + ' ' + (el.textContent || '').slice(0, 20) + ' ' + (el.getAttribute('aria-label') || '')))
    .map((el) => (el.id || el.className || el.tagName).toString().slice(0, 50) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 20) + '"'));
}

export async function fps(page, ms = 3000) {
  return page.evaluate((ms) => new Promise((res) => {
    let n = 0; const t0 = performance.now(); let worst = 0; let last = t0;
    const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res({ fps: Math.round(n * 1000 / (t - t0)), worstMs: Math.round(worst) }); };
    requestAnimationFrame(f);
  }), ms);
}

export function writeJSON(name, data) { writeFileSync(join(SHOTS, name), JSON.stringify(data, null, 2)); }
export function readJSON(name) { try { return JSON.parse(readFileSync(join(SHOTS, name), 'utf8')); } catch { return null; } }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
