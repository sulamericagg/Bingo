/* ============================================================
 *  DANÇAS (emotes animados) do Bloop — sem esqueleto: cada dança é
 *  uma sequência de "passos" com squash/stretch, rotação, pulo,
 *  bracinhos, perninhas e partículas de destaque no ritmo.
 *
 *  Uso (jogo/hub):
 *    const d = playDance('mpd_s03_1');           // DancePlayer
 *    const p = d.frame(tSegundos);                // DancePose
 *    ctx.save(); applyDancePose(ctx, p, R);       // translada/gira
 *    drawDanceArms(ctx, p, R, corDoCorpo);        // atrás do corpo (opcional)
 *    drawPlayer(ctx, skin, R, { ...pose, sx: pose.sx * p.sx, sy: pose.sy * p.sy, mood: p.mood });
 *    ctx.restore(); drawDanceFx(ctx, p, x, y, R); // partículas (coordenadas de tela)
 * ============================================================ */

export type MoveKind =
  | 'hop' | 'squash' | 'spin' | 'sway' | 'wave' | 'shimmy' | 'twist' | 'bounce' | 'slide'
  | 'headbang' | 'clap' | 'kick' | 'stretch' | 'wobble' | 'robot' | 'flip' | 'point' | 'cheer';
export const MOVE_KINDS: MoveKind[] = ['hop', 'squash', 'spin', 'sway', 'wave', 'shimmy', 'twist', 'bounce', 'slide', 'headbang', 'clap', 'kick', 'stretch', 'wobble', 'robot', 'flip', 'point', 'cheer'];
export const MOVE_NAME: Record<MoveKind, string> = {
  hop: 'Pula-Pula', squash: 'Amassadinho', spin: 'Gira-Gira', sway: 'Balancinho', wave: 'Tchauzinho', shimmy: 'Tremelique',
  twist: 'Torcidinha', bounce: 'Quica-Quica', slide: 'Deslizada', headbang: 'Cabeçada Roqueira', clap: 'Palminha',
  kick: 'Chutinho', stretch: 'Espreguiçada', wobble: 'Gelatina', robot: 'Robozinho', flip: 'Cambalhota', point: 'Dedinho pro Céu', cheer: 'Festança',
};
export type FxKind = 'star' | 'note' | 'heart' | 'spark' | 'bubble' | 'pixel' | 'flake' | 'leaf' | 'flame' | 'confetti';
export const FX_KINDS: FxKind[] = ['star', 'note', 'heart', 'spark', 'bubble', 'pixel', 'flake', 'leaf', 'flame', 'confetti'];

export interface Move {
  k: MoveKind;
  beats: number;
  amp: number; // 0.6..1.4
}
export interface DanceDef {
  id: string;
  name: string;
  bpm: number;
  moves: Move[];
  fx: FxKind;
  fxEvery: number; // a cada N batidas
  colors: [string, string];
  rarity: 'medio' | 'rare' | 'epic' | 'legendary';
}
export interface DanceFx {
  kind: FxKind;
  x: number; // em unidades de R, relativo ao centro do personagem
  y: number;
  a: number; // alpha
  s: number; // escala
  rot: number;
  color: string;
}
export interface DancePose {
  dx: number; // deslocamento em R
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  armL: number; // ângulo (0 = para baixo, PI = para cima), lado esquerdo
  armR: number;
  legL: number; // 0..1 levantar
  legR: number;
  mood: 'idle' | 'happy';
  fx: DanceFx[];
}
export interface DancePlayer {
  def: DanceDef;
  /** duração de um ciclo (s) */
  loopSec: number;
  frame(t: number): DancePose;
}

const REG = new Map<string, DanceDef>();
export const registerDance = (d: DanceDef): void => void REG.set(d.id, d);
export const danceDef = (id: string): DanceDef | undefined => REG.get(id);

const PI = Math.PI;
const ease = (x: number) => x * x * (3 - 2 * x);
function hrand(i: number, k: number): number {
  let x = Math.imul(i * 374761393 + k * 668265263, 1274126177);
  x = (x ^ (x >>> 13)) >>> 0;
  return (Math.imul(x, 1103515245) >>> 0) / 4294967296;
}

