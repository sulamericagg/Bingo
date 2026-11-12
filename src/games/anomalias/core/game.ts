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
import { introGate } from '../../../3d/cine/gate';
import { openStartMenu, type SmCard, type SmPage, type StartMenu } from '../../../ui/startmenu';

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
  private menu: HTMLElement | null = null;
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
  private sm: StartMenu | null = null;
  showMenu(): void {
    this.endShift();
    this.menu?.remove();
    const host = document.createElement('div');
    this.menuScene?.dispose();
    this.menuScene = new MenuScene(host);
    const totT = MAP_META.length * NIGHTS * 3;
    const sm = openStartMenu(this.wrap, {
      game: 'anomalias',
      stageEl: host,
      onBack: () => this.exitCb(),
      settings: (p) => {
        p.toggle({ icon: IC.speaker(this.sv.voice), label: t('ano.voice', 'Voz'), value: this.sv.voice, onChange: (v) => {
          this.sv.voice = v;
          setVoiceOn(v);
          persist();
        } });
      },
      build: (p) => {
        const card = (id: 'turno' | 'recepcao' | 'corredor', art: string, name: string, say: string, stars: string, col: string): SmCard => ({
          id,
          icon: art,
          label: name,
          say: `${name}: ${say}`,
          sub: '★ ' + stars,
          color: col,
          hot: lastMode() === id,
          onTap: () => this.openMode(id),
        });
        p.cards([
          card('turno', IC.camera(), t('ano.mode.turnoS', 'Turno'), t('ano.mode.turnoSub', 'Ache o que mudou e tire foto'), `${allMapStars()}/${totT}`, '#a08cff'),
          card('recepcao', MI.card(), t('ano.mode.recepcao', 'Recepção'), t('ano.mode.recepcaoSub', 'Abra só para quem é de verdade'), `${recStars()}/${NIGHTS * 3}`, '#ffaa7a'),
          card('corredor', MI.exit(), t('ano.mode.corredor', 'Corredor'), t('ano.mode.corredorSub', 'Algo diferente? Volte!'), `${corStars()}/12`, '#6ee0b8'),
        ]);
        const lm = lastMode() as 'turno' | 'recepcao' | 'corredor' | '';
        const id = lm === 'recepcao' || lm === 'corredor' ? lm : 'turno';
        p.play({ sub: id === 'turno' ? t('ano.mode.turno', 'Turno da noite') : id === 'recepcao' ? t('ano.mode.recepcao', 'Recepção') : t('ano.mode.corredor', 'Corredor'), onTap: () => this.openMode(id) });
      },
    });
    this.sm = sm;
    this.menu = sm.el;
    this.setBack(null);
    if (this.menuMode) this.openMode(this.menuMode);
  }

  private openMode(id: 'turno' | 'recepcao' | 'corredor'): void {
    const sm = this.sm;
    if (!sm) return;
    this.menuMode = id;
    if (id === 'turno') sm.push((p) => this.turnoPage(p), t('ano.mode.turno', 'Turno da noite'));
    else if (id === 'recepcao') sm.push((p) => this.recPage(p), t('ano.mode.recepcao', 'Recepção'));
    else sm.push((p) => this.corPage(p), t('ano.mode.corredor', 'Corredor'));
  }

  private nightCards(n0: number, sel: number, ok: (n: number) => boolean, stars: (n: number) => number, pick: (n: number) => void): SmCard[] {
    return Array.from({ length: n0 }, (_, k) => {
      const n = k + 1;
      const open = ok(n);
      const s = stars(n);
      return { id: 'n' + n, icon: `<span class="sm-emoji">${open ? n : ''}</span>`, color: '#3a2a7a', label: t('ano.nightN', 'Noite {n}', { n }), sub: open ? '★'.repeat(s) + '☆'.repeat(3 - s) : '', lock: !open, sel: n === sel, onTap: () => pick(n) };
    });
  }

  private turnoPage(p: SmPage): void {
    const sv = this.sv;
    p.cards(
      MAP_META.map((mm, i) => {
        const avail = mapAvailable(mm.id);
        const unl = mapUnlocked(i);
        return {
          id: mm.id,
          icon: `<span class="sm-emoji">${mm.icon}</span>`,
          color: mm.color,
          label: mapName(mm.id),
          sub: avail ? `★ ${totalStars(mm.id)}/${NIGHTS * 3}` : t('ano.soon', 'Em breve'),
          lock: !avail ? true : !unl ? t('ano.unlockAt', '{n} noites', { n: i * 2 }) : false,
          say: !avail ? t('ano.soonMsg', 'Esse lugar ainda está sendo construído!') : !unl ? t('ano.lockedMsg', 'Complete mais noites para abrir!') : mapName(mm.id),
          sel: mm.id === this.selMap,
          onTap: () => {
            this.selMap = mm.id;
            this.selNight = Math.min(NIGHTS, mapRec(mm.id).done + 1);
            p.refresh();
          },
        };
      }),
      { scroll: true },
    );
    const rec = mapRec(this.selMap);
    p.cards(
      this.nightCards(NIGHTS, this.selNight, (n) => nightUnlocked(this.selMap, n), (n) => rec.stars[n] ?? 0, (n) => {
        this.selNight = n;
        p.refresh();
      }),
      { size: 'small', scroll: true },
    );
    p.faces(
      DIFFS.map((d, k) => ({ id: d, level: k, label: diffName(d) })),
      sv.diff,
      (d) => {
        sv.diff = d as Diff;
        persist();
      },
    );
    p.play({ sub: `${mapName(this.selMap)} · ${t('ano.nightN', 'Noite {n}', { n: this.selNight })}`, say: t('ano.play', 'Começar turno'), onTap: () => void this.play(this.selMap, this.selNight) });
  }

  private recPage(p: SmPage): void {
    const rec = recRec();
    p.cards(
      this.nightCards(NIGHTS, this.selRecNight, (n) => recNightUnlocked(n), (n) => rec.stars[n] ?? 0, (n) => {
        this.selRecNight = n;
        p.refresh();
      }),
      { size: 'small', scroll: true },
    );
    p.hint(t('rec.howS', 'Crachá igual ao rosto? Abra a porta!'), MI.card());
    p.play({ icon: `<span style="display:flex;width:44px;height:44px">${MI.door(true)}</span>`, sub: t('ano.nightN', 'Noite {n}', { n: this.selRecNight }), say: t('rec.play', 'Abrir a portaria'), onTap: () => void this.playRec(this.selRecNight) });
  }

  private corPage(p: SmPage): void {
    p.cards(
      THEMES.map((id) => {
        const r = corRec(id);
        const meta = THEME_META[id];
        return { id, icon: `<span class="sm-emoji">${meta.icon}</span>`, color: meta.color, label: themeName(id), sub: r.wins ? `★ ${r.stars}/3` : `${r.best}/10`, sel: id === this.selTheme, onTap: () => {
          this.selTheme = id;
          p.refresh();
        } };
      }),
      { cols: 4 },
    );
    p.hint(t('cor.howS', 'Algo diferente? Volte!'), `<span style="display:flex;width:22px;height:22px">${MI.uturn().replace('#fff', '#ffd34a')}</span>`);
    p.play({ sub: themeName(this.selTheme), say: t('cor.play', 'Entrar no corredor'), onTap: () => void this.playCor(this.selTheme) });
  }

  /* ------------------------------ turno ------------------------------ */
  async play(mapId: string, night: number, seedOverride?: number): Promise<void> {
    // abertura (docs/INTROS.md): só no primeiro turno
    await introGate('anomalias', () => import('../intro/cinematic').then((m) => m.playIntro(this.wrap)));
    if (this.destroyed) return;
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
