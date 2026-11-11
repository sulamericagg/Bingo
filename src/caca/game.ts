/**
 * CAÇA BLOOP — modo de caça por localização (jogo original do Bloop World).
 * Telas: segurança (1ª vez) → escolha GPS / modo casa → inicial → mapa → encontro → batalha → captura;
 * Bloopdex (famílias, meus bichinhos, equipe, ovos) e ajustes/privacidade.
 */
import './caca.css';
import type { MiniGameHandle } from '../hub/registry';
import { reportRun } from '../hub/registry';
import { t, fmt, fmtDec } from '../i18n';
import { gameFont } from '../i18n/font';
import { audio } from '../core/audio';
import * as haptics from '../core/haptics';
import { addCoins } from '../core/economy';
import { save as coreSave } from '../core/storage';
import { bus } from '../core/events';
import { notify, bigMoment } from '../ui/notify';
import { icon } from '../ui/icons';
import { esc } from '../ui/dom';
import { bindButton, edges, type BoundButton } from '../ui/touch';
import { genome, powerOf, statsAt, uniqueSerial, rarityOdds, variationEstimate, SHAPES, ELEMENTS, withElement, type Genome, type Element, type Rarity } from './genome';
import { drawGenome, genomeIcon, EL_COLOR, RARITY_COL, fitScale, paintGenome, rarityBackdrop } from './draw';
import { distM, geohashEncode, metersPerPx, project, unproject } from './geo';
import { Locator, SpeedLock, type Fix, type LocError } from './location';
import { spawnsAround, homeSpawns, homeOrigin, windowOf, weatherAt, dayPart, setLandSampler, nestFamily, CELL_PRECISION, type LandSampler, type Spawn } from './spawns';
import { biomeAtWorld, themeForHour, WZ } from './world';
import { G_PARK, G_PLAZA, G_WATER, TILE_PX, type OsmPoi } from './osmdata';
import { OsmStore } from './osmtiles';
import { MapRenderer, toScreen, toWorld, visibleBounds, type Cam, type Mat, type Sprite } from './mapview';
import { cacaSave, persistCaca, addMon, teamMons, toggleTeam, releaseMon, giveXp, canEvolve, evolve, markDone, markSeen, bumpStreak, streakAlive, addEgg, walkEggs, starterSeeds, xpNeed, monById, joyBudget, spendJoy, addRealWalk, stopReady, stopUsed, EVO_LVL, JOY_RADIUS_M, type Mon } from './save';
import { dayNumber } from '../core/storage';
import { detectInitialTier, loadMode, type Tier } from '../core/quality';
import { createJoystick, type Joystick } from '../ui/touch';
import { drawAvatar, type AvatarData } from '../game/avatar';
import type { PlayerPose } from '../game/character';
import { makeMinigame, gameName, gameHelp, EL_GAMES, GAME_KINDS, type Minigame, type GameKind } from './minigames';
import { WebArLite, type ArProvider } from './ar';
import { elName, rarName, shapeName, matName, patName, weatherName } from './text';
import { seedFrom } from './rng';

const REACH_GPS = 40;
const REACH_HOME = 160;
/** zoom do mapa em px CSS por metro */
const ZOOM_MIN = 0.9;
const ZOOM_MAX = 3.4;
/** andar pelo jogo: velocidade de caminhada (m/s) e do passeio automático */
const WALK_MPS = 1.4;
const PASSEIO_MPS = 1.2;
const STOP_CD_MS = 5 * 60 * 1000;

interface StopRef {
  p: OsmPoi;
  wx: number;
  wy: number;
  lat: number;
  lon: number;
}
interface Hit {
  x: number;
  y: number;
  r: number;
  spawn?: Spawn;
  stop?: StopRef;
}

const SVG = (body: string) => `<svg class="ico" viewBox="0 0 48 48" width="1.25em" height="1.25em" aria-hidden="true">${body}</svg>`;
const JOY_SVG = SVG(
  '<rect x="5" y="16" width="38" height="22" rx="11" fill="#7a5cff" stroke="#2a0b5c" stroke-width="3"/><circle cx="16" cy="27" r="5" fill="#fff"/><circle cx="33" cy="24" r="3" fill="#ffd23a"/><circle cx="33" cy="31" r="3" fill="#ff5c8a"/>',
);
const FEET_SVG = SVG(
  '<ellipse cx="17" cy="30" rx="6.5" ry="9" fill="#ffd23a" stroke="#2a0b5c" stroke-width="3"/><ellipse cx="31" cy="18" rx="6.5" ry="9" fill="#7dff9a" stroke="#2a0b5c" stroke-width="3"/><circle cx="17" cy="42" r="3" fill="#ffd23a"/><circle cx="31" cy="30" r="3" fill="#7dff9a"/>',
);
const COMPASS_SVG = '<svg viewBox="0 0 48 48" width="26" height="26" aria-hidden="true"><path d="M24 5 L31 24 L24 21 L17 24 Z" fill="#ff5c6a"/><path d="M24 43 L17 24 L24 27 L31 24 Z" fill="#fff"/><circle cx="24" cy="24" r="3" fill="#2a0b5c"/></svg>';
const PIN_OFF_SVG = SVG(
  '<path d="M24 44s14-14 14-24a14 14 0 0 0-28 0c0 10 14 24 14 24z" fill="#ffb3c7" stroke="#2a0b5c" stroke-width="3"/><circle cx="24" cy="20" r="5" fill="#fff" stroke="#2a0b5c" stroke-width="3"/><path d="M8 8 L40 40" stroke="#2a0b5c" stroke-width="4" stroke-linecap="round"/>',
);
const MOON_SVG = SVG('<path d="M30 6a18 18 0 1 0 12 30A15 15 0 0 1 30 6z" fill="#ffe48a" stroke="#2a0b5c" stroke-width="3"/><circle cx="12" cy="10" r="2" fill="#fff"/><circle cx="40" cy="12" r="1.6" fill="#fff"/>');

function drawFlag(c: CanvasRenderingContext2D, x: number, y: number, k: number, tm: number): void {
  c.save();
  c.translate(x, y);
  c.scale(k, k);
  c.strokeStyle = '#2a0b5c';
  c.lineWidth = 2.5;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -30);
  c.stroke();
  c.fillStyle = '#ffd23a';
  c.beginPath();
  c.moveTo(0, -30);
  c.quadraticCurveTo(9, -28 + Math.sin(tm * 5) * 2, 16, -25);
  c.lineTo(0, -19);
  c.fill();
  c.restore();
}

type Ability = 'forca' | 'lento' | 'escudo' | 'cura' | 'dica';
const ABIL: Record<Element, Ability> = { fogo: 'forca', eletrico: 'forca', agua: 'lento', gelo: 'lento', ar: 'lento', terra: 'escudo', sombra: 'escudo', planta: 'cura', luz: 'dica', som: 'dica' };
const ABIL_CD: Record<Ability, number> = { forca: 2, lento: 2, escudo: 2, cura: 3, dica: 2 };
const abilName = (a: Ability): string =>
  ({ forca: t('caca.ab.forca', 'Força'), lento: t('caca.ab.lento', 'Lentidão'), escudo: t('caca.ab.escudo', 'Escudo'), cura: t('caca.ab.cura', 'Cura'), dica: t('caca.ab.dica', 'Dica') })[a];
const abilHelp = (a: Ability): string =>
  ({
    forca: t('caca.ab.forcaHelp', '+35% de dano neste round'),
    lento: t('caca.ab.lentoHelp', 'Tudo 30% mais devagar neste round'),
    escudo: t('caca.ab.escudoHelp', 'Bloqueia o contra-ataque deste round'),
    cura: t('caca.ab.curaHelp', 'Recupera 30 de energia'),
    dica: t('caca.ab.dicaHelp', 'Mostra dicas neste round'),
  })[a];

const COINS_BY_RARITY = [5, 8, 12, 20, 35, 60];
const CATCH_BASE = [0.95, 0.85, 0.7, 0.55, 0.42, 0.3];

interface Dbg {
  autoWin: boolean;
}
const dbg: Dbg = { autoWin: false };

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  return new CacaGame(root, exit);
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
const rarBadge = (r: Rarity): string => {
  const [a, b] = RARITY_COL[r];
  const bg = r === 5 ? 'linear-gradient(90deg,#ff5c8a,#ffb52e,#7dff6b,#4fc3ff,#b45cff)' : `linear-gradient(${a},${b})`;
  return `<span class="cc-rar" style="background:${bg}">${esc(rarName(r))}</span>`;
};
const elBadge = (e: Element): string => `<span class="cc-el" style="background:${EL_COLOR[e]}">${esc(elName(e))}</span>`;
const monName = (g: Genome): string => (g.rarity === 5 ? `${g.name} #${uniqueSerial(g)}` : g.name);

