/* ============================================================
 *  BLOOP CINEMA — exportar vídeo e GIF, salvar/compartilhar.
 *  Vídeo: canvas.captureStream + áudio do mixer (MediaStream
 *  Destination) → MediaRecorder em tempo real. MP4 se o aparelho
 *  suportar gravar MP4; senão WebM. 720p (480p em aparelho fraco).
 *  GIF: quadros renderizados fora do tempo real (o motor é
 *  determinístico), 320×180, ~8 qps, até 6 s, sem som.
 *  Nada é enviado: o arquivo sai pelo menu de compartilhar do
 *  sistema (Android) ou download (web).
 * ============================================================ */
import { shareOrSave } from '../mirror/media';
import { isNative } from '../core/platform';
import type { Mixer, Playback } from './audio';
import type { Renderer } from './engine';

export interface ExportOpts {
  W: number;
  H: number;
  fps: number;
  watermark: boolean;
  budget: number;
  onProgress?: (k: number) => void;
  /** frame para a pré-visualização (mostra o que está sendo gravado) */
  onFrame?: (cv: HTMLCanvasElement) => void;
}
export interface ExportResult {
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  dur: number;
}

export function pickMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const c: [string, 'mp4' | 'webm'][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4;codecs=avc1,mp4a', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [m, e] of c) if (MediaRecorder.isTypeSupported?.(m)) return { mime: m, ext: e };
  return null;
}

export function canExportVideo(): boolean {
  return !!pickMime() && typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype;
}

/**
 * Grava o filme inteiro em tempo real. `cancel()` do controle interrompe.
 */
export function exportVideo(r: Renderer, m: Mixer, pb: Playback, o: ExportOpts): { done: Promise<ExportResult | null>; cancel: () => void } {
  let cancelled = false;
  let raf = 0;
  const cv = document.createElement('canvas');
  cv.width = o.W;
  cv.height = o.H;
  const ctx = cv.getContext('2d', { alpha: false })!;
  const dur = r.duration();
  const done = (async (): Promise<ExportResult | null> => {
    const pm = pickMime();
    if (!pm) return null;
    // 1º quadro antes de abrir o stream (evita quadro preto no início)
    r.draw(ctx, o.W, o.H, 0, { watermark: o.watermark, budget: o.budget });
    const vs = (cv as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(o.fps);
    const as = m.recordStream();
    const tracks = [...vs.getVideoTracks(), ...as.getAudioTracks()];
    const stream = new MediaStream(tracks);
    const bps = o.H >= 700 ? 3_000_000 : 1_400_000;
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: pm.mime, videoBitsPerSecond: bps, audioBitsPerSecond: 128000 });
    } catch {
      rec = new MediaRecorder(stream);
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));
    rec.start(500);
    await pb.start(r.p, 0, dur);
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const frame = () => {
        if (cancelled) return res();
        const T = Math.max(0, pb.time());
        r.draw(ctx, o.W, o.H, Math.min(T, dur - 0.001), { watermark: o.watermark, budget: o.budget });
        o.onProgress?.(Math.min(1, T / dur));
        o.onFrame?.(cv);
        // segurança: se o áudio travar (aba escondida), usa o relógio da página
        const wall = (performance.now() - t0) / 1000;
        if (T >= dur + 0.25 || wall > dur + 6) return res();
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    });
    pb.stop();
    try {
      rec.requestData();
    } catch {
      /* */
    }
    rec.stop();
    await stopped;
    m.stopRecordStream();
    vs.getTracks().forEach((t) => t.stop());
    if (cancelled || !chunks.length) return null;
    const blob = new Blob(chunks, { type: (rec.mimeType || pm.mime).split(';')[0] });
    return { blob, mime: blob.type, ext: blob.type.includes('mp4') ? 'mp4' : 'webm', dur };
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    },
  };
}

/** Duração real do vídeo gerado (WebM do MediaRecorder costuma vir sem duração). */
export function probeDuration(blob: Blob): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    const url = URL.createObjectURL(blob);
    const fin = (d: number) => {
      URL.revokeObjectURL(url);
      res(d);
    };
    const tm = setTimeout(() => fin(0), 8000);
    v.onloadedmetadata = () => {
      if (isFinite(v.duration) && v.duration > 0) {
        clearTimeout(tm);
        return fin(v.duration);
      }
      v.ontimeupdate = () => {
        v.ontimeupdate = null;
        clearTimeout(tm);
        fin(isFinite(v.duration) ? v.duration : 0);
      };
      v.currentTime = 1e7;
    };
    v.onerror = () => {
      clearTimeout(tm);
      fin(0);
    };
    v.src = url;
  });
}

