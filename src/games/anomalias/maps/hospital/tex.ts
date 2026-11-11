/* ============================================================
 *  HOSPITAL — texturas em canvas (sem arquivos): piso vinílico, parede
 *  com rodameio, forro, quadros (e suas versões "erradas"), telas,
 *  janela noturna, espelho, placas com ícone.
 * ============================================================ */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const INK = '#1d0b3a';
export function cv(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}
export function tex(c: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** ruído determinístico */
function rnd(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
}

/** piso vinílico xadrez (1 repetição = 2 lajotas) */
export function floorTex(a: string, b: string, seed = 1): THREE.CanvasTexture {
  const [c, x] = cv(128, 128);
  const r = rnd(seed);
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? a : b;
      x.fillRect(i * 64, j * 64, 64, 64);
    }
  for (let k = 0; k < 420; k++) {
    x.fillStyle = r() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.06)';
    x.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2);
  }
  x.strokeStyle = 'rgba(0,0,0,.18)';
  x.lineWidth = 1.5;
  for (let i = 0; i <= 2; i++) {
    x.beginPath();
    x.moveTo(i * 64, 0);
    x.lineTo(i * 64, 128);
    x.moveTo(0, i * 64);
    x.lineTo(128, i * 64);
    x.stroke();
  }
  return tex(c, true);
}

