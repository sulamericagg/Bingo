/**
 * CAÇA BLOOP — modo de caça por localização (jogo original do Bloop World).
 * Telas: segurança (1ª vez) → escolha GPS / modo casa → inicial → mapa → encontro → batalha → captura;
 * Bloopdex (famílias, meus bichinhos, equipe, ovos) e ajustes/privacidade.
 */
import './caca.css';
import type { MiniGameHandle } from '../hub/registry';
import { reportRun } from '../hub/registry';
import { t, fmt } from '../i18n';
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
import { distM, geohashEncode, metersPerPx, project } from './geo';
import { Locator, SpeedLock, type Fix, type LocError } from './location';
import { spawnsAround, homeSpawns, homeOrigin, windowOf, weatherAt, dayPart, CELL_PRECISION, type Spawn } from './spawns';
import { ProceduralTileProvider, themeForHour, WZ, type TileProvider } from './world';
import { cacaSave, persistCaca, addMon, teamMons, toggleTeam, releaseMon, giveXp, canEvolve, evolve, markDone, markSeen, bumpStreak, streakAlive, addEgg, walkEggs, starterSeeds, xpNeed, monById, EVO_LVL, type Mon } from './save';
import { makeMinigame, gameName, gameHelp, EL_GAMES, GAME_KINDS, type Minigame, type GameKind } from './minigames';
import { WebArLite, type ArProvider } from './ar';
import { elName, rarName, shapeName, matName, patName, weatherName } from './text';
import { seedFrom } from './rng';

const REACH_GPS = 40;
const REACH_HOME = 160;
const SCALE = 1.6; // px CSS por pixel do mundo (zoom 17)

