#!/usr/bin/env node
/**
 * Testes do OBJETO FALADO (Cava & Fala) — sem rede, sem chave, sem navegador:
 *   1. validador (shared/cavaspec.ts): JSON malicioso/gigante, números ruins, cores/comportamentos fora da lista,
 *      nome com palavrão/HTML, forma compacta (rede) ida e volta, pedidos perigosos → versão boba.
 *   2. gerador offline (shared/cavagen): 200 frases aleatórias → todas válidas, determinísticas, ≤ 24 peças;
 *      cobertura em 300 frases de criança (quantas viram um objeto reconhecível SEM a IA).
 *   3. montador: blocos (voxel.ts) sem NaN + física/comportamentos (creation.ts/cbody.ts) por 10 s estáveis.
 *   4. endpoint POST /api/cava/make (server/cava-ai.ts): catálogo, cache, IA falsa (fixtures, Claude falso,
 *      Workers AI falso), pedido barrado → 422 + denúncia, limite → 429.
 *
 *   node scripts/test-cava-make.mjs
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const dir = mkdtempSync(join(process.cwd(), 'node_modules', '.cavamake-'));
const stub = {
  name: 'stub',
  setup(b) {
    // som/efeitos do jogo não existem no Node
    b.onResolve({ filter: /3d\/common\/sfx$/ }, () => ({ path: 'sfx', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'const f=()=>{};export const sfx=new Proxy({}, {get:()=>f});', loader: 'js' }));
  },
};
async function bundle(entry, name, external = false) {
  const out = join(dir, name + '.mjs');
  await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', plugins: [stub], ...(external ? { packages: 'external' } : {}) });
  return import(pathToFileURL(out).href);
}
let pass = 0;
const ok = (name) => (pass++, console.log('  ✓', name));
const section = (s) => console.log('\n' + s);

try {
  const S = await bundle('shared/cavaspec.ts', 'spec');
  const G = await bundle('shared/cavagen/index.ts', 'gen');

  /* ============================== 1. validador ============================== */
  section('1. validador / segurança');
  {
    assert.equal(S.validateSpec('{"parts": [', {}), null);
    assert.equal(S.validateSpec('x'.repeat(30000)), null);
    assert.equal(S.validateSpec(null), null);
    assert.equal(S.validateSpec([1, 2]), null);
    assert.equal(S.validateSpec({ parts: [] }), null);
    ok('JSON quebrado / gigante / vazio → null');
  }
  {
    const evil = {
      name: '<script>alert(1)</script> porra',
      desc: 'me liga 11 99999-8888',
      role: 'nuke',
      body: 'dynamic',
      parts: Array.from({ length: 500 }, (_, i) => ({ shape: i % 3 ? 'box' : 'tetrahedron', size: [1e9, -5, 'x'], pos: [NaN, Infinity, -1e9], rot: [1e9, 0, 0], color: i % 2 ? '#123456' : 'ultraviolet', mat: 'plutonium', joint: { type: 'rocket', axis: 'w', speed: 1e6, swing: -100 } })),
      behaviors: [{ type: 'explodes', power: 99 }, { type: 'shoots', power: 99, kind: 'bullets' }, { type: 'shoots', power: 1 }, { type: 'flies', power: -3, kind: 'jet' }, { type: 'x' }, { type: 'glows' }, { type: 'grows' }, { type: 'digs' }, { type: 'sticks' }, { type: 'ride' }],
      seat: [1e9, 1e9, 1e9],
    };
    const s = S.validateSpec(evil, { fallbackName: 'Robô' });
    assert.ok(s);
    assert.equal(s.parts.length, 24);
    assert.ok(s.behaviors.length <= 6);
    assert.ok(s.behaviors.every((b) => Object.keys(S.BEHAVIORS).includes(b.type)));
    const sh = s.behaviors.find((b) => b.type === 'shoots');
    assert.equal(sh.kind, 'bubbles');
    assert.ok(s.behaviors.every((b) => b.power >= 0 && b.power <= 1));
    assert.ok(!s.behaviors.some((b) => b.type === 'explodes'));
    for (const p of s.parts) {
      assert.ok(S.SHAPES.includes(p.shape));
      assert.ok(S.COLOR_NAMES.includes(p.color));
      assert.ok(S.OBJ_MATS.includes(p.mat));
      for (const v of [...p.size, ...p.pos, ...p.rot]) assert.ok(Number.isFinite(v));
      assert.ok(p.size.every((v) => v >= 0.04 && v <= 8));
      assert.equal(p.joint, undefined); // junta inválida cai fora
    }
    assert.ok(S.specExtent(s) <= S.SPEC_LIMITS.extent + 0.01, 'encolhe para caber');
    assert.ok(S.specVolume(s) <= S.SPEC_LIMITS.volume + 1e-6);
    assert.equal(s.name, 'Robô'); // nome com palavrão/HTML → reserva
    assert.equal(s.desc, ''); // telefone → fora
    assert.equal(s.role, 'attack');
    assert.ok(!s.seat || s.seat.every((v) => Math.abs(v) <= 12));
    ok('objeto malicioso → consertado (24 peças, números finitos, só paleta/lista, nome limpo, cabe no limite)');
  }
  {
    assert.equal(S.snapColor('#ff0000'), 'red');
    assert.equal(S.snapColor('vermelho'), 'red');
    assert.equal(S.snapColor('Azul-claro'), 'sky');
    assert.equal(S.snapColor('#fff'), 'white');
    ok('cores: hex e nomes pt → paleta');
  }
  {
    const s = S.validateSpec({ name: 'Carro', parts: [{ shape: 'box', size: [2, 1, 3], pos: [0, 0.5, 0], rot: [0, 0, 0], color: 'red', mat: 'metal' }, { shape: 'cylinder', size: [0.8, 0.3, 0.8], pos: [1, 0.4, 1], rot: [0, 0, 90], color: 'black', mat: 'rubber', joint: { type: 'wheel', axis: 'x', speed: 1, swing: 0 } }], behaviors: [{ type: 'rolls', power: 0.7 }, { type: 'ride', power: 0.5 }] });
    const packed = S.packSpec(s);
    const back = S.unpackSpec(JSON.parse(JSON.stringify(packed)));
    assert.deepEqual(S.packSpec(back), packed);
    assert.ok(JSON.stringify(packed).length < 400);
    assert.equal(S.unpackSpec([2, 'x']), null);
    assert.equal(S.unpackSpec('lixo'), null);
    const arena = S.unpackSpec(packed, { arena: true });
    assert.ok(S.specExtent(arena) <= S.SPEC_LIMITS.arenaExtent + 0.01);
    assert.ok(arena.behaviors.every((b) => b.power <= S.SPEC_LIMITS.arenaPower));
    ok('forma compacta (rede): ida e volta igual, lixo → null, limites da arena aplicados');
  }
  {
    const k = (t) => S.kidSafeRequest(t);
    let r = k('uma arma gigante');
    assert.equal(r.level, 'soft');
    assert.match(r.text, /lancador de espuma|lançador de espuma/);
    r = k('uma faca de cozinha');
    assert.match(r.text, /colher/);
    r = k('bomba que explode tudo');
    assert.match(r.text, /confete/);
    r = k('um tanque de guerra com metralhadora');
    assert.match(r.text, /bolhas/);
    assert.match(r.text, /espuma/);
    r = k('pikachu gigante');
    assert.match(r.text, /ratinho eletrico amarelo|ratinho elétrico amarelo/);
    assert.ok(!/pikachu/.test(r.text));
    r = k('a ferrari car');
    assert.ok(!/ferrari/.test(r.text));
    r = k('dragão que cospe fogo e sangue');
    assert.ok(!/fogo|sangue/.test(r.text.replace('faiscas', '')));
    r = k('uma buceta');
    assert.equal(r.level, 'block');
    assert.equal(r.text, 'um patinho de borracha gigante');
    r = k('me liga 11 98888-7777');
    assert.equal(r.level, 'block');
    r = k('um nazista');
    assert.equal(r.level, 'block');
    r = k('um gatinho fofo');
    assert.equal(r.level, 'ok');
    ok('pedido seguro: arma/faca/bomba/sangue/marca → versão boba; palavrão/dado pessoal/ódio → bloqueado');
  }

  /* ============================== 2. gerador ============================== */
  section('2. gerador offline');
  const stats = G.vocabStats();
  console.log('  vocabulário:', JSON.stringify(stats));
  assert.ok(stats.concepts >= 250);
  {
    const nouns = G.CONCEPTS.map((c) => c.words[Math.floor(c.words.length / 2)]);
    const adj = ['gigante', 'pequeno', 'azul', 'vermelho', 'de ouro', 'de madeira', 'rápido', 'colorido', 'alto', 'de cristal', 'brilhante', 'mini', 'dourado', 'roxo'];
    const verbs = ['que voa', 'que nada', 'que pula', 'que joga bolhas', 'que solta confete', 'que anda', 'que brilha', 'que me segue', 'que cava', 'que sopra vento', 'que dá pra montar', 'que canta'];
    const acc = ['com rodas', 'com asas', 'com hélice', 'com rodas gigantes', 'com luzes', 'com molas', 'com escorregador', 'com chifres', 'com balões', 'com olhos'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const phrases = [];
    for (let i = 0; i < 200; i++) {
      const t = Math.floor(rnd() * 6);
      phrases.push(
        t === 0 ? `um ${pick(nouns)}` : t === 1 ? `um ${pick(nouns)} ${pick(adj)}` : t === 2 ? `um ${pick(nouns)} de ${pick(nouns)}` : t === 3 ? `um ${pick(nouns)} ${pick(verbs)}` : t === 4 ? `um ${pick(nouns)} ${pick(acc)} ${pick(verbs)}` : `${pick(['eu quero', 'faz', 'cria'])} ${pick(['dois', 'um', 'uma'])} ${pick(nouns)} ${pick(adj)} ${pick(acc)}`,
      );
    }
    for (const p of ['xyzzy', '', '!!!', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'um 🦄 com 🚀', 'casa casa casa casa casa casa casa casa casa casa']) phrases.push(p);
    let parts = 0,
      maxParts = 0;
    for (const p of phrases) {
      const a = G.generate(p);
      const b = G.generate(p);
      assert.deepEqual(a.spec, b.spec, 'determinístico: ' + p);
      const v = S.validateSpec(JSON.parse(JSON.stringify(a.spec)));
      assert.ok(v, 'válido: ' + p);
      assert.ok(a.spec.parts.length >= 1 && a.spec.parts.length <= 24, 'peças: ' + p);
      assert.ok(S.specExtent(a.spec) <= S.SPEC_LIMITS.extent + 0.01, 'tamanho: ' + p);
      assert.ok(a.spec.name.length > 0 && a.spec.name.length <= 40);
      assert.ok(JSON.stringify(S.packSpec(a.spec)).length < 3500, 'cabe no evento da rede: ' + p);
      parts += a.spec.parts.length;
      maxParts = Math.max(maxParts, a.spec.parts.length);
    }
    ok(`${phrases.length} frases aleatórias → todas válidas, determinísticas, ≤ 24 peças (média ${(parts / phrases.length).toFixed(1)}), cabem na rede`);
    const v1 = G.generate('um dragão de pizza que voa', { variant: 1 });
    const v0 = G.generate('um dragão de pizza que voa');
    assert.notDeepEqual(v1.spec, v0.spec);
    ok('Refazer (variante) muda o objeto');
  }
  {
    // composição: o que cada frase de exemplo precisa ter
    const chk = (t, f) => {
      const r = G.generate(t);
      assert.ok(f(r), t + ' → ' + JSON.stringify({ main: r.plan.main, beh: r.spec.behaviors }));
    };
    chk('um dragão de pizza que voa', (r) => r.plan.main.id === 'dragao' && r.plan.main.theme === 'pizza' && r.spec.behaviors.some((b) => b.type === 'flies' && b.kind === 'wings'));
    chk('uma casa na árvore com escorregador', (r) => r.plan.main.id === 'casa_na_arvore' && r.plan.main.with.some((w) => w.id === 'escorregador') && r.spec.body === 'static');
    chk('um carro de sorvete com rodas gigantes', (r) => r.plan.main.id === 'carro' && r.plan.main.theme === 'sorvete' && r.plan.main.with[0].id === 'rodas' && r.plan.main.with[0].scale > 1.5);
    chk('uma ponte de arco-íris', (r) => r.plan.main.id === 'ponte' && new Set(r.spec.parts.map((p) => p.color)).size >= 5 && r.fn === 'bridge');
    chk('um robô que joga bolhas', (r) => r.plan.main.id === 'robo' && r.spec.behaviors.some((b) => b.type === 'shoots' && b.kind === 'bubbles'));
    chk('um barco de banana', (r) => r.plan.main.id === 'barco' && r.spec.parts.some((p) => p.color === 'yellow') && r.spec.behaviors.some((b) => b.type === 'floats'));
    chk('a big red car with wings', (r) => r.plan.main.id === 'carro' && r.plan.main.color === 'red' && r.spec.behaviors.some((b) => b.type === 'flies'));
    chk('casa que voa', (r) => r.spec.body === 'dynamic' && r.spec.behaviors.some((b) => b.type === 'flies'));
    chk('um gatinho azul', (r) => r.plan.main.id === 'gato' && r.plan.main.color === 'blue' && r.plan.main.scale[0] < 1);
    chk('dois cachorros', (r) => r.plan.main.count === 2);
    chk('um gato no barco', (r) => r.plan.base?.id === 'barco' && r.spec.behaviors.some((b) => b.type === 'floats'));
    chk('vaquinha de ouro', (r) => r.plan.main.id === 'vaca' && r.spec.parts.some((p) => p.color === 'gold'));
    chk('ornitorrinco', (r) => r.confidence < 0.6 && r.unknown.includes('ornitorrinco'));
    chk('ornitorrinco', (r) => G.generate('ornitorrinco', { learned: { ornitorrinco: { id: 'lontra' } } }).plan.main.id === 'lontra');
    ok('composição: X de Y (tema/casco), X com Y, X que Z, X no Y, cor/tamanho/quantidade, palavra aprendida');
    assert.equal(G.isCommand('ponte'), true);
    assert.equal(G.isCommand('trampolim de ouro'), true);
    assert.equal(G.isCommand('robô que joga bolhas'), false);
    assert.equal(G.isCommand('carro com asas'), false);
    ok('pedido curto → catálogo; frase descritiva → objeto falado');
  }
  {
    // cobertura: 300 frases como uma criança falaria (vocabulário escolhido SEM olhar o catálogo)
    const kidNouns = ('cachorro gato cavalo unicórnio dragão dinossauro vaca porco galinha pato coruja pinguim tubarão baleia golfinho polvo abelha borboleta joaninha formiga aranha cobra sapo tartaruga coelho leão tigre elefante girafa macaco urso panda zebra jacaré peixe ' +
      'carro caminhão ônibus trem avião helicóptero foguete barco navio submarino bicicleta moto skate trator ambulância escavadeira ' +
      'casa castelo torre ponte escada escorregador balanço piscina barraca iglu farol prédio cama cadeira mesa sofá geladeira televisão computador abajur ' +
      'pizza hambúrguer sorvete bolo banana maçã melancia morango cenoura pipoca chocolate pirulito biscoito brigadeiro queijo ovo ' +
      'árvore flor cacto pedra montanha nuvem sol lua estrela arco-íris vulcão robô monstro fantasma alien bola pipa boneca ursinho dado presente baú coroa chapéu guarda-chuva ' +
      'ornitorrinco axolote kombi lhama capivara tamanduá preguiça carrossel roda-gigante trampolim vassoura caldeirão varinha poção fada sereia pirata ninja astronauta bombeiro ' +
      'tatu mamute pégaso centauro hamster papagaio flamingo camaleão minhoca caracol lagosta foca morcego zumbi múmia caveira esqueleto tanque jipe limusine canoa jangada ' +
      'cupcake rosquinha panqueca coxinha pastel taco sushi milho abacaxi uva limão pêra coco abóbora tomate brócolis cogumelo').split(' ');
    const adj = ['', '', 'gigante', 'pequeno', 'azul', 'rosa', 'verde', 'de ouro', 'colorido', 'brilhante', 'rápido', 'fofinho', 'malvado', 'feliz', 'de chocolate', 'de gelo', 'voador'];
    const tail = ['', '', '', 'que voa', 'que nada', 'que pula', 'com asas', 'com rodas', 'que solta bolhas', 'que me segue', 'que brilha no escuro', 'com chapéu', 'de pizza', 'de banana', 'que dança', 'que faz barulho'];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    let good = 0,
      partly = 0;
    const misses = [];
    for (let i = 0; i < 300; i++) {
      const p = `${pick(['um', 'uma', 'eu quero um', 'faz um', 'quero uma', ''])} ${pick(kidNouns)} ${pick(adj)} ${pick(tail)}`.replace(/\s+/g, ' ').trim();
      const r = G.generate(p);
      if (r.confidence >= 0.6 && !r.unknown.length) good++;
      else if (r.confidence >= 0.3) (partly++, misses.push(p + ' [' + r.unknown.join(',') + ']'));
      else misses.push(p + ' [' + r.unknown.join(',') + ']');
    }
    const uniq = [...new Set(misses.map((m) => /\[(.*)\]/.exec(m)[1]))].filter(Boolean);
    console.log(`  cobertura sem IA: ${good}/300 entendidas por completo (${Math.round((good / 300) * 100)}%), ${partly} com alguma palavra nova (objeto ainda sai, IA melhora)`);
    console.log('  palavras que o catálogo não conhece:', uniq.slice(0, 30).join(', '));
    assert.ok(good >= 230, 'cobertura mínima 75%');
    ok('cobertura em 300 frases de criança');
    globalThis.__coverage = { good, partly, uniq };
  }

  {
    // cobertura em lista SEPARADA, escrita depois do catálogo e NÃO usada para ajustá-lo (número honesto)
    const held = ('escova de dente,tesoura,lixeira,patinete,caminhonete,formigueiro,colmeia,teia de aranha,escada rolante,elevador,semaforo,hidrante,cachoeira,lago,planeta,cometa,tornado,raio,neve,presepio,arvore de natal,gato preto,arraia,enguia,camarao,ostra,concha,perola,tesouro,mapa,bussola,luneta,navio pirata,rede,cadeira de praia,algodao doce,montanha russa,gira gira,bola de gude,capacete,estojo,borracha,caderno,quadro negro,despertador,videogame,controle remoto,celular,micro-ondas,liquidificador,torradeira,panela,frigideira,chaleira,bule,garfo,prato,rei,rainha,cavaleiro,duende,gnomo,elfo,anao,lobisomem,saci,curupira,iara,boitata,cuca,mula sem cabeca,boto cor de rosa,jabuti,arara azul,mico leao dourado,tucano,boto,pirarucu,sabia,quati,ema,seriema,jacare de papo amarelo,lobo guara,bicho preguica,beija flor,carro de corrida,caminhao de lixo,trator amarelo,aviao de papel,barco a vela,balao de sao joao,pipa colorida,carrinho de rolima,patins de gelo,escorregador gigante,casa de bonecas,cabana de madeira,torre de vigia,farol vermelho,ponte pensil,tunel,estacao de trem,aeroporto,hospital,escola,padaria,sorveteria,pizzaria,zoologico,fazenda,celeiro,galinheiro,estabulo,moinho,poco,fonte,chafariz,estatua,banco de praca,parquinho,caixa de areia,casa de passarinho,aquario,gaiola,casinha de cachorro,arranhador de gato,cama de gato,bola de la,novelo,meia,luva,cachecol,gorro,oculos escuros,relogio de pulso,anel,colar,coroa de flores,buque,vaso de flor,regador,mangueira,carrinho de mao,enxada,rastelo,espantalho,abobora de halloween,vela de aniversario,bolo de morango,brigadeiro gigante,pao de queijo,coxinha voadora,pastel de vento,tapioca,acaraje,pamonha,cocada,paçoca,pe de moleque,quindim,beijinho,cajuzinho,sorvete de flocos,milkshake,suco de laranja,agua de coco,cafe com leite,chocolate quente').split(',');
    const tails = ['', '', 'gigante', 'que voa', 'colorido', 'com rodas', 'de ouro', 'que pula', 'azul', 'que brilha'];
    let seed = 99;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let good = 0,
      head = 0;
    const unk = new Map();
    for (let i = 0; i < 300; i++) {
      const p = `um ${held[Math.floor(rnd() * held.length)]} ${tails[Math.floor(rnd() * tails.length)]}`.trim();
      const r = G.generate(p);
      if (r.confidence >= 0.6 && !r.unknown.length) good++;
      if (r.confidence > 0.15) head++;
      for (const u of r.unknown) unk.set(u, (unk.get(u) ?? 0) + 1);
    }
    console.log(`  cobertura em lista separada (não usada para ajustar o catálogo): ${good}/300 entendidas por completo (${Math.round((good / 300) * 100)}%), ${head}/300 com o objeto principal reconhecido (${Math.round((head / 300) * 100)}%); o resto vira bichinho-mistério até a IA ensinar`);
    console.log('  desconhecidas mais comuns:', [...unk.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([w, n]) => w + '×' + n).join(', '));
    assert.ok(good >= 120);
    ok('cobertura em lista separada (relatório)');
    globalThis.__held = good;
  }

  /* ============================== 3. montador ============================== */
  section('3. montador (blocos + física por 10 s)');
  {
    const V = await bundle('src/games/cavafala/voxel.ts', 'voxel');
    const CR = await bundle('src/games/cavafala/creation.ts', 'creation');
    const THREE = await import(pathToFileURL(join(process.cwd(), 'node_modules/three/build/three.module.js')).href);
    // terreno falso: chão em y=0 (água em y=-2 num buraco à esquerda)
    const T = {
      oy: -20,
      sample: (x, y, z) => {
        const g = x < -30 ? -4 : Math.sin(x * 0.15) * 0.4 + Math.cos(z * 0.2) * 0.3;
        return g - y;
      },
      normal(x, y, z, out) {
        const h = 0.25;
        out.set(this.sample(x - h, y, z) - this.sample(x + h, y, z), this.sample(x, y - h, z) - this.sample(x, y + h, z), this.sample(x, y, z - h) - this.sample(x, y, z + h));
        const l = out.length();
        return l < 1e-6 ? out.set(0, 1, 0) : out.multiplyScalar(1 / l);
      },
      groundY(x, z) {
        return x < -30 ? -4 : Math.sin(x * 0.15) * 0.4 + Math.cos(z * 0.2) * 0.3;
      },
      dig: () => 0,
      matAt: () => 2,
    };
    const phys = { terrain: T, boxes: [], bounds: { x0: -80, z0: -80, x1: 80, z1: 80 }, waterY: -2, gravity: 19 };
    const actors = [];
    const mkActor = (x, z, isPlayer) => ({ isPlayer, alive: true, remote: false, body: { p: new THREE.Vector3(x, 0, z), v: new THREE.Vector3(), groundBox: null }, inv: {}, shieldT: 0, yaw: 0 });
    const me = mkActor(0, 0, true);
    actors.push(me, mkActor(8, 8, false));
    let shots = 0;
    const host = {
      scene: new THREE.Scene(),
      phys,
      fx: { sparkle() {}, dust() {}, water() {}, parts: { emit() {} } },
      T,
      actors,
      me,
      time: 0,
      arena: false,
      net: null,
      isNear: () => true,
      shootSoft: () => shots++,
      knock() {},
      nearestFoe: () => actors[1],
      takeLight: () => true,
      freeLight() {},
      backpackOf: (a, out) => out.copy(a.body.p).add(new THREE.Vector3(0, 1, 0)),
      digAt() {},
      refreshBoxes() {
        phys.boxes = list.flatMap((c) => c.cols.map((k) => k.box));
      },
    };
    const list = [];
    const texts = ['um dragão de pizza que voa', 'uma casa na árvore com escorregador', 'um carro de sorvete com rodas gigantes', 'uma ponte de arco-íris', 'um robô que joga bolhas', 'um barco de banana', 'uma bola que quica', 'um coelho que pula', 'um foguete', 'um balão de ar quente', 'uma girafa gigante', 'um castelo', 'um trampolim', 'um polvo que nada', 'um trem de chocolate', 'um ventilador gigante', 'uma escavadeira que cava', 'um cachorro que me segue', 'uma nuvem que voa', 'um disco voador'];
    let blocks = 0;
    for (const [i, t] of texts.entries()) {
      const g = G.generate(t);
      const vx = V.voxelize(g.spec);
      assert.ok(vx.count > 0 && vx.shown > 0 && vx.shown <= vx.count, t);
      for (const gr of vx.groups) for (const c of gr.cells) assert.ok(Number.isFinite(c.x + c.y + c.z), 'bloco NaN em ' + t);
      assert.ok(vx.count < 20000, 'blocos demais em ' + t);
      blocks += vx.count;
      const cost = V.voxelCost(vx);
      assert.ok(cost.total > 0 && cost.total <= 240 && Number.isFinite(cost.total));
      const x = (i % 5) * 14 - 28,
        z = Math.floor(i / 5) * 14 - 20;
      const c = new CR.Creation(host, { uid: 'u' + i, spec: g.spec, owner: me, pos: new THREE.Vector3(x, T.groundY(x, z) + 0.2, z), yaw: i, animate: true, fn: g.fn, text: t, variant: 0, from: new THREE.Vector3(0, 1, 0) });
      list.push(c);
    }
    host.refreshBoxes();
    // 10 s a 60 Hz
    for (let f = 0; f < 600; f++) {
      host.time += 1 / 60;
      for (const c of list) c.update(1 / 60);
    }
    for (const c of list) {
      const p = c.pos;
      assert.ok(Number.isFinite(p.x + p.y + p.z), 'posição NaN: ' + c.text);
      assert.equal(c.assembling, 0, 'terminou de montar: ' + c.text);
      const gy = T.groundY(p.x, p.z);
      const flies = c.beh.has('flies');
      assert.ok(p.y > gy - 0.8, `não afundou no chão: ${c.text} y=${p.y.toFixed(2)} chão=${gy.toFixed(2)}`);
      assert.ok(p.y < gy + (flies ? 12 : 4) || c.beh.has('jumps') || c.beh.has('bounces'), `não voou para longe: ${c.text} y=${p.y.toFixed(2)}`);
      if (c.body) {
        assert.ok(c.body.v.length() < 20, 'velocidade sã: ' + c.text);
        if (!c.beh.size || (c.fixed && !c.body)) assert.ok(c.body.v.length() < 0.5);
      }
      c.root.updateMatrixWorld(true);
      c.root.traverse((o) => {
        if (o.isInstancedMesh) {
          const m = new THREE.Matrix4();
          for (let i = 0; i < o.count; i += 7) {
            o.getMatrixAt(i, m);
            assert.ok(m.elements.every(Number.isFinite), 'matriz NaN: ' + c.text);
          }
        }
      });
    }
    // parado de verdade: objetos sem movimento ficam quietos depois de cair
    const still = list.find((c) => c.text === 'um trampolim');
    assert.ok(still.fixed);
    ok(`${texts.length} objetos montados (${blocks} blocos), 10 s de física: sem NaN, ninguém afundou nem fugiu; ${shots} bolhas atiradas`);
    // Refazer / IA troca o objeto no lugar
    const c0 = list[0];
    const before = c0.pos.clone();
    c0.replace(G.generate('um dragão de pizza que voa', { variant: 2 }).spec, undefined, 2, null);
    for (let f = 0; f < 120; f++) c0.update(1 / 60);
    assert.ok(c0.pos.distanceTo(before) < 12);
    ok('troca do objeto (Refazer/IA) no lugar, com "pop"');
    for (const c of list) c.dispose();
  }

  /* ============================== 4. endpoint ============================== */
  section('4. POST /api/cava/make');
  {
    const A = await bundle('server/cava-ai.ts', 'cavaai', true);
    const mkKv = () => {
      const m = new Map();
      return {
        m,
        get: async (k, type) => (m.has(k) ? (type === 'json' ? JSON.parse(m.get(k).v) : m.get(k).v) : null),
        put: async (k, v, o) => void m.set(k, { v, meta: o?.metadata }),
      };
    };
    const req = (body, ip = '9.9.9.9') => new Request('https://x/api/cava/make', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
    const reports = (kv) => [...kv.m.entries()].filter(([k]) => k.startsWith('report:')).map(([, v]) => v.meta);
    // catálogo entende → sem IA
    let env = { DATA: mkKv() };
    let r = await A.cavaMake(req({ text: 'um robô que joga bolhas', lang: 'pt', pid: 'player-12345678' }), env);
    let b = await r.json();
    assert.equal(r.status, 200);
    assert.equal(b.source, 'lib');
    ok('frase conhecida → gerador (sem custo de IA)');
    // sem IA configurada
    r = await A.cavaMake(req({ text: 'um ornitorrinco', lang: 'pt' }), env);
    assert.equal(r.status, 503);
    ok('palavra nova sem IA configurada → 503 (app fica com o objeto do aparelho)');
    // fixtures (mock)
    env = { DATA: mkKv(), CAVA_AI_MOCK: 'fixtures' };
    r = await A.cavaMake(req({ text: 'um ornitorrinco que nada', lang: 'pt', pid: 'player-12345678', seed: 5 }), env);
    b = await r.json();
    assert.equal(r.status, 200, JSON.stringify(b));
    assert.equal(b.source, 'mock');
    assert.ok(A.CAVA_MODEL === 'claude-haiku-5-5');
    assert.equal(b.learn.ornitorrinco.id, 'lontra');
    assert.ok(b.spec.parts.length <= 24);
    assert.ok(b.spec.parts.some((p) => p.color === 'orange'));
    r = await A.cavaMake(req({ text: 'um ornitorrinco que nada', lang: 'pt', pid: 'player-12345678', seed: 5 }), env);
    b = await r.json();
    assert.equal(b.source, 'cache');
    ok('IA (fixtures) → plano com ids do catálogo + bico extra; palavra aprendida; 2º pedido sai do cache');
    // modelo diz que é inseguro → 422 + denúncia
    r = await A.cavaMake(req({ text: 'unsafe-test coisa estranha', lang: 'pt', pid: 'player-12345678' }), env);
    assert.equal(r.status, 422);
    assert.ok(reports(env.DATA).some((m) => m.reason === 'cava-ia:model-unsafe'));
    ok('resposta "safe:false" → 422 + registro para a moderação');
    // pedido com palavrão → bloqueado sem IA, registrado
    r = await A.cavaMake(req({ text: 'uma buceta voadora', lang: 'pt', pid: 'player-12345678' }), env);
    b = await r.json();
    assert.equal(b.source, 'safety');
    assert.ok(reports(env.DATA).some((m) => m.reason === 'cava-ia:block' && m.text.includes('voadora')));
    r = await A.cavaMake(req({ text: 'uma arma que atira', lang: 'pt', pid: 'player-12345678' }), env);
    b = await r.json();
    assert.ok(reports(env.DATA).some((m) => m.reason === 'cava-ia:soft'));
    assert.ok(!/arma/i.test(b.spec.name));
    ok('palavrão → bloqueado + registro; arma → lançador de espuma + registro (só texto)');
    // limite por minuto
    env = { DATA: mkKv(), CAVA_AI_MOCK: 'fixtures' };
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await A.cavaMake(req({ text: 'um axolote numero ' + 'abcdefghijklmnopqrstuvwxyz'[i], lang: 'pt', pid: 'player-12345678' }), env)).status;
    assert.equal(last, 429);
    ok('limite por jogador → 429');
    // Claude falso (SDK oficial com fetch injetado)
    env = { DATA: mkKv(), ANTHROPIC_API_KEY: 'sk-test-fake' };
    let sent = null;
    const plan = { safe: true, name: 'Axolote Feliz', desc: 'Nada sorrindo!', base: 'lagarto', theme: '', with: ['chifres'], colors: ['pink', 'peach', 'magenta'], size: 'big', behaviors: [{ type: 'floats', power: 0.6 }], extra: [], learn: 'axolote' };
    const fakeFetch = async (url, init) => {
      sent = { url: String(url), body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: JSON.stringify(plan) }], stop_reason: 'end_turn', stop_details: null, usage: { input_tokens: 10, output_tokens: 10 } }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_1' } });
    };
    r = await A.cavaMake(req({ text: 'um axolote', lang: 'pt', pid: 'player-12345678' }), env, { fetch: fakeFetch });
    b = await r.json();
    assert.equal(r.status, 200, JSON.stringify(b));
    assert.equal(b.source, 'claude');
    assert.equal(sent.body.model, 'claude-haiku-5-5');
    assert.equal(sent.body.output_config.format.type, 'json_schema');
    assert.ok(sent.body.system[0].cache_control);
    assert.match(sent.body.messages[0].content, /axolote/);
    assert.equal(b.spec.name, 'Axolote Feliz');
    ok('Claude (SDK, fetch falso): modelo claude-haiku-5-5, saída estruturada, prompt em cache, plano → objeto');
    // Claude recusa → 422; Workers AI falso
    const refuse = async () => new Response(JSON.stringify({ id: 'msg_2', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [], stop_reason: 'refusal', stop_details: { type: 'refusal', category: null, explanation: '' }, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
    r = await A.cavaMake(req({ text: 'um troço esquisito', lang: 'pt', pid: 'player-12345678' }), { DATA: mkKv(), ANTHROPIC_API_KEY: 'k' }, { fetch: refuse });
    assert.equal(r.status, 422);
    let waiCall = null;
    const AI = { run: async (m, i) => ((waiCall = { m, i }), { response: { ...plan, name: 'Axolote WAI' } }) };
    r = await A.cavaMake(req({ text: 'um axolote', lang: 'pt' }), { DATA: mkKv(), AI });
    b = await r.json();
    assert.equal(b.source, 'workers-ai');
    assert.equal(waiCall.m, '@cf/meta/llama-3.3-70b-instruct-fp8-fast');
    assert.equal(waiCall.i.response_format.type, 'json_schema');
    ok('recusa do Claude → 422; sem chave → Workers AI (llama-3.3-70b JSON mode)');
    // resposta maliciosa da IA → validada
    const evil = { ...plan, name: '<b>porra</b>', base: 'bomba_atomica', with: ['metralhadora', 'rodas'], behaviors: [{ type: 'explodes', power: 9 }, { type: 'shoots', power: 9, kind: 'bullets' }], extra: Array.from({ length: 40 }, () => ({ shape: 'box', size: [99, 99, 99], pos: [99, 99, 99], rot: [0, 0, 0], color: 'blood', mat: 'x' })) };
    r = await A.cavaMake(req({ text: 'um bichotroço', lang: 'pt' }), { DATA: mkKv(), AI: { run: async () => ({ response: evil }) } });
    b = await r.json();
    assert.equal(r.status, 200);
    assert.ok(!/porra|<b>/.test(b.spec.name));
    assert.ok(b.spec.parts.length <= 24);
    assert.ok(b.spec.behaviors.every((x) => x.type !== 'explodes' && x.power <= 1));
    assert.ok(S.specExtent(b.spec) <= S.SPEC_LIMITS.extent + 0.01);
    ok('resposta maliciosa da IA → base desconhecida vira monstro, peças/cores/comportamentos limitados, nome limpo');
  }
  console.log(`\n${pass} testes ok`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
