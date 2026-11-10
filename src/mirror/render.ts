/* ============================================================
 *  BLOOP ESPELHO — desenho (Canvas 2D, retrato).
 *  Reaproveita drawAvatar (corpo, material, padrão, cabeça, costas,
 *  aura do criador) e troca só olhos e boca por versões expressivas
 *  movidas pelo rosto do jogador (pálpebras por olho, sobrancelhas,
 *  bocas A/O/E/fechada, sorriso), registradas como peças internas.
 * ============================================================ */
import { save } from '../core/storage';
import { drawAvatar, type AvatarData } from '../game/avatar';
import { mix } from '../game/avatar-gfx';
import type { DC } from '../game/avatar-mat';
import { EYES, MOUTHS } from '../game/avatar-parts';
import type { PlayerPose } from '../game/character';
import { skinById } from '../game/skins';
import { gameFont } from '../i18n/font';
import type { Rig } from './rig';

export type SceneId = 'quarto' | 'palco' | 'espaco';
export const SCENES: SceneId[] = ['quarto', 'palco', 'espaco'];
export type StickerId = 'none' | 'oculos' | 'coroa' | 'laco' | 'festa' | 'bigode' | 'estrelas';
export const STICKERS: StickerId[] = ['none', 'oculos', 'coroa', 'laco', 'festa', 'bigode', 'estrelas'];

/** Expressão do quadro atual (lida pelos olhos/boca injetados no drawAvatar). */
export interface Expr {
  rig: Rig;
  /** boca final (rosto + voz) */
  open: number;
  round: number;
  wide: number;
  sticker: StickerId;
}

const PART = '__mirror';
let E: Expr | null = null;
const PI = Math.PI;

function ellipse(x: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  x.beginPath();
  x.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, PI * 2);
}

