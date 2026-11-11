/* ============================================================
 *  Escolha 2D / 3D do "Sobreviva aos Desastres" (como Floresta/Cozinha).
 *  O handle devolvido ao hub delega para o jogo escolhido.
 * ============================================================ */
import type { MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { icon } from '../../ui/icons';
import { notify } from '../../ui/notify';
import { detectInitialTier } from '../../core/quality';
import { dzIcon } from './icons';
import { partyRoomFor } from '../../party/contract';
import { loadMode, MODE_KEY as DIFF_KEY, type DzMode } from './tuning';
import { openPedia, pediaCount } from './roulette';

const MODE_KEY = 'bo-disaster-mode';

const CSS = `
.dz-pick{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:max(14px,env(safe-area-inset-top)) 16px max(14px,var(--safe-bot,0px));background:radial-gradient(circle at 50% 30%,#3a5aa8,#0d1830);font-family:'Fredoka',system-ui,sans-serif;color:#fff;touch-action:manipulation;z-index:5}
.dz-pick h2{margin:0;font-size:26px;color:#ffe14d;-webkit-text-stroke:1.5px #2a0b5c;text-align:center}
.dz-pick .row{display:flex;gap:14px;flex-wrap:wrap;justify-content:center}
.dz-pick .m{font:inherit;color:#2a0b5c;cursor:pointer;width:min(42vw,190px);min-height:150px;border:3px solid #2a0b5c;border-radius:22px;box-shadow:0 5px 0 #2a0b5c;background:linear-gradient(180deg,#ffe680,#ffb03a);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:10px}
.dz-pick .m.d3{background:linear-gradient(180deg,#9be8ff,#4fa6ff)}
.dz-pick .m.last{outline:4px solid #fff;outline-offset:2px}
.dz-pick .m b{font-size:34px;line-height:1}
.dz-pick .m small{font-size:13px;font-weight:600;opacity:.85;text-align:center}
.dz-pick .m:active{transform:translateY(3px);box-shadow:0 2px 0 #2a0b5c}
.dz-pick .dif{display:flex;gap:6px;background:rgba(30,15,70,.6);border-radius:16px;padding:4px}
.dz-pick .dif button{font:inherit;font-weight:700;font-size:15px;color:#fff;background:transparent;border:0;border-radius:12px;padding:6px 12px;cursor:pointer}
.dz-pick .dif button.on{background:linear-gradient(180deg,#ffe680,#ffb03a);color:#2a0b5c;box-shadow:0 3px 0 #2a0b5c}
.dz-pick .ped{font:inherit;font-weight:700;color:#2a0b5c;background:linear-gradient(180deg,#d9f6ff,#8fd3ff);border:3px solid #2a0b5c;border-radius:16px;box-shadow:0 4px 0 #2a0b5c;padding:6px 14px;display:flex;align-items:center;gap:8px;cursor:pointer}
.dz-pick .ped .ico{width:30px;height:30px}
.dz-pick .ped small{font-weight:600;opacity:.75}
.dz-pick .bot{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;align-items:center}
.dz-pick .out{font:inherit;color:#fff;background:rgba(30,15,70,.72);border:2px solid rgba(255,255,255,.3);border-radius:14px;padding:8px 16px;display:flex;align-items:center;gap:6px;cursor:pointer}
@media (orientation:landscape) and (max-height:500px){.dz-pick .m{min-height:120px}.dz-pick h2{font-size:22px}}
`;
let cssDone = false;

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    (g?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !!g;
  } catch {
    return false;
  }
}

