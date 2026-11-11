/* BLOCOS — Worker de malha: recebe MeshJob, devolve MeshResult (buffers transferidos). */
import { meshChunk, type MeshJob, type MeshResult } from './mesher';

interface Req {
  key: string;
  ver: number;
  job: MeshJob;
}
const ctx = self as unknown as { onmessage: ((e: MessageEvent<Req>) => void) | null; postMessage(m: unknown, t: Transferable[]): void };
ctx.onmessage = (e) => {
  const { key, ver, job } = e.data;
  const r: MeshResult = meshChunk(job);
  const tr: Transferable[] = [];
  for (const g of r.groups) if (g) tr.push(g.pos.buffer, g.nrm.buffer, g.col.buffer, g.uv.buffer, g.mat.buffer, g.idx.buffer);
  ctx.postMessage({ key, ver, r }, tr);
};
