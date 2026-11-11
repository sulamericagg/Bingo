/* ============================================================
 *  FÁBRICA ESTELAR — entrada do jogo (carregada sob demanda).
 *  Saguão: Partida versus | Minha Fábrica.
 * ============================================================ */
import { tycoonIntro } from './intro';
import { audio } from '../../core/audio';
import { QualityGovernor } from '../../core/quality';
import type { MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { icon } from '../../ui/icons';
import { startIdle } from './idle';
import { startMatch } from './match';
import { drawTycoonShowcase } from './register';
import { idlePending, persistTycoon, tycoonSave } from './save';
import { injectTycoonCss } from './style';

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
    const el = document.createElement('div');
    el.className = 'ty-root';
    const bg = document.createElement('canvas');
    bg.className = 'ty-cv';
    el.appendChild(bg);
    const ov = document.createElement('div');
    ov.className = 'ty-ov';
    ov.style.background = 'linear-gradient(rgba(15,90,58,.0),rgba(20,8,50,.85) 55%)';
    ov.style.justifyContent = 'flex-end';
    ov.style.paddingBottom = 'calc(env(safe-area-inset-bottom,0px) + 22px)';
    const pend = idlePending();
    const diffs = [t('tycoon.diff0', 'Tranquilo'), t('tycoon.diff1', 'Normal'), t('tycoon.diff2', 'Desafio')];
    ov.innerHTML = `
      <div class="ty-title">${t('tycoon.name', 'Fábrica Estelar')}</div>
      <div class="ty-sub">${t('tycoon.lobbySub', 'Construa máquinas, polidores e esteiras. Quem tiver mais estrelas no fim (ou lançar o Foguete TURBO primeiro) vence!')}</div>
      <div class="ty-card">
        <button class="ty-btn ty-green ty-big" data-a="match">${icon('play', { size: 26 })}${t('tycoon.playMatch', 'Partida contra 3')}</button>
        <div class="ty-seg">${diffs.map((d, i) => `<button class="ty-btn${i === ts.diff ? ' on' : ''}" data-d="${i}">${d}</button>`).join('')}</div>
        <button class="ty-btn ty-gold ty-big" data-a="idle">${icon('coins', { size: 26 })}${t('tycoon.myFactory', 'Minha Fábrica')}${pend > 0 ? `<span class="ty-badge">+${fmt(pend)}</span>` : ''}</button>
        <div class="ty-sub" style="font-size:13px">${icon('trophy', { size: 18 })} ${t('tycoon.stats', 'Vitórias: {w} · Partidas: {m}', { w: ts.wins, m: ts.matches })}</div>
      </div>
      <button class="ty-btn" data-a="exit">${icon('home', { size: 22 })}${t('tycoon.exit', 'Sair')}</button>`;
    el.appendChild(ov);
    root.appendChild(el);
    // vitrine animada no topo
    const ctx = bg.getContext('2d')!;
    let raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => {
      bg.width = Math.round(el.clientWidth * dpr);
      bg.height = Math.round(el.clientHeight * dpr);
      bg.style.width = el.clientWidth + 'px';
      bg.style.height = el.clientHeight + 'px';
    };
    fit();
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      const g = ctx.createLinearGradient(0, 0, 0, bg.height);
      g.addColorStop(0, '#0f5a3a');
      g.addColorStop(1, '#20104a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, bg.width, bg.height);
      const h = Math.min(bg.height * 0.42, bg.width * 0.75);
      drawTycoonShowcase(ctx, bg.width, h, ms / 1000);
    };
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', fit);
    const close = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', fit);
      el.remove();
      lobby = null;
    };
    lobby = close;
    ov.querySelectorAll<HTMLElement>('[data-d]').forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        ts.diff = Number(b.dataset.d);
        persistTycoon();
        ov.querySelectorAll('[data-d]').forEach((o) => o.classList.toggle('on', o === b));
      }),
    );
    ov.querySelector('[data-a=match]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      close();
      playMatch();
    });
    ov.querySelector('[data-a=idle]')!.addEventListener('click', () => {
      audio.unlock();
      audio.click();
      close();
      void tycoonIntro.once(root).then(() => {
        if (!dead) child = startIdle(root, showLobby, quality);
      });
    });
    ov.querySelector('[data-a=exit]')!.addEventListener('click', () => {
      audio.click();
      handle.destroy();
      exit();
    });
  }

  function playMatch(): void {
    // abertura (1ª partida): src/games/tycoon/intro
    if (tycoonIntro.due()) {
      void tycoonIntro.once(root).then(() => {
        if (!dead) playMatch();
      });
      return;
    }
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
