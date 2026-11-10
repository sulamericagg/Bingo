/**
 * CAÇA BLOOP — GENOMA. Gerador procedural e determinístico de bichinhos a partir de uma semente de 64 bits.
 *
 * genome(seed, evo) é uma função PURA: a mesma semente gera o mesmo bichinho em qualquer aparelho.
 * O nibble baixo da semente (lo & 15, se < 10) escolhe o elemento — é assim que o gerador de aparições
 * puxa "bichinhos de água perto da água" sem quebrar a reprodutibilidade (a semente sozinha define tudo).
 *
 * A raridade vem SÓ de um hash da semente (nunca do lugar): nenhum endereço real tem bichos "mais raros".
 * ÚNICO: sementes cujo hash 'uniq' tem 18 bits zerados (1 em 262.144). Ganha material/aura Prisma,
 * uma constelação-assinatura desenhada a partir dos 32 bits da semente e um número de série.
 * Nunca vendido: não existe compra (dinheiro, moedas ou troca) de bichinhos neste modo.
 */
import { Rng, hashN, parseSeed, seedHex, type Seed64 } from './rng';

export const ELEMENTS = ['fogo', 'agua', 'planta', 'eletrico', 'gelo', 'terra', 'ar', 'luz', 'sombra', 'som'] as const;
export type Element = (typeof ELEMENTS)[number];

export const SHAPES = ['redondo', 'alto', 'gordo', 'magro', 'longo', 'blob', 'estrela', 'cubo', 'gota', 'pera'] as const;
export type Shape = (typeof SHAPES)[number];

export const LIMBS = ['nenhum', 'pes', 'pernas4', 'pernas6', 'bracos', 'asas', 'barbatanas', 'tentaculos'] as const;
export type Limbs = (typeof LIMBS)[number];
export const WING_STYLES = ['pena', 'morcego', 'inseto'] as const;
export type WingStyle = (typeof WING_STYLES)[number];

export const TOPS = ['nenhum', 'gato', 'redondas', 'coelho', 'caidas', 'chifres', 'unichifre', 'antenas', 'crista', 'broto', 'chama', 'cristais', 'carneiro'] as const;
export type Top = (typeof TOPS)[number];

export const EYE_SHAPES = ['ponto', 'grande', 'brilho', 'feliz', 'sono', 'fenda', 'desenho'] as const;
export type EyeShape = (typeof EYE_SHAPES)[number];

export const MOUTHS = ['sorriso', 'aberta', 'gato', 'presa', 'lingua', 'oh', 'dentes', 'bico', 'presas', 'pontinho'] as const;
export type Mouth = (typeof MOUTHS)[number];

export const TAILS = ['nenhuma', 'enrolada', 'fofa', 'seta', 'folha', 'peixe', 'raio', 'aneis'] as const;
export type Tail = (typeof TAILS)[number];

export const PATTERNS = ['nenhum', 'barriga', 'pintas', 'listras', 'degrade', 'galaxia', 'xadrez', 'brilhos', 'manchas', 'aneis'] as const;
export type Pattern = (typeof PATTERNS)[number];

export const MATERIALS = ['liso', 'fofo', 'cristal', 'metal', 'gelatina', 'nuvem', 'lava', 'prisma'] as const;
export type Material = (typeof MATERIALS)[number];

export const ACCESSORIES = ['nenhum', 'laco', 'cachecol', 'coroa', 'flor', 'oculos', 'bone', 'sino', 'estrela', 'monoculo', 'bandana', 'folha', 'fones'] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export const AURAS = ['nenhuma', 'brilho', 'anel', 'faiscas', 'chamas', 'bolhas', 'notas', 'prisma'] as const;
export type Aura = (typeof AURAS)[number];

export const CHEEKS = ['nenhuma', 'rosa', 'elemento'] as const;
export type Cheeks = (typeof CHEEKS)[number];

