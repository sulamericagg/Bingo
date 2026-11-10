/* ============================================================
 *  POUSO FORÇADO — HUD em HTML: barra de cima, avisos curtos com
 *  ícone, marcadores sobre as emergências (com seta na borda),
 *  minimapa da cabine, retratos dos ajudantes + menu de ordens,
 *  joystick/olhar/ação a pé e manche/manete/flapes/trem sentado.
 * ============================================================ */
import { t } from '../../i18n';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { save as globalSave } from '../../core/storage';
import { emerHow, emerName, roleName, zoneName } from './data';
import { hatIcon, vIcon } from './icons';
import { drawNav, drawPFD } from './instruments';
import { MiniGame } from './minigames';
import type { Cmd, Ctx, Sim } from './sim';

export interface HudHost {
  sim: Sim;
  is3d: boolean;
  joy: { x: number; y: number };
  actHeld: boolean;
  look(dx: number, dy: number): void;
  facing(): [number, number];
  project(x: number, y: number, z: number, out: { x: number; y: number; behind: boolean }): void;
  onTap(): void;
  onThrow(): void;
  onExit(): void;
  onStand(): void;
  onCam(): void;
  extCam(): boolean;
}

const TAU = Math.PI * 2;

export class Hud {
  el: HTMLDivElement;
  readonly pfd: HTMLCanvasElement;
  readonly nav: HTMLCanvasElement;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private toasts!: HTMLElement;
  private mk = new Map<number, HTMLDivElement>();
  private says = new Map<number, HTMLDivElement>();
  private mini!: HTMLCanvasElement;
  private miniX!: CanvasRenderingContext2D;
  private crewEl!: HTMLElement;
  private menu: HTMLDivElement | null = null;
  private menuFor = -1;
  private walk!: HTMLElement;
  private fly!: HTMLElement;
  private act!: HTMLButtonElement;
  private thr!: HTMLButtonElement;
  private ring!: SVGCircleElement;
  private tgt!: HTMLElement;
  private ret!: HTMLElement;
  private hint!: HTMLElement;
  private banner!: HTMLElement;
  private stick!: HTMLElement;
  private thrEl!: HTMLElement;
  private phase!: HTMLElement;
  private hullI!: HTMLElement;
  private panI!: HTMLElement;
  miniGame: MiniGame | null = null;
  private pfdX: CanvasRenderingContext2D;
  private navX: CanvasRenderingContext2D;
  private instT = 0;
  private bannerT = 0;
  private lastCtx = '';
  private seated = false;
  private keys = new Set<string>();
  private offs: (() => void)[] = [];
  private stickV = { x: 0, y: 0, on: false };
  private pr = { x: 0, y: 0, behind: false };
  private ctx: Ctx | null = null;
  private _hidden = false;
  get hidden(): boolean {
    return this._hidden;
  }
  set hidden(v: boolean) {
    this._hidden = v;
    this.el.style.display = v ? 'none' : '';
  }
  face2d: [number, number] = [0, -1];

