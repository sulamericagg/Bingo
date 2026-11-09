/* ============================================================
 *  PASSE DA CASA — gerador determinístico das 60 temporadas.
 *  Mesmo calendário/temas de creatures/seasons.ts. 50 níveis, trilha grátis +
 *  premium, recompensas EXCLUSIVAS (nunca vendidas) para a casa/planeta.
 *
 *  Cartelas de 10 níveis, cada uma com um DESTAQUE no último espaço:
 *   10 = tinta animada · 20 = kit de cômodo completo · 30 = enfeite de planeta animado
 *   40 = kit de festa (bolo temático + comida de guerrinha com respingo especial)
 *   50 = PEÇA-MESTRA da temporada (sala completa / estátua animada / aquário gigante...).
 *  Premium nível 1 = um móvel temático lindo (o primeiro presente de quem compra).
 *
 *  Formato compatível com o catálogo da casa (src/home/catalog.ts, agente "casa"):
 *  ver adapter.ts (toFurnDef / toSurface / toExteriorOption) e docs/PASSE.md.
 * ============================================================ */
import { SEASONS, seasonTheme, type SeasonInfo } from '../../creatures/seasons';
import { t } from '../../i18n';
import { MOTIFS, motifName, rng, type PassLevel, type PassRarity, type Reward } from '../catalog';

export type HomeCat =
  | 'furniture'
  | 'paint'
  | 'wallpaper'
  | 'floor'
  | 'rug'
  | 'lamp'
  | 'wallart'
  | 'planet'
  | 'door'
  | 'roof'
  | 'window'
  | 'fence'
  | 'garden'
  | 'roomkit'
  | 'party'
  | 'cleaning'
  | 'showpiece';

export type Finish = 'gloss' | 'glitter' | 'gradient' | 'pattern' | 'animated';

/** Móveis base (mesmos `kind` do catálogo da casa) usados pelos itens do passe. */
export const FURN_BASE: Record<string, { w: number; h: number; wall?: boolean; flat?: boolean; pt: string }> = {
  sofa: { w: 120, h: 62, pt: 'Sofá' },
  armchair: { w: 62, h: 64, pt: 'Poltrona' },
  bed: { w: 130, h: 70, pt: 'Cama' },
  table: { w: 96, h: 52, pt: 'Mesa' },
  chair: { w: 40, h: 62, pt: 'Cadeira' },
  bookcase: { w: 74, h: 120, pt: 'Estante' },
  wardrobe: { w: 84, h: 130, pt: 'Guarda-roupa' },
  piano: { w: 100, h: 84, pt: 'Piano' },
  fireplace: { w: 100, h: 96, pt: 'Lareira' },
  desk: { w: 96, h: 66, pt: 'Escrivaninha' },
  beanbag: { w: 58, h: 44, pt: 'Pufe' },
  toybox: { w: 60, h: 46, pt: 'Baú' },
  arcade: { w: 54, h: 104, pt: 'Fliperama' },
  plant: { w: 44, h: 70, pt: 'Vaso' },
  floorlamp: { w: 34, h: 110, pt: 'Abajur' },
  tablelamp: { w: 28, h: 40, pt: 'Luminária' },
  rug: { w: 150, h: 44, flat: true, pt: 'Tapete' },
  painting: { w: 70, h: 52, wall: true, pt: 'Quadro' },
  poster: { w: 54, h: 70, wall: true, pt: 'Pôster' },
  clock: { w: 40, h: 40, wall: true, pt: 'Relógio' },
  mirror: { w: 46, h: 64, wall: true, pt: 'Espelho' },
  aquarium: { w: 86, h: 76, pt: 'Aquário' },
  partytable: { w: 120, h: 60, pt: 'Mesa de festa' },
  discoball: { w: 40, h: 60, wall: true, pt: 'Globo de luz' },
};
const FURN_ROT = ['sofa', 'armchair', 'bed', 'table', 'chair', 'bookcase', 'wardrobe', 'piano', 'fireplace', 'desk', 'beanbag', 'toybox', 'arcade', 'plant'];
const LAMP_ROT = ['floorlamp', 'tablelamp'];
const ART_ROT = ['painting', 'poster', 'clock', 'mirror'];

