/* Registro da "Bloop Banda" no hub (leve: o jogo é carregado sob demanda). */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById } from '../../game/skins';

export function registerBand(): void {
  registerGame({
    id: 'band',
    get name() {
      return t('band.name', 'Bloop Banda');
    },
    get tagline() {
      return t('band.tagline', 'Monte sua banda e toque no ritmo!');
    },
    icon: 'music',
    theme: { bg: ['#3a1a7a', '#120a2e'], accent: '#ff5fa2', accent2: '#ffd23f', title: ['#fff1b0', '#ff8fd8'] },
    drawShowcase,
    online: true,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const { BandGame } = await import('./game');
      return new BandGame(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */

const TAU = Math.PI * 2;
const LANES = ['#ff5fa2', '#ffb627', '#3ddc97', '#4cc9f0', '#a974ff'];
const PATTERN = [0, 2, 1, 3, 4, 2, 0, 3, 1, 4, 2, 2];
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.3, sx: 1, sy: 1, mood: 'happy', lx: -0.55, ly: -0.83 };

/** Pista em perspectiva com notas descendo e o Bloop pulando de tecla em tecla. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const bg = x.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1a0a40');
  bg.addColorStop(1, '#3a1a7a');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  const bpm = 120;
  const beat = (time * bpm) / 60;
  const pulse = 1 - (beat % 1);
  // luzes
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const lx = ((i + 0.5) / 4) * w;
    x.globalAlpha = 0.1 + pulse * 0.08;
    x.fillStyle = LANES[i];
    x.beginPath();
    x.moveTo(lx, 0);
    x.lineTo(lx + Math.sin(time + i) * w * 0.15 - w * 0.08, h);
    x.lineTo(lx + Math.sin(time + i) * w * 0.15 + w * 0.08, h);
    x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  // pista
  const cx = w / 2;
  const fy = h * 0.06;
  const hy = h * 0.8;
  const wb = Math.min(w * 0.8, h * 1.2);
  const wt = wb * 0.32;
  const proj = (z: number): [number, number] => {
    const q = (1 / (1 + 2.3 * z) - 1 / 3.3) / (1 - 1 / 3.3);
    return [fy + (hy - fy) * q, (wt + (wb - wt) * q) / 2];
  };
  const [by, bh] = proj(-0.12);
  x.fillStyle = '#1c0b45';
  x.strokeStyle = '#7b5cff';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(cx - wt / 2, fy);
  x.lineTo(cx + wt / 2, fy);
  x.lineTo(cx + bh, by);
  x.lineTo(cx - bh, by);
  x.closePath();
  x.fill();
  x.stroke();
  for (let b = Math.ceil(beat); b < beat + 2; b++) {
    const [y, hw] = proj((b - beat) / 2);
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(cx - hw, y - 1, hw * 2, 2);
  }
  // notas
  for (let b = Math.ceil(beat); b < beat + 2; b++) {
    const lane = PATTERN[((b % PATTERN.length) + PATTERN.length) % PATTERN.length];
    const [y, hw] = proj((b - beat) / 2);
    const lx = cx - hw + ((lane + 0.5) / 5) * hw * 2;
    const r = (hw * 2) / 5 * 0.4;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.ellipse(lx, y, r + 2, r * 0.5 + 2, 0, 0, TAU);
    x.fill();
    x.fillStyle = LANES[lane];
    x.beginPath();
    x.ellipse(lx, y, r, r * 0.5, 0, 0, TAU);
    x.fill();
  }
  // teclas
  const [ky, kh] = proj(0);
  const lw = (kh * 2) / 5;
  const cur = Math.floor(beat);
  for (let l = 0; l < 5; l++) {
    const lx = cx - kh + (l + 0.5) * lw;
    const pressed = PATTERN[((cur % PATTERN.length) + PATTERN.length) % PATTERN.length] === l && beat % 1 < 0.2;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.roundRect(lx - lw * 0.42, ky - lw * 0.1 + (pressed ? 3 : 0), lw * 0.84, lw * 0.32, 6);
    x.fill();
    x.fillStyle = pressed ? '#fff' : LANES[l];
    x.beginPath();
    x.roundRect(lx - lw * 0.4, ky - lw * 0.08 + (pressed ? 3 : 0), lw * 0.8, lw * 0.18, 5);
    x.fill();
  }
  // Bloop pulando de tecla em tecla, pousando no tempo
  const from = PATTERN[((cur % PATTERN.length) + PATTERN.length) % PATTERN.length];
  const to = PATTERN[(((cur + 1) % PATTERN.length) + PATTERN.length) % PATTERN.length];
  const k = beat % 1;
  const hopK = Math.max(0, (k - 0.55) / 0.45);
  const pos = from + (to - from) * (hopK * hopK * (3 - 2 * hopK));
  const R = Math.min(lw * 0.36, h * 0.09);
  const arc = Math.sin(hopK * Math.PI) * R * 1.5;
  const land = k < 0.15 ? 1 - k / 0.15 : 0;
  pose.t = time;
  pose.sx = 1 + land * 0.25;
  pose.sy = 1 - land * 0.2;
  pose.lookX = (to - from) * 0.3;
  const bx = cx - kh + (pos + 0.5) * lw;
  const byy = ky - lw * 0.08 - R * 0.86 * pose.sy - arc;
  x.fillStyle = 'rgba(0,0,0,.3)';
  x.beginPath();
  x.ellipse(bx, ky, R * 0.8, R * 0.2, 0, 0, TAU);
  x.fill();
  x.save();
  x.translate(bx, byy);
  x.rotate((to - from) * 0.1 * Math.sin(hopK * Math.PI));
  try {
    drawPlayer(x, skinById('bloop'), R, pose);
  } catch {
    x.fillStyle = '#ff8fd8';
    x.beginPath();
    x.arc(0, 0, R, 0, TAU);
    x.fill();
  }
  x.restore();
}
