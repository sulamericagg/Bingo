// Página de desenvolvimento: abre o Anomalias & Cia direto (sem o hub). ?debug expõe window.__ano
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerAnomalias } from '../../src/games/anomalias/register';

registerAnomalias();
const def = listGames().find((g) => g.id === 'anomalias')!;
void def.launch(document.getElementById('app')!, () => (document.title = 'exit'));
