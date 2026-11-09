/**
 * Relatórios do Programa Beta → POST /api/feedback (server/feedback.ts → painel admin "Beta / Bugs").
 * Fila offline em localStorage: o relatório nunca se perde; é enviado quando a internet voltar.
 */
import { Capacitor } from '@capacitor/core';
import { bus } from '../core/events';
import { apiBase } from './leaderboard';
import { getPlayer } from './online';
import { recentErrors, type ErrEntry } from './errors';

const KEY = 'bw-feedback-queue';
const MAX_QUEUE = 10;

export type FeedbackCategory = 'physics' | 'crash' | 'visual' | 'sound' | 'shop' | 'other';
export const CATEGORIES: FeedbackCategory[] = ['physics', 'crash', 'visual', 'sound', 'shop', 'other'];

export interface FeedbackContext {
  version: string;
  platform: string;
  ua: string;
  screen: string;
  viewport: string;
  dpr: number;
  lang: string;
  tier: number | null;
  where: string;
  online: boolean;
  mem?: number;
  cores?: number;
}

export interface FeedbackReport {
  id: string;
  pid: string;
  name: string;
  handle: string;
  category: FeedbackCategory;
  text: string;
  ctx: FeedbackContext;
  errors: ErrEntry[];
  /** data:image/jpeg;base64,... (≤ ~200 KB) */
  shot?: string;
  t: number;
}

let tierFn: () => number | null = () => null;
let whereFn: () => string = () => '';
/** main.ts registra como ler a qualidade e a tela atual. */
export function setFeedbackProbes(tier: () => number | null, where: () => string): void {
  tierFn = tier;
  whereFn = where;
}

export function collectContext(): FeedbackContext {
  const n = navigator as Navigator & { deviceMemory?: number };
  return {
    version: __APP_VERSION__,
    platform: Capacitor.getPlatform(),
    ua: n.userAgent.slice(0, 300),
    screen: `${screen.width}x${screen.height}`,
    viewport: `${innerWidth}x${innerHeight}`,
    dpr: Math.round(devicePixelRatio * 100) / 100,
    lang: document.documentElement.lang || n.language,
    tier: safe(tierFn, null),
    where: safe(whereFn, '').slice(0, 80),
    online: n.onLine !== false,
    ...(n.deviceMemory ? { mem: n.deviceMemory } : {}),
    ...(n.hardwareConcurrency ? { cores: n.hardwareConcurrency } : {}),
  };
}

function safe<T>(fn: () => T, d: T): T {
  try {
    return fn() ?? d;
  } catch {
    return d;
  }
}

/**
 * "Foto" do jogo: o maior canvas visível, reduzido para caber em ~200 KB (JPEG).
 * Canvas WebGL sem preserveDrawingBuffer pode sair preto — é só um extra.
 */
export function captureScreenshot(maxBytes = 200_000): string | undefined {
  try {
    const cvs = [...document.querySelectorAll('canvas')].filter((c) => c.width > 32 && c.height > 32 && c.offsetParent !== null);
    if (!cvs.length) return undefined;
    const src = cvs.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    for (const [w, q] of [
      [480, 0.6],
      [360, 0.5],
      [260, 0.45],
    ] as const) {
      const s = Math.min(1, w / Math.max(src.width, src.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(src.width * s));
      c.height = Math.max(1, Math.round(src.height * s));
      const x = c.getContext('2d');
      if (!x) return undefined;
      x.fillStyle = '#0b0620';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(src, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= maxBytes) return url;
    }
  } catch {
    /* canvas "sujo" (cross-origin) ou sem memória */
  }
  return undefined;
}

function readQueue(): FeedbackReport[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeQueue(q: FeedbackReport[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // sem espaço: tira as fotos e tenta de novo
    try {
      localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX_QUEUE).map(({ shot: _s, ...r }) => r)));
    } catch {
      /* desiste */
    }
  }
}
export const queuedCount = (): number => readQueue().length;

export function buildReport(category: FeedbackCategory, text: string, withShot: boolean, handle: string): FeedbackReport {
  const p = getPlayer();
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    pid: p?.id ?? '',
    name: p?.name ?? '',
    handle,
    category,
    text: text.slice(0, 1000),
    ctx: collectContext(),
    errors: recentErrors(),
    ...(withShot ? { shot: captureScreenshot() } : {}),
    t: Date.now(),
  };
}

/** Coloca na fila e tenta enviar já. Retorna 'sent' ou 'queued'. */
export async function submitReport(r: FeedbackReport): Promise<'sent' | 'queued'> {
  const q = readQueue().filter((x) => x.id !== r.id);
  q.push(r);
  writeQueue(q);
  await flushFeedback();
  return readQueue().some((x) => x.id === r.id) ? 'queued' : 'sent';
}

let flushing = false;
/** Envia a fila (chamado ao abrir o app e quando a internet volta). */
export async function flushFeedback(): Promise<void> {
  if (flushing || navigator.onLine === false) return;
  flushing = true;
  try {
    for (const r of readQueue()) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 12000);
      let drop = false;
      try {
        const res = await fetch(`${apiBase()}/api/feedback`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(r),
          signal: ctrl.signal,
        });
        // 2xx = entregue; 4xx (menos 429) = nunca vai passar → descarta
        drop = res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
        if (!drop) break;
      } catch {
        break; // offline: tenta depois
      } finally {
        clearTimeout(timer);
      }
      if (drop) writeQueue(readQueue().filter((x) => x.id !== r.id));
    }
  } finally {
    flushing = false;
  }
}

export function initFeedbackSync(): void {
  window.addEventListener('online', () => void flushFeedback());
  bus.on('online', (ok: boolean) => ok && void flushFeedback());
  setTimeout(() => void flushFeedback(), 5000);
}
