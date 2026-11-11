/* ============================================================
 *  GARIMPO — "VIDA DE GARIMPEIRO" (camada RP): liga tudo ao jogo com poucos ganchos.
 *  Ganchos em game.ts (procure "RP:"): criar, pre(dt, ctl) logo após ler o controle,
 *  post(dt) no fim do present(), takeover(dt) no laço (estrada), save(s), dispose().
 *
 *  Sistemas por dificuldade (state.ts → systems):
 *    fácil: dia/noite bonito + eventos gentis; normal: + diesel e horário comercial;
 *    difícil: + fome/sede/sono/fôlego, peso da mochila, temporais e sustos à noite;
 *    muito difícil: tudo mais apertado e eventos mais frequentes.
 *  Multijogador: o anfitrião manda hora/clima/diesel/eventos do time ('rp' ~1/s);
 *  cada um tem as próprias necessidades/mochila/força; pedidos do convidado que
 *  mexem no dinheiro do time vão como 'rpa'. A estrada é só jogando sozinho (v1).
 * ============================================================ */
import './rp.css';
import * as THREE from 'three';
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { audio } from '../../../core/audio';
import type { Tier } from '../../../core/quality';
import { bigMoment, notify } from '../../../ui/notify';
import { speak } from '../../voo/voice';
import { Heli, Pickup, type Ctl, type Machine } from '../machines';
import { GOLD_PRICE, type SlotSave } from '../save';
import { weather, type SkyKind, type WeatherSave } from '../weather';
import type { Garimpo } from '../game';
import type { World } from '../world';
import { Highway } from '../haul/level';
import { COMBOS, DESTS, deadline, freshHaul, G_PER_T, RIG_TANK, type Trip } from '../haul/freight';
import { allowed, keyOf, pick, scaleMoney, TEMPLATES, type Choice, type Concrete, type Ctx, type Fx, type Loc, type Veh } from './events';
import { RpHud, type Action } from './hud';
import { RI, type RIcon } from './icons';
import { SkyRig, type LampPost } from './sky';
import { howl, thunder } from './sound';
import { capKg, digMul, fixRp, invKg, ITEMS, SACK_VOL, STR_MAX, stamMax, systems, TANK, xpNeed, type ItemId, type RpSave, type Systems } from './state';
import { bagScreen, freightScreen, resultScreen, shopScreen, type DeliveryResult } from './screens';
import { buildPump, buildShop } from '../haul/models';

/** campos privados do Garimpo que a camada lê (acesso por índice, sem mudar a classe) */
interface GPriv {
  wrap: HTMLDivElement;
  r: THREE.WebGLRenderer | null;
  paused: boolean;
  rainK: number;
  gov: { tier: Tier };
  exp: { st: number };
  camPos: THREE.Vector3;
}
const _v = new THREE.Vector3();

export class RpLayer {
  readonly st: RpSave;
  readonly sys: Systems;
  readonly hud: RpHud;
  private sky: SkyRig;
  private P: GPriv;
  private fuel = new Map<Machine, number>();
  private pumpAt = { x: 0, z: 0 };
  private stallAt = { x: 0, z: 0 };
  private props: THREE.Object3D[] = [];
  private evT: number;
  private rnd = Math.random;
  private lastRain = false;
  private lastStock = 0;
  private lastSold = 0;
  private lastVol = 0;
  private lastPos = new THREE.Vector3();
  private staminaNote = 0;
  private fading = false;
  private offs: (() => void)[] = [];
  private netT = 0;
  private netOff: (() => void)[] = [];
  private netFor: unknown = null;
  private guestFuel: number[] = [];
  private priceBoost = 0;
  private rumor: { x: number; z: number; until: number } | null = null;
  private rumorEl: HTMLDivElement;
  private hw: Highway | null = null;
  private lastDigBase = -1;
  private nightBonusT = 0;
  private officeNote = false;
  private lastHudVis = true;
  private flashHold = 0;
  private lvlPending = 0;

  constructor(private g: Garimpo) {
    this.P = g as unknown as GPriv;
    const s = g.sv!;
    const raw = (s as SlotSave & { rp?: RpSave }).rp;
    this.st = fixRp(g.guest ? loadGuest() : raw);
    if (!this.st.haul) this.st.haul = freshHaul();
    this.sys = systems(s.diff);
    weather.load(this.st.wx as WeatherSave | undefined, s.seed, s.diff);
    weather.dayLen = this.st.opt.dayLen || 22;
    weather.frozen = g.guest;
    if (this.st.opt.spooky === null) this.st.opt.spooky = s.diff >= 2;
    this.lastRain = g.rainOn;
    this.lastStock = s.stock;
    this.lastSold = s.sold;
    const w = g.w!;
    this.camp(w);
    this.sky = new SkyRig(w, this.P.gov.tier, this.lamps(w));
    this.hud = new RpHud(this.P.wrap, () => this.openBag());
    this.rumorEl = document.createElement('div');
    this.rumorEl.className = 'gb-arrow';
    this.rumorEl.style.top = 'calc(var(--edge-t,8px) + 92px)';
    this.rumorEl.hidden = true;
    this.rumorEl.innerHTML = `<div class="gb-arr" style="color:#ffcf2e"><svg viewBox="0 0 24 24"><path d="M12 3l7 16-7-4-7 4z" fill="currentColor"/></svg></div><span></span>`;
    this.P.wrap.appendChild(this.rumorEl);
    this.evT = this.nextEvIn();
    // relâmpago → clarão + trovão (atrasado pela distância)
    this.offs.push(
      weather.on((e) => {
        if (e === 'lightning') {
          const d = 0.3 + Math.random() * 1.6;
          window.setTimeout(() => thunder(1 - d / 2.2), d * 1000);
        } else if (e === 'dusk') {
          if (this.sys.fuel && !g.guest) {
            notify(t('gb.rp.office', 'Anoiteceu: o escritório do ouro fechou. O caminhão volta às 6h!'), { icon: 'clock', ms: 4500 });
            this.officeNote = true;
          }
        } else if (e === 'dawn') {
          if (this.officeNote) notify(t('gb.rp.dawn', 'Bom dia! O escritório do ouro abriu.'), { icon: 'clock' });
          this.officeNote = false;
        } else if (e === 'sky' && weather.sky === 'storm' && s.diff >= 2) {
          this.say(t('gb.rp.stormNow', 'Temporal chegando! Cuidado com os raios.'), 'storm');
        }
      }),
    );
    // máquinas do save: diesel
    s.machines.forEach((_, i) => {
      const m = g.ms[i];
      if (m) this.fuel.set(m, this.st.fuel[i] ?? this.tank(m) * 0.8);
    });
    // viagem em andamento: avisa
    if (this.st.haul.trip) window.setTimeout(() => notify(t('gb.haul.resume', 'Viagem em andamento! Vá até o portão para continuar.'), { icon: 'car', ms: 4500 }), 2500);
  }

