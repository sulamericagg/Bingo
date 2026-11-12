/* ============================================================
 *  FÁBRICA ESTELAR — entrada do jogo (carregada sob demanda).
 *  Saguão: Partida versus | Minha Fábrica.
 * ============================================================ */
import { QualityGovernor } from '../../core/quality';
import type { MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { icon } from '../../ui/icons';
import { startIdle } from './idle';
import { startMatch } from './match';
import { drawTycoonShowcase } from './register';
import { idlePending, persistTycoon, tycoonSave } from './save';
import { injectTycoonCss } from './style';
import { openStartMenu } from '../../ui/startmenu';
import { tycoonIntro } from './intro';

export function launchTycoon(root: HTMLElement, exit: () => void): MiniGameHandle {
  injectTycoonCss();
  const quality = new QualityGovernor({});
  let child: MiniGameHandle | null = null;
  let inMatch = false;
  let lobby: (() => void) | null = null;
  let dead = false;

  const qs = new URLSearchParams(location.search);
  const auto = qs.get('tymode'); // depuração: ?debug&tymode=match|idle

  function showLobby(): void {
    child = null;
    inMatch = false;
    const ts = tycoonSave();
    const pend = idlePending();
    const diffs = [t('tycoon.diff0', 'Tranquilo'), t('tycoon.diff1', 'Normal'), t('tycoon.diff2', 'Desafio')];
    const sm = openStartMenu(root, {
      game: 'tycoon',
      stage: (x, w, h, tm) => drawTycoonShowcase(x, w, h, tm),
      chips: [{ icon: icon('trophy', { size: 20 }), text: String(ts.wins) }],
      onBack: () => {
        handle.destroy();
        exit();
      },
      build: (p) => {
        p.faces(
          diffs.map((n, i) => ({ id: i, level: i, label: n })),
          ts.diff,
          (v) => {
            ts.diff = +v;
            persistTycoon();
          },
        );
        p.play({ sub: t('tycoon.playMatch', 'Partida contra 3'), onTap: () => {
          close();
          playMatch();
        } });
        p.cards([{ id: 'idle', icon: icon('coins', { size: 44 }), label: t('tycoon.myFactory', 'Minha Fábrica'), badge: pend > 0 ? '+' + fmt(pend) : undefined, color: '#ffe08a', onTap: () => {
          close();
          // abertura (docs/INTROS.md): fábrica nova (ainda não inaugurada) toca sempre
          void (tycoonSave().last ? tycoonIntro.once(root) : tycoonIntro.fresh(root)).then(() => {
            if (!dead) child = startIdle(root, showLobby, quality);
          });
        } }], { size: 'wide' });
        p.friends({ game: 'tycoon' });
      },
    });
    const close = () => {
      sm.destroy();
      lobby = null;
    };
    lobby = close;
  }

  function playMatch(): void {
    inMatch = true;
    child = startMatch(root, { diff: tycoonSave().diff, onExit: showLobby, onAgain: playMatch }, quality);
  }

  const handle: MiniGameHandle = {
    destroy() {
      if (dead) return;
      dead = true;
      lobby?.();
      child?.destroy();
      child = null;
    },
    pause: () => child?.pause?.(),
    resume: () => child?.resume?.(),
    inMatch: () => inMatch && !!child,
  };

  if (auto === 'match' && qs.has('debug')) playMatch();
  else if (auto === 'idle' && qs.has('debug')) child = startIdle(root, showLobby, quality);
  else showLobby();
  return handle;
}
