/* ============================================================
 *  COZINHA 3D — desenho dos pedidos nos objetos do mundo:
 *  tela grande sobre o passa-pratos (todos os pedidos, com paciência)
 *  e a comanda de papel que sai da impressora (o pedido novo).
 *  A receita é uma SEQUÊNCIA de figuras: [tomate] › [faca] = "tomate cortado".
 * ============================================================ */
import { gameFont } from '../../i18n/font';
import { t } from '../../i18n';
import { INGS, RECIPES, compIng, compRoute, compStage, type Proc } from './data';
import { INK, blitIng, drawPlate } from './art';
import type { Sim } from './sim';

const TAU = Math.PI * 2;

export function procGlyph(x: CanvasRenderingContext2D, p: Proc, cx: number, cy: number, r: number): void {
  x.save();
  x.translate(cx, cy);
  x.beginPath();
  x.arc(0, 0, r * 1.45, 0, TAU);
  x.fillStyle = p === 'chop' ? '#ffe2b8' : p === 'blend' ? '#d8f6ff' : p === 'boil' ? '#dbe9ff' : '#ffe0d0';
  x.fill();
  x.lineWidth = Math.max(1, r * 0.12);
  x.strokeStyle = INK;
  x.stroke();
  x.lineWidth = Math.max(1.5, r * 0.18);
  x.beginPath();
  if (p === 'chop') {
    // faca
    x.moveTo(-r * 0.9, r * 0.75);
    x.lineTo(r * 0.1, -r * 0.25);
    x.strokeStyle = '#3a2a20';
    x.lineWidth = r * 0.35;
    x.stroke();
    x.beginPath();
    x.moveTo(-r * 0.05, -r * 0.1);
    x.lineTo(r * 0.95, -r * 1.0);
    x.lineTo(r * 0.55, -r * 0.1);
    x.closePath();
    x.fillStyle = '#d9dde6';
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = Math.max(1, r * 0.1);
    x.stroke();
  } else if (p === 'boil') {
    x.roundRect(-r, -r * 0.5, r * 2, r * 1.2, r * 0.3);
    x.fillStyle = '#9fd0ff';
    x.fill();
    x.stroke();
  } else if (p === 'fry') {
    x.ellipse(-r * 0.15, 0, r * 0.8, r * 0.55, 0, 0, TAU);
    x.fillStyle = '#3b3550';
    x.fill();
    x.fillRect(r * 0.55, -r * 0.12, r * 0.7, r * 0.24);
  } else if (p === 'bake') {
    x.roundRect(-r, -r * 0.8, r * 2, r * 1.6, r * 0.3);
    x.fillStyle = '#ff9a6b';
    x.fill();
    x.stroke();
  } else {
    x.moveTo(-r * 0.7, -r);
    x.lineTo(r * 0.7, -r);
    x.lineTo(r * 0.5, r);
    x.lineTo(-r * 0.5, r);
    x.closePath();
    x.fillStyle = '#e0feff';
    x.fill();
    x.stroke();
  }
  x.restore();
}

/** linha de figuras da receita centrada em (cx, cy), cabendo em w */
function recipeRow(x: CanvasRenderingContext2D, ri: number, cx: number, cy: number, w: number, maxU: number, held: number[] | null): void {
  const r = RECIPES[ri];
  // células: por parte, 1 ingrediente + passos; "+" entre partes
  let cells = 0;
  for (const c of r.parts) cells += 1 + compStage(c);
  const plus = r.parts.length - 1;
  const unit = Math.min(maxU, w / (cells * 1.15 + plus * 0.55));
  let px = cx - (unit * cells * 1.15 + unit * plus * 0.55) / 2 + unit * 0.575;
  r.parts.forEach((c, i) => {
    if (i > 0) {
      x.fillStyle = INK;
      x.font = gameFont(700, unit * 0.6);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('+', px - unit * 0.3, cy);
      px += unit * 0.55;
    }
    const st = compStage(c);
    const route = INGS[compIng(c)].routes[compRoute(c)];
    const done = held?.includes(c);
    blitIng(x, c - st, false, px, cy, unit * 1.05);
    if (done) {
      x.fillStyle = '#3ee07a';
      x.beginPath();
      x.arc(px + unit * 0.35, cy - unit * 0.35, unit * 0.2, 0, TAU);
      x.fill();
    }
    for (let k = 0; k < st; k++) {
      x.fillStyle = INK;
      x.beginPath();
      const ax = px + unit * 0.52;
      x.moveTo(ax, cy - unit * 0.12);
      x.lineTo(ax + unit * 0.18, cy);
      x.lineTo(ax, cy + unit * 0.12);
      x.fill();
      px += unit * 1.15;
      procGlyph(x, route[k], px, cy, unit * 0.32);
    }
    px += unit * 1.15;
  });
}

