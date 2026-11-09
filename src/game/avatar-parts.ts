/* ============================================================
 *  CRIE SEU BLOOP — olhos, bocas, rosto, cabeça, costas e aura.
 *  Convenções: coords locais do corpo (centro 0,0; cima = −y), raio R.
 *  Peças iniciais são de propósito toscas; as caras são caprichadas.
 * ============================================================ */
import { TAU } from './math';
import { A, al, circ, ell, glowAt, heart, hsl, lin, mix, PI, rad, rrect, star4, star5 } from './avatar-gfx';
import type { DC } from './avatar-mat';

type Fn = (d: DC) => void;
/** layer: 0 = atrás do corpo, 1 = na frente */
type LFn = (d: DC, layer: 0 | 1) => void;

const INK = '#231d1a';

/* ============================================================
 *  OLHOS
 * ============================================================ */

function eachEye(d: DC, fn: (sd: number) => void): void {
  for (const sd of [-1, 1]) {
    d.x.save();
    d.x.translate(sd * d.ex, d.ey);
    fn(sd);
    d.x.restore();
  }
}

/** expressões que valem para todos os olhos (morto / feliz). true = já desenhou */
function moodEyes(d: DC, col: string, w = 0.095): boolean {
  const { x, R, p } = d;
  if (p.mood !== 'dead' && p.mood !== 'happy') return false;
  x.strokeStyle = col;
  x.lineCap = 'round';
  eachEye(d, () => {
    if (p.mood === 'dead') {
      const k = R * 0.13;
      x.lineWidth = R * 0.09;
      x.beginPath();
      x.moveTo(-k, -k);
      x.lineTo(k, k);
      x.moveTo(k, -k);
      x.lineTo(-k, k);
      x.stroke();
    } else {
      x.lineWidth = R * w;
      x.beginPath();
      x.arc(0, R * 0.06, R * 0.15, PI * 1.15, PI * 1.85);
      x.stroke();
    }
  });
  return true;
}

/** olho "fofo" genérico com íris em gradiente */
function eyeBall(d: DC, sc: number, ih: string, im: string, ie: string, lidTop = 0, opt: { lashes?: boolean; big?: boolean; slant?: number } = {}): void {
  const { x, R, p, c } = d;
  const open = 1 - p.blink;
  const ew = R * 0.205 * sc;
  const eh = R * 0.25 * sc;
  if (open < 0.22) {
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.07;
    x.beginPath();
    x.moveTo(-ew, 0);
    x.quadraticCurveTo(0, eh * 0.5, ew, 0);
    x.stroke();
    return;
  }
  const h = eh * (0.25 + 0.75 * open) * (p.mood === 'fly' ? 1.08 : 1);
  x.save();
  ell(x, 0, 0, ew, h);
  x.fillStyle = '#ffffff';
  x.fill();
  x.clip();
  const ix = p.lookX * R * 0.07 * sc;
  const iy = p.lookY * R * 0.075 * sc + R * 0.02 * sc;
  const ir = R * (opt.big ? 0.17 : 0.148) * sc;
  const ig = x.createRadialGradient(ix, iy + ir * 0.35, ir * 0.1, ix, iy, ir);
  ig.addColorStop(0, ih);
  ig.addColorStop(0.55, im);
  ig.addColorStop(1, ie);
  x.fillStyle = ig;
  circ(x, ix, iy, ir);
  x.fill();
  x.fillStyle = '#16112a';
  circ(x, ix, iy, ir * 0.5);
  x.fill();
  // sombra da pálpebra
  x.fillStyle = lin(x, 0, -h, 0, -h * 0.15, al(c.Pdd, 0.3), al(c.Pdd, 0));
  x.fillRect(-ew, -h, ew * 2, h);
  if (lidTop > 0) {
    const ly = -h + h * 2 * lidTop;
    x.fillStyle = mix(c.P, c.Pd, 0.35);
    x.beginPath();
    x.moveTo(-ew, -h);
    x.lineTo(ew, -h);
    x.lineTo(ew, ly + (opt.slant ?? 0) * R);
    x.lineTo(-ew, ly - (opt.slant ?? 0) * R);
    x.closePath();
    x.fill();
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.05;
    x.beginPath();
    x.moveTo(-ew, ly - (opt.slant ?? 0) * R);
    x.lineTo(ew, ly + (opt.slant ?? 0) * R);
    x.stroke();
  }
  x.restore();
  if (lidTop < 0.45) {
    x.fillStyle = '#ffffff';
    circ(x, ix - ir * 0.38, iy - ir * 0.42 + lidTop * ir, ir * 0.36);
    x.fill();
    A(x, 0.85);
    circ(x, ix + ir * 0.42, iy + ir * 0.38, ir * 0.17);
    x.fill();
    if (opt.big) {
      circ(x, ix + ir * 0.15, iy - ir * 0.62, ir * 0.12);
      x.fill();
    }
    A(x, 1);
  }
  x.strokeStyle = al(c.Pdd, 0.4);
  x.lineWidth = R * 0.035;
  ell(x, 0, 0, ew, h);
  x.stroke();
  if (opt.lashes) {
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.04;
    x.lineCap = 'round';
    x.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = -PI / 2 - 0.9 + i * 0.32;
      x.moveTo(Math.cos(a) * ew * 0.95, Math.sin(a) * h * 0.95);
      x.lineTo(Math.cos(a) * ew * 1.35, Math.sin(a) * h * 1.3);
    }
    x.stroke();
  }
}

/** íris padrão derivada da cor secundária */
function irisOf(d: DC): [string, string, string] {
  const s = d.c.S;
  return [mix(s, '#ffffff', 0.5), s, mix(s, '#16112a', 0.6)];
}

