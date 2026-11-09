#!/usr/bin/env node
/**
 * Pipeline completo de material promocional do BLOOP WORLD (hub com 6 jogos + bichinho, casa, passes,
 * criaturas), gerado a partir do app real. Vídeos + imagens de loja/redes + ícone alternativo.
 *
 *   NODE_PATH=$(npm root -g) node scripts/promo/make-all.mjs <outDir> [--only=videos|images] [--keep-tmp] [--jobs=3]
 *
 * Requer: Playwright (global ou local) + Chromium, ffmpeg com libx264/aac. Ver docs/PROMO.md.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer } from './lib/server.mjs';
import { openGame, startRun, advanceToJump, recordClip } from './lib/capture.mjs';
import { openScene, recordScene, run, GL_ARGS } from './lib/scene.mjs';
import { RECIPES, EXTRA_LS, CLEAN_CSS } from './lib/recipes.mjs';
import { openPromo, renderTo, renderBuf } from './lib/render.mjs';
import { chain, overlays, horizontalize, finalize, seamless, probe, ff } from './lib/edit.mjs';
import { genMusic } from './lib/music.mjs';
import { L10N } from './l10n.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');

const argv = process.argv.slice(2);
const flag = (k) => argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`))?.split('=')[1] ?? (argv.includes(`--${k}`) ? true : undefined);
const OUT = path.resolve(argv.find((a) => !a.startsWith('--')) ?? 'promo-out');
const ONLY = flag('only');
const JOBS = Number(flag('jobs') ?? 3);
const KEEP = !!flag('keep-tmp');
const TMP = path.join(OUT, '.tmp');
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(0).padStart(4)}s]`, ...a);
const warnings = [];
const warn = (m) => {
  warnings.push(m);
  log('  AVISO: ' + m);
};

for (const d of ['videos/teasers', 'images/store/phone', 'images/store/tablet-7', 'images/store/tablet-10', 'images/store/en', 'images/store/es', 'images/social', 'images/brand', 'images/challenge']) mkdirSync(path.join(OUT, d), { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

const srv = await startServer(4341);
const browser = await chromium.launch({ args: GL_ARGS });
const promo = await openPromo(browser, srv.base);
const doVideos = ONLY !== 'images';
const doImages = ONLY !== 'videos';
const results = [];

/* ---------------- captura ---------------- */
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

/** Grava uma tela do app (receita) => { file, still } ou null (pula com aviso). */
async function scene(name, { sec, w = 540, h = 960, seed = 7, stillOnly = false, tag = '' }) {
  const R = RECIPES[name];
  const file = path.join(TMP, `sc-${name}${tag}.mp4`);
  const still = path.join(TMP, `st-${name}${tag}.png`);
  for (let attempt = 0; attempt < 2; attempt++) {
    let s;
    try {
      s = await openScene(browser, srv.base, { url: R.url, w, h, seed: seed + attempt * 31, extraLs: EXTRA_LS, css: CLEAN_CSS });
      await R.prep(s.page);
      if (stillOnly) await run(s.page, 1.5);
      else await recordScene(s.page, file, { sec, w: w * 2, h: h * 2, speed: R.speed ?? 1, onFrame: R.onFrame });
      await s.page.screenshot({ path: still, scale: 'device' });
      if (s.errors.length) log(`  (${name}) erro de página ignorado: ${s.errors[0].slice(0, 120)}`);
      return { file: stillOnly ? null : file, still, sec };
    } catch (e) {
      log(`  ${name}: falhou (${e.message.split('\n')[0].slice(0, 160)})${attempt ? '' : ', tentando de novo'}`);
    } finally {
      await s?.ctx.close().catch(() => {});
    }
  }
  warn(`não consegui gravar "${name}" — pulado`);
  return null;
}

