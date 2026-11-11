/* ============================================================
 *  ANOMALIAS — contrato entre o NÚCLEO (core/) e os MAPAS (maps/<id>/).
 *  Cada mapa é um módulo que monta o cenário 3D e descreve onde as
 *  anomalias podem acontecer e quais tarefas (trabalho do turno) existem.
 *  O núcleo cuida de: jogador, câmera/foto, relatório, noites/turnos,
 *  dificuldade, monstro, HUD, save, anúncios. O mapa NÃO tem lógica de jogo.
 *
 *  ---- v1.1 (wip/anocore) — SÓ CAMPOS OPCIONAIS NOVOS, nada quebra ----
 *  · AnomalySlot.npc / minNight / anchor
 *  · RoomDef.icon
 *  · InteractDef.icon / gives / wants / holdSec
 *  · MapBuild.items / taskHandlers / env / nav / creatureSpawns
 *  · npcSpots[].color / scale / hat
 *  · MapBuild.colliders pode ser MUTADO por apply() (porta fechada = caixa a mais);
 *    o núcleo relê o array a cada quadro.
 *  Detalhes de cada campo nos comentários abaixo. Mapa de exemplo completo: maps/hospital/.
 *
 *  Convenções: metros, Y para cima, chão em y=0. Personagens olham para -Z com yaw=0
 *  (yaw = rotação em Y, radianos). Materiais: prefira MeshLambertMaterial (tablets fracos).
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
  /**
   * (v1.1) id de um `npcSpots[].id`: o NÚCLEO cuida do personagem. Tipos tratados pelo núcleo:
   *  'face' (rosto: bravo / bocão com dentinhos / olhos brilhando / sem rosto — 4 variantes),
   *  'move' (vira para olhar o jogador; variante 1 = segue o jogador devagar quando ninguém olha),
   *  'scale', 'color', 'missing' também funcionam no NPC sem código no mapa.
   * `object` pode ser um THREE.Group vazio qualquer; `apply` ainda é chamado (pode ser no-op).
   */
  npc?: string;
  /** (v1.1) só aparece a partir desta noite (1..5). Padrão 1. */
  minNight?: number;
  /**
   * (v1.1) ponto (mundo) que a FOTO precisa enquadrar. Padrão: centro da caixa do `object`
   * medida no início (antes de qualquer anomalia), ou a caixa atual se ele estiver visível.
   * Para 'creature' o núcleo põe o Bocudo espiando neste ponto (ou no centro do objeto).
   */
  anchor?: Vec3;
}

export interface RoomDef {
  id: string;
  name: string; // pt-BR curto
  /** caixa da sala (para saber onde o jogador está) */
  min: Vec3;
  max: Vec3;
  /** pontos de câmera de segurança (monitor) — o 1º também vira a foto de referência do caderno */
  cams: { pos: Vec3; look: Vec3 }[];
  /** (v1.1) emoji/ícone da sala (abas do monitor e do caderno: criança não precisa ler) */
  icon?: string;
}

/** Tarefa do turno (atender cliente, dar remédio, arrumar quarto...). */
export interface InteractDef {
  id: string;
  room: string;
  kind: string; // ex.: 'medicine', 'bed', 'register', 'fryer', 'crib', 'bottle'
  object: THREE.Object3D;
  /** posição onde o jogador fica para usar */
  at: Vec3;
  /** estado visual (ex.: cama arrumada/bagunçada). O núcleo chama 'todo' quando sorteia a tarefa e 'done' ao concluir. */
  setState?(state: string): void;
  /** (v1.1) emoji/ícone da tarefa na lista e no botão de usar */
  icon?: string;
  /**
   * (v1.1) FONTE de itens (armário de remédios, geladeira...): ao usar, a criança escolhe UM destes
   * `MapBuild.items[].id` e passa a carregá-lo. Fontes nunca viram tarefa sozinhas.
   */
  gives?: string[];
  /**
   * (v1.1) DESTINO: o núcleo sorteia UM destes itens por noite (determinístico) e mostra o pedido num
   * balão com o ícone do item; a tarefa conclui quando a criança chega carregando o item certo.
   */
  wants?: string[];
  /** (v1.1) tarefa de "segurar" (encher água, checar monitor): segundos. Sem isto = toque simples. */
  holdSec?: number;
}