function applyMove(p: DancePose, m: Move, lb: number): void {
  // lb = batida local dentro do passo (0..m.beats)
  const A = m.amp;
  const bf = lb % 1; // fase na batida
  const bi = Math.floor(lb);
  const pr = lb / m.beats;
  switch (m.k) {
    case 'hop': {
      const h = Math.sin(bf * PI);
      p.dy -= h * 0.45 * A;
      const land = bf < 0.15 ? 1 - bf / 0.15 : 0;
      p.sx *= 1 + 0.18 * land * A - 0.06 * h;
      p.sy *= 1 - 0.18 * land * A + 0.08 * h;
      p.armL = p.armR = 0.6 + h * 1.2;
      break;
    }
    case 'squash': {
      const s = Math.sin(bf * PI * 2);
      p.sx *= 1 + 0.16 * A * s;
      p.sy *= 1 - 0.16 * A * s;
      p.armL = p.armR = 1.2 + 0.4 * s;
      break;
    }
    case 'spin':
      p.rot += ease(Math.min(1, pr * 1.25)) * PI * 2 * (A > 1 ? -1 : 1);
      p.dy -= Math.sin(pr * PI) * 0.2;
      p.armL = p.armR = 1.6;
      break;
    case 'sway': {
      const s = Math.sin(lb * PI);
      p.dx += s * 0.22 * A;
      p.rot += s * 0.14 * A;
      p.armL = 0.9 - s * 0.6;
      p.armR = 0.9 + s * 0.6;
      break;
    }
    case 'wave':
      p.armR = 2.6 + 0.45 * Math.sin(lb * PI * 4);
      p.armL = 0.5;
      p.rot += Math.sin(lb * PI) * 0.06;
      p.dy -= Math.abs(Math.sin(lb * PI)) * 0.05;
      break;
    case 'shimmy':
      p.dx += Math.sin(lb * PI * 8) * 0.06 * A;
      p.sx *= 1 + Math.sin(lb * PI * 8) * 0.04;
      p.armL = p.armR = 1.5 + Math.sin(lb * PI * 8) * 0.3;
      break;
    case 'twist': {
      const s = Math.sin(lb * PI);
      p.rot += s * 0.35 * A;
      p.legL = s > 0 ? s * 0.6 : 0;
      p.legR = s < 0 ? -s * 0.6 : 0;
      p.armL = 1 + s;
      p.armR = 1 - s;
      break;
    }
    case 'bounce': {
      const h = Math.abs(Math.sin(lb * PI * 2));
      p.dy -= h * 0.15 * A;
      p.sy *= 1 + 0.05 * h;
      p.armL = p.armR = 0.8 + h * 0.5;
      break;
    }
    case 'slide': {
      const tri = 1 - Math.abs(((pr * 2) % 2) - 1); // 0→1→0
      p.dx += (tri - 0.5) * 0.9 * A;
      p.rot -= 0.12 * Math.sign(Math.cos(pr * PI * 2)) * A;
      p.legL = bi % 2 ? 0.5 : 0;
      p.legR = bi % 2 ? 0 : 0.5;
      p.armL = 0.3;
      p.armR = 1.1;
      break;
    }
    case 'headbang': {
      const s = Math.max(0, Math.sin(bf * PI * 2));
      p.rot += s * 0.3 * A;
      p.sy *= 1 - s * 0.1;
      p.armL = 2.2 + s * 0.3;
      p.armR = 0.6;
      break;
    }
    case 'clap': {
      const s = Math.abs(Math.cos(bf * PI));
      p.armL = p.armR = 1.8 + 0.6 * (1 - s);
      p.sy *= 1 + 0.04 * s;
      break;
    }
    case 'kick': {
      const s = Math.sin(bf * PI);
      if (bi % 2) p.legR = s;
      else p.legL = s;
      p.rot += (bi % 2 ? -1 : 1) * s * 0.12 * A;
      p.armL = p.armR = 1 + s * 0.4;
      break;
    }
    case 'stretch': {
      const s = Math.sin(pr * PI);
      p.sy *= 1 + 0.28 * s * A;
      p.sx *= 1 - 0.15 * s * A;
      p.armL = p.armR = 0.5 + s * 2.4;
      break;
    }
    case 'wobble': {
      const d = Math.exp(-bf * 4);
      const s = Math.sin(bf * PI * 7) * d;
      p.sx *= 1 + 0.18 * s * A;
      p.sy *= 1 - 0.18 * s * A;
      p.armL = p.armR = 1.2 + s;
      break;
    }
    case 'robot': {
      const step = Math.floor(lb * 2);
      p.rot += (step % 4 === 1 ? 0.2 : step % 4 === 3 ? -0.2 : 0) * A;
      p.armL = step % 2 ? PI / 2 : 0.2;
      p.armR = step % 2 ? 0.2 : PI / 2;
      p.dx += (step % 4 === 1 ? 0.06 : step % 4 === 3 ? -0.06 : 0);
      break;
    }
    case 'flip': {
      const w = Math.min(1, lb / Math.min(2, m.beats));
      p.dy -= Math.sin(w * PI) * 0.8 * A;
      p.rot += ease(w) * PI * 2;
      p.armL = p.armR = 2.4;
      break;
    }
    case 'point': {
      const side = Math.floor(lb / 2) % 2;
      const s = Math.sin(bf * PI);
      if (side) {
        p.armR = 2.5;
        p.armL = 0.4;
      } else {
        p.armL = 2.5;
        p.armR = 0.4;
      }
      p.rot += (side ? 0.12 : -0.12) * A;
      p.dy -= s * 0.06;
      break;
    }
    case 'cheer': {
      const s = Math.sin(lb * PI * 2);
      p.armL = 2.6 + 0.3 * s;
      p.armR = 2.6 - 0.3 * s;
      p.dy -= Math.abs(s) * 0.18 * A;
      p.sy *= 1 + 0.06 * Math.abs(s);
      break;
    }
  }
}

