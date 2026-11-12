/* ============================================================
 *  BLOOP STUDIO — FORMATO DE CRIAÇÕES (contrato compartilhado)
 *
 *  Este arquivo é o CONTRATO entre o Bloop Studio, o estúdio de machinima
 *  (src/cinema) e o futuro servidor da loja. Mantenha-o ESTÁVEL:
 *   - sem dependências (nem three, nem DOM obrigatório) — roda no Worker/servidor;
 *   - mudanças só ADITIVAS (campos opcionais novos); mudança incompatível = FORMAT_VERSION + migrate();
 *   - documentação completa em docs/STUDIO-FORMATO.md.
 *
 *  Unidades: metros e graus. Eixos: +Y para cima; a "frente" de veículos é −Z
 *  do assento (part.role 'seat'). Rotação: Euler XYZ em graus.
 * ============================================================ */

/** v1: peças, juntas, fichas. v2: + `scripts` (Blocos de lógica), + `game` (Jogo da Comunidade), + papel 'collect'.
 *  v3: + `terrain` (relevo esculpido + água), + `gen` (mundo infinito personalizado), + `mission` (objetivos), + papel 'enemy'.
 *  v4 (Bloop Engine, só aditivo): + `levels` (fases), `vars` (variáveis declaradas), `anims` (animações de peças),
 *  `npcs`, `cutscenes`, `story` (Historinha), `game.modes/intro/cover/hud/controls`, novos eventos e blocos.
 *  Leitores antigos ignoram os campos novos e jogam só a fase 1 (a raiz). docs/STUDIO-FORMATO.md §v4. */
export const FORMAT_VERSION = 4;

export type Vec3 = [number, number, number];
export type CreationKind = 'object' | 'vehicle' | 'map';
export type WorldKind = 'infinite' | 'flat' | 'void';

/** Primitivas (todas cabem num cubo 1×1×1 centrado na origem antes da escala `s`). */
export const PRIMS = ['box', 'sphere', 'cylinder', 'cone', 'wedge', 'torus', 'capsule', 'ramp', 'arch', 'pipe'] as const;
export type PrimType = (typeof PRIMS)[number];

/** Acabamentos do material. */
export const FINISHES = ['plastic', 'metal', 'glass', 'wood', 'neon', 'rubber'] as const;
export type Finish = (typeof FINISHES)[number];

/** Papel especial de uma peça na hora de JOGAR. */
export const ROLES = ['seat', 'wheel', 'thruster', 'spawn', 'checkpoint', 'goal', 'button', 'zone', 'light', 'hazard', 'collect', 'enemy'] as const;
export type PartRole = (typeof ROLES)[number];

/** Física por peça: 'static' (padrão, parada e sólida), 'dynamic' (cai/empurra), 'none' (só visual, atravessável). */
export type PhysMode = 'static' | 'dynamic' | 'none';

export interface Material {
  /** cor '#rrggbb' */
  c: string;
  /** acabamento */
  k: Finish;
}

interface PartBase {
  /** id inteiro, único dentro da criação (>= 1) */
  id: number;
  /** posição (m) */
  p: Vec3;
  /** rotação Euler XYZ (graus). Padrão [0,0,0] */
  r?: Vec3;
  /** escala = tamanho em metros para primitivas; multiplicador para traços e criações importadas. Padrão [1,1,1] */
  s?: Vec3;
  /** índice em Creation.materials. Padrão 0 */
  m?: number;
  /** grupo (peças com o mesmo g se movem/selecionam juntas e viram um só corpo físico) */
  g?: number;
  /** camada (0..7) — só organização no editor */
  layer?: number;
  phys?: PhysMode;
  role?: PartRole;
  /** nome curto opcional (lista de camadas) */
  name?: string;
  /** escondida na hora de jogar (ex.: molde para a ficha "criar") */
  hide?: boolean;
}

export interface PrimPart extends PartBase {
  t: PrimType;
}

/** Traço da "Caneta 3D": tubo que passa pelos pontos (coordenadas locais). */
export interface StrokePart extends PartBase {
  t: 'stroke';
  /** pontos achatados [x,y,z, x,y,z, ...] relativos a `p` (2..MAX_STROKE_POINTS pontos) */
  pts: number[];
  /** raio do tubo (m) */
  w: number;
}

/** Outra criação importada (da biblioteca ou da loja), referenciada pelo id. */
export interface RefPart extends PartBase {
  t: 'ref';
  /** id da criação importada */
  ref: string;
  /** hash da versão usada (opcional; para detectar atualização) */
  h?: string;
}

export type Part = PrimPart | StrokePart | RefPart;

export type JointKind = 'hinge' | 'slider' | 'fixed';
export interface Motor {
  /** velocidade: rad/s (dobradiça) ou m/s (trilho) */
  speed: number;
  /** força/torque máximo */
  force?: number;
  /** começa ligado na hora de jogar (padrão true). Fichas podem ligar/desligar. */
  on?: boolean;
}
export interface Joint {
  id: number;
  k: JointKind;
  /** peça A */
  a: number;
  /** peça B (0 = preso ao mundo) */
  b: number;
  /** pivô no espaço da criação */
  at: Vec3;
  /** eixo (dobradiça: eixo de giro; trilho: direção do deslize) */
  axis?: Vec3;
  /** limites: graus (dobradiça) ou metros (trilho) */
  lim?: [number, number];
  motor?: Motor;
}

/* ---------------------------- lógica ("fichas") ---------------------------- */

export type TriggerKind = 'button' | 'zone' | 'timer' | 'start';
export interface Trigger {
  k: TriggerKind;
  /** peça do botão / zona */
  part?: number;
  /** segundos (timer) */
  sec?: number;
}
export type ActionKind = 'door' | 'move' | 'light' | 'teleport' | 'spawn' | 'sound' | 'score' | 'motor' | 'win';
export const SOUNDS = ['ding', 'pop', 'boing', 'whoosh', 'fanfare', 'boom'] as const;
export type SoundId = (typeof SOUNDS)[number];
export interface Action {
  k: ActionKind;
  /** peça alvo (door/move/light/teleport/spawn) */
  part?: number;
  /** junta alvo (motor) */
  joint?: number;
  /** deslocamento (move) */
  d?: Vec3;
  /** pontos (score) */
  n?: number;
  /** som */
  snd?: SoundId;
}
export interface LogicRule {
  id: number;
  on: Trigger;
  do: Action[];
}

/* ------------------- Blocos de lógica (v2, scripts) -------------------
 * Programação em blocos empilhados, SEM código do usuário (nada de eval):
 * um interpretador determinístico com limite de passos por quadro roda isso.
 * `part` ausente nos blocos = "esta peça" (a que disparou o evento). */

/** v2: start…message. v4 (acrescentados no FIM): action, join, level, cutend, var, tag, defeat, timeup, talk. */
export const SCRIPT_EVENTS = ['start', 'touch', 'zone', 'every', 'collect', 'die', 'button', 'message', 'action', 'join', 'level', 'cutend', 'var', 'tag', 'defeat', 'timeup', 'talk'] as const;
export type ScriptEventKind = (typeof SCRIPT_EVENTS)[number];
export interface ScriptEvent {
  k: ScriptEventKind;
  /** peça (touch/zone/collect/button); collect sem peça = qualquer coletável */
  part?: number;
  /** segundos (every) */
  sec?: number;
  /** nome da mensagem (message) */
  msg?: string;
  /** v4 `action`: botão de ação 'a' (padrão; tela / E / gamepad A) ou 'b' (F / gamepad B) */
  key?: 'a' | 'b';
  /** v4 `cutend`: id da cena (ausente = qualquer cena) */
  id?: string;
  /** v4 `var`: nome da variável observada */
  v?: string;
  /** v4 `talk`: id do NPC (da mesma fase) */
  npc?: string;
}

/** Leituras do jogo em expressões. v4 acrescenta: it (1 se eu sou o pegador), level (nº da fase, 1..), alive (jogadores vivos). */
export const EXPR_QUERIES = ['score', 'time', 'lives', 'team', 'players', 'it', 'level', 'alive'] as const;
export type ExprQuery = (typeof EXPR_QUERIES)[number];

/** Expressão numérica: número, variável, conta ou leitura do jogo. */
export type Expr = number | { v: string } | { op: '+' | '-' | '*' | '/' | 'rand' | 'min' | 'max'; a: Expr; b: Expr } | { q: ExprQuery };
export interface Cond {
  op: '<' | '>' | '=' | '!=' | '<=' | '>=';
  a: Expr;
  b: Expr;
}

export type Block =
  | { k: 'move'; part?: number; d: Vec3; t?: number }
  | { k: 'rotate'; part?: number; r: Vec3; t?: number }
  | { k: 'teleport'; part: number }
  | { k: 'spawn'; part: number }
  | { k: 'destroy'; part?: number }
  | { k: 'sound'; snd: SoundId }
  | { k: 'say'; text: string }
  | { k: 'score'; n: Expr }
  | { k: 'color'; part?: number; c: string }
  | { k: 'force'; part?: number; d: Vec3 }
  | { k: 'door'; part: number }
  | { k: 'light'; part: number }
  | { k: 'motor'; joint: number }
  | { k: 'checkpoint'; part?: number }
  | { k: 'set'; v: string; e: Expr }
  | { k: 'change'; v: string; e: Expr }
  | { k: 'if'; c: Cond; then: Block[]; else?: Block[] }
  | { k: 'repeat'; n: Expr; body: Block[] }
  | { k: 'wait'; sec: Expr }
  | { k: 'team'; team: 0 | 1 | 2 }
  | { k: 'lives'; n: Expr }
  | { k: 'match'; on: 'start' | 'win' | 'lose' }
  | { k: 'send'; msg: string }
  /* ---- v4 (Bloop Engine) ---- */
  /** vai para a fase `to` (id de Level, ROOT_LEVEL ou 'next') */
  | { k: 'level'; to: string }
  /** toca a cena `id` e ESPERA ela acabar (ou ser pulada) */
  | { k: 'cutscene'; id: string }
  /** mostra falas (≤ LIMITS.dialogLines) e ESPERA; escolhas mudam variáveis / mandam mensagens */
  | { k: 'dialog'; lines: DialogLine[] }
  /** liga/desliga uma animação de peça (PartAnim.id da mesma fase) */
  | { k: 'anim'; id: string; on: 'play' | 'stop' }
  | { k: 'show'; part?: number }
  | { k: 'hide'; part?: number }
  /** câmera: tremer, focar numa peça, voltar ao normal */
  | { k: 'camera'; cam: CameraAct; part?: number }
  /** NPC da mesma fase: andar (pelo caminho ou até a peça), parar, virar para a peça */
  | { k: 'npc'; id: string; act: NpcAct; part?: number }
  /** pega-pega: quem vira o pegador */
  | { k: 'it'; who: 'me' | 'toucher' | 'random' }
  /** faixa de texto no alto da tela */
  | { k: 'hud'; text: string }
  /** checkpoint da Historinha (salva variáveis persistentes + passo) */
  | { k: 'save' }
  /** pose/emote do avatar do jogador */
  | { k: 'emote'; pose: PoseId };
