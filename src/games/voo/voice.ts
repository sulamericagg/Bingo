/* Voz (TTS do aparelho) para quem ainda não lê: comandos, tutorial e emergências.
 * Usa speechSynthesis no idioma do jogo; sem voz disponível, simplesmente não fala. */
import { getLang } from '../../i18n';
import { save } from '../../core/storage';

const LANG_TAG: Record<string, string> = {
  pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', zh: 'zh-CN',
};
let lastAt = 0;
let lastText = '';

/** fala um texto curto. `urgent` interrompe a fala atual; senão respeita um intervalo mínimo. */
export function speak(text: string, o: { urgent?: boolean; gap?: number } = {}): void {
  try {
    const ss = globalThis.speechSynthesis;
    if (!ss || !text || !save.sound) return;
    const now = performance.now();
    if (!o.urgent && (now - lastAt < (o.gap ?? 1800) || (text === lastText && now - lastAt < 6000))) return;
    lastAt = now;
    lastText = text;
    const u = new SpeechSynthesisUtterance(text.replace(/[!·]/g, ' '));
    const tag = LANG_TAG[getLang()] ?? 'pt-BR';
    u.lang = tag;
    const v = ss.getVoices().find((x) => x.lang?.replace('_', '-').toLowerCase().startsWith(tag.slice(0, 2).toLowerCase()));
    if (v) u.voice = v;
    u.rate = 1.05;
    u.pitch = 1.25;
    u.volume = 0.9;
    if (o.urgent) ss.cancel();
    ss.speak(u);
  } catch {
    /* sem TTS */
  }
}
export function hush(): void {
  try {
    globalThis.speechSynthesis?.cancel();
  } catch {
    /* */
  }
}