export interface HomePassItem {
  id: string; // 'h<SS>_<cat>_<n>' — único para sempre
  season: number;
  cat: HomeCat;
  name: string;
  rarity: PassRarity;
  /** parâmetros do desenho procedural (paleta da temporada + motivo + acabamento) */
  draw: { palette: [string, string, string]; motif: number; finish: Finish; anim: boolean; seed: number };
  /** móvel (cat furniture/lamp/rug/wallart): kind/variante do catálogo da casa */
  furn?: { kind: string; v: number; w: number; h: number; wall?: boolean; flat?: boolean };
  /** piso/parede: estilo base do catálogo (FLOORS/WALLS) */
  surface?: { type: 'floor' | 'wall'; base: string };
  /** exterior/planeta: campo do design + opção base usada no desenho */
  ext?: { section: 'planet' | 'exterior'; field: string; base: number };
  /** kit de cômodo: cômodo + ids de itens do kit */
  kit?: { room: 'living' | 'kitchen' | 'bedroom' | 'bath' | 'party'; items: string[] };
  /** festa: comida temática + cor do respingo (guerrinha de comida, só sujeira divertida) */
  party?: { food: 'cake' | 'pie' | 'frosting' | 'juice' | 'confetti'; splat: string };
  /** pele de ferramenta de limpeza */
  tool?: 'broom' | 'mop' | 'sponge' | 'vacuum';
  /** peça-mestra */
  show?: 'roomset' | 'statue' | 'aquarium' | 'fountain' | 'tree' | 'carousel';
}

const NN = (i: number) => String(i).padStart(2, '0');

type Slot = HomeCat | 'gems' | 'coins';
/** 9 espaços por cartela (o 10º é o destaque). Distribuídos para variar. */
const PAGES: Slot[][] = [
  ['paint', 'wallpaper', 'lamp', 'gems', 'rug', 'wallart', 'floor', 'garden'], // + móvel fixo no nível 1
  ['furniture', 'paint', 'wallpaper', 'gems', 'door', 'cleaning', 'furniture', 'lamp', 'planet'],
  ['furniture', 'floor', 'wallart', 'gems', 'roof', 'party', 'furniture', 'rug', 'garden'],
  ['furniture', 'paint', 'wallpaper', 'gems', 'window', 'cleaning', 'furniture', 'lamp', 'coins'],
  ['furniture', 'floor', 'wallart', 'gems', 'fence', 'party', 'furniture', 'planet', 'gems'],
];
const HIGHLIGHT: HomeCat[] = ['paint', 'roomkit', 'planet', 'party', 'showpiece'];

const FINISHES: Finish[] = ['glitter', 'gradient', 'pattern', 'gloss'];
const SHOWS: NonNullable<HomePassItem['show']>[] = ['roomset', 'statue', 'aquarium', 'fountain', 'tree', 'carousel'];
const ROOMS: NonNullable<HomePassItem['kit']>['room'][] = ['kitchen', 'bedroom', 'living', 'bath', 'party'];
const TOOLS: NonNullable<HomePassItem['tool']>[] = ['broom', 'mop', 'sponge', 'vacuum'];
const FLOOR_BASE = ['wood', 'tile', 'carpet', 'checker', 'stone', 'stars', 'hex', 'marble', 'candy'];
const WALL_BASE = ['stripes', 'dots', 'stars', 'hearts', 'waves', 'tile', 'check', 'clouds', 'space'];
const PLANET_FIELDS = ['d0', 'd1', 'd2', 'd3'];
const EXT: Record<string, { field: string; opts: number }> = {
  door: { field: 'door', opts: 8 },
  roof: { field: 'roof', opts: 8 },
  window: { field: 'win', opts: 6 },
  fence: { field: 'fence', opts: 6 },
  garden: { field: 'garden', opts: 6 },
};

const roomLabel = (r: string) =>
  r === 'kitchen' ? t('hpass.room.kitchen', 'Cozinha') : r === 'bedroom' ? t('hpass.room.bedroom', 'Quarto') : r === 'bath' ? t('hpass.room.bath', 'Banheiro') : r === 'party' ? t('hpass.room.party', 'Salão de Festa') : t('hpass.room.living', 'Sala');

