/* ============================================================
 *  VEÍCULOS DO MUNDO — painel de direção (toque + teclado).
 *  Joystick à esquerda (virar/acelerar), arrastar à direita gira a
 *  câmera, botões grandes só com ícone à direita: freio, ferramenta,
 *  guindaste, faróis, buzina, engate, basculante, abastecer, consertar,
 *  desvirar, subir/descer (ar), sair.
 * ============================================================ */
import { t } from '../../../../../i18n';
import { createJoystick, createLook, bindButton, edges, type Joystick, type LookDrag, type BoundButton } from '../../../../../ui/touch';
import { notify } from '../../../../../ui/notify';
import { ensureVehCss } from './css';
import { UI_ICONS, type UiIcon } from './icons';
import { fuelName } from './parts';
import { MASS_KG } from './design';
import type { Vehicle } from './vehicle';

export interface HudCallbacks {
  exit(): void;
  /** abastecer com o inventário; devolve itens usados */
  refuel(): number;
  /** consertar (kit); true = consertou */
  repair(): boolean;
  hitch?(): void;
  canHitch?(): boolean;
  /** arraste da câmera (rad) */
  camDrag?(dYaw: number, dPitch: number): void;
  horn?(): void;
}

interface Btn {
  el: HTMLDivElement;
  b: BoundButton;
  show: () => boolean;
  on?: () => boolean;
  last?: string;
}

export class DriveHud {
  readonly el: HTMLDivElement;
  private joy: Joystick;
  private look: LookDrag;
  private btns: Btn[] = [];
  private held = { brake: false, up: false, down: false, tool: false, wUp: false, wDown: false };
  private spd: HTMLElement;
  private fuelBar: HTMLElement;
  private hpBar: HTMLElement;
  private cargoChip: HTMLElement;
  private massChip: HTMLElement;
  private hint: HTMLElement;
  private warnedFuel = false;
  private warnedBroken = false;
  private uiT = 0;
  private fuelBtn: HTMLElement | null = null;

