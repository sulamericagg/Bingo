/**
 * CAVA & FALA — "OBJETO FALADO" (criação livre por voz).
 *
 * Formato compartilhado entre o servidor (POST /api/cava/make → server/cava-ai.ts), o gerador
 * offline do aparelho (shared/cavagen.ts) e o montador 3D (src/games/cavafala/creation.ts).
 *
 *   ObjSpec = { v:1, name, desc, role, body, parts[], behaviors[], seat? }
 *   parte    = forma primitiva (box/sphere/cylinder/cone/capsule/torus/wedge) com tamanho (caixa envolvente,
 *              metros), posição/rotação em relação à raiz (chão no y=0, FRENTE = +z), cor da paleta,
 *              material (wood/metal/rubber/glow/glass/jelly/plastic/stone) e junta opcional
 *              (fixed/hinge/wheel/spin/spring).
 *   comportamentos = lista BRANCA que o motor sabe simular (rola, voa, flutua, pula, atira coisas moles...).
 *
 * TUDO que vem de fora (IA, rede, armazenamento) passa por validateSpec(): números finitos e limitados,
 * no máx. 24 peças, tamanho total limitado (encolhe para caber), cores só da paleta, comportamentos só da
 * lista, nome/descrição pelo filtro do chat. Nada de texto livre além de nome (≤28) e descrição (≤90).
 *
 * Também aqui: kidSafeRequest() — o pedido da criança vira uma versão boba e inofensiva quando pede arma,
 * explosivo, sangue, marca/personagem etc. ("arma" → "lançador de espuma").
 */
import { maskLongText, scanText } from './moderation';

export const SHAPES = ['box', 'sphere', 'cylinder', 'cone', 'capsule', 'torus', 'wedge'] as const;
export type Shape = (typeof SHAPES)[number];
export const OBJ_MATS = ['plastic', 'wood', 'metal', 'rubber', 'glow', 'glass', 'jelly', 'stone'] as const;
export type ObjMat = (typeof OBJ_MATS)[number];
export const JOINTS = ['fixed', 'hinge', 'wheel', 'spin', 'spring'] as const;
export type JointType = (typeof JOINTS)[number];
export const AXES = ['x', 'y', 'z'] as const;
export type Axis = (typeof AXES)[number];
export const ROLES = ['attack', 'defense', 'mobility', 'utility'] as const;
export type Role = (typeof ROLES)[number];

/** comportamentos que o motor simula (e o parâmetro "kind" aceito por cada um) */
export const BEHAVIORS = {
  rolls: [] as string[],
  walks: [] as string[],
  flies: ['propeller', 'balloon', 'wings', 'rocket'],
  floats: [] as string[],
  bounces: [] as string[],
  jumps: [] as string[],
  shoots: ['bubbles', 'foam', 'confetti', 'water', 'snow'],
  pushes: [] as string[],
  digs: [] as string[],
  carries: [] as string[],
  sticks: [] as string[],
  grows: [] as string[],
  glows: [] as string[],
  follows: [] as string[],
  ride: [] as string[],
  sound: ['honk', 'boing', 'roar', 'beep', 'music', 'splash', 'moo', 'meow', 'woof', 'whoosh', 'chirp', 'pop'],
} as const;
export type BehType = keyof typeof BEHAVIORS;
export const BEH_TYPES = Object.keys(BEHAVIORS) as BehType[];
/** comportamentos que exigem corpo que se move */
const MOVERS: BehType[] = ['rolls', 'walks', 'flies', 'floats', 'jumps', 'follows', 'ride', 'bounces'];

/** paleta infantil (nome → cor). A IA só pode usar estes nomes. */
export const PALETTE = {
  red: '#ff4f6a',
  orange: '#ff8a3a',
  yellow: '#ffd34a',
  lime: '#a6e05a',
  green: '#3fbf6a',
  teal: '#2ec4b6',
  sky: '#7fd0ff',
  blue: '#3a7bff',
  navy: '#2d3a8c',
  purple: '#9a5aff',
  lavender: '#c9b3ff',
  pink: '#ff8ad0',
  magenta: '#e04fd0',
  peach: '#ffb48a',
  cream: '#fff3d6',
  white: '#ffffff',
  silver: '#cfd6e6',
  gray: '#8d93a8',
  black: '#3a2f4a',
  brown: '#9a6334',
  tan: '#e2b47c',
  chocolate: '#6b3d22',
  gold: '#ffc933',
  mint: '#a8f0d0',
} as const;
export type ColorName = keyof typeof PALETTE;
export const COLOR_NAMES = Object.keys(PALETTE) as ColorName[];

