/* ============================================================
 *  LANCHONETE — artes em canvas: cardápios (com variações de anomalia),
 *  letreiro, cartazes, relógio, monitores das câmeras, espelho, mural kids.
 *  Marca e cardápio inventados ("Bloop Lanches").
 * ============================================================ */
import * as THREE from 'three';
import { cv, drawFood, label, roundRect, toTex, rnd, reseed, type Food } from '../kit2/tex';

type C2 = CanvasRenderingContext2D;

export interface MenuItem {
  f: Food;
  name: string;
  price: string;
}
export const MENU: { title: string; col: string; items: MenuItem[] }[] = [
  {
    title: 'LANCHES',
    col: '#e8423a',
    items: [
      { f: 'burger', name: 'X-Bloop', price: '14,90' },
      { f: 'cheese', name: 'Bloop Queijo', price: '16,90' },
      { f: 'hotdog', name: 'Cachorrão', price: '11,50' },
      { f: 'nuggets', name: 'Pepitas (6)', price: '9,90' },
    ],
  },
  {
    title: 'ACOMPANHA',
    col: '#ff9a1a',
    items: [
      { f: 'fries', name: 'Batata Sorriso', price: '7,90' },
      { f: 'salad', name: 'Saladinha', price: '8,50' },
      { f: 'pie', name: 'Torta Quente', price: '6,90' },
      { f: 'donut', name: 'Rosquinha', price: '5,50' },
    ],
  },
  {
    title: 'BEBIDAS',
    col: '#2a8ad8',
    items: [
      { f: 'soda', name: 'Refri Bolha', price: '6,50' },
      { f: 'juice', name: 'Suco Laranja', price: '7,00' },
      { f: 'shake', name: 'Milk-shake', price: '12,90' },
      { f: 'icecream', name: 'Casquinha', price: '4,90' },
    ],
  },
];

