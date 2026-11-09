/* ============================================================
 *  BLOOP BANDA — módulo de músicas (implementa SongsModule de ../api).
 *  Carregue SEMPRE por import dinâmico (chunk preguiçoso):
 *    const songs = (await import('../../music/songs')).default;
 *
 *  - SONGS: 260 SongDef (20 grátis + 60×3 do passe + 60 MEGA). Os metadados
 *    são baratos; `song.charts` é um getter preguiçoso: compõe o arranjo e
 *    gera os charts na 1ª leitura (e guarda em cache).
 *  - Notas: `b` em batidas, andamento constante => segundos = b * 60 / bpm.
 *    O 1º compasso (batidas 0..3) é a contagem das baquetas (sem notas).
 *  - createPlayer: agendador com antecipação (Web Audio clock); time() vem de
 *    AudioContext.currentTime (já descontada a latência de saída).
 * ============================================================ */
import type { Difficulty, Instrument, Note, SongDef, SongPlayer, SongsModule } from '../api';
import { t } from '../../i18n';
import { CATALOG, SEASON_MUSIC_INFO, type CatalogEntry } from './catalog';
import { DIFFS, INSTRUMENTS, makeChart, swingBeat, validateChart } from './charts';
import { compose, type Arrangement } from './compose';
import { STAGES, STYLES, type StyleId } from './styles';
import { Synth, type Bus, type DEv, type PEv } from './synth';

export { STAGES, STYLES, SEASON_MUSIC_INFO, validateChart };
export type { Arrangement };

/* ---------------------------- cache de arranjos ---------------------------- */
const ENTRY = new Map<string, CatalogEntry>();
const ARR = new Map<string, Arrangement>();
/** compõe (ou devolve do cache; guarda as 4 mais recentes) */
export function arrangement(id: string): Arrangement {
  let a = ARR.get(id);
  if (a) {
    ARR.delete(id);
    ARR.set(id, a);
    return a;
  }
  const e = ENTRY.get(id);
  if (!e) throw new Error(`música desconhecida: ${id}`);
  a = compose(e.spec);
  ARR.set(id, a);
  while (ARR.size > 4) ARR.delete(ARR.keys().next().value!);
  return a;
}

type Charts = SongDef['charts'];
function buildCharts(id: string): Charts {
  const a = arrangement(id);
  const out: Charts = {};
  for (const inst of INSTRUMENTS) {
    const per: Partial<Record<Difficulty, Note[]>> = {};
    for (const d of DIFFS) {
      per[d] = makeChart(a, inst, d);
    }
    out[inst] = per;
  }
  return out;
}

function toDef(e: CatalogEntry): SongDef {
  const def = {
    id: e.spec.id,
    title: e.title,
    band: e.band,
    style: e.spec.style,
    bpm: e.spec.bpm,
    bars: e.bars,
    durationSec: e.durationSec,
    tier: e.tier,
    stage: e.stage,
  } as SongDef;
  if (e.season !== undefined) def.season = e.season;
  let cache: Charts | null = null;
  Object.defineProperty(def, 'charts', {
    enumerable: true,
    configurable: true,
    get: () => (cache ??= buildCharts(e.spec.id)),
  });
  return def;
}

export const SONGS: SongDef[] = CATALOG.map((e) => {
  ENTRY.set(e.spec.id, e);
  return toDef(e);
});
const BY_ID = new Map(SONGS.map((s) => [s.id, s]));
export const songById = (id: string): SongDef | undefined => BY_ID.get(id);

/** título/banda/estilo traduzíveis (chaves song.<id>, song.<id>.band, song.style.<estilo>) */
export const songTitle = (s: SongDef): string => t(`song.${s.id}`, s.title);
export const songBand = (s: SongDef): string => t(`song.${s.id}.band`, s.band);
export const styleName = (style: string): string => t(`song.style.${style}`, STYLES[style as StyleId]?.name ?? style);
export const stageName = (stage: string): string => t(`song.stage.${stage}`, STAGES[stage]?.name ?? stage);
export const freeSongs = (): SongDef[] => SONGS.filter((s) => s.tier === 'free');
export const seasonSongs = (season: number): SongDef[] => SONGS.filter((s) => s.season === season);

