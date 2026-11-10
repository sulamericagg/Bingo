/**
 * Ponte leve (bundle principal) para a intro 3D de cada jogo (src/intro3d, carregado sob demanda).
 * 1ª vez de cada jogo na sessão = intro completa; depois = versão curta (1,5 s). Ajuste para desligar.
 */
import { t } from '../i18n';
import type { HubTheme } from './registry';

const KEY = 'bw-intro';
const seen = new Set<string>();

export function introEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}
export function setIntroEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* sem storage */
  }
}

export interface IntroRun {
  /** resolve quando a intro terminou (ou foi pulada / falhou) */
  done: Promise<void>;
}

export interface IntroInfo {
  id: string;
  name: string;
  tagline: string;
  theme: HubTheme;
}

/** Painéis que também ganham intro (não são jogos do registro). */
const PANEL_INTROS: Record<string, () => IntroInfo> = {
  pet: () => ({
    id: 'pet',
    name: t('intro3d.pet.name', 'Meu Bichinho'),
    tagline: t('intro3d.pet.tag', 'Cuide, brinque e encha de carinho!'),
    theme: { bg: ['#ffb3d9', '#8a5cff'], accent: '#ff5fa2', accent2: '#ffd23f', title: ['#ffffff', '#ffc2e6'] },
  }),
  casa: () => ({
    id: 'casa',
    name: t('intro3d.casa.name', 'Minha Casa'),
    tagline: t('intro3d.casa.tag', 'Decore do seu jeito e receba os amigos!'),
    theme: { bg: ['#8fd3ff', '#3a5cc8'], accent: '#ff9a3d', accent2: '#ffd84a', title: ['#fff6d6', '#ffd27a'] },
  }),
  espelho: () => ({
    id: 'espelho',
    name: t('mirror.title', 'Bloop Espelho'),
    tagline: t('intro3d.espelho.tag', 'Faça caretas e o Bloop imita você!'),
    theme: { bg: ['#8a5cff', '#2a1450'], accent: '#ff5fa2', accent2: '#ffd34a', title: ['#ffffff', '#ffd6f0'] },
  }),
};
export function panelIntro(id: string): IntroInfo | null {
  return PANEL_INTROS[id]?.() ?? null;
}

/**
 * Cobre `parent` com a intro do jogo. null = intro desligada.
 * fixed = cobre a tela toda (jogos embutidos e painéis, que não usam o game host).
 */
export function startIntro(parent: HTMLElement, def: IntroInfo, tier: number, fixed = false): IntroRun | null {
  if (!introEnabled()) return null;
  const short = seen.has(def.id);
  seen.add(def.id);
  const el = document.createElement('div');
  el.className = 'i3-root';
  // cobre na hora com as cores do jogo (o módulo chega em seguida)
  el.style.cssText = `position:${fixed ? 'fixed' : 'absolute'};inset:0;z-index:${fixed ? 9000 : 6};overflow:hidden;background:radial-gradient(circle at 50% 45%,${def.theme.bg[0]},${def.theme.bg[1]})`;
  parent.appendChild(el);
  // toque antes do módulo chegar = pula a intro inteira
  let early = false;
  const onEarly = () => (early = true);
  el.addEventListener('pointerdown', onEarly);
  const done = import('../intro3d')
    .then((m) => {
      el.removeEventListener('pointerdown', onEarly);
      if (early || !el.isConnected) return;
      return m.playIntro(el, { id: def.id, name: def.name, tagline: def.tagline, theme: def.theme, tier, short });
    })
    .catch((e) => console.warn('[intro3d]', e))
    .finally(() => el.remove());
  return { done };
}
