/* ============================================================
 *  BLOOP ESPELHO — rastreamento do rosto (MediaPipe Face Landmarker).
 *  Tudo LOCAL: modelo e WASM vêm do próprio app (public/mediapipe +
 *  cópia do WASM no build), com caminhos RELATIVOS ao documento
 *  (funciona em https://localhost do Capacitor e em subpastas na web).
 *  Nenhum quadro da câmera sai do aparelho.
 *
 *  ROBUSTEZ (WebView do Android — Mali/Adreno/PowerVR):
 *   - o quadro é desenhado num canvas pequeno (256–320 px) no thread principal
 *     e enviado como ImageData (funciona em todo WebView; createImageBitmap de
 *     <video> da câmera devolve quadro vazio em alguns aparelhos);
 *   - tenta, em ordem, worker/CPU → worker/GPU → principal/CPU → principal/GPU
 *     (no desktop GPU primeiro) e TROCA sozinho se: não carregar, der erro 3x
 *     seguidas, não responder em 4 s, ou passar ~6 s com imagem boa sem achar
 *     rosto nenhum (GPU que "funciona" mas não detecta). A combinação que achou
 *     um rosto fica lembrada para a próxima vez;
 *   - nada é engolido: tudo vai para `diag` (painel "Diagnóstico do espelho").
 * ============================================================ */
import { FilesetResolver, type FaceLandmarker } from '@mediapipe/tasks-vision';
import { neutralRig, type Rig } from './rig';
import { arrToRig, createLandmarker, frameStats, mapResult, type Delegate } from './track-core';

export type Where = 'worker' | 'main';

export interface TrackDiag {
  stage: 'loading' | 'ready' | 'switching' | 'failed';
  where: Where | '-';
  delegate: Delegate | '-';
  /** algum FaceLandmarker carregou (modelo + WASM) */
  model: boolean;
  loadMs: number;
  /** histórico curto: "worker/CPU: ok 1.2s", "worker/GPU: erro ..." */
  log: string[];
  detFps: number;
  costMs: number;
  sent: number;
  results: number;
  faces: number;
  errors: number;
  lastError: string;
  /** brilho/contraste do último quadro enviado (quadro preto = câmera/cópia quebrada) */
  luma: number;
  spread: number;
  inW: number;
  inH: number;
  video: string;
  rvfc: boolean;
  /** achou rosto nesta sessão */
  proven: boolean;
  simd: boolean | null;
  /** WebGL do thread principal ('2', '1' ou 'não'): o MediaPipe SEMPRE sobe a imagem por WebGL, até com delegate CPU */
  webgl: string;
}

export interface FaceTracker {
  readonly delegate: Delegate;
  /** onde a detecção roda */
  readonly where: Where;
  /** há um quadro sendo analisado (ou trocando de modo): não mande outro */
  readonly busy: boolean;
  readonly diag: TrackDiag;
  /**
   * Envia um quadro do vídeo (reduzido para sw×sh) para análise. Não bloqueia:
   * o resultado chega depois em onResult.
   */
  submit(video: HTMLVideoElement, sw: number, sh: number, tsMs: number): void;
  /** found=false: nenhum rosto. costMs: tempo de análise (para adaptar a frequência). */
  onResult: ((found: boolean, rig: Rig, costMs: number) => void) | null;
  close(): void;
}

type Cb = (found: boolean, rig: Rig | Float64Array | null, ms: number, err: string) => void;
interface Backend {
  where: Where;
  delegate: Delegate;
  run(img: ImageData, ts: number, cb: Cb): void;
  close(): void;
}

const LOAD_TIMEOUT = 25_000;
const HANG_MS = 4_000;
const FIRST_HANG_MS = 12_000;
const NOFACE_SWITCH_MS = 6_000;
/** custo médio acima disso com GPU → tenta a CPU (Mali antiga, GPU emulada) */
const SLOW_MS = 220;
const PREF_KEY = 'bloop.mirror.trk';