export type BlockKind = Block['k'];
export const BLOCK_KINDS: BlockKind[] = ['move', 'rotate', 'teleport', 'spawn', 'destroy', 'sound', 'say', 'score', 'color', 'force', 'door', 'light', 'motor', 'checkpoint', 'set', 'change', 'if', 'repeat', 'wait', 'team', 'lives', 'match', 'send', 'level', 'cutscene', 'dialog', 'anim', 'show', 'hide', 'camera', 'npc', 'it', 'hud', 'save', 'emote'];
/** blocos que existiam até a v3 (paleta antiga / leitores antigos) */
export const BLOCK_KINDS_V3: BlockKind[] = BLOCK_KINDS.slice(0, 23);
export const CAMERA_ACTS = ['shake', 'focus', 'reset'] as const;
export type CameraAct = (typeof CAMERA_ACTS)[number];
export const NPC_ACTS = ['walk', 'stop', 'face'] as const;
export type NpcAct = (typeof NPC_ACTS)[number];

export interface Script {
  id: number;
  name?: string;
  on: ScriptEvent;
  body: Block[];
}

/** Metadados de um mapa publicado como JOGO (Jogos da Comunidade). */
export interface GameMeta {
  title: string;
  desc: string;
  tags: string[];
  /** 1..16 (legado v2/v3; salas online da v4 usam `modes.online.max`, teto LIMITS.onlineMax = 8) */
  maxPlayers: number;
  /** v4: modos oferecidos (ausente = só solo) */
  modes?: GameModes;
  /** v4: id da cena de abertura (pulável) tocada ao começar */
  intro?: string;
  /** v4: capa = thumbs[0] da listagem (sempre 0; reservado) */
  cover?: 0;
  /** v4: variáveis mostradas no HUD com ícone (≤ LIMITS.hudVars; nomes de `Creation.vars`) */
  hud?: { vars: string[] };
  /** v4: quais botões existem na tela (ícones de GAME_ICONS) */
  controls?: GameControls;
}

/* ============================ v4: Bloop Engine ============================ */

/** id da fase 1 (a raiz da criação) quando referenciada por `Level.next`, blocos `level`, StoryFlow etc. */
export const ROOT_LEVEL = 'main';

/* Tipos de cinema (cópia literal de src/cinema/format.ts — este arquivo não pode importar nada;
 * a igualdade é conferida em tempo de compilação em src/studio/play/hooks.ts). */
export const EASES = ['linear', 'in', 'out', 'inout', 'back', 'bounce', 'step'] as const;
export type Ease = (typeof EASES)[number];
export const POSES = ['stand', 'walk', 'run', 'wave', 'point', 'sit', 'jump', 'dance', 'lie', 'hug', 'facepalm', 'think', 'cheer', 'shrug', 'bow', 'clap', 'scared', 'spin', 'flex', 'sneak'] as const;
export type PoseId = (typeof POSES)[number];
export const EXPRS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'sleepy', 'love', 'laughing', 'crying', 'thinking', 'scared', 'smug', 'wink', 'dizzy', 'shy', 'confused'] as const;
export type ExprId = (typeof EXPRS)[number];
export const BUBBLE_STYLES = ['speech', 'shout', 'think', 'whisper', 'subtitle', 'narration'] as const;
export type BubbleStyle = (typeof BUBBLE_STYLES)[number];
export const FX_KINDS = ['shake', 'sparkles', 'rain', 'hearts', 'sweat', 'zoomlines', 'confetti', 'snow', 'flash', 'poof', 'anger', 'notes', 'stars'] as const;
export type FxKind = (typeof FX_KINDS)[number];

/** Ícones que o JOGO pode usar (HUD de variáveis, botões de ação). Todos existem em src/studio/ui/sicons.ts. */
export const GAME_ICONS = ['coin', 'heartl', 'star', 'gem', 'timer', 'flag', 'key', 'sword', 'trophy', 'bolt', 'apple', 'fish', 'ball', 'tap', 'hand', 'chat', 'tag', 'race', 'levels', 'skull', 'shield', 'jump'] as const;
export type GameIconId = (typeof GAME_ICONS)[number];

export const ONLINE_GOALS = ['free', 'coop', 'race', 'collect', 'survive', 'tag', 'push'] as const;
export type OnlineGoal = (typeof ONLINE_GOALS)[number];
export interface OnlineMode {
  /** jogadores mínimos para começar sozinho (1..max) */
  min: number;
  /** 2..LIMITS.onlineMax (8 na v1) */
  max: number;
  /** 0 = sem times; 2 = vermelho × azul */
  teams?: 0 | 2;
  pvp?: boolean;
  goal?: OnlineGoal;
}
export interface GameModes {
  /** padrão true */
  solo?: boolean;
  /** Historinha (exige `Creation.story`) */
  story?: boolean;
  online?: OnlineMode;
}
export interface GameControls {
  action?: GameIconId;
  action2?: GameIconId;
  /** mostra o botão de correr */
  run?: boolean;
}

/** Fase extra (a fase 1 é a própria raiz da Creation). Ids de peça/junta são da fase (cada fase tem os seus). */
export interface Level {
  /** [A-Za-z0-9_-]{1,24}, único, ≠ ROOT_LEVEL */
  id: string;
  /** ≤ LIMITS.levelName */
  name: string;
  parts: Part[];
  joints: Joint[];
  logic: LogicRule[];
  /** ausente = usa os materiais da raiz */
  materials?: Material[];
  scripts?: Script[];
  terrain?: TerrainData;
  worldKind?: WorldKind;
  seed?: number;
  gen?: WorldGenSettings;
  mission?: Mission;
  anims?: PartAnim[];
  npcs?: Npc[];
  /** próxima fase: id de Level ou ROOT_LEVEL; '' = fim do jogo; ausente = a seguinte na lista (a última → fim) */
  next?: string;
}

export type VarScope = 'player' | 'game';
/** Variável declarada. Variáveis só usadas em blocos (não declaradas) continuam valendo, com escopo 'player'. */
export interface VarDef {
  /** mesmo padrão dos nomes de variável dos blocos (≤ 16) */
  name: string;
  init: number;
  /** 'player' = cada jogador tem a sua; 'game' = uma só (online: o anfitrião manda) */
  scope: VarScope;
  /** ícone no HUD (só aparece se estiver em game.hud.vars) */
  hud?: GameIconId;
  /** salva no progresso da Historinha */
  persist?: boolean;
}

export const ANIM_LOOPS = ['once', 'loop', 'pingpong'] as const;
export type AnimLoop = (typeof ANIM_LOOPS)[number];
/** Quadro-chave: deslocamentos RELATIVOS à pose do editor. */
export interface AnimKey {
  /** segundos desde o início (0..LIMITS.animDur), em ordem crescente */
  t: number;
  /** deslocamento (m) */
  p?: Vec3;
  /** rotação extra (graus) */
  r?: Vec3;
  /** multiplicador de escala */
  s?: Vec3;
  /** suavização até ESTE quadro */
  ease?: Ease;
}
/** Animação de uma peça (`part`) OU de um grupo (`g`) — exatamente um dos dois. */
export interface PartAnim {
  id: string;
  name?: string;
  part?: number;
  g?: number;
  loop: AnimLoop;
  /** começa sozinha ao iniciar a fase */
  auto?: boolean;
  /** 1..LIMITS.animKeys */
  keys: AnimKey[];
}

export const NPC_ROLES = ['friend', 'shop', 'enemy'] as const;
export type NpcRole = (typeof NPC_ROLES)[number];
/** Estrutura igual a AvatarData (src/game/avatar.ts), sem depender dele. */
export interface NpcAvatar {
  parts: Record<string, string>;
  colors: { primary: string; secondary: string };
}
export interface NpcLook {
  /** skin/visual pronto (id) */
  skin?: string;
  avatar?: NpcAvatar;
  /** bichinho da coleção (id) */
  creature?: string;
}
export interface Npc {
  /** único no JOGO todo (falas citam NPCs de qualquer fase) */
  id: string;
  /** ≤ LIMITS.npcName */
  name: string;
  look: NpcLook;
  at: Vec3;
  /** graus */
  yaw: number;
  /** caminho (≤ LIMITS.npcPath pontos, posições absolutas da fase) */
  path?: Vec3[];
  /** m/s (0,2..8) */
  speed?: number;
  /** falas ao tocar no NPC */
  talk?: DialogLine[];
  role?: NpcRole;
}

export interface DialogChoice {
  /** ≤ LIMITS.choiceText */
  text: string;
  /** muda uma variável ao escolher */
  set?: { v: string; e: Expr };
  /** manda a mensagem (evento `message`) ao escolher */
  go?: string;
}
export interface DialogLine {
  /** id de NPC, 'player' ou ausente (narrador) */
  who?: string;
  /** ≤ LIMITS.dialogText (filtrado no app e de novo no servidor) */
  text: string;
  /** ≤ LIMITS.choices */
  choices?: DialogChoice[];
}

/** Para onde a câmera olha: ponto do mundo, um NPC ou uma peça da fase da cena. */
export type CamLook = Vec3 | { npc: string } | { part: number };
export interface CutCamKey {
  t: number;
  p: Vec3;
  look: CamLook;
  /** 20..120 */
  fov?: number;
  ease?: Ease;
}
export interface CutActorKey {
  t: number;
  p: Vec3;
  /** graus */
  yaw?: number;
  pose?: PoseId;
  expr?: ExprId;
  ease?: Ease;
}
export interface CutActor {
  /** 'player' | id de NPC | `part:<id da peça>` */
  who: string;
  keys: CutActorKey[];
}
export interface CutSub {
  t: number;
  /** fim (s); ausente = até a próxima legenda */
  end?: number;
  /** id de NPC, 'player' ou ausente (narrador) */
  who?: string;
  text: string;
  style?: BubbleStyle;
}
/** Cena no mundo (metros), tocada sobre a fase viva. Sempre pulável. */
export interface Cutscene {
  id: string;
  name: string;
  /** 1..LIMITS.cutDur segundos */
  dur: number;
  /** fase onde a cena acontece (peças citadas são dessa fase); ausente = fase 1 */
  level?: string;
  /** sempre true (o validador força) */
  skippable: true;
  cam: CutCamKey[];
  actors: CutActor[];
  subs: CutSub[];
  sfx?: { t: number; snd: SoundId }[];
  fx?: { t: number; kind: FxKind; dur: number }[];
  /** tema musical (id do player de música) */
  music?: string;
  title?: { text: string; at: number };
  /** projeto do Bloop Cinema de onde veio (só informação) */
  from?: string;
}

export type StoryStep = { k: 'cut'; id: string } | { k: 'level'; id: string } | { k: 'end'; text?: string };
/** Ordem da Historinha (≤ LIMITS.storySteps passos). */
export interface StoryFlow {
  steps: StoryStep[];
}

/* ---------------------------- v3: terreno ---------------------------- */

/** materiais do chão esculpido (índice = valor no mapa de materiais) */
export const TERRAIN_MATS = ['grass', 'sand', 'snow', 'rock', 'dirt', 'water'] as const;
export type TerrainMat = (typeof TERRAIN_MATS)[number];

/** corpo d'água retangular: superfície na altura `y`, centro (x,z), tamanho w×d (m) */
export interface WaterBody {
  x: number;
  z: number;
  w: number;
  d: number;
  y: number;
}

