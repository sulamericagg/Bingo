/* ============================================================
 *  CINE — gancho leve de "jogo novo" (sem three.js: pode ser importado por jogos 2D).
 *  Marca "já viu" em localStorage ('bloop-intro-<id>'). ?intro=1 sempre toca; ?intro=0 nunca.
 * ============================================================ */
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
/** já tocou nesta sessão (o ?intro=1 força só uma vez por carregamento) */
const played = new Set<string>();
/** deve tocar sozinha agora? (primeira vez, ou forçado por ?intro=1) */
export function introWanted(id: string): boolean {
  const q = /[?&]intro=([01])/.exec(location.search);
  if (q) return q[1] === '1' && !played.has(id);
  return !introSeen(id);
}
/**
 * Gancho de "jogo novo": toca a abertura só na primeira vez.
 * `load` importa o módulo da abertura sob demanda (fica fora do chunk do jogo) e a toca.
 * Nunca rejeita: se a abertura falhar, o jogo segue.
 */
export async function introGate(id: string, load: () => Promise<void>): Promise<void> {
  if (!introWanted(id)) return;
  played.add(id);
  markIntroSeen(id);
  try {
    await load();
  } catch (e) {
    console.warn('[intro]', id, e);
  }
}
