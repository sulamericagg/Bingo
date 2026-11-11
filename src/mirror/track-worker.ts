/* ============================================================
 *  BLOOP ESPELHO — Web Worker do rastreamento.
 *  Recebe quadros reduzidos (ImageBitmap transferido, sem cópia),
 *  roda o MediaPipe fora do thread principal e devolve só os números
 *  do Rig. O desenho do Bloop nunca espera a detecção.
 * ============================================================ */
import { FilesetResolver, type FaceLandmarker } from '@mediapipe/tasks-vision';
import { neutralRig, RIG_KEYS } from './rig';
import { createLandmarker, mapResult, rigToArr } from './track-core';

interface Scope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(m: unknown, transfer?: Transferable[]): void;
  close(): void;
}
const scope = self as unknown as Scope;
let lm: FaceLandmarker | null = null;
let lastTs = 0;
const rig = neutralRig();

scope.onmessage = async (ev: MessageEvent) => {
  const d = ev.data as { t: string; base?: string; cpu?: boolean; bmp?: ImageBitmap; ts?: number };
  if (d.t === 'init') {
    try {
      const r = await createLandmarker(d.base!, await FilesetResolver.isSimdSupported(), !!d.cpu);
      lm = r.lm;
      scope.postMessage({ t: 'ready', delegate: r.delegate });
    } catch (e) {
      scope.postMessage({ t: 'fail', err: String((e as Error)?.message ?? e) });
    }
  } else if (d.t === 'frame') {
    const bmp = d.bmp!;
    const a = performance.now();
    let found = false;
    try {
      if (lm) {
        const ts = Math.max(lastTs + 1, Math.round(d.ts!));
        lastTs = ts;
        found = mapResult(lm.detectForVideo(bmp, ts), rig);
      }
    } catch (e) {
      console.warn('[espelho] detect (worker)', e);
    }
    bmp.close();
    const arr = rigToArr(rig, new Float64Array(RIG_KEYS.length));
    scope.postMessage({ t: 'res', found, rig: arr, ms: performance.now() - a }, [arr.buffer]);
  } else if (d.t === 'close') {
    try {
      lm?.close();
    } catch {
      /* */
    }
    lm = null;
    scope.close();
  }
};
