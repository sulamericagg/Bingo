/**
 * Buffer leve de erros + "error boundary" global.
 *
 *  - Guarda os últimos 30 erros (window.onerror, promessas rejeitadas, console.error) para
 *    anexar aos relatórios do Programa Beta.
 *  - Nunca deixa tela em branco: se o boot falhar, mostra uma tela amigável com "Tentar de novo".
 *  - Para beta testers, oferece "Algo deu errado — enviar relatório?" (no máx. 1x por minuto).
 *
 * Instalado no começo do main.ts (antes de qualquer outro módulo rodar código pesado).
 */
export interface ErrEntry {
  t: number;
  kind: 'error' | 'promise' | 'console';
  msg: string;
  src?: string;
}

const MAX = 30;
const buf: ErrEntry[] = [];
let installed = false;
let lastPrompt = 0;
let promptFn: ((e: ErrEntry) => void) | null = null;

const clip = (s: unknown, n = 400): string => {
  let v: string;
  if (s instanceof Error) v = `${s.name}: ${s.message}${s.stack ? '\n' + s.stack.split('\n').slice(1, 4).join('\n') : ''}`;
  else if (typeof s === 'string') v = s;
  else {
    try {
      v = JSON.stringify(s);
    } catch {
      v = String(s);
    }
  }
  return (v ?? '').slice(0, n);
};

export function pushError(kind: ErrEntry['kind'], msg: unknown, src?: string): ErrEntry {
  const e: ErrEntry = { t: Date.now(), kind, msg: clip(msg), ...(src ? { src: src.slice(0, 160) } : {}) };
  // repetição seguida do mesmo erro (loop de render) conta só uma vez
  const last = buf[buf.length - 1];
  if (last && last.msg === e.msg && e.t - last.t < 2000) return last;
  buf.push(e);
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  return e;
}

/** Cópia dos últimos erros (mais antigos primeiro). */
export const recentErrors = (): ErrEntry[] => buf.slice();

/** O Programa Beta registra aqui como oferecer o relatório (só para quem entrou no beta). */
export function setErrorPrompt(fn: ((e: ErrEntry) => void) | null): void {
  promptFn = fn;
}

function offer(e: ErrEntry): void {
  if (!promptFn || Date.now() - lastPrompt < 60_000) return;
  lastPrompt = Date.now();
  try {
    promptFn(e);
  } catch {
    /* nunca piora a situação */
  }
}

export function installErrorBoundary(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('error', (ev) => {
    // erro de carregamento de recurso (img/script) não tem .error
    const msg = ev.error ?? ev.message ?? 'erro';
    const e = pushError('error', msg, ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : undefined);
    offer(e);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    const r = ev.reason;
    // abortos de fetch/timeout são esperados (offline) — guardam, mas não incomodam
    const quiet = r && (r.name === 'AbortError' || /Failed to fetch|NetworkError|HTTP \d+|Load failed/i.test(String(r.message ?? r)));
    const e = pushError('promise', r ?? 'promessa rejeitada');
    if (!quiet) offer(e);
  });
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      pushError('console', args.map((a) => clip(a, 200)).join(' '));
    } catch {
      /* */
    }
    orig(...args);
  };
}

/**
 * Tela de segurança: usada quando o boot falha. Texto fixo em pt + en (o i18n pode
 * ter sido justamente o que quebrou).
 */
export function showFatal(err: unknown, onReport?: () => void): void {
  pushError('error', err);
  if (document.getElementById('bw-fatal')) return;
  const el = document.createElement('div');
  el.id = 'bw-fatal';
  el.style.cssText =
    'position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:linear-gradient(180deg,#2a1170,#0b0620);color:#fff;font:600 16px/1.35 Fredoka,system-ui,sans-serif';
  el.innerHTML = `<div style="font-size:56px">🫧</div><b style="font-size:22px">Ops! Algo deu errado.</b><span style="opacity:.8">Something went wrong. Vamos tentar de novo?</span>
    <button id="bw-fatal-retry" style="font:700 18px Fredoka,system-ui,sans-serif;padding:12px 26px;border-radius:999px;border:0;background:#3ee07a;color:#0b2a14">Tentar de novo</button>
    ${onReport ? '<button id="bw-fatal-report" style="font:600 15px Fredoka,system-ui,sans-serif;padding:8px 18px;border-radius:999px;border:2px solid #fff6;background:transparent;color:#fff">Enviar relatório</button>' : ''}`;
  document.body.appendChild(el);
  el.querySelector<HTMLButtonElement>('#bw-fatal-retry')!.onclick = () => location.reload();
  const rep = el.querySelector<HTMLButtonElement>('#bw-fatal-report');
  if (rep && onReport)
    rep.onclick = () => {
      el.remove();
      onReport();
    };
}
