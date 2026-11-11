/* ============================================================
 *  NIGHTKIT — texturas desenhadas em canvas (zero bytes no APK).
 *  Papéis de parede infantis, tapetes, tatame EVA, toras, telhas,
 *  pedras, desenhos de criança, quadros, placas, céu da janela.
 *  Tudo em cache por chave; repetem sem emenda quando faz sentido.
 * ============================================================ */
import * as THREE from 'three';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const cache = new Map<string, THREE.CanvasTexture>();

export function cv(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
export function texOf(c: HTMLCanvasElement, repeat = true, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function cached(k: string, f: () => THREE.CanvasTexture): THREE.CanvasTexture {
  let t = cache.get(k);
  if (!t) cache.set(k, (t = f()));
  return t;
}
/** libera tudo (ao sair do jogo) */
export function disposeTex(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
let seed = 1;
export function srand(s: number): void {
  seed = s;
}
export function rnd(): number {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
}
/** ruído barato pixel a pixel (granulação de tinta/tecido) */
function grain(x: Ctx, w: number, h: number, amt: number, s = 7): void {
  srand(s);
  const d = x.getImageData(0, 0, w, h);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * amt;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  x.putImageData(d, 0, 0);
}
function star(x: Ctx, cx: number, cy: number, r: number, pts = 5, inner = 0.45): void {
  x.beginPath();
  for (let i = 0; i < pts * 2; i++) {
    const a = (i / (pts * 2)) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fill();
}
function cloud(x: Ctx, cx: number, cy: number, s: number): void {
  x.beginPath();
  x.arc(cx - s * 0.5, cy, s * 0.42, 0, TAU);
  x.arc(cx, cy - s * 0.22, s * 0.55, 0, TAU);
  x.arc(cx + s * 0.55, cy, s * 0.4, 0, TAU);
  x.rect(cx - s * 0.5, cy, s * 1.05, s * 0.42);
  x.fill();
}
function heart(x: Ctx, cx: number, cy: number, s: number): void {
  x.beginPath();
  x.moveTo(cx, cy + s * 0.35);
  x.bezierCurveTo(cx - s * 0.9, cy - s * 0.25, cx - s * 0.3, cy - s * 0.85, cx, cy - s * 0.3);
  x.bezierCurveTo(cx + s * 0.3, cy - s * 0.85, cx + s * 0.9, cy - s * 0.25, cx, cy + s * 0.35);
  x.fill();
}
/** desenha em todas as 9 posições (padrão que repete sem emenda) */
function wrap9(w: number, h: number, f: (dx: number, dy: number) => void): void {
  for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) f(dx, dy);
}

export type Paper = 'stars' | 'dots' | 'clouds' | 'stripes' | 'balloons' | 'hearts' | 'plaid' | 'leaves' | 'plain';
/** papel de parede infantil (256 px = 1 repetição) */
export function wallpaper(kind: Paper, base: string, a: string, b: string): THREE.CanvasTexture {
  return cached(`wp${kind}${base}${a}${b}`, () => {
    const S = 256;
    const [c, x] = cv(S);
    x.fillStyle = base;
    x.fillRect(0, 0, S, S);
    srand(kind.length * 31 + 5);
    switch (kind) {
      case 'stars':
        for (let i = 0; i < 9; i++) {
          const px = rnd() * S;
          const py = rnd() * S;
          const r = 7 + rnd() * 9;
          x.fillStyle = i % 3 ? a : b;
          wrap9(S, S, (dx, dy) => (i % 4 === 3 ? moon(x, px + dx, py + dy, r * 1.3, base) : star(x, px + dx, py + dy, r)));
        }
        x.fillStyle = a;
        for (let i = 0; i < 40; i++) {
          const px = rnd() * S;
          const py = rnd() * S;
          x.globalAlpha = 0.5;
          x.fillRect(px, py, 2, 2);
        }
        x.globalAlpha = 1;
        break;
      case 'dots':
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            x.fillStyle = (i + j) % 2 ? a : b;
            x.beginPath();
            x.arc(i * 64 + 32 + (j % 2) * 32, j * 64 + 32, 9, 0, TAU);
            x.fill();
            if (i === 3 && j % 2) {
              x.beginPath();
              x.arc(-32 + 32, j * 64 + 32, 9, 0, TAU);
              x.fill();
            }
          }
        break;
      case 'clouds':
        for (let i = 0; i < 4; i++) {
          const px = (i % 2) * 128 + 50 + rnd() * 30;
          const py = Math.floor(i / 2) * 128 + 50 + rnd() * 30;
          x.fillStyle = i % 2 ? a : b;
          wrap9(S, S, (dx, dy) => cloud(x, px + dx, py + dy, 26 + rnd() * 6));
        }
        break;
      case 'stripes':
        for (let i = 0; i < 8; i++) {
          x.fillStyle = i % 2 ? a : b;
          if (i % 4 === 1) x.fillRect(i * 32 + 4, 0, 24, S);
          else if (i % 4 === 3) x.fillRect(i * 32 + 12, 0, 8, S);
        }
        break;
      case 'balloons':
        for (let i = 0; i < 5; i++) {
          const px = rnd() * S;
          const py = rnd() * S;
          const col = [a, b, '#ffd27a', '#9ad7ff', '#ff9ec4'][i];
          wrap9(S, S, (dx, dy) => {
            x.strokeStyle = 'rgba(80,60,90,0.45)';
            x.lineWidth = 1.5;
            x.beginPath();
            x.moveTo(px + dx, py + dy + 16);
            x.quadraticCurveTo(px + dx + 6, py + dy + 30, px + dx, py + dy + 44);
            x.stroke();
            x.fillStyle = col;
            x.beginPath();
            x.ellipse(px + dx, py + dy, 11, 14, 0, 0, TAU);
            x.fill();
            x.fillStyle = 'rgba(255,255,255,0.5)';
            x.beginPath();
            x.ellipse(px + dx - 4, py + dy - 5, 3, 4, -0.4, 0, TAU);
            x.fill();
          });
        }
        break;
      case 'hearts':
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            x.fillStyle = (i + j) % 2 ? a : b;
            heart(x, i * 64 + 32 + (j % 2) * 32 - (i === 3 && j % 2 ? 256 : 0), j * 64 + 34, 12);
            if (i === 3 && j % 2) heart(x, i * 64 + 32 + 32, j * 64 + 34, 12);
          }
        break;
      case 'plaid':
        x.globalAlpha = 0.35;
        x.fillStyle = a;
        x.fillRect(0, 40, S, 50);
        x.fillRect(40, 0, 50, S);
        x.fillStyle = b;
        x.fillRect(0, 170, S, 14);
        x.fillRect(170, 0, 14, S);
        x.globalAlpha = 1;
        break;
      case 'leaves':
        for (let i = 0; i < 10; i++) {
          const px = rnd() * S;
          const py = rnd() * S;
          const r = rnd() * TAU;
          x.fillStyle = i % 2 ? a : b;
          wrap9(S, S, (dx, dy) => {
            x.save();
            x.translate(px + dx, py + dy);
            x.rotate(r);
            x.beginPath();
            x.ellipse(0, 0, 12, 5, 0, 0, TAU);
            x.fill();
            x.restore();
          });
        }
        break;
      default:
        break;
    }
    grain(x, S, S, 6);
    return texOf(c);
  });
}
function moon(x: Ctx, cx: number, cy: number, r: number, cut: string): void {
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  const f = x.fillStyle;
  x.fillStyle = cut;
  x.beginPath();
  x.arc(cx + r * 0.45, cy - r * 0.25, r * 0.85, 0, TAU);
  x.fill();
  x.fillStyle = f;
}

/** lambri / painel de madeira pintado (meia parede) — cinza neutro tingido pelo vértice */
export function wainscot(): THREE.CanvasTexture {
  return cached('wains', () => {
    const S = 256;
    const [c, x] = cv(S);
    x.fillStyle = '#e8e8e8';
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = '#cfcfcf';
      x.fillRect(i * 64, 0, 3, S);
      x.fillStyle = '#f6f6f6';
      x.fillRect(i * 64 + 3, 0, 2, S);
    }
    grain(x, S, S, 5);
    return texOf(c);
  });
}

