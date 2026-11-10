/* ============================================================
 *  BLOOP CINEMA — cenários 2D desenhados por código (originais).
 *  Coordenadas do palco: 16 × 9, chão em y = 7.3. Desenha também
 *  uma margem (-2..18, -1..10) para a câmera poder passear/zoom.
 *  Camada estática vai para um bitmap em cache; a animada (nuvens,
 *  ondas, estrelas, holofotes...) é desenhada a cada quadro.
 * ============================================================ */
import { FLOOR_Y } from './format';

type X = CanvasRenderingContext2D;
const INK = '#2a0b5c';
export const BG_X0 = -2;
export const BG_Y0 = -1;
export const BG_W = 20;
export const BG_H = 11;
const F = FLOOR_Y;

/* ---------------------------- helpers ---------------------------- */
function lg(x: X, y0: number, y1: number, ...c: string[]): CanvasGradient {
  const g = x.createLinearGradient(0, y0, 0, y1);
  c.forEach((s, i) => g.addColorStop(i / (c.length - 1), s));
  return g;
}
function box(x: X, px: number, py: number, w: number, h: number, fill: string | CanvasGradient, r = 0.12, lw = 0.07): void {
  x.beginPath();
  x.roundRect(px, py, w, h, r);
  x.fillStyle = fill;
  x.fill();
  if (lw) {
    x.lineWidth = lw;
    x.strokeStyle = INK;
    x.stroke();
  }
}
function circle(x: X, cx: number, cy: number, r: number, fill: string | CanvasGradient, lw = 0.07): void {
  x.beginPath();
  x.arc(cx, cy, r, 0, Math.PI * 2);
  x.fillStyle = fill;
  x.fill();
  if (lw) {
    x.lineWidth = lw;
    x.strokeStyle = INK;
    x.stroke();
  }
}
function poly(x: X, pts: number[], fill: string | CanvasGradient, lw = 0.07): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  x.fillStyle = fill;
  x.fill();
  if (lw) {
    x.lineWidth = lw;
    x.lineJoin = 'round';
    x.strokeStyle = INK;
    x.stroke();
  }
}
function sky(x: X, top: string, bot: string): void {
  x.fillStyle = lg(x, BG_Y0, F, top, bot);
  x.fillRect(BG_X0, BG_Y0, BG_W, BG_H);
}
function ground(x: X, top: string, bot: string, y = F - 0.3): void {
  x.fillStyle = lg(x, y, BG_Y0 + BG_H, top, bot);
  x.fillRect(BG_X0, y, BG_W, BG_Y0 + BG_H - y);
  x.fillStyle = INK;
  x.fillRect(BG_X0, y - 0.035, BG_W, 0.07);
}
function cloud(x: X, cx: number, cy: number, s: number, col = '#ffffff'): void {
  x.beginPath();
  x.arc(cx - s * 0.6, cy, s * 0.45, 0, Math.PI * 2);
  x.arc(cx, cy - s * 0.2, s * 0.6, 0, Math.PI * 2);
  x.arc(cx + s * 0.65, cy, s * 0.42, 0, Math.PI * 2);
  x.fillStyle = col;
  x.fill();
  x.fillRect(cx - s * 0.6, cy, s * 1.25, s * 0.45);
}
function tree(x: X, cx: number, by: number, s: number, leaf = '#3ecf6e', leaf2 = '#249a52'): void {
  box(x, cx - 0.18 * s, by - 1.6 * s, 0.36 * s, 1.6 * s, '#8a5a3c', 0.08 * s);
  circle(x, cx, by - 2.2 * s, 1.05 * s, leaf2);
  circle(x, cx - 0.55 * s, by - 1.8 * s, 0.7 * s, leaf);
  circle(x, cx + 0.5 * s, by - 2.5 * s, 0.75 * s, leaf);
  x.fillStyle = 'rgba(255,255,255,.25)';
  x.beginPath();
  x.arc(cx - 0.2 * s, by - 2.75 * s, 0.35 * s, 0, Math.PI * 2);
  x.fill();
}
function pine(x: X, cx: number, by: number, s: number, c1 = '#1f8a5a', snow = false): void {
  box(x, cx - 0.12 * s, by - 0.5 * s, 0.24 * s, 0.5 * s, '#6b4429', 0.04);
  for (let i = 0; i < 3; i++) {
    const y = by - 0.4 * s - i * 0.75 * s;
    const w = (1.1 - i * 0.25) * s;
    poly(x, [cx - w, y, cx + w, y, cx, y - 1.2 * s], c1);
    if (snow) poly(x, [cx - w * 0.35, y - 0.8 * s, cx + w * 0.35, y - 0.8 * s, cx, y - 1.2 * s], '#ffffff', 0.04);
  }
}
function windowFrame(x: X, px: number, py: number, w: number, h: number, skyTop: string, skyBot: string): void {
  box(x, px - 0.15, py - 0.15, w + 0.3, h + 0.3, '#fff3e0', 0.15);
  x.fillStyle = lg(x, py, py + h, skyTop, skyBot);
  x.fillRect(px, py, w, h);
  cloud(x, px + w * 0.35, py + h * 0.35, 0.35);
  x.lineWidth = 0.1;
  x.strokeStyle = '#fff3e0';
  x.beginPath();
  x.moveTo(px + w / 2, py);
  x.lineTo(px + w / 2, py + h);
  x.moveTo(px, py + h / 2);
  x.lineTo(px + w, py + h / 2);
  x.stroke();
  x.lineWidth = 0.06;
  x.strokeStyle = INK;
  x.strokeRect(px, py, w, h);
}
function planks(x: X, y0: number, c1: string, c2: string): void {
  x.fillStyle = lg(x, y0, BG_Y0 + BG_H, c1, c2);
  x.fillRect(BG_X0, y0, BG_W, BG_Y0 + BG_H - y0);
  x.strokeStyle = 'rgba(42,11,92,.18)';
  x.lineWidth = 0.04;
  for (let y = y0 + 0.5; y < BG_Y0 + BG_H; y += 0.55) {
    x.beginPath();
    x.moveTo(BG_X0, y);
    x.lineTo(BG_X0 + BG_W, y);
    x.stroke();
    for (let i = 0; i < 8; i++) {
      const px = BG_X0 + ((i * 3.1 + y * 7.3) % BG_W);
      x.beginPath();
      x.moveTo(px, y - 0.55);
      x.lineTo(px, y);
      x.stroke();
    }
  }
  x.fillStyle = INK;
  x.fillRect(BG_X0, y0 - 0.035, BG_W, 0.07);
}
function wallStripes(x: X, base: string, stripe: string, y1: number, w = 0.5): void {
  x.fillStyle = base;
  x.fillRect(BG_X0, BG_Y0, BG_W, y1 - BG_Y0);
  x.fillStyle = stripe;
  for (let px = BG_X0; px < BG_X0 + BG_W; px += w * 2) x.fillRect(px, BG_Y0, w, y1 - BG_Y0);
}
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/* ---------------------------- cenários ---------------------------- */
interface BgDef {
  draw(x: X): void;
  anim?(x: X, t: number): void;
  /** cor de fundo do "céu" para 3D e letterbox */
  sky: string;
  /** cor do chão para 3D */
  floor: string;
  indoor?: boolean;
}

