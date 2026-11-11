/* ============================================================
 *  POUSO FORÇADO — simulação (sem three.js): voo arcade, emergências,
 *  tripulação (você + Bloops ajudantes comandados), passageiros,
 *  objetos soltos com física simples e o pouso. Mesma sim no 2D e 3D.
 * ============================================================ */
import { t } from '../../i18n';
import {
  BOXES, CEIL, HALF_W, ITEM_HOMES, NOSE_Z, P_RAD, REACH, SEATS, SPOTS, TAIL_Z, WIN_Z, emerName, itemName, roleName,
  type EmerKind, type ItemKind, type Role, type SpotId,
} from './data';

export function mulberry(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const TAU_S = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const wrapA = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

/* ------------------------------ tipos ------------------------------ */

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  held: number;
  rot: number;
  spin: number;
  /** carga (extintor 0..1) */
  charge: number;
  alive: boolean;
}
export type CmdKind = 'fix' | 'pilot' | 'follow' | 'calm' | 'stay';
export interface Cmd {
  kind: CmdKind;
  emer?: number;
  /** quem mandou ("me seguir" segue essa pessoa) */
  by?: number;
}
export interface Stats {
  fires: number;
  fixes: number;
  calmed: number;
  pilotSec: number;
  patched: number;
  falls: number;
  /** malas guardadas de volta no bagageiro */
  stowed?: number;
  /** lanches entregues certos */
  served?: number;
}
export interface Player {
  idx: number;
  name: string;
  skin: string;
  role: Role;
  bot: boolean;
  remote: boolean;
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  hold: number;
  seated: boolean;
  stun: number;
  /** emergência em minijogo (id) ou -1 */
  busy: number;
  actKind: string;
  actTarget: number;
  actProg: number;
  /** pulverizando agora (efeito visual) */
  spraying: boolean;
  /** montando bandeja na copa (não anda) */
  prep?: boolean;
  walk: number;
  /** posição no passo anterior (interpolação da vista) */
  ox?: number;
  oz?: number;
  cmd: Cmd | null;
  react: number;
  sayT: number;
  say: string;
  stuck: number;
  stats: Stats;
}
export interface Pax {
  seat: number;
  sx: number;
  sz: number;
  x: number;
  z: number;
  panic: number;
  calmT: number;
  standing: boolean;
  skin: number;
  bob: number;
  happyT: number;
  doorT: number;
  /** 0 sentado · 1 em pé no espaço da própria fileira (pânico) · 2 andando no corredor · 3 esperando no banheiro */
  mode: number;
  /** andando: 0 indo, 1 voltando */
  leg: number;
  wT: number;
  hiT: number;
  yaw: number;
  /** pedido de comida em aberto (id) ou -1 */
  want: number;
}
/** pedido do serviço de bordo: comida (0 nada, 1 sanduíche, 2 macarrão quente) + bebida (0 nada, 1 água, 2 suco, 3 leite) */
export interface Order {
  id: number;
  pax: number;
  main: number;
  drink: number;
  /** segundos restantes */
  t: number;
  tmax: number;
  /** bandeja pronta para este pedido (id) ou -1 */
  tray: number;
  /** ajudante cuidando dele (índice) ou -1 */
  bot: number;
}
export interface Tray {
  id: number;
  order: number;
  main: number;
  drink: number;
  hot: number;
  full: number;
}
export const MAINS = ['', 'sand', 'pasta'] as const;
export const DRINKS = ['', 'water', 'juice', 'milk'] as const;
/** poltrona → rótulo (fileira + letra), igual ao que aparece no balão e na bandeja */
export function seatLabel(i: number): string {
  if (i < 4) return `${1 + (i >> 1)}${i % 2 ? 'D' : 'A'}`;
  const k = i - 4;
  return `${3 + (k >> 2)}${'ABCD'[k % 4]}`;
}
/** ponto onde o passageiro em pé fica (o espaço das pernas da própria fileira, fora do corredor) */
function legroom(q: Pax): [number, number] {
  return [q.sx * (q.sz < 3 ? 0.9 : 0.95), q.sz - (q.sz < 3 ? 0.55 : 0.4)];
}
/** "banheiro" (fundo da cabine, fora do corredor) */
const LAV: [number, number] = [1.0, 15.95];
const GALLEY: [number, number] = [0.55, 4.9];
export const CART_HOME: [number, number] = [0, 5.35];
export interface Emer {
  id: number;
  kind: EmerKind;
  spot: SpotId;
  x: number;
  y: number;
  z: number;
  /** perigo crescente 0..1 (fogo: intensidade) */
  sev: number;
  prog: number;
  stage: number;
  age: number;
  done: boolean;
  /** turbulência: duração */
  dur: number;
  hot: number;
  win: number;
}
export interface Flight {
  x: number;
  z: number;
  alt: number;
  hdg: number;
  spd: number;
  pitch: number;
  roll: number;
  gamma: number;
  vs: number;
  thr: number;
  flaps: number;
  gear: number;
  gearPos: number;
  fuel: number;
  eng: [number, number];
  stall: boolean;
  wind: number;
  /** guia: rumo relativo (rad), altitude-alvo, distância à pista (m) */
  brg: number;
  talt: number;
  dist: number;
  loc: boolean;
  /** desvio lateral do eixo (m, só no modo LOC) */
  dev: number;
  /* ---- modelo de voo (FM) ---- */
  /** ângulo de ataque (rad) */
  alpha: number;
  /** velocidade de rolagem / arfagem (rad/s) */
  p: number;
  q: number;
  /** flapes de verdade (0..2, andam devagar até o estágio da alavanca) */
  flapPos: number;
  /** spoilers (0..1): abrem no toque */
  spoiler: number;
  /** fator de carga sentido (g) */
  gload: number;
  /** vibração de pré-estol (0..1) */
  buffet: number;
  /** piloto automático ligado (0/1) */
  ap: number;
  /** aviso de cintos (turbulência chegando) */
  belt: number;
  /** comandos efetivos nas superfícies (-1..1): aileron, profundor, leme */
  ail: number;
  elev: number;
  rud: number;
}
export type Phase = 'cruise' | 'descent' | 'final' | 'rollout' | 'crash' | 'done';
export type OutKind = 'perfect' | 'good' | 'rough' | 'crash';
export interface Outcome {
  kind: OutKind;
  reason: string;
  vs: number;
  spd: number;
  off: number;
  stars: number;
  score: number;
}
export type Ev =
  | { k: 'toast'; msg: string; ico: string; tone: 'bad' | 'good' | 'info'; emer?: number }
  | { k: 'sfx'; s: string }
  | { k: 'jolt'; amt: number }
  | { k: 'bags'; ids: number[] }
  | { k: 'fx'; t: 'fireOut' | 'spark' | 'glass' | 'patch' | 'calm' | 'pump' | 'fixed' | 'stun'; x: number; z: number; y?: number }
  | { k: 'touch'; out: Outcome }
  | { k: 'say'; who: number; msg: string }
  /** online: o anfitrião abriu um minijogo para o jogador `who` (convidado) */
  | { k: 'mini'; who: number; kind: MiniKind; emer: number }
  /** online: o anfitrião abriu a copa para o jogador `who` */
  | { k: 'prep'; who: number };

export interface Ctx {
  kind: '' | 'sit' | 'spray' | 'patch' | 'rewire' | 'pump' | 'valve' | 'crank' | 'door' | 'give' | 'hug' | 'take' | 'pick' | 'stow' | 'prep' | 'cart' | 'serve';
  label: string;
  hold: boolean;
  target: number;
  x: number;
  z: number;
  y: number;
}
export type MiniKind = 'rewire' | 'pump' | 'valve' | 'crank';
/** online: entrada de um convidado (posição é dele; ações a sim do anfitrião decide) */
export interface RemoteIn {
  x: number;
  z: number;
  yaw: number;
  fx: number;
  fz: number;
  act: boolean;
  tap: boolean;
  sx: number;
  sy: number;
  thr: number;
}
/** ação discreta enviada pelo convidado ao anfitrião */
export type NetAct =
  | ['flaps', number]
  | ['gear', number]
  | ['cmd', number, string, number]
  | ['mini', number, number]
  | ['miniClose']
  | ['throw', number]
  | ['stand']
  | ['ap', number]
  | ['tray', number, number, number, number, number]
  | ['prepClose'];

export interface SimOpts {
  seed: number;
  mode: 'normal' | 'daily' | 'training';
  crew: { name: string; skin: string; bot: boolean; local: boolean }[];
  maxBags: number;
}

/* runway: cabeceira em (0,0), pista para o norte (-z) */
export const RWY_LEN = 2600;
export const RWY_HALF = 23;
export const GS = 0.0524; // 3°
const FIX_Z = 17000;
const START_D = 42000;

/* ============================== modelo de voo ==============================
 * Passo fixo (1/60 s, ver game.ts) e determinístico — nada de ruído por quadro.
 *  - sustentação L = KL·v²·CL(α, flapes): cai com v², estola acima de α_estol
 *  - arrasto D = KL·v²·(CD0 + flapes + trem + spoilers + K·CL²) (induzido, menor no efeito solo)
 *  - tração T = TMAX·manete·motores; gravidade; amortecimento de arfagem/rolagem
 *  - estabilidade estática de arfagem: sem mão no manche o nariz volta ao α de compensação
 *    (velocidade de compensação depende dos flapes); a rolagem é neutra (não se nivela sozinho)
 *  - a vista desenha interpolado entre dois passos (Sim.pose)
 */
export const FM = {
  G: 9.8,
  /** estol limpo a 1 g (m/s) */
  VS0: 62,
  CLMAX: [1.4, 1.75, 2.1],
  CL0: [0.25, 0.45, 0.6],
  CLA: 5.0,
  CD0: 0.035,
  CDF: 0.018,
  CDG: 0.02,
  CDSP: 0.09,
  K: 0.045,
  TMAX: 1.8,
  VREF: 110,
  /** velocidade de compensação por estágio de flape */
  VTRIM: [125, 95, 78],
  SPAN: 33,
};
const KL = FM.G / (FM.VS0 * FM.VS0 * FM.CLMAX[0]);
const lerp3 = (a: number[], k: number) => (k <= 1 ? a[0] + (a[1] - a[0]) * k : a[1] + (a[2] - a[1]) * Math.min(1, k - 1));
/** α de estol para a posição de flape */
export function alphaStall(flapPos: number): number {
  return (lerp3(FM.CLMAX, flapPos) - lerp3(FM.CL0, flapPos)) / FM.CLA;
}
/** α de compensação (1 g na velocidade de compensação dos flapes) */
export function alphaTrim(flapPos: number): number {
  const vt = lerp3(FM.VTRIM, flapPos);
  return (FM.CLMAX[0] * (FM.VS0 / vt) ** 2 - lerp3(FM.CL0, flapPos)) / FM.CLA;
}
/** velocidade de estol (1 g) para a posição de flape */
export function stallSpeed(flapPos: number): number {
  return FM.VS0 * Math.sqrt(FM.CLMAX[0] / lerp3(FM.CLMAX, flapPos));
}
/** coeficiente de sustentação (com a queda depois do estol) */
export function liftCoef(alpha: number, flapPos: number): number {
  const cl0 = lerp3(FM.CL0, flapPos);
  const clmax = lerp3(FM.CLMAX, flapPos);
  const aS = (clmax - cl0) / FM.CLA;
  if (alpha <= aS) return Math.max(-0.9, cl0 + FM.CLA * alpha);
  return Math.max(clmax * 0.45, clmax - 2.6 * (alpha - aS));
}

/** manete que mantém o voo nivelado na velocidade atual (para começar compensado) */
export function trimThrottle(f: Flight): number {
  const v = f.spd;
  const cl = FM.CLMAX[0] * (FM.VS0 / Math.max(30, v)) ** 2;
  const cd = FM.CD0 + FM.CDF * f.flapPos + FM.CDG * f.gearPos + FM.K * cl * cl;
  return clamp((KL * v * v * cd) / FM.TMAX, 0, 1);
}

/**
 * Um passo do modelo de voo (no ar). sx: manche lateral (-1..1, + = direita), sy: manche
 * longitudinal (+ = empurrar = nariz para baixo), gw: rajada vertical (m/s), gr: rajada de
 * rolagem (rad/s²), power: 0..1 (motores × combustível).
 */
