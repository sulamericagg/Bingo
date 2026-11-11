/* Registro do "Mundo Bloop" (mundo aberto de blocos) no hub.
 * Só a vitrine (leve) entra no pacote principal; o jogo é carregado sob demanda. */
import { registerGame, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { registerPartyGame } from '../../party/contract';
import { MUNDO_ID } from './id';

export function registerMundo(): void {
  registerPartyGame(MUNDO_ID, { mode: 'room' }); // grupo: todos no mesmo mundo online (o líder cria; código do grupo)
  registerGame({
    id: MUNDO_ID,
    get name() {
      return t('mundo.gameName', 'Mundo Bloop');
    },
    get tagline() {
      return t('mundo.tagline', 'Cave, construa bloco a bloco e explore um mundo sem fim!');
    },
    icon: 'planet',
    theme: { bg: ['#7cc8ff', '#2a6a3a'], accent: '#6cc24a', accent2: '#ffd34a', title: ['#ffffff', '#bff59a'] },
    drawShowcase,
    online: true,
    noRotate: true,
    async launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}

/* ------------------------------ vitrine ------------------------------ */

const TAU = Math.PI * 2;
const INK = '#2a0b5c';

/** cubo isométrico simples (topo, lado esquerdo, lado direito) */
function cube(x: CanvasRenderingContext2D, cx: number, cy: number, s: number, top: string, left: string, right: string, a = 1): void {
  const h = s * 0.5;
  x.globalAlpha = a;
  x.lineWidth = Math.max(1, s * 0.06);
  x.strokeStyle = INK;
  x.lineJoin = 'round';
  // topo
  x.fillStyle = top;
  x.beginPath();
  x.moveTo(cx, cy - h);
  x.lineTo(cx + s, cy);
  x.lineTo(cx, cy + h);
  x.lineTo(cx - s, cy);
  x.closePath();
  x.fill();
  x.stroke();
  // esquerda
  x.fillStyle = left;
  x.beginPath();
  x.moveTo(cx - s, cy);
  x.lineTo(cx, cy + h);
  x.lineTo(cx, cy + h + s);
  x.lineTo(cx - s, cy + s);
  x.closePath();
  x.fill();
  x.stroke();
  // direita
  x.fillStyle = right;
  x.beginPath();
  x.moveTo(cx + s, cy);
  x.lineTo(cx, cy + h);
  x.lineTo(cx, cy + h + s);
  x.lineTo(cx + s, cy + s);
  x.closePath();
  x.fill();
  x.stroke();
  x.globalAlpha = 1;
}

const GRASS: [string, string, string] = ['#7ad84a', '#8a6440', '#6a4a2c'];
const STONE: [string, string, string] = ['#c4c0ca', '#8e8a96', '#6e6a76'];
const PLANK: [string, string, string] = ['#f0c27a', '#c8904a', '#a0703a'];

/** Cena curta: o Bloop põe blocos e a torre cresce; um baú brilha no chão. */
export function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const sky = x.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#6ab8f0');
  sky.addColorStop(1, '#d6f4ff');
  x.fillStyle = sky;
  x.fillRect(0, 0, w, h);
  // nuvens quadradinhas
  x.fillStyle = 'rgba(255,255,255,.85)';
  for (let i = 0; i < 3; i++) {
    const cx = ((time * 12 + i * w * 0.4) % (w + 120)) - 60;
    const cy = h * (0.12 + i * 0.07);
    x.fillRect(cx, cy, h * 0.2, h * 0.06);
    x.fillRect(cx + h * 0.05, cy - h * 0.04, h * 0.1, h * 0.05);
  }
  const s = Math.max(10, h * 0.075);
  const ox = w * 0.5;
  const oy = h * 0.52;
  const iso = (gx: number, gz: number, gy: number): [number, number] => [ox + (gx - gz) * s, oy + (gx + gz) * s * 0.5 - gy * s];
  // chão 7×5 (de trás para frente)
  for (let gz = -3; gz <= 3; gz++)
    for (let gx = -4; gx <= 3; gx++) {
      const hgt = gx === -4 || gz === -3 ? 1 : 0;
      for (let gy = 0; gy <= hgt; gy++) {
        const [px, py] = iso(gx, gz, gy);
        const c = gy === hgt ? GRASS : (['#8a6440', '#7a5434', '#6a4a2c'] as const);
        cube(x, px, py, s, c[0], c[1], c[2]);
      }
    }
  // torre que cresce (1 bloco por 0,8 s; recomeça)
  const cyc = time % 6;
  const n = Math.min(5, Math.floor(cyc / 0.8) + 1);
  for (let i = 0; i < n; i++) {
    const [px, py] = iso(1, 0, i + 1);
    const c = i % 2 ? PLANK : STONE;
    const drop = i === n - 1 ? Math.max(0, 1 - ((cyc % 0.8) / 0.25)) * s * 0.6 : 0;
    cube(x, px, py - drop, s, c[0], c[1], c[2], i === n - 1 ? 0.95 : 1);
  }
  // baú no chão
  {
    const [px, py] = iso(-2, 2, 1);
    cube(x, px, py, s * 0.8, '#ffcf6a', '#c8904a', '#a0703a');
    x.fillStyle = '#ffd34a';
    x.fillRect(px - 2, py + s * 0.3, 4, s * 0.3);
    const gl = 0.5 + 0.5 * Math.sin(time * 4);
    x.fillStyle = `rgba(255,240,150,${0.35 * gl})`;
    x.beginPath();
    x.arc(px, py + s * 0.2, s * 1.1, 0, TAU);
    x.fill();
  }
  // Bloop olhando para a torre
  const [bx0, by0] = iso(-1, 1, 1);
  const r = s * 0.9;
  const bob = Math.abs(Math.sin(time * 5)) * s * 0.15;
  const bx = bx0;
  const by = by0 - r - bob;
  x.fillStyle = INK;
  x.beginPath();
  x.arc(bx, by, r + 2, 0, TAU);
  x.fill();
  x.fillStyle = '#ff8fd8';
  x.beginPath();
  x.arc(bx, by, r, 0, TAU);
  x.fill();
  x.fillStyle = '#fff';
  x.beginPath();
  x.arc(bx + r * 0.15, by - r * 0.15, r * 0.24, 0, TAU);
  x.arc(bx + r * 0.65, by - r * 0.15, r * 0.24, 0, TAU);
  x.fill();
  x.fillStyle = '#2a1140';
  x.beginPath();
  x.arc(bx + r * 0.22, by - r * 0.12, r * 0.12, 0, TAU);
  x.arc(bx + r * 0.72, by - r * 0.12, r * 0.12, 0, TAU);
  x.fill();
  // mãozinha com bloco
  const [tx, ty] = iso(1, 0, n + 1);
  const k = (cyc % 0.8) / 0.8;
  const hx = bx + r * 0.9 + (tx - bx - r * 0.9) * Math.min(1, k * 1.4) * 0.3;
  const hy = by + (ty - by) * Math.min(1, k * 1.4) * 0.3;
  cube(x, hx, hy, s * 0.35, STONE[0], STONE[1], STONE[2]);
  // mira
  x.strokeStyle = '#fff';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(tx - 6, ty + s * 0.5);
  x.lineTo(tx + 6, ty + s * 0.5);
  x.moveTo(tx, ty + s * 0.5 - 6);
  x.lineTo(tx, ty + s * 0.5 + 6);
  x.stroke();
}
