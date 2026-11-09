// Captura de gameplay determinística: relógio virtual (rAF/performance.now), Math.random com semente,
// bot "humano" que mira no próximo planeta, câmera lenta automática em pousos perfeitos.
// Cada quadro é um screenshot JPEG enviado direto para o ffmpeg (sem arquivos temporários).
import { spawn } from 'node:child_process';

export const SAVE_KEY = 'bloop-orbit-save-v1';

export function makeSave(skin = 'bloop', trail = 'spark', extra = {}) {
  return {
    coins: 12840,
    gems: 365,
    best: 187,
    runs: 64,
    skin,
    trail,
    ownedSkins: [skin, 'bloop'],
    ownedTrails: [trail, 'spark'],
    sound: false,
    music: false,
    haptics: false,
    lowFx: false,
    noAds: true,
    starter: true,
    dailyDay: 99999,
    missionsDay: 99999,
    missions: [],
    tips: { asteroid: 99 },
    firstSeen: 1700000000000,
    ...extra,
  };
}

/** Script injetado antes do carregamento do jogo. Recebe { seed, save }. */
function initScript({ seed, save, key, extraCss }) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try {
    localStorage.setItem(key, JSON.stringify(save));
  } catch {}
  let vt = 1000;
  let id = 0;
  const q = new Map();
  window.requestAnimationFrame = (cb) => {
    q.set(++id, cb);
    return id;
  };
  window.cancelAnimationFrame = (i) => q.delete(i);
  performance.now = () => vt;
  const clock = {
    auto: true,
    get t() {
      return vt;
    },
    step(ms) {
      vt += ms;
      const cbs = [...q.values()];
      q.clear();
      for (const cb of cbs) cb(vt);
    },
  };
  window.__vclock = clock;
  setInterval(() => {
    if (clock.auto) {
      if (window.__botTick) window.__botTick(16.67);
      clock.step(16.67);
    }
  }, 16);

  // CSS: esconde tudo que não é marketing (botão de pausa, banners, toasts, avisos)
  const css = `#btn-pause,#toast,#banner-biome,#tutorial{display:none!important} *{caret-color:transparent!important}` + (extraCss || '');
  const addCss = () => {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  };
  if (document.head) addCss();
  else document.addEventListener('DOMContentLoaded', addCss);

  // ---------------- bot ----------------
  let r2 = (seed * 7919 + 13) >>> 0;
  const rnd = () => {
    r2 = (r2 * 1664525 + 1013904223) >>> 0;
    return r2 / 4294967296;
  };
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const bot = {
    enabled: false,
    nearMiss: 0.15,
    god: true,
    planFor: null,
    offset: 0,
    wait: 0,
    orbitT: 0,
    prevD: null,
    jumped: 0,
    lastPerfectPlan: false,
    eta: 9,
  };
  window.__bot = bot;
  window.__botTick = (ms) => {
    const B = window.__bloop;
    if (!bot.enabled || !B) return;
    const g = B.game;
    if (bot.god && !g.__godPatched) {
      g.__godPatched = true;
      g.trackPerf = () => {};
      // asteroides: o Bloop "atropela" em vez de morrer (fica bonito no vídeo)
      g.checkAsteroids = function () {
        if (this.landGrace > 0) return;
        for (const p of this.planets) {
          for (let i = p.asteroids.length - 1; i >= 0; i--) {
            const a = p.asteroids[i];
            const dx = p.x + Math.cos(a.ang) * a.dist - this.px;
            const dy = p.y + Math.sin(a.ang) * a.dist - this.py;
            const rr = a.size + 15 - 4;
            if (dx * dx + dy * dy < rr * rr) this.destroyAsteroid(p, i, 2);
          }
        }
      };
    }
    if (g.state !== 'play' || g.paused) return;
    if (g.pState !== 'orbit' || !g.planet) {
      bot.planFor = null;
      bot.eta = 9;
      return;
    }
    const p = g.planet;
    if (p.fragile && p.crackT > 2.4 * 0.7) p.crackT = 2.4 * 0.7;
    const n = g.nextTarget();
    if (!n) return;
    if (bot.planFor !== p) {
      bot.planFor = p;
      bot.orbitT = 0;
      bot.prevD = null;
      const miss = rnd() < bot.nearMiss;
      bot.offset = miss ? (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.15) : (rnd() - 0.5) * 0.12;
      bot.lastPerfectPlan = !miss;
      bot.wait = 0.12 + rnd() * 0.35;
    }
    bot.orbitT += ms / 1000;
    if (bot.orbitT < bot.wait) {
      bot.eta = 9;
      return;
    }
    const a = p.rot + g.local;
    const dx = n.x - g.px;
    const dy = n.y - g.py;
    const dist = Math.hypot(dx, dy);
    const perp = Math.max(-0.95, Math.min(0.95, (bot.offset * (n.r + 15)) / dist));
    const ang = Math.atan2(dy, dx) + Math.asin(perp);
    const d = wrap(a - ang);
    if (bot.prevD !== null && ms > 0) {
      const rate = wrap(d - bot.prevD) / (ms / 1000);
      bot.eta = Math.abs(rate) < 1e-3 ? 9 : -d / rate > 0 ? -d / rate : (2 * Math.PI - Math.abs(d)) / Math.abs(rate);
    }
    const crossed = bot.prevD !== null && Math.sign(d) !== Math.sign(bot.prevD) && Math.abs(d) < 0.3;
    bot.prevD = d;
    if (Math.abs(d) < 0.035 || crossed) {
      g.input();
      bot.jumped++;
    }
  };

  /** Estado resumido para o capturador decidir a câmera lenta. */
  window.__probe = () => {
    const B = window.__bloop;
    if (!B) return null;
    const g = B.game;
    let ttl = 99;
    if (g.state === 'play' && g.pState === 'fly') {
      const n = g.nextTarget();
      if (n) ttl = Math.max(0, Math.hypot(n.x - g.px, n.y - g.py) - n.r - 15) / Math.max(1, Math.hypot(g.vx, g.vy));
    }
    return { state: g.state, p: g.pState, ttl, perfectPlan: bot.lastPerfectPlan, perfects: g.perfects, score: g.score, biome: g.biomeIdx, ast: g.asteroidsRun, flyT: g.flyT };
  };
}