export function flightStep(f: Flight, dt: number, sx: number, sy: number, gw: number, gr: number, power: number): void {
  const G = FM.G;
  // flapes andam devagar até o estágio pedido (~4 s por estágio)
  f.flapPos += clamp(f.flaps - f.flapPos, -dt * 0.25, dt * 0.25);
  f.spoiler = Math.max(0, f.spoiler - dt * 2);
  const v = Math.max(0, f.spd);
  const vv = Math.max(6, v);
  const qn = (v / FM.VREF) ** 2;
  const fp = f.flapPos;
  const aS = alphaStall(fp);
  const aT = alphaTrim(fp);
  // α efetivo com a rajada vertical
  const alpha = f.pitch - f.gamma + gw / vv;
  f.alpha = alpha;
  // efeito solo (abaixo de uma envergadura): menos arrasto induzido, um pouco mais de sustentação
  const h = Math.max(0, f.alt);
  let ge = 1;
  let gl = 1;
  if (h < FM.SPAN) {
    const r = (16 * h) / FM.SPAN;
    ge = 0.45 + 0.55 * ((r * r) / (1 + r * r));
    gl = 1 + 0.12 * (1 - h / FM.SPAN);
  }
  const cl = liftCoef(alpha, fp) * gl;
  const aL = KL * v * v * cl;
  const cd = FM.CD0 + FM.CDF * fp + FM.CDG * f.gearPos + FM.CDSP * f.spoiler + FM.K * ge * cl * cl;
  let aD = KL * v * v * cd;
  if (v > 175) aD += 0.02 * (v - 175) ** 2;
  const thrust = FM.TMAX * f.thr * power;
  // ---- arfagem: profundor (autoridade ∝ v²) + estabilidade (volta ao α de compensação) + amortecimento ----
  const elev = clamp(-sy, -1, 1);
  const qs = Math.max(qn, 0.12); // cata-vento: mesmo devagar o nariz acompanha a trajetória
  const stalled = alpha > aS;
  let qd = qn * 0.75 * elev - qs * 4.2 * (alpha - aT) - 3.4 * f.q;
  if (stalled) qd -= Math.max(qn, 0.35) * 3.0 * (alpha - aS + 0.03); // estol: o nariz cai
  f.q += qd * dt;
  f.pitch = clamp(f.pitch + f.q * dt, -1.25, 1.2);
  // ---- rolagem: aileron (autoridade ∝ v), neutra (sem autonivelamento), amortecida ----
  const auth = clamp(v / FM.VREF, 0.1, 1.15);
  let pd = 4 * (clamp(sx, -1, 1) * 0.85 * auth - f.p) + gr;
  if (Math.abs(f.roll) > 1.0) pd -= 7 * (Math.abs(f.roll) - 1.0) * Math.sign(f.roll); // limite de inclinação
  if (stalled) pd += (f.roll >= 0 ? 1 : -1) * Math.min(1.2, (alpha - aS) * 8); // asa cai no estol
  f.p += pd * dt;
  f.roll = clamp(f.roll + f.p * dt, -1.25, 1.25);
  // ---- trajetória ----
  const gd = (aL * Math.cos(f.roll) + thrust * Math.sin(alpha) - G * Math.cos(f.gamma)) / vv;
  f.gamma = clamp(f.gamma + gd * dt, -1.45, 1.2);
  f.spd = clamp(v + (thrust * Math.cos(alpha) - aD - G * Math.sin(f.gamma)) * dt, 0, 210);
  f.hdg = wrapA(f.hdg + ((aL * Math.sin(f.roll)) / (vv * Math.max(0.2, Math.cos(f.gamma)))) * dt);
  f.vs = f.spd * Math.sin(f.gamma);
  f.alt += f.vs * dt;
  f.gload = aL / G;
  f.stall = stalled;
  f.buffet = clamp((alpha - (aS - 0.035)) / 0.06, 0, 1) * clamp(v / 30, 0, 1);
  // superfícies (para a animação): o que o piloto pede + o que a física pede
  f.ail = clamp(sx, -1, 1);
  f.elev = elev;
  f.rud = clamp(f.p * 0.25 - f.roll * 0.15, -0.5, 0.5); // coordenação de curva
}

const FIRE_SPOTS: SpotId[] = ['oven', 'engL', 'engR', 'cabinA', 'cabinB', 'cargoFire'];
const HOLD_DUR: Record<string, number> = { patch: 2.2, door: 2.6, hug: 1.2 };
const MINI_RATE: Record<MiniKind, number> = { rewire: 1 / 9, pump: 1 / 11, valve: 1 / 8, crank: 1 / 14 };
const BOT_SPEED = 2.5;
const HUMAN_SPEED = 3.3;

export class Sim {
  rnd: () => number;
  opts: SimOpts;
  time = 0;
  phase: Phase = 'cruise';
  f: Flight;
  ctrl = { sx: 0, sy: 0, thr: 0.65 };
  players: Player[] = [];
  items: Item[] = [];
  pax: Pax[] = [];
  emers: Emer[] = [];
  ev: Ev[] = [];
  hull = 100;
  outcome: Outcome | null = null;
  /** 0..1: turbulência atual */
  turb = 0;
  /** aceleração "sentida" na cabine (m/s²) — para câmera/objetos */
  acc = { x: 0, y: 0, z: 0 };
  dizzy = 0;
  wind = 0;
  flicker = false;
  gearStuck = false;
  doorOpen: SpotId | '' = '';
  winBroken = -1;
  fixedCount = 0;
  panicAvg = 0;
  panicInt = 0;
  panicSamples = 0;
  endT = 0;
  me = 0;
  /** rajada vertical atual (m/s) — para a câmera e o HUD */
  gust = 0;
  private gustPh = [0, 0, 0, 0, 0];
  /** aviso de turbulência: contagem até ela começar (s) */
  turbWarn = 0;
  /** pose do avião no passo anterior (a vista interpola entre os dois) */
  pf = { x: 0, z: 0, alt: 0, hdg: 0, pitch: 0, roll: 0 };
  /** 0..1 entre o passo anterior e o atual (game.ts) */
  lerpK = 1;
  private poseOut = { x: 0, z: 0, alt: 0, hdg: 0, pitch: 0, roll: 0 };
  private nextEmerT = 14;
  private eid = 1;
  private iid = 1;
  private joltT = 0;
  private alarmT = 0;
  private noPilotT = 0;
  private warnT: Record<string, number> = {};
  private gearPlanned = false;
  private leakCount = 0;
  /** pontos extras (malas guardadas) */
  bonus = 0;
  private bonked = new Set<number>();

  constructor(opts: SimOpts) {
    this.opts = opts;
    this.rnd = mulberry(opts.seed);
    const r = this.rnd;
    const side = r() < 0.5 ? -1 : 1;
    const train = opts.mode === 'training';
    const sx = train ? side * (300 + r() * 500) : side * (3500 + r() * 5000);
    const sz = train ? 9000 : START_D;
    this.wind = (r() * 2 - 1) * (train ? 3 : 6);
    const toFix = Math.atan2(0 - sx, -((train ? -500 : FIX_Z) - sz));
    const alt = train ? 9000 * GS + 60 : 2400;
    this.f = {
      x: sx, z: sz, alt, hdg: toFix + (r() * 2 - 1) * (train ? 0.08 : 0.35), spd: train ? 80 : 125, pitch: 0.035, roll: 0, gamma: 0,
      vs: 0, thr: train ? 0.45 : 0.65, flaps: train ? 1 : 0, gear: 0, gearPos: 0, fuel: train ? 40 : 62, eng: [1, 1], stall: false, wind: this.wind,
      brg: 0, talt: alt, dist: Math.hypot(sx, sz), loc: false, dev: 0,
      alpha: 0, p: 0, q: 0, flapPos: train ? 1 : 0, spoiler: 0, gload: 1, buffet: 0, ap: 0, belt: 0, ail: 0, elev: 0, rud: 0,
    };
    // começa compensado: α de compensação e voo nivelado
    this.f.alpha = alphaTrim(this.f.flapPos);
    this.f.pitch = this.f.alpha;
    this.f.spd = train ? 82 : FM.VTRIM[0];
    this.savePose();
    const gr = mulberry(opts.seed ^ 0x5eed);
    for (let i = 0; i < 5; i++) this.gustPh[i] = gr() * TAU_S;
    this.f.thr = this.ctrl.thr = trimThrottle(this.f);
    if (train) this.phase = 'final';
    opts.crew.slice(0, 4).forEach((c, i) => this.addPlayer(c.name, c.skin, i as Role, c.bot, !c.local && !c.bot));
    this.me = Math.max(0, opts.crew.findIndex((c) => c.local));
    // itens fixos
    for (const h of ITEM_HOMES) this.spawnItem(h.kind, h.x, h.y, h.z);
    // passageiros: ~70% dos assentos
    SEATS.forEach(([x, z], i) => {
      if (r() < 0.3) return;
      this.pax.push({ seat: i, sx: x, sz: z, x, z, panic: r() * 0.15, calmT: 0, standing: false, skin: Math.floor(r() * 8), bob: r() * 6, happyT: 0, doorT: 0, mode: 0, leg: 0, wT: 0, hiT: 0, yaw: Math.PI, want: -1 });
    });
  }

  addPlayer(name: string, skin: string, role: Role, bot: boolean, remote = false): Player {
    const spawn: [number, number][] = [
      [0, -1.9],
      [0.1, 0.9],
      [0, 4.9],
      [0, 15.4],
    ];
    const [x, z] = spawn[role] ?? [0, 3];
    const p: Player = {
      idx: this.players.length, name, skin, role, bot, remote, x, z, vx: 0, vz: 0, yaw: Math.PI, hold: -1, seated: false, stun: 0, busy: -1,
      actKind: '', actTarget: -1, actProg: 0, spraying: false, walk: 0, cmd: null, react: 0, sayT: 0, say: '', stuck: 0,
      stats: { fires: 0, fixes: 0, calmed: 0, pilotSec: 0, patched: 0, falls: 0 },
    };
    this.players.push(p);
    return p;
  }

  get pilot(): Player | null {
    return this.players.find((p) => p.seated) ?? null;
  }
  get flying(): boolean {
    return this.phase === 'cruise' || this.phase === 'descent' || this.phase === 'final';
  }
  /** progresso do voo 0..1 (para escalar a dificuldade) */
  get progress(): number {
    return clamp(1 - (this.f.dist - 3000) / (START_D - 3000), 0, 1);
  }

  spawnItem(kind: ItemKind, x: number, y: number, z: number): Item {
    const it: Item = { id: this.iid++, kind, x, y, z, vx: 0, vy: 0, vz: 0, held: -1, rot: 0, spin: 0, charge: 1, alive: true };
    this.items.push(it);
    return it;
  }
  item(id: number): Item | undefined {
    return id < 0 ? undefined : this.items.find((i) => i.id === id && i.alive);
  }
  emer(id: number): Emer | undefined {
    return this.emers.find((e) => e.id === id && !e.done);
  }
  active(): Emer[] {
    return this.emers.filter((e) => !e.done);
  }
  private toast(msg: string, ico: string, tone: 'bad' | 'good' | 'info', emer?: number): void {
    this.ev.push({ k: 'toast', msg, ico, tone, emer });
  }
  private sfx(s: string): void {
    this.ev.push({ k: 'sfx', s });
  }
  private warn(key: string, every: number, fn: () => void): void {
    if ((this.warnT[key] ?? -99) + every > this.time) return;
    this.warnT[key] = this.time;
    fn();
  }

  /* ============================== passo ============================== */

  step(dt: number): void {
    if (dt <= 0) return;
    this.savePose();
    this.time += dt;
    // convidado no manche: o manche dele comanda o avião
    const pl = this.pilot;
    if (pl?.remote) {
      const ri = this.rin.get(pl.idx);
      if (ri) {
        this.ctrl.sx = ri.sx;
        this.ctrl.sy = ri.sy;
        this.ctrl.thr = ri.thr;
      }
    }
    if (this.flying || this.phase === 'rollout') this.stepFlight(dt);
    if (this.phase === 'crash' || this.phase === 'rollout') {
      this.endT += dt;
      if (this.endT > (this.phase === 'crash' ? 5 : 6)) this.phase = 'done';
    }
    if (this.flying) {
      this.schedule(dt);
      this.stepEmers(dt);
      this.stepPax(dt);
    }
    this.stepCabinForces(dt);
    for (const p of this.players) {
      if (p.bot) this.botThink(p, dt);
      this.stepPlayer(p, dt);
    }
    this.stepItems(dt);
    // estatística de pânico
    let s = 0;
    for (const p of this.pax) s += p.panic;
    this.panicAvg = this.pax.length ? s / this.pax.length : 0;
    if (this.flying) {
      this.panicInt += this.panicAvg * dt;
      this.panicSamples += dt;
    }
  }

  /* ------------------------------ voo ------------------------------ */

