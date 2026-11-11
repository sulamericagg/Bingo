/* ============================================================
 *  GARIMPO BRUTO — bateia/peneira: arte 2D pré-desenhada (uma vez, ao abrir).
 *  Pedras, cascalho, areia, areia preta, palhetas e pepitas de ouro (sprites com sombreado),
 *  leito do rio, cáusticas que repetem sem emenda, bateia de aço (aro brilhante, anéis
 *  escovados, riffles), peneira de madeira com tela, balde e frasco de vidro.
 *  Nada aqui roda por quadro: o jogo só faz drawImage destes canvases.
 * ============================================================ */

export type Rnd = () => number;
export function rng(seed: number): Rnd {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
const ctx2 = (c: HTMLCanvasElement) => c.getContext('2d')!;

function blobPath(x: CanvasRenderingContext2D, r: Rnd, cx: number, cy: number, rad: number, n: number, jag: number, sy = 1): void {
  x.beginPath();
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (1 - jag + r() * jag * 2);
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sy);
  }
  // curva suave pelos pontos médios
  for (let i = 0; i < n; i++) {
    const x0 = pts[i * 2];
    const y0 = pts[i * 2 + 1];
    const x1 = pts[((i + 1) % n) * 2];
    const y1 = pts[((i + 1) % n) * 2 + 1];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) x.moveTo(mx, my);
    else x.quadraticCurveTo(x0, y0, mx, my);
  }
  x.quadraticCurveTo(pts[0], pts[1], (pts[0] + pts[2]) / 2, (pts[1] + pts[3]) / 2);
  x.closePath();
}

const hex = (r: number, g: number, b: number) => `rgb(${Math.round(Math.max(0, Math.min(255, r)))},${Math.round(Math.max(0, Math.min(255, g)))},${Math.round(Math.max(0, Math.min(255, b)))})`;

/** seixo/pedra: blob com sombra, gradiente de luz (luz de cima-esquerda) e pintas */
export function rockSprite(r: Rnd, size: number, base: [number, number, number], speck = 0.5): HTMLCanvasElement {
  const pad = 3;
  const c = mk(size + pad * 2, size + pad * 2);
  const x = ctx2(c);
  const cx = c.width / 2;
  const cy = c.height / 2;
  const rad = size / 2;
  // sombra
  x.fillStyle = 'rgba(0,0,0,.35)';
  blobPath(x, rng(Math.floor(r() * 1e9)), cx + 1.2, cy + 1.6, rad * 0.98, 9, 0.18, 0.92);
  x.fill();
  const seed = Math.floor(r() * 1e9);
  blobPath(x, rng(seed), cx, cy, rad * 0.95, 9, 0.18, 0.88);
  const v = (r() - 0.5) * 40;
  const g = x.createRadialGradient(cx - rad * 0.35, cy - rad * 0.4, rad * 0.1, cx, cy, rad * 1.05);
  g.addColorStop(0, hex(base[0] + 60 + v, base[1] + 60 + v, base[2] + 55 + v));
  g.addColorStop(0.55, hex(base[0] + v, base[1] + v, base[2] + v));
  g.addColorStop(1, hex(base[0] * 0.55 + v, base[1] * 0.55 + v, base[2] * 0.55 + v));
  x.fillStyle = g;
  x.fill();
  // pintas (quartzo, mica)
  x.save();
  x.clip();
  const n = Math.round(size * speck * 0.8);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * rad;
    x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.18)';
    x.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + r() * 1.4, 1 + r() * 1.4);
  }
  // veio claro às vezes
  if (r() < 0.35 && size > 14) {
    x.strokeStyle = 'rgba(240,235,220,.45)';
    x.lineWidth = Math.max(1, size * 0.06);
    x.beginPath();
    x.moveTo(cx - rad, cy + (r() - 0.5) * rad);
    x.quadraticCurveTo(cx, cy + (r() - 0.5) * rad, cx + rad, cy + (r() - 0.5) * rad);
    x.stroke();
  }
  x.restore();
  // brilho molhado
  x.fillStyle = 'rgba(255,255,255,.28)';
  x.beginPath();
  x.ellipse(cx - rad * 0.32, cy - rad * 0.38, rad * 0.32, rad * 0.16, -0.5, 0, Math.PI * 2);
  x.fill();
  return c;
}

