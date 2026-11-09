/**
 * Ponte leve para o 2D: NÃO importa three/cannon. O chunk 3D só é baixado
 * quando open3DLazy() é chamado.
 *   import { open3DLazy } from '../home3d/lazy';
 *   open3DLazy({ design, mess, ownerId, editable: true, onChange: (d, m) => {...} });
 */
import type { Close3DResult, Open3DOpts } from './types';

export type { Close3DResult, Open3DOpts } from './types';

export async function open3DLazy(opts: Open3DOpts): Promise<Close3DResult> {
  const m = await import('./index');
  return m.open3D(opts);
}
/** pré-carrega o chunk (ex.: ao abrir a tela da casa) */
export function preload3D(): void {
  void import('./index');
}
