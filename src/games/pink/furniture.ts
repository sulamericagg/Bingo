/* ============================================================
 *  BLOOP PINK — móveis 3D (bordas arredondadas, laca, madeira, mármore, vidro, LED).
 *  Cada móvel é montado com o Builder (um Mesh por material) + sombra de contato.
 *  Espaço local: frente = +z (lado do cliente), chão em y = 0.
 * ============================================================ */
import * as THREE from 'three';
import { brandCanvas, drawBrandLogo, PINK } from './brand';
import { FURN, slotSpecs, type FurnKind, type SlotSpec } from './data';
import type { Kit } from './mats';
import { Builder, rbox } from './shapes';
import { gameFont } from '../../i18n/font';

export interface FurnModel {
  group: THREE.Group;
  slots: SlotSpec[];
  /** partes animadas (tela, luz) */
  anim?: (t: number) => void;
}

const CYL = (rt: number, rb: number, h: number, seg = 20) => new THREE.CylinderGeometry(rt, rb, h, seg, 1);

function headerCanvas(): HTMLCanvasElement {
  return brandCanvas(512, 96, { bg: '#fff6fa' });
}
function screenCanvas(kind: 'pos' | 'self'): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 160);
  g.addColorStop(0, '#ffe3ef');
  g.addColorStop(1, '#ffc0da');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 160);
  drawBrandLogo(x, 128, 28, 30);
  x.fillStyle = '#fff';
  x.fillRect(16, 52, 224, kind === 'self' ? 60 : 92);
  x.fillStyle = '#e9c4d4';
  for (let i = 0; i < 4; i++) x.fillRect(26, 62 + i * 18, 150, 8);
  x.fillStyle = PINK.deep;
  x.font = gameFont(700, 20);
  x.fillText('B$', 190, 130);
  if (kind === 'self') {
    x.fillStyle = '#3ac48a';
    x.beginPath();
    x.roundRect(40, 120, 176, 30, 10);
    x.fill();
    x.fillStyle = '#fff';
    x.font = gameFont(700, 18);
    x.textAlign = 'center';
    x.fillText('OK', 128, 142);
  }
  return c;
}
function officeScreenCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff6fa';
  x.fillRect(0, 0, 256, 160);
  drawBrandLogo(x, 60, 18, 18);
  const vals = [40, 62, 50, 80, 72, 96, 110];
  vals.forEach((v, i) => {
    x.fillStyle = i % 2 ? '#ff5fa2' : '#ffc6de';
    x.fillRect(20 + i * 32, 150 - v, 22, v);
  });
  x.strokeStyle = '#2fa35a';
  x.lineWidth = 4;
  x.beginPath();
  vals.forEach((v, i) => x.lineTo(31 + i * 32, 130 - v * 0.8));
  x.stroke();
  return c;
}
function artCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, '#ffe3ef');
  g.addColorStop(1, '#d6c6ff');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  const cols = ['#ff8cc0', '#ffd34a', '#8fdcff', '#ff5fa2', '#b48cff'];
  for (let i = 0; i < 7; i++) {
    x.fillStyle = cols[i % 5];
    x.globalAlpha = 0.75;
    x.beginPath();
    x.arc(40 + ((i * 71) % 180), 50 + ((i * 53) % 170), 24 + (i % 3) * 14, 0, 7);
    x.fill();
  }
  x.globalAlpha = 1;
  return c;
}
function posterCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#ffd3e6');
  g.addColorStop(1, '#ff8cc0');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 320);
  // "foto" de produtos: frascos estilizados
  const cols = ['#ffffff', '#ffe6f0', '#f2b45a', '#c3a6ff'];
  for (let i = 0; i < 4; i++) {
    const px = 40 + i * 50;
    const h = 90 + (i % 2) * 40;
    x.fillStyle = 'rgba(0,0,0,.12)';
    x.beginPath();
    x.ellipse(px + 16, 262, 22, 6, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = cols[i];
    x.beginPath();
    x.roundRect(px, 260 - h, 32, h, 10);
    x.fill();
    x.fillStyle = '#d6ad6a';
    x.fillRect(px + 8, 248 - h, 16, 14);
  }
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.beginPath();
  x.roundRect(16, 18, 224, 70, 18);
  x.fill();
  drawBrandLogo(x, 128, 53, 40);
  return c;
}
function rugCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f6c6d8';
  x.fillRect(0, 0, 256, 256);
  for (let r = 120; r > 0; r -= 14) {
    x.strokeStyle = r % 28 ? '#fbe2ec' : '#e89ab8';
    x.lineWidth = 6;
    x.beginPath();
    x.ellipse(128, 128, r, r * 0.95, 0, 0, Math.PI * 2);
    x.stroke();
  }
  // fiapos
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.12})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1, 2);
  }
  return c;
}

function heartCurve(s: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    pts.push(new THREE.Vector3((x / 17) * s, (y / 17) * s, 0));
  }
  return new THREE.CatmullRomCurve3(pts, true);
}