/* ------------------------- olhos ------------------------- */
function drawEyes(d: DC): void {
  const e = E;
  if (!e) return;
  const { x, R } = d;
  const r = e.rig;
  const px = r.yaw * R * 0.24;
  const py = r.pitch * R * 0.2;
  const smile = (r.smileL + r.smileR) / 2;
  const iris = mix(d.c.S, '#16112a', 0.35);
  const irisHi = mix(d.c.S, '#ffffff', 0.35);
  const lid = d.c.P;
  for (const s of [-1, 1]) {
    const blink = s < 0 ? r.blinkL : r.blinkR;
    const brow = s < 0 ? r.browL : r.browR;
    // o olho do lado para onde a cabeça vira fica "mais longe" (estreita)
    const far = Math.max(0, s * r.yaw);
    const ew = R * 0.15 * (1 - far * 0.55);
    const eh = R * 0.175;
    const cx = s * d.ex * (1 - Math.abs(r.yaw) * 0.12) + px;
    const cy = d.ey + py;
    const low = Math.min(0.45, r.cheek * 0.35 + smile * 0.22);
    x.lineCap = 'round';
    x.lineJoin = 'round';
    if (blink > 0.88) {
      // fechado: arquinho (feliz se sorrindo)
      x.strokeStyle = d.c.ink;
      x.lineWidth = R * 0.045;
      x.beginPath();
      const bend = smile > 0.3 ? -eh * 0.55 : eh * 0.35;
      x.moveTo(cx - ew, cy);
      x.quadraticCurveTo(cx, cy + bend, cx + ew, cy);
      x.stroke();
      // cílios
      x.lineWidth = R * 0.025;
      x.beginPath();
      x.moveTo(cx + s * ew * 0.95, cy - R * 0.005);
      x.lineTo(cx + s * ew * 1.25, cy - R * 0.04);
      x.stroke();
    } else {
      x.save();
      ellipse(x, cx, cy, ew, eh);
      x.fillStyle = '#ffffff';
      x.fill();
      x.clip();
      // íris + pupila
      const ix = cx + r.lookX * ew * 0.38;
      const iy = cy + r.lookY * eh * 0.3 + eh * 0.08;
      const ir = Math.min(ew, eh) * 0.72;
      const g = x.createRadialGradient(ix - ir * 0.3, iy - ir * 0.4, ir * 0.1, ix, iy, ir);
      g.addColorStop(0, irisHi);
      g.addColorStop(1, iris);
      x.fillStyle = g;
      ellipse(x, ix, iy, ir * (ew / (R * 0.15)), ir);
      x.fill();
      x.fillStyle = '#140a26';
      ellipse(x, ix, iy, ir * 0.52 * (ew / (R * 0.15)), ir * 0.55);
      x.fill();
      x.fillStyle = '#ffffff';
      ellipse(x, ix - ir * 0.32, iy - ir * 0.38, ir * 0.26, ir * 0.24);
      x.fill();
      ellipse(x, ix + ir * 0.3, iy + ir * 0.3, ir * 0.12, ir * 0.12);
      x.fill();
      // pálpebra de cima (desce com o piscar)
      const top = cy - eh - 2;
      const lidY = cy - eh + eh * 2 * blink;
      x.fillStyle = lid;
      x.beginPath();
      x.moveTo(cx - ew - 2, top);
      x.lineTo(cx + ew + 2, top);
      x.lineTo(cx + ew + 2, lidY);
      x.quadraticCurveTo(cx, lidY + eh * 0.35 * (1 - blink), cx - ew - 2, lidY);
      x.closePath();
      x.fill();
      // pálpebra de baixo (sobe ao sorrir/apertar bochecha)
      if (low > 0.02) {
        const by = cy + eh - eh * 2 * low;
        x.beginPath();
        x.moveTo(cx - ew - 2, cy + eh + 2);
        x.lineTo(cx + ew + 2, cy + eh + 2);
        x.lineTo(cx + ew + 2, by);
        x.quadraticCurveTo(cx, by - eh * 0.3, cx - ew - 2, by);
        x.closePath();
        x.fill();
      }
      x.restore();
      // contorno + linha da pálpebra
      x.strokeStyle = d.c.ink;
      x.globalAlpha *= 0.55;
      x.lineWidth = R * 0.022;
      ellipse(x, cx, cy, ew, eh);
      x.stroke();
      x.globalAlpha /= 0.55;
      if (blink > 0.08) {
        x.lineWidth = R * 0.035;
        x.beginPath();
        const ly = cy - eh + eh * 2 * blink;
        x.moveTo(cx - ew * 0.98, ly);
        x.quadraticCurveTo(cx, ly + eh * 0.35 * (1 - blink), cx + ew * 0.98, ly);
        x.stroke();
      }
    }
    // sobrancelha: lado de fora sobe/desce; meio sobe com browInner (preocupado/surpreso)
    const by = cy - eh - R * 0.08 - brow * R * 0.07 - r.browInner * R * 0.025;
    const inner = r.browInner * R * 0.07 - Math.max(0, -brow) * R * 0.05;
    x.strokeStyle = mix(d.c.ink, d.c.Pd, 0.25);
    x.lineWidth = R * 0.05;
    x.beginPath();
    x.moveTo(cx + s * ew * 1.05, by + R * 0.015);
    x.quadraticCurveTo(cx, by - R * 0.035, cx - s * ew * 0.85, by - inner);
    x.stroke();
  }
}