/**
 * Relevo esculpido (mapas no mundo Plano). Grade quadrada de n×n VÉRTICES centrada na origem,
 * `cell` metros entre vértices. Fora da grade o chão continua plano em y=0.
 *  - `h`: base64 de Int16 little-endian, n×n alturas em CENTÍMETROS (linha a linha, z crescente, x crescente);
 *  - `m`: base64 de Uint8, n×n índices de TERRAIN_MATS (omitido = tudo grama);
 *  - `wy`: altura da superfície da água nos vértices pintados com 'water' (padrão −0,3);
 *  - `water`: lagos/rios retangulares extras.
 */
export interface TerrainData {
  n: number;
  cell: number;
  h: string;
  m?: string;
  wy?: number;
  water?: WaterBody[];
}

/* -------------------------- v3: mundo personalizado -------------------------- */

export const BIOME_IDS = ['campo', 'floresta', 'deserto', 'neve', 'pantano', 'montanhas', 'oceano', 'savana', 'outono', 'cogumelos', 'tropical', 'ilhas'] as const;
export type BiomeId = (typeof BIOME_IDS)[number];
export type WorldPreset = 'normal' | 'flat' | 'islands' | 'flatIslands' | 'floating';

/** Ajustes do mundo Infinito (tudo opcional; ausente = padrão). Multiplicadores 1 = normal. */
export interface WorldGenSettings {
  preset?: WorldPreset;
  /** altura dos morros 0..2 */
  height?: number;
  /** aspereza 0..2 */
  rough?: number;
  /** nível do mar (m) −12..12 */
  sea?: number;
  /** tamanho dos biomas 0,25..4 */
  biomeSize?: number;
  /** peso de cada bioma 0..3 (0 = desligado) */
  biomes?: Partial<Record<BiomeId, number>>;
  /** cavernas (entradas de pedra), minérios (cristais), árvores: 0..2 */
  caves?: number;
  ores?: number;
  trees?: number;
  /** preset 'flat': camadas de baixo para cima (≤ 8), espessura em m */
  layers?: { k: TerrainMat; n: number }[];
}

/* ---------------------------- v3: missão ---------------------------- */

export const OBJECTIVES = ['reach', 'collect', 'defeat', 'survive', 'drive'] as const;
export type ObjectiveKind = (typeof OBJECTIVES)[number];
/** reach: chegar à peça `part` (ou a qualquer chegada) · collect: coletar `n` · defeat: derrotar `n` inimigos ·
 *  survive: sobreviver `sec` segundos · drive: chegar pilotando um veículo à peça `part` (ou chegada) */
export interface Objective {
  k: ObjectiveKind;
  n?: number;
  sec?: number;
  part?: number;
}
export interface Mission {
  objectives: Objective[];
  /** 'all' (qualquer ordem, padrão) ou 'seq' (um depois do outro) */
  order?: 'all' | 'seq';
  /** vidas (0 = infinitas) */
  lives?: number;
  /** tempo limite em s (0 = sem) */
  time?: number;
  /** textos das telas de vitória/derrota (≤ 60) */
  win?: string;
  lose?: string;
}

export interface Creation {
  /** versão do formato */
  v: number;
  /** id estável (ex.: 'c_k3x9…'); a loja usa o mesmo id */
  id: string;
  kind: CreationKind;
  name: string;
  /** nome exibido do autor (apelido) */
  author: string;
  /** id do autor (handle ou id local) — usado por "Ocultar autor" */
  authorId?: string;
  parts: Part[];
  joints: Joint[];
  logic: LogicRule[];
  materials: Material[];
  /** miniatura (data URL image/webp ou image/jpeg, ≤ MAX_THUMB_BYTES) */
  thumbnail?: string;
  /** mundo (mapas; objetos/veículos usam como sugestão para "Jogar") */
  worldKind?: WorldKind;
  /** semente do mundo infinito */
  seed?: number;
  /** criação de onde esta foi copiada (remix) */
  from?: string;
  /** v2: blocos de lógica */
  scripts?: Script[];
  /** v2: metadados de jogo (mapas publicados como Jogo da Comunidade) */
  game?: GameMeta;
  /** v3: relevo esculpido (mundo Plano) */
  terrain?: TerrainData;
  /** v3: ajustes do mundo Infinito */
  gen?: WorldGenSettings;
  /** v3: objetivos da partida */
  mission?: Mission;
  /** criações importadas embutidas (para o mapa abrir sem rede). Só 1 nível: deps não têm deps. */
  deps?: Creation[];
  /** v4: fases extras (a raiz é a fase 1, id ROOT_LEVEL). Total de fases ≤ LIMITS.levels */
  levels?: Level[];
  /** v4: variáveis declaradas (≤ LIMITS.vars) */
  vars?: VarDef[];
  /** v4: animações de peças da fase 1 (cada Level tem as suas) */
  anims?: PartAnim[];
  /** v4: NPCs da fase 1 */
  npcs?: Npc[];
  /** v4: cenas (compartilhadas entre as fases) */
  cutscenes?: Cutscene[];
  /** v4: ordem da Historinha */
  story?: StoryFlow;
  /** ms desde 1970 */
  created?: number;
  updated?: number;
}

/* ------------------------------- limites ------------------------------- */

export const LIMITS = {
  /** teto absoluto do formato (o editor aplica limites menores por qualidade/assinatura) */
  parts: 2000,
  joints: 64,
  logic: 64,
  actionsPerRule: 6,
  materials: 32,
  strokePoints: 256,
  deps: 24,
  nameLen: 32,
  /** distância máxima da origem (m) */
  extent: 2000,
  /** tamanho máximo de uma peça (m) */
  maxSize: 200,
  minSize: 0.02,
  /** bytes do JSON (sem compressão) */
  bytes: 512 * 1024,
  thumbBytes: 40 * 1024,
  refDepth: 3,
  /** blocos de lógica */
  scripts: 64,
  blocks: 1024,
  blockDepth: 8,
  vars: 32,
  varLen: 16,
  textLen: 60,
  repeatMax: 1000,
  gameDesc: 200,
  gameTags: 5,
  /** terreno: vértices por lado e tamanho total máximo (m) */
  terrainN: 129,
  terrainSize: 512,
  water: 16,
  objectives: 8,
  /* ---- v4 (Bloop Engine) ---- */
  /** fases no TOTAL, contando a fase 1 (raiz) → `levels[]` tem no máximo 7. Peças somadas de todas ≤ `parts` */
  levels: 8,
  levelName: 24,
  cutscenes: 12,
  /** por fase */
  anims: 32,
  animKeys: 16,
  /** duração máxima de uma animação de peça (s) */
  animDur: 60,
  /** por fase */
  npcs: 16,
  npcName: 16,
  npcPath: 8,
  dialogLines: 6,
  dialogText: 80,
  choices: 3,
  choiceText: 24,
  cutDur: 90,
  cutCam: 24,
  cutActors: 6,
  cutActorKeys: 24,
  cutSubs: 24,
  cutSfx: 24,
  cutFx: 12,
  cutTitle: 40,
  storySteps: 24,
  hudVars: 4,
  /** jogadores numa sala online (v1: WorldRoom MUNDO_MAX) */
  onlineMax: 8,
  /** bytes do JSON de um JOGO v4 (com fases/cenas/NPCs…) = UGC.maxGameBytes */
  gameBytes: 1024 * 1024,
} as const;

/* -------------------------------- criação -------------------------------- */

export const DEFAULT_MATERIALS: Material[] = [
  { c: '#ff5cc8', k: 'plastic' },
  { c: '#5ec8ff', k: 'plastic' },
  { c: '#ffd34a', k: 'plastic' },
  { c: '#4fd67a', k: 'plastic' },
  { c: '#f4efff', k: 'plastic' },
  { c: '#3a2a5a', k: 'rubber' },
  { c: '#c8ccd8', k: 'metal' },
  { c: '#a8742e', k: 'wood' },
  { c: '#9fe8ff', k: 'glass' },
  { c: '#7aff6a', k: 'neon' },
];

export function newId(prefix = 'c'): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

export function emptyCreation(kind: CreationKind, name: string, author = '', authorId?: string): Creation {
  const now = Date.now();
  return {
    v: FORMAT_VERSION,
    id: newId(),
    kind,
    name,
    author,
    authorId,
    parts: [],
    joints: [],
    logic: [],
    materials: DEFAULT_MATERIALS.map((m) => ({ ...m })),
    worldKind: kind === 'map' ? 'flat' : undefined,
    created: now,
    updated: now,
  };
}

/** Maior id de peça + 1. */
export function nextPartId(c: Creation): number {
  let m = 0;
  for (const p of c.parts) if (p.id > m) m = p.id;
  return m + 1;
}

/* ------------------------------ validação ------------------------------ */

export interface ValidateResult {
  ok: boolean;
  /** problemas encontrados (peças inválidas são removidas; números são limitados) */
  errors: string[];
  /** cópia saneada (null se irrecuperável) */
  creation: Creation | null;
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const HEX = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function vec(x: unknown, lim: number, def: Vec3 | null): Vec3 | null {
  if (!Array.isArray(x) || x.length !== 3 || !x.every(isNum)) return def;
  return [clamp(x[0], -lim, lim), clamp(x[1], -lim, lim), clamp(x[2], -lim, lim)];
}

function str(x: unknown, max: number): string {
  return typeof x === 'string' ? x.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max) : '';
}

/**
 * Confere e saneia uma criação vinda de qualquer lugar (arquivo, loja, rede).
 * Nunca lança. `ok` = false se havia algo errado (mesmo que a cópia saneada seja usável).
 */