/** Bloop Orbit: captura com o bot do capture.mjs (pousos perfeitos, câmera lenta). */
async function orbitClip({ name = 'orbit', sec = 13, skin = 'bloop', trail = 'rainbow', startN = 18, score = 31, seed = 12 }) {
  const file = path.join(TMP, `sc-${name}.mp4`);
  const still = path.join(TMP, `st-${name}.png`);
  for (let attempt = 0; attempt < 3; attempt++) {
    let s;
    try {
      s = await openGame(browser, srv.base, { w: 540, h: 960, seed: seed + attempt * 101, skin, trail });
      await startRun(s.page, { startN, score, nearMiss: 0.1 });
      await advanceToJump(s.page, 0.2);
      const r = await recordClip(s.page, file, { sec, ramp: 'auto', base: 1.15, slow: 0.3, maxSlowmo: 2, w: 1080, h: 1920 });
      await s.page.screenshot({ path: still, scale: 'device' });
      if (r.died >= 0 && r.died < sec - 0.2) {
        log(`  orbit: bot morreu em ${r.died.toFixed(1)}s, repetindo`);
        continue;
      }
      return { file, still, sec };
    } catch (e) {
      log(`  orbit: falhou (${e.message.split('\n')[0].slice(0, 160)})`);
    } finally {
      await s?.ctx.close().catch(() => {});
    }
  }
  if (existsSync(file)) return { file, still, sec };
  warn('não consegui gravar o Orbit — pulado');
  return null;
}

const GAMES = ['orbit', 'tubo', 'rally', 'tycoon', 'disaster', 'band'];
const GAME_NAMES = { orbit: 'Bloop Orbit', tubo: 'Queda Giratória', rally: 'Rally Lunar', tycoon: 'Fábrica Estelar', disaster: 'Sobreviva aos Desastres', band: 'Bloop Banda' };
const GAME_HOOK = {
  orbit: 'Pule de planeta\nem *planeta!*',
  tubo: 'Mergulhe pelas\n*aberturas!*',
  rally: 'Acelere pelas\n*colinas da Lua!*',
  tycoon: 'Monte a fábrica\nmais *brilhante!*',
  disaster: 'Sobreviva aos\n*desastres!*',
  band: 'Toque no\n*ritmo!*',
};
const CLIP_SEC = { hub: 6, tubo: 13, rally: 13, tycoon: 13, disaster: 13, band: 13, pet: 5, home: 5, home3d: 5, creatures: 4.5, pass: 4.5 };

const clips = {};
{
  const tasks = Object.keys(CLIP_SEC).map((k) => ['scene', k]);
  tasks.unshift(['orbit', 'orbit']);
  log(`capturando ${tasks.length} telas do app (paralelo ${JOBS})...`);
  await pool(tasks, JOBS, async ([kind, name]) => {
    const t = Date.now();
    clips[name] = kind === 'orbit' ? await orbitClip({}) : await scene(name, { sec: doVideos ? CLIP_SEC[name] : 0, stillOnly: !doVideos });
    if (clips[name]) log(`  ok ${name} (${((Date.now() - t) / 1000).toFixed(0)}s)`);
  });
}
const has = (n) => !!clips[n];

/* ---------------- textos animados / cartões ---------------- */
async function textSeq(name, spec, { frames = 14, W = 1080 } = {}) {
  const dir = path.join(TMP, 'ov');
  mkdirSync(dir, { recursive: true });
  for (let f = 0; f < frames; f++) {
    const buf = await renderBuf(promo, { kind: 'overlay', w: W, h: spec.h ?? 560, y: 0.5, ...spec, t: f / 30 });
    writeFileSync(path.join(dir, `${name}_${String(f).padStart(3, '0')}.png`), buf);
  }
  return path.join(dir, `${name}_%03d.png`);
}

async function animCard(spec, dur, out) {
  const { spawn } = await import('node:child_process');
  const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => p.on('close', (c) => (c ? j(new Error('ffmpeg card')) : r())));
  const n = Math.round(dur * 30);
  for (let f = 0; f < n; f++) {
    const buf = await renderBuf(promo, { ...spec, t: f / 30, format: 'jpeg' });
    if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
  }
  p.stdin.end();
  await done;
  return out;
}

const BPM = 125;
const BEAT = 60 / BPM;
const TD = BEAT / 2;

/**
 * Monta um corpo de vídeo vertical 1080x1920 a partir de um plano [{clip, beats, in, trans, text}].
 * Retorna { file, dur, cuts }.
 */
