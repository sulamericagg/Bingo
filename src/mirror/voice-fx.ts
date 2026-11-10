/* ============================================================
 *  BLOOP ESPELHO — efeitos de voz AO VIVO (WebAudio, só nós nativos).
 *
 *  O bichinho (src/pet/voice.ts) muda o tom gravando a frase e tocando
 *  com playbackRate — isso não serve ao vivo (a gravação de vídeo precisa
 *  da voz em tempo real). Aqui o tom muda com duas linhas de atraso
 *  moduladas por dente-de-serra e janelas sin² cruzadas (pitch shifter
 *  "granular" clássico), sem AudioWorklet: funciona em qualquer WebView.
 *
 *  mic → [análise: volume/visemas p/ boca] ; mic → efeito → gravação
 *                                                       ↘ (opcional) alto-falante
 *  Nada é guardado: o áudio só passa pelos nós e vai para o MediaRecorder
 *  quando o jogador grava.
 * ============================================================ */

export type VoiceId = 'normal' | 'fofo' | 'robo' | 'gigante' | 'eco' | 'esquilo' | 'alien' | 'cantor';
export const VOICES: VoiceId[] = ['normal', 'fofo', 'robo', 'gigante', 'eco', 'esquilo', 'alien', 'cantor'];
/** vozes liberadas para quem é grátis */
export const FREE_VOICES: VoiceId[] = ['normal', 'fofo'];

interface Chain {
  stop(): void;
}

function pitchShift(c: AudioContext, input: AudioNode, output: AudioNode, ratio: number, stops: (() => void)[]): void {
  const T = 0.1;
  const depth = Math.min(T * 0.92, Math.abs(ratio - 1) * T);
  const up = ratio > 1;
  const n = Math.round(T * c.sampleRate);
  const ramp = c.createBuffer(1, n, c.sampleRate);
  const fade = c.createBuffer(1, n, c.sampleRate);
  const rd = ramp.getChannelData(0);
  const fd = fade.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    rd[i] = up ? 1 - ph : ph; // atraso diminuindo = tom mais agudo
    const s = Math.sin(Math.PI * ph);
    fd[i] = s * s; // sin² + cos² = 1 → as duas linhas somam volume constante
  }
  const t0 = c.currentTime + 0.05;
  for (let k = 0; k < 2; k++) {
    const mod = c.createBufferSource();
    mod.buffer = ramp;
    mod.loop = true;
    const win = c.createBufferSource();
    win.buffer = fade;
    win.loop = true;
    const dg = c.createGain();
    dg.gain.value = depth;
    const dl = c.createDelay(0.5);
    dl.delayTime.value = 0.004;
    mod.connect(dg).connect(dl.delayTime);
    const vca = c.createGain();
    vca.gain.value = 0;
    win.connect(vca.gain);
    input.connect(dl).connect(vca).connect(output);
    mod.start(t0 + (k * T) / 2);
    win.start(t0 + (k * T) / 2);
    stops.push(() => {
      try {
        mod.stop();
        win.stop();
      } catch {
        /* */
      }
      mod.disconnect();
      win.disconnect();
      dl.disconnect();
      vca.disconnect();
    });
  }
}

function filt(c: AudioContext, type: BiquadFilterType, f: number, q = 0.7, g = 0): BiquadFilterNode {
  const b = c.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = g;
  return b;
}

function shaper(c: AudioContext, amt: number): WaveShaperNode {
  const w = c.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + amt) * x) / (1 + amt * Math.abs(x));
  }
  w.curve = curve;
  return w;
}

function vibrato(c: AudioContext, input: AudioNode, output: AudioNode, hz: number, depthSec: number, stops: (() => void)[]): void {
  const dl = c.createDelay(0.1);
  dl.delayTime.value = 0.006;
  const lfo = c.createOscillator();
  lfo.frequency.value = hz;
  const g = c.createGain();
  g.gain.value = depthSec;
  lfo.connect(g).connect(dl.delayTime);
  input.connect(dl).connect(output);
  lfo.start();
  stops.push(() => {
    try {
      lfo.stop();
    } catch {
      /* */
    }
    lfo.disconnect();
    dl.disconnect();
  });
}

