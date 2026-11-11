/* ============================================================
 *  MUNDO — ícones dos itens desenhados em canvas (estilo Bloop:
 *  contorno roxo-escuro grosso, cores vivas, brilho em cima).
 *  Gerados uma vez por item e guardados como dataURL.
 * ============================================================ */
import { ITEM, type ItemDef } from './items';

const INK = '#2a0b5c';
const cache = new Map<string, string>();
let cv: HTMLCanvasElement | null = null;

export function iconURL(id: string): string {
  let u = cache.get(id);
  if (u) return u;
  const d = ITEM.get(id);
  if (!d) return '';
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = cv.height = 64;
  }
  const x = cv.getContext('2d')!;
  x.clearRect(0, 0, 64, 64);
  x.save();
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.lineWidth = 4;
  x.strokeStyle = INK;
  draw(x, d);
  x.restore();
  u = cv.toDataURL();
  cache.set(id, u);
  return u;
}

function shine(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.ellipse(cx, cy, r, r * 0.55, -0.6, 0, Math.PI * 2);
  x.fill();
}
function poly(x: CanvasRenderingContext2D, pts: number[], fill: string): void {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
  x.fillStyle = fill;
  x.fill();
  x.stroke();
}
function rect(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, fill: string, r = 5): void {
  x.beginPath();
  x.roundRect(a, b, w, h, r);
  x.fillStyle = fill;
  x.fill();
  x.stroke();
}
function circ(x: CanvasRenderingContext2D, a: number, b: number, r: number, fill: string): void {
  x.beginPath();
  x.arc(a, b, r, 0, Math.PI * 2);
  x.fillStyle = fill;
  x.fill();
  x.stroke();
}
function handle(x: CanvasRenderingContext2D): void {
  x.save();
  x.lineWidth = 9;
  x.beginPath();
  x.moveTo(14, 52);
  x.lineTo(40, 24);
  x.stroke();
  x.lineWidth = 5;
  x.strokeStyle = '#c8843c';
  x.stroke();
  x.restore();
}

