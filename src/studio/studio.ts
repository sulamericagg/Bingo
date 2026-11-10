/* ============================================================
 *  BLOOP STUDIO — aplicativo: renderizador, mundo, editor ↔ jogar,
 *  barra de cima, doca de ferramentas, salvar/abrir, loja.
 *  Carregado sob demanda pelo hub (register.ts). three.js aqui; cannon-es
 *  só quando aperta "Testar".
 * ============================================================ */
import * as THREE from 'three';
import './studio.css';
import { t } from '../i18n';
import { detectInitialTier, loadMode, type Tier } from '../core/quality';
import { q3For } from '../3d/common/quality';
import { roomEnv, disposeEnv } from '../3d/common/pbr';
import { addCoins } from '../core/economy';
import { dayNumber } from '../core/storage';
import { clearNotify, notify, setNotifyTop, resetNotifyTop } from '../ui/notify';
import { createJoystick, edges, type Joystick } from '../ui/touch';
import type { MiniGameHandle } from '../hub/registry';
import { emptyCreation, findDep, LIMITS, partCount, refIds, validate, type Creation, type CreationKind, type WorldKind } from './format';
import { Editor, type Tool } from './editor/editor';
import { buildCreation, captureThumb, disposeTree } from './render/build';
import { disposeGeoCache } from './render/geo';
import { disposeMaterials, setMaterialQuality } from './render/mats';
import { createWorld, type WorldView } from './world/terrain';
import { countMaps, loadMine, preload, remember, resolveSync, saveMine } from './library';
import { isPro, mapLimit, partLimit, setDebugPro } from './pro';
import { localAuthor, store } from './store-mock';
import { sicon } from './ui/sicons';
import { Panels, type PanelId } from './ui/panels';
import type { PlaySession } from './play/session';
import type { ShareLink } from './share';
import { deserialize } from './format';

export interface StudioOptions {
  /** link de compartilhar recebido (#/studio/p/<id> ou #/studio/c/<código>) */
  link?: ShareLink;
}

const LAST = 'bs-last';

