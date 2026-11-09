/* Vitrine do hub: bancada com panela fumegante, frigideira com chaminha e
 * um Bloop cozinheiro jogando uma panqueca. Vetor simples, sem cache. */
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById } from '../../game/skins';

const INK = '#2a0b5c';
const TAU = Math.PI * 2;
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: -0.6, sx: 1, sy: 1, mood: 'happy', lx: -0.55, ly: -0.83 };

function rr(x: CanvasRenderingContext2D, a: number, b: number, w: number, h: number, r: number, fill: string, lw: number): void {
  x.beginPath();
  x.roundRect(a, b, w, h, r);
  x.fillStyle = fill;
  x.fill();
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
}

export function drawCozinhaShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const S = Math.min(w / 6, h / 3.6);
  const cx = w / 2;
  const by = h * 0.72;
  const lw = Math.max(1.5, S * 0.05);
  x.save();
  // azulejos atrás
  x.globalAlpha = 0.18;
  x.fillStyle = '#ffffff';
  for (let i = -4; i <= 4; i++) for (let j = 0; j < 3; j++) x.fillRect(cx + i * S * 0.7 - S * 0.32, by - S * 2.6 + j * S * 0.7, S * 0.62, S * 0.62);
  x.globalAlpha = 1;
  // bancada
  rr(x, cx - S * 2.9, by, S * 5.8, S * 0.9, S * 0.14, '#a9b2c8', lw);
  rr(x, cx - S * 3, by - S * 0.28, S * 6, S * 0.4, S * 0.12, '#eef2fa', lw);
  // fogão + panela
  const px = cx - S * 1.7;
  rr(x, px - S * 0.75, by - S * 0.95, S * 1.5, S * 0.7, S * 0.22, '#ff5a6e', lw);
  rr(x, px - S * 0.85, by - S * 1.12, S * 1.7, S * 0.24, S * 0.1, '#dcd6f0', lw);
  for (let i = 0; i < 3; i++) {
    const ph = (time * 0.8 + i / 3) % 1;
    x.globalAlpha = (1 - ph) * 0.8;
    x.beginPath();
    x.arc(px + Math.sin(time * 2 + i * 2) * S * 0.25 + (i - 1) * S * 0.3, by - S * 1.3 - ph * S * 1.1, S * (0.14 + ph * 0.18), 0, TAU);
    x.fillStyle = '#ffffff';
    x.fill();
  }
  x.globalAlpha = 1;
  // frigideira com chama
  const fx = cx + S * 1.75;
  for (let i = 0; i < 3; i++) {
    const fl = 0.7 + Math.sin(time * 14 + i * 2) * 0.25;
    x.beginPath();
    x.ellipse(fx + (i - 1) * S * 0.28, by - S * 0.36, S * 0.13, S * 0.26 * fl, 0, 0, TAU);
    x.fillStyle = i === 1 ? '#ffd84a' : '#ff7a2e';
    x.fill();
  }
  x.beginPath();
  x.ellipse(fx, by - S * 0.52, S * 0.8, S * 0.2, 0, 0, TAU);
  x.fillStyle = '#3b3550';
  x.fill();
  x.lineWidth = lw;
  x.strokeStyle = INK;
  x.stroke();
  rr(x, fx + S * 0.75, by - S * 0.6, S * 0.8, S * 0.16, S * 0.08, '#7a4fd1', lw);
  // panqueca voando
  const ph = (time * 0.9) % 1;
  const py = by - S * 0.65 - Math.sin(ph * Math.PI) * S * 1.6;
  x.save();
  x.translate(fx, py);
  x.scale(1, 0.35 + Math.abs(Math.cos(ph * TAU)) * 0.65);
  x.beginPath();
  x.arc(0, 0, S * 0.42, 0, TAU);
  x.fillStyle = '#ffcf6b';
  x.fill();
  x.lineWidth = lw;
  x.stroke();
  x.restore();
  // chef
  pose.t = time;
  pose.blink = Math.sin(time * 1.3) > 0.97 ? 1 : 0;
  const R = S * 0.7;
  x.save();
  x.translate(cx, by - S * 0.32 - R * 0.95 - Math.abs(Math.sin(time * 3)) * S * 0.12);
  drawPlayer(x, skinById('bloop'), R, pose);
  // chapéu
  x.fillStyle = '#fff';
  x.strokeStyle = INK;
  x.lineWidth = lw;
  x.beginPath();
  x.arc(-R * 0.32, -R * 1.3, R * 0.3, 0, TAU);
  x.arc(R * 0.32, -R * 1.3, R * 0.3, 0, TAU);
  x.arc(0, -R * 1.48, R * 0.36, 0, TAU);
  x.fill();
  x.stroke();
  x.fill();
  rr(x, -R * 0.5, -R * 1.16, R, R * 0.3, R * 0.08, '#ff5cc8', lw);
  x.restore();
  x.restore();
}
