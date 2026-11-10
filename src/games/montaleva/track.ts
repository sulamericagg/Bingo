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
 *  ['zone', L]       zona de entrega (fim da pista, com parede)
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

export interface Track {
  lines: Pt[][];
  objs: TrackObj[];
  zone: { x0: number; x1: number; y: number };
  wall: { x: number; y0: number; y1: number };
  endX: number;
  minY: number;
  maxY: number;
  killY: number;
}

const PIT = 7;

export function resolveTrack(segs: readonly Seg[], startLen: number): Track {
  const lines: Pt[][] = [];
  const objs: TrackObj[] = [];
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
      case 'g':
        breakLine(s[1], s[2] ?? 0);
        break;
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
        break;
      }
      case 'bridge': {
        const x0 = x;
        breakLine(s[1], 0);
        objs.push({ k: 'bridge', x0, x1: x0 + s[1], y });
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
      case 'zone':
        zone = { x0: x, x1: x + s[1], y };
        to(x + s[1], y);
        break;
    }
  }
  // parede final (lisa, à parte: as rodas não escalam)
  lines.push(cur);
  return { lines, objs, zone, wall: { x, y0: y, y1: y + 3 }, endX: x, minY, maxY, killY: minY - PIT + 1 };
}
