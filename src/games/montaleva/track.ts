/* ============================================================
 *  MONTA & LEVA — pista: mini-linguagem de trechos → geometria (linhas, objetos, zona).
 *  Tudo em metros, y para cima. O veículo nasce em x ∈ [0, W·U] sobre o chão y = 0.
 * ============================================================ */

/** Trechos da pista (em metros):
 *  ['f', L]          plano
 *  ['r', L, dy]      rampa
 *  ['b', L, h]       lombada (cosseno)
 *  ['s', dy]         degrau vertical
 *  ['g', L, dy?]     buraco (o chão volta em y+dy)
 *  ['seesaw', L]     gangorra sobre plano
 *  ['lift', L, dy]   elevador sobre um buraco (sobe quando algo pesa nele)
 *  ['ferry', L]      plataforma que atravessa o buraco quando carregada
 *  ['bridge', L]     ponte de tábuas (física) sobre um buraco
 *  ['gate', L]       plano com barreira que sobe e desce do chão
 *  ['pend', L]       plano com pêndulo balançando por cima
 *  ['boxes', L, n]   plano com n caixotes soltos no caminho
 *  ['ceil', L, h]     plano com teto baixo a h metros do chão
 *  ['water', L, dy?] poço com água (o chão volta em y+dy); quem cai afunda
 *  ['zone', L]       zona de entrega (fim da pista, com parede)
 *  Pista espelhada (mirror): tudo é refletido em torno da área de montagem e o caminho segue para a esquerda.
 */
export type Seg =
  | ['f', number]
  | ['r', number, number]
  | ['b', number, number]
  | ['s', number]
  | ['g', number, number?]
  | ['seesaw', number]
  | ['lift', number, number]
  | ['ferry', number]
  | ['bridge', number]
  | ['gate', number]
  | ['pend', number]
  | ['boxes', number, number]
  | ['ceil', number, number]
  | ['water', number, number?]
  | ['zone', number];

export interface Pt {
  x: number;
  y: number;
}

export type TrackObj =
  | { k: 'seesaw'; x: number; y: number; len: number }
  | { k: 'lift'; x: number; w: number; y0: number; y1: number }
  | { k: 'ferry'; x0: number; x1: number; w: number; y: number }
  | { k: 'bridge'; x0: number; x1: number; y: number }
  | { k: 'gate'; x: number; y: number }
  | { k: 'pend'; x: number; y: number; len: number }
  | { k: 'box'; x: number; y: number; s: number };

export interface Span {
  x0: number;
  x1: number;
  y: number;
}

export interface Track {
  lines: Pt[][];
  objs: TrackObj[];
  zone: { x0: number; x1: number; y: number };
  wall: { x: number; y0: number; y1: number };
  /** tetos: laje com a face de baixo em y */
  ceils: Span[];
  /** poços de água: superfície em y */
  water: Span[];
  /** extremo da pista na direção do caminho (x do fim) */
  endX: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  killY: number;
  /** 1 = para a direita; -1 = espelhada (para a esquerda) */
  dir: 1 | -1;
}

const PIT = 7;

