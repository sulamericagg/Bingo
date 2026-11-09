/* ============================================================
 *  CASA DO BLOOP — integração com o hub.
 *
 *  O líder chama `registerPet()` uma vez no boot. Este arquivo é leve:
 *  a tela (canvas, CSS, desenhos) só é carregada ao abrir o painel.
 *
 *  API pública:
 *    registerPet()            registra o painel 'pet' e os ouvintes
 *    openPetScreen(room?)     abre a Casa do Bloop (lazy)
 *    closePetScreen()         fecha (true se estava aberta) — use no botão voltar
 *    petCoinBonus()           (de ./state) bônus de moedas p/ todos os jogos, ex.: 0.05
 *    petHubHint()             dica curta para o hub ("Estou com fome!") ou null
 *  Eventos no bus: 'pet' (status mudou), 'pet-levelup' (nível), 'pet-closed',
 *    'pet-play-games' (botão "Jogar minigames" da sala — a tela já fechou).
 * ============================================================ */
import { bus } from '../core/events';
import { isNative } from '../core/platform';
import { registerPanel, type RunReport } from '../hub/registry';
import { t } from '../i18n';
import type { IconName } from '../ui/icons';
import { cancelReminders, onNotifTap, scheduleReminders } from './notify';
import { mood, needsCount, onRunEnd, tick, worstStat } from './state';

export { petCoinBonus } from './state';

type Screen = typeof import('./screen');
let screen: Screen | null = null;
let loading: Promise<Screen> | null = null;

function load(): Promise<Screen> {
  if (screen) return Promise.resolve(screen);
  if (!loading) loading = import('./screen').then((m) => (screen = m));
  return loading;
}

export type PetRoom = 'kitchen' | 'bath' | 'bed' | 'play';

export async function openPetScreen(room?: PetRoom): Promise<void> {
  const s = await load();
  s.openPet(room ? { room } : {});
}

/** Fecha a tela (ou um modal dela). Retorna true se consumiu o "voltar". */
export function closePetScreen(): boolean {
  return screen ? screen.closePet() : false;
}

export function isPetScreenOpen(): boolean {
  return screen ? screen.isPetOpen() : false;
}

/** Dica curta para mostrar no hub (toast/balão) quando o bichinho precisa de algo. */
export function petHubHint(): { text: string; icon: IconName; room: PetRoom } | null {
  tick();
  const k = worstStat();
  if (!k) return null;
  if (k === 'food') return { text: t('pet.hint.food', 'Seu Bloop está com fome!'), icon: 'food', room: 'kitchen' };
  if (k === 'clean') return { text: t('pet.hint.clean', 'Seu Bloop precisa de um banho!'), icon: 'bath', room: 'bath' };
  if (k === 'energy') return { text: t('pet.hint.energy', 'Seu Bloop está com soninho.'), icon: 'bed', room: 'bed' };
  return { text: t('pet.hint.fun', 'Seu Bloop quer brincar!'), icon: 'ball', room: 'play' };
}

let registered = false;

export function registerPet(): void {
  if (registered) return;
  registered = true;
  tick();
  registerPanel({
    id: 'pet',
    label: t('pet.panel', 'Bichinho'),
    icon: 'pet',
    navOrder: 2,
    open: () => void openPetScreen(),
    badge: () => needsCount(),
  });

  bus.on('run-end', (r: RunReport) => {
    onRunEnd(r);
  });

  // app em segundo plano: agenda lembretes; ao voltar: cancela e atualiza
  const onHide = (): void => {
    tick();
    void scheduleReminders();
  };
  const onShow = (): void => {
    tick();
    void cancelReminders();
    bus.emit('pet');
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? onHide() : onShow()));
  if (isNative) {
    void import('@capacitor/app')
      .then(({ App }) => {
        App.addListener('pause', onHide);
        App.addListener('resume', onShow);
      })
      .catch(() => {});
    void cancelReminders();
    void onNotifTap(() => void openPetScreen());
  }
  // pré-carrega a tela quando o navegador estiver ocioso
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
  if (mood().hungry || mood().dirty) (idle ?? ((cb: () => void) => setTimeout(cb, 3000)))(() => void load());
}
