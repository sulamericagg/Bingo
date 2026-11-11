/* ============================================================
 *  GARIMPO BRUTO — CONSERTOS (quebras raras + minijogos de oficina).
 *
 *  API (documentada em docs/GARIMPO-REPAIR.md):
 *    g.repairs.breakdown(machine, kind)        quebra a máquina (anfitrião; convidado pede)
 *    g.repairs.open(kind, target, onDone, o)   abre o minijogo (target = Machine, Rig ou null)
 *    g.repairs.brakeFailure(target)            emergência de freio dirigindo (Machine ou Rig)
 *    g.repairs.fix(machine)                    conserta sem minijogo
 *    g.repairs.broken(machine)                 tipo da quebra atual (ou null)
 *    g.repairs.wear(machine)                   desgaste 0..100
 *  Também registra o gancho do RP (rp/breakdown.ts): eventos "pneu furado", "máquina
 *  quebrou"... abrem o minijogo certo.
 *
 *  Ganchos no jogo (cada um uma linha marcada "// CONSERTOS"): construtor, ctl() antes de
 *  m.update (efeitos no controle), step() depois do sync (anfitrião) / stepGuest, loja
 *  (shopHtml/isItem/buy), persist (save), teardown (dispose); mp.ts: retrato (netTake/
 *  netApply/netReset) e ação 'repair' do convidado; haul/level.ts + road.ts: rampas.
 *  Sem alocação por quadro: controles de rascunho por máquina, estado em arrays.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap as haptic } from '../../../core/haptics';
import { notify } from '../../../ui/notify';
import { speak } from '../../voo/voice';
import type { Garimpo } from '../game';
import { Excavator, Heli, newCtl, Truck, type Ctl, type Kind, type Machine } from '../machines';
import type { SlotSave } from '../save';
import { SIZE } from '../terrain';
import type { Rig } from '../haul/rig';
import { setBreakdownHook, type BreakKind as RpBreak } from '../rp/breakdown';
import { BrakeEmergency, EscapeBed, type BrakeTarget } from './brake';
import { openGame } from './games';
import { hwRepair } from './highway';
import { BREAK_KINDS, DIFF, freshMach, GRACE_S, kindsFor, loadSave, MECH_FEE, MECH_WAIT, PART_FOR, PART_IDS, PART_MAX, PART_PRICE, partArt, serviceFee, TOW_FEE, wearRate, type BreakKind, type Diff, type DiffCfg, type MachState, type PartId, type RepairSave } from './model';
import { BREAK_ICON, breakName, PART_ICON, partName, RIC } from './parts';
import { rs } from './sound';
import type { Overlay, VehLook } from './ui/overlay';

export type { BreakKind, RepairSave } from './model';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const COIN = '<svg viewBox="0 0 24 24" fill="none" stroke="#9a6400" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffcf2e"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4"/></svg>';
const LOOK: Record<string, [string, string]> = {
  pickup: ['#1f8f8a', '#0f5652'],
  truck: ['#e8651e', '#9c3c0c'],
  excavator: ['#f2b20f', '#a87708'],
  dozer: ['#f2b20f', '#a87708'],
  heli: ['#d23a2a', '#7e1a12'],
  rig: ['#d23a2a', '#7e1a12'],
};
const _fw = new THREE.Vector3();

export interface OpenOpts {
  /** não pede peça (o evento já cobrou / guincho) */
  free?: boolean;
}

export class Repairs {
  readonly st: RepairSave;
  private diff: Diff;
  private cfg: DiffCfg;
  readonly emg: BrakeEmergency;
  private emgM: Machine | null = null;
  private emgRig: Rig | null = null;
  private bed: EscapeBed | null = null;
  private bedT = 0;
  private ov: Overlay | null = null;
  private scratch = new WeakMap<Machine, Ctl>();
  private fixBtn: HTMLButtonElement;
  private lamp: HTMLDivElement;
  private uiKey = '';
  private wrap: HTMLElement;
  /** mecânico a caminho: índice da máquina → segundos */
  private mech = new Map<number, number>();
  /** convidado: estado vindo do anfitrião */
  private netB: number[] = [];
  private ver = 1;
  private sentVer = -1;
  private netT = 0;
  /** freio da carreta (estrada) quebrado depois da emergência */
  hwBroken = false;
  private flatDone = new WeakMap<Machine, number>();

