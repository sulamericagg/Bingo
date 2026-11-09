import { makeCanvas, rgba, rng, TAU } from './math';

/* ============================================================
 *  Sprites de efeitos/perigos — pré-renderizados na escala real
 *  (mesmo padrão de buildSprites em game.ts: chame de novo ao
 *  mudar a escala). Tudo procedural, sem emoji.
 * ============================================================ */

/** Corpo espinhoso e avermelhado do asteroide hostil (gira). */
export function buildSpikyAsteroid(px: number, seed: number): HTMLCanvasElement {
  const R = Math.max(5, Math.round(px));
  const pad = Math.ceil(R * 0.6) + 2;
  const D = R * 2 + pad * 2;
  const [c, x] = makeCanvas(D, D);
  const r = rng(seed);
  x.translate(D / 2, D / 2);

  // halo vermelho
  const hg = x.createRadialGradient(0, 0, R * 0.6, 0, 0, R + pad);
  hg.addColorStop(0, 'rgba(255,40,70,0.55)');
  hg.addColorStop(1, 'rgba(255,40,70,0)');
  x.fillStyle = hg;
  x.fillRect(-D / 2, -D / 2, D, D);

  // espinhos
  const spikes = 9;
  x.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * TAU + r() * 0.08;
    const rr = i % 2 === 0 ? R * (1.32 + r() * 0.12) : R * (0.82 + r() * 0.08);
    if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  const sg = x.createLinearGradient(-R, -R, R, R);
  sg.addColorStop(0, '#ff9a6b');
  sg.addColorStop(1, '#b0142e');
  x.fillStyle = sg;
  x.fill();
  x.strokeStyle = '#4a0614';
  x.lineWidth = Math.max(1, R * 0.1);
  x.lineJoin = 'round';
  x.stroke();

  // corpo
  x.beginPath();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const rr = R * (0.86 + r() * 0.12);
    if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  x.closePath();
  const g = x.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R * 1.05);
  g.addColorStop(0, '#ff7a6a');
  g.addColorStop(0.55, '#a8203a');
  g.addColorStop(1, '#3d0718');
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = '#ff3b5c';
  x.lineWidth = Math.max(1, R * 0.1);
  x.stroke();
  // crateras
  for (let i = 0; i < 4; i++) {
    x.fillStyle = 'rgba(40,0,15,0.45)';
    x.beginPath();
    x.arc((r() - 0.5) * R * 1.1, (r() - 0.5) * R * 1.1, R * (0.1 + r() * 0.12), 0, TAU);
    x.fill();
  }
  return c;
}