class CacaGame implements MiniGameHandle {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private cx: CanvasRenderingContext2D;
  private sv = cacaSave();
  private dead = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private time = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private offs: (() => void)[] = [];
  private btns: BoundButton[] = [];
  private tier: Tier;
  private store: OsmStore | null = null;
  private renderer: MapRenderer | null = null;
  private tilesDirty = false;
  private m: Mat | null = null;
  private hits: Hit[] = [];
  private stops: StopRef[] = [];
  private selStop = '';
  private pending = 0;
  private rot = 0;
  private rotAnim: number | null = null;
  private follow = false;
  private tiltNow = 0.7;
  private locator: Locator | null = null;
  private lock = new SpeedLock();
  private fix: Fix | null = null;
  private lastWalk: Fix | null = null;
  private target: [number, number] | null = null; // mundo px (posição filtrada)
  /** posição desenhada do bonequinho (anda suave até target) */
  private av: [number, number] | null = null;
  private avSpeed = 0;
  private heading: number | null = null;
  private pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'idle', lx: -0.55, ly: -0.83 };
  /* modo controle */
  private joy: Joystick | null = null;
  private joyZone!: HTMLDivElement;
  private joyChip!: HTMLDivElement;
  private joyMoving = false;
  private joyAcc = 0;
  private joyOverride: { x: number; y: number; until: number } | null = null;
  private walkTo: [number, number] | null = null;
  private anchor: [number, number] | null = null;
  private walkBtn: HTMLButtonElement | null = null;
  private compassBtn!: HTMLButtonElement;
  private attrib!: HTMLDivElement;
  private mapState!: HTMLDivElement;
  private spawns: Spawn[] = [];
  private spawnKey = '';
  private mapOn = false;
  private overlay: HTMLDivElement | null = null;
  private banner!: HTMLDivElement;
  private hint!: HTMLDivElement;
  private subtitle!: HTMLElement;
  private coinsChip!: HTMLElement;
  private enc: Encounter | null = null;
  private gpsWait = 0;

  constructor(root: HTMLElement, private exitFn: () => void) {
    const qm = loadMode();
    this.tier = qm === 'auto' ? detectInitialTier() : qm;
    this.el = h('div', 'cc-root');
    root.appendChild(this.el);
    this.cv = h('canvas', 'cc-map');
    this.cx = this.cv.getContext('2d')!;
    this.el.appendChild(this.cv);
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    this.offs.push(bus.on('wallet', () => this.updateCoins()));
    this.resize();
    this.buildMapUi();
    this.cv.addEventListener('pointerdown', (e) => this.onMapDown(e));
    this.cv.addEventListener('pointermove', (e) => this.onMapMove(e));
    this.cv.addEventListener('pointerup', (e) => this.onMapUp(e));
    this.cv.addEventListener('pointercancel', (e) => this.onMapUp(e));
    this.cv.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    if (location.search.includes('debug')) this.exposeDebug();
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
    this.flow();
  }

  /* ============================== fluxo inicial ============================== */
  private flow(): void {
    if (!this.sv.safetyOk) return this.showSafety(() => this.flow());
    if (!this.sv.locMode) return this.showModeChoice(() => this.flow());
    if (!this.sv.starter) return this.showStarter(() => this.flow());
    this.startMap();
  }

  private openOverlay(cls = ''): HTMLDivElement {
    this.closeOverlay();
    const o = h('div', 'cc-ov fade ' + cls);
    this.el.appendChild(o);
    this.overlay = o;
    return o;
  }
  private closeOverlay(): void {
    this.overlay?.remove();
    this.overlay = null;
  }
  private btn(el: HTMLElement, fn: () => void): HTMLElement {
    this.btns.push(bindButton(el, { onRelease: (e) => e && el.contains(document.elementFromPoint(e.clientX, e.clientY)) && fn() }));
    return el;
  }
  private header(o: HTMLElement, title: string, onBack: () => void): void {
    const hd = h('div', 'cc-h');
    const b = h('button', 'cc-ibtn', icon('close'));
    b.setAttribute('aria-label', t('caca.back', 'Voltar'));
    this.btn(b, onBack);
    const h2 = h('h2');
    h2.textContent = title;
    hd.append(b, h2);
    o.appendChild(hd);
  }

  private showSafety(done: () => void): void {
    const o = this.openOverlay();
    this.header(o, t('caca.safety.title', 'Antes de caçar'), () => this.exitFn());
    const sc = h('div', 'cc-scroll');
    sc.innerHTML = `
      <div class="cc-card"><h3>${esc(t('caca.safety.h1', 'Segurança em primeiro lugar'))}</h3><ul>
        <li>${esc(t('caca.safety.aware', 'Preste atenção ao seu redor: olhe para o caminho, não só para a tela.'))}</li>
        <li>${esc(t('caca.safety.private', 'Não entre em propriedades particulares nem em lugares perigosos para pegar um bichinho.'))}</li>
        <li>${esc(t('caca.safety.adult', 'Se você for mais novo, jogue acompanhado de um adulto e combine onde pode ir.'))}</li>
        <li>${esc(t('caca.safety.drive', 'Nunca jogue dirigindo ou pedalando. Acima de 25 km/h as aparições pausam.'))}</li>
        <li>${esc(t('caca.safety.night', 'À noite, prefira o modo casa ou lugares iluminados e conhecidos.'))}</li>
      </ul></div>
      <div class="cc-card"><h3>${esc(t('caca.privacy.h', 'Sua localização fica no aparelho'))}</h3>
        <p>${esc(t('caca.privacy.p1', 'O GPS é usado só com o jogo aberto, para mostrar o mapa e calcular as aparições aqui mesmo no aparelho. Nada é enviado, salvo ou compartilhado — nem com a gente.'))}</p>
        <p>${esc(t('caca.privacy.p2', 'Ninguém vê onde você está, e você também não vê outros jogadores. Prefere sem GPS? Use o modo casa.'))}</p></div>`;
    const ok = h('button', 'cc-btn', `${icon('check')} ${esc(t('caca.safety.ok', 'Entendi, vamos lá!'))}`);
    this.btn(ok, () => {
      this.sv.safetyOk = true;
      persistCaca();
      done();
    });
    sc.appendChild(ok);
    o.appendChild(sc);
  }

  private showModeChoice(done: () => void): void {
    const o = this.openOverlay();
    this.header(o, t('caca.mode.title', 'Como você quer jogar?'), () => this.exitFn());
    const sc = h('div', 'cc-scroll');
    sc.innerHTML = `
      <div class="cc-card"><h3>${esc(t('caca.mode.gpsH', 'Com localização (andar pela rua)'))}</h3>
        <p>${esc(t('caca.mode.gpsP', 'Os bichinhos aparecem pelo mapa e mudam a cada 15 minutos. Ande até eles (uns 40 m) para encontrar. Os ovos chocam conforme você anda.'))}</p></div>
      <div class="cc-card"><h3>${esc(t('caca.mode.homeH', 'Modo casa (sem GPS)'))}</h3>
        <p>${esc(t('caca.mode.homeP', 'Um mapa de brincadeira em volta de você, com bichinhos por perto. Não usa sua localização.'))}</p></div>`;
    const a = h('button', 'cc-btn', `${icon('target')} ${esc(t('caca.mode.gps', 'Usar localização'))}`);
    const b = h('button', 'cc-btn sec', `${icon('home')} ${esc(t('caca.mode.home', 'Modo casa'))}`);
    this.btn(a, () => {
      this.sv.locMode = 'gps';
      persistCaca();
      done();
    });
    this.btn(b, () => {
      this.sv.locMode = 'casa';
      persistCaca();
      done();
    });
    sc.append(a, b);
    o.appendChild(sc);
  }

  private showStarter(done: () => void): void {
    const o = this.openOverlay();
    this.header(o, t('caca.starter.title', 'Escolha seu parceiro'), () => this.exitFn());
    const sc = h('div', 'cc-scroll');
    const card = h('div', 'cc-card', `<p>${esc(t('caca.starter.p', 'Ele ajuda nas batalhas com uma habilidade. Depois você monta uma equipe de até 6.'))}</p>`);
    const row = h('div', 'cc-starters');
    const seeds = starterSeeds();
    let pick = 0;
    const btns: HTMLButtonElement[] = [];
    seeds.forEach((s, i) => {
      const g = genome(s);
      const b = h('button');
      b.appendChild(genomeIcon(g, 110));
      b.appendChild(document.createTextNode(g.name));
      const sub = h('div', '', elBadge(g.element));
      b.appendChild(sub);
      this.btn(b, () => {
        pick = i;
        btns.forEach((x, k) => x.classList.toggle('on', k === i));
      });
      btns.push(b);
      row.appendChild(b);
    });
    btns[0]?.classList.add('on');
    card.appendChild(row);
    const ok = h('button', 'cc-btn', `${icon('heart')} ${esc(t('caca.starter.ok', 'Este!'))}`);
    this.btn(ok, () => {
      addMon(seeds[pick], 5);
      this.sv.starter = true;
      persistCaca();
      audio.record();
      done();
    });
    sc.append(card, ok);
    o.appendChild(sc);
  }

  /* ============================== mapa ============================== */
  private buildMapUi(): void {
    const top = h('div', 'cc-top');
    const back = h('button', 'cc-ibtn', icon('close'));
    back.setAttribute('aria-label', t('caca.back', 'Voltar'));
    this.btn(back, () => this.exitFn());
    const title = h('div', 'cc-title', `<b>${esc(t('caca.name', 'Caça Bloop'))}</b><small></small>`);
    this.subtitle = title.querySelector('small')!;
    this.coinsChip = h('span', 'cc-chip');
    const gear = h('button', 'cc-ibtn', icon('gear'));
    gear.setAttribute('aria-label', t('caca.settings', 'Ajustes'));
    this.btn(gear, () => this.showSettings());
    top.append(back, title, this.coinsChip, gear);
    this.banner = h('div', 'cc-banner');
    this.hint = h('div', 'cc-hint');
    const bot = h('div', 'cc-bottom');
    const dex = h('button', 'cc-bbtn', `${icon('star')}<span>${esc(t('caca.dex', 'Bloopdex'))}</span>`);
    const team = h('button', 'cc-bbtn main', `${icon('heart')}<span>${esc(t('caca.team', 'Equipe'))}</span>`);
    const eggs = h('button', 'cc-bbtn', `${icon('gift')}<span>${esc(t('caca.eggs', 'Ovos'))}</span>`);
    this.btn(dex, () => this.showDex('dex'));
    this.btn(team, () => this.showDex('mine'));
    this.btn(eggs, () => this.showDex('eggs'));
    bot.append(dex, team, eggs);
    // coluna da direita: bússola + modo de andar
    const side = h('div', 'cc-side');
    this.compassBtn = h('button', 'cc-ibtn cc-compass', COMPASS_SVG) as HTMLButtonElement;
    this.compassBtn.setAttribute('aria-label', t('caca.compass', 'Bússola'));
    this.btn(this.compassBtn, () => {
      // 1º toque: norte para cima; 2º: o mapa gira com você
      const north = Math.abs(Math.atan2(Math.sin(this.rot), Math.cos(this.rot))) < 0.05;
      if (north && !this.follow) {
        this.follow = true;
        notify(t('caca.compass.follow', 'O mapa gira junto com você.'), { icon: 'refresh', key: 'cmp' });
      } else {
        this.follow = false;
        this.rotAnim = 0;
      }
    });
    this.walkBtn = h('button', 'cc-ibtn cc-walk') as HTMLButtonElement;
    this.btn(this.walkBtn, () => this.toggleWalkMode());
    side.append(this.compassBtn, this.walkBtn);
    this.joyChip = h('div', 'cc-joychip');
    this.joyZone = h('div', 'cc-joyzone');
    this.attrib = h('div', 'cc-attrib');
    this.attrib.textContent = '© OpenStreetMap contributors';
    this.mapState = h('div', 'cc-mapstate');
    this.el.append(this.joyZone, top, this.banner, this.joyChip, this.mapState, this.hint, side, this.attrib, bot);
    this.updWalkBtn();
    this.updateCoins();
  }
  private updateCoins(): void {
    if (this.coinsChip) this.coinsChip.innerHTML = `${icon('coin')} ${fmt(coreSave.coins)}`;
  }

  private startMap(): void {
    this.closeOverlay();
    this.mapOn = true;
    this.locator?.stop();
    this.locator = null;
    this.fix = null;
    this.target = null;
    this.av = null;
    this.spawnKey = '';
    this.walkTo = null;
    this.anchor = null;
    this.stops = [];
    const casa = this.sv.locMode === 'casa';
    if (!casa && !this.store) this.store = new OsmStore(() => this.onTiles());
    setLandSampler(casa || !this.store ? null : this.landSampler());
    this.renderer?.dispose();
    this.renderer = new MapRenderer(casa ? null : this.store, this.tier);
    this.attrib.style.display = casa ? 'none' : '';
    const joy = this.sv.walkMode === 'controle';
    this.setJoystick(joy);
    if (casa) {
      const [lat, lon] = homeOrigin(this.sv.homeSeed);
      this.anchor = [lat, lon];
      const jp = this.sv.joyPos;
      const p = joy && jp && distM(lat, lon, jp[0], jp[1]) < JOY_RADIUS_M ? jp : ([lat, lon] as [number, number]);
      this.place(p[0], p[1]);
      this.setBanner('');
    } else {
      this.gpsWait = performance.now();
      this.setBanner(joy ? t('caca.joy.findStart', 'Achando seu ponto de partida…') : t('caca.gps.wait', 'Procurando o GPS… vá para um lugar aberto.'), true);
      const a = this.sv.anchor;
      if (joy && a) {
        this.anchor = a;
        const jp = this.sv.joyPos;
        const p = jp && distM(a[0], a[1], jp[0], jp[1]) < JOY_RADIUS_M ? jp : a;
        this.place(p[0], p[1]);
        this.setBanner('');
      }
      this.startLocator();
    }
    this.updJoyChip();
    this.refreshSpawns(true);
    this.maybeNightTip();
  }
  private startLocator(): void {
    this.locator?.stop();
    const store = this.store;
    this.locator = new Locator(
      (f) => this.onFix(f),
      (e) => this.onLocError(e),
      store
        ? (lat, lon, maxM) => {
            const [x, y] = project(lat, lon, WZ);
            const p = store.nearestWay(x, y, maxM / metersPerPx(lat, WZ));
            return p ? unproject(p[0], p[1], WZ) : null;
          }
        : undefined,
    );
    void this.locator.start();
  }
  /** põe o jogador num ponto (modo casa / controle) */
  private place(lat: number, lon: number): void {
    this.fix = { lat, lon, acc: 5, speed: 0, heading: this.fix?.heading ?? null, t: Date.now() };
    this.target = project(lat, lon, WZ);
    if (!this.av || Math.hypot(this.av[0] - this.target[0], this.av[1] - this.target[1]) > 400) this.av = [this.target[0], this.target[1]];
  }
  private landSampler(): LandSampler {
    const store = this.store!;
    return {
      at: (lat, lon) => {
        const [x, y] = project(lat, lon, WZ);
        const l = store.landAt(x, y);
        if (l === 'err') {
          // sem mapa (offline e sem cache): usa o mundo procedural — todo mundo sem dados vê o mesmo
          const b = biomeAtWorld(x, y);
          return { g: b === 'parque' ? G_PARK : b === 'agua' ? G_WATER : b === 'praca' ? G_PLAZA : 0, nest: null, bld: false };
        }
        return l;
      },
    };
  }
  private onTiles(): void {
    if (this.dead) return;
    this.tilesDirty = true;
  }

  private onFix(f: Fix): void {
    if (this.dead) return;
    if (this.sv.walkMode === 'controle') {
      // modo controle: o GPS só dá o ponto de partida (e re-ancora se você foi para outro lugar). Depois desliga.
      if (f.coarse && f.acc > 150) return;
      const a = this.sv.anchor;
      if (!a || distM(a[0], a[1], f.lat, f.lon) > JOY_RADIUS_M) {
        // arredondado (~100 m): é só para o limite do passeio; fica no aparelho
        this.sv.anchor = [Math.round(f.lat * 1000) / 1000, Math.round(f.lon * 1000) / 1000];
        this.sv.joyPos = null;
        persistCaca();
        this.anchor = this.sv.anchor;
        this.place(f.lat, f.lon);
      } else if (!this.fix) {
        this.anchor = a;
        this.place(a[0], a[1]);
      }
      this.setBanner('');
      this.locator?.stop();
      this.locator = null;
      this.refreshSpawns(true);
      return;
    }
    const locked = this.lock.update(f);
    const prev = this.lastWalk;
    if (!prev) this.lastWalk = f;
    else {
      const d = distM(prev.lat, prev.lon, f.lat, f.lon);
      if (f.acc < 40 && !locked && d >= 5 && f.moving !== false) {
        if (d < 80 && f.speed < 7) {
          this.walked(d / 1000);
          addRealWalk(d);
        }
        this.lastWalk = f;
      }
    }
    this.fix = f;
    this.target = project(f.lat, f.lon, WZ);
    if (f.heading !== null) this.heading = f.heading;
    this.setBanner(
      locked
        ? t('caca.vehicle', 'Parece que você está num veículo. As aparições estão pausadas — não jogue dirigindo!')
        : f.coarse
          ? t('caca.gps.coarse', 'GPS fraco — a posição pode demorar para acertar.')
          : '',
      !locked,
    );
    this.refreshSpawns();
  }
  private onLocError(e: LocError): void {
    if (this.dead) return;
    if (e === 'timeout' && this.fix) return;
    if (e === 'denied') return this.showDenied();
    if (this.sv.walkMode === 'controle' && this.fix) return;
    this.setBanner(t('caca.gps.off', 'Não deu para achar o GPS agora. Tente ao ar livre ou use o modo casa.'), true, {
      label: t('caca.mode.home', 'Modo casa'),
      fn: () => {
        this.sv.locMode = 'casa';
        persistCaca();
        this.startMap();
      },
    });
  }
  /** cartão amigável: sem permissão de localização */
  private showDenied(): void {
    this.locator?.stop();
    this.locator = null;
    this.setBanner('');
    const o = this.openOverlay('cc-deny');
    this.header(o, t('caca.deny.title', 'Sem localização'), () => this.exitFn());
    const sc = h('div', 'cc-scroll');
    sc.innerHTML = `<div class="cc-card cc-center"><div class="cc-bigico">${PIN_OFF_SVG}</div>
      <h3>${esc(t('caca.deny.h', 'Tudo bem! Dá para jogar mesmo assim.'))}</h3>
      <p>${esc(t('caca.deny.p1', 'O jogo não recebeu permissão para usar a localização, então não dá para mostrar o mapa da sua cidade.'))}</p>
      <p>${esc(t('caca.deny.p2', 'Quer o mapa de verdade? Peça para um adulto liberar a localização do Bloop World nas configurações do aparelho.'))}</p></div>`;
    const a = h('button', 'cc-btn', `${JOY_SVG} ${esc(t('caca.deny.joy', 'Jogar em casa com o controle'))}`);
    const b = h('button', 'cc-btn sec', `${icon('refresh')} ${esc(t('caca.deny.retry', 'Tentar de novo'))}`);
    this.btn(a, () => {
      this.sv.locMode = 'casa';
      this.sv.walkMode = 'controle';
      persistCaca();
      this.startMap();
    });
    this.btn(b, () => this.startMap());
    sc.append(a, b);
    o.appendChild(sc);
  }
  /** dica da noite (1× por dia): não sair sozinho no escuro */
  private maybeNightTip(): void {
    const hr = new Date().getHours();
    if (this.sv.locMode !== 'gps' || this.sv.walkMode !== 'real' || !(hr >= 19 || hr < 6)) return;
    const today = dayNumber();
    if (this.sv.nightTip === today) return;
    this.sv.nightTip = today;
    persistCaca();
    const o = this.openOverlay('cc-tipov');
    const box = h('div', 'cc-card cc-tipcard');
    box.innerHTML = `<div class="cc-bigico">${MOON_SVG}</div><h3>${esc(t('caca.night.h', 'Já está escuro lá fora'))}</h3>
      <p>${esc(t('caca.night.p', 'À noite, não saia para caçar sozinho. Jogue em casa andando com o controle, ou só com um adulto por perto, em lugares iluminados.'))}</p>`;
    const a = h('button', 'cc-btn', `${JOY_SVG} ${esc(t('caca.night.joy', 'Andar com o controle'))}`);
    const b = h('button', 'cc-btn sec', esc(t('caca.night.adult', 'Estou com um adulto')));
    this.btn(a, () => {
      this.sv.walkMode = 'controle';
      persistCaca();
      this.startMap();
    });
    this.btn(b, () => this.closeOverlay());
    box.append(a, b);
    o.appendChild(box);
  }
  private walked(km: number): void {
    for (const { mon } of walkEggs(km)) {
      const g = genome(mon.seed);
      bigMoment(t('caca.egg.hatched', 'Um ovo chocou!'), { sub: g.name, icon: 'gift' });
      audio.record();
    }
  }
  private setBanner(text: string, info = false, action?: { label: string; fn: () => void }): void {
    if (this.banner.dataset.t === text + (action ? '+' : '')) return;
    this.banner.dataset.t = text + (action ? '+' : '');
    this.banner.textContent = text;
    if (action) {
      const b = h('button', 'cc-btn small', esc(action.label));
      this.btn(b, action.fn);
      this.banner.appendChild(b);
    }
    this.banner.classList.toggle('on', !!text);
    this.banner.classList.toggle('info', info);
  }

  private refreshSpawns(force = false): void {
    if (!this.fix) return;
    const now = Date.now();
    const casa = this.sv.locMode === 'casa';
    const joy = this.sv.walkMode === 'controle';
    const key = geohashEncode(this.fix.lat, this.fix.lon, CELL_PRECISION) + ':' + windowOf(now) + ':' + (this.store?.version ?? 0) + (casa ? 'c' : '') + (joy ? 'j' : '');
    if (!force && key === this.spawnKey) return;
    this.spawnKey = key;
    let list: Spawn[];
    if (casa && !joy) {
      list = homeSpawns(this.sv.homeSeed, now);
      this.pending = 0;
    } else {
      const around = spawnsAround(this.fix.lat, this.fix.lon, now);
      this.pending = around.pending ?? 0;
      list = casa ? [...homeSpawns(this.sv.homeSeed, now), ...around] : around;
    }
    const done = new Set(this.sv.done);
    const seen = new Set<string>();
    this.spawns = list.filter((s) => !done.has(s.id) && !seen.has(s.id) && (seen.add(s.id), true));
    this.refreshStops();
    const w = weatherAt(this.fix.lat, this.fix.lon, now);
    const part = dayPart();
    const pn = part === 'noite' ? t('caca.part.noite', 'Noite') : part === 'manha' ? t('caca.part.manha', 'Manhã') : t('caca.part.tarde', 'Tarde');
    const mode = joy ? t('caca.joy.short', 'Controle') : casa ? t('caca.mode.homeShort', 'Modo casa') : 'GPS';
    const wn = part === 'noite' && w === 'sol' ? t('caca.wx.clear', 'Céu limpo') : weatherName(w);
    this.subtitle.textContent = `${mode} · ${pn} · ${wn}`;
  }
  /** Pontos Bloop e Arenas num raio de ~700 m (dados do mapa real) */
  private refreshStops(): void {
    this.stops = [];
    if (!this.store || this.sv.locMode === 'casa' || !this.target) return;
    const [x, y] = this.target;
    const mpp = metersPerPx(this.fix!.lat, WZ);
    const R = 700 / mpp;
    for (const tl of this.store.loaded(x - R, y - R, x + R, y + R)) {
      const ox = tl.tx * TILE_PX;
      const oy = tl.ty * TILE_PX;
      for (const p of tl.pois) {
        const wx = ox + p.x;
        const wy = oy + p.y;
        if (Math.hypot(wx - x, wy - y) > R) continue;
        const [lat, lon] = unproject(wx, wy, WZ);
        this.stops.push({ p, wx, wy, lat, lon });
      }
    }
  }

  private reach(): number {
    return this.sv.locMode === 'casa' && this.sv.walkMode !== 'controle' ? REACH_HOME : REACH_GPS;
  }
  private distTo(s: { lat: number; lon: number }): number {
    if (!this.fix) return 1e9;
    return distM(this.fix.lat, this.fix.lon, s.lat, s.lon);
  }
  private screenOf(s: Spawn): [number, number] {
    const [x, y] = project(s.lat, s.lon, WZ);
    return this.m ? toScreen(this.m, x, y) : [this.w / 2, this.h / 2];
  }

  /* ---------- gestos do mapa: arrastar gira, pinça dá zoom, toque escolhe ---------- */
  private ptrs = new Map<number, { x: number; y: number; x0: number; y0: number; t0: number }>();
  private dragged = false;
  private pinch: { d: number; a: number } | null = null;
  private onMapDown(e: PointerEvent): void {
    if (!this.mapOn || this.overlay || this.enc) return;
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {
      /* ok */
    }
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now() });
    if (this.ptrs.size === 1) this.dragged = false;
    if (this.ptrs.size === 2) {
      const [a, b] = [...this.ptrs.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), a: Math.atan2(b.y - a.y, b.x - a.x) };
      this.dragged = true;
    }
  }
  private onMapMove(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    const py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.ptrs.size >= 2 && this.pinch) {
      const [a, b] = [...this.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (this.pinch.d > 10) this.setZoom(this.sv.zoom * (d / this.pinch.d));
      this.rot += ang - this.pinch.a;
      this.follow = false;
      this.pinch = { d, a: ang };
      return;
    }
    if (!this.dragged && Math.hypot(p.x - p.x0, p.y - p.y0) > 8) this.dragged = true;
    if (this.dragged) {
      // arrastar de lado gira o mapa em volta do jogador (como no gênero); em cima/baixo inverte o sentido
      const dx = p.x - px;
      const dy = p.y - py;
      const oy = this.h * 0.66;
      const sgn = p.y > oy ? -1 : 1;
      const sx = p.x > this.w / 2 ? 1 : -1;
      this.rot += (dx * sgn + dy * sx * 0.6) * 0.0075;
      this.follow = false;
    }
  }
  private onMapUp(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId);
    this.ptrs.delete(e.pointerId);
    if (this.ptrs.size < 2) this.pinch = null;
    if (!p) return;
    if (this.ptrs.size === 0 && (this.dragged || this.pinch)) persistCaca();
    if (!this.dragged && performance.now() - p.t0 < 600 && this.ptrs.size === 0) {
      const r = this.cv.getBoundingClientRect();
      this.onMapTap(e.clientX - r.left, e.clientY - r.top);
    }
  }
  private onWheel(e: WheelEvent): void {
    if (!this.mapOn || this.overlay || this.enc) return;
    e.preventDefault();
    this.setZoom(this.sv.zoom * Math.exp(-e.deltaY * 0.0015));
  }
  private setZoom(z: number): void {
    this.sv.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  }

  private onMapTap(x: number, y: number): void {
    if (!this.mapOn || this.overlay || this.enc) return;
    let best: Hit | null = null;
    let bd = Infinity;
    for (const hh of this.hits) {
      const d = Math.hypot(hh.x - x, hh.y - y);
      if (d < hh.r && d < bd) (bd = d), (best = hh);
    }
    if (best) {
      if (best.spawn) this.trySpawn(best.spawn);
      else if (best.stop) this.openStop(best.stop);
      return;
    }
    // modo controle: tocar no chão = "Passeio" até lá
    if (this.sv.walkMode === 'controle' && this.m && this.fix) {
      const [wx, wy] = toWorld(this.m, x, y);
      const [lat, lon] = unproject(wx, wy, WZ);
      if (this.anchor && distM(this.anchor[0], this.anchor[1], lat, lon) > JOY_RADIUS_M) {
        notify(t('caca.joy.edge', 'Limite do passeio: fique a até 1,5 km do ponto de partida.'), { icon: 'home', key: 'joyedge' });
        return;
      }
      this.walkTo = [wx, wy];
      haptics.tap('light');
    }
  }
  private trySpawn(s: Spawn): boolean {
    if (this.lock.locked && this.sv.walkMode === 'real') {
      notify(t('caca.vehicleShort', 'Pausado: parece que você está num veículo.'), { kind: 'warn', icon: 'car' });
      return false;
    }
    const d = this.distTo(s);
    if (d > this.reach()) {
      notify(t('caca.tooFar', 'Chegue mais perto: faltam {m} m', { m: Math.round(d - this.reach()) }), { icon: 'target' });
      haptics.tap('light');
      if (this.sv.walkMode === 'controle') this.walkTo = project(s.lat, s.lon, WZ);
      return false;
    }
    this.openEncounter(s);
    return true;
  }

  /* ---------- Pontos Bloop e Arenas ---------- */
  private guardCache = new Map<string, Spawn>();
  private guardian(st: StopRef): Spawn {
    const day = dayNumber();
    const ck = st.p.id + ':' + day;
    const hit = this.guardCache.get(ck);
    if (hit) return hit;
    const sp = this.makeGuardian(st, day);
    if (this.guardCache.size > 64) this.guardCache.clear();
    this.guardCache.set(ck, sp);
    return sp;
  }
  private makeGuardian(st: StopRef, day: number): Spawn {
    const base = seedFrom('bloop-caca-v1', 'arena', st.p.id, day);
    const g = genome(base);
    const level = Math.min(35, 12 + (base.lo % 9) + g.rarity * 2);
    return { id: `arena:${st.p.id}:${day}`, lat: st.lat, lon: st.lon, seed: base, g, biome: 'praca', level, until: (day + 1) * 86400000 };
  }
  private openStop(st: StopRef): void {
    this.selStop = st.p.id;
    const d = this.distTo(st);
    const inReach = d <= this.reach();
    const o = this.openOverlay('cc-sheetov');
    o.addEventListener('pointerdown', (e) => e.target === o && this.closeOverlay());
    const sh = h('div', 'cc-sheet');
    const kind = st.p.arena ? t('caca.arena', 'Arena Bloop') : t('caca.stop', 'Ponto Bloop');
    sh.innerHTML = `<div class="cc-scroll"><div class="cc-stophead"><div class="cc-stopico ${st.p.arena ? 'arena' : ''}">${st.p.arena ? icon('trophy') : icon('gift')}</div><div><small>${esc(kind)}</small><h3></h3></div></div></div>`;
    sh.querySelector('h3')!.textContent = st.p.name;
    const sc = sh.querySelector('.cc-scroll')!;
    const p = h('p', 'cc-stopp');
    if (!inReach) p.textContent = t('caca.tooFar', 'Chegue mais perto: faltam {m} m', { m: Math.round(d - this.reach()) });
    sc.appendChild(p);
    if (st.p.arena) {
      const gd = this.guardian(st);
      const beaten = this.sv.done.includes(gd.id);
      const row = h('div', 'cc-guard');
      row.appendChild(genomeIcon(gd.g, 96));
      const info = h('div');
      info.innerHTML = `<b></b><div>${rarBadge(gd.g.rarity)} ${elBadge(gd.g.element)}</div><small>${esc(t('caca.lvl', 'Nv. {n}', { n: gd.level }))}</small>`;
      info.querySelector('b')!.textContent = t('caca.guardian', 'Guardião: {name}', { name: gd.g.name });
      row.appendChild(info);
      sc.appendChild(row);
      if (beaten) p.textContent = t('caca.arena.beaten', 'Você já venceu o guardião de hoje. Volte amanhã!');
      else if (inReach) p.textContent = t('caca.arena.p', 'Vença o guardião desta arena! Ele muda todo dia.');
      const go = h('button', 'cc-btn', `${icon('bolt')} ${esc(t('caca.arena.go', 'Desafiar'))}`) as HTMLButtonElement;
      go.disabled = beaten || !inReach;
      this.btn(go, () => {
        if (go.disabled) return;
        this.closeOverlay();
        this.openEncounter(gd);
      });
      sc.appendChild(go);
    } else {
      const ready = stopReady(st.p.id);
      if (inReach) p.textContent = ready ? t('caca.stop.p', 'Gire o Ponto Bloop para ganhar moedas e, às vezes, um ovo!') : t('caca.stop.wait', 'Já girado — ele recarrega em alguns minutos.');
      const go = h('button', 'cc-btn', `${icon('refresh')} ${esc(t('caca.stop.spin', 'Girar!'))}`) as HTMLButtonElement;
      go.disabled = !ready || !inReach;
      this.btn(go, () => {
        if (go.disabled) return;
        this.spinStop(st);
        this.closeOverlay();
      });
      sc.appendChild(go);
    }
    const close = h('button', 'cc-btn sec', esc(t('caca.back', 'Voltar')));
    this.btn(close, () => this.closeOverlay());
    sc.appendChild(close);
    o.appendChild(sh);
  }
  private spinStop(st: StopRef): void {
    stopUsed(st.p.id, STOP_CD_MS);
    const coins = 4 + Math.floor(Math.random() * 7);
    addCoins(coins);
    audio.coin();
    haptics.tap('medium');
    notify(t('caca.stop.got', '+{n} moedas no Ponto Bloop!', { n: coins }), { icon: 'coin', kind: 'good' });
    if (Math.random() < 0.15 && addEgg(0)) notify(t('caca.egg.found', 'Você achou um ovo!'), { icon: 'gift', kind: 'good' });
    for (const m of teamMons()) giveXp(m, 8);
    persistCaca();
  }

  /* ---------- andar pelo jogo (joystick / passeio) ---------- */
  private setJoystick(on: boolean): void {
    if (on && !this.joy) {
      this.joy = createJoystick(this.joyZone, { zone: () => true, hint: true, mouse: true, zoneTop: 0 });
    }
    this.joy?.setEnabled(on);
    this.joyZone.style.display = on ? '' : 'none';
    this.el.classList.toggle('cc-joymode', on);
    this.updWalkBtn();
  }
  private stepJoy(dt: number): void {
    if (!this.fix || !this.target || this.overlay || this.enc) return;
    let dx = 0;
    let dy = 0;
    let sp = 0;
    const ov = this.joyOverride && performance.now() < this.joyOverride.until ? this.joyOverride : null;
    const js = ov ? { x: ov.x, y: ov.y, mag: Math.min(1, Math.hypot(ov.x, ov.y)) } : this.joy?.read();
    const mpp = metersPerPx(this.fix.lat, WZ);
    if (js && js.mag > 0.06) {
      this.walkTo = null;
      const cs = Math.cos(this.rot);
      const sn = Math.sin(this.rot);
      const l = Math.hypot(js.x, js.y) || 1;
      // direção da tela → mundo (inverso da rotação da câmera)
      dx = (js.x * cs + (js.y / this.tiltNow) * sn) / l;
      dy = (-js.x * sn + (js.y / this.tiltNow) * cs) / l;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl;
      dy /= dl;
      sp = WALK_MPS * Math.min(1, js.mag);
    } else if (this.walkTo) {
      dx = this.walkTo[0] - this.target[0];
      dy = this.walkTo[1] - this.target[1];
      const dist = Math.hypot(dx, dy) * mpp;
      if (dist < 1.2) {
        this.walkTo = null;
        this.joyMoving = false;
        return;
      }
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      sp = Math.min(PASSEIO_MPS, dist * 1.5);
    }
    if (sp <= 0) {
      this.joyMoving = false;
      return;
    }
    const b = joyBudget();
    if (b.left <= 0) {
      this.walkTo = null;
      this.joyMoving = false;
      notify(t('caca.joy.empty', 'Os passos virtuais de hoje acabaram — amanhã tem mais! Andar de verdade, com um adulto, dá bônus.'), { icon: 'clock', key: 'joyempty' });
      return;
    }
    const step = Math.min(sp * dt, b.left);
    let nx = this.target[0] + (dx * step) / mpp;
    let ny = this.target[1] + (dy * step) / mpp;
    let [lat, lon] = unproject(nx, ny, WZ);
    const a = this.anchor;
    if (a && distM(a[0], a[1], lat, lon) > JOY_RADIUS_M) {
      const [ax, ay] = project(a[0], a[1], WZ);
      const r = JOY_RADIUS_M / mpp;
      const vx = nx - ax;
      const vy = ny - ay;
      const k = (r * 0.999) / Math.hypot(vx, vy);
      nx = ax + vx * k;
      ny = ay + vy * k;
      [lat, lon] = unproject(nx, ny, WZ);
      this.walkTo = null;
      notify(t('caca.joy.edge', 'Limite do passeio: fique a até 1,5 km do ponto de partida.'), { icon: 'home', key: 'joyedge' });
    }
    const moved = Math.hypot(nx - this.target[0], ny - this.target[1]) * mpp;
    this.target = [nx, ny];
    this.heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    this.fix = { lat, lon, acc: 5, speed: sp, heading: this.heading, t: Date.now(), moving: true };
    this.joyMoving = moved > 0.001;
    spendJoy(moved);
    this.joyAcc += moved;
    if (this.joyAcc >= 25) {
      // ovos chocam pela metade andando pelo jogo (andar de verdade vale mais)
      this.walked((this.joyAcc / 1000) * 0.5);
      this.joyAcc = 0;
      this.sv.joyPos = [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5];
      persistCaca();
      this.updJoyChip();
    }
  }
  private updJoyChip(): void {
    const on = this.sv.walkMode === 'controle';
    this.joyChip.style.display = on ? '' : 'none';
    if (!on) return;
    const b = joyBudget();
    this.joyChip.innerHTML = `${JOY_SVG}<span>${esc(t('caca.joy.left', 'Passos virtuais: {km} km', { km: fmtDec(b.left / 1000, 1) }))}</span>`;
  }
  private updWalkBtn(): void {
    if (!this.walkBtn) return;
    const joy = this.sv.walkMode === 'controle';
    this.walkBtn.innerHTML = joy ? FEET_SVG : JOY_SVG;
    const lbl = joy ? t('caca.walk.real', 'Andar de verdade') : t('caca.walk.joy', 'Andar com o controle');
    this.walkBtn.setAttribute('aria-label', lbl);
    this.walkBtn.title = lbl;
  }
  private toggleWalkMode(): void {
    if (this.sv.walkMode === 'controle') {
      this.sv.walkMode = 'real';
      persistCaca();
      this.startMap();
      return;
    }
    const o = this.openOverlay('cc-tipov');
    const box = h('div', 'cc-card cc-tipcard');
    const b = joyBudget();
    box.innerHTML = `<div class="cc-bigico">${JOY_SVG}</div><h3>${esc(t('caca.joy.title', 'Andar com o controle'))}</h3><ul>
      <li>${esc(t('caca.joy.r1', 'Seu Bloop anda pelo mapa com o controle, sem sair de casa.'))}</li>
      <li>${esc(t('caca.joy.r2', 'Toque no mapa para ele passear até lá sozinho.'))}</li>
      <li>${esc(t('caca.joy.r3', 'Dá para ir até 1,5 km do ponto de partida, com {km} km de passos virtuais hoje.', { km: fmtDec(b.left / 1000, 1) }))}</li>
      <li>${esc(t('caca.joy.r4', 'Andar de verdade (com um adulto) dá mais passos virtuais e choca ovos mais rápido.'))}</li></ul>`;
    const ok = h('button', 'cc-btn', `${JOY_SVG} ${esc(t('caca.joy.start', 'Vamos!'))}`);
    const no = h('button', 'cc-btn sec', esc(t('caca.back', 'Voltar')));
    this.btn(ok, () => {
      this.sv.walkMode = 'controle';
      persistCaca();
      this.startMap();
    });
    this.btn(no, () => this.closeOverlay());
    box.append(ok, no);
    o.appendChild(box);
  }

  /* ============================== laço e desenho ============================== */
  private resize(): void {
    this.dpr = Math.min(this.tier >= 2 ? 2 : 1.5, window.devicePixelRatio || 1);
    this.w = this.el.clientWidth || window.innerWidth;
    this.h = this.el.clientHeight || window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.enc?.resize();
  }
  private loop(now: number): void {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000);
    this.last = now;
    if (this.paused) return;
    this.time += dt;
    if (this.enc) {
      this.enc.frame(dt, this.time);
      return;
    }
    if (!this.mapOn || (this.overlay && !this.overlay.classList.contains('cc-sheetov') && !this.overlay.classList.contains('cc-tipov'))) return;
    if (this.sv.walkMode === 'controle') this.stepJoy(dt);
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      if (this.tilesDirty) {
        this.tilesDirty = false;
        this.refreshSpawns();
      } else this.refreshSpawns();
      const now2 = Date.now();
      this.spawns = this.spawns.filter((s) => s.until > now2);
      if (this.sv.locMode === 'gps' && !this.fix && this.locator && performance.now() - this.gpsWait > 25000) this.onLocError('unavailable');
      if (this.sv.walkMode === 'controle' && Math.floor(this.time) % 5 === 0) this.updJoyChip();
    }
    this.stepAvatar(dt);
    this.drawMap(dt);
  }
  /** bonequinho anda suave até a posição filtrada (sem teletransporte) */
  private stepAvatar(dt: number): void {
    if (!this.target || !this.fix) return;
    if (!this.av) this.av = [this.target[0], this.target[1]];
    const mpp = metersPerPx(this.fix.lat, WZ);
    const dx = this.target[0] - this.av[0];
    const dy = this.target[1] - this.av[1];
    const dist = Math.hypot(dx, dy) * mpp;
    let moved = 0;
    if (this.sv.walkMode === 'controle' || dist > 150) {
      moved = dist;
      this.av = [this.target[0], this.target[1]];
    } else if (dist > 0.05) {
      const k = 1 - Math.exp(-dt * 2.2);
      const maxM = Math.max(1.5, Math.min(8, dist)) * dt * 1.6;
      const m = Math.min(dist * k, maxM);
      this.av[0] += (dx / dist) * (m / mpp) * 1;
      this.av[1] += (dy / dist) * (m / mpp) * 1;
      moved = m;
    }
    const v = dt > 0 ? moved / dt : 0;
    this.avSpeed = this.avSpeed * 0.85 + v * 0.15;
    // rotação: segue o rumo no modo bússola
    if (this.follow && this.heading !== null && (this.fix.moving || this.sv.walkMode === 'controle')) {
      const want = (-this.heading * Math.PI) / 180;
      let d = want - this.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.rot += d * (1 - Math.exp(-dt * 2));
    }
    if (this.rotAnim !== null) {
      let d = this.rotAnim - this.rot;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.rot += d * (1 - Math.exp(-dt * 6));
      if (Math.abs(d) < 0.005) {
        this.rot = this.rotAnim;
        this.rotAnim = null;
      }
    }
    this.compassBtn.firstElementChild?.setAttribute('style', `transform:rotate(${this.rot}rad)`);
    this.compassBtn.classList.toggle('on', this.follow);
  }

  private drawMap(_dt: number): void {
    const c = this.cx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w;
    const Hh = this.h;
    const th = themeForHour(new Date().getHours());
    if (!this.av || !this.fix || !this.renderer) {
      this.drawNoFix(c);
      return;
    }
    const casa = this.sv.locMode === 'casa';
    const mpp = metersPerPx(this.fix.lat, WZ);
    const ppm = this.sv.zoom;
    const zt = (ppm - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
    const pitch = ((38 + zt * 20) * Math.PI) / 180;
    this.tiltNow = Math.cos(pitch);
    const cam: Cam = { cx: this.av[0], cy: this.av[1], S: ppm * mpp, rot: this.rot, tilt: Math.cos(pitch), elev: Math.sin(pitch), ox: W / 2, oy: Hh * 0.66, W, H: Hh };
    const opts = { th, dpr: this.dpr, time: this.time, mpp, osm: !casa };
    c.fillStyle = th.ground;
    c.fillRect(0, 0, W, Hh);
    const m = this.renderer.drawGround(c, cam, opts);
    this.m = m;
    // no plano do chão: alcance, precisão, limite do passeio, destino do passeio
    const S = cam.S;
    const reachW = this.reach() / mpp;
    c.save();
    c.lineWidth = 2.5 / S;
    c.setLineDash([10 / S, 8 / S]);
    c.lineDashOffset = (-this.time * 12) / S;
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.beginPath();
    c.arc(this.av[0], this.av[1], reachW, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(90,60,180,0.45)';
    c.lineWidth = 5 / S;
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.95)';
    c.lineWidth = 2.5 / S;
    c.stroke();
    c.setLineDash([]);
    if (this.sv.walkMode === 'real' && !casa && this.fix.acc > 12) {
      c.fillStyle = 'rgba(80,160,255,0.14)';
      c.beginPath();
      c.arc(this.av[0], this.av[1], Math.min(400, this.fix.acc / mpp), 0, Math.PI * 2);
      c.fill();
    }
    if (this.sv.walkMode === 'controle' && this.anchor) {
      const [ax, ay] = project(this.anchor[0], this.anchor[1], WZ);
      const r = JOY_RADIUS_M / mpp;
      if (Math.hypot(this.av[0] - ax, this.av[1] - ay) > r - 450 / mpp) {
        c.strokeStyle = 'rgba(255,92,138,0.85)';
        c.lineWidth = 5 / S;
        c.setLineDash([16 / S, 10 / S]);
        c.beginPath();
        c.arc(ax, ay, r, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
      }
    }
    if (this.walkTo) {
      c.fillStyle = 'rgba(255,210,58,0.35)';
      c.beginPath();
      c.arc(this.walkTo[0], this.walkTo[1], 7 / S + Math.sin(this.time * 5) * (1.5 / S), 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // fase de profundidade
    const list: Sprite[] = [];
    this.renderer.collect(cam, m, opts, list);
    this.hits = [];
    const zs = Math.max(0.78, Math.min(1.45, ppm / 1.7));
    const persp = (y: number) => zs * Math.max(0.62, Math.min(1.12, 0.7 + (0.3 * y) / cam.oy));
    const locked = this.lock.locked && this.sv.walkMode === 'real';
    let near = 0;
    for (const s of this.spawns) {
      const [wx, wy] = project(s.lat, s.lon, WZ);
      const [x, y] = toScreen(m, wx, wy);
      if (x < -60 || x > W + 60 || y < -40 || y > Hh + 80) continue;
      const inReach = this.distTo(s) <= this.reach();
      if (inReach) near++;
      const k = persp(y);
      this.hits.push({ x, y: y - 22 * k, r: 34 * k, spawn: s });
      list.push({ d: y, draw: (cc) => this.drawSpawn(cc, s, x, y, k, inReach, locked) });
    }
    for (const st of this.stops) {
      const [x, y] = toScreen(m, st.wx, st.wy);
      if (x < -60 || x > W + 60 || y < -40 || y > Hh + 80) continue;
      const k = persp(y);
      const d = this.distTo(st);
      const inReach = d <= this.reach();
      const ready = st.p.arena ? !this.sv.done.includes(`arena:${st.p.id}:${dayNumber()}`) : stopReady(st.p.id);
      this.hits.push({ x, y: y - 34 * k, r: 30 * k, stop: st });
      const label = this.selStop === st.p.id || (inReach && d < 60);
      list.push({ d: y, draw: (cc) => this.drawStop(cc, st, x, y, k, ready, inReach, label) });
    }
    if (this.walkTo) {
      const [x, y] = toScreen(m, this.walkTo[0], this.walkTo[1]);
      list.push({ d: y, draw: (cc) => drawFlag(cc, x, y, persp(y), this.time) });
    }
    const [px, py] = toScreen(m, this.av[0], this.av[1]);
    list.sort((a, b) => a.d - b.d);
    // o jogador fica sempre por cima (nunca some atrás de bichinho/prédio)
    list.push({ d: Infinity, draw: (cc) => this.drawPlayer(cc, px, py, Math.max(1, persp(py)), m) });
    for (const s of list) s.draw(c);
    // céu / névoa no horizonte
    const fogH = Hh * 0.2;
    const fog = c.createLinearGradient(0, 0, 0, fogH);
    fog.addColorStop(0, th.sky[0]);
    fog.addColorStop(0.35, th.sky[1] + 'cc');
    fog.addColorStop(1, th.sky[1] + '00');
    c.fillStyle = fog;
    c.fillRect(0, 0, W, fogH);
    // estado do mapa real
    if (!casa && this.store) {
      const [x0, y0, x1, y1] = visibleBounds(m, W, Hh, Hh * 0.3);
      const st = this.store.status(x0, y0, x1, y1);
      this.mapState.textContent = st === 'load' ? t('caca.map.loading', 'Carregando o mapa da sua região…') : st === 'err' ? t('caca.map.offline', 'Sem internet: mapa de brincadeira por enquanto.') : '';
      this.mapState.style.display = st === 'ok' ? 'none' : '';
    } else this.mapState.style.display = 'none';
    // dica
    const joy = this.sv.walkMode === 'controle';
    const hint = locked
      ? ''
      : this.pending && !this.spawns.length
        ? t('caca.hint.loading', 'Procurando bichinhos no mapa…')
        : !this.spawns.length
          ? t('caca.hint.none', 'Nenhum bichinho por aqui agora — eles mudam a cada 15 min.')
          : near
            ? t('caca.hint.tap', 'Toque num bichinho dentro do círculo!')
            : joy
              ? t('caca.hint.joy', 'Use o controle ou toque no mapa para passear.')
              : t('caca.hint.walk', 'Ande até um bichinho para ele entrar no círculo.');
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.hint.style.display = hint ? '' : 'none';
  }

  private drawSpawn(c: CanvasRenderingContext2D, s: Spawn, x: number, y: number, k: number, inReach: boolean, locked: boolean): void {
    c.save();
    c.translate(x, y);
    c.globalAlpha = locked ? 0.25 : 1;
    c.scale(k, k);
    const R = s.g.rarity;
    c.fillStyle = 'rgba(20,6,50,0.22)';
    c.beginPath();
    c.ellipse(0, 2, 20, 6, 0, 0, Math.PI * 2);
    c.fill();
    if (R >= 2) {
      const [a] = RARITY_COL[R];
      c.fillStyle = a + '66';
      c.beginPath();
      c.ellipse(0, 2, 26 + Math.sin(this.time * 3) * 3, 9, 0, 0, Math.PI * 2);
      c.fill();
    }
    if (s.nest) {
      c.strokeStyle = 'rgba(255,210,58,0.9)';
      c.lineWidth = 2;
      c.setLineDash([4, 4]);
      c.beginPath();
      c.ellipse(0, 2, 24, 8, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    if (inReach && !locked) {
      c.strokeStyle = '#fff';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 2, 30 + Math.sin(this.time * 5) * 3, 11, 0, 0, Math.PI * 2);
      c.stroke();
    }
    c.translate(0, -22);
    const sz = 62 * (0.92 + R * 0.04) * Math.min(1, fitScale(s.g, 40) * 1.1);
    drawGenome(c, s.g, sz, this.time);
    c.restore();
  }

  private drawStop(c: CanvasRenderingContext2D, st: StopRef, x: number, y: number, k: number, ready: boolean, inReach: boolean, label: boolean): void {
    const tm = this.time;
    c.save();
    c.translate(x, y);
    c.scale(k, k);
    c.fillStyle = 'rgba(20,6,50,0.25)';
    c.beginPath();
    c.ellipse(0, 0, 16, 5, 0, 0, Math.PI * 2);
    c.fill();
    if (inReach) {
      c.strokeStyle = ready ? 'rgba(120,220,255,0.95)' : 'rgba(255,255,255,0.5)';
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(0, 0, 24 + Math.sin(tm * 4) * 2, 8, 0, 0, Math.PI * 2);
      c.stroke();
    }
    if (st.p.arena) {
      // arena: pódio de 3 degraus + bandeira + guardião em cima
      const cols = ready ? ['#ffd23a', '#ffb52e', '#e08a10'] : ['#c9bfe0', '#b2a6d0', '#9488b8'];
      for (let i = 0; i < 3; i++) {
        const w = 30 - i * 8;
        const yy = -8 - i * 9;
        c.fillStyle = cols[2];
        c.beginPath();
        c.roundRect(-w / 2, yy - 2, w, 11, 3);
        c.fill();
        c.fillStyle = cols[i % 2];
        c.beginPath();
        c.roundRect(-w / 2, yy - 4, w, 8, 3);
        c.fill();
      }
      c.strokeStyle = '#5b4a8a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(9, -30);
      c.lineTo(9, -58);
      c.stroke();
      c.fillStyle = ready ? '#ff5c8a' : '#9488b8';
      c.beginPath();
      const wv = Math.sin(tm * 4) * 2;
      c.moveTo(9, -58);
      c.quadraticCurveTo(17, -56 + wv, 24, -54);
      c.lineTo(9, -48);
      c.fill();
      if (ready) {
        const gd = this.guardian(st);
        c.save();
        c.translate(-2, -42 + Math.sin(tm * 2) * 2);
        drawGenome(c, gd.g, 34 * Math.min(1, fitScale(gd.g, 40) * 1.1), tm);
        c.restore();
      }
    } else {
      // Ponto Bloop: poste + bolha-presente girando
      c.strokeStyle = '#ffffff';
      c.lineWidth = 4;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(0, -30);
      c.stroke();
      c.strokeStyle = '#8a7ac8';
      c.lineWidth = 1.5;
      c.stroke();
      const by = -42 + Math.sin(tm * 2.2) * 2.5;
      const sq = Math.abs(Math.cos(tm * 1.6));
      const g = c.createRadialGradient(-4, by - 5, 2, 0, by, 15);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, ready ? '#7fe3ff' : '#d6cdee');
      g.addColorStop(1, ready ? '#5a6cff' : '#9a8cc6');
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(0, by, 13, 13, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(42,11,92,0.55)';
      c.lineWidth = 1.5;
      c.stroke();
      c.fillStyle = ready ? '#ffd23a' : '#ffffff';
      c.beginPath();
      c.roundRect(-7 * sq - 0.5, by - 6, 14 * sq + 1, 12, 3);
      c.fill();
      c.fillStyle = ready ? '#ff5c8a' : '#c9bfe0';
      c.fillRect(-1.5 * sq - 0.3, by - 6, 3 * sq + 0.6, 12);
    }
    c.restore();
    if (label) {
      c.save();
      c.font = gameFont(700, 12);
      const txt = st.p.name.length > 28 ? st.p.name.slice(0, 27) + '…' : st.p.name;
      const w = c.measureText(txt).width + 16;
      const ly = y - (st.p.arena ? 70 : 64) * k;
      c.fillStyle = 'rgba(26,11,61,0.86)';
      c.beginPath();
      c.roundRect(x - w / 2, ly - 11, w, 22, 11);
      c.fill();
      c.fillStyle = '#fff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, x, ly + 0.5);
      c.restore();
    }
  }

  private drawPlayer(c: CanvasRenderingContext2D, x: number, y: number, k: number, m: Mat): void {
    const t0 = this.time;
    const walking = this.sv.walkMode === 'controle' ? this.joyMoving : this.avSpeed > 0.3;
    // direção na tela
    let sdx = 0;
    let sdy = 1;
    if (this.heading !== null) {
      const hr = (this.heading * Math.PI) / 180;
      const vx = Math.sin(hr);
      const vy = -Math.cos(hr);
      sdx = m[0] * vx + m[2] * vy;
      sdy = m[1] * vx + m[3] * vy;
      const l = Math.hypot(sdx, sdy) || 1;
      sdx /= l;
      sdy /= l;
    }
    c.save();
    c.translate(x, y);
    // base do jogador: disco brilhante + seta de direção (lê bem em cima de qualquer mapa)
    c.save();
    c.scale(1, 0.5);
    const pulse = 1 + Math.sin(t0 * 3) * 0.04;
    c.fillStyle = 'rgba(122,92,255,0.28)';
    c.beginPath();
    c.arc(0, 0, 30 * k * pulse, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 4 * k;
    c.strokeStyle = '#ffffff';
    c.stroke();
    c.lineWidth = 2 * k;
    c.strokeStyle = '#7a5cff';
    c.beginPath();
    c.arc(0, 0, 24 * k, 0, Math.PI * 2);
    c.stroke();
    if (this.heading !== null) {
      const ang = Math.atan2(sdy / 0.5, sdx);
      c.rotate(ang);
      c.fillStyle = '#ffffff';
      c.strokeStyle = '#2a0b5c';
      c.lineWidth = 2.5 * k;
      c.beginPath();
      c.moveTo(44 * k, 0);
      c.lineTo(32 * k, -9 * k);
      c.lineTo(35 * k, 0);
      c.lineTo(32 * k, 9 * k);
      c.closePath();
      c.stroke();
      c.fill();
    }
    c.restore();
    const R = 17 * k;
    const step = walking ? Math.sin(t0 * 10) : 0;
    const bob = walking ? -Math.abs(step) * 4 * k : Math.sin(t0 * 2.4) * 0.8 * k;
    c.translate(0, -R * 1.02 + bob);
    if (walking) c.rotate(step * 0.07 + sdx * 0.06);
    const pose = this.pose;
    pose.t = t0;
    pose.blink = (t0 % 4) < 0.12 ? 1 : 0;
    pose.lookX = sdx * 0.6;
    pose.lookY = Math.max(-0.3, Math.min(0.4, sdy * 0.3));
    pose.sx = walking ? 1 + Math.abs(step) * 0.04 : 1;
    pose.sy = walking ? 1 - Math.abs(step) * 0.05 : 1;
    pose.mood = 'idle';
    pose.view = walking && sdy < -0.45 ? 'back' : undefined;
    drawAvatar(c, coreSave.avatar as AvatarData, R, pose);
    c.restore();
  }

  private drawNoFix(c: CanvasRenderingContext2D): void {
    const W = this.w;
    const Hh = this.h;
    const g = c.createLinearGradient(0, 0, 0, Hh);
    g.addColorStop(0, '#3a1f8a');
    g.addColorStop(1, '#1a0b3d');
    c.fillStyle = g;
    c.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 3; i++) {
      const k = (this.time * 0.6 + i / 3) % 1;
      c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(W / 2, Hh * 0.5, 20 + k * 120, 0, Math.PI * 2);
      c.stroke();
    }
    const pose = this.pose;
    pose.t = this.time;
    pose.view = undefined;
    c.save();
    c.translate(W / 2, Hh * 0.5 - 4);
    drawAvatar(c, coreSave.avatar as AvatarData, 22, pose);
    c.restore();
  }

  /* ============================== encontro / batalha ============================== */
  private openEncounter(s: Spawn): void {
    markSeen(s.g.family);
    persistCaca();
    this.enc = new Encounter(this, s, this.el, () => {
      this.enc = null;
      this.refreshSpawns(true);
    });
  }
  /** chamado pelo encontro quando o bichinho sai (capturado ou fugiu) */
  resolveSpawn(s: Spawn): void {
    markDone(s.id);
    this.spawns = this.spawns.filter((x) => x.id !== s.id);
  }
  get arEnabled(): boolean {
    return this.sv.ar;
  }
  set arEnabled(v: boolean) {
    this.sv.ar = v;
    persistCaca();
  }
  get auto(): boolean {
    return dbg.autoWin;
  }
  onCaught(s: Spawn, avg: number, secs: number): Mon {
    const g = s.g;
    const mon = addMon(seedHexOf(s), s.level);
    this.sv.catches++;
    this.sv.wins++;
    const st = bumpStreak();
    let coins = COINS_BY_RARITY[g.rarity] + Math.round(avg * 5);
    if (st.fresh) {
      coins += 10 * Math.min(7, st.count);
      if (st.count % 3 === 0) {
        const egg = addEgg(st.count >= 14 ? 2 : st.count >= 7 ? 1 : 0);
        if (egg) notify(t('caca.egg.streak', 'Sequência de {n} dias: você ganhou um ovo!', { n: st.count }), { icon: 'gift', kind: 'good' });
      }
      if (st.count > 1) notify(t('caca.streak', 'Sequência diária: {n} dias!', { n: st.count }), { icon: 'fire', kind: 'good' });
    } else if (Math.random() < 0.12 && addEgg(0)) notify(t('caca.egg.found', 'Você achou um ovo!'), { icon: 'gift', kind: 'good' });
    if (this.sv.locMode === 'casa') this.walked(0.3);
    addCoins(coins);
    for (const m of teamMons()) {
      if (m.uid === mon.uid) continue;
      if (giveXp(m, 30 + g.rarity * 12) > 0) notify(t('caca.lvlup', '{name} subiu para o nível {n}!', { name: genome(m.seed, m.evo).name, n: m.lvl }), { icon: 'arrow-up', kind: 'good' });
    }
    persistCaca();
    reportRun({ game: 'caca', score: powerOf(g, s.level), coins, durationSec: Math.round(secs), won: true, stats: { rarity: g.rarity, catches: 1 } });
    (mon as Mon & { coins?: number }).coins = coins;
    return mon;
  }
  onLost(_s: Spawn, secs: number): void {
    this.sv.battles++;
    persistCaca();
    reportRun({ game: 'caca', score: 0, coins: 0, durationSec: Math.round(secs), won: false });
  }

  /* ============================== Bloopdex ============================== */
  private showDex(tab: 'dex' | 'mine' | 'eggs'): void {
    const o = this.openOverlay();
    this.header(o, t('caca.dex', 'Bloopdex'), () => this.closeOverlay());
    const tabs = h('div', 'cc-tabs');
    const body = h('div', 'cc-scroll');
    const defs: [typeof tab, string][] = [
      ['mine', t('caca.tab.mine', 'Meus')],
      ['dex', t('caca.tab.dex', 'Famílias')],
      ['eggs', t('caca.tab.eggs', 'Ovos')],
    ];
    const render = (k: typeof tab) => {
      tab = k;
      tabs.querySelectorAll('.cc-tab').forEach((b, i) => b.classList.toggle('on', defs[i][0] === k));
      body.innerHTML = '';
      body.scrollTop = 0;
      if (k === 'dex') this.renderFamilies(body);
      else if (k === 'mine') this.renderMine(body);
      else this.renderEggs(body);
    };
    for (const [k, label] of defs) {
      const b = h('button', 'cc-tab');
      b.textContent = label;
      this.btn(b, () => render(k));
      tabs.appendChild(b);
    }
    o.append(tabs, body);
    render(tab);
  }

  private statsHtml(): string {
    const s = this.sv;
    const fams = Object.values(s.dex).filter((d) => d.caught > 0).length;
    return `<div class="cc-stats">
      <div class="cc-stat"><b>${fams}/100</b><small>${esc(t('caca.st.families', 'famílias'))}</small></div>
      <div class="cc-stat"><b>${s.mons.length}</b><small>${esc(t('caca.st.caught', 'bichinhos'))}</small></div>
      <div class="cc-stat"><b>${s.km.toFixed(1)}</b><small>${esc(t('caca.st.km', 'km andados'))}</small></div>
      <div class="cc-stat"><b>${streakAlive()}</b><small>${esc(t('caca.st.streak', 'dias seguidos'))}</small></div></div>`;
  }

  private renderFamilies(body: HTMLElement): void {
    body.insertAdjacentHTML('beforeend', this.statsHtml());
    const grid = h('div', 'cc-grid');
    for (const el of ELEMENTS)
      for (const sh of SHAPES) {
        const fam = sh + '-' + el;
        const d = this.sv.dex[fam];
        const best = this.sv.mons
          .map((m) => genome(m.seed, m.evo))
          .filter((g) => g.family === fam)
          .sort((a, b) => b.rarity - a.rarity)[0];
        const g = best ?? familyRep(fam);
        const cell = h('button', 'cc-cell');
        cell.appendChild(genomeIcon(g, 88, { locked: !best }));
        const lab = h('span');
        lab.textContent = best ? `${elName(el)} · ${shapeName(sh)}` : d?.seen ? t('caca.dex.seen', 'Visto') : '???';
        cell.appendChild(lab);
        if (best) this.btn(cell, () => this.showMonByFamily(fam));
        grid.appendChild(cell);
      }
    body.appendChild(grid);
  }
  private showMonByFamily(fam: string): void {
    const m = this.sv.mons.filter((x) => genome(x.seed, x.evo).family === fam).sort((a, b) => genome(b.seed, b.evo).rarity - genome(a.seed, a.evo).rarity)[0];
    if (m) this.showMon(m);
  }

  private renderMine(body: HTMLElement): void {
    const team = teamMons();
    body.insertAdjacentHTML('beforeend', `<div class="cc-card"><h3>${esc(t('caca.team.title', 'Equipe ({n}/6)', { n: team.length }))}</h3><p>${esc(t('caca.team.help', 'A equipe ajuda nas batalhas e ganha experiência. Toque num bichinho para ver, evoluir ou trocar.'))}</p></div>`);
    const grid = h('div', 'cc-grid');
    const list = [...this.sv.mons].sort((a, b) => {
      const ta = this.sv.team.includes(a.uid) ? 1 : 0;
      const tb = this.sv.team.includes(b.uid) ? 1 : 0;
      return tb - ta || genome(b.seed, b.evo).rarity - genome(a.seed, a.evo).rarity || b.at - a.at;
    });
    for (const m of list) {
      const g = genome(m.seed, m.evo);
      const cell = h('button', 'cc-cell');
      cell.appendChild(genomeIcon(g, 88));
      cell.insertAdjacentHTML('beforeend', `<b class="lv">${m.lvl}</b>${this.sv.team.includes(m.uid) ? '<b class="tm">✓</b>' : ''}<span></span>`);
      cell.querySelector('span')!.textContent = monName(g);
      this.btn(cell, () => this.showMon(m));
      grid.appendChild(cell);
    }
    body.appendChild(grid);
  }

  private renderEggs(body: HTMLElement): void {
    const s = this.sv;
    body.insertAdjacentHTML(
      'beforeend',
      `<div class="cc-card"><p>${esc(t('caca.egg.help', 'Ovos chocam conforme você anda com o jogo aberto. Ganhe ovos na sequência diária (a cada 3 dias) e às vezes ao capturar.'))}</p>${s.locMode === 'casa' ? `<p>${esc(t('caca.egg.home', 'No modo casa, cada captura conta 0,3 km para os ovos.'))}</p>` : ''}</div>`,
    );
    if (!s.eggs.length) body.insertAdjacentHTML('beforeend', `<div class="cc-card"><p>${esc(t('caca.egg.none', 'Nenhum ovo ainda.'))}</p></div>`);
    for (const e of s.eggs) {
      const tier = e.needKm >= 10 ? 2 : e.needKm >= 5 ? 1 : 0;
      body.insertAdjacentHTML(
        'beforeend',
        `<div class="cc-egg"><div class="ic t${tier}"></div><div class="inf">${esc(t('caca.egg.km', '{a} de {b} km', { a: e.km.toFixed(1), b: e.needKm }))}<div class="cc-bar"><i style="width:${Math.round((e.km / e.needKm) * 100)}%"></i></div></div></div>`,
      );
    }
  }

  private showMon(m: Mon): void {
    const bg = h('div', 'cc-sheet-bg');
    const sh = h('div', 'cc-sheet');
    const close = () => {
      bg.remove();
      sh.remove();
    };
    this.btn(bg, close);
    const render = () => {
      const g = genome(m.seed, m.evo);
      const st = statsAt(g, m.lvl);
      const inTeam = this.sv.team.includes(m.uid);
      sh.innerHTML = '';
      const hd = h('div', 'cc-h');
      const x = h('button', 'cc-ibtn', icon('close'));
      this.btn(x, close);
      const h2 = h('h2');
      h2.textContent = monName(g);
      hd.append(x, h2);
      const sc = h('div', 'cc-scroll');
      const big = genomeIcon(g, 200);
      big.classList.add('cc-big');
      sc.appendChild(big);
      const max = Math.max(st.vig, st.forca, st.defesa, st.agil, 1);
      const bar = (label: string, v: number) => `<div class="cc-statrow"><span>${esc(label)}</span><div class="cc-bar"><i style="width:${Math.round((v / max) * 100)}%"></i></div><b>${v}</b></div>`;
      sc.insertAdjacentHTML(
        'beforeend',
        `<div class="cc-card"><div class="cc-sub" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${rarBadge(g.rarity)} ${elBadge(g.element)}${g.element2 ? ' ' + elBadge(g.element2) : ''} <b>${esc(t('caca.lvl', 'Nv. {n}', { n: m.lvl }))}</b> · ${esc(t('caca.power', 'Poder {n}', { n: powerOf(g, m.lvl) }))}</div>
        <div style="margin:8px 0 4px;font:600 12px var(--font)">${esc(t('caca.xp', 'XP {a}/{b}', { a: m.xp, b: xpNeed(m.lvl) }))}</div><div class="cc-bar"><i style="width:${Math.round((m.xp / xpNeed(m.lvl)) * 100)}%"></i></div>
        ${bar(t('caca.stat.vig', 'Vida'), st.vig)}${bar(t('caca.stat.forca', 'Força'), st.forca)}${bar(t('caca.stat.defesa', 'Defesa'), st.defesa)}${bar(t('caca.stat.agil', 'Agilidade'), st.agil)}
        <div class="cc-traits"><span>${esc(shapeName(g.shape))}</span><span>${esc(matName(g.material))}</span><span>${esc(patName(g.pattern))}</span><span>${esc(abilName(ABIL[g.element]))}: ${esc(abilHelp(ABIL[g.element]))}</span></div></div>`,
      );
      const row = h('div', 'cc-row');
      const tb = h('button', 'cc-btn sec small', esc(inTeam ? t('caca.team.remove', 'Tirar da equipe') : t('caca.team.add', 'Pôr na equipe')));
      this.btn(tb, () => {
        if (!toggleTeam(m.uid)) notify(t('caca.team.full', 'A equipe já tem 6. Tire alguém primeiro.'), { kind: 'warn' });
        render();
      });
      const share = h('button', 'cc-btn sec small', esc(t('caca.share', 'Compartilhar')));
      this.btn(share, () => void shareCard(g, m.lvl));
      row.append(tb, share);
      sc.appendChild(row);
      if (m.evo < 2) {
        const ev = h('button', 'cc-btn pink', `${icon('sparkle')} ${esc(canEvolve(m) ? t('caca.evolve', 'Evoluir!') : t('caca.evolveAt', 'Evolui no nível {n}', { n: EVO_LVL[m.evo] }))}`) as HTMLButtonElement;
        ev.disabled = !canEvolve(m);
        this.btn(ev, () => {
          if (!evolve(m)) return;
          audio.record();
          haptics.success();
          bigMoment(t('caca.evolved', 'Evoluiu!'), { sub: genome(m.seed, m.evo).name, icon: 'sparkle' });
          render();
        });
        sc.appendChild(ev);
      }
      if (this.sv.mons.length > 1) {
        const rel = h('button', 'cc-btn sec small', esc(t('caca.release', 'Soltar na natureza')));
        let armed = false;
        this.btn(rel, () => {
          if (!armed) {
            armed = true;
            rel.textContent = t('caca.releaseSure', 'Toque de novo para soltar');
            return;
          }
          releaseMon(m.uid);
          close();
          if (this.overlay) this.showDex('mine');
        });
        sc.appendChild(rel);
      }
      sh.append(hd, sc);
    };
    render();
    this.el.append(bg, sh);
  }

  /* ============================== ajustes ============================== */
  private showSettings(): void {
    const o = this.openOverlay();
    this.header(o, t('caca.settings', 'Ajustes'), () => this.closeOverlay());
    const sc = h('div', 'cc-scroll');
    const card = h('div', 'cc-card');
    const tog = (label: string, on: boolean, fn: () => void) => {
      const r = h('div', 'cc-toggle');
      const sp = h('span');
      sp.textContent = label;
      const b = h('button', on ? 'on' : '');
      b.textContent = on ? t('caca.on', 'Ligado') : t('caca.off', 'Desligado');
      this.btn(b, fn);
      r.append(sp, b);
      card.appendChild(r);
    };
    tog(t('caca.set.home', 'Modo casa (sem GPS)'), this.sv.locMode === 'casa', () => {
      this.sv.locMode = this.sv.locMode === 'casa' ? 'gps' : 'casa';
      persistCaca();
      this.startMap();
    });
    tog(t('caca.walk.joy', 'Andar com o controle'), this.sv.walkMode === 'controle', () => {
      this.sv.walkMode = this.sv.walkMode === 'controle' ? 'real' : 'controle';
      persistCaca();
      this.startMap();
    });
    tog(t('caca.set.ar', 'Câmera AR nos encontros'), this.sv.ar, () => {
      this.sv.ar = !this.sv.ar;
      persistCaca();
      this.showSettings();
    });
    sc.appendChild(card);
    const odds = rarityOdds();
    const ve = variationEstimate();
    sc.insertAdjacentHTML(
      'beforeend',
      `<div class="cc-card"><h3>${esc(t('caca.odds', 'Chance por aparição'))}</h3><table class="cc-odds">${odds
        .map((p, i) => `<tr><td>${rarBadge(i as Rarity)}</td><td>${p >= 0.001 ? (p * 100).toFixed(1) + '%' : '1 / ' + fmt(Math.round(1 / p))}</td></tr>`)
        .join('')}</table><p style="margin-top:8px">${esc(t('caca.oddsNote', 'A raridade vem só do código genético do bichinho — é igual em qualquer lugar. Únicos não podem ser comprados nem trocados.'))}</p><p>${esc(t('caca.variety', 'Combinações possíveis: mais de {n}.', { n: fmt(Number(ve.total.toPrecision(2))) }))}</p></div>
      <div class="cc-card"><h3>${esc(t('caca.privacy.h', 'Sua localização fica no aparelho'))}</h3><p>${esc(t('caca.privacy.p1', 'O GPS é usado só com o jogo aberto, para mostrar o mapa e calcular as aparições aqui mesmo no aparelho. Nada é enviado, salvo ou compartilhado — nem com a gente.'))}</p>
      <p>${esc(t('caca.privacy.map', 'O desenho do mapa vem por um quadradão de uns 2 km (nunca o ponto exato), e fica guardado no aparelho para funcionar sem internet.'))}</p></div>
      <div class="cc-card"><h3>${esc(t('caca.credits', 'Mapa'))}</h3><p>${esc(t('caca.credits.p', 'Dados do mapa © colaboradores do OpenStreetMap (openstreetmap.org/copyright), licença ODbL. Desenho dos tiles: OpenFreeMap.'))}</p></div>`,
    );
    const saf = h('button', 'cc-btn sec', esc(t('caca.safety.title', 'Antes de caçar')));
    this.btn(saf, () => this.showSafety(() => this.startMap()));
    sc.appendChild(saf);
    o.appendChild(sc);
  }

  /* ============================== depuração (?debug) ============================== */
  private exposeDebug(): void {
    const self = this;
    (window as unknown as { __caca: unknown }).__caca = {
      dbg,
      set autoWin(v: boolean) {
        dbg.autoWin = v;
      },
      get autoWin() {
        return dbg.autoWin;
      },
      spawns: () =>
        self.spawns.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, name: s.g.name, rarity: s.g.rarity, element: s.g.element, seed: seedHexOf(s), dist: Math.round(self.distTo(s)), screen: self.screenOf(s) })),
      fix: () => self.fix,
      /** câmera: zoom (px/m) e rotação (graus) */
      cam: (zoom?: number, rotDeg?: number) => {
        if (zoom !== undefined) self.setZoom(zoom);
        if (rotDeg !== undefined) self.rot = (rotDeg * Math.PI) / 180;
        return { zoom: self.sv.zoom, rot: (self.rot * 180) / Math.PI, follow: self.follow };
      },
      /** joystick simulado: x,y em -1..1 por `secs` segundos */
      joy: (x: number, y: number, secs = 2) => {
        self.joyOverride = { x, y, until: performance.now() + secs * 1000 };
      },
      walkTo: (lat: number, lon: number) => {
        self.walkTo = project(lat, lon, WZ);
      },
      walkMode: (m?: 'real' | 'controle') => {
        if (m && m !== self.sv.walkMode) {
          self.sv.walkMode = m;
          persistCaca();
          self.startMap();
        }
        return self.sv.walkMode;
      },
      stops: () => self.stops.map((s) => ({ id: s.p.id, name: s.p.name, cls: s.p.cls, arena: s.p.arena, lat: s.lat, lon: s.lon, dist: Math.round(self.distTo(s)) })),
      openStop: (id: string) => {
        const s = self.stops.find((x) => x.p.id === id);
        if (s) self.openStop(s);
        return !!s;
      },
      spawnsFull: () => self.spawns.map((s) => ({ id: s.id, lat: s.lat, lon: s.lon, biome: s.biome, element: s.g.element, nest: s.nest ?? null, nestFam: s.nest ? nestFamily(s.nest, Date.now()) : null, dist: Math.round(self.distTo(s)) })),
      land: (lat: number, lon: number) => {
        const [x, y] = project(lat, lon, WZ);
        return self.store?.landAt(x, y) ?? null;
      },
      gps: () => ({ stats: self.locator?.filter.stats ?? null, av: self.av ? unproject(self.av[0], self.av[1], WZ) : null, fix: self.fix, pending: self.pending }),
      mapReady: () => {
        if (!self.store || !self.m) return false;
        const [x0, y0, x1, y1] = visibleBounds(self.m, self.w, self.h, self.h * 0.3);
        return self.store.status(x0, y0, x1, y1) === 'ok';
      },
      joyBudget: () => joyBudget(),
      tap: (id: string) => {
        const s = self.spawns.find((x) => x.id === id);
        return s ? self.trySpawn(s) : false;
      },
      /** abre o encontro direto (ignora distância/trava) — só para testes */
      encounter: (id: string) => {
        const s = self.spawns.find((x) => x.id === id);
        if (!s || self.enc) return false;
        self.closeOverlay();
        self.openEncounter(s);
        return true;
      },
      state: () => ({ enc: self.enc?.phase ?? null, mons: self.sv.mons.length, dex: self.sv.dex, overlay: !!self.overlay, locked: self.lock.locked }),
      openDex: (tab: 'dex' | 'mine' | 'eggs' = 'dex') => self.showDex(tab),
      closeOverlay: () => self.closeOverlay(),
      save: self.sv,
      sheet: async (n = 100) => {
        const m = await import('./sheet');
        const cv = m.contactSheet(n);
        return cv.toDataURL('image/png');
      },
    };
  }

  /* ============================== ciclo de vida ============================== */
  pause(): void {
    this.paused = true;
    this.locator?.stop(); // só em primeiro plano
    this.enc?.pause();
  }
  resume(): void {
    this.paused = false;
    this.last = 0;
    if (this.mapOn && this.sv.locMode === 'gps' && (this.sv.walkMode === 'real' || !this.fix)) this.startLocator();
    this.enc?.resume();
  }
  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.locator?.stop();
    this.enc?.destroy();
    this.renderer?.dispose();
    this.store?.dispose();
    setLandSampler(null);
    this.joy?.destroy();
    persistCaca();
    this.btns.forEach((b) => b.destroy());
    this.offs.forEach((f) => f());
    this.el.remove();
    delete (window as unknown as { __caca?: unknown }).__caca;
  }
}

