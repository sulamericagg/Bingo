/**
 * Queda Giratória — geometria pseudo-3D dos anéis e do cano (Canvas 2D).
 *
 * Convenção: ângulo de TELA `a` (x = cos a · r, y = sin a · r · k). O personagem fica
 * sempre na frente do cano, em a = π/2. Cada anel tem ângulo LOCAL φ e rotação `rot`:
 * a = φ + rot. Os segmentos são guardados no espaço local com a 1ª abertura começando
 * em φ = 0, então nenhum segmento "dá a volta" em 2π.
 *
 * Performance: a face de cima de cada anel é um sprite em espaço-círculo (sombreamento
 * radial = invariante à rotação), desenhado com translate·scale(1,k)·rotate. As laterais
 * e o cano são poucos caminhos por frame com gradientes criados uma vez por zona.
 */
import { RED, ZONES, type Zone } from './zones';

export const TAU = Math.PI * 2;
export const FRONT = Math.PI / 2;

export const enum Seg {
  Normal = 0,
  Red = 1,
  Gap = 2,
  Crack = 3,
}

export interface Segment {
  a0: number;
  a1: number;
  type: Seg;
}

export interface Item {
  a: number;
  kind: 0 | 1; // 0 moeda, 1 escudo
  taken: boolean;
}

export interface Ring {
  idx: number;
  y: number;
  rot: number;
  phase: number;
  speed: number;
  wobA: number;
  wobF: number;
  segs: Segment[];
  items: Item[];
  zone: number;
  broken: boolean;
  sprite: HTMLCanvasElement | null;
  dirty: boolean;
  /** brilho de alerta (0..1) quando o jogador morre nele */
  flash: number;
}

export interface Geo {
  rOut: number;
  rIn: number;
  rMid: number;
  k: number;
  thick: number;
  /** raio do personagem (drawPlayer) */
  R: number;
  /** largura angular da abertura (medida no raio do personagem, com folga) */
  gw: number;
  /** margem angular dentro da abertura que ainda conta como "na borda" */
  gapMargin: number;
  /** margem angular do vermelho (toque na beirada do vermelho só quica) */
  redMargin: number;
  spacing: number;
  res: number;
  spriteSize: number;
}

export function makeGeo(rOut: number, res: number): Geo {
  const rIn = rOut * 0.28;
  const rMid = (rIn + rOut) / 2;
  const R = rOut * 0.13;
  // arco da abertura = 1,8 × largura do personagem, medido no raio onde ele pisa
  const gw = (2 * R * 1.8) / rMid;
  return {
    rOut,
    rIn,
    rMid,
    k: 0.36,
    thick: rOut * 0.1,
    R,
    gw,
    gapMargin: (R * 0.35) / rMid,
    redMargin: (R * 0.25) / rMid,
    spacing: rOut * 1.08,
    res,
    spriteSize: Math.ceil((2 * rOut + 6) * res),
  };
}

export const norm = (a: number): number => {
  a %= TAU;
  return a < 0 ? a + TAU : a;
};

/* ============================== geração ============================== */

export type Rnd = () => number;

