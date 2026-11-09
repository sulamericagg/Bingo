/**
 * CONTRATO DO MINIGAME MUSICAL "Bloop Banda".
 * Agente "canções" implementa src/music/songs/* (catálogo + sintetizador + gerador de charts).
 * Agente "jogo musical" implementa src/games/band/* (pista de notas, banda, multiplayer, criador).
 * TODAS as músicas são composições ORIGINAIS do jogo (sem recriar músicas reais).
 */
export type Instrument = 'drums' | 'bass' | 'guitar' | 'keys' | 'vocals';
export type Difficulty = 'facil' | 'medio' | 'dificil' | 'expert';

/** Nota: tempo e duração em BATIDAS; lane 0..4 (fácil usa só 0..2, médio 0..3). */
export interface Note {
  b: number;
  lane: number;
  len?: number; // nota longa (segurar)
}

export interface SongDef {
  id: string; // estável, ex.: 'free-03', 's12-mega'
  title: string; // pt-BR (traduzível: t('song.<id>', title))
  band: string; // banda FICTÍCIA do jogo
  style: string; // 'rock-arena' | 'metal' | 'pop' | 'funk' | 'eletronica' | 'samba' | ...
  bpm: number;
  bars: number;
  durationSec: number;
  tier: 'free' | 'pass' | 'mega' | 'creator';
  season?: number; // 0..59 quando vem de passe
  stage: string; // id do palco/cenário
  charts: Partial<Record<Instrument, Partial<Record<Difficulty, Note[]>>>>;
}

export interface SongPlayer {
  start(atSec?: number): void;
  stop(): void;
  /** tempo atual da música em segundos (fonte da verdade para sincronizar notas) */
  time(): number;
  /** abaixa/abafa um instrumento quando o jogador erra (feedback clássico) */
  setTrackGain(inst: Instrument, gain: number): void;
  /** toca um "erro" curto no timbre do instrumento */
  miss(inst: Instrument): void;
  onEnd(cb: () => void): void;
}

export interface SongsModule {
  SONGS: SongDef[];
  songById(id: string): SongDef | undefined;
  /** músicas destravadas: grátis + passes + criações do jogador */
  createPlayer(song: SongDef, ctx: AudioContext, out: AudioNode): SongPlayer;
}