/* ------------------------- boca ------------------------- */
function drawMouth(d: DC): void {
  const e = E;
  if (!e) return;
  const { x, R } = d;
  const r = e.rig;
  const smile = (r.smileL + r.smileR) / 2;
  const cx = r.yaw * R * 0.27;
  const cy = d.my + r.pitch * R * 0.22;
  const open = e.open;
  const round = e.round;
  const wide = e.wide;
  const w = R * (0.17 + 0.1 * smile + 0.08 * wide - 0.08 * round) * (1 - Math.abs(r.yaw) * 0.2);
  const h = R * (0.02 + 0.32 * open);
  const liftL = (r.smileL - r.frown) * R * 0.07;
  const liftR = (r.smileR - r.frown) * R * 0.07;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  // bochechas coradas ao sorrir
  if (smile > 0.15) {
    x.fillStyle = '#ff7aa8';
    const a = x.globalAlpha;
    x.globalAlpha = a * Math.min(0.55, smile * 0.6);
    for (const s of [-1, 1]) {
      ellipse(x, s * d.ex * 1.32 + cx * 0.6, d.ey + R * 0.24, R * 0.11, R * 0.065);
      x.fill();
    }
    x.globalAlpha = a;
  }
  x.strokeStyle = d.c.ink;
  if (open < 0.07) {
    if (round > 0.45) {
      // biquinho
      x.fillStyle = '#7a2440';
      ellipse(x, cx, cy, R * 0.055, R * 0.06);
      x.fill();
      x.lineWidth = R * 0.03;
      x.stroke();
    } else {
      x.lineWidth = R * 0.045;
      x.beginPath();
      x.moveTo(cx - w, cy - liftL);
      x.quadraticCurveTo(cx, cy + (smile - r.frown) * R * 0.09, cx + w, cy - liftR);
      x.stroke();
    }
  } else {
    x.save();
    x.beginPath();
    if (round > 0.45) {
      x.ellipse(cx, cy + h * 0.45, Math.max(R * 0.05, w * 0.7), h * 0.62 + R * 0.03, 0, 0, PI * 2);
    } else {
      x.moveTo(cx - w, cy - liftL);
      x.quadraticCurveTo(cx, cy - h * 0.18 + smile * R * 0.03, cx + w, cy - liftR);
      x.quadraticCurveTo(cx + w * 0.55, cy + h * 1.25, cx, cy + h * 1.3);
      x.quadraticCurveTo(cx - w * 0.55, cy + h * 1.25, cx - w, cy - liftL);
    }
    x.closePath();
    x.fillStyle = '#4a0f2a';
    x.fill();
    x.lineWidth = R * 0.035;
    x.stroke();
    x.clip();
    // língua
    x.fillStyle = '#ff6f92';
    ellipse(x, cx, cy + h * 1.25, w * 0.6, h * 0.5 + R * 0.02);
    x.fill();
    // dentinhos de cima
    if (smile > 0.25 || wide > 0.3) {
      x.fillStyle = '#ffffff';
      x.fillRect(cx - w, cy - R * 0.06, w * 2, Math.min(h * 0.28, R * 0.05) + R * 0.06);
    }
    x.restore();
  }
  if (e.sticker !== 'none') drawSticker(d, e.sticker, cx, cy, open);
}

