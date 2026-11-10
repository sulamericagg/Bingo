/* ============================================================
 *  CASA 3D · ATIVIDADES — dados puros: ingredientes, receitas,
 *  reconhecedor de pratos (regras tolerantes) e nomes engraçados.
 *  Sem three/cannon: testável isolado.
 * ============================================================ */
import { t } from '../../i18n';
import type { MessKind } from '../adapter';

export type Cat = 'veg' | 'fruit' | 'prot' | 'grain' | 'dairy' | 'bake';
export type Method = 'fry' | 'boil' | 'bake' | 'blend';

export interface IngDef {
  id: string;
  /** gênero gramatical (para "queimado/queimada") */
  g: 'm' | 'f';
  cat: Cat;
  /** casca e miolo */
  skin: string;
  flesh: string;
  /** raio físico (m) */
  r: number;
  /** cresce na horta */
  garden?: boolean;
  /** sujeira que deixa ao espatifar */
  splat: MessKind;
  /** quebra ao bater forte (ovo, tomate) */
  squishy?: boolean;
}
const D = (id: string, g: 'm' | 'f', cat: Cat, skin: string, flesh: string, r: number, splat: MessKind, f: Partial<IngDef> = {}): IngDef => ({ id, g, cat, skin, flesh, r, splat, ...f });

export const INGS: IngDef[] = [
  D('tomate', 'm', 'veg', '#ff4a3d', '#ff8a6a', 0.055, 'tomato', { garden: true, squishy: true }),
  D('cenoura', 'f', 'veg', '#ff8a1f', '#ffb04a', 0.045, 'juice', { garden: true }),
  D('batata', 'f', 'veg', '#c8955a', '#ffe9a8', 0.055, 'crumbs'),
  D('cebola', 'f', 'veg', '#d9a3e8', '#fff0f6', 0.05, 'juice'),
  D('alface', 'f', 'veg', '#6fd45a', '#c9f7a8', 0.075, 'juice', { garden: true }),
  D('pimentao', 'm', 'veg', '#33c25a', '#a8f0a0', 0.055, 'juice', { garden: true }),
  D('brocolis', 'm', 'veg', '#2f9e44', '#9be07a', 0.06, 'juice'),
  D('cogumelo', 'm', 'veg', '#e8d3b0', '#fff6e6', 0.045, 'crumbs'),
  D('milho', 'm', 'veg', '#ffd83a', '#fff09a', 0.05, 'crumbs', { garden: true }),
  D('ovo', 'm', 'prot', '#fff7ea', '#ffd23a', 0.04, 'juice', { squishy: true }),
  D('queijo', 'm', 'dairy', '#ffd84a', '#fff0a0', 0.05, 'crumbs'),
  D('pao', 'm', 'grain', '#e8a24c', '#fff0c9', 0.07, 'crumbs'),
  D('carne', 'f', 'prot', '#e8566b', '#ffb0b8', 0.06, 'tomato'),
  D('tofu', 'm', 'prot', '#fffbe8', '#ffffff', 0.05, 'frosting'),
  D('macarrao', 'm', 'grain', '#ffe18a', '#fff3c4', 0.06, 'crumbs'),
  D('arroz', 'm', 'grain', '#f5f0e0', '#ffffff', 0.06, 'crumbs'),
  D('banana', 'f', 'fruit', '#ffe14a', '#fff8d6', 0.06, 'pie'),
  D('maca', 'f', 'fruit', '#ff4060', '#fff3d6', 0.05, 'juice'),
  D('morango', 'm', 'fruit', '#ff3e5e', '#ff9aa8', 0.035, 'tomato', { garden: true, squishy: true }),
  D('laranja', 'f', 'fruit', '#ff9a1f', '#ffc24a', 0.055, 'juice'),
  D('leite', 'm', 'dairy', '#ffffff', '#ffffff', 0.055, 'frosting'),
  D('farinha', 'f', 'bake', '#f2ead8', '#ffffff', 0.06, 'crumbs'),
  D('chocolate', 'm', 'bake', '#7b4a2b', '#a8714a', 0.05, 'mud'),
];
export const ING = new Map(INGS.map((i) => [i.id, i]));
export const GARDEN_SEEDS = INGS.filter((i) => i.garden).map((i) => i.id);