function baseName(it: HomePassItem, motif: string, theme: string, n: number): string {
  switch (it.cat) {
    case 'furniture':
    case 'lamp':
    case 'wallart':
      return t('hpass.n.furn', '{b} de {m}', { b: t('home.furn.' + it.furn!.kind, FURN_BASE[it.furn!.kind].pt), m: motif });
    case 'rug':
      return t('hpass.n.rug', 'Tapete de {m}', { m: motif });
    case 'paint':
      return it.draw.finish === 'animated'
        ? t('hpass.n.paintAnim', 'Tinta Viva {th}', { th: theme })
        : [t('hpass.n.paintGlitter', 'Tinta Purpurina de {m}', { m: motif }), t('hpass.n.paintGrad', 'Tinta Degradê de {m}', { m: motif }), t('hpass.n.paintPat', 'Tinta Estampada de {m}', { m: motif }), t('hpass.n.paintGloss', 'Tinta Brilhante de {m}', { m: motif })][FINISHES.indexOf(it.draw.finish)];
    case 'wallpaper':
      return t('hpass.n.wall', 'Papel de Parede {m}', { m: motif });
    case 'floor':
      return t('hpass.n.floor', 'Piso de {m}', { m: motif });
    case 'planet':
      return it.draw.anim ? t('hpass.n.planetAnim', 'Monumento {th}', { th: theme }) : t('hpass.n.planet', 'Enfeite de Planeta: {m}', { m: motif });
    case 'door':
      return t('hpass.n.door', 'Porta de {m}', { m: motif });
    case 'roof':
      return t('hpass.n.roof', 'Telhado de {m}', { m: motif });
    case 'window':
      return t('hpass.n.window', 'Janela de {m}', { m: motif });
    case 'fence':
      return t('hpass.n.fence', 'Cerca de {m}', { m: motif });
    case 'garden':
      return n === 0 ? t('hpass.n.garden', 'Jardim de {m}', { m: motif }) : t('hpass.n.garden2', 'Canteiro de {m}', { m: motif });
    case 'roomkit':
      return t('hpass.n.kit', 'Kit {r} {th}', { r: roomLabel(it.kit!.room), th: theme });
    case 'party':
      return it.party!.food === 'cake' ? t('hpass.n.cake', 'Bolo de {m}', { m: motif }) : t('hpass.n.food', 'Torta Melequenta de {m}', { m: motif });
    case 'cleaning':
      return [t('hpass.n.broom', 'Vassoura de {m}', { m: motif }), t('hpass.n.mop', 'Esfregão de {m}', { m: motif }), t('hpass.n.sponge', 'Esponja de {m}', { m: motif }), t('hpass.n.vacuum', 'Aspirador de {m}', { m: motif })][TOOLS.indexOf(it.tool!)];
    case 'showpiece':
      return [
        t('hpass.n.show0', 'Sala Completa {th}', { th: theme }),
        t('hpass.n.show1', 'Estátua Animada de {m}', { m: motif }),
        t('hpass.n.show2', 'Aquário Gigante {th}', { th: theme }),
        t('hpass.n.show3', 'Fonte Mágica de {m}', { m: motif }),
        t('hpass.n.show4', 'Árvore Gigante de {m}', { m: motif }),
        t('hpass.n.show5', 'Carrossel de {m}', { m: motif }),
      ][SHOWS.indexOf(it.show!)];
  }
}

export interface HomePassSeason {
  info: SeasonInfo;
  levels: PassLevel[];
  items: Map<string, HomePassItem>;
}

const ALL = new Map<string, HomePassItem>();
let built: HomePassSeason[] | null = null;

function rar(cat: HomeCat, n: number): PassRarity {
  if (cat === 'showpiece') return 'legendary';
  if (cat === 'roomkit' || cat === 'party') return 'epic';
  if (cat === 'furniture') return (['rare', 'rare', 'epic', 'epic', 'legendary', 'epic', 'rare', 'epic'] as PassRarity[])[n % 8];
  if (cat === 'cleaning' || cat === 'garden' || cat === 'fence') return 'medio';
  return n % 3 === 2 ? 'epic' : 'rare';
}