/** 0 comum · 1 incomum · 2 raro · 3 épico · 4 lendário · 5 ÚNICO */
export type Rarity = 0 | 1 | 2 | 3 | 4 | 5;
export const RARITY_IDS = ['comum', 'incomum', 'raro', 'epico', 'lendario', 'unico'] as const;
/** limites acumulados do sorteio de raridade (o Único é um teste à parte) */
export const RARITY_CUTS = { lendario: 0.004, epico: 0.024, raro: 0.09, incomum: 0.3 };
export const UNIQUE_BITS = 18; // 1 em 2^18 = 262.144

/** HSL */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}
export interface Palette {
  body: Hsl;
  pat: Hsl;
  acc: Hsl;
  eye: Hsl;
  scheme: 'analoga' | 'complementar' | 'triade' | 'dividida' | 'mono';
}

export interface Stats {
  vig: number; // vida
  forca: number;
  defesa: number;
  agil: number;
}

export interface Genome {
  id: string; // seedHex + '.' + evo
  seed: string;
  evo: number; // 0..2
  rarity: Rarity;
  element: Element;
  element2: Element | null;
  shape: Shape;
  /** escala geral (0.8..1.3) e proporção (achatado/esticado) */
  size: number;
  aspect: number;
  limbs: Limbs;
  wing: WingStyle;
  top: Top;
  eyes: { n: 1 | 2 | 3 | 4; shape: EyeShape; size: number };
  mouth: Mouth;
  tail: Tail;
  pattern: Pattern;
  material: Material;
  accessory: Accessory;
  aura: Aura;
  cheeks: Cheeks;
  pal: Palette;
  stats: Stats;
  name: string;
  /** família do Bloopdex: forma × elemento (100 famílias) */
  family: string;
  /** só para ÚNICO: 32 bits para a constelação-assinatura e número de série */
  signature: number;
  /** semente de detalhes visuais (posição de pintas etc.) */
  detail: number;
}

const EL_HUE: Record<Element, number> = { fogo: 12, agua: 205, planta: 118, eletrico: 50, gelo: 188, terra: 28, ar: 165, luz: 44, sombra: 268, som: 318 };

/** Raridade de uma semente (só depende da semente). */
export function rarityOf(s: Seed64): Rarity {
  if ((hashN(s.hi, s.lo, 'uniq') & ((1 << UNIQUE_BITS) - 1)) === 0) return 5;
  const r = hashN(s.hi, s.lo, 'rar') / 4294967296;
  if (r < RARITY_CUTS.lendario) return 4;
  if (r < RARITY_CUTS.epico) return 3;
  if (r < RARITY_CUTS.raro) return 2;
  if (r < RARITY_CUTS.incomum) return 1;
  return 0;
}

/** Probabilidade de cada raridade por aparição (para a tela de ajuda e o relatório). */
export function rarityOdds(): number[] {
  const u = 1 / (1 << UNIQUE_BITS);
  const k = 1 - u;
  const c = RARITY_CUTS;
  return [(1 - c.incomum) * k, (c.incomum - c.raro) * k, (c.raro - c.epico) * k, (c.epico - c.lendario) * k, c.lendario * k, u];
}

function elementOf(s: Seed64, r: Rng): Element {
  const n = s.lo & 15;
  return n < 10 ? ELEMENTS[n] : ELEMENTS[r.int(10)];
}

/** Troca o nibble do elemento numa semente (usado pelo gerador de aparições). */
export function withElement(s: Seed64, el: Element): Seed64 {
  return { hi: s.hi, lo: ((s.lo & ~15) | ELEMENTS.indexOf(el)) >>> 0 };
}

const SHAPE_W: Record<Element, Partial<Record<Shape, number>>> = {
  fogo: { gota: 3, estrela: 2 },
  agua: { gota: 4, blob: 2, longo: 2 },
  planta: { pera: 3, alto: 2 },
  eletrico: { estrela: 3, magro: 2 },
  gelo: { cubo: 3, estrela: 2 },
  terra: { gordo: 4, cubo: 2 },
  ar: { redondo: 3, magro: 2 },
  luz: { estrela: 3, redondo: 2 },
  sombra: { blob: 3, alto: 2 },
  som: { redondo: 2, longo: 2, pera: 2 },
};

