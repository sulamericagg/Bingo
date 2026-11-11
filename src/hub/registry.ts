/**
 * CONTRATO DO HUB DE JOGOS — todos os minigames e painéis se registram aqui.
 * O hub (menu com setas entre jogos) lê este registro; cada jogo é um módulo
 * carregado sob demanda (dynamic import) para manter a abertura rápida.
 */
import type { IconName } from '../ui/icons';
import { bus } from '../core/events';

export interface HubTheme {
  /** gradiente do fundo do menu desse jogo */
  bg: [string, string];
  /** cor de destaque (botão JOGAR, abas) */
  accent: string;
  accent2: string;
  /** cor do texto do título */
  title: [string, string];
}

export interface MiniGameHandle {
  /** remove canvas/DOM/listeners e para loops */
  destroy(): void;
  pause?(): void;
  resume?(): void;
  /**
   * Há uma partida em andamento agora? Com true, o "Sair do jogo?" avisa que o progresso pode ser
   * perdido; sem o método (ou false: menu, garagem, resultado) o texto é neutro.
   */
  inMatch?(): boolean;
}

export interface MiniGameDef {
  id: string; // 'orbit' | 'tubo' | 'rally' | 'tycoon' | ...
  name: string; // já traduzido via t()
  tagline: string;
  icon: IconName;
  theme: HubTheme;
  /** Desenha a vitrine do jogo no menu (personagem/cenário animado). Opcional. */
  drawShowcase?(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  /** Abre o jogo em tela cheia dentro de `root`. Ao sair, o jogo chama `exit()`. */
  launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle>;
  /** true se tiver modo online opcional (jogadores entram/saem a qualquer momento) */
  online?: boolean;
  /** true: sem o botão manual de girar tela do hub (.gh-rot) — o jogo é sempre paisagem automática */
  noRotate?: boolean;
}

/** Painéis globais acessíveis do hub (Loja, Passe, Bichinho, Social, Campeonatos...). */
export interface HubPanelDef {
  id: string;
  label: string;
  icon: IconName;
  open(): void;
  /** número/texto para badge vermelho, ou 0/'' */
  badge?(): number | string;
  /** ordem na barra inferior (menor = mais à esquerda); undefined = só em menus secundários */
  navOrder?: number;
  /** destaque pulsante na barra inferior (ex.: novidade) */
  highlight?(): boolean;
}

const games: MiniGameDef[] = [];
const panels: HubPanelDef[] = [];

export function registerGame(g: MiniGameDef): void {
  if (!games.find((x) => x.id === g.id)) games.push(g);
  bus.emit('hub-registry');
}
export function registerPanel(p: HubPanelDef): void {
  if (!panels.find((x) => x.id === p.id)) panels.push(p);
  bus.emit('hub-registry');
}
export const listGames = (): readonly MiniGameDef[] => games;
export const listPanels = (): readonly HubPanelDef[] => panels;

/**
 * TODO jogo chama ao terminar uma partida. Passe de batalha (XP/desafios),
 * missões, bichinho (fome/humor) e campeonatos escutam 'run-end'.
 * As moedas da partida o próprio jogo credita com addCoins() ANTES de chamar.
 */
export interface RunReport {
  game: string;
  score: number;
  coins: number;
  durationSec: number;
  won?: boolean; // modos versus/corrida
  place?: number; // colocação em corrida/campeonato (1 = primeiro)
  stats?: Record<string, number>; // ex.: { perfects: 3, asteroids: 2, distance: 840 }
}
export function reportRun(r: RunReport): void {
  bus.emit('run-end', r);
}
