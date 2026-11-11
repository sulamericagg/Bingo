/**
 * Teste de fluxo do Bloop Espelho (Chromium com câmera/microfone falsos).
 *   npx vite --port 4311 &
 *   node scripts/dev/test-mirror.mjs [http://localhost:4311] [pasta-das-fotos] [video-falso.y4m]
 * Sem .y4m o Chromium usa o padrão de teste (sem rosto): o rosto é dirigido por __mirror.setFace.
 * Falha (exit 1) se algum passo não der certo.
 */
import { createRequire } from 'module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
}
const base = process.argv[2] || 'http://localhost:4311';
const out = process.argv[3] || '/tmp/mirror-shots';
const y4m = process.argv[4];
fs.mkdirSync(out, { recursive: true });
const args = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'];
if (y4m) args.push('--use-file-for-fake-video-capture=' + y4m);
const b = await pw.chromium.launch({ args });
const fails = [];
const ok = (cond, msg) => {
  console.log((cond ? '  ok  ' : '  FAIL ') + msg);
  if (!cond) fails.push(msg);
};
const state = (p) => p.evaluate(() => window.__mirror.state());
const shot = (p, name) => p.screenshot({ path: `${out}/${name}.png` });
const waitFor = async (p, fn, ms = 20000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await p.evaluate(fn).catch(() => false)) return true;
    await p.waitForTimeout(200);
  }
  return false;
};

async function page(q, init) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, permissions: ['camera', 'microphone'] });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fails.push('pageerror: ' + e));
  p.on('console', (m) => m.type() === 'error' && console.log('   [console]', m.text().slice(0, 200)));
  if (init) await p.addInitScript(init);
  await p.goto(`${base}/scripts/dev/mirror.html?debug&${q}`);
  await waitFor(p, () => document.title === 'ready' && !!window.__mirror);
  // ?debug abre o diagnóstico: fecha para as fotos
  await p.evaluate(() => document.querySelector('[data-a="diag-close"]')?.click());
  return { p, ctx };
}