function seedHexOf(s: Spawn): string {
  return s.g.seed;
}

/* ============================== representante de família (silhueta) ============================== */
const repCache = new Map<string, Genome>();
function familyRep(fam: string): Genome {
  const hit = repCache.get(fam);
  if (hit) return hit;
  const [sh, el] = fam.split('-') as [Genome['shape'], Element];
  let g = genome(withElement(seedFrom('dexrep', fam, 0), el));
  for (let i = 1; i < 300 && g.shape !== sh; i++) g = genome(withElement(seedFrom('dexrep', fam, i), el));
  repCache.set(fam, g);
  return g;
}

/* ============================== cartão para compartilhar ============================== */
async function shareCard(g: Genome, lvl: number): Promise<void> {
  const W = 720;
  const H = 960;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const c = cv.getContext('2d')!;
  rarityBackdrop(c, W, g.rarity);
  c.fillStyle = 'rgba(26,11,61,0.9)';
  c.beginPath();
  c.roundRect(0, W - 40, W, H - W + 40, [0, 0, 40, 40]);
  c.fill();
  c.save();
  c.translate(W / 2, W * 0.5);
  const k = (W / 100) * fitScale(g, 44) * 0.92;
  c.scale(k, k);
  paintGenome(c, g, 'all');
  c.restore();
  c.textAlign = 'center';
  c.fillStyle = '#fff';
  c.font = gameFont(700, 64);
  c.fillText(monName(g), W / 2, W + 50);
  c.font = gameFont(600, 32);
  c.fillText(`${rarName(g.rarity)} · ${elName(g.element)} · ${t('caca.lvl', 'Nv. {n}', { n: lvl })}`, W / 2, W + 100);
  c.font = gameFont(600, 26);
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.fillText(`${t('caca.name', 'Caça Bloop')} · Bloop World`, W / 2, H - 40);
  const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return;
  const { shareOrSave } = await import('../mirror/media');
  const res = await shareOrSave(blob);
  if (res === 'downloaded') notify(t('caca.saved', 'Cartão salvo!'), { kind: 'good', icon: 'check' });
}