/* ------------------------- adesivos ------------------------- */
function drawSticker(d: DC, id: StickerId, mx: number, my: number, open: number): void {
  const { x, R } = d;
  const r = E!.rig;
  const fx = r.yaw * R * 0.24;
  const fy = d.ey + r.pitch * R * 0.2;
  const top = -d.sh.top * R;
  x.save();
  x.lineJoin = 'round';
  x.lineCap = 'round';
  switch (id) {
    case 'oculos': {
      for (const s of [-1, 1]) {
        x.fillStyle = '#1b1430';
        x.beginPath();
        x.roundRect(fx + s * d.ex - R * 0.2, fy - R * 0.13, R * 0.4, R * 0.27, R * 0.1);
        x.fill();
        x.fillStyle = 'rgba(255,255,255,.35)';
        x.beginPath();
        x.roundRect(fx + s * d.ex - R * 0.14, fy - R * 0.09, R * 0.1, R * 0.06, R * 0.03);
        x.fill();
      }
      x.strokeStyle = '#1b1430';
      x.lineWidth = R * 0.05;
      x.beginPath();
      x.moveTo(fx - d.ex + R * 0.2, fy - R * 0.05);
      x.quadraticCurveTo(fx, fy - R * 0.11, fx + d.ex - R * 0.2, fy - R * 0.05);
      x.stroke();
      break;
    }
    case 'bigode': {
      const y = my - R * 0.07 - open * R * 0.04;
      x.fillStyle = '#4a2a14';
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(mx, y);
        x.bezierCurveTo(mx + s * R * 0.12, y - R * 0.09, mx + s * R * 0.3, y - R * 0.02, mx + s * R * 0.32, y - R * 0.1);
        x.bezierCurveTo(mx + s * R * 0.32, y + R * 0.06, mx + s * R * 0.1, y + R * 0.06, mx, y + R * 0.02);
        x.fill();
      }
      break;
    }
    case 'estrelas': {
      for (const s of [-1, 1]) star(x, fx * 0.6 + s * d.ex * 1.35, fy + R * 0.25, R * 0.08, '#ffd84a');
      break;
    }
    case 'coroa': {
      const y = top + R * 0.02;
      x.translate(fx * 0.4, y);
      x.rotate(-0.12);
      x.fillStyle = '#ffd84a';
      x.strokeStyle = '#b8780a';
      x.lineWidth = R * 0.03;
      x.beginPath();
      x.moveTo(-R * 0.3, 0);
      x.lineTo(-R * 0.34, -R * 0.3);
      x.lineTo(-R * 0.16, -R * 0.14);
      x.lineTo(0, -R * 0.36);
      x.lineTo(R * 0.16, -R * 0.14);
      x.lineTo(R * 0.34, -R * 0.3);
      x.lineTo(R * 0.3, 0);
      x.closePath();
      x.fill();
      x.stroke();
      for (const [gx, c] of [
        [-0.16, '#ff4f8b'],
        [0, '#4fc3ff'],
        [0.16, '#6dff8a'],
      ] as const) {
        x.fillStyle = c;
        ellipse(x, gx * R, -R * 0.07, R * 0.04, R * 0.04);
        x.fill();
      }
      break;
    }
    case 'festa': {
      x.translate(R * 0.18 + fx * 0.4, top + R * 0.06);
      x.rotate(0.3);
      const H = R * 0.62;
      x.save();
      x.beginPath();
      x.moveTo(-R * 0.22, 0);
      x.lineTo(0, -H);
      x.lineTo(R * 0.22, 0);
      x.closePath();
      x.fillStyle = '#4fc3ff';
      x.fill();
      x.clip();
      x.strokeStyle = '#ff4f8b';
      x.lineWidth = R * 0.07;
      for (let i = 0; i < 4; i++) {
        x.beginPath();
        x.moveTo(-R * 0.3, -i * H * 0.28);
        x.lineTo(R * 0.3, -i * H * 0.28 - H * 0.18);
        x.stroke();
      }
      x.restore();
      x.fillStyle = '#ffd84a';
      ellipse(x, 0, -H, R * 0.08, R * 0.08);
      x.fill();
      break;
    }
    case 'laco': {
      x.translate(R * 0.42 + fx * 0.4, top + R * 0.2);
      x.rotate(0.35);
      x.fillStyle = '#ff5fa2';
      x.strokeStyle = '#b8235f';
      x.lineWidth = R * 0.025;
      for (const s of [-1, 1]) {
        x.beginPath();
        x.moveTo(0, 0);
        x.quadraticCurveTo(s * R * 0.28, -R * 0.24, s * R * 0.3, 0);
        x.quadraticCurveTo(s * R * 0.28, R * 0.24, 0, 0);
        x.fill();
        x.stroke();
      }
      ellipse(x, 0, 0, R * 0.07, R * 0.07);
      x.fill();
      x.stroke();
      break;
    }
  }
  x.restore();
}

