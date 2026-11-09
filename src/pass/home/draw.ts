/* ============================================================
 *  PASSE DA CASA — desenho procedural dos itens (ícone/prévia) e
 *  arte da temporada (casinha num planeta). Paleta + acabamento + motivo.
 *  drawHomeItem é usado no passe e pode ser usado pelo construtor como
 *  prévia/ícone; no cômodo, o construtor desenha pelo `furn.kind` + cores
 *  (ver adapter.ts). Sem alocação por quadro além de gradientes.
 * ============================================================ */
import type { SeasonInfo } from '../../creatures/seasons';
import { mixHex } from '../art';
import { rng } from '../catalog';
import type { HomePassItem } from './catalog';

const INK = '#2a0b5c';

function rr(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number): void {
  x.beginPath();
  x.moveTo(px + r, py);
  x.arcTo(px + w, py, px + w, py + h, r);
  x.arcTo(px + w, py + h, px, py + h, r);
  x.arcTo(px, py + h, px, py, r);
  x.arcTo(px, py, px + w, py, r);
  x.closePath();
}
function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, k = 5): void {
  x.beginPath();
  for (let i = 0; i < k * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / k;
    const q = i % 2 ? r * 0.45 : r;
    if (i) x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
    else x.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q);
  }
  x.closePath();
}
function heart(x: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  x.beginPath();
  x.moveTo(cx, cy + r * 0.85);
  x.bezierCurveTo(cx - r * 1.3, cy, cx - r * 0.55, cy - r, cx, cy - r * 0.4);
  x.bezierCurveTo(cx + r * 0.55, cy - r, cx + r * 1.3, cy, cx, cy + r * 0.85);
}
/** símbolo do motivo (estrela/coração/círculo/losango) */
function motif(x: CanvasRenderingContext2D, m: number, cx: number, cy: number, r: number): void {
  if (m === 0) star(x, cx, cy, r);
  else if (m === 1) heart(x, cx, cy, r);
  else if (m === 2) {
    x.beginPath();
    x.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  } else {
    x.beginPath();
    x.moveTo(cx, cy - r);
    x.lineTo(cx + r * 0.75, cy);
    x.lineTo(cx, cy + r);
    x.lineTo(cx - r * 0.75, cy);
    x.closePath();
  }
}

/** Preenchimento conforme o acabamento (glitter/degradê/estampa/brilho/animado). */
function finishFill(x: CanvasRenderingContext2D, it: HomePassItem, px: number, py: number, w: number, h: number, t: number): void {
  const [, a, b] = it.draw.palette;
  const f = it.draw.finish;
  if (f === 'gradient' || f === 'animated') {
    const sh = f === 'animated' ? Math.sin(t * 2) * w * 0.5 : 0;
    const g = x.createLinearGradient(px + sh, py, px + w + sh, py + h);
    g.addColorStop(0, a);
    g.addColorStop(0.5, b);
    g.addColorStop(1, a);
    x.fillStyle = g;
  } else x.fillStyle = f === 'gloss' ? a : mixHex(a, b, 0.25);
  x.fill();
  x.save();
  x.clip();
  if (f === 'pattern') {
    x.fillStyle = b;
    const s = Math.max(6, w / 5);
    for (let yy = py; yy < py + h + s; yy += s) for (let xx = px + ((yy / s) % 2) * s * 0.5; xx < px + w + s; xx += s) {
      motif(x, it.draw.motif, xx, yy, s * 0.22);
      x.fill();
    }
  } else if (f === 'glitter' || f === 'animated') {
    const r = rng(it.draw.seed);
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 14; i++) {
      const k = 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + i));
      x.globalAlpha = f === 'animated' ? k : 0.85;
      star(x, px + r() * w, py + r() * h, Math.max(1.2, w * 0.035) * (0.6 + r()), 4);
      x.fill();
    }
    x.globalAlpha = 1;
  } else if (f === 'gloss') {
    x.fillStyle = 'rgba(255,255,255,.35)';
    x.fillRect(px, py, w, h * 0.3);
  }
  x.restore();
}

function outline(x: CanvasRenderingContext2D, lw: number): void {
  x.strokeStyle = INK;
  x.lineWidth = lw;
  x.lineJoin = 'round';
  x.stroke();
}