  constructor(
    root: HTMLElement,
    private host: HudHost,
  ) {
    this.pfd = document.createElement('canvas');
    this.pfd.width = 420;
    this.pfd.height = 280;
    this.pfd.className = 'voo-pfd';
    this.pfdX = this.pfd.getContext('2d')!;
    this.nav = document.createElement('canvas');
    this.nav.width = 420;
    this.nav.height = 280;
    this.navX = this.nav.getContext('2d')!;
    this.el = document.createElement('div');
    this.el.className = 'voo-hud';
    this.el.innerHTML = `
      <div class="voo-walk">
        <div class="voo-look"></div>
        <div class="voo-joy"><div class="hint"></div><div class="base"><div class="knob"></div></div></div>
        <div class="voo-ret"></div><div class="voo-tgt"></div>
        <div class="voo-acts">
          <button class="voo-act small off" data-thr>${vIcon('throw', 26)}<span>${t('voo.a.throw', 'Jogar')}</span></button>
          <button class="voo-act" data-act><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#5ef08a" stroke-width="7" stroke-dasharray="289" stroke-dashoffset="289" stroke-linecap="round"/></svg><span class="ic">${vIcon('hand', 30)}</span><span class="lb">${t('voo.a.use', 'Usar')}</span></button>
        </div>
      </div>
      <div class="voo-fly" style="display:none">
        <div class="voo-stick"><span>${t('voo.f.yoke', 'Manche')}</span><i>${vIcon('yoke', 34)}</i></div>
        <div class="voo-thr"><span>${t('voo.f.thr', 'Potência')}</span><i>70</i></div>
        <div class="voo-flyb">
          <button class="voo-btn ghost" data-flaps>${vIcon('flaps', 22)}<span></span></button>
          <button class="voo-btn ghost" data-gear>${vIcon('gear', 22)}<span></span></button>
        </div>
        <div class="voo-flytop">
          <button class="voo-btn gold" data-stand>${vIcon('up', 22)}<span>${t('voo.f.stand', 'Levantar')}</span></button>
          <button class="voo-btn ghost" data-cam>${vIcon('cam', 22)}<span>${t('voo.f.cam', 'Câmera')}</span></button>
        </div>
      </div>
      <div class="voo-top">
        <button class="voo-btn round red" data-exit aria-label="${t('voo.exit', 'Sair')}">${vIcon('close', 26)}</button>
        <div class="voo-pill" data-phase></div>
        <div class="voo-bars">
          <div>${t('voo.hud.hull', 'Casco')}<b><i data-hull style="background:linear-gradient(90deg,#ff5c7a,#5ef08a)"></i></b></div>
          <div>${t('voo.hud.panic', 'Pânico')}<b><i data-pan style="background:linear-gradient(90deg,#ffd34a,#ff4d6a)"></i></b></div>
        </div>
        <div class="voo-right">
          <canvas class="voo-mini" width="440" height="116"></canvas>
          <div class="voo-crew"></div>
        </div>
      </div>
      <div class="voo-toasts"></div>
      <div class="voo-hint"></div>
      <div class="voo-banner"></div>
      <div class="voo-mks"></div>`;
    root.appendChild(this.el);
    this.q('.voo-fly').prepend(this.pfd);
    this.toasts = this.q('.voo-toasts');
    this.mini = this.q('.voo-mini');
    this.miniX = this.mini.getContext('2d')!;
    this.crewEl = this.q('.voo-crew');
    this.walk = this.q('.voo-walk');
    this.fly = this.q('.voo-fly');
    this.act = this.q('[data-act]');
    this.thr = this.q('[data-thr]');
    this.ring = this.act.querySelector('circle')!;
    this.tgt = this.q('.voo-tgt');
    this.ret = this.q('.voo-ret');
    this.hint = this.q('.voo-hint');
    this.banner = this.q('.voo-banner');
    this.stick = this.q('.voo-stick');
    this.thrEl = this.q('.voo-thr');
    this.phase = this.q('[data-phase]');
    this.hullI = this.q('[data-hull]');
    this.panI = this.q('[data-pan]');
    if (!host.is3d) {
      this.ret.style.display = 'none';
      this.q('.voo-look').style.display = 'none';
      this.q('[data-cam]').style.display = 'none';
    }
    this.buildCrew();
    this.bind();
  }

  /* ------------------------------ entrada ------------------------------ */

