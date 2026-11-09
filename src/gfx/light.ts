/* ============================================================
 *  KIT DE LUZ 2D (TEAM Ross)
 *  Tudo é pré-renderizado UMA vez em sprites pequenos e reaproveitado:
 *  nenhum canvas/degradê é criado por frame. Cada função recebe o
 *  contexto já transformado (coordenadas lógicas do jogo).
 *
 *  - drawLight        luz aditiva (sprite radial, 'lighter')
 *  - drawSoftShadow   sombra de contato borrada (ou elipse chapada no Mínimo)
 *  - drawSphereShade  sombreado "3D" de esfera (luz + terminador + oclusão)
 *  - drawRim          luz de recorte (crescente na borda oposta à luz)
 *  - drawSpecular     brilho especular em estrela
 *  - drawRays         raios de luz (god rays) girando devagar
 *  - drawFlare        reflexo de lente (série de halos na linha luz→centro)
 *  - drawVignette     vinheta em cache por cor
 *  - drawGrade        gradação de cor (topo/baixo) com 'soft-light'
 *  - Bloom            bloom barato: cópia 1/4, limiar por multiply, blur, 'lighter'
 * ============================================================ */

const TAU = Math.PI * 2;

function mk(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/* ------------------------------ luz radial ------------------------------ */

const glowCache = new Map<string, HTMLCanvasElement>();

/** Sprite radial 128px. `rgb` = "255,200,120". `hard` = núcleo mais definido. */
export function glowSprite(rgb: string, hard = false): HTMLCanvasElement {
  const key = rgb + (hard ? 'h' : 's');
  let c = glowCache.get(key);
  if (c) return c;
  const [cv, x] = mk(128);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (hard) {
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.18, `rgba(${rgb},0.85)`);
    g.addColorStop(0.45, `rgba(${rgb},0.25)`);
  } else {
    g.addColorStop(0, `rgba(${rgb},0.8)`);
    g.addColorStop(0.3, `rgba(${rgb},0.38)`);
    g.addColorStop(0.65, `rgba(${rgb},0.1)`);
  }
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  glowCache.set(key, cv);
  c = cv;
  return c;
}

/** Luz aditiva de raio `r` (pode ser elíptica com `sy`). */
export function drawLight(x: CanvasRenderingContext2D, rgb: string, cx: number, cy: number, r: number, a = 1, sy = 1, hard = false): void {
  if (a <= 0.01 || r <= 0) return;
  const op = x.globalCompositeOperation;
  const ga = x.globalAlpha;
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = ga * Math.min(1, a);
  x.drawImage(glowSprite(rgb, hard), cx - r, cy - r * sy, r * 2, r * 2 * sy);
  x.globalAlpha = ga;
  x.globalCompositeOperation = op;
}

/* ---------------------------- sombra de contato ---------------------------- */

let shadowSpr: HTMLCanvasElement | null = null;
function shadowSprite(): HTMLCanvasElement {
  if (shadowSpr) return shadowSpr;
  const [c, x] = mk(64);
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.8, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  shadowSpr = c;
  return c;
}

/** Sombra de contato: borrada (soft) ou elipse chapada barata. */
export function drawSoftShadow(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, a: number, soft: boolean, flat = 'rgba(0,0,0,1)'): void {
  if (a <= 0.01) return;
  const ga = x.globalAlpha;
  x.globalAlpha = ga * a;
  if (soft) {
    // o sprite some na borda: aumenta um pouco para a mancha "útil" ter rx×ry
    x.drawImage(shadowSprite(), cx - rx * 1.25, cy - ry * 1.25, rx * 2.5, ry * 2.5);
  } else {
    x.fillStyle = flat;
    x.beginPath();
    x.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    x.fill();
  }
  x.globalAlpha = ga;
}

/* ----------------------------- esfera / recorte ----------------------------- */

let shadeSpr: HTMLCanvasElement | null = null;
/** Sombreado neutro de esfera com a luz em cima-esquerda (gira na hora de desenhar). */
function shadeSprite(): HTMLCanvasElement {
  if (shadeSpr) return shadeSpr;
  const [c, x] = mk(128);
  // terminador / oclusão (escurece o lado oposto à luz)
  const d = x.createRadialGradient(44, 40, 8, 64, 64, 64);
  d.addColorStop(0, 'rgba(0,0,0,0)');
  d.addColorStop(0.55, 'rgba(0,0,0,0)');
  d.addColorStop(0.86, 'rgba(10,0,40,0.28)');
  d.addColorStop(1, 'rgba(10,0,40,0.5)');
  x.fillStyle = d;
  x.beginPath();
  x.arc(64, 64, 64, 0, TAU);
  x.fill();
  // luz difusa
  const l = x.createRadialGradient(42, 38, 0, 42, 38, 46);
  l.addColorStop(0, 'rgba(255,255,255,0.42)');
  l.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = l;
  x.fill();
  shadeSpr = c;
  return c;
}

