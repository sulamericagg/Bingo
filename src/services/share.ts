import { Share } from '@capacitor/share';
import { LINKS } from '../config';
import { isNative } from '../core/platform';

export async function shareScore(score: number): Promise<void> {
  const text = `🪐 Fiz ${score} pontos no Bloop Orbit! Duvido você passar 😏`;
  const url = isNative ? LINKS.playStore : location.href.split('#')[0];
  try {
    if (isNative) {
      await Share.share({ title: 'Bloop Orbit', text, url, dialogTitle: 'Desafiar amigos' });
    } else if (navigator.share) {
      await navigator.share({ title: 'Bloop Orbit', text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      alert('Link copiado! Cole para seus amigos 😉');
    }
  } catch {
    /* cancelado */
  }
}