/* ---------------- 1) jogador grátis, câmera ---------------- */
console.log('grátis + câmera');
{
  const { p, ctx } = await page('fresh&sub=0');
  ok(await p.isVisible('.mr-consent'), 'explicação de privacidade aparece antes da câmera');
  await shot(p, '01-consentimento');
  await p.click('.mr-consent [data-c="cam"]');
  ok(await waitFor(p, () => window.__mirror.state().session === 'on'), 'sessão liga após aceitar');
  const s1 = await state(p);
  ok(s1.cam && !s1.mic, 'câmera ligada; microfone só pelo botão');
  ok(await p.isVisible('[data-a="mic"]'), 'botão do microfone visível');
  await p.click('[data-a="mic"]');
  ok(await waitFor(p, () => window.__mirror.state().mic, 8000), 'botão liga o microfone');
  await waitFor(p, () => !!window.__mirror.state().tracker, 30000);
  const s2 = await state(p);
  console.log('   rastreador:', s2.tracker, 'tempo:', s2.leftMs);
  ok(s2.tracker === 'GPU' || s2.tracker === 'CPU', 'MediaPipe carregou do próprio app (sem CDN)');
  ok(await p.isVisible('.mr-cam.on'), 'indicador "Câmera ligada" visível');
  if (y4m) {
    const face = await waitFor(p, () => window.__mirror.state().faceLive, 15000);
    ok(face, 'rosto real detectado no vídeo falso');
    const rolls = [];
    for (let i = 0; i < 12; i++) {
      const s = await state(p);
      rolls.push(+s.rig.roll.toFixed(2));
      await p.waitForTimeout(330);
    }
    const s = await state(p);
    console.log('   roll ao longo de 4 s:', rolls.join(' '), '| sorriso', s.rig.smileL.toFixed(2), s.rig.smileR.toFixed(2), '| boca', s.rig.jaw.toFixed(2));
    ok(Math.max(...rolls) - Math.min(...rolls) > 0.2, 'inclinação da cabeça acompanha o vídeo');
    await shot(p, '02-rosto-real');
  }
  const t1 = (await state(p)).leftMs;
  await p.waitForTimeout(1500);
  const t2 = (await state(p)).leftMs;
  ok(t2 < t1 - 1000, `cronômetro grátis descendo (${Math.round(t1)} → ${Math.round(t2)} ms)`);
  // rosto dirigido pelo gancho de depuração
  await p.evaluate(() => window.__mirror.setFace({ blinkL: 1, jaw: 0.85, smileL: 0.3, smileR: 0.3, browR: 0.8, browInner: 0.4, yaw: 0.25, roll: 0.12 }));
  await p.waitForTimeout(600);
  await shot(p, '03-piscadinha-boca-aberta');
  await p.click('.mr-tab[data-tab="scene"]');
  await p.click('.mr-chip[data-pick="palco"]');
  await p.click('.mr-tab[data-tab="sticker"]');
  await p.click('.mr-chip[data-pick="coroa"]');
  await p.evaluate(() => window.__mirror.setFace({ round: 0.9, jaw: 0.5, browInner: 0.8, pitch: -0.15 }));
  await p.waitForTimeout(600);
  await shot(p, '04-palco-coroa-boca-O');
  await p.click('.mr-tab[data-tab="scene"]');
  await p.click('.mr-chip[data-pick="espaco"]');
  await p.click('.mr-tab[data-tab="sticker"]');
  await p.click('.mr-chip[data-pick="oculos"]');
  await p.evaluate(() => window.__mirror.setFace({ smileL: 1, smileR: 1, cheek: 0.6, jaw: 0.25, wide: 0.6 }));
  await p.waitForTimeout(600);
  await shot(p, '05-espaco-oculos-sorriso');
  await p.evaluate(() => window.__mirror.clearFace());
  // voz paga bloqueada
  await p.click('.mr-tab[data-tab="voice"]');
  ok((await p.locator('.mr-chip.lock').count()) === 6, '6 vozes bloqueadas para grátis (Normal e Bloop fofo livres)');
  await p.click('.mr-chip[data-pick="robo"]');
  ok(await p.isVisible('.mr-pay'), 'voz paga abre o convite do Clube/Passe');
  await shot(p, '06-paywall-voz');
  await p.click('.mr-pay [data-p="no"]');
  await p.click('.mr-chip[data-pick="fofo"]');
  ok((await state(p)).voice === 'fofo', 'voz Bloop fofo liberada e aplicada');
  // foto
  await p.click('[data-a="shot"]');
  ok(await waitFor(p, () => !!window.__mirror.state().lastShot, 5000), 'foto gerada');
  const sh = (await state(p)).lastShot;
  console.log('   foto:', sh);
  ok(sh && sh.type === 'image/png' && sh.size > 20000, 'foto é PNG com moldura');
  await p.waitForTimeout(300);
  await shot(p, '07-foto-resultado');
  const png = await p.evaluate(async () => {
    const img = document.querySelector('.mr-res img');
    const r = await fetch(img.src);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(`${out}/08-foto-exportada.png`, Buffer.from(png, 'base64'));
  await p.click('.mr-res [data-r="no"]');
  // vídeo
  await p.click('[data-a="rec"]');
  await p.waitForTimeout(400);
  ok((await state(p)).recording, 'gravação começou (' + (await state(p)).mime + ')');
  await p.evaluate(() => window.__mirror.setFace({ jaw: 0.7, blinkR: 1 }));
  await p.waitForTimeout(1200);
  await shot(p, '09-gravando');
  await p.evaluate(() => window.__mirror.clearFace());
  await p.waitForTimeout(1300);
  await p.click('[data-a="rec"]');
  ok(await waitFor(p, () => !!window.__mirror.state().lastRec, 8000), 'parar gera o vídeo');
  const rv = (await state(p)).lastRec;
  console.log('   vídeo:', rv);
  ok(rv && rv.size > 10000 && /video\/(mp4|webm)/.test(rv.type), 'Blob de vídeo válido');
  const audioTracks = await p.evaluate(async () => {
    const v = document.querySelector('.mr-res video');
    await new Promise((r) => (v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
    return { w: v.videoWidth, h: v.videoHeight, dur: v.duration };
  });
  console.log('   vídeo metadados:', audioTracks);
  const vid = await p.evaluate(async () => {
    const r = await fetch(document.querySelector('.mr-res video').src);
    const buf = new Uint8Array(await r.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  });
  fs.writeFileSync(`${out}/10-video-gravado.${rv.type.includes('mp4') ? 'mp4' : 'webm'}`, Buffer.from(vid, 'base64'));
  await p.waitForTimeout(500);
  await shot(p, '10-video-resultado');
  await p.click('.mr-res [data-r="no"]');
  // tempo acaba → convite
  await p.evaluate(() => window.__mirror.burn(10 * 60000));
  ok(await waitFor(p, () => !!document.querySelector('.mr-pay'), 3000), 'tempo grátis acabou → convite do Clube/Passe');
  const s3 = await state(p);
  ok(s3.session === 'off' && !s3.cam && !s3.mic, 'câmera e microfone desligam quando o tempo acaba');
  await shot(p, '11-paywall-tempo');
  // sair desliga tudo
  const tracks = await p.evaluate(() => document.querySelector('.mr-pip').srcObject);
  ok(!tracks, 'prévia da câmera sem stream depois de desligar');
  await ctx.close();
}

/* ---------------- 2) assinante do Clube ---------------- */
console.log('assinante (Clube ativo)');
{
  const { p, ctx } = await page('fresh&sub=1');
  await p.click('.mr-consent [data-c="cam"]');
  await waitFor(p, () => window.__mirror.state().session === 'on');
  const s = await state(p);
  ok(s.unlimited && (s.leftMs === null || s.leftMs === Infinity), 'sem limite para o Clube'); // Infinity vira null no JSON
  ok((await p.textContent('.mr-time')).includes('Sem limite'), 'chip "Sem limite"');
  ok((await p.locator('.mr-chip.lock').count()) === 0, 'todas as vozes liberadas');
  await p.click('.mr-chip[data-pick="robo"]');
  // escolher uma voz com o microfone desligado liga o microfone sozinho
  ok(await waitFor(p, () => window.__mirror.state().voice === 'robo', 8000), 'voz Robô aplicada (liga o microfone)');
  await p.evaluate(() => window.__mirror.burn(10 * 60000));
  await p.waitForTimeout(800);
  ok((await state(p)).session === 'on' && !(await p.isVisible('.mr-pay')), 'continua ligado (ilimitado)');
  await p.evaluate(() => window.__mirror.setFace({ smileL: 0.8, smileR: 0.8, jaw: 0.5, yaw: -0.3 }));
  await p.waitForTimeout(500);
  await shot(p, '12-assinante');
  await ctx.close();
}

/* ---------------- 3) câmera negada → só microfone ---------------- */
console.log('câmera negada');
{
  const { p, ctx } = await page('fresh&sub=0', () => {
    const md = navigator.mediaDevices;
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = (c) => (c && c.video ? Promise.reject(new DOMException('negado', 'NotAllowedError')) : orig(c));
  });
  await p.click('.mr-consent [data-c="cam"]');
  ok(await waitFor(p, () => !!document.querySelector('.mr-perm'), 8000), 'câmera negada: cartão de permissão com passos');
  await p.click('.mr-perm [data-p="no"]');
  await p.click('[data-a="mic"]');
  await waitFor(p, () => window.__mirror.state().session === 'on');
  const s = await state(p);
  ok(!s.cam && s.mic, 'sem câmera: segue só com o microfone');
  await p.waitForTimeout(1200);
  await shot(p, '13-so-microfone');
  await ctx.close();
}

await b.close();
console.log(fails.length ? `\n${fails.length} falha(s)` : '\ntudo certo');
process.exit(fails.length ? 1 : 0);