async function buildBody(key, plan) {
  plan = plan.filter((p) => has(p.clip));
  const segs = plan.map((p, i) => {
    const len = p.beats * BEAT;
    const c = clips[p.clip];
    const dur = len + (i === 0 || i === plan.length - 1 ? TD / 2 : TD);
    const inn = Math.max(0, Math.min(c.sec - dur - 0.1, p.in ?? 0.3));
    return { file: c.file, in: inn, dur: plan.length === 1 ? len : dur, trans: p.trans ?? 'fade', zoom: p.zoom ?? 0.03 };
  });
  const cuts = [];
  let t = 0;
  for (const p of plan) {
    cuts.push(t);
    t += p.beats * BEAT;
  }
  const raw = path.join(TMP, `${key}-raw.mp4`);
  const dur = await chain(segs, raw, { w: 1080, h: 1920, td: TD });
  // textos: um por segmento (ou um que atravessa vários: spanTo)
  const ov = [];
  for (let i = 0; i < plan.length; i++) {
    const p = plan[i];
    if (!p.text) continue;
    const j = p.spanTo ? plan.findIndex((q, k) => k > i && q.clip === p.spanTo) : i;
    const end = j >= 0 && j + 1 < plan.length ? cuts[j + 1] : dur;
    const start = cuts[i] + (i === 0 ? 0 : 0.08);
    const h = p.textH ?? 560;
    ov.push({ seq: await textSeq(`${key}-${i}`, { text: p.text, size: p.size ?? 140, h, fadeIn: i !== 0, band: p.band ?? true }), start, dur: end - start - 0.06, y: 1920 * (p.ty ?? 0.2) - h / 2 });
  }
  const body = path.join(TMP, `${key}.mp4`);
  await overlays(raw, ov, body);
  return { file: body, dur, cuts };
}