export function ingName(id: string): string {
  switch (id) {
    case 'tomate': return t('act.ing.tomate', 'Tomate');
    case 'cenoura': return t('act.ing.cenoura', 'Cenoura');
    case 'batata': return t('act.ing.batata', 'Batata');
    case 'cebola': return t('act.ing.cebola', 'Cebola');
    case 'alface': return t('act.ing.alface', 'Alface');
    case 'pimentao': return t('act.ing.pimentao', 'Pimentão');
    case 'brocolis': return t('act.ing.brocolis', 'Brócolis');
    case 'cogumelo': return t('act.ing.cogumelo', 'Cogumelo');
    case 'milho': return t('act.ing.milho', 'Milho');
    case 'ovo': return t('act.ing.ovo', 'Ovo');
    case 'queijo': return t('act.ing.queijo', 'Queijo');
    case 'pao': return t('act.ing.pao', 'Pão');
    case 'carne': return t('act.ing.carne', 'Carne');
    case 'tofu': return t('act.ing.tofu', 'Tofu');
    case 'macarrao': return t('act.ing.macarrao', 'Macarrão');
    case 'arroz': return t('act.ing.arroz', 'Arroz');
    case 'banana': return t('act.ing.banana', 'Banana');
    case 'maca': return t('act.ing.maca', 'Maçã');
    case 'morango': return t('act.ing.morango', 'Morango');
    case 'laranja': return t('act.ing.laranja', 'Laranja');
    case 'leite': return t('act.ing.leite', 'Leite');
    case 'farinha': return t('act.ing.farinha', 'Farinha');
    case 'chocolate': return t('act.ing.chocolate', 'Chocolate');
    default: return id;
  }
}
/** pratos "compostos" que nascem no forno/frigideira */
export type Made = 'cake' | 'choccake' | 'pizza' | 'pancake' | 'friedegg' | 'popcorn';
export function madeName(m: string): string {
  switch (m) {
    case 'cake': return t('act.made.cake', 'Bolo');
    case 'choccake': return t('act.made.choccake', 'Bolo de chocolate');
    case 'pizza': return t('act.made.pizza', 'Pizza');
    case 'pancake': return t('act.made.pancake', 'Panqueca');
    case 'friedegg': return t('act.made.friedegg', 'Ovo frito');
    case 'popcorn': return t('act.made.popcorn', 'Pipoca');
    default: return m;
  }
}
export function madeColor(m: string): string {
  return ({ cake: '#ffd9a8', choccake: '#7b4a2b', pizza: '#ffcf6a', pancake: '#f2b25c', friedegg: '#fffbe8', popcorn: '#fff6d6' } as Record<string, string>)[m] ?? '#ffe0a3';
}

/* ---------------- estado de um pedaço de comida (para receitas) ---------------- */
export interface Bit {
  ing: string;
  /** 0 inteiro, 1 fatiado, 2 picadinho */
  cut: number;
  /** 0 cru · 1 no ponto · ≥1.6 queimado */
  cook: number;
  m: Method[];
  made?: string;
  garden?: boolean;
}
export const BURNT = 1.6;
export const isBurnt = (b: Bit) => b.cook >= BURNT;
const cooked = (b: Bit, m?: Method) => b.cook >= 0.45 && (!m || b.m.includes(m));

/* ---------------- receitas ---------------- */
export interface Recipe {
  id: string;
  name: () => string;
  hint: () => string;
  test: (L: Bit[]) => boolean;
}
const has = (L: Bit[], id: string, ok: (b: Bit) => boolean = () => true) => L.some((b) => b.ing === id && ok(b));
const made = (L: Bit[], m: string) => L.some((b) => b.made === m);
const kinds = (L: Bit[], cat: Cat, ok: (b: Bit) => boolean = () => true) => new Set(L.filter((b) => !b.made && ING.get(b.ing)?.cat === cat && ok(b)).map((b) => b.ing)).size;
const R = (id: string, name: () => string, hint: () => string, test: (L: Bit[]) => boolean): Recipe => ({ id, name, hint, test });