/* ============================== Encontro + batalha + captura ============================== */
type Phase = 'meet' | 'intro' | 'round' | 'after' | 'capture' | 'result';

class Encounter {
  phase: Phase = 'meet';
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private panel: HTMLDivElement;
  private hud: HTMLDivElement | null = null;
  private tip: HTMLDivElement | null = null;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private t = 0;
  private g: Genome;
  private video: HTMLVideoElement | null = null;
  private ar: ArProvider | null = null;
  private arOn = false;
  private mg: Minigame | null = null;
  private mgRect = { x: 0, y: 0, w: 0, h: 0 };
  private round = 0;
  private kinds: GameKind[] = [];
  private foeHp = 100;
  private myHp = 100;
  private scores: number[] = [];
  private cds = new Map<string, number>();
  private used = new Set<Ability>();
  private hurtT = 0;
  private pf = 1;
  private diff = 0;
  private t0 = performance.now();
  private bubble = { t: 0, ok: false, wob: 0 };
  private retried = false;
  private btns: BoundButton[] = [];
  private paused = false;

  constructor(
    private game: CacaGame,
    private s: Spawn,
    parent: HTMLElement,
    private onClose: () => void,
  ) {
    this.g = s.g;
    this.el = h('div', 'cc-ov cc-enc fade');
    this.cv = h('canvas', 'cc-scene');
    this.c = this.cv.getContext('2d')!;
    this.el.appendChild(this.cv);
    this.panel = h('div', 'cc-panel');
    this.el.appendChild(this.panel);
    parent.appendChild(this.el);
    this.resize();
    this.cv.addEventListener('pointerdown', this.pd);
    this.cv.addEventListener('pointermove', this.pm);
    this.cv.addEventListener('pointerup', this.pu);
    this.cv.addEventListener('pointercancel', this.pu);
    // dificuldade: raridade + agilidade relativa + nível
    const st = statsAt(this.g, s.level);
    const tot = st.vig + st.forca + st.defesa + st.agil;
    this.diff = Math.max(0.05, Math.min(1, 0.1 + this.g.rarity * 0.16 + (st.agil / tot - 0.25) * 0.8 + s.level * 0.004));
    const team = teamMons();
    const myPow = team.length ? team.reduce((a, m) => a + powerOf(genome(m.seed, m.evo), m.lvl), 0) / team.length : 100;
    const foePow = powerOf(this.g, s.level);
    this.pf = Math.max(0.6, Math.min(1.3, 0.8 + 0.5 * (myPow / foePow - 1)));
    const prim = EL_GAMES[this.g.element];
    const third = this.g.element2 ? EL_GAMES[this.g.element2][0] : GAME_KINDS[(this.g.detail >>> 3) % GAME_KINDS.length];
    this.kinds = [prim[0], prim[1], third];
    if (game.arEnabled) void this.toggleAr(true);
    this.meetUi();
    audio.click();
    haptics.tap('medium');
  }

