/**
 * BLOOP ENGINE — contratos compartilhados entre o app (src/) e o Worker (server/) para os
 * JOGOS DA COMUNIDADE (formato v4 do Bloop Studio). Plano: docs/ENGINE-PLANO.md §2.4/§2.8.
 *
 * Arquivo "append-only" (W0): só acrescente; mudar/remover algo exige combinar com todas as frentes.
 * Sem dependências de DOM/three — roda no Worker.
 *
 * Decisões do produto (v1):
 *  - online: no máximo 8 jogadores por sala (WorldRoom MUNDO_MAX);
 *  - PRIVATE = só quem está AGORA no mesmo grupo (squad) que o autor;
 *  - TODO caminho que não seja do próprio autor exige aprovação de um admin/moderador
 *    (inclusive privado e com senha);
 *  - UNLISTED abre com código de figuras (4 de 12 ícones) OU senha de texto.
 */
import type { UgcStatus } from './ugc';

/** Quem pode jogar. */
export const VISIBILITIES = ['public', 'unlisted', 'private', 'scheduled'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Modos de jogo oferecidos ao jogador. */
export const PLAY_MODES = ['solo', 'story', 'online'] as const;
export type PlayMode = (typeof PLAY_MODES)[number];

export const ENGINE = {
  /** JSON de um jogo v4 (= LIMITS.gameBytes em src/studio/format.ts = UGC.maxGameBytes) */
  maxGameBytes: 1024 * 1024,
  /** jogadores numa sala online (v1) */
  maxPlayersOnline: 8,
  /** estreia: entre +1 h e +30 dias a partir do envio/ajuste (o admin pode sobrescrever) */
  premiereMinMs: 3600_000,
  premiereMaxMs: 30 * 86400_000,
  /** desbloqueio (senha): tentativas por (jogador, jogo) e por IP */
  unlockPerPlayer: { n: 5, ms: 10 * 60_000 },
  unlockPerIp: { n: 30, ms: 3600_000 },
  /** código de figuras: N ícones escolhidos entre PICTURE_CODE_ICONS (com repetição) */
  pictureCodeLen: 4,
  /** senha de texto */
  pwMin: 4,
  pwMax: 16,
  /** PBKDF2-SHA256 (CPU do Worker): iterações */
  pbkdf2Iter: 20_000,
  /** token de "▶ Jogar aqui" do painel admin */
  reviewTokenMs: 30 * 60_000,
  /** cache da checagem de grupo (squad) no isolate */
  squadCacheMs: 30_000,
  /** código curto de compartilhar (jogos com senha): `?jogo=<code>` */
  shareCodeLen: 6,
  /** salas automáticas por jogo: 'G' + 5 caracteres */
  roomPrefix: 'G',
  roomCodeLen: 6,
  /** reserva de vaga ao casar numa sala (mesmo padrão dos SLOTS oficiais) */
  reserveMs: 12_000,
  /** capa + até 2 fotos extras */
  maxShots: 3,
  /** "Pedir mudanças": texto livre */
  reasonMax: 160,
  /** lista de jogos: cards por página */
  pageSize: 24,
} as const;

/**
 * Os 12 ícones do código de figuras (ids de src/studio/ui/sicons.ts). A ORDEM é o contrato:
 * o código vai ao servidor como índices 0..11 (ver pictureCodeString).
 */
export const PICTURE_CODE_ICONS = ['sun', 'moon', 'star', 'heart', 'cat', 'fish', 'apple', 'car', 'tree', 'flower', 'ball', 'rocket'] as const;
export type PictureIcon = (typeof PICTURE_CODE_ICONS)[number];

/** Senha de um jogo UNLISTED: figuras (índices em PICTURE_CODE_ICONS) ou texto. Nunca volta do servidor. */
export type GamePassword = { kind: 'pic'; icons: number[] } | { kind: 'text'; text: string };

/** Forma canônica (é isso que o servidor passa pelo PBKDF2). null = senha inválida. */
export function passwordString(pw: unknown): string | null {
  if (!pw || typeof pw !== 'object') return null;
  const p = pw as Record<string, unknown>;
  if (p.kind === 'pic') {
    const ic = p.icons;
    if (!Array.isArray(ic) || ic.length !== ENGINE.pictureCodeLen || !ic.every((i) => Number.isInteger(i) && i >= 0 && i < PICTURE_CODE_ICONS.length)) return null;
    return 'pic:' + ic.join('-');
  }
  if (p.kind === 'text' && typeof p.text === 'string') {
    const t = p.text.normalize('NFC').trim().toLowerCase();
    if (t.length < ENGINE.pwMin || t.length > ENGINE.pwMax || /[\u0000-\u001f\u007f]/.test(t)) return null;
    return 'txt:' + t;
  }
  return null;
}

/** Estreia aceita? (`now` = relógio do servidor) */
export function premiereOk(at: unknown, now: number): at is number {
  return typeof at === 'number' && Number.isFinite(at) && at >= now + ENGINE.premiereMinMs - 60_000 && at <= now + ENGINE.premiereMaxMs;
}

/**
 * Resultado de UgcHub.canPlay(id, pid, ctx). Fonte única da verdade em TODOS os caminhos de conteúdo
 * (/api/ugc/get, /thumb, /browse, /api/servers/list, entrada no WorldRoom, /api/games/*).
 */
export type CanPlay = 'ok' | 'not_found' | 'pending' | `premiere:${number}` | 'locked' | 'private';
/** Motivos de recusa devolvidos ao app (403 { error }). */
export type GameDenied = 'not_found' | 'pending' | 'premiere' | 'locked' | 'private';

/** Status de uma VERSÃO do jogo (a do item é a da versão no ar). */
export type GameVersionStatus = Extract<UgcStatus, 'pending' | 'approved' | 'rejected' | 'needs-changes'>;

/** Motivos prontos de "Pedir mudanças" (o painel mostra com texto amigável; + texto livre ≤ reasonMax). */
export const CHANGE_REASONS = ['text', 'cover', 'stuck', 'copy', 'scary', 'other'] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];

