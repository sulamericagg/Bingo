/* ============================================================
 *  COZINHA MALUCA — dados: ingredientes, receitas, upgrades,
 *  curva de dificuldade (infinita) e eventos.
 *  Tudo é dado puro (sem DOM) — usado pelo 2D, pelo 3D e pelo teste.
 * ============================================================ */
import { t } from '../../i18n';

/* ------------------------- processos / estações ------------------------- */
export type Proc = 'chop' | 'boil' | 'fry' | 'bake' | 'blend';
export const PROCS: Proc[] = ['chop', 'boil', 'fry', 'bake', 'blend'];
/** tempo-base (s) de cada processo. chop = segurando o botão; o resto cozinha sozinho */
export const PROC_TIME: Record<Proc, number> = { chop: 1.5, boil: 8, fry: 6, bake: 9, blend: 3.5 };
/** depois de pronto, quanto tempo até queimar (s) e depois até pegar fogo */
export const BURN_AFTER = 8;
export const FIRE_AFTER = 4;
export const FIRE_SPREAD = 7;

/* ------------------------------ ingredientes ------------------------------ */
export type Shape = 'round' | 'leaf' | 'block' | 'long' | 'bun' | 'meat' | 'fish' | 'grain' | 'egg' | 'dough' | 'bottle' | 'berry' | 'drop' | 'sheet' | 'nut';
export interface Ing {
  id: string;
  shape: Shape;
  /** cor principal, sombra, detalhe */
  c: [string, string, string];
  /** rotas de preparo (cada rota é uma sequência de processos). [] = vai cru */
  routes: Proc[][];
}
const I = (id: string, shape: Shape, c: [string, string, string], ...routes: Proc[][]): Ing => ({ id, shape, c, routes: routes.length ? routes : [[]] });

export const INGS: Ing[] = [
  I('tomate', 'round', ['#ff4f4f', '#c21d3c', '#3ee07a'], ['chop']),
  I('alface', 'leaf', ['#7be36b', '#2f9e44', '#c9ffb0'], ['chop']),
  I('cebola', 'round', ['#e7c9ff', '#a77bd6', '#fff3d6'], ['chop']),
  I('cenoura', 'long', ['#ff9a2e', '#d9640b', '#3ee07a'], ['chop']),
  I('pepino', 'long', ['#4cc46a', '#1f7a3a', '#d9ffc9'], ['chop']),
  I('queijo', 'block', ['#ffd84a', '#e9a400', '#fff6b0'], ['chop']),
  I('pao', 'bun', ['#f2b25c', '#c27a2c', '#fff0c9']),
  I('carne', 'meat', ['#e8566b', '#a22b3e', '#ffd0d6'], ['chop', 'fry']),
  I('frango', 'meat', ['#ffd2b0', '#e39a6a', '#fff3e6'], ['chop', 'fry']),
  I('peixe', 'fish', ['#ff9d8a', '#e0604c', '#ffffff'], ['chop']),
  I('arroz', 'grain', ['#fdfbf3', '#cfc7b0', '#ffffff'], ['boil']),
  I('feijao', 'grain', ['#7a3d2b', '#4a2016', '#b06a4f'], ['boil']),
  I('macarrao', 'grain', ['#ffe18a', '#d9a73a', '#fff6cc'], ['boil']),
  I('batata', 'round', ['#d9a860', '#a6762e', '#f5d79a'], ['chop', 'fry']),
  I('ovo', 'egg', ['#ffffff', '#d9d2c4', '#ffcf2e'], ['fry']),
  I('massaPizza', 'dough', ['#ffe7b8', '#e0b878', '#ff5a3c'], ['bake']),
  I('massaPQ', 'dough', ['#fff1c4', '#e8c27a', '#ffd84a'], ['bake']),
  I('chocolate', 'block', ['#7b4a2b', '#4b2814', '#a8714a'], ['boil']),
  I('granulado', 'nut', ['#5a3018', '#2e170a', '#ff7ae0']),
  I('goma', 'drop', ['#ffffff', '#dfe6ee', '#f6f9ff'], ['fry']),
  I('coco', 'round', ['#8a5a3a', '#5a3620', '#ffffff'], ['chop']),
  I('massaPastel', 'sheet', ['#ffe4a0', '#e2b25a', '#fff6d6'], ['fry']),
  I('acai', 'berry', ['#6b2d8a', '#3d1052', '#b77bd9'], ['blend']),
  I('banana', 'long', ['#ffe14a', '#d9b000', '#7a5a10'], ['chop'], ['blend']),
  I('granola', 'nut', ['#d9a05a', '#9e6a2c', '#ffe0a8']),
  I('morango', 'berry', ['#ff3e5e', '#c2143a', '#3ee07a'], ['chop'], ['blend']),
  I('manga', 'round', ['#ffb52e', '#ff7a1a', '#7ad94a'], ['chop'], ['blend']),
  I('leite', 'bottle', ['#ffffff', '#cfe3ff', '#5ab0ff']),
  I('alga', 'sheet', ['#2f5e3a', '#173d22', '#4f8a5a']),
  I('massaBolo', 'dough', ['#ffd9a8', '#e0a868', '#ff9ac8'], ['bake']),
  I('abobora', 'round', ['#ff8a1f', '#c95a00', '#5aa83a'], ['chop', 'boil']),
  I('milho', 'long', ['#ffe04a', '#e0b400', '#7ad94a'], ['boil']),
  I('camarao', 'fish', ['#ff8f6b', '#d9583a', '#ffd0c0'], ['fry']),
  I('mandioca', 'long', ['#c48a5a', '#8a5a30', '#fff3dc'], ['chop', 'fry']),
  I('limao', 'round', ['#a6e23a', '#5aa81a', '#e8ffb0'], ['blend']),
  I('calabresa', 'long', ['#c2384a', '#7a1a28', '#ffb0b8'], ['chop']),
  I('pimentao', 'round', ['#3ec95a', '#1f8a3a', '#ff4f4f'], ['chop']),
  I('tortilla', 'sheet', ['#f5d58a', '#d9aa4a', '#fff0c0']),
];
export const ING_INDEX: Record<string, number> = {};
INGS.forEach((g, i) => (ING_INDEX[g.id] = i));

