// Página de desenvolvimento: abre o Garimpo Bruto direto (sem o hub). ?debug expõe window.__garimpo
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerGarimpo } from '../../src/games/garimpo/register';

registerGarimpo();
const def = listGames().find((g) => g.id === 'garimpo')!;
void def.launch(document.getElementById('app')!, () => (document.title = 'exit'));