function draw(x: CanvasRenderingContext2D, d: ItemDef): void {
  const c = d.ic.c;
  const c2 = d.ic.c2 ?? c;
  switch (d.ic.s) {
    case 'log':
      rect(x, 8, 20, 44, 24, c, 12);
      circ(x, 50, 32, 11, c2);
      x.beginPath();
      x.arc(50, 32, 5, 0, Math.PI * 2);
      x.stroke();
      break;
    case 'plank':
      rect(x, 6, 22, 52, 20, c, 4);
      x.beginPath();
      x.moveTo(12, 32);
      x.lineTo(30, 32);
      x.moveTo(36, 30);
      x.lineTo(52, 30);
      x.stroke();
      break;
    case 'stick':
    case 'rope':
    case 'wire':
      x.save();
      x.lineWidth = 10;
      x.beginPath();
      x.moveTo(12, 52);
      if (d.ic.s === 'stick') x.lineTo(52, 12);
      else x.bezierCurveTo(4, 20, 60, 44, 52, 12);
      x.stroke();
      x.lineWidth = 5;
      x.strokeStyle = c;
      x.stroke();
      x.restore();
      break;
    case 'fiber':
    case 'wheat':
      for (let i = 0; i < 3; i++) {
        x.save();
        x.translate(20 + i * 12, 54);
        x.rotate((i - 1) * 0.3);
        poly(x, [0, 0, -4, -22, 0, -44, 4, -22], c);
        x.restore();
      }
      break;
    case 'leaf':
    case 'sapling':
      if (d.ic.s === 'sapling') rect(x, 29, 34, 6, 22, c2, 2);
      x.beginPath();
      x.ellipse(32, 26, 14, 20, 0.6, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      x.beginPath();
      x.moveTo(22, 40);
      x.lineTo(42, 12);
      x.stroke();
      break;
    case 'cloth':
    case 'wool':
    case 'cushion':
      x.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        x.arc(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 12, 10, 0, Math.PI * 2);
      }
      x.fillStyle = c;
      x.fill();
      x.stroke();
      circ(x, 32, 32, 12, c2);
      break;
    case 'rock':
    case 'pebble': {
      const k = d.ic.s === 'pebble' ? 0.6 : 1;
      x.save();
      x.translate(32, 34);
      x.scale(k, k);
      poly(x, [-22, 8, -16, -14, 2, -22, 20, -12, 24, 10, 6, 20, -14, 18], c);
      x.restore();
      shine(x, 24, 26, 6 * k);
      break;
    }
    case 'dirt':
      poly(x, [8, 44, 14, 22, 32, 14, 50, 22, 56, 44, 32, 54], c);
      for (const [a, b] of [[22, 34], [38, 30], [32, 44]]) {
        x.fillStyle = 'rgba(0,0,0,.18)';
        x.beginPath();
        x.arc(a, b, 3, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 'ore':
      poly(x, [8, 40, 16, 16, 40, 10, 56, 26, 52, 50, 24, 54], c);
      for (const [a, b] of [[24, 28], [40, 24], [34, 42], [20, 42]]) circ(x, a, b, 5, c2);
      break;
    case 'ingot':
      poly(x, [6, 44, 16, 24, 50, 24, 58, 44], c);
      poly(x, [16, 24, 22, 16, 44, 16, 50, 24], c2);
      break;
    case 'gem':
    case 'crystallamp':
      poly(x, [32, 6, 50, 24, 32, 58, 14, 24], c);
      poly(x, [14, 24, 50, 24, 32, 6], c2);
      break;
    case 'glass':
    case 'gwall':
    case 'window':
      rect(x, 10, 10, 44, 44, d.ic.s === 'window' ? '#bfeaff' : c, 6);
      if (d.ic.s === 'window') {
        x.save();
        x.lineWidth = 7;
        x.strokeStyle = c;
        x.strokeRect(10, 10, 44, 44);
        x.beginPath();
        x.moveTo(32, 10);
        x.lineTo(32, 54);
        x.moveTo(10, 32);
        x.lineTo(54, 32);
        x.stroke();
        x.restore();
      }
      shine(x, 24, 22, 8);
      break;
    case 'brick':
      rect(x, 6, 18, 52, 30, c, 4);
      x.beginPath();
      x.moveTo(6, 33);
      x.lineTo(58, 33);
      x.moveTo(24, 18);
      x.lineTo(24, 33);
      x.moveTo(40, 33);
      x.lineTo(40, 48);
      x.stroke();
      break;
    case 'blob':
    case 'drop':
      x.beginPath();
      x.moveTo(32, 8);
      x.bezierCurveTo(52, 30, 56, 54, 32, 54);
      x.bezierCurveTo(8, 54, 12, 30, 32, 8);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      shine(x, 26, 38, 6);
      break;
    case 'feather':
      x.beginPath();
      x.ellipse(34, 28, 10, 22, 0.7, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      x.beginPath();
      x.moveTo(14, 54);
      x.lineTo(44, 18);
      x.stroke();
      break;
    case 'shell':
      x.beginPath();
      x.arc(32, 38, 22, Math.PI, 0);
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      for (let i = -1; i <= 1; i++) {
        x.beginPath();
        x.moveTo(32, 38);
        x.lineTo(32 + i * 14, 20);
        x.stroke();
      }
      break;
    case 'dust':
      for (const [a, b, r] of [[22, 40, 9], [38, 36, 11], [30, 24, 8], [44, 22, 5]]) circ(x, a, b, r, c);
      break;
    case 'spike':
      poly(x, [32, 6, 40, 56, 24, 56], c);
      break;
    case 'gear':
      x.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const r = i % 2 ? 18 : 25;
        x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      circ(x, 32, 32, 7, '#fff');
      break;
    case 'seed':
      for (const [a, b] of [[24, 30], [38, 26], [32, 42]]) {
        x.beginPath();
        x.ellipse(a, b, 6, 9, 0.5, 0, Math.PI * 2);
        x.fillStyle = c;
        x.fill();
        x.stroke();
      }
      break;
    case 'fruit':
    case 'berry':
    case 'pumpkin':
      circ(x, 32, 36, d.ic.s === 'berry' ? 16 : 20, c);
      if (d.ic.s === 'berry') {
        circ(x, 22, 26, 10, c);
        circ(x, 42, 26, 10, c);
      }
      poly(x, [32, 16, 44, 8, 40, 18], c2);
      shine(x, 24, 28, 6);
      break;
    case 'mush':
      rect(x, 25, 32, 14, 22, c2, 5);
      x.beginPath();
      x.arc(32, 34, 24, Math.PI, 0);
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      for (const [a, b] of [[22, 24], [38, 20], [44, 30]]) {
        x.fillStyle = '#fff';
        x.beginPath();
        x.arc(a, b, 3.5, 0, Math.PI * 2);
        x.fill();
      }
      break;
    case 'egg':
      if (c2 !== c) {
        x.beginPath();
        x.ellipse(32, 34, 26, 20, 0, 0, Math.PI * 2);
        x.fillStyle = c;
        x.fill();
        x.stroke();
        circ(x, 32, 32, 10, c2);
      } else {
        x.beginPath();
        x.ellipse(32, 34, 17, 22, 0, 0, Math.PI * 2);
        x.fillStyle = c;
        x.fill();
        x.stroke();
        shine(x, 26, 24, 5);
      }
      break;
    case 'bread':
    case 'potato':
      x.beginPath();
      x.ellipse(32, 36, 24, 16, -0.2, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      if (c2 !== c) {
        x.beginPath();
        x.ellipse(30, 32, 10, 5, -0.2, 0, Math.PI * 2);
        x.fillStyle = c2;
        x.fill();
      }
      break;
    case 'carrot':
      poly(x, [18, 18, 46, 18, 32, 58], c);
      poly(x, [26, 18, 32, 4, 38, 18], c2);
      break;
    case 'corn':
      x.beginPath();
      x.ellipse(32, 32, 11, 24, 0, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      poly(x, [20, 56, 14, 26, 30, 50], c2);
      poly(x, [44, 56, 50, 26, 34, 50], c2);
      break;
    case 'popcorn':
    case 'bowl':
    case 'cup':
    case 'salad':
      if (d.ic.s === 'cup') rect(x, 18, 14, 28, 42, c2, 6);
      else {
        x.beginPath();
        x.arc(32, 30, 24, 0, Math.PI);
        x.closePath();
        x.fillStyle = d.ic.s === 'popcorn' ? '#fff' : c2;
        x.fill();
        x.stroke();
      }
      if (d.ic.s === 'popcorn') {
        x.fillStyle = c2;
        x.fillRect(18, 34, 6, 14);
        x.fillRect(32, 34, 6, 18);
        for (const [a, b] of [[20, 26], [32, 22], [44, 26], [26, 18], [38, 16]]) circ(x, a, b, 7, c);
      } else if (d.ic.s === 'cup') {
        x.fillStyle = c;
        x.fillRect(21, 22, 22, 31);
      } else {
        x.beginPath();
        x.ellipse(32, 30, 22, 6, 0, 0, Math.PI * 2);
        x.fillStyle = c;
        x.fill();
        x.stroke();
      }
      break;
    case 'pie':
    case 'cake':
      rect(x, 8, 28, 48, 24, c, 6);
      rect(x, 8, 20, 48, 12, c2, 6);
      if (d.ic.s === 'cake') circ(x, 32, 14, 5, '#ff4f6a');
      break;
    case 'skewer':
      x.beginPath();
      x.moveTo(8, 56);
      x.lineTo(56, 8);
      x.stroke();
      circ(x, 22, 42, 8, c);
      circ(x, 32, 32, 8, c2);
      circ(x, 42, 22, 8, c);
      break;
    case 'pick':
      handle(x);
      x.beginPath();
      x.moveTo(12, 22);
      x.quadraticCurveTo(36, 2, 58, 30);
      x.lineTo(50, 32);
      x.quadraticCurveTo(36, 16, 20, 28);
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      break;
    case 'axe':
      handle(x);
      poly(x, [34, 16, 50, 6, 58, 26, 46, 34], c);
      break;
    case 'shovel':
      handle(x);
      x.beginPath();
      x.ellipse(46, 18, 9, 13, 0.8, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      break;
    case 'hoe':
      handle(x);
      poly(x, [36, 22, 44, 12, 56, 20, 50, 26], c);
      break;
    case 'hammer':
      handle(x);
      rect(x, 32, 8, 26, 16, c, 4);
      break;
    case 'sword':
      poly(x, [50, 8, 56, 14, 26, 44, 20, 38], c);
      rect(x, 14, 36, 16, 8, c2, 3);
      x.save();
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(18, 46);
      x.lineTo(10, 54);
      x.stroke();
      x.restore();
      circ(x, 50, 14, 2, '#fff');
      break;
    case 'sling':
      x.save();
      x.lineWidth = 8;
      x.beginPath();
      x.moveTo(32, 58);
      x.lineTo(32, 34);
      x.lineTo(18, 12);
      x.moveTo(32, 34);
      x.lineTo(46, 12);
      x.stroke();
      x.lineWidth = 4;
      x.strokeStyle = c;
      x.stroke();
      x.strokeStyle = c2;
      x.beginPath();
      x.moveTo(18, 12);
      x.quadraticCurveTo(32, 30, 46, 12);
      x.stroke();
      x.restore();
      break;
    case 'boomerang':
      poly(x, [10, 50, 28, 10, 38, 14, 24, 44, 54, 40, 52, 52], c);
      break;
    case 'tnt':
      for (let i = 0; i < 3; i++) rect(x, 10 + i * 15, 22, 13, 34, c, 4);
      x.beginPath();
      x.moveTo(32, 22);
      x.quadraticCurveTo(34, 8, 46, 6);
      x.stroke();
      circ(x, 48, 6, 4, c2);
      break;
    case 'helmet':
      x.beginPath();
      x.arc(32, 38, 22, Math.PI, 0);
      x.lineTo(54, 46);
      x.lineTo(10, 46);
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      shine(x, 24, 26, 6);
      break;
    case 'vest':
      poly(x, [14, 10, 26, 10, 32, 18, 38, 10, 50, 10, 54, 56, 10, 56], c);
      break;
    case 'pants':
      poly(x, [14, 8, 50, 8, 52, 56, 36, 56, 32, 28, 28, 56, 12, 56], c);
      break;
    case 'boots':
      poly(x, [8, 20, 22, 20, 22, 44, 30, 46, 30, 56, 8, 56], c);
      poly(x, [34, 20, 48, 20, 48, 44, 56, 46, 56, 56, 34, 56], c);
      break;
    case 'floor':
    case 'rug':
    case 'plot':
      poly(x, [6, 38, 32, 24, 58, 38, 32, 52], c);
      if (d.ic.s === 'plot') for (const a of [20, 32, 44]) circ(x, a, 38, 3, c2);
      if (d.ic.s === 'rug') circ(x, 32, 38, 6, c2);
      break;
    case 'wall':
    case 'half':
      rect(x, 10, d.ic.s === 'half' ? 30 : 10, 44, d.ic.s === 'half' ? 24 : 44, c, 3);
      x.beginPath();
      x.moveTo(10, 32);
      x.lineTo(54, 32);
      x.moveTo(32, 10);
      x.lineTo(32, 54);
      x.stroke();
      break;
    case 'roof':
      poly(x, [4, 44, 32, 12, 60, 44], c);
      rect(x, 14, 44, 36, 10, c2, 2);
      break;
    case 'door':
    case 'wardrobe':
      rect(x, 16, 6, 32, 52, c, 6);
      circ(x, 40, 34, 3, c2);
      break;
    case 'stairs':
      poly(x, [8, 56, 8, 44, 22, 44, 22, 30, 36, 30, 36, 16, 56, 16, 56, 56], c);
      break;
    case 'fence':
      for (const a of [12, 28, 44]) rect(x, a, 12, 9, 44, c, 3);
      rect(x, 6, 24, 52, 7, c2, 2);
      rect(x, 6, 40, 52, 7, c2, 2);
      break;
    case 'pillar':
      rect(x, 22, 6, 20, 52, c, 4);
      rect(x, 16, 6, 32, 8, c2, 3);
      rect(x, 16, 50, 32, 8, c2, 3);
      break;
    case 'torch':
      rect(x, 28, 26, 8, 32, c, 3);
      x.beginPath();
      x.moveTo(32, 6);
      x.bezierCurveTo(46, 20, 40, 28, 32, 28);
      x.bezierCurveTo(24, 28, 18, 20, 32, 6);
      x.fillStyle = c2;
      x.fill();
      x.stroke();
      break;
    case 'lamp':
    case 'lantern':
    case 'floorlamp':
      if (d.ic.s === 'floorlamp') rect(x, 29, 30, 6, 28, c2, 2);
      rect(x, 18, d.ic.s === 'floorlamp' ? 6 : 14, 28, 30, c, 8);
      circ(x, 32, d.ic.s === 'floorlamp' ? 20 : 29, 7, c2);
      if (d.ic.s !== 'floorlamp') rect(x, 26, 6, 12, 8, INK, 2);
      break;
    case 'chair':
    case 'stool':
    case 'bench':
    case 'sofa':
      if (d.ic.s !== 'stool') rect(x, 12, 8, 10, 40, c2, 3);
      rect(x, 12, 30, 42, 10, c, 3);
      rect(x, 14, 40, 6, 16, c2, 2);
      rect(x, 46, 40, 6, 16, c2, 2);
      break;
    case 'table':
      rect(x, 6, 20, 52, 10, c, 3);
      rect(x, 12, 30, 7, 26, c2, 2);
      rect(x, 45, 30, 7, 26, c2, 2);
      break;
    case 'bed':
      rect(x, 6, 28, 52, 20, c, 5);
      rect(x, 6, 16, 14, 32, c2, 5);
      rect(x, 8, 48, 6, 8, '#a8743c', 2);
      rect(x, 50, 48, 6, 8, '#a8743c', 2);
      break;
    case 'shelf':
      rect(x, 10, 6, 44, 52, c, 3);
      for (const b of [22, 38]) {
        x.beginPath();
        x.moveTo(10, b);
        x.lineTo(54, b);
        x.stroke();
      }
      for (const a of [16, 24, 36]) rect(x, a, 9, 6, 12, c2, 1);
      break;
    case 'frame':
      rect(x, 8, 12, 48, 40, c, 3);
      rect(x, 16, 20, 32, 24, c2, 2);
      break;
    case 'vase':
    case 'plant':
      x.beginPath();
      x.ellipse(32, 22, 16, 12, 0, 0, Math.PI * 2);
      x.fillStyle = d.ic.s === 'plant' ? c : c2;
      x.fill();
      x.stroke();
      poly(x, [18, 32, 46, 32, 42, 58, 22, 58], d.ic.s === 'plant' ? c2 : c);
      break;
    case 'clock':
      circ(x, 32, 32, 24, c);
      circ(x, 32, 32, 17, c2);
      x.beginPath();
      x.moveTo(32, 32);
      x.lineTo(32, 20);
      x.moveTo(32, 32);
      x.lineTo(42, 36);
      x.stroke();
      break;
    case 'flag':
    case 'bunting':
      if (d.ic.s === 'flag') {
        rect(x, 14, 6, 6, 52, c2, 2);
        poly(x, [20, 8, 54, 16, 20, 30], c);
      } else {
        x.beginPath();
        x.moveTo(4, 14);
        x.quadraticCurveTo(32, 30, 60, 14);
        x.stroke();
        for (let i = 0; i < 4; i++) poly(x, [8 + i * 13, 18, 20 + i * 13, 20, 14 + i * 13, 36], i % 2 ? c2 : c);
      }
      break;
    case 'statue':
    case 'totem':
      rect(x, 14, 46, 36, 12, c2, 3);
      circ(x, 32, 28, 18, c);
      x.fillStyle = INK;
      x.beginPath();
      x.arc(26, 26, 3, 0, Math.PI * 2);
      x.arc(38, 26, 3, 0, Math.PI * 2);
      x.fill();
      x.beginPath();
      x.arc(32, 32, 7, 0.2, Math.PI - 0.2);
      x.stroke();
      break;
    case 'workbench':
      rect(x, 6, 18, 52, 14, c, 3);
      rect(x, 10, 32, 8, 24, c2, 2);
      rect(x, 46, 32, 8, 24, c2, 2);
      rect(x, 22, 8, 6, 12, '#c8ccd8', 2);
      break;
    case 'furnace':
      rect(x, 8, 8, 48, 48, c, 6);
      x.beginPath();
      x.arc(32, 40, 12, Math.PI, 0);
      x.closePath();
      x.fillStyle = c2;
      x.fill();
      x.stroke();
      break;
    case 'anvil':
      poly(x, [6, 18, 58, 18, 50, 30, 40, 30, 44, 50, 20, 50, 24, 30, 14, 30], c);
      shine(x, 26, 22, 5);
      break;
    case 'workshop':
      rect(x, 6, 20, 52, 36, c, 4);
      x.beginPath();
      x.moveTo(6, 20);
      x.lineTo(32, 6);
      x.lineTo(58, 20);
      x.stroke();
      circ(x, 32, 38, 10, c2);
      break;
    case 'chest':
    case 'bigchest':
      rect(x, 6, 20, 52, 36, c, 6);
      rect(x, 6, 14, 52, 14, c, 6);
      rect(x, 27, 26, 10, 12, c2, 2);
      break;
    case 'campfire':
      x.beginPath();
      x.moveTo(32, 8);
      x.bezierCurveTo(52, 30, 46, 46, 32, 46);
      x.bezierCurveTo(18, 46, 12, 30, 32, 8);
      x.fillStyle = c2;
      x.fill();
      x.stroke();
      rect(x, 8, 46, 48, 8, c, 4);
      break;
    case 'rail':
    case 'boostrail':
      for (const a of [14, 30, 46]) rect(x, 6, a - 3, 52, 7, '#a8743c', 2);
      rect(x, 16, 6, 6, 52, c, 2);
      rect(x, 42, 6, 6, 52, c, 2);
      if (d.ic.s === 'boostrail') circ(x, 32, 32, 6, c2);
      break;
    case 'cart':
    case 'bucket':
      poly(x, [6, 18, 58, 18, 52, 46, 12, 46], c);
      circ(x, 20, 50, 7, '#3a3a4a');
      circ(x, 44, 50, 7, '#3a3a4a');
      break;
    case 'wheel':
    case 'steering':
      circ(x, 32, 32, 24, c);
      circ(x, 32, 32, 10, c2);
      break;
    case 'engine':
      rect(x, 8, 18, 48, 34, c, 6);
      for (const a of [16, 28, 40]) rect(x, a, 8, 8, 12, c2, 2);
      break;
    case 'chassis':
    case 'tracks':
      rect(x, 4, 22, 56, 20, c, 6);
      for (const a of [14, 32, 50]) circ(x, a, 44, 7, c2);
      break;
    case 'seat':
      rect(x, 12, 8, 14, 44, c, 5);
      rect(x, 12, 36, 40, 14, c, 5);
      break;
    case 'rotor':
    case 'pinwheel':
      for (let i = 0; i < 4; i++) {
        x.save();
        x.translate(32, 32);
        x.rotate((i * Math.PI) / 2 + 0.3);
        poly(x, [0, 0, 6, -26, -6, -26], i % 2 ? c2 : c);
        x.restore();
      }
      circ(x, 32, 32, 5, '#fff');
      break;
    case 'hull':
      poly(x, [4, 24, 60, 24, 50, 48, 14, 48], c);
      rect(x, 4, 20, 56, 6, c2, 2);
      break;
    case 'fork':
      rect(x, 10, 6, 8, 50, c, 2);
      rect(x, 10, 42, 46, 6, c2, 2);
      rect(x, 10, 52, 46, 6, c2, 2);
      break;
    case 'kit':
      rect(x, 6, 16, 52, 40, c, 6);
      rect(x, 22, 8, 20, 12, c2, 4);
      circ(x, 20, 44, 6, '#3a3a4a');
      circ(x, 44, 44, 6, '#3a3a4a');
      break;
    case 'flower':
      x.beginPath();
      x.moveTo(32, 58);
      x.lineTo(32, 30);
      x.strokeStyle = c2;
      x.lineWidth = 5;
      x.stroke();
      x.strokeStyle = INK;
      x.lineWidth = 4;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circ(x, 32 + Math.cos(a) * 10, 22 + Math.sin(a) * 10, 8, c);
      }
      circ(x, 32, 22, 6, '#ffd34a');
      break;
    case 'balloon':
      x.beginPath();
      x.moveTo(32, 46);
      x.lineTo(30, 60);
      x.stroke();
      x.beginPath();
      x.ellipse(32, 24, 16, 20, 0, 0, Math.PI * 2);
      x.fillStyle = c;
      x.fill();
      x.stroke();
      shine(x, 26, 16, 5);
      break;
    case 'fountain':
      rect(x, 6, 38, 52, 18, c, 6);
      rect(x, 26, 18, 12, 22, c, 3);
      circ(x, 32, 14, 8, c2);
      break;
    case 'bell':
      x.beginPath();
      x.moveTo(14, 46);
      x.quadraticCurveTo(16, 10, 32, 10);
      x.quadraticCurveTo(48, 10, 50, 46);
      x.closePath();
      x.fillStyle = c;
      x.fill();
      x.stroke();
      circ(x, 32, 50, 5, c2);
      break;
    default:
      circ(x, 32, 32, 22, c);
  }
}
