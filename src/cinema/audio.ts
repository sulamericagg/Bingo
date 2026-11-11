/* ============================================================
 *  BLOOP CINEMA — áudio: mixer (música / vozes / efeitos), efeitos
 *  sonoros sintetizados, músicas originais do jogo (Bloop Banda),
 *  gravação de voz pelo microfone e efeitos de voz.
 *
 *  PRIVACIDADE: a voz gravada fica SÓ no aparelho (IndexedDB do
 *  projeto); nada é enviado. O vídeo exportado só sai pelo menu de
 *  compartilhar do sistema, quando a pessoa escolhe.
 * ============================================================ */
import { audio } from '../core/audio';
import type { SongDef } from '../music/api';
import { setVoiceEnv, VOICE_RATE } from './engine';
import { flatShots, type Project, type VoiceFxId } from './format';
import { getClip } from './store';

interface AudioInternals {
  ctx: AudioContext | null;
}
export function actx(): AudioContext | null {
  audio.unlock();
  const c = (audio as unknown as AudioInternals).ctx;
  if (c && c.state === 'suspended') c.resume().catch(() => {});
  return c;
}

/* ---------------------------- músicas ---------------------------- */
type SongsMod = typeof import('../music/songs');
let songsP: Promise<SongsMod> | null = null;
export function loadSongs(): Promise<SongsMod> {
  if (!songsP) songsP = import('../music/songs');
  return songsP;
}
export async function songList(): Promise<SongDef[]> {
  const m = await loadSongs();
  return m.freeSongs();
}

/* ---------------------------- mixer ---------------------------- */
export class Mixer {
  readonly c: AudioContext;
  readonly out: GainNode;
  readonly music: GainNode;
  readonly duck: GainNode;
  readonly voice: GainNode;
  readonly sfx: GainNode;
  private dest: MediaStreamAudioDestinationNode | null = null;

  constructor(c: AudioContext) {
    this.c = c;
    this.out = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.out.connect(comp).connect(c.destination);
    this.music = c.createGain();
    this.duck = c.createGain();
    this.voice = c.createGain();
    this.sfx = c.createGain();
    this.music.connect(this.duck).connect(this.out);
    this.voice.connect(this.out);
    this.sfx.connect(this.out);
    // a saída para gravação vem do compressor
    this.comp = comp;
  }
  private comp: DynamicsCompressorNode;

  setMix(p: Project): void {
    const t = this.c.currentTime;
    this.music.gain.setTargetAtTime((p.music?.vol ?? 0.7) * p.mix.music * 0.55, t, 0.05);
    this.voice.gain.setTargetAtTime(p.mix.voice * 1.4, t, 0.05);
    this.sfx.gain.setTargetAtTime(p.mix.sfx * 0.8, t, 0.05);
  }

  /** Stream de áudio para o MediaRecorder (exportação). */
  recordStream(): MediaStream {
    if (!this.dest) {
      this.dest = this.c.createMediaStreamDestination();
      this.comp.connect(this.dest);
    }
    return this.dest.stream;
  }
  stopRecordStream(): void {
    if (this.dest) {
      try {
        this.comp.disconnect(this.dest);
      } catch {
        /* */
      }
      this.dest = null;
    }
  }
  setMuted(m: boolean): void {
    this.out.gain.setTargetAtTime(m ? 0 : 1, this.c.currentTime, 0.03);
  }
  dispose(): void {
    this.stopRecordStream();
    try {
      this.out.disconnect();
    } catch {
      /* */
    }
  }
}

/* ---------------------------- clipes de voz ---------------------------- */
const buffers = new Map<string, AudioBuffer>();

export function envelopeOf(buf: AudioBuffer): Float32Array {
  const d = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(buf.sampleRate / 50));
  const n = Math.ceil(d.length / step);
  const env = new Float32Array(n);
  let max = 1e-4;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = i * step;
    const b = Math.min(d.length, a + step);
    for (let j = a; j < b; j++) s += d[j] * d[j];
    env[i] = Math.sqrt(s / Math.max(1, b - a));
    if (env[i] > max) max = env[i];
  }
  // normaliza com um piso de ruído (silêncio = boca fechada)
  const floor = max * 0.12;
  for (let i = 0; i < n; i++) env[i] = Math.max(0, (env[i] - floor) / (max - floor));
  return env;
}

