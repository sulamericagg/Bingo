/* ============================================================
 *  ESTÚDIO DE MAQUIAGEM — desenho do look.
 *
 *  Cada traço é pintado primeiro num canvas de rascunho (opaco,
 *  carimbos/linhas, com o espelho), depois aplicado na camada com a
 *  força do traço (alpha), recortado pela zona inteligente. Assim o
 *  traço ao vivo (incremental, no dedo) e o redesenho completo dão o
 *  MESMO resultado. As camadas são somadas com a opacidade de cada uma.
 *
 *  Uso fora do estúdio: lookCanvas(look, px) (cache por look e
 *  tamanho) e makeupOverlay(look) — o gancho SkinOverlay do drawAvatar.
 * ============================================================ */
import type { SkinOverlay } from '../game/avatar';
import { detectInitialTier } from '../core/quality';
import { EXTENT, playerLook, type Layer, type MakeupLook, type Stroke, type ZoneId } from './format';

const SPAN = EXTENT * 2;

/* ---------------------------- zonas inteligentes ---------------------------- */
/** Elipses de cada zona no espaço do rosto (R/100; origem = centro do rosto, y para baixo). */
export const ZONE_SHAPES: Record<Exclude<ZoneId, 'free'>, [cx: number, cy: number, rx: number, ry: number][]> = {
  lips: [[0, 27, 25, 12]],
  eyes: [
    [-34, -14, 27, 23],
    [34, -14, 27, 23],
  ],
  cheeks: [
    [-50, 17, 25, 18],
    [50, 17, 25, 18],
  ],
  forehead: [[0, -60, 62, 27]],
};