/** Desenha o item centrado num quadrado S×S (origem 0,0). */
export function drawHomeItem(x: CanvasRenderingContext2D, it: HomePassItem, S: number, t = 0): void {
  const [bg, a, b] = it.draw.palette;
  const lw = Math.max(1.5, S * 0.035);
  const c = S / 2;
  const kind = it.furn?.kind;
  switch (it.cat) {
    case 'furniture':
    case 'lamp':
    case 'wallart':
    case 'rug': {
      if (kind === 'rug') {
        x.beginPath();
        x.ellipse(c, c + S * 0.1, S * 0.44, S * 0.2, 0, 0, Math.PI * 2);
        finishFill(x, it, S * 0.06, c - S * 0.1, S * 0.88, S * 0.4, t);
        outline(x, lw);
        x.fillStyle = b;
        motif(x, it.draw.motif, c, c + S * 0.1, S * 0.09);
        x.fill();
      } else if (kind === 'floorlamp' || kind === 'tablelamp') {
        const tall = kind === 'floorlamp';
        x.fillStyle = mixHex(a, INK, 0.4);
        x.fillRect(c - S * 0.03, tall ? S * 0.35 : S * 0.55, S * 0.06, tall ? S * 0.5 : S * 0.25);
        rr(x, c - S * 0.16, S * 0.84, S * 0.32, S * 0.06, S * 0.03);
        x.fill();
        const glow = x.createRadialGradient(c, S * 0.3, 1, c, S * 0.3, S * 0.45);
        glow.addColorStop(0, b + 'aa');
        glow.addColorStop(1, b + '00');
        x.fillStyle = glow;
        x.fillRect(0, 0, S, S);
        x.beginPath();
        x.moveTo(c - S * 0.12, S * 0.15);
        x.lineTo(c + S * 0.12, S * 0.15);
        x.lineTo(c + S * 0.24, tall ? S * 0.4 : S * 0.58);
        x.lineTo(c - S * 0.24, tall ? S * 0.4 : S * 0.58);
        x.closePath();
        finishFill(x, it, c - S * 0.24, S * 0.15, S * 0.48, S * 0.43, t);
        outline(x, lw);
      } else if (kind === 'painting' || kind === 'poster' || kind === 'mirror' || kind === 'clock') {
        if (kind === 'clock') {
          x.beginPath();
          x.arc(c, c, S * 0.36, 0, Math.PI * 2);
        } else rr(x, S * 0.14, S * 0.14, S * 0.72, S * 0.72, kind === 'mirror' ? S * 0.3 : S * 0.05);
        finishFill(x, it, S * 0.14, S * 0.14, S * 0.72, S * 0.72, t);
        outline(x, lw * 1.4);
        x.fillStyle = kind === 'mirror' ? 'rgba(220,240,255,.85)' : bg;
        if (kind === 'clock') {
          x.beginPath();
          x.arc(c, c, S * 0.27, 0, Math.PI * 2);
          x.fill();
          x.strokeStyle = INK;
          x.lineWidth = lw;
          x.beginPath();
          x.moveTo(c, c);
          x.lineTo(c + Math.cos(t) * S * 0.18, c + Math.sin(t) * S * 0.18);
          x.moveTo(c, c);
          x.lineTo(c, c - S * 0.13);
          x.stroke();
        } else {
          rr(x, S * 0.24, S * 0.24, S * 0.52, S * 0.52, kind === 'mirror' ? S * 0.22 : S * 0.03);
          x.fill();
          x.fillStyle = b;
          motif(x, it.draw.motif, c, c, S * 0.15);
          x.fill();
        }
      } else {
        // móvel genérico: corpo + almofada/topo + pés, silhueta por tipo
        const tallK = kind === 'bookcase' || kind === 'wardrobe' || kind === 'arcade';
        const w = tallK ? S * 0.52 : S * 0.78;
        const h = tallK ? S * 0.74 : kind === 'chair' || kind === 'plant' ? S * 0.6 : S * 0.44;
        const px = c - w / 2;
        const py = S * 0.86 - h;
        x.fillStyle = INK;
        x.fillRect(px + w * 0.1, S * 0.84, w * 0.08, S * 0.06);
        x.fillRect(px + w * 0.82, S * 0.84, w * 0.08, S * 0.06);
        if (kind === 'plant') {
          rr(x, c - S * 0.16, S * 0.58, S * 0.32, S * 0.28, S * 0.05);
          finishFill(x, it, c - S * 0.16, S * 0.58, S * 0.32, S * 0.28, t);
          outline(x, lw);
          x.fillStyle = mixHex('#3ee07a', b, 0.3);
          for (let i = 0; i < 5; i++) {
            x.beginPath();
            x.ellipse(c + (i - 2) * S * 0.07, S * 0.42 - Math.abs(i - 2) * -S * 0.03, S * 0.07, S * 0.17, (i - 2) * 0.35, 0, Math.PI * 2);
            x.fill();
            outline(x, lw * 0.6);
          }
          break;
        }
        rr(x, px, py, w, h, S * 0.08);
        finishFill(x, it, px, py, w, h, t);
        outline(x, lw);
        if (kind === 'sofa' || kind === 'armchair' || kind === 'bed' || kind === 'beanbag') {
          rr(x, px + w * 0.08, py + h * 0.45, w * 0.84, h * 0.42, S * 0.05);
          x.fillStyle = mixHex(b, '#ffffff', 0.25);
          x.fill();
          outline(x, lw * 0.7);
        } else if (tallK) {
          x.strokeStyle = INK;
          x.lineWidth = lw * 0.7;
          for (let i = 1; i < 4; i++) {
            x.beginPath();
            x.moveTo(px + w * 0.1, py + (h * i) / 4);
            x.lineTo(px + w * 0.9, py + (h * i) / 4);
            x.stroke();
          }
        } else {
          rr(x, px - w * 0.04, py - S * 0.04, w * 1.08, S * 0.08, S * 0.03);
          x.fillStyle = b;
          x.fill();
          outline(x, lw * 0.7);
        }
        x.fillStyle = '#ffffff';
        motif(x, it.draw.motif, c, py + h * 0.28, S * 0.07);
        x.fill();
      }
      break;
    }
    case 'paint': {
      // lata de tinta com respingo do acabamento
      rr(x, S * 0.22, S * 0.36, S * 0.56, S * 0.5, S * 0.06);
      x.fillStyle = '#e6e2f5';
      x.fill();
      outline(x, lw);
      rr(x, S * 0.22, S * 0.5, S * 0.56, S * 0.24, 2);
      finishFill(x, it, S * 0.22, S * 0.5, S * 0.56, S * 0.24, t);
      x.beginPath();
      x.ellipse(c, S * 0.36, S * 0.28, S * 0.08, 0, 0, Math.PI * 2);
      finishFill(x, it, S * 0.22, S * 0.28, S * 0.56, S * 0.16, t);
      outline(x, lw);
      x.beginPath();
      x.moveTo(S * 0.62, S * 0.33);
      x.quadraticCurveTo(S * 0.78, S * 0.42, S * 0.72, S * 0.62);
      x.quadraticCurveTo(S * 0.7, S * 0.7, S * 0.66, S * 0.6);
      x.closePath();
      finishFill(x, it, S * 0.6, S * 0.3, S * 0.2, S * 0.4, t);
      break;
    }
    case 'wallpaper':
    case 'floor': {
      const fl = it.cat === 'floor';
      x.save();
      if (fl) {
        x.translate(c, c);
        x.scale(1, 0.6);
        x.rotate(Math.PI / 4);
        x.translate(-c, -c);
      }
      rr(x, S * 0.16, S * 0.16, S * 0.68, S * 0.68, S * 0.05);
      finishFill(x, it, S * 0.16, S * 0.16, S * 0.68, S * 0.68, t);
      outline(x, lw);
      x.strokeStyle = 'rgba(0,0,0,.18)';
      x.lineWidth = lw * 0.6;
      for (let i = 1; i < 3; i++) {
        x.beginPath();
        x.moveTo(S * (0.16 + 0.68 * (i / 3)), S * 0.16);
        x.lineTo(S * (0.16 + 0.68 * (i / 3)), S * 0.84);
        if (fl) {
          x.moveTo(S * 0.16, S * (0.16 + 0.68 * (i / 3)));
          x.lineTo(S * 0.84, S * (0.16 + 0.68 * (i / 3)));
        }
        x.stroke();
      }
      x.restore();
      break;
    }
    case 'planet':
    case 'garden':
    case 'showpiece': {
      // mini planeta com o enfeite em cima
      const pr = S * 0.3;
      const g = x.createRadialGradient(c - pr * 0.3, S * 0.82 - pr * 0.4, 2, c, S * 0.82, pr * 1.2);
      g.addColorStop(0, mixHex(a, '#ffffff', 0.4));
      g.addColorStop(1, mixHex(a, bg, 0.5));
      x.fillStyle = g;
      x.beginPath();
      x.arc(c, S * 0.95, pr * 1.2, Math.PI, 0);
      x.fill();
      outline(x, lw);
      const bob = it.draw.anim ? Math.sin(t * 2) * S * 0.02 : 0;
      if (it.cat === 'garden') {
        for (let i = 0; i < 5; i++) {
          x.fillStyle = i % 2 ? a : b;
          motif(x, it.draw.motif, S * (0.22 + i * 0.14), S * 0.62 - (i % 2) * S * 0.06, S * 0.07);
          x.fill();
          outline(x, lw * 0.6);
        }
        x.fillStyle = '#3ee07a';
        rr(x, S * 0.15, S * 0.68, S * 0.7, S * 0.08, S * 0.04);
        x.fill();
        outline(x, lw * 0.6);
      } else if (it.show === 'aquarium') {
        rr(x, S * 0.14, S * 0.22, S * 0.72, S * 0.52, S * 0.06);
        x.fillStyle = 'rgba(80,200,255,.75)';
        x.fill();
        outline(x, lw * 1.2);
        for (let i = 0; i < 3; i++) {
          const fx = S * (0.3 + ((t * 0.15 + i * 0.3) % 0.5));
          x.fillStyle = i % 2 ? a : b;
          x.beginPath();
          x.ellipse(fx, S * (0.38 + i * 0.1), S * 0.06, S * 0.035, 0, 0, Math.PI * 2);
          x.fill();
        }
      } else if (it.show === 'tree' || (it.cat === 'planet' && it.draw.motif === 2)) {
        x.fillStyle = '#8a5a3c';
        x.fillRect(c - S * 0.04, S * 0.45, S * 0.08, S * 0.25);
        x.beginPath();
        x.arc(c, S * 0.36 + bob, S * 0.22, 0, Math.PI * 2);
        finishFill(x, it, c - S * 0.22, S * 0.14, S * 0.44, S * 0.44, t);
        outline(x, lw);
        x.fillStyle = '#fff';
        motif(x, it.draw.motif, c, S * 0.34 + bob, S * 0.07);
        x.fill();
      } else if (it.show === 'carousel' || it.show === 'roomset') {
        x.beginPath();
        x.moveTo(c - S * 0.32, S * 0.36);
        x.lineTo(c, S * 0.12);
        x.lineTo(c + S * 0.32, S * 0.36);
        x.closePath();
        finishFill(x, it, c - S * 0.32, S * 0.12, S * 0.64, S * 0.24, t);
        outline(x, lw);
        rr(x, c - S * 0.28, S * 0.36, S * 0.56, S * 0.34, S * 0.03);
        x.fillStyle = mixHex(b, '#ffffff', 0.4);
        x.fill();
        outline(x, lw);
        for (let i = 0; i < 3; i++) {
          x.fillStyle = i % 2 ? a : b;
          x.beginPath();
          x.arc(c + (i - 1) * S * 0.16, S * 0.56 + Math.sin(t * 3 + i) * S * 0.03, S * 0.05, 0, Math.PI * 2);
          x.fill();
          outline(x, lw * 0.5);
        }
      } else {
        // estátua / fonte / monumento (peça-mestra ganha halo dourado girando)
        if (it.cat === 'showpiece') {
          const hg = x.createRadialGradient(c, S * 0.36, 2, c, S * 0.36, S * 0.42);
          hg.addColorStop(0, '#fff3a0cc');
          hg.addColorStop(1, '#ffd84a00');
          x.fillStyle = hg;
          x.fillRect(0, 0, S, S);
          x.fillStyle = '#ffd84a';
          for (let i = 0; i < 6; i++) {
            const ang = t * 0.8 + (i * Math.PI) / 3;
            star(x, c + Math.cos(ang) * S * 0.34, S * 0.36 + Math.sin(ang) * S * 0.12, S * 0.035, 4);
            x.fill();
          }
        }
        rr(x, c - S * 0.16, S * 0.56, S * 0.32, S * 0.14, S * 0.03);
        x.fillStyle = mixHex(bg, '#ffffff', 0.5);
        x.fill();
        outline(x, lw);
        x.save();
        x.translate(c, S * 0.36 + bob);
        x.rotate(it.draw.anim ? Math.sin(t) * 0.15 : 0);
        motif(x, it.draw.motif, 0, 0, S * 0.2);
        finishFill(x, it, -S * 0.2, -S * 0.2, S * 0.4, S * 0.4, t);
        outline(x, lw);
        x.restore();
        if (it.show === 'fountain') {
          x.strokeStyle = 'rgba(120,220,255,.9)';
          x.lineWidth = lw;
          for (const sd of [-1, 1]) {
            x.beginPath();
            x.moveTo(c, S * 0.5);
            x.quadraticCurveTo(c + sd * S * 0.3, S * 0.2 + Math.sin(t * 4) * 3, c + sd * S * 0.36, S * 0.66);
            x.stroke();
          }
        }
      }
      break;
    }
    case 'door':
    case 'window':
    case 'roof':
    case 'fence': {
      if (it.cat === 'roof') {
        x.beginPath();
        x.moveTo(S * 0.08, S * 0.62);
        x.lineTo(c, S * 0.18);
        x.lineTo(S * 0.92, S * 0.62);
        x.closePath();
        finishFill(x, it, S * 0.08, S * 0.18, S * 0.84, S * 0.44, t);
        outline(x, lw);
        x.fillStyle = mixHex(bg, '#ffffff', 0.7);
        x.fillRect(S * 0.2, S * 0.62, S * 0.6, S * 0.22);
        x.strokeStyle = INK;
        x.strokeRect(S * 0.2, S * 0.62, S * 0.6, S * 0.22);
      } else if (it.cat === 'fence') {
        for (let i = 0; i < 4; i++) {
          const fx = S * (0.12 + i * 0.21);
          x.beginPath();
          x.moveTo(fx, S * 0.82);
          x.lineTo(fx, S * 0.34);
          x.lineTo(fx + S * 0.07, S * 0.24);
          x.lineTo(fx + S * 0.14, S * 0.34);
          x.lineTo(fx + S * 0.14, S * 0.82);
          x.closePath();
          finishFill(x, it, fx, S * 0.24, S * 0.14, S * 0.58, t);
          outline(x, lw * 0.8);
        }
        x.fillStyle = b;
        x.fillRect(S * 0.08, S * 0.48, S * 0.84, S * 0.07);
      } else {
        const door = it.cat === 'door';
        const w = door ? S * 0.46 : S * 0.6;
        const h = door ? S * 0.72 : S * 0.6;
        x.beginPath();
        x.moveTo(c - w / 2, S * 0.88);
        x.lineTo(c - w / 2, S * 0.88 - h + w / 2);
        x.arc(c, S * 0.88 - h + w / 2, w / 2, Math.PI, 0);
        x.lineTo(c + w / 2, S * 0.88);
        x.closePath();
        finishFill(x, it, c - w / 2, S * 0.88 - h, w, h, t);
        outline(x, lw * 1.2);
        if (door) {
          x.fillStyle = '#ffd84a';
          x.beginPath();
          x.arc(c + w * 0.28, S * 0.6, S * 0.035, 0, Math.PI * 2);
          x.fill();
          x.fillStyle = '#fff';
          motif(x, it.draw.motif, c, S * 0.42, S * 0.08);
          x.fill();
        } else {
          x.fillStyle = 'rgba(200,240,255,.85)';
          x.beginPath();
          x.arc(c, S * 0.88 - h + w / 2, w * 0.36, 0, Math.PI * 2);
          x.fill();
          x.strokeStyle = INK;
          x.lineWidth = lw * 0.7;
          x.beginPath();
          x.moveTo(c - w * 0.36, S * 0.88 - h + w / 2);
          x.lineTo(c + w * 0.36, S * 0.88 - h + w / 2);
          x.moveTo(c, S * 0.88 - h + w * 0.14);
          x.lineTo(c, S * 0.88 - h + w * 0.86);
          x.stroke();
        }
      }
      break;
    }
    case 'roomkit': {
      // caixinha de cômodo (chão + duas paredes) com móveis
      x.beginPath();
      x.moveTo(c, S * 0.12);
      x.lineTo(S * 0.9, S * 0.3);
      x.lineTo(S * 0.9, S * 0.66);
      x.lineTo(c, S * 0.88);
      x.lineTo(S * 0.1, S * 0.66);
      x.lineTo(S * 0.1, S * 0.3);
      x.closePath();
      x.fillStyle = mixHex(bg, '#ffffff', 0.25);
      x.fill();
      outline(x, lw);
      x.beginPath();
      x.moveTo(S * 0.1, S * 0.66);
      x.lineTo(c, S * 0.5);
      x.lineTo(S * 0.9, S * 0.66);
      x.lineTo(c, S * 0.88);
      x.closePath();
      finishFill(x, it, S * 0.1, S * 0.5, S * 0.8, S * 0.38, t);
      outline(x, lw);
      rr(x, S * 0.28, S * 0.5, S * 0.22, S * 0.16, S * 0.03);
      x.fillStyle = b;
      x.fill();
      outline(x, lw * 0.7);
      rr(x, S * 0.56, S * 0.36, S * 0.14, S * 0.3, S * 0.03);
      x.fillStyle = a;
      x.fill();
      outline(x, lw * 0.7);
      x.fillStyle = '#fff';
      motif(x, it.draw.motif, c, S * 0.28, S * 0.06);
      x.fill();
      break;
    }
    case 'party': {
      if (it.party!.food === 'cake') {
        for (let i = 0; i < 2; i++) {
          const w = S * (0.6 - i * 0.18);
          const yy = S * (0.62 - i * 0.2);
          rr(x, c - w / 2, yy, w, S * 0.2, S * 0.04);
          finishFill(x, it, c - w / 2, yy, w, S * 0.2, t);
          outline(x, lw);
          x.fillStyle = '#ffffff';
          x.beginPath();
          for (let k = 0; k <= 6; k++) x.arc(c - w / 2 + (k * w) / 6, yy + 2, w / 14, 0, Math.PI);
          x.fill();
        }
        x.fillStyle = '#ffd84a';
        x.fillRect(c - S * 0.015, S * 0.16, S * 0.03, S * 0.1);
        x.beginPath();
        x.ellipse(c, S * 0.14, S * 0.025, S * 0.04 + Math.sin(t * 8) * 1, 0, 0, Math.PI * 2);
        x.fillStyle = '#ff8c1a';
        x.fill();
      } else {
        x.fillStyle = it.party!.splat;
        x.beginPath();
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2;
          const q = S * (i % 2 ? 0.2 : 0.3);
          x.lineTo(c + Math.cos(ang) * q, S * 0.62 + Math.sin(ang) * q * 0.5);
        }
        x.closePath();
        x.globalAlpha = 0.6;
        x.fill();
        x.globalAlpha = 1;
        x.beginPath();
        x.ellipse(c, S * 0.46, S * 0.26, S * 0.12, 0, 0, Math.PI * 2);
        finishFill(x, it, c - S * 0.26, S * 0.34, S * 0.52, S * 0.24, t);
        outline(x, lw);
      }
      x.fillStyle = it.party!.splat;
      for (let i = 0; i < 3; i++) {
        x.beginPath();
        x.arc(S * (0.18 + i * 0.32), S * (0.86 - (i % 2) * 0.05), S * 0.035, 0, Math.PI * 2);
        x.fill();
      }
      break;
    }
    case 'cleaning': {
      x.save();
      x.translate(c, c);
      x.rotate(-0.5);
      x.fillStyle = mixHex(a, INK, 0.3);
      rr(x, -S * 0.03, -S * 0.42, S * 0.06, S * 0.56, S * 0.03);
      x.fill();
      outline(x, lw * 0.7);
      const tool = it.tool;
      if (tool === 'sponge') rr(x, -S * 0.2, S * 0.06, S * 0.4, S * 0.24, S * 0.06);
      else if (tool === 'vacuum') rr(x, -S * 0.22, S * 0.1, S * 0.44, S * 0.18, S * 0.09);
      else {
        x.beginPath();
        x.moveTo(-S * 0.1, S * 0.12);
        x.lineTo(S * 0.1, S * 0.12);
        x.lineTo(S * 0.2, S * 0.36);
        x.lineTo(-S * 0.2, S * 0.36);
        x.closePath();
      }
      finishFill(x, it, -S * 0.22, S * 0.06, S * 0.44, S * 0.3, t);
      outline(x, lw);
      x.restore();
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 3; i++) {
        x.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i);
        star(x, S * (0.7 + i * 0.07), S * (0.25 + i * 0.12), S * 0.04, 4);
        x.fill();
      }
      x.globalAlpha = 1;
      break;
    }
  }
}

