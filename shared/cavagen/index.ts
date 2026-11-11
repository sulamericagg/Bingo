/**
 * OBJETO FALADO — gerador DETERMINÍSTICO no aparelho (sem IA, sem rede).
 *
 *   generate("um dragão de pizza que voa") → { spec, plan, confidence, unknown }
 *
 * 1. Entende a frase (pt-BR + inglês + um pouco de espanhol): substantivos do catálogo (concepts.ts, ~300
 *    conceitos com sinônimos, plural/diminutivo/aumentativo e erros de digitação), adjetivos (tamanho, cor,
 *    material, velocidade, quantidade), verbos (voa, nada, pula, joga bolhas...) e as ligações
 *    "X de Y" (tema/material/casco), "X com Y" (acessório), "X que Z" (comportamento), "X e Y", "X no Y".
 * 2. Monta um PLANO e o plano vira peças (builders.ts) → ObjSpec validado (cavaspec.ts).
 * Mesmo texto + mesma variante = mesmo objeto em todos os aparelhos (bom para o online).
 * O servidor (server/cava-ai.ts) só é chamado quando sobra palavra desconhecida; a resposta dele é um
 * PLANO com ids do catálogo (fromPlan), guardado para funcionar offline da próxima vez.
 */
import { BEHAVIORS, COLOR_NAMES, snapColor, validateSpec, type BehType, type ColorName, type ObjBehavior, type ObjMat, type ObjPart, type ObjSpec, type V3 } from '../cavaspec';
import { BUILDERS } from './builders';
import { CONCEPTS, type Concept, type Fn } from './concepts';
import { bboxOf, ball, box, cone, cyl, eyes, hashStr, joint, mat as setMat, ring, rng, rotor, toObjParts, wheel, wing, xform, type GPart } from './kit';

export { CONCEPTS } from './concepts';
export type { Concept, Fn } from './concepts';

