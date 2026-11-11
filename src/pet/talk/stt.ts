/* ============================================================
 *  FALA → TEXTO (no aparelho/sistema; só o TEXTO segue adiante).
 *   - Android: reconhecimento de voz nativo (@capacitor-community/speech-recognition), com parciais.
 *   - Web: SpeechRecognition / webkitSpeechRecognition.
 *   - Sem nada disso: a tela mostra a caixa de texto.
 * ============================================================ */
import { SpeechRecognition as NativeSR } from '@capacitor-community/speech-recognition';
import { isNative } from '../../core/platform';
import { getLang } from '../../i18n';

const BCP47: Record<string, string> = {
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
export const speechLang = (): string => BCP47[getLang()] ?? 'pt-BR';

export type SttError = 'unsupported' | 'denied' | 'nomatch' | 'failed';

export interface SttHandlers {
  onPartial?: (text: string) => void;
}

interface WebSR {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
}

function webCtor(): (new () => WebSR) | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

let nativeOk: boolean | null = null;

/** Há reconhecimento de voz neste aparelho? */
export async function sttAvailable(): Promise<boolean> {
  if ((window as any).__bloopFakeStt) return true;
  if (isNative) {
    if (nativeOk === null) nativeOk = await NativeSR.available().then((r) => r.available).catch(() => false);
    return nativeOk;
  }
  return !!webCtor();
}

let active: { stop: () => void; cancel: () => void } | null = null;

export const sttListening = (): boolean => !!active;

/**
 * Começa a ouvir (segurar o botão). Resolve com o texto final quando `stopListening()` é chamado
 * (soltar o botão) ou quando o sistema detecta o fim da fala.
 */
export async function listen(h: SttHandlers = {}): Promise<{ text: string } | { error: SttError }> {
  cancelListening();
  // Teste automatizado: window.__bloopFakeStt = 'texto' simula a fala
  const fake = (window as any).__bloopFakeStt;
  if (typeof fake === 'string') {
    return new Promise((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        active = null;
        res(fake ? { text: fake } : { error: 'nomatch' });
      };
      active = { stop: finish, cancel: finish };
      setTimeout(() => h.onPartial?.(fake.slice(0, Math.ceil(fake.length / 2))), 80);
    });
  }
  if (isNative) return listenNative(h);
  const C = webCtor();
  if (!C) return { error: 'unsupported' };
  return new Promise((res) => {
    const sr = new C();
    sr.lang = speechLang();
    sr.interimResults = true;
    sr.continuous = true;
    sr.maxAlternatives = 1;
    let finalText = '';
    let interim = '';
    let settled = false;
    const done = (r: { text: string } | { error: SttError }) => {
      if (settled) return;
      settled = true;
      active = null;
      res(r);
    };
    sr.onresult = (e: any) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      h.onPartial?.((finalText + interim).trim());
    };
    sr.onerror = (e: any) => {
      const code = String(e?.error || '');
      if (code === 'not-allowed' || code === 'service-not-allowed') done({ error: 'denied' });
      else if (code === 'no-speech' || code === 'aborted') done({ error: 'nomatch' });
      else done({ error: 'failed' });
    };
    sr.onend = () => {
      const txt = (finalText + interim).trim();
      done(txt ? { text: txt } : { error: 'nomatch' });
    };
    active = {
      stop: () => {
        try {
          sr.stop();
        } catch {
          /* já parou */
        }
      },
      cancel: () => {
        try {
          sr.abort();
        } catch {
          /* ok */
        }
        done({ error: 'nomatch' });
      },
    };
    try {
      sr.start();
    } catch {
      done({ error: 'failed' });
    }
  });
}

async function listenNative(h: SttHandlers): Promise<{ text: string } | { error: SttError }> {
  if (!(await sttAvailable())) return { error: 'unsupported' };
  let perm = await NativeSR.checkPermissions().catch(() => null);
  if (perm?.speechRecognition !== 'granted') perm = await NativeSR.requestPermissions().catch(() => null);
  if (perm?.speechRecognition !== 'granted') return { error: 'denied' };
  let last = '';
  const sub = await NativeSR.addListener('partialResults', (d) => {
    const s = d.matches?.[0];
    if (s) {
      last = s;
      h.onPartial?.(s);
    }
  });
  return new Promise((res) => {
    let settled = false;
    const done = (r: { text: string } | { error: SttError }) => {
      if (settled) return;
      settled = true;
      active = null;
      void sub.remove();
      res(r);
    };
    active = {
      stop: () => {
        // dá um instante para o último parcial chegar
        void NativeSR.stop()
          .catch(() => {})
          .then(() => setTimeout(() => done(last ? { text: last } : { error: 'nomatch' }), 250));
      },
      cancel: () => {
        void NativeSR.stop().catch(() => {});
        done({ error: 'nomatch' });
      },
    };
    // popup:false + partialResults:true → resolve logo; o texto vem pelos parciais
    NativeSR.start({ language: speechLang(), maxResults: 1, partialResults: true, popup: false })
      .then((r) => {
        const s = r?.matches?.[0];
        if (s) last = s;
      })
      .catch(() => done(last ? { text: last } : { error: 'failed' }));
  });
}

/** Soltou o botão: termina e entrega o texto. */
export function stopListening(): void {
  active?.stop();
}

/** Cancela sem usar o texto. */
export function cancelListening(): void {
  active?.cancel();
  active = null;
}
