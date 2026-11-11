/* ============================================================
 *  BLOOP ESPELHO — Web Worker do rastreamento.
 *  Recebe quadros reduzidos (ImageData já desenhado no thread principal,
 *  buffer transferido sem cópia), roda o MediaPipe fora do thread principal
 *  e devolve só os números do Rig. O desenho do Bloop nunca espera a detecção.
 *  Erros NÃO são engolidos: cada resposta leva o erro (se houve) para o
 *  tracker.ts decidir trocar de delegate/caminho e para o painel de diagnóstico.
 * ============================================================ */
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { neutralRig, RIG_KEYS } from './rig';
import { createLandmarker, mapResult, rigToArr, type Delegate } from './track-core';

interface Scope {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(m: unknown, transfer?: Transferable[]): void;
  close(): void;
}
const scope = self as unknown as Scope;
let lm: FaceLandmarker | null = null;
let lastTs = 0;
const rig = neutralRig();

const errText = (e: unknown): string => String((e as Error)?.message ?? e).slice(0, 200);

scope.onmessage = async (ev: MessageEvent) => {
  const d = ev.data as { t: string; base?: string; delegate?: Delegate; img?: ImageData; ts?: number };
  if (d.t === 'init') {
    try {
      // o MediaPipe sobe cada quadro por WebGL (até com CPU): sem WebGL no worker, nem tenta
      const oc = new OffscreenCanvas(1, 1);
      if (!oc.getContext('webgl2') && !new OffscreenCanvas(1, 1).getContext('webgl')) throw new Error('sem WebGL no worker');
      lm = await createLandmarker(d.base!, d.delegate!);
      scope.postMessage({ t: 'ready' });
    } catch (e) {
      scope.postMessage({ t: 'fail', err: errText(e) });
    }
  } else if (d.t === 'frame') {
    const a = performance.now();
    let found = false;
    let err = '';
    try {
      if (!lm) throw new Error('not-ready');
      const ts = Math.max(lastTs + 1, Math.round(d.ts!));
      lastTs = ts;
      found = mapResult(lm.detectForVideo(d.img!, ts), rig);
    } catch (e) {
      err = errText(e);
    }
    const arr = rigToArr(rig, new Float64Array(RIG_KEYS.length));
    scope.postMessage({ t: 'res', found, rig: arr, ms: performance.now() - a, err }, [arr.buffer]);
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