/* -------- componente: ingrediente + rota + etapa (empacotado em 1 número) -------- */
export const comp = (ing: number, route: number, stage: number): number => ing * 16 + route * 4 + stage;
export const compIng = (c: number): number => c >> 4;
export const compRoute = (c: number): number => (c >> 2) & 3;
export const compStage = (c: number): number => c & 3;
/** componente "pronto" de uma rota: ingrediente com todos os passos dela */
export function done(id: string, route = 0): number {
  const i = ING_INDEX[id];
  if (i === undefined) throw new Error('ing ' + id);
  return comp(i, route, INGS[i].routes[route].length);
}

/* ------------------------------ receitas ------------------------------ */
export type Cuisine = 'br' | 'lanche' | 'pizza' | 'oriental' | 'massa' | 'salada' | 'doce' | 'bebida' | 'sopa' | 'mex';
export interface Recipe {
  id: string;
  name: () => string;
  parts: number[];
  cuisine: Cuisine;
  /** pacote (livro de receitas) que libera */
  pack: number;
  /** preço base (calculado) */
  price: number;
  /** cor da louça (prato/tigela/copo) */
  dish: 'plate' | 'bowl' | 'cup';
}

function R(id: string, name: () => string, cuisine: Cuisine, pack: number, dish: Recipe['dish'], ...parts: number[]): Recipe {
  let steps = 0;
  for (const p of parts) steps += compStage(p);
  return { id, name, parts: parts.sort((a, b) => a - b), cuisine, pack, price: 6 + parts.length * 5 + steps * 4, dish };
}
const d = done;

