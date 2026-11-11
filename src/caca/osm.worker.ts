/** CAÇA BLOOP — Web Worker: decodifica o MVT e monta o tile (osmdata.buildTile) fora da thread da tela. */
import { buildTile } from './osmdata';

interface Req {
  id: number;
  buf: ArrayBuffer;
  tx: number;
  ty: number;
  mpp: number;
}
const ctx = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage: (m: unknown) => void };
ctx.onmessage = (e) => {
  const { id, buf, tx, ty, mpp } = e.data;
  try {
    const tile = buildTile(buf, tx, ty, { mpp });
    ctx.postMessage({ id, tile });
  } catch (err) {
    ctx.postMessage({ id, error: String(err) });
  }
};
