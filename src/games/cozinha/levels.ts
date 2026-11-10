/* ============================================================
 *  COZINHA MALUCA — campanha: 60 fases em 7 mundos (dado puro).
 *  Cada fase define cardápio, ritmo, paciência, metas de estrelas,
 *  tema e evento. Fases 1–3 são o treino guiado (sem relógio).
 *  Também: Desafio do Chef semanal (semente fixa) e cosméticos.
 * ============================================================ */
import { t } from '../../i18n';
import { INGS, PROC_TIME, RECIPES, RECIPE_INDEX, compIng, compRoute, compStage, type DayParams, type Special, type Theme } from './data';

export interface World {
  theme: Theme;
  name: () => string;
  /** receitas (ids) que aparecem neste mundo, da mais fácil para a mais difícil */
  pool: string[];
  /** estrelas totais para liberar */
  stars: number;
  /** cores do mapa */
  col: [string, string];
}
export const WORLDS: World[] = [
  { theme: 'classic', name: () => t('cozinha.w.classic', 'Restaurante da vila'), stars: 0, col: ['#ffcf9a', '#ff8a7a'], pool: ['tomatePicado', 'torrada', 'saladaVerde', 'hamburguer', 'limonada', 'paoQueijo', 'sugo', 'batataFrita', 'xBurguer'] },
  { theme: 'beach', name: () => t('cozinha.w.beach', 'Quiosque na praia'), stars: 14, col: ['#ffe7a8', '#4fd1e8'], pool: ['limonada', 'tapiocaCoco', 'aipim', 'smoothieManga', 'acaiBowl', 'tropical', 'saladaFrutas', 'camaraoCoco'] },
  { theme: 'junina', name: () => t('cozinha.w.junina', 'Festa junina'), stars: 32, col: ['#ffb347', '#d1495b'], pool: ['milhoCozido', 'paoQueijo', 'pastelQueijo', 'brigadeiro', 'tapioca', 'pastelCarne', 'boloChocolate', 'feijaoArroz'] },
  { theme: 'boat', name: () => t('cozinha.w.boat', 'Cozinha no barco'), stars: 52, col: ['#5ec8ff', '#1f6ad1'], pool: ['ovoArroz', 'arrozCamarao', 'rolinhoPepino', 'saladaColorida', 'rolinhoPeixe', 'sopaAbobora', 'camaraoCoco', 'frangoPimentao'] },
  { theme: 'truck', name: () => t('cozinha.w.truck', 'Food truck'), stars: 74, col: ['#9fe08a', '#5a9e4a'], pool: ['batataFrita', 'hamburguer', 'sandFrango', 'xSalada', 'taco', 'pastelCarne', 'espetinho', 'xBurguer'] },
  { theme: 'snow', name: () => t('cozinha.w.snow', 'Cabana na neve'), stars: 98, col: ['#e8f4ff', '#8ab4f8'], pool: ['sopaAbobora', 'vitaminaBanana', 'queijoMacarrao', 'boloMorango', 'sopaLegumes', 'omelete', 'macarraoLegumes', 'boloChocolate'] },
  { theme: 'space', name: () => t('cozinha.w.space', 'Estação espacial'), stars: 124, col: ['#2a1166', '#0b0630'], pool: ['pizzaQueijo', 'acaiBatido', 'smoothieMorango', 'pizzaCalabresa', 'pratoFeito', 'pizzaVerde', 'frangoPimentao', 'omelete'] },
];
/** fases por mundo (soma = 60) */
const PER_WORLD = [10, 8, 8, 8, 8, 8, 10];
export const LEVEL_COUNT = 60;
/** a partir desta fase o Modo Sem Fim libera */
export const ENDLESS_AT = 10;
/** fases em que cada ajudante libera (progressão) */
export const HELPER_AT = [6, 14, 24, 36];

export interface Level {
  /** 1..60 (0 = desafio semanal) */
  n: number;
  world: number;
  /** posição dentro do mundo (0..) */
  k: number;
  theme: Theme;
  menu: number[];
  special: Special;
  /** 1..3 = treino guiado */
  tutorial: number;
  /** pratos limpos no começo (0 = padrão) */
  plates: number;
  p: DayParams;
  seed: number;
}

function worldOf(n: number): [number, number] {
  let a = 0;
  for (let w = 0; w < PER_WORLD.length; w++) {
    if (n <= a + PER_WORLD[w]) return [w, n - a - 1];
    a += PER_WORLD[w];
  }
  return [PER_WORLD.length - 1, n - 1];
}
export function worldStart(w: number): number {
  let a = 1;
  for (let i = 0; i < w; i++) a += PER_WORLD[i];
  return a;
}

