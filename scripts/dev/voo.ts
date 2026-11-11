// Página de desenvolvimento do "Pouso Forçado": abre o voo direto (sem hub/hangar).
// /scripts/dev/voo.html?mode=3d|2d &flight=normal|training|daily &role=0..3 &bots=0..3 &seed=N
// &hub=1 (simula os botões do hub por cima: girar tela no topo e o besouro do beta à direita)
// O jogo fica em window.__voo (?debug é ligado aqui).
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/700.css';
import '../../src/ui/styles.css';
import { launch } from '../../src/games/voo/game';

const qs = new URLSearchParams(location.search);
if (!location.search.includes('debug')) history.replaceState(null, '', location.pathname + location.search + (location.search ? '&' : '?') + 'debug');
try {
  localStorage.setItem('bw-voo-flytut', '1');
  const sv = JSON.parse(localStorage.getItem('bw-voo') || 'null') ?? { v: 1 };
  sv.v = 1;
  sv.tutDone = true;
  localStorage.setItem('bw-voo', JSON.stringify(sv));
} catch {
  /* */
}
const app = document.getElementById('app')!;
if (qs.get('hub')) {
  const css = document.createElement('style');
  css.textContent = `.gh-rot{position:fixed;z-index:40;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);width:40px;height:40px;border-radius:50%;border:2px solid rgba(255,255,255,.55);background:rgba(20,8,48,.55)}
.beta-bug{position:fixed;right:8px;bottom:calc(150px + var(--safe-bot,0px));z-index:2147482000;width:42px;height:42px;border-radius:50%;border:2px solid rgba(255,255,255,.85);background:rgba(255,246,176,.92);opacity:.78}`;
  document.head.appendChild(css);
  const r = document.createElement('div');
  r.className = 'gh-rot';
  const b = document.createElement('div');
  b.className = 'beta-bug';
  document.body.append(r, b);
}
void launch(app, () => location.reload(), {
  quick: true,
  mode: (qs.get('mode') as '2d' | '3d') ?? '3d',
  flight: (qs.get('flight') as 'normal') ?? 'normal',
  role: Number(qs.get('role') ?? 0),
  bots: Number(qs.get('bots') ?? 3),
  seed: Number(qs.get('seed') ?? 1234),
});
document.title = 'ready';
