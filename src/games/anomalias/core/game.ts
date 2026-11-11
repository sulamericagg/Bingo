/* ============================================================
 *  ANOMALIAS & CIA — entrada do jogo: menu (mapas, noites, dificuldade),
 *  carregamento do mapa, turno, resultado (estrelas/moedas → reportRun,
 *  que abre a pausa de anúncio entre noites), pausa e voltar.
 *  O menu tem uma cena 3D pequena (o Bocudo) para a tela continuar deitada.
 * ============================================================ */
import './anomalias.css';
import '../modes/modes.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { addCoins } from '../../../core/economy';
import { tap } from '../../../core/haptics';
import { pushBack } from '../../../core/back';
import { detectInitialTier, deviceCeiling, loadMode, type Tier } from '../../../core/quality';
import { reportRun, type MiniGameHandle } from '../../../hub/registry';
import { MAP_META, loadMap, mapAvailable } from '../maps';
import type { MapBuild } from '../maps/types';
import { DIFF, DIFFS, GAME_ID, NIGHTS, coinsFor, starsFor, type Diff, type NightResult } from './data';
import { IC } from './icons';
import { Bocudo, disposeModels } from './models';
import { allMapStars, anoSave, corRec, corStars, lastMode, mapRec, mapUnlocked, nightUnlocked, persist, recNightUnlocked, recRec, recRecord, recStars, recordNight, setLastMode, totalStars } from './save';
import { MI, type ModeUi } from '../modes/ui';
import type { RecepcaoRun } from '../modes/recepcao/recepcao';
import type { CorredorRun, CResult } from '../modes/corredor/corredor';
import { THEMES, THEME_META, themeName, type ThemeId } from '../modes/meta';
import type { RResult } from '../modes/recepcao/data';
import { Shift } from './shift';
import { esc, hashStr } from './util';
import { setVoiceOn, stopVoice } from './voice';

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new AnomaliasGame(root, exit);
  g.showMenu();
  return g;
}

export function mapName(id: string): string {
  switch (id) {
    case 'hospital':
      return t('ano.map.hospital', 'Hospital');
    case 'creche':
      return t('ano.map.creche', 'Creche');
    case 'cabanas':
      return t('ano.map.cabanas', 'Cabanas');
    case 'fastfood':
      return t('ano.map.fastfood', 'Lanchonete');
    case 'posto24h':
      return t('ano.map.posto24h', 'Posto 24h');
  }
  return MAP_META.find((m) => m.id === id)?.pt ?? id;
}
function diffName(d: Diff): string {
  return d === 'facil' ? t('ano.diff.facil', 'Fácil') : d === 'normal' ? t('ano.diff.normal', 'Normal') : t('ano.diff.dificil', 'Difícil');
}
const DIFF_EMOJI: Record<Diff, string> = { facil: '🙂', normal: '😐', dificil: '😈' };

/** cena 3D do menu: o Bocudo balançando num corredor escuro (mantém a tela deitada) */
class MenuScene {
  readonly r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  private m = new Bocudo();
  private raf = 0;
  private t = 0;
  private last = 0;
  private ro: ResizeObserver;
  constructor(private host: HTMLElement) {
    this.r = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    this.r.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    this.r.domElement.className = 'ano-canvas';
    host.prepend(this.r.domElement);
    this.scene.background = new THREE.Color('#0b0820');
    this.scene.fog = new THREE.Fog('#0b0820', 6, 16);
    this.scene.add(new THREE.HemisphereLight('#9aa8ff', '#2a1f40', 1.6));
    const spot = new THREE.SpotLight('#ffe6b0', 60, 20, 0.5, 0.6, 1.2);
    spot.position.set(-2, 5, 4);
    spot.target.position.set(1.6, 0.8, 0);
    this.scene.add(spot, spot.target);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshLambertMaterial({ color: '#2a2348' }));
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    // portas ao fundo
    for (let i = -3; i <= 3; i++) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.1), new THREE.MeshLambertMaterial({ color: i % 2 ? '#3d3566' : '#4a3f7a' }));
      d.position.set(i * 2.2, 1.1, -4);
      this.scene.add(d);
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.05), new THREE.MeshBasicMaterial({ color: i === 1 ? '#ff5a7a' : '#7dffb0' }));
      l.position.set(i * 2.2, 2.45, -3.94);
      this.scene.add(l);
    }
    this.m.root.position.set(1.15, 0.15, 1.2);
    this.m.root.rotation.y = Math.PI - 0.35;
    this.scene.add(this.m.root);
    this.cam.position.set(0, 1.9, 6.5);
    this.cam.lookAt(1.1, 1.85, 0);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (now - this.last < 32) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.m.open = 0.35 + Math.max(0, Math.sin(this.t * 1.3)) * 0.55;
      this.m.root.rotation.y = Math.PI - 0.35 + Math.sin(this.t * 0.7) * 0.2;
      this.m.update(dt);
      this.r.render(this.scene, this.cam);
    };
    this.raf = requestAnimationFrame(loop);
  }
  resize(): void {
    const w = this.host.clientWidth || 1,
      h = this.host.clientHeight || 1;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }
  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    this.r.dispose();
    this.r.forceContextLoss();
    this.r.domElement.remove();
  }
}

