/* ============================================================
 *  POUSO FORÇADO — HANGAR (tela de entrada).
 *  Um palco 2D desenhado em canvas (leve em qualquer celular e não
 *  dispara o giro de tela do hub): hangar com luz suave, o avião com a
 *  pintura escolhida e o seu Bloop com o chapéu do papel. Por cima:
 *  cartões grandes de papel, o botão VOAR (padrões inteligentes),
 *  "Voar com amigos", Voo do dia / Treino e a folha de Ajustes
 *  (visão, ajudantes, pintura e cabine com miniaturas).
 * ============================================================ */
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import { save as globalSave } from '../../core/storage';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS, type Skin } from '../../game/skins';
import { icon } from '../../ui/icons';
import { openStartMenu } from '../../ui/startmenu';
import { BOT_SKINS, CABINS, LIVERIES, roleName, type Cabin, type Livery } from './data';
import { hatIcon, vIcon } from './icons';
import { cabinOf, dayIndex, liveryOf, writeSave, type VooSave } from './save';

const INK = '#2a0b5c';
const TAU = Math.PI * 2;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export type FlightKind = 'normal' | 'daily' | 'training';
export type HangarPick = { kind: 'fly'; flight: FlightKind; mode: '2d' | '3d' } | { kind: 'friends'; mode: '2d' | '3d' } | { kind: 'exit' };
export interface HangarOpts {
  sv: VooSave;
  /** WebGL disponível */
  gl: boolean;
  /** aparelho fraco (menos partículas, DPR menor) */
  weak: boolean;
  /** moedas extras do primeiro voo do dia */
  dailyBonus: number;
}

/* ============================== arte 2D ============================== */

const skinOf = (id: string): Skin => SKINS.find((k) => k.id === id) ?? SKINS.find((k) => k.id === globalSave.skin) ?? SKINS[0];

