/* ============================================================
 *  POUSO FORÇADO — instrumentos desenhados em canvas 2D:
 *  PFD (horizonte, velocidade, altitude, razão de subida, proa,
 *  seta-guia, rampa de planeio) e o mapa de navegação. O mesmo canvas
 *  vai para o HUD (tela) e para as telas do painel no 3D.
 * ============================================================ */
import { t } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { GS, RWY_HALF, RWY_LEN, type Sim } from './sim';

const TAU = Math.PI * 2;
const SKY = '#3f8fe0';
const GND = '#a2673a';
const LINE = '#ffffff';
const MAG = '#ff5cd6';
const GRN = '#3fe07a';
const AMB = '#ffcf3a';

function garble(v: string, on: boolean): string {
  if (!on || Math.random() > 0.55) return v;
  return v.replace(/[0-9]/g, () => '?-8#'[Math.floor(Math.random() * 4)]);
}

export function drawPFD(x: CanvasRenderingContext2D, W: number, H: number, s: Sim): void {
  const f = s.f;
  const fl = s.flicker;
  x.save();
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#111426';
  x.beginPath();
  x.roundRect(0, 0, W, H, 18);
  x.fill();
  if (fl && Math.random() < 0.18) {
    // tela piscando na pane elétrica
    x.fillStyle = '#1b1f38';
    x.fillRect(8, 8, W - 16, H - 16);
    x.fillStyle = '#ff5c7a';
    x.font = gameFont(700, 22);
    x.textAlign = 'center';
    x.fillText(t('voo.i.noSignal', 'SEM SINAL'), W / 2, H / 2);
    x.restore();
    return;
  }
  const cx = W * 0.5;
  const cy = H * 0.47;
  const R = Math.min(W * 0.27, H * 0.38);
  const ppr = R * 2.6; // pixels por radiano de arfagem
  // ----- horizonte artificial -----
  x.save();
  x.beginPath();
  x.roundRect(cx - R * 1.15, cy - R, R * 2.3, R * 2, 14);
  x.clip();
  x.translate(cx, cy);
  x.rotate(-f.roll);
  x.translate(0, f.pitch * ppr);
  x.fillStyle = SKY;
  x.fillRect(-R * 3, -R * 4, R * 6, R * 4);
  x.fillStyle = GND;
  x.fillRect(-R * 3, 0, R * 6, R * 4);
  x.strokeStyle = LINE;
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(-R * 3, 0);
  x.lineTo(R * 3, 0);
  x.stroke();
  x.font = gameFont(600, 11);
  x.fillStyle = LINE;
  x.textAlign = 'right';
  for (let d = -20; d <= 20; d += 5) {
    if (!d) continue;
    const y = (-d * Math.PI) / 180 * ppr;
    const w = d % 10 === 0 ? R * 0.42 : R * 0.2;
    x.beginPath();
    x.moveTo(-w, y);
    x.lineTo(w, y);
    x.stroke();
    if (d % 10 === 0) x.fillText(String(Math.abs(d)), -w - 4, y + 4);
  }
  x.restore();
  // marcador do caminho de voo (para onde o avião VAI)
  const fpvY = cy + (f.pitch - f.gamma) * ppr;
  x.strokeStyle = GRN;
  x.lineWidth = 3;
  x.beginPath();
  x.arc(cx, fpvY, 7, 0, TAU);
  x.moveTo(cx - 18, fpvY);
  x.lineTo(cx - 7, fpvY);
  x.moveTo(cx + 7, fpvY);
  x.lineTo(cx + 18, fpvY);
  x.moveTo(cx, fpvY - 7);
  x.lineTo(cx, fpvY - 13);
  x.stroke();
  // asinhas fixas (referência do avião)
  x.strokeStyle = '#111426';
  x.fillStyle = AMB;
  x.lineWidth = 2;
  for (const sd of [-1, 1]) {
    x.beginPath();
    x.rect(cx + sd * R * 0.22, cy - 3, sd * R * 0.42, 6);
    x.fill();
    x.stroke();
  }
  x.fillRect(cx - 3, cy - 3, 6, 6);
  // indicador de inclinação (arco de cima)
  x.strokeStyle = LINE;
  x.lineWidth = 2;
  x.beginPath();
  x.arc(cx, cy, R * 0.95, -Math.PI * 0.5 - 0.8, -Math.PI * 0.5 + 0.8);
  x.stroke();
  x.save();
  x.translate(cx, cy);
  x.rotate(-f.roll);
  x.fillStyle = Math.abs(f.roll) > 0.6 ? '#ff5c7a' : LINE;
  x.beginPath();
  x.moveTo(0, -R * 0.95 + 2);
  x.lineTo(-7, -R * 0.95 + 13);
  x.lineTo(7, -R * 0.95 + 13);
  x.fill();
  x.restore();
  // ----- fitas de velocidade e altitude -----
  const tape = (left: boolean, val: number, step: number, label: string, warnLo: number, target?: number) => {
    const tw = W * 0.15;
    const tx = left ? 8 : W - tw - 8;
    x.save();
    x.beginPath();
    x.roundRect(tx, cy - R, tw, R * 2, 8);
    x.fillStyle = 'rgba(255,255,255,0.08)';
    x.fill();
    x.clip();
    const pxu = (R * 2) / (step * 6);
    x.font = gameFont(600, 11);
    x.fillStyle = LINE;
    x.textAlign = left ? 'right' : 'left';
    const base = Math.floor(val / step) * step;
    for (let k = -4; k <= 4; k++) {
      const v = base + k * step;
      const y = cy - (v - val) * pxu;
      x.fillRect(left ? tx + tw - 8 : tx, y, 8, 2);
      if (v >= 0) x.fillText(String(Math.round(v)), left ? tx + tw - 11 : tx + 11, y + 4);
    }
    if (target !== undefined) {
      const y = Math.max(cy - R + 4, Math.min(cy + R - 4, cy - (target - val) * pxu));
      x.fillStyle = MAG;
      x.beginPath();
      x.moveTo(left ? tx + tw : tx, y);
      x.lineTo(left ? tx + tw - 10 : tx + 10, y - 7);
      x.lineTo(left ? tx + tw - 10 : tx + 10, y + 7);
      x.fill();
    }
    x.restore();
    // caixa do valor
    x.fillStyle = '#000';
    x.strokeStyle = val < warnLo ? '#ff5c7a' : LINE;
    x.lineWidth = 2;
    x.beginPath();
    x.roundRect(tx - 2, cy - 13, tw + 4, 26, 6);
    x.fill();
    x.stroke();
    x.fillStyle = val < warnLo ? '#ff5c7a' : LINE;
    x.font = gameFont(700, 15);
    x.textAlign = 'center';
    x.fillText(garble(String(Math.round(val)), fl), tx + tw / 2, cy + 5);
    x.font = gameFont(700, 10);
    x.fillStyle = '#c8d0ff';
    x.fillText(label, tx + tw / 2, cy - R - 4);
  };
  const vRef = 110 - f.flaps * 18;
  tape(true, f.spd * 1.94, 10, t('voo.i.kt', 'VEL nós'), vRef * 0.6 * 1.94);
  tape(false, f.alt, 100, t('voo.i.alt', 'ALT m'), s.phase === 'final' ? -1 : 300, f.talt);
  // razão de subida
  const vsx = W - 8 - W * 0.15 - 14;
  const vsv = Math.max(-1, Math.min(1, f.vs / 20));
  x.strokeStyle = 'rgba(255,255,255,0.3)';
  x.lineWidth = 6;
  x.beginPath();
  x.moveTo(vsx, cy - R * 0.8);
  x.lineTo(vsx, cy + R * 0.8);
  x.stroke();
  x.strokeStyle = f.vs < -6 && f.alt < 60 ? '#ff5c7a' : GRN;
  x.beginPath();
  x.moveTo(vsx, cy);
  x.lineTo(vsx, cy - vsv * R * 0.8);
  x.stroke();
  x.fillStyle = LINE;
  x.font = gameFont(700, 11);
  x.textAlign = 'center';
  x.fillText(garble((f.vs > 0 ? '+' : '') + f.vs.toFixed(1), fl), vsx, cy + R * 0.8 + 14);
  // ----- rampa e localizador (final) -----
  if (f.loc) {
    const gsErr = (f.alt - Math.max(0, f.z) * GS) / Math.max(30, Math.max(0, f.z) * GS * 0.35);
    const locErr = f.dev / Math.max(60, Math.max(0, f.z) * 0.035);
    const dia = (px: number, py: number) => {
      x.fillStyle = MAG;
      x.strokeStyle = '#000';
      x.lineWidth = 1.5;
      x.beginPath();
      x.moveTo(px, py - 7);
      x.lineTo(px + 6, py);
      x.lineTo(px, py + 7);
      x.lineTo(px - 6, py);
      x.closePath();
      x.fill();
      x.stroke();
    };
    const gx = cx + R * 1.2;
    x.fillStyle = LINE;
    for (let k = -2; k <= 2; k++) if (k) x.fillRect(gx - 3, cy + k * R * 0.35 - 2, 6, 4);
    dia(gx, cy + Math.max(-2.2, Math.min(2.2, gsErr)) * R * 0.35);
    const ly = cy + R + 12;
    for (let k = -2; k <= 2; k++) if (k) x.fillRect(cx + k * R * 0.35 - 2, ly - 3, 4, 6);
    dia(cx - Math.max(-2.2, Math.min(2.2, -locErr)) * R * 0.35, ly);
  }
  // ----- proa e seta-guia -----
  const hy = H - 26;
  const hdgDeg = ((f.hdg * 180) / Math.PI + 360) % 360;
  x.save();
  x.beginPath();
  x.roundRect(cx - R * 1.15, hy - 14, R * 2.3, 30, 8);
  x.fillStyle = 'rgba(255,255,255,0.08)';
  x.fill();
  x.clip();
  x.font = gameFont(600, 11);
  x.fillStyle = LINE;
  x.textAlign = 'center';
  const ppd = (R * 2.3) / 60;
  for (let d = Math.floor(hdgDeg / 10) * 10 - 40; d <= hdgDeg + 40; d += 10) {
    const px = cx + (d - hdgDeg) * ppd;
    x.fillRect(px - 1, hy - 14, 2, 6);
    const dd = ((d % 360) + 360) % 360;
    x.fillText(dd === 0 ? 'N' : dd === 90 ? 'L' : dd === 180 ? 'S' : dd === 270 ? 'O' : String(dd / 10), px, hy + 6);
  }
  const brgDeg = (f.brg * 180) / Math.PI;
  const bx = cx + Math.max(-30, Math.min(30, brgDeg)) * ppd;
  x.fillStyle = MAG;
  x.beginPath();
  x.moveTo(bx, hy - 6);
  x.lineTo(bx - 7, hy - 15);
  x.lineTo(bx + 7, hy - 15);
  x.fill();
  x.restore();
  // seta grande para a pista / fixo
  x.save();
  x.translate(cx, 26);
  x.rotate(f.brg);
  x.fillStyle = MAG;
  x.strokeStyle = '#000';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(0, -14);
  x.lineTo(10, 4);
  x.lineTo(3, 2);
  x.lineTo(3, 12);
  x.lineTo(-3, 12);
  x.lineTo(-3, 2);
  x.lineTo(-10, 4);
  x.closePath();
  x.fill();
  x.stroke();
  x.restore();
  x.font = gameFont(700, 12);
  x.fillStyle = LINE;
  x.textAlign = 'left';
  x.fillText(garble((f.dist / 1000).toFixed(1) + ' km', fl), cx + 18, 22);
  x.fillStyle = f.loc ? GRN : '#c8d0ff';
  x.fillText(f.loc ? t('voo.i.loc', 'PISTA') : t('voo.i.nav', 'ROTA'), cx + 18, 36);
  // ----- estado: trem, flapes, combustível, estol -----
  x.textAlign = 'left';
  x.font = gameFont(700, 11);
  const gearTxt = s.gearStuck ? t('voo.i.gearStuck', 'TREM TRAVADO') : f.gearPos > 0.98 ? t('voo.i.gearDn', 'TREM ▼') : f.gearPos < 0.02 ? t('voo.i.gearUp', 'TREM ▲') : t('voo.i.gearMv', 'TREM ...');
  x.fillStyle = s.gearStuck ? '#ff5c7a' : f.gearPos > 0.98 ? GRN : AMB;
  x.fillText(gearTxt, 12, H - 30);
  x.fillStyle = LINE;
  x.fillText(t('voo.i.flaps', 'FLAPE {n}', { n: f.flaps }), 12, H - 16);
  x.fillStyle = f.fuel < 12 ? '#ff5c7a' : LINE;
  x.textAlign = 'right';
  x.fillText(t('voo.i.fuel', 'COMB {n}%', { n: Math.round(f.fuel) }), W - 12, H - 30);
  x.fillStyle = LINE;
  x.fillText(t('voo.i.thr', 'POT {n}%', { n: Math.round(f.thr * 100) }), W - 12, H - 16);
  if (f.stall && Math.floor(s.time * 4) % 2 === 0) {
    x.fillStyle = '#ff5c7a';
    x.font = gameFont(700, 20);
    x.textAlign = 'center';
    x.fillText(t('voo.i.stall', 'ESTOL'), cx, cy - R * 0.45);
  }
  x.restore();
}

