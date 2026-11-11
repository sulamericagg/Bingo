/**
 * Arquétipos do gerador do OBJETO FALADO: cada um monta um modelo bonitinho com poucos parâmetros
 * (bicho de 4 patas, ave, peixe, inseto, carro, barco, casa, comida...). O catálogo (concepts.ts)
 * diz qual arquétipo + parâmetros + cores cada palavra usa. Frente = +z, chão = y 0, metros.
 */
import { ball, box, cap, cone, cyl, eyes, joint, mat, ring, rotor, wedge, wheel, wing, type GPart, type Slot } from './kit';
import type { V3 } from '../cavaspec';

export type Opts = Record<string, number | string | boolean | undefined>;
export type Builder = (o: Opts, r: () => number) => GPart[];
const n = (o: Opts, k: string, d: number) => (typeof o[k] === 'number' ? (o[k] as number) : d);
const s = (o: Opts, k: string, d: string) => (typeof o[k] === 'string' ? (o[k] as string) : d);
const b = (o: Opts, k: string) => o[k] === true;

/* ================================ BICHOS ================================ */
const walkLeg = (p: GPart, top: number, ph: number, sp = 2.2, sw = 22): GPart => joint(p, 'hinge', 'x', sp * ph, sw, [p.pos[0], top, p.pos[2]]);

function ears(kind: string, hx: number, hy: number, hz: number, hs: number, col: Slot): GPart[] {
  const o: GPart[] = [];
  for (const sd of [-1, 1]) {
    if (kind === 'pointy') o.push(cone(hs * 0.32, hs * 0.42, hx + sd * hs * 0.28, hy + hs * 0.48, hz - hs * 0.05, col, 'head', [0, 0, -sd * 12]));
    else if (kind === 'round') o.push(ball(hs * 0.3, hs * 0.3, hs * 0.12, hx + sd * hs * 0.34, hy + hs * 0.42, hz - hs * 0.05, col, 'head'));
    else if (kind === 'long') o.push(cap(hs * 0.2, hs * 0.85, hx + sd * hs * 0.18, hy + hs * 0.8, hz - hs * 0.1, col, 'head', [0, 0, -sd * 8]));
    else if (kind === 'floppy') o.push(ball(hs * 0.18, hs * 0.55, hs * 0.3, hx + sd * hs * 0.5, hy + hs * 0.05, hz - hs * 0.05, col, 'head', [0, 0, sd * 15]));
    else if (kind === 'big') o.push(ball(hs * 0.12, hs * 0.9, hs * 0.8, hx + sd * hs * 0.6, hy + hs * 0.05, hz - hs * 0.15, col, 'head', [0, sd * 20, 0]));
  }
  return o;
}

/** bicho de 4 patas (cachorro, gato, vaca, leão, elefante, girafa...) */
export const quad: Builder = (o) => {
  const L = n(o, 'L', 1.6),
    H = n(o, 'H', 0.85),
    W = n(o, 'W', 0.8),
    leg = n(o, 'leg', 0.55),
    hs = n(o, 'head', 0.72),
    neck = n(o, 'neck', 0),
    sn = n(o, 'snout', 0.32);
  const y = leg + H * 0.42;
  const p: GPart[] = [];
  p.push(ball(W, H, L, 0, y, 0, 'a', 'body'));
  if (!b(o, 'noBelly')) p.push(ball(W * 0.82, H * 0.55, L * 0.72, 0, y - H * 0.2, 0.04, 'b', 'deco'));
  const legH = leg + H * 0.3;
  const ld = n(o, 'legW', Math.max(0.16, W * 0.28));
  let ph = 1;
  for (const [x, z] of [
    [-1, 1],
    [1, -1],
    [1, 1],
    [-1, -1],
  ]) {
    p.push(walkLeg(cyl(ld, legH, x * W * 0.3, legH / 2, z * L * 0.3, s(o, 'legCol', 'a') as Slot, 'leg'), legH, ph));
    ph = -ph;
  }
  let hz = L * 0.5 + hs * 0.12,
    hy = y + H * 0.32;
  if (neck > 0) {
    p.push(cyl(hs * 0.42, neck, 0, y + H * 0.3 + neck / 2, L * 0.4, 'a', 'body', [-14, 0, 0]));
    hy = y + H * 0.3 + neck;
    hz = L * 0.42 + neck * 0.24 + hs * 0.2;
  }
  p.push(ball(hs, hs * 0.92, hs * 0.92, 0, hy, hz, 'a', 'head'));
  if (sn > 0) {
    p.push(ball(hs * 0.56, hs * 0.42, sn + hs * 0.2, 0, hy - hs * 0.16, hz + hs * 0.36, 'b', 'head'));
    p.push(ball(hs * 0.2, hs * 0.14, hs * 0.12, 0, hy - hs * 0.06, hz + hs * 0.36 + (sn + hs * 0.2) / 2, 'black', 'head'));
  }
  p.push(...eyes(hy + hs * 0.14, hz + hs * 0.34, hs * 0.2, hs * 0.24));
  p.push(...ears(s(o, 'ears', 'pointy'), 0, hy, hz, hs, s(o, 'earCol', 'a') as Slot));
  const tail = s(o, 'tail', 'thin');
  const tl = n(o, 'tailL', L * 0.5);
  if (tail === 'thin') p.push(joint(cyl(hs * 0.12, tl, 0, y + H * 0.2 + tl * 0.3, -L * 0.5 - tl * 0.3, 'a', 'tail', [-50, 0, 0]), 'hinge', 'y', 2, 20, [0, y + H * 0.2, -L * 0.48]));
  else if (tail === 'fluffy') p.push(joint(ball(hs * 0.5, hs * 0.5, tl, 0, y + H * 0.35, -L * 0.5 - tl * 0.3, s(o, 'tailCol', 'b') as Slot, 'tail', [-30, 0, 0]), 'hinge', 'y', 1.5, 18, [0, y, -L * 0.45]));
  else if (tail === 'stub') p.push(ball(hs * 0.35, hs * 0.35, hs * 0.35, 0, y + H * 0.2, -L * 0.5, s(o, 'tailCol', 'b') as Slot, 'tail'));
  else if (tail === 'long') p.push(cone(H * 0.5, tl, 0, y - H * 0.05, -L * 0.5 - tl * 0.4, 'a', 'tail', [-90, 0, 0]));
  else if (tail === 'tuft') {
    p.push(cyl(hs * 0.1, tl, 0, y + H * 0.1, -L * 0.5 - tl * 0.35, 'a', 'tail', [-60, 0, 0]));
    p.push(ball(hs * 0.28, hs * 0.28, hs * 0.28, 0, y - H * 0.05 + tl * 0.05, -L * 0.5 - tl * 0.75, 'c', 'tail'));
  }
  // extras
  const horn = s(o, 'horn', '');
  if (horn === 'uni') p.push(mat(cone(hs * 0.18, hs * 0.7, 0, hy + hs * 0.62, hz + hs * 0.2, 'gold', 'deco', [20, 0, 0]), 'glow'));
  if (horn === 'two') for (const sd of [-1, 1]) p.push(cone(hs * 0.16, hs * 0.45, sd * hs * 0.3, hy + hs * 0.55, hz, 'cream', 'deco', [0, 0, -sd * 25]));
  if (horn === 'nose') p.push(cone(hs * 0.3, hs * 0.55, 0, hy, hz + hs * 0.75, 'cream', 'deco', [70, 0, 0]));
  if (horn === 'antler') for (const sd of [-1, 1]) p.push(cone(hs * 0.14, hs * 0.8, sd * hs * 0.35, hy + hs * 0.75, hz - hs * 0.1, 'brown', 'deco', [0, 0, -sd * 30]));
  if (b(o, 'trunk')) p.push(joint(cyl(hs * 0.24, hs * 0.9, 0, hy - hs * 0.45, hz + hs * 0.55, 'a', 'head', [25, 0, 0]), 'hinge', 'x', 1.2, 14, [0, hy - hs * 0.1, hz + hs * 0.45]));
  if (b(o, 'tusks')) for (const sd of [-1, 1]) p.push(cone(hs * 0.1, hs * 0.4, sd * hs * 0.22, hy - hs * 0.4, hz + hs * 0.5, 'cream', 'deco', [-60, 0, 0]));
  if (b(o, 'mane')) p.push(ball(hs * 1.45, hs * 1.4, hs * 0.75, 0, hy + hs * 0.05, hz - hs * 0.22, 'c', 'deco'));
  if (b(o, 'shell')) p.push(ball(W * 1.2, H * 1.0, L * 0.95, 0, y + H * 0.22, 0, 'c', 'deco'));
  if (b(o, 'spots')) for (let i = 0; i < 3; i++) p.push(ball(W * 0.36, H * 0.36, L * 0.22, (i - 1) * W * 0.3, y + H * 0.38, (i - 1) * L * 0.25, 'c', 'deco'));
  if (b(o, 'stripes')) for (let i = 0; i < 3; i++) p.push(box(W * 1.02, H * 0.9, L * 0.06, 0, y + H * 0.05, (i - 1) * L * 0.24, 'c', 'deco'));
  if (b(o, 'hump')) p.push(ball(W * 0.7, H * 0.7, L * 0.4, 0, y + H * 0.45, -L * 0.05, 'a', 'body'));
  if (b(o, 'spikes')) for (let i = 0; i < 4; i++) p.push(cone(H * 0.25, H * 0.35, 0, y + H * 0.5, (1.5 - i) * L * 0.2, 'c', 'deco'));
  if (b(o, 'quills')) for (let i = 0; i < 5; i++) p.push(cone(H * 0.22, H * 0.55, (i % 2 ? 1 : -1) * W * 0.2, y + H * 0.45, (2 - i) * L * 0.16, 'c', 'deco', [-35, 0, 0]));
  return p;
};

/** bicho em pé (urso de pelúcia, macaco, pinguim, dinossauro rex, monstro...) */
export const biped: Builder = (o) => {
  const H = n(o, 'H', 1.0),
    W = n(o, 'W', 0.8),
    leg = n(o, 'leg', 0.45),
    hs = n(o, 'head', 0.75),
    arm = n(o, 'arm', 0.55);
  const p: GPart[] = [];
  const y = leg + H / 2;
  p.push(ball(W, H, W * 0.85, 0, y, 0, 'a', 'body'));
  p.push(ball(W * 0.66, H * 0.62, W * 0.4, 0, y - H * 0.08, W * 0.28, 'b', 'deco'));
  let ph = 1;
  for (const sd of [-1, 1]) {
    p.push(walkLeg(cyl(W * 0.3, leg + 0.12, sd * W * 0.24, (leg + 0.12) / 2, 0, 'a', 'leg'), leg + 0.1, ph));
    p.push(ball(W * 0.34, W * 0.16, W * 0.48, sd * W * 0.24, 0.07, W * 0.08, 'b', 'leg'));
    if (arm > 0) p.push(joint(cap(W * 0.22, arm, sd * W * 0.55, y + H * 0.1, 0, 'a', 'arm', [0, 0, sd * 25]), 'hinge', 'x', 1.6 * ph, 25, [sd * W * 0.45, y + H * 0.3, 0]));
    ph = -ph;
  }
  const hy = y + H / 2 + hs * 0.36,
    hz = n(o, 'headZ', 0);
  p.push(ball(hs, hs * 0.94, hs * 0.9, 0, hy, hz, 'a', 'head'));
  const sn = n(o, 'snout', 0.25);
  if (sn > 0) {
    p.push(ball(hs * 0.5, hs * 0.38, sn + hs * 0.2, 0, hy - hs * 0.15, hz + hs * 0.38, 'b', 'head'));
    p.push(ball(hs * 0.18, hs * 0.12, hs * 0.1, 0, hy - hs * 0.06, hz + hs * 0.38 + (sn + hs * 0.2) / 2, 'black', 'head'));
  }
  p.push(...eyes(hy + hs * 0.14, hz + hs * 0.36, hs * 0.2, hs * 0.23));
  p.push(...ears(s(o, 'ears', 'round'), 0, hy, hz, hs, 'a'));
  const tail = s(o, 'tail', 'none');
  if (tail === 'long') p.push(cone(H * 0.5, H * 1.2, 0, y - H * 0.15, -W * 0.5 - H * 0.45, 'a', 'tail', [-100, 0, 0]));
  if (tail === 'thin') p.push(joint(cyl(0.08, H * 0.9, 0, y, -W * 0.55, 'a', 'tail', [-40, 0, 0]), 'hinge', 'y', 2, 20, [0, y - H * 0.3, -W * 0.4]));
  if (b(o, 'beak')) p.push(cone(hs * 0.3, hs * 0.35, 0, hy - hs * 0.08, hz + hs * 0.55, 'orange', 'head', [90, 0, 0]));
  if (b(o, 'spikes')) for (let i = 0; i < 4; i++) p.push(cone(H * 0.2, H * 0.3, 0, y + H * 0.4 - i * H * 0.25, -W * 0.4, 'c', 'deco', [-90, 0, 0]));
  if (b(o, 'antenna')) for (const sd of [-1, 1]) p.push(mat(ball(hs * 0.16, hs * 0.16, hs * 0.16, sd * hs * 0.3, hy + hs * 0.85, hz, 'c', 'deco'), 'glow'), cyl(0.05, hs * 0.5, sd * hs * 0.25, hy + hs * 0.6, hz, 'c', 'deco', [0, 0, -sd * 15]));
  if (b(o, 'horns')) for (const sd of [-1, 1]) p.push(cone(hs * 0.18, hs * 0.4, sd * hs * 0.32, hy + hs * 0.55, hz, 'cream', 'deco', [0, 0, -sd * 20]));
  return p;
};

/** ave (passarinho, galinha, pato, coruja, papagaio, pinguim...) */
export const bird: Builder = (o) => {
  const L = n(o, 'L', 1.1),
    H = n(o, 'H', 0.9),
    hs = n(o, 'head', 0.62),
    leg = n(o, 'leg', 0.35),
    span = n(o, 'span', 0.9);
  const p: GPart[] = [];
  const y = leg + H / 2;
  p.push(ball(H * 0.85, H, L, 0, y, 0, 'a', 'body'));
  p.push(ball(H * 0.62, H * 0.7, L * 0.55, 0, y - H * 0.08, L * 0.24, 'b', 'deco'));
  const hy = y + H * 0.42,
    hz = L * 0.36;
  p.push(ball(hs, hs, hs, 0, hy, hz, s(o, 'headCol', 'a') as Slot, 'head'));
  p.push(cone(hs * 0.3, hs * n(o, 'beak', 0.42), 0, hy - hs * 0.08, hz + hs * 0.6, s(o, 'beakCol', 'orange') as Slot, 'head', [90, 0, 0]));
  p.push(...eyes(hy + hs * 0.12, hz + hs * 0.36, hs * 0.22, hs * 0.26));
  for (const sd of [-1, 1]) {
    p.push(wing(sd, sd * H * 0.36, y + H * 0.1, -L * 0.02, span, L * 0.62, s(o, 'wingCol', 'c') as Slot, n(o, 'flap', 1.4), n(o, 'swing', 30)));
    p.push(cyl(0.07, leg + 0.1, sd * H * 0.18, (leg + 0.1) / 2, 0, s(o, 'beakCol', 'orange') as Slot, 'leg'));
    p.push(ball(0.2, 0.06, 0.26, sd * H * 0.18, 0.03, 0.08, s(o, 'beakCol', 'orange') as Slot, 'leg'));
  }
  const tail = s(o, 'tail', 'fan');
  if (tail === 'fan') p.push(wedge(H * 0.6, H * 0.5, L * 0.35, 0, y + H * 0.1, -L * 0.55, 'c', 'tail', [25, 0, 0]));
  if (tail === 'long') p.push(box(H * 0.3, 0.08, L * 0.9, 0, y - H * 0.05, -L * 0.85, 'c', 'tail', [-10, 0, 0]));
  if (tail === 'peacock') for (let i = 0; i < 5; i++) p.push(ball(0.45, 1.3, 0.12, (i - 2) * 0.42, y + H * 0.7, -L * 0.6, i % 2 ? 'teal' : 'green', 'tail', [0, 0, (i - 2) * -20]));
  if (b(o, 'crest')) p.push(cone(hs * 0.3, hs * 0.45, 0, hy + hs * 0.6, hz - hs * 0.1, 'red', 'deco'));
  if (b(o, 'comb')) p.push(ball(hs * 0.15, hs * 0.4, hs * 0.5, 0, hy + hs * 0.55, hz, 'red', 'deco'));
  if (b(o, 'tufts')) for (const sd of [-1, 1]) p.push(cone(hs * 0.22, hs * 0.35, sd * hs * 0.3, hy + hs * 0.55, hz, 'a', 'deco'));
  return p;
};

