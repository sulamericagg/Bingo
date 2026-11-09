// Testes do QualityGovernor / FpsLimiter (src/core/quality.ts). Uso: node scripts/test-quality.mjs
import { build } from 'esbuild';
import assert from 'node:assert/strict';

const out = await build({ entryPoints: ['src/core/quality.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral' });
const Q = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { QualityGovernor, FpsLimiter, settingsFor } = Q;

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('ok  ', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '\n     ', e.message);
  }
}

/** alimenta o governor com `sec` segundos de frames gerados por gen(t) -> [frameMs, workMs?] */
function feed(gov, sec, gen, log) {
  let t = 0;
  while (t < sec * 1000) {
    const [f, w] = gen(t, gov.tier);
    gov.sample(f, w);
    t += f;
  }
  return log;
}
function mk(initial, extra = {}) {
  const changes = [];
  // eslint-disable-next-line prefer-const
  let gov;
  gov = new QualityGovernor({ initial, mode: 'auto', persist: false, emit: false, onChange: (t, _s, why) => changes.push({ t, why, at: clockOf(gov) }), ...extra });
  return { gov, changes };
}
const clockOf = (g) => (g ? g.clock : 0);

test('settingsFor: níveis coerentes', () => {
  assert.equal(settingsFor(0).fpsCap, 30);
  assert.equal(settingsFor(3).dprCap, 2);
  assert.ok(settingsFor(1).particleBudget < settingsFor(2).particleBudget);
});

test('60 fps estável em 60 Hz: não muda nada (2 min)', () => {
  const { gov, changes } = mk(3);
  feed(gov, 120, () => [16.67 + (Math.random() - 0.5) * 2, 9]);
  assert.equal(gov.tier, 3);
  assert.equal(changes.length, 0);
});

test('queda súbita (frame 45 ms): desce rápido (<1 s) e continua descendo enquanto lento', () => {
  const { gov, changes } = mk(3);
  feed(gov, 5, () => [16.7, 8]);
  let t = 0;
  // custo cai pela metade a cada nível abaixo
  const cost = { 3: 45, 2: 30, 1: 16.7, 0: 33.4 };
  let firstAt = -1;
  while (t < 20000) {
    const f = cost[gov.tier];
    gov.sample(f, f * 0.8);
    t += f;
    if (firstAt < 0 && changes.length) firstAt = t;
  }
  assert.ok(firstAt > 0 && firstAt < 1000, 'primeira descida em ' + firstAt);
  assert.equal(gov.tier, 1, 'deveria parar no Baixo, ficou ' + gov.tier);
});

test('lentidão moderada (24 ms) desce em ~2 s', () => {
  const { gov, changes } = mk(2);
  let t = 0;
  let at = -1;
  while (t < 6000 && at < 0) {
    gov.sample(24, 20);
    t += 24;
    if (changes.length) at = t;
  }
  assert.ok(at >= 1900 && at <= 3200, 'desceu em ' + at);
});

test('hitches isolados (1 frame de 120 ms a cada 3 s) não derrubam', () => {
  const { gov, changes } = mk(3);
  let t = 0;
  let next = 3000;
  while (t < 60000) {
    let f = 16.7;
    if (t > next) {
      f = 120;
      next += 3000;
    }
    gov.sample(f, 7);
    t += f;
  }
  assert.equal(changes.length, 0, JSON.stringify(changes));
});

test('pausa (frame de 2 s) é ignorada', () => {
  const { gov, changes } = mk(3);
  feed(gov, 3, () => [16.7, 6]);
  gov.sample(2000);
  feed(gov, 3, () => [16.7, 6]);
  assert.equal(changes.length, 0);
});

test('oscilação: aparelho no limite não fica alternando (anti-flap)', () => {
  // nível 2 roda folgado (cpu 6 ms), nível 3 é lento (23 ms)
  const { gov, changes } = mk(2);
  feed(gov, 300, (_t, tier) => (tier >= 3 ? [23, 19] : [16.7, 6]));
  // em 5 min: no máx. algumas tentativas, com intervalos crescentes
  const ups = changes.filter((c) => c.why.startsWith('folga')).length;
  assert.ok(ups <= 4, 'subidas demais: ' + ups + ' ' + JSON.stringify(changes));
  assert.ok(changes.length <= 8, 'mudanças demais: ' + changes.length);
  console.log('      tentativas:', changes.map((c) => c.t + '@' + Math.round(c.at / 1000) + 's').join(' '));
  // intervalo entre tentativas de subida cresce
  const upT = changes.filter((c) => c.t === 3).map((c) => c.at);
  for (let i = 2; i < upT.length; i++) assert.ok(upT[i] - upT[i - 1] > upT[i - 1] - upT[i - 2], 'intervalo não cresceu');
});

