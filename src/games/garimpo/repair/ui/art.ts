/* ============================================================
 *  CONSERTOS — arte em canvas 2D (2,5D): metal escovado, porcas sextavadas com luz fixa
 *  (a forma gira, o brilho não), pneus, aros, disco de freio, luva-dica, ícones dos passos.
 *  Gradientes são criados UMA vez (na montagem) em torno da origem e reaproveitados com
 *  translate — nada é alocado por quadro.
 * ============================================================ */
export type C2 = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
export const easeOut = (k: number) => 1 - (1 - k) * (1 - k) * (1 - k);
export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** mola amortecida: devolve 0→1 com um leve repique (para "encaixou!") */
export const springOut = (k: number) => (k >= 1 ? 1 : 1 - Math.exp(-6 * k) * Math.cos(k * 11));

export function lin(c: C2, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, s] of stops) g.addColorStop(o, s);
  return g;
}
export function rad(c: C2, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1);
  for (const [o, s] of stops) g.addColorStop(o, s);
  return g;
}
export function rrect(c: C2, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}
export function hexPath(c: C2, r: number, a: number): void {
  for (let i = 0; i < 6; i++) {
    const t = a + (i * TAU) / 6;
    if (i === 0) c.moveTo(Math.cos(t) * r, Math.sin(t) * r);
    else c.lineTo(Math.cos(t) * r, Math.sin(t) * r);
  }
  c.closePath();
}
let SHADOW: CanvasGradient | null = null;
let GLOW: HTMLCanvasElement | null = null;

/* ============================== tinta metálica ============================== */
/** gradientes de uma porca/parafuso de raio r (luz de cima-esquerda) */
export class NutPaint {
  face: CanvasGradient;
  top: CanvasGradient;
  dome: CanvasGradient;
  washer: CanvasGradient;
  gold: CanvasGradient;
  constructor(c: C2, readonly r: number) {
    this.face = lin(c, -r, -r, r, r, [
      [0, '#fbfcfd'],
      [0.35, '#c9cfd5'],
      [0.62, '#8c949c'],
      [1, '#4a5057'],
    ]);
    this.top = rad(c, -r * 0.3, -r * 0.35, 0, 0, 0, r * 0.9, [
      [0, '#ffffff'],
      [0.5, '#d7dce1'],
      [1, '#9aa2aa'],
    ]);
    this.dome = rad(c, -r * 0.18, -r * 0.22, r * 0.02, 0, 0, r * 0.6, [
      [0, '#ffffff'],
      [0.35, '#e4e8ec'],
      [1, '#7d858d'],
    ]);
    this.washer = rad(c, -r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.3, [
      [0, '#f0f2f4'],
      [0.6, '#a9b0b7'],
      [1, '#5b6168'],
    ]);
    this.gold = lin(c, -r, -r, r, r, [
      [0, '#fff6c2'],
      [0.4, '#f2c94c'],
      [1, '#9a6a12'],
    ]);
  }
}
/** cores das facetas por iluminação (-1..1 em 21 degraus) — sem montar string por quadro */
const FACET: string[] = [];
for (let i = 0; i <= 20; i++) {
  const d = i / 10 - 1;
  FACET.push(d > 0 ? `rgba(255,255,255,${(0.25 + d * 0.6).toFixed(2)})` : `rgba(0,0,0,${(0.15 - d * 0.35).toFixed(2)})`);
}
const LX = -0.62;
const LY = -0.78;
/**
 * porca sextavada (ou cabeça de parafuso) em x,y girada de `a`.
 * kind: 'lug' (cúpula, porca de roda), 'hex' (com furo e rosca), 'bolt' (cabeça com arruela)
 */