/* ================================ VÍDEOS ================================ */
if (doVideos) {
  log('editando vídeos...');
  const END = 4.6;
  const endV = await animCard({ kind: 'endcard', layout: 'v', w: 1080, h: 1920, skin: 'bloop', tagline: 'Um mundo de jogos' }, END, path.join(TMP, 'end-v.mp4'));
  const endH = await animCard({ kind: 'endcard', layout: 'h', w: 1920, h: 1080, skin: 'bloop', tagline: 'Um mundo de jogos' }, END, path.join(TMP, 'end-h.mp4'));

  // ---------- a) trailer vertical (~38 s) ----------
  const trailerPlan = [
    { clip: 'hub', beats: 8, in: 0.2, text: 'UM MUNDO\nDE *JOGOS*', size: 170, ty: 0.2, zoom: 0.02 },
    { clip: 'orbit', beats: 3, in: 1.0, trans: 'fadewhite', text: '*6* JOGOS', size: 170, textH: 380, ty: 0.17, spanTo: 'band' },
    { clip: 'tubo', beats: 3, in: 1.0, trans: 'smoothleft' },
    { clip: 'rally', beats: 3, in: 2.0, trans: 'smoothleft' },
    { clip: 'tycoon', beats: 3, in: 2.0, trans: 'smoothleft' },
    { clip: 'disaster', beats: 3, in: 0.5, trans: 'smoothleft' },
    { clip: 'band', beats: 3, in: 1.0, trans: 'smoothleft' },
    { clip: 'pet', beats: 6, in: 0.3, trans: 'zoomin', text: 'SEU BICHINHO\n*FALA COM VOCÊ*', size: 120 },
    { clip: 'home', beats: 6, in: 0.3, trans: 'smoothup', text: 'MONTE SUA CASA\nE SEU *PLANETA*', size: 115 },
    { clip: 'home3d', beats: 6, in: 0.3, trans: 'fadewhite', text: 'FESTA COM GUERRA\nDE COMIDA *EM 3D*', size: 110 },
    { clip: 'band', beats: 6, in: 6.0, trans: 'zoomin', text: 'TOQUE NA BANDA\nCOM SEUS *AMIGOS*', size: 115 },
    { clip: 'disaster', beats: 6, in: 6.0, trans: 'hblur', text: 'SOBREVIVA AOS\n*DESASTRES*', size: 125 },
    { clip: 'creatures', beats: 6, in: 0.3, trans: 'circleopen', text: '*300*\nCRIATURAS', size: 150 },
    { clip: 'pass', beats: 6, in: 0.3, trans: 'smoothup', text: 'PASSES\n*TODO MÊS*', size: 150 },
  ];
  const tb = await buildBody('trailer', trailerPlan);
  const total = tb.dur + END - TD;
  const music = path.join(TMP, 'trailer.wav');
  writeFileSync(music, genMusic({ dur: total, bpm: BPM, hits: [0.02, tb.cuts[1] ?? 3, tb.cuts[7] ?? 12, tb.dur - TD / 2], whooshes: tb.cuts.slice(1).concat([tb.dur - TD / 2]), outroAt: tb.dur - TD / 2 }));
  const vNoA = path.join(TMP, 'v-noaudio.mp4');
  await chain([{ file: tb.file, in: 0, dur: tb.dur }, { file: endV, in: 0, dur: END, trans: 'fadewhite' }], vNoA, { w: 1080, h: 1920, td: TD });
  const fV = path.join(OUT, 'videos', 'trailer-vertical-1080x1920.mp4');
  await finalize(vNoA, music, fV);
  results.push(fV);
  log('  ok trailer vertical');

  // ---------- b) YouTube horizontal (~40 s) ----------
  const items = ['*6* jogos', 'Bichinho que *fala*', 'Casa e *planeta*', 'Festa *3D*', '*300* criaturas', 'Passes *todo mês*'];
  const frame = path.join(TMP, 'hframe.png');
  await renderTo(promo, { kind: 'hframe', w: 1920, h: 1080, cw: 608, items }, frame);
  const hBody = path.join(TMP, 'h-body.mp4');
  await horizontalize(tb.file, frame, hBody);
  const hNoA = path.join(TMP, 'h-noaudio.mp4');
  await chain([{ file: hBody, in: 0, dur: tb.dur }, { file: endH, in: 0, dur: END, trans: 'fadewhite' }], hNoA, { w: 1920, h: 1080, td: TD });
  const fH = path.join(OUT, 'videos', 'youtube-horizontal-1920x1080.mp4');
  await finalize(hNoA, music, fH);
  results.push(fH);
  log('  ok vídeo horizontal');

  // ---------- e) vídeo promocional da Play Store (paisagem, ~30 s) ----------
  const storePlan = [
    { clip: 'hub', beats: 5, in: 1.5, text: 'UM MUNDO\nDE *JOGOS*', size: 160 },
    ...GAMES.map((g, i) => ({ clip: g, beats: 6, in: 4.0, trans: i % 2 ? 'smoothleft' : 'smoothright', text: `*${GAME_NAMES[g]}*`, size: 110, textH: 300, ty: 0.14 })),
    { clip: 'pet', beats: 4, in: 1.0, trans: 'zoomin', text: 'Bichinho\nque *fala*', size: 130 },
    { clip: 'home3d', beats: 4, in: 1.0, trans: 'fadewhite', text: 'Casa *3D*', size: 140, textH: 380, ty: 0.17 },
    { clip: 'creatures', beats: 4, in: 0.5, trans: 'circleopen', text: '*300* criaturas', size: 120, textH: 380, ty: 0.17 },
  ];
  const sb = await buildBody('storepromo', storePlan);
  const sFrame = path.join(TMP, 'hframe-store.png');
  await renderTo(promo, { kind: 'hframe', w: 1920, h: 1080, cw: 608, items: ['*6* jogos grátis', 'Bichinho virtual', 'Casa e festas *3D*', 'Passes *todo mês*'] }, sFrame);
  const sH = path.join(TMP, 'store-h.mp4');
  await horizontalize(sb.file, sFrame, sH);
  const sNoA = path.join(TMP, 'store-noaudio.mp4');
  await chain([{ file: sH, in: 0, dur: sb.dur }, { file: endH, in: 0, dur: END, trans: 'fadewhite' }], sNoA, { w: 1920, h: 1080, td: TD });
  const sMusic = path.join(TMP, 'store.wav');
  writeFileSync(sMusic, genMusic({ dur: sb.dur + END - TD, bpm: BPM, hits: [0.02, sb.dur - TD / 2], whooshes: sb.cuts.slice(1).concat([sb.dur - TD / 2]), outroAt: sb.dur - TD / 2 }));
  const fP = path.join(OUT, 'videos', 'playstore-promo-1920x1080.mp4');
  await finalize(sNoA, sMusic, fP);
  results.push(fP);
  log('  ok vídeo da Play Store');

  // ---------- c) loop quadrado (10 s) ----------
  const LOOP = 10;
  const loopSrc = ['tubo', 'band', 'orbit'].find(has);
  if (loopSrc) {
    const sqIn = path.join(TMP, 'sq-src.mp4');
    await ff(['-ss', '1', '-i', clips[loopSrc].file, '-vf', 'crop=1080:1080:0:420', '-t', String(LOOP + 1.2), '-c:v', 'libx264', '-crf', '14', '-preset', 'veryfast', sqIn]);
    const sqA = path.join(TMP, 'sq-loop.mp4');
    await seamless(sqIn, sqA, LOOP, { w: 1080, h: 1080 });
    const badge = path.join(TMP, 'sqbadge.png');
    await renderTo(promo, { kind: 'loopbadge', w: 1080, h: 1080 }, badge);
    const sqB = path.join(TMP, 'sq-badge.mp4');
    await ff(['-i', sqA, '-i', badge, '-filter_complex', '[0:v][1:v]overlay=0:0,format=yuv420p[v]', '-map', '[v]', '-c:v', 'libx264', '-crf', '15', '-preset', 'veryfast', sqB]);
    const sqMusic = path.join(TMP, 'loop.wav');
    writeFileSync(sqMusic, genMusic({ dur: LOOP, bpm: 120, loop: true }));
    const fS = path.join(OUT, 'videos', 'short-loop-1080x1080.mp4');
    await finalize(sqB, sqMusic, fS);
    results.push(fS);
    log('  ok loop quadrado');
  }

  // ---------- d) teasers de 15 s por jogo ----------
  for (const g of GAMES) {
    if (!has(g)) continue;
    const c = clips[g];
    const GDUR = Math.min(12, c.sec - 0.6);
    const ov = [{ seq: await textSeq(`tz-${g}`, { text: GAME_HOOK[g], size: 140, h: 560 }), start: 0.1, dur: 3.2, y: 1920 * 0.2 - 280 }];
    const gb = path.join(TMP, `tz-${g}-body.mp4`);
    const gr = path.join(TMP, `tz-${g}-raw.mp4`);
    await chain([{ file: c.file, in: 0.4, dur: GDUR, zoom: 0.04 }], gr, { w: 1080, h: 1920, td: TD });
    await overlays(gr, ov, gb);
    const ge = await animCard({ kind: 'gameend', game: g, title: GAME_NAMES[g], w: 1080, h: 1920 }, 3.4, path.join(TMP, `tz-${g}-end.mp4`));
    const gN = path.join(TMP, `tz-${g}-noaudio.mp4`);
    const dur = await chain([{ file: gb, in: 0, dur: GDUR }, { file: ge, in: 0, dur: 3.4, trans: 'fadewhite' }], gN, { w: 1080, h: 1920, td: TD });
    const gm = path.join(TMP, `tz-${g}.wav`);
    writeFileSync(gm, genMusic({ dur, bpm: BPM, hits: [0.02, GDUR - TD / 2], whooshes: [GDUR - TD / 2], outroAt: GDUR - TD / 2 }));
    const f = path.join(OUT, 'videos', 'teasers', `teaser-${g}-1080x1920.mp4`);
    await finalize(gN, gm, f);
    results.push(f);
  }
  log('  ok teasers');
}

