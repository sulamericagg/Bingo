/* ============================================================
 *  VEÍCULOS DO MUNDO — catálogo de PEÇAS (dados puros, sem DOM/three).
 *  Cada peça é também um ITEM de inventário (id "vp_*") fabricado na
 *  bancada/oficina a partir de materiais do mundo (ids do catálogo do
 *  motor: tabua, barra_ferro, engrenagem, fio...).
 *  Grade do chassi: célula = CELL m; (x, z) com z = 0 na FRENTE.
 * ============================================================ */
import { t } from '../../../../../i18n';

export const CELL = 0.5;

export type PartCat =
  | 'chassis' | 'wheel' | 'track' | 'engine' | 'seat' | 'cargo' | 'box' | 'tank' | 'hitch'
  | 'crane' | 'drill' | 'blade' | 'plow' | 'float' | 'propeller' | 'rotor' | 'wing' | 'light' | 'armor';
/** deck = em cima do chassi; under = embaixo (rodas, esteiras, boias) */
export type Layer = 'deck' | 'under';
/** onde pode ir: qualquer célula, coluna da borda, 1ª fileira (frente), última (trás), coluna do meio */
export type Place = 'any' | 'edge' | 'front' | 'back' | 'center' | 'ends';
export type FuelKind = 'none' | 'carvao' | 'combustivel' | 'bateria';
export type Station = 'mao' | 'bancada' | 'bigorna' | 'oficina' | 'fornalha';

export interface PartDef {
  id: string;
  name: () => string;
  cat: PartCat;
  /** nível de progressão 0..3 (também limita o que aparece cedo) */
  tier: number;
  layer: Layer;
  place: Place;
  /** pegada em células (sem girar) */
  w: number;
  l: number;
  mass: number;
  color: string;
  color2: string;
  /* --- chassi --- */
  grid?: [number, number];
  hp?: number;
  /* --- motor --- */
  power?: number;
  fuel?: FuelKind;
  tank?: number;
  /** energia gasta por (potência × s) — menor = mais eficiente */
  burn?: number;
  /* --- roda/esteira --- */
  radius?: number;
  grip?: number;
  vmax?: number;
  /* --- carga --- */
  /** caçamba: toras; compartimento: pilhas de itens */
  cap?: number;
  /* --- água/ar --- */
  buoy?: number;
  thrust?: number;
  lift?: number;
  /* --- ferramentas/defesa --- */
  armor?: number;
  reach?: number;
}

export const PARTS: PartDef[] = [];
export const PART = new Map<string, PartDef>();
const P = (d: PartDef) => {
  PARTS.push(d);
  PART.set(d.id, d);
};

/* ------------------------------ chassis ------------------------------ */
P({ id: 'vp_chassi_p', name: () => t('mveic.p.chassiP', 'Chassi Pequeno'), cat: 'chassis', tier: 0, layer: 'deck', place: 'any', w: 3, l: 4, mass: 5, hp: 60, grid: [3, 4], color: '#c8925a', color2: '#8a5a30' });
P({ id: 'vp_chassi_m', name: () => t('mveic.p.chassiM', 'Chassi Médio'), cat: 'chassis', tier: 1, layer: 'deck', place: 'any', w: 4, l: 6, mass: 12, hp: 120, grid: [4, 6], color: '#7a8496', color2: '#4a5262' });
P({ id: 'vp_chassi_g', name: () => t('mveic.p.chassiG', 'Chassi Grande'), cat: 'chassis', tier: 2, layer: 'deck', place: 'any', w: 5, l: 11, mass: 24, hp: 220, grid: [5, 11], color: '#5a6476', color2: '#323a48' });