export function drawNut(c: C2, P: NutPaint, x: number, y: number, a: number, kind: 'lug' | 'hex' | 'bolt' = 'hex', scale = 1, lift = 0): void {
  const r = P.r;
  c.save();
  c.translate(x, y);
  if (scale !== 1) c.scale(scale, scale);
  // sombra (mais longe quanto mais "levantada" a porca)
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath();
  c.arc(3 + lift * 6, 4 + lift * 8, r * (1.02 + lift * 0.1), 0, TAU);
  c.fill();
  if (kind === 'bolt') {
    c.fillStyle = P.washer;
    c.beginPath();
    c.arc(0, 0, r * 1.28, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(30,34,38,.7)';
    c.lineWidth = 1.2;
    c.stroke();
  }
  // corpo sextavado
  c.fillStyle = P.face;
  c.beginPath();
  hexPath(c, r, a);
  c.fill();
  // facetas: claridade conforme a normal de cada lado
  c.lineWidth = 2.2;
  for (let i = 0; i < 6; i++) {
    const t0 = a + (i * TAU) / 6;
    const t1 = t0 + TAU / 6;
    const nm = (t0 + t1) / 2;
    const d = Math.cos(nm) * LX + Math.sin(nm) * LY;
    c.strokeStyle = FACET[Math.round((d + 1) * 10)];
    c.beginPath();
    c.moveTo(Math.cos(t0) * r * 0.93, Math.sin(t0) * r * 0.93);
    c.lineTo(Math.cos(t1) * r * 0.93, Math.sin(t1) * r * 0.93);
    c.stroke();
  }
  c.strokeStyle = '#2a2e33';
  c.lineWidth = 1.4;
  c.beginPath();
  hexPath(c, r, a);
  c.stroke();
  // topo chanfrado
  c.fillStyle = P.top;
  c.beginPath();
  c.arc(0, 0, r * 0.8, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(40,44,50,.45)';
  c.lineWidth = 1;
  c.stroke();
  if (kind === 'lug') {
    c.fillStyle = P.dome;
    c.beginPath();
    c.arc(0, 0, r * 0.58, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    c.beginPath();
    c.ellipse(-r * 0.2, -r * 0.24, r * 0.16, r * 0.09, -0.6, 0, TAU);
    c.fill();
  } else if (kind === 'hex') {
    c.fillStyle = '#1d2024';
    c.beginPath();
    c.arc(0, 0, r * 0.4, 0, TAU);
    c.fill();
    // rosca: arcos espirais que giram com a porca
    c.strokeStyle = 'rgba(160,168,176,.55)';
    c.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      c.arc(0, 0, r * (0.18 + k * 0.07), a * 2 + k, a * 2 + k + 3.6);
      c.stroke();
    }
  } else {
    // cabeça do parafuso: marca da classe (gira)
    c.strokeStyle = 'rgba(60,66,72,.6)';
    c.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const t = a + (k * TAU) / 3;
      c.beginPath();
      c.moveTo(Math.cos(t) * r * 0.12, Math.sin(t) * r * 0.12);
      c.lineTo(Math.cos(t) * r * 0.42, Math.sin(t) * r * 0.42);
      c.stroke();
    }
  }
  c.restore();
}

/** ponta de prisioneiro (rosca saindo do cubo) */
export function drawStud(c: C2, P: NutPaint, x: number, y: number, r: number, len = 1): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.4)';
  c.beginPath();
  c.ellipse(2 + len * 3, 3 + len * 4, r * 1.05, r * 1.05, 0, 0, TAU);
  c.fill();
  c.fillStyle = P.top;
  c.beginPath();
  c.arc(0, 0, r, 0, TAU);
  c.fill();
  c.strokeStyle = '#3a3f45';
  c.lineWidth = 1.2;
  c.stroke();
  c.strokeStyle = 'rgba(70,76,84,.55)';
  c.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    c.beginPath();
    c.arc(0, 0, r * (k / 4), 0.4, 5.4);
    c.stroke();
  }
  c.restore();
}

