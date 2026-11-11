/* ============================================================
 *  PAPER — atlas 2D do Bloop do jogador (ou de qualquer skin/cor)
 *  para mostrar como "personagem de papel" dentro dos mundos 3D.
 *
 *  Desenha com o MESMO código do hub (drawPlayer / drawAvatar):
 *  frente e costas (pose.view = 'back'). As vistas de ¾ e de lado
 *  saem de "girar" esses dois desenhos como uma esfera em volta do
 *  eixo Y (cada linha é um círculo: o rosto escorrega para o lado,
 *  o olho de longe some atrás do corpo, aparece a nuca). Peças fora
 *  do corpo (asas, orelhas, capa) giram como um cartão preso na borda.
 *
 *  Layout: VIEWS linhas × FRAMES colunas; célula de C px com borda
 *  transparente (mipmap sem sangrar). Contorno "papel recortado":
 *  borda branca + fio de tinta, gerado aqui (nada por frame no jogo).
 * ============================================================ */
import { save } from '../../core/storage';
import { drawAvatar, type AvatarData } from '../../game/avatar';
import { cols, mix, SHAPES } from '../../game/avatar-gfx';
import { MATERIALS } from '../../game/avatar-mat';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { skinById } from '../../game/skins';

/** quem desenhar: skin do catálogo, ou 'custom' + avatar montado no "Crie seu Bloop" */
export interface PaperSpec {
  skin: string;
  avatar?: AvatarData | null;
}

/** ângulos (graus) da câmera em volta do personagem: frente, ¾, lado, ¾ costas, costas */
export const VIEW_DEG = [0, 35, 70, 125, 180] as const;
export const VIEWS = VIEW_DEG.length;
/** quadros por vista */
export const FR = { idle: 0, blink: 1, walk: 2, act: 6, hurt: 8, happy: 9 } as const;
export const FRAMES = 10;
/** raio do corpo em fração da célula e linha dos pés (fração da célula, a partir do topo) */
export const R_K = 0.2;
const CY_K = 0.63;
/** base dos pés (fração da célula a partir do topo) */
export const FEET_K = CY_K + R_K * 1.04;

export interface PaperAtlas {
  key: string;
  canvas: HTMLCanvasElement;
  /** lado da célula (px) e tamanho do canvas */
  C: number;
  W: number;
  H: number;
  /** contagem de usos (o cache libera atlas sem uso) */
  refs: number;
  /** textura three.js criada por quem usa (paperChar) */
  tex?: unknown;
  mat?: unknown;
}

/* ------------------------------ specs ------------------------------ */

/** spec do próprio jogador (skin equipada; 'custom' = o avatar salvo) */
export function mySpec(): PaperSpec {
  return save.skin === 'custom' ? { skin: 'custom', avatar: save.avatar } : { skin: save.skin };
}
/** spec de outro jogador; sem avatar conhecido, 'custom' cai para a skin padrão */
export function specOf(skin: string, avatar?: unknown): PaperSpec {
  if (skin === 'custom') {
    const a = avatar as AvatarData | undefined;
    if (a && a.parts && a.colors) return { skin, avatar: a };
    return { skin: 'bloop' };
  }
  return { skin: skinById(skin).id };
}
/** NPC/ajudante: Bloop montado com peças do criador e uma cor */
export function npcSpec(primary: string, secondary = primary, parts: Partial<AvatarData['parts']> = {}): PaperSpec {
  return {
    skin: 'custom',
    avatar: {
      parts: { body: 'b_round', material: 'm_soft', pattern: 'p_none', eyes: 'e_cute', mouth: 'mo_smile', head: 'h_none', face: 'f_blush', back: 'k_none', aura: 'a_none', ...parts },
      colors: { primary, secondary },
    },
  };
}
export function specKey(s: PaperSpec, C: number): string {
  return s.skin === 'custom' && s.avatar ? `a:${JSON.stringify(s.avatar.parts)}:${s.avatar.colors.primary}:${s.avatar.colors.secondary}:${C}` : `s:${s.skin}:${C}`;
}