  private bb(el: HTMLElement, fn: () => void): HTMLElement {
    this.btns.push(bindButton(el, { onRelease: (e) => e && el.contains(document.elementFromPoint(e.clientX, e.clientY)) && fn() }));
    return el;
  }

  resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = this.el.clientWidth || window.innerWidth;
    this.h = this.el.clientHeight || window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  private async toggleAr(on: boolean): Promise<void> {
    if (on === this.arOn) return;
    this.arOn = on;
    if (on) {
      this.video = h('video');
      this.video.setAttribute('playsinline', '');
      this.video.muted = true;
      this.el.insertBefore(this.video, this.cv);
      this.ar = new WebArLite();
      const r = await this.ar.start(this.video);
      if (!r.camera) {
        notify(t('caca.ar.nocam', 'Câmera indisponível — usando o cenário desenhado.'), { kind: 'warn', icon: 'camera' });
        this.video.remove();
        this.video = null;
      }
    } else {
      this.ar?.stop();
      this.ar = null;
      this.video?.remove();
      this.video = null;
    }
    this.game.arEnabled = on;
  }

  /* ---------- telas ---------- */
  private meetUi(): void {
    const g = this.g;
    this.panel.innerHTML = `<div class="cc-name"></div><div class="cc-sub">${rarBadge(g.rarity)} ${elBadge(g.element)}${g.element2 ? ' ' + elBadge(g.element2) : ''} <span>${esc(t('caca.lvl', 'Nv. {n}', { n: this.s.level }))} · ${esc(t('caca.power', 'Poder {n}', { n: powerOf(g, this.s.level) }))}</span></div>`;
    this.panel.querySelector('.cc-name')!.textContent = monName(g);
    const row = h('div', 'cc-row');
    const run = h('button', 'cc-btn sec', esc(t('caca.flee', 'Voltar')));
    const ar = h('button', 'cc-btn sec', `${icon('camera')} AR`);
    const fight = h('button', 'cc-btn', `${icon('bolt')} ${esc(t('caca.fight', 'Batalhar!'))}`);
    this.bb(run, () => this.close());
    this.bb(ar, () => void this.toggleAr(!this.arOn));
    this.bb(fight, () => this.startRound());
    row.append(run, ar);
    this.panel.append(row, fight);
    if (g.rarity >= 3) bigMoment(rarName(g.rarity) + '!', { icon: 'sparkle', sub: g.name });
  }