/** grãozinho (areia, areia preta): disco com luz */
export function grainSprite(size: number, base: [number, number, number], shine: number): HTMLCanvasElement {
  const c = mk(size + 2, size + 2);
  const x = ctx2(c);
  const cx = c.width / 2;
  const cy = c.height / 2;
  const g = x.createRadialGradient(cx - size * 0.2, cy - size * 0.2, 0, cx, cy, size / 2);
  g.addColorStop(0, hex(base[0] + 90 * shine, base[1] + 90 * shine, base[2] + 90 * shine));
  g.addColorStop(0.5, hex(base[0], base[1], base[2]));
  g.addColorStop(1, hex(base[0] * 0.5, base[1] * 0.5, base[2] * 0.5));
  x.fillStyle = g;
  x.beginPath();
  x.arc(cx, cy, size / 2, 0, Math.PI * 2);
  x.fill();
  return c;
}

/** palheta de ouro: lasca achatada, irregular, com borda brilhante */
export function flakeSprite(r: Rnd, size: number): HTMLCanvasElement {
  const c = mk(size + 4, size + 4);
  const x = ctx2(c);
  const cx = c.width / 2;
  const cy = c.height / 2;
  blobPath(x, r, cx, cy, size / 2, 6, 0.42, 0.75 + r() * 0.25);
  const g = x.createLinearGradient(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);
  g.addColorStop(0, '#fff6b0');
  g.addColorStop(0.35, '#ffd23a');
  g.addColorStop(0.75, '#e0a010');
  g.addColorStop(1, '#9a6a00');
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = 'rgba(120,70,0,.7)';
  x.lineWidth = 0.8;
  x.stroke();
  x.fillStyle = 'rgba(255,255,240,.9)';
  x.beginPath();
  x.arc(cx - size * 0.15, cy - size * 0.15, Math.max(0.8, size * 0.12), 0, Math.PI * 2);
  x.fill();
  return c;
}