/* ============================== pneu / aro / cubo ============================== */
export class WheelPaint {
  rubber: CanvasGradient;
  side: CanvasGradient;
  rim: CanvasGradient;
  dish: CanvasGradient;
  cap: CanvasGradient;
  disc: CanvasGradient;
  hub: CanvasGradient;
  nut: NutPaint;
  constructor(
    c: C2,
    readonly R: number,
    readonly rimCol: 'silver' | 'white' | 'steel' = 'silver',
  ) {
    this.rubber = rad(c, -R * 0.25, -R * 0.3, R * 0.2, 0, 0, R, [
      [0, '#4a4c52'],
      [0.62, '#2b2c31'],
      [0.82, '#202126'],
      [0.93, '#2f3036'],
      [1, '#131417'],
    ]);
    this.side = rad(c, 0, 0, R * 0.64, 0, 0, R * 0.95, [
      [0, '#1b1c20'],
      [0.25, '#3a3b42'],
      [0.6, '#2c2d33'],
      [1, '#1a1b1f'],
    ]);
    const rimStops: Record<string, [number, string][]> = {
      silver: [
        [0, '#ffffff'],
        [0.45, '#d4dade'],
        [0.8, '#9ca5ad'],
        [1, '#646c74'],
      ],
      white: [
        [0, '#ffffff'],
        [0.5, '#ecebe4'],
        [0.85, '#bdbab0'],
        [1, '#85827a'],
      ],
      steel: [
        [0, '#e8e2d2'],
        [0.5, '#b9b19c'],
        [0.85, '#857d68'],
        [1, '#5a5444'],
      ],
    };
    const Rr = R * 0.63;
    this.rim = rad(c, -Rr * 0.35, -Rr * 0.4, Rr * 0.1, 0, 0, Rr, rimStops[rimCol]);
    this.dish = rad(c, Rr * 0.15, Rr * 0.2, Rr * 0.05, 0, 0, Rr * 0.82, [
      [0, rimCol === 'steel' ? '#a39a82' : '#c3c9ce'],
      [0.7, rimCol === 'steel' ? '#7a725e' : '#8a939b'],
      [1, rimCol === 'steel' ? '#4f4a3d' : '#5c646c'],
    ]);
    this.cap = rad(c, -Rr * 0.08, -Rr * 0.1, 0, 0, 0, Rr * 0.3, [
      [0, '#ffffff'],
      [0.5, '#d5dbe0'],
      [1, '#7f878f'],
    ]);
    const Rd = R * 0.56;
    this.disc = rad(c, -Rd * 0.2, -Rd * 0.25, Rd * 0.1, 0, 0, Rd, [
      [0, '#d9d4cc'],
      [0.55, '#a8a39b'],
      [0.85, '#8a8278'],
      [1, '#5e5852'],
    ]);
    this.hub = rad(c, -R * 0.08, -R * 0.1, 0, 0, 0, R * 0.32, [
      [0, '#b9bfc5'],
      [0.6, '#7c848c'],
      [1, '#3e444a'],
    ]);
    this.nut = new NutPaint(c, R * 0.075);
  }
}

