/* ============================================================
 *  BLOOP NO LUGAR — abertura curta (≈12 s): o tabuleiro 5×5 de regiões coloridas surge em
 *  onda, os Bloops (o SEU primeiro) pulam um a um para o lugar certo — um por linha, coluna
 *  e cor, sem encostar — as casas proibidas ganham pontinhos e o tabuleiro brilha no título.
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { playFilm, type Stage } from '../../_intro2/stage';
import { INK, back, bloop, circle, confetti, ease, easeOut, fillAll, friendSkins, fs, glow, lerp, rays, rr, seg, twinkle, vgrad } from '../../_intro2/draw';

// mesmo tabuleiro da vitrine (solução única)
const REG = [1, 1, 4, 2, 2, 3, 4, 4, 2, 2, 3, 4, 4, 4, 4, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0];
const SOL = [1, 4, 2, 0, 3];
const COLS = ['#ff9ec4', '#8fd6ff', '#ffe066', '#9be8b4', '#c6a8ff'];
const T_HOP = 2.2;
const STEP = 1.05;
const T_TITLE = 8.2;
const T_END = 12.4;

function scene(st: Stage, tt: number): void {
  const x = st.x;
  fillAll(x, st, vgrad(x, -st.hh, st.hh, ['#7b3cff', '#ff5ca8']));
  rays(x, 0, 6, tt * 0.2, 160, 'rgba(255,255,255,.08)', 16, 0.08);
  const done = seg(tt, T_HOP + STEP * 5, T_HOP + STEP * 5 + 0.6);
  const N = 5;
  const C = st.tall ? 16 : Math.min(13, (st.hh * 2 - 34) / 6.4);
  const ox = -C * 2.5;
  const oy = (st.tall ? 4 : 2) - C * 2.5;
  const tk = ease(seg(tt, T_TITLE - 0.6, T_TITLE + 0.6));
  x.save();
  x.translate(0, tk * (st.tall ? 10 : 14));
  if (!st.tall) x.scale(1 - tk * 0.28, 1 - tk * 0.28);
  // sombra/moldura
  rr(x, ox - 3, oy - 3, C * N + 6, C * N + 6, 4);
  fs(x, '#fff6d6', 0.9);
  glow(x, 0, 0, C * 5, 'rgba(255,240,180,.6)', done);
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const k = back(seg(tt, 0.2 + (r + c) * 0.09, 0.6 + (r + c) * 0.09), 2);
      if (k <= 0) continue;
      const cx = ox + c * C + C / 2;
      const cy = oy + r * C + C / 2;
      x.save();
      x.translate(cx, cy);
      x.scale(k, k);
      rr(x, -C / 2 + 0.4, -C / 2 + 0.4, C - 0.8, C - 0.8, C * 0.18);
      fs(x, COLS[REG[i]], 0.5);
      x.restore();
      // pontinho: casa proibida (mesma linha/coluna/cor ou vizinha de um Bloop já colocado)
      let blocked = false;
      for (let q = 0; q < N; q++) {
        if (tt < T_HOP + STEP * q + 0.55) continue;
        const qr = q;
        const qc = SOL[q];
        if ((qr === r && qc === c)) continue;
        if (qr === r || qc === c || REG[qr * N + qc] === REG[i] || (Math.abs(qr - r) <= 1 && Math.abs(qc - c) <= 1)) blocked = true;
      }
      if (blocked) {
        circle(x, cx, cy, C * 0.08);
        x.fillStyle = 'rgba(42,11,92,.45)';
        x.fill();
      }
    }
  // contorno das regiões
  x.strokeStyle = INK;
  x.lineWidth = 0.9;
  x.lineCap = 'round';
  x.beginPath();
  for (let r = 0; r < N; r++)
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (c < N - 1 && REG[i] !== REG[i + 1]) {
        x.moveTo(ox + (c + 1) * C, oy + r * C);
        x.lineTo(ox + (c + 1) * C, oy + (r + 1) * C);
      }
      if (r < N - 1 && REG[i] !== REG[i + N]) {
        x.moveTo(ox + c * C, oy + (r + 1) * C);
        x.lineTo(ox + (c + 1) * C, oy + (r + 1) * C);
      }
    }
  x.globalAlpha = ease(seg(tt, 1.2, 1.8));
  x.stroke();
  x.globalAlpha = 1;
  // os Bloops pulando para o lugar
  const sk = friendSkins(4);
  for (let q = 0; q < N; q++) {
    const t0 = T_HOP + STEP * q;
    if (tt < t0) continue;
    const k = seg(tt, t0, t0 + 0.55);
    const tx = ox + SOL[q] * C + C / 2;
    const ty = oy + q * C + C / 2;
    const sx0 = (q % 2 ? 1 : -1) * (C * 3.6);
    const sy0 = oy - C * 1.8;
    const px = lerp(sx0, tx, easeOut(k));
    const py = lerp(sy0, ty, k) - Math.sin(k * Math.PI) * C * 1.6;
    const land = k >= 1 ? Math.max(0, 1 - (tt - t0 - 0.55) / 0.25) : 0;
    const bob = k >= 1 ? Math.sin((tt - t0) * 4 + q) * 0.4 + (done > 0 ? -Math.abs(Math.sin(tt * 6 + q)) * C * 0.15 : 0) : 0;
    bloop(x, px, py + bob, C * 0.36, { t: tt + q, skin: q === 0 ? undefined : sk[q - 1], sx: 1 + land * 0.15, sy: 1 - land * 0.15, mood: 'happy', lookY: 0.2 });
    if (land > 0) for (let i = 0; i < 4; i++) twinkle(x, tx + Math.cos(i * 1.6) * C * 0.6, ty + Math.sin(i * 1.6) * C * 0.6, C * 0.12 * land, '#fff');
  }
  x.restore();
  confetti(x, st, tt, T_TITLE + 0.2, Math.round(55 * st.q), 6, COLS);
}

export default function play(parent: HTMLElement): Promise<void> {
  return playFilm(parent, {
    id: 'lugar',
    dur: T_END,
    music: 'lugar',
    bg: '#7b3cff',
    titleCols: ['#ffffff', '#fff6d6', '#ffe066', '#3a0a6a'],
    title: () => t('lugar.name', 'Bloop no Lugar'),
    tagline: () => t('lugar.tagline', 'Um Bloop por linha, coluna e cor. E nada de encostar!'),
    titleAt: T_TITLE,
    subs: [
      { t: 0.3, icons: ['target'], text: () => t('intro2.lu.s1', 'Cada cor quer um Bloop...') },
      { t: T_HOP + 0.2, icons: ['check'], text: () => t('intro2.lu.s2', 'Um por linha, um por coluna...') },
      { t: T_HOP + STEP * 3, icons: ['heart'], text: () => t('intro2.lu.s3', '...e nada de encostar!') },
      { t: T_TITLE, icons: [], text: () => '' },
    ],
    cues: [
      { t: 0.3, fn: sfx.swish },
      ...[0, 1, 2, 3, 4].map((q) => ({ t: T_HOP + STEP * q + 0.5, fn: sfx.pop })),
      { t: T_HOP + STEP * 5 + 0.1, fn: sfx.yay },
    ],
    draw: scene,
  });
}