/** peixe / bicho do mar */
export const fish: Builder = (o) => {
  const L = n(o, 'L', 2),
    H = n(o, 'H', 1),
    W = n(o, 'W', 0.6);
  const p: GPart[] = [];
  const y = H * 0.6;
  p.push(ball(W, H, L, 0, y, 0, 'a', 'body'));
  p.push(ball(W * 0.85, H * 0.5, L * 0.7, 0, y - H * 0.22, L * 0.05, 'b', 'deco'));
  p.push(joint(wedge(0.12, H * n(o, 'tailH', 0.9), L * 0.32, 0, y, -L * 0.6, 'c', 'tail', [0, 180, 0]), 'hinge', 'y', 2.2, 22, [0, y, -L * 0.45]));
  if (!b(o, 'noFin')) p.push(wedge(0.1, H * n(o, 'fin', 0.45), L * 0.3, 0, y + H * 0.55, -L * 0.05, 'c', 'deco', [0, 180, 0]));
  for (const sd of [-1, 1]) p.push(joint(ball(W * 0.5, 0.08, L * 0.2, sd * W * 0.55, y - H * 0.1, L * 0.12, 'c', 'deco'), 'hinge', 'z', 2 * sd, 20, [sd * W * 0.4, y - H * 0.1, L * 0.12]));
  p.push(...eyes(y + H * 0.15, L * 0.38, W * 0.38, H * 0.24));
  if (b(o, 'teeth')) for (let i = 0; i < 3; i++) p.push(cone(0.1, 0.14, (i - 1) * W * 0.18, y - H * 0.16, L * 0.47, 'white', 'deco', [180, 0, 0]));
  if (b(o, 'spout')) p.push(mat(cyl(0.2, 0.6, 0, y + H * 0.75, L * 0.15, 'sky', 'deco'), 'glass'));
  return p;
};

/** inseto (abelha, joaninha, borboleta, formiga, aranha) */
export const bug: Builder = (o) => {
  const L = n(o, 'L', 1.4),
    H = n(o, 'H', 0.7),
    legs = n(o, 'legs', 6);
  const p: GPart[] = [];
  const y = 0.3 + H / 2;
  p.push(ball(H * 1.1, H, L * 0.6, 0, y, -L * 0.18, 'a', 'body'));
  p.push(ball(H * 0.75, H * 0.75, L * 0.3, 0, y, L * 0.2, 'b', 'body'));
  p.push(ball(H * 0.7, H * 0.7, H * 0.7, 0, y + H * 0.08, L * 0.42, 'b', 'head'));
  p.push(...eyes(y + H * 0.2, L * 0.42 + H * 0.3, H * 0.17, H * 0.22));
  for (const sd of [-1, 1]) p.push(cyl(0.05, H * 0.8, sd * H * 0.2, y + H * 0.6, L * 0.48, 'black', 'deco', [25, 0, -sd * 25]));
  const per = Math.min(3, legs / 2);
  for (let i = 0; i < per; i++)
    for (const sd of [-1, 1]) p.push(walkLeg(cyl(0.08, H * 0.85, sd * H * 0.55, 0.35, L * (0.22 - i * 0.18), 'black', 'leg', [0, 0, sd * 40]), 0.6, sd * (i % 2 ? 1 : -1), 3, 18));
  const w = s(o, 'wings', '');
  if (w === 'clear') for (const sd of [-1, 1]) p.push(mat(wing(sd, sd * H * 0.2, y + H * 0.45, 0, L * 0.55, L * 0.4, 'sky', 6, 25), 'glass'));
  if (w === 'big') for (const sd of [-1, 1]) p.push(wing(sd, sd * H * 0.15, y + H * 0.3, 0, L * 1.1, L * 0.95, 'c', 1.4, 35));
  if (b(o, 'stripes')) for (let i = 0; i < 2; i++) p.push(ball(H * 1.12, H * 1.02, L * 0.08, 0, y, -L * 0.1 - i * L * 0.18, 'black', 'deco'));
  if (b(o, 'dots')) for (const [x, z] of [[-0.3, -0.05], [0.3, -0.3], [0.05, -0.45]]) p.push(ball(H * 0.28, H * 0.12, H * 0.28, x * H, y + H * 0.45, z * L, 'black', 'deco'));
  if (b(o, 'stinger')) p.push(cone(0.14, 0.3, 0, y, -L * 0.52, 'black', 'deco', [-90, 0, 0]));
  return p;
};

/** cobra / minhoca / lagarta (corrente de bolinhas) */
export const snake: Builder = (o) => {
  const k = n(o, 'seg', 7),
    r = n(o, 'R', 0.55),
    wave = n(o, 'wave', 0.45);
  const p: GPart[] = [];
  for (let i = 0; i < k; i++) {
    const z = (i - k + 1) * r * 0.78;
    p.push(ball(r * (0.7 + (0.3 * i) / k), r * (0.7 + (0.3 * i) / k), r, Math.sin(i * 1.1) * wave, r * 0.45, z, i % 2 && b(o, 'bands') ? 'b' : 'a', 'body'));
  }
  const hz = r * 0.5;
  p.push(ball(r * 1.2, r * 1.05, r * 1.15, 0, r * 0.6, hz, 'a', 'head'));
  p.push(...eyes(r * 0.95, hz + r * 0.45, r * 0.26, r * 0.32));
  if (b(o, 'tongue')) p.push(box(0.06, 0.04, r * 0.6, 0, r * 0.4, hz + r * 0.8, 'red', 'deco'));
  if (b(o, 'feet')) for (let i = 1; i < k; i += 2) for (const sd of [-1, 1]) p.push(ball(0.15, 0.2, 0.15, sd * r * 0.55, 0.1, (i - k + 1) * r * 0.78, 'b', 'leg'));
  if (b(o, 'shell')) p.push(ball(r * 2, r * 2.2, r * 2, 0, r * 1.5, -r * 1.5, 'c', 'deco'));
  return p;
};

/** dragão (bicho de 4 patas + asas que batem + espinhos) */
export const dragon: Builder = (o, r) => {
  const p = quad({ L: 2.2, H: 1.1, W: 1.0, leg: 0.6, head: 0.95, neck: 0.7, snout: 0.45, ears: 'none', tail: 'long', tailL: 1.8, spikes: true, horn: 'two', ...o }, r);
  for (const sd of [-1, 1]) p.push(wing(sd, sd * 0.4, 1.7, 0, n(o, 'span', 2.1), 1.5, 'c', 1.2, 30));
  return p;
};

