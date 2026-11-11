/* ============================================================
 *  TEXTO → VOZ do bichinho, com MUITAS vozes (tom/velocidade).
 *   - Android: TTS nativo do sistema (@capacitor-community/text-to-speech) — offline.
 *   - Web: speechSynthesis + efeitos opcionais em WebAudio tocados JUNTO
 *     (bipes de robô, zumbido de alien, brilhinhos de fada) — o navegador
 *     não deixa processar a voz em si.
 *  Sem TTS no aparelho: o balão aparece e a boca mexe mesmo assim.
 * ============================================================ */
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { audio } from '../../core/audio';
import { isNative } from '../../core/platform';
import { t } from '../../i18n';
import { speechLang } from './stt';

export type VoiceFx = 'robot' | 'alien' | 'fairy' | 'giant' | null;
export interface PetVoice {
  id: string;
  name: () => string;
  pitch: number;
  rate: number;
  volume?: number;
  pro: boolean;
  fx?: VoiceFx;
  /** prefere voz feminina/masculina do sistema, se houver */
  prefer?: 'f' | 'm';
  icon: string;
}

/** 3 grátis + 11 Pro (Clube/passe premium). */
export const PET_VOICES: PetVoice[] = [
  { id: 'fofinho', name: () => t('pet.talk.v.fofinho', 'Fofinho'), pitch: 1.6, rate: 1.05, pro: false, icon: '🧸' },
  { id: 'bebe', name: () => t('pet.talk.v.bebe', 'Bebê'), pitch: 2.0, rate: 0.9, pro: false, icon: '🍼' },
  { id: 'esquilo', name: () => t('pet.talk.v.esquilo', 'Esquilo'), pitch: 2.0, rate: 1.55, pro: false, icon: '🐿️' },
  { id: 'robozinho', name: () => t('pet.talk.v.robozinho', 'Robozinho'), pitch: 0.8, rate: 0.95, pro: true, fx: 'robot', icon: '🤖' },
  { id: 'vovo', name: () => t('pet.talk.v.vovo', 'Vovô'), pitch: 0.6, rate: 0.75, pro: true, prefer: 'm', icon: '👴' },
  { id: 'gigante', name: () => t('pet.talk.v.gigante', 'Gigante'), pitch: 0.3, rate: 0.8, pro: true, fx: 'giant', prefer: 'm', icon: '🦣' },
  { id: 'princesa', name: () => t('pet.talk.v.princesa', 'Princesa'), pitch: 1.75, rate: 1.0, pro: true, prefer: 'f', icon: '👑' },
  { id: 'pirata', name: () => t('pet.talk.v.pirata', 'Pirata'), pitch: 0.75, rate: 0.95, pro: true, prefer: 'm', icon: '🏴‍☠️' },
  { id: 'alien', name: () => t('pet.talk.v.alien', 'Alien'), pitch: 1.9, rate: 1.3, pro: true, fx: 'alien', icon: '👽' },
  { id: 'sussurro', name: () => t('pet.talk.v.sussurro', 'Sussurro'), pitch: 1.2, rate: 0.85, volume: 0.45, pro: true, icon: '🤫' },
  { id: 'fada', name: () => t('pet.talk.v.fada', 'Fada'), pitch: 1.95, rate: 1.15, pro: true, fx: 'fairy', prefer: 'f', icon: '🧚' },
  { id: 'dino', name: () => t('pet.talk.v.dino', 'Dino'), pitch: 0.45, rate: 0.7, pro: true, fx: 'giant', icon: '🦖' },
  { id: 'apressadinho', name: () => t('pet.talk.v.apressadinho', 'Apressadinho'), pitch: 1.3, rate: 1.85, pro: true, icon: '⚡' },
  { id: 'cantor', name: () => t('pet.talk.v.cantor', 'Cantor'), pitch: 1.4, rate: 0.9, pro: true, icon: '🎤' },
];
export const FREE_VOICES = PET_VOICES.filter((v) => !v.pro).length;
export const voiceById = (id: string): PetVoice => PET_VOICES.find((v) => v.id === id) ?? PET_VOICES[0];

/* ------------------------------ estado de fala (para a boca) ------------------------------ */

let speaking = false;
let speakStart = 0;
let wordPulse = 0;
export const ttsSpeaking = (): boolean => speaking;

/**
 * Nível 0..1 para a boca/pulinho enquanto fala. Não dá para medir o áudio do TTS, então
 * simulamos sílabas (~6/s) e reforçamos a cada palavra (evento de limite de palavra, quando existe).
 */
export function ttsLevel(now = performance.now()): number {
  if (!speaking) return 0;
  const e = (now - speakStart) / 1000;
  wordPulse *= 0.9;
  const syl = Math.max(0, Math.sin(e * 6.2 * Math.PI)) * 0.7 + Math.max(0, Math.sin(e * 3.1 * Math.PI + 1)) * 0.3;
  return Math.min(1, syl * 0.8 + wordPulse);
}

/* ------------------------------ vozes do sistema (web) ------------------------------ */