function star(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, c: string): void {
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -PI / 2 + (i * PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  x.closePath();
  x.fillStyle = c;
  x.fill();
}

let installed = false;
function install(): void {
  if (installed) return;
  installed = true;
  EYES[PART] = drawEyes;
  MOUTHS[PART] = drawMouth;
}

/** O Bloop do jogador (criador) ou, com skin clássica, um Bloop redondo nas cores dela. */
export function mirrorAvatar(): AvatarData {
  if (save.skin === 'custom' && save.avatar) {
    return { parts: { ...save.avatar.parts, eyes: PART, mouth: PART }, colors: { ...save.avatar.colors } };
  }
  const sk = skinById(save.skin);
  return {
    parts: { body: 'b_round', material: 'm_soft', pattern: 'p_none', eyes: PART, mouth: PART, head: 'h_none', face: 'f_none', back: 'k_none', aura: 'a_none' },
    colors: { primary: sk.light, secondary: sk.accent || sk.dark },
  };
}

/* ------------------------- cenários ------------------------- */
interface Star {
  x: number;
  y: number;
  r: number;
  p: number;
}
const stars: Star[] = [];
function seedStars(): void {
  if (stars.length) return;
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) stars.push({ x: rnd(), y: rnd(), r: 0.5 + rnd() * 1.6, p: rnd() * 6 });
}