export const EYES: Record<string, Fn> = {
  /* tosco: dois pontinhos desalinhados */
  e_dots(d) {
    const { x, R, p } = d;
    if (moodEyes(d, d.c.ink, 0.06)) return;
    x.fillStyle = d.c.ink;
    x.strokeStyle = d.c.ink;
    x.lineCap = 'round';
    const lx = p.lookX * R * 0.03;
    const ly = p.lookY * R * 0.03;
    const sizes = [0.075, 0.052];
    const offs = [-0.035, 0.045];
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      const px = sd * d.ex * (i ? 1.12 : 0.92) + lx;
      const py = d.ey + offs[i] * R + ly;
      if (p.blink > 0.6) {
        x.lineWidth = R * 0.04;
        x.beginPath();
        x.moveTo(px - sizes[i] * R, py);
        x.lineTo(px + sizes[i] * R, py + R * 0.01);
        x.stroke();
      } else {
        ell(x, px, py, sizes[i] * R, sizes[i] * R * (p.mood === 'fly' ? 1.3 : 1.1), 0.3);
        x.fill();
      }
    }
  },
  /* tosco: olhos de plástico vesgos */
  e_derp(d) {
    const { x, R, p, t } = d;
    if (moodEyes(d, d.c.ink, 0.07)) return;
    const sz = [0.2, 0.13];
    for (let i = 0; i < 2; i++) {
      const sd = i ? 1 : -1;
      const px = sd * d.ex * (i ? 1.05 : 0.95);
      const py = d.ey + (i ? R * 0.04 : -R * 0.02);
      const r = sz[i] * R;
      x.fillStyle = '#ffffff';
      circ(x, px, py, r);
      x.fill();
      x.strokeStyle = d.c.ink;
      x.lineWidth = R * 0.035;
      x.stroke();
      if (p.blink > 0.6) {
        x.fillStyle = mix(d.c.P, d.c.Pd, 0.3);
        circ(x, px, py, r * 0.95);
        x.fill();
        continue;
      }
      // pupilas sacudindo e olhando pra lados opostos
      const j = Math.sin(t * 9 + i * 2) * 0.12;
      const a = (i ? PI * 0.85 : 0.2) + j + p.lookX * 0.3;
      x.fillStyle = d.c.ink;
      circ(x, px + Math.cos(a) * r * 0.45, py + Math.sin(a) * r * 0.45 + r * 0.1, r * 0.48);
      x.fill();
    }
  },
  e_cute(d) {
    if (moodEyes(d, d.c.ink)) return;
    const [a, b, c] = irisOf(d);
    eachEye(d, () => eyeBall(d, 1, a, b, c));
  },
  e_big(d) {
    if (moodEyes(d, d.c.ink)) return;
    const [a, b, c] = irisOf(d);
    eachEye(d, () => eyeBall(d, 1.22, a, b, c, 0, { lashes: true, big: true }));
    // brilho extra
    const { x, R, t } = d;
    const k = Math.max(0, Math.sin(t * 2.2));
    if (k > 0.1) {
      x.fillStyle = '#ffffff';
      A(x, k);
      star4(x, -d.ex - R * 0.1, d.ey - R * 0.12, R * 0.07 * k);
      A(x, 1);
    }
  },
  e_sleepy(d) {
    if (moodEyes(d, d.c.ink)) return;
    const [a, b, c] = irisOf(d);
    eachEye(d, () => eyeBall(d, 0.95, a, b, c, d.p.mood === 'fly' ? 0.3 : 0.55));
    const { x, R, t, p } = d;
    if (p.mood === 'idle') {
      // Zzz
      const u = (t * 0.4) % 1;
      x.fillStyle = d.c.ink;
      A(x, Math.sin(u * PI));
      x.font = `700 ${Math.round(R * (0.22 + u * 0.15))}px Fredoka, sans-serif`;
      x.fillText('z', R * (0.7 + u * 0.3), -R * (0.6 + u * 0.5));
      A(x, 1);
    }
  },
  e_angry(d) {
    if (moodEyes(d, d.c.ink)) return;
    const [a, b, c] = irisOf(d);
    const { x, R } = d;
    eachEye(d, (sd) => {
      eyeBall(d, 0.95, a, b, c, 0.28, { slant: sd * 0.07 });
      // sobrancelha
      x.strokeStyle = d.c.ink;
      x.lineWidth = R * 0.08;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(-sd * R * 0.2, -R * 0.33);
      x.lineTo(sd * R * 0.18, -R * 0.2);
      x.stroke();
    });
  },
  e_star(d) {
    if (moodEyes(d, d.c.ink)) return;
    const { x, R, p, t } = d;
    eachEye(d, (sd) => {
      const open = 1 - p.blink;
      x.save();
      x.scale(1, Math.max(0.12, open));
      const pulse = 1 + Math.sin(t * 5 + sd) * 0.07;
      const r = R * 0.24 * pulse;
      x.fillStyle = rad(x, -R * 0.05, -R * 0.06, r, '#fffbe0', '#ffd84a', '#ff9a00');
      star5(x, p.lookX * R * 0.04, p.lookY * R * 0.04, r, Math.sin(t * 1.5) * 0.15, 0.5);
      x.fill();
      x.strokeStyle = '#b35a00';
      x.lineWidth = R * 0.03;
      x.lineJoin = 'round';
      x.stroke();
      x.fillStyle = '#ffffff';
      circ(x, -R * 0.06, -R * 0.07, R * 0.05);
      x.fill();
      x.restore();
      glowAt(x, '#ffd84a', 0, 0, R * 0.45, 0.35);
    });
  },
  e_heart(d) {
    if (moodEyes(d, d.c.ink)) return;
    const { x, R, p, t } = d;
    eachEye(d, (sd) => {
      const k = 1 + Math.max(0, Math.sin(t * 7 + sd * 0.4)) * 0.16;
      x.save();
      x.scale(k, k * Math.max(0.12, 1 - p.blink));
      x.fillStyle = rad(x, -R * 0.06, -R * 0.08, R * 0.3, '#ffb3cf', '#ff3d7f', '#c4124f');
      heart(x, 0, 0, R * 0.2);
      x.fill();
      x.strokeStyle = '#8a0b36';
      x.lineWidth = R * 0.028;
      x.stroke();
      x.fillStyle = '#ffffff';
      ell(x, -R * 0.08, -R * 0.06, R * 0.05, R * 0.035, -0.6);
      x.fill();
      x.restore();
    });
  },
  e_cyclops(d) {
    const { x, R, p, c } = d;
    x.save();
    x.translate(0, d.ey - R * 0.02);
    if (p.mood === 'dead' || p.mood === 'happy') {
      x.strokeStyle = c.ink;
      x.lineWidth = R * 0.1;
      x.lineCap = 'round';
      x.beginPath();
      if (p.mood === 'dead') {
        const k = R * 0.18;
        x.moveTo(-k, -k);
        x.lineTo(k, k);
        x.moveTo(k, -k);
        x.lineTo(-k, k);
      } else x.arc(0, R * 0.1, R * 0.22, PI * 1.15, PI * 1.85);
      x.stroke();
    } else {
      const [a, b, cc] = irisOf(d);
      eyeBall(d, 1.6, a, b, cc, 0, { lashes: true, big: true });
    }
    x.restore();
  },
  e_robot(d) {
    const { x, R, p, t } = d;
    const col = d.c.lumS > 0.35 ? d.c.S : '#3dfcff';
    eachEye(d, () => {
      x.fillStyle = '#121626';
      rrect(x, -R * 0.2, -R * 0.17, R * 0.4, R * 0.34, R * 0.08);
      x.fill();
      x.strokeStyle = '#8a95b0';
      x.lineWidth = R * 0.035;
      x.stroke();
      glowAt(x, col, 0, 0, R * 0.42, 0.5);
      x.fillStyle = col;
      if (p.mood === 'dead') {
        x.font = `700 ${Math.round(R * 0.3)}px Fredoka, sans-serif`;
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('x', 0, 0);
        return;
      }
      const h = p.mood === 'happy' ? 0.05 : Math.max(0.03, (1 - p.blink) * 0.2);
      rrect(x, -R * 0.13 + p.lookX * R * 0.03, -h * R * 0.6, R * 0.26, h * R * 1.2, R * 0.03);
      x.fill();
      // scanline
      x.fillStyle = '#ffffff';
      A(x, 0.35);
      x.fillRect(-R * 0.14, (-0.12 + ((t * 0.6) % 0.24)) * R, R * 0.28, R * 0.02);
      A(x, 1);
    });
  },
  e_visor(d) {
    const { x, R, p, t, c } = d;
    const col = c.lumS > 0.35 ? c.S : '#ff3dd2';
    const w = d.ex * 2 + R * 0.5;
    x.save();
    x.translate(0, d.ey);
    x.fillStyle = lin(x, 0, -R * 0.2, 0, R * 0.2, '#2a2f4a', '#07080f');
    rrect(x, -w / 2, -R * 0.19, w, R * 0.38, R * 0.19);
    x.fill();
    x.strokeStyle = '#9aa5c8';
    x.lineWidth = R * 0.04;
    x.stroke();
    x.save();
    rrect(x, -w / 2, -R * 0.19, w, R * 0.38, R * 0.19);
    x.clip();
    if (p.mood === 'dead') {
      x.strokeStyle = '#ff3b5c';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(-w / 2, 0);
      for (let i = 0; i <= 8; i++) x.lineTo(-w / 2 + (w * i) / 8, (i % 2 ? -1 : 1) * R * 0.08);
      x.stroke();
    } else {
      const sx = Math.sin(t * 2.2) * (w / 2 - R * 0.15) + p.lookX * R * 0.05;
      glowAt(x, col, sx, 0, R * 0.5, 0.9);
      x.fillStyle = mix(col, '#ffffff', 0.5);
      const hh = p.mood === 'happy' ? 0.04 : Math.max(0.02, (1 - p.blink) * 0.07);
      rrect(x, sx - R * 0.16, -R * hh, R * 0.32, R * hh * 2, R * 0.03);
      x.fill();
    }
    x.fillStyle = '#ffffff';
    A(x, 0.25);
    x.beginPath();
    x.moveTo(-w / 2 + R * 0.15, -R * 0.19);
    x.lineTo(-w / 2 + R * 0.35, -R * 0.19);
    x.lineTo(-w / 2 + R * 0.1, R * 0.19);
    x.lineTo(-w / 2 - R * 0.1, R * 0.19);
    x.closePath();
    x.fill();
    A(x, 1);
    x.restore();
    x.restore();
  },
  e_fire(d) {
    const { x, R, p, t } = d;
    if (p.mood === 'dead') {
      moodEyes(d, '#ff6a00');
      return;
    }
    eachEye(d, (sd) => {
      glowAt(x, '#ff6a00', 0, -R * 0.05, R * 0.55, 0.7);
      const open = Math.max(0.15, 1 - p.blink) * (p.mood === 'happy' ? 0.45 : 1);
      x.save();
      x.scale(1, open);
      for (let k = 0; k < 3; k++) {
        const s = 1 - k * 0.3;
        const fl = Math.sin(t * 14 + k + sd) * 0.04;
        x.fillStyle = ['#ff3d00', '#ff9a00', '#fff3a0'][k];
        x.beginPath();
        x.moveTo(-R * 0.15 * s, R * 0.08);
        x.quadraticCurveTo(-R * 0.17 * s, -R * 0.12 * s, (fl + 0.02 * sd) * R, -R * (0.3 + fl) * s);
        x.quadraticCurveTo(R * 0.17 * s, -R * 0.1 * s, R * 0.15 * s, R * 0.08);
        x.quadraticCurveTo(0, R * 0.17 * s, -R * 0.15 * s, R * 0.08);
        x.fill();
      }
      x.fillStyle = '#2a0800';
      circ(x, p.lookX * R * 0.04, R * 0.02 + p.lookY * R * 0.03, R * 0.045);
      x.fill();
      x.restore();
    });
  },
  e_galaxy(d) {
    const { x, R, p, t } = d;
    if (moodEyes(d, d.c.ink)) return;
    eachEye(d, (sd) => {
      const open = 1 - p.blink;
      if (open < 0.22) {
        x.strokeStyle = d.c.ink;
        x.lineWidth = R * 0.07;
        x.beginPath();
        x.moveTo(-R * 0.22, 0);
        x.quadraticCurveTo(0, R * 0.12, R * 0.22, 0);
        x.stroke();
        return;
      }
      const ew = R * 0.24;
      const eh = R * 0.29 * (0.25 + 0.75 * open);
      glowAt(x, '#b44dff', 0, 0, R * 0.5, 0.45);
      x.save();
      ell(x, 0, 0, ew, eh);
      x.fillStyle = rad(x, p.lookX * R * 0.05, p.lookY * R * 0.05, R * 0.3, '#ff9bf0', '#7a3dff', '#1a0650', '#05010f');
      x.fill();
      x.clip();
      // espiral
      x.save();
      x.translate(p.lookX * R * 0.05, p.lookY * R * 0.05);
      x.rotate(t * 0.8 * sd);
      x.fillStyle = '#ffffff';
      for (let i = 0; i < 14; i++) {
        const a = i * 0.9;
        const r = R * (0.03 + i * 0.013);
        A(x, 0.4 + (i % 3) * 0.2);
        circ(x, Math.cos(a) * r, Math.sin(a) * r, R * 0.014);
        x.fill();
      }
      x.restore();
      A(x, 1);
      x.restore();
      x.fillStyle = '#ffffff';
      circ(x, -ew * 0.35, -eh * 0.4, R * 0.06);
      x.fill();
      const k = Math.max(0, Math.sin(t * 3 + sd));
      A(x, k);
      star4(x, ew * 0.4, eh * 0.35, R * 0.07);
      A(x, 1);
      x.strokeStyle = 'rgba(255,200,255,0.6)';
      x.lineWidth = R * 0.03;
      ell(x, 0, 0, ew, eh);
      x.stroke();
    });
  },
};

/* ============================================================
 *  BOCAS
 * ============================================================ */

function flyO(d: DC, sc = 1): void {
  const { x, R, t, c } = d;
  const k = 1 + Math.sin(t * 9) * 0.08;
  x.fillStyle = c.Pdd;
  ell(x, 0, d.my, R * 0.1 * sc, R * 0.13 * sc * k);
  x.fill();
  x.fillStyle = '#ff7a9a';
  ell(x, 0, d.my + R * 0.06 * sc, R * 0.06 * sc, R * 0.045 * sc);
  x.fill();
}
function happyD(d: DC, w = 0.21): void {
  const { x, R, c } = d;
  const my = d.my;
  const W = R * w;
  x.fillStyle = c.Pdd;
  x.beginPath();
  x.moveTo(-W, my - R * 0.08);
  x.quadraticCurveTo(0, my - R * 0.03, W, my - R * 0.08);
  x.quadraticCurveTo(W * 0.9, my + R * 0.22, 0, my + R * 0.22);
  x.quadraticCurveTo(-W * 0.9, my + R * 0.22, -W, my - R * 0.08);
  x.closePath();
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = '#ff6f92';
  ell(x, 0, my + R * 0.2, W * 0.7, R * 0.12);
  x.fill();
  x.fillStyle = '#ffffff';
  x.fillRect(-W * 0.6, my - R * 0.1, W * 1.2, R * 0.06);
  x.restore();
}
function deadW(d: DC): void {
  const { x, R, c } = d;
  const my = d.my;
  x.strokeStyle = c.ink;
  x.lineWidth = R * 0.06;
  x.beginPath();
  x.moveTo(-R * 0.16, my + R * 0.06);
  x.quadraticCurveTo(-R * 0.08, my - R * 0.02, 0, my + R * 0.04);
  x.quadraticCurveTo(R * 0.08, my + R * 0.1, R * 0.16, my + R * 0.02);
  x.stroke();
}
/** trata voar/feliz/morto; true se já desenhou */
function moodMouth(d: DC): boolean {
  const m = d.p.mood;
  if (m === 'fly') flyO(d);
  else if (m === 'happy') happyD(d);
  else if (m === 'dead') deadW(d);
  else return false;
  return true;
}
function smileArc(d: DC, w = 0.14, lw = 0.07): void {
  const { x, R, c } = d;
  x.strokeStyle = c.ink;
  x.lineWidth = R * lw;
  x.lineCap = 'round';
  x.beginPath();
  x.arc(0, d.my - R * w * 0.7, R * w, 0.35, PI - 0.35);
  x.stroke();
}

