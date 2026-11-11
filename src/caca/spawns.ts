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
 * Mapa real (OSM): o bioma vem do USO DO SOLO de verdade (osmdata.ts) — água perto de lagos/rios, planta nos
 * parques, elétrico/som nas ruas; nada em escolas, hospitais, cemitérios nem dentro de prédios; bichinho de água
 * só na beira (alcançável). Parques grandes viram NINHOS: uma família fixa por 2 semanas (+1 aparição).
 * Enquanto o tile do lugar ainda carrega, a célula fica "pendente" (não aparece nada diferente para ninguém).
 *
 * Modo casa / sem GPS: 5 aparições por janela num anel de 20–90 m em volta de um ponto virtual
 * (a partir de uma semente local do aparelho, sem relação com o lugar real).
 */
import { ELEMENTS, SHAPES, genome, withElement, type Element, type Genome, type Shape } from './genome';
import { G_NOSPAWN, G_PARK, G_PLAZA, G_WATER } from './osmdata';
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
  /** id do ninho (parque grande), se nasceu num */
  nest?: string;
}

/* ---------------- uso do solo (plugável) ---------------- */
export interface LandInfo {
  g: number;
  nest: string | null;
  bld: boolean;
}
export interface LandSampler {
  /** null = dados ainda carregando */
  at(lat: number, lon: number): LandInfo | null;
}
let land: LandSampler | null = null;
/** null = mapa procedural (modo casa / sem dados) */
export function setLandSampler(s: LandSampler | null): void {
  land = s;
}
const CODE_BIOME: Record<number, Biome> = { 0: 'cidade', [G_PARK]: 'parque', [G_WATER]: 'agua', [G_PLAZA]: 'praca' };
function landAt(lat: number, lon: number): LandInfo | null {
  if (land) return land.at(lat, lon);
  const b = biomeAtLatLon(lat, lon);
  return { g: b === 'parque' ? G_PARK : b === 'agua' ? G_WATER : b === 'praca' ? G_PLAZA : 0, nest: null, bld: false };
}