/** Prepara o mundo começando no planeta nº `startN` (20 planetas por bioma; 20k-2 => warp no clipe). */
function setupWorld({ startN, score }) {
  const g = window.__bloop.game;
  if (startN > 0) {
    const cur = g.planet;
    g.nGen = startN;
    const b = Math.floor(startN / 20);
    cur.biome = b;
    g.planets = [cur];
    g.pickups = [];
    for (let i = 0; i < 7; i++) g.planets.push(g.makePlanet(g.planets[g.planets.length - 1]));
    g.biomeIdx = b;
    g.bgPhase = b;
  }
  if (score) {
    g.score = score;
    g.speed = g.speedTarget();
    const el = document.querySelector('#hud-score');
    if (el) el.textContent = String(score);
  }
}

export async function openGame(browser, base, { w, h, dpr = 2, seed = 1, skin, trail, saveExtra, extraCss = '' }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1).*/, (r) => r.abort());
  await ctx.addInitScript(initScript, { seed, save: makeSave(skin, trail, saveExtra), key: SAVE_KEY, extraCss });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/index.html?debug`);
  await page.waitForFunction(() => !!window.__bloop, null, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

export async function startRun(page, { startN = 0, score = 0, nearMiss = 0.15 } = {}) {
  await page.click('#btn-play', { force: true });
  await page.waitForFunction(() => window.__bloop.game.state === 'play');
  await page.evaluate(
    ([o, setup]) => {
      window.__vclock.auto = false;
      // eslint-disable-next-line no-new-func
      new Function('o', `(${setup})(o)`)(o);
      window.__bot.enabled = true;
      window.__bot.nearMiss = o.nearMiss;
    },
    [{ startN, score, nearMiss }, setupWorld.toString()],
  );
}

/** Avança o jogo `sec` segundos sem capturar (rápido). */
export async function advance(page, sec, sub = 16.67) {
  await page.evaluate(
    ([sec, sub]) => {
      const g = window.__bloop.game;
      const r = g.render;
      g.render = () => {};
      const n = Math.round((sec * 1000) / sub);
      for (let i = 0; i < n; i++) {
        window.__botTick(sub);
        window.__vclock.step(sub);
      }
      g.render = r;
      window.__vclock.step(0.01);
    },
    [sec, sub],
  );
}

/** Avança (sem capturar) até o bot estar a `lead` s de um salto perfeito. */
export async function advanceToJump(page, lead = 0.35, maxSec = 12) {
  return page.evaluate(
    ([lead, maxSec]) => {
      const g = window.__bloop.game;
      const r = g.render;
      g.render = () => {};
      const sub = 16.67;
      let t = 0;
      // espera estar em órbita (pousado) antes de procurar o próximo salto
      while (t < maxSec * 1000 && g.pState !== 'orbit') {
        window.__botTick(sub);
        window.__vclock.step(sub);
        t += sub;
      }
      while (t < maxSec * 1000) {
        window.__botTick(sub);
        const b = window.__bot;
        if (g.pState === 'orbit' && b.lastPerfectPlan && b.eta < lead) break;
        window.__vclock.step(sub);
        t += sub;
      }
      g.render = r;
      window.__vclock.step(0.01);
      return t / 1000;
    },
    [lead, maxSec],
  );
}

/**
 * Grava `sec` segundos de vídeo (tempo do VÍDEO) para `out` (mp4 intermediário de alta qualidade).
 * ramp: 'auto' => câmera lenta em pousos perfeitos; número => velocidade fixa; função (t)=>vel.
 */
export async function recordClip(page, out, { sec, fps = 30, ramp = 1, base = 1.15, maxSlowmo = 2, slow = 0.3, w, h }) {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-vf', `scale=${w}:${h}:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-r', String(fps), out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  const frames = Math.round(sec * fps);
  const frameMs = 1000 / fps;
  let speed = typeof ramp === 'number' ? ramp : base;
  let slowHold = 0;
  let slowmos = 0;
  let lastSlow = -99;
  let probe = null;
  let died = -1;
  let prev = null;
  const ev = { perfect: [], biome: [], asteroid: [], slow: [] };
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    let target = base;
    if (typeof ramp === 'function') target = ramp(t);
    else if (typeof ramp === 'number') target = ramp;
    else if (ramp === 'auto') {
      if (probe && probe.p === 'fly' && probe.perfectPlan && probe.ttl < 0.22 && slowmos < maxSlowmo && t - lastSlow > 2.2 && t > 0.6 && t < sec - 1.2) {
        slowHold = 0.75;
        slowmos++;
        lastSlow = t;
      }
      target = slowHold > 0 ? slow : base;
    }
    if (slowHold > 0) slowHold -= 1 / fps;
    speed += (target - speed) * (target < speed ? 0.45 : 0.18);
    const gameMs = frameMs * speed;
    const subs = Math.max(1, Math.ceil(gameMs / 16.67));
    probe = await page.evaluate(
      ([ms, subs]) => {
        const g = window.__bloop.game;
        const r = g.render;
        for (let i = 0; i < subs; i++) {
          g.render = i < subs - 1 ? () => {} : r;
          window.__botTick(ms / subs);
          window.__vclock.step(ms / subs);
        }
        g.render = r;
        return window.__probe();
      },
      [gameMs, subs],
    );
    if (probe && probe.state !== 'play' && died < 0) died = f;
    if (probe && prev) {
      if (probe.perfects > prev.perfects) ev.perfect.push(t);
      if (probe.biome > prev.biome) ev.biome.push(t);
      if (probe.ast > prev.ast) ev.asteroid.push(t);
    }
    if (slowHold > 0 && ev.slow[ev.slow.length - 1] !== lastSlow) ev.slow.push(lastSlow);
    prev = probe;
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, animations: 'allow', caret: 'initial', scale: 'device' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await done;
  return { died: died < 0 ? -1 : died / fps, probe, ev };
}