export const MOUTHS: Record<string, Fn> = {
  /* tosco: risco torto */
  mo_line(d) {
    const { x, R, p } = d;
    const my = d.my;
    x.strokeStyle = d.c.ink;
    x.lineWidth = R * 0.05;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.beginPath();
    if (p.mood === 'fly') {
      ell(x, R * 0.03, my, R * 0.07, R * 0.09, 0.4);
    } else if (p.mood === 'happy') {
      x.moveTo(-R * 0.17, my - R * 0.04);
      x.lineTo(-R * 0.02, my + R * 0.08);
      x.lineTo(R * 0.16, my - R * 0.06);
    } else {
      x.moveTo(-R * 0.17, my + R * 0.03);
      x.lineTo(R * 0.02, my - R * 0.01);
      x.lineTo(R * 0.15, my + R * 0.06);
    }
    x.stroke();
  },
  /* tosco: dentuço */
  mo_tooth(d) {
    const { x, R, p } = d;
    const my = d.my;
    x.strokeStyle = d.c.ink;
    x.lineWidth = R * 0.05;
    x.lineCap = 'round';
    x.beginPath();
    if (p.mood === 'fly') ell(x, 0, my, R * 0.09, R * 0.1);
    else {
      x.moveTo(-R * 0.18, my - R * 0.02);
      x.quadraticCurveTo(0, my + R * 0.06, R * 0.17, my - R * 0.04);
    }
    x.stroke();
    x.fillStyle = '#fffbe8';
    x.beginPath();
    x.rect(R * 0.0, my + R * 0.01, R * 0.11, R * 0.13);
    x.fill();
    x.lineWidth = R * 0.03;
    x.stroke();
  },
  mo_smile(d) {
    if (moodMouth(d)) return;
    smileArc(d);
  },
  mo_grin(d) {
    if (d.p.mood === 'dead') return deadW(d);
    happyD(d, d.p.mood === 'fly' ? 0.2 : 0.25);
  },
  mo_kiss(d) {
    const { x, R, t, p } = d;
    if (p.mood === 'dead') return deadW(d);
    const my = d.my;
    x.fillStyle = '#ff3d7f';
    for (const sd of [-1, 1]) {
      ell(x, 0, my + sd * R * 0.055, R * 0.12, R * 0.07);
      x.fill();
    }
    x.strokeStyle = '#a8104a';
    x.lineWidth = R * 0.025;
    x.beginPath();
    x.moveTo(-R * 0.1, my);
    x.lineTo(R * 0.1, my);
    x.stroke();
    x.fillStyle = '#ffb3cf';
    ell(x, -R * 0.04, my - R * 0.075, R * 0.04, R * 0.02);
    x.fill();
    // coraçãozinho subindo
    const u = (t * 0.5) % 1;
    if (p.mood === 'idle' && u < 0.8) {
      x.fillStyle = '#ff4f8b';
      A(x, Math.sin((u / 0.8) * PI));
      heart(x, R * (0.25 + u * 0.4), my - R * u * 0.9, R * (0.06 + u * 0.05));
      x.fill();
      A(x, 1);
    }
  },
  mo_cat(d) {
    if (d.p.mood !== 'idle') {
      moodMouth(d);
      return;
    }
    const { x, R, c } = d;
    x.strokeStyle = c.ink;
    x.lineWidth = R * 0.06;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(-R * 0.08, d.my - R * 0.03, R * 0.08, 0.2, PI - 0.2);
    x.moveTo(R * 0.16, d.my - R * 0.03);
    x.arc(R * 0.08, d.my - R * 0.03, R * 0.08, 0.2, PI - 0.2);
    x.stroke();
    x.fillStyle = '#ff8fb5';
    ell(x, 0, d.my - R * 0.08, R * 0.05, R * 0.035);
    x.fill();
  },
  mo_tongue(d) {
    const { x, R, t, p } = d;
    if (p.mood === 'dead' || p.mood === 'fly') {
      moodMouth(d);
      return;
    }
    smileArc(d, 0.16);
    const w = Math.sin(t * 5) * 0.12;
    x.save();
    x.translate(R * 0.06, d.my + R * 0.02);
    x.rotate(w);
    x.fillStyle = '#ff5c8a';
    x.beginPath();
    x.moveTo(-R * 0.08, 0);
    x.lineTo(-R * 0.08, R * 0.12);
    x.arc(0, R * 0.12, R * 0.08, PI, 0, true);
    x.lineTo(R * 0.08, 0);
    x.closePath();
    x.fill();
    x.strokeStyle = '#c22a5a';
    x.lineWidth = R * 0.025;
    x.beginPath();
    x.moveTo(0, R * 0.03);
    x.lineTo(0, R * 0.14);
    x.stroke();
    x.restore();
  },
  mo_fangs(d) {
    if (!moodMouth(d)) smileArc(d, 0.15);
    if (d.p.mood === 'dead') return;
    const { x, R } = d;
    x.fillStyle = '#ffffff';
    x.strokeStyle = al(d.c.Pdd, 0.5);
    x.lineWidth = R * 0.015;
    for (const sd of [-1, 1]) {
      const tx = sd * R * 0.08;
      const ty = d.my + (d.p.mood === 'happy' ? -R * 0.06 : R * 0.01);
      x.beginPath();
      x.moveTo(tx - R * 0.04, ty);
      x.lineTo(tx + R * 0.04, ty);
      x.lineTo(tx, ty + R * 0.1);
      x.closePath();
      x.fill();
      x.stroke();
    }
  },
  mo_beak(d) {
    const { x, R, p } = d;
    const open = p.mood === 'fly' || p.mood === 'happy' ? 0.08 : 0;
    const my = d.my - R * 0.04;
    x.fillStyle = '#b84a00';
    x.beginPath();
    x.moveTo(-R * 0.16, my);
    x.quadraticCurveTo(0, my + R * (0.22 + open), R * 0.16, my);
    x.closePath();
    x.fill();
    x.fillStyle = lin(x, 0, my - R * 0.12, 0, my + R * 0.08, '#ffe066', '#ff9a1f');
    x.beginPath();
    x.moveTo(-R * 0.18, my - open * R * 0.4);
    x.quadraticCurveTo(-R * 0.06, my - R * 0.16, 0, my - R * 0.15);
    x.quadraticCurveTo(R * 0.06, my - R * 0.16, R * 0.18, my - open * R * 0.4);
    x.quadraticCurveTo(0, my + R * 0.18 - open * R, -R * 0.18, my - open * R * 0.4);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.6)';
    ell(x, -R * 0.06, my - R * 0.08, R * 0.05, R * 0.02, -0.2);
    x.fill();
    x.fillStyle = '#7a3000';
    circ(x, -R * 0.05, my - R * 0.1, R * 0.012);
    circ(x, R * 0.05, my - R * 0.1, R * 0.012);
    x.fill();
  },
  mo_mustache(d) {
    const { x, R, p, t } = d;
    if (p.mood === 'fly' || p.mood === 'happy') flyO(d, 0.8);
    else if (p.mood === 'dead') deadW(d);
    const my = d.my - R * 0.06;
    const w = p.mood === 'idle' ? Math.sin(t * 2) * 0.03 : 0;
    x.fillStyle = lin(x, 0, my - R * 0.1, 0, my + R * 0.1, '#7a4a26', '#3a1e0c');
    for (const sd of [-1, 1]) {
      x.beginPath();
      x.moveTo(0, my + R * 0.04);
      x.bezierCurveTo(sd * R * 0.12, my - R * 0.06, sd * R * 0.3, my + R * 0.02, sd * R * 0.36, my - R * (0.06 + w));
      x.bezierCurveTo(sd * R * 0.44, my - R * (0.12 + w), sd * R * 0.45, my + R * 0.02, sd * R * 0.38, my + R * 0.08);
      x.bezierCurveTo(sd * R * 0.28, my + R * 0.16, sd * R * 0.1, my + R * 0.12, 0, my + R * 0.08);
      x.closePath();
      x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,0.3)';
    ell(x, -R * 0.2, my + R * 0.01, R * 0.08, R * 0.02, -0.2);
    x.fill();
  },
  mo_shark(d) {
    const { x, R, p } = d;
    if (p.mood === 'dead') return deadW(d);
    const my = d.my;
    const h = p.mood === 'fly' || p.mood === 'happy' ? 0.17 : 0.11;
    const w = R * 0.28;
    x.fillStyle = '#3a0a1a';
    x.beginPath();
    x.moveTo(-w, my - R * 0.06);
    x.quadraticCurveTo(0, my, w, my - R * 0.06);
    x.quadraticCurveTo(0, my + R * h * 2, -w, my - R * 0.06);
    x.fill();
    x.save();
    x.clip();
    x.fillStyle = '#ffffff';
    x.beginPath();
    for (let i = 0; i < 6; i++) {
      const tx = -w + (i + 0.5) * ((w * 2) / 6);
      x.moveTo(tx - R * 0.045, my - R * 0.08);
      x.lineTo(tx + R * 0.045, my - R * 0.08);
      x.lineTo(tx, my + R * 0.04);
    }
    for (let i = 0; i < 5; i++) {
      const tx = -w * 0.8 + (i + 0.5) * ((w * 1.6) / 5);
      x.moveTo(tx - R * 0.04, my + R * h * 1.2);
      x.lineTo(tx + R * 0.04, my + R * h * 1.2);
      x.lineTo(tx, my + R * (h * 1.2 - 0.09));
    }
    x.fill();
    x.restore();
  },
  mo_robot(d) {
    const { x, R, p, t } = d;
    const my = d.my;
    const col = d.c.lumS > 0.35 ? d.c.S : '#3dfcff';
    x.fillStyle = '#121626';
    rrect(x, -R * 0.22, my - R * 0.07, R * 0.44, R * 0.15, R * 0.05);
    x.fill();
    x.strokeStyle = '#8a95b0';
    x.lineWidth = R * 0.03;
    x.stroke();
    const talk = p.mood === 'fly' || p.mood === 'happy';
    x.fillStyle = col;
    for (let i = 0; i < 6; i++) {
      const lv = talk ? 0.3 + Math.abs(Math.sin(t * 12 + i * 1.3)) * 0.7 : p.mood === 'dead' ? 0.1 : 0.35;
      const hh = R * 0.1 * lv;
      x.fillRect(-R * 0.18 + i * R * 0.065, my - hh / 2, R * 0.04, hh);
    }
    if (talk) glowAt(x, col, 0, my, R * 0.35, 0.5);
  },
  mo_gold(d) {
    const { x, R, t } = d;
    if (d.p.mood === 'dead') return deadW(d);
    happyD(d, 0.24);
    const my = d.my;
    x.fillStyle = lin(x, 0, my - R * 0.1, 0, my, '#fff3a0', '#ffb300');
    x.fillRect(R * 0.05, my - R * 0.1, R * 0.08, R * 0.07);
    const k = Math.max(0, Math.sin(t * 2.5));
    x.fillStyle = '#ffffff';
    A(x, k);
    star4(x, R * 0.12, my - R * 0.08, R * 0.1 * k);
    A(x, 1);
  },
};

/* ============================================================
 *  ROSTO EXTRA (layer 0 = sob os olhos, 1 = por cima)
 * ============================================================ */

