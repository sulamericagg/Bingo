/* DESENHA E VIRA! — progresso local (localStorage 'bw-desenho'): galeria (só traços,
 * em código compacto), estrelas dos desafios, tutorial, criações deixadas no ateliê. */
export interface GalleryItem {
  id: number;
  /** código DV1-… (traços + material + extras) */
  code: string;
  t: number;
}
export interface RoomItem {
  code: string;
  p: [number, number, number];
  q: [number, number, number, number];
  s: number;
  tint: string;
}
export interface DvSave {
  v: 1;
  tut: number;
  stars: Record<string, number>;
  bestInk: Record<string, number>;
  gallery: GalleryItem[];
  room: RoomItem[];
  bums: number;
  nextId: number;
}
const KEY = 'bw-desenho';
const MAX_GALLERY = 40;
let cache: DvSave | null = null;

const fresh = (): DvSave => ({ v: 1, tut: 0, stars: {}, bestInk: {}, gallery: [], room: [], bums: 0, nextId: 1 });

export function dvSave(): DvSave {
  if (cache) return cache;
  const s = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<DvSave>;
      if (typeof o.tut === 'number') s.tut = o.tut;
      if (o.stars && typeof o.stars === 'object') s.stars = o.stars;
      if (o.bestInk && typeof o.bestInk === 'object') s.bestInk = o.bestInk;
      if (Array.isArray(o.gallery)) s.gallery = o.gallery.filter((g) => g && typeof g.code === 'string').slice(0, MAX_GALLERY);
      if (Array.isArray(o.room)) s.room = o.room.filter((g) => g && typeof g.code === 'string').slice(0, 12);
      if (typeof o.bums === 'number') s.bums = o.bums;
      s.nextId = Math.max(typeof o.nextId === 'number' ? o.nextId : 1, ...s.gallery.map((g) => g.id + 1));
    }
  } catch {
    /* corrompido: começa do zero */
  }
  cache = s;
  return s;
}

export function persistDv(): void {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* cheio: tenta sem as criações do ateliê */
    try {
      cache.room = [];
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch {
      /* desiste */
    }
  }
}

export function addToGallery(code: string): GalleryItem | null {
  const s = dvSave();
  if (s.gallery.some((g) => g.code === code)) return null;
  const it = { id: s.nextId++, code, t: Date.now() };
  s.gallery.unshift(it);
  if (s.gallery.length > MAX_GALLERY) s.gallery.length = MAX_GALLERY;
  persistDv();
  return it;
}

export const totalStars = (): number => Object.values(dvSave().stars).reduce((a, b) => a + b, 0);