/** tela de pedidos (até 4 cartões) + nota amarela de dica (treino) */
export function drawScreen(x: CanvasRenderingContext2D, w: number, h: number, sim: Sim, held: number[] | null, tip: string, time: number): void {
  x.fillStyle = '#1b1430';
  x.fillRect(0, 0, w, h);
  const noteW = tip ? w * 0.27 : 0;
  const n = Math.max(1, Math.min(4, sim.orders.length));
  const gap = 14;
  const cw = Math.min(380, (w - noteW - gap * (n + 1)) / n);
  if (!sim.orders.length) {
    x.fillStyle = '#8a80b0';
    x.font = gameFont(600, h * 0.16);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(t('cozinha.fps.waiting', 'Esperando clientes...'), (w - noteW) / 2, h / 2 + Math.sin(time * 3) * 4);
  }
  sim.orders.slice(0, 4).forEach((o, i) => {
    const r = RECIPES[o.r];
    const frac = Math.max(0, o.t / o.max);
    const left = gap + i * (cw + gap);
    const top = 14 + (1 - o.a) * -h;
    const ch = h - 28;
    x.save();
    x.translate(left, top);
    x.beginPath();
    x.roundRect(0, 0, cw, ch, 18);
    x.fillStyle = o.vip ? '#fff3a0' : '#fffaf0';
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = o.vip ? '#e98f00' : INK;
    x.stroke();
    // paciência (some se for treino)
    if (o.max < 1e5) {
      x.fillStyle = frac > 0.5 ? '#3ee07a' : frac > 0.25 ? '#ffcf2e' : '#ff4f6a';
      x.beginPath();
      x.roundRect(10, 10, (cw - 20) * frac, 14, 7);
      x.fill();
    }
    // número + nome
    x.fillStyle = INK;
    x.font = gameFont(700, Math.min(34, ch * 0.17));
    x.textAlign = 'center';
    x.textBaseline = 'top';
    let name = r.name();
    while (name.length > 3 && x.measureText(name + '…').width > cw - 20) name = name.slice(0, -1);
    if (name !== r.name()) name += '…';
    x.fillText(name, cw / 2, 32);
    recipeRow(x, o.r, cw / 2 - cw * 0.08, ch * 0.66, cw * 0.72, ch * 0.42, held);
    // louça (para onde vai)
    drawPlate(x, [], cw - cw * 0.11, ch * 0.66, Math.min(cw * 0.16, ch * 0.3), false, r.dish);
    x.restore();
  });
  if (tip) {
    // nota adesiva amarela, levemente torta
    x.save();
    x.translate(w - noteW / 2 - 8, h / 2);
    x.rotate(-0.03);
    x.fillStyle = '#ffe66b';
    x.fillRect(-noteW / 2 + 6, -h / 2 + 10, noteW - 12, h - 20);
    x.fillStyle = 'rgba(0,0,0,.08)';
    x.fillRect(-noteW / 2 + 6, -h / 2 + 10, noteW - 12, 18);
    x.fillStyle = INK;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    let fs = Math.round(h * 0.13);
    x.font = gameFont(700, fs);
    const lines = wrap(x, tip, noteW - 36, 4, fs);
    fs = lines.fs;
    x.font = gameFont(700, fs);
    lines.l.forEach((ln, i) => x.fillText(ln, 0, (i - (lines.l.length - 1) / 2) * fs * 1.15 + 8));
    x.restore();
  }
}
function wrap(x: CanvasRenderingContext2D, s: string, maxW: number, maxL: number, fs0: number): { l: string[]; fs: number } {
  let fs = fs0;
  for (;;) {
    x.font = gameFont(700, fs);
    const words = s.split(/\s+/);
    const l: string[] = [];
    let cur = '';
    for (const wd of words) {
      const nx = cur ? cur + ' ' + wd : wd;
      if (x.measureText(nx).width > maxW && cur) {
        l.push(cur);
        cur = wd;
      } else cur = nx;
    }
    if (cur) l.push(cur);
    if (l.length <= maxL || fs < 14) return { l, fs };
    fs -= 3;
  }
}

/** comanda de papel (pedido novo) */
export function drawTicket(x: CanvasRenderingContext2D, w: number, h: number, ri: number, num: number): void {
  x.fillStyle = '#fffdf4';
  x.fillRect(0, 0, w, h);
  // serrilhado embaixo
  x.fillStyle = '#e8e2d0';
  for (let i = 0; i < w; i += 16) {
    x.beginPath();
    x.moveTo(i, h);
    x.lineTo(i + 8, h - 10);
    x.lineTo(i + 16, h);
    x.fill();
  }
  x.fillStyle = INK;
  x.textAlign = 'center';
  x.textBaseline = 'top';
  x.font = gameFont(700, 26);
  x.fillText(t('cozinha.fps.ticketN', 'PEDIDO #{n}', { n: num }), w / 2, 14);
  x.fillRect(16, 50, w - 32, 3);
  const r = RECIPES[ri];
  x.font = gameFont(700, 30);
  let name = r.name();
  while (name.length > 3 && x.measureText(name).width > w - 20) name = name.slice(0, -1);
  x.fillText(name, w / 2, 62);
  // uma parte por linha (grande, legível)
  const rows = r.parts.length;
  const rh = Math.min(90, (h - 130) / rows);
  r.parts.forEach((c, i) => {
    const st = compStage(c);
    const route = INGS[compIng(c)].routes[compRoute(c)];
    const cy = 112 + rh * (i + 0.5);
    const u = rh * 0.75;
    let px = w / 2 - ((1 + st) * u * 1.2) / 2 + u * 0.6;
    blitIng(x, c - st, false, px, cy, u);
    for (let k = 0; k < st; k++) {
      px += u * 1.2;
      procGlyph(x, route[k], px, cy, u * 0.34);
    }
  });
}
