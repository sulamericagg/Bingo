/* ============================================================
 *  PEÇAS EXCLUSIVAS DO PASSE para o "Crie seu Bloop"
 *  (olhos, bocas e auras de cada temporada — 10 por temporada).
 *
 *  PONTO DE EXTENSÃO (game/avatar.ts, edição mínima):
 *    ALL_PARTS inclui PASS_PARTS e installPassParts(EYES, MOUTHS, AURAS)
 *    registra os desenhos. As peças usam price { event: 'pass' } → nunca à venda;
 *    o criador só lista as que o jogador já ganhou (ver partsOf em avatar.ts).
 *  Desenho procedural por modelo + paleta da temporada (sem alocação por quadro
 *  além do que as peças nativas já fazem).
 * ============================================================ */
import { SEASONS } from '../creatures/seasons';
import { A, al, circ, ell, glowAt, heart, mix, PI, rad, star4, star5 } from '../game/avatar-gfx';
import type { DC } from '../game/avatar-mat';
import type { Part } from '../game/avatar';
import type { Rarity } from '../game/skins';
import { passSeason, type PassRarity } from './catalog';

type Fn = (d: DC) => void;
type LFn = (d: DC, layer: 0 | 1) => void;

const toRarity = (r: PassRarity): Rarity => (r === 'medio' ? 'rare' : r);

function eachEye(d: DC, fn: (sd: number) => void): void {
  for (const sd of [-1, 1]) {
    d.x.save();
    d.x.translate(sd * d.ex, d.ey);
    fn(sd);
    d.x.restore();
  }
}

/* ---------------- olhos ---------------- */
function eyeFn(style: number, a: string, b: string): Fn {
  return (d) => {
    const { x, R, p, t } = d;
    const open = Math.max(0.12, 1 - p.blink);
    const lx = p.lookX * R * 0.05;
    const ly = p.lookY * R * 0.05;
    eachEye(d, (sd) => {
      x.save();
      x.scale(1, open);
      switch (style) {
        case 0: {
          // gema lapidada
          const r = R * 0.22;
          x.fillStyle = rad(x, -r * 0.3, -r * 0.4, r * 1.3, '#ffffff', a, mix(a, '#000000', 0.45));
          x.beginPath();
          x.moveTo(lx, ly - r);
          x.lineTo(lx + r * 0.85, ly - r * 0.2);
          x.lineTo(lx, ly + r);
          x.lineTo(lx - r * 0.85, ly - r * 0.2);
          x.closePath();
          x.fill();
          x.strokeStyle = mix(a, '#000000', 0.55);
          x.lineWidth = R * 0.03;
          x.stroke();
          x.fillStyle = 'rgba(255,255,255,.75)';
          star4(x, lx - r * 0.25, ly - r * 0.35, r * 0.35 * (0.8 + 0.2 * Math.sin(t * 4 + sd)));
          x.fill();
          break;
        }
        case 1: {
          // olhão com íris em anel
          ell(x, 0, 0, R * 0.21, R * 0.25);
          x.fillStyle = '#ffffff';
          x.fill();
          x.strokeStyle = d.c.ink;
          x.lineWidth = R * 0.025;
          x.stroke();
          x.fillStyle = rad(x, lx, ly, R * 0.16, b, a, mix(a, '#000000', 0.4));
          circ(x, lx, ly + R * 0.02, R * 0.155);
          x.fill();
          x.fillStyle = '#16112a';
          circ(x, lx, ly + R * 0.02, R * 0.07);
          x.fill();
          x.fillStyle = '#ffffff';
          circ(x, lx - R * 0.06, ly - R * 0.05, R * 0.05);
          x.fill();
          circ(x, lx + R * 0.05, ly + R * 0.07, R * 0.022);
          x.fill();
          break;
        }
        case 2: {
          // pupila de estrela
          ell(x, 0, 0, R * 0.2, R * 0.24);
          x.fillStyle = '#ffffff';
          x.fill();
          x.strokeStyle = d.c.ink;
          x.lineWidth = R * 0.025;
          x.stroke();
          x.fillStyle = a;
          star5(x, lx, ly + R * 0.02, R * 0.14 * (1 + Math.sin(t * 5 + sd) * 0.08), Math.sin(t) * 0.2, 0.5);
          x.fill();
          x.fillStyle = b;
          circ(x, lx, ly + R * 0.02, R * 0.04);
          x.fill();
          break;
        }
        case 3: {
          // arquinhos felizes com brilho
          glowAt(x, a, 0, 0, R * 0.35, 0.35);
          x.strokeStyle = mix(a, '#000000', 0.35);
          x.lineWidth = R * 0.075;
          x.lineCap = 'round';
          x.beginPath();
          x.arc(0, R * 0.06, R * 0.14, PI * 1.15, PI * 1.85);
          x.stroke();
          x.fillStyle = b;
          A(x, 0.5 + 0.5 * Math.sin(t * 3 + sd * 2));
          star4(x, sd * R * 0.16, -R * 0.14, R * 0.07);
          x.fill();
          A(x, 1);
          break;
        }
        case 4: {
          // corações
          const k = 1 + Math.max(0, Math.sin(t * 6 + sd * 0.5)) * 0.12;
          x.scale(k, k);
          x.fillStyle = rad(x, -R * 0.05, -R * 0.07, R * 0.28, '#ffffff', a, mix(a, '#000000', 0.35));
          heart(x, lx, ly, R * 0.19);
          x.fill();
          x.strokeStyle = mix(a, '#000000', 0.5);
          x.lineWidth = R * 0.025;
          x.stroke();
          x.fillStyle = b;
          circ(x, lx - R * 0.07, ly - R * 0.05, R * 0.04);
          x.fill();
          break;
        }
        default: {
          // espiral de órbitas
          x.fillStyle = mix(a, '#000000', 0.55);
          circ(x, 0, 0, R * 0.2);
          x.fill();
          x.lineWidth = R * 0.03;
          for (let i = 0; i < 3; i++) {
            x.strokeStyle = i % 2 ? b : a;
            x.beginPath();
            x.arc(lx, ly, R * (0.06 + i * 0.045), t * (2 + i) * sd, t * (2 + i) * sd + PI * 1.3);
            x.stroke();
          }
          x.fillStyle = '#ffffff';
          circ(x, lx - R * 0.07, ly - R * 0.08, R * 0.035);
          x.fill();
        }
      }
      x.restore();
    });
  };
}

