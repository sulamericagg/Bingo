/* ============================================================
 *  VISUAIS EQUIPÁVEIS — pista, formato das notas, linha de acerto,
 *  pele dos instrumentos e efeitos de palco.
 *  Itens vindos do passe: ids 'band-<tipo>-<nome>' em save.passItems
 *  (ex.: 'band-highway-aurora'). Ids desconhecidos ganham um visual
 *  gerado pela semente do id (fallback), então nunca quebram.
 * ============================================================ */
import { t } from '../../i18n';
import { save } from '../../core/storage';
import type { Instrument } from './model';
import { hash32, mulberry } from './model';
import { bs } from './save';

export type CosKind = 'highway' | 'note' | 'line' | 'inst' | 'fx';
export type Texture = 'stripes' | 'wood' | 'stars' | 'grid' | 'drumhead' | 'keys' | 'waves' | 'rainbow' | 'ice' | 'lava' | 'candy';
export type NoteShape = 'gem' | 'pad' | 'bar' | 'pill' | 'blob' | 'star' | 'heart' | 'diamond' | 'square';
export type LineStyle = 'teclas' | 'aneis' | 'raio' | 'nuvem' | 'arcade';
export type FxStyle = 'confete' | 'fogos' | 'bolhas' | 'estrelas' | 'coracoes';

export interface CosItem {
  id: string;
  kind: CosKind;
  name: string;
  price?: { coins?: number; gems?: number };
  /** só pelo passe */
  pass?: boolean;
  /** só durante a temporada */
  season?: boolean;
  tex?: Texture;
  shape?: NoteShape;
  line?: LineStyle;
  fx?: FxStyle;
  /** cores: pista [topo, base, divisória]; instrumento [corpo, detalhe] */
  c: string[];
  /** paleta das lanes (5) */
  lanes?: string[];
}

export const LANE_CANDY = ['#ff5fa2', '#ffb627', '#3ddc97', '#4cc9f0', '#a974ff'];
const LANE_SEA = ['#5ef0ff', '#4cc9f0', '#7b8cff', '#c77dff', '#ff8fd8'];
const LANE_SUN = ['#ff4f6a', '#ff8a3d', '#ffd23f', '#9be15d', '#48e5c2'];
const LANE_MONO = ['#fff4c2', '#ffe08a', '#ffc94d', '#ffad33', '#ff8a1f'];