/** teste: ?mirrorFail=worker/GPU,worker/CPU faz essas combinações darem erro em todo quadro */
const simFail = (/[?&]mirrorFail=([^&]*)/.exec(location.search)?.[1] ?? '').split(',').map(decodeURIComponent);
export const mpBase = (): string => new URL('./mediapipe/', document.baseURI).href;
const q = (k: string): boolean => new RegExp(`[?&]${k}\\b`).test(location.search);
const errText = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 200);

/** '2', '1' ou 'não' — versão de WebGL que este canvas consegue */
export function glVersion(c: HTMLCanvasElement | OffscreenCanvas): string {
  try {
    if (c.getContext('webgl2')) return '2';
  } catch {
    /* */
  }
  try {
    // canvas novo: um canvas que já tentou webgl2 pode recusar outro tipo
    const d = c instanceof HTMLCanvasElement ? document.createElement('canvas') : new OffscreenCanvas(1, 1);
    if (d.getContext('webgl')) return '1';
  } catch {
    /* */
  }
  return 'não';
}

export function newDiag(): TrackDiag {
  return {
    stage: 'loading',
    where: '-',
    delegate: '-',
    model: false,
    loadMs: 0,
    log: [],
    detFps: 0,
    costMs: 0,
    sent: 0,
    results: 0,
    faces: 0,
    errors: 0,
    lastError: '',
    luma: -1,
    spread: 0,
    inW: 0,
    inH: 0,
    video: '',
    rvfc: false,
    proven: false,
    simd: null,
    webgl: '?',
  };
}
function logTo(d: TrackDiag, s: string): void {
  d.log.push(s);
  if (d.log.length > 10) d.log.splice(0, d.log.length - 10);
}

/* ---------------------------- Worker ---------------------------- */

function workerBackend(base: string, delegate: Delegate): Promise<Backend> {
  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      w = new Worker(new URL('./track-worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const rig = neutralRig();
    let ready = false;
    let cb: Cb | null = null;
    const timer = setTimeout(() => {
      if (ready) return;
      w.terminate();
      reject(new Error('timeout'));
    }, LOAD_TIMEOUT);
    const be: Backend = {
      where: 'worker',
      delegate,
      run(img, ts, c) {
        cb = c;
        try {
          w.postMessage({ t: 'frame', img, ts }, [img.data.buffer]);
        } catch (e) {
          cb = null;
          c(false, null, 0, 'post: ' + errText(e));
        }
      },
      close() {
        try {
          w.postMessage({ t: 'close' });
        } catch {
          /* */
        }
        setTimeout(() => w.terminate(), 300);
      },
    };
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { t: string; found?: boolean; rig?: Float64Array; ms?: number; err?: string };
      if (d.t === 'ready') {
        ready = true;
        clearTimeout(timer);
        resolve(be);
      } else if (d.t === 'fail') {
        clearTimeout(timer);
        w.terminate();
        reject(new Error(d.err || 'worker'));
      } else if (d.t === 'res') {
        const c = cb;
        cb = null;
        if (d.found && d.rig) arrToRig(d.rig, rig);
        c?.(!!d.found, rig, d.ms ?? 0, d.err ?? '');
      }
    };
    w.onerror = (e) => {
      e.preventDefault?.();
      const msg = 'worker: ' + (e.message || 'erro');
      if (!ready) {
        clearTimeout(timer);
        w.terminate();
        reject(new Error(msg));
      } else {
        const c = cb;
        cb = null;
        c?.(false, null, 0, msg);
      }
    };
    w.postMessage({ t: 'init', base, delegate });
  });
}

/* ------------------------ thread principal ------------------------ */