/* ============================ PLAYER ============================ */
interface Ev {
  t: number; // segundos (tempo da música)
  tr: Bus;
  d?: DEv;
  p?: PEv;
}
const FLAT = new Map<string, Ev[]>();
function flatten(id: string, a: Arrangement): Ev[] {
  let f = FLAT.get(id);
  if (f) return f;
  const spb = 60 / a.bpm;
  const T = (b: number) => swingBeat(b, a.swing) * spb;
  f = [];
  for (const e of a.drums) f.push({ t: T(e.b), tr: 'drums', d: e });
  for (const e of a.perc) f.push({ t: T(e.b), tr: 'perc', d: e });
  for (const tr of ['bass', 'guitar', 'keys', 'vocals'] as const) for (const e of a[tr]) f.push({ t: T(e.b), tr, p: e });
  for (const x of a.extra) f.push({ t: T(x.e.b), tr: x.tr, p: x.e });
  f.sort((x, y) => x.t - y.t);
  FLAT.clear(); // só guarda a última (memória)
  FLAT.set(id, f);
  return f;
}

export interface BandPlayer extends SongPlayer {
  /** agenda tudo até `sec` (tempo da música) de uma vez — testes/OfflineAudioContext */
  flushUntil(sec: number): void;
}

export function createPlayer(song: SongDef, ctx: AudioContext | BaseAudioContext, out: AudioNode): BandPlayer {
  const a = arrangement(song.id);
  const evs = flatten(song.id, a);
  const spb = 60 / a.bpm;
  const endSec = a.beats * spb;
  let synth: Synth | null = null;
  let t0 = 0; // ctx time que corresponde a música=0
  let idx = 0;
  let timer: ReturnType<typeof setInterval> | 0 = 0;
  let lastTick = 0;
  let ended = false;
  const endCbs: (() => void)[] = [];
  const gains: Partial<Record<Instrument, number>> = {};
  const latency = () => {
    const c = ctx as AudioContext;
    return (c.outputLatency || 0) + (c.baseLatency || 0);
  };

  const schedule = (until: number) => {
    if (!synth) return;
    while (idx < evs.length && evs[idx].t < until) {
      const e = evs[idx++];
      const at = t0 + e.t;
      if (at < ctx.currentTime - 0.02) continue; // atrasado demais: pula
      const when = Math.max(at, ctx.currentTime);
      if (e.d) synth.drum(e.d.p, when, e.d.v);
      else if (e.p) synth.play(e.tr, e.p, when, spb);
    }
  };
  const tick = () => {
    const now = ctx.currentTime;
    // antecipação adaptativa: cobre timers lentos (aba em 2º plano / celular fraco)
    const gap = lastTick ? now - lastTick : 0.025;
    lastTick = now;
    const ahead = Math.min(1.5, Math.max(0.1, gap * 2 + 0.05));
    schedule(now - t0 + ahead);
    if (!ended && now - t0 >= endSec) {
      ended = true;
      for (const cb of endCbs) cb();
      if (timer) clearInterval(timer);
      timer = 0;
    }
  };

  const player: BandPlayer = {
    start(atSec = 0) {
      player.stop();
      synth = new Synth(ctx, out, a.timbre);
      for (const k in gains) synth.setTrackGain(k as Instrument, gains[k as Instrument]!, ctx.currentTime);
      t0 = ctx.currentTime + 0.06 - atSec;
      idx = 0;
      while (idx < evs.length && evs[idx].t < atSec - 0.001) idx++;
      ended = false;
      lastTick = 0;
      tick();
      timer = setInterval(tick, 25);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = 0;
      if (synth) {
        const s = synth;
        s.fadeOut(ctx.currentTime, 0.08);
        setTimeout(() => s.disconnect(), 200);
      }
      synth = null;
    },
    time() {
      if (!synth) return 0;
      return ctx.currentTime - t0 - latency();
    },
    setTrackGain(inst, g) {
      gains[inst] = g;
      if (inst === 'drums') synth?.setTrackGain('perc', Math.max(0.35, g));
      synth?.setTrackGain(inst, g);
    },
    miss(inst) {
      synth?.miss(inst, ctx.currentTime + 0.005);
    },
    onEnd(cb) {
      endCbs.push(cb);
    },
    flushUntil(sec) {
      schedule(sec);
    },
  };
  return player;
}

const mod: SongsModule & {
  songTitle: typeof songTitle;
  songBand: typeof songBand;
  styleName: typeof styleName;
  stageName: typeof stageName;
  arrangement: typeof arrangement;
} = { SONGS, songById, createPlayer, songTitle, songBand, styleName, stageName, arrangement };
export default mod;