const LIMB_W: Record<Shape, Partial<Record<Limbs, number>>> = {
  redondo: { pes: 5, bracos: 3, asas: 2, nenhum: 2 },
  alto: { pes: 4, bracos: 4, asas: 2 },
  gordo: { pes: 5, pernas4: 3, bracos: 2 },
  magro: { pes: 3, bracos: 4, pernas6: 2, asas: 2 },
  longo: { pernas4: 5, pernas6: 3, barbatanas: 2 },
  blob: { nenhum: 4, tentaculos: 3, pes: 2 },
  estrela: { nenhum: 4, bracos: 2, asas: 2 },
  cubo: { pes: 4, pernas4: 3, bracos: 2 },
  gota: { nenhum: 3, barbatanas: 3, tentaculos: 3 },
  pera: { pes: 4, bracos: 3, pernas4: 2 },
};

const AURA_EL: Record<Element, Aura> = { fogo: 'chamas', agua: 'bolhas', planta: 'brilho', eletrico: 'faiscas', gelo: 'brilho', terra: 'anel', ar: 'anel', luz: 'brilho', sombra: 'anel', som: 'notas' };
const MAT_EL: Record<Element, Material> = { fogo: 'lava', agua: 'gelatina', planta: 'fofo', eletrico: 'metal', gelo: 'cristal', terra: 'metal', ar: 'nuvem', luz: 'cristal', sombra: 'gelatina', som: 'fofo' };

/* ---------------- nomes (sílabas pt-BR) ---------------- */
const STEMS: Record<Element, string[]> = {
  fogo: ['Bras', 'Cham', 'Fagul', 'Labar', 'Ard', 'Fum', 'Pir', 'Quent', 'Tost', 'Fogar'],
  agua: ['Bolh', 'Got', 'Ond', 'Mar', 'Aqu', 'Chuv', 'Lag', 'Rib', 'Mol', 'Poç'],
  planta: ['Folh', 'Brot', 'Ram', 'Flor', 'Mus', 'Sement', 'Galh', 'Petal', 'Verd', 'Cip'],
  eletrico: ['Fais', 'Volt', 'Zap', 'Trov', 'Chisp', 'Ion', 'Eletr', 'Zumb', 'Tic', 'Watt'],
  gelo: ['Gel', 'Nev', 'Floc', 'Crist', 'Fri', 'Gead', 'Pingu', 'Glac', 'Brum', 'Inver'],
  terra: ['Barr', 'Ped', 'Roch', 'Are', 'Torr', 'Cascal', 'Lam', 'Argil', 'Mont', 'Tat'],
  ar: ['Vent', 'Bris', 'Sopr', 'Nuv', 'Plum', 'Cel', 'Assob', 'Pip', 'Ventar', 'Voad'],
  luz: ['Lum', 'Bril', 'Sol', 'Clar', 'Aur', 'Lux', 'Estel', 'Dour', 'Fulg', 'Raiz'],
  sombra: ['Sombr', 'Nox', 'Brev', 'Penumbr', 'Mist', 'Escur', 'Noct', 'Corv', 'Lun', 'Vult'],
  som: ['Ritm', 'Tamb', 'Not', 'Melod', 'Batuc', 'Ec', 'Sin', 'Toc', 'Cant', 'Pandeir'],
};
const MIDS = ['ar', 'im', 'ol', 'ub', 'in', 'el', 'ac', 'ut', 'an', 'ip'];
const SUFFIX: Record<string, string[]> = {
  base: ['inho', 'ito', 'elo', 'ete', 'uxo', 'ola', 'im', 'eco', 'ina', 'oca', 'ilo', 'ute', 'ico', 'ubi'],
  gordo: ['ão', 'udo', 'ucho', 'ola', 'oco', 'ana'],
  magro: ['ito', 'ilho', 'eta', 'ifo', 'iz'],
  longo: ['ongo', 'elo', 'ão', 'ura'],
};
function makeName(r: Rng, el: Element, el2: Element | null, shape: Shape): string {
  let stem = r.pick(STEMS[el]);
  if (el2 && r.chance(0.5)) stem = stem.slice(0, Math.max(2, Math.ceil(stem.length * 0.6))) + r.pick(STEMS[el2]).toLowerCase().slice(1);
  const mid = r.chance(0.3) ? r.pick(MIDS) : '';
  const pool = shape === 'gordo' ? SUFFIX.gordo : shape === 'magro' ? SUFFIX.magro : shape === 'longo' ? SUFFIX.longo : SUFFIX.base;
  let suf = r.chance(0.75) ? r.pick(pool) : r.pick(SUFFIX.base);
  // evita vogal dupla feia ("Bolhaar")
  if (mid && /[aeiou]$/i.test(stem) && /^[aeiou]/.test(mid)) stem = stem.slice(0, -1);
  if (!mid && /[aeiouã]$/i.test(stem) && /^[aeiouã]/.test(suf)) suf = suf.slice(1) || suf;
  return stem + mid + suf;
}

