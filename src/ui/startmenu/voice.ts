/* Voz das telas de início: lê o rótulo do cartão tocado (só com a narração ligada em Configurações). */
import { getLang } from '../../i18n';
import { save } from '../../core/storage';
import { narrationOn } from '../../core/narration';

const LANG_TAG: Record<string, string> = {
  pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', zh: 'zh-CN',
};
let lastText = '';
let lastAt = 0;

export function smSay(text: string | undefined, urgent = true): void {
  try {
    const ss = globalThis.speechSynthesis;
    if (!ss || !text || !save.sound || !narrationOn()) return;
    const now = performance.now();
    if (text === lastText && now - lastAt < 1500) return;
    lastText = text;
    lastAt = now;
    const u = new SpeechSynthesisUtterance(text.replace(/[!·•]/g, ' '));
    const tag = LANG_TAG[getLang()] ?? 'pt-BR';
    u.lang = tag;
    const v = ss.getVoices().find((x) => x.lang?.replace('_', '-').toLowerCase().startsWith(tag.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    u.rate = 1.05;
    u.pitch = 1.2;
    if (urgent) ss.cancel();
    ss.speak(u);
  } catch {
    /* sem TTS */
  }
}
export function smHush(): void {
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    /* */
  }
}