export const FACES: Record<string, LFn> = {
  f_none() {},
  /* tosco: curativo torto */
  f_bandaid(d, layer) {
    if (!layer) return;
    const { x, R } = d;
    x.save();
    x.translate(d.ex + R * 0.22, d.ey + R * 0.3);
    x.rotate(-0.55);
    x.fillStyle = '#e8c49a';
    rrect(x, -R * 0.2, -R * 0.065, R * 0.4, R * 0.13, R * 0.05);
    x.fill();
    x.strokeStyle = INK;
    x.lineWidth = R * 0.025;
    x.stroke();
    x.fillStyle = '#f5dcc0';
    x.fillRect(-R * 0.06, -R * 0.05, R * 0.12, R * 0.1);
    x.fillStyle = '#b08a60';
    for (const [px, py] of [[-0.14, -0.02], [-0.11, 0.02], [0.12, -0.02], [0.15, 0.02]]) {
      circ(x, px * R, py * R, R * 0.01);
      x.fill();
    }
    x.restore();
  },
  f_blush(d, layer) {
    if (layer) return;
    const { x, R } = d;
    for (const sd of [-1, 1]) {
      glowAt(x, '#ff5a8c', sd * (d.ex + R * 0.24), d.ey + R * 0.26, R * 0.26, 0.7);
      x.strokeStyle = '#ff7aa5';
      x.lineWidth = R * 0.025;
      x.beginPath();
      for (let i = 0; i < 3; i++) {
        const bx = sd * (d.ex + R * 0.16) + i * R * 0.06;
        x.moveTo(bx, d.ey + R * 0.3);
        x.lineTo(bx + R * 0.04, d.ey + R * 0.22);
      }
      x.stroke();
    }
  },
  f_freckles(d, layer) {
    if (layer) return;
    const { x, R } = d;
    x.fillStyle = al('#8a4a26', 0.7);
    for (const sd of [-1, 1]) {
      for (const [fx, fy] of [[0.05, 0.22], [0.15, 0.26], [0.1, 0.32], [0.22, 0.2], [0.24, 0.3]]) {
        circ(x, sd * (d.ex + (fx - 0.1) * R), d.ey + fy * R, R * 0.022);
        x.fill();
      }
    }
  },
  f_star(d, layer) {
    if (layer) return;
    const { x, R, t } = d;
    x.fillStyle = d.c.S;
    star5(x, d.ex + R * 0.24, d.ey + R * 0.3, R * 0.09, Math.sin(t) * 0.2, 0.45);
    x.fill();
    x.fillStyle = '#ffffff';
    A(x, 0.6);
    circ(x, d.ex + R * 0.22, d.ey + R * 0.28, R * 0.02);
    x.fill();
    A(x, 1);
  },
  f_scar(d, layer) {
    if (!layer) return;
    const { x, R } = d;
    x.strokeStyle = al('#7a2030', 0.75);
    x.lineWidth = R * 0.04;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-d.ex - R * 0.12, d.ey - R * 0.32);
    x.lineTo(-d.ex + R * 0.1, d.ey + R * 0.3);
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.22;
      const px = -d.ex - R * 0.12 + u * R * 0.22;
      const py = d.ey - R * 0.32 + u * R * 0.62;
      x.moveTo(px - R * 0.06, py + R * 0.01);
      x.lineTo(px + R * 0.06, py - R * 0.02);
    }
    x.stroke();
  },
  f_paint(d, layer) {
    if (layer) return;
    const { x, R, c } = d;
    x.fillStyle = c.S;
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        const y0 = d.ey + R * (0.2 + i * 0.1);
        x.beginPath();
        x.moveTo(sd * (d.ex - R * 0.15), y0);
        x.lineTo(sd * (d.ex + R * 0.32), y0 - R * 0.04);
        x.lineTo(sd * (d.ex + R * 0.28), y0 + R * 0.03);
        x.lineTo(sd * (d.ex - R * 0.12), y0 + R * 0.05);
        x.closePath();
        x.fill();
      }
    }
  },
  f_mask(d, layer) {
    if (layer) return;
    const { x, R, c, t } = d;
    const w = d.ex + R * 0.38;
    x.fillStyle = lin(x, 0, d.ey - R * 0.25, 0, d.ey + R * 0.25, c.Sh, c.S, c.Sd);
    x.beginPath();
    x.moveTo(-w, d.ey - R * 0.12);
    x.quadraticCurveTo(0, d.ey - R * 0.34, w, d.ey - R * 0.12);
    x.quadraticCurveTo(w + R * 0.05, d.ey + R * 0.15, w * 0.7, d.ey + R * 0.2);
    x.quadraticCurveTo(0, d.ey + R * 0.1, -w * 0.7, d.ey + R * 0.2);
    x.quadraticCurveTo(-w - R * 0.05, d.ey + R * 0.15, -w, d.ey - R * 0.12);
    x.fill();
    // fitinhas
    const fl = Math.sin(t * 6) * R * 0.05;
    x.beginPath();
    x.moveTo(-w + R * 0.02, d.ey - R * 0.05);
    x.lineTo(-w - R * 0.3, d.ey + R * 0.05 + fl);
    x.lineTo(-w - R * 0.26, d.ey + R * 0.15 + fl);
    x.closePath();
    x.fill();
    x.strokeStyle = al(c.Sd, 0.8);
    x.lineWidth = R * 0.03;
    x.stroke();
  },
  f_glasses(d, layer) {
    if (!layer) return;
    const { x, R } = d;
    x.strokeStyle = '#2a1a10';
    x.lineWidth = R * 0.045;
    for (const sd of [-1, 1]) {
      x.fillStyle = 'rgba(200,240,255,0.18)';
      circ(x, sd * d.ex, d.ey, R * 0.26);
      x.fill();
      x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.55)';
      ell(x, sd * d.ex - R * 0.1, d.ey - R * 0.1, R * 0.06, R * 0.03, -0.7);
      x.fill();
    }
    x.beginPath();
    x.moveTo(-d.ex + R * 0.26, d.ey - R * 0.02);
    x.quadraticCurveTo(0, d.ey - R * 0.1, d.ex - R * 0.26, d.ey - R * 0.02);
    x.stroke();
  },
  f_shades(d, layer) {
    if (!layer) return;
    const { x, R, t } = d;
    const lens = (sd: number) => {
      x.beginPath();
      x.moveTo(sd * (d.ex - R * 0.27), d.ey - R * 0.15);
      x.lineTo(sd * (d.ex + R * 0.27), d.ey - R * 0.15);
      x.quadraticCurveTo(sd * (d.ex + R * 0.26), d.ey + R * 0.2, sd * d.ex, d.ey + R * 0.18);
      x.quadraticCurveTo(sd * (d.ex - R * 0.26), d.ey + R * 0.16, sd * (d.ex - R * 0.27), d.ey - R * 0.15);
      x.closePath();
    };
    for (const sd of [-1, 1]) {
      lens(sd);
      x.fillStyle = lin(x, 0, d.ey - R * 0.15, 0, d.ey + R * 0.2, '#3a3f5c', '#0a0b14');
      x.fill();
      x.save();
      x.clip();
      const u = ((t * 0.5) % 2) - 0.5;
      x.fillStyle = 'rgba(255,255,255,0.35)';
      x.beginPath();
      const bx = sd * d.ex + u * R * 0.8;
      x.moveTo(bx - R * 0.1, d.ey - R * 0.2);
      x.lineTo(bx + R * 0.02, d.ey - R * 0.2);
      x.lineTo(bx - R * 0.12, d.ey + R * 0.25);
      x.lineTo(bx - R * 0.24, d.ey + R * 0.25);
      x.fill();
      x.restore();
      x.strokeStyle = '#05060a';
      x.lineWidth = R * 0.035;
      x.stroke();
    }
    x.fillStyle = '#05060a';
    x.fillRect(-d.ex + R * 0.25, d.ey - R * 0.15, (d.ex - R * 0.25) * 2, R * 0.06);
  },
  f_monocle(d, layer) {
    if (!layer) return;
    const { x, R, t } = d;
    const cx = d.ex;
    x.strokeStyle = lin(x, cx - R * 0.3, d.ey - R * 0.3, cx + R * 0.3, d.ey + R * 0.3, '#fff3a0', '#c98a00', '#fff3a0');
    x.lineWidth = R * 0.055;
    x.fillStyle = 'rgba(220,245,255,0.2)';
    circ(x, cx, d.ey, R * 0.27);
    x.fill();
    x.stroke();
    x.strokeStyle = '#d9a300';
    x.lineWidth = R * 0.02;
    x.beginPath();
    x.moveTo(cx + R * 0.2, d.ey + R * 0.18);
    x.quadraticCurveTo(cx + R * 0.35, d.ey + R * (0.7 + Math.sin(t * 2) * 0.03), cx + R * 0.05, d.ey + R * 0.95);
    x.stroke();
    x.fillStyle = '#ffffff';
    ell(x, cx - R * 0.1, d.ey - R * 0.11, R * 0.07, R * 0.035, -0.7);
    x.fill();
  },
  f_cyber(d, layer) {
    if (layer) return;
    const { x, R, t } = d;
    const col = '#3dfcff';
    const k = 0.6 + Math.sin(t * 4) * 0.4;
    x.strokeStyle = col;
    x.lineWidth = R * 0.03;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const pts = [
      [d.ex + R * 0.2, d.ey - R * 0.05],
      [d.ex + R * 0.42, d.ey - R * 0.05],
      [d.ex + R * 0.55, d.ey + R * 0.08],
      [d.ex + R * 0.55, d.ey + R * 0.35],
    ];
    A(x, 0.9);
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) x.lineTo(pts[i][0], pts[i][1]);
    x.moveTo(d.ex + R * 0.42, d.ey - R * 0.05);
    x.lineTo(d.ex + R * 0.5, d.ey - R * 0.28);
    x.stroke();
    A(x, 1);
    for (const [px, py] of [pts[3], [d.ex + R * 0.5, d.ey - R * 0.28]]) {
      glowAt(x, col, px, py, R * 0.18, k);
      x.fillStyle = '#ffffff';
      circ(x, px, py, R * 0.03);
      x.fill();
    }
    x.strokeStyle = col;
    A(x, 0.8);
    x.lineWidth = R * 0.03;
    circ(x, d.ex, d.ey, R * 0.29);
    x.setLineDash([R * 0.08, R * 0.06]);
    x.lineDashOffset = -t * R * 0.3;
    x.stroke();
    x.setLineDash(NO_DASH);
    A(x, 1);
  },
};
const NO_DASH: number[] = [];

/* ============================================================
 *  CABEÇA — origem no topo da cabeça (0,0), cima = −y.
 *  `hy` = distância do topo até o centro do corpo (positivo).
 * ============================================================ */

function marker(x: CanvasRenderingContext2D, R: number): void {
  x.strokeStyle = INK;
  x.lineWidth = R * 0.06;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  x.stroke();
}

