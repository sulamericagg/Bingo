/**
 * CAÇA BLOOP — decodificador mínimo de Mapbox Vector Tiles (MVT 2.x, protobuf), sem dependências.
 * Só o necessário: camadas, propriedades e geometria (pontos, linhas, polígonos) em coordenadas do tile (0..extent).
 */

export type MvtValue = string | number | boolean;
export interface MvtFeature {
  /** 1 = ponto, 2 = linha, 3 = polígono */
  type: number;
  props: Record<string, MvtValue>;
  /** pontos: um anel por ponto; linhas: um por trecho; polígonos: anéis (externo = horário na tela, buracos anti-horário) */
  geom: number[][];
}
export interface MvtLayer {
  name: string;
  extent: number;
  features: MvtFeature[];
}

class Pbf {
  pos = 0;
  buf: Uint8Array;
  constructor(buf: Uint8Array) {
    this.buf = buf;
  }
  varint(): number {
    const b = this.buf;
    let r = 0;
    let s = 1;
    let c: number;
    do {
      c = b[this.pos++];
      r += (c & 0x7f) * s;
      s *= 128;
    } while (c >= 0x80 && this.pos < b.length);
    return r;
  }
  skip(wt: number): void {
    if (wt === 0) this.varint();
    else if (wt === 1) this.pos += 8;
    else if (wt === 2) this.pos += this.varint();
    else if (wt === 5) this.pos += 4;
    else throw new Error('mvt: wire type ' + wt);
  }
  str(): string {
    const n = this.varint();
    const s = dec.decode(this.buf.subarray(this.pos, this.pos + n));
    this.pos += n;
    return s;
  }
  packed(): number[] {
    const end = this.varint() + this.pos;
    const out: number[] = [];
    while (this.pos < end) out.push(this.varint());
    return out;
  }
}
const dec = new TextDecoder();
const zz = (n: number): number => (n % 2 === 1 ? -(n + 1) / 2 : n / 2);

function readValue(p: Pbf, end: number): MvtValue {
  let v: MvtValue = '';
  const dv = new DataView(p.buf.buffer, p.buf.byteOffset, p.buf.byteLength);
  while (p.pos < end) {
    const tag = p.varint();
    const f = tag >> 3;
    const wt = tag & 7;
    if (f === 1) v = p.str();
    else if (f === 2) (v = dv.getFloat32(p.pos, true)), (p.pos += 4);
    else if (f === 3) (v = dv.getFloat64(p.pos, true)), (p.pos += 8);
    else if (f === 4 || f === 5) v = p.varint();
    else if (f === 6) v = zz(p.varint());
    else if (f === 7) v = !!p.varint();
    else p.skip(wt);
  }
  return v;
}

function decodeGeom(cmds: number[]): number[][] {
  const out: number[][] = [];
  let cur: number[] | null = null;
  let x = 0;
  let y = 0;
  let i = 0;
  while (i < cmds.length) {
    const ci = cmds[i++];
    const id = ci & 7;
    const n = ci >> 3;
    if (id === 1 || id === 2) {
      for (let k = 0; k < n && i + 1 < cmds.length; k++) {
        x += zz(cmds[i++]);
        y += zz(cmds[i++]);
        if (id === 1) {
          cur = [];
          out.push(cur);
        }
        cur?.push(x, y);
      }
    } else if (id === 7) {
      if (cur && cur.length >= 2) cur.push(cur[0], cur[1]);
    } else break;
  }
  return out;
}

/** Decodifica as camadas pedidas (todas se `want` vazio). */
export function decodeMvt(data: ArrayBuffer | Uint8Array, want?: Set<string>): MvtLayer[] {
  const p = new Pbf(data instanceof Uint8Array ? data : new Uint8Array(data));
  const layers: MvtLayer[] = [];
  while (p.pos < p.buf.length) {
    const tag = p.varint();
    if (tag >> 3 !== 3 || (tag & 7) !== 2) {
      p.skip(tag & 7);
      continue;
    }
    const end = p.varint() + p.pos;
    const L = readLayer(p, end, want);
    if (L) layers.push(L);
    p.pos = end;
  }
  return layers;
}

function readLayer(p: Pbf, end: number, want?: Set<string>): MvtLayer | null {
  let name = '';
  let extent = 4096;
  const keys: string[] = [];
  const vals: MvtValue[] = [];
  const raw: { tags: number[]; type: number; geom: number[] }[] = [];
  while (p.pos < end) {
    const tag = p.varint();
    const f = tag >> 3;
    const wt = tag & 7;
    if (f === 1) {
      name = p.str();
      if (want && want.size && !want.has(name)) return null;
    } else if (f === 2) {
      const fe = p.varint() + p.pos;
      const ft = { tags: [] as number[], type: 0, geom: [] as number[] };
      while (p.pos < fe) {
        const t2 = p.varint();
        const f2 = t2 >> 3;
        if (f2 === 2) ft.tags = p.packed();
        else if (f2 === 3) ft.type = p.varint();
        else if (f2 === 4) ft.geom = p.packed();
        else p.skip(t2 & 7);
      }
      raw.push(ft);
    } else if (f === 3) keys.push(p.str());
    else if (f === 4) {
      const ve = p.varint() + p.pos;
      vals.push(readValue(p, ve));
      p.pos = ve;
    } else if (f === 5) extent = p.varint();
    else p.skip(wt);
  }
  const features: MvtFeature[] = raw.map((r) => {
    const props: Record<string, MvtValue> = {};
    for (let i = 0; i + 1 < r.tags.length; i += 2) props[keys[r.tags[i]]] = vals[r.tags[i + 1]];
    return { type: r.type, props, geom: decodeGeom(r.geom) };
  });
  return { name, extent, features };
}
