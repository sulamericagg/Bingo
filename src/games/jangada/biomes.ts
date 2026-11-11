/* ============================================================
 *  JANGADA BLOOP — mapa do mar (fixo pela semente): a jangada é a
 *  casa no meio; as ilhas ficam em anéis, como fases de RPG:
 *   - perto (perigo 1): tropicais (coqueiro, coco, madeira e pedra);
 *   - meio (perigo 2): selva, pedreira, mangue, neve e vulcão — frutas,
 *     árvores e minérios mais raros, cavernas;
 *   - longe (perigo 3–4): lendárias (melhor tesouro) e as ilhas dos
 *     chefes (Megalodonte e Polvo Gigante).
 *  Cada estilo de ilha tem "donos" (facção): uns amigos (trocas,
 *  pedidos), outros guardam os baús raros.
 *  Dados puros (sem three/DOM).
 * ============================================================ */
import { t } from '../../i18n';
import type { Bag, ItemId } from './data';

export type Biome = 'tropical' | 'jungle' | 'rocky' | 'mangrove' | 'snowy' | 'volcanic' | 'legend' | 'megaIsle' | 'krakenIsle';
export type Faction = 'crab' | 'monkey' | 'penguin' | 'lizard' | 'pirate' | 'none';
export type Rarity = 0 | 1 | 2 | 3;
export type TreeK = 'palm' | 'jungle' | 'mangrove' | 'pine' | 'dead' | 'crystal';

export interface BiomeDef {
  id: Biome;
  /** perigo/nível (1 perto … 4 chefe) */
  tier: number;
  icon: string;
  /** cores do chão: areia, grama, grama2, rocha */
  sand: string;
  grass: string;
  grass2: string;
  rock: string;
  /** cor do mar raso em volta */
  shallow: string;
  trees: TreeK[];
  /** fruta dos arbustos/árvores */
  fruit: ItemId;
  /** minério das pedras */
  ore: ItemId | null;
  /** material único */
  special: ItemId | null;
  owner: Faction;
  /** tem caverna */
  cave: boolean;
  /** neve/cinzas caindo, névoa */
  snow?: boolean;
  ash?: boolean;
  n: () => string;
}
const B = (d: BiomeDef) => d;
export const BIOMES: Record<Biome, BiomeDef> = {
  tropical: B({ id: 'tropical', tier: 1, icon: 'island', sand: '#ffe2a8', grass: '#6ad06a', grass2: '#4cb85a', rock: '#a8a6b8', shallow: '#2ee0d0', trees: ['palm'], fruit: 'berry', ore: null, special: null, owner: 'crab', cave: false, n: () => t('jangada.bi.tropical', 'Ilha Tropical') }),
  jungle: B({ id: 'jungle', tier: 2, icon: 'jungle', sand: '#f0d89a', grass: '#2fa24a', grass2: '#1f8a3e', rock: '#8a9a8a', shallow: '#22c8b0', trees: ['jungle', 'palm', 'jungle'], fruit: 'banana', ore: null, special: 'bamboo', owner: 'monkey', cave: true, n: () => t('jangada.bi.jungle', 'Selva dos Macacos') }),
  rocky: B({ id: 'rocky', tier: 2, icon: 'rocky', sand: '#e0d0b0', grass: '#8ab86a', grass2: '#7aa05a', rock: '#8a8698', shallow: '#38c0d0', trees: ['pine', 'palm'], fruit: 'mango', ore: 'iron', special: 'iron', owner: 'monkey', cave: true, n: () => t('jangada.bi.rocky', 'Ilha Pedreira') }),
  mangrove: B({ id: 'mangrove', tier: 2, icon: 'mangrove', sand: '#c8b080', grass: '#5a9a4a', grass2: '#4a8a4a', rock: '#7a7a6a', shallow: '#4ab0a0', trees: ['mangrove', 'mangrove', 'palm'], fruit: 'caju', ore: null, special: 'hardwood', owner: 'crab', cave: false, n: () => t('jangada.bi.mangrove', 'Mangue dos Caranguejos') }),
  snowy: B({ id: 'snowy', tier: 2, icon: 'snowy', sand: '#e8eef4', grass: '#f4f8ff', grass2: '#dce8f4', rock: '#9aa8c0', shallow: '#4ad0e8', trees: ['pine'], fruit: 'snowberry', ore: 'ice', special: 'ice', owner: 'penguin', cave: true, snow: true, n: () => t('jangada.bi.snowy', 'Ilha Nevada dos Pinguins') }),
  volcanic: B({ id: 'volcanic', tier: 2, icon: 'volcano', sand: '#5a4a4a', grass: '#4a3a3a', grass2: '#6a3a2a', rock: '#3a3040', shallow: '#3aa0b0', trees: ['dead', 'palm'], fruit: 'pepper', ore: 'obsidian', special: 'obsidian', owner: 'lizard', cave: true, ash: true, n: () => t('jangada.bi.volcanic', 'Vulcão dos Lagartos de Fogo') }),
  legend: B({ id: 'legend', tier: 3, icon: 'legend', sand: '#fff0c0', grass: '#7ae8c8', grass2: '#5ad0e8', rock: '#c8b8f0', shallow: '#3af0e0', trees: ['crystal', 'palm'], fruit: 'starfruit', ore: 'gold', special: 'pearl', owner: 'pirate', cave: true, n: () => t('jangada.bi.legend', 'Ilha Lendária dos Piratas Fantasmas') }),
  megaIsle: B({ id: 'megaIsle', tier: 4, icon: 'mega', sand: '#e8dcc0', grass: '#6ab06a', grass2: '#5a9a5a', rock: '#7a8090', shallow: '#20b0c0', trees: ['palm', 'dead'], fruit: 'coco', ore: 'gold', special: 'pearl', owner: 'none', cave: false, n: () => t('jangada.bi.mega', 'Recife do Megalodonte') }),
  krakenIsle: B({ id: 'krakenIsle', tier: 4, icon: 'kraken', sand: '#d8c8e0', grass: '#7a6ab0', grass2: '#6a5aa0', rock: '#5a5070', shallow: '#3a90c0', trees: ['crystal', 'dead'], fruit: 'starfruit', ore: 'gold', special: 'pearl', owner: 'none', cave: false, n: () => t('jangada.bi.kraken', 'Abismo do Polvo Gigante') }),
};

