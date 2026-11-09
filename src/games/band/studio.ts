/* ============================================================
 *  ESTÚDIO — crie sua música (até 2 min) e toque como desafio.
 *  Sequenciador de bateria (16 passos), grade de notas com escala
 *  travada (sem nota errada), progressões prontas, andamento,
 *  seções (Verso/Refrão/Ponte), prévia e código para compartilhar.
 *  Limite: 2 criações por dia (ilimitado com Passe/Clube; +1 com gemas).
 * ============================================================ */
import { t } from '../../i18n';
import { tap, success } from '../../core/haptics';
import { spend } from '../../core/economy';
import { save } from '../../core/storage';
import { clubActive } from '../../services/ads';
import { esc } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { BandGame } from './game';
import { bandIcon, type BandIcon } from './icons';
import {
  arrangementSong,
  arrDuration,
  decodeArrangement,
  DR_CLAP,
  DR_HAT,
  DR_KICK,
  DR_SNARE,
  encodeArrangement,
  HOLD,
  maxSections,
  newArrangement,
  PART_KEY,
  ROWS,
  STEPS,
  toScore,
  type Arrangement,
  type Pattern,
} from './arrange';
import { ScorePlayer } from './synth';
import { bs, FREE_PER_DAY, madeToday, noteMade, persistBand } from './save';
import { refreshCreations, songById } from './songs';
import type { Instrument } from './model';
import { instName } from './model';

const GEM_SLOT = 20;
const INST_ICON: Record<Instrument, BandIcon> = { drums: 'drums', bass: 'bass', guitar: 'guitar', keys: 'keys', vocals: 'vocals' };
const PAT_COLORS = ['#ff8a3d', '#a974ff', '#3ddc97'];

let passPremium = false;
async function loadPremium(): Promise<void> {
  try {
    const mods = import.meta.glob('../../pass/register.ts');
    const load = Object.values(mods)[0];
    if (load) {
      const m = (await load()) as { isPremium?: () => boolean };
      passPremium = !!m.isPremium?.();
    }
  } catch {
    passPremium = false;
  }
}
const premium = (): boolean => passPremium || clubActive();
export const canCreate = (): boolean => premium() || madeToday() < FREE_PER_DAY + bs.extraSlots;

const patName = (i: number): string => (i === 0 ? t('band.st.verse', 'Verso') : i === 1 ? t('band.st.chorus', 'Refrão') : t('band.st.bridge', 'Ponte'));
const scaleNames = (): string[] => [t('band.st.sc0', 'Alegre'), t('band.st.sc1', 'Misteriosa'), t('band.st.sc2', 'Cantiga'), t('band.st.sc3', 'Blues')];
const progNames = (): string[] => [t('band.st.p0', 'Feliz'), t('band.st.p1', 'Rockzinho'), t('band.st.p2', 'Emoção'), t('band.st.p3', 'Clássico'), t('band.st.p4', 'Aventura'), t('band.st.p5', 'Festa')];
const stageNames = (): string[] => [
  t('band.stage.garagem', 'Garagem'),
  t('band.stage.arena', 'Arena'),
  t('band.stage.praia', 'Praia'),
  t('band.stage.espaco', 'Espaço'),
  t('band.stage.junina', 'Festa Junina'),
  t('band.stage.neon', 'Neon'),
  t('band.stage.floresta', 'Floresta'),
  t('band.stage.castelo', 'Castelo'),
  t('band.stage.vulcao', 'Vulcão'),
  t('band.stage.mar', 'Fundo do Mar'),
];
const drumRows = (): string[] => [t('band.st.kick', 'Bumbo'), t('band.st.snare', 'Caixa'), t('band.st.hat', 'Chimbal'), t('band.st.clap', 'Palmas')];
const DR_BITS = [DR_KICK, DR_SNARE, DR_HAT, DR_CLAP];

