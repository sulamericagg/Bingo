/* ============================================================
 *  CAVA & FALA — reconhecimento de voz "segure para falar".
 *   Android (Capacitor): plugin nativo @capacitor-community/speech-recognition
 *     (acessado por registerPlugin('SpeechRecognition'), sem import do pacote:
 *     o lado nativo entra no `cap sync`). pt-BR, até 5 alternativas, resultados
 *     parciais por evento, sem pop-up do Google. O Android usa o modelo offline
 *     quando o pacote de idioma pt-BR está baixado no aparelho.
 *   Web: window.SpeechRecognition / webkitSpeechRecognition (Chrome/Edge).
 *   Testes: window.__cavafalaSpeechMock = 'canhão de espuma' (ou lista) simula
 *     o resultado do reconhecedor passando pelo mesmo caminho do botão.
 *   Sem nada disso: o jogo cai para digitar (T) ou escolher no círculo.
 * ============================================================ */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { getLang } from '../../i18n';

interface SpeechPlugin {
  available(): Promise<{ available: boolean }>;
  start(o: { language?: string; maxResults?: number; prompt?: string; popup?: boolean; partialResults?: boolean }): Promise<{ matches?: string[] } | void>;
  stop(): Promise<void>;
  checkPermissions(): Promise<{ speechRecognition: string }>;
  requestPermissions(): Promise<{ speechRecognition: string }>;
  addListener(ev: 'partialResults', f: (d: { matches?: string[] }) => void): Promise<PluginListenerHandle>;
  addListener(ev: 'listeningState', f: (d: { status: 'started' | 'stopped' }) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const Native = registerPlugin<SpeechPlugin>('SpeechRecognition');

type WebRec = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export type VoiceKind = 'native' | 'web' | 'mock' | 'none';

const LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR', it: 'it-IT', ja: 'ja-JP', ko: 'ko-KR', ru: 'ru-RU', tr: 'tr-TR', id: 'id-ID', zh: 'zh-CN' };
/** o vocabulário entende pt-BR + inglês (+ um pouco de espanhol); outros idiomas ouvem em inglês */
function speechLang(): string {
  const l = getLang();
  return l === 'pt' || l === 'en' || l === 'es' ? LOCALE[l] : 'en-US';
}

function mock(): string[] | null {
  const m = (window as unknown as { __cavafalaSpeechMock?: string | string[] }).__cavafalaSpeechMock;
  if (m == null) return null;
  return Array.isArray(m) ? m : [m];
}

function webCtor(): (new () => WebRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => WebRec; webkitSpeechRecognition?: new () => WebRec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let nativeOk: boolean | null = null;
export function voiceKind(): VoiceKind {
  if (mock()) return 'mock';
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SpeechRecognition') && nativeOk !== false) return 'native';
  if (webCtor()) return 'web';
  return 'none';
}

export interface VoiceSession {
  /** solta o botão: espera o resultado final (alternativas) */
  finish(): Promise<string[]>;
  cancel(): void;
}

/** começa a ouvir. `onPartial` recebe o texto parcial. null = sem voz (use digitação). */
export async function listen(onPartial: (s: string) => void, onError?: (msg: string) => void): Promise<VoiceSession | null> {
  const kind = voiceKind();
  if (kind === 'mock') {
    const alts = mock()!;
    let tm = 0;
    tm = window.setTimeout(() => onPartial(alts[0]), 250);
    return {
      finish: async () => {
        clearTimeout(tm);
        onPartial(alts[0]);
        await new Promise((r) => setTimeout(r, 120));
        return alts;
      },
      cancel: () => clearTimeout(tm),
    };
  }
  if (kind === 'native') return listenNative(onPartial, onError);
  if (kind === 'web') return listenWeb(onPartial, onError);
  return null;
}

async function listenNative(onPartial: (s: string) => void, onError?: (m: string) => void): Promise<VoiceSession | null> {
  try {
    if (nativeOk === null) nativeOk = (await Native.available()).available;
    if (!nativeOk) return null;
    let perm = (await Native.checkPermissions()).speechRecognition;
    if (perm !== 'granted') perm = (await Native.requestPermissions()).speechRecognition;
    if (perm !== 'granted') {
      onError?.('perm');
      return null;
    }
  } catch {
    nativeOk = false;
    return null;
  }
  let latest: string[] = [];
  let stopped = false;
  const h = await Native.addListener('partialResults', (d) => {
    if (d.matches?.length) {
      latest = d.matches;
      onPartial(d.matches[0]);
    }
  });
  const started = Native.start({ language: speechLang(), maxResults: 5, partialResults: true, popup: false }).then(
    (r) => {
      if (r && 'matches' in r && r.matches?.length) latest = r.matches;
    },
    (e) => {
      if (!stopped) onError?.(String(e?.message ?? e));
    },
  );
  const cleanup = () => {
    stopped = true;
    void h.remove();
  };
  return {
    async finish() {
      // dá um respiro para o resultado final chegar
      await new Promise((r) => setTimeout(r, 450));
      try {
        await Native.stop();
      } catch {
        /* já parou */
      }
      await Promise.race([started, new Promise((r) => setTimeout(r, 700))]);
      cleanup();
      return latest;
    },
    cancel() {
      cleanup();
      void Native.stop().catch(() => {});
    },
  };
}

function listenWeb(onPartial: (s: string) => void, onError?: (m: string) => void): VoiceSession | null {
  const C = webCtor();
  if (!C) return null;
  let rec: WebRec;
  try {
    rec = new C();
  } catch {
    return null;
  }
  rec.lang = speechLang();
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 5;
  let finals: string[] = [];
  let interim: string[] = [];
  let ended = false;
  let endRes: (() => void) | null = null;
  rec.onresult = (e) => {
    const fin: string[][] = [];
    let it: string[] = [];
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      const alts: string[] = [];
      for (let j = 0; j < r.length; j++) alts.push(r[j].transcript);
      if (r.isFinal) fin.push(alts);
      else it = alts;
    }
    // junta frases finais; alternativas da última
    const head = fin
      .slice(0, -1)
      .map((a) => a[0])
      .join(' ');
    const last = fin.length ? fin[fin.length - 1] : [];
    finals = last.map((a) => (head ? head + ' ' : '') + a);
    interim = it.map((a) => (fin.length ? fin.map((x) => x[0]).join(' ') + ' ' : '') + a);
    onPartial((interim[0] ?? finals[0] ?? '').trim());
  };
  rec.onerror = (e) => {
    if (e.error !== 'aborted' && e.error !== 'no-speech') onError?.(e.error);
  };
  rec.onend = () => {
    ended = true;
    endRes?.();
  };
  try {
    rec.start();
  } catch {
    return null;
  }
  return {
    async finish() {
      try {
        rec.stop();
      } catch {
        /* */
      }
      if (!ended) await Promise.race([new Promise<void>((r) => (endRes = r)), new Promise((r) => setTimeout(r, 1500))]);
      const out = finals.length ? finals : interim;
      return out.map((s) => s.trim()).filter(Boolean);
    },
    cancel() {
      try {
        rec.abort();
      } catch {
        /* */
      }
    },
  };
}