/* ================================ VEÍCULOS ================================ */
export const car: Builder = (o) => {
  const L = n(o, 'L', 3),
    W = n(o, 'W', 1.6),
    H = n(o, 'H', 0.7),
    wd = n(o, 'wheel', 0.75),
    cab = n(o, 'cab', 0.65);
  const p: GPart[] = [];
  const y = wd * 0.55 + H / 2;
  p.push(box(W, H, L, 0, y, 0, 'a', 'body'));
  p.push(wedge(W * 0.98, H * 0.5, L * 0.18, 0, y + H * 0.38, L * 0.4, 'a', 'body', [0, 0, 0]));
  if (cab > 0) {
    p.push(box(W * 0.86, cab, L * 0.46, 0, y + H / 2 + cab / 2, -L * 0.08, 'b', 'body'));
    p.push(mat(box(W * 0.8, cab * 0.66, 0.08, 0, y + H / 2 + cab * 0.48, L * 0.155, 'sky', 'deco'), 'glass'));
    for (const sd of [-1, 1]) p.push(mat(box(0.06, cab * 0.6, L * 0.34, sd * W * 0.43, y + H / 2 + cab * 0.5, -L * 0.08, 'sky', 'deco'), 'glass'));
  }
  for (const sd of [-1, 1]) p.push(mat(ball(0.24, 0.2, 0.1, sd * W * 0.32, y + H * 0.1, L / 2 + 0.02, 'yellow', 'light'), 'glow'));
  p.push(box(W * 1.04, 0.16, 0.18, 0, y - H * 0.35, L / 2, 'silver', 'deco', undefined, 'metal'));
  for (const [x, z] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ])
    p.push(...wheel(x * (W / 2 + 0.08), wd / 2, z * L * 0.32, wd, 0.32));
  return p;
};
export const truck: Builder = (o) => {
  const p: GPart[] = [];
  const L = n(o, 'L', 4.2),
    W = n(o, 'W', 1.8),
    wd = n(o, 'wheel', 0.85);
  p.push(box(W, 1.3, 1.3, 0, wd * 0.5 + 0.9, L / 2 - 0.65, 'a', 'body'));
  p.push(mat(box(W * 0.9, 0.55, 0.08, 0, wd * 0.5 + 1.2, L / 2, 'sky', 'deco'), 'glass'));
  p.push(box(W, 0.3, L, 0, wd * 0.5 + 0.2, 0, 'gray', 'base', undefined, 'metal'));
  const cargo = s(o, 'cargo', 'box');
  if (cargo === 'box') p.push(box(W * 1.02, 1.6, L * 0.62, 0, wd * 0.5 + 1.15, -L * 0.18, 'b', 'body'));
  if (cargo === 'tank') p.push(cyl(W * 0.95, L * 0.6, 0, wd * 0.5 + 1.1, -L * 0.18, 'b', 'body', [90, 0, 0], 'metal'));
  if (cargo === 'ladder') p.push(box(0.5, 0.2, L * 0.9, 0, wd * 0.5 + 1.8, -L * 0.1, 'silver', 'deco', [-8, 0, 0], 'metal'));
  if (cargo === 'mixer') p.push(joint(cap(W * 0.9, L * 0.55, 0, wd * 0.5 + 1.2, -L * 0.18, 'b', 'body', [80, 0, 0]), 'spin', 'z', 0.5));
  if (cargo === 'open') for (const sd of [-1, 1]) p.push(box(0.1, 0.6, L * 0.6, sd * W * 0.48, wd * 0.5 + 0.6, -L * 0.18, 'b', 'body'));
  if (b(o, 'siren')) p.push(mat(box(W * 0.6, 0.2, 0.3, 0, wd * 0.5 + 1.65, L / 2 - 0.65, 'red', 'light'), 'glow'));
  for (const sd of [-1, 1]) p.push(mat(ball(0.24, 0.24, 0.1, sd * W * 0.32, wd * 0.5 + 0.55, L / 2 + 0.02, 'yellow', 'light'), 'glow'));
  for (const z of [L * 0.34, -L * 0.1, -L * 0.36]) for (const sd of [-1, 1]) p.push(joint(cyl(wd, 0.35, sd * (W / 2 + 0.08), wd / 2, z, 'black', 'wheel', [0, 0, 90], 'rubber'), 'wheel', 'x', 1));
  return p;
};
export const bus: Builder = (o) => {
  const L = n(o, 'L', 5.2),
    W = n(o, 'W', 2),
    H = n(o, 'H', 1.9),
    wd = 0.8;
  const p: GPart[] = [box(W, H, L, 0, wd * 0.4 + H / 2, 0, 'a', 'body')];
  for (const sd of [-1, 1]) p.push(mat(box(0.06, H * 0.35, L * 0.8, sd * W * 0.5, wd * 0.4 + H * 0.7, -0.1, 'sky', 'deco'), 'glass'));
  p.push(mat(box(W * 0.85, H * 0.38, 0.06, 0, wd * 0.4 + H * 0.68, L / 2, 'sky', 'deco'), 'glass'));
  p.push(box(W * 1.01, 0.18, L * 1.01, 0, wd * 0.4 + H * 0.35, 0, 'b', 'deco'));
  for (const sd of [-1, 1]) p.push(mat(ball(0.25, 0.25, 0.1, sd * W * 0.35, wd * 0.4 + H * 0.2, L / 2 + 0.02, 'yellow', 'light'), 'glow'));
  for (const z of [L * 0.33, -L * 0.33]) for (const sd of [-1, 1]) p.push(...wheel(sd * (W / 2), wd / 2, z, wd, 0.3));
  return p;
};
export const train: Builder = (o) => {
  const L = n(o, 'L', 4),
    W = n(o, 'W', 1.6),
    wd = 0.8;
  const p: GPart[] = [];
  p.push(box(W, 0.5, L, 0, wd * 0.5 + 0.25, 0, 'black', 'base', undefined, 'metal'));
  p.push(cyl(W * 0.9, L * 0.6, 0, wd * 0.5 + 1.05, L * 0.18, 'a', 'body', [90, 0, 0]));
  p.push(box(W, 1.7, L * 0.38, 0, wd * 0.5 + 1.35, -L * 0.3, 'b', 'body'));
  p.push(box(W * 1.1, 0.16, L * 0.45, 0, wd * 0.5 + 2.25, -L * 0.3, 'c', 'roof'));
  p.push(cyl(0.45, 0.8, 0, wd * 0.5 + 1.85, L * 0.38, 'black', 'deco'));
  p.push(cone(0.9, 0.35, 0, wd * 0.5 + 2.35, L * 0.38, 'black', 'deco', [180, 0, 0]));
  p.push(mat(ball(0.4, 0.4, 0.12, 0, wd * 0.5 + 1.05, L / 2 - 0.08, 'yellow', 'light'), 'glow'));
  p.push(wedge(W, 0.5, 0.6, 0, wd * 0.5 + 0.25, L / 2 + 0.25, 'red', 'deco', [0, 180, 0]));
  for (const z of [L * 0.32, 0, -L * 0.32]) for (const sd of [-1, 1]) p.push(joint(cyl(wd, 0.25, sd * (W / 2 + 0.05), wd / 2, z, 'red', 'wheel', [0, 0, 90], 'metal'), 'wheel', 'x', 1));
  return p;
};
export const plane: Builder = (o) => {
  const L = n(o, 'L', 4),
    span = n(o, 'span', 5),
    d = n(o, 'D', 0.9);
  const p: GPart[] = [];
  const y = 1.1;
  p.push(cap(d, L, 0, y, 0, 'a', 'body', [90, 0, 0]));
  p.push(box(span, 0.14, 1.1, 0, y - 0.1, 0.2, 'b', 'wing'));
  p.push(box(span * 0.36, 0.1, 0.6, 0, y + 0.1, -L / 2 + 0.25, 'b', 'wing'));
  p.push(wedge(0.12, 1, 0.9, 0, y + 0.7, -L / 2 + 0.35, 'c', 'tail', [0, 180, 0]));
  p.push(mat(ball(d * 0.7, d * 0.55, d * 1.1, 0, y + d * 0.42, L * 0.18, 'sky', 'deco'), 'glass'));
  p.push(...rotor(0, y, L / 2 + 0.12, 1.8, 'gray', 'z'));
  for (const sd of [-1, 1]) {
    p.push(cyl(0.08, 0.8, sd * 0.6, 0.45, L * 0.18, 'gray', 'leg', undefined, 'metal'));
    p.push(joint(cyl(0.45, 0.18, sd * 0.6, 0.22, L * 0.18, 'black', 'wheel', [0, 0, 90], 'rubber'), 'wheel', 'x', 1));
  }
  return p;
};
export const heli: Builder = () => {
  const p: GPart[] = [ball(1.6, 1.5, 2.2, 0, 1.2, 0.2, 'a', 'body')];
  p.push(mat(ball(1.3, 1.0, 1.0, 0, 1.4, 0.85, 'sky', 'deco'), 'glass'));
  p.push(cyl(0.3, 2.6, 0, 1.4, -1.9, 'a', 'body', [90, 0, 0]));
  p.push(wedge(0.12, 0.8, 0.6, 0, 1.75, -3.1, 'b', 'tail', [0, 180, 0]));
  p.push(...rotor(0, 2.2, 0.2, 4.2, 'gray', 'y'));
  p.push(cyl(0.12, 0.35, 0, 2.0, 0.2, 'gray', 'deco'));
  p.push(...rotor(0.2, 1.6, -3.2, 0.9, 'gray', 'x'));
  for (const sd of [-1, 1]) p.push(box(0.12, 0.12, 2.4, sd * 0.7, 0.1, 0.1, 'gray', 'leg', undefined, 'metal'), cyl(0.08, 0.5, sd * 0.6, 0.35, 0.1, 'gray', 'leg', [0, 0, sd * 20], 'metal'));
  return p;
};
export const rocket: Builder = (o) => {
  const H = n(o, 'H', 4),
    D = n(o, 'D', 1.1);
  const p: GPart[] = [cyl(D, H * 0.62, 0, H * 0.31 + 0.3, 0, 'a', 'body')];
  p.push(cone(D, H * 0.32, 0, H * 0.62 + 0.3 + H * 0.16, 0, 'b', 'body'));
  p.push(mat(cyl(D * 0.42, 0.1, 0, H * 0.45, D * 0.48, 'sky', 'deco', [90, 0, 0]), 'glass'));
  p.push(ring(D * 0.5, 0.08, 0, H * 0.45, D * 0.5, 'c', 'deco', [90, 0, 0], 'metal'));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.push(wedge(0.12, 0.9, 0.8, Math.sin(a) * D * 0.55, 0.65, Math.cos(a) * D * 0.55, 'c', 'deco', [0, (a * 180) / Math.PI + 180, 0]));
  }
  p.push(cone(D * 0.8, 0.5, 0, 0.3, 0, 'gray', 'base', [180, 0, 0], 'metal'));
  p.push(mat(cone(D * 0.6, 0.8, 0, -0.25, 0, 'orange', 'light', [180, 0, 0]), 'glow'));
  return p;
};
export const boat: Builder = (o) => {
  const L = n(o, 'L', 3.6),
    W = n(o, 'W', 1.5);
  const p: GPart[] = [];
  p.push(box(W, 0.7, L * 0.75, 0, 0.35, -L * 0.1, 'a', 'body'));
  p.push(wedge(W, 0.7, L * 0.3, 0, 0.35, L * 0.4, 'a', 'body', [0, 180, 0]));
  p.push(box(W * 0.92, 0.1, L * 0.8, 0, 0.72, -0.05, 'tan', 'deck'));
  p.push(box(W * 1.02, 0.12, L * 0.9, 0, 0.12, 0, 'b', 'deco'));
  if (!b(o, 'noSail')) {
    p.push(cyl(0.12, 2.6, 0, 2.0, 0, 'brown', 'deco', undefined, 'wood'));
    p.push(wedge(0.08, 2.0, 1.5, 0, 2.0, -0.8, 'c', 'sail', [0, 180, 0]));
    p.push(box(0.4, 0.25, 0.04, 0, 3.35, 0, 'red', 'deco'));
  } else p.push(box(W * 0.6, 0.8, L * 0.3, 0, 1.15, -L * 0.15, 'c', 'body'));
  return p;
};
export const ship: Builder = () => {
  const p = boat({ L: 6, W: 2.4, noSail: true }, () => 0.5);
  p.push(box(1.6, 1.0, 1.6, 0, 1.9, -0.6, 'white', 'body'));
  for (const z of [0.2, -1.2]) p.push(cyl(0.6, 1.4, 0, 2.6, z, 'red', 'deco'), cyl(0.62, 0.3, 0, 3.2, z, 'black', 'deco'));
  for (let i = 0; i < 3; i++) p.push(mat(cyl(0.25, 0.08, 0.81, 2.0, -0.2 - i * 0.5, 'sky', 'deco', [0, 0, 90]), 'glass'));
  return p;
};
export const sub: Builder = () => {
  const p: GPart[] = [cap(1.6, 4, 0, 1, 0, 'a', 'body', [90, 0, 0])];
  p.push(box(0.7, 0.8, 1.2, 0, 2.0, 0.2, 'a', 'body'));
  p.push(cyl(0.12, 0.9, 0.1, 2.7, 0.5, 'gray', 'deco', undefined, 'metal'));
  for (let i = 0; i < 3; i++) p.push(mat(cyl(0.38, 0.08, 0.8, 1.1, 0.9 - i * 0.8, 'sky', 'deco', [0, 0, 90]), 'glass'));
  p.push(...rotor(0, 1, -2.25, 1.2, 'b', 'z'));
  p.push(wedge(0.1, 0.8, 0.6, 0, 1.75, -1.6, 'b', 'tail', [0, 180, 0]));
  return p;
};
export const bike: Builder = (o) => {
  const wd = n(o, 'wheel', 0.95),
    moto = b(o, 'moto');
  const p: GPart[] = [];
  for (const z of [0.75, -0.75]) p.push(joint(ring(wd, 0.14, 0, wd / 2, z, 'black', 'wheel', [0, 0, 90], 'rubber'), 'wheel', 'x', 1));
  p.push(box(0.12, 0.12, 1.5, 0, wd * 0.75, 0, 'a', 'body', [-15, 0, 0], 'metal'));
  p.push(cyl(0.1, wd * 0.6, 0, wd * 0.6, 0.6, 'a', 'body', [20, 0, 0], 'metal'));
  p.push(box(0.35, 0.12, 0.5, 0, wd + 0.2, -0.25, 'black', 'seat'));
  p.push(box(0.9, 0.08, 0.08, 0, wd + 0.45, 0.62, 'silver', 'deco', undefined, 'metal'));
  if (moto) p.push(ball(0.6, 0.55, 1.1, 0, wd * 0.75, 0.1, 'a', 'body'), mat(ball(0.25, 0.25, 0.1, 0, wd + 0.2, 0.85, 'yellow', 'light'), 'glow'));
  return p;
};
export const balloonCraft: Builder = (o) => {
  const p: GPart[] = [];
  const D = n(o, 'D', 3.2);
  p.push(ball(D, D * 1.15, D, 0, 2.2 + D / 2, 0, 'a', 'body'));
  for (let i = 0; i < 3; i++) p.push(ring(D * (0.95 - i * 0.12) * (i === 0 ? 1 : 1), 0.12, 0, 2.2 + D / 2 + (i - 1) * D * 0.3, 0, i % 2 ? 'b' : 'c', 'deco'));
  p.push(box(1.1, 0.7, 1.1, 0, 0.35, 0, 'brown', 'seat', undefined, 'wood'));
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.push(cyl(0.05, 1.6, x * 0.5, 1.4, z * 0.5, 'tan', 'deco'));
  p.push(mat(cone(0.4, 0.5, 0, 1.3, 0, 'orange', 'light'), 'glow'));
  return p;
};
export const ufo: Builder = () => {
  const p: GPart[] = [ball(3.4, 0.7, 3.4, 0, 1.2, 0, 'a', 'body', undefined, 'metal')];
  p.push(mat(ball(1.6, 1.2, 1.6, 0, 1.6, 0, 'mint', 'deco'), 'glass'));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push(mat(ball(0.3, 0.3, 0.3, Math.cos(a) * 1.5, 1.05, Math.sin(a) * 1.5, i % 2 ? 'yellow' : 'pink', 'light'), 'glow'));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    p.push(cyl(0.1, 0.8, Math.cos(a) * 1, 0.4, Math.sin(a) * 1, 'gray', 'leg', undefined, 'metal'));
  }
  p.push(...eyes(1.75, 0.6, 0.2, 0.3));
  return p;
};
export const sled: Builder = (o) => {
  const p: GPart[] = [box(1.1, 0.25, 2.2, 0, 0.5, 0, 'a', 'body', undefined, 'wood')];
  for (const sd of [-1, 1]) p.push(box(0.08, 0.08, 2.4, sd * 0.5, 0.05, 0, 'silver', 'base', undefined, 'metal'), cyl(0.06, 0.45, sd * 0.5, 0.28, 0.6, 'silver', 'base', undefined, 'metal'), cyl(0.06, 0.45, sd * 0.5, 0.28, -0.6, 'silver', 'base', undefined, 'metal'));
  if (b(o, 'board')) return [box(0.6, 0.08, 1.6, 0, 0.2, 0, 'a', 'body'), ...wheel(-0.2, 0.08, 0.55, 0.16, 0.08), ...wheel(0.2, 0.08, -0.55, 0.16, 0.08)];
  return p;
};
export const tank: Builder = () => {
  const p: GPart[] = [box(2.2, 0.8, 3.2, 0, 0.7, 0, 'a', 'body')];
  for (const sd of [-1, 1]) p.push(cap(0.7, 3.4, sd * 1.2, 0.4, 0, 'gray', 'wheel', [90, 0, 0], 'rubber'));
  p.push(ball(1.5, 0.9, 1.5, 0, 1.4, -0.1, 'b', 'body'));
  p.push(cyl(0.45, 1.8, 0, 1.5, 1.1, 'c', 'deco', [90, 0, 0]));
  p.push(mat(ball(0.6, 0.6, 0.6, 0, 1.5, 2.0, 'sky', 'deco'), 'glass'));
  return p;
};
export const tractor: Builder = (o) => {
  const p: GPart[] = [box(1.3, 0.9, 2.2, 0, 1.0, 0.2, 'a', 'body'), box(1.3, 1.2, 1.0, 0, 1.9, -0.5, 'b', 'body')];
  p.push(mat(box(1.2, 0.6, 0.06, 0, 2.1, 0.0, 'sky', 'deco'), 'glass'));
  p.push(cyl(0.15, 0.9, 0.4, 1.8, 0.9, 'black', 'deco'));
  for (const sd of [-1, 1]) p.push(...wheel(sd * 0.85, 0.75, -0.6, 1.5, 0.45), ...wheel(sd * 0.75, 0.45, 0.95, 0.9, 0.35));
  const tool = s(o, 'tool', '');
  if (tool === 'scoop') p.push(joint(box(1.6, 0.6, 0.6, 0, 0.6, 2.1, 'yellow', 'deco', undefined, 'metal'), 'hinge', 'x', 0.6, 20, [0, 1.2, 1.4]), box(0.2, 0.2, 1.4, 0, 1.0, 1.5, 'gray', 'deco', [20, 0, 0], 'metal'));
  if (tool === 'crane') p.push(box(0.4, 0.4, 4.5, 0, 3.5, 1.2, 'yellow', 'deco', [-35, 0, 0], 'metal'), cyl(0.06, 1.8, 0, 3.6, 3.0, 'gray', 'deco'), box(0.6, 0.4, 0.4, 0, 2.6, 3.0, 'gray', 'deco', undefined, 'metal'));
  return p;
};
export const cart: Builder = (o) => {
  const p: GPart[] = [box(1.2, 0.8, 1.6, 0, 0.9, 0, 'a', 'body')];
  p.push(box(1.0, 0.1, 1.4, 0, 1.25, 0, 'b', 'deco'));
  for (const [x, z] of [
    [-1, 1],
    [1, 1],
    [-1, -1],
    [1, -1],
  ])
    p.push(...wheel(x * 0.65, 0.25, z * 0.55, 0.5, 0.15));
  if (b(o, 'handle')) p.push(box(1.2, 0.08, 0.08, 0, 1.5, -1.0, 'silver', 'deco', undefined, 'metal'), cyl(0.06, 0.7, -0.55, 1.2, -0.9, 'silver', 'deco', [30, 0, 0], 'metal'), cyl(0.06, 0.7, 0.55, 1.2, -0.9, 'silver', 'deco', [30, 0, 0], 'metal'));
  return p;
};