const staticCache = new Map<string, HTMLCanvasElement>();
function staticLayer(scene: SceneId, W: number, H: number): HTMLCanvasElement {
  const key = `${scene}:${W}x${H}`;
  let c = staticCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  if (scene === 'quarto') {
    let g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#ffd6ec');
    g.addColorStop(1, '#e9c6ff');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // papel de parede de bolinhas
    x.fillStyle = 'rgba(255,255,255,.45)';
    for (let yy = 0; yy < H * 0.72; yy += W * 0.09)
      for (let xx = (yy / (W * 0.09)) % 2 ? W * 0.045 : 0; xx < W; xx += W * 0.09) {
        x.beginPath();
        x.arc(xx, yy, W * 0.012, 0, PI * 2);
        x.fill();
      }
    // janela
    const wx = W * 0.08;
    const wy = H * 0.1;
    const ww = W * 0.34;
    const wh = H * 0.2;
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(wx - 8, wy - 8, ww + 16, wh + 16, 14);
    x.fill();
    g = x.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#7fd3ff');
    g.addColorStop(1, '#c9f0ff');
    x.fillStyle = g;
    x.fillRect(wx, wy, ww, wh);
    x.fillStyle = '#ffffff';
    for (const [cx, cy, r] of [
      [0.3, 0.55, 0.16],
      [0.45, 0.5, 0.2],
      [0.6, 0.58, 0.14],
    ])
      ellipse(x, wx + ww * cx, wy + wh * cy, ww * r, wh * r * 0.8), x.fill();
    x.fillStyle = '#ffffff';
    x.fillRect(wx + ww / 2 - 3, wy, 6, wh);
    x.fillRect(wx, wy + wh / 2 - 3, ww, 6);
    // prateleira com coisinhas
    const sx = W * 0.6;
    const sy = H * 0.24;
    x.fillStyle = '#c98a5a';
    x.fillRect(sx, sy, W * 0.32, H * 0.012);
    x.fillStyle = '#7ad89a';
    ellipse(x, sx + W * 0.06, sy - H * 0.03, W * 0.04, H * 0.03);
    x.fill();
    x.fillStyle = '#ff9f4a';
    x.fillRect(sx + W * 0.03, sy - H * 0.015, W * 0.06, H * 0.015);
    for (const [bx, c, bh] of [
      [0.14, '#ff6f92', 0.05],
      [0.18, '#4fc3ff', 0.045],
      [0.22, '#ffd84a', 0.055],
    ] as const) {
      x.fillStyle = c;
      x.fillRect(sx + W * bx, sy - H * bh, W * 0.035, H * bh);
    }
    // chão de madeira
    const fy = H * 0.74;
    g = x.createLinearGradient(0, fy, 0, H);
    g.addColorStop(0, '#d9a272');
    g.addColorStop(1, '#b97c4f');
    x.fillStyle = g;
    x.fillRect(0, fy, W, H - fy);
    x.strokeStyle = 'rgba(120,70,30,.25)';
    x.lineWidth = 2;
    for (let i = 1; i < 6; i++) {
      x.beginPath();
      x.moveTo(0, fy + ((H - fy) * i) / 6);
      x.lineTo(W, fy + ((H - fy) * i) / 6);
      x.stroke();
    }
    // tapete
    x.fillStyle = '#9b7bff';
    ellipse(x, W / 2, H * 0.84, W * 0.42, H * 0.06);
    x.fill();
    x.fillStyle = '#b9a2ff';
    ellipse(x, W / 2, H * 0.84, W * 0.32, H * 0.042);
    x.fill();
  } else if (scene === 'palco') {
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0838');
    g.addColorStop(1, '#3a0f55');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // chão do palco
    const fy = H * 0.76;
    const fg = x.createLinearGradient(0, fy, 0, H);
    fg.addColorStop(0, '#8a4a2a');
    fg.addColorStop(1, '#4a2210');
    x.fillStyle = fg;
    x.fillRect(0, fy, W, H - fy);
    x.fillStyle = 'rgba(255,220,150,.18)';
    ellipse(x, W / 2, H * 0.83, W * 0.4, H * 0.05);
    x.fill();
    // cortinas
    for (const s of [0, 1]) {
      const cw = W * 0.2;
      const x0 = s ? W - cw : 0;
      const cg = x.createLinearGradient(x0, 0, x0 + cw, 0);
      for (let i = 0; i <= 6; i++) cg.addColorStop(i / 6, i % 2 ? '#a3122e' : '#d8213f');
      x.fillStyle = cg;
      x.beginPath();
      if (s) {
        x.moveTo(W, 0);
        x.lineTo(x0, 0);
        x.quadraticCurveTo(x0 + cw * 0.15, H * 0.5, x0 + cw * 0.45, H);
        x.lineTo(W, H);
      } else {
        x.moveTo(0, 0);
        x.lineTo(cw, 0);
        x.quadraticCurveTo(cw * 0.85, H * 0.5, cw * 0.55, H);
        x.lineTo(0, H);
      }
      x.fill();
    }
    // bambinela
    x.fillStyle = '#c01a38';
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(W, 0);
    x.lineTo(W, H * 0.06);
    for (let i = 6; i >= 0; i--) x.quadraticCurveTo(W * ((i + 0.5) / 6), H * 0.11, W * (i / 6), H * 0.06);
    x.fill();
    x.fillStyle = '#ffd84a';
    x.fillRect(0, H * 0.055, W, 4);
  } else {
    const g = x.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.5, H * 0.75);
    g.addColorStop(0, '#2b1a6e');
    g.addColorStop(1, '#070418');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    for (const [cx, cy, r, c] of [
      [0.2, 0.25, 0.35, 'rgba(255,90,200,.18)'],
      [0.85, 0.7, 0.4, 'rgba(80,200,255,.16)'],
    ] as const) {
      const ng = x.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, W * r);
      ng.addColorStop(0, c);
      ng.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = ng;
      x.fillRect(0, 0, W, H);
    }
    // planeta com anel
    const px = W * 0.82;
    const py = H * 0.16;
    const pr = W * 0.11;
    x.strokeStyle = 'rgba(255,220,160,.8)';
    x.lineWidth = W * 0.012;
    x.beginPath();
    x.ellipse(px, py, pr * 1.7, pr * 0.45, -0.35, PI * 0.95, PI * 2.05);
    x.stroke();
    const pg = x.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    pg.addColorStop(0, '#ffb86b');
    pg.addColorStop(1, '#d9467a');
    x.fillStyle = pg;
    ellipse(x, px, py, pr, pr);
    x.fill();
    x.beginPath();
    x.ellipse(px, py, pr * 1.7, pr * 0.45, -0.35, -PI * 0.05, PI * 0.95);
    x.stroke();
    // luazinha
    x.fillStyle = '#d8d4ff';
    ellipse(x, W * 0.14, H * 0.62, W * 0.05, W * 0.05);
    x.fill();
  }
  staticCache.set(key, c);
  return c;
}

