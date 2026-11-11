/* ============================================================
 *  BLOOP CINEMA — app: lista de filmes (início), editor (prévia,
 *  linha do tempo, faixa de planos, painéis), reprodução e exportação.
 * ============================================================ */
import './cinema.css';
import type { MiniGameHandle } from '../hub/registry';
import { pushBack } from '../core/back';
import { detectInitialTier, settingsFor, type QualitySettings, type Tier } from '../core/quality';
import { fmtDec, t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { bindButton, edges } from '../ui/touch';
import { actx, Mixer, Playback, preloadProjectClips } from './audio';
import { BACKGROUNDS, FX } from './data';
import { Renderer } from './engine';
import { canExportVideo, exportGif, exportVideo, probeDuration, safeFileName, shareFile, saveFile, type ExportResult } from './export';
import { cleanupShared } from '../mirror/media';
import { clone, newProject, parseProject, uid, type Project } from './format';
import { cleanText, isPro, maxProjects, maxSeconds, paywall } from './gates';
import { renderPanel, stopPanelAudio, TABS, type PanelCtx } from './panels';
import { actorThumb } from './rig2d';
import { closeAllSheets, confirm, menu, sheet, youCast } from './sheets';
import { addShotAfter, editActorKey, canRedo, canUndo, castById, cur, flushSave, gotoShot, mutate, onChange, openState, redo, S, setTime, trackOf, undo } from './state';
import { copyClips, deleteProject, listProjects, loadProject, saveProject, type ProjectMeta } from './store';
import { TEMPLATES } from './templates';
import { startTutorial, stopTutorial, tutEvent } from './tutorial';
import { presetById } from './data';
import { boardDetached } from './board';
import type { EasyBoard } from './easy';
import { onRemix, remixProject, takeRemix } from './tv-official';

const FIRST_KEY = 'bw-cin-easy-first';

const fmtT = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? '0' : ''}${fmtDec(r)}`;
};

class CinemaApp {
  readonly el: HTMLElement;
  private tier: Tier;
  private qs: QualitySettings;
  private mixer: Mixer | null = null;
  private pb: Playback | null = null;
  private raf = 0;
  private alive = true;
  private popEditor: (() => void) | null = null;
  private offChange: (() => void) | null = null;
  private exporting = false;
  // editor
  private cv: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private ro: ResizeObserver | null = null;
  private lastGi = -1;
  private lastTimeTxt = '';
  private dragging = false;
  private frameN = 0;
  private thumbs = new Map<string, { key: string; cv: HTMLCanvasElement }>();
  private thumb3d = new Map<string, HTMLCanvasElement>();
  lastExport: ExportResult | null = null;
  private easy: EasyBoard | null = null;
  /** abriu para um remix da TV: não abre o 1º uso automático */
  noAuto = false;

  constructor(
    root: HTMLElement,
    private exit: () => void,
  ) {
    this.tier = detectInitialTier();
    this.qs = settingsFor(this.tier);
    this.el = document.createElement('div');
    this.el.className = 'cin-root';
    root.appendChild(this.el);
    void cleanupShared();
    onRemix((id) => void this.openRemix(id));
    if (location.search.includes('debug')) (window as unknown as { __cinema: unknown }).__cinema = { app: this, S, TEMPLATES, probeDuration, mutate, setTime, gotoShot };
  }

  private ensureAudio(): Mixer | null {
    if (this.mixer) return this.mixer;
    const c = actx();
    if (!c) return null;
    this.mixer = new Mixer(c);
    this.pb = new Playback(this.mixer);
    return this.mixer;
  }

  /* ============================== INÍCIO ============================== */
  async home(): Promise<void> {
    this.closeEditor();
    this.el.classList.remove('cin-simple');
    let first = false;
    try {
      first = !localStorage.getItem(FIRST_KEY);
    } catch {
      /* */
    }
    const list = await listProjects();
    if (!this.alive) return;
    const pro = isPro();
    const free = !pro;
    this.el.innerHTML = `
      <div class="cin-top">
        <button class="cin-btn cin-ico" data-a="exit" aria-label="${t('cin.back', 'Voltar')}">←</button>
        <div class="cin-brand">🎬 ${t('cin.name', 'Bloop Cinema')}</div>
        ${pro ? '<span class="cin-chip on" style="display:inline-flex;align-items:center">★ PRO</span>' : `<button class="cin-btn sm" data-a="pro">★ Pro</button>`}
      </div>
      <div class="cin-home">
        <div class="cin-hero">
          <button class="cin-herobtn story" data-a="easy"><b>🎬</b><span>${t('cin.home.easy', 'Criar filme')}<small>${t('cin.home.easySub', 'Cena por cena, com a sua voz!')}</small></span></button>
          <button class="cin-herobtn magic" data-a="magic"><b>🪄</b><span>${t('cin.home.magic', 'História Mágica')}<small>${t('cin.home.magicSub', 'Conte uma ideia e a mágica faz o filme')}</small></span></button>
        </div>
        <button class="cin-tvbtn" data-a="tv"><b>📺</b><span>${t('tv.name', 'TV Bloop')}<small>${t('tv.homeSub', 'Assista ao vivo os filmes da galera — e envie o seu!')}</small></span></button>
        <h4>📚 ${t('cin.home.tpls', 'Histórias prontas para remixar')}</h4>
        <div class="cin-tpls">${TEMPLATES.map((tp) => `<button class="cin-tpl" data-a="tpl" data-v="${tp.id}"><canvas width="344" height="194" data-tpl="${tp.id}"></canvas><div><b>${esc(tp.name)}${tp.pro && free ? ' <span class="cin-pro">PRO</span>' : ''}</b><small>${esc(tp.desc)}</small></div></button>`).join('')}</div>
        <h4>🎞️ ${t('cin.home.mine', 'Meus filmes')} ${free ? `<span class="cin-hint">(${list.length}/${maxProjects()})</span>` : ''}</h4>
        ${
          list.length
            ? `<div class="cin-projs">${list.map((m) => projCard(m)).join('')}</div>`
            : `<div class="cin-empty">${t('cin.home.empty', 'Nenhum filme ainda. Comece com uma história pronta ou crie do zero!')}</div>`
        }
        <details class="cin-adv"><summary>🛠️ ${t('cin.home.adv', 'Modo avançado')}</summary>
          <div class="cin-new">
            <button class="cin-newbtn d2" data-a="new2d"><b>✏️</b>${t('cin.home.new2d', 'Novo filme 2D')}</button>
            <button class="cin-newbtn d3" data-a="new3d"><b>🧊</b>${t('cin.home.new3d', 'Novo filme 3D')}${free ? ' <span class="cin-pro">PRO</span>' : ''}</button>
          </div>
          <div class="cin-row c" style="margin-top:12px"><button class="cin-btn sm" data-a="story">✨ ${t('cin.home.story', 'Criar história')}</button><button class="cin-btn sm ghost" data-a="import">📂 ${t('cin.home.import', 'Importar projeto (.json)')}</button></div>
        </details>
        <p class="cin-foot">🔒 ${t('cin.home.local2', 'Seus filmes ficam salvos só neste aparelho — só vão para a TV Bloop se você enviar.')}</p>
      </div>`;
    // miniaturas das histórias
    this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-tpl]').forEach((cv) => {
      const tp = TEMPLATES.find((x) => x.id === cv.dataset.tpl)!;
      try {
        const p = tp.build();
        p.mode = '2d';
        const r = new Renderer(p);
        r.draw(cv.getContext('2d')!, cv.width, cv.height, Math.min(r.duration() - 0.1, tp.id === 'show' ? 13.5 : tp.id === 'castelo' ? 11 : 2.8), { budget: 0.4, bgScale: 1 });
      } catch (e) {
        console.warn('[cinema] tpl thumb', e);
      }
    });
    const exitBtn = this.el.querySelector<HTMLElement>('[data-a="exit"]')!;
    bindButton(exitBtn, { onPress: () => this.exit() });
    this.el.onclick = async (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      const a = b.dataset.a;
      const v = b.dataset.v!;
      if (a === 'pro') paywall('item');
      else if (a === 'tv') void import('./tv').then((m) => m.openTv());
      else if (a === 'story') void this.createStory(list.length);
      else if (a === 'easy') void this.createEasy(list.length);
      else if (a === 'magic') void this.magicStory(list.length);
      else if (a === 'new2d' || a === 'new3d') {
        if (a === 'new3d' && !isPro()) return paywall('3d');
        if (!(await this.roomForProject(list.length))) return;
        const p = newProject(t('cin.home.untitled', 'Meu filme {n}', { n: list.length + 1 }), a === 'new3d' ? '3d' : '2d');
        const me = youCast();
        const friend = { id: uid('c'), name: presetById('pipoca')!.name, kind: 'avatar' as const, avatar: clone(presetById('pipoca')!.av), voice: 'normal' as const };
        p.cast = [me, friend];
        p.scenes[0].shots[0].actors = [
          { cast: me.id, keys: [{ t: 0, x: 5.2, y: 0, z: 0, face: 1, pose: 'stand', expr: 'happy', ease: 'inout' }] },
          { cast: friend.id, keys: [{ t: 0, x: 10.8, y: 0, z: 0, face: -1, pose: 'wave', expr: 'happy', ease: 'inout' }] },
        ];
        await saveProject(p);
        this.openEditor(p);
      } else if (a === 'tpl') {
        const tp = TEMPLATES.find((x) => x.id === v)!;
        if (tp.pro && !isPro()) return paywall('3d');
        if (!(await this.roomForProject(list.length))) return;
        const p = tp.build();
        await saveProject(p);
        this.openEditor(p);
      } else if (a === 'open') {
        const p = await loadProject(v);
        if (p) this.openAny(p);
      } else if (a === 'more') await this.projectMenu(v, list.length);
      else if (a === 'import') this.importProject(list.length);
    };
    // 1º uso: já abre a escolha do começo (história de 2 cenas em 2 toques)
    if (first && !list.length && !this.noAuto) void this.createEasy(0, true);
  }

  /* ---------------------------- modo fácil (quadro de cenas) ---------------------------- */
  private async createEasy(n: number, firstRun = false): Promise<void> {
    if (!(await this.roomForProject(n))) return;
    const { pickStarter } = await import('./easy');
    const p = await pickStarter();
    if (!p || !this.alive) return;
    try {
      localStorage.setItem(FIRST_KEY, '1');
    } catch {
      /* */
    }
    p.title = p.title.slice(0, 60);
    await saveProject(p);
    await this.openBoard(p, firstRun || n === 0);
  }

  /** Abre um projeto no lugar certo: quadro (fácil), editor simples (história) ou avançado. */
  private openAny(p: Project): void {
    if (p.board && !boardDetached(p)) void this.openBoard(p);
    else void this.openEditor(p, !!p.story && !p.board);
  }

  private async openBoard(p: Project, firstRun = false): Promise<void> {
    this.closeEditor();
    this.el.classList.remove('cin-simple');
    this.ensureAudio();
    const { EasyBoard } = await import('./easy');
    if (!this.alive) return;
    this.easy = new EasyBoard(this.el, p, {
      firstRun,
      exit: () => {
        this.easy = null;
        void this.home();
      },
      advanced: (pp) => {
        this.easy = null;
        void this.openEditor(pp);
      },
    });
  }

  /** Estúdio de dublagem sobre o projeto aberto no editor. */
  private async openDubEditor(line?: string): Promise<void> {
    if (S.playing) this.stopPlay();
    await flushSave();
    const { openDub } = await import('./dub');
    await openDub(this.el, { project: () => S.p, edit: (fn) => mutate(fn) }, { line });
    void preloadProjectClips(S.p).then(() => (S.dirty = true));
    S.uiDirty = true;
  }

  /* ---------------------------- Criar história (modo simples) ---------------------------- */
  private async createStory(n: number): Promise<void> {
    if (!(await this.roomForProject(n))) return;
    const p = newProject(t('cin.home.untitled', 'Meu filme {n}', { n: n + 1 }), '2d');
    this.ensureAudio();
    const { storyWizard } = await import('./kids');
    const r = await storyWizard({ pid: p.id, host: this.el });
    if (!r || !this.alive) return;
    const { buildFromSpec } = await import('./storybuild');
    buildFromSpec(r.spec, { into: p, cast: r.cast });
    p.title = r.spec.title;
    await saveProject(p);
    await this.openEditor(p, true);
    void this.autoPlay();
  }

  /** História Mágica: ideia (voz ou texto) → roteiro (IA ou offline) → filme. */
  private async magicStory(n: number): Promise<void> {
    if (!(await this.roomForProject(n))) return;
    this.ensureAudio();
    const { magicFlow } = await import('./magic');
    const spec = await magicFlow(this.el);
    if (!spec || !this.alive) return;
    const { buildFromSpec } = await import('./storybuild');
    const p = buildFromSpec(spec);
    await saveProject(p);
    await this.openEditor(p, true);
    void this.autoPlay();
  }

  private async autoPlay(): Promise<void> {
    await preloadProjectClips(S.p).catch(() => {});
    if (!this.cv || S.playing) return;
    setTime(0);
    await this.togglePlay();
  }

  private async editStory(): Promise<void> {
    if (!S.p.story) return;
    this.stopPlay();
    const { storyWizard } = await import('./kids');
    const r = await storyWizard({ pid: S.p.id, host: this.el, spec: S.p.story, cast: S.p.cast });
    if (!r) return;
    const { buildFromSpec } = await import('./storybuild');
    mutate((pp) => void buildFromSpec(r.spec, { into: pp, cast: r.cast }));
    gotoShot(0);
    S.uiDirty = true;
    void this.autoPlay();
  }

  private setSimple(on: boolean): void {
    this.el.classList.toggle('cin-simple', on);
    if (!on) {
      S.uiDirty = true;
      this.renderTabs();
      this.renderPanel();
    }
    this.resize();
  }

  /** "Remixar" (TV Bloop): cópia do filme do Estúdio Bloop, salva como filme seu e aberta no editor. */
  async openRemix(id: string): Promise<void> {
    const list = await listProjects();
    if (!(await this.roomForProject(list.length))) return;
    const p = parseProject(await remixProject(id, uid('pj')));
    if (!p || !this.alive) return;
    await saveProject(p);
    notify(t('tv.remixed', 'Cópia criada! Mude o que quiser: falas, personagens, música...'), { kind: 'good', icon: 'check' });
    this.openAny(p);
  }

  private async roomForProject(n: number): Promise<boolean> {
    if (n >= maxProjects()) {
      paywall('projects');
      return false;
    }
    return true;
  }

  private async projectMenu(id: string, n: number): Promise<void> {
    const p = await loadProject(id);
    if (!p) return;
    const a = await menu(p.title, [
      ['open', '▶ ' + t('cin.home.open', 'Abrir')],
      ['dup', '⧉ ' + t('cin.home.dup', 'Duplicar')],
      ['json', '💾 ' + t('cin.home.json', 'Exportar projeto (.json)')],
      ['del', '🗑 ' + t('cin.del', 'Apagar'), 'warn'],
    ]);
    if (a === 'open') this.openEditor(p);
    else if (a === 'dup') {
      if (!(await this.roomForProject(n))) return;
      const c = clone(p);
      c.id = uid('pj');
      c.title = (p.title + ' ' + t('cin.home.copy', '(cópia)')).slice(0, 60);
      const map: Record<string, string> = {};
      for (const s of c.scenes) for (const h of s.shots) for (const l of h.lines) if (l.audio) l.audio = map[l.audio] ??= uid('clip');
      await copyClips(map, c.id);
      await saveProject(c);
      void this.home();
    } else if (a === 'json') {
      const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
      await shareFile(blob);
    } else if (a === 'del' && (await confirm(t('cin.home.delQ', 'Apagar "{n}"? Não dá para desfazer.', { n: p.title }), t('cin.del', 'Apagar')))) {
      await deleteProject(id);
      void this.home();
    }
  }

  private importProject(n: number): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f || f.size > 4_000_000) return;
      try {
        const p = parseProject(JSON.parse(await f.text()));
        if (!p) throw new Error('formato');
        if (!(await this.roomForProject(n))) return;
        p.id = uid('pj');
        p.title = cleanText(p.title, 60);
        for (const s of p.scenes) for (const h of s.shots) for (const l of h.lines) {
          l.text = cleanText(l.text);
          delete l.audio; // gravações não vêm no .json
        }
        if (p.mode === '3d' && !isPro()) p.mode = '2d';
        await saveProject(p);
        void this.home();
      } catch {
        notify(t('cin.home.importBad', 'Esse arquivo não é um projeto do Bloop Cinema.'), { kind: 'warn' });
      }
    };
    inp.click();
  }

  /* ============================== EDITOR ============================== */
  async openEditor(p: Project, simple = false): Promise<void> {
    this.closeEditor();
    const r = new Renderer(p);
    openState(p, r);
    S.tab = 'actor';
    this.ensureAudio();
    void preloadProjectClips(p).then(() => (S.dirty = true));
    this.el.innerHTML = `
      <div class="cin-top">
        <button class="cin-btn cin-ico" data-b="back" aria-label="${t('cin.back', 'Voltar')}">←</button>
        <input class="cin-title" maxlength="60" value="${esc(p.title)}" aria-label="${t('cin.ed.titleL', 'Título do filme')}">
        <button class="cin-btn cin-ico" data-b="undo" aria-label="${t('cin.ed.undo', 'Desfazer')}">↶</button>
        <button class="cin-btn cin-ico" data-b="redo" aria-label="${t('cin.ed.redo', 'Refazer')}">↷</button>
        ${p.board ? `<button class="cin-btn cin-ico" data-b="easy" aria-label="${t('cin.easy.backBtn', 'Modo fácil')}">🧸</button>` : ''}
        <button class="cin-btn cin-ico" data-b="dub" aria-label="${t('cin.easy.dub', 'Dublar')}">🎙️</button>
        <button class="cin-btn pri" data-b="export" aria-label="${t('cin.ed.export', 'Exportar')}">⬇ <span class="cin-exl">${t('cin.ed.export', 'Exportar')}</span></button>
      </div>
      <div class="cin-ed">
        <div class="cin-left">
          <div class="cin-stage"><canvas></canvas></div>
          <div class="cin-transport">
            <button class="cin-btn cin-ico" data-b="play" aria-label="${t('cin.ed.play', 'Assistir')}">▶</button>
            <input class="cin-scrub" type="range" min="0" max="1" step="0.01" value="0" aria-label="${t('cin.ed.time', 'Tempo')}">
            <span class="cin-time">0:00,0</span>
          </div>
          <div class="cin-kidbar">
            <button class="cin-btn pri" data-k="watch">▶ ${t('cin.kid.watch', 'Assistir')}</button>
            <div class="row">${p.story ? `<button class="cin-btn" data-k="edit">✏️ ${t('cin.kid.edit', 'Editar história')}</button>` : ''}<button class="cin-btn" data-k="adv">🛠️ ${t('cin.home.adv', 'Modo avançado')}</button></div>
          </div>
          <div class="cin-strip"></div>
          <div class="cin-tl"></div>
        </div>
        <div class="cin-right">
          <div class="cin-tabs">${TABS.map((x) => `<button class="cin-tab" data-tab="${x.id}">${x.label()}</button>`).join('')}</div>
          <div class="cin-panel"></div>
        </div>
      </div>`;
    const e = edges();
    this.el.querySelector<HTMLElement>('.cin-panel')!.style.paddingBottom = `${18 + e.b}px`;
    this.cv = this.el.querySelector<HTMLCanvasElement>('.cin-stage canvas')!;
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
    const stage = this.el.querySelector<HTMLElement>('.cin-stage')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.resize();
    // botões do topo e transporte: disparo no toque
    const B = (k: string, f: () => void) => bindButton(this.el.querySelector<HTMLElement>(`[data-b="${k}"]`)!, { onPress: f });
    B('back', () => void this.leaveEditor());
    B('undo', () => undo());
    B('redo', () => redo());
    B('export', () => void this.exportSheet());
    B('play', () => void this.togglePlay());
    B('dub', () => void this.openDubEditor());
    if (p.board)
      B('easy', async () => {
        const { backToEasy } = await import('./easy');
        if (S.playing) this.stopPlay();
        await flushSave();
        if (!(await backToEasy(S.p))) return;
        await saveProject(S.p);
        void this.openBoard(S.p);
      });
    this.el.classList.toggle('cin-simple', simple);
    this.el.querySelector<HTMLElement>('.cin-kidbar')!.onclick = (ev) => {
      const k = (ev.target as HTMLElement).closest<HTMLElement>('[data-k]')?.dataset.k;
      if (k === 'watch') {
        if (!S.playing) setTime(0);
        void this.togglePlay();
      } else if (k === 'edit') void this.editStory();
      else if (k === 'adv') this.setSimple(false);
    };
    const title = this.el.querySelector<HTMLInputElement>('.cin-title')!;
    title.onchange = () => {
      const v = cleanText(title.value, 60).trim() || p.title;
      title.value = v;
      mutate((pp) => (pp.title = v));
    };
    const scrub = this.el.querySelector<HTMLInputElement>('.cin-scrub')!;
    scrub.oninput = () => {
      if (S.playing) this.stopPlay();
      setTime(+scrub.value * S.r.duration());
    };
    this.el.querySelector<HTMLElement>('.cin-tabs')!.onclick = (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-tab]');
      if (!b) return;
      S.tab = b.dataset.tab as never;
      stopPanelAudio();
      this.renderTabs();
      this.renderPanel();
    };
    this.bindStage();
    this.bindTimeline();
    this.offChange = onChange(() => {
      const ub = this.el.querySelector<HTMLButtonElement>('[data-b="undo"]');
      const rb = this.el.querySelector<HTMLButtonElement>('[data-b="redo"]');
      if (ub) ub.disabled = !canUndo();
      if (rb) rb.disabled = !canRedo();
    });
    if (p.mode === '3d') await this.load3D();
    this.popEditor = pushBack(() => void this.leaveEditor(true));
    this.renderTabs();
    this.lastGi = -1;
    gotoShot(0);
    S.uiDirty = true;
    S.dirty = true;
    this.loop();
    if (!simple) startTutorial();
  }

  private async load3D(): Promise<void> {
    if (S.r.r3d) return;
    try {
      const m = await import('./scene3d');
      S.r.r3d = new m.Scene3D(this.tier);
      S.dirty = true;
    } catch (e) {
      console.warn('[cinema] 3D', e);
      notify(t('cin.ed.no3d', 'O 3D não funcionou neste aparelho.'), { kind: 'warn' });
    }
    this.syncOrientation();
  }

  /** O hub deita a tela quando há um canvas "three" visível: só no modo 3D. */
  private syncOrientation(): void {
    if (!this.cv) return;
    if (S.p.mode === '3d') this.cv.dataset.engine = 'three-cinema';
    else delete this.cv.dataset.engine;
  }

  private async setMode(m: '2d' | '3d'): Promise<void> {
    if (m === S.p.mode) return;
    if (m === '3d' && !isPro()) return paywall('3d');
    mutate((p) => (p.mode = m));
    if (m === '3d') await this.load3D();
    this.syncOrientation();
    this.resize();
  }

  private resize(): void {
    const cv = this.cv;
    if (!cv) return;
    const w = cv.clientWidth || 360;
    const h = cv.clientHeight || 202;
    let dpr = Math.min(window.devicePixelRatio || 1, this.qs.dprCap);
    if (S.p?.mode === '3d') dpr = Math.min(dpr, 1.25);
    const W = Math.min(1280, Math.round(w * dpr));
    const H = Math.round((W * h) / w);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    S.dirty = true;
  }

  private panelCtx(): PanelCtx {
    return {
      host: this.el.querySelector<HTMLElement>('.cin-panel')!,
      mixer: () => this.ensureAudio(),
      setMode: (m) => void this.setMode(m),
      importStudio: () => this.importStudio(),
    };
  }
  private renderTabs(): void {
    this.el.querySelectorAll<HTMLElement>('.cin-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === S.tab));
  }
  private renderPanel(): void {
    const host = this.el.querySelector<HTMLElement>('.cin-panel');
    if (host) renderPanel(this.panelCtx());
  }

  private importStudio(): void {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f || f.size > 3_000_000) return;
      try {
        const json = JSON.parse(await f.text());
        const m = await import('./scene3d');
        if (!m.loadStudioSet(json)) throw new Error('vazio');
        const { ref } = cur();
        mutate(() => (ref.scene.studio = { name: cleanText(String(json?.name ?? f.name.replace(/\.json$/i, '')), 40), json }));
      } catch {
        notify(t('cin.scene.studioBad', 'Não reconheci essa criação do Bloop Studio.'), { kind: 'warn' });
      }
    };
    inp.click();
  }

  /* ---------------------------- prévia: tocar/arrastar atores ---------------------------- */
  private bindStage(): void {
    const cv = this.cv!;
    let drag: { id: string; x0: number; y0: number; sx: number; sz: number; ppu: number; moved: boolean; pid: number } | null = null;
    cv.addEventListener('pointerdown', (e) => {
      if (this.exporting) return;
      if (S.playing) {
        this.stopPlay();
        return;
      }
      const rc = cv.getBoundingClientRect();
      const px = ((e.clientX - rc.left) / rc.width) * cv.width;
      const py = ((e.clientY - rc.top) / rc.height) * cv.height;
      const hit = S.r.hit(px, py);
      if (!hit) return;
      const changed = S.sel !== hit;
      S.sel = hit;
      tutEvent('select');
      if (S.tab !== 'actor') {
        S.tab = 'actor';
        this.renderTabs();
      }
      if (changed) S.uiDirty = true;
      S.dirty = true;
      const { ref, local } = cur();
      const tr = trackOf(ref.shot, hit);
      if (!tr) return;
      const sc = S.r.lastScreens.find((s) => s.cast === hit);
      const k = tr.keys.filter((x) => x.t <= local + 0.06).pop() ?? tr.keys[0];
      const evx = sc ? S.r.screenToStage(sc.x, cv.width) : k.x;
      drag = { id: hit, x0: px, y0: py, sx: S.p.mode === '3d' ? k.x : evx, sz: k.z, ppu: (sc?.ppu ?? cv.width / 16) * (rc.width / cv.width), moved: false, pid: e.pointerId };
      cv.setPointerCapture(e.pointerId);
      this.dragging = true;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const rc = cv.getBoundingClientRect();
      const px = ((e.clientX - rc.left) / rc.width) * cv.width;
      const py = ((e.clientY - rc.top) / rc.height) * cv.height;
      const dx = (px - drag.x0) * (rc.width / cv.width);
      const dy = (py - drag.y0) * (rc.width / cv.width);
      if (!drag.moved && Math.hypot(dx, dy) < 8) return;
      drag.moved = true;
      const x = Math.max(-1, Math.min(17, drag.sx + dx / drag.ppu));
      const z = Math.max(-3, Math.min(3, drag.sz + (dy / drag.ppu) * 0.9));
      editActorKey(drag.id, { x: Math.round(x * 20) / 20, z: Math.round(z * 20) / 20 }, false);
    });
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const moved = drag.moved;
      drag = null;
      this.dragging = false;
      if (moved) mutate(() => {}, true);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
  }

  /* ---------------------------- faixa de planos ---------------------------- */
  private renderStrip(): void {
    const host = this.el.querySelector<HTMLElement>('.cin-strip');
    if (!host) return;
    const { ref } = cur();
    let html = '';
    let lastSi = -1;
    for (const r of S.r.flat) {
      if (r.si !== lastSi) {
        lastSi = r.si;
        const bg = BACKGROUNDS.find((b) => b.id === r.scene.bg);
        html += `<div class="cin-scn">${t('cin.ed.scene', 'Cena {n}', { n: r.si + 1 })} · ${bg?.name ?? ''}</div>`;
      }
      html += `<button class="cin-shot ${r.gi === ref.gi ? 'on' : ''}" data-gi="${r.gi}"><canvas width="192" height="108" data-shot="${r.shot.id}"></canvas><span>${r.gi + 1} · ${fmtDec(r.shot.dur)}s</span>${r.shot.transition.kind !== 'cut' ? '<i>⇢</i>' : ''}</button>`;
    }
    html += `<button class="cin-addshot" data-add="shot">＋<small>${t('cin.ed.addShot', 'plano')}</small></button>`;
    host.innerHTML = html;
    // miniaturas (2D: só redesenha o plano que mudou; 3D: foto da prévia)
    const castSig = JSON.stringify(S.p.cast);
    const keep = new Map<string, { key: string; cv: HTMLCanvasElement }>();
    for (const r of S.r.flat) {
      const cv = host.querySelector<HTMLCanvasElement>(`canvas[data-shot="${r.shot.id}"]`);
      if (!cv) continue;
      const x = cv.getContext('2d')!;
      if (S.p.mode === '3d') {
        const snap = this.thumb3d.get(r.shot.id);
        if (snap) x.drawImage(snap, 0, 0, 192, 108);
        else {
          x.fillStyle = '#221048';
          x.fillRect(0, 0, 192, 108);
        }
        continue;
      }
      const prev = r.gi > 0 ? S.r.flat[r.gi - 1].shot.id : '';
      const key = JSON.stringify(r.shot) + r.scene.bg + r.scene.light + castSig + prev;
      const hit = this.thumbs.get(r.shot.id);
      if (hit && hit.key === key) x.drawImage(hit.cv, 0, 0);
      else {
        const tt = r.start + Math.min(r.shot.dur * 0.5, r.shot.transition.kind === 'cut' ? 1.2 : r.shot.transition.dur + 0.4);
        S.r.draw(x, 192, 108, tt, { budget: 0.3, bgScale: 0.8 });
        const c2 = hit?.cv ?? document.createElement('canvas');
        c2.width = 192;
        c2.height = 108;
        c2.getContext('2d')!.drawImage(cv, 0, 0);
        keep.set(r.shot.id, { key, cv: c2 });
        continue;
      }
      keep.set(r.shot.id, hit);
    }
    this.thumbs = keep;
    S.dirty = true;
    host.querySelector<HTMLElement>('.cin-shot.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    host.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-gi],[data-add]');
      if (!b) return;
      if (S.playing) this.stopPlay();
      if (b.dataset.add) {
        addShotAfter();
        tutEvent('shot');
      } else gotoShot(+b.dataset.gi!);
    };
  }

  /* ---------------------------- linha do tempo do plano ---------------------------- */
  private renderTimeline(): void {
    const host = this.el.querySelector<HTMLElement>('.cin-tl');
    if (!host) return;
    const { ref } = cur();
    const shot = ref.shot;
    const pct = (tt: number) => `${(tt / shot.dur) * 100}%`;
    let ruler = '';
    const step = shot.dur > 12 ? 2 : shot.dur > 5 ? 1 : 0.5;
    for (let s = 0; s <= shot.dur + 1e-6; s += step) ruler += `<b style="left:${pct(s)}">${s % 1 ? fmtDec(s) : s}s</b>`;
    let html = `<div class="ruler">${ruler}</div>`;
    html += `<div class="cin-lane"><span class="lbl">🎥 ${t('cin.tab.camera', 'Câmera')}</span><div class="trk" data-trk="1">${shot.cam.map((k, i) => `<i class="cin-key cam" style="left:${pct(k.t)}" data-kind="cam" data-i="${i}"></i>`).join('')}</div></div>`;
    for (const a of shot.actors) {
      const c = castById(a.cast);
      if (!c) continue;
      html += `<div class="cin-lane ${a.cast === S.sel ? 'sel' : ''}"><span class="lbl" data-lane="${a.cast}">${esc(c.name)}</span><div class="trk" data-trk="1">${a.keys.map((k, i) => `<i class="cin-key" style="left:${pct(k.t)}" data-kind="key" data-cast="${a.cast}" data-i="${i}"></i>`).join('')}</div></div>`;
    }
    html += `<div class="cin-lane"><span class="lbl">💬 ${t('cin.tab.lines', 'Falas')}</span><div class="trk" data-trk="1">${shot.lines.map((l) => `<i class="cin-blk ${l.audio ? 'aud' : ''} ${l.id === S.selLine ? 'on' : ''}" style="left:${pct(l.t)};width:${pct(l.dur)}" data-kind="line" data-id="${l.id}">${esc(l.text || '…')}</i>`).join('')}</div></div>`;
    if (shot.fx.length || shot.sfx.length)
      html += `<div class="cin-lane"><span class="lbl">✨ ${t('cin.tab.fx', 'Efeitos')}</span><div class="trk" data-trk="1">${shot.fx.map((f) => `<i class="cin-blk fx" style="left:${pct(f.t)};width:${pct(f.dur)}" data-kind="fx" data-id="${f.id}">${FX.find((x) => x.id === f.kind)?.glyph ?? '✨'} ${esc(FX.find((x) => x.id === f.kind)?.name ?? f.kind)}</i>`).join('')}${shot.sfx.map((f) => `<i class="cin-blk sfx" style="left:${pct(f.t)};width:${pct(Math.min(0.6, shot.dur - f.t))}" data-kind="sfx" data-id="${f.id}">♪</i>`).join('')}</div></div>`;
    html += `<div class="cin-head"></div>`;
    // coluna de rótulos do tamanho do maior nome (ícone + miniatura + texto), sem cortar
    const names = [t('cin.tab.camera', 'Câmera'), t('cin.tab.lines', 'Falas'), t('cin.tab.fx', 'Efeitos'), ...shot.actors.map((a) => castById(a.cast)?.name ?? '')];
    const mx = document.createElement('canvas').getContext('2d')!;
    mx.font = `500 11px ${getComputedStyle(host).fontFamily || 'sans-serif'}`;
    const lw = Math.min(150, Math.max(64, Math.ceil(Math.max(...names.map((n) => mx.measureText(n).width)) + 34)));
    host.style.setProperty('--lblw', `${lw}px`);
    host.innerHTML = html;
    host.querySelectorAll<HTMLElement>('[data-lane]').forEach((l) => {
      const c = castById(l.dataset.lane);
      if (c) l.prepend(actorThumb(c, 18, 'stand', 'happy', 0.3, 'face'));
    });
    this.placeHead();
  }

  private placeHead(): void {
    const host = this.el.querySelector<HTMLElement>('.cin-tl');
    const head = host?.querySelector<HTMLElement>('.cin-head');
    const trk = host?.querySelector<HTMLElement>('.trk');
    if (!host || !head || !trk) return;
    const { ref, local } = cur();
    head.style.left = `${trk.offsetLeft + (local / ref.shot.dur) * trk.clientWidth}px`;
  }

  private bindTimeline(): void {
    const host = this.el.querySelector<HTMLElement>('.cin-tl')!;
    let op: { kind: string; el: HTMLElement; x0: number; t0: number; pid: number; moved: boolean; w: number } | null = null;
    const timeAt = (clientX: number): number => {
      const trk = host.querySelector<HTMLElement>('.trk')!;
      const rc = trk.getBoundingClientRect();
      const { ref } = cur();
      return Math.max(0, Math.min(ref.shot.dur - 0.001, ((clientX - rc.left) / rc.width) * ref.shot.dur));
    };
    host.addEventListener('pointerdown', (e) => {
      const tgt = e.target as HTMLElement;
      if (S.playing) this.stopPlay();
      const item = tgt.closest<HTMLElement>('[data-kind]');
      const trk = tgt.closest<HTMLElement>('[data-trk]');
      if (!trk && !tgt.closest('.ruler')) return;
      const w = host.querySelector<HTMLElement>('.trk')!.clientWidth;
      const { ref } = cur();
      if (item) {
        const kind = item.dataset.kind!;
        const t0 = this.itemTime(kind, item);
        op = { kind, el: item, x0: e.clientX, t0, pid: e.pointerId, moved: false, w };
      } else {
        op = { kind: 'scrub', el: host, x0: e.clientX, t0: 0, pid: e.pointerId, moved: true, w };
        setTime(ref.start + timeAt(e.clientX));
      }
      host.setPointerCapture(e.pointerId);
      this.dragging = true;
      e.preventDefault();
    });
    host.addEventListener('pointermove', (e) => {
      if (!op || e.pointerId !== op.pid) return;
      const { ref } = cur();
      if (op.kind === 'scrub') return setTime(ref.start + timeAt(e.clientX));
      const dx = e.clientX - op.x0;
      if (!op.moved && Math.abs(dx) < 6) return;
      op.moved = true;
      const nt = Math.max(0, Math.min(ref.shot.dur - 0.05, Math.round((op.t0 + (dx / op.w) * ref.shot.dur) * 20) / 20));
      this.setItemTime(op.kind, op.el, nt, false);
      op.el.style.left = `${(nt / ref.shot.dur) * 100}%`;
    });
    const up = (e: PointerEvent) => {
      if (!op || e.pointerId !== op.pid) return;
      const o = op;
      op = null;
      this.dragging = false;
      const { ref } = cur();
      if (o.kind === 'scrub') return;
      if (o.moved) {
        mutate(() => {}, true);
        return;
      }
      // toque: seleciona e pula para o instante
      const tt = this.itemTime(o.kind, o.el);
      setTime(ref.start + tt + 0.001);
      if (o.kind === 'key') {
        S.sel = o.el.dataset.cast!;
        S.tab = 'actor';
      } else if (o.kind === 'cam') S.tab = 'camera';
      else if (o.kind === 'line') {
        S.selLine = o.el.dataset.id!;
        S.tab = 'lines';
      } else S.tab = 'fx';
      this.renderTabs();
      S.uiDirty = true;
    };
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', up);
  }

  private itemTime(kind: string, el: HTMLElement): number {
    const shot = cur().ref.shot;
    if (kind === 'cam') return shot.cam[+el.dataset.i!]?.t ?? 0;
    if (kind === 'key') return trackOf(shot, el.dataset.cast!)?.keys[+el.dataset.i!]?.t ?? 0;
    if (kind === 'line') return shot.lines.find((l) => l.id === el.dataset.id)?.t ?? 0;
    if (kind === 'fx') return shot.fx.find((l) => l.id === el.dataset.id)?.t ?? 0;
    if (kind === 'sfx') return shot.sfx.find((l) => l.id === el.dataset.id)?.t ?? 0;
    return 0;
  }
  private setItemTime(kind: string, el: HTMLElement, tt: number, commit: boolean): void {
    const shot = cur().ref.shot;
    mutate(() => {
      if (kind === 'cam') {
        const k = shot.cam[+el.dataset.i!];
        if (k && +el.dataset.i! > 0) k.t = tt;
      } else if (kind === 'key') {
        const tr = trackOf(shot, el.dataset.cast!);
        const k = tr?.keys[+el.dataset.i!];
        if (k && +el.dataset.i! > 0) k.t = Math.max(0.05, tt);
      } else if (kind === 'line') {
        const l = shot.lines.find((x) => x.id === el.dataset.id);
        if (l) l.t = tt;
      } else if (kind === 'fx') {
        const l = shot.fx.find((x) => x.id === el.dataset.id);
        if (l) l.t = tt;
      } else if (kind === 'sfx') {
        const l = shot.sfx.find((x) => x.id === el.dataset.id);
        if (l) l.t = tt;
      }
    }, commit);
  }

  /* ---------------------------- reprodução ---------------------------- */
  private async togglePlay(): Promise<void> {
    if (S.playing) return this.stopPlay();
    const m = this.ensureAudio();
    if (!m || !this.pb) return;
    const dur = S.r.duration();
    if (S.T >= dur - 0.05) S.T = 0;
    stopPanelAudio();
    S.playing = true;
    this.setPlayIcon();
    await this.pb.start(S.p, S.T, dur);
    tutEvent('play');
  }
  private stopPlay(): void {
    if (!S.playing) return;
    S.playing = false;
    this.pb?.stop();
    this.setPlayIcon();
    S.uiDirty = true;
    S.dirty = true;
  }
  private setPlayIcon(): void {
    const b = this.el.querySelector<HTMLElement>('[data-b="play"]');
    if (b) b.textContent = S.playing ? '⏸' : '▶';
  }

  private loop = (): void => {
    if (!this.alive || !this.cv) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.exporting) return;
    this.frameN++;
    const dur = S.r.duration();
    if (S.playing && this.pb && !Number.isNaN(this.pb.time())) {
      const T = this.pb.time();
      if (T >= dur) {
        S.T = Math.max(0, dur - 0.001);
        this.stopPlay();
      } else S.T = Math.max(0, T);
      S.dirty = true;
      if (this.qs.fpsCap === 30 && this.frameN % 2) return;
    }
    const gi = cur().ref.gi;
    if (gi !== this.lastGi) {
      this.lastGi = gi;
      if (S.playing) {
        this.renderTimeline();
        this.el.querySelectorAll<HTMLElement>('.cin-shot').forEach((b) => b.classList.toggle('on', +b.dataset.gi! === gi));
      } else S.uiDirty = true;
    }
    if (S.uiDirty && !S.playing && !this.dragging) {
      S.uiDirty = false;
      this.renderStrip();
      this.renderTimeline();
      this.renderPanel();
    }
    if (S.dirty) {
      S.dirty = false;
      const cv = this.cv;
      S.r.draw(this.ctx!, cv.width, cv.height, S.T, { selected: S.playing ? null : S.sel, budget: this.qs.particleBudget, bgScale: this.tier >= 2 ? 1.5 : 1 });
      if (S.p.mode === '3d' && !S.playing) {
        const { ref } = cur();
        let snap = this.thumb3d.get(ref.shot.id);
        if (!snap) {
          snap = document.createElement('canvas');
          snap.width = 192;
          snap.height = 108;
          this.thumb3d.set(ref.shot.id, snap);
        }
        snap.getContext('2d')!.drawImage(cv, 0, 0, 192, 108);
        this.el.querySelector<HTMLCanvasElement>(`.cin-strip canvas[data-shot="${ref.shot.id}"]`)?.getContext('2d')!.drawImage(snap, 0, 0);
      }
      // transporte
      const txt = `${fmtT(S.T)} / ${fmtT(dur)}`;
      if (txt !== this.lastTimeTxt) {
        this.lastTimeTxt = txt;
        const tm = this.el.querySelector<HTMLElement>('.cin-time');
        if (tm) tm.textContent = txt;
        const sc = this.el.querySelector<HTMLInputElement>('.cin-scrub');
        if (sc && document.activeElement !== sc) sc.value = String(dur ? S.T / dur : 0);
      }
      this.placeHead();
    }
  };

  /* ---------------------------- exportar ---------------------------- */
  private async exportSheet(): Promise<void> {
    if (S.playing) this.stopPlay();
    tutEvent('export');
    const dur = S.r.duration();
    if (S.p.mode === '3d' && !isPro()) return paywall('3d');
    if (dur > maxSeconds() + 0.01) return paywall('time');
    const pro = isPro();
    const low = this.tier <= 1;
    let wm = pro ? S.p.watermark : true;
    let hi = !low;
    const s = sheet(
      `<h3>⬇ ${t('cin.ex.title', 'Exportar filme')}</h3>
       <p class="cin-hint">${t('cin.ex.info', 'Duração: {d}. O vídeo é gravado em tempo real — deixe esta tela aberta.', { d: fmtT(dur) })}</p>
       <h5>${t('cin.ex.quality', 'Qualidade')}</h5>
       <div class="cin-chips"><button class="cin-chip ${hi ? 'on' : ''}" data-a="q" data-v="720" ${low ? 'disabled' : ''}>720p</button><button class="cin-chip ${!hi ? 'on' : ''}" data-a="q" data-v="480">480p</button></div>
       ${low ? `<p class="cin-hint">${t('cin.ex.low', 'Neste aparelho o vídeo sai em 480p para não travar.')}</p>` : ''}
       <h5>${t('cin.ex.wm', 'Marca d’água "Feito no Bloop World"')}</h5>
       <div class="cin-chips"><button class="cin-chip ${wm ? 'on' : ''}" data-a="wm" data-v="1">${t('cin.ex.wmOn', 'Com marca')}</button><button class="cin-chip ${!wm ? 'on' : ''}" data-a="wm" data-v="0">${t('cin.ex.wmOff', 'Sem marca')}${pro ? '' : ' ★'}</button></div>
       <div class="cin-menu" style="margin-top:14px">
         <button class="cin-btn pri" data-a="video" ${canExportVideo() ? '' : 'disabled'}>🎬 ${t('cin.ex.video', 'Gravar vídeo com som')}</button>
         <button class="cin-btn" data-a="gif">🖼️ ${t('cin.ex.gif', 'GIF curtinho (6 s, sem som)')}</button>
         <button class="cin-btn" data-a="tv">📺 ${t('tv.send', 'Enviar para a TV Bloop')}</button>
         ${canExportVideo() ? '' : `<p class="cin-hint">${t('cin.ex.noVideo', 'Este aparelho não grava vídeo. Tente o GIF!')}</p>`}
       </div>`,
      async (a, el, close) => {
        if (a === 'q') {
          hi = el.dataset.v === '720';
          s.el.querySelectorAll('[data-a="q"]').forEach((b) => b.classList.toggle('on', b === el));
        } else if (a === 'wm') {
          if (el.dataset.v === '0' && !pro) return paywall('watermark');
          wm = el.dataset.v === '1';
          mutate((p) => (p.watermark = wm));
          s.el.querySelectorAll('[data-a="wm"]').forEach((b) => b.classList.toggle('on', b === el));
        } else if (a === 'video') {
          close();
          await this.runVideoExport(hi ? 1280 : 854, hi ? 720 : 480, wm);
        } else if (a === 'gif') {
          close();
          await this.runGifExport(wm);
        } else if (a === 'tv') {
          close();
          await flushSave();
          const m = await import('./tv');
          m.sendToTvSheet(S.p, S.r, { onFix: (id) => void this.openDubEditor(id) });
        }
      },
    );
  }

  private async runVideoExport(W: number, H: number, wm: boolean): Promise<void> {
    const m = this.ensureAudio();
    if (!m || !this.pb) return;
    this.exporting = true;
    await flushSave();
    let ctl: ReturnType<typeof exportVideo> | null = null;
    const s = sheet(
      `<h3>🎬 ${t('cin.ex.recording', 'Gravando seu filme...')}</h3><div data-r="cv"></div><div class="cin-progress"><i></i></div><button class="cin-btn ghost" data-a="x" style="width:100%">${t('cin.cancel', 'Cancelar')}</button>`,
      (_a, _el, close) => {
        ctl?.cancel();
        close();
      },
    );
    const bar = s.el.querySelector<HTMLElement>('.cin-progress i')!;
    let shown = false;
    ctl = exportVideo(S.r, m, this.pb, {
      W,
      H,
      fps: 30,
      watermark: wm,
      budget: Math.max(0.5, this.qs.particleBudget),
      onProgress: (k) => (bar.style.width = `${Math.round(k * 100)}%`),
      onFrame: (cv) => {
        if (shown) return;
        shown = true;
        cv.style.cssText = 'width:100%;border-radius:12px;display:block';
        s.el.querySelector('[data-r="cv"]')?.appendChild(cv);
      },
    });
    let res: ExportResult | null = null;
    try {
      res = await ctl.done;
    } catch (e) {
      console.warn('[cinema] export', e);
    }
    s.close();
    this.exporting = false;
    S.dirty = true;
    if (!res) {
      notify(t('cin.ex.fail', 'A gravação não terminou. Tente de novo.'), { kind: 'warn' });
      return;
    }
    this.lastExport = res;
    void this.saveThumb();
    this.resultSheet(res.blob, res.ext, res.dur);
  }

  private async runGifExport(wm: boolean): Promise<void> {
    const s = sheet(`<h3>🖼️ ${t('cin.ex.gifMaking', 'Montando o GIF...')}</h3><div class="cin-progress"><i style="width:60%"></i></div>`, () => {});
    this.exporting = true;
    try {
      const blob = await exportGif(S.r, { W: 320, H: 180, fps: 8, maxSec: 6, watermark: wm });
      s.close();
      this.resultSheet(blob, 'gif', Math.min(6, S.r.duration()));
    } catch (e) {
      console.warn('[cinema] gif', e);
      s.close();
    }
    this.exporting = false;
    S.dirty = true;
  }

  private resultSheet(blob: Blob, ext: string, dur: number): void {
    const url = URL.createObjectURL(blob);
    const name = safeFileName(S.p.title, ext);
    const mb = fmtDec(blob.size / 1048576);
    const media = ext === 'gif' ? `<img src="${url}" style="width:100%;border-radius:12px;display:block;margin-bottom:10px" alt="">` : `<video src="${url}" controls playsinline></video>`;
    sheet(
      `<h3>✅ ${t('cin.ex.done', 'Filme pronto!')}</h3>${media}
       <p class="cin-hint">${ext.toUpperCase()} · ${fmtT(dur)} · ${mb} MB</p>
       <div class="cin-menu"><button class="cin-btn pri" data-a="share">📤 ${t('cin.ex.share', 'Compartilhar')}</button><button class="cin-btn" data-a="save">💾 ${t('cin.ex.save', 'Salvar no aparelho')}</button></div>
       <p class="cin-hint" style="margin-top:8px">🔒 ${t('cin.ex.privacy', 'Nada é enviado pelo jogo: você escolhe para onde mandar.')}</p>`,
      async (a) => {
        if (a === 'share') {
          const r = await shareFile(blob);
          if (r === 'downloaded') notify(t('cin.ex.saved', 'Arquivo salvo!'), { kind: 'good', icon: 'check' });
          else if (r === 'error') notify(t('cin.ex.shareFail', 'Não deu para compartilhar. Tente de novo.'), { kind: 'warn' });
        } else if (a === 'save') {
          const r = await saveFile(blob, name);
          if (r === 'downloaded') notify(t('cin.ex.saved', 'Arquivo salvo!'), { kind: 'good', icon: 'check' });
          else if (r === 'error') notify(t('cin.ex.shareFail', 'Não deu para compartilhar. Tente de novo.'), { kind: 'warn' });
        }
      },
      () => setTimeout(() => URL.revokeObjectURL(url), 30_000),
    );
  }

  private async saveThumb(): Promise<void> {
    if (!S.p) return;
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 144;
    const T = Math.min(S.r.duration() * 0.3, 2.5);
    try {
      S.r.draw(cv.getContext('2d')!, 256, 144, T, { budget: 0.3, bgScale: 0.8 });
      await flushSave(cv.toDataURL('image/jpeg', 0.72));
    } catch {
      await flushSave();
    }
    S.dirty = true;
  }

  /* ---------------------------- sair ---------------------------- */
  private async leaveEditor(fromBack = false): Promise<void> {
    if (!this.cv) return;
    if (this.exporting) return;
    if (!fromBack) this.popEditor?.();
    this.popEditor = null;
    this.stopPlay();
    await this.saveThumb();
    void this.home();
  }

  private closeEditor(): void {
    this.easy?.close();
    this.easy = null;
    cancelAnimationFrame(this.raf);
    this.stopPlay();
    stopPanelAudio();
    stopTutorial();
    this.ro?.disconnect();
    this.ro = null;
    this.offChange?.();
    this.offChange = null;
    this.popEditor?.();
    this.popEditor = null;
    if (S.r) S.r.dispose();
    this.cv = null;
    this.ctx = null;
    this.thumb3d.clear();
  }

  pause(): void {
    this.stopPlay();
    void flushSave();
    void this.easy?.flush();
  }

  destroy(): void {
    this.alive = false;
    closeAllSheets();
    onRemix(null);
    void cleanupShared();
    if (this.cv) void flushSave();
    void this.easy?.flush();
    this.closeEditor();
    this.mixer?.dispose();
    this.mixer = null;
    this.el.remove();
    delete (window as unknown as { __cinema?: unknown }).__cinema;
  }
}

function projCard(m: ProjectMeta): string {
  const d = m.dur;
  return `<div class="cin-proj"><button style="all:unset;display:block;width:100%;cursor:pointer" data-a="open" data-v="${m.id}">${m.thumb ? `<img src="${m.thumb}" alt="">` : '<div class="ph">🎬</div>'}<div class="meta">${esc(m.title)}<small>${fmtT(d)}</small></div></button><span class="tag">${m.mode.toUpperCase()}</span><button class="more" data-a="more" data-v="${m.id}" aria-label="${t('cin.home.more', 'Opções')}">⋮</button></div>`;
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const app = new CinemaApp(root, exit);
  const remix = takeRemix();
  app.noAuto = !!remix;
  await app.home();
  if (remix) void app.openRemix(remix);
  return {
    destroy: () => app.destroy(),
    pause: () => app.pause(),
    resume: () => {},
  };
}
