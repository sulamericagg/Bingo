/* ============================================================
 *  BICHOS DO MUNDO — tipos de dados (definições, regras de nascimento,
 *  plano do corpo para o modelo procedural) e a interface com o motor.
 *  Tudo aqui é "dados": a lógica fica em ai.ts / boss.ts / manager.ts.
 *  Documentação da integração: docs/MUNDO-CRIATURAS.md
 * ============================================================ */

/** ids dos biomas do mundo aberto + pseudo-biomas (água e subsolo) */
export type BiomeId =
  | 'bosque' | 'nevado' | 'tropical' | 'cerejeiras' | 'cogumelos' | 'cristal' | 'savana' | 'pantano' | 'deserto' | 'outono' | 'montanha' | 'bambu'
  | 'oceano' | 'rio' | 'caverna';

export type MobKind = 'animal' | 'monster' | 'boss';
/** onde o bicho vive/anda */
export type Habitat = 'ground' | 'air' | 'water' | 'amphib';
/** temperamento: como reage ao jogador */
export type Temper = 'passive' | 'skittish' | 'neutral' | 'hostile';
/** mecânica especial dos monstros */
export type Mech =
  | 'melee' | 'hop' | 'spit' | 'burrow' | 'swarm' | 'shield' | 'phase' | 'split' | 'charge' | 'blink' | 'freeze' | 'spores' | 'stalk' | 'shy' | 'web';
export type DamageKind = 'melee' | 'ranged' | 'fire' | 'blast' | 'cold' | 'poison';
/** efeitos de status que os bichos aplicam no jogador (o motor decide o que fazem) */
export type Effect = 'slow' | 'sono' | 'gelo' | 'teia' | 'queimando';

export interface Drop {
  id: string;
  min: number;
  max: number;
  /** 0..1 (padrão 1) */
  chance?: number;
}

export interface SpawnRule {
  biomes: BiomeId[];
  /** quando aparece (padrão 'any') */
  time?: 'day' | 'night' | 'any';
  /** tamanho do grupo [mín, máx] */
  group: [number, number];
  /** peso relativo entre as regras que casam no ponto */
  weight: number;
  /** profundidade abaixo da superfície (m) — só para 'caverna' */
  depth?: [number, number];
  /** só depois de N noites */
  minNight?: number;
}

/** Plano do corpo: o modelo low-poly é gerado a partir disto (model.ts). Frente = +Z, chão = y 0. */
export interface BodyPlan {
  /** forma geral */
  form: 'quad' | 'biped' | 'bird' | 'fish' | 'blob' | 'worm' | 'bug' | 'ghost' | 'plant' | 'serpent';
  /** corpo: comprimento (z), altura (y), largura (x) em m (tamanho do adulto) */
  body: [number, number, number];
  col: string;
  /** barriga/peito */
  belly?: string;
  pattern?: 'stripes' | 'spots' | 'band' | 'patch';
  patCol?: string;
  /** altura do centro do corpo acima do chão (padrão = comprimento das pernas + meia altura) */
  bodyY?: number;
  head?: {
    r: number;
    col?: string;
    /** focinho: comprimento relativo ao raio da cabeça */
    snout?: number;
    snoutCol?: string;
    beak?: string;
    ears?: 'round' | 'long' | 'pointy' | 'big' | 'tiny';
    earCol?: string;
    horns?: 'curl' | 'antler' | 'spike' | 'uni' | 'stub';
    hornCol?: string;
    /** tamanho dos olhos (padrão 1) */
    eye?: number;
    /** chapéu de cogumelo / topete / crista */
    cap?: string;
    crest?: string;
    antennae?: string;
    /** bochechas coradas */
    blush?: boolean;
  };
  neck?: { len: number; w: number; tilt?: number };
  legs?: { n: 0 | 2 | 4 | 6 | 8; len: number; w: number; col?: string };
  tail?: { kind: 'thin' | 'fluffy' | 'fin' | 'flat' | 'stinger' | 'puff' | 'fan'; len: number; col?: string };
  wings?: { span: number; col?: string; kind: 'feather' | 'bat' | 'bug' | 'stub' };
  /** cascos/carapaça (tartaruga, caranguejo, besouro) */
  shell?: string;
  humps?: number;
  /** barbatana dorsal / espinhos nas costas */
  dorsal?: string;
  spikes?: string;
  /** cor que brilha (emissiva) — olhos/antenas/barriga dependendo da forma */
  glow?: string;
  /** escudo na frente (guarda de casco) */
  shield?: string;
  /** juba / pelo fofo no pescoço */
  mane?: string;
  /** pinças */
  claws?: string;
  /** botão de flor fechado no topo (cor) */
  bulb?: string;
  /** braços (bípedes grandes: golem) — balançam como as pernas de trás */
  arms?: { len: number; w: number; col?: string };
}

export interface TameInfo {
  /** itens que ele aceita para domar/criar */
  food: string[];
  /** chance por item oferecido (0..1) */
  chance: number;
}
export interface RideInfo {
  speed: number;
  jump: number;
  /** altura do assento (m, adulto) */
  seatY: number;
  /** anda na água / sobe paredões / plana */
  swim?: boolean;
  climb?: boolean;
  glide?: boolean;
}

export interface Attack {
  dmg: number;
  /** alcance (m) */
  reach: number;
  /** recarga (s) */
  cd: number;
  /** aviso antes do golpe (s) — "telegrafado" */
  windup: number;
  kind?: DamageKind;
  effect?: Effect;
  /** projétil: velocidade e cor */
  proj?: { speed: number; col: string; r: number; arc?: boolean };
}

