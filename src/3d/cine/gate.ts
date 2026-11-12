/* ============================================================
 *  CINE — gancho leve de "jogo novo" (sem three.js: pode ser importado por jogos 2D).
 *  Marca "já viu" em localStorage ('bloop-intro-<id>').
 *
 *  Regra (docs/INTROS.md):
 *   - jogos com jogo salvo (espaços / "Novo jogo" / "Nova jangada"): a abertura toca TODA vez que um
 *     jogo novo começa — `introGate(id, load, { fresh: true })`; continuar um save não toca;
 *   - jogos de fase/arcade (sem save): só na primeira vez — `introGate(id, load)`.
 *  Nunca toca sozinha: ?intro=0, abertura desligada nos ajustes do hub (bw-intro = '0') ou navegador
 *  automatizado (Playwright/QA). ?intro=1 (ou ?intro2=1) força.
 * ============================================================ */
import { t } from '../../i18n';

/** rótulo do botão de rever a abertura nos menus ("Abertura") */
export const introLabel = (): string => t('cine.replay', 'Abertura');

const SEEN = (id: string) => 'bloop-intro-' + id;
export function introSeen(id: string): boolean {
  try {
    return localStorage.getItem(SEEN(id)) === '1';
  } catch {
    return true;
  }
}
export function markIntroSeen(id: string): void {
  try {
    localStorage.setItem(SEEN(id), '1');
  } catch {
    /* */
  }
}

/**
 * Pode uma abertura tocar sozinha agora? (vale para as duas bases: esta e src/games/_intro2)
 * ?intro=0 nunca · ?intro=1 sempre · navegador automatizado não · ajuste do hub desligado não.
 */
export function introAllowed(): boolean {
  const q = typeof location !== 'undefined' ? location.search : '';
  if (/[?&]intro2?=0/.test(q)) return false;
  if (/[?&]intro2?=1/.test(q)) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  try {
    return localStorage.getItem('bw-intro') !== '0';
  } catch {
    return true;
  }
}

export interface IntroOpts {
  /** jogo NOVO de um jogo com save (novo espaço / "Novo jogo"): toca sempre, mesmo já vista */
  fresh?: boolean;
}

/** já tocou nesta sessão (o ?intro=1 força só uma vez por carregamento nas aberturas de 1ª vez) */
const played = new Set<string>();
/** deve tocar sozinha agora? (jogo novo com save; ou 1ª vez; ou forçado por ?intro=1) */
export function introWanted(id: string, o: IntroOpts = {}): boolean {
  if (o.fresh) return introAllowed();
  const q = /[?&]intro=([01])/.exec(location.search);
  if (q) return q[1] === '1' && !played.has(id);
  return introAllowed() && !introSeen(id);
}
/**
 * Gancho de "jogo novo". Sem opções: toca só na primeira vez. Com `{ fresh: true }`: toca a cada
 * jogo novo (quem chama garante que é um save novo, e não "Continuar").
 * `load` importa o módulo da abertura sob demanda (fica fora do chunk do jogo) e a toca.
 * Nunca rejeita: se a abertura falhar, o jogo segue.
 */
export async function introGate(id: string, load: () => Promise<void>, o: IntroOpts = {}): Promise<void> {
  if (!introWanted(id, o)) return;
  played.add(id);
  markIntroSeen(id);
  try {
    await load();
  } catch (e) {
    console.warn('[intro]', id, e);
  }
}