/** pepita: blob gordo com dobras, sombra e reflexos */
export function nuggetSprite(r: Rnd, size: number): HTMLCanvasElement {
  const pad = 5;
  const c = mk(size + pad * 2, size + pad * 2);
  const x = ctx2(c);
  const cx = c.width / 2;
  const cy = c.height / 2;
  const rad = size / 2;
  const seed = Math.floor(r() * 1e9);
  x.fillStyle = 'rgba(0,0,0,.4)';
  blobPath(x, rng(seed), cx + 1.5, cy + 2.2, rad, 8, 0.25, 0.85);
  x.fill();
  blobPath(x, rng(seed), cx, cy, rad, 8, 0.25, 0.85);
  const g = x.createRadialGradient(cx - rad * 0.35, cy - rad * 0.35, rad * 0.05, cx, cy, rad * 1.1);
  g.addColorStop(0, '#fffbd0');
  g.addColorStop(0.25, '#ffe066');
  g.addColorStop(0.6, '#e8a90e');
  g.addColorStop(1, '#7a4a00');
  x.fillStyle = g;
  x.fill();
  x.save();
  x.clip();
  // dobras (relevo) da pepita
  for (let i = 0; i < 7; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * rad * 0.7;
    const px = cx + Math.cos(a) * d;
    const py = cy + Math.sin(a) * d;
    const rr = rad * (0.15 + r() * 0.2);
    const gg = x.createRadialGradient(px - rr * 0.3, py - rr * 0.3, 0, px, py, rr);
    gg.addColorStop(0, 'rgba(255,250,200,.55)');
    gg.addColorStop(0.6, 'rgba(255,200,40,0)');
    gg.addColorStop(1, 'rgba(110,60,0,.35)');
    x.fillStyle = gg;
    x.beginPath();
    x.arc(px, py, rr, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
  x.fillStyle = 'rgba(255,255,255,.95)';
  x.beginPath();
  x.ellipse(cx - rad * 0.35, cy - rad * 0.38, rad * 0.18, rad * 0.09, -0.6, 0, Math.PI * 2);
  x.fill();
  return c;
}

/** brilho (estrela de 4 pontas com halo) — desenhar com 'lighter' */
export function glintSprite(size: number, warm = true): HTMLCanvasElement {
  const c = mk(size, size);
  const x = ctx2(c);
  const h = size / 2;
  const g = x.createRadialGradient(h, h, 0, h, h, h);
  g.addColorStop(0, warm ? 'rgba(255,250,210,1)' : 'rgba(255,255,255,1)');
  g.addColorStop(0.15, warm ? 'rgba(255,220,90,.7)' : 'rgba(200,240,255,.6)');
  g.addColorStop(1, 'rgba(255,200,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  x.fillStyle = 'rgba(255,255,240,.95)';
  x.beginPath();
  x.moveTo(h, 0);
  x.quadraticCurveTo(h, h, size, h);
  x.quadraticCurveTo(h, h, h, size);
  x.quadraticCurveTo(h, h, 0, h);
  x.quadraticCurveTo(h, h, h, 0);
  x.fill();
  return c;
}

/** leito do rio visto de cima: cascalho, areia, algas, mais escuro no fundo (direita) */
export function riverBg(w: number, h: number, r: Rnd): HTMLCanvasElement {
  const c = mk(w, h);
  const x = ctx2(c);
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#6f6146');
  g.addColorStop(0.45, '#52604c');
  g.addColorStop(1, '#2c4a4c');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // manchas de areia
  for (let i = 0; i < 26; i++) {
    const px = r() * w;
    const py = r() * h;
    const rr = 30 + r() * 90;
    const gg = x.createRadialGradient(px, py, 0, px, py, rr);
    gg.addColorStop(0, 'rgba(200,180,130,.22)');
    gg.addColorStop(1, 'rgba(200,180,130,0)');
    x.fillStyle = gg;
    x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  // seixos
  const n = Math.round((w * h) / 900);
  for (let i = 0; i < n; i++) {
    const sz = 6 + r() * r() * 34;
    const tone = 70 + r() * 70;
    const sp = rockSprite(r, sz, [tone + 10, tone, tone - 15], 0.3);
    x.globalAlpha = 0.55 + r() * 0.35;
    x.drawImage(sp, r() * w - sp.width / 2, r() * h - sp.height / 2);
  }
  x.globalAlpha = 1;
  // água por cima (azul-esverdeado, mais fundo à direita)
  const wg = x.createLinearGradient(0, 0, w, 0);
  wg.addColorStop(0, 'rgba(40,110,120,.35)');
  wg.addColorStop(1, 'rgba(14,60,80,.6)');
  x.fillStyle = wg;
  x.fillRect(0, 0, w, h);
  // borda do rio (margem) em cima à esquerda: barranco
  x.fillStyle = 'rgba(90,64,38,.9)';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(w * 0.42, 0);
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    x.lineTo(w * 0.42 * (1 - k) + Math.sin(i * 1.7) * 8, h * 0.16 * k + 4 + Math.cos(i * 2.3) * 5);
  }
  x.lineTo(0, h * 0.2);
  x.closePath();
  x.fill();
  x.fillStyle = 'rgba(70,120,50,.9)';
  x.beginPath();
  x.moveTo(0, 0);
  x.lineTo(w * 0.32, 0);
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    x.lineTo(w * 0.32 * (1 - k) + Math.sin(i * 2.1) * 6, h * 0.09 * k + Math.cos(i * 3.1) * 4);
  }
  x.lineTo(0, h * 0.1);
  x.closePath();
  x.fill();
  return c;
}

/** cáusticas: rede de linhas claras que repete sem emenda (tile s×s) */
export function causticTile(s: number, r: Rnd): HTMLCanvasElement {
  const c = mk(s, s);
  const x = ctx2(c);
  x.strokeStyle = 'rgba(210,250,255,.55)';
  x.lineCap = 'round';
  const pts: number[] = [];
  const n = 22;
  for (let i = 0; i < n; i++) pts.push(r() * s, r() * s);
  // liga cada ponto aos 3 mais próximos (com repetição) — células tipo Voronoi
  for (let i = 0; i < n; i++) {
    const ax = pts[i * 2];
    const ay = pts[i * 2 + 1];
    const near: [number, number, number][] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          const bx = pts[j * 2] + ox * s;
          const by = pts[j * 2 + 1] + oy * s;
          near.push([Math.hypot(bx - ax, by - ay), bx, by]);
        }
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < 3; k++) {
      const [, bx, by] = near[k];
      for (let ox = -1; ox <= 1; ox++)
        for (let oy = -1; oy <= 1; oy++) {
          x.lineWidth = 1.2 + r() * 2.2;
          x.beginPath();
          const mx = (ax + bx) / 2 + (r() - 0.5) * 14;
          const my = (ay + by) / 2 + (r() - 0.5) * 14;
          x.moveTo(ax + ox * s, ay + oy * s);
          x.quadraticCurveTo(mx + ox * s, my + oy * s, bx + ox * s, by + oy * s);
          x.stroke();
        }
    }
  }
  return c;
}

