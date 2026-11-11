/* ============================================================
 *  ABERTURAS (lote 2) — ponte LEVE: decide quando a abertura toca e carrega o filme sob demanda.
 *
 *  Cada jogo tem src/games/<jogo>/intro/index.ts com:
 *    export const xxxIntro = defineIntro('xxx', () => import('./film'));
 *  e usa:
 *    await xxxIntro.once(root)    → 1ª partida (toca uma vez só; depois resolve na hora)
 *    await xxxIntro.play(root)    → "Ver abertura" do menu (sempre toca)
 *
 *  Nunca toca: abertura desligada nos ajustes do hub (bw-intro = '0') ou navegador automatizado
 *  (Playwright/testes de outros jogos), a não ser com ?intro2=1 na URL.
 * ============================================================ */

export interface IntroHandle {
  readonly id: string;
  /** a abertura ainda não foi vista (e pode tocar) */
  due(): boolean;
  /** toca só na primeira vez (marca como vista ANTES de tocar: um erro não vira laço) */
  once(parent: HTMLElement): Promise<void>;
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

/** pode tocar a abertura automática? */
function allowed(): boolean {
  const force = typeof location !== 'undefined' && /[?&]intro2=1/.test(location.search);
  if (force) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  return lsGet('bw-intro') !== '0';
}

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
    play,
    reset: () => lsSet(KEY(id), null),
  };
}
