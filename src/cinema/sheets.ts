/* ============================================================
 *  BLOOP CINEMA — folhas (bottom sheets): menu simples, confirmar,
 *  escolher elenco, gravar voz.
 * ============================================================ */
import { pushBack } from '../core/back';
import { fmtDec, t } from '../i18n';
import { save } from '../core/storage';
import { profile } from '../services/profile';
import { ownedCreatures } from '../creatures/state';
import { creatureById } from '../creatures/catalog';
import { esc } from '../ui/dom';
import { bindButton } from '../ui/touch';
import { clone, MAX_CAST, uid, type CastMember } from './format';
import { PRESETS } from './data';
import { actorThumb } from './rig2d';
import { MicRecorder, MAX_REC_SEC, type MicError } from './audio';

export function sheet(html: string, onClick: (a: string, el: HTMLElement, close: () => void) => void, onClose?: () => void): { el: HTMLElement; close: () => void } {
  const bg = document.createElement('div');
  bg.className = 'cin-sheet-bg';
  bg.innerHTML = `<div class="cin-sheet" role="dialog" aria-modal="true">${html}</div>`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    pop();
    bg.remove();
    onClose?.();
  };
  const pop = pushBack(close);
  const born = performance.now();
  bg.addEventListener('click', (e) => {
    // ignora o "clique fantasma" do toque que abriu a folha
    if (performance.now() - born < 450) return;
    if (e.target === bg) return close();
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (b) onClick(b.dataset.a!, b, close);
  });
  document.body.appendChild(bg);
  return { el: bg.querySelector('.cin-sheet')!, close };
}

export function menu(title: string, items: [id: string, label: string, cls?: string][]): Promise<string | null> {
  return new Promise((res) => {
    let picked: string | null = null;
    sheet(
      `<h3>${esc(title)}</h3><div class="cin-menu">${items.map(([id, l, c]) => `<button class="cin-btn ${c ?? ''}" data-a="${id}">${l}</button>`).join('')}<button class="cin-btn ghost" data-a="__x">${t('cin.cancel', 'Cancelar')}</button></div>`,
      (a, _el, close) => {
        picked = a === '__x' ? null : a;
        close();
      },
      () => res(picked),
    );
  });
}

export async function confirm(title: string, ok: string): Promise<boolean> {
  return (await menu(title, [['ok', ok, 'warn']])) === 'ok';
}

/* ---------------------------- escolher elenco ---------------------------- */
export function youCast(): CastMember {
  return { id: uid('c'), name: (profile.nick || t('cin.you', 'Você')).slice(0, 14), kind: 'avatar', avatar: clone(save.avatar), voice: 'normal' };
}

export function pickCast(count: number): Promise<CastMember | null> {
  return new Promise((res) => {
    let out: CastMember | null = null;
    const full = count >= MAX_CAST;
    const you = youCast();
    const cands: CastMember[] = [you, ...PRESETS.map((p) => ({ id: uid('c'), name: p.name, kind: 'avatar' as const, avatar: clone(p.av), voice: 'normal' as const }))];
    const cre = ownedCreatures()
      .slice(0, 30)
      .map((id) => ({ id: uid('c'), name: (creatureById(id)?.name ?? 'Bichinho').slice(0, 14), kind: 'creature' as const, creature: id, voice: 'chipmunk' as const }));
    const all = [...cands, ...cre];
    const s = sheet(
      `<h3>${t('cin.cast.pick', 'Quem entra no filme?')}</h3>
       ${full ? `<p class="cin-hint">${t('cin.cast.full', 'Máximo de 8 personagens por filme.')}</p>` : ''}
       <h5>${t('cin.cast.bloops', 'Bloops')}</h5><div class="cin-pick" data-g="a"></div>
       ${cre.length ? `<h5>${t('cin.cast.creatures', 'Seus bichinhos')}</h5><div class="cin-pick" data-g="c"></div>` : `<p class="cin-hint">${t('cin.cast.noCre', 'Bichinhos que você coletar também podem atuar!')}</p>`}
       <button class="cin-btn ghost" data-a="__x" style="width:100%;margin-top:10px">${t('cin.cancel', 'Cancelar')}</button>`,
      (a, _el, close) => {
        if (a === '__x') return close();
        const c = all.find((x) => x.id === a);
        if (c && !full) {
          out = c;
          close();
        }
      },
      () => res(out),
    );
    const fill = (g: string, list: CastMember[]) => {
      const host = s.el.querySelector<HTMLElement>(`[data-g="${g}"]`);
      if (!host) return;
      for (const c of list) {
        const b = document.createElement('button');
        b.dataset.a = c.id;
        b.disabled = full;
        b.appendChild(actorThumb(c, 64, 'stand', 'happy'));
        const sp = document.createElement('span');
        sp.textContent = c.name;
        b.appendChild(sp);
        host.appendChild(b);
      }
    };
    fill('a', cands);
    fill('c', cre);
  });
}

/* ---------------------------- gravar voz ---------------------------- */
export function recordSheet(): Promise<Awaited<ReturnType<MicRecorder['stop']>> | MicError | null> {
  return new Promise((res) => {
    const rec = new MicRecorder();
    let result: Awaited<ReturnType<MicRecorder['stop']>> | MicError | null = null;
    let raf = 0;
    let stopping = false;
    const bars = Array.from({ length: 15 }, () => '<i></i>').join('');
    const s = sheet(
      `<h3><span class="cin-recdot"></span> ${t('cin.rec.title', 'Gravando...')}</h3>
       <div class="cin-recmeter">${bars}</div>
       <p class="cin-hint" data-r="time">0,0 s / ${MAX_REC_SEC} s</p>
       <p class="cin-hint">${t('cin.rec.privacy', 'A gravação fica só neste aparelho.')}</p>
       <div class="cin-row c" style="margin-top:8px"><button class="cin-btn pri" data-a="stop">■ ${t('cin.rec.stop', 'Parar')}</button><button class="cin-btn ghost" data-a="x">${t('cin.cancel', 'Cancelar')}</button></div>`,
      async (a, _el, close) => {
        if (a === 'stop') await stop(close);
        else close();
      },
      () => {
        cancelAnimationFrame(raf);
        if (!stopping) rec.cancel();
        res(result);
      },
    );
    const stop = async (close: () => void) => {
      if (stopping) return;
      stopping = true;
      cancelAnimationFrame(raf);
      result = await rec.stop();
      close();
    };
    rec.onAutoStop = () => void stop(s.close);
    const bi = s.el.querySelectorAll<HTMLElement>('.cin-recmeter i');
    const tm = s.el.querySelector<HTMLElement>('[data-r="time"]')!;
    const hist: number[] = new Array(bi.length).fill(0);
    rec.start().then((err) => {
      if (err) {
        result = err;
        stopping = true;
        s.close();
        return;
      }
      const loop = () => {
        hist.push(rec.level());
        hist.shift();
        bi.forEach((b, i) => (b.style.height = `${8 + hist[i] * 56}px`));
        tm.textContent = `${fmtDec(rec.elapsed())} s / ${MAX_REC_SEC} s`;
        raf = requestAnimationFrame(loop);
      };
      loop();
    });
    const stopBtn = s.el.querySelector<HTMLElement>('[data-a="stop"]');
    if (stopBtn) bindButton(stopBtn, { haptic: 'light' });
  });
}