/** Rosto bravo (olhos com sobrancelhas inclinadas). Desenhado sem girar. */
export function buildAngryFace(px: number): HTMLCanvasElement {
  const R = Math.max(5, Math.round(px));
  const D = R * 2 + 2;
  const [c, x] = makeCanvas(D, D);
  x.translate(D / 2, D / 2);
  const ex = R * 0.36;
  const ey = -R * 0.05;
  const er = R * 0.24;
  for (const s of [-1, 1]) {
    x.fillStyle = '#fff2e0';
    x.beginPath();
    x.ellipse(s * ex, ey, er, er * 0.85, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#1a0008';
    x.beginPath();
    x.arc(s * ex + s * er * 0.15, ey + er * 0.15, er * 0.55, 0, TAU);
    x.fill();
    x.fillStyle = '#ff2040';
    x.beginPath();
    x.arc(s * ex + s * er * 0.15, ey + er * 0.15, er * 0.22, 0, TAU);
    x.fill();
    // sobrancelha brava
    x.strokeStyle = '#1a0008';
    x.lineWidth = Math.max(1, R * 0.16);
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(s * (ex + er * 1.1), ey - er * 1.25);
    x.lineTo(s * (ex - er * 0.9), ey - er * 0.55);
    x.stroke();
  }
  // boca em careta
  x.strokeStyle = '#1a0008';
  x.lineWidth = Math.max(1, R * 0.11);
  x.beginPath();
  x.moveTo(-R * 0.3, R * 0.5);
  x.lineTo(-R * 0.1, R * 0.4);
  x.lineTo(R * 0.1, R * 0.5);
  x.lineTo(R * 0.3, R * 0.4);
  x.stroke();
  return c;
}

/** Marcador "!" de perigo: círculo vermelho com ponto de exclamação desenhado. */
export function buildWarnMarker(px: number): HTMLCanvasElement {
  const R = Math.max(5, Math.round(px));
  const pad = Math.ceil(R * 0.5);
  const D = R * 2 + pad * 2;
  const [c, x] = makeCanvas(D, D);
  x.translate(D / 2, D / 2);
  const hg = x.createRadialGradient(0, 0, R * 0.7, 0, 0, R + pad);
  hg.addColorStop(0, 'rgba(255,40,60,0.6)');
  hg.addColorStop(1, 'rgba(255,40,60,0)');
  x.fillStyle = hg;
  x.fillRect(-D / 2, -D / 2, D, D);
  x.fillStyle = '#ff2b4a';
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  x.strokeStyle = '#ffffff';
  x.lineWidth = Math.max(1, R * 0.14);
  x.stroke();
  x.fillStyle = '#ffffff';
  // haste
  x.beginPath();
  x.moveTo(-R * 0.17, -R * 0.62);
  x.lineTo(R * 0.17, -R * 0.62);
  x.lineTo(R * 0.1, R * 0.18);
  x.lineTo(-R * 0.1, R * 0.18);
  x.closePath();
  x.fill();
  x.beginPath();
  x.arc(0, R * 0.46, R * 0.14, 0, TAU);
  x.fill();
  return c;
}

/** Bolha de escudo ao redor do jogador. */
export function buildShieldBubble(px: number): HTMLCanvasElement {
  const R = Math.max(6, Math.round(px));
  const D = R * 2 + 4;
  const [c, x] = makeCanvas(D, D);
  x.translate(D / 2, D / 2);
  const g = x.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  g.addColorStop(0, 'rgba(120,240,255,0)');
  g.addColorStop(0.8, 'rgba(120,240,255,0.18)');
  g.addColorStop(1, 'rgba(180,250,255,0.55)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  x.strokeStyle = 'rgba(200,255,255,0.9)';
  x.lineWidth = Math.max(1, R * 0.06);
  x.stroke();
  // padrão hexagonal discreto
  x.save();
  x.beginPath();
  x.arc(0, 0, R * 0.97, 0, TAU);
  x.clip();
  x.strokeStyle = 'rgba(180,250,255,0.18)';
  x.lineWidth = Math.max(0.5, R * 0.025);
  const hs = R * 0.32;
  for (let row = -4; row <= 4; row++) {
    for (let col = -4; col <= 4; col++) {
      const cx = col * hs * 1.5;
      const cy = row * hs * 1.732 + (col % 2 ? hs * 0.866 : 0);
      x.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        if (i === 0) x.moveTo(cx + Math.cos(a) * hs, cy + Math.sin(a) * hs);
        else x.lineTo(cx + Math.cos(a) * hs, cy + Math.sin(a) * hs);
      }
      x.closePath();
      x.stroke();
    }
  }
  x.restore();
  // reflexo
  x.fillStyle = 'rgba(255,255,255,0.65)';
  x.beginPath();
  x.ellipse(-R * 0.42, -R * 0.5, R * 0.26, R * 0.11, -0.7, 0, TAU);
  x.fill();
  return c;
}

function bubbleBase(x: CanvasRenderingContext2D, R: number, col: string): void {
  const g = x.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, rgba(col, 0.55));
  g.addColorStop(1, rgba(col, 0.15));
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.85)';
  x.lineWidth = Math.max(1, R * 0.08);
  x.stroke();
}

/** Power-up coletável: escudo (brasão dentro de uma bolha). */
export function buildShieldPickup(px: number): HTMLCanvasElement {
  const R = Math.max(6, Math.round(px));
  const D = R * 2 + 4;
  const [c, x] = makeCanvas(D, D);
  x.translate(D / 2, D / 2);
  bubbleBase(x, R, '#4fe3ff');
  const s = R * 0.58;
  x.beginPath();
  x.moveTo(0, -s);
  x.quadraticCurveTo(s * 0.55, -s * 0.72, s * 0.9, -s * 0.78);
  x.quadraticCurveTo(s * 0.95, s * 0.35, 0, s);
  x.quadraticCurveTo(-s * 0.95, s * 0.35, -s * 0.9, -s * 0.78);
  x.quadraticCurveTo(-s * 0.55, -s * 0.72, 0, -s);
  x.closePath();
  const g = x.createLinearGradient(0, -s, 0, s);
  g.addColorStop(0, '#e8fdff');
  g.addColorStop(1, '#2fa8ff');
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = '#0b4a8a';
  x.lineWidth = Math.max(1, R * 0.08);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.75)';
  x.beginPath();
  x.moveTo(0, -s * 0.7);
  x.lineTo(0, s * 0.7);
  x.quadraticCurveTo(-s * 0.7, s * 0.2, -s * 0.66, -s * 0.55);
  x.closePath();
  x.fill();
  return c;
}

