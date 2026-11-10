/* ============================================================
 *  BLOOP ESPELHO — núcleo do rastreamento, usado no thread principal
 *  e no Web Worker (track-worker.ts): cria o FaceLandmarker e converte
 *  o resultado do MediaPipe em Rig.
 * ============================================================ */
import { FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { clamp01, remap, RIG_KEYS, type Rig } from './rig';

type G = typeof globalThis & { ModuleFactory?: unknown };

/**
 * Carrega o "loader" do WASM no escopo global. O MediaPipe usa importScripts (ou uma tag
 * <script>), que não existem num Worker de módulo — então buscamos o texto e avaliamos no
 * escopo global (eval indireto) e passamos wasmLoaderPath vazio para a lib pular essa etapa.
 */
async function loadFactory(b: string, text: { s: string | null }): Promise<void> {
  if ((globalThis as G).ModuleFactory) return;
  if (text.s === null) {
    const r = await fetch(b + 'vision_wasm_internal.js');
    if (!r.ok) throw new Error('loader ' + r.status);
    text.s = await r.text();
  }
  (0, eval)(text.s);
  if (!(globalThis as G).ModuleFactory) throw new Error('ModuleFactory');
}

export async function createLandmarker(b: string, simd: boolean, cpuOnly = false): Promise<{ lm: FaceLandmarker; delegate: 'GPU' | 'CPU' }> {
  // só a variante SIMD vai no app (todo WebView moderno tem); sem SIMD → modo só microfone
  if (!simd) throw new Error('no-simd');
  const text = { s: null as string | null };
  for (const d of cpuOnly ? (['CPU'] as const) : (['GPU', 'CPU'] as const)) {
    try {
      await loadFactory(b, text);
      const lm = await FaceLandmarker.createFromOptions(
        { wasmLoaderPath: '', wasmBinaryPath: b + 'vision_wasm_internal.wasm' },
        {
          baseOptions: { modelAssetPath: b + 'face_landmarker.task', delegate: d },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        },
      );
      return { lm, delegate: d };
    } catch (e) {
      console.warn('[espelho] FaceLandmarker', d, e);
    }
  }
  throw new Error('model');
}

const bs: Record<string, number> = {};
/** Resultado do MediaPipe → Rig (0..1 / rad). Devolve false se não achou rosto. */
export function mapResult(r: FaceLandmarkerResult, out: Rig): boolean {
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
    // matriz coluna-maior (como Matrix4.fromArray do three.js), câmera y-para-cima; Euler YXZ.
    // A imagem da câmera NÃO é espelhada: no espelho o "virar" troca de sinal; o "deitar"
    // troca de sinal no espelho e de novo ao passar para o canvas (y para baixo) → fica igual.
    // (conferido com vídeo falso girado: imagem girada no horário → Bloop gira no anti-horário)
    const yaw = Math.atan2(m[8], m[10]);
    const pitch = Math.asin(Math.max(-1, Math.min(1, -m[9])));
    const roll = Math.atan2(m[1], m[5]);
    out.yaw = -yaw;
    out.pitch = pitch;
    out.roll = roll;
  }
  return true;
}

/** Rig ↔ Float64Array (mensagens do worker sem objetos) */
export function rigToArr(r: Rig, a: Float64Array): Float64Array {
  for (let i = 0; i < RIG_KEYS.length; i++) a[i] = r[RIG_KEYS[i]];
  return a;
}
export function arrToRig(a: ArrayLike<number>, r: Rig): Rig {
  for (let i = 0; i < RIG_KEYS.length; i++) r[RIG_KEYS[i]] = a[i];
  return r;
}

