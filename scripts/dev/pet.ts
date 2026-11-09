/**
 * Página de desenvolvimento da Casa do Bloop.
 *   npx vite --port 4310  →  http://localhost:4310/scripts/dev/pet.html
 * Parâmetros: ?room=kitchen|bath|bed|play &food=10&clean=5&fun=20&energy=15 &skin=<id> &xp=300 &coins=500
 *             &petnotif (mostra o pedido de notificação) &away=24 (simula N horas fora)
 */
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import { save, persistNow } from '../../src/core/storage';
import { registerPet, openPetScreen, type PetRoom } from '../../src/pet/register';

const q = new URLSearchParams(location.search);
const p = save.pet;
for (const k of ['food', 'clean', 'fun', 'energy', 'xp'] as const) if (q.has(k)) p[k] = Number(q.get(k));
if (q.has('skin')) save.skin = q.get('skin')!;
if (q.has('coins')) save.coins = Number(q.get('coins'));
if (q.has('away')) p.last = Date.now() - Number(q.get('away')) * 3600000;
else p.last = Date.now();
persistNow();
registerPet();
void openPetScreen((q.get('room') as PetRoom) ?? 'kitchen').then(async () => {
  (window as unknown as { __pet: unknown }).__pet = (await import('../../src/pet/screen')).__petDebug;
  document.title = 'ready';
});
