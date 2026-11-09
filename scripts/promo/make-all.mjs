#!/usr/bin/env node
/**
 * Pipeline completo de material promocional do Bloop Orbit (vídeos + imagens), a partir do jogo real.
 *
 *   NODE_PATH=$(npm root -g) node scripts/promo/make-all.mjs <outDir> [--only=videos|images] [--keep-tmp] [--jobs=3]
 *
 * Requer: Playwright (global ou local) + Chromium, ffmpeg com libx264/aac. Ver docs/PROMO.md.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, ROOT } from './lib/server.mjs';
import { openGame, startRun, advanceToJump, recordClip, captureStill } from './lib/capture.mjs';
import { openPromo, renderTo, renderBuf } from './lib/render.mjs';
import { chain, overlays, horizontalize, finalize, seamless, probe, ff } from './lib/edit.mjs';
import { genMusic } from './lib/music.mjs';

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

for (const d of ['videos', 'images/store', 'images/social', 'images/brand', 'images/challenge']) mkdirSync(path.join(OUT, d), { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

/* ---------------- infos do jogo ---------------- */
function biomeNames() {
  try {
    const src = readFileSync(path.join(ROOT, 'src/game/game.ts'), 'utf8');
    const block = src.slice(src.indexOf('const BIOMES'), src.indexOf('];', src.indexOf('const BIOMES')));
    const names = [...block.matchAll(/name:\s*'([^']+)'/g)].map((m) => m[1]);
    if (names.length) return names;
  } catch {}
  return ['Nebulosa Roxa', 'Mar Estelar', 'Pôr do Sol Cósmico', 'Selva Tóxica', 'Coração da Galáxia'];
}
const BIOMES = biomeNames();

const srv = await startServer(4341);
const browser = await chromium.launch();
const promo = await openPromo(browser, srv.base);
const info = await promo.evaluate(() => window.__promo.info());
const plus = (n) => `${Math.floor(n / 5) * 5}+`;

// recursos opcionais: detectados no DOM do jogo
const feat = await (async () => {
  const { ctx, page } = await openGame(browser, srv.base, { w: 540, h: 960, seed: 1, skin: 'bloop', trail: 'spark' });
  const r = await page.evaluate(() => ({ race: !!document.querySelector('#btn-race'), creator: !!document.querySelector('#btn-creator') }));
  await page.screenshot({ path: path.join(TMP, 'menu.png'), scale: 'device' });
  await ctx.close();
  return r;
})();
log(`jogo: ${info.skins} personagens, ${info.trails} rastros, ${BIOMES.length} galáxias; corrida=${feat.race} criador=${feat.creator}`);

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

/** Grava um clipe; repete com outra semente se o bot morrer. */
async function clip(c) {
  const file = path.join(TMP, `clip-${c.name}.mp4`);
  const w = c.w ?? 540;
  const h = c.h ?? 960;
  for (let attempt = 0; attempt < 4; attempt++) {
    const seed = (c.seed ?? 1) + attempt * 101;
    const { ctx, page, errors } = await openGame(browser, srv.base, { w, h, seed, skin: c.skin, trail: c.trail, extraCss: c.css });
    try {
      await startRun(page, { startN: c.startN ?? 6, score: c.score ?? 0, nearMiss: c.nearMiss ?? 0.15 });
      await advanceToJump(page, c.lead ?? 0.2);
      const r = await recordClip(page, file, { sec: c.sec, ramp: c.ramp ?? 'auto', base: c.base ?? 1.15, slow: c.slow ?? 0.3, maxSlowmo: c.maxSlowmo ?? 2, w: w * 2, h: h * 2 });
      if (errors.length) log(`  aviso (${c.name}): ${errors[0]}`);
      if (r.died >= 0 && r.died < c.sec - 0.2) {
        log(`  ${c.name}: bot morreu em ${r.died.toFixed(1)}s, repetindo`);
        continue;
      }
      return { ...c, file, ev: r.ev };
    } finally {
      await ctx.close();
    }
  }
  return { ...c, file, ev: { perfect: [], biome: [], asteroid: [], slow: [] } };
}

async function still(s) {
  const file = path.join(TMP, `still-${s.name}.png`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const { ctx, page } = await openGame(browser, srv.base, { w: 540, h: 960, seed: (s.seed ?? 5) + attempt * 37, skin: s.skin, trail: s.trail });
    try {
      await startRun(page, { startN: s.startN ?? 6, score: s.score ?? 0, nearMiss: 0 });
      const ok = await captureStill(page, s.cond, file, { after: s.after ?? 0.12 });
      if (ok) return file;
    } finally {
      await ctx.close();
    }
  }
  return file;
}

