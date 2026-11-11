/* ============================================================
 *  GARIMPO BRUTO — HUD de toque.
 *  Esquerda: analógico (createJoystick). Direita: pedais (veículos) ou ações (a pé).
 *  Modo SIMPLES: só pedais + direção. Modo DIFÍCIL: painel com câmbio H (1-6 + R,
 *  AUTO), 2H/4H/4L, BLOQUEIO, FREIO de mão, PNEUS e conta-giros de LEDs (recolhível).
 *  Arrastar no meio da tela gira a câmera (createLook).
 * ============================================================ */
import { t } from '../../i18n';
import { bindButton, createJoystick, createLook, edges, type BoundButton, type Joystick, type LookDrag } from '../../ui/touch';
import { IC, type IconKey } from './icons';
import { newCtl, type Ctl, type Kind } from './machines';

export interface HudCb {
  pause(): void;
  shop(): void;
  enterExit(): void;
  rain(): void;
  cam(): void;
  mode(): void;
  detector(): void;
  /** CARRINHO: largar / pegar */
  barrow(): void;
}
export interface HudState {
  money: number;
  stock: number;
  fill: number;
  cargoGold: number;
  rpm: number;
  gear: number;
  auto: boolean;
  /** 0..1 sinal do detector (null = desligado) */
  det: number | null;
  /** seta de objetivo: ângulo na tela (rad, 0 = para cima) */
  arrow: { a: number; icon: IconKey; dist: number } | null;
  canEnter: boolean;
  /** dica do botão de ação 2 (ex.: perto da moega) */
  hot2: boolean;
  /** garimpeiro com balde / na beira d'água: botão 1 vira água */
  water: boolean;
  /** CARRINHO: botão largar/pegar (null = escondido; far = largado longe) */
  barrow: 'drop' | 'grab' | 'far' | null;
}

const LBL = {
  gas: () => t('gb.gas', 'Acelerar'),
  brake: () => t('gb.brake', 'Freio'),
  dig: () => t('gb.dig', 'Cavar'),
  dump: () => t('gb.dump', 'Despejar'),
  enter: () => t('gb.enter', 'Entrar'),
  exit: () => t('gb.exit', 'Sair'),
  bed: () => t('gb.bed', 'Caçamba'),
  water: () => t('gb.water', 'Soltar água'),
  lock: () => t('gb.lock', 'Bloqueio'),
  hand: () => t('gb.handbrake', 'Freio'),
  tire: () => t('gb.tires', 'Pneus'),
  unload: () => t('gb.unload', 'Descarregar'),
  barDrop: () => t('gb.bar.drop', 'Largar carrinho'),
  barGrab: () => t('gb.bar.grab', 'Pegar carrinho'),
};

const fmtN = (n: number) => Math.floor(n).toLocaleString('pt-BR');

export class Hud {
  readonly el: HTMLDivElement;
  readonly ctl: Ctl = newCtl();
  private joy: Joystick;
  private joyR: Joystick;
  readonly look: LookDrag;
  private btns: BoundButton[] = [];
  private kind: Kind = 'worker';
  private q = <T extends HTMLElement = HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private leds: HTMLElement[] = [];
  private lastLed = -1;
  private lastTxt = '';
  private panelOpen = true;
  private keys = new Set<string>();
  private held = { gas: false, brake: false, act: false, act2: false, up: false, down: false };

