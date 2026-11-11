/* ============================================================
 *  TESTE DO APARELHO — roda na 1ª abertura, quando a versão do app muda
 *  (instalou/atualizou), quando o aparelho muda, e pelo Ajustes
 *  ("Testar meu aparelho de novo").
 *
 *  nível = min(teto, teste 3D, teste 2D + 1)
 *    teto  = min(hardwareCap(), tabela de GPU, RAM/low-RAM/SDK do nativo)
 *    3D    = src/core/gpubench.ts (cena de grama + árvores + sombras)
 *    2D    = canvasBenchmark() (os jogos 2D desenham em canvas)
 *  O QualityGovernor começa nesse nível e usa o teto como máximo do automático.
 *
 *  Nunca trava: prazo duro, e se a GPU derrubar o app no meio do teste, na próxima
 *  abertura a marca "em andamento" faz pular o teste 3D (método 'safe').
 * ============================================================ */
import { classifyGpu, collectProfile, deviceName, gpuShort, ramCap, type DeviceProfile } from './device';
import type { GpuBenchResult } from './gpubench';
import { canvasBenchmark, clampTier, hardwareCap, storeDetection, tierFromScore, type DetectCache, type Tier } from './quality';

const RUNNING_KEY = 'bo-bench-running';

export interface DeviceCheckResult extends DetectCache {
  profile: DeviceProfile | null;
  bench: GpuBenchResult | null;
  canvasTier: Tier;
}

export interface DeviceCheckOptions {
  onProgress?: (f: number) => void;
  /** prazo do teste 3D (ms) */
  budgetMs?: number;
}

function ls(k: string, v?: string | null): string | null {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* */
  }
  return null;
}

const timeout = <T>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

let last: DeviceCheckResult | null = null;
/** último resultado completo nesta sessão (debug / Ajustes) */
export const lastDeviceCheck = (): DeviceCheckResult | null => last;

/** Ajustes > "Testar meu aparelho de novo": tenta o teste 3D mesmo se o último caiu. */
export function clearCrashMark(): void {
  ls(RUNNING_KEY, null);
}

export async function runDeviceCheck(o: DeviceCheckOptions = {}): Promise<DeviceCheckResult> {
  const budget = o.budgetMs ?? 2400;
  const prog = (f: number) => {
    try {
      o.onProgress?.(f);
    } catch {
      /* */
    }
  };
  const t0 = performance.now();
  let profile: DeviceProfile | null = null;
  let bench: GpuBenchResult | null = null;
  let method: DetectCache['method'] = 'canvas';
  try {
    prog(0.02);
    profile = await Promise.race([collectProfile(), timeout<DeviceProfile | null>(1500, null)]);
    prog(0.1);
    const gpuCls = classifyGpu(profile?.gpu ?? '');
    const cap = Math.min(hardwareCap(), gpuCls.cap, profile ? ramCap(profile) : 3) as Tier;

    // a última tentativa não terminou (o app caiu no meio do teste 3D?): pula o 3D
    const crashed = ls(RUNNING_KEY) === __APP_VERSION__;
    const canGpu = !!profile?.webgl2 && cap > 0 && !crashed;
    if (crashed) method = 'safe';
    // teste 2D curto ANTES do 3D (depois do WebGL o canvas mede pior: GPU ainda ocupada) (os jogos 2D e os menus desenham em canvas)
    const score = cap === 0 ? -1 : canvasBenchmark(200);
    const canvasTier = cap === 0 ? 0 : tierFromScore(score);
    prog(0.16);
    if (canGpu) {
      ls(RUNNING_KEY, __APP_VERSION__);
      const { runGpuBenchmark } = await import('./gpubench');
      bench = await Promise.race([
        runGpuBenchmark({ budgetMs: budget, onProgress: (f) => prog(0.16 + f * 0.8) }),
        timeout<GpuBenchResult>(budget + 1500, { ok: false, tier: 0, score: 0, levels: [], ms: budget + 1500, err: 'timeout' }),
      ]);
      ls(RUNNING_KEY, null);
      if (bench.ok) method = 'gpu';
    }
    let tier: Tier;
    if (bench?.ok) tier = Math.min(cap, bench.tier, canvasTier + 1) as Tier;
    else tier = Math.min(cap, canvasTier) as Tier;
    tier = clampTier(tier);
    const saved = storeDetection({
      tier,
      cap: clampTier(Math.max(tier, cap)),
      score: Math.round(score * 10) / 10,
      method,
      gpuScore: bench?.ok ? bench.score : undefined,
      dev: profile ? deviceName(profile).slice(0, 60) : undefined,
      gpu: gpuShort(profile?.gpu ?? '') || undefined,
      ms: Math.round(performance.now() - t0),
    });
    prog(1);
    last = { ...saved, profile, bench, canvasTier };
  } catch (e) {
    // qualquer erro: o caminho antigo (hardware + canvas), que também grava o cache
    console.warn('[devicecheck]', e);
    ls(RUNNING_KEY, null);
    const { detectInitialTier, lastDetection } = await import('./quality');
    const tier = detectInitialTier({ force: true });
    const c = lastDetection();
    const saved = storeDetection({ ...(c ?? {}), tier, cap: c?.cap ?? tier, method: 'canvas', dev: profile ? deviceName(profile) : undefined });
    last = { ...saved, profile, bench, canvasTier: tier };
  }
  if (typeof window !== 'undefined' && location.search.includes('debug')) (window as unknown as { __bloopGfx: unknown }).__bloopGfx = last;
  return last;
}