/** pneu (borracha + banda) com murcho 0..1 achatando a parte de baixo */
export function drawTyre(c: C2, P: WheelPaint, x: number, y: number, a: number, flat = 0): void {
  const R = P.R;
  c.save();
  c.translate(x, y);
  // contorno (achatado embaixo quando murcho)
  const lim = R * (1 - 0.2 * flat);
  c.beginPath();
  for (let i = 0; i <= 64; i++) {
    const t = (i / 64) * TAU;
    const s = Math.sin(t);
    let py = s * R;
    let px = Math.cos(t) * R;
    if (flat > 0 && py > lim) {
      py = lim + (py - lim) * 0.12;
      px *= 1 + 0.13 * flat * s * s;
    }
    if (i === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.fillStyle = P.rubber;
  c.fill();
  c.strokeStyle = '#0c0c0e';
  c.lineWidth = 2;
  c.stroke();
  // blocos da banda (giram) — escondidos na parte achatada
  c.fillStyle = '#16171a';
  const n = 26;
  for (let i = 0; i < n; i++) {
    const t = a + (i * TAU) / n;
    const s = Math.sin(t);
    if (flat > 0 && s > 0.75) continue;
    c.save();
    c.rotate(t);
    c.fillRect(R * 0.9, -R * 0.045, R * 0.1, R * 0.09);
    c.restore();
  }
  // flanco
  c.fillStyle = P.side;
  c.beginPath();
  c.arc(0, 0, R * 0.9, 0, TAU);
  c.fill();
  // letreiro em relevo (riscos que giram)
  c.strokeStyle = 'rgba(255,255,255,.07)';
  c.lineWidth = R * 0.05;
  c.beginPath();
  c.arc(0, 0, R * 0.79, a + 0.3, a + 1.4);
  c.stroke();
  c.beginPath();
  c.arc(0, 0, R * 0.79, a + 3.4, a + 4.5);
  c.stroke();
  // brilho da borracha
  c.strokeStyle = 'rgba(255,255,255,.13)';
  c.lineWidth = R * 0.07;
  c.beginPath();
  c.arc(0, 0, R * 0.84, 3.6, 4.6);
  c.stroke();
  c.restore();
}

/** aro + cubo + porcas (nLug porcas no círculo; nuts[i] = 0 sem porca, 1 com) */
export function drawRim(c: C2, P: WheelPaint, x: number, y: number, a: number, nLug: number, nutA: Float32Array | null, nutOn: Uint8Array | null, holes = false): void {
  const R = P.R;
  const Rr = R * 0.63;
  c.save();
  c.translate(x, y);
  c.fillStyle = P.rim;
  c.beginPath();
  c.arc(0, 0, Rr, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(30,34,38,.8)';
  c.lineWidth = 1.6;
  c.stroke();
  // aba do aro
  c.strokeStyle = 'rgba(255,255,255,.55)';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(0, 0, Rr * 0.92, 3.3, 5.0);
  c.stroke();
  c.fillStyle = P.dish;
  c.beginPath();
  c.arc(0, 0, Rr * 0.8, 0, TAU);
  c.fill();
  // furos de ventilação entre as porcas
  c.fillStyle = '#16181b';
  for (let i = 0; i < nLug; i++) {
    const t = a + ((i + 0.5) * TAU) / nLug;
    c.save();
    c.rotate(t);
    c.beginPath();
    c.ellipse(Rr * 0.62, 0, Rr * 0.12, Rr * 0.19 * (5 / nLug) * 1.3, 0, 0, TAU);
    c.fill();
    c.restore();
  }
  // cubo
  c.fillStyle = P.cap;
  c.beginPath();
  c.arc(0, 0, Rr * 0.3, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(40,44,48,.6)';
  c.lineWidth = 1.2;
  c.stroke();
  c.restore();
  // porcas
  const bc = Rr * 0.5;
  for (let i = 0; i < nLug; i++) {
    const t = a + (i * TAU) / nLug - Math.PI / 2;
    const px = x + Math.cos(t) * bc;
    const py = y + Math.sin(t) * bc;
    if (nutOn && !nutOn[i]) {
      if (holes) {
        c.fillStyle = '#121416';
        c.beginPath();
        c.arc(px, py, P.nut.r * 0.7, 0, TAU);
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,.35)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.arc(px, py, P.nut.r * 0.78, 0.2, 2.6);
        c.stroke();
      } else drawStud(c, P.nut, px, py, P.nut.r * 0.55, 0.6);
    }
    else drawNut(c, P.nut, px, py, (nutA ? nutA[i] : 0) + a, 'lug');
  }
}
/** posição da porca i do aro (para toques) */
export function lugPos(P: WheelPaint, x: number, y: number, a: number, nLug: number, i: number, out: { x: number; y: number }): void {
  const bc = P.R * 0.63 * 0.5;
  const t = a + (i * TAU) / nLug - Math.PI / 2;
  out.x = x + Math.cos(t) * bc;
  out.y = y + Math.sin(t) * bc;
}

/** cubo exposto (sem roda): disco de freio, pinça, prisioneiros */
export function drawHub(c: C2, P: WheelPaint, x: number, y: number, nLug: number, caliper: string): void {
  const R = P.R;
  const Rd = R * 0.56;
  c.save();
  c.translate(x, y);
  // sombra do arco
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath();
  c.arc(4, 6, Rd * 1.04, 0, TAU);
  c.fill();
  c.fillStyle = P.disc;
  c.beginPath();
  c.arc(0, 0, Rd, 0, TAU);
  c.fill();
  c.strokeStyle = 'rgba(40,36,32,.7)';
  c.lineWidth = 1.5;
  c.stroke();
  // riscos de uso do disco
  c.strokeStyle = 'rgba(255,255,255,.18)';
  c.lineWidth = 1;
  for (let k = 0; k < 6; k++) {
    c.beginPath();
    c.arc(0, 0, Rd * (0.62 + k * 0.055), k, k + 2.2);
    c.stroke();
  }
  // furos do disco
  c.fillStyle = 'rgba(30,26,22,.65)';
  for (let k = 0; k < 18; k++) {
    const t = (k * TAU) / 18;
    c.beginPath();
    c.arc(Math.cos(t) * Rd * (k % 2 ? 0.74 : 0.84), Math.sin(t) * Rd * (k % 2 ? 0.74 : 0.84), Rd * 0.025, 0, TAU);
    c.fill();
  }
  // pinça (em cima-direita)
  c.save();
  c.rotate(-0.75);
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.beginPath();
  rrect(c, Rd * 0.62 + 3, -Rd * 0.42 + 4, Rd * 0.5, Rd * 0.84, Rd * 0.14);
  c.fill();
  c.fillStyle = caliper;
  c.beginPath();
  rrect(c, Rd * 0.62, -Rd * 0.42, Rd * 0.5, Rd * 0.84, Rd * 0.14);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,.3)';
  c.beginPath();
  rrect(c, Rd * 0.66, -Rd * 0.38, Rd * 0.14, Rd * 0.76, Rd * 0.06);
  c.fill();
  c.restore();
  // flange do cubo
  c.fillStyle = P.hub;
  c.beginPath();
  c.arc(0, 0, R * 0.32, 0, TAU);
  c.fill();
  c.strokeStyle = '#33383d';
  c.lineWidth = 1.5;
  c.stroke();
  c.fillStyle = P.cap;
  c.beginPath();
  c.arc(0, 0, R * 0.12, 0, TAU);
  c.fill();
  c.restore();
}

/* ============================== brilho / mão-dica ============================== */
/** halo radial pré-desenhado (branco → transparente), pintado com globalAlpha */
export function glow(c: C2, x: number, y: number, r: number, a: number, tint = false): void {
  if (!GLOW) return;
  c.save();
  c.globalAlpha = a;
  if (tint) c.globalCompositeOperation = 'lighter';
  c.drawImage(GLOW, x - r, y - r, r * 2, r * 2);
  c.restore();
}

let HAND: HTMLCanvasElement | null = null;
const HAND_S = 3;
/** luva branca de desenho animado, dedo indicador (ponta = ponto ativo) */
function buildHand(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 64 * HAND_S;
  cv.height = 80 * HAND_S;
  const c = cv.getContext('2d')!;
  c.scale(HAND_S, HAND_S);
  c.translate(18, 6);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const body = () => {
    c.beginPath();
    // dedo indicador
    c.moveTo(4, 30);
    c.lineTo(4, 6);
    c.quadraticCurveTo(4, 0, 9.5, 0);
    c.quadraticCurveTo(15, 0, 15, 6);
    c.lineTo(15, 26);
    // dedos dobrados
    c.quadraticCurveTo(16, 22, 21, 23);
    c.quadraticCurveTo(25.5, 24, 25, 29);
    c.quadraticCurveTo(27, 26, 31, 28);
    c.quadraticCurveTo(35, 30, 34, 35);
    c.quadraticCurveTo(37, 33, 40, 36);
    c.quadraticCurveTo(42, 39, 41, 46);
    c.lineTo(39, 56);
    c.quadraticCurveTo(36, 66, 24, 66);
    c.lineTo(14, 66);
    c.quadraticCurveTo(4, 66, 0, 55);
    // polegar
    c.lineTo(-8, 41);
    c.quadraticCurveTo(-11, 35, -6, 33);
    c.quadraticCurveTo(-1, 31.5, 4, 38);
    c.closePath();
  };
  c.save();
  c.translate(3, 4);
  body();
  c.fillStyle = 'rgba(0,0,0,.35)';
  c.fill();
  c.restore();
  body();
  c.fillStyle = lin(c, -10, 0, 40, 66, [
    [0, '#ffffff'],
    [0.7, '#f1f1f6'],
    [1, '#cfd0dc'],
  ]);
  c.fill();
  c.strokeStyle = '#1d1f2a';
  c.lineWidth = 3;
  c.stroke();
  // vincos dos dedos
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(25, 29);
  c.lineTo(24.5, 36);
  c.moveTo(34, 35);
  c.lineTo(33, 41);
  c.moveTo(15, 26);
  c.lineTo(15, 34);
  c.stroke();
  // punho
  c.fillStyle = '#ffcf2e';
  c.beginPath();
  rrect(c, 6, 60, 30, 10, 4);
  c.fill();
  c.stroke();
  return cv;
}
/** desenha a mão com a ponta do dedo em x,y; press 0..1 encolhe (toque) */
export function drawHand(c: C2, x: number, y: number, s = 1, press = 0, alpha = 1): void {
  if (!HAND) return;
  const k = s * (1 - press * 0.12);
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.rotate(-0.32);
  c.drawImage(HAND, -27.5 * k, -6 * k, 64 * k, 80 * k);
  c.restore();
}

/** prepara recursos globais (uma vez por sessão) */
export function initArt(c: C2): void {
  if (!SHADOW) SHADOW = rad(c, 0, 0, 0, 0, 0, 1, [
    [0, 'rgba(0,0,0,1)'],
    [0.6, 'rgba(0,0,0,.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  if (!GLOW) {
    const g = document.createElement('canvas');
    g.width = g.height = 128;
    const x = g.getContext('2d')!;
    x.fillStyle = rad(x, 64, 64, 0, 64, 64, 64, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    x.fillRect(0, 0, 128, 128);
    GLOW = g;
  }
  if (!HAND) HAND = buildHand();
}
/** shadow precisa do gradiente unitário: a elipse é escalada (raio 1) */
export function softShadow(c: C2, x: number, y: number, rx: number, ry: number, a = 0.4): void {
  if (!SHADOW) return;
  c.save();
  c.translate(x, y);
  c.scale(rx, ry);
  c.globalAlpha = a;
  c.fillStyle = SHADOW;
  c.beginPath();
  c.arc(0, 0, 1, 0, TAU);
  c.fill();
  c.restore();
}

/* ============================== ícones dos passos ============================== */
/** caminhos 24×24 (traço) — criados uma vez como Path2D */
const ICON_SRC: Record<string, string> = {
  jack: 'M4 20h16M8 20v-4h8v4M10 16V9h4v7M9 9h6M14 12l6-6',
  nut: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 9a3 3 0 1 0 0.01 0',
  twist: 'M18 12a6 6 0 1 1-2-4.5 M16 3v4.5h-4.5',
  wheel: 'M12 3a9 9 0 1 0 0.01 0 M12 8a4 4 0 1 0 0.01 0',
  spare: 'M12 3a9 9 0 1 0 0.01 0 M12 8a4 4 0 1 0 0.01 0 M20 4l2 2M22 4l-2 2',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
  down: 'M12 4v14M6 12l6 6 6-6',
  door: 'M5 3h10v18H5z M15 5l4 2v12l-4 2 M12 12h.01',
  plug: 'M9 3v5M15 3v5M7 8h10v4a5 5 0 0 1-10 0z M12 17v4',
  power: 'M12 3v8M7 6.5a7 7 0 1 0 10 0',
  bolt: 'M8 4h8l2 3H6z M10 7v13M14 7v13M10 11h4M10 15h4',
  part: 'M4 14l6-6 6 6-6 6z M14 6l4-2 2 4-4 2',
  cover: 'M4 5h16v14H4z M7 8h.01M17 8h.01M7 16h.01M17 16h.01',
  key: 'M8 15a4 4 0 1 1 0.01 0 M11 12l9-9M17 6l2 2M15 8l2 2',
  bush: 'M12 4a8 8 0 1 0 0.01 0 M12 8a4 4 0 1 0 0.01 0',
  press: 'M6 3h12v4H6z M12 7v6M8 13h8l-1 4H9z M4 21h16',
  pedal: 'M5 21l4-14h6l2 3M9 7l-2-4M4 21h10',
  bottle: 'M10 3h4v3l2 3v12H8V9l2-3z M8 14h8',
  hose: 'M4 18c4 0 4-12 8-12s4 12 8 12 M2 18h4M18 18h4',
  check: 'M4 12.5l5 5L20 6.5',
  bounce: 'M4 20h16M12 4v10M8 10l4 4 4-4',
  bin: 'M5 7h14l-1.5 13h-11z M3 7h18M9 4h6',
  rotate: 'M20 12a8 8 0 1 1-2.3-5.6 M20 3v5h-5',
};
const ICONS = new Map<string, Path2D>();
export type IconId = keyof typeof ICON_SRC;
export function drawIcon(c: C2, id: string, x: number, y: number, size: number, color: string, lw = 2.4, fill = false): void {
  let p = ICONS.get(id);
  if (!p) {
    p = new Path2D(ICON_SRC[id] ?? ICON_SRC.check);
    ICONS.set(id, p);
  }
  const k = size / 24;
  c.save();
  c.translate(x - size / 2, y - size / 2);
  c.scale(k, k);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = lw;
  if (fill) {
    c.fillStyle = color;
    c.fill(p);
  }
  c.strokeStyle = color;
  c.stroke(p);
  c.restore();
}