export const danceLoopBeats = (d: DanceDef): number => d.moves.reduce((a, m) => a + m.beats, 0);

export function danceFrame(d: DanceDef, t: number): DancePose {
  const bps = d.bpm / 60;
  const loop = danceLoopBeats(d);
  const beat = t * bps;
  const lb = beat % loop;
  const p: DancePose = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, armL: 0.5, armR: 0.5, legL: 0, legR: 0, mood: 'happy', fx: [] };
  let acc = 0;
  for (const m of d.moves) {
    if (lb < acc + m.beats) {
      applyMove(p, m, lb - acc);
      break;
    }
    acc += m.beats;
  }
  // partículas sem estado: emissões nas últimas ~1,2 s
  const life = 1.2 * bps;
  const first = Math.max(0, Math.ceil((beat - life) / d.fxEvery) * d.fxEvery);
  for (let e = first; e <= beat; e += d.fxEvery) {
    const age = (beat - e) / life; // 0..1
    for (let k = 0; k < 3; k++) {
      const ang = -PI / 2 + (hrand(e, k) - 0.5) * 2.2;
      const v = 1.3 + hrand(e, k + 7) * 0.9;
      const fall = d.fx === 'flake' || d.fx === 'leaf' || d.fx === 'confetti' ? 1.2 : d.fx === 'bubble' || d.fx === 'flame' ? -0.8 : 0.4;
      p.fx.push({
        kind: d.fx,
        x: Math.cos(ang) * v * age * 1.2,
        y: Math.sin(ang) * v * age * 1.2 - 0.5 + fall * age * age,
        a: 1 - age,
        s: 0.6 + 0.6 * (1 - age),
        rot: age * 4 + k,
        color: d.colors[k % 2],
      });
    }
  }
  return p;
}

export function playDance(id: string): DancePlayer | null {
  const def = REG.get(id);
  if (!def) return null;
  return { def, loopSec: (danceLoopBeats(def) * 60) / def.bpm, frame: (t) => danceFrame(def, t) };
}

/** aplica deslocamento/rotação (o squash vai no sx/sy do drawPlayer) */
export function applyDancePose(c: CanvasRenderingContext2D, p: DancePose, R: number): void {
  c.translate(p.dx * R, p.dy * R);
  // gira em torno dos pés (fica mais "dançante")
  c.translate(0, R * 0.9);
  c.rotate(p.rot);
  c.translate(0, -R * 0.9);
}

