// Página de desenvolvimento: abre a Jangada Bloop direto (sem o hub). ?debug expõe window.__jangada
import '../../src/ui/styles.css';
import { listGames } from '../../src/hub/registry';
import { registerJangada } from '../../src/games/jangada/register';
import { ONLINE } from '../../src/config';

// ?api=http://localhost:8787 → testa o online contra um `wrangler dev` local
const api = new URLSearchParams(location.search).get('api');
if (api) ONLINE.apiBase = api;

registerJangada();
const def = listGames().find((g) => g.id === 'jangada')!;
void def.launch(document.getElementById('app')!, () => (document.title = 'exit'));
