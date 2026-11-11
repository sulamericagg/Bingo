/**
 * CAÇA BLOOP — aparições DETERMINÍSTICAS, calculadas no aparelho (sem servidor).
 *
 *   célula  = geohash precisão 7 (~150 m × 150 m)
 *   janela  = floor(epochMs / 15 min)
 *   semente da aparição i = hash(SAL_GLOBAL, célula, janela, i)  → mesma para todo mundo no mesmo lugar/hora
 *   quantidade por célula = 1..3 (+1 em parque/água), posição dentro da célula pelo hash
 *   elemento = sorteio com pesos (bioma do mapa procedural no ponto + período do dia + "clima" regional)
 *              gravado no nibble baixo da semente → o genoma continua sendo função só da semente.
 *   raridade = só o hash da semente (igual em qualquer lugar — nenhum endereço real fica "mais raro").
 *
 * Modo casa / sem GPS: 5 aparições por janela num anel de 20–90 m em volta de um ponto virtual
 * (a partir de uma semente local do aparelho, sem relação com o lugar real).
 */
import { ELEMENTS, genome, withElement, type Element, type Genome } from './genome';
import { geohashBounds, geohashEncode, geohashNeighborhood, offsetM, project } from './geo';
import { Rng, hashN, seedFrom, seedHex, type Seed64 } from './rng';
import { biomeAtWorld, WZ, type Biome } from './world';

export const SALT = 'bloop-caca-v1';
export const WINDOW_MS = 15 * 60 * 1000;
export const CELL_PRECISION = 7;

export type Weather = 'sol' | 'chuva' | 'vento' | 'nublado' | 'neblina';
export type DayPart = 'manha' | 'tarde' | 'noite';

export interface Spawn {
  id: string;
  lat: number;
  lon: number;
  seed: Seed64;
  g: Genome;
  biome: Biome;
  level: number;
  until: number; // ms (fim da janela)
}

export const windowOf = (ms: number): number => Math.floor(ms / WINDOW_MS);

export function dayPart(d = new Date()): DayPart {
  const h = d.getHours();
  if (h >= 18 || h < 6) return 'noite';
  return h < 12 ? 'manha' : 'tarde';
}

/** "Clima" regional (geohash 4 ≈ 40 km) que muda a cada 3 h — puro hash, não é previsão real. */
export function weatherAt(lat: number, lon: number, ms: number): Weather {
  const h = hashN(SALT, 'clima', geohashEncode(lat, lon, 4), Math.floor(ms / (3 * 3600 * 1000)));
  const W: Weather[] = ['sol', 'sol', 'sol', 'nublado', 'nublado', 'chuva', 'chuva', 'vento', 'vento', 'neblina'];
  return W[h % W.length];
}

const BIOME_W: Record<Biome, Partial<Record<Element, number>>> = {
  agua: { agua: 6, gelo: 3, som: 1 },
  parque: { planta: 5, terra: 2, ar: 2, luz: 1 },
  cidade: { eletrico: 3, som: 2, terra: 1.5, fogo: 1.5 },
  praca: { luz: 3, som: 3, ar: 2 },
};
const WEATHER_W: Record<Weather, Partial<Record<Element, number>>> = {
  sol: { fogo: 2, luz: 2, planta: 1 },
  chuva: { agua: 3, eletrico: 2, planta: 1 },
  vento: { ar: 3, som: 1.5 },
  nublado: { terra: 2, gelo: 1.5, sombra: 1 },
  neblina: { sombra: 3, gelo: 2 },
};
const PART_W: Record<DayPart, Partial<Record<Element, number>>> = {
  manha: { luz: 1.5, planta: 1 },
  tarde: { fogo: 1, som: 1 },
  noite: { sombra: 4, luz: 1.5, som: 1 },
};