export const HEADS: Record<string, (d: DC, hy: number) => void> = {
  h_none() {},
  /* tosco: saco de papel amassado */
  h_bag(d) {
    const { x, R } = d;
    x.save();
    x.rotate(-0.14);
    x.translate(0, R * 0.12);
    x.fillStyle = '#c9a26b';
    x.beginPath();
    x.moveTo(-R * 0.6, R * 0.05);
    x.lineTo(-R * 0.48, -R * 0.62);
    x.lineTo(-R * 0.36, -R * 0.55);
    x.lineTo(-R * 0.22, -R * 0.7);
    x.lineTo(-R * 0.05, -R * 0.58);
    x.lineTo(R * 0.12, -R * 0.72);
    x.lineTo(R * 0.27, -R * 0.57);
    x.lineTo(R * 0.44, -R * 0.66);
    x.lineTo(R * 0.55, -R * 0.02);
    x.quadraticCurveTo(0, R * 0.12, -R * 0.6, R * 0.05);
    x.closePath();
    x.fill();
    marker(x, R);
    // dobras
    x.strokeStyle = '#8a6a3a';
    x.lineWidth = R * 0.03;
    x.beginPath();
    x.moveTo(-R * 0.3, -R * 0.45);
    x.lineTo(-R * 0.25, -R * 0.05);
    x.moveTo(R * 0.2, -R * 0.5);
    x.lineTo(R * 0.28, -R * 0.15);
    x.lineTo(R * 0.15, -R * 0.02);
    x.stroke();
    x.fillStyle = '#a8844f';
    x.beginPath();
    x.moveTo(-R * 0.6, R * 0.05);
    x.lineTo(-R * 0.55, -R * 0.12);
    x.quadraticCurveTo(0, -R * 0.02, R * 0.54, -R * 0.16);
    x.lineTo(R * 0.55, -R * 0.02);
    x.quadraticCurveTo(0, R * 0.12, -R * 0.6, R * 0.05);
    x.fill();
    marker(x, R);
    x.restore();
  },
  /* tosco: panela na cabeça */
  h_pot(d) {
    const { x, R } = d;
    x.save();
    x.rotate(0.12);
    x.translate(0, R * 0.12);
    x.fillStyle = '#9aa0a8';
    x.beginPath();
    x.moveTo(-R * 0.62, 0);
    x.lineTo(-R * 0.55, -R * 0.48);
    x.quadraticCurveTo(0, -R * 0.58, R * 0.55, -R * 0.48);
    x.lineTo(R * 0.62, 0);
    x.closePath();
    x.fill();
    marker(x, R);
    x.fillStyle = '#7d838c';
    x.fillRect(-R * 0.66, -R * 0.06, R * 1.32, R * 0.12);
    x.strokeRect(-R * 0.66, -R * 0.06, R * 1.32, R * 0.12);
    // cabo
    x.fillStyle = '#4a3a30';
    x.beginPath();
    x.rect(R * 0.62, -R * 0.42, R * 0.6, R * 0.12);
    x.fill();
    marker(x, R);
    x.fillStyle = '#ffffff';
    A(x, 0.5);
    x.fillRect(-R * 0.4, -R * 0.42, R * 0.08, R * 0.3);
    A(x, 1);
    x.restore();
  },
  h_cap(d) {
    const { x, R, c } = d;
    x.save();
    x.translate(0, R * 0.14);
    x.fillStyle = lin(x, 0, -R * 0.6, 0, 0, c.Sh, c.S, c.Sd);
    x.beginPath();
    x.moveTo(-R * 0.72, R * 0.04);
    x.bezierCurveTo(-R * 0.72, -R * 0.75, R * 0.72, -R * 0.75, R * 0.72, R * 0.04);
    x.quadraticCurveTo(0, -R * 0.08, -R * 0.72, R * 0.04);
    x.fill();
    x.strokeStyle = al(c.Sd, 0.8);
    x.lineWidth = R * 0.03;
    x.beginPath();
    x.moveTo(0, -R * 0.52);
    x.quadraticCurveTo(-R * 0.08, -R * 0.2, -R * 0.02, R * 0.0);
    x.moveTo(0, -R * 0.52);
    x.quadraticCurveTo(R * 0.4, -R * 0.35, R * 0.5, -R * 0.05);
    x.stroke();
    // aba
    x.fillStyle = lin(x, 0, -R * 0.05, 0, R * 0.15, c.S, c.Sd);
    x.beginPath();
    x.moveTo(-R * 0.15, R * 0.0);
    x.quadraticCurveTo(-R * 0.9, -R * 0.06, -R * 1.15, R * 0.12);
    x.quadraticCurveTo(-R * 0.6, R * 0.2, -R * 0.15, R * 0.08);
    x.closePath();
    x.fill();
    x.fillStyle = c.Sh;
    circ(x, 0, -R * 0.53, R * 0.06);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)';
    ell(x, -R * 0.3, -R * 0.38, R * 0.15, R * 0.07, -0.5);
    x.fill();
    x.restore();
  },
  h_beanie(d) {
    const { x, R, c, t, p } = d;
    x.save();
    x.translate(0, R * 0.2);
    x.fillStyle = lin(x, 0, -R * 0.7, 0, 0, c.Sh, c.S);
    x.beginPath();
    x.moveTo(-R * 0.74, 0);
    x.bezierCurveTo(-R * 0.74, -R * 0.85, R * 0.74, -R * 0.85, R * 0.74, 0);
    x.closePath();
    x.fill();
    x.strokeStyle = al(c.Sd, 0.5);
    x.lineWidth = R * 0.03;
    x.beginPath();
    for (let i = -3; i <= 3; i++) {
      x.moveTo(i * R * 0.18, -R * 0.05);
      x.quadraticCurveTo(i * R * 0.12, -R * 0.4, i * R * 0.05, -R * 0.6);
    }
    x.stroke();
    x.fillStyle = c.Sd;
    rrect(x, -R * 0.8, -R * 0.12, R * 1.6, R * 0.26, R * 0.12);
    x.fill();
    x.strokeStyle = al('#000000', 0.18);
    x.beginPath();
    for (let i = -7; i <= 7; i++) {
      x.moveTo(i * R * 0.1, -R * 0.1);
      x.lineTo(i * R * 0.1, R * 0.12);
    }
    x.stroke();
    // pompom
    const b = p.mood === 'fly' ? 0 : Math.abs(Math.sin(t * 3)) * R * 0.05;
    x.fillStyle = rad(x, -R * 0.05, -R * 0.8 - b, R * 0.22, '#ffffff', c.Sh, mix(c.Sh, c.S, 0.5));
    circ(x, 0, -R * 0.72 - b, R * 0.19);
    x.fill();
    x.restore();
  },
  h_antenna(d) {
    const { x, R, t, c, p } = d;
    const sw = Math.sin(t * (p.mood === 'fly' ? 10 : 3)) * 0.25;
    const tx = Math.sin(sw) * R * 0.6;
    const ty = -Math.cos(sw) * R * 0.6;
    x.strokeStyle = c.Pd;
    x.lineWidth = R * 0.06;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(0, R * 0.05);
    x.quadraticCurveTo(tx * 0.2, ty * 0.6, tx, ty);
    x.stroke();
    glowAt(x, c.S, tx, ty, R * 0.45, 0.6);
    x.fillStyle = rad(x, tx - R * 0.04, ty - R * 0.04, R * 0.16, '#ffffff', c.Sh, c.S);
    circ(x, tx, ty, R * 0.13);
    x.fill();
  },
  h_cat(d) {
    const { x, R, c } = d;
    for (const sd of [-1, 1]) {
      x.fillStyle = lin(x, 0, -R * 0.55, 0, R * 0.2, c.P, c.Pd);
      x.beginPath();
      x.moveTo(sd * R * 0.75, R * 0.45);
      x.quadraticCurveTo(sd * R * 0.78, -R * 0.15, sd * R * 0.65, -R * 0.4);
      x.quadraticCurveTo(sd * R * 0.35, -R * 0.15, sd * R * 0.12, R * 0.15);
      x.closePath();
      x.fill();
      x.fillStyle = '#ff9bb3';
      x.beginPath();
      x.moveTo(sd * R * 0.62, R * 0.25);
      x.lineTo(sd * R * 0.62, -R * 0.2);
      x.lineTo(sd * R * 0.32, R * 0.1);
      x.closePath();
      x.fill();
    }
  },
  h_bow(d) {
    const { x, R, c, t } = d;
    x.save();
    x.translate(R * 0.38, R * 0.15);
    x.rotate(0.35 + Math.sin(t * 3) * 0.04);
    for (const sd of [-1, 1]) {
      x.fillStyle = lin(x, 0, -R * 0.3, 0, R * 0.3, c.Sh, c.S, c.Sd);
      x.beginPath();
      x.moveTo(0, 0);
      x.bezierCurveTo(sd * R * 0.2, -R * 0.4, sd * R * 0.55, -R * 0.3, sd * R * 0.48, 0);
      x.bezierCurveTo(sd * R * 0.55, R * 0.3, sd * R * 0.2, R * 0.35, 0, 0);
      x.fill();
      x.strokeStyle = al(c.Sd, 0.7);
      x.lineWidth = R * 0.025;
      x.beginPath();
      x.moveTo(sd * R * 0.1, -R * 0.05);
      x.quadraticCurveTo(sd * R * 0.3, -R * 0.12, sd * R * 0.38, -R * 0.02);
      x.stroke();
    }
    x.fillStyle = c.Sd;
    circ(x, 0, 0, R * 0.12);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.5)';
    circ(x, -R * 0.03, -R * 0.04, R * 0.04);
    x.fill();
    x.restore();
  },
  h_horns(d) {
    const { x, R, c } = d;
    for (const sd of [-1, 1]) {
      x.fillStyle = lin(x, sd * R * 0.3, R * 0.2, sd * R * 0.8, -R * 0.5, '#ff5a7a', '#c4123a', '#5a0618');
      x.beginPath();
      x.moveTo(sd * R * 0.62, R * 0.4);
      x.quadraticCurveTo(sd * R * 1.0, -R * 0.05, sd * R * 0.75, -R * 0.42);
      x.quadraticCurveTo(sd * R * 0.62, -R * 0.0, sd * R * 0.22, R * 0.2);
      x.closePath();
      x.fill();
      x.strokeStyle = 'rgba(255,255,255,0.4)';
      x.lineWidth = R * 0.04;
      x.beginPath();
      x.moveTo(sd * R * 0.58, R * 0.18);
      x.quadraticCurveTo(sd * R * 0.78, -R * 0.05, sd * R * 0.75, -R * 0.3);
      x.stroke();
    }
    void c;
  },
  h_headphones(d, hy) {
    const { x, R, c, t, p } = d;
    const side = d.sh.side * R;
    x.strokeStyle = lin(x, -side, 0, side, 0, '#2a2f45', '#5a6080', '#2a2f45');
    x.lineWidth = R * 0.12;
    x.beginPath();
    x.arc(0, hy, hy + R * 0.08, PI * 1.12, PI * 1.88);
    x.stroke();
    const bump = p.mood === 'idle' ? Math.max(0, Math.sin(t * 8)) * 0.03 : 0;
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * (side + R * 0.02), hy - R * 0.1);
      x.scale(1 + bump, 1 + bump);
      x.fillStyle = lin(x, 0, -R * 0.3, 0, R * 0.3, '#5a6080', '#2a2f45');
      rrect(x, -R * 0.16, -R * 0.3, R * 0.32, R * 0.6, R * 0.14);
      x.fill();
      x.fillStyle = lin(x, 0, -R * 0.2, 0, R * 0.2, c.Sh, c.S);
      rrect(x, -R * 0.1, -R * 0.2, R * 0.2, R * 0.4, R * 0.09);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.4)';
      ell(x, -R * 0.03, -R * 0.1, R * 0.04, R * 0.08);
      x.fill();
      x.restore();
    }
    if (p.mood !== 'dead') {
      // notinhas
      const u = (t * 0.6) % 1;
      x.fillStyle = c.S;
      A(x, Math.sin(u * PI));
      const nx = side + R * 0.3 + u * R * 0.2;
      const ny = hy - R * 0.4 - u * R * 0.6;
      ell(x, nx, ny, R * 0.07, R * 0.05, -0.4);
      x.fill();
      x.fillRect(nx + R * 0.05, ny - R * 0.22, R * 0.025, R * 0.22);
      A(x, 1);
    }
  },
  h_tophat(d) {
    const { x, R, c } = d;
    x.save();
    x.translate(R * 0.05, R * 0.1);
    x.rotate(0.08);
    x.fillStyle = lin(x, -R * 0.4, 0, R * 0.4, 0, '#3a3550', '#14111f', '#06050c');
    x.beginPath();
    x.moveTo(-R * 0.38, 0);
    x.lineTo(-R * 0.42, -R * 0.85);
    x.quadraticCurveTo(0, -R * 0.95, R * 0.42, -R * 0.85);
    x.lineTo(R * 0.38, 0);
    x.closePath();
    x.fill();
    x.fillStyle = lin(x, 0, -R * 0.3, 0, -R * 0.15, c.Sh, c.S);
    x.fillRect(-R * 0.395, -R * 0.3, R * 0.79, R * 0.15);
    x.fillStyle = '#14111f';
    ell(x, 0, 0, R * 0.68, R * 0.12);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,0.25)';
    x.fillRect(-R * 0.3, -R * 0.8, R * 0.07, R * 0.45);
    x.fillStyle = '#2a2540';
    ell(x, 0, -R * 0.87, R * 0.42, R * 0.07);
    x.fill();
    x.restore();
  },
  h_wizard(d) {
    const { x, R, c, t } = d;
    const sw = Math.sin(t * 2) * 0.12;
    x.save();
    x.translate(0, R * 0.16);
    const col = c.lumS > 0.75 ? '#5a3dd8' : c.S;
    const tip = [Math.sin(sw) * R * 0.5 + R * 0.35, -R * 1.25];
    x.fillStyle = lin(x, -R * 0.5, 0, R * 0.5, -R, mix(col, '#ffffff', 0.3), col, mix(col, '#140030', 0.5));
    x.beginPath();
    x.moveTo(-R * 0.58, 0);
    x.quadraticCurveTo(-R * 0.2, -R * 0.6, tip[0], tip[1]);
    x.quadraticCurveTo(R * 0.15, -R * 0.55, R * 0.58, 0);
    x.closePath();
    x.fill();
    x.fillStyle = '#ffd84a';
    for (const [sx, sy, s] of [[-0.15, -0.35, 0.09], [0.15, -0.6, 0.07], [0.05, -0.15, 0.05]]) {
      const k = 0.7 + Math.sin(t * 3 + sx * 10) * 0.3;
      star5(x, sx * R, sy * R, s * R * k, t * 0.5, 0.45);
      x.fill();
    }
    x.fillStyle = lin(x, 0, -R * 0.1, 0, R * 0.12, mix(col, '#ffffff', 0.2), mix(col, '#140030', 0.4));
    ell(x, 0, 0, R * 0.85, R * 0.16);
    x.fill();
    x.fillStyle = '#ffd84a';
    x.fillRect(-R * 0.55, -R * 0.12, R * 1.1, R * 0.08);
    glowAt(x, '#fff3a0', tip[0], tip[1], R * 0.3, 0.6 + Math.sin(t * 4) * 0.3);
    x.restore();
  },
  h_astro(d, hy) {
    const { x, R, t } = d;
    const rr = Math.max(hy, d.sh.side * R, d.sh.bottom * R) + R * 0.28;
    x.save();
    x.translate(0, hy);
    // vidro
    x.fillStyle = rad(x, -rr * 0.3, -rr * 0.3, rr * 1.2, 'rgba(255,255,255,0.12)', 'rgba(170,220,255,0.08)', 'rgba(120,180,255,0.22)');
    circ(x, 0, 0, rr);
    x.fill();
    x.strokeStyle = 'rgba(220,240,255,0.7)';
    x.lineWidth = R * 0.05;
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.75)';
    x.lineWidth = R * 0.08;
    x.lineCap = 'round';
    x.beginPath();
    x.arc(0, 0, rr * 0.86, PI * 1.08, PI * 1.38);
    x.stroke();
    x.lineWidth = R * 0.04;
    x.beginPath();
    x.arc(0, 0, rr * 0.86, PI * 1.45, PI * 1.52);
    x.stroke();
    // gola
    x.fillStyle = lin(x, 0, rr * 0.7, 0, rr * 1.05, '#ffffff', '#b8c0d8');
    x.beginPath();
    x.arc(0, 0, rr * 1.02, PI * 0.22, PI * 0.78);
    x.arc(0, 0, rr * 0.86, PI * 0.76, PI * 0.24, true);
    x.closePath();
    x.fill();
    x.strokeStyle = '#ff7a2f';
    x.lineWidth = R * 0.04;
    x.beginPath();
    x.arc(0, 0, rr * 0.94, PI * 0.3, PI * 0.7);
    x.stroke();
    // antena com luz
    x.strokeStyle = '#b8c0d8';
    x.lineWidth = R * 0.04;
    x.beginPath();
    x.moveTo(rr * 0.5, -rr * 0.86);
    x.lineTo(rr * 0.62, -rr * 1.15);
    x.stroke();
    const on = Math.sin(t * 4) > 0;
    if (on) glowAt(x, '#ff3b5c', rr * 0.62, -rr * 1.15, R * 0.3, 0.8);
    x.fillStyle = on ? '#ff6b80' : '#8a2030';
    circ(x, rr * 0.62, -rr * 1.15, R * 0.06);
    x.fill();
    x.restore();
  },
  h_halo(d) {
    const { x, R, t } = d;
    const by = -R * 0.35 + Math.sin(t * 2.4) * R * 0.06;
    glowAt(x, '#ffe35c', 0, by, R * 0.9, 0.55);
    x.lineWidth = R * 0.11;
    x.strokeStyle = lin(x, -R * 0.5, 0, R * 0.5, 0, '#fff3a0', '#ffd23f', '#fff9d0', '#ffb300');
    ell(x, 0, by, R * 0.52, R * 0.15);
    x.stroke();
    x.lineWidth = R * 0.035;
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    x.beginPath();
    x.ellipse(0, by, R * 0.52, R * 0.15, 0, PI * 1.1, PI * 1.6);
    x.stroke();
    x.fillStyle = '#ffffff';
    const k = Math.max(0, Math.sin(t * 3));
    A(x, k);
    star4(x, R * 0.45, by - R * 0.08, R * 0.12 * k);
    A(x, 1);
  },
  h_crown(d) {
    const { x, R, t } = d;
    x.save();
    x.translate(0, R * 0.12);
    glowAt(x, '#ffd23f', 0, -R * 0.3, R * 0.9, 0.35);
    x.fillStyle = lin(x, 0, -R * 0.75, 0, R * 0.05, '#fffbe0', '#ffd23f', '#e09b00', '#a86200');
    x.beginPath();
    x.moveTo(-R * 0.6, 0);
    x.lineTo(-R * 0.68, -R * 0.55);
    x.lineTo(-R * 0.36, -R * 0.3);
    x.lineTo(-R * 0.18, -R * 0.72);
    x.lineTo(0, -R * 0.38);
    x.lineTo(R * 0.18, -R * 0.72);
    x.lineTo(R * 0.36, -R * 0.3);
    x.lineTo(R * 0.68, -R * 0.55);
    x.lineTo(R * 0.6, 0);
    x.quadraticCurveTo(0, R * 0.08, -R * 0.6, 0);
    x.closePath();
    x.fill();
    x.strokeStyle = '#8a5200';
    x.lineWidth = R * 0.035;
    x.lineJoin = 'round';
    x.stroke();
    x.fillStyle = '#c98a00';
    x.beginPath();
    x.moveTo(-R * 0.6, -R * 0.02);
    x.quadraticCurveTo(0, R * 0.06, R * 0.6, -R * 0.02);
    x.lineTo(R * 0.62, -R * 0.14);
    x.quadraticCurveTo(0, -R * 0.06, -R * 0.62, -R * 0.14);
    x.fill();
    const gems: [number, number, string][] = [[-0.33, -0.08, '#ff2e63'], [0, -0.06, '#3fb8ff'], [0.33, -0.08, '#3ee07a']];
    for (const [gx, gy, col] of gems) {
      x.fillStyle = rad(x, (gx - 0.02) * R, (gy - 0.03) * R, R * 0.09, mix(col, '#ffffff', 0.6), col, mix(col, '#000000', 0.4));
      ell(x, gx * R, gy * R, R * 0.075, R * 0.06);
      x.fill();
    }
    for (const px of [-0.68, -0.18, 0.18, 0.68]) {
      x.fillStyle = '#fff9d0';
      circ(x, px * R, (px === -0.68 || px === 0.68 ? -0.55 : -0.72) * R, R * 0.055);
      x.fill();
    }
    // brilho que passa
    x.save();
    x.beginPath();
    x.rect(-R * 0.7, -R * 0.8, R * 1.4, R * 0.9);
    x.clip();
    const ph = ((t * 0.5) % 1.6) - 0.3;
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.beginPath();
    x.moveTo((-0.8 + ph * 1.6) * R, -R * 0.8);
    x.lineTo((-0.65 + ph * 1.6) * R, -R * 0.8);
    x.lineTo((-0.95 + ph * 1.6) * R, R * 0.1);
    x.lineTo((-1.1 + ph * 1.6) * R, R * 0.1);
    x.fill();
    x.restore();
    const k = Math.max(0, Math.sin(t * 2.6));
    x.fillStyle = '#ffffff';
    A(x, k);
    star4(x, R * 0.18, -R * 0.75, R * 0.16 * k);
    A(x, 1);
    x.restore();
  },
  h_unicorn(d) {
    const { x, R, t } = d;
    x.save();
    x.translate(0, R * 0.12);
    const g = x.createLinearGradient(0, 0, 0, -R * 0.95);
    g.addColorStop(0, '#ffd1f0');
    g.addColorStop(0.5, '#fff3a0');
    g.addColorStop(1, '#bff8ff');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(-R * 0.17, 0);
    x.lineTo(0, -R * 0.95);
    x.lineTo(R * 0.17, 0);
    x.closePath();
    x.fill();
    x.strokeStyle = 'rgba(200,120,200,0.6)';
    x.lineWidth = R * 0.03;
    x.beginPath();
    for (let i = 1; i < 5; i++) {
      const y0 = -i * R * 0.18;
      const w = R * 0.17 * (1 - i / 5.3);
      x.moveTo(-w, y0 + R * 0.06);
      x.lineTo(w, y0 - R * 0.02);
    }
    x.stroke();
    glowAt(x, '#ffd1f0', 0, -R * 0.95, R * 0.35, 0.6 + Math.sin(t * 3) * 0.3);
    // crina
    const cols = ['#ff7ad5', '#ffd84a', '#7dfcff', '#b388ff'];
    for (let i = 0; i < cols.length; i++) {
      x.fillStyle = cols[i];
      x.beginPath();
      const bx = -R * (0.15 + i * 0.12);
      const sw = Math.sin(t * 3 + i) * R * 0.04;
      x.moveTo(bx + R * 0.1, R * 0.05);
      x.quadraticCurveTo(bx - R * 0.15, -R * 0.15, bx - R * 0.3 + sw, R * (0.25 + i * 0.12));
      x.quadraticCurveTo(bx - R * 0.05, R * 0.15, bx + R * 0.1, R * 0.12);
      x.fill();
    }
    x.restore();
  },
  h_flame(d) {
    const { x, R, t, p } = d;
    const fly = p.mood === 'fly';
    x.save();
    x.translate(0, R * 0.32);
    glowAt(x, '#ff6a00', 0, -R * 0.45, R * 1.3, 0.55 + Math.sin(t * 9) * 0.1);
    const layers: [string, number, number][] = [
      ['#ff2d00', 1.0, 0],
      ['#ff8a00', 0.78, 1.3],
      ['#ffd84a', 0.52, 2.7],
      ['#fffbe0', 0.28, 3.9],
    ];
    for (const [col, s, ph] of layers) {
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(-R * 0.82 * s, 0);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const px = (-0.82 + u * 1.64) * R * s;
        const tall = (0.55 + Math.sin(u * PI) * 0.6) * s * (fly ? 1.25 : 1);
        const fl = Math.sin(t * 11 + i * 1.7 + ph) * 0.12 + Math.sin(t * 7.3 + i) * 0.06;
        const lean = fly ? R * 0.15 : Math.sin(t * 3 + i) * R * 0.05;
        x.quadraticCurveTo(px - R * 0.16 * s, -R * tall * 0.4, px + lean, -R * (tall + fl));
        x.quadraticCurveTo(px + R * 0.12 * s, -R * tall * 0.4, px + R * 0.16 * s, -R * 0.12 * s);
      }
      x.lineTo(R * 0.82 * s, 0);
      x.quadraticCurveTo(0, R * 0.12, -R * 0.82 * s, 0);
      x.fill();
    }
    // faíscas subindo
    for (let i = 0; i < 6; i++) {
      const u = (t * 0.9 + i * 0.37) % 1;
      const ex = Math.sin(i * 12.9 + u * 4) * R * 0.6;
      const ey = -R * (0.6 + u * 1.2);
      x.fillStyle = i % 2 ? '#ffd84a' : '#ff8a00';
      A(x, 1 - u);
      circ(x, ex, ey, R * 0.035 * (1 - u * 0.5));
      x.fill();
    }
    A(x, 1);
    x.restore();
  },
  h_laurel(d) {
    const { x, R, t } = d;
    x.save();
    x.translate(0, R * 0.25);
    glowAt(x, '#fff3a0', 0, -R * 0.1, R * 1.1, 0.4);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        const a = PI * 1.05 + i * 0.16;
        const rr = R * 0.78;
        const px = sd * Math.cos(a) * rr * -1;
        const py = Math.sin(a) * rr * 0.55 + R * 0.05;
        x.save();
        x.translate(px, py);
        x.rotate(sd * (-0.9 + i * 0.22) + Math.sin(t * 2 + i) * 0.05);
        x.fillStyle = lin(x, 0, -R * 0.12, 0, R * 0.12, '#fffbe0', '#ffd23f', '#c98a00');
        ell(x, 0, 0, R * 0.07, R * 0.16);
        x.fill();
        x.strokeStyle = 'rgba(140,80,0,0.6)';
        x.lineWidth = R * 0.015;
        x.beginPath();
        x.moveTo(0, -R * 0.13);
        x.lineTo(0, R * 0.13);
        x.stroke();
        x.restore();
      }
    }
    x.fillStyle = rad(x, 0, -R * 0.62, R * 0.12, '#ffffff', '#3ee07a', '#17994a');
    circ(x, 0, -R * 0.6, R * 0.1);
    x.fill();
    const k = Math.max(0, Math.sin(t * 2));
    x.fillStyle = '#ffffff';
    A(x, k);
    star4(x, -R * 0.55, -R * 0.45, R * 0.13 * k);
    star4(x, R * 0.6, -R * 0.2, R * 0.1 * k);
    A(x, 1);
    x.restore();
  },
};