const hatImgs: (HTMLImageElement | null)[] = [null, null, null, null];
/** chapéu do papel como imagem (para desenhar no canvas) */
export function hatImage(role: number, onload?: () => void): HTMLImageElement | null {
  const cur = hatImgs[role];
  if (cur) return cur.complete && cur.naturalWidth ? cur : null;
  const img = new Image();
  img.onload = () => onload?.();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(hatIcon(role, 96).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  hatImgs[role] = img;
  return null;
}

/** Bloop (skin do jogador) com o chapéu do papel; (cx, cy) = centro do corpo */
export function drawBloopHat(x: CanvasRenderingContext2D, skinId: string, role: number, cx: number, cy: number, R: number, time: number, wave = 0, onHat?: () => void): void {
  const pose: PlayerPose = { t: time, blink: (time % 3.4) < 0.12 ? 1 : 0, lookX: 0.12, lookY: 0.08, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: false };
  x.save();
  x.translate(cx, cy);
  try {
    drawPlayer(x, skinOf(skinId), R, pose);
  } catch {
    x.fillStyle = '#ff8ad8';
    x.beginPath();
    x.arc(0, 0, R, 0, TAU);
    x.fill();
  }
  // bracinho acenando
  if (wave > 0) {
    const a = -0.9 + Math.sin(time * 7) * 0.45 * wave;
    x.save();
    x.translate(R * 0.82, -R * 0.05);
    x.rotate(a);
    x.fillStyle = skinOf(skinId).light;
    x.strokeStyle = INK;
    x.lineWidth = Math.max(1.5, R * 0.09);
    x.beginPath();
    x.ellipse(R * 0.28, 0, R * 0.32, R * 0.16, 0, 0, TAU);
    x.fill();
    x.stroke();
    x.restore();
  }
  const img = hatImage(role, onHat);
  if (img) {
    const W = R * (role <= 1 ? 1.95 : 1.75);
    const tilt = role === 2 ? -0.12 : role === 3 ? 0.06 : -0.04;
    x.translate(0, -R * 0.78);
    x.rotate(tilt);
    // o ícone tem a aba em ~y=31/48: encaixa a aba na testa
    x.drawImage(img, -W / 2, -W * 0.62, W, W);
  }
  x.restore();
}

/** Avião de perfil (nariz para a direita). L = comprimento em px; (cx, cy) = centro da fuselagem. */
export function drawPlane(x: CanvasRenderingContext2D, cx: number, cy: number, L: number, liv: Livery, time: number, o: { gear?: boolean; lights?: boolean; cabin?: Cabin } = {}): void {
  const lw = Math.max(1.2, L * 0.011);
  x.save();
  x.translate(cx, cy);
  x.scale(L, L);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  const ink = () => {
    x.strokeStyle = INK;
    x.lineWidth = lw / L;
    x.stroke();
  };
  const dark = shade(liv.body, -0.18);
  // asa do outro lado (atrás da fuselagem)
  x.beginPath();
  x.moveTo(0.06, -0.01);
  x.lineTo(-0.14, -0.13);
  x.lineTo(-0.19, -0.13);
  x.lineTo(-0.06, 0.0);
  x.closePath();
  x.fillStyle = shade(liv.belly, -0.25);
  x.fill();
  ink();
  // estabilizador do outro lado
  x.beginPath();
  x.moveTo(-0.4, -0.05);
  x.lineTo(-0.47, -0.1);
  x.lineTo(-0.5, -0.1);
  x.lineTo(-0.47, -0.04);
  x.closePath();
  x.fillStyle = shade(liv.tail, -0.25);
  x.fill();
  ink();
  // trem de pouso
  if (o.gear !== false) {
    x.lineWidth = 0.012;
    x.strokeStyle = '#4a4560';
    x.beginPath();
    x.moveTo(0.36, 0.06);
    x.lineTo(0.36, 0.125);
    x.moveTo(-0.05, 0.06);
    x.lineTo(-0.05, 0.125);
    x.moveTo(-0.0, 0.06);
    x.lineTo(-0.0, 0.125);
    x.stroke();
    for (const wx of [0.36, -0.05, 0.0]) {
      x.beginPath();
      x.arc(wx, 0.132, wx > 0.2 ? 0.018 : 0.024, 0, TAU);
      x.fillStyle = '#2a2d40';
      x.fill();
      ink();
      x.beginPath();
      x.arc(wx, 0.132, 0.008, 0, TAU);
      x.fillStyle = '#9aa0b4';
      x.fill();
    }
  }
  // fuselagem
  const body = new Path2D();
  body.moveTo(-0.5, -0.07);
  body.lineTo(0.3, -0.075);
  body.bezierCurveTo(0.42, -0.075, 0.5, -0.03, 0.5, 0.015);
  body.bezierCurveTo(0.5, 0.055, 0.45, 0.075, 0.36, 0.075);
  body.lineTo(-0.26, 0.075);
  body.bezierCurveTo(-0.37, 0.075, -0.46, 0.02, -0.5, -0.025);
  body.closePath();
  x.fillStyle = liv.body;
  x.fill(body);
  x.save();
  x.clip(body);
  // barriga
  x.fillStyle = liv.belly;
  x.fillRect(-0.6, 0.028, 1.2, 0.1);
  // faixa (arco-íris tem faixa colorida)
  if (liv.id === 'rainbow') {
    const g = x.createLinearGradient(-0.5, 0, 0.5, 0);
    ['#ff5c7a', '#ffb02e', '#ffe14a', '#3ee07a', '#2fb6ff', '#8a5cff'].forEach((c, i) => g.addColorStop(i / 5, c));
    x.fillStyle = g;
  } else x.fillStyle = liv.stripe;
  x.fillRect(-0.6, 0.004, 1.2, 0.016);
  // brilho de cima
  const hg = x.createLinearGradient(0, -0.075, 0, 0.0);
  hg.addColorStop(0, 'rgba(255,255,255,.55)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = hg;
  x.fillRect(-0.6, -0.08, 1.2, 0.06);
  // sombra de baixo
  const sg = x.createLinearGradient(0, 0.03, 0, 0.08);
  sg.addColorStop(0, 'rgba(42,11,92,0)');
  sg.addColorStop(1, 'rgba(42,11,92,.22)');
  x.fillStyle = sg;
  x.fillRect(-0.6, 0.03, 1.2, 0.06);
  x.restore();
  x.lineWidth = (lw * 1.15) / L;
  x.strokeStyle = INK;
  x.stroke(body);
  // janelas (acesas com a cor da cabine)
  const win = o.cabin ? o.cabin.seat : '#7ad8ff';
  for (let wx = -0.33; wx < 0.3; wx += 0.036) {
    if (Math.abs(wx - 0.205) < 0.02 || Math.abs(wx + 0.255) < 0.02) continue; // portas
    x.beginPath();
    x.roundRect(wx - 0.008, -0.04, 0.016, 0.022, 0.007);
    x.fillStyle = o.lights ? win : '#5a6a9a';
    x.fill();
    x.lineWidth = lw * 0.55 / L;
    x.strokeStyle = INK;
    x.stroke();
    if (o.lights) {
      x.fillStyle = 'rgba(255,255,255,.7)';
      x.fillRect(wx - 0.005, -0.037, 0.004, 0.008);
    }
  }
  // portas
  x.lineWidth = lw * 0.6 / L;
  for (const dx of [0.205, -0.255]) {
    x.beginPath();
    x.roundRect(dx - 0.017, -0.055, 0.034, 0.1, 0.01);
    x.strokeStyle = shade(liv.body, -0.35);
    x.stroke();
  }
  // para-brisa
  x.beginPath();
  x.moveTo(0.405, -0.045);
  x.lineTo(0.455, -0.045);
  x.quadraticCurveTo(0.475, -0.03, 0.482, -0.015);
  x.lineTo(0.415, -0.015);
  x.closePath();
  x.fillStyle = '#2b3a7a';
  x.fill();
  x.lineWidth = lw * 0.7 / L;
  x.strokeStyle = INK;
  x.stroke();
  x.fillStyle = 'rgba(160,230,255,.8)';
  x.fillRect(0.418, -0.04, 0.012, 0.008);
  // cauda (deriva) com o logo do Bloop
  x.beginPath();
  x.moveTo(-0.33, -0.072);
  x.lineTo(-0.43, -0.25);
  x.quadraticCurveTo(-0.46, -0.27, -0.49, -0.26);
  x.lineTo(-0.5, -0.07);
  x.closePath();
  x.fillStyle = liv.tail;
  x.fill();
  ink();
  x.beginPath();
  x.arc(-0.448, -0.16, 0.034, 0, TAU);
  x.fillStyle = '#fff';
  x.fill();
  x.lineWidth = lw * 0.6 / L;
  x.stroke();
  x.fillStyle = INK;
  x.beginPath();
  x.arc(-0.459, -0.163, 0.006, 0, TAU);
  x.arc(-0.437, -0.163, 0.006, 0, TAU);
  x.fill();
  x.beginPath();
  x.arc(-0.448, -0.152, 0.01, 0.15 * Math.PI, 0.85 * Math.PI);
  x.lineWidth = 0.004;
  x.stroke();
  // estabilizador deste lado
  x.beginPath();
  x.moveTo(-0.38, -0.035);
  x.lineTo(-0.47, -0.005);
  x.lineTo(-0.505, -0.005);
  x.lineTo(-0.47, -0.045);
  x.closePath();
  x.fillStyle = liv.tail;
  x.fill();
  ink();
  // asa deste lado
  x.beginPath();
  x.moveTo(0.09, 0.03);
  x.lineTo(-0.13, 0.12);
  x.quadraticCurveTo(-0.17, 0.135, -0.19, 0.12);
  x.lineTo(-0.07, 0.04);
  x.closePath();
  x.fillStyle = dark;
  x.fill();
  ink();
  // motor sob a asa
  const ex = 0.0;
  const ey = 0.085;
  x.beginPath();
  x.roundRect(ex - 0.08, ey - 0.028, 0.15, 0.056, 0.028);
  x.fillStyle = liv.body;
  x.fill();
  ink();
  x.fillStyle = liv.stripe;
  x.fillRect(ex - 0.055, ey - 0.027, 0.014, 0.054);
  // entrada de ar com hélice girando (brilho)
  x.beginPath();
  x.ellipse(ex + 0.07, ey, 0.012, 0.026, 0, 0, TAU);
  x.fillStyle = '#2a2d40';
  x.fill();
  ink();
  const sp = (time * 9) % 1;
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.ellipse(ex + 0.071, ey - 0.02 + sp * 0.04, 0.005, 0.004, 0, 0, TAU);
  x.fill();
  // luzes: farol vermelho piscando
  if (o.lights) {
    const on = Math.sin(time * 5) > 0.6;
    x.fillStyle = on ? '#ff3d5a' : '#7a2030';
    x.beginPath();
    x.arc(0.05, -0.078, 0.009, 0, TAU);
    x.fill();
    if (on) {
      const rg = x.createRadialGradient(0.05, -0.078, 0, 0.05, -0.078, 0.06);
      rg.addColorStop(0, 'rgba(255,60,90,.55)');
      rg.addColorStop(1, 'rgba(255,60,90,0)');
      x.fillStyle = rg;
      x.fillRect(-0.02, -0.15, 0.14, 0.14);
    }
  }
  x.restore();
}

/** clareia (+) ou escurece (-) uma cor hex */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k < 0) {
    r = Math.round(r * (1 + k));
    g = Math.round(g * (1 + k));
    b = Math.round(b * (1 + k));
  } else {
    r = Math.round(r + (255 - r) * k);
    g = Math.round(g + (255 - g) * k);
    b = Math.round(b + (255 - b) * k);
  }
  return `rgb(${r},${g},${b})`;
}

