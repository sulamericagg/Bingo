/* ============================================================
 *  CASA DO BLOOP — "fala comigo": o bichinho repete o que você diz
 *  com vozinha fina.
 *
 *  PRIVACIDADE (crianças): o áudio do microfone fica SÓ na memória do
 *  aparelho, num buffer fixo que é sobrescrito a cada frase. Nada é
 *  gravado em disco, enviado ou analisado além do volume (RMS).
 *
 *  Pipeline: getUserMedia → MediaStreamSource → ScriptProcessor
 *  (detecção de voz por RMS com limiar adaptativo + 600 ms de folga,
 *  máx. 4 s, 300 ms de pré-gravação) → AudioBuffer → BufferSource
 *  (playbackRate 1.6) → filtros "de bichinho" → analisador (lip-sync)
 *  → barramento de efeitos. A música do app fica muda enquanto o
 *  microfone está aberto (evita realimentação).
 * ============================================================ */
import { audio } from '../core/audio';
import { persist, save } from '../core/storage';

interface AudioInternals {
  ctx: AudioContext | null;
  sfxBus: GainNode;
  musicBus: GainNode;
}
const A = audio as unknown as AudioInternals;

export type VoiceState = 'off' | 'starting' | 'listening' | 'capturing' | 'playing';
export type VoiceError = 'unsupported' | 'denied' | 'nosound' | 'failed';

const MAX_SEC = 4;
const PRE_SEC = 0.3;
const HANG_MS = 600;
const RATE = 1.62;

let state: VoiceState = 'off';
let stream: MediaStream | null = null;
let src: MediaStreamAudioSourceNode | null = null;
let proc: ScriptProcessorNode | null = null;
let sink: GainNode | null = null;
let outAn: AnalyserNode | null = null;
let outBuf: Float32Array<ArrayBuffer> | null = null;
let playing: AudioBufferSourceNode | null = null;

/* buffers fixos (sem alocação por bloco) */
let cap: Float32Array | null = null;
let capLen = 0;
let pre: Float32Array | null = null;
let preHead = 0;
let preFill = 0;
let floor = 0.01;
let loudBlocks = 0;
let lastLoud = 0;
let micLevel = 0;
let outLevel = 0;

let listener: ((s: VoiceState) => void) | null = null;

export const voiceState = (): VoiceState => state;
/** volume do microfone 0..1 (anéis de som enquanto escuta) */
export const voiceMicLevel = (): number => micLevel;
/** volume da reprodução 0..1 (boca mexendo) — atualize com pollVoice() por frame */
export const voiceOutLevel = (): number => outLevel;

export function onVoiceState(cb: ((s: VoiceState) => void) | null): void {
  listener = cb;
}

function set(s: VoiceState): void {
  state = s;
  listener?.(s);
}

export function voiceSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.AudioContext !== 'undefined';
}

/** Configuração "Bichinho repete o que você fala" (padrão: ligado após permitir). */
export function petVoiceEnabled(): boolean {
  return save.pet.voiceOn !== false;
}
export function setPetVoiceEnabled(on: boolean): void {
  save.pet.voiceOn = on;
  persist();
  if (!on) stopVoice();
}

function muteMusic(on: boolean): void {
  const c = A.ctx;
  if (!c || !A.musicBus) return;
  if (on) A.musicBus.gain.setTargetAtTime(0, c.currentTime, 0.05);
  else audio.applySettings();
}

/**
 * Abre o microfone e começa a escutar.
 * `stillWanted`: conferido quando a permissão volta — se a criança fechou a tela do bichinho
 * enquanto o pedido de permissão estava aberto, o microfone NÃO pode ficar ligado no hub.
 */
export async function startVoice(stillWanted: () => boolean = () => true): Promise<VoiceError | null> {
  if (state !== 'off') return null;
  if (!voiceSupported()) return 'unsupported';
  if (!save.sound) return 'nosound';
  audio.unlock();
  const c = A.ctx;
  if (!c) return 'failed';
  set('starting');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
  } catch (e) {
    set('off');
    const name = (e as { name?: string })?.name ?? '';
    return name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'unsupported' : 'failed';
  }
  save.pet.voiceGranted = true;
  persist();
  // a permissão demorou (diálogo do Android pausa o app e chama stopVoice): só segue se ainda faz sentido
  if (!stillWanted() || (typeof document !== 'undefined' && document.hidden)) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
    set('off');
    return null;
  }
  if (c.state === 'suspended') await c.resume().catch(() => {});
  const sr = c.sampleRate;
  if (!cap || cap.length !== Math.ceil(sr * (MAX_SEC + PRE_SEC))) {
    cap = new Float32Array(Math.ceil(sr * (MAX_SEC + PRE_SEC)));
    pre = new Float32Array(Math.ceil(sr * PRE_SEC));
  }
  capLen = 0;
  preHead = preFill = 0;
  loudBlocks = 0;
  floor = 0.01;
  src = c.createMediaStreamSource(stream);
  proc = c.createScriptProcessor(2048, 1, 1);
  sink = c.createGain();
  sink.gain.value = 0; // o microfone NUNCA sai no alto-falante
  proc.onaudioprocess = onBlock;
  src.connect(proc).connect(sink).connect(c.destination);
  if (!outAn) {
    outAn = c.createAnalyser();
    outAn.fftSize = 512;
    outBuf = new Float32Array(outAn.fftSize);
    outAn.connect(A.sfxBus);
  }
  muteMusic(true);
  set('listening');
  return null;
}

