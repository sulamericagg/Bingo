/* ============================================================
 *  NIGHTKIT — paredes com acabamento (dois lados independentes):
 *  meia-parede (lambri) + papel de parede, rodapé, guarda-cadeira,
 *  moldura de teto, batentes e guarnições nas portas/janelas.
 *  Cada lado pertence à zona (sala) dele → mesclado com a sala.
 *  Os colisores saem daqui também (janela = parede para colisão).
 * ============================================================ */
import type { MapKit } from './kit';
import { sbox } from './kit';

export interface Side {
  zone: string;
  /** material do papel/acabamento de cima */
  paper: string;
  paperCol?: string;
  /** meia-parede (material + cor + altura) */
  low?: string;
  lowCol?: string;
  lowH?: number;
  /** cor do rodapé/guarnições (material 'trim') */
  trim?: string;
  /** moldura no teto */
  crown?: boolean;
}

export interface Hole {
  /** posição do CENTRO do vão ao longo da parede (m a partir de `from`) */
  at: number;
  w: number;
  h: number;
  /** peitoril (0 = porta) */
  sill?: number;
  /** sem guarnição (passagem aberta / arco simples) */
  bare?: boolean;
  /** vão de porta é bloqueado para colisão (porta fixa / vidro) */
  block?: boolean;
}

export interface WallSpec {
  /** 'x' = parede corre ao longo de X (z fixo); 'z' = ao longo de Z (x fixo) */
  axis: 'x' | 'z';
  /** coordenada fixa (z para axis x; x para axis z) */
  at: number;
  from: number;
  to: number;
  h: number;
  t?: number;
  holes?: Hole[];
  /** lado negativo (−z ou −x) e positivo (+z ou +x) */
  neg?: Side | null;
  pos?: Side | null;
  /** material/cor do miolo quando um lado é null (fachada) */
  y0?: number;
}

const TRIM_D = 0.022;

export function wall(k: MapKit, w: WallSpec): void {
  const t = w.t ?? 0.14;
  const y0 = w.y0 ?? 0;
  const holes = (w.holes ?? []).slice().sort((a, b) => a.at - b.at);
  const L = w.to - w.from;
  // trechos sólidos (u0,u1) em coordenada local 0..L
  const solids: [number, number][] = [];
  let u = 0;
  for (const h of holes) {
    const a = h.at - h.w / 2;
    if (a > u + 1e-3) solids.push([u, a]);
    u = h.at + h.w / 2;
  }
  if (L > u + 1e-3) solids.push([u, L]);

  // portais (corte de visibilidade por sala): todo vão com sala dos dois lados
  if (w.neg && w.pos && w.neg.zone !== w.pos.zone)
    for (const h of holes) {
      const u0 = w.from + h.at - h.w / 2;
      const u1 = w.from + h.at + h.w / 2;
      const ya = y0 + (h.sill ?? 0);
      const yb = ya + h.h;
      if (w.axis === 'x') k.portal(w.neg.zone, w.pos.zone, u0, ya, w.at - t / 2, u1, yb, w.at + t / 2);
      else k.portal(w.neg.zone, w.pos.zone, w.at - t / 2, ya, u0, w.at + t / 2, yb, u1);
    }
  // colisores
  for (const [a, b] of solids) col(k, w, a, b, t, y0);
  for (const h of holes) if (h.sill || h.block) col(k, w, h.at - h.w / 2, h.at + h.w / 2, t, y0);

  for (const sgn of [-1, 1] as const) {
    const side = sgn < 0 ? w.neg : w.pos;
    if (!side) continue;
    const off = (sgn * t) / 4;
    const lowH = side.low ? side.lowH ?? 1 : 0;
    // painéis: [u0,u1,ya,yb]
    const panels: [number, number, number, number][] = [];
    for (const [a, b] of solids) panels.push([a, b, 0, w.h]);
    for (const h of holes) {
      const a = h.at - h.w / 2;
      const b = h.at + h.w / 2;
      const top = (h.sill ?? 0) + h.h;
      if (top < w.h - 1e-3) panels.push([a, b, top, w.h]);
      if (h.sill) panels.push([a, b, 0, h.sill]);
    }
    for (const [a, b, ya, yb] of panels) {
      if (lowH > 0 && ya < lowH) {
        slab(k, side.zone, side.low!, side.lowCol ?? '#ffffff', w, a, b, ya, Math.min(yb, lowH), off, t / 2, y0);
        if (yb > lowH) slab(k, side.zone, side.paper, side.paperCol ?? '#ffffff', w, a, b, lowH, yb, off, t / 2, y0);
      } else slab(k, side.zone, side.paper, side.paperCol ?? '#ffffff', w, a, b, ya, yb, off, t / 2, y0);
    }
    const trim = side.trim ?? '#f4efe6';
    const tz = sgn * (t / 2 + TRIM_D / 2);
    // rodapé (corre sob janelas; interrompe nas portas)
    const runs: [number, number][] = [];
    {
      let s = 0;
      for (const h of holes) {
        if (h.sill) continue;
        const a = h.at - h.w / 2;
        if (a > s) runs.push([s, a]);
        s = h.at + h.w / 2;
      }
      if (L > s) runs.push([s, L]);
    }
    for (const [a, b] of runs) {
      trimBox(k, side.zone, trim, w, a, b, 0, 0.11, tz, TRIM_D, y0);
      if (lowH > 0) {
        // guarda-cadeira (interrompe nas janelas cujo peitoril esteja abaixo dele)
        let s = a;
        for (const h of holes) {
          if (!h.sill || h.sill > lowH) continue;
          const ha = h.at - h.w / 2 - 0.07;
          const hb = h.at + h.w / 2 + 0.07;
          if (hb < a || ha > b) continue;
          if (ha > s) trimBox(k, side.zone, trim, w, s, ha, lowH - 0.03, 0.05, sgn * (t / 2 + 0.017), 0.034, y0);
          s = hb;
        }
        if (b > s) trimBox(k, side.zone, trim, w, s, b, lowH - 0.03, 0.05, sgn * (t / 2 + 0.017), 0.034, y0);
      }
    }
    if (side.crown) trimBox(k, side.zone, trim, w, 0, L, w.h - 0.09, 0.09, sgn * (t / 2 + 0.03), 0.06, y0);
    // guarnições e batentes
    for (const h of holes) {
      if (h.bare) continue;
      const a = h.at - h.w / 2;
      const b = h.at + h.w / 2;
      const ys = h.sill ?? 0;
      const top = ys + h.h;
      const cw = 0.075;
      trimBox(k, side.zone, trim, w, a - cw, a, ys - (h.sill ? 0.06 : 0), top - ys + (h.sill ? 0.06 : 0) + cw, tz, TRIM_D, y0);
      trimBox(k, side.zone, trim, w, b, b + cw, ys - (h.sill ? 0.06 : 0), top - ys + (h.sill ? 0.06 : 0) + cw, tz, TRIM_D, y0);
      trimBox(k, side.zone, trim, w, a - cw, b + cw, top, cw, tz, TRIM_D, y0);
      if (h.sill) {
        // peitoril saliente (só de um lado: o lado positivo leva o peitoril largo)
        trimBox(k, side.zone, trim, w, a - 0.1, b + 0.1, ys - 0.045, 0.045, sgn * (t / 2 + 0.05), 0.1, y0);
        trimBox(k, side.zone, trim, w, a - cw, b + cw, ys - 0.11, 0.06, tz, TRIM_D, y0);
      }
      // batente (forro do vão) — metade da espessura deste lado
      lining(k, side.zone, trim, w, h, off, t / 2, y0);
    }
  }
}

