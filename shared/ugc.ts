/**
 * Conteúdo dos jogadores (UGC): Loja de Criações do Bloop Studio + TV Bloop (filmes do Bloop Cinema).
 * Regras compartilhadas entre o app (src/) e o Worker (server/). O servidor é a fonte da verdade.
 * Documentação: docs/LOJA-TV.md.
 */

export type UgcType = 'criacao' | 'filme';
/** pending = na fila de revisão; hidden = escondida por denúncias (volta para a fila); rejected = recusada. */
export type UgcStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export const UGC = {
  /** JSON da criação (sem compressão) — igual a LIMITS.bytes do formato */
  maxCreationBytes: 512 * 1024,
  /** cada miniatura (data URL JPEG/WebP) */
  maxThumbBytes: 60 * 1024,
  maxThumbs: 3,
  /** teto do servidor por autor/dia (o app pede menos para quem não é Pro) */
  maxPublishPerDay: 20,
  /** denúncias de pessoas diferentes que escondem um item aprovado até a revisão */
  reportHide: 3,
  reward: {
    /** moedas por pessoa diferente que curte (1× por pessoa, para sempre) */
    perLike: 1,
    /** "Usar no meu mapa" (1× por pessoa por criação) */
    perUse: 5,
    /** "Jogar mapa" (1× por pessoa por dia) */
    perPlay: 2,
    /** o Correio recebe um presente quando o acumulado chega a isso */
    payoutMin: 10,
    dailyCapPerCreation: 150,
    dailyCapPerAuthor: 400,
    /** contas mais novas que isso não geram moedas para ninguém (anti-contas falsas) */
    minAccountAgeH: 72,
  },
} as const;

export const TV = {
  /** corpo do envio: projeto + vozes (base64) + miniaturas */
  maxBytes: 3 * 1024 * 1024,
  maxDurSec: 300,
  minDurSec: 3,
  maxFilmsPerDay: 3,
  maxClips: 64,
  /** intervalo entre filmes (vinheta) */
  gapMs: 4000,
  /** a cada N votos (de contas diferentes e confiáveis) o criador ganha `coinsPerReward` */
  votesPerReward: 10,
  coinsPerReward: 20,
  dailyCapPerAuthor: 200,
  /** quantos filmes ficam agendados à frente */
  queue: 4,
} as const;

/** Um filme na grade da TV. `start` = ms do relógio do servidor. */
export interface TvSlot {
  id: string;
  title: string;
  author: string;
  start: number;
  /** duração em ms */
  dur: number;
  votes: number;
  /** filme oficial do Estúdio Bloop (o app desenha do catálogo embutido; dá para Remixar) */
  official?: boolean;
}

export interface TvNow {
  /** relógio do servidor (ms) no momento da resposta */
  now: number;
  cur: TvSlot | null;
  next: TvSlot[];
  /** total de filmes no canal */
  films: number;
}

/** Envio de filme: gravações de voz em base64 (webm/opus ou o que o aparelho gravar). */
export interface TvClip {
  mime: string;
  b64: string;
  dur: number;
  /** transcrição feita no aparelho durante a gravação (melhor esforço; o servidor transcreve de novo com a IA) */
  tx?: string;
}

/* ---------------- moderação por IA das vozes e balões (antes da fila humana) ---------------- */

/** Uma fala apontada pela IA (n = número da fala no filme, 1..). */
export interface TvAiLine {
  id: string;
  n: number;
  text: string;
}
/**
 * Motivo da recusa automática: palavra proibida / dado pessoal na VOZ gravada ou no BALÃO,
 * ou a IA de texto (Claude) achou bullying/conteúdo sexual/etc.
 */
export type TvAiWhy = 'voice-bad' | 'voice-pii' | 'text-bad' | 'text-pii' | 'ai';
export interface TvAiReject {
  why: TvAiWhy;
  lines: TvAiLine[];
}
/** De onde veio a transcrição das vozes: IA da Cloudflare, aparelho, simulação (teste local) ou nenhuma. */
export type TvSttSrc = 'whisper' | 'device' | 'mock' | 'none';
export interface TvPayload {
  project: unknown;
  clips: Record<string, TvClip>;
}

export type UgcReportReason = 'offensive' | 'scary' | 'copy' | 'spam' | 'other';
export const UGC_REPORT_REASONS: UgcReportReason[] = ['offensive', 'scary', 'copy', 'spam', 'other'];
