/* ============================================================
 *  PASSE DA CASA — extensão para o construtor da casa (src/home/*).
 *
 *  O construtor inclui os itens do passe assim:
 *    import { homePassItems } from '../pass/home/register';
 *    const extra = homePassItems();          // todos (60 temporadas), com `owned`
 *    FURNITURE.push(...extra.furniture.map(e => e.def))   // FurnDef-compatível, cost {kind:'pass'}
 *  Itens não ganhos ficam TRANCADOS (cost {kind:'pass'} = só no passe, nunca à venda).
 *  O que o lead/agente da casa precisa ligar está em docs/PASSE.md ("Passe da Casa").
 * ============================================================ */
import { save } from '../../core/storage';
import { allHomePassItems, type HomePassItem } from './catalog';

/** Formato do catálogo da casa (espelho de src/home/catalog.ts → FurnDef/Cost; sem importar para não acoplar). */
export interface PassFurnDef {
  id: string;
  kind: string; // FurnKind do construtor
  v: number;
  w: number;
  h: number;
  wall?: boolean;
  flat?: boolean;
  /** cor padrão = cor exata da temporada (o construtor aceita índice da paleta; use `hex` quando houver) */
  color: number;
  hex: string;
  cost: { kind: 'pass' };
  name: () => string;
  /** desenho especial (acabamento, motivo, animação) — ver draw.ts */
  pass: HomePassItem;
}

export interface HomePassExtension {
  furniture: { def: PassFurnDef; owned: boolean }[];
  /** pisos e papéis de parede: spec "<base>:pass:<id>" para RoomDesign.floor/wall */
  surfaces: { id: string; type: 'floor' | 'wall'; spec: string; owned: boolean; item: HomePassItem }[];
  /** opções extras de exterior/planeta (porta, telhado, janela, cerca, jardim, enfeites de planeta) */
  exterior: { id: string; section: 'planet' | 'exterior'; field: string; base: number; owned: boolean; item: HomePassItem }[];
  /** tintas especiais (pincel/rolo da pintura livre): HomeDesign.paint[room].wall = "pass:<id>" */
  paints: { id: string; owned: boolean; item: HomePassItem }[];
  /** kits de cômodo, festa (bolo/comida com cor de respingo), skins de ferramenta de limpeza, peças-mestras */
  kits: { id: string; owned: boolean; item: HomePassItem }[];
  party: { id: string; owned: boolean; item: HomePassItem }[];
  tools: { id: string; owned: boolean; item: HomePassItem }[];
  showpieces: { id: string; owned: boolean; item: HomePassItem }[];
}

const PAL_IDX = 0; // o construtor usa `hex` quando presente

export function toFurnDef(it: HomePassItem): PassFurnDef | null {
  if (!it.furn) return null;
  return { id: it.id, kind: it.furn.kind, v: it.furn.v, w: it.furn.w, h: it.furn.h, wall: it.furn.wall, flat: it.furn.flat, color: PAL_IDX, hex: it.draw.palette[1], cost: { kind: 'pass' }, name: () => it.name, pass: it };
}

/** Todos os itens do Passe da Casa, prontos para o construtor (com `owned`). */
export function homePassItems(): HomePassExtension {
  const own = new Set(save.homeItems);
  const ext: HomePassExtension = { furniture: [], surfaces: [], exterior: [], paints: [], kits: [], party: [], tools: [], showpieces: [] };
  for (const it of allHomePassItems()) {
    const owned = own.has(it.id);
    const f = toFurnDef(it);
    if (f) ext.furniture.push({ def: f, owned });
    else if (it.surface) ext.surfaces.push({ id: it.id, type: it.surface.type, spec: `${it.surface.base}:pass:${it.id}`, owned, item: it });
    else if (it.ext) ext.exterior.push({ id: it.id, ...it.ext, owned, item: it });
    else if (it.cat === 'paint') ext.paints.push({ id: it.id, owned, item: it });
    else if (it.cat === 'roomkit') ext.kits.push({ id: it.id, owned, item: it });
    else if (it.cat === 'party') ext.party.push({ id: it.id, owned, item: it });
    else if (it.cat === 'cleaning') ext.tools.push({ id: it.id, owned, item: it });
    else if (it.cat === 'showpiece') ext.showpieces.push({ id: it.id, owned, item: it });
  }
  return ext;
}

export { drawHomeItem } from './draw';
export { homeItem } from './catalog';
export { ownsHomePassItem } from './state';
