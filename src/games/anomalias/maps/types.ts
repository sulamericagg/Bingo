/* ============================================================
 *  ANOMALIAS — contrato entre o NÚCLEO (core/) e os MAPAS (maps/<id>/).
 *  Cada mapa é um módulo que monta o cenário 3D e descreve onde as
 *  anomalias podem acontecer e quais tarefas (trabalho do turno) existem.
 *  O núcleo cuida de: jogador, câmera/foto, relatório, noites/turnos,
 *  dificuldade, monstro, HUD, save, anúncios. O mapa NÃO tem lógica de jogo.
 * ============================================================ */
import type * as THREE from 'three';

export type Vec3 = { x: number; y: number; z: number };

/** Tipos de anomalia que um ponto suporta (o núcleo sorteia). */
export type AnomalyKind =
  | 'move' // objeto fora do lugar
  | 'missing' // objeto sumiu
  | 'extra' // objeto a mais / duplicado
  | 'swap' // objeto trocado por outro
  | 'color' // cor/textura errada
  | 'scale' // tamanho errado
  | 'rotate' // virado / de cabeça pra baixo
  | 'light' // luz piscando / cor da luz
  | 'door' // porta aberta/fechada errada
  | 'face' // personagem com rosto errado (boca aberta, olhos)
  | 'creature' // criatura escondida/aparecendo
  | 'picture' // quadro/tela mudou
  | 'sound'; // som estranho vindo dali

export interface AnomalySlot {
  id: string;
  room: string;
  kinds: AnomalyKind[];
  /** objeto alvo (o núcleo usa para foto/raycast) */
  object: THREE.Object3D;
  /** liga/desliga a variação; `variant` escolhe entre opções do mapa (0..variants-1) */
  apply(kind: AnomalyKind, on: boolean, variant: number): void;
  variants?: number;
}

export interface RoomDef {
  id: string;
  name: string; // pt-BR curto
  /** caixa da sala (para saber onde o jogador está) */
  min: Vec3;
  max: Vec3;
  /** pontos de câmera de segurança (monitor) */
  cams: { pos: Vec3; look: Vec3 }[];
}

/** Tarefa do turno (atender cliente, dar remédio, arrumar quarto...). */
export interface InteractDef {
  id: string;
  room: string;
  kind: string; // ex.: 'medicine', 'bed', 'register', 'fryer', 'crib', 'bottle'
  object: THREE.Object3D;
  /** posição onde o jogador fica para usar */
  at: Vec3;
  /** estado visual (ex.: cama arrumada/bagunçada) */
  setState?(state: string): void;
}

export interface MapBuild {
  id: string;
  root: THREE.Group;
  rooms: RoomDef[];
  spawn: { pos: Vec3; yaw: number };
  /** colisão simples: caixas alinhadas aos eixos (paredes, balcões...) */
  colliders: { min: Vec3; max: Vec3 }[];
  slots: AnomalySlot[];
  interacts: InteractDef[];
  /** personagens (NPCs: pacientes, hóspedes, clientes, bebês) — o núcleo anima */
  npcSpots: { id: string; room: string; pos: Vec3; yaw: number; pose: 'stand' | 'sit' | 'lie' }[];
  /** luzes principais (o núcleo pode piscar/apagar) */
  setPower(on: boolean): void;
  /** atualização opcional de animações do cenário (ventilador, TV) */
  update?(dt: number): void;
  dispose(): void;
}

export interface MapDef {
  id: string;
  name: string; // nome do cenário (pt-BR)
  icon: string; // emoji provisório para o menu
  build(opts: { tier: 0 | 1 | 2 | 3 }): Promise<MapBuild> | MapBuild;
}