async function mainBackend(base: string, delegate: Delegate): Promise<Backend> {
  let timer = 0;
  const lm: FaceLandmarker = await Promise.race([
    createLandmarker(base, delegate),
    new Promise<never>((_, rej) => (timer = window.setTimeout(() => rej(new Error('timeout')), LOAD_TIMEOUT))),
  ]);
  clearTimeout(timer);
  const rig = neutralRig();
  let lastTs = 0;
  let closed = false;
  // roda DEPOIS do quadro (tarefa nova), nunca dentro do callback do rAF
  const ch = new MessageChannel();
  let job: { img: ImageData; ts: number; cb: Cb } | null = null;
  ch.port1.onmessage = () => {
    const j = job;
    job = null;
    if (!j || closed) return;
    const a = performance.now();
    let found = false;
    let err = '';
    try {
      const ts = Math.max(lastTs + 1, Math.round(j.ts));
      lastTs = ts;
      found = mapResult(lm.detectForVideo(j.img, ts), rig);
    } catch (e) {
      err = errText(e);
    }
    j.cb(found, rig, performance.now() - a, err);
  };
  return {
    where: 'main',
    delegate,
    run(img, ts, cb) {
      job = { img, ts, cb };
      ch.port2.postMessage(0);
    },
    close() {
      closed = true;
      ch.port1.onmessage = null;
      try {
        lm.close();
      } catch {
        /* */
      }
    },
  };
}

/* ------------------------ gerente (troca automática) ------------------------ */

type Cfg = [Where, Delegate];
const cfgName = (c: Cfg): string => `${c[0]}/${c[1]}`;

function configs(isAndroid: boolean): Cfg[] {
  const canWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && !q('mirrorMain');
  const dels: Delegate[] = q('mirrorCpu') ? ['CPU'] : q('mirrorGpu') ? ['GPU'] : isAndroid ? ['CPU', 'GPU'] : ['GPU', 'CPU'];
  const out: Cfg[] = [];
  for (const w of canWorker ? (['worker', 'main'] as const) : (['main'] as const)) for (const d of dels) out.push([w, d]);
  // a que já achou rosto neste aparelho vai primeiro
  try {
    const p = localStorage.getItem(PREF_KEY);
    const i = out.findIndex((c) => cfgName(c) === p);
    if (i > 0) out.unshift(...out.splice(i, 1));
  } catch {
    /* sem storage */
  }
  return out;
}