export function validate(input: unknown, depth = 0): ValidateResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') return { ok: false, errors: ['not-object'], creation: null };
  const o = input as Record<string, unknown>;
  const v = isNum(o.v) ? o.v : 0; // v1 continua válido (v2 só acrescenta campos)
  if (v < 1 || v > FORMAT_VERSION) errors.push('version');
  const id = typeof o.id === 'string' && ID_RE.test(o.id) ? o.id : '';
  if (!id) return { ok: false, errors: ['id'], creation: null };
  const kind: CreationKind = o.kind === 'vehicle' || o.kind === 'map' ? o.kind : 'object';
  if (o.kind !== kind) errors.push('kind');

  const materials = sanitizeMaterials(o.materials, errors) ?? DEFAULT_MATERIALS.map((m) => ({ ...m }));
  const body = sanitizeBody(o, materials, errors, LIMITS.parts, id);
  const { parts, joints, logic, ids, jids } = body;

  // os blocos são validados no fim (precisam das fases/cenas/NPCs da v4), mas os erros
  // entram nesta posição — a lista de erros de uma criação v1–v3 fica igual à de antes.
  const scriptsAt = errors.length;

  const c: Creation = {
    v: FORMAT_VERSION,
    id,
    kind,
    name: str(o.name, LIMITS.nameLen) || '?',
    author: str(o.author, 24),
    parts,
    joints,
    logic,
    materials,
  };
  const aid = str(o.authorId, 64);
  if (aid) c.authorId = aid;
  if (typeof o.thumbnail === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(o.thumbnail) && o.thumbnail.length <= LIMITS.thumbBytes * 1.4) c.thumbnail = o.thumbnail;
  const wk = worldKindOf(o.worldKind);
  if (wk) c.worldKind = wk;
  if (isNum(o.seed)) c.seed = Math.floor(o.seed) | 0;
  if (typeof o.from === 'string' && ID_RE.test(o.from)) c.from = o.from;
  if (isNum(o.created)) c.created = o.created;
  if (isNum(o.updated)) c.updated = o.updated;
  const gm = o.game as Record<string, unknown> | undefined;
  if (gm && typeof gm === 'object') {
    const title = str(gm.title, LIMITS.nameLen);
    if (title)
      c.game = {
        title,
        desc: str(gm.desc, LIMITS.gameDesc),
        tags: Array.isArray(gm.tags) ? gm.tags.map((x) => str(x, 16)).filter(Boolean).slice(0, LIMITS.gameTags) : [],
        maxPlayers: isNum(gm.maxPlayers) ? clamp(Math.round(gm.maxPlayers), 1, 16) : 1,
      };
  }
  const tr = sanitizeTerrain(o.terrain, errors);
  if (tr) c.terrain = tr;
  const gen = sanitizeGen(o.gen);
  if (gen) c.gen = gen;
  const mi = sanitizeMission(o.mission, ids);
  if (mi) c.mission = mi;
  if (Array.isArray(o.deps) && depth === 0) {
    const deps: Creation[] = [];
    for (const d of o.deps.slice(0, LIMITS.deps)) {
      const r = validate(d, depth + 1);
      if (r.creation && r.creation.id !== id) {
        delete r.creation.deps;
        deps.push(r.creation);
      } else errors.push('dep');
    }
    if (deps.length) c.deps = deps;
  }

  // v4 (Bloop Engine): só na criação principal — dependências importadas não carregam jogo.
  const scriptErrors: string[] = [];
  if (depth === 0) {
    const root: LevelScope = { id: ROOT_LEVEL, ids, jids, groups: groupsOf(parts), anims: new Set(), npcs: new Set() };
    sanitizeEngine(o, c, root, body.count, scriptErrors, errors);
  } else {
    const scripts = sanitizeScripts(o.scripts, ids, jids, scriptErrors);
    if (scripts.length) c.scripts = scripts;
  }
  errors.splice(scriptsAt, 0, ...scriptErrors);
  if (jsonBytes(c) > (hasEngine(c) ? LIMITS.gameBytes : LIMITS.bytes)) errors.push('bytes');
  return { ok: errors.length === 0, errors, creation: c };
}

const worldKindOf = (x: unknown): WorldKind | null => (x === 'infinite' || x === 'flat' || x === 'void' ? x : null);

function sanitizeMaterials(raw: unknown, errors: string[]): Material[] | null {
  const materials: Material[] = [];
  if (Array.isArray(raw))
    for (const m of raw.slice(0, LIMITS.materials)) {
      const mm = m as Partial<Material>;
      const c = typeof mm?.c === 'string' && HEX.test(mm.c) ? mm.c.toLowerCase() : null;
      const k = (FINISHES as readonly string[]).includes(mm?.k as string) ? (mm.k as Finish) : 'plastic';
      if (!c) errors.push('material');
      materials.push({ c: c ?? '#cccccc', k });
    }
  return materials.length ? materials : null;
}

interface Body {
  parts: Part[];
  joints: Joint[];
  logic: LogicRule[];
  ids: Set<number>;
  jids: Set<number>;
  /** peças aceitas */
  count: number;
}

/** peças, juntas e fichas de uma fase (raiz ou Level). `cap` = peças que ainda cabem. */
function sanitizeBody(o: Record<string, unknown>, materials: Material[], errors: string[], cap: number, selfId = o.id): Body {
  const parts: Part[] = [];
  const ids = new Set<number>();
  const rawParts = Array.isArray(o.parts) ? o.parts : [];
  if (rawParts.length > cap) errors.push('parts-limit');
  for (const raw of rawParts.slice(0, Math.max(0, cap))) {
    const q = raw as Record<string, unknown>;
    if (!q || typeof q !== 'object') {
      errors.push('part');
      continue;
    }
    const pid = isNum(q.id) ? Math.floor(q.id) : 0;
    const p = vec(q.p, LIMITS.extent, null);
    if (pid < 1 || ids.has(pid) || !p) {
      errors.push('part-id');
      continue;
    }
    const base: PartBase = { id: pid, p };
    const r = vec(q.r, 360, null);
    if (r && (r[0] || r[1] || r[2])) base.r = r;
    const sDef: Vec3 = [1, 1, 1];
    const s = vec(q.s, LIMITS.maxSize, sDef)!;
    for (let i = 0; i < 3; i++) if (Math.abs(s[i]) < LIMITS.minSize) s[i] = LIMITS.minSize * Math.sign(s[i] || 1);
    if (s[0] !== 1 || s[1] !== 1 || s[2] !== 1) base.s = s;
    if (isNum(q.m) && q.m > 0) base.m = Math.min(materials.length - 1, Math.floor(q.m));
    if (isNum(q.g) && q.g > 0) base.g = Math.floor(q.g);
    if (isNum(q.layer) && q.layer > 0) base.layer = clamp(Math.floor(q.layer), 0, 7);
    if (q.phys === 'dynamic' || q.phys === 'none') base.phys = q.phys;
    if ((ROLES as readonly string[]).includes(q.role as string)) base.role = q.role as PartRole;
    const nm = str(q.name, LIMITS.nameLen);
    if (nm) base.name = nm;
    if (q.hide === true) base.hide = true;
    if ((PRIMS as readonly string[]).includes(q.t as string)) {
      parts.push({ ...base, t: q.t as PrimType });
    } else if (q.t === 'stroke') {
      const pts = Array.isArray(q.pts) ? (q.pts as unknown[]).filter(isNum).slice(0, LIMITS.strokePoints * 3) : [];
      const n = Math.floor(pts.length / 3) * 3;
      if (n < 6) {
        errors.push('stroke');
        continue;
      }
      const w = isNum(q.w) ? clamp(q.w, 0.01, 2) : 0.05;
      parts.push({ ...base, t: 'stroke', pts: pts.slice(0, n).map((x) => clamp(x, -LIMITS.maxSize, LIMITS.maxSize)), w });
    } else if (q.t === 'ref') {
      const ref = typeof q.ref === 'string' && ID_RE.test(q.ref) ? q.ref : '';
      if (!ref || ref === selfId) {
        errors.push('ref');
        continue;
      }
      const rp: RefPart = { ...base, t: 'ref', ref };
      if (typeof q.h === 'string' && /^[0-9a-f]{1,32}$/.test(q.h)) rp.h = q.h;
      parts.push(rp);
    } else {
      errors.push('part-type');
      continue;
    }
    ids.add(pid);
  }

  const joints: Joint[] = [];
  const jids = new Set<number>();
  if (Array.isArray(o.joints))
    for (const raw of o.joints.slice(0, LIMITS.joints)) {
      const j = raw as Record<string, unknown>;
      const jid = isNum(j?.id) ? Math.floor(j.id) : 0;
      const k = j?.k === 'hinge' || j?.k === 'slider' || j?.k === 'fixed' ? j.k : null;
      const a = isNum(j?.a) ? j.a : -1;
      const b = isNum(j?.b) ? j.b : -1;
      const at = vec(j?.at, LIMITS.extent, null);
      if (jid < 1 || jids.has(jid) || !k || !ids.has(a) || (b !== 0 && !ids.has(b)) || a === b || !at) {
        errors.push('joint');
        continue;
      }
      const jj: Joint = { id: jid, k, a, b, at };
      const axis = vec(j.axis, 1, null);
      if (axis && Math.hypot(...axis) > 1e-3) jj.axis = axis;
      if (Array.isArray(j.lim) && j.lim.length === 2 && j.lim.every(isNum)) jj.lim = [Math.min(j.lim[0], j.lim[1]), Math.max(j.lim[0], j.lim[1])];
      const mo = j.motor as Record<string, unknown> | undefined;
      if (mo && isNum(mo.speed)) jj.motor = { speed: clamp(mo.speed, -50, 50), force: isNum(mo.force) ? clamp(mo.force, 0, 1e5) : undefined, on: mo.on === false ? false : undefined };
      joints.push(jj);
      jids.add(jid);
    }

  const logic: LogicRule[] = [];
  const AK: ActionKind[] = ['door', 'move', 'light', 'teleport', 'spawn', 'sound', 'score', 'motor', 'win'];
  if (Array.isArray(o.logic))
    for (const raw of o.logic.slice(0, LIMITS.logic)) {
      const L = raw as Record<string, unknown>;
      const on = L?.on as Record<string, unknown> | undefined;
      const tk = on?.k;
      if (!isNum(L?.id) || (tk !== 'button' && tk !== 'zone' && tk !== 'timer' && tk !== 'start')) {
        errors.push('logic');
        continue;
      }
      const trig: Trigger = { k: tk };
      if (tk === 'button' || tk === 'zone') {
        if (!isNum(on!.part) || !ids.has(on!.part)) {
          errors.push('logic-part');
          continue;
        }
        trig.part = on!.part;
      }
      if (tk === 'timer') trig.sec = clamp(isNum(on!.sec) ? on!.sec : 3, 0.5, 600);
      const acts: Action[] = [];
      if (Array.isArray(L.do))
        for (const ar of L.do.slice(0, LIMITS.actionsPerRule)) {
          const a = ar as Record<string, unknown>;
          if (!AK.includes(a?.k as ActionKind)) continue;
          const act: Action = { k: a.k as ActionKind };
          if (isNum(a.part) && ids.has(a.part)) act.part = a.part;
          if (isNum(a.joint) && jids.has(a.joint)) act.joint = a.joint;
          const d = vec(a.d, 100, null);
          if (d) act.d = d;
          if (isNum(a.n)) act.n = clamp(Math.round(a.n), -1000, 1000);
          if ((SOUNDS as readonly string[]).includes(a.snd as string)) act.snd = a.snd as SoundId;
          const needsPart = act.k === 'door' || act.k === 'move' || act.k === 'light' || act.k === 'teleport' || act.k === 'spawn';
          if ((needsPart && act.part == null) || (act.k === 'motor' && act.joint == null)) continue;
          acts.push(act);
        }
      if (!acts.length) {
        errors.push('logic-empty');
        continue;
      }
      logic.push({ id: Math.floor(L.id as number), on: trig, do: acts });
    }
  return { parts, joints, logic, ids, jids, count: parts.length };
}

/* ------------------------- validação v3 ------------------------- */