/* ============================================================
 *  COSTAS (layer 0 = atrás do corpo; 1 = frente: alças, fivelas)
 * ============================================================ */

function flap(d: DC, slow = 4, fast = 16, amp = 0.25): number {
  return Math.sin(d.t * (d.p.mood === 'fly' ? fast : slow)) * amp;
}

function featherWing(d: DC, sd: number, cols: [string, string, string], fire = false): void {
  const { x, R, t } = d;
  const side = d.sh.side * R;
  x.save();
  x.translate(sd * side * 0.62, -R * 0.2);
  x.rotate(sd * (-0.45 + flap(d, 3.5, 14, 0.3)));
  x.scale(sd, 1);
  const n = 6;
  for (let i = n - 1; i >= 0; i--) {
    const a = -1.0 + i * 0.3;
    const len = R * (1.55 - i * 0.13) * (fire ? 1.12 : 1);
    x.save();
    x.rotate(a);
    const g = x.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, cols[0]);
    g.addColorStop(0.6, cols[1]);
    g.addColorStop(1, cols[2]);
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(0, -R * 0.12);
    const fl = fire ? Math.sin(t * 12 + i * 2) * R * 0.1 : 0;
    x.quadraticCurveTo(len * 0.6, -R * 0.3, len + fl, fire ? Math.sin(t * 9 + i) * R * 0.07 : 0);
    x.quadraticCurveTo(len * 0.6, R * 0.2, 0, R * 0.12);
    x.closePath();
    x.fill();
    if (!fire) {
      x.strokeStyle = 'rgba(120,140,200,0.35)';
      x.lineWidth = R * 0.02;
      x.beginPath();
      x.moveTo(R * 0.1, 0);
      x.lineTo(len * 0.9, 0);
      x.stroke();
    }
    x.restore();
  }
  x.restore();
}