/** Arte da temporada do Passe da Casa: casinha temática sobre um planetinha. */
export function drawHomeSeasonArt(x: CanvasRenderingContext2D, w: number, h: number, s: SeasonInfo, t = 0): void {
  const [bg, a, b] = s.palette;
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, mixHex(bg, b, 0.15));
  g.addColorStop(1, mixHex(bg, a, 0.35));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const r = rng(0x4a11 + s.index * 37);
  x.fillStyle = '#ffffff';
  for (let i = 0; i < 40; i++) {
    x.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(t + i));
    x.fillRect(r() * w, r() * h * 0.7, 1.5, 1.5);
  }
  x.globalAlpha = 1;
  // planetinha
  const cx = w * 0.72;
  const R = h * 0.9;
  const pg = x.createRadialGradient(cx - R * 0.2, h + R * 0.4, R * 0.2, cx, h + R * 0.7, R * 1.2);
  pg.addColorStop(0, mixHex(a, '#ffffff', 0.25));
  pg.addColorStop(1, mixHex(a, bg, 0.6));
  x.fillStyle = pg;
  x.beginPath();
  x.arc(cx, h + R * 0.62, R, 0, Math.PI * 2);
  x.fill();
  // casinha
  const hw = h * 0.42;
  const hx = w * 0.47 - hw / 2;
  const hy = h * 0.58;
  x.fillStyle = mixHex(b, '#ffffff', 0.55);
  rr(x, hx, hy, hw, h * 0.28, 4);
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = 2.5;
  x.stroke();
  x.beginPath();
  x.moveTo(hx - hw * 0.12, hy + 2);
  x.lineTo(hx + hw / 2, hy - h * 0.26);
  x.lineTo(hx + hw * 1.12, hy + 2);
  x.closePath();
  x.fillStyle = a;
  x.fill();
  x.stroke();
  x.fillStyle = mixHex(a, INK, 0.35);
  rr(x, hx + hw * 0.4, hy + h * 0.13, hw * 0.2, h * 0.19, 3);
  x.fill();
  x.fillStyle = '#fff6b0';
  for (const k of [0.12, 0.7]) {
    rr(x, hx + hw * k, hy + h * 0.07, hw * 0.18, h * 0.1, 2);
    x.fill();
  }
  // fumaça de coração da chaminé
  x.fillStyle = b;
  for (let i = 0; i < 3; i++) {
    const u = (t * 0.3 + i / 3) % 1;
    x.globalAlpha = 1 - u;
    heart(x, hx + hw * 0.85 + Math.sin(u * 6) * 4, hy - h * 0.2 - u * h * 0.3, 4 + u * 5);
    x.fill();
  }
  x.globalAlpha = 1;
  // enfeites flutuando
  for (let i = 0; i < 6; i++) {
    x.fillStyle = i % 2 ? a : b;
    x.globalAlpha = 0.8;
    motif(x, i % 4, r() * w * 0.55, h * (0.15 + r() * 0.5) + Math.sin(t + i) * 3, 5 + r() * 6);
    x.fill();
  }
  x.globalAlpha = 1;
}