/** nomes de cor em pt/es/en que a IA (ou o gerador) às vezes usa → paleta */
const COLOR_ALIAS: Record<string, ColorName> = {
  vermelho: 'red', vermelha: 'red', rojo: 'red', laranja: 'orange', naranja: 'orange', amarelo: 'yellow', amarela: 'yellow', amarillo: 'yellow',
  verde: 'green', 'verde-limao': 'lime', azul: 'blue', 'azul-claro': 'sky', celeste: 'sky', 'azul-marinho': 'navy', roxo: 'purple', roxa: 'purple',
  lilas: 'lavender', violeta: 'purple', rosa: 'pink', 'pink': 'pink', branco: 'white', branca: 'white', blanco: 'white', prata: 'silver', cinza: 'gray',
  gris: 'gray', grey: 'gray', preto: 'black', preta: 'black', negro: 'black', marrom: 'brown', cafe: 'brown', bege: 'tan', chocolate: 'chocolate',
  dourado: 'gold', ouro: 'gold', golden: 'gold', creme: 'cream', menta: 'mint', pessego: 'peach', turquesa: 'teal', cyan: 'teal', ciano: 'teal',
  violet: 'purple', beige: 'tan', light_blue: 'sky', lightblue: 'sky', dark_blue: 'navy', darkblue: 'navy',
};

export interface ObjJoint {
  type: JointType;
  axis: Axis;
  /** velocidade (voltas/s para spin/wheel, ciclos/s para hinge/spring), -3..3 */
  speed: number;
  /** amplitude em graus (hinge) ou fração (spring), 0..90 */
  swing: number;
  /** ponto de giro (relativo à raiz); padrão = centro da peça */
  pivot?: V3;
}
export type V3 = [number, number, number];
export interface ObjPart {
  shape: Shape;
  size: V3;
  pos: V3;
  /** graus (Euler XYZ) */
  rot: V3;
  color: ColorName;
  mat: ObjMat;
  joint?: ObjJoint;
}
export interface ObjBehavior {
  type: BehType;
  /** força 0..1 (velocidade, altura, cadência...) */
  power: number;
  kind?: string;
}
export interface ObjSpec {
  v: 1;
  name: string;
  desc: string;
  role: Role;
  /** static = fica parado como construção (ponte, casa, escada); dynamic = corpo com física */
  body: 'static' | 'dynamic';
  parts: ObjPart[];
  behaviors: ObjBehavior[];
  /** assento para montar (se tiver 'ride') */
  seat?: V3;
}

export const SPEC_LIMITS = {
  parts: 24,
  behaviors: 6,
  /** maior lado da caixa envolvente (m) */
  extent: 10,
  /** soma dos volumes das caixas das peças (m³) */
  volume: 140,
  minPart: 0.05,
  maxPart: 8,
  name: 28,
  desc: 90,
  /** JSON cru aceito (bytes) */
  rawBytes: 24_000,
  /** arena: lado máximo e força máxima */
  arenaExtent: 4.5,
  arenaPower: 0.6,
};