function buildChain(c: AudioContext, id: VoiceId, inp: AudioNode, out: AudioNode): Chain {
  const stops: (() => void)[] = [];
  const nodes: AudioNode[] = [];
  const keep = <T extends AudioNode>(n: T): T => (nodes.push(n), n);
  switch (id) {
    case 'fofo': {
      const hp = keep(filt(c, 'highpass', 220));
      const pk = keep(filt(c, 'peaking', 2600, 1.1, 5));
      pitchShift(c, inp, hp, 1.45, stops);
      hp.connect(pk).connect(out);
      break;
    }
    case 'esquilo': {
      const hp = keep(filt(c, 'highpass', 300));
      pitchShift(c, inp, hp, 1.9, stops);
      hp.connect(out);
      break;
    }
    case 'gigante': {
      const ls = keep(filt(c, 'lowshelf', 200, 0.7, 7));
      const lp = keep(filt(c, 'lowpass', 3200));
      pitchShift(c, inp, ls, 0.66, stops);
      ls.connect(lp).connect(out);
      break;
    }
    case 'robo': {
      const rm = keep(c.createGain());
      rm.gain.value = 0;
      const osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 55;
      osc.connect(rm.gain);
      osc.start();
      stops.push(() => {
        try {
          osc.stop();
        } catch {
          /* */
        }
        osc.disconnect();
      });
      const sh = keep(shaper(c, 3));
      const bp = keep(filt(c, 'peaking', 1200, 1, 6));
      const boost = keep(c.createGain());
      boost.gain.value = 1.6;
      pitchShift(c, inp, rm, 0.92, stops);
      rm.connect(sh).connect(bp).connect(boost).connect(out);
      break;
    }
    case 'eco': {
      const dry = keep(c.createGain());
      dry.gain.value = 0.85;
      inp.connect(dry).connect(out);
      for (const [t, fb, wet] of [
        [0.19, 0.42, 0.5],
        [0.31, 0.35, 0.35],
      ] as const) {
        const dl = keep(c.createDelay(1));
        dl.delayTime.value = t;
        const fbg = keep(c.createGain());
        fbg.gain.value = fb;
        const lp = keep(filt(c, 'lowpass', 2200));
        const w = keep(c.createGain());
        w.gain.value = wet;
        inp.connect(dl);
        dl.connect(lp).connect(fbg).connect(dl);
        lp.connect(w).connect(out);
      }
      break;
    }
    case 'alien': {
      const hp = keep(filt(c, 'highpass', 450));
      const lp = keep(filt(c, 'lowpass', 3000));
      const pk = keep(filt(c, 'peaking', 1500, 1.4, 9));
      const sh = keep(shaper(c, 6));
      const g = keep(c.createGain());
      g.gain.value = 0.7;
      const mid = keep(c.createGain());
      vibrato(c, inp, mid, 7, 0.0025, stops);
      pitchShift(c, mid, hp, 1.18, stops);
      hp.connect(lp).connect(pk).connect(sh).connect(g).connect(out);
      break;
    }
    case 'cantor': {
      const mid = keep(c.createGain());
      const pk = keep(filt(c, 'peaking', 3000, 0.8, 4));
      vibrato(c, inp, mid, 5.5, 0.0018, stops);
      pitchShift(c, mid, pk, 1.12, stops);
      const dl = keep(c.createDelay(1));
      dl.delayTime.value = 0.09;
      const w = keep(c.createGain());
      w.gain.value = 0.25;
      pk.connect(out);
      pk.connect(dl).connect(w).connect(out);
      break;
    }
    default:
      inp.connect(out);
  }
  return {
    stop() {
      for (const s of stops) s();
      for (const n of nodes) n.disconnect();
      try {
        inp.disconnect();
      } catch {
        /* */
      }
    },
  };
}

export interface MouthFromVoice {
  /** 0..1 abertura */
  open: number;
  /** 0..1 boca redonda (O/U: graves dominam) */
  round: number;
  /** 0..1 boca esticada (E/I: agudos dominam) */
  wide: number;
}

