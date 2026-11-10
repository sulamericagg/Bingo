/* ============================================================
 *  PINTOU, GANHOU! — silhuetas procedurais
 *  Cada forma desenha numa caixa 100×100 (centro ~50,52) com:
 *    m = cor principal (a que vale ponto: sempre a maior área)
 *    s = cor secundária (detalhes pequenos; cada forma tem um padrão)
 *  Contorno escuro único + um brilho discreto. Nada de texto, marcas ou personagens.
 * ============================================================ */
import { mixHex, lightness } from './color';

type C = CanvasRenderingContext2D;
export interface K {
  c: C;
  m: string;
  s: string;
  /** m escurecida (sombras/detalhes do mesmo material) */
  d: string;
  /** m clareada */
  l: string;
}
type Draw = (k: K) => void;

const INK = '#2b2140';
const TAU = Math.PI * 2;
const cache = new Map<string, Path2D>();
const P = (d: string): Path2D => {
  let p = cache.get(d);
  if (!p) cache.set(d, (p = new Path2D(d)));
  return p;
};

/* ----------------------------- primitivas ----------------------------- */
function ink(c: C, w = 3.2): void {
  c.lineWidth = w;
  c.strokeStyle = INK;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke();
}
function fill(c: C, col: string, w = 3.2): void {
  c.fillStyle = col;
  c.fill();
  if (w > 0) ink(c, w);
}
function fp(c: C, d: string, col: string, w = 3.2): void {
  const p = P(d);
  c.fillStyle = col;
  c.fill(p);
  if (w > 0) {
    c.lineWidth = w;
    c.strokeStyle = INK;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.stroke(p);
  }
}
function sp(c: C, d: string, w = 3.2, col = INK): void {
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.stroke(P(d));
}
function el(c: C, x: number, y: number, rx: number, ry: number, rot = 0): C {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  return c;
}
function rr(c: C, x: number, y: number, w: number, h: number, r: number): C {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  return c;
}
function poly(c: C, ...pts: number[]): C {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  return c;
}
/** brilho branco suave (não altera a leitura da cor principal) */
function shine(c: C, x: number, y: number, rx: number, ry: number, rot = -0.5, a = 0.3): void {
  c.save();
  c.globalAlpha = a;
  el(c, x, y, rx, ry, rot);
  c.fillStyle = '#fff';
  c.fill();
  c.restore();
}
function dot(c: C, x: number, y: number, r: number, col: string): void {
  el(c, x, y, r, r);
  c.fillStyle = col;
  c.fill();
}
const eye = (c: C, x: number, y: number, r = 2.6) => {
  dot(c, x, y, r, INK);
  dot(c, x - r * 0.35, y - r * 0.35, r * 0.35, '#fff');
};
const leafSmall = (c: C, x: number, y: number, rot: number, col: string, sz = 1) => {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(sz, sz);
  fp(c, 'M0 0 C6 -8 18 -8 22 -2 C16 4 6 5 0 0Z', col, 2.6);
  c.restore();
};
const stem = (c: C, x: number, y: number, col = '#6b4a1e', h = 10) => {
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + 1, y - h * 0.6, x + 4, y - h);
  c.lineWidth = 5;
  c.strokeStyle = INK;
  c.lineCap = 'round';
  c.stroke();
  c.lineWidth = 2.4;
  c.strokeStyle = col;
  c.stroke();
};
const G = '#4e8a2e'; // verde-folha padrão
const BR = '#6b4a1e'; // marrom-cabo padrão

