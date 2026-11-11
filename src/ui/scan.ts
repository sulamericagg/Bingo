/* ============================================================
 *  ESCANEAR / QR — módulo compartilhado.
 *   - openScanner(): abre a câmera traseira e lê um QR (BarcodeDetector nativo quando existe;
 *     senão jsQR). Tudo acontece no aparelho: nenhuma imagem é enviada. A câmera desliga ao sair.
 *   - parseBloopLink(texto): entende os links do Bloop World (?voo= ?grupo= ?amigo= ?garimpo= ?cava= ?duelo= e bloopworld://…)
 *   - bloopLink(tipo, código): monta o link que o app entende
 *   - drawBloopQr(canvas, texto): QR no estilo Bloop (módulos arredondados coloridos, correção H,
 *     logo do Bloop no meio)
 * ============================================================ */
import { t } from '../i18n';
import { ONLINE } from '../config';
import { isNative } from '../core/platform';
import { icon } from './icons';

export type BloopLinkType = 'voo' | 'grupo' | 'amigo' | 'garimpo' | 'cava' | 'duelo';
export interface BloopLink {
  type: BloopLinkType;
  /** voo/garimpo/cava: código de 5 letras · grupo: "<id>.<código>" · amigo: @ sem o @ · duelo: "<jogo>/<CÓDIGO>" */
  code: string;
}

const VOO_RE = /^[A-HJ-NP-Z2-9]{5}$/;
const GRUPO_RE = /^[a-z0-9]{8,16}\.[a-z0-9]{4,12}$/;
const AMIGO_RE = /^[a-z0-9_.]{3,16}$/;
const DUELO_RE = /^([a-z]{2,12})[/.]([A-HJ-NP-Z2-9]{5})$/;

function valid(type: BloopLinkType, raw: string): BloopLink | null {
  const v = raw.trim();
  if (type === 'voo' || type === 'garimpo' || type === 'cava') {
    const c = v.toUpperCase();
    return VOO_RE.test(c) ? { type, code: c } : null;
  }
  if (type === 'grupo') return GRUPO_RE.test(v) ? { type, code: v } : null;
  if (type === 'duelo') {
    const m = DUELO_RE.exec(v.replace(/[^/.]+$/, (c) => c.toUpperCase()));
    return m ? { type, code: `${m[1]}/${m[2]}` } : null;
  }
  const h = v.replace(/^@+/, '').toLowerCase();
  return AMIGO_RE.test(h) ? { type, code: h } : null;
}

/** Entende os links/QRs do Bloop World. Também aceita um código de voo solto (5 letras) ou um "@nome". */
export function parseBloopLink(text: string): BloopLink | null {
  const s = (text ?? '').trim();
  if (!s) return null;
  if (VOO_RE.test(s.toUpperCase()) && s.length === 5) return { type: 'voo', code: s.toUpperCase() };
  if (/^@[a-z0-9_.]{3,16}$/i.test(s)) return valid('amigo', s);
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol === 'bloopworld:') {
    // bloopworld://voo/K7Q2M · bloopworld://grupo/<id>.<cod> · bloopworld://amigo/<@> · bloopworld://duelo/<jogo>/<CÓDIGO>
    const type = (u.host || u.pathname.replace(/^\/+/, '').split('/')[0]) as BloopLinkType;
    const rest = u.host ? u.pathname.replace(/^\/+/, '') : u.pathname.replace(/^\/+/, '').split('/').slice(1).join('/');
    if (type === 'voo' || type === 'grupo' || type === 'amigo' || type === 'garimpo' || type === 'cava' || type === 'duelo') return valid(type, decodeURIComponent(rest));
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  for (const type of ['voo', 'grupo', 'amigo', 'garimpo', 'cava', 'duelo'] as const) {
    const v = u.searchParams.get(type) ?? hash.get(type);
    if (v) return valid(type, v);
  }
  return null;
}

/** Link que abre o app/jogo direto no lugar certo (web: esta página; app: o endereço público). */
export function bloopLink(type: BloopLinkType, code: string): string {
  const base = isNative ? ONLINE.nativeApiBase : location.origin + location.pathname;
  return `${base.replace(/\/+$/, '')}/?${type}=${encodeURIComponent(code)}`;
}
/** variante do esquema do app (abre o app instalado) */
export const bloopAppLink = (type: BloopLinkType, code: string): string => `bloopworld://${type}/${type === 'duelo' ? code : encodeURIComponent(code)}`;

/* ============================== QR no estilo Bloop ============================== */

