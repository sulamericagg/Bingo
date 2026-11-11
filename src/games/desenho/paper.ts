/* ============================================================
 *  DESENHA E VIRA! — o papel de desenho.
 *  - pointer events + getCoalescedEvents (traço sem "dentes" mesmo em celular lento)
 *  - estabilizador leve (lazy brush) + curvas quadráticas entre pontos médios
 *  - largura pela velocidade (devagar = grosso, rápido = fino, tipo pincel)
 *  - borracha, balde (preenchimento por região, sem halo), desfazer/refazer, simetria
 *  O desenho é sempre REFEITO a partir dos traços (strokes.ts), em resolução fixa.
 * ============================================================ */
import { PALETTE, SIZES, inkLength, ptWidth, strokeLen, thinPoints, type Drawing, type Stroke, type Tool } from './strokes';

/* ----------------------------- desenho dos traços ----------------------------- */

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** desenha um caminho (x,y,w...) já em unidades lógicas, com escala k */
function drawPath(x: CanvasRenderingContext2D, s: Stroke, p: number[], k: number, from = 0): void {
  const n = p.length / 3;
  if (n === 0) return;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  if (n === 1) {
    x.beginPath();
    x.arc(p[0] * k, p[1] * k, (ptWidth(s, p[2]) * k) / 2, 0, Math.PI * 2);
    x.fill();
    return;
  }
  let sx = p[0];
  let sy = p[1];
  let sw = p[2];
  if (from > 1) {
    // retoma do ponto médio anterior (desenho ao vivo)
    sx = (p[(from - 1) * 3] + p[from * 3]) / 2;
    sy = (p[(from - 1) * 3 + 1] + p[from * 3 + 1]) / 2;
    sw = (p[(from - 1) * 3 + 2] + p[from * 3 + 2]) / 2;
  }
  for (let i = Math.max(1, from); i < n - 1; i++) {
    const cx = p[i * 3];
    const cy = p[i * 3 + 1];
    const mx = (cx + p[i * 3 + 3]) / 2;
    const my = (cy + p[i * 3 + 4]) / 2;
    const mw = (p[i * 3 + 2] + p[i * 3 + 5]) / 2;
    x.lineWidth = ptWidth(s, (sw + p[i * 3 + 2] + mw) / 3) * k;
    x.beginPath();
    x.moveTo(sx * k, sy * k);
    x.quadraticCurveTo(cx * k, cy * k, mx * k, my * k);
    x.stroke();
    sx = mx;
    sy = my;
    sw = mw;
  }
}
function drawTail(x: CanvasRenderingContext2D, s: Stroke, p: number[], k: number): void {
  const n = p.length / 3;
  if (n < 2) return;
  const i = n - 2;
  const sx = n === 2 ? p[0] : (p[i * 3] + p[i * 3 + 3]) / 2;
  const sy = n === 2 ? p[1] : (p[i * 3 + 1] + p[i * 3 + 4]) / 2;
  x.lineWidth = ptWidth(s, p[n * 3 - 1]) * k;
  x.beginPath();
  x.moveTo(sx * k, sy * k);
  x.lineTo(p[n * 3 - 3] * k, p[n * 3 - 2] * k);
  x.stroke();
}

function styleFor(x: CanvasRenderingContext2D, s: Stroke): void {
  x.globalCompositeOperation = s.t === 'erase' ? 'destination-out' : 'source-over';
  const col = s.t === 'erase' ? '#000' : PALETTE[s.c];
  x.strokeStyle = col;
  x.fillStyle = col;
}