/* ================================ CONSTRUÇÕES ================================ */
function gable(w: number, d: number, y: number, h: number, col: Slot): GPart[] {
  const sl = Math.hypot(w / 2, h);
  const a = (Math.atan2(h, w / 2) * 180) / Math.PI;
  return [box(sl + 0.2, 0.22, d + 0.4, -w / 4, y + h / 2, 0, col, 'roof', [0, 0, a]), box(sl + 0.2, 0.22, d + 0.4, w / 4, y + h / 2, 0, col, 'roof', [0, 0, -a])];
}
export const house: Builder = (o) => {
  const W = n(o, 'W', 4),
    H = n(o, 'H', 2.8),
    D = n(o, 'D', 3.6);
  const p: GPart[] = [box(W, H, D, 0, H / 2, 0, 'a', 'wall')];
  p.push(...gable(W, D, H, n(o, 'roofH', 1.6), 'b'));
  p.push(box(0.9, 1.6, 0.1, 0, 0.8, D / 2, 'brown', 'deco', undefined, 'wood'));
  p.push(mat(ball(0.12, 0.12, 0.12, 0.3, 0.85, D / 2 + 0.07, 'gold', 'deco'), 'metal'));
  for (const sd of [-1, 1]) {
    p.push(mat(box(0.8, 0.8, 0.08, sd * W * 0.3, H * 0.6, D / 2, 'sky', 'deco'), 'glass'));
    p.push(box(0.95, 0.12, 0.12, sd * W * 0.3, H * 0.6 - 0.45, D / 2 + 0.04, 'white', 'deco'));
  }
  if (!b(o, 'noChimney')) p.push(box(0.5, 1.2, 0.5, W * 0.28, H + 1.0, -D * 0.2, 'c', 'deco', undefined, 'stone'));
  if (b(o, 'flowers')) for (let i = 0; i < 3; i++) p.push(ball(0.35, 0.35, 0.35, -W * 0.35 + i * 0.35, 0.2, D / 2 + 0.4, ['red', 'yellow', 'pink'][i] as Slot, 'deco'));
  return p;
};
export const castle: Builder = (o) => {
  const W = n(o, 'W', 6);
  const p: GPart[] = [box(W, 3.2, W * 0.8, 0, 1.6, 0, 'a', 'wall', undefined, 'stone')];
  p.push(box(W * 0.5, 2, W * 0.4, 0, 4.2, -W * 0.1, 'a', 'wall', undefined, 'stone'));
  p.push(cone(W * 0.42, 1.8, 0, 6.1, -W * 0.1, 'b', 'roof'));
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    p.push(cyl(1.3, 4.6, (x * W) / 2, 2.3, (z * W * 0.8) / 2, 'a', 'wall', undefined, 'stone'));
    p.push(cone(1.6, 1.5, (x * W) / 2, 5.35, (z * W * 0.8) / 2, 'b', 'roof'));
  }
  p.push(box(1.4, 2.0, 0.15, 0, 1.0, W * 0.4, 'brown', 'deco', undefined, 'wood'));
  p.push(cyl(0.06, 1.2, 0, 7.6, -W * 0.1, 'gray', 'deco'));
  p.push(box(0.7, 0.45, 0.05, 0.36, 7.9, -W * 0.1, 'c', 'deco'));
  for (let i = 0; i < 3; i++) p.push(box(0.5, 0.5, 0.5, (i - 1) * W * 0.25, 3.45, W * 0.4, 'a', 'deco', undefined, 'stone'));
  return p;
};
export const tower: Builder = (o) => {
  const H = n(o, 'H', 6),
    D = n(o, 'D', 1.8);
  const p: GPart[] = [];
  const stripes = b(o, 'stripes');
  const k = stripes ? 4 : 1;
  for (let i = 0; i < k; i++) p.push(cyl(D * (1 - i * 0.05), H / k, 0, (H / k) * (i + 0.5), 0, i % 2 ? 'b' : 'a', 'wall', undefined, b(o, 'stone') ? 'stone' : 'plastic'));
  if (b(o, 'beacon')) p.push(mat(cyl(D * 0.7, 1.0, 0, H + 0.5, 0, 'yellow', 'light'), 'glow'), cone(D * 0.95, 0.9, 0, H + 1.45, 0, 'c', 'roof'));
  else p.push(cone(D * 1.3, D * 0.9, 0, H + D * 0.45, 0, 'c', 'roof'));
  p.push(box(0.6, 1.1, 0.1, 0, 0.55, D / 2, 'brown', 'deco'));
  for (let i = 1; i < 3; i++) p.push(mat(box(0.45, 0.6, 0.08, 0, (H * i) / 3 + 0.4, D / 2 - 0.02, 'sky', 'deco'), 'glass'));
  return p;
};
export const tent: Builder = (o) => {
  if (b(o, 'igloo')) return [ball(3.2, 3.2, 3.2, 0, 0, 0, 'white', 'wall', undefined, 'glass'), cyl(1.2, 1.4, 0, 0.6, 1.6, 'white', 'wall', [90, 0, 0]), box(0.7, 0.9, 0.1, 0, 0.45, 2.3, 'navy', 'deco')];
  if (b(o, 'teepee')) return [cone(3, 3.6, 0, 1.8, 0, 'a', 'wall'), box(0.8, 1.1, 0.1, 0, 0.55, 1.05, 'brown', 'deco'), cyl(0.08, 1.2, 0.2, 3.7, 0, 'brown', 'deco'), cyl(0.08, 1.2, -0.2, 3.7, 0, 'brown', 'deco')];
  return [...gable(3, 3.2, -0.1, 2.2, 'a'), box(3.0, 0.1, 3.4, 0, 0.05, 0, 'b', 'base'), wedge(0.1, 1.3, 0.9, 0, 0.65, 1.6, 'c', 'deco')];
};
export const treehouse: Builder = () => {
  const p: GPart[] = [cyl(1.0, 5.5, 0, 2.75, 0, 'brown', 'body', undefined, 'wood')];
  p.push(ball(5, 3, 5, 0, 7.6, 0, 'green', 'leaf'), ball(3, 2, 3, 1.8, 6.6, 1.2, 'lime', 'leaf'));
  p.push(box(3.6, 0.25, 3.6, 0, 3.6, 0, 'tan', 'deck', undefined, 'wood'));
  p.push(box(2.4, 1.8, 2.2, 0, 4.65, -0.3, 'a', 'wall', undefined, 'wood'));
  p.push(...gable(2.4, 2.2, 5.5, 0.9, 'b').map((q) => ((q.pos[2] -= 0.3), q)));
  p.push(box(0.7, 1.2, 0.1, 0, 4.35, 0.82, 'chocolate', 'deco', undefined, 'wood'));
  p.push(mat(box(0.6, 0.6, 0.08, 0.8, 4.9, 0.82, 'sky', 'deco'), 'glass'));
  for (const sd of [-1, 1]) p.push(cyl(0.1, 3.8, sd * 0.35, 1.8, 2.3, 'tan', 'deco', [-12, 0, 0], 'wood'));
  for (let i = 0; i < 4; i++) p.push(box(0.8, 0.08, 0.1, 0, 0.6 + i * 0.85, 2.2 - i * 0.18, 'tan', 'deco', undefined, 'wood'));
  return p;
};
export const bridge: Builder = (o) => {
  const L = n(o, 'L', 8),
    W = n(o, 'W', 2.2),
    h = n(o, 'arch', 1.6),
    k = 7;
  const p: GPart[] = [];
  for (let i = 0; i < k; i++) {
    const u0 = i / k,
      u1 = (i + 1) / k;
    const y0 = Math.sin(u0 * Math.PI) * h,
      y1 = Math.sin(u1 * Math.PI) * h;
    const z0 = (u0 - 0.5) * L,
      z1 = (u1 - 0.5) * L;
    const len = Math.hypot(z1 - z0, y1 - y0);
    const ang = (-Math.atan2(y1 - y0, z1 - z0) * 180) / Math.PI;
    p.push(box(W, 0.3, len + 0.08, 0, (y0 + y1) / 2 + 0.15, (z0 + z1) / 2, b(o, 'stripes') && i % 2 ? 'b' : 'a', 'deck', [ang, 0, 0], s(o, 'm', 'wood') as GPart['mat']));
  }
  for (const sd of [-1, 1]) {
    p.push(cyl(0.18, 1.1, sd * W * 0.5, h + 0.75, 0, 'c', 'deco'));
    p.push(cyl(0.18, 0.9, sd * W * 0.5, 0.6, L * 0.48, 'c', 'deco'), cyl(0.18, 0.9, sd * W * 0.5, 0.6, -L * 0.48, 'c', 'deco'));
  }
  return p;
};
export const stairs: Builder = (o) => {
  const H = n(o, 'H', 3),
    W = n(o, 'W', 1.8),
    D = n(o, 'D', 3.6);
  const p: GPart[] = [wedge(W, H, D, 0, H / 2, 0, 'a', 'deck', [0, 0, 0])];
  const k = 6;
  for (let i = 0; i < k; i++) p.push(box(W * 1.02, 0.12, D / k, 0, H * ((k - i - 0.5) / k) * 1.0 + 0.0 - (H / k) * 0.0, -D / 2 + (D / k) * (i + 0.5), i % 2 ? 'b' : 'c', 'deco'));
  for (const sd of [-1, 1]) p.push(box(0.1, 0.1, Math.hypot(H, D), sd * W * 0.52, H / 2 + 0.7, 0, 'c', 'deco', [-(Math.atan2(H, D) * 180) / Math.PI, 0, 0]));
  return p;
};
export const slide: Builder = (o) => {
  const H = n(o, 'H', 2.6);
  const len = H * 1.8;
  const ang = (Math.atan2(H, len) * 180) / Math.PI;
  const p: GPart[] = [box(1.4, 0.2, Math.hypot(H, len), 0, H / 2 + 0.25, len / 2 + 0.4, 'a', 'deck', [ang, 0, 0])];
  for (const sd of [-1, 1]) p.push(box(0.12, 0.35, Math.hypot(H, len), sd * 0.72, H / 2 + 0.45, len / 2 + 0.4, 'b', 'deco', [ang, 0, 0]));
  p.push(box(1.6, 0.2, 1.4, 0, H + 0.1, -0.4, 'c', 'deck'));
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.push(cyl(0.16, H, x * 0.7, H / 2, -0.4 + z * 0.6, 'c', 'base', undefined, 'metal'));
  for (let i = 0; i < 4; i++) p.push(box(1.3, 0.08, 0.1, 0, 0.5 + i * (H / 4.5), -1.15, 'b', 'deco'));
  return p;
};
export const trampoline: Builder = () => {
  const p: GPart[] = [ring(3, 0.25, 0, 0.75, 0, 'b', 'deco'), mat(cyl(2.7, 0.1, 0, 0.75, 0, 'a', 'deck'), 'rubber')];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.78;
    p.push(cyl(0.12, 0.75, Math.cos(a) * 1.3, 0.37, Math.sin(a) * 1.3, 'gray', 'base', undefined, 'metal'));
  }
  return p;
};
export const swing: Builder = (o) => {
  if (b(o, 'seesaw')) return [box(0.4, 0.8, 0.4, 0, 0.4, 0, 'b', 'base'), joint(box(0.6, 0.15, 4, 0, 0.85, 0, 'a', 'deck'), 'hinge', 'x', 0.5, 14, [0, 0.85, 0]), box(0.6, 0.4, 0.1, 0, 1.0, 1.7, 'c', 'seat'), box(0.6, 0.4, 0.1, 0, 1.0, -1.7, 'c', 'seat')];
  const p: GPart[] = [box(3.4, 0.2, 0.2, 0, 3, 0, 'a', 'base', undefined, 'wood')];
  for (const sd of [-1, 1]) p.push(cyl(0.18, 3.1, sd * 1.6, 1.5, 0.5, 'a', 'base', [-12, 0, 0], 'wood'), cyl(0.18, 3.1, sd * 1.6, 1.5, -0.5, 'a', 'base', [12, 0, 0], 'wood'));
  for (const sd of [-1, 1]) p.push(joint(box(0.8, 2.2, 0.5, sd * 0.7, 1.75, 0, 'b', 'seat'), 'hinge', 'x', 0.6 * sd, 25, [sd * 0.7, 3, 0]));
  return p;
};
export const ferris: Builder = (o) => {
  const D = n(o, 'D', 5);
  const p: GPart[] = [];
  for (const sd of [-1, 1]) p.push(cyl(0.18, D * 0.6, sd * 0.5, D * 0.28, 0.6, 'silver', 'base', [-20, 0, 0], 'metal'), cyl(0.18, D * 0.6, sd * 0.5, D * 0.28, -0.6, 'silver', 'base', [20, 0, 0], 'metal'));
  p.push(joint(ring(D, 0.2, 0, D * 0.55, 0, 'a', 'body', [0, 0, 90]), 'spin', 'x', 0.15));
  p.push(joint(box(0.15, D * 0.95, 0.15, 0, D * 0.55, 0, 'b', 'body'), 'spin', 'x', 0.15, 0, [0, D * 0.55, 0]));
  p.push(joint(box(0.15, 0.15, D * 0.95, 0, D * 0.55, 0, 'b', 'body'), 'spin', 'x', 0.15, 0, [0, D * 0.55, 0]));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(joint(box(0.8, 0.6, 0.6, 0.0, D * 0.55 + Math.sin(a) * D * 0.5, Math.cos(a) * D * 0.5, ['red', 'yellow', 'blue', 'green'][i] as Slot, 'seat'), 'spin', 'x', 0.15, 0, [0, D * 0.55, 0]));
  }
  return p;
};
export const carousel: Builder = () => {
  const p: GPart[] = [cyl(4, 0.4, 0, 0.2, 0, 'b', 'base'), cyl(0.3, 3, 0, 1.9, 0, 'gold', 'deco', undefined, 'metal'), cone(4.6, 1.4, 0, 4.0, 0, 'a', 'roof')];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.push(joint(ball(0.45, 0.6, 1.1, Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5, ['white', 'pink', 'sky', 'yellow'][i] as Slot, 'seat', [0, (-a * 180) / Math.PI, 0]), 'spin', 'y', 0.25, 0, [0, 1.2, 0]));
    p.push(joint(cyl(0.06, 3, Math.cos(a) * 1.5, 1.9, Math.sin(a) * 1.5, 'gold', 'deco'), 'spin', 'y', 0.25, 0, [0, 1.9, 0]));
  }
  return p;
};
export const pool: Builder = (o) => {
  const W = n(o, 'W', 4),
    D = n(o, 'D', 3);
  const p: GPart[] = [];
  for (const sd of [-1, 1]) p.push(box(0.3, 0.7, D, sd * (W / 2), 0.35, 0, 'a', 'wall'), box(W, 0.7, 0.3, 0, 0.35, sd * (D / 2), 'a', 'wall'));
  p.push(mat(box(W - 0.3, 0.45, D - 0.3, 0, 0.25, 0, 'sky', 'deco'), 'glass'));
  if (b(o, 'fountain')) p.push(cyl(0.5, 1.4, 0, 0.7, 0, 'a', 'deco', undefined, 'stone'), mat(ball(1.0, 0.8, 1.0, 0, 1.6, 0, 'sky', 'light'), 'glass'));
  if (b(o, 'well')) return [cyl(1.6, 0.9, 0, 0.45, 0, 'gray', 'wall', undefined, 'stone'), mat(cyl(1.3, 0.1, 0, 0.8, 0, 'sky', 'deco'), 'glass'), cyl(0.12, 1.6, -0.75, 1.6, 0, 'brown', 'deco', undefined, 'wood'), cyl(0.12, 1.6, 0.75, 1.6, 0, 'brown', 'deco', undefined, 'wood'), ...gable(1.9, 1.2, 2.3, 0.6, 'red')];
  return p;
};
export const wall: Builder = (o) => {
  const L = n(o, 'L', 5),
    H = n(o, 'H', 1.6);
  if (b(o, 'fence')) {
    const p: GPart[] = [box(L, 0.15, 0.1, 0, H * 0.75, 0, 'a', 'wall', undefined, 'wood'), box(L, 0.15, 0.1, 0, H * 0.35, 0, 'a', 'wall', undefined, 'wood')];
    for (let i = 0; i < 6; i++) p.push(box(0.25, H, 0.12, -L / 2 + (L / 5) * i, H / 2, 0.06, 'b', 'wall', undefined, 'wood'));
    return p;
  }
  const p: GPart[] = [box(L, H, 0.7, 0, H / 2, 0, 'a', 'wall', undefined, 'stone')];
  for (let i = 0; i < 4; i++) p.push(box(0.6, 0.5, 0.72, -L / 2 + 0.3 + i * ((L - 0.6) / 3), H + 0.25, 0, 'a', 'wall', undefined, 'stone'));
  return p;
};
export const pyramid: Builder = () => [mat(cone(6, 4.2, 0, 2.1, 0, 'a', 'wall', [0, 45, 0]), 'stone'), box(0.9, 1.2, 0.2, 0, 0.6, 2.05, 'chocolate', 'deco')];
export const windmill: Builder = () => [cyl(2.2, 5, 0, 2.5, 0, 'a', 'wall'), cone(2.6, 1.6, 0, 5.8, 0, 'b', 'roof'), ...rotor(0, 4.6, 1.3, 5, 'white', 'z'), box(0.8, 1.3, 0.1, 0, 0.65, 1.08, 'brown', 'deco')];
export const stage: Builder = () => [box(5, 0.8, 3, 0, 0.4, 0, 'a', 'deck', undefined, 'wood'), box(5.4, 3.4, 0.25, 0, 2.1, -1.5, 'b', 'wall'), box(5.4, 0.5, 0.4, 0, 3.6, -1.3, 'c', 'deco'), mat(ball(0.4, 0.4, 0.4, -1.8, 3.2, -1.2, 'yellow', 'light'), 'glow'), mat(ball(0.4, 0.4, 0.4, 1.8, 3.2, -1.2, 'pink', 'light'), 'glow')];