export function zonePath(x: CanvasRenderingContext2D, z: ZoneId): void {
  x.beginPath();
  if (z === 'free') return void x.rect(-EXTENT, -EXTENT, SPAN, SPAN);
  for (const [cx, cy, rx, ry] of ZONE_SHAPES[z]) {
    x.moveTo(cx + rx, cy);
    x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
}

/* ---------------------------- pincéis ---------------------------- */
interface BrushDef {
  /** carimbo suave (gradiente) ou duro */
  soft: boolean;
  /** opacidade de cada carimbo no rascunho (acumula dentro do traço) */
  flow: number;
  /** teto da força do traço ao aplicar na camada */
  max: number;
  /** espaçamento entre carimbos (× raio) */
  gap: number;
}
const BR: Record<Stroke['b'], BrushDef> = {
  base: { soft: true, flow: 0.35, max: 0.55, gap: 0.3 },
  blush: { soft: true, flow: 0.3, max: 0.7, gap: 0.3 },
  shadow: { soft: true, flow: 0.4, max: 0.85, gap: 0.25 },
  lips: { soft: false, flow: 1, max: 0.92, gap: 0.2 },
  contour: { soft: true, flow: 0.3, max: 0.55, gap: 0.3 },
  highlight: { soft: true, flow: 0.4, max: 0.75, gap: 0.3 },
  glitter: { soft: false, flow: 1, max: 1, gap: 0.5 },
  stars: { soft: false, flow: 1, max: 1, gap: 2.6 },
  hearts: { soft: false, flow: 1, max: 1, gap: 2.6 },
  stripes: { soft: false, flow: 1, max: 1, gap: 0.2 },
  erase: { soft: true, flow: 0.6, max: 1, gap: 0.25 },
};

const softSprites = new Map<string, HTMLCanvasElement>();
function softSprite(c: string): HTMLCanvasElement {
  let s = softSprites.get(c);
  if (s) return s;
  s = document.createElement('canvas');
  s.width = s.height = 64;
  const x = s.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  const rgb = hexRgb(c);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.45, `rgba(${rgb},.75)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  if (softSprites.size > 64) softSprites.clear();
  softSprites.set(c, s);
  return s;
}
export function hexRgb(c: string): string {
  const n = parseInt(c.slice(1), 16) || 0;
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}
const rnd = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function lighten(c: string, k: number): string {
  const n = parseInt(c.slice(1), 16) || 0;
  const f = (v: number) => Math.round(v + (255 - v) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function starPath(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rot: number): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    else x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
}
function heartPath(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.moveTo(cx, cy + r * 0.9);
  x.bezierCurveTo(cx - r * 1.4, cy - r * 0.1, cx - r * 0.7, cy - r * 1.15, cx, cy - r * 0.45);
  x.bezierCurveTo(cx + r * 0.7, cy - r * 1.15, cx + r * 1.4, cy - r * 0.1, cx, cy + r * 0.9);
  x.closePath();
}

/** Cursor de um traço: permite desenhar só o trecho novo (pintura ao vivo). */
export interface Cursor {
  i: number;
  carry: number;
  n: number;
}
export const newCursor = (): Cursor => ({ i: 0, carry: 0, n: 0 });

/** Um carimbo em (px,py) unidades do rosto. */
function stamp(x: CanvasRenderingContext2D, st: Stroke, px: number, py: number, n: number): void {
  const r = st.s / 2;
  switch (st.b) {
    case 'lips':
    case 'stripes':
      x.beginPath();
      x.arc(px, py, r, 0, Math.PI * 2);
      x.fill();
      return;
    case 'glitter': {
      // pontinhos de brilho de tamanhos e tons variados (determinístico por carimbo)
      const k = Math.max(3, Math.round(r * 0.5));
      for (let j = 0; j < k; j++) {
        const a = rnd(n * 13 + j) * Math.PI * 2;
        const d = Math.sqrt(rnd(n * 17 + j * 3)) * r;
        const s = 0.7 + rnd(n * 7 + j) * 1.6;
        x.fillStyle = rnd(n * 5 + j) > 0.7 ? '#ffffff' : lighten(st.c, rnd(n * 3 + j) * 0.6);
        x.fillRect(px + Math.cos(a) * d - s / 2, py + Math.sin(a) * d - s / 2, s, s);
      }
      if (rnd(n * 31) > 0.82) {
        x.fillStyle = '#ffffff';
        starPath(x, px + (rnd(n) - 0.5) * r, py + (rnd(n + 1) - 0.5) * r, r * 0.35, 0);
        x.fill();
      }
      return;
    }
    case 'stars':
      x.fillStyle = st.c;
      starPath(x, px, py, r, (rnd(n) - 0.5) * 0.6);
      x.fill();
      return;
    case 'hearts':
      x.fillStyle = st.c;
      heartPath(x, px, py, r * 0.85);
      x.fill();
      return;
    default: {
      const def = BR[st.b];
      x.globalAlpha = def.flow;
      x.drawImage(softSprite(st.b === 'erase' ? '#000000' : st.c), px - r, py - r, r * 2, r * 2);
      x.globalAlpha = 1;
    }
  }
}

/** Desenha (no rascunho) o trecho do traço ainda não desenhado. Contexto já em unidades do rosto. */
export function strokeScratch(x: CanvasRenderingContext2D, st: Stroke, cur: Cursor): void {
  const p = st.p;
  const def = BR[st.b];
  const gap = Math.max(0.6, (st.s / 2) * def.gap);
  x.fillStyle = st.c;
  const mirrorPass = (fn: () => void) => {
    fn();
    if (st.m) {
      x.save();
      x.scale(-1, 1);
      fn();
      x.restore();
    }
  };
  const np = p.length / 2;
  if (cur.i === 0 && np >= 1) {
    const n0 = cur.n++;
    mirrorPass(() => stamp(x, st, p[0], p[1], n0));
    cur.i = 1;
    cur.carry = 0;
  }
  for (; cur.i < np; cur.i++) {
    const ax = p[cur.i * 2 - 2];
    const ay = p[cur.i * 2 - 1];
    const bx = p[cur.i * 2];
    const by = p[cur.i * 2 + 1];
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-3) continue;
    let d = gap - cur.carry;
    while (d <= len) {
      const k = d / len;
      const n = cur.n++;
      mirrorPass(() => stamp(x, st, ax + (bx - ax) * k, ay + (by - ay) * k, n));
      d += gap;
    }
    cur.carry = len - (d - gap);
  }
}

/** Aplica o rascunho na camada: força, zona e borracha. Ambos os canvases do mesmo tamanho. */
export function applyScratch(layer: CanvasRenderingContext2D, scratch: HTMLCanvasElement, st: Stroke): void {
  const W = layer.canvas.width;
  const k = W / SPAN;
  layer.save();
  if (st.z) {
    layer.setTransform(k, 0, 0, k, W / 2, W / 2);
    zonePath(layer, st.z);
    layer.clip();
  }
  layer.setTransform(1, 0, 0, 1, 0, 0);
  layer.globalAlpha = (st.a / 100) * BR[st.b].max;
  layer.globalCompositeOperation = st.b === 'erase' ? 'destination-out' : 'source-over';
  layer.drawImage(scratch, 0, 0);
  layer.restore();
}

/** Prepara um contexto para desenhar em unidades do rosto. */
export function unitCtx(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = cv.getContext('2d')!;
  const k = cv.width / SPAN;
  x.setTransform(k, 0, 0, k, cv.width / 2, cv.width / 2);
  return x;
}

let scratchCv: HTMLCanvasElement | null = null;
export function scratchOf(px: number): HTMLCanvasElement {
  if (!scratchCv) scratchCv = document.createElement('canvas');
  if (scratchCv.width !== px) scratchCv.width = scratchCv.height = px;
  return scratchCv;
}

/** Redesenha uma camada inteira num canvas (limpa antes). */
export function renderLayer(cv: HTMLCanvasElement, L: Layer): void {
  const x = cv.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, cv.width, cv.height);
  const sc = scratchOf(cv.width);
  for (const st of L.st) {
    const sx = sc.getContext('2d')!;
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.clearRect(0, 0, sc.width, sc.height);
    strokeScratch(unitCtx(sc), st, newCursor());
    applyScratch(x, sc, st);
  }
}

/** Soma as camadas (visíveis) num canvas final. */
export function composeLayers(out: HTMLCanvasElement, layers: Layer[], canvases: HTMLCanvasElement[]): void {
  const x = out.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, out.width, out.height);
  layers.forEach((L, i) => {
    if (L.h || !canvases[i]) return;
    x.globalAlpha = L.o / 100;
    x.drawImage(canvases[i], 0, 0);
  });
  x.globalAlpha = 1;
}

/* ---------------------------- cache para o jogo / Cinema ---------------------------- */
const cache = new WeakMap<MakeupLook, Map<number, HTMLCanvasElement>>();
let tierCap = 0;
/** Maior textura de maquiagem conforme a qualidade do aparelho (256 / 384 / 512). */
export function maxLookPx(): number {
  if (!tierCap) {
    let tier = 2;
    try {
      tier = detectInitialTier();
    } catch {
      /* */
    }
    tierCap = tier <= 0 ? 256 : tier === 1 ? 384 : 512;
  }
  return tierCap;
}
const bucket = (px: number): number => (px <= 140 ? 128 : px <= 280 ? 256 : px <= 400 ? 384 : 512);

/** Canvas (px × px) com o look inteiro (cobre ±EXTENT unidades). Em cache. */
export function lookCanvas(look: MakeupLook, px: number): HTMLCanvasElement {
  px = Math.min(maxLookPx(), bucket(px));
  let m = cache.get(look);
  if (!m) cache.set(look, (m = new Map()));
  let cv = m.get(px);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = cv.height = px;
  const tmp = look.layers.map((L) => {
    const c = document.createElement('canvas');
    c.width = c.height = px;
    if (!L.h) renderLayer(c, L);
    return c;
  });
  composeLayers(cv, look.layers, tmp);
  m.set(px, cv);
  return cv;
}

/** Desenha o look num contexto já centrado no corpo (raio R; rosto em fy·R). */
export function drawLook(x: CanvasRenderingContext2D, look: MakeupLook, R: number, fy: number): void {
  const m = x.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const size = R * (SPAN / 100);
  const cv = lookCanvas(look, size * scale);
  x.drawImage(cv, -size / 2, fy * R - size / 2, size, size);
}

const overlays = new WeakMap<MakeupLook, SkinOverlay>();
/** Gancho para drawAvatar(…, overlay). null se não houver look. */
export function makeupOverlay(look: MakeupLook | null | undefined): SkinOverlay | null {
  if (!look) return null;
  let o = overlays.get(look);
  if (!o) overlays.set(look, (o = (x, R, fy) => drawLook(x, look, R, fy)));
  return o;
}

/**
 * Gancho do look do JOGADOR (Crie seu Bloop / Bloop Espelho):
 * `drawAvatar(x, av, R, pose, playerMakeupOverlay())`. Integração somente-leitura: quem
 * desenha o avatar do jogador só precisa passar este gancho (o Espelho pode adotar sem
 * mudar mais nada).
 */
export function playerMakeupOverlay(): SkinOverlay | null {
  return makeupOverlay(playerLook());
}
