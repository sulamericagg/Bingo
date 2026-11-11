/* ============================================================
 *  ANOMALIAS & CIA — registro no hub. Leve: o jogo (e o three) é importado sob demanda.
 *  Vitrine: corredor escuro, porta que pisca e o Bocudo espiando com a boca aberta.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';

const TAU = Math.PI * 2;
function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#120c2e');
  g.addColorStop(1, '#2a1d5c');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // corredor em perspectiva
  const cx = w / 2,
    hy = h * 0.46;
  x.fillStyle = '#1b1440';
  x.beginPath();
  x.moveTo(0, h);
  x.lineTo(cx - w * 0.12, hy + h * 0.12);
  x.lineTo(cx + w * 0.12, hy + h * 0.12);
  x.lineTo(w, h);
  x.fill();
  // lâmpadas do teto (piscando)
  for (let i = 0; i < 4; i++) {
    const k = i / 4;
    const y = h * 0.05 + k * h * 0.3;
    const ww = w * (0.18 - k * 0.12);
    const on = i !== 2 || Math.sin(time * 23) > -0.2;
    x.fillStyle = on ? `rgba(220,240,255,${0.9 - k * 0.5})` : 'rgba(80,90,120,.6)';
    x.fillRect(cx - ww / 2, y, ww, h * 0.02);
  }
  // portas laterais
  for (let i = 0; i < 3; i++) {
    const k = i / 3;
    const dh = h * (0.42 - k * 0.22);
    const dw = w * (0.08 - k * 0.04);
    for (const s of [-1, 1]) {
      const dx = cx + s * w * (0.36 - k * 0.2) - dw / 2;
      x.fillStyle = s * (i + 1) === 2 ? '#ff5a7a' : '#4fb3c9';
      x.fillRect(dx, hy + h * 0.12 - dh * 0.75, dw, dh);
    }
  }
  // Bocudo espiando
  const bx = w * 0.62,
    by = h * 0.62 + Math.sin(time * 2) * h * 0.015;
  const r = h * 0.22;
  x.fillStyle = '#4b2a7a';
  x.strokeStyle = '#1d0b3a';
  x.lineWidth = 4;
  x.beginPath();
  x.arc(bx, by, r, 0, TAU);
  x.fill();
  x.stroke();
  // orelhas
  x.fillStyle = '#2e1650';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(bx + s * r * 0.5, by - r * 0.75);
    x.lineTo(bx + s * r * 0.95, by - r * 1.35);
    x.lineTo(bx + s * r * 0.15, by - r * 0.95);
    x.fill();
  }
  // olhos
  for (const s of [-1, 1]) {
    x.fillStyle = '#ffe14a';
    x.beginPath();
    x.ellipse(bx + s * r * 0.36, by - r * 0.35, r * 0.17, r * 0.2, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#1a0420';
    x.fillRect(bx + s * r * 0.36 - 2, by - r * 0.48, 4, r * 0.26);
  }
  // bocão
  const open = 0.5 + Math.max(0, Math.sin(time * 1.8)) * 0.5;
  x.fillStyle = '#33061a';
  x.beginPath();
  x.ellipse(bx, by + r * 0.3, r * 0.62, r * 0.42 * open, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#ff6f91';
  x.beginPath();
  x.ellipse(bx, by + r * 0.3 + r * 0.25 * open, r * 0.3, r * 0.12 * open, 0, 0, TAU);
  x.fill();
  x.fillStyle = '#fffbe8';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.moveTo(bx + s * r * 0.3, by + r * 0.3 - r * 0.38 * open);
    x.lineTo(bx + s * r * 0.22, by + r * 0.3 - r * 0.38 * open + r * 0.26);
    x.lineTo(bx + s * r * 0.14, by + r * 0.3 - r * 0.38 * open);
    x.fill();
  }
  // câmera piscando (flash)
  const fl = (time % 3) < 0.12 ? 1 - (time % 3) / 0.12 : 0;
  if (fl > 0) {
    x.fillStyle = `rgba(255,255,255,${fl * 0.7})`;
    x.fillRect(0, 0, w, h);
  }
}

export function registerAnomalias(): void {
  registerGame({
    id: 'anomalias',
    get name() {
      return t('ano.name', 'Anomalias & Cia');
    },
    get tagline() {
      return t('ano.tagline', 'Turno da noite: ache o que mudou e tire foto!');
    },
    icon: 'camera',
    theme: { bg: ['#2a1d5c', '#4b2a7a'], accent: '#ffd34a', accent2: '#ff5c9a', title: ['#ffffff', '#ffe680'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./core/game');
      return m.launch(root, exit);
    },
  });
}