  private buildHud(): void {
    if (this.hud) return;
    this.hud = h('div', 'cc-hud');
    this.hud.innerHTML = `<div class="hp foe"><span class="nm"></span><div class="cc-bar"><i></i></div></div><div class="hp me"><span>${esc(t('caca.energy', 'Energia'))}</span><div class="cc-bar"><i></i></div></div><div class="rp"><i></i></div>`;
    this.hud.querySelector('.nm')!.textContent = this.g.name;
    this.el.appendChild(this.hud);
    this.updHud();
  }
  private updHud(): void {
    if (!this.hud) return;
    const [a, b, c] = this.hud.querySelectorAll<HTMLElement>('i');
    a.style.width = Math.max(0, this.foeHp) + '%';
    b.style.width = Math.max(0, this.myHp) + '%';
    c.style.width = Math.round((this.mg?.progress() ?? 0) * 100) + '%';
  }

  private startRound(): void {
    this.phase = 'intro';
    this.buildHud();
    this.panel.innerHTML = '';
    this.used.clear();
    const k = this.kinds[Math.min(this.round, this.kinds.length - 1)];
    const box = h('div', 'cc-intro');
    box.innerHTML = `<small>${esc(t('caca.round', 'Round {n}/{m}', { n: this.round + 1, m: this.kinds.length }))}</small><h3></h3><p></p>`;
    box.querySelector('h3')!.textContent = gameName(k);
    box.querySelector('p')!.textContent = gameHelp(k);
    const team = teamMons();
    if (team.length) {
      const as = h('div', 'cc-assists');
      for (const m of team) {
        const g = genome(m.seed, m.evo);
        const ab = ABIL[g.element];
        const cd = this.cds.get(m.uid) ?? 0;
        const b = h('button', 'cc-assist') as HTMLButtonElement;
        b.appendChild(genomeIcon(g, 44, { backdrop: false }));
        b.appendChild(document.createTextNode(abilName(ab)));
        if (cd > 0) {
          b.disabled = true;
          b.insertAdjacentHTML('beforeend', `<span class="cd">${cd}</span>`);
        }
        b.title = abilHelp(ab);
        this.bb(b, () => {
          if (b.disabled) return;
          if (b.classList.contains('used')) return;
          b.classList.add('used');
          this.used.add(ab);
          this.cds.set(m.uid, ABIL_CD[ab] + 1);
          if (ab === 'cura') this.myHp = Math.min(100, this.myHp + 30 * (1 + m.lvl * 0.01));
          notify(`${g.name}: ${abilHelp(ab)}`, { icon: 'sparkle', kind: 'good', key: 'ab' + ab });
          audio.coin();
          this.updHud();
        });
        as.appendChild(b);
      }
      box.appendChild(as);
    }
    const go = h('button', 'cc-btn', `${icon('play')} ${esc(t('caca.go', 'Vai!'))}`);
    this.bb(go, () => {
      box.remove();
      this.beginMinigame(k);
    });
    box.appendChild(go);
    this.el.appendChild(box);
    if (this.game.auto) setTimeout(() => box.isConnected && (box.remove(), this.beginMinigame(k)), 250);
  }