/** Avança até um momento bonito e salva um PNG do tamanho do viewport×dpr.
 *  cond: 'perfect' | 'flight' | 'warp' | 'asteroid' */
export async function captureStill(page, cond, file, { after = 0.12, maxSec = 25 } = {}) {
  const ok = await page.evaluate(
    ([cond, after, maxSec]) => {
      const g = window.__bloop.game;
      const r = g.render;
      g.render = () => {};
      const sub = 16.67;
      const st = () => ({ p: g.perfects, b: g.biomeIdx, a: g.asteroidsRun });
      const s0 = st();
      let t = 0;
      let hit = false;
      while (t < maxSec * 1000) {
        window.__botTick(sub);
        window.__vclock.step(sub);
        t += sub;
        const s = st();
        if (cond === 'perfect' && s.p > s0.p) hit = true;
        else if (cond === 'warp' && s.b > s0.b) hit = true;
        else if (cond === 'asteroid' && s.a > s0.a && g.pState === 'orbit') hit = true;
        else if (cond === 'flight' && g.pState === 'fly' && g.flyT > 0.16 && window.__bot.lastPerfectPlan && t > 1500) hit = true;
        if (hit) break;
      }
      // fica alguns quadros renderizando (partículas/textos)
      const n = Math.round((after * 1000) / sub);
      g.render = r;
      for (let i = 0; i < Math.max(1, n); i++) {
        window.__botTick(sub);
        window.__vclock.step(sub);
      }
      return hit;
    },
    [cond, after, maxSec],
  );
  await page.screenshot({ path: file, type: 'png', scale: 'device' });
  return ok;
}