export const BACKS: Record<string, LFn> = {
  k_none() {},
  /* tosco: asinhas de papelão com fita */
  k_cardboard(d, layer) {
    if (layer) return;
    const { x, R } = d;
    const side = d.sh.side * R;
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * side * 0.75, -R * 0.1);
      x.rotate(sd * (0.15 + flap(d, 2, 8, 0.12)));
      x.scale(sd, 1);
      x.fillStyle = '#c49a62';
      x.beginPath();
      x.moveTo(0, -R * 0.1);
      x.lineTo(R * 0.75, -R * 0.55);
      x.lineTo(R * 0.85, -R * 0.15);
      x.lineTo(R * 0.6, R * 0.05);
      x.lineTo(R * 0.7, R * 0.25);
      x.lineTo(0, R * 0.25);
      x.closePath();
      x.fill();
      marker(x, R);
      x.strokeStyle = '#9a7442';
      x.lineWidth = R * 0.025;
      x.beginPath();
      x.moveTo(R * 0.1, R * 0.05);
      x.lineTo(R * 0.6, -R * 0.3);
      x.stroke();
      // fita
      x.fillStyle = 'rgba(200,200,190,0.85)';
      x.save();
      x.rotate(0.4);
      x.fillRect(R * 0.0, -R * 0.12, R * 0.28, R * 0.12);
      x.restore();
      x.restore();
    }
  },
  k_backpack(d, layer) {
    const { x, R, c } = d;
    const side = d.sh.side * R;
    if (!layer) {
      // mochila espiando por trás (maior que o corpo)
      x.fillStyle = lin(x, 0, -R * 0.8, 0, R * 0.7, c.Sh, c.S, c.Sd);
      rrect(x, -side * 1.18, -R * 0.82, side * 2.36, R * 1.45, R * 0.42);
      x.fill();
      x.fillStyle = c.Sd;
      rrect(x, -side * 1.22, -R * 0.9, side * 2.44, R * 0.42, R * 0.2);
      x.fill();
      x.fillStyle = 'rgba(255,255,255,0.35)';
      rrect(x, -side * 1.05, -R * 0.84, side * 0.6, R * 0.1, R * 0.05);
      x.fill();
      x.fillStyle = '#ffd84a';
      rrect(x, -R * 0.1, -R * 0.62, R * 0.2, R * 0.14, R * 0.04);
      x.fill();
      return;
    }
    // alças na borda dos ombros
    x.strokeStyle = c.Sd;
    x.lineWidth = R * 0.12;
    x.lineCap = 'round';
    for (const sd of [-1, 1]) {
      x.beginPath();
      x.arc(0, 0, R * 0.9, sd > 0 ? -0.55 : PI + 0.55, sd > 0 ? 0.35 : PI - 0.35, sd < 0);
      x.stroke();
    }
  },
  k_tail(d, layer) {
    if (layer) return;
    const { x, R, c, t } = d;
    const w = Math.sin(t * (d.p.mood === 'fly' ? 12 : 4)) * 0.25;
    x.strokeStyle = c.Pd;
    x.lineWidth = R * 0.2;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(R * 0.5, R * 0.55);
    x.bezierCurveTo(R * 1.2, R * (0.8 + w), R * 1.45, R * (0.1 + w), R * (1.1 + w * 0.4), -R * 0.1);
    x.stroke();
    x.strokeStyle = c.S;
    x.lineWidth = R * 0.24;
    x.beginPath();
    x.moveTo(R * (1.16 + w * 0.4), -R * 0.02);
    x.lineTo(R * (1.1 + w * 0.4), -R * 0.12);
    x.stroke();
  },
  k_cape(d, layer) {
    const { x, R, c, t, p } = d;
    if (layer) {
      // fecho
      x.fillStyle = lin(x, 0, -R * 0.65, 0, -R * 0.45, '#fff3a0', '#c98a00');
      for (const sd of [-1, 1]) {
        circ(x, sd * R * 0.42, -R * 0.55 + d.sh.fy * R, R * 0.08);
        x.fill();
      }
      return;
    }
    const fly = p.mood === 'fly';
    const sp = fly ? 10 : 2.5;
    const w = d.sh.side * R;
    x.fillStyle = lin(x, 0, -R * 0.6, 0, R * 1.5, c.S, c.Sd);
    x.beginPath();
    x.moveTo(-w * 0.6, -R * 0.6);
    x.quadraticCurveTo(-w * 1.3, R * 0.3, -w * 1.25 + Math.sin(t * sp) * R * 0.08, R * (fly ? 1.7 : 1.35));
    for (let i = 1; i <= 4; i++) {
      const u = i / 4;
      const px = -w * 1.25 + u * w * 2.5;
      const py = R * (fly ? 1.7 : 1.35) + Math.sin(t * sp + u * 6) * R * 0.1 - (i % 2 ? R * 0.08 : 0);
      x.lineTo(px, py);
    }
    x.quadraticCurveTo(w * 1.3, R * 0.3, w * 0.6, -R * 0.6);
    x.closePath();
    x.fill();
    x.fillStyle = al(c.Sh, 0.35);
    x.beginPath();
    x.moveTo(-w * 0.2, -R * 0.4);
    x.quadraticCurveTo(-w * 0.7, R * 0.6, -w * 0.55, R * 1.2);
    x.lineTo(-w * 0.35, R * 1.2);
    x.quadraticCurveTo(-w * 0.45, R * 0.5, -w * 0.1, -R * 0.4);
    x.fill();
  },
  k_bat(d, layer) {
    if (layer) return;
    const { x, R, c } = d;
    const side = d.sh.side * R;
    const col = mix(c.P, '#1a0830', 0.6);
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * side * 0.7, -R * 0.15);
      x.rotate(sd * (-0.25 + flap(d, 5, 18, 0.35)));
      x.scale(sd, 1);
      x.fillStyle = lin(x, 0, 0, R * 1.2, 0, col, mix(col, '#7a2a8a', 0.4));
      x.beginPath();
      x.moveTo(0, -R * 0.15);
      x.lineTo(R * 0.5, -R * 0.6);
      x.lineTo(R * 1.2, -R * 0.5);
      x.quadraticCurveTo(R * 1.0, -R * 0.25, R * 1.05, R * 0.05);
      x.quadraticCurveTo(R * 0.8, -R * 0.1, R * 0.7, R * 0.2);
      x.quadraticCurveTo(R * 0.5, 0, R * 0.35, R * 0.25);
      x.quadraticCurveTo(R * 0.2, R * 0.05, 0, R * 0.15);
      x.closePath();
      x.fill();
      x.strokeStyle = al('#000000', 0.35);
      x.lineWidth = R * 0.03;
      x.beginPath();
      x.moveTo(R * 0.5, -R * 0.6);
      x.lineTo(R * 0.7, R * 0.2);
      x.moveTo(R * 0.5, -R * 0.6);
      x.lineTo(R * 1.05, R * 0.05);
      x.moveTo(R * 0.5, -R * 0.6);
      x.lineTo(R * 0.35, R * 0.25);
      x.stroke();
      x.restore();
    }
  },
  k_jetpack(d, layer) {
    const { x, R, c, t, p } = d;
    const side = d.sh.side * R;
    if (layer) return;
    const fly = p.mood === 'fly';
    for (const sd of [-1, 1]) {
      const tx = sd * (side * 0.95 + R * 0.08);
      // chama
      const fl = (fly ? 1 : 0.35) * (1 + Math.sin(t * 30 + sd) * 0.15);
      glowAt(x, '#ff8a3c', tx, R * 0.75, R * 0.6 * fl, 0.8);
      x.fillStyle = '#ff5a1a';
      x.beginPath();
      x.moveTo(tx - R * 0.14, R * 0.45);
      x.quadraticCurveTo(tx, R * (0.45 + 1.0 * fl), tx + R * 0.14, R * 0.45);
      x.fill();
      x.fillStyle = '#fff3a0';
      x.beginPath();
      x.moveTo(tx - R * 0.07, R * 0.45);
      x.quadraticCurveTo(tx, R * (0.45 + 0.55 * fl), tx + R * 0.07, R * 0.45);
      x.fill();
      // tanque
      x.fillStyle = lin(x, tx - R * 0.2, 0, tx + R * 0.2, 0, '#8a95b0', '#e8ecf5', '#6d7891');
      rrect(x, tx - R * 0.2, -R * 0.72, R * 0.4, R * 1.17, R * 0.2);
      x.fill();
      x.fillStyle = c.S;
      x.fillRect(tx - R * 0.2, -R * 0.36, R * 0.4, R * 0.12);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.fillRect(tx - R * 0.1, -R * 0.62, R * 0.06, R * 0.22);
      x.fillStyle = '#3a3f55';
      rrect(x, tx - R * 0.13, R * 0.38, R * 0.26, R * 0.12, R * 0.04);
      x.fill();
    }
  },
  k_angel(d, layer) {
    if (layer) return;
    glowAt(d.x, '#ffffff', 0, -d.R * 0.2, d.R * 1.9, 0.25);
    for (const sd of [-1, 1]) featherWing(d, sd, ['#ffffff', '#f2f4ff', '#c8d4ff']);
  },
  k_fairy(d, layer) {
    if (layer) return;
    const { x, R, t } = d;
    const side = d.sh.side * R;
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * side * 0.6, -R * 0.1);
      x.rotate(sd * flap(d, 6, 22, 0.2));
      x.scale(sd, 1);
      for (const [a, len, wid] of [[-0.55, 1.15, 0.42], [0.55, 0.75, 0.3]]) {
        x.save();
        x.rotate(a);
        const h = t * 60 + a * 100;
        x.fillStyle = lin(x, 0, 0, R * len, 0, al(hsl(h, 1, 0.85), 0.35), al(hsl(h + 60, 1, 0.75), 0.55), al(hsl(h + 140, 1, 0.8), 0.4));
        ell(x, R * len * 0.5, 0, R * len * 0.52, R * wid);
        x.fill();
        x.strokeStyle = 'rgba(255,255,255,0.7)';
        x.lineWidth = R * 0.025;
        x.stroke();
        x.beginPath();
        x.moveTo(R * 0.05, 0);
        x.lineTo(R * len * 0.9, 0);
        x.moveTo(R * len * 0.4, 0);
        x.lineTo(R * len * 0.75, -R * wid * 0.6);
        x.moveTo(R * len * 0.4, 0);
        x.lineTo(R * len * 0.75, R * wid * 0.6);
        x.stroke();
        x.restore();
      }
      x.restore();
    }
    // pó de fada
    x.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
      const u = (t * 0.5 + i * 0.2) % 1;
      A(x, 1 - u);
      star4(x, Math.sin(i * 7.7) * R * 1.3, R * (0.2 + u * 0.9), R * 0.06);
    }
    A(x, 1);
  },
  k_dragon(d, layer) {
    if (layer) return;
    const { x, R, c } = d;
    const side = d.sh.side * R;
    const m = mix(c.S, '#1a0830', 0.25);
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * side * 0.65, -R * 0.2);
      x.rotate(sd * (-0.3 + flap(d, 3, 12, 0.3)));
      x.scale(sd, 1);
      const tips: [number, number][] = [[R * 0.9, -R * 1.0], [R * 1.45, -R * 0.55], [R * 1.5, R * 0.05], [R * 1.1, R * 0.45]];
      x.fillStyle = lin(x, 0, -R, R * 1.4, R * 0.4, mix(m, '#ffffff', 0.25), m, mix(m, '#000000', 0.35));
      x.beginPath();
      x.moveTo(0, -R * 0.1);
      x.lineTo(tips[0][0], tips[0][1]);
      for (let i = 1; i < tips.length; i++) {
        const [px, py] = tips[i];
        const [qx, qy] = tips[i - 1];
        x.quadraticCurveTo((px + qx) / 2 - R * 0.1, (py + qy) / 2 + R * 0.05, px, py);
      }
      x.quadraticCurveTo(R * 0.5, R * 0.3, 0, R * 0.25);
      x.closePath();
      x.fill();
      x.strokeStyle = mix(m, '#000000', 0.5);
      x.lineWidth = R * 0.06;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(0, -R * 0.05);
      x.lineTo(tips[0][0], tips[0][1]);
      for (let i = 1; i < tips.length; i++) {
        x.moveTo(tips[0][0] * 0.85, tips[0][1] * 0.85);
        x.lineTo(tips[i][0], tips[i][1]);
      }
      x.stroke();
      x.fillStyle = '#fff3d0';
      x.beginPath();
      x.moveTo(tips[0][0], tips[0][1]);
      x.lineTo(tips[0][0] + R * 0.12, tips[0][1] - R * 0.2);
      x.lineTo(tips[0][0] + R * 0.05, tips[0][1] + R * 0.05);
      x.fill();
      x.restore();
    }
  },
  k_mech(d, layer) {
    if (layer) return;
    const { x, R, t, p } = d;
    const side = d.sh.side * R;
    const col = d.c.lumS > 0.35 ? d.c.S : '#3dfcff';
    const k = p.mood === 'fly' ? 1 : 0.5 + Math.sin(t * 3) * 0.15;
    for (const sd of [-1, 1]) {
      x.save();
      x.translate(sd * side * 0.8, -R * 0.1);
      x.rotate(sd * (-0.5 + Math.sin(t * 2) * 0.05));
      x.scale(sd, 1);
      for (let i = 0; i < 3; i++) {
        x.save();
        x.rotate(-0.5 + i * 0.4);
        x.fillStyle = lin(x, 0, -R * 0.1, 0, R * 0.1, '#e8ecf5', '#8a95b0', '#4a5068');
        rrect(x, 0, -R * 0.09, R * (1.0 - i * 0.15), R * 0.18, R * 0.06);
        x.fill();
        x.fillStyle = col;
        x.fillRect(R * 0.2, -R * 0.03, R * (0.6 - i * 0.12), R * 0.06);
        glowAt(x, col, R * (1.0 - i * 0.15), 0, R * 0.35 * k, 0.9);
        x.restore();
      }
      x.restore();
    }
  },
  k_phoenix(d, layer) {
    if (layer) return;
    const { x, R, t } = d;
    glowAt(x, '#ff6a00', 0, -R * 0.2, R * 2.4, 0.4 + Math.sin(t * 6) * 0.1);
    for (const sd of [-1, 1]) featherWing(d, sd, ['#fff3a0', '#ff8a00', '#ff2d00'], true);
    // brasas
    for (let i = 0; i < 8; i++) {
      const u = (t * 0.7 + i * 0.125) % 1;
      const sd = i % 2 ? 1 : -1;
      x.fillStyle = i % 3 ? '#ffd84a' : '#ff5a1a';
      A(x, 1 - u);
      circ(x, sd * R * (0.9 + Math.sin(i * 3.3 + u * 5) * 0.4), R * (0.3 - u * 1.4), R * 0.04 * (1 - u * 0.5));
      x.fill();
    }
    A(x, 1);
  },
};