  private beginMinigame(k: GameKind): void {
    this.phase = 'round';
    // lembrete curto do que fazer (some sozinho) — criança não precisa decorar a tela de intro
    this.tip?.remove();
    this.tip = h('div', 'cc-tip');
    this.tip.textContent = gameHelp(k);
    this.el.appendChild(this.tip);
    for (const [u, v] of this.cds) this.cds.set(u, Math.max(0, v - 1));
    const top = this.h * 0.3;
    this.mgRect = { x: 0, y: top, w: this.w, h: this.h - top - Math.max(12, edges().b) };
    this.mg = makeMinigame(k, {
      w: this.mgRect.w,
      h: this.mgRect.h,
      diff: this.diff,
      hint: this.used.has('dica'),
      seed: seedFrom(this.g.seed, 'round', this.round, Date.now() & 0xffff),
      el: this.g.element,
      auto: this.game.auto,
      fx: (kind) => {
        if (kind === 'perfect') (audio.perfect(), haptics.tap('medium'));
        else if (kind === 'hit') (audio.coin(), haptics.tap('light'));
        else if (kind === 'miss') (audio.hit(), haptics.tap('heavy'));
        else audio.tick();
      },
    });
  }

  private endRound(score: number): void {
    this.tip?.remove();
    this.tip = null;
    const mg = this.mg!;
    this.mg = null;
    this.scores.push(score);
    const dmg = score * 70 * this.pf * (this.used.has('forca') ? 1.35 : 1);
    const counter = this.used.has('escudo') ? 0 : (1 - score) * 42 * (0.8 + this.diff * 0.5);
    this.foeHp = Math.max(0, this.foeHp - dmg);
    this.myHp = Math.max(0, this.myHp - counter);
    if (dmg > 0) this.hurtT = 0.5;
    void mg;
    this.updHud();
    this.round++;
    this.phase = 'after';
    setTimeout(() => {
      if (!this.el.isConnected) return;
      if (this.foeHp <= 0) this.startCapture();
      else if (this.myHp <= 0 || this.round >= this.kinds.length) this.lose();
      else this.startRound();
    }, 900);
  }