/** ordem importa: o primeiro que bater ganha (do mais específico ao mais geral) */
export const RECIPES: Recipe[] = [
  R('choccake', () => t('act.rec.choccake', 'Bolo de chocolate'), () => t('act.hint.choccake', 'Forno: farinha, ovo e chocolate'), (L) => made(L, 'choccake')),
  R('cake', () => t('act.rec.cake', 'Bolo fofinho'), () => t('act.hint.cake', 'Forno: farinha e ovo (leite ajuda)'), (L) => made(L, 'cake')),
  R('pizza', () => t('act.rec.pizza', 'Pizza'), () => t('act.hint.pizza', 'Forno: farinha, queijo e tomate'), (L) => made(L, 'pizza')),
  R('pancake', () => t('act.rec.pancake', 'Panqueca'), () => t('act.hint.pancake', 'Frigideira: farinha, ovo e leite'), (L) => made(L, 'pancake')),
  R('popcorn', () => t('act.rec.popcorn', 'Pipoca'), () => t('act.hint.popcorn', 'Milho na frigideira quente... cuidado!'), (L) => made(L, 'popcorn')),
  R('smoothie', () => t('act.rec.smoothie', 'Vitamina'), () => t('act.hint.smoothie', 'Liquidificador: fruta com leite'), (L) => L.some((b) => b.m.includes('blend')) && has(L, 'leite') && kinds(L, 'fruit') >= 1),
  R('juice', () => t('act.rec.juice', 'Suco natural'), () => t('act.hint.juice', 'Liquidificador: só frutas'), (L) => L.some((b) => b.m.includes('blend')) && kinds(L, 'fruit') >= 1),
  R('fruitsalad', () => t('act.rec.fruitsalad', 'Salada de frutas'), () => t('act.hint.fruitsalad', 'Duas frutas cortadas no prato'), (L) => kinds(L, 'fruit', (b) => b.cook < 0.3 && b.cut > 0) >= 2),
  R('burger', () => t('act.rec.burger', 'Hambúrguer'), () => t('act.hint.burger', 'Pão + carne frita'), (L) => has(L, 'pao') && has(L, 'carne', (b) => cooked(b, 'fry'))),
  R('grilledcheese', () => t('act.rec.grilledcheese', 'Misto quente'), () => t('act.hint.grilledcheese', 'Pão e queijo na frigideira'), (L) => has(L, 'pao') && has(L, 'queijo') && L.some((b) => (b.ing === 'pao' || b.ing === 'queijo') && cooked(b, 'fry'))),
  R('sandwich', () => t('act.rec.sandwich', 'Sanduíche'), () => t('act.hint.sandwich', 'Pão com recheio no prato'), (L) => has(L, 'pao') && L.some((b) => ['queijo', 'alface', 'tomate', 'carne', 'tofu', 'ovo'].includes(b.ing))),
  R('omelet', () => t('act.rec.omelet', 'Omelete'), () => t('act.hint.omelet', 'Ovo + legume ou queijo na frigideira'), (L) => (made(L, 'friedegg') || has(L, 'ovo', (b) => cooked(b, 'fry'))) && L.some((b) => !b.made && b.ing !== 'ovo' && cooked(b, 'fry'))),
  R('friedegg', () => t('act.rec.friedegg', 'Ovo frito'), () => t('act.hint.friedegg', 'Quebre um ovo na frigideira'), (L) => made(L, 'friedegg') || has(L, 'ovo', (b) => cooked(b, 'fry'))),
  R('sugo', () => t('act.rec.sugo', 'Macarrão ao sugo'), () => t('act.hint.sugo', 'Panela: macarrão e tomate'), (L) => has(L, 'macarrao', (b) => cooked(b, 'boil')) && has(L, 'tomate')),
  R('pasta', () => t('act.rec.pasta', 'Macarronada'), () => t('act.hint.pasta', 'Macarrão na panela'), (L) => has(L, 'macarrao', (b) => cooked(b, 'boil'))),
  R('mash', () => t('act.rec.mash', 'Purê de batata'), () => t('act.hint.mash', 'Panela: batata e leite'), (L) => has(L, 'batata', (b) => cooked(b, 'boil')) && (has(L, 'leite') || has(L, 'queijo'))),
  R('fries', () => t('act.rec.fries', 'Batata frita'), () => t('act.hint.fries', 'Batata cortada na frigideira'), (L) => has(L, 'batata', (b) => b.cut > 0 && cooked(b, 'fry'))),
  R('ricevegs', () => t('act.rec.ricevegs', 'Arroz com legumes'), () => t('act.hint.ricevegs', 'Panela: arroz e legumes'), (L) => has(L, 'arroz', (b) => cooked(b)) && kinds(L, 'veg', (b) => cooked(b)) >= 1),
  R('soup', () => t('act.rec.soup', 'Sopa de legumes'), () => t('act.hint.soup', 'Panela: dois legumes ou mais'), (L) => kinds(L, 'veg', (b) => cooked(b, 'boil')) >= 2),
  R('rice', () => t('act.rec.rice', 'Arroz soltinho'), () => t('act.hint.rice', 'Arroz na panela'), (L) => has(L, 'arroz', (b) => cooked(b, 'boil'))),
  R('steakonion', () => t('act.rec.steakonion', 'Bife acebolado'), () => t('act.hint.steakonion', 'Frigideira: carne e cebola'), (L) => has(L, 'carne', (b) => cooked(b, 'fry')) && has(L, 'cebola', (b) => cooked(b))),
  R('steak', () => t('act.rec.steak', 'Bife'), () => t('act.hint.steak', 'Carne na frigideira'), (L) => has(L, 'carne', (b) => cooked(b))),
  R('tofu', () => t('act.rec.tofu', 'Tofu grelhado'), () => t('act.hint.tofu', 'Tofu na frigideira'), (L) => has(L, 'tofu', (b) => cooked(b))),
  R('mushrooms', () => t('act.rec.mushrooms', 'Cogumelos salteados'), () => t('act.hint.mushrooms', 'Cogumelos na frigideira'), (L) => has(L, 'cogumelo', (b) => cooked(b, 'fry'))),
  R('stirfry', () => t('act.rec.stirfry', 'Legumes salteados'), () => t('act.hint.stirfry', 'Frigideira: dois legumes ou mais'), (L) => kinds(L, 'veg', (b) => cooked(b, 'fry')) >= 2),
  R('corn', () => t('act.rec.corn', 'Milho cozido'), () => t('act.hint.corn', 'Milho na panela'), (L) => has(L, 'milho', (b) => cooked(b, 'boil'))),
  R('salad', () => t('act.rec.salad', 'Salada'), () => t('act.hint.salad', 'Dois legumes crus e cortados'), (L) => kinds(L, 'veg', (b) => b.cook < 0.3) >= 2 && L.some((b) => b.cut > 0 && b.cook < 0.3)),
  R('toast', () => t('act.rec.toast', 'Torrada'), () => t('act.hint.toast', 'Pão na frigideira'), (L) => has(L, 'pao', (b) => cooked(b))),
];
export const RECIPE = new Map(RECIPES.map((r) => [r.id, r]));