/* ---------------- bocas ---------------- */
function mouthFn(style: number, a: string, b: string): Fn {
  return (d) => {
    const { x, R, t, my, c } = d;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    switch (style) {
      case 0: {
        // sorriso aberto com língua colorida
        x.fillStyle = '#3a1020';
        x.beginPath();
        x.moveTo(-R * 0.17, my - R * 0.03);
        x.quadraticCurveTo(0, my + R * 0.26, R * 0.17, my - R * 0.03);
        x.closePath();
        x.fill();
        x.save();
        x.clip();
        x.fillStyle = a;
        ell(x, 0, my + R * 0.13, R * 0.1, R * 0.07);
        x.fill();
        x.restore();
        x.strokeStyle = c.ink;
        x.lineWidth = R * 0.035;
        x.stroke();
        break;
      }
      case 1: {
        // "ó" de surpresa brilhante
        const k = 1 + Math.sin(t * 3) * 0.08;
        x.fillStyle = rad(x, 0, my, R * 0.1 * k, b, a, mix(a, '#000000', 0.5));
        ell(x, 0, my + R * 0.03, R * 0.075 * k, R * 0.09 * k);
        x.fill();
        x.strokeStyle = c.ink;
        x.lineWidth = R * 0.03;
        x.stroke();
        break;
      }
      case 2: {
        // "w" de gatinho com bochechas
        x.strokeStyle = c.ink;
        x.lineWidth = R * 0.05;
        x.beginPath();
        x.arc(-R * 0.075, my - R * 0.02, R * 0.075, 0.2, PI - 0.2);
        x.moveTo(R * 0.15, my - R * 0.02);
        x.arc(R * 0.075, my - R * 0.02, R * 0.075, 0.2, PI - 0.2);
        x.stroke();
        x.fillStyle = al(a, 0.55);
        ell(x, -R * 0.3, my - R * 0.06, R * 0.08, R * 0.05);
        x.fill();
        ell(x, R * 0.3, my - R * 0.06, R * 0.08, R * 0.05);
        x.fill();
        break;
      }
      default: {
        // sorriso com dentinho brilhante
        x.strokeStyle = c.ink;
        x.lineWidth = R * 0.055;
        x.beginPath();
        x.arc(0, my - R * 0.08, R * 0.16, PI * 0.2, PI * 0.8);
        x.stroke();
        x.fillStyle = '#ffffff';
        x.fillRect(-R * 0.03, my + R * 0.06, R * 0.07, R * 0.06);
        x.fillStyle = b;
        A(x, 0.5 + 0.5 * Math.sin(t * 4));
        star4(x, R * 0.07, my + R * 0.05, R * 0.06);
        x.fill();
        A(x, 1);
      }
    }
  };
}