/** cor do corpo (mãozinha que segura a ferramenta) */
export function paperBodyColor(s: PaperSpec): string {
  if (s.skin === 'custom') {
    const a = s.avatar ?? save.avatar;
    const mat = MATERIALS[a.parts.material];
    const c = cols(a.colors.primary, a.colors.secondary);
    const k = mat?.skin ? mat.skin(c) : a.colors.primary;
    return k.length === 7 ? k : a.colors.primary;
  }
  return skinById(s.skin).light;
}

/* ------------------------------ desenho ------------------------------ */

interface Metrics {
  side: number;
  top: number;
  bottom: number;
  feet: boolean;
  feetCol: string;
  feetHi: string;
}
function metrics(s: PaperSpec): Metrics {
  if (s.skin === 'custom' && s.avatar) {
    const sh = SHAPES[s.avatar.parts.body] ?? SHAPES.b_blob;
    const mat = MATERIALS[s.avatar.parts.material] ?? MATERIALS.m_crayon;
    const c = cols(s.avatar.colors.primary, s.avatar.colors.secondary);
    const [f0, f1] = mat.feet ? mat.feet(c) : [c.Pd, c.Ph];
    return { side: sh.side, top: -sh.top, bottom: sh.bottom, feet: sh.feet, feetCol: f0, feetHi: f1 };
  }
  const sk = skinById(s.skin);
  const deep = mix(sk.dark, '#12001f', 0.55);
  return { side: 1, top: 1, bottom: 1, feet: sk.pattern !== 'ghost', feetCol: mix(sk.dark, deep, 0.25), feetHi: mix(sk.light, '#ffffff', 0.3) };
}

const POSE: PlayerPose = { t: 0.3, blink: 0, lookX: 0, lookY: 0.05, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83, still: true, noFeet: true };
function drawOne(x: CanvasRenderingContext2D, s: PaperSpec, R: number, back: boolean, line: boolean): void {
  POSE.view = back ? 'back' : undefined;
  POSE.noLine = !line;
  if (s.skin === 'custom') drawAvatar(x, s.avatar ?? save.avatar, R, POSE);
  else drawPlayer(x, skinById(s.skin), R, POSE);
}

/** pose 2D por quadro + pés: [sx, sy, blink, mood, pé esq. (frente, alto), pé dir. (frente, alto)] */
type FrameDef = [number, number, number, PlayerPose['mood'], number, number, number, number, number];
const FDEF: FrameDef[] = [
  [1, 1, 0, 'idle', 0, 0, 0, 0, 0.3],
  [1.03, 0.97, 1, 'idle', 0, 0, 0, 0, 2.1],
  // andar: pé que vai à frente sobe um pouco; corpo estica/achata
  [1.05, 0.95, 0, 'idle', 0.32, 0, -0.28, 0, 0.5],
  [0.96, 1.05, 0, 'idle', 0.05, 0.16, -0.05, 0, 0.7],
  [1.05, 0.95, 0, 'idle', -0.28, 0, 0.32, 0, 0.9],
  [0.96, 1.05, 0, 'idle', -0.05, 0, 0.05, 0.16, 1.1],
  // ação: prepara / golpe
  [0.95, 1.06, 0, 'idle', 0.1, 0, -0.1, 0, 1.3],
  [1.09, 0.92, 0.5, 'idle', 0.25, 0, -0.15, 0, 1.5],
  // dor, alegria
  [1.13, 0.86, 1, 'idle', 0, 0, 0, 0, 1.7],
  [0.97, 1.05, 0, 'happy', 0, 0.1, 0, 0.1, 1.9],
];