/* ------------------------------ rodas e esteiras ------------------------------ */
P({ id: 'vp_roda_madeira', name: () => t('mveic.p.rodaMadeira', 'Roda de Madeira'), cat: 'wheel', tier: 0, layer: 'under', place: 'any', w: 1, l: 1, mass: 0.7, radius: 0.3, grip: 0.9, vmax: 7, color: '#b07a44', color2: '#6a4424' });
P({ id: 'vp_roda_borracha', name: () => t('mveic.p.rodaBorracha', 'Roda de Borracha'), cat: 'wheel', tier: 1, layer: 'under', place: 'any', w: 1, l: 1, mass: 1.1, radius: 0.38, grip: 1.3, vmax: 16, color: '#2d3340', color2: '#c8ccd8' });
P({ id: 'vp_roda_grande', name: () => t('mveic.p.rodaGrande', 'Roda Gigante'), cat: 'wheel', tier: 2, layer: 'under', place: 'any', w: 1, l: 1, mass: 2.2, radius: 0.56, grip: 1.7, vmax: 15, color: '#262a34', color2: '#ffcf2e' });
P({ id: 'vp_roda_corrida', name: () => t('mveic.p.rodaCorrida', 'Roda de Corrida'), cat: 'wheel', tier: 3, layer: 'under', place: 'any', w: 1, l: 1, mass: 1.2, radius: 0.4, grip: 1.6, vmax: 26, color: '#1e2230', color2: '#ff4f6a' });
P({ id: 'vp_esteira', name: () => t('mveic.p.esteira', 'Esteira'), cat: 'track', tier: 2, layer: 'under', place: 'edge', w: 1, l: 4, mass: 5, radius: 0.34, grip: 2.4, vmax: 8, color: '#3a3f48', color2: '#8a92a0' });

/* ------------------------------ motores ------------------------------ */
P({ id: 'vp_motor_pedal', name: () => t('mveic.p.motorPedal', 'Pedal'), cat: 'engine', tier: 0, layer: 'deck', place: 'any', w: 1, l: 1, mass: 0.6, power: 2.6, fuel: 'none', tank: 0, burn: 0, color: '#d8a060', color2: '#ff8ac8' });
P({ id: 'vp_motor_lenha', name: () => t('mveic.p.motorLenha', 'Motor a Lenha'), cat: 'engine', tier: 1, layer: 'deck', place: 'any', w: 1, l: 2, mass: 4, power: 10, fuel: 'carvao', tank: 120, burn: 0.03, color: '#5a4a44', color2: '#ff7a3a' });
P({ id: 'vp_motor_comb', name: () => t('mveic.p.motorComb', 'Motor a Combustível'), cat: 'engine', tier: 2, layer: 'deck', place: 'any', w: 1, l: 2, mass: 3.5, power: 20, fuel: 'combustivel', tank: 160, burn: 0.02, color: '#c83a3a', color2: '#c8ccd8' });
P({ id: 'vp_motor_eletr', name: () => t('mveic.p.motorEletr', 'Motor Elétrico'), cat: 'engine', tier: 3, layer: 'deck', place: 'any', w: 1, l: 1, mass: 2.4, power: 28, fuel: 'bateria', tank: 200, burn: 0.012, color: '#3ab0ff', color2: '#e8f0ff' });

/* ------------------------------ cabine e carga ------------------------------ */
P({ id: 'vp_banco', name: () => t('mveic.p.banco', 'Banco do Piloto'), cat: 'seat', tier: 0, layer: 'deck', place: 'any', w: 1, l: 1, mass: 0.6, color: '#ff4f6a', color2: '#5a3a2a' });
P({ id: 'vp_cacamba_p', name: () => t('mveic.p.cacambaP', 'Caixote de Carga'), cat: 'cargo', tier: 0, layer: 'deck', place: 'any', w: 2, l: 3, mass: 1.6, cap: 3, color: '#d8a060', color2: '#a8743c' });
P({ id: 'vp_cacamba', name: () => t('mveic.p.cacamba', 'Caçamba'), cat: 'cargo', tier: 1, layer: 'deck', place: 'any', w: 3, l: 4, mass: 3.6, cap: 8, color: '#8a92a0', color2: '#5a6270' });
P({ id: 'vp_compartimento', name: () => t('mveic.p.compart', 'Compartimento'), cat: 'box', tier: 1, layer: 'deck', place: 'any', w: 1, l: 1, mass: 1.2, cap: 6, color: '#b07a44', color2: '#ffd34a' });
P({ id: 'vp_tanque', name: () => t('mveic.p.tanque', 'Tanque Extra'), cat: 'tank', tier: 1, layer: 'deck', place: 'any', w: 1, l: 1, mass: 1, tank: 120, color: '#e04a3a', color2: '#ffd34a' });
P({ id: 'vp_engate', name: () => t('mveic.p.engate', 'Engate de Reboque'), cat: 'hitch', tier: 1, layer: 'deck', place: 'ends', w: 1, l: 1, mass: 0.8, color: '#4a5262', color2: '#c8ccd8' });