/** base64 ↔ bytes (sem DOM; btoa/atob existem no navegador, Worker e Node ≥ 16) */
export function bytesToB64(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64ToBytes(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
/** alturas (m) → TerrainData.h */
export function encodeHeights(h: Float32Array): string {
  const b = new Uint8Array(h.length * 2);
  const dv = new DataView(b.buffer);
  for (let i = 0; i < h.length; i++) dv.setInt16(i * 2, clamp(Math.round(h[i] * 100), -32768, 32767), true);
  return bytesToB64(b);
}
export function decodeHeights(s: string, count: number): Float32Array | null {
  const b = b64ToBytes(s);
  if (!b || b.length !== count * 2) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) out[i] = dv.getInt16(i * 2, true) / 100;
  return out;
}

function sanitizeTerrain(x: unknown, errors: string[]): TerrainData | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const n = isNum(o.n) ? Math.round(o.n) : 0;
  const cell = isNum(o.cell) ? clamp(o.cell, 0.25, 8) : 0;
  if (n < 9 || n > LIMITS.terrainN || !cell || (n - 1) * cell > LIMITS.terrainSize || typeof o.h !== 'string' || !decodeHeights(o.h, n * n)) {
    errors.push('terrain');
    return null;
  }
  const t: TerrainData = { n, cell, h: o.h };
  if (typeof o.m === 'string') {
    const m = b64ToBytes(o.m);
    if (m && m.length === n * n) {
      for (let i = 0; i < m.length; i++) if (m[i] >= TERRAIN_MATS.length) m[i] = 0;
      t.m = bytesToB64(m);
    }
  }
  if (isNum(o.wy)) t.wy = clamp(o.wy, -50, 100);
  if (Array.isArray(o.water)) {
    const w: WaterBody[] = [];
    for (const q of o.water.slice(0, LIMITS.water)) {
      const b = q as Record<string, unknown>;
      if (![b.x, b.z, b.w, b.d, b.y].every(isNum)) continue;
      w.push({ x: clamp(b.x as number, -LIMITS.extent, LIMITS.extent), z: clamp(b.z as number, -LIMITS.extent, LIMITS.extent), w: clamp(b.w as number, 0.5, 400), d: clamp(b.d as number, 0.5, 400), y: clamp(b.y as number, -50, 100) });
    }
    if (w.length) t.water = w;
  }
  return t;
}

const PRESETS: WorldPreset[] = ['normal', 'flat', 'islands', 'flatIslands', 'floating'];
function sanitizeGen(x: unknown): WorldGenSettings | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const g: WorldGenSettings = {};
  if (PRESETS.includes(o.preset as WorldPreset)) g.preset = o.preset as WorldPreset;
  const num = (k: keyof WorldGenSettings, a: number, b: number) => {
    if (isNum(o[k])) (g as Record<string, number>)[k] = clamp(o[k] as number, a, b);
  };
  num('height', 0, 2);
  num('rough', 0, 2);
  num('sea', -12, 12);
  num('biomeSize', 0.25, 4);
  num('caves', 0, 2);
  num('ores', 0, 2);
  num('trees', 0, 2);
  if (o.biomes && typeof o.biomes === 'object') {
    const b: Partial<Record<BiomeId, number>> = {};
    for (const id of BIOME_IDS) {
      const v = (o.biomes as Record<string, unknown>)[id];
      if (isNum(v)) b[id] = clamp(v, 0, 3);
    }
    g.biomes = b;
  }
  if (Array.isArray(o.layers)) {
    const L: { k: TerrainMat; n: number }[] = [];
    for (const q of o.layers.slice(0, 8)) {
      const l = q as Record<string, unknown>;
      if ((TERRAIN_MATS as readonly string[]).includes(l?.k as string) && isNum(l.n)) L.push({ k: l.k as TerrainMat, n: clamp(l.n, 0.1, 20) });
    }
    if (L.length) g.layers = L;
  }
  return g;
}

function sanitizeMission(x: unknown, ids: Set<number>): Mission | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  const obj: Objective[] = [];
  if (Array.isArray(o.objectives))
    for (const q of o.objectives.slice(0, LIMITS.objectives)) {
      const b = q as Record<string, unknown>;
      if (!(OBJECTIVES as readonly string[]).includes(b?.k as string)) continue;
      const ob: Objective = { k: b.k as ObjectiveKind };
      if (isNum(b.n)) ob.n = clamp(Math.round(b.n), 1, 999);
      if (isNum(b.sec)) ob.sec = clamp(Math.round(b.sec), 1, 3600);
      if (isNum(b.part) && ids.has(b.part)) ob.part = b.part;
      obj.push(ob);
    }
  const m: Mission = { objectives: obj };
  if (o.order === 'seq') m.order = 'seq';
  if (isNum(o.lives)) m.lives = clamp(Math.round(o.lives), 0, 99);
  if (isNum(o.time)) m.time = clamp(Math.round(o.time), 0, 3600);
  const w = str(o.win, LIMITS.textLen);
  if (w) m.win = w;
  const l = str(o.lose, LIMITS.textLen);
  if (l) m.lose = l;
  return m;
}

/* ------------------------- validação v4 (Bloop Engine) ------------------------- */

/** ids curtos de fases, cenas, animações e NPCs */
const SID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const sid = (x: unknown): string | null => (typeof x === 'string' && SID_RE.test(x) ? x : null);
const oneOf = <T extends string>(list: readonly T[], x: unknown): T | undefined => ((list as readonly unknown[]).includes(x) ? (x as T) : undefined);
const arr = (x: unknown, max: number): unknown[] => (Array.isArray(x) ? x.slice(0, max) : []);
const rec = (x: unknown): Record<string, unknown> | null => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null);

/** O que os blocos/cenas de uma fase podem citar. */
interface LevelScope {
  id: string;
  ids: Set<number>;
  jids: Set<number>;
  groups: Set<number>;
  anims: Set<string>;
  npcs: Set<string>;
}
/** Referências do jogo inteiro (para os blocos). */
interface ScriptCtx {
  level: LevelScope;
  /** ids de todas as fases, inclusive ROOT_LEVEL */
  levels: Set<string>;
  cuts: Set<string>;
  /** NPCs de todas as fases (falas podem citar qualquer um) */
  allNpcs: Set<string>;
}

function groupsOf(parts: Part[]): Set<number> {
  const g = new Set<number>();
  for (const p of parts) if (p.g) g.add(p.g);
  return g;
}

/** A criação usa algo da v4 (fases, cenas, NPCs, variáveis declaradas, animações, Historinha)? Jogos v4 têm teto LIMITS.gameBytes. */
export function hasEngine(c: Creation): boolean {
  return !!(c.levels?.length || c.vars?.length || c.anims?.length || c.npcs?.length || c.cutscenes?.length || c.story);
}

function sanitizeEngine(o: Record<string, unknown>, c: Creation, root: LevelScope, rootCount: number, scriptErrors: string[], errors: string[]): void {
  // 1. fases (corpo + mundo + missão), dentro do teto de peças somadas
  const rawLevels: { raw: Record<string, unknown>; lv: Level; scope: LevelScope }[] = [];
  const levelIds = new Set<string>([ROOT_LEVEL]);
  let budget = LIMITS.parts - rootCount;
  if (Array.isArray(o.levels)) {
    if (o.levels.length > LIMITS.levels - 1) errors.push('levels-limit');
    for (const r of o.levels.slice(0, LIMITS.levels - 1)) {
      const q = rec(r);
      const lid = sid(q?.id);
      if (!q || !lid || levelIds.has(lid)) {
        errors.push('level');
        continue;
      }
      const mats = q.materials === undefined ? null : sanitizeMaterials(q.materials, errors);
      const body = sanitizeBody(q, mats ?? c.materials, errors, budget, c.id);
      budget -= body.count;
      const lv: Level = { id: lid, name: str(q.name, LIMITS.levelName) || lid, parts: body.parts, joints: body.joints, logic: body.logic };
      if (mats) lv.materials = mats;
      const tr = sanitizeTerrain(q.terrain, errors);
      if (tr) lv.terrain = tr;
      const wk = worldKindOf(q.worldKind);
      if (wk) lv.worldKind = wk;
      if (isNum(q.seed)) lv.seed = Math.floor(q.seed) | 0;
      const gen = sanitizeGen(q.gen);
      if (gen) lv.gen = gen;
      const mi = sanitizeMission(q.mission, body.ids);
      if (mi) lv.mission = mi;
      levelIds.add(lid);
      rawLevels.push({ raw: q, lv, scope: { id: lid, ids: body.ids, jids: body.jids, groups: groupsOf(body.parts), anims: new Set(), npcs: new Set() } });
    }
  }
  for (const L of rawLevels) {
    if (L.raw.next === undefined) continue;
    if (L.raw.next === '' || (typeof L.raw.next === 'string' && levelIds.has(L.raw.next))) L.lv.next = L.raw.next;
    else errors.push('level-next');
  }

  // 2. animações e NPCs (sem falas) de cada fase; ids de NPC únicos no jogo todo
  const allNpcs = new Set<string>();
  const rootAnims = sanitizeAnims(o.anims, root, errors);
  const rootNpcs = sanitizeNpcs(o.npcs, root, allNpcs, errors);
  for (const L of rawLevels) {
    const an = sanitizeAnims(L.raw.anims, L.scope, errors);
    if (an.length) L.lv.anims = an;
    const np = sanitizeNpcs(L.raw.npcs, L.scope, allNpcs, errors);
    if (np.length) L.lv.npcs = np;
  }
  // 3. falas dos NPCs (podem citar NPCs de outras fases)
  const talk = (list: Npc[] | undefined, rawList: unknown) => {
    if (!list) return;
    const raws = arr(rawList, Infinity).map(rec);
    for (const n of list) {
      const r = raws.find((x) => x?.id === n.id);
      if (r?.talk === undefined) continue;
      const lines = sanitizeLines(r.talk, allNpcs, errors);
      if (lines.length) n.talk = lines;
    }
  };
  talk(rootNpcs, o.npcs);
  for (const L of rawLevels) talk(L.lv.npcs, L.raw.npcs);

  // 4. cenas
  const scopes = new Map<string, LevelScope>([[ROOT_LEVEL, root], ...rawLevels.map((L) => [L.lv.id, L.scope] as [string, LevelScope])]);
  const cuts: Cutscene[] = [];
  const cutIds = new Set<string>();
  if (Array.isArray(o.cutscenes)) {
    if (o.cutscenes.length > LIMITS.cutscenes) errors.push('cutscenes-limit');
    for (const r of o.cutscenes.slice(0, LIMITS.cutscenes)) {
      const cs = sanitizeCutscene(r, scopes, allNpcs, errors);
      if (!cs || cutIds.has(cs.id)) {
        errors.push('cutscene');
        continue;
      }
      cutIds.add(cs.id);
      cuts.push(cs);
    }
  }

  // 5. Historinha
  const st = rec(o.story);
  let story: StoryFlow | undefined;
  if (st) {
    const steps: StoryStep[] = [];
    for (const r of arr(st.steps, LIMITS.storySteps)) {
      const q = rec(r);
      if (q?.k === 'cut' && typeof q.id === 'string' && cutIds.has(q.id)) steps.push({ k: 'cut', id: q.id });
      else if (q?.k === 'level' && typeof q.id === 'string' && levelIds.has(q.id)) steps.push({ k: 'level', id: q.id });
      else if (q?.k === 'end') {
        const text = str(q.text, LIMITS.textLen);
        steps.push(text ? { k: 'end', text } : { k: 'end' });
      } else errors.push('story-step');
    }
    if (steps.length) story = { steps };
    else errors.push('story');
  }

  // 6. variáveis declaradas
  const vars: VarDef[] = [];
  const varNames = new Set<string>();
  for (const r of arr(o.vars, LIMITS.vars)) {
    const q = rec(r);
    const name = typeof q?.name === 'string' && VAR_RE.test(q.name) ? q.name : null;
    if (!q || !name || varNames.has(name)) {
      errors.push('var');
      continue;
    }
    const vd: VarDef = { name, init: isNum(q.init) ? clamp(q.init, -1e6, 1e6) : 0, scope: q.scope === 'game' ? 'game' : 'player' };
    const hud = oneOf(GAME_ICONS, q.hud);
    if (hud) vd.hud = hud;
    if (q.persist === true) vd.persist = true;
    varNames.add(name);
    vars.push(vd);
  }

  // 7. blocos de cada fase (os erros vão para a posição antiga, ver validate)
  const ctxOf = (level: LevelScope): ScriptCtx => ({ level, levels: levelIds, cuts: cutIds, allNpcs });
  const scripts = sanitizeScripts(o.scripts, root.ids, root.jids, scriptErrors, ctxOf(root));
  if (scripts.length) c.scripts = scripts;
  for (const L of rawLevels) {
    const sc = sanitizeScripts(L.raw.scripts, L.scope.ids, L.scope.jids, errors, ctxOf(L.scope));
    if (sc.length) L.lv.scripts = sc;
  }

  // 8. extensões v4 do GameMeta
  if (c.game && gmRaw(o)) {
    const gm = gmRaw(o)!;
    const md = rec(gm.modes);
    if (md) {
      const modes: GameModes = {};
      if (typeof md.solo === 'boolean') modes.solo = md.solo;
      if (md.story === true && story) modes.story = true;
      const on = rec(md.online);
      if (on) {
        const max = isNum(on.max) ? clamp(Math.round(on.max), 2, LIMITS.onlineMax) : LIMITS.onlineMax;
        const om: OnlineMode = { min: isNum(on.min) ? clamp(Math.round(on.min), 1, max) : 1, max };
        if (on.teams === 2 || on.teams === 0) om.teams = on.teams;
        if (typeof on.pvp === 'boolean') om.pvp = on.pvp;
        const goal = oneOf(ONLINE_GOALS, on.goal);
        if (goal) om.goal = goal;
        modes.online = om;
      }
      c.game.modes = modes;
    }
    if (gm.intro !== undefined) {
      if (typeof gm.intro === 'string' && cutIds.has(gm.intro)) c.game.intro = gm.intro;
      else errors.push('game-intro');
    }
    if (gm.cover === 0) c.game.cover = 0;
    const hud = rec(gm.hud);
    if (hud) c.game.hud = { vars: arr(hud.vars, LIMITS.hudVars).filter((x): x is string => typeof x === 'string' && varNames.has(x)).filter((x, i, a) => a.indexOf(x) === i) };
    const ct = rec(gm.controls);
    if (ct) {
      const controls: GameControls = {};
      const a1 = oneOf(GAME_ICONS, ct.action);
      if (a1) controls.action = a1;
      const a2 = oneOf(GAME_ICONS, ct.action2);
      if (a2) controls.action2 = a2;
      if (typeof ct.run === 'boolean') controls.run = ct.run;
      c.game.controls = controls;
    }
  }

  if (rawLevels.length) c.levels = rawLevels.map((L) => L.lv);
  if (vars.length) c.vars = vars;
  if (rootAnims.length) c.anims = rootAnims;
  if (rootNpcs.length) c.npcs = rootNpcs;
  if (cuts.length) c.cutscenes = cuts;
  if (story) c.story = story;
}