/* ================================ vocabulário ================================ */
export const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const FILLER = new Set(
  ('eu quero queria gostaria preciso um uma uns umas o a os as me faz faca fazer fazendo cria criar crie construir constroi construa monta montar monte gera gerar da dai entao por favor pf pfv agora aqui ai la ali isso essa esse este esta novo nova ' +
    'i want wanna need make build create give please an the some new now ok hey bloop ei oi ola tipo assim tem ter coloca colocar poe quero ver mostra mostrar desenha desenhar aparece aparecer ' +
    'quiero un una el la los las hazme haz crea dame por favor bem muito super hiper so apenas really very so verdade real realista mesmo tipo parecido igual estilo jeito forma formato cara coisa coisinha negocio troco treco algo something thing like looks parece').split(' '),
);
/** conectores (decidem a composição) */
const CONN: Record<string, 'of' | 'with' | 'that' | 'and' | 'on'> = {
  de: 'of', do: 'of', da: 'of', dos: 'of', das: 'of', of: 'of', made: 'of', feito: 'of', feita: 'of', del: 'of',
  com: 'with', with: 'with', con: 'with', tendo: 'with', cheio: 'with', cheia: 'with',
  que: 'that', which: 'that', who: 'that', that: 'that', quien: 'that', capaz: 'that',
  e: 'and', and: 'and', y: 'and', mais: 'and',
  no: 'on', na: 'on', em: 'on', num: 'on', numa: 'on', sobre: 'on', on: 'on', in: 'on', en: 'on', dentro: 'on', riding: 'on', montado: 'on', montada: 'on',
};
const SIZE: Record<string, number> = {
  gigante: 1.9, gigantesco: 2, gigantesca: 2, enorme: 1.9, imenso: 1.9, imensa: 1.9, giant: 1.9, huge: 1.9, enormous: 1.9, colossal: 2, mega: 1.7, gigantic: 2, grandao: 1.5, grandona: 1.5, maior: 1.5, gordao: 1.4,
  grande: 1.4, big: 1.4, large: 1.4, alto: 1, alta: 1,
  pequeno: 0.6, pequena: 0.6, pequenininho: 0.45, pequenininha: 0.45, pequenino: 0.5, mini: 0.55, small: 0.6, little: 0.6, tiny: 0.45, miniatura: 0.5, minusculo: 0.4, minuscula: 0.4, chiquito: 0.5, pequeno_: 0.6, baby: 0.6, bebe: 0.6, filhote: 0.6,
};
const SHAPE: Record<string, V3> = {
  alto: [1, 1.5, 1], alta: [1, 1.5, 1], tall: [1, 1.5, 1], altissimo: [1, 1.9, 1], comprido: [1, 1, 1.6], comprida: [1, 1, 1.6], longo: [1, 1, 1.6], longa: [1, 1, 1.6], long: [1, 1, 1.6],
  gordo: [1.35, 1.1, 1.15], gorda: [1.35, 1.1, 1.15], gordinho: [1.3, 1.1, 1.1], gordinha: [1.3, 1.1, 1.1], fat: [1.35, 1.1, 1.15], chubby: [1.3, 1.1, 1.1], largo: [1.4, 1, 1], larga: [1.4, 1, 1], wide: [1.4, 1, 1],
  baixo: [1, 0.7, 1], baixa: [1, 0.7, 1], baixinho: [1, 0.7, 1], baixinha: [1, 0.7, 1], short: [1, 0.7, 1], fino: [0.75, 1, 1], fina: [0.75, 1, 1], magro: [0.75, 1, 1], magra: [0.75, 1, 1], thin: [0.75, 1, 1],
};
const MATS: Record<string, { mat: ObjMat; col?: ColorName }> = {
  madeira: { mat: 'wood', col: 'brown' }, wood: { mat: 'wood', col: 'brown' }, wooden: { mat: 'wood', col: 'brown' }, madera: { mat: 'wood', col: 'brown' }, tronco: { mat: 'wood', col: 'brown' },
  metal: { mat: 'metal', col: 'silver' }, ferro: { mat: 'metal', col: 'gray' }, aco: { mat: 'metal', col: 'silver' }, metalico: { mat: 'metal', col: 'silver' }, iron: { mat: 'metal', col: 'gray' }, steel: { mat: 'metal', col: 'silver' }, lata: { mat: 'metal', col: 'silver' }, prata: { mat: 'metal', col: 'silver' }, silver: { mat: 'metal', col: 'silver' },
  ouro: { mat: 'metal', col: 'gold' }, dourado: { mat: 'metal', col: 'gold' }, dourada: { mat: 'metal', col: 'gold' }, gold: { mat: 'metal', col: 'gold' }, golden: { mat: 'metal', col: 'gold' }, oro: { mat: 'metal', col: 'gold' },
  pedra: { mat: 'stone', col: 'gray' }, stone: { mat: 'stone', col: 'gray' }, rocha: { mat: 'stone', col: 'gray' }, tijolo: { mat: 'stone', col: 'red' }, brick: { mat: 'stone', col: 'red' }, concreto: { mat: 'stone', col: 'gray' }, marmore: { mat: 'stone', col: 'white' },
  vidro: { mat: 'glass', col: 'sky' }, cristal: { mat: 'glass', col: 'lavender' }, glass: { mat: 'glass', col: 'sky' }, crystal: { mat: 'glass', col: 'lavender' }, transparente: { mat: 'glass' }, diamante: { mat: 'glass', col: 'sky' }, diamond: { mat: 'glass', col: 'sky' },
  gelo: { mat: 'glass', col: 'sky' }, ice: { mat: 'glass', col: 'sky' }, hielo: { mat: 'glass', col: 'sky' }, congelado: { mat: 'glass', col: 'sky' },
  geleia: { mat: 'jelly' }, gelatinoso: { mat: 'jelly' }, gelatinosa: { mat: 'jelly' }, gosmento: { mat: 'jelly', col: 'lime' }, slime: { mat: 'jelly', col: 'lime' },
  borracha: { mat: 'rubber' }, rubber: { mat: 'rubber' }, plastico: { mat: 'plastic' }, plastic: { mat: 'plastic' }, pelucia: { mat: 'rubber' }, algodao: { mat: 'rubber', col: 'white' }, papel: { mat: 'plastic', col: 'white' }, paper: { mat: 'plastic', col: 'white' }, lego: { mat: 'plastic' },
  neon: { mat: 'glow' }, luminoso: { mat: 'glow' }, luminosa: { mat: 'glow' }, brilhante: { mat: 'glow' }, glowing: { mat: 'glow' }, fosforescente: { mat: 'glow' }, radiante: { mat: 'glow' }, magico: { mat: 'glow' }, magica: { mat: 'glow' }, magic: { mat: 'glow' }, luz: { mat: 'glow', col: 'yellow' }, fogo: { mat: 'glow', col: 'orange' }, lava: { mat: 'glow', col: 'orange' }, eletrico: { mat: 'glow', col: 'yellow' }, eletrica: { mat: 'glow', col: 'yellow' },
};
const RAINBOW = new Set(['colorido', 'colorida', 'coloridos', 'coloridas', 'multicolor', 'rainbow', 'arcoiris', 'arco iris', 'arco-iris', 'colorful', 'colores']);
/** padrões: "de bolinhas", "listrado" */
const PATTERN: Record<string, 'spots' | 'stripes'> = { bolinhas: 'spots', pintado: 'spots', pintada: 'spots', pintadinho: 'spots', pintadinha: 'spots', manchado: 'spots', manchada: 'spots', spotted: 'spots', dots: 'spots', dotted: 'spots', poa: 'spots', listrado: 'stripes', listrada: 'stripes', listras: 'stripes', listradinho: 'stripes', striped: 'stripes', stripes: 'stripes', zebrado: 'stripes' };
const RAINBOW_COLS: ColorName[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
const SPEED: Record<string, number> = { rapido: 0.3, rapida: 0.3, veloz: 0.35, turbo: 0.4, fast: 0.3, speedy: 0.3, ligeiro: 0.3, ligeira: 0.3, superrapido: 0.45, lento: -0.3, lenta: -0.3, devagar: -0.3, slow: -0.3, preguicoso: -0.25 };
const COUNT: Record<string, number> = { dois: 2, duas: 2, two: 2, '2': 2, dos: 2, par: 2, tres: 3, three: 3, '3': 3, quatro: 3, four: 3, '4': 3, muitos: 3, muitas: 3, varios: 3, varias: 3, many: 3, lots: 3, duplo: 2, dupla: 2, double: 2, triplo: 3, gemeos: 2, twins: 2 };
const COLOR_WORDS: Record<string, ColorName> = {};
for (const k of COLOR_NAMES) COLOR_WORDS[k] = k;
for (const w of 'vermelho vermelha rojo red laranja naranja amarelo amarela amarillo verde azul roxo roxa lilas violeta rosa pink branco branca blanco prata cinza gris grey preto preta negro negra marrom bege creme menta turquesa celeste dourado ciano black white green yellow blue purple orange brown'.split(' ')) COLOR_WORDS[w] = snapColor(w);
Object.assign(COLOR_WORDS, { rosinha: 'pink', azulzinho: 'sky', azulado: 'sky', esverdeado: 'green', clarinho: 'cream', escuro: 'navy', claro: 'sky', verdinho: 'lime', rosado: 'pink', avermelhado: 'red', roxinho: 'lavender', pretinho: 'black', branquinho: 'white', limao: 'lime', vinho: 'magenta', bordo: 'magenta', salmao: 'peach', 'cor de rosa': 'pink' } as Record<string, ColorName>);

/** verbos → comportamento (kind opcional) */
const VERBS: Record<string, [BehType, string?]> = {};
const vb = (words: string, b: BehType, k?: string) => words.split(' ').forEach((w) => (VERBS[w] = [b, k]));
vb('voa voar voando voador voadora voadores fly flies flying flyer vuela volador voe voam plana planar', 'flies');
vb('nada nadar nadando nadador nadadora flutua flutuar flutuante boia boiar swim swims swimming float floats floating nadan navega navegar sail sails', 'floats');
vb('anda andar andando caminha caminhar corre correr correndo walks walk walking runs run running camina corredor', 'walks');
vb('rola rolar rolando roll rolls rodando dirige', 'rolls');
vb('pula pular pulando pulador saltitante salta saltar jump jumps jumping hop hops salta brinca danca dancar dancando dance dances', 'jumps');
vb('quica quicar quicando bounce bounces bouncy elastico elastica saltarina', 'bounces');
vb('joga jogar jogando solta soltar soltando atira atirar atirando lanca lancar lancando cospe cuspir cuspindo dispara disparar disparando shoots shoot throws throw spits spit sprays espirra esguicha esguichar faz fazer lanza tira bota', 'shoots');
vb('sopra soprar soprando assopra assoprar vento venta ventania blows blow wind empurra empurrar push pushes', 'pushes');
vb('cava cavar cavando escava escavar perfura perfurar digs dig digging cavador cavadora excava', 'digs');
vb('carrega carregar carregando leva levar levando transporta transportar carries carry carrying lleva', 'carries');
vb('gruda grudar grudento grudenta pega pegar puxa puxar atrai atrair sticks stick sticky magnetico pegajoso pull pulls', 'sticks');
vb('cresce crescer crescendo grows grow growing aumenta crece', 'grows');
vb('brilha brilhar brilhando acende acender ilumina iluminar pisca piscar glows glow shines shine shiny blinks brilla', 'glows');
vb('segue seguir seguindo acompanha acompanhar follows follow following companheiro sigue', 'follows');
vb('montar monto montavel montaria dirigir dirijo dirigivel pilotar piloto pilotavel sentar sento ride rides rideable drive drivable sit monta pilotear manejar', 'ride');
vb('canta cantar cantando musica musical toca tocar sings sing music canta', 'sound', 'music');
vb('buzina buzinar honk honks', 'sound', 'honk');
vb('ruge rugir rugindo roar roars ruge', 'sound', 'roar');
vb('late latir latindo bark barks au', 'sound', 'woof');
vb('mia miar miando miau meow meows', 'sound', 'meow');
vb('muge mugir muu moo moos', 'sound', 'moo');
vb('apita apitar bipa bipe beep beeps', 'sound', 'beep');
vb('pia piar piu chirp chirps tweet', 'sound', 'chirp');
vb('estoura estourar pop pops barulho barulhento barulhenta noise noisy', 'sound', 'pop');
/** humor/jeito: entende (não vira palavra desconhecida); deixa as bochechas rosadas */
const MOOD = new Set('feliz felizes malvado malvada mau ma bravo brava zangado zangada triste fofo fofa fofinho fofinha fofos lindo linda bonito bonita bonitinho bonitinha legal maluco maluca doido doida louco louca engracado engracada sorridente assustador assustadora bonzinho boazinha bebe gostoso gostosa delicioso deliciosa cheiroso cheirosa amigo amiga amigavel cute happy angry sad funny scary friendly silly crazy cool nice lovely sweet tierno feo bonita'.split(' '));
/** munição de "joga/solta X" */
const AMMO: Record<string, string> = {
  bolha: 'bubbles', bolhas: 'bubbles', bolinha: 'bubbles', bubble: 'bubbles', bubbles: 'bubbles', burbujas: 'bubbles', sabao: 'bubbles',
  espuma: 'foam', foam: 'foam', espumas: 'foam', creme: 'foam', chantilly: 'foam', marshmallow: 'foam', algodao: 'foam',
  confete: 'confetti', confetes: 'confetti', confetti: 'confetti', serpentina: 'confetti', faiscas: 'confetti', faisca: 'confetti', sparks: 'confetti', estrelinhas: 'confetti', glitter: 'confetti', purpurina: 'confetti', fogos: 'confetti', fogo: 'confetti', fire: 'confetti', chamas: 'confetti', doces: 'confetti', balas: 'confetti', flores: 'confetti', petalas: 'confetti',
  agua: 'water', water: 'water', jato: 'water', chuva: 'water', rain: 'water', suco: 'water', leite: 'water', tinta: 'water', paint: 'water',
  neve: 'snow', snow: 'snow', gelo: 'snow', ice: 'snow', granizo: 'snow', nieve: 'snow', snowballs: 'snow',
};

/* ================================ catálogo indexado ================================ */
interface Entry {
  c: Concept;
  toks: string[];
}
let INDEX: { one: Map<string, Concept>; multi: Entry[]; all: string[] } | null = null;
function index() {
  if (INDEX) return INDEX;
  const one = new Map<string, Concept>();
  const multi: Entry[] = [];
  for (const c of CONCEPTS)
    for (const w of c.words) {
      const f = fold(w);
      if (!f) continue;
      const toks = f.split(' ');
      if (toks.length === 1) {
        if (!one.has(f)) one.set(f, c);
      } else multi.push({ c, toks });
    }
  multi.sort((a, b) => b.toks.length - a.toks.length);
  INDEX = { one, multi, all: [...one.keys()] };
  return INDEX;
}
export function conceptById(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}

/** variantes faladas de uma palavra: plural, diminutivo, aumentativo, gênero. [palavra, fator de tamanho] */
function variants(w: string, gender = true): [string, number][] {
  const out: [string, number][] = [[w, 1]];
  const add = (x: string, k = 1) => x.length >= 2 && !out.some((o) => o[0] === x) && out.push([x, k]);
  if (w.endsWith('oes') || w.endsWith('aes')) add(w.slice(0, -3) + 'ao');
  if (w.endsWith('ns')) add(w.slice(0, -2) + 'm');
  if (w.endsWith('is')) add(w.slice(0, -2) + 'l');
  if (w.endsWith('es')) add(w.slice(0, -2));
  if (w.endsWith('s')) add(w.slice(0, -1));
  for (const [x] of [...out]) {
    let m = /^(.+?)zinh[oa]s?$/.exec(x);
    if (m) add(m[1], 0.75), add(m[1] + 'o', 0.75), add(m[1] + 'a', 0.75), add(m[1] + 'e', 0.75);
    m = /^(.+?)inh([oa])s?$/.exec(x);
    if (m) add(m[1] + m[2], 0.75), add(m[1] + 'o', 0.75), add(m[1] + 'a', 0.75), add(m[1] + 'e', 0.75), add(m[1].replace(/qu$/, 'c') + m[2], 0.75), add(m[1].replace(/gu$/, 'g') + m[2], 0.75);
    m = /^(.+?)z(ao|ona|oes)$/.exec(x);
    if (m) add(m[1], 1.4), add(m[1] + 'o', 1.4), add(m[1] + 'a', 1.4), add(m[1] + 'e', 1.4);
    m = /^(.+?)(ao|ona)$/.exec(x);
    if (m && m[1].length >= 3) add(m[1] + 'o', 1.4), add(m[1] + 'a', 1.4);
  }
  if (gender)
    for (const [x, k] of [...out]) {
      if (x.endsWith('a')) add(x.slice(0, -1) + 'o', k);
      else if (x.endsWith('o')) add(x.slice(0, -1) + 'a', k);
    }
  return out;
}
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const NOT_DIM = new Set(['golfinho', 'golfinhos', 'espinho', 'caminho', 'ninho', 'moinho', 'pinho', 'vinho', 'linho', 'focinho', 'vizinho', 'passarinho', 'joaninha', 'cozinha', 'rainha', 'galinha', 'minhoca', 'sardinha', 'andorinha', 'campainha', 'bolinha', 'casinha']);
/** "gatinho" = pequeno, "cachorrão" = grande (mesmo quando a palavra está no catálogo) */
function sizeSuffix(w: string): number {
  if (NOT_DIM.has(w)) return 1;
  if (/(z?inh[oa]s?)$/.test(w)) return 0.75;
  if (/(z?(ao|ona))$/.test(w) && w.length > 6 && !/(cao|sao|gao|mao|pao|lao|rao|tao|vao|hao|nao)$/.test(w)) return 1.4;
  return 1;
}
const fuzzyCache = new Map<string, [Concept, number] | null>();
/** palavra → conceito (exato, variante ou erro de 1–2 letras) */
function lookupWord(w: string): [Concept, number] | null {
  const ix = index();
  for (const [v, k] of variants(w)) {
    const c = ix.one.get(v);
    if (c) return [c, k === 1 ? sizeSuffix(w) : k];
  }
  if (w.length < 5 || isVocab(w)) return null;
  const hit = fuzzyCache.get(w);
  if (hit !== undefined) return hit;
  let best: [Concept, number] | null = null;
  let bd = 9;
  for (const k of ix.all) {
    if (k.length < 4) continue;
    const d = lev(w, k);
    const max = w.length >= 8 ? 2 : 1;
    if (d <= max && d < bd) (bd = d), (best = [ix.one.get(k)!, 1]);
  }
  if (fuzzyCache.size > 4000) fuzzyCache.clear();
  fuzzyCache.set(w, best);
  return best;
}
/** adjetivo no plural/feminino → forma do dicionário ("gigantes" → "gigante", "azuis" → "azul") */
function adjKey(w: string): string {
  const has = (x: string) => x in SIZE || x in SHAPE || x in MATS || x in SPEED || x in COLOR_WORDS || RAINBOW.has(x);
  if (has(w)) return w;
  for (const x of [w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/is$/, 'l'), w.replace(/as$/, 'o'), w.replace(/a$/, 'o')]) if (x !== w && has(x)) return x;
  return w;
}
function isVocab(w: string): boolean {
  w = adjKey(w);
  return w in PATTERN || MOOD.has(w) || w in SIZE || w in SHAPE || w in MATS || w in SPEED || w in COUNT || w in COLOR_WORDS || w in VERBS || w in AMMO || w in CONN || w in ACC || RAINBOW.has(w) || FILLER.has(w);
}