/* ---------------- nome engraçado ---------------- */
function adj(b: Bit): string {
  const f = (ING.get(b.ing)?.g ?? 'm') === 'f';
  if (isBurnt(b)) return f ? t('act.adj.burntF', 'queimada') : t('act.adj.burntM', 'queimado');
  if (b.m.includes('blend')) return f ? t('act.adj.blendF', 'batida') : t('act.adj.blendM', 'batido');
  if (b.cook >= 0.45) return f ? t('act.adj.cookedF', 'molenga') : t('act.adj.cookedM', 'molenga');
  if (b.cut >= 2) return f ? t('act.adj.mincedF', 'picadinha') : t('act.adj.mincedM', 'picadinho');
  if (b.cut === 1) return f ? t('act.adj.slicedF', 'fatiada') : t('act.adj.slicedM', 'fatiado');
  return f ? t('act.adj.rawF', 'crua') : t('act.adj.rawM', 'cru');
}
const lc = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
function bitName(b: Bit): string {
  return b.made ? madeName(b.made) : ingName(b.ing);
}
/** nome gerado (determinístico pela mistura) */
export function funnyName(L: Bit[]): string {
  if (!L.length) return t('act.funny.empty', 'Prato vazio');
  const count = new Map<string, number>();
  for (const b of L) count.set(b.made ?? b.ing, (count.get(b.made ?? b.ing) ?? 0) + 1);
  const order = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => L.find((b) => (b.made ?? b.ing) === k)!);
  const main = order[0];
  const second = order[1];
  let h = 0;
  for (const b of L) h = (h * 31 + (b.made ?? b.ing).charCodeAt(0) + b.cut * 7 + Math.round(b.cook * 3)) >>> 0;
  const a = lc(bitName(main));
  const ad = adj(main);
  if (L.every(isBurnt)) return t('act.funny.charcoal', 'Carvão de {a}', { a });
  if (!second) {
    const pool = [t('act.funny.goo', 'Gororoba de {a} {adj}', { a, adj: ad }), t('act.funny.lonely', '{A} {adj} solitári{o}', { A: bitName(main), adj: ad, o: ING.get(main.ing)?.g === 'f' ? 'a' : 'o' }), t('act.funny.chef', 'Surpresa do chef: {a} {adj}', { a, adj: ad })];
    return pool[h % pool.length];
  }
  const b = lc(bitName(second));
  if (order.length >= 4) return t('act.funny.everything', 'Tudo-que-tinha-na-geladeira ({n} coisas)', { n: L.length });
  const pool = [
    t('act.funny.mix', 'Mistureba de {a} com {b}', { a, b }),
    t('act.funny.goo2', 'Gororoba de {a} {adj} com {b}', { a, adj: ad, b }),
    t('act.funny.exp', 'Experimento nº {n}: {a} + {b}', { a, b, n: 1 + (h % 97) }),
    t('act.funny.chaos', 'Caos de {a} à moda da casa', { a }),
    t('act.funny.crime', '{A} com {b} (não conta pra ninguém)', { A: bitName(main), b }),
  ];
  return pool[h % pool.length];
}