/** Decodifica (e guarda) um clipe do IndexedDB; registra o envelope para a boca mexer. */
export async function loadClip(id: string): Promise<AudioBuffer | null> {
  const have = buffers.get(id);
  if (have) return have;
  const c = actx();
  if (!c) return null;
  const row = await getClip(id);
  if (!row) return null;
  try {
    const buf = await c.decodeAudioData(await row.blob.arrayBuffer());
    buffers.set(id, buf);
    setVoiceEnv(id, { env: row.env?.length ? row.env : envelopeOf(buf), dur: buf.duration });
    return buf;
  } catch (e) {
    console.warn('[cinema] decode', e);
    return null;
  }
}
export const clipBuffer = (id: string): AudioBuffer | undefined => buffers.get(id);
export function rememberClip(id: string, buf: AudioBuffer, env: Float32Array): void {
  buffers.set(id, buf);
  setVoiceEnv(id, { env, dur: buf.duration });
}

export async function preloadProjectClips(p: Project): Promise<void> {
  const ids: string[] = [];
  for (const s of p.scenes) for (const h of s.shots) for (const l of h.lines) if (l.audio) ids.push(l.audio);
  await Promise.all(ids.map((id) => loadClip(id)));
}

/** Liga a cadeia de efeito de voz; devolve o nó de entrada. */
function voiceChain(c: AudioContext, fx: VoiceFxId, out: AudioNode, nodes: AudioNode[]): AudioNode {
  const keep = <T extends AudioNode>(n: T): T => (nodes.push(n), n);
  switch (fx) {
    case 'robot': {
      const g = keep(c.createGain());
      g.gain.value = 0;
      const osc = keep(c.createOscillator());
      osc.type = 'square';
      osc.frequency.value = 55;
      const depth = keep(c.createGain());
      depth.gain.value = 1;
      osc.connect(depth).connect(g.gain);
      osc.start();
      const bp = keep(c.createBiquadFilter());
      bp.type = 'bandpass';
      bp.frequency.value = 1400;
      bp.Q.value = 0.6;
      g.connect(bp).connect(out);
      return g;
    }
    case 'echo': {
      const inp = keep(c.createGain());
      const dl = keep(c.createDelay(1));
      dl.delayTime.value = 0.24;
      const fb = keep(c.createGain());
      fb.gain.value = 0.42;
      inp.connect(out);
      inp.connect(dl);
      dl.connect(fb).connect(dl);
      dl.connect(out);
      return inp;
    }
    case 'giant': {
      const lp = keep(c.createBiquadFilter());
      lp.type = 'lowshelf';
      lp.frequency.value = 300;
      lp.gain.value = 8;
      lp.connect(out);
      return lp;
    }
    default:
      return out;
  }
}

/** Toca um clipe isolado (pré-escuta no editor). */
export function previewClip(m: Mixer, id: string, fx: VoiceFxId, cut?: [number, number]): () => void {
  const buf = buffers.get(id);
  if (!buf) return () => {};
  const nodes: AudioNode[] = [];
  const src = m.c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = VOICE_RATE[fx] ?? 1;
  src.connect(voiceChain(m.c, fx, m.voice, nodes));
  if (cut) src.start(0, Math.min(buf.duration, cut[0]), Math.max(0.05, Math.min(buf.duration, cut[1]) - cut[0]));
  else src.start();
  return () => {
    try {
      src.stop();
    } catch {
      /* */
    }
    setTimeout(() => nodes.forEach((n) => n.disconnect()), 300);
  };
}

/* ---------------------------- efeitos sintetizados ---------------------------- */
let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = c.sampleRate * 2;
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return noiseBuf;
}

type Env = [number, number][]; // [tempo relativo, valor]
function tone(c: AudioContext, out: AudioNode, when: number, type: OscillatorType, freq: Env, gain: Env, nodes: AudioNode[]): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq[0][1], when);
  for (let i = 1; i < freq.length; i++) o.frequency.exponentialRampToValueAtTime(Math.max(1, freq[i][1]), when + freq[i][0]);
  g.gain.setValueAtTime(0.0001, when);
  for (const [t, v] of gain) g.gain.linearRampToValueAtTime(v, when + t);
  o.connect(g).connect(out);
  const end = when + gain[gain.length - 1][0] + 0.05;
  o.start(when);
  o.stop(end);
  nodes.push(o, g);
}
function burst(c: AudioContext, out: AudioNode, when: number, dur: number, ftype: BiquadFilterType, f0: number, f1: number, vol: number, nodes: AudioNode[], q = 1, attack = 0.005): void {
  const s = c.createBufferSource();
  s.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = ftype;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, when);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), when + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  s.connect(f).connect(g).connect(out);
  s.start(when, Math.random() * 1.5);
  s.stop(when + dur + 0.05);
  nodes.push(s, f, g);
}

