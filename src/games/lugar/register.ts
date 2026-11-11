/* ============================================================
 *  BLOOP NO LUGAR — registro no hub. Leve: o jogo é importado sob demanda.
 *  Vitrine: tabuleirinho 5×5 colorido onde os Bloops vão pulando para o lugar certo.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';
import { drawPlayer } from '../../game/character';
import { SKINS } from '../../game/skins';
import { save } from '../../core/storage';

const INK = '#1d0b48';
// tabuleiro fixo de vitrine (5×5, solução única)
const REG = [1, 1, 4, 2, 2, 3, 4, 4, 2, 2, 3, 4, 4, 4, 4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0];
const SOL = [1, 4, 2, 0, 3];
const COLS = ['#ff9ec4', '#8fd6ff', '#ffe066', '#9be8b4', '#c6a8ff'];

let spr: HTMLCanvasElement | null = null;
let sprR = 0;
function bloop(R: number): HTMLCanvasElement {
  if (spr && Math.abs(sprR - R) < 0.5) return spr;
  const skin = SKINS.find((s) => s.id === save.skin) ?? SKINS[0];
  const size = Math.ceil(R * 3.3);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.translate(size / 2, size / 2);
  try {
    drawPlayer(x, skin, R, { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true });
  } catch {
    x.fillStyle = skin.light;
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.fill();
  }
  spr = c;
  sprR = R;
  return c;
}

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#7b3cff');
  g.addColorStop(1, '#ff5ca8');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const S = Math.min(w, h) * 0.78;
  const cs = S / 5;
  const ox = (w - S) / 2;
  const oy = (h - S) / 2;
  x.fillStyle = INK;
  x.beginPath();
  x.roundRect(ox - 6, oy - 6, S + 12, S + 12, 14);
  x.fill();
  for (let i = 0; i < 25; i++) {
    x.fillStyle = COLS[REG[i]];
    x.fillRect(ox + (i % 5) * cs, oy + Math.floor(i / 5) * cs, cs + 0.5, cs + 0.5);
  }
  x.strokeStyle = INK;
  x.lineWidth = Math.max(2, cs * 0.08);
  x.lineCap = 'round';
  x.beginPath();
  for (let r = 0; r < 5; r++)
    for (let k = 0; k < 5; k++) {
      const i = r * 5 + k;
      if (k < 4 && REG[i] !== REG[i + 1]) (x.moveTo(ox + (k + 1) * cs, oy + r * cs), x.lineTo(ox + (k + 1) * cs, oy + (r + 1) * cs));
      if (r < 4 && REG[i] !== REG[i + 5]) (x.moveTo(ox + k * cs, oy + (r + 1) * cs), x.lineTo(ox + (k + 1) * cs, oy + (r + 1) * cs));
    }
  x.stroke();
  // ciclo: 5 Bloops entram, festa, recomeça
  const cyc = time % 6;
  const R = cs * 0.34;
  const sp = bloop(R * 2) as HTMLCanvasElement;
  for (let r = 0; r < 5; r++) {
    const k = cyc - 0.4 - r * 0.55;
    if (k < 0 || cyc > 5.6) continue;
    const s = 1 - Math.exp(-9 * k) * Math.cos(16 * k);
    const sq = 0.3 * Math.exp(-6 * k) * Math.sin(20 * k + 0.6);
    const party = cyc > 3.5 ? Math.max(0, Math.sin((cyc - 3.5) * 9 - r)) * cs * 0.25 : 0;
    const cx = ox + SOL[r] * cs + cs / 2;
    const by = oy + r * cs + cs * 0.85 - party;
    x.save();
    x.translate(cx, by);
    x.scale(s * (1 - sq), s * (1 + sq));
    const sw = (sp.width / 2) * 1;
    x.drawImage(sp, -sw / 2, -sw / 2 - R, sw, sw);
    x.restore();
  }
}

export function registerLugar(): void {
  registerGame({
    id: 'lugar',
    get name() {
      return t('lugar.name', 'Bloop no Lugar');
    },
    get tagline() {
      return t('lugar.tagline', 'Um Bloop por linha, coluna e cor. E nada de encostar!');
    },
    icon: 'target',
    theme: { bg: ['#7b3cff', '#ff5ca8'], accent: '#ff5ca8', accent2: '#ffe066', title: ['#fff6d6', '#ffe066'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