/** Desenha um QR com correção H, módulos redondos em degradê roxo→rosa e o Bloop no meio. */
export async function drawBloopQr(cv: HTMLCanvasElement, text: string, size = 240): Promise<void> {
  const QR = await import('qrcode');
  const qr = QR.create(text, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(size * dpr);
  cv.height = Math.round(size * dpr);
  cv.style.width = size + 'px';
  cv.style.height = size + 'px';
  const x = cv.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  const quiet = 2;
  const m = size / (n + quiet * 2);
  const o = quiet * m;
  // fundo branco arredondado (zona de silêncio)
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.roundRect(0, 0, size, size, size * 0.08);
  x.fill();
  const g = x.createLinearGradient(o, o, size - o, size - o);
  g.addColorStop(0, '#3a1590');
  g.addColorStop(0.55, '#6a1a8a');
  g.addColorStop(1, '#a0105e');
  const isFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // área do logo (limpa ~ 22% do lado; a correção H aguenta até 30%)
  const logo = Math.floor(n * 0.22) | 1;
  const l0 = Math.floor((n - logo) / 2);
  const inLogo = (r: number, c: number) => r >= l0 - 1 && r <= l0 + logo && c >= l0 - 1 && c <= l0 + logo;
  x.fillStyle = g;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      if (!data[r * n + c] || isFinder(r, c) || inLogo(r, c)) continue;
      x.beginPath();
      x.roundRect(o + c * m + m * 0.06, o + r * m + m * 0.06, m * 0.88, m * 0.88, m * 0.38);
      x.fill();
    }
  // olhos (localizadores): anel arredondado + miolo
  for (const [r, c] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]) {
    const X = o + c * m;
    const Y = o + r * m;
    x.fillStyle = g;
    x.beginPath();
    x.roundRect(X, Y, 7 * m, 7 * m, 2.2 * m);
    x.fill();
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.roundRect(X + m, Y + m, 5 * m, 5 * m, 1.6 * m);
    x.fill();
    x.fillStyle = '#ff3d9a';
    x.beginPath();
    x.roundRect(X + 2 * m, Y + 2 * m, 3 * m, 3 * m, 1.1 * m);
    x.fill();
  }
  // Bloop no meio
  const cx = size / 2;
  const cy = size / 2;
  const R = (logo * m) / 2;
  x.fillStyle = '#ffffff';
  x.beginPath();
  x.arc(cx, cy, R * 1.08, 0, Math.PI * 2);
  x.fill();
  const body = x.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R * 0.9);
  body.addColorStop(0, '#ffc7ee');
  body.addColorStop(0.6, '#ff5cc8');
  body.addColorStop(1, '#c9268a');
  x.fillStyle = body;
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = Math.max(1.5, R * 0.1);
  x.beginPath();
  x.arc(cx, cy + R * 0.04, R * 0.82, 0, Math.PI * 2);
  x.fill();
  x.stroke();
  x.fillStyle = '#2a0b5c';
  for (const s of [-1, 1]) {
    x.beginPath();
    x.ellipse(cx + s * R * 0.28, cy - R * 0.06, R * 0.1, R * 0.15, 0, 0, Math.PI * 2);
    x.fill();
  }
  x.lineWidth = Math.max(1.2, R * 0.08);
  x.beginPath();
  x.arc(cx, cy + R * 0.14, R * 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
  x.stroke();
  x.fillStyle = 'rgba(255,255,255,.55)';
  x.beginPath();
  x.ellipse(cx - R * 0.35, cy - R * 0.45, R * 0.18, R * 0.1, -0.5, 0, Math.PI * 2);
  x.fill();
}

/* ============================== leitor ============================== */