  private bind(): void {
    const h = this.host;
    const s = h.sim;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-exit],[data-flaps],[data-gear],[data-stand],[data-cam],[data-mate],[data-cmd]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.exit !== undefined) h.onExit();
      else if (b.dataset.flaps !== undefined) s.f.flaps = (s.f.flaps + 1) % 3;
      else if (b.dataset.gear !== undefined) this.toggleGear();
      else if (b.dataset.stand !== undefined) h.onStand();
      else if (b.dataset.cam !== undefined) h.onCam();
      else if (b.dataset.mate !== undefined) this.openMenu(+b.dataset.mate);
      else if (b.dataset.cmd !== undefined) this.doCmd(b.dataset.cmd);
    });
    // ação (tocar ou segurar)
    const act = this.act;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      act.setPointerCapture?.(e.pointerId);
      act.classList.add('on');
      h.actHeld = true;
      h.onTap();
    };
    const up = () => {
      act.classList.remove('on');
      h.actHeld = false;
    };
    act.addEventListener('pointerdown', down);
    act.addEventListener('pointerup', up);
    act.addEventListener('pointercancel', up);
    act.addEventListener('lostpointercapture', up);
    this.thr.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      h.onThrow();
    });
    // joystick dinâmico
    const joy = this.q('.voo-joy');
    const base = joy.querySelector('.base') as HTMLElement;
    const knob = joy.querySelector('.knob') as HTMLElement;
    const jh = joy.querySelector('.hint') as HTMLElement;
    let jid = -1;
    let jx0 = 0;
    let jy0 = 0;
    joy.addEventListener('pointerdown', (e) => {
      if (jid >= 0) return;
      jid = e.pointerId;
      joy.setPointerCapture?.(e.pointerId);
      const r = joy.getBoundingClientRect();
      jx0 = e.clientX;
      jy0 = e.clientY;
      base.style.display = 'block';
      base.style.left = e.clientX - r.left + 'px';
      base.style.top = e.clientY - r.top + 'px';
      jh.style.display = 'none';
    });
    joy.addEventListener('pointermove', (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - jx0;
      let dy = e.clientY - jy0;
      const d = Math.hypot(dx, dy);
      const R = 48;
      if (d > R) (dx *= R / d), (dy *= R / d);
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      h.joy.x = dx / R;
      h.joy.y = -dy / R;
    });
    const jup = (e: PointerEvent) => {
      if (e.pointerId !== jid) return;
      jid = -1;
      h.joy.x = h.joy.y = 0;
      base.style.display = 'none';
      knob.style.transform = '';
    };
    joy.addEventListener('pointerup', jup);
    joy.addEventListener('pointercancel', jup);
    // olhar (arrastar)
    const look = this.q('.voo-look');
    let lid = -1;
    let lx = 0;
    let ly = 0;
    look.addEventListener('pointerdown', (e) => {
      if (lid >= 0) return;
      lid = e.pointerId;
      look.setPointerCapture?.(e.pointerId);
      lx = e.clientX;
      ly = e.clientY;
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== lid) return;
      h.look((e.clientX - lx) * 0.0058, (e.clientY - ly) * 0.0058);
      lx = e.clientX;
      ly = e.clientY;
    });
    const lup = (e: PointerEvent) => {
      if (e.pointerId === lid) lid = -1;
    };
    look.addEventListener('pointerup', lup);
    look.addEventListener('pointercancel', lup);
    // manche (volta ao centro ao soltar)
    const st = this.stick;
    const knobS = st.querySelector('i') as HTMLElement;
    let sid = -1;
    const smove = (e: PointerEvent) => {
      if (e.pointerId !== sid) return;
      const r = st.getBoundingClientRect();
      let dx = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.4);
      let dy = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.4);
      const d = Math.hypot(dx, dy);
      if (d > 1) (dx /= d), (dy /= d);
      this.stickV.x = dx;
      this.stickV.y = -dy;
      knobS.style.transform = `translate(${dx * r.width * 0.4}px,${dy * r.height * 0.4}px) rotate(${dx * 25}deg)`;
    };
    st.addEventListener('pointerdown', (e) => {
      sid = e.pointerId;
      st.setPointerCapture?.(e.pointerId);
      this.stickV.on = true;
      smove(e);
    });
    st.addEventListener('pointermove', smove);
    const sup = (e: PointerEvent) => {
      if (e.pointerId !== sid) return;
      sid = -1;
      this.stickV.x = this.stickV.y = 0;
      this.stickV.on = false;
      knobS.style.transform = '';
    };
    st.addEventListener('pointerup', sup);
    st.addEventListener('pointercancel', sup);
    // manete (fica onde soltar)
    const te = this.thrEl;
    let tid = -1;
    const tmove = (e: PointerEvent) => {
      if (e.pointerId !== tid) return;
      const r = te.getBoundingClientRect();
      const k = 1 - (e.clientY - r.top - 20) / (r.height - 40);
      s.ctrl.thr = Math.max(0, Math.min(1, k));
    };
    te.addEventListener('pointerdown', (e) => {
      tid = e.pointerId;
      te.setPointerCapture?.(e.pointerId);
      tmove(e);
    });
    te.addEventListener('pointermove', tmove);
    te.addEventListener('pointerup', () => (tid = -1));
    // teclado
    const kd = (e: KeyboardEvent) => {
      if (this.keys.has(e.code)) return;
      this.keys.add(e.code);
      const me = s.players[s.me];
      if (e.code === 'KeyE' || e.code === 'Space') {
        h.actHeld = true;
        h.onTap();
      } else if (e.code === 'KeyQ') h.onThrow();
      else if (e.code === 'KeyF' && me.seated) s.f.flaps = (s.f.flaps + 1) % 3;
      else if (e.code === 'KeyG' && me.seated) this.toggleGear();
      else if (e.code === 'KeyC') h.onCam();
      else if (e.code === 'KeyX' && me.seated) h.onStand();
      else return;
      e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE' || e.code === 'Space') h.actHeld = false;
    };
    const blur = () => {
      this.keys.clear();
      h.actHeld = false;
      h.joy.x = h.joy.y = 0;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    });
  }

  private toggleGear(): void {
    const s = this.host.sim;
    if (s.gearStuck) {
      this.toast(t('voo.t.gearStuck', 'O trem não desce! Alguém precisa girar a manivela no porão'), 'gear', 'bad');
      return;
    }
    s.f.gear = s.f.gear ? 0 : 1;
  }

  /** teclado/joystick → entrada da sim e do manche */
  readInput(): void {
    const k = this.keys;
    const h = this.host;
    const s = h.sim;
    let jx = h.joy.x;
    let jy = h.joy.y;
    if (k.has('KeyW') || k.has('ArrowUp')) jy = 1;
    if (k.has('KeyS') || k.has('ArrowDown')) jy = -1;
    if (k.has('KeyA') || k.has('ArrowLeft')) jx = -1;
    if (k.has('KeyD') || k.has('ArrowRight')) jx = 1;
    const me = s.players[s.me];
    if (me.seated) {
      let sx = this.stickV.x;
      let sy = this.stickV.y;
      if (!this.stickV.on) {
        if (k.has('KeyA') || k.has('ArrowLeft')) sx = -1;
        if (k.has('KeyD') || k.has('ArrowRight')) sx = 1;
        if (k.has('KeyW') || k.has('ArrowUp')) sy = 1;
        if (k.has('KeyS') || k.has('ArrowDown')) sy = -1;
      }
      // curva suave: precisão perto do centro
      s.ctrl.sx = Math.sign(sx) * Math.pow(Math.abs(sx), 1.6);
      s.ctrl.sy = Math.sign(sy) * Math.pow(Math.abs(sy), 1.6);
      if (k.has('ShiftLeft') || k.has('KeyR')) s.ctrl.thr = Math.min(1, s.ctrl.thr + 0.01);
      if (k.has('ControlLeft') || k.has('KeyV')) s.ctrl.thr = Math.max(0, s.ctrl.thr - 0.01);
      s.input.mx = s.input.mz = 0;
      return;
    }
    if (!h.is3d) {
      // 2D: tela para cima = lado direito do avião (+x), direita = cauda (+z)
      s.input.mx = jy;
      s.input.mz = jx;
      if (Math.hypot(jx, jy) > 0.2) this.face2d = [jy, jx];
    }
    const [fx, fz] = h.facing();
    if (h.is3d) {
      // frente = (fx,fz); direita = (-fz, fx)
      s.input.mx = fx * jy + -fz * jx;
      s.input.mz = fz * jy + fx * jx;
    }
    s.input.fx = fx;
    s.input.fz = fz;
    s.input.act = h.actHeld;
  }

  /* ------------------------------ tripulação ------------------------------ */

  private buildCrew(): void {
    const s = this.host.sim;
    this.crewEl.innerHTML = '';
    for (const p of s.players) {
      if (p.idx === s.me) continue;
      const b = document.createElement('button');
      b.className = 'voo-mate';
      b.dataset.mate = String(p.idx);
      b.title = p.name + ' — ' + roleName(p.role);
      const c = document.createElement('canvas');
      c.width = c.height = 80;
      const x = c.getContext('2d')!;
      x.translate(40, 46);
      const skin = SKINS.find((k) => k.id === p.skin) ?? SKINS.find((k) => k.id === globalSave.skin) ?? SKINS[0];
      const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
      try {
        drawPlayer(x, skin, 26, pose);
      } catch {
        /* */
      }
      b.appendChild(c);
      b.insertAdjacentHTML('beforeend', `<span class="hat">${hatIcon(p.role, 24)}</span><span class="st"></span>`);
      this.crewEl.appendChild(b);
    }
  }

  private openMenu(idx: number): void {
    const s = this.host.sim;
    const p = s.players[idx];
    if (!p || !p.bot) return;
    if (this.menu && this.menuFor === idx) return this.closeMenu();
    this.closeMenu();
    this.menuFor = idx;
    const m = document.createElement('div');
    m.className = 'voo-menu';
    const em = s.active().filter((e) => e.kind !== 'turb');
    m.innerHTML =
      `<h4>${hatIcon(p.role, 22)}${p.name}</h4><small>${t('voo.cmd.note', 'Ajudantes só fazem o que você manda (e demoram um pouquinho).')}</small>` +
      em.map((e) => `<button data-cmd="fix:${e.id}">${vIcon(e.kind, 22)}${emerName(e.kind).replace('!', '')}</button>`).join('') +
      `<button data-cmd="pilot">${vIcon('yoke', 22)}${t('voo.cmd.pilot', 'Segurar o manche')}</button>` +
      `<button data-cmd="calm">${vIcon('calm', 22)}${t('voo.cmd.calm', 'Acalmar passageiros')}</button>` +
      `<button data-cmd="follow">${vIcon('follow', 22)}${t('voo.cmd.follow', 'Me seguir')}</button>` +
      `<button data-cmd="stay">${vIcon('stay', 22)}${t('voo.cmd.stay', 'Parar')}</button>`;
    this.el.appendChild(m);
    this.menu = m;
    this.crewEl.querySelectorAll('.voo-mate').forEach((b) => b.classList.toggle('sel', (b as HTMLElement).dataset.mate === String(idx)));
  }
  closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
    this.menuFor = -1;
    this.crewEl.querySelectorAll('.voo-mate').forEach((b) => b.classList.remove('sel'));
  }
  private doCmd(c: string): void {
    const s = this.host.sim;
    const p = s.players[this.menuFor];
    if (!p) return;
    let cmd: Cmd;
    if (c.startsWith('fix:')) cmd = { kind: 'fix', emer: +c.slice(4) };
    else cmd = { kind: c as Cmd['kind'] };
    s.command(p, cmd);
    this.closeMenu();
  }

  /* ------------------------------ avisos ------------------------------ */

  toast(msg: string, ico: string, tone: string): void {
    const d = document.createElement('div');
    d.className = 'voo-toast ' + tone;
    d.innerHTML = vIcon(ico, 22) + '<span></span>';
    d.querySelector('span')!.textContent = msg;
    this.toasts.appendChild(d);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => d.remove(), 3700);
  }
  showBanner(txt: string, sub = '', sec = 2.4): void {
    this.banner.innerHTML = '';
    this.banner.textContent = txt;
    if (sub) {
      const sm = document.createElement('small');
      sm.textContent = sub;
      this.banner.appendChild(sm);
    }
    this.banner.classList.add('show');
    this.bannerT = sec;
  }
  say(idx: number, msg: string): void {
    let d = this.says.get(idx);
    if (!d) {
      d = document.createElement('div');
      d.className = 'voo-say';
      this.q('.voo-mks').appendChild(d);
      this.says.set(idx, d);
    }
    d.textContent = msg;
    d.dataset.t = String(performance.now() + 2600);
  }

  openMini(kind: 'rewire' | 'pump' | 'valve' | 'crank', emer: number): void {
    const s = this.host.sim;
    this.closeMini(false);
    this.miniGame = new MiniGame(
      this.el,
      kind,
      (amt) => s.miniAdd(emer, amt, s.players[s.me]),
      () => this.closeMini(true),
    );
  }
  closeMini(user: boolean): void {
    if (!this.miniGame) return;
    this.miniGame.destroy();
    this.miniGame = null;
    const s = this.host.sim;
    s.miniClose(s.players[s.me]);
    void user;
  }

  /* ------------------------------ quadro ------------------------------ */

  update(dt: number): void {
    const h = this.host;
    const s = h.sim;
    const f = s.f;
    const me = s.players[s.me];
    if (this._hidden) return;
    // minijogo aberto pela sim
    if (s.miniOpen && !this.miniGame) this.openMini(s.miniOpen.kind, s.miniOpen.emer);
    if (this.miniGame) {
      this.miniGame.update(dt);
      if (me.busy < 0 || !s.emer(s.miniOpen?.emer ?? -1)) {
        this.miniGame.destroy();
        this.miniGame = null;
        s.miniOpen = null;
        me.busy = -1;
      }
    }
    // modo sentado x a pé
    if (me.seated !== this.seated) {
      this.seated = me.seated;
      this.walk.style.display = me.seated ? 'none' : '';
      this.fly.style.display = me.seated ? '' : 'none';
      h.actHeld = false;
    }
    // topo
    const phaseTxt =
      s.phase === 'cruise' ? t('voo.p.cruise', 'Cruzeiro') : s.phase === 'descent' ? t('voo.p.descent', 'Descida') : s.phase === 'final' ? t('voo.p.final', 'Aproximação') : t('voo.p.land', 'Pouso');
    const ph = `${vIcon('plane', 24)}<span>${phaseTxt} · ${(f.dist / 1000).toFixed(1)} km · ${Math.round(f.alt)} m</span>`;
    if (this.phase.dataset.v !== ph) {
      this.phase.dataset.v = ph;
      this.phase.innerHTML = ph;
    }
    this.hullI.style.width = Math.round(s.hull) + '%';
    this.panI.style.width = Math.round(s.panicAvg * 100) + '%';
    // ação contextual
    if (!me.seated) {
      const [fx, fz] = h.facing();
      const c = s.contextFor(me, fx, fz);
      this.ctx = c;
      const key = c.kind + c.label + (s.item(me.hold)?.kind ?? '');
      if (key !== this.lastCtx) {
        this.lastCtx = key;
        const ico =
          c.kind === 'spray' ? 'ext' : c.kind === 'patch' ? 'tape' : c.kind === 'pump' ? 'fuel' : c.kind === 'rewire' ? 'spark' : c.kind === 'valve' ? 'pressure' : c.kind === 'crank' ? 'gear' : c.kind === 'door' ? 'door' : c.kind === 'give' || c.kind === 'hug' ? 'calm' : c.kind === 'sit' ? 'yoke' : c.kind === 'take' ? (c.target === 0 ? 'water' : 'snack') : 'hand';
        this.act.querySelector('.ic')!.innerHTML = vIcon(ico, 30);
        this.act.querySelector('.lb')!.textContent = c.label || t('voo.a.use', 'Usar');
        this.act.classList.toggle('off', !c.kind);
        this.tgt.textContent = c.kind ? c.label : '';
        this.ret.classList.toggle('hot', !!c.kind);
        const held = s.item(me.hold);
        this.thr.classList.toggle('off', !held);
      }
      const prog = me.actKind === 'spray' ? me.actProg : me.actProg;
      this.ring.style.strokeDashoffset = String(289 * (1 - Math.max(0, Math.min(1, h.actHeld && c.hold ? prog : 0))));
    } else {
      const fb = this.q('[data-flaps] span');
      const ft = t('voo.f.flaps', 'Flape {n}', { n: f.flaps });
      if (fb.textContent !== ft) fb.textContent = ft;
      const gb = this.q('[data-gear]');
      const gt = s.gearStuck ? t('voo.f.gearStuck', 'Trem travado') : f.gear ? t('voo.f.gearIsDown', 'Trem: baixado') : t('voo.f.gearIsUp', 'Trem: recolhido');
      const gs = gb.querySelector('span')!;
      if (gs.textContent !== gt) gs.textContent = gt;
      gb.classList.toggle('warn', (s.phase === 'final' && !f.gear && f.alt < 600) || s.gearStuck);
      const ti = this.thrEl.querySelector('i') as HTMLElement;
      const th = this.thrEl.clientHeight || 170;
      ti.style.top = 4 + (1 - s.ctrl.thr) * (th - 48) + 'px';
      ti.textContent = String(Math.round(s.ctrl.thr * 100));
      this.q('[data-cam]').classList.toggle('on', h.extCam());
    }
    // dica
    const tip = this.tipText();
    if (this.hint.textContent !== tip) this.hint.textContent = tip;
    // instrumentos
    this.instT -= dt;
    if (this.instT <= 0) {
      this.instT = 1 / 15;
      drawPFD(this.pfdX, this.pfd.width, this.pfd.height, s);
      drawNav(this.navX, this.nav.width, this.nav.height, s);
    }
    this.drawMini();
    this.updateMarkers();
    // retratos: ícone do que o bot está fazendo
    this.crewEl.querySelectorAll<HTMLElement>('.voo-mate').forEach((b) => {
      const p = s.players[+b.dataset.mate!];
      const st = b.querySelector('.st') as HTMLElement;
      const ic = p.seated ? 'yoke' : p.cmd ? (p.cmd.kind === 'fix' ? s.emer(p.cmd.emer ?? -1)?.kind ?? 'check' : p.cmd.kind === 'calm' ? 'calm' : p.cmd.kind === 'follow' ? 'follow' : 'stay') : 'stay';
      if (st.dataset.i !== ic) {
        st.dataset.i = ic;
        st.innerHTML = vIcon(ic, 16);
      }
    });
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner.classList.remove('show');
    }
  }

  private tipText(): string {
    const s = this.host.sim;
    const me = s.players[s.me];
    if (me.seated) {
      const f = s.f;
      if (s.phase === 'final') {
        if (f.alt < 120) return t('voo.tip.flare', 'Puxe de leve o manche no fim: toque suave abaixo de 2 m/s');
        return t('voo.tip.final', 'Siga os losangos rosa. Luzes PAPI: 2 brancas + 2 vermelhas = no ponto');
      }
      if (s.phase === 'descent') return t('voo.tip.descent', 'Desça até a seta rosa da altitude e siga a seta-guia');
      return t('voo.tip.cruise', 'Mantenha as asas niveladas e siga a seta rosa');
    }
    if (me.stun > 0) return t('voo.tip.stun', 'Uoou! Tontinho...');
    const c = this.ctx;
    if (c && c.kind) {
      const e = s.emer(c.target);
      if (e && (c.kind === 'spray' || c.kind === 'door' || c.kind === 'patch')) return t('voo.tip.hold', 'Segure o botão até terminar');
    }
    const act = s.active().filter((e) => e.kind !== 'turb');
    if (!act.length) return s.pilot ? '' : t('voo.tip.nopilot', 'Ninguém pilotando! Volte ao manche (ou mande um ajudante)');
    const e = act[act.length - 1];
    return emerHow(e.kind, e.stage) + ' · ' + zoneName(e.z);
  }

  private drawMini(): void {
    const s = this.host.sim;
    const x = this.miniX;
    const W = this.mini.width;
    const H = this.mini.height;
    x.clearRect(0, 0, W, H);
    const zx = (z: number) => 18 + ((z + 4.5) / 26) * (W - 30);
    const xy = (px: number) => H / 2 + (px / 1.9) * (H * 0.36);
    // fuselagem
    x.fillStyle = '#efe9f6';
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(zx(-4.6), H / 2);
    x.quadraticCurveTo(zx(-4.2), xy(-1.9), zx(-2.5), xy(-1.85));
    x.lineTo(zx(21.2), xy(-1.85));
    x.lineTo(zx(21.2), xy(1.85));
    x.lineTo(zx(-2.5), xy(1.85));
    x.quadraticCurveTo(zx(-4.2), xy(1.9), zx(-4.6), H / 2);
    x.fill();
    x.stroke();
    // zonas
    x.fillStyle = '#d8d0e8';
    x.fillRect(zx(16.6), xy(-1.8), zx(21) - zx(16.6), xy(1.8) - xy(-1.8));
    x.fillStyle = '#c8d4f0';
    x.fillRect(zx(-4), xy(-1.8), zx(-1.2) - zx(-4), xy(1.8) - xy(-1.8));
    // passageiros
    for (const p of s.pax) {
      x.fillStyle = p.panic > 0.7 ? '#ff4d6a' : p.panic > 0.4 ? '#ffb02e' : '#b5a8d0';
      x.beginPath();
      x.arc(zx(p.z), xy(p.x), 3.2, 0, TAU);
      x.fill();
    }
    // emergências
    const blink = Math.floor(performance.now() / 300) % 2 === 0;
    for (const e of s.active()) {
      if (e.kind === 'turb' || e.kind === 'panic') continue;
      x.fillStyle = blink ? '#ff2a4a' : '#ffd34a';
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(zx(e.z), xy(Math.max(-1.6, Math.min(1.6, e.x))), 7, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.font = '900 10px sans-serif';
      x.textAlign = 'center';
      x.fillText('!', zx(e.z), xy(Math.max(-1.6, Math.min(1.6, e.x))) + 4);
    }
    // tripulação
    for (const p of s.players) {
      const me = p.idx === s.me;
      x.fillStyle = me ? '#ffd34a' : ['#2b2f6b', '#2fb6ff', '#ff5c8a', '#18b89a'][p.role];
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 2;
      x.beginPath();
      x.arc(zx(p.z), xy(p.x), me ? 6 : 5, 0, TAU);
      x.fill();
      x.stroke();
      if (me) {
        x.strokeStyle = '#ffd34a';
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(zx(p.z), xy(p.x));
        x.lineTo(zx(p.z + Math.cos(p.yaw) * 1.2), xy(p.x + Math.sin(p.yaw) * 1.2));
        x.stroke();
      }
    }
  }

  private updateMarkers(): void {
    const h = this.host;
    const s = h.sim;
    const me = s.players[s.me];
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const seen = new Set<number>();
    const box = this.q('.voo-mks');
    for (const e of s.active()) {
      if (e.kind === 'turb') continue;
      seen.add(e.id);
      let d = this.mk.get(e.id);
      if (!d) {
        d = document.createElement('div');
        d.className = 'voo-mk';
        d.innerHTML = vIcon(e.kind, 28) + '<span></span><em></em>';
        box.appendChild(d);
        this.mk.set(e.id, d);
      }
      h.project(e.x, e.y + 0.45, e.z, this.pr);
      let px = this.pr.x;
      let py = this.pr.y;
      const m = 34;
      let edge = this.pr.behind || px < m || px > W - m || py < 86 || py > H - m;
      if (!h.is3d) edge = px < m || px > W - m || py < m || py > H - m;
      const em = d.querySelector('em') as HTMLElement;
      if (edge) {
        const cx = W / 2;
        const cy = H / 2;
        let dx = px - cx;
        let dy = py - cy;
        if (this.pr.behind && h.is3d) dy = Math.abs(dy) + 60;
        const k = Math.min((W / 2 - m - 10) / Math.max(1, Math.abs(dx)), (H / 2 - 70) / Math.max(1, Math.abs(dy)));
        px = cx + dx * k;
        py = Math.max(90, cy + dy * k + 15);
        em.style.display = '';
        em.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
      } else em.style.display = 'none';
      d.classList.toggle('edge', edge);
      d.classList.toggle('mine', me.busy === e.id || me.actTarget === e.id);
      d.style.transform = `translate(${px}px,${py}px)`;
      const dist = Math.hypot(e.x - me.x, e.z - me.z);
      const lbl = `${Math.round(dist)} m`;
      const sp = d.querySelector('span')!;
      if (sp.textContent !== lbl) sp.textContent = lbl;
    }
    for (const [id, d] of this.mk)
      if (!seen.has(id)) {
        d.remove();
        this.mk.delete(id);
      }
    // falas dos bots
    const now = performance.now();
    for (const [idx, d] of this.says) {
      const p = s.players[idx];
      if (!p || +(d.dataset.t ?? 0) < now) {
        d.style.display = 'none';
        continue;
      }
      h.project(p.x, p.seated ? 1.6 : 1.55, p.seated ? -2.9 : p.z, this.pr);
      d.style.display = this.pr.behind ? 'none' : '';
      d.style.transform = `translate(${this.pr.x}px,${this.pr.y}px) translate(-50%,-100%)`;
    }
  }

  destroy(): void {
    for (const f of this.offs) f();
    this.miniGame?.destroy();
    this.el.remove();
  }
}
