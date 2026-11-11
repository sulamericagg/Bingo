// Render offline do áudio (temas + mixagens por jogo) para WAV + estatísticas (pico, RMS, LUFS aprox.).
// Requer: npx vite --port 5371 (ou PORT). Uso: node scripts/dev/audio-render.mjs [themes|mixes|sounds|all]
// Saída: audio-out/ (fora do git): themes/<id>.wav, mixes/<jogo>.wav, report.txt, report.json
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = createRequire('/opt/node22/lib/node_modules/')('playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(ROOT, 'audio-out');
const what = process.argv[2] ?? 'all';
const THEME_SEC = Number(process.env.SEC ?? 30);
fs.mkdirSync(path.join(OUT, 'themes'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'mixes'), { recursive: true });

/* ---------- loudness (ITU-R BS.1770 simplificado: filtro K + blocos de 400 ms com gate) ---------- */
function biquad(x, b, a) {
  const y = new Float64Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
function kCoefs(fs) {
  // pyloudnorm (shelf + high-pass) para qualquer taxa
  let G = 4.0, Q = 1 / Math.sqrt(2), fc = 1500;
  let A = Math.pow(10, G / 40), w0 = 2 * Math.PI * fc / fs, al = Math.sin(w0) / (2 * Q);
  const shelf = {
    b: [A * ((A + 1) + (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * al), -2 * A * ((A - 1) + (A + 1) * Math.cos(w0)), A * ((A + 1) + (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * al)],
    a: [(A + 1) - (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * al, 2 * ((A - 1) - (A + 1) * Math.cos(w0)), (A + 1) - (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * al],
  };
  fc = 38; Q = 0.5; w0 = 2 * Math.PI * fc / fs; al = Math.sin(w0) / (2 * Q);
  const hp = { b: [(1 + Math.cos(w0)) / 2, -(1 + Math.cos(w0)), (1 + Math.cos(w0)) / 2], a: [1 + al, -2 * Math.cos(w0), 1 - al] };
  const norm = (f) => ({ b: f.b.map((v) => v / f.a[0]), a: f.a.map((v) => v / f.a[0]) });
  return [norm(shelf), norm(hp)];
}
function analyze(wavBuf) {
  const dv = new DataView(wavBuf.buffer, wavBuf.byteOffset, wavBuf.byteLength);
  const ch = dv.getUint16(22, true), sr = dv.getUint32(24, true), n = dv.getUint32(40, true) / (2 * ch);
  const chans = [...Array(ch)].map(() => new Float64Array(n));
  let peak = 0, sum = 0, clip = 0;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = dv.getInt16(44 + (i * ch + c) * 2, true) / 32768;
    chans[c][i] = v; sum += v * v;
    const a = Math.abs(v); if (a > peak) peak = a; if (a >= 0.999) clip++;
  }
  const [sh, hp] = kCoefs(sr);
  const kw = chans.map((x) => biquad(biquad(x, sh.b, sh.a), hp.b, hp.a));
  const blk = Math.floor(sr * 0.4), hop = Math.floor(sr * 0.1);
  const z = [];
  for (let s = 0; s + blk <= n; s += hop) {
    let e = 0;
    for (const k of kw) for (let i = s; i < s + blk; i++) e += k[i] * k[i];
    z.push(e / blk);
  }
  const L = (e) => -0.691 + 10 * Math.log10(e + 1e-12);
  const abs = z.filter((e) => L(e) > -70);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const rel = L(mean(abs)) - 10;
  const gated = abs.filter((e) => L(e) > rel);
  const lufs = L(mean(gated));
  const maxShort = Math.max(...z.map(L));
  return { sec: +(n / sr).toFixed(1), peakDb: +(20 * Math.log10(peak + 1e-9)).toFixed(1), rmsDb: +(10 * Math.log10(sum / (n * ch) + 1e-12)).toFixed(1), lufs: +lufs.toFixed(1), maxMomentary: +maxShort.toFixed(1), clippedSamples: clip };
}

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
await page.goto(`http://localhost:${process.env.PORT ?? 5371}/scripts/dev/audio.html`);
await page.waitForFunction(() => window.__audio, null, { timeout: 60000 });
const report = { themes: {}, mixes: {}, sounds: {} };
const lines = [];
const packs = await page.evaluate(() => window.__audio.packs());
// a página de audição tem um botão por som: confere que montou todos
const nButtons = await page.evaluate(() => document.querySelectorAll('section button').length);
lines.push(`audição: ${packs.length} pacotes, ${nButtons} botões`);

if (what === 'all' || what === 'themes') {
  const themes = await page.evaluate(() => window.__audio.themes());
  lines.push(`\n== TEMAS (${THEME_SEC}s: calm → tension → victory + vinheta win; ganho cru do tema, antes do barramento) ==`);
  for (const id of themes) {
    const r = await page.evaluate(([i, s]) => window.__audio.theme(i, s), [id, THEME_SEC]);
    const buf = Buffer.from(r.wav, 'base64');
    fs.writeFileSync(path.join(OUT, 'themes', `${id}.wav`), buf);
    const a = analyze(buf);
    report.themes[id] = a;
    lines.push(`${id.padEnd(10)} pico ${a.peakDb} dBFS · RMS ${a.rmsDb} · ${a.lufs} LUFS · clip ${a.clippedSamples}`);
    console.log('tema', id, a);
  }
}
if (what === 'all' || what === 'mixes') {
  lines.push('\n== MIXAGENS 20 s por jogo (ganhos padrão do app: Volume 100, Música 80, Efeitos 100; limitador) ==');
  for (const p of packs) {
    if (p.id === 'base' || p.id === 'band') continue;
    const r = await page.evaluate((i) => window.__audio.mix(i, 20), p.id);
    const buf = Buffer.from(r.wav, 'base64');
    fs.writeFileSync(path.join(OUT, 'mixes', `${p.id}.wav`), buf);
    const a = analyze(buf);
    report.mixes[p.id] = a;
    lines.push(`${p.id.padEnd(10)} pico ${a.peakDb} dBFS · ${a.lufs} LUFS (máx. momentâneo ${a.maxMomentary}) · clip ${a.clippedSamples}`);
    console.log('mix', p.id, a);
  }
}
if (what === 'all' || what === 'sounds') {
  lines.push('\n== SONS (pico normalizado por som, dBFS) ==');
  let worst = -99, count = 0;
  for (const p of packs) {
    const row = [];
    for (const n of p.sounds) {
      const r = await page.evaluate((k) => window.__audio.sound(k), `${p.id}.${n}`);
      report.sounds[`${p.id}.${n}`] = r;
      worst = Math.max(worst, r.peakDb);
      count++;
      row.push(`${n} ${r.peakDb.toFixed(1)}/${r.rms300Db.toFixed(1)}`);
    }
    lines.push(`${p.id}: ${row.join(' · ')}`);
  }
  lines.push(`${count} sons; maior pico ${worst.toFixed(1)} dBFS`);
}
fs.writeFileSync(path.join(OUT, 'report.txt'), lines.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
console.log(lines.join('\n'));
await browser.close();