/** tatame EVA de quebra-cabeça (4 placas coloridas por repetição) */
export function evaMat(cols = ['#ff9eb5', '#8fd6ff', '#ffe08a', '#9be5b0']): THREE.CanvasTexture {
  return cached('eva' + cols.join(), () => {
    const S = 512;
    const [c, x] = cv(S);
    const h = S / 2;
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        x.fillStyle = cols[(i + j * 2) % cols.length];
        x.fillRect(i * h, j * h, h, h);
      }
    // encaixes (dentes) nas bordas
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const col = cols[(i + j * 2) % cols.length];
        x.fillStyle = col;
        for (let k = 0; k < 4; k++) {
          const t = (k + 0.5) / 4;
          if (k % 2 === 0) {
            x.beginPath();
            x.arc(i * h + h + 0.5, j * h + t * h, 13, 0, TAU);
            x.fill();
            x.beginPath();
            x.arc(i * h + t * h, j * h + h + 0.5, 13, 0, TAU);
            x.fill();
          }
        }
      }
    x.strokeStyle = 'rgba(0,0,0,0.12)';
    x.lineWidth = 2;
    x.strokeRect(1, 1, S - 2, S - 2);
    x.beginPath();
    x.moveTo(h, 0);
    x.lineTo(h, S);
    x.moveTo(0, h);
    x.lineTo(S, h);
    x.stroke();
    // textura de espuma
    grain(x, S, S, 10, 3);
    return texOf(c);
  });
}

/** tapete redondo com anéis (desenhado no quadrado; use num círculo) */
export function rugTex(kind: 'rings' | 'border' | 'rag' | 'stars', a: string, b: string, cc: string): THREE.CanvasTexture {
  return cached(`rug${kind}${a}${b}${cc}`, () => {
    const S = 256;
    const [c, x] = cv(S);
    x.fillStyle = a;
    x.fillRect(0, 0, S, S);
    if (kind === 'rings') {
      for (let r = 8; r > 0; r--) {
        x.fillStyle = [a, b, cc][r % 3];
        x.beginPath();
        x.arc(S / 2, S / 2, (r / 8) * S * 0.5, 0, TAU);
        x.fill();
      }
    } else if (kind === 'border') {
      x.fillStyle = b;
      x.fillRect(14, 14, S - 28, S - 28);
      x.fillStyle = a;
      x.fillRect(26, 26, S - 52, S - 52);
      x.fillStyle = cc;
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 6; j++) {
          x.save();
          x.translate(48 + i * 32, 48 + j * 32);
          x.rotate(Math.PI / 4);
          x.fillRect(-6, -6, 12, 12);
          x.restore();
        }
    } else if (kind === 'rag') {
      srand(9);
      for (let y = 0; y < S; y += 8) {
        x.fillStyle = [a, b, cc, b][Math.floor(rnd() * 4)];
        x.fillRect(0, y, S, 7);
      }
    } else {
      x.fillStyle = b;
      for (let i = 0; i < 14; i++) star(x, 20 + ((i * 73) % 220), 20 + ((i * 131) % 220), 9);
      x.fillStyle = cc;
      x.fillRect(0, 0, S, 10);
      x.fillRect(0, S - 10, S, 10);
    }
    grain(x, S, S, 18, 11);
    return texOf(c, false);
  });
}

