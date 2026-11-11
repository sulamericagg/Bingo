/* Registro da "Jangada Bloop" no hub. Só a vitrine (leve) entra no pacote principal;
 * o jogo (three.js) é carregado sob demanda. */
import { registerGame } from '../../hub/registry';
import { t } from '../../i18n';
import { registerPartyGame } from '../../party/contract';

export function registerJangada(): void {
  registerGame({
    id: 'jangada',
    get name() {
      return t('jangada.name', 'Jangada Bloop');
    },
    get tagline() {
      return t('jangada.tagline', 'Pesque, construa e sobreviva no mar!');
    },
    icon: 'drop',
    theme: { bg: ['#5ec8ff', '#0a4a8a'], accent: '#ffb03a', accent2: '#ffd34a', title: ['#fff6d6', '#ffd34a'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
  // GRUPO: o líder aperta JOGAR e todos sobem na mesma jangada (game.ts → partySeat)
  registerPartyGame('jangada', { mode: 'room' });
}

const TAU = Math.PI * 2;
/** Vitrine: jangadinha balançando, Bloop joga o gancho e puxa uma tábua; barbatana roxa ao fundo. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const hz = h * 0.48;
  const sky = x.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#3a9ae8');
  sky.addColorStop(1, '#c8ecff');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, hz);
  // sol + nuvens
  x.fillStyle = '#fff3b0';
  x.beginPath();
  x.arc(w * 0.82, h * 0.16, h * 0.07, 0, TAU);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)';
  for (let i = 0; i < 3; i++) {
    const cx = ((w * (0.15 + i * 0.33) + time * 8) % (w * 1.2)) - w * 0.1;
    const cy = h * (0.12 + (i % 2) * 0.08);
    for (let k = 0; k < 3; k++) {
      x.beginPath();
      x.arc(cx + k * h * 0.05, cy - (k === 1 ? h * 0.02 : 0), h * 0.04, 0, TAU);
      x.fill();
    }
  }
  // mar
  const sea = x.createLinearGradient(0, hz, 0, h);
  sea.addColorStop(0, '#1fb2cf');
  sea.addColorStop(1, '#064a94');
  x.fillStyle = sea;
  x.fillRect(0, hz, w, h - hz);
  x.strokeStyle = 'rgba(255,255,255,.35)';
  x.lineWidth = 2;
  for (let r = 0; r < 6; r++) {
    const y = hz + (r + 1) * (h - hz) * 0.15;
    x.beginPath();
    for (let s = 0; s <= 20; s++) x.lineTo((s / 20) * w, y + Math.sin(s * 1.3 + time * 2 + r) * 3);
    x.stroke();
  }
  // barbatana do Mordelão
  const fx = ((time * 30) % (w * 1.4)) - w * 0.2;
  x.fillStyle = '#8a7ae8';
  x.beginPath();
  x.moveTo(fx, hz + h * 0.12);
  x.lineTo(fx + h * 0.05, hz + h * 0.04);
  x.lineTo(fx + h * 0.08, hz + h * 0.12);
  x.fill();
  // jangada
  const bob = Math.sin(time * 1.6) * h * 0.012;
  const rx = w * 0.32;
  const ry = h * 0.7 + bob;
  const tw = w * 0.34;
  x.save();
  x.translate(rx, ry);
  x.rotate(Math.sin(time * 1.2) * 0.03);
  for (let i = 0; i < 6; i++) {
    x.fillStyle = i % 2 ? '#c8935a' : '#d8a468';
    x.fillRect(-tw / 2 + (i * tw) / 6, -h * 0.03, tw / 6 - 2, h * 0.06);
  }
  x.fillStyle = '#9a6a3a';
  x.fillRect(-tw / 2, h * 0.02, tw, h * 0.02);
  // vela
  x.fillStyle = '#8a5a2a';
  x.fillRect(tw * 0.25, -h * 0.34, 4, h * 0.32);
  x.fillStyle = '#fff3d6';
  x.beginPath();
  x.moveTo(tw * 0.25 + 4, -h * 0.32);
  x.quadraticCurveTo(tw * 0.25 + h * 0.16, -h * 0.2, tw * 0.25 + 4, -h * 0.06);
  x.fill();
  x.fillStyle = '#ff8ab8';
  x.fillRect(tw * 0.25 + 4, -h * 0.22, h * 0.07, h * 0.04);
  // fogueira
  x.fillStyle = '#ff8a3a';
  x.beginPath();
  x.moveTo(-tw * 0.3, -h * 0.03);
  x.quadraticCurveTo(-tw * 0.3 + h * 0.025, -h * 0.1 - Math.sin(time * 12) * 4, -tw * 0.3 + h * 0.05, -h * 0.03);
  x.fill();
  // Bloop
  const r = h * 0.07;
  const by = -h * 0.03 - r;
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(0, by, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(0, by, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(r * 0.25, by - r * 0.15, r * 0.24, 0, TAU);
  x.arc(r * 0.7, by - r * 0.15, r * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(r * 0.32, by - r * 0.12, r * 0.12, 0, TAU);
  x.arc(r * 0.77, by - r * 0.12, r * 0.12, 0, TAU);
  x.fill();
  x.restore();
  // gancho voando e voltando com uma tábua
  const cyc = (time % 4) / 4;
  const hx0 = rx + r * 0.9;
  const hy0 = ry - h * 0.1;
  const far = w * 0.82;
  let hx: number;
  let hy: number;
  if (cyc < 0.35) {
    const k = cyc / 0.35;
    hx = hx0 + (far - hx0) * k;
    hy = hy0 - Math.sin(k * Math.PI) * h * 0.22 + (hz + h * 0.14 - hy0) * k;
  } else {
    const k = (cyc - 0.35) / 0.65;
    hx = far + (hx0 + w * 0.1 - far) * k;
    hy = hz + h * 0.14 + Math.sin(time * 6) * 2;
  }
  x.strokeStyle = '#fff3c8';
  x.lineWidth = 1.5;
  x.beginPath();
  x.moveTo(hx0, hy0);
  x.quadraticCurveTo((hx0 + hx) / 2, Math.max(hy0, hy) + h * 0.03, hx, hy);
  x.stroke();
  x.fillStyle = '#c8d0e0';
  x.beginPath();
  x.arc(hx, hy, 4, 0, TAU);
  x.fill();
  // tábua e barril boiando
  const plankX = cyc < 0.35 ? far : hx;
  x.fillStyle = '#d8a060';
  x.fillRect(plankX - 12, hz + h * 0.15 + Math.sin(time * 2) * 2, 24, 6);
  x.fillStyle = '#c87a3a';
  const bx = ((w * 0.6 - time * 12) % w + w) % w;
  x.fillRect(bx, hz + h * 0.22 + Math.sin(time * 2 + 1) * 2, 16, 12);
  x.fillStyle = '#6a6a7a';
  x.fillRect(bx + 3, hz + h * 0.22 + Math.sin(time * 2 + 1) * 2, 2, 12);
  x.fillRect(bx + 11, hz + h * 0.22 + Math.sin(time * 2 + 1) * 2, 2, 12);
}