export function buildFurniture(kit: Kit, kind: FurnKind): FurnModel {
  const def = FURN[kind];
  const b = new Builder();
  const lac = kit.plain('lacq', '#f7f1ef', 0.32, 0, { envK: 0.7 });
  const lacPink = kit.plain('lacqPink', '#f2b3c9', 0.36, 0, { envK: 0.7 });
  const wood = kit.surf('woodLightF', 'woodLight', { rough: 0.9, envK: 0.5 });
  const marble = kit.surf('marbleTop', 'marble', { rough: 0.6, envK: 1.1 });
  const gold = kit.plain('gold', '#d6ad6a', 0.26, 1, { envK: 1.2 });
  const chrome = kit.plain('chrome', '#e9e9ef', 0.12, 1, { envK: 1.4 });
  const black = kit.plain('black', '#2a2530', 0.45, 0.1);
  const led = kit.plain('led', '#ffffff', 0.5, 0, { emissive: '#fff1f7', ei: 1.2 });
  const glassShelf = kit.glass('shelfglass', '#e8fbff', 0.32);
  let anim: FurnModel['anim'];
  const W = def.w;
  const D = def.d;
  const H = def.h;

  const shelfUnit = (lux: boolean) => {
    const sideW = 0.04;
    const ys = lux ? [0.14, 0.52, 0.9, 1.28, 1.62] : [0.14, 0.52, 0.9, 1.28];
    // laterais arredondadas
    for (const sx of [-1, 1]) b.add(rbox(sideW, H, D, 0.018, 3), lux ? gold : lac, sx * (W / 2 - sideW / 2), H / 2, 0);
    // fundo (laca rosa) + rodapé recuado
    b.add(rbox(W - 0.06, H - 0.14, 0.03, 0.01, 2), lux ? kit.plain('backLux', '#f7d6e2', 0.3, 0, { emissive: '#ffd9e8', ei: 0.35 }) : lacPink, 0, (H - 0.14) / 2 + 0.1, -D / 2 + 0.03);
    b.add(rbox(W - 0.08, 0.1, D - 0.06, 0.01, 2), black, 0, 0.05, -0.01);
    // prateleiras com borda
    for (const y of ys) {
      b.add(rbox(W - 0.08, 0.025, D - 0.05, 0.008, 2), lux ? glassShelf : lac, 0, y, 0.005);
      b.add(rbox(W - 0.08, 0.035, 0.012, 0.005, 2), lux ? gold : kit.plain('price', '#ffffff', 0.4), 0, y + 0.01, D / 2 - 0.02);
      if (lux) b.add(rbox(W - 0.1, 0.006, 0.01, 0.002, 1), led, 0, y + 0.29, D / 2 - 0.05);
    }
    // topo + letreiro
    b.add(rbox(W, 0.05, D, 0.015, 2), lux ? gold : lac, 0, H + 0.025, 0);
    const hm = kit.canvasMat('shelfHead', headerCanvas(), { emissive: lux ? 0.5 : 0.15 });
    b.add(new THREE.PlaneGeometry(W - 0.12, 0.2), hm, 0, H - 0.12, -D / 2 + 0.05);
  };

  switch (kind) {
    case 'shelf':
      shelfUnit(false);
      break;
    case 'shelfLux':
      shelfUnit(true);
      break;
    case 'gondola': {
      const W = 1.2; // corpo; a pegada (1,45) inclui as prateleiras das cabeceiras
      // coluna central + prateleiras dos dois lados + cabeceiras arredondadas
      b.add(rbox(W - 0.06, H, 0.05, 0.012, 2), lacPink, 0, H / 2, 0);
      for (const sx of [-1, 1]) b.add(rbox(0.05, H, D, 0.022, 3), lac, sx * (W / 2 - 0.025), H / 2, 0);
      b.add(rbox(W - 0.08, 0.1, D - 0.06, 0.01, 2), black, 0, 0.05, 0);
      for (const y of [0.14, 0.52, 0.9]) {
        b.add(rbox(W - 0.08, 0.025, D - 0.06, 0.008, 2), lac, 0, y, 0);
        for (const sz of [-1, 1]) b.add(rbox(W - 0.08, 0.035, 0.012, 0.005, 2), kit.plain('price', '#ffffff', 0.4), 0, y + 0.01, sz * (D / 2 - 0.03));
      }
      b.add(rbox(W + 0.02, 0.05, D + 0.02, 0.02, 2), lac, 0, H + 0.025, 0);
      const hm = kit.canvasMat('shelfHead', headerCanvas(), { emissive: 0.15 });
      b.add(new THREE.BoxGeometry(W - 0.2, 0.18, 0.02), hm, 0, H + 0.16, 0);
      b.add(rbox(0.04, 0.12, 0.04, 0.01, 1), chrome, 0, H + 0.05, 0);
      // cabeceiras: pôster da marca + mini prateleira de acrílico com borda de preço
      const pm = kit.canvasMat('gondPoster', posterCanvas(), { rough: 0.4, emissive: 0.12 });
      for (const sx of [-1, 1]) {
        b.add(new THREE.PlaneGeometry(D - 0.12, 0.95), pm, sx * (W / 2 + 0.002), 0.82, 0, 0, sx * (Math.PI / 2), 0);
        b.add(rbox(0.16, 0.02, D - 0.14, 0.006, 1), glassShelf, sx * (W / 2 + 0.08), 0.32, 0);
        b.add(rbox(0.012, 0.035, D - 0.14, 0.004, 1), kit.plain('price', '#ffffff', 0.4), sx * (W / 2 + 0.16), 0.335, 0);
      }
      break;
    }
    case 'table': {
      b.add(rbox(W, 0.06, D, 0.03, 4), wood, 0, 0.79, 0);
      b.add(rbox(W - 0.16, 0.66, D - 0.16, 0.04, 3), lac, 0, 0.42, 0);
      b.add(rbox(W - 0.24, 0.08, D - 0.24, 0.01, 2), black, 0, 0.04, 0);
      b.add(rbox(W - 0.18, 0.01, 0.01, 0.003, 1), gold, 0, 0.72, D / 2 - 0.08);
      b.add(rbox(W - 0.18, 0.01, 0.01, 0.003, 1), gold, 0, 0.72, -D / 2 + 0.08);
      break;
    }
    case 'tableRound': {
      b.add(CYL(0.62, 0.62, 0.06, 40), marble, 0, 0.87, 0);
      b.add(CYL(0.62, 0.62, 0.012, 40), gold, 0, 0.834, 0);
      b.add(CYL(0.45, 0.5, 0.8, 32), lacPink, 0, 0.42, 0);
      b.add(CYL(0.5, 0.5, 0.04, 32), black, 0, 0.02, 0);
      b.add(CYL(0.24, 0.24, 0.26, 28), lac, 0, 1.03, 0);
      b.add(CYL(0.26, 0.26, 0.03, 28), marble, 0, 1.17, 0);
      break;
    }
    case 'checkout':
    case 'checkout2': {
      const pro = kind === 'checkout2';
      // balcão: frente arredondada rosa com logo, tampo de mármore
      b.add(rbox(W, 0.92, D, 0.06, 4), pro ? lacPink : lac, 0, 0.46, 0);
      b.add(rbox(W + 0.04, 0.05, D + 0.06, 0.02, 3), marble, 0, 0.945, 0);
      b.add(rbox(W - 0.1, 0.06, 0.02, 0.01, 1), black, 0, 0.04, D / 2 - 0.02);
      const lm = kit.canvasMat('ckLogo', brandCanvas(512, 128, { bg: pro ? '#f2b3c9' : '#f7f1ef' }), { rough: 0.35 });
      b.add(new THREE.PlaneGeometry(1.0, 0.25), lm, 0, 0.6, D / 2 + 0.002);
      // registradora: base + gaveta + tela
      b.add(rbox(0.36, 0.1, 0.34, 0.02, 2), black, -0.45, 1.02, -0.08);
      b.add(rbox(0.05, 0.22, 0.05, 0.01, 1), chrome, -0.45, 1.18, -0.16);
      b.add(rbox(0.32, 0.22, 0.03, 0.012, 2), black, -0.45, 1.36, -0.15, -0.35);
      const sm = kit.canvasMat('posScreen', screenCanvas('pos'), { emissive: 0.9 });
      b.add(new THREE.PlaneGeometry(0.28, 0.18), sm, -0.45, 1.362, -0.13, -0.35);
      // maquininha de cartão
      b.add(rbox(0.08, 0.03, 0.15, 0.012, 2), black, -0.1, 0.985, 0.18, 0.15);
      b.add(new THREE.PlaneGeometry(0.06, 0.05).rotateX(-Math.PI / 2 + 0.15), kit.plain('cardScr', '#9fe8ff', 0.3, 0, { emissive: '#7fd0ff', ei: 0.6 }), -0.1, 1.003, 0.16);
      // área de passar (esteira/leitor)
      if (pro) {
        b.add(rbox(0.34, 0.03, 0.3, 0.01, 2), black, 0.38, 0.985, 0.02);
        b.add(new THREE.PlaneGeometry(0.26, 0.2).rotateX(-Math.PI / 2), kit.glass('scanGlass', '#ff8a8a', 0.6), 0.38, 1.002, 0.02);
        b.add(rbox(0.3, 0.002, 0.004, 0.001, 1), kit.plain('laser', '#ff2a2a', 0.5, 0, { emissive: '#ff2020', ei: 2 }), 0.38, 1.004, 0.02);
      } else b.add(rbox(0.4, 0.012, 0.32, 0.005, 1), kit.plain('mat', '#3a3340', 0.8), 0.38, 0.976, 0.02);
      // sacolinhas
      b.add(rbox(0.22, 0.16, 0.12, 0.02, 2), kit.plain('bag', PINK.rose, 0.7), 0.7, 1.05, -0.2);
      break;
    }
    case 'selfcheck': {
      b.add(rbox(W, 0.9, D, 0.05, 3), lacPink, 0, 0.45, 0);
      b.add(rbox(W + 0.02, 0.04, D + 0.02, 0.015, 2), marble, 0, 0.92, 0);
      b.add(rbox(0.08, 0.5, 0.08, 0.02, 2), chrome, 0, 1.15, -0.22);
      b.add(rbox(0.6, 0.42, 0.05, 0.02, 2), black, 0, 1.38, -0.18, -0.3);
      const sm = kit.canvasMat('selfScreen', screenCanvas('self'), { emissive: 0.95 });
      b.add(new THREE.PlaneGeometry(0.54, 0.36), sm, 0, 1.385, -0.152, -0.3);
      b.add(new THREE.PlaneGeometry(0.3, 0.2).rotateX(-Math.PI / 2), kit.glass('scanGlass', '#ff8a8a', 0.6), 0, 0.945, 0.12);
      b.add(rbox(0.12, 0.05, 0.02, 0.01, 1), black, 0.25, 1.0, 0.25);
      break;
    }
    case 'testPerfume': {
      // pedestal oval branco + tampo de espelho + 3 testers + plaquinha
      b.add(rbox(W, 0.95, D, 0.12, 4), lac, 0, 0.475, 0);
      b.add(rbox(W + 0.04, 0.03, D + 0.04, 0.012, 2), kit.plain('mirrorTop', '#f2f4f8', 0.02, 1, { envK: 1.6 }), 0, 0.965, 0);
      b.add(rbox(W - 0.1, 0.012, 0.02, 0.004, 1), gold, 0, 0.88, D / 2 + 0.002);
      for (let i = 0; i < 3; i++) {
        const x = -0.28 + i * 0.28;
        const col = ['#ffd3e6', '#f2b45a', '#e7d4ff'][i];
        b.add(rbox(0.09, 0.12, 0.06, 0.014, 2), kit.glass('tg' + i, '#ffffff', 0.35), x, 1.04, 0);
        b.add(rbox(0.075, 0.09, 0.048, 0.01, 2), kit.plain('tl' + i, col, 0.3), x, 1.03, 0);
        b.add(CYL(0.025, 0.025, 0.05, 12), gold, x, 1.125, 0);
      }
      // cartelinhas de papel
      for (let i = 0; i < 5; i++) b.add(new THREE.BoxGeometry(0.02, 0.1, 0.002), kit.plain('paper', '#ffffff', 0.9), 0.35 + i * 0.008, 1.03, 0.18, 0.2);
      const sign = document.createElement('canvas');
      sign.width = 256;
      sign.height = 96;
      const sx = sign.getContext('2d')!;
      sx.fillStyle = '#fff';
      sx.fillRect(0, 0, 256, 96);
      drawBrandLogo(sx, 128, 34, 34);
      sx.fillStyle = PINK.deep;
      sx.font = gameFont(700, 22);
      sx.textAlign = 'center';
      sx.fillText('TESTER', 128, 80);
      b.add(rbox(0.36, 0.14, 0.02, 0.008, 1), gold, 0, 1.22, -0.2);
      b.add(new THREE.PlaneGeometry(0.34, 0.125), kit.canvasMat('testerSign', sign, { rough: 0.5 }), 0, 1.22, -0.188);
      break;
    }
    case 'testMakeup': {
      // penteadeira: balcão + espelho com lâmpadas
      b.add(rbox(W, 0.78, D, 0.05, 3), lac, 0, 0.39, 0);
      b.add(rbox(W + 0.02, 0.04, D + 0.02, 0.015, 2), marble, 0, 0.8, 0);
      b.add(rbox(W - 0.1, 0.92, 0.05, 0.05, 4), lacPink, 0, 1.36, -D / 2 + 0.05);
      b.add(rbox(W - 0.28, 0.72, 0.012, 0.03, 3), kit.plain('mirror', '#eef2f6', 0.015, 1, { envK: 2 }), 0, 1.36, -D / 2 + 0.08);
      const bulb = kit.plain('bulb', '#ffffff', 0.3, 0, { emissive: '#fff4e0', ei: 1.6 });
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) b.add(new THREE.SphereGeometry(0.032, 10, 8), bulb, sx * (W / 2 - 0.1), 1.02 + i * 0.22, -D / 2 + 0.1);
      // paletas e pincéis
      for (let i = 0; i < 4; i++) {
        b.add(rbox(0.12, 0.015, 0.08, 0.006, 1), black, -0.32 + i * 0.2, 0.83, 0.08);
        for (let k = 0; k < 4; k++) b.add(CYL(0.012, 0.012, 0.004, 8), kit.plain('pal' + k, ['#f2a07b', '#e8336f', '#c3a6ff', '#f2b45a'][k], 0.6), -0.36 + i * 0.2 + k * 0.026, 0.84, 0.08);
      }
      b.add(CYL(0.05, 0.04, 0.12, 14), lacPink, 0.38, 0.88, -0.08);
      for (let k = 0; k < 4; k++) b.add(CYL(0.006, 0.008, 0.18, 6), black, 0.36 + k * 0.012, 0.98, -0.08 + (k % 2) * 0.01, 0, 0, (k - 1.5) * 0.12);
      break;
    }
    case 'testNails': {
      b.add(rbox(W, 0.05, D, 0.025, 3), marble, 0, 0.76, 0);
      for (const sx of [-1, 1]) b.add(rbox(0.06, 0.74, D - 0.1, 0.02, 2), lac, sx * (W / 2 - 0.08), 0.37, 0);
      b.add(rbox(W - 0.2, 0.5, 0.03, 0.01, 1), lacPink, 0, 0.45, -D / 2 + 0.08);
      // luminária articulada
      b.add(CYL(0.06, 0.07, 0.02, 14), black, 0.38, 0.795, -0.18);
      b.add(CYL(0.008, 0.008, 0.36, 6), chrome, 0.38, 0.97, -0.18, 0, 0, 0.3);
      b.add(CYL(0.03, 0.07, 0.08, 14), black, 0.3, 1.15, -0.12, 0.6, 0, 0.4);
      // estante de esmaltes
      b.add(rbox(0.5, 0.2, 0.08, 0.01, 1), lac, -0.2, 0.88, -0.24);
      for (let i = 0; i < 12; i++) {
        const col = ['#ff3f9e', '#c2102a', '#c3a6ff', '#9fe6c8', '#8ccfff', '#ffd84a'][i % 6];
        b.add(CYL(0.014, 0.016, 0.045, 8), kit.plain('np' + (i % 6), col, 0.15, 0, { envK: 1.2 }), -0.4 + (i % 6) * 0.08, 0.81 + Math.floor(i / 6) * 0.1, -0.22);
      }
      // almofadinha de mão
      b.add(rbox(0.22, 0.05, 0.14, 0.025, 3), kit.surf('fabricPink', 'fabric', { color: '#f7c3d6' }), 0, 0.81, 0.1);
      break;
    }
    case 'plant': {
      const pot = kit.plain('pot', '#efe9e4', 0.6);
      b.add(new THREE.LatheGeometry([new THREE.Vector2(0.12, 0), new THREE.Vector2(0.19, 0.04), new THREE.Vector2(0.21, 0.42), new THREE.Vector2(0.19, 0.44), new THREE.Vector2(0.17, 0.42)], 24), pot, 0, 0, 0);
      b.add(CYL(0.18, 0.18, 0.02, 20), kit.plain('soil', '#3a2a20', 0.95), 0, 0.4, 0);
      const leaf = kit.plain('leaf', '#3f8f4a', 0.55, 0, { envK: 0.5 });
      const leaf2 = kit.plain('leaf2', '#57a85a', 0.55, 0, { envK: 0.5 });
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39;
        const tilt = 0.4 + (i % 3) * 0.25;
        const len = 0.42 + (i % 4) * 0.08;
        const g = new THREE.SphereGeometry(0.5, 10, 6);
        g.scale(0.16, 0.025, len * 0.5);
        g.translate(0, 0, len * 0.5);
        b.add(g, i % 2 ? leaf : leaf2, 0, 0.42 + (i % 5) * 0.08, 0, -tilt, a, 0);
      }
      break;
    }
    case 'pouf': {
      const fab = kit.surf('fabricPink', 'fabric', { color: '#f7c3d6' });
      const g = new THREE.SphereGeometry(0.3, 24, 14);
      g.scale(1, 0.62, 1);
      b.add(g, fab, 0, 0.24, 0);
      b.add(CYL(0.26, 0.26, 0.04, 20), gold, 0, 0.02, 0);
      for (let i = 0; i < 6; i++) b.add(new THREE.SphereGeometry(0.012, 6, 4), gold, Math.sin(i) * 0.15, 0.42, Math.cos(i) * 0.15);
      break;
    }
    case 'rug': {
      const g = new THREE.CircleGeometry(1, 48);
      g.rotateX(-Math.PI / 2);
      g.scale(W / 2, 1, D / 2);
      b.add(g, kit.canvasMat('rug', rugCanvas(), { rough: 0.95 }), 0, 0.006, 0);
      break;
    }
    case 'flowers': {
      b.add(new THREE.LatheGeometry([new THREE.Vector2(0.001, 0), new THREE.Vector2(0.12, 0.02), new THREE.Vector2(0.16, 0.2), new THREE.Vector2(0.09, 0.42), new THREE.Vector2(0.1, 0.46)], 24), kit.glass('vase', '#ffd3e6', 0.55), 0, 0, 0);
      const stem = kit.plain('stem', '#4f8a3a', 0.6);
      const petal = [kit.plain('fl1', '#ff9ac4', 0.6), kit.plain('fl2', '#ffffff', 0.6), kit.plain('fl3', '#ff5fa2', 0.6)];
      for (let i = 0; i < 9; i++) {
        const a = i * 2.39;
        const r = 0.06 + (i % 3) * 0.05;
        const hh = 0.65 + (i % 4) * 0.08;
        b.add(CYL(0.006, 0.006, hh - 0.4, 5), stem, Math.sin(a) * r * 0.4, 0.4 + (hh - 0.4) / 2, Math.cos(a) * r * 0.4, Math.cos(a) * 0.25, 0, -Math.sin(a) * 0.25);
        const head = new THREE.IcosahedronGeometry(0.06, 1);
        head.scale(1, 0.7, 1);
        b.add(head, petal[i % 3], Math.sin(a) * r, hh, Math.cos(a) * r);
      }
      break;
    }
    case 'mirror': {
      b.add(rbox(W, H, 0.06, 0.2, 5), gold, 0, H / 2, 0);
      b.add(rbox(W - 0.1, H - 0.1, 0.012, 0.16, 4), kit.plain('mirror', '#eef2f6', 0.015, 1, { envK: 2 }), 0, H / 2, 0.03);
      b.add(rbox(W * 0.8, 0.04, 0.3, 0.015, 2), gold, 0, 0.02, -0.05);
      break;
    }
    case 'neon': {
      b.add(rbox(W, H, 0.03, 0.04, 3), kit.glass('acrylic', '#ffffff', 0.18), 0, 1.9, -D / 2 + 0.02);
      const tube = new THREE.TubeGeometry(heartCurve(0.38), 80, 0.016, 8, true);
      b.add(tube, kit.plain('neonPink', '#ff7ab8', 0.3, 0, { emissive: '#ff4fa0', ei: 2.6 }), 0, 1.95, -D / 2 + 0.06);
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) b.add(CYL(0.012, 0.012, 0.05, 8).rotateX(Math.PI / 2), chrome, sx * (W / 2 - 0.06), 1.9 + sy * (H / 2 - 0.06), -D / 2 + 0.03);
      break;
    }
    case 'balloons': {
      const cols = [kit.plain('bl1', '#ff9ac4', 0.25, 0, { envK: 1.2 }), kit.plain('bl2', '#ffffff', 0.25, 0, { envK: 1.2 }), kit.plain('bl3', '#e8b86a', 0.2, 0.7, { envK: 1.3 }), kit.plain('bl4', '#ff5fa2', 0.25, 0, { envK: 1.2 })];
      for (let i = 0; i < 34; i++) {
        const t = i / 33;
        const a = Math.PI * t;
        const r = 0.11 + (i % 3) * 0.03;
        const g = new THREE.SphereGeometry(r, 14, 10);
        g.scale(1, 1.12, 1);
        b.add(g, cols[i % 4], -Math.cos(a) * (W / 2 - 0.12) + ((i * 37) % 7) * 0.01, 0.15 + Math.sin(a) * (H - 0.35) + ((i * 13) % 5) * 0.02, ((i % 3) - 1) * 0.1);
      }
      for (const sx of [-1, 1]) b.add(rbox(0.3, 0.06, 0.3, 0.02, 2), gold, sx * (W / 2 - 0.12), 0.03, 0);
      break;
    }
    case 'lamp': {
      b.add(CYL(0.16, 0.18, 0.03, 20), gold, 0, 0.015, 0);
      b.add(CYL(0.012, 0.012, 1.4, 8), gold, 0, 0.72, 0);
      b.add(CYL(0.13, 0.2, 0.26, 24, ), kit.plain('shade', '#fff3f6', 0.8, 0, { emissive: '#ffe2c8', ei: 0.7, side: THREE.DoubleSide }), 0, 1.5, 0);
      break;
    }
    case 'crate': {
      // banca de feira: estrutura de madeira com caixotes inclinados
      const crateW = kit.surf('crateWood', 'wood', { rough: 1, color: '#d8a868' });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.06, sz > 0 ? 0.62 : 0.9, 0.06, 0.01, 1), crateW, sx * (W / 2 - 0.05), (sz > 0 ? 0.62 : 0.9) / 2, sz * (D / 2 - 0.05));
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 3; i++) {
          const x = -0.44 + i * 0.44;
          const y = 0.56 + r * 0.26;
          const z = 0.2 - r * 0.32;
          b.add(rbox(0.42, 0.04, 0.34, 0.01, 1), crateW, x, y - 0.02, z, -0.25, 0, 0);
          for (const sx of [-1, 1]) b.add(rbox(0.02, 0.12, 0.34, 0.005, 1), crateW, x + sx * 0.2, y + 0.04, z, -0.25, 0, 0);
          b.add(rbox(0.42, 0.1, 0.02, 0.005, 1), crateW, x, y + 0.02, z + 0.17, -0.25, 0, 0);
        }
      b.add(rbox(W, 0.04, 0.2, 0.01, 1), kit.plain('crateSign', '#5aa056', 0.6), 0, 0.98, -D / 2 + 0.1);
      break;
    }
    case 'fridge': {
      // geladeira vertical com porta de vidro e luz interna
      const body = kit.plain('fridgeBody', '#f4f6f8', 0.3, 0.2, { envK: 0.9 });
      b.add(rbox(W, H, 0.06, 0.02, 2), body, 0, H / 2, -D / 2 + 0.03);
      for (const sx of [-1, 1]) b.add(rbox(0.06, H, D, 0.02, 2), body, sx * (W / 2 - 0.03), H / 2, 0);
      b.add(rbox(W, 0.12, D, 0.02, 2), body, 0, H - 0.06, 0);
      b.add(rbox(W, 0.16, D, 0.02, 2), kit.plain('fridgeBase', '#3a3a44', 0.5), 0, 0.08, 0);
      for (const y of [0.2, 0.62, 1.04, 1.46]) b.add(rbox(W - 0.14, 0.02, D - 0.12, 0.004, 1), kit.plain('wire', '#c8ccd4', 0.3, 0.8), 0, y, 0);
      b.add(new THREE.PlaneGeometry(W - 0.14, H - 0.3), kit.plain('fridgeLight', '#eaf6ff', 0.4, 0, { emissive: '#dff2ff', ei: 0.45 }), 0, H / 2, -D / 2 + 0.065);
      b.add(rbox(W - 0.04, H - 0.26, 0.03, 0.02, 2), kit.glass('fridgeGlass', '#e6f6ff', 0.18), 0, H / 2 + 0.02, D / 2 - 0.02);
      b.add(rbox(0.03, 0.6, 0.04, 0.01, 1), chrome, W / 2 - 0.12, H / 2, D / 2 + 0.01);
      b.add(new THREE.PlaneGeometry(W - 0.2, 0.08), kit.canvasMat('shelfHead', headerCanvas(), { emissive: 0.3 }), 0, H - 0.06, D / 2 + 0.002);
      break;
    }
    case 'freezer': {
      const body = kit.plain('fridgeBody', '#f4f6f8', 0.3, 0.2, { envK: 0.9 });
      // caixa oca: paredes + fundo (os produtos ficam à vista pela tampa de vidro)
      const hh = H - 0.1;
      for (const sz of [-1, 1]) b.add(rbox(W, hh, 0.06, 0.02, 2), body, 0, hh / 2, sz * (D / 2 - 0.03));
      for (const sx of [-1, 1]) b.add(rbox(0.06, hh, D, 0.02, 2), body, sx * (W / 2 - 0.03), hh / 2, 0);
      b.add(rbox(W, 0.56, D, 0.02, 2), body, 0, 0.28, 0);
      b.add(new THREE.PlaneGeometry(W - 0.12, D - 0.12).rotateX(-Math.PI / 2), kit.plain('freezerIn', '#cfe8f8', 0.5, 0, { emissive: '#bfe4ff', ei: 0.3 }), 0, 0.565, 0);
      const lid = kit.glass('freezerLid', '#e6f6ff', 0.1);
      lid.envMapIntensity = 0.25;
      b.add(rbox(W - 0.06, 0.02, D - 0.06, 0.008, 1), lid, 0, H - 0.06, 0);
      b.add(rbox(W, 0.05, 0.06, 0.02, 1), kit.plain('freezerRim', '#6aa8ff', 0.4), 0, H - 0.08, D / 2 - 0.03);
      break;
    }
    case 'butcher': {
      // balcão refrigerado: base, vitrine curva de vidro, bandejas
      const body = kit.plain('butcherBody', '#f7f1ef', 0.35, 0.1, { envK: 0.7 });
      b.add(rbox(W, 0.78, D, 0.03, 2), body, 0, 0.39, 0);
      b.add(rbox(W, 0.1, D + 0.02, 0.02, 1), kit.plain('butcherRed', '#c8343a', 0.5), 0, 0.73, 0);
      b.add(new THREE.PlaneGeometry(W - 0.08, D - 0.08).rotateX(-Math.PI / 2), kit.plain('butcherIce', '#f4fbff', 0.4, 0, { emissive: '#e8f6ff', ei: 0.25 }), 0, 0.79, 0);
      const gl = new THREE.CylinderGeometry(0.45, 0.45, W - 0.06, 18, 1, true, 0, Math.PI / 2);
      gl.rotateZ(Math.PI / 2).rotateX(Math.PI);
      b.add(gl, kit.glass('fridgeGlass', '#e6f6ff', 0.18), 0, 0.8, -D / 2 + 0.06);
      b.add(rbox(W, 0.03, 0.2, 0.01, 1), body, 0, 1.24, -D / 2 + 0.1);
      break;
    }
    case 'desk': {
      // mesa de escritório + computador (tela com gráfico) + cadeira
      b.add(rbox(W, 0.05, D, 0.015, 2), wood, 0, 0.74, 0);
      for (const sx of [-1, 1]) b.add(rbox(0.05, 0.72, D - 0.08, 0.01, 2), lac, sx * (W / 2 - 0.05), 0.36, 0);
      b.add(rbox(W - 0.2, 0.3, 0.03, 0.01, 1), lac, 0, 0.55, -D / 2 + 0.06);
      b.add(rbox(0.62, 0.4, 0.04, 0.02, 2), black, 0, 1.06, -0.18);
      b.add(new THREE.PlaneGeometry(0.56, 0.34), kit.canvasMat('deskScr', officeScreenCanvas(), { emissive: 0.6 }), 0, 1.06, -0.157);
      b.add(CYL(0.02, 0.02, 0.14, 8), black, 0, 0.83, -0.2);
      b.add(rbox(0.2, 0.012, 0.14, 0.004, 1), black, 0, 0.766, -0.2);
      b.add(rbox(0.42, 0.015, 0.14, 0.005, 1), kit.plain('keyb', '#e8e8ee', 0.4), 0, 0.773, 0.05);
      b.add(rbox(0.22, 0.01, 0.3, 0.004, 1), kit.plain('paper', '#ffffff', 0.8), 0.45, 0.77, 0.05, 0, 0.2, 0);
      // cadeira na frente (+z)
      b.add(rbox(0.46, 0.08, 0.44, 0.03, 2), kit.plain('chair', '#ff8cc0', 0.6), 0, 0.46, 0.55);
      b.add(rbox(0.46, 0.5, 0.06, 0.03, 2), kit.plain('chair', '#ff8cc0', 0.6), 0, 0.76, 0.78);
      b.add(CYL(0.03, 0.03, 0.4, 8), chrome, 0, 0.22, 0.55);
      b.add(CYL(0.22, 0.22, 0.02, 10), chrome, 0, 0.02, 0.55);
      break;
    }
    case 'rack': {
      // porta-pallet: montantes laranja, longarinas azuis, caixas e pallets
      const up = kit.plain('rackUp', '#3a6ab8', 0.5, 0.5);
      const beam = kit.plain('rackBeam', '#f28a2a', 0.5, 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.07, H, 0.07, 0.01, 1), up, sx * (W / 2 - 0.04), H / 2, sz * (D / 2 - 0.04));
      const pal = kit.surf('pallet', 'wood', { rough: 1, color: '#c8a070' });
      const card = kit.surf('cardboard', 'cardboard', { rough: 1, envK: 0.2, uvMeters: false });
      for (const y of [0.12, 1.2]) {
        for (const sz of [-1, 1]) b.add(rbox(W, 0.1, 0.06, 0.01, 1), beam, 0, y, sz * (D / 2 - 0.04));
        b.add(rbox(W - 0.3, 0.12, D - 0.1, 0.01, 1), pal, 0, y + 0.11, 0);
        for (let i = 0; i < 3; i++) b.add(rbox(0.48, 0.38, 0.5, 0.02, 2), card, -0.6 + i * 0.6, y + 0.36, 0.0 + (i % 2) * 0.05);
      }
      b.add(rbox(W, 0.1, 0.06, 0.01, 1), beam, 0, 2.3, D / 2 - 0.04);
      break;
    }
    case 'safe': {
      const st = kit.plain('safeBody', '#5a6070', 0.35, 0.7, { envK: 1.1 });
      b.add(rbox(W, H, D, 0.04, 3), st, 0, H / 2, 0);
      b.add(rbox(W - 0.12, H - 0.12, 0.03, 0.02, 2), kit.plain('safeDoor', '#6a7284', 0.3, 0.8, { envK: 1.2 }), 0, H / 2, D / 2);
      b.add(CYL(0.09, 0.09, 0.04, 24).rotateX(Math.PI / 2), chrome, 0.05, H / 2 + 0.08, D / 2 + 0.03);
      b.add(rbox(0.04, 0.22, 0.04, 0.01, 1), chrome, 0.22, H / 2 - 0.1, D / 2 + 0.03);
      break;
    }
    case 'sofa': {
      const fab = kit.surf('fabricPink', 'fabric', { color: '#f7c3d6' });
      b.add(rbox(W, 0.42, D, 0.1, 3), fab, 0, 0.25, 0);
      b.add(rbox(W, 0.45, 0.2, 0.08, 3), fab, 0, 0.62, -D / 2 + 0.1);
      for (const sx of [-1, 1]) b.add(rbox(0.18, 0.3, D, 0.08, 3), fab, sx * (W / 2 - 0.09), 0.55, 0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(CYL(0.025, 0.02, 0.06, 8), gold, sx * (W / 2 - 0.1), 0.03, sz * (D / 2 - 0.1));
      break;
    }
    case 'art': {
      b.add(rbox(W, H * 0.8, 0.04, 0.01, 1), gold, 0, 1.75, -D / 2 + 0.03);
      b.add(new THREE.PlaneGeometry(W - 0.1, H * 0.8 - 0.1), kit.canvasMat('artPic', artCanvas(), { rough: 0.6 }), 0, 1.75, -D / 2 + 0.056);
      break;
    }
    case 'bin': {
      const green = kit.plain('binBlue', '#3a7ad8', 0.5);
      b.add(rbox(W, H, D, 0.05, 3), green, 0, H / 2, 0);
      b.add(rbox(W + 0.04, 0.06, D + 0.04, 0.02, 2), kit.plain('binLid', '#2a5aa8', 0.5), 0, H + 0.02, 0);
      const ic = document.createElement('canvas');
      ic.width = ic.height = 128;
      const ix = ic.getContext('2d')!;
      ix.fillStyle = '#3a7ad8';
      ix.fillRect(0, 0, 128, 128);
      ix.strokeStyle = '#fff';
      ix.lineWidth = 10;
      ix.lineCap = 'round';
      for (let k = 0; k < 3; k++) {
        ix.beginPath();
        ix.arc(64, 64, 34, (k * Math.PI * 2) / 3 + 0.3, (k * Math.PI * 2) / 3 + 1.8);
        ix.stroke();
      }
      b.add(new THREE.PlaneGeometry(0.4, 0.4), kit.canvasMat('recycle', ic), 0, H * 0.55, D / 2 + 0.002);
      break;
    }
  }
  const group = b.build({ shadow: kit.tier >= 3, receive: true });
  // sombra de contato (AO assada)
  if (!def.flat) {
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), kit.shadowMat());
    sh.rotation.x = -Math.PI / 2;
    sh.position.y = 0.004;
    if (kind === 'art') sh.visible = false;
    const round = kind === 'tableRound' || kind === 'plant' || kind === 'pouf' || kind === 'flowers' || kind === 'lamp';
    sh.scale.set(W * (round ? 1.5 : 1.35) + 0.15, D * (round ? 1.5 : 1.5) + 0.15, 1);
    sh.renderOrder = -1;
    group.add(sh);
  }
  group.userData.kind = kind;
  return { group, slots: slotSpecs(kind), anim };
}
