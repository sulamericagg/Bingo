/* ============================================================
 *  FÁBRICA ESTELAR — catálogo de peças da fábrica (dados puros).
 *  Coordenadas em "tiles" locais do lote (0..PLOT_W, 0..PLOT_H).
 * ============================================================ */
import { t } from '../../i18n';

export const PLOT_W = 8;
export const PLOT_H = 10;
export const TILE = 32; // unidades de mundo por tile
export const MATCH_SECONDS = 270;

export type ItemKind = 'belt' | 'dropper' | 'upgrader' | 'helper' | 'deco' | 'turbo';

export interface ItemDef {
  id: string;
  kind: ItemKind;
  /** linha de produção (0,1,2) para belt/dropper/upgrader */
  line: number;
  x: number;
  y: number;
  cost: number;
  req: string[];
  /** variante (ex.: helper 0 = coletor, 1 = turbinador; deco 0 = jardim, 1 = fonte) */
  v: number;
}

/** Linhas de esteira: linha y de cada esteira e valor base da estrela. */
export const LINE_ROW = [3, 5, 7];
export const LINE_VALUE = [2, 10, 50];
export const LINE_COLORS = ['#3ee07a', '#3fb8ff', '#c45cff'];
export const BELT_X0 = 1;
export const BELT_X1 = 6; // o coletor fica no tile 6
export const COFRE = { x: 6.5, y: 9.1 };
export const SPAWN = { x: 2.5, y: 9.2 };
export const DROP_PERIOD = 1.6;
export const BELT_SPEED = 1.7; // tiles/s
export const UPG_MULT = 2;

const L: ItemDef[] = [];
const add = (id: string, kind: ItemKind, line: number, x: number, y: number, cost: number, req: string[], v = 0) =>
  L.push({ id, kind, line, x, y, cost, req, v });

// Linha A (já começa com a esteira)
add('bA', 'belt', 0, BELT_X0, LINE_ROW[0], 0, []);
add('dA1', 'dropper', 0, 1, 2, 0, ['bA']);
add('dA2', 'dropper', 0, 2, 2, 15, ['dA1']);
add('uA1', 'upgrader', 0, 4, 3, 30, ['dA1']);
add('dA3', 'dropper', 0, 3, 2, 45, ['dA2']);
add('h1', 'helper', -1, 1, 8, 70, ['dA2'], 0);
add('uA2', 'upgrader', 0, 5, 3, 90, ['uA1']);
// Linha B
add('bB', 'belt', 1, BELT_X0, LINE_ROW[1], 160, ['dA3']);
add('dB1', 'dropper', 1, 1, 4, 120, ['bB']);
add('dB2', 'dropper', 1, 2, 4, 240, ['dB1']);
add('uB1', 'upgrader', 1, 4, 5, 320, ['dB1']);
add('dB3', 'dropper', 1, 3, 4, 480, ['dB2']);
add('d1', 'deco', -1, 0, 0, 600, ['bB'], 0);
add('uB2', 'upgrader', 1, 5, 5, 800, ['uB1']);
add('h2', 'helper', -1, 0, 9, 1000, ['dB2'], 1);
// Linha C
add('bC', 'belt', 2, BELT_X0, LINE_ROW[2], 1600, ['dB3']);
add('dC1', 'dropper', 2, 1, 6, 1200, ['bC']);
add('dC2', 'dropper', 2, 2, 6, 2000, ['dC1']);
add('uC1', 'upgrader', 2, 4, 7, 2600, ['dC1']);
add('dC3', 'dropper', 2, 3, 6, 3600, ['dC2']);
add('d2', 'deco', -1, 7, 0, 4000, ['bC'], 1);
add('uC2', 'upgrader', 2, 5, 7, 5200, ['uC1']);
// Gran finale: o foguete TURBO (precisa de todo o resto)
add('turbo', 'turbo', -1, 3, 0, 15000, []);

export const ITEMS: readonly ItemDef[] = L;
ITEMS[ITEMS.length - 1].req = ITEMS.filter((i) => i.id !== 'turbo').map((i) => i.id);
export const ITEM_INDEX: Record<string, number> = {};
ITEMS.forEach((it, i) => (ITEM_INDEX[it.id] = i));
export const TURBO_INDEX = ITEM_INDEX.turbo;

export function itemName(it: ItemDef): string {
  switch (it.kind) {
    case 'belt':
      return t('tycoon.item.belt', 'Esteira nova');
    case 'dropper':
      return t('tycoon.item.dropper', 'Extrator de estrelas');
    case 'upgrader':
      return t('tycoon.item.upgrader', 'Polidor x2');
    case 'helper':
      return it.v === 0 ? t('tycoon.item.helper0', 'Ajudante coletor') : t('tycoon.item.helper1', 'Ajudante turbinador');
    case 'deco':
      return it.v === 0 ? t('tycoon.item.deco0', 'Jardim feliz (+10%)') : t('tycoon.item.deco1', 'Fonte cintilante (+10%)');
    case 'turbo':
      return t('tycoon.item.turbo', 'Foguete TURBO');
  }
}

/** Nomes de bots (originais, fofos). */
export const BOT_NAMES = ['Pipoca', 'Nino', 'Lulu', 'Tico', 'Bibi', 'Zuzu', 'Melzinha', 'Dudu', 'Juju', 'Kiko', 'Nana', 'Popó', 'Fofura', 'Bolinha', 'Pingo', 'Tuca'];

/** Cores das plaquinhas/bandeiras dos lotes. */
export const PLOT_COLORS = ['#3ee07a', '#ff9a2e', '#3fb8ff', '#ff5cc8'];

/** Prêmio em moedas por colocação (1º..4º). */
export const PLACE_COINS = [150, 100, 70, 50];
export const TURBO_BONUS = 60;

/* -------------------- Minha Fábrica (ociosa) -------------------- */

export const IDLE_CAP_H = 8;
export const IDLE_MAX_LVL = 8;
export type IdleUpg = 'drill' | 'polish' | 'belt';
export const IDLE_UPGS: IdleUpg[] = ['drill', 'polish', 'belt'];
export const IDLE_BASE_COST: Record<IdleUpg, number> = { drill: 120, polish: 200, belt: 160 };

export function idleUpgName(u: IdleUpg): string {
  return u === 'drill'
    ? t('tycoon.idle.drill', 'Extratores')
    : u === 'polish'
      ? t('tycoon.idle.polish', 'Polidores')
      : t('tycoon.idle.belt', 'Esteira veloz');
}
export function idleUpgDesc(u: IdleUpg): string {
  return u === 'drill'
    ? t('tycoon.idle.drillD', 'Mais máquinas tirando estrelas')
    : u === 'polish'
      ? t('tycoon.idle.polishD', 'Estrelas valem mais')
      : t('tycoon.idle.beltD', 'Tudo anda mais rápido');
}
export const idleUpgCost = (u: IdleUpg, lvl: number): number => Math.round(IDLE_BASE_COST[u] * Math.pow(1.65, lvl));

/** Moedas por hora da fábrica ociosa. */
export function idleRate(lv: Record<IdleUpg, number>): number {
  return Math.round(10 * (1 + 0.5 * lv.drill) * (1 + 0.3 * lv.polish) * (1 + 0.2 * lv.belt));
}