const doVideos = ONLY !== 'images';
const doImages = ONLY !== 'videos';
const results = [];

/* ---------------- planos ---------------- */
const BPM = 125;
const BEAT = 60 / BPM;
const TD = BEAT / 2;
const galSkins = [
  ['dragon', 'comet'],
  ['cyber', 'neon'],
  ['unicorn', 'stars'],
  ['galaxy', 'nebula'],
];
const CLIPS = [
  { name: 'hook', skin: 'bloop', trail: 'rainbow', startN: 8, score: 14, sec: 3.4, seed: 11, lead: 0.12 },
  { name: 'perfect', skin: 'phoenix', trail: 'fire', startN: 22, score: 23, sec: 4.6, seed: 12, slow: 0.25, maxSlowmo: 1 },
  ...galSkins.map(([skin, trail], i) => ({ name: `gal${i + 1}`, skin, trail, startN: (i + 1) * 20 - 1, score: 34 + i * 17, sec: 5.5, seed: 20 + i, maxSlowmo: 0 })),
  ...[['king', 'rainbow', 4], ['crystal', 'lightning', 24], ['ninja', 'smoke', 64], ['capy', 'hearts', 44]].map(([skin, trail, startN], i) => ({ name: `skin${i + 1}`, skin, trail, startN, score: 104 + i * 7, sec: 2.6, seed: 30 + i, maxSlowmo: 0, lead: 0.1 })),
  { name: 'asteroid', skin: 'samurai', trail: 'confetti', startN: 46, score: 136, sec: 5.5, seed: 40, maxSlowmo: 1 },
  { name: 'fast', skin: 'lava', trail: 'lightning', startN: 86, score: 151, sec: 3.2, seed: 41, ramp: 1.55, lead: 0.1 },
  { name: 'record', skin: 'campeao', trail: 'brasil', startN: 66, score: 183, sec: 3.6, seed: 42, maxSlowmo: 1 },
];
if (feat.race) CLIPS.push({ name: 'race', skin: 'shadow', trail: 'notes', startN: 30, score: 168, sec: 3.2, seed: 43, maxSlowmo: 0 });
const SQUARE = { name: 'square', skin: 'bloop', trail: 'rainbow', startN: 6, score: 9, sec: 11.2, seed: 50, w: 540, h: 540, maxSlowmo: 2, base: 1.1, lead: 0.15, css: '#hud-score{visibility:hidden!important}' };

const STILLS = [
  { name: 'flight', skin: 'bloop', trail: 'rainbow', startN: 10, score: 18, cond: 'flight', seed: 3, after: 0.03 },
  { name: 'perfect', skin: 'phoenix', trail: 'fire', startN: 26, score: 47, cond: 'perfect', seed: 4, after: 0.18 },
  { name: 'warp', skin: 'galaxy', trail: 'nebula', startN: 79, score: 140, cond: 'warp', seed: 5, after: 0.35 },
  { name: 'asteroid', skin: 'dragon', trail: 'comet', startN: 47, score: 95, cond: 'asteroid', seed: 6, after: 0.15 },
  { name: 'trail', skin: 'cyber', trail: 'neon', startN: 63, score: 122, cond: 'flight', seed: 7, after: 0.03 },
];

/* ---------------- textos (sequências PNG animadas) ---------------- */
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
  const done = new Promise((r, j) => p.on('close', (c) => (c ? j(new Error('ffmpeg endcard')) : r())));
  const n = Math.round(dur * 30);
  for (let f = 0; f < n; f++) {
    const buf = await renderBuf(promo, { ...spec, t: f / 30, format: 'jpeg' });
    if (!p.stdin.write(buf)) await new Promise((r) => p.stdin.once('drain', r));
  }
  p.stdin.end();
  await done;
  return out;
}

/* ================================ VÍDEOS ================================ */
let stills = {};
if (doVideos || doImages) {
  const tasks = [];
  if (doVideos) tasks.push(...CLIPS.map((c) => ['clip', c]), ['clip', SQUARE]);
  if (doImages) tasks.push(...STILLS.map((s) => ['still', s]));
  log(`capturando ${tasks.length} trechos do jogo (paralelo ${JOBS})...`);
  const res = await pool(tasks, JOBS, async ([k, c]) => {
    const r = k === 'clip' ? await clip(c) : await still(c);
    log(`  ok ${k} ${c.name}`);
    return [k, c.name, r];
  });
  var clips = Object.fromEntries(res.filter((r) => r[0] === 'clip').map((r) => [r[1], r[2]]));
  stills = Object.fromEntries(res.filter((r) => r[0] === 'still').map((r) => [r[1], r[2]]));
}