export class Studio {
  readonly el: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ui: HTMLElement;
  readonly hudLayer: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.05, 1500);
  readonly tier: Tier;
  readonly standard: boolean;
  readonly detail: number;
  editor: Editor;
  world!: WorldView;
  panels: Panels;
  mode: 'edit' | 'play' = 'edit';
  play: PlaySession | null = null;
  dirty = false;
  private raf = 0;
  private last = 0;
  private paused = false;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ro: ResizeObserver;
  private flyJoy: Joystick | null = null;
  private flyV = 0;
  private autosaveT = 0;
  /** jogando uma criação da loja sem editar: volta para esta */
  private resume: { doc: Creation; world: WorldKind; seed: number; hist: boolean } | null = null;
  private measureEl: HTMLElement;
  private selEl: HTMLElement;
  private undoBtn!: HTMLButtonElement;
  private redoBtn!: HTMLButtonElement;
  private nameEl!: HTMLButtonElement;
  private disposed = false;
  private playingListing: string | null = null;

  constructor(
    root: HTMLElement,
    private exit: () => void,
  ) {
    this.tier = (loadMode() === 'auto' ? detectInitialTier() : (loadMode() as Tier)) as Tier;
    const q = q3For(this.tier);
    this.standard = q.standard;
    this.detail = this.tier;
    setMaterialQuality(q.standard);
    this.el = document.createElement('div');
    this.el.className = 'bs-root';
    root.appendChild(this.el);
    this.renderer = new THREE.WebGLRenderer({ antialias: this.tier >= 2, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(q.pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = q.standard ? 1.05 : 1.2;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'bs-canvas';
    this.el.appendChild(this.canvas);
    if (q.standard) {
      this.scene.environment = roomEnv(this.renderer);
      this.scene.environmentIntensity = 0.5;
    }
    this.hemi = new THREE.HemisphereLight('#ffffff', '#8a7ab0', q.standard ? 1.25 : 1.6);
    this.sun = new THREE.DirectionalLight('#fff4e0', q.standard ? 2.2 : 1.5);
    this.sun.position.set(8, 16, 6);
    this.sun.castShadow = q.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -24;
    sc.right = sc.top = 24;
    sc.far = 80;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.hudLayer = document.createElement('div');
    this.hudLayer.className = 'bs-hud';
    this.ui = document.createElement('div');
    this.ui.className = 'bs-ui';
    this.el.append(this.hudLayer, this.ui);
    this.measureEl = document.createElement('div');
    this.measureEl.className = 'bs-measure';
    this.measureEl.hidden = true;
    this.selEl = document.createElement('div');
    this.selEl.className = 'bs-selchip';
    this.selEl.hidden = true;
    this.ui.append(this.measureEl, this.selEl);

    this.editor = new Editor({
      scene: this.scene,
      camera: this.camera,
      canvas: this.canvas,
      resolve: (id) => resolveSync(id),
      detail: this.detail,
      ground: () => this.world.pickables(),
      groundHeight: (x, z) => {
        const h = this.world.heightAt(x, z);
        return Number.isFinite(h) ? h : -50;
      },
      canAdd: (n) => this.canAdd(n),
      radial: (x, y) => this.panels.radial(x, y),
      reserved: (x, y) => this.editor.cam.mode === 'fly' && this.inFlyZone(x, y),
    });
    this.panels = new Panels(this);
    this.buildChrome();
    this.editor.on((k) => this.onEditorChange(k));

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.resize();
    setNotifyTop(54);
  }

  /* --------------------------------- início --------------------------------- */

  async start(o: StudioOptions = {}): Promise<void> {
    let doc: Creation | null = null;
    let lastId = '';
    try {
      lastId = localStorage.getItem(LAST) || '';
    } catch {
      /* */
    }
    if (lastId) doc = await loadMine(lastId).catch(() => null);
    const first = !doc;
    if (!doc) {
      const me = localAuthor();
      doc = emptyCreation('object', t('studio.newObject', 'Minha criação'), me.name, me.id);
      doc.worldKind = 'void';
    }
    await this.openDoc(doc);
    this.loop();
    if (o.link) await this.openLink(o.link);
    else if (first) this.panels.open('library');
  }

  /** abre um link de compartilhar: joga (mapas) ou experimenta (objetos/veículos) */
  async openLink(l: ShareLink): Promise<void> {
    let c: Creation | null = null;
    if (l.id) c = (await store().get(l.id))?.creation ?? null;
    else if (l.code) c = (await deserialize(l.code).catch(() => null))?.creation ?? null;
    if (!c) {
      notify(t('studio.linkBad', 'Esse link não abriu (criação não encontrada)'), { icon: 'warning', kind: 'warn' });
      return;
    }
    remember(c);
    notify(t('studio.linkOpen', '“{n}” de {a}', { n: c.game?.title ?? c.name, a: c.author || '?' }), { icon: 'link' });
    await this.playStoreMap(c.kind === 'map' ? c : { ...c, worldKind: c.kind === 'vehicle' ? 'infinite' : c.worldKind ?? 'flat' }, !!l.id);
  }

  /** 3 fotos do mapa (ângulos diferentes) para o Jogo da Comunidade */
  thumbs3(): string[] {
    const g = this.editor.group;
    const vis = g.visible;
    g.visible = true;
    const dirs: [number, number, number][] = [
      [0.75, 0.55, 1],
      [0.05, 1.6, 0.25],
      [-1, 0.35, -0.6],
    ];
    const out = dirs.map((d) => captureThumb(this.renderer, g, 240, 160, d));
    g.visible = vis;
    return out;
  }

  async openDoc(doc: Creation): Promise<void> {
    if (doc.deps) for (const d of doc.deps) remember(d);
    await preload(refIds(doc), async (id) => (await store().get(id))?.creation ?? null);
    this.setWorld(doc.worldKind ?? defaultWorld(doc.kind), doc.seed ?? 1);
    this.editor.load(doc);
    this.editor.frameAll();
    this.dirty = false;
    try {
      localStorage.setItem(LAST, doc.id);
    } catch {
      /* */
    }
    this.refreshChrome();
  }

  newDoc(kind: CreationKind): void {
    const me = localAuthor();
    const name = kind === 'vehicle' ? t('studio.newVehicle', 'Meu veículo') : kind === 'map' ? t('studio.newMap', 'Meu mapa') : t('studio.newObject', 'Minha criação');
    const d = emptyCreation(kind, name, me.name, me.id);
    d.worldKind = defaultWorld(kind);
    d.seed = (Math.random() * 1e6) | 0;
    void this.openDoc(d);
    this.editor.cam.target.set(0, 0.5, 0);
    this.editor.cam.dist = kind === 'map' ? 22 : 9;
    this.editor.cam.pitch = kind === 'map' ? 0.75 : 0.5;
  }

  setWorld(kind: WorldKind, seed: number): void {
    if (this.world && this.world.kind === kind && (kind !== 'infinite' || (this.world as unknown as { gen?: { seed: number } }).gen?.seed === seed)) return;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.world = createWorld(kind, seed, this.tier);
    this.scene.add(this.world.group);
    this.scene.background = this.world.sky.clone();
    this.scene.fog = new THREE.Fog(this.world.sky.clone(), this.world.fogFar * 0.45, this.world.fogFar);
    this.camera.far = Math.max(400, this.world.fogFar * 1.2);
    this.camera.updateProjectionMatrix();
    this.editor?.setGridSize(kind === 'void' ? 14 : 60);
  }

  /* ---------------------------------- limites ---------------------------------- */

  canAdd(n: number): boolean {
    const doc = this.editor.doc;
    const cur = partCount(doc, resolveSync);
    const lim = partLimit(this.tier);
    if (cur + n <= Math.min(lim, LIMITS.parts)) return true;
    if (!isPro() && partLimit(this.tier, true) > lim) this.panels.paywall('parts');
    else notify(t('studio.limitParts', 'Limite de {n} peças neste aparelho', { n: lim }), { icon: 'warning', kind: 'warn' });
    return false;
  }

  /* ---------------------------------- salvar ---------------------------------- */

  /** junta as importadas dentro do mapa (abre offline) */
  private withDeps(doc: Creation): Creation {
    const ids = refIds(doc);
    if (!ids.length) {
      const { deps: _d, ...rest } = doc;
      void _d;
      return rest;
    }
    const deps: Creation[] = [];
    for (const id of ids.slice(0, LIMITS.deps)) {
      const c = findDep(doc, id) ?? resolveSync(id);
      if (c) {
        const { deps: _dd, thumbnail: _th, ...rest } = c;
        void _dd;
        void _th;
        deps.push(rest);
      }
    }
    return { ...doc, deps };
  }

  async save(quiet = false): Promise<boolean> {
    const doc = this.editor.doc;
    if (doc.kind === 'map') {
      const exists = await loadMine(doc.id).catch(() => null);
      if (!exists && (await countMaps()) >= mapLimit()) {
        if (!quiet) this.panels.paywall('maps');
        return false;
      }
    }
    try {
      doc.thumbnail = this.thumb();
      const full = this.withDeps(doc);
      await saveMine(full);
      doc.deps = full.deps;
      this.dirty = false;
      if (!quiet) notify(t('studio.saved', 'Salvo em Minhas criações'), { icon: 'check', kind: 'good', key: 'saved' });
      return true;
    } catch {
      if (!quiet) notify(t('studio.saveFail', 'Não deu para salvar (espaço cheio?)'), { icon: 'warning', kind: 'bad' });
      return false;
    }
  }

  thumb(c: Creation = this.editor.doc): string {
    const g = c === this.editor.doc ? this.editor.group : buildCreation(c, resolveSync, { detail: 1, edit: false });
    const vis = g.visible;
    g.visible = true;
    const url = captureThumb(this.renderer, g);
    g.visible = vis;
    if (g !== this.editor.group) disposeTree(g);
    return url;
  }

  /* ---------------------------------- jogar ---------------------------------- */

  async startPlay(doc = this.editor.doc, exitLabel = t('studio.edit', 'Editar')): Promise<void> {
    if (this.mode === 'play') return;
    this.panels.closeAll();
    this.mode = 'play';
    this.el.classList.add('playing');
    this.editor.setEnabled(false);
    this.stopFly();
    const C = await import('cannon-es');
    if (this.disposed || this.mode !== 'play') return;
    const { PlaySession } = await import('./play/session');
    await preload(refIds(doc), async (id) => (await store().get(id))?.creation ?? null);
    this.play = new PlaySession(C, {
      scene: this.scene,
      camera: this.camera,
      canvas: this.canvas,
      layer: this.hudLayer,
      world: this.world,
      resolve: resolveSync,
      detail: this.detail,
      tier: this.tier,
      standard: this.standard,
      exitLabel: sicon('back', 18) + `<span>${exitLabel}</span>`,
      onExit: () => this.stopPlay(),
      onWin: (sec, score) => this.onWin(doc, sec, score),
    }, doc);
  }

  stopPlay(): void {
    if (this.mode !== 'play') return;
    this.play?.dispose();
    this.play = null;
    this.mode = 'edit';
    this.el.classList.remove('playing');
    clearNotify();
    if (this.resume) {
      const r = this.resume;
      this.resume = null;
      this.setWorld(r.world, r.seed);
      this.editor.setEnabled(true);
      this.panels.open('store');
    } else this.editor.setEnabled(true);
    this.refreshChrome();
  }

  /** "Jogar mapa" da loja: joga sem mexer no que está editando */
  async playStoreMap(c: Creation, listed = true): Promise<void> {
    if (listed) void store().recordUse(c.id, 'play');
    this.playingListing = listed ? c.id : null;
    this.resume = { doc: this.editor.doc, world: this.world.kind, seed: (this.world as unknown as { gen?: { seed: number } }).gen?.seed ?? 1, hist: true };
    if (c.deps) for (const d of c.deps) remember(d);
    this.setWorld(c.worldKind ?? defaultWorld(c.kind), c.seed ?? 1);
    await this.startPlay(c, t('studio.back', 'Voltar'));
  }

  private onWin(doc: Creation, sec: number, score = 0): void {
    if (this.playingListing === doc.id)
      void store()
        .submitScore(doc.id, { score, timeSec: sec })
        .then((r) => setTimeout(() => notify(t('studio.rank', 'Seu lugar no placar: {n}º', { n: r.rank }), { icon: 'trophy', kind: 'good' }), 2600));
    // recompensa pequena: 1× por mapa por dia (sem fazenda de moedas)
    const key = 'bs-win:' + doc.id;
    let last = -1;
    try {
      last = parseInt(localStorage.getItem(key) || '-1', 10);
    } catch {
      /* */
    }
    const today = dayNumber();
    if (last !== today && doc.parts.length >= 8) {
      addCoins(5);
      try {
        localStorage.setItem(key, String(today));
      } catch {
        /* */
      }
      setTimeout(() => notify(t('studio.winCoins', '+5 moedas por completar o mapa'), { icon: 'coin', kind: 'good' }), 1300);
    }
  }

  /* ---------------------------------- interface ---------------------------------- */

  private buildChrome(): void {
    const top = document.createElement('div');
    top.className = 'bs-top';
    top.innerHTML = `
      <button class="bs-ib" data-a="exit" aria-label="${t('studio.exit', 'Sair')}">${sicon('back')}</button>
      <button class="bs-ib" data-a="library" aria-label="${t('studio.library', 'Minhas criações')}">${sicon('folder')}</button>
      <button class="bs-name" data-a="rename"></button>
      <span class="bs-sp"></span>
      <button class="bs-ib" data-a="undo" aria-label="${t('studio.undo', 'Desfazer')}">${sicon('undo')}</button>
      <button class="bs-ib" data-a="redo" aria-label="${t('studio.redo', 'Refazer')}">${sicon('redo')}</button>
      <span class="bs-sp"></span>
      <button class="bs-ib" data-a="cam" aria-label="${t('studio.camera', 'Câmera')}">${sicon('orbit')}</button>
      <button class="bs-ib" data-a="frame" aria-label="${t('studio.frame', 'Enquadrar')}">${sicon('frame')}</button>
      <button class="bs-ib" data-a="save" aria-label="${t('studio.save', 'Salvar')}">${sicon('save')}</button>
      <button class="bs-ib bs-store" data-a="store">${sicon('store')}<span>${t('studio.store', 'Loja')}</span></button>
      <button class="bs-test" data-a="play">${sicon('play', 18)}<span>${t('studio.test', 'Testar')}</span></button>`;
    this.ui.appendChild(top);
    this.undoBtn = top.querySelector('[data-a=undo]')!;
    this.redoBtn = top.querySelector('[data-a=redo]')!;
    this.nameEl = top.querySelector('[data-a=rename]')!;
    top.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (!b) return;
      const a = b.dataset.a!;
      if (a === 'exit') this.back();
      else if (a === 'library') this.panels.toggle('library');
      else if (a === 'rename') this.panels.open('info');
      else if (a === 'undo') this.toastLabel(this.editor.undo(), true);
      else if (a === 'redo') this.toastLabel(this.editor.redo(), false);
      else if (a === 'cam') this.toggleCam();
      else if (a === 'frame') this.editor.frameAll();
      else if (a === 'save') void this.save();
      else if (a === 'store') this.panels.toggle('store');
      else if (a === 'play') void this.startPlay();
    });

    const dock = document.createElement('div');
    dock.className = 'bs-dock';
    const tools: [string, string, string, boolean?][] = [
      ['add', 'add', t('studio.tool.add', 'Adicionar')],
      ['move', 'move', t('studio.tool.move', 'Mover')],
      ['rotate', 'rotate', t('studio.tool.rotate', 'Girar')],
      ['scale', 'scale', t('studio.tool.scale', 'Tamanho')],
      ['paint', 'paint', t('studio.tool.paint', 'Pintar')],
      ['pen', 'pen', t('studio.tool.pen', 'Caneta 3D'), true],
      ['mech', 'mech', t('studio.tool.mech', 'Mecânica')],
      ['logic', 'logic', t('studio.tool.logic', 'Lógica'), true],
      ['measure', 'measure', t('studio.tool.measure', 'Medir')],
      ['layers', 'layers', t('studio.tool.layers', 'Camadas')],
      ['world', 'world', t('studio.tool.world', 'Mundo')],
    ];
    dock.innerHTML = tools.map(([id, ic, label, pro]) => `<button class="bs-tool" data-t="${id}">${sicon(ic)}<span>${label}</span>${pro ? '<i class="bs-pro">PRO</i>' : ''}</button>`).join('');
    dock.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-t]');
      if (b) this.onTool(b.dataset.t!);
    });
    this.ui.appendChild(dock);

    // encaixes (coluna à esquerda)
    const snaps = document.createElement('div');
    snaps.className = 'bs-snaps';
    snaps.innerHTML = `
      <button class="bs-snap" data-s="grid">${sicon('grid', 18)}<b></b></button>
      <button class="bs-snap" data-s="angle">${sicon('angle', 18)}<b></b></button>
      <button class="bs-snap" data-s="surface">${sicon('magnet', 18)}</button>
      <button class="bs-snap" data-s="multi">${sicon('multi', 18)}</button>`;
    snaps.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-s]');
      if (!b) return;
      const ed = this.editor;
      const s = b.dataset.s;
      if (s === 'grid') {
        const seq = [0.5, 0.25, 1, 0];
        ed.grid = seq[(seq.indexOf(ed.grid) + 1) % seq.length];
        notify(ed.grid ? t('studio.snap.grid', 'Grade: {n} m', { n: String(ed.grid).replace('.', ',') }) : t('studio.snap.gridOff', 'Grade desligada'), { icon: 'check', key: 'snap' });
      } else if (s === 'angle') {
        const seq = [15, 45, 90, 0];
        ed.angle = seq[(seq.indexOf(ed.angle) + 1) % seq.length];
        notify(ed.angle ? t('studio.snap.angle', 'Ângulo: {n}°', { n: ed.angle }) : t('studio.snap.angleOff', 'Ângulo livre'), { icon: 'check', key: 'snap' });
      } else if (s === 'surface') {
        ed.surface = !ed.surface;
        notify(ed.surface ? t('studio.snap.surfOn', 'Grudar nas superfícies: ligado') : t('studio.snap.surfOff', 'Grudar nas superfícies: desligado'), { icon: 'magnet', key: 'snap' });
      } else if (s === 'multi') {
        ed.multi = !ed.multi;
        notify(ed.multi ? t('studio.multiOn', 'Seleção múltipla: toque em várias peças') : t('studio.multiOff', 'Seleção simples'), { icon: 'check', key: 'snap' });
      }
      this.refreshChrome();
    });
    this.ui.appendChild(snaps);

    // botões do voo (subir/descer)
    const fly = document.createElement('div');
    fly.className = 'bs-flyud';
    fly.innerHTML = `<button data-v="1">${sicon('up')}</button><button data-v="-1">${sicon('down')}</button>`;
    fly.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const v = Number(b.dataset.v);
      b.addEventListener('pointerdown', () => (this.flyV = v));
      const up = () => (this.flyV = 0);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('pointerleave', up);
    });
    this.ui.appendChild(fly);

    this.selEl.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-q]');
      if (!b) return;
      const q = b.dataset.q;
      if (q === 'dup') this.editor.duplicate();
      else if (q === 'del') this.editor.remove();
      else if (q === 'more') {
        const r = b.getBoundingClientRect();
        this.panels.radial(r.left + r.width / 2, r.bottom + 70);
      } else if (q === 'clear') this.editor.clearSelection();
    });
  }

  private toastLabel(label: string | null, undo: boolean): void {
    if (!label) return;
    notify((undo ? t('studio.undone', 'Desfeito') : t('studio.redone', 'Refeito')) + ' · ' + actionName(label), { icon: 'refresh', key: 'undo' });
  }

  onTool(id: string): void {
    const ed = this.editor;
    if (id === 'add' || id === 'mech' || id === 'layers' || id === 'world') {
      this.panels.toggle(id as PanelId);
      return;
    }
    if (id === 'logic') {
      if (!isPro()) return this.panels.paywall('logic');
      this.panels.toggle('logic');
      return;
    }
    if (id === 'pen' && !isPro()) return this.panels.paywall('pen');
    this.panels.closeAll();
    ed.setTool(id as Tool);
    if (id === 'paint' || id === 'pen') this.panels.open(id === 'paint' ? 'paint' : 'pen');
    if (id === 'measure') notify(t('studio.measureTip', 'Toque em dois pontos para medir'), { icon: 'hand-tap', key: 'tip' });
    if (id === 'pen') notify(t('studio.penTip', 'Desenhe no ar com o dedo · 2 dedos movem a câmera'), { icon: 'pencil', key: 'tip' });
    this.refreshChrome();
  }

  toggleCam(): void {
    const ed = this.editor;
    ed.cam.setMode(ed.cam.mode === 'orbit' ? 'fly' : 'orbit');
    if (ed.cam.mode === 'fly') {
      this.flyJoy = createJoystick(this.el, { zone: (x, y, r) => this.flyZoneRel(x, y, r), mouse: false });
      notify(t('studio.flyTip', 'Modo voo: joystick anda, arraste para olhar'), { icon: 'hand-tap', key: 'tip' });
    } else this.stopFly();
    this.refreshChrome();
  }
  private stopFly(): void {
    this.flyJoy?.destroy();
    this.flyJoy = null;
    if (this.editor.cam.mode === 'fly') this.editor.cam.setMode('orbit');
  }
  private flyZoneRel(x: number, y: number, r: DOMRect): boolean {
    return x < r.width * 0.36 && y > r.height * 0.35 && y < r.height - 64;
  }
  private inFlyZone(x: number, y: number): boolean {
    const r = this.el.getBoundingClientRect();
    return this.flyZoneRel(x - r.left, y - r.top, r);
  }

  private onEditorChange(k: string): void {
    if (k === 'doc') {
      this.dirty = true;
      this.autosaveT = 20;
    }
    this.refreshChrome();
  }

  refreshChrome(): void {
    const ed = this.editor;
    if (!ed.doc) return;
    this.undoBtn.disabled = !ed.hist.canUndo;
    this.redoBtn.disabled = !ed.hist.canRedo;
    const kindName = ed.doc.kind === 'map' ? t('studio.kind.map', 'Mapa') : ed.doc.kind === 'vehicle' ? t('studio.kind.vehicle', 'Veículo') : t('studio.kind.object', 'Objeto');
    this.nameEl.innerHTML = `<b>${esc(ed.doc.name)}</b><small>${kindName} · ${ed.doc.parts.length}</small>`;
    this.ui.querySelectorAll<HTMLElement>('.bs-tool').forEach((b) => {
      const id = b.dataset.t!;
      b.classList.toggle('on', ed.tool === id || this.panels.current === id);
    });
    this.ui.querySelectorAll<HTMLElement>('.bs-pro').forEach((b) => (b.hidden = isPro()));
    const g = this.ui.querySelector('[data-s=grid]')!;
    g.classList.toggle('on', !!ed.grid);
    g.querySelector('b')!.textContent = ed.grid ? String(ed.grid).replace('0.', ',') : '';
    const a = this.ui.querySelector('[data-s=angle]')!;
    a.classList.toggle('on', !!ed.angle);
    a.querySelector('b')!.textContent = ed.angle ? ed.angle + '°' : '';
    this.ui.querySelector('[data-s=surface]')!.classList.toggle('on', ed.surface);
    this.ui.querySelector('[data-s=multi]')!.classList.toggle('on', ed.multi);
    this.ui.querySelector('[data-a=cam]')!.innerHTML = sicon(ed.cam.mode === 'fly' ? 'fly' : 'orbit');
    this.el.classList.toggle('flying', ed.cam.mode === 'fly');
    // chip da seleção
    const n = ed.sel.size;
    this.selEl.hidden = !n || this.mode !== 'edit';
    if (n) {
      const b = ed.selBox();
      const s = b.getSize(new THREE.Vector3());
      const f = (v: number) => (Math.round(v * 100) / 100).toLocaleString('pt-BR');
      this.selEl.innerHTML = `<span>${n === 1 ? t('studio.sel1', '1 peça') : t('studio.selN', '{n} peças', { n })} · ${f(s.x)}×${f(s.y)}×${f(s.z)} m</span>
        <button data-q="dup" aria-label="${t('studio.dup', 'Duplicar')}">${sicon('dup', 18)}</button>
        <button data-q="del" aria-label="${t('studio.del', 'Apagar')}">${sicon('trash', 18)}</button>
        <button data-q="more" aria-label="${t('studio.more', 'Mais')}">${sicon('more', 18)}</button>
        <button data-q="clear" aria-label="${t('studio.close', 'Fechar')}">${sicon('close', 16)}</button>`;
    }
    this.panels.refresh();
  }

  /* ---------------------------------- laço ---------------------------------- */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused) return;
    const now = performance.now();
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 0.016);
    this.last = now;
    const ed = this.editor;
    let focus: THREE.Vector3;
    if (this.mode === 'play' && this.play) {
      this.play.update(dt);
      focus = this.camera.position;
    } else {
      if (ed.cam.mode === 'fly' && this.flyJoy) {
        const s = this.flyJoy.read();
        ed.cam.fly(dt, s.x, -s.y, this.flyV);
      }
      ed.update(dt);
      focus = ed.cam.mode === 'orbit' ? ed.cam.target : this.camera.position;
      this.world.update(focus);
      this.updateMeasure();
      if (this.dirty) {
        this.autosaveT -= dt;
        if (this.autosaveT <= 0) {
          this.autosaveT = 30;
          void this.save(true);
        }
      }
    }
    this.sun.position.set(focus.x + 8, focus.y + 16, focus.z + 6);
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.renderer.render(this.scene, this.camera);
  };

  private updateMeasure(): void {
    const m = this.editor.measure;
    const el = this.measureEl;
    if (this.editor.tool !== 'measure' || !m.a) {
      el.hidden = true;
      return;
    }
    const p = m.b ? m.a.clone().add(m.b).multiplyScalar(0.5) : m.a.clone();
    const v = p.project(this.camera);
    const r = this.el.getBoundingClientRect();
    el.hidden = v.z > 1;
    el.style.left = ((v.x + 1) / 2) * r.width + 'px';
    el.style.top = ((1 - v.y) / 2) * r.height + 'px';
    el.textContent = m.b ? (Math.round(m.a.distanceTo(m.b) * 100) / 100).toLocaleString('pt-BR') + ' m' : t('studio.measure2', 'toque no 2º ponto');
  }

  private resize(): void {
    const w = this.el.clientWidth || window.innerWidth;
    const h = this.el.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** voltar (Android/Esc): fecha painel → sai do jogar → sai do estúdio */
  back(): void {
    if (this.panels.closeTop()) return;
    if (this.mode === 'play') {
      this.stopPlay();
      return;
    }
    this.exit();
  }

  pause(): void {
    this.paused = true;
  }
  resumeLoop(): void {
    this.paused = false;
    this.last = 0;
  }

  dispose(): void {
    if (this.dirty) void this.save(true);
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.play?.dispose();
    this.stopFly();
    this.panels.dispose();
    this.editor.dispose();
    this.world?.dispose();
    this.ro.disconnect();
    disposeGeoCache();
    disposeMaterials();
    disposeEnv();
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    resetNotifyTop();
    clearNotify();
    this.el.remove();
  }

  /** ganchos para testes (?debug) */
  debugApi(): Record<string, unknown> {
    return {
      studio: this,
      editor: this.editor,
      setPro: (v: boolean | null) => {
        setDebugPro(v);
        this.refreshChrome();
      },
      validate,
      edges,
    };
  }
}

