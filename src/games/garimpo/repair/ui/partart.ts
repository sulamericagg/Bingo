/* ============================================================
 *  CONSERTOS — arte das peças trocáveis (canvas 2D), centradas na origem, ~200×90:
 *  mangueira hidráulica (escavadeira), pino da esteira (trator), alternador (pickup),
 *  parafuso do rotor (helicóptero), cilindro da caçamba (caminhão).
 *  Todas assimétricas (a orientação importa). broken = rachadura/vazamento/queimado.
 *  silhouette() desenha só o contorno (encaixe no "molde").
 * ============================================================ */
import type { PartArt } from '../model';
import { lin, rad, rrect, TAU, type C2 } from './art';

export class PartPaint {
  steel: CanvasGradient;
  steelV: CanvasGradient;
  rubber: CanvasGradient;
  brass: CanvasGradient;
  alt: CanvasGradient;
  chrome: CanvasGradient;
  constructor(c: C2) {
    this.steel = lin(c, 0, -14, 0, 14, [
      [0, '#eef1f4'],
      [0.35, '#b9c1c9'],
      [0.7, '#7d868f'],
      [1, '#4a5158'],
    ]);
    this.steelV = lin(c, 0, -30, 0, 30, [
      [0, '#e4e8ec'],
      [0.4, '#a7b0b9'],
      [1, '#4f565d'],
    ]);
    this.rubber = lin(c, 0, -10, 0, 10, [
      [0, '#55575d'],
      [0.4, '#2a2b30'],
      [1, '#101114'],
    ]);
    this.brass = lin(c, 0, -14, 0, 14, [
      [0, '#fff0b8'],
      [0.4, '#d8b048'],
      [1, '#7a5a12'],
    ]);
    this.alt = rad(c, -14, -18, 4, 0, 0, 52, [
      [0, '#f2f4f6'],
      [0.6, '#aab3bc'],
      [1, '#5b636b'],
    ]);
    this.chrome = lin(c, 0, -7, 0, 7, [
      [0, '#ffffff'],
      [0.5, '#c9d0d6'],
      [1, '#6d757d'],
    ]);
  }
}