/* ============================================================
 *  GIF (prévia curta, sem som)
 * ============================================================ */
export async function exportGif(r: Renderer, o: { W: number; H: number; fps: number; maxSec: number; watermark: boolean }): Promise<Blob> {
  const cv = document.createElement('canvas');
  cv.width = o.W;
  cv.height = o.H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  const dur = Math.min(o.maxSec, r.duration());
  const n = Math.max(1, Math.floor(dur * o.fps));
  const frames: Uint8Array[] = [];
  for (let i = 0; i < n; i++) {
    r.draw(ctx, o.W, o.H, i / o.fps, { watermark: o.watermark, budget: 0.5, noBubbles: false });
    frames.push(quantize(ctx.getImageData(0, 0, o.W, o.H).data));
    if (i % 4 === 3) await new Promise((res) => setTimeout(res, 0));
  }
  return new Blob([encodeGif(o.W, o.H, frames, Math.round(100 / o.fps))], { type: 'image/gif' });
}

/** Paleta fixa 6×7×6 (252 cores) — rápido e sem dependências. */
function quantize(d: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    const r = Math.min(5, Math.round((d[i] / 255) * 5));
    const g = Math.min(6, Math.round((d[i + 1] / 255) * 6));
    const b = Math.min(5, Math.round((d[i + 2] / 255) * 5));
    out[j] = r * 42 + g * 6 + b;
  }
  return out;
}
function palette(): Uint8Array {
  const p = new Uint8Array(256 * 3);
  for (let r = 0; r < 6; r++)
    for (let g = 0; g < 7; g++)
      for (let b = 0; b < 6; b++) {
        const i = (r * 42 + g * 6 + b) * 3;
        p[i] = Math.round((r / 5) * 255);
        p[i + 1] = Math.round((g / 6) * 255);
        p[i + 2] = Math.round((b / 5) * 255);
      }
  return p;
}

function encodeGif(W: number, H: number, frames: Uint8Array[], delayCs: number): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  const w16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  const str = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  str('GIF89a');
  w16(W);
  w16(H);
  out.push(0xf7, 0, 0); // paleta global 256
  const pal = palette();
  for (let i = 0; i < pal.length; i++) out.push(pal[i]);
  // loop infinito
  out.push(0x21, 0xff, 0x0b);
  str('NETSCAPE2.0');
  out.push(3, 1, 0, 0, 0);
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0);
    w16(delayCs);
    out.push(0, 0);
    out.push(0x2c);
    w16(0);
    w16(0);
    w16(W);
    w16(H);
    out.push(0);
    lzw(f, 8, out);
  }
  out.push(0x3b);
  return new Uint8Array(out);
}

function lzw(px: Uint8Array, minCode: number, out: number[]): void {
  out.push(minCode);
  const clear = 1 << minCode;
  const eoi = clear + 1;
  let size = minCode + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();
  let buf = 0;
  let bits = 0;
  const block: number[] = [];
  const emit = (code: number) => {
    buf |= code << bits;
    bits += size;
    while (bits >= 8) {
      block.push(buf & 255);
      buf >>>= 8;
      bits -= 8;
      if (block.length === 255) {
        out.push(255, ...block);
        block.length = 0;
      }
    }
  };
  emit(clear);
  let prefix = px[0];
  for (let i = 1; i < px.length; i++) {
    const k = px[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      emit(clear);
      dict.clear();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (bits > 0) block.push(buf & 255);
  if (block.length) out.push(block.length, ...block);
  out.push(0);
}

/* ============================================================
 *  SALVAR / COMPARTILHAR
 * ============================================================ */
export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'filme';
  return `bloop-${base}.${ext}`;
}

/** Baixa o arquivo (web) — ou, no app, cai no compartilhar. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Compartilha pelo menu do sistema — mesmo caminho do Bloop Espelho (src/mirror/media.ts):
 * no Android grava o arquivo no cache (Filesystem, em pedaços) e abre o Share; na web, Web Share
 * com arquivo ou download. Os temporários são apagados por cleanupShared() (ao abrir/sair do Cinema).
 */
export async function shareFile(blob: Blob): Promise<'shared' | 'downloaded' | 'cancel' | 'error'> {
  return shareOrSave(blob);
}

/** "Salvar no aparelho": no app não existe download — o menu do sistema tem "Salvar"/Arquivos/Galeria. */
export async function saveFile(blob: Blob, name: string): Promise<'shared' | 'downloaded' | 'cancel' | 'error'> {
  if (isNative) return shareOrSave(blob);
  download(blob, name);
  return 'downloaded';
}