export function drawScene(x: CanvasRenderingContext2D, scene: SceneId, W: number, H: number, t: number): void {
  x.drawImage(staticLayer(scene, W, H), 0, 0);
  if (scene === 'quarto') {
    // varal de luzinhas
    const n = 9;
    x.strokeStyle = 'rgba(90,60,120,.5)';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(0, H * 0.05);
    x.quadraticCurveTo(W / 2, H * 0.11, W, H * 0.05);
    x.stroke();
    const cs = ['#ff4f8b', '#ffd84a', '#4fc3ff', '#6dff8a'];
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const yy = H * 0.05 + (1 - (2 * u - 1) ** 2) * H * 0.03;
      x.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7);
      x.fillStyle = cs[i % cs.length];
      ellipse(x, W * u, yy + 7, 5, 7);
      x.fill();
    }
    x.globalAlpha = 1;
  } else if (scene === 'palco') {
    // holofotes balançando
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (const [ox, ph, c] of [
      [0.28, 0, 'rgba(255,230,140,'],
      [0.72, 2, 'rgba(160,200,255,'],
    ] as const) {
      const a = Math.sin(t * 0.7 + ph) * 0.18;
      const sx = W * ox;
      const tx = W / 2 + Math.sin(a) * W * 0.9;
      const g = x.createLinearGradient(sx, 0, tx, H * 0.85);
      g.addColorStop(0, c + '0.35)');
      g.addColorStop(1, c + '0)');
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(sx - 6, 0);
      x.lineTo(sx + 6, 0);
      x.lineTo(tx + W * 0.22, H * 0.85);
      x.lineTo(tx - W * 0.22, H * 0.85);
      x.closePath();
      x.fill();
    }
    x.restore();
  } else {
    seedStars();
    x.fillStyle = '#ffffff';
    for (const s of stars) {
      x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.3 + s.p));
      x.fillRect(s.x * W, s.y * H, s.r, s.r);
    }
    x.globalAlpha = 1;
    // estrela cadente de vez em quando
    const k = (t % 7) / 1.2;
    if (k < 1) {
      const sx = W * (0.9 - k * 0.6);
      const sy = H * (0.05 + k * 0.2);
      const g = x.createLinearGradient(sx, sy, sx + 60, sy - 20);
      g.addColorStop(0, 'rgba(255,255,255,.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.strokeStyle = g;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(sx, sy);
      x.lineTo(sx + 60, sy - 20);
      x.stroke();
    }
  }
}

/* ------------------------- quadro completo ------------------------- */
export interface FrameState {
  t: number;
  scene: SceneId;
  expr: Expr;
  avatar: AvatarData;
  /** mola do "pulinho" ao falar */
  bounce: number;
}

const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.45, ly: -0.7 };

export function drawFrame(x: CanvasRenderingContext2D, W: number, H: number, f: FrameState): void {
  install();
  drawScene(x, f.scene, W, H, f.t);
  const r = f.expr.rig;
  const R = Math.min(W * 0.3, H * 0.19);
  const cx = W / 2 + r.yaw * R * 0.3;
  const floorY = f.scene === 'espaco' ? H * 0.8 : H * 0.8;
  const cy = H * 0.56 + r.pitch * R * 0.18 + Math.sin(f.t * 2.1) * R * 0.02;
  // sombra no chão
  x.fillStyle = f.scene === 'espaco' ? 'rgba(140,120,255,.18)' : 'rgba(40,10,60,.22)';
  ellipse(x, cx, floorY, R * 0.9 * (1 - f.bounce * 0.3), R * 0.14);
  x.fill();
  E = f.expr;
  x.save();
  x.translate(cx, cy - f.bounce * R * 0.12);
  x.rotate(r.roll * 0.85);
  pose.t = f.t;
  pose.lookX = r.lookX;
  pose.lookY = r.lookY;
  // squash & stretch: abrir a boca estica, o pulinho achata
  pose.sx = (1 - Math.abs(r.yaw) * 0.1) * (1 - f.expr.open * 0.03 + f.bounce * 0.06);
  pose.sy = 1 + f.expr.open * 0.06 - f.bounce * 0.05 - r.pitch * 0.05;
  drawAvatar(x, f.avatar, R, pose);
  x.restore();
  E = null;
  watermark(x, W, H);
}