export const RECIPES: Recipe[] = [
  // pacote 0 — Primeiro Dia
  R('saladaVerde', () => t('cozinha.r.saladaVerde', 'Salada verde'), 'salada', 0, 'bowl', d('alface'), d('pepino')),
  R('hamburguer', () => t('cozinha.r.hamburguer', 'Hambúrguer'), 'lanche', 0, 'plate', d('pao'), d('carne')),
  R('paoQueijo', () => t('cozinha.r.paoQueijo', 'Pão de queijo'), 'br', 0, 'plate', d('massaPQ')),
  R('tapioca', () => t('cozinha.r.tapioca', 'Tapioca de queijo'), 'br', 0, 'plate', d('goma'), d('queijo')),
  R('sugo', () => t('cozinha.r.sugo', 'Macarrão ao sugo'), 'massa', 0, 'bowl', d('macarrao'), d('tomate')),
  R('limonada', () => t('cozinha.r.limonada', 'Limonada batida'), 'bebida', 0, 'cup', d('limao')),
  // pacote 1 — Lanchonete
  R('xSalada', () => t('cozinha.r.xSalada', 'X-Salada'), 'lanche', 1, 'plate', d('pao'), d('carne'), d('alface'), d('tomate')),
  R('xBurguer', () => t('cozinha.r.xBurguer', 'X-Burguer'), 'lanche', 1, 'plate', d('pao'), d('carne'), d('queijo')),
  R('batataFrita', () => t('cozinha.r.batataFrita', 'Batata frita'), 'lanche', 1, 'plate', d('batata')),
  R('sandFrango', () => t('cozinha.r.sandFrango', 'Sanduíche de frango'), 'lanche', 1, 'plate', d('pao'), d('frango'), d('alface')),
  R('ovoArroz', () => t('cozinha.r.ovoArroz', 'Arroz com ovo'), 'br', 1, 'plate', d('ovo'), d('arroz')),
  R('saladaColorida', () => t('cozinha.r.saladaColorida', 'Salada colorida'), 'salada', 1, 'bowl', d('alface'), d('tomate'), d('cenoura')),
  // pacote 2 — Brasileirinho
  R('feijaoArroz', () => t('cozinha.r.feijaoArroz', 'Feijão com arroz'), 'br', 2, 'plate', d('feijao'), d('arroz')),
  R('pratoFeito', () => t('cozinha.r.pratoFeito', 'Prato feito'), 'br', 2, 'plate', d('feijao'), d('arroz'), d('carne')),
  R('pastelCarne', () => t('cozinha.r.pastelCarne', 'Pastel de carne'), 'br', 2, 'plate', d('massaPastel'), d('carne')),
  R('pastelQueijo', () => t('cozinha.r.pastelQueijo', 'Pastel de queijo'), 'br', 2, 'plate', d('massaPastel'), d('queijo')),
  R('aipim', () => t('cozinha.r.aipim', 'Aipim frito'), 'br', 2, 'plate', d('mandioca')),
  R('milhoCozido', () => t('cozinha.r.milhoCozido', 'Milho cozido'), 'br', 2, 'plate', d('milho')),
  R('tapiocaCoco', () => t('cozinha.r.tapiocaCoco', 'Tapioca de coco'), 'br', 2, 'plate', d('goma'), d('coco')),
  // pacote 3 — Pizzaria
  R('pizzaQueijo', () => t('cozinha.r.pizzaQueijo', 'Pizza de queijo'), 'pizza', 3, 'plate', d('massaPizza'), d('tomate'), d('queijo')),
  R('pizzaCalabresa', () => t('cozinha.r.pizzaCalabresa', 'Pizza de calabresa'), 'pizza', 3, 'plate', d('massaPizza'), d('tomate'), d('calabresa')),
  R('pizzaVerde', () => t('cozinha.r.pizzaVerde', 'Pizza de pimentão'), 'pizza', 3, 'plate', d('massaPizza'), d('queijo'), d('pimentao')),
  R('queijoMacarrao', () => t('cozinha.r.queijoMacarrao', 'Macarrão com queijo'), 'massa', 3, 'bowl', d('macarrao'), d('queijo')),
  R('macarraoLegumes', () => t('cozinha.r.macarraoLegumes', 'Macarrão com legumes'), 'massa', 3, 'bowl', d('macarrao'), d('cenoura'), d('cebola')),
  // pacote 4 — Doceria
  R('brigadeiro', () => t('cozinha.r.brigadeiro', 'Brigadeiro'), 'doce', 4, 'plate', d('chocolate'), d('granulado')),
  R('boloChocolate', () => t('cozinha.r.boloChocolate', 'Bolo de chocolate'), 'doce', 4, 'plate', d('massaBolo'), d('chocolate')),
  R('boloMorango', () => t('cozinha.r.boloMorango', 'Bolo de morango'), 'doce', 4, 'plate', d('massaBolo'), d('morango')),
  R('saladaFrutas', () => t('cozinha.r.saladaFrutas', 'Salada de frutas'), 'doce', 4, 'bowl', d('banana'), d('morango'), d('manga')),
  R('acaiBowl', () => t('cozinha.r.acaiBowl', 'Açaí na tigela'), 'doce', 4, 'bowl', d('acai'), d('banana'), d('granola')),
  // pacote 5 — Bar de vitaminas
  R('smoothieMorango', () => t('cozinha.r.smoothieMorango', 'Vitamina de morango'), 'bebida', 5, 'cup', d('morango', 1), d('leite')),
  R('smoothieManga', () => t('cozinha.r.smoothieManga', 'Vitamina de manga'), 'bebida', 5, 'cup', d('manga', 1), d('leite')),
  R('vitaminaBanana', () => t('cozinha.r.vitaminaBanana', 'Vitamina de banana'), 'bebida', 5, 'cup', d('banana', 1), d('leite')),
  R('tropical', () => t('cozinha.r.tropical', 'Batida tropical'), 'bebida', 5, 'cup', d('manga', 1), d('banana', 1)),
  R('acaiBatido', () => t('cozinha.r.acaiBatido', 'Açaí batido'), 'bebida', 5, 'cup', d('acai'), d('leite')),
  // pacote 6 — Rolinhos & Oriente
  R('rolinhoPeixe', () => t('cozinha.r.rolinhoPeixe', 'Rolinho de peixe'), 'oriental', 6, 'plate', d('arroz'), d('peixe'), d('alga')),
  R('rolinhoPepino', () => t('cozinha.r.rolinhoPepino', 'Rolinho de pepino'), 'oriental', 6, 'plate', d('arroz'), d('pepino'), d('alga')),
  R('frangoPimentao', () => t('cozinha.r.frangoPimentao', 'Frango com pimentão'), 'oriental', 6, 'plate', d('frango'), d('pimentao'), d('arroz')),
  R('arrozCamarao', () => t('cozinha.r.arrozCamarao', 'Arroz de camarão'), 'oriental', 6, 'plate', d('arroz'), d('camarao')),
  R('camaraoCoco', () => t('cozinha.r.camaraoCoco', 'Camarão com coco'), 'br', 6, 'bowl', d('camarao'), d('coco'), d('arroz')),
  // pacote 7 — Sopas & Tacos
  R('sopaAbobora', () => t('cozinha.r.sopaAbobora', 'Sopa de abóbora'), 'sopa', 7, 'bowl', d('abobora')),
  R('sopaLegumes', () => t('cozinha.r.sopaLegumes', 'Sopa de legumes'), 'sopa', 7, 'bowl', d('abobora'), d('cenoura'), d('cebola')),
  R('taco', () => t('cozinha.r.taco', 'Taco'), 'mex', 7, 'plate', d('tortilla'), d('carne'), d('tomate')),
  R('omelete', () => t('cozinha.r.omelete', 'Omelete de queijo'), 'lanche', 7, 'plate', d('ovo'), d('queijo'), d('cebola')),
  R('espetinho', () => t('cozinha.r.espetinho', 'Espetinho de frango'), 'br', 7, 'plate', d('frango'), d('pimentao'), d('cebola')),
];
export const RECIPE_INDEX: Record<string, number> = {};
RECIPES.forEach((r, i) => (RECIPE_INDEX[r.id] = i));

