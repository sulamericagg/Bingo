/* ============================================================
 *  BLOOP CINEMA — toca um padrão do "Criar música" (beatpat.ts)
 *  com o sintetizador do Bloop Banda (sem samples). Loop infinito:
 *  a cada volta da grade o acorde muda (progressão do humor) e a
 *  cada 4 voltas entra um prato. Agenda com antecedência (como o
 *  player das músicas), então funciona no editor, na exportação
 *  (MediaRecorder do mixer) e na TV.
 * ============================================================ */
import { Synth, type Timbre } from '../music/songs/synth';
import { BASS_SEMIS, bassBase, melBase, melSemis, progOf, type BeatPat } from './beatpat';

const MEL: Record<BeatPat['mel'], { bus: 'keys' | 'guitar'; tb: Partial<Timbre> }> = {
  piano: { bus: 'keys', tb: { keys: 'epiano' } },
  chip: { bus: 'keys', tb: { keys: 'chip' } },
  metais: { bus: 'keys', tb: { keys: 'brass' } },
  sanfona: { bus: 'keys', tb: { keys: 'accordion' } },
  violao: { bus: 'guitar', tb: { guitar: 'nylon' } },
  cordas: { bus: 'keys', tb: { keys: 'strings' } },
  orgao: { bus: 'keys', tb: { keys: 'organ' } },
};
const BASS: Record<BeatPat['bass'], Timbre['bass']> = { baixo: 'finger', synth: 'synth', contra: 'upright', chip: 'chip' };
const KIT: Record<BeatPat['kit'], Timbre['kit']> = { bateria: 'acoustic', eletro: '808', chip: 'chip', lofi: 'lofi', orq: 'orch' };

export interface BeatPlayer {
  start(atSec?: number): void;
  stop(): void;
  /** tempo tocado (s) desde o começo da trilha */
  time(): number;
  /** passo da grade tocando agora (para o cursor do editor) */
  step(): number;
  onEnd(cb: () => void): void;
}

export function createBeatPlayer(pat: BeatPat, ctx: BaseAudioContext, out: AudioNode): BeatPlayer {
  const mel = MEL[pat.mel];
  const tb: Timbre = { kit: KIT[pat.kit], bass: BASS[pat.bass], guitar: 'nylon', keys: 'epiano', vocals: 'vocal', room: 0.7, ...mel.tb };
  const stepSec = 30 / pat.bpm;
  const spb = 60 / pat.bpm;
  const semis = melSemis(pat);
  const prog = progOf(pat);
  const mb = melBase(pat.key);
  const bb = bassBase(pat.key);
  const soft = pat.mood === 'sono' ? 0.7 : 1;
  let synth: Synth | null = null;
  let t0 = 0;
  let n = 0;
  let timer: ReturnType<typeof setInterval> | 0 = 0;
  let lastTick = 0;

  /** comprimento (em passos) da nota da melodia: até a próxima nota (máx. 4) */
  const melLen = (i: number): number => {
    let k = 1;
    while (k < 4 && pat.m[(i + k) % pat.steps] === '.') k++;
    return pat.mel === 'cordas' || pat.mel === 'orgao' || pat.mel === 'sanfona' ? k : Math.min(k, 2);
  };

  const playStep = (gi: number, when: number) => {
    const s = synth!;
    const i = gi % pat.steps;
    const loop = Math.floor(gi / pat.steps);
    const chord = prog[loop % prog.length];
    if (i === 0 && loop % 4 === 0 && loop > 0 && pat.kit !== 'lofi' && pat.d.some((d) => d.includes('1'))) s.drum('c', when, 0.5 * soft);
    if (pat.d[0][i] === '1') s.drum('k', when, (i % 4 === 0 ? 0.95 : 0.8) * soft);
    if (pat.d[1][i] === '1') s.drum(pat.kit === 'eletro' || pat.kit === 'chip' ? 'cl' : 's', when, 0.8 * soft);
    if (pat.d[2][i] === '1') s.drum('h', when, (i % 2 === 0 ? 0.55 : 0.4) * soft);
    const mc = pat.m[i];
    if (mc && mc !== '.') {
      const row = +mc;
      s.play(mel.bus, { b: 0, d: (melLen(i) * stepSec) / spb, m: [mb + semis[row]], v: (i % 4 === 0 ? 0.85 : 0.72) * soft }, when, spb);
    }
    const bc = pat.b[i];
    if (bc && bc !== '.') {
      const third = pat.mood === 'suspense' ? ([0, 8].includes(chord) ? 3 : 4) : [9, 4].includes(chord) ? 3 : 4;
      const semi = +bc === 3 ? third : BASS_SEMIS[+bc];
      s.play('bass', { b: 0, d: 0.9, m: [bb + chord + semi], v: 0.85 * soft }, when, spb);
    }
  };

  const tick = () => {
    if (!synth) return;
    const now = ctx.currentTime;
    const gap = lastTick ? now - lastTick : 0.025;
    lastTick = now;
    const ahead = Math.min(1.5, Math.max(0.12, gap * 2 + 0.05));
    while (t0 + n * stepSec < now + ahead) {
      const at = t0 + n * stepSec;
      if (at >= now - 0.02) playStep(n, Math.max(at, now));
      n++;
    }
  };

  return {
    start(atSec = 0) {
      this.stop();
      synth = new Synth(ctx, out, tb);
      t0 = ctx.currentTime + 0.05 - atSec;
      n = Math.max(0, Math.ceil((atSec - 0.001) / stepSec));
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
      return synth ? ctx.currentTime - t0 : 0;
    },
    step() {
      if (!synth) return -1;
      const k = Math.floor((ctx.currentTime - t0) / stepSec);
      return k < 0 ? -1 : k % pat.steps;
    },
    onEnd() {
      /* loop infinito: nunca termina */
    },
  };
}

/* ---------------------------- tocar uma nota (tocar na grade) ---------------------------- */
let aud: { sig: string; s: Synth; ctx: BaseAudioContext } | null = null;
/** Toca só a nota/batida tocada na grade (feedback imediato). */
export function audition(pat: BeatPat, ctx: BaseAudioContext, out: AudioNode, lane: 'm' | 'b' | 'd', row: number): void {
  const mel = MEL[pat.mel];
  const sig = `${pat.mel}|${pat.bass}|${pat.kit}`;
  if (!aud || aud.sig !== sig || aud.ctx !== ctx) {
    aud?.s.disconnect();
    const tb: Timbre = { kit: KIT[pat.kit], bass: BASS[pat.bass], guitar: 'nylon', keys: 'epiano', vocals: 'vocal', room: 0.7, ...mel.tb };
    aud = { sig, s: new Synth(ctx, out, tb), ctx };
  }
  const s = aud.s;
  const when = ctx.currentTime + 0.01;
  const spb = 60 / pat.bpm;
  if (lane === 'd') s.drum((['k', pat.kit === 'eletro' || pat.kit === 'chip' ? 'cl' : 's', 'h'] as const)[row] ?? 'k', when, 0.85);
  else if (lane === 'm') s.play(mel.bus, { b: 0, d: 0.9, m: [melBase(pat.key) + melSemis(pat)[row]], v: 0.8 }, when, spb);
  else s.play('bass', { b: 0, d: 0.9, m: [bassBase(pat.key) + [0, 7, 12, 4][row]], v: 0.9 }, when, spb);
}
