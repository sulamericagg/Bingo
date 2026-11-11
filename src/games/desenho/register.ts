/* ============================================================
 *  DESENHA E VIRA! — registro no hub. Leve: o jogo (three + cannon) vem sob demanda.
 *  Vitrine: um lápis desenha uma estrela no papel → BUM! → a estrela vira balão 3D e quica.
 * ============================================================ */
import { t } from '../../i18n';
import { registerGame } from '../../hub/registry';
import { registerDuelGame } from '../../party/duel-link';

const INK = '#2a1e3a';
const TAU = Math.PI * 2;

function starPts(cx: number, cy: number, R: number, r: number, rot = 0): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2 + rot;
    const rr = i % 2 ? r : R;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const bg = x.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#ffd23d');
  bg.addColorStop(1, '#ff5e8a');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  // bolinhas de fundo
  x.fillStyle = 'rgba(255,255,255,.18)';
  for (let i = 0; i < 14; i++) {
    x.beginPath();
    x.arc(((i * 97) % 100) / 100 * w, ((i * 53 + time * 6) % 100) / 100 * h, 4 + (i % 3) * 3, 0, TAU);
    x.fill();
  }
  const cyc = time % 5;
  const cx = w / 2;
  const cy = h * 0.52;
  const S = Math.min(w, h);
  // papel
  const draw = Math.min(1, cyc / 2);
  const paperA = cyc < 2.4 ? 1 : Math.max(0, 1 - (cyc - 2.4) / 0.35);
  if (paperA > 0) {
    x.save();
    x.globalAlpha = paperA;
    x.translate(cx, cy - (cyc > 2.4 ? (cyc - 2.4) * S * 0.6 : 0));
    x.rotate(-0.04);
    const pw = S * 0.78;
    x.fillStyle = 'rgba(0,0,0,.18)';
    x.fillRect(-pw / 2 + 4, -pw / 2 + 6, pw, pw);
    x.fillStyle = '#fffaf0';
    x.fillRect(-pw / 2, -pw / 2, pw, pw);
    x.strokeStyle = 'rgba(120,160,220,.25)';
    x.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      x.beginPath();
      x.moveTo(-pw / 2, -pw / 2 + (i * pw) / 8);
      x.lineTo(pw / 2, -pw / 2 + (i * pw) / 8);
      x.stroke();
    }
    // estrela sendo desenhada
    const pts = starPts(0, S * 0.02, S * 0.27, S * 0.12);
    pts.push(pts[0]);
    const segs = pts.length - 1;
    const upto = draw * segs;
    x.strokeStyle = '#ff9a2e';
    x.lineWidth = S * 0.03;
    x.lineCap = x.lineJoin = 'round';
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    let px = pts[0][0],
      py = pts[0][1];
    for (let i = 1; i <= segs; i++) {
      const k = Math.min(1, upto - (i - 1));
      if (k <= 0) break;
      px = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k;
      py = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k;
      x.lineTo(px, py);
    }
    x.stroke();
    // lápis
    if (cyc < 2.1) {
      x.save();
      x.translate(px, py);
      x.rotate(-0.7);
      x.fillStyle = '#ffd93d';
      x.strokeStyle = INK;
      x.lineWidth = 2;
      x.beginPath();
      x.rect(-S * 0.025, -S * 0.3, S * 0.05, S * 0.24);
      x.fill();
      x.stroke();
      x.fillStyle = '#f3c99a';
      x.beginPath();
      x.moveTo(-S * 0.025, -S * 0.06);
      x.lineTo(S * 0.025, -S * 0.06);
      x.lineTo(0, 0);
      x.closePath();
      x.fill();
      x.stroke();
      x.restore();
    }
    x.restore();
  }
  // BUM!
  if (cyc > 2.3 && cyc < 3.3) {
    const k = (cyc - 2.3) / 1;
    const sc = k < 0.3 ? k / 0.3 : 1 + (k - 0.3) * 0.3;
    x.save();
    x.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    x.translate(cx, cy * 0.7);
    x.scale(sc, sc);
    x.rotate(-0.15);
    x.fillStyle = '#fff';
    x.strokeStyle = INK;
    x.lineWidth = 4;
    const bp = starPts(0, 0, S * 0.3, S * 0.2);
    const big: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = i % 2 ? S * 0.17 : S * 0.24;
      big.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    void bp;
    x.beginPath();
    big.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
    x.fill();
    x.stroke();
    x.font = `700 ${Math.round(S * 0.13)}px Fredoka, system-ui, sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 6;
    x.strokeText(t('dv.bum', 'BUM!'), 0, 0);
    x.fillStyle = '#ff5e3a';
    x.fillText(t('dv.bum', 'BUM!'), 0, 0);
    x.restore();
  }
  // estrela 3D quicando
  if (cyc > 2.5) {
    const k = cyc - 2.5;
    const grow = Math.min(1, k / 0.5);
    const el = grow >= 1 ? 1 : Math.pow(2, -8 * grow) * Math.sin(((grow - 0.075) * TAU) / 0.3) + 1;
    const bounce = Math.abs(Math.sin(k * 4.2)) * Math.exp(-k * 1.2) * S * 0.18;
    const gy = h * 0.86;
    const R = S * 0.27 * el;
    const sy = gy - R * 0.95 - bounce;
    // sombra
    x.fillStyle = 'rgba(42,30,58,.25)';
    x.beginPath();
    x.ellipse(cx, gy, R * 0.9 * (1 - bounce / (S * 0.5)), R * 0.15, 0, 0, TAU);
    x.fill();
    const pts = starPts(cx, sy, R, R * 0.5, Math.sin(k * 2) * 0.12);
    x.save();
    x.beginPath();
    pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
    x.closePath();
    const g = x.createRadialGradient(cx - R * 0.3, sy - R * 0.35, R * 0.05, cx, sy, R * 1.05);
    g.addColorStop(0, '#fff6c8');
    g.addColorStop(0.45, '#ffd93d');
    g.addColorStop(1, '#ff9a2e');
    x.fillStyle = g;
    x.fill();
    x.lineWidth = Math.max(3, S * 0.022);
    x.strokeStyle = '#e07a10';
    x.stroke();
    // brilho
    x.fillStyle = 'rgba(255,255,255,.75)';
    x.beginPath();
    x.ellipse(cx - R * 0.22, sy - R * 0.28, R * 0.14, R * 0.07, -0.6, 0, TAU);
    x.fill();
    x.restore();
    // brilhinhos
    if (k < 1.2) {
      x.fillStyle = '#fff';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const d = S * 0.15 + k * S * 0.35;
        const s = (1.2 - k) * S * 0.03;
        x.beginPath();
        x.arc(cx + Math.cos(a) * d, sy + Math.sin(a) * d, s, 0, TAU);
        x.fill();
      }
    }
  }
}

export function registerDesenho(): void {
  registerDuelGame('desenho'); // grupo/links: duelo online (src/party/duel.ts)
  registerGame({
    id: 'desenho',
    get name() {
      return t('dv.name', 'Desenha e Vira!');
    },
    get tagline() {
      return t('dv.tagline', 'Desenhe com o dedo e veja virar 3D!');
    },
    icon: 'pencil',
    theme: { bg: ['#ffd23d', '#ff5e8a'], accent: '#ff5e3a', accent2: '#8a5cff', title: ['#ffffff', '#fff3a0'] },
    drawShowcase,
    async launch(root, exit) {
      const m = await import('./game');
      return m.launch(root, exit);
    },
  });
}