/** toras horizontais (parede de cabana) — rows = toras por repetição */
export function logTex(rows = 4): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const key = 'logs' + rows;
  const m = cache.get(key);
  if (m) return { map: m, normal: cache.get(key + 'n')! };
  const S = 256;
  const [c, x] = cv(S);
  const [cn, xn] = cv(S);
  const img = x.createImageData(S, S);
  const nimg = xn.createImageData(S, S);
  const rh = S / rows;
  srand(4);
  const knots: [number, number][] = [];
  for (let i = 0; i < 6; i++) knots.push([rnd() * S, rnd() * S]);
  for (let y = 0; y < S; y++) {
    const t = (y % rh) / rh; // 0..1 dentro da tora
    const yy = t * 2 - 1;
    const hgt = Math.sqrt(Math.max(0, 1 - yy * yy));
    const ny = -yy;
    for (let px = 0; px < S; px++) {
      const i = (y * S + px) * 4;
      const streak = Math.sin(px * 0.11 + Math.sin(y * 0.7) * 2 + Math.floor(y / rh) * 3) * 0.5 + 0.5;
      let l = 0.55 + hgt * 0.42 + streak * 0.06;
      for (const [kx, ky] of knots) {
        const d = Math.hypot(((px - kx + S * 1.5) % S) - S / 2, (((y - ky + S * 1.5) % S) - S / 2) * 2);
        if (d < 6) l *= 0.75 + d * 0.04;
      }
      if (hgt < 0.25) l *= 0.55 + hgt; // vão de massa entre toras
      const v = Math.max(0, Math.min(255, l * 255));
      img.data[i] = v;
      img.data[i + 1] = v * 0.97;
      img.data[i + 2] = v * 0.93;
      img.data[i + 3] = 255;
      nimg.data[i] = 128;
      nimg.data[i + 1] = 128 + ny * 100 * (hgt > 0.2 ? 1 : 0.2);
      nimg.data[i + 2] = 200;
      nimg.data[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  xn.putImageData(nimg, 0, 0);
  const map = texOf(c);
  const normal = texOf(cn, true, false);
  cache.set(key, map);
  cache.set(key + 'n', normal);
  return { map, normal };
}

/** telhas de madeira (shingles) */
export function shingleTex(): THREE.CanvasTexture {
  return cached('shingle', () => {
    const S = 256;
    const [c, x] = cv(S);
    srand(8);
    const rows = 8;
    const rh = S / rows;
    for (let j = 0; j < rows; j++) {
      const off = (j % 2) * 16;
      for (let i = -1; i < 9; i++) {
        const w = 28 + rnd() * 8;
        const l = 150 + rnd() * 50;
        const g = x.createLinearGradient(0, j * rh, 0, j * rh + rh);
        g.addColorStop(0, `rgb(${l * 0.7},${l * 0.7},${l * 0.72})`);
        g.addColorStop(1, `rgb(${l},${l},${l})`);
        x.fillStyle = g;
        x.fillRect(i * 32 + off, j * rh, w, rh - 2);
      }
      x.fillStyle = 'rgba(0,0,0,0.5)';
      x.fillRect(0, j * rh + rh - 2, S, 2);
    }
    grain(x, S, S, 14);
    return texOf(c);
  });
}

/** pedra de lareira / mureta (pedras arredondadas com argamassa) */
export function stoneWall(): THREE.CanvasTexture {
  return cached('stonewall', () => {
    const S = 256;
    const [c, x] = cv(S);
    x.fillStyle = '#6a6460';
    x.fillRect(0, 0, S, S);
    srand(21);
    for (let j = 0; j < 7; j++) {
      let px = (j % 2) * -18;
      while (px < S) {
        const w = 30 + rnd() * 34;
        const h = 30 + rnd() * 6;
        const l = 150 + rnd() * 70;
        x.fillStyle = `rgb(${l},${l * 0.96},${l * 0.9})`;
        const r = 9;
        const X = px + 2;
        const Y = j * 37 + 2;
        for (const dx of [0, S]) {
          x.beginPath();
          x.roundRect(X + dx - (X + w > S ? S : 0), Y, w - 4, h - 4, r);
          x.fill();
        }
        px += w;
      }
    }
    grain(x, S, S, 22);
    return texOf(c);
  });
}

/** reboco/teto/pintura com leve variação (cinza neutro) */
export function plaster(): THREE.CanvasTexture {
  return cached('plaster', () => {
    const S = 128;
    const [c, x] = cv(S);
    x.fillStyle = '#ededed';
    x.fillRect(0, 0, S, S);
    grain(x, S, S, 9, 5);
    return texOf(c);
  });
}
/** tecido / felpudo */
export function cloth(): THREE.CanvasTexture {
  return cached('cloth', () => {
    const S = 128;
    const [c, x] = cv(S);
    x.fillStyle = '#e6e6e6';
    x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 2) {
      x.fillStyle = i % 4 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.06)';
      x.fillRect(0, i, S, 1);
      x.fillRect(i, 0, 1, S);
    }
    grain(x, S, S, 12, 9);
    return texOf(c);
  });
}