const clampH = (h: number) => ((h % 360) + 360) % 360;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function makePalette(r: Rng, el: Element, rarity: Rarity): Palette {
  const base = EL_HUE[el];
  const h = r.chance(0.72) ? clampH(base + r.range(-28, 28)) : r.range(0, 360);
  let s = r.range(58, 88);
  let l = r.range(58, 71);
  if (el === 'terra') (s = r.range(35, 60)), (l = r.range(46, 60));
  if (el === 'sombra') (s = r.range(30, 62)), (l = r.range(30, 44));
  if (el === 'ar') (s = r.range(35, 60)), (l = r.range(76, 85));
  if (el === 'gelo') (s = r.range(45, 78)), (l = r.range(74, 84));
  if (el === 'luz') (s = r.range(70, 95)), (l = r.range(70, 80));
  const scheme = r.weighted<Palette['scheme']>([['analoga', 4], ['complementar', 3], ['triade', 2], ['dividida', 2], ['mono', 2]]);
  const off = { analoga: r.chance(0.5) ? 34 : -34, complementar: 180, triade: 120, dividida: 150, mono: 0 }[scheme];
  const pat: Hsl = { h: clampH(h + off), s: clamp(s + r.range(-10, 10), 30, 95), l: scheme === 'mono' ? clamp(l - 20, 18, 60) : clamp(l + r.range(-12, 10), 30, 85) };
  if (el === 'sombra' && scheme !== 'mono') pat.l = clamp(pat.l + 18, 40, 80);
  const accOff = { analoga: off * 2, complementar: 150, triade: 240, dividida: 210, mono: 180 }[scheme];
  const acc: Hsl = { h: clampH(h + accOff + r.range(-12, 12)), s: 88, l: rarity >= 4 ? 60 : 62 };
  const eye: Hsl = r.chance(0.55) ? { h: 262, s: 45, l: 16 } : { h: clampH(r.pick([0, 30, 50, 120, 170, 200, 230, 280, 320]) + r.range(-8, 8)), s: 75, l: 42 };
  return { body: { h, s, l }, pat, acc, eye, scheme };
}

const STAT_W: Record<Shape, [number, number, number, number]> = {
  redondo: [1.1, 1, 1, 1],
  alto: [1, 1.1, 1, 1],
  gordo: [1.45, 0.95, 1.25, 0.6],
  magro: [0.8, 1.05, 0.75, 1.5],
  longo: [1, 1.25, 0.9, 1.05],
  blob: [1.25, 0.9, 1.05, 0.9],
  estrela: [0.9, 1.2, 0.8, 1.2],
  cubo: [1.1, 0.9, 1.4, 0.7],
  gota: [0.95, 1, 0.9, 1.25],
  pera: [1.2, 1, 1.1, 0.8],
};
const BUDGET = [100, 118, 138, 160, 186, 225];