export interface FactionDef {
  id: Faction;
  friendly: boolean;
  icon: string;
  n: () => string;
  /** nome do chefe (amigos) */
  boss: () => string;
}
export const FACTIONS: Record<Exclude<Faction, 'none'>, FactionDef> = {
  crab: { id: 'crab', friendly: true, icon: 'crab', n: () => t('jangada.f.crab', 'Reino dos Caranguejos'), boss: () => t('jangada.f.crabK', 'Rei Caranguejo') },
  penguin: { id: 'penguin', friendly: true, icon: 'penguin', n: () => t('jangada.f.penguin', 'Colônia dos Pinguins'), boss: () => t('jangada.f.penguinK', 'Chefe Pinguim') },
  monkey: { id: 'monkey', friendly: false, icon: 'monkey', n: () => t('jangada.f.monkey', 'Tribo dos Macacos'), boss: () => t('jangada.f.monkey', 'Tribo dos Macacos') },
  lizard: { id: 'lizard', friendly: false, icon: 'lizard', n: () => t('jangada.f.lizard', 'Lagartos de Fogo'), boss: () => t('jangada.f.lizard', 'Lagartos de Fogo') },
  pirate: { id: 'pirate', friendly: false, icon: 'ghost', n: () => t('jangada.f.pirate', 'Piratas Fantasmas'), boss: () => t('jangada.f.pirate', 'Piratas Fantasmas') },
};

/* ------------------------------ trocas (donos amigos) ------------------------------ */
export interface Trade {
  give: Bag;
  get: Bag;
  /** moedas de recompensa */
  coins?: number;
  /** pedido (uma vez só): revela ilhas no mapa */
  quest?: 'mid' | 'far';
  say?: () => string;
}
export const TRADES: Partial<Record<Faction, Trade[]>> = {
  crab: [
    { give: { shell: 5 }, get: { hardwood: 4, rope: 4 }, quest: 'mid', coins: 20, say: () => t('jangada.q.crab', 'Traga 5 conchas e eu conto onde ficam as ilhas do meio!') },
    { give: { coco: 3 }, get: { rope: 4 } },
    { give: { fish: 2 }, get: { scrap: 3 } },
    { give: { wood: 6 }, get: { fuel: 1 } },
    { give: { shell: 3 }, get: { pearl: 1 } },
    { give: { seaweed: 4 }, get: { bamboo: 2 } },
  ],
  penguin: [
    { give: { bigfishc: 2 }, get: { iron: 3, fuel: 2 }, quest: 'far', coins: 40, say: () => t('jangada.q.penguin', 'Traga 2 peixões assados e eu mostro as ilhas lendárias!') },
    { give: { fish: 3 }, get: { ice: 2 } },
    { give: { bigfish: 1 }, get: { fuel: 2 } },
    { give: { pearl: 1 }, get: {}, coins: 25 },
    { give: { gold: 1 }, get: { iron: 2, hardwood: 2 } },
  ],
};