export function resolveTrack(segs: readonly Seg[], startLen: number, mirror = false, wet = false): Track {
  const lines: Pt[][] = [];
  const objs: TrackObj[] = [];
  const ceils: Span[] = [];
  const water: Span[] = [];
  let cur: Pt[] = [
    { x: -4, y: 4 },
    { x: -4, y: 0 },
  ];
  let x = -4;
  let y = 0;
  let minY = 0;
  let maxY = 0;
  const to = (nx: number, ny: number) => {
    x = nx;
    y = ny;
    cur.push({ x, y });
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  };
  const breakLine = (len: number, dy: number) => {
    cur.push({ x, y: y - PIT });
    lines.push(cur);
    x += len;
    y += dy;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    cur = [
      { x, y: y - PIT },
      { x, y },
    ];
  };
  to(startLen, 0);
  let zone = { x0: x, x1: x + 4, y };
  for (const s of segs) {
    switch (s[0]) {
      case 'f':
        to(x + s[1], y);
        break;
      case 'r':
        to(x + s[1], y + s[2]);
        break;
      case 'b': {
        const n = 10;
        const x0 = x;
        const y0 = y;
        for (let i = 1; i <= n; i++) to(x0 + (s[1] * i) / n, y0 + (s[2] * (1 - Math.cos((2 * Math.PI * i) / n))) / 2);
        break;
      }
      case 's':
        to(x, y + s[1]);
        break;
      case 'g': {
        const x0 = x;
        const y0 = y;
        breakLine(s[1], s[2] ?? 0);
        if (wet) water.push({ x0, x1: x0 + s[1], y: Math.min(y0, y) - 1.1 });
        break;
      }
      case 'seesaw': {
        const L = s[1];
        objs.push({ k: 'seesaw', x: x + L / 2, y, len: Math.min(L - 1, 6) });
        to(x + L, y);
        break;
      }
      case 'lift': {
        const x0 = x;
        const y0 = y;
        breakLine(s[1], s[2]);
        objs.push({ k: 'lift', x: x0 + s[1] / 2, w: s[1] - 0.3, y0, y1: y0 + s[2] });
        break;
      }
      case 'ferry': {
        const x0 = x;
        breakLine(s[1], 0);
        const w = 3;
        objs.push({ k: 'ferry', x0: x0 + w / 2 + 0.1, x1: x0 + s[1] - w / 2 - 0.1, w, y });
        if (wet) water.push({ x0, x1: x0 + s[1], y: y - 1.1 });
        break;
      }
      case 'bridge': {
        const x0 = x;
        breakLine(s[1], 0);
        objs.push({ k: 'bridge', x0, x1: x0 + s[1], y });
        if (wet) water.push({ x0, x1: x0 + s[1], y: y - 1.4 });
        break;
      }
      case 'gate':
        objs.push({ k: 'gate', x: x + s[1] / 2, y });
        to(x + s[1], y);
        break;
      case 'pend':
        objs.push({ k: 'pend', x: x + s[1] / 2, y: y + 4.2, len: 3.3 });
        to(x + s[1], y);
        break;
      case 'boxes': {
        const n = s[2];
        for (let i = 0; i < n; i++) objs.push({ k: 'box', x: x + (s[1] * (i + 1)) / (n + 1), y: y + 0.3, s: 0.6 });
        to(x + s[1], y);
        break;
      }
      case 'ceil':
        ceils.push({ x0: x, x1: x + s[1], y: y + s[2] });
        maxY = Math.max(maxY, y + s[2]);
        to(x + s[1], y);
        break;
      case 'water': {
        const x0 = x;
        const y0 = y;
        breakLine(s[1], s[2] ?? 0);
        water.push({ x0, x1: x0 + s[1], y: Math.min(y0, y) - 1.1 });
        break;
      }
      case 'zone':
        zone = { x0: x, x1: x + s[1], y };
        to(x + s[1], y);
        break;
    }
  }
  // parede final (lisa, à parte: as rodas não escalam)
  lines.push(cur);
  const tr: Track = { lines, objs, zone, wall: { x, y0: y, y1: y + 3 }, ceils, water, endX: x, minX: -4, maxX: x + 0.5, minY, maxY, killY: minY - PIT + 1, dir: 1 };
  return mirror ? mirrorTrack(tr, startLen - 1.5) : tr;
}

/** reflete a pista em torno do meio da área de montagem [0, A] */
function mirrorTrack(t: Track, A: number): Track {
  const m = (v: number) => A - v;
  const sp = (s: Span): Span => ({ x0: m(s.x1), x1: m(s.x0), y: s.y });
  const objs: TrackObj[] = t.objs.map((o) => {
    switch (o.k) {
      case 'seesaw':
      case 'gate':
      case 'pend':
      case 'box':
        return { ...o, x: m(o.x) };
      case 'lift':
        return { ...o, x: m(o.x) };
      case 'ferry':
        return { ...o, x0: m(o.x0), x1: m(o.x1) };
      case 'bridge':
        return { ...o, x0: m(o.x1), x1: m(o.x0) };
    }
  });
  return {
    lines: t.lines.map((l) => l.map((p) => ({ x: m(p.x), y: p.y }))),
    objs,
    zone: { x0: m(t.zone.x1), x1: m(t.zone.x0), y: t.zone.y },
    wall: { x: m(t.wall.x) - 0.5, y0: t.wall.y0, y1: t.wall.y1 },
    ceils: t.ceils.map(sp),
    water: t.water.map(sp),
    endX: m(t.endX),
    minX: m(t.maxX),
    maxX: m(t.minX),
    minY: t.minY,
    maxY: t.maxY,
    killY: t.killY,
    dir: -1,
  };
}
