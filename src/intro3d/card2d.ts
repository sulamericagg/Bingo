/* ============================================================
 *  Cartão de título 2D animado — nível Mínimo ou sem WebGL.
 *  Degradê do tema, raios girando, bolhas de luz, o Bloop quicando
 *  e uma chuva de brilhos. Só canvas 2D, poucos desenhos por quadro.
 * ============================================================ */
import type { IntroOpts, Painter } from './index';
import { bloopCanvas, outBack, rng, seg } from './kit';

export function card2d(cv: HTMLCanvasElement, o: IntroOpts): Painter {
  const x = cv.getContext('2d')!;
  const th = o.theme;
  const bloop = bloopCanvas('happy', 192);
  const R = rng(7);
  const dots = Array.from({ length: 22 }, () => ({ x: R(), y: R(), r: 0.01 + R() * 0.05, s: 0.02 + R() * 0.06, c: R() < 0.5 ? th.accent : th.accent2, a: 0.15 + R() * 0.3 }));
  const sparks = Array.from({ length: 26 }, () => ({ a: R() * Math.PI * 2, v: 0.25 + R() * 0.6, r: 2 + R() * 4, c: R() < 0.5 ? th.accent2 : '#ffffff' }));
  let W = 1;
  let H = 1;
  let d = 1;
  return {
    resize(w, h) {
      d = Math.min(1.5, window.devicePixelRatio || 1);
      W = w;
      H = h;
      cv.width = Math.round(w * d);
      cv.height = Math.round(h * d);
    },
    frame(t) {
      x.setTransform(d, 0, 0, d, 0, 0);
      const g = x.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, Math.hypot(W, H) * 0.6);
      g.addColorStop(0, th.bg[0]);
      g.addColorStop(1, th.bg[1]);
      x.fillStyle = g;
      x.fillRect(0, 0, W, H);
      // raios
      x.save();
      x.translate(W / 2, H * 0.45);
      x.rotate(t * 0.35);
      x.fillStyle = 'rgba(255,255,255,0.07)';
      const L = Math.hypot(W, H);
      for (let i = 0; i < 14; i++) {
        x.rotate((Math.PI * 2) / 14);
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(L, -L * 0.12);
        x.lineTo(L, L * 0.12);
        x.fill();
      }
      x.restore();
      // bolhas de luz subindo
      for (const p of dots) {
        const y = ((p.y - t * p.s) % 1 + 1) % 1;
        x.globalAlpha = p.a;
        x.fillStyle = p.c;
        x.beginPath();
        x.arc(p.x * W, y * H, p.r * Math.min(W, H), 0, 7);
        x.fill();
      }
      x.globalAlpha = 1;
      // Bloop entra quicando (acima do título)
      const S = Math.min(W, H) * 0.34;
      const k = outBack(seg(t, 0, 0.55), 2.2);
      const by = H * 0.5 - S * 0.95 - Math.abs(Math.sin(t * 5)) * S * 0.08 * seg(t, 0.55, 0.8);
      const sq = 1 + Math.sin(t * 10) * 0.04;
      x.save();
      x.translate(W / 2, H + (by - H) * k);
      x.scale(sq, 2 - sq);
      x.drawImage(bloop, -S / 2, -S / 2, S, S);
      x.restore();
      // brilhos estourando quando o título entra
      const e = seg(t, 0.45, 1.6);
      if (e > 0 && e < 1) {
        for (const s of sparks) {
          const rr = (0.1 + e * s.v) * Math.min(W, H);
          x.globalAlpha = 1 - e;
          x.fillStyle = s.c;
          x.beginPath();
          x.arc(W / 2 + Math.cos(s.a) * rr, H * 0.5 + Math.sin(s.a) * rr, s.r, 0, 7);
          x.fill();
        }
        x.globalAlpha = 1;
      }
    },
    dispose() {
      cv.width = cv.height = 1;
    },
  };
}