function buildAll(): HomePassSeason[] {
  if (built) return built;
  const usedNames = new Set<string>();
  const furnCursor = { f: 0 };
  built = SEASONS.map((info) => {
    const s = NN(info.index);
    const motifs = MOTIFS[info.index] ?? MOTIFS[0];
    const theme = seasonTheme(info);
    const r = rng(0x40e5 + info.index * 104729);
    const counters: Partial<Record<Slot, number>> = {};
    const items = new Map<string, HomePassItem>();
    const levels: PassLevel[] = [];
    const make = (cat: HomeCat, level: number, highlight: boolean): HomePassItem => {
      const n = counters[cat] ?? 0;
      counters[cat] = n + 1;
      const motifIdx = (n + Math.floor(n / 4) + (level > 40 ? 1 : 0)) % motifs.length;
      const it: HomePassItem = {
        id: `h${s}_${cat}_${n + 1}`,
        season: info.index,
        cat,
        name: '',
        rarity: highlight ? (cat === 'showpiece' ? 'legendary' : 'epic') : rar(cat, n),
        draw: { palette: info.palette, motif: motifIdx, finish: FINISHES[(info.index + n) % FINISHES.length], anim: highlight, seed: Math.floor(r() * 1e9) },
      };
      switch (cat) {
        case 'furniture': {
          // gira por todos os tipos ao longo das temporadas (combinação tipo×tema nunca repete)
          const kind = FURN_ROT[furnCursor.f++ % FURN_ROT.length];
          const b = FURN_BASE[kind];
          it.furn = { kind, v: (info.index + n) % 3, w: b.w, h: b.h };
          break;
        }
        case 'lamp': {
          const kind = LAMP_ROT[(info.index + n) % 2];
          it.furn = { kind, v: n % 3, w: FURN_BASE[kind].w, h: FURN_BASE[kind].h };
          break;
        }
        case 'wallart': {
          const kind = ART_ROT[(info.index + n) % ART_ROT.length];
          it.furn = { kind, v: n % 3, w: FURN_BASE[kind].w, h: FURN_BASE[kind].h, wall: true };
          break;
        }
        case 'rug':
          it.furn = { kind: 'rug', v: n % 3, w: 150, h: 44, flat: true };
          break;
        case 'paint':
          if (highlight) it.draw.finish = 'animated';
          break;
        case 'wallpaper':
          it.surface = { type: 'wall', base: WALL_BASE[(info.index + n * 4) % WALL_BASE.length] };
          break;
        case 'floor':
          it.surface = { type: 'floor', base: FLOOR_BASE[(info.index + n * 4) % FLOOR_BASE.length] };
          break;
        case 'planet':
          it.ext = { section: 'planet', field: PLANET_FIELDS[n % 4], base: 5 + ((info.index + n) % 9) };
          break;
        case 'door':
        case 'roof':
        case 'window':
        case 'fence':
        case 'garden': {
          const e = EXT[cat];
          it.ext = { section: 'exterior', field: e.field, base: (info.index + n) % e.opts };
          break;
        }
        case 'roomkit':
          it.kit = { room: ROOMS[info.index % ROOMS.length], items: [] };
          break;
        case 'party':
          it.party = { food: highlight || n % 2 === 0 ? 'cake' : 'pie', splat: info.palette[1 + (n % 2)] };
          break;
        case 'cleaning':
          it.tool = TOOLS[(info.index * 2 + n) % TOOLS.length];
          break;
        case 'showpiece':
          it.show = SHOWS[info.index % SHOWS.length];
          break;
      }
      let name = baseName(it, motifName(motifs[motifIdx]), theme, n);
      if (usedNames.has(name)) name = `${name} · ${theme}`;
      if (usedNames.has(name)) name = `${name} ${n + 2}`;
      usedNames.add(name);
      it.name = name;
      items.set(it.id, it);
      ALL.set(it.id, it);
      return it;
    };
    const asReward = (it: HomePassItem): Reward => ({ kind: 'home', id: it.id, amount: 0, name: it.name, rarity: it.rarity });
    for (let p = 0; p < 5; p++) {
      const slots = [...PAGES[p]];
      for (let i = slots.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [slots[i], slots[j]] = [slots[j], slots[i]];
      }
      const order: Slot[] = p === 0 ? ['furniture', ...slots] : slots;
      for (let k = 0; k < 10; k++) {
        const level = p * 10 + k + 1;
        let prem: Reward;
        if (k === 9) prem = asReward(make(HIGHLIGHT[p], level, true));
        else {
          const sl = order[k];
          if (sl === 'gems') prem = { kind: 'gems', id: '', amount: 100, name: t('pass.n.gems', '{n} Gemas', { n: 100 }), rarity: 'rare' };
          else if (sl === 'coins') prem = { kind: 'coins', id: '', amount: 600 + level * 20, name: t('pass.n.coins', '{n} Moedas', { n: 600 + level * 20 }), rarity: 'common' };
          else prem = asReward(make(sl, level, false));
        }
        levels.push({ level, free: null, prem });
      }
    }
    // kit de cômodo: inclui os móveis da temporada
    for (const it of items.values()) if (it.kit) it.kit.items = [...items.values()].filter((x) => x.cat === 'furniture' || x.cat === 'lamp').slice(0, 4).map((x) => x.id);
    // trilha grátis
    for (const L of levels) {
      const lv = L.level;
      let f: Reward | null = null;
      if (lv === 1) f = asReward(make('paint', lv, false)); // tinta para TODO mundo
      else if (lv === 15) f = asReward(make('garden', lv, false));
      else if (lv === 25) f = asReward(make('cleaning', lv, false));
      else if (lv === 35) f = asReward(make('wallpaper', lv, false));
      else if (lv % 10 === 0) f = { kind: 'gems', id: '', amount: 15, name: t('pass.n.gems', '{n} Gemas', { n: 15 }), rarity: 'rare' };
      else if (lv % 2 === 0) f = { kind: 'coins', id: '', amount: 120 + lv * 8, name: t('pass.n.coins', '{n} Moedas', { n: 120 + lv * 8 }), rarity: 'common' };
      L.free = f;
    }
    return { info, levels, items };
  });
  return built;
}

export function homePassSeason(index: number): HomePassSeason {
  const all = buildAll();
  return all[Math.max(0, Math.min(all.length - 1, index))];
}

/** Todos os itens de todas as temporadas (para o construtor da casa). */
export function allHomePassItems(): HomePassItem[] {
  buildAll();
  return [...ALL.values()];
}

export function homeItem(id: string): HomePassItem | undefined {
  buildAll();
  return ALL.get(id);
}
