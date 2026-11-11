/* ============================================================
 *  BLOOP ESPELHO — integração com o hub (leve; a tela, o MediaPipe e
 *  o modelo só carregam ao abrir o painel).
 *    registerMirror({ getTier })   registra o painel 'espelho'
 *    openMirror() / closeMirror()  (o voltar do Android usa a pilha de back)
 * ============================================================ */
import { registerPanel } from '../hub/registry';
import { bus } from '../core/events';
import { t } from '../i18n';

type Screen = typeof import('./screen');
let screen: Screen | null = null;
let getTier: () => number = () => 2;

/* "NOVO" na barra inferior nos primeiros dias (até abrir algumas vezes) */
const NEW_KEY = 'bloop.mirror.new';
const NEW_DAYS = 5;
const NEW_OPENS = 3;
interface NewInfo {
  first: number;
  opens: number;
}
function newInfo(): NewInfo {
  try {
    const o = JSON.parse(localStorage.getItem(NEW_KEY) || 'null') as NewInfo | null;
    if (o && typeof o.first === 'number') return o;
  } catch {
    /* sem storage */
  }
  const o = { first: Date.now(), opens: 0 };
  try {
    localStorage.setItem(NEW_KEY, JSON.stringify(o));
  } catch {
    /* sem storage */
  }
  return o;
}
/** O Espelho ainda é novidade para este jogador? */
export function mirrorIsNew(): boolean {
  const o = newInfo();
  return o.opens < NEW_OPENS && Date.now() - o.first < NEW_DAYS * 86400000;
}

export async function openMirror(): Promise<void> {
  try {
    const o = newInfo();
    o.opens++;
    localStorage.setItem(NEW_KEY, JSON.stringify(o));
  } catch {
    /* sem storage */
  }
  bus.emit('wallet'); // atualiza os selos da barra inferior
  screen ??= await import('./screen');
  screen.openMirror(getTier());
}

export function closeMirror(): boolean {
  return screen ? screen.closeMirror() : false;
}

let done = false;
export function registerMirror(o: { getTier?: () => number } = {}): void {
  if (done) return;
  done = true;
  if (o.getTier) getTier = o.getTier;
  registerPanel({
    id: 'espelho',
    get label() {
      return t('mirror.panel', 'Espelho');
    },
    icon: 'camera',
    navOrder: 32,
    badge: () => (mirrorIsNew() ? t('mirror.new', 'NOVO') : 0),
    highlight: () => mirrorIsNew(),
    open: () => void openMirror(),
  });
}