/* ================================ IMAGENS ================================ */
if (doImages) {
  log('renderizando imagens...');
  const img = async (dir, name, spec, shots) => {
    const f = path.join(OUT, 'images', dir, name);
    try {
      await renderTo(promo, spec, f, shots);
      results.push(f);
    } catch (e) {
      warn(`imagem ${name}: ${e.message.slice(0, 120)}`);
    }
  };
  const st = (n) => (has(n) && existsSync(clips[n].still) ? { shot: clips[n].still } : null);
  // ---- Play Store: celular 1080x1920 ----
  const STORE = [
    ['01-hub', 'hub', 'violet'],
    ['02-orbit', 'orbit', 'core'],
    ['03-banda', 'band', 'violet'],
    ['04-desastres', 'disaster', 'ocean'],
    ['05-queda', 'tubo', 'sunset'],
    ['06-bichinho', 'pet', 'sunset'],
    ['07-casa', 'home3d', 'toxic', 'home'],
    ['08-passes', 'pass', 'core'],
  ];
  const pt = L10N.pt.store;
  for (const [i, [name, src, pal, alt]] of STORE.entries()) {
    const shot = st(src) ?? (alt ? st(alt) : null);
    if (!shot) {
      warn(`screenshot ${name} sem captura — pulado`);
      continue;
    }
    await img('store/phone', `${name}-1080x1920.png`, { kind: 'store', w: 1080, h: 1920, seed: i + 1, pal, ...pt[name] }, shot);
  }
  // ---- tablets: capturas na proporção do tablet ----
  const TAB = [
    ['hub', '01-hub'],
    ['band', '03-banda'],
    ['pet', '06-bichinho'],
    ['tubo', '05-queda'],
  ];
  for (const [dir, vw, vh, W, H] of [['tablet-7', 600, 960, 1200, 1920], ['tablet-10', 800, 1280, 1600, 2560]]) {
    const shots = await pool(TAB, JOBS, async ([n]) => scene(n, { stillOnly: true, w: vw, h: vh, tag: `-${dir}` }));
    for (const [k, [, name]] of TAB.entries()) {
      if (!shots[k]) continue;
      await img(`store/${dir}`, `${name}-${W}x${H}.png`, { kind: 'store', w: W, h: H, seed: k + 1, pal: ['violet', 'violet', 'sunset', 'sunset'][k], tablet: true, ...pt[name] }, { shot: shots[k].still });
    }
  }
  await img('store', 'feature-graphic-1024x500.png', { kind: 'featureworld', w: 1024, h: 500 });
  // ---- localizados (en, es): feature graphic + 2 primeiros screenshots ----
  for (const lang of ['en', 'es']) {
    const T = L10N[lang];
    await img(`store/${lang}`, `feature-graphic-1024x500-${lang}.png`, { kind: 'featureworld', w: 1024, h: 500, ...T.feature });
    for (const [i, [name, src, pal]] of STORE.slice(0, 2).entries()) {
      const shot = st(src);
      if (shot) await img(`store/${lang}`, `${name}-1080x1920-${lang}.png`, { kind: 'store', w: 1080, h: 1920, seed: i + 1, pal, ...T.store[name] }, shot);
    }
  }
  // ---- redes sociais ----
  for (const v of [1, 2, 3]) await img('social', `instagram-post-${v}-1080x1080.png`, { kind: 'post', variant: v, w: 1080, h: 1080 }, st('band') ?? {});
  await img('social', 'story-1-1080x1920.png', { kind: 'story', variant: 1, w: 1080, h: 1920 }, st('hub') ?? {});
  await img('social', 'story-2-1080x1920.png', { kind: 'story', variant: 2, w: 1080, h: 1920 });
  await img('social', 'youtube-thumbnail-1280x720.png', { kind: 'thumb', w: 1280, h: 720 }, st('hub') ?? {});
  await img('social', 'x-header-1500x500.png', { kind: 'header', w: 1500, h: 500 });
  await img('challenge', 'desafio-exemplo-1080x1920.png', { kind: 'challenge', w: 1080, h: 1920, code: 'BLOOP2026', reward: '500 moedas + skin', goal: 'Faça mais de 100 pontos' });
  await img('brand', 'teamross-1024.png', { kind: 'teamross', w: 1024, h: 1024 });
  await img('brand', 'teamross-1024-transparente.png', { kind: 'teamross', w: 1024, h: 1024, transparent: true });
  // ícone alternativo "hub" (o líder decide se substitui assets/icon-*.png)
  await img('brand', 'icon-bloopworld-1024.png', { kind: 'icon', w: 1024, h: 1024 });
  await img('brand', 'icon-bloopworld-foreground-1024.png', { kind: 'icon', w: 1024, h: 1024, foreground: true });
  await img('brand', 'icon-bloopworld-512.png', { kind: 'icon', w: 512, h: 512 });
}

await browser.close();
await srv.close();
if (!KEEP) rmSync(TMP, { recursive: true, force: true });

/* ---------------- resumo ---------------- */
console.log('\n=== Bloop World — material promocional ===');
for (const f of results) {
  const kb = statSync(f).size / 1024;
  let extra = '';
  if (f.endsWith('.mp4')) {
    const p = await probe(f);
    const v = p.streams.find((s) => s.codec_type === 'video');
    const a = p.streams.find((s) => s.codec_type === 'audio');
    extra = ` ${v.width}x${v.height} ${Number(p.format.duration).toFixed(1)}s ${v.codec_name}${a ? '+' + a.codec_name : ' (sem áudio)'}`;
  }
  console.log(`  ${path.relative(OUT, f).padEnd(58)} ${(kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(0) + ' KB').padStart(9)}${extra}`);
}
if (warnings.length) console.log('Avisos:\n  ' + warnings.join('\n  '));
console.log(`Pronto em ${((Date.now() - T0) / 1000).toFixed(0)}s → ${OUT}`);
