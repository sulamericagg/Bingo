/* ============================================================
 *  LINKS DO BLOOP WORLD (QR/convites): para onde cada um leva.
 *   ?voo=<CÓDIGO>     → abre o Pouso Forçado já entrando na sala
 *   ?grupo=<id>.<cod> → entra no grupo
 *   ?amigo=<@>        → Amigos com o @ preenchido
 *   ?garimpo=<CÓDIGO> → abre o Garimpo Bruto já entrando na sala do amigo
 *   ?cava=<CÓDIGO>    → abre o Cava & Fala já entrando na sala do amigo
 *  (web: ?param na URL · app: bloopworld://tipo/código ou https://…/?param=)
 * ============================================================ */
import { bloopLink, parseBloopLink, type BloopLink } from './scan';

/** Executa um link já entendido. */
export async function openBloopLink(l: BloopLink): Promise<void> {
  if (l.type === 'amigo') {
    const r = await import('../social/register');
    r.openSocial('friends', l.code);
  } else if (l.type === 'grupo') {
    const p = await import('../party/register');
    p.openSquadLink(bloopLink('grupo', l.code));
  } else if (l.type === 'cava') {
    const [{ setPendingCava }, reg, hub] = await Promise.all([import('../games/cavafala/pending'), import('../hub/registry'), import('../hub/hub')]);
    setPendingCava({ code: l.code });
    const def = reg.listGames().find((g) => g.id === 'cavafala');
    if (def) await hub.launchGame(def);
  } else if (l.type === 'garimpo') {
    const [{ setPendingGarimpo }, reg, hub] = await Promise.all([import('../games/garimpo/pending'), import('../hub/registry'), import('../hub/hub')]);
    setPendingGarimpo(l.code);
    const def = reg.listGames().find((g) => g.id === 'garimpo');
    if (def) await hub.launchGame(def);
  } else {
    const [{ setPendingVoo }, reg, hub] = await Promise.all([import('../games/voo/pending'), import('../hub/registry'), import('../hub/hub')]);
    setPendingVoo(l.code);
    const def = reg.listGames().find((g) => g.id === 'voo');
    if (def) await hub.launchGame(def);
  }
}

/** Link de sala de jogo na URL de abertura (?voo= / ?garimpo= / ?cava=). Tira da barra para recarregar não reabrir. */
export function openVooLink(url: string): boolean {
  const l = parseBloopLink(url);
  // ?voo= (web/https) e bloopworld://voo|grupo/… (app; ?grupo= e amigo já têm tratamento próprio)
  if (!l || !(l.type === 'voo' || l.type === 'garimpo' || l.type === 'cava' || (l.type === 'grupo' && url.startsWith('bloopworld:')))) return false;
  void openBloopLink(l);
  if (url === location.href) {
    const u = new URL(location.href);
    u.searchParams.delete('voo');
    u.searchParams.delete('garimpo');
    u.searchParams.delete('cava');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  }
  return true;
}
