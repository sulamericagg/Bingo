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
import { FpsControls, bindButton, createJoystick, type BoundButton, type Joystick } from '../../ui/touch';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyAlign, setNotifyTop } from '../../ui/notify';
import type { IconName } from '../../ui/icons';
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
  private banner!: HTMLElement;
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
  private btns: BoundButton[] = [];
  private fps: FpsControls | null = null;
  private joy2d: Joystick | null = null;
  private yoke!: Joystick;
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
  /** tutorial: texto do objetivo e alvo (seta amarela) */
  tutText = '';
  tutTarget: { x: number; y: number; z: number } | null = null;
  private lastTip = '\u0000';
  private tutMk: HTMLDivElement | null = null;

  constructor(
    private surface: HTMLElement,
    private host: HudHost,
  ) {
    const root = surface;
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
        <div class="voo-ret"></div><div class="voo-tgt"></div>
        <div class="voo-acts">
          <button class="voo-act small off" data-thr>${vIcon('throw', 26)}<span>${t('voo.a.throw', 'Jogar')}</span></button>
          <button class="voo-act" data-act><svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="#5ef08a" stroke-width="7" stroke-dasharray="289" stroke-dashoffset="289" stroke-linecap="round"/></svg><span class="ic">${vIcon('hand', 30)}</span><span class="lb">${t('voo.a.use', 'Usar')}</span></button>
        </div>
      </div>
      <div class="voo-fly" style="display:none">
        <div class="voo-stickhint">${vIcon('yoke', 26)}<span>${t('voo.f.yokeHint', 'Arraste aqui: manche')}</span></div>
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
      <div class="voo-banner"></div>
      <div class="voo-mks"></div>`;
    root.appendChild(this.el);
    this.q('.voo-fly').prepend(this.pfd);
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
    this.banner = this.q('.voo-banner');
    this.thrEl = this.q('.voo-thr');
    this.phase = this.q('[data-phase]');
    this.hullI = this.q('[data-hull]');
    this.panI = this.q('[data-pan]');
    if (!host.is3d) {
      this.ret.style.display = 'none';
      this.q('[data-cam]').style.display = 'none';
    }
    this.buildCrew();
    this.bind();
    setNotifyTop(66);
    setNotifyAlign('center');
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
    // ação (tocar ou segurar) e jogar — botões compartilhados (disparam no toque)
    this.btns.push(
      bindButton(this.act, {
        onPress: () => {
          h.actHeld = true;
          h.onTap();
        },
        onRelease: () => (h.actHeld = false),
      }),
      bindButton(this.thr, { onPress: () => h.onThrow() }),
    );
    // andar + olhar (3D) ou só andar (2D): controles compartilhados de src/ui/touch
    this.fps = h.is3d ? new FpsControls(this.surface, { joystick: { zoneTop: 0.3 } }) : null;
    this.joy2d = h.is3d ? null : createJoystick(this.surface, { zoneTop: 0.3, zoneWidth: 0.5 });
    // manche: joystick flutuante que volta ao centro (só aparece sentado)
    this.yoke = createJoystick(this.surface, { zoneTop: 0.25, zoneWidth: 0.42, expo: 0.55, smoothing: 22 });
    this.yoke.setEnabled(false);
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
  readInput(dt: number): void {
    const k = this.keys;
    const h = this.host;
    const s = h.sim;
    const me = s.players[s.me];
    // só os controles do lugar onde você está
    const sit = me.seated && !this.hidden;
    this.yoke.setEnabled(sit);
    this.fps?.show(!me.seated && !this.hidden && me.busy < 0);
    this.joy2d?.setEnabled(!me.seated && !this.hidden && me.busy < 0);
    let jx = 0;
    let jy = 0;
    if (this.fps) {
      [jx, jy] = this.fps.dir();
      const [dy, dp] = this.fps.consumeLook(dt);
      if (dy || dp) h.look(dy, dp);
    } else if (this.joy2d) {
      const j = this.joy2d.read();
      jx = j.x;
      jy = -j.y;
      if (k.has('KeyW') || k.has('ArrowUp')) jy = 1;
      if (k.has('KeyS') || k.has('ArrowDown')) jy = -1;
      if (k.has('KeyA') || k.has('ArrowLeft')) jx = -1;
      if (k.has('KeyD') || k.has('ArrowRight')) jx = 1;
    }
    if (me.seated) {
      const y = this.yoke.read();
      let sx = y.x;
      let sy = -y.y;
      if (!y.active) {
        if (k.has('KeyA') || k.has('ArrowLeft')) sx = -1;
        if (k.has('KeyD') || k.has('ArrowRight')) sx = 1;
        if (k.has('KeyW') || k.has('ArrowUp')) sy = 1;
        if (k.has('KeyS') || k.has('ArrowDown')) sy = -1;
      }
      s.ctrl.sx = sx;
      s.ctrl.sy = sy;
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
    // avisos compartilhados: pequenos, sem duplicados (contador ×2), fila
    const icon: IconName = ico === 'fire' ? 'fire' : ico === 'check' ? 'check' : ico === 'fuel' || ico === 'leak' ? 'drop' : ico === 'spark' ? 'bolt' : ico === 'calm' || ico === 'panic' ? 'heart' : ico === 'info' ? 'sparkle' : 'warning';
    notify(msg, { icon, kind: tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : 'info', key: msg });
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
        this.act.classList.toggle('hide', !c.kind);
        this.tgt.textContent = c.kind ? c.label : '';
        this.ret.classList.toggle('hot', !!c.kind);
        const held = s.item(me.hold);
        this.thr.classList.toggle('hide', !held);
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
      // flapes e trem só fazem sentido na descida/aproximação
      const late = s.phase !== 'cruise' || s.gearStuck;
      gb.classList.toggle('hide', !late);
      this.q('[data-flaps]').classList.toggle('hide', !late);
      const ti = this.thrEl.querySelector('i') as HTMLElement;
      const th = this.thrEl.clientHeight || 170;
      ti.style.top = 4 + (1 - s.ctrl.thr) * (th - 48) + 'px';
      ti.textContent = String(Math.round(s.ctrl.thr * 100));
      this.q('[data-cam]').classList.toggle('on', h.extCam());
    }
    // dica
    const tip = this.tutText || this.tipText();
    if (tip !== this.lastTip) {
      this.lastTip = tip;
      objective(tip || null, { icon: this.tutText ? 'target' : 'sparkle' });
    }
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

  private placeMk(d: HTMLDivElement, x: number, y: number, z: number, W: number, H: number, me: { x: number; z: number }): void {
    const h = this.host;
    h.project(x, y, z, this.pr);
    let px = this.pr.x;
    let py = this.pr.y;
    const m = 34;
    let edge = this.pr.behind || px < m || px > W - m || py < 86 || py > H - m;
    if (!h.is3d) edge = px < m || px > W - m || py < m || py > H - m;
    const em = d.querySelector('em') as HTMLElement;
    if (edge) {
      const cx = W / 2;
      const cy = H / 2;
      const dx = px - cx;
      let dy = py - cy;
      if (this.pr.behind && h.is3d) dy = Math.abs(dy) + 60;
      const k = Math.min((W / 2 - m - 10) / Math.max(1, Math.abs(dx)), (H / 2 - 70) / Math.max(1, Math.abs(dy)));
      px = cx + dx * k;
      py = Math.max(90, cy + dy * k + 15);
      em.style.display = '';
      em.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI / 2}rad)`;
    } else em.style.display = 'none';
    d.classList.toggle('edge', edge);
    d.style.transform = `translate(${px}px,${py}px)`;
    const lbl = `${Math.round(Math.hypot(x - me.x, z - me.z))} m`;
    const sp = d.querySelector('span')!;
    if (sp.textContent !== lbl) sp.textContent = lbl;
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
      this.placeMk(d, e.x, e.y + 0.45, e.z, W, H, me);
      d.classList.toggle('mine', me.busy === e.id || me.actTarget === e.id);
    }
    // alvo do tutorial
    const tt = this.tutTarget;
    if (tt) {
      if (!this.tutMk) {
        this.tutMk = document.createElement('div');
        this.tutMk.className = 'voo-mk obj';
        this.tutMk.innerHTML = vIcon('star', 28) + '<span></span><em></em>';
        box.appendChild(this.tutMk);
      }
      this.placeMk(this.tutMk, tt.x, tt.y, tt.z, W, H, me);
    } else if (this.tutMk) {
      this.tutMk.remove();
      this.tutMk = null;
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
    for (const b of this.btns) b.destroy();
    this.fps?.dispose();
    this.joy2d?.destroy();
    this.yoke.destroy();
    this.miniGame?.destroy();
    objective(null);
    clearNotify();
    resetNotifyTop();
    setNotifyAlign('left');
    this.el.remove();
  }
}