/** Cria a configuração de um anel na profundidade `idx`. Dificuldade sobe com a profundidade. */
export function genRing(idx: number, geo: Geo, rnd: Rnd, zone: number): Ring {
  const d = idx;
  const gw = geo.gw;
  const twoGaps = d > 24 && rnd() < Math.min(0.4, (d - 24) * 0.015);
  const specials: Segment[] = [{ a0: 0, a1: gw, type: Seg.Gap }];
  const free: [number, number][] = [];
  if (twoGaps) {
    specials.push({ a0: Math.PI, a1: Math.PI + gw, type: Seg.Gap });
    free.push([gw, Math.PI], [Math.PI + gw, TAU]);
  } else free.push([gw, TAU]);

  let nRed = d < 3 ? 0 : d < 8 ? 1 : d < 18 ? 1 + (rnd() < 0.5 ? 1 : 0) : d < 35 ? 2 + (rnd() < 0.5 ? 1 : 0) : 2 + Math.floor(rnd() * 3);
  if (twoGaps) nRed = Math.min(4, nRed + 1);
  const buf = 0.1;
  const minSpace = 0.3;
  let redTotal = 0;
  const reds: Segment[] = [];
  for (let n = 0; n < nRed; n++) {
    const w = Math.min(1.1, 0.42 + rnd() * 0.36 + Math.min(d, 60) * 0.004);
    if (redTotal + w > TAU * 0.48) break;
    for (let tries = 0; tries < 14; tries++) {
      const iv = free[Math.floor(rnd() * free.length)];
      const lo = iv[0] + buf;
      const hi = iv[1] - buf - w;
      if (hi <= lo) continue;
      const s = lo + rnd() * (hi - lo);
      let ok = true;
      for (const r of reds) if (s < r.a1 + minSpace && s + w > r.a0 - minSpace) ok = false;
      if (!ok) continue;
      reds.push({ a0: s, a1: s + w, type: Seg.Red });
      redTotal += w;
      break;
    }
  }
  specials.push(...reds);
  specials.sort((a, b) => a.a0 - b.a0);

  // segmento rachado (desmorona no 1º toque e vira abertura)
  if (d >= 14 && rnd() < 0.35) {
    for (let i = 0; i < specials.length; i++) {
      const s0 = specials[i].a1 + 0.15;
      const s1 = (i + 1 < specials.length ? specials[i + 1].a0 : TAU) - 0.15;
      if (s1 - s0 >= gw + 0.1) {
        const c = s0 + rnd() * (s1 - s0 - gw);
        specials.splice(i + 1, 0, { a0: c, a1: c + gw, type: Seg.Crack });
        break;
      }
    }
  }

  // completa com segmentos normais
  const segs: Segment[] = [];
  let cur = 0;
  for (const s of specials) {
    if (s.a0 > cur + 1e-4) segs.push({ a0: cur, a1: s.a0, type: Seg.Normal });
    segs.push(s);
    cur = s.a1;
  }
  if (cur < TAU - 1e-4) segs.push({ a0: cur, a1: TAU, type: Seg.Normal });

  // itens (só em segmentos normais largos)
  const items: Item[] = [];
  if (d >= 1) {
    const wantShield = d > 8 && rnd() < 0.07;
    const nCoins = wantShield ? 0 : rnd() < 0.6 ? 1 + Math.floor(rnd() * 3) : 0;
    const need = wantShield ? 0.4 : nCoins * 0.24 + 0.1;
    const cands = segs.filter((s) => s.type === Seg.Normal && s.a1 - s.a0 >= need + 0.1);
    if (cands.length && (wantShield || nCoins)) {
      const s = cands[Math.floor(rnd() * cands.length)];
      const c = (s.a0 + s.a1) / 2;
      if (wantShield) items.push({ a: c, kind: 1, taken: false });
      else for (let i = 0; i < nCoins; i++) items.push({ a: c + (i - (nCoins - 1) / 2) * 0.24, kind: 0, taken: false });
    }
  }

  // rotação: sentidos alternados, velocidade sobe com a profundidade
  let dir = d % 2 ? -1 : 1;
  if (d > 10 && rnd() < 0.25) dir = -dir;
  let speed = Math.min(2, (0.7 + Math.min(d, 70) * 0.016) * (0.85 + rnd() * 0.35));
  let wobA = 0;
  let wobF = 0;
  if (d > 30 && rnd() < 0.3) {
    speed *= 0.5;
    wobA = 0.7;
    wobF = 1.2 + rnd() * 0.4;
  }
  return {
    idx,
    y: idx * geo.spacing,
    rot: rnd() * TAU,
    phase: rnd() * TAU,
    speed: speed * dir,
    wobA,
    wobF,
    segs,
    items,
    zone,
    broken: false,
    sprite: null,
    dirty: true,
    flash: 0,
  };
}