/* ================================ acessórios ("com X") ================================ */
type AccFn = (bb: { min: V3; max: V3 }, k: number) => { parts: GPart[]; beh?: ObjBehavior[]; lift?: number };
const ACC: Record<string, AccFn> = {};
const acc = (words: string, f: AccFn) => words.split(' ').forEach((w) => (ACC[w] = f));
const ctr = (bb: { min: V3; max: V3 }): V3 => [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2];
const sz = (bb: { min: V3; max: V3 }): V3 => [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
acc('roda rodas rodinha rodinhas wheel wheels pneu pneus ruedas', (bb, k) => {
  const s = sz(bb),
    c = ctr(bb);
  const d = Math.max(0.5, Math.min(s[0], s[2]) * 0.38) * k;
  const p: GPart[] = [];
  for (const [x, z] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ])
    p.push(...wheel(c[0] + x * (s[0] / 2 + 0.12 * k), bb.min[1] - d * 0.15, c[2] + z * s[2] * 0.32, d, 0.3 * Math.sqrt(k)));
  return { parts: p, beh: [{ type: 'rolls', power: 0.6 }], lift: d * 0.35 };
});
acc('asa asas wing wings alas', (bb, k) => {
  const s = sz(bb),
    c = ctr(bb);
  const span = Math.max(1, s[0] * 0.9) * k;
  return { parts: [-1, 1].map((sd) => wing(sd, c[0] + (sd * s[0]) / 2.4, bb.min[1] + s[1] * 0.65, c[2], span, Math.max(0.8, s[2] * 0.45), 'c', 1.3, 30)), beh: [{ type: 'flies', power: 0.6, kind: 'wings' }] };
});
acc('helice helices propeller propellers helicoptero rotor', (bb, k) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [cyl(0.15 * k, 0.5 * k, c[0], bb.max[1] + 0.2 * k, c[2], 'gray', 'prop', undefined, 'metal'), ...rotor(c[0], bb.max[1] + 0.48 * k, c[2], Math.max(1.6, s[0] * 1.1) * k, 'c')], beh: [{ type: 'flies', power: 0.6, kind: 'propeller' }] };
});
acc('foguete foguetes turbo turbina turbinas jato jatos rocket rockets jetpack propulsor', (bb, k) => {
  const c = ctr(bb);
  const p: GPart[] = [];
  for (const sd of [-1, 1]) p.push(cyl(0.45 * k, 0.9 * k, c[0] + sd * 0.4 * k, c[1], bb.min[2] - 0.3 * k, 'silver', 'deco', [90, 0, 0], 'metal'), setMat(cone(0.4 * k, 0.6 * k, c[0] + sd * 0.4 * k, c[1], bb.min[2] - 0.95 * k, 'orange', 'light', [-90, 0, 0]), 'glow'));
  return { parts: p, beh: [{ type: 'rolls', power: 0.9 }] };
});
acc('vela velas sail mastro', (bb) => {
  const c = ctr(bb);
  return { parts: [cyl(0.12, 2.4, c[0], bb.max[1] + 1.1, c[2], 'brown', 'deco', undefined, 'wood'), setMat(box(0.06, 1.8, 1.4, c[0], bb.max[1] + 1.3, c[2] - 0.6, 'white', 'sail'), 'plastic')], beh: [{ type: 'floats', power: 0.5 }] };
});
acc('mola molas spring springs molinha', (bb, k) => {
  const c = ctr(bb),
    s = sz(bb);
  const p: GPart[] = [];
  for (const [x, z] of [
    [-1, -1],
    [1, 1],
  ])
    for (let i = 0; i < 2; i++) p.push(joint(ring(0.6 * k, 0.12 * k, c[0] + (x * s[0]) / 4, bb.min[1] - 0.15 - i * 0.22 * k, c[2] + (z * s[2]) / 4, 'silver', 'deco', undefined, 'metal'), 'spring', 'y', 2, 0.3));
  return { parts: p, beh: [{ type: 'jumps', power: 0.6 }], lift: 0.5 * k };
});
acc('balao baloes bexiga bexigas balloon balloons globos', (bb, k) => {
  const c = ctr(bb);
  const p: GPart[] = [];
  const cols = ['red', 'yellow', 'sky'] as const;
  for (let i = 0; i < 3; i++) {
    const x = c[0] + (i - 1) * 0.7 * k;
    p.push(ball(0.9 * k, 1.1 * k, 0.9 * k, x, bb.max[1] + 2.0 * k + (i % 2) * 0.3, c[2], cols[i], 'deco'), cyl(0.04, 1.6 * k, x * 0.7 + c[0] * 0.3, bb.max[1] + 0.8 * k, c[2], 'white', 'deco'));
  }
  return { parts: p, beh: [{ type: 'flies', power: 0.5, kind: 'balloon' }] };
});
acc('luz luzes lampada lampadas farol farois light lights led leds pisca piscas', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [0, 1, 2, 3].map((i) => setMat(ball(0.3, 0.3, 0.3, c[0] + (i - 1.5) * s[0] * 0.25, bb.max[1] + 0.1, c[2] + s[2] * 0.2, (['yellow', 'pink', 'sky', 'lime'] as const)[i], 'light'), 'glow')), beh: [{ type: 'glows', power: 0.7 }] };
});
acc('chifre chifres horn horns cuernos', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [-1, 1].map((sd) => cone(0.25, 0.6, c[0] + sd * s[0] * 0.2, bb.max[1] + 0.2, bb.max[2] - s[2] * 0.2, 'cream', 'deco', [0, 0, -sd * 20])) };
});
acc('chifrinho unicornio chifre_magico', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [setMat(cone(0.25, 0.8, c[0], bb.max[1] + 0.3, bb.max[2] - s[2] * 0.15, 'gold', 'deco', [20, 0, 0]), 'glow')] };
});
acc('olho olhos eye eyes olhinhos ojos cara rosto face carinha', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  const r = Math.max(0.25, Math.min(s[0], s[1]) * 0.18);
  return { parts: eyes(c[1] + s[1] * 0.2, bb.max[2], r * 0.9, r) };
});
acc('braco bracos arm arms bracinhos brazos maos', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [-1, 1].map((sd) => joint(cyl(0.25, s[1] * 0.6, c[0] + sd * (s[0] / 2 + 0.15), c[1], c[2], 'c', 'arm', [0, 0, sd * 25]), 'hinge', 'x', 2 * sd, 25, [c[0] + sd * s[0] * 0.45, c[1] + s[1] * 0.25, c[2]])) };
});
acc('perna pernas leg legs patas pata pernas_de_robo piernas pes', (bb, k) => {
  const c = ctr(bb),
    s = sz(bb);
  const h = Math.max(0.6, s[1] * 0.5) * k;
  const p: GPart[] = [];
  let ph = 1;
  for (const [x, z] of [
    [-1, 1],
    [1, -1],
    [1, 1],
    [-1, -1],
  ]) {
    p.push(joint(cyl(0.25 * k, h, c[0] + x * s[0] * 0.3, bb.min[1] - h / 2, c[2] + z * s[2] * 0.3, 'c', 'leg'), 'hinge', 'x', 2 * ph, 22, [c[0] + x * s[0] * 0.3, bb.min[1], c[2] + z * s[2] * 0.3]));
    ph = -ph;
  }
  return { parts: p, beh: [{ type: 'walks', power: 0.5 }], lift: h };
});
acc('cauda rabo rabinho tail cola', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [joint(cone(0.4, Math.max(1, s[2] * 0.5), c[0], c[1], bb.min[2] - s[2] * 0.2, 'a', 'tail', [-100, 0, 0]), 'hinge', 'y', 2, 20, [c[0], c[1], bb.min[2]])] };
});
acc('capa cape manto', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [joint(box(s[0] * 0.8, s[1] * 0.8, 0.08, c[0], c[1], bb.min[2] - 0.08, 'red', 'deco', [-10, 0, 0]), 'hinge', 'x', 1.5, 10, [c[0], bb.max[1] - 0.1, bb.min[2]])] };
});
acc('antena antenas antenna antennas anteninha', (bb) => {
  const c = ctr(bb);
  return { parts: [-1, 1].flatMap((sd) => [cyl(0.06, 0.8, c[0] + sd * 0.3, bb.max[1] + 0.35, c[2], 'gray', 'deco', [0, 0, -sd * 15]), setMat(ball(0.25, 0.25, 0.25, c[0] + sd * 0.42, bb.max[1] + 0.8, c[2], 'red', 'light'), 'glow')]) };
});
acc('canhao canhaozinho cannon lancador blaster bazuca', (bb, k) => {
  const c = ctr(bb);
  return { parts: [cyl(0.5 * k, 1.4 * k, c[0], bb.max[1] + 0.3 * k, c[2] + 0.3 * k, 'gray', 'deco', [70, 0, 0], 'metal'), ball(0.8 * k, 0.6 * k, 0.8 * k, c[0], bb.max[1] + 0.1, c[2] - 0.2 * k, 'c', 'deco')], beh: [{ type: 'shoots', power: 0.6, kind: 'bubbles' }] };
});
acc('janela janelas window windows', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [-1, 1].map((sd) => setMat(box(s[0] * 0.25, s[1] * 0.25, 0.08, c[0] + sd * s[0] * 0.22, c[1] + s[1] * 0.1, bb.max[2] + 0.02, 'sky', 'deco'), 'glass')) };
});
acc('telhado teto roof', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [cone(Math.max(s[0], s[2]) * 1.2, s[1] * 0.5, c[0], bb.max[1] + s[1] * 0.25, c[2], 'red', 'roof', [0, 45, 0])] };
});
acc('assento banco banquinho seat sela selim', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [box(Math.min(1.2, s[0] * 0.6), 0.25, Math.min(1.2, s[2] * 0.4), c[0], bb.max[1] + 0.12, c[2], 'brown', 'seat')], beh: [{ type: 'ride', power: 0.5 }] };
});
acc('ima magnet iman', (bb) => {
  const c = ctr(bb);
  return { parts: [ring(1.0, 0.3, c[0], bb.max[1] + 0.5, c[2], 'red', 'deco', [90, 0, 0], 'metal')], beh: [{ type: 'sticks', power: 0.6 }] };
});
acc('chamine chimney', (bb) => {
  const c = ctr(bb),
    s = sz(bb);
  return { parts: [box(0.5, 1.2, 0.5, c[0] + s[0] * 0.25, bb.max[1] + 0.4, c[2] - s[2] * 0.2, 'red', 'deco', undefined, 'stone')] };
});