export function defaultWorld(kind: CreationKind): WorldKind {
  return kind === 'map' ? 'flat' : kind === 'vehicle' ? 'infinite' : 'void';
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function actionName(label: string): string {
  const N: Record<string, () => string> = {
    add: () => t('studio.act.add', 'adicionar'),
    move: () => t('studio.act.move', 'mover'),
    rotate: () => t('studio.act.rotate', 'girar'),
    scale: () => t('studio.act.scale', 'tamanho'),
    paint: () => t('studio.act.paint', 'pintar'),
    del: () => t('studio.act.del', 'apagar'),
    dup: () => t('studio.act.dup', 'duplicar'),
    pen: () => t('studio.act.pen', 'traço'),
  };
  return N[label]?.() ?? t('studio.act.edit', 'edição');
}

let current: Studio | null = null;

export async function launch(root: HTMLElement, exit: () => void, o: StudioOptions = {}): Promise<MiniGameHandle> {
  const s = new Studio(root, exit);
  current = s;
  if (location.search.includes('debug')) (window as unknown as { __studio: unknown }).__studio = s.debugApi();
  await s.start(o);
  return {
    destroy: () => {
      s.dispose();
      if (current === s) current = null;
    },
    pause: () => s.pause(),
    resume: () => s.resumeLoop(),
  };
}