export function elementWeights(b: Biome, w: Weather, p: DayPart): [Element, number][] {
  return ELEMENTS.map((e) => [e, 1 + (BIOME_W[b][e] ?? 0) + (WEATHER_W[w][e] ?? 0) + (PART_W[p][e] ?? 0)] as [Element, number]);
}

function biomeAtLatLon(lat: number, lon: number): Biome {
  const [x, y] = project(lat, lon, WZ);
  return biomeAtWorld(x, y);
}

function makeSpawn(id: string, base: Seed64, lat: number, lon: number, until: number, w: Weather, p: DayPart): Spawn {
  const biome = biomeAtLatLon(lat, lon);
  const r = new Rng(base, 5);
  const el = r.weighted(elementWeights(biome, w, p));
  const seed = withElement(base, el);
  const g = genome(seed);
  const level = Math.min(35, 1 + r.int(8) + g.rarity * 3);
  return { id, lat, lon, seed, g, biome, level, until };
}

/** Aparições da célula (geohash 7) na janela. */
export function cellSpawns(cell: string, win: number, part: DayPart): Spawn[] {
  const b = geohashBounds(cell);
  const cLat = (b.latMin + b.latMax) / 2;
  const cLon = (b.lonMin + b.lonMax) / 2;
  const w = weatherAt(cLat, cLon, win * WINDOW_MS);
  const h = hashN(SALT, cell, win);
  const bio = biomeAtLatLon(cLat, cLon);
  const n = 1 + (h % 3) + (bio === 'parque' || bio === 'agua' ? 1 : 0);
  const out: Spawn[] = [];
  const until = (win + 1) * WINDOW_MS;
  for (let i = 0; i < n; i++) {
    const base = seedFrom(SALT, cell, win, i);
    const u = hashN(base.hi, 'u') / 4294967296;
    const v = hashN(base.lo, 'v') / 4294967296;
    const lat = b.latMin + (b.latMax - b.latMin) * (0.08 + 0.84 * v);
    const lon = b.lonMin + (b.lonMax - b.lonMin) * (0.08 + 0.84 * u);
    out.push(makeSpawn(`${cell}:${win}:${i}`, base, lat, lon, until, w, part));
  }
  return out;
}

/** Todas as aparições em volta (3×3 células ≈ 450 m). */
export function spawnsAround(lat: number, lon: number, ms: number, part = dayPart(new Date(ms))): Spawn[] {
  const win = windowOf(ms);
  const out: Spawn[] = [];
  for (const cell of geohashNeighborhood(lat, lon, CELL_PRECISION, 1)) out.push(...cellSpawns(cell, win, part));
  return out;
}

/** Ponto virtual do modo casa (não tem relação com o lugar real do jogador). */
export function homeOrigin(homeSeed: string): [number, number] {
  const h1 = hashN(SALT, 'casa-lat', homeSeed) / 4294967296;
  const h2 = hashN(SALT, 'casa-lon', homeSeed) / 4294967296;
  return [-35 + h1 * 70, -170 + h2 * 340];
}

/** Modo casa: aparições em anel em volta do ponto virtual. */
export function homeSpawns(homeSeed: string, ms: number, part = dayPart(new Date(ms))): Spawn[] {
  const win = windowOf(ms);
  const [lat0, lon0] = homeOrigin(homeSeed);
  const w = weatherAt(lat0, lon0, ms);
  const out: Spawn[] = [];
  for (let i = 0; i < 5; i++) {
    const base = seedFrom(SALT, 'casa', homeSeed, win, i);
    const a = (hashN(base.hi, 'a') / 4294967296) * Math.PI * 2;
    const d = 20 + (hashN(base.lo, 'd') / 4294967296) * 70;
    const [lat, lon] = offsetM(lat0, lon0, Math.cos(a) * d, Math.sin(a) * d);
    out.push(makeSpawn(`casa:${win}:${i}`, base, lat, lon, (win + 1) * WINDOW_MS, w, part));
  }
  return out;
}

export const spawnKey = (s: Spawn): string => s.id + '/' + seedHex(s.seed);