/* ================================ plano ================================ */
export interface NounPlan {
  id: string;
  scale: V3;
  color?: ColorName;
  colors?: [ColorName, ColorName, ColorName];
  mat?: ObjMat;
  rainbow?: boolean;
  /** padrão pedido (bolinhas/listras) */
  pattern?: 'spots' | 'stripes';
  theme?: string;
  /** acessórios: palavra de acessório (ACC) ou id de conceito */
  with: { id: string; scale: number; color?: ColorName }[];
  count: number;
}
export interface Plan {
  main: NounPlan;
  pair?: NounPlan;
  base?: NounPlan;
  behaviors: ObjBehavior[];
  speed: number;
  name: string;
  desc?: string;
  /** peças extras (vindas da IA) */
  extra?: ObjPart[];
}
export interface GenResult {
  spec: ObjSpec;
  plan: Plan;
  /** 0..1 — quanto da frase foi entendido (baixo = vale pedir à IA) */
  confidence: number;
  /** palavras de conteúdo que o catálogo não conhece */
  unknown: string[];
  fn?: Fn;
}
export interface GenOpts {
  lang?: string;
  variant?: number;
  /** palavras aprendidas com a IA (palavra → plano parcial) */
  learned?: Record<string, Partial<NounPlan>>;
}

const newNoun = (id: string, k = 1): NounPlan => ({ id, scale: [k, k, k], with: [], count: 1 });

