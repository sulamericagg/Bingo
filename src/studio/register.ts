/* Registro do Bloop Studio no hub. Só a vitrine (leve) entra no pacote
 * principal; editor + three.js são carregados ao abrir, cannon-es ao Testar. */
import { listGames, registerGame, type MiniGameHandle } from '../hub/registry';
import { t } from '../i18n';
import { parseShareHash, type ShareLink } from './share';

/** link recebido (#/studio/p/<id> ou #/studio/c/<código>) esperando o hub ficar pronto */
let pending: ShareLink | null = null;
/** servidor do Bloop Studio escolhido no navegador de servidores do Mundo (joga online com outros) */
export interface StudioServer {
  code: string;
  ugc: string;
  name: string;
  pvp?: boolean;
}
let pendingServer: StudioServer | null = null;
export function setPendingServer(s: StudioServer): void {
  pendingServer = s;
}

export function registerStudio(): void {
  pending = typeof location !== 'undefined' ? parseShareHash(location.hash) : null;
  if (pending) void openWhenReady();
  registerGame({
    id: 'studio',
    get name() {
      return t('studio.name', 'Bloop Studio');
    },
    get tagline() {
      return t('studio.tagline', 'Construa objetos, veículos e mapas — e jogue!');
    },
    icon: 'pencil',
    theme: { bg: ['#8a5cff', '#2a1658'], accent: '#ff5cc8', accent2: '#ffd34a', title: ['#ffffff', '#ffd3f4'] },
    drawShowcase,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./studio');
      const link = pending;
      const server = pendingServer;
      pending = null;
      pendingServer = null;
      return m.launch(root, exit, { link: link ?? undefined, server: server ?? undefined });
    },
  });
}

/** espera o hub aparecer (depois da abertura/onboarding) e abre o estúdio no link */
async function openWhenReady(): Promise<void> {
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (document.querySelector('.ob-root') || !document.querySelector('#menu.on')) continue;
    const def = listGames().find((g) => g.id === 'studio');
    if (!def) continue;
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* */
    }
    const hub = await import('../hub/hub');
    void hub.launchGame(def);
    return;
  }
}

const TAU = Math.PI * 2;

/** Vitrine: blocos caem e montam um carrinho; o Bloop dá um pulinho de alegria. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#5a3ad0');
  g.addColorStop(1, '#2a1658');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // grade de construção
  const gy = h * 0.78;
  x.strokeStyle = 'rgba(255,255,255,.12)';
  x.lineWidth = 1;
  for (let i = -8; i <= 8; i++) {
    x.beginPath();
    x.moveTo(w / 2 + i * w * 0.07, gy);
    x.lineTo(w / 2 + i * w * 0.16, h);
    x.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const yy = gy + (h - gy) * (k / 4) ** 1.4;
    x.beginPath();
    x.moveTo(0, yy);
    x.lineTo(w, yy);
    x.stroke();
  }
  const cyc = time % 6;
  const u = Math.min(h * 0.07, w * 0.05);
  const cx = w * 0.56;
  // blocos do carro (caem um por vez)
  const blocks: [number, number, number, number, string][] = [
    [-2.2, 0.9, 4.4, 1.0, '#ff5cc8'],
    [-1.2, 1.9, 2.4, 1.0, '#9fe8ff'],
    [-1.4, 2.9, 2.8, 0.25, '#f4efff'],
  ];
  blocks.forEach(([bx, by, bw, bh, c], i) => {
    const t0 = 0.4 + i * 0.7;
    if (cyc < t0) return;
    const f = Math.min(1, (cyc - t0) / 0.35);
    const drop = (1 - f * f) * h * 0.5;
    rrect(x, cx + bx * u, gy - (by + bh) * u - drop, bw * u, bh * u, u * 0.18, c);
  });
  // rodas
  for (const wx of [-1.3, 1.3]) {
    if (cyc < 2.6) continue;
    const s = Math.min(1, (cyc - 2.6) / 0.3);
    const roll = cyc > 4 ? (cyc - 4) * 4 : 0;
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.arc(cx + wx * u, gy - 0.55 * u, 0.55 * u * s, 0, TAU);
    x.fill();
    x.strokeStyle = '#dcd6f0';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(cx + wx * u, gy - 0.55 * u, 0.25 * u * s, roll, roll + 4);
    x.stroke();
  }
  // caneta 3D: rabisco brilhante
  x.strokeStyle = '#ffd34a';
  x.lineWidth = Math.max(2, u * 0.12);
  x.lineCap = 'round';
  x.beginPath();
  const n = Math.min(40, Math.floor((cyc / 3) * 40));
  for (let i = 0; i <= n; i++) {
    const a = i * 0.32;
    const px = w * 0.22 + Math.cos(a) * (u * 0.4 + i * u * 0.02);
    const py = h * 0.32 + Math.sin(a) * (u * 0.4 + i * u * 0.02) * 0.6 - i * u * 0.02;
    if (i) x.lineTo(px, py);
    else x.moveTo(px, py);
  }
  x.stroke();
  // Bloop
  const r = u * 0.9;
  const bx = w * 0.27;
  const hop = cyc > 3.4 ? Math.abs(Math.sin((cyc - 3.4) * 6)) * u * 0.8 : 0;
  const by = gy - r - hop;
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.arc(bx, by, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(bx, by, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(bx + r * 0.1, by - r * 0.15, r * 0.24, 0, TAU);
  x.arc(bx + r * 0.6, by - r * 0.15, r * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(bx + r * 0.18, by - r * 0.12, r * 0.12, 0, TAU);
  x.arc(bx + r * 0.68, by - r * 0.12, r * 0.12, 0, TAU);
  x.fill();
}

function rrect(x: CanvasRenderingContext2D, px: number, py: number, w: number, h: number, r: number, c: string): void {
  x.fillStyle = '#2a0b5c';
  x.beginPath();
  x.roundRect(px - 2, py - 2, w + 4, h + 4, r + 2);
  x.fill();
  x.fillStyle = c;
  x.beginPath();
  x.roundRect(px, py, w, h, r);
  x.fill();
}