export const NEST_MS = 14 * 24 * 3600 * 1000;
/** família do ninho na quinzena (forma × elemento) */
export function nestFamily(nestId: string, ms: number): { element: Element; shape: Shape } {
  const h = hashN(SALT, 'ninho', nestId, Math.floor(ms / NEST_MS));
  return { element: ELEMENTS[h % ELEMENTS.length], shape: SHAPES[(h >>> 8) % SHAPES.length] };
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
/** variações de dia/noite por lugar: vaga-lumes no parque à noite, neon na cidade, gelo na água fria... */
const NIGHT_W: Record<Biome, Partial<Record<Element, number>>> = {
  parque: { luz: 3, sombra: 1 },
  cidade: { eletrico: 2.5, sombra: 1 },
  agua: { gelo: 2, sombra: 1 },
  praca: { som: 2, luz: 1 },
};
const MORNING_W: Record<Biome, Partial<Record<Element, number>>> = {
  parque: { planta: 2, ar: 1 },
  cidade: { terra: 1 },
  agua: { agua: 1.5 },
  praca: { luz: 1 },
};

export function elementWeights(b: Biome, w: Weather, p: DayPart): [Element, number][] {
  const extra = p === 'noite' ? NIGHT_W[b] : p === 'manha' ? MORNING_W[b] : {};
  return ELEMENTS.map((e) => [e, 1 + (BIOME_W[b][e] ?? 0) + (WEATHER_W[w][e] ?? 0) + (PART_W[p][e] ?? 0) + (extra[e] ?? 0)] as [Element, number]);
}

function biomeAtLatLon(lat: number, lon: number): Biome {
  const [x, y] = project(lat, lon, WZ);
  return biomeAtWorld(x, y);
}

function makeSpawn(id: string, base: Seed64, lat: number, lon: number, until: number, w: Weather, p: DayPart, biome = biomeAtLatLon(lat, lon), nest?: { id: string; element: Element; shape: Shape }): Spawn {
  const r = new Rng(base, 5);
  let el = r.weighted(elementWeights(biome, w, p));
  let seed = withElement(base, el);
  let g = genome(seed);
  // ninho: mais da metade das aparições é da família do ninho
  if (nest && hashN(base.hi, 'ninho') % 100 < 55) {
    el = nest.element;
    for (let k = 0; k < 40; k++) {
      const s2 = withElement(k ? seedFrom(base.hi, base.lo, 'ninho', k) : base, el);
      const g2 = genome(s2);
      if (g2.shape === nest.shape || k === 39) {
        seed = s2;
        g = g2;
        if (g2.shape === nest.shape) break;
      }
    }
  }
  const level = Math.min(35, 1 + r.int(8) + g.rarity * 3);
  return { id, lat, lon, seed, g, biome, level, until, nest: nest?.id };
}

/** água só "na beira": algum vizinho a ~30 m não é água (dá para chegar perto) */
function shoreOk(lat: number, lon: number): boolean {
  for (const [e, n] of [[30, 0], [-30, 0], [0, 30], [0, -30]]) {
    const [a, b] = offsetM(lat, lon, e, n);
    const l = landAt(a, b);
    if (l && l.g !== G_WATER) return true;
  }
  return false;
}

/** Aparições da célula (geohash 7) na janela. null = dados do mapa ainda carregando (tenta de novo depois). */
export function cellSpawns(cell: string, win: number, part: DayPart): Spawn[] | null {
  const b = geohashBounds(cell);
  const cLat = (b.latMin + b.latMax) / 2;
  const cLon = (b.lonMin + b.lonMax) / 2;
  const w = weatherAt(cLat, cLon, win * WINDOW_MS);
  const h = hashN(SALT, cell, win);
  // 1–2 por célula; amostra 5 pontos: parque/água ganham +1; ninho +1
  const probes: (LandInfo | null)[] = [];
  for (const [u, v] of [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
    const l = landAt(b.latMin + (b.latMax - b.latMin) * v, b.lonMin + (b.lonMax - b.lonMin) * u);
    if (!l) return null;
    probes.push(l);
  }
  const green = probes.some((l) => l!.g === G_PARK || l!.g === G_WATER);
  const nestId = probes.find((l) => l!.nest)?.nest ?? null;
  const n = 1 + (h % 4 === 0 ? 1 : 0) + (green ? 1 : 0) + (nestId ? 1 : 0);
  const out: Spawn[] = [];
  const until = (win + 1) * WINDOW_MS;
  for (let i = 0; i < n; i++) {
    const base = seedFrom(SALT, cell, win, i);
    // até 6 posições candidatas (determinísticas): pula prédio, área proibida e água longe da beira
    for (let tr = 0; tr < 6; tr++) {
      const u = hashN(base.hi, 'u', tr) / 4294967296;
      const v = hashN(base.lo, 'v', tr) / 4294967296;
      const lat = b.latMin + (b.latMax - b.latMin) * (0.06 + 0.88 * v);
      const lon = b.lonMin + (b.lonMax - b.lonMin) * (0.06 + 0.88 * u);
      const l = landAt(lat, lon);
      if (!l) return null;
      if (l.g === G_NOSPAWN || l.bld) continue;
      if (l.g === G_WATER && !shoreOk(lat, lon)) continue;
      const nest = l.nest ? { id: l.nest, ...nestFamily(l.nest, win * WINDOW_MS) } : undefined;
      out.push(makeSpawn(`${cell}:${win}:${i}`, base, lat, lon, until, w, part, CODE_BIOME[l.g] ?? 'cidade', nest));
      break;
    }
  }
  return out;
}

/** Todas as aparições em volta (3×3 células ≈ 450 m). `pending` = células esperando o mapa. */
export function spawnsAround(lat: number, lon: number, ms: number, part = dayPart(new Date(ms))): Spawn[] & { pending?: number } {
  const win = windowOf(ms);
  const out: Spawn[] & { pending?: number } = [];
  let pending = 0;
  for (const cell of geohashNeighborhood(lat, lon, CELL_PRECISION, 1)) {
    const l = cellSpawns(cell, win, part);
    if (l) out.push(...l);
    else pending++;
  }
  out.pending = pending;
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
    out.push(makeSpawn(`casa:${win}:${i}`, base, lat, lon, (win + 1) * WINDOW_MS, w, part, biomeAtLatLon(lat, lon)));
  }
  return out;
}

export const spawnKey = (s: Spawn): string => s.id + '/' + seedHex(s.seed);