/** parede: tinta em cima, rodameio colorido embaixo, faixa e rodapé (v = altura inteira de 3 m) */
export function wallTex(top: string, low: string, band: string): THREE.CanvasTexture {
  const [c, x] = cv(64, 256);
  x.fillStyle = top;
  x.fillRect(0, 0, 64, 256);
  // rodameio (até 1,0 m de 3 m → 1/3 de baixo)
  const y0 = 256 - 256 / 3;
  x.fillStyle = low;
  x.fillRect(0, y0, 64, 256 - y0);
  x.fillStyle = 'rgba(255,255,255,.06)';
  for (let i = 0; i < 64; i += 16) x.fillRect(i, y0, 2, 256 - y0);
  x.fillStyle = band;
  x.fillRect(0, y0 - 5, 64, 7);
  x.fillStyle = 'rgba(255,255,255,.25)';
  x.fillRect(0, y0 - 5, 64, 2);
  // rodapé
  x.fillStyle = '#3b3550';
  x.fillRect(0, 248, 64, 8);
  // leve gradiente (teto mais escuro)
  const g = x.createLinearGradient(0, 0, 0, 120);
  g.addColorStop(0, 'rgba(0,0,0,.18)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 120);
  return tex(c, true);
}

export function ceilTex(): THREE.CanvasTexture {
  const [c, x] = cv(64, 64);
  x.fillStyle = '#c9ccd6';
  x.fillRect(0, 0, 64, 64);
  const r = rnd(7);
  for (let k = 0; k < 160; k++) {
    x.fillStyle = 'rgba(0,0,0,.08)';
    x.fillRect(r() * 64, r() * 64, 1, 1);
  }
  x.strokeStyle = '#9aa0b0';
  x.lineWidth = 3;
  x.strokeRect(0, 0, 64, 64);
  return tex(c, true);
}

/* ------------------------------ quadros ------------------------------ */
/** desenha o Bocudo (rosto) num canvas */
export function bocudoFace(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.save();
  x.fillStyle = '#4b2a7a';
  x.strokeStyle = INK;
  x.lineWidth = r * 0.08;
  x.beginPath();
  x.arc(cx, cy, r, 0, TAU);
  x.fill();
  x.stroke();
  for (const s of [-1, 1]) {
    x.fillStyle = '#ffe14a';
    x.beginPath();
    x.ellipse(cx + s * r * 0.38, cy - r * 0.32, r * 0.17, r * 0.2, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#1a0420';
    x.fillRect(cx + s * r * 0.38 - r * 0.03, cy - r * 0.45, r * 0.06, r * 0.26);
  }
  x.fillStyle = '#33061a';
  x.beginPath();
  x.ellipse(cx, cy + r * 0.3, r * 0.6, r * 0.38, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#ff6f91';
  x.beginPath();
  x.ellipse(cx, cy + r * 0.5, r * 0.3, r * 0.12, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#fffbe8';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + s * r * 0.32, cy);
    x.lineTo(cx + s * r * 0.24, cy + r * 0.24);
    x.lineTo(cx + s * r * 0.16, cy);
    x.fill();
  }
  x.restore();
}
function eyesAt(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, glow = '#ffe14a'): void {
  for (const s of [-1, 1]) {
    x.fillStyle = glow;
    x.beginPath();
    x.ellipse(cx + s * r, cy, r * 0.7, r * 0.45, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#1a0420';
    x.beginPath();
    x.arc(cx + s * r, cy, r * 0.25, 0, TAU);
    x.fill();
  }
}

export type PicKind = 'land' | 'flower' | 'bloop' | 'boat' | 'kids';
/** quadro: v=0 normal; 1..3 anomalias (olhos, Bocudo, de ponta-cabeça/escuro) */
export function paintingTex(kind: PicKind, v: number): THREE.CanvasTexture {
  const W = 192,
    H = 144;
  const [c, x] = cv(W, H);
  const draw = () => {
    if (kind === 'land') {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, v === 3 ? '#1a1030' : '#8fd3ff');
      g.addColorStop(1, v === 3 ? '#402050' : '#e6f7ff');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      x.fillStyle = v === 3 ? '#ff4f6a' : '#ffd34a';
      x.beginPath();
      x.arc(150, 40, 20, 0, TAU);
      x.fill();
      if (v === 1) eyesAt(x, 150, 40, 8, '#fff');
      x.fillStyle = '#5cc86a';
      x.beginPath();
      x.moveTo(0, 110);
      x.quadraticCurveTo(60, 70, 120, 105);
      x.quadraticCurveTo(160, 90, W, 100);
      x.lineTo(W, H);
      x.lineTo(0, H);
      x.fill();
      x.fillStyle = '#ff8a65';
      x.fillRect(40, 84, 34, 26);
      x.fillStyle = '#c0392b';
      x.beginPath();
      x.moveTo(36, 86);
      x.lineTo(57, 66);
      x.lineTo(78, 86);
      x.fill();
      x.fillStyle = v === 1 ? '#ffe14a' : '#5ad1ff';
      x.fillRect(50, 92, 10, 10);
      if (v === 2) bocudoFace(x, 120, 100, 26);
    } else if (kind === 'flower') {
      x.fillStyle = v === 3 ? '#2a1030' : '#fff0c8';
      x.fillRect(0, 0, W, H);
      x.fillStyle = '#7a5a40';
      x.fillRect(80, 92, 32, 40);
      const petals = v === 3 ? '#555' : '#ff5c9a';
      for (const [px, py] of [
        [72, 50],
        [96, 36],
        [120, 52],
      ]) {
        x.strokeStyle = '#3a8a3a';
        x.lineWidth = 4;
        x.beginPath();
        x.moveTo(96, 94);
        x.lineTo(px, py);
        x.stroke();
        for (let k = 0; k < 6; k++) {
          x.fillStyle = petals;
          x.beginPath();
          x.arc(px + Math.cos((k / 6) * TAU) * 10, py + Math.sin((k / 6) * TAU) * 10, 7, 0, TAU);
          x.fill();
        }
        x.fillStyle = '#ffd34a';
        x.beginPath();
        x.arc(px, py, 6, 0, TAU);
        x.fill();
        if (v === 1) eyesAt(x, px, py, 3.2, '#fff');
      }
      if (v === 2) bocudoFace(x, 96, 40, 30);
    } else if (kind === 'bloop') {
      x.fillStyle = '#ffe6f2';
      x.fillRect(0, 0, W, H);
      const col = v === 3 ? '#555577' : '#7ad0ff';
      x.fillStyle = col;
      x.strokeStyle = INK;
      x.lineWidth = 4;
      x.beginPath();
      x.arc(96, 80, 46, 0, TAU);
      x.fill();
      x.stroke();
      if (v === 2) {
        bocudoFace(x, 96, 80, 46);
      } else {
        for (const s of [-1, 1]) {
          x.fillStyle = v === 1 ? '#ffe14a' : '#fff';
          x.beginPath();
          x.ellipse(96 + s * 16, 70, 9, 12, 0, 0, TAU);
          x.fill();
          if (v !== 1) {
            x.fillStyle = INK;
            x.beginPath();
            x.arc(96 + s * 16, 72, 4, 0, TAU);
            x.fill();
          }
        }
        x.strokeStyle = INK;
        x.lineWidth = 4;
        x.beginPath();
        if (v === 3) x.arc(96, 108, 12, Math.PI * 1.1, Math.PI * 1.9);
        else x.arc(96, 90, 12, 0.2, Math.PI - 0.2);
        x.stroke();
      }
    } else if (kind === 'boat') {
      const g = x.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, v === 3 ? '#200a20' : '#ffd8a8');
      g.addColorStop(1, v === 3 ? '#401030' : '#ff9a7a');
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      x.fillStyle = v === 3 ? '#301040' : '#3f7bff';
      x.fillRect(0, 96, W, 48);
      x.fillStyle = '#fff';
      for (let i = 0; i < 6; i++) x.fillRect(10 + i * 32, 104 + (i % 2) * 10, 16, 3);
      x.fillStyle = '#8d5524';
      x.beginPath();
      x.moveTo(60, 96);
      x.lineTo(140, 96);
      x.lineTo(126, 112);
      x.lineTo(74, 112);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.moveTo(98, 40);
      x.lineTo(98, 92);
      x.lineTo(134, 92);
      x.fill();
      if (v === 1) eyesAt(x, 96, 124, 7);
      if (v === 2) bocudoFace(x, 150, 118, 22);
    } else {
      // desenho de criança (giz)
      x.fillStyle = '#fffdf2';
      x.fillRect(0, 0, W, H);
      x.lineWidth = 5;
      x.lineCap = 'round';
      x.strokeStyle = '#ff5c9a';
      x.beginPath();
      x.arc(60, 70, 26, 0, TAU);
      x.stroke();
      x.strokeStyle = '#3f7bff';
      x.beginPath();
      x.arc(130, 70, 26, 0, TAU);
      x.stroke();
      x.fillStyle = INK;
      for (const cx of [60, 130]) {
        x.beginPath();
        x.arc(cx - 8, 64, 3, 0, TAU);
        x.arc(cx + 8, 64, 3, 0, TAU);
        x.fill();
        x.beginPath();
        x.strokeStyle = INK;
        x.lineWidth = 3;
        if (v === 1 && cx === 130) x.arc(cx, 86, 9, Math.PI * 1.1, Math.PI * 1.9);
        else x.arc(cx, 74, 9, 0.2, Math.PI - 0.2);
        x.stroke();
      }
      x.fillStyle = '#ffd34a';
      x.beginPath();
      x.arc(170, 22, 14, 0, TAU);
      x.fill();
      if (v === 2) bocudoFace(x, 96, 112, 22);
      if (v === 3) {
        x.fillStyle = '#1a1030';
        x.fillRect(0, 0, W, H);
        eyesAt(x, 96, 70, 14);
      }
    }
  };
  if (v === 3 && kind !== 'kids' && kind !== 'bloop') {
    // de ponta-cabeça
    x.translate(W, H);
    x.rotate(Math.PI);
    draw();
  } else draw();
  return tex(c);
}

/* ------------------------------ telas ------------------------------ */
export type ScreenKind = 'ecg' | 'pc' | 'tv' | 'cam';
export function screenTex(kind: ScreenKind, v: number): THREE.CanvasTexture {
  const W = 128,
    H = 96;
  const [c, x] = cv(W, H);
  x.fillStyle = kind === 'ecg' ? '#062016' : kind === 'pc' ? '#1a3a6a' : '#101028';
  x.fillRect(0, 0, W, H);
  if (v === 1) {
    bocudoFace(x, W / 2, H / 2, 34);
    return tex(c);
  }
  if (v === 2) {
    // chiado
    const r = rnd(3);
    for (let i = 0; i < W; i += 3) for (let j = 0; j < H; j += 3) {
      const k = Math.floor(r() * 255);
      x.fillStyle = `rgb(${k},${k},${k})`;
      x.fillRect(i, j, 3, 3);
    }
    return tex(c);
  }
  if (v === 3) {
    x.fillStyle = '#300010';
    x.fillRect(0, 0, W, H);
    eyesAt(x, W / 2, H / 2, 16);
    return tex(c);
  }
  if (kind === 'ecg') {
    x.strokeStyle = '#3eff8a';
    x.lineWidth = 3;
    x.beginPath();
    x.moveTo(0, 52);
    for (const [px, py] of [
      [24, 52],
      [32, 52],
      [38, 30],
      [44, 70],
      [50, 52],
      [80, 52],
      [86, 34],
      [92, 66],
      [98, 52],
      [128, 52],
    ])
      x.lineTo(px, py);
    x.stroke();
    x.fillStyle = '#3eff8a';
    x.font = '700 20px Fredoka, sans-serif';
    x.fillText('♥ 72', 8, 22);
  } else if (kind === 'pc') {
    x.fillStyle = '#5ad1ff';
    x.fillRect(10, 10, 108, 16);
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) x.fillRect(12, 34 + i * 14, 40 + ((i * 29) % 50), 6);
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.arc(100, 64, 14, 0, TAU);
    x.fill();
    x.fillStyle = INK;
    x.beginPath();
    x.arc(95, 60, 2.5, 0, TAU);
    x.arc(105, 60, 2.5, 0, TAU);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = 2.5;
    x.beginPath();
    x.arc(100, 65, 7, 0.2, Math.PI - 0.2);
    x.stroke();
  } else if (kind === 'tv') {
    // desenho animado: Bloop pulando no campo
    x.fillStyle = '#8fd3ff';
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#5cc86a';
    x.fillRect(0, 66, W, 30);
    x.fillStyle = '#ff8fd8';
    x.strokeStyle = INK;
    x.lineWidth = 3;
    x.beginPath();
    x.arc(64, 48, 18, 0, TAU);
    x.fill();
    x.stroke();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(58, 44, 5, 0, TAU);
    x.arc(70, 44, 5, 0, TAU);
    x.fill();
    x.fillStyle = INK;
    x.beginPath();
    x.arc(59, 45, 2.5, 0, TAU);
    x.arc(71, 45, 2.5, 0, TAU);
    x.fill();
    x.fillStyle = '#ffd34a';
    x.beginPath();
    x.arc(110, 16, 10, 0, TAU);
    x.fill();
  } else {
    x.fillStyle = '#244';
    x.fillRect(4, 4, 58, 42);
    x.fillRect(66, 4, 58, 42);
    x.fillRect(4, 50, 58, 42);
    x.fillRect(66, 50, 58, 42);
  }
  return tex(c);
}

/** janela à noite: v0 céu e lua; 1 olhos no escuro; 2 Bocudo colado no vidro; 3 lua vermelha */
export function windowTex(v: number): THREE.CanvasTexture {
  const W = 128,
    H = 128;
  const [c, x] = cv(W, H);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1438');
  g.addColorStop(1, '#2a2a5a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  const r = rnd(11);
  x.fillStyle = '#fff';
  for (let i = 0; i < 26; i++) x.fillRect(r() * W, r() * H * 0.7, 1.5, 1.5);
  x.fillStyle = v === 3 ? '#ff3b4f' : '#fff4c0';
  x.beginPath();
  x.arc(92, 32, 13, 0, TAU);
  x.fill();
  x.fillStyle = '#0d1030';
  x.beginPath();
  x.moveTo(0, H);
  for (let i = 0; i <= 8; i++) x.lineTo((i / 8) * W, H - 20 - ((i * 37) % 17));
  x.lineTo(W, H);
  x.fill();
  if (v === 1) eyesAt(x, 40, 80, 8);
  if (v === 2) bocudoFace(x, 60, 76, 40);
  // caixilho
  x.fillStyle = '#e8e6f0';
  x.fillRect(W / 2 - 3, 0, 6, H);
  x.fillRect(0, H / 2 - 3, W, 6);
  return tex(c);
}

/** espelho: reflexo genérico; 1 Bocudo atrás; 2 olhos; 3 rachado */
export function mirrorTex(v: number): THREE.CanvasTexture {
  const W = 128,
    H = 160;
  const [c, x] = cv(W, H);
  const g = x.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#9fc4d8');
  g.addColorStop(0.5, '#d8eef7');
  g.addColorStop(1, '#7fa6bd');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(255,255,255,.5)';
  x.beginPath();
  x.moveTo(20, 0);
  x.lineTo(44, 0);
  x.lineTo(8, 60);
  x.lineTo(0, 46);
  x.fill();
  // "reflexo" da porta ao fundo
  x.fillStyle = 'rgba(70,90,130,.45)';
  x.fillRect(70, 60, 34, 90);
  if (v === 1) bocudoFace(x, 70, 92, 38);
  if (v === 2) eyesAt(x, 64, 70, 10);
  if (v === 3) {
    x.strokeStyle = 'rgba(30,30,40,.85)';
    x.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      x.moveTo(64, 80);
      const a = (i / 9) * TAU;
      x.lineTo(64 + Math.cos(a) * 70, 80 + Math.sin(a) * 70);
      x.stroke();
    }
  }
  return tex(c);
}

/** placa com ícone (emoji) + número/cor — portas, banheiro, farmácia */
export function signTex(icon: string, bg: string, label = ''): THREE.CanvasTexture {
  const [c, x] = cv(128, 64);
  x.fillStyle = bg;
  x.beginPath();
  x.roundRect(2, 2, 124, 60, 14);
  x.fill();
  x.strokeStyle = '#fff';
  x.lineWidth = 4;
  x.stroke();
  x.font = '40px "Noto Color Emoji", "Apple Color Emoji", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(icon, label ? 40 : 64, 35);
  if (label) {
    x.fillStyle = '#fff';
    x.font = '700 36px Fredoka, sans-serif';
    x.fillText(label, 92, 35);
  }
  return tex(c);
}

/** cartaz "lave as mãos" / coração — só desenho */
export function posterTex(kind: 'hands' | 'heart' | 'quiet', v = 0): THREE.CanvasTexture {
  const [c, x] = cv(96, 128);
  x.fillStyle = kind === 'heart' ? '#ffe3ec' : kind === 'quiet' ? '#e6f0ff' : '#e5fff2';
  x.fillRect(0, 0, 96, 128);
  x.strokeStyle = INK;
  x.lineWidth = 3;
  x.strokeRect(3, 3, 90, 122);
  x.font = '56px "Noto Color Emoji", sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(kind === 'hands' ? '🧼' : kind === 'heart' ? '❤️' : '🤫', 48, 50);
  x.fillText(kind === 'hands' ? '👐' : kind === 'heart' ? '🩺' : '😴', 48, 100);
  if (v === 1) bocudoFace(x, 48, 70, 30);
  return tex(c);
}

/** pool de luz no chão (aditivo) */
export function poolTex(): THREE.CanvasTexture {
  const [c, x] = cv(64, 64);
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,250,230,.55)');
  g.addColorStop(0.5, 'rgba(255,245,220,.2)');
  g.addColorStop(1, 'rgba(255,245,220,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return tex(c);
}

/** relógio de parede: v0 normal; 1 ponteiros malucos; 2 sem números (olhos) */
export function clockTex(v: number): THREE.CanvasTexture {
  const [c, x] = cv(96, 96);
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(48, 48, 44, 0, TAU);
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = 5;
  x.stroke();
  x.fillStyle = INK;
  if (v !== 2) for (let i = 0; i < 12; i++) x.fillRect(48 + Math.cos((i / 12) * TAU) * 36 - 2, 48 + Math.sin((i / 12) * TAU) * 36 - 2, 4, 4);
  else eyesAt(x, 48, 40, 10);
  x.lineWidth = 4;
  x.lineCap = 'round';
  const hand = (a: number, l: number) => {
    x.beginPath();
    x.moveTo(48, 48);
    x.lineTo(48 + Math.cos(a - Math.PI / 2) * l, 48 + Math.sin(a - Math.PI / 2) * l);
    x.stroke();
  };
  if (v === 1) {
    hand(2.2, 30);
    hand(2.4, 22);
    hand(-2.5, 28);
  } else {
    hand(0, 30);
    hand((2 / 12) * TAU, 20);
  }
  return tex(c);
}
