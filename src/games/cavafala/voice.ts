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
 *  NUNCA trava: toda espera do plugin tem tempo-limite; permissão é pedida ANTES de ouvir
 *  (cartão amigável se negar); o medidor da onda usa o nível REAL do microfone quando dá
 *  (web: getUserMedia + AnalyserNode) e, no Android (o reconhecedor do Google segura o
 *  microfone), pulsa com a atividade dos resultados parciais.
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

/** por que não deu para ouvir */
export type VoiceFail = 'perm' | 'unavailable' | 'error';
export interface ListenHooks {
  /** texto parcial (o que já ouviu) */
  onPartial(s: string): void;
  /** nível do microfone 0..1 (~30×/s) */
  onLevel?(v: number): void;
  /** vai abrir o pedido de permissão do sistema (mostre um cartão, não um "carregando") */
  onAskPerm?(): void;
  onError?(why: VoiceFail, detail?: string): void;
}

/** espera no máximo `ms`; depois devolve `fb` (nunca fica infinito) */
export function withTimeout<T>(p: Promise<T>, ms: number, fb: T): Promise<T> {
  return new Promise((res) => {
    const tm = setTimeout(() => res(fb), ms);
    p.then(
      (v) => {
        clearTimeout(tm);
        res(v);
      },
      () => {
        clearTimeout(tm);
        res(fb);
      },
    );
  });
}

/* ------------------------------ permissão (Android) ------------------------------ */
export type PermState = 'granted' | 'denied' | 'prompt' | 'unknown';
/** estado da permissão do reconhecedor nativo (sem pedir) */
export async function micPermission(): Promise<PermState> {
  if (voiceKind() !== 'native') return 'unknown';
  const r = await withTimeout(Native.checkPermissions(), 3000, null);
  const v = r?.speechRecognition;
  return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : v ? 'prompt' : 'unknown';
}
/** pede a permissão do microfone (a janela do sistema espera a criança: até 30 s) */
export async function askMicPermission(): Promise<PermState> {
  if (voiceKind() !== 'native') return 'unknown';
  const r = await withTimeout(Native.requestPermissions(), 30000, null);
  const v = r?.speechRecognition;
  return v === 'granted' ? 'granted' : v === 'denied' ? 'denied' : 'unknown';
}
/** abre os ajustes do app (Android: BloopDevice.openSettings) para liberar o microfone; false se não deu */
export async function openAppSettings(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const Dev = registerPlugin<{ openSettings(): Promise<void> }>('BloopDevice');
    let ok = true;
    await withTimeout(
      Dev.openSettings().catch(() => {
        ok = false;
      }),
      3000,
      undefined,
    );
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------ medidor (onda de verdade) ------------------------------ */
interface Meter {
  stop(): void;
}
/** nível real do microfone pelo navegador (web). No Android nativo NÃO abre (disputa o microfone com o reconhecedor). */
async function startMeter(onLevel: (v: number) => void): Promise<Meter | null> {
  if (Capacitor.isNativePlatform() || !navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: true } }), 4000, null);
    if (!stream) return null;
    const AC = (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext) as typeof AudioContext;
    const ac = new AC();
    void ac.resume().catch(() => {});
    const src = ac.createMediaStreamSource(stream);
    const an = ac.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    let lv = 0;
    const tick = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // fala ~0.02..0.3 → 0..1 (escala de "volume" que a criança entende)
      const v = Math.min(1, Math.max(0, (Math.log10(rms + 1e-4) + 2.6) / 2));
      lv = v > lv ? v : lv * 0.82 + v * 0.18;
      onLevel(lv);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return {
      stop() {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach((t) => t.stop());
        void ac.close().catch(() => {});
      },
    };
  } catch {
    return null;
  }
}
/** sem nível real (Android): pulsa com a atividade do reconhecedor (cada pedaço novo ouvido = pico) */
function activityMeter(onLevel: (v: number) => void): { bump(k?: number): void; stop(): void } {
  let lv = 0.15;
  let alive = true;
  const tm = setInterval(() => {
    if (!alive) return;
    lv = Math.max(0.08, lv * 0.86);
    onLevel(lv + Math.random() * 0.06);
  }, 33);
  return {
    bump(k = 1) {
      lv = Math.min(1, lv + 0.45 * k + Math.random() * 0.2);
    },
    stop() {
      alive = false;
      clearInterval(tm);
    },
  };
}
/** medidor em paralelo (não atrasa o reconhecedor): nível real se der, senão pulsa com a atividade */
function bothMeters(onLevel?: (v: number) => void): { bump(k?: number): void; stop(): void } {
  if (!onLevel) return { bump() {}, stop() {} };
  let real: Meter | null = null;
  let dead = false;
  const act = activityMeter((v) => !real && onLevel(v));
  void startMeter(onLevel).then((m) => {
    if (dead) m?.stop();
    else real = m;
  });
  return {
    bump: (k) => act.bump(k),
    stop() {
      dead = true;
      act.stop();
      real?.stop();
    },
  };
}