function col(k: MapKit, w: WallSpec, a: number, b: number, t: number, y0: number): void {
  const u0 = w.from + a;
  const u1 = w.from + b;
  if (w.axis === 'x') k.solid(u0, w.at - t / 2, u1, w.at + t / 2, w.h, y0);
  else k.solid(w.at - t / 2, u0, w.at + t / 2, u1, w.h, y0);
}

function slab(k: MapKit, zone: string, mat: string, color: string, w: WallSpec, a: number, b: number, ya: number, yb: number, off: number, d: number, y0: number): void {
  if (b - a < 1e-3 || yb - ya < 1e-3) return;
  const g = k.g(zone, mat);
  const c = w.from + (a + b) / 2;
  if (w.axis === 'x') sbox(g, b - a, yb - ya, d, c, y0 + ya, w.at + off, color);
  else sbox(g, d, yb - ya, b - a, w.at + off, y0 + ya, c, color);
}

function trimBox(k: MapKit, zone: string, color: string, w: WallSpec, a: number, b: number, ya: number, h: number, off: number, d: number, y0: number): void {
  if (b - a < 1e-3) return;
  const g = k.g(zone, 'trim');
  const c = w.from + (a + b) / 2;
  if (w.axis === 'x') g.box(b - a, h, d, c, y0 + ya, w.at + off, color);
  else g.box(d, h, b - a, w.at + off, y0 + ya, c, color);
}

function lining(k: MapKit, zone: string, color: string, w: WallSpec, h: Hole, off: number, d: number, y0: number): void {
  const g = k.g(zone, 'trim');
  const a = w.from + h.at - h.w / 2;
  const b = w.from + h.at + h.w / 2;
  const ys = y0 + (h.sill ?? 0);
  const th = 0.02;
  if (w.axis === 'x') {
    g.sharp(th, h.h, d, a + th / 2, ys, w.at + off, color);
    g.sharp(th, h.h, d, b - th / 2, ys, w.at + off, color);
    g.sharp(h.w, th, d, (a + b) / 2, ys + h.h - th, w.at + off, color);
    if (h.sill) g.sharp(h.w, th, d, (a + b) / 2, ys, w.at + off, color);
  } else {
    g.sharp(d, h.h, th, w.at + off, ys, a + th / 2, color);
    g.sharp(d, h.h, th, w.at + off, ys, b - th / 2, color);
    g.sharp(d, th, h.w, w.at + off, ys + h.h - th, (a + b) / 2, color);
    if (h.sill) g.sharp(d, th, h.w, w.at + off, ys, (a + b) / 2, color);
  }
}

/** posição no mundo de um ponto do vão (centro da porta no chão) */
export function holeAt(w: WallSpec, h: Hole): { x: number; z: number } {
  const u = w.from + h.at;
  return w.axis === 'x' ? { x: u, z: w.at } : { x: w.at, z: u };
}
