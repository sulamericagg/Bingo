/* Registro do minigame "Cava & Fala" no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo (three.js) é carregado sob demanda. */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';

export function registerCavaFala(): void {
  registerGame({
    id: 'cavafala',
    get name() {
      return t('cavafala.name', 'Cava & Fala');
    },
    get tagline() {
      return t('cavafala.tagline', 'Cave, fale e a engenhoca aparece!');
    },
    icon: 'rocket',
    theme: { bg: ['#ffb35a', '#6a3a8a'], accent: '#ff4fa3', accent2: '#ffd34a', title: ['#fff6d6', '#ffd34a'] },
    drawShowcase,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

const TAU = Math.PI * 2;

/** Vitrine: o Bloop cava, uma casinha aparece sob a terra, ele fala "trampolim!" e as peças se montam. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const cyc = time % 6;
  const gy = h * 0.6;
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#7fd0ff');
  sky.addColorStop(0.6, '#dff6ff');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // camadas de terra
  const layers: [string, number][] = [
    ['#6cc24a', 0],
    ['#9a6a3f', 0.04],
    ['#c8714a', 0.14],
    ['#9a6a3f', 0.22],
    ['#8d8f99', 0.32],
  ];
  layers.forEach(([c, k], i) => {
    x.fillStyle = c;
    x.beginPath();
    x.moveTo(0, gy + h * k);
    for (let s = 0; s <= 24; s++) x.lineTo((s / 24) * w, gy + h * k + Math.sin(s * 0.9 + i) * h * 0.012);
    x.lineTo(w, h);
    x.lineTo(0, h);
    x.fill();
  });
  // cristais e ouro
  for (let i = 0; i < 7; i++) {
    const px = ((i * 137) % 100) / 100 * w,
      py = gy + h * (0.36 + ((i * 53) % 30) / 100);
    x.fillStyle = i % 2 ? '#7ff0ff' : '#ffcc33';
    x.beginPath();
    x.moveTo(px, py - 6);
    x.lineTo(px + 5, py);
    x.lineTo(px, py + 6);
    x.lineTo(px - 5, py);
    x.fill();
  }
  // buraco cavado revelando a casinha
  const dig = Math.min(1, cyc / 2.2);
  const hx = w * 0.6;
  const hw = w * 0.2 * (0.4 + dig * 0.6);
  x.fillStyle = '#4a2f1f';
  x.beginPath();
  x.ellipse(hx, gy + h * 0.13, hw, h * 0.16 * (0.3 + dig * 0.7), 0, 0, TAU);
  x.fill();
  // casinha (fica colorida quando "restaurada")
  const rest = cyc > 2.4 ? Math.min(1, (cyc - 2.4) / 0.5) : 0;
  const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * rest)).join(',')})`;
  const bw = h * 0.16,
    bh = h * 0.12;
  const by = gy + h * 0.22;
  x.save();
  x.beginPath();
  x.ellipse(hx, gy + h * 0.13, hw, h * 0.16 * (0.3 + dig * 0.7), 0, 0, TAU);
  x.clip();
  x.fillStyle = mix([130, 105, 80], [255, 241, 168]);
  x.fillRect(hx - bw / 2, by - bh, bw, bh);
  x.fillStyle = mix([110, 85, 60], [232, 80, 74]);
  x.beginPath();
  x.moveTo(hx - bw * 0.65, by - bh);
  x.lineTo(hx, by - bh - h * 0.09);
  x.lineTo(hx + bw * 0.65, by - bh);
  x.fill();
  x.fillStyle = mix([70, 60, 50], [255, 224, 138]);
  x.fillRect(hx - bw * 0.35, by - bh * 0.7, bw * 0.2, bw * 0.2);
  x.fillRect(hx + bw * 0.15, by - bh * 0.7, bw * 0.2, bw * 0.2);
  x.restore();
  // Bloop
  const bx = w * 0.3;
  const r = h * 0.085;
  const hop = cyc > 3 ? Math.abs(Math.sin(time * 7)) * h * 0.03 : 0;
  const bY = gy - r - hop;
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(bx, bY, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(bx, bY, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(bx + r * 0.15, bY - r * 0.15, r * 0.24, 0, TAU);
  x.arc(bx + r * 0.65, bY - r * 0.15, r * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(bx + r * 0.22, bY - r * 0.12, r * 0.12, 0, TAU);
  x.arc(bx + r * 0.72, bY - r * 0.12, r * 0.12, 0, TAU);
  x.fill();
  // pá cavando
  if (cyc < 2.4) {
    const sw = Math.sin(time * 12) * 0.5;
    x.save();
    x.translate(bx + r, bY);
    x.rotate(0.6 + sw);
    x.fillStyle = '#8a5a3a';
    x.fillRect(0, -2, r * 1.3, 4);
    x.fillStyle = '#c8d0e0';
    x.fillRect(r * 1.2, -6, r * 0.5, 12);
    x.restore();
    for (let i = 0; i < 4; i++) {
      const k = (time * 2 + i * 0.25) % 1;
      x.fillStyle = '#9a6a3f';
      x.fillRect(hx - hw * 0.6 + i * 6 - k * 30, gy - k * 30 + k * k * 40, 5, 5);
    }
  }
  // balão de fala + trampolim montando
  if (cyc > 3.2) {
    const k = Math.min(1, (cyc - 3.2) / 0.3);
    x.globalAlpha = k;
    const tx = bx - r * 0.2,
      ty = bY - r * 2.4;
    x.fillStyle = '#fff';
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 3;
    x.beginPath();
    x.roundRect(tx - w * 0.13, ty - h * 0.07, w * 0.26, h * 0.1, 12);
    x.fill();
    x.stroke();
    x.fillStyle = '#2a0b5c';
    x.font = `800 ${Math.round(h * 0.05)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(t('cavafala.show.say', '“trampolim!”'), tx, ty - h * 0.02);
    x.globalAlpha = 1;
    const p = Math.min(1, (cyc - 3.6) / 0.8);
    if (p > 0) {
      const tx2 = w * 0.42,
        ty2 = gy - h * 0.03;
      // pernas
      x.fillStyle = '#c0c6d8';
      for (const s of [-1, 1]) if (p > 0.2) x.fillRect(tx2 + s * h * 0.07 - 2, ty2 - h * 0.05, 4, h * 0.05);
      if (p > 0.5) {
        x.fillStyle = '#ff4f6a';
        x.beginPath();
        x.ellipse(tx2, ty2 - h * 0.05, h * 0.1, h * 0.025, 0, 0, TAU);
        x.fill();
      }
      if (p > 0.8) {
        x.fillStyle = '#3ab0ff';
        x.beginPath();
        x.ellipse(tx2, ty2 - h * 0.055, h * 0.085, h * 0.016, 0, 0, TAU);
        x.fill();
      }
      // peças voando
      if (p < 1)
        for (let i = 0; i < 3; i++) {
          const q = (p * 3 + i * 0.3) % 1;
          x.fillStyle = ['#ff4f6a', '#3ab0ff', '#c0c6d8'][i];
          x.fillRect(bx + (tx2 - bx) * q, bY - Math.sin(q * Math.PI) * h * 0.12, 6, 6);
        }
    }
  }
}