/** miniatura da cabine: fileiras de poltronas sobre o carpete */
function drawCabinThumb(x: CanvasRenderingContext2D, w: number, h: number, c: Cabin): void {
  x.fillStyle = c.carpet;
  x.fillRect(0, 0, w, h);
  // corredor
  x.fillStyle = 'rgba(255,255,255,.12)';
  x.fillRect(w * 0.44, 0, w * 0.12, h);
  const sw = w * 0.17;
  for (let row = 0; row < 3; row++) {
    const y = h * 0.14 + row * h * 0.29;
    for (const sx of [0.06, 0.25, 0.58, 0.77]) {
      const X = w * sx;
      x.fillStyle = c.seat;
      x.strokeStyle = INK;
      x.lineWidth = 2;
      x.beginPath();
      x.roundRect(X, y, sw, h * 0.2, 5);
      x.fill();
      x.stroke();
      x.fillStyle = c.seat2;
      x.beginPath();
      x.roundRect(X + 2, y + 2, sw - 4, h * 0.06, 3);
      x.fill();
    }
  }
}

/* ============================== tela ============================== */

const ROLE_DESC = (r: number): string =>
  r === 0
    ? t('voo.hg.r0', 'Começa no manche')
    : r === 1
      ? t('voo.hg.r1', 'Começa na primeira classe')
      : r === 2
        ? t('voo.hg.r2', 'Começa na copa')
        : t('voo.hg.r3', 'Começa no fundo, perto do porão');

