/* ============================================================
 *  Fala → texto (para a História Mágica).
 *   - Android: plugin nativo "SpeechRecognition"
 *     (@capacitor-community/speech-recognition; usado só se estiver
 *     instalado no app — chamado por registerPlugin, sem dependência
 *     de build). Ver docs/IA.md.
 *   - Web: SpeechRecognition / webkitSpeechRecognition.
 *   - Sem nenhum dos dois: a criança digita (o botão some).
 *  O áudio vai para o reconhecedor do sistema; nada é guardado.
 * ============================================================ */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getLang } from '../i18n';

interface NativeSR {
  available(): Promise<{ available: boolean }>;
  requestPermissions(): Promise<{ speechRecognition?: string }>;
  start(o: { language: string; maxResults: number; prompt?: string; partialResults: boolean; popup: boolean }): Promise<{ matches?: string[] }>;
  stop(): Promise<void>;
}
const native = registerPlugin<NativeSR>('SpeechRecognition');

const LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', zh: 'zh-CN' };
export const speechLocale = (): string => LOCALE[getLang()] ?? 'pt-BR';

type WebSR = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
const WebCtor = (): (new () => WebSR) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => WebSR; webkitSpeechRecognition?: new () => WebSR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Há algum reconhecedor de fala? (decide se o botão do microfone aparece) */
export async function speechAvailable(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    if (!Capacitor.isPluginAvailable('SpeechRecognition')) return false;
    try {
      return (await native.available()).available;
    } catch {
      return false;
    }
  }
  return !!WebCtor();
}

export type ListenResult = { text: string } | { error: 'denied' | 'none' | 'failed' };

/** Escuta uma frase. `onPartial` recebe o texto enquanto a criança fala (web). */
export async function listenOnce(onPartial: (s: string) => void, prompt?: string): Promise<ListenResult> {
  if (Capacitor.isNativePlatform()) {
    try {
      const p = await native.requestPermissions();
      if (p.speechRecognition && p.speechRecognition !== 'granted') return { error: 'denied' };
      const r = await native.start({ language: speechLocale(), maxResults: 1, prompt, partialResults: false, popup: true });
      const s = r.matches?.[0]?.trim();
      return s ? { text: s } : { error: 'none' };
    } catch (e) {
      console.warn('[fala] nativo', e);
      return { error: 'failed' };
    }
  }
  const C = WebCtor();
  if (!C) return { error: 'failed' };
  return new Promise((res) => {
    const sr = new C();
    sr.lang = speechLocale();
    sr.interimResults = true;
    sr.maxAlternatives = 1;
    sr.continuous = false;
    let best = '';
    let err: ListenResult | null = null;
    sr.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      best = s.trim();
      onPartial(best);
    };
    sr.onerror = (e) => (err = { error: e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error === 'no-speech' ? 'none' : 'failed' });
    sr.onend = () => res(best ? { text: best } : (err ?? { error: 'none' }));
    try {
      sr.start();
    } catch {
      res({ error: 'failed' });
    }
    activeWeb = sr;
  });
}
let activeWeb: WebSR | null = null;
/** Para de escutar (web). */
export function stopListening(): void {
  try {
    activeWeb?.stop();
  } catch {
    /* */
  }
  activeWeb = null;
  if (Capacitor.isNativePlatform()) void native.stop().catch(() => {});
}