/** Agenda um efeito sonoro. Devolve a duração aproximada. */
export function playSfx(c: AudioContext, out: AudioNode, id: string, when: number, vol: number, nodes: AudioNode[]): number {
  const g = c.createGain();
  g.gain.value = vol;
  g.connect(out);
  nodes.push(g);
  const o = g;
  switch (id) {
    case 'boing':
      tone(c, o, when, 'triangle', [[0, 110], [0.08, 520], [0.5, 140]], [[0.01, 0.5], [0.45, 0]], nodes);
      tone(c, o, when, 'sine', [[0, 220], [0.08, 1040], [0.5, 280]], [[0.01, 0.15], [0.4, 0]], nodes);
      return 0.5;
    case 'pop':
      tone(c, o, when, 'sine', [[0, 900], [0.09, 160]], [[0.004, 0.7], [0.1, 0]], nodes);
      return 0.12;
    case 'whoosh':
      burst(c, o, when, 0.55, 'bandpass', 300, 2600, 0.7, nodes, 1.2, 0.22);
      return 0.55;
    case 'ding':
      tone(c, o, when, 'sine', [[0, 1320], [1.2, 1318]], [[0.005, 0.45], [1.2, 0]], nodes);
      tone(c, o, when, 'sine', [[0, 2640], [0.8, 2636]], [[0.005, 0.18], [0.8, 0]], nodes);
      return 1.2;
    case 'bonk':
      tone(c, o, when, 'sine', [[0, 260], [0.18, 70]], [[0.004, 0.8], [0.2, 0]], nodes);
      burst(c, o, when, 0.08, 'lowpass', 2000, 400, 0.5, nodes);
      return 0.25;
    case 'rimshot':
      tone(c, o, when, 'sine', [[0, 190], [0.14, 120]], [[0.004, 0.7], [0.15, 0]], nodes);
      tone(c, o, when + 0.2, 'sine', [[0, 150], [0.16, 95]], [[0.004, 0.7], [0.17, 0]], nodes);
      burst(c, o, when + 0.44, 0.9, 'highpass', 7000, 6000, 0.45, nodes, 0.5);
      return 1.3;
    case 'applause': {
      for (let i = 0; i < 70; i++) {
        const t = when + (i / 70) * 2.4 + Math.random() * 0.04;
        const env = Math.sin((i / 70) * Math.PI) * 0.6 + 0.2;
        burst(c, o, t, 0.06, 'bandpass', 1400 + Math.random() * 1600, 900, 0.35 * env, nodes, 0.8, 0.002);
      }
      return 2.5;
    }
    case 'magic': {
      const notes = [1047, 1319, 1568, 2093, 2637, 3136];
      notes.forEach((f, i) => tone(c, o, when + i * 0.06, 'triangle', [[0, f], [0.5, f]], [[0.005, 0.22], [0.5, 0]], nodes));
      burst(c, o, when, 0.9, 'highpass', 6000, 9000, 0.12, nodes, 0.4, 0.2);
      return 0.9;
    }
    case 'slip':
      tone(c, o, when, 'sine', [[0, 1400], [0.7, 180]], [[0.02, 0.4], [0.7, 0]], nodes);
      return 0.75;
    case 'crickets':
      for (let k = 0; k < 6; k++)
        for (let i = 0; i < 4; i++) tone(c, o, when + k * 0.38 + i * 0.045, 'sine', [[0, 4600], [0.03, 4500]], [[0.005, 0.12], [0.035, 0]], nodes);
      return 2.3;
    case 'knock':
      for (let i = 0; i < 3; i++) {
        tone(c, o, when + i * 0.2, 'sine', [[0, 170], [0.08, 90]], [[0.003, 0.8], [0.09, 0]], nodes);
        burst(c, o, when + i * 0.2, 0.05, 'lowpass', 1200, 300, 0.5, nodes);
      }
      return 0.6;
    case 'phone':
      for (let r = 0; r < 2; r++)
        for (let i = 0; i < 16; i++) {
          const t = when + r * 1.0 + i * 0.05;
          tone(c, o, t, 'sine', [[0, i % 2 ? 480 : 440], [0.045, i % 2 ? 480 : 440]], [[0.003, 0.25], [0.045, 0]], nodes);
        }
      return 2;
    case 'drumroll': {
      const n = 36;
      for (let i = 0; i < n; i++) burst(c, o, when + i * 0.045, 0.05, 'bandpass', 1800, 1200, 0.15 + (i / n) * 0.45, nodes, 0.7, 0.002);
      burst(c, o, when + n * 0.045 + 0.02, 1.0, 'highpass', 6500, 6000, 0.5, nodes, 0.4);
      tone(c, o, when + n * 0.045, 'sine', [[0, 120], [0.3, 60]], [[0.004, 0.8], [0.3, 0]], nodes);
      return 2.7;
    }
    case 'sad': {
      const f = [196, 185, 175, 165];
      f.forEach((hz, i) => {
        const long = i === 3;
        const s = c.createOscillator();
        s.type = 'sawtooth';
        s.frequency.setValueAtTime(hz, when + i * 0.45);
        if (long) {
          const lfo = c.createOscillator();
          const lg = c.createGain();
          lfo.frequency.value = 6;
          lg.gain.value = 5;
          lfo.connect(lg).connect(s.frequency);
          lfo.start(when + i * 0.45);
          lfo.stop(when + i * 0.45 + 1.4);
          nodes.push(lfo, lg);
        }
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 900;
        const gg = c.createGain();
        const t0 = when + i * 0.45;
        const d = long ? 1.3 : 0.38;
        gg.gain.setValueAtTime(0.0001, t0);
        gg.gain.linearRampToValueAtTime(0.32, t0 + 0.05);
        gg.gain.setValueAtTime(0.3, t0 + d - 0.1);
        gg.gain.linearRampToValueAtTime(0.0001, t0 + d);
        s.connect(lp).connect(gg).connect(o);
        s.start(t0);
        s.stop(t0 + d + 0.05);
        nodes.push(s, lp, gg);
      });
      return 2.7;
    }
    case 'thunder':
      burst(c, o, when, 0.25, 'highpass', 3000, 800, 0.6, nodes, 0.5, 0.002);
      burst(c, o, when + 0.05, 2.4, 'lowpass', 400, 60, 0.9, nodes, 0.8, 0.1);
      return 2.5;
    case 'steps':
      for (let i = 0; i < 4; i++) burst(c, o, when + i * 0.32, 0.09, 'lowpass', 700, 200, 0.6, nodes, 1, 0.003);
      return 1.3;
  }
  return 0.3;
}

