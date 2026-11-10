/**
 * Orientação da tela. O app (menu e jogos 2D) é retrato; cenas 3D pedem paisagem.
 * No Android usa o plugin nativo do próprio app (BloopOrientation, MainActivity) que chama
 * setRequestedOrientation direto — paisagem = SENSOR_LANDSCAPE (qualquer lado deitado).
 * Se ele falhar, tenta o @capacitor/screen-orientation; na web, screen.orientation.lock.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

type Lock = 'portrait' | 'landscape' | 'any';

interface BloopOrientationPlugin {
  set(o: { mode: 'portrait' | 'landscape' | 'sensor' }): Promise<{ requested: number; current: string }>;
}
const Native = registerPlugin<BloopOrientationPlugin>('BloopOrientation');

async function plugin() {
  return (await import('@capacitor/screen-orientation')).ScreenOrientation;
}

export async function lockOrientation(o: Lock): Promise<void> {
  if (isNative) {
    try {
      await Native.set({ mode: o === 'any' ? 'sensor' : o });
      return;
    } catch (e) {
      console.warn('[orientation] nativo falhou, tentando plugin', e);
    }
    try {
      await (await plugin()).lock({ orientation: o });
    } catch (e) {
      console.warn('[orientation] plugin falhou', e);
    }
    return;
  }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (so?.lock) await so.lock(o).catch(() => undefined);
  } catch {
    /* sem suporte */
  }
}

/** Volta para o retrato padrão do app. */
export function restorePortrait(): void {
  void lockOrientation('portrait');
}
