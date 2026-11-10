/* Registro do minigame "Pouso Forçado" no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo (e o three.js) carregam sob demanda. */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';

export function registerVoo(): void {
  registerGame({
    id: 'voo',
    get name() {
      return t('voo.name', 'Pouso Forçado');
    },
    get tagline() {
      return t('voo.tagline', 'O piloto desmaiou! Apaguem fogos, acalmem todos e pousem o avião.');
    },
    icon: 'rocket',
    theme: { bg: ['#ffb36b', '#6a3fb8'], accent: '#ff5cae', accent2: '#ffd34a', title: ['#fff6d6', '#ffd34a'] },
    drawShowcase,
    online: false,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */

const TAU = Math.PI * 2;
const INK = '#2a0b5c';

/** Avião do Bloop Air cruzando o pôr do sol; uma janela solta fumacinha e um Bloop acena. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#5a4ab8');
  sky.addColorStop(0.55, '#ff9a8a');
  sky.addColorStop(1, '#ffd08a');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // sol
  const sg = x.createRadialGradient(w * 0.78, h * 0.72, 0, w * 0.78, h * 0.72, h * 0.4);
  sg.addColorStop(0, 'rgba(255,240,190,1)');
  sg.addColorStop(0.25, 'rgba(255,220,150,0.8)');
  sg.addColorStop(1, 'rgba(255,200,150,0)');
  x.fillStyle = sg;
  x.fillRect(0, 0, w, h);
  // nuvens passando
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 0.23 - time * 0.06 * (1 + (i % 3) * 0.4)) % 1.3 + 1.3) % 1.3 - 0.15;
    const cy = 0.2 + ((i * 37) % 60) / 100;
    x.fillStyle = `rgba(255,240,245,${0.55 + (i % 2) * 0.25})`;
    x.beginPath();
    const r = h * (0.05 + (i % 3) * 0.025);
    x.arc(cx * w, cy * h, r, 0, TAU);
    x.arc(cx * w + r, cy * h + r * 0.2, r * 0.8, 0, TAU);
    x.arc(cx * w - r, cy * h + r * 0.25, r * 0.7, 0, TAU);
    x.fill();
  }
  // avião
  const bob = Math.sin(time * 1.6) * h * 0.02;
  const tilt = Math.sin(time * 1.1) * 0.05;
  x.save();
  x.translate(w * 0.45, h * 0.5 + bob);
  x.rotate(tilt);
  const L = Math.min(w * 0.7, h * 1.6);
  const R = L * 0.09;
  x.lineJoin = 'round';
  x.lineWidth = Math.max(2, R * 0.16);
  x.strokeStyle = INK;
  // asa de trás
  x.fillStyle = '#d9dde8';
  x.beginPath();
  x.moveTo(-L * 0.05, -R * 0.2);
  x.lineTo(L * 0.12, -R * 1.9);
  x.lineTo(L * 0.2, -R * 1.9);
  x.lineTo(L * 0.12, -R * 0.2);
  x.fill();
  x.stroke();
  // fuselagem
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(-L * 0.5, R * 0.1);
  x.quadraticCurveTo(-L * 0.5, -R, -L * 0.36, -R);
  x.lineTo(L * 0.3, -R);
  x.quadraticCurveTo(L * 0.44, -R * 1.1, L * 0.5, -R * 1.8);
  x.lineTo(L * 0.5, R * 0.1);
  x.quadraticCurveTo(L * 0.4, R, L * 0.25, R);
  x.lineTo(-L * 0.36, R);
  x.quadraticCurveTo(-L * 0.5, R, -L * 0.5, R * 0.1);
  x.fill();
  x.stroke();
  // faixa
  x.fillStyle = '#ff5cae';
  x.fillRect(-L * 0.4, R * 0.15, L * 0.75, R * 0.22);
  // deriva com carinha
  x.fillStyle = '#8a5cff';
  x.beginPath();
  x.moveTo(L * 0.3, -R);
  x.lineTo(L * 0.42, -R * 3.1);
  x.lineTo(L * 0.52, -R * 3.1);
  x.lineTo(L * 0.5, -R);
  x.fill();
  x.stroke();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(L * 0.455, -R * 2.2, R * 0.55, 0, TAU);
  x.fill();
  x.fillStyle = INK;
  x.beginPath();
  x.arc(L * 0.435, -R * 2.3, R * 0.11, 0, TAU);
  x.arc(L * 0.48, -R * 2.3, R * 0.11, 0, TAU);
  x.fill();
  // janelas com Bloops
  for (let i = 0; i < 8; i++) {
    const wx = -L * 0.3 + i * L * 0.075;
    x.fillStyle = '#7ad8ff';
    x.beginPath();
    x.ellipse(wx, -R * 0.35, R * 0.18, R * 0.25, 0, 0, TAU);
    x.fill();
    x.fillStyle = ['#ff8fd8', '#9dffcb', '#fff38a', '#8fe9ff'][i % 4];
    const pop = i === 3 ? Math.max(0, Math.sin(time * 3)) * R * 0.12 : 0;
    x.beginPath();
    x.arc(wx, -R * 0.28 - pop, R * 0.13, 0, TAU);
    x.fill();
  }
  // cabine
  x.fillStyle = '#2a3050';
  x.beginPath();
  x.moveTo(-L * 0.47, -R * 0.35);
  x.quadraticCurveTo(-L * 0.45, -R * 0.85, -L * 0.38, -R * 0.82);
  x.lineTo(-L * 0.38, -R * 0.35);
  x.fill();
  // asa da frente + motor
  x.fillStyle = '#e8ecf6';
  x.beginPath();
  x.moveTo(-L * 0.08, R * 0.4);
  x.lineTo(L * 0.1, R * 2.2);
  x.lineTo(L * 0.2, R * 2.2);
  x.lineTo(L * 0.12, R * 0.4);
  x.fill();
  x.stroke();
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.roundRect(-L * 0.06, R * 1.0, L * 0.14, R * 0.75, R * 0.35);
  x.fill();
  x.stroke();
  // fumacinha do motor (emergência!)
  for (let i = 0; i < 6; i++) {
    const k = (time * 1.4 + i / 6) % 1;
    x.fillStyle = `rgba(90,80,100,${0.5 * (1 - k)})`;
    x.beginPath();
    x.arc(L * 0.1 + k * L * 0.45, R * 1.4 - k * R * 0.6, R * (0.25 + k * 0.6), 0, TAU);
    x.fill();
  }
  if (Math.sin(time * 9) > 0) {
    x.fillStyle = '#ff7a2a';
    x.beginPath();
    x.arc(L * 0.1, R * 1.38, R * 0.22, 0, TAU);
    x.fill();
  }
  x.restore();
  // luz de alarme piscando
  if (Math.floor(time * 2) % 2 === 0) {
    x.fillStyle = 'rgba(255,60,80,0.12)';
    x.fillRect(0, 0, w, h);
  }
}