function wsum(r: Rng, map: Partial<Record<string, number>>, all: readonly string[], baseW: number): string {
  return r.weighted(all.map((k) => [k, (map[k] ?? 0) + baseW] as const));
}

const cache = new Map<string, Genome>();

/** Gera o genoma (puro, com cache). `evo` 0..2 = estágio de evolução (mutações determinísticas). */
export function genome(seedOrHex: Seed64 | string, evo = 0): Genome {
  const s = typeof seedOrHex === 'string' ? parseSeed(seedOrHex) : seedOrHex;
  const hex = seedHex(s);
  const id = hex + '.' + evo;
  const hit = cache.get(id);
  if (hit) return hit;
  const r = new Rng(s, 1);
  const rarity = rarityOf(s);
  const R = rarity;
  const element = elementOf(s, r);
  const element2 = R >= 3 && r.chance(0.35 + R * 0.08) ? ELEMENTS[(ELEMENTS.indexOf(element) + 1 + r.int(9)) % 10] : null;
  const shape = wsum(r, SHAPE_W[element], SHAPES, 2) as Shape;
  const size = clamp(r.range(0.84, 1.12) + (shape === 'gordo' ? 0.06 : 0) + R * 0.025, 0.8, 1.3);
  const aspect = r.range(0.9, 1.1);
  const limbs = wsum(r, LIMB_W[shape], LIMBS, R >= 2 ? 0.5 : 0.15) as Limbs;
  const wing: WingStyle = element === 'sombra' ? 'morcego' : element === 'eletrico' || element === 'planta' ? r.pick(['inseto', 'pena'] as const) : r.weighted([['pena', 5], ['morcego', 1], ['inseto', 2]] as const);
  const topBias: Partial<Record<Top, number>> = {
    fogo: { chama: 4, chifres: 2 }, agua: { crista: 4, redondas: 1 }, planta: { broto: 5 }, eletrico: { antenas: 4, gato: 2 },
    gelo: { cristais: 4, coelho: 1 }, terra: { carneiro: 3, chifres: 2, redondas: 2 }, ar: { coelho: 3, caidas: 2 },
    luz: { unichifre: 3, cristais: 1 }, sombra: { gato: 3, chifres: 2 }, som: { antenas: 2, coelho: 2, caidas: 2 },
  }[element] as Partial<Record<Top, number>>;
  const top = wsum(r, { nenhum: 3, ...topBias }, TOPS, 1) as Top;
  const eyeN = r.weighted<1 | 2 | 3 | 4>([[1, 8], [2, 80 - R * 6], [3, 7 + R * 4], [4, 3 + R * 2]]);
  const eyes = { n: eyeN, shape: r.weighted<EyeShape>([['ponto', 4], ['grande', 6], ['brilho', 3 + R], ['feliz', 3], ['sono', 2], ['fenda', element === 'sombra' || element === 'fogo' ? 4 : 1.5], ['desenho', 3]]), size: r.range(0.85, 1.25) };
  const mouth = r.weighted<Mouth>([['sorriso', 6], ['aberta', 3], ['gato', 3], ['presa', 2], ['lingua', 2], ['oh', 2], ['dentes', 1.5], ['bico', element === 'ar' ? 4 : 1], ['presas', element === 'terra' ? 3 : 0.7], ['pontinho', 2]]);
  const tail = r.chance(0.42 + R * 0.06)
    ? r.weighted<Tail>([['enrolada', 3], ['fofa', 3], ['seta', element === 'sombra' || element === 'fogo' ? 4 : 1], ['folha', element === 'planta' ? 5 : 0.5], ['peixe', element === 'agua' ? 5 : 0.5], ['raio', element === 'eletrico' ? 5 : 0.4], ['aneis', 1.5]])
    : 'nenhuma';
  const pattern = r.weighted<Pattern>([
    ['nenhum', R === 0 ? 34 : 14],
    ['barriga', 22],
    ['pintas', 14],
    ['listras', 11],
    ['manchas', 9],
    ['degrade', R >= 1 ? 9 : 2],
    ['xadrez', R >= 1 ? 4 : 0.6],
    ['brilhos', R >= 2 ? 7 : 0.8],
    ['aneis', R >= 1 ? 4 : 0.6],
    ['galaxia', R >= 3 ? 10 : R === 2 ? 2.5 : element === 'sombra' || element === 'luz' ? 0.8 : 0.15],
  ]);
  let material: Material = r.weighted<Material>([
    ['liso', R === 0 ? 55 : 30],
    ['fofo', 32],
    ['nuvem', R >= 1 ? 6 : 3],
    ['gelatina', R >= 1 ? 7 : 3],
    ['cristal', R >= 2 ? 8 + R * 2 : 0.6],
    ['metal', R >= 2 ? 7 + R * 2 : 0.6],
    ['lava', R >= 3 ? 7 : element === 'fogo' ? 1 : 0.1],
    [MAT_EL[element], 8 + R * 4],
  ]);
  let accessory: Accessory = r.chance([0.12, 0.25, 0.45, 0.6, 0.85, 1][R]) ? (r.pick(ACCESSORIES.slice(1)) as Accessory) : 'nenhum';
  if (R === 4 && r.chance(0.4)) accessory = 'coroa';
  if (element === 'som' && accessory !== 'nenhum' && r.chance(0.4)) accessory = 'fones';
  let aura: Aura = r.chance([0, 0.06, 0.2, 0.7, 1, 1][R]) ? (r.chance(0.6) ? AURA_EL[element] : (r.pick(AURAS.slice(1, 7)) as Aura)) : 'nenhuma';
  const cheeks = r.weighted<Cheeks>([['rosa', 6], ['elemento', 2], ['nenhuma', 2]]);
  const pal = makePalette(r, element, rarity);
  if (rarity === 5) {
    material = 'prisma';
    aura = 'prisma';
  }
  const name0 = makeName(r, element, element2, shape);
  const detail = hashN(s.hi, s.lo, 'det');
  const signature = hashN(s.hi, s.lo, 'sig');

  // estatísticas
  const w = STAT_W[shape];
  const budget = BUDGET[R] * (0.92 + r.next() * 0.16) * size ** 0.3;
  const raw = w.map((x) => x * r.range(0.82, 1.18));
  const tot = raw.reduce((a, b) => a + b, 0);
  const st = raw.map((x) => Math.round((x / tot) * budget));
  let g: Genome = {
    id, seed: hex, evo: 0, rarity, element, element2, shape, size, aspect, limbs, wing, top, eyes, mouth, tail, pattern, material, accessory, aura, cheeks, pal,
    stats: { vig: st[0], forca: st[1], defesa: st[2], agil: st[3] },
    name: name0, family: shape + '-' + element, signature, detail,
  };
  for (let e = 1; e <= evo; e++) g = mutate(g, s, e);
  g.id = id;
  cache.set(id, g);
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return g;
}

