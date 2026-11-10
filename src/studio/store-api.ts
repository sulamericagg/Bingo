/* ============================================================
 *  BLOOP STUDIO — LOJA DE CRIAÇÕES: interface do cliente.
 *  Hoje: mock local (store-mock.ts). Depois: servidor (Worker) com a MESMA
 *  interface. Sem dinheiro real: publicar é grátis; criadores ganham MOEDAS
 *  do jogo quando outras pessoas usam/jogam suas criações (regra abaixo,
 *  aplicada de verdade no servidor).
 * ============================================================ */
import type { Creation, CreationKind } from './format';

export type StoreCategory = 'vehicles' | 'buildings' | 'nature' | 'gadgets' | 'furniture' | 'maps' | 'art';
export const STORE_CATEGORIES: StoreCategory[] = ['vehicles', 'buildings', 'nature', 'gadgets', 'furniture', 'maps', 'art'];
export type StoreSort = 'trending' | 'new' | 'top';

export interface StoreAuthor {
  id: string;
  name: string;
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
}

export interface BrowseQuery {
  sort: StoreSort;
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
 *  - contas novas (< `minAccountAgeDays`) e criações denunciadas/ocultas não geram moedas;
 *  - moedas ficam "a receber" e o criador resgata (claimEarnings) — nunca dinheiro real.
 */
export const CREATOR_REWARD = {
  perUse: 5,
  perPlay: 2,
  dailyCapPerCreation: 150,
  dailyCapPerAuthor: 400,
  minAccountAgeDays: 3,
} as const;

export interface StudioStoreApi {
  browse(q: BrowseQuery): Promise<StorePage>;
  /** baixa a criação completa (validada) */
  get(id: string): Promise<{ listing: StoreListing; creation: Creation } | null>;
  /** publicar é grátis (limite diário: pro.ts publishLimit) */
  publish(c: Creation, category: StoreCategory, dailyLimit: number): Promise<PublishResult>;
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
}