export function watermark(x: CanvasRenderingContext2D, W: number, H: number): void {
  const fs = Math.round(W * 0.038);
  x.save();
  x.font = gameFont(700, fs);
  const label = 'Bloop World';
  const tw = x.measureText(label).width;
  const pw = tw + fs * 2.1;
  const ph = fs * 1.7;
  const px = W - pw - W * 0.035;
  const py = H - ph - H * 0.025;
  x.fillStyle = 'rgba(30,10,70,.55)';
  x.beginPath();
  x.roundRect(px, py, pw, ph, ph / 2);
  x.fill();
  star(x, px + fs * 0.85, py + ph / 2, fs * 0.5, '#ffd84a');
  x.fillStyle = '#ffffff';
  x.textBaseline = 'middle';
  x.fillText(label, px + fs * 1.5, py + ph / 2 + 1);
  x.restore();
}

/** Foto com moldura fofa "Bloop World" (PNG). */
export function composeShot(src: HTMLCanvasElement): Promise<Blob | null> {
  const W = src.width;
  const H = src.height;
  const pad = Math.round(W * 0.06);
  const foot = Math.round(W * 0.16);
  const c = document.createElement('canvas');
  c.width = W + pad * 2;
  c.height = H + pad * 2 + foot;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, c.width, c.height);
  g.addColorStop(0, '#ff8fd8');
  g.addColorStop(0.5, '#b388ff');
  g.addColorStop(1, '#5ef0ff');
  x.fillStyle = g;
  x.beginPath();
  x.roundRect(0, 0, c.width, c.height, pad * 1.2);
  x.fill();
  // bolinhas e estrelas na moldura
  for (let i = 0; i < 26; i++) {
    const u = (i * 0.618) % 1;
    const side = i % 4;
    const px = side < 2 ? u * c.width : side === 2 ? pad * 0.5 : c.width - pad * 0.5;
    const py = side < 2 ? (side ? c.height - foot * 0.15 : pad * 0.5) : u * c.height;
    if (i % 3) {
      x.fillStyle = 'rgba(255,255,255,.55)';
      ellipse(x, px, py, pad * 0.14, pad * 0.14);
      x.fill();
    } else star(x, px, py, pad * 0.3, '#ffe680');
  }
  x.save();
  x.beginPath();
  x.roundRect(pad, pad, W, H, pad * 0.8);
  x.clip();
  x.drawImage(src, pad, pad);
  x.restore();
  x.strokeStyle = '#ffffff';
  x.lineWidth = Math.max(3, pad * 0.12);
  x.beginPath();
  x.roundRect(pad, pad, W, H, pad * 0.8);
  x.stroke();
  // faixa de baixo
  const fs = Math.round(foot * 0.42);
  x.font = gameFont(700, fs);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const ty = pad + H + (pad + foot) / 2;
  x.lineWidth = fs * 0.22;
  x.strokeStyle = '#2a0b5c';
  x.strokeText('Bloop World', c.width / 2, ty);
  x.fillStyle = '#ffffff';
  x.fillText('Bloop World', c.width / 2, ty);
  star(x, c.width / 2 - x.measureText('Bloop World').width / 2 - fs * 0.8, ty, fs * 0.45, '#ffd84a');
  star(x, c.width / 2 + x.measureText('Bloop World').width / 2 + fs * 0.8, ty, fs * 0.45, '#ffd84a');
  return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
}
