/* ============================================================
 *  POSTO 24h — artes em canvas: placa de preços (LED), faixa da
 *  cobertura "Bloop Gás", letreiro da loja, telas das bombas, caixa
 *  eletrônico, cartazes, monitores. Marca inventada.
 * ============================================================ */
import * as THREE from 'three';
import { cv, drawFood, label, roundRect, toTex, rnd, reseed } from '../kit2/tex';
import { drawMouth } from '../fastfood/art';

export const TEAL = '#14a89a';
export const TEAL_D = '#0c6a62';
export const SUN = '#ffd23a';

/** logo "Bloop Gás": gota sorridente */
function drop(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, face: 'smile' | 'fangs' = 'smile'): void {
  x.save();
  x.translate(cx, cy);
  x.fillStyle = SUN;
  x.beginPath();
  x.moveTo(0, -s);
  x.bezierCurveTo(s * 0.7, -s * 0.2, s * 0.75, s * 0.6, 0, s * 0.7);
  x.bezierCurveTo(-s * 0.75, s * 0.6, -s * 0.7, -s * 0.2, 0, -s);
  x.fill();
  x.lineWidth = s * 0.08;
  x.strokeStyle = '#7a4a00';
  x.stroke();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(-s * 0.18, s * 0.08, s * 0.08, 0, Math.PI * 2);
  x.arc(s * 0.18, s * 0.08, s * 0.08, 0, Math.PI * 2);
  x.fill();
  if (face === 'fangs') drawMouth(x, 0, s * 0.38, s * 0.5);
  else {
    x.strokeStyle = '#2a1140';
    x.lineWidth = s * 0.07;
    x.beginPath();
    x.arc(0, s * 0.22, s * 0.16, 0.25, Math.PI - 0.25);
    x.stroke();
  }
  x.restore();
}

/** faixa da cobertura (repete na horizontal) */
export function fasciaTex(): THREE.CanvasTexture {
  const [c, x] = cv(1024, 128);
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#1ac8b6');
  gr.addColorStop(1, TEAL);
  x.fillStyle = gr;
  x.fillRect(0, 0, 1024, 128);
  x.fillStyle = SUN;
  x.fillRect(0, 104, 1024, 14);
  drop(x, 90, 54, 40);
  label(x, 'Bloop Gás', 330, 56, 70, '#ffffff', TEAL_D);
  drop(x, 600, 54, 40);
  label(x, 'aberto 24h', 820, 56, 56, '#fff6c8', TEAL_D);
  const t = toTex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** placa de preços (LED vermelho/verde): variant 0 números trocados, 1 "OLÁ :)", 2 tudo zero */
export function priceSign(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256, 384);
  x.fillStyle = TEAL;
  x.fillRect(0, 0, 256, 384);
  x.fillStyle = '#ffffff';
  roundRect(x, 10, 10, 236, 96, 16);
  x.fill();
  drop(x, 52, 58, 34, variant === 1 ? 'fangs' : 'smile');
  label(x, 'Bloop', 160, 40, 38, TEAL_D);
  label(x, 'Gás', 160, 80, 38, '#e8a000');
  const rows: [string, string, string][] = [
    ['GASOLINA', '5,89', '#3ad06a'],
    ['ETANOL', '3,99', SUN],
    ['DIESEL', '6,19', '#c8c8d0'],
  ];
  rows.forEach(([n, p, col], i) => {
    const y = 128 + i * 84;
    x.fillStyle = '#101418';
    roundRect(x, 12, y, 232, 74, 10);
    x.fill();
    x.fillStyle = col;
    x.fillRect(12, y, 10, 74);
    label(x, n, 76, y + 16, 15, '#d8e8e8', '', 700);
    let price = p;
    if (variant === 0) price = ['9,85', '3,13', '0,61'][i];
    if (variant === 2) price = '0,00';
    if (variant === 1) price = ['O L Á', ':-)', ''][i];
    // dígitos de LED (brilho)
    x.shadowColor = '#ff3a2a';
    x.shadowBlur = 10;
    label(x, price, 150, y + 48, 40, '#ff4a3a', '', 700);
    x.shadowBlur = 0;
  });
  return toTex(c, false);
}