function scanFill(W: number, H: number, sx: number, sy: number, like: (i: number) => boolean): Uint8Array {
  const mark = new Uint8Array(W * H);
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop()!;
    let xx = stack.pop()!;
    let i = y * W + xx;
    while (xx >= 0 && !mark[i] && like(i * 4)) {
      xx--;
      i--;
    }
    xx++;
    i++;
    let up = false;
    let dn = false;
    while (xx < W && !mark[i] && like(i * 4)) {
      mark[i] = 1;
      if (y > 0) {
        const u = i - W;
        if (!mark[u] && like(u * 4)) {
          if (!up) stack.push(xx, y - 1), (up = true);
        } else up = false;
      }
      if (y < H - 1) {
        const v = i + W;
        if (!mark[v] && like(v * 4)) {
          if (!dn) stack.push(xx, y + 1), (dn = true);
        } else dn = false;
      }
      xx++;
      i++;
    }
  }
  return mark;
}

function touchesBorder(m: Uint8Array, W: number, H: number): boolean {
  for (let x = 0; x < W; x++) if (m[x] || m[(H - 1) * W + x]) return true;
  for (let y = 0; y < H; y++) if (m[y * W] || m[y * W + W - 1]) return true;
  return false;
}

/** dilatação quadrada (raio R) separável: O(W·H) */
function dilate(src: Uint8Array, W: number, H: number, R: number): Uint8Array {
  const tmp = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    let c = 0;
    const o = y * W;
    for (let x = 0; x < Math.min(R, W); x++) c += src[o + x] ? 1 : 0;
    for (let x = 0; x < W; x++) {
      if (x + R < W && src[o + x + R]) c++;
      if (x - R - 1 >= 0 && src[o + x - R - 1]) c--;
      tmp[o + x] = c > 0 ? 1 : 0;
    }
  }
  for (let x = 0; x < W; x++) {
    let c = 0;
    for (let y = 0; y < Math.min(R, H); y++) c += tmp[y * W + x];
    for (let y = 0; y < H; y++) {
      if (y + R < H) c += tmp[(y + R) * W + x];
      if (y - R - 1 >= 0) c -= tmp[(y - R - 1) * W + x];
      out[y * W + x] = c > 0 ? 1 : 0;
    }
  }
  return out;
}

