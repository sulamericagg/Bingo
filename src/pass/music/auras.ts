/* ============================================================
 *  AURAS ANIMADAS do Passe Musical — 100% procedurais (Canvas 2D).
 *  drawAura(ctx, id, x, y, size, t): desenha a aura centrada no
 *  personagem (size ≈ raio do Bloop em px; t em segundos).
 *  Desenhe ANTES do personagem (fica atrás); as famílias com
 *  partículas na frente também ficam bonitas atrás.
 * ============================================================ */

export type AuraFamily =
  | 'ring' | 'flame' | 'sparkle' | 'notes' | 'eq' | 'bubbles' | 'bolt' | 'petals'
  | 'pixels' | 'hearts' | 'ribbon' | 'snow' | 'halo' | 'comet' | 'smoke' | 'confetti';

export const AURA_FAMILIES: AuraFamily[] = ['ring', 'flame', 'sparkle', 'notes', 'eq', 'bubbles', 'bolt', 'petals', 'pixels', 'hearts', 'ribbon', 'snow', 'halo', 'comet', 'smoke', 'confetti'];

export const AURA_FAMILY_NAME: Record<AuraFamily, string> = {
  ring: 'Anel Pulsante', flame: 'Chama do Riff', sparkle: 'Brilho Estrelado', notes: 'Notas em Órbita', eq: 'Equalizador',
  bubbles: 'Bolhas Sonoras', bolt: 'Raio Elétrico', petals: 'Pétalas Dançantes', pixels: 'Pixels Saltitantes',
  hearts: 'Corações Batucando', ribbon: 'Fita Boreal', snow: 'Neve Cintilante', halo: 'Halo Radiante',
  comet: 'Cometas Girando', smoke: 'Fumaça de Palco', confetti: 'Chuva de Confete',
};

export interface AuraDef {
  id: string;
  name: string;
  family: AuraFamily;
  colors: [string, string, string];
  /** quantidade de elementos */
  count: number;
  /** velocidade (1 = normal) */
  speed: number;
  /** sentido do giro (+1/-1) */
  spin: number;
  rarity: 'rare' | 'epic' | 'legendary';
}

const REG = new Map<string, AuraDef>();
export function registerAura(a: AuraDef): void {
  REG.set(a.id, a);
}
export const auraDef = (id: string): AuraDef | undefined => REG.get(id);

const TAU = Math.PI * 2;
function hrand(i: number, k: number): number {
  let x = Math.imul(i * 374761393 + k * 668265263, 1274126177);
  x = (x ^ (x >>> 13)) >>> 0;
  return (Math.imul(x, 1103515245) >>> 0) / 4294967296;
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * TAU - Math.PI / 2;
    const rr = i % 2 ? r * 0.42 : r;
    c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  c.closePath();
  c.fill();
}
function heart(c: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  c.beginPath();
  c.moveTo(x, y + s * 0.35);
  c.bezierCurveTo(x - s, y - s * 0.3, x - s * 0.45, y - s, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.3, x, y + s * 0.35);
  c.fill();
}
function note(c: CanvasRenderingContext2D, x: number, y: number, s: number, dbl: boolean): void {
  c.beginPath();
  c.ellipse(x, y, s * 0.42, s * 0.3, -0.4, 0, TAU);
  c.fill();
  c.fillRect(x + s * 0.32, y - s * 1.2, s * 0.12, s * 1.2);
  if (dbl) {
    c.beginPath();
    c.ellipse(x + s * 0.8, y - s * 0.2, s * 0.42, s * 0.3, -0.4, 0, TAU);
    c.fill();
    c.fillRect(x + s * 1.12, y - s * 1.4, s * 0.12, s * 1.2);
    c.fillRect(x + s * 0.32, y - s * 1.3, s * 0.92, s * 0.18);
  } else {
    c.fillRect(x + s * 0.32, y - s * 1.2, s * 0.45, s * 0.14);
  }
}

