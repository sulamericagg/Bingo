/* ============================================================
 *  ESTÚDIO DE MAQUIAGEM — formato do "look" (camadas de traços).
 *
 *  Espaço do rosto: o mesmo do corpo do Bloop em drawAvatar, em
 *  unidades de R/100, centro (0,0), y para baixo, área ±130 — é
 *  exatamente a área da textura do rosto 3D do Cinema (2,6 R).
 *  O look é uma LISTA DE TRAÇOS (compacta, sem imagem): pode ir
 *  dentro do projeto do Cinema e ser redesenhada em qualquer
 *  resolução (2D, 3D, miniaturas, foto).
 *
 *  O look do jogador fica numa chave própria do localStorage
 *  (não entra em save.avatar, que vai para a rede no perfil).
 * ============================================================ */

export type BrushId = 'base' | 'blush' | 'shadow' | 'lips' | 'contour' | 'highlight' | 'glitter' | 'stars' | 'hearts' | 'stripes' | 'erase';
export type ZoneId = 'free' | 'lips' | 'eyes' | 'cheeks' | 'forehead';

export interface Stroke {
  /** pincel */
  b: BrushId;
  /** cor #rrggbb */
  c: string;
  /** tamanho (diâmetro) em unidades do rosto (R/100) */
  s: number;
  /** força 1..100 */
  a: number;
  /** zona inteligente (máscara) */
  z?: ZoneId;
  /** espelhado (simetria) */
  m?: 1;
  /** pontos x,y inteiros (R/100) */
  p: number[];
}

export interface Layer {
  id: string;
  name: string;
  /** escondida */
  h?: 1;
  /** opacidade 0..100 */
  o: number;
  st: Stroke[];
}

export interface MakeupLook {
  v: 1;
  layers: Layer[];
}

export const EXTENT = 130;
export const MAX_POINTS_STROKE = 600;
export const MAX_STROKES = 400;
export const FREE_LAYERS = 2;
export const MAX_LAYERS = 8;

const BRUSHES: BrushId[] = ['base', 'blush', 'shadow', 'lips', 'contour', 'highlight', 'glitter', 'stars', 'hearts', 'stripes', 'erase'];
const ZONES: ZoneId[] = ['free', 'lips', 'eyes', 'cheeks', 'forehead'];
export const PRO_BRUSHES: ReadonlySet<BrushId> = new Set(['glitter', 'stars', 'hearts', 'stripes']);

export const lid = (): string => 'l' + Math.random().toString(36).slice(2, 7);
export const emptyLook = (name = 'Camada 1'): MakeupLook => ({ v: 1, layers: [{ id: lid(), name, o: 100, st: [] }] });
export const cloneLook = (l: MakeupLook): MakeupLook => JSON.parse(JSON.stringify(l)) as MakeupLook;
export const lookIsEmpty = (l: MakeupLook | null | undefined): boolean => !l || l.layers.every((x) => !x.st.length);
export const lookUsesPro = (l: MakeupLook): boolean => l.layers.length > FREE_LAYERS || l.layers.some((x) => x.st.some((s) => PRO_BRUSHES.has(s.b)));

/** Valida/limita um look vindo de arquivo, IndexedDB ou localStorage. */
export function parseLook(raw: unknown): MakeupLook | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as { v?: unknown; layers?: unknown };
  if (o.v !== 1 || !Array.isArray(o.layers)) return null;
  let total = 0;
  const layers: Layer[] = [];
  for (const L of o.layers.slice(0, MAX_LAYERS) as Partial<Layer>[]) {
    if (!L || !Array.isArray(L.st)) continue;
    const st: Stroke[] = [];
    for (const s of L.st as Partial<Stroke>[]) {
      if (total >= MAX_STROKES) break;
      if (!s || !BRUSHES.includes(s.b as BrushId) || !Array.isArray(s.p)) continue;
      const p = s.p.slice(0, MAX_POINTS_STROKE * 2).map((v) => Math.max(-EXTENT, Math.min(EXTENT, Math.round(+v || 0))));
      if (p.length < 2) continue;
      if (p.length % 2) p.pop();
      st.push({
        b: s.b as BrushId,
        c: /^#[0-9a-f]{6}$/i.test(String(s.c)) ? String(s.c) : '#ff5c8a',
        s: Math.max(2, Math.min(120, +(s.s ?? 20) || 20)),
        a: Math.max(1, Math.min(100, +(s.a ?? 60) || 60)),
        z: ZONES.includes(s.z as ZoneId) && s.z !== 'free' ? (s.z as ZoneId) : undefined,
        m: s.m ? 1 : undefined,
        p,
      });
      total++;
    }
    layers.push({ id: String(L.id ?? lid()).slice(0, 12), name: String(L.name ?? '').slice(0, 20), h: L.h ? 1 : undefined, o: Math.max(0, Math.min(100, +(L.o ?? 100))), st });
  }
  return layers.length ? { v: 1, layers } : null;
}

/* ---------------------------- look do jogador ---------------------------- */
const PKEY = 'bw-makeup-player';
let playerCache: MakeupLook | null | undefined;

export function playerLook(): MakeupLook | null {
  if (playerCache !== undefined) return playerCache;
  try {
    playerCache = parseLook(JSON.parse(localStorage.getItem(PKEY) || 'null'));
  } catch {
    playerCache = null;
  }
  if (lookIsEmpty(playerCache)) playerCache = null;
  return playerCache;
}