/** contorno grosso da peça (molde/sombra) — mesmo caminho do desenho */
function outline(c: C2, art: PartArt): void {
  c.beginPath();
  if (art === 'hose') {
    rrect(c, -100, -14, 34, 28, 6);
    rrect(c, 66, -14, 30, 28, 6);
    rrect(c, 82, 0, 22, 50, 6);
    rrect(c, -70, -11, 140, 22, 11);
  } else if (art === 'pin') {
    c.arc(-86, 0, 24, 0, TAU);
    rrect(c, -86, -14, 186, 28, 12);
  } else if (art === 'alt') {
    c.arc(10, 0, 52, 0, TAU);
    rrect(c, -78, -24, 40, 48, 10);
    c.moveTo(56, -52);
    c.arc(52, -40, 16, 0, TAU);
  } else if (art === 'rotor') {
    rrect(c, -100, -30, 34, 60, 6);
    rrect(c, -70, -36, 12, 72, 4);
    rrect(c, -60, -15, 160, 30, 6);
  } else {
    // cilindro: forquilha à esquerda, olhal à direita
    rrect(c, -104, -24, 30, 48, 8);
    rrect(c, -78, -26, 104, 52, 10);
    rrect(c, 24, -9, 60, 18, 6);
    c.moveTo(108, 0);
    c.arc(92, 0, 18, 0, TAU);
  }
}
export function silhouette(c: C2, art: PartArt, fill: string, stroke: string | null, lw = 3): void {
  outline(c, art);
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

/** desenha a peça (sem transformação: o chamador posiciona/gira) */
export function drawPart(c: C2, P: PartPaint, art: PartArt, broken: boolean, t: number, spin = 0): void {
  // sombra
  c.save();
  c.translate(4, 7);
  silhouette(c, art, 'rgba(0,0,0,.35)', null);
  c.restore();
  c.lineJoin = 'round';
  if (art === 'hose') {
    // mangueira de borracha com malha + conexões
    c.fillStyle = P.rubber;
    c.beginPath();
    rrect(c, -70, -11, 140, 22, 11);
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,.08)';
    c.lineWidth = 1;
    for (let x = -64; x < 66; x += 8) {
      c.beginPath();
      c.moveTo(x, -10);
      c.lineTo(x + 6, 10);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,.18)';
    c.fillRect(-66, -7, 132, 3);
    // conexão reta (esquerda) e cotovelo (direita, apontando para baixo)
    c.fillStyle = P.steel;
    c.beginPath();
    rrect(c, -100, -14, 34, 28, 6);
    c.fill();
    c.beginPath();
    rrect(c, 66, -14, 30, 28, 6);
    c.fill();
    c.save();
    c.translate(93, 25);
    c.rotate(Math.PI / 2);
    c.fillStyle = P.steel;
    c.beginPath();
    rrect(c, -25, -11, 50, 22, 6);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(30,34,38,.7)';
    c.lineWidth = 1.5;
    for (const x of [-92, -84, -76, 74, 82]) {
      c.beginPath();
      c.moveTo(x, -13);
      c.lineTo(x, 13);
      c.stroke();
    }
    if (broken) {
      // rasgo + óleo
      c.fillStyle = '#0b0b0c';
      c.beginPath();
      c.moveTo(-6, -11);
      c.lineTo(4, -2);
      c.lineTo(-3, 2);
      c.lineTo(8, 11);
      c.lineTo(14, 11);
      c.lineTo(6, 1);
      c.lineTo(12, -3);
      c.lineTo(2, -11);
      c.fill();
      c.fillStyle = '#d9a521';
      c.beginPath();
      c.ellipse(6, 10 + ((t * 30) % 14), 3, 4.5, 0, 0, TAU);
      c.fill();
    }
  } else if (art === 'pin') {
    c.fillStyle = P.steel;
    c.beginPath();
    rrect(c, -86, -14, 186, 28, 12);
    c.fill();
    c.fillStyle = P.steelV;
    c.beginPath();
    c.arc(-86, 0, 24, 0, TAU);
    c.fill();
    c.strokeStyle = '#3a3f45';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.5)';
    c.beginPath();
    c.arc(-92, -7, 7, 0, TAU);
    c.fill();
    // furo da cupilha na ponta
    c.fillStyle = '#1d2024';
    c.beginPath();
    c.ellipse(84, 0, 4, 8, 0, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(40,44,50,.5)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-60, -14);
    c.lineTo(-60, 14);
    c.moveTo(70, -14);
    c.lineTo(70, 14);
    c.stroke();
    if (broken) {
      c.strokeStyle = '#141518';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(4, -14);
      c.lineTo(10, -5);
      c.lineTo(2, 2);
      c.lineTo(12, 9);
      c.lineTo(6, 14);
      c.stroke();
      c.fillStyle = '#7a3a18';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(-40 + i * 22, (i % 2) * 8 - 4, 3 + (i % 3), 0, TAU);
        c.fill();
      }
    }
  } else if (art === 'alt') {
    // polia (esquerda), corpo redondo com aletas, orelha de fixação (em cima à direita)
    c.fillStyle = P.steel;
    c.beginPath();
    c.arc(52, -40, 14, 0, TAU);
    c.fill();
    c.fillStyle = '#1d2024';
    c.beginPath();
    c.arc(52, -40, 6, 0, TAU);
    c.fill();
    c.fillStyle = P.alt;
    c.beginPath();
    c.arc(10, 0, 50, 0, TAU);
    c.fill();
    c.strokeStyle = '#3a3f45';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(20,24,28,.75)';
    for (let i = 0; i < 10; i++) {
      c.save();
      c.translate(10, 0);
      c.rotate((i * TAU) / 10 + spin * 0.2);
      c.beginPath();
      rrect(c, 18, -4, 24, 8, 4);
      c.fill();
      c.restore();
    }
    c.fillStyle = '#5b636b';
    c.beginPath();
    c.arc(10, 0, 14, 0, TAU);
    c.fill();
    // polia girando
    c.fillStyle = '#2b2d31';
    c.beginPath();
    rrect(c, -78, -24, 40, 48, 10);
    c.fill();
    c.save();
    c.translate(-58, 0);
    c.strokeStyle = '#7d858d';
    c.lineWidth = 3;
    for (let k = -18; k <= 18; k += 6) {
      c.beginPath();
      c.moveTo(-14, k + ((spin * 40) % 6));
      c.lineTo(14, k + ((spin * 40) % 6));
      c.stroke();
    }
    c.restore();
    // borne vermelho
    c.fillStyle = '#d23a2a';
    c.beginPath();
    c.arc(34, 30, 7, 0, TAU);
    c.fill();
    if (broken) {
      c.fillStyle = 'rgba(30,18,10,.6)';
      c.beginPath();
      c.ellipse(20, 8, 30, 22, 0.5, 0, TAU);
      c.fill();
      c.strokeStyle = '#111';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-6, -30);
      c.lineTo(6, -12);
      c.lineTo(-2, 0);
      c.lineTo(14, 18);
      c.stroke();
    }
  } else if (art === 'rotor') {
    // cabeça sextavada (esquerda), arruela, corpo com rosca (direita)
    c.fillStyle = P.steel;
    c.beginPath();
    rrect(c, -60, -15, broken ? 110 : 160, 30, 6);
    c.fill();
    c.strokeStyle = 'rgba(40,44,50,.6)';
    c.lineWidth = 2;
    for (let x = 10; x < (broken ? 50 : 98); x += 7) {
      c.beginPath();
      c.moveTo(x, -15);
      c.lineTo(x + 4, 15);
      c.stroke();
    }
    c.fillStyle = P.chrome;
    c.beginPath();
    rrect(c, -70, -36, 12, 72, 4);
    c.fill();
    c.fillStyle = P.steelV;
    c.beginPath();
    rrect(c, -100, -30, 34, 60, 6);
    c.fill();
    c.strokeStyle = '#3a3f45';
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.fillRect(-96, -26, 26, 7);
    c.strokeStyle = 'rgba(30,34,38,.5)';
    c.beginPath();
    c.moveTo(-100, -10);
    c.lineTo(-66, -10);
    c.moveTo(-100, 10);
    c.lineTo(-66, 10);
    c.stroke();
    if (broken) {
      // quebrado no meio: ponta irregular
      c.fillStyle = '#9aa2aa';
      c.beginPath();
      c.moveTo(50, -15);
      c.lineTo(58, -6);
      c.lineTo(50, 2);
      c.lineTo(60, 15);
      c.lineTo(50, 15);
      c.fill();
      c.fillStyle = '#7a3a18';
      c.beginPath();
      c.arc(30, 4, 5, 0, TAU);
      c.fill();
    }
  } else {
    // cilindro hidráulico
    c.fillStyle = P.steelV;
    c.beginPath();
    rrect(c, -104, -24, 30, 48, 8);
    c.fill();
    c.fillStyle = '#1d2024';
    c.fillRect(-104, -8, 22, 16);
    c.fillStyle = '#e8b41c';
    c.beginPath();
    rrect(c, -78, -26, 104, 52, 10);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(-72, -20, 92, 7);
    c.fillStyle = 'rgba(0,0,0,.2)';
    c.fillRect(-72, 12, 92, 8);
    c.save();
    c.translate(0, broken ? 4 : 0);
    if (broken) c.rotate(0.12);
    c.fillStyle = P.chrome;
    c.beginPath();
    rrect(c, 24, -9, 60, 18, 6);
    c.fill();
    c.fillStyle = P.steelV;
    c.beginPath();
    c.arc(92, 0, 18, 0, TAU);
    c.fill();
    c.fillStyle = '#1d2024';
    c.beginPath();
    c.arc(92, 0, 8, 0, TAU);
    c.fill();
    c.restore();
    if (broken) {
      c.fillStyle = '#d9a521';
      c.beginPath();
      c.ellipse(28, 18 + ((t * 30) % 16), 3, 4.5, 0, 0, TAU);
      c.fill();
    }
  }
}