/** tela da bomba (litros/valor) — variant 0 "8888", 1 olhos */
export function pumpScreen(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(128, 96);
  x.fillStyle = '#0a1a14';
  x.fillRect(0, 0, 128, 96);
  if (variant === 1) {
    for (const s of [-1, 1]) {
      x.fillStyle = '#c8ffd8';
      x.beginPath();
      x.ellipse(64 + s * 22, 48, 13, 9, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#0a1a14';
      x.beginPath();
      x.arc(64 + s * 22, 49, 5, 0, Math.PI * 2);
      x.fill();
    }
  } else {
    label(x, 'R$', 18, 22, 14, '#7affb0', '', 700);
    label(x, variant === 0 ? '8888' : '0,00', 78, 22, 26, '#7affb0', '', 700);
    label(x, 'L', 18, 64, 14, '#7affb0', '', 700);
    label(x, variant === 0 ? '8888' : '0,000', 78, 64, 26, '#7affb0', '', 700);
  }
  return toTex(c, false);
}

/** letreiro da loja (fachada) */
export function storeSign(): THREE.CanvasTexture {
  const [c, x] = cv(1024, 160);
  x.fillStyle = '#ffffff';
  roundRect(x, 4, 4, 1016, 152, 30);
  x.fill();
  x.strokeStyle = TEAL;
  x.lineWidth = 10;
  x.stroke();
  drop(x, 90, 78, 52);
  label(x, 'Loja Bloop', 430, 78, 92, TEAL_D);
  x.fillStyle = SUN;
  roundRect(x, 690, 36, 300, 88, 20);
  x.fill();
  label(x, '24 horas', 840, 82, 54, '#7a4a00');
  return toTex(c, false);
}

/** caixa eletrônico "Bloop Saque": 0 rosto, 1 "INSIRA... UM SORRISO", 2 chiado */
export function atmScreen(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(128, 96);
  x.fillStyle = '#1a3a7a';
  x.fillRect(0, 0, 128, 96);
  if (variant === 0) {
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(44, 38, 13, 0, Math.PI * 2);
    x.arc(84, 38, 13, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#111';
    x.beginPath();
    x.arc(46, 40, 6, 0, Math.PI * 2);
    x.arc(86, 40, 6, 0, Math.PI * 2);
    x.fill();
    drawMouth(x, 64, 72, 40);
  } else if (variant === 2) {
    reseed(5);
    const id = x.getImageData(0, 0, 128, 96);
    for (let p = 0; p < id.data.length; p += 4) id.data[p] = id.data[p + 1] = id.data[p + 2] = rnd() * 255;
    x.putImageData(id, 0, 0);
  } else {
    label(x, 'Bloop Saque', 64, 18, 15, '#ffffff', '', 700);
    label(x, variant === 1 ? 'insira um' : 'Bem-vindo!', 64, 46, 15, '#ffd23a', '', 600);
    label(x, variant === 1 ? 'SORRISO' : 'toque aqui', 64, 70, variant === 1 ? 18 : 13, '#ffffff', '', 700);
  }
  return toTex(c, false);
}

/** cartaz da loja: promo de café/salgado — variações estranhas */
export function storePoster(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(256, 352);
  x.fillStyle = '#fff2d8';
  x.fillRect(0, 0, 256, 352);
  x.fillStyle = TEAL;
  x.fillRect(0, 0, 256, 70);
  label(x, 'CAFÉ +', 128, 26, 30, '#ffffff');
  label(x, 'PÃO DE QUEIJO', 128, 54, 22, SUN);
  // xícara
  x.fillStyle = '#ffffff';
  x.strokeStyle = '#3a2a2a';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(60, 130);
  x.lineTo(170, 130);
  x.lineTo(155, 230);
  x.lineTo(75, 230);
  x.closePath();
  x.fill();
  x.stroke();
  x.beginPath();
  x.arc(178, 170, 22, -1.2, 1.2);
  x.stroke();
  x.fillStyle = '#6a3a1a';
  x.fillRect(66, 136, 98, 16);
  if (variant === 0) {
    drawMouth(x, 115, 185, 70);
  } else if (variant === 1) {
    for (const s of [-1, 1]) {
      x.fillStyle = '#3a2a2a';
      x.beginPath();
      x.arc(115 + s * 20, 180, 9, 0, Math.PI * 2);
      x.fill();
    }
  }
  // fumacinha
  x.strokeStyle = 'rgba(120,120,120,0.6)';
  x.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    x.beginPath();
    x.moveTo(90 + i * 22, 120);
    x.bezierCurveTo(80 + i * 22, 100, 105 + i * 22, 90, 92 + i * 22, 74);
    x.stroke();
  }
  // pães de queijo
  for (let i = 0; i < 3; i++) {
    x.fillStyle = '#f2c060';
    x.beginPath();
    x.arc(70 + i * 56, 282, 24, 0, Math.PI * 2);
    x.fill();
  }
  label(x, variant === 2 ? 'R$ ???' : 'R$ 9,90', 128, 330, 30, '#e8423a');
  return toTex(c, false);
}

/** monitores do escritório do posto (grade 2×2) */
export function postoCams(variant = -1): THREE.CanvasTexture {
  const [c, x] = cv(512, 256);
  x.fillStyle = '#081010';
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
    gr.addColorStop(0, '#1a2a3a');
    gr.addColorStop(1, '#3a5a5a');
    x.fillStyle = gr;
    x.fillRect(ox, oy, w, h);
    x.fillStyle = 'rgba(200,240,230,0.5)';
    if (i === 0) {
      // bombas sob a cobertura
      x.fillRect(ox, oy + 12, w, 10);
      for (let k = 0; k < 4; k++) x.fillRect(ox + 30 + k * 55, oy + 50, 14, 40);
    } else if (i === 1) {
      for (let k = 0; k < 3; k++) x.fillRect(ox + 20 + k * 80, oy + 40, 50, 60);
    } else if (i === 2) {
      x.fillRect(ox, oy + 80, w, 6);
      x.fillRect(ox + 100, oy + 30, 8, 50);
    } else {
      for (let k = 0; k < 5; k++) x.fillRect(ox + 10 + k * 46, oy + 30, 36, 70);
    }
    if (variant === 0 && i === 2) {
      x.fillStyle = '#e8fff6';
      x.beginPath();
      x.ellipse(ox + 160, oy + 60, 12, 26, 0, 0, Math.PI * 2);
      x.fill();
    }
    if (variant === 1 && i === 3) {
      reseed(9);
      const id = x.getImageData(ox, oy, w, h);
      for (let p = 0; p < id.data.length; p += 4) id.data[p] = id.data[p + 1] = id.data[p + 2] = rnd() * 255;
      x.putImageData(id, ox, oy);
    }
    if (variant === 2 && i === 0) {
      for (const s of [-1, 1]) {
        x.fillStyle = '#fff6a0';
        x.beginPath();
        x.ellipse(ox + w / 2 + s * 30, oy + h / 2, 20, 12, 0, 0, Math.PI * 2);
        x.fill();
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.2)';
    for (let yy = oy; yy < oy + h; yy += 3) x.fillRect(ox, yy, w, 1);
    x.restore();
    label(x, ['BOMBAS', 'LOJA', 'ESTRADA', 'DEPÓSITO'][i], ox + 44, oy + 12, 12, '#c8fff0', '', 600);
  }
  return toTex(c, false);
}

/** placa simples (texto) */
export function sign(text: string, bg: string, fg = '#fff', w = 256, h = 64, px = 30): THREE.CanvasTexture {
  const [c, x] = cv(w, h);
  x.fillStyle = bg;
  roundRect(x, 2, 2, w - 4, h - 4, 10);
  x.fill();
  label(x, text, w / 2, h / 2 + 1, px, fg, '', 700);
  return toTex(c, false);
}

/** letreiro do lava-jato */
export function washSign(): THREE.CanvasTexture {
  const [c, x] = cv(512, 128);
  x.fillStyle = '#2a6ad8';
  roundRect(x, 4, 4, 504, 120, 24);
  x.fill();
  for (let i = 0; i < 9; i++) {
    x.fillStyle = 'rgba(255,255,255,0.5)';
    x.beginPath();
    x.arc(30 + i * 56, 100 - (i % 3) * 12, 8 + (i % 2) * 5, 0, Math.PI * 2);
    x.fill();
  }
  label(x, 'Lava-Jato Bloop', 256, 58, 52, '#ffffff', '#1a3a8a');
  return toTex(c, false);
}

/** rótulos de produtos (atlas 4×4 de embalagens coloridas) — usado nas prateleiras */
export function snackAtlas(): THREE.CanvasTexture {
  const [c, x] = cv(256, 256);
  const cols = ['#e8423a', '#ffd23a', '#3aa0ff', '#5ad06a', '#c87aff', '#ff8ac0', '#ff9a2a', '#2ac8b8', '#f2f2f2', '#8a5a3a', '#e8423a', '#3a6ad8', '#ffd23a', '#5ad06a', '#ff5a8a', '#2a2a30'];
  for (let i = 0; i < 16; i++) {
    const ox = (i % 4) * 64;
    const oy = Math.floor(i / 4) * 64;
    x.fillStyle = cols[i];
    x.fillRect(ox, oy, 64, 64);
    x.fillStyle = 'rgba(255,255,255,0.8)';
    roundRect(x, ox + 10, oy + 20, 44, 24, 8);
    x.fill();
    drawFood(x, (['fries', 'donut', 'soda', 'salad', 'icecream', 'shake', 'pie', 'juice'] as const)[i % 8], ox + 32, oy + 32, 20);
  }
  return toTex(c, false);
}