/** Sombreado 3D para um círculo já desenhado (luz vinda de `ang`, padrão cima-esquerda). */
export function drawSphereShade(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, a = 1, ang = -2.36): void {
  const ga = x.globalAlpha;
  x.globalAlpha = ga * a;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang + 2.36);
  x.drawImage(shadeSprite(), -r, -r, r * 2, r * 2);
  x.restore();
  x.globalAlpha = ga;
}

const rimCache = new Map<string, HTMLCanvasElement>();
function rimSprite(rgb: string): HTMLCanvasElement {
  let c = rimCache.get(rgb);
  if (c) return c;
  const [cv, x] = mk(128);
  // crescente no lado +x, borda suave
  const g = x.createRadialGradient(64, 64, 50, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},0)`);
  g.addColorStop(0.75, `rgba(${rgb},0.9)`);
  g.addColorStop(1, `rgba(${rgb},0.3)`);
  x.fillStyle = g;
  x.beginPath();
  x.arc(64, 64, 64, 0, TAU);
  x.fill();
  x.globalCompositeOperation = 'destination-out';
  const m = x.createLinearGradient(0, 0, 128, 0);
  m.addColorStop(0, 'rgba(0,0,0,1)');
  m.addColorStop(0.55, 'rgba(0,0,0,1)');
  m.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = m;
  x.fillRect(0, 0, 128, 128);
  rimCache.set(rgb, cv);
  c = cv;
  return c;
}

/** Luz de recorte: crescente aditivo na borda virada para `ang` (rad). */
export function drawRim(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, ang: number, rgb: string, a = 0.6): void {
  if (a <= 0.01) return;
  const op = x.globalCompositeOperation;
  const ga = x.globalAlpha;
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = ga * a;
  x.save();
  x.translate(cx, cy);
  x.rotate(ang);
  x.drawImage(rimSprite(rgb), -r, -r, r * 2, r * 2);
  x.restore();
  x.globalAlpha = ga;
  x.globalCompositeOperation = op;
}

let specSpr: HTMLCanvasElement | null = null;
/** Brilho especular em estrela de 4 pontas. */
export function drawSpecular(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, a = 1): void {
  if (!specSpr) {
    const [c, g] = mk(64);
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.15, 'rgba(255,255,255,0.6)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath();
    g.moveTo(32, 0);
    g.quadraticCurveTo(34, 30, 64, 32);
    g.quadraticCurveTo(34, 34, 32, 64);
    g.quadraticCurveTo(30, 34, 0, 32);
    g.quadraticCurveTo(30, 30, 32, 0);
    g.fill();
    specSpr = c;
  }
  const op = x.globalCompositeOperation;
  const ga = x.globalAlpha;
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = ga * a;
  x.drawImage(specSpr, cx - s, cy - s, s * 2, s * 2);
  x.globalAlpha = ga;
  x.globalCompositeOperation = op;
}

/* --------------------------------- raios --------------------------------- */

const rayCache = new Map<string, HTMLCanvasElement>();
function raySprite(rgb: string): HTMLCanvasElement {
  let c = rayCache.get(rgb);
  if (c) return c;
  const [cv, x] = mk(256);
  x.translate(128, 128);
  let s = 3;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + rnd() * 0.2;
    const w = 0.05 + rnd() * 0.09;
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 128);
    const k = 0.35 + rnd() * 0.5;
    g.addColorStop(0, `rgba(${rgb},${k})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, 0);
    x.arc(0, 0, 128, a - w, a + w);
    x.closePath();
    x.fill();
  }
  rayCache.set(rgb, cv);
  c = cv;
  return c;
}

/** Raios de luz aditivos ao redor de (cx,cy), raio `len`, girando com `t`. */
export function drawRays(x: CanvasRenderingContext2D, cx: number, cy: number, len: number, t: number, rgb: string, a = 0.35): void {
  if (a <= 0.01) return;
  const op = x.globalCompositeOperation;
  const ga = x.globalAlpha;
  x.globalCompositeOperation = 'lighter';
  x.globalAlpha = ga * a;
  x.save();
  x.translate(cx, cy);
  x.rotate(t * 0.05);
  x.drawImage(raySprite(rgb), -len, -len, len * 2, len * 2);
  x.rotate(-t * 0.11);
  x.globalAlpha = ga * a * 0.6;
  x.drawImage(raySprite(rgb), -len * 0.8, -len * 0.8, len * 1.6, len * 1.6);
  x.restore();
  x.globalAlpha = ga;
  x.globalCompositeOperation = op;
}