export const COSMETICS: CosItem[] = [
  // pistas (auto = a do instrumento)
  { id: 'auto', kind: 'highway', name: 'Do instrumento', c: [] },
  { id: 'classico', kind: 'highway', name: 'Clássica', tex: 'stripes', c: ['#1c0b45', '#3a1a7a', '#7b5cff'], lanes: LANE_CANDY },
  { id: 'pele', kind: 'highway', name: 'Pele de Tambor', tex: 'drumhead', c: ['#3b2412', '#8a5a2b', '#ffdca8'], lanes: LANE_SUN },
  { id: 'madeira', kind: 'highway', name: 'Madeira', tex: 'wood', c: ['#2a1608', '#6b3d1a', '#e8b071'], lanes: LANE_SUN },
  { id: 'marfim', kind: 'highway', name: 'Marfim', tex: 'keys', c: ['#2a2240', '#e9e4f7', '#2a0b5c'], lanes: LANE_SEA },
  { id: 'ondas', kind: 'highway', name: 'Ondas', tex: 'waves', c: ['#08163a', '#1d4c8a', '#5ef0ff'], lanes: LANE_SEA },
  { id: 'galaxia', kind: 'highway', name: 'Galáxia', tex: 'stars', c: ['#05031a', '#2a0f5c', '#c7a6ff'], lanes: LANE_SEA, price: { coins: 1500 } },
  { id: 'neon', kind: 'highway', name: 'Neon', tex: 'grid', c: ['#0a0220', '#200a40', '#ff3ec8'], lanes: LANE_CANDY, price: { coins: 2500 } },
  { id: 'arcoiris', kind: 'highway', name: 'Arco-íris', tex: 'rainbow', c: ['#26104f', '#4a2a8a', '#ffffff'], lanes: LANE_SUN, price: { gems: 40 } },
  { id: 'doce', kind: 'highway', name: 'Docinho', tex: 'candy', c: ['#5a1f4a', '#ff9ad5', '#fff0fa'], lanes: LANE_CANDY, price: { coins: 2000 } },
  { id: 'gelo', kind: 'highway', name: 'Gelo', tex: 'ice', c: ['#0b2a4a', '#8fd8ff', '#ffffff'], lanes: LANE_SEA, pass: true },
  { id: 'lava', kind: 'highway', name: 'Lava', tex: 'lava', c: ['#1a0505', '#5a1208', '#ff7a2e'], lanes: LANE_MONO, pass: true },
  { id: 'temporada', kind: 'highway', name: 'Tema da Temporada', tex: 'stripes', c: ['#120a2e', '#2a1a5a', '#ffd84a'], lanes: LANE_CANDY, season: true },
  // notas
  { id: 'auto', kind: 'note', name: 'Do instrumento', c: [] },
  { id: 'gem', kind: 'note', name: 'Joia', shape: 'gem', c: [] },
  { id: 'pad', kind: 'note', name: 'Tambor', shape: 'pad', c: [] },
  { id: 'bar', kind: 'note', name: 'Barrinha', shape: 'bar', c: [] },
  { id: 'pill', kind: 'note', name: 'Cápsula', shape: 'pill', c: [] },
  { id: 'blob', kind: 'note', name: 'Bolinha Fofa', shape: 'blob', c: [] },
  { id: 'star', kind: 'note', name: 'Estrela', shape: 'star', c: [], price: { coins: 1200 } },
  { id: 'heart', kind: 'note', name: 'Coração', shape: 'heart', c: [], price: { coins: 1200 } },
  { id: 'diamond', kind: 'note', name: 'Diamante', shape: 'diamond', c: [], price: { gems: 25 } },
  { id: 'square', kind: 'note', name: 'Bloco', shape: 'square', c: [], pass: true },
  // linha de acerto
  { id: 'teclas', kind: 'line', name: 'Teclas', line: 'teclas', c: [] },
  { id: 'aneis', kind: 'line', name: 'Anéis', line: 'aneis', c: [] },
  { id: 'nuvem', kind: 'line', name: 'Nuvens', line: 'nuvem', c: [], price: { coins: 900 } },
  { id: 'raio', kind: 'line', name: 'Raio', line: 'raio', c: [], price: { coins: 1400 } },
  { id: 'arcade', kind: 'line', name: 'Fliperama', line: 'arcade', c: [], pass: true },
  // pele dos instrumentos
  { id: 'padrao', kind: 'inst', name: 'Original', c: [] },
  { id: 'ouro', kind: 'inst', name: 'Dourado', c: ['#ffcf2e', '#fff6b0'], price: { coins: 3000 } },
  { id: 'neoninst', kind: 'inst', name: 'Neon', c: ['#ff3ec8', '#5ef0ff'], price: { coins: 1800 } },
  { id: 'cristal', kind: 'inst', name: 'Cristal', c: ['#9ffcff', '#ffffff'], price: { gems: 30 } },
  { id: 'galaxiainst', kind: 'inst', name: 'Cósmico', c: ['#3a1a7a', '#ffd84a'], pass: true },
  // efeitos de palco
  { id: 'confete', kind: 'fx', name: 'Confete', fx: 'confete', c: [] },
  { id: 'fogos', kind: 'fx', name: 'Faíscas', fx: 'fogos', c: [] },
  { id: 'bolhas', kind: 'fx', name: 'Bolhas', fx: 'bolhas', c: [], price: { coins: 800 } },
  { id: 'estrelas', kind: 'fx', name: 'Estrelinhas', fx: 'estrelas', c: [], price: { coins: 1200 } },
  { id: 'coracoes', kind: 'fx', name: 'Corações', fx: 'coracoes', c: [], pass: true },
];

export const INST_DEFAULT: Record<Instrument, { highway: string; note: string; c: string[] }> = {
  drums: { highway: 'pele', note: 'pad', c: ['#ff4f6a', '#ffe08a'] },
  bass: { highway: 'madeira', note: 'bar', c: ['#3fb8ff', '#e0feff'] },
  guitar: { highway: 'classico', note: 'gem', c: ['#ff8a3d', '#fff0c2'] },
  keys: { highway: 'marfim', note: 'pill', c: ['#a974ff', '#ffffff'] },
  vocals: { highway: 'ondas', note: 'blob', c: ['#c8c4dc', '#ff8fd8'] },
};

export const cosName = (c: CosItem): string => t(`band.cos.${c.kind}.${c.id}`, c.name);