/* ---------------------------- reprodução do filme ---------------------------- */
export class Playback {
  private nodes: AudioNode[] = [];
  private srcs: AudioScheduledSourceNode[] = [];
  private player: { stop(): void } | null = null;
  base = 0;

  constructor(private m: Mixer) {}

  /**
   * Começa no tempo T do filme. Devolve o tempo do AudioContext que corresponde a T=0
   * (o relógio do vídeo segue o do áudio: T = ctx.currentTime - base).
   */
  async start(p: Project, T: number, totalDur: number): Promise<number> {
    this.stop();
    const c = this.m.c;
    this.m.setMix(p);
    let song: SongDef | undefined;
    let mod: SongsMod | null = null;
    if (p.music) {
      mod = await loadSongs();
      song = mod.songById(p.music.song);
    }
    await preloadProjectClips(p);
    const now = c.currentTime + 0.08;
    this.base = now - T;
    const base = this.base;
    // música (com fade no fim)
    const duck = this.m.duck.gain;
    duck.cancelScheduledValues(0);
    duck.setValueAtTime(1, c.currentTime);
    if (song && mod && p.music) {
      const offset = p.music.offset + T;
      const len = song.durationSec;
      const pl = mod.createPlayer(song, c, this.m.music);
      pl.start(offset % Math.max(1, len - 1));
      pl.onEnd(() => pl.start(p.music!.offset));
      this.player = pl;
      const endAt = base + totalDur;
      duck.setValueAtTime(1, Math.max(now, endAt - 1.2));
      duck.linearRampToValueAtTime(0.0001, Math.max(now + 0.01, endAt));
    }
    // vozes + efeitos
    const flat = flatShots(p);
    for (const r of flat) {
      for (const l of r.shot.lines) {
        if (!l.audio) continue;
        const buf = buffers.get(l.audio);
        const cast = p.cast.find((x) => x.id === l.cast);
        if (!buf) continue;
        const fx = cast?.voice ?? 'normal';
        const rate = VOICE_RATE[fx] ?? 1;
        const g0 = r.start + l.t;
        // corte [início, fim] da gravação (Gravar com o rosto: vale para voz e rosto)
        const c0 = Math.min(buf.duration, l.cut?.[0] ?? 0);
        const c1 = Math.min(buf.duration, Math.max(c0 + 0.05, l.cut?.[1] ?? buf.duration));
        const len = (c1 - c0) / rate;
        if (g0 + len < T) continue;
        const when = base + g0;
        const s = c.createBufferSource();
        s.buffer = buf;
        s.playbackRate.value = rate;
        s.connect(voiceChain(c, fx, this.m.voice, this.nodes));
        if (when < now) s.start(now, c0 + (now - when) * rate, Math.max(0.01, c1 - c0 - (now - when) * rate));
        else s.start(when, c0, c1 - c0);
        this.srcs.push(s);
        this.nodes.push(s);
        // abaixa a música enquanto alguém fala
        if (song) {
          const a = Math.max(now, when);
          const b = Math.max(a + 0.05, when + len);
          duck.setTargetAtTime(0.35, a, 0.06);
          duck.setTargetAtTime(1, b, 0.15);
        }
      }
      for (const e of r.shot.sfx) {
        const when = base + r.start + e.t;
        if (when < now - 0.05) continue;
        playSfx(c, this.m.sfx, e.sfx, Math.max(now, when), e.vol, this.nodes);
      }
    }
    return base;
  }