/** olho arregalado (substitui um ícone na anomalia) */
function drawEye(x: C2, cx: number, cy: number, s: number): void {
  x.save();
  x.fillStyle = '#fff';
  x.strokeStyle = '#3a1d18';
  x.lineWidth = s * 0.06;
  x.beginPath();
  x.ellipse(cx, cy, s * 0.48, s * 0.3, 0, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#b0302a';
  x.beginPath();
  x.arc(cx, cy, s * 0.17, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#111';
  x.beginPath();
  x.arc(cx, cy, s * 0.08, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = 'rgba(200,40,40,0.6)';
  x.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    x.beginPath();
    x.moveTo(cx - s * 0.46, cy + (i - 2) * s * 0.06);
    x.lineTo(cx - s * 0.3, cy + (i - 2) * s * 0.03);
    x.stroke();
  }
  x.restore();
}
/** bocão com presinhas (anomalia) */
export function drawMouth(x: C2, cx: number, cy: number, s: number): void {
  x.save();
  x.fillStyle = '#3a0818';
  x.beginPath();
  x.ellipse(cx, cy, s * 0.5, s * 0.3, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#ff6a8a';
  x.beginPath();
  x.ellipse(cx, cy + s * 0.14, s * 0.26, s * 0.1, 0, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#fff';
  for (const sx of [-1, 1]) {
    x.beginPath();
    x.moveTo(cx + sx * s * 0.32, cy - s * 0.24);
    x.lineTo(cx + sx * s * 0.2, cy - s * 0.24);
    x.lineTo(cx + sx * s * 0.26, cy - s * 0.02);
    x.fill();
  }
  x.restore();
}

/**
 * Atlas dos 3 cardápios (1536×320; cada painel 512×320).
 * variant -1 normal · 0 um lanche vira olho · 1 preços "0,00" e nome ao contrário · 2 tudo vira batata
 */
export function menuBoards(variant = -1): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const [c, x] = cv(W * 3, H);
  MENU.forEach((b, bi) => {
    const ox = bi * W;
    // fundo lousa escura com moldura
    const gr = x.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2a2234');
    gr.addColorStop(1, '#1a1522');
    x.fillStyle = gr;
    x.fillRect(ox, 0, W, H);
    x.fillStyle = b.col;
    roundRect(x, ox + 14, 10, W - 28, 50, 14);
    x.fill();
    label(x, b.title, ox + W / 2, 37, 34, '#fff', 'rgba(0,0,0,0.35)');
    b.items.forEach((it, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const cx = ox + 24 + col * 244;
      const cy = 76 + row * 120;
      x.fillStyle = 'rgba(255,255,255,0.06)';
      roundRect(x, cx, cy, 228, 108, 14);
      x.fill();
      let f = it.f;
      if (variant === 2 && bi === 1) f = 'fries';
      if (variant === 0 && bi === 0 && i === 0) drawEye(x, cx + 56, cy + 54, 92);
      else drawFood(x, f, cx + 56, cy + 54, 86);
      let name = it.name;
      if (variant === 1 && bi === 2 && i === 2) name = name.split('').reverse().join('');
      label(x, name, cx + 164, cy + 36, name.length > 11 ? 19 : 22, '#fff6e0', '', 600);
      const price = variant === 1 ? '0,00' : it.price;
      x.fillStyle = '#ffd35a';
      roundRect(x, cx + 112, cy + 58, 104, 36, 10);
      x.fill();
      label(x, 'R$ ' + price, cx + 164, cy + 77, 21, '#3a1d18', '', 700);
    });
    // borda
    x.strokeStyle = '#c8c0d8';
    x.lineWidth = 6;
    x.strokeRect(ox + 3, 3, W - 6, H - 6);
  });
  return toTex(c, false);
}

/** cardápio do drive-thru (lado de fora, vertical) */
export function driveMenu(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256, 384);
  x.fillStyle = '#231c2e';
  x.fillRect(0, 0, 256, 384);
  x.fillStyle = '#e8423a';
  x.fillRect(0, 0, 256, 56);
  label(x, 'DRIVE', 128, 30, 34, '#fff');
  const items: Food[] = ['burger', 'fries', 'soda', 'shake', 'nuggets'];
  items.forEach((f, i) => {
    const y = 90 + i * 60;
    if (variant === 0 && i === 2) drawMouth(x, 54, y, 60);
    else drawFood(x, f, 54, y, 50);
    label(x, variant === 1 ? '??,??' : MENU[0].items[i % 4].price, 176, y, 26, '#ffd35a', '', 700);
  });
  return toTex(c, false);
}

/** letreiro principal "Bloop Lanches 24h" (painel iluminado) — variant 0 letra apagada, 1 escrito diferente */
export function logoSign(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(1024, 256);
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#ff5a3a');
  gr.addColorStop(1, '#d8302a');
  x.fillStyle = gr;
  roundRect(x, 6, 6, 1012, 244, 60);
  x.fill();
  x.strokeStyle = '#ffd35a';
  x.lineWidth = 12;
  x.stroke();
  // mascote (hamburguinho sorridente)
  drawFood(x, 'burger', 140, 128, 170);
  x.fillStyle = '#3a1d18';
  x.beginPath();
  x.arc(118, 92, 9, 0, Math.PI * 2);
  x.arc(162, 92, 9, 0, Math.PI * 2);
  x.fill();
  const t1 = variant === 1 ? 'Bloop Lanches' : 'Bloop Lanches';
  label(x, t1, 600, 104, 118, '#fff8e0', '#7a1410');
  if (variant === 0) {
    // "a" apagado
    x.fillStyle = '#c8302a';
    x.fillRect(560, 60, 62, 96);
  }
  label(x, variant === 1 ? 'aberto 25h' : 'aberto 24h', 600, 200, 54, '#ffd35a', '#7a1410');
  return toTex(c, false);
}

/** cartaz de parede (picture): 0 normal (família Bloop comendo), variações estranhas */
export function poster(kind: 'promo' | 'combo', variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256, 352);
  const bg = kind === 'promo' ? '#ffd35a' : '#6bd0ff';
  x.fillStyle = bg;
  x.fillRect(0, 0, 256, 352);
  x.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 9; i++) {
    x.beginPath();
    x.moveTo(128, 170);
    x.arc(128, 170, 260, i * 0.7, i * 0.7 + 0.32);
    x.fill();
  }
  if (kind === 'promo') {
    label(x, 'COMBO', 128, 40, 46, '#e8423a', '#fff');
    label(x, 'FAMÍLIA', 128, 84, 34, '#e8423a', '#fff');
    // três Bloops sorrindo
    const cols = ['#7ad0ff', '#ff9ac0', '#9ee07a'];
    for (let i = 0; i < 3; i++) {
      if (variant === 1 && i === 1) continue; // um sumiu
      const bx = 60 + i * 68;
      const by = 210;
      x.fillStyle = cols[i];
      x.beginPath();
      x.arc(bx, by, 30, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(bx - 10, by - 6, 8, 0, Math.PI * 2);
      x.arc(bx + 10, by - 6, 8, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2a1140';
      x.beginPath();
      x.arc(bx - 9, by - 5, 4, 0, Math.PI * 2);
      x.arc(bx + 11, by - 5, 4, 0, Math.PI * 2);
      x.fill();
      if (variant === 0 && i === 2) drawMouth(x, bx, by + 12, 34);
      else {
        x.strokeStyle = '#2a1140';
        x.lineWidth = 3;
        x.beginPath();
        x.arc(bx, by + 6, 9, 0.2, Math.PI - 0.2);
        x.stroke();
      }
    }
    drawFood(x, 'burger', 80, 292, 70);
    drawFood(x, 'fries', 140, 292, 60);
    drawFood(x, 'soda', 196, 292, 60);
  } else {
    label(x, 'NOVO!', 128, 40, 44, '#fff', '#2a5aa8');
    if (variant === 0) drawEye(x, 128, 170, 180);
    else drawFood(x, variant === 2 ? 'donut' : 'shake', 128, 170, 170);
    label(x, variant === 2 ? 'Shake de... ?' : 'Shake Nuvem', 128, 290, 30, '#2a5aa8', '#fff');
  }
  x.strokeStyle = '#ffffff';
  x.lineWidth = 10;
  x.strokeRect(5, 5, 246, 342);
  return toTex(c, false);
}

/** relógio de parede: horário normal (3:10) / 3:33 com ponteiros vermelhos / sem ponteiros / números trocados */
export function clockFace(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256);
  x.fillStyle = '#fffaf0';
  x.beginPath();
  x.arc(128, 128, 124, 0, Math.PI * 2);
  x.fill();
  x.lineWidth = 10;
  x.strokeStyle = '#e8423a';
  x.stroke();
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const n = variant === 2 ? 13 - i : i;
    label(x, String(n), 128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 26, '#2a1d30', '', 700);
  }
  if (variant !== 1) {
    const hh = variant === 0 ? 3 + 33 / 60 : 3 + 10 / 60;
    const mm = variant === 0 ? 33 : 10;
    const hand = (a: number, len: number, w: number, col: string) => {
      x.strokeStyle = col;
      x.lineWidth = w;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(128, 128);
      x.lineTo(128 + Math.cos(a) * len, 128 + Math.sin(a) * len);
      x.stroke();
    };
    const col = variant === 0 ? '#c8202a' : '#2a1d30';
    hand((hh / 12) * Math.PI * 2 - Math.PI / 2, 56, 10, col);
    hand((mm / 60) * Math.PI * 2 - Math.PI / 2, 84, 6, col);
  }
  x.fillStyle = '#2a1d30';
  x.beginPath();
  x.arc(128, 128, 8, 0, Math.PI * 2);
  x.fill();
  return toTex(c, false);
}