/** bateia de aço: fundo cônico (escuro no centro), anéis escovados, riffles do lado do lábio (+x), aro */
export function panArt(R: number): { bowl: HTMLCanvasElement; rim: HTMLCanvasElement } {
  const S = Math.ceil(R * 2 + 16);
  const h = S / 2;
  const bowl = mk(S, S);
  const x = ctx2(bowl);
  // sombra no rio
  const sh = x.createRadialGradient(h + R * 0.06, h + R * 0.1, R * 0.8, h + R * 0.06, h + R * 0.1, R * 1.08);
  sh.addColorStop(0, 'rgba(0,0,0,.45)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = sh;
  x.fillRect(0, 0, S, S);
  // fundo: cone (luz de cima-esquerda: lado esquerdo-alto escuro por dentro, direito-baixo claro)
  const g = x.createRadialGradient(h, h, 0, h, h, R);
  g.addColorStop(0, '#5b6670');
  g.addColorStop(0.18, '#6c7882');
  g.addColorStop(0.7, '#9aa6b0');
  g.addColorStop(0.93, '#b8c3cc');
  g.addColorStop(1, '#7c8791');
  x.fillStyle = g;
  x.beginPath();
  x.arc(h, h, R, 0, Math.PI * 2);
  x.fill();
  // sombreado direcional do cone
  const d = x.createLinearGradient(h - R, h - R, h + R, h + R);
  d.addColorStop(0, 'rgba(20,30,40,.35)');
  d.addColorStop(0.5, 'rgba(0,0,0,0)');
  d.addColorStop(1, 'rgba(255,255,255,.18)');
  x.fillStyle = d;
  x.beginPath();
  x.arc(h, h, R, 0, Math.PI * 2);
  x.fill();
  // anéis escovados (torno)
  for (let rr = R * 0.08; rr < R * 0.96; rr += 1.6) {
    x.strokeStyle = (Math.round(rr * 7) & 3) === 0 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.045)';
    x.lineWidth = 1;
    x.beginPath();
    x.arc(h, h, rr, 0, Math.PI * 2);
    x.stroke();
  }
  // reflexo especular em arco
  x.strokeStyle = 'rgba(255,255,255,.22)';
  x.lineWidth = R * 0.07;
  x.beginPath();
  x.arc(h, h, R * 0.62, Math.PI * 1.08, Math.PI * 1.42);
  x.stroke();
  x.strokeStyle = 'rgba(255,255,255,.12)';
  x.lineWidth = R * 0.05;
  x.beginPath();
  x.arc(h, h, R * 0.4, Math.PI * 0.1, Math.PI * 0.35);
  x.stroke();
  // riffles (degraus) do lado do lábio, à direita
  for (let i = 0; i < 3; i++) {
    const rr = R * (0.7 + i * 0.085);
    x.strokeStyle = 'rgba(30,38,46,.55)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(h, h, rr, -0.85, 0.85);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,.35)';
    x.lineWidth = 1.2;
    x.beginPath();
    x.arc(h, h, rr - 2, -0.85, 0.85);
    x.stroke();
  }
  // aro (desenhado por cima das partículas)
  const rim = mk(S, S);
  const y = ctx2(rim);
  const rg = y.createLinearGradient(h - R, h - R, h + R, h + R);
  rg.addColorStop(0, '#f4f8fb');
  rg.addColorStop(0.3, '#aeb9c2');
  rg.addColorStop(0.55, '#e6edf2');
  rg.addColorStop(0.8, '#7d8892');
  rg.addColorStop(1, '#c9d2d9');
  y.strokeStyle = rg;
  y.lineWidth = R * 0.075;
  y.beginPath();
  y.arc(h, h, R * 1.0, 0, Math.PI * 2);
  y.stroke();
  y.strokeStyle = 'rgba(40,50,60,.6)';
  y.lineWidth = 1.5;
  y.beginPath();
  y.arc(h, h, R * 0.96, 0, Math.PI * 2);
  y.stroke();
  y.strokeStyle = 'rgba(255,255,255,.75)';
  y.lineWidth = 1.5;
  y.beginPath();
  y.arc(h, h, R * 1.035, Math.PI * 0.95, Math.PI * 1.55);
  y.stroke();
  return { bowl, rim };
}

