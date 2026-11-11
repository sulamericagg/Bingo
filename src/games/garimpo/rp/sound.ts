/* ============================================================
 *  GARIMPO — sons sintetizados da vida de garimpeiro: trovão (ruído grave que rola),
 *  uivo, sininho de nível e a RÁDIO da estrada (2 estações geradas na hora:
 *  "Sertaneja" e "Forró" — baixo + melodia pentatônica, sem arquivos).
 *  Respeita o botão de som (audio.fxOut() = null quando desligado).
 * ============================================================ */
import { audio } from '../../../core/audio';

function noiseBuf(ctx: AudioContext, dur: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * dur);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    // ruído "marrom": grave e encorpado
    last = (last + (Math.random() * 2 - 1) * 0.06) * 0.995;
    d[i] = last * 6;
  }
  return b;
}
let thunderBuf: AudioBuffer | null = null;

/** trovão: k 0..1 (perto = mais forte e mais seco) */
export function thunder(k = 1): void {
  const o = audio.fxOut();
  if (!o) return;
  const { ctx, out } = o;
  if (!thunderBuf) thunderBuf = noiseBuf(ctx, 3.2);
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = thunderBuf;
  src.playbackRate.value = 0.7 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(900 * k + 150, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 2.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * k + 0.1, t + 0.06);
  g.gain.setValueAtTime(0.45 * k + 0.08, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + 3.1);
}

/** uivo comprido (sustos à noite) */
export function howl(): void {
  const o = audio.fxOut();
  if (!o) return;
  const { ctx, out, rev } = o;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(380, t);
  osc.frequency.linearRampToValueAtTime(620, t + 0.6);
  osc.frequency.linearRampToValueAtTime(560, t + 1.6);
  osc.frequency.linearRampToValueAtTime(330, t + 2.4);
  const vib = ctx.createOscillator();
  vib.frequency.value = 5;
  const vg = ctx.createGain();
  vg.gain.value = 9;
  vib.connect(vg).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.5);
  osc.connect(g).connect(out);
  g.connect(rev);
  osc.start(t);
  vib.start(t);
  osc.stop(t + 2.6);
  vib.stop(t + 2.6);
}

/* ---------------- rádio ---------------- */
const SCALES = [
  [0, 2, 4, 7, 9, 12, 14],
  [0, 2, 4, 5, 7, 9, 10, 12],
];
export class Radio {
  station = 0;
  private timer = 0;
  private step = 0;
  private seed = 1;
  private gain: GainNode | null = null;
  get on(): boolean {
    return this.station > 0;
  }
  /** 0 desligado → 1 → 2 → 0 */
  next(): number {
    this.station = (this.station + 1) % 3;
    this.stop();
    if (this.station) this.start();
    return this.station;
  }
  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  private start(): void {
    const o = audio.fxOut();
    if (!o) return;
    const { ctx, out } = o;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.32;
    this.gain.connect(out);
    this.seed = this.station * 977;
    const bpm = this.station === 1 ? 96 : 128;
    const dt = 60 / bpm / 2;
    let next = ctx.currentTime + 0.1;
    const root = this.station === 1 ? 196 : 220;
    const sc = SCALES[this.station - 1];
    let mel = 3;
    const tick = () => {
      if (!this.gain) return;
      while (next < ctx.currentTime + 0.4) {
        const s = this.step++;
        // baixo: tônica/quinta alternando
        if (s % 2 === 0) this.note(ctx, root / 2 * (s % 8 < 4 ? 1 : 1.5), next, dt * 1.6, 'triangle', 0.5);
        // zabumba/pandeiro (forró) ou violão abafado (sertanejo)
        if (this.station === 2 && s % 4 === 3) this.note(ctx, 90, next, 0.08, 'sine', 0.6);
        if (s % 2 === 1) this.note(ctx, root * 2, next, 0.04, 'square', 0.05);
        // melodia: passeio na escala
        if (this.rnd() < 0.62) {
          mel = Math.max(0, Math.min(sc.length - 1, mel + Math.floor(this.rnd() * 3) - 1));
          this.note(ctx, root * 2 * Math.pow(2, sc[mel] / 12), next, dt * (this.rnd() < 0.3 ? 2 : 1), this.station === 1 ? 'triangle' : 'sawtooth', this.station === 1 ? 0.22 : 0.08);
        }
        next += dt;
      }
      this.timer = window.setTimeout(tick, 120);
    };
    tick();
  }
  private note(ctx: AudioContext, f: number, t: number, d: number, type: OscillatorType, v: number): void {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(this.gain!);
    o.start(t);
    o.stop(t + d + 0.02);
  }
  stop(): void {
    clearTimeout(this.timer);
    try {
      this.gain?.disconnect();
    } catch {
      /* */
    }
    this.gain = null;
  }
}