  /* ============================== cenário do acampamento ============================== */
  private freeSpot(w: World, cx: number, cz: number, r0: number, r1: number, clear: number, avoid: { x: number; z: number }[]): { x: number; z: number; a: number } {
    const m = w.map;
    const keep = [m.plant, m.stock, m.garage, m.mine, m.deposits[0], ...m.houses, ...avoid];
    const segd = (pts: { x: number; z: number }[], x: number, z: number) => {
      let best = 1e9;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const L2 = dx * dx + dz * dz || 1;
        const k = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / L2));
        best = Math.min(best, Math.hypot(x - a.x - dx * k, z - a.z - dz * k));
      }
      return best;
    };
    // ponto onde o garimpeiro nasce (perto da 1ª jazida)
    const d0 = m.deposits[0];
    const sa = Math.atan2(d0.x - m.camp.x, d0.z - m.camp.z);
    keep.push({ x: m.camp.x + Math.sin(sa) * 8, z: m.camp.z + Math.cos(sa) * 8 });
    for (let r = r0; r <= r1; r += 1.5)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + r * 0.37;
        const x = cx + Math.sin(a) * r;
        const z = cz + Math.cos(a) * r;
        if (x < 12 || z < 12 || x > 180 || z > 180) continue;
        if (keep.some((p) => Math.hypot(p.x - x, p.z - z) < clear + 4)) continue;
        if (segd(m.road, x, z) < clear + 3 || segd(m.gateRoad, x, z) < clear + 3) continue;
        let hit = false;
        w.near(x, z, (c) => {
          if (Math.hypot(c.x - x, c.z - z) < c.r + clear) hit = true;
        });
        if (hit) continue;
        if (w.waterY(x, z) > -1e8) continue;
        return { x, z, a };
      }
    return { x: cx + r1, z: cz, a: 0 };
  }
  private camp(w: World): void {
    const m = w.map;
    // longe do lugar onde máquinas novas aparecem (frente da garagem)
    const spawn: { x: number; z: number }[] = [];
    for (const ox of [-6, 0, 6, -12, 12, 18]) for (const oz of [13, 21]) spawn.push({ x: m.garage.x + ox, z: m.garage.z + oz });
    const pump = this.freeSpot(w, m.garage.x, m.garage.z, 9, 22, 3.2, spawn);
    this.pumpAt = pump;
    const pm = buildPump();
    pm.scale.setScalar(0.75);
    pm.position.set(pump.x, w.T.heightAt(pump.x, pump.z), pump.z);
    pm.rotation.y = Math.atan2(m.camp.x - pump.x, m.camp.z - pump.z) + Math.PI / 2;
    w.scene.add(pm);
    this.props.push(pm);
    w.addCircle({ x: pump.x + Math.sin(pm.rotation.y) * 0.9, z: pump.z + Math.cos(pm.rotation.y) * 0.9, r: 0.7 });
    w.addCircle({ x: pump.x - Math.sin(pm.rotation.y) * 0.9, z: pump.z - Math.cos(pm.rotation.y) * 0.9, r: 0.7 });
    const stall = this.freeSpot(w, m.camp.x, m.camp.z, 9, 16, 3.5, [pump, ...spawn]);
    this.stallAt = stall;
    const sh = buildShop(0xe8c27a, 0xd23a2a);
    sh.scale.setScalar(0.5);
    sh.position.set(stall.x, w.T.heightAt(stall.x, stall.z), stall.z);
    sh.rotation.y = Math.atan2(m.camp.x - stall.x, m.camp.z - stall.z);
    w.scene.add(sh);
    this.props.push(sh);
    w.addCircle({ x: stall.x, z: stall.z, r: 2.2 });
    // plaquinhas com ícone sobre os lugares
    this.tag(w, pump.x, pump.z, 4.2, 'pump');
    this.tag(w, stall.x, stall.z, 3.6, 'food');
    for (const h of m.houses.slice(0, 1)) this.tag(w, h.x, h.z, 6, 'bed');
    this.tag(w, m.gate.x, m.gate.z, 5, 'road');
  }
  private lamps(w: World): LampPost[] {
    const m = w.map;
    const out: LampPost[] = [];
    const avoid: { x: number; z: number }[] = [this.pumpAt, this.stallAt];
    for (const [cx, cz, r0] of [
      [m.camp.x, m.camp.z, 6],
      [m.plant.x, m.plant.z, 8],
      [this.pumpAt.x, this.pumpAt.z, 4],
      [m.stock.x, m.stock.z, 7],
      [m.camp.x, m.camp.z, 14],
    ] as [number, number, number][]) {
      const p = this.freeSpot(w, cx, cz, r0, r0 + 6, 1.2, avoid);
      avoid.push(p);
      out.push({ x: p.x, z: p.z, y: w.T.heightAt(p.x, p.z) });
      w.addCircle({ x: p.x, z: p.z, r: 0.3 });
    }
    return out;
  }
  /** ícone flutuante (sprite) para lugares de interação */
  private tag(w: World, x: number, z: number, y: number, ic: RIcon): void {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const img = new Image();
    img.onload = () => {
      const c = cv.getContext('2d')!;
      c.fillStyle = 'rgba(36,20,10,.78)';
      c.beginPath();
      c.arc(48, 48, 44, 0, 7);
      c.fill();
      c.strokeStyle = '#ffcf2e';
      c.lineWidth = 5;
      c.stroke();
      c.drawImage(img, 18, 18, 60, 60);
      tex.needsUpdate = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(RI[ic].replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" '));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.scale.setScalar(1.1);
    sp.position.set(x, w.T.heightAt(x, z) + y, z);
    sp.renderOrder = 8;
    w.scene.add(sp);
    this.props.push(sp);
  }

  /* ============================== utilidades ============================== */
  private tank(m: Machine): number {
    return TANK[m.kind]?.[0] ?? 0;
  }
  get diff(): number {
    return this.g.sv!.diff;
  }
  private get solo(): boolean {
    return !this.g.mp;
  }
  private say(text: string, icon: RIcon | null = null): void {
    notify(text, { icon: icon === 'storm' ? 'bolt' : icon === 'food' ? 'food' : icon === 'bed' ? 'bed' : 'target', ms: 4500 });
    speak(text, { gap: 600 });
  }
  /** gasta do dinheiro do time (convidado pede ao anfitrião) */
  spend(n: number): boolean {
    const s = this.g.sv!;
    if (n <= 0) return true;
    if (s.money < n) return false;
    s.money -= n;
    if (this.g.guest) this.g.mp?.net.send({ t: 'rpa', k: 'pay', n });
    return true;
  }
  private earn(n: number): void {
    if (n <= 0) return;
    this.g.sv!.money += n;
    if (this.g.guest) this.g.mp?.net.send({ t: 'rpa', k: 'pay', n: -n });
  }
  private nextEvIn(): number {
    return (1 / this.sys.evRate) * (0.6 + Math.random() * 0.8);
  }
  private item(id: ItemId): number {
    return this.st.inv[id] ?? 0;
  }
  addItem(id: ItemId, n: number): void {
    const v = Math.max(0, this.item(id) + n);
    if (v) this.st.inv[id] = v;
    else delete this.st.inv[id];
  }
  get kg(): number {
    return invKg(this.st);
  }
  get cap(): number {
    return capKg(this.st.str.lvl);
  }
  private needsOn(): boolean {
    return this.sys.needs;
  }
  energyLow(): boolean {
    return this.st.needs.energy < 55;
  }

  /* ============================== ganchos ============================== */
  /** logo após ler o controle (antes das máquinas andarem) */
  pre(dt: number, ctl: Ctl): void {
    const g = this.g;
    const s = g.sv!;
    const cur = g.cur!;
    const wk = g.worker!;
    if (this.hw) return;
    // botão de chuva do HUD = forçar o tempo (anfitrião/sozinho)
    if (!g.guest && g.rainOn !== this.lastRain) weather.force(g.rainOn ? (s.diff >= 2 && weather.storm > 0.3 ? 'storm' : 'rain') : 'clear', 3);
    // força do braço na pá
    const base = g.shovelPow();
    if (base !== this.lastDigBase) this.lastDigBase = base;
    wk.digPow = base * digMul(this.st.str.lvl);
    // necessidades / peso: anda mais devagar
    if (cur === wk && !g.inMine) {
      let k = 1;
      if (this.sys.weight) {
        const over = this.kg / this.cap;
        if (over > 1) k *= Math.max(0.42, 1 - (over - 1) * 1.3);
      }
      if (this.needsOn()) {
        const n = this.st.needs;
        const worst = Math.min(n.food, n.water, n.energy);
        if (worst < 22) k *= 0.7 + (worst / 22) * 0.3;
        if (n.stam < 8) k *= 0.75;
      }
      ctl.mx *= k;
      ctl.my *= k;
      // fôlego: sem fôlego não cava
      if (this.needsOn() && ctl.act && this.st.needs.stam < 4) {
        ctl.act = false;
        this.staminaNote -= dt;
        if (this.staminaNote <= 0) {
          this.staminaNote = 6;
          notify(t('gb.rp.noStam', 'Sem fôlego! Respire um pouquinho.'), { icon: 'heart', kind: 'warn' });
        }
      }
      // carrinho cheio + cavar: enche um saco na mochila (difícil+)
      if (this.sys.weight && ctl.act && wk.cargo.vol >= wk.cargo.cap - 1e-3 && wk.water <= 0 && this.kg + ITEMS.saco.kg <= this.cap * 1.6) {
        const k2 = SACK_VOL / Math.max(1e-6, wk.cargo.vol);
        const gold = wk.cargo.gold * k2;
        wk.cargo.vol -= SACK_VOL;
        wk.cargo.gold -= gold;
        this.lastVol = wk.cargo.vol;
        this.addItem('saco', 1);
        this.st.sackGold += gold;
        this.hud.pop([['bag', 1]]);
        sfx.pick();
      }
      // na moega com o carrinho vazio: despeja os sacos
      if (ctl.act2 && this.item('saco') > 0 && wk.cargo.vol < 0.01 && wk.pos.distanceTo(g.hopperPos(_v)) < 6) this.dumpSacks();
    }
    // diesel: sem diesel o motor apaga (o meu e o dos amigos)
    if (this.sys.fuel) {
      const empty = (m: Machine) => (g.guest ? (this.guestFuel[g.ms.indexOf(m)] ?? 1) <= 0 : (this.fuel.get(m) ?? 1) <= 0);
      if (cur !== wk && empty(cur)) {
        ctl.gas = 0;
        ctl.brake = cur.veh && cur.veh.gear < 0 ? 0 : ctl.brake;
        if (cur instanceof Heli) {
          ctl.up = false;
          ctl.down = true;
        }
      }
      const host = g.host;
      if (host) for (const m of g.ms) if (empty(m)) {
        const seat = host.seat(m);
        if (seat) {
          seat.ctl.gas = 0;
          seat.ctl.up = false;
        }
      }
    }
    // escritório do ouro fechado à noite (normal+)
    if (this.sys.fuel && !g.guest && !weather.workHours && this.P.exp.st === 0) s.exportT = Math.max(s.exportT, 1.5);
  }

  private dumpSacks(): void {
    const g = this.g;
    const n = this.item('saco');
    const vol = n * SACK_VOL;
    const gold = this.st.sackGold;
    if (g.guest) g.mp?.net.send({ t: 'rpa', k: 'sack', v: vol, g: gold });
    else g.hopperRecv.take(vol, gold);
    this.addItem('saco', -n);
    this.st.sackGold = 0;
    sfx.splat();
    this.hud.pop([['bag', -n], ['gold', gold, gold.toFixed(1) + ' g']]);
  }

  /** fim do present(): clima, céu, necessidades, diesel, ações, eventos, HUD */
  post(dt: number): void {
    const g = this.g;
    if (this.hw) return;
    const s = g.sv!;
    const w = g.w!;
    const cur = g.cur!;
    const wk = g.worker!;
    if (!g.guest) {
      weather.step(dt);
      // a chuva do jogo segue o clima
      const want = weather.rain > 0.35;
      if (g.rainOn !== want) {
        g.rainOn = want;
        g.hud?.setRainIcon(want);
      }
    } else weather.step(dt);
    this.lastRain = g.rainOn;
    this.net(dt);
    this.sky.apply(dt, w.camera, g.ms, g.inMine ? null : cur, wk, this.P.rainK, g.time);
    if (this.flashHold > 0) {
      this.flashHold -= dt;
      weather.flash = Math.max(weather.flash, 0.7);
    }
    this.hud.flash(weather.flash);
    const hours = (dt * 24) / (weather.dayLen * 60);
    // ---- necessidades ----
    const n = this.st.needs;
    const r = this.sys.rate;
    const moving = cur === wk ? wk.speedNow > 0.3 : false;
    const digging = cur === wk && wk.cargo.vol > this.lastVol + 1e-5;
    if (this.needsOn() && !this.fading) {
      n.food = Math.max(0, n.food - hours * 4.2 * r);
      n.water = Math.max(0, n.water - hours * 5.6 * r * (1 + weather.heat * 0.8));
      n.energy = Math.max(0, n.energy - hours * (3.2 + (digging ? 2 : 0)) * r);
      const smax = stamMax(this.st.str.lvl);
      if (digging) n.stam = Math.max(0, n.stam - dt * 7 * r);
      else if (moving && this.kg > this.cap) n.stam = Math.max(0, n.stam - dt * 3.5 * r);
      else n.stam = Math.min(smax, n.stam + dt * (n.energy > 10 ? 9 : 3));
      const worst = Math.min(n.food, n.water, n.energy);
      this.hud.vignette(worst < 25 ? ((25 - worst) / 25) * 0.85 : 0, worst < 9 && this.P.gov.tier >= 2);
      if (worst <= 0 && !this.fading) void this.faint();
      // avisos de voz (uma vez por faixa)
      this.warn('food', n.food, t('gb.rp.hungry', 'Estou com fome! Compre uma marmita no acampamento.'));
      this.warn('water', n.water, t('gb.rp.thirsty', 'Que sede! Beba água na barraca ou no lago.'));
      this.warn('energy', n.energy, t('gb.rp.sleepy', 'Que sono... Durma na casa do acampamento.'));
    } else this.hud.vignette(0, false);
    // ---- força (XP) ----
    if (cur === wk && !g.inMine) {
      if (digging) this.xp((wk.cargo.vol - this.lastVol) * 110);
      if (moving && this.kg > 5) this.xp(wk.speedNow * dt * this.kg * 0.0035);
    }
    this.lastVol = wk.cargo.vol;
    this.lastPos.copy(wk.group.position);
    // ---- diesel ----
    if (this.sys.fuel && !g.guest) this.burn(dt);
    // ---- ouro: bônus da noite e preço especial ----
    if (!g.guest) {
      const dSt = s.stock - this.lastStock;
      if (dSt > 0 && weather.isNight && this.sys.fuel) {
        s.stock += dSt * 0.1;
        this.nightBonusT -= dt;
        if (this.nightBonusT <= 0) {
          this.nightBonusT = 12;
          this.hud.pop([['moon', 10, '+10%']]);
        }
      }
      if (s.sold > this.lastSold && this.priceBoost) {
        const bonus = Math.round((s.sold - this.lastSold) * GOLD_PRICE[s.diff] * this.priceBoost);
        s.money += bonus;
        notify(bonus >= 0 ? t('gb.rp.priceBonus', 'Preço especial: +{n}', { n: bonus }) : t('gb.rp.priceLoss', 'Preço baixo: {n}', { n: bonus }), { icon: 'coins' });
        this.priceBoost = 0;
      }
    }
    this.lastStock = s.stock;
    this.lastSold = s.sold;
    // ---- HUD ----
    const vis = !this.P.paused || !!g.mp;
    if (vis !== this.lastHudVis) {
      this.lastHudVis = vis;
      this.hud.setVisible(vis);
    }
    this.hud.clock();
    const fuelK = this.sys.fuel && cur !== wk && this.tank(cur) > 0 ? (g.guest ? this.guestFuel[g.ms.indexOf(cur)] ?? 1 : (this.fuel.get(cur) ?? 0) / this.tank(cur)) : null;
    const show = (v: number) => (this.needsOn() && (v < 70 || this.nearStall()) ? v / 100 : null);
    this.hud.meters(
      {
        food: show(n.food),
        water: show(n.water),
        energy: show(n.energy),
        stam: this.needsOn() && n.stam < stamMax(this.st.str.lvl) - 3 ? n.stam / stamMax(this.st.str.lvl) : null,
        fuel: fuelK,
        kg: this.sys.weight && cur === wk && this.kg > 3 ? [this.kg, this.cap] : null,
      },
      this.sys.weight && this.kg > this.cap,
    );
    this.hud.actions(g.inMine || this.P.paused ? [] : this.actions());
    this.rumorStep();
    if (this.lvlPending && !this.hud.cardOpen && !this.P.paused) {
      bigMoment(t('gb.rp.lvlUp', 'Força nível {n}!', { n: this.lvlPending }), { icon: 'trophy', sub: t('gb.rp.lvlSub', 'Carrega mais e cava mais rápido') });
      sfx.yay();
      speak(t('gb.rp.lvlUp', 'Força nível {n}!', { n: this.lvlPending }), { gap: 300 });
      this.lvlPending = 0;
    }
    // ---- eventos ----
    if (!this.hud.cardOpen && !g.inMine && !this.P.paused && !this.fading) {
      this.evT -= hours;
      if (this.evT <= 0) {
        this.evT = this.nextEvIn();
        const loc: Loc = Math.hypot(cur.pos.x - w.map.camp.x, cur.pos.z - w.map.camp.z) < 32 ? 'camp' : 'mine';
        void this.event({ loc });
      }
    }
  }

  private warned: Record<string, number> = {};
  private warn(k: string, v: number, text: string): void {
    const band = v < 10 ? 2 : v < 25 ? 1 : 0;
    if (band > (this.warned[k] ?? 0)) {
      this.say(text, k === 'energy' ? 'bed' : 'food');
      if (band === 2) audio.fail();
    }
    this.warned[k] = band;
  }

  private xp(n: number): void {
    const S = this.st.str;
    if (S.lvl >= STR_MAX) return;
    S.xp += n;
    if (S.xp >= xpNeed(S.lvl)) {
      S.xp -= xpNeed(S.lvl);
      S.lvl++;
      this.lvlPending = S.lvl;
      this.st.needs.stam = stamMax(S.lvl);
    }
  }

  /** consumo de diesel das máquinas ligadas; ajudantes abastecem sozinhos (cobra do caixa) */
  private burn(dt: number): void {
    const g = this.g;
    const s = g.sv!;
    for (const m of g.ms) {
      const T = TANK[m.kind];
      if (!T) continue;
      if (!this.fuel.has(m)) this.fuel.set(m, T[0]);
      const bot = g.drivers.find((d) => d.truck === m);
      const on = m === g.cur || !!bot || !!g.host?.seat(m);
      if (!on) continue;
      const v = m.veh;
      const load = v ? Math.max(v.input.gas, v.rpm * 0.6) : m instanceof Heli ? (m.alt > 0.3 ? 0.75 : 0.25) : 0;
      const use = T[1] * (0.12 + 0.88 * load) * (1 + m.fill * 0.4) * this.sys.rate * dt;
      const f = Math.max(0, (this.fuel.get(m) ?? 0) - use);
      this.fuel.set(m, f);
      if (bot && f < T[0] * 0.2) {
        const L = T[0] - f;
        const cost = Math.ceil(L * this.sys.diesel);
        if (s.money >= cost) {
          s.money -= cost;
          this.fuel.set(m, T[0]);
        }
      }
      if (m === g.cur && f <= 0 && !this.outNoted) {
        this.outNoted = true;
        this.say(t('gb.rp.noFuel', 'Acabou o diesel! Use um galão ou chame socorro.'), null);
        audio.fail();
      }
      if (m === g.cur && f > 0) this.outNoted = false;
    }
  }
  private outNoted = false;

  private atWater(): boolean {
    const w = this.g.w!;
    const gp = this.g.worker!.group;
    const x = gp.position.x + Math.sin(gp.rotation.y) * 1.3;
    const z = gp.position.z + Math.cos(gp.rotation.y) * 1.3;
    return w.waterY(x, z) > w.T.heightAt(x, z) + 0.15;
  }
  get sv(): SlotSave {
    return this.g.sv!;
  }
  private nearStall(): boolean {
    const c = this.g.cur!.pos;
    return Math.hypot(c.x - this.stallAt.x, c.z - this.stallAt.z) < 7;
  }

  /** botões do lugar */
  private actions(): Action[] {
    const g = this.g;
    const s = g.sv!;
    const cur = g.cur!;
    const wk = g.worker!;
    const p = cur.pos;
    const out: Action[] = [];
    const dist = (q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);
    const m = g.w!.map;
    const foot = cur === wk;
    // diesel
    if (this.sys.fuel && !foot && TANK[cur.kind]) {
      const f = g.guest ? (this.guestFuel[g.ms.indexOf(cur)] ?? 1) * this.tank(cur) : this.fuel.get(cur) ?? 0;
      const need = this.tank(cur) - f;
      if (dist(this.pumpAt) < (cur instanceof Heli ? 12 : 9) && need > 2) {
        const price = Math.ceil(need * this.sys.diesel);
        out.push({ id: 'fuel', icon: 'pump', label: t('gb.rp.refuel', 'Abastecer'), sub: ['coin', String(price)], run: () => this.refuel(cur, price, need) });
      }
      if (f <= 0.5) {
        if (this.item('jerry') > 0) out.push({ id: 'jerry', icon: 'jerry', label: t('gb.rp.useJerry', 'Usar galão'), sub: ['fuel', '20 L'], cls: 'green', run: () => this.useJerry(cur) });
        const fee = scaleMoney(-120, s.diff) * -1;
        out.push({ id: 'tow', icon: 'sos', label: t('gb.rp.callHelp', 'Chamar socorro'), sub: ['coin', String(fee)], cls: 'blue', run: () => this.towMachine(cur, fee) });
      }
    }
    if (foot) {
      if (this.sys.fuel && dist(this.pumpAt) < 5 && this.item('jerry') < 3) out.push({ id: 'jfill', icon: 'jerry', label: t('gb.rp.buyJerry', 'Galão de diesel'), sub: ['coin', String(ITEMS.jerry.price)], run: () => this.buy('jerry', ITEMS.jerry.price, false) });
      if (dist(this.stallAt) < 6) {
        out.push({ id: 'eat', icon: 'food', label: t('gb.rp.eat', 'Comer'), sub: ['coin', String(ITEMS.marmita.price)], run: () => this.eatMeal() });
        out.push({ id: 'drink', icon: 'water', label: t('gb.rp.drink', 'Beber água'), run: () => this.drink(true) });
        out.push({ id: 'shop', icon: 'cart', label: t('gb.rp.shop', 'Mercadinho'), cls: 'blue', run: () => this.openShop() });
      } else if (this.needsOn() && this.atWater()) out.push({ id: 'drink', icon: 'water', label: t('gb.rp.drink', 'Beber água'), run: () => this.drink(false) });
      const house = m.houses.find((h) => dist(h) < 6.5);
      if (house && (weather.isNight || (this.needsOn() && this.energyLow()))) out.push({ id: 'sleep', icon: 'bed', label: t('gb.rp.sleep', 'Dormir'), cls: 'blue', run: () => void this.sleep(null) });
      else if (house && this.needsOn() && this.st.needs.energy < 90) out.push({ id: 'rest', icon: 'bed', label: t('gb.rp.rest', 'Descansar'), cls: 'blue', run: () => void this.sleep(1) });
    }
    // portão: estrada (a pé ou em qualquer máquina)
    if (dist(m.gate) < 16) out.push({ id: 'road', icon: 'road', label: this.st.haul?.trip ? t('gb.haul.continue', 'Continuar viagem') : t('gb.haul.road', 'Estrada'), cls: 'green', run: () => this.openFreight() });
    return out;
  }

  private refuel(m: Machine, price: number, need: number): void {
    if (!this.spend(price)) {
      notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
      return;
    }
    if (this.g.guest) this.g.mp?.net.send({ t: 'rpa', k: 'fuel', m: this.g.ms.indexOf(m) });
    else this.fuel.set(m, (this.fuel.get(m) ?? 0) + need);
    sfx.water();
    this.hud.pop([['fuel', need, '+' + Math.round(need) + ' L']]);
  }
  private useJerry(m: Machine): void {
    this.addItem('jerry', -1);
    if (this.g.guest) this.g.mp?.net.send({ t: 'rpa', k: 'jerry', m: this.g.ms.indexOf(m) });
    else this.fuel.set(m, Math.min(this.tank(m), (this.fuel.get(m) ?? 0) + 20));
    sfx.water();
    this.hud.pop([['jerry', -1], ['fuel', 20, '+20 L']]);
  }
  private towMachine(m: Machine, fee: number): void {
    if (!this.spend(fee)) {
      notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
      return;
    }
    if (this.g.guest) {
      this.g.mp?.net.send({ t: 'rpa', k: 'tow', m: this.g.ms.indexOf(m) });
      return;
    }
    this.doTow(m);
  }
  private doTow(m: Machine): void {
    const w = this.g.w!;
    const a = Math.atan2(w.map.camp.x - this.pumpAt.x, w.map.camp.z - this.pumpAt.z);
    const x = this.pumpAt.x + Math.sin(a) * 6;
    const z = this.pumpAt.z + Math.cos(a) * 6;
    if (m.veh) m.veh.place(x, z, a, w.T);
    else if (m instanceof Heli) m.place(x, z, a, w);
    this.fuel.set(m, Math.max(this.fuel.get(m) ?? 0, 30));
    weather.advance(0.5);
    sfx.thunk();
    this.say(t('gb.rp.towed', 'O socorro trouxe a máquina até a bomba de diesel.'), null);
  }
  private buy(id: ItemId, price: number, quiet: boolean): boolean {
    if (this.sys.weight && this.kg + ITEMS[id].kg > this.cap * 1.5) {
      notify(t('gb.rp.tooHeavy', 'Mochila pesada demais!'), { icon: 'warning', kind: 'warn' });
      return false;
    }
    if (!this.spend(price)) {
      notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
      return false;
    }
    this.addItem(id, 1);
    if (!quiet) this.hud.pop([[ITEMS[id].icon, 1], ['coin', -price]]);
    audio.coin(1);
    return true;
  }
  /** come na hora (marmita da barraca) */
  eatMeal(): void {
    const n = this.st.needs;
    if (n.food > 92 && this.needsOn()) {
      if (this.buy('marmita', ITEMS.marmita.price, false)) notify(t('gb.rp.toBag', 'Está cheio: a marmita foi para a mochila.'), { icon: 'bag' });
      return;
    }
    if (!this.spend(ITEMS.marmita.price)) {
      notify(t('gb.noMoney', 'Sem dinheiro'), { icon: 'coin', kind: 'warn' });
      return;
    }
    n.food = Math.min(100, n.food + 45);
    n.energy = Math.min(100, n.energy + 5);
    sfx.eat();
    this.hud.pop([['food', 45], ['coin', -ITEMS.marmita.price]]);
  }
  private drink(tap: boolean): void {
    const n = this.st.needs;
    n.water = Math.min(100, n.water + 40);
    sfx.water();
    this.hud.pop([['water', 40]]);
    if (tap && this.needsOn() && this.item('agua') < 2 && this.spend(ITEMS.agua.price)) {
      this.addItem('agua', 1);
      this.hud.pop([['water', 1, t('gb.rp.bottle', '+1 garrafa')]]);
    }
  }
  /** usar um item da mochila */
  use(id: ItemId): void {
    const n = this.st.needs;
    if (this.item(id) <= 0) return;
    if (id === 'marmita' || id === 'lanche') {
      const v = id === 'marmita' ? 45 : 20;
      n.food = Math.min(100, n.food + v);
      this.addItem(id, -1);
      sfx.eat();
      this.hud.pop([['food', v]]);
    } else if (id === 'agua') {
      n.water = Math.min(100, n.water + 35);
      this.addItem(id, -1);
      sfx.water();
      this.hud.pop([['water', 35]]);
    } else if (id === 'jerry') {
      const cur = this.g.cur!;
      if (cur !== this.g.worker && TANK[cur.kind]) this.useJerry(cur);
      else notify(t('gb.rp.jerryHint', 'Entre na máquina para pôr o diesel do galão.'), { icon: 'warning' });
    }
  }

  /** dormir (null = até de manhã), descansar (h>0) ou viajar pulando (h<0) */
  async sleep(h: number | null): Promise<void> {
    if (this.fading) return;
    if (this.g.mp && h !== null && h < 0) return;
    this.fading = true;
    const travel = h !== null && h < 0;
    this.hud.fade(true, travel ? 'ff' : 'sleep', travel ? t('gb.haul.skipping', 'Viajando...') : h === null ? t('gb.rp.sleeping', 'Dormindo... Zzz') : t('gb.rp.resting', 'Descansando...'));
    sfx.whoosh();
    await new Promise((r) => window.setTimeout(r, 1600));
    const n = this.st.needs;
    // no multijogador o relógio é do anfitrião: convidado só recupera o sono
    let dh = 0;
    if (!this.g.guest) {
      if (h === null) dh = weather.skipTo(6);
      else {
        dh = Math.abs(h);
        weather.advance(dh);
      }
    } else dh = h === null ? 8 : Math.abs(h);
    if (this.needsOn()) {
      if (!travel) n.energy = h === null ? 100 : Math.min(100, n.energy + dh * 12);
      else n.energy = Math.max(0, n.energy - dh * 3.2 * this.sys.rate);
      n.food = Math.max(8, n.food - dh * (h === null ? 1.6 : 4.2) * this.sys.rate);
      n.water = Math.max(8, n.water - dh * (h === null ? 2 : 5.6) * this.sys.rate);
      n.stam = stamMax(this.st.str.lvl);
    }
    this.hud.fade(false);
    this.fading = false;
    if (!travel) this.say(h === null ? t('gb.rp.morning', 'Bom dia! Hora de garimpar.') : t('gb.rp.rested', 'Descansado!'), null);
    this.evT = Math.max(this.evT, 0.5);
  }

  /** desmaio: acorda no acampamento sem um pouco de dinheiro */
  private async faint(): Promise<void> {
    if (this.fading) return;
    this.fading = true;
    const g = this.g;
    const s = g.sv!;
    this.hud.fade(true, 'sos', t('gb.rp.fainted', 'Você desmaiou...'));
    audio.fail();
    await new Promise((r) => window.setTimeout(r, 2200));
    const lose = Math.min(Math.round(s.money * 0.05), [0, 80, 150, 250][s.diff]);
    if (lose > 0) this.spend(lose);
    this.st.faints++;
    if (g.cur !== g.worker) g.enterExit();
    const h = g.w!.map.houses[0] ?? g.w!.map.camp;
    g.worker!.place(h.x + 4, h.z + 4, 0, g.w!);
    const n = this.st.needs;
    n.food = Math.max(n.food, 45);
    n.water = Math.max(n.water, 45);
    n.energy = Math.max(n.energy, 50);
    n.stam = stamMax(this.st.str.lvl);
    if (!g.guest) weather.advance(3);
    this.hud.fade(false);
    this.fading = false;
    this.warned = {};
    this.say(t('gb.rp.wakeCamp', 'Acordou no acampamento. Coma, beba e durma direitinho!'), 'bed');
    if (lose > 0) this.hud.pop([['coin', -lose]]);
  }

  /* ============================== boato (seta) ============================== */
  private rumorStep(): void {
    const r = this.rumor;
    const g = this.g;
    if (!r || g.inMine) {
      this.rumorEl.hidden = true;
      return;
    }
    const p = g.cur!.pos;
    const d = Math.hypot(r.x - p.x, r.z - p.z);
    if (d < 6 || weather.day * 24 + weather.hour > r.until) {
      this.rumor = null;
      this.rumorEl.hidden = true;
      if (d < 6) this.say(t('gb.rp.rumorHere', 'É aqui! Use o detector e cave.'), null);
      return;
    }
    this.rumorEl.hidden = false;
    const a = Math.atan2(r.x - p.x, r.z - p.z) - g.camYawNow;
    (this.rumorEl.firstElementChild as HTMLElement).style.transform = `rotate(${-a}rad)`;
    const sp = this.rumorEl.querySelector('span')!;
    const tx = Math.round(d) + ' m';
    if (sp.dataset.k !== tx) {
      sp.dataset.k = tx;
      sp.innerHTML = RI.rumor.replace('<svg ', '<svg style="width:20px;height:20px;vertical-align:-5px" ') + ' ' + tx;
    }
  }
  private setRumor(): void {
    const m = this.g.w!.map;
    const T = this.g.w!.T;
    // jazida que ainda tem ouro (a mais rica perto da superfície)
    let best = m.deposits[1] ?? m.deposits[0];
    let bv = -1;
    for (const d of m.deposits.slice(1)) {
      const k = T.idx(d.x, d.z);
      const v = T.oreR[k] * (Math.random() * 0.6 + 0.7);
      if (v > bv) {
        bv = v;
        best = d;
      }
    }
    this.rumor = { x: best.x, z: best.z, until: weather.day * 24 + weather.hour + 24 };
  }

  /* ============================== eventos ============================== */
  private vehOf(m: Machine): Veh {
    if (m === this.g.worker) return 'foot';
    if (m instanceof Heli) return 'heli';
    if (m instanceof Pickup) return 'light';
    return 'heavy';
  }
  /** monta o contexto, sorteia, mostra o cartão e aplica (await até fechar) */
  async event(c: Partial<Ctx>, forced?: Concrete): Promise<void> {
    const g = this.g;
    const s = g.sv!;
    const n = this.st.needs;
    const trip = this.hw?.trip;
    const ctx: Ctx = {
      loc: c.loc ?? 'camp',
      night: weather.isNight,
      sky: weather.sky,
      diff: s.diff,
      veh: c.veh ?? this.vehOf(g.cur!),
      spooky: !!this.st.opt.spooky,
      heat: weather.heat > 0.2,
      dry: weather.drySpell >= 2,
      tired: this.needsOn() && n.energy < 35,
      hungry: this.needsOn() && n.food < 35,
      over: this.hw ? this.hw.rig.loadT > COMBOS[trip!.combo].cap * 0.95 || this.hw.rig.dmg > 50 : this.sys.weight && this.kg > this.cap,
      stock: s.stock > 20,
      trip: !!this.hw,
      dawn: weather.hour > 5.3 && weather.hour < 7.2,
      lowFuel: this.hw ? trip!.fuel < RIG_TANK * 0.3 : false,
    };
    const now = weather.day * 24 + weather.hour;
    let ev = forced ?? pick(ctx, this.sys.gentle, this.st.ev.cd, this.st.ev.recent, now, this.rnd);
    // convidado: eventos do time são do anfitrião
    if (ev && g.guest && ev.tp.team) ev = null;
    if (!ev) return;
    this.st.ev.cd[ev.tp.id] = now;
    this.st.ev.recent.push(ev.tp.id);
    if (this.st.ev.recent.length > 12) this.st.ev.recent.shift();
    this.st.ev.n++;
    // evento do time: avisa os amigos
    if (ev.tp.team && g.host && g.host.peers.size) g.mp!.net.send({ t: 'rp', ev: ev.key });
    const wasPaused = this.P.paused;
    if (this.solo && !this.hw) this.P.paused = true;
    if (ev.tp.cat === 'spooky' && ev.tp.id === 'howl') howl();
    const can = (ch: Choice) => (!ch.need || this.item(ch.need) > 0) && (!ch.cost || g.sv!.money >= scaleMoney(-ch.cost, s.diff) * -1);
    const k = await this.hud.card(ev, s.diff, can, true);
    const ch = ev.tp.ch(ev.ctx, ev.v)[k];
    if (ch.cost) this.spend(scaleMoney(-ch.cost, s.diff) * -1);
    const good = ch.p === undefined || this.rnd() < ch.p;
    const fx = good ? ch.ok : ch.bad ?? ch.ok;
    this.apply(fx);
    await this.hud.result(fx, good, s.diff, true);
    if (this.solo && !this.hw && !wasPaused) {
      this.P.paused = false;
      (g as unknown as { last: number }).last = performance.now();
    }
  }
  private apply(fx: Fx): void {
    const g = this.g;
    const s = g.sv!;
    const n = this.st.needs;
    if (fx.m) {
      const v = scaleMoney(fx.m, s.diff);
      if (v > 0) this.earn(v);
      else this.spend(Math.min(-v, Math.max(0, s.money)));
    }
    if (fx.h) {
      if (!g.guest) weather.advance(fx.h);
      if (this.needsOn()) {
        n.food = Math.max(0, n.food - fx.h * 4.2 * this.sys.rate);
        n.water = Math.max(0, n.water - fx.h * 5.6 * this.sys.rate);
      }
    }
    const clamp = (v: number) => Math.max(0, Math.min(100, v));
    if (fx.food) n.food = clamp(n.food + fx.food);
    if (fx.water) n.water = clamp(n.water + fx.water);
    if (fx.energy) n.energy = clamp(n.energy + fx.energy);
    if (fx.stam) n.stam = Math.max(0, Math.min(stamMax(this.st.str.lvl), n.stam + fx.stam));
    if (fx.it) this.addItem(fx.it[0], fx.it[1]);
    if (fx.xp) this.xp(fx.xp);
    if (fx.gold) {
      if (g.guest) g.mp?.net.send({ t: 'rpa', k: 'gold', g: fx.gold });
      else s.stock += fx.gold;
    }
    if (fx.stockK && !g.guest) {
      const d = s.stock * fx.stockK;
      s.stock = Math.max(0, s.stock + d);
      if (fx.price && d < 0) {
        const pay = Math.round(-d * GOLD_PRICE[s.diff] * (1 + fx.price));
        s.money += pay;
        s.sold += -d;
        this.lastSold = s.sold;
        notify(t('gb.sold', 'Vendido! +{n}', { n: pay.toLocaleString('pt-BR') }), { icon: 'coins' });
        audio.cash();
      }
    } else if (fx.price) this.priceBoost = fx.price;
    if (fx.rumor) this.setRumor();
    if (fx.fire && !g.guest) g.fire?.ignite();
    if (fx.fog) weather.fog = 1;
    if (fx.sky && !g.guest) weather.force(fx.sky as SkyKind, 3);
    if (fx.heart) sfx.sparkle();
    // estrada
    const hw = this.hw;
    if (hw) {
      if (fx.dmg) hw.rig.dmg = Math.min(100, hw.rig.dmg + fx.dmg);
      if (fx.repair) hw.rig.dmg = 0;
      if (fx.cargoK) {
        hw.trip.gold *= 1 + fx.cargoK;
        hw.rig.loadT = hw.trip.gold / G_PER_T;
      }
      if (fx.fuel) hw.trip.fuel = Math.max(0, Math.min(RIG_TANK, hw.trip.fuel + fx.fuel * 3));
      if (fx.fill) {
        const need = RIG_TANK - hw.trip.fuel;
        const price = Math.ceil(need * this.sys.diesel * fx.fill);
        if (this.spend(price)) hw.trip.fuel = RIG_TANK;
      }
    } else {
      const cur = g.cur!;
      if (fx.fuel && this.fuel.has(cur)) this.fuel.set(cur, Math.max(0, Math.min(this.tank(cur), (this.fuel.get(cur) ?? 0) + fx.fuel)));
      if (fx.fill && this.fuel.has(cur)) {
        const need = this.tank(cur) - (this.fuel.get(cur) ?? 0);
        if (this.spend(Math.ceil(need * this.sys.diesel * fx.fill))) this.fuel.set(cur, this.tank(cur));
      }
    }
  }

  /* ============================== multijogador ============================== */
  private net(dt: number): void {
    const g = this.g;
    const mp = g.mp;
    if (mp !== this.netFor) {
      for (const f of this.netOff) f();
      this.netOff = [];
      this.netFor = mp;
      if (mp) {
        const net = mp.net;
        if (g.guest) {
          this.netOff.push(
            net.on('rp', (m) => {
              if (typeof m.h === 'number') {
                weather.hour = m.h;
                weather.day = m.d ?? weather.day;
                weather.sky = m.sk ?? weather.sky;
                weather.next = m.nx ?? weather.next;
                weather.drySpell = m.dr ?? 0;
                weather.heat = m.ht ?? 0;
                if (m.fl) weather.flash = 1;
                if (Array.isArray(m.fu)) this.guestFuel = m.fu;
              }
              if (typeof m.ev === 'string') {
                const ev = this.decode(m.ev);
                if (ev) this.hud.notice(ev);
              }
            }),
          );
        } else {
          this.netOff.push(
            net.on('rpa', (m) => {
              const s = g.sv!;
              const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
              if (m.k === 'pay') s.money = Math.max(0, s.money - Math.max(-2000, Math.min(5000, num(m.n))));
              else if (m.k === 'gold') s.stock += Math.max(0, Math.min(40, num(m.g)));
              else if (m.k === 'sack') g.hopperRecv.take(Math.max(0, Math.min(1, num(m.v))), Math.max(0, Math.min(200, num(m.g))));
              else if (m.k === 'fuel' || m.k === 'jerry' || m.k === 'tow') {
                const mc = g.ms[Math.round(num(m.m))];
                if (!mc) return;
                if (m.k === 'fuel') this.fuel.set(mc, this.tank(mc));
                else if (m.k === 'jerry') this.fuel.set(mc, Math.min(this.tank(mc), (this.fuel.get(mc) ?? 0) + 20));
                else this.doTow(mc);
              }
            }),
          );
          this.offs.push(weather.on((e) => e === 'lightning' && this.sendWx(true)));
        }
      }
    }
    if (mp && !g.guest) {
      this.netT -= dt;
      if (this.netT <= 0) {
        this.netT = 1;
        this.sendWx(false);
      }
    }
  }
  private sendWx(flash: boolean): void {
    const g = this.g;
    const host = g.host;
    if (!host || !host.peers.size) return;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    host.net.send({ t: 'rp', h: r2(weather.hour), d: weather.day, sk: weather.sky, nx: weather.next, dr: weather.drySpell, ht: r2(weather.heat), fl: flash ? 1 : 0, fu: g.ms.map((m) => r2((this.fuel.get(m) ?? this.tank(m)) / (this.tank(m) || 1))) });
  }
  private decode(key: string): Concrete | null {
    const [id, vk, loc, nd, sky, diff] = key.split('|');
    const tp = TEMPLATES.find((x) => x.id === id);
    if (!tp) return null;
    const v = tp.vars?.find((x) => x.k === vk) ?? null;
    const ctx: Ctx = { loc: loc as Loc, night: nd === 'n', sky: sky as SkyKind, diff: Number(diff) || 0, veh: 'foot', spooky: true };
    return { tp, v, ctx, key: keyOf(tp, v, ctx) };
  }

  /* ============================== telas ============================== */
  openBag(): void {
    const g = this.g;
    if (this.hud.cardOpen) return;
    const wasPaused = this.P.paused;
    if (this.solo) this.P.paused = true;
    bagScreen(this.P.wrap, this, () => {
      if (this.solo && !wasPaused) {
        this.P.paused = false;
        (g as unknown as { last: number }).last = performance.now();
      }
    });
  }
  private openShop(): void {
    const g = this.g;
    const wasPaused = this.P.paused;
    if (this.solo) this.P.paused = true;
    shopScreen(this.P.wrap, this, (id, price) => this.buy(id, price, true), () => {
      if (this.solo && !wasPaused) {
        this.P.paused = false;
        (g as unknown as { last: number }).last = performance.now();
      }
    });
  }
  setSpooky(on: boolean): void {
    this.st.opt.spooky = on;
  }
  setDayLen(min: number): void {
    this.st.opt.dayLen = min;
    weather.dayLen = min;
  }

  /* ============================== estrada ============================== */
  private openFreight(): void {
    const g = this.g;
    if (g.mp) {
      notify(t('gb.haul.solo', 'A estrada é só jogando sozinho (por enquanto).'), { icon: 'warning', kind: 'warn' });
      return;
    }
    const hs = this.st.haul!;
    if (hs.trip) {
      this.startHaul(hs.trip);
      return;
    }
    this.P.paused = true;
    freightScreen(this.P.wrap, this, hs, (dest, combo) => {
      const s = g.sv!;
      const cap = COMBOS[combo].cap * G_PER_T;
      const gold = Math.min(s.stock, cap);
      s.stock -= gold;
      const trip: Trip = { dest, combo, gold, s: 0, dmg: 0, day: weather.day, hour: weather.hour, fuel: Math.max(80, hs.fuel ?? RIG_TANK * 0.6), coupled: false, night: 0 };
      hs.trip = trip;
      this.startHaul(trip);
    }, () => {
      this.P.paused = false;
      (g as unknown as { last: number }).last = performance.now();
    });
  }
  /** compra cavalo/composição (chamado pela tela de fretes) */
  buyCombo(i: number): boolean {
    const hs = this.st.haul!;
    const price = Math.round(COMBOS[i].price * [0.6, 1, 1.15, 1.3][this.diff]);
    if (hs.owned !== i || !this.spend(price)) return false;
    hs.owned = i + 1;
    audio.cash();
    bigMoment(t('gb.bought', 'Comprou: {n}', { n: COMBOS[i].name() }), { icon: 'gift' });
    return true;
  }
  comboPrice(i: number): number {
    return Math.round(COMBOS[i].price * [0.6, 1, 1.15, 1.3][this.diff]);
  }
  private startHaul(trip: Trip): void {
    const g = this.g;
    if (g.cur !== g.worker) g.enterExit();
    this.g.hud?.setVisible(false);
    this.P.paused = false;
    this.hud.actions([]);
    this.hud.vignette(0, false);
    this.rumorEl.hidden = true;
    const self = this;
    this.hw?.dispose();
    this.hud.el.classList.add('road');
    this.hw = new Highway(
      {
        root: this.P.wrap,
        diff: g.sv!.diff,
        expert: () => g.sv!.expert,
        tier: this.P.gov.tier,
        seed: g.sv!.seed,
        money: () => g.sv!.money,
        spend: (n) => self.spend(n),
        dieselPrice: this.sys.diesel || 0,
        fuelOn: this.sys.fuel,
        event: (c) => self.event(c),
        actions: (l) => self.hud.actions(l as Action[]),
        sleep: (h) => self.sleep(h),
        eat: () => self.eatMeal(),
        energyLow: () => self.needsOn() && self.energyLow(),
        pause: () => self.haulPause(),
        arrive: () => self.deliver(),
        say: (s) => self.say(s, null),
      },
      trip,
    );
    this.evT = Math.max(this.evT, 99);
  }
  private haulPause(): void {
    const hw = this.hw;
    if (!hw) return;
    this.P.paused = true;
    const d = document.createElement('div');
    d.className = 'rp-scr';
    d.innerHTML = `<h2>${RI.truck}${t('gb.paused', 'Pausa')}</h2><div class="rp-sum"><span>${RI.pin}${DESTS[hw.trip.dest].name()}</span><span>${RI.road}${Math.max(0, (hw.road.L - hw.rig.s) / 1000).toFixed(1)} km</span></div>
      <button class="rp-go" data-c>${RI.ff}${t('gb.continue', 'Continuar')}</button>
      <button class="rp-go" data-b style="background:linear-gradient(#7c6a5a,#4a3a2e);border-color:#ddd">${RI.station}${t('gb.haul.backCamp', 'Voltar ao garimpo (a viagem fica salva)')}</button>`;
    this.P.wrap.appendChild(d);
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-c]')) {
        d.remove();
        this.P.paused = false;
      } else if (el.closest('[data-b]')) {
        d.remove();
        this.endHaul(false);
      }
    });
  }
  /** entrega: calcula o pagamento e mostra o resultado */
  private deliver(): void {
    const hw = this.hw!;
    const trip = hw.trip;
    const s = this.g.sv!;
    const dest = DESTS[trip.dest];
    const base = Math.round(trip.gold * GOLD_PRICE[s.diff] * dest.mul);
    const took = (weather.day - trip.day) * 24 + weather.hour - trip.hour;
    const onTime = took <= deadline(dest.km);
    const noDmg = hw.rig.dmg < 5;
    const night = trip.night > 40;
    const res: DeliveryResult = {
      dest: dest.name(),
      gold: trip.gold,
      base,
      onTime: onTime ? Math.round(base * 0.1) : 0,
      noDmg: noDmg ? Math.round(base * 0.1) : 0,
      night: night ? Math.round(base * 0.15) : 0,
      dmg: -Math.round(base * (hw.rig.dmg / 100) * 0.5),
      boost: this.priceBoost ? Math.round(base * this.priceBoost) : 0,
      total: 0,
      hours: took,
      stars: 1 + (onTime ? 1 : 0) + (noDmg ? 1 : 0),
    };
    res.total = Math.max(0, res.base + res.onTime + res.noDmg + res.night + res.dmg + res.boost);
    this.priceBoost = 0;
    s.money += res.total;
    s.sold += trip.gold;
    this.lastSold = s.sold;
    const hs = this.st.haul!;
    hs.deliveries++;
    hs.earned += res.total;
    hs.fuel = trip.fuel;
    this.xp(30 + trip.gold * 0.02);
    const unlocked = DESTS.find((d) => d.need === hs.deliveries);
    audio.cash();
    this.P.paused = true;
    resultScreen(this.P.wrap, res, unlocked ? unlocked.name() : null, () => this.endHaul(true));
  }
  /** volta para o garimpo (entregue ou só pausando a viagem) */
  private endHaul(done: boolean): void {
    const hw = this.hw;
    if (!hw) return;
    const hs = this.st.haul!;
    const g = this.g;
    if (done) {
      // volta de carona com o caminhão vazio (tempo passa)
      weather.advance(DESTS[hw.trip.dest].km * 0.12);
      hs.trip = null;
    } else {
      hs.trip = { ...hw.trip };
      hs.fuel = hw.trip.fuel;
    }
    hw.dispose();
    this.hw = null;
    this.hud.el.classList.remove('road');
    audio.engineSet(0, 0);
    const m = g.w!.map;
    const a = Math.atan2(m.camp.x - m.gate.x, m.camp.z - m.gate.z);
    g.worker!.place(m.gate.x + Math.sin(a) * 10, m.gate.z + Math.cos(a) * 10, a, g.w!);
    g.hud?.setVisible(true);
    this.P.paused = false;
    (g as unknown as { last: number }).last = performance.now();
    this.evT = this.nextEvIn();
    g.persist();
  }
  /** laço da estrada: roda no lugar do garimpo (true = tomou o quadro) */
  takeover(dt: number): boolean {
    const hw = this.hw;
    if (!hw) return false;
    const paused = this.P.paused || this.hud.cardOpen;
    if (!this.P.paused) weather.step(dt);
    // necessidades continuam
    if (!paused && this.needsOn()) {
      const hours = (dt * 24) / (weather.dayLen * 60);
      const n = this.st.needs;
      n.food = Math.max(0, n.food - hours * 3.5 * this.sys.rate);
      n.water = Math.max(0, n.water - hours * 4.5 * this.sys.rate);
      n.energy = Math.max(0, n.energy - hours * 3.8 * this.sys.rate);
      const worst = Math.min(n.food, n.water, n.energy);
      this.hud.vignette(worst < 25 ? ((25 - worst) / 25) * 0.85 : 0, false);
      this.warn('energy', n.energy, t('gb.haul.sleepy', 'Que sono... Pare numa parada para dormir.'));
      this.warn('food', n.food, t('gb.haul.hungry', 'Fome! Pare num posto para comer.'));
      if (worst <= 0) {
        n.food = Math.max(n.food, 30);
        n.water = Math.max(n.water, 30);
        n.energy = Math.max(n.energy, 30);
        hw.rig.v = 0;
        void this.sleep(2);
      }
    }
    hw.frame(dt, paused);
    this.hud.clock();
    this.hud.flash(weather.flash);
    const n = this.st.needs;
    const show = (v: number) => (this.needsOn() && v < 70 ? v / 100 : null);
    this.hud.meters({ food: show(n.food), water: show(n.water), energy: show(n.energy), stam: null, fuel: null, kg: null }, false);
    const r = this.P.r;
    if (r) {
      const W = this.P.wrap.clientWidth || 1;
      const H = this.P.wrap.clientHeight || 1;
      hw.render(r, W, H);
    }
    return true;
  }
  get onRoad(): boolean {
    return !!this.hw;
  }

  /* ============================== save ============================== */
  save(s: SlotSave): void {
    const st = this.st;
    st.wx = weather.save();
    st.fuel = this.g.ms.map((m) => Math.round((this.fuel.get(m) ?? this.tank(m)) * 10) / 10);
    if (this.hw && st.haul) {
      st.haul.trip = { ...this.hw.trip };
    }
    if (this.g.guest) saveGuest(st);
    else (s as SlotSave & { rp?: RpSave }).rp = st;
  }

  dispose(): void {
    for (const f of this.offs) f();
    for (const f of this.netOff) f();
    this.hw?.dispose();
    this.hw = null;
    this.hud.destroy();
    this.sky.dispose();
    this.rumorEl.remove();
    for (const p of this.props) p.removeFromParent();
    document.querySelectorAll('.rp-scr').forEach((e) => e.remove());
  }
  /* debug/testes */
  debug = {
    hour: (h: number) => {
      weather.hour = h;
    },
    sky: (k: SkyKind) => {
      weather.force(k, 6);
      weather.rain = k === 'rain' ? 0.7 : k === 'storm' ? 1 : 0;
      weather.storm = k === 'storm' ? 1 : 0;
      weather.cloud = k === 'clear' ? 0.05 : 1;
    },
    bolt: (hold = 0) => {
      weather.flash = 1;
      this.flashHold = hold;
      thunder(1);
    },
    event: (id: string, loc: Loc = 'camp', vi = 0) => {
      const tp = TEMPLATES.find((x) => x.id === id)!;
      const ctx: Ctx = { loc, night: weather.isNight, sky: weather.sky, diff: this.diff, veh: this.hw ? 'rig' : this.vehOf(this.g.cur!), spooky: true };
      const v = tp.vars ? tp.vars[vi] : null;
      void allowed;
      return this.event({ loc }, { tp, v, ctx, key: keyOf(tp, v, ctx) });
    },
    needs: (f: number, w: number, e: number) => Object.assign(this.st.needs, { food: f, water: w, energy: e }),
    fuel: (L: number) => this.fuel.set(this.g.cur!, L),
    item: (id: ItemId, n: number) => this.addItem(id, n),
    haul: (dest: number, combo: number, gold: number, s = 0, coupled = false, noEvents = false) => {
      this.st.haul!.owned = 4;
      const trip: Trip = { dest, combo, gold, s, dmg: 0, day: weather.day, hour: weather.hour, fuel: 400, coupled, night: 0 };
      this.st.haul!.trip = trip;
      this.startHaul(trip);
      if (noEvents && this.hw) this.hw.noEvents = true;
      return this.hw;
    },
    hw: () => this.hw,
    deliver: () => this.deliver(),
    freight: () => this.openFreight(),
    pump: () => this.pumpAt,
    stall: () => this.stallAt,
    xp: (n: number) => this.xp(n),
  };
}

/* convidado: guarda a mochila/força dele no aparelho dele */
const GUEST_KEY = 'bw-garimpo-rp-guest';
function loadGuest(): RpSave | undefined {
  try {
    return JSON.parse(localStorage.getItem(GUEST_KEY) || 'null') ?? undefined;
  } catch {
    return undefined;
  }
}
function saveGuest(s: RpSave): void {
  try {
    localStorage.setItem(GUEST_KEY, JSON.stringify({ ...s, haul: undefined, fuel: [], wx: undefined }));
  } catch {
    /* */
  }
}