/** degradê radial (halos de luz, poças de luz no chão) */
export function glowTex(): THREE.CanvasTexture {
  return cached('glow', () => {
    const S = 128;
    const [c, x] = cv(S);
    const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
    return texOf(c, false);
  });
}

/** céu noturno visto pela janela (lua, estrelas, silhueta de árvores) */
export function nightSky(moonOn = true, trees = true): THREE.CanvasTexture {
  return cached(`sky${moonOn}${trees}`, () => {
    const W = 512;
    const H = 256;
    const [c, x] = cv(W, H);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1030');
    g.addColorStop(0.7, '#1f2a5a');
    g.addColorStop(1, '#2c3a6a');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    srand(77);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(255,255,240,${0.4 + rnd() * 0.6})`;
      const s = rnd() < 0.1 ? 2.2 : 1.2;
      x.fillRect(rnd() * W, rnd() * H * 0.7, s, s);
    }
    if (moonOn) {
      const mg = x.createRadialGradient(380, 60, 0, 380, 60, 70);
      mg.addColorStop(0, 'rgba(255,250,220,0.5)');
      mg.addColorStop(1, 'rgba(255,250,220,0)');
      x.fillStyle = mg;
      x.fillRect(300, 0, 160, 140);
      x.fillStyle = '#fff7d8';
      x.beginPath();
      x.arc(380, 60, 22, 0, TAU);
      x.fill();
      x.fillStyle = 'rgba(200,190,160,0.5)';
      x.beginPath();
      x.arc(372, 54, 5, 0, TAU);
      x.arc(388, 68, 3.5, 0, TAU);
      x.fill();
    }
    if (trees) {
      x.fillStyle = '#0a1224';
      for (let i = 0; i < 16; i++) {
        const tx = (i / 16) * W + rnd() * 20;
        const th = 50 + rnd() * 70;
        x.beginPath();
        x.moveTo(tx - 26, H);
        x.lineTo(tx, H - th);
        x.lineTo(tx + 26, H);
        x.fill();
      }
      x.fillRect(0, H - 22, W, 22);
    }
    return texOf(c, false);
  });
}

/** placa com texto (números de cabana, "SAÍDA", nomes) */
export function signTex(text: string, bg: string, fg: string, w = 256, h = 128, border?: string, font = 'bold'): THREE.CanvasTexture {
  return cached(`sign${text}${bg}${fg}${w}${h}${border}`, () => {
    const [c, x] = cv(w, h);
    x.fillStyle = bg;
    x.beginPath();
    x.roundRect(0, 0, w, h, h * 0.18);
    x.fill();
    if (border) {
      x.strokeStyle = border;
      x.lineWidth = h * 0.07;
      x.beginPath();
      x.roundRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16, h * 0.12);
      x.stroke();
    }
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    let fs = h * 0.62;
    x.font = `${font} ${fs}px Fredoka, Arial, sans-serif`;
    while (x.measureText(text).width > w * 0.84 && fs > 8) {
      fs -= 2;
      x.font = `${font} ${fs}px Fredoka, Arial, sans-serif`;
    }
    x.fillText(text, w / 2, h * 0.54);
    return texOf(c, false);
  });
}

/* ------------------------------ desenhos de criança ------------------------------ */
export type Drawing = 'sun' | 'family' | 'rainbow' | 'flower' | 'fish' | 'rocket' | 'creepyFamily' | 'eyes' | 'creature' | 'sunSad' | 'scribble' | 'handprints' | 'handsDark';
/** papel com desenho de giz de cera (o anômalo troca por uma versão estranha) */
export function drawingTex(kind: Drawing, paper = '#fffaf0'): THREE.CanvasTexture {
  return cached('draw' + kind + paper, () => {
    const W = 256;
    const H = 192;
    const [c, x] = cv(W, H);
    x.fillStyle = paper;
    x.fillRect(0, 0, W, H);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const crayon = (col: string, wd = 6) => {
      x.strokeStyle = col;
      x.fillStyle = col;
      x.lineWidth = wd;
    };
    const blob = (cx: number, cy: number, r: number, col: string, mood: 'smile' | 'fang' | 'none' = 'smile', eyeCol = '#222') => {
      crayon(col, 5);
      x.beginPath();
      x.ellipse(cx, cy, r, r * 0.92, 0, 0, TAU);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(cx - r * 0.35, cy - r * 0.15, r * 0.22, 0, TAU);
      x.arc(cx + r * 0.35, cy - r * 0.15, r * 0.22, 0, TAU);
      x.fill();
      x.fillStyle = eyeCol;
      x.beginPath();
      x.arc(cx - r * 0.33, cy - r * 0.12, r * 0.11, 0, TAU);
      x.arc(cx + r * 0.37, cy - r * 0.12, r * 0.11, 0, TAU);
      x.fill();
      if (mood === 'smile') {
        crayon('#5a2a3a', 3);
        x.beginPath();
        x.arc(cx, cy + r * 0.2, r * 0.3, 0.2, Math.PI - 0.2);
        x.stroke();
      } else if (mood === 'fang') {
        x.fillStyle = '#4a0a1a';
        x.beginPath();
        x.ellipse(cx, cy + r * 0.38, r * 0.5, r * 0.3, 0, 0, Math.PI);
        x.fill();
        x.fillStyle = '#fff';
        x.beginPath();
        x.moveTo(cx - r * 0.3, cy + r * 0.38);
        x.lineTo(cx - r * 0.22, cy + r * 0.62);
        x.lineTo(cx - r * 0.14, cy + r * 0.38);
        x.moveTo(cx + r * 0.14, cy + r * 0.38);
        x.lineTo(cx + r * 0.22, cy + r * 0.62);
        x.lineTo(cx + r * 0.3, cy + r * 0.38);
        x.fill();
      }
    };
    const grass = (col = '#4caf50') => {
      crayon(col, 5);
      for (let i = 0; i < 26; i++) {
        x.beginPath();
        x.moveTo(i * 10, H - 4);
        x.lineTo(i * 10 + 4, H - 20 - (i % 3) * 4);
        x.stroke();
      }
    };
    const sun = (sad: boolean) => {
      crayon('#ffb300', 5);
      x.beginPath();
      x.arc(W - 46, 40, 22, 0, TAU);
      x.fill();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        x.beginPath();
        x.moveTo(W - 46 + Math.cos(a) * 28, 40 + Math.sin(a) * 28);
        x.lineTo(W - 46 + Math.cos(a) * 40, 40 + Math.sin(a) * 40);
        x.stroke();
      }
      crayon('#6a3a00', 3);
      x.beginPath();
      if (sad) x.arc(W - 46, 56, 9, Math.PI + 0.4, -0.4);
      else x.arc(W - 46, 42, 9, 0.3, Math.PI - 0.3);
      x.stroke();
      x.fillStyle = '#6a3a00';
      x.fillRect(W - 54, 32, 4, 5);
      x.fillRect(W - 42, 32, 4, 5);
    };
    switch (kind) {
      case 'sun':
      case 'sunSad': {
        sun(kind === 'sunSad');
        crayon(kind === 'sunSad' ? '#555' : '#e53935', 5);
        x.beginPath();
        x.moveTo(40, 120);
        x.lineTo(90, 76);
        x.lineTo(140, 120);
        x.closePath();
        x.fill();
        crayon(kind === 'sunSad' ? '#777' : '#ffcc80', 5);
        x.fillRect(52, 120, 76, 50);
        crayon('#6d4c41', 4);
        x.fillRect(80, 140, 20, 30);
        grass();
        break;
      }
      case 'family':
      case 'creepyFamily':
        blob(60, 110, 34, '#ff8ab3', kind === 'creepyFamily' ? 'fang' : 'smile', kind === 'creepyFamily' ? '#d00' : '#222');
        blob(130, 100, 42, '#7ec8ff', 'smile');
        blob(196, 124, 24, '#ffd54f', kind === 'creepyFamily' ? 'fang' : 'smile');
        if (kind === 'creepyFamily') {
          crayon('#222', 3);
          x.beginPath();
          x.ellipse(232, 50, 16, 26, 0, 0, TAU);
          x.fill();
          x.fillStyle = '#ffeb3b';
          x.fillRect(224, 44, 5, 4);
          x.fillRect(236, 44, 5, 4);
        }
        grass();
        break;
      case 'rainbow':
        ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'].forEach((col, i) => {
          crayon(col, 9);
          x.beginPath();
          x.arc(W / 2, H + 10, 120 - i * 10, Math.PI, 0);
          x.stroke();
        });
        crayon('#9ad7ff', 6);
        cloud(x, 40, 150, 26);
        cloud(x, W - 40, 150, 26);
        break;
      case 'flower':
        for (let k = 0; k < 3; k++) {
          const fx = 60 + k * 70;
          crayon('#43a047', 5);
          x.beginPath();
          x.moveTo(fx, H - 10);
          x.lineTo(fx, 90);
          x.stroke();
          crayon(['#ec407a', '#ab47bc', '#ff7043'][k], 5);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            x.beginPath();
            x.arc(fx + Math.cos(a) * 16, 80 + Math.sin(a) * 16, 11, 0, TAU);
            x.fill();
          }
          x.fillStyle = '#fdd835';
          x.beginPath();
          x.arc(fx, 80, 9, 0, TAU);
          x.fill();
        }
        break;
      case 'fish':
        x.fillStyle = '#bfe8ff';
        x.fillRect(0, 0, W, H);
        for (let k = 0; k < 3; k++) {
          crayon(['#ff8a65', '#ffd54f', '#ba68c8'][k], 4);
          const fx = 60 + k * 70;
          const fy = 60 + (k % 2) * 60;
          x.beginPath();
          x.ellipse(fx, fy, 26, 15, 0, 0, TAU);
          x.fill();
          x.beginPath();
          x.moveTo(fx + 22, fy);
          x.lineTo(fx + 40, fy - 12);
          x.lineTo(fx + 40, fy + 12);
          x.fill();
          x.fillStyle = '#222';
          x.beginPath();
          x.arc(fx - 14, fy - 3, 3, 0, TAU);
          x.fill();
        }
        break;
      case 'rocket':
        x.fillStyle = '#1a237e';
        x.fillRect(0, 0, W, H);
        x.fillStyle = '#fff';
        for (let i = 0; i < 20; i++) star(x, (i * 53) % W, (i * 37) % H, 3);
        crayon('#eceff1', 4);
        x.beginPath();
        x.ellipse(W / 2, H / 2, 22, 52, 0.5, 0, TAU);
        x.fill();
        crayon('#e53935', 4);
        x.beginPath();
        x.moveTo(W / 2 + 26, H / 2 - 44);
        x.lineTo(W / 2 + 40, H / 2 - 70);
        x.lineTo(W / 2 + 6, H / 2 - 52);
        x.fill();
        crayon('#ff9800', 6);
        x.beginPath();
        x.moveTo(W / 2 - 26, H / 2 + 44);
        x.lineTo(W / 2 - 46, H / 2 + 76);
        x.stroke();
        break;
      case 'eyes':
        x.fillStyle = '#20122a';
        x.fillRect(0, 0, W, H);
        srand(5);
        for (let i = 0; i < 14; i++) {
          const ex = 20 + rnd() * (W - 40);
          const ey = 20 + rnd() * (H - 40);
          const r = 8 + rnd() * 10;
          x.fillStyle = '#fff';
          x.beginPath();
          x.ellipse(ex, ey, r, r * 0.6, 0, 0, TAU);
          x.fill();
          x.fillStyle = '#c62828';
          x.beginPath();
          x.arc(ex, ey, r * 0.4, 0, TAU);
          x.fill();
        }
        break;
      case 'creature': {
        x.fillStyle = '#2a1238';
        x.beginPath();
        x.ellipse(W / 2, H / 2 + 14, 70, 64, 0, 0, TAU);
        x.fill();
        x.fillStyle = '#ffe14a';
        x.beginPath();
        x.ellipse(W / 2 - 26, H / 2 - 10, 12, 9, 0.2, 0, TAU);
        x.ellipse(W / 2 + 26, H / 2 - 10, 12, 9, -0.2, 0, TAU);
        x.fill();
        x.fillStyle = '#7a0f2a';
        x.beginPath();
        x.ellipse(W / 2, H / 2 + 32, 46, 26, 0, 0, Math.PI);
        x.fill();
        x.fillStyle = '#fff';
        x.beginPath();
        x.moveTo(W / 2 - 30, H / 2 + 32);
        x.lineTo(W / 2 - 22, H / 2 + 54);
        x.lineTo(W / 2 - 14, H / 2 + 32);
        x.moveTo(W / 2 + 14, H / 2 + 32);
        x.lineTo(W / 2 + 22, H / 2 + 54);
        x.lineTo(W / 2 + 30, H / 2 + 32);
        x.fill();
        break;
      }
      case 'scribble':
        srand(3);
        crayon('#212121', 3);
        x.beginPath();
        x.moveTo(W / 2, H / 2);
        for (let i = 0; i < 120; i++) x.lineTo(W / 2 + (rnd() - 0.5) * 200, H / 2 + (rnd() - 0.5) * 150);
        x.stroke();
        break;
      case 'handprints':
      case 'handsDark':
        for (let k = 0; k < 4; k++) {
          const hx = 40 + k * 58;
          const hy = 70 + (k % 2) * 50;
          x.fillStyle = kind === 'handsDark' ? '#3a1030' : ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28'][k];
          x.beginPath();
          x.ellipse(hx, hy, 16, 19, 0, 0, TAU);
          x.fill();
          for (let f = 0; f < 4; f++) {
            x.beginPath();
            x.ellipse(hx - 14 + f * 9.5, hy - 26, 4.2, 9, 0, 0, TAU);
            x.fill();
          }
          x.beginPath();
          x.ellipse(hx + 20, hy - 4, 4.5, 9, -0.8, 0, TAU);
          x.fill();
        }
        break;
    }
    grain(x, W, H, 10, 2);
    return texOf(c, false);
  });
}

/* ------------------------------ quadros (pinturas) ------------------------------ */
export type Painting = 'lake' | 'mountain' | 'moose' | 'portrait' | 'forest' | 'boat' | 'lakeMonster' | 'portraitEyes' | 'portraitEmpty' | 'mountainRed' | 'forestEyes' | 'boatEmpty';
export function paintingTex(kind: Painting): THREE.CanvasTexture {
  return cached('paint' + kind, () => {
    const W = 256;
    const H = 192;
    const [c, x] = cv(W, H);
    const sky = (a: string, b: string) => {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, a);
      g.addColorStop(1, b);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
    };
    const mountains = (col: string, snow = true) => {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, 130);
      x.lineTo(60, 60);
      x.lineTo(110, 115);
      x.lineTo(170, 45);
      x.lineTo(256, 125);
      x.lineTo(256, H);
      x.lineTo(0, H);
      x.fill();
      if (snow) {
        x.fillStyle = '#f4f4f4';
        x.beginPath();
        x.moveTo(170, 45);
        x.lineTo(152, 66);
        x.lineTo(176, 62);
        x.lineTo(190, 64);
        x.fill();
        x.beginPath();
        x.moveTo(60, 60);
        x.lineTo(46, 76);
        x.lineTo(72, 74);
        x.fill();
      }
    };
    const pines = (col: string, y0: number, n: number, eyes = false) => {
      srand(12);
      for (let i = 0; i < n; i++) {
        const tx = (i / n) * W + rnd() * 10;
        const th = 30 + rnd() * 30;
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(tx - 12, y0);
        x.lineTo(tx, y0 - th);
        x.lineTo(tx + 12, y0);
        x.fill();
        if (eyes && i % 3 === 1) {
          x.fillStyle = '#ffe14a';
          x.fillRect(tx - 5, y0 - 12, 3, 2);
          x.fillRect(tx + 2, y0 - 12, 3, 2);
        }
      }
    };
    switch (kind) {
      case 'lake':
      case 'lakeMonster':
        sky('#f6b26b', '#ffe0b2');
        mountains('#7e6a8a');
        x.fillStyle = '#4f7fa8';
        x.fillRect(0, 128, W, 64);
        x.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 8; i++) x.fillRect(20 + i * 30, 140 + (i % 3) * 14, 18, 2);
        pines('#2e4a2e', 132, 14);
        if (kind === 'lakeMonster') {
          x.fillStyle = '#2a1238';
          x.beginPath();
          x.ellipse(150, 150, 26, 16, 0, Math.PI, 0);
          x.fill();
          x.fillStyle = '#ffe14a';
          x.fillRect(140, 140, 5, 4);
          x.fillRect(155, 140, 5, 4);
        }
        break;
      case 'mountain':
      case 'mountainRed':
        sky(kind === 'mountainRed' ? '#7a0f1a' : '#8ec5ff', kind === 'mountainRed' ? '#ff6f61' : '#e3f2fd');
        mountains(kind === 'mountainRed' ? '#3a1020' : '#6d7f99');
        pines(kind === 'mountainRed' ? '#1a0810' : '#335c3a', H - 10, 12);
        break;
      case 'moose':
        sky('#a5d6a7', '#e8f5e9');
        pines('#2e5a32', H - 20, 10);
        x.fillStyle = '#6d4c41';
        x.beginPath();
        x.ellipse(128, 120, 40, 24, 0, 0, TAU);
        x.fill();
        x.fillRect(96, 124, 8, 40);
        x.fillRect(150, 124, 8, 40);
        x.beginPath();
        x.ellipse(170, 96, 14, 20, 0.5, 0, TAU);
        x.fill();
        x.strokeStyle = '#d7ccc8';
        x.lineWidth = 5;
        x.beginPath();
        x.moveTo(166, 80);
        x.lineTo(150, 60);
        x.moveTo(176, 80);
        x.lineTo(192, 60);
        x.stroke();
        break;
      case 'portrait':
      case 'portraitEyes':
      case 'portraitEmpty':
        sky('#5d4037', '#8d6e63');
        if (kind !== 'portraitEmpty') {
          x.fillStyle = '#9ccc65';
          x.beginPath();
          x.ellipse(128, 120, 60, 58, 0, 0, TAU);
          x.fill();
          x.fillStyle = '#33691e';
          x.fillRect(80, 60, 96, 16);
          x.fillRect(100, 26, 56, 40);
          x.fillStyle = '#fff';
          x.beginPath();
          x.arc(108, 112, 13, 0, TAU);
          x.arc(148, 112, 13, 0, TAU);
          x.fill();
          x.fillStyle = kind === 'portraitEyes' ? '#d50000' : '#3e2723';
          x.beginPath();
          x.arc(kind === 'portraitEyes' ? 104 : 110, 114, 6, 0, TAU);
          x.arc(kind === 'portraitEyes' ? 144 : 150, 114, 6, 0, TAU);
          x.fill();
          x.strokeStyle = '#3e2723';
          x.lineWidth = 3;
          x.beginPath();
          x.arc(128, 136, 14, 0.3, Math.PI - 0.3);
          x.stroke();
        }
        x.strokeStyle = '#c9a227';
        x.lineWidth = 4;
        x.strokeRect(6, 6, W - 12, H - 12);
        break;
      case 'forest':
      case 'forestEyes':
        sky('#1b2a4a', '#3f5a7a');
        pines('#1c3324', 120, 12);
        pines('#14261a', H, 9, kind === 'forestEyes');
        x.fillStyle = '#fff7d8';
        x.beginPath();
        x.arc(200, 40, 14, 0, TAU);
        x.fill();
        break;
      case 'boat':
      case 'boatEmpty':
        sky('#b3e5fc', '#e1f5fe');
        x.fillStyle = '#4f86b8';
        x.fillRect(0, 110, W, 82);
        if (kind === 'boat') {
          x.fillStyle = '#8d4e2a';
          x.beginPath();
          x.moveTo(80, 120);
          x.lineTo(180, 120);
          x.lineTo(166, 140);
          x.lineTo(94, 140);
          x.fill();
          x.fillStyle = '#fff';
          x.beginPath();
          x.moveTo(130, 116);
          x.lineTo(130, 50);
          x.lineTo(170, 112);
          x.fill();
        }
        break;
    }
    grain(x, W, H, 12, 4);
    return texOf(c, false);
  });
}

/** tela de monitor de segurança (grade de câmeras) */
export function screenTex(kind: 'grid' | 'static' | 'face' | 'off' | 'blue', label = ''): THREE.CanvasTexture {
  return cached('scr' + kind + label, () => {
    const W = 256;
    const H = 160;
    const [c, x] = cv(W, H);
    x.fillStyle = '#081018';
    x.fillRect(0, 0, W, H);
    if (kind === 'grid') {
      srand(label.length + 3);
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const X = 6 + i * 124;
          const Y = 6 + j * 76;
          const g = x.createLinearGradient(X, Y, X, Y + 70);
          g.addColorStop(0, '#16303a');
          g.addColorStop(1, '#0c1c22');
          x.fillStyle = g;
          x.fillRect(X, Y, 118, 70);
          x.fillStyle = 'rgba(140,220,200,0.25)';
          x.fillRect(X + 10 + rnd() * 50, Y + 30 + rnd() * 20, 30 + rnd() * 30, 20);
          x.fillRect(X, Y + 54, 118, 2);
          x.fillStyle = '#ff5252';
          x.beginPath();
          x.arc(X + 10, Y + 9, 3, 0, TAU);
          x.fill();
          x.fillStyle = '#9fe';
          x.font = '9px monospace';
          x.fillText('CAM ' + (j * 2 + i + 1), X + 18, Y + 12);
        }
    } else if (kind === 'static') {
      const d = x.getImageData(0, 0, W, H);
      srand(9);
      for (let i = 0; i < d.data.length; i += 4) d.data[i] = d.data[i + 1] = d.data[i + 2] = rnd() * 200;
      x.putImageData(d, 0, 0);
    } else if (kind === 'face') {
      x.fillStyle = '#180a20';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#ffe14a';
      x.beginPath();
      x.ellipse(96, 64, 16, 11, 0.2, 0, TAU);
      x.ellipse(160, 64, 16, 11, -0.2, 0, TAU);
      x.fill();
      x.fillStyle = '#7a0f2a';
      x.beginPath();
      x.ellipse(128, 100, 52, 30, 0, 0, Math.PI);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.moveTo(94, 100);
      x.lineTo(104, 126);
      x.lineTo(114, 100);
      x.moveTo(142, 100);
      x.lineTo(152, 126);
      x.lineTo(162, 100);
      x.fill();
    } else if (kind === 'blue') {
      x.fillStyle = '#1565c0';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff';
      x.font = 'bold 22px monospace';
      x.fillText(':(', 20, 50);
    }
    // linhas de varredura
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < H; y += 3) x.fillRect(0, y, W, 1);
    return texOf(c, false);
  });
}

/** etiqueta de chave (cor + ícone simples) */
export type TagIcon = 'star' | 'heart' | 'moon' | 'leaf' | 'drop' | 'sun';
export function tagTex(col: string, icon: TagIcon): THREE.CanvasTexture {
  return cached('tag' + col + icon, () => {
    const S = 64;
    const [c, x] = cv(S);
    x.fillStyle = col;
    x.fillRect(0, 0, S, S);
    x.fillStyle = '#fff';
    const m = S / 2;
    switch (icon) {
      case 'star':
        star(x, m, m, 20);
        break;
      case 'heart':
        heart(x, m, m + 4, 22);
        break;
      case 'moon':
        moon(x, m, m, 18, col);
        break;
      case 'leaf':
        x.beginPath();
        x.ellipse(m, m, 20, 10, -0.7, 0, TAU);
        x.fill();
        break;
      case 'drop':
        x.beginPath();
        x.arc(m, m + 6, 13, 0, TAU);
        x.moveTo(m - 12, m + 2);
        x.lineTo(m, m - 22);
        x.lineTo(m + 12, m + 2);
        x.fill();
        break;
      case 'sun':
        x.beginPath();
        x.arc(m, m, 11, 0, TAU);
        x.fill();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          x.fillRect(m + Math.cos(a) * 17 - 3, m + Math.sin(a) * 17 - 3, 6, 6);
        }
        break;
    }
    return texOf(c, false);
  });
}

/** pegadas (lama) num quadrado transparente */
export function footprintTex(kind: 'boot' | 'claw' | 'bare'): THREE.CanvasTexture {
  return cached('foot' + kind, () => {
    const W = 128;
    const H = 512;
    const [c, x] = cv(W, H);
    x.fillStyle = kind === 'claw' ? 'rgba(40,10,50,0.85)' : 'rgba(50,32,20,0.8)';
    for (let i = 0; i < 6; i++) {
      const fx = i % 2 ? 80 : 46;
      const fy = H - 40 - i * 80;
      if (kind === 'boot') {
        x.beginPath();
        x.ellipse(fx, fy, 12, 22, 0, 0, TAU);
        x.fill();
        x.beginPath();
        x.ellipse(fx, fy + 30, 10, 11, 0, 0, TAU);
        x.fill();
      } else if (kind === 'claw') {
        x.beginPath();
        x.ellipse(fx, fy, 16, 18, 0, 0, TAU);
        x.fill();
        for (let k = -1; k <= 1; k++) {
          x.beginPath();
          x.moveTo(fx + k * 10 - 4, fy - 14);
          x.lineTo(fx + k * 14, fy - 36);
          x.lineTo(fx + k * 10 + 4, fy - 14);
          x.fill();
        }
      } else {
        x.beginPath();
        x.ellipse(fx, fy, 10, 16, 0, 0, TAU);
        x.fill();
        for (let k = 0; k < 5; k++) {
          x.beginPath();
          x.arc(fx - 10 + k * 5, fy - 20 - (k === 0 ? 0 : 2), 3, 0, TAU);
          x.fill();
        }
      }
    }
    return texOf(c, false);
  });
}