const gmRaw = (o: Record<string, unknown>) => rec(o.game);

function sanitizeAnims(raw: unknown, sc: LevelScope, errors: string[]): PartAnim[] {
  const out: PartAnim[] = [];
  if (!Array.isArray(raw)) return out;
  if (raw.length > LIMITS.anims) errors.push('anims-limit');
  for (const r of raw.slice(0, LIMITS.anims)) {
    const q = rec(r);
    const aid = sid(q?.id);
    if (!q || !aid || sc.anims.has(aid)) {
      errors.push('anim');
      continue;
    }
    const a: PartAnim = { id: aid, loop: oneOf(ANIM_LOOPS, q.loop) ?? 'once', keys: [] };
    if (isNum(q.part) && sc.ids.has(q.part)) a.part = q.part;
    else if (isNum(q.g) && sc.groups.has(q.g)) a.g = q.g;
    else {
      errors.push('anim-part');
      continue;
    }
    const nm = str(q.name, LIMITS.nameLen);
    if (nm) a.name = nm;
    if (q.auto === true) a.auto = true;
    for (const kr of arr(q.keys, LIMITS.animKeys)) {
      const k = rec(kr);
      if (!k || !isNum(k.t)) continue;
      const key: AnimKey = { t: clamp(k.t, 0, LIMITS.animDur) };
      const p = vec(k.p, 100, null);
      if (p) key.p = p;
      const rr = vec(k.r, 3600, null);
      if (rr) key.r = rr;
      const s = vec(k.s, 100, null);
      if (s) key.s = [clamp(s[0], 0.01, 100), clamp(s[1], 0.01, 100), clamp(s[2], 0.01, 100)];
      const e = oneOf(EASES, k.ease);
      if (e) key.ease = e;
      a.keys.push(key);
    }
    if (!a.keys.length) {
      errors.push('anim-keys');
      continue;
    }
    a.keys.sort((x, y) => x.t - y.t);
    sc.anims.add(aid);
    out.push(a);
  }
  return out;
}

function sanitizeNpcs(raw: unknown, sc: LevelScope, allNpcs: Set<string>, errors: string[]): Npc[] {
  const out: Npc[] = [];
  if (!Array.isArray(raw)) return out;
  if (raw.length > LIMITS.npcs) errors.push('npcs-limit');
  for (const r of raw.slice(0, LIMITS.npcs)) {
    const q = rec(r);
    const nid = sid(q?.id);
    const at = vec(q?.at, LIMITS.extent, null);
    if (!q || !nid || nid === 'player' || allNpcs.has(nid) || !at) {
      errors.push('npc');
      continue;
    }
    const lk = rec(q.look) ?? {};
    const look: NpcLook = {};
    if (typeof lk.skin === 'string' && ID_RE.test(lk.skin)) look.skin = lk.skin;
    if (typeof lk.creature === 'string' && ID_RE.test(lk.creature)) look.creature = lk.creature;
    const av = rec(lk.avatar);
    const col = rec(av?.colors);
    const ap = rec(av?.parts);
    if (av && ap && col && typeof col.primary === 'string' && HEX.test(col.primary) && typeof col.secondary === 'string' && HEX.test(col.secondary)) {
      const parts: Record<string, string> = {};
      for (const [k, v] of Object.entries(ap).slice(0, 16)) if (/^[a-z_]{1,16}$/.test(k) && typeof v === 'string' && ID_RE.test(v)) parts[k] = v;
      look.avatar = { parts, colors: { primary: col.primary.toLowerCase(), secondary: col.secondary.toLowerCase() } };
    }
    const n: Npc = { id: nid, name: str(q.name, LIMITS.npcName) || nid, look, at, yaw: isNum(q.yaw) ? clamp(q.yaw, -360, 360) : 0 };
    if (Array.isArray(q.path)) {
      const path = q.path
        .slice(0, LIMITS.npcPath)
        .map((x) => vec(x, LIMITS.extent, null))
        .filter((x): x is Vec3 => !!x);
      if (path.length) n.path = path;
    }
    if (isNum(q.speed)) n.speed = clamp(q.speed, 0.2, 8);
    const role = oneOf(NPC_ROLES, q.role);
    if (role) n.role = role;
    allNpcs.add(nid);
    sc.npcs.add(nid);
    out.push(n);
  }
  return out;
}

/** quem fala: NPC conhecido, 'player' ou ninguém (narrador). Desconhecido → vira narrador. */
function whoOf(x: unknown, npcs: Set<string>, errors: string[]): string | undefined {
  if (x == null || x === '') return undefined;
  if (x === 'player' || (typeof x === 'string' && npcs.has(x))) return x;
  errors.push('who');
  return undefined;
}

function sanitizeLines(raw: unknown, npcs: Set<string>, errors: string[]): DialogLine[] {
  const out: DialogLine[] = [];
  for (const r of arr(raw, LIMITS.dialogLines)) {
    const q = rec(r);
    const text = str(q?.text, LIMITS.dialogText);
    if (!q || !text) {
      errors.push('dialog');
      continue;
    }
    const line: DialogLine = { text };
    const who = whoOf(q.who, npcs, errors);
    if (who) line.who = who;
    if (Array.isArray(q.choices)) {
      const ch: DialogChoice[] = [];
      for (const cr of q.choices.slice(0, LIMITS.choices)) {
        const cq = rec(cr);
        const ct = str(cq?.text, LIMITS.choiceText);
        if (!cq || !ct) {
          errors.push('choice');
          continue;
        }
        const choice: DialogChoice = { text: ct };
        const set = rec(cq.set);
        if (set && typeof set.v === 'string' && VAR_RE.test(set.v)) choice.set = { v: set.v, e: sanitizeExpr(set.e) };
        const go = str(cq.go, LIMITS.varLen);
        if (go) choice.go = go;
        ch.push(choice);
      }
      if (ch.length) line.choices = ch;
    }
    out.push(line);
  }
  return out;
}

