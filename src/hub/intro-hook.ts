/**
 * Ponte leve (bundle principal) para a intro 3D de cada jogo (src/intro3d, carregado sob demanda).
 * 1ª vez de cada jogo na sessão = intro completa; depois = versão curta (1,5 s). Ajuste para desligar.
 */
import type { MiniGameDef } from './registry';

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

/** Cobre `parent` com a intro do jogo. null = intro desligada. */
export function startIntro(parent: HTMLElement, def: MiniGameDef, tier: number): IntroRun | null {
  if (!introEnabled()) return null;
  const short = seen.has(def.id);
  seen.add(def.id);
  const el = document.createElement('div');
  el.className = 'i3-root';
  // cobre na hora com as cores do jogo (o módulo chega em seguida)
  el.style.cssText = `position:absolute;inset:0;z-index:6;overflow:hidden;background:radial-gradient(circle at 50% 45%,${def.theme.bg[0]},${def.theme.bg[1]})`;
  parent.appendChild(el);
  const done = import('../intro3d')
    .then((m) => m.playIntro(el, { id: def.id, name: def.name, tagline: def.tagline, theme: def.theme, tier, short }))
    .catch((e) => console.warn('[intro3d]', e))
    .finally(() => el.remove());
  return { done };
}