function webVoices(): SpeechSynthesisVoice[] {
  try {
    return window.speechSynthesis?.getVoices() ?? [];
  } catch {
    return [];
  }
}
const FEMALE = /(female|mulher|woman|luciana|francisca|vitoria|maria|helena|zira|samantha|google português do brasil|joana|karen|monica|paulina)/i;
const MALE = /(male|homem|man|daniel|felipe|ricardo|antonio|jorge|david|diego)/i;
function pickWebVoice(lang: string, prefer?: 'f' | 'm'): SpeechSynthesisVoice | null {
  const all = webVoices();
  const base = lang.slice(0, 2);
  let cands = all.filter((v) => v.lang.replace('_', '-') === lang);
  if (!cands.length) cands = all.filter((v) => v.lang.startsWith(base));
  if (!cands.length) return null;
  if (prefer) {
    const re = prefer === 'f' ? FEMALE : MALE;
    const hit = cands.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return cands.find((v) => v.localService) ?? cands[0];
}

/* ------------------------------ efeitos WebAudio (web) ------------------------------ */

function playFx(fx: VoiceFx, ms: number): () => void {
  if (!fx) return () => {};
  const fo = audio.fxOut();
  if (!fo) return () => {};
  const a = fo.ctx;
  const t0 = a.currentTime + 0.02;
  const out = a.createGain();
  out.gain.value = 0.05;
  out.connect(fo.out);
  const nodes: AudioScheduledSourceNode[] = [];
  const dur = Math.min(8, ms / 1000);
  if (fx === 'robot') {
    for (let x = 0; x < dur; x += 0.22) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'square';
      o.frequency.value = 700 + Math.random() * 600;
      g.gain.setValueAtTime(0, t0 + x);
      g.gain.linearRampToValueAtTime(0.6, t0 + x + 0.01);
      g.gain.linearRampToValueAtTime(0, t0 + x + 0.06);
      o.connect(g).connect(out);
      o.start(t0 + x);
      o.stop(t0 + x + 0.08);
      nodes.push(o);
    }
  } else if (fx === 'alien') {
    const o = a.createOscillator();
    const lfo = a.createOscillator();
    const lg = a.createGain();
    o.type = 'sine';
    o.frequency.value = 900;
    lfo.frequency.value = 7;
    lg.gain.value = 250;
    lfo.connect(lg).connect(o.frequency);
    o.connect(out);
    o.start(t0);
    lfo.start(t0);
    o.stop(t0 + dur);
    lfo.stop(t0 + dur);
    nodes.push(o, lfo);
  } else if (fx === 'fairy') {
    for (let x = 0; x < dur; x += 0.35) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'triangle';
      o.frequency.value = 1800 + Math.random() * 1600;
      g.gain.setValueAtTime(0.5, t0 + x);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + x + 0.25);
      o.connect(g).connect(out);
      o.start(t0 + x);
      o.stop(t0 + x + 0.26);
      nodes.push(o);
    }
  } else if (fx === 'giant') {
    for (let x = 0; x < dur; x += 0.6) {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(70, t0 + x);
      o.frequency.exponentialRampToValueAtTime(35, t0 + x + 0.3);
      g.gain.setValueAtTime(1.2, t0 + x);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + x + 0.35);
      o.connect(g).connect(out);
      o.start(t0 + x);
      o.stop(t0 + x + 0.36);
      nodes.push(o);
    }
  }
  return () => {
    for (const n of nodes)
      try {
        n.stop();
      } catch {
        /* já parou */
      }
    out.disconnect();
  };
}

/* ------------------------------ falar ------------------------------ */

let fxStop: () => void = () => {};
let fallbackTimer = 0;
let token = 0;

/** Duração estimada (ms) — usada quando não há TTS ou como trava de segurança. */
const estimateMs = (text: string, rate: number) => Math.min(12000, Math.max(900, (text.length * 62) / Math.max(0.5, rate)));

export interface SpeakOpts {
  /** som desligado no jogo → só anima a boca */
  muted?: boolean;
}

/** Fala com a voz escolhida. Resolve quando termina (ou é interrompida). */
export async function speak(text: string, voiceId: string, opts: SpeakOpts = {}): Promise<void> {
  stopSpeaking();
  const my = ++token;
  const v = voiceById(voiceId);
  speaking = true;
  speakStart = performance.now();
  const end = () => {
    if (my !== token) return;
    speaking = false;
    fxStop();
    fxStop = () => {};
    clearTimeout(fallbackTimer);
  };
  const est = estimateMs(text, v.rate);
  const safety = new Promise<void>((r) => (fallbackTimer = window.setTimeout(r, est + 4000)));
  if (opts.muted) {
    await new Promise((r) => setTimeout(r, est));
    end();
    return;
  }
  try {
    if (isNative) {
      const sub = await TextToSpeech.addListener('onRangeStart', () => (wordPulse = 0.6)).catch(() => null);
      await Promise.race([
        TextToSpeech.speak({ text, lang: speechLang(), pitch: Math.max(0.1, Math.min(2, v.pitch)), rate: Math.max(0.1, Math.min(2, v.rate)), volume: v.volume ?? 1, category: 'playback', queueStrategy: 0 }),
        safety,
      ]);
      void sub?.remove();
    } else if (window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined') {
      fxStop = playFx(v.fx ?? null, est);
      await Promise.race([
        new Promise<void>((res) => {
          const u = new SpeechSynthesisUtterance(text);
          u.lang = speechLang();
          const wv = pickWebVoice(u.lang, v.prefer);
          if (wv) u.voice = wv;
          u.pitch = Math.max(0, Math.min(2, v.pitch));
          u.rate = Math.max(0.1, Math.min(4, v.rate));
          u.volume = v.volume ?? 1;
          u.onboundary = () => (wordPulse = 0.6);
          u.onend = () => res();
          u.onerror = () => res();
          window.speechSynthesis.speak(u);
        }),
        safety,
      ]);
    } else await new Promise((r) => setTimeout(r, est));
  } catch {
    await new Promise((r) => setTimeout(r, Math.min(est, 3000)));
  }
  end();
}

export function stopSpeaking(): void {
  token++;
  speaking = false;
  fxStop();
  fxStop = () => {};
  clearTimeout(fallbackTimer);
  if (isNative) void TextToSpeech.stop().catch(() => {});
  else
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ok */
    }
}
