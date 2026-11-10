/* ============================================================
 *  BLOOP ESPELHO — rastreamento do rosto (MediaPipe Face Landmarker).
 *  Tudo LOCAL: modelo e WASM vêm do próprio app (public/mediapipe +
 *  cópia do WASM no build). Nenhum quadro da câmera sai do aparelho.
 *  Este módulo (e a lib de ~140 KB) só carrega quando a câmera liga.
 *
 *  Desempenho: a detecção roda num Web Worker (quadro reduzido enviado
 *  como ImageBitmap, sem ler pixels no thread principal), então o desenho
 *  do Bloop nunca espera o MediaPipe. Sem Worker/OffscreenCanvas, cai para
 *  o thread principal, mas fora do callback de rAF (depois do quadro pintar)
 *  e no máximo uma detecção em andamento.
 * ============================================================ */
import { FilesetResolver } from '@mediapipe/tasks-vision';
import { neutralRig, type Rig } from './rig';
import { arrToRig, createLandmarker, mapResult } from './track-core';

export interface FaceTracker {
  readonly delegate: 'GPU' | 'CPU';
  /** onde a detecção roda */
  readonly where: 'worker' | 'main';
  /** há um quadro sendo analisado (não mande outro) */
  readonly busy: boolean;
  /**
   * Envia um quadro do vídeo (reduzido para sw×sh) para análise. Não bloqueia:
   * o resultado chega depois em onResult.
   */
  submit(video: HTMLVideoElement, sw: number, sh: number, tsMs: number): void;
  /** found=false: nenhum rosto. costMs: tempo de análise (para adaptar a frequência). */
  onResult: ((found: boolean, rig: Rig, costMs: number) => void) | null;
  close(): void;
}

const base = (): string => new URL('./mediapipe/', document.baseURI).href;
/** depuração/medição: ?mirrorCpu força o delegate CPU, ?mirrorMain desliga o worker */
const cpuOnly = (): boolean => /[?&]mirrorCpu\b/.test(location.search);

/* ---------------------------- Worker ---------------------------- */

function workerTracker(): Promise<FaceTracker> {
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
    let busy = false;
    let sentAt = 0;
    let closed = false;
    const timer = setTimeout(() => {
      if (!ready) {
        w.terminate();
        reject(new Error('worker-timeout'));
      }
    }, 45000);
    const tr: FaceTracker = {
      delegate: 'GPU',
      where: 'worker',
      get busy() {
        return busy;
      },
      onResult: null,
      submit(video, sw, sh, tsMs) {
        if (busy || closed) return;
        busy = true;
        sentAt = performance.now();
        createImageBitmap(video, { resizeWidth: sw, resizeHeight: sh, resizeQuality: 'low' }).then(
          (bmp) => {
            if (closed) return bmp.close();
            w.postMessage({ t: 'frame', bmp, ts: tsMs }, [bmp]);
          },
          () => (busy = false),
        );
      },
      close() {
        closed = true;
        w.postMessage({ t: 'close' });
        setTimeout(() => w.terminate(), 200);
      },
    };
    w.onmessage = (ev: MessageEvent) => {
      const d = ev.data as { t: string; delegate?: 'GPU' | 'CPU'; found?: boolean; rig?: Float64Array; ms?: number; err?: string };
      if (d.t === 'ready') {
        ready = true;
        clearTimeout(timer);
        (tr as { delegate: 'GPU' | 'CPU' }).delegate = d.delegate!;
        resolve(tr);
      } else if (d.t === 'fail') {
        clearTimeout(timer);
        w.terminate();
        reject(new Error(d.err || 'worker'));
      } else if (d.t === 'res') {
        busy = false;
        if (closed) return;
        if (d.found && d.rig) arrToRig(d.rig, rig);
        // custo visto daqui = ida + análise + volta (o que limita a frequência)
        tr.onResult?.(!!d.found, rig, performance.now() - sentAt);
      }
    };
    w.onerror = (e) => {
      console.warn('[espelho] worker', e.message);
      if (!ready) {
        clearTimeout(timer);
        w.terminate();
        reject(new Error('worker-error'));
      } else busy = false;
    };
    w.postMessage({ t: 'init', base: base(), cpu: cpuOnly() });
  });
}

/* ------------------------ thread principal (reserva) ------------------------ */

async function mainTracker(simd: boolean): Promise<FaceTracker> {
  const { lm, delegate } = await createLandmarker(base(), simd, cpuOnly());
  const small = document.createElement('canvas');
  const sx = small.getContext('2d')!;
  const rig = neutralRig();
  let busy = false;
  let lastTs = 0;
  let closed = false;
  // roda DEPOIS do quadro (tarefa nova), nunca dentro do callback do rAF
  const ch = new MessageChannel();
  let job: { video: HTMLVideoElement; sw: number; sh: number; ts: number } | null = null;
  const tr: FaceTracker = {
    delegate,
    where: 'main',
    get busy() {
      return busy;
    },
    onResult: null,
    submit(video, sw, sh, tsMs) {
      if (busy || closed) return;
      busy = true;
      job = { video, sw, sh, ts: tsMs };
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
  ch.port1.onmessage = () => {
    const j = job;
    job = null;
    if (!j || closed) return void (busy = false);
    const a = performance.now();
    let found = false;
    try {
      if (small.width !== j.sw || small.height !== j.sh) {
        small.width = j.sw;
        small.height = j.sh;
      }
      sx.drawImage(j.video, 0, 0, j.sw, j.sh);
      const ts = Math.max(lastTs + 1, Math.round(j.ts));
      lastTs = ts;
      found = mapResult(lm.detectForVideo(small, ts), rig);
    } catch (e) {
      console.warn('[espelho] detect', e);
    }
    busy = false;
    tr.onResult?.(found, rig, performance.now() - a);
  };
  return tr;
}

export async function createFaceTracker(): Promise<FaceTracker> {
  const simd = await FilesetResolver.isSimdSupported();
  if (!simd) throw new Error('no-simd');
  const canWorker = typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function' && !/[?&]mirrorMain\b/.test(location.search);
  if (canWorker) {
    try {
      return await workerTracker();
    } catch (e) {
      console.warn('[espelho] worker indisponível, usando o thread principal', e);
    }
  }
  return mainTracker(simd);
}