/** balde: preenche a região conectada de cor parecida (tolerante), sem halo nas bordas */
export function floodFill(x: CanvasRenderingContext2D, px: number, py: number, hex: string): void {
  const W = x.canvas.width;
  const H = x.canvas.height;
  const sx = Math.floor(px);
  const sy = Math.floor(py);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const si = (sy * W + sx) * 4;
  const r0 = d[si],
    g0 = d[si + 1],
    b0 = d[si + 2],
    a0 = d[si + 3];
  const [fr, fg, fb] = hexRgb(hex);
  if (a0 > 200 && Math.abs(r0 - fr) + Math.abs(g0 - fg) + Math.abs(b0 - fb) < 12) return;
  const TOL = 64;
  const like = (i: number): boolean => {
    const a = d[i + 3];
    if (a0 < 40) return a < 48; // região vazia: qualquer tinta (mesmo a borda suave de um traço fino) é parede
    return a > 110 && Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) + Math.abs(a - a0) < TOL * 2;
  };
  let mark = scanFill(W, H, sx, sy, like);
  // criança quase fechou o desenho? Fecha frestas pequenas: tinta engrossada vira parede,
  // pinta por dentro e devolve a borda. Só vale se a região "fechada" não encostar na borda do papel.
  if (a0 < 40 && touchesBorder(mark, W, H)) {
    const R = Math.max(3, Math.round(Math.min(W, H) * 0.035));
    const wall = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) wall[i] = like(i * 4) ? 0 : 1;
    const thick = dilate(wall, W, H, R);
    if (!thick[sy * W + sx]) {
      const inner = scanFill(W, H, sx, sy, (j) => !thick[j >> 2]);
      if (!touchesBorder(inner, W, H)) {
        const grown = dilate(inner, W, H, R + 1);
        for (let i = 0; i < W * H; i++) grown[i] = grown[i] && !wall[i] ? 1 : 0;
        mark = grown;
      }
    }
  }
  // franja de 2 px: a tinta antialiasada fica POR CIMA da cor nova (sem halo branco)
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let y = 1; y < H - 1; y++)
      for (let xx = 1; xx < W - 1; xx++) {
        const i = y * W + xx;
        if (mark[i]) continue;
        if (mark[i - 1] === 1 || mark[i + 1] === 1 || mark[i - W] === 1 || mark[i + W] === 1) add.push(i);
      }
    for (const i of add) mark[i] = 2;
    for (let i = 0; i < mark.length; i++) if (mark[i] === 2) mark[i] = 3;
  }
  for (let i = 0; i < mark.length; i++) {
    const m = mark[i];
    if (!m) continue;
    const j = i * 4;
    if (m === 1) {
      d[j] = fr;
      d[j + 1] = fg;
      d[j + 2] = fb;
      d[j + 3] = 255;
    } else {
      const a = d[j + 3] / 255;
      d[j] = d[j] * a + fr * (1 - a);
      d[j + 1] = d[j + 1] * a + fg * (1 - a);
      d[j + 2] = d[j + 2] * a + fb * (1 - a);
      d[j + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
}

/** refaz o desenho inteiro num contexto (escala k = px por unidade lógica) */
export function renderDrawing(x: CanvasRenderingContext2D, d: Drawing, k: number, upto = d.strokes.length): void {
  x.save();
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, x.canvas.width, x.canvas.height);
  for (let i = 0; i < upto; i++) {
    const s = d.strokes[i];
    if (s.t === 'fill') {
      x.globalCompositeOperation = 'source-over';
      floodFill(x, s.p[0] * k, s.p[1] * k, PALETTE[s.c]);
      if (s.m) floodFill(x, (d.w - s.p[0]) * k, s.p[1] * k, PALETTE[s.c]);
      continue;
    }
    styleFor(x, s);
    const paths = s.m ? [s.p, mirror(d, s.p)] : [s.p];
    for (const p of paths) {
      drawPath(x, s, p, k);
      drawTail(x, s, p, k);
    }
  }
  x.restore();
}
function mirror(d: Drawing, p: number[]): number[] {
  const q = p.slice();
  for (let i = 0; i < q.length; i += 3) q[i] = d.w - q[i];
  return q;
}

/** miniatura (galeria) */
export function renderThumb(d: Drawing, size: number, bg = '#fffaf0'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const k = size / Math.max(d.w, d.h);
  c.width = Math.round(d.w * k);
  c.height = Math.round(d.h * k);
  const art = document.createElement('canvas');
  art.width = c.width;
  art.height = c.height;
  renderDrawing(art.getContext('2d', { willReadFrequently: true })!, d, k);
  const x = c.getContext('2d')!;
  x.fillStyle = bg;
  x.fillRect(0, 0, c.width, c.height);
  x.drawImage(art, 0, 0);
  return c;
}

/* ----------------------------- papel interativo ----------------------------- */

export interface PaperOptions {
  /** tamanho lógico */
  w: number;
  h: number;
  /** px do bitmap por unidade lógica */
  k?: number;
  /** tinta máxima (unidades lógicas); Infinity = livre */
  inkMax?: number;
}

export class Paper {
  readonly el: HTMLDivElement;
  readonly art: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  readonly k: number;
  drawing: Drawing;
  private redo: Stroke[] = [];
  tool: Tool = 'pen';
  color = 0;
  size = 1;
  sym = false;
  inkMax: number;
  enabled = true;
  /** chamado quando o desenho muda (traço novo, desfazer...) */
  onChange: () => void = () => {};
  /** chamado no primeiro toque de cada traço */
  onStart: () => void = () => {};
  /** tinta acabou durante o traço */
  onInkOut: () => void = () => {};
  private cur: Stroke | null = null;
  private pid = -1;
  private lx = 0;
  private ly = 0;
  private lt = 0;
  private vw = 0.6;
  private symLine: HTMLDivElement;
  private inkUsed = 0;

  constructor(o: PaperOptions) {
    this.k = o.k ?? 2;
    this.inkMax = o.inkMax ?? Infinity;
    this.drawing = { w: o.w, h: o.h, strokes: [] };
    this.el = document.createElement('div');
    this.el.className = 'dv-paper';
    this.art = document.createElement('canvas');
    this.art.className = 'dv-art';
    this.art.width = Math.round(o.w * this.k);
    this.art.height = Math.round(o.h * this.k);
    this.x = this.art.getContext('2d', { willReadFrequently: true })!;
    this.symLine = document.createElement('div');
    this.symLine.className = 'dv-symline';
    this.el.append(this.art, this.symLine);
    this.art.addEventListener('pointerdown', this.down);
    this.art.addEventListener('pointermove', this.move);
    this.art.addEventListener('pointerup', this.up);
    this.art.addEventListener('pointercancel', this.up);
    this.art.addEventListener('lostpointercapture', this.up);
    this.art.style.touchAction = 'none';
  }

  get empty(): boolean {
    return !this.drawing.strokes.some((s) => s.t !== 'erase');
  }
  get canUndo(): boolean {
    return this.drawing.strokes.length > 0;
  }
  get canRedo(): boolean {
    return this.redo.length > 0;
  }
  get ink(): number {
    return this.inkUsed;
  }

  setSym(on: boolean): void {
    this.sym = on;
    this.symLine.classList.toggle('on', on);
  }

  load(d: Drawing): void {
    this.drawing = { w: this.drawing.w, h: this.drawing.h, strokes: d.strokes.map((s) => ({ ...s, p: s.p.slice() })) };
    if (d.w !== this.drawing.w || d.h !== this.drawing.h) {
      const sx = this.drawing.w / d.w;
      const sy = this.drawing.h / d.h;
      const sc = Math.min(sx, sy);
      const ox = (this.drawing.w - d.w * sc) / 2;
      const oy = (this.drawing.h - d.h * sc) / 2;
      for (const s of this.drawing.strokes) for (let i = 0; i < s.p.length; i += 3) (s.p[i] = ox + s.p[i] * sc), (s.p[i + 1] = oy + s.p[i + 1] * sc);
    }
    this.redo = [];
    this.rerender();
  }
  clear(): void {
    if (!this.drawing.strokes.length) return;
    this.redo = [];
    this.drawing.strokes = [];
    this.rerender();
  }
  undo(): void {
    const s = this.drawing.strokes.pop();
    if (!s) return;
    this.redo.push(s);
    this.rerender();
  }
  redoOne(): void {
    const s = this.redo.pop();
    if (!s) return;
    this.drawing.strokes.push(s);
    this.rerender();
  }
  rerender(): void {
    renderDrawing(this.x, this.drawing, this.k);
    this.inkUsed = inkLength(this.drawing);
    this.onChange();
  }

  /** desenha programaticamente um traço (testes / tutorial) */
  addStroke(s: Stroke): void {
    this.drawing.strokes.push(s);
    this.redo = [];
    this.rerender();
  }

  private toLogic(e: PointerEvent): [number, number] {
    const r = this.art.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * this.drawing.w, ((e.clientY - r.top) / r.height) * this.drawing.h];
  }

  private down = (e: PointerEvent): void => {
    if (!this.enabled || this.pid !== -1 || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const [x, y] = this.toLogic(e);
    this.onStart();
    if (this.tool === 'fill') {
      const s: Stroke = { t: 'fill', c: this.color, s: 0, m: this.sym, p: [Math.round(x), Math.round(y), 0] };
      this.drawing.strokes.push(s);
      this.redo = [];
      this.x.save();
      floodFill(this.x, x * this.k, y * this.k, PALETTE[this.color]);
      if (this.sym) floodFill(this.x, (this.drawing.w - x) * this.k, y * this.k, PALETTE[this.color]);
      this.x.restore();
        this.onChange();
      return;
    }
    if (this.tool === 'pen' && this.inkUsed >= this.inkMax) {
      this.onInkOut();
      return;
    }
    this.pid = e.pointerId;
    try {
      this.art.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    this.lx = x;
    this.ly = y;
    this.lt = e.timeStamp;
    this.vw = 0.75;
    this.cur = { t: this.tool, c: this.color, s: this.size, m: this.sym, p: [x, y, 190] };
    this.livePaint();
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid || !this.cur) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    for (const ev of list) this.addPoint(ev);
    this.livePaint();
  };

  private addPoint(e: PointerEvent): void {
    const s = this.cur!;
    const [rx, ry] = this.toLogic(e);
    // estabilizador: o pincel segue o dedo com um pequeno atraso (some o tremido)
    const sz = SIZES[s.s];
    const lazy = Math.min(0.75, 0.35 + sz / 120);
    const x = this.lx + (rx - this.lx) * (1 - lazy * 0.55);
    const y = this.ly + (ry - this.ly) * (1 - lazy * 0.55);
    const dist = Math.hypot(x - this.lx, y - this.ly);
    if (dist < 1.2) return;
    const dtm = Math.max(1, e.timeStamp - this.lt);
    const v = dist / dtm; // unidades lógicas por ms
    const target = Math.max(0.35, Math.min(1, 1.05 - v * 0.3));
    this.vw += (target - this.vw) * 0.35;
    if (s.t === 'pen' && this.inkMax < Infinity) {
      const add = dist * (s.m ? 2 : 1);
      if (this.inkUsed + add > this.inkMax) {
        this.onInkOut();
        this.finish();
        return;
      }
      this.inkUsed += add;
    }
    s.p.push(x, y, Math.round(this.vw * 255));
    this.lx = x;
    this.ly = y;
    this.lt = e.timeStamp;
  }

  private painted = 0;
  private livePaint(): void {
    const s = this.cur;
    if (!s) return;
    const n = s.p.length / 3;
    this.x.save();
    styleFor(this.x, s);
    const paths = s.m ? [s.p, mirror(this.drawing, s.p)] : [s.p];
    if (n === 1) {
      for (const p of paths) drawPath(this.x, s, p, this.k);
      this.painted = 1;
    } else if (n - 1 > this.painted) {
      // segmentos novos (do último ponto médio desenhado até o novo)
      for (const p of paths) drawPath(this.x, s, p.slice(0, n * 3), this.k, Math.max(1, this.painted));
      this.painted = n - 1;
    }
    this.x.restore();
  }

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    // o estabilizador deixa o pincel atrás do dedo: no fim, alcança o dedo (fecha o contorno)
    const s = this.cur;
    if (s && s.t !== 'fill') {
      const [rx, ry] = this.toLogic(e);
      if (Number.isFinite(rx) && Math.hypot(rx - this.lx, ry - this.ly) > 1.2 && (e.clientX || e.clientY)) {
        s.p.push(rx, ry, Math.round(this.vw * 255));
        this.lx = rx;
        this.ly = ry;
      }
    }
    this.finish();
  };

  private finish(): void {
    const s = this.cur;
    this.pid = -1;
    this.cur = null;
    this.painted = 0;
    if (!s) return;
    s.p = thinPoints(s.p);
    for (let i = 0; i < s.p.length; i++) s.p[i] = Math.round(s.p[i]);
    if (s.t === 'erase' && !this.drawing.strokes.length) return;
    this.drawing.strokes.push(s);
    this.redo = [];
    // redesenha o traço final (com a cauda) — o ao-vivo só desenhou até o último ponto médio
    this.rerenderTail(s);
  }
  private rerenderTail(s: Stroke): void {
    if (s.t === 'erase') {
      this.rerender();
      return;
    }
    this.x.save();
    styleFor(this.x, s);
    const paths = s.m ? [s.p, mirror(this.drawing, s.p)] : [s.p];
    for (const p of paths) drawTail(this.x, s, p, this.k);
    this.x.restore();
    this.inkUsed = inkLength(this.drawing);
    this.onChange();
  }

  /** comprimento do traço mais longo (para heurísticas de UI) */
  longest(): number {
    return this.drawing.strokes.reduce((m, s) => (s.t === 'pen' ? Math.max(m, strokeLen(s)) : m), 0);
  }

  destroy(): void {
    this.el.remove();
  }
}
