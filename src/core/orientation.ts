/**
 * Orientação da tela. O app é retrato, mas a casa 3D pede paisagem.
 * No Android o manifest deixa a Activity livre ("fullUser") e o JS trava em
 * retrato na abertura via @capacitor/screen-orientation (a API web
 * screen.orientation.lock não funciona dentro da WebView sem tela cheia).
 */
import { isNative } from './platform';

type Lock = 'portrait' | 'landscape';

async function plugin() {
  return (await import('@capacitor/screen-orientation')).ScreenOrientation;
}

export async function lockOrientation(o: Lock): Promise<void> {
  try {
    if (isNative) return await (await plugin()).lock({ orientation: o });
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