/* ------------------------------ ferramentas ------------------------------ */
P({ id: 'vp_grua', name: () => t('mveic.p.grua', 'Braço Guindaste'), cat: 'crane', tier: 2, layer: 'deck', place: 'any', w: 1, l: 1, mass: 4, lift: 16, reach: 4.2, color: '#ffb02e', color2: '#3a3f48' });
P({ id: 'vp_broca', name: () => t('mveic.p.broca', 'Broca'), cat: 'drill', tier: 2, layer: 'deck', place: 'front', w: 1, l: 1, mass: 3, reach: 1.1, color: '#c8ccd8', color2: '#ffb02e' });
P({ id: 'vp_lamina', name: () => t('mveic.p.lamina', 'Lâmina Niveladora'), cat: 'blade', tier: 1, layer: 'deck', place: 'front', w: 3, l: 1, mass: 3, reach: 1.6, color: '#ffcf2e', color2: '#5a6270' });
P({ id: 'vp_arado', name: () => t('mveic.p.arado', 'Arado'), cat: 'plow', tier: 1, layer: 'deck', place: 'back', w: 2, l: 1, mass: 1.6, reach: 1.2, color: '#8a5a30', color2: '#c8ccd8' });

/* ------------------------------ água e ar ------------------------------ */
P({ id: 'vp_boia', name: () => t('mveic.p.boia', 'Boia'), cat: 'float', tier: 1, layer: 'under', place: 'edge', w: 1, l: 3, mass: 1.2, buoy: 26, color: '#ff8a3a', color2: '#ffffff' });
P({ id: 'vp_pontao', name: () => t('mveic.p.pontao', 'Pontão'), cat: 'float', tier: 2, layer: 'under', place: 'edge', w: 1, l: 5, mass: 2.6, buoy: 60, color: '#c8ccd8', color2: '#3a8aff' });
P({ id: 'vp_helice', name: () => t('mveic.p.helice', 'Hélice'), cat: 'propeller', tier: 1, layer: 'deck', place: 'ends', w: 1, l: 1, mass: 0.9, thrust: 1, color: '#c8ccd8', color2: '#3a3f48' });
P({ id: 'vp_rotor', name: () => t('mveic.p.rotor', 'Rotor'), cat: 'rotor', tier: 3, layer: 'deck', place: 'center', w: 1, l: 1, mass: 3, lift: 1, color: '#3a3f48', color2: '#8a5cff' });
P({ id: 'vp_asa', name: () => t('mveic.p.asa', 'Asa'), cat: 'wing', tier: 3, layer: 'deck', place: 'edge', w: 1, l: 2, mass: 1.6, lift: 1, color: '#ffffff', color2: '#ff4f6a' });

/* ------------------------------ extras ------------------------------ */
P({ id: 'vp_farol', name: () => t('mveic.p.farol', 'Farol'), cat: 'light', tier: 1, layer: 'deck', place: 'front', w: 1, l: 1, mass: 0.2, color: '#fff4c0', color2: '#4a5262' });
P({ id: 'vp_blindagem', name: () => t('mveic.p.blindagem', 'Placa de Blindagem'), cat: 'armor', tier: 2, layer: 'deck', place: 'edge', w: 1, l: 1, mass: 1.8, hp: 30, armor: 0.1, color: '#8a92a0', color2: '#5a6270' });

