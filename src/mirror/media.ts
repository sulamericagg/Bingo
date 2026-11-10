/* ============================================================
 *  BLOOP ESPELHO — gravar vídeo curto, foto e salvar/compartilhar.
 *  Nada sai do aparelho sozinho: o arquivo só existe na memória até o
 *  jogador tocar em Salvar/Compartilhar (no Android vai para o cache do
 *  app só para o menu de compartilhar ler, e é apagado ao sair).
 * ============================================================ */
import { Share } from '@capacitor/share';
import { isNative } from '../core/platform';
import { t } from '../i18n';

export const MAX_REC_MS = 30_000;

/** Formato aceito pelo WebView: mp4 primeiro (abre em todo app), senão webm. */
export function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const c = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  for (const m of c) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* */
    }
  }
  return '';
}

export const canRecord = (): boolean => typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && !!pickMime();

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private timer = 0;
  private vstream: MediaStream | null = null;
  startedAt = 0;
  mime = '';

  get active(): boolean {
    return !!this.rec && this.rec.state === 'recording';
  }

  start(canvas: HTMLCanvasElement, audio: MediaStreamTrack | null, onDone: (b: Blob | null) => void): boolean {
    if (this.rec) return false;
    this.mime = pickMime();
    if (!this.mime) return false;
    try {
      this.vstream = canvas.captureStream(30);
      const tracks = [...this.vstream.getVideoTracks()];
      if (audio) tracks.push(audio);
      const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: this.mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
      this.chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };
      rec.onstop = () => {
        clearTimeout(this.timer);
        this.vstream?.getTracks().forEach((tr) => tr.stop());
        this.vstream = null;
        const blob = this.chunks.length ? new Blob(this.chunks, { type: this.mime.split(';')[0] }) : null;
        this.chunks = [];
        this.rec = null;
        onDone(blob);
      };
      rec.start(1000);
      this.rec = rec;
      this.startedAt = performance.now();
      this.timer = window.setTimeout(() => this.stop(), MAX_REC_MS);
      return true;
    } catch (e) {
      console.warn('[espelho] gravação', e);
      this.vstream?.getTracks().forEach((tr) => tr.stop());
      this.vstream = null;
      this.rec = null;
      return false;
    }
  }

  stop(): void {
    clearTimeout(this.timer);
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
  }
}

export const extOf = (b: Blob): string =>
  b.type.includes('mp4') ? 'mp4' : b.type.includes('webm') ? 'webm' : b.type.includes('png') ? 'png' : b.type.includes('gif') ? 'gif' : b.type.includes('jpeg') ? 'jpg' : b.type.includes('json') ? 'json' : 'bin';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < buf.length; i += step) s += String.fromCharCode.apply(null, buf.subarray(i, i + step) as unknown as number[]);
  return btoa(s);
}

const DIR = 'espelho';

/** Apaga os arquivos temporários do compartilhamento (chamado ao abrir e ao sair). */
export async function cleanupShared(): Promise<void> {
  if (!isNative) return;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.rmdir({ path: DIR, directory: Directory.Cache, recursive: true });
  } catch {
    /* não existia */
  }
}

export type ShareResult = 'shared' | 'downloaded' | 'cancel' | 'error';

/** Compartilha (Android: menu do sistema — salvar na galeria, WhatsApp...) ou baixa (web). */
export async function shareOrSave(blob: Blob): Promise<ShareResult> {
  const name = `bloop-world-${stamp()}.${extOf(blob)}`;
  if (isNative) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const path = `${DIR}/${name}`;
      // em pedaços (múltiplos de 3 bytes → base64 concatenável) para vídeos grandes não travarem a ponte
      const CH = 3 * 512 * 1024;
      for (let i = 0; i < blob.size; i += CH) {
        const data = await blobToBase64(blob.slice(i, i + CH));
        if (i === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
        else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
      }
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: 'Bloop World', files: [uri], dialogTitle: t('mirror.shareTitle', 'Salvar ou enviar') });
      return 'shared';
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).toLowerCase();
      return msg.includes('cancel') ? 'cancel' : 'error';
    }
  }
  try {
    const file = new File([blob], name, { type: blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      await nav.share({ files: [file], title: 'Bloop World' });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancel';
  }
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'downloaded';
}
