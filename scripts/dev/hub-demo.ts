/**
 * DEV ONLY — minigames de mentira para testar o carrossel do hub com 4 jogos.
 * Carregado só em `npm run dev` com ?hubdemo na URL (ver src/main.ts). Nunca vai para o app.
 */
import { registerGame, type HubTheme, type MiniGameDef } from '../../src/hub/registry';
import type { IconName } from '../../src/ui/icons';

function demo(id: string, name: string, tagline: string, icon: IconName, theme: HubTheme, draw?: MiniGameDef['drawShowcase']): MiniGameDef {
  return {
    id,
    name,
    tagline,
    icon,
    theme,
    drawShowcase: draw,
    async launch(root, exit) {
      root.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;background:linear-gradient(${theme.bg[0]},${theme.bg[1]});color:#fff;font:700 28px Fredoka,sans-serif;text-align:center">
        <div>${name}<br><small style="font-size:16px;opacity:.8">demo — toque para sair</small></div></div>`;
      root.onclick = () => exit();
      return { destroy: () => (root.innerHTML = ''), pause: () => {}, resume: () => {} };
    },
  };
}

/** cena simples: canos verdes deslizando (demonstra drawShowcase próprio) */
function pipes(x: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  for (let i = 0; i < 4; i++) {
    const px = ((i * 0.33 - t * 0.12) % 1.32 + 1.32) % 1.32 * w - w * 0.16;
    const gap = h * (0.35 + 0.15 * Math.sin(i * 2.1));
    x.fillStyle = '#3ee07a';
    x.fillRect(px, 0, w * 0.13, gap - h * 0.14);
    x.fillRect(px, gap + h * 0.14, w * 0.13, h);
    x.fillStyle = 'rgba(255,255,255,0.35)';
    x.fillRect(px + 4, 0, 5, h);
  }
  x.fillStyle = '#ffcf2e';
  x.beginPath();
  x.arc(w * 0.35, h * 0.45 + Math.sin(t * 3) * h * 0.08, Math.min(w, h) * 0.07, 0, Math.PI * 2);
  x.fill();
}

export function registerHubDemo(): void {
  registerGame(
    demo('demo-pipes', 'Bloop Tubo', 'Voe entre os canos!', 'bolt', { bg: ['#14a3c7', '#0a2a5c'], accent: '#3ee07a', accent2: '#ffcf2e', title: ['#ffffff', '#b6ffcf'] }, pipes),
  );
  registerGame(demo('demo-rally', 'Bloop Rally', 'Acelere na pista de doces!', 'rocket', { bg: ['#ff9a2e', '#7a1240'], accent: '#ffcf2e', accent2: '#ff4f6a', title: ['#fff6b0', '#ff9a2e'] }));
  registerGame(demo('demo-tycoon', 'Bloop Fábrica', 'Monte sua fábrica de brinquedos', 'coins', { bg: ['#7b3dff', '#1a0b4a'], accent: '#3fb8ff', accent2: '#ff5cc8', title: ['#e0feff', '#5ef0ff'] }));
}
