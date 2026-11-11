/**
 * Bloop Orbit como o primeiro minigame do hub (id 'orbit').
 * É um jogo "embutido": reaproveita o HUD/pausa/fim de jogo de src/ui/ui.ts e o
 * canvas #game, que o hub só liga quando o menu fica escondido.
 */
import { partySeat } from '../party/contract';
import { bus } from '../core/events';
import { save } from '../core/storage';
import { drawPlayer, type PlayerPose } from '../game/character';
import { danceFrameNow, drawDanceFxNow, drawEquippedAura, triggerDance } from '../pass/equip';
import { skinById, type Skin } from '../game/skins';
import { t } from '../i18n';
import { markInlineGame, setGameExtras } from './hub';
import { registerGame, type MiniGameDef } from './registry';

export interface OrbitHooks {
  /** começa uma partida (UI.playOrbit) */
  play(): void;
}

let skin: Skin = skinById(save.skin);
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0.2, lookY: 0.1, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };

/* estrelas fixas (sem alocação por quadro) */
const STARS = Array.from({ length: 46 }, (_, i) => ({
  x: (i * 0.618034) % 1,
  y: (i * 0.41421 + 0.13) % 1,
  r: 0.6 + ((i * 7) % 5) * 0.35,
  ph: (i * 2.3) % 6.28,
}));

let gW = 0;
let gH = 0;
let planetG: CanvasGradient | null = null;
let glowG: CanvasGradient | null = null;

function drawShowcase(x: CanvasRenderingContext2D, w: number, h: number, ts: number): void {
  const m = Math.min(w, h * 1.15);
  const cx = w / 2;
  const cy = h * 0.6;
  const R = m * 0.2;
  if (w !== gW || h !== gH || !planetG) {
    gW = w;
    gH = h;
    planetG = x.createRadialGradient(cx - R * 0.4, cy - R * 0.5, R * 0.1, cx, cy, R);
    planetG.addColorStop(0, '#9ffcff');
    planetG.addColorStop(0.55, '#3fb8ff');
    planetG.addColorStop(1, '#4b2ad6');
    glowG = x.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2.6);
    glowG.addColorStop(0, 'rgba(94,240,255,0.35)');
    glowG.addColorStop(1, 'rgba(94,240,255,0)');
  }
  // estrelas
  x.fillStyle = '#fff';
  for (const s of STARS) {
    x.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(ts * 1.3 + s.ph));
    x.fillRect(s.x * w, s.y * h * 0.9, s.r, s.r);
  }
  x.globalAlpha = 1;
  // brilho + planeta + anel
  x.fillStyle = glowG!;
  x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(255,207,46,0.85)';
  x.lineWidth = Math.max(2, R * 0.08);
  x.beginPath();
  x.ellipse(cx, cy, R * 1.75, R * 0.42, -0.25, Math.PI * 0.95, Math.PI * 2.05);
  x.stroke();
  x.fillStyle = planetG!;
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(42,11,92,0.18)';
  x.beginPath();
  x.arc(cx + R * 0.3, cy + R * 0.25, R * 0.22, 0, Math.PI * 2);
  x.arc(cx - R * 0.35, cy + R * 0.45, R * 0.12, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.ellipse(cx, cy, R * 1.75, R * 0.42, -0.25, Math.PI * 0.05, Math.PI * 0.95);
  x.stroke();
  // bloop orbitando por cima
  const a = -Math.PI / 2 + Math.sin(ts * 1.1) * 0.9;
  const pr = R * 0.62;
  const px = cx + Math.cos(a) * (R + pr * 0.95);
  const py = cy + Math.sin(a) * (R + pr * 0.95);
  pose.t = ts;
  pose.blink = ts % 3.7 > 3.55 ? 1 : 0;
  pose.lookX = Math.cos(a) * 0.3;
  x.save();
  x.translate(px, py);
  x.rotate(a + Math.PI / 2);
  // Passe Musical: aura equipada atrás + dança (emote ao tocar no Bloop)
  drawEquippedAura(x, 0, 0, pr, ts);
  const dp = danceFrameNow(x, pr, skin.dark);
  pose.sx = dp ? dp.sx : 1;
  pose.sy = dp ? dp.sy : 1;
  pose.mood = dp ? dp.mood : 'idle';
  drawPlayer(x, skin, pr, pose);
  if (dp) drawDanceFxNow(x, dp, pr);
  x.restore();
}

export function registerOrbit(hooks: OrbitHooks): void {
  markInlineGame('orbit');
  bus.on('cosmetics', () => (skin = skinById(save.skin)));
  bus.on('showcase-tap', (id: string) => id === 'orbit' && triggerDance());
  const ex = document.getElementById('orbit-extras');
  if (ex) setGameExtras('orbit', ex);
  const def: MiniGameDef = {
    id: 'orbit',
    name: 'Bloop Orbit',
    get tagline() {
      return t('orbit.tagline', 'Pule de planeta em planeta!');
    },
    icon: 'planet',
    theme: {
      bg: ['#3a1590', '#0b0620'],
      accent: '#ff4fb0',
      accent2: '#5ef0ff',
      title: ['#ffffff', '#ff8ad8'],
    },
    drawShowcase,
    async launch() {
      skin = skinById(save.skin);
      // grupo: o líder abriu o Orbit → todo mundo vai para a Corrida Orbital na sala do grupo (docs/PARTY.md)
      const seat = partySeat('race');
      if (seat?.host && seat.fresh) {
        document.getElementById('btn-race')?.click();
        return { destroy() {} };
      }
      hooks.play();
      return { destroy() {} };
    },
    online: true,
  };
  registerGame(def);
}
