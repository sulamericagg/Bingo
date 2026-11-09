/* ============================================================
 *  RALLY LUNAR — jogo principal (carregado sob demanda pelo hub)
 *  Estados: garagem → corrida → resultado. Física em passo fixo (120 Hz),
 *  desenho limitado pelo nível de qualidade.
 * ============================================================ */
import './rally.css';
import { t, fmt } from '../../i18n';
import { icon } from '../../ui/icons';
import { audio } from '../../core/audio';
import { tap, success } from '../../core/haptics';
import { addCoins } from '../../core/economy';
import { bus } from '../../core/events';
import { persist, save } from '../../core/storage';
import { FpsLimiter, loadMode, QualityGovernor, type QualitySettings } from '../../core/quality';
import { skinById, type Skin } from '../../game/skins';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { showRewarded } from '../../services/ads';
import {
  addVehicleAd,
  buyUpgrade,
  buyVehicle,
  effectiveStats,
  MAX_UP,
  owns,
  rallySave,
  selectVehicle,
  trackSeed,
  upCost,
  upgradeName,
  upLevel,
  UPGRADE_KEYS,
  vehicleById,
  vehicleDesc,
  vehicleName,
  VEHICLES,
  zoneIndexAt,
  zoneName,
  ZONES,
  ZONE_LEN,
  type UpgradeKey,
} from './data';
import { Car, DT, type Input } from './physics';
import { Terrain, CHUNK_LEN } from './terrain';
import { coinSprite, drawBackdrop, drawCar, emoteSprite, EMOTES, fuelSprite, INK, type CarPose } from './draw';
import { Lobby, type RemotePeer } from './net';
import { gameFont } from '../../i18n/font';

type State = 'garage' | 'play' | 'over' | 'results';

interface Item {
  x: number;
  y: number;
  kind: 0 | 1; // 0 moeda, 1 combustível
  on: boolean;
}

interface Popup {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
  big: boolean;
}

const MAX_ITEMS = 80;
const MAX_DUST = 60;

export async function launchRally(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new RallyGame(root, exit);
  return {
    destroy: () => g.destroy(),
    pause: () => g.pause(),
    resume: () => g.resume(),
  };
}

class RallyGame {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private S = 30;
  private raf = 0;
  private last = -1;
  private acc = 0;
  private limiter = new FpsLimiter(60);
  private quality: QualityGovernor;
  private q: QualitySettings;
  private state: State = 'garage';
  private paused = false;
  private destroyed = false;
  private offs: (() => void)[] = [];

  private seed = trackSeed();
  private terrain = new Terrain(this.seed);
  private car!: Car;
  private skin: Skin;
  private inp: Input = { gas: false, brake: false };
  private keys = { gas: false, brake: false };
  private ptrs = new Map<number, 'gas' | 'brake'>();
  private lobby: Lobby;

  // corrida
  private time = 0;
  private runT = 0;
  private fuel = 1;
  private fuelMax = 1;
  private coins = 0;
  private flips = 0;
  private bestAir = 0;
  private startX = 4;
  private dist = 0;
  private distInt = -1;
  private distStr = '0 m';
  private coinInt = -1;
  private coinStr = '0';
  private safeT = 0;
  private safeB = 0;
  private emptyT = 0;
  private endReason: 'crash' | 'fuel' = 'fuel';
  private oopsT = 0;
  private lastZone = -1;
  private nextFuelX = 140;
  private nextCoinX = 30;
  private items: Item[] = [];
  private popups: Popup[] = [];
  private myEmote = '';
  private myEmoteT = 0;
  private newBest = false;
  private mood: 'idle' | 'happy' | 'fly' = 'idle';
  private moodT = 0;

  // câmera
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private bgZone = 0;
  private bgPrev = -1;
  private bgFade = 0;

  // poeira (pool)
  private dx = new Float32Array(MAX_DUST);
  private dy = new Float32Array(MAX_DUST);
  private dvx = new Float32Array(MAX_DUST);
  private dvy = new Float32Array(MAX_DUST);
  private dl = new Float32Array(MAX_DUST);
  private dHead = 0;
  private dustAcc = 0;

  // sprites
  private sCoin = coinSprite(64);
  private sFuel = fuelSprite(64);
  private sEmote = new Map<string, HTMLCanvasElement>();
  private pose: CarPose = { w0x: 0, w0y: 0, w1x: 0, w1y: 0, spin0: 0, spin1: 0, gas: false, t: 0, mood: 'idle' };
  private peerSkins = new Map<string, Skin>();

  // DOM
  private garageEl!: HTMLDivElement;
  private hudEl!: HTMLDivElement;
  private resultsEl!: HTMLDivElement;
  private pauseEl!: HTMLDivElement;
  private toastsEl!: HTMLDivElement;
  private trayEl!: HTMLDivElement;
  private garageIdx = 0;
  private resultCoins = 0;
  private doubled = false;

  constructor(
    private root: HTMLElement,
    private exitFn: () => void,
  ) {
    this.skin = skinById(save.skin === 'custom' ? 'custom' : save.skin);
    this.quality = new QualityGovernor({ mode: loadMode(), persist: false, emit: false, onChange: (_t, s) => this.applyQuality(s) });
    this.q = this.quality.settings;
    this.limiter.cap = this.q.fpsCap;
    for (const e of EMOTES) this.sEmote.set(e, emoteSprite(e, 80));
    for (let i = 0; i < MAX_ITEMS; i++) this.items.push({ x: 0, y: 0, kind: 0, on: false });

    this.el = document.createElement('div');
    this.el.className = 'rl-root';
    this.cv = document.createElement('canvas');
    this.cv.className = 'rl-cv';
    this.el.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
    root.appendChild(this.el);

    this.lobby = new Lobby(this.terrain);
    this.lobby.onJoin = (p) => this.peerJoined(p);
    this.lobby.onLeave = (p) => this.toast(t('rally.peer.left', '{name} saiu da corrida', { name: p.name }), false);
    void this.lobby.start(this.seed);

    this.buildDom();
    this.resize();
    const r = rallySave();
    this.garageIdx = Math.max(0, VEHICLES.findIndex((v) => v.id === r.sel));
    this.makeCar(r.sel);
    this.showGarage();

    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    const onKey = (e: KeyboardEvent) => this.key(e, e.type === 'keydown');
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    this.offs.push(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    });
    const onVis = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', onVis);
    this.offs.push(() => document.removeEventListener('visibilitychange', onVis));
    this.offs.push(bus.on('wallet', () => this.refreshWallet()));
    this.bindPointers();

