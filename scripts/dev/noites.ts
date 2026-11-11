// Página de desenvolvimento: abre as Noites do Acampamento direto (sem o hub). ?debug expõe window.__noites
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerNoites } from '../../src/games/noites/register';

registerNoites();
const def = listGames().find((g) => g.id === 'noites')!;
void def.launch(document.getElementById('app')!, () => (document.title = 'exit'));