export const BG: Record<string, BgDef> = {
  bedroom: {
    sky: '#c9b4ff',
    floor: '#d79a62',
    indoor: true,
    draw(x) {
      wallStripes(x, '#d9c8ff', '#cdb8ff', F - 0.3, 0.45);
      box(x, BG_X0, F - 1.1, BG_W, 0.25, '#fff3e0', 0, 0.05); // rodapé alto
      planks(x, F - 0.3, '#e0a46c', '#b97a45');
      windowFrame(x, 9.6, 1.4, 2.8, 2.4, '#7fd4ff', '#d6f3ff');
      // cortinas
      for (const s of [-1, 1]) {
        const cx = s < 0 ? 9.3 : 12.7;
        poly(x, [cx - 0.45, 1.0, cx + 0.45, 1.0, cx + 0.3 + s * 0.2, 4.4, cx - 0.3 + s * 0.2, 4.4], '#ff8fb8');
      }
      box(x, 9.0, 0.85, 4.0, 0.2, '#8a5a3c', 0.08);
      // cama
      box(x, 0.2, 4.9, 0.4, 2.2, '#a86a3f', 0.12);
      box(x, 0.5, 5.6, 4.6, 1.3, '#4f7dff', 0.25);
      box(x, 0.6, 5.2, 1.4, 0.6, '#ffffff', 0.25);
      box(x, 2.1, 5.45, 3.0, 0.5, '#ffd93b', 0.2);
      box(x, 0.6, 6.85, 0.25, 0.4, '#8a5a3c', 0.06);
      box(x, 4.8, 6.85, 0.25, 0.4, '#8a5a3c', 0.06);
      // quadro
      box(x, 2.0, 1.5, 2.2, 1.6, '#ffffff', 0.1);
      circle(x, 3.1, 2.3, 0.45, '#ffd93b', 0.05);
      poly(x, [2.2, 2.95, 2.9, 2.3, 3.5, 2.95], '#3ecf8e', 0.04);
      // escrivaninha + abajur
      box(x, 13.4, 5.5, 3.2, 0.25, '#c98a55', 0.06);
      box(x, 13.6, 5.75, 0.2, 1.5, '#a86a3f', 0.04);
      box(x, 16.2, 5.75, 0.2, 1.5, '#a86a3f', 0.04);
      box(x, 14.0, 5.1, 0.12, 0.45, '#5b5b6e', 0.03);
      poly(x, [13.6, 5.15, 14.5, 5.15, 14.25, 4.5, 13.85, 4.5], '#ff5c5c');
      box(x, 15.0, 4.7, 0.9, 0.8, '#3fc8ff', 0.1); // computador
      // tapete
      x.fillStyle = '#ff8fb8';
      x.beginPath();
      x.ellipse(8, 8.4, 3.2, 0.55, 0, 0, Math.PI * 2);
      x.fill();
      x.lineWidth = 0.06;
      x.strokeStyle = INK;
      x.stroke();
    },
  },
  classroom: {
    sky: '#ffe9a8',
    floor: '#c98a55',
    indoor: true,
    draw(x) {
      x.fillStyle = '#ffe9a8';
      x.fillRect(BG_X0, BG_Y0, BG_W, F);
      x.fillStyle = '#ffd77a';
      x.fillRect(BG_X0, 4.6, BG_W, F - 4.6);
      planks(x, F - 0.3, '#d49a62', '#a8703f');
      box(x, 3.2, 1.0, 9.6, 3.4, '#2f7a55', 0.15, 0.1);
      box(x, 3.0, 4.3, 10, 0.18, '#a86a3f', 0.05);
      x.strokeStyle = 'rgba(255,255,255,.85)';
      x.lineWidth = 0.06;
      x.lineCap = 'round';
      x.beginPath();
      // contas e rabiscos no quadro
      x.font = '700 0.6px Fredoka, system-ui, sans-serif';
      x.fillStyle = 'rgba(255,255,255,.9)';
      x.fillText('2 + 2 = 4', 4.0, 2.0);
      x.fillText('A B C', 4.0, 3.1);
      x.moveTo(9, 1.8);
      x.arc(9.6, 2.5, 0.6, 0, Math.PI * 2);
      x.moveTo(11, 3.6);
      x.lineTo(11.6, 1.8);
      x.lineTo(12.2, 3.6);
      x.stroke();
      // relógio
      circle(x, 14.6, 1.6, 0.55, '#ffffff');
      x.beginPath();
      x.moveTo(14.6, 1.6);
      x.lineTo(14.6, 1.2);
      x.moveTo(14.6, 1.6);
      x.lineTo(14.9, 1.75);
      x.strokeStyle = INK;
      x.stroke();
      windowFrame(x, 0, 1.2, 2.2, 2.6, '#7fd4ff', '#d6f3ff');
      // carteiras
      for (const dx of [1.0, 12.2]) {
        box(x, dx, 5.5, 2.8, 0.22, '#ffb35c', 0.06);
        box(x, dx + 0.2, 5.72, 0.16, 1.4, '#5b5b6e', 0.03);
        box(x, dx + 2.4, 5.72, 0.16, 1.4, '#5b5b6e', 0.03);
      }
      box(x, 6.4, 5.2, 3.2, 0.22, '#c98a55', 0.06); // mesa do professor
      box(x, 6.6, 5.42, 2.8, 1.7, '#b97a45', 0.08);
      circle(x, 8.9, 4.95, 0.25, '#ff5c5c', 0.05); // maçã
    },
  },
  park: {
    sky: '#8fdcff',
    floor: '#7dd36a',
    draw(x) {
      sky(x, '#62c4ff', '#d6f3ff');
      x.fillStyle = '#9be15d';
      x.beginPath();
      x.ellipse(3, F - 0.2, 7, 2.2, 0, Math.PI, 0);
      x.ellipse(14, F - 0.2, 8, 2.8, 0, Math.PI, 0);
      x.fill();
      ground(x, '#7dd36a', '#4fa84a');
      tree(x, 1.4, F - 0.25, 1.1);
      tree(x, 14.8, F - 0.25, 1.25, '#5ad66e');
      // caminho
      x.fillStyle = '#f0d9a8';
      x.beginPath();
      x.moveTo(5, BG_Y0 + BG_H);
      x.quadraticCurveTo(8, F + 0.4, 9, F - 0.25);
      x.lineTo(10.5, F - 0.25);
      x.quadraticCurveTo(10, F + 0.6, 12.5, BG_Y0 + BG_H);
      x.fill();
      // banco
      box(x, 10.8, 5.6, 2.8, 0.25, '#c98a55', 0.06);
      box(x, 10.8, 5.0, 2.8, 0.25, '#c98a55', 0.06);
      box(x, 11.0, 5.85, 0.16, 1.2, '#5b5b6e', 0.03);
      box(x, 13.3, 5.85, 0.16, 1.2, '#5b5b6e', 0.03);
      const r = rng(7);
      for (let i = 0; i < 26; i++) {
        const fx = BG_X0 + r() * BG_W;
        const fy = F + 0.2 + r() * 2.2;
        circle(x, fx, fy, 0.09, ['#ff8fb8', '#ffd93b', '#ffffff', '#d77bff'][i % 4], 0.025);
      }
    },
    anim(x, t) {
      for (let i = 0; i < 3; i++) cloud(x, ((i * 7 + t * 0.25) % 24) - 4, 1 + i * 0.7, 0.8 + i * 0.15);
    },
  },
  beach: {
    sky: '#7fd4ff',
    floor: '#ffe0a3',
    draw(x) {
      sky(x, '#5ec8ff', '#ffe9c4');
      circle(x, 13.5, 1.6, 0.9, '#ffe14f', 0.06);
      x.fillStyle = '#2aa8e0';
      x.fillRect(BG_X0, 4.6, BG_W, 3);
      ground(x, '#ffe0a3', '#f5c06e', F - 0.6);
      // guarda-sol
      box(x, 3.0, 3.9, 0.12, 3.2, '#ffffff', 0.04);
      poly(x, [1.4, 4.2, 3.06, 3.2, 4.7, 4.2], '#ff5c5c');
      poly(x, [2.5, 4.2, 3.06, 3.2, 3.6, 4.2], '#ffffff', 0.04);
      // coqueiro
      x.strokeStyle = '#a86a3f';
      x.lineWidth = 0.35;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(15.2, F - 0.4);
      x.quadraticCurveTo(15.6, 4, 14.6, 2.3);
      x.stroke();
      for (let i = 0; i < 5; i++) {
        const a = -2.6 + i * 0.55;
        poly(x, [14.6, 2.3, 14.6 + Math.cos(a) * 1.8, 2.3 + Math.sin(a) * 1.0 + 0.5, 14.6 + Math.cos(a + 0.25) * 1.2, 2.3 + Math.sin(a + 0.25) * 0.7], '#3ecf6e', 0.05);
      }
      // castelinho de areia
      box(x, 6.0, 7.6, 1.3, 0.7, '#f5c06e', 0.05, 0.05);
      box(x, 6.3, 7.1, 0.7, 0.55, '#f5c06e', 0.05, 0.05);
      // estrela do mar
      x.fillStyle = '#ff8f3b';
      x.font = '0.6px system-ui';
      x.fillText('⭐', 10.4, 8.6);
    },
    anim(x, t) {
      x.strokeStyle = 'rgba(255,255,255,.85)';
      x.lineWidth = 0.08;
      for (let row = 0; row < 3; row++) {
        x.beginPath();
        const y = 4.9 + row * 0.75;
        for (let px = BG_X0; px <= BG_X0 + BG_W; px += 0.25) x.lineTo(px, y + Math.sin(px * 2 + t * 2 + row) * 0.06);
        x.stroke();
      }
      x.fillStyle = 'rgba(255,255,255,.7)';
      const k = (Math.sin(t * 1.2) + 1) / 2;
      x.fillRect(BG_X0, F - 0.65 - k * 0.15, BG_W, 0.12);
    },
  },
  kitchen: {
    sky: '#bff0e0',
    floor: '#f5f0ff',
    indoor: true,
    draw(x) {
      x.fillStyle = '#c9f5e6';
      x.fillRect(BG_X0, BG_Y0, BG_W, F);
      // azulejos
      x.strokeStyle = 'rgba(42,11,92,.12)';
      x.lineWidth = 0.04;
      for (let py = 3; py < F - 0.3; py += 0.6) {
        x.beginPath();
        x.moveTo(BG_X0, py);
        x.lineTo(BG_X0 + BG_W, py);
        x.stroke();
      }
      for (let px = BG_X0; px < BG_X0 + BG_W; px += 0.6) {
        x.beginPath();
        x.moveTo(px, 3);
        x.lineTo(px, F - 0.3);
        x.stroke();
      }
      // chão xadrez
      for (let py = F - 0.3, j = 0; py < BG_Y0 + BG_H; py += 0.7, j++)
        for (let px = BG_X0, i = 0; px < BG_X0 + BG_W; px += 0.7, i++) {
          x.fillStyle = (i + j) % 2 ? '#ffffff' : '#ffb3d1';
          x.fillRect(px, py, 0.7, 0.7);
        }
      x.fillStyle = INK;
      x.fillRect(BG_X0, F - 0.335, BG_W, 0.07);
      // armários de cima
      for (let i = 0; i < 4; i++) box(x, 0.3 + i * 1.6, 0.6, 1.5, 1.8, '#ffaa3b', 0.12);
      // balcão + fogão
      box(x, 0, 4.8, 8.5, 0.3, '#ffffff', 0.06);
      box(x, 0.1, 5.1, 8.3, 2.0, '#ff8f3b', 0.1);
      box(x, 3.0, 4.55, 2.3, 0.28, '#5b5b6e', 0.05);
      box(x, 3.2, 5.4, 1.9, 1.3, '#2b2440', 0.1);
      // panela
      box(x, 3.5, 3.85, 1.3, 0.75, '#b8c4d6', 0.12);
      // geladeira
      box(x, 13.2, 1.8, 2.6, 5.4, '#ffffff', 0.25);
      x.beginPath();
      x.moveTo(13.2, 3.6);
      x.lineTo(15.8, 3.6);
      x.lineWidth = 0.06;
      x.strokeStyle = INK;
      x.stroke();
      box(x, 13.45, 2.4, 0.14, 0.8, '#5b5b6e', 0.05, 0.03);
      box(x, 13.45, 4.0, 0.14, 1.2, '#5b5b6e', 0.05, 0.03);
      // bolo na mesa
      box(x, 9.8, 5.3, 2.6, 0.22, '#c98a55', 0.06);
      box(x, 10.0, 5.52, 0.16, 1.6, '#a86a3f', 0.03);
      box(x, 12.05, 5.52, 0.16, 1.6, '#a86a3f', 0.03);
      windowFrame(x, 9.6, 1.0, 2.4, 2.0, '#7fd4ff', '#d6f3ff');
    },
  },
  space: {
    sky: '#120a3a',
    floor: '#9a92b8',
    draw(x) {
      sky(x, '#07041c', '#2a1670');
      const r = rng(3);
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 120; i++) {
        x.globalAlpha = 0.3 + r() * 0.7;
        x.fillRect(BG_X0 + r() * BG_W, BG_Y0 + r() * 8, 0.04 + r() * 0.04, 0.04 + r() * 0.04);
      }
      x.globalAlpha = 1;
      // planeta com anel
      circle(x, 3.2, 2.2, 1.2, lg(x, 1, 3.4, '#ffaa3b', '#ff5c8a'));
      x.strokeStyle = '#ffe14f';
      x.lineWidth = 0.14;
      x.beginPath();
      x.ellipse(3.2, 2.3, 2.1, 0.42, -0.3, 0, Math.PI * 2);
      x.stroke();
      circle(x, 13.6, 1.4, 0.55, lg(x, 0.9, 2, '#3fc8ff', '#3ecf8e'));
      // chão lunar
      x.fillStyle = lg(x, F - 0.4, BG_Y0 + BG_H, '#b8b0d6', '#6d6590');
      x.beginPath();
      x.moveTo(BG_X0, F - 0.2);
      for (let px = BG_X0; px <= BG_X0 + BG_W; px += 1) x.lineTo(px, F - 0.3 + Math.sin(px * 1.3) * 0.15);
      x.lineTo(BG_X0 + BG_W, BG_Y0 + BG_H);
      x.lineTo(BG_X0, BG_Y0 + BG_H);
      x.fill();
      x.lineWidth = 0.07;
      x.strokeStyle = INK;
      x.stroke();
      for (const [cx, cy, rr] of [[2, 8.3, 0.5], [7.5, 9.2, 0.7], [13, 8.1, 0.45], [16.5, 9, 0.6]] as const) {
        x.fillStyle = '#8a82ad';
        x.beginPath();
        x.ellipse(cx, cy, rr, rr * 0.3, 0, 0, Math.PI * 2);
        x.fill();
      }
      // foguete
      box(x, 15.4, 3.6, 0.9, 2.8, '#ffffff', 0.4);
      poly(x, [15.4, 3.9, 16.3, 3.9, 15.85, 2.9], '#ff5c5c');
      circle(x, 15.85, 4.6, 0.25, '#3fc8ff', 0.05);
      poly(x, [15.4, 5.8, 15.0, 6.6, 15.4, 6.4], '#ff5c5c', 0.05);
      poly(x, [16.3, 5.8, 16.7, 6.6, 16.3, 6.4], '#ff5c5c', 0.05);
    },
    anim(x, t) {
      const r = rng(11);
      for (let i = 0; i < 14; i++) {
        const sx = BG_X0 + r() * BG_W;
        const sy = r() * 6;
        const k = (Math.sin(t * (1 + r() * 2) + i) + 1) / 2;
        x.fillStyle = `rgba(255,255,255,${k})`;
        x.beginPath();
        x.arc(sx, sy, 0.05 + k * 0.05, 0, Math.PI * 2);
        x.fill();
      }
    },
  },
  castle: {
    sky: '#8a7fb0',
    floor: '#a9a1c4',
    indoor: true,
    draw(x) {
      x.fillStyle = '#9d94bd';
      x.fillRect(BG_X0, BG_Y0, BG_W, F);
      x.strokeStyle = 'rgba(42,11,92,.25)';
      x.lineWidth = 0.05;
      for (let py = BG_Y0, j = 0; py < F; py += 0.6, j++)
        for (let px = BG_X0 + (j % 2) * 0.6; px < BG_X0 + BG_W; px += 1.2) x.strokeRect(px, py, 1.2, 0.6);
      ground(x, '#c4bce0', '#8f86b5');
      // tapete vermelho
      poly(x, [6.2, F - 0.3, 9.8, F - 0.3, 11.5, BG_Y0 + BG_H, 4.5, BG_Y0 + BG_H], '#d42a4a', 0.06);
      // janelas em arco
      for (const wx of [1.5, 12.5]) {
        x.beginPath();
        x.moveTo(wx, 4.2);
        x.lineTo(wx, 2.0);
        x.arc(wx + 0.9, 2.0, 0.9, Math.PI, 0);
        x.lineTo(wx + 1.8, 4.2);
        x.closePath();
        x.fillStyle = lg(x, 1, 4.2, '#2a1670', '#7b5cff');
        x.fill();
        x.lineWidth = 0.12;
        x.strokeStyle = INK;
        x.stroke();
      }
      // estandartes
      for (const bx of [4.4, 10.6]) {
        poly(x, [bx, 0.6, bx + 1.1, 0.6, bx + 1.1, 3.6, bx + 0.55, 3.1, bx, 3.6], '#ffd93b');
        x.fillStyle = '#d42a4a';
        x.font = '0.7px system-ui';
        x.fillText('♛', bx + 0.18, 2.1);
      }
      // trono
      box(x, 7.1, 2.6, 1.8, 3.2, '#d42a4a', 0.5);
      box(x, 6.8, 4.8, 2.4, 1.0, '#ffd93b', 0.15);
      box(x, 6.9, 5.8, 0.25, 1.3, '#ffd93b', 0.05);
      box(x, 8.85, 5.8, 0.25, 1.3, '#ffd93b', 0.05);
    },
    anim(x, t) {
      for (const tx of [3.6, 12.2]) {
        box(x, tx - 0.08, 4.2, 0.16, 0.8, '#6b4429', 0.03, 0.04);
        const k = Math.sin(t * 12 + tx) * 0.05;
        poly(x, [tx - 0.18, 4.25, tx + 0.18, 4.25, tx + k, 3.65 + k], '#ffaa3b', 0.03);
      }
    },
  },
  street: {
    sky: '#9ad9ff',
    floor: '#5b5b6e',
    draw(x) {
      sky(x, '#6fcaff', '#e2f6ff');
      const cols = ['#ff8fb8', '#ffd93b', '#9b6bff', '#3fc8ff', '#ffaa3b', '#3ecf8e'];
      let px = BG_X0;
      let i = 0;
      while (px < BG_X0 + BG_W) {
        const w = 2.2 + (i % 3) * 0.6;
        const h = 3.5 + ((i * 7) % 4) * 0.8;
        box(x, px, F - 0.9 - h, w, h + 0.5, cols[i % cols.length], 0.1);
        for (let wy = F - 0.6 - h; wy < F - 1.5; wy += 0.9)
          for (let wx = px + 0.35; wx < px + w - 0.5; wx += 0.75) box(x, wx, wy, 0.42, 0.5, '#e8f8ff', 0.06, 0.04);
        px += w + 0.05;
        i++;
      }
      // calçada + rua
      box(x, BG_X0, F - 0.9, BG_W, 0.7, '#d6cfe6', 0, 0.06);
      x.fillStyle = '#4a4a5c';
      x.fillRect(BG_X0, F - 0.2, BG_W, 4);
      x.fillStyle = '#ffffff';
      for (let lx = BG_X0; lx < BG_X0 + BG_W; lx += 1.6) x.fillRect(lx, F + 1.1, 0.8, 0.12);
      // poste
      box(x, 12.4, 2.2, 0.16, 4.5, '#2b2440', 0.06, 0.04);
      circle(x, 12.48, 2.1, 0.32, '#ffe14f');
      // toldo
      for (let k = 0; k < 6; k++) poly(x, [3 + k * 0.5, 3.6, 3.5 + k * 0.5, 3.6, 3.5 + k * 0.5, 4.2, 3 + k * 0.5, 4.2], k % 2 ? '#ffffff' : '#ff5c5c', 0.03);
    },
  },
  stage: {
    sky: '#2a0b5c',
    floor: '#a86a3f',
    indoor: true,
    draw(x) {
      x.fillStyle = lg(x, BG_Y0, F, '#1c0640', '#4a1a8a');
      x.fillRect(BG_X0, BG_Y0, BG_W, F);
      // fundo com estrelas
      x.fillStyle = 'rgba(255,225,79,.8)';
      x.font = '0.5px system-ui';
      for (let i = 0; i < 9; i++) x.fillText('★', 2 + i * 1.5, 2 + (i % 3) * 0.9);
      // cortinas
      for (const s of [-1, 1]) {
        const ex = s < 0 ? BG_X0 : BG_X0 + BG_W;
        x.fillStyle = lg(x, 0, 8, '#e0263f', '#8a0f22');
        x.beginPath();
        x.moveTo(ex, BG_Y0);
        x.lineTo(8 + s * 5.2, BG_Y0);
        x.quadraticCurveTo(8 + s * 4.6, 4, 8 + s * 6.3, F - 0.3);
        x.lineTo(ex, F - 0.3);
        x.fill();
        x.strokeStyle = 'rgba(0,0,0,.25)';
        x.lineWidth = 0.08;
        for (let k = 1; k < 5; k++) {
          x.beginPath();
          x.moveTo(8 + s * (5.2 + k * 0.6), BG_Y0);
          x.quadraticCurveTo(8 + s * (4.8 + k * 0.6), 4, 8 + s * (6.3 + k * 0.5), F - 0.3);
          x.stroke();
        }
      }
      // sanefa
      x.fillStyle = '#c41d36';
      x.beginPath();
      x.moveTo(BG_X0, BG_Y0);
      x.lineTo(BG_X0 + BG_W, BG_Y0);
      x.lineTo(BG_X0 + BG_W, 0.6);
      for (let px = BG_X0 + BG_W; px >= BG_X0; px -= 1) x.quadraticCurveTo(px - 0.5, 1.2, px - 1, 0.6);
      x.fill();
      x.fillStyle = '#ffd93b';
      x.fillRect(BG_X0, 0.45, BG_W, 0.1);
      planks(x, F - 0.3, '#c98a55', '#7a4a28');
      box(x, BG_X0, F + 1.2, BG_W, 0.25, '#2b2440', 0, 0.05);
      // microfone
      box(x, 8.9, 4.9, 0.08, 2.3, '#5b5b6e', 0.03, 0.03);
      circle(x, 8.94, 4.8, 0.2, '#2b2440');
    },
    anim(x, t) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (const [sx, ph] of [[2, 0], [14, 1.7]] as const) {
        const tx = 8 + Math.sin(t * 0.7 + ph) * 3;
        const g = x.createLinearGradient(sx, BG_Y0, tx, F);
        g.addColorStop(0, 'rgba(255,240,180,.35)');
        g.addColorStop(1, 'rgba(255,240,180,.03)');
        x.fillStyle = g;
        x.beginPath();
        x.moveTo(sx - 0.2, BG_Y0);
        x.lineTo(sx + 0.2, BG_Y0);
        x.lineTo(tx + 1.4, F);
        x.lineTo(tx - 1.4, F);
        x.fill();
      }
      x.restore();
    },
  },
  forest: {
    sky: '#a8e6c9',
    floor: '#4fa84a',
    draw(x) {
      sky(x, '#7fd4b5', '#e0ffe9');
      for (let i = 0; i < 10; i++) pine(x, BG_X0 + i * 2.2 + 0.5, F - 1.1, 1.3, '#5bb98a');
      ground(x, '#5fbf55', '#2f7a3a');
      for (let i = 0; i < 6; i++) tree(x, BG_X0 + 1 + i * 3.7, F - 0.2, 1.15 + (i % 2) * 0.2, '#2fae5a', '#1f8045');
      // cogumelos
      for (const [mx, s] of [[4.6, 0.5], [11.4, 0.4], [12.0, 0.3]] as const) {
        box(x, mx - 0.1 * s * 2, F + 0.3 - 0.6 * s, 0.4 * s, 0.6 * s, '#fff3e0', 0.05, 0.04);
        x.beginPath();
        x.arc(mx, F + 0.3 - 0.6 * s, 0.55 * s, Math.PI, 0);
        x.closePath();
        x.fillStyle = '#ff5c5c';
        x.fill();
        x.lineWidth = 0.05;
        x.strokeStyle = INK;
        x.stroke();
      }
    },
    anim(x, t) {
      const r = rng(5);
      for (let i = 0; i < 12; i++) {
        const fx = BG_X0 + r() * BG_W + Math.sin(t * 0.8 + i) * 0.4;
        const fy = 2 + r() * 5 + Math.cos(t * 0.6 + i * 2) * 0.3;
        const k = (Math.sin(t * 3 + i) + 1) / 2;
        x.fillStyle = `rgba(255,250,150,${0.3 + k * 0.6})`;
        x.beginPath();
        x.arc(fx, fy, 0.06 + k * 0.04, 0, Math.PI * 2);
        x.fill();
      }
    },
  },
  underwater: {
    sky: '#1d6fb8',
    floor: '#f5d79a',
    draw(x) {
      sky(x, '#0d4a8a', '#3fb2e8');
      ground(x, '#f5d79a', '#c99a5a', F - 0.2);
      const r = rng(9);
      for (let i = 0; i < 7; i++) circle(x, BG_X0 + r() * BG_W, F + 0.3 + r() * 2, 0.2 + r() * 0.3, '#ff8fb8', 0.04);
      // baú
      box(x, 12.6, 5.9, 1.8, 1.3, '#a86a3f', 0.15);
      box(x, 12.6, 5.5, 1.8, 0.5, '#c98a55', 0.25);
      circle(x, 13.5, 6.2, 0.15, '#ffd93b', 0.04);
    },
    anim(x, t) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const bx = 2 + i * 4 + Math.sin(t * 0.4 + i) * 0.6;
        x.fillStyle = 'rgba(200,240,255,.08)';
        x.beginPath();
        x.moveTo(bx, BG_Y0);
        x.lineTo(bx + 0.8, BG_Y0);
        x.lineTo(bx + 2.4, F);
        x.lineTo(bx + 0.8, F);
        x.fill();
      }
      x.restore();
      for (let i = 0; i < 6; i++) {
        const sx = 0.5 + i * 3;
        x.strokeStyle = '#2fae5a';
        x.lineWidth = 0.22;
        x.lineCap = 'round';
        x.beginPath();
        x.moveTo(sx, F + 0.2);
        for (let k = 1; k <= 6; k++) x.lineTo(sx + Math.sin(t * 1.5 + k * 0.7 + i) * 0.15 * k * 0.4, F + 0.2 - k * 0.45);
        x.stroke();
      }
      for (let i = 0; i < 10; i++) {
        const k = ((t * 0.3 + i * 0.13) % 1);
        x.strokeStyle = 'rgba(255,255,255,.7)';
        x.lineWidth = 0.04;
        x.beginPath();
        x.arc(1 + i * 1.6 + Math.sin(t + i) * 0.2, F - k * 8, 0.08 + (i % 3) * 0.04, 0, Math.PI * 2);
        x.stroke();
      }
    },
  },
  snow: {
    sky: '#cfe8ff',
    floor: '#ffffff',
    draw(x) {
      sky(x, '#8ec9ff', '#eef7ff');
      poly(x, [-2, F - 0.5, 3, 1.5, 8, F - 0.5], '#b8c9e6');
      poly(x, [1.4, 3.0, 3, 1.5, 4.6, 3.0, 3.6, 3.4, 3, 2.9, 2.4, 3.4], '#ffffff', 0.04);
      poly(x, [6, F - 0.5, 12, 0.9, 19, F - 0.5], '#a5b8dc');
      poly(x, [10.2, 2.6, 12, 0.9, 13.8, 2.6, 12.6, 3.0, 12, 2.5, 11.3, 3.0], '#ffffff', 0.04);
      ground(x, '#ffffff', '#d6e6ff');
      pine(x, 0.8, F - 0.2, 1.1, '#1f8a5a', true);
      pine(x, 15.4, F - 0.2, 1.3, '#1f8a5a', true);
      // boneco de neve
      circle(x, 12.8, 6.6, 0.65, '#ffffff');
      circle(x, 12.8, 5.6, 0.45, '#ffffff');
      poly(x, [12.8, 5.6, 13.4, 5.7, 12.8, 5.75], '#ff8f3b', 0.03);
      box(x, 12.45, 4.85, 0.7, 0.35, '#2b2440', 0.05, 0.04);
    },
    anim(x, t) {
      x.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 40; i++) {
        const sx = (BG_X0 + ((i * 2.37 + Math.sin(t + i) * 0.4) % BG_W) + BG_W) % BG_W + BG_X0;
        const sy = ((i * 1.13 + t * 0.6) % BG_H) + BG_Y0;
        x.beginPath();
        x.arc(sx, sy, 0.05 + (i % 3) * 0.02, 0, Math.PI * 2);
        x.fill();
      }
    },
  },
  desert: {
    sky: '#ffd9a0',
    floor: '#f2c27a',
    draw(x) {
      sky(x, '#ffb36b', '#fff0c9');
      circle(x, 12.5, 2.0, 1.1, '#fff3b0', 0.06);
      x.fillStyle = '#f5cf8f';
      x.beginPath();
      x.ellipse(4, F, 8, 2, 0, Math.PI, 0);
      x.ellipse(15, F + 0.2, 6, 1.6, 0, Math.PI, 0);
      x.fill();
      ground(x, '#f2c27a', '#d99a4a');
      for (const [cx, s] of [[2.2, 1], [14.6, 1.3]] as const) {
        box(x, cx - 0.3 * s, F - 2.6 * s, 0.6 * s, 2.6 * s, '#3ecf6e', 0.3 * s);
        box(x, cx - 1.0 * s, F - 1.9 * s, 0.4 * s, 1.0 * s, '#3ecf6e', 0.2 * s);
        box(x, cx + 0.6 * s, F - 2.2 * s, 0.4 * s, 0.9 * s, '#3ecf6e', 0.2 * s);
      }
      circle(x, 9.8, F + 0.2, 0.5, '#b8a08a');
    },
  },
  candy: {
    sky: '#ffc7ee',
    floor: '#8a5a3c',
    draw(x) {
      sky(x, '#ff9fe0', '#fff0fb');
      cloud(x, 3, 1.5, 0.9, '#ffe0f4');
      cloud(x, 12, 1.0, 1.1, '#ffe0f4');
      // chão de chocolate
      x.fillStyle = lg(x, F - 0.3, BG_Y0 + BG_H, '#a8703f', '#6b4429');
      x.beginPath();
      x.moveTo(BG_X0, F - 0.3);
      for (let px = BG_X0; px <= BG_X0 + BG_W; px += 0.5) x.quadraticCurveTo(px + 0.25, F - 0.05, px + 0.5, F - 0.3);
      x.lineTo(BG_X0 + BG_W, BG_Y0 + BG_H);
      x.lineTo(BG_X0, BG_Y0 + BG_H);
      x.fill();
      // pirulitos
      for (const [lx, c] of [[1.6, '#ff5c8a'], [14.4, '#3fc8ff'], [11.3, '#9be15d']] as const) {
        box(x, lx - 0.08, 3.4, 0.16, F - 3.6, '#ffffff', 0.05, 0.04);
        circle(x, lx, 3.0, 0.9, c);
        x.strokeStyle = 'rgba(255,255,255,.7)';
        x.lineWidth = 0.12;
        x.beginPath();
        for (let a = 0; a < 12; a += 0.2) x.lineTo(lx + Math.cos(a) * a * 0.07, 3.0 + Math.sin(a) * a * 0.07);
        x.stroke();
      }
      // bengalinha
      x.lineCap = 'round';
      x.lineWidth = 0.28;
      x.strokeStyle = INK;
      x.beginPath();
      x.moveTo(5.0, F - 0.3);
      x.lineTo(5.0, 4.4);
      x.arc(5.5, 4.4, 0.5, Math.PI, 0);
      x.stroke();
      x.lineWidth = 0.18;
      x.strokeStyle = '#ffffff';
      x.stroke();
      x.setLineDash([0.18, 0.18]);
      x.strokeStyle = '#ff2e63';
      x.stroke();
      x.setLineDash([]);
    },
  },
  haunted: {
    sky: '#2a1a4a',
    floor: '#3a2f5c',
    draw(x) {
      sky(x, '#0f0626', '#4a2a7a');
      circle(x, 13.6, 1.8, 1.0, '#fff6c9', 0.05);
      // casa torta
      poly(x, [2.0, F - 0.3, 2.2, 2.8, 6.6, 2.6, 6.9, F - 0.3], '#2b2440');
      poly(x, [1.6, 2.9, 4.4, 0.6, 7.2, 2.7], '#1a1430');
      for (const [wx, wy] of [[2.8, 3.6], [5.0, 3.5], [3.9, 5.2]] as const) box(x, wx, wy, 0.8, 0.9, '#ffe14f', 0.06, 0.05);
      ground(x, '#4a3a6e', '#1a1430');
      // árvore seca
      x.strokeStyle = '#1a1430';
      x.lineCap = 'round';
      x.lineWidth = 0.35;
      x.beginPath();
      x.moveTo(11, F - 0.2);
      x.lineTo(11.2, 4);
      x.lineTo(10.4, 2.8);
      x.moveTo(11.2, 4);
      x.lineTo(12.2, 3.0);
      x.lineTo(12.8, 3.2);
      x.stroke();
      // lápides
      for (const gx of [8.4, 14.6]) {
        x.beginPath();
        x.moveTo(gx, F);
        x.lineTo(gx, F - 0.9);
        x.arc(gx + 0.45, F - 0.9, 0.45, Math.PI, 0);
        x.lineTo(gx + 0.9, F);
        x.closePath();
        x.fillStyle = '#8a82ad';
        x.fill();
        x.lineWidth = 0.06;
        x.strokeStyle = INK;
        x.stroke();
      }
    },
    anim(x, t) {
      x.fillStyle = '#0a0418';
      for (let i = 0; i < 3; i++) {
        const bx = ((t * 1.3 + i * 6) % 22) - 3;
        const by = 1.5 + i * 0.6 + Math.sin(t * 3 + i) * 0.3;
        const w = Math.sin(t * 14 + i) * 0.25;
        x.beginPath();
        x.moveTo(bx - 0.5, by - w);
        x.quadraticCurveTo(bx - 0.2, by, bx, by + 0.1);
        x.quadraticCurveTo(bx + 0.2, by, bx + 0.5, by - w);
        x.quadraticCurveTo(bx, by + 0.25, bx - 0.5, by - w);
        x.fill();
      }
    },
  },
  rooftop: {
    sky: '#1a1450',
    floor: '#6d6590',
    draw(x) {
      sky(x, '#0c0a2e', '#5a3a9a');
      const r = rng(21);
      let px = BG_X0;
      while (px < BG_X0 + BG_W) {
        const w = 1 + r() * 1.6;
        const h = 2 + r() * 4;
        x.fillStyle = '#231a4f';
        x.fillRect(px, F - 1 - h, w, h + 1);
        for (let wy = F - 0.8 - h; wy < F - 1.2; wy += 0.45)
          for (let wx = px + 0.18; wx < px + w - 0.25; wx += 0.4) if (r() > 0.45) {
            x.fillStyle = r() > 0.5 ? '#ffe14f' : '#ffaa3b';
            x.fillRect(wx, wy, 0.18, 0.22);
          }
        px += w + 0.08;
      }
      box(x, BG_X0, F - 0.3, BG_W, 0.35, '#8a82ad', 0, 0.06);
      x.fillStyle = lg(x, F, BG_Y0 + BG_H, '#6d6590', '#3a2f5c');
      x.fillRect(BG_X0, F + 0.05, BG_W, 4);
      // caixa d'água + antena
      box(x, 13.0, 3.8, 2.0, 2.0, '#a86a3f', 0.3);
      box(x, 13.2, 5.8, 0.15, 1.2, '#2b2440', 0.03, 0.03);
      box(x, 14.65, 5.8, 0.15, 1.2, '#2b2440', 0.03, 0.03);
      x.strokeStyle = '#c9c2e0';
      x.lineWidth = 0.08;
      x.beginPath();
      x.moveTo(2, F - 0.3);
      x.lineTo(2, 3.6);
      x.moveTo(1.4, 4.2);
      x.lineTo(2.6, 4.2);
      x.moveTo(1.6, 3.9);
      x.lineTo(2.4, 3.9);
      x.stroke();
    },
    anim(x, t) {
      const k = (Math.sin(t * 3) + 1) / 2;
      x.fillStyle = `rgba(255,60,90,${0.3 + k * 0.7})`;
      x.beginPath();
      x.arc(2, 3.55, 0.1, 0, Math.PI * 2);
      x.fill();
    },
  },
};