  constructor(
    private g: Garimpo,
    s: SlotSave,
  ) {
    this.st = loadSave(s.repair);
    this.diff = s.diff;
    this.cfg = DIFF[s.diff];
    this.wrap = (g as unknown as { wrap: HTMLElement }).wrap;
    this.emg = new BrakeEmergency(this.wrap);
    this.emg.onStop = () => this.emgStopped();
    const b = document.createElement('button');
    b.className = 'gbr-fix';
    b.hidden = true;
    b.setAttribute('data-touch-ignore', '');
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.fixTap();
    });
    this.wrap.appendChild(b);
    this.fixBtn = b;
    this.lamp = document.createElement('div');
    this.lamp.className = 'gbr-lamp';
    this.lamp.hidden = true;
    this.wrap.appendChild(this.lamp);
    this.sync();
    setBreakdownHook((kind, target, done) => this.fromEvent(kind, target, done));
    hwRepair.rep = this;
  }

  /* ============================== API ============================== */
  /** índice da máquina e estado (cria se faltar) */
  private ms(m: Machine): MachState | null {
    const i = this.g.ms.indexOf(m);
    if (i < 0) return null;
    while (this.st.ms.length <= i) this.st.ms.push(freshMach());
    return this.st.ms[i];
  }
  private sync(): void {
    while (this.st.ms.length < this.g.ms.length) this.st.ms.push(freshMach());
  }
  broken(m: Machine): BreakKind | null {
    if (this.g.guest) {
      const v = this.netB[this.g.ms.indexOf(m)] ?? 0;
      return v ? BREAK_KINDS[(v & 7) - 1] : null;
    }
    return this.ms(m)?.broken ?? null;
  }
  wear(m: Machine): number {
    return this.ms(m)?.wear ?? 0;
  }
  /** quebra a máquina agora (anfitrião). Devolve false se não dá (já quebrada, tipo inválido). */
  breakdown(m: Machine, kind: BreakKind, silent = false): boolean {
    if (this.g.guest) {
      (this.g.mp as { action?: (k: string, e: Record<string, unknown>) => void }).action?.('repair', { m: this.g.ms.indexOf(m), k: kind, brk: 1 });
      return true;
    }
    const st = this.ms(m);
    if (!st || st.broken) return false;
    if (kind === 'brake' && m.veh && Math.abs(m.veh.speed) > 3 && m === this.g.cur) return this.brakeFailure(m);
    if (kind === 'tyre' && (!m.veh || m.veh.spec.tracked)) kind = 'part';
    st.broken = kind;
    st.wheel = m.veh ? Math.floor(Math.random() * m.veh.spec.wheels.length) : 0;
    this.st.cd = this.cfg.cooldown;
    this.ver++;
    if (!silent) this.announce(m, kind);
    return true;
  }
  private announce(m: Machine, kind: BreakKind): void {
    const mine = m === this.g.cur;
    if (kind === 'tyre') rs.bang();
    else rs.nope();
    if (mine) haptic('heavy');
    notify(breakName(kind), { icon: 'warning', kind: 'bad', ms: 4200 });
    if (mine) speak(breakName(kind) + ' ' + t('gb.rep.v.tapFix', 'Toque na chave inglesa para consertar.'), { gap: 300 });
    this.g.host?.event(['toast', breakName(kind)]);
  }
  /** conserta direto (sem minijogo) */
  fix(m: Machine, quiet = false): void {
    if (this.g.guest) {
      (this.g.mp as { action?: (k: string, e: Record<string, unknown>) => void }).action?.('repair', { m: this.g.ms.indexOf(m) });
      return;
    }
    const st = this.ms(m);
    if (!st || !st.broken) return;
    st.broken = null;
    st.wear = Math.max(0, st.wear - 30);
    this.st.fixed++;
    this.mech.delete(this.g.ms.indexOf(m));
    this.ver++;
    this.unflat(m);
    if (!quiet) {
      notify(t('gb.rep.fixed', 'Consertado!'), { icon: 'check', kind: 'good' });
      audio.cash();
    }
  }

  /** emergência de freio (máquina do garimpo dirigida aqui, ou a carreta da estrada) */
  brakeFailure(target: Machine | Rig): boolean {
    if (this.emg.active || this.ov) return false;
    const rig = !(target as Machine).kind ? (target as Rig) : null;
    const m = rig ? null : (target as Machine);
    if (m && (!m.veh || m !== this.g.cur)) return false;
    this.emgM = m;
    this.emgRig = rig;
    if (m) {
      const st = this.ms(m)!;
      st.broken = 'brake';
      this.ver++;
      // leito de cascalho à frente, um pouco à direita
      const v = m.veh!;
      const y = v.yaw();
      const fx = Math.sin(y);
      const fz = Math.cos(y);
      this.bed?.dispose();
      this.bed = null;
      const T = this.g.w!.T;
      const inMap = (x: number, z: number) => x > 10 && z > 10 && x < SIZE - 10 && z < SIZE - 10;
      // procura um lugar à frente (o mapa é pequeno): mais perto se não couber
      for (const [ahead, len] of [[26, 34], [18, 28], [12, 22]]) {
        const cx = v.pos.x + fx * ahead - Math.cos(y) * 4;
        const cz = v.pos.z + fz * ahead + Math.sin(y) * 4;
        if (!inMap(cx, cz) || !inMap(cx + fx * len, cz + fz * len)) continue;
        this.bed = new EscapeBed(T, cx, cz, y, len);
        this.g.w!.scene.add(this.bed.group);
        break;
      }
    }
    this.st.cd = this.cfg.cooldown;
    this.emg.start(this.target(m, rig));
    return true;
  }
  private target(m: Machine | null, rig: Rig | null): BrakeTarget {
    const self = this;
    if (m)
      return {
        speed: () => m.veh!.speed,
        gear: () => m.veh!.gear,
        manual: () => !!self.g.sv?.expert && !m.veh!.input.auto,
        x: () => m.pos.x,
        z: () => m.pos.z,
        onRamp: () => !!self.bed && self.bed.inside(m.pos.x, m.pos.z),
        ramp: () => (self.bed ? { x: self.bed.x + Math.sin(self.bed.yaw) * 8, z: self.bed.z + Math.cos(self.bed.yaw) * 8, dist: Math.hypot(self.bed.x - m.pos.x, self.bed.z - m.pos.z) } : null),
      };
    const r = rig!;
    return {
      speed: () => r.v,
      gear: () => Math.min(6, Math.max(1, Math.round(r.gear / 2))),
      manual: () => false,
      x: () => r.tr.x,
      z: () => r.tr.z,
      onRamp: () => hwRepair.onRamp(r),
      ramp: () => hwRepair.nextRamp(r),
    };
  }
  /** quanto o freio-motor/cascalho segura agora na carreta (estrada) */
  get hwDecel(): number {
    return this.emg.active && this.emgRig ? this.emg.decel : 0;
  }
  /** chance de o freio da carreta falhar antes de uma rampa (0 = não pode agora) */
  hwChance(): number {
    const s = this.g.sv;
    if (!s || this.st.cd > 0 || s.played < GRACE_S || this.ov || this.g.guest) return 0;
    return [0.12, 0.22, 0.32, 0.45][this.diff];
  }
  get hwNoBrake(): boolean {
    return (this.emg.active && !!this.emgRig) || this.hwBroken;
  }
  private emgStopped(): void {
    const m = this.emgM;
    const rig = this.emgRig;
    this.emgM = null;
    this.emgRig = null;
    if (m?.veh) m.veh.toolDrag = 0;
    this.bedT = 25;
    if (rig) this.hwBroken = true;
    window.setTimeout(() => this.open('brake', m ?? rig, undefined, { free: !!rig }), 1300);
  }

  /** abre o minijogo do tipo `kind` para `target` (Machine, Rig da estrada ou null = só jogar) */
  open(kind: BreakKind, target: Machine | Rig | null, onDone?: (ok: boolean) => void, o: OpenOpts = {}): boolean {
    if (this.ov) return false;
    const m = target && (target as Machine).kind ? (target as Machine) : null;
    const rig = target && !m ? (target as Rig) : null;
    if (m?.veh && Math.abs(m.veh.speed) > 1.5 && m === this.g.cur) {
      notify(t('gb.rep.stopFirst', 'Pare a máquina primeiro!'), { icon: 'warning', kind: 'warn' });
      return false;
    }
    const part = PART_FOR[kind];
    const needPart = !!m && !o.free && !this.cfg.freeParts;
    if (needPart && this.st.inv[part] <= 0) {
      this.choose(kind, m!, onDone);
      return true;
    }
    const kindLook: Kind | 'rig' = m ? m.kind : rig ? 'rig' : 'pickup';
    const [body, bodyD] = LOOK[kindLook] ?? LOOK.pickup;
    const look: VehLook = {
      kind: m ? m.kind : 'truck',
      body,
      bodyD,
      heavy: kindLook === 'truck' || kindLook === 'rig' || kindLook === 'dozer' || kindLook === 'excavator',
      art: partArt(m ? m.kind : 'truck'),
    };
    const g = this.g;
    g.pause();
    g.hud?.setVisible(false);
    this.uiKey = '';
    this.ov = openGame(this.wrap, kind, { level: this.cfg.level, veh: look }, (ok, bonus) => {
      this.ov = null;
      g.hud?.setVisible(!g.rp?.onRoad);
      g.resume();
      if (ok) {
        if (needPart) {
          this.st.inv[part] = Math.max(0, this.st.inv[part] - 1);
          this.ver++;
        }
        if (m) this.fix(m, true);
        if (rig && kind === 'brake') this.hwBroken = false;
        const pay = 40 + bonus * 60;
        if (!g.guest && g.sv) g.sv.money += pay;
        notify(t('gb.rep.fixedPay', 'Consertado! +{n}', { n: pay }), { icon: 'check', kind: 'good' });
        audio.cash();
      }
      onDone?.(ok);
    });
    return true;
  }

  /** difícil sem peça: comprar e consertar / mecânico (taxa + espera) / guincho */
  private choose(kind: BreakKind, m: Machine, onDone?: (ok: boolean) => void): void {
    const g = this.g;
    const s = g.sv!;
    const part = PART_FOR[kind];
    const price = PART_PRICE[part];
    const fee = MECH_FEE[this.diff];
    const tow = TOW_FEE[this.diff];
    const d = document.createElement('div');
    d.className = 'gb-scr gbr-choose';
    d.style.zIndex = '52';
    const opt = (k: string, icon: string, sub: string, can: boolean, cls = '') => `<button class="gbr-opt ${cls}" data-o="${k}" ${can ? '' : 'disabled'}><span class="gbr-big">${icon}</span><small>${sub}</small></button>`;
    d.innerHTML = `<button class="gb-b gb-x" data-x style="position:absolute;left:12px;top:10px">${RIC.wrench}</button>
      <div class="gbr-head">${RIC[BREAK_ICON[kind]]}<span style="font:800 20px var(--font,'Fredoka',sans-serif)">${esc(breakName(kind))}</span>${RIC[PART_ICON[part]]}</div>
      <div class="gbr-pick">
        ${opt('buy', RIC.cart.replace('stroke="#fff"', 'stroke="#fff"') + '', `${RIC[PART_ICON[part]].replace('<svg', '<svg style="width:22px;height:22px"')}${COIN}${price}`, s.money >= price, 'go')}
        ${opt('mech', RIC.mech, `${COIN}${fee} ${RIC.clock.replace('<svg', '<svg style="width:18px;height:18px"')}`, s.money >= fee && !this.mech.has(g.ms.indexOf(m)))}
        ${opt('tow', RIC.tow, `${COIN}${tow}`, s.money >= tow)}
      </div>`;
    this.wrap.appendChild(d);
    g.pause();
    g.hud?.setVisible(false);
    speak(t('gb.rep.v.noPart', 'Falta a peça! Compre a peça, chame o mecânico ou o guincho.'), { gap: 300 });
    const close = () => {
      d.remove();
      g.hud?.setVisible(true);
      g.resume();
    };
    d.addEventListener('click', (e) => {
      const el = e.target as HTMLElement;
      if (el.closest('[data-x]')) return close();
      const b = el.closest<HTMLButtonElement>('[data-o]');
      if (!b || b.disabled) return;
      const k = b.dataset.o;
      close();
      if (k === 'buy') {
        if (this.buy('r.' + part)) window.setTimeout(() => this.open(kind, m, onDone), 250);
      } else if (k === 'mech') this.callMech(m, fee);
      else if (k === 'tow') this.towIt(m, tow);
    });
  }
  private callMech(m: Machine, fee: number): void {
    const g = this.g;
    if (g.guest) {
      (g.mp as { action?: (k: string, e: Record<string, unknown>) => void }).action?.('repair', { m: g.ms.indexOf(m), how: 'mech' });
      return;
    }
    if (g.sv!.money < fee) return;
    g.sv!.money -= fee;
    this.mech.set(g.ms.indexOf(m), MECH_WAIT);
    audio.cash();
    notify(t('gb.rep.mechComing', 'O mecânico está vindo!'), { icon: 'clock' });
    this.uiKey = '';
  }
  private towIt(m: Machine, fee: number): void {
    const g = this.g;
    if (g.guest) {
      (g.mp as { action?: (k: string, e: Record<string, unknown>) => void }).action?.('repair', { m: g.ms.indexOf(m), how: 'tow' });
      return;
    }
    if (g.sv!.money < fee) return;
    g.sv!.money -= fee;
    const gar = g.w!.map.garage;
    if (m === g.cur) g.enterExit();
    if (m.veh) m.veh.place(gar.x + 3, gar.z, 0, g.w!.T);
    else if (m instanceof Heli) m.place(gar.x + 3, gar.z, 0, g.w!);
    this.fix(m, true);
    audio.cash();
    notify(t('gb.rep.towed', 'O guincho levou para a garagem. Consertado!'), { icon: 'check', kind: 'good' });
  }

  /** gancho do RP: evento escolheu "consertar" */
  private fromEvent(kind: RpBreak, target: unknown, done: (ok: boolean) => void): boolean {
    const k: BreakKind = kind === 'tire' ? 'tyre' : kind === 'brakes' ? 'brake' : kind;
    const tg = target as Machine | Rig | null;
    if (!tg) return this.open(k, null, done, { free: true });
    const m = (tg as Machine).kind ? (tg as Machine) : null;
    if (k === 'brake') {
      const v = m ? m.veh?.speed ?? 0 : (tg as Rig).v;
      if (Math.abs(v) > 4 && this.brakeFailure(tg)) return true;
    }
    if (m) {
      // tipo que a máquina não tem (pneu de esteira…) vira peça
      const ok = kindsFor(m.kind);
      const kk = ok.includes(k) || k === 'brake' ? k : 'part';
      if (!this.g.guest) {
        const st = this.ms(m);
        if (st && !st.broken) {
          st.broken = kk;
          this.ver++;
        }
      }
      return this.open(kk, m, done, { free: true });
    }
    return this.open(k, tg, done, { free: true });
  }

  /* ============================== efeitos no controle ============================== */
  /** gancho antes de m.update: devolve o controle modificado pela quebra (ou o mesmo) */
  ctl(m: Machine, c: Ctl | null): Ctl | null {
    const k = this.broken(m);
    const emg = this.emg.active && this.emgM === m;
    if (!c) {
      if (emg && m.veh) m.veh.toolDrag = 0;
      return c;
    }
    if (!k && !emg) return c;
    let o = this.scratch.get(m);
    if (!o) {
      o = newCtl();
      this.scratch.set(m, o);
    }
    Object.assign(o, c);
    if (emg) {
      // sem freio: pedal e freio de mão não seguram (o de mão segura só um pouco)
      o.brake = 0;
      o.hand = false;
      const v = m.veh!;
      v.toolDrag = (this.emg.decel + (c.hand || c.brake > 0.5 ? 0.9 : 0)) * v.mass;
      return o;
    }
    switch (k) {
      case 'tyre': {
        // puxa para o lado do pneu furado e anda devagar
        const w = m.veh?.spec.wheels[this.ms(m)?.wheel ?? 0];
        o.gas *= 0.5;
        o.mx = Math.max(-1, Math.min(1, o.mx + (w ? (w.side > 0 ? -0.22 : 0.22) : 0) * Math.min(1, Math.abs(m.veh?.speed ?? 0) / 3)));
        break;
      }
      case 'electric':
        // motor não pega: sem acelerar, helicóptero não sobe
        o.gas = 0;
        o.up = false;
        o.act = m instanceof Heli ? false : o.act;
        break;
      case 'part':
        if (m instanceof Excavator) {
          // mangueira rompida: braço não levanta, não cava
          o.ry = Math.max(0, o.ry);
          o.act = false;
        } else if (m.kind === 'dozer') {
          o.gas *= 0.25;
          o.up = false;
        } else if (m instanceof Heli) {
          o.up = false;
          o.act = false;
        } else if (m instanceof Truck) {
          o.act2 = false;
          o.gas *= 0.7;
        } else o.gas *= 0.35;
        break;
      case 'bushing':
        o.gas *= 0.8;
        break;
      case 'brake':
        o.gas = 0;
        break;
    }
    return o;
  }

  /* ============================== passo ============================== */
  /** anfitrião/sozinho: desgaste, sorteio de quebras, efeitos visuais, emergência, HUD */
  step(dt: number): void {
    const g = this.g;
    const s = g.sv;
    const w = g.w;
    if (!s || !w) return;
    this.sync();
    this.st.cd = Math.max(0, this.st.cd - dt);
    const T = w.T;
    const allowed = s.played > GRACE_S && s.tips.includes('gold1') && !this.ov && !this.emg.active;
    for (let i = 0; i < g.ms.length; i++) {
      const m = g.ms[i];
      const st = this.st.ms[i];
      const v = m.veh;
      const human = m === g.cur || !!g.host?.seat(m);
      let sp = 0;
      if (v) {
        if (v.asleep) {
          this.visual(m, st);
          continue;
        }
        sp = Math.abs(v.speed);
        const rough = Math.min(3, Math.hypot(v.ang.x, v.ang.z));
        const mud = T.wetK(T.idx(v.pos.x, v.pos.z));
        st.wear = Math.min(100, st.wear + wearRate(sp, m.fill, rough, mud, this.cfg.wearK) * dt);
        st.km += sp * dt;
        // buchas gastas: carro chacoalha
        if (st.broken === 'bushing' && sp > 1) {
          v.ang.x += (Math.random() - 0.5) * dt * 6 * Math.min(1, sp / 6);
          v.ang.z += (Math.random() - 0.5) * dt * 8 * Math.min(1, sp / 6);
        }
      } else if (m instanceof Heli && human && m.alt > 1) {
        sp = 6;
        st.wear = Math.min(100, st.wear + 0.012 * this.cfg.wearK * dt);
      }
      this.visual(m, st);
      if (!human || st.broken || !allowed || this.st.cd > 0) continue;
      // freio: caminhão carregado na descida (muito raro)
      if (v && (m.kind === 'truck' || m.kind === 'pickup') && m === g.cur && sp > 5 && m.fill > 0.5) {
        _fw.set(0, 0, 1).applyQuaternion(v.q);
        const down = -_fw.y * Math.sign(v.speed);
        if (down > 0.06) {
          const p = (this.cfg.brakeRate / 3600) * dt * (m.kind === 'truck' ? 1 : 0.3) * Math.min(2, down * 10);
          if (Math.random() < p) {
            this.brakeFailure(m);
            continue;
          }
        }
      }
      if (sp < 2) continue;
      const wk = st.wear / 100;
      const rate = this.cfg.rate0 + (this.cfg.rate100 - this.cfg.rate0) * wk * wk;
      if (Math.random() < (rate / 3600) * dt * Math.min(1.5, sp / 8)) {
        const ks = kindsFor(m.kind);
        if (ks.length) this.breakdown(m, ks[Math.floor(Math.random() * ks.length)]);
      }
    }
    // mecânico chegando
    for (const [i, left] of this.mech) {
      const l = left - dt;
      if (l <= 0) {
        this.mech.delete(i);
        const m = g.ms[i];
        if (m) this.fix(m);
      } else this.mech.set(i, l);
    }
    this.stepEmg(dt);
    this.hudStep();
  }
  /** convidado: só visual e HUD (o anfitrião decide) */
  stepGuest(_dt: number): void {
    for (let i = 0; i < this.g.ms.length; i++) {
      const v = this.netB[i] ?? 0;
      const m = this.g.ms[i];
      const k = v ? BREAK_KINDS[(v & 7) - 1] : null;
      if (k === 'tyre') this.flat(m, v >> 3);
      else this.unflat(m);
    }
    this.hudStep();
  }
  private stepEmg(dt: number): void {
    const g = this.g;
    if (this.bed && !this.emg.active) {
      this.bedT -= dt;
      if (this.bedT <= 0) {
        this.bed.dispose();
        this.bed = null;
      }
    }
    if (!this.emg.active) return;
    this.emg.camYaw = g.camYawNow;
    // saiu da máquina no meio: o freio de mão do estacionamento segura
    if (this.emgM && this.emgM !== g.cur && this.emgM.veh) this.emgM.veh.toolDrag = 3 * this.emgM.veh.mass;
    this.emg.step(dt, !!g.hud && !g.hud.el.hidden || !!this.emgRig);
  }
  private visual(m: Machine, st: MachState): void {
    if (st.broken === 'tyre') this.flat(m, st.wheel);
    else this.unflat(m);
  }
  /** pneu murcho: roda mais baixa e achatada (depois do sync das malhas) */
  private flat(m: Machine, wi: number): void {
    const ws = (m as unknown as { wheels?: THREE.Object3D[] }).wheels;
    const w = ws?.[wi];
    if (!w || !m.veh) return;
    const r = m.veh.spec.wheels[wi]?.r ?? 0.5;
    w.position.y -= r * 0.22;
    w.scale.set(1, 1, 1);
    w.scale.y = 0.82;
    w.scale.z = 1.08;
    this.flatDone.set(m, wi + 1);
  }
  private unflat(m: Machine): void {
    const f = this.flatDone.get(m);
    if (!f) return;
    const w = (m as unknown as { wheels?: THREE.Object3D[] }).wheels?.[f - 1];
    w?.scale.set(1, 1, 1);
    this.flatDone.delete(m);
  }

  /* ============================== HUD ============================== */
  /** máquina que o botão conserta: a que eu dirijo ou a quebrada mais perto a pé */
  private fixTarget(): Machine | null {
    const g = this.g;
    const cur = g.cur;
    if (!cur || g.inMine) return null;
    if (cur !== g.worker) return this.broken(cur) ? cur : null;
    let best: Machine | null = null;
    let bd = 7;
    for (const m of g.ms) {
      if (!this.broken(m)) continue;
      const d = Math.hypot(m.pos.x - cur.pos.x, m.pos.z - cur.pos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }
  private hudStep(): void {
    const g = this.g;
    const vis = !!g.hud && !g.hud.el.hidden && !this.ov && !this.emg.active;
    const road = !!g.rp?.onRoad;
    const m = road ? null : this.fixTarget();
    const k = m ? this.broken(m) : road && this.hwBroken ? 'brake' : null;
    const mi = m ? g.ms.indexOf(m) : -1;
    const mech = mi >= 0 && this.mech.has(mi);
    const show = (vis || (road && this.hwBroken && !this.ov && !this.emg.active)) && !!k;
    const key = `${show}|${k}|${mech}|${mech ? Math.ceil(this.mech.get(mi)! / 5) : 0}`;
    if (key === this.uiKey) return;
    this.uiKey = key;
    this.fixBtn.hidden = !show || mech;
    this.lamp.hidden = !show;
    if (!show || !k) return;
    this.fixBtn.innerHTML = `<i>${RIC[BREAK_ICON[k]].replace('<svg', '<svg class="gbr-k"')}</i>${RIC.wrench}<span>${esc(t('gb.rep.fix', 'Consertar'))}</span>`;
    this.lamp.innerHTML = `<b>${RIC[BREAK_ICON[k]]}</b>${mech ? `<b style="border-color:#ffcf2e;color:#ffcf2e">${RIC.mech}</b>` : ''}`;
  }
  private fixTap(): void {
    const g = this.g;
    if (g.rp?.onRoad && this.hwBroken) {
      const hw = (g.rp as unknown as { debug: { hw: () => { rig: Rig } | null } }).debug.hw();
      if (hw) this.open('brake', hw.rig, undefined, { free: true });
      return;
    }
    const m = this.fixTarget();
    const k = m && this.broken(m);
    if (!m || !k) return;
    haptic('light');
    this.open(k, m);
  }

  /* ============================== loja ============================== */
  isItem(id: string): boolean {
    return id.startsWith('r.');
  }
  private totalWear(): number {
    let w = 0;
    for (let i = 0; i < this.g.ms.length; i++) w += this.st.ms[i]?.wear ?? 0;
    return w;
  }
  shopHtml(money: number): string {
    const item = (id: string, icon: string, name: string, small: string, price: number, can: boolean, done = false) =>
      `<div class="gb-item ${done ? 'owned' : ''}"><div class="gb-ico gbr-ico">${icon}</div><span>${esc(name)}</span>${small}<button class="gb-price" data-buy="${id}" ${can ? '' : 'disabled'}>${COIN}${price.toLocaleString('pt-BR')}</button></div>`;
    let h = `<div class="gbr-sub">${RIC.wrench}${esc(t('gb.rep.shop', 'Oficina'))}</div>`;
    // revisão: preço pelo desgaste somado; mostra o pior desgaste em bolinhas
    let worst = 0;
    let anyBroken = false;
    for (let i = 0; i < this.g.ms.length; i++) {
      const st = this.st.ms[i];
      if (!st) continue;
      worst = Math.max(worst, st.wear);
      if (st.broken) anyBroken = true;
    }
    const fee = serviceFee(this.totalWear() / Math.max(1, this.g.ms.length), this.diff) * Math.max(1, this.g.ms.length);
    const dots = Math.round(worst / 20);
    const wcls = worst > 66 ? 'bad' : worst > 33 ? 'mid' : '';
    const wear = `<div class="gbr-wear ${wcls}">${[0, 1, 2, 3, 4].map((i) => `<i class="${i < 5 - dots ? 'on' : ''}"></i>`).join('')}</div>`;
    h += item('r.rev', RIC.service, t('gb.rep.service', 'Revisão na garagem'), wear, fee, money >= fee && (worst > 3 || anyBroken), worst <= 3 && !anyBroken);
    for (const p of PART_IDS) {
      const n = this.st.inv[p];
      h += item('r.' + p, RIC[PART_ICON[p]], partName(p), `<small>${n ? '×' + n : '&nbsp;'}</small>`, PART_PRICE[p], n < PART_MAX && money >= PART_PRICE[p], n >= PART_MAX);
    }
    return h;
  }
  buy(id: string): boolean {
    const g = this.g;
    const s = g.sv!;
    if (g.guest) {
      (g.mp as { action?: (k: string, e: Record<string, unknown>) => void }).action?.('buy', { id });
      return true;
    }
    const k = id.slice(2);
    if (k === 'rev') {
      const fee = serviceFee(this.totalWear() / Math.max(1, g.ms.length), this.diff) * Math.max(1, g.ms.length);
      if (s.money < fee) return false;
      s.money -= fee;
      for (let i = 0; i < g.ms.length; i++) {
        const st = this.st.ms[i];
        if (!st) continue;
        st.wear = 0;
        st.km = 0;
        if (st.broken && !(this.emg.active && this.emgM === g.ms[i])) {
          st.broken = null;
          this.unflat(g.ms[i]);
        }
      }
      this.mech.clear();
      this.ver++;
      audio.cash();
      notify(t('gb.rep.serviced', 'Revisão feita! Máquinas novinhas.'), { icon: 'check', kind: 'good' });
      return true;
    }
    if (!(PART_IDS as string[]).includes(k)) return false;
    const p = k as PartId;
    if (this.st.inv[p] >= PART_MAX || s.money < PART_PRICE[p]) return false;
    s.money -= PART_PRICE[p];
    this.st.inv[p]++;
    this.ver++;
    audio.cash();
    return true;
  }

  /* ============================== save / rede ============================== */
  save(): RepairSave {
    this.sync();
    const r = (v: number) => Math.round(v * 10) / 10;
    return { v: 1, ms: this.st.ms.slice(0, this.g.ms.length).map((m) => ({ ...m, wear: r(m.wear), km: Math.round(m.km) })), inv: { ...this.st.inv }, cd: Math.round(this.st.cd), fixed: this.st.fixed };
  }
  /** anfitrião: estado compacto quando muda (ou a cada 2 s) */
  netTake(): number[] | undefined {
    this.netT -= 0.1;
    if (this.ver === this.sentVer && this.netT > 0) return undefined;
    this.sentVer = this.ver;
    this.netT = 2;
    const out: number[] = [];
    for (let i = 0; i < this.g.ms.length; i++) {
      const st = this.st.ms[i];
      const k = st?.broken ? BREAK_KINDS.indexOf(st.broken) + 1 : 0;
      out.push(k ? k | (st!.wheel << 3) : 0);
    }
    for (const p of PART_IDS) out.push(this.st.inv[p]);
    return out;
  }
  netReset(): void {
    this.sentVer = -1;
  }
  /** convidado */
  netApply(a: unknown): void {
    if (!Array.isArray(a)) return;
    const n = Math.max(0, a.length - PART_IDS.length);
    const prev = this.netB.slice();
    this.netB = a.slice(0, n).map((v) => Math.max(0, Math.round(Number(v) || 0)));
    PART_IDS.forEach((p, i) => (this.st.inv[p] = Math.max(0, Math.round(Number(a[n + i]) || 0))));
    // a minha máquina quebrou agora: aviso
    const cur = this.g.cur;
    const ci = cur ? this.g.ms.indexOf(cur) : -1;
    if (ci >= 0 && this.netB[ci] && !prev[ci]) this.announce(cur!, BREAK_KINDS[(this.netB[ci] & 7) - 1]);
    this.uiKey = '';
  }
  /** anfitrião: pedido do convidado ({m, k?, how?, brk?}) */
  remoteAct(e: Record<string, unknown>): void {
    const m = this.g.ms[Math.round(Number(e.m))];
    if (!m) return;
    if (e.brk && typeof e.k === 'string' && (BREAK_KINDS as string[]).includes(e.k)) {
      this.breakdown(m, e.k as BreakKind);
      return;
    }
    const k = this.broken(m);
    if (!k) return;
    if (e.how === 'mech') return this.callMech(m, MECH_FEE[this.diff]);
    if (e.how === 'tow') return this.towIt(m, TOW_FEE[this.diff]);
    // conserto feito pelo convidado: gasta a peça no difícil
    if (!this.cfg.freeParts) {
      const p = PART_FOR[k];
      if (this.st.inv[p] > 0) this.st.inv[p]--;
    }
    this.fix(m);
  }

  dispose(): void {
    setBreakdownHook(null);
    if (hwRepair.rep === this) hwRepair.rep = null;
    this.ov?.close(false);
    this.emg.dispose();
    this.bed?.dispose();
    this.fixBtn.remove();
    this.lamp.remove();
    for (const m of this.g.ms) this.unflat(m);
  }

  /** testes */
  debug = {
    grace: () => {
      const s = this.g.sv!;
      s.played = Math.max(s.played, GRACE_S + 1);
      if (!s.tips.includes('gold1')) s.tips.push('gold1');
      this.st.cd = 0;
    },
    brk: (k: BreakKind) => this.g.cur && this.breakdown(this.g.cur, k),
    open: (k: BreakKind) => this.open(k, this.g.cur && this.g.cur !== this.g.worker ? this.g.cur : null),
    brake: () => this.g.cur && this.brakeFailure(this.g.cur),
    ov: () => this.ov,
    bed: () => this.bed,
  };
}
export { BREAK_KINDS, RIC };