/* ================================ CASA / MÓVEIS ================================ */
export const chair: Builder = (o) => {
  const W = n(o, 'W', 1.2),
    H = n(o, 'seatH', 0.9);
  const p: GPart[] = [box(W, 0.2, W, 0, H, 0, 'a', 'seat'), box(W, n(o, 'back', 1.2), 0.18, 0, H + n(o, 'back', 1.2) / 2, -W / 2 + 0.09, 'a', 'body')];
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.push(cyl(0.14, H, (x * W) / 2.4, H / 2, (z * W) / 2.4, 'b', 'leg'));
  if (b(o, 'throne')) p.push(ball(0.5, 0.5, 0.5, -W / 2, H + 1.4, -W / 2, 'gold', 'deco'), ball(0.5, 0.5, 0.5, W / 2, H + 1.4, -W / 2, 'gold', 'deco'), mat(ball(0.35, 0.35, 0.2, 0, H + 1.1, -W / 2 + 0.1, 'red', 'deco'), 'glass'));
  if (b(o, 'sofa')) return [box(2.6, 0.6, 1.1, 0, 0.5, 0, 'a', 'seat'), box(2.6, 0.9, 0.3, 0, 1.0, -0.45, 'a', 'body'), box(0.3, 0.6, 1.1, -1.35, 0.85, 0, 'a', 'body'), box(0.3, 0.6, 1.1, 1.35, 0.85, 0, 'a', 'body'), box(1.1, 0.2, 0.9, -0.6, 0.85, 0.05, 'b', 'deco'), box(1.1, 0.2, 0.9, 0.6, 0.85, 0.05, 'b', 'deco')];
  return p;
};
export const table: Builder = (o) => {
  const W = n(o, 'W', 2.2),
    D = n(o, 'D', 1.4),
    H = n(o, 'H', 1.0);
  const p: GPart[] = [box(W, 0.18, D, 0, H, 0, 'a', 'deck', undefined, 'wood')];
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    p.push(cyl(0.14, H, x * (W / 2 - 0.15), H / 2, z * (D / 2 - 0.15), 'b', 'leg', undefined, 'wood'));
  if (b(o, 'cloth')) p.push(box(W * 0.8, 0.04, D * 0.8, 0, H + 0.11, 0, 'c', 'deco'));
  return p;
};
export const bed: Builder = () => [box(1.8, 0.5, 3, 0, 0.45, 0, 'b', 'base', undefined, 'wood'), box(1.7, 0.3, 2.9, 0, 0.85, 0, 'white', 'deck'), box(1.72, 0.2, 2.0, 0, 1.05, -0.45, 'a', 'deco'), ball(1.0, 0.3, 0.55, 0, 1.1, 1.15, 'white', 'deco'), box(1.8, 1.2, 0.15, 0, 0.9, 1.5, 'b', 'wall', undefined, 'wood')];
export const cabinet: Builder = (o) => {
  const W = n(o, 'W', 1.6),
    H = n(o, 'H', 2.4);
  const p: GPart[] = [box(W, H, 0.9, 0, H / 2, 0, 'a', 'body')];
  if (b(o, 'fridge')) p.push(box(W * 0.9, 0.06, 0.05, 0, H * 0.62, 0.47, 'gray', 'deco'), box(0.08, 0.6, 0.12, W * 0.35, H * 0.8, 0.5, 'silver', 'deco', undefined, 'metal'), box(0.08, 0.5, 0.12, W * 0.35, H * 0.35, 0.5, 'silver', 'deco', undefined, 'metal'));
  else if (b(o, 'stove')) p.push(box(W, 0.1, 0.9, 0, H + 0.05, 0, 'black', 'deco'), mat(box(W * 0.6, H * 0.35, 0.05, 0, H * 0.4, 0.46, 'navy', 'deco'), 'glass'), ...[-1, 1].map((x) => mat(ring(0.45, 0.06, x * W * 0.22, H + 0.12, 0, 'red', 'light'), 'glow')));
  else if (b(o, 'shelf')) for (let i = 1; i < 4; i++) p.push(box(W * 0.9, 0.06, 0.85, 0, (H * i) / 4, 0.05, 'b', 'deco'), box(0.2, H / 5, 0.6, -W * 0.3 + i * 0.2, (H * i) / 4 + H / 10, 0.1, (['red', 'blue', 'green'] as Slot[])[i - 1], 'deco'));
  else p.push(box(0.05, H * 0.95, 0.05, 0, H / 2, 0.46, 'b', 'deco'), ball(0.12, 0.12, 0.12, -0.15, H / 2, 0.5, 'gold', 'deco'), ball(0.12, 0.12, 0.12, 0.15, H / 2, 0.5, 'gold', 'deco'));
  return p;
};
export const screen: Builder = (o) => {
  if (b(o, 'computer')) return [box(1.8, 1.2, 0.15, 0, 1.3, 0, 'a', 'body'), mat(box(1.6, 1.0, 0.04, 0, 1.3, 0.09, 'sky', 'light'), 'glow'), box(0.2, 0.5, 0.2, 0, 0.45, 0, 'a', 'base'), box(1.0, 0.1, 0.6, 0, 0.12, 0.2, 'a', 'base'), box(1.4, 0.08, 0.5, 0, 0.05, 0.8, 'b', 'deco')];
  return [box(2.4, 1.5, 0.25, 0, 1.4, 0, 'a', 'body'), mat(box(2.2, 1.3, 0.05, 0, 1.4, 0.14, 'sky', 'light'), 'glow'), box(0.2, 0.6, 0.2, 0, 0.35, 0, 'a', 'base'), box(1.2, 0.08, 0.6, 0, 0.04, 0, 'a', 'base'), cyl(0.04, 0.8, -0.4, 2.4, 0, 'gray', 'deco', [0, 0, 25]), cyl(0.04, 0.8, 0.4, 2.4, 0, 'gray', 'deco', [0, 0, -25])];
};
export const lamp: Builder = (o) => {
  if (b(o, 'bulb')) return [mat(ball(1.2, 1.4, 1.2, 0, 1.5, 0, 'yellow', 'light'), 'glow'), cyl(0.6, 0.6, 0, 0.5, 0, 'silver', 'base', undefined, 'metal'), ring(0.6, 0.1, 0, 0.7, 0, 'gray', 'deco')];
  if (b(o, 'candle')) return [cyl(0.5, 1.4, 0, 0.7, 0, 'a', 'body'), cyl(0.04, 0.2, 0, 1.5, 0, 'black', 'deco'), mat(cone(0.25, 0.45, 0, 1.75, 0, 'orange', 'light'), 'glow')];
  if (b(o, 'lantern')) return [box(0.8, 1.0, 0.8, 0, 0.7, 0, 'a', 'body', undefined, 'metal'), mat(box(0.65, 0.8, 0.65, 0, 0.7, 0, 'yellow', 'light'), 'glow'), cone(1.0, 0.4, 0, 1.4, 0, 'a', 'roof', undefined, 'metal'), ring(0.4, 0.07, 0, 1.75, 0, 'a', 'deco', [90, 0, 0])];
  return [cyl(0.8, 0.12, 0, 0.06, 0, 'b', 'base'), cyl(0.12, 2.2, 0, 1.15, 0, 'b', 'body', undefined, 'metal'), cone(1.3, 0.9, 0, 2.45, 0, 'a', 'roof'), mat(ball(0.4, 0.4, 0.4, 0, 2.1, 0, 'yellow', 'light'), 'glow')];
};
export const instrument: Builder = (o) => {
  const k = s(o, 'k', 'guitar');
  if (k === 'drum') return [cyl(1.4, 1.0, 0, 0.5, 0, 'a', 'body'), cyl(1.42, 0.06, 0, 1.03, 0, 'white', 'deco'), ring(1.42, 0.08, 0, 1.0, 0, 'gold', 'deco', undefined, 'metal'), ring(1.42, 0.08, 0, 0.05, 0, 'gold', 'deco', undefined, 'metal'), cyl(0.06, 0.9, 0.3, 1.4, 0.3, 'tan', 'deco', [30, 0, 20], 'wood'), cyl(0.06, 0.9, -0.3, 1.4, 0.3, 'tan', 'deco', [30, 0, -20], 'wood')];
  if (k === 'piano') return [box(2.6, 1.6, 1.0, 0, 1.0, 0, 'a', 'body', undefined, 'wood'), box(2.4, 0.12, 0.45, 0, 0.95, 0.65, 'white', 'deco'), ...[0, 1, 2, 3, 4].map((i) => box(0.12, 0.06, 0.25, -0.9 + i * 0.45, 1.04, 0.6, 'black', 'deco')), box(2.6, 0.5, 0.15, 0, 0.25, 0.4, 'a', 'base', undefined, 'wood')];
  return [ball(1.1, 1.2, 0.35, 0, 0.7, 0, 'a', 'body', undefined, 'wood'), ball(0.9, 0.9, 0.35, 0, 1.45, 0, 'a', 'body', undefined, 'wood'), cyl(0.3, 0.06, 0, 1.2, 0.2, 'black', 'deco', [90, 0, 0]), box(0.18, 1.6, 0.1, 0, 2.6, 0, 'b', 'deco', undefined, 'wood'), box(0.3, 0.35, 0.12, 0, 3.5, 0, 'b', 'deco', undefined, 'wood'), box(0.04, 2.4, 0.02, 0, 2.0, 0.2, 'silver', 'deco', undefined, 'metal')];
};

