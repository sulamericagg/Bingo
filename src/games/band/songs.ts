/* ============================================================
 *  CATÁLOGO EM TEMPO DE EXECUÇÃO
 *  - Carrega src/music/songs/index.ts (agente "canções") via import.meta.glob,
 *    então o jogo compila mesmo antes do módulo existir.
 *  - Demos embutidas + criações do Estúdio tocam no sintetizador de reserva.
 * ============================================================ */
import type { SongDef, SongPlayer, SongsModule } from '../../music/api';
import { t } from '../../i18n';
import { arrangementSong, decodeArrangement, DEMO_ARRS, type Score } from './arrange';
import { ScorePlayer } from './synth';
import { bs, ownsSeasonPass } from './save';
import { save } from '../../core/storage';

let mod: SongsModule | null = null;
let loaded = false;
const scores = new Map<string, Score>();
const demos: SongDef[] = [];
let creatorSongs: SongDef[] = [];

for (const d of DEMO_ARRS) {
  const { song, score } = arrangementSong(d.arr, d.id, 'free', d.band, d.style);
  scores.set(song.id, score);
  demos.push(song);
}

export async function loadSongsModule(): Promise<SongsModule | null> {
  if (loaded) return mod;
  loaded = true;
  try {
    const mods = import.meta.glob('../../music/songs/index.ts');
    const load = Object.values(mods)[0];
    if (load) {
      const m = (await load()) as Partial<SongsModule>;
      if (m && Array.isArray(m.SONGS) && typeof m.createPlayer === 'function') mod = m as SongsModule;
    }
  } catch {
    mod = null;
  }
  return mod;
}

export const hasCatalog = (): boolean => !!mod;

export function refreshCreations(): void {
  creatorSongs = [];
  for (const c of bs.creations) {
    const a = decodeArrangement(c.code);
    if (!a) continue;
    const { song, score } = arrangementSong(a, c.id, 'creator', t('band.myBand', 'Minha banda'));
    scores.set(song.id, score);
    creatorSongs.push(song);
  }
}

/** registra uma música feita na hora (prévia/compartilhada) */
export function registerTempSong(song: SongDef, score: Score): void {
  scores.set(song.id, score);
}

export function allSongs(): SongDef[] {
  const cat = mod?.SONGS ?? [];
  // com catálogo real, as demos só aparecem se ele estiver vazio
  return [...(cat.length ? [] : demos), ...cat, ...creatorSongs];
}

export function songById(id: string): SongDef | undefined {
  return creatorSongs.find((s) => s.id === id) ?? demos.find((s) => s.id === id) ?? mod?.songById(id);
}

export function isUnlocked(s: SongDef): boolean {
  if (s.tier === 'free' || s.tier === 'creator') return true;
  const m = mod as (SongsModule & { isUnlocked?: (s: SongDef) => boolean }) | null;
  if (m?.isUnlocked) return m.isUnlocked(s);
  if ((save.passItems ?? []).includes(s.id) || (save.passItems ?? []).includes('song-' + s.id)) return true;
  if (s.tier === 'pass') return s.season != null && ownsSeasonPass(s.season);
  // MEGA: Clube Bloop ou item do passe
  return (save.club?.expires ?? 0) > Date.now();
}

export interface OwnedPlayer extends SongPlayer {
  dispose?(): void;
}

export function makePlayer(song: SongDef, ctx: AudioContext, out: AudioNode): OwnedPlayer {
  const sc = scores.get(song.id);
  if (sc) return new ScorePlayer(sc, ctx, out, song.durationSec);
  if (mod) return mod.createPlayer(song, ctx, out);
  // sem catálogo nem partitura: silêncio com relógio
  return new ScorePlayer({ bpm: song.bpm, bars: song.bars, parts: { drums: [], bass: [], guitar: [], keys: [], vocals: [] }, chords: [] }, ctx, out, song.durationSec);
}