/* ------------------------------ combustíveis ------------------------------ */
/** itens que abastecem: tipo e energia por unidade (tanque é medido em energia) */
export const FUEL_ITEMS: Record<string, { kind: FuelKind; e: number }> = {
  carvao: { kind: 'carvao', e: 40 },
  tora: { kind: 'carvao', e: 14 },
  tabua: { kind: 'carvao', e: 5 },
  graveto: { kind: 'carvao', e: 2 },
  combustivel: { kind: 'combustivel', e: 60 },
  bateria: { kind: 'bateria', e: 80 },
};
export function fuelName(k: FuelKind): string {
  return k === 'carvao' ? t('mveic.f.carvao', 'Carvão') : k === 'combustivel' ? t('mveic.f.comb', 'Combustível') : k === 'bateria' ? t('mveic.f.bat', 'Bateria') : t('mveic.f.none', 'Força das pernas');
}

/** itens novos que o sistema de veículos acrescenta ao catálogo (além das peças) */
export interface ExtraItem {
  id: string;
  name: () => string;
  color: string;
}
export const EXTRA_ITEMS: ExtraItem[] = [
  { id: 'combustivel', name: () => t('mveic.i.comb', 'Galão de Combustível'), color: '#e04a3a' },
  { id: 'bateria', name: () => t('mveic.i.bat', 'Bateria'), color: '#3ab0ff' },
  { id: 'kit_reparo', name: () => t('mveic.i.reparo', 'Kit de Reparo'), color: '#5cc24a' },
];

/* ------------------------------ receitas ------------------------------ */
/** compatível com Recipe (forma "sem padrão") do catálogo do mundo: { out, n, st, ing } */
export interface VRecipe {
  out: string;
  n: number;
  st: Station;
  ing: [string, number][];
}
export const VEH_RECIPES: VRecipe[] = [];
const R = (out: string, st: Station, ing: [string, number][], n = 1) => VEH_RECIPES.push({ out, n, st, ing });

R('vp_chassi_p', 'bancada', [['tabua', 6], ['graveto', 4]]);
R('vp_chassi_m', 'oficina', [['barra_ferro', 4], ['tabua', 6]]);
R('vp_chassi_g', 'oficina', [['barra_ferro', 10], ['engrenagem', 2]]);
R('vp_roda_madeira', 'bancada', [['tabua', 2], ['graveto', 1]], 2);
R('vp_roda_borracha', 'oficina', [['gosma', 2], ['barra_ferro', 1]], 2);
R('vp_roda_grande', 'oficina', [['gosma', 4], ['barra_ferro', 2]]);
R('vp_roda_corrida', 'oficina', [['gosma', 2], ['barra_prata', 1], ['fio', 1]]);
R('vp_esteira', 'oficina', [['barra_ferro', 4], ['engrenagem', 2], ['gosma', 2]]);
R('vp_motor_pedal', 'bancada', [['tabua', 2], ['corda', 2], ['graveto', 2]]);
R('vp_motor_lenha', 'oficina', [['barra_ferro', 3], ['pedra', 4], ['engrenagem', 1]]);
R('vp_motor_comb', 'oficina', [['barra_ferro', 4], ['engrenagem', 2], ['fio', 2]]);
R('vp_motor_eletr', 'oficina', [['barra_cobre', 4], ['fio', 4], ['cristal_lap', 1]]);
R('vp_banco', 'bancada', [['tabua', 2], ['tecido', 1]]);
R('vp_cacamba_p', 'bancada', [['tabua', 4]]);
R('vp_cacamba', 'oficina', [['barra_ferro', 2], ['tabua', 4]]);
R('vp_compartimento', 'bancada', [['tabua', 4], ['barra_ferro', 1]]);
R('vp_tanque', 'oficina', [['barra_ferro', 2], ['resina', 1]]);
R('vp_engate', 'oficina', [['barra_ferro', 2]]);
R('vp_grua', 'oficina', [['barra_ferro', 5], ['engrenagem', 2], ['corda', 3]]);
R('vp_broca', 'oficina', [['barra_ferro', 3], ['engrenagem', 2], ['cristal', 1]]);
R('vp_lamina', 'oficina', [['barra_ferro', 4]]);
R('vp_arado', 'oficina', [['barra_ferro', 2], ['tabua', 2]]);
R('vp_boia', 'bancada', [['tabua', 6], ['resina', 2]]);
R('vp_pontao', 'oficina', [['barra_ferro', 3], ['tabua', 4]]);
R('vp_helice', 'oficina', [['barra_ferro', 2], ['engrenagem', 1]]);
R('vp_rotor', 'oficina', [['barra_prata', 2], ['engrenagem', 2], ['fio', 2]]);
R('vp_asa', 'oficina', [['tecido', 4], ['barra_ferro', 2], ['tabua', 2]]);
R('vp_farol', 'oficina', [['vidro', 1], ['tocha', 1]], 2);
R('vp_blindagem', 'bigorna', [['barra_ferro', 3]]);
R('combustivel', 'oficina', [['resina', 2], ['carvao', 1]], 2);
R('bateria', 'oficina', [['barra_cobre', 2], ['fio', 2], ['cristal', 1]]);
R('kit_reparo', 'bancada', [['barra_ferro', 1], ['engrenagem', 1], ['corda', 1]]);

