/* ============================================================
 *  BICHOS — estado de um bicho vivo no mundo.
 * ============================================================ */
import type { Pose } from './render';
import type { MobDef } from './types';
import type { BossCtl } from './boss';

export type St =
  | 'idle' | 'wander' | 'graze' | 'flee' | 'follow' | 'chase' | 'windup' | 'sleep' | 'ridden' | 'dying'
  | 'stun' | 'charge' | 'fly' | 'land' | 'vanish' | 'boss';

let NEXT = 1;

export class Mob {
  readonly uid = NEXT++;
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  yaw = 0;
  /** velocidade atual no chão (m/s) e desejada */
  spd = 0;
  want = 0;
  hp: number;
  maxHp: number;
  /** multiplicador de dificuldade (monstros) */
  lvl = 1;
  /** variação de tamanho × idade */
  size = 1;
  /** 0.3..1 (filhote → adulto) */
  age = 1;
  st: St = 'idle';
  stT = 0;
  tx = 0;
  tz = 0;
  /** altura alvo (voadores/nadadores) acima do chão/fundo */
  alt = 0;
  homeX = 0;
  homeZ = 0;
  group = 0;
  path: number[] | null = null;
  pathI = 0;
  pathT = 0;
  pathGX = 0;
  pathGZ = 0;
  wantPath = false;
  blocked = 0;
  aiAcc = 0;
  grounded = true;
  /** voando (ignora o chão; segue m.alt) */
  flying = false;
  /** posição controlada por fora (chefe): o gerente não move */
  pinned = false;
  inWater = false;
  /** nasceu numa caverna (usa floorAt perto do seu y) */
  cave = false;
  /** distância até o jogador (atualizada todo quadro) */
  dist = 1e9;
  /** distância até a câmera (para LOD) */
  camD = 1e9;
  pose: Pose;
  // social
  tamed = false;
  love = 0;
  breedCd = 0;
  produceT = 0;
  shearedT = 0;
  name = '';
  // combate
  atkCd = 0;
  aggro = 0;
  alarm = 0;
  hurtT = 0;
  stun = 0;
  phased = false;
  under = false;
  gen = 0;
  dying = 0;
  dead = false;
  /** pulo de ataque em curso */
  leap = false;
  /** guardado pelo chefe dono desta parte */
  boss: BossCtl | null = null;
  /** índice da parte no chefe (cabeças da hidra etc.) */
  part = 0;
  /** não some por distância */
  persistent = false;
  /** livre para a mecânica */
  a = 0;
  b = 0;
  c = 0;

  constructor(
    readonly sp: number,
    readonly def: MobDef,
  ) {
    this.hp = this.maxHp = def.hp;
    this.pose = { cycle: Math.random() * 6, gait: 0, sleep: 0, flash: 0, neck: 0, flap: 0, swim: 0, lunge: 0, ghost: 0, squash: 0, headYaw: 0, seed: Math.random() };
  }

  /** escala de desenho (tamanho × idade) */
  get scale(): number {
    return this.size * (0.45 + 0.55 * this.age);
  }
  get radius(): number {
    return this.def.radius * this.scale;
  }
  get alive(): boolean {
    return !this.dead && this.st !== 'dying';
  }
}
