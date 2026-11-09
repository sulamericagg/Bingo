/* ============================================================
 *  PINTURA — rolo / pincel / spray sobre uma área retangular.
 *  Cobertura numa grade grossa (células de ~10 u), salva compacta em hex.
 *  Acabamentos especiais: gradiente, listras, estrelas (estêncil), glitter.
 * ============================================================ */
import { PALETTE, pal, type Cost } from './catalog';
import { alpha, circ, makeCanvas, shade, star } from './gfx';
import { t } from '../i18n';

export type PaintTool = 'roller' | 'brush' | 'spray';
export const FINISHES = ['solid', 'gradient', 'stripes', 'stars', 'glitter'] as const;
export type Finish = (typeof FINISHES)[number];
export const finishName = (f: Finish): string =>
  t('home.paint.fin.' + f, ({ solid: 'Lisa', gradient: 'Degradê', stripes: 'Listras', stars: 'Estrelas', glitter: 'Glitter' } as Record<string, string>)[f]);
export const finishCost = (f: Finish): Cost =>
  f === 'solid' ? { kind: 'free' } : f === 'gradient' ? { kind: 'coins', n: 150 } : f === 'stripes' ? { kind: 'coins', n: 200 } : f === 'stars' ? { kind: 'video' } : { kind: 'gems', n: 5 };

/** "cor:acabamento" ex. "5:glitter" */
export function parseSpec(s: string | undefined): [number, Finish] | null {
  if (!s) return null;
  const [a, b] = s.split(':');
  const f = (FINISHES as readonly string[]).includes(b) ? (b as Finish) : 'solid';
  return [Number(a) || 0, f];
}

const patCache = new Map<string, CanvasPattern | string>();
/** Preenchimento do acabamento (padrão em cache). h = altura da área (degradê). */
export function finishFill(c: CanvasRenderingContext2D, colorIdx: number, f: Finish, h: number): CanvasPattern | string | CanvasGradient {
  const col = pal(colorIdx);
  if (f === 'solid') return col;
  if (f === 'gradient') {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(col, 0.45));
    g.addColorStop(1, shade(col, -0.15));
    return g;
  }
  const key = colorIdx + f;
  const hit = patCache.get(key);
  if (hit) return hit;
  const [cv, x] = makeCanvas(40, 40);
  x.fillStyle = col;
  x.fillRect(0, 0, 40, 40);
  if (f === 'stripes') {
    x.fillStyle = shade(col, 0.35);
    x.fillRect(0, 0, 14, 40);
  } else if (f === 'stars') {
    star(x, 10, 10, 6, 5, 0.5);
    x.fillStyle = shade(col, 0.5);
    x.fill();
    star(x, 30, 30, 6, 5, 0.5);
    x.fill();
  } else {
    for (let i = 0; i < 14; i++) {
      x.fillStyle = i % 3 ? alpha('#ffffff', 0.85) : shade(col, 0.6);
      const s = 1 + ((i * 7) % 3);
      x.fillRect((i * 17) % 40, (i * 23) % 40, s, s);
    }
  }
  const p = c.createPattern(cv, 'repeat') ?? col;
  patCache.set(key, p);
  return p;
}

