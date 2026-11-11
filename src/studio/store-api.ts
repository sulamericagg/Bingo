/* ============================================================
 *  BLOOP STUDIO — LOJA DE CRIAÇÕES: interface do cliente.
 *  Servidor (store-server.ts → Worker /api/ugc/*, docs/LOJA-TV.md) com o
 *  mock local (store-mock.ts) como reserva sem internet. MESMA interface. Sem dinheiro real: publicar é grátis; criadores ganham MOEDAS
 *  do jogo quando outras pessoas usam/jogam suas criações (regra abaixo,
 *  aplicada de verdade no servidor).
 * ============================================================ */
import type { Creation, CreationKind } from './format';
import { UGC } from '../../shared/ugc';

export type StoreCategory = 'vehicles' | 'buildings' | 'nature' | 'gadgets' | 'furniture' | 'maps' | 'art';
export const STORE_CATEGORIES: StoreCategory[] = ['vehicles', 'buildings', 'nature', 'gadgets', 'furniture', 'maps', 'art'];
export type StoreSort = 'trending' | 'new' | 'top';

export interface StoreAuthor {
  id: string;
  name: string;
}

/** Etiquetas dos Jogos da Comunidade */
export const GAME_TAGS = ['corrida', 'obstaculos', 'fisica', 'captura', 'enigma', 'festa', 'aventura', 'coleta'] as const;
export type GameTag = (typeof GAME_TAGS)[number];

/** Mapa publicado como JOGO: título/descrição/etiquetas + 3 fotos tiradas do mapa. */
export interface GameListing {
  title: string;
  desc: string;
  tags: string[];
  maxPlayers: number;
  /** 3 miniaturas (ângulos diferentes) — no servidor passam por classificador de imagem + fila de revisão */
  thumbs: string[];
}

/** Moderação no servidor: classificador de imagem nas miniaturas + denúncias + fila do admin. */
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'needs-changes' | 'hidden';
export interface ReviewTicket {
  /** id da listagem */
  id: string;
  status: ReviewStatus;
  /** motivo amigável quando rejeitado / pede mudanças */
  reason?: string;
}

export interface ScoreEntry {
  name: string;
  score: number;
  timeSec: number;
  me?: boolean;
}

export interface StoreListing {
  /** id da listagem (= id da criação publicada) */
  id: string;
  kind: CreationKind;
  name: string;
  author: StoreAuthor;
  category: StoreCategory;
  thumb?: string;
  /** hash do conteúdo (format.hashCreation) */
  hash: string;
  parts: number;
  likes: number;
  /** vezes que foi colocada no mapa de alguém */
  uses: number;
  /** vezes que o mapa foi jogado */
  plays: number;
  created: number;
  /** eu curti */
  liked?: boolean;
  /** feita pela equipe (criações iniciais) */
  official?: boolean;
  /** mundo (mapas) */
  worldKind?: Creation['worldKind'];
  /** é um Jogo da Comunidade */
  game?: GameListing;
  favorites?: number;
  /** eu favoritei */
  fav?: boolean;
  /** estado da revisão (só aparece para o autor) */
  review?: ReviewStatus;
  /** motivo da recusa (só para o autor) */
  reviewReason?: string;
  /** é minha (servidor) */
  own?: boolean;
}

export interface BrowseQuery {
  sort: StoreSort;
  /** 'games' = Jogos da Comunidade; 'creations' = peças para usar no mapa */
  section?: 'games' | 'creations';
  tag?: string;
  /** só os meus favoritos */
  favorites?: boolean;
  category?: StoreCategory;
  kind?: CreationKind;
  /** busca por nome */
  text?: string;
  cursor?: string;
  limit?: number;
}

export interface StorePage {
  items: StoreListing[];
  next?: string;
}

export type PublishError = 'name' | 'invalid' | 'daily-limit' | 'too-big' | 'empty' | 'offline';
export type PublishResult = { ok: true; listing: StoreListing } | { ok: false; error: PublishError };

export type ReportReason = 'offensive' | 'scary' | 'copy' | 'spam' | 'other';

export interface UseReceipt {
  /** contou como uso novo (primeira vez desta pessoa nesta criação) */
  counted: boolean;
  /** moedas que o AUTOR ganhou com isso (0 se não contou) */
  authorCoins: number;
}

export interface Earnings {
  /** moedas a receber */
  pending: number;
  /** total já recebido */
  total: number;
}

/**
 * Regra das moedas do criador (o servidor é a fonte da verdade):
 *  - cada PESSOA diferente que coloca a criação no mapa dela = `perUse` moedas;
 *  - cada pessoa diferente que JOGA um mapa publicado = `perPlay` moedas;
 *  - autouso não conta; cada pessoa conta 1× por criação (uso) e 1× por dia (jogar);
 *  - teto por criação por dia (`dailyCapPerCreation`) e por autor por dia (`dailyCapPerAuthor`);
 *  - cada pessoa diferente que CURTE = `perLike` (só a 1ª curtida dela conta, para sempre); autocurtida não conta;
 *  - contas novas (< `minAccountAgeH`) e criações denunciadas/ocultas não geram moedas;
 *  - o acumulado vira um presente no CORREIO quando chega a `payoutMin` — nunca dinheiro real.
 *  Valores em shared/ugc.ts (UGC.reward).
 */
export const CREATOR_REWARD = UGC.reward;

export interface StudioStoreApi {
  browse(q: BrowseQuery): Promise<StorePage>;
  /** baixa a criação completa (validada) */
  get(id: string): Promise<{ listing: StoreListing; creation: Creation } | null>;
  /** publicar é grátis (limite diário: pro.ts publishLimit) */
  publish(c: Creation, category: StoreCategory, dailyLimit: number, thumbs?: string[]): Promise<PublishResult>;
  like(id: string, on: boolean): Promise<number>;
  report(id: string, reason: ReportReason, note?: string): Promise<void>;
  /** "Ocultar autor": some da loja deste jogador (listagens e mapas) */
  hideAuthor(authorId: string): Promise<void>;
  unhideAuthor(authorId: string): Promise<void>;
  hiddenAuthors(): Promise<string[]>;
  /** registrar uso: 'place' = "Usar no meu mapa"; 'play' = "Jogar mapa" */
  recordUse(id: string, kind: 'place' | 'play'): Promise<UseReceipt>;
  /** minhas publicações */
  mine(): Promise<StoreListing[]>;
  unpublish(id: string): Promise<void>;
  earnings(): Promise<Earnings>;
  /** resgata as moedas a receber (o chamador credita com addCoins) */
  claimEarnings(): Promise<number>;
  /** publicações feitas hoje (para o limite diário) */
  publishedToday(): Promise<number>;

  /* ---- Jogos da Comunidade ---- */
  /** envia um mapa (com creation.game preenchido) + 3 miniaturas para revisão; aparece na loja quando aprovado */
  submitForReview(c: Creation, thumbnails: string[], dailyLimit: number): Promise<ReviewTicket | { error: PublishError }>;
  reviewStatus(id: string): Promise<ReviewTicket | null>;
  favorite(id: string, on: boolean): Promise<number>;
  /** placar do jogo (por jogador: melhor pontuação / tempo) */
  submitScore(id: string, r: { score: number; timeSec: number }): Promise<{ rank: number }>;
  leaderboard(id: string): Promise<ScoreEntry[]>;
}