  time(): number {
    return this.m.c.currentTime - this.base;
  }

  stop(): void {
    this.player?.stop();
    this.player = null;
    for (const s of this.srcs)
      try {
        s.stop();
      } catch {
        /* */
      }
    const old = this.nodes;
    this.nodes = [];
    this.srcs = [];
    // osciladores agendados no futuro: parar
    for (const n of old) if (n instanceof OscillatorNode || n instanceof AudioBufferSourceNode) try { n.stop(); } catch { /* */ }
    setTimeout(() => old.forEach((n) => n.disconnect()), 200);
    const d = this.m.duck.gain;
    d.cancelScheduledValues(0);
    d.setValueAtTime(1, this.m.c.currentTime);
  }
}

/* ---------------------------- microfone ---------------------------- */
export type MicError = 'unsupported' | 'denied' | 'failed';
export const MAX_REC_SEC = 15;

export class MicRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private an: AnalyserNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private buf = new Float32Array(1024);
  private timer = 0;
  private t0 = 0;
  onAutoStop: (() => void) | null = null;

  static supported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
  }

  async start(): Promise<MicError | null> {
    if (!MicRecorder.supported()) return 'unsupported';
    const c = actx();
    if (!c) return 'failed';
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      const n = (e as { name?: string })?.name ?? '';
      return n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : n === 'NotFoundError' ? 'unsupported' : 'failed';
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((m) => MediaRecorder.isTypeSupported?.(m));
    try {
      this.rec = mime ? new MediaRecorder(this.stream, { mimeType: mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(this.stream);
    } catch {
      this.release();
      return 'failed';
    }
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.src = c.createMediaStreamSource(this.stream);
    this.an = c.createAnalyser();
    this.an.fftSize = 1024;
    this.src.connect(this.an);
    this.rec.start(200);
    this.t0 = performance.now();
    this.timer = window.setTimeout(() => this.onAutoStop?.(), MAX_REC_SEC * 1000);
    return null;
  }

  level(): number {
    if (!this.an) return 0;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return Math.min(1, Math.sqrt(s / this.buf.length) * 5);
  }
  elapsed(): number {
    return (performance.now() - this.t0) / 1000;
  }

  async stop(): Promise<{ blob: Blob; buf: AudioBuffer; env: Float32Array } | null> {
    clearTimeout(this.timer);
    const rec = this.rec;
    if (!rec) return null;
    const done = new Promise<void>((res) => (rec.onstop = () => res()));
    try {
      rec.stop();
    } catch {
      /* */
    }
    await done;
    this.release();
    const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
    const c = actx();
    if (!c || blob.size < 200) return null;
    try {
      const buf = await c.decodeAudioData(await blob.arrayBuffer());
      return { blob, buf, env: envelopeOf(buf) };
    } catch (e) {
      console.warn('[cinema] mic decode', e);
      return null;
    }
  }

  cancel(): void {
    clearTimeout(this.timer);
    try {
      this.rec?.stop();
    } catch {
      /* */
    }
    this.release();
  }

  private release(): void {
    this.src?.disconnect();
    this.src = null;
    this.an = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
  }
}

/** Pré-escuta de 8 s de uma música (seletor). */
export async function previewSong(m: Mixer, id: string, offset: number): Promise<() => void> {
  const mod = await loadSongs();
  const s = mod.songById(id);
  if (!s) return () => {};
  m.duck.gain.setValueAtTime(1, m.c.currentTime);
  const pl = mod.createPlayer(s, m.c, m.music);
  pl.start(offset);
  const tm = setTimeout(() => pl.stop(), 8000);
  return () => {
    clearTimeout(tm);
    pl.stop();
  };
}