let srcF: HTMLCanvasElement | null = null;
let srcB: HTMLCanvasElement | null = null;
let srcFn: HTMLCanvasElement | null = null;
let srcBn: HTMLCanvasElement | null = null;
let tmp: HTMLCanvasElement | null = null;
const cv = (w: number, h: number, c: HTMLCanvasElement | null): HTMLCanvasElement => {
  const o = c ?? document.createElement('canvas');
  if (o.width !== w || o.height !== h) {
    o.width = w;
    o.height = h;
  }
  return o;
};

/**
 * "Gira" frente/costas para a vista phi (rad), em resolução S (2× a célula).
 * F/B: RGBA S×S; out: RGBA S×S (sobrescrito).
 */
/**
 * Raio (em R) do "cilindro" de cada linha: corpo = elipse da forma (já com o
 * estica/achata do quadro); no alto da cabeça usa a largura do que está
 * desenhado (coroa larga gira larga, antena fina fica no meio).
 */
interface Rows {
  RR: Float32Array;
  CF: Float32Array;
  CB: Float32Array;
}
const mkRows = (S: number): Rows => ({ RR: new Float32Array(S), CF: new Float32Array(S), CB: new Float32Array(S) });
function rowRadii(F: Uint8ClampedArray, B: Uint8ClampedArray, S: number, cx: number, cy: number, R: number, m: Metrics, sx: number, sy: number, o: Rows): void {
  for (let py = 0; py < S; py++) {
    const v = (py + 0.5 - cy) / R;
    const k = v < 0 ? v / (m.top * sy) : v / (m.bottom * sy);
    const body = m.side * sx * Math.sqrt(Math.max(0, 1 - k * k));
    let rr: number;
    let cf = 0;
    let cb = 0;
    if (k < -0.6) {
      // alto da cabeça: cilindro com o centro e a largura do que está desenhado
      const row = py * S;
      let l0 = 1e9;
      let r0 = -1e9;
      let l1 = 1e9;
      let r1 = -1e9;
      for (let px = 0; px < S; px++) {
        const i = (row + px) * 4 + 3;
        const x = (px + 0.5 - cx) / R;
        if (F[i] > 150) {
          if (x < l0) l0 = x;
          r0 = x;
        }
        if (B[i] > 150) {
          if (x < l1) l1 = x;
          r1 = x;
        }
      }
      let hw = 0;
      if (r0 >= l0) {
        cf = (l0 + r0) / 2;
        hw = (r0 - l0) / 2;
      }
      if (r1 >= l1) {
        cb = (l1 + r1) / 2;
        hw = Math.max(hw, (r1 - l1) / 2);
      }
      if (k > -1) {
        // ainda tem corpo nesta linha: o eixo fica no meio
        const w = (k + 1) / 0.4;
        cf *= 1 - w;
        cb *= 1 - w;
      }
      rr = Math.max(body, Math.min(1.1 * m.side, hw + 0.02), 0.1);
    } else if (k > 1) rr = Math.max(body, 0.45 * m.side);
    else rr = Math.max(body, 0.3 * m.side);
    o.RR[py] = rr;
    o.CF[py] = cf;
    o.CB[py] = cb;
  }
}