/* ------------------------------ ajudantes numéricos ------------------------------ */
const fin = (v: unknown, d = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : d;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;
function vec(v: unknown, d: V3, lo: number, hi: number): V3 {
  const a = Array.isArray(v) ? v : [];
  return [r3(clamp(fin(a[0], d[0]), lo, hi)), r3(clamp(fin(a[1], d[1]), lo, hi)), r3(clamp(fin(a[2], d[2]), lo, hi))];
}
function pick<T extends string>(v: unknown, list: readonly T[], d: T): T {
  const s = String(v ?? '').toLowerCase().trim();
  return (list as readonly string[]).includes(s) ? (s as T) : d;
}
function hexToRgb(h: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
  const n = parseInt(x, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
/** qualquer cor (nome da paleta, apelido pt/es, #hex) → nome da paleta mais próxima */
export function snapColor(v: unknown, d: ColorName = 'white'): ColorName {
  const s = String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  if (s in PALETTE) return s as ColorName;
  if (COLOR_ALIAS[s]) return COLOR_ALIAS[s];
  const rgb = hexToRgb(s);
  if (!rgb) return d;
  let best: ColorName = d;
  let bd = Infinity;
  for (const k of COLOR_NAMES) {
    const c = hexToRgb(PALETTE[k])!;
    const dd = (c[0] - rgb[0]) ** 2 * 0.3 + (c[1] - rgb[1]) ** 2 * 0.59 + (c[2] - rgb[2]) ** 2 * 0.11;
    if (dd < bd) (bd = dd), (best = k);
  }
  return best;
}

/** limpa texto curto (nome/descrição): sem controle/HTML, filtro do chat; palavrão ou dado pessoal → null */
export function cleanText(v: unknown, max: number): string | null {
  const raw = String(v ?? '')
    .replace(/[\u0000-\u001f\u007f<>{}[\]\\`"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  if (!raw) return null;
  const m = maskLongText(raw, max);
  if (m.pii || m.filtered) return null;
  if (scanText(raw).level !== 'ok') return null;
  return m.text;
}

/* ------------------------------ volume / tamanho ------------------------------ */
/** volume aproximado da peça (m³) */
export function partVolume(p: ObjPart): number {
  const [x, y, z] = p.size;
  const box = x * y * z;
  switch (p.shape) {
    case 'sphere':
      return box * 0.5236;
    case 'cylinder':
    case 'capsule':
      return box * 0.785;
    case 'cone':
      return box * 0.262;
    case 'wedge':
      return box * 0.5;
    case 'torus':
      return box * 0.3;
    default:
      return box;
  }
}
/** caixa envolvente das peças (aproximada: a rotação é considerada pela maior meia-diagonal) */
export function specBounds(parts: ObjPart[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const rotated = p.rot.some((r) => Math.abs(r % 180) > 1);
    const h: V3 = rotated ? ((d) => [d, d, d])(Math.hypot(p.size[0], p.size[1], p.size[2]) / 2) : [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    // rotação de 90° pura: troca eixos (comum: rodas deitadas)
    if (rotated && p.rot.every((r) => Math.abs(r % 90) < 1)) {
      const rx = Math.round(p.rot[0] / 90) % 2 !== 0,
        ry = Math.round(p.rot[1] / 90) % 2 !== 0,
        rz = Math.round(p.rot[2] / 90) % 2 !== 0;
      let [a, b, c] = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
      if (rx) [b, c] = [c, b];
      if (ry) [a, c] = [c, a];
      if (rz) [a, b] = [b, a];
      h[0] = a;
      h[1] = b;
      h[2] = c;
    }
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i] - h[i]);
      max[i] = Math.max(max[i], p.pos[i] + h[i]);
    }
  }
  return { min, max };
}
export function specExtent(s: ObjSpec): number {
  const b = specBounds(s.parts);
  return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
}
export function specVolume(s: ObjSpec): number {
  return s.parts.reduce((n, p) => n + partVolume(p), 0);
}

/** escala o objeto inteiro (peças, juntas, assento) */
export function scaleSpec(s: ObjSpec, k: number): void {
  if (!(k > 0) || Math.abs(k - 1) < 1e-4) return;
  const sv = (v: V3): V3 => [r3(v[0] * k), r3(v[1] * k), r3(v[2] * k)];
  for (const p of s.parts) {
    p.size = sv(p.size).map((x) => Math.max(SPEC_LIMITS.minPart, x)) as V3;
    p.pos = sv(p.pos);
    if (p.joint?.pivot) p.joint.pivot = sv(p.joint.pivot);
  }
  if (s.seat) s.seat = sv(s.seat);
}

/** apoia no chão (menor y = 0) e centraliza em x/z */
function settle(s: ObjSpec): void {
  const b = specBounds(s.parts);
  const dx = -(b.min[0] + b.max[0]) / 2,
    dy = -b.min[1],
    dz = -(b.min[2] + b.max[2]) / 2;
  const mv = (v: V3): V3 => [r3(v[0] + dx), r3(v[1] + dy), r3(v[2] + dz)];
  for (const p of s.parts) {
    p.pos = mv(p.pos);
    if (p.joint?.pivot) p.joint.pivot = mv(p.joint.pivot);
  }
  if (s.seat) s.seat = mv(s.seat);
}

/* ------------------------------ validação / reparo ------------------------------ */
export interface ValidateOpts {
  /** nome/descrição de reserva (se os da IA forem barrados) */
  fallbackName?: string;
  /** aplica os limites da arena */
  arena?: boolean;
}

function validJoint(j: unknown): ObjJoint | undefined {
  if (!j || typeof j !== 'object') return undefined;
  const o = j as Record<string, unknown>;
  const type = pick(o.type, JOINTS, 'fixed');
  if (type === 'fixed') return undefined;
  const out: ObjJoint = {
    type,
    axis: pick(o.axis, AXES, type === 'wheel' ? 'x' : 'y'),
    speed: r3(clamp(fin(o.speed, type === 'hinge' ? 1 : type === 'spring' ? 1.5 : 1), -3, 3)),
    swing: r3(clamp(fin(o.swing, type === 'hinge' ? 30 : 0.2), 0, 90)),
  };
  if (Array.isArray(o.pivot)) out.pivot = vec(o.pivot, [0, 0, 0], -12, 12);
  return out;
}

/**
 * Valida e CONSERTA um objeto vindo de fora. Devolve null só se não sobrar nenhuma peça.
 * Nunca confia em nada: tudo é recriado campo a campo.
 */
export function validateSpec(raw: unknown, opts: ValidateOpts = {}): ObjSpec | null {
  if (typeof raw === 'string') {
    if (raw.length > SPEC_LIMITS.rawBytes) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const rawParts = Array.isArray(o.parts) ? o.parts.slice(0, SPEC_LIMITS.parts) : [];
  const parts: ObjPart[] = [];
  for (const rp of rawParts) {
    if (!rp || typeof rp !== 'object') continue;
    const q = rp as Record<string, unknown>;
    const p: ObjPart = {
      shape: pick(q.shape, SHAPES, 'box'),
      size: vec(q.size, [1, 1, 1], SPEC_LIMITS.minPart, SPEC_LIMITS.maxPart),
      pos: vec(q.pos, [0, 0.5, 0], -12, 12),
      rot: vec(q.rot, [0, 0, 0], -360, 360),
      color: snapColor(q.color),
      mat: pick(q.mat, OBJ_MATS, 'plastic'),
    };
    const j = validJoint(q.joint);
    if (j) p.joint = j;
    parts.push(p);
  }
  if (!parts.length) return null;
  // comportamentos (sem repetir tipo)
  const behaviors: ObjBehavior[] = [];
  for (const rb of Array.isArray(o.behaviors) ? o.behaviors.slice(0, 12) : []) {
    if (behaviors.length >= SPEC_LIMITS.behaviors) break;
    if (!rb || typeof rb !== 'object') continue;
    const q = rb as Record<string, unknown>;
    const type = String(q.type ?? '').toLowerCase() as BehType;
    if (!(type in BEHAVIORS) || behaviors.some((b) => b.type === type)) continue;
    const kinds = BEHAVIORS[type] as readonly string[];
    const b: ObjBehavior = { type, power: r3(clamp(fin(q.power, 0.5), 0, 1)) };
    if (kinds.length) b.kind = pick(q.kind, kinds, kinds[0]);
    behaviors.push(b);
  }
  const fbName = opts.fallbackName ? cleanText(opts.fallbackName, SPEC_LIMITS.name) : null;
  const name = cleanText(o.name, SPEC_LIMITS.name) ?? fbName ?? 'Criação';
  const desc = cleanText(o.desc, SPEC_LIMITS.desc) ?? '';
  const moving = behaviors.some((b) => MOVERS.includes(b.type));
  const body: ObjSpec['body'] = moving ? 'dynamic' : o.body === 'static' ? 'static' : o.body === 'dynamic' ? 'dynamic' : 'static';
  let role = pick(o.role, ROLES, 'utility');
  if (!ROLES.includes(o.role as Role)) role = deriveRole(behaviors);
  const s: ObjSpec = { v: 1, name, desc, role, body, parts, behaviors };
  if (behaviors.some((b) => b.type === 'ride')) s.seat = Array.isArray(o.seat) ? vec(o.seat, [0, 1, 0], -12, 12) : undefined;
  fitSpec(s, opts.arena ? SPEC_LIMITS.arenaExtent : SPEC_LIMITS.extent);
  if (opts.arena) for (const b of s.behaviors) b.power = Math.min(b.power, SPEC_LIMITS.arenaPower);
  if (s.behaviors.some((b) => b.type === 'ride') && !s.seat) {
    const bb = specBounds(s.parts);
    s.seat = [0, r3(bb.max[1]), 0];
  }
  return s;
}

/** encolhe para caber no tamanho/volume e apoia no chão */
export function fitSpec(s: ObjSpec, maxExtent: number): void {
  const ext = specExtent(s);
  if (ext > maxExtent) scaleSpec(s, maxExtent / ext);
  const vol = specVolume(s);
  const vmax = SPEC_LIMITS.volume * (maxExtent / SPEC_LIMITS.extent) ** 3;
  if (vol > vmax) scaleSpec(s, Math.cbrt(vmax / vol));
  settle(s);
}

export function deriveRole(beh: ObjBehavior[]): Role {
  const has = (t: BehType) => beh.some((b) => b.type === t);
  if (has('shoots') || has('pushes')) return 'attack';
  if (has('ride') || has('flies') || has('rolls') || has('jumps') || has('bounces')) return 'mobility';
  if (has('sticks') || has('grows')) return 'defense';
  return 'utility';
}

/* ------------------------------ compactação (rede / armazenamento) ------------------------------ */
/**
 * Forma compacta (array) para mandar no evento 'build' e guardar na galeria:
 *   [1, name, desc, roleIdx, body(0/1), parts[], behaviors[], seat?]
 *   part = [shapeIdx, sx,sy,sz, px,py,pz, rx,ry,rz, colorIdx, matIdx, (jointIdx, axisIdx, speed, swing, (pvx,pvy,pvz))]
 *   behavior = [typeIdx, power×100, kindIdx]
 * Números em centímetros/décimos de grau inteiros. Quem recebe sempre roda validateSpec() de novo.
 */
export type PackedSpec = unknown[];
const q = (v: number) => Math.round(v * 100);
export function packSpec(s: ObjSpec): PackedSpec {
  const parts = s.parts.map((p) => {
    const a: number[] = [SHAPES.indexOf(p.shape), ...p.size.map(q), ...p.pos.map(q), ...p.rot.map((r) => Math.round(r)), COLOR_NAMES.indexOf(p.color), OBJ_MATS.indexOf(p.mat)];
    if (p.joint) {
      a.push(JOINTS.indexOf(p.joint.type), AXES.indexOf(p.joint.axis), q(p.joint.speed), Math.round(p.joint.swing * 100));
      if (p.joint.pivot) a.push(...p.joint.pivot.map(q));
    }
    return a;
  });
  const beh = s.behaviors.map((b) => [BEH_TYPES.indexOf(b.type), Math.round(b.power * 100), b.kind ? (BEHAVIORS[b.type] as readonly string[]).indexOf(b.kind) : -1]);
  const out: PackedSpec = [1, s.name, s.desc, ROLES.indexOf(s.role), s.body === 'dynamic' ? 1 : 0, parts, beh];
  if (s.seat) out.push(s.seat.map(q));
  return out;
}
/** forma compacta → objeto (já validado). Lixo → null. */
export function unpackSpec(a: unknown, opts: ValidateOpts = {}): ObjSpec | null {
  if (!Array.isArray(a) || a[0] !== 1 || !Array.isArray(a[5])) return null;
  const n = (v: unknown) => fin(v) / 100;
  const parts = (a[5] as unknown[]).slice(0, SPEC_LIMITS.parts).map((pp) => {
    const p = Array.isArray(pp) ? pp : [];
    const part: Record<string, unknown> = {
      shape: SHAPES[fin(p[0]) | 0],
      size: [n(p[1]), n(p[2]), n(p[3])],
      pos: [n(p[4]), n(p[5]), n(p[6])],
      rot: [fin(p[7]), fin(p[8]), fin(p[9])],
      color: COLOR_NAMES[fin(p[10]) | 0],
      mat: OBJ_MATS[fin(p[11]) | 0],
    };
    if (p.length >= 16) {
      part.joint = { type: JOINTS[fin(p[12]) | 0], axis: AXES[fin(p[13]) | 0], speed: n(p[14]), swing: fin(p[15]) / 100 };
      if (p.length >= 19) (part.joint as Record<string, unknown>).pivot = [n(p[16]), n(p[17]), n(p[18])];
    }
    return part;
  });
  const behaviors = (Array.isArray(a[6]) ? (a[6] as unknown[]) : []).map((bb) => {
    const b = Array.isArray(bb) ? bb : [];
    const type = BEH_TYPES[fin(b[0], -1) | 0];
    const kinds = type ? (BEHAVIORS[type] as readonly string[]) : [];
    return { type, power: fin(b[1]) / 100, kind: kinds[fin(b[2], -1) | 0] };
  });
  const seat = Array.isArray(a[7]) ? (a[7] as unknown[]).map(n) : undefined;
  return validateSpec({ name: a[1], desc: a[2], role: ROLES[fin(a[3]) | 0], body: a[4] ? 'dynamic' : 'static', parts, behaviors, seat }, opts);
}

/* ------------------------------ custo / força ------------------------------ */
/** custo em "punhados" por tipo de material (o jogo traduz para os materiais do solo) */
export interface SpecCost {
  soft: number;
  stone: number;
  crystal: number;
  gold: number;
}
export function specCost(s: ObjSpec): SpecCost {
  const vol = specVolume(s);
  let soft = 6 + Math.sqrt(vol) * 9 + s.parts.length * 0.6;
  let stone = 0,
    crystal = 0,
    gold = 0;
  for (const p of s.parts) {
    const v = partVolume(p);
    if (p.mat === 'metal' || p.mat === 'stone') stone += 1 + v * 2.5;
    if (p.mat === 'glow' || p.mat === 'glass') crystal += 0.5 + v * 0.8;
    if (p.color === 'gold') gold += 0.4 + v * 0.6;
  }
  for (const b of s.behaviors) {
    if (b.type === 'shoots' || b.type === 'flies') soft += 6 + b.power * 8;
    if (b.type === 'pushes' || b.type === 'digs' || b.type === 'ride') soft += 4 + b.power * 5;
  }
  const c = (v: number, max: number) => Math.min(max, Math.ceil(v));
  return { soft: c(soft, 150), stone: c(stone, 40), crystal: c(crystal, 12), gold: c(gold, 8) };
}

/* ------------------------------ pedido seguro para crianças ------------------------------ */
/**
 * Troca pedidos violentos/de arma/adultos/marcas por versões bobas. Devolve o texto transformado.
 *  level: 'ok' (nada mudou) · 'soft' (trocou palavra: arma→espuma, marca→genérico) · 'block' (palavrão/sexual/
 *  ódio/dado pessoal: não chama a IA, gera algo neutro e registra para o admin).
 */
export interface SafeReq {
  text: string;
  level: 'ok' | 'soft' | 'block';
  hits: string[];
}
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
/** [raiz (regex sem acento), troca pt, troca en] — a ordem importa (frases longas antes) */
const SOFTEN: [RegExp, string, string][] = [
  [/\b(metralhadora|fuzil|rifle|ak ?47|escopeta|espingarda|shotgun|machine ?gun|bazuca|bazooka|lanca[ -]?missil|lanca[ -]?granada)s?\b/g, 'lançador de espuma gigante', 'giant foam blaster'],
  [/\b(arma|armas|revolver|pistola|gun|guns|pistol|sniper|trabuco|berro)\b/g, 'lançador de espuma', 'foam blaster'],
  [/\b(granada|grenade|bomba atomica|bomba nuclear|nuclear|atomica|dinamite|dynamite|explosivo|explosive|c4|tnt|bomb|bombs|bomba|bombas|missil|missile|missel)\b/g, 'bomba de confete', 'confetti popper'],
  [/\b(faca|facao|punhal|adaga|canivete|knife|knives|dagger|machete|navalha|bisturi|serra eletrica|motosserra|chainsaw)s?\b/g, 'colher gigante de brinquedo', 'giant toy spoon'],
  [/\b(espada|sword|katana|sabre|machado|axe|lanca|spear)s?\b/g, 'espada de espuma', 'foam sword'],
  [/\b(sangue|blood|sangrento|bloody|tripa|tripas|gore)\b/g, 'suco de morango', 'strawberry juice'],
  [/\b(veneno|poison|venenoso|toxico|toxic)\b/g, 'xarope de groselha', 'berry syrup'],
  [/\b(tanque de guerra|war tank|tanque militar|carro de guerra|blindado)\b/g, 'tanque de bolhas', 'bubble tank'],
  [/\b(caveira|skull|esqueleto assustador|zumbi sangrento)\b/g, 'abóbora sorridente', 'smiling pumpkin'],
  [/\b(matar|mata|mate|kill|killer|assassino|assassina|morte|morrer|death|dead|murder|atirar em|shoot at)\b/g, 'fazer cócegas', 'tickle'],
  [/\b(cigarro|cigar|cigarette|vape|cerveja|beer|vodka|whisky|cachaca|vinho|wine|droga|drogas|drug|drugs|maconha|weed)\b/g, 'pirulito', 'lollipop'],
  [/\b(fogo|fire|chamas|flames|lanca[ -]?chamas|flamethrower|incendio)\b/g, 'faíscas de confete', 'confetti sparks'],
  [/\b(prisao|cadeia|jail|prison|algema|algemas|handcuffs)\b/g, 'casinha de brinquedo', 'toy house'],
];
/** marcas e personagens → visual genérico parecido, nome genérico */
const BRANDS: [RegExp, string, string][] = [
  [/\b(pikachu|pokemon)\b/g, 'ratinho elétrico amarelo', 'yellow electric mouse'],
  [/\b(super ?mario|mario|luigi)\b/g, 'encanador de boné', 'plumber with a cap'],
  [/\b(sonic)\b/g, 'ouriço azul veloz', 'fast blue hedgehog'],
  [/\b(minecraft|creeper)\b/g, 'bloco quadradão', 'blocky cube'],
  [/\b(roblox|fortnite|among ?us)\b/g, 'bonequinho de jogo', 'game figure'],
  [/\b(batman|batmovel|batmobile)\b/g, 'herói morcego', 'bat hero'],
  [/\b(homem[ -]?aranha|spider[ -]?man)\b/g, 'herói aranha', 'spider hero'],
  [/\b(superman|super[ -]?homem)\b/g, 'super-herói de capa', 'caped hero'],
  [/\b(hulk)\b/g, 'gigante verde forte', 'strong green giant'],
  [/\b(elsa|frozen|olaf)\b/g, 'boneco de neve', 'snowman'],
  [/\b(barbie|ken)\b/g, 'boneca fashion', 'fashion doll'],
  [/\b(lego)\b/g, 'blocos de montar', 'building bricks'],
  [/\b(hello ?kitty)\b/g, 'gatinha fofa', 'cute kitty'],
  [/\b(peppa|george pig)\b/g, 'porquinha rosa', 'pink piglet'],
  [/\b(bob esponja|spongebob)\b/g, 'esponja amarela', 'yellow sponge'],
  [/\b(mickey|minnie)\b/g, 'ratinho de luvas', 'mouse with gloves'],
  [/\b(stitch)\b/g, 'bichinho azul', 'blue critter'],
  [/\b(godzilla)\b/g, 'lagartão gigante', 'giant lizard'],
  [/\b(ferrari|lamborghini|porsche|bugatti|mclaren)\b/g, 'carro esportivo', 'sports car'],
  [/\b(tesla|bmw|audi|mercedes|toyota|honda|fiat|volkswagen|chevrolet|ford)\b/g, 'carro', 'car'],
  [/\b(coca[ -]?cola|pepsi|guarana|fanta|sprite)\b/g, 'refrigerante', 'soda'],
  [/\b(mcdonalds?|burger king|bk)\b/g, 'lanchonete', 'burger stand'],
  [/\b(nike|adidas|puma)\b/g, 'tênis', 'sneaker'],
  [/\b(iphone|samsung|playstation|xbox|nintendo|switch)\b/g, 'videogame', 'game console'],
  [/\b(titanic)\b/g, 'navio grandão', 'big ship'],
  [/\b(thomas)\b/g, 'trenzinho', 'little train'],
];
/** palavras de ódio/adultas que não têm versão boba (vão para 'block') */
const HARD_BLOCK = /\b(nazi|nazista|hitler|suastica|swastika|kkk|terroris|estupr|rape|porn|sex|nude|nud|pelad|bunda|peito|seio|boob|penis|vagina|suicid|se matar|kill (my|your)self)\w*/;

export function kidSafeRequest(input: string, lang = 'pt'): SafeReq {
  const raw = String(input ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const hits: string[] = [];
  const sc = scanText(raw);
  let low = fold(raw);
  if (sc.level === 'bad' || sc.level === 'pii' || HARD_BLOCK.test(low)) {
    return { text: lang === 'pt' ? 'um patinho de borracha gigante' : 'a giant rubber duck', level: 'block', hits: sc.hits.length ? sc.hits : [HARD_BLOCK.exec(low)?.[0] ?? '?'] };
  }
  const en = lang === 'en';
  for (const [re, pt, e] of [...SOFTEN, ...BRANDS]) {
    low = low.replace(re, (m) => {
      hits.push(m);
      return en ? e : pt;
    });
  }
  if (sc.level === 'mild') hits.push(...sc.hits);
  return { text: hits.length ? low : raw, level: hits.length ? 'soft' : 'ok', hits };
}

/** chave de cache: texto normalizado (sem acento, sem artigos, palavras únicas em ordem) */
export function cacheKey(text: string, lang: string): string {
  const stop = new Set(['um', 'uma', 'o', 'a', 'os', 'as', 'de', 'do', 'da', 'com', 'que', 'e', 'eu', 'quero', 'faz', 'faca', 'cria', 'crie', 'a', 'an', 'the', 'with', 'of', 'and', 'i', 'want', 'make', 'me', 'el', 'la', 'un', 'una', 'con']);
  const toks = fold(text)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !stop.has(w));
  return lang + ':' + toks.join(' ').slice(0, 100);
}

/* ------------------------------ esquema JSON (para a IA) ------------------------------ */
export function specJsonSchema(): Record<string, unknown> {
  const e = (list: readonly string[]) => ({ type: 'string', enum: [...list] });
  const v3 = { type: 'array', items: { type: 'number' } };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['safe', 'name', 'desc', 'role', 'body', 'parts', 'behaviors'],
    properties: {
      safe: { type: 'boolean' },
      name: { type: 'string' },
      desc: { type: 'string' },
      role: e(ROLES),
      body: e(['static', 'dynamic']),
      seat: v3,
      parts: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['shape', 'size', 'pos', 'rot', 'color', 'mat'],
          properties: {
            shape: e(SHAPES),
            size: v3,
            pos: v3,
            rot: v3,
            color: e(COLOR_NAMES),
            mat: e(OBJ_MATS),
            joint: {
              type: 'object',
              additionalProperties: false,
              required: ['type', 'axis', 'speed', 'swing'],
              properties: { type: e(JOINTS), axis: e(AXES), speed: { type: 'number' }, swing: { type: 'number' }, pivot: v3 },
            },
          },
        },
      },
      behaviors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'power'],
          properties: { type: e(BEH_TYPES), power: { type: 'number' }, kind: e([...new Set(Object.values(BEHAVIORS).flat())]) },
        },
      },
    },
  };
}