  constructor(
    root: HTMLElement,
    private v: Vehicle,
    private cb: HudCallbacks,
  ) {
    ensureVehCss();
    const e = edges();
    const el = document.createElement('div');
    el.className = 'mv-hud';
    root.appendChild(el);
    this.el = el;
    this.joy = createJoystick(el, { side: 'left', zoneWidth: 0.45, zoneTop: 0.2, mouse: true });
    this.look = createLook(el, { zone: (x, _y, r) => x > r.width * 0.45 });

    // ---- mostradores ----
    const g = document.createElement('div');
    g.className = 'mv-gauges';
    g.style.left = e.l + 'px';
    g.style.top = e.t + 'px';
    g.innerHTML = `
      <div class="mv-chip"><span class="mv-spd">0<small>km/h</small></span></div>
      <div class="mv-chip" title="${fuelName(v.stats.fuel)}"><i>${UI_ICONS.fuel}</i><div class="mv-bar f"><b></b></div></div>
      <div class="mv-chip"><i>${UI_ICONS.heart}</i><div class="mv-bar h"><b></b></div></div>
      <div class="mv-chip c"><i>${UI_ICONS.log}</i><span>0</span></div>
      <div class="mv-chip m"><i>${UI_ICONS.weight}</i><span>0</span></div>`;
    el.appendChild(g);
    this.spd = g.querySelector('.mv-spd')!;
    this.fuelBar = g.querySelector('.mv-bar.f')!;
    this.hpBar = g.querySelector('.mv-bar.h')!;
    this.cargoChip = g.querySelector('.mv-chip.c')!;
    this.massChip = g.querySelector('.mv-chip.m')!;
    this.cargoChip.style.display = v.stats.cargo ? '' : 'none';
    if (v.stats.fuel === 'none') (this.fuelBar.parentElement as HTMLElement).style.display = 'none';
    this.hint = document.createElement('div');
    this.hint.className = 'mv-hint';
    this.hint.style.top = e.t + 48 + 'px';
    this.hint.style.display = 'none';
    el.appendChild(this.hint);

    // ---- botões ----
    const R = e.r + 10;
    const B = e.b + 10;
    const s = v.stats;
    const air = s.kind === 'heli' || s.kind === 'plane';
    this.add('exit', 'sm', { right: R, top: e.t }, t('mveic.h.exit', 'Sair'), { onPress: () => cb.exit() }, () => true);
    this.add('brake', 'big', { right: R, bottom: B }, t('mveic.h.brake', 'Freio'), this.hold('brake'), () => !v.craneMode);
    // coluna 2 (à esquerda do freio)
    if (air) {
      this.add('up', '', { right: R + 98, bottom: B + 70 }, t('mveic.h.up', 'Subir'), this.hold('up'), () => !v.craneMode);
      this.add('down', '', { right: R + 98, bottom: B }, t('mveic.h.down', 'Descer'), this.hold('down'), () => !v.craneMode && s.kind === 'heli');
    }
    if (s.tools.drill) this.add('drill', '', { right: R + 98, bottom: B }, t('mveic.h.drill', 'Cavar (segure)'), this.hold('tool'), () => !air && !v.craneMode, () => this.held.tool);
    else if (s.tools.blade || s.tools.plow)
      this.add(s.tools.blade ? 'blade' : 'plow', '', { right: R + 98, bottom: B }, s.tools.blade ? t('mveic.h.blade', 'Lâmina: aplainar') : t('mveic.h.plow', 'Arado: arar'), { onPress: () => (v.toolOn = !v.toolOn) }, () => !v.craneMode, () => v.toolOn);
    if (v.hasCrane) {
      this.add('crane', '', { right: R + 98, bottom: B + 74 }, t('mveic.h.crane', 'Guindaste: o joystick move o braço'), { onPress: () => this.toggleCrane() }, () => true, () => v.craneMode);
      this.add('grab', 'big', { right: R, bottom: B }, t('mveic.h.grab', 'Pegar / soltar'), { onPress: () => v.grab() }, () => v.craneMode, () => !!v.grabbed);
      this.add('up', 'sm', { right: R + 196, bottom: B + 8 }, t('mveic.h.winchUp', 'Subir gancho'), this.hold('wUp'), () => v.craneMode);
      this.add('down', 'sm', { right: R + 196, bottom: B + 74 }, t('mveic.h.winchDown', 'Descer gancho'), this.hold('wDown'), () => v.craneMode);
    }
    // coluna 3 (pequenos)
    const col3: [UiIcon, string, () => void, () => boolean, (() => boolean)?][] = [
      ['light', t('mveic.h.light', 'Faróis'), () => (v.lights = !v.lights), () => v.model.lamps.length > 0, () => v.lights],
      ['horn', t('mveic.h.horn', 'Buzina'), () => cb.horn?.(), () => true],
      ['dump', t('mveic.h.dump', 'Despejar carga'), () => v.dump(), () => v.stats.cargo > 0 && v.cargo.size > 0],
      ['hitch', t('mveic.h.hitch', 'Engatar reboque'), () => cb.hitch?.(), () => !!cb.canHitch?.(), () => !!v.hitch],
    ];
    col3.forEach(([ic, label, f, show, on], i) => this.add(ic, 'sm', { right: R + 2 + i * 62, top: e.t + 64 }, label, { onPress: f }, show, on));
    this.add('fuel', '', { right: R + 106, top: e.t }, t('mveic.h.refuel', 'Abastecer'), { onPress: () => this.doRefuel() }, () => v.stats.fuel !== 'none' && v.fuelFrac < 0.98);
    this.fuelBtn = this.btns[this.btns.length - 1].el;
    this.add('wrench', '', { right: R + 176, top: e.t }, t('mveic.h.repair', 'Consertar'), { onPress: () => this.doRepair() }, () => v.hp < v.stats.hp);
    this.add('flip', 'big', { right: R + 98, bottom: B + 150 }, t('mveic.h.flip', 'Desvirar'), { onPress: () => v.unflip() }, () => v.upsideDown && Math.abs(v.speed) < 2);
    this.update(0);
  }

  private hold(k: keyof DriveHud['held']) {
    return { onPress: () => (this.held[k] = true), onRelease: () => (this.held[k] = false) };
  }
  private add(icon: UiIcon, size: string, pos: { right?: number; left?: number; top?: number; bottom?: number }, label: string, o: Parameters<typeof bindButton>[1], show: () => boolean, on?: () => boolean): void {
    const el = document.createElement('div');
    el.className = 'mv-b ' + size;
    el.innerHTML = UI_ICONS[icon];
    el.setAttribute('aria-label', label);
    el.title = label;
    for (const k of ['right', 'left', 'top', 'bottom'] as const) if (pos[k] !== undefined) el.style[k] = pos[k] + 'px';
    this.el.appendChild(el);
    this.btns.push({ el, b: bindButton(el, o), show, on });
  }
  private toggleCrane(): void {
    const v = this.v;
    v.craneMode = !v.craneMode;
    if (v.craneMode) this.flash(t('mveic.h.craneHint', 'Joystick move o braço • ✊ pega a tora'));
  }
  private doRefuel(): void {
    const n = this.cb.refuel();
    if (n > 0) notify(t('mveic.h.refueled', 'Abastecido! (+{n})', { n }));
    else notify(t('mveic.h.noFuelItem', 'Sem {f} no inventário', { f: fuelName(this.v.stats.fuel) }));
  }
  private doRepair(): void {
    if (this.cb.repair()) notify(t('mveic.h.repaired', 'Consertado!'));
    else notify(t('mveic.h.noKit', 'Precisa de um kit de reparo'));
  }
  private flash(s: string): void {
    this.hint.textContent = s;
    this.hint.style.display = '';
    clearTimeout((this.hint as unknown as { _t: number })._t);
    (this.hint as unknown as { _t: number })._t = window.setTimeout(() => (this.hint.style.display = 'none'), 3000);
  }