/** começa a ouvir. null = sem voz agora (o motivo vai em onError; use digitar/círculo). */
export async function listen(hk: ListenHooks): Promise<VoiceSession | null> {
  const kind = voiceKind();
  if (kind === 'mock') {
    const alts = mock()!;
    const act = bothMeters(hk.onLevel);
    let tm = 0;
    tm = window.setTimeout(() => {
      hk.onPartial(alts[0]);
      act.bump();
    }, 250);
    return {
      finish: async () => {
        clearTimeout(tm);
        hk.onPartial(alts[0]);
        await new Promise((r) => setTimeout(r, 120));
        act.stop();
        return alts;
      },
      cancel: () => {
        clearTimeout(tm);
        act.stop();
      },
    };
  }
  if (kind === 'native') return listenNative(hk);
  if (kind === 'web') return listenWeb(hk);
  hk.onError?.('unavailable');
  return null;
}

async function listenNative(hk: ListenHooks): Promise<VoiceSession | null> {
  // 1) tem reconhecedor? (sem os serviços de voz do Google: não)
  if (nativeOk === null) nativeOk = (await withTimeout(Native.available(), 3000, { available: false })).available;
  if (!nativeOk) {
    hk.onError?.('unavailable');
    return null;
  }
  // 2) permissão ANTES de ouvir
  let perm = await micPermission();
  if (perm !== 'granted') {
    hk.onAskPerm?.();
    perm = await askMicPermission();
  }
  if (perm !== 'granted') {
    hk.onError?.('perm', perm);
    return null;
  }
  // 3) ouvir (com tempo-limite em tudo)
  let latest: string[] = [];
  let stopped = false;
  const act = hk.onLevel ? activityMeter(hk.onLevel) : { bump() {}, stop() {} };
  const subs: PluginListenerHandle[] = [];
  const add = async (p: Promise<PluginListenerHandle>) => {
    const h = await withTimeout(p, 2000, null);
    if (h) subs.push(h);
  };
  await add(
    Native.addListener('partialResults', (d) => {
      if (d.matches?.length) {
        if (d.matches[0] !== latest[0]) act.bump(Math.min(1.5, Math.abs((d.matches[0]?.length ?? 0) - (latest[0]?.length ?? 0)) / 6 + 0.4));
        latest = d.matches;
        hk.onPartial(d.matches[0]);
      }
    }),
  );
  await add(
    Native.addListener('listeningState', (d) => {
      if (d.status === 'started') act.bump(0.3);
    }),
  );
  // sessão anterior presa
  await withTimeout(Native.stop(), 800, undefined);
  let failed = false;
  const started = Native.start({ language: speechLang(), maxResults: 5, partialResults: true, popup: false }).then(
    (r) => {
      if (r && 'matches' in r && r.matches?.length) latest = r.matches;
    },
    (e) => {
      failed = true;
      if (!stopped) hk.onError?.('error', String(e?.message ?? e));
    },
  );
  const cleanup = () => {
    stopped = true;
    act.stop();
    for (const h of subs) void h.remove().catch(() => {});
    subs.length = 0;
  };
  return {
    async finish() {
      if (failed) {
        cleanup();
        return latest;
      }
      // dá um respiro para o resultado final chegar
      await new Promise((r) => setTimeout(r, 450));
      await withTimeout(Native.stop(), 1500, undefined);
      await withTimeout(started, 900, undefined);
      cleanup();
      return latest;
    },
    cancel() {
      cleanup();
      void withTimeout(Native.stop(), 1500, undefined);
    },
  };
}

function listenWeb(hk: ListenHooks): VoiceSession | null {
  const C = webCtor();
  if (!C) {
    hk.onError?.('unavailable');
    return null;
  }
  let rec: WebRec;
  try {
    rec = new C();
  } catch {
    hk.onError?.('unavailable');
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
  const act = bothMeters(hk.onLevel);
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
    act.bump();
    hk.onPartial((interim[0] ?? finals[0] ?? '').trim());
  };
  rec.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') hk.onError?.('perm', e.error);
    else if (e.error !== 'aborted' && e.error !== 'no-speech') hk.onError?.('error', e.error);
  };
  rec.onend = () => {
    ended = true;
    endRes?.();
  };
  try {
    rec.start();
  } catch {
    act.stop();
    hk.onError?.('error');
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
      act.stop();
      const out = finals.length ? finals : interim;
      return out.map((s) => s.trim()).filter(Boolean);
    },
    cancel() {
      act.stop();
      try {
        rec.abort();
      } catch {
        /* */
      }
    },
  };
}
