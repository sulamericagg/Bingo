// Página de desenvolvimento: abre "Noites do Acampamento" direto (sem o hub).
// /scripts/dev/noites.html?debug  (&reset=1 apaga o salvamento; &noad=1 esconde a faixa do anúncio)
import { listGames } from '../../src/hub/registry';
import { registerNoites } from '../../src/games/noites/register';

const qs = new URLSearchParams(location.search);
if (qs.get('reset')) {
  localStorage.removeItem('noites-save');
  localStorage.removeItem('noites-run');
}
// faixa de anúncio simulada (50 px), como o banner do AdMob faz no app
if (qs.get('noad')) document.getElementById('ad')?.remove();
else document.documentElement.style.setProperty('--ad-bottom', '50px');
registerNoites();
const def = listGames().find((g) => g.id === 'noites')!;
void def.launch(document.getElementById('app')!, () => location.reload()).then(() => (document.title = 'ready'));