export interface HangarHandle {
  el: HTMLElement;
  done: Promise<HangarPick>;
  /** fecha (botão voltar do sistema): fecha a folha de ajustes se aberta, senão sai */
  back(): void;
  destroy(): void;
}

export function openHangar(root: HTMLElement, o: HangarOpts): HangarHandle {
  const sv = o.sv;
  let mode: '2d' | '3d' = sv.mode === '2d' || !o.gl ? '2d' : '3d';
  const today = dayIndex();
  const dailyDone = sv.daily.day === today;
  let resolve!: (p: HangarPick) => void;
  const done = new Promise<HangarPick>((r) => (resolve = r));
  let closed = false;
  let leaving = 0; // >0: avião taxiando para fora
  let repaint = 0; // brilho da troca de pintura
  const motes = Array.from({ length: o.weak ? 14 : 34 }, (_, i) => ({ x: (i * 0.618) % 1, y: ((i * 0.377) % 1) * 0.8, s: 0.6 + ((i * 7) % 5) / 4, p: i }));
  let lastT = 0;

  /* ---------- palco do hangar (fundo do menu padrão) ---------- */
  const stage = (x: CanvasRenderingContext2D, W: number, H: number, time: number, box: { x: number; y: number; w: number; h: number }) => {
    const dt = Math.min(0.05, Math.max(0, time - lastT));
    lastT = time;
    if (repaint > 0) repaint = Math.max(0, repaint - dt * 1.6);
    if (leaving > 0) leaving += dt;
    const { x: bx, y: by, w: bw, h: bh } = box;
    drawHangar(x, W, H, time, bx, by, bw, bh);
    // avião
    const liv = liveryOf(sv);
    const L = Math.min(bw * 0.9, bh * 2.1, 620);
    const floorY = by + bh * 0.84;
    const cy = floorY - L * 0.148 + Math.sin(time * 1.6) * L * 0.004;
    let pcx = bx + bw * 0.5;
    if (leaving > 0) pcx += Math.pow(leaving * 1.7, 2) * W;
    // reflexo no piso
    x.save();
    x.globalAlpha = 0.1;
    x.translate(0, floorY * 2 + L * 0.02);
    x.scale(1, -1);
    drawPlane(x, pcx, cy, L, liv, time, { lights: true, cabin: cabinOf(sv) });
    x.restore();
    // sombra
    const sh = x.createRadialGradient(pcx, floorY, 0, pcx, floorY, L * 0.45);
    sh.addColorStop(0, 'rgba(20,6,50,.45)');
    sh.addColorStop(1, 'rgba(20,6,50,0)');
    x.fillStyle = sh;
    x.save();
    x.translate(pcx, floorY);
    x.scale(1, 0.12);
    x.beginPath();
    x.arc(0, 0, L * 0.45, 0, TAU);
    x.fill();
    x.restore();
    drawPlane(x, pcx, cy, L, liv, time, { lights: true, cabin: cabinOf(sv) });
    // brilho de "pintura nova"
    if (repaint > 0) {
      x.save();
      x.globalCompositeOperation = 'lighter';
      const k = 1 - repaint;
      const gx = pcx - L * 0.6 + k * L * 1.2;
      const g = x.createLinearGradient(gx - L * 0.12, 0, gx + L * 0.12, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,255,230,${0.55 * repaint})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g;
      x.fillRect(pcx - L * 0.6, cy - L * 0.3, L * 1.2, L * 0.45);
      x.restore();
    }
    // Bloop com o chapéu, na frente do nariz (acenando)
    if (leaving === 0) {
      const R = Math.max(13, L * 0.07);
      const bxp = Math.min(bx + bw - R * 1.3, pcx + L * 0.36);
      const fy = floorY + R * 0.5;
      const hop = Math.abs(Math.sin(time * 2.4)) * R * 0.12;
      x.fillStyle = 'rgba(20,6,50,.4)';
      x.beginPath();
      x.ellipse(bxp, fy, R * 0.9, R * 0.2, 0, 0, TAU);
      x.fill();
      drawBloopHat(x, globalSave.skin, sv.role, bxp, fy - R * 0.95 - hop, R, time, 1);
      for (const k of [-0.42, 0.3]) cone(x, pcx + L * k, floorY, L * 0.035);
    }
    // poeira na luz
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const mx = ((m.x + Math.sin(time * 0.2 + m.p) * 0.02 + time * 0.004 * m.s) % 1) * W;
      const my = ((((m.y - time * 0.01 * m.s) % 0.8) + 0.8) % 0.8) * H;
      const a = 0.18 + 0.18 * Math.sin(time * 1.3 + m.p);
      x.fillStyle = `rgba(255,236,200,${a})`;
      x.beginPath();
      x.arc(mx, my, m.s * 1.3, 0, TAU);
      x.fill();
    }
    x.restore();
    if (leaving > 0) {
      x.fillStyle = `rgba(20,8,48,${Math.min(1, leaving * 1.8)})`;
      x.fillRect(0, 0, W, H);
    }
  };

  const summary = () => [mode === '3d' ? '3D' : '2D', sv.bots === 0 ? t('voo.lobby.solo', 'Sozinho') : t('voo.hg.helpersN', '{n} ajudantes', { n: sv.bots }), liveryOf(sv).name()].join(' · ');
  const roleArt =
    (r: number) =>
    (x: CanvasRenderingContext2D, w: number, h: number, time: number): void => {
      const sel = r === sv.role;
      const R = Math.min(w * 0.3, h * 0.34);
      const hop = sel ? Math.abs(Math.sin(time * 3.2)) * R * 0.22 : 0;
      x.fillStyle = 'rgba(42,11,92,.18)';
      x.beginPath();
      x.ellipse(w / 2, h * 0.88, R * 0.95 - hop * 0.8, R * 0.2, 0, 0, TAU);
      x.fill();
      drawBloopHat(x, globalSave.skin, r, w / 2, h * 0.88 - R * 1.05 - hop, R, sel ? time : 0, sel ? 1 : 0);
    };

  const sm = openStartMenu(root, {
    game: 'voo',
    className: 'vh',
    title: t('voo.name', 'Pouso Forçado'),
    sub: t('voo.lobby.sub', 'O comandante desmaiou. Pousem esse avião!'),
    backdrop: stage,
    chips: [
      { icon: vIcon('star', 18), text: String(sv.stars) },
      { icon: vIcon('trophy', 18), text: String(sv.best) },
    ],
    weak: o.weak,
    onBack: () => finish({ kind: 'exit' }, false),
    onSettings: () => openSheet(),
    build: (p) => {
      p.label(t('voo.lobby.role', 'Seu papel'));
      p.cards(
        [0, 1, 2, 3].map((r) => ({
          id: 'r' + r,
          art: roleArt(r),
          live: true,
          label: roleName(r),
          say: `${roleName(r)}. ${ROLE_DESC(r)}`,
          color: '#fff3d6',
          sel: sv.role === r,
          onTap: () => {
            sv.role = r;
            writeSave(sv);
            p.refresh();
          },
        })),
        { cols: 4 },
      );
      p.play({ label: t('voo.hg.fly', 'VOAR'), icon: vIcon('plane', 44), sub: summary(), onTap: () => finish({ kind: 'fly', flight: 'normal', mode }, true) });
      p.friends({ label: t('voo.hg.friends', 'Voar com amigos'), game: 'voo', onTap: () => finish({ kind: 'friends', mode }, false) });
      p.cards(
        [
          { id: 'daily', icon: vIcon('calendar', 34), label: t('voo.mode.daily', 'Voo do dia'), sub: dailyDone ? '★ ' + sv.daily.stars : '+' + o.dailyBonus, color: '#ffc8e4', onTap: () => finish({ kind: 'fly', flight: 'daily', mode }, true) },
          { id: 'train', icon: vIcon('school', 34), label: t('voo.mode.training', 'Treino de pouso'), sub: t('voo.hg.trainSub', 'Só a final'), color: '#d8ecff', onTap: () => finish({ kind: 'fly', flight: 'training', mode }, true) },
        ],
        { size: 'small', cols: 2 },
      );
    },
  });
  const el = sm.el;

  /* ---------- folha de Ajustes ---------- */
  let sheet: HTMLElement | null = null;
  const closeSheet = () => {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    s.classList.remove('in');
    setTimeout(() => s.remove(), 260);
    sm.refresh();
  };
  const openSheet = () => {
    if (sheet) return;
    const s = document.createElement('div');
    s.className = 'vh-sheetwrap';
    const helperTile = (n: number) =>
      `<button class="vh-tile help ${sv.bots === n ? 'sel' : ''}" data-b="${n}"><canvas width="132" height="64"></canvas><b>${n === 0 ? esc(t('voo.lobby.solo', 'Sozinho')) : esc(t('voo.hg.plusN', '+{n}', { n }))}</b></button>`;
    s.innerHTML = `<div class="vh-sheet" role="dialog" aria-label="${esc(t('voo.hg.settings', 'Ajustes'))}">
      <div class="vh-grab"></div>
      <h3>${icon('gear', { size: 26 })}${esc(t('voo.hg.settings', 'Ajustes'))}<button class="vh-ok" data-ok>${esc(t('voo.hg.done', 'Pronto'))}</button></h3>
      <div class="vh-sec"><b>${esc(t('voo.lobby.view', 'Visão'))}</b><div class="vh-tiles two">
        <button class="vh-tile view ${mode === '3d' ? 'sel' : ''}" data-m="3d" ${o.gl ? '' : 'disabled'}><span class="vh-vthumb v3">${vIcon('cube', 40)}</span><b>3D</b><small>${esc(o.gl ? (o.weak ? t('voo.lobby.3dWeak', 'Primeira pessoa (pode pesar aqui)') : t('voo.lobby.3d', 'Primeira pessoa, dentro do avião')) : t('voo.lobby.no3d', 'Indisponível neste aparelho'))}</small></button>
        <button class="vh-tile view ${mode === '2d' ? 'sel' : ''}" data-m="2d"><span class="vh-vthumb v2">${vIcon('square', 40)}</span><b>2D</b><small>${esc(t('voo.lobby.2d', 'Vista de cima, leve'))}</small></button>
      </div></div>
      <div class="vh-sec"><b>${esc(t('voo.lobby.helpers', 'Ajudantes Bloop'))}</b><div class="vh-tiles four">${[0, 1, 2, 3].map(helperTile).join('')}</div>
        <div class="vh-note">${esc(t('voo.lobby.botsNote', 'Eles só agem quando você manda, e demoram um pouco. Pilotar e pousar é com você!'))}</div></div>
      <div class="vh-sec"><b>${esc(t('voo.lobby.livery', 'Pintura do avião'))}</b><div class="vh-tiles three">${LIVERIES.map(
        (l) =>
          `<button class="vh-tile liv ${liveryOf(sv).id === l.id ? 'sel' : ''} ${sv.stars >= l.stars ? '' : 'lock'}" data-l="${l.id}"><canvas width="180" height="84"></canvas><b>${esc(l.name())}</b>${
            sv.stars >= l.stars ? '' : `<em>${icon('lock', { size: 14 })}${vIcon('star', 14)}${l.stars}</em>`
          }</button>`,
      ).join('')}</div></div>
      <div class="vh-sec"><b>${esc(t('voo.lobby.cabin', 'Cabine'))}</b><div class="vh-tiles four">${CABINS.map(
        (c) =>
          `<button class="vh-tile cab ${cabinOf(sv).id === c.id ? 'sel' : ''} ${sv.perfects >= c.perfect ? '' : 'lock'}" data-c="${c.id}"><canvas width="120" height="84"></canvas><b>${esc(c.name())}</b>${
            sv.perfects >= c.perfect ? '' : `<em>${icon('lock', { size: 14 })}${vIcon('check', 14)}${c.perfect}</em>`
          }</button>`,
      ).join('')}</div></div>
    </div>`;
    el.appendChild(s);
    sheet = s;
    // miniaturas
    s.querySelectorAll<HTMLButtonElement>('.vh-tile.liv').forEach((b) => {
      const l = LIVERIES.find((q) => q.id === b.dataset.l)!;
      const c = b.querySelector('canvas')!;
      const cx = c.getContext('2d')!;
      drawPlane(cx, 92, 46, 160, l, 0.3, { lights: true });
    });
    s.querySelectorAll<HTMLButtonElement>('.vh-tile.cab').forEach((b) => {
      const cb = CABINS.find((q) => q.id === b.dataset.c)!;
      const c = b.querySelector('canvas')!;
      drawCabinThumb(c.getContext('2d')!, c.width, c.height, cb);
    });
    s.querySelectorAll<HTMLButtonElement>('.vh-tile.help').forEach((b) => {
      const n = +b.dataset.b!;
      const c = b.querySelector('canvas')!;
      const cx = c.getContext('2d')!;
      const all = [globalSave.skin, ...BOT_SKINS.slice(0, n)];
      const step = 30;
      const x0 = 66 - ((all.length - 1) * step) / 2;
      all.forEach((sk, i) => {
        const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
        cx.save();
        cx.translate(x0 + i * step, 36);
        try {
          drawPlayer(cx, skinOf(sk), i === 0 ? 19 : 15, pose);
        } catch {
          /* */
        }
        cx.restore();
      });
    });
    requestAnimationFrame(() => s.classList.add('in'));
    s.addEventListener('click', (e) => {
      const tgt = e.target as HTMLElement;
      if (tgt === s) return closeSheet();
      const b = tgt.closest('button') as HTMLButtonElement | null;
      if (!b || b.disabled) return;
      audio.click();
      if (b.dataset.ok !== undefined) return closeSheet();
      if (b.classList.contains('lock')) {
        b.classList.remove('shake');
        void b.offsetWidth;
        b.classList.add('shake');
        tap('light');
        return;
      }
      const group = b.parentElement!;
      if (b.dataset.m) {
        mode = b.dataset.m as '2d' | '3d';
        sv.mode = mode;
      }
      if (b.dataset.b) sv.bots = +b.dataset.b;
      if (b.dataset.l) {
        if (sv.livery !== b.dataset.l) {
          repaint = 1;
          sfx.sparkle();
        }
        sv.livery = b.dataset.l;
      }
      if (b.dataset.c) sv.cabin = b.dataset.c;
      group.querySelectorAll('.vh-tile').forEach((q) => q.classList.toggle('sel', q === b));
      tap('light');
      writeSave(sv);
    });
  };

  /* ---------- saída ---------- */
  const finish = (p: HangarPick, anim: boolean) => {
    if (closed) return;
    closed = true;
    closeSheet();
    sv.mode = mode;
    writeSave(sv);
    const end = () => {
      destroy();
      resolve(p);
    };
    if (anim) {
      leaving = 0.001;
      el.classList.add('out');
      sfx.whoosh();
      setTimeout(end, 650);
    } else end();
  };

  function destroy(): void {
    sm.destroy();
  }

  return {
    el,
    done,
    back() {
      if (sheet) closeSheet();
      else sm.back();
    },
    destroy() {
      if (!closed) {
        closed = true;
        destroy();
      }
    },
  };
}