/** bracinhos redondos (desenhe antes do corpo para ficarem "atrás") */
export function drawDanceArms(c: CanvasRenderingContext2D, p: DancePose, R: number, color: string): void {
  c.save();
  c.strokeStyle = color;
  c.lineCap = 'round';
  c.lineWidth = R * 0.22;
  for (const [side, ang] of [[-1, p.armL], [1, p.armR]] as const) {
    const sx = side * R * 0.78;
    const sy = R * 0.1;
    // ang: 0 = para baixo, PI/2 = para o lado, PI = para cima
    const ex = sx + side * Math.sin(ang) * R * 0.55;
    const ey = sy + Math.cos(ang) * R * 0.55;
    c.beginPath();
    c.moveTo(sx, sy);
    c.quadraticCurveTo(sx + side * R * 0.2, (sy + ey) / 2, ex, ey);
    c.stroke();
  }
  // perninhas levantadas (o drawPlayer já desenha os pés parados)
  c.fillStyle = color;
  for (const [side, lift] of [[-1, p.legL], [1, p.legR]] as const) {
    if (lift <= 0.01) continue;
    c.beginPath();
    c.ellipse(side * R * (0.42 + lift * 0.25), R * (0.86 - lift * 0.35), R * 0.26, R * 0.16, side * lift * 0.6, 0, PI * 2);
    c.fill();
  }
  c.restore();
}

/** partículas de destaque, em coordenadas de tela (x,y = centro do personagem) */
export function drawDanceFx(c: CanvasRenderingContext2D, p: DancePose, x: number, y: number, R: number): void {
  c.save();
  for (const f of p.fx) {
    const px = x + (f.x + p.dx) * R;
    const py = y + (f.y + p.dy) * R;
    const s = R * 0.16 * f.s;
    c.globalAlpha = Math.max(0, f.a);
    c.fillStyle = f.color;
    c.strokeStyle = f.color;
    c.save();
    c.translate(px, py);
    c.rotate(f.rot);
    switch (f.kind) {
      case 'star':
      case 'spark': {
        c.beginPath();
        const n = f.kind === 'star' ? 5 : 4;
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * PI * 2;
          const r = i % 2 ? s * 0.4 : s;
          c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        c.fill();
        break;
      }
      case 'note':
        c.beginPath();
        c.ellipse(0, 0, s * 0.45, s * 0.32, -0.4, 0, PI * 2);
        c.fill();
        c.fillRect(s * 0.32, -s * 1.2, s * 0.13, s * 1.2);
        c.fillRect(s * 0.32, -s * 1.2, s * 0.45, s * 0.14);
        break;
      case 'heart':
        c.beginPath();
        c.moveTo(0, s * 0.35);
        c.bezierCurveTo(-s, -s * 0.3, -s * 0.45, -s, 0, -s * 0.45);
        c.bezierCurveTo(s * 0.45, -s, s, -s * 0.3, 0, s * 0.35);
        c.fill();
        break;
      case 'bubble':
        c.lineWidth = Math.max(1, s * 0.15);
        c.beginPath();
        c.arc(0, 0, s * 0.6, 0, PI * 2);
        c.stroke();
        break;
      case 'pixel':
        c.fillRect(-s * 0.4, -s * 0.4, s * 0.8, s * 0.8);
        break;
      case 'flake':
        c.lineWidth = Math.max(1, s * 0.12);
        for (let k = 0; k < 3; k++) {
          c.rotate(PI / 3);
          c.beginPath();
          c.moveTo(-s * 0.7, 0);
          c.lineTo(s * 0.7, 0);
          c.stroke();
        }
        break;
      case 'leaf':
        c.beginPath();
        c.ellipse(0, 0, s * 0.7, s * 0.3, 0, 0, PI * 2);
        c.fill();
        break;
      case 'flame':
        c.beginPath();
        c.moveTo(0, -s);
        c.quadraticCurveTo(s * 0.7, 0, 0, s * 0.6);
        c.quadraticCurveTo(-s * 0.7, 0, 0, -s);
        c.fill();
        break;
      case 'confetti':
        c.fillRect(-s * 0.2, -s * 0.4, s * 0.4, s * 0.8);
        break;
    }
    c.restore();
  }
  c.restore();
}
