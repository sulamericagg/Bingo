/** Tipos da conversa com o bichinho (cliente). Mesma lista do servidor (server/ai.ts). */
export const PET_EMOTIONS = ['happy', 'love', 'excited', 'calm', 'sleepy', 'hungry', 'sad', 'surprised', 'silly', 'shy'] as const;
export const PET_ACTIONS = ['dance', 'jump', 'sleep', 'laugh', 'eat'] as const;
export type PetEmotion = (typeof PET_EMOTIONS)[number];
export type PetAction = (typeof PET_ACTIONS)[number];

export interface TalkTurn {
  role: 'user' | 'pet';
  text: string;
}

export interface TalkReply {
  reply: string;
  emotion: PetEmotion;
  action?: PetAction;
  /** 'ai' = servidor; 'safety' = resposta segura do servidor; 'local' = bot do aparelho */
  source: 'ai' | 'safety' | 'local';
}

/** Retrato do bichinho mandado ao cérebro (sem dados pessoais). */
export interface PetSnapshot {
  name: string;
  food: number;
  clean: number;
  fun: number;
  energy: number;
  level: number;
  sleeping: boolean;
  /** necessidade mais urgente (abaixo de 30) */
  worst: 'food' | 'clean' | 'fun' | 'energy' | null;
}