/* ================================ COMIDA ================================ */
export const pizza: Builder = (o) => {
  const D = n(o, 'D', 2.6);
  const p: GPart[] = [cyl(D, 0.25, 0, 0.125, 0, 'tan', 'base'), ring(D, 0.22, 0, 0.25, 0, 'tan', 'deco'), cyl(D * 0.86, 0.06, 0, 0.27, 0, 'red', 'body'), cyl(D * 0.8, 0.05, 0, 0.31, 0, 'yellow', 'body')];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    p.push(cyl(D * 0.14, 0.07, Math.cos(a) * D * 0.25 * (i % 2 ? 1.2 : 0.7), 0.35, Math.sin(a) * D * 0.25 * (i % 2 ? 1.2 : 0.7), 'red', 'deco'));
  }
  p.push(ball(0.2, 0.1, 0.2, 0, 0.36, 0, 'green', 'deco'));
  return p;
};
export const burger: Builder = () => [
  ball(2.2, 0.6, 2.2, 0, 0.35, 0, 'tan', 'base'),
  cyl(2.3, 0.35, 0, 0.7, 0, 'chocolate', 'body'),
  box(2.3, 0.08, 2.3, 0, 0.92, 0, 'yellow', 'deco', [0, 45, 0]),
  cyl(2.4, 0.1, 0, 1.0, 0, 'lime', 'deco'),
  cyl(2.0, 0.12, 0, 1.1, 0, 'red', 'deco'),
  ball(2.3, 1.2, 2.3, 0, 1.25, 0, 'tan', 'body'),
  ...[0, 1, 2, 3].map((i) => ball(0.14, 0.08, 0.22, Math.cos(i * 1.6) * 0.5, 1.82, Math.sin(i * 1.6) * 0.5, 'cream', 'deco')),
];
export const icecream: Builder = (o) => {
  const p: GPart[] = [cone(1.2, 2.0, 0, 1.0, 0, 'tan', 'base', [180, 0, 0])];
  const k = n(o, 'scoops', 3);
  const cols: Slot[] = ['a', 'b', 'c'];
  for (let i = 0; i < k; i++) p.push(ball(1.35 - i * 0.12, 1.15, 1.35 - i * 0.12, 0, 2.2 + i * 0.85, 0, cols[i % 3], 'body'));
  p.push(ball(0.35, 0.35, 0.35, 0, 2.2 + k * 0.85 - 0.15, 0, 'red', 'deco'), cyl(0.04, 0.35, 0.05, 2.2 + k * 0.85 + 0.15, 0, 'green', 'deco', [0, 0, -20]));
  if (b(o, 'popsicle')) return [box(1.1, 2.0, 0.5, 0, 1.6, 0, 'a', 'body'), box(1.15, 0.6, 0.55, 0, 2.4, 0, 'b', 'deco'), box(0.2, 0.9, 0.1, 0, 0.45, 0, 'tan', 'base', undefined, 'wood')];
  return p;
};
export const cake: Builder = (o) => {
  const t = n(o, 'tiers', 3);
  const p: GPart[] = [cyl(3.2, 0.12, 0, 0.06, 0, 'white', 'base')];
  let y = 0.12;
  for (let i = 0; i < t; i++) {
    const d = 2.8 - i * 0.7,
      h = 0.8;
    p.push(cyl(d, h, 0, y + h / 2, 0, i % 2 ? 'b' : 'a', 'body'), ring(d, 0.18, 0, y + h, 0, 'c', 'deco'));
    y += h;
  }
  for (let i = 0; i < 3; i++) p.push(cyl(0.12, 0.5, (i - 1) * 0.25, y + 0.25, 0, ['red', 'blue', 'yellow'][i] as Slot, 'deco'), mat(cone(0.12, 0.2, (i - 1) * 0.25, y + 0.6, 0, 'orange', 'light'), 'glow'));
  if (b(o, 'cupcake')) return [cyl(1.2, 0.9, 0, 0.45, 0, 'b', 'base', undefined, 'plastic'), ball(1.5, 1.0, 1.5, 0, 1.15, 0, 'a', 'body'), ball(0.9, 0.7, 0.9, 0, 1.6, 0, 'a', 'body'), ball(0.35, 0.35, 0.35, 0, 2.05, 0, 'red', 'deco')];
  return p;
};
export const donut: Builder = () => [ring(2.4, 0.9, 0, 0.45, 0, 'tan', 'base'), ring(2.35, 0.75, 0, 0.62, 0, 'a', 'body'), ...[0, 1, 2, 3, 4].map((i) => box(0.25, 0.06, 0.06, Math.cos(i * 1.25) * 0.85, 1.0, Math.sin(i * 1.25) * 0.85, ['yellow', 'sky', 'white', 'lime', 'purple'][i] as Slot, 'deco', [0, i * 40, 0]))];
/** fruta redonda (maçã, laranja, melancia, abacaxi, abóbora...) */
export const fruit: Builder = (o) => {
  const W = n(o, 'W', 1.6),
    H = n(o, 'H', 1.5);
  const p: GPart[] = [ball(W, H, n(o, 'D', W), 0, H / 2, 0, 'a', 'body')];
  if (b(o, 'stripes')) for (let i = 0; i < 4; i++) p.push(ball(W * 0.18, H * 1.01, n(o, 'D', W) * 1.01, (i - 1.5) * W * 0.24, H / 2, 0, 'b', 'deco', [0, i * 45, 0]));
  const top = s(o, 'top', 'stem');
  if (top === 'stem') p.push(cyl(0.12, 0.4, 0, H + 0.12, 0, 'chocolate', 'deco', [0, 0, 10]), ball(0.5, 0.08, 0.28, 0.25, H + 0.2, 0, 'green', 'leaf', [0, 0, 20]));
  if (top === 'crown') for (let i = 0; i < 5; i++) p.push(cone(0.3, 1.0, Math.cos(i * 1.25) * 0.18, H + 0.4, Math.sin(i * 1.25) * 0.18, 'green', 'leaf', [Math.sin(i * 1.25) * 25, 0, -Math.cos(i * 1.25) * 25]));
  if (top === 'leaves') for (let i = 0; i < 5; i++) p.push(ball(0.5, 0.08, 0.2, Math.cos(i * 1.25) * 0.3, H - 0.02, Math.sin(i * 1.25) * 0.3, 'green', 'leaf', [0, (-i * 72), 0]));
  if (b(o, 'seeds')) for (let i = 0; i < 6; i++) p.push(ball(0.08, 0.12, 0.06, Math.cos(i) * W * 0.35, H * (0.3 + (i % 3) * 0.2), W * 0.47, 'c', 'deco'));
  if (b(o, 'face')) p.push(...eyes(H * 0.6, W * 0.45, W * 0.15, W * 0.16));
  return p;
};
/** fruta comprida/curva (banana, cenoura, milho, pepino, salsicha) — boa para "casco" de barco/carro */
export const longFruit: Builder = (o) => {
  const L = n(o, 'L', 3),
    D = n(o, 'D', 0.8),
    curve = n(o, 'curve', 0.5),
    k = 5;
  const p: GPart[] = [];
  for (let i = 0; i < k; i++) {
    const u = (i + 0.5) / k - 0.5;
    const y = D / 2 + curve * (u * u * 4) * D;
    const ang = curve * u * 4 * 30;
    p.push(cap(D * (1 - Math.abs(u) * 0.5), L / k + D * 0.35, 0, y, u * L, 'a', 'body', [90 + ang, 0, 0]));
  }
  const tip = s(o, 'tip', 'brown');
  if (tip === 'brown') p.push(ball(D * 0.3, D * 0.3, D * 0.35, 0, D / 2 + curve * D, L / 2 + D * 0.05, 'chocolate', 'deco'), cyl(D * 0.3, D * 0.5, 0, D / 2 + curve * D * 1.1, -L / 2 - D * 0.1, 'chocolate', 'deco', [70, 0, 0]));
  if (tip === 'leaves') for (let i = 0; i < 3; i++) p.push(cone(D * 0.3, D * 1.2, (i - 1) * D * 0.2, D / 2 + curve * D + D * 0.3, -L / 2 - D * 0.4, 'green', 'leaf', [-60, (i - 1) * 25, 0]));
  if (tip === 'husk') for (const sd of [-1, 1]) p.push(ball(D * 0.4, D * 0.8, L * 0.6, sd * D * 0.4, D / 2, -L * 0.15, 'green', 'leaf'));
  if (b(o, 'bun')) for (const sd of [-1, 1]) p.push(cap(D * 0.9, L * 0.85, sd * D * 0.55, D * 0.4, 0, 'tan', 'base', [90, 0, 0]));
  if (b(o, 'kernels')) for (let i = 0; i < 4; i++) p.push(box(D * 1.02, D * 0.1, 0.06, 0, D / 2, (i - 1.5) * L * 0.18, 'b', 'deco'));
  return p;
};
export const sandwich: Builder = (o) => {
  if (b(o, 'taco')) return [ring(2.2, 0.25, 0, 1.0, 0, 'tan', 'base', [0, 0, 90]), ball(0.4, 1.2, 1.8, 0, 1.1, 0, 'lime', 'body'), ball(0.3, 1.0, 1.6, 0, 1.0, 0, 'chocolate', 'body'), ...[0, 1, 2].map((i) => ball(0.25, 0.25, 0.25, 0, 1.55, (i - 1) * 0.5, 'red', 'deco'))];
  if (b(o, 'pancakes')) return [cyl(2.2, 0.1, 0, 0.05, 0, 'white', 'base'), ...[0, 1, 2, 3].map((i) => cyl(1.9, 0.3, 0, 0.25 + i * 0.3, 0, 'tan', 'body')), cyl(1.6, 0.06, 0, 1.4, 0, 'orange', 'deco'), box(0.4, 0.2, 0.4, 0, 1.5, 0, 'yellow', 'deco')];
  return [box(2.2, 0.4, 2.2, 0, 0.2, 0, 'tan', 'base'), box(2.3, 0.08, 2.3, 0, 0.44, 0, 'lime', 'deco'), box(2.1, 0.25, 2.1, 0, 0.6, 0, 'pink', 'body'), box(2.2, 0.08, 2.2, 0, 0.76, 0, 'yellow', 'deco', [0, 20, 0]), box(2.2, 0.4, 2.2, 0, 1.0, 0, 'tan', 'body')];
};
export const sweet: Builder = (o) => {
  const k = s(o, 'k', 'lollipop');
  if (k === 'lollipop') return [cyl(0.15, 2.2, 0, 1.1, 0, 'white', 'base'), cyl(1.8, 0.3, 0, 2.6, 0, 'a', 'body', [90, 0, 0]), ring(1.2, 0.25, 0, 2.6, 0.08, 'b', 'deco', [90, 0, 0]), ring(0.55, 0.22, 0, 2.6, 0.1, 'c', 'deco', [90, 0, 0])];
  if (k === 'candy') return [ball(1.6, 1.1, 1.1, 0, 0.6, 0, 'a', 'body'), cone(0.9, 0.7, 1.05, 0.6, 0, 'b', 'deco', [0, 0, 90]), cone(0.9, 0.7, -1.05, 0.6, 0, 'b', 'deco', [0, 0, -90]), ring(1.0, 0.12, 0, 0.6, 0, 'c', 'deco', [0, 0, 90])];
  if (k === 'chocolate') return [box(2.2, 0.35, 1.4, 0, 0.18, 0, 'chocolate', 'body'), ...[0, 1, 2].map((i) => box(0.6, 0.12, 1.2, (i - 1) * 0.7, 0.4, 0, 'chocolate', 'deco')), box(2.25, 0.3, 0.7, 0, 0.2, -0.4, 'a', 'deco')];
  if (k === 'cookie') return [cyl(2.0, 0.3, 0, 0.15, 0, 'tan', 'body'), ...[0, 1, 2, 3, 4].map((i) => ball(0.22, 0.15, 0.22, Math.cos(i * 1.3) * 0.55, 0.32, Math.sin(i * 1.3) * 0.55, 'chocolate', 'deco'))];
  if (k === 'brigadeiro') return [ball(1.4, 1.3, 1.4, 0, 0.65, 0, 'chocolate', 'body'), ...[0, 1, 2, 3, 4, 5].map((i) => box(0.18, 0.08, 0.08, Math.cos(i) * 0.45, 0.9 + (i % 2) * 0.25, Math.sin(i) * 0.45, ['pink', 'yellow', 'sky'][i % 3] as Slot, 'deco', [0, i * 30, 30])), cyl(1.3, 0.3, 0, 0.12, 0, 'red', 'base')];
  if (k === 'jelly') return [mat(cone(1.8, 1.6, 0, 0.8, 0, 'a', 'body', [0, 22, 0]), 'jelly'), mat(ball(0.4, 0.4, 0.4, 0, 1.7, 0, 'red', 'deco'), 'jelly'), cyl(2.2, 0.08, 0, 0.04, 0, 'white', 'base')];
  if (k === 'popcorn') return [cyl(1.4, 1.6, 0, 0.8, 0, 'red', 'base'), ...[0, 1, 2].map((i) => box(1.42, 1.6, 0.25, 0, 0.8, 0, 'white', 'deco', [0, i * 60, 0])), ...[0, 1, 2, 3, 4].map((i) => ball(0.6, 0.5, 0.6, Math.cos(i * 1.3) * 0.35, 1.7 + (i % 2) * 0.3, Math.sin(i * 1.3) * 0.35, 'cream', 'body'))];
  if (k === 'fries') return [box(1.2, 1.2, 0.8, 0, 0.6, 0, 'red', 'base'), ...[0, 1, 2, 3, 4, 5].map((i) => box(0.18, 1.0, 0.18, (i - 2.5) * 0.19, 1.4 + (i % 2) * 0.2, (i % 3) * 0.15 - 0.15, 'yellow', 'body', [0, 0, (i - 2.5) * 5]))];
  if (k === 'cheese') return [wedge(1.6, 1.2, 2.2, 0, 0.6, 0, 'yellow', 'body'), ...[0, 1, 2].map((i) => cyl(0.3, 0.06, (i - 1) * 0.5, 0.4 + i * 0.15, 0.6 - i * 0.4, 'gold', 'deco', [90, 0, 0]))];
  if (k === 'egg') return [ball(1.3, 1.7, 1.3, 0, 0.85, 0, 'cream', 'body')];
  if (k === 'friedegg') return [ball(2.4, 0.16, 2.0, 0, 0.08, 0, 'white', 'base'), ball(0.9, 0.45, 0.9, 0.2, 0.25, 0.1, 'yellow', 'body')];
  if (k === 'coxinha') return [ball(1.4, 1.2, 1.4, 0, 0.6, 0, 'orange', 'body'), cone(1.1, 1.3, 0, 1.5, 0, 'orange', 'body')];
  if (k === 'cup') return [cyl(1.4, 1.6, 0, 0.8, 0, 'a', 'body'), ring(1.0, 0.18, 0.75, 0.9, 0, 'a', 'deco', [90, 0, 0]), mat(cyl(1.2, 0.05, 0, 1.55, 0, 'b', 'deco'), 'jelly'), cyl(1.8, 0.08, 0, 0.04, 0, 'white', 'base')];
  if (k === 'bowl') return [ball(2.2, 1.2, 2.2, 0, 0.45, 0, 'b', 'base'), cyl(2.0, 0.12, 0, 0.95, 0, 'a', 'body'), ...[0, 1, 2].map((i) => ball(0.35, 0.3, 0.35, (i - 1) * 0.5, 1.05, 0.1, ['red', 'yellow', 'white'][i] as Slot, 'deco'))];
  if (k === 'bottle') return [cyl(1.0, 1.8, 0, 0.9, 0, 'a', 'body', undefined, 'glass'), cone(1.0, 0.6, 0, 2.1, 0, 'a', 'body', undefined, 'glass'), cyl(0.4, 0.4, 0, 2.5, 0, 'b', 'deco'), box(1.02, 0.6, 1.02, 0, 0.9, 0, 'c', 'deco')];
  return [ball(1.4, 1.4, 1.4, 0, 0.7, 0, 'a', 'body')];
};
export const sushi: Builder = () => [cyl(1.6, 0.9, 0, 0.45, 0, 'black', 'base'), cyl(1.4, 0.92, 0, 0.46, 0, 'white', 'body'), cyl(0.7, 0.94, 0, 0.47, 0, 'orange', 'deco')];

/* ================================ NATUREZA ================================ */
export const tree: Builder = (o) => {
  const k = s(o, 'k', 'round'),
    H = n(o, 'H', 3.2);
  if (k === 'pine') return [cyl(0.5, 1.2, 0, 0.6, 0, 'brown', 'body', undefined, 'wood'), cone(3, 2.2, 0, 2.0, 0, 'a', 'leaf'), cone(2.4, 1.9, 0, 3.0, 0, 'a', 'leaf'), cone(1.6, 1.6, 0, 4.0, 0, 'a', 'leaf'), mat(ball(0.4, 0.4, 0.4, 0, 4.9, 0, 'yellow', 'deco'), 'glow')];
  if (k === 'palm') {
    const p: GPart[] = [];
    for (let i = 0; i < 4; i++) p.push(cyl(0.45 - i * 0.04, 1.2, i * 0.18, 0.6 + i * 1.1, 0, 'tan', 'body', [0, 0, -8], 'wood'));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      p.push(ball(2.4, 0.12, 0.6, 0.6 + Math.cos(a) * 1.1, 4.6, Math.sin(a) * 1.1, 'a', 'leaf', [0, (-a * 180) / Math.PI, -18]));
    }
    p.push(ball(0.4, 0.4, 0.4, 0.75, 4.3, 0.2, 'brown', 'deco'), ball(0.4, 0.4, 0.4, 0.45, 4.3, -0.2, 'brown', 'deco'));
    return p;
  }
  if (k === 'cactus') return [cap(1.0, 3.2, 0, 1.6, 0, 'a', 'body'), cap(0.6, 1.2, 0.9, 1.9, 0, 'a', 'body'), cap(0.6, 1.0, -0.85, 2.3, 0, 'a', 'body'), cyl(0.5, 0.8, 0.6, 1.5, 0, 'a', 'body', [0, 0, 90]), cyl(0.5, 0.7, -0.55, 1.9, 0, 'a', 'body', [0, 0, 90]), ball(0.45, 0.35, 0.45, 0, 3.3, 0, 'pink', 'deco')];
  if (k === 'bush') return [ball(2.2, 1.5, 2.0, 0, 0.75, 0, 'a', 'leaf'), ball(1.4, 1.2, 1.4, 0.8, 0.9, 0.3, 'a', 'leaf'), ...[0, 1, 2].map((i) => ball(0.3, 0.3, 0.3, Math.cos(i * 2) * 0.8, 1.2, Math.sin(i * 2) * 0.7 + 0.4, 'red', 'deco'))];
  return [cyl(0.6, H * 0.55, 0, H * 0.27, 0, 'brown', 'body', undefined, 'wood'), ball(2.8, 2.4, 2.8, 0, H * 0.75, 0, 'a', 'leaf'), ball(1.8, 1.6, 1.8, 1.0, H * 0.65, 0.5, 'a', 'leaf'), ball(1.6, 1.5, 1.6, -0.9, H * 0.85, -0.3, 'a', 'leaf'), ...(b(o, 'fruit') ? [0, 1, 2].map((i) => ball(0.35, 0.35, 0.35, Math.cos(i * 2) * 1.1, H * 0.6, Math.sin(i * 2) * 1.0 + 0.6, 'c', 'deco')) : [])];
};
export const flower: Builder = (o) => {
  const H = n(o, 'H', 2.2),
    k = s(o, 'k', 'daisy');
  const p: GPart[] = [cyl(0.16, H, 0, H / 2, 0, 'green', 'body'), ball(0.8, 0.1, 0.35, 0.35, H * 0.4, 0, 'green', 'leaf', [0, 0, 25])];
  if (k === 'tulip') return [...p, ball(0.9, 1.0, 0.9, 0, H + 0.3, 0, 'a', 'body'), ...[0, 1, 2].map((i) => cone(0.45, 0.6, Math.cos(i * 2.1) * 0.25, H + 0.75, Math.sin(i * 2.1) * 0.25, 'a', 'deco'))];
  const r = k === 'sunflower' ? 0.9 : 0.6;
  p.push(cyl(r, 0.25, 0, H + 0.1, 0.05, 'c', 'body', [80, 0, 0]));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.push(ball(r * 0.75, r * 0.75, 0.15, Math.cos(a) * r * 0.8, H + 0.1 + Math.sin(a) * r * 0.8, 0, 'a', 'deco', [0, 0, (a * 180) / Math.PI]));
  }
  if (b(o, 'face')) p.push(...eyes(H + 0.2, 0.22, 0.15, 0.16));
  return p;
};
export const rock: Builder = (o) => {
  if (b(o, 'mountain')) return [mat(cone(6, 4.5, 0, 2.25, 0, 'a', 'body', [0, 20, 0]), 'stone'), cone(2.4, 1.6, 0, 3.75, 0, 'white', 'deco', [0, 20, 0]), mat(cone(3.5, 2.6, 2.2, 1.3, 1, 'a', 'body'), 'stone')];
  if (b(o, 'volcano')) return [mat(cone(6, 3.8, 0, 1.9, 0, 'a', 'body'), 'stone'), mat(cyl(1.6, 0.4, 0, 3.75, 0, 'orange', 'light'), 'glow'), ...[0, 1, 2].map((i) => mat(ball(0.5, 0.5, 0.5, (i - 1) * 0.4, 4.3 + i * 0.4, 0, ['orange', 'yellow', 'red'][i] as Slot, 'light'), 'glow'))];
  if (b(o, 'island')) return [ball(5, 1.2, 4, 0, 0.3, 0, 'tan', 'base'), ...tree({ k: 'palm' }, () => 0.5).map((q) => ((q.pos[1] += 0.6), q))];
  return [mat(ball(2.0, 1.4, 1.7, 0, 0.7, 0, 'a', 'body', [0, 20, 10]), 'stone'), mat(ball(1.1, 0.9, 1.0, 0.9, 0.45, 0.6, 'a', 'body'), 'stone')];
};
export const sky: Builder = (o) => {
  const k = s(o, 'k', 'cloud');
  if (k === 'sun') {
    const p: GPart[] = [mat(ball(2.2, 2.2, 2.2, 0, 2.2, 0, 'yellow', 'body'), 'glow')];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.push(mat(cone(0.5, 0.9, Math.cos(a) * 1.6, 2.2 + Math.sin(a) * 1.6, 0, 'orange', 'deco', [0, 0, (a * 180) / Math.PI - 90]), 'glow'));
    }
    p.push(...eyes(2.5, 1.0, 0.4, 0.35));
    return p;
  }
  if (k === 'moon') return [mat(ball(2.4, 2.4, 1.2, 0, 1.6, 0, 'cream', 'body'), 'glow'), ball(1.9, 2.0, 1.2, 0.85, 1.75, 0.1, 'navy', 'deco'), ball(0.3, 0.3, 0.2, -0.6, 1.2, 0.5, 'tan', 'deco')];
  if (k === 'star') {
    const p: GPart[] = [mat(cyl(1.1, 0.5, 0, 1.6, 0, 'yellow', 'body', [90, 0, 0]), 'glow')];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI / 2;
      p.push(mat(cone(0.8, 1.2, Math.cos(a) * 0.85, 1.6 + Math.sin(a) * 0.85, 0, 'yellow', 'body', [0, 0, (a * 180) / Math.PI - 90]), 'glow'));
    }
    p.push(...eyes(1.75, 0.3, 0.25, 0.25));
    return p;
  }
  if (k === 'rainbow') {
    const cols: Slot[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    const p: GPart[] = [];
    for (let i = 0; i < 6; i++) p.push(ring(6 - i * 0.6, 0.32, 0, 0, 0, cols[i], 'body', [90, 0, 0]));
    p.push(ball(1.6, 1.0, 1.0, -2.8, 0.3, 0, 'white', 'base'), ball(1.6, 1.0, 1.0, 2.8, 0.3, 0, 'white', 'base'));
    return p;
  }
  if (k === 'snowman') return [ball(2, 1.9, 2, 0, 0.95, 0, 'white', 'body'), ball(1.5, 1.4, 1.5, 0, 2.4, 0, 'white', 'body'), ball(1.1, 1.05, 1.1, 0, 3.55, 0, 'white', 'head'), cone(0.22, 0.6, 0, 3.55, 0.75, 'orange', 'head', [90, 0, 0]), ...eyes(3.75, 0.48, 0.2, 0.2), box(1.6, 0.25, 0.25, 0, 3.05, 0.1, 'red', 'deco'), cyl(0.9, 0.7, 0, 4.25, 0, 'black', 'deco'), cyl(1.3, 0.08, 0, 3.95, 0, 'black', 'deco')];
  return [ball(2.6, 1.5, 1.8, 0, 1.0, 0, 'white', 'body'), ball(1.8, 1.4, 1.5, -1.3, 0.85, 0.2, 'white', 'body'), ball(1.9, 1.6, 1.5, 1.2, 1.2, -0.1, 'white', 'body'), ...(b(o, 'face') ? eyes(1.2, 0.85, 0.35, 0.3) : [])];
};