/** Segmento sob o ângulo local φ (já normalizado). */
export function segAt(r: Ring, phi: number): Segment {
  const s = r.segs;
  for (let i = 0; i < s.length; i++) if (phi >= s[i].a0 && phi < s[i].a1) return s[i];
  return s[s.length - 1];
}

export const enum Hit {
  Bounce = 0,
  Gap = 1,
  Red = 2,
  Crack = 3,
}

/** O que está sob o personagem agora (com tolerâncias a favor do jogador). */
export function hitTest(r: Ring, geo: Geo): { hit: Hit; seg: Segment } {
  const phi = norm(FRONT - r.rot);
  const seg = segAt(r, phi);
  if (seg.type === Seg.Gap) return { hit: phi >= seg.a0 + geo.gapMargin && phi <= seg.a1 - geo.gapMargin ? Hit.Gap : Hit.Bounce, seg };
  if (seg.type === Seg.Red) return { hit: phi >= seg.a0 + geo.redMargin && phi <= seg.a1 - geo.redMargin ? Hit.Red : Hit.Bounce, seg };
  if (seg.type === Seg.Crack) return { hit: Hit.Crack, seg };
  return { hit: Hit.Bounce, seg };
}

/* ============================== estilos ============================== */

export interface ZoneStyle {
  zone: Zone;
  topNormal: CanvasGradient;
  topCrack: CanvasGradient;
  topRed: CanvasGradient;
  sideNormal: CanvasGradient;
  sideRed: CanvasGradient;
  cut: string;
  pipe: CanvasGradient;
  pipeAO: CanvasGradient;
  stripe: string;
}

/** Gradientes de uma zona para uma geometria. Crie uma vez por (zona, tamanho). */
export function makeZoneStyle(ctx: CanvasRenderingContext2D, zi: number, geo: Geo): ZoneStyle {
  const z = ZONES[zi];
  const { rIn, rOut } = geo;
  const radial = (c0: string, c1: string, c2: string) => {
    const g = ctx.createRadialGradient(0, 0, rIn, 0, 0, rOut);
    g.addColorStop(0, c2);
    g.addColorStop(0.16, c1);
    g.addColorStop(0.42, c0);
    g.addColorStop(0.86, c0);
    g.addColorStop(1, c1);
    return g;
  };
  // lateral com reflexo especular fixo (luz de cima-esquerda) e oclusão na borda direita
  const side = (c0: string, c1: string, spec: string) => {
    const g = ctx.createLinearGradient(-rOut, 0, rOut, 0);
    g.addColorStop(0, c0);
    g.addColorStop(0.2, spec);
    g.addColorStop(0.32, c0);
    g.addColorStop(0.55, c0);
    g.addColorStop(1, c1);
    return g;
  };
  const pipe = ctx.createLinearGradient(-rIn, 0, rIn, 0);
  pipe.addColorStop(0, z.pipe[1]);
  pipe.addColorStop(0.28, z.pipe[0]);
  pipe.addColorStop(0.62, z.pipe[1]);
  pipe.addColorStop(1, z.pipe[2]);
  const ao = ctx.createLinearGradient(0, -rIn * 0.9, 0, rIn * geo.k);
  ao.addColorStop(0, 'rgba(90,30,60,0)');
  ao.addColorStop(1, 'rgba(90,30,60,0.32)');
  return {
    zone: z,
    topNormal: radial(z.ring[0], z.ring[1], z.ring[3]),
    topCrack: radial(z.ring[1], z.ring[2], z.ring[3]),
    topRed: radial(RED.top, RED.topDark, RED.stripe),
    sideNormal: side(z.ring[2], z.ring[3], z.ring[1]),
    sideRed: side(RED.side, RED.sideDark, RED.top),
    cut: z.ring[3],
    pipe,
    pipeAO: ao,
    stripe: RED.stripe,
  };
}

/* ============================== sprite ============================== */

function sector(x: CanvasRenderingContext2D, a0: number, a1: number, rIn: number, rOut: number): void {
  x.beginPath();
  x.arc(0, 0, rOut, a0, a1);
  x.arc(0, 0, rIn, a1, a0, true);
  x.closePath();
}