/** Power-up coletável: ímã em ferradura. */
export function buildMagnetPickup(px: number): HTMLCanvasElement {
  const R = Math.max(6, Math.round(px));
  const D = R * 2 + 4;
  const [c, x] = makeCanvas(D, D);
  x.translate(D / 2, D / 2);
  bubbleBase(x, R, '#ff5c8a');
  const o = R * 0.55;
  const w = R * 0.24;
  x.lineCap = 'butt';
  x.lineWidth = w;
  x.strokeStyle = '#e8203f';
  x.beginPath();
  x.arc(0, -R * 0.05, o - w / 2, Math.PI, 0, true);
  x.stroke();
  // pernas
  x.fillStyle = '#e8203f';
  x.fillRect(-o, -R * 0.05, w, R * 0.3);
  x.fillRect(o - w, -R * 0.05, w, R * 0.3);
  // pontas prateadas
  x.fillStyle = '#e8eef6';
  x.fillRect(-o, R * 0.25, w, R * 0.22);
  x.fillRect(o - w, R * 0.25, w, R * 0.22);
  x.strokeStyle = 'rgba(40,0,20,0.6)';
  x.lineWidth = Math.max(0.5, R * 0.04);
  x.strokeRect(-o, -R * 0.05, w, R * 0.52);
  x.strokeRect(o - w, -R * 0.05, w, R * 0.52);
  // brilho
  x.strokeStyle = 'rgba(255,255,255,0.6)';
  x.lineWidth = Math.max(0.5, R * 0.06);
  x.beginPath();
  x.arc(0, -R * 0.05, o - w * 0.75, Math.PI * 1.15, Math.PI * 1.45);
  x.stroke();
  return c;
}

/** Disco de acreção do poço gravitacional (desenhar girando, aditivo). */
export function buildWellDisc(px: number, seed: number): HTMLCanvasElement {
  const R = Math.max(8, Math.round(px));
  const D = R * 2 + 2;
  const [c, x] = makeCanvas(D, D);
  const r = rng(seed);
  x.translate(D / 2, D / 2);
  const g = x.createRadialGradient(0, 0, R * 0.35, 0, 0, R);
  g.addColorStop(0, 'rgba(208,79,255,0)');
  g.addColorStop(0.45, 'rgba(208,79,255,0.35)');
  g.addColorStop(0.7, 'rgba(255,92,168,0.18)');
  g.addColorStop(1, 'rgba(108,92,255,0)');
  x.fillStyle = g;
  x.beginPath();
  x.arc(0, 0, R, 0, TAU);
  x.fill();
  // braços espirais
  x.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    const a0 = (arm / 3) * TAU + r() * 0.3;
    x.strokeStyle = arm % 2 ? 'rgba(255,170,240,0.55)' : 'rgba(190,150,255,0.55)';
    x.lineWidth = Math.max(1, R * 0.04);
    x.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const rr = R * (0.95 - t * 0.55);
      const a = a0 + t * 2.4;
      if (i === 0) x.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else x.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    x.stroke();
  }
  return c;
}

/** Rastro de meteoro (cabeça à direita) para chuva de meteoros decorativa. */
export function buildMeteor(len: number, thick: number): HTMLCanvasElement {
  const L = Math.max(8, Math.round(len));
  const T = Math.max(3, Math.round(thick));
  const [c, x] = makeCanvas(L, T * 2);
  const g = x.createLinearGradient(0, 0, L, 0);
  g.addColorStop(0, 'rgba(255,90,40,0)');
  g.addColorStop(0.7, 'rgba(255,140,60,0.55)');
  g.addColorStop(1, 'rgba(255,240,200,1)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(0, T);
  x.lineTo(L - T, T * 0.4);
  x.arc(L - T, T, T * 0.6, -Math.PI / 2, Math.PI / 2);
  x.lineTo(0, T);
  x.closePath();
  x.fill();
  return c;
}

/** Bordas da tela tingidas (alerta de perigo / dano). */
export function buildEdgeTint(w: number, h: number, color: string): HTMLCanvasElement {
  const [c, x] = makeCanvas(w, h);
  // degradê elíptico: acompanha a proporção da tela (bordas laterais também tingem)
  x.translate(w / 2, h / 2);
  x.scale(w / 2, h / 2);
  const g = x.createRadialGradient(0, 0, 0.55, 0, 0, 1.12);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.55, rgba(color, 0.3));
  g.addColorStop(1, rgba(color, 0.75));
  x.fillStyle = g;
  x.fillRect(-1, -1, 2, 2);
  return c;
}