/** Abre a escolha 2D/3D; `?dz3d=1` / `?dz3d=0` pulam a escolha (testes). */
export function launchDisaster(root: HTMLElement, exit: () => void): MiniGameHandle {
  let inner: MiniGameHandle | null = null;
  let dead = false;
  let paused = false;
  let pick: HTMLElement | null = null;
  const handle: MiniGameHandle = {
    destroy() {
      dead = true;
      pick?.remove();
      inner?.destroy();
      inner = null;
    },
    pause() {
      paused = true;
      inner?.pause?.();
    },
    resume() {
      paused = false;
      inner?.resume?.();
    },
    inMatch() {
      return !!inner?.inMatch?.();
    },
  };
  const start = async (mode: '2d' | '3d') => {
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      /* */
    }
    pick?.remove();
    pick = null;
    try {
      if (mode === '3d') {
        const m = await import('./d3/game3d');
        if (dead) return;
        inner = new m.Disaster3D(root, exit);
      } else {
        const m = await import('./game');
        if (dead) return;
        inner = new m.DisasterGame(root, exit);
      }
    } catch (e) {
      console.warn('[disaster] falha ao abrir', mode, e);
      if (dead) return;
      if (mode === '3d') {
        notify(t('dz.no3d', '3D não disponível neste aparelho. Abrindo em 2D.'), { ms: 2400 });
        void start('2d');
        return;
      }
      exit();
      return;
    }
    if (paused) inner?.pause?.();
  };
  const q = /[?&]dz3d=([01])/.exec(location.search);
  // grupo (docs/PARTY.md): todos direto no 2D (mesmo cenário + placar do grupo), sem tela de escolha
  if (partyRoomFor('disaster')) {
    void start('2d');
    return handle;
  }
  if (q) {
    void start(q[1] === '1' ? '3d' : '2d');
    return handle;
  }
  if (!cssDone) {
    cssDone = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  let last = '2d';
  try {
    last = localStorage.getItem(MODE_KEY) || '2d';
  } catch {
    /* */
  }
  const gl = webglOk();
  const weak = detectInitialTier() <= 1;
  pick = document.createElement('div');
  pick.className = 'dz-pick';
  pick.innerHTML = `
    <h2>${t('dz.name', 'Sobreviva aos Desastres')}</h2>
    <div class="row">
      <button class="m d2${last === '2d' ? ' last' : ''}" data-m="2d"><b>2D</b>${dzIcon('house', 54)}<small>${t('dz.mode2dD', 'Leve, roda em qualquer celular')}</small></button>
      <button class="m d3${last === '3d' ? ' last' : ''}" data-m="3d"${gl ? '' : ' disabled'}><b>3D</b>${dzIcon('tornado', 54)}<small>${!gl ? t('dz.no3dShort', 'Indisponível neste aparelho') : weak ? t('dz.mode3dWeak', 'Pode ficar lento neste aparelho') : t('dz.mode3dD', 'Ilha 3D com física de verdade')}</small></button>
    </div>
    <div class="dif" role="radiogroup" aria-label="${t('dz.diff', 'Dificuldade')}">
      <button data-d="facil">${t('dz.diff.easy', 'Fácil')}</button><button data-d="normal">${t('dz.diff.normal', 'Normal')}</button><button data-d="dificil">${t('dz.diff.hard', 'Difícil')}</button>
    </div>
    <div class="bot"><button class="ped">${dzIcon('book', 30)}<span>${t('dz.pedia', 'Desastrepédia')} <small>${pediaCount().seen}/${pediaCount().total}</small></span></button>
    <button class="out">${icon('home', { size: 22 })}${t('dz.exit', 'Sair')}</button></div>`;
  root.appendChild(pick);
  // dificuldade (lembrada; vale no 2D e no 3D — docs/DISASTER-DESIGN.md §3)
  const paint = (m: DzMode) => pick!.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) => {
    b.classList.toggle('on', b.dataset.d === m);
    b.setAttribute('aria-pressed', String(b.dataset.d === m));
  });
  paint(loadMode());
  pick.querySelectorAll<HTMLButtonElement>('[data-d]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.click();
      try {
        localStorage.setItem(DIFF_KEY, b.dataset.d || 'normal');
      } catch {
        /* */
      }
      paint(loadMode());
    }),
  );
  pick.querySelectorAll<HTMLButtonElement>('[data-m]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      void start(b.dataset.m === '3d' && gl ? '3d' : '2d');
    }),
  );
  pick.querySelector('.ped')!.addEventListener('click', () => {
    audio.click();
    openPedia(root, () => {
      const c = pediaCount();
      const sm = pick?.querySelector('.ped small');
      if (sm) sm.textContent = c.seen + '/' + c.total;
    });
  });
  pick.querySelector('.out')!.addEventListener('click', () => {
    audio.click();
    exit();
  });
  return handle;
}