/* ----------------------------- formas ----------------------------- */
const S: Record<string, Draw> = {
  /* ---------- frutas ---------- */
  apple({ c, m, s }) {
    fp(c, 'M50 30 C38 20 16 24 16 50 C16 74 34 92 50 86 C66 92 84 74 84 50 C84 24 62 20 50 30Z', m);
    shine(c, 32, 44, 7, 11, 0.4);
    stem(c, 50, 31, BR, 14);
    leafSmall(c, 53, 24, -0.5, s || G);
  },
  orange({ c, m, s }) {
    el(c, 50, 54, 34, 33);
    fill(c, m);
    shine(c, 36, 42, 8, 12, 0.5);
    dot(c, 50, 22.5, 2.5, INK);
    leafSmall(c, 51, 22, -0.4, s || G, 0.9);
  },
  lemon({ c, m, s }) {
    fp(c, 'M14 54 C14 48 18 46 20 44 C28 26 72 26 80 44 C82 46 86 48 86 54 C86 60 82 62 80 64 C72 82 28 82 20 64 C18 62 14 60 14 54Z', m);
    shine(c, 36, 44, 12, 5, -0.2);
    if (s) leafSmall(c, 80, 42, -0.9, s, 0.8);
  },
  banana({ c, m, s }) {
    fp(c, 'M16 28 C14 62 40 88 82 78 C88 76 88 66 82 64 C54 66 38 52 32 26 C30 20 16 20 16 28Z', m);
    sp(c, 'M22 36 C28 58 48 72 76 71', 1.6, mixHex(m, '#000', 0.3));
    shine(c, 30, 52, 3, 10, -0.6, 0.3);
    fp(c, 'M18 30 L16 22 L24 21 L26 28Z', s || BR, 2.6);
    fp(c, 'M80 66 L88 64 L88 72 L82 73Z', s || BR, 2.6);
  },
  pear({ c, m, s }) {
    fp(c, 'M50 18 C42 18 40 30 38 40 C34 52 20 58 20 72 C20 88 36 92 50 92 C64 92 80 88 80 72 C80 58 66 52 62 40 C60 30 58 18 50 18Z', m);
    shine(c, 34, 66, 6, 10, 0.4);
    stem(c, 50, 19, BR, 10);
    if (s) leafSmall(c, 53, 14, -0.4, s, 0.8);
  },
  grapes({ c, m, s }) {
    const pts = [[38, 34], [52, 32], [66, 36], [32, 48], [46, 47], [60, 48], [72, 50], [40, 60], [54, 61], [66, 63], [46, 74], [60, 75], [53, 87]];
    for (const [x, y] of pts) {
      el(c, x, y, 9, 9);
      fill(c, m, 2.6);
      shine(c, x - 3, y - 3, 2, 3, 0.5, 0.35);
    }
    stem(c, 52, 26, BR, 10);
    leafSmall(c, 55, 20, -0.3, s || G);
  },
  berry({ c, m, s }) {
    fp(c, 'M50 90 C30 80 16 56 20 40 C24 28 40 28 50 32 C60 28 76 28 80 40 C84 56 70 80 50 90Z', m);
    for (const [x, y] of [[36, 44], [50, 46], [64, 44], [42, 58], [58, 58], [50, 72], [32, 56], [68, 56]]) dot(c, x, y, 1.6, '#f6e7a0');
    fp(c, 'M30 34 L40 22 L46 30 L50 18 L54 30 L60 22 L70 34 Q50 40 30 34Z', s || '#3e8e2a', 2.6);
  },
  cherry({ c, m, s }) {
    sp(c, 'M34 64 C38 40 50 26 62 18 M66 66 C64 44 64 30 62 18', 5);
    sp(c, 'M34 64 C38 40 50 26 62 18 M66 66 C64 44 64 30 62 18', 2.4, s || '#4e7a2a');
    el(c, 32, 70, 17, 16);
    fill(c, m);
    el(c, 66, 72, 17, 16);
    fill(c, m);
    shine(c, 26, 64, 4, 6, 0.4);
    shine(c, 60, 66, 4, 6, 0.4);
    leafSmall(c, 62, 18, 0.2, s || G);
  },
  melon({ c, m, s }) {
    // fatia (meia-lua): polpa + casca
    fp(c, 'M6 30 C8 96 92 96 94 30Z', s || '#3d8b3d');
    fp(c, 'M13 30 C16 84 84 84 87 30Z', m, 0);
    sp(c, 'M6 30 L94 30', 3.2);
    for (const [x, y] of [[32, 44], [46, 54], [60, 52], [70, 42], [40, 38], [52, 40], [56, 66], [40, 62]]) {
      el(c, x, y, 1.6, 2.6, 0.3);
      c.fillStyle = INK;
      c.fill();
    }
  },
  slice({ c, m, s }) {
    el(c, 50, 52, 36, 36);
    fill(c, s || mixHex(m, '#3a5a1e', 0.55));
    el(c, 50, 52, 30, 30);
    fill(c, m, 0);
    el(c, 50, 52, 8, 8);
    c.fillStyle = mixHex(m, '#fff', 0.45);
    c.fill();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      el(c, 50 + Math.cos(a) * 15, 52 + Math.sin(a) * 15, 1.4, 2.6, a);
      c.fillStyle = 'rgba(30,20,20,.75)';
      c.fill();
    }
  },
  egg({ c, m }) {
    fp(c, 'M50 12 C30 12 18 44 18 62 C18 80 32 90 50 90 C68 90 82 80 82 62 C82 44 70 12 50 12Z', m);
    shine(c, 36, 40, 6, 12, 0.3);
  },
  mango({ c, m, s }) {
    fp(c, 'M30 24 C50 10 84 30 84 58 C84 82 60 92 40 86 C20 80 14 56 20 40 C22 32 26 28 30 24Z', m);
    shine(c, 36, 40, 7, 11, 0.5);
    stem(c, 32, 24, BR, 6);
    if (s) leafSmall(c, 34, 18, -0.6, s, 0.8);
  },
  pineapple({ c, m, s }) {
    fp(c, 'M38 36 L32 14 L44 26 L50 8 L56 26 L68 14 L62 36Z', s || '#3e8e2a', 2.6);
    el(c, 50, 64, 24, 30);
    fill(c, m);
    c.save();
    el(c, 50, 64, 24, 30);
    c.clip();
    c.globalAlpha = 0.35;
    for (let i = -4; i <= 4; i++) {
      sp(c, `M${30 + i * 10} 34 L${70 + i * 10} 96`, 1.4);
      sp(c, `M${70 + i * 10} 34 L${30 + i * 10} 96`, 1.4);
    }
    c.restore();
  },
  star({ c, m }) {
    poly(c, 50, 10, 61, 38, 90, 40, 67, 58, 75, 88, 50, 71, 25, 88, 33, 58, 10, 40, 39, 38);
    fill(c, m);
    shine(c, 44, 34, 4, 8, 0.3);
  },
  /* ---------- legumes ---------- */
  carrot({ c, m, s }) {
    fp(c, 'M36 30 C48 26 66 28 70 34 C64 56 50 76 30 92 C28 70 28 46 36 30Z', m);
    sp(c, 'M40 46 L48 48 M36 60 L46 62 M34 74 L42 76', 1.8);
    fp(c, 'M52 30 L48 10 L56 24 L62 6 L64 26 L76 14 L68 32Z', s || '#4e9a2e', 2.6);
  },
  pepper({ c, m, s }) {
    fp(c, 'M24 34 C14 52 20 84 36 88 C42 90 46 84 50 84 C54 84 58 90 64 88 C80 84 86 52 76 34 C68 26 58 30 50 30 C42 30 32 26 24 34Z', m);
    sp(c, 'M50 36 C48 56 48 70 50 84', 1.8, mixHex(m, '#000', 0.35));
    shine(c, 32, 48, 4, 10, 0.2);
    fp(c, 'M44 32 C44 22 48 16 56 12 L58 16 C52 20 52 26 54 32Z', s || '#3e7d2a', 2.4);
  },
  chili({ c, m, s }) {
    fp(c, 'M24 26 C30 22 40 24 44 30 C56 50 70 68 90 78 C70 84 46 76 32 58 C24 48 20 34 24 26Z', m);
    shine(c, 36, 40, 3, 9, -0.7);
    fp(c, 'M24 26 C20 20 16 18 12 14 L16 12 C20 16 26 18 30 20Z', s || '#3e7d2a', 2.4);
  },
  eggplant({ c, m, s }) {
    fp(c, 'M30 30 C40 22 56 24 62 36 C70 50 88 60 86 78 C84 92 64 94 50 86 C34 76 26 60 24 46 C23 38 26 33 30 30Z', m);
    shine(c, 40, 42, 4, 10, -0.6);
    fp(c, 'M26 34 C30 24 40 20 50 26 C44 26 40 30 38 36 C34 32 30 32 26 34Z', s || '#4e7a2a', 2.4);
    stem(c, 34, 26, s || '#4e7a2a', 10);
  },
  pumpkin({ c, m, s }) {
    for (const [x, rx] of [[30, 18], [70, 18], [42, 18], [58, 18], [50, 16]]) {
      el(c, x, 58, rx, 30);
      fill(c, m, 2.8);
    }
    stem(c, 50, 30, s || '#5a6a2a', 12);
  },
  leafy({ c, m, s }) {
    for (const [x, y, r] of [[30, 58, 22], [70, 58, 22], [50, 70, 24], [40, 42, 20], [60, 42, 20], [50, 50, 22]]) {
      el(c, x, y, r, r * 0.92);
      fill(c, m, 2.6);
      sp(c, `M50 82 Q${x} ${y + 6} ${x + (x - 50) * 0.3} ${y - r * 0.5}`, 1.4, s || mixHex(m, '#fff', 0.45));
    }
  },
  leaf({ c, m, s }) {
    fp(c, 'M20 84 C16 50 40 16 86 14 C86 56 60 86 20 84Z', m);
    sp(c, 'M20 84 C40 64 60 40 80 20', 2, s || mixHex(m, '#fff', 0.4));
    sp(c, 'M36 66 L32 48 M46 54 L44 36 M58 42 L58 26 M44 62 L62 62 M54 50 L72 50', 1.4, s || mixHex(m, '#fff', 0.4));
    stem(c, 20, 84, s || mixHex(m, '#000', 0.2), -8);
  },
  maple({ c, m }) {
    fp(c, 'M50 8 L58 28 L70 22 L66 40 L88 34 L80 50 L90 56 L68 64 L72 76 L54 70 L52 92 L48 92 L46 70 L28 76 L32 64 L10 56 L20 50 L12 34 L34 40 L30 22 L42 28Z', m);
    sp(c, 'M50 88 L50 30 M50 62 L26 48 M50 62 L74 48', 1.6, mixHex(m, '#000', 0.3));
  },
  broccoli({ c, m, s }) {
    fp(c, 'M42 60 L40 90 L60 90 L58 60Z', s || '#9ab85a');
    for (const [x, y, r] of [[30, 48, 16], [70, 48, 16], [50, 36, 18], [40, 58, 14], [60, 58, 14], [50, 52, 16]]) {
      el(c, x, y, r, r);
      fill(c, m, 2.6);
    }
  },
  onion({ c, m, s }) {
    fp(c, 'M50 18 C46 30 20 40 20 62 C20 80 34 90 50 90 C66 90 80 80 80 62 C80 40 54 30 50 18Z', m);
    sp(c, 'M50 24 C40 40 38 70 46 88 M50 24 C60 40 62 70 54 88', 1.4, mixHex(m, '#000', 0.25));
    shine(c, 34, 56, 4, 10, 0.3);
    if (s) fp(c, 'M44 22 L40 6 L48 16 L52 4 L56 18Z', s, 2.4);
  },
  potato({ c, m }) {
    fp(c, 'M20 52 C18 34 40 24 58 28 C78 30 88 44 84 60 C80 78 60 84 42 80 C26 78 20 66 20 52Z', m);
    for (const [x, y] of [[38, 42], [62, 40], [52, 62], [70, 60], [32, 62]]) dot(c, x, y, 1.6, mixHex(m, '#000', 0.4));
    shine(c, 40, 38, 8, 3, -0.2, 0.25);
  },
  corn({ c, m, s }) {
    el(c, 50, 52, 18, 36);
    fill(c, m);
    c.save();
    el(c, 50, 52, 18, 36);
    c.clip();
    for (let y = 20; y < 90; y += 6) for (let x = 34; x < 68; x += 6) el(c, x + ((y / 6) % 2) * 3, y, 2.6, 2.4), ink(c, 0.8);
    c.restore();
    fp(c, 'M32 60 C24 80 36 92 50 94 C40 80 38 70 40 56Z', s || '#7aa83a', 2.4);
    fp(c, 'M68 60 C76 80 64 92 50 94 C60 80 62 70 60 56Z', s || '#7aa83a', 2.4);
  },
  pod({ c, m }) {
    fp(c, 'M12 60 C30 30 70 26 90 36 C76 62 40 76 12 60Z', m);
    for (const x of [30, 44, 58, 72]) {
      el(c, x, 52 - (x - 30) * 0.18, 6, 6);
      fill(c, mixHex(m, '#fff', 0.15), 1.6);
    }
  },
  mushroom({ c, m, s }) {
    fp(c, 'M40 56 L36 88 C44 92 56 92 64 88 L60 56Z', s || mixHex(m, '#fff', 0.6));
    fp(c, 'M12 58 C12 30 30 16 50 16 C70 16 88 30 88 58 C70 64 30 64 12 58Z', m);
    shine(c, 34, 32, 10, 5, -0.4);
  },
  stick({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.6);
    rr(c, -8, -40, 16, 80, 8);
    fill(c, m);
    shine(c, -3, -10, 2, 18, 0, 0.25);
    if (s) {
      rr(c, -8, -40, 16, 10, 6);
      fill(c, s);
    }
    c.restore();
  },
  /* ---------- comidas ---------- */
  bread({ c, m, s }) {
    fp(c, 'M10 60 C10 36 34 26 50 26 C66 26 90 36 90 60 C90 74 76 78 50 78 C24 78 10 74 10 60Z', m);
    sp(c, 'M30 40 L38 52 M46 36 L54 50 M62 38 L70 52', 3, s || mixHex(m, '#fff', 0.45));
  },
  cheese({ c, m }) {
    fp(c, 'M10 70 L86 40 L90 76 L14 92Z', mixHex(m, '#000', 0.08));
    fp(c, 'M10 70 L60 26 L86 40Z', m);
    for (const [x, y, r] of [[40, 76, 5], [64, 66, 4], [78, 60, 3], [26, 80, 3]]) {
      el(c, x, y, r, r * 0.8);
      fill(c, mixHex(m, '#7a4a0a', 0.3), 1.4);
    }
  },
  yolk({ c, m, s }) {
    fp(c, 'M18 50 C14 30 40 16 60 22 C84 26 92 52 80 70 C70 86 40 88 26 76 C14 68 20 60 18 50Z', s || '#faf7f0');
    el(c, 52, 52, 24, 22);
    fill(c, m);
    shine(c, 44, 44, 6, 4, -0.5, 0.45);
  },
  steak({ c, m, s }) {
    fp(c, 'M16 50 C14 30 40 20 60 24 C82 28 92 46 86 64 C80 82 58 88 40 82 C24 76 18 66 16 50Z', m);
    sp(c, 'M30 46 C40 40 52 50 64 42 M34 62 C46 56 58 66 72 58', 2, s || mixHex(m, '#fff', 0.55));
  },
  drumstick({ c, m, s }) {
    sp(c, 'M58 58 L84 84', 10);
    sp(c, 'M58 58 L84 84', 5, s || '#f2ead8');
    el(c, 86, 86, 5, 5);
    fill(c, s || '#f2ead8', 2.4);
    fp(c, 'M20 26 C34 10 60 16 66 38 C70 54 60 66 44 66 C26 66 10 46 20 26Z', m);
    shine(c, 34, 30, 8, 4, -0.6);
  },
  sausage({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.35);
    rr(c, -40, -13, 80, 26, 13);
    fill(c, m);
    shine(c, -10, -6, 20, 3, 0, 0.3);
    c.restore();
  },
  strip({ c, m, s }) {
    fp(c, 'M10 40 C24 30 34 50 50 40 C66 30 76 50 90 40 L90 62 C76 72 66 52 50 62 C34 72 24 52 10 62Z', m);
    sp(c, 'M10 51 C24 41 34 61 50 51 C66 41 76 61 90 51', 3, s || mixHex(m, '#fff', 0.5));
  },
  block({ c, m }) {
    fp(c, 'M20 40 L50 28 L84 38 L84 72 L54 86 L20 74Z', m);
    fp(c, 'M20 40 L50 28 L84 38 L54 50Z', mixHex(m, '#fff', 0.12), 2.6);
    sp(c, 'M54 50 L54 86', 2.6);
  },
  jar({ c, m, s }) {
    rr(c, 26, 30, 48, 58, 10);
    fill(c, m);
    rr(c, 30, 18, 40, 14, 4);
    fill(c, s || '#d8d4cc');
    shine(c, 36, 56, 3, 14, 0, 0.35);
  },
  bottle({ c, m, s }) {
    fp(c, 'M42 10 L58 10 L58 26 C70 32 72 40 72 52 L72 86 C72 90 70 92 66 92 L34 92 C30 92 28 90 28 86 L28 52 C28 40 30 32 42 26Z', m);
    rr(c, 41, 6, 18, 8, 3);
    fill(c, s || '#e0dcd4', 2.6);
    shine(c, 36, 60, 3, 16, 0, 0.3);
  },
  fries({ c, m, s }) {
    for (let i = 0; i < 7; i++) {
      c.save();
      c.translate(30 + i * 7, 46);
      c.rotate((i - 3) * 0.08);
      rr(c, -3.5, -34, 7, 40, 2);
      fill(c, m, 2.2);
      c.restore();
    }
    fp(c, 'M24 46 L76 46 L70 92 L30 92Z', s || '#d8302a');
  },
  disc({ c, m, s }) {
    el(c, 50, 54, 38, 30);
    fill(c, m);
    if (s) {
      el(c, 50, 54, 10, 8);
      fill(c, s, 2.2);
    }
    shine(c, 36, 42, 10, 4, -0.2, 0.25);
  },
  drop({ c, m }) {
    fp(c, 'M50 8 C58 26 80 44 80 62 C80 80 66 92 50 92 C34 92 20 80 20 62 C20 44 42 26 50 8Z', m);
    shine(c, 36, 62, 4, 10, 0.2, 0.35);
  },
  pizza({ c, m, s }) {
    fp(c, 'M50 92 L16 22 C36 12 64 12 84 22Z', m);
    fp(c, 'M16 22 C36 12 64 12 84 22 L80 30 C62 22 38 22 20 30Z', s || '#d9963e', 2.6);
    for (const [x, y] of [[46, 40], [58, 52], [40, 58]]) {
      el(c, x, y, 5, 5);
      fill(c, '#c0392b', 1.6);
    }
  },
  /* ---------- bebidas ---------- */
  glass({ c, m }) {
    fp(c, 'M24 14 L76 14 L68 90 L32 90Z', 'rgba(255,255,255,.55)');
    fp(c, 'M27 30 L73 30 L68 88 L32 88Z', m, 0);
    sp(c, 'M24 14 L76 14 L68 90 L32 90Z', 3.2);
    shine(c, 36, 58, 2.5, 20, 0.08, 0.35);
    sp(c, 'M27 30 L73 30', 2);
  },
  mug({ c, m, s }) {
    sp(c, 'M74 40 C92 40 92 70 74 70', 8);
    sp(c, 'M74 40 C92 40 92 70 74 70', 4, s || '#f2f0ea');
    rr(c, 16, 26, 60, 64, 8);
    fill(c, s || '#f2f0ea');
    el(c, 46, 30, 26, 6);
    fill(c, m, 2.2);
    rr(c, 22, 34, 48, 6, 2);
    c.fillStyle = 'rgba(0,0,0,0)';
    // líquido visível em "corte" (grande área)
    c.save();
    rr(c, 20, 30, 52, 56, 6);
    c.clip();
    c.fillStyle = m;
    c.fillRect(20, 30, 52, 56);
    c.restore();
    rr(c, 16, 26, 60, 64, 8);
    ink(c);
    sp(c, 'M20 30 L72 30', 2.4);
  },
  teacup({ c, m, s }) {
    el(c, 50, 84, 40, 7);
    fill(c, s || '#f4f2ec');
    sp(c, 'M78 44 C92 44 90 66 72 66', 7);
    sp(c, 'M78 44 C92 44 90 66 72 66', 3.4, s || '#f4f2ec');
    fp(c, 'M14 36 L86 36 C86 64 70 80 50 80 C30 80 14 64 14 36Z', s || '#f4f2ec');
    el(c, 50, 36, 36, 8);
    fill(c, m);
    fp(c, 'M18 42 L82 42 C80 62 66 76 50 76 C34 76 20 62 18 42Z', m, 0);
    shine(c, 36, 36, 10, 2, 0, 0.35);
  },
  cup({ c, m, s }) {
    fp(c, 'M22 30 L78 30 L70 88 L30 88Z', m);
    rr(c, 18, 22, 64, 10, 4);
    fill(c, s || '#f2f0ea');
    shine(c, 34, 56, 3, 14, 0.1, 0.3);
  },
  /* ---------- sobremesas e doces ---------- */
  ball({ c, m, s }) {
    el(c, 50, 52, 34, 34);
    fill(c, m);
    if (s) {
      sp(c, 'M16 52 C30 40 70 40 84 52', 2.6, s);
      sp(c, 'M50 18 C40 34 40 70 50 86', 2.6, s);
    }
    shine(c, 38, 38, 9, 6, -0.6, 0.4);
  },
  truffle({ c, m, s }) {
    fp(c, 'M24 72 L30 90 L70 90 L76 72Z', s || '#c8a8d8', 2.4);
    el(c, 50, 56, 28, 26);
    fill(c, m);
    for (const [x, y] of [[40, 44], [52, 40], [62, 48], [44, 58], [58, 62], [36, 64]]) {
      rr(c, x - 2.5, y - 1, 5, 2.2, 1);
      c.fillStyle = mixHex(m, '#fff', 0.35);
      c.fill();
    }
  },
  pudding({ c, m, s }) {
    el(c, 50, 88, 42, 6);
    fill(c, '#f4f2ec');
    fp(c, 'M22 86 L30 34 C40 28 60 28 70 34 L78 86Z', m);
    fp(c, 'M30 34 C40 28 60 28 70 34 L72 44 C66 48 60 40 54 46 C48 40 42 50 36 44 C34 46 30 46 29 42Z', s || '#9a4a12', 2.4);
    shine(c, 38, 62, 3, 12, 0.1);
  },
  cake({ c, m, s }) {
    fp(c, 'M10 52 L58 30 L90 46 L90 80 L42 94 L10 80Z', m);
    fp(c, 'M10 52 L58 30 L90 46 L42 64Z', s || '#f6f0e4', 2.6);
    sp(c, 'M42 64 L42 94', 2.6);
    sp(c, 'M10 66 L42 78 L90 62', 3, s || '#f6f0e4');
    el(c, 54, 38, 5, 5);
    fill(c, '#c8102e', 2);
  },
  cupcake({ c, m, s }) {
    fp(c, 'M24 54 L76 54 L68 90 L32 90Z', s || '#d9a65a');
    sp(c, 'M36 56 L40 90 M50 56 L50 90 M64 56 L60 90', 1.6);
    fp(c, 'M18 56 C14 40 28 38 32 36 C30 22 44 18 50 22 C56 14 72 22 68 34 C78 36 88 46 82 56Z', m);
    el(c, 50, 14, 5, 5);
    fill(c, '#c8102e', 2);
    shine(c, 36, 42, 8, 3, -0.3);
  },
  icecream({ c, m, s }) {
    fp(c, 'M30 50 L50 94 L70 50Z', s || '#d9a65a');
    sp(c, 'M36 58 L62 58 M40 68 L58 68 M44 78 L54 78', 1.4);
    fp(c, 'M24 52 C16 46 20 34 30 34 C30 18 46 12 56 18 C70 14 82 26 74 38 C84 42 80 54 72 54 C60 58 40 58 24 52Z', m);
    shine(c, 40, 28, 8, 4, -0.4);
  },
  popsicle({ c, m, s }) {
    rr(c, 45, 62, 10, 32, 5);
    fill(c, s || '#e2c08a');
    fp(c, 'M28 26 C28 14 72 14 72 26 L72 70 C72 74 70 76 66 76 L34 76 C30 76 28 74 28 70Z', m);
    shine(c, 38, 40, 3, 14, 0, 0.3);
  },
  jelly({ c, m }) {
    el(c, 50, 86, 42, 6);
    fill(c, '#f4f2ec');
    fp(c, 'M14 84 C14 50 26 22 50 22 C74 22 86 50 86 84Z', m);
    sp(c, 'M30 84 C30 56 36 34 46 26 M70 84 C70 56 64 34 54 26', 1.6, mixHex(m, '#000', 0.25));
    shine(c, 34, 42, 4, 12, 0.3, 0.4);
  },
  donut({ c, m, s }) {
    el(c, 50, 54, 38, 32);
    fill(c, s || '#d9a65a');
    fp(c, 'M14 50 C14 28 86 28 86 50 C88 60 80 58 76 64 C70 70 62 62 56 70 C48 76 40 66 32 70 C22 72 14 62 14 50Z', m, 2.6);
    el(c, 50, 50, 10, 7);
    fill(c, '#d8d6dd', 2.6);
    for (const [x, y, a] of [[30, 42, 0.5], [44, 36, -0.4], [64, 38, 0.9], [70, 52, 0.2], [38, 58, -0.8]]) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      rr(c, -3, -1, 6, 2.2, 1);
      c.fillStyle = '#fff';
      c.fill();
      c.restore();
    }
  },
  macaron({ c, m, s }) {
    el(c, 50, 38, 38, 16);
    fill(c, m);
    rr(c, 14, 46, 72, 10, 5);
    fill(c, s || '#f8f2e6', 2.6);
    el(c, 50, 66, 38, 16);
    fill(c, m);
    shine(c, 38, 32, 12, 4, -0.1);
  },
  pie({ c, m, s }) {
    fp(c, 'M14 76 L50 24 L88 70 C84 80 20 86 14 76Z', s || '#d9a65a');
    fp(c, 'M20 72 L50 30 L82 68 C70 72 32 76 20 72Z', m, 0);
    sp(c, 'M14 76 L50 24 L88 70', 3.2);
  },
  waffle({ c, m }) {
    rr(c, 14, 18, 72, 72, 10);
    fill(c, m);
    c.save();
    rr(c, 14, 18, 72, 72, 10);
    c.clip();
    for (let i = 1; i < 5; i++) {
      sp(c, `M${14 + i * 14.4} 18 L${14 + i * 14.4} 90`, 2.6, mixHex(m, '#000', 0.3));
      sp(c, `M14 ${18 + i * 14.4} L86 ${18 + i * 14.4}`, 2.6, mixHex(m, '#000', 0.3));
    }
    c.restore();
  },
  candy({ c, m, s }) {
    fp(c, 'M30 52 L10 36 L14 52 L10 68Z', s || m, 2.6);
    fp(c, 'M70 52 L90 36 L86 52 L90 68Z', s || m, 2.6);
    el(c, 50, 52, 24, 18);
    fill(c, m);
    shine(c, 42, 44, 8, 3, -0.2, 0.45);
  },
  lollipop({ c, m, s }) {
    rr(c, 47, 54, 6, 40, 3);
    fill(c, s || '#f4f2ec', 2.4);
    el(c, 50, 38, 28, 28);
    fill(c, m);
    sp(c, 'M50 38 m-4 0 a4 4 0 1 1 8 0 a9 9 0 1 1 -18 0 a14 14 0 1 1 28 0 a19 19 0 1 1 -38 0', 1.6, mixHex(m, '#fff', 0.4));
  },
  cloud({ c, m }) {
    fp(c, 'M22 70 C8 70 8 50 22 48 C20 32 40 24 50 34 C58 18 84 22 82 42 C96 44 94 70 80 70Z', m);
    shine(c, 40, 42, 10, 4, -0.2, 0.3);
  },
  bean({ c, m }) {
    fp(c, 'M24 40 C30 22 56 24 60 32 C64 40 74 36 80 46 C88 62 70 82 48 78 C26 74 18 56 24 40Z', m);
    shine(c, 36, 38, 8, 4, -0.4, 0.4);
  },
  teddy({ c, m, s }) {
    const mz = s || mixHex(m, '#fff', 0.45);
    for (const [x, y] of [[28, 22], [72, 22]]) {
      el(c, x, y, 10, 10);
      fill(c, m);
    }
    el(c, 50, 70, 26, 22);
    fill(c, m);
    el(c, 50, 38, 24, 21);
    fill(c, m);
    el(c, 50, 46, 10, 7);
    fill(c, mz, 2.2);
    dot(c, 50, 43, 2.6, INK);
    eye(c, 42, 34);
    eye(c, 58, 34);
    el(c, 50, 74, 12, 10);
    fill(c, mz, 2);
  },
  bar({ c, m, s }) {
    rr(c, 18, 14, 64, 76, 6);
    fill(c, m);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
      rr(c, 24 + i * 28, 20 + j * 17.5, 24, 14, 3);
      ink(c, 1.6);
    }
    if (s) {
      fp(c, 'M18 60 L82 52 L82 90 L18 90Z', s);
    }
  },
  pile({ c, m, s }) {
    el(c, 50, 84, 42, 8);
    fill(c, s || '#e8e4dc');
    fp(c, 'M14 82 C22 60 36 34 50 30 C64 34 78 60 86 82 C70 88 30 88 14 82Z', m);
    for (const [x, y] of [[40, 50], [56, 46], [48, 64], [64, 66], [32, 70]]) dot(c, x, y, 1.2, mixHex(m, '#000', 0.25));
  },
  bowl({ c, m, s }) {
    // conteúdo (montinho grande) por cima de uma tigela baixa: a cor principal domina
    fp(c, 'M10 58 C10 30 30 14 50 14 C70 14 90 30 90 58Z', m);
    for (const [x, y] of [[34, 36], [54, 28], [66, 42], [44, 46], [24, 50]]) dot(c, x, y, 2, mixHex(m, '#fff', 0.22));
    fp(c, 'M8 56 L92 56 C90 76 72 90 50 90 C28 90 10 76 8 56Z', s || '#e8e4dc');
    shine(c, 36, 24, 10, 4, -0.3, 0.25);
  },
  /* ---------- cozinha / casa ---------- */
  pot({ c, m, s }) {
    rr(c, 4, 40, 14, 8, 4);
    fill(c, s || INK, 2);
    rr(c, 82, 40, 14, 8, 4);
    fill(c, s || INK, 2);
    rr(c, 14, 34, 72, 54, 10);
    fill(c, m);
    rr(c, 10, 28, 80, 10, 5);
    fill(c, mixHex(m, '#000', 0.12));
    shine(c, 26, 60, 3, 14, 0, 0.3);
  },
  pan({ c, m }) {
    rr(c, 62, 46, 34, 10, 5);
    fill(c, mixHex(m, '#000', 0.2));
    el(c, 40, 52, 34, 30);
    fill(c, m);
    el(c, 40, 52, 26, 22);
    ink(c, 1.6);
  },
  board({ c, m, s }) {
    rr(c, 12, 14, 76, 76, 8);
    fill(c, m);
    if (s) {
      rr(c, 12, 14, 76, 76, 8);
      ink(c, 6);
      rr(c, 12, 14, 76, 76, 8);
      c.lineWidth = 3;
      c.strokeStyle = s;
      c.stroke();
    }
    shine(c, 30, 30, 10, 4, -0.5, 0.18);
  },
  teapot({ c, m, s }) {
    sp(c, 'M74 48 C94 48 90 80 72 76', 7);
    sp(c, 'M74 48 C94 48 90 80 72 76', 3.4, m);
    fp(c, 'M24 62 L8 42 L12 40 L30 54Z', m, 2.6);
    fp(c, 'M22 52 C22 34 78 34 78 52 L80 80 C80 88 72 90 50 90 C28 90 20 88 20 80Z', m);
    el(c, 50, 36, 20, 6);
    fill(c, mixHex(m, '#000', 0.12), 2.6);
    el(c, 50, 28, 4, 4);
    fill(c, s || mixHex(m, '#000', 0.2), 2.4);
    shine(c, 34, 62, 4, 12, 0.1, 0.35);
  },
  spoon({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(0.7);
    rr(c, -5, -6, 10, 52, 5);
    fill(c, m);
    el(c, 0, -26, 16, 22);
    fill(c, m);
    el(c, 0, -26, 10, 15);
    ink(c, 1.4);
    c.restore();
  },
  plate({ c, m }) {
    el(c, 50, 54, 42, 36);
    fill(c, m);
    el(c, 50, 54, 28, 23);
    ink(c, 1.6);
    shine(c, 34, 36, 12, 4, -0.3, 0.35);
  },
  basket({ c, m }) {
    sp(c, 'M22 50 C22 14 78 14 78 50', 6);
    sp(c, 'M22 50 C22 14 78 14 78 50', 3, m);
    fp(c, 'M12 46 L88 46 L78 90 L22 90Z', m);
    for (let y = 56; y < 90; y += 10) sp(c, `M${16 + (y - 46) * 0.2} ${y} L${84 - (y - 46) * 0.2} ${y}`, 1.6, mixHex(m, '#000', 0.35));
    for (let x = 26; x < 80; x += 10) sp(c, `M${x} 48 L${x + (50 - x) * 0.1} 88`, 1.6, mixHex(m, '#000', 0.35));
  },
  /* ---------- animais ---------- */
  quad({ c, m, s }) {
    sp(c, 'M80 46 C92 40 92 26 86 22', 7);
    sp(c, 'M80 46 C92 40 92 26 86 22', 3.6, m);
    for (const x of [28, 40, 62, 74]) {
      rr(c, x - 5, 58, 10, 32, 5);
      fill(c, m, 2.6);
    }
    el(c, 52, 54, 32, 17);
    fill(c, m);
    fp(c, 'M14 30 L16 12 L26 24Z', m, 2.6);
    fp(c, 'M30 26 L36 10 L40 26Z', m, 2.6);
    if (s) {
      el(c, 28, 36, 23, 22);
      fill(c, s);
    }
    el(c, 26, 36, 16, 14);
    fill(c, m);
    el(c, 14, 42, 7, 6);
    fill(c, mixHex(m, '#fff', 0.25), 2.2);
    dot(c, 10, 40, 2.4, INK);
    eye(c, 26, 32);
  },
  bear({ c, m, s }) {
    const mz = s || mixHex(m, '#fff', 0.4);
    for (const [x, y] of [[30, 20], [70, 20]]) {
      el(c, x, y, 9, 9);
      fill(c, m);
    }
    el(c, 50, 72, 30, 22);
    fill(c, m);
    el(c, 50, 38, 26, 22);
    fill(c, m);
    el(c, 50, 46, 11, 8);
    fill(c, mz, 2.2);
    dot(c, 50, 43, 3, INK);
    eye(c, 41, 34);
    eye(c, 59, 34);
    shine(c, 38, 26, 6, 3, -0.4, 0.2);
  },
  elephant({ c, m }) {
    for (const x of [34, 46, 66, 78]) {
      rr(c, x - 6, 60, 12, 30, 5);
      fill(c, m, 2.6);
    }
    el(c, 58, 52, 32, 22);
    fill(c, m);
    fp(c, 'M22 40 C12 52 12 74 20 86 L26 84 C22 72 24 58 30 50Z', m, 2.8);
    el(c, 28, 36, 18, 18);
    fill(c, m);
    el(c, 40, 38, 12, 16, 0.2);
    fill(c, mixHex(m, '#000', 0.08), 2.6);
    eye(c, 24, 32);
  },
  giraffe({ c, m, s }) {
    const sp2 = s || '#8a4a1e';
    for (const x of [40, 50, 70, 80]) {
      rr(c, x - 4, 62, 8, 30, 4);
      fill(c, m, 2.4);
    }
    el(c, 60, 58, 26, 14);
    fill(c, m);
    fp(c, 'M30 52 L22 18 L34 16 L46 50Z', m);
    el(c, 26, 16, 12, 8, -0.3);
    fill(c, m);
    sp(c, 'M24 10 L22 2 M30 9 L30 2', 3);
    for (const [x, y] of [[54, 54], [68, 60], [62, 50], [36, 40], [30, 28], [76, 54]]) {
      el(c, x, y, 4, 3.4);
      c.fillStyle = sp2;
      c.fill();
    }
    eye(c, 24, 14, 2);
  },
  rabbit({ c, m, s }) {
    for (const x of [40, 60]) {
      el(c, x, 22, 7, 18, (x - 50) * 0.02);
      fill(c, m);
      el(c, x, 22, 3, 12, (x - 50) * 0.02);
      c.fillStyle = s || '#f2b5c0';
      c.fill();
    }
    el(c, 50, 72, 26, 20);
    fill(c, m);
    el(c, 50, 46, 20, 17);
    fill(c, m);
    eye(c, 43, 44);
    eye(c, 57, 44);
    dot(c, 50, 52, 2.4, s || '#e07a8a');
  },
  mouse({ c, m, s }) {
    sp(c, 'M80 66 C94 62 94 44 86 40', 2.6);
    el(c, 54, 62, 30, 22);
    fill(c, m);
    for (const x of [30, 52]) {
      el(c, x, 30, 11, 11);
      fill(c, m);
      el(c, x, 30, 6, 6);
      c.fillStyle = s || '#f2b5c0';
      c.fill();
    }
    el(c, 36, 48, 18, 15);
    fill(c, m);
    dot(c, 20, 52, 2.6, s || '#e07a8a');
    eye(c, 34, 44);
  },
  bat({ c, m }) {
    fp(c, 'M50 40 C40 30 22 26 6 34 C14 40 14 48 10 54 C18 50 24 54 26 60 C32 54 40 56 46 60Z', m);
    fp(c, 'M50 40 C60 30 78 26 94 34 C86 40 86 48 90 54 C82 50 76 54 74 60 C68 54 60 56 54 60Z', m);
    el(c, 50, 50, 11, 14);
    fill(c, m);
    fp(c, 'M42 40 L42 30 L47 38 M58 40 L58 30 L53 38', m, 2.4);
    dot(c, 46, 46, 2, '#fff');
    dot(c, 54, 46, 2, '#fff');
  },
  bird({ c, m, s }) {
    fp(c, 'M74 40 L94 34 L80 48Z', s || '#f2a01e', 2.4);
    fp(c, 'M20 56 L4 46 L6 66Z', m, 2.6);
    el(c, 44, 58, 28, 22, -0.1);
    fill(c, m);
    el(c, 68, 42, 15, 14);
    fill(c, m);
    fp(c, 'M30 52 C40 44 56 50 60 62 C50 70 36 66 30 52Z', mixHex(m, '#000', 0.12), 2.4);
    sp(c, 'M40 80 L38 92 M50 80 L52 92', 2.6);
    eye(c, 70, 38);
  },
  owl({ c, m, s }) {
    fp(c, 'M24 30 L22 14 L36 24 L64 24 L78 14 L76 30 C86 50 82 88 50 90 C18 88 14 50 24 30Z', m);
    for (const x of [38, 62]) {
      el(c, x, 40, 11, 11);
      fill(c, s || '#f6f0e0', 2.4);
      eye(c, x, 40, 4.4);
    }
    fp(c, 'M46 50 L54 50 L50 58Z', '#f2a01e', 2);
    sp(c, 'M38 66 l4 4 l4 -4 M50 70 l4 4 l4 -4 M44 78 l4 4 l4 -4', 1.6);
  },
  penguin({ c, m, s }) {
    fp(c, 'M50 10 C30 10 22 40 22 64 C22 84 34 92 50 92 C66 92 78 84 78 64 C78 40 70 10 50 10Z', m);
    fp(c, 'M50 30 C38 30 34 50 34 66 C34 80 40 86 50 86 C60 86 66 80 66 66 C66 50 62 30 50 30Z', s || '#f6f4ee', 2.4);
    eye(c, 42, 24);
    eye(c, 58, 24);
    fp(c, 'M44 30 L56 30 L50 38Z', '#f2a01e', 2);
  },
  duck({ c, m, s }) {
    el(c, 52, 64, 34, 22);
    fill(c, m);
    el(c, 34, 36, 16, 15);
    fill(c, m);
    fp(c, 'M18 38 L4 42 L18 46Z', s || '#f28a1e', 2.4);
    fp(c, 'M44 60 C58 52 74 56 80 64 C70 74 54 72 44 60Z', mixHex(m, '#000', 0.1), 2.4);
    eye(c, 32, 32);
  },
  chick({ c, m, s }) {
    el(c, 50, 56, 32, 32);
    fill(c, m);
    fp(c, 'M50 54 L64 58 L50 64Z', s || '#f28a1e', 2.4);
    eye(c, 40, 46);
    eye(c, 60, 46);
    fp(c, 'M48 24 L46 16 L52 20 L56 14 L54 26Z', m, 2.2);
    fp(c, 'M18 58 C10 50 12 44 20 46Z', m, 2.2);
  },
  fish({ c, m, s }) {
    fp(c, 'M78 52 L96 34 L94 70Z', m);
    fp(c, 'M8 52 C20 26 56 22 80 52 C56 82 20 78 8 52Z', m);
    if (s) {
      sp(c, 'M38 30 C32 42 32 62 38 74', 5, s);
      sp(c, 'M58 32 C54 44 54 60 58 72', 5, s);
    }
    fp(c, 'M40 34 L52 22 L60 38', m, 2.4);
    eye(c, 24, 48, 3.4);
    sp(c, 'M14 58 Q20 60 24 58', 1.8);
  },
  whale({ c, m, s }) {
    fp(c, 'M10 56 C10 30 50 26 74 44 L88 30 L90 44 L96 48 L88 54 L90 66 L78 58 C64 76 36 82 20 76 C14 72 10 64 10 56Z', m);
    if (s) fp(c, 'M14 62 C30 74 52 74 70 60 C56 72 30 76 16 70Z', s, 0);
    eye(c, 26, 52, 2.6);
    sp(c, 'M14 62 Q30 70 46 64', 1.6);
  },
  octopus({ c, m }) {
    for (let i = 0; i < 6; i++) {
      const x = 22 + i * 11;
      sp(c, `M${x + 3} 56 C${x - 4} 70 ${x + 8} 80 ${x - 2} 92`, 9);
      sp(c, `M${x + 3} 56 C${x - 4} 70 ${x + 8} 80 ${x - 2} 92`, 5, m);
    }
    fp(c, 'M20 54 C14 20 86 20 80 54 C76 66 24 66 20 54Z', m);
    eye(c, 40, 46, 3.4);
    eye(c, 60, 46, 3.4);
    shine(c, 40, 28, 10, 4, -0.2);
  },
  jellyfish({ c, m }) {
    c.save();
    c.globalAlpha = 0.85;
    for (let i = 0; i < 5; i++) sp(c, `M${30 + i * 10} 54 q-6 10 0 20 q6 10 0 20`, 2.4, mixHex(m, '#000', 0.2));
    c.restore();
    fp(c, 'M16 56 C16 14 84 14 84 56 C74 62 66 54 58 60 C50 54 42 62 34 56 C26 62 22 58 16 56Z', m);
    shine(c, 38, 30, 10, 5, -0.3, 0.35);
  },
  crab({ c, m }) {
    for (const x of [26, 74]) {
      el(c, x, 22, 10, 12, x < 50 ? -0.4 : 0.4);
      fill(c, m);
      sp(c, `M${x} 32 L${x < 50 ? 36 : 64} 46`, 4);
    }
    for (let i = 0; i < 3; i++) {
      sp(c, `M30 ${58 + i * 7} L12 ${62 + i * 10}`, 4);
      sp(c, `M70 ${58 + i * 7} L88 ${62 + i * 10}`, 4);
    }
    el(c, 50, 60, 28, 20);
    fill(c, m);
    eye(c, 42, 50);
    eye(c, 58, 50);
  },
  shrimp({ c, m }) {
    fp(c, 'M72 30 C90 44 84 76 56 80 C40 82 28 74 22 62 L14 72 L10 56 L24 54 C32 62 44 66 56 62 C68 58 70 44 62 36Z', m);
    sp(c, 'M66 36 L76 44 M68 50 L80 54 M60 60 L70 70 M48 64 L52 76', 1.8, mixHex(m, '#000', 0.3));
    sp(c, 'M66 34 C76 20 90 18 96 22', 1.6);
    eye(c, 70, 34, 2);
  },
  urchin({ c, m }) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      sp(c, `M${50 + Math.cos(a) * 20} ${52 + Math.sin(a) * 20} L${50 + Math.cos(a) * 42} ${52 + Math.sin(a) * 42}`, 2.6, m);
    }
    el(c, 50, 52, 24, 24);
    fill(c, m);
  },
  turtle({ c, m, s }) {
    const sk = s || '#8aa65a';
    el(c, 84, 56, 10, 8);
    fill(c, sk);
    for (const [x, y] of [[30, 72], [68, 72], [30, 40], [68, 40]]) {
      el(c, x, y, 8, 6);
      fill(c, sk, 2.4);
    }
    fp(c, 'M14 66 C14 30 76 26 80 60 C80 70 18 74 14 66Z', m);
    sp(c, 'M34 40 L30 66 M50 34 L50 68 M66 40 L68 64 M20 52 L76 50', 1.8, mixHex(m, '#000', 0.35));
    eye(c, 86, 54, 1.8);
  },
  seal({ c, m }) {
    fp(c, 'M14 80 C20 54 34 26 54 26 C70 26 74 44 70 60 C84 70 92 80 92 86 C80 84 72 82 64 86 C50 92 22 92 14 80Z', m);
    fp(c, 'M40 70 L30 88 L50 84Z', mixHex(m, '#000', 0.1), 2.4);
    eye(c, 58, 38, 3);
    dot(c, 70, 44, 2.4, INK);
    sp(c, 'M70 48 L84 46 M70 50 L84 52', 1.2);
  },
  coral({ c, m }) {
    const br = 'M50 92 L50 60 M50 70 L32 52 L30 30 M32 52 L18 44 M50 60 L66 40 L64 20 M66 40 L82 32 M50 76 L72 66 L80 52';
    sp(c, br, 13);
    sp(c, br, 8.5, m);
  },
  shell({ c, m }) {
    fp(c, 'M50 88 L40 80 C14 70 10 40 22 26 C34 12 66 12 78 26 C90 40 86 70 60 80Z', m);
    for (const x of [24, 36, 50, 64, 76]) sp(c, `M50 84 L${x} 22`, 1.6, mixHex(m, '#000', 0.3));
  },
  ray({ c, m }) {
    sp(c, 'M50 70 C52 82 60 90 70 96', 3);
    fp(c, 'M50 20 C60 26 70 34 92 50 C70 56 60 66 50 74 C40 66 30 56 8 50 C30 34 40 26 50 20Z', m);
    eye(c, 44, 38, 1.8);
    eye(c, 56, 38, 1.8);
  },
  bug({ c, m, s }) {
    const dk = s || INK;
    for (let i = 0; i < 3; i++) {
      sp(c, `M40 ${46 + i * 12} L22 ${40 + i * 14}`, 3);
      sp(c, `M60 ${46 + i * 12} L78 ${40 + i * 14}`, 3);
    }
    el(c, 50, 28, 12, 10);
    fill(c, dk);
    el(c, 50, 58, 26, 28);
    fill(c, m);
    sp(c, 'M50 32 L50 86', 2.4);
    if (s) for (const [x, y] of [[40, 50], [60, 50], [38, 68], [62, 68]]) dot(c, x, y, 4.2, dk);
    shine(c, 40, 44, 4, 8, 0.4, 0.3);
  },
  bee({ c, m, s }) {
    c.save();
    c.globalAlpha = 0.8;
    el(c, 38, 30, 12, 16, -0.4);
    fill(c, '#e8f4fa', 2.2);
    el(c, 62, 30, 12, 16, 0.4);
    fill(c, '#e8f4fa', 2.2);
    c.restore();
    el(c, 50, 58, 30, 22);
    fill(c, m);
    c.save();
    el(c, 50, 58, 30, 22);
    c.clip();
    c.fillStyle = s || '#1e1a1a';
    c.fillRect(42, 30, 8, 60);
    c.fillRect(60, 30, 8, 60);
    c.restore();
    el(c, 50, 58, 30, 22);
    ink(c);
    eye(c, 28, 54, 2.6);
  },
  butterfly({ c, m, s }) {
    const dk = s || INK;
    fp(c, 'M48 44 C30 14 8 18 10 38 C12 52 30 54 46 50Z', m);
    fp(c, 'M52 44 C70 14 92 18 90 38 C88 52 70 54 54 50Z', m);
    fp(c, 'M46 52 C30 56 18 70 26 82 C34 90 44 74 48 58Z', m);
    fp(c, 'M54 52 C70 56 82 70 74 82 C66 90 56 74 52 58Z', m);
    if (s) for (const [x, y] of [[20, 30], [80, 30], [30, 76], [70, 76]]) dot(c, x, y, 4, dk);
    rr(c, 46, 30, 8, 52, 4);
    fill(c, INK, 0);
    sp(c, 'M48 32 L40 16 M52 32 L60 16', 2);
  },
  caterpillar({ c, m }) {
    for (let i = 5; i >= 0; i--) {
      const x = 18 + i * 13;
      const y = 60 + Math.sin(i * 1.3) * 6;
      el(c, x, y, 11, 11);
      fill(c, m, 2.6);
    }
    eye(c, 14, 54);
    eye(c, 22, 54);
    sp(c, 'M14 48 L10 38 M22 48 L26 38', 2);
  },
  snail({ c, m, s }) {
    fp(c, 'M8 82 C20 72 40 70 80 76 C86 76 92 80 92 86 L10 88Z', s || '#c8b48a');
    sp(c, 'M84 76 L88 60 M90 78 L96 62', 2.2);
    el(c, 50, 54, 28, 28);
    fill(c, m);
    sp(c, 'M50 54 m-3 0 a3 3 0 1 1 6 0 a8 8 0 1 1 -16 0 a13 13 0 1 1 26 0 a18 18 0 1 1 -36 0', 2, mixHex(m, '#000', 0.35));
  },
  spider({ c, m }) {
    for (let i = 0; i < 4; i++) {
      sp(c, `M44 ${50 + i * 4} Q24 ${30 + i * 12} 10 ${40 + i * 14}`, 4, m);
      sp(c, `M56 ${50 + i * 4} Q76 ${30 + i * 12} 90 ${40 + i * 14}`, 4, m);
    }
    el(c, 50, 64, 18, 20);
    fill(c, m);
    el(c, 50, 40, 12, 11);
    fill(c, m);
    dot(c, 46, 36, 2, '#fff');
    dot(c, 54, 36, 2, '#fff');
  },
  frog({ c, m, s }) {
    el(c, 50, 64, 34, 24);
    fill(c, m);
    for (const x of [34, 66]) {
      el(c, x, 36, 11, 11);
      fill(c, m);
      eye(c, x, 36, 4.4);
    }
    sp(c, 'M30 62 Q50 74 70 62', 2.4);
    el(c, 18, 84, 12, 6);
    fill(c, m, 2.4);
    el(c, 82, 84, 12, 6);
    fill(c, m, 2.4);
    if (s) for (const [x, y] of [[40, 76], [58, 80], [70, 70]]) dot(c, x, y, 3.4, s);
  },
  lizard({ c, m, s }) {
    sp(c, 'M72 54 C88 58 96 74 86 84', 9);
    sp(c, 'M72 54 C88 58 96 74 86 84', 5, m);
    for (const [x1, y1, x2, y2] of [[34, 58, 24, 76], [62, 58, 72, 76], [34, 46, 22, 32], [62, 46, 74, 32]]) {
      sp(c, `M${x1} ${y1} L${x2} ${y2}`, 8);
      sp(c, `M${x1} ${y1} L${x2} ${y2}`, 4.4, m);
    }
    el(c, 48, 52, 26, 11);
    fill(c, m);
    el(c, 16, 50, 12, 9);
    fill(c, m);
    eye(c, 14, 46, 2);
    if (s) for (const x of [36, 48, 60]) dot(c, x, 50, 3.4, s);
  },
  croc({ c, m }) {
    fp(c, 'M4 52 C4 44 30 42 40 44 C60 40 80 44 96 56 C80 64 60 64 40 62 C30 64 4 62 4 52Z', m);
    sp(c, 'M4 54 L36 54', 1.6);
    for (const x of [46, 56, 66, 76]) fp(c, `M${x} 46 l4 -6 l4 6Z`, m, 1.8);
    for (const x of [44, 70]) {
      sp(c, `M${x} 62 L${x - 4} 74`, 7);
      sp(c, `M${x} 62 L${x - 4} 74`, 3.6, m);
    }
    eye(c, 30, 44, 2.2);
  },
  snake({ c, m, s }) {
    const d = 'M88 30 C70 20 50 26 50 40 C50 54 80 52 80 68 C80 84 50 88 24 80 C14 76 10 72 8 66';
    sp(c, d, 16);
    sp(c, d, 11, m);
    if (s) {
      c.save();
      c.setLineDash([5, 9]);
      sp(c, d, 11, s);
      c.restore();
    }
    el(c, 88, 30, 9, 7, -0.2);
    fill(c, m, 2.6);
    eye(c, 90, 27, 1.8);
  },
  /* ---------- flores e plantas ---------- */
  rose({ c, m, s }) {
    stem(c, 50, 92, s || '#3e7d2a', -26);
    sp(c, 'M50 92 L50 66', 6);
    sp(c, 'M50 92 L50 66', 3, s || '#3e7d2a');
    leafSmall(c, 50, 80, -0.4, s || '#3e7d2a');
    fp(c, 'M22 38 C22 60 38 70 50 70 C62 70 78 60 78 38 C70 44 60 40 50 46 C40 40 30 44 22 38Z', m);
    fp(c, 'M30 34 C30 18 46 12 50 12 C58 12 72 20 70 36 C64 46 36 46 30 34Z', m);
    sp(c, 'M40 28 C44 20 56 20 60 28 C58 36 44 36 42 30', 1.8, mixHex(m, '#000', 0.35));
  },
  flower({ c, m, s }) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      el(c, 50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24, 16, 10, a);
      fill(c, m, 2.6);
    }
    el(c, 50, 50, 13, 13);
    fill(c, s || '#f2c21e', 2.6);
  },
  tulip({ c, m, s }) {
    sp(c, 'M50 92 L50 60', 6);
    sp(c, 'M50 92 L50 60', 3, s || '#3e8e2a');
    fp(c, 'M50 92 C40 84 30 72 30 60 C40 66 46 76 50 92Z', s || '#3e8e2a', 2.4);
    fp(c, 'M26 22 L36 34 L44 18 L50 30 L56 18 L64 34 L74 22 C78 48 66 64 50 64 C34 64 22 48 26 22Z', m);
    shine(c, 38, 42, 3, 10, 0.2);
  },
  spike({ c, m, s }) {
    sp(c, 'M50 92 L50 30', 5);
    sp(c, 'M50 92 L50 30', 2.6, s || '#5a8a3a');
    for (let i = 0; i < 9; i++) {
      const y = 14 + i * 7;
      const w = 6 + Math.min(i, 5) * 1.6;
      el(c, 50 - w * 0.6, y, w * 0.6, 4.6, -0.3);
      fill(c, m, 1.8);
      el(c, 50 + w * 0.6, y, w * 0.6, 4.6, 0.3);
      fill(c, m, 1.8);
    }
  },
  cluster({ c, m, s }) {
    leafSmall(c, 26, 74, 2.6, s || '#3e7d2a', 1.3);
    leafSmall(c, 74, 74, 0.5, s || '#3e7d2a', 1.3);
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4;
      const r = Math.sqrt(i) * 6.2;
      el(c, 50 + Math.cos(a) * r, 48 + Math.sin(a) * r * 0.9, 7, 7);
      fill(c, m, 1.8);
    }
  },
  pad({ c, m }) {
    fp(c, 'M50 52 L84 30 C96 52 88 86 50 88 C14 88 4 56 18 32 C30 16 62 12 74 22Z', m);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      sp(c, `M50 52 L${50 + Math.cos(a) * 30} ${54 + Math.sin(a) * 26}`, 1.4, mixHex(m, '#fff', 0.3));
    }
  },
  grass({ c, m }) {
    for (let i = 0; i < 9; i++) {
      const x = 14 + i * 9;
      const h = 40 + ((i * 37) % 30);
      fp(c, `M${x - 5} 92 Q${x} ${92 - h * 0.5} ${x + (i % 2 ? 8 : -6)} ${92 - h} Q${x + 2} ${92 - h * 0.5} ${x + 5} 92Z`, m, 2.2);
    }
  },
  cactus({ c, m, s }) {
    rr(c, 36, 12, 28, 80, 14);
    fill(c, m);
    fp(c, 'M36 56 L24 56 C18 56 16 52 16 46 L16 30 C16 24 26 24 26 30 L26 46 L36 46Z', m);
    fp(c, 'M64 46 L74 46 L74 24 C74 18 84 18 84 24 L84 50 C84 56 80 58 76 58 L64 58Z', m);
    sp(c, 'M50 18 L50 88', 1.6, mixHex(m, '#000', 0.3));
    if (s) {
      el(c, 50, 12, 8, 6);
      fill(c, s, 2.2);
    }
  },
  pine({ c, m, s }) {
    rr(c, 44, 76, 12, 16, 2);
    fill(c, s || '#6b4a2e');
    poly(c, 50, 8, 70, 36, 62, 36, 80, 58, 70, 58, 88, 80, 12, 80, 30, 58, 20, 58, 38, 36, 30, 36);
    fill(c, m);
  },
  tree({ c, m, s }) {
    rr(c, 42, 56, 16, 36, 3);
    fill(c, s || '#6b4a2e');
    for (const [x, y, r] of [[30, 48, 20], [70, 48, 20], [50, 30, 24], [50, 54, 22]]) {
      el(c, x, y, r, r * 0.9);
      fill(c, m, 2.8);
    }
  },
  log({ c, m, s }) {
    rr(c, 14, 30, 64, 44, 6);
    fill(c, m);
    sp(c, 'M24 40 L60 40 M20 52 L70 52 M28 64 L66 64', 1.8, mixHex(m, '#000', 0.35));
    el(c, 78, 52, 12, 22);
    fill(c, s || '#e8cfa0');
    sp(c, 'M78 52 m-3 0 a3 6 0 1 1 6 0 a7 13 0 1 1 -14 0', 1.4, mixHex(s || '#e8cfa0', '#000', 0.35));
  },
  plank({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.3);
    rr(c, -42, -16, 84, 32, 3);
    fill(c, m);
    sp(c, 'M-36 -6 C-10 -10 10 0 36 -6 M-36 6 C-14 2 6 12 36 4', 1.4, mixHex(m, '#000', 0.3));
    el(c, 10, 0, 5, 2.6);
    ink(c, 1.2);
    c.restore();
  },
  clover({ c, m }) {
    sp(c, 'M50 52 Q52 76 62 92', 4);
    sp(c, 'M50 52 Q52 76 62 92', 2, m);
    for (const a of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
      c.save();
      c.translate(50, 50);
      c.rotate(a + Math.PI / 2);
      fp(c, 'M0 0 C-22 -10 -22 -36 -8 -36 C-2 -36 0 -30 0 -26 C0 -30 2 -36 8 -36 C22 -36 22 -10 0 0Z', m, 2.6);
      c.restore();
    }
  },
  palm({ c, m }) {
    sp(c, 'M50 90 C50 70 48 50 50 40', 4);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI + 0.2 + (i / 8) * (Math.PI - 0.4);
      const x = 50 + Math.cos(a) * 42;
      const y = 44 + Math.sin(a) * 36;
      fp(c, `M50 44 Q${(50 + x) / 2 - 4} ${(44 + y) / 2 - 8} ${x} ${y} Q${(50 + x) / 2 + 4} ${(44 + y) / 2 + 4} 50 44Z`, m, 2.2);
    }
  },
  cone({ c, m, s }) {
    rr(c, 14, 82, 72, 10, 3);
    fill(c, m);
    fp(c, 'M42 10 L58 10 L76 84 L24 84Z', m);
    fp(c, 'M38 30 L62 30 L66 46 L34 46Z', s || '#f6f6f2', 2.2);
    fp(c, 'M31 58 L69 58 L72 70 L28 70Z', s || '#f6f6f2', 2.2);
  },
  /* ---------- natureza ---------- */
  lava({ c, m }) {
    rr(c, 8, 12, 84, 80, 14);
    fill(c, m);
    c.save();
    rr(c, 8, 12, 84, 80, 14);
    c.clip();
    c.globalAlpha = 0.5;
    for (const [x, y, r] of [[26, 30, 8], [64, 26, 10], [44, 54, 12], [76, 64, 8], [24, 76, 10]]) {
      el(c, x, y, r, r * 0.7);
      c.fillStyle = mixHex(m, '#ffe680', 0.55);
      c.fill();
    }
    c.globalAlpha = 0.6;
    sp(c, 'M8 46 C30 40 40 50 60 42 C76 36 84 44 92 40 M8 70 C24 62 46 74 92 64', 4, mixHex(m, '#2a0a0a', 0.6));
    c.restore();
  },
  fire({ c, m, s }) {
    fp(c, 'M50 92 C26 92 16 74 20 56 C24 42 34 36 34 22 C44 30 46 40 46 46 C50 36 56 24 54 8 C70 22 84 44 82 64 C80 82 68 92 50 92Z', m);
    fp(c, 'M50 88 C38 88 34 78 36 70 C38 62 44 58 46 50 C52 58 62 64 62 74 C62 84 56 88 50 88Z', s || mixHex(m, '#fff3a0', 0.6), 0);
  },
  rock({ c, m }) {
    fp(c, 'M14 76 L22 44 L42 26 L66 30 L84 48 L88 74 L70 88 L30 88Z', m);
    sp(c, 'M42 26 L48 54 L22 44 M48 54 L84 48 M48 54 L56 88', 1.8, mixHex(m, '#000', 0.25));
    shine(c, 40, 40, 8, 4, -0.6, 0.18);
  },
  snow({ c, m }) {
    for (let i = 0; i < 6; i++) {
      c.save();
      c.translate(50, 52);
      c.rotate((i / 6) * TAU);
      sp(c, 'M0 0 L0 -40 M0 -24 L-10 -34 M0 -24 L10 -34 M0 -12 L-8 -18 M0 -12 L8 -18', 9);
      sp(c, 'M0 0 L0 -40 M0 -24 L-10 -34 M0 -24 L10 -34 M0 -12 L-8 -18 M0 -12 L8 -18', 5, m);
      c.restore();
    }
  },
  icecube({ c, m }) {
    fp(c, 'M20 36 L50 22 L82 34 L82 70 L52 86 L20 72Z', m);
    fp(c, 'M20 36 L50 22 L82 34 L52 48Z', mixHex(m, '#fff', 0.4), 2.6);
    sp(c, 'M52 48 L52 86', 2.6);
    shine(c, 34, 56, 3, 10, 0.2, 0.5);
  },
  sea({ c, m }) {
    rr(c, 8, 12, 84, 80, 14);
    fill(c, m);
    c.save();
    rr(c, 8, 12, 84, 80, 14);
    c.clip();
    for (let r = 0; r < 4; r++) {
      const y = 28 + r * 18;
      sp(c, `M0 ${y} q8 -6 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0`, 2.4, mixHex(m, '#fff', 0.45));
    }
    c.restore();
  },
  puddle({ c, m }) {
    fp(c, 'M12 60 C8 44 30 40 40 44 C52 30 82 34 86 50 C96 60 84 76 66 74 C54 84 30 82 22 74 C14 72 12 66 12 60Z', m);
    shine(c, 40, 52, 10, 3, -0.1, 0.25);
  },
  dune({ c, m }) {
    rr(c, 8, 12, 84, 80, 14);
    c.save();
    c.clip();
    c.fillStyle = mixHex(m, '#ffffff', 0.55);
    c.fillRect(0, 0, 100, 100);
    fp(c, 'M0 60 C20 36 40 34 60 50 C74 40 88 38 100 46 L100 100 L0 100Z', m, 2.6);
    fp(c, 'M0 80 C24 64 50 66 70 78 C84 70 94 70 100 72 L100 100 L0 100Z', mixHex(m, '#000', 0.06), 2.2);
    c.restore();
    rr(c, 8, 12, 84, 80, 14);
    ink(c);
  },
  sky({ c, m }) {
    rr(c, 8, 12, 84, 80, 14);
    fill(c, m);
    c.save();
    rr(c, 8, 12, 84, 80, 14);
    c.clip();
    const dk = lightness(m) < 30;
    if (dk) for (const [x, y] of [[24, 26], [70, 22], [50, 44], [80, 50], [30, 60], [60, 70]]) dot(c, x, y, 1.4, '#fff');
    fp(c, 'M0 84 C20 76 36 78 50 82 C66 74 84 76 100 80 L100 100 L0 100Z', mixHex(m, '#1a1530', 0.75), 0);
    c.restore();
    rr(c, 8, 12, 84, 80, 14);
    ink(c);
  },
  mountain({ c, m, s }) {
    fp(c, 'M4 88 L36 26 L52 52 L66 34 L96 88Z', m);
    if (s) fp(c, 'M36 26 L44 42 L38 40 L32 46 L28 42Z', s, 2);
    sp(c, 'M36 26 L44 88', 1.4, mixHex(m, '#000', 0.25));
  },
  bolt({ c, m }) {
    poly(c, 56, 6, 22, 56, 46, 56, 38, 94, 78, 40, 54, 40, 66, 6);
    fill(c, m);
  },
  sun({ c, m }) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      c.save();
      c.translate(50, 52);
      c.rotate(a);
      fp(c, 'M-6 -30 L0 -46 L6 -30Z', m, 2.2);
      c.restore();
    }
    el(c, 50, 52, 28, 28);
    fill(c, m);
  },
  moon({ c, m }) {
    el(c, 50, 52, 36, 36);
    fill(c, m);
    for (const [x, y, r] of [[38, 40, 7], [60, 60, 9], [62, 34, 4], [36, 66, 4]]) {
      el(c, x, y, r, r);
      c.fillStyle = mixHex(m, '#000', 0.12);
      c.fill();
    }
  },
  planet({ c, m, s }) {
    el(c, 50, 52, 30, 30);
    fill(c, m);
    c.save();
    el(c, 50, 52, 30, 30);
    c.clip();
    if (s) for (const [x, y, r] of [[38, 40, 10], [64, 62, 12], [60, 30, 6]]) {
      el(c, x, y, r, r * 0.7);
      c.fillStyle = s;
      c.fill();
    }
    else for (const y of [40, 52, 62]) sp(c, `M10 ${y} Q50 ${y + 6} 90 ${y}`, 3, mixHex(m, '#000', 0.12));
    c.restore();
    el(c, 50, 52, 30, 30);
    ink(c);
  },
  ringed({ c, m }) {
    el(c, 50, 52, 46, 12, -0.25);
    ink(c, 6);
    el(c, 50, 52, 46, 12, -0.25);
    c.lineWidth = 3;
    c.strokeStyle = mixHex(m, '#fff', 0.3);
    c.stroke();
    el(c, 50, 52, 26, 26);
    fill(c, m);
    c.save();
    c.beginPath();
    c.rect(0, 52, 100, 50);
    c.clip();
    el(c, 50, 52, 46, 12, -0.25);
    ink(c, 6);
    el(c, 50, 52, 46, 12, -0.25);
    c.lineWidth = 3;
    c.strokeStyle = mixHex(m, '#fff', 0.3);
    c.stroke();
    c.restore();
  },
  /* ---------- lugares ---------- */
  house({ c, m, s }) {
    rr(c, 18, 44, 64, 46, 2);
    fill(c, m);
    poly(c, 10, 46, 50, 12, 90, 46);
    fill(c, s || '#b5532e');
    rr(c, 44, 64, 14, 26, 2);
    fill(c, mixHex(m, '#2a1a10', 0.6), 2.4);
    rr(c, 24, 54, 12, 12, 2);
    fill(c, '#bfe3f2', 2.4);
    rr(c, 64, 54, 12, 12, 2);
    fill(c, '#bfe3f2', 2.4);
  },
  bricks({ c, m, s }) {
    rr(c, 8, 12, 84, 80, 6);
    fill(c, s || '#cfc8bc');
    c.save();
    rr(c, 8, 12, 84, 80, 6);
    c.clip();
    for (let r = 0; r < 6; r++)
      for (let i = -1; i < 5; i++) {
        rr(c, 8 + i * 22 + (r % 2) * 11 + 1.5, 12 + r * 14 + 1.5, 19, 11, 1.5);
        fill(c, m, 0);
      }
    c.restore();
    rr(c, 8, 12, 84, 80, 6);
    ink(c);
  },
  road({ c, m, s }) {
    rr(c, 8, 12, 84, 80, 14);
    fill(c, m);
    c.save();
    rr(c, 8, 12, 84, 80, 14);
    c.clip();
    c.setLineDash([10, 10]);
    sp(c, 'M50 12 L50 92', 4, s || '#f2f2ea');
    c.restore();
  },
  field({ c, m, s }) {
    rr(c, 8, 12, 84, 80, 10);
    fill(c, m);
    sp(c, 'M14 18 L86 18 L86 86 L14 86Z M50 18 L50 86', 2.6, s || '#f6f6f0');
    el(c, 50, 52, 12, 12);
    ink(c, 2.6);
    el(c, 50, 52, 12, 12);
    c.lineWidth = 2.6;
    c.strokeStyle = s || '#f6f6f0';
    c.stroke();
  },
  door({ c, m, s }) {
    rr(c, 24, 8, 52, 86, 4);
    fill(c, m);
    rr(c, 32, 16, 36, 30, 2);
    ink(c, 1.8);
    rr(c, 32, 54, 36, 32, 2);
    ink(c, 1.8);
    el(c, 66, 52, 3.4, 3.4);
    fill(c, s || '#d4af37', 1.6);
  },
  fence({ c, m }) {
    rr(c, 6, 40, 88, 8, 2);
    fill(c, m, 2.4);
    rr(c, 6, 66, 88, 8, 2);
    fill(c, m, 2.4);
    for (let i = 0; i < 6; i++) fp(c, `M${10 + i * 14} 92 L${10 + i * 14} 26 L${16 + i * 14} 18 L${22 + i * 14} 26 L${22 + i * 14} 92Z`, m, 2.4);
  },
  tent({ c, m, s }) {
    fp(c, 'M6 86 L50 14 L94 86Z', m);
    fp(c, 'M40 86 L50 50 L60 86Z', s || mixHex(m, '#000', 0.4), 2.4);
    sp(c, 'M50 14 L50 6', 2.6);
  },
  /* ---------- pedras e materiais ---------- */
  gem({ c, m }) {
    poly(c, 26, 22, 74, 22, 92, 42, 50, 92, 8, 42);
    fill(c, m);
    sp(c, 'M8 42 L92 42 M26 22 L38 42 L50 22 L62 42 L74 22 M38 42 L50 92 L62 42', 1.6, mixHex(m, '#fff', 0.4));
    poly(c, 26, 22, 74, 22, 92, 42, 50, 92, 8, 42);
    ink(c);
    shine(c, 36, 30, 5, 3, -0.4, 0.5);
  },
  crystal({ c, m }) {
    for (const [x, h, w, r] of [[30, 54, 12, -0.35], [70, 58, 12, 0.35], [50, 76, 16, 0]]) {
      c.save();
      c.translate(x, 88);
      c.rotate(r);
      poly(c, -w, 0, -w, -h + w, 0, -h, w, -h + w, w, 0);
      fill(c, m, 2.6);
      sp(c, `M0 0 L0 ${-h}`, 1.4, mixHex(m, '#fff', 0.45));
      c.restore();
    }
  },
  pebble({ c, m }) {
    el(c, 50, 54, 36, 28);
    fill(c, m);
    shine(c, 38, 42, 12, 5, -0.3, 0.35);
  },
  ingot({ c, m }) {
    fp(c, 'M10 74 L22 46 L78 46 L90 74Z', m);
    fp(c, 'M22 46 L30 30 L70 30 L78 46Z', mixHex(m, '#fff', 0.25), 2.6);
    shine(c, 40, 38, 12, 2.4, 0, 0.45);
  },
  fabric({ c, m }) {
    fp(c, 'M12 22 C30 16 44 28 60 20 C72 14 84 18 88 22 L88 78 C76 74 64 86 50 80 C34 72 24 84 12 80Z', m);
    sp(c, 'M30 24 C34 46 28 64 32 80 M64 22 C60 44 68 62 62 82', 1.8, mixHex(m, '#000', 0.2));
  },
  box({ c, m }) {
    fp(c, 'M16 38 L50 26 L84 38 L84 78 L50 92 L16 78Z', m);
    sp(c, 'M16 38 L50 50 L84 38 M50 50 L50 92', 2.6);
    fp(c, 'M30 33 L64 45 L64 52 L30 40Z', mixHex(m, '#fff', 0.2), 1.4);
  },
  /* ---------- veículos ---------- */
  car({ c, m, s }) {
    fp(c, 'M8 66 L10 50 C12 46 22 44 28 44 L36 30 C38 27 42 26 46 26 L66 26 C70 26 74 28 76 32 L82 44 C90 46 94 50 94 58 L94 66Z', m);
    fp(c, 'M40 32 L46 32 L46 44 L34 44Z M52 32 L66 32 C68 32 70 33 71 35 L75 44 L52 44Z', '#bfe3f2', 2.2);
    for (const x of [28, 74]) {
      el(c, x, 68, 10, 10);
      fill(c, INK, 0);
      el(c, x, 68, 4.4, 4.4);
      fill(c, s || '#cfcfd4', 0);
    }
    shine(c, 30, 52, 12, 2, 0, 0.3);
  },
  bus({ c, m }) {
    rr(c, 6, 24, 88, 48, 8);
    fill(c, m);
    for (let i = 0; i < 4; i++) {
      rr(c, 12 + i * 19, 32, 14, 14, 2);
      fill(c, '#bfe3f2', 2.2);
    }
    rr(c, 84, 32, 8, 22, 2);
    fill(c, '#bfe3f2', 2.2);
    sp(c, 'M6 58 L94 58', 2, mixHex(m, '#000', 0.3));
    for (const x of [24, 76]) {
      el(c, x, 74, 9, 9);
      fill(c, INK, 0);
      dot(c, x, 74, 3.6, '#cfcfd4');
    }
  },
  truck({ c, m }) {
    rr(c, 6, 28, 56, 40, 4);
    fill(c, m);
    fp(c, 'M62 40 L80 40 L92 54 L92 68 L62 68Z', m);
    fp(c, 'M66 44 L78 44 L86 54 L66 54Z', '#bfe3f2', 2.2);
    for (const x of [22, 44, 78]) {
      el(c, x, 72, 9, 9);
      fill(c, INK, 0);
      dot(c, x, 72, 3.6, '#cfcfd4');
    }
  },
  tractor({ c, m }) {
    rr(c, 28, 42, 50, 22, 4);
    fill(c, m);
    rr(c, 46, 18, 26, 30, 3);
    fill(c, m);
    rr(c, 51, 23, 16, 14, 2);
    fill(c, '#bfe3f2', 2.2);
    rr(c, 30, 30, 5, 14, 2);
    fill(c, INK, 0);
    el(c, 64, 70, 20, 20);
    fill(c, INK, 0);
    el(c, 64, 70, 9, 9);
    fill(c, m, 0);
    el(c, 24, 76, 12, 12);
    fill(c, INK, 0);
    el(c, 24, 76, 5, 5);
    fill(c, m, 0);
  },
  bike({ c, m }) {
    for (const x of [24, 76]) {
      el(c, x, 66, 16, 16);
      ink(c, 4);
    }
    const fr = 'M24 66 L42 40 L66 40 L76 66 M42 40 L50 66 L66 40 M50 66 L24 66 M38 32 L48 32 M66 40 L62 28 L72 26';
    sp(c, fr, 13);
    sp(c, fr, 8.5, m);
  },
  plane({ c, m, s }) {
    fp(c, 'M40 46 L24 14 L34 14 L60 46Z', m);
    fp(c, 'M40 58 L24 90 L34 90 L60 58Z', m);
    fp(c, 'M8 52 C8 44 20 44 30 44 L82 44 C92 44 96 48 96 52 C96 56 92 60 82 60 L30 60 C20 60 8 60 8 52Z', m);
    fp(c, 'M10 52 L4 34 L14 34 L22 46Z', m, 2.4);
    if (s) sp(c, 'M30 52 L80 52', 3, s);
    rr(c, 82, 46, 8, 5, 2);
    fill(c, '#bfe3f2', 1.6);
  },
  heli({ c, m }) {
    sp(c, 'M14 18 L86 18', 4);
    sp(c, 'M50 18 L50 30', 4);
    fp(c, 'M70 50 L94 46 L96 38 L100 38 L98 58 L94 56 L70 60Z', m, 2.4);
    el(c, 46, 50, 28, 20);
    fill(c, m);
    fp(c, 'M24 44 C26 36 34 32 44 32 L44 52 L22 52Z', '#bfe3f2', 2.2);
    sp(c, 'M28 76 L72 76 M36 70 L34 76 M62 70 L64 76', 3);
  },
  boat({ c, m, s }) {
    sp(c, 'M48 66 L48 10', 3);
    fp(c, 'M50 14 L80 56 L50 56Z', s || '#f4f2ec', 2.4);
    fp(c, 'M6 58 L94 58 L80 84 L18 84Z', m);
    sp(c, 'M12 66 L88 66', 1.8, mixHex(m, '#fff', 0.4));
  },
  balloon({ c, m }) {
    sp(c, 'M50 72 C46 80 54 86 50 96', 2);
    fp(c, 'M50 8 C30 8 18 24 18 40 C18 58 38 70 50 72 C62 70 82 58 82 40 C82 24 70 8 50 8Z', m);
    fp(c, 'M46 72 L54 72 L52 78 L48 78Z', m, 1.8);
    shine(c, 36, 28, 6, 10, 0.5, 0.45);
  },
  /* ---------- roupas e acessórios ---------- */
  shirt({ c, m }) {
    fp(c, 'M34 14 C40 20 60 20 66 14 L90 28 L82 46 L72 42 L72 90 L28 90 L28 42 L18 46 L10 28Z', m);
    sp(c, 'M34 14 C40 24 60 24 66 14', 2, mixHex(m, '#000', 0.25));
  },
  pants({ c, m }) {
    fp(c, 'M24 12 L76 12 L84 92 L58 92 L50 38 L42 92 L16 92Z', m);
    sp(c, 'M24 20 L76 20 M50 20 L50 38', 1.6, mixHex(m, '#000', 0.3));
  },
  dress({ c, m }) {
    fp(c, 'M38 8 L44 8 C46 14 54 14 56 8 L62 8 L64 30 C60 34 58 38 58 40 L88 90 L12 90 L42 40 C42 38 40 34 36 30Z', m);
    sp(c, 'M38 38 L62 38', 2, mixHex(m, '#000', 0.25));
  },
  sock({ c, m, s }) {
    fp(c, 'M30 8 L58 8 L58 56 L80 70 C90 76 86 92 74 90 L40 82 C32 80 30 74 30 66Z', m);
    if (s) {
      rr(c, 30, 8, 28, 10, 2);
      fill(c, s, 2.4);
    }
  },
  glove({ c, m }) {
    fp(c, 'M26 92 L26 58 C26 44 30 38 38 36 L38 22 C38 12 50 12 50 22 L50 34 L54 34 L54 18 C54 8 66 8 66 18 L66 40 C72 34 82 36 80 46 L70 62 L70 92Z', m);
    rr(c, 24, 80, 48, 12, 3);
    fill(c, mixHex(m, '#fff', 0.2), 2.4);
  },
  hat({ c, m, s }) {
    el(c, 50, 70, 46, 12);
    fill(c, m);
    fp(c, 'M26 70 C26 40 30 26 50 26 C70 26 74 40 74 70 C60 76 40 76 26 70Z', m);
    fp(c, 'M27 58 C42 62 58 62 73 58 L74 66 C58 70 42 70 26 66Z', s || mixHex(m, '#000', 0.4), 2);
  },
  beanie({ c, m }) {
    el(c, 50, 16, 9, 9);
    fill(c, m);
    fp(c, 'M16 70 C16 36 30 22 50 22 C70 22 84 36 84 70Z', m);
    rr(c, 12, 64, 76, 20, 6);
    fill(c, mixHex(m, '#000', 0.06));
    for (let x = 20; x < 84; x += 8) sp(c, `M${x} 66 L${x} 82`, 1.4, mixHex(m, '#000', 0.3));
  },
  cap({ c, m, s }) {
    fp(c, 'M54 66 C70 62 92 66 96 72 C80 78 64 76 52 72Z', s || mixHex(m, '#000', 0.12));
    fp(c, 'M14 68 C14 36 30 24 50 24 C70 24 82 40 82 66 C60 72 30 72 14 68Z', m);
    dot(c, 50, 24, 3.4, INK);
    sp(c, 'M50 26 C42 40 40 56 42 70', 1.6, mixHex(m, '#000', 0.3));
  },
  tie({ c, m }) {
    fp(c, 'M42 10 L58 10 L54 22 L46 22Z', m);
    fp(c, 'M46 22 L54 22 L66 74 L50 92 L34 74Z', m);
    sp(c, 'M44 40 L60 34 M40 58 L64 48', 2, mixHex(m, '#fff', 0.3));
  },
  bowtie({ c, m }) {
    fp(c, 'M50 52 L12 30 C6 40 6 64 12 74Z', m);
    fp(c, 'M50 52 L88 30 C94 40 94 64 88 74Z', m);
    rr(c, 42, 42, 16, 20, 5);
    fill(c, mixHex(m, '#000', 0.12));
  },
  scarf({ c, m, s }) {
    fp(c, 'M14 30 C30 18 70 18 86 30 L86 44 C70 34 30 34 14 44Z', m);
    fp(c, 'M58 38 L74 40 L80 88 L62 90Z', m);
    if (s) sp(c, 'M62 80 L80 78 M60 70 L78 68', 3, s);
    sp(c, 'M64 90 L64 96 M70 90 L70 96 M76 89 L76 95', 2.4, m);
  },
  shoe({ c, m, s }) {
    fp(c, 'M8 76 L8 52 C8 44 14 40 22 40 L40 40 C48 50 60 54 74 58 C88 60 94 66 94 76Z', m);
    rr(c, 6, 74, 90, 10, 4);
    fill(c, s || '#f2f0ea');
    sp(c, 'M34 46 L46 52 M38 42 L50 48', 2, mixHex(m, '#fff', 0.4));
  },
  boot({ c, m, s }) {
    fp(c, 'M24 8 L58 8 L60 56 C76 60 90 64 92 76 L92 82 L22 82 C20 60 24 30 24 8Z', m);
    rr(c, 20, 80, 74, 10, 3);
    fill(c, s || mixHex(m, '#000', 0.5));
    shine(c, 34, 30, 3, 14, 0, 0.3);
  },
  glasses({ c, m }) {
    sp(c, 'M40 46 Q50 38 60 46 M10 40 L4 34 M90 40 L96 34', 3.4);
    for (const x of [26, 74]) {
      el(c, x, 50, 20, 15);
      fill(c, m, 4);
      shine(c, x - 6, 44, 6, 3, -0.4, 0.35);
    }
  },
  bag({ c, m, s }) {
    sp(c, 'M32 40 C32 14 68 14 68 40', 7);
    sp(c, 'M32 40 C32 14 68 14 68 40', 3.4, s || m);
    rr(c, 14, 36, 72, 54, 10);
    fill(c, m);
    rr(c, 14, 36, 72, 18, 8);
    fill(c, mixHex(m, '#000', 0.1), 2.4);
    rr(c, 44, 48, 12, 10, 2);
    fill(c, s || '#d4af37', 2);
  },
  umbrella({ c, m }) {
    sp(c, 'M50 48 L50 84 C50 92 40 92 40 86', 3.4);
    fp(c, 'M6 50 C10 22 30 12 50 12 C70 12 90 22 94 50 C86 44 78 44 72 50 C66 44 56 44 50 50 C44 44 34 44 28 50 C22 44 14 44 6 50Z', m);
    sp(c, 'M50 12 C40 22 30 36 28 50 M50 12 C60 22 70 36 72 50', 1.6, mixHex(m, '#000', 0.3));
  },
  /* ---------- esporte / música / brinquedos ---------- */
  football({ c, m, s }) {
    el(c, 50, 52, 40, 24, -0.4);
    fill(c, m);
    c.save();
    c.translate(50, 52);
    c.rotate(-0.4);
    sp(c, 'M-14 0 L14 0 M-10 -4 L-10 4 M-3 -4 L-3 4 M4 -4 L4 4 M11 -4 L11 4', 2, s || '#fff');
    c.restore();
  },
  paddle({ c, m }) {
    rr(c, 44, 60, 12, 32, 4);
    fill(c, '#c8a06a');
    el(c, 50, 40, 30, 30);
    fill(c, m);
    shine(c, 40, 30, 8, 4, -0.5, 0.25);
  },
  boxglove({ c, m }) {
    fp(c, 'M28 92 L28 72 C14 66 12 44 18 30 C24 14 52 8 70 16 C86 22 90 44 82 60 C78 68 72 72 72 72 L72 92Z', m);
    fp(c, 'M18 46 C10 46 8 30 20 28 C24 36 26 42 18 46Z', m, 2.4);
    rr(c, 26, 76, 48, 16, 3);
    fill(c, '#f2f0ea', 2.4);
    shine(c, 44, 24, 10, 5, -0.2, 0.35);
  },
  surf({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(0.5);
    fp(c, 'M0 -44 C16 -30 18 20 12 40 L-12 40 C-18 20 -16 -30 0 -44Z', m);
    sp(c, 'M0 -40 L0 38', 2.4, s || '#f6f6f0');
    c.restore();
  },
  skate({ c, m }) {
    fp(c, 'M10 44 C10 36 18 36 24 40 L76 40 C82 36 90 36 90 44 C90 52 82 54 76 50 L24 50 C18 54 10 52 10 44Z', m);
    for (const x of [26, 74]) {
      el(c, x, 62, 7, 7);
      fill(c, '#f2f0ea', 2.4);
      sp(c, `M${x} 50 L${x} 56`, 3);
    }
  },
  medal({ c, m }) {
    fp(c, 'M30 8 L44 8 L56 46 L44 50Z', '#2a5ac8', 2.4);
    fp(c, 'M70 8 L56 8 L44 46 L56 50Z', '#c8202a', 2.4);
    el(c, 50, 66, 24, 24);
    fill(c, m);
    poly(c, 50, 52, 54, 62, 64, 62, 56, 69, 59, 79, 50, 73, 41, 79, 44, 69, 36, 62, 46, 62);
    c.fillStyle = mixHex(m, '#fff', 0.35);
    c.fill();
  },
  guitar({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(0.55);
    rr(c, -4, -46, 8, 50, 2);
    fill(c, s || '#5a3a22', 2.4);
    rr(c, -6, -52, 12, 10, 3);
    fill(c, s || '#5a3a22', 2.4);
    fp(c, 'M0 -8 C12 -8 14 0 12 6 C22 10 24 22 20 30 C14 42 -14 42 -20 30 C-24 22 -22 10 -12 6 C-14 0 -12 -8 0 -8Z', m);
    el(c, 0, 8, 5, 5);
    fill(c, INK, 0);
    rr(c, -7, 22, 14, 3, 1);
    fill(c, INK, 0);
    c.restore();
  },
  trumpet({ c, m }) {
    fp(c, 'M70 52 L92 30 L94 76 Z', m);
    rr(c, 12, 46, 62, 12, 4);
    fill(c, m);
    for (const x of [34, 44, 54]) {
      rr(c, x - 3, 30, 6, 16, 2);
      fill(c, m, 2.2);
    }
    rr(c, 4, 48, 10, 8, 2);
    fill(c, m, 2.2);
    shine(c, 40, 49, 20, 1.5, 0, 0.45);
  },
  flute({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.6);
    rr(c, -46, -6, 92, 12, 6);
    fill(c, m);
    for (let i = 0; i < 6; i++) dot(c, -20 + i * 10, 0, 2.2, INK);
    shine(c, 0, -3, 36, 1.2, 0, 0.4);
    c.restore();
  },
  drum({ c, m, s }) {
    rr(c, 14, 30, 72, 52, 6);
    fill(c, m);
    sp(c, 'M14 36 L32 78 L50 36 L68 78 L86 36', 1.8, s || '#f2f0ea');
    el(c, 50, 30, 36, 10);
    fill(c, s || '#f2f0ea');
    el(c, 50, 82, 36, 6);
    ink(c);
  },
  maraca({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(0.6);
    rr(c, -5, 6, 10, 40, 4);
    fill(c, s || '#c8a06a');
    el(c, 0, -14, 24, 28);
    fill(c, m);
    sp(c, 'M-18 -6 L18 -6', 2.4, mixHex(m, '#fff', 0.4));
    c.restore();
  },
  piano({ c, m }) {
    fp(c, 'M12 46 L12 30 C12 18 30 14 44 20 C60 26 70 14 84 22 C92 28 90 40 88 46Z', m);
    rr(c, 10, 46, 80, 20, 3);
    fill(c, m);
    rr(c, 14, 50, 72, 10, 1);
    fill(c, '#f6f6f2', 1.6);
    for (let i = 1; i < 9; i++) sp(c, `M${14 + i * 8} 50 L${14 + i * 8} 60`, 1);
    for (const x of [16, 52, 84]) {
      rr(c, x - 2, 66, 4, 24, 1);
      fill(c, m, 1.6);
    }
  },
  bell({ c, m }) {
    fp(c, 'M50 14 C30 14 26 34 26 50 C26 64 18 70 14 76 L86 76 C82 70 74 64 74 50 C74 34 70 14 50 14Z', m);
    el(c, 50, 82, 8, 7);
    fill(c, m);
    el(c, 50, 12, 6, 5);
    ink(c, 3);
    shine(c, 38, 40, 3, 12, 0.1, 0.4);
  },
  kite({ c, m, s }) {
    sp(c, 'M50 90 C40 94 56 98 62 96 C70 94 60 88 66 86', 1.8);
    poly(c, 50, 8, 82, 40, 50, 90, 18, 40);
    fill(c, m);
    sp(c, 'M50 8 L50 90 M18 40 L82 40', 2, s || mixHex(m, '#000', 0.4));
  },
  top({ c, m }) {
    rr(c, 46, 8, 8, 18, 3);
    fill(c, '#c8a06a', 2.4);
    fp(c, 'M14 40 C14 28 86 28 86 40 C86 56 62 76 50 92 C38 76 14 56 14 40Z', m);
    sp(c, 'M16 44 C30 52 70 52 84 44', 2.2, mixHex(m, '#fff', 0.45));
  },
  hoop({ c, m }) {
    el(c, 50, 52, 38, 34);
    ink(c, 16);
    el(c, 50, 52, 38, 34);
    c.lineWidth = 10;
    c.strokeStyle = m;
    c.stroke();
  },
  dice({ c, m, s }) {
    rr(c, 16, 18, 68, 68, 12);
    fill(c, m);
    for (const [x, y] of [[32, 34], [68, 34], [50, 52], [32, 70], [68, 70]]) dot(c, x, y, 5, s || '#fff');
  },
  blob({ c, m }) {
    fp(c, 'M18 64 C8 48 22 30 38 34 C44 18 70 18 74 34 C90 34 94 56 82 66 C80 84 56 86 46 78 C32 86 18 78 18 64Z', m);
    shine(c, 40, 38, 10, 4, -0.3, 0.3);
  },
  crayon({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.8);
    fp(c, 'M-30 -9 L28 -9 L28 9 L-30 9Z', m);
    fp(c, 'M28 -9 L44 0 L28 9Z', m);
    rr(c, -16, -9, 30, 18, 0);
    fill(c, mixHex(m, '#000', 0.2), 1.6);
    c.restore();
  },
  /* ---------- ferramentas ---------- */
  hammer({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.6);
    rr(c, -6, -18, 12, 64, 5);
    fill(c, m);
    fp(c, 'M-26 -38 L22 -38 C30 -38 30 -22 22 -22 L-26 -22Z', s || '#9aa0a8');
    c.restore();
  },
  wrench({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.7);
    rr(c, -7, -24, 14, 60, 6);
    fill(c, m);
    fp(c, 'M-16 -30 C-18 -46 -6 -50 -4 -50 L-4 -36 L4 -36 L4 -50 C6 -50 18 -46 16 -30 C12 -20 -12 -20 -16 -30Z', m);
    c.restore();
  },
  screwdriver({ c, m, s }) {
    c.save();
    c.translate(50, 52);
    c.rotate(0.7);
    rr(c, -3, -44, 6, 40, 1);
    fill(c, s || '#b8bcc2', 2.4);
    rr(c, -11, -6, 22, 50, 9);
    fill(c, m);
    sp(c, 'M-4 4 L-4 36 M4 4 L4 36', 1.6, mixHex(m, '#000', 0.3));
    c.restore();
  },
  drill({ c, m, s }) {
    rr(c, 88, 38, 10, 4, 1);
    fill(c, '#b8bcc2', 1.6);
    fp(c, 'M14 26 C14 20 18 18 24 18 L80 18 C86 18 88 24 88 30 L88 46 C88 52 84 54 80 54 L52 54 L56 88 L30 88 L34 54 L24 54 C18 54 14 52 14 46Z', m);
    rr(c, 26, 82, 34, 10, 2);
    fill(c, s || INK, 2);
  },
  saw({ c, m, s }) {
    fp(c, 'M30 30 L92 50 L92 58 L30 70Z', m);
    let d = 'M30 70';
    for (let x = 34; x <= 92; x += 6) d += ` L${x} ${70 - ((x - 30) / 62) * 12 + 4} L${x + 3} ${70 - ((x - 30) / 62) * 12}`;
    sp(c, d, 1.6);
    fp(c, 'M6 28 L32 26 L34 74 L6 76 C2 60 2 44 6 28Z M14 40 L26 40 L26 60 L14 60Z', s || '#c8202a', 2.6);
  },
  bucket({ c, m }) {
    sp(c, 'M20 34 C20 6 80 6 80 34', 2.6);
    fp(c, 'M14 32 L86 32 L76 90 L24 90Z', m);
    el(c, 50, 32, 36, 7);
    fill(c, mixHex(m, '#000', 0.25), 2.6);
    shine(c, 30, 60, 3, 14, 0.1, 0.3);
  },
  padlock({ c, m }) {
    sp(c, 'M30 46 L30 30 C30 8 70 8 70 30 L70 46', 10);
    sp(c, 'M30 46 L30 30 C30 8 70 8 70 30 L70 46', 6, '#b8bcc2');
    rr(c, 18, 44, 64, 46, 8);
    fill(c, m);
    el(c, 50, 62, 5, 5);
    fill(c, INK, 0);
    rr(c, 48, 64, 4, 12, 1);
    fill(c, INK, 0);
  },
  key({ c, m }) {
    el(c, 28, 50, 18, 18);
    fill(c, m);
    el(c, 28, 50, 7, 7);
    fill(c, '#d8d6dd', 2.4);
    fp(c, 'M44 45 L92 45 L92 55 L86 55 L86 64 L78 64 L78 55 L72 55 L72 62 L64 62 L64 55 L44 55Z', m);
  },
  /* ---------- casa ---------- */
  sofa({ c, m }) {
    rr(c, 18, 24, 64, 36, 8);
    fill(c, m);
    rr(c, 8, 44, 84, 30, 8);
    fill(c, m);
    rr(c, 4, 38, 18, 40, 8);
    fill(c, mixHex(m, '#000', 0.08));
    rr(c, 78, 38, 18, 40, 8);
    fill(c, mixHex(m, '#000', 0.08));
    sp(c, 'M50 46 L50 72', 1.8, mixHex(m, '#000', 0.3));
    for (const x of [14, 86]) {
      rr(c, x - 3, 78, 6, 10, 2);
      fill(c, INK, 0);
    }
  },
  chair({ c, m }) {
    rr(c, 26, 10, 48, 44, 6);
    fill(c, m);
    rr(c, 20, 52, 60, 12, 4);
    fill(c, m);
    for (const x of [26, 70]) {
      rr(c, x - 3, 62, 8, 30, 2);
      fill(c, m, 2.4);
    }
    sp(c, 'M36 18 L36 46 M50 18 L50 46 M64 18 L64 46', 1.6, mixHex(m, '#000', 0.25));
  },
  lamp({ c, m, s }) {
    el(c, 50, 88, 22, 5);
    fill(c, s || INK, 0);
    rr(c, 47, 50, 6, 38, 2);
    fill(c, s || '#5a5a60', 2);
    fp(c, 'M30 14 L70 14 L84 54 L16 54Z', m);
    shine(c, 36, 32, 3, 12, -0.3, 0.3);
  },
  candle({ c, m }) {
    fp(c, 'M50 6 C56 14 58 22 50 28 C42 22 44 14 50 6Z', '#ffc93a', 2.2);
    sp(c, 'M50 28 L50 32', 2);
    rr(c, 32, 32, 36, 58, 4);
    fill(c, m);
    fp(c, 'M32 36 C40 42 44 34 50 42 C56 50 62 36 68 40 L68 32 L32 32Z', mixHex(m, '#fff', 0.15), 0);
    shine(c, 40, 60, 2.4, 16, 0, 0.3);
  },
  vase({ c, m }) {
    fp(c, 'M38 10 L62 10 L60 22 C80 30 84 52 76 70 C72 82 64 90 50 90 C36 90 28 82 24 70 C16 52 20 30 40 22Z', m);
    shine(c, 34, 50, 4, 14, 0.2, 0.3);
  },
  cushion({ c, m }) {
    fp(c, 'M14 18 C40 26 60 26 86 18 C80 42 80 62 86 86 C60 78 40 78 14 86 C20 62 20 42 14 18Z', m);
    dot(c, 50, 52, 3, mixHex(m, '#000', 0.3));
    shine(c, 34, 34, 10, 4, -0.4, 0.25);
  },
  toothbrush({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.7);
    rr(c, -44, -6, 72, 12, 6);
    fill(c, m);
    rr(c, 20, -8, 26, 8, 2);
    fill(c, m, 2.2);
    for (let i = 0; i < 6; i++) {
      rr(c, 22 + i * 4, -18, 3, 10, 1);
      fill(c, '#f6f6f2', 1.2);
    }
    c.restore();
  },
  soap({ c, m }) {
    rr(c, 12, 28, 76, 46, 20);
    fill(c, m);
    for (const [x, y, r] of [[78, 22, 6], [88, 14, 4], [70, 12, 3]]) {
      el(c, x, y, r, r);
      fill(c, 'rgba(255,255,255,.7)', 1.6);
    }
    shine(c, 34, 40, 14, 4, -0.1, 0.35);
  },
  clock({ c, m }) {
    el(c, 50, 52, 38, 38);
    fill(c, m);
    el(c, 50, 52, 28, 28);
    fill(c, '#f6f6f2', 2.4);
    sp(c, 'M50 52 L50 34 M50 52 L62 58', 3);
  },
  fridge({ c, m }) {
    rr(c, 22, 6, 56, 88, 12);
    fill(c, m);
    sp(c, 'M22 38 L78 38', 2.6);
    rr(c, 66, 16, 5, 16, 2);
    fill(c, '#cfcfd4', 1.6);
    rr(c, 66, 46, 5, 24, 2);
    fill(c, '#cfcfd4', 1.6);
    shine(c, 32, 60, 3, 16, 0, 0.3);
  },
  bin({ c, m }) {
    fp(c, 'M20 26 L80 26 L74 92 L26 92Z', m);
    rr(c, 14, 16, 72, 12, 4);
    fill(c, mixHex(m, '#000', 0.12));
    sp(c, 'M38 40 L40 80 M50 40 L50 80 M62 40 L60 80', 2, mixHex(m, '#000', 0.3));
  },
  /* ---------- escola / escritório ---------- */
  pencil({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.8);
    rr(c, -46, -8, 10, 16, 3);
    fill(c, '#f29aa8', 2.4);
    rr(c, -38, -8, 8, 16, 1);
    fill(c, '#b8bcc2', 2.4);
    fp(c, 'M-30 -8 L24 -8 L24 8 L-30 8Z', m);
    fp(c, 'M24 -8 L42 0 L24 8Z', '#e8c99a');
    fp(c, 'M36 -2.6 L42 0 L36 2.6Z', mixHex(m, '#000', 0.2), 1.6);
    sp(c, 'M-30 -2.6 L24 -2.6 M-30 2.6 L24 2.6', 1, mixHex(m, '#000', 0.25));
    c.restore();
  },
  note({ c, m }) {
    fp(c, 'M16 16 L84 16 L84 70 L68 86 L16 86Z', m);
    fp(c, 'M68 86 L70 72 L84 70Z', mixHex(m, '#000', 0.12), 2.4);
  },
  marker({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.7);
    rr(c, -40, -10, 60, 20, 6);
    fill(c, m);
    fp(c, 'M20 -8 L32 -6 L42 -2 L42 4 L32 6 L20 8Z', '#2a2a30', 2.2);
    fp(c, 'M40 -3 L46 -1 L46 3 L40 3Z', m, 1.6);
    c.restore();
  },
  book({ c, m, s }) {
    fp(c, 'M22 12 L80 12 L80 82 L22 82Z', m);
    rr(c, 22, 82, 58, 8, 1);
    fill(c, s || '#f2eee2');
    rr(c, 16, 12, 10, 78, 3);
    fill(c, mixHex(m, '#000', 0.25));
    rr(c, 36, 26, 32, 12, 1);
    ink(c, 1.8);
  },
  envelope({ c, m }) {
    rr(c, 10, 24, 80, 56, 4);
    fill(c, m);
    sp(c, 'M10 26 L50 56 L90 26 M10 78 L40 52 M90 78 L60 52', 2.2);
  },
  scissors({ c, m }) {
    sp(c, 'M40 56 L84 14 M60 56 L16 14', 5, '#b8bcc2');
    sp(c, 'M40 56 L84 14 M60 56 L16 14', 1.6);
    for (const x of [32, 68]) {
      el(c, x, 72, 15, 13);
      ink(c, 12);
      el(c, x, 72, 15, 13);
      c.lineWidth = 7;
      c.strokeStyle = m;
      c.stroke();
    }
  },
  ruler({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.4);
    rr(c, -46, -12, 92, 24, 3);
    fill(c, m);
    for (let i = -40; i <= 40; i += 5) sp(c, `M${i} -12 L${i} ${i % 10 ? -5 : 0}`, 1.4);
    c.restore();
  },
  tube({ c, m }) {
    c.save();
    c.translate(50, 52);
    c.rotate(-0.5);
    fp(c, 'M-34 -16 L20 -14 L32 -6 L32 6 L20 14 L-34 16 L-38 0Z', '#e6e8ec');
    rr(c, 32, -6, 12, 12, 2);
    fill(c, INK, 0);
    fp(c, 'M-33 -16 L18 -14 L18 14 L-33 16 L-37 0Z', m, 2);
    c.restore();
    fp(c, 'M8 84 C8 72 26 66 38 70 C54 74 58 86 44 90 C30 94 8 94 8 84Z', m);
  },
  /* ---------- sinalização ---------- */
  octagon({ c, m, s }) {
    rr(c, 47, 60, 6, 34, 1);
    fill(c, '#9aa0a8', 2);
    poly(c, 36, 10, 64, 10, 84, 30, 84, 58, 64 + 0, 78, 36, 78, 16, 58, 16, 30);
    fill(c, m);
    poly(c, 38, 15, 62, 15, 79, 32, 79, 56, 62, 73, 38, 73, 21, 56, 21, 32);
    c.lineWidth = 2.6;
    c.strokeStyle = s || '#fff';
    c.stroke();
  },
  warning({ c, m }) {
    poly(c, 50, 8, 92, 84, 8, 84);
    fill(c, m);
    rr(c, 46, 34, 8, 30, 3);
    fill(c, INK, 0);
    dot(c, 50, 72, 4.4, INK);
  },
  sign({ c, m, s }) {
    rr(c, 30, 70, 6, 24, 1);
    fill(c, '#9aa0a8', 2);
    rr(c, 64, 70, 6, 24, 1);
    fill(c, '#9aa0a8', 2);
    rr(c, 8, 16, 84, 56, 8);
    fill(c, m);
    rr(c, 13, 21, 74, 46, 5);
    c.lineWidth = 2.4;
    c.strokeStyle = s || '#fff';
    c.stroke();
    sp(c, 'M24 44 L66 44 M56 34 L68 44 L56 54', 4, s || '#fff');
  },
  hydrant({ c, m }) {
    rr(c, 30, 30, 40, 58, 4);
    fill(c, m);
    fp(c, 'M30 32 C30 14 70 14 70 32Z', m);
    rr(c, 26, 26, 48, 8, 3);
    fill(c, mixHex(m, '#000', 0.15));
    rr(c, 16, 48, 14, 14, 3);
    fill(c, m);
    rr(c, 70, 48, 14, 14, 3);
    fill(c, m);
    rr(c, 24, 84, 52, 8, 2);
    fill(c, mixHex(m, '#000', 0.15));
  },
  light({ c, m }) {
    rr(c, 30, 6, 40, 88, 10);
    fill(c, '#2a2a30');
    for (let i = 0; i < 3; i++) {
      el(c, 50, 22 + i * 28, 11, 11);
      fill(c, '#4a4a52', 2);
    }
    // a luz acesa (cor da vez) ocupa o centro e brilha
    c.save();
    c.globalAlpha = 0.35;
    el(c, 50, 50, 24, 24);
    c.fillStyle = m;
    c.fill();
    c.restore();
    el(c, 50, 50, 16, 16);
    fill(c, m, 2.4);
  },
  extinguisher({ c, m }) {
    sp(c, 'M58 18 C76 18 84 30 82 50', 3);
    rr(c, 40, 10, 22, 10, 3);
    fill(c, '#2a2a30', 2);
    rr(c, 30, 22, 40, 70, 16);
    fill(c, m);
    rr(c, 36, 44, 28, 22, 3);
    fill(c, '#f6f6f2', 2);
  },
};

/** apelidos (forma parecida o bastante) */
const ALIAS: Record<string, string> = {
  tomato: 'orange', apron: 'shirt', sub: 'boat', train: 'bus', eraser: 'block', mat: 'block', pearl: 'ball', puck: 'disc',
  yoyo: 'disc', tape: 'disc', level: 'ruler', rug: 'cushion', towel: 'fabric', meat: 'steak', coat: 'shirt',
};

export function hasShape(id: string): boolean {
  return !!S[id] || !!S[ALIAS[id]];
}
export const SHAPE_IDS = Object.keys(S);

/**
 * Desenha o item centralizado em (cx,cy) num quadrado de lado `size`.
 * `m`/`s` = cores; `silhouette` = só a forma lisa (para a fase de pintar).
 */
export function drawItem(c: C, shape: string, m: string, s: string, cx: number, cy: number, size: number): void {
  const f = S[shape] ?? S[ALIAS[shape]] ?? S.ball;
  c.save();
  c.translate(cx - size / 2, cy - size / 2);
  c.scale(size / 100, size / 100);
  f({ c, m, s, d: mixHex(m, '#000', 0.3), l: mixHex(m, '#fff', 0.3) });
  c.restore();
}
