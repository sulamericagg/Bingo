/* Registro do minigame "Noites do Acampamento" no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo é carregado sob demanda. */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { registerPartyGame } from '../../party/contract';

export function registerNoites(): void {
  registerPartyGame('noites', { mode: 'room' }); // grupo: todos no acampamento do líder
  registerGame({
    id: 'noites',
    get name() {
      return t('noites.name', 'Noites do Acampamento');
    },
    get tagline() {
      return t('noites.tagline', 'Mantenha a fogueira acesa e sobreviva às noites do bosque!');
    },
    icon: 'fire',
    theme: { bg: ['#3a2a7a', '#0a0a24'], accent: '#ff9a2e', accent2: '#ffd34a', title: ['#fff6d6', '#ffb347'] },
    drawShowcase,
    online: true,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */
const TAU = Math.PI * 2;

/** Fogueira à noite, dois Bloops na luz e olhinhos de Sombrinhas piscando no escuro. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const gy = h * 0.8;
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0a0a2a');
  sky.addColorStop(0.7, '#2a2050');
  sky.addColorStop(1, '#1a1030');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // estrelas
  for (let i = 0; i < 30; i++) {
    const sx = ((i * 97) % 100) / 100;
    const sy = ((i * 53) % 60) / 100;
    x.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(time * 1.5 + i));
    x.fillStyle = '#fff';
    x.fillRect(sx * w, sy * h * 0.7, 2, 2);
  }
  x.globalAlpha = 1;
  // lua
  x.fillStyle = '#e8f0ff';
  x.beginPath();
  x.arc(w * 0.82, h * 0.18, h * 0.08, 0, TAU);
  x.fill();
  x.fillStyle = '#2a2050';
  x.beginPath();
  x.arc(w * 0.85, h * 0.16, h * 0.07, 0, TAU);
  x.fill();
  // pinheiros escuros
  for (let i = 0; i < 9; i++) {
    const px = (i / 8) * w;
    const ph = h * (0.32 + ((i * 37) % 10) / 50);
    x.fillStyle = i % 2 ? '#141a30' : '#1a2238';
    x.beginPath();
    x.moveTo(px - ph * 0.28, gy);
    x.lineTo(px, gy - ph);
    x.lineTo(px + ph * 0.28, gy);
    x.fill();
  }
  x.fillStyle = '#16122a';
  x.fillRect(0, gy, w, h - gy);
  // luz da fogueira
  const fx = w * 0.5;
  const fl = 1 + Math.sin(time * 9) * 0.04 + Math.sin(time * 5.3) * 0.05;
  const g = x.createRadialGradient(fx, gy, 0, fx, gy, h * 0.55 * fl);
  g.addColorStop(0, 'rgba(255,170,70,0.75)');
  g.addColorStop(0.5, 'rgba(255,120,40,0.25)');
  g.addColorStop(1, 'rgba(255,120,40,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // olhos de Sombrinhas
  for (let i = 0; i < 5; i++) {
    const ex = [0.1, 0.22, 0.78, 0.9, 0.66][i] * w;
    const ey = gy - h * [0.12, 0.25, 0.2, 0.08, 0.32][i];
    const blink = Math.sin(time * 1.3 + i * 2.1) > 0.94;
    if (blink) continue;
    x.fillStyle = '#100820';
    x.beginPath();
    x.arc(ex, ey + h * 0.02, h * 0.06, 0, TAU);
    x.fill();
    x.fillStyle = '#ffe45c';
    for (const s of [-1, 1]) {
      x.beginPath();
      x.ellipse(ex + s * h * 0.022, ey, h * 0.012, h * 0.018, 0, 0, TAU);
      x.fill();
    }
  }
  // lenha e chamas
  x.fillStyle = '#6a3f22';
  x.save();
  x.translate(fx, gy);
  x.rotate(0.3);
  x.fillRect(-h * 0.1, -h * 0.015, h * 0.2, h * 0.03);
  x.rotate(-0.6);
  x.fillRect(-h * 0.1, -h * 0.015, h * 0.2, h * 0.03);
  x.restore();
  const flame = (c: string, s: number) => {
    x.fillStyle = c;
    x.beginPath();
    const fh = h * 0.2 * s * fl;
    x.moveTo(fx - h * 0.06 * s, gy - h * 0.01);
    x.quadraticCurveTo(fx - h * 0.07 * s, gy - fh * 0.5, fx + Math.sin(time * 6) * h * 0.01, gy - fh);
    x.quadraticCurveTo(fx + h * 0.07 * s, gy - fh * 0.5, fx + h * 0.06 * s, gy - h * 0.01);
    x.fill();
  };
  flame('#ff5a1a', 1);
  flame('#ffb030', 0.7);
  flame('#fff3a0', 0.4);
  // dois Bloops
  const bloop = (bx: number, col: string, dir: number, ph: number) => {
    const r = h * 0.075;
    const by = gy - r - Math.abs(Math.sin(time * 3 + ph)) * h * 0.02;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(bx, by, r + 2, 0, TAU);
    x.fill();
    x.fillStyle = col;
    x.beginPath();
    x.arc(bx, by, r, 0, TAU);
    x.fill();
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(bx + dir * r * 0.15, by - r * 0.15, r * 0.24, 0, TAU);
    x.arc(bx + dir * r * 0.6, by - r * 0.15, r * 0.24, 0, TAU);
    x.fill();
    x.fillStyle = '#2a1140';
    x.beginPath();
    x.arc(bx + dir * r * 0.2, by - r * 0.12, r * 0.12, 0, TAU);
    x.arc(bx + dir * r * 0.65, by - r * 0.12, r * 0.12, 0, TAU);
    x.fill();
  };
  bloop(w * 0.36, '#ff8fd8', 1, 0);
  bloop(w * 0.64, '#8ad8ff', -1, 1.4);
  // faíscas
  for (let i = 0; i < 8; i++) {
    const k = (time * 0.6 + i / 8) % 1;
    x.globalAlpha = 1 - k;
    x.fillStyle = '#ffcf6a';
    x.fillRect(fx + Math.sin(i * 3 + time) * h * 0.05, gy - h * 0.15 - k * h * 0.35, 3, 3);
  }
  x.globalAlpha = 1;
}