/* ------------------------------ baús por raridade ------------------------------ */
export const RARITY_COL = ['#c08850', '#5ab0ff', '#b46aff', '#ffcf2e'];
export const rarityName = (r: Rarity) => [t('jangada.r.0', 'Comum'), t('jangada.r.1', 'Raro'), t('jangada.r.2', 'Épico'), t('jangada.r.3', 'Lendário')][r];
export function chestLoot(r: Rarity, biome: Biome, rnd: () => number): { bag: Bag; coins: number } {
  const B = BIOMES[biome];
  const bag: Bag = {};
  const add = (id: ItemId | null, a: number, b: number) => {
    if (!id) return;
    bag[id] = (bag[id] ?? 0) + a + Math.floor(rnd() * (b - a + 1));
  };
  const pick = <T>(l: T[]) => l[Math.floor(rnd() * l.length)];
  switch (r) {
    case 0:
      add(pick<ItemId>(['wood', 'plastic', 'rope', 'leaf']), 3, 5);
      add(pick<ItemId>(['scrap', 'seed', 'rope']), 1, 3);
      add(B.fruit, 1, 2);
      return { bag, coins: 5 };
    case 1:
      add('scrap', 2, 4);
      add(pick<ItemId>(['iron', 'hardwood', 'bamboo', 'fuel']), 2, 3);
      add(B.special, 1, 2);
      add('water', 1, 2);
      return { bag, coins: 15 };
    case 2:
      add(pick<ItemId>(['iron', 'obsidian', 'ice']), 2, 3);
      add('gold', 1, 2);
      add('pearl', 0, 1);
      add('fuel', 2, 3);
      add(B.special, 2, 3);
      return { bag, coins: 35 };
    default:
      add('gold', 3, 5);
      add('pearl', 2, 3);
      add('starfruit', 1, 2);
      add(pick<ItemId>(['obsidian', 'iron']), 3, 4);
      add('fuel', 3, 4);
      return { bag, coins: 80 };
  }
}

/* ------------------------------ mapa ------------------------------ */
export interface IsleSpec {
  /** índice estável (salvamento/rede) */
  id: number;
  biome: Biome;
  x: number;
  z: number;
  /** raio da praia */
  r: number;
  seed: number;
}
function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let q = Math.imul(a ^ (a >>> 15), 1 | a);
    q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q;
    return ((q ^ (q >>> 14)) >>> 0) / 4294967296;
  };
}
export { mulberry };
/** distâncias dos anéis (m) */
export const RING = { near: [85, 140], mid: [230, 360], far: [540, 690] } as const;
/** gera o mar da partida (determinístico pela semente) */
export function worldMap(seed: number): IsleSpec[] {
  const r = mulberry(seed * 7919 + 3);
  const out: IsleSpec[] = [];
  const put = (biome: Biome, ring: readonly [number, number], a: number, rr: [number, number]) => {
    for (let tries = 0; tries < 40; tries++) {
      const ang = a + (r() - 0.5) * 0.5 + tries * 0.37;
      const d = ring[0] + r() * (ring[1] - ring[0]);
      const x = Math.cos(ang) * d;
      const z = Math.sin(ang) * d;
      const rad = rr[0] + r() * (rr[1] - rr[0]);
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + rad + 70)) continue;
      out.push({ id: out.length, biome, x: Math.round(x), z: Math.round(z), r: Math.round(rad * 10) / 10, seed: Math.floor(r() * 1e6) });
      return;
    }
  };
  const a0 = r() * Math.PI * 2;
  // perto: 4 tropicais (uma é do Rei Caranguejo)
  for (let i = 0; i < 4; i++) put('tropical', RING.near, a0 + (i / 4) * Math.PI * 2, [9, 13]);
  const mids: Biome[] = ['jungle', 'rocky', 'mangrove', 'snowy', 'volcanic'];
  const a1 = r() * Math.PI * 2;
  mids.forEach((b, i) => put(b, RING.mid, a1 + (i / mids.length) * Math.PI * 2, [13, 18]));
  const fars: Biome[] = ['legend', 'megaIsle', 'krakenIsle'];
  const a2 = r() * Math.PI * 2;
  fars.forEach((b, i) => put(b, RING.far, a2 + (i / fars.length) * Math.PI * 2, [15, 20]));
  return out;
}
/** zona do mar pela distância da jangada: 1 perto, 2 meio, 3 longe */
export function zoneAt(x: number, z: number): number {
  const d = Math.hypot(x, z);
  return d < 190 ? 1 : d < 470 ? 2 : 3;
}
export const isleName = (s: IsleSpec) => BIOMES[s.biome].n();