/** Desenha a face de cima do anel (espaço-círculo, sem rotação) no canvas `c`. */
export function renderRingSprite(r: Ring, geo: Geo, st: ZoneStyle, c: HTMLCanvasElement): void {
  const S = geo.spriteSize;
  if (c.width !== S) c.width = S;
  if (c.height !== S) c.height = S;
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, S, S);
  x.setTransform(geo.res, 0, 0, geo.res, S / 2, S / 2);
  const { rIn, rOut } = geo;
  const pad = 0.004; // costura entre segmentos
  for (const s of r.segs) {
    if (s.type === Seg.Gap) continue;
    sector(x, s.a0 + pad, s.a1 - pad, rIn, rOut);
    x.fillStyle = s.type === Seg.Red ? st.topRed : s.type === Seg.Crack ? st.topCrack : st.topNormal;
    x.fill();
    if (s.type === Seg.Red) {
      // listras doces: reconhecíveis sem depender da cor
      x.save();
      sector(x, s.a0 + pad, s.a1 - pad, rIn, rOut);
      x.clip();
      x.fillStyle = st.stripe;
      x.globalAlpha = 0.45;
      const step = 0.16;
      for (let a = s.a0; a < s.a1; a += step * 2) {
        x.beginPath();
        x.moveTo(Math.cos(a) * rIn, Math.sin(a) * rIn);
        x.lineTo(Math.cos(a + step * 0.5) * rOut, Math.sin(a + step * 0.5) * rOut);
        x.lineTo(Math.cos(a + step * 1.4) * rOut, Math.sin(a + step * 1.4) * rOut);
        x.lineTo(Math.cos(a + step) * rIn, Math.sin(a + step) * rIn);
        x.closePath();
        x.fill();
      }
      x.restore();
      // pontinhos brancos de "bala"
      x.fillStyle = 'rgba(255,255,255,0.55)';
      const rm = (rIn + rOut) / 2;
      for (let a = s.a0 + 0.12; a < s.a1 - 0.08; a += 0.32) {
        x.beginPath();
        x.arc(Math.cos(a) * rm, Math.sin(a) * rm, rOut * 0.025, 0, TAU);
        x.fill();
      }
    } else if (s.type === Seg.Crack) {
      x.strokeStyle = st.cut;
      x.lineWidth = Math.max(1.5, rOut * 0.012);
      x.lineCap = 'round';
      x.lineJoin = 'round';
      const m = (s.a0 + s.a1) / 2;
      const w = s.a1 - s.a0;
      x.beginPath();
      for (let i = 0; i <= 5; i++) {
        const rr = rIn + ((rOut - rIn) * i) / 5;
        const a = m + (i % 2 ? 0.14 : -0.12) * w;
        if (i) x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      x.moveTo(Math.cos(m - 0.05) * (rIn + (rOut - rIn) * 0.5), Math.sin(m - 0.05) * (rIn + (rOut - rIn) * 0.5));
      x.lineTo(Math.cos(m - 0.35 * w) * (rIn + (rOut - rIn) * 0.7), Math.sin(m - 0.35 * w) * (rIn + (rOut - rIn) * 0.7));
      x.moveTo(Math.cos(m + 0.1 * w) * (rIn + (rOut - rIn) * 0.3), Math.sin(m + 0.1 * w) * (rIn + (rOut - rIn) * 0.3));
      x.lineTo(Math.cos(m + 0.38 * w) * (rIn + (rOut - rIn) * 0.45), Math.sin(m + 0.38 * w) * (rIn + (rOut - rIn) * 0.45));
      x.stroke();
    }
    // brilho da borda externa
    x.strokeStyle = 'rgba(255,255,255,0.55)';
    x.lineWidth = Math.max(1, rOut * 0.012);
    x.beginPath();
    x.arc(0, 0, rOut - rOut * 0.03, s.a0 + 0.02, s.a1 - 0.02);
    x.stroke();
  }
  // linhas de separação entre segmentos
  x.strokeStyle = 'rgba(80,20,50,0.22)';
  x.lineWidth = Math.max(1, rOut * 0.01);
  x.beginPath();
  for (const s of r.segs) {
    x.moveTo(Math.cos(s.a0) * rIn, Math.sin(s.a0) * rIn);
    x.lineTo(Math.cos(s.a0) * rOut, Math.sin(s.a0) * rOut);
  }
  x.stroke();
  r.dirty = false;
}

