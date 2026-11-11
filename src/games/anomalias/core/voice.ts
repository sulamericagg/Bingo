/* ANOMALIAS — voz (criança que ainda não lê): TTS nativo (Capacitor) ou speechSynthesis. */
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { isNative } from '../../../core/platform';
import { getLang } from '../../../i18n';

const LANGS: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', zh: 'zh-CN' };
let on = true;
const last = new Map<string, number>();
export const setVoiceOn = (v: boolean): void => {
  on = v;
  if (!v) stopVoice();
};
type NativeTts = { speak(o: { text: string; lang: string; rate: number; pitch: number }): Promise<void>; stop?(): Promise<void> };

export function say(text: string, o: { cool?: number; urgent?: boolean } = {}): void {
  if (!on || !text) return;
  const now = performance.now();
  if (now - (last.get(text) ?? -1e9) < (o.cool ?? 5000)) return;
  last.set(text, now);
  const lang = LANGS[getLang()] ?? 'pt-BR';
  if (isNative) {
    const n = TextToSpeech as unknown as NativeTts;
    if (o.urgent) void n.stop?.().catch(() => undefined);
    n.speak({ text, lang, rate: 1.0, pitch: 1.1 }).catch(() => undefined);
    return;
  }
  const ss = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!ss || typeof SpeechSynthesisUtterance === 'undefined') return;
  try {
    if (o.urgent) ss.cancel();
    else if (ss.pending || ss.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.02;
    u.pitch = 1.1;
    const v = ss.getVoices().find((x) => x.lang?.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    ss.speak(u);
  } catch {
    /* sem voz */
  }
}
export function stopVoice(): void {
  try {
    window.speechSynthesis?.cancel();
    if (isNative) void (TextToSpeech as unknown as NativeTts).stop?.().catch(() => undefined);
  } catch {
    /* */
  }
}