function rotateView(F: Uint8ClampedArray, B: Uint8ClampedArray, out: Uint8ClampedArray, zb: Float32Array, S: number, cx: number, R: number, rows: Rows, phi: number): void {
  const { RR, CF, CB } = rows;
  out.fill(0);
  zb.fill(-1e9);
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  // a costura frente/costas amostra um pouco para dentro (evita o contorno 2D no meio do corpo)
  const kk = 1 - 0.12 * Math.abs(sp);
  // 1) peças fora do corpo: cartão preso na borda (x·cosφ, profundidade x·sinφ)
  const src = cp >= 0 ? F : B;
  const sg = cp >= 0 ? 1 : -1;
  if (Math.abs(cp) > 0.04) {
    for (let py = 0; py < S; py++) {
      const rr = RR[py];
      const row = py * S;
      for (let px = 0; px < S; px++) {
        const i = (row + px) * 4;
        if (src[i + 3] < 8) continue;
        const xi = (px + 0.5 - cx) / R;
        // beirada do corpo (contorno, papel de baixo) não é "peça de fora"
        if (Math.abs(xi - (sg > 0 ? CF[py] : CB[py])) <= rr + 0.14) continue;
        const xw = sg * xi;
        const dx = Math.round(cx + xw * cp * R - 0.5);
        if (dx < 0 || dx >= S) continue;
        const j = row + dx;
        const z = xw * sp;
        if (z < zb[j] && out[j * 4 + 3] > 0) continue;
        zb[j] = z;
        out[j * 4] = src[i];
        out[j * 4 + 1] = src[i + 1];
        out[j * 4 + 2] = src[i + 2];
        out[j * 4 + 3] = src[i + 3];
      }
    }
  }
  // 2) corpo: cada linha é um círculo de raio rr girando em volta de Y
  for (let py = 0; py < S; py++) {
    const rr = RR[py];
    const cf = CF[py];
    const cb = CB[py];
    const cd = cf + (cb - cf) * (1 - cp) * 0.5;
    const row = py * S;
    const x0 = Math.max(0, Math.floor(cx + (cd - rr) * R));
    const x1 = Math.min(S - 1, Math.ceil(cx + (cd + rr) * R));
    for (let px = x0; px <= x1; px++) {
      const u = (px + 0.5 - cx) / R - cd;
      const s = u / rr;
      if (s < -1 || s > 1) continue;
      // θ = asin(s) + φ, sem trigonometria por pixel
      const q = Math.sqrt(1 - s * s);
      const sinT = s * cp + q * sp;
      const front = q * cp - s * sp >= 0;
      const sx = front ? cf + rr * kk * sinT : cb - rr * kk * sinT;
      const fx = cx + sx * R - 0.5;
      const ix = Math.floor(fx);
      const fr = fx - ix;
      const A = front ? F : B;
      // bilinear na horizontal (premultiplicado → sem franja escura)
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let q = 0; q < 2; q++) {
        const xx = ix + q;
        if (xx < 0 || xx >= S) continue;
        const w = q ? fr : 1 - fr;
        const i = (row + xx) * 4;
        const aa = A[i + 3] * w;
        r += A[i] * aa;
        g += A[i + 1] * aa;
        b += A[i + 2] * aa;
        a += aa;
      }
      if (a < 2) continue;
      const j = row + px;
      const o = j * 4;
      const bz = rr * q;
      const ba = a / 255;
      const br = r / a;
      const bg = g / a;
      const bb = b / a;
      const oa = out[o + 3] / 255;
      if (oa > 0 && zb[j] > bz) {
        // peça de fora na frente do corpo: peça por cima
        const na = oa + ba * (1 - oa);
        out[o] = (out[o] * oa + br * ba * (1 - oa)) / na;
        out[o + 1] = (out[o + 1] * oa + bg * ba * (1 - oa)) / na;
        out[o + 2] = (out[o + 2] * oa + bb * ba * (1 - oa)) / na;
        out[o + 3] = na * 255;
      } else {
        const na = ba + oa * (1 - ba);
        out[o] = (br * ba + out[o] * oa * (1 - ba)) / na;
        out[o + 1] = (bg * ba + out[o + 1] * oa * (1 - ba)) / na;
        out[o + 2] = (bb * ba + out[o + 2] * oa * (1 - ba)) / na;
        out[o + 3] = na * 255;
        zb[j] = bz;
      }
    }
  }
}