function cone(x: CanvasRenderingContext2D, cx: number, fy: number, s: number): void {
  x.save();
  x.translate(cx, fy);
  x.beginPath();
  x.moveTo(-s * 0.35, -s * 1.6);
  x.lineTo(s * 0.35, -s * 1.6);
  x.lineTo(s * 0.8, 0);
  x.lineTo(-s * 0.8, 0);
  x.closePath();
  x.fillStyle = '#ff8a3a';
  x.fill();
  x.strokeStyle = INK;
  x.lineWidth = Math.max(1.2, s * 0.14);
  x.stroke();
  x.fillStyle = '#fff';
  x.fillRect(-s * 0.55, -s * 0.85, s * 1.1, s * 0.32);
  x.fillStyle = INK;
  x.fillRect(-s * 1.0, -s * 0.12, s * 2.0, s * 0.18);
  x.restore();
}

/** fundo do hangar: parede de chapas, portão aberto para o pôr do sol, lâmpadas e piso brilhante */
function drawHangar(x: CanvasRenderingContext2D, W: number, H: number, time: number, bx: number, by: number, bw: number, bh: number): void {
  const floorY = by + bh * 0.84;
  // parede
  const wall = x.createLinearGradient(0, 0, 0, floorY);
  wall.addColorStop(0, '#1d0f4a');
  wall.addColorStop(1, '#4a2a8e');
  x.fillStyle = wall;
  x.fillRect(0, 0, W, floorY);
  // chapas onduladas
  x.fillStyle = 'rgba(255,255,255,.035)';
  for (let px = 0; px < W; px += 22) x.fillRect(px, 0, 9, floorY);
  // portão (arco) com o céu do pôr do sol
  const gw = Math.min(W * 0.92, bw * 1.05);
  const gx = bx + bw / 2 - gw / 2;
  const gy = Math.max(by - bh * 0.05, floorY - Math.min(bh * 1.05, gw * 0.62));
  const gh = floorY - gy;
  const r = Math.min(gw * 0.5, gh * 0.55);
  const gate = new Path2D();
  gate.moveTo(gx, floorY);
  gate.lineTo(gx, gy + r);
  gate.quadraticCurveTo(gx, gy, gx + r, gy);
  gate.lineTo(gx + gw - r, gy);
  gate.quadraticCurveTo(gx + gw, gy, gx + gw, gy + r);
  gate.lineTo(gx + gw, floorY);
  gate.closePath();
  x.save();
  x.clip(gate);
  const sky = x.createLinearGradient(0, gy, 0, floorY);
  sky.addColorStop(0, '#5a4ab8');
  sky.addColorStop(0.55, '#ff8fa0');
  sky.addColorStop(1, '#ffd08a');
  x.fillStyle = sky;
  x.fillRect(gx, gy, gw, gh);
  // sol
  const sx = gx + gw * 0.78;
  const sy = floorY - gh * 0.12;
  const sg = x.createRadialGradient(sx, sy, 0, sx, sy, gh * 0.55);
  sg.addColorStop(0, 'rgba(255,245,200,1)');
  sg.addColorStop(0.2, 'rgba(255,220,150,.8)');
  sg.addColorStop(1, 'rgba(255,200,150,0)');
  x.fillStyle = sg;
  x.fillRect(gx, gy, gw, gh);
  // nuvens
  for (let i = 0; i < 5; i++) {
    const k = ((i * 0.27 + time * 0.012 * (1 + (i % 3) * 0.5)) % 1.3) - 0.15;
    const cx = gx + k * gw;
    const cy = gy + gh * (0.2 + ((i * 37) % 40) / 100);
    const cr = gh * (0.05 + (i % 3) * 0.02);
    x.fillStyle = `rgba(255,240,248,${0.5 + (i % 2) * 0.25})`;
    x.beginPath();
    x.arc(cx, cy, cr, 0, TAU);
    x.arc(cx + cr * 1.1, cy + cr * 0.2, cr * 0.8, 0, TAU);
    x.arc(cx - cr * 1.0, cy + cr * 0.25, cr * 0.7, 0, TAU);
    x.fill();
  }
  // pista lá fora
  x.fillStyle = '#6a5a8a';
  x.fillRect(gx, floorY - gh * 0.08, gw, gh * 0.08);
  x.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 8; i++) x.fillRect(gx + ((i / 8 + time * 0.01) % 1) * gw, floorY - gh * 0.045, gw * 0.04, Math.max(1.5, gh * 0.01));
  x.restore();
  // moldura do portão (listras de segurança)
  x.save();
  x.lineWidth = Math.max(6, gw * 0.022);
  x.strokeStyle = '#ffd34a';
  x.stroke(gate);
  x.setLineDash([x.lineWidth * 1.2, x.lineWidth * 1.2]);
  x.strokeStyle = INK;
  x.stroke(gate);
  x.restore();
  // vigas do teto
  x.fillStyle = 'rgba(10,4,30,.55)';
  x.fillRect(0, 0, W, Math.max(10, gy * 0.25));
  // lâmpadas com cones de luz
  const lamps = W > 700 ? 4 : 3;
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < lamps; i++) {
    const lx = bx + bw * ((i + 0.5) / lamps);
    const ly = Math.max(6, gy * 0.25);
    const fl = 0.9 + Math.sin(time * 2.1 + i * 1.7) * 0.05 + (Math.sin(time * 23 + i) > 0.985 ? -0.25 : 0);
    const cg = x.createLinearGradient(0, ly, 0, floorY);
    cg.addColorStop(0, `rgba(255,226,170,${0.32 * fl})`);
    cg.addColorStop(1, 'rgba(255,200,170,0)');
    x.fillStyle = cg;
    x.beginPath();
    x.moveTo(lx - 10, ly);
    x.lineTo(lx + 10, ly);
    x.lineTo(lx + bw * 0.22, floorY);
    x.lineTo(lx - bw * 0.22, floorY);
    x.closePath();
    x.fill();
  }
  x.restore();
  for (let i = 0; i < lamps; i++) {
    const lx = bx + bw * ((i + 0.5) / lamps);
    const ly = Math.max(6, gy * 0.25);
    x.fillStyle = INK;
    x.fillRect(lx - 1.5, 0, 3, ly);
    x.beginPath();
    x.moveTo(lx - 16, ly + 8);
    x.lineTo(lx + 16, ly + 8);
    x.lineTo(lx + 9, ly - 2);
    x.lineTo(lx - 9, ly - 2);
    x.closePath();
    x.fill();
    x.fillStyle = '#fff3c8';
    x.beginPath();
    x.ellipse(lx, ly + 8, 11, 3.5, 0, 0, TAU);
    x.fill();
  }
  // piso
  const fl = x.createLinearGradient(0, floorY, 0, H);
  fl.addColorStop(0, '#6b4bb0');
  fl.addColorStop(0.35, '#3a2276');
  fl.addColorStop(1, '#1e0f48');
  x.fillStyle = fl;
  x.fillRect(0, floorY, W, H - floorY);
  // linhas do piso em perspectiva
  x.strokeStyle = 'rgba(255,211,74,.35)';
  x.lineWidth = 2;
  const vx = bx + bw / 2;
  for (let i = -6; i <= 6; i++) {
    x.beginPath();
    x.moveTo(vx + i * bw * 0.06, floorY);
    x.lineTo(vx + i * bw * 0.3, H);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,.08)';
  x.fillRect(0, floorY, W, 2);
}