/** monitores das câmeras (grade 2×2 de imagens "verdes") — variant 0 olhos numa câmera, 1 chiado, 2 Bloop olhando a câmera */
export function camScreens(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(512, 256);
  x.fillStyle = '#0a120e';
  x.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * 256 + 6;
    const oy = Math.floor(i / 2) * 128 + 6;
    const w = 244;
    const h = 116;
    x.save();
    x.beginPath();
    x.rect(ox, oy, w, h);
    x.clip();
    const gr = x.createLinearGradient(0, oy, 0, oy + h);
    gr.addColorStop(0, '#203a2e');
    gr.addColorStop(1, '#3e6a52');
    x.fillStyle = gr;
    x.fillRect(ox, oy, w, h);
    // perspectiva de sala: chão e paredes
    x.strokeStyle = 'rgba(160,230,190,0.45)';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(ox, oy + h);
    x.lineTo(ox + w * 0.35, oy + h * 0.45);
    x.lineTo(ox + w * 0.75, oy + h * 0.45);
    x.lineTo(ox + w, oy + h);
    x.moveTo(ox + w * 0.35, oy + h * 0.45);
    x.lineTo(ox + w * 0.35, oy);
    x.moveTo(ox + w * 0.75, oy + h * 0.45);
    x.lineTo(ox + w * 0.75, oy);
    x.stroke();
    // móveis em blocos
    x.fillStyle = 'rgba(120,190,150,0.5)';
    reseed(i * 7 + 3);
    for (let k = 0; k < 3; k++) x.fillRect(ox + 30 + rnd() * 170, oy + 60 + rnd() * 30, 20 + rnd() * 30, 14 + rnd() * 16);
    if (variant === 0 && i === 3) {
      for (const sx of [-1, 1]) {
        x.fillStyle = '#fff6a0';
        x.beginPath();
        x.ellipse(ox + w / 2 + sx * 18, oy + h * 0.5, 9, 6, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    if (variant === 1 && i === 1) {
      const id = x.getImageData(ox, oy, w, h);
      for (let p = 0; p < id.data.length; p += 4) {
        const v = rnd() * 255;
        id.data[p] = id.data[p + 1] = id.data[p + 2] = v;
      }
      x.putImageData(id, ox, oy);
    }
    if (variant === 2 && i === 0) {
      x.fillStyle = 'rgba(190,240,210,0.85)';
      x.beginPath();
      x.arc(ox + w / 2, oy + h * 0.62, 40, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#0a120e';
      x.beginPath();
      x.arc(ox + w / 2 - 13, oy + h * 0.55, 7, 0, Math.PI * 2);
      x.arc(ox + w / 2 + 13, oy + h * 0.55, 7, 0, Math.PI * 2);
      x.fill();
    }
    // linhas de varredura
    x.fillStyle = 'rgba(0,0,0,0.18)';
    for (let yy = oy; yy < oy + h; yy += 3) x.fillRect(ox, yy, w, 1);
    x.restore();
    label(x, 'CAM ' + (i + 1), ox + 30, oy + 12, 12, '#c8ffd8', '', 600);
    x.fillStyle = '#ff3a3a';
    x.beginPath();
    x.arc(ox + w - 14, oy + 12, 4, 0, Math.PI * 2);
    x.fill();
  }
  return toTex(c, false);
}

/** espelho: reflexo "fosco" — 1 olhos no espelho, 2 "OI" escrito no vapor, 0 rachado */
export function mirrorTex(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256, 192);
  const gr = x.createLinearGradient(0, 0, 256, 192);
  gr.addColorStop(0, '#c8d6e0');
  gr.addColorStop(0.45, '#9fb0c0');
  gr.addColorStop(0.5, '#e6eef4');
  gr.addColorStop(0.56, '#a8b8c6');
  gr.addColorStop(1, '#8a9aa8');
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 192);
  // vulto da parede de trás
  x.fillStyle = 'rgba(80,110,140,0.25)';
  x.fillRect(0, 120, 256, 72);
  if (variant === 0) {
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    x.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      x.beginPath();
      x.moveTo(170, 60);
      let px = 170;
      let py = 60;
      const a = i * 0.7;
      for (let k = 0; k < 4; k++) {
        px += Math.cos(a + k * 0.3) * 18;
        py += Math.sin(a + k * 0.3) * 18;
        x.lineTo(px, py);
      }
      x.stroke();
    }
  }
  if (variant === 1) {
    x.fillStyle = 'rgba(40,20,60,0.75)';
    x.beginPath();
    x.ellipse(128, 120, 46, 54, 0, 0, Math.PI * 2);
    x.fill();
    for (const sx of [-1, 1]) {
      x.fillStyle = '#fff27a';
      x.beginPath();
      x.ellipse(128 + sx * 17, 104, 9, 7, 0, 0, Math.PI * 2);
      x.fill();
    }
  }
  if (variant === 2) {
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.fillRect(0, 0, 256, 192);
    label(x, 'OI', 128, 96, 90, 'rgba(120,140,160,0.75)', '', 700);
  }
  return toTex(c, false);
}

