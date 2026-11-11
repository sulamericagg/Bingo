/* ============================================================
 *  MUNDO — interface pública do motor (para módulos de conteúdo:
 *  blocos, bichos, veículos, minigames). Veja docs/MUNDO-MOTOR.md.
 *  Módulos recebem um `MundoAPI` em `install(api)` e nunca mexem
 *  direto nas classes internas (World, VoxWorld, WorldGame).
 * ============================================================ */
import type * as THREE from 'three';
import type { Chunk } from './chunk';
import type { ItemDef, Recipe } from './items';

export type GameMode = 'sobrevivencia' | 'criativo' | 'pacifico';
export type WorldType = 'normal' | 'plano' | 'ilhas' | 'flutuantes';

/** um bicho, projétil, vagonete, objeto… atualizado pelo motor a cada quadro */
export interface Entity {
  /** tipo (ex.: 'mob:gosmento', 'cart') — usado no save e na rede */
  kind: string;
  /** id único na partida (o motor preenche se 0) */
  id: number;
  x: number;
  y: number;
  z: number;
  /** raio e altura de colisão/mira */
  r: number;
  h: number;
  hp: number;
  /** hostil (dá dano, alvo de armas) */
  hostile?: boolean;
  /** passo de simulação; devolva false para ser removido */
  update(dt: number, api: MundoAPI): boolean;
  /** levou dano (arma, explosão, lava). `from` = 'player' | 'boom' | … */
  hit?(dmg: number, from: string, api: MundoAPI): void;
  /** o jogador tocou "usar" mirando nele (montar, ordenhar, abrir…) */
  interact?(api: MundoAPI): void;
  /** estado para o save (null = não salvar) */
  save?(): Record<string, unknown> | null;
  dispose(api: MundoAPI): void;
}

export interface MundoEvents {
  /** pedaço de 32×32 m carregado / descarregado */
  chunkLoad: (c: Chunk) => void;
  chunkUnload: (c: Chunk) => void;
  /** 1×/quadro depois da física */
  tick: (dt: number) => void;
  /** amanheceu / anoiteceu */
  dayChange: (night: boolean) => void;
  /** materiais minerados (índice de material → amostras) */
  mined: (counts: Map<number, number>, x: number, y: number, z: number) => void;
  boom: (x: number, y: number, z: number, r: number) => void;
  /** jogador morreu / renasceu */
  death: () => void;
  /** salvar: devolva dados extras do seu módulo em out[nomeDoModulo] */
  save: (out: Record<string, unknown>) => void;
  /** carregar: recebe o mesmo objeto */
  load: (data: Record<string, unknown>) => void;
}

export interface MundoAPI {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly mode: GameMode;
  readonly seed: number;
  /** tempo de jogo (s) e hora do dia 0..1 (0 = meia-noite, 0.5 = meio-dia) */
  readonly time: number;
  readonly dayT: number;
  isNight(): boolean;
  /** qualidade 0 (fraco) … 3 (forte) */
  readonly tier: number;

  /* terreno */
  heightAt(x: number, z: number): number;
  /** chão andável debaixo de (x,y,z) — cavernas e construções incluídas */
  floorAt(x: number, y: number, z: number): number;
  /** densidade (m): > 0 sólido */
  dens(x: number, y: number, z: number): number;
  /** material do subsolo (enum M de vox.ts) */
  matAt(x: number, y: number, z: number): number;
  isWater(x: number, z: number): boolean;
  waterLevel(x: number, z: number): number;
  biomeAt(x: number, z: number): number;
  /** escava (fill<0) ou enche (fill = material) uma esfera; devolve amostras mudadas */
  editTerrain(x: number, y: number, z: number, r: number, fill: number, maxHard?: number): number;
  /** raio contra o terreno: distância ou -1 */
  rayTerrain(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number;

  /* jogador */
  readonly player: { x: number; y: number; z: number; yaw: number; pitch: number; hp: number; maxHp: number; driving: boolean };
  hurtPlayer(n: number, why: string): void;
  healPlayer(n: number): void;
  feedPlayer(n: number): void;

  /* inventário */
  give(id: string, n?: number): number;
  take(id: string, n?: number): boolean;
  count(id: string): number;
  /** item na mão (id ou '') */
  held(): string;

  /* registros */
  registerItem(d: ItemDef): void;
  registerRecipe(r: Recipe): void;
  /** peça colocável: chamado ao colocar o item `place` */
  registerPlaceable(id: string, p: Placeable): void;

  /* entidades */
  addEntity(e: Entity): Entity;
  removeEntity(e: Entity): void;
  entities(): readonly Entity[];
  /** entidades num raio */
  near(x: number, z: number, r: number, out?: Entity[]): Entity[];

  /* eventos */
  on<K extends keyof MundoEvents>(ev: K, f: MundoEvents[K]): () => void;

  /* efeitos */
  toast(msg: string, kind?: 'info' | 'good' | 'warn'): void;
  burst(n: number, x: number, y: number, z: number, color: string, speed: number): void;
  sfx(name: 'click' | 'coin' | 'crack' | 'tick' | 'cash'): void;
}

/** objeto colocável no mundo (bloco de conteúdo, máquina, enfeite) */
export interface Placeable {
  /** cria o visual/colisão em (x,y,z) com rotação yaw; devolve uma Entity (ou null para peças só visuais) */
  place(api: MundoAPI, x: number, y: number, z: number, yaw: number, data?: Record<string, unknown>): Entity | null;
  /** encaixe: 'grade' (2 m), 'livre' (0,5 m) */
  snap?: 'grade' | 'livre';
}

/** módulo de conteúdo */
export interface MundoModule {
  name: string;
  install(api: MundoAPI): void;
}

/** pequeno barramento de eventos tipado */
export class Bus {
  private m = new Map<string, Set<(...a: any[]) => void>>();
  on<K extends keyof MundoEvents>(ev: K, f: MundoEvents[K]): () => void {
    let s = this.m.get(ev);
    if (!s) this.m.set(ev, (s = new Set()));
    s.add(f as (...a: any[]) => void);
    return () => s!.delete(f as (...a: any[]) => void);
  }
  emit<K extends keyof MundoEvents>(ev: K, ...a: Parameters<MundoEvents[K]>): void {
    const s = this.m.get(ev);
    if (s) for (const f of s) f(...a);
  }
}

/** módulos registrados antes de o mundo abrir (conteúdo extra) */
export const MODULES: MundoModule[] = [];
export function registerModule(m: MundoModule): void {
  if (!MODULES.some((x) => x.name === m.name)) MODULES.push(m);
}