export interface Pack {
  name: () => string;
  cost: number;
  minDay: number;
}
export const PACKS: Pack[] = [
  { name: () => t('cozinha.pack0', 'Primeiro dia'), cost: 0, minDay: 1 },
  { name: () => t('cozinha.pack1', 'Lanchonete'), cost: 120, minDay: 2 },
  { name: () => t('cozinha.pack2', 'Brasileirinho'), cost: 260, minDay: 3 },
  { name: () => t('cozinha.pack3', 'Pizzaria'), cost: 480, minDay: 5 },
  { name: () => t('cozinha.pack4', 'Doceria'), cost: 760, minDay: 7 },
  { name: () => t('cozinha.pack5', 'Bar de vitaminas'), cost: 1100, minDay: 9 },
  { name: () => t('cozinha.pack6', 'Rolinhos e Oriente'), cost: 1600, minDay: 12 },
  { name: () => t('cozinha.pack7', 'Sopas e Tacos'), cost: 2300, minDay: 15 },
];

/** processos que uma receita precisa */
export function recipeProcs(r: Recipe, out: Set<Proc>): void {
  for (const p of r.parts) {
    const g = INGS[compIng(p)];
    const route = g.routes[compRoute(p)];
    for (let s = 0; s < compStage(p); s++) out.add(route[s]);
  }
}