/** peneira de madeira (aro) e tela de arame */
export function sieveArt(R: number): { mesh: HTMLCanvasElement; frame: HTMLCanvasElement } {
  const S = Math.ceil(R * 2 + 30);
  const h = S / 2;
  const mesh = mk(S, S);
  const x = ctx2(mesh);
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.beginPath();
  x.arc(h + 6, h + 9, R * 1.04, 0, Math.PI * 2);
  x.fill();
  x.save();
  x.beginPath();
  x.arc(h, h, R, 0, Math.PI * 2);
  x.clip();
  x.fillStyle = 'rgba(20,14,8,.35)';
  x.fillRect(0, 0, S, S);
  const step = Math.max(7, R / 13);
  for (let i = -R; i <= R; i += step) {
    x.strokeStyle = 'rgba(30,30,30,.7)';
    x.lineWidth = 2.6;
    x.beginPath();
    x.moveTo(h + i + 1, h - R);
    x.lineTo(h + i + 1, h + R);
    x.moveTo(h - R, h + i + 1);
    x.lineTo(h + R, h + i + 1);
    x.stroke();
    x.strokeStyle = 'rgba(205,210,214,.95)';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(h + i, h - R);
    x.lineTo(h + i, h + R);
    x.moveTo(h - R, h + i);
    x.lineTo(h + R, h + i);
    x.stroke();
  }
  x.restore();
  const frame = mk(S, S);
  const y = ctx2(frame);
  const fw = R * 0.16;
  const g = y.createRadialGradient(h, h, R - 2, h, h, R + fw);
  g.addColorStop(0, '#6a4220');
  g.addColorStop(0.3, '#c58a4c');
  g.addColorStop(0.7, '#a26a35');
  g.addColorStop(1, '#5a361a');
  y.strokeStyle = g;
  y.lineWidth = fw;
  y.beginPath();
  y.arc(h, h, R + fw / 2 - 1, 0, Math.PI * 2);
  y.stroke();
  // veios da madeira
  const r = rng(77);
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const L = 0.15 + r() * 0.3;
    y.strokeStyle = r() < 0.5 ? 'rgba(60,30,10,.35)' : 'rgba(255,220,170,.18)';
    y.lineWidth = 1;
    y.beginPath();
    y.arc(h, h, R + fw * (0.15 + r() * 0.75), a, a + L);
    y.stroke();
  }
  // pregos
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    y.fillStyle = '#3a3a3a';
    y.beginPath();
    y.arc(h + Math.cos(a) * (R + fw / 2), h + Math.sin(a) * (R + fw / 2), 2.2, 0, Math.PI * 2);
    y.fill();
    y.fillStyle = 'rgba(255,255,255,.6)';
    y.fillRect(h + Math.cos(a) * (R + fw / 2) - 1, h + Math.sin(a) * (R + fw / 2) - 1, 1, 1);
  }
  return { mesh, frame };
}