export class Painter {
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;
  grid: Uint8Array;
  covered = 0;
  readonly canvas: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  colorIdx = 0;
  finish: Finish = 'solid';
  tape = true;
  constructor(
    public rx: number,
    public ry: number,
    public rw: number,
    public rh: number,
    res = 2,
  ) {
    this.cell = 10;
    this.cols = Math.ceil(rw / this.cell);
    this.rows = Math.ceil(rh / this.cell);
    this.grid = new Uint8Array(this.cols * this.rows);
    [this.canvas, this.x] = makeCanvas(rw * res, rh * res);
    this.x.scale(res, res);
  }
  get total(): number {
    return this.grid.length;
  }
  coverage(): number {
    return this.covered / this.total;
  }
  setPaint(colorIdx: number, f: Finish): void {
    if (colorIdx === this.colorIdx && f === this.finish) return;
    this.colorIdx = colorIdx;
    this.finish = f;
    this.clear();
  }
  clear(): void {
    this.grid.fill(0);
    this.covered = 0;
    this.x.clearRect(0, 0, this.rw, this.rh);
  }
  private mark(cx: number, cy: number): void {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return;
    const i = cy * this.cols + cx;
    if (!this.grid[i]) {
      this.grid[i] = 1;
      this.covered++;
    }
  }
  /** carimbo em coords lógicas (do cômodo). Retorna quantas células novas. */
  stamp(lx: number, ly: number, tool: PaintTool): number {
    const before = this.covered;
    const x = lx - this.rx,
      y = ly - this.ry;
    const c = this.x;
    c.save();
    c.beginPath();
    const m = this.tape ? 4 : 0;
    c.rect(m, m, this.rw - m * 2, this.rh - m * 2);
    c.clip();
    c.fillStyle = finishFill(c, this.colorIdx, this.finish, this.rh);
    const C = this.cell;
    if (tool === 'roller') {
      const w = 40,
        h = 26;
      c.beginPath();
      c.roundRect(x - w / 2, y - h / 2, w, h, 6);
      c.fill();
      for (let gy = Math.floor((y - h / 2 + 2) / C); gy <= Math.floor((y + h / 2 - 2) / C); gy++)
        for (let gx = Math.floor((x - w / 2 + 2) / C); gx <= Math.floor((x + w / 2 - 2) / C); gx++) this.mark(gx, gy);
    } else if (tool === 'brush') {
      circ(c, x, y, 11);
      c.fill();
      this.mark(Math.floor(x / C), Math.floor(y / C));
      this.mark(Math.floor((x + 6) / C), Math.floor(y / C));
      this.mark(Math.floor((x - 6) / C), Math.floor(y / C));
      this.mark(Math.floor(x / C), Math.floor((y + 6) / C));
      this.mark(Math.floor(x / C), Math.floor((y - 6) / C));
    } else {
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * 6.283,
          d = Math.sqrt(Math.random()) * 22;
        const px = x + Math.cos(a) * d,
          py = y + Math.sin(a) * d;
        circ(c, px, py, 2.4);
        c.fill();
        if (i % 2 === 0) this.mark(Math.floor(px / C), Math.floor(py / C));
      }
    }
    c.restore();
    // borda: com fita, as células encostadas na borda contam ao pintar a vizinha
    return this.covered - before;
  }
  /** completa 100% (quando > 97%: ninguém precisa caçar o último pixel) */
  fillAll(): void {
    const c = this.x;
    c.save();
    c.fillStyle = finishFill(c, this.colorIdx, this.finish, this.rh);
    c.fillRect(0, 0, this.rw, this.rh);
    c.restore();
    this.grid.fill(1);
    this.covered = this.total;
  }
  spec(): string {
    return `${this.colorIdx}:${this.finish}`;
  }
  encode(): string {
    let s = '';
    for (let r = 0; r < this.rows; r++) {
      let row = '';
      for (let k = 0; k < this.cols; k += 4) {
        let n = 0;
        for (let b = 0; b < 4; b++) if (this.grid[r * this.cols + k + b]) n |= 1 << b;
        row += n.toString(16);
      }
      s += row;
    }
    return s;
  }
  /** restaura "cor:acab;hex" */
  decode(strokes: string | undefined): void {
    this.clear();
    if (!strokes) return;
    const [spec, hex] = strokes.split(';');
    const p = parseSpec(spec);
    if (!p || !hex) return;
    [this.colorIdx, this.finish] = p;
    const per = Math.ceil(this.cols / 4);
    const c = this.x;
    c.fillStyle = finishFill(c, this.colorIdx, this.finish, this.rh);
    for (let r = 0; r < this.rows; r++)
      for (let k = 0; k < per; k++) {
        const n = parseInt(hex[r * per + k] || '0', 16);
        for (let b = 0; b < 4; b++)
          if (n & (1 << b)) {
            const cx = k * 4 + b;
            if (cx >= this.cols) continue;
            this.grid[r * this.cols + cx] = 1;
            this.covered++;
            c.beginPath();
            c.roundRect(cx * this.cell - 3, r * this.cell - 3, this.cell + 6, this.cell + 6, 5);
            c.fill();
          }
      }
  }
  strokes(): string {
    return `${this.spec()};${this.encode()}`;
  }
}
export const PAINT_COLORS = PALETTE.length;