interface Detector {
  detect(src: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
async function nativeDetector(): Promise<Detector | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (!BD) return null;
  try {
    const f = (await BD.getSupportedFormats?.()) ?? ['qr_code'];
    if (!f.includes('qr_code')) return null;
    return new BD({ formats: ['qr_code'] });
  } catch {
    return null;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
.bq-scan{position:fixed;inset:0;z-index:100000;background:#120830;color:#fff;display:flex;flex-direction:column;font-family:var(--font,'Fredoka',system-ui,sans-serif);user-select:none;-webkit-user-select:none}
.bq-scan video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.bq-shade{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center}
.bq-win{width:min(68vw,68vh,300px);aspect-ratio:1;border-radius:28px;box-shadow:0 0 0 200vmax rgba(18,8,48,.62);position:relative}
.bq-win i{position:absolute;width:44px;height:44px;border:6px solid #ffd34a;border-radius:6px}
.bq-win i:nth-child(1){left:-4px;top:-4px;border-right:none;border-bottom:none;border-top-left-radius:24px}
.bq-win i:nth-child(2){right:-4px;top:-4px;border-left:none;border-bottom:none;border-top-right-radius:24px}
.bq-win i:nth-child(3){left:-4px;bottom:-4px;border-right:none;border-top:none;border-bottom-left-radius:24px}
.bq-win i:nth-child(4){right:-4px;bottom:-4px;border-left:none;border-top:none;border-bottom-right-radius:24px}
.bq-win b{position:absolute;left:8%;right:8%;height:3px;border-radius:2px;background:linear-gradient(90deg,transparent,#ff5cc8,transparent);animation:bqLine 1.6s ease-in-out infinite alternate}
@keyframes bqLine{from{top:10%}to{top:88%}}
.bq-win.ok{box-shadow:0 0 0 200vmax rgba(10,60,30,.6),0 0 0 6px #5ef08a inset}
.bq-top{position:relative;display:flex;align-items:center;gap:10px;padding:calc(var(--edge-t,10px) + 8px) calc(var(--edge-r,12px) + 6px) 0 calc(var(--edge-l,12px) + 6px)}
.bq-top b{font-size:20px;font-weight:900;text-shadow:0 2px 0 #2a0b5c}
.bq-x{margin-left:auto;width:46px;height:46px;border-radius:50%;border:3px solid #2a0b5c;background:linear-gradient(#ff9aae,#e0365a);box-shadow:0 4px 0 #2a0b5c;color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
.bq-foot{position:relative;margin-top:auto;padding:0 calc(var(--edge-r,12px) + 10px) calc(var(--edge-b,12px) + 16px) calc(var(--edge-l,12px) + 10px);text-align:center;display:flex;flex-direction:column;gap:6px;align-items:center}
.bq-hint{font-size:15px;font-weight:800;text-shadow:0 2px 0 #2a0b5c}
.bq-priv{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;opacity:.85;background:rgba(42,11,92,.7);border-radius:999px;padding:4px 12px}
.bq-err{font-size:14px;font-weight:800;background:rgba(194,29,60,.85);border-radius:14px;padding:8px 12px;max-width:340px}
`;
  document.head.appendChild(st);
}

/**
 * Abre a câmera traseira e devolve o texto do primeiro QR lido (ou null se fechou / sem câmera).
 * Com `accept`, só fecha quando o texto passa no filtro (ex.: só links do Bloop).
 */
export function openScanner(o: { title?: string; hint?: string; accept?: (text: string) => boolean } = {}): Promise<string | null> {
  css();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'bq-scan';
    el.setAttribute('role', 'dialog');
    el.innerHTML = `<video playsinline muted autoplay></video>
      <div class="bq-shade"><div class="bq-win"><i></i><i></i><i></i><i></i><b></b></div></div>
      <div class="bq-top">${icon('camera', { size: 30 })}<b>${esc(o.title ?? t('scan.title', 'Escanear'))}</b><button class="bq-x" aria-label="${esc(t('scan.close', 'Fechar'))}">${icon('close', { size: 24 })}</button></div>
      <div class="bq-foot"><div class="bq-hint">${esc(o.hint ?? t('scan.hint', 'Aponte para o QR do amigo'))}</div><div class="bq-priv">${icon('shield', { size: 16 })}${esc(t('scan.privacy', 'A câmera só lê o código aqui no aparelho. Nada é gravado nem enviado.'))}</div></div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video') as HTMLVideoElement;
    const win = el.querySelector('.bq-win') as HTMLElement;
    let stream: MediaStream | null = null;
    let done = false;
    let timer = 0;
    const finish = (v: string | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((tr) => tr.stop()); // desliga a câmera
      stream = null;
      video.srcObject = null;
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), v ? 260 : 0);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && finish(null);
    document.addEventListener('keydown', onKey);
    el.querySelector('.bq-x')!.addEventListener('click', () => finish(null));
    const fail = (msg: string) => {
      const f = el.querySelector('.bq-foot')!;
      f.insertAdjacentHTML('afterbegin', `<div class="bq-err">${esc(msg)}</div>`);
    };
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return fail(t('scan.noCam', 'Este aparelho não deixa usar a câmera aqui.'));
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        const denied = (e as Error)?.name === 'NotAllowedError';
        return fail(denied ? t('scan.denied', 'Sem permissão para a câmera. Libere nas configurações do aparelho.') : t('scan.noCam', 'Este aparelho não deixa usar a câmera aqui.'));
      }
      if (done) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* autoplay mudo sempre pode */
      }
      const det = await nativeDetector();
      const jsqr = det ? null : (await import('jsqr')).default;
      const cv = document.createElement('canvas');
      const cx = cv.getContext('2d', { willReadFrequently: true })!;
      const tick = async () => {
        if (done) return;
        let text: string | null = null;
        try {
          if (video.readyState >= 2 && video.videoWidth) {
            if (det) {
              const r = await det.detect(video);
              text = r[0]?.rawValue ?? null;
            } else if (jsqr) {
              // recorta o quadrado do meio e reduz (rápido em celular fraco)
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const side = Math.min(vw, vh);
              const S = Math.min(640, side);
              cv.width = cv.height = S;
              cx.drawImage(video, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, S, S);
              const img = cx.getImageData(0, 0, S, S);
              text = jsqr(img.data, S, S, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
          }
        } catch {
          /* quadro ruim: tenta o próximo */
        }
        if (done) return;
        if (text && (!o.accept || o.accept(text))) {
          win.classList.add('ok');
          try {
            navigator.vibrate?.(40);
          } catch {
            /* */
          }
          return finish(text);
        }
        timer = window.setTimeout(() => void tick(), 120);
      };
      void tick();
    })();
  });
}

/** Lê um QR e devolve só links do Bloop (do tipo pedido, se houver). */
export async function scanBloopLink(o: { types?: BloopLinkType[]; title?: string; hint?: string } = {}): Promise<BloopLink | null> {
  const ok = (s: string) => {
    const l = parseBloopLink(s);
    return !!l && (!o.types || o.types.includes(l.type));
  };
  const txt = await openScanner({ title: o.title, hint: o.hint, accept: ok });
  return txt ? parseBloopLink(txt) : null;
}