/** Evolução = mutação determinística do genoma (maior, mais partes, padrão/aura mais ricos). */
function mutate(g0: Genome, s: Seed64, stage: number): Genome {
  const r = new Rng(s, 100 + stage);
  const g: Genome = { ...g0, eyes: { ...g0.eyes }, pal: { ...g0.pal, body: { ...g0.pal.body } }, stats: { ...g0.stats }, evo: stage };
  g.size = clamp(g.size * 1.1, 0.8, 1.42);
  const limbUp: Partial<Record<Limbs, Limbs>> = { nenhum: r.pick(['bracos', 'barbatanas', 'tentaculos'] as const), pes: r.pick(['bracos', 'pernas4'] as const), bracos: 'asas', pernas4: 'pernas6', barbatanas: 'asas' };
  if (r.chance(0.7)) g.limbs = limbUp[g.limbs] ?? g.limbs;
  const topUp: Partial<Record<Top, Top>> = { nenhum: r.pick(['gato', 'redondas', 'antenas', 'broto'] as const), gato: 'chifres', redondas: 'carneiro', caidas: 'coelho', coelho: 'unichifre', broto: 'chama', antenas: 'cristais', crista: 'cristais' };
  if (r.chance(0.7)) g.top = topUp[g.top] ?? g.top;
  if (g.pattern === 'nenhum' || g.pattern === 'barriga') g.pattern = r.pick(['pintas', 'listras', 'manchas', 'degrade'] as const);
  else if (stage === 2 && r.chance(0.5)) g.pattern = r.pick(['brilhos', 'galaxia', 'aneis'] as const);
  if (g.tail === 'nenhuma' && r.chance(0.6)) g.tail = r.pick(['enrolada', 'fofa', 'seta', 'aneis'] as const);
  if (stage === 2 && g.aura === 'nenhuma') g.aura = AURA_EL[g.element];
  if (stage === 2 && (g.material === 'liso' || g.material === 'fofo') && r.chance(0.6)) g.material = MAT_EL[g.element];
  g.pal.body.s = clamp(g.pal.body.s + 6, 30, 96);
  g.eyes.size = clamp(g.eyes.size * 0.96, 0.8, 1.3);
  const k = 1.18 + stage * 0.02;
  g.stats = { vig: Math.round(g.stats.vig * k), forca: Math.round(g.stats.forca * k), defesa: Math.round(g.stats.defesa * k), agil: Math.round(g.stats.agil * k) };
  const suf = stage === 1 ? r.pick(['ão', 'ardo', 'onte', 'eiro']) : r.pick(['amor', 'élio', 'oroso', 'issauro']);
  g.name = g0.name.replace(/[aeiouãí]+[a-zç]{0,3}$/i, '') + suf;
  return g;
}

