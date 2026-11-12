/* ============================================================
 *  BLOOP ENGINE — ganchos do jogo (contrato W0, "append-only").
 *
 *  O PlaySession (play/session.ts, W1) chama estas interfaces; as implementações
 *  ficam em arquivos de frentes diferentes:
 *    InputSource     → src/ui/input/*            (W3: StudioInput)
 *    CutsceneRunner  → src/studio/cutscene/*     (W2)
 *    DialogRunner / AnimRunner / NpcRunner / GameVars → play/{dialog,anim,npc,vars}.ts (W1)
 *    NetGame         → play/net-game.ts          (W1b)
 *  Os padrões "noop" abaixo deixam tudo funcionando (e o Studio atual igualzinho)
 *  enquanto cada frente não entrega a sua parte. Plano: docs/ENGINE-PLANO.md §2.2/§2.3.
 * ============================================================ */
import type { Creation, DialogLine, Ease as FEase, BubbleStyle as FBubble, ExprId as FExpr, FxKind as FFx, NpcAct, PoseId as FPose, ScriptEventKind, CameraAct, VarDef, VarScope } from '../format';
import type { Ease as CEase, BubbleStyle as CBubble, ExprId as CExpr, FxKind as CFx, PoseId as CPose } from '../../cinema/format';
import type { PlayMode } from '../../../shared/engine';

export type { PlayMode };

/* ------------------------------ entrada ------------------------------ */

/** Botões lógicos (o mapa de teclas/gamepad/toque fica em src/ui/input). */
export const INPUT_BUTTONS = ['jump', 'action', 'action2', 'run', 'interact', 'pause', 'photo', 'zoomIn', 'zoomOut'] as const;
export type InputButton = (typeof INPUT_BUTTONS)[number];
/** Último aparelho usado: toque, teclado+mouse ou controle. */
export type InputMode = 'touch' | 'kbm' | 'pad';

/** Leitura de UM quadro. `move` e `look` já normalizados (move: −1..1; look: pixels/“unidades de arrasto” do quadro). */
export interface InputFrame {
  move: { x: number; y: number };
  look: { dx: number; dy: number };
  /** apertados NESTE quadro (borda de subida) */
  pressed: ReadonlySet<InputButton>;
  /** seguros agora */
  held: ReadonlySet<InputButton>;
}

export interface InputSource {
  readonly mode: InputMode;
  /** chamar 1× por quadro de jogo */
  read(): InputFrame;
  /** avisa quando o aparelho muda (esconder/mostrar botões de toque). Devolve "desinscrever". */
  onMode(fn: (m: InputMode) => void): () => void;
  /** desligado = read() devolve quadro vazio (editor, cena, foto) */
  setEnabled(on: boolean): void;
  dispose(): void;
}

const EMPTY: ReadonlySet<InputButton> = new Set();
export const EMPTY_FRAME: InputFrame = Object.freeze({ move: Object.freeze({ x: 0, y: 0 }), look: Object.freeze({ dx: 0, dy: 0 }), pressed: EMPTY, held: EMPTY }) as InputFrame;

export function noopInput(mode: InputMode = 'touch'): InputSource {
  return { mode, read: () => EMPTY_FRAME, onMode: () => () => {}, setEnabled: () => {}, dispose: () => {} };
}

/* ------------------------------ peças do jogo ------------------------------ */

export interface CutsceneRunner {
  readonly playing: boolean;
  /** toca a cena (resolve no fim OU ao pular; nunca rejeita). Emite `cutend` pelo GameHooks. */
  play(id: string): Promise<void>;
  skip(): void;
  dispose(): void;
}

export interface DialogRunner {
  /** mostra as falas; resolve com o índice da escolha da ÚLTIMA fala com escolhas (−1 = sem escolha / fechado) */
  show(lines: DialogLine[], npc?: string): Promise<number>;
  close(): void;
  dispose(): void;
}

export interface AnimRunner {
  set(id: string, on: 'play' | 'stop'): void;
  /** amostra as animações (sem alocar) */
  update(dt: number): void;
  /** volta tudo à pose do editor */
  reset(): void;
  dispose(): void;
}