/* ---------------- auras ---------------- */
function auraFn(style: number, a: string, b: string): LFn {
  return (d, layer) => {
    const { x, R, t } = d;
    switch (style) {
      case 0: {
        // bolinhas orbitando
        for (let i = 0; i < 6; i++) {
          const ang = t * 1.4 + (i * PI * 2) / 6;
          const depth = Math.sin(ang);
          if ((depth > 0 ? 1 : 0) !== layer) continue;
          const px = Math.cos(ang) * R * 1.45;
          const py = depth * R * 0.42 - R * 0.1;
          x.fillStyle = i % 2 ? a : b;
          A(x, 0.65 + depth * 0.35);
          circ(x, px, py, R * (0.08 + depth * 0.025 + 0.03));
          x.fill();
        }
        A(x, 1);
        break;
      }
      case 1: {
        // faíscas subindo
        if (layer === 0) glowAt(x, a, 0, 0, R * 1.6, 0.22);
        for (let i = 0; i < 6; i++) {
          if (i % 2 !== layer) continue;
          const u = (t * 0.5 + i / 6) % 1;
          const px = Math.sin(i * 2.3 + u * 3) * R * 1.2;
          const py = R * (0.8 - u * 2.1);
          x.fillStyle = i % 3 ? a : b;
          A(x, Math.sin(u * PI));
          star4(x, px, py, R * (0.1 + (i % 3) * 0.03));
          x.fill();
        }
        A(x, 1);
        break;
      }
      case 2: {
        // anel inclinado girando
        x.save();
        x.lineWidth = R * 0.07;
        const s0 = layer ? 0 : PI;
        x.strokeStyle = a;
        A(x, 0.85);
        x.beginPath();
        x.ellipse(0, -R * 0.05, R * 1.5, R * 0.42, -0.2, s0, s0 + PI);
        x.stroke();
        const ang = t * 2;
        const depth = Math.sin(ang);
        if ((depth > 0 ? 1 : 0) === layer) {
          const px = Math.cos(ang) * R * 1.5;
          const py = depth * R * 0.42 - R * 0.05 - Math.cos(ang) * R * 0.3;
          glowAt(x, b, px, py, R * 0.4, 0.6);
          x.fillStyle = b;
          star5(x, px, py, R * 0.14, ang, 0.5);
          x.fill();
        }
        A(x, 1);
        x.restore();
        break;
      }
      default: {
        // coraçõezinhos e estrelas flutuando
        for (let i = 0; i < 5; i++) {
          if (i % 2 !== layer) continue;
          const u = (t * 0.35 + i / 5) % 1;
          const px = Math.sin(i * 3.1 + u * 4) * R * 1.35;
          const py = R * (0.6 - u * 2);
          x.fillStyle = i % 2 ? a : b;
          A(x, Math.sin(u * PI));
          if (i % 2) heart(x, px, py, R * 0.11);
          else star5(x, px, py, R * 0.12, u * 3, 0.5);
          x.fill();
        }
        A(x, 1);
      }
    }
  };
}

/* ---------------- catálogo ---------------- */

export const PASS_PARTS: Part[] = [];
const eyeDraw: Record<string, Fn> = {};
const mouthDraw: Record<string, Fn> = {};
const auraDraw: Record<string, LFn> = {};

for (const s of SEASONS) {
  const [, a, b] = s.palette;
  for (const L of passSeason(s.index).levels) {
    for (const r of [L.free, L.prem]) {
      if (!r || (r.kind !== 'eyes' && r.kind !== 'mouth' && r.kind !== 'aura')) continue;
      const n = r.id.endsWith('_f') ? 0 : Number(r.id.slice(-1));
      const style = s.index * 3 + n;
      // alterna a ordem das cores para variar dentro da temporada
      const c1 = n % 2 ? b : a;
      const c2 = n % 2 ? a : b;
      if (r.kind === 'eyes') eyeDraw[r.id] = eyeFn(style % 6, c1, c2);
      else if (r.kind === 'mouth') mouthDraw[r.id] = mouthFn(style % 4, c1, c2);
      else auraDraw[r.id] = auraFn(style % 4, c1, c2);
      PASS_PARTS.push({ id: r.id, slot: r.kind, name: r.name, rarity: toRarity(r.rarity), price: { event: 'pass' }, desc: `Passe Estelar · ${s.theme}` });
    }
  }
}

export const isPassPart = (p: Part): boolean => p.price.event === 'pass';

/** Registra os desenhos nas tabelas do criador (chamado por game/avatar.ts). */
export function installPassParts(eyes: Record<string, Fn>, mouths: Record<string, Fn>, auras: Record<string, LFn>): void {
  Object.assign(eyes, eyeDraw);
  Object.assign(mouths, mouthDraw);
  Object.assign(auras, auraDraw);
}