/** tempo (s) que um chef sozinho leva, em média, para fazer a receita (estimativa para as metas) */
function workTime(ri: number): number {
  const r = RECIPES[ri];
  let s = 5; // pegar prato + entregar
  for (const c of r.parts) {
    const st = compStage(c);
    s += 3.2; // buscar na caixa e levar
    const route = INGS[compIng(c)].routes[compRoute(c)];
    for (let i = 0; i < st; i++) s += route[i] === 'chop' ? PROC_TIME.chop + 1.5 : 2.5 + PROC_TIME[route[i]] * 0.35;
  }
  return s;
}

/** curva da campanha: começa MUITO fácil (1 pedido por vez, paciência enorme) e sobe por fase */
export function level(n: number): Level {
  n = Math.max(1, Math.min(LEVEL_COUNT, Math.round(n)));
  const [w, k] = worldOf(n);
  const W = WORLDS[w];
  const d = (n - 1) / (LEVEL_COUNT - 1); // 0..1
  const saw = k / Math.max(1, PER_WORLD[w] - 1); // 0..1 dentro do mundo (cada mundo começa mais leve)
  const tutorial = n <= 3 ? n : 0;
  // cardápio
  let menuIds: string[];
  if (n === 1 || n === 3) menuIds = ['tomatePicado'];
  else if (n === 2) menuIds = ['milhoCozido'];
  else {
    const m = Math.min(W.pool.length, n <= 5 ? 1 : n <= 9 ? 2 : Math.min(5, 2 + Math.floor(d * 3.2 + saw)));
    const start = w === 0 ? Math.max(0, Math.min(W.pool.length - m, n - 4)) : Math.min(W.pool.length - m, Math.floor(saw * (W.pool.length - m + 0.99)));
    menuIds = W.pool.slice(start, start + m);
  }
  const menu = menuIds.map((id) => RECIPE_INDEX[id]).filter((i) => i !== undefined);
  const len = tutorial ? 9999 : Math.round(90 + 60 * d + 10 * saw);
  const every = tutorial ? 6 : Math.max(8, 30 - 18 * Math.pow(d, 0.75) - 3 * saw);
  const maxOrders = tutorial ? 1 : Math.min(5, 1 + Math.floor((n + 1) / 7) + (saw > 0.6 ? 1 : 0));
  const patience = tutorial ? 1e6 : Math.round(150 - 85 * Math.pow(d, 0.8) - 10 * saw);
  const cols = n < 20 ? 9 : n < 40 ? 10 : 11;
  const rows = n < 40 ? 7 : 8;
  // evento: só depois do 1º mundo, em fases fixas (dado)
  const special: Special = w === 0 ? 'none' : k === 3 ? 'rush' : k === 5 ? 'critic' : k === 6 && w >= 3 ? 'outage' : 'none';
  // metas: quantos pratos um chef sozinho consegue (limitado pela chegada de pedidos)
  let avgPrice = 0;
  let avgWork = 0;
  for (const ri of menu) {
    avgPrice += RECIPES[ri].price;
    avgWork += workTime(ri);
  }
  avgPrice /= Math.max(1, menu.length);
  avgWork /= Math.max(1, menu.length);
  const priceMul = 1 + d * 0.8;
  const canMake = (len - 6) / avgWork;
  const arrive = (len - 8) / every + 1;
  const dishes = Math.max(1, Math.min(canMake, arrive));
  const per = avgPrice * priceMul * 1.3; // preço + gorjeta média
  const full = dishes * per;
  const goal: [number, number, number] = tutorial ? [1, 1, 1] : [Math.round(full * 0.3), Math.round(full * 0.55), Math.round(full * 0.78)];
  const p: DayParams = { day: n, len, every, maxOrders, patience, perPart: tutorial ? 0 : 14, menu: menu.length, priceMul, goal, cols, rows, eventChance: 0 };
  return { n, world: w, k, theme: W.theme, menu, special, tutorial, plates: tutorial === 3 ? 1 : 0, p, seed: 1000 + n * 7919 };
}

/* ------------------------------ Desafio do Chef (semanal) ------------------------------ */
export function weekKey(d = new Date()): string {
  const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = x.getUTCDay() || 7;
  x.setUTCDate(x.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((x.getTime() - y0.getTime()) / 86400000 + 1) / 7);
  return x.getUTCFullYear() + '-W' + String(wk).padStart(2, '0');
}
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** fase do desafio: mesma para todo mundo na semana (semente fixa) */
export function weeklyLevel(key = weekKey()): Level {
  const h = hash(key);
  const base = level(22 + (h % 30));
  const w = (h >>> 8) % WORLDS.length;
  const pool = WORLDS[w].pool;
  const start = (h >>> 12) % (pool.length - 3);
  const menu = pool.slice(start, start + 4).map((id) => RECIPE_INDEX[id]);
  const p = { ...base.p, len: 150, menu: menu.length };
  return { ...base, n: 0, world: w, theme: WORLDS[w].theme, menu, special: (['rush', 'critic', 'none'] as Special[])[h % 3], p, seed: h };
}