/** entende a frase → plano */
export function parsePlan(text: string, opts: GenOpts = {}): { plan: Plan | null; unknown: string[]; known: number } {
  const ix = index();
  const raw = fold(text).replace(/\barco iris\b/g, 'arco-iris');
  const toks = raw.split(' ').filter((t) => t && !FILLER.has(t));
  const unknown: string[] = [];
  let known = 0;
  let main: NounPlan | null = null;
  let pair: NounPlan | null = null;
  let base: NounPlan | null = null;
  let cur: NounPlan | null = null;
  let mode: 'main' | 'of' | 'with' | 'that' | 'on' = 'main';
  let lastConn: string | null = null;
  let pendScale = 1;
  let pendShape: V3 = [1, 1, 1];
  let pendColor: ColorName | undefined;
  let pendMat: ObjMat | undefined;
  let pendRainbow = false;
  let pendCount = 1;
  let speed = 0;
  const beh: ObjBehavior[] = [];
  let lastVerb: ObjBehavior | null = null;
  const lv = (): ObjBehavior | null => lastVerb;
  const applyPend = (n: NounPlan) => {
    n.scale = [n.scale[0] * pendScale * pendShape[0], n.scale[1] * pendScale * pendShape[1], n.scale[2] * pendScale * pendShape[2]];
    if (pendColor) n.color = pendColor;
    if (pendMat) n.mat = pendMat;
    if (pendRainbow) n.rainbow = true;
    if (pendCount > 1) n.count = pendCount;
    pendScale = 1;
    pendShape = [1, 1, 1];
    pendColor = undefined;
    pendMat = undefined;
    pendRainbow = false;
    pendCount = 1;
  };
  const addBeh = (b: ObjBehavior) => {
    const old = beh.find((x) => x.type === b.type);
    if (old) {
      if (b.kind) old.kind = b.kind;
      lastVerb = old;
      return;
    }
    beh.push(b);
    lastVerb = b;
  };
  const target = () => (mode === 'with' && main?.with.length ? null : cur);

  for (let i = 0; i < toks.length; i++) {
    const w0 = toks[i];
    const w = CONN[w0] || w0 in VERBS || w0 in AMMO || w0 in ACC || w0 in COUNT ? w0 : adjKey(w0);
    // 1) substantivo de várias palavras (casa na árvore, carro de bombeiro, cama elástica...)
    let hit: [Concept, number, number] | null = null;
    const accFirst = main && (mode === 'with' || mode === 'of') && w in ACC;
    for (const e of accFirst ? [] : ix.multi) {
      const L = e.toks.length;
      if (i + L > toks.length) continue;
      let ok = true;
      let k = 1;
      for (let j = 0; j < L && ok; j++) {
        if (toks[i + j] === e.toks[j]) continue;
        const v = j === L - 1 || j === 0 ? variants(toks[i + j], false).find((x) => x[0] === e.toks[j]) : undefined;
        if (v) k *= v[1];
        else ok = false;
      }
      if (ok) {
        hit = [e.c, k, L];
        break;
      }
    }
    const conn = CONN[w];
    // conectores: "de ouro" é material, "de pizza" é tema...
    if (!hit && conn && !(w === 'e' && mode === 'that' && false)) {
      lastConn = w;
      if (conn === 'of' && cur) mode = 'of';
      else if (conn === 'with') mode = 'with';
      else if (conn === 'that') mode = 'that';
      else if (conn === 'on' && main) mode = 'on';
      else if (conn === 'and') mode = mode === 'with' ? 'with' : mode === 'that' ? 'that' : 'main';
      continue;
    }
    if (!hit) {
      // adjetivos / verbos / acessórios
      if (w0 in PATTERN) {
        const t = mode === 'with' && main?.with.length ? null : cur ?? main;
        if (t) t.pattern = PATTERN[w0];
        if (mode === 'of') mode = 'main';
        known++;
        continue;
      }
      if (w in COUNT && !lookupWord(w)) {
        pendCount = COUNT[w];
        known++;
        continue;
      }
      if (w in SIZE) {
        const t = target();
        if (mode === 'with' && main?.with.length) main.with[main.with.length - 1].scale *= SIZE[w];
        else if (t && mode !== 'that') t.scale = t.scale.map((v) => v * SIZE[w]) as V3;
        else pendScale *= SIZE[w];
        if (w in SHAPE) (t ? (t.scale = t.scale.map((v, a) => v * SHAPE[w][a]) as V3) : (pendShape = SHAPE[w]));
        known++;
        continue;
      }
      if (w in SHAPE) {
        const t = target();
        if (t && mode !== 'that') t.scale = t.scale.map((v, a) => v * SHAPE[w][a]) as V3;
        else pendShape = SHAPE[w];
        known++;
        continue;
      }
      if (MOOD.has(w)) {
        known++;
        continue;
      }
      if (w in SPEED) {
        speed += SPEED[w];
        known++;
        continue;
      }
      if (RAINBOW.has(w)) {
        if (cur && mode !== 'with') cur.rainbow = true;
        else pendRainbow = true;
        known++;
        continue;
      }
      if (w in COLOR_WORDS && !(mode === 'that' && lv()?.type === 'shoots')) {
        const col = COLOR_WORDS[w];
        if (mode === 'with' && main?.with.length) main.with[main.with.length - 1].color = col;
        else if (cur && lastConn !== 'with') cur.color = col;
        else pendColor = col;
        known++;
        continue;
      }
      if (w in MATS && !(mode === 'that' && lv()?.type === 'shoots' && w in AMMO)) {
        const m = MATS[w];
        if (cur && mode !== 'with') {
          cur.mat = m.mat;
          if (m.col && !cur.color) cur.color = m.col;
        } else {
          pendMat = m.mat;
          if (m.col && !pendColor) pendColor = m.col;
        }
        if (mode === 'of') mode = 'main';
        known++;
        continue;
      }
      if (w in AMMO && (mode === 'that' || lv()?.type === 'shoots')) {
        addBeh({ type: 'shoots', power: 0.5, kind: AMMO[w] });
        known++;
        continue;
      }
      if (w in VERBS) {
        const [t, k] = VERBS[w];
        // "faz" sozinho não é atirar (só "faz bolhas")
        if (t === 'shoots' && (w === 'faz' || w === 'fazer' || w === 'bota') && !(toks[i + 1] in AMMO)) continue;
        const b: ObjBehavior = { type: t, power: 0.5 };
        const kinds = BEHAVIORS[t] as readonly string[];
        if (kinds.length && t !== 'flies') b.kind = k ?? (t === 'shoots' && toks[i + 1] in AMMO ? AMMO[toks[i + 1]] : kinds[0]);
        addBeh(b);
        if (mode !== 'that') mode = 'that';
        known++;
        continue;
      }
      if (w in ACC && main && (mode === 'with' || mode === 'of')) {
        const sc = pendScale;
        pendScale = 1;
        main.with.push({ id: w, scale: sc, color: pendColor });
        pendColor = undefined;
        known++;
        continue;
      }
    }
    // substantivo de uma palavra
    let found: [Concept, number] | null = null;
    let used = 1;
    if (hit) {
      found = [hit[0], hit[1]];
      used = hit[2];
    } else if (opts.learned?.[w]) {
      const lp = opts.learned[w];
      if (lp.id && conceptById(lp.id)) found = [conceptById(lp.id)!, 1];
    } else found = lookupWord(w);
    if (found) {
      known += used;
      i += used - 1;
      const n = newNoun(found[0].id, found[1]);
      const lp = !hit ? opts.learned?.[w] : undefined;
      if (lp) Object.assign(n, { ...lp, with: [...(lp.with ?? [])], scale: lp.scale ?? n.scale });
      if (!main) {
        main = n;
        applyPend(n);
        cur = n;
        mode = 'main';
      } else if (mode === 'of' && cur) {
        // "X de Y": Y é tema/casco do X
        cur.theme = n.id;
        mode = 'main';
      } else if (mode === 'with') {
        main.with.push({ id: n.id, scale: n.scale[0] * pendScale, color: pendColor });
        pendScale = 1;
        pendColor = undefined;
      } else if (mode === 'on') {
        base = n;
        applyPend(n);
        cur = n;
        mode = 'main';
      } else if (mode === 'that') {
        // "que joga bolas" — substantivo depois de verbo vira munição/acessório
        if (lv()?.type === 'shoots') lv()!.kind = AMMO[w] ?? lv()!.kind;
        else if (lv()?.type === 'carries' || lv()?.type === 'follows') main.with.push({ id: n.id, scale: 0.6 });
      } else if (!pair) {
        pair = n;
        applyPend(n);
        cur = n;
      }
      continue;
    }
    if (w.length >= 3 && !isVocab(w)) unknown.push(w);
  }
  if (!main) return { plan: null, unknown, known };
  // pendentes que sobraram no fim ("carro vermelho" já aplicou; "um vermelho carro"...)
  if (pendColor || pendScale !== 1 || pendMat || pendRainbow || pendCount > 1) applyPend(main);
  return { plan: { main, pair: pair ?? undefined, base: base ?? undefined, behaviors: beh, speed, name: '' }, unknown, known };
}

/* ================================ montagem ================================ */
function buildConcept(id: string, r: () => number, variant: number, extra?: Record<string, boolean | number | string>): { parts: GPart[]; c: Concept } {
  const c = conceptById(id) ?? conceptById('bola')!;
  const o: typeof c.o = { ...c.o, ...(extra ?? {}) };
  // variações (Refazer): proporções e opções mudam um pouco
  if (variant > 0) for (const k of Object.keys(o)) if (typeof o[k] === 'number' && !['seg', 'legs', 'scoops', 'tiers'].includes(k)) o[k] = (o[k] as number) * (0.85 + r() * 0.3);
  const f = BUILDERS[c.build] ?? BUILDERS.blob;
  return { parts: f(o, r), c };
}