  /** lê joystick + teclado e escreve em v.input (chame antes da física) */
  apply(_dt: number, keys?: Set<string>): void {
    const v = this.v;
    const j = this.joy.read();
    let x = j.x;
    let y = -j.y;
    if (keys) {
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x = -1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x = 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y = 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y = -1;
    }
    const kb = (c: string) => !!keys?.has(c);
    const inp = v.input;
    if (v.craneMode) {
      v.craneIn.yaw = -x;
      v.craneIn.pitch = y;
      v.craneIn.winch = (this.held.wDown || kb('KeyF') ? 1 : 0) - (this.held.wUp || kb('KeyR') ? 1 : 0);
      inp.steer = 0;
      inp.throttle = 0;
      inp.brake = true;
      inp.up = 0;
      return;
    }
    v.craneIn.yaw = v.craneIn.pitch = v.craneIn.winch = 0;
    inp.steer = x;
    inp.throttle = y;
    inp.brake = this.held.brake || kb('Space');
    inp.up = (this.held.up || kb('KeyR') ? 1 : 0) - (this.held.down || kb('KeyF') ? 1 : 0);
    if (v.stats.tools.drill) v.toolOn = this.held.tool || kb('KeyQ');
  }

  /** atualiza mostradores/botões (chame por quadro) */
  update(dt: number): void {
    const v = this.v;
    const [dy, dp] = this.look.consume(dt || 1 / 60);
    if (dy || dp) this.cb.camDrag?.(-dy, dp);
    this.uiT -= dt;
    if (this.uiT > 0) return;
    this.uiT = 0.1;
    this.spd.firstChild!.textContent = String(Math.round(Math.abs(v.speed) * 3.6));
    const ff = v.fuelFrac;
    (this.fuelBar.firstElementChild as HTMLElement).style.width = Math.round(ff * 100) + '%';
    this.fuelBar.classList.toggle('low', ff < 0.2);
    const hf = v.health;
    (this.hpBar.firstElementChild as HTMLElement).style.width = Math.round(hf * 100) + '%';
    this.hpBar.classList.toggle('low', hf < 0.3);
    this.cargoChip.lastElementChild!.textContent = `${v.cargo.size}/${v.stats.cargo}`;
    this.massChip.lastElementChild!.textContent = `${Math.round((v.totalMass * MASS_KG) / 10) * 10} kg`;
    for (const b of this.btns) {
      const s = b.show();
      const on = b.on?.() ?? false;
      const key = (s ? 1 : 0) + (on ? 2 : 0) + '';
      if (key === b.last) continue;
      b.last = key;
      b.el.classList.toggle('hide', !s);
      b.el.classList.toggle('on', on);
      if (!s) b.b.release();
    }
    this.fuelBtn?.classList.toggle('pulse', ff < 0.15);
    if (v.stats.fuel !== 'none' && v.fuel <= 0 && !this.warnedFuel) {
      this.warnedFuel = true;
      notify(t('mveic.h.empty', 'Acabou o {f}! Toque em ⛽', { f: fuelName(v.stats.fuel) }));
    } else if (v.fuel > 0) this.warnedFuel = false;
    if (v.broken && !this.warnedBroken) {
      this.warnedBroken = true;
      notify(t('mveic.h.broken', 'Quebrou! Use um kit de reparo'));
    } else if (!v.broken) this.warnedBroken = false;
  }

  destroy(): void {
    for (const b of this.btns) b.b.destroy();
    this.joy.destroy();
    this.look.destroy();
    this.el.remove();
    this.v.input.steer = this.v.input.throttle = this.v.input.up = 0;
    this.v.input.brake = false;
  }
}