/* ------------------------------ cosméticos (só visual) ------------------------------ */
export interface Cosmetic {
  id: number;
  col: string;
  stars: number;
  name: () => string;
}
export const HATS: Cosmetic[] = [
  { id: 0, col: '#ffffff', stars: 0, name: () => t('cozinha.cos.white', 'Clássico') },
  { id: 1, col: '#ff5c7a', stars: 8, name: () => t('cozinha.cos.red', 'Morango') },
  { id: 2, col: '#5ab0ff', stars: 20, name: () => t('cozinha.cos.blue', 'Oceano') },
  { id: 3, col: '#3ee07a', stars: 40, name: () => t('cozinha.cos.green', 'Hortelã') },
  { id: 4, col: '#ffd84a', stars: 65, name: () => t('cozinha.cos.gold', 'Dourado') },
  { id: 5, col: '#b77bd9', stars: 95, name: () => t('cozinha.cos.purple', 'Açaí') },
  { id: 6, col: '#2a2a3a', stars: 140, name: () => t('cozinha.cos.black', 'Mestre') },
];
export const APRONS: Cosmetic[] = [
  { id: 0, col: '', stars: 0, name: () => t('cozinha.cos.none', 'Sem avental') },
  { id: 1, col: '#ffffff', stars: 4, name: () => t('cozinha.cos.white', 'Clássico') },
  { id: 2, col: '#ff9a2e', stars: 15, name: () => t('cozinha.cos.orange', 'Laranja') },
  { id: 3, col: '#ff7ae0', stars: 30, name: () => t('cozinha.cos.pink', 'Chiclete') },
  { id: 4, col: '#4cc46a', stars: 55, name: () => t('cozinha.cos.green', 'Hortelã') },
  { id: 5, col: '#3b5bd1', stars: 80, name: () => t('cozinha.cos.navy', 'Marinheiro') },
  { id: 6, col: '#e8566b', stars: 120, name: () => t('cozinha.cos.checker', 'Xadrez junino') },
];

/* ------------------------------ Desafio diário ------------------------------ */
export function dayKey(d = new Date()): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/** fase do dia: igual para todo mundo no mesmo dia (semente fixa), dificuldade média-alta */
export function dailyLevel(key = dayKey()): Level {
  const h = hash('d' + key);
  const base = level(14 + (h % 34));
  const w = (h >>> 8) % WORLDS.length;
  const pool = WORLDS[w].pool;
  const m = 3 + ((h >>> 4) % 2);
  const start = (h >>> 12) % (pool.length - m + 1);
  const menu = pool.slice(start, start + m).map((id) => RECIPE_INDEX[id]).filter((i) => i !== undefined);
  const p = { ...base.p, len: 120, menu: menu.length };
  return { ...base, n: 0, world: w, theme: WORLDS[w].theme, menu, special: (['rush', 'critic', 'none', 'none'] as Special[])[h % 4], p, seed: h };
}

/* ------------------------------ progresso do mapa ------------------------------ */
export function totalStars(st: Record<string, number>): number {
  let n = 0;
  for (const k in st) n += st[k] | 0;
  return n;
}
/** fase jogável? (anterior concluída e estrelas suficientes para o mundo) */
export function levelOpen(n: number, st: Record<string, number>): boolean {
  if (n <= 1) return true;
  if (!((st[n - 1] ?? 0) > 0)) return false;
  return totalStars(st) >= WORLDS[worldOf(n)[0]].stars;
}
export function worldIndex(n: number): number {
  return worldOf(n)[0];
}
/** novidades desta fase: receitas e estações que aparecem pela 1ª vez */
export function levelNews(n: number): { recipes: number[]; procs: string[] } {
  const seenR = new Set<number>();
  const seenP = new Set<string>();
  const procsOf = (ri: number) => {
    const out: string[] = [];
    for (const c of RECIPES[ri].parts) {
      const route = INGS[compIng(c)].routes[compRoute(c)];
      for (let i = 0; i < compStage(c); i++) out.push(route[i]);
    }
    return out;
  };
  for (let i = 1; i < n; i++)
    for (const ri of level(i).menu) {
      seenR.add(ri);
      for (const p of procsOf(ri)) seenP.add(p);
    }
  const recipes: number[] = [];
  const procs: string[] = [];
  for (const ri of level(n).menu) {
    if (!seenR.has(ri)) recipes.push(ri);
    for (const p of procsOf(ri))
      if (!seenP.has(p) && !procs.includes(p)) procs.push(p);
  }
  return { recipes, procs };
}