/** Resumo dos modos para o card. */
export interface GameModesCard {
  solo: boolean;
  story: boolean;
  /** null = sem online */
  online: { min: number; max: number } | null;
}

/** Card de jogo (listas do Mundo › 🎮 Jogos e da Loja › Jogos). */
export interface GameCard {
  /** id do item (= id da criação) */
  item: string;
  title: string;
  /** apelido público do autor */
  author: string;
  /** id público do autor (aid) */
  aid: string;
  /** URL da capa (thumbs[0]) — ausente se ainda não pode ser mostrada */
  cover?: string;
  tags: string[];
  likes: number;
  plays: number;
  modes: GameModesCard;
  levels: number;
  vis: Visibility;
  /** ms (relógio do servidor) — só 'scheduled' */
  premiere?: number;
  /** unlisted ainda não desbloqueado por quem pediu */
  locked?: boolean;
  /** jogadores agora nas salas deste jogo */
  live?: number;
  /** hash da versão no ar */
  hash: string;
  /** só nos itens do próprio autor */
  status?: UgcStatus;
  /** só nos itens do próprio autor: versão em análise (≠ hash no ar) */
  pendingHash?: string;
  /** só nos itens do próprio autor: motivos de "Pedir mudanças"/recusa */
  reason?: string;
  mine?: boolean;
}

export type GameSort = 'hot' | 'new' | 'top' | 'soon';

export interface GameListQuery {
  pid?: string;
  sort?: GameSort;
  tag?: string;
  /** grupo atual (para ver jogos privados) */
  squad?: string;
  text?: string;
  cursor?: string;
  mine?: boolean;
}
export interface GameListResult {
  /** relógio do servidor (contagens regressivas) */
  now: number;
  cards: GameCard[];
  cursor?: string;
}

/** POST /api/games/submit — `id` é o id do JOGADOR (como em /api/ugc/*). */
export interface GameSubmit {
  id: string;
  /** Creation v4 (o servidor roda validate() + hashCreation + teto ENGINE.maxGameBytes) */
  creation: unknown;
  /** data URL ≤ UGC.maxThumbBytes */
  cover: string;
  /** até ENGINE.maxShots - 1 fotos extras */
  shots: string[];
  vis: Visibility;
  /** obrigatório se vis = 'unlisted' */
  pw?: GamePassword;
  /** obrigatório se vis = 'scheduled' */
  premiere?: number;
  /** limite diário do app (Pro × grátis); o servidor ainda aplica UGC.maxPublishPerDay */
  dailyLimit: number;
}
/** POST /api/games/settings — só o autor; não passa por nova revisão (o conteúdo não muda). */
export interface GameSettings {
  id: string;
  item: string;
  vis?: Visibility;
  pw?: GamePassword;
  premiere?: number;
}
export interface GameSubmitResult {
  item: string;
  hash: string;
  status: GameVersionStatus;
  /** recusa automática (texto impróprio/dado pessoal) com motivo amigável */
  reason?: string;
}
/** GET /api/games/get → 200 GameGetResult | 403 { error: GameDenied, premiere?, now } */
export interface GameGetResult {
  listing: GameCard;
  creation: unknown;
}
export interface GameDeniedBody {
  error: GameDenied;
  premiere?: number;
  now: number;
}
export interface GameUnlock {
  id: string;
  item: string;
  pw: GamePassword;
}
export interface GameMatch {
  id: string;
  item: string;
  squad?: string;
}
export interface GameMatchResult {
  /** código da sala do WorldRoom (ENGINE.roomPrefix + …) */
  code: string;
}

/** Rotas /api/games/* (registradas em server/index.ts → server/games.ts). */
export const GAME_ROUTES = [
  'POST /api/games/submit',
  'POST /api/games/settings',
  'GET /api/games/list',
  'GET /api/games/get',
  'POST /api/games/unlock',
  'GET /api/games/code',
  'POST /api/games/match',
  'POST /api/games/party-room',
  'GET /api/games/review',
] as const;
export type GameRoute = (typeof GAME_ROUTES)[number];
