/* ============================================================
 *  GARIMPO BRUTO — entrada do jogo (chunk sob demanda).
 *  Fluxo: espaços de save (novo / continuar / apagar, dificuldade) → mapa da semente →
 *  laço: procurar (detector) → cavar → carregar → levar até a lavadora → ouro no ESTOQUE →
 *  caminhão de exportação leva parte e paga → comprar máquinas e melhorias.
 * ============================================================ */
import './garimpo.css';
import * as THREE from 'three';
import { t } from '../../i18n';
import { addCoins } from '../../core/economy';
import { pushBack } from '../../core/back';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { QualityGovernor, loadMode, type Tier } from '../../core/quality';
import { sfx } from '../../3d/common/sfx';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { bigMoment, notify, setNotifyAlign, setNotifyTop, resetNotifyTop } from '../../ui/notify';
import { hush, speak } from '../voo/voice';
import { Fire } from './fire';
import { Hud } from './hud';
import { IC, type IconKey } from './icons';
import { collide, Excavator, Heli, makeMachine, Pickup, Truck, Worker, type Ctl, type Env, type Kind, type Machine, type Receiver } from './machines';
import { buildExportTruck } from './models';
import { decodeTerrain, deleteSlot, encodeTerrain, EXPORT_EVERY, FIRE_EVERY, freshSlot, GOLD_PRICE, loadMeta, loadSlot, writeSlot, type Diff, type SlotSave } from './save';
import { World } from './world';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const DIFF_NAMES = () => [t('gb.d0', 'Fácil'), t('gb.d1', 'Normal'), t('gb.d2', 'Difícil'), t('gb.d3', 'Muito difícil')];

export interface ShopItem {
  id: string;
  kind?: Kind;
  icon: IconKey;
  name: () => string;
  price: number[];
  max?: number;
}
export const MACHINES: ShopItem[] = [
  { id: 'pickup', kind: 'pickup', icon: 'enter', name: () => t('gb.m.pickup', 'Pickup 4x4'), price: [900], max: 2 },
  { id: 'excavator', kind: 'excavator', icon: 'dig', name: () => t('gb.m.excavator', 'Escavadeira'), price: [6500], max: 2 },
  { id: 'truck', kind: 'truck', icon: 'tip', name: () => t('gb.m.truck', 'Caminhão basculante'), price: [5000], max: 3 },
  { id: 'dozer', kind: 'dozer', icon: 'bladeDown', name: () => t('gb.m.dozer', 'Trator de esteira'), price: [9000], max: 1 },
  { id: 'heli', kind: 'heli', icon: 'water', name: () => t('gb.m.heli', 'Helicóptero com balde'), price: [16000], max: 1 },
];
export const UPGRADES: ShopItem[] = [
  { id: 'shovel', icon: 'shovel', name: () => t('gb.u.shovel', 'Pá melhor'), price: [180, 700, 2200] },
  { id: 'barrow', icon: 'dump', name: () => t('gb.u.barrow', 'Carrinho maior'), price: [140, 600, 1900] },
  { id: 'plant', icon: 'plant', name: () => t('gb.u.plant', 'Lavadora mais rápida'), price: [900, 3500, 11000] },
];
const SHOVEL = [1, 1.4, 1.8, 2.3];
const BARROW = [0.12, 0.18, 0.26, 0.36];
const PLANT_RATE = [0.1, 0.18, 0.3, 0.5];