/* ============================== desenho por frame ============================== */

function strip(x: CanvasRenderingContext2D, geo: Geo, a0: number, a1: number): void {
  const { rOut, k, thick } = geo;
  x.beginPath();
  x.ellipse(0, 0, rOut, rOut * k, 0, a0, a1);
  x.ellipse(0, thick, rOut, rOut * k, 0, a1, a0, true);
  x.closePath();
  x.fill();
}

/** Laterais (metade da frente) + paredes das aberturas. Contexto já transladado ao centro do anel. */
export function drawRingSides(x: CanvasRenderingContext2D, r: Ring, geo: Geo, st: ZoneStyle): void {
  const rot = r.rot;
  for (const s of r.segs) {
    if (s.type === Seg.Gap) continue;
    x.fillStyle = s.type === Seg.Red ? st.sideRed : st.sideNormal;
    const s0 = norm(s.a0 + rot);
    const s1 = s0 + (s.a1 - s.a0);
    // frente = [0, π] e [2π, 3π]
    for (let base = 0; base <= TAU; base += TAU) {
      const lo = Math.max(s0, base);
      const hi = Math.min(s1, base + Math.PI);
      if (hi > lo) strip(x, geo, lo, hi);
    }
  }
  // paredes cortadas das aberturas
  const { rIn, rOut, k, thick } = geo;
  x.fillStyle = st.cut;
  for (const s of r.segs) {
    if (s.type !== Seg.Gap) continue;
    for (let e = 0; e < 2; e++) {
      const a = (e ? s.a1 : s.a0) + rot;
      const sn = Math.sin(a);
      if (sn < -0.2) continue;
      const c = Math.cos(a);
      x.beginPath();
      x.moveTo(c * rIn, sn * rIn * k);
      x.lineTo(c * rOut, sn * rOut * k);
      x.lineTo(c * rOut, sn * rOut * k + thick);
      x.lineTo(c * rIn, sn * rIn * k + thick);
      x.closePath();
      x.fill();
    }
  }
}

/** Face de cima: sprite girado. Contexto já transladado ao centro do anel. */
export function drawRingTop(x: CanvasRenderingContext2D, r: Ring, geo: Geo): void {
  if (!r.sprite) return;
  const half = geo.spriteSize / geo.res / 2;
  x.save();
  x.scale(1, geo.k);
  x.rotate(r.rot);
  x.drawImage(r.sprite, -half, -half, half * 2, half * 2);
  x.restore();
}

/** Trecho do cano de yTop até o anel em yBot (contexto transladado em x para o eixo). */
export function drawPipe(x: CanvasRenderingContext2D, geo: Geo, st: ZoneStyle, yTop: number, yBot: number, ao: boolean): void {
  const { rIn, k } = geo;
  x.fillStyle = st.pipe;
  x.beginPath();
  x.rect(-rIn, yTop, rIn * 2, yBot - yTop);
  x.ellipse(0, yBot, rIn, rIn * k, 0, 0, Math.PI);
  x.fill();
  if (ao) {
    x.save();
    x.translate(0, yBot);
    x.fillStyle = st.pipeAO;
    x.beginPath();
    x.rect(-rIn, -rIn * 0.9, rIn * 2, rIn * 0.9);
    x.ellipse(0, 0, rIn, rIn * k, 0, 0, Math.PI);
    x.fill();
    x.restore();
  }
}

/** Atualiza a rotação a partir do relógio global. */
export function spinRing(r: Ring, time: number): void {
  r.rot = r.phase + r.speed * time + (r.wobA ? r.wobA * Math.sin(r.wobF * time) : 0);
}