  private avg(): number {
    return this.scores.length ? this.scores.reduce((a, b) => a + b, 0) / this.scores.length : 0;
  }

  private startCapture(): void {
    this.phase = 'capture';
    const R = this.g.rarity;
    const chance = Math.min(0.98, CATCH_BASE[R] * (0.6 + 0.4 * this.avg()) + (this.myHp / 100) * 0.1 + Math.min(0.08, teamMons().length * 0.015));
    this.bubble = { t: 0, ok: this.game.auto || Math.random() < chance, wob: 0 };
    audio.click();
  }

  private captureDone(): void {
    const secs = (performance.now() - this.t0) / 1000;
    if (this.bubble.ok) {
      this.phase = 'result';
      const mon = this.game.onCaught(this.s, this.avg(), secs);
      this.game.resolveSpawn(this.s);
      audio.record();
      haptics.success();
      const coins = (mon as Mon & { coins?: number }).coins ?? 0;
      const box = h('div', 'cc-result');
      box.innerHTML = `<h2>${esc(t('caca.caught', 'Capturado!'))}</h2>`;
      box.appendChild(genomeIcon(this.g, 150));
      box.insertAdjacentHTML('beforeend', `<p><b></b></p><p>${rarBadge(this.g.rarity)} ${elBadge(this.g.element)}</p><p>${icon('coin')} +${coins}</p>`);
      box.querySelector('p b')!.textContent = monName(this.g);
      const row = h('div', 'cc-row');
      const share = h('button', 'cc-btn sec', esc(t('caca.share', 'Compartilhar')));
      const ok = h('button', 'cc-btn', esc(t('caca.continue', 'Continuar')));
      this.bb(share, () => void shareCard(this.g, mon.lvl));
      this.bb(ok, () => this.close());
      row.append(share, ok);
      box.appendChild(row);
      this.hud?.remove();
      this.hud = null;
      this.el.appendChild(box);
      return;
    }
    // escapou da bolha
    const flee = this.retried || Math.random() < 0.5;
    if (flee) {
      this.game.resolveSpawn(this.s);
      this.game.onLost(this.s, secs);
      this.result(t('caca.fled', 'Ele fugiu!'), t('caca.fledP', 'Escapou da bolha e sumiu. Outros vão aparecer!'));
    } else {
      this.retried = true;
      notify(t('caca.escaped', 'Escapou da bolha! Mais um round…'), { kind: 'warn', icon: 'warning' });
      this.foeHp = 25;
      this.kinds.push(this.kinds[this.round % this.kinds.length]);
      this.startRound();
    }
  }

  private lose(): void {
    const secs = (performance.now() - this.t0) / 1000;
    const flee = Math.random() < 0.6;
    if (flee) this.game.resolveSpawn(this.s);
    this.game.onLost(this.s, secs);
    audio.fail();
    this.result(
      flee ? t('caca.fled', 'Ele fugiu!') : t('caca.tired', 'Você cansou…'),
      flee ? t('caca.lostFled', 'Faltou pouco! Ele fugiu desta vez.') : t('caca.lostStay', 'Ele ainda está por aí. Tente de novo!'),
    );
  }

  private result(title: string, p: string): void {
    this.phase = 'result';
    this.hud?.remove();
    this.hud = null;
    const box = h('div', 'cc-result');
    box.innerHTML = `<h2></h2><p></p>`;
    box.querySelector('h2')!.textContent = title;
    box.querySelector('p')!.textContent = p;
    const ok = h('button', 'cc-btn', esc(t('caca.continue', 'Continuar')));
    this.bb(ok, () => this.close());
    box.appendChild(ok);
    this.el.appendChild(box);
  }

  /* ---------- entrada ---------- */
  private local(e: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    return [e.clientX - r.left - this.mgRect.x, e.clientY - r.top - this.mgRect.y];
  }
  private pd = (e: PointerEvent) => {
    if (!this.mg) return;
    e.preventDefault();
    try {
      this.cv.setPointerCapture(e.pointerId);
    } catch {
      /* */
    }
    const [x, y] = this.local(e);
    this.mg.down(x, y);
  };
  private pm = (e: PointerEvent) => {
    if (!this.mg) return;
    const [x, y] = this.local(e);
    this.mg.move(x, y);
  };
  private pu = (e: PointerEvent) => {
    if (!this.mg) return;
    const [x, y] = this.local(e);
    this.mg.up(x, y);
  };

  /* ---------- quadro ---------- */
  frame(dt: number, time: number): void {
    if (this.paused) return;
    this.t += dt;
    const slow = this.used.has('lento') ? 0.7 : 1;
    if (this.mg) {
      this.mg.update(dt * slow);
      if (this.mg.done) this.endRound(this.mg.score);
      this.updHud();
    }
    this.hurtT = Math.max(0, this.hurtT - dt);
    const c = this.c;
    const W = this.w;
    const H = this.h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    if (!this.video) this.drawScene(c, W, H);
    else {
      c.fillStyle = 'rgba(20,8,56,0.12)';
      c.fillRect(0, 0, W, H);
    }
    // posição do bichinho
    const battle = this.phase !== 'meet';
    let x = W / 2;
    let y = battle ? H * 0.19 : H * 0.42;
    let size = battle ? Math.min(W * 0.3, H * 0.17) : Math.min(W * 0.75, H * 0.45);
    const pose = this.ar?.pose();
    if (this.video && pose) {
      x += -pose.yaw * (W / 1.05);
      y += pose.pitch * (H / 1.3);
    }
    if (this.phase === 'capture') {
      this.bubble.t += dt;
      size *= Math.max(0.55, 1 - this.bubble.t * 0.8);
    }
    c.save();
    c.translate(x + (this.hurtT > 0 ? Math.sin(this.hurtT * 60) * 8 : 0), y);
    const k = fitScale(this.g, 44);
    if (this.phase !== 'result' || !this.bubble.ok) drawGenome(c, this.g, size * Math.min(1.1, k * 1.05), time, { mood: this.phase === 'capture' ? 'idle' : undefined });
    if (this.hurtT > 0.3) {
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = 'rgba(255,255,255,0.25)';
      c.beginPath();
      c.arc(0, 0, size * 0.4, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    if (this.phase === 'capture' || (this.phase === 'result' && this.bubble.ok)) this.drawBubble(c, size);
    c.restore();
    if (this.mg) {
      c.save();
      c.translate(this.mgRect.x, this.mgRect.y);
      this.mg.draw(c);
      c.restore();
    }
  }

  private drawBubble(c: CanvasRenderingContext2D, size: number): void {
    const b = this.bubble;
    const grow = Math.min(1, b.t / 0.5);
    const wobT = Math.max(0, b.t - 0.6);
    const n = Math.floor(wobT / 0.55);
    if (this.phase === 'capture' && n !== b.wob && n <= 3) {
      b.wob = n;
      audio.tick(n);
      haptics.tap('light');
    }
    const rot = this.phase === 'capture' && n < 3 ? Math.sin((wobT % 0.55) / 0.55 * Math.PI * 2) * 0.25 : 0;
    const popping = this.phase === 'capture' && !b.ok && wobT > 0.55 * 2.2;
    if (this.phase === 'capture' && ((b.ok && wobT > 0.55 * 3) || popping)) {
      this.phase = 'after';
      setTimeout(() => this.captureDone(), b.ok ? 150 : 50);
    }
    const R = size * 0.42 * grow;
    c.save();
    c.rotate(rot);
    const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(0.7, 'rgba(180,220,255,0.18)');
    g.addColorStop(1, 'rgba(255,140,230,0.45)');
    c.fillStyle = g;
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(0, 0, Math.max(1, R), 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath();
    c.ellipse(-R * 0.4, -R * 0.45, R * 0.18, R * 0.09, -0.6, 0, Math.PI * 2);
    c.fill();
    if (this.phase === 'result') {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + this.t;
        c.fillStyle = `hsl(${i * 36},95%,70%)`;
        c.beginPath();
        c.arc(Math.cos(a) * R * 1.25, Math.sin(a) * R * 1.25, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  private drawScene(c: CanvasRenderingContext2D, W: number, H: number): void {
    const col = EL_COLOR[this.g.element];
    const night = dayPart() === 'noite';
    const sky = c.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, night ? '#140838' : '#5a3fd0');
    sky.addColorStop(0.55, night ? '#2a1366' : '#9a7bff');
    sky.addColorStop(1, '#2a1366');
    c.fillStyle = sky;
    c.fillRect(0, 0, W, H);
    // brilho do elemento
    const gl = c.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, Math.max(W, H) * 0.6);
    gl.addColorStop(0, col + '88');
    gl.addColorStop(1, col + '00');
    c.fillStyle = gl;
    c.fillRect(0, 0, W, H);
    // morros
    c.fillStyle = night ? '#1f4c44' : '#7fcf7c';
    c.beginPath();
    c.moveTo(0, H * 0.6);
    for (let x = 0; x <= W; x += 20) c.lineTo(x, H * 0.58 + Math.sin(x / 70 + 1) * 14);
    c.lineTo(W, H);
    c.lineTo(0, H);
    c.fill();
    c.fillStyle = night ? '#24584e' : '#8fdc8a';
    c.beginPath();
    c.ellipse(W / 2, H * (this.phase === 'meet' ? 0.6 : 0.62), W * 0.42, H * 0.06, 0, 0, Math.PI * 2);
    c.fill();
    if (night) {
      c.fillStyle = '#fff';
      for (let i = 0; i < 30; i++) {
        const sx = ((i * 97) % 100) / 100 * W;
        const sy = ((i * 53) % 100) / 100 * H * 0.5;
        c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(this.t * 1.5 + i));
        c.fillRect(sx, sy, 2, 2);
      }
      c.globalAlpha = 1;
    }
  }

  pause(): void {
    this.paused = true;
    this.ar?.stop();
    if (this.video) this.video.srcObject = null;
  }
  resume(): void {
    this.paused = false;
    if (this.arOn && this.video && this.ar) void this.ar.start(this.video);
  }
  private close(): void {
    this.destroy();
    this.onClose();
  }
  destroy(): void {
    this.ar?.stop();
    this.ar = null;
    this.btns.forEach((b) => b.destroy());
    this.el.remove();
  }
}

export { CacaGame, monById };