  constructor(
    root: HTMLElement,
    private cb: HudCb,
  ) {
    const el = document.createElement('div');
    el.className = 'gb-hud';
    const b = (cls: string, ic: IconKey, label = '') => `<button class="gb-b ${cls}" data-touch-ignore>${IC[ic]}${label ? `<span>${label}</span>` : ''}</button>`;
    el.innerHTML = `
      <div class="gb-top">
        ${b('gb-pause', 'pause')}
        <div class="gb-chip gb-money">${IC.coin}<b>0</b></div>
        <div class="gb-chip gb-stock">${IC.bar}<b>0 g</b></div>
        <div class="gb-chip gb-cargo">${IC.dirt}<i><u></u></i><b>0 g</b></div>
      </div>
      <div class="gb-tr">
        ${b('gb-shop', 'shop')}${b('gb-det', 'detector')}${b('gb-mode', 'wheel')}${b('gb-rainb', 'rain')}<button class="gb-b gb-cam" data-touch-ignore>${IC.cam}<i class="gb-camb">1ª</i></button>
      </div>
      <div class="gb-arrow" hidden><div class="gb-arr">${IC.arrow}</div><span></span></div>
      <div class="gb-detring" hidden><div class="gb-dr"><i></i></div>${IC.detector}</div>
      <div class="gb-right">
        <div class="gb-acts">
          ${b('gb-a gb-ent', 'enter', LBL.enter())}
          ${b('gb-a gb-bar', 'barrowDrop', LBL.barDrop())}
          ${b('gb-a gb-a2', 'dump', LBL.dump())}
          ${b('gb-a gb-up', 'up')}
          ${b('gb-a gb-dn', 'down')}
          ${b('gb-a gb-a1 big', 'shovel', LBL.dig())}
          ${b('gb-a gb-drv', 'arm')}
        </div>
        <div class="gb-pedals">
          <button class="gb-ped gb-brk" data-touch-ignore>${IC.brake}<span>${LBL.brake()}</span></button>
          <button class="gb-ped gb-gas" data-touch-ignore>${IC.gas}<span>${LBL.gas()}</span></button>
        </div>
      </div>
      <div class="gb-panel" data-touch-ignore>
        <button class="gb-ptab" data-touch-ignore>▾</button>
        <div class="gb-tacho"><div class="gb-leds"></div><b class="gb-gear">A1</b></div>
        <div class="gb-prow">
          <div class="gb-shift"><button class="gb-auto on" data-touch-ignore>AUTO</button><div class="gb-hgrid"><svg viewBox="0 0 100 70"><path d="M14 12v46M38 12v46M62 12v46M86 12v46M14 35h72" stroke="#c9b8a0" stroke-width="5" stroke-linecap="round" fill="none"/></svg>
            <em style="left:14%;top:6%">R</em><em style="left:38%;top:6%">1</em><em style="left:62%;top:6%">3</em><em style="left:86%;top:6%">5</em><em style="left:38%;top:94%">2</em><em style="left:62%;top:94%">4</em><em style="left:86%;top:94%">6</em>
            <div class="gb-knob"></div></div></div>
          <div class="gb-lever gb-4x4"><div class="gb-ltrack"><i></i></div><small>4H</small></div>
          <button class="gb-tog gb-diff" data-touch-ignore>${IC.lock}<small>${LBL.lock()}</small></button>
          <button class="gb-tog gb-hand" data-touch-ignore>${IC.hand}<small>${LBL.hand()}</small></button>
          <button class="gb-tog gb-tire" data-touch-ignore><div class="gb-dial"><i></i></div><small>${LBL.tire()}</small></button>
        </div>
      </div>`;
    root.appendChild(el);
    this.el = el;
    const leds = this.q('.gb-leds');
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('i');
      d.className = i < 7 ? 'g' : i < 10 ? 'y' : 'r';
      leds.appendChild(d);
      this.leds.push(d);
    }
    // analógicos: esquerdo na metade esquerda (fora do painel), direito só no braço da escavadeira
    this.joy = createJoystick(root, {
      zone: (x, y, r) => x < r.width * 0.42 && y > r.height * 0.22,
      deadZone: 0.12,
    });
    this.joyR = createJoystick(root, { side: 'right', zone: (x, y, r) => this.kind === 'excavator' && !this.ctl.drive && x > r.width * 0.55 && y > r.height * 0.22 && x < r.width - 150 });
    this.joyR.setEnabled(false);
    this.look = createLook(root, { zone: (x, y, r) => y < r.height * 0.8 && x > r.width * 0.25 && x < r.width * 0.8 });
    // botões
    const click = (s: string, f: () => void) => this.btns.push(bindButton(this.q(s), { onPress: f }));
    const hold = (s: string, k: keyof Hud['held']) => this.btns.push(bindButton(this.q(s), { onPress: () => (this.held[k] = true), onRelease: () => (this.held[k] = false) }));
    click('.gb-pause', () => cb.pause());
    click('.gb-shop', () => cb.shop());
    click('.gb-ent', () => cb.enterExit());
    click('.gb-rainb', () => cb.rain());
    click('.gb-cam', () => cb.cam());
    click('.gb-mode', () => cb.mode());
    click('.gb-det', () => cb.detector());
    click('.gb-bar', () => cb.barrow());
    hold('.gb-gas', 'gas');
    hold('.gb-brk', 'brake');
    hold('.gb-a1', 'act');
    hold('.gb-a2', 'act2');
    hold('.gb-up', 'up');
    hold('.gb-dn', 'down');
    click('.gb-drv', () => {
      this.ctl.drive = !this.ctl.drive;
      this.layout();
    });
    // painel
    click('.gb-ptab', () => {
      this.panelOpen = !this.panelOpen;
      this.layout();
    });
    click('.gb-auto', () => {
      this.ctl.auto = !this.ctl.auto;
      if (!this.ctl.auto && this.ctl.gearSel === 0) this.ctl.gearSel = 1;
      this.paint();
    });
    click('.gb-4x4', () => {
      this.ctl.mode4 = ((this.ctl.mode4 + 1) % 3) as 0 | 1 | 2;
      this.paint();
    });
    click('.gb-diff', () => {
      this.ctl.diff = !this.ctl.diff;
      this.paint();
    });
    click('.gb-hand', () => {
      this.ctl.hand = !this.ctl.hand;
      this.paint();
    });
    click('.gb-tire', () => {
      this.ctl.pressure = ((this.ctl.pressure + 2) % 3) as 0 | 1 | 2;
      this.paint();
    });
    this.shifter();
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    this.layout();
    this.paint();
  }

  /** câmbio H: arrasta a bola pelas canaletas; solta → engata a marcha mais perto */
  private shifter(): void {
    const grid = this.q('.gb-hgrid');
    const knob = this.q('.gb-knob');
    const cols = [0.14, 0.38, 0.62, 0.86];
    const slots: [number, number, number][] = [
      [0, 0, -1],
      [1, 0, 1],
      [1, 1, 2],
      [2, 0, 3],
      [2, 1, 4],
      [3, 0, 5],
      [3, 1, 6],
    ];
    let pid = -1;
    const place = (fx: number, fy: number) => {
      knob.style.left = fx * 100 + '%';
      knob.style.top = fy * 100 + '%';
    };
    const move = (e: PointerEvent) => {
      const r = grid.getBoundingClientRect();
      let fx = (e.clientX - r.left) / r.width;
      let fy = (e.clientY - r.top) / r.height;
      fx = Math.max(0.14, Math.min(0.86, fx));
      fy = Math.max(0.12, Math.min(0.88, fy));
      // fora do corredor neutro só anda na vertical da coluna
      if (Math.abs(fy - 0.5) > 0.1) {
        let best = cols[0];
        for (const c of cols) if (Math.abs(c - fx) < Math.abs(best - fx)) best = c;
        fx = best;
      }
      place(fx, fy);
      return [fx, fy];
    };
    grid.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pid = e.pointerId;
      grid.setPointerCapture(pid);
      this.ctl.auto = false;
      move(e);
    });
    grid.addEventListener('pointermove', (e) => {
      if (e.pointerId === pid) move(e);
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pid) return;
      pid = -1;
      const [fx, fy] = move(e);
      let g = 0;
      if (Math.abs(fy - 0.5) > 0.16) {
        let bd = 9;
        for (const [ci, row, gear] of slots) {
          const d = Math.abs(cols[ci] - fx) + Math.abs((row ? 0.88 : 0.12) - fy);
          if (d < bd) {
            bd = d;
            g = gear;
          }
        }
      }
      this.ctl.gearSel = g;
      this.paint();
    };
    grid.addEventListener('pointerup', up);
    grid.addEventListener('pointercancel', up);
  }

  private paint(): void {
    const c = this.ctl;
    this.q('.gb-auto').classList.toggle('on', c.auto);
    this.q('.gb-diff').classList.toggle('on', c.diff);
    this.q('.gb-hand').classList.toggle('on', c.hand);
    const l = this.q('.gb-4x4');
    l.dataset.m = String(c.mode4);
    l.querySelector('small')!.textContent = ['2H', '4H', '4L'][c.mode4];
    this.q('.gb-tire').dataset.p = String(c.pressure);
    const knob = this.q('.gb-knob');
    const pos: Record<number, [number, number]> = { [-1]: [0.14, 0.12], 0: [0.38, 0.5], 1: [0.38, 0.12], 2: [0.38, 0.88], 3: [0.62, 0.12], 4: [0.62, 0.88], 5: [0.86, 0.12], 6: [0.86, 0.88] };
    if (!c.auto) {
      const p = pos[c.gearSel] ?? pos[0];
      knob.style.left = p[0] * 100 + '%';
      knob.style.top = p[1] * 100 + '%';
    }
    this.q('.gb-hgrid').classList.toggle('dim', c.auto);
  }

  /** troca os controles conforme a máquina e o modo */
  setKind(kind: Kind, expert: boolean): void {
    this.kind = kind;
    this.ctl.expert = expert;
    if (kind !== 'excavator') this.ctl.drive = true;
    this.layout();
  }
  layout(): void {
    const k = this.kind;
    const veh = k !== 'worker' && k !== 'heli';
    const el = this.el;
    el.dataset.kind = k;
    const exArm = k === 'excavator' && !this.ctl.drive;
    const show = (s: string, on: boolean) => ((this.q(s).hidden = !on), undefined);
    show('.gb-pedals', veh && !exArm);
    const wheeled = k === 'pickup' || k === 'truck';
    show('.gb-panel', wheeled && this.ctl.expert);
    el.classList.toggle('expert', wheeled && this.ctl.expert);
    this.q('.gb-panel').classList.toggle('closed', !this.panelOpen);
    show('.gb-drv', k === 'excavator');
    this.q('.gb-drv').innerHTML = (this.ctl.drive ? IC.arm : IC.tracks) + '';
    show('.gb-up', k === 'dozer' || k === 'heli');
    show('.gb-dn', k === 'dozer' || k === 'heli');
    const a1 = this.q('.gb-a1');
    const a2 = this.q('.gb-a2');
    show('.gb-a1', k === 'worker' || exArm || k === 'heli');
    show('.gb-a2', k === 'worker' || exArm || k === 'truck' || k === 'pickup');
    if (k !== 'worker') show('.gb-bar', false);
    const set = (b: HTMLElement, ic: IconKey, label: string) => (b.innerHTML = IC[ic] + `<span>${label}</span>`);
    if (k === 'worker') {
      set(a1, 'shovel', LBL.dig());
      set(a2, 'dump', LBL.dump());
    } else if (k === 'excavator') {
      set(a1, 'dig', LBL.dig());
      set(a2, 'dump', LBL.dump());
    } else if (k === 'heli') set(a1, 'water', LBL.water());
    else if (k === 'truck') set(a2, 'tip', LBL.bed());
    else if (k === 'pickup') set(a2, 'dump', LBL.unload());
    this.q('.gb-up').innerHTML = k === 'dozer' ? IC.bladeUp : IC.up;
    this.q('.gb-dn').innerHTML = k === 'dozer' ? IC.bladeDown : IC.down;
    const ent = this.q('.gb-ent');
    this.lastTxt = '';
    if (k !== 'worker') ent.hidden = false;
    ent.innerHTML = (k === 'worker' ? IC.enter : IC.exit) + `<span>${k === 'worker' ? LBL.enter() : LBL.exit()}</span>`;
    this.q('.gb-mode').hidden = !wheeled;
    this.q('.gb-mode').classList.toggle('on', this.ctl.expert);
    this.joyR.setEnabled(exArm);
    el.classList.toggle('arm', exArm);
    // painel fica à esquerda do bloco da direita (ações + pedais), nunca por cima
    requestAnimationFrame(() => {
      const rr = this.q('.gb-right').getBoundingClientRect();
      if (rr.width) el.style.setProperty('--rw', Math.round(rr.width + 10) + 'px');
    });
    el.classList.toggle('veh', veh);
    void edges;
  }

  private kd = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'KeyE') this.cb.enterExit();
    if (e.code === 'KeyR') this.cb.rain();
    if (e.code === 'KeyC') this.cb.cam();
    if (e.code === 'KeyT') {
      this.ctl.drive = !this.ctl.drive;
      this.layout();
    }
  };
  private ku = (e: KeyboardEvent) => this.keys.delete(e.code);

  /** lê toques/teclado para this.ctl (uma vez por quadro) */
  read(dt: number): Ctl {
    const c = this.ctl;
    const j = this.joy.read();
    const K = this.keys;
    let mx = j.x;
    let my = j.y;
    if (K.has('ArrowLeft') || K.has('KeyA')) mx = -1;
    if (K.has('ArrowRight') || K.has('KeyD')) mx = 1;
    const gk = K.has('ArrowUp') || K.has('KeyW');
    const bk = K.has('ArrowDown') || K.has('KeyS');
    const veh = this.kind !== 'worker' && this.kind !== 'heli';
    if (!veh || (this.kind === 'excavator' && !c.drive)) {
      if (gk) my = -1;
      if (bk) my = 1;
    }
    c.mx = mx;
    c.my = my;
    const jr = this.joyR.read();
    c.rx = jr.x + (K.has('KeyL') ? 1 : 0) - (K.has('KeyJ') ? 1 : 0);
    c.ry = jr.y + (K.has('KeyK') ? 1 : 0) - (K.has('KeyI') ? 1 : 0);
    const ramp = (v: number, on: boolean) => (on ? Math.min(1, v + dt * 3.5) : Math.max(0, v - dt * 6));
    c.gas = ramp(c.gas, this.held.gas || (veh && gk));
    c.brake = ramp(c.brake, this.held.brake || (veh && bk));
    c.act = this.held.act || K.has('Space');
    c.act2 = this.held.act2 || K.has('KeyF');
    c.up = this.held.up || K.has('KeyQ') || K.has('PageUp');
    c.down = this.held.down || K.has('KeyZ') || K.has('PageDown');
    return c;
  }

  update(s: HudState): void {
    const txt = `${fmtN(s.money)}|${fmtN(s.stock)}|${Math.round(s.fill * 100)}|${s.cargoGold.toFixed(1)}|${s.canEnter}|${s.hot2}|${s.water}|${s.barrow}|${this.kind}`;
    if (txt !== this.lastTxt) {
      this.lastTxt = txt;
      if (this.kind === 'worker') this.q('.gb-a1').innerHTML = s.water ? IC.water + `<span>${LBL.water()}</span>` : IC.shovel + `<span>${LBL.dig()}</span>`;
      this.q('.gb-money b').textContent = fmtN(s.money);
      this.q('.gb-stock b').textContent = fmtN(s.stock) + ' g';
      this.q('.gb-cargo b').textContent = (s.cargoGold < 10 ? s.cargoGold.toFixed(1) : fmtN(s.cargoGold)) + ' g';
      const u = this.q('.gb-cargo u');
      u.style.width = Math.round(s.fill * 100) + '%';
      this.q('.gb-cargo').classList.toggle('full', s.fill > 0.97);
      this.q('.gb-ent').classList.toggle('hot', s.canEnter);
      this.q('.gb-ent').hidden = this.kind === 'worker' ? !s.canEnter : false;
      this.q('.gb-a2').classList.toggle('hot', s.hot2);
      // CARRINHO: largar (empurrando) / pegar (perto dele); longe = apagado
      const bb = this.q('.gb-bar');
      bb.hidden = this.kind !== 'worker' || !s.barrow;
      if (s.barrow) {
        bb.innerHTML = (s.barrow === 'drop' ? IC.barrowDrop : IC.barrowGrab) + `<span>${s.barrow === 'drop' ? LBL.barDrop() : LBL.barGrab()}</span>`;
        bb.classList.toggle('dim', s.barrow === 'far');
        bb.classList.toggle('hot', s.barrow === 'grab');
      }
      // despejar só com o carrinho na mão
      if (this.kind === 'worker') this.q('.gb-a2').hidden = s.barrow === 'grab' || s.barrow === 'far' ? !s.hot2 : false;
    }
    // conta-giros
    const n = Math.round(Math.max(0, Math.min(1, s.rpm)) * 12);
    if (n !== this.lastLed) {
      this.lastLed = n;
      this.leds.forEach((d, i) => d.classList.toggle('on', i < n));
    }
    const gt = s.gear < 0 ? 'R' : s.gear === 0 ? 'N' : (s.auto ? 'A' : '') + s.gear;
    const ge = this.q('.gb-gear');
    if (ge.textContent !== gt) ge.textContent = gt;
    // detector
    const dr = this.q('.gb-detring');
    dr.hidden = s.det === null;
    if (s.det !== null) {
      const v = s.det;
      dr.style.setProperty('--det', v.toFixed(3));
      dr.classList.toggle('hot', v > 0.6);
    }
    this.q('.gb-det').classList.toggle('on', s.det !== null);
    const ar = this.q('.gb-arrow');
    ar.hidden = !s.arrow;
    if (s.arrow) {
      (ar.firstElementChild as HTMLElement).style.transform = `rotate(${s.arrow.a}rad)`;
      const sp = ar.querySelector('span')!;
      const tx = Math.round(s.arrow.dist) + ' m';
      if (sp.dataset.k !== s.arrow.icon + tx) {
        sp.dataset.k = s.arrow.icon + tx;
        sp.innerHTML = IC[s.arrow.icon] + tx;
      }
    }
  }
  /** selo da vista da câmera no botão do topo */
  setCamBadge(txt: string, title: string): void {
    const c = this.q('.gb-cam');
    c.querySelector('i')!.textContent = txt;
    c.setAttribute('aria-label', title);
  }
  setRainIcon(on: boolean): void {
    this.q('.gb-rainb').innerHTML = on ? IC.sun : IC.rain;
  }
  /** pisca um botão para chamar atenção (dica) */
  flash(sel: 'diff' | 'tire' | '4x4' | 'a2' | 'ent' | 'shop'): void {
    const m: Record<string, string> = { diff: '.gb-diff', tire: '.gb-tire', '4x4': '.gb-4x4', a2: '.gb-a2', ent: '.gb-ent', shop: '.gb-shop' };
    const e = this.q(m[sel]);
    e.classList.remove('flash');
    void e.offsetWidth;
    e.classList.add('flash');
  }
  setVisible(on: boolean): void {
    this.el.hidden = !on;
    this.joy.setEnabled(on);
    this.joyR.setEnabled(on && this.kind === 'excavator' && !this.ctl.drive);
    this.look.setEnabled?.(on);
    if (!on) for (const k of Object.keys(this.held) as (keyof Hud['held'])[]) this.held[k] = false;
  }
  destroy(): void {
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
    for (const b of this.btns) b.destroy();
    this.joy.destroy();
    this.joyR.destroy();
    this.look.destroy?.();
    this.el.remove();
  }
}