export const statTotal = (st: Stats): number => st.vig + st.forca + st.defesa + st.agil;
/** stats no nível (1..40) */
export function statsAt(g: Genome, level: number): Stats {
  const k = 1 + (Math.max(1, level) - 1) * 0.06;
  return { vig: Math.round(g.stats.vig * k), forca: Math.round(g.stats.forca * k), defesa: Math.round(g.stats.defesa * k), agil: Math.round(g.stats.agil * k) };
}
export const powerOf = (g: Genome, level: number): number => Math.round(statTotal(statsAt(g, level)) * (1 + g.rarity * 0.05));

/** Número de série de um Único (4 hex da assinatura) */
export const uniqueSerial = (g: Genome): string => (g.signature >>> 16).toString(16).toUpperCase().padStart(4, '0');

/** Semente aleatória (não determinística) — para ovos de presente, folha de contato etc. */
export function randomSeed(): Seed64 {
  const a = new Uint32Array(2);
  (globalThis.crypto ?? { getRandomValues: (x: Uint32Array) => x.map(() => (Math.random() * 2 ** 32) >>> 0) }).getRandomValues(a);
  return { hi: a[0] >>> 0, lo: a[1] >>> 0 };
}

/**
 * Estimativa do número de variações VISUAIS distintas (dimensões discretas × contínuas quantizadas).
 * Usado no relatório/tela "sobre": é um limite inferior conservador.
 */
export function variationEstimate(): { dims: Record<string, number>; total: number } {
  const dims: Record<string, number> = {
    forma: SHAPES.length,
    tamanho: 8,
    proporcao: 5,
    membros: LIMBS.length + 2 /* estilos de asa */,
    topo: TOPS.length,
    olhosQtd: 4,
    olhosForma: EYE_SHAPES.length,
    olhosTam: 4,
    corOlho: 10,
    boca: MOUTHS.length,
    cauda: TAILS.length,
    padrao: PATTERNS.length,
    corCorpo: 36 * 4 * 4, // matiz em passos de 10° × saturação × luminosidade
    harmonia: 5,
    material: MATERIALS.length,
    adereco: ACCESSORIES.length,
    aura: AURAS.length,
    bochechas: CHEEKS.length,
    elemento: ELEMENTS.length,
    elemento2: ELEMENTS.length + 1,
    evolucao: 3,
  };
  let total = 1;
  for (const k in dims) total *= dims[k];
  return { dims, total };
}