/* ------------------------------ upgrades ------------------------------ */
export type UpId = 'stove' | 'knife' | 'counters' | 'dining' | 'washer' | 'conveyor' | 'sprinkler' | 'shoes' | 'decor';
export interface Upgrade {
  id: UpId;
  name: () => string;
  desc: () => string;
  max: number;
  cost: (lvl: number) => number;
}
export const UPGRADES: Upgrade[] = [
  { id: 'stove', name: () => t('cozinha.up.stove', 'Fogões turbo'), desc: () => t('cozinha.up.stoveD', 'Panelas, frigideiras e forno cozinham mais rápido.'), max: 5, cost: (l) => 150 * (l + 1) ** 1.6 },
  { id: 'knife', name: () => t('cozinha.up.knife', 'Facas afiadas'), desc: () => t('cozinha.up.knifeD', 'Picar fica mais rápido.'), max: 5, cost: (l) => 110 * (l + 1) ** 1.6 },
  { id: 'counters', name: () => t('cozinha.up.counters', 'Cozinha maior'), desc: () => t('cozinha.up.countersD', 'Mais bancadas e mais estações de preparo.'), max: 6, cost: (l) => 260 * (l + 1) ** 1.7 },
  { id: 'dining', name: () => t('cozinha.up.dining', 'Salão maior'), desc: () => t('cozinha.up.diningD', 'Mais mesas: mais clientes e gorjetas maiores.'), max: 6, cost: (l) => 300 * (l + 1) ** 1.7 },
  { id: 'washer', name: () => t('cozinha.up.washer', 'Lava-louças'), desc: () => t('cozinha.up.washerD', 'Uma máquina lava os pratos sozinha.'), max: 3, cost: (l) => 400 * (l + 1) ** 1.8 },
  { id: 'conveyor', name: () => t('cozinha.up.conveyor', 'Esteira'), desc: () => t('cozinha.up.conveyorD', 'Pratos sujos voltam mais rápido e a esteira leva pratos prontos ao balcão.'), max: 2, cost: (l) => 650 * (l + 1) ** 1.8 },
  { id: 'sprinkler', name: () => t('cozinha.up.sprinkler', 'Chuveirinho anti-fogo'), desc: () => t('cozinha.up.sprinklerD', 'Apaga fogo sozinho depois de alguns segundos.'), max: 2, cost: (l) => 500 * (l + 1) ** 1.8 },
  { id: 'shoes', name: () => t('cozinha.up.shoes', 'Tênis de corrida'), desc: () => t('cozinha.up.shoesD', 'Todo mundo anda mais rápido.'), max: 4, cost: (l) => 180 * (l + 1) ** 1.6 },
  { id: 'decor', name: () => t('cozinha.up.decor', 'Decoração'), desc: () => t('cozinha.up.decorD', 'Novo piso e novas cores. Clientes felizes dão mais gorjeta.'), max: 5, cost: (l) => 220 * (l + 1) ** 1.5 },
];

/* ------------------------------ ajudantes (bots) ------------------------------ */
export type Role = 'cook' | 'chopper' | 'washer' | 'server';
export const ROLES: Role[] = ['cook', 'chopper', 'washer', 'server'];
export const roleName = (r: Role): string =>
  r === 'cook' ? t('cozinha.role.cook', 'Cozinheiro') : r === 'chopper' ? t('cozinha.role.chopper', 'Picador') : r === 'washer' ? t('cozinha.role.washer', 'Lavador') : t('cozinha.role.server', 'Garçom');
export const roleDesc = (r: Role): string =>
  r === 'cook'
    ? t('cozinha.role.cookD', 'Faz pedidos inteiros do começo ao fim.')
    : r === 'chopper'
      ? t('cozinha.role.chopperD', 'Deixa ingredientes picados prontos.')
      : r === 'washer'
        ? t('cozinha.role.washerD', 'Lava pratos e apaga incêndios.')
        : t('cozinha.role.serverD', 'Tira comida do fogo e leva pratos prontos.');
export const HIRE_COST = (n: number): number => 200 + n * 350;
export const MAX_CREW = 5;