  private stepFlight(dt: number): void {
    const f = this.f;
    const pilot = this.pilot;
    let sx = 0;
    let sy = 0;
    if (this.phase === 'rollout') {
      f.spoiler = Math.min(1, f.spoiler + dt * 3);
      f.roll *= Math.exp(-3 * dt);
      f.p = 0;
      f.q = 0;
      f.pitch += (0 - f.pitch) * Math.min(1, dt * 2);
      f.spd = Math.max(0, f.spd - 4.2 * dt);
      f.alt = 0;
      f.vs = 0;
      f.gamma = 0;
      f.thr += (0 - f.thr) * Math.min(1, dt * 2);
      f.x += Math.sin(f.hdg) * f.spd * dt;
      f.z -= Math.cos(f.hdg) * f.spd * dt;
      f.hdg += (0 - f.hdg) * Math.min(1, dt * 0.8);
      f.rud = clamp(-f.hdg * 4, -1, 1);
      f.ail = f.elev = 0;
      return;
    }
    const human = !!pilot && !pilot.bot;
    if (human) {
      sx = this.ctrl.sx;
      sy = this.ctrl.sy;
      // piloto automático: só quando ligado (botão AP); mexer no manche desliga
      if (f.ap) {
        if (Math.abs(sx) > 0.3 || Math.abs(sy) > 0.3) this.setAP(false, 'stick');
        else if (this.phase === 'final' && f.alt < 300) this.setAP(false, 'low');
        else {
          const c = this.autoFly(dt, false);
          sx = c.sx;
          sy = c.sy;
        }
      }
      if (!f.ap) f.thr += (this.ctrl.thr - f.thr) * Math.min(1, dt * 1.2); // motor demora ~1 s para responder
    } else if (pilot) {
      const c = this.autoFly(dt, true);
      sx = c.sx;
      sy = c.sy;
    } else if (f.ap) this.setAP(false, '');
    if (pilot) {
      pilot.stats.pilotSec += dt;
      this.noPilotT = 0;
    } else {
      this.noPilotT += dt;
      if (this.noPilotT > 7) this.warn('nopilot', 14, () => this.toast(t('voo.t.nopilot', 'Ninguém no manche! O avião está à deriva'), 'yoke', 'bad'));
    }
    let gustRoll = 0;
    if (!pilot && this.noPilotT > 5) gustRoll += Math.sin(this.time * 0.13 + this.opts.seed) * 0.012; // deriva lenta sem ninguém
    if (this.dizzy > 0.5 && human) gustRoll += Math.sin(this.time * 1.7) * 0.05;
    // ---- turbulência (só durante o evento): rajadas suaves e determinísticas, nada de ruído por quadro ----
    const tb = this.turb;
    const T = this.time;
    const ph = this.gustPh;
    const gw = tb * 7 * (0.55 * Math.sin(1.31 * T + ph[0]) + 0.3 * Math.sin(2.87 * T + ph[1]) + 0.35 * Math.sin(0.61 * T + ph[2]));
    gustRoll += tb * 0.35 * (Math.sin(1.07 * T + ph[3]) + 0.6 * Math.sin(2.33 * T + ph[4]));
    this.gust = gw;
    flightStep(f, dt, sx, sy, gw, gustRoll, f.fuel > 0 ? (f.eng[0] + f.eng[1]) / 2 : 0);
    // ---- trem / combustível ----
    const gearTarget = this.gearStuck ? 0 : f.gear;
    f.gearPos += clamp(gearTarget - f.gearPos, -dt * 0.4, dt * 0.4);
    f.fuel = Math.max(0, f.fuel - dt * 0.042 * (0.3 + f.thr));
    if (f.fuel <= 0) this.warn('fuel0', 15, () => this.toast(t('voo.t.fuel0', 'Sem combustível! Planando...'), 'fuel', 'bad'));
    else if (f.fuel < 12) this.warn('fuellow', 25, () => this.toast(t('voo.t.fuellow', 'Combustível baixo!'), 'fuel', 'bad'));
    // ---- guia ----
    this.guide();
    // ---- fases ----
    if (this.phase === 'cruise' && f.dist < 34000) {
      this.phase = 'descent';
      this.toast(t('voo.t.descend', 'Hora de descer: siga a altitude-alvo'), 'down', 'info');
      if (!this.gearPlanned && this.opts.mode !== 'training') {
        this.gearPlanned = true;
        if (this.rnd() < (this.opts.mode === 'daily' ? 0.85 : 0.7)) this.nextGear = this.time + 20 + this.rnd() * 30;
      }
    }
    if (this.phase === 'descent' && f.loc) {
      this.phase = 'final';
      this.toast(t('voo.t.final', 'Aproximação final! Flapes, trem e devagar'), 'runway', 'info');
    }
    if (this.nextGear && this.time > this.nextGear) {
      this.nextGear = 0;
      this.gearStuck = true;
      this.startEmer('gear', 'gear');
    }
    // ---- avisos ----
    if (this.flying) {
      if (f.stall) this.warn('stall', 4, () => (this.toast(t('voo.t.stall', 'ESTOL! Abaixe o nariz e acelere'), 'warn', 'bad'), this.sfx('alarm')));
      if (f.alt < 450 && f.gear < 1 && this.phase === 'final') this.warn('gearw', 8, () => this.toast(t('voo.t.gearw', 'Baixe o trem de pouso!'), 'gear', 'bad'));
      if (f.alt < 300 && this.phase !== 'final') this.warn('terrain', 5, () => (this.toast(t('voo.t.terrain', 'TERRENO! Suba!'), 'warn', 'bad'), this.sfx('alarm')));
      if (f.spd > 165) this.warn('fast', 6, () => this.toast(t('voo.t.fast', 'Rápido demais! Reduza a potência'), 'warn', 'bad'));
    }
    // ---- contato com o chão ----
    if (f.alt <= 0) this.touchdown();
  }
  private nextGear = 0;

  /** guarda a pose atual (início do passo) para a interpolação da vista */
  savePose(): void {
    const f = this.f;
    const o = this.pf;
    o.x = f.x;
    o.z = f.z;
    o.alt = f.alt;
    o.hdg = f.hdg;
    o.pitch = f.pitch;
    o.roll = f.roll;
    for (const p of this.players) (p.ox = p.x), (p.oz = p.z);
  }
  /** pose interpolada entre o passo anterior e o atual (para desenhar sem tremer) */
  pose(): { x: number; z: number; alt: number; hdg: number; pitch: number; roll: number } {
    const f = this.f;
    const a = this.pf;
    const k = this.lerpK;
    const o = this.poseOut;
    o.x = a.x + (f.x - a.x) * k;
    o.z = a.z + (f.z - a.z) * k;
    o.alt = a.alt + (f.alt - a.alt) * k;
    o.hdg = a.hdg + wrapA(f.hdg - a.hdg) * k;
    o.pitch = a.pitch + (f.pitch - a.pitch) * k;
    o.roll = a.roll + (f.roll - a.roll) * k;
    return o;
  }

  /** liga/desliga o piloto automático (só com alguém sentado no manche) */
  setAP(on: boolean, why: '' | 'stick' | 'low' | 'user' = 'user'): void {
    if (this.proxy && why === 'user') this.proxy(['ap', on ? 1 : 0]);
    const f = this.f;
    if (on && (!this.pilot || !this.flying)) return;
    if (!!f.ap === on) return;
    f.ap = on ? 1 : 0;
    if (on) this.toast(t('voo.t.apOn', 'Piloto automático LIGADO: asas niveladas e altitude-alvo'), 'yoke', 'info');
    else if (why === 'stick') this.toast(t('voo.t.apStick', 'Piloto automático desligado (você mexeu no manche)'), 'yoke', 'info');
    else if (why === 'low') this.toast(t('voo.t.apLow', 'Piloto automático desligado: o pouso é com você!'), 'yoke', 'info');
    else if (why === 'user') this.toast(t('voo.t.apOff', 'Piloto automático desligado'), 'yoke', 'info');
    this.sfx(on ? 'seat' : 'alarm');
  }

  /**
   * Voo automático (AP ou ajudante no manche): asas niveladas rumo à seta-guia, segue a
   * altitude-alvo com subida/descida suave e ajusta a manete. Sem oscilação forçada.
   */
  private autoFly(dt: number, bot: boolean): { sx: number; sy: number } {
    const f = this.f;
    const tgtAlt = Math.max(f.talt, f.loc ? 380 : 0);
    if (bot && f.loc && f.alt < 520) {
      const p = this.pilot;
      this.warn('botland', 12, () => p && this.ev.push({ k: 'say', who: p.idx, msg: t('voo.s.cantland', 'Eu não sei pousar! Alguém assume o manche?') }));
    }
    const wantRoll = clamp(f.brg * 0.9, -0.35, 0.35);
    const sx = clamp((wantRoll - f.roll) * 1.6 - f.p * 0.9, -1, 1);
    const wantG = clamp((tgtAlt - f.alt) * 0.0011, -0.06, 0.05);
    // profundor: segue a trajetória pedida (com amortecimento pela arfagem)
    const e = clamp((wantG - f.gamma) * 9 - f.q * 1.2 + (alphaTrim(f.flapPos) - f.alpha) * 0.0, -0.6, 0.6);
    const wantSpd = f.loc ? lerp3(FM.VTRIM, f.flapPos) + 4 : this.phase === 'descent' ? 115 : 125;
    f.thr += (clamp(trimThrottle(f) + (wantSpd - f.spd) * 0.04 + Math.max(0, wantG) * 3, 0.05, 1) - f.thr) * Math.min(1, dt * 0.5);
    if (!bot) this.ctrl.thr = f.thr;
    return { sx, sy: -e };
  }

  /** turbulência anunciada: aviso de cintos e, alguns segundos depois, o evento */
  warnTurb(sec = 6): void {
    if (this.turbWarn > 0 || this.active().some((e) => e.kind === 'turb')) return;
    this.turbWarn = sec;
    this.f.belt = 1;
    this.toast(t('voo.t.turbWarn', 'Turbulência à frente! Todos sentados e de cinto'), 'turb', 'bad');
    this.sfx('alarm');
  }

  private guide(): void {
    const f = this.f;
    f.dist = Math.hypot(f.x, Math.max(0, f.z));
    if (!f.loc && f.z < FIX_Z + 3000 && f.z > 2000 && Math.abs(f.x) < f.z * 0.28 + 600 && Math.abs(wrapA(f.hdg)) < 1.1) f.loc = true;
    let tx: number;
    let tz: number;
    if (f.loc) {
      tx = 0;
      tz = Math.min(f.z - 2500, -400);
      f.talt = Math.max(0, f.z) * GS;
      f.dev = f.x;
    } else {
      tx = 0;
      tz = FIX_Z;
      const d = Math.hypot(f.x, f.z);
      f.talt = d > 34000 ? 2400 : clamp(900 + ((d - FIX_Z) / (34000 - FIX_Z)) * 1500, 900, 2400);
      f.dev = 0;
    }
    f.brg = wrapA(Math.atan2(tx - f.x, -(tz - f.z)) - f.hdg);
  }

  private touchdown(): void {
    const f = this.f;
    const vsd = -f.vs;
    const onRwy = Math.abs(f.x) <= RWY_HALF + 2 && f.z <= 60 && f.z >= -RWY_LEN;
    const hdgErr = Math.abs(wrapA(f.hdg));
    let kind: OutKind;
    let reason: string;
    if (this.phase !== 'final' && !onRwy) {
      kind = 'crash';
      reason = t('voo.o.terrain', 'Batemos no chão antes do aeroporto');
    } else if (f.gearPos < 0.95) {
      kind = 'crash';
      reason = t('voo.o.belly', 'Pouso de barriga: o trem não estava baixado');
    } else if (!onRwy && !(Math.abs(f.x) < 140 && f.z < 400 && f.z > -RWY_LEN - 200)) {
      kind = 'crash';
      reason = t('voo.o.offrwy', 'Pousamos longe da pista');
    } else if (vsd > 6.5) {
      kind = 'crash';
      reason = t('voo.o.hard', 'Batida forte demais ({v} m/s)', { v: vsd.toFixed(1) });
    } else if (Math.abs(f.roll) > 0.42) {
      kind = 'crash';
      reason = t('voo.o.wing', 'A asa raspou no chão');
    } else if (!onRwy) {
      kind = 'rough';
      reason = t('voo.o.grass', 'Pouso na grama, mas inteiros!');
    } else if (vsd > 3.3 || f.spd > 86 || Math.abs(f.roll) > 0.2 || hdgErr > 0.16 || f.z > 0) {
      kind = 'rough';
      reason =
        vsd > 3.3
          ? t('voo.o.bumpy', 'Quicou forte ({v} m/s)', { v: vsd.toFixed(1) })
          : f.spd > 86
            ? t('voo.o.speedy', 'Rápido demais no toque')
            : f.z > 0
              ? t('voo.o.short', 'Tocou antes da cabeceira')
              : t('voo.o.crooked', 'Tocou torto');
    } else if (vsd < 1.9 && f.spd < 78 && Math.abs(f.x) < 9 && hdgErr < 0.07) {
      kind = 'perfect';
      reason = t('voo.o.butter', 'Manteiga! Ninguém derramou o suco');
    } else {
      kind = 'good';
      reason = t('voo.o.good', 'Pouso firme e seguro');
    }
    f.alt = 0;
    const out = this.finishOutcome(kind, reason, vsd);
    this.phase = kind === 'crash' ? 'crash' : 'rollout';
    if (kind === 'crash') f.spd *= 0.5;
    this.endT = 0;
    this.ev.push({ k: 'touch', out });
    for (const p of this.players) {
      p.busy = -1;
      if (p.seated && kind === 'crash') p.seated = false;
    }
  }