test('oscilação de frames alternando 12/24 ms (média 18) não desce', () => {
  const { gov, changes } = mk(3);
  let i = 0;
  feed(gov, 60, () => [i++ % 2 ? 12 : 24, 8]);
  assert.equal(changes.length, 0, JSON.stringify(changes));
});

test('recuperação: após ficar lento e voltar a folga, sobe 1 nível por vez (≥20 s entre passos)', () => {
  const { gov, changes } = mk(3);
  feed(gov, 8, () => [40, 35]); // throttling: vai ao fundo
  const low = gov.tier;
  assert.ok(low <= 1, 'deveria ter descido, está em ' + low);
  const before = changes.length;
  let t = 0;
  const ups = [];
  while (t < 120000) {
    const tier = gov.tier;
    gov.sample(tier === 0 ? 33.4 : 16.7, 4);
    t += tier === 0 ? 33.4 : 16.7;
    if (gov.tier !== tier) ups.push({ t, tier: gov.tier });
  }
  assert.equal(gov.tier, 3, 'deveria voltar ao Alto: ' + JSON.stringify(ups));
  for (let i = 1; i < ups.length; i++) assert.ok(ups[i].t - ups[i - 1].t >= 19900, 'passos rápidos demais');
  assert.ok(changes.length - before === 3 - low);
});

test('sem workMs em tela 60 Hz: não sobe (sem evidência de folga)', () => {
  const { gov } = mk(1);
  feed(gov, 60, () => [16.7]);
  assert.equal(gov.tier, 1);
});

test('tela 120 Hz sem workMs: sobe pela média < 12 ms', () => {
  const { gov } = mk(1);
  feed(gov, 60, () => [8.3]);
  assert.ok(gov.tier >= 2);
});

test('teto manual (maxTier) é respeitado', () => {
  const { gov } = mk(1, { maxTier: 2 });
  feed(gov, 200, () => [8.3, 3]);
  assert.equal(gov.tier, 2);
});

test('modo manual fixo: governor não mexe', () => {
  const { gov, changes } = mk(3, { mode: 2 });
  assert.equal(gov.tier, 2);
  feed(gov, 20, () => [50, 45]);
  assert.equal(gov.tier, 2);
  gov.setMode('auto');
  assert.equal(gov.tier, 3);
  feed(gov, 5, () => [50, 45]);
  assert.ok(gov.tier < 3);
  assert.ok(changes.length >= 2);
});

test('fpsCap 30 (nível 0): 33 ms é normal, sobe com CPU folgada', () => {
  const { gov, changes } = mk(0);
  feed(gov, 15, (_t, tier) => [tier === 0 ? 33.4 : 16.7, 5]);
  assert.equal(gov.tier, 1, JSON.stringify(changes));
});

test('FpsLimiter 30 em 60 Hz desenha metade dos frames', () => {
  const l = new FpsLimiter(30);
  let n = 0;
  for (let i = 0; i < 600; i++) if (l.shouldRender(i * 16.667 + (Math.random() - 0.5) * 1.5)) n++;
  assert.ok(n >= 295 && n <= 305, 'renderizou ' + n);
});

test('FpsLimiter 60 em 120 Hz desenha metade; em 60 Hz desenha todos', () => {
  const a = new FpsLimiter(60);
  let n = 0;
  for (let i = 0; i < 1200; i++) if (a.shouldRender(i * 8.333)) n++;
  assert.ok(n >= 595 && n <= 605, '120Hz: ' + n);
  const b = new FpsLimiter(60);
  n = 0;
  for (let i = 0; i < 600; i++) if (b.shouldRender(i * 16.667 + (Math.random() - 0.5) * 2)) n++;
  assert.ok(n >= 598, '60Hz: ' + n);
});

test('FpsLimiter 30 em 90 Hz ≈ 30 fps', () => {
  const l = new FpsLimiter(30);
  let n = 0;
  for (let i = 0; i < 900; i++) if (l.shouldRender(i * 11.111)) n++;
  assert.ok(n >= 295 && n <= 305, '90Hz: ' + n);
});

console.log(failures ? `\n${failures} falha(s)` : '\ntodos os testes passaram');
process.exit(failures ? 1 : 0);