/* ------------------------------ eventos e layouts ------------------------------ */
export type Theme = 'classic' | 'boat' | 'space' | 'truck';
export type Special = 'none' | 'rush' | 'critic' | 'outage';
export const themeName = (th: Theme): string =>
  th === 'boat' ? t('cozinha.th.boat', 'Cozinha no barco') : th === 'space' ? t('cozinha.th.space', 'Estação espacial') : th === 'truck' ? t('cozinha.th.truck', 'Food truck') : t('cozinha.th.classic', 'Restaurante');
export const specialName = (s: Special): string =>
  s === 'rush' ? t('cozinha.ev.rush', 'Hora do rush!') : s === 'critic' ? t('cozinha.ev.critic', 'Crítico VIP chegando!') : s === 'outage' ? t('cozinha.ev.outage', 'Apagão! Fogões desligados') : '';

/* ------------------------------ curva de dificuldade ------------------------------ */
export interface DayParams {
  day: number;
  /** duração do turno (s) */
  len: number;
  /** intervalo médio entre pedidos (s) */
  every: number;
  /** pedidos simultâneos no máximo */
  maxOrders: number;
  /** paciência base (s), + extra por componente */
  patience: number;
  perPart: number;
  /** tamanho do cardápio do dia */
  menu: number;
  /** multiplicador de preço (inflação suave para o infinito) */
  priceMul: number;
  /** metas de estrelas (dinheiro) */
  goal: [number, number, number];
  /** grade da cozinha */
  cols: number;
  rows: number;
  /** chance de evento especial no dia */
  eventChance: number;
}

/** Curva infinita: fácil no começo, cada vez mais apertada (satura devagar, nunca para). */
export function dayParams(day: number, up: Record<UpId, number>): DayParams {
  const dd = Math.max(1, day);
  const over = Math.max(0, dd - 30); // depois do dia 30 a pressão continua devagar
  const late = 1 / (1 + over * 0.02); // 1 → 0.5 no dia 80
  const every = Math.max(4.5, (22 - 6 * Math.log2(1 + dd / 5)) * Math.max(0.75, late));
  const maxOrders = Math.min(8, 2 + Math.floor(dd / 4) + up.dining);
  const patience = Math.max(30, 80 - 15 * Math.log2(1 + dd / 5)) * Math.max(0.7, late);
  const len = 120 + Math.min(60, dd * 3);
  const menu = Math.min(8, 2 + Math.floor((dd + 1) / 3));
  const priceMul = 1 + (dd - 1) * 0.04;
  const g1 = Math.round((30 + dd * 15) * (1 + over * 0.02));
  const cols = Math.min(16, 9 + Math.floor(dd / 7) + up.counters);
  const rows = Math.min(11, 7 + Math.floor(dd / 12) + Math.floor(up.counters / 2));
  const eventChance = dd < 3 ? 0 : Math.min(0.85, 0.2 + dd * 0.03);
  return { day: dd, len, every, maxOrders, patience, perPart: 14, menu, priceMul, goal: [g1, Math.round(g1 * 1.6), Math.round(g1 * 2.3)], cols, rows, eventChance };
}

export const emptyUps = (): Record<UpId, number> => ({ stove: 0, knife: 0, counters: 0, dining: 0, washer: 0, conveyor: 0, sprinkler: 0, shoes: 0, decor: 0 });

/** Paletas de decoração (piso/parede) por nível de decor */
export const DECOR = [
  { floorA: '#f3e6cf', floorB: '#e6d3b3', wall: '#7a4fd1', counter: '#dfe5f0', counterSide: '#a9b2c8', dining: '#ffd9b8' },
  { floorA: '#d8f3e3', floorB: '#bfe8cf', wall: '#2f9e6a', counter: '#f2f5fa', counterSide: '#a3b5c2', dining: '#fff0c9' },
  { floorA: '#ffe1ea', floorB: '#ffc9d8', wall: '#d13f7a', counter: '#fff7fb', counterSide: '#c9a3b5', dining: '#e8e0ff' },
  { floorA: '#e0ecff', floorB: '#c8dbff', wall: '#3b5bd1', counter: '#f7f9ff', counterSide: '#9fb0d6', dining: '#ffe8c2' },
  { floorA: '#fff3c4', floorB: '#ffe49a', wall: '#e0701f', counter: '#fffaf0', counterSide: '#d0b48a', dining: '#d8f7ff' },
  { floorA: '#2e2a4a', floorB: '#3a3560', wall: '#ffcf2e', counter: '#e8e4ff', counterSide: '#8f86c9', dining: '#4a3f7a' },
];