/** Fecha o microfone e descarta o áudio da memória. */
export function stopVoice(): void {
  if (state === 'off') return;
  try {
    playing?.stop();
  } catch {
    /* */
  }
  playing = null;
  if (proc) proc.onaudioprocess = null;
  src?.disconnect();
  proc?.disconnect();
  sink?.disconnect();
  stream?.getTracks().forEach((t) => t.stop());
  stream = src = proc = sink = null;
  cap?.fill(0);
  pre?.fill(0);
  capLen = 0;
  micLevel = outLevel = 0;
  muteMusic(false);
  set('off');
}

function onBlock(e: AudioProcessingEvent): void {
  if (state !== 'listening' && state !== 'capturing') return;
  const inp = e.inputBuffer.getChannelData(0);
  let sum = 0;
  for (let i = 0; i < inp.length; i++) sum += inp[i] * inp[i];
  const rms = Math.sqrt(sum / inp.length);
  micLevel = Math.min(1, rms * 8);
  const now = performance.now();
  // limiar adaptativo: piso de ruído sobe devagar e desce rápido
  if (state === 'listening') floor = rms < floor ? floor * 0.8 + rms * 0.2 : floor * 0.995 + rms * 0.005;
  const thr = Math.max(0.018, floor * 3);
  const loud = rms > thr;

  if (state === 'listening') {
    // pré-gravação circular
    for (let i = 0; i < inp.length; i++) {
      pre![preHead] = inp[i];
      preHead = (preHead + 1) % pre!.length;
    }
    preFill = Math.min(pre!.length, preFill + inp.length);
    loudBlocks = loud ? loudBlocks + 1 : 0;
    if (loudBlocks >= 2) {
      // copia a pré-gravação em ordem
      capLen = 0;
      const n = preFill;
      let k = (preHead - n + pre!.length) % pre!.length;
      for (let i = 0; i < n; i++) {
        cap![capLen++] = pre![k];
        k = (k + 1) % pre!.length;
      }
      lastLoud = now;
      set('capturing');
    }
    return;
  }
  // capturando
  const room = cap!.length - capLen;
  const n = Math.min(room, inp.length);
  cap!.set(n === inp.length ? inp : inp.subarray(0, n), capLen);
  capLen += n;
  if (loud) lastLoud = now;
  if (now - lastLoud > HANG_MS || capLen >= cap!.length) play();
}

function play(): void {
  const c = A.ctx;
  if (!c || capLen < c.sampleRate * 0.25) {
    capLen = 0;
    preFill = 0;
    loudBlocks = 0;
    set('listening');
    return;
  }
  set('playing');
  // corta o silêncio do fim (folga) e normaliza com fade nas pontas
  const tail = Math.floor(c.sampleRate * (HANG_MS / 1000) * 0.8);
  const len = Math.max(Math.floor(c.sampleRate * 0.2), capLen - tail);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let peak = 0.001;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(cap![i]));
  const g = Math.min(4, 0.8 / peak);
  const fade = Math.floor(c.sampleRate * 0.02);
  for (let i = 0; i < len; i++) {
    const f = i < fade ? i / fade : i > len - fade ? (len - i) / fade : 1;
    d[i] = cap![i] * g * f;
  }
  cap!.fill(0, 0, capLen); // não guarda nada além do necessário
  capLen = 0;

  const s = c.createBufferSource();
  s.buffer = buf;
  s.playbackRate.value = RATE + (Math.random() - 0.5) * 0.1;
  // "vozinha": tira o grave, realça o meio-agudo, leve saturação de rádio
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 280;
  const pk = c.createBiquadFilter();
  pk.type = 'peaking';
  pk.frequency.value = 2600;
  pk.Q.value = 1.1;
  pk.gain.value = 6;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;
  const vol = c.createGain();
  vol.gain.value = 1.1;
  s.connect(hp).connect(pk).connect(lp).connect(vol).connect(outAn!);
  s.onended = () => {
    if (playing !== s) return;
    playing = null;
    outLevel = 0;
    preFill = 0;
    loudBlocks = 0;
    if (state === 'playing') set('listening');
  };
  playing = s;
  s.start();
}

/** Chame por frame: atualiza o nível da boca a partir do analisador de saída. */
export function pollVoice(): void {
  if (state !== 'playing' || !outAn || !outBuf) {
    outLevel *= 0.8;
    return;
  }
  outAn.getFloatTimeDomainData(outBuf);
  let sum = 0;
  for (let i = 0; i < outBuf.length; i++) sum += outBuf[i] * outBuf[i];
  const lv = Math.min(1, Math.sqrt(sum / outBuf.length) * 5);
  outLevel = lv > outLevel ? lv : outLevel * 0.7 + lv * 0.3;
}
