/* ============================================================
 *  GARIMPO BRUTO — registro no hub. Leve: o jogo (e o three.js) vem sob demanda.
 *  Vitrine: escavadeira cavando a encosta de terra vermelha, pepitas brilhando.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';
import { registerPartyGame } from '../../party/contract';

const TAU = Math.PI * 2;

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5fb0ea');
  sky.addColorStop(1, '#f6d9a6');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // montanha e mata
  x.fillStyle = '#4c8a34';
  x.beginPath();
  x.moveTo(0, h * 0.62);
  for (let i = 0; i <= 12; i++) x.lineTo((i / 12) * w, h * (0.5 + Math.sin(i * 1.7) * 0.05));
  x.lineTo(w, h);
  x.lineTo(0, h);
  x.fill();
  x.fillStyle = '#b8562a';
  x.beginPath();
  x.moveTo(w * 0.35, h);
  x.lineTo(w * 0.62, h * 0.3);
  x.lineTo(w * 0.78, h * 0.42);
  x.lineTo(w * 1.05, h * 0.36);
  x.lineTo(w * 1.05, h);
  x.fill();
  // chão vermelho
  x.fillStyle = '#c4632e';
  x.fillRect(0, h * 0.8, w, h * 0.2);
  x.fillStyle = '#9b4620';
  for (let i = 0; i < 9; i++) x.fillRect(((i * 97) % w) - 10, h * 0.84 + (i % 3) * 8, 26, 4);
  // escavadeira
  const s = Math.min(w, h) / 6;
  const bx = w * 0.3;
  const by = h * 0.8;
  const dig = (Math.sin(time * 1.4) + 1) / 2;
  x.save();
  x.translate(bx, by);
  x.fillStyle = '#2b2d31';
  x.beginPath();
  x.roundRect(-s * 1.1, -s * 0.35, s * 2.2, s * 0.4, s * 0.2);
  x.fill();
  x.fillStyle = '#f2b20f';
  x.fillRect(-s * 0.9, -s * 0.85, s * 1.5, s * 0.5);
  x.fillRect(-s * 0.2, -s * 1.5, s * 0.75, s * 0.7);
  x.fillStyle = '#2f4858';
  x.fillRect(-s * 0.1, -s * 1.42, s * 0.55, s * 0.4);
  // lança e braço
  const a1 = -0.9 + dig * 0.35;
  const a2 = 1.6 - dig * 0.5;
  x.strokeStyle = '#f2b20f';
  x.lineCap = 'round';
  x.lineWidth = s * 0.22;
  const p0 = [s * 0.5, -s * 0.8];
  const p1 = [p0[0] + Math.cos(a1) * s * 1.6, p0[1] + Math.sin(a1) * s * 1.6];
  const p2 = [p1[0] + Math.cos(a1 + a2) * s * 1.2, p1[1] + Math.sin(a1 + a2) * s * 1.2];
  x.beginPath();
  x.moveTo(p0[0], p0[1]);
  x.lineTo(p1[0], p1[1]);
  x.lineTo(p2[0], p2[1]);
  x.stroke();
  x.fillStyle = '#c98a08';
  x.beginPath();
  x.arc(p2[0], p2[1], s * 0.28, 0, Math.PI);
  x.fill();
  x.restore();
  // pepitas brilhando
  for (let i = 0; i < 7; i++) {
    const px = w * (0.55 + ((i * 0.13) % 0.4));
    const py = h * (0.83 + ((i * 0.07) % 0.12));
    const k = (Math.sin(time * 3 + i * 1.9) + 1) / 2;
    x.fillStyle = '#ffcf2e';
    x.beginPath();
    x.arc(px, py, s * 0.07 + k * s * 0.03, 0, TAU);
    x.fill();
    x.fillStyle = `rgba(255,255,255,${k})`;
    x.fillRect(px - s * 0.15 * k, py - 1, s * 0.3 * k, 2);
    x.fillRect(px - 1, py - s * 0.15 * k, 2, s * 0.3 * k);
  }
}

export function registerGarimpo(): void {
  registerPartyGame('garimpo', { mode: 'room' }); // grupo: todos na sala do líder (gancho em game.ts → launch)
  registerGame({
    id: 'garimpo',
    get name() {
      return t('gb.name', 'Garimpo Bruto');
    },
    get tagline() {
      return t('gb.tagline', 'Ache ouro, cave, lave e fique rico com suas máquinas!');
    },
    icon: 'gem-pile',
    theme: { bg: ['#c4632e', '#5a2a10'], accent: '#f2b20f', accent2: '#3cbf5a', title: ['#fff3c0', '#ffcf2e'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