/** mapa de navegação: avião no centro, nariz para cima */
export function drawNav(x: CanvasRenderingContext2D, W: number, H: number, s: Sim): void {
  const f = s.f;
  x.save();
  x.clearRect(0, 0, W, H);
  x.fillStyle = '#0f1630';
  x.beginPath();
  x.roundRect(0, 0, W, H, 18);
  x.fill();
  x.beginPath();
  x.roundRect(4, 4, W - 8, H - 8, 14);
  x.clip();
  const cx = W / 2;
  const cy = H * 0.68;
  const range = f.loc ? 8000 : 26000;
  const k = (H * 0.6) / range;
  const toScr = (wx: number, wz: number): [number, number] => {
    const dx = wx - f.x;
    const dz = wz - f.z;
    // gira para o nariz ficar para cima
    const c = Math.cos(-f.hdg);
    const sn = Math.sin(-f.hdg);
    const rx = dx * c - dz * sn;
    const rz = dx * sn + dz * c;
    return [cx + rx * k, cy + rz * k];
  };
  x.strokeStyle = 'rgba(255,255,255,0.12)';
  x.lineWidth = 1;
  for (const r of [0.33, 0.66, 1]) {
    x.beginPath();
    x.arc(cx, cy, H * 0.6 * r, 0, TAU);
    x.stroke();
  }
  // linha de aproximação e fixo
  x.setLineDash([6, 6]);
  x.strokeStyle = MAG;
  x.lineWidth = 2;
  const a = toScr(0, 17000);
  const b0 = toScr(0, 0);
  x.beginPath();
  x.moveTo(a[0], a[1]);
  x.lineTo(b0[0], b0[1]);
  x.stroke();
  x.setLineDash([]);
  x.fillStyle = MAG;
  x.beginPath();
  x.arc(a[0], a[1], 5, 0, TAU);
  x.fill();
  // pista
  const p1 = toScr(-RWY_HALF, 0);
  const p2 = toScr(-RWY_HALF, -RWY_LEN);
  const p3 = toScr(RWY_HALF, -RWY_LEN);
  const p4 = toScr(RWY_HALF, 0);
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.moveTo(p1[0], p1[1]);
  x.lineTo(p2[0], p2[1]);
  x.lineTo(p3[0], p3[1]);
  x.lineTo(p4[0], p4[1]);
  x.closePath();
  x.fill();
  x.lineWidth = 3;
  x.strokeStyle = '#ffffff';
  x.beginPath();
  x.moveTo(p1[0], p1[1]);
  x.lineTo(p2[0], p2[1]);
  x.stroke();
  // avião
  x.fillStyle = AMB;
  x.strokeStyle = '#000';
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx, cy - 12);
  x.lineTo(cx + 10, cy + 6);
  x.lineTo(cx, cy + 2);
  x.lineTo(cx - 10, cy + 6);
  x.closePath();
  x.fill();
  x.stroke();
  x.restore();
  x.font = gameFont(700, 12);
  x.fillStyle = '#c8d0ff';
  x.textAlign = 'left';
  const eta = f.dist / Math.max(30, f.spd);
  x.fillText(t('voo.i.eta', 'Chegada em {m}:{s}', { m: Math.floor(eta / 60), s: String(Math.floor(eta % 60)).padStart(2, '0') }), 12, 20);
  x.textAlign = 'right';
  x.fillText((range / 1000).toFixed(0) + ' km', W - 12, 20);
}