/** materiais base usados pelas receitas (para inventário "trapaça" e ícones) */
export const RAW_MATS = ['tabua', 'graveto', 'corda', 'tecido', 'pedra', 'resina', 'gosma', 'barra_ferro', 'barra_cobre', 'barra_prata', 'engrenagem', 'fio', 'cristal', 'cristal_lap', 'vidro', 'tocha', 'carvao', 'tora'];

const MAT_NAMES: Record<string, () => string> = {
  tabua: () => t('mveic.m.tabua', 'Tábua'),
  graveto: () => t('mveic.m.graveto', 'Graveto'),
  corda: () => t('mveic.m.corda', 'Corda'),
  tecido: () => t('mveic.m.tecido', 'Tecido'),
  pedra: () => t('mveic.m.pedra', 'Pedra'),
  resina: () => t('mveic.m.resina', 'Resina'),
  gosma: () => t('mveic.m.gosma', 'Gosma'),
  barra_ferro: () => t('mveic.m.barFerro', 'Barra de Ferro'),
  barra_cobre: () => t('mveic.m.barCobre', 'Barra de Cobre'),
  barra_prata: () => t('mveic.m.barPrata', 'Barra de Prata'),
  engrenagem: () => t('mveic.m.engrenagem', 'Engrenagem'),
  fio: () => t('mveic.m.fio', 'Fio de Cobre'),
  cristal: () => t('mveic.m.cristal', 'Cristal Bruto'),
  cristal_lap: () => t('mveic.m.cristalLap', 'Cristal Lapidado'),
  vidro: () => t('mveic.m.vidro', 'Vidro'),
  tocha: () => t('mveic.m.tocha', 'Tocha'),
  carvao: () => t('mveic.m.carvao', 'Carvão'),
  tora: () => t('mveic.m.tora', 'Tora'),
};
export const MAT_COLORS: Record<string, string> = {
  tabua: '#d8a060', graveto: '#a8743c', corda: '#d8b47a', tecido: '#ff8ac8', pedra: '#9a96a0', resina: '#ffb02e', gosma: '#7aff8a',
  barra_ferro: '#c8ccd8', barra_cobre: '#f08a4a', barra_prata: '#e8f0ff', engrenagem: '#a8acb8', fio: '#f08a4a', cristal: '#7af0ff',
  cristal_lap: '#aaf8ff', vidro: '#bfeaff', tocha: '#ffb02e', carvao: '#3a3438', tora: '#9a6a3c',
};

/** nome de qualquer item que o sistema de veículos mostra (peça, extra ou material) */
export function vItemName(id: string): string {
  const p = PART.get(id);
  if (p) return p.name();
  const x = EXTRA_ITEMS.find((e) => e.id === id);
  if (x) return x.name();
  return MAT_NAMES[id]?.() ?? id;
}
export function vItemColor(id: string): string {
  return PART.get(id)?.color ?? EXTRA_ITEMS.find((e) => e.id === id)?.color ?? MAT_COLORS[id] ?? '#c8ccd8';
}