if (doVideos) {
  log('editando vídeos...');
  const inAt = (c, t, pre, dur) => Math.max(0, Math.min(c.sec - dur - 0.05, (t ?? pre) - pre));
  // cortes no grid de batidas: [clipe, batidas, ponto de entrada, transição]
  const plan = [
    ['hook', 5, () => 0, null],
    ['perfect', 6, (c, d) => inAt(c, c.ev.slow[0] ?? c.ev.perfect[0], 1.0, d), 'zoomin'],
    ['gal1', 3, (c, d) => inAt(c, c.ev.biome[0], 0.45, d), 'fadewhite'],
    ['gal2', 3, (c, d) => inAt(c, c.ev.biome[0], 0.45, d), 'smoothleft'],
    ['gal3', 3, (c, d) => inAt(c, c.ev.biome[0], 0.45, d), 'smoothup'],
    ['gal4', 3, (c, d) => inAt(c, c.ev.biome[0], 0.45, d), 'smoothright'],
    ['skin1', 2, (c, d) => inAt(c, c.ev.perfect[0], 0.5, d), 'fadewhite'],
    ['skin2', 2, (c, d) => inAt(c, c.ev.perfect[0], 0.5, d), 'zoomin'],
    ['skin3', 2, (c, d) => inAt(c, c.ev.perfect[0], 0.5, d), 'zoomin'],
    ['skin4', 2, (c, d) => inAt(c, c.ev.perfect[0], 0.5, d), 'zoomin'],
    ['asteroid', 5, (c, d) => inAt(c, c.ev.asteroid[0], 1.3, d), 'smoothup'],
    ['fast', 5, () => 0.1, 'hblur'],
    ...(feat.race ? [['race', 5, () => 0.2, 'circleopen']] : []),
    ['record', 5, (c, d) => inAt(c, c.ev.slow[0], 1.4, d), 'fadewhite'],
  ];
  const segs = [];
  const cuts = [];
  let tcut = 0;
  plan.forEach(([name, beats, fin, trans], i) => {
    const len = beats * BEAT;
    const dur = len + (i === 0 ? TD / 2 : TD) + (i === plan.length - 1 ? -TD / 2 : 0);
    const c = clips[name];
    segs.push({ file: c.file, in: fin(c, dur), dur, trans: trans ?? 'fade', zoom: name.startsWith('skin') ? 0.06 : 0.03 });
    cuts.push(tcut);
    tcut += len;
  });
  // durações: 1º seg = c1 + td/2, meio = len + td, último = len + td/2 ... ajusta para encaixar o xfade
  segs.forEach((s, i) => {
    const len = plan[i][1] * BEAT;
    s.dur = len + (i === 0 || i === segs.length - 1 ? TD / 2 : TD);
    if (segs.length === 1) s.dur = len;
  });
  const bodyRaw = path.join(TMP, 'body-raw.mp4');
  const bodyDur = await chain(segs, bodyRaw, { w: 1080, h: 1920, td: TD });
  const at = (name) => cuts[plan.findIndex((p) => p[0] === name)];
  const span = (a, b) => (b ? at(b) : bodyDur) - at(a);

  // textos
  const ov = [];
  const add = async (key, spec, start, dur, cy = 0.2) => {
    const h = spec.h ?? 560;
    ov.push({ seq: await textSeq(key, { ...spec, h }), start, dur, y: 1920 * cy - h / 2 });
  };
  await add('hook', { text: 'SÓ UM\n*TOQUE.*', size: 200, fadeIn: false, h: 640 }, 0, at('perfect') - 0.05, 0.22);
  await add('perfect', { text: 'POUSO\n*PERFEITO!*', size: 170, h: 600 }, at('perfect') + 0.75, span('perfect', 'gal1') - 0.8);
  await add('gal', { text: `*${BIOMES.length}* GALÁXIAS`, size: 150, band: true, h: 360 }, at('gal1') + 0.1, span('gal1', 'skin1') - 0.15, 0.17);
  for (let i = 0; i < 4; i++) {
    const nm = `gal${i + 1}`;
    await add(`galn${i}`, { text: BIOMES[(i + 1) % BIOMES.length], size: 70, band: false, h: 160 }, at(nm) + 0.2, (plan.find((p) => p[0] === nm)[1] * BEAT) - 0.15, 0.245);
  }
  await add('skins', { text: `*${plus(info.skins)}* PERSONAGENS`, size: 140, h: 360 }, at('skin1') + 0.05, span('skin1', 'asteroid') - 0.1, 0.17);
  await add('ast', { text: 'DESTRUA\n*ASTEROIDES!*', size: 150, h: 560 }, at('asteroid') + 0.15, span('asteroid', 'fast') - 0.2);
  await add('fast', { text: 'CADA VEZ MAIS\n*RÁPIDO!*', size: 140, h: 560 }, at('fast') + 0.1, span('fast', feat.race ? 'race' : 'record') - 0.15);
  if (feat.race) await add('race', { text: 'CORRIDA COM\n*5 JOGADORES*', size: 140, h: 560 }, at('race') + 0.1, span('race', 'record') - 0.15);
  await add('rec', { text: 'QUAL É O SEU\n*RECORDE?*', size: 140, h: 560 }, at('record') + 0.1, span('record') - 0.1);
  const body = path.join(TMP, 'body.mp4');
  await overlays(bodyRaw, ov, body);

  // cartões finais animados
  const END = 4.6;
  const endV = await animCard({ kind: 'endcard', layout: 'v', w: 1080, h: 1920, skin: 'bloop' }, END, path.join(TMP, 'end-v.mp4'));
  const endH = await animCard({ kind: 'endcard', layout: 'h', w: 1920, h: 1080, skin: 'bloop' }, END, path.join(TMP, 'end-h.mp4'));

  // música + efeitos alinhados aos cortes
  const total = bodyDur + END - TD;
  const whooshes = cuts.slice(1).concat([bodyDur - TD / 2]);
  const hits = [0.02, at('perfect') + 0.75, at('gal1'), at('skin1'), bodyDur - TD / 2];
  const music = path.join(TMP, 'trailer.wav');
  writeFileSync(music, genMusic({ dur: total, bpm: BPM, hits, whooshes, outroAt: bodyDur - TD / 2 }));

  // a) vertical
  const vNoA = path.join(TMP, 'v-noaudio.mp4');
  await chain([{ file: body, in: 0, dur: bodyDur }, { file: endV, in: 0, dur: END, trans: 'fadewhite' }], vNoA, { w: 1080, h: 1920, td: TD });
  const fV = path.join(OUT, 'videos', 'trailer-vertical-1080x1920.mp4');
  await finalize(vNoA, music, fV);
  results.push(fV);
  log('  ok trailer vertical');

  // b) horizontal (YouTube / Google Play)
  const frame = path.join(TMP, 'hframe.png');
  await renderTo(promo, { kind: 'hframe', w: 1920, h: 1080, cw: 608, items: ['Só um *toque*', `*${BIOMES.length}* galáxias`, `*${plus(info.skins)}* personagens`, `*${info.trails}* rastros`, ...(feat.race ? ['Corrida *online*'] : [])] }, frame);
  const hBody = path.join(TMP, 'h-body.mp4');
  await horizontalize(body, frame, hBody);
  const hNoA = path.join(TMP, 'h-noaudio.mp4');
  await chain([{ file: hBody, in: 0, dur: bodyDur }, { file: endH, in: 0, dur: END, trans: 'fadewhite' }], hNoA, { w: 1920, h: 1080, td: TD });
  const fH = path.join(OUT, 'videos', 'youtube-horizontal-1920x1080.mp4');
  await finalize(hNoA, music, fH);
  results.push(fH);
  log('  ok vídeo horizontal');

  // c) loop quadrado
  const LOOP = 10;
  const sqA = path.join(TMP, 'sq-loop.mp4');
  await seamless(clips.square.file, sqA, LOOP, { w: 1080, h: 1080 });
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

/* ================================ IMAGENS ================================ */
if (doImages) {
  log('renderizando imagens...');
  const img = async (dir, name, spec, shots) => {
    const f = path.join(OUT, 'images', dir, name);
    await renderTo(promo, spec, f, shots);
    results.push(f);
  };
  const S = { w: 1080, h: 1920, kind: 'store' };
  const store = [
    ['01-pule.png', { title: 'Pule de planeta\nem *planeta*', sub: 'Só um toque. Fácil de aprender!', seed: 1 }, stills.flight],
    ['02-perfeito.png', { title: 'Faça pousos\n*PERFEITOS*', sub: 'Acerte o centro e multiplique os pontos', seed: 2, pal: 'sunset' }, stills.perfect],
    ['03-personagens.png', { title: `Desbloqueie\n*${plus(info.skins)}* personagens`, sub: 'Do comum ao mítico', seed: 3, pal: 'core', content: 'skins' }],
    ['04-galaxias.png', { title: `Explore *${BIOMES.length}*\ngaláxias`, sub: 'Cada uma com seus perigos', seed: 4, pal: 'core' }, stills.warp],
    ['05-asteroides.png', { title: 'Destrua\n*asteroides!*', sub: 'Pouso perfeito = onda de choque', seed: 5, pal: 'sunset' }, stills.asteroid],
    ['06-rastros.png', { title: `*${info.trails}* rastros\nincríveis`, sub: 'Deixe sua marca no espaço', seed: 6, pal: 'toxic' }, stills.trail],
  ];
  if (feat.creator) store.push(['07-criador.png', { title: 'Crie seu\npróprio *Bloop*', sub: 'Cores, rostos e acessórios', seed: 7, pal: 'violet' }, path.join(TMP, 'creator.png')]);
  if (feat.race) store.push(['08-corrida.png', { title: 'Corra contra\n*4 jogadores*', sub: 'Corridas online em tempo real', seed: 8, pal: 'ocean' }, path.join(TMP, 'race.png')]);
  // telas dos recursos opcionais: abre o botão no menu e fotografa
  for (const [id, f] of [['creator', 'creator.png'], ['race', 'race.png']]) {
    if (!feat[id]) continue;
    const { ctx, page } = await openGame(browser, srv.base, { w: 540, h: 960, seed: 9, skin: 'phoenix', trail: 'fire' });
    try {
      await page.click(`#btn-${id}`, { force: true });
      for (let i = 0; i < 60; i++) await page.evaluate(() => window.__vclock.step(16.67));
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(TMP, f), scale: 'device' });
    } catch (e) {
      log(`  aviso: não consegui fotografar #btn-${id}: ${e.message}`);
      await page.screenshot({ path: path.join(TMP, f), scale: 'device' }).catch(() => {});
    }
    await ctx.close();
  }
  for (const [name, spec, shot] of store) await img('store', name, { ...S, ...spec }, shot && existsSync(shot) ? { shot } : {});
  await img('store', 'feature-graphic-1024x500.png', { kind: 'feature', w: 1024, h: 500 });
  for (const v of [1, 2, 3]) await img('social', `instagram-post-${v}-1080x1080.png`, { kind: 'post', variant: v, w: 1080, h: 1080 }, { shot: stills.trail });
  for (const v of [1, 2]) await img('social', `story-${v}-1080x1920.png`, { kind: 'story', variant: v, w: 1080, h: 1920 }, { shot: stills.perfect });
  await img('social', 'youtube-thumbnail-1280x720.png', { kind: 'thumb', w: 1280, h: 720 }, { shot: stills.flight });
  await img('social', 'x-header-1500x500.png', { kind: 'header', w: 1500, h: 500 });
  await img('challenge', 'desafio-exemplo-1080x1920.png', { kind: 'challenge', w: 1080, h: 1920, code: 'BLOOP2026', reward: '500 moedas + skin', goal: 'Faça mais de 100 pontos' });
  await img('brand', 'teamross-1024.png', { kind: 'teamross', w: 1024, h: 1024 });
  await img('brand', 'teamross-1024-transparente.png', { kind: 'teamross', w: 1024, h: 1024, transparent: true });
}

await browser.close();
await srv.close();
if (!KEEP) rmSync(TMP, { recursive: true, force: true });

/* ---------------- resumo ---------------- */
console.log('\n=== Bloop Orbit — material promocional ===');
for (const f of results) {
  const kb = statSync(f).size / 1024;
  let extra = '';
  if (f.endsWith('.mp4')) {
    const p = await probe(f);
    const v = p.streams.find((s) => s.codec_type === 'video');
    const a = p.streams.find((s) => s.codec_type === 'audio');
    extra = ` ${v.width}x${v.height} ${Number(p.format.duration).toFixed(1)}s ${v.codec_name}${a ? '+' + a.codec_name : ' (sem áudio)'}`;
  }
  console.log(`  ${path.relative(OUT, f).padEnd(52)} ${(kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb.toFixed(0) + ' KB').padStart(9)}${extra}`);
}
console.log(`Pronto em ${((Date.now() - T0) / 1000).toFixed(0)}s → ${OUT}`);