/** pés no chão: posição local (lado, frente) projetada na vista phi; desenha o de trás antes */
function drawFeet(x: CanvasRenderingContext2D, m: Metrics, R: number, cx: number, cy: number, phi: number, fd: FrameDef, layer: 0 | 1): void {
  if (!m.feet) return;
  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  for (let k = 0; k < 2; k++) {
    const lx = (k ? 1 : -1) * 0.42;
    const lz = 0.12 + (fd[4 + k * 2] as number);
    const lift = fd[5 + k * 2] as number;
    const depth = lz * cp + lx * sp;
    // de costas os pés ficam sempre atrás (capa/asas cobrem)
    if ((depth >= 0 && cp > -0.3 ? 1 : 0) !== layer) continue;
    const ux = lx * cp - lz * sp;
    // de lado o pé vira um "feijão" comprido; de frente, redondo
    const rx = 0.28 * Math.abs(cp) + 0.34 * Math.abs(sp);
    const fx = cx + ux * R;
    const fy = cy + (0.86 - lift) * R;
    x.fillStyle = m.feetCol;
    x.beginPath();
    x.ellipse(fx, fy, R * rx, R * 0.18, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 0.5;
    x.fillStyle = m.feetHi;
    x.beginPath();
    x.ellipse(fx - R * 0.05, fy - R * 0.06, R * rx * 0.42, R * 0.06, 0, 0, Math.PI * 2);
    x.fill();
    x.globalAlpha = 1;
  }
}

/** contorno de papel recortado: borda branca (bw px) + fio de tinta fora dela */
let olD: Float32Array | null = null;
function paperOutline(d: Uint8ClampedArray, W: number, x0: number, y0: number, C: number, bw: number): void {
  const ink = bw + 1.1;
  // só a caixa do desenho (+ margem da borda): ~3× menos pixels
  let bx0 = C;
  let by0 = C;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < C; y++) {
    const row = ((y0 + y) * W + x0) * 4 + 3;
    for (let x = 0; x < C; x++)
      if (d[row + x * 4] > 8) {
        if (x < bx0) bx0 = x;
        if (x > bx1) bx1 = x;
        if (y < by0) by0 = y;
        by1 = y;
      }
  }
  if (bx1 < 0) return;
  const m = Math.ceil(ink) + 2;
  bx0 = Math.max(0, bx0 - m);
  by0 = Math.max(0, by0 - m);
  bx1 = Math.min(C - 1, bx1 + m);
  by1 = Math.min(C - 1, by1 + m);
  const w = bx1 - bx0 + 1;
  const h = by1 - by0 + 1;
  if (!olD || olD.length < w * h) olD = new Float32Array(C * C);
  const D = olD;
  // distância aproximada (chamfer 2 passes) até um pixel sólido
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) D[y * w + x] = d[((y0 + by0 + y) * W + x0 + bx0 + x) * 4 + 3] > 96 ? 0 : 1e9;
  const S2 = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let v = D[i];
      if (v === 0) continue;
      if (x > 0) v = Math.min(v, D[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, D[i - w] + 1);
        if (x > 0) v = Math.min(v, D[i - w - 1] + S2);
        if (x < w - 1) v = Math.min(v, D[i - w + 1] + S2);
      }
      D[i] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = D[i];
      if (v === 0) continue;
      if (x < w - 1) v = Math.min(v, D[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, D[i + w] + 1);
        if (x < w - 1) v = Math.min(v, D[i + w + 1] + S2);
        if (x > 0) v = Math.min(v, D[i + w - 1] + S2);
      }
      D[i] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dist = D[y * w + x];
      const o = ((y0 + by0 + y) * W + x0 + bx0 + x) * 4;
      const a0 = d[o + 3] / 255;
      if (a0 >= 0.999) continue;
      let r = 52;
      let g = 30;
      let b = 70;
      let a = 0;
      if (dist <= bw) {
        r = 255;
        g = 252;
        b = 246;
        a = 1;
      } else if (dist <= ink) a = Math.min(1, ink - dist + 0.35) * 0.85;
      else if (a0 <= 0) {
        // fora: cor de tinta com alpha 0 (o mipmap não puxa preto/branco estranho)
        d[o] = r;
        d[o + 1] = g;
        d[o + 2] = b;
        continue;
      }
      // o desenho por cima da borda
      const na = a0 + a * (1 - a0);
      if (na <= 0) continue;
      d[o] = (d[o] * a0 + r * a * (1 - a0)) / na;
      d[o + 1] = (d[o + 1] * a0 + g * a * (1 - a0)) / na;
      d[o + 2] = (d[o + 2] * a0 + b * a * (1 - a0)) / na;
      d[o + 3] = na * 255;
    }
}