/** mural do cantinho kids — 0 todos os Bloops com presinhas, 1 um Bloop riscado, 2 olhos no sol */
export function kidsMural(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(512, 256);
  const gr = x.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#8ad8ff');
  gr.addColorStop(1, '#dff6ff');
  x.fillStyle = gr;
  x.fillRect(0, 0, 512, 256);
  // morros
  x.fillStyle = '#8ee07a';
  x.beginPath();
  x.moveTo(0, 200);
  x.quadraticCurveTo(120, 140, 250, 200);
  x.quadraticCurveTo(380, 150, 512, 190);
  x.lineTo(512, 256);
  x.lineTo(0, 256);
  x.fill();
  // sol
  x.fillStyle = '#ffd35a';
  x.beginPath();
  x.arc(430, 60, 36, 0, Math.PI * 2);
  x.fill();
  if (variant === 2) {
    for (const sx of [-1, 1]) {
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(430 + sx * 12, 55, 9, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2a1140';
      x.beginPath();
      x.arc(430 + sx * 12 - 4, 57, 4, 0, Math.PI * 2);
      x.fill();
    }
  }
  // arco-íris
  ['#ff6a6a', '#ffb04a', '#ffe04a', '#7ae07a', '#6ab0ff'].forEach((col, i) => {
    x.strokeStyle = col;
    x.lineWidth = 9;
    x.beginPath();
    x.arc(130, 200, 110 - i * 9, Math.PI, 0);
    x.stroke();
  });
  const cols = ['#7ad0ff', '#ff9ac0', '#c79bff', '#ffad6b'];
  for (let i = 0; i < 4; i++) {
    const bx = 250 + i * 62;
    const by = 196 - (i % 2) * 10;
    x.fillStyle = cols[i];
    x.beginPath();
    x.arc(bx, by, 24, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(bx - 8, by - 5, 6, 0, Math.PI * 2);
    x.arc(bx + 8, by - 5, 6, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#2a1140';
    x.beginPath();
    x.arc(bx - 7, by - 4, 3, 0, Math.PI * 2);
    x.arc(bx + 9, by - 4, 3, 0, Math.PI * 2);
    x.fill();
    if (variant === 0) drawMouth(x, bx, by + 9, 22);
    else {
      x.strokeStyle = '#2a1140';
      x.lineWidth = 2.5;
      x.beginPath();
      x.arc(bx, by + 4, 7, 0.2, Math.PI - 0.2);
      x.stroke();
    }
    if (variant === 1 && i === 2) {
      x.strokeStyle = '#d0202a';
      x.lineWidth = 6;
      x.beginPath();
      x.moveTo(bx - 28, by - 28);
      x.lineTo(bx + 28, by + 28);
      x.moveTo(bx + 28, by - 28);
      x.lineTo(bx - 28, by + 28);
      x.stroke();
    }
  }
  label(x, 'Cantinho Bloop', 140, 34, 34, '#ff5a8a', '#fff');
  return toTex(c, false);
}

/** "Funcionário do mês": 0 foto vira bocão, 1 moldura vazia, 2 o Bloop está de costas */
export function employeePhoto(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(192, 256);
  x.fillStyle = '#f6efe2';
  x.fillRect(0, 0, 192, 256);
  label(x, 'DESTAQUE', 96, 22, 22, '#e8423a', '', 700);
  label(x, 'do mês', 96, 46, 18, '#7a5a4a', '', 600);
  x.fillStyle = '#b8d8f0';
  x.fillRect(26, 64, 140, 150);
  if (variant !== 1) {
    x.fillStyle = '#ffd35a';
    x.beginPath();
    x.arc(96, 150, 52, 0, Math.PI * 2);
    x.fill();
    if (variant !== 2) {
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(78, 138, 13, 0, Math.PI * 2);
      x.arc(114, 138, 13, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2a1140';
      x.beginPath();
      x.arc(80, 140, 6, 0, Math.PI * 2);
      x.arc(116, 140, 6, 0, Math.PI * 2);
      x.fill();
      if (variant === 0) drawMouth(x, 96, 170, 50);
      else {
        x.strokeStyle = '#2a1140';
        x.lineWidth = 4;
        x.beginPath();
        x.arc(96, 160, 14, 0.2, Math.PI - 0.2);
        x.stroke();
      }
    }
    // viseira da equipe
    x.fillStyle = '#e8423a';
    x.fillRect(46, 98, 100, 14);
  }
  label(x, 'Bolota', 96, 234, 20, '#3a2a2a', '', 700);
  x.strokeStyle = '#8a5a3a';
  x.lineWidth = 8;
  x.strokeRect(4, 4, 184, 248);
  return toTex(c, false);
}

/** quadro branco da escala do turno */
export function whiteboard(): THREE.CanvasTexture {
  const [c, x] = cv(384, 256);
  x.fillStyle = '#fbfbf8';
  x.fillRect(0, 0, 384, 256);
  label(x, 'TURNO DA NOITE', 192, 28, 26, '#2a5aa8', '', 700);
  const rows = ['22h  abrir caixa', '00h  limpar salão', '02h  repor batata', '04h  conferir câmara', '06h  fim do turno!'];
  rows.forEach((r, i) => label(x, r, 30, 72 + i * 36, 20, i === 4 ? '#e8423a' : '#333', '', 600, 'left'));
  x.strokeStyle = '#aab';
  x.lineWidth = 6;
  x.strokeRect(3, 3, 378, 250);
  return toTex(c, false);
}

/** placa de parede simples (texto em fundo colorido) */
export function plate(text: string, bg: string, fg = '#fff', w = 256, h = 64, px = 30): THREE.CanvasTexture {
  const [c, x] = cv(w, h);
  x.fillStyle = bg;
  roundRect(x, 2, 2, w - 4, h - 4, 10);
  x.fill();
  label(x, text, w / 2, h / 2 + 1, px, fg, '', 700);
  return toTex(c, false);
}

/** tela do caixa (cliente vê): logo / rosto (anomalia) */
export function registerScreen(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(128, 96);
  x.fillStyle = '#1a2a48';
  x.fillRect(0, 0, 128, 96);
  if (variant === 0) {
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(44, 40, 14, 0, Math.PI * 2);
    x.arc(84, 40, 14, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#111';
    x.beginPath();
    x.arc(44, 42, 6, 0, Math.PI * 2);
    x.arc(84, 42, 6, 0, Math.PI * 2);
    x.fill();
    drawMouth(x, 64, 72, 40);
  } else {
    drawFood(x, 'burger', 40, 44, 50);
    label(x, 'R$ 0,00', 90, 30, 16, '#8af0a8', '', 700);
    label(x, 'Olá!', 90, 62, 18, '#ffffff', '', 700);
  }
  return toTex(c, false);
}
