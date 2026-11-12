// Testes do formato de criações do Bloop Studio (src/studio/format.ts).  Uso: node scripts/test-format.mjs
//
//  1. CONGELADO: scripts/fixtures/format-v3.json tem a saída do format.ts v3 (antes da v4) para criações
//     v1, v2, v3 e todos os starters(). A v4 tem que dar EXATAMENTE o mesmo resultado (só `v` vira 4)
//     e o MESMO hashCreation. Nunca regenere esse arquivo.
//  2. starters() ao vivo: validate → serialize → deserialize sem perdas; hash estável.
//  3. v4: um jogo completo valida sem erros, é idempotente e faz ida-e-volta; cada campo novo
//     descarta entradas inválidas (validação estrita).
//  4. contratos: LIMITS.gameBytes = UGC.maxGameBytes = ENGINE.maxGameBytes; ícones existem em sicons.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const entry = `
export * from './src/studio/format.ts';
export { starters } from './src/studio/starters.ts';
export { UGC } from './shared/ugc.ts';
export { ENGINE, PICTURE_CODE_ICONS, passwordString } from './shared/engine.ts';
export { SICON_NAMES } from './src/studio/ui/sicons.ts';
`;
const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
const M = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
const { validate, migrate, serialize, deserialize, hashCreation, canonical, LIMITS, FORMAT_VERSION } = M;

let failures = 0;
let count = 0;
async function test(name, fn) {
  count++;
  try {
    await fn();
    console.log('ok  ', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '\n     ', e.message.split('\n').slice(0, 12).join('\n      '));
  }
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const roundtrip = async (c) => (await deserialize(await serialize(c))).creation;
/** a saída congelada da v3 com `v` = 4 (inclusive nas deps) */
const asV4 = (c) => {
  const o = { ...clone(c), v: 4 };
  if (o.deps) o.deps = o.deps.map((d) => ({ ...d, v: 4 }));
  return o;
};

/* ------------------------------ 1. congelado v1–v3 ------------------------------ */

const FX = JSON.parse(readFileSync(new URL('./fixtures/format-v3.json', import.meta.url), 'utf8'));
assert.equal(FX.formatVersion, 3);

await test('versão do formato é 4', () => assert.equal(FORMAT_VERSION, 4));

for (const k of FX.cases) {
  await test(`v1–v3 inalterado: ${k.id}`, async () => {
    const r = validate(migrate(clone(k.input)));
    assert.equal(r.ok, k.ok, 'ok');
    assert.deepEqual(r.errors, k.errors, 'erros');
    const want = asV4(k.validated);
    assert.deepEqual(clone(r.creation), want, 'saída do validate');
    assert.equal(hashCreation(r.creation), k.hash, 'hash da v4');
    assert.equal(hashCreation(k.validated), k.hash, 'hash da saída v3 congelada');
    const rt = await roundtrip(r.creation);
    assert.deepEqual(clone(rt), asV4(k.roundtrip), 'serialize/deserialize');
    assert.equal(hashCreation(rt), k.roundtripHash, 'hash depois da ida-e-volta');
    // o que um leitor v3 guardou (v:3) continua igual quando a v4 relê
    const again = validate(migrate(clone(k.validated)));
    assert.deepEqual(clone(again.creation), want, 'releitura do salvo pela v3');
    assert.equal(M.hasEngine(r.creation), false, 'não vira jogo v4');
  });
}

/* ------------------------------ 2. starters ao vivo ------------------------------ */

await test('starters(): mesmos hashes congelados', () => {
  const frozen = new Map(FX.cases.map((k) => [k.id, k]));
  for (const s of M.starters()) {
    const k = frozen.get(s.c.id);
    assert.ok(k, 'starter novo sem fixture: ' + s.c.id);
    assert.equal(hashCreation(validate(clone(s.c)).creation), k.hash, s.c.id);
  }
});
await test('starters(): ida-e-volta e idempotência', async () => {
  for (const s of M.starters()) {
    const r = validate(clone(s.c));
    assert.ok(r.ok, s.c.id + ' ' + r.errors.join(','));
    assert.deepEqual(validate(clone(r.creation)).creation, r.creation, 'idempotente ' + s.c.id);
    const rt = await roundtrip(r.creation);
    assert.equal(hashCreation(rt), hashCreation(r.creation), 'hash ' + s.c.id);
  }
});

/* ------------------------------ 3. v4 ------------------------------ */

const P = (id, x, extra = {}) => ({ id, t: 'box', p: [x, 0, 0], ...extra });
function game() {
  return {
    v: 4,
    id: 'g_teste',
    kind: 'map',
    name: 'Aventura',
    author: 'Ana',
    worldKind: 'flat',
    parts: [P(1, 0, { role: 'spawn' }), P(2, 3, { g: 7 }), P(3, 6, { g: 7 }), P(4, 9, { role: 'goal' })],
    joints: [],
    logic: [],
    materials: [{ c: '#ff5cc8', k: 'plastic' }],
    game: {
      title: 'Aventura',
      desc: 'Três fases',
      tags: ['aventura'],
      maxPlayers: 4,
      modes: { solo: true, story: true, online: { min: 2, max: 4, teams: 2, pvp: false, goal: 'coop' } },
      intro: 'intro',
      cover: 0,
      hud: { vars: ['moedas', 'vidas'] },
      controls: { action: 'hand', action2: 'jump', run: true },
    },
    vars: [
      { name: 'moedas', init: 0, scope: 'player', hud: 'coin', persist: true },
      { name: 'vidas', init: 3, scope: 'game', hud: 'heartl' },
    ],
    anims: [{ id: 'plat', part: 2, loop: 'pingpong', auto: true, keys: [{ t: 0 }, { t: 2, p: [0, 3, 0], ease: 'inout' }] }, { id: 'grupo', g: 7, loop: 'loop', keys: [{ t: 1, r: [0, 90, 0] }] }],
    npcs: [
      {
        id: 'bia',
        name: 'Bia',
        look: { avatar: { parts: { body: 'b_round' }, colors: { primary: '#FF0000', secondary: '#00ff00' } } },
        at: [1, 0, 1],
        yaw: 90,
        path: [[1, 0, 1], [4, 0, 4]],
        speed: 1.5,
        role: 'friend',
        talk: [{ who: 'bia', text: 'Oi! Quer ajuda?', choices: [{ text: 'Sim', set: { v: 'moedas', e: 5 } }, { text: 'Não', go: 'tchau' }] }, { who: 'zeca', text: 'Eu também!' }],
      },
    ],
    scripts: [
      { id: 1, on: { k: 'start' }, body: [{ k: 'cutscene', id: 'intro' }, { k: 'anim', id: 'plat', on: 'play' }, { k: 'hud', text: 'Vai!' }] },
      { id: 2, on: { k: 'talk', npc: 'bia' }, body: [{ k: 'dialog', lines: [{ who: 'player', text: 'Olá' }] }, { k: 'npc', id: 'bia', act: 'walk', part: 4 }] },
      { id: 3, on: { k: 'action', key: 'b' }, body: [{ k: 'camera', cam: 'shake' }, { k: 'emote', pose: 'dance' }, { k: 'it', who: 'toucher' }] },
      { id: 4, on: { k: 'touch', part: 4 }, body: [{ k: 'hide', part: 3 }, { k: 'show' }, { k: 'save' }, { k: 'level', to: 'next' }] },
      { id: 5, on: { k: 'var', v: 'moedas' }, body: [{ k: 'if', c: { op: '>', a: { q: 'level' }, b: 1 }, then: [{ k: 'level', to: 'fase3' }] }] },
      { id: 6, on: { k: 'cutend', id: 'intro' }, body: [{ k: 'say', text: 'Fim da cena' }] },
      { id: 7, on: { k: 'join' }, body: [] },
      { id: 8, on: { k: 'timeup' }, body: [{ k: 'match', on: 'lose' }] },
    ],
    levels: [
      {
        id: 'fase2',
        name: 'Floresta',
        parts: [P(1, 0, { role: 'spawn' }), P(2, 5)],
        joints: [{ id: 1, k: 'hinge', a: 2, b: 0, at: [5, 0, 0], motor: { speed: 2 } }],
        logic: [],
        worldKind: 'infinite',
        seed: 9,
        mission: { objectives: [{ k: 'reach', part: 2 }] },
        anims: [{ id: 'plat', part: 2, loop: 'once', keys: [{ t: 0.5, s: [2, 2, 2] }] }],
        npcs: [{ id: 'zeca', name: 'Zeca', look: { creature: 'cr_cat' }, at: [0, 0, 3], yaw: 0, role: 'shop' }],
        scripts: [{ id: 1, on: { k: 'level' }, body: [{ k: 'npc', id: 'zeca', act: 'face' }, { k: 'dialog', lines: [{ who: 'bia', text: 'Te achei!' }] }] }],
        next: 'fase3',
      },
      { id: 'fase3', name: 'Castelo', parts: [P(1, 0)], joints: [], logic: [], materials: [{ c: '#123456', k: 'metal' }], next: '' },
    ],
    cutscenes: [
      {
        id: 'intro',
        name: 'Começo',
        dur: 8,
        skippable: true,
        cam: [{ t: 4, p: [0, 5, 10], look: { npc: 'bia' }, fov: 50, ease: 'out' }, { t: 0, p: [0, 3, 8], look: [0, 0, 0] }],
        actors: [{ who: 'player', keys: [{ t: 0, p: [0, 0, 0], pose: 'wave', expr: 'happy' }] }, { who: 'part:2', keys: [{ t: 1, p: [3, 1, 0] }] }],
        subs: [{ t: 1, end: 3, who: 'bia', text: 'Bem-vindo!', style: 'speech' }],
        sfx: [{ t: 2, snd: 'fanfare' }],
        fx: [{ t: 2, kind: 'confetti', dur: 1 }],
        music: 'aventura',
        title: { text: 'Aventura', at: 0.5 },
        from: 'cin_123',
      },
      { id: 'fim', name: 'Fim', dur: 4, level: 'fase3', skippable: true, cam: [{ t: 0, p: [0, 2, 4], look: { part: 1 } }], actors: [], subs: [] },
    ],
    story: { steps: [{ k: 'cut', id: 'intro' }, { k: 'level', id: 'main' }, { k: 'level', id: 'fase2' }, { k: 'level', id: 'fase3' }, { k: 'cut', id: 'fim' }, { k: 'end', text: 'Parabéns!' }] },
  };
}

await test('v4: jogo completo valida sem erros', () => {
  const r = validate(game());
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok);
  const c = r.creation;
  assert.equal(c.levels.length, 2);
  assert.equal(c.vars.length, 2);
  assert.equal(c.cutscenes.length, 2);
  assert.equal(c.scripts.length, 8);
  assert.deepEqual(c.cutscenes[0].cam.map((k) => k.t), [0, 4], 'câmera ordenada por t');
  assert.equal(c.npcs[0].look.avatar.colors.primary, '#ff0000');
  assert.equal(c.npcs[0].talk[1].who, 'zeca', 'fala cita NPC de outra fase');
  assert.deepEqual(c.game.modes, { solo: true, story: true, online: { min: 2, max: 4, teams: 2, pvp: false, goal: 'coop' } });
  assert.equal(c.game.intro, 'intro');
  assert.equal(M.hasEngine(c), true);
});
await test('v4: idempotente, ida-e-volta e hash estável', async () => {
  const c = validate(game()).creation;
  assert.deepEqual(validate(clone(c)).creation, c);
  const rt = await roundtrip(c);
  assert.deepEqual(rt, c);
  assert.equal(hashCreation(rt), hashCreation(c));
  const c2 = clone(c);
  c2.cutscenes[0].subs[0].text = 'Outro texto';
  assert.notEqual(hashCreation(c2), hashCreation(c), 'campo v4 entra no hash');
  const c3 = clone(c);
  c3.levels[0].parts[1].p = [5.0001, 0, 0];
  assert.equal(hashCreation(c3), hashCreation(c), 'fases extras também são arredondadas (mm)');
  assert.ok(canonical(c).includes('"v":3'), 'v canônico = 3');
});
await test('v4: helpers levelList / nextLevel / totalParts / collectTexts', () => {
  const c = validate(game()).creation;
  assert.deepEqual(M.levelList(c).map((l) => l.id), ['main', 'fase2', 'fase3']);
  assert.equal(M.nextLevel(c, 'main'), 'fase2');
  assert.equal(M.nextLevel(c, 'fase2'), 'fase3');
  assert.equal(M.nextLevel(c, 'fase3'), '');
  assert.equal(M.totalParts(c), 7);
  const texts = M.collectTexts(c).map((x) => x.text);
  for (const t of ['Aventura', 'Floresta', 'Oi! Quer ajuda?', 'Sim', 'Olá', 'Te achei!', 'Bem-vindo!', 'Parabéns!', 'Vai!', 'Fim da cena', 'Zeca']) assert.ok(texts.includes(t), 'texto ' + t);
});

/** aplica `mut` a um jogo válido e confere o que sobrou + o código de erro */
async function strict(name, mut, check, code) {
  await test('v4 estrito: ' + name, () => {
    const g = game();
    mut(g);
    const r = validate(g);
    assert.ok(r.creation, 'criação recuperável');
    if (code) assert.ok(r.errors.includes(code), `erro "${code}" em [${r.errors}]`);
    check(r.creation);
    assert.deepEqual(validate(clone(r.creation)).errors, [], 'saída saneada é válida');
  });
}
await strict('fase com id repetido / "main" / inválido', (g) => g.levels.push({ id: 'fase2', name: 'x', parts: [], joints: [], logic: [] }, { id: 'main', parts: [] }, { id: 'a b', parts: [] }), (c) => assert.deepEqual(c.levels.map((l) => l.id), ['fase2', 'fase3']), 'level');
await strict('no máximo 8 fases no total', (g) => {
  for (let i = 0; i < 10; i++) g.levels.push({ id: 'x' + i, name: 'x', parts: [], joints: [], logic: [] });
}, (c) => assert.equal(c.levels.length, LIMITS.levels - 1), 'levels-limit');
await strict('peças somadas de todas as fases ≤ LIMITS.parts', (g) => {
  g.levels[1].parts = Array.from({ length: LIMITS.parts }, (_, i) => P(i + 1, i * 0.1));
}, (c) => assert.equal(M.totalParts(c), LIMITS.parts), 'parts-limit');
await strict('next aponta para fase inexistente', (g) => (g.levels[0].next = 'nada'), (c) => assert.equal(c.levels[0].next, undefined), 'level-next');
await strict('animação sem peça/grupo válido e sem quadros', (g) => g.anims.push({ id: 'a1', part: 99, loop: 'loop', keys: [{ t: 0 }] }, { id: 'a2', g: 1, keys: [{ t: 0 }] }, { id: 'a3', part: 1, keys: [] }, { id: 'plat', part: 1, keys: [{ t: 0 }] }), (c) => assert.deepEqual(c.anims.map((a) => a.id), ['plat', 'grupo']), 'anim-part');
await strict('quadros: t limitado, ordenados, ≤ 16', (g) => (g.anims[0].keys = Array.from({ length: 20 }, (_, i) => ({ t: 100 - i, ease: 'nope' }))), (c) => {
  const k = c.anims[0].keys;
  assert.equal(k.length, LIMITS.animKeys);
  assert.ok(k.every((x, i) => i === 0 || x.t >= k[i - 1].t));
  assert.ok(k.every((x) => x.t <= LIMITS.animDur && !x.ease));
});
await strict('NPC com id repetido no jogo / sem posição', (g) => g.levels[1].npcs = [{ id: 'bia', name: 'dup', look: {}, at: [0, 0, 0], yaw: 0 }, { id: 'ok', name: 'Ok', look: {}, yaw: 0 }], (c) => assert.equal(c.levels[1].npcs, undefined), 'npc');
await strict('fala: quem desconhecido vira narrador; fala vazia sai; ≤ 3 escolhas', (g) => {
  g.npcs[0].talk = [{ who: 'fantasma', text: 'Buu', choices: [{ text: 'a' }, { text: '' }, { text: 'b' }, { text: 'c' }, { text: 'd' }] }, { text: '' }];
}, (c) => {
  assert.deepEqual(c.npcs[0].talk, [{ text: 'Buu', choices: [{ text: 'a' }, { text: 'b' }] }]);
}, 'who');
await strict('cena: câmera/ator/legenda inválidos saem; pulável forçado', (g) => {
  const cs = g.cutscenes[0];
  cs.skippable = false;
  cs.cam.push({ t: 1, p: [0, 0, 0], look: { npc: 'ninguem' } }, { t: 1, look: [0, 0, 0] });
  cs.actors.push({ who: 'part:99', keys: [{ t: 0, p: [0, 0, 0] }] }, { who: 'bia', keys: [] });
  cs.subs.push({ t: 2, text: '' });
  cs.fx.push({ t: 1, kind: 'explode' });
  cs.dur = 500;
}, (c) => {
  const cs = c.cutscenes[0];
  assert.equal(cs.skippable, true);
  assert.equal(cs.cam.length, 2);
  assert.equal(cs.actors.length, 2);
  assert.equal(cs.subs.length, 1);
  assert.equal(cs.fx.length, 1);
  assert.equal(cs.dur, LIMITS.cutDur);
}, 'cut-cam');
await strict('cena com id repetido; ≤ 12 cenas', (g) => {
  g.cutscenes.push({ id: 'intro', dur: 2, cam: [], actors: [], subs: [] });
  for (let i = 0; i < 15; i++) g.cutscenes.push({ id: 'c' + i, dur: 2 });
}, (c) => assert.equal(c.cutscenes.length, LIMITS.cutscenes - 1), 'cutscenes-limit'); // o repetido ocupa uma vaga e sai
await strict('Historinha: passos que citam o que não existe saem', (g) => g.story.steps.push({ k: 'cut', id: 'nada' }, { k: 'level', id: 'nada' }, { k: 'pular' }), (c) => assert.equal(c.story.steps.length, 6), 'story-step');
await strict('variáveis: nome repetido/ inválido; HUD só com declaradas (≤ 4)', (g) => {
  g.vars.push({ name: 'moedas', init: 1 }, { name: '', init: 1 }, { name: 'x', init: 1e12, scope: 'nope', hud: 'dragao' });
  g.game.hud.vars = ['moedas', 'nada', 'moedas', 'x', 'vidas'];
}, (c) => {
  assert.deepEqual(c.vars.map((v) => v.name), ['moedas', 'vidas', 'x']);
  assert.deepEqual(c.vars[2], { name: 'x', init: 1e6, scope: 'player' });
  assert.deepEqual(c.game.hud.vars, ['moedas', 'x']);
}, 'var');
await strict('modos: online limitado a 2..8 e min ≤ max; história exige story; intro precisa existir', (g) => {
  g.game.modes.online = { min: 50, max: 99, teams: 3, goal: 'voar' };
  delete g.story;
  g.game.intro = 'nada';
  g.game.cover = 2;
  g.game.controls = { action: 'dragao', run: 'sim' };
}, (c) => {
  assert.deepEqual(c.game.modes, { solo: true, online: { min: 8, max: 8 } });
  assert.equal(c.game.intro, undefined);
  assert.equal(c.game.cover, undefined);
  assert.deepEqual(c.game.controls, {});
}, 'game-intro');
await strict('blocos v4 que citam cena/animação/NPC/fase inexistentes saem', (g) => {
  g.scripts[0].body.push({ k: 'cutscene', id: 'nada' }, { k: 'anim', id: 'nada' }, { k: 'npc', id: 'zeca' }, { k: 'level', to: 'nada' }, { k: 'dialog', lines: [] }, { k: 'hud', text: '' }, { k: 'emote', pose: 'voar' }, { k: 'camera', cam: 'zoom', part: 99 });
}, (c) => assert.deepEqual(c.scripts[0].body.map((b) => b.k), ['cutscene', 'anim', 'hud', 'emote']), 'block');
await strict('eventos v4 com referência inválida saem', (g) => {
  g.scripts.push({ id: 20, on: { k: 'talk', npc: 'zeca' }, body: [] }, { id: 21, on: { k: 'cutend', id: 'nada' }, body: [] }, { id: 22, on: { k: 'var' }, body: [] }, { id: 23, on: { k: 'action', key: 'z' }, body: [] });
}, (c) => {
  assert.deepEqual(c.scripts.slice(8).map((s) => [s.id, s.on]), [[23, { k: 'action', key: 'a' }]]);
}, 'script-ref');
await strict('expressão: q desconhecido vira 0', (g) => (g.scripts[4].body[0].c.a = { q: 'voar' }), (c) => assert.equal(c.scripts[4].body[0].c.a, 0));
await test('v4: dependência importada não carrega jogo', () => {
  const g = game();
  g.deps = [{ ...game(), id: 'dep_x' }];
  const c = validate(g).creation;
  const d = c.deps[0];
  for (const k of ['levels', 'vars', 'anims', 'npcs', 'cutscenes', 'story']) assert.equal(d[k], undefined, k);
});
await test('v4: teto de bytes 1 MB para jogos, 512 KB para o resto', () => {
  const big = 'x'.repeat(60);
  const g = game();
  const pts = Array.from({ length: 600 }, (_, i) => Math.round(Math.sin(i) * 9000) / 1000);
  g.levels[1].parts = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, t: 'stroke', p: [i, 1, 0], pts, w: 0.1, name: big.slice(0, 32) }));
  const r = validate(g);
  const bytes = M.jsonBytes(r.creation);
  assert.ok(bytes > LIMITS.bytes && bytes < LIMITS.gameBytes, 'tamanho do teste ' + bytes);
  assert.ok(!r.errors.includes('bytes'), 'jogo passa até 1 MB');
  const plain = validate({ ...clone(r.creation), levels: undefined, vars: undefined, anims: undefined, npcs: undefined, cutscenes: undefined, story: undefined, parts: r.creation.levels[1].parts });
  assert.ok(plain.errors.includes('bytes'), 'mapa comum continua 512 KB');
});
await test('v5 (futuro): campos desconhecidos somem, "version" avisado', () => {
  const r = validate({ ...game(), v: 5, coisaNova: [1, 2] });
  assert.ok(r.errors.includes('version'));
  assert.equal(r.creation.coisaNova, undefined);
  assert.equal(r.creation.levels.length, 2);
});

/* ------------------------------ 4. contratos ------------------------------ */

await test('contratos: tetos de bytes iguais (format / shared/ugc / shared/engine)', () => {
  assert.equal(LIMITS.gameBytes, M.UGC.maxGameBytes);
  assert.equal(LIMITS.gameBytes, M.ENGINE.maxGameBytes);
  assert.equal(LIMITS.bytes, M.UGC.maxCreationBytes);
  assert.equal(LIMITS.onlineMax, M.ENGINE.maxPlayersOnline);
});
await test('contratos: ícones do jogo e do código de figuras existem em sicons', () => {
  const have = new Set(M.SICON_NAMES);
  for (const i of [...M.GAME_ICONS, ...M.PICTURE_CODE_ICONS]) assert.ok(have.has(i), 'ícone ' + i);
  assert.equal(M.PICTURE_CODE_ICONS.length, 12);
});
await test('contratos: senha canônica', () => {
  assert.equal(M.passwordString({ kind: 'pic', icons: [0, 11, 3, 3] }), 'pic:0-11-3-3');
  assert.equal(M.passwordString({ kind: 'pic', icons: [0, 12, 3, 3] }), null);
  assert.equal(M.passwordString({ kind: 'pic', icons: [0, 1, 2] }), null);
  assert.equal(M.passwordString({ kind: 'text', text: '  Banana ' }), 'txt:banana');
  assert.equal(M.passwordString({ kind: 'text', text: 'abc' }), null);
});
await test('contratos: blocos e eventos v3 vêm primeiro (só acrescentar no fim)', () => {
  assert.deepEqual(M.BLOCK_KINDS_V3, ['move', 'rotate', 'teleport', 'spawn', 'destroy', 'sound', 'say', 'score', 'color', 'force', 'door', 'light', 'motor', 'checkpoint', 'set', 'change', 'if', 'repeat', 'wait', 'team', 'lives', 'match', 'send']);
  assert.deepEqual(M.SCRIPT_EVENTS.slice(0, 8), ['start', 'touch', 'zone', 'every', 'collect', 'die', 'button', 'message']);
});

console.log(`\n${count - failures}/${count} ok`);
process.exitCode = failures ? 1 : 0;