    if (/[?&]debug\b/.test(location.search)) (window as unknown as { __rally: RallyGame }).__rally = this;
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ------------------------------ setup ------------------------------ */

  private applyQuality(s: QualitySettings): void {
    this.q = s;
    this.limiter.cap = s.fpsCap;
    this.resize();
  }

  private resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.w = w;
    this.h = h;
    this.cv.width = Math.round(w * this.dpr);
    this.cv.height = Math.round(h * this.dpr);
    this.cv.style.width = w + 'px';
    this.cv.style.height = h + 'px';
    this.S = Math.min(w / 11, h / 9);
    // áreas seguras lidas uma vez (nada de getComputedStyle por frame)
    const cs = getComputedStyle(this.el);
    this.safeT = parseFloat(cs.paddingTop) || 0;
    this.safeB = parseFloat(cs.paddingBottom) || 0;
  }

  private makeCar(id: string): void {
    const def = vehicleById(id);
    this.car = new Car(def, effectiveStats(id));
    this.car.place(this.startX, this.terrain);
    this.camX = this.car.x;
    this.camY = this.car.y;
  }

  /* ------------------------------ DOM ------------------------------ */

  private buildDom(): void {
    const el = this.el;
    // HUD
    this.hudEl = document.createElement('div');
    this.hudEl.className = 'rl-hud';
    this.hudEl.innerHTML = `
      <button class="rl-ibtn rl-pause" aria-label="${t('rally.pause', 'Pausar')}">${icon('pause', { size: 26 })}</button>
      <button class="rl-ibtn rl-emote-btn" aria-label="${t('rally.emotes', 'Recadinhos')}"></button>
      <div class="rl-tray"></div>`;
    const emBtn = this.hudEl.querySelector<HTMLButtonElement>('.rl-emote-btn')!;
    emBtn.appendChild(this.emoteImg('joinha', 30));
    this.trayEl = this.hudEl.querySelector<HTMLDivElement>('.rl-tray')!;
    for (const e of EMOTES) {
      const b = document.createElement('button');
      b.className = 'rl-ibtn';
      b.appendChild(this.emoteImg(e, 34));
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.sendEmote(e);
        this.trayEl.classList.remove('on');
      });
      this.trayEl.appendChild(b);
    }
    emBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      audio.click();
      this.trayEl.classList.toggle('on');
    });
    this.hudEl.querySelector('.rl-pause')!.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.pause();
    });
    for (const b of this.hudEl.querySelectorAll('button')) b.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.appendChild(this.hudEl);

    this.toastsEl = document.createElement('div');
    this.toastsEl.className = 'rl-toasts';
    el.appendChild(this.toastsEl);

    this.garageEl = document.createElement('div');
    this.garageEl.className = 'rl-screen rl-garage';
    el.appendChild(this.garageEl);

    this.resultsEl = document.createElement('div');
    this.resultsEl.className = 'rl-screen rl-results';
    el.appendChild(this.resultsEl);

    this.pauseEl = document.createElement('div');
    this.pauseEl.className = 'rl-screen rl-pausescr';
    this.pauseEl.innerHTML = `<div class="rl-card">
      <h2>${t('rally.paused', 'Pausa')}</h2>
      <button class="rl-btn rl-go" data-a="resume">${icon('play', { size: 26 })}<span>${t('rally.resume', 'Continuar')}</span></button>
      <button class="rl-btn rl-alt" data-a="garage">${icon('gear', { size: 24 })}<span>${t('rally.toGarage', 'Garagem')}</span></button>
      <button class="rl-btn rl-alt" data-a="exit">${icon('home', { size: 24 })}<span>${t('rally.exit', 'Sair')}</span></button></div>`;
    this.pauseEl.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      audio.click();
      if (a === 'resume') this.resume();
      else if (a === 'garage') {
        this.pauseEl.classList.remove('on');
        this.paused = false;
        this.showGarage();
      } else if (a === 'exit') this.exit();
    });
    el.appendChild(this.pauseEl);
  }

  private emoteImg(code: string, size: number): HTMLImageElement {
    const img = new Image();
    img.src = this.sEmote.get(code)!.toDataURL();
    img.width = img.height = size;
    img.alt = '';
    img.draggable = false;
    return img;
  }

  private toast(text: string, visitor: boolean, iconName: 'user' | 'planet' | 'trophy' = 'user'): void {
    const d = document.createElement('div');
    d.className = 'rl-toast';
    d.innerHTML = `${icon(iconName, { size: 26 })}<span></span>${visitor ? `<em>${t('rally.visitor', 'visitante')}</em>` : ''}`;
    d.querySelector('span')!.textContent = text;
    this.toastsEl.appendChild(d);
    setTimeout(() => d.remove(), 3200);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstElementChild!.remove();
  }

  private peerJoined(p: RemotePeer): void {
    this.toast(t('rally.peer.joined', '{name} entrou na sua corrida!', { name: p.name }), p.bot);
    audio.click();
  }

  private sendEmote(code: string): void {
    this.myEmote = code;
    this.myEmoteT = 2.6;
    this.lobby.emote(code);
    audio.click();
  }

  /* ------------------------------ garagem ------------------------------ */

  private showGarage(): void {
    this.state = 'garage';
    this.resultsEl.classList.remove('on');
    this.hudEl.classList.remove('on');
    this.garageEl.classList.add('on');
    const r = rallySave();
    this.makeCar(owns(VEHICLES[this.garageIdx].id) ? VEHICLES[this.garageIdx].id : r.sel);
    this.makeCar(VEHICLES[this.garageIdx].id);
    this.renderGarage();
  }

  private refreshWallet(): void {
    if (this.state === 'garage') this.renderGarage();
  }

  private renderGarage(): void {
    const v = VEHICLES[this.garageIdx];
    const r = rallySave();
    const have = owns(v.id);
    const rows = UPGRADE_KEYS.map((k) => {
      const lv = upLevel(v.id, k);
      const c = upCost(v.id, k);
      let pips = '';
      for (let i = 0; i < MAX_UP; i++) pips += `<b class="${i < lv ? 'on' : ''}"></b>`;
      const btn = !have
        ? ''
        : c === null
          ? `<span class="rl-max">${t('rally.max', 'MÁX')}</span>`
          : `<button class="rl-up ${save.coins >= c ? '' : 'poor'}" data-up="${k}">${icon('coin', { size: 18 })}${fmt(c)}</button>`;
      return `<div class="rl-row"><span class="rl-lbl">${upIcon(k)}${upgradeName(k)}</span><span class="rl-pips">${pips}</span>${btn}</div>`;
    }).join('');
    let action: string;
    if (have) {
      action = `<button class="rl-btn rl-go rl-big" data-a="play">${icon('play', { size: 30 })}<span>${t('rally.go', 'Acelerar!')}</span></button>`;
    } else if (v.price.ads) {
      const n = r.ads[v.id] ?? 0;
      action = `<button class="rl-btn rl-ad rl-big" data-a="ad">${icon('video', { size: 28 })}<span>${t('rally.watchUnlock', 'Ver vídeo {n}/{m}', { n, m: v.price.ads })}</span></button>`;
    } else if (v.price.gems) {
      action = `<button class="rl-btn rl-gem rl-big" data-a="buy">${icon('gem', { size: 26 })}<span>${fmt(v.price.gems)}</span></button>`;
    } else {
      action = `<button class="rl-btn rl-buy rl-big" data-a="buy">${icon('coin', { size: 26 })}<span>${fmt(v.price.coins ?? 0)}</span></button>`;
    }
    const dots = VEHICLES.map((_v, i) => `<b class="${i === this.garageIdx ? 'on' : ''}"></b>`).join('');
    this.garageEl.innerHTML = `
      <div class="rl-top">
        <button class="rl-ibtn" data-a="exit" aria-label="${t('rally.exit', 'Sair')}">${icon('home', { size: 26 })}</button>
        <div class="rl-title">${t('rally.title', 'Rally Lunar')}<small>${t('rally.daily', 'Pista do dia')}</small></div>
        <div class="rl-wallet"><span>${icon('coin', { size: 20 })}${fmt(save.coins)}</span><span>${icon('gem', { size: 20 })}${fmt(save.gems)}</span></div>
      </div>
      <div class="rl-best">${icon('trophy', { size: 22 })}<span>${t('rally.best', 'Recorde: {n} m', { n: fmt(r.best) })}</span></div>
      <div class="rl-panel">
        <div class="rl-carsel">
          <button class="rl-ibtn rl-arrow" data-a="prev" aria-label="${t('rally.prev', 'Anterior')}">${icon('arrow-up', { size: 24 })}</button>
          <div class="rl-carname"><h3>${vehicleName(v.id)}${have ? '' : icon('lock', { size: 20 })}</h3><p>${vehicleDesc(v.id)}</p><div class="rl-dots">${dots}</div></div>
          <button class="rl-ibtn rl-arrow rl-next" data-a="next" aria-label="${t('rally.next', 'Próximo')}">${icon('arrow-up', { size: 24 })}</button>
        </div>
        <div class="rl-ups ${have ? '' : 'locked'}">${rows}</div>
        ${action}
      </div>`;
    this.garageEl.onclick = (e) => this.garageClick(e);
  }

  private async garageClick(e: MouseEvent): Promise<void> {
    const tgt = e.target as HTMLElement;
    const up = tgt.closest<HTMLElement>('[data-up]')?.dataset.up as UpgradeKey | undefined;
    const v = VEHICLES[this.garageIdx];
    if (up) {
      if (buyUpgrade(v.id, up)) {
        audio.cash();
        success();
        this.car.st = effectiveStats(v.id);
      } else audio.hit();
      this.renderGarage();
      return;
    }
    const a = tgt.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    audio.click();
    if (a === 'exit') this.exit();
    else if (a === 'prev' || a === 'next') {
      this.garageIdx = (this.garageIdx + (a === 'next' ? 1 : VEHICLES.length - 1)) % VEHICLES.length;
      const nv = VEHICLES[this.garageIdx];
      if (owns(nv.id)) selectVehicle(nv.id);
      this.makeCar(nv.id);
      this.renderGarage();
    } else if (a === 'buy') {
      if (buyVehicle(v.id)) {
        audio.unlock2();
        success();
        this.makeCar(v.id);
      } else audio.hit();
      this.renderGarage();
    } else if (a === 'ad') {
      const ok = await showRewarded();
      if (ok && addVehicleAd(v.id)) {
        audio.unlock2();
        this.makeCar(v.id);
      }
      this.renderGarage();
    } else if (a === 'play') {
      selectVehicle(v.id);
      this.startRun();
    }
  }

  /* ------------------------------ corrida ------------------------------ */

  private startRun(): void {
    const id = rallySave().sel;
    this.makeCar(id);
    this.state = 'play';
    this.garageEl.classList.remove('on');
    this.resultsEl.classList.remove('on');
    this.hudEl.classList.add('on');
    this.trayEl.classList.remove('on');
    this.fuelMax = this.car.st.fuel;
    this.fuel = this.fuelMax;
    this.coins = this.flips = this.bestAir = 0;
    this.dist = 0;
    this.distInt = -1;
    this.runT = 0;
    this.emptyT = this.oopsT = 0;
    this.lastZone = 0;
    this.nextFuelX = 130;
    this.nextCoinX = 26;
    this.newBest = false;
    this.doubled = false;
    for (const it of this.items) it.on = false;
    this.popups.length = 0;
    this.ptrs.clear();
    this.mood = 'idle';
    audio.unlock();
  }

  private spawnItems(): void {
    const ahead = this.car.x + 60;
    while (this.nextCoinX < ahead) {
      const n = 5 + Math.floor(Math.random() * 5);
      const arc = Math.random() < 0.35;
      for (let i = 0; i < n; i++) {
        const x = this.nextCoinX + i * 1.3;
        const yy = this.terrain.height(x) + 1.1 + (arc ? Math.sin((i / (n - 1)) * Math.PI) * 2.2 : 0);
        this.addItem(x, yy, 0);
      }
      this.nextCoinX += n * 1.3 + 14 + Math.random() * 30;
    }
    while (this.nextFuelX < ahead) {
      const x = this.nextFuelX;
      this.addItem(x, this.terrain.height(x) + 0.75, 1);
      const d = x - this.startX;
      this.nextFuelX += Math.min(380, 150 + d * 0.06) + Math.random() * 40;
    }
  }

  private addItem(x: number, y: number, kind: 0 | 1): void {
    let slot: Item | null = null;
    for (const it of this.items) {
      if (!it.on) {
        slot = it;
        break;
      }
      if (it.x < this.car.x - 30) {
        slot = it;
        break;
      }
    }
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.kind = kind;
    slot.on = true;
  }

  private popup(text: string, color: string, big = false): void {
    if (this.popups.length > 5) this.popups.shift();
    let row = 0;
    for (const p of this.popups) if (p.t < 1.2) row = Math.max(row, p.y + 1);
    this.popups.push({ text, x: 0, y: row, t: 0, color, big });
  }

  private step(): void {
    const car = this.car;
    const z = this.terrain.zone(car.x);
    const playing = this.state === 'play';
    const inp = this.inp;
    if (playing && !car.crashed) {
      inp.gas = this.keys.gas || this.hasPtr('gas');
      inp.brake = this.keys.brake || this.hasPtr('brake');
    } else {
      inp.gas = inp.brake = false;
    }
    const wasAir = car.airTime;
    const fuelOk = this.fuel > 0;
    car.step(inp, this.terrain, z.gravity, z.grip, fuelOk || !playing);
    if (!playing || car.crashed) return;

    // combustível
    this.fuel -= DT * (inp.gas ? 1 : 0.4);
    if (this.fuel < 0) this.fuel = 0;

    // pouso: manobras
    if (car.grounded && wasAir > 0) {
      const air = wasAir;
      const rot = car.airRot;
      car.airTime = 0;
      car.airRot = 0;
      if (car.roofTime <= 0 && !car.headHit) {
        const nflip = Math.floor(Math.abs(rot) / (Math.PI * 2) + 0.12);
        let bonus = 0;
        if (nflip > 0) {
          bonus += nflip * 10;
          this.flips += nflip;
          const txt = nflip === 1 ? t('rally.flip1', 'Cambalhota! +{n}', { n: 10 }) : nflip === 2 ? t('rally.flip2', 'Cambalhota dupla! +{n}', { n: 20 }) : t('rally.flipN', 'Cambalhota x{k}! +{n}', { k: nflip, n: nflip * 10 });
          this.popup(txt, '#ffd23f', true);
          success();
          audio.perfect(nflip);
          this.lobby.reactFlip();
          this.mood = 'happy';
          this.moodT = 1.5;
        }
        if (air > 1.6) {
          bonus += 5;
          this.popup(t('rally.air', 'Voo longo! +{n}', { n: 5 }), '#5ef0ff');
        }
        const rel = car.a - Math.atan(this.terrain.slope(car.x));
        if (air > 0.7 && Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel))) < 0.18) {
          bonus += 3;
          this.popup(t('rally.perfect', 'Pouso perfeito! +{n}', { n: 3 }), '#3ee07a');
        }
        if (air > this.bestAir) this.bestAir = air;
        this.coins += bonus;
        if (air > 0.5) {
          audio.land(0);
          tap('light');
          this.dustBurst(8);
        }
      }
    }

    // capotou
    if (car.roofTime > 0.3 || (car.headHit && Math.cos(car.a) < 0)) this.crash();
  }

  private hasPtr(k: 'gas' | 'brake'): boolean {
    for (const v of this.ptrs.values()) if (v === k) return true;
    return false;
  }

  private crash(): void {
    const car = this.car;
    car.crashed = true;
    this.endReason = 'crash';
    this.oopsT = 0.001;
    this.mood = 'fly';
    // pulinho engraçado: o carrinho quica e se desvira sozinho
    car.vy = 6;
    car.w = car.a > 0 ? -5 : 5;
    for (const wh of car.wheels) wh.vy = 6;
    audio.crack();
    tap('medium');
    this.dustBurst(14);
  }

  private update(dt: number, steps: number): void {
    this.time += dt;
    const car = this.car;
    if (this.state === 'play') {
      this.runT += dt;
      const d = Math.max(0, car.x - this.startX);
      if (d > this.dist) this.dist = d;
      const di = Math.floor(this.dist);
      if (di !== this.distInt) {
        this.distInt = di;
        this.distStr = fmt(di) + ' m';
      }
      this.spawnItems();
      // coleta
      for (const it of this.items) {
        if (!it.on) continue;
        const dx = it.x - car.x;
        if (dx < -4 || dx > 4) continue;
        const dy = it.y - (car.y + 0.4);
        if (dx * dx + dy * dy < (it.kind ? 2.2 : 1.6)) {
          it.on = false;
          if (it.kind === 0) {
            this.coins++;
            audio.coin(this.coins);
          } else {
            this.fuel = this.fuelMax;
            this.popup(t('rally.fuel', 'Tanque cheio!'), '#ff8a9e');
            audio.gem();
            tap('light');
          }
        }
      }
      // zona nova
      const zi = Math.floor(car.x / ZONE_LEN);
      if (zi > this.lastZone) {
        this.lastZone = zi;
        this.toast(zoneName(ZONES[zi % ZONES.length].id), false, 'planet');
      }
      // fim
      if (car.crashed) {
        this.oopsT += dt;
        if (this.oopsT > 1.7) this.finish();
      } else if (this.fuel <= 0) {
        this.emptyT += dt;
        if ((car.speed < 0.6 && this.emptyT > 1.2) || this.emptyT > 7) {
          this.endReason = 'fuel';
          this.finish();
        }
      }
      if (this.moodT > 0) {
        this.moodT -= dt;
        if (this.moodT <= 0 && !car.crashed) this.mood = 'idle';
      }
      // poeira
      if (car.wheelsOnGround > 0 && this.inp.gas && car.speed > 2) {
        this.dustAcc += dt * 30 * this.q.particleBudget;
        while (this.dustAcc > 1) {
          this.dustAcc--;
          const wh = car.wheels[0];
          this.emitDust(wh.x - 0.2, wh.y - wh.r * 0.6, -1 - Math.random() * 2, 0.5 + Math.random() * 1.5);
        }
      }
      this.lobby.send(dt, car.x, car.y, car.a, this.dist, VEHICLES.indexOf(car.def));
      if (this.myEmoteT > 0) this.myEmoteT -= dt;
    }
    this.lobby.update(dt, steps, car.x, car.speed, this.state === 'play');
    for (let i = 0; i < MAX_DUST; i++) {
      if (this.dl[i] <= 0) continue;
      this.dl[i] -= dt;
      this.dvy[i] -= 2 * dt;
      this.dx[i] += this.dvx[i] * dt;
      this.dy[i] += this.dvy[i] * dt;
    }
    for (const p of this.popups) p.t += dt;
    while (this.popups.length && this.popups[0].t > 1.6) this.popups.shift();

    // câmera
    const S = this.S;
    const lead = Math.max(-2, Math.min(5, car.vx * 0.3));
    const targetX = car.x + lead;
    const k = 1 - Math.exp(-dt * 4);
    this.camX += (targetX - this.camX) * k;
    this.camY += (car.y - this.camY) * (1 - Math.exp(-dt * 3));
    const zt = this.state === 'garage' ? 1.25 : 1 - Math.min(0.18, car.speed * 0.01);
    this.zoom += (zt - this.zoom) * (1 - Math.exp(-dt * 2));
    void S;
    const zi = zoneIndexAt(this.camX);
    if (zi !== this.bgZone) {
      this.bgPrev = this.bgZone;
      this.bgZone = zi;
      this.bgFade = 1;
    }
    if (this.bgFade > 0) this.bgFade = Math.max(0, this.bgFade - dt * 0.8);
    this.terrain.ensure(this.camX - this.w / (S * this.zoom) - 4, this.camX + (this.w / (S * this.zoom)) * 1.2 + CHUNK_LEN);
  }

  private emitDust(x: number, y: number, vx: number, vy: number): void {
    const i = this.dHead;
    this.dHead = (i + 1) % MAX_DUST;
    this.dx[i] = x;
    this.dy[i] = y;
    this.dvx[i] = vx;
    this.dvy[i] = vy;
    this.dl[i] = 0.6 + Math.random() * 0.4;
  }

  private dustBurst(n: number): void {
    const car = this.car;
    const m = Math.ceil(n * this.q.particleBudget);
    for (let i = 0; i < m; i++) this.emitDust(car.x + (Math.random() - 0.5) * 2, car.y - 0.5, (Math.random() - 0.5) * 5, 1 + Math.random() * 3);
  }

  private finish(): void {
    if (this.state !== 'play') return;
    this.state = 'results';
    this.hudEl.classList.remove('on');
    const r = rallySave();
    const dist = Math.floor(this.dist);
    this.newBest = dist > r.best;
    if (this.newBest) r.best = dist;
    r.runs++;
    r.totalDist += dist;
    persist();
    const distCoins = Math.floor(dist / 25);
    this.resultCoins = this.coins + distCoins;
    addCoins(this.resultCoins);
    reportRun({ game: 'rally', score: dist, coins: this.resultCoins, durationSec: Math.round(this.runT), stats: { distance: dist, flips: this.flips, airtime: Math.round(this.bestAir * 10) / 10 } });
    this.showResults(dist, distCoins);
  }

  private showResults(dist: number, distCoins: number): void {
    const r = rallySave();
    const title = this.endReason === 'crash' ? t('rally.oops', 'Ops! Capotou!') : t('rally.nofuel', 'Acabou o combustível!');
    this.resultsEl.innerHTML = `<div class="rl-card">
      <h2>${title}</h2>
      <div class="rl-dist"><b>${fmt(dist)}</b><span>m</span></div>
      ${this.newBest ? `<div class="rl-newbest">${icon('trophy', { size: 22 })}${t('rally.newBest', 'Novo recorde!')}</div>` : `<div class="rl-sub">${t('rally.best', 'Recorde: {n} m', { n: fmt(r.best) })}</div>`}
      <div class="rl-stats">
        <div>${icon('coin', { size: 20 })}<span>${t('rally.res.coins', 'Moedas coletadas')}</span><b>${fmt(this.coins)}</b></div>
        <div>${icon('target', { size: 20 })}<span>${t('rally.res.dist', 'Bônus de distância')}</span><b>${fmt(distCoins)}</b></div>
        <div>${icon('star', { size: 20 })}<span>${t('rally.res.flips', 'Cambalhotas')}</span><b>${fmt(this.flips)}</b></div>
      </div>
      <div class="rl-total">${icon('coins', { size: 30 })}<b class="rl-tc">+${fmt(this.resultCoins)}</b></div>
      ${this.resultCoins > 0 ? '' : '<!--'}<button class="rl-btn rl-ad" data-a="double">${icon('video', { size: 26 })}<span>${t('rally.double', 'Dobrar moedas')}</span></button>${this.resultCoins > 0 ? '' : '-->'}
      <div class="rl-two">
        <button class="rl-btn rl-go" data-a="again">${icon('refresh', { size: 24 })}<span>${t('rally.again', 'De novo')}</span></button>
        <button class="rl-btn rl-alt" data-a="garage">${icon('gear', { size: 24 })}<span>${t('rally.toGarage', 'Garagem')}</span></button>
      </div>
      <button class="rl-btn rl-alt rl-small" data-a="exit">${icon('home', { size: 22 })}<span>${t('rally.exit', 'Sair')}</span></button>
    </div>`;
    this.resultsEl.classList.add('on');
    this.resultsEl.onclick = async (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (!a) return;
      audio.click();
      if (a === 'again') this.startRun();
      else if (a === 'garage') this.showGarage();
      else if (a === 'exit') this.exit();
      else if (a === 'double' && !this.doubled) {
        const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button')!;
        btn.disabled = true;
        const ok = await showRewarded();
        if (ok) {
          this.doubled = true;
          addCoins(this.resultCoins);
          audio.cash();
          const tc = this.resultsEl.querySelector('.rl-tc');
          if (tc) tc.textContent = '+' + fmt(this.resultCoins * 2);
        } else btn.disabled = false;
      }
    };
  }

  /* ------------------------------ entrada ------------------------------ */

  private bindPointers(): void {
    const cv = this.cv;
    const down = (e: PointerEvent) => {
      if (this.state !== 'play' || this.paused) return;
      this.trayEl.classList.remove('on');
      this.ptrs.set(e.pointerId, e.clientX < this.w * 0.5 ? 'brake' : 'gas');
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      this.ptrs.delete(e.pointerId);
    };
    cv.addEventListener('pointerdown', down);
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private key(e: KeyboardEvent, down: boolean): void {
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowUp' || k === 'd' || k === 'w' || k === ' ') this.keys.gas = down;
    else if (k === 'ArrowLeft' || k === 'ArrowDown' || k === 'a' || k === 's') this.keys.brake = down;
    else if (k === 'Escape' && down && this.state === 'play') this.pause();
  }

  /* ------------------------------ laço ------------------------------ */

  private frame = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.limiter.shouldRender(now)) return;
    const frameMs = this.last < 0 ? 16.7 : now - this.last;
    this.last = now;
    if (this.paused) return;
    const t0 = performance.now();
    const dt = Math.min(0.05, frameMs / 1000);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 8) {
      this.step();
      this.acc -= DT;
      steps++;
    }
    if (steps === 8) this.acc = 0;
    this.update(dt, steps);
    this.render();
    this.quality.sample(frameMs, performance.now() - t0);
  };

  /* ------------------------------ desenho ------------------------------ */

  private render(): void {
    const x = this.ctx;
    const w = this.w;
    const h = this.h;
    const dpr = this.dpr;
    const S = this.S * this.zoom;
    const layers = this.q.starLayers;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const camX = this.camX;
    // fundo (com transição entre zonas)
    drawBackdrop(x, ZONES[this.bgZone], w, h, camX, S, this.time, layers);
    if (this.bgFade > 0 && this.bgPrev >= 0) {
      x.globalAlpha = this.bgFade;
      drawBackdrop(x, ZONES[this.bgPrev], w, h, camX, S, this.time, layers);
      x.globalAlpha = 1;
    }
    const ox = w * (this.state === 'garage' ? 0.5 : 0.34);
    const oy = h * (this.state === 'garage' ? 0.36 : 0.56);
    const camY = this.camY;
    // relevo
    x.setTransform(S * dpr, 0, 0, -S * dpr, (ox - camX * S) * dpr, (oy + camY * S) * dpr);
    x.lineJoin = 'round';
    x.lineCap = 'round';
    const left = camX - ox / S - 1;
    const right = camX + (w - ox) / S + 1;
    // em camadas (todas as bases, depois faixas, contorno e topo) para não marcar emendas
    for (let pass = 0; pass < 4; pass++) {
      if (pass === 1) x.translate(0, -1.0);
      if (pass === 2) x.translate(0, 1.0);
      for (const c of this.terrain.chunks.values()) {
        if (c.x0 > right || c.x0 + CHUNK_LEN < left || !c.fill) continue;
        const z = c.zone;
        if (pass === 0) {
          x.fillStyle = z.ground[1];
          x.fill(c.fill);
        } else if (pass === 1) {
          x.strokeStyle = z.ground[0];
          x.lineWidth = 2;
          x.stroke(c.edge!);
        } else if (pass === 2) {
          x.strokeStyle = INK;
          x.lineWidth = 0.5;
          x.stroke(c.edge!);
        } else {
          x.strokeStyle = z.top;
          x.lineWidth = 0.3;
          x.stroke(c.edge!);
        }
      }
    }
    x.setTransform(dpr, 0, 0, dpr, 0, 0);

    // itens
    const toSX = (wx: number) => ox + (wx - camX) * S;
    const toSY = (wy: number) => oy - (wy - camY) * S;
    if (this.state !== 'garage') {
      const cs = S * 0.75;
      const fs = S * 1.15;
      for (const it of this.items) {
        if (!it.on || it.x < left || it.x > right) continue;
        const sx = toSX(it.x);
        const sy = toSY(it.y) + Math.sin(this.time * 3 + it.x) * S * 0.08;
        if (it.kind === 0) {
          const sq = Math.abs(Math.cos(this.time * 3 + it.x * 0.7));
          x.drawImage(this.sCoin, sx - (cs * (0.3 + 0.7 * sq)) / 2, sy - cs / 2, cs * (0.3 + 0.7 * sq), cs);
        } else x.drawImage(this.sFuel, sx - fs / 2, sy - fs / 2, fs, fs);
      }
    }

    // visitantes
    for (const p of this.lobby.peers.values()) this.drawPeer(p, S, ox, oy, left, right);

    // poeira
    const zc = this.terrain.zone(this.car.x).top;
    x.fillStyle = zc;
    for (let i = 0; i < MAX_DUST; i++) {
      const l = this.dl[i];
      if (l <= 0) continue;
      x.globalAlpha = Math.min(1, l * 1.5) * 0.8;
      const r = (1.2 - l) * S * 0.35 + 2;
      x.beginPath();
      x.arc(toSX(this.dx[i]), toSY(this.dy[i]), r, 0, 6.283);
      x.fill();
    }
    x.globalAlpha = 1;

    // jogador
    this.drawCarAt(this.car, S, toSX(this.car.x), toSY(this.car.y), this.skin, this.mood, this.inp.gas);
    if (this.myEmoteT > 0 && this.myEmote) this.drawBubble(this.myEmote, toSX(this.car.x), toSY(this.car.y) - S * 2.1, 2.6 - this.myEmoteT, S);

    // textos flutuantes
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    for (const p of this.popups) {
      const a = p.t < 1.2 ? 1 : 1 - (p.t - 1.2) / 0.4;
      const pop = p.t < 0.15 ? p.t / 0.15 : 1;
      x.globalAlpha = Math.max(0, a);
      const sz = (p.big ? 30 : 22) * (0.6 + 0.4 * pop);
      x.font = gameFont(800, sz.toFixed(0));
      const sx = w / 2;
      const sy = h * 0.26 + p.y * 38 - p.t * 24;
      x.lineWidth = 6;
      x.strokeStyle = INK;
      x.strokeText(p.text, sx, sy);
      x.fillStyle = p.color;
      x.fillText(p.text, sx, sy);
    }
    x.globalAlpha = 1;

    if (this.state === 'play') this.drawHud(x, w, h);
    if (this.oopsT > 0 && this.state === 'play') {
      const k = Math.min(1, this.oopsT * 4);
      const s = 1 + Math.sin(this.oopsT * 12) * 0.08 * (1 - Math.min(1, this.oopsT));
      x.save();
      x.translate(w / 2, h * 0.3);
      x.scale(k * s, k * s);
      x.font = gameFont(900, 64);
      x.lineWidth = 12;
      x.strokeStyle = INK;
      const txt = t('rally.ops', 'Ops!');
      x.strokeText(txt, 0, 0);
      x.fillStyle = '#ffd23f';
      x.fillText(txt, 0, 0);
      x.restore();
    }
  }

  private drawCarAt(car: Car, S: number, sx: number, sy: number, skin: Skin | null, mood: 'idle' | 'happy' | 'fly', gas: boolean, x: CanvasRenderingContext2D = this.ctx): void {
    const p = this.pose;
    const c = Math.cos(car.a);
    const s = Math.sin(car.a);
    for (let i = 0; i < 2; i++) {
      const wh = car.wheels[i];
      const dx = wh.x - car.x;
      const dy = wh.y - car.y;
      // local (y para cima) → px (y para baixo)
      const lx = dx * c + dy * s;
      const ly = -dx * s + dy * c;
      if (i === 0) {
        p.w0x = lx * S;
        p.w0y = -ly * S;
        p.spin0 = wh.spin;
      } else {
        p.w1x = lx * S;
        p.w1y = -ly * S;
        p.spin1 = wh.spin;
      }
    }
    p.gas = gas;
    p.t = this.time;
    p.mood = mood;
    x.save();
    x.translate(sx, sy);
    x.rotate(-car.a);
    drawCar(x, car.def, S, p, skin);
    x.restore();
  }

  private ghostCv = document.createElement('canvas');
  private ghostX: CanvasRenderingContext2D | null = null;
  private ghostCtx(S: number): CanvasRenderingContext2D {
    const size = Math.ceil(S * 5.2 * this.dpr);
    if (this.ghostCv.width !== size) {
      this.ghostCv.width = this.ghostCv.height = size;
      this.ghostX = null;
    }
    if (!this.ghostX) this.ghostX = this.ghostCv.getContext('2d')!;
    return this.ghostX;
  }

  private peerSkin(id: string): Skin {
    let s = this.peerSkins.get(id);
    if (!s) {
      s = skinById(id);
      this.peerSkins.set(id, s);
    }
    return s;
  }

  private drawPeer(pr: RemotePeer, S: number, ox: number, oy: number, left: number, right: number): void {
    const x = this.ctx;
    const def = VEHICLES[pr.vehicle] ?? VEHICLES[0];
    const sx = ox + (pr.x - this.camX) * S;
    const sy = oy - (pr.y - this.camY) * S;
    const inView = pr.x > left - 2 && pr.x < right + 2 && sy > -S * 3 && sy < this.h + S * 2;
    if (inView) {
      // fantasma translúcido: desenha numa tela auxiliar reaproveitada e cola com alpha
      const gx = this.ghostCtx(S);
      const half = this.ghostCv.width / 2;
      gx.setTransform(1, 0, 0, 1, 0, 0);
      gx.clearRect(0, 0, this.ghostCv.width, this.ghostCv.height);
      gx.setTransform(this.dpr, 0, 0, this.dpr, half, half);
      if (pr.car) this.drawCarAt(pr.car, S, 0, 0, this.peerSkin(pr.skin), 'idle', pr.inp.gas, gx);
      else {
        const p = this.pose;
        const L = def.wheelBase * S;
        const yy = (this.car.rest + def.wheelR * 0.3) * S;
        p.w0x = -L;
        p.w1x = L;
        p.w0y = p.w1y = yy;
        p.spin0 = p.spin1 = pr.spin;
        p.gas = true;
        p.t = this.time;
        p.mood = 'idle';
        gx.rotate(-pr.a);
        drawCar(gx, def, S, p, this.peerSkin(pr.skin));
      }
      x.globalAlpha = 0.6;
      const hw = half / this.dpr;
      x.drawImage(this.ghostCv, sx - hw, sy - hw, hw * 2, hw * 2);
      x.globalAlpha = 1;
      // etiqueta com nome
      const ty = sy - S * 1.75;
      x.font = gameFont(700, 13);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      const tw = x.measureText(pr.name).width + 16;
      x.fillStyle = pr.bot ? 'rgba(42,11,92,.72)' : 'rgba(23,120,110,.85)';
      x.beginPath();
      x.roundRect(sx - tw / 2, ty - 10, tw, 20, 10);
      x.fill();
      x.fillStyle = '#fff';
      x.fillText(pr.name, sx, ty + 1);
      if (pr.emoteT > 0 && pr.emote) this.drawBubble(pr.emote, sx, ty - S * 0.9, 2.6 - pr.emoteT, S);
    } else {
      // seta na borda
      const right = pr.x > this.camX;
      const ex = right ? this.w - 26 : 26;
      const ey = Math.max(90, Math.min(this.h - 140, sy));
      x.save();
      x.translate(ex, ey);
      x.fillStyle = 'rgba(42,11,92,.75)';
      x.beginPath();
      x.arc(0, 0, 20, 0, 6.283);
      x.fill();
      x.fillStyle = '#ffd23f';
      x.beginPath();
      const d = right ? 1 : -1;
      x.moveTo(d * 12, 0);
      x.lineTo(-d * 4, -9);
      x.lineTo(-d * 4, 9);
      x.closePath();
      x.fill();
      x.font = gameFont(700, 11);
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillStyle = '#fff';
      x.lineWidth = 3;
      x.strokeStyle = INK;
      x.strokeText(pr.name, 0, 30);
      x.fillText(pr.name, 0, 30);
      x.restore();
      if (pr.emoteT > 0 && pr.emote) this.drawBubble(pr.emote, ex + (right ? -6 : 6), ey - 46, 2.6 - pr.emoteT, 22);
    }
  }

  private drawBubble(code: string, sx: number, sy: number, age: number, S: number): void {
    const spr = this.sEmote.get(code);
    if (!spr) return;
    const pop = age < 0.18 ? 0.5 + (age / 0.18) * 0.6 : age < 0.3 ? 1.1 - ((age - 0.18) / 0.12) * 0.1 : 1;
    const fade = age > 2.3 ? Math.max(0, 1 - (age - 2.3) / 0.3) : 1;
    const sz = Math.max(44, S * 1.6) * pop;
    this.ctx.globalAlpha = fade;
    this.ctx.drawImage(spr, sx - sz / 2, sy - sz / 2, sz, sz);
    this.ctx.globalAlpha = 1;
  }

  private drawHud(x: CanvasRenderingContext2D, w: number, h: number): void {
    const top = 14 + this.safeT;
    // distância
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = gameFont(900, 34);
    x.lineWidth = 8;
    x.strokeStyle = INK;
    x.strokeText(this.distStr, w / 2, top + 22);
    x.fillStyle = '#fff';
    x.fillText(this.distStr, w / 2, top + 22);
    // combustível
    const fw = Math.min(150, w * 0.36);
    const fx = w / 2 - (fw + 30) / 2;
    const fy = top + 46;
    x.drawImage(this.sFuel, fx - 4, fy - 6, 34, 34);
    const k = this.fuel / this.fuelMax;
    x.fillStyle = INK;
    x.beginPath();
    x.roundRect(fx + 30, fy + 4, fw, 16, 8);
    x.fill();
    const low = k < 0.25;
    x.fillStyle = low ? (Math.sin(this.time * 10) > 0 ? '#ff4f6a' : '#ffd23f') : k < 0.5 ? '#ffd23f' : '#3ee07a';
    if (k > 0.02) {
      x.beginPath();
      x.roundRect(fx + 33, fy + 7, (fw - 6) * k, 10, 5);
      x.fill();
    }
    // moedas
    const cy = top + 62;
    x.drawImage(this.sCoin, 14, cy - 14, 28, 28);
    x.textAlign = 'left';
    x.font = gameFont(800, 20);
    x.lineWidth = 5;
    x.strokeStyle = INK;
    if (this.coinInt !== this.coins) {
      this.coinInt = this.coins;
      this.coinStr = String(this.coins);
    }
    x.strokeText(this.coinStr, 46, cy + 1);
    x.fillStyle = '#fff';
    x.fillText(this.coinStr, 46, cy + 1);

    // pedais
    const pr = Math.min(56, w * 0.13);
    const by = h - pr - 28 - this.safeB;
    this.drawPedal(x, 24 + pr, by, pr, false, this.inp.brake);
    this.drawPedal(x, w - 24 - pr, by, pr, true, this.inp.gas);
  }

  private drawPedal(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, gas: boolean, on: boolean): void {
    x.save();
    x.translate(cx, cy + (on ? 3 : 0));
    x.globalAlpha = on ? 0.95 : 0.7;
    x.fillStyle = INK;
    x.beginPath();
    x.roundRect(-r * 0.75, -r, r * 1.5, r * 2, r * 0.35);
    x.fill();
    x.fillStyle = gas ? '#3ee07a' : '#ff6a7d';
    x.beginPath();
    x.roundRect(-r * 0.62, -r * 0.88, r * 1.24, r * 1.76, r * 0.28);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.roundRect(-r * 0.42, -r * 0.55 + i * r * 0.45, r * 0.84, r * 0.16, r * 0.08);
      x.fill();
    }
    // seta
    x.fillStyle = '#fff';
    x.beginPath();
    const d = gas ? 1 : -1;
    x.moveTo(d * r * 0.3, 0);
    x.lineTo(-d * r * 0.15, -r * 0.28);
    x.lineTo(-d * r * 0.15, r * 0.28);
    x.closePath();
    x.globalAlpha = on ? 0.9 : 0.55;
    x.fill();
    x.restore();
  }

  /* ------------------------------ ciclo ------------------------------ */

  pause(): void {
    if (this.state !== 'play' || this.paused) return;
    this.paused = true;
    this.ptrs.clear();
    this.pauseEl.classList.add('on');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = -1;
    this.limiter.reset();
    this.pauseEl.classList.remove('on');
  }

  private exit(): void {
    this.destroy();
    this.exitFn();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.offs) f();
    this.lobby.destroy();
    this.el.remove();
  }
}

function upIcon(k: UpgradeKey): string {
  const n = k === 'motor' ? 'bolt' : k === 'tires' ? 'refresh' : k === 'susp' ? 'arrow-up' : 'fire';
  return icon(n, { size: 20 });
}