/* ================================ ROBÔS / MÁQUINAS ================================ */
export const robot: Builder = (o) => {
  const H = n(o, 'H', 1.3),
    W = n(o, 'W', 1.2),
    leg = n(o, 'leg', 0.8);
  const p: GPart[] = [box(W, H, W * 0.75, 0, leg + H / 2, 0, 'a', 'body', undefined, 'metal')];
  p.push(mat(box(W * 0.55, H * 0.4, 0.06, 0, leg + H * 0.55, W * 0.38, 'c', 'light'), 'glow'));
  const hs = n(o, 'head', 0.85);
  p.push(box(hs, hs * 0.8, hs * 0.8, 0, leg + H + hs * 0.45, 0, 'b', 'head', undefined, 'metal'));
  for (const sd of [-1, 1]) p.push(mat(ball(hs * 0.24, hs * 0.24, 0.1, sd * hs * 0.22, leg + H + hs * 0.5, hs * 0.41, 'sky', 'eye'), 'glow'));
  p.push(cyl(0.06, 0.45, 0, leg + H + hs * 0.9 + 0.22, 0, 'gray', 'deco', undefined, 'metal'), mat(ball(0.2, 0.2, 0.2, 0, leg + H + hs * 0.9 + 0.5, 0, 'red', 'light'), 'glow'));
  let ph = 1;
  for (const sd of [-1, 1]) {
    p.push(walkLeg(box(W * 0.3, leg, W * 0.35, sd * W * 0.25, leg / 2, 0, 'b', 'leg', undefined, 'metal'), leg, ph, 2, 18));
    p.push(joint(box(W * 0.24, H * 0.85, W * 0.24, sd * (W / 2 + W * 0.15), leg + H * 0.5, 0, 'b', 'arm', undefined, 'metal'), 'hinge', 'x', 2 * ph, 22, [sd * (W / 2 + W * 0.15), leg + H * 0.9, 0]));
    p.push(ball(W * 0.3, W * 0.3, W * 0.3, sd * (W / 2 + W * 0.15), leg + H * 0.02, 0, 'c', 'arm', undefined, 'metal'));
    ph = -ph;
  }
  if (b(o, 'treads')) {
    p.splice(p.findIndex((q) => q.tag === 'leg'), 1);
    p.push(cap(0.6, 1.6, 0, 0.3, 0, 'black', 'wheel', [90, 0, 0], 'rubber'));
  }
  return p;
};
export const drone: Builder = () => {
  const p: GPart[] = [box(1.2, 0.4, 1.2, 0, 0.9, 0, 'a', 'body', undefined, 'metal'), mat(ball(0.5, 0.4, 0.3, 0, 0.8, 0.6, 'sky', 'eye'), 'glass')];
  for (const [x, z] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    p.push(box(0.12, 0.1, 0.9, x * 0.6, 0.95, z * 0.6, 'b', 'deco', [0, 45 * x * z, 0]));
    p.push(joint(box(1.0, 0.04, 0.16, x * 0.9, 1.1, z * 0.9, 'gray', 'prop'), 'spin', 'y', 4));
  }
  p.push(box(0.1, 0.5, 0.1, -0.4, 0.45, 0, 'gray', 'leg'), box(0.1, 0.5, 0.1, 0.4, 0.45, 0, 'gray', 'leg'));
  return p;
};
export const machine: Builder = (o) => {
  const k = s(o, 'k', 'fan');
  if (k === 'fan') return [cyl(1.0, 0.15, 0, 0.08, 0, 'b', 'base'), cyl(0.15, 1.5, 0, 0.8, 0, 'b', 'body', undefined, 'metal'), ring(1.9, 0.12, 0, 1.8, 0.1, 'a', 'body', [90, 0, 0], 'metal'), ...rotor(0, 1.8, 0.1, 1.7, 'a', 'z')];
  if (k === 'magnet') return [ring(1.8, 0.55, 0, 0.9, 0, 'red', 'body', [90, 0, 0], 'metal'), box(0.55, 0.5, 0.6, -0.65, 0.25, 0, 'silver', 'deco', undefined, 'metal'), box(0.55, 0.5, 0.6, 0.65, 0.25, 0, 'silver', 'deco', undefined, 'metal')];
  if (k === 'catapult') return [box(1.6, 0.3, 2.4, 0, 0.5, 0, 'brown', 'base', undefined, 'wood'), ...wheel(-0.9, 0.35, 0.8, 0.7, 0.2, 'brown'), ...wheel(0.9, 0.35, -0.8, 0.7, 0.2, 'brown'), box(0.2, 1.4, 0.2, 0, 1.2, -0.3, 'brown', 'deco', undefined, 'wood'), joint(box(0.2, 0.2, 2.4, 0, 1.1, 0.2, 'tan', 'deco', [-20, 0, 0], 'wood'), 'hinge', 'x', 0.8, 25, [0, 0.9, -0.6]), ball(0.6, 0.4, 0.6, 0, 1.45, 1.3, 'a', 'deco')];
  if (k === 'blaster') return [cyl(0.8, 2.6, 0, 1.0, 0.3, 'a', 'body', [90, 0, 0]), cyl(1.0, 0.3, 0, 1.0, 1.6, 'b', 'deco', [90, 0, 0]), box(0.35, 0.9, 0.4, 0, 0.45, -0.3, 'c', 'base'), ball(1.0, 1.0, 1.0, 0, 1.75, -0.6, 'b', 'deco', undefined, 'glass'), mat(ball(0.6, 0.6, 0.6, 0, 1.75, -0.6, 'white', 'deco'), 'jelly')];
  if (k === 'cannon') return [cyl(0.9, 2.4, 0, 1.0, 0.6, 'a', 'body', [70, 0, 0], 'metal'), ...wheel(-0.6, 0.55, 0, 1.1, 0.2, 'brown'), ...wheel(0.6, 0.55, 0, 1.1, 0.2, 'brown'), box(1.0, 0.4, 1.4, 0, 0.6, -0.1, 'b', 'base', undefined, 'wood'), ring(0.95, 0.12, 0, 1.4, 1.75, 'c', 'deco', [70, 0, 0])];
  if (k === 'popper') return [ball(1.6, 1.6, 1.6, 0, 0.8, 0, 'a', 'body'), cyl(0.2, 0.6, 0, 1.8, 0, 'tan', 'deco'), mat(ball(0.25, 0.25, 0.25, 0, 2.15, 0, 'yellow', 'light'), 'glow'), ...[0, 1, 2].map((i) => ball(0.25, 0.25, 0.08, Math.cos(i * 2) * 0.4, 0.9 + Math.sin(i * 2) * 0.4, 0.78, ['pink', 'yellow', 'sky'][i] as Slot, 'deco'))];
  if (k === 'washer') return [box(1.6, 1.8, 1.4, 0, 0.9, 0, 'white', 'body'), mat(cyl(1.0, 0.1, 0, 0.85, 0.71, 'sky', 'deco', [90, 0, 0]), 'glass'), ring(1.1, 0.1, 0, 0.85, 0.72, 'gray', 'deco', [90, 0, 0]), box(1.4, 0.25, 0.06, 0, 1.6, 0.71, 'gray', 'deco')];
  if (k === 'clock') return [cyl(2.0, 0.3, 0, 1.4, 0, 'a', 'body', [90, 0, 0]), cyl(1.7, 0.05, 0, 1.4, 0.16, 'white', 'deco', [90, 0, 0]), box(0.08, 0.6, 0.04, 0, 1.65, 0.2, 'black', 'deco'), box(0.4, 0.08, 0.04, 0.18, 1.4, 0.2, 'black', 'deco'), ball(0.5, 0.5, 0.3, -0.6, 2.4, 0, 'gold', 'deco'), ball(0.5, 0.5, 0.3, 0.6, 2.4, 0, 'gold', 'deco'), cyl(0.15, 0.4, -0.5, 0.25, 0, 'b', 'leg'), cyl(0.15, 0.4, 0.5, 0.25, 0, 'b', 'leg')];
  if (k === 'satellite') return [box(1.0, 1.0, 1.0, 0, 1.2, 0, 'silver', 'body', undefined, 'metal'), box(2.2, 0.05, 0.9, -1.6, 1.2, 0, 'navy', 'wing', undefined, 'glass'), box(2.2, 0.05, 0.9, 1.6, 1.2, 0, 'navy', 'wing', undefined, 'glass'), cone(0.9, 0.5, 0, 1.95, 0, 'white', 'deco', [180, 0, 0]), cyl(0.06, 0.5, 0, 2.4, 0, 'gray', 'deco')];
  if (k === 'telescope') return [cyl(0.6, 2.6, 0, 1.8, 0.3, 'a', 'body', [55, 0, 0], 'metal'), cyl(0.8, 0.3, 0, 2.55, 1.35, 'b', 'deco', [55, 0, 0]), cyl(0.06, 1.5, -0.3, 0.75, -0.2, 'b', 'leg', [15, 0, 15]), cyl(0.06, 1.5, 0.3, 0.75, -0.2, 'b', 'leg', [15, 0, -15]), cyl(0.06, 1.5, 0, 0.75, 0.35, 'b', 'leg', [-15, 0, 0])];
  return [box(1.4, 1.4, 1.4, 0, 0.7, 0, 'a', 'body', undefined, 'metal')];
};