  /** desmanche no ar (casco zerado) */
  private breakApart(): void {
    if (!this.flying) return;
    this.f.alt = Math.max(0, this.f.alt);
    const out = this.finishOutcome('crash', t('voo.o.hull', 'O avião se desmanchou (casco em 0%)'), 0);
    this.phase = 'crash';
    this.endT = 0;
    this.ev.push({ k: 'touch', out });
  }

  private finishOutcome(kind: OutKind, reason: string, vsd: number): Outcome {
    const f = this.f;
    const avgPanic = this.panicSamples > 0 ? this.panicInt / this.panicSamples : 0;
    const land = { perfect: 5000, good: 3500, rough: 2000, crash: 0 }[kind];
    let score = land + this.bonus + this.fixedCount * 200 + Math.round((1 - avgPanic) * 1500) + Math.round(this.hull * 15) + Math.round(f.fuel * 10);
    if (kind === 'crash') score = Math.round(score * 0.25);
    let stars = { perfect: 3, good: 2, rough: 1, crash: 0 }[kind];
    if (stars > 1 && (this.hull < 40 || avgPanic > 0.6)) stars--;
    if (this.opts.mode === 'training') score = Math.round(score * 0.3);
    this.outcome = { kind, reason, vs: vsd, spd: f.spd, off: Math.abs(f.x), stars, score };
    return this.outcome;
  }

  /* ------------------------------ emergências ------------------------------ */

  /** tutorial: sem emergências aleatórias enquanto ensina */
  paused = false;
  private schedule(dt: number): void {
    if (this.turbWarn > 0) {
      this.turbWarn -= dt;
      if (this.turbWarn <= 0) {
        this.turbWarn = 0;
        this.startEmer('turb', 'pilot');
      }
    }
    if (this.opts.mode === 'training' || this.paused) return;
    this.nextEmerT -= dt;
    if (this.nextEmerT > 0) return;
    const pr = this.progress;
    const crew = this.players.length;
    const scale = 1 / (1 + 0.14 * (crew - 1));
    this.nextEmerT = (lerp(26, 12, pr) + this.rnd() * 8) * scale;
    const act = this.active().filter((e) => e.kind !== 'panic');
    const cap = 1 + Math.floor(pr * (crew === 1 ? 2 : 3.2)) + (crew >= 3 ? 1 : 0);
    if (act.length >= cap) {
      this.nextEmerT = 4;
      return;
    }
    const final = this.phase === 'final';
    const w: [EmerKind, number][] = [
      ['fire', 3],
      ['leak', this.leakCount < 2 && !final ? 1.4 : 0],
      ['spark', final ? 0.6 : 2],
      ['pressure', final ? 0.3 : 1.2],
      ['door', 1.4],
      ['turb', 2],
      ['bird', 1.8],
    ];
    const has = (k: EmerKind) => act.filter((e) => e.kind === k).length;
    let tot = 0;
    for (const x of w) {
      if (has(x[0]) >= (x[0] === 'fire' ? 2 : 1)) x[1] = 0;
      tot += x[1];
    }
    if (tot <= 0) return;
    let pick = this.rnd() * tot;
    for (const [k, wt] of w) {
      pick -= wt;
      if (pick <= 0) {
        this.spawnKind(k);
        return;
      }
    }
  }

  private spawnKind(k: EmerKind): void {
    const r = this.rnd;
    if (k === 'fire') {
      const used = new Set(this.active().map((e) => e.spot));
      const free = FIRE_SPOTS.filter((s) => !used.has(s));
      if (!free.length) return;
      this.startEmer('fire', free[Math.floor(r() * free.length)]);
    } else if (k === 'leak') {
      this.leakCount++;
      this.startEmer('leak', 'leak');
    } else if (k === 'spark') this.startEmer('spark', 'elec');
    else if (k === 'pressure') this.startEmer('pressure', 'valve');
    else if (k === 'door') this.startEmer('door', r() < 0.5 ? 'doorF' : 'doorR');
    else if (k === 'turb') this.warnTurb(6);
    else if (k === 'bird') this.startEmer('bird', 'win');
  }

  startEmer(kind: EmerKind, spot: SpotId): Emer | null {
    if (kind !== 'fire' && this.active().some((e) => e.kind === kind)) return null;
    const r = this.rnd;
    let x = 0;
    let y = 1;
    let z = 0;
    let win = -1;
    if (spot === 'win') {
      win = Math.floor(r() * WIN_Z.length * 2);
      x = (win % 2 ? 1 : -1) * 1.66;
      z = WIN_Z[win >> 1];
      y = 1.25;
    } else {
      const s = SPOTS[spot];
      x = s.x;
      y = s.y;
      z = s.z;
    }
    const e: Emer = { id: this.eid++, kind, spot, x, y, z, sev: kind === 'fire' ? 0.35 : 0, prog: 0, stage: 0, age: 0, done: false, dur: 0, hot: 0, win };
    if (kind === 'turb') {
      e.dur = 11 + r() * 6;
      this.dropBags(1 + Math.floor(r() * 3));
    }
    if (kind === 'fire' && (spot === 'engL' || spot === 'engR')) this.f.eng[spot === 'engL' ? 0 : 1] = 0.35;
    if (kind === 'spark') this.flicker = true;
    this.emers.push(e);
    const msg = emerName(kind);
    this.toast(msg, kind, 'bad', e.id);
    this.sfx(kind === 'bird' ? 'glass' : kind === 'turb' ? 'rumble' : 'alarm');
    return e;
  }

  private endEmer(e: Emer, by: Player | null, good = true): void {
    if (e.done) return;
    e.done = true;
    if (e.kind === 'fire' && (e.spot === 'engL' || e.spot === 'engR')) this.f.eng[e.spot === 'engL' ? 0 : 1] = 1;
    if (e.kind === 'spark') this.flicker = false;
    if (e.kind === 'pressure') this.dizzy = 0;
    if (e.kind === 'gear') this.gearStuck = false;
    if (e.kind === 'door') this.doorOpen = '';
    if (e.kind === 'bird') this.winBroken = -1;
    if (!good) return;
    if (e.kind !== 'turb' && e.kind !== 'panic') this.fixedCount++;
    if (by) {
      by.stats.fixes++;
      if (e.kind === 'fire') by.stats.fires++;
      if (e.kind === 'bird' || e.kind === 'leak') by.stats.patched++;
    }
    this.ev.push({ k: 'fx', t: e.kind === 'fire' ? 'fireOut' : 'fixed', x: e.x, z: e.z, y: e.y });
    const who = by ? by.name : '';
    if (e.kind !== 'turb' && e.kind !== 'panic') this.toast(who ? t('voo.t.fixedBy', '{n} resolveu: {e}', { n: who, e: emerName(e.kind).replace('!', '') }) : t('voo.t.fixed', 'Resolvido!'), 'check', 'good');
    this.sfx('fixed');
    // bots que estavam nisso param
    for (const p of this.players) if (p.cmd?.emer === e.id) this.botDone(p);
  }

  private stepEmers(dt: number): void {
    const f = this.f;
    for (const e of this.emers) {
      if (e.done) continue;
      e.age += dt;
      switch (e.kind) {
        case 'fire': {
          e.sev = Math.min(1.2, e.sev + dt * (e.spot === 'engL' || e.spot === 'engR' ? 0.015 : 0.019));
          this.hull -= dt * 0.22 * e.sev;
          if (e.sev >= 1) {
            e.hot += dt;
            if (e.hot > 14 && this.active().filter((x) => x.kind === 'fire').length < 3) {
              e.hot = 0;
              const used = new Set(this.active().map((x) => x.spot));
              const near = FIRE_SPOTS.filter((s) => !used.has(s) && Math.abs(SPOTS[s as keyof typeof SPOTS].z - e.z) < 7);
              if (near.length) this.startEmer('fire', near[Math.floor(this.rnd() * near.length)]);
            }
          }
          break;
        }
        case 'leak':
          if (e.stage === 0) {
            f.fuel = Math.max(0, f.fuel - dt * 0.42);
            e.sev = Math.min(1, e.age / 40);
          }
          break;
        case 'spark':
          e.sev = Math.min(1, e.sev + dt / 42);
          if (e.sev >= 1 && e.stage === 0) {
            e.stage = 1;
            if (!this.active().some((x) => x.kind === 'fire' && x.spot === 'elec')) {
              const fe = this.startEmer('fire', 'elec' as SpotId);
              if (fe) (fe.x = 1.55), (fe.y = 1.2);
            }
          }
          if (this.rnd() < dt * 1.5) this.ev.push({ k: 'fx', t: 'spark', x: e.x, z: e.z, y: e.y });
          break;
        case 'pressure':
          e.sev = Math.min(1, e.sev + dt / 45);
          this.dizzy = e.sev >= 1 ? Math.min(1, this.dizzy + dt * 0.5) : 0;
          if (e.sev >= 1) this.warn('dizzy', 18, () => this.toast(t('voo.t.dizzy', 'Ar rarefeito: todo mundo tonto!'), 'pressure', 'bad'));
          break;
        case 'door':
          if (e.stage === 0) {
            e.sev = Math.min(1, e.sev + dt / 24);
            if (e.sev >= 1) {
              e.stage = 1;
              e.prog = 0;
              this.doorOpen = e.spot;
              this.hull -= 6;
              this.toast(t('voo.t.doorOpen', 'A porta abriu! Vento puxando tudo!'), 'door', 'bad', e.id);
              this.sfx('wind');
              this.startEmer('pressure', 'valve');
            }
          }
          break;
        case 'turb':
          e.sev = Math.sin(Math.min(1, e.age / e.dur) * Math.PI);
          if (e.age >= e.dur) this.endEmer(e, null, false);
          break;
        case 'bird':
          if (e.stage === 0) {
            e.sev = Math.min(1, e.sev + dt / 34);
            if (e.sev >= 1) {
              e.stage = 1;
              e.prog = 0;
              this.winBroken = e.win;
              this.hull -= 8;
              this.ev.push({ k: 'fx', t: 'glass', x: e.x, z: e.z, y: e.y });
              this.toast(t('voo.t.winBroke', 'A janela quebrou! Tape rápido!'), 'bird', 'bad', e.id);
              this.startEmer('pressure', 'valve');
            }
          } else this.hull -= dt * 0.15;
          break;
        case 'gear':
          e.sev = this.phase === 'final' ? 1 : 0.5;
          break;
        case 'panic': {
          let worst: Pax | null = null;
          for (const p of this.pax) if (p.panic > 0.7 && (!worst || p.panic > worst.panic)) worst = p;
          if (!worst) this.endEmer(e, null, false);
          else {
            e.x = worst.x;
            e.z = worst.z;
            e.y = 1.0;
          }
          break;
        }
      }
    }
    this.turb = 0;
    for (const e of this.emers) if (!e.done && e.kind === 'turb') this.turb = Math.max(this.turb, e.sev);
    // sem turbulência de fundo: ela só existe como evento anunciado (aviso de cintos antes)
    if (this.f.belt && this.turbWarn <= 0 && !this.emers.some((e) => !e.done && e.kind === 'turb')) this.f.belt = 0;
    if (this.hull <= 0) {
      this.hull = 0;
      this.breakApart();
    }
    // limpeza
    if (this.emers.length > 40) this.emers = this.emers.filter((e) => !e.done);
    this.alarmT -= dt;
  }

  private dropBags(n: number): void {
    const bags = this.items.filter((i) => i.kind === 'bag' && i.alive);
    const ids: number[] = [];
    for (let k = 0; k < n; k++) {
      if (bags.length + ids.length >= this.opts.maxBags) break;
      const z = WIN_Z[Math.floor(this.rnd() * WIN_Z.length)];
      const side = this.rnd() < 0.5 ? -1 : 1;
      const it = this.spawnItem('bag', side * 0.9, 2.0, z);
      it.vx = -side * (1 + this.rnd() * 1.5);
      it.vy = 0.5;
      it.spin = (this.rnd() * 2 - 1) * 6;
      ids.push(it.id);
    }
    if (ids.length) this.ev.push({ k: 'bags', ids });
  }

  /* ------------------------------ passageiros ------------------------------ */