export class VoiceFx {
  readonly ctx: AudioContext;
  private src: MediaStreamAudioSourceNode;
  private an: AnalyserNode;
  private td: Float32Array<ArrayBuffer>;
  private fd: Float32Array<ArrayBuffer>;
  private fxIn: GainNode;
  private fxOut: GainNode;
  private monitor: GainNode;
  private dest: MediaStreamAudioDestinationNode;
  private chain: Chain | null = null;
  private floor = 0.008;
  private level = 0;
  voice: VoiceId = 'normal';

  constructor(stream: MediaStream) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.src = c.createMediaStreamSource(stream);
    this.an = c.createAnalyser();
    this.an.fftSize = 1024;
    this.an.smoothingTimeConstant = 0.3;
    this.td = new Float32Array(this.an.fftSize);
    this.fd = new Float32Array(this.an.frequencyBinCount);
    this.src.connect(this.an);
    this.fxIn = c.createGain();
    this.fxOut = c.createGain();
    this.monitor = c.createGain();
    this.monitor.gain.value = 0; // padrão: não toca no alto-falante (evita microfonia)
    this.dest = c.createMediaStreamDestination();
    this.src.connect(this.fxIn);
    this.fxOut.connect(this.dest);
    this.fxOut.connect(this.monitor).connect(c.destination);
    this.setVoice('normal');
  }

  /** trilha de áudio já com efeito (para o MediaRecorder) */
  get track(): MediaStreamTrack | null {
    return this.dest.stream.getAudioTracks()[0] ?? null;
  }

  async resume(): Promise<void> {
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
  }

  setVoice(v: VoiceId): void {
    this.chain?.stop();
    // fxIn é desconectado pelo stop(); reconecta a entrada da cadeia nova
    this.chain = buildChain(this.ctx, v, this.fxIn, this.fxOut);
    this.voice = v;
  }

  /** ouvir a própria voz com efeito (só com fone: senão dá microfonia) */
  setMonitor(on: boolean): void {
    this.monitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.03);
  }

  /** chame 1x por quadro: boca a partir do microfone (antes do efeito) */
  poll(out: MouthFromVoice): number {
    this.an.getFloatTimeDomainData(this.td);
    let sum = 0;
    for (let i = 0; i < this.td.length; i++) sum += this.td[i] * this.td[i];
    const rms = Math.sqrt(sum / this.td.length);
    // piso de ruído adaptativo: sobe devagar, desce rápido
    this.floor = rms < this.floor ? this.floor * 0.7 + rms * 0.3 : this.floor * 0.998 + rms * 0.002;
    const lv = Math.max(0, Math.min(1, (rms - this.floor * 1.6) * 14));
    this.level = lv > this.level ? this.level * 0.35 + lv * 0.65 : this.level * 0.75 + lv * 0.25;
    out.open = this.level;
    if (this.level > 0.05) {
      this.an.getFloatFrequencyData(this.fd);
      const hz = this.ctx.sampleRate / this.an.fftSize;
      let lo = 0;
      let hi = 0;
      for (let i = 1; i < this.fd.length; i++) {
        const f = i * hz;
        const p = Math.pow(10, this.fd[i] / 20);
        if (f > 200 && f < 900) lo += p;
        else if (f > 1800 && f < 5000) hi += p;
      }
      const r = hi / (lo + hi + 1e-6);
      out.round = out.round * 0.7 + Math.max(0, Math.min(1, (0.25 - r) * 5)) * 0.3;
      out.wide = out.wide * 0.7 + Math.max(0, Math.min(1, (r - 0.35) * 4)) * 0.3;
    } else {
      out.round *= 0.85;
      out.wide *= 0.85;
    }
    return this.level;
  }

  dispose(): void {
    this.chain?.stop();
    this.chain = null;
    try {
      this.src.disconnect();
      this.an.disconnect();
      this.fxOut.disconnect();
      this.monitor.disconnect();
    } catch {
      /* */
    }
    this.ctx.close().catch(() => {});
  }
}
