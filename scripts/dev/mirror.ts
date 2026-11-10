/**
 * Página de desenvolvimento do Bloop Espelho.
 *   npx vite --port 4311  →  http://localhost:4311/scripts/dev/mirror.html?debug
 * Parâmetros: &sub=1 (Clube ativo) &fresh (zera consentimento/tempo do dia) &skin=<id> &tier=0..3
 * No console: __mirror.setFace({ blinkL: 1, jaw: .8 }), __mirror.state(), __mirror.burn(60000)
 */
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '../../src/ui/styles.css';
import { persistNow, save } from '../../src/core/storage';
import { registerMirror, openMirror } from '../../src/mirror/register';

const q = new URLSearchParams(location.search);
if (q.has('skin')) save.skin = q.get('skin')!;
if (q.get('sub') === '1') save.club.expires = Date.now() + 7 * 86400000;
if (q.get('sub') === '0') save.club.expires = 0;
if (q.has('fresh')) delete (save as unknown as { mirror?: unknown }).mirror;
persistNow();
registerMirror({ getTier: () => Number(q.get('tier') ?? 2) });
void openMirror().then(() => (document.title = 'ready'));
