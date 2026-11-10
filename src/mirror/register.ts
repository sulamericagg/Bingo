/* ============================================================
 *  BLOOP ESPELHO — integração com o hub (leve; a tela, o MediaPipe e
 *  o modelo só carregam ao abrir o painel).
 *    registerMirror({ getTier })   registra o painel 'espelho'
 *    openMirror() / closeMirror()  (o voltar do Android usa a pilha de back)
 * ============================================================ */
import { registerPanel } from '../hub/registry';
import { t } from '../i18n';

type Screen = typeof import('./screen');
let screen: Screen | null = null;
let getTier: () => number = () => 2;

export async function openMirror(): Promise<void> {
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
    open: () => void openMirror(),
  });
}