/** (v1.1) item carregável (remédio, mamadeira, lanche...). Desenhado pelo núcleo: forma + cor, sem texto. */
export interface ItemDef {
  id: string;
  color: string; // #rrggbb
  shape: 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'drop' | 'moon';
}

/** (v1.1) como o núcleo apresenta uma tarefa (handler próprio do mapa). */
export type TaskAction =
  | { type: 'tap'; icon?: string }
  | { type: 'hold'; icon?: string; sec: number }
  /** escolher 1 de N itens (ids de MapBuild.items); `answer` = certo (sem answer: só pega para carregar) */
  | { type: 'choose'; icon?: string; options: string[]; answer?: string }
  | { type: 'none' };

/** (v1.1) handler de tarefa por `InteractDef.kind`. O núcleo tem padrões para gives/wants/holdSec/toque. */
export interface TaskHandler {
  action(def: InteractDef, st: { carrying: string | null; want: string | null }): TaskAction;
  /** chamado ao concluir (ok=false: escolha errada) */
  finish?(def: InteractDef, ok: boolean, picked?: string): void;
}

export interface MapBuild {
  id: string;
  root: THREE.Group;
  rooms: RoomDef[];
  spawn: { pos: Vec3; yaw: number };
  /** colisão simples: caixas alinhadas aos eixos (paredes, balcões...) — pode ser mutado por apply() (v1.1) */
  colliders: { min: Vec3; max: Vec3 }[];
  slots: AnomalySlot[];
  interacts: InteractDef[];
  /** personagens (NPCs: pacientes, hóspedes, clientes, bebês) — o núcleo anima */
  npcSpots: {
    id: string;
    room: string;
    pos: Vec3;
    yaw: number;
    pose: 'stand' | 'sit' | 'lie';
    /** (v1.1) cor do Bloop (#rrggbb) */
    color?: string;
    /** (v1.1) tamanho (bebê ≈ 0.6). Padrão 1 */
    scale?: number;
    /** (v1.1) chapéu: '' | 'cap' | 'beanie' | 'bow' | 'nurse' | 'chef' */
    hat?: string;
  }[];
  /** luzes principais (o núcleo pode piscar/apagar) */
  setPower(on: boolean): void;
  /** atualização opcional de animações do cenário (ventilador, TV) */
  update?(dt: number): void;
  dispose(): void;

  /** (v1.1) itens carregáveis usados por InteractDef.gives/wants */
  items?: ItemDef[];
  /** (v1.1) handlers próprios por `InteractDef.kind` (substituem o padrão do núcleo) */
  taskHandlers?: Record<string, TaskHandler>;
  /** (v1.1) clima da noite: neblina e luz ambiente. Padrões: hospital azulado. */
  env?: { fog?: string; fogNear?: number; fogFar?: number; sky?: string; ground?: string; ambient?: number; outdoor?: boolean };
  /**
   * (v1.1) grafo de caminhada do Bocudo (pontos no chão + ligações sem parede no meio).
   * Sem isto ele anda reto até o jogador deslizando nas paredes.
   */
  nav?: { nodes: Vec3[]; links: [number, number][] };
  /** (v1.1) onde o Bocudo surge quando começa a caçar (padrão: centro da sala mais longe) */
  creatureSpawns?: Vec3[];
}

export interface MapDef {
  id: string;
  name: string; // nome do cenário (pt-BR)
  icon: string; // emoji provisório para o menu
  build(opts: { tier: 0 | 1 | 2 | 3 }): Promise<MapBuild> | MapBuild;
}
