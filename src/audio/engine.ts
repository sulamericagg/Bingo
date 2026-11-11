/* ============================================================
 *  BLOOP AUDIO — motor compartilhado (WebAudio, 100% sintetizado).
 *
 *  UM AudioContext para o app inteiro. Barramentos:
 *    music (Música)  ─► musicDuck ─┐
 *    sfx   (Efeitos) ◄─ ui, amb ───┼─► master (Volume) ─► limitador ─► saída
 *    voice (vozes, segue Efeitos) ─┘
 *  Cada barramento tem um envio de reverb próprio (o reverb fica ANTES do
 *  ganho do barramento: desligar Música/Efeitos desliga o eco junto).
 *
 *  - Ajustes: save.sound / save.music (liga/desliga) × mixer local
 *    (Volume / Música / Efeitos, 0..1, salvo no aparelho em 'bw-audio-mix').
 *  - Destrava no 1º toque (mobile) e pausa com o app em segundo plano
 *    (visibilitychange; o main.ts também chama suspend/resume no pause do Capacitor).
 *  - duck(): abaixa a música por um instante (efeitos importantes / voz).
 *  - Ouvinte 3D: setListener() para os sons posicionais (PannerNode).
 * ============================================================ */
import { save } from '../core/storage';

export interface Mix {
  /** volume geral */
  vol: number;
  music: number;
  sfx: number;
}
const MIX_KEY = 'bw-audio-mix';
/** ganho de referência dos barramentos (estrutura de ganho: música fica abaixo dos efeitos) */
export const MUSIC_REF = 1.0;
export const SFX_REF = 1.0;
export const AMB_REF = 0.55;

function loadMix(): Mix {
  const d: Mix = { vol: 1, music: 0.8, sfx: 1 };
  try {
    const o = JSON.parse(localStorage.getItem(MIX_KEY) || 'null');
    if (o && typeof o === 'object') {
      for (const k of ['vol', 'music', 'sfx'] as const) if (typeof o[k] === 'number' && o[k] >= 0 && o[k] <= 1) d[k] = o[k];
    }
  } catch {
    /* sem storage */
  }
  return d;
}

/** curva perceptiva do slider (0..1 → ganho) */
const curve = (v: number) => (v <= 0 ? 0 : v * v);

