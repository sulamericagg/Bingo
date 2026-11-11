/* ============================================================
 *  BLOOP STUDIO — link de compartilhar (abre na versão WEB do jogo).
 *
 *  Esquema (no fragmento, então nunca vai para o servidor nos logs de acesso):
 *    <web>/#/studio/p/<id>        criação/jogo PUBLICADO na Loja (id da listagem)
 *    <web>/#/studio/c/<código>    criação pequena embutida no link: código = format.serialize()
 *                                 ("B1." + base64url(deflate)) — só até MAX_INLINE letras
 *  <web> = origem da página na web; no app Android, o endereço do Worker (ONLINE.nativeApiBase),
 *  que serve a mesma versão web. Leve: sem three.js (o registro do hub importa isto).
 * ============================================================ */
import { ONLINE } from '../config';
import { isNative } from '../core/platform';

export const MAX_INLINE = 6000;
const RE = /^#\/studio\/(p|c)\/([A-Za-z0-9_.\-]+)$/;

export interface ShareLink {
  id?: string;
  code?: string;
}

export function webBase(): string {
  if (isNative) return ONLINE.nativeApiBase.replace(/\/$/, '') + '/';
  return location.origin + location.pathname;
}

export function linkFor(l: ShareLink): string {
  return webBase() + (l.id ? `#/studio/p/${l.id}` : `#/studio/c/${l.code}`);
}

export function parseShareHash(hash: string): ShareLink | null {
  const m = RE.exec(hash);
  if (!m) return null;
  return m[1] === 'p' ? { id: m[2] } : { code: m[2] };
}

/** abre o compartilhar do sistema (ou copia) */
export async function shareUrl(url: string, title: string): Promise<'shared' | 'copied' | 'fail'> {
  const text = `${title} — Bloop Studio`;
  try {
    if (isNative) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: text, text, url, dialogTitle: text });
      return 'shared';
    }
    if (navigator.share) {
      await navigator.share({ title: text, text, url });
      return 'shared';
    }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'fail';
    }
  }
}