/** gera o atlas (~90 ms para célula 128 num PC sem GPU no canvas; cacheado por spec) */
export function buildPaperAtlas(spec: PaperSpec, C: number): PaperAtlas {
  const key = specKey(spec, C);
  const W = C * FRAMES;
  const H = C * VIEWS;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ax = canvas.getContext('2d', { willReadFrequently: true })!;
  // 1,5× a célula: o desenho é reduzido depois (borda lisa) sem custar 4× os pixels
  const S = Math.round(C * 1.5);
  const R = S * R_K;
  const cx = S / 2;
  const cy = S * CY_K;
  const m = metrics(spec);
  srcF = cv(S, S, srcF);
  srcB = cv(S, S, srcB);
  tmp = cv(S, S, tmp);
  srcFn = cv(S, S, srcFn);
  srcBn = cv(S, S, srcBn);
  const fx = srcF.getContext('2d', { willReadFrequently: true })!;
  const bx = srcB.getContext('2d', { willReadFrequently: true })!;
  const fnx = srcFn.getContext('2d', { willReadFrequently: true })!;
  const bnx = srcBn.getContext('2d', { willReadFrequently: true })!;
  const tx = tmp.getContext('2d', { willReadFrequently: true })!;
  const out = new ImageData(S, S);
  const zb = new Float32Array(S * S);
  const rowsEnd = mkRows(S);
  const rowsRot = mkRows(S);
  for (let f = 0; f < FRAMES; f++) {
    const fd = FDEF[f];
    POSE.sx = fd[0];
    POSE.sy = fd[1];
    POSE.blink = fd[2];
    POSE.mood = fd[3];
    POSE.t = fd[8];
    for (const [x, back, line] of [
      [fx, false, true],
      [bx, true, true],
      [fnx, false, false],
      [bnx, true, false],
    ] as const) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, S, S);
      // o desenho estica a partir do centro; a base dos pés fica no chão
      x.translate(cx, cy + (1 - fd[1]) * R * 0.95);
      // fontes das vistas giradas: luz de cima (simétrica) e costas espelhadas,
      // para o lado claro/"fora da linha" do desenho não cair no meio do corpo
      POSE.lx = line ? -0.55 : 0;
      POSE.ly = line ? -0.83 : -1;
      if (back && !line) x.scale(-1, 1);
      drawOne(x, spec, R, back, line);
    }
    const F = fx.getImageData(0, 0, S, S).data;
    const B = bx.getImageData(0, 0, S, S).data;
    // vistas giradas: sem o contorno 2D (senão ele aparece no meio do corpo)
    const Fn = fnx.getImageData(0, 0, S, S).data;
    const Bn = bnx.getImageData(0, 0, S, S).data;
    const ccy = cy + (1 - fd[1]) * R * 0.95;
    rowRadii(F, B, S, cx, ccy, R, m, fd[0], fd[1], rowsEnd);
    rowRadii(Fn, Bn, S, cx, ccy, R, m, fd[0], fd[1], rowsRot);
    for (let v = 0; v < VIEWS; v++) {
      const phi = (VIEW_DEG[v] * Math.PI) / 180;
      const ends = v === 0 || v === VIEWS - 1;
      rotateView(ends ? F : Fn, ends ? B : Bn, out.data, zb, S, cx, R, ends ? rowsEnd : rowsRot, phi);
        tx.setTransform(1, 0, 0, 1, 0, 0);
      tx.clearRect(0, 0, S, S);
      drawFeet(tx, m, R, cx, cy, phi, fd, 0);
      // corpo por cima dos pés de trás
      const tmp2 = tempCanvas(S);
      tmp2.getContext('2d')!.putImageData(out, 0, 0);
      tx.drawImage(tmp2, 0, 0);
      drawFeet(tx, m, R, cx, cy, phi, fd, 1);
      ax.imageSmoothingEnabled = true;
      ax.imageSmoothingQuality = 'high';
      ax.drawImage(tmp, 0, 0, S, S, f * C, v * C, C, C);
      }
  }
  // contorno de papel em todas as células
  const img = ax.getImageData(0, 0, W, H);
  const bw = Math.max(1.5, C / 52);
  for (let v = 0; v < VIEWS; v++) for (let f = 0; f < FRAMES; f++) paperOutline(img.data, W, f * C, v * C, C, bw);
  ax.putImageData(img, 0, 0);
  return { key, canvas, C, W, H, refs: 0 };
}
let tmp2c: HTMLCanvasElement | null = null;
const tempCanvas = (S: number): HTMLCanvasElement => (tmp2c = cv(S, S, tmp2c));