const rvfcState = new WeakMap<HTMLVideoElement, { fresh: boolean; at: number }>();
type RvfcVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
/** Há quadro novo da câmera desde o último envio? (requestVideoFrameCallback quando existe) */
function freshFrame(v: RvfcVideo, d: TrackDiag): boolean {
  if (typeof v.requestVideoFrameCallback !== 'function') return true;
  let st = rvfcState.get(v);
  if (!st) {
    st = { fresh: true, at: 0 };
    rvfcState.set(v, st);
    const s = st;
    const tick = (): void => {
      s.fresh = true;
      s.at = performance.now();
      v.requestVideoFrameCallback!(tick);
    };
    v.requestVideoFrameCallback(tick);
  }
  d.rvfc = st.at > 0;
  // vídeo escondido pode não chamar o callback: depois de 400 ms sem ele, segue sem
  if (!st.fresh && performance.now() - st.at < 400) return false;
  st.fresh = false;
  return true;
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const diag = newDiag();
  const isAndroid = /Android/i.test(navigator.userAgent);
  try {
    diag.simd = await FilesetResolver.isSimdSupported();
  } catch (e) {
    diag.lastError = 'simd: ' + errText(e);
  }
  if (diag.simd === false) {
    diag.stage = 'failed';
    logTo(diag, 'sem WASM SIMD');
    throw Object.assign(new Error('no-simd'), { diag });
  }
  diag.webgl = glVersion(document.createElement('canvas'));
  if (diag.webgl === 'não') {
    // sem WebGL o MediaPipe não consegue nem ler a imagem (erro 'activeTexture' a cada quadro)
    diag.stage = 'failed';
    diag.lastError = 'sem WebGL';
    logTo(diag, 'sem WebGL no WebView (GPU bloqueada?)');
    throw Object.assign(new Error('no-webgl'), { diag });
  }
  const base = mpBase();
  const list = configs(isAndroid);
  let pref = '';
  try {
    pref = localStorage.getItem(PREF_KEY) ?? '';
  } catch {
    /* */
  }
  let idx = -1;
  /** combinações que carregaram (em ordem) e as que quebraram (erro/travou/não carregou) */
  const loaded: number[] = [];
  const broken = new Set<number>();
  let be: Backend | null = null;
  let closed = false;
  let switching = false;
  let busy = false;
  let pendingAt = 0;
  let errStreak = 0;
  let goodSince = 0;
  let cycled = false;
  let lastResAt = 0;
  let provenIdx = -1;
  let slowTried = false;
  /** respostas da combinação atual */
  let cfgRes = 0;
  const recent: number[] = [];
  /** combinações já tentadas neste ciclo */
  const tried = new Set<number>();
  const cvs = document.createElement('canvas');
  const cx = cvs.getContext('2d', { willReadFrequently: true })!;
  let res: (() => void) | null = null;
  let rej: ((e: Error) => void) | null = null;
  const firstReady = new Promise<void>((a, b) => {
    res = a;
    rej = b;
  });

  const tr: FaceTracker = {
    get delegate() {
      return be?.delegate ?? 'CPU';
    },
    get where() {
      return be?.where ?? 'main';
    },
    get busy() {
      return busy || switching || !be;
    },
    diag,
    onResult: null,
    submit(video, sw, sh, tsMs) {
      if (closed || switching || !be) return;
      const now = performance.now();
      if (busy) {
        // resposta sumiu (worker travado, GPU perdida): troca de modo
        // o 1º quadro de cada combinação pode demorar (compila shaders/aquece o WASM)
        const lim = cfgRes ? HANG_MS : FIRST_HANG_MS;
        if (now - pendingAt > lim) {
          diag.lastError = 'sem resposta em ' + lim / 1000 + ' s';
          void next('travou', true);
        }
        return;
      }
      diag.video = `${video.videoWidth}x${video.videoHeight} rs${video.readyState}`;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
      if (!freshFrame(video as RvfcVideo, diag)) return;
      let img: ImageData;
      try {
        if (cvs.width !== sw || cvs.height !== sh) {
          cvs.width = sw;
          cvs.height = sh;
        }
        cx.drawImage(video, 0, 0, sw, sh);
        img = cx.getImageData(0, 0, sw, sh);
      } catch (e) {
        diag.lastError = 'quadro: ' + errText(e);
        diag.errors++;
        return;
      }
      const st = frameStats(img);
      diag.luma = st.luma;
      diag.spread = st.spread;
      diag.inW = sw;
      diag.inH = sh;
      const good = st.luma > 0.06 && st.luma < 0.97 && st.spread > 0.035;
      if (!good) goodSince = 0;
      else if (!goodSince) goodSince = now;
      busy = true;
      pendingAt = now;
      diag.sent++;
      const mine = be;
      mine.run(img, tsMs, (found, rig, ms, err) => {
        if (mine !== be || closed) return;
        busy = false;
        const t = performance.now();
        diag.results++;
        const gap = lastResAt ? t - lastResAt : 0;
        lastResAt = t;
        if (gap > 0 && gap < 2000) diag.detFps = diag.detFps ? diag.detFps * 0.85 + (1000 / gap) * 0.15 : 1000 / gap;
        diag.costMs = diag.costMs ? diag.costMs * 0.85 + ms * 0.15 : ms;
        if (err) {
          diag.errors++;
          diag.lastError = err;
          if (++errStreak >= 3) void next('erro: ' + err.slice(0, 60), true);
          tr.onResult?.(false, neutralRig(), t - pendingAt);
          return;
        }
        errStreak = 0;
        cfgRes++;
        recent.push(ms);
        if (recent.length > 4) recent.shift();
        // GPU que funciona mas é lenta (GPU fraca/emulada): tenta a CPU uma vez
        // (mediana dos 4 últimos, depois do aquecimento — o 1º quadro na GPU compila shaders)
        if (!slowTried && mine.delegate === 'GPU' && cfgRes >= 6 && [...recent].sort((x, y) => x - y)[1] > SLOW_MS && list.some((c, i) => c[1] === 'CPU' && !tried.has(i) && i !== idx)) {
          slowTried = true;
          void next(`lento (${Math.round(diag.costMs)} ms)`);
        }
        if (found && rig) {
          diag.faces++;
          if (provenIdx !== idx) {
            provenIdx = idx;
            diag.proven = true;
            logTo(diag, `${cfgName(list[idx])}: rosto encontrado`);
            try {
              localStorage.setItem(PREF_KEY, cfgName(list[idx]));
            } catch {
              /* */
            }
          }
          tr.onResult?.(true, rig as Rig, t - pendingAt);
          return;
        }
        // imagem boa por muito tempo e NUNCA achou rosto nesta combinação → tenta a próxima
        if (!diag.proven && !cycled && cfgName(list[idx]) !== pref && goodSince && t - goodSince > NOFACE_SWITCH_MS && cfgRes > 15) void next('sem rosto com imagem boa');
        tr.onResult?.(false, rig as Rig, t - pendingAt);
      });
    },
    close() {
      closed = true;
      be?.close();
      be = null;
    },
  };

  /**
   * Liga a próxima combinação ainda não tentada. broke=true: a atual deu erro/travou (nunca volta
   * para ela). Sem nenhuma nova: volta UMA vez para a primeira que carregou e não quebrou; se
   * nem isso, desiste (stage 'failed') — sem laço infinito de recarregar.
   */
  async function next(why: string, broke = false, to?: number): Promise<void> {
    if (closed || switching) return;
    switching = true;
    if (idx >= 0 && why) logTo(diag, `${cfgName(list[idx])}: ${why}`);
    if (idx >= 0) {
      tried.add(idx);
      if (broke) broken.add(idx);
    }
    be?.close();
    be = null;
    busy = false;
    errStreak = 0;
    goodSince = 0;
    lastResAt = 0;
    cfgRes = 0;
    recent.length = 0;
    diag.detFps = 0;
    diag.costMs = 0;
    diag.stage = idx < 0 ? 'loading' : 'switching';
    const order = to !== undefined ? [to] : list.map((_, i) => i).filter((i) => !tried.has(i));
    for (const i of order) {
      if (closed) break;
      const c = list[i];
      diag.where = c[0];
      diag.delegate = c[1];
      const a = performance.now();
      try {
        const b = c[0] === 'worker' ? await workerBackend(base, c[1]) : await mainBackend(base, c[1]);
        if (simFail.includes(cfgName(c))) b.run = (_img, _ts, cb) => setTimeout(() => cb(false, null, 1, 'falha simulada'), 5);
        if (closed) {
          b.close();
          break;
        }
        be = b;
        idx = i;
        if (!loaded.includes(i)) loaded.push(i);
        diag.model = true;
        diag.loadMs = Math.round(performance.now() - a);
        diag.stage = 'ready';
        logTo(diag, `${cfgName(c)}: ok ${(diag.loadMs / 1000).toFixed(1)}s`);
        switching = false;
        res?.();
        return;
      } catch (e) {
        tried.add(i);
        broken.add(i);
        diag.errors++;
        diag.lastError = `${cfgName(c)}: ${errText(e)}`;
        logTo(diag, `${cfgName(c)}: falhou (${errText(e).slice(0, 80)})`);
        console.warn('[espelho] rastreamento', cfgName(c), e);
      }
    }
    if (closed) return;
    switching = false;
    const back = loaded.find((i) => !broken.has(i));
    if (!cycled && back !== undefined) {
      cycled = true;
      logTo(diag, 'volta para ' + cfgName(list[back]));
      return next('', false, back);
    }
    cycled = true;
    diag.stage = 'failed';
    diag.where = '-';
    diag.delegate = '-';
    logTo(diag, 'desistiu: nenhuma combinação funciona');
    rej?.(Object.assign(new Error(diag.lastError || 'model'), { diag }));
  }

  void next('');
  await firstReady;
  return tr;
}
