// Página de desenvolvimento: abre a Jangada Bloop direto (sem o hub). ?debug expõe window.__jangada
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerJangada } from '../../src/games/jangada/register';

registerJangada();
const def = listGames().find((g) => g.id === 'jangada')!;
void def.launch(document.getElementById('app')!, () => (document.title = 'exit'));