export interface DishResult {
  recipe: Recipe | null;
  name: string;
  stars: number;
}
export function judge(L: Bit[]): DishResult {
  const food = L.filter((b) => b.ing || b.made);
  const recipe = food.length && !food.every(isBurnt) ? (RECIPES.find((r) => r.test(food)) ?? null) : null;
  const burnt = food.filter(isBurnt).length;
  const distinct = new Set(food.map((b) => b.made ?? b.ing)).size;
  let stars: number;
  if (recipe) {
    stars = 3;
    if (!burnt && distinct >= 3) stars++;
    if (food.some((b) => b.garden)) stars++;
    stars -= Math.min(2, burnt);
  } else stars = 1 + (distinct >= 3 && !burnt ? 1 : 0);
  stars = Math.max(1, Math.min(5, stars));
  return { recipe, name: recipe ? recipe.name() : funnyName(food), stars };
}
/** para o bichinho (src/pet: despensa) */
export function petFoodFor(L: Bit[], recipeId: string | null): string {
  if (recipeId === 'cake' || recipeId === 'choccake' || recipeId === 'pancake') return 'cake';
  if (recipeId === 'soup' || L.some((b) => b.m.includes('boil'))) return 'soup';
  if (recipeId === 'juice' || recipeId === 'smoothie' || recipeId === 'fruitsalad') return 'apple';
  if (L.some((b) => ING.get(b.ing)?.cat === 'veg')) return 'carrot';
  return 'cookie';
}
export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