let seasonPalette: [string, string, string] | null = null;
export function setSeasonPalette(p: [string, string, string] | null): void {
  seasonPalette = p;
  const it = COSMETICS.find((c) => c.id === 'temporada');
  if (it && p) it.c = [p[0], shade(p[0], 0.25), p[1]];
  if (it && p) it.lanes = [p[1], p[2], '#ffffff', p[2], p[1]];
}
export const seasonActive = (): boolean => !!seasonPalette;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  const f = (v: number) => Math.min(255, Math.round(v + (255 - v) * k));
  return '#' + ((1 << 24) | (f((n >> 16) & 255) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
}

/** itens do passe com ids desconhecidos viram itens gerados */
function generated(): CosItem[] {
  const out: CosItem[] = [];
  const ids = new Set<string>([...(save.passItems ?? []), ...bs.owned]);
  for (const raw of ids) {
    if (!raw.startsWith('band-')) continue;
    const [, kind, ...rest] = raw.split('-');
    const name = rest.join('-');
    if (!name || !['highway', 'note', 'line', 'inst', 'fx'].includes(kind)) continue;
    if (COSMETICS.some((c) => c.kind === kind && c.id === name)) continue;
    const r = mulberry(hash32(raw));
    const hue = Math.floor(r() * 360);
    const col = (l: number, s = 80) => hsl(hue + r() * 40, s, l);
    const base: CosItem = { id: name, kind: kind as CosKind, name: name.charAt(0).toUpperCase() + name.slice(1), pass: true, c: [col(8), col(28), col(70)] };
    if (kind === 'highway') {
      base.tex = (['stripes', 'stars', 'grid', 'waves', 'candy'] as Texture[])[Math.floor(r() * 5)];
      base.lanes = [0, 1, 2, 3, 4].map((i) => hsl(hue + i * 50, 85, 62));
    } else if (kind === 'note') base.shape = (['gem', 'star', 'heart', 'diamond', 'blob'] as NoteShape[])[Math.floor(r() * 5)];
    else if (kind === 'line') base.line = (['teclas', 'aneis', 'nuvem', 'raio'] as LineStyle[])[Math.floor(r() * 4)];
    else if (kind === 'fx') base.fx = (['confete', 'fogos', 'bolhas', 'estrelas', 'coracoes'] as FxStyle[])[Math.floor(r() * 5)];
    else base.c = [col(55), col(85)];
    out.push(base);
  }
  return out;
}

function hsl(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + ((1 << 24) | (f(0) << 16) | (f(8) << 8) | f(4)).toString(16).slice(1);
}

export function catalog(kind: CosKind): CosItem[] {
  return [...COSMETICS.filter((c) => c.kind === kind && (!c.season || seasonPalette)), ...generated().filter((c) => c.kind === kind)];
}

export function owns(c: CosItem): boolean {
  if (c.season) return !!seasonPalette;
  if (!c.price && !c.pass) return true;
  const pid = `band-${c.kind}-${c.id}`;
  return bs.owned.includes(pid) || (save.passItems ?? []).includes(pid);
}

export function findCos(kind: CosKind, id: string): CosItem {
  const list = catalog(kind);
  return list.find((c) => c.id === id) ?? list.find((c) => c.id !== 'auto') ?? COSMETICS[1];
}

/** visual efetivo para um instrumento */
export function lookFor(inst: Instrument): { hw: CosItem; shape: NoteShape; line: LineStyle; fx: FxStyle } {
  const d = INST_DEFAULT[inst];
  const hwId = bs.eq.highway === 'auto' ? d.highway : bs.eq.highway;
  const nId = bs.eq.note === 'auto' ? d.note : bs.eq.note;
  const hwc = findCos('highway', hwId);
  const hw = owns(hwc) ? hwc : findCos('highway', d.highway);
  const nc = findCos('note', nId);
  const lc = findCos('line', bs.eq.line);
  const fc = findCos('fx', bs.eq.fx);
  return { hw, shape: (owns(nc) ? nc.shape : undefined) ?? (d.note as NoteShape), line: (owns(lc) ? lc.line : undefined) ?? 'teclas', fx: (owns(fc) ? fc.fx : undefined) ?? 'confete' };
}

export function instColors(inst: Instrument): string[] {
  const id = bs.eq.inst[inst];
  if (id && id !== 'padrao') {
    const c = findCos('inst', id);
    if (owns(c) && c.c.length >= 2) return c.c;
  }
  return INST_DEFAULT[inst].c;
}
