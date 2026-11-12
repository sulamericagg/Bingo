/* ============================================================
 *  Escolha 2D / 3D do "Sobreviva aos Desastres" (como Floresta/Cozinha).
 *  O handle devolvido ao hub delega para o jogo escolhido.
 * ============================================================ */
import type { MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { detectInitialTier } from '../../core/quality';
import { dzIcon } from './icons';
import { partyRoomFor } from '../../party/contract';
import { loadMode, MODE_KEY as DIFF_KEY, type DzMode } from './tuning';
import { openPedia, pediaCount } from './roulette';
import { openStartMenu } from '../../ui/startmenu';

const MODE_KEY = 'bo-disaster-mode';


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
  let last: '2d' | '3d' = '2d';
  try {
    last = localStorage.getItem(MODE_KEY) === '3d' ? '3d' : '2d';
  } catch {
    /* */
  }
  const gl = webglOk();
  const weak = detectInitialTier() <= 1;
  if (!gl) last = '2d';
  const diffs: DzMode[] = ['facil', 'normal', 'dificil'];
  const sm = openStartMenu(root, {
    game: 'disaster',
    onBack: () => exit(),
    build: (p) => {
      p.cards([
        { id: '2d', icon: dzIcon('house', 60), label: '2D', say: t('dz.mode2dD', 'Leve, roda em qualquer celular'), color: '#ffe08a', sel: last === '2d', onTap: () => ((last = '2d'), p.refresh()) },
        { id: '3d', icon: dzIcon('tornado', 60), label: '3D', say: t('dz.mode3dD', 'Ilha 3D com física de verdade'), sub: !gl ? t('dz.no3dShort', 'Indisponível neste aparelho') : weak ? t('dz.mode3dWeakS', 'Pode pesar') : '', color: '#9be0ff', sel: last === '3d', disabled: !gl, onTap: () => ((last = '3d'), p.refresh()) },
      ]);
      // dificuldade (lembrada; vale no 2D e no 3D — docs/DISASTER-DESIGN.md §3)
      p.faces(
        [t('dz.diff.easy', 'Fácil'), t('dz.diff.normal', 'Normal'), t('dz.diff.hard', 'Difícil')].map((n, k) => ({ id: diffs[k], level: k, label: n })),
        loadMode(),
        (v) => {
          try {
            localStorage.setItem(DIFF_KEY, String(v));
          } catch {
            /* */
          }
        },
      );
      p.play({ sub: last.toUpperCase(), onTap: () => void start(last === '3d' && gl ? '3d' : '2d') });
      p.friends({ game: 'disaster' });
      const c = pediaCount();
      p.cards([{ id: 'ped', icon: dzIcon('book', 40), label: t('dz.pedia', 'Desastrepédia'), sub: `${c.seen}/${c.total}`, color: '#bfe8ff', onTap: () => openPedia(root, () => sm.refresh()) }], { size: 'small', cols: 1 });
    },
  });
  pick = sm.el;
  return handle;
}