  private stepPax(dt: number): void {
    const f = this.f;
    const act = this.active();
    let alarms = 0;
    for (const e of act) if (e.kind !== 'turb' && e.kind !== 'panic' && e.kind !== 'gear') alarms++;
    const base = 0.002 + alarms * 0.003 + this.turb * 0.025 + (Math.abs(f.roll) > 0.6 ? 0.02 : 0) + (f.vs < -25 ? 0.02 : 0) + (f.stall ? 0.03 : 0) + (this.pilot ? 0 : 0.004) + this.dizzy * 0.01 + (this.doorOpen || this.winBroken >= 0 ? 0.02 : 0);
    // cintos: aviso de turbulência ou turbulência = todo mundo sentado
    const belt = !!f.belt || this.turb > 0;
    let up = 0;
    let walkers = 0;
    for (const q of this.pax) if (q.mode >= 2) walkers++;
    for (let i = 0; i < this.pax.length; i++) {
      const p = this.pax[i];
      p.bob += dt;
      p.happyT = Math.max(0, p.happyT - dt);
      if (p.calmT > 0) {
        p.calmT -= dt;
        p.panic = Math.max(0, p.panic - dt * 0.05);
      } else {
        let near = 0;
        for (const e of act) if (e.kind === 'fire' && Math.abs(e.z - p.sz) < 3) near += 0.01;
        p.panic = clamp(p.panic + dt * (base + near) * (0.6 + ((p.seat * 37) % 10) / 12), 0, 1);
      }
      switch (p.mode) {
        case 0: {
          // sentado: fica sentado (pânico só muda o rosto/balanço); levanta só em evento
          if (!belt && p.panic > 0.9) p.hiT += dt;
          else p.hiT = 0;
          if (p.hiT > 2.5) {
            p.mode = 1;
            p.hiT = 0;
          } else if (!belt && (this.phase === 'cruise' || this.phase === 'descent') && walkers < 2 && p.panic < 0.4 && p.want < 0 && this.rnd() < dt / 260) {
            p.mode = 2;
            p.leg = 0;
            p.wT = 0;
            walkers++;
          }
          p.x += (p.sx - p.x) * Math.min(1, dt * 4);
          p.z += (p.sz - p.z) * Math.min(1, dt * 4);
          p.yaw = Math.PI;
          break;
        }
        case 1: {
          // em pé na própria fileira (não bloqueia o corredor); senta quando acalma ou com o cinto
          const [lx, lz] = legroom(p);
          p.x += (lx - p.x) * Math.min(1, dt * 3);
          p.z += (lz - p.z) * Math.min(1, dt * 3);
          p.yaw = Math.PI + Math.sin(p.bob * 1.3) * 0.6;
          if (p.panic < 0.6 || belt) p.mode = 0;
          break;
        }
        case 2:
          this.paxWalk(p, dt, belt);
          break;
        case 3:
          p.wT -= dt;
          if (p.wT <= 0 || belt) {
            p.mode = 2;
            p.leg = 1;
            p.wT = 0;
          }
          break;
      }
      p.standing = p.mode !== 0;
      if (p.mode === 1) up++;
      // pânico extremo: puxa a alavanca da porta
      if (p.panic > 0.97 && p.mode === 1) {
        p.doorT += dt;
        if (p.doorT > 14) {
          p.doorT = 0;
          if (!act.some((e) => e.kind === 'door')) {
            this.toast(t('voo.t.paxDoor', 'Um passageiro desesperado mexeu na porta!'), 'door', 'bad');
            this.startEmer('door', p.sz > 8 ? 'doorR' : 'doorF');
          }
        }
      } else p.doorT = 0;
    }
    if (up >= 3 && !act.some((e) => e.kind === 'panic')) this.startEmer('panic', 'pilot');
    this.stepOrders(dt);
  }

