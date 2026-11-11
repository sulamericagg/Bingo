/* ============================================================
 *  NOITES — voz (para crianças que ainda não leem).
 *  TTS nativo (plugin Capacitor TextToSpeech, se existir) ou
 *  speechSynthesis do navegador. Sem voz → só o som/ícone.
 * ============================================================ */
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { isNative } from '../../core/platform';
import { getLang } from '../../i18n';
import { narrationOn, onNarration } from '../../core/narration';

const LANGS: Record<string, string> = {
  pt: 'pt-BR',
  en: 'en-US',
  es: 'es-ES',
  de: 'de-DE',
  fr: 'fr-FR',
  it: 'it-IT',
  ja: 'ja-JP',
  ko: 'ko-KR',
  ru: 'ru-RU',
  tr: 'tr-TR',
  id: 'id-ID',
  zh: 'zh-CN',
};
const KEY = 'noites-voice';
let on = true;
try {
  on = localStorage.getItem(KEY) !== '0';
} catch {
  /* */
}
const last = new Map<string, number>();

export const voiceOn = (): boolean => on;
export function setVoice(v: boolean): void {
  on = v;
  try {
    localStorage.setItem(KEY, v ? '1' : '0');
  } catch {
    /* */
  }
  if (!v) stopSpeak();
}

type NativeTts = { speak(o: { text: string; lang: string; rate: number; pitch: number }): Promise<void>; stop?(): Promise<void> };
function native(): NativeTts | null {
  return isNative ? (TextToSpeech as unknown as NativeTts) : null;
}

/**
 * Fala o texto. `cool` (ms): não repete a mesma frase antes disso.
 * `urgent` interrompe o que estiver falando.
 */
export function speak(text: string, o: { cool?: number; urgent?: boolean } = {}): void {
  if (!on || !narrationOn() || !text) return;
  const now = performance.now();
  const lt = last.get(text) ?? -1e9;
  if (now - lt < (o.cool ?? 4000)) return;
  last.set(text, now);
  const lang = LANGS[getLang()] ?? 'pt-BR';
  const n = native();
  if (n) {
    if (o.urgent) void n.stop?.().catch(() => undefined);
    n.speak({ text, lang, rate: 1.0, pitch: 1.15 }).catch(() => undefined);
    return;
  }
  const ss = window.speechSynthesis;
  if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    if (o.urgent) ss.cancel();
    else if (ss.pending) return; // não empilha falas
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.02;
    u.pitch = 1.2;
    const v = ss.getVoices().find((x) => x.lang?.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    ss.speak(u);
  } catch {
    /* sem voz */
  }
}
onNarration((v) => {
  if (!v) stopSpeak();
});
export function stopSpeak(): void {
  try {
    window.speechSynthesis?.cancel();
    void native()?.stop?.().catch(() => undefined);
  } catch {
    /* */
  }
}
