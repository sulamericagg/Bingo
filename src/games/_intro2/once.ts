/* ============================================================
 *  ABERTURAS (lote 2) — ponte LEVE: decide quando a abertura toca e carrega o filme sob demanda.
 *
 *  Cada jogo tem src/games/<jogo>/intro/index.ts com:
 *    export const xxxIntro = defineIntro('xxx', () => import('./film'));
 *  e usa:
 *    await xxxIntro.once(root)    → 1ª partida (toca uma vez só; depois resolve na hora)
 *    await xxxIntro.fresh(root)   → jogo NOVO de um jogo com save (toca a cada jogo novo; não no "Continuar")
 *    await xxxIntro.play(root)    → "Ver abertura" do menu (sempre toca)
 *
 *  Nunca toca sozinha (once/fresh): abertura desligada nos ajustes do hub (bw-intro = '0') ou navegador automatizado
 *  (Playwright/testes de outros jogos), a não ser com ?intro=1 (ou ?intro2=1) na URL; ?intro=0 nunca toca.
 * ============================================================ */

import { introAllowed } from '../../3d/cine/gate';

export interface IntroHandle {
  readonly id: string;
  /** a abertura ainda não foi vista (e pode tocar) */
  due(): boolean;
  /** toca só na primeira vez (marca como vista ANTES de tocar: um erro não vira laço) */
  once(parent: HTMLElement): Promise<void>;
  /** jogo novo (save novo): toca sempre que permitido, mesmo já vista; marca como vista */
  fresh(parent: HTMLElement): Promise<void>;
  /** toca sempre (botão "Ver abertura" do menu) */
  play(parent: HTMLElement): Promise<void>;
  /** esquece que já viu (testes) */
  reset(): void;
}

type FilmMod = { default: (parent: HTMLElement) => Promise<void> };

const KEY = (id: string) => `bw-intro2.${id}`;

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* sem storage */
  }
}

/** pode tocar a abertura automática? (mesma regra da base 3D: src/3d/cine/gate.ts) */
const allowed = introAllowed;

let running = false;

export function defineIntro(id: string, load: () => Promise<FilmMod>): IntroHandle {
  const play = async (parent: HTMLElement): Promise<void> => {
    if (running || !parent.isConnected) return;
    running = true;
    try {
      const m = await load();
      if (parent.isConnected) await m.default(parent);
    } catch (e) {
      console.warn('[intro2]', id, e);
    } finally {
      running = false;
    }
  };
  return {
    id,
    due: () => allowed() && lsGet(KEY(id)) !== '1',
    async once(parent) {
      if (!allowed() || lsGet(KEY(id)) === '1') return;
      lsSet(KEY(id), '1');
      await play(parent);
    },
    async fresh(parent) {
      if (!allowed()) return;
      lsSet(KEY(id), '1');
      await play(parent);
    },
    play,
    reset: () => lsSet(KEY(id), null),
  };
}
