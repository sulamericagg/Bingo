/* ============================================================
 *  BLOOP PINK — minigames da mesa de embalagem (Fábrica).
 *  MONTAR: a caixa vem planificada; toque nas 4 abas para dobrar (fundo) e ela fica de pé.
 *  FITA: arraste o dedo pela linha da fita de ponta a ponta; depois cole a etiqueta.
 * ============================================================ */
import { t } from '../../i18n';
import { sfx } from '../../audio';
import { ic } from './icons';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function boxGame(host: { panel(h: string): HTMLDivElement; closePanel(): void }, kind: 'fold' | 'tape', done: (ok: boolean) => void): void {
  if (kind === 'fold') {
    const d = host.panel(`<div class="pk-box fold"><h2>${ic('box', 30)}${esc(t('pink.bx.fold', 'Monte a caixa!'))}</h2>
      <div class="ask">${ic('hand', 22)}${esc(t('pink.bx.foldHelp', 'Toque nas 4 abas para dobrar'))}</div>
      <div class="flat"><i class="mid"></i>${['t', 'r', 'b', 'l'].map((s) => `<i class="flap ${s}" data-s="${s}"></i>`).join('')}</div>
      <div class="pk-row"><button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
    const left = new Set(['t', 'r', 'b', 'l']);
    d.querySelectorAll<HTMLElement>('.flap').forEach((f) =>
      f.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const s = f.dataset.s!;
        if (!left.has(s)) return;
        left.delete(s);
        f.classList.add('up');
        sfx.play('fold');
        if (!left.size) {
          d.querySelector('.flat')!.classList.add('done');
          sfx.play('sparkle');
          window.setTimeout(() => {
            host.closePanel();
            done(true);
          }, 450);
        }
      }),
    );
    d.querySelector('[data-a=x]')!.addEventListener('click', () => {
      host.closePanel();
      done(false);
    });
    return;
  }
  const d = host.panel(`<div class="pk-box tape"><h2>${ic('tape', 30)}${esc(t('pink.bx.tape', 'Feche com fita!'))}</h2>
    <div class="ask">${ic('hand', 22)}<span class="msg">${esc(t('pink.bx.tapeHelp', 'Arraste o dedo pela linha da fita'))}</span></div>
    <div class="lid"><i class="seam"></i><i class="strip"></i><i class="roll"></i><i class="label" hidden></i></div>
    <div class="pk-row"><button class="pk-b w" data-a="x">${ic('close', 22)}</button></div></div>`);
  const lid = d.querySelector('.lid') as HTMLElement;
  const strip = d.querySelector('.strip') as HTMLElement;
  const roll = d.querySelector('.roll') as HTMLElement;
  const label = d.querySelector('.label') as HTMLElement;
  let k = 0;
  let stage: 'tape' | 'label' | 'done' = 'tape';
  let lastSnd = 0;
  const move = (e: PointerEvent) => {
    if (stage !== 'tape') return;
    if (e.type === 'pointermove' && !(e.buttons || e.pointerType === 'touch')) return;
    const r = lid.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (Math.abs(y - 0.5) > 0.3) return;
    // só avança na ordem (da esquerda para a direita)
    if (x > k && x < k + 0.25) k = Math.min(1, x);
    strip.style.width = k * 100 + '%';
    roll.style.left = k * 100 + '%';
    const now = performance.now();
    if (now - lastSnd > 90) {
      lastSnd = now;
      sfx.play('tape', { db: -6, rate: 0.9 + k * 0.4 });
    }
    if (k > 0.95) {
      stage = 'label';
      strip.style.width = '100%';
      roll.hidden = true;
      label.hidden = false;
      (d.querySelector('.msg') as HTMLElement).textContent = t('pink.bx.label', 'Agora cole a etiqueta!');
      sfx.play('sparkle');
    }
  };
  lid.addEventListener('pointermove', move);
  lid.addEventListener('pointerdown', move);
  label.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (stage !== 'label') return;
    stage = 'done';
    label.classList.add('on');
    sfx.play('stamp');
    window.setTimeout(() => {
      host.closePanel();
      done(true);
    }, 450);
  });
  d.querySelector('[data-a=x]')!.addEventListener('click', () => {
    host.closePanel();
    done(false);
  });
}