function sanitizeCutscene(r: unknown, scopes: Map<string, LevelScope>, npcs: Set<string>, errors: string[]): Cutscene | null {
  const q = rec(r);
  const cid = sid(q?.id);
  if (!q || !cid) return null;
  const dur = isNum(q.dur) ? clamp(q.dur, 1, LIMITS.cutDur) : 5;
  const T = (x: unknown) => (isNum(x) ? clamp(x, 0, dur) : null);
  const lvl = typeof q.level === 'string' && scopes.has(q.level) ? q.level : undefined;
  if (q.level !== undefined && !lvl) errors.push('cut-level');
  const sc = scopes.get(lvl ?? ROOT_LEVEL)!;
  const ease = (x: unknown) => oneOf(EASES, x);
  const cs: Cutscene = { id: cid, name: str(q.name, LIMITS.nameLen) || cid, dur, skippable: true, cam: [], actors: [], subs: [] };
  if (lvl) cs.level = lvl;
  for (const kr of arr(q.cam, LIMITS.cutCam)) {
    const k = rec(kr);
    const t = T(k?.t);
    const p = vec(k?.p, LIMITS.extent, null);
    const lr = rec(k?.look);
    const look: CamLook | null = vec(k?.look, LIMITS.extent, null) ?? (lr && typeof lr.npc === 'string' && npcs.has(lr.npc) ? { npc: lr.npc } : lr && isNum(lr.part) && sc.ids.has(lr.part) ? { part: lr.part } : null);
    if (!k || t == null || !p || !look) {
      errors.push('cut-cam');
      continue;
    }
    const key: CutCamKey = { t, p, look };
    if (isNum(k.fov)) key.fov = clamp(k.fov, 20, 120);
    const e = ease(k.ease);
    if (e) key.ease = e;
    cs.cam.push(key);
  }
  cs.cam.sort((a, b) => a.t - b.t);
  for (const ar of arr(q.actors, LIMITS.cutActors)) {
    const a = rec(ar);
    const w = a?.who;
    const pm = typeof w === 'string' ? /^part:(\d{1,6})$/.exec(w) : null;
    const ok = w === 'player' || (typeof w === 'string' && npcs.has(w)) || (pm && sc.ids.has(Number(pm[1])));
    if (!a || !ok) {
      errors.push('cut-actor');
      continue;
    }
    const keys: CutActorKey[] = [];
    for (const kr of arr(a.keys, LIMITS.cutActorKeys)) {
      const k = rec(kr);
      const t = T(k?.t);
      const p = vec(k?.p, LIMITS.extent, null);
      if (!k || t == null || !p) continue;
      const key: CutActorKey = { t, p };
      if (isNum(k.yaw)) key.yaw = clamp(k.yaw, -360, 360);
      const pose = oneOf(POSES, k.pose);
      if (pose) key.pose = pose;
      const ex = oneOf(EXPRS, k.expr);
      if (ex) key.expr = ex;
      const e = ease(k.ease);
      if (e) key.ease = e;
      keys.push(key);
    }
    if (!keys.length) {
      errors.push('cut-actor');
      continue;
    }
    keys.sort((x, y) => x.t - y.t);
    cs.actors.push({ who: w as string, keys });
  }
  for (const sr of arr(q.subs, LIMITS.cutSubs)) {
    const s = rec(sr);
    const t = T(s?.t);
    const text = str(s?.text, LIMITS.dialogText);
    if (!s || t == null || !text) {
      errors.push('cut-sub');
      continue;
    }
    const sub: CutSub = { t, text };
    const end = T(s.end);
    if (end != null && end > t) sub.end = end;
    const who = whoOf(s.who, npcs, errors);
    if (who) sub.who = who;
    const style = oneOf(BUBBLE_STYLES, s.style);
    if (style) sub.style = style;
    cs.subs.push(sub);
  }
  cs.subs.sort((a, b) => a.t - b.t);
  const sfx: { t: number; snd: SoundId }[] = [];
  for (const xr of arr(q.sfx, LIMITS.cutSfx)) {
    const x = rec(xr);
    const t = T(x?.t);
    const snd = oneOf(SOUNDS, x?.snd);
    if (t != null && snd) sfx.push({ t, snd });
  }
  if (sfx.length) cs.sfx = sfx.sort((a, b) => a.t - b.t);
  const fx: { t: number; kind: FxKind; dur: number }[] = [];
  for (const xr of arr(q.fx, LIMITS.cutFx)) {
    const x = rec(xr);
    const t = T(x?.t);
    const kind = oneOf(FX_KINDS, x?.kind);
    if (t != null && kind) fx.push({ t, kind, dur: isNum(x!.dur) ? clamp(x!.dur, 0.1, 10) : 1 });
  }
  if (fx.length) cs.fx = fx.sort((a, b) => a.t - b.t);
  const mu = sid(q.music);
  if (mu) cs.music = mu;
  const ti = rec(q.title);
  const tt = str(ti?.text, LIMITS.cutTitle);
  if (ti && tt) cs.title = { text: tt, at: T(ti.at) ?? 0 };
  if (typeof q.from === 'string' && ID_RE.test(q.from)) cs.from = q.from;
  return cs;
}

/* ------------------------- validação dos blocos ------------------------- */

const VAR_RE = /^[A-Za-zÀ-ÿ0-9_ ]{1,16}$/;
const OPS = ['+', '-', '*', '/', 'rand', 'min', 'max'];
const CMP = ['<', '>', '=', '!=', '<=', '>='];
const QS: readonly string[] = EXPR_QUERIES;

function sanitizeExpr(x: unknown, depth = 0): Expr {
  if (isNum(x)) return clamp(x, -1e6, 1e6);
  if (!x || typeof x !== 'object' || depth > 4) return 0;
  const o = x as Record<string, unknown>;
  if (typeof o.v === 'string' && VAR_RE.test(o.v)) return { v: o.v };
  if (typeof o.q === 'string' && QS.includes(o.q)) return { q: o.q as 'score' };
  if (typeof o.op === 'string' && OPS.includes(o.op)) return { op: o.op as '+', a: sanitizeExpr(o.a, depth + 1), b: sanitizeExpr(o.b, depth + 1) };
  return 0;
}

function sanitizeScripts(raw: unknown, ids: Set<number>, jids: Set<number>, errors: string[], ctx?: ScriptCtx): Script[] {
  if (!Array.isArray(raw)) return [];
  let budget: number = LIMITS.blocks;
  const vars = new Set<string>();
  const okPart = (p: unknown, opt: boolean): number | undefined | null => (p == null ? (opt ? undefined : null) : isNum(p) && ids.has(p) ? p : null);
  const varName = (v: unknown): string | null => {
    if (typeof v !== 'string' || !VAR_RE.test(v)) return null;
    if (!vars.has(v) && vars.size >= LIMITS.vars) return null;
    vars.add(v);
    return v;
  };
  const list = (arr: unknown, depth: number): Block[] => {
    const out: Block[] = [];
    if (!Array.isArray(arr) || depth > LIMITS.blockDepth) return out;
    for (const r of arr) {
      if (budget <= 0) {
        errors.push('blocks-limit');
        break;
      }
      const b = block(r, depth);
      if (b) {
        budget--;
        out.push(b);
      } else errors.push('block');
    }
    return out;
  };
  const cond = (x: unknown): Cond => {
    const o = (x ?? {}) as Record<string, unknown>;
    return { op: CMP.includes(o.op as string) ? (o.op as '<') : '=', a: sanitizeExpr(o.a), b: sanitizeExpr(o.b) };
  };
  const block = (r: unknown, depth: number): Block | null => {
    if (!r || typeof r !== 'object') return null;
    const b = r as Record<string, unknown>;
    const v3 = (x: unknown) => vec(x, 100, [0, 0, 0])!;
    switch (b.k) {
      case 'move':
      case 'rotate':
      case 'force': {
        const part = okPart(b.part, true);
        if (part === null) return null;
        const out: Record<string, unknown> = { k: b.k };
        if (part != null) out.part = part;
        if (b.k === 'rotate') out.r = vec(b.r, 3600, [0, 90, 0]);
        else out.d = v3(b.d);
        if (b.k !== 'force' && isNum(b.t)) out.t = clamp(b.t, 0, 60);
        return out as Block;
      }
      case 'destroy':
      case 'color':
      case 'checkpoint': {
        const part = okPart(b.part, true);
        if (part === null) return null;
        const out: Record<string, unknown> = { k: b.k };
        if (part != null) out.part = part;
        if (b.k === 'color') out.c = typeof b.c === 'string' && HEX.test(b.c) ? b.c.toLowerCase() : '#ff5cc8';
        return out as Block;
      }
      case 'teleport':
      case 'spawn':
      case 'door':
      case 'light': {
        const part = okPart(b.part, false);
        return part == null ? null : ({ k: b.k, part } as Block);
      }
      case 'motor':
        return isNum(b.joint) && jids.has(b.joint) ? { k: 'motor', joint: b.joint } : null;
      case 'sound':
        return { k: 'sound', snd: (SOUNDS as readonly string[]).includes(b.snd as string) ? (b.snd as SoundId) : 'ding' };
      case 'say': {
        const text = str(b.text, LIMITS.textLen);
        return text ? { k: 'say', text } : null;
      }
      case 'score':
        return { k: 'score', n: sanitizeExpr(b.n) };
      case 'lives':
        return { k: 'lives', n: sanitizeExpr(b.n) };
      case 'wait':
        return { k: 'wait', sec: sanitizeExpr(b.sec) };
      case 'set':
      case 'change': {
        const v = varName(b.v);
        return v ? ({ k: b.k, v, e: sanitizeExpr(b.e) } as Block) : null;
      }
      case 'if': {
        const out: Block = { k: 'if', c: cond(b.c), then: list(b.then, depth + 1) };
        if (Array.isArray(b.else)) out.else = list(b.else, depth + 1);
        return out;
      }
      case 'repeat':
        return { k: 'repeat', n: sanitizeExpr(b.n), body: list(b.body, depth + 1) };
      case 'team':
        return { k: 'team', team: b.team === 1 || b.team === 2 ? b.team : 0 };
      case 'match':
        return { k: 'match', on: b.on === 'win' || b.on === 'lose' ? b.on : 'start' };
      case 'send': {
        const msg = str(b.msg, LIMITS.varLen);
        return msg ? { k: 'send', msg } : null;
      }
      /* ---- v4: referências conferidas contra o jogo (sem ctx = criação importada → descarta) ---- */
      case 'level': {
        const to = b.to === 'next' ? 'next' : typeof b.to === 'string' && ctx?.levels.has(b.to) ? b.to : null;
        return to ? { k: 'level', to } : null;
      }
      case 'cutscene':
        return typeof b.id === 'string' && ctx?.cuts.has(b.id) ? { k: 'cutscene', id: b.id } : null;
      case 'dialog': {
        const lines = ctx ? sanitizeLines(b.lines, ctx.allNpcs, errors) : [];
        return lines.length ? { k: 'dialog', lines } : null;
      }
      case 'anim':
        return typeof b.id === 'string' && ctx?.level.anims.has(b.id) ? { k: 'anim', id: b.id, on: b.on === 'stop' ? 'stop' : 'play' } : null;
      case 'show':
      case 'hide': {
        const part = okPart(b.part, true);
        if (part === null) return null;
        return part != null ? { k: b.k, part } : { k: b.k };
      }
      case 'camera': {
        const part = okPart(b.part, true);
        if (part === null) return null;
        const out: Block = { k: 'camera', cam: oneOf(CAMERA_ACTS, b.cam) ?? 'shake' };
        if (part != null) out.part = part;
        return out;
      }
      case 'npc': {
        if (typeof b.id !== 'string' || !ctx?.level.npcs.has(b.id)) return null;
        const part = okPart(b.part, true);
        if (part === null) return null;
        const out: Block = { k: 'npc', id: b.id, act: oneOf(NPC_ACTS, b.act) ?? 'walk' };
        if (part != null) out.part = part;
        return out;
      }
      case 'it':
        return { k: 'it', who: b.who === 'toucher' || b.who === 'random' ? b.who : 'me' };
      case 'hud': {
        const text = str(b.text, LIMITS.textLen);
        return text ? { k: 'hud', text } : null;
      }
      case 'save':
        return { k: 'save' };
      case 'emote':
        return { k: 'emote', pose: oneOf(POSES, b.pose) ?? 'wave' };
    }
    return null;
  };
  const out: Script[] = [];
  const sids = new Set<number>();
  for (const r of raw.slice(0, LIMITS.scripts)) {
    const o = r as Record<string, unknown>;
    const on = (o?.on ?? {}) as Record<string, unknown>;
    if (!isNum(o?.id) || sids.has(o.id) || !(SCRIPT_EVENTS as readonly string[]).includes(on.k as string)) {
      errors.push('script');
      continue;
    }
    const ev: ScriptEvent = { k: on.k as ScriptEventKind };
    if (on.part != null) {
      if (!isNum(on.part) || !ids.has(on.part)) {
        errors.push('script-part');
        continue;
      }
      ev.part = on.part;
    }
    if (ev.k === 'every') ev.sec = clamp(isNum(on.sec) ? on.sec : 1, 0.1, 600);
    if (ev.k === 'message') ev.msg = str(on.msg, LIMITS.varLen) || 'oi';
    // v4
    if (ev.k === 'action') ev.key = on.key === 'b' ? 'b' : 'a';
    if (ev.k === 'cutend' && on.id != null) {
      if (typeof on.id !== 'string' || !ctx?.cuts.has(on.id)) {
        errors.push('script-ref');
        continue;
      }
      ev.id = on.id;
    }
    if (ev.k === 'var') {
      if (typeof on.v !== 'string' || !VAR_RE.test(on.v)) {
        errors.push('script-ref');
        continue;
      }
      ev.v = on.v;
    }
    if (ev.k === 'talk') {
      if (typeof on.npc !== 'string' || !ctx?.level.npcs.has(on.npc)) {
        errors.push('script-ref');
        continue;
      }
      ev.npc = on.npc;
    }
    const sc: Script = { id: Math.floor(o.id as number), on: ev, body: list(o.body, 0) };
    const nm = str(o.name, LIMITS.nameLen);
    if (nm) sc.name = nm;
    sids.add(sc.id);
    out.push(sc);
  }
  return out;
}