export interface NpcRunner {
  act(id: string, act: NpcAct, part?: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** Variáveis com escopo. 'player' = do jogador local; 'game' = do jogo (online: o anfitrião manda). */
export interface GameVars {
  get(name: string): number;
  set(name: string, value: number): void;
  scope(name: string): VarScope;
  /** variáveis com `persist` (Historinha) */
  persisted(): Record<string, number>;
  snapshot(): Record<string, number>;
  /** `var` (debounce: 1× por quadro por variável — quem chama é o W1). Devolve "desinscrever". */
  onChange(fn: (name: string, value: number) => void): () => void;
}

/** Store simples em memória (padrão offline; não-declaradas = 'player', valor 0). */
export function mapVars(defs: VarDef[] = []): GameVars {
  const v = new Map<string, number>();
  const sc = new Map<string, VarScope>();
  const persist = new Set<string>();
  for (const d of defs) {
    v.set(d.name, d.init);
    sc.set(d.name, d.scope);
    if (d.persist) persist.add(d.name);
  }
  const subs = new Set<(name: string, value: number) => void>();
  return {
    get: (n) => v.get(n) ?? 0,
    set: (n, x) => {
      if (v.get(n) === x) return;
      v.set(n, x);
      for (const f of subs) f(n, x);
    },
    scope: (n) => sc.get(n) ?? 'player',
    persisted: () => Object.fromEntries([...persist].map((n) => [n, v.get(n) ?? 0])),
    snapshot: () => Object.fromEntries(v),
    onChange: (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
  };
}

/* ------------------------------ multiplayer ------------------------------ */

export type MatchPhase = 'lobby' | 'countdown' | 'play' | 'end';
/** Pedidos cliente → anfitrião ({t:'ev', k:'g', …} dentro do envelope do WorldRoom). */
export type GameReqKind = 'touch' | 'zone' | 'collect' | 'button' | 'action' | 'tag' | 'die';
export interface GameReq {
  t: 'ev';
  k: 'g';
  e: GameReqKind;
  part?: number;
  /** jogador alvo (tag) */
  who?: string;
  seq: number;
}
/** Estado de uma peça controlado pelo anfitrião. */
export interface PartState {
  hidden?: boolean;
  open?: boolean;
  lit?: boolean;
  gone?: boolean;
  /** quem coletou */
  by?: string;
}
export interface GameSnapshot {
  phase: MatchPhase;
  /** id da fase atual (ROOT_LEVEL = fase 1) */
  level: string;
  /** variáveis de escopo 'game' */
  vars: Record<string, number>;
  parts: Record<number, PartState>;
  /** pegador (pega-pega) */
  it?: string;
  teams?: Record<string, 0 | 1 | 2>;
  scores: Record<string, number>;
  /** prazo absoluto (ms no relógio do servidor) */
  deadline?: number;
  /** animações tocando */
  anims?: string[];
  seq: number;
}
export type GameDelta =
  | { k: 'phase'; phase: MatchPhase }
  | { k: 'var'; v: string; n: number }
  | { k: 'part'; part: number; s: PartState }
  | { k: 'it'; who: string }
  | { k: 'team'; who: string; team: 0 | 1 | 2 }
  | { k: 'score'; who: string; n: number }
  | { k: 'level'; id: string }
  | { k: 'timer'; deadline: number }
  | { k: 'anim'; id: string; on: 'play' | 'stop' };
/** Anfitrião → todos ({t:'mg', k:'gs', …}); deltas ≤ 10 Hz, foto completa ao entrar e a cada 10 s. */
export interface GameStateMsg {
  t: 'mg';
  k: 'gs';
  full?: GameSnapshot;
  d?: GameDelta[];
  seq: number;
}

export interface NetGame {
  readonly isHost: boolean;
  /** id do jogador local na sala */
  readonly me: string;
  readonly phase: MatchPhase;
  players(): { id: string; name: string }[];
  /** cliente: pede ao anfitrião (o anfitrião aplica direto) */
  request(e: GameReqKind, data?: { part?: number; who?: string }): void;
  /** anfitrião: muda o estado do jogo (vira delta para todos) */
  apply(d: GameDelta): void;
  /** última foto conhecida (migração de anfitrião retoma daqui) */
  snapshot(): GameSnapshot | null;
  onState(fn: (s: GameSnapshot, d: GameDelta[]) => void): () => void;
  /** anfitrião / líder do grupo: lobby → contagem */
  start(): void;
  dispose(): void;
}

/* ------------------------------ ganchos do PlaySession ------------------------------ */

/** Dados de um evento de jogo (ver ScriptEvent em format.ts). */
export interface GameEventData {
  part?: number | null;
  msg?: string;
  key?: 'a' | 'b';
  /** cutend: id da cena */
  id?: string;
  /** var: nome */
  v?: string;
  /** talk: id do NPC */
  npc?: string;
  /** join / tag: id do jogador */
  who?: string;
}

export interface GameHooks {
  /** o PlaySession avisa eventos de jogo (o diretor/VM decide quem roda) */
  onEvent(kind: ScriptEventKind, data?: GameEventData): void;
  vars: GameVars;
  cutscene(id: string): Promise<void>;
  /** índice da escolha (−1 = sem escolha) */
  dialog(lines: DialogLine[], npc?: string): Promise<number>;
  anim(id: string, on: 'play' | 'stop'): void;
  npc(id: string, act: NpcAct, part?: number): void;
  /** troca de fase: id, ROOT_LEVEL ou 'next' */
  level(to: string): void;
  camera(act: CameraAct, part?: number): void;
  hud(text: string): void;
  /** checkpoint da Historinha */
  save(): void;
  emote(pose: FPose): void;
  input: InputSource;
  net?: NetGame;
}

/** Ganchos que não fazem nada (Studio atual / testes). Cena e diálogo resolvem na hora. */
export function noopHooks(c?: Creation, input: InputSource = noopInput()): GameHooks {
  return {
    onEvent: () => {},
    vars: mapVars(c?.vars),
    cutscene: () => Promise.resolve(),
    dialog: () => Promise.resolve(-1),
    anim: () => {},
    npc: () => {},
    level: () => {},
    camera: () => {},
    hud: () => {},
    save: () => {},
    emote: () => {},
    input,
  };
}

/* ------------- conferência em tempo de compilação: tipos de cinema copiados em format.ts ------------- */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
/** se algum destes virar `false`, src/cinema/format.ts mudou: atualize a cópia em src/studio/format.ts */
export const CINEMA_TYPES_MATCH: [Same<FEase, CEase>, Same<FPose, CPose>, Same<FExpr, CExpr>, Same<FBubble, CBubble>, Same<FFx, CFx>] = [true, true, true, true, true];