/* ============================================================
 *  AURA (layer 0 = atrás, 1 = frente)
 * ============================================================ */

function orbit(d: DC, layer: 0 | 1, n: number, rx: number, ry: number, speed: number, draw: (px: number, py: number, i: number, depth: number) => void, cy = -0.1): void {
  for (let i = 0; i < n; i++) {
    const a = d.t * speed + (i / n) * TAU;
    const depth = Math.sin(a);
    if ((depth > 0 ? 1 : 0) !== layer) continue;
    draw(Math.cos(a) * rx * d.R, depth * ry * d.R + d.R * cy, i, depth);
  }
}

export const AURAS: Record<string, LFn> = {
  a_none() {},
  /* tosco: mosquinhas rodeando */
  a_flies(d, layer) {
    if (!layer) return;
    const { x, R, t } = d;
    for (let i = 0; i < 2; i++) {
      const a = t * (2.2 + i * 0.7) + i * 2;
      const px = Math.cos(a) * R * 1.3 + Math.sin(t * 13 + i) * R * 0.08;
      const py = -R * 0.6 + Math.sin(a * 1.7) * R * 0.5 + Math.cos(t * 11 + i) * R * 0.06;
      x.fillStyle = 'rgba(220,230,240,0.8)';
      const fl = Math.sin(t * 60) > 0 ? 1 : 0.6;
      ell(x, px - R * 0.04, py - R * 0.06, R * 0.05, R * 0.03 * fl, -0.5);
      x.fill();
      ell(x, px + R * 0.04, py - R * 0.06, R * 0.05, R * 0.03 * fl, 0.5);
      x.fill();
      x.fillStyle = INK;
      circ(x, px, py, R * 0.045);
      x.fill();
      // rastro tracejado
      x.strokeStyle = 'rgba(40,30,30,0.35)';
      x.lineWidth = R * 0.015;
      x.setLineDash([R * 0.04, R * 0.04]);
      x.beginPath();
      x.arc(px - Math.cos(a) * R * 0.2, py, R * 0.12, 0, 2);
      x.stroke();
      x.setLineDash(NO_DASH);
    }
  },
  a_bubbles(d, layer) {
    const { x, R, t } = d;
    for (let i = 0; i < 6; i++) {
      if (i % 2 !== layer) continue;
      const u = (t * 0.35 + i / 6) % 1;
      const px = Math.sin(i * 2.3 + u * 3) * R * 1.25;
      const py = R * (1 - u * 2.4);
      const r = R * (0.07 + (i % 3) * 0.03);
      A(x, Math.sin(u * PI));
      x.strokeStyle = 'rgba(190,240,255,0.9)';
      x.lineWidth = R * 0.025;
      x.fillStyle = 'rgba(190,240,255,0.15)';
      circ(x, px, py, r);
      x.fill();
      x.stroke();
      x.fillStyle = '#ffffff';
      circ(x, px - r * 0.35, py - r * 0.35, r * 0.25);
      x.fill();
    }
    A(x, 1);
  },
  a_sparkle(d, layer) {
    const { x, R, t } = d;
    for (let i = 0; i < 7; i++) {
      if (i % 2 !== layer) continue;
      const a = i * 2.39 + 0.4;
      const rr = R * (1.25 + (i % 3) * 0.12);
      const k = Math.max(0, Math.sin(t * 3 + i * 1.7));
      if (k < 0.05) continue;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * 0.9 - R * 0.1;
      glowAt(x, '#fff3a0', px, py, R * 0.3 * k, 0.6);
      x.fillStyle = i % 3 ? '#ffffff' : '#fff3a0';
      A(x, k);
      star4(x, px, py, R * 0.13 * k);
      A(x, 1);
    }
  },
  a_hearts(d, layer) {
    const { x, R, t } = d;
    for (let i = 0; i < 5; i++) {
      if (i % 2 !== layer) continue;
      const u = (t * 0.4 + i / 5) % 1;
      const px = Math.sin(i * 3.1 + u * 4) * R * 1.3;
      const py = R * (0.6 - u * 2);
      x.fillStyle = i % 2 ? '#ff4f8b' : '#ff8fb5';
      A(x, Math.sin(u * PI));
      x.save();
      x.translate(px, py);
      x.rotate(Math.sin(t * 3 + i) * 0.3);
      heart(x, 0, 0, R * (0.1 + (i % 3) * 0.03));
      x.fill();
      x.restore();
    }
    A(x, 1);
  },
  a_notes(d, layer) {
    const { x, R } = d;
    orbit(d, layer, 4, 1.45, 0.45, 1.2, (px, py, i, depth) => {
      x.fillStyle = ['#ff6bd5', '#7df9ff', '#fff36b', '#b388ff'][i];
      A(x, 0.7 + depth * 0.3);
      const s = R * (0.9 + depth * 0.15);
      ell(x, px, py + s * 0.12, s * 0.09, s * 0.07, -0.4);
      x.fill();
      x.fillRect(px + s * 0.07, py - s * 0.18, s * 0.03, s * 0.3);
      if (i % 2) x.fillRect(px + s * 0.07, py - s * 0.18, s * 0.14, s * 0.05);
      A(x, 1);
    });
  },
  a_moons(d, layer) {
    const { x, R } = d;
    const cs: [string, string][] = [['#ffffff', '#9aa5c8'], ['#ffe9a8', '#c9a050'], ['#c8f0ff', '#5a9ad8']];
    orbit(d, layer, 3, 1.55, 0.5, 0.9, (px, py, i, depth) => {
      const r = R * (0.15 + (i % 2) * 0.04) * (1 + depth * 0.18);
      x.fillStyle = rad(x, px - r * 0.4, py - r * 0.4, r * 1.4, cs[i][0], cs[i][1]);
      circ(x, px, py, r);
      x.fill();
      x.fillStyle = 'rgba(0,0,0,0.15)';
      circ(x, px + r * 0.3, py + r * 0.1, r * 0.25);
      x.fill();
      circ(x, px - r * 0.2, py + r * 0.4, r * 0.15);
      x.fill();
    }, 0.55);
    if (!layer) {
      x.strokeStyle = 'rgba(255,255,255,0.15)';
      x.lineWidth = R * 0.02;
      ell(x, 0, R * 0.55, R * 1.55, R * 0.5);
      x.stroke();
    }
  },
  a_fire(d, layer) {
    const { x, R, t } = d;
    if (!layer) glowAt(x, '#ff6a00', 0, 0, R * 2.3, 0.5 + Math.sin(t * 8) * 0.1);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.6;
      const depth = Math.sin(a);
      if ((depth > 0 ? 1 : 0) !== layer) continue;
      const px = Math.cos(a) * R * 1.4;
      const py = depth * R * 0.42 + R * 0.55;
      const h = R * (0.35 + Math.sin(t * 12 + i * 2.1) * 0.1) * (0.85 + depth * 0.2);
      for (const [col, s] of [['#ff3d00', 1], ['#ffb300', 0.65], ['#fff3a0', 0.35]] as [string, number][]) {
        x.fillStyle = col;
        x.beginPath();
        x.moveTo(px - R * 0.12 * s, py);
        x.quadraticCurveTo(px - R * 0.1 * s, py - h * s * 0.6, px + Math.sin(t * 9 + i) * R * 0.04, py - h * s);
        x.quadraticCurveTo(px + R * 0.1 * s, py - h * s * 0.6, px + R * 0.12 * s, py);
        x.closePath();
        x.fill();
      }
    }
  },
  a_electric(d, layer) {
    const { x, R, t } = d;
    if (!layer) {
      glowAt(x, '#7df9ff', 0, 0, R * 2.2, 0.35 + Math.sin(t * 20) * 0.1);
      return;
    }
    const f = Math.floor(t * 14);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (let b = 0; b < 3; b++) {
      const seed = f * 7 + b * 31;
      const a0 = ((seed * 0.618) % 1) * TAU;
      for (const pass of [0, 1]) {
        x.strokeStyle = pass ? '#ffffff' : '#7df9ff';
        x.lineWidth = R * (pass ? 0.025 : 0.08);
        A(x, pass ? 1 : 0.6);
        x.beginPath();
        for (let k = 0; k <= 6; k++) {
          const a = a0 + k * 0.22;
          const rr = R * (1.2 + (Math.sin(seed + k * 12.9) * 0.5 + 0.5) * 0.3);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (k) x.lineTo(px, py);
          else x.moveTo(px, py);
        }
        x.stroke();
      }
    }
    A(x, 1);
  },
  a_galaxy(d, layer) {
    const { x, R, t } = d;
    if (!layer) {
      glowAt(x, '#b44dff', 0, 0, R * 2.6, 0.45);
      x.save();
      x.scale(1, 0.4);
      x.rotate(t * 0.4);
      for (let arm = 0; arm < 3; arm++) {
        for (let i = 0; i < 16; i++) {
          const a = arm * (TAU / 3) + i * 0.22;
          const rr = R * (1.25 + i * 0.07);
          x.fillStyle = i % 4 === 0 ? '#ff9bf0' : i % 3 ? '#ffffff' : '#7dfcff';
          A(x, 0.85 - i * 0.045);
          circ(x, Math.cos(a) * rr, Math.sin(a) * rr, R * (0.075 - i * 0.003));
          x.fill();
        }
      }
      x.restore();
      A(x, 1);
    }
    orbit(d, layer, 1, 1.7, 0.6, 0.7, (px, py, _i, depth) => {
      const r = R * 0.2 * (1 + depth * 0.2);
      x.fillStyle = rad(x, px - r * 0.4, py - r * 0.4, r * 1.4, '#ffd1a8', '#ff7a4a', '#7a1a3a');
      circ(x, px, py, r);
      x.fill();
      x.strokeStyle = 'rgba(255,230,180,0.85)';
      x.lineWidth = R * 0.03;
      ell(x, px, py, r * 1.7, r * 0.45, -0.3);
      x.stroke();
    });
  },
};