export function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  const g = new Garimpo(root, exit);
  g.menu();
  return g;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Garimpo implements MiniGameHandle {
  private wrap: HTMLDivElement;
  private cv: HTMLCanvasElement | null = null;
  private r: THREE.WebGLRenderer | null = null;
  w: World | null = null;
  hud: Hud | null = null;
  sv: SlotSave | null = null;
  private slot = -1;
  ms: Machine[] = [];
  worker: Worker | null = null;
  cur: Machine | null = null;
  fire: Fire | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private paused = false;
  private destroyed = false;
  private gov: QualityGovernor;
  private resK = 1;
  private popB: (() => void) | null = null;
  private popOv: (() => void) | null = null;
  private ro: ResizeObserver | null = null;
  private time = 0;
  // câmera
  private camPos = new THREE.Vector3();
  private camYaw = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookIdle = 0;
  private camMode = 0;
  // lavadora / exportação
  private plantSpin = 0;
  private tail = 0;
  private goldToast = 0;
  private goldToastT = 0;
  private exp = { st: 0 as 0 | 1 | 2 | 3, t: 0, seg: 0, d: 0, mesh: null as THREE.Group | null };
  private detOn = true;
  private detBeep = 0;
  private detV = 0;
  private saveT = 0;
  private earned = 0;
  private soldSession = 0;
  private startAt = 0;
  private rainOn = false;
  private rainK = 0;
  private hintT = 0;
  private toastEl: HTMLDivElement | null = null;
  private alertEl: HTMLDivElement | null = null;
  private engineOn = false;
  env!: Env;

  constructor(
    root: HTMLElement,
    private exitCb: () => void,
  ) {
    this.wrap = document.createElement('div');
    this.wrap.className = 'gb-root';
    root.appendChild(this.wrap);
    this.gov = new QualityGovernor({
      mode: loadMode(),
      persist: false,
      emit: false,
      onChange: (tier) => this.applyTier(tier),
      onResScale: (k) => {
        this.resK = k;
        this.applyPR();
      },
    });
    if (location.search.includes('debug')) (window as unknown as { __garimpo: Garimpo }).__garimpo = this;
  }

  /* ============================== menu de saves ============================== */
  menu(): void {
    this.closeOverlays();
    const meta = loadMeta();
    const d = document.createElement('div');
    d.className = 'gb-scr gb-menu';
    const cards = meta
      .map((m, i) => {
        if (!m)
          return `<button class="gb-card empty" data-new="${i}">${IC.plus}<span>${esc(t('gb.newGame', 'Novo jogo'))}</span><small>${esc(t('gb.slot', 'Espaço {n}', { n: i + 1 }))}</small></button>`;
        const mins = Math.round(m.played / 60);
        return `<div class="gb-card" data-go="${i}" role="button">${IC.bar}<span>${esc(t('gb.slot', 'Espaço {n}', { n: i + 1 }))} · ${esc(DIFF_NAMES()[m.diff])}</span><small>${IC.coin.replace('<svg', '<svg style="width:16px;height:16px;vertical-align:-3px"')} ${Math.floor(m.money).toLocaleString('pt-BR')} · ${mins} min</small><button class="gb-del" data-del="${i}" aria-label="${esc(t('gb.delete', 'Apagar'))}">${IC.trash}</button></div>`;
      })
      .join('');
    d.innerHTML = `<h1>${esc(t('gb.name', 'Garimpo Bruto'))}</h1><div class="gb-row">${cards}</div><button class="gb-btn ghost" data-exit>${IC.home}${esc(t('gb.back', 'Voltar'))}</button>`;
    this.wrap.appendChild(d);
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const del = el.closest<HTMLElement>('[data-del]');
      if (del) {
        e.stopPropagation();
        const i = Number(del.dataset.del);
        if (del.dataset.armed) {
          deleteSlot(i);
          d.remove();
          this.menu();
        } else {
          del.dataset.armed = '1';
          del.style.background = '#c21d1d';
          notify(t('gb.delConfirm', 'Toque de novo para apagar'), { icon: 'warning', kind: 'warn' });
        }
        return;
      }
      const go = el.closest<HTMLElement>('[data-go]');
      if (go) {
        sfx.click();
        const i = Number(go.dataset.go);
        const s = loadSlot(i);
        d.remove();
        if (s) void this.start(i, s);
        else this.menu();
        return;
      }
      const nw = el.closest<HTMLElement>('[data-new]');
      if (nw) {
        sfx.click();
        d.remove();
        this.newGame(Number(nw.dataset.new));
        return;
      }
      if (el.closest('[data-exit]')) this.finish();
    });
  }

  private newGame(i: number): void {
    const d = document.createElement('div');
    d.className = 'gb-scr';
    let diff: Diff = 1;
    const subs = [t('gb.d0s', 'mais dinheiro'), t('gb.d1s', 'o jeito certo'), t('gb.d2s', 'ouro barato'), t('gb.d3s', 'fogo e pouco dinheiro')];
    const draw = () => {
      d.innerHTML = `<h1>${esc(t('gb.newGame', 'Novo jogo'))}</h1><div class="gb-diffs">${DIFF_NAMES()
        .map((n, k) => `<button data-d="${k}" class="${k === diff ? 'on' : ''}">${esc(n)}<small>${esc(subs[k])}</small></button>`)
        .join('')}</div><div class="gb-row"><button class="gb-btn ghost" data-back>${esc(t('gb.back', 'Voltar'))}</button><button class="gb-btn" data-start>${IC.play}${esc(t('gb.start', 'Começar'))}</button></div>`;
    };
    draw();
    this.wrap.appendChild(d);
    this.popOv = pushBack(() => {
      d.remove();
      this.menu();
    });
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      const b = el.closest<HTMLElement>('[data-d]');
      if (b) {
        diff = Number(b.dataset.d) as Diff;
        sfx.click();
        draw();
        return;
      }
      if (el.closest('[data-back]')) {
        this.popOv?.();
        this.popOv = null;
        d.remove();
        this.menu();
      }
      if (el.closest('[data-start]')) {
        this.popOv?.();
        this.popOv = null;
        d.remove();
        const s = freshSlot((Math.random() * 1e9) | 0, diff);
        writeSlot(i, s);
        void this.start(i, s);
      }
    });
  }

  /* ============================== partida ============================== */
  async start(slot: number, s: SlotSave): Promise<void> {
    if (!webglOk()) {
      notify(t('gb.noGL', 'Este aparelho não tem 3D'), { kind: 'bad' });
      this.menu();
      return;
    }
    this.slot = slot;
    this.sv = s;
    const tier = this.gov.tier;
    const cv = document.createElement('canvas');
    cv.className = 'gb-cv';
    this.wrap.appendChild(cv);
    this.cv = cv;
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.r = r;
    const w = new World();
    this.w = w;
    w.build(s.seed, tier);
    decodeTerrain(w.T, s.terrain);
    w.T.markAll();
    w.T.flush();
    this.applyTier(tier);
    this.env = {
      world: w,
      camYaw: 0,
      receiverAt: (x, y, z, self, slack) => this.receiverAt(x, y, z, self, slack ?? 0),
      sfx: (n) => this.sound(n),
      others: this.ms,
    };
    // máquinas do save
    const m = w.map;
    for (const ms of s.machines) {
      const mc = this.addMachine(ms.kind, ms.x, ms.z, ms.yaw);
      mc.cargo.vol = ms.vol;
      mc.cargo.gold = ms.gold;
    }
    const wk = new Worker();
    this.worker = wk;
    wk.cargo.cap = BARROW[s.upg.barrow];
    wk.digPow = SHOVEL[s.upg.shovel];
    if (s.worker.x < 0) {
      const d0 = m.deposits[0];
      const a = Math.atan2(d0.x - m.camp.x, d0.z - m.camp.z);
      wk.place(m.camp.x + Math.sin(a) * 8, m.camp.z + Math.cos(a) * 8, a, w);
    }
    else wk.place(s.worker.x, s.worker.z, s.worker.yaw, w);
    wk.cargo.vol = s.worker.vol;
    wk.cargo.gold = s.worker.gold;
    w.scene.add(wk.group);
    this.cur = wk;
    if (s.driving >= 0 && this.ms[s.driving]) this.enter(this.ms[s.driving]);
    this.fire = new Fire(w, s);
    this.rainOn = s.rain;
    this.rainK = s.rain ? 1 : 0;
    // HUD
    const hud = new Hud(this.wrap, {
      pause: () => this.openPause(),
      shop: () => this.openShop(),
      enterExit: () => this.enterExit(),
      rain: () => {
        this.rainOn = !this.rainOn;
        this.hud?.setRainIcon(this.rainOn);
        sfx.click();
      },
      cam: () => {
        this.camMode = (this.camMode + 1) % 3;
        sfx.click();
      },
      mode: () => this.toggleExpert(),
      detector: () => {
        this.detOn = !this.detOn;
        sfx.click();
      },
    });
    this.hud = hud;
    hud.setRainIcon(this.rainOn);
    hud.setKind(this.cur.kind, s.expert);
    setNotifyTop(96);
    setNotifyAlign('center');
    this.toastEl = document.createElement('div');
    this.toastEl.className = 'gb-toast';
    this.wrap.appendChild(this.toastEl);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.wrap);
    this.resize();
    this.snapCam();
    this.popB = pushBack(() => this.openPause());
    this.startAt = performance.now();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    audio.engineStart();
    this.engineOn = true;
    if (!s.tips.includes('start')) {
      s.tips.push('start');
      window.setTimeout(() => this.say(t('gb.tip.start', 'Ache ouro com o detector, cave com a pá e leve até a lavadora!'), 'detector'), 1200);
    }
  }

  private addMachine(kind: Kind, x: number, z: number, yaw: number): Machine {
    const w = this.w!;
    const mc = makeMachine(kind);
    if (mc instanceof Heli) {
      mc.place(x, z, yaw, w);
      mc.attach(w.scene);
    } else mc.veh?.place(x, z, yaw, w.T);
    mc.veh && (mc.veh.onSpray = (px, py, pz, k, dx, dz) => {
      if (Math.random() < 0.35) w.clods.spawn(px, py + 0.15, pz, dx * (2 + k) + (Math.random() - 0.5), 1.5 + Math.random() * 2 * k, dz * (2 + k) + (Math.random() - 0.5), 0.06 + Math.random() * 0.08, 0.35, 0.2, 0.1);
    });
    mc.group.traverse((o) => (o.castShadow = true));
    w.scene.add(mc.group);
    mc.sync(0);
    this.ms.push(mc);
    return mc;
  }

  /** onde uma máquina nova aparece (na frente da garagem, sem bater em ninguém) */
  private spawnSpot(kind: Kind): [number, number, number] {
    const m = this.w!.map;
    if (kind === 'heli') return [m.camp.x, m.camp.z, 0];
    for (const ox of [-6, 0, 6, -12, 12, 18])
      for (const oz of [13, 21]) {
        const x = m.garage.x + ox;
        const z = m.garage.z + oz;
        if (this.ms.every((o) => o.pos.distanceTo(_v.set(x, o.pos.y, z)) > 6)) return [x, z, 0];
      }
    return [m.garage.x, m.garage.z + 24, 0];
  }

  /* ---------------- moega, caçambas ---------------- */
  private hopperPos(out: THREE.Vector3): THREE.Vector3 {
    out.set(0, 1.4, 6);
    return this.w!.plant.root.localToWorld(out);
  }
  private hopper: Receiver = {
    take: (vol, gold) => {
      const s = this.sv!;
      s.plantVol += vol;
      s.plantGold += gold;
      return vol;
    },
  };
  receiverAt(x: number, y: number, z: number, self: Machine | null, slack: number): Receiver | null {
    const hp = this.hopperPos(_v2);
    if (Math.hypot(x - hp.x, z - hp.z) < 2.4 + slack && y > hp.y - 2 && y < hp.y + 7) return this.hopper;
    for (const m of this.ms) {
      if (m === self) continue;
      if ((m instanceof Truck || m instanceof Pickup) && m.inBed(_v.set(x, y, z), slack * 0.5)) {
        return {
          take: (vol, gold) => {
            const room = Math.max(0, m.cargo.cap * 1.08 - m.cargo.vol);
            const v = Math.min(vol, room);
            m.cargo.vol += v;
            m.cargo.gold += vol > 0 ? (gold * v) / vol : 0;
            return v;
          },
        };
      }
    }
    return null;
  }

  /* ---------------- entrar / sair ---------------- */
  private nearMachine(): Machine | null {
    const wk = this.worker!;
    let best: Machine | null = null;
    let bd = 1e9;
    for (const m of this.ms) {
      const d = m.pos.distanceTo(wk.group.position) - m.rad;
      if (d < 2.6 && d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
  private enterExit(): void {
    if (this.cur === this.worker) {
      const m = this.nearMachine();
      if (m) this.enter(m);
    } else this.exit();
  }
  private enter(m: Machine): void {
    const wk = this.worker!;
    wk.group.visible = false;
    this.cur = m;
    m.veh?.wake();
    if (m.veh) m.veh.input.hand = false;
    this.hud?.setKind(m.kind, this.sv!.expert);
    sfx.door();
    tap('light');
    this.lookYaw = 0;
    if (!this.sv!.tips.includes('k-' + m.kind)) {
      this.sv!.tips.push('k-' + m.kind);
      const tips: Partial<Record<Kind, string>> = {
        excavator: t('gb.tip.exc', 'Segure CAVAR para encher a caçamba. Gire e DESPEJE no caminhão!'),
        truck: t('gb.tip.truck', 'Leve a terra até a lavadora e levante a CAÇAMBA de ré na moega.'),
        dozer: t('gb.tip.dozer', 'Abaixe a lâmina e empurre a terra de cima para chegar no ouro.'),
        heli: t('gb.tip.heli', 'Suba, encha o balde no lago e solte a água no fogo!'),
        pickup: t('gb.tip.pickup', 'Encha a caçamba com a pá e descarregue na lavadora.'),
      };
      const tp = tips[m.kind];
      if (tp) window.setTimeout(() => this.say(tp), 400);
    }
  }
  private exit(): void {
    const m = this.cur!;
    if (m instanceof Heli && m.alt > 0.6) {
      notify(t('gb.landFirst', 'Pouse primeiro!'), { icon: 'warning', kind: 'warn' });
      return;
    }
    const wk = this.worker!;
    m.group.updateMatrixWorld();
    _v.copy(m.door);
    m.group.localToWorld(_v);
    wk.place(_v.x, _v.z, m.yaw(), this.w!);
    wk.group.visible = true;
    if (m.veh) {
      m.veh.input.gas = m.veh.input.brake = m.veh.input.steer = 0;
      m.veh.input.hand = true;
    }
    this.cur = wk;
    this.hud?.setKind('worker', this.sv!.expert);
    sfx.door();
  }

  private toggleExpert(): void {
    const s = this.sv!;
    s.expert = !s.expert;
    this.hud?.setKind(this.cur!.kind, s.expert);
    notify(s.expert ? t('gb.expertOn', 'Modo DIFÍCIL: câmbio, 4x4, bloqueio e pneus') : t('gb.expertOff', 'Modo SIMPLES: só acelerar, frear e virar'), { icon: 'gear' });
    sfx.click();
  }

  /* ============================== laço ============================== */
  private loop = (now: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const el = now - this.last;
    this.last = now;
    if (this.paused || !this.w || !this.r) return;
    const w0 = performance.now();
    const dt = Math.min(0.066, Math.max(0, el / 1000));
    this.step(dt);
    this.render();
    this.gov.sample(el, performance.now() - w0);
  };

  step(dt: number): void {
    const w = this.w!;
    const s = this.sv!;
    const hud = this.hud!;
    this.time += dt;
    s.played += dt;
    const ctl = hud.read(dt);
    this.env.camYaw = this.camYaw;
    const cur = this.cur!;
    // ferramentas e entradas (por quadro)
    this.worker!.update(dt, cur === this.worker ? ctl : null, this.env);
    for (const m of this.ms) m.update(dt, m === cur ? ctl : null, this.env);
    // física em passos fixos de 1/120 s
    this.acc += dt;
    const h = 1 / 120;
    let n = 0;
    while (this.acc >= h && n < 8) {
      for (const m of this.ms) m.physics(h, this.env, m === cur);
      this.acc -= h;
      n++;
    }
    if (n >= 8) this.acc = 0;
    collide(this.ms, w);
    for (const m of this.ms) m.sync(dt);
    // fuga: virou? desvira sozinho depois de 2 s
    if (cur.veh && cur.veh.flipped() && Math.abs(cur.veh.speed) < 1) {
      this.hintT += dt;
      if (this.hintT > 2) {
        this.hintT = 0;
        const v = cur.veh;
        v.place(v.pos.x, v.pos.z, v.yaw(), w.T);
        notify(t('gb.unflip', 'Desvirado!'), { icon: 'refresh' });
      }
    }
    this.plantStep(dt);
    this.exportStep(dt);
    this.fire!.step(dt, this);
    // chuva
    this.rainK += ((this.rainOn ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.4);
    w.T.rain = Math.max(w.T.rain * (1 - dt * 0.01), this.rainK * Math.min(1, w.T.rain + dt * 0.02));
    if (!this.rainOn) w.T.rain = Math.max(0, w.T.rain - dt * 0.004);
    w.T.uRain.value = w.T.rain;
    w.setRain(this.rainK);
    s.rain = this.rainOn;
    // som do motor
    if (cur.veh) audio.engineSet(Math.max(cur.veh.input.gas, cur.veh.input.brake), Math.min(1, cur.veh.rpm));
    else if (cur instanceof Heli) audio.engineSet(0.6, 0.9);
    else audio.engineSet(0, 0);
    this.camera(dt);
    // detector
    const det = this.detOn && (cur === this.worker || cur.kind === 'excavator' || cur.kind === 'pickup') ? this.detect(cur.pos.x, cur.pos.z) : null;
    if (det !== null) {
      this.detV += (det - this.detV) * Math.min(1, dt * 4);
      this.detBeep -= dt;
      if (this.detV > 0.15 && this.detBeep <= 0) {
        this.detBeep = 1.3 - this.detV * 1.15;
        audio.tick(Math.min(4, Math.floor(this.detV * 5)));
      }
    }
    // seta para o objetivo
    let arrow: { a: number; icon: IconKey; dist: number } | null = null;
    const fp = this.fire!.target();
    if (fp) arrow = this.arrowTo(fp.x, fp.z, 'fire');
    else if (cur.fill > 0.9) {
      this.hopperPos(_v);
      arrow = this.arrowTo(_v.x, _v.z, 'plant');
    } else if (!s.tips.includes('gold1') && cur === this.worker) {
      // primeira vez: leva até a jazida rasa perto do acampamento
      const d0 = w.map.deposits[0];
      if (Math.hypot(d0.x - cur.pos.x, d0.z - cur.pos.z) > 5) arrow = this.arrowTo(d0.x, d0.z, 'detector');
    }
    if (!s.tips.includes('gold1') && s.stock > 0) s.tips.push('gold1');
    const hp = this.hopperPos(_v);
    const nearHopper = cur.pos.distanceTo(hp) < 9;
    hud.update({
      money: s.money,
      stock: s.stock,
      fill: cur.fill,
      cargoGold: cur.cargo.gold,
      rpm: cur.veh ? cur.veh.rpm : 0,
      gear: cur.veh ? cur.veh.gear : 1,
      auto: cur.veh ? cur.veh.input.auto : true,
      det: det === null ? null : this.detV,
      arrow,
      canEnter: cur === this.worker ? !!this.nearMachine() : false,
      hot2: (nearHopper && cur.fill > 0.01) || (cur === this.worker && cur.fill > 0.01 && !!this.bedNear()),
    });
    // pickup descarregando na moega
    if (cur instanceof Pickup && ctl.act2 && nearHopper) cur.unload(dt, this.hopper);
    // partículas, terreno
    w.clods.update(dt, w.T, w.waterY);
    w.drops.update(dt, w.T, w.waterY);
    w.rain.update(this.time, this.camPos, this.rainK);
    w.T.flush();
    // autosave
    this.saveT += dt;
    if (this.saveT > 45) {
      this.saveT = 0;
      this.persist();
    }
  }

  private bedNear(): Machine | null {
    const wk = this.worker!;
    const fx = wk.group.position.x + Math.sin(wk.group.rotation.y) * 1.6;
    const fz = wk.group.position.z + Math.cos(wk.group.rotation.y) * 1.6;
    for (const m of this.ms) if ((m instanceof Truck || m instanceof Pickup) && m.inBed(_v.set(fx, wk.group.position.y + 1, fz), 0.9)) return m;
    return null;
  }

  private arrowTo(x: number, z: number, icon: IconKey): { a: number; icon: IconKey; dist: number } {
    const p = this.cur!.pos;
    const a = Math.atan2(x - p.x, z - p.z);
    const rel = a - this.camYaw;
    return { a: -rel, icon, dist: Math.hypot(x - p.x, z - p.z) };
  }

  /** sinal do detector 0..1: teor alcançável perto (fundo demais quase não apita) */
  private detect(x: number, z: number): number {
    const T = this.w!.T;
    let best = 0;
    for (let a = -2; a <= 2; a++)
      for (let b = -2; b <= 2; b++) {
        const px = x + a * 1.6;
        const pz = z + b * 1.6;
        const k = T.idx(px, pz);
        const dug = Math.max(0, T.h0[k] - T.h[k]);
        const reach = Math.max(0, T.oreD[k] - dug - 1.2);
        const v = T.oreR[k] * Math.exp(-(a * a + b * b) * 0.32) * Math.exp(-reach / 2.2);
        if (v > best) best = v;
      }
    return 1 - Math.exp(-best / 18);
  }

  /* ---------------- lavadora ---------------- */
  private plantStep(dt: number): void {
    const s = this.sv!;
    const w = this.w!;
    const pl = w.plant;
    if (s.plantVol > 1e-4) {
      const v = Math.min(s.plantVol, PLANT_RATE[s.upg.plant] * dt);
      const g = (s.plantGold * v) / s.plantVol;
      s.plantVol -= v;
      s.plantGold -= g;
      if (s.plantVol < 1e-4) s.plantVol = s.plantGold = 0;
      s.stock += g;
      this.goldToast += g;
      this.tail += v;
      this.plantSpin = Math.min(1, this.plantSpin + dt * 2);
      // água na calha
      if (Math.random() < 0.6) {
        _v.set(2.6, 1.3, 1.6);
        pl.root.localToWorld(_v);
        w.drops.spawn(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 0.4, 0.5, (Math.random() - 0.5) * 0.4, 0.08, 0.6, 0.8, 1);
      }
    } else this.plantSpin = Math.max(0, this.plantSpin - dt);
    pl.trommel.rotation.x += dt * 2.2 * this.plantSpin;
    // rejeito sai pela esteira e forma um monte atrás
    if (this.tail > 0.15) {
      _v.set(0, 0, -10.2);
      pl.root.localToWorld(_v);
      w.T.deposit(_v.x, _v.z, this.tail, 1.8, 0.05);
      w.T.relax(_v.x, _v.z, 3);
      this.tail = 0;
    }
    this.goldToastT -= dt;
    if (this.goldToast > 0.05 && this.goldToastT <= 0 && s.plantVol < 1e-3) {
      this.toast('+' + (this.goldToast < 10 ? this.goldToast.toFixed(1) : Math.round(this.goldToast)) + ' g');
      audio.coin(2);
      this.goldToast = 0;
      this.goldToastT = 1.5;
    }
    // barras no estoque
    const bars = w.stock.bars;
    const n = Math.min(200, Math.ceil(s.stock / 20));
    if (n !== bars.count) {
      const m4 = new THREE.Matrix4();
      for (let i = bars.count; i < n; i++) {
        const layer = Math.floor(i / 40);
        const k = i % 40;
        m4.makeTranslation(-2.6 + (k % 10) * 0.55, 1.03 + layer * 0.15, -2.4 + Math.floor(k / 10) * 0.45);
        bars.setMatrixAt(i, m4);
      }
      bars.count = n;
      bars.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---------------- caminhão de exportação ---------------- */
  private exportStep(dt: number): void {
    const s = this.sv!;
    const w = this.w!;
    const e = this.exp;
    const path = w.map.gateRoad;
    if (e.st === 0) {
      s.exportT -= dt;
      if (s.exportT <= 0) {
        s.exportT = EXPORT_EVERY[s.diff];
        if (s.stock < 0.5) return;
        e.st = 1;
        e.seg = 0;
        e.d = 0;
        if (!e.mesh) {
          e.mesh = buildExportTruck();
          w.scene.add(e.mesh);
        }
        e.mesh.visible = true;
        notify(t('gb.exportComing', 'O caminhão do ouro está chegando!'), { icon: 'bag' });
      }
      return;
    }
    const m = e.mesh!;
    const sp = 7;
    const move = (dir: 1 | -1) => {
      // anda ao longo da polilinha (ida 1, volta -1)
      const pts = dir === 1 ? path : [...path].reverse();
      const a = pts[e.seg];
      const b = pts[e.seg + 1];
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      e.d += sp * dt;
      if (e.d >= L) {
        e.d -= L;
        e.seg++;
        if (e.seg >= pts.length - 1) return true;
      }
      const a2 = pts[e.seg];
      const b2 = pts[Math.min(pts.length - 1, e.seg + 1)];
      const L2 = Math.hypot(b2.x - a2.x, b2.z - a2.z) || 1;
      const k = Math.min(1, e.d / L2);
      const x = a2.x + (b2.x - a2.x) * k;
      const z = a2.z + (b2.z - a2.z) * k;
      m.position.set(x, w.T.heightAt(x, z), z);
      m.rotation.y = Math.atan2(b2.x - a2.x, b2.z - a2.z);
      return false;
    };
    if (e.st === 1) {
      if (move(1)) {
        e.st = 2;
        e.t = 4;
      }
    } else if (e.st === 2) {
      e.t -= dt;
      if (e.t <= 0) {
        const take = s.stock <= 30 ? s.stock : Math.max(30, s.stock * 0.35);
        const pay = Math.round(take * GOLD_PRICE[s.diff]);
        s.stock -= take;
        s.sold += take;
        s.money += pay;
        this.earned += pay;
        this.soldSession += take;
        bigMoment(t('gb.sold', 'Vendido! +{n}', { n: pay.toLocaleString('pt-BR') }), { icon: 'coins', sub: Math.round(take) + ' g' });
        audio.cash();
        this.say(t('gb.soldSay', 'O caminhão levou o ouro. Dinheiro na conta!'));
        e.st = 3;
        e.seg = 0;
        e.d = 0;
      }
    } else if (e.st === 3) {
      if (move(-1)) {
        e.st = 0;
        m.visible = false;
      }
    }
  }

  /* ---------------- câmera ---------------- */
  private snapCam(): void {
    const c = this.cur!;
    this.camYaw = c.yaw() + c.cam.yawOff;
    this.camera(1, true);
  }
  private camera(dt: number, snap = false): void {
    const w = this.w!;
    const c = this.cur!;
    const cam = w.camera;
    const [dYaw, dPitch] = this.hud!.look.consume(dt);
    if (dYaw || dPitch) {
      this.lookYaw -= dYaw;
      this.lookPitch = Math.max(-0.35, Math.min(0.6, this.lookPitch + dPitch));
      this.lookIdle = 0;
    } else this.lookIdle += dt;
    const moving = c.veh ? Math.abs(c.veh.speed) > 1.5 : c instanceof Worker ? c.speedNow > 0.5 : false;
    if (this.lookIdle > 2.5 && moving) {
      this.lookYaw *= 1 - Math.min(1, dt * 1.5);
      this.lookPitch *= 1 - Math.min(1, dt * 1.5);
    }
    // o garimpeiro e o helicóptero: câmera só segue devagar (andam relativos à tela)
    const free = c instanceof Worker || c instanceof Heli;
    let want = c.yaw() + c.cam.yawOff;
    if (free) {
      if (!moving) want = this.camYaw - this.lookYaw;
      else want = this.camYaw - this.lookYaw + Math.atan2(Math.sin(want - this.camYaw), Math.cos(want - this.camYaw)) * 0.5;
    }
    // ré: câmera não gira para frente do caminhão de repente
    let d = want - this.camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.camYaw += snap ? d : d * Math.min(1, dt * (free ? 2.2 : 3));
    const yaw = this.camYaw + (free ? 0 : this.lookYaw);
    if (free) {
      this.camYaw += this.lookYaw;
      this.lookYaw = 0;
    }
    const mul = [1, 1.6, 0.72][this.camMode];
    const dist = c.cam.dist * mul;
    const hgt = c.cam.height * mul * (1 + this.lookPitch * 1.4);
    const p = c.pos;
    const tx = p.x;
    const ty = p.y + c.cam.look + (c instanceof Heli ? -2 : 0);
    const tz = p.z;
    let cx = tx - Math.sin(yaw) * dist;
    let cz = tz - Math.cos(yaw) * dist;
    let cy = ty + hgt;
    // nunca dentro do terreno: sobe acima do chão na câmera e no meio do caminho
    const T = w.T;
    for (let i = 1; i <= 3; i++) {
      const k = i / 3;
      const gx = tx + (cx - tx) * k;
      const gz = tz + (cz - tz) * k;
      const need = T.heightAt(gx, gz) + 1.1 - (ty + (cy - ty) * k);
      if (need > 0) cy += need / k;
    }
    cx = Math.max(2, Math.min(190, cx));
    cz = Math.max(2, Math.min(190, cz));
    const kk = snap ? 1 : Math.min(1, dt * 6);
    this.camPos.x += (cx - this.camPos.x) * kk;
    this.camPos.y += (cy - this.camPos.y) * kk;
    this.camPos.z += (cz - this.camPos.z) * kk;
    const floor = T.heightAt(this.camPos.x, this.camPos.z) + 0.9;
    if (this.camPos.y < floor) this.camPos.y = floor;
    // prédios: câmera não entra — encurta até a parede e, se ficar perto demais, sobe por cima do telhado
    {
      let tMin = 1;
      let roof = 0;
      const dx = this.camPos.x - tx;
      const dz = this.camPos.z - tz;
      const L2 = dx * dx + dz * dz || 1;
      for (const b of w.blockers) {
        if (this.camPos.y > b.y + 0.5) continue;
        // entrada do segmento alvo→câmera no círculo do prédio
        const fx = tx - b.x;
        const fz = tz - b.z;
        const bb = fx * dx + fz * dz;
        const cc = fx * fx + fz * fz - b.r * b.r;
        if (cc < 0) continue; // alvo já está dentro (ex.: garagem): deixa
        const disc = bb * bb - L2 * cc;
        if (disc < 0) continue;
        const t0 = (-bb - Math.sqrt(disc)) / L2;
        if (t0 > 0 && t0 < tMin) {
          tMin = t0;
          roof = b.y;
        }
      }
      if (tMin < 1) {
        const k = Math.max(0.35, tMin - 0.06);
        this.camPos.x = tx + dx * k;
        this.camPos.z = tz + dz * k;
        if (tMin < 0.5) this.camPos.y = Math.max(this.camPos.y, roof + 1);
      }
    }
    cam.position.copy(this.camPos);
    cam.lookAt(tx, ty, tz);
    if (this.camOverride) {
      const o = this.camOverride;
      cam.position.set(o[0], o[1], o[2]);
      cam.lookAt(o[3], o[4], o[5]);
    }
    w.follow(tx, tz);
  }
  camOverride: number[] | null = null;

  private render(): void {
    this.r!.render(this.w!.scene, this.w!.camera);
  }

  /* ---------------- qualidade ---------------- */
  private applyTier(tier: Tier): void {
    this.w?.setTier(tier);
    this.applyPR();
  }
  private applyPR(): void {
    if (!this.r) return;
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [0.75, 0.9, 1.1, 1.5][this.gov.tier]) * this.resK);
    this.resize();
  }
  private resize(): void {
    if (!this.r || !this.w) return;
    const W = this.wrap.clientWidth || 1;
    const H = this.wrap.clientHeight || 1;
    this.r.setSize(W, H, false);
    this.w.camera.aspect = W / H;
    this.w.camera.fov = W / H < 1.2 ? 70 : 58;
    this.w.camera.updateProjectionMatrix();
  }

  /* ---------------- sons / falas / avisos ---------------- */
  private sound(n: 'dig' | 'dump' | 'splash' | 'full' | 'clank'): void {
    if (n === 'dig') sfx.thud();
    else if (n === 'dump') sfx.splat();
    else if (n === 'splash') sfx.splash();
    else if (n === 'clank') sfx.knob();
    else if (n === 'full') {
      if (this.time - this.fullAt > 4) {
        this.fullAt = this.time;
        sfx.ding();
        notify(t('gb.full', 'Cheio! Leve para a lavadora'), { icon: 'arrow-up', kind: 'good' });
      }
    }
  }
  private fullAt = -10;
  say(text: string, icon: 'detector' | 'fire' | null = null): void {
    notify(text, { icon: icon === 'fire' ? 'fire' : 'target', ms: 4500 });
    speak(text, { gap: 600 });
  }
  toast(text: string): void {
    const el = this.toastEl;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    window.setTimeout(() => el.classList.remove('on'), 900);
  }
  alert(text: string | null): void {
    if (!text) {
      this.alertEl?.remove();
      this.alertEl = null;
      return;
    }
    if (!this.alertEl) {
      this.alertEl = document.createElement('div');
      this.alertEl.className = 'gb-alert';
      this.wrap.appendChild(this.alertEl);
    }
    this.alertEl.innerHTML = IC.fire + esc(text);
  }

  /* ============================== telas por cima ============================== */
  private overlay(html: string, cls = ''): HTMLDivElement {
    this.closeOverlays();
    this.paused = true;
    this.hud?.setVisible(false);
    const d = document.createElement('div');
    d.className = 'gb-scr ' + cls;
    d.innerHTML = html;
    d.dataset.ov = '1';
    this.wrap.appendChild(d);
    this.popOv = pushBack(() => this.closeOverlays());
    return d;
  }
  private closeOverlays(): void {
    this.wrap.querySelectorAll('[data-ov]').forEach((e) => e.remove());
    this.popOv?.();
    this.popOv = null;
    if (this.w && this.paused) {
      this.paused = false;
      this.last = performance.now();
      this.hud?.setVisible(true);
    }
  }
  openPause(): void {
    if (!this.sv) return;
    this.persist();
    const s = this.sv;
    const d = this.overlay(
      `<h1>${esc(t('gb.paused', 'Pausa'))}</h1>
      <div class="gb-row"><button class="gb-btn" data-c>${IC.play}${esc(t('gb.continue', 'Continuar'))}</button></div>
      <div class="gb-row"><button class="gb-btn ghost" data-m>${IC.wheel}${esc(s.expert ? t('gb.modeHard', 'Direção: DIFÍCIL') : t('gb.modeSimple', 'Direção: SIMPLES'))}</button>
      <button class="gb-btn ghost" data-s>${IC.home}${esc(t('gb.saveExit', 'Salvar e sair'))}</button></div>`,
      'clear',
    );
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-c]')) this.closeOverlays();
      else if (el.closest('[data-m]')) {
        this.toggleExpert();
        this.openPause();
      } else if (el.closest('[data-s]')) {
        this.closeOverlays();
        this.leave();
        this.menu();
      }
    });
  }

  openShop(): void {
    const s = this.sv;
    if (!s) return;
    const owned = (k: Kind) => this.ms.filter((m) => m.kind === k).length;
    const item = (it: ShopItem, isUp: boolean) => {
      const lvl = isUp ? s.upg[it.id as 'shovel'] : owned(it.kind!);
      const max = isUp ? it.price.length : it.max ?? 1;
      const price = isUp ? it.price[lvl] : it.price[0];
      const done = lvl >= max;
      const can = !done && s.money >= price;
      const lv = isUp ? `<div class="gb-lvl">${it.price.map((_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('')}</div>` : lvl ? `<small>×${lvl}</small>` : '<small>&nbsp;</small>';
      return `<div class="gb-item ${done ? 'owned' : ''}"><div class="gb-ico">${IC[it.icon]}</div><span>${esc(it.name())}</span>${lv}<button class="gb-price" data-buy="${it.id}" ${can ? '' : 'disabled'}>${done ? IC.star : IC.coin}${done ? esc(t('gb.max', 'Máximo')) : price.toLocaleString('pt-BR')}</button></div>`;
    };
    const d = this.overlay(
      `<button class="gb-b gb-x" data-x>${IC.close}</button><h2>${IC.coin.replace('<svg', '<svg style="width:22px;height:22px;vertical-align:-4px"')} ${Math.floor(s.money).toLocaleString('pt-BR')}</h2>
      <div class="gb-shopgrid">${MACHINES.map((m) => item(m, false)).join('')}${UPGRADES.map((u) => item(u, true)).join('')}</div>`,
    );
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-x]')) return this.closeOverlays();
      const b = el.closest<HTMLElement>('[data-buy]');
      if (!b || (b as HTMLButtonElement).disabled) return;
      this.buy(b.dataset.buy!);
      this.openShop();
    });
  }
  buy(id: string): boolean {
    const s = this.sv!;
    const mi = MACHINES.find((m) => m.id === id);
    if (mi) {
      const n = this.ms.filter((m) => m.kind === mi.kind).length;
      if (n >= (mi.max ?? 1) || s.money < mi.price[0]) return false;
      s.money -= mi.price[0];
      const [x, z, yaw] = this.spawnSpot(mi.kind!);
      this.addMachine(mi.kind!, x, z, yaw);
      audio.cash();
      bigMoment(t('gb.bought', 'Comprou: {n}', { n: mi.name() }), { icon: 'gift' });
      this.persist();
      return true;
    }
    const ui = UPGRADES.find((u) => u.id === id);
    if (ui) {
      const k = ui.id as 'shovel' | 'barrow' | 'plant';
      const lvl = s.upg[k];
      if (lvl >= ui.price.length || s.money < ui.price[lvl]) return false;
      s.money -= ui.price[lvl];
      s.upg[k] = lvl + 1;
      this.worker!.cargo.cap = BARROW[s.upg.barrow];
      this.worker!.digPow = SHOVEL[s.upg.shovel];
      audio.cash();
      this.persist();
      return true;
    }
    return false;
  }

  /* ============================== save / saída ============================== */
  persist(): void {
    const s = this.sv;
    const w = this.w;
    if (!s || !w || this.slot < 0) return;
    s.machines = this.ms.map((m) => ({ kind: m.kind, x: m.pos.x, z: m.pos.z, yaw: m.yaw(), vol: m.cargo.vol, gold: m.cargo.gold }));
    const wk = this.worker!;
    s.worker = { x: wk.group.position.x, z: wk.group.position.z, yaw: wk.group.rotation.y, vol: wk.cargo.vol, gold: wk.cargo.gold };
    s.driving = this.cur && this.cur !== wk ? this.ms.indexOf(this.cur) : -1;
    s.terrain = encodeTerrain(w.T);
    this.fire?.save(s);
    if (!writeSlot(this.slot, s)) notify(t('gb.saveFail', 'Sem espaço para salvar'), { kind: 'bad' });
  }

  /** sai da partida (volta ao menu de saves ou ao hub): salva, relata e libera tudo */
  private leave(): void {
    if (!this.sv) return;
    this.persist();
    const secs = Math.round((performance.now() - this.startAt) / 1000);
    const coins = Math.min(60, Math.floor(this.earned / 400));
    if (coins > 0) addCoins(coins);
    if (secs > 20)
      reportRun({ game: 'garimpo', score: Math.round(this.soldSession), coins, durationSec: secs, stats: { sold: Math.round(this.soldSession), earned: Math.round(this.earned) } });
    this.earned = 0;
    this.soldSession = 0;
    this.teardown();
  }
  private teardown(): void {
    cancelAnimationFrame(this.raf);
    this.popB?.();
    this.popB = null;
    this.alert(null);
    if (this.engineOn) audio.engineStop();
    this.engineOn = false;
    hush();
    resetNotifyTop();
    setNotifyAlign('left');
    this.ro?.disconnect();
    this.hud?.destroy();
    this.hud = null;
    for (const m of this.ms) {
      if (m instanceof Heli) m.detach();
      m.dispose();
    }
    this.ms.length = 0;
    this.worker?.dispose();
    this.worker = null;
    this.cur = null;
    this.fire = null;
    this.w?.dispose();
    this.w = null;
    this.r?.dispose();
    this.r?.forceContextLoss();
    this.r = null;
    this.cv?.remove();
    this.cv = null;
    this.toastEl?.remove();
    this.sv = null;
    this.exp = { st: 0, t: 0, seg: 0, d: 0, mesh: null };
  }

  inMatch(): boolean {
    return !!this.sv;
  }
  pause(): void {
    this.paused = true;
    if (this.engineOn) audio.engineSet(0, 0);
  }
  resume(): void {
    if (this.wrap.querySelector('[data-ov]')) return;
    this.paused = false;
    this.last = performance.now();
  }
  finish(): void {
    this.destroy();
    this.exitCb();
  }
  destroy(): void {
    if (this.destroyed) return;
    this.leave();
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.popOv?.();
    this.wrap.remove();
  }
  /** testes: atalhos */
  debug = {
    money: (n: number) => this.sv && (this.sv.money += n),
    give: (k: Kind) => {
      const [x, z, y] = this.spawnSpot(k);
      return this.addMachine(k, x, z, y);
    },
    ctl: (): Ctl => this.hud!.ctl,
    excavator: (): Excavator | undefined => this.ms.find((m) => m instanceof Excavator) as Excavator | undefined,
    tp: (x: number, z: number, yaw = 0) => {
      const c = this.cur!;
      if (c.veh) c.veh.place(x, z, yaw, this.w!.T);
      else if (c instanceof Worker) c.place(x, z, yaw, this.w!);
      else if (c instanceof Heli) c.place(x, z, yaw, this.w!);
      this.snapCam();
    },
    enter: (m: Machine) => this.enter(m),
    exit: () => this.exit(),
    exportNow: () => this.sv && (this.sv.exportT = 0),
    fireNow: () => this.sv && (this.sv.fireT = 0),
  };
}
export { FIRE_EVERY };