const BODYISH = new Set(['body', 'deck', 'wall', 'roof', 'head', 'leg', 'arm', 'wing', 'tail', 'base', 'seat', 'sail']);
function paletteFor(n: NounPlan, c: Concept, r: () => number, variant: number): [ColorName, ColorName, ColorName] {
  let col: [ColorName, ColorName, ColorName] = n.colors ?? [...c.col];
  if (variant > 0 && !n.colors) {
    const alt = COLOR_NAMES.filter((x) => !['black', 'white', 'gray'].includes(x));
    col = [alt[Math.floor(r() * alt.length)], col[1], alt[Math.floor(r() * alt.length)]];
  }
  if (n.theme) {
    const t = conceptById(n.theme);
    if (t) col = [t.col[0], t.col[1], t.col[2]];
  }
  if (n.color) col = [n.color, col[1] === n.color ? col[0] : col[1], col[2]];
  return col;
}

/** coloca as peças de "outro" dentro de uma caixa alvo (escala independente por eixo, alinhando o eixo comprido) */
function fitInto(parts: GPart[], dst: { min: V3; max: V3 }): GPart[] {
  const sb = bboxOf(parts);
  const ss = [sb.max[0] - sb.min[0], sb.max[1] - sb.min[1], sb.max[2] - sb.min[2]];
  const ds = [dst.max[0] - dst.min[0], dst.max[1] - dst.min[1], dst.max[2] - dst.min[2]];
  const k: V3 = [ds[0] / Math.max(0.05, ss[0]), ds[1] / Math.max(0.05, ss[1]), ds[2] / Math.max(0.05, ss[2])];
  return xform(parts, k, [dst.min[0] - sb.min[0] * k[0], dst.min[1] - sb.min[1] * k[1], dst.min[2] - sb.min[2] * k[2]]);
}

function vol(p: GPart): number {
  return p.size[0] * p.size[1] * p.size[2];
}
/** corta peças pequenas de enfeite até caber no limite */
function prune(parts: GPart[], max: number): GPart[] {
  if (parts.length <= max) return parts;
  const rank = (p: GPart) => (p.tag === 'deco' ? 0 : p.tag === 'light' || p.tag === 'leaf' ? 1 : p.tag === 'eye' ? 3 : p.tag === 'body' || p.tag === 'wall' || p.tag === 'deck' ? 5 : 2);
  const order = parts.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p) - rank(b.p) || vol(a.p) - vol(b.p));
  const drop = new Set(order.slice(0, parts.length - max).map((x) => x.i));
  return parts.filter((_, i) => !drop.has(i));
}