export interface MobDef {
  id: string;
  name: () => string;
  kind: MobKind;
  habitat: Habitat;
  temper: Temper;
  hp: number;
  /** velocidade de passeio e de corrida (m/s) */
  speed: number;
  run: number;
  /** "tamanho" geral para colisão/raio (m) */
  radius: number;
  plan: BodyPlan;
  drops: Drop[];
  spawn: SpawnRule[];
  /** comportamento */
  herd?: boolean;
  flock?: boolean;
  /** dorme à noite (padrão: animais dormem à noite, noturnos de dia) */
  nocturnal?: boolean;
  /** pasta (abaixa o pescoço) */
  graze?: boolean;
  /** come folhas no alto (pescoço para cima) */
  browse?: boolean;
  /** sobe ladeiras íngremes */
  climb?: boolean;
  /** anda pulando */
  hops?: boolean;
  /** cava/esconde-se */
  burrows?: boolean;
  /** altitude de voo (m acima do chão) */
  alt?: [number, number];
  /** distância em que foge/percebe o jogador */
  sense?: number;
  attack?: Attack;
  mech?: Mech;
  tame?: TameInfo;
  ride?: RideInfo;
  /** cria: comida que deixa "apaixonado" */
  breed?: string[];
  /** produtos renováveis */
  milk?: string;
  shear?: string;
  lays?: string;
  /** recompensa (moedas) por derrotar/domar */
  coins?: number;
  /** escala de variação aleatória (± fração) */
  vary?: number;
}

/** Bônus de preparo do jogador (armadura, poções, ferramentas) — o motor fornece. */
export interface PlayerMods {
  /** 0..0.85 — redução de dano geral (armadura) */
  armor: number;
  /** 0..1 — resistência a fogo (poção de brasa) */
  fireRes: number;
  /** 0..1 — resistência a frio */
  coldRes: number;
  /** 0..1 — resistência a veneno/esporos */
  poisonRes: number;
  /** carrega luz (tocha/lanterna) — alguns monstros fogem da luz */
  light: boolean;
  /** furtivo: reduz alcance de percepção (0..1) */
  stealth: number;
}

export interface PlayerView {
  x: number;
  y: number;
  z: number;
  /** direção para onde olha (rad, 0 = +Z, sentido de atan2(x, z)) */
  yaw: number;
  /** está no chão (pula ondas de choque) */
  grounded: boolean;
  alive: boolean;
  /** item na mão (id) — atrai bichos que comem isso */
  held: string | null;
}

/**
 * O que o sistema de bichos precisa do motor. Tudo síncrono e barato:
 * heightAt/floorAt são chamados ~1× por bicho por quadro (perto) ou por tique (longe).
 */
export interface MobHost {
  /** altura do chão (com escavações) */
  heightAt(x: number, z: number): number;
  /** chão andável abaixo de y (cavernas, construções). Opcional: usa heightAt. */
  floorAt?(x: number, y: number, z: number): number;
  /** nível da água em (x,z) ou -Infinity */
  waterLevel(x: number, z: number): number;
  /** id do bioma dominante */
  biomeAt(x: number, z: number): BiomeId;
  /** 0..1 — fração do dia (0 = meia-noite, 0.5 = meio-dia) */
  dayTime(): number;
  /** noites completas desde o começo (escala de dificuldade) */
  nightCount(): number;
  player(): PlayerView;
  /** dano JÁ reduzido por PlayerMods; o motor tira vida, toca som, empurra */
  hurtPlayer(dmg: number, kind: DamageKind, fromX: number, fromZ: number, knock: number): void;
  effect?(e: Effect, seconds: number): void;
  playerMods?(): PlayerMods;
  /** solta itens no chão (ou direto no inventário) */
  drop(id: string, n: number, x: number, y: number, z: number): void;
  coins?(n: number): void;
  sound?(name: MobSound, x: number, y: number, z: number): void;
  shake?(amount: number): void;
  /** prepara a arena de um chefe (aplanar, escavar câmara). Chamado 1× quando o covil chega perto. */
  prepareArena?(lair: Lair): void;
  /** obstáculos sólidos (construções) — opcional */
  blocked?(x: number, z: number, y: number): boolean;
  /** online: os outros jogadores (o anfitrião deixa chefes, projéteis e bichos domados mirarem neles) */
  others?(): PeerView[];
  /** online: dano (ainda SEM armadura — o aparelho dele reduz) num outro jogador */
  hurtPeer?(id: string, dmg: number, kind: DamageKind, fromX: number, fromZ: number, knock: number, effect?: Effect, seconds?: number): void;
}
export interface PeerView extends PlayerView {
  id: string;
}

export type MobSound = 'poof' | 'hit' | 'block' | 'roar' | 'flap' | 'splash' | 'spit' | 'tame' | 'love' | 'slam' | 'fire' | 'pop' | 'chirp' | 'burrow';

export interface Lair {
  key: string;
  boss: string;
  x: number;
  y: number;
  z: number;
  r: number;
}

/** níveis de qualidade (core/quality Tier 0..3) */
export interface MobBudget {
  animals: number;
  monsters: number;
  /** até onde usa o modelo 3D (m) */
  near: number;
  /** até onde desenha impostor (m) */
  far: number;
  /** some além disto (m) */
  despawn: number;
  fx: number;
  /** caminhos A* por quadro */
  paths: number;
}
export const BUDGETS: MobBudget[] = [
  { animals: 22, monsters: 8, near: 26, far: 70, despawn: 92, fx: 120, paths: 1 },
  { animals: 36, monsters: 12, near: 34, far: 95, despawn: 112, fx: 220, paths: 2 },
  { animals: 64, monsters: 18, near: 46, far: 125, despawn: 140, fx: 400, paths: 3 },
  { animals: 110, monsters: 28, near: 62, far: 165, despawn: 175, fx: 640, paths: 4 },
];