export function openStudio(g: BandGame, el: HTMLElement, done: () => void): () => void {
  let arr: Arrangement | null = null;
  let editId = '';
  let pat = 0;
  let inst: Instrument = 'drums';
  let stretch = false;
  let player: ScorePlayer | null = null;
  let playMode: '' | 'loop' | 'song' = '';
  let raf = 0;
  let closed = false;
  loadPremium().then(() => !arr && !closed && list());

  const toast = (m: string) => g.screens.toast(m);
  const stop = () => {
    player?.dispose();
    player = null;
    playMode = '';
    cancelAnimationFrame(raf);
    el.querySelectorAll('.bb-cell.ph').forEach((c) => c.classList.remove('ph'));
    const pb = el.querySelector('.bb-st-play');
    if (pb) pb.classList.remove('on');
  };

  /* ------------------------------ lista ------------------------------ */

  function list(): void {
    stop();
    arr = null;
    const left = premium() ? -1 : Math.max(0, FREE_PER_DAY + bs.extraSlots - madeToday());
    el.innerHTML = `
      <div class="bb-top"><button class="bb-btn bb-back">${bandIcon('back', 24)}</button><h2>${esc(t('band.studio', 'Estúdio'))}</h2></div>
      <div class="bb-studio">
        <div class="bb-st-head">
          <button class="bb-big bb-play" data-a="new">${bandIcon('plus', 28)}<span>${esc(t('band.st.new', 'Nova música'))}</span></button>
          <div class="bb-st-limit">${left < 0 ? esc(t('band.st.unlimited', 'Criações ilimitadas (Passe/Clube)')) : esc(t('band.st.left', 'Hoje: {n} criação(ões) restante(s)', { n: left }))}</div>
          ${left === 0 ? `<button class="bb-mid" data-a="slot">${icon('gem', { size: 20 })}<span>${esc(t('band.st.buySlot', '+1 música por {n} gemas', { n: GEM_SLOT }))}</span></button>` : ''}
          <div class="bb-st-import"><input placeholder="${esc(t('band.st.code', 'Código de um amigo (BB1…)'))}"/><button class="bb-mid" data-a="import">${bandIcon('import', 22)}<span>${esc(t('band.st.import', 'Importar'))}</span></button></div>
        </div>
        <div class="bb-lab">${esc(t('band.st.mine', 'Minhas músicas'))}</div>
        <div class="bb-st-list">${
          bs.creations.length
            ? bs.creations
                .slice()
                .reverse()
                .map((c) => {
                  const a = decodeArrangement(c.code);
                  if (!a) return '';
                  const d = Math.round(arrDuration(a));
                  return `<div class="bb-st-item" data-id="${esc(c.id)}"><span class="bb-sinfo"><b>${esc(a.title || t('band.st.untitled', 'Sem nome'))}</b><small>${a.bpm} BPM · ${Math.floor(d / 60)}:${String(d % 60).padStart(2, '0')} · ${esc(stageNames()[a.stage] ?? '')}</small></span>
                  <button class="bb-ibtn" data-a="play" aria-label="${esc(t('band.play', 'Tocar'))}">${bandIcon('play', 22)}</button>
                  <button class="bb-ibtn" data-a="edit" aria-label="${esc(t('band.st.edit', 'Editar'))}">${bandIcon('brush', 22)}</button>
                  <button class="bb-ibtn" data-a="share" aria-label="${esc(t('band.st.share', 'Compartilhar'))}">${bandIcon('share', 22)}</button>
                  <button class="bb-ibtn" data-a="del" aria-label="${esc(t('band.st.del', 'Apagar'))}">${bandIcon('trash', 22)}</button></div>`;
                })
                .join('')
            : `<div class="bb-empty">${esc(t('band.st.none', 'Você ainda não criou nenhuma música. Que tal agora?'))}</div>`
        }</div>
      </div>`;
    el.querySelector<HTMLButtonElement>('.bb-back')!.onclick = () => {
      tap('light');
      done();
    };
    el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const a = b.dataset.a!;
          const id = b.closest<HTMLElement>('.bb-st-item')?.dataset.id ?? '';
          const cr = bs.creations.find((c) => c.id === id);
          if (a === 'new') {
            if (!canCreate()) return toast(t('band.st.limit', 'Limite de hoje atingido. Volte amanhã, use gemas ou o Passe!'));
            editId = '';
            edit(newArrangement());
          } else if (a === 'slot') {
            if (!spend({ gems: GEM_SLOT })) return toast(t('band.noMoney', 'Moedas/gemas insuficientes'));
            bs.extraSlots++;
            persistBand();
            success();
            list();
          } else if (a === 'import') {
            const inp = el.querySelector<HTMLInputElement>('.bb-st-import input')!;
            const dec = decodeArrangement(inp.value);
            if (!dec) return toast(t('band.st.badCode', 'Código inválido'));
            bs.creations.push({ id: 'my-' + Date.now().toString(36), code: encodeArrangement(dec), at: Date.now() });
            persistBand();
            refreshCreations();
            success();
            toast(t('band.st.imported', 'Música importada!'));
            list();
          } else if (cr && a === 'play') playCreation(cr.id);
          else if (cr && a === 'edit') {
            const dec = decodeArrangement(cr.code);
            if (dec) {
              editId = cr.id;
              edit(dec);
            }
          } else if (cr && a === 'share') shareCode(cr.code);
          else if (cr && a === 'del') {
            if (!b.classList.contains('confirm')) {
              b.classList.add('confirm');
              toast(t('band.st.delConfirm', 'Toque de novo para apagar'));
              return;
            }
            bs.creations = bs.creations.filter((c) => c.id !== cr.id);
            persistBand();
            refreshCreations();
            list();
          }
        }),
    );
  }

  function shareCode(code: string): void {
    try {
      navigator.clipboard?.writeText(code).then(
        () => toast(t('band.st.copied', 'Código copiado! Mande para um amigo.')),
        () => toast(code),
      );
    } catch {
      toast(code);
    }
    const nav = navigator as Navigator & { share?: (d: { text: string; title?: string }) => Promise<void> };
    if (nav.share) nav.share({ title: t('band.name', 'Bloop Banda'), text: t('band.st.shareText', 'Toque minha música na Bloop Banda! Código: {c}', { c: code }) }).catch(() => {});
  }

  function playCreation(id: string): void {
    stop();
    refreshCreations();
    const s = songById(id);
    if (!s) return;
    g.screens.playSolo(s);
  }

  /* ------------------------------ editor ------------------------------ */

  function edit(a: Arrangement): void {
    stop();
    arr = a;
    pat = 0;
    inst = 'drums';
    renderEditor();
  }

  function renderEditor(): void {
    const a = arr!;
    const maxS = maxSections(a.bpm);
    const dur = Math.round(arrDuration(a));
    el.innerHTML = `
      <div class="bb-top"><button class="bb-btn bb-back">${bandIcon('back', 24)}</button><input class="bb-st-title" maxlength="24" placeholder="${esc(t('band.st.titlePh', 'Nome da música'))}" value="${esc(a.title)}"/><button class="bb-mid bb-st-save">${icon('check', { size: 22 })}<span>${esc(t('band.st.save', 'Salvar'))}</span></button></div>
      <div class="bb-studio bb-ed">
        <div class="bb-ed-row"><label>${esc(t('band.st.tempo', 'Ritmo'))} <b class="bb-bpm">${a.bpm}</b></label><input type="range" class="bb-tempo" min="70" max="180" step="2" value="${a.bpm}"/></div>
        <div class="bb-chips bb-scroll" data-g="scale">${scaleNames().map((n, i) => `<button class="bb-chip ${a.scale === i ? 'on' : ''}" data-v="${i}">${esc(n)}</button>`).join('')}</div>
        <div class="bb-chips bb-scroll" data-g="prog">${progNames().map((n, i) => `<button class="bb-chip ${a.prog === i ? 'on' : ''}" data-v="${i}">${esc(n)}</button>`).join('')}</div>
        <div class="bb-chips bb-scroll" data-g="stage">${stageNames().map((n, i) => `<button class="bb-chip ${a.stage === i ? 'on' : ''}" data-v="${i}">${esc(n)}</button>`).join('')}</div>
        <div class="bb-pats">${[0, 1, 2].map((i) => `<button class="bb-pat ${pat === i ? 'on' : ''}" data-p="${i}" style="--c:${PAT_COLORS[i]}"><b>${'ABC'[i]}</b>${esc(patName(i))}</button>`).join('')}</div>
        <div class="bb-insts small">${(['drums', 'bass', 'guitar', 'keys', 'vocals'] as Instrument[]).map((i) => `<button class="bb-inst ${i === inst ? 'on' : ''}" data-i="${i}" aria-label="${esc(instName(i))}">${bandIcon(INST_ICON[i], 22)}</button>`).join('')}</div>
        <div class="bb-ed-tools">
          <span class="bb-ed-inst">${esc(instName(inst))}</span>
          ${inst !== 'drums' ? `<button class="bb-chip ${stretch ? '' : 'on'}" data-t="note">${bandIcon('note', 16)} ${esc(t('band.st.toolNote', 'Nota'))}</button><button class="bb-chip ${stretch ? 'on' : ''}" data-t="stretch">${bandIcon('stretch', 16)} ${esc(t('band.st.toolStretch', 'Esticar'))}</button>` : ''}
          <button class="bb-chip" data-t="clear">${bandIcon('trash', 16)} ${esc(t('band.st.clear', 'Limpar'))}</button>
        </div>
        <div class="bb-gridwrap"><div class="bb-sgrid"></div></div>
        <div class="bb-lab">${esc(t('band.st.arrange', 'Sequência da música'))} <small>${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')} / 2:00</small></div>
        <div class="bb-arr">${a.secs.map((p, i) => `<button class="bb-sec" data-s="${i}" style="--c:${PAT_COLORS[p]}">${'ABC'[p]}</button>`).join('')}${a.secs.length < maxS ? `<button class="bb-sec add" data-s="add">${bandIcon('plus', 18)}</button>` : ''}${a.secs.length > 1 ? `<button class="bb-sec rm" data-s="rm">${bandIcon('trash', 18)}</button>` : ''}</div>
        <div class="bb-ed-play">
          <button class="bb-mid bb-st-play" data-pl="loop">${bandIcon('play', 22)}<span>${esc(t('band.st.loop', 'Ouvir trecho'))}</span></button>
          <button class="bb-mid" data-pl="song">${bandIcon('note', 22)}<span>${esc(t('band.st.whole', 'Ouvir tudo'))}</span></button>
        </div>
      </div>`;
    renderGrid();
    const title = el.querySelector<HTMLInputElement>('.bb-st-title')!;
    title.oninput = () => (a.title = title.value.slice(0, 24));
    el.querySelector<HTMLButtonElement>('.bb-back')!.onclick = () => {
      tap('light');
      list();
    };
    el.querySelector<HTMLButtonElement>('.bb-st-save')!.onclick = () => saveArr();
    const tempo = el.querySelector<HTMLInputElement>('.bb-tempo')!;
    tempo.oninput = () => {
      a.bpm = Number(tempo.value);
      el.querySelector('.bb-bpm')!.textContent = String(a.bpm);
    };
    tempo.onchange = () => {
      a.secs = a.secs.slice(0, maxSections(a.bpm));
      renderEditor();
    };
    el.querySelectorAll<HTMLElement>('[data-g]').forEach((grp) =>
      grp.querySelectorAll<HTMLButtonElement>('.bb-chip').forEach(
        (b) =>
          (b.onclick = () => {
            tap('light');
            const v = Number(b.dataset.v);
            const k = grp.dataset.g as 'scale' | 'prog' | 'stage';
            a[k] = v;
            grp.querySelectorAll('.bb-chip').forEach((x) => x.classList.toggle('on', x === b));
            if (playMode) restartPreview();
          }),
      ),
    );
    el.querySelectorAll<HTMLButtonElement>('.bb-pat').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          pat = Number(b.dataset.p);
          renderEditor();
          if (playMode === 'loop') restartPreview();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('.bb-insts .bb-inst').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          inst = b.dataset.i as Instrument;
          const pm = playMode;
          renderEditor();
          if (pm) restartPreview(pm);
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-t]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const tt = b.dataset.t;
          if (tt === 'clear') {
            const p = a.pats[pat];
            const key = inst === 'drums' ? 'd' : PART_KEY[inst];
            p[key].fill(0);
            renderGrid();
          } else {
            stretch = tt === 'stretch';
            el.querySelectorAll('[data-t="note"],[data-t="stretch"]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.t === tt));
          }
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('.bb-sec').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const s = b.dataset.s!;
          if (s === 'add') a.secs.push(pat);
          else if (s === 'rm') a.secs.pop();
          else a.secs[Number(s)] = (a.secs[Number(s)] + 1) % 3;
          renderEditor();
        }),
    );
    el.querySelectorAll<HTMLButtonElement>('[data-pl]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const m = b.dataset.pl as 'loop' | 'song';
          if (playMode === m) stop();
          else restartPreview(m);
        }),
    );
  }

  function renderGrid(): void {
    const a = arr!;
    const p = a.pats[pat];
    const box = el.querySelector<HTMLDivElement>('.bb-sgrid')!;
    const rows = inst === 'drums' ? 4 : ROWS;
    const labels = inst === 'drums' ? drumRows() : Array.from({ length: ROWS }, (_, i) => String(ROWS - i));
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += `<div class="bb-grow"><span class="bb-glab">${esc(labels[r])}</span>`;
      for (let s = 0; s < STEPS; s++) {
        let cls = '';
        if (inst === 'drums') cls = p.d[s] & DR_BITS[r] ? 'on' : '';
        else {
          const cells = p[PART_KEY[inst]];
          const deg = ROWS - r; // 1..8 (de cima: agudo)
          if (cells[s] === deg) cls = 'on';
          else if (cells[s] === HOLD) {
            let q = s;
            while (q > 0 && cells[q] === HOLD) q--;
            if (cells[q] === deg) cls = 'hold';
          }
        }
        html += `<button class="bb-cell ${cls} ${s % 4 === 0 ? 'beat' : ''}" data-r="${r}" data-s="${s}" style="--row:${r}"></button>`;
      }
      html += '</div>';
    }
    box.innerHTML = html;
    box.dataset.inst = inst;
    box.onclick = (e) => {
      const c = (e.target as HTMLElement).closest<HTMLButtonElement>('.bb-cell');
      if (!c) return;
      const r = Number(c.dataset.r);
      const s = Number(c.dataset.s);
      cellTap(p, r, s);
      renderGrid();
      if (playMode) previewNote(r);
    };
  }

  function cellTap(p: Pattern, r: number, s: number): void {
    tap('light');
    if (inst === 'drums') {
      p.d[s] ^= DR_BITS[r];
      return;
    }
    const cells = p[PART_KEY[inst]];
    const deg = ROWS - r;
    if (stretch) {
      // estica a nota anterior (na mesma linha) até este passo
      let q = s - 1;
      while (q >= 0 && cells[q] === HOLD) q--;
      if (q >= 0 && cells[q] === deg) {
        for (let k = q + 1; k <= s; k++) cells[k] = HOLD;
        return;
      }
      for (let k = s; k >= 0; k--) {
        if (cells[k] === deg) {
          for (let m = k + 1; m <= s; m++) cells[m] = HOLD;
          return;
        }
        if (cells[k] !== 0 && cells[k] !== HOLD) break;
      }
      cells[s] = deg;
      return;
    }
    if (cells[s] === deg) {
      cells[s] = 0;
      for (let k = s + 1; k < STEPS && cells[k] === HOLD; k++) cells[k] = 0;
      return;
    }
    if (cells[s] === HOLD) {
      // corta a nota longa aqui
      for (let k = s; k < STEPS && cells[k] === HOLD; k++) cells[k] = 0;
    }
    cells[s] = deg;
    for (let k = s + 1; k < STEPS && cells[k] === HOLD; k++) cells[k] = 0;
  }

  function previewNote(_r: number): void {
    /* a prévia em loop já toca a grade atualizada no próximo ciclo */
  }

  function restartPreview(mode: 'loop' | 'song' = playMode || 'loop'): void {
    stop();
    const ctx = g.ensureAudio();
    if (!ctx || !g.out || !arr) return;
    const a = mode === 'loop' ? { ...arr, secs: [pat] } : arr;
    const sc = toScore(a);
    player = new ScorePlayer(sc, ctx, g.out);
    playMode = mode;
    const p = player;
    p.onEnd(() => {
      if (player === p && playMode === 'loop') {
        // loop: recomeça com a grade atual
        restartPreview('loop');
      } else if (player === p) stop();
    });
    p.start(0);
    el.querySelector('.bb-st-play')?.classList.toggle('on', mode === 'loop');
    const spb = 60 / arr.bpm;
    let lastCol = -1;
    const anim = () => {
      if (!player || player !== p) return;
      const tt = p.time();
      const step = Math.floor((tt / spb) * 4);
      const col = mode === 'loop' || (step >> 4) % 4 >= 0 ? ((step % 16) + 16) % 16 : -1;
      if (col !== lastCol) {
        el.querySelectorAll('.bb-cell.ph').forEach((c) => c.classList.remove('ph'));
        if (tt >= 0) el.querySelectorAll(`.bb-cell[data-s="${col}"]`).forEach((c) => c.classList.add('ph'));
        lastCol = col;
      }
      raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);
  }

  function saveArr(): void {
    const a = arr!;
    if (!a.title.trim()) a.title = t('band.st.defaultTitle', 'Minha música {n}', { n: bs.creations.length + 1 });
    const isNew = !editId;
    if (isNew && !canCreate()) return toast(t('band.st.limit', 'Limite de hoje atingido. Volte amanhã, use gemas ou o Passe!'));
    stop();
    const code = encodeArrangement(a);
    if (isNew) {
      editId = 'my-' + Date.now().toString(36);
      bs.creations.push({ id: editId, code, at: Date.now() });
      if (!premium()) noteMade();
    } else {
      const c = bs.creations.find((x) => x.id === editId);
      if (c) c.code = code;
    }
    persistBand();
    refreshCreations();
    success();
    // conferência: a música precisa gerar notas
    const { song } = arrangementSong(a, editId, 'creator', '');
    const n = song.charts.guitar?.facil?.length ?? 0;
    el.innerHTML = `<div class="bb-modal"><h2>${esc(t('band.st.saved', 'Música salva!'))}</h2>
      <p>${esc(a.title)}</p><p class="bb-codebox">${esc(code)}</p>
      <button class="bb-big bb-play" data-a="play">${bandIcon('play', 28)}<span>${esc(t('band.st.playNow', 'Tocar minha música'))}</span></button>
      <button class="bb-mid" data-a="share">${bandIcon('share', 22)}<span>${esc(t('band.st.share', 'Compartilhar'))}</span></button>
      <button class="bb-mid" data-a="back">${bandIcon('back', 22)}<span>${esc(t('band.st.backList', 'Minhas músicas'))}</span></button></div>`;
    void n;
    el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          if (b.dataset.a === 'play') playCreation(editId);
          else if (b.dataset.a === 'share') shareCode(code);
          else list();
        }),
    );
  }

  list();
  void save;
  return () => {
    closed = true;
    stop();
  };
}