  /** passageiro andando pelo corredor até o banheiro e de volta: um atrás do outro, abre espaço para a tripulação */
  private paxWalk(p: Pax, dt: number, belt: boolean): void {
    if (belt && p.leg === 0) p.leg = 1;
    const exitZ = p.sz - (p.sz < 3 ? 0.55 : 0.45);
    // waypoints (ida): fileira → corredor → fundo → banheiro; volta ao contrário
    const pts: [number, number][] = [
      [p.sx * 0.55, exitZ],
      [0, exitZ],
      [0, 15.3],
      LAV,
    ];
    if (p.leg === 1) pts.reverse().push([p.sx, p.sz]);
    let wi = Math.min(pts.length - 1, Math.floor(p.wT));
    let [tx, tz] = pts[wi];
    let dx = tx - p.x;
    let dz = tz - p.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.08) {
      p.wT = wi + 1;
      if (p.wT >= pts.length) {
        if (p.leg === 0) {
          p.mode = 3;
          p.wT = 5 + this.rnd() * 6;
        } else {
          p.mode = 0;
          p.leg = 0;
        }
        return;
      }
      wi++;
      [tx, tz] = pts[wi];
      dx = tx - p.x;
      dz = tz - p.z;
      d = Math.hypot(dx, dz) || 1;
    }
    let sp = belt ? 1.6 : 1.05;
    // fila: outro passageiro andando logo à frente → espera
    for (const o of this.pax) {
      if (o === p || o.mode < 2) continue;
      const ox = o.x - p.x;
      const oz = o.z - p.z;
      const od = Math.hypot(ox, oz);
      if (od < 0.6 && (ox * dx + oz * dz) / (d * Math.max(od, 1e-3)) > 0.5) sp = 0;
    }
    // tripulação perto: anda devagar e encosta de lado (o corredor fica livre)
    let side = 0;
    for (const pl of this.players) {
      if (pl.seated) continue;
      const od = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (od < 0.9) {
        sp *= 0.35;
        side = pl.x > p.x ? -1 : 1;
      }
    }
    p.x += (dx / d) * sp * dt;
    p.z += (dz / d) * sp * dt;
    if (side && Math.abs(p.z - tz) > 0.2) p.x += (side * 0.34 - p.x) * Math.min(1, dt * 6);
    if (sp > 0.05) p.yaw = Math.atan2(dx, dz);
  }

  /* ------------------------------ serviço de bordo ------------------------------ */

  orders: Order[] = [];
  cart = { x: CART_HOME[0], z: CART_HOME[1], yaw: 0, by: -1, trays: [] as Tray[] };
  private nextOrderT = 35;
  private oid = 1;
  private tid = 1;
  /** preparo aberto para o jogador local (a interface abre a copa) */
  prepOpen = false;

  private stepOrders(dt: number): void {
    const f = this.f;
    if (this.opts.mode !== 'training' && !f.belt && this.turb <= 0 && (this.phase === 'cruise' || this.phase === 'descent')) {
      this.nextOrderT -= dt;
      const cap = 2 + (this.players.length >= 3 ? 1 : 0);
      if (this.nextOrderT <= 0) {
        this.nextOrderT = 22 + this.rnd() * 18;
        const free = this.pax.filter((q) => q.mode === 0 && q.want < 0 && q.panic < 0.7);
        if (this.orders.length < cap && free.length) {
          const q = free[Math.floor(this.rnd() * free.length)];
          // quase sempre comida + bebida; às vezes só um dos dois
          const r1 = this.rnd();
          const main = r1 < 0.15 ? 0 : 1 + Math.floor(this.rnd() * 2);
          const drink = main && this.rnd() < 0.15 ? 0 : 1 + Math.floor(this.rnd() * 3);
          const o: Order = { id: this.oid++, pax: this.pax.indexOf(q), main, drink, t: 110, tmax: 110, tray: -1, bot: -1 };
          q.want = o.id;
          this.orders.push(o);
          this.toast(t('voo.t.order', 'Poltrona {s} pediu um lanche!', { s: seatLabel(q.seat) }), 'serve', 'info');
          this.sfx('ding');
        }
      }
    }
    for (const o of this.orders) {
      o.t -= dt;
      const q = this.pax[o.pax];
      if (q && o.t < o.tmax * 0.35) q.panic = Math.min(1, q.panic + dt * 0.004);
      if (o.t <= 0) this.closeOrder(o, 'late');
    }
    this.orders = this.orders.filter((o) => o.t > -1e8);
    // carrinho segue quem empurra
    const c = this.cart;
    if (c.by >= 0) {
      const p = this.players[c.by];
      if (!p || p.seated || p.stun > 0 || p.busy >= 0 || p.prep) c.by = -1;
      else this.cartFollow(p);
    }
  }
  /** carrinho na frente de quem empurra; no corredor fica centralizado */
  cartFollow(p: Player): void {
    const c = this.cart;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const sgn = fz >= 0 ? 1 : -1;
    const inAisle = p.z > 6 && p.z < 16.2;
    const tx = inAisle ? 0 : p.x + fx * 0.75;
    const tz = p.z + (inAisle ? sgn : fz) * 0.75;
    c.x = clamp(tx, -1.0, 1.0);
    c.z = clamp(tz, -0.9, 16.2);
    c.yaw = inAisle ? (sgn > 0 ? 0 : Math.PI) : Math.atan2(fx, fz);
  }

  private closeOrder(o: Order, why: 'ok' | 'wrong' | 'late', by?: Player): void {
    const q = this.pax[o.pax];
    if (q) q.want = -1;
    o.t = -1e9;
    const lbl = q ? seatLabel(q.seat) : '';
    // bandeja que sobrou para este pedido sai do carrinho
    this.cart.trays = this.cart.trays.filter((tr) => tr.order !== o.id || why === 'wrong');
    if (why === 'ok') {
      if (q) {
        q.panic = Math.max(0, q.panic - 0.5);
        q.calmT = 25;
        q.happyT = 3;
        this.ev.push({ k: 'fx', t: 'calm', x: q.sx, z: q.sz, y: 1.1 });
      }
      this.bonus += 150;
      if (by) by.stats.served = (by.stats.served ?? 0) + 1;
      this.toast(t('voo.t.served', 'Pedido certo! {s} adorou', { s: lbl }), 'check', 'good');
      this.sfx('calm');
    } else {
      if (q) {
        q.panic = Math.min(1, q.panic + 0.28);
        q.calmT = 0;
      }
      this.toast(why === 'late' ? t('voo.t.late', 'Poltrona {s} reclamou: o lanche demorou!', { s: lbl }) : t('voo.t.wrong', 'Poltrona {s} reclamou: pedido errado!', { s: lbl }), 'panic', 'bad');
      this.sfx('thud');
    }
  }

  /** copa: bandeja pronta vai para o carrinho (o anfitrião confere) */
  addTray(p: Player, orderId: number, main: number, drink: number, hot: number, full: number): void {
    p.prep = false;
    if (p.idx === this.me) this.prepOpen = false;
    if (this.proxy) return this.proxy(['tray', orderId, main, drink, hot, full]);
    const o = this.orders.find((x) => x.id === orderId);
    if (!o || o.tray >= 0 || this.cart.trays.length >= 4) return;
    const tr: Tray = { id: this.tid++, order: o.id, main: clamp(main | 0, 0, 2), drink: clamp(drink | 0, 0, 3), hot: hot ? 1 : 0, full: full ? 1 : 0 };
    o.tray = tr.id;
    this.cart.trays.push(tr);
    const q = this.pax[o.pax];
    this.toast(t('voo.t.trayOk', 'Bandeja da {s} no carrinho: empurre até lá!', { s: q ? seatLabel(q.seat) : '' }), 'cart', 'good');
    this.sfx('pick');
  }
  prepClose(p: Player): void {
    p.prep = false;
    if (p.idx === this.me) this.prepOpen = false;
    if (this.proxy && p.idx === this.me) this.proxy(['prepClose']);
  }
  /** a bandeja bate com o pedido? */
  static trayOk(tr: { main: number; drink: number; hot: number; full: number }, o: { main: number; drink: number }): boolean {
    return tr.main === o.main && tr.drink === o.drink && (o.main !== 2 || !!tr.hot) && (o.drink === 0 || !!tr.full);
  }
  /** entrega: a bandeja deste pedido (ou a primeira, se não tiver — aí é a poltrona errada) */
  private serve(p: Player, paxIdx: number): void {
    const q = this.pax[paxIdx];
    const o = q ? this.orders.find((x) => x.id === q.want) : undefined;
    if (!q || !o) return;
    const c = this.cart;
    let tr = c.trays.find((x) => x.order === o.id);
    let wrongSeat = false;
    if (!tr) {
      tr = c.trays[0];
      wrongSeat = true;
    }
    if (!tr) return;
    c.trays = c.trays.filter((x) => x !== tr);
    if (wrongSeat) {
      const other = this.orders.find((x) => x.id === tr!.order);
      if (other) other.tray = -1; // a bandeja do outro foi embora: refazer
    }
    this.closeOrder(o, !wrongSeat && Sim.trayOk(tr, o) ? 'ok' : 'wrong', p);
  }

  /** ajudante comissário: pega pedidos esquecidos (prepara na copa e leva na mão) */
  private botServe(p: Player, dt: number): boolean {
    if (p.role < 2 || p.cmd || p.seated) return false;
    let o = this.orders.find((x) => x.bot === p.idx);
    if (!o) {
      o = this.orders.find((x) => x.bot < 0 && x.tray < 0 && x.tmax - x.t > 18);
      if (!o) return false;
      o.bot = p.idx;
      p.actProg = 0;
    }
    const q = this.pax[o.pax];
    const held = this.item(p.hold);
    if (!held || held.kind !== 'tray') {
      if (held) this.drop(p, false);
      if (this.walkTo(p, GALLEY[0], GALLEY[1]) || Math.hypot(p.x - GALLEY[0], p.z - GALLEY[1]) < 0.4) {
        p.yaw = Math.PI / 2;
        p.actProg += dt / 6;
        if (p.actProg >= 1) {
          p.actProg = 0;
          const it = this.spawnItem('tray', p.x, 0.95, p.z);
          it.held = p.idx;
          p.hold = it.id;
          this.sfx('pick');
        }
      }
      return true;
    }
    const [ax, az] = [0, q.sz - (q.sz < 3 ? 0.6 : 0.45)];
    if (this.walkTo(p, ax, az) || Math.hypot(q.sx - p.x, q.sz - p.z) < REACH - 0.3) {
      held.alive = false;
      p.hold = -1;
      this.closeOrder(o, 'ok', p);
    }
    return true;
  }

  /* ------------------------------ forças na cabine ------------------------------ */

  private stepCabinForces(dt: number): void {
    const f = this.f;
    const r = this.rnd;
    let ax = -9.8 * Math.sin(f.roll) * 0.22;
    const az = 9.8 * Math.sin(f.pitch) * 0.35;
    let ay = 0;
    if (this.phase === 'crash') ax = 0;
    this.joltT -= dt;
    const tb = this.flying ? this.turb : 0;
    if (tb > 0.15 && this.joltT <= 0) {
      this.joltT = 0.35 + r() * 0.9 * (1.2 - tb);
      const amt = tb * (1 + r() * 2.2);
      const jx = (r() * 2 - 1) * amt;
      const jz = (r() * 2 - 1) * amt * 0.5;
      const jy = (r() * 2 - 1) * amt * 1.2;
      ay = jy * 4;
      this.ev.push({ k: 'jolt', amt });
      // solavanco forte: um bagageiro abre e uma mala despenca
      if (amt > 1.5 && this.flying && r() < 0.35) this.dropBags(1);
      for (const p of this.players) {
        if (p.seated) continue;
        p.vx += jx;
        p.vz += jz;
        if (amt > 2.3 && r() < 0.45 && p.stun <= 0) this.stumble(p);
      }
      for (const it of this.items) {
        if (!it.alive || it.held >= 0) continue;
        it.vx += jx * 1.2;
        it.vz += jz;
        it.vy += Math.abs(jy) * 0.9;
        it.spin += (r() * 2 - 1) * 8;
      }
    }
    this.acc.x += (ax - this.acc.x) * Math.min(1, dt * 4);
    // vertical sentido: carga g da física (suave) + solavancos dos eventos
    this.jy = ay || this.jy * Math.exp(-dt * 8);
    const gl = this.flying ? clamp((f.gload - 1) * 9.8, -9, 9) : 0;
    this.acc.y = this.jy + gl;
    this.acc.z += (az - this.acc.z) * Math.min(1, dt * 4);
  }

  private jy = 0;

  stumble(p: Player): void {
    p.stun = 1.1;
    p.stats.falls++;
    if (p.busy >= 0) p.busy = -1;
    if (p.hold >= 0) {
      const it = this.item(p.hold);
      if (it) {
        it.held = -1;
        it.vy = 2;
        it.vx = p.vx;
        it.vz = p.vz;
      }
      p.hold = -1;
    }
    this.ev.push({ k: 'fx', t: 'stun', x: p.x, z: p.z });
  }

  /* ------------------------------ jogadores ------------------------------ */

  /** entrada do jogador local (ou remoto): direção de andar no espaço do avião */
  input = { mx: 0, mz: 0, fx: 0, fz: -1, act: false, tap: false };

  private stepPlayer(p: Player, dt: number): void {
    p.sayT = Math.max(0, p.sayT - dt);
    if (p.seated) {
      p.x = SPOTS.pilot.x;
      p.z = SPOTS.pilot.z + 0.15;
      p.vx = p.vz = 0;
      p.yaw = Math.PI;
      return;
    }
    if (p.stun > 0) p.stun -= dt;
    if (p.remote) return this.stepRemote(p, dt);
    let mx = 0;
    let mz = 0;
    if (p.idx === this.me && !p.bot && !p.remote) {
      mx = this.input.mx;
      mz = this.input.mz;
      const l = Math.hypot(this.input.fx, this.input.fz);
      if (l > 0.01) p.yaw = Math.atan2(this.input.fx, this.input.fz);
      if (p.stun <= 0 && p.busy < 0) {
        if (this.client) this.clientAct(p);
        else this.localAct(p, this.input, dt);
      }
    } else if (p.bot) {
      mx = this.botMove.x;
      mz = this.botMove.z;
      this.botMove.x = this.botMove.z = 0;
    }
    if (p.busy >= 0 || p.stun > 0 || p.prep) mx = mz = 0;
    const sp = (p.bot ? BOT_SPEED : HUMAN_SPEED) * (p.hold >= 0 && this.item(p.hold)?.kind === 'bag' ? 0.7 : 1) * (this.cart.by === p.idx ? 0.65 : 1) * (1 - this.dizzy * 0.4);
    const ml = Math.hypot(mx, mz);
    if (ml > 1) (mx /= ml), (mz /= ml);
    // aceleração rumo à velocidade desejada + forças da cabine
    const k = Math.min(1, dt * 10);
    p.vx += (mx * sp - p.vx) * k + this.acc.x * dt * 0.9;
    p.vz += (mz * sp - p.vz) * k + this.acc.z * dt * 0.9;
    // vento da porta/janela
    const hole = this.holePos();
    if (hole) {
      const dx = hole[0] - p.x;
      const dz = hole[1] - p.z;
      const d = Math.max(0.6, Math.hypot(dx, dz));
      const pull = Math.min(3.2, 9 / d);
      p.vx += (dx / d) * pull * dt;
      p.vz += (dz / d) * pull * dt;
    }
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.walk += Math.hypot(p.vx, p.vz) * dt;
    this.collide(p);
    // passageiros andando no corredor empurram de leve (dá para se espremer e passar)
    for (const q of this.pax) {
      if (q.mode < 2) continue;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3 && d > 1e-4) {
        // dá para se espremer e passar (devagar)
        p.x += (dx / d) * (0.3 - d) * 0.22;
        p.z += (dz / d) * (0.3 - d) * 0.22;
        p.vx *= 0.9;
        p.vz *= 0.9;
      }
    }
    for (const q of this.players) {
      if (q === p || q.seated) continue;
      const dx = p.x - q.x;
      const dz = p.z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < P_RAD * 2 && d > 1e-4) {
        p.x += (dx / d) * (P_RAD * 2 - d) * 0.5;
        p.z += (dz / d) * (P_RAD * 2 - d) * 0.5;
      }
    }
    this.collide(p);
    this.carry(p, dt);
  }

  /** objeto na mão acompanha o jogador */
  private carry(p: Player, dt: number): void {
    const it = this.item(p.hold);
    if (it) {
      it.x = p.x + Math.sin(p.yaw) * 0.4;
      it.z = p.z + Math.cos(p.yaw) * 0.4;
      it.y = 0.95;
      it.vx = p.vx;
      it.vz = p.vz;
      it.vy = 0;
      if (it.kind === 'ext' && !p.spraying) it.charge = Math.min(1, it.charge + dt * 0.05);
    }
    if (!p.spraying) {
      for (const i of this.items) if (i.kind === 'ext' && i.held < 0) i.charge = Math.min(1, i.charge + dt * 0.08);
    }
  }

  /* ------------------------------ online ------------------------------ */

  /** anfitrião: entradas dos convidados, por índice de jogador */
  rin = new Map<number, RemoteIn>();
  /** convidado: a sim não roda aqui — só o meu boneco anda (previsão); o resto vem do anfitrião */
  client = false;
  /** convidado: toques acumulados (vão no pacote de entrada) */
  tapCount = 0;
  /** convidado: ações que mexeriam no mundo viram mensagens para o anfitrião */
  proxy: ((a: NetAct) => void) | null = null;

  /** anfitrião: convidado anda no próprio celular; aqui só seguimos a posição dele e decidimos as ações */
  private stepRemote(p: Player, dt: number): void {
    const ri = this.rin.get(p.idx);
    if (!ri) return;
    if (p.stun <= 0) {
      const k = Math.min(1, dt * 14);
      const nx = p.x + (ri.x - p.x) * k;
      const nz = p.z + (ri.z - p.z) * k;
      p.vx = (nx - p.x) / Math.max(dt, 1e-3);
      p.vz = (nz - p.z) / Math.max(dt, 1e-3);
      p.walk += Math.hypot(nx - p.x, nz - p.z);
      p.x = nx;
      p.z = nz;
      p.yaw = ri.yaw;
      if (p.busy < 0) this.localAct(p, ri, dt);
      ri.tap = false;
    }
    this.carry(p, dt);
  }

  /** convidado: só calcula o que o botão de ação mostra; o toque vai para o anfitrião */
  private clientAct(p: Player): void {
    this.lastCtx = this.contextFor(p, this.input.fx, this.input.fz);
    if (this.input.tap) {
      this.input.tap = false;
      this.tapCount++;
    }
  }

  /** convidado: passo local (só o meu boneco) */
  stepClient(dt: number): void {
    this.time += dt;
    const me = this.players[this.me];
    if (me) this.stepPlayer(me, dt);
  }

  setFlaps(v: number): void {
    if (this.proxy) this.proxy(['flaps', v]);
    this.f.flaps = v;
  }
  setGear(v: number): void {
    if (this.proxy) this.proxy(['gear', v]);
    this.f.gear = v;
  }
  /** anfitrião: aplica uma ação de convidado */
  applyAct(p: Player, a: NetAct): void {
    switch (a[0]) {
      case 'flaps':
        if (p.seated) this.f.flaps = Math.max(0, Math.min(2, a[1] | 0));
        break;
      case 'gear':
        if (p.seated && !this.gearStuck) this.f.gear = a[1] ? 1 : 0;
        break;
      case 'cmd': {
        const b = this.players[a[1]];
        if (b?.bot) this.command(b, { kind: a[2] as CmdKind, ...(a[3] >= 0 ? { emer: a[3] } : {}), by: p.idx });
        break;
      }
      case 'mini':
        if (p.busy === a[1]) this.miniAdd(a[1], Math.max(0, Math.min(0.2, +a[2] || 0)), p);
        break;
      case 'miniClose':
        this.miniClose(p);
        break;
      case 'throw':
        p.yaw = +a[1] || 0;
        this.drop(p, true);
        break;
      case 'stand':
        this.standUp(p);
        break;
      case 'ap':
        if (p.seated) this.setAP(!!a[1], '');
        break;
      case 'tray':
        if (p.prep) this.addTray(p, +a[1] | 0, +a[2] | 0, +a[3] | 0, +a[4] | 0, +a[5] | 0);
        break;
      case 'prepClose':
        this.prepClose(p);
        break;
    }
  }

  holePos(): [number, number] | null {
    if (this.doorOpen) {
      const s = SPOTS[this.doorOpen as 'doorF'];
      return [s.x - 0.3, s.z];
    }
    if (this.winBroken >= 0) return [(this.winBroken % 2 ? 1 : -1) * 1.5, WIN_Z[this.winBroken >> 1]];
    return null;
  }

  collide(p: { x: number; z: number; vx: number; vz: number }, rad = P_RAD): void {
    const W = HALF_W - rad;
    if (p.x < -W) (p.x = -W), (p.vx = Math.max(0, p.vx));
    if (p.x > W) (p.x = W), (p.vx = Math.min(0, p.vx));
    if (p.z < NOSE_Z + rad + 0.45) (p.z = NOSE_Z + rad + 0.45), (p.vz = Math.max(0, p.vz));
    if (p.z > TAIL_Z - rad) (p.z = TAIL_Z - rad), (p.vz = Math.min(0, p.vz));
    for (const b of BOXES) {
      const cx = clamp(p.x, b[0], b[1]);
      const cz = clamp(p.z, b[2], b[3]);
      const dx = p.x - cx;
      const dz = p.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rad * rad) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * rad;
        p.z = cz + (dz / d) * rad;
      } else {
        // centro dentro: sai pelo lado mais perto
        const o = [p.x - b[0], b[1] - p.x, p.z - b[2], b[3] - p.z];
        const m = Math.min(...o);
        if (m === o[0]) p.x = b[0] - rad;
        else if (m === o[1]) p.x = b[1] + rad;
        else if (m === o[2]) p.z = b[2] - rad;
        else p.z = b[3] + rad;
      }
    }
  }

  /* ------------------------------ interação ------------------------------ */

  /** o que o jogador pode fazer agora (olhando para fx,fz) */
  contextFor(p: Player, fx: number, fz: number): Ctx {
    const none: Ctx = { kind: '', label: '', hold: false, target: -1, x: 0, z: 0, y: 0 };
    if (p.seated || p.stun > 0 || !this.flying) return none;
    const held = this.item(p.hold);
    let best = none;
    let bestS = 1e9;
    const consider = (kind: Ctx['kind'], label: string, hold: boolean, target: number, x: number, z: number, y: number, reach = REACH, pri = 0) => {
      const dx = x - p.x;
      const dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > reach) return;
      const dot = d > 0.05 ? (dx * fx + dz * fz) / d : 1;
      if (dot < -0.2 && d > 0.7) return;
      const s = d - dot * 0.6 - pri;
      if (s < bestS) {
        bestS = s;
        best = { kind, label, hold, target, x, z, y };
      }
    };
    const pilot = this.pilot;
    if (!pilot || pilot.bot) consider('sit', pilot ? t('voo.a.takeover', 'Assumir') : t('voo.a.sit', 'Pilotar'), false, -1, SPOTS.pilot.x, SPOTS.pilot.z, 0.9, 1.6, 0.3);
    for (const e of this.active()) {
      if (e.kind === 'fire' && held?.kind === 'ext') consider('spray', t('voo.a.spray', 'Apagar'), true, e.id, e.x, e.z, e.y, 2.5, 0.8);
      else if ((e.kind === 'bird' || (e.kind === 'leak' && e.stage === 0)) && held?.kind === 'tape') consider('patch', t('voo.a.patch', 'Tapar'), true, e.id, e.x, e.z, e.y, REACH + 0.1, 0.8);
      else if (e.kind === 'leak' && e.stage === 1) consider('pump', t('voo.a.pump', 'Bombear'), false, e.id, SPOTS.pump.x, SPOTS.pump.z, SPOTS.pump.y, REACH, 0.6);
      else if (e.kind === 'spark') consider('rewire', t('voo.a.rewire', 'Consertar'), false, e.id, e.x, e.z, e.y, REACH, 0.6);
      else if (e.kind === 'pressure') consider('valve', t('voo.a.valve', 'Girar'), false, e.id, e.x, e.z, e.y, REACH, 0.6);
      else if (e.kind === 'gear') consider('crank', t('voo.a.crank', 'Manivela'), false, e.id, e.x, e.z, e.y, REACH, 0.6);
      else if (e.kind === 'door') consider('door', t('voo.a.doorClose', 'Fechar porta'), true, e.id, e.x, e.z, e.y, REACH, 0.8);
    }
    for (let i = 0; i < this.pax.length; i++) {
      const q = this.pax[i];
      if (q.panic < 0.35) continue;
      if (held && (held.kind === 'water' || held.kind === 'snack')) consider('give', t('voo.a.give', 'Entregar'), false, i, q.x, q.z, 1.0, REACH, 0.2 + q.panic * 0.3);
      else if (!held) consider('hug', t('voo.a.hug', 'Acalmar'), true, i, q.x, q.z, 1.0, REACH, q.panic * 0.3);
    }
    if (!held) {
      consider('take', itemName('water'), false, 0, SPOTS.water.x, SPOTS.water.z, SPOTS.water.y, REACH, -0.1);
      consider('take', itemName('snack'), false, 1, SPOTS.snack.x, SPOTS.snack.z, SPOTS.snack.y, REACH, -0.1);
      for (const it of this.items) {
        if (!it.alive || it.held >= 0) continue;
        consider('pick', itemName(it.kind), false, it.id, it.x, it.z, it.y, REACH, it.kind === 'bag' ? -0.2 : 0.1);
      }
    } else if (held.kind === 'bag' && p.z > 6 && p.z < 14.8) {
      // guardar a mala de volta no bagageiro da fileira mais próxima
      let bz = WIN_Z[0];
      for (const z of WIN_Z) if (Math.abs(z - p.z) < Math.abs(bz - p.z)) bz = z;
      const side = p.x < 0 ? -1 : 1;
      consider('stow', t('voo.a.stow', 'Guardar mala'), false, held.id, side * 1.2, bz, 2.0, REACH + 0.6, 0.5);
    }
    // serviço de bordo: copa (montar bandeja), carrinho (empurrar/soltar), servir na poltrona
    const c = this.cart;
    const pushing = c.by === p.idx;
    if (!held && !pushing && this.orders.some((o) => o.tray < 0 && o.bot < 0) && c.trays.length < 4)
      for (const sd of [-1, 1]) consider('prep', t('voo.a.prep', 'Montar bandeja'), false, -1, sd * 1.3, 4.9, 1.0, REACH, 0.25);
    if (!held && c.by < 0) consider('cart', t('voo.a.cart', 'Empurrar carrinho'), false, -1, c.x, c.z, 0.8, 1.4, 0.1);
    if (pushing) {
      consider('cart', t('voo.a.cartOff', 'Soltar carrinho'), false, -1, c.x, c.z, 0.8, 2.0, -0.6);
      if (c.trays.length)
        for (let i = 0; i < this.pax.length; i++) {
          const q = this.pax[i];
          if (q.want < 0) continue;
          consider('serve', t('voo.a.serve', 'Servir {s}', { s: seatLabel(q.seat) }), false, i, q.sx, q.sz, 1.0, REACH + 0.4, 1.0);
        }
    }
    return best;
  }

  /** ação do jogador local: segurando (act) ou toque (tap) */
  private localAct(p: Player, inp: { fx: number; fz: number; act: boolean; tap: boolean }, dt: number): void {
    const c = this.contextFor(p, inp.fx, inp.fz);
    this.lastCtx = c;
    p.spraying = false;
    if (inp.tap) {
      inp.tap = false;
      if (c.kind && !c.hold) this.doTap(p, c);
    }
    if (inp.act && c.kind && c.hold) this.doHold(p, c, dt, 1);
    else if (!inp.act) (p.actProg = 0), (p.actKind = '');
  }
  lastCtx: Ctx = { kind: '', label: '', hold: false, target: -1, x: 0, z: 0, y: 0 };

  doTap(p: Player, c: Ctx): MiniKind | '' {
    switch (c.kind) {
      case 'sit': {
        const cur = this.pilot;
        if (cur) {
          cur.seated = false;
          cur.x = 0.05;
          cur.z = -2.1;
          if (cur.bot) this.botDone(cur);
        }
        if (p.hold >= 0) this.drop(p, false);
        p.seated = true;
        this.sfx('seat');
        return '';
      }
      case 'take': {
        const kind: ItemKind = c.target === 0 ? 'water' : 'snack';
        const n = this.items.filter((i) => i.alive && i.kind === kind).length;
        if (n >= 4) return '';
        const it = this.spawnItem(kind, p.x, 0.95, p.z);
        it.held = p.idx;
        p.hold = it.id;
        this.sfx('pick');
        return '';
      }
      case 'pick': {
        const it = this.item(c.target);
        if (!it || it.held >= 0) return '';
        this.bonked.delete(it.id);
        it.held = p.idx;
        p.hold = it.id;
        this.sfx('pick');
        return '';
      }
      case 'stow': {
        const it = this.item(p.hold);
        if (!it) return '';
        it.alive = false;
        it.held = -1;
        p.hold = -1;
        p.stats.stowed = (p.stats.stowed ?? 0) + 1;
        this.bonus += 120;
        for (const q of this.pax) if (Math.hypot(q.sx - p.x, q.sz - p.z) < 2.6) q.panic = Math.max(0, q.panic - 0.15);
        this.ev.push({ k: 'fx', t: 'calm', x: c.x, z: c.z, y: 1.9 });
        this.toast(t('voo.t.stowed', 'Mala guardada! Bônus'), 'bag', 'good');
        this.sfx('calm');
        return '';
      }
      case 'prep':
        if (this.cart.by === p.idx) this.cart.by = -1;
        p.prep = true;
        if (p.idx === this.me) this.prepOpen = true;
        else this.ev.push({ k: 'prep', who: p.idx });
        this.sfx('pick');
        return '';
      case 'cart':
        this.cart.by = this.cart.by === p.idx ? -1 : this.cart.by < 0 ? p.idx : this.cart.by;
        if (this.cart.by === p.idx) {
          // vira para o lado do carrinho
          p.yaw = Math.atan2(this.cart.x - p.x, this.cart.z - p.z);
          this.cartFollow(p);
        }
        this.sfx('pick');
        return '';
      case 'serve':
        this.serve(p, c.target);
        return '';
      case 'give': {
        const q = this.pax[c.target];
        const it = this.item(p.hold);
        if (!q || !it) return '';
        it.alive = false;
        p.hold = -1;
        this.calmPax(q, p, 1);
        return '';
      }
      case 'rewire':
      case 'pump':
      case 'valve':
      case 'crank':
        if (this.players.some((o) => o !== p && o.busy === c.target)) {
          this.toast(t('voo.t.busy', 'Alguém já está consertando isso'), 'info', 'info');
          return '';
        }
        p.busy = c.target;
        if (p.idx === this.me) this.miniOpen = { kind: c.kind, emer: c.target };
        else this.ev.push({ k: 'mini', who: p.idx, kind: c.kind, emer: c.target });
        return c.kind;
    }
    return '';
  }
  /** minijogo aberto pelo jogador local (a interface lê e abre a sobreposição) */
  miniOpen: { kind: MiniKind; emer: number } | null = null;

  doHold(p: Player, c: Ctx, dt: number, rate: number): void {
    if (p.actKind !== c.kind || p.actTarget !== c.target) {
      p.actKind = c.kind;
      p.actTarget = c.target;
      p.actProg = 0;
    }
    if (c.kind === 'spray') {
      const it = this.item(p.hold);
      const e = this.emer(c.target);
      if (!it || !e) return;
      if (it.charge <= 0.02) {
        if (p.idx === this.me) this.warn('empty', 4, () => this.toast(t('voo.t.extEmpty', 'Extintor vazio! Espere recarregar ou pegue outro'), 'ext', 'info'));
        return;
      }
      p.spraying = true;
      it.charge = Math.max(0, it.charge - dt * 0.09);
      e.sev -= dt * 0.42 * rate;
      p.actProg = 1 - Math.max(0, e.sev);
      if (e.sev <= 0) this.endEmer(e, p);
      return;
    }
    if (c.kind === 'hug') {
      const q = this.pax[c.target];
      if (!q) return;
      p.actProg += (dt / HOLD_DUR.hug) * rate;
      if (p.actProg >= 1) {
        p.actProg = 0;
        this.calmPax(q, p, 0.65);
      }
      return;
    }
    const e = this.emer(c.target);
    if (!e) return;
    const dur = c.kind === 'door' && e.stage === 1 ? 4.5 : c.kind === 'patch' && e.stage === 1 ? 3 : HOLD_DUR[c.kind] ?? 2;
    p.actProg += (dt / dur) * rate;
    e.prog = p.actProg;
    if (p.actProg < 1) return;
    p.actProg = 0;
    p.actKind = '';
    if (c.kind === 'patch') {
      const it = this.item(p.hold);
      if (it && this.rnd() < 0.35) {
        it.alive = false; // a fita acabou
        p.hold = -1;
        it.held = -1;
        this.respawnTape();
      }
      this.ev.push({ k: 'fx', t: 'patch', x: e.x, z: e.z, y: e.y });
      if (e.kind === 'leak') {
        e.stage = 1;
        e.prog = 0;
        p.stats.patched++;
        this.toast(t('voo.t.patched', 'Vazamento tapado! Agora bombeie combustível'), 'fuel', 'good', e.id);
        this.sfx('fixed');
        for (const b of this.players) if (b.bot && b.cmd?.emer === e.id) b.react = 0.5;
      } else this.endEmer(e, p);
    } else if (c.kind === 'door') this.endEmer(e, p);
  }

  private respawnTape(): void {
    const h = ITEM_HOMES.filter((x) => x.kind === 'tape')[Math.floor(this.rnd() * 2)];
    this.spawnItem('tape', h.x, h.y + 0.3, h.z);
  }

  private calmPax(q: Pax, by: Player, k: number): void {
    q.panic = Math.max(0, q.panic - k);
    if (k >= 1) q.panic = 0.05;
    q.calmT = 20;
    q.happyT = 2.5;
    by.stats.calmed++;
    this.ev.push({ k: 'fx', t: 'calm', x: q.x, z: q.z, y: 1.1 });
    this.sfx('calm');
  }

  /** progresso de minijogo (0..1 acumulado) */
  miniAdd(emerId: number, amt: number, by: Player): void {
    if (this.proxy) return this.proxy(['mini', emerId, amt]);
    const e = this.emer(emerId);
    if (!e) return;
    e.prog = Math.min(1, e.prog + amt);
    if (e.kind === 'leak') this.f.fuel = Math.min(100, this.f.fuel + amt * 24);
    if (e.prog >= 1) {
      by.busy = -1;
      this.endEmer(e, by);
    }
  }
  miniClose(p: Player): void {
    if (this.proxy && p.idx === this.me) this.proxy(['miniClose']);
    p.busy = -1;
    if (p.idx === this.me) this.miniOpen = null;
  }

  drop(p: Player, thr: boolean): void {
    if (this.proxy) return this.proxy(['throw', p.yaw]);
    const it = this.item(p.hold);
    p.hold = -1;
    if (!it) return;
    it.held = -1;
    if (thr) {
      it.vx = Math.sin(p.yaw) * 6.5 + p.vx;
      it.vz = Math.cos(p.yaw) * 6.5 + p.vz;
      it.vy = 2.2;
      it.spin = 9;
      this.sfx('throw');
    } else {
      it.vx = Math.sin(p.yaw) * 0.6;
      it.vz = Math.cos(p.yaw) * 0.6;
      it.vy = 0.5;
      this.sfx('drop');
    }
  }
  standUp(p: Player): void {
    if (!p.seated) return;
    if (this.proxy) return this.proxy(['stand']);
    p.seated = false;
    p.x = 0.05;
    p.z = -2.15;
    p.yaw = 0;
  }

  private stepItems(dt: number): void {
    const hole = this.holePos();
    for (const it of this.items) {
      if (!it.alive || it.held >= 0) continue;
      it.vy -= 9.8 * dt;
      it.vy += this.acc.y * dt * 0.3;
      it.vx += this.acc.x * dt * 0.8;
      it.vz += this.acc.z * dt * 0.8;
      if (hole) {
        const dx = hole[0] - it.x;
        const dz = hole[1] - it.z;
        const d = Math.max(0.5, Math.hypot(dx, dz));
        it.vx += (dx / d) * Math.min(6, 14 / d) * dt;
        it.vz += (dz / d) * Math.min(6, 14 / d) * dt;
        if (d < 0.7 && it.kind !== 'ext' && it.kind !== 'tape') it.alive = false; // voou pela abertura
      }
      it.x += it.vx * dt;
      it.y += it.vy * dt;
      it.z += it.vz * dt;
      it.rot += it.spin * dt;
      // mala caindo acerta passageiro sentado (bonk de desenho animado)
      if (it.kind === 'bag' && it.vy < -0.8 && it.y < 1.3 && !this.bonked.has(it.id)) {
        for (const q of this.pax) {
          if (q.standing || Math.hypot(q.sx - it.x, q.sz - it.z) > 0.45) continue;
          this.bonked.add(it.id);
          q.panic = Math.min(1, q.panic + 0.22);
          q.calmT = 0;
          this.ev.push({ k: 'fx', t: 'stun', x: q.sx, z: q.sz });
          this.sfx('thud');
          break;
        }
      }
      const fy = 0.12;
      if (it.y < fy) {
        it.y = fy;
        if (it.vy < -1.5) this.sfx('thud');
        it.vy = -it.vy * 0.3;
        const fr = Math.exp(-dt * 6);
        it.vx *= fr;
        it.vz *= fr;
        it.spin *= Math.exp(-dt * 5);
        if (Math.abs(it.vy) < 0.4) it.vy = 0;
      }
      if (it.y > CEIL - 0.2) (it.y = CEIL - 0.2), (it.vy = -Math.abs(it.vy) * 0.5);
      if (it.y < 1.05) {
        const before = { x: it.x, z: it.z, vx: it.vx, vz: it.vz };
        this.collide(before, 0.18);
        if (before.x !== it.x) it.vx *= -0.4;
        if (before.z !== it.z) it.vz *= -0.4;
        it.x = before.x;
        it.z = before.z;
      } else {
        const w = HALF_W - 0.18;
        if (Math.abs(it.x) > w) (it.x = Math.sign(it.x) * w), (it.vx *= -0.4);
        it.z = clamp(it.z, NOSE_Z + 0.6, TAIL_Z - 0.2);
      }
    }
    if (this.items.length > 40) this.items = this.items.filter((i) => i.alive);
  }

  /* ------------------------------ bots ------------------------------ */

  private botMove = { x: 0, z: 0 };

  command(p: Player, cmd: Cmd): void {
    if (!p.bot) return;
    if (this.proxy) return this.proxy(['cmd', p.idx, cmd.kind, cmd.emer ?? -1]);
    if (p.seated && cmd.kind !== 'pilot') this.standUp(p);
    if (p.busy >= 0) p.busy = -1;
    p.cmd = cmd;
    p.react = 1.1 + this.rnd() * 1.7; // demora para reagir (nunca é instantâneo)
    p.actProg = 0;
  }
  private botDone(p: Player): void {
    if (!p.bot) return;
    if (p.cmd && p.cmd.kind === 'fix') {
      p.say = t('voo.s.done', 'Pronto!');
      p.sayT = 2;
    }
    p.cmd = null;
    p.busy = -1;
    p.spraying = false;
  }
  private botSay(p: Player, msg: string): void {
    p.say = msg;
    p.sayT = 2.4;
    this.ev.push({ k: 'say', who: p.idx, msg });
  }

  /** ponto livre de onde se alcança um local */
  approach(x: number, z: number): [number, number] {
    const probe = { x, z, vx: 0, vz: 0 };
    for (let i = 0; i <= 20; i++) {
      probe.x = x * (1 - i / 20);
      probe.z = z;
      const bx = probe.x;
      this.collide(probe, P_RAD + 0.02);
      if (Math.abs(probe.x - bx) < 0.01 && Math.abs(probe.z - z) < 0.01) return [probe.x, probe.z];
      probe.z = z;
    }
    return [0, z];
  }

  private walkTo(p: Player, tx: number, tz: number): boolean {
    let gx = tx;
    let gz = tz;
    // pelo corredor (x≈0) quando o destino está longe no comprimento
    if (Math.abs(tz - p.z) > 0.9 && Math.abs(p.x) > 0.3) {
      gx = 0;
      gz = p.z + Math.sign(tz - p.z) * 0.3;
    } else if (Math.abs(tz - p.z) > 0.9) gx = 0;
    const dx = gx - p.x;
    const dz = gz - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.18 && gx === tx && gz === tz) return true;
    if (d > 0.01) {
      this.botMove.x = dx / d;
      this.botMove.z = dz / d;
      p.yaw = Math.atan2(dx, dz);
      // travado? desvia de lado por um instante
      const sp = Math.hypot(p.vx, p.vz);
      p.stuck = sp < 0.4 ? p.stuck + 1 / 60 : Math.max(0, p.stuck - 1 / 30);
      if (p.stuck > 0.7) {
        const side = Math.sin(this.time * 2 + p.idx) > 0 ? 1 : -1;
        this.botMove.x += -this.botMove.z * side * 1.2;
        this.botMove.z += this.botMove.x * side * 0.4;
        if (p.stuck > 2.5) p.stuck = 0;
      }
    }
    return Math.hypot(tx - p.x, tz - p.z) < 0.25;
  }

  private botThink(p: Player, dt: number): void {
    p.spraying = false;
    if (p.stun > 0 || !this.flying) return;
    if (p.react > 0) {
      p.react -= dt;
      if (p.react <= 0 && p.cmd) this.botSay(p, p.cmd.kind === 'stay' ? t('voo.s.ok', 'Tá bom!') : t('voo.s.going', 'Entendido, indo!'));
      return;
    }
    const cmd = p.cmd;
    if (!cmd && this.botServe(p, dt)) return;
    if (!cmd || cmd.kind === 'stay') return;
    if (cmd.kind === 'follow') {
      const me = this.players[cmd.by ?? this.me] ?? this.players[this.me];
      if (me.seated) {
        this.walkTo(p, 0.1, -1.6);
        return;
      }
      if (Math.hypot(me.x - p.x, me.z - p.z) > 1.3) this.walkTo(p, me.x, me.z);
      return;
    }
    if (cmd.kind === 'pilot') {
      if (p.seated) return;
      const cur = this.pilot;
      if (cur && !cur.bot) {
        this.botSay(p, t('voo.s.seatTaken', 'O manche já tem dono!'));
        p.cmd = null;
        return;
      }
      if (this.walkTo(p, -0.1, -2.35) || Math.hypot(p.x - SPOTS.pilot.x, p.z - SPOTS.pilot.z) < 0.75) {
        if (p.hold >= 0) this.drop(p, false);
        p.seated = true;
        this.botSay(p, t('voo.s.flying', 'Segurando firme (mas não sei pousar!)'));
      }
      return;
    }
    if (cmd.kind === 'calm') {
      let best: Pax | null = null;
      let bi = -1;
      this.pax.forEach((q, i) => {
        if (q.panic > 0.35 && (!best || q.panic > best.panic)) (best = q), (bi = i);
      });
      if (!best) {
        this.botSay(p, t('voo.s.allCalm', 'Todo mundo calminho!'));
        p.cmd = null;
        return;
      }
      const q = best as Pax;
      if (p.hold >= 0) this.drop(p, false);
      const [ax, az] = this.approach(q.x, q.z);
      if (Math.hypot(q.x - p.x, q.z - p.z) < REACH - 0.2 || this.walkTo(p, ax, az)) {
        this.doHold(p, { kind: 'hug', label: '', hold: true, target: bi, x: q.x, z: q.z, y: 1 }, dt, 0.55);
      }
      return;
    }
    // fix
    const e = cmd.emer !== undefined ? this.emer(cmd.emer) : undefined;
    if (!e) {
      this.botDone(p);
      return;
    }
    if (p.busy >= 0 && (p.busy !== e.id || Math.hypot(e.x - p.x, e.z - p.z) > REACH + 1.2)) p.busy = -1;
    let need: ItemKind | '' = '';
    if (e.kind === 'fire') need = 'ext';
    else if (e.kind === 'bird' || (e.kind === 'leak' && e.stage === 0)) need = 'tape';
    else if (e.kind === 'turb' || e.kind === 'panic') {
      p.cmd = { kind: e.kind === 'panic' ? 'calm' : 'stay' };
      return;
    }
    const held = this.item(p.hold);
    if (need && held?.kind !== need) {
      if (held) this.drop(p, false);
      let best: Item | null = null;
      let bd = 1e9;
      for (const it of this.items) {
        if (!it.alive || it.kind !== need || it.held >= 0) continue;
        const d = Math.abs(it.z - p.z) + Math.abs(it.x - p.x);
        if (d < bd) (bd = d), (best = it);
      }
      if (!best) {
        this.warn('nobot' + p.idx, 6, () => this.botSay(p, need === 'ext' ? t('voo.s.noExt', 'Cadê um extintor?') : t('voo.s.noTape', 'Cadê a fita?')));
        return;
      }
      const [ax, az] = this.approach(best.x, best.z);
      if (Math.hypot(best.x - p.x, best.z - p.z) < 1.0 || this.walkTo(p, ax, az)) {
        best.held = p.idx;
        p.hold = best.id;
        this.sfx('pick');
      }
      return;
    }
    let sx = e.x;
    let sz = e.z;
    if (e.kind === 'leak' && e.stage === 1) (sx = SPOTS.pump.x), (sz = SPOTS.pump.z);
    const [ax, az] = this.approach(sx, sz);
    const reach = e.kind === 'fire' ? 2.0 : REACH - 0.15;
    const near = Math.hypot(sx - p.x, sz - p.z) < reach;
    if (!near) {
      p.busy = -1;
      this.walkTo(p, ax, az);
      return;
    }
    p.yaw = Math.atan2(sx - p.x, sz - p.z);
    const kind: Ctx['kind'] =
      e.kind === 'fire' ? 'spray' : need === 'tape' ? 'patch' : e.kind === 'door' ? 'door' : e.kind === 'spark' ? 'rewire' : e.kind === 'pressure' ? 'valve' : e.kind === 'gear' ? 'crank' : 'pump';
    if (kind === 'spray' || kind === 'patch' || kind === 'door') {
      this.doHold(p, { kind, label: '', hold: true, target: e.id, x: sx, z: sz, y: e.y }, dt, kind === 'spray' ? 0.7 : 0.6);
    } else {
      if (this.players.some((o) => o !== p && o.busy === e.id)) return;
      p.busy = e.id;
      const mk = kind as MiniKind;
      this.miniAdd(e.id, dt * MINI_RATE[mk] * 0.5, p);
      if (e.done || this.emer(e.id) === undefined) p.busy = -1;
    }
  }

  /* ------------------------------ resumo ------------------------------ */

  crewReport(): { name: string; role: string; bot: boolean; stats: Stats }[] {
    return this.players.map((p) => ({ name: p.name, role: roleName(p.role), bot: p.bot, stats: p.stats }));
  }
}