/* ================================ BRINQUEDOS / OBJETOS ================================ */
export const toy: Builder = (o) => {
  const k = s(o, 'k', 'ball');
  if (k === 'ball') {
    const D = n(o, 'D', 1.6);
    return [mat(ball(D, D, D, 0, D / 2, 0, 'a', 'body'), 'rubber'), ring(D * 1.01, 0.1, 0, D / 2, 0, 'b', 'deco', [90, 0, 0]), ring(D * 1.01, 0.1, 0, D / 2, 0, 'c', 'deco', [0, 0, 90])];
  }
  if (k === 'beachball') return [ball(1.8, 1.8, 1.8, 0, 0.9, 0, 'white', 'body'), ...(['red', 'yellow', 'blue', 'green'] as Slot[]).map((c, i) => ball(0.35, 1.82, 1.82, 0, 0.9, 0, c, 'deco', [0, i * 45, 0]))];
  if (k === 'kite') return [box(1.8, 2.4, 0.06, 0, 2.6, 0, 'a', 'body', [0, 0, 45]), box(0.06, 3.2, 0.08, 0, 2.6, 0.04, 'b', 'deco'), box(2.4, 0.06, 0.08, 0, 2.8, 0.04, 'b', 'deco'), ...[0, 1, 2].map((i) => box(0.3, 0.2, 0.05, 0, 1.0 - i * 0.4, 0, ['red', 'yellow', 'blue'][i] as Slot, 'tail'))];
  if (k === 'top') return [joint(cone(1.6, 1.2, 0, 0.6, 0, 'a', 'body', [180, 0, 0]), 'spin', 'y', 3), joint(cyl(1.6, 0.4, 0, 1.4, 0, 'b', 'body'), 'spin', 'y', 3), joint(cyl(0.2, 0.6, 0, 1.9, 0, 'c', 'deco'), 'spin', 'y', 3)];
  if (k === 'yoyo') return [cyl(1.4, 0.4, -0.3, 0.7, 0, 'a', 'body', [0, 0, 90]), cyl(1.4, 0.4, 0.3, 0.7, 0, 'a', 'body', [0, 0, 90]), cyl(0.4, 0.3, 0, 0.7, 0, 'b', 'deco', [0, 0, 90])];
  if (k === 'dice') return [box(1.4, 1.4, 1.4, 0, 0.7, 0, 'white', 'body'), ...[0, 1, 2].map((i) => ball(0.25, 0.25, 0.1, (i - 1) * 0.4, 0.3 + i * 0.4, 0.7, 'black', 'deco')), ball(0.25, 0.1, 0.25, 0, 1.4, 0, 'red', 'deco')];
  if (k === 'cube') return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => box(0.68, 0.68, 0.68, (i & 1 ? 0.35 : -0.35), (i & 2 ? 1.05 : 0.35), (i & 4 ? 0.35 : -0.35), (['red', 'blue', 'yellow', 'green', 'orange', 'white', 'purple', 'lime'] as Slot[])[i], 'body'));
  if (k === 'balloon') return [ball(1.4, 1.7, 1.4, 0, 2.6, 0, 'a', 'body'), cone(0.3, 0.3, 0, 1.7, 0, 'a', 'deco', [180, 0, 0]), cyl(0.04, 1.6, 0, 0.8, 0, 'white', 'deco')];
  if (k === 'bubble') return [mat(ball(2, 2, 2, 0, 1, 0, 'sky', 'body'), 'glass'), mat(ball(0.4, 0.3, 0.1, -0.5, 1.5, 0.95, 'white', 'deco'), 'glow')];
  if (k === 'teddy') return biped({ H: 1.0, W: 1.0, leg: 0.35, head: 0.85, arm: 0.6, snout: 0.2, ears: 'round' }, () => 0.5);
  if (k === 'duck') return [...bird({ L: 1.3, H: 1.1, head: 0.75, leg: 0.05, span: 0.5, tail: 'fan', swing: 6 }, () => 0.5)];
  if (k === 'box') return [box(1.6, 1.4, 1.6, 0, 0.7, 0, 'a', 'body'), box(1.65, 1.45, 0.3, 0, 0.72, 0, 'b', 'deco'), box(0.3, 1.45, 1.65, 0, 0.72, 0, 'b', 'deco'), ring(0.6, 0.18, -0.3, 1.55, 0, 'b', 'deco', [90, 30, 0]), ring(0.6, 0.18, 0.3, 1.55, 0, 'b', 'deco', [90, -30, 0])];
  if (k === 'chest') return [box(2.0, 1.1, 1.3, 0, 0.55, 0, 'brown', 'body', undefined, 'wood'), cyl(1.3, 2.0, 0, 1.1, 0, 'brown', 'body', [0, 0, 90], 'wood'), box(2.05, 0.15, 1.35, 0, 1.0, 0, 'gold', 'deco', undefined, 'metal'), box(0.3, 0.4, 0.1, 0, 0.9, 0.68, 'gold', 'deco', undefined, 'metal'), ...[0, 1, 2].map((i) => mat(ball(0.35, 0.35, 0.35, (i - 1) * 0.5, 1.7, 0, 'gold', 'deco'), 'glow'))];
  if (k === 'sandcastle') return [box(2.6, 1.0, 2.0, 0, 0.5, 0, 'tan', 'wall'), cyl(0.8, 1.6, -1.1, 0.8, 0.8, 'tan', 'wall'), cyl(0.8, 1.6, 1.1, 0.8, 0.8, 'tan', 'wall'), cone(1.0, 0.7, -1.1, 1.95, 0.8, 'tan', 'roof'), cone(1.0, 0.7, 1.1, 1.95, 0.8, 'tan', 'roof'), cyl(1.0, 1.0, 0, 1.5, -0.2, 'tan', 'wall'), box(0.5, 0.35, 0.03, 0.2, 2.6, -0.2, 'red', 'deco'), cyl(0.04, 0.8, 0, 2.4, -0.2, 'white', 'deco')];
  if (k === 'rockinghorse') return [joint(ball(0.6, 0.7, 1.4, 0, 1.3, 0, 'a', 'body'), 'hinge', 'x', 0.7, 10, [0, 0.2, 0]), joint(ball(0.5, 0.6, 0.7, 0, 1.9, 0.75, 'a', 'head'), 'hinge', 'x', 0.7, 10, [0, 0.2, 0]), joint(ring(2.4, 0.15, 0, 0.6, 0, 'b', 'base', [0, 90, 0]), 'hinge', 'x', 0.7, 10, [0, 0.2, 0]), ...eyes(2.05, 1.08, 0.15, 0.15)];
  if (k === 'boot') return [box(1.0, 1.8, 1.0, 0, 0.9, -0.2, 'a', 'body'), ball(1.1, 0.8, 1.8, 0, 0.4, 0.35, 'a', 'body'), box(1.1, 0.2, 2.0, 0, 0.1, 0.25, 'b', 'base'), ring(1.0, 0.15, 0, 1.75, -0.2, 'b', 'deco')];
  if (k === 'hat') return [cyl(2.4, 0.12, 0, 0.06, 0, 'a', 'base'), cyl(1.4, 1.4, 0, 0.75, 0, 'a', 'body'), cyl(1.42, 0.25, 0, 0.3, 0, 'b', 'deco')];
  if (k === 'crown') return [ring(1.8, 0.3, 0, 0.3, 0, 'gold', 'body', undefined, 'metal'), ...[0, 1, 2, 3, 4].map((i) => cone(0.4, 0.8, Math.cos(i * 1.257) * 0.85, 0.75, Math.sin(i * 1.257) * 0.85, 'gold', 'deco', undefined, 'metal')), ...[0, 1, 2].map((i) => mat(ball(0.25, 0.25, 0.25, Math.cos(i * 2.1) * 0.9, 0.35, Math.sin(i * 2.1) * 0.9, ['red', 'blue', 'green'][i] as Slot, 'deco'), 'glass'))];
  if (k === 'umbrella') return [cone(3.2, 1.1, 0, 2.6, 0, 'a', 'body'), cyl(0.1, 2.6, 0, 1.3, 0, 'b', 'deco'), ring(0.5, 0.1, 0.25, 0.05, 0, 'b', 'deco', [90, 0, 0]), ball(0.2, 0.2, 0.2, 0, 3.2, 0, 'c', 'deco')];
  if (k === 'backpack') return [box(1.4, 1.8, 0.8, 0, 0.9, 0, 'a', 'body'), box(1.0, 0.8, 0.3, 0, 0.6, 0.5, 'b', 'deco'), ring(0.9, 0.12, 0, 1.85, 0, 'b', 'deco', [90, 0, 0])];
  if (k === 'book') return [box(1.8, 0.4, 2.4, 0, 0.2, 0, 'a', 'body'), box(1.7, 0.36, 2.3, 0.05, 0.2, 0, 'white', 'deco'), box(0.3, 0.42, 2.42, -0.8, 0.2, 0, 'b', 'deco')];
  if (k === 'pencil') return [cyl(0.6, 3.0, 0, 0.3, 0, 'yellow', 'body', [90, 0, 0]), cone(0.6, 0.7, 0, 0.3, 1.85, 'tan', 'deco', [90, 0, 0]), cone(0.2, 0.25, 0, 0.3, 2.15, 'black', 'deco', [90, 0, 0]), cyl(0.62, 0.3, 0, 0.3, -1.6, 'pink', 'deco', [90, 0, 0]), cyl(0.63, 0.2, 0, 0.3, -1.4, 'silver', 'deco', [90, 0, 0], 'metal')];
  if (k === 'key') return [ring(1.0, 0.25, 0, 1.6, 0, 'gold', 'body', [90, 0, 0], 'metal'), box(0.25, 1.6, 0.2, 0, 0.6, 0, 'gold', 'body', undefined, 'metal'), box(0.5, 0.2, 0.2, 0.25, 0.1, 0, 'gold', 'deco', undefined, 'metal'), box(0.4, 0.2, 0.2, 0.2, 0.45, 0, 'gold', 'deco', undefined, 'metal')];
  if (k === 'bell') return [cone(1.6, 1.6, 0, 0.9, 0, 'gold', 'body', undefined, 'metal'), ball(1.0, 0.8, 1.0, 0, 1.6, 0, 'gold', 'body', undefined, 'metal'), ball(0.4, 0.4, 0.4, 0, 0.1, 0, 'b', 'deco'), ring(0.4, 0.1, 0, 2.05, 0, 'gold', 'deco', [90, 0, 0], 'metal')];
  if (k === 'trophy') return [box(1.2, 0.4, 1.2, 0, 0.2, 0, 'brown', 'base', undefined, 'wood'), cyl(0.3, 0.8, 0, 0.8, 0, 'gold', 'body', undefined, 'metal'), cone(1.6, 1.4, 0, 1.9, 0, 'gold', 'body', [180, 0, 0], 'metal'), ring(0.6, 0.12, -0.85, 2.0, 0, 'gold', 'deco', [90, 0, 0], 'metal'), ring(0.6, 0.12, 0.85, 2.0, 0, 'gold', 'deco', [90, 0, 0], 'metal')];
  if (k === 'wand') return [cyl(0.15, 2.2, 0, 1.1, 0, 'b', 'body', [0, 0, 15]), ...sky({ k: 'star' }, () => 0.5).map((q) => ((q.size = q.size.map((v) => v * 0.5) as V3), (q.pos = [q.pos[0] * 0.5 - 0.35, q.pos[1] * 0.5 + 1.65, q.pos[2] * 0.5]), q))];
  if (k === 'potion') return [mat(ball(1.4, 1.4, 1.4, 0, 0.7, 0, 'a', 'body'), 'glass'), mat(ball(1.1, 0.9, 1.1, 0, 0.55, 0, 'a', 'light'), 'glow'), cyl(0.5, 0.6, 0, 1.6, 0, 'a', 'body', undefined, 'glass'), cyl(0.45, 0.35, 0, 2.0, 0, 'brown', 'deco', undefined, 'wood')];
  if (k === 'cauldron') return [ball(2.0, 1.6, 2.0, 0, 1.0, 0, 'black', 'body', undefined, 'metal'), ring(1.8, 0.2, 0, 1.75, 0, 'black', 'deco', undefined, 'metal'), mat(cyl(1.6, 0.1, 0, 1.7, 0, 'lime', 'light'), 'glow'), ...[0, 1, 2].map((i) => cyl(0.2, 0.5, Math.cos(i * 2.1) * 0.6, 0.2, Math.sin(i * 2.1) * 0.6, 'black', 'leg', undefined, 'metal'))];
  if (k === 'broom') return [cyl(0.15, 3.2, 0, 0.5, 0.2, 'brown', 'body', [80, 0, 0], 'wood'), cone(0.9, 1.0, 0, 0.45, -1.7, 'tan', 'deco', [-90, 0, 0])];
  if (k === 'bucket') return [cyl(1.4, 1.4, 0, 0.7, 0, 'a', 'body'), ring(1.4, 0.1, 0, 1.4, 0, 'b', 'deco'), ring(1.3, 0.06, 0, 1.6, 0, 'gray', 'deco', [90, 0, 0], 'metal')];
  if (k === 'shield') return [cyl(2.2, 0.3, 0, 1.4, 0, 'a', 'body', [90, 0, 0]), ring(2.2, 0.15, 0, 1.4, 0.15, 'b', 'deco', [90, 0, 0]), sky({ k: 'star' }, () => 0.5)[0]].map((q, i) => (i === 2 ? ((q.size = [0.8, 0.2, 0.8]), (q.pos = [0, 1.4, 0.2]), q) : q));
  if (k === 'flag') return [cyl(0.12, 3.6, 0, 1.8, 0, 'gray', 'body', undefined, 'metal'), joint(box(1.8, 1.1, 0.06, 0.95, 3.0, 0, 'a', 'deco'), 'hinge', 'y', 1.4, 10, [0, 3.0, 0]), ball(0.3, 0.3, 0.3, 0, 3.7, 0, 'gold', 'deco')];
  if (k === 'totem') return [box(1.2, 1.0, 1.2, 0, 0.5, 0, 'a', 'body'), box(1.2, 1.0, 1.2, 0, 1.5, 0, 'b', 'body'), box(1.2, 1.0, 1.2, 0, 2.5, 0, 'c', 'body'), ...eyes(2.6, 0.62, 0.25, 0.3), box(1.6, 0.3, 0.3, 0, 1.6, 0, 'b', 'deco')];
  if (k === 'glasses') return [ring(1.0, 0.15, -0.6, 1, 0, 'a', 'body', [90, 0, 0]), ring(1.0, 0.15, 0.6, 1, 0, 'a', 'body', [90, 0, 0]), mat(cyl(0.9, 0.05, -0.6, 1, 0, 'sky', 'deco', [90, 0, 0]), 'glass'), mat(cyl(0.9, 0.05, 0.6, 1, 0, 'sky', 'deco', [90, 0, 0]), 'glass'), box(0.3, 0.1, 0.1, 0, 1.05, 0, 'a', 'deco')];
  if (k === 'mic') return [ball(0.8, 0.8, 0.8, 0, 2.3, 0, 'gray', 'body', undefined, 'metal'), cyl(0.3, 1.0, 0, 1.6, 0, 'black', 'body'), cyl(0.12, 1.2, 0, 0.6, 0, 'silver', 'deco', undefined, 'metal'), cyl(1.0, 0.1, 0, 0.05, 0, 'black', 'base')];
  if (k === 'anchor') return [box(0.3, 2.2, 0.3, 0, 1.4, 0, 'gray', 'body', undefined, 'metal'), ring(1.8, 0.25, 0, 0.6, 0, 'gray', 'body', [90, 0, 0], 'metal'), box(1.2, 0.25, 0.25, 0, 2.2, 0, 'gray', 'deco', undefined, 'metal'), ring(0.6, 0.15, 0, 2.7, 0, 'gray', 'deco', [90, 0, 0], 'metal')];
  if (k === 'spoon') return [box(0.25, 0.15, 2.6, 0, 0.2, -0.8, 'silver', 'body', undefined, 'metal'), ball(1.0, 0.3, 1.4, 0, 0.25, 1.0, 'silver', 'body', undefined, 'metal')];
  if (k === 'sword') return [mat(box(0.4, 2.6, 0.12, 0, 2.0, 0, 'a', 'body'), 'rubber'), mat(cone(0.4, 0.4, 0, 3.5, 0, 'a', 'body', undefined, 'rubber'), 'rubber'), box(1.0, 0.2, 0.25, 0, 0.7, 0, 'b', 'deco'), cyl(0.25, 0.6, 0, 0.3, 0, 'c', 'base')];
  if (k === 'hammer') return [cyl(0.2, 2.0, 0, 1.0, 0, 'brown', 'body', undefined, 'wood'), mat(box(1.2, 0.6, 0.6, 0, 2.1, 0, 'a', 'body'), 'rubber')];
  if (k === 'present') return toy({ k: 'box' }, () => 0.5);
  if (k === 'doll') return biped({ H: 1.1, W: 0.7, leg: 0.6, head: 0.75, arm: 0.6, snout: 0, ears: 'none' }, () => 0.5).concat([ball(0.85, 0.5, 0.8, 0, 2.55, -0.08, 'c', 'deco'), cone(1.3, 0.8, 0, 0.95, 0, 'b', 'deco')]);
  return [ball(1.4, 1.4, 1.4, 0, 0.7, 0, 'a', 'body')];
};

/** fantasma / geleca / alien redondo / bichinho misterioso */
export const blob: Builder = (o) => {
  const H = n(o, 'H', 1.8),
    W = n(o, 'W', 1.5);
  const p: GPart[] = [ball(W, H, W, 0, H / 2, 0, 'a', 'body', undefined, (s(o, 'm', 'plastic') as GPart['mat']) || 'plastic')];
  if (b(o, 'ghost')) p.push(...[-1, 0, 1].map((i) => cone(W * 0.36, 0.5, i * W * 0.3, 0.1, 0, 'a', 'body', [180, 0, 0])));
  p.push(...eyes(H * 0.62, W * 0.42, W * 0.18, W * 0.22));
  p.push(ball(W * 0.3, W * 0.12, 0.1, 0, H * 0.4, W * 0.48, 'c', 'deco'));
  if (b(o, 'antenna')) for (const sd of [-1, 1]) p.push(cyl(0.06, 0.6, sd * 0.3, H + 0.2, 0, 'b', 'deco', [0, 0, -sd * 20]), mat(ball(0.25, 0.25, 0.25, sd * 0.42, H + 0.5, 0, 'b', 'deco'), 'glow'));
  if (b(o, 'horns')) for (const sd of [-1, 1]) p.push(cone(0.3, 0.5, sd * W * 0.3, H * 0.95, 0, 'b', 'deco', [0, 0, -sd * 20]));
  if (b(o, 'arms')) for (const sd of [-1, 1]) p.push(joint(cap(0.3, 0.9, sd * W * 0.55, H * 0.45, 0, 'a', 'arm', [0, 0, sd * 40]), 'hinge', 'z', 2 * sd, 25, [sd * W * 0.4, H * 0.55, 0]));
  if (b(o, 'feet')) for (const sd of [-1, 1]) p.push(ball(0.5, 0.3, 0.6, sd * W * 0.25, 0.1, 0.1, 'b', 'leg'));
  if (b(o, 'tentacles')) for (let i = 0; i < 6; i++) p.push(joint(cap(0.3, 1.2, Math.cos(i) * W * 0.4, 0.3, Math.sin(i) * W * 0.4, 'a', 'leg', [Math.sin(i) * 40, 0, -Math.cos(i) * 40]), 'hinge', 'x', 1.5, 15, [Math.cos(i) * W * 0.3, 0.6, Math.sin(i) * W * 0.3]));
  if (b(o, 'face')) p.push(ball(W * 0.2, W * 0.2, 0.1, -W * 0.3, H * 0.48, W * 0.42, 'pink', 'deco'), ball(W * 0.2, W * 0.2, 0.1, W * 0.3, H * 0.48, W * 0.42, 'pink', 'deco'));
  return p;
};

/** todos os arquétipos por nome (o catálogo e a IA usam estes nomes) */
export const BUILDERS: Record<string, Builder> = {
  quad, biped, bird, fish, bug, snake, dragon, car, truck, bus, train, plane, heli, rocket, boat, ship, sub, bike, balloonCraft, ufo, sled, tank, tractor, cart,
  house, castle, tower, tent, treehouse, bridge, stairs, slide, trampoline, swing, ferris, carousel, pool, wall, pyramid, windmill, stage,
  chair, table, bed, cabinet, screen, lamp, instrument, pizza, burger, icecream, cake, donut, fruit, longFruit, sandwich, sweet, sushi,
  tree, flower, rock, sky, robot, drone, machine, toy, blob,
};
