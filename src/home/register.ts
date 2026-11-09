/* ============================================================
 *  CASA, PLANETA & AMIGOS — integração com o hub (leve; a tela é lazy).
 *
 *  API pública:
 *    registerHome()              registra o painel 'casa' (navOrder 35, ícone home)
 *                                com a entrada 'amigos' dentro dele
 *    openHome(opts?)             abre a Casa: { tab?: 'home'|'friends'|'build'|'rooms', visit?, party?, room? }
 *    openFriendsPanel()          abre direto em Amigos
 *    openHandleEditor()          editar o @ (para o Perfil)
 *    closeHome()                 voltar (true se consumiu) — use no botão voltar do Android
 *    isHomeOpen()
 *    myHouseThumb()              dataURL da miniatura da casa (para perfil/lista) ou null
 *  Eventos no bus: 'home-closed', 'pet-care' {action:'party'} ao sair de uma festa.
 * ============================================================ */
import { registerPanel } from '../hub/registry';
import { t } from '../i18n';

type Screen = typeof import('./screen');
let screen: Screen | null = null;
let loading: Promise<Screen> | null = null;
function load(): Promise<Screen> {
  if (screen) return Promise.resolve(screen);
  if (!loading) loading = import('./screen').then((m) => (screen = m));
  return loading;
}
export type HomeOpenOpts = import('./screen').OpenOpts;
export async function openHome(o: HomeOpenOpts = {}): Promise<void> {
  (await load()).openHome(o);
}
export const openFriendsPanel = (): Promise<void> => openHome({ tab: 'friends' });
export async function openHandleEditor(): Promise<void> {
  (await load()).openHandleEditor();
}
export function closeHome(): boolean {
  return screen ? screen.closeHome() : false;
}
export function isHomeOpen(): boolean {
  return screen ? screen.isHomeOpen() : false;
}
export function myHouseThumb(): string | null {
  try {
    return localStorage.getItem('bw-home-thumb');
  } catch {
    return null;
  }
}

let done = false;
export function registerHome(): void {
  if (done) return;
  done = true;
  registerPanel({ id: 'casa', get label() { return t('home.panel', 'Casa'); }, icon: 'home', navOrder: 35, open: () => void openHome() });
  // entrada "amigos" dentro da Casa (sem lugar na barra inferior)
  registerPanel({ id: 'amigos', get label() { return t('home.panel.friends', 'Amigos'); }, icon: 'user', open: () => void openFriendsPanel() });
}