/** desenha a aura `id` (ou nada se desconhecida) */
export function drawAura(c: CanvasRenderingContext2D, id: string, x: number, y: number, size: number, t: number): void {
  const a = REG.get(id);
  if (!a) return;
  drawAuraDef(c, a, x, y, size, t);
}

export function drawAuraDef(c: CanvasRenderingContext2D, a: AuraDef, x: number, y: number, R: number, t: number): void {
  const [c1, c2, c3] = a.colors;
  const sp = a.speed;
  const n = a.count;
  const ts = t * sp;
  c.save();
  c.translate(x, y);
  // brilho de base comum a todas
  const g = c.createRadialGradient(0, 0, R * 0.6, 0, 0, R * 1.9);
  g.addColorStop(0, c1 + '55');
  g.addColorStop(1, c1 + '00');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, R * 1.9, 0, TAU);
  c.fill();
  c.globalCompositeOperation = 'lighter';
  switch (a.family) {
    case 'ring':
      for (let i = 0; i < Math.min(4, Math.max(2, n >> 2)); i++) {
        const ph = (ts * 0.6 + i / 3) % 1;
        c.strokeStyle = i % 2 ? c2 : c1;
        c.globalAlpha = 1 - ph;
        c.lineWidth = R * 0.08 * (1 - ph) + 1;
        c.beginPath();
        c.arc(0, 0, R * (1.05 + ph * 0.9), 0, TAU);
        c.stroke();
      }
      break;
    case 'flame':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + Math.sin(ts * 2 + i) * 0.08;
        const fl = 0.75 + 0.35 * Math.sin(ts * 9 + i * 2.3) + 0.15 * Math.sin(ts * 23 + i);
        const len = R * 0.55 * fl;
        const bx = Math.cos(ang) * R * 0.95;
        const by = Math.sin(ang) * R * 0.95;
        // chamas "sobem": vetor misto radial + para cima
        const ux = Math.cos(ang) * 0.6;
        const uy = Math.sin(ang) * 0.6 - 0.8;
        c.fillStyle = i % 3 === 0 ? c3 : i % 2 ? c2 : c1;
        c.globalAlpha = 0.8;
        c.beginPath();
        c.moveTo(bx - Math.sin(ang) * R * 0.14, by + Math.cos(ang) * R * 0.14);
        c.quadraticCurveTo(bx + ux * len * 0.5 + Math.sin(ts * 7 + i) * R * 0.08, by + uy * len * 0.5, bx + ux * len, by + uy * len);
        c.quadraticCurveTo(bx + ux * len * 0.4, by + uy * len * 0.4, bx + Math.sin(ang) * R * 0.14, by - Math.cos(ang) * R * 0.14);
        c.fill();
      }
      break;
    case 'sparkle':
      for (let i = 0; i < n; i++) {
        const ang = hrand(i, 1) * TAU + ts * 0.2 * a.spin;
        const rr = R * (1.1 + hrand(i, 2) * 0.7);
        const tw = Math.max(0, Math.sin(ts * 3 + hrand(i, 3) * TAU));
        c.fillStyle = i % 3 === 0 ? c3 : i % 2 ? c2 : c1;
        c.globalAlpha = tw;
        star(c, Math.cos(ang) * rr, Math.sin(ang) * rr, R * 0.12 * (0.5 + tw), ts);
      }
      break;
    case 'notes':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + ts * 0.8 * a.spin;
        const rr = R * (1.35 + 0.12 * Math.sin(ts * 3 + i));
        c.fillStyle = i % 2 ? c2 : c1;
        c.globalAlpha = 0.9;
        note(c, Math.cos(ang) * rr, Math.sin(ang) * rr + Math.sin(ts * 4 + i) * R * 0.08, R * 0.2, i % 3 === 0);
      }
      break;
    case 'eq':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + ts * 0.1 * a.spin;
        const h = R * (0.15 + 0.55 * Math.abs(Math.sin(ts * 5 + i * 1.7) * Math.sin(ts * 2.3 + i * 0.5)));
        c.save();
        c.rotate(ang);
        c.fillStyle = h > R * 0.45 ? c3 : i % 2 ? c2 : c1;
        c.globalAlpha = 0.85;
        c.fillRect(R * 1.1, -R * 0.06, h, R * 0.12);
        c.restore();
      }
      break;
    case 'bubbles':
      for (let i = 0; i < n; i++) {
        const ph = (ts * 0.35 + hrand(i, 1)) % 1;
        const bx = (hrand(i, 2) - 0.5) * R * 2.6 + Math.sin(ts * 2 + i) * R * 0.1;
        const by = R * 1.3 - ph * R * 3;
        const br = R * (0.08 + hrand(i, 3) * 0.12);
        c.globalAlpha = Math.sin(ph * Math.PI);
        c.strokeStyle = i % 2 ? c2 : c1;
        c.lineWidth = Math.max(1, R * 0.03);
        c.beginPath();
        c.arc(bx, by, br, 0, TAU);
        c.stroke();
        c.fillStyle = c3;
        c.beginPath();
        c.arc(bx - br * 0.35, by - br * 0.35, br * 0.25, 0, TAU);
        c.fill();
      }
      break;
    case 'bolt':
      for (let i = 0; i < Math.min(n, 6); i++) {
        const k = Math.floor(ts * 6 + i * 0.37);
        if (hrand(k, i) < 0.45) continue;
        const ang = hrand(k, i + 9) * TAU;
        c.strokeStyle = i % 2 ? c2 : c1;
        c.globalAlpha = 0.9;
        c.lineWidth = Math.max(1.5, R * 0.05);
        c.beginPath();
        let rr = R * 1.0;
        c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        for (let s = 0; s < 4; s++) {
          rr += R * 0.2;
          const j = (hrand(k * 7 + s, i) - 0.5) * 0.5;
          c.lineTo(Math.cos(ang + j) * rr, Math.sin(ang + j) * rr);
        }
        c.stroke();
      }
      c.strokeStyle = c3;
      c.globalAlpha = 0.35 + 0.25 * Math.sin(ts * 20);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, R * 1.08, 0, TAU);
      c.stroke();
      break;
    case 'petals':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + ts * 0.5 * a.spin;
        const rr = R * (1.3 + 0.15 * Math.sin(ts * 2 + i * 2));
        c.save();
        c.translate(Math.cos(ang) * rr, Math.sin(ang) * rr);
        c.rotate(ang + ts * 2);
        c.fillStyle = i % 2 ? c2 : c1;
        c.globalAlpha = 0.85;
        c.beginPath();
        c.ellipse(0, 0, R * 0.16, R * 0.07, 0, 0, TAU);
        c.fill();
        c.restore();
      }
      break;
    case 'pixels':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + Math.floor(ts * 4) * 0.12 * a.spin;
        const hop = Math.abs(Math.sin(ts * 4 + i)) * R * 0.15;
        const rr = R * 1.3 + hop;
        const s = R * 0.14;
        c.fillStyle = i % 3 === 0 ? c3 : i % 2 ? c2 : c1;
        c.globalAlpha = 0.9;
        c.fillRect(Math.round((Math.cos(ang) * rr) / s) * s - s / 2, Math.round((Math.sin(ang) * rr) / s) * s - s / 2, s, s);
      }
      break;
    case 'hearts':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + ts * 0.4 * a.spin;
        const beat = 1 + 0.25 * Math.max(0, Math.sin(ts * 6 + i));
        const rr = R * 1.35;
        c.fillStyle = i % 2 ? c2 : c1;
        c.globalAlpha = 0.85;
        heart(c, Math.cos(ang) * rr, Math.sin(ang) * rr, R * 0.18 * beat);
      }
      break;
    case 'ribbon':
      for (let k = 0; k < 3; k++) {
        c.strokeStyle = [c1, c2, c3][k];
        c.globalAlpha = 0.55;
        c.lineWidth = R * (0.12 - k * 0.025);
        c.beginPath();
        for (let i = 0; i <= 48; i++) {
          const ang = (i / 48) * TAU;
          const rr = R * (1.25 + 0.18 * Math.sin(ang * (2 + k) + ts * (1.5 + k * 0.4) * a.spin));
          c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        c.closePath();
        c.stroke();
      }
      break;
    case 'snow':
      for (let i = 0; i < n; i++) {
        const ph = (ts * 0.25 + hrand(i, 1)) % 1;
        const bx = (hrand(i, 2) - 0.5) * R * 2.8 + Math.sin(ts + i) * R * 0.15;
        const by = -R * 1.5 + ph * R * 3;
        c.globalAlpha = Math.sin(ph * Math.PI);
        c.strokeStyle = i % 2 ? c2 : c1;
        c.lineWidth = Math.max(1, R * 0.025);
        const s = R * (0.06 + hrand(i, 3) * 0.06);
        for (let k = 0; k < 3; k++) {
          const an = (k / 3) * Math.PI + ts;
          c.beginPath();
          c.moveTo(bx - Math.cos(an) * s, by - Math.sin(an) * s);
          c.lineTo(bx + Math.cos(an) * s, by + Math.sin(an) * s);
          c.stroke();
        }
      }
      break;
    case 'halo':
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + ts * 0.3 * a.spin;
        const len = R * (0.4 + 0.25 * Math.sin(ts * 3 + i * 1.3));
        c.save();
        c.rotate(ang);
        const lg = c.createLinearGradient(R, 0, R + len, 0);
        lg.addColorStop(0, (i % 2 ? c2 : c1) + 'cc');
        lg.addColorStop(1, c3 + '00');
        c.fillStyle = lg;
        c.beginPath();
        c.moveTo(R * 0.95, -R * 0.07);
        c.lineTo(R + len, 0);
        c.lineTo(R * 0.95, R * 0.07);
        c.fill();
        c.restore();
      }
      break;
    case 'comet':
      for (let i = 0; i < Math.min(n, 5); i++) {
        const base = (i / Math.min(n, 5)) * TAU + ts * 1.6 * a.spin;
        const tilt = 0.5 + i * 0.3;
        for (let k = 0; k < 10; k++) {
          const ang = base - k * 0.09 * a.spin;
          const px = Math.cos(ang) * R * 1.4;
          const py = Math.sin(ang) * R * 1.4 * Math.cos(tilt);
          c.fillStyle = k === 0 ? c3 : i % 2 ? c2 : c1;
          c.globalAlpha = 1 - k / 10;
          c.beginPath();
          c.arc(px, py, R * 0.09 * (1 - k / 12), 0, TAU);
          c.fill();
        }
      }
      break;
    case 'smoke':
      for (let i = 0; i < n; i++) {
        const ph = (ts * 0.3 + hrand(i, 1)) % 1;
        const side = hrand(i, 2) < 0.5 ? -1 : 1;
        const bx = side * R * (0.8 + ph * 0.9);
        const by = R * 0.9 - ph * R * 0.8;
        const br = R * (0.2 + ph * 0.35);
        const sg = c.createRadialGradient(bx, by, 0, bx, by, br);
        sg.addColorStop(0, (i % 2 ? c2 : c1) + '88');
        sg.addColorStop(1, c3 + '00');
        c.fillStyle = sg;
        c.globalAlpha = Math.sin(ph * Math.PI);
        c.beginPath();
        c.arc(bx, by, br, 0, TAU);
        c.fill();
      }
      break;
    case 'confetti':
      for (let i = 0; i < n; i++) {
        const ph = (ts * 0.4 + hrand(i, 1)) % 1;
        const bx = (hrand(i, 2) - 0.5) * R * 3 + Math.sin(ts * 3 + i) * R * 0.2;
        const by = -R * 1.6 + ph * R * 3.2;
        c.save();
        c.translate(bx, by);
        c.rotate(ts * 5 + i);
        c.scale(1, Math.cos(ts * 6 + i));
        c.fillStyle = [c1, c2, c3][i % 3];
        c.globalAlpha = Math.sin(ph * Math.PI);
        c.fillRect(-R * 0.06, -R * 0.1, R * 0.12, R * 0.2);
        c.restore();
      }
      break;
  }
  c.restore();
}