export function makeImpulse(c: BaseAudioContext, sec: number, decay = 2.8, bright = 0.5): AudioBuffer {
  const len = Math.floor(c.sampleRate * sec);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // ruído levemente filtrado (cauda menos chiada = mais agradável)
      lp += (w - lp) * bright;
      d[i] = lp * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export class Engine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  limiter!: DynamicsCompressorNode;
  /** entrada do barramento de música (a música sintetizada entra aqui) */
  musicIn!: GainNode;
  musicRev!: GainNode;
  private musicGain!: GainNode;
  private musicDuck!: GainNode;
  /** entrada do barramento de efeitos */
  sfxIn!: GainNode;
  sfxRev!: GainNode;
  private sfxGain!: GainNode;
  /** interface (cliques) — entra nos efeitos */
  uiIn!: GainNode;
  /** ambiente (grilos, vento…) — entra nos efeitos, abaixa sob voz */
  ambIn!: GainNode;
  private ambDuck!: GainNode;
  voiceIn!: GainNode;
  private voiceGain!: GainNode;

  mix: Mix = loadMix();
  private readyCbs: ((c: AudioContext) => void)[] = [];
  private bound = false;
  private duckUntil = 0;

  /** cria o contexto (se possível). Não destrava sozinho: chame unlock() num gesto. */
  ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    let c: AudioContext;
    try {
      c = new AC({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    this.ctx = c;
    const g = () => c.createGain();
    this.master = g();
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 8;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    this.master.connect(this.limiter).connect(c.destination);

    // música
    this.musicIn = g();
    this.musicGain = g();
    this.musicDuck = g();
    this.musicIn.connect(this.musicGain);
    this.musicGain.connect(this.musicDuck).connect(this.master);
    this.musicRev = g();
    const mConv = c.createConvolver();
    mConv.buffer = makeImpulse(c, 2.0, 2.6, 0.35);
    const mWet = g();
    mWet.gain.value = 0.32;
    this.musicRev.connect(mConv).connect(mWet).connect(this.musicGain);

    // efeitos
    this.sfxIn = g();
    this.sfxGain = g();
    this.sfxIn.connect(this.sfxGain).connect(this.master);
    this.sfxRev = g();
    const sConv = c.createConvolver();
    sConv.buffer = makeImpulse(c, 1.4, 3, 0.45);
    const sWet = g();
    sWet.gain.value = 0.35;
    this.sfxRev.connect(sConv).connect(sWet).connect(this.sfxGain);
    this.uiIn = g();
    this.uiIn.connect(this.sfxIn);
    this.ambIn = g();
    this.ambDuck = g();
    this.ambIn.connect(this.ambDuck).connect(this.sfxIn);
    this.ambIn.gain.value = AMB_REF;

    // vozes
    this.voiceIn = g();
    this.voiceGain = g();
    this.voiceIn.connect(this.voiceGain).connect(this.master);

    this.applySettings(true);
    this.bindLifecycle();
    const cbs = this.readyCbs.splice(0);
    for (const cb of cbs) {
      try {
        cb(c);
      } catch (e) {
        console.warn('[audio] ready', e);
      }
    }
    return c;
  }

  /** chame num gesto do usuário (toque/tecla): cria e destrava o contexto */
  unlock(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended' && !document.hidden) c.resume().catch(() => {});
  }

  /** roda cb quando o contexto existir (já existe = agora) */
  onReady(cb: (c: AudioContext) => void): void {
    if (this.ctx) cb(this.ctx);
    else this.readyCbs.push(cb);
  }

  get running(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setMix(m: Partial<Mix>): void {
    Object.assign(this.mix, m);
    try {
      localStorage.setItem(MIX_KEY, JSON.stringify(this.mix));
    } catch {
      /* sem storage */
    }
    this.applySettings();
  }

  applySettings(now = false): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const tc = now ? 0.001 : 0.05;
    this.master.gain.setTargetAtTime(curve(this.mix.vol), t, tc);
    this.musicGain.gain.setTargetAtTime(save.music ? MUSIC_REF * curve(this.mix.music) : 0, t, now ? 0.001 : 0.25);
    this.sfxGain.gain.setTargetAtTime(save.sound ? SFX_REF * curve(this.mix.sfx) : 0, t, tc);
    this.voiceGain.gain.setTargetAtTime(save.sound ? Math.max(0.35, curve(this.mix.sfx)) : 0, t, tc);
    // jogos antigos zeram musicIn para silenciar a trilha do app (Monta & Leva); aqui volta ao normal
    this.musicIn.gain.setTargetAtTime(1, t, tc);
  }

  /** abaixa a música (e o ambiente) por `hold` s; amount 0..1 = quanto tira */
  duck(amount = 0.45, hold = 0.35, release = 0.5): void {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const lvl = Math.max(0.05, 1 - amount);
    const p = this.musicDuck.gain;
    const until = t + hold;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(lvl, t, 0.03);
    p.setTargetAtTime(1, Math.max(until, this.duckUntil), release / 3);
    const a = this.ambDuck.gain;
    a.cancelScheduledValues(t);
    a.setTargetAtTime(Math.max(0.3, lvl), t, 0.05);
    a.setTargetAtTime(1, Math.max(until, this.duckUntil), release / 3);
    this.duckUntil = Math.max(until, this.duckUntil);
  }

  suspend(): void {
    this.ctx?.suspend().catch(() => {});
  }
  resume(): void {
    if (this.ctx && !document.hidden) this.ctx.resume().catch(() => {});
  }

  /** posição/orientação do ouvinte (câmera) para sons 3D */
  setListener(x: number, y: number, z: number, fx = 0, fy = 0, fz = -1, ux = 0, uy = 1, uz = 0): void {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    if (l.positionX) {
      const t = c.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.02);
      l.positionY.setTargetAtTime(y, t, 0.02);
      l.positionZ.setTargetAtTime(z, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else {
      (l as unknown as { setPosition(a: number, b: number, c: number): void }).setPosition(x, y, z);
      (l as unknown as { setOrientation(...a: number[]): void }).setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  private bindLifecycle(): void {
    if (this.bound) return;
    this.bound = true;
    // pausa em segundo plano (o Capacitor dispara visibilitychange no WebView; main.ts cobre o 'pause' nativo)
    document.addEventListener('visibilitychange', () => (document.hidden ? this.suspend() : this.resume()));
  }

  /** 1º toque/tecla em qualquer lugar destrava o áudio (Android/iOS exigem gesto) */
  bindUnlock(): void {
    const go = () => {
      this.unlock();
      if (this.running) for (const ev of EVS) window.removeEventListener(ev, go, true);
    };
    const EVS = ['pointerdown', 'touchend', 'keydown'] as const;
    for (const ev of EVS) window.addEventListener(ev, go, { capture: true, passive: true });
  }
}

export const engine = new Engine();