export function setPlayerLook(l: MakeupLook | null): void {
  playerCache = lookIsEmpty(l) ? null : cloneLook(l!);
  try {
    if (playerCache) localStorage.setItem(PKEY, JSON.stringify(playerCache));
    else localStorage.removeItem(PKEY);
  } catch {
    /* sem espaço: fica só na memória */
  }
}

/* ---------------------------- looks salvos ---------------------------- */
export interface SavedLook {
  id: string;
  name: string;
  look: MakeupLook;
  thumb: string;
}
const LKEY = 'bw-makeup-looks';

export function listLooks(): SavedLook[] {
  try {
    const a = JSON.parse(localStorage.getItem(LKEY) || '[]') as SavedLook[];
    return a.filter((x) => x && parseLook(x.look)).slice(0, 30);
  } catch {
    return [];
  }
}
export function saveLookPreset(name: string, look: MakeupLook, thumb: string): boolean {
  const list = listLooks();
  list.unshift({ id: lid(), name: name.slice(0, 24), look: cloneLook(look), thumb });
  try {
    localStorage.setItem(LKEY, JSON.stringify(list.slice(0, 30)));
    return true;
  } catch {
    return false;
  }
}
export function deleteLookPreset(id: string): void {
  try {
    localStorage.setItem(LKEY, JSON.stringify(listLooks().filter((x) => x.id !== id)));
  } catch {
    /* */
  }
}

/* ---------------------------- looks prontos ---------------------------- */
const line = (x0: number, y0: number, x1: number, y1: number, n = 8): number[] => {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) p.push(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
  return p;
};
const dot = (x: number, y: number): number[] => [x, y, x + 1, y];
const circleP = (cx: number, cy: number, r: number, n = 12): number[] => {
  const p: number[] = [];
  for (let i = 0; i <= n; i++) p.push(Math.round(cx + Math.cos((i / n) * Math.PI * 2) * r), Math.round(cy + Math.sin((i / n) * Math.PI * 2) * r));
  return p;
};

export interface BuiltinLook {
  id: string;
  pro?: boolean;
  look: MakeupLook;
}
/** Looks de exemplo (originais). Nomes traduzidos na UI (makeup.look.<id>). */
export const BUILTIN_LOOKS: BuiltinLook[] = [
  {
    id: 'natural',
    look: {
      v: 1,
      layers: [
        {
          id: 'n1',
          name: 'Natural',
          o: 100,
          st: [
            { b: 'blush', c: '#ff7a9a', s: 46, a: 55, z: 'cheeks', m: 1, p: circleP(-46, 16, 8) },
            { b: 'lips', c: '#e8466e', s: 16, a: 70, z: 'lips', p: line(-18, 27, 18, 27, 10) },
            { b: 'highlight', c: '#ffffff', s: 18, a: 40, m: 1, p: line(-44, 2, -32, -2, 4) },
          ],
        },
      ],
    },
  },
  {
    id: 'festa',
    look: {
      v: 1,
      layers: [
        {
          id: 'f1',
          name: 'Festa',
          o: 100,
          st: [
            { b: 'shadow', c: '#9b6bff', s: 30, a: 75, z: 'eyes', m: 1, p: line(-46, -24, -20, -27, 8) },
            { b: 'blush', c: '#ff5cc8', s: 44, a: 60, z: 'cheeks', m: 1, p: circleP(-46, 16, 8) },
            { b: 'lips', c: '#c4006a', s: 18, a: 85, z: 'lips', p: line(-20, 27, 20, 27, 10) },
          ],
        },
      ],
    },
  },
  {
    id: 'brilho',
    pro: true,
    look: {
      v: 1,
      layers: [
        { id: 'b1', name: 'Base', o: 100, st: [{ b: 'shadow', c: '#3fc8ff', s: 30, a: 70, z: 'eyes', m: 1, p: line(-46, -24, -20, -27, 8) }] },
        {
          id: 'b2',
          name: 'Brilho',
          o: 100,
          st: [
            { b: 'glitter', c: '#ffd93b', s: 40, a: 80, m: 1, p: line(-60, 14, -36, 22, 6) },
            { b: 'stars', c: '#ffffff', s: 14, a: 100, m: 1, p: dot(-62, -36) },
          ],
        },
      ],
    },
  },
  {
    id: 'heroi',
    pro: true,
    look: {
      v: 1,
      layers: [
        {
          id: 'h1',
          name: 'Pintura',
          o: 100,
          st: [
            { b: 'stripes', c: '#ff2e3a', s: 12, a: 100, m: 1, p: line(-70, 6, -40, 18, 6) },
            { b: 'stripes', c: '#ff2e3a', s: 12, a: 100, m: 1, p: line(-72, 22, -42, 32, 6) },
            { b: 'stars', c: '#ffd93b', s: 22, a: 100, p: dot(0, -66) },
          ],
        },
      ],
    },
  },
  {
    id: 'gatinho',
    pro: true,
    look: {
      v: 1,
      layers: [
        {
          id: 'g1',
          name: 'Gatinho',
          o: 100,
          st: [
            { b: 'stripes', c: '#2b2440', s: 6, a: 100, m: 1, p: line(-32, 22, -72, 14, 4) },
            { b: 'stripes', c: '#2b2440', s: 6, a: 100, m: 1, p: line(-32, 28, -72, 32, 4) },
            { b: 'hearts', c: '#ff5c8a', s: 18, a: 100, p: dot(0, 10) },
            { b: 'blush', c: '#ff8fb8', s: 40, a: 50, z: 'cheeks', m: 1, p: circleP(-46, 16, 6) },
          ],
        },
      ],
    },
  },
];
