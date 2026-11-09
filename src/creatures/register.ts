/**
 * Integração dos bichinhos com o hub. Chamar registerCreatures() uma vez na inicialização.
 * Este módulo é leve: catálogo, render e tela da Coleção só carregam ao abrir.
 */
import * as registry from '../hub/registry';
import { t } from '../i18n';
import { save } from '../core/storage';
import { getProfileCreature } from './state';

export * from './state';

let done = false;

export function registerCreatures(): void {
  if (done) return;
  done = true;
  registry.registerPanel({
    id: 'colecao',
    get label() {
      return t('creatures.panel', 'Coleção');
    },
    icon: 'sparkle',
    navOrder: 70,
    badge: () => save.creaturesNew.length,
    open: () => void openCollectionLazy(),
  });
  // Hook opcional de foto de perfil, se o hub expuser um (checado em tempo de execução).
  const reg = registry as unknown as Record<string, unknown>;
  const hook = reg['registerProfilePhotoRenderer'] ?? reg['registerProfilePhoto'];
  if (typeof hook === 'function') {
    (hook as (fn: (px: number) => Promise<HTMLCanvasElement | null>) => void)(getProfilePhoto);
  }
}

export async function openCollectionLazy(focusId?: string): Promise<void> {
  const m = await import('./collection');
  m.openCollection(focusId);
}

/** Canvas da foto de perfil (bichinho escolhido) ou null se o jogador não escolheu nenhum. */
export async function getProfilePhoto(px: number): Promise<HTMLCanvasElement | null> {
  const id = getProfileCreature();
  if (!id) return null;
  const { renderCreatureIcon } = await import('./render');
  return renderCreatureIcon(id, px);
}