/** um substantivo do plano → peças (com tema, casco, material, cor, acessórios) */
function buildNoun(n: NounPlan, r: () => number, variant: number, behOut: ObjBehavior[]): { parts: GPart[]; c: Concept; colors: [ColorName, ColorName, ColorName] } {
  const rainbowBridge = (n.rainbow || n.theme === 'arco_iris') && conceptById(n.id)?.build === 'bridge';
  const { parts: p0, c } = buildConcept(n.id, r, variant, rainbowBridge ? { lanes: true } : n.pattern ? { [n.pattern]: true } : undefined);
  let parts = p0;
  // tema "de Y"
  const th = n.theme ? conceptById(n.theme) : undefined;
  const isHull = !!th && !!th.hull && ['vehicle', 'water', 'air'].includes(c.cat) && parts.some((p) => p.tag === 'body');
  // casco: o X mantém as próprias cores (o casco traz as do Y)
  const colors = paletteFor(isHull ? { ...n, theme: undefined } : n, c, r, variant);
  if (th) {
    const bodyParts = parts.filter((p) => p.tag === 'body');
    const hullable = isHull;
    const yParts = buildConcept(th.id, r, 0).parts;
    const yCols: [ColorName, ColorName, ColorName] = [...th.col];
    // as cores do Y viram literais (não seguem o tema do X)
    for (const q of yParts) if (q.col === 'a' || q.col === 'b' || q.col === 'c') q.col = yCols[q.col === 'a' ? 0 : q.col === 'b' ? 1 : 2];
    if (hullable && th.hull) {
      // casco: troca o corpo do X pelo formato do Y ("barco de banana")
      const bb = bboxOf(bodyParts);
      parts = parts.filter((p) => p.tag !== 'body' && p.tag !== 'deck' && !(p.tag === 'deco' && p.pos[1] < bb.max[1] && p.pos[1] > bb.min[1] && p.shape !== 'cylinder'));
      const hull = fitInto(
        yParts.filter((q) => q.tag !== 'leaf' || q.size[1] < 1),
        bb,
      );
      for (const q of hull) if (q.tag === 'body') q.tag = 'body';
      parts = [...hull, ...parts];
    } else if (th.id === 'arco_iris') n.rainbow = !rainbowBridge;
    else {
      // emblema: um mini Y em cima do corpo do X
      const core = parts.filter((p) => p.tag === 'body' || p.tag === 'wall' || p.tag === 'deck' || p.tag === 'roof');
      const bb = bboxOf(core.length ? core : parts);
      const ext = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
      const keep = yParts
        .map((q, i) => ({ q, i }))
        .sort((a, b) => vol(b.q) - vol(a.q))
        .slice(0, 6)
        .sort((a, b) => a.i - b.i)
        .map((x) => x.q);
      const yb = bboxOf(keep);
      const yext = Math.max(yb.max[0] - yb.min[0], yb.max[1] - yb.min[1], yb.max[2] - yb.min[2]);
      const k = Math.max(0.6, ext * 0.45) / Math.max(0.1, yext);
      const cx = (bb.min[0] + bb.max[0]) / 2,
        cz = (bb.min[2] + bb.max[2]) / 2;
      const em = xform(keep, [k, k, k], [cx - ((yb.min[0] + yb.max[0]) / 2) * k, bb.max[1] - 0.05 - yb.min[1] * k, cz - ((yb.min[2] + yb.max[2]) / 2) * k - (bb.max[2] - bb.min[2]) * 0.12]);
      for (const q of em) (q.tag = 'deco'), (q.joint = undefined);
      parts = [...parts, ...em];
    }
  }
  // material
  if (n.mat) for (const p of parts) if (BODYISH.has(p.tag) && p.mat !== 'glow') p.mat = n.mat;
  // arco-íris: listras de cor nas peças grandes
  if (n.rainbow && !rainbowBridge) {
    let i = 0;
    for (const p of parts) if (BODYISH.has(p.tag) && p.tag !== 'leg') p.col = RAINBOW_COLS[i++ % RAINBOW_COLS.length];
  }
  // acessórios
  for (const w of n.with) {
    const bb = bboxOf(parts);
    const f = ACC[w.id];
    if (f) {
      const a = f(bb, Math.max(0.4, Math.min(2.5, w.scale)));
      if (w.color) for (const q of a.parts) if (q.tag !== 'eye' && q.tag !== 'light') q.col = w.color;
      if (a.lift) for (const p of parts) (p.pos[1] += a.lift), p.joint?.pivot && (p.joint.pivot[1] += a.lift);
      if (a.lift) for (const q of a.parts) (q.pos[1] += a.lift), q.joint?.pivot && (q.joint.pivot[1] += a.lift);
      // rodas novas substituem pernas/rodas velhas
      if (w.id.startsWith('rod') || w.id.startsWith('whe') || w.id.startsWith('pne')) parts = parts.filter((p) => p.tag !== 'wheel' && p.tag !== 'leg');
      parts.push(...a.parts);
      if (a.beh) behOut.push(...a.beh);
      continue;
    }
    const wc = conceptById(w.id);
    if (!wc) continue;
    const { parts: ap } = buildConcept(wc.id, r, 0);
    for (const q of ap) if (q.col === 'a' || q.col === 'b' || q.col === 'c') q.col = w.color ?? wc.col[q.col === 'a' ? 0 : q.col === 'b' ? 1 : 2];
    // chapéu/coroa/óculos: vão NA CABEÇA, do tamanho da cabeça
    const heads = parts.filter((p) => p.tag === 'head');
    if (['chapeu', 'coroa', 'oculos'].includes(wc.id) && heads.length) {
      const hb = bboxOf(heads);
      const ab = bboxOf(ap);
      const hw = Math.max(hb.max[0] - hb.min[0], 0.3);
      const k = ((wc.id === 'oculos' ? 1.15 : 0.95) * hw * Math.min(1.6, w.scale)) / Math.max(0.1, ab.max[0] - ab.min[0]);
      const cx = (hb.min[0] + hb.max[0]) / 2;
      const ty = wc.id === 'oculos' ? (hb.min[1] + hb.max[1]) / 2 + (hb.max[1] - hb.min[1]) * 0.1 - ((ab.min[1] + ab.max[1]) / 2) * k : hb.max[1] - (hb.max[1] - hb.min[1]) * 0.12 - ab.min[1] * k;
      const tz = wc.id === 'oculos' ? hb.max[2] - ab.min[2] * k : (hb.min[2] + hb.max[2]) / 2 - ((ab.min[2] + ab.max[2]) / 2) * k;
      const placed = xform(ap, [k, k, k], [cx - ((ab.min[0] + ab.max[0]) / 2) * k, ty, tz]);
      for (const q of placed) (q.tag = 'deco'), (q.joint = undefined);
      parts.push(...placed);
      continue;
    }
    const ab = bboxOf(ap);
    const ext = Math.max(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    const aext = Math.max(ab.max[0] - ab.min[0], ab.max[1] - ab.min[1], ab.max[2] - ab.min[2]);
    const big = c.fixed || wc.fixed;
    const k = ((big ? 0.7 : 0.42) * ext * Math.min(2, w.scale)) / Math.max(0.1, aext);
    // construções: ao lado (escorregador, escada, piscina); resto: em cima
    const side = big;
    const tx = side ? bb.max[0] - ab.min[0] * k + 0.1 : (bb.min[0] + bb.max[0]) / 2 - ((ab.min[0] + ab.max[0]) / 2) * k;
    const ty = side ? (wc.fn === 'slide' && c.id === 'casa_na_arvore' ? bb.min[1] + (bb.max[1] - bb.min[1]) * 0.42 - (ab.max[1] - ab.min[1]) * k * 0.95 : bb.min[1]) - ab.min[1] * k : bb.max[1] - 0.05 - ab.min[1] * k;
    const tz = (bb.min[2] + bb.max[2]) / 2 - ((ab.min[2] + ab.max[2]) / 2) * k;
    const placed = xform(ap, [k, k, k], [tx, Math.max(ty, side ? -ab.min[1] * k : ty), tz]);
    // escorregador da casa na árvore: gira para descer para o lado
    for (const q of placed) if (q.tag === 'body' || q.tag === 'head') q.tag = 'deco';
    parts.push(...placed);
    for (const b of wc.beh) if (['shoots', 'glows', 'sound', 'flies', 'bounces'].includes(b.type)) behOut.push({ ...b });
  }
  // Refazer: proporções e cores mudam um pouco
  if (variant > 0) {
    xform(parts, [0.85 + r() * 0.35, 0.85 + r() * 0.35, 0.85 + r() * 0.35], [0, 0, 0]);
    if (n.theme || n.colors) {
      const k = variant % 3;
      const rot = [colors[k % 3], colors[(k + 1) % 3], colors[(k + 2) % 3]] as [ColorName, ColorName, ColorName];
      colors[0] = n.color ?? rot[0];
      colors[1] = rot[1];
      colors[2] = rot[2];
    }
  }
  // escala do substantivo
  const sc = n.scale;
  if (sc.some((v) => Math.abs(v - 1) > 1e-3)) xform(parts, sc, [0, 0, 0]);
  return { parts, c, colors };
}

function resolveCols(parts: GPart[], colors: [ColorName, ColorName, ColorName]): GPart[] {
  for (const p of parts) if (p.col === 'a' || p.col === 'b' || p.col === 'c') p.col = colors[p.col === 'a' ? 0 : p.col === 'b' ? 1 : 2];
  return parts;
}

const DESC: Record<string, Partial<Record<BehType | 'still', string>>> = {
  pt: { flies: 'voa', floats: 'flutua na água', rolls: 'anda sobre rodas', walks: 'anda por aí', jumps: 'pula', bounces: 'quica', shoots: 'solta {a}', pushes: 'sopra vento', digs: 'cava buracos', carries: 'carrega coisas', sticks: 'gruda e puxa', grows: 'cresce', glows: 'brilha', follows: 'segue você', ride: 'dá pra montar', still: 'feito de blocos, do seu jeito' },
  en: { flies: 'flies', floats: 'floats on water', rolls: 'rolls on wheels', walks: 'walks around', jumps: 'jumps', bounces: 'bounces', shoots: 'shoots {a}', pushes: 'blows wind', digs: 'digs holes', carries: 'carries stuff', sticks: 'sticks and pulls', grows: 'grows', glows: 'glows', follows: 'follows you', ride: 'you can ride it', still: 'made of blocks, your way' },
  es: { flies: 'vuela', floats: 'flota en el agua', rolls: 'rueda', walks: 'camina', jumps: 'salta', bounces: 'rebota', shoots: 'lanza {a}', pushes: 'sopla viento', digs: 'cava hoyos', carries: 'lleva cosas', sticks: 'se pega', grows: 'crece', glows: 'brilla', follows: 'te sigue', ride: 'puedes montarlo', still: 'hecho de bloques, a tu manera' },
};
const AMMO_NAME: Record<string, Record<string, string>> = {
  pt: { bubbles: 'bolhas', foam: 'espuma', confetti: 'confete', water: 'água', snow: 'neve' },
  en: { bubbles: 'bubbles', foam: 'foam', confetti: 'confetti', water: 'water', snow: 'snow' },
  es: { bubbles: 'burbujas', foam: 'espuma', confetti: 'confeti', water: 'agua', snow: 'nieve' },
};
export function describe(beh: ObjBehavior[], lang: string): string {
  const L = DESC[lang] ? lang : lang === 'pt' ? 'pt' : 'en';
  const d = DESC[L];
  const bits = beh
    .filter((b) => d[b.type])
    .slice(0, 3)
    .map((b) => d[b.type]!.replace('{a}', AMMO_NAME[L][b.kind ?? 'bubbles'] ?? ''));
  const s = bits.length ? bits.join(', ') : d.still!;
  return s.charAt(0).toUpperCase() + s.slice(1) + '!';
}
const FN_DESC: Record<string, Record<string, string>> = {
  pt: { bridge: 'Dá pra atravessar!', stairs: 'Dá pra subir!', ramp: 'Dá pra subir e pular!', slide: 'Sobe e escorrega!', trampoline: 'Pula muuuito alto!', pump: 'Tem água fresquinha!', shelter: 'Dá pra entrar e explorar!', tower: 'Dá pra ver tudo lá de cima!', wall: 'Protege e segura!', lamp: 'Ilumina tudo!', boat: 'Flutua na água!', crane: 'Levanta coisas pesadas!', food: 'Parece uma delícia!', play: 'Bora brincar!', nature: 'Que lindo!', other: 'Feito de blocos, do seu jeito!' },
  en: { bridge: 'You can cross it!', stairs: 'You can climb it!', ramp: 'Climb and jump!', slide: 'Climb up and slide!', trampoline: 'Jump sooo high!', pump: 'Fresh water!', shelter: 'Go inside and explore!', tower: 'See everything from up there!', wall: 'Keeps things safe!', lamp: 'Lights everything up!', boat: 'Floats on water!', crane: 'Lifts heavy stuff!', food: 'Looks yummy!', play: "Let's play!", nature: 'So pretty!', other: 'Made of blocks, your way!' },
};
function fnDesc(fn: string | undefined, cat: string, lang: string): string {
  const d = FN_DESC[lang] ?? FN_DESC[lang === 'pt' ? 'pt' : 'en'];
  return d[fn ?? ''] ?? d[cat] ?? d.other;
}
/** nome a partir da própria frase (sem "eu quero um...") */
export function nameFrom(text: string): string {
  const words = text
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  let started = false;
  for (const w of words) {
    const f = fold(w);
    if (!started && (FILLER.has(f) || CONN[f] === 'and')) continue;
    started = true;
    out.push(w);
  }
  let s = out.join(' ').slice(0, 40).trim();
  if (out.join(' ').length > 40) s = s.replace(/\s+\S*$/, '');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/** plano → objeto (determinístico pela semente) */
export function fromPlan(plan: Plan, seed: number, variant = 0, lang = 'pt'): { spec: ObjSpec; fn?: Fn } | null {
  const r = rng(seed ^ (variant * 0x9e3779b1));
  const extraBeh: ObjBehavior[] = [];
  const m = buildNoun(plan.main, r, variant, extraBeh);
  let parts = resolveCols(m.parts, m.colors);
  // quantidade: cópias lado a lado
  const count = Math.max(1, Math.min(3, plan.main.count));
  if (count > 1) {
    const bb = bboxOf(parts);
    const w = (bb.max[0] - bb.min[0]) * 1.12;
    const one = parts;
    parts = [];
    for (let i = 0; i < count; i++) parts.push(...xform(one.map((p) => ({ ...p, size: [...p.size] as V3, pos: [...p.pos] as V3, rot: [...p.rot] as V3, joint: p.joint ? { ...p.joint, pivot: p.joint.pivot ? ([...p.joint.pivot] as V3) : undefined } : undefined })), [1, 1, 1], [(i - (count - 1) / 2) * w, 0, 0]));
  }
  // "X e Y": o par fica do lado
  if (plan.pair) {
    const pb = buildNoun(plan.pair, r, variant, extraBeh);
    const pp = resolveCols(pb.parts, pb.colors);
    const a = bboxOf(parts),
      b = bboxOf(pp);
    xform(pp, [1, 1, 1], [a.max[0] - b.min[0] + 0.3, 0, 0]);
    parts.push(...pp);
  }
  // "X no Y": X vai em cima do Y
  if (plan.base) {
    const bn = buildNoun(plan.base, r, variant, extraBeh);
    const bp = resolveCols(bn.parts, bn.colors);
    const top = bboxOf(bp),
      a = bboxOf(parts);
    const k = Math.min(1, ((top.max[0] - top.min[0]) * 0.6) / Math.max(0.2, a.max[0] - a.min[0]));
    xform(parts, [k, k, k], [((top.min[0] + top.max[0]) / 2) - ((a.min[0] + a.max[0]) / 2) * k, top.max[1] - 0.1 - a.min[1] * k, ((top.min[2] + top.max[2]) / 2) - ((a.min[2] + a.max[2]) / 2) * k]);
    parts = [...bp, ...parts];
    for (const b of bn.c.beh) extraBeh.push({ ...b });
  }
  // comportamentos: do conceito + dos acessórios + da frase (a frase manda)
  const beh: ObjBehavior[] = [];
  const put = (b: ObjBehavior) => {
    const o = beh.find((x) => x.type === b.type);
    if (o) {
      if (b.kind) o.kind = b.kind;
      o.power = Math.max(o.power, b.power);
    } else beh.push({ ...b });
  };
  const LOCO = ['walks', 'follows', 'rolls', 'flies', 'jumps', 'ride'];
  for (const b of m.c.beh) if (!plan.base || !LOCO.includes(b.type)) put(b);
  for (const b of extraBeh) put(b);
  for (const b of plan.behaviors) put(b);
  // quem voa sem asa/hélice ganha uma hélice (casa que voa!)
  const fl = beh.find((b) => b.type === 'flies');
  if (fl && !fl.kind) fl.kind = parts.some((p) => p.tag === 'wing') ? 'wings' : m.c.cat === 'nature' || m.c.cat === 'toy' ? 'balloon' : 'propeller';
  if (fl && !parts.some((p) => p.tag === 'wing' || p.tag === 'prop') && !m.c.beh.some((b) => b.type === 'flies')) {
    const bb = bboxOf(parts);
    const critter = ['animal', 'fantasy', 'bird', 'sea', 'bug'].includes(m.c.cat);
    if (critter) fl.kind = 'wings';
    const a = (fl.kind === 'balloon' ? ACC.balao : fl.kind === 'wings' ? ACC.asas : ACC.helice)(bb, Math.max(0.8, Math.min(2, (bb.max[0] - bb.min[0]) / 2)));
    parts.push(...resolveCols(a.parts, m.colors));
  }
  // quem atira sem "canhão" ganha um bocal (robô que joga bolhas)
  const sh = beh.find((b) => b.type === 'shoots');
  if (sh && !m.c.beh.some((b) => b.type === 'shoots') && !parts.some((p) => p.tag === 'prop' && p.shape === 'cylinder')) {
    const bb = bboxOf(parts);
    const col = sh.kind === 'bubbles' ? 'sky' : sh.kind === 'water' ? 'blue' : sh.kind === 'snow' ? 'white' : sh.kind === 'confetti' ? 'pink' : 'lime';
    const cx = (bb.min[0] + bb.max[0]) / 2;
    const k = Math.max(0.6, Math.min(1.4, (bb.max[1] - bb.min[1]) / 3));
    parts.push(cyl(0.45 * k, 1.0 * k, cx + (bb.max[0] - bb.min[0]) * 0.32, bb.max[1] - 0.25 * k, bb.max[2] - 0.4 * k, col, 'prop', [70, 0, 0], 'metal'));
    parts.push(setMat(ball(0.55 * k, 0.55 * k, 0.55 * k, cx + (bb.max[0] - bb.min[0]) * 0.32, bb.max[1] - 0.45 * k, bb.max[2] - 0.75 * k, col, 'deco'), sh.kind === 'bubbles' ? 'glass' : 'plastic'));
  }
  if (plan.speed) for (const b of beh) if (['rolls', 'walks', 'flies', 'floats', 'follows'].includes(b.type)) b.power = Math.max(0.1, Math.min(1, b.power + plan.speed));
  parts = prune(parts, 24 - (plan.extra?.length ?? 0));
  const objParts: ObjPart[] = toObjParts(parts, m.colors);
  if (plan.extra) objParts.push(...plan.extra.slice(0, 8));
  const fixed = !!m.c.fixed && !beh.some((b) => ['rolls', 'walks', 'flies', 'floats', 'follows', 'ride', 'jumps'].includes(b.type));
  // 'bounces' de trampolim/cama fica parado: o motor trata como superfície que quica
  const behFinal = fixed ? beh.filter((b) => b.type !== 'bounces' || true) : beh;
  const spec = validateSpec(
    {
      name: plan.name || m.c.id,
      desc: plan.desc || (behFinal.length ? describe(behFinal, lang) : fnDesc(m.c.fn, m.c.cat, lang)),
      body: fixed ? 'static' : 'dynamic',
      parts: objParts,
      behaviors: behFinal,
      seat: undefined,
    },
    { fallbackName: m.c.words[0] },
  );
  if (!spec) return null;
  if (fixed) spec.body = 'static';
  return { spec, fn: m.c.fn };
}

/** a frase inteira → objeto. Sempre devolve algo (desconhecido vira um bichinho-mistério). */
export function generate(text: string, opts: GenOpts = {}): GenResult {
  const lang = opts.lang ?? 'pt';
  const variant = opts.variant ?? 0;
  const { plan, unknown, known } = parsePlan(text, opts);
  const seed = hashStr(fold(text));
  const name = nameFrom(text);
  if (plan) {
    plan.name = name;
    const out = fromPlan(plan, seed, variant, lang)!;
    const conf = Math.max(0.3, Math.min(1, 1 - unknown.length * 0.2 + (known > 2 ? 0.05 : 0)));
    return { spec: out.spec, plan, confidence: conf, unknown, fn: out.fn };
  }
  // nada conhecido: bichinho-mistério (cor e forma pelo próprio texto)
  const r = rng(seed);
  const pick = <T>(a: T[]) => a[Math.floor(r() * a.length)];
  const mystery: NounPlan = { id: pick(['monstro', 'alien', 'geleca', 'robo', 'totem', 'fantasma']), scale: [1, 1, 1], with: [], count: 1 };
  const cols = COLOR_NAMES.filter((c) => !['black', 'gray', 'white', 'brown', 'chocolate'].includes(c));
  mystery.colors = [pick(cols), pick(cols), pick(cols)];
  const p2: Plan = { main: mystery, behaviors: [], speed: 0, name: name || 'Mistério' };
  // verbos/adjetivos ainda valem ("algo que voa e brilha")
  const again = parsePlan('robo ' + text, opts).plan;
  if (again) {
    p2.behaviors = again.behaviors;
    p2.speed = again.speed;
    mystery.scale = again.main.scale;
    if (again.main.color) mystery.colors[0] = again.main.color;
    mystery.with = again.main.with;
  }
  const out = fromPlan(p2, seed, variant, lang)!;
  return { spec: out.spec, plan: p2, confidence: 0.15, unknown, fn: out.fn };
}

export function conceptIds(): string[] {
  return CONCEPTS.map((c) => c.id);
}
export function accessoryWords(): string[] {
  return Object.keys(ACC);
}
/** contagem do vocabulário (relatório) */
export function vocabStats(): { concepts: number; nounWords: number; adjectives: number; verbs: number; accessories: number } {
  const ix = index();
  return {
    concepts: CONCEPTS.length,
    nounWords: ix.one.size + ix.multi.length,
    adjectives: Object.keys(SIZE).length + Object.keys(SHAPE).length + Object.keys(MATS).length + Object.keys(COLOR_WORDS).length + Object.keys(SPEED).length + Object.keys(COUNT).length + RAINBOW.size,
    verbs: Object.keys(VERBS).length + Object.keys(AMMO).length,
    accessories: Object.keys(ACC).length,
  };
}

/**
 * Pedido "curto de receita" ("ponte", "trampolim de ouro", "canhão de espuma duplo")?
 * Esses continuam usando o catálogo fixo de engenhocas (balanceado para a arena).
 * Frases com verbo, "com", "que", "no", "e" ou mais de 3 palavras viram objeto falado.
 */
export function isCommand(text: string): boolean {
  const toks = fold(text)
    .split(' ')
    .filter((t) => t && !FILLER.has(t));
  let content = 0;
  for (const w of toks) {
    const c = CONN[w];
    if (c && c !== 'of') return false;
    if (c) continue;
    if (w in VERBS || (w in ACC && content > 0)) return false;
    content++;
  }
  return content > 0 && content <= 3;
}