/** Provedor de tiles: troque aqui (ou via setTileProvider) quando houver um serviço comercial configurado. */
let tileFactory: () => TileProvider = () => new ProceduralTileProvider();
export function setTileProvider(f: () => TileProvider): void {
  tileFactory = f;
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
  private tiles: TileProvider = tileFactory();
  private locator: Locator | null = null;
  private lock = new SpeedLock();
  private fix: Fix | null = null;
  private lastWalk: Fix | null = null;
  private target: [number, number] | null = null; // mundo px
  private view: [number, number] | null = null;
  private heading = 0;
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
    this.cv.addEventListener('pointerdown', (e) => this.onMapTap(e));
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
    this.el.append(top, this.banner, this.hint, bot);
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
    this.view = null;
    this.spawnKey = '';
    if (this.sv.locMode === 'casa') {
      const [lat, lon] = homeOrigin(this.sv.homeSeed);
      this.fix = { lat, lon, acc: 5, speed: 0, heading: null, t: Date.now() };
      this.target = project(lat, lon, WZ);
      this.setBanner('');
    } else {
      this.gpsWait = performance.now();
      this.setBanner(t('caca.gps.wait', 'Procurando o GPS… vá para um lugar aberto.'), true);
      this.locator = new Locator(
        (f) => this.onFix(f),
        (e) => this.onLocError(e),
      );
      void this.locator.start();
    }
    this.refreshSpawns(true);
  }

  private onFix(f: Fix): void {
    if (this.dead) return;
    const locked = this.lock.update(f);
    const prev = this.lastWalk;
    if (!prev) this.lastWalk = f;
    else {
      const d = distM(prev.lat, prev.lon, f.lat, f.lon);
      if (f.acc < 40 && !locked && d >= 5) {
        if (d < 80 && f.speed < 7) this.walked(d / 1000);
        this.lastWalk = f;
      }
    }
    this.fix = f;
    this.target = project(f.lat, f.lon, WZ);
    if (f.heading !== null && f.speed > 0.6) this.heading = f.heading;
    this.setBanner(locked ? t('caca.vehicle', 'Parece que você está num veículo. As aparições estão pausadas — não jogue dirigindo!') : '');
    this.refreshSpawns();
  }
  private onLocError(e: LocError): void {
    if (this.dead) return;
    if (e === 'timeout' && this.fix) return;
    this.setBanner(
      e === 'denied'
        ? t('caca.gps.denied', 'Sem permissão de localização. Você pode jogar no modo casa (Ajustes).')
        : t('caca.gps.off', 'Não deu para achar o GPS agora. Tente ao ar livre ou use o modo casa.'),
      true,
      {
        label: t('caca.mode.home', 'Modo casa'),
        fn: () => {
          this.sv.locMode = 'casa';
          persistCaca();
          this.startMap();
        },
      },
    );
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
    const key = this.sv.locMode === 'casa' ? 'casa:' + windowOf(now) : geohashEncode(this.fix.lat, this.fix.lon, CELL_PRECISION) + ':' + windowOf(now);
    if (!force && key === this.spawnKey) return;
    this.spawnKey = key;
    const list = this.sv.locMode === 'casa' ? homeSpawns(this.sv.homeSeed, now) : spawnsAround(this.fix.lat, this.fix.lon, now);
    const done = new Set(this.sv.done);
    this.spawns = list.filter((s) => !done.has(s.id));
    const w = weatherAt(this.fix.lat, this.fix.lon, now);
    const part = dayPart();
    const pn = part === 'noite' ? t('caca.part.noite', 'Noite') : part === 'manha' ? t('caca.part.manha', 'Manhã') : t('caca.part.tarde', 'Tarde');
    const mode = this.sv.locMode === 'casa' ? t('caca.mode.homeShort', 'Modo casa') : 'GPS';
    this.subtitle.textContent = `${mode} · ${pn} · ${weatherName(w)}`;
  }

  private reach(): number {
    return this.sv.locMode === 'casa' ? REACH_HOME : REACH_GPS;
  }
  private distTo(s: Spawn): number {
    if (!this.fix) return 1e9;
    return distM(this.fix.lat, this.fix.lon, s.lat, s.lon);
  }
  private screenOf(s: Spawn): [number, number] {
    const [x, y] = project(s.lat, s.lon, WZ);
    const v = this.view ?? this.target ?? [x, y];
    return [this.w / 2 + (x - v[0]) * SCALE, this.h * 0.56 + (y - v[1]) * SCALE];
  }

  private onMapTap(e: PointerEvent): void {
    if (!this.mapOn || this.overlay || this.enc) return;
    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    let best: Spawn | null = null;
    let bd = 44;
    for (const s of this.spawns) {
      const [sx, sy] = this.screenOf(s);
      const d = Math.hypot(sx - x, sy - 14 - y);
      if (d < bd) (bd = d), (best = s);
    }
    if (best) this.trySpawn(best);
  }
  private trySpawn(s: Spawn): boolean {
    if (this.lock.locked) {
      notify(t('caca.vehicleShort', 'Pausado: parece que você está num veículo.'), { kind: 'warn', icon: 'car' });
      return false;
    }
    const d = this.distTo(s);
    if (d > this.reach()) {
      notify(t('caca.tooFar', 'Chegue mais perto: faltam {m} m', { m: Math.round(d - this.reach()) }), { icon: 'target' });
      haptics.tap('light');
      return false;
    }
    this.openEncounter(s);
    return true;
  }

  /* ============================== laço e desenho ============================== */
  private resize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
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
    if (!this.mapOn || this.overlay) return;
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) {
      this.refreshSpawns();
      const now2 = Date.now();
      this.spawns = this.spawns.filter((s) => s.until > now2);
      if (this.sv.locMode === 'gps' && !this.fix && performance.now() - this.gpsWait > 25000) this.onLocError('unavailable');
    }
    this.drawMap(dt);
  }

  private drawMap(dt: number): void {
    const c = this.cx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const W = this.w;
    const Hh = this.h;
    const th = themeForHour(new Date().getHours());
    c.fillStyle = th.ground;
    c.fillRect(0, 0, W, Hh);
    if (!this.target) {
      this.drawNoFix(c);
      return;
    }
    if (!this.view) this.view = [this.target[0], this.target[1]];
    const k = 1 - Math.exp(-dt * 3);
    this.view[0] += (this.target[0] - this.view[0]) * k;
    this.view[1] += (this.target[1] - this.view[1]) * k;
    const [vx, vy] = this.view;
    const ox = W / 2;
    const oy = Hh * 0.56;
    // tiles
    const z = this.tiles.zoom;
    const f = 2 ** (z - WZ);
    const ts = 256 * SCALE / f;
    const px = Math.min(768, Math.round(ts * this.dpr));
    const x0 = Math.floor(((vx - ox / SCALE) * f) / 256);
    const x1 = Math.floor(((vx + (W - ox) / SCALE) * f) / 256);
    const y0 = Math.floor(((vy - oy / SCALE) * f) / 256);
    const y1 = Math.floor(((vy + (Hh - oy) / SCALE) * f) / 256);
    const redraw = () => {};
    for (let ty = y0; ty <= y1; ty++)
      for (let tx = x0; tx <= x1; tx++) {
        const img = this.tiles.getTile(tx, ty, px, th, redraw);
        const sx = ox + ((tx * 256) / f - vx) * SCALE;
        const sy = oy + ((ty * 256) / f - vy) * SCALE;
        if (img) c.drawImage(img, Math.floor(sx), Math.floor(sy), Math.ceil(ts) + 1, Math.ceil(ts) + 1);
      }
    // névoa no topo (profundidade) + vinheta
    const fog = c.createLinearGradient(0, 0, 0, Hh * 0.35);
    fog.addColorStop(0, th.id === 'noite' ? 'rgba(14,8,40,0.85)' : 'rgba(120,90,200,0.55)');
    fog.addColorStop(1, 'rgba(120,90,200,0)');
    c.fillStyle = fog;
    c.fillRect(0, 0, W, Hh * 0.35);
    // alcance
    const lat = this.fix?.lat ?? 0;
    const mpp = metersPerPx(lat, WZ);
    const pr = this.target ? [ox + (this.target[0] - vx) * SCALE, oy + (this.target[1] - vy) * SCALE] : [ox, oy];
    const reachPx = Math.min(Math.max(W, Hh), (this.reach() / mpp) * SCALE);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.75)';
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.lineWidth = 2.5;
    c.setLineDash([10, 8]);
    c.lineDashOffset = -this.time * 12;
    c.beginPath();
    c.arc(pr[0], pr[1], reachPx, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.restore();
    if (this.fix && this.sv.locMode === 'gps' && this.fix.acc > this.reach()) {
      c.fillStyle = 'rgba(80,160,255,0.12)';
      c.beginPath();
      c.arc(pr[0], pr[1], Math.min(W, (this.fix.acc / mpp) * SCALE), 0, Math.PI * 2);
      c.fill();
    }
    // aparições
    const locked = this.lock.locked;
    const list = [...this.spawns].sort((a, b) => a.lat === b.lat ? 0 : b.lat - a.lat);
    let near = 0;
    for (const s of list) {
      const [sx, sy] = this.screenOf(s);
      if (sx < -60 || sx > W + 60 || sy < -60 || sy > Hh + 80) continue;
      const inReach = this.distTo(s) <= this.reach();
      if (inReach) near++;
      c.save();
      c.translate(sx, sy);
      c.globalAlpha = locked ? 0.25 : 1;
      const R = s.g.rarity;
      if (R >= 2) {
        const [a] = RARITY_COL[R];
        c.fillStyle = a + '66';
        c.beginPath();
        c.ellipse(0, 6, 26 + Math.sin(this.time * 3) * 3, 9, 0, 0, Math.PI * 2);
        c.fill();
      }
      if (inReach && !locked) {
        c.strokeStyle = '#fff';
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(0, 6, 30 + Math.sin(this.time * 5) * 3, 11, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.translate(0, -16);
      const sz = 66 * (0.92 + R * 0.04) * Math.min(1, fitScale(s.g, 40) * 1.1);
      drawGenome(c, s.g, sz, this.time);
      c.restore();
    }
    // jogador
    this.drawPlayer(c, pr[0], pr[1]);
    c.globalAlpha = 1;
    // dica
    const hint = locked ? '' : !this.spawns.length ? t('caca.hint.none', 'Nenhum bichinho por aqui agora — eles mudam a cada 15 min.') : near ? t('caca.hint.tap', 'Toque num bichinho dentro do círculo!') : t('caca.hint.walk', 'Ande até um bichinho para ele entrar no círculo.');
    if (this.hint.textContent !== hint) this.hint.textContent = hint;
    this.hint.style.display = hint ? '' : 'none';
  }

  private drawPlayer(c: CanvasRenderingContext2D, x: number, y: number): void {
    const t0 = this.time;
    c.save();
    c.translate(x, y);
    // cone de direção
    if (this.sv.locMode === 'gps') {
      c.rotate((this.heading * Math.PI) / 180);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 60);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 60, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
      c.closePath();
      c.fill();
      c.rotate((-this.heading * Math.PI) / 180);
    }
    c.fillStyle = 'rgba(20,6,50,0.25)';
    c.beginPath();
    c.ellipse(0, 4, 18, 6, 0, 0, Math.PI * 2);
    c.fill();
    const bob = Math.abs(Math.sin(t0 * 4)) * -3;
    c.translate(0, -14 + bob);
    c.lineWidth = 3;
    c.strokeStyle = '#2a0b5c';
    const g = c.createLinearGradient(0, -16, 0, 16);
    g.addColorStop(0, '#d2a8ff');
    g.addColorStop(1, '#8a4fff');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, 17, 16, 0, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#2a0b5c';
    c.beginPath();
    c.ellipse(-6, -2, 2.6, 3.4, 0, 0, Math.PI * 2);
    c.ellipse(6, -2, 2.6, 3.4, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    c.ellipse(-8, -9, 4, 2.4, -0.5, 0, Math.PI * 2);
    c.fill();
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
    this.drawPlayer(c, W / 2, Hh * 0.5 + 14);
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
      <div class="cc-card"><h3>${esc(t('caca.privacy.h', 'Sua localização fica no aparelho'))}</h3><p>${esc(t('caca.privacy.p1', 'O GPS é usado só com o jogo aberto, para mostrar o mapa e calcular as aparições aqui mesmo no aparelho. Nada é enviado, salvo ou compartilhado — nem com a gente.'))}</p></div>`,
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
    if (this.mapOn && this.sv.locMode === 'gps') {
      this.locator?.stop();
      this.locator = new Locator(
        (f) => this.onFix(f),
        (e) => this.onLocError(e),
      );
      void this.locator.start();
    }
    this.enc?.resume();
  }
  destroy(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.locator?.stop();
    this.enc?.destroy();
    this.tiles.dispose();
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