/* --------------------------- (de)serialização --------------------------- */

/** Arredonda números para deixar o JSON compacto (mm / 0,1°). */
function compactNumbers(c: Creation): Creation {
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const v3 = (v: Vec3, f: (x: number) => number): Vec3 => [f(v[0]), f(v[1]), f(v[2])];
  const cParts = (list: Part[]) =>
    list.map((p) => {
      const q = { ...p } as Part;
      q.p = v3(p.p, r3);
      if (p.r) q.r = v3(p.r, r1);
      if (p.s) q.s = v3(p.s, r3);
      if (q.t === 'stroke') (q as StrokePart).pts = (p as StrokePart).pts.map((x) => Math.round(x * 100) / 100);
      return q;
    });
  const cJoints = (list: Joint[]) => list.map((j) => ({ ...j, at: v3(j.at, r3) }));
  const out: Creation = { ...c, parts: cParts(c.parts), joints: cJoints(c.joints) };
  // v4: fases extras com o mesmo arredondamento (só existe a chave se a criação tiver fases)
  if (c.levels) out.levels = c.levels.map((l) => ({ ...l, parts: cParts(l.parts), joints: cJoints(l.joints) }));
  return out;
}

export function jsonBytes(c: Creation): number {
  const s = JSON.stringify(c);
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s: string): Uint8Array {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '==='.slice((b.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// tipos estruturais (sem lib DOM): o Worker também importa este arquivo
async function pipe(bytes: Uint8Array, stream: { readable: unknown; writable: unknown }): Promise<Uint8Array> {
  const out = new Blob([bytes.slice().buffer as ArrayBuffer]).stream().pipeThrough(stream as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

const hasCompression = (): boolean => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

/**
 * Serializa para texto compacto e seguro para URL:
 *   "B1." + base64url(deflate-raw(JSON))  quando CompressionStream existe;
 *   "B0." + base64url(JSON)               senão.
 * A miniatura vai junto (tire-a antes se quiser algo menor).
 */
export async function serialize(c: Creation): Promise<string> {
  const json = JSON.stringify(compactNumbers(c));
  const bytes = new TextEncoder().encode(json);
  if (hasCompression()) {
    try {
      return 'B1.' + b64urlEncode(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* cai para sem compressão */
    }
  }
  return 'B0.' + b64urlEncode(bytes);
}

/** Inverso de serialize(); também aceita JSON puro. Sempre valida. Lança Error('format') se ilegível. */
export async function deserialize(s: string): Promise<ValidateResult> {
  let json: string;
  const txt = s.trim();
  if (txt.startsWith('{')) json = txt;
  else if (txt.startsWith('B0.')) json = new TextDecoder().decode(b64urlDecode(txt.slice(3)));
  else if (txt.startsWith('B1.')) {
    if (!hasCompression()) throw new Error('format');
    const raw = b64urlDecode(txt.slice(3));
    if (raw.length > LIMITS.gameBytes) throw new Error('format');
    json = new TextDecoder().decode(await pipe(raw, new DecompressionStream('deflate-raw')));
  } else throw new Error('format');
  if (json.length > LIMITS.gameBytes * 1.2) throw new Error('format');
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('format');
  }
  return validate(migrate(obj));
}

/** Atualiza versões antigas do formato. v1 → v2 → v3 → v4 são compatíveis (só campos novos opcionais):
 *  só o número da versão muda. Versões futuras (v5+) passam direto; validate() descarta o que não conhece. */
export function migrate(o: unknown): unknown {
  const v = o && typeof o === 'object' ? (o as { v?: number }).v : undefined;
  if (v === 1 || v === 2 || v === 3) return { ...(o as object), v: FORMAT_VERSION };
  return o;
}

/* -------------------------------- hash -------------------------------- */

/**
 * JSON canônico: chaves ordenadas, sem miniatura/datas/deps (o "conteúdo" da criação).
 * CONGELADO (scripts/test-format.mjs): `v` acima de 3 entra como 3 — a v4 é só aditiva, então uma criação
 * v1–v3 tem o MESMO hash antes e depois da migração; o que a v4 acrescenta muda o hash pelos próprios campos.
 */
export function canonical(c: Creation): string {
  const { thumbnail: _t, created: _c, updated: _u, deps: _d, ...rest } = compactNumbers(c);
  void _t;
  void _c;
  void _u;
  void _d;
  if (isNum(rest.v) && rest.v > CANON_V) rest.v = CANON_V;
  return stableStringify(rest);
}
const CANON_V = 3;

function stableStringify(x: unknown): string {
  if (x === null || typeof x !== 'object') return JSON.stringify(x) ?? 'null';
  if (Array.isArray(x)) return '[' + x.map(stableStringify).join(',') + ']';
  const o = x as Record<string, unknown>;
  return (
    '{' +
    Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(o[k]))
      .join(',') +
    '}'
  );
}

/** Hash estável (cyrb53, 53 bits → 14 dígitos hex) do conteúdo canônico. Igual em qualquer máquina. */
export function hashCreation(c: Creation): string {
  return cyrb53(canonical(c)).toString(16).padStart(14, '0');
}

export function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/* ------------------------------ utilidades ------------------------------ */

/** Ids de criações referenciadas (diretas). */
export function refIds(c: Creation): string[] {
  const s = new Set<string>();
  for (const p of c.parts) if (p.t === 'ref') s.add(p.ref);
  return [...s];
}

/** Resolve uma referência: primeiro nas deps embutidas, depois no resolvedor externo. */
export function findDep(c: Creation, id: string): Creation | undefined {
  return c.deps?.find((d) => d.id === id);
}

/** É um veículo jogável? (assento + rodas ou propulsores) */
export function isVehicle(c: Creation): boolean {
  const seat = c.parts.some((p) => p.role === 'seat');
  return seat && c.parts.some((p) => p.role === 'wheel' || p.role === 'thruster');
}

/** v4: todas as fases em ordem — a fase 1 (raiz, id ROOT_LEVEL) vira um Level (mesmos arrays, sem cópia). */
export function levelList(c: Creation): Level[] {
  const root: Level = { id: ROOT_LEVEL, name: c.name, parts: c.parts, joints: c.joints, logic: c.logic, materials: c.materials };
  if (c.scripts) root.scripts = c.scripts;
  if (c.terrain) root.terrain = c.terrain;
  if (c.worldKind) root.worldKind = c.worldKind;
  if (c.seed != null) root.seed = c.seed;
  if (c.gen) root.gen = c.gen;
  if (c.mission) root.mission = c.mission;
  if (c.anims) root.anims = c.anims;
  if (c.npcs) root.npcs = c.npcs;
  return [root, ...(c.levels ?? [])];
}

/** v4: próxima fase depois de `id` ('' = fim). Ausente = a seguinte na lista. */
export function nextLevel(c: Creation, id: string): string {
  const list = levelList(c);
  const i = list.findIndex((l) => l.id === id);
  if (i < 0) return '';
  const nx = list[i].next;
  if (nx !== undefined) return nx;
  return list[i + 1]?.id ?? '';
}

/** v4: peças de todas as fases (sem resolver importadas). */
export function totalParts(c: Creation): number {
  return c.parts.length + (c.levels ?? []).reduce((n, l) => n + l.parts.length, 0);
}

/** Um texto escrito pelo autor e onde ele aparece (para filtrar no app e no servidor, e listar no painel admin). */
export interface GameText {
  /** ex.: 'name', 'game.title', 'level:L2.name', 'npc:bob.talk.0', 'cut:intro.sub.3', 'script:main.4.say' */
  where: string;
  text: string;
}

/** v4: TODOS os textos que um jogador pode ver (nomes, falas, escolhas, legendas, blocos…). */
export function collectTexts(c: Creation): GameText[] {
  const out: GameText[] = [];
  const add = (where: string, text: string | undefined) => {
    if (text) out.push({ where, text });
  };
  const lines = (where: string, ls: DialogLine[] | undefined) =>
    ls?.forEach((l, i) => {
      add(`${where}.${i}`, l.text);
      l.choices?.forEach((ch, j) => add(`${where}.${i}.choice.${j}`, ch.text));
    });
  add('name', c.name);
  add('game.title', c.game?.title);
  add('game.desc', c.game?.desc);
  c.game?.tags.forEach((g, i) => add(`game.tag.${i}`, g));
  c.vars?.forEach((v) => add('var', v.name));
  c.story?.steps.forEach((s, i) => s.k === 'end' && add(`story.${i}`, s.text));
  for (const L of levelList(c)) {
    if (L.id !== ROOT_LEVEL) add(`level:${L.id}.name`, L.name);
    L.parts.forEach((p) => add(`level:${L.id}.part.${p.id}`, p.name));
    add(`level:${L.id}.win`, L.mission?.win);
    add(`level:${L.id}.lose`, L.mission?.lose);
    L.npcs?.forEach((n) => {
      add(`npc:${n.id}.name`, n.name);
      lines(`npc:${n.id}.talk`, n.talk);
    });
    L.anims?.forEach((a) => add(`anim:${a.id}.name`, a.name));
    L.scripts?.forEach((sc) => {
      add(`script:${L.id}.${sc.id}.name`, sc.name);
      add(`script:${L.id}.${sc.id}.msg`, sc.on.msg);
      const walk = (list: Block[]) => {
        for (const b of list) {
          if (b.k === 'say' || b.k === 'hud') add(`script:${L.id}.${sc.id}.${b.k}`, b.text);
          else if (b.k === 'send') add(`script:${L.id}.${sc.id}.send`, b.msg);
          else if (b.k === 'dialog') lines(`script:${L.id}.${sc.id}.dialog`, b.lines);
          else if (b.k === 'if') {
            walk(b.then);
            if (b.else) walk(b.else);
          } else if (b.k === 'repeat') walk(b.body);
        }
      };
      walk(sc.body);
    });
  }
  c.cutscenes?.forEach((cs) => {
    add(`cut:${cs.id}.name`, cs.name);
    add(`cut:${cs.id}.title`, cs.title?.text);
    cs.subs.forEach((s, i) => add(`cut:${cs.id}.sub.${i}`, s.text));
  });
  return out;
}

/** Contagem de peças "pesadas" (importadas contam pelo tamanho real). */
export function partCount(c: Creation, resolve?: (id: string) => Creation | undefined, depth = 0): number {
  let n = 0;
  for (const p of c.parts) {
    if (p.t === 'ref' && depth < LIMITS.refDepth) {
      const d = findDep(c, p.ref) ?? resolve?.(p.ref);
      n += d ? Math.max(1, partCount(d, resolve, depth + 1)) : 1;
    } else n++;
  }
  return n;
}