/** balde visto de cima (boca), com água/terra dentro */
export function bucketArt(R: number, fill: string): HTMLCanvasElement {
  const S = Math.ceil(R * 2 + 12);
  const h = S / 2;
  const c = mk(S, S);
  const x = ctx2(c);
  x.fillStyle = 'rgba(0,0,0,.35)';
  x.beginPath();
  x.arc(h + 4, h + 5, R, 0, Math.PI * 2);
  x.fill();
  const g = x.createRadialGradient(h - R * 0.3, h - R * 0.3, R * 0.2, h, h, R);
  g.addColorStop(0, '#ff9a3a');
  g.addColorStop(1, '#b4530e');
  x.fillStyle = g;
  x.beginPath();
  x.arc(h, h, R, 0, Math.PI * 2);
  x.fill();
  const ig = x.createRadialGradient(h + R * 0.2, h + R * 0.2, 0, h, h, R * 0.85);
  ig.addColorStop(0, fill);
  ig.addColorStop(1, '#2a1c10');
  x.fillStyle = ig;
  x.beginPath();
  x.arc(h, h, R * 0.85, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,.35)';
  x.lineWidth = 2;
  x.beginPath();
  x.arc(h, h, R * 0.93, Math.PI, Math.PI * 1.5);
  x.stroke();
  return c;
}

/** frasco de vidro (sem o ouro; o ouro é desenhado por quadro por baixo do brilho) */
export function vialArt(w: number, h: number): { back: HTMLCanvasElement; front: HTMLCanvasElement } {
  const back = mk(w, h);
  const x = ctx2(back);
  const neck = w * 0.36;
  const top = h * 0.12;
  const path = (c: CanvasRenderingContext2D) => {
    c.beginPath();
    c.moveTo(w / 2 - neck / 2, top);
    c.lineTo(w / 2 - neck / 2, h * 0.25);
    c.quadraticCurveTo(w * 0.08, h * 0.32, w * 0.08, h * 0.45);
    c.lineTo(w * 0.08, h * 0.88);
    c.quadraticCurveTo(w * 0.08, h * 0.98, w / 2, h * 0.98);
    c.quadraticCurveTo(w * 0.92, h * 0.98, w * 0.92, h * 0.88);
    c.lineTo(w * 0.92, h * 0.45);
    c.quadraticCurveTo(w * 0.92, h * 0.32, w / 2 + neck / 2, h * 0.25);
    c.lineTo(w / 2 + neck / 2, top);
    c.closePath();
  };
  path(x);
  x.fillStyle = 'rgba(150,210,230,.28)';
  x.fill();
  // água dentro
  x.save();
  path(x);
  x.clip();
  const wg = x.createLinearGradient(0, h * 0.35, 0, h);
  wg.addColorStop(0, 'rgba(120,200,230,.35)');
  wg.addColorStop(1, 'rgba(60,140,180,.55)');
  x.fillStyle = wg;
  x.fillRect(0, h * 0.36, w, h);
  x.restore();
  const front = mk(w, h);
  const y = ctx2(front);
  path(y);
  y.strokeStyle = 'rgba(230,250,255,.9)';
  y.lineWidth = 2.2;
  y.stroke();
  y.strokeStyle = 'rgba(255,255,255,.65)';
  y.lineWidth = 3;
  y.beginPath();
  y.moveTo(w * 0.2, h * 0.5);
  y.lineTo(w * 0.2, h * 0.85);
  y.stroke();
  // rolha
  const rg = y.createLinearGradient(0, 0, w, 0);
  rg.addColorStop(0, '#8a5a2c');
  rg.addColorStop(0.5, '#c8925a');
  rg.addColorStop(1, '#7a4a20');
  y.fillStyle = rg;
  y.beginPath();
  y.roundRect(w / 2 - neck * 0.62, 0, neck * 1.24, top + 4, 4);
  y.fill();
  return { back, front };
}

/** mão apontando (tutorial): luva clara com contorno escuro, ponta do dedo em (0,0) */
export function handPath(): Path2D {
  return new Path2D(
    'M0 0c-3 0-5 2-5 5v22c-3-3-8-5-11-2-2 2-1 5 1 7l13 14c3 3 7 5 12 5h8c8 0 13-6 13-13V22c0-3-2-5-5-5s-5 2-5 5v-2c0-3-2-5-5-5s-5 2-5 5v-1c0-3-2-5-5-5s-4 1-4 3V5c0-3-2-5-5-5z',
  );
}