/** Reflexo de lente: halos na reta da fonte (sx,sy) passando pelo centro (cx,cy). */
export function drawFlare(x: CanvasRenderingContext2D, sx: number, sy: number, cx: number, cy: number, size: number, a = 1): void {
  if (a <= 0.01) return;
  const dx = cx - sx;
  const dy = cy - sy;
  const F: [number, number, string][] = [
    [0, 1.6, '255,240,220'],
    [0.5, 0.25, '120,200,255'],
    [0.8, 0.4, '255,140,220'],
    [1.25, 0.18, '160,255,200'],
    [1.6, 0.55, '140,120,255'],
  ];
  for (const [k, s, c] of F) drawLight(x, c, sx + dx * k, sy + dy * k, size * s, a * (k === 0 ? 0.8 : 0.35), 1, k !== 0);
}

/* ------------------------------ vinheta / cor ------------------------------ */

const vigCache = new Map<string, HTMLCanvasElement>();
/** Vinheta: sprite 128px esticado na tela (custo de um drawImage). */
export function drawVignette(x: CanvasRenderingContext2D, w: number, h: number, a = 0.5, rgb = '10,0,30'): void {
  if (a <= 0.01) return;
  let c = vigCache.get(rgb);
  if (!c) {
    const [cv, g] = mk(128);
    const r = g.createRadialGradient(64, 64, 30, 64, 64, 92);
    r.addColorStop(0, `rgba(${rgb},0)`);
    r.addColorStop(0.6, `rgba(${rgb},0.35)`);
    r.addColorStop(1, `rgba(${rgb},1)`);
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    vigCache.set(rgb, cv);
    c = cv;
  }
  const ga = x.globalAlpha;
  x.globalAlpha = ga * a;
  x.drawImage(c, 0, 0, w, h);
  x.globalAlpha = ga;
}

const gradeCache = new Map<string, HTMLCanvasElement>();
/** Gradação de cor topo→baixo (ex.: topo quente, base fria) com 'soft-light'. */
export function drawGrade(x: CanvasRenderingContext2D, w: number, h: number, top: string, bottom: string, a = 1, mode: GlobalCompositeOperation = 'soft-light'): void {
  const key = top + '|' + bottom;
  let c = gradeCache.get(key);
  if (!c) {
    const [cv, g] = mk(2, 64);
    const l = g.createLinearGradient(0, 0, 0, 64);
    l.addColorStop(0, top);
    l.addColorStop(1, bottom);
    g.fillStyle = l;
    g.fillRect(0, 0, 2, 64);
    gradeCache.set(key, cv);
    c = cv;
  }
  const op = x.globalCompositeOperation;
  const ga = x.globalAlpha;
  x.globalCompositeOperation = mode;
  x.globalAlpha = ga * a;
  x.drawImage(c, 0, 0, w, h);
  x.globalAlpha = ga;
  x.globalCompositeOperation = op;
}

/* --------------------------------- bloom --------------------------------- */

/**
 * Bloom barato (só no Alto). Por frame: 1 drawImage reduzido (1/4), 2 multiplys
 * sobre si mesmo (limiar ~ cor^3: só o que é claro sobrevive), 1 blur pequeno
 * (ctx.filter quando existe; senão a própria redução/ampliação bilinear borra)
 * e 1 drawImage aditivo de volta. Os canvases são criados só quando o tamanho muda.
 */
export class Bloom {
  private a: HTMLCanvasElement | null = null;
  private b: HTMLCanvasElement | null = null;
  private ax: CanvasRenderingContext2D | null = null;
  private bx: CanvasRenderingContext2D | null = null;
  private hasFilter = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

  /** `src` = o canvas do jogo (em pixels físicos); desenha de volta em `x` cobrindo w×h lógicos. */
  apply(x: CanvasRenderingContext2D, src: HTMLCanvasElement, w: number, h: number, strength = 0.6, scale = 0.25): void {
    if (strength <= 0.01) return;
    const sw = Math.max(16, Math.round(src.width * scale));
    const sh = Math.max(16, Math.round(src.height * scale));
    if (!this.a || this.a.width !== sw || this.a.height !== sh) {
      [this.a, this.ax] = mk(sw, sh);
      [this.b, this.bx] = mk(sw, sh);
    }
    const ax = this.ax!;
    const bx = this.bx!;
    ax.globalCompositeOperation = 'copy';
    ax.drawImage(src, 0, 0, sw, sh);
    ax.globalCompositeOperation = 'multiply';
    ax.drawImage(this.a, 0, 0);
    ax.drawImage(this.a, 0, 0);
    bx.globalCompositeOperation = 'copy';
    if (this.hasFilter) bx.filter = 'blur(2px)';
    bx.drawImage(this.a, 0, 0);
    if (this.hasFilter) bx.filter = 'none';
    const op = x.globalCompositeOperation;
    const ga = x.globalAlpha;
    x.globalCompositeOperation = 'lighter';
    x.globalAlpha = strength;
    x.imageSmoothingEnabled = true;
    x.drawImage(this.b!, 0, 0, w, h);
    x.globalAlpha = ga;
    x.globalCompositeOperation = op;
  }
}
