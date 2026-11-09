/* ============================================================
 *  MÚSICAS DO PASSE ('mu_sNN_k') — temas sintetizados (WebAudio),
 *  gerados da semente do id: escala, andamento, melodia e baixo.
 *  passTrack(id) devolve a partitura (o agente de áudio pode tocar no jogo);
 *  previewTrack(id) toca uma prévia curta na tela do passe.
 * ============================================================ */
import { save } from '../core/storage';
import { idSeed, rng } from './catalog';

export interface PassTrack {
  bpm: number;
  /** semitons relativos à tônica (null = pausa), 16 passos */
  lead: (number | null)[];
  bass: number[];
  root: number; // MIDI
  wave: OscillatorType;
}

const SCALES = [
  [0, 2, 4, 7, 9, 12, 14, 16], // pentatônica maior
  [0, 2, 4, 5, 7, 9, 11, 12], // maior
  [0, 3, 5, 7, 10, 12, 15, 17], // pentatônica menor (alegre-misteriosa)
  [0, 2, 4, 6, 7, 9, 11, 12], // lídio (sonhador)
];

export function passTrack(id: string): PassTrack {
  const r = rng(idSeed(id));
  const sc = SCALES[Math.floor(r() * SCALES.length)];
  const lead: (number | null)[] = [];
  let k = Math.floor(r() * 4);
  for (let i = 0; i < 16; i++) {
    if (i % 4 !== 0 && r() < 0.3) {
      lead.push(null);
      continue;
    }
    k = Math.max(0, Math.min(sc.length - 1, k + Math.floor(r() * 5) - 2));
    lead.push(sc[k]);
  }
  const prog = [[0, -5, -3, -7], [0, -3, -5, 0], [0, 5, -3, -5]][Math.floor(r() * 3)];
  return { bpm: 100 + Math.floor(r() * 30), lead, bass: prog, root: 60 + Math.floor(r() * 5), wave: (['triangle', 'square', 'sine'] as OscillatorType[])[Math.floor(r() * 3)] };
}

let ctx: AudioContext | null = null;
let timer = 0;
let playing = '';

export const playingTrack = (): string => playing;

export function stopTrack(): void {
  clearInterval(timer);
  timer = 0;
  playing = '';
}

/** Toca ~2 compassos × 2 voltas da música (prévia). */
export function previewTrack(id: string, onEnd?: () => void): void {
  stopTrack();
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx ??= new AC();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const tr = passTrack(id);
  const c = ctx;
  const out = c.createGain();
  out.gain.value = save.music === false && save.sound === false ? 0 : 0.18;
  out.connect(c.destination);
  const stepDur = 60 / tr.bpm / 2;
  let step = 0;
  let next = c.currentTime + 0.05;
  const total = 64;
  playing = id;
  const note = (midi: number, t0: number, dur: number, type: OscillatorType, vol: number) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  timer = window.setInterval(() => {
    while (next < c.currentTime + 0.2 && step < total) {
      const s = step % 16;
      const l = tr.lead[s];
      if (l !== null) note(tr.root + l, next, stepDur * 1.6, tr.wave, 0.5);
      if (s % 4 === 0) note(tr.root - 24 + tr.bass[Math.floor(s / 4)], next, stepDur * 3.5, 'sine', 0.7);
      if (s % 2 === 1) note(tr.root + 36, next, 0.03, 'square', 0.05);
      next += stepDur;
      step++;
    }
    if (step >= total && c.currentTime > next) {
      stopTrack();
      onEnd?.();
    }
  }, 60);
}