export class AnomaliasGame implements MiniGameHandle {
  readonly wrap: HTMLDivElement;
  shift: Shift | null = null;
  private menu: HTMLDivElement | null = null;
  private menuScene: MenuScene | null = null;
  private sv = anoSave();
  /** modo extra rodando (Recepção / Corredor) */
  run: (RecepcaoRun | CorredorRun) | null = null;
  /** tela do menu: escolha de modo ou o submenu de um modo */
  private menuMode: '' | 'turno' | 'recepcao' | 'corredor' = '';
  private selRecNight = 1;
  private selTheme: ThemeId = 'hospital';
  private selMap = 'hospital';
  private selNight = 1;
  private backPop: (() => void) | null = null;
  private destroyed = false;
  private runs = 0;
  private tier: Tier;

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'ano-root';
    root.appendChild(this.wrap);
    setVoiceOn(this.sv.voice);
    const mode = loadMode();
    this.tier = mode === 'auto' ? (Math.min(detectInitialTier(), deviceCeiling()) as Tier) : mode;
    const rec = mapRec(this.selMap);
    this.selNight = Math.min(NIGHTS, rec.done + 1);
    if (location.search.includes('debug')) (window as unknown as { __ano: AnomaliasGame }).__ano = this;
  }

  /* ------------------------------ menu ------------------------------ */
  showMenu(): void {
    this.endShift();
    this.menu?.remove();
    if (!this.menuScene) this.menuScene = new MenuScene(this.wrap);
    const m = document.createElement('div');
    m.className = 'ano-menu';
    m.style.background = 'transparent';
    this.wrap.appendChild(m);
    this.menu = m;
    this.renderAny();
  }

  private renderAny(): void {
    if (this.menuMode === 'turno') this.renderMenu();
    else if (this.menuMode === 'recepcao') this.renderRecMenu();
    else if (this.menuMode === 'corredor') this.renderCorMenu();
    else this.renderModes();
    this.setBack(this.menuMode ? () => this.goModes() : null);
  }
  private goModes(): void {
    this.menuMode = '';
    this.renderAny();
  }

  /** escolha de modo: 3 cartões grandes */
  private renderModes(): void {
    const m = this.menu;
    if (!m) return;
    const totT = MAP_META.length * NIGHTS * 3;
    const card = (id: string, art: string, name: string, sub: string, stars: string, col: string) =>
      `<button class="ano-mode${lastMode() === id ? ' last' : ''}" data-mode="${id}" style="--c:${col}"><span class="art">${art}</span><b>${esc(name)}</b><small>${esc(sub)}</small><span class="st"><i>${IC.star()}</i>${stars}</span></button>`;
    m.innerHTML = `
<div class="top"><div class="ano-title"><i>${IC.bocudo()}</i><div>${esc(t('ano.name', 'Anomalias & Cia'))}<small>${esc(t('ano.modes.pick', 'Escolha um jeito de jogar'))}</small></div></div>
<button class="ano-btn sm" data-voice aria-label="voz">${IC.speaker(this.sv.voice)}</button>
<button class="ano-btn sm" data-exit aria-label="${esc(t('ano.exit', 'Sair'))}" style="background:#ff4f6a">${IC.close()}</button></div>
<div class="ano-modes">
${card('turno', `<i>${IC.camera()}</i><em>${IC.moon()}</em>`, t('ano.mode.turno', 'Turno da noite'), t('ano.mode.turnoSub', 'Ache o que mudou e tire foto'), `${allMapStars()}/${totT}`, '#7b5cff')}
${card('recepcao', `<i>${MI.card()}</i><em>${MI.door(false)}</em>`, t('ano.mode.recepcao', 'Recepção'), t('ano.mode.recepcaoSub', 'Abra só para quem é de verdade'), `${recStars()}/${NIGHTS * 3}`, '#ff8a4a')}
${card('corredor', `<i>${MI.exit()}</i><em>${MI.uturn()}</em>`, t('ano.mode.corredor', 'Corredor'), t('ano.mode.corredorSub', 'Algo diferente? Volte!'), `${corStars()}/12`, '#2fbf8f')}
</div>`;
    this.wireTop(m);
    m.querySelectorAll<HTMLElement>('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => {
        tap('light');
        this.menuMode = b.dataset.mode as 'turno';
        this.renderAny();
      }),
    );
  }

  private wireTop(m: HTMLElement): void {
    m.querySelector('[data-voice]')?.addEventListener('click', () => {
      tap('light');
      this.sv.voice = !this.sv.voice;
      setVoiceOn(this.sv.voice);
      persist();
      this.renderAny();
    });
    m.querySelector('[data-exit]')?.addEventListener('click', () => this.exitCb());
    m.querySelector('[data-back]')?.addEventListener('click', () => {
      tap('light');
      this.goModes();
    });
  }
  private subTop(title: string, sub: string, icon: string): string {
    return `<div class="top"><button class="ano-btn sm ano-back" data-back aria-label="${esc(t('ano.back', 'Voltar'))}">${IC.left()}</button><div class="ano-title"><i>${icon}</i><div>${esc(title)}<small>${esc(sub)}</small></div></div>
<button class="ano-btn sm" data-voice aria-label="voz">${IC.speaker(this.sv.voice)}</button></div>`;
  }

  /** submenu da Recepção: noites 1–5 */
  private renderRecMenu(): void {
    const m = this.menu;
    if (!m) return;
    const rec = recRec();
    const nights = Array.from({ length: NIGHTS }, (_, k) => {
      const n = k + 1;
      const ok = recNightUnlocked(n);
      const s = rec.stars[n] ?? 0;
      return `<button class="ano-night${n === this.selRecNight ? ' on' : ''}${ok ? '' : ' lock'}" data-n="${n}">${ok ? n : `<i class="lki">${IC.lock()}</i>`}<span class="ss">${ok ? [1, 2, 3].map((j) => `<i>${IC.star(j <= s)}</i>`).join('') : ''}</span></button>`;
    }).join('');
    const tools = ['card', 'list', 'light', 'zoom', 'ask', 'uv'];
    const toolIc = (k: string) => (k === 'card' ? MI.card() : k === 'list' ? MI.list() : k === 'light' ? MI.light(true) : k === 'zoom' ? MI.zoom() : k === 'ask' ? MI.ask() : MI.uv(true));
    const unlockAt: Record<string, number> = { card: 1, list: 1, light: 1, zoom: 1, ask: 2, uv: 3 };
    m.innerHTML = `${this.subTop(t('ano.mode.recepcao', 'Recepção'), t('ano.mode.recepcaoSub', 'Abra só para quem é de verdade'), MI.card())}
<div class="ano-rec-how"><span class="st"><i>${MI.card()}</i>=<i>${IC.eye()}</i>➜<i class="g">${MI.door(true)}</i></span><span class="st"><i>${MI.card()}</i>≠<i>${IC.eye()}</i>➜<i class="r">${MI.stop()}</i></span>
<span class="tools">${tools.map((k) => `<i class="${unlockAt[k] <= this.selRecNight ? '' : 'off'}">${toolIc(k)}</i>`).join('')}</span></div>
<div class="ano-row"><div class="ano-nights">${nights}</div></div>
<div class="ano-row last"><button class="ano-play" data-play><i>${MI.door(true)}</i>${esc(t('rec.play', 'Abrir a portaria'))}</button></div>`;
    this.wireTop(m);
    m.querySelectorAll<HTMLElement>('[data-n]').forEach((b) =>
      b.addEventListener('click', () => {
        tap('light');
        const n = Number(b.dataset.n);
        if (!recNightUnlocked(n)) return this.flashMsg(b, t('ano.nightLocked', 'Termine a noite anterior primeiro!'));
        this.selRecNight = n;
        this.renderRecMenu();
      }),
    );
    m.querySelector('[data-play]')!.addEventListener('click', () => {
      tap('light');
      void this.playRec(this.selRecNight);
    });
  }

  /** submenu do Corredor: 4 temas */
  private renderCorMenu(): void {
    const m = this.menu;
    if (!m) return;
    const cards = THEMES.map((id) => {
      const r = corRec(id);
      const meta = THEME_META[id];
      return `<button class="ano-map${id === this.selTheme ? ' on' : ''}" data-th="${id}" style="--c:${meta.color}"><span class="em">${meta.icon}</span>${esc(themeName(id))}<span class="st">${r.wins ? `<i>${IC.star()}</i>${r.stars}/3` : `${MI.fwd().replace('#fff', '#1d0b3a')}${r.best}/10`}</span></button>`;
    }).join('');
    m.innerHTML = `${this.subTop(t('ano.mode.corredor', 'Corredor'), t('ano.mode.corredorSub', 'Algo diferente? Volte!'), MI.exit())}
<div class="ano-maps">${cards}</div>
<div class="ano-cor-how"><span><i class="g">${IC.check()}</i>➜<i class="ar">${MI.fwd()}</i></span><span><i>${IC.bocudo()}</i>➜<i class="ar r">${MI.uturn()}</i></span><span class="lv">0 ➜ 10 ➜ <i>${MI.exit()}</i></span></div>
<div class="ano-row last"><button class="ano-play" data-play><i>${IC.play()}</i>${esc(t('cor.play', 'Entrar no corredor'))}</button></div>`;
    this.wireTop(m);
    m.querySelectorAll<HTMLElement>('[data-th]').forEach((b) =>
      b.addEventListener('click', () => {
        tap('light');
        this.selTheme = b.dataset.th as ThemeId;
        this.renderCorMenu();
      }),
    );
    m.querySelector('[data-play]')!.addEventListener('click', () => {
      tap('light');
      void this.playCor(this.selTheme);
    });
  }

  private renderMenu(): void {
    const m = this.menu;
    if (!m) return;
    const sv = this.sv;
    const maps = MAP_META.map((mm, i) => {
      const avail = mapAvailable(mm.id);
      const unl = mapUnlocked(i);
      const stars = totalStars(mm.id);
      const lock = !avail ? `<span class="soon">${esc(t('ano.soon', 'Em breve'))}</span>` : !unl ? `<span class="lk"><i>${IC.lock()}</i>${esc(t('ano.unlockAt', '{n} noites', { n: i * 2 }))}</span>` : '';
      return `<button class="ano-map${mm.id === this.selMap ? ' on' : ''}${!avail || !unl ? ' off' : ''}" data-map="${mm.id}" style="--c:${avail && unl ? mm.color : '#4a4466'}"><span class="em">${mm.icon}</span>${esc(mapName(mm.id))}<span class="st"><i>${IC.star()}</i>${stars}/${NIGHTS * 3}</span>${lock}</button>`;
    }).join('');
    const rec = mapRec(this.selMap);
    const nights = Array.from({ length: NIGHTS }, (_, k) => {
      const n = k + 1;
      const ok = nightUnlocked(this.selMap, n);
      const s = rec.stars[n] ?? 0;
      return `<button class="ano-night${n === this.selNight ? ' on' : ''}${ok ? '' : ' lock'}" data-n="${n}">${ok ? n : `<i class="lki">${IC.lock()}</i>`}<span class="ss">${ok ? [1, 2, 3].map((j) => `<i>${IC.star(j <= s)}</i>`).join('') : ''}</span></button>`;
    }).join('');
    const diffs = DIFFS.map((d) => `<button class="ano-diff${d === sv.diff ? ' on' : ''}" data-d="${d}">${DIFF_EMOJI[d]} ${esc(diffName(d))}</button>`).join('');
    m.innerHTML = `
${this.subTop(t('ano.mode.turno', 'Turno da noite'), t('ano.tagline', 'Turno da noite: ache o que mudou e tire foto!'), IC.camera())}
<div class="ano-maps">${maps}</div>
<div class="ano-row"><div class="ano-nights">${nights}</div></div>
<div class="ano-row last"><div class="ano-diffs">${diffs}</div>
<button class="ano-play" data-play><i>${IC.moon()}</i>${esc(t('ano.play', 'Começar turno'))}</button></div>`;
    const on = (sel: string, f: (b: HTMLElement) => void) =>
      m.querySelectorAll<HTMLElement>(sel).forEach((b) =>
        b.addEventListener('click', () => {
          tap('light');
          f(b);
        }),
      );
    on('[data-map]', (b) => {
      const id = b.dataset.map!;
      const i = MAP_META.findIndex((x) => x.id === id);
      if (!mapAvailable(id)) return this.flashMsg(b, t('ano.soonMsg', 'Esse lugar ainda está sendo construído!'));
      if (!mapUnlocked(i)) return this.flashMsg(b, t('ano.lockedMsg', 'Complete mais noites para abrir!'));
      this.selMap = id;
      this.selNight = Math.min(NIGHTS, mapRec(id).done + 1);
      this.renderMenu();
    });
    on('[data-n]', (b) => {
      const n = Number(b.dataset.n);
      if (!nightUnlocked(this.selMap, n)) return this.flashMsg(b, t('ano.nightLocked', 'Termine a noite anterior primeiro!'));
      this.selNight = n;
      this.renderMenu();
    });
    on('[data-d]', (b) => {
      sv.diff = b.dataset.d as Diff;
      persist();
      this.renderMenu();
    });
    this.wireTop(m);
    on('[data-play]', () => void this.play(this.selMap, this.selNight));
  }

  private flashMsg(anchor: HTMLElement, text: string): void {
    this.menu?.querySelectorAll('.ano-toast').forEach((e) => e.remove());
    const s = document.createElement('div');
    s.className = 'ano-toast';
    s.innerHTML = `<span class="ic">🔒</span><span>${esc(text)}</span>`;
    s.style.top = 'auto';
    s.style.bottom = 'calc(var(--ano-b) + 80px)';
    this.menu?.appendChild(s);
    anchor.classList.add('bad');
    setTimeout(() => s.remove(), 3300);
  }

  /* ------------------------------ turno ------------------------------ */
  async play(mapId: string, night: number, seedOverride?: number): Promise<void> {
    this.menu?.remove();
    this.menu = null;
    this.endShift();
    const ld = document.createElement('div');
    ld.className = 'ano-loading';
    ld.innerHTML = `<i>${IC.bocudo()}</i><span>${esc(t('ano.loading', 'Preparando o turno...'))}</span>`;
    this.wrap.appendChild(ld);
    let build: MapBuild;
    try {
      const def = await loadMap(mapId);
      build = await def.build({ tier: this.tier });
    } catch (e) {
      console.warn('[anomalias] mapa', e);
      ld.remove();
      this.showMenu();
      return;
    }
    if (this.destroyed) {
      build.dispose();
      return;
    }
    this.menuScene?.dispose();
    this.menuScene = null;
    this.runs++;
    this.sv.runs++;
    persist();
    const seed = seedOverride ?? hashStr(`${mapId}|${night}|${this.sv.runs}`);
    const first = !this.sv.tut.notebook;
    this.sv.tut.notebook = true;
    this.shift = new Shift({
      root: this.wrap,
      build,
      mapName: mapName(mapId),
      night,
      diff: this.sv.diff,
      seed,
      tier: this.tier,
      tutorial: first,
      onEnd: (r, caught) => this.onEnd(r, caught),
      onPause: () => this.pauseMenu(),
    });
    this.shift.start();
    this.menuMode = 'turno';
    setLastMode('turno');
    ld.remove();
    this.selMap = mapId;
    this.selNight = night;
  }

  /* ------------------------------ modos extras ------------------------------ */
  private async startRun(kind: 'recepcao' | 'corredor', make: () => Promise<RecepcaoRun | CorredorRun>): Promise<void> {
    this.menu?.remove();
    this.menu = null;
    this.endShift();
    const ld = document.createElement('div');
    ld.className = 'ano-loading';
    ld.innerHTML = `<i>${IC.bocudo()}</i><span>${esc(t('ano.loading', 'Preparando o turno...'))}</span>`;
    this.wrap.appendChild(ld);
    let run: RecepcaoRun | CorredorRun;
    try {
      run = await make();
    } catch (e) {
      console.warn('[anomalias] modo', e);
      ld.remove();
      this.showMenu();
      return;
    }
    if (this.destroyed) {
      run.dispose();
      return;
    }
    this.menuScene?.dispose();
    this.menuScene = null;
    this.runs++;
    this.sv.runs++;
    setLastMode(kind);
    this.menuMode = kind;
    this.run = run;
    run.start();
    ld.remove();
    this.setBack(() => this.modePause());
  }

  async playRec(night: number, seedOverride?: number): Promise<void> {
    this.selRecNight = night;
    const first = !this.sv.modes?.tutRec;
    await this.startRun('recepcao', async () => {
      const { RecepcaoRun } = await import('../modes/recepcao/recepcao');
      const seed = seedOverride ?? hashStr(`rec|${night}|${this.sv.runs}`);
      return new RecepcaoRun({
        root: this.wrap,
        night,
        seed,
        tier: this.tier,
        tutorial: first,
        finish: (r) => this.finishRec(r),
        onPause: () => this.modePause(),
        onMenu: () => this.showMenu(),
        onPlay: (n) => void this.playRec(n),
      });
    });
    if (first && this.sv.modes) {
      this.sv.modes.tutRec = true;
      persist();
    }
  }

  async playCor(theme: ThemeId, seedOverride?: number): Promise<void> {
    this.selTheme = theme;
    await this.startRun('corredor', async () => {
      const { CorredorRun } = await import('../modes/corredor/corredor');
      const seed = seedOverride ?? hashStr(`cor|${theme}|${this.sv.runs}`);
      return new CorredorRun({
        root: this.wrap,
        theme,
        seed,
        tier: this.tier,
        finish: (r) => this.finishCor(r),
        progress: (lv) => {
          const c = corRec(theme);
          if (lv > c.best) {
            c.best = lv;
            persist();
          }
        },
        onPause: () => this.modePause(),
        onMenu: () => this.showMenu(),
        onPlay: (th) => void this.playCor(th),
      });
    });
  }

  private finishRec(r: RResult): { stars: number; coins: number } {
    const stars = r.survived ? 1 + (r.letIn === 0 ? 1 : 0) + (r.complaints === 0 ? 1 : 0) : 0;
    const coins = Math.round((r.survived ? 10 + r.night * 5 : 3) + r.correct * 3);
    addCoins(coins);
    if (r.survived) recRecord(r.night, stars);
    else this.sv.caught++;
    persist();
    this.setBack(() => this.showMenu());
    reportRun({ game: GAME_ID, score: r.correct * 100 + (r.survived ? 500 : 0), coins, durationSec: r.sec, won: r.survived, stats: { recepcao: 1, night: r.night, correct: r.correct, total: r.total, letIn: r.letIn, complaints: r.complaints, stars } });
    return { stars, coins };
  }

  private finishCor(r: CResult): { stars: number; coins: number } {
    const stars = r.won ? 1 + (r.resets <= 2 ? 1 : 0) + (r.resets === 0 ? 1 : 0) : 0;
    const coins = r.won ? 30 + stars * 10 : 3 + r.best * 2;
    addCoins(coins);
    const c = corRec(r.theme);
    c.best = Math.max(c.best, r.best);
    if (r.won) {
      c.wins++;
      c.stars = Math.max(c.stars, stars);
    }
    persist();
    this.setBack(() => this.showMenu());
    reportRun({ game: GAME_ID, score: r.best * 100 + (r.won ? 1000 : 0), coins, durationSec: r.sec, won: r.won, stats: { corredor: 1, theme: THEMES.indexOf(r.theme), loops: r.loops, resets: r.resets, best: r.best, stars } });
    return { stars, coins };
  }

  /** pausa dos modos extras */
  private modePause(): void {
    const run = this.run;
    if (!run || !run.inMatch) return;
    run.pause();
    const ui: ModeUi = run.ui;
    const el = ui.card(
      `<div class="ano-h" style="justify-content:center">${esc(t('ano.paused', 'Pausa'))}</div>
<div class="btns"><button class="ano-b2 go" data-go><i>${IC.play()}</i>${esc(t('ano.continue', 'Continuar'))}</button><button class="ano-b2" data-voice><i>${IC.speaker(this.sv.voice)}</i>${esc(t('ano.voice', 'Voz'))}</button><button class="ano-b2" data-menu><i>${IC.moon()}</i>${esc(t('ano.leave', 'Sair do turno'))}</button></div>`,
      () => this.run?.resume(),
    );
    el.querySelector('[data-go]')!.addEventListener('click', () => ui.close());
    el.querySelector('[data-voice]')!.addEventListener('click', (e) => {
      this.sv.voice = !this.sv.voice;
      setVoiceOn(this.sv.voice);
      persist();
      (e.currentTarget as HTMLElement).querySelector('i')!.innerHTML = IC.speaker(this.sv.voice);
    });
    el.querySelector('[data-menu]')!.addEventListener('click', () => this.showMenu());
  }

  private endShift(): void {
    this.run?.dispose();
    this.run = null;
    this.shift?.dispose();
    this.shift = null;
    this.wrap.querySelectorAll('.ano-caught,.ano-dawn,.ano-panel').forEach((e) => e.remove());
  }

  private onEnd(r: NightResult, caught: boolean): void {
    const stars = starsFor(r);
    const coins = coinsFor(r);
    addCoins(coins);
    if (r.survived) recordNight(r.map, r.night, stars);
    else {
      this.sv.caught++;
      persist();
    }
    this.sv.photos += r.reported;
    persist();
    reportRun({ game: GAME_ID, score: r.reported * 100 + r.tasksDone * 50 + (r.survived ? 500 : 0), coins, durationSec: r.sec, won: r.survived, stats: { night: r.night, reported: r.reported, missed: r.missed, tasks: r.tasksDone, stars } });
    if (caught) this.caughtScreen(r, coins);
    else this.resultScreen(r, stars, coins);
  }

  private stat(icon: string, v: string | number): string {
    return `<span class="ano-stat"><i>${icon}</i>${esc(String(v))}</span>`;
  }
  private coinIc(): string {
    return `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffcf2e" stroke="#1d0b3a" stroke-width="4"/><circle cx="32" cy="32" r="16" fill="none" stroke="#e98f00" stroke-width="4"/></svg>`;
  }

  private caughtScreen(r: NightResult, coins: number): void {
    const c = document.createElement('div');
    c.className = 'ano-caught';
    c.setAttribute('data-touch-ignore', '');
    c.innerHTML = `<div class="ano-card ano-res"><div class="face">${IC.bocudo()}</div><h2>${esc(t('ano.caught', 'Você foi pego!'))}</h2>
<div class="stats">${this.stat(IC.camera(), r.reported)}${this.stat(IC.task(), `${r.tasksDone}/${r.tasksTotal}`)}${this.stat(this.coinIc(), '+' + coins)}</div>
<div class="btns"><button class="ano-b2 go" data-again><i>${IC.play()}</i>${esc(t('ano.retry', 'Tentar de novo'))}</button><button class="ano-b2" data-menu><i>${IC.moon()}</i>${esc(t('ano.menu', 'Menu'))}</button></div></div>`;
    this.wrap.appendChild(c);
    requestAnimationFrame(() => c.classList.add('on'));
    c.querySelector('[data-again]')!.addEventListener('click', () => void this.play(r.map, r.night));
    c.querySelector('[data-menu]')!.addEventListener('click', () => this.showMenu());
    this.setBack(() => this.showMenu());
  }

  private resultScreen(r: NightResult, stars: number, coins: number): void {
    const sh = this.shift;
    if (!sh) return;
    const next = r.night < NIGHTS;
    const done = r.night >= NIGHTS;
    const el = sh.hud.card(
      `<div class="ano-h" style="justify-content:center;margin:2px 0 4px"><i>${IC.sun()}</i>${esc(done ? t('ano.allNights', 'Você venceu todas as noites!') : t('ano.nightDone', 'Noite {n} completa!', { n: r.night }))}</div>
<div class="stars">${[1, 2, 3].map((j) => `<i class="${j <= stars ? 'on' : ''}" style="animation-delay:${j * 0.15}s">${IC.star(j <= stars)}</i>`).join('')}</div>
<div class="stats">${this.stat(IC.camera(), r.reported)}${this.stat(IC.bocudo(), r.missed)}${this.stat(IC.task(), `${r.tasksDone}/${r.tasksTotal}`)}${this.stat(this.coinIc(), '+' + coins)}</div>
<div class="btns">${next ? `<button class="ano-b2 go" data-next><i>${IC.play()}</i>${esc(t('ano.nextNight', 'Noite {n}', { n: r.night + 1 }))}</button>` : ''}<button class="ano-b2" data-again><i>${IC.moon()}</i>${esc(t('ano.again', 'Repetir'))}</button><button class="ano-b2" data-menu><i>${IC.book()}</i>${esc(t('ano.menu', 'Menu'))}</button></div>`,
      undefined,
      false,
    );
    el.querySelector('[data-next]')?.addEventListener('click', () => void this.play(r.map, r.night + 1));
    el.querySelector('[data-again]')!.addEventListener('click', () => void this.play(r.map, r.night));
    el.querySelector('[data-menu]')!.addEventListener('click', () => this.showMenu());
    this.setBack(() => this.showMenu());
  }

  private pauseMenu(): void {
    const sh = this.shift;
    if (!sh || !sh.inMatch) return;
    sh.pause();
    const el = sh.hud.card(
      `<div class="ano-h" style="justify-content:center">${esc(t('ano.paused', 'Pausa'))}</div>
<div class="btns"><button class="ano-b2 go" data-go><i>${IC.play()}</i>${esc(t('ano.continue', 'Continuar'))}</button><button class="ano-b2" data-voice><i>${IC.speaker(this.sv.voice)}</i>${esc(t('ano.voice', 'Voz'))}</button><button class="ano-b2" data-menu><i>${IC.moon()}</i>${esc(t('ano.leave', 'Sair do turno'))}</button></div>`,
      () => this.shift?.resume(),
    );
    el.querySelector('[data-go]')!.addEventListener('click', () => sh.hud.closePanel());
    el.querySelector('[data-voice]')!.addEventListener('click', (e) => {
      this.sv.voice = !this.sv.voice;
      setVoiceOn(this.sv.voice);
      persist();
      (e.currentTarget as HTMLElement).querySelector('i')!.innerHTML = IC.speaker(this.sv.voice);
    });
    el.querySelector('[data-menu]')!.addEventListener('click', () => this.showMenu());
  }

  private setBack(fn: (() => void) | null): void {
    this.backPop?.();
    this.backPop = fn ? pushBack(fn) : null;
  }

  /* ------------------------------ MiniGameHandle ------------------------------ */
  inMatch(): boolean {
    return !!this.shift?.inMatch || !!this.run?.inMatch;
  }
  pause(): void {
    this.shift?.pause();
    this.run?.pause();
  }
  resume(): void {
    if (this.shift && !this.shift.hud.panelOpen) this.shift.resume();
    if (this.run && !this.run.panelOpen) this.run.resume();
  }
  destroy(): void {
    this.destroyed = true;
    this.setBack(null);
    this.endShift();
    this.menuScene?.dispose();
    this.menuScene = null;
    stopVoice();
    disposeModels();
    this.wrap.remove();
  }
}

export { DIFF };