export const bgDef = (id: string): BgDef => BG[id] ?? BG.bedroom;

/* ---------------------------- luz (dia/tarde/noite) ---------------------------- */
const LIGHT_TINT: Record<string, string | null> = { day: null, dusk: 'rgba(255,140,90,.35)', night: 'rgba(30,20,110,.55)' };

/* ---------------------------- cache ---------------------------- */
const cache = new Map<string, HTMLCanvasElement>();
/** Bitmap estático do cenário em `ppu` pixels por unidade. */
export function bgBitmap(id: string, light: string, ppu: number): HTMLCanvasElement {
  const q = Math.max(20, Math.round(ppu / 10) * 10);
  const key = `${id}|${light}|${q}`;
  let cv = cache.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = Math.round(BG_W * q);
  cv.height = Math.round(BG_H * q);
  const x = cv.getContext('2d')!;
  x.scale(q, q);
  x.translate(-BG_X0, -BG_Y0);
  bgDef(id).draw(x);
  const tint = LIGHT_TINT[light];
  if (tint) {
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = tint;
    x.fillRect(BG_X0, BG_Y0, BG_W, BG_H);
    x.globalCompositeOperation = 'source-over';
  }
  if (cache.size > 4) cache.delete(cache.keys().next().value!);
  cache.set(key, cv);
  return cv;
}

/** Desenha o cenário em coordenadas do palco (o contexto já está na transformação da câmera). */
export function drawBg(x: X, id: string, light: string, t: number, ppu: number): void {
  const bm = bgBitmap(id, light, ppu);
  x.drawImage(bm, BG_X0, BG_Y0, BG_W, BG_H);
  const d = bgDef(id);
  if (d.anim) {
    x.save();
    d.anim(x, t);
    x.restore();
  }
  if (light === 'night' && !d.indoor) {
    x.fillStyle = 'rgba(20,10,80,.18)';
    x.fillRect(BG_X0, BG_Y0, BG_W, BG_H);
  }
}

export function clearBgCache(): void {
  cache.clear();
}