/* ------------------------------ ferramentas ------------------------------ */
export type PaperTool = 'axe' | 'hammer' | 'lamp' | 'torch' | 'shovel' | 'pick' | 'bucket';
/**
 * Ferramenta 2D (cabo para baixo; pegada em (TOOL_GRIP_X, TOOL_GRIP_Y) da imagem).
 * Proporção 1:2 (largura:altura).
 */
export const TOOL_GRIP = [0.5, 0.86] as const;
export function drawToolCanvas(kind: PaperTool, col: string, hand = '#ffffff', w = 64): HTMLCanvasElement {
  const h = w * 2;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  const u = w / 64;
  x.lineCap = 'round';
  x.lineJoin = 'round';
  const ink = '#341e46';
  const stroke = (lw: number) => {
    x.lineWidth = lw * u;
    x.strokeStyle = ink;
    x.stroke();
  };
  const handle = (y0: number, y1: number, cl = '#9a5a2a', wd = 7) => {
    x.beginPath();
    x.moveTo(32 * u, y0 * u);
    x.lineTo(32 * u, y1 * u);
    x.lineWidth = (wd + 4) * u;
    x.strokeStyle = ink;
    x.stroke();
    x.lineWidth = wd * u;
    x.strokeStyle = cl;
    x.stroke();
    x.lineWidth = 2 * u;
    x.strokeStyle = 'rgba(255,255,255,0.35)';
    x.beginPath();
    x.moveTo(30 * u, (y0 + 3) * u);
    x.lineTo(30 * u, (y1 - 3) * u);
    x.stroke();
  };
  x.save();
  switch (kind) {
    case 'axe':
      handle(20, 116);
      x.beginPath();
      x.moveTo(30 * u, 14 * u);
      x.quadraticCurveTo(58 * u, 6 * u, 60 * u, 30 * u);
      x.quadraticCurveTo(58 * u, 50 * u, 30 * u, 44 * u);
      x.closePath();
      x.fillStyle = col;
      x.fill();
      stroke(3);
      x.fillStyle = 'rgba(255,255,255,0.55)';
      x.beginPath();
      x.moveTo(52 * u, 18 * u);
      x.quadraticCurveTo(58 * u, 30 * u, 52 * u, 40 * u);
      x.lineTo(48 * u, 38 * u);
      x.quadraticCurveTo(52 * u, 29 * u, 48 * u, 20 * u);
      x.fill();
      break;
    case 'hammer':
      handle(26, 116, '#c08a52');
      x.fillStyle = col;
      x.beginPath();
      x.roundRect(10 * u, 8 * u, 44 * u, 24 * u, 8 * u);
      x.fill();
      stroke(3);
      break;
    case 'shovel':
      handle(8, 116, '#c08a52', 6);
      x.fillStyle = '#c08a52';
      x.beginPath();
      x.roundRect(22 * u, 2 * u, 20 * u, 9 * u, 4 * u);
      x.fill();
      stroke(2.5);
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(18 * u, 66 * u);
      x.lineTo(46 * u, 66 * u);
      x.lineTo(46 * u, 96 * u);
      x.quadraticCurveTo(32 * u, 122 * u, 18 * u, 96 * u);
      x.closePath();
      x.fill();
      stroke(3);
      break;
    case 'pick':
      handle(20, 116);
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(4 * u, 34 * u);
      x.quadraticCurveTo(32 * u, 4 * u, 60 * u, 34 * u);
      x.quadraticCurveTo(32 * u, 18 * u, 4 * u, 34 * u);
      x.fill();
      stroke(3);
      break;
    case 'bucket':
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(12 * u, 60 * u);
      x.lineTo(52 * u, 60 * u);
      x.lineTo(46 * u, 104 * u);
      x.lineTo(18 * u, 104 * u);
      x.closePath();
      x.fill();
      stroke(3);
      x.beginPath();
      x.arc(32 * u, 60 * u, 20 * u, Math.PI, 0);
      stroke(3);
      break;
    case 'torch':
    case 'lamp': {
      if (kind === 'torch') handle(54, 116, '#8a5228');
      else {
        x.beginPath();
        x.moveTo(32 * u, 20 * u);
        x.lineTo(32 * u, 108 * u);
        stroke(4);
      }
      // brilho
      const g = x.createRadialGradient(32 * u, 38 * u, 0, 32 * u, 38 * u, 30 * u);
      g.addColorStop(0, col);
      g.addColorStop(0.45, col + 'aa');
      g.addColorStop(1, col + '00');
      x.fillStyle = g;
      x.fillRect(0, 6 * u, w, 66 * u);
      if (kind === 'torch') {
        x.fillStyle = '#ff7a1a';
        x.beginPath();
        x.moveTo(20 * u, 54 * u);
        x.quadraticCurveTo(18 * u, 30 * u, 32 * u, 14 * u);
        x.quadraticCurveTo(46 * u, 30 * u, 44 * u, 54 * u);
        x.closePath();
        x.fill();
        x.fillStyle = '#ffe36b';
        x.beginPath();
        x.moveTo(25 * u, 52 * u);
        x.quadraticCurveTo(26 * u, 36 * u, 32 * u, 28 * u);
        x.quadraticCurveTo(38 * u, 36 * u, 39 * u, 52 * u);
        x.closePath();
        x.fill();
      } else {
        x.fillStyle = '#3a4250';
        x.beginPath();
        x.roundRect(20 * u, 24 * u, 24 * u, 30 * u, 6 * u);
        x.fill();
        x.fillStyle = col;
        x.beginPath();
        x.roundRect(24 * u, 28 * u, 16 * u, 22 * u, 4 * u);
        x.fill();
        x.fillStyle = '#ffffff';
        x.globalAlpha = 0.7;
        x.beginPath();
        x.roundRect(26 * u, 30 * u, 5 * u, 16 * u, 2 * u);
        x.fill();
        x.globalAlpha = 1;
      }
      break;
    }
  }
  x.restore();
  // mãozinha (pegada)
  const gx = TOOL_GRIP[0] * w;
  const gy = TOOL_GRIP[1] * h;
  x.beginPath();
  x.arc(gx, gy, 9 * u, 0, Math.PI * 2);
  x.fillStyle = hand;
  x.fill();
  x.lineWidth = 2.5 * u;
  x.strokeStyle = ink;
  x.stroke();
  return c;
}
