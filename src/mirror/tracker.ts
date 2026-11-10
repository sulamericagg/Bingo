/* ============================================================
 *  BLOOP ESPELHO — rastreamento do rosto (MediaPipe Face Landmarker).
 *  Tudo LOCAL: modelo e WASM vêm do próprio app (public/mediapipe +
 *  cópia do WASM no build). Nenhum quadro da câmera sai do aparelho.
 *  Este módulo (e a lib de ~140 KB) só carrega quando a câmera liga.
 * ============================================================ */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { clamp01, remap, type Rig } from './rig';

export interface FaceTracker {
  /** analisa um quadro (canvas reduzido); devolve true se achou um rosto e preencheu `out` */
  detect(src: HTMLCanvasElement, tsMs: number, out: Rig): boolean;
  close(): void;
  readonly delegate: 'GPU' | 'CPU';
}

const base = (): string => new URL('./mediapipe/', document.baseURI).href;

export async function createFaceTracker(): Promise<FaceTracker> {
  // só a variante SIMD vai no app (todo WebView moderno tem); sem SIMD → modo só microfone
  if (!(await FilesetResolver.isSimdSupported())) throw new Error('no-simd');
  const b = base();
  const fileset = { wasmLoaderPath: b + 'vision_wasm_internal.js', wasmBinaryPath: b + 'vision_wasm_internal.wasm' };
  let lm: FaceLandmarker | null = null;
  let delegate: 'GPU' | 'CPU' = 'GPU';
  for (const d of ['GPU', 'CPU'] as const) {
    try {
      lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: b + 'face_landmarker.task', delegate: d },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      delegate = d;
      break;
    } catch (e) {
      console.warn('[espelho] FaceLandmarker', d, e);
    }
  }
  if (!lm) throw new Error('model');
  const L = lm;
  const bs: Record<string, number> = {};
  let lastTs = 0;
  return {
    delegate,
    detect(src, tsMs, out) {
      const ts = Math.max(lastTs + 1, Math.round(tsMs));
      lastTs = ts;
      const r = L.detectForVideo(src, ts);
      const cats = r.faceBlendshapes?.[0]?.categories;
      if (!cats || !cats.length) return false;
      for (const c of cats) bs[c.categoryName] = c.score;
      const g = (k: string) => bs[k] ?? 0;
      // MediaPipe (como o ARKit) usa o lado do PRÓPRIO jogador: "Left" = olho esquerdo dele,
      // que no espelho aparece do lado esquerdo da tela. Por isso L→L.
      out.blinkL = remap(g('eyeBlinkLeft') + g('eyeSquintLeft') * 0.15, 0.32, 0.72);
      out.blinkR = remap(g('eyeBlinkRight') + g('eyeSquintRight') * 0.15, 0.32, 0.72);
      out.browInner = clamp01(g('browInnerUp') * 1.4);
      out.browL = clamp01(g('browOuterUpLeft') * 1.6) - clamp01(g('browDownLeft') * 1.6);
      out.browR = clamp01(g('browOuterUpRight') * 1.6) - clamp01(g('browDownRight') * 1.6);
      out.jaw = remap(g('jawOpen'), 0.04, 0.6);
      out.smileL = remap(g('mouthSmileLeft'), 0.08, 0.7);
      out.smileR = remap(g('mouthSmileRight'), 0.08, 0.7);
      out.frown = remap((g('mouthFrownLeft') + g('mouthFrownRight')) / 2, 0.05, 0.5);
      out.round = remap(Math.max(g('mouthPucker'), g('mouthFunnel') * 1.2), 0.15, 0.75);
      out.wide = remap((g('mouthStretchLeft') + g('mouthStretchRight')) / 2 + g('mouthUpperUpLeft') * 0.2, 0.05, 0.45);
      out.cheek = remap((g('cheekSquintLeft') + g('cheekSquintRight')) / 2 + g('cheekPuff') * 0.6, 0.1, 0.6);
      // olhar: "Out" do olho esquerdo = olhar para a esquerda do jogador (esquerda da tela no espelho)
      const lx = (g('eyeLookOutLeft') - g('eyeLookInLeft') + g('eyeLookInRight') - g('eyeLookOutRight')) / 2;
      const ly = (g('eyeLookDownLeft') + g('eyeLookDownRight') - g('eyeLookUpLeft') - g('eyeLookUpRight')) / 2;
      out.lookX = Math.max(-1, Math.min(1, -lx * 1.8));
      out.lookY = Math.max(-1, Math.min(1, ly * 1.8));
      const m = r.facialTransformationMatrixes?.[0]?.data;
      if (m && m.length >= 16) {
        // matriz coluna-maior (como Matrix4.fromArray do three.js); Euler YXZ.
        // A imagem da câmera NÃO é espelhada → inverte virar/deitar para o espelho.
        const yaw = Math.atan2(m[8], m[10]);
        const pitch = Math.asin(Math.max(-1, Math.min(1, -m[9])));
        const roll = Math.atan2(m[1], m[5]);
        out.yaw = -yaw;
        out.pitch = pitch;
        out.roll = -roll;
      }
      return true;
    },
    close() {
      try {
        L.close();
      } catch {
        /* */
      }
    },
  };
}
