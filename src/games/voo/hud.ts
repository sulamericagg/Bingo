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
import { Galley } from './galley';
import { FpsControls, bindButton, createJoystick, type BoundButton, type Joystick } from '../../ui/touch';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyAlign, setNotifyTop } from '../../ui/notify';
import type { IconName } from '../../ui/icons';
import { seatLabel, type Cmd, type Ctx, type Sim } from './sim';
import { SPOTS } from './data';
import { speak } from './voice';
import { tap as haptic } from '../../core/haptics';
import { EYE_CROUCH, EYE_STAND, smokeBottom } from './sim';

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
  /** 0 cabine, 1 externa atrás, 2 órbita livre */
  camMode(): number;
  orbit(dx: number, dy: number): void;
  zoom(k: number): void;
  onAP(): void;
  /** pausa a simulação (só sozinho; online não pausa) */
  holdSim?(on: boolean): void;
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
  galley: Galley | null = null;
  private pfdX: CanvasRenderingContext2D;
  private navX: CanvasRenderingContext2D;
  private instT = 0;
  private chudT = 0;
  private goMk: { el: HTMLDivElement; x: number; y: number; z: number; until: number } | null = null;
  private aimEl: HTMLDivElement | null = null;
  private aimIco = '';
  private calmEls: HTMLDivElement[] = [];
  private pointEl: HTMLDivElement | null = null;
  /** tutorial: para onde a mãozinha aponta */
  tutPoint: '' | 'act' | 'stand' | 'stick' | 'mate' = '';
  private lastTut = '';
  private flyTutEl: HTMLDivElement | null = null;
  private bannerT = 0;
  private lastCtx = '';
  private seated = false;
  private keys = new Set<string>();
  private offs: (() => void)[] = [];
  private btns: BoundButton[] = [];
  private fps: FpsControls | null = null;
  private joy2d: Joystick | null = null;
  private yoke!: Joystick;
  private ctlSig = -1;
  private cartSig = '\u0000';
  private pr = { x: 0, y: 0, behind: false };
  private ctx: Ctx | null = null;
  private _hidden = false;
  get hidden(): boolean {
    return this._hidden;
  }
  set hidden(v: boolean) {
    this._hidden = v;
    this.el.style.display = v ? 'none' : '';
    if (v) {
      objective(null);
      this.lastTip = '\u0000';
      // controles de toque fora durante abertura/fim
      this.ctlSig = 0;
      this.yoke?.setEnabled(false);
      this.fps?.show(false);
      this.joy2d?.setEnabled(false);
    }
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
      <div class="voo-smoke"></div>
      <div class="voo-walk">
        <div class="voo-ret"></div><div class="voo-tgt"></div>
        <div class="voo-acts">
          <button class="voo-act small hide" data-crouch aria-label="${t('voo.a.crouch', 'Abaixar')}">${vIcon('crouch', 28)}<span>${t('voo.a.crouch', 'Abaixar')}</span></button>
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
          <button class="voo-btn round ghost voo-ap" data-ap aria-label="${t('voo.f.ap', 'Piloto automático')}" title="${t('voo.f.ap', 'Piloto automático')}">${vIcon('ap', 30)}</button>
          <button class="voo-btn round ghost" data-cam aria-label="${t('voo.f.cam', 'Câmera')}" title="${t('voo.f.cam', 'Câmera')}">${vIcon('cam', 24)}<i class="cm"></i></button>
          <button class="voo-btn round gold" data-stand aria-label="${t('voo.f.stand', 'Levantar')}" title="${t('voo.f.stand', 'Levantar')}">${vIcon('up', 24)}</button>
          <button class="voo-btn round voo-emb hide" data-masks aria-label="${t('voo.a.masks', 'Soltar máscaras')}" title="${t('voo.a.masks', 'Soltar máscaras')}">${vIcon('mask', 30)}</button>
          <button class="voo-btn round voo-emb hide" data-vent aria-label="${t('voo.a.vent', 'Ventilar')}" title="${t('voo.a.vent', 'Ventilar')}">${vIcon('vent', 30)}</button>
        </div>
        <div class="voo-chud"><div><small>${t('voo.ch.spd', 'VEL')}</small><b data-c="spd"></b></div><div><small>${t('voo.ch.alt', 'ALT')}</small><b data-c="alt"></b></div><div><small>${t('voo.ch.vs', 'V/S')}</small><b data-c="vs"></b></div><svg data-c="brg" viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="17" fill="rgba(0,0,0,.25)" stroke="#fff" stroke-width="2"/><path d="M20 5L28 24H12Z" fill="#ff5cae" stroke="#2a0b5c" stroke-width="2" stroke-linejoin="round"/></svg></div>
      </div>
      <div class="voo-top">
        <button class="voo-btn round red" data-exit aria-label="${t('voo.exit', 'Sair')}">${vIcon('close', 26)}</button>
        <div class="voo-tlc">
          <div class="voo-pill" data-phase></div>
          <div class="voo-bars">
            <div>${t('voo.hud.hull', 'Casco')}<b><i data-hull style="background:linear-gradient(90deg,#ff5c7a,#5ef08a)"></i></b></div>
            <div>${t('voo.hud.panic', 'Pânico')}<b><i data-pan style="background:linear-gradient(90deg,#ffd34a,#ff4d6a)"></i></b></div>
          </div>
          <div class="voo-obj" style="display:none"></div>
        </div>
        <div class="voo-right">
          <canvas class="voo-mini" width="440" height="116"></canvas>
          <div class="voo-crew"></div>
        </div>
      </div>
      <div class="voo-trays" style="display:none"></div>
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
    this.el.classList.toggle('is3d', host.is3d);
    if (!host.is3d) {
      this.ret.style.display = 'none';
      this.q('[data-cam]').style.display = 'none';
    }
    this.buildCrew();
    this.bind();
    setNotifyTop(54);
    setNotifyAlign('center');
    document.body.classList.add('voo-hud-on');
  }

  /* ------------------------------ entrada ------------------------------ */

  private bind(): void {
    const h = this.host;
    const s = h.sim;
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('[data-exit],[data-flaps],[data-gear],[data-stand],[data-cam],[data-ap],[data-mate],[data-cmd],[data-masks],[data-vent],[data-lv]') as HTMLElement | null;
      if (!b) return;
      if (b.dataset.exit !== undefined) h.onExit();
      else if (b.dataset.flaps !== undefined) s.setFlaps((s.f.flaps + 1) % 3);
      else if (b.dataset.gear !== undefined) this.toggleGear();
      else if (b.dataset.stand !== undefined) h.onStand();
      else if (b.dataset.cam !== undefined) h.onCam();
      else if (b.dataset.ap !== undefined) h.onAP();
      else if (b.dataset.masks !== undefined) s.dropMasks(s.players[s.me]);
      else if (b.dataset.vent !== undefined) s.ventCabin(s.players[s.me]);
      else if (b.dataset.lv !== undefined) this.hideLever();
      else if (b.dataset.mate !== undefined) {
        if (performance.now() - this.dragged > 300) this.openMenu(+b.dataset.mate);
      }
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
      bindButton(this.q('[data-crouch]'), { onPress: () => this.toggleCrouch() }),
    );
    // andar + olhar (3D) ou só andar (2D): controles compartilhados de src/ui/touch
    this.fps = h.is3d ? new FpsControls(this.surface, { joystick: { zoneTop: 0.3 } }) : null;
    this.joy2d = h.is3d ? null : createJoystick(this.surface, { zoneTop: 0.3, zoneWidth: 0.5 });
    // manche: joystick flutuante que volta ao centro (só aparece sentado)
    this.yoke = createJoystick(this.surface, { zoneTop: 0.25, zoneWidth: 0.42, expo: 0.55, smoothing: 22, hint: false }); // sem anel parado: não cobre as telas do painel
    this.yoke.setEnabled(false);
    // câmera externa: arrastar (fora do manche e dos botões) gira em volta do avião; pinça aproxima
    const ptrs = new Map<number, { x: number; y: number }>();
    let pinch0 = 0;
    const isView = (e: PointerEvent) => (e.target as HTMLElement)?.classList?.contains('voo-canvas');
    const pd = (e: PointerEvent) => {
      if (!h.camMode() || !isView(e)) return;
      // a zona do manche (esquerda, abaixo de 25%) continua sendo o manche
      const r = this.surface.getBoundingClientRect();
      if (e.clientX - r.left < r.width * 0.42 && e.clientY - r.top > r.height * 0.25) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      }
    };
    const pm = (e: PointerEvent) => {
      const p0 = ptrs.get(e.pointerId);
      if (!p0) return;
      if (ptrs.size >= 2) {
        p0.x = e.clientX;
        p0.y = e.clientY;
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 10 && d > 10) h.zoom(pinch0 / d);
        pinch0 = d;
        return;
      }
      h.orbit(e.clientX - p0.x, e.clientY - p0.y);
      p0.x = e.clientX;
      p0.y = e.clientY;
    };
    const pu = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      pinch0 = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!h.camMode()) return;
      h.zoom(e.deltaY > 0 ? 1.1 : 0.9);
    };
    this.surface.addEventListener('pointerdown', pd);
    window.addEventListener('pointermove', pm);
    window.addEventListener('pointerup', pu);
    window.addEventListener('pointercancel', pu);
    this.surface.addEventListener('wheel', wheel, { passive: true });
    this.offs.push(() => {
      this.surface.removeEventListener('pointerdown', pd);
      window.removeEventListener('pointermove', pm);
      window.removeEventListener('pointerup', pu);
      window.removeEventListener('pointercancel', pu);
      this.surface.removeEventListener('wheel', wheel);
    });
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
      else if (e.code === 'KeyF' && me.seated) s.setFlaps((s.f.flaps + 1) % 3);
      else if (e.code === 'KeyG' && me.seated) this.toggleGear();
      else if (e.code === 'KeyC') h.onCam();
      else if (e.code === 'KeyP' && me.seated) h.onAP();
      else if (e.code === 'KeyX' && me.seated) h.onStand();
      else if (e.code === 'KeyZ' && !me.seated) this.toggleCrouch();
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

  private toggleCrouch(): void {
    const s = this.host.sim;
    const me = s.players[s.me];
    if (me.seated) return;
    s.setCrouch(me, !me.crouch);
    haptic('light');
  }

  private toggleGear(): void {
    const s = this.host.sim;
    if (s.gearStuck) {
      this.toast(t('voo.t.gearStuck', 'O trem não desce! Alguém precisa girar a manivela no porão'), 'gear', 'bad');
      return;
    }
    s.setGear(s.f.gear ? 0 : 1);
  }

  /** teclado/joystick → entrada da sim e do manche */
  readInput(dt: number): void {
    const k = this.keys;
    const h = this.host;
    const s = h.sim;
    const me = s.players[s.me];
    // só os controles do lugar onde você está
    const sit = me.seated && !this.hidden;
    const walk = !me.seated && !this.hidden && me.busy < 0 && !me.prep;
    // só troca quando muda (setEnabled reposiciona o joystick)
    const sig = (sit ? 1 : 0) + (walk ? 2 : 0);
    if (sig !== this.ctlSig) {
      this.ctlSig = sig;
      this.yoke.setEnabled(sit);
      this.fps?.show(walk);
      this.joy2d?.setEnabled(walk);
    }
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

  rebuildCrew(): void {
    this.closeMenu();
    this.buildCrew();
  }
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
      this.dragMate(b, p.idx);
    }
  }

  /** ícone, frase falada e destino de cada ordem (para quem ainda não lê) */
  private cmdInfo(c: string): { ico: string; say: string } {
    const s = this.host.sim;
    if (c.startsWith('fix:')) {
      const e = s.emer(+c.slice(4));
      const k = e?.kind ?? 'fire';
      if (k === 'fire') return { ico: 'ext', say: t('voo.v.fire', 'Apaga o fogo!') };
      if (k === 'bird' || (k === 'leak' && e?.stage === 0)) return { ico: 'tape', say: t('voo.v.tape', 'Tapa o buraco!') };
      if (k === 'leak') return { ico: 'fuel', say: t('voo.v.fuel', 'Bombeia combustível!') };
      if (k === 'gear') return { ico: 'gear', say: t('voo.v.gear', 'Gira a manivela do trem!') };
      if (k === 'door') return { ico: 'door', say: t('voo.v.door', 'Fecha a porta!') };
      if (k === 'pressure') return { ico: 'pressure', say: t('voo.v.valve', 'Gira a válvula!') };
      if (k === 'panic') return { ico: 'calm', say: t('voo.v.calm', 'Acalma os passageiros!') };
      if (k === 'smoke') return { ico: 'vent', say: t('voo.v.smoke', 'Tira a fumaça da cabine!') };
      return { ico: 'wrench', say: t('voo.v.fix', 'Conserta isso!') };
    }
    if (c === 'pilot') return { ico: 'yoke', say: t('voo.v.pilot', 'Segura o manche!') };
    if (c === 'masks') return { ico: 'mask', say: t('voo.v.masks', 'Solta as máscaras!') };
    if (c === 'calm') return { ico: 'calm', say: t('voo.v.calm', 'Acalma os passageiros!') };
    if (c === 'follow') return { ico: 'follow', say: t('voo.v.follow', 'Vem comigo!') };
    return { ico: 'stay', say: t('voo.v.stay', 'Fica aí!') };
  }
  /** arrastar o retrato do ajudante até um problema (marcador ou minimapa) dá a ordem sem ler nada */
  private dragMate(b: HTMLElement, idx: number): void {
    let x0 = 0;
    let y0 = 0;
    let id = -1;
    let ghost: HTMLElement | null = null;
    b.style.touchAction = 'none';
    b.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      b.setPointerCapture?.(e.pointerId);
    });
    b.addEventListener('pointermove', (e) => {
      if (e.pointerId !== id) return;
      if (!ghost && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) {
        ghost = b.cloneNode(true) as HTMLElement;
        ghost.classList.add('voo-ghost');
        const c0 = b.querySelector('canvas');
        const c1 = ghost.querySelector('canvas');
        if (c0 && c1) c1.getContext('2d')!.drawImage(c0, 0, 0);
        document.body.appendChild(ghost);
        this.closeMenu();
      }
      if (ghost) {
        ghost.style.left = e.clientX + 'px';
        ghost.style.top = e.clientY + 'px';
        const over = this.dropTarget(e.clientX, e.clientY, ghost);
        this.q('.voo-mks').querySelectorAll('.voo-mk').forEach((m) => m.classList.toggle('drop', m === over.el));
      }
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      if (!ghost) return;
      const over = this.dropTarget(e.clientX, e.clientY, ghost);
      ghost.remove();
      ghost = null;
      this.q('.voo-mks').querySelectorAll('.voo-mk.drop').forEach((m) => m.classList.remove('drop'));
      this.dragged = performance.now();
      if (over.cmd) this.giveCmd(idx, over.cmd);
    };
    b.addEventListener('pointerup', end);
    b.addEventListener('pointercancel', end);
  }
  private dragged = 0;
  private dropTarget(x: number, y: number, ghost: HTMLElement): { el: Element | null; cmd: string } {
    ghost.style.display = 'none';
    const hit = document.elementsFromPoint(x, y);
    ghost.style.display = '';
    const s = this.host.sim;
    // marcadores não recebem toque (pointer-events:none): teste geométrico, com folga para dedos
    for (const [id, mk] of this.mk) {
      const r = mk.getBoundingClientRect();
      if (x > r.left - 16 && x < r.right + 16 && y > r.top - 16 && y < r.bottom + 16) return { el: mk, cmd: 'fix:' + id };
    }
    for (const el of hit) {
      if (el === this.mini) {
        // minimapa: emergência mais perto do ponto solto
        const r = this.mini.getBoundingClientRect();
        const z = ((x - r.left) / r.width) * this.mini.width;
        const zz = ((z - 18) / (this.mini.width - 30)) * 26 - 4.5;
        const e = s.active().filter((q) => q.kind !== 'turb').sort((a, b) => Math.abs(a.z - zz) - Math.abs(b.z - zz))[0];
        if (e && Math.abs(e.z - zz) < 4) return { el: this.mk.get(e.id) ?? null, cmd: 'fix:' + e.id };
      }
      if (el.closest('.voo-hud .voo-fly .voo-flytop') || (el as HTMLElement).dataset?.stand !== undefined) return { el: null, cmd: 'pilot' };
    }
    return { el: null, cmd: '' };
  }

  private openMenu(idx: number): void {
    const s = this.host.sim;
    const p = s.players[idx];
    if (!p || !p.bot) return;
    if (this.menu && this.menuFor === idx) return this.closeMenu();
    this.closeMenu();
    this.menuFor = idx;
    const m = document.createElement('div');
    m.className = 'voo-menu big';
    const em = s.active().filter((e) => e.kind !== 'turb');
    // fumaça/pressão sem máscaras: dá para pedir só "solta as máscaras" (o ajudante vai ao botão amarelo)
    const needMask = !s.masks && (s.smoke > 0.08 || em.some((e) => e.kind === 'smoke' || e.kind === 'pressure'));
    const cmds = [...(needMask ? ['masks'] : []), ...em.map((e) => 'fix:' + e.id), 'pilot', 'calm', 'follow', 'stay'];
    const lbl = (c: string) => {
      if (c.startsWith('fix:')) return emerName(s.emer(+c.slice(4))?.kind ?? 'fire').replace('!', '');
      if (c === 'masks') return t('voo.cmd.masks', 'Soltar as máscaras');
      return c === 'pilot' ? t('voo.cmd.pilot', 'Segurar o manche') : c === 'calm' ? t('voo.cmd.calm', 'Acalmar passageiros') : c === 'follow' ? t('voo.cmd.follow', 'Me seguir') : t('voo.cmd.stay', 'Parar');
    };
    m.innerHTML =
      `<h4>${hatIcon(p.role, 26)}<span>${p.name}</span><button class="x" data-cmd="x" aria-label="${t('voo.hg.exit', 'Sair')}">${vIcon('close', 24)}</button></h4>` +
      `<div class="grid">${cmds
        .map((c) => {
          const e = c.startsWith('fix:') ? s.emer(+c.slice(4)) : null;
          return `<button data-cmd="${c}" class="${e ? 'em' : ''}" title="${lbl(c)}">${vIcon(this.cmdInfo(c).ico, 44)}${e && this.cmdInfo(c).ico !== e.kind ? `<i class="bd">${vIcon(e.kind, 20)}</i>` : ''}<small>${lbl(c)}</small></button>`;
        })
        .join('')}</div>`;
    this.el.appendChild(m);
    this.menu = m;
    speak(p.name, { urgent: true });
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
    if (c === 'x') return this.closeMenu();
    this.giveCmd(p.idx, c);
    this.closeMenu();
  }
  /** dá a ordem (menu ou arrastando o retrato), fala e mostra para onde o ajudante vai */
  giveCmd(idx: number, c: string): void {
    const s = this.host.sim;
    const p = s.players[idx];
    if (!p || !p.bot) return;
    let cmd: Cmd;
    if (c.startsWith('fix:')) cmd = { kind: 'fix', emer: +c.slice(4) };
    else cmd = { kind: c as Cmd['kind'] };
    cmd.by = s.me;
    const info = this.cmdInfo(c);
    speak(info.say, { urgent: true });
    s.command(p, cmd);
    // seta animada até o destino
    let to: { x: number; y: number; z: number } | null = null;
    const e = cmd.emer !== undefined ? s.emer(cmd.emer) : undefined;
    if (e) to = { x: e.x, y: e.y + 0.4, z: e.z };
    else if (c === 'pilot') to = { x: SPOTS.pilot.x, y: 1.3, z: SPOTS.pilot.z };
    else if (c === 'masks') to = { x: SPOTS.maskSw.x, y: SPOTS.maskSw.y + 0.4, z: SPOTS.maskSw.z };
    else if (c === 'calm') {
      const q = s.pax.slice().sort((a, b) => b.panic - a.panic)[0];
      if (q) to = { x: q.x, y: 1.3, z: q.z };
    } else if (c === 'follow') to = null;
    this.goMk?.el.remove();
    this.goMk = null;
    if (to) {
      const d = document.createElement('div');
      d.className = 'voo-mk go';
      d.innerHTML = `${hatIcon(p.role, 30)}<span></span><em></em>`;
      this.q('.voo-mks').appendChild(d);
      this.goMk = { el: d, ...to, until: performance.now() + 3200 };
    }
  }

  /* ------------------------------ avisos ------------------------------ */

  toast(msg: string, ico: string, tone: string): void {
    // avisos compartilhados: pequenos, sem duplicados (contador ×2), fila
    const icon: IconName =
      ico === 'fire' ? 'fire' : ico === 'check' ? 'check' : ico === 'fuel' || ico === 'leak' ? 'drop' : ico === 'spark' ? 'bolt' : ico === 'calm' || ico === 'panic' ? 'heart' : ico === 'serve' || ico === 'cart' ? 'food' : ico === 'yoke' ? 'planet' : ico === 'turb' ? 'warning' : ico === 'info' || ico === 'vent' || ico === 'mask' ? 'sparkle' : ico === 'bagLost' ? 'bag' : 'warning';
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
      // o efeito da manete aparece enquanto usa: tanque enchendo, trem descendo, pressão voltando
      const me0 = s.emer(s.miniOpen?.emer ?? -1);
      const mk = this.miniGame.kind;
      if (mk === 'pump') this.miniGame.setReadout('fuel', Math.round(f.fuel) + '%');
      else if (mk === 'crank') this.miniGame.setReadout('gear', (me0 ? Math.round(me0.prog * 100) : 100) + '% ▼');
      else if (mk === 'valve') this.miniGame.setReadout('pressure', (me0 ? Math.round(me0.prog * 100) : 100) + '%');
      if (me.busy < 0 || !s.emer(s.miniOpen?.emer ?? -1)) {
        this.miniGame.destroy();
        this.miniGame = null;
        s.miniOpen = null;
        me.busy = -1;
      }
    }
    // copa (serviço de bordo) aberta pela sim
    if (s.prepOpen && !this.galley) {
      this.galley = new Galley(
        this.el,
        s,
        (o, m, d, hot, full) => s.addTray(me, o.id, m, d, hot, full),
        () => s.prepClose(me),
      );
    }
    if (this.galley) {
      if (!s.prepOpen || !s.flying) {
        this.galley.destroy();
        this.galley = null;
        if (s.prepOpen) s.prepClose(me);
      } else this.galley.update(dt);
    }
    // bandejas no carrinho (quem empurra vê para onde levar)
    const cartSig = s.cart.by === me.idx ? s.cart.trays.map((tr) => tr.order).join(',') + '|' + s.orders.map((o) => o.id + ':' + o.tray).join(',') : '';
    if (cartSig !== this.cartSig) {
      this.cartSig = cartSig;
      const el = this.q('.voo-trays') as HTMLElement;
      el.innerHTML = cartSig
        ? vIcon('cart', 22) +
          (s.cart.trays.length
            ? s.cart.trays
                .map((tr) => {
                  const o = s.orders.find((x) => x.id === tr.order);
                  const q = o ? s.pax[o.pax] : null;
                  return `<b>${q ? seatLabel(q.seat) : '?'}</b>`;
                })
                .join('')
            : `<small>${t('voo.g.empty', 'Vazio: monte bandejas na copa')}</small>`)
        : '';
      el.style.display = cartSig ? '' : 'none';
    }
    // modo sentado x a pé
    if (me.seated !== this.seated) {
      this.seated = me.seated;
      this.el.classList.toggle('seated', me.seated);
      if (me.seated) this.maybeFlyTut();
      this.walk.style.display = me.seated ? 'none' : '';
      this.fly.style.display = me.seated ? '' : 'none';
      h.actHeld = false;
    }
    // topo
    const phaseTxt =
      s.phase === 'cruise' ? t('voo.p.cruise', 'Cruzeiro') : s.phase === 'descent' ? t('voo.p.descent', 'Descida') : s.phase === 'final' ? t('voo.p.final', 'Aproximação') : t('voo.p.land', 'Pouso');
    const ph = `${vIcon('plane', 22)}<span><b>${phaseTxt}</b><small>${(f.dist / 1000).toFixed(1)} km · ${Math.round(f.alt)} m</small></span>`;
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
        const ico = this.ctxIcon(c);
        this.aimIco = ico;
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
      const ext = h.extCam();
      this.el.classList.toggle('ext', ext);
      this.chudT -= dt;
      if (ext && this.chudT <= 0) {
        this.chudT = 0.1;
        (this.q('[data-c="spd"]') as HTMLElement).textContent = String(Math.round(f.spd * 1.944));
        (this.q('[data-c="alt"]') as HTMLElement).textContent = String(Math.round(f.alt));
        const vs = this.q('[data-c="vs"]') as HTMLElement;
        vs.textContent = (f.vs >= 0 ? '+' : '') + f.vs.toFixed(1);
        vs.style.color = f.vs < -9 ? '#ff8aa0' : '';
        (this.q('[data-c="brg"]') as HTMLElement).style.transform = `rotate(${f.brg}rad)`;
      }
      const fb = this.q('[data-flaps] span');
      // compacto (ícone + número/seta): cabe acima da manete sem cobrir as telas do painel
      const ft = t('voo.f.flaps', 'Flape {n}', { n: f.flaps });
      if (fb.textContent !== String(f.flaps)) {
        fb.textContent = String(f.flaps);
        (fb.parentElement as HTMLElement).title = ft;
        (fb.parentElement as HTMLElement).setAttribute('aria-label', ft);
      }
      const gb = this.q('[data-gear]');
      const gt = s.gearStuck ? t('voo.f.gearStuck', 'Trem travado') : f.gear ? t('voo.f.gearIsDown', 'Trem: baixado') : t('voo.f.gearIsUp', 'Trem: recolhido');
      const gs = gb.querySelector('span')!;
      const gv = s.gearStuck ? '!' : f.gear ? '▼' : '▲';
      if (gs.textContent !== gv) {
        gs.textContent = gv;
        gb.title = gt;
        gb.setAttribute('aria-label', gt);
      }
      gb.classList.toggle('warn', (s.phase === 'final' && !f.gear && f.alt < 600) || s.gearStuck);
      // flapes e trem só fazem sentido na descida/aproximação
      const late = s.phase !== 'cruise' || s.gearStuck;
      gb.classList.toggle('hide', !late);
      this.q('[data-flaps]').classList.toggle('hide', !late);
      const ti = this.thrEl.querySelector('i') as HTMLElement;
      const th = this.thrEl.clientHeight || 170;
      ti.style.top = 4 + (1 - s.ctrl.thr) * (th - 48) + 'px';
      ti.textContent = String(Math.round(s.ctrl.thr * 100));
      const cm = h.camMode();
      const camB = this.q('[data-cam]');
      camB.classList.toggle('on', cm > 0);
      if (camB.dataset.m !== String(cm)) {
        camB.dataset.m = String(cm);
        (camB.querySelector('.cm') as HTMLElement).textContent = cm === 0 ? '1' : cm === 1 ? '2' : '3';
      }
      const apB = this.q('[data-ap]');
      apB.classList.toggle('on', !!f.ap);
      this.el.classList.toggle('apon', !!f.ap);
    }
    // dica
    if (this.tutText !== this.lastTut) {
      this.lastTut = this.tutText;
      if (this.tutText) speak(this.tutText, { urgent: true });
    }
    const tip = this.tutText || this.tipText();
    if (tip !== this.lastTip) {
      this.lastTip = tip;
      const ek = s.active().filter((e) => e.kind !== 'turb').pop()?.kind;
      const oi = this.tutText ? 'star' : me.seated ? 'plane' : ek ?? 'info';
      // objetivo dentro do HUD (coluna da esquerda): não briga com retratos, minimapa nem botão de girar
      const ob = this.q('.voo-obj') as HTMLElement;
      ob.style.display = tip ? '' : 'none';
      ob.innerHTML = tip ? `${vIcon(oi, 16)}<span></span>` : '';
      if (tip) (ob.querySelector('span') as HTMLElement).textContent = tip;
    }
    this.updateSmoke(dt);
    this.updateLever(dt);
    // instrumentos
    this.instT -= dt;
    if (this.instT <= 0) {
      this.instT = 1 / 15;
      drawPFD(this.pfdX, this.pfd.width, this.pfd.height, s);
      drawNav(this.navX, this.nav.width, this.nav.height, s);
    }
    this.drawMini();
    this.mkDt = dt;
    this.updateMarkers();
    // retratos: ícone do que o bot está fazendo
    this.crewEl.querySelectorAll<HTMLElement>('.voo-mate').forEach((b) => {
      const p = s.players[+b.dataset.mate!];
      const st = b.querySelector('.st') as HTMLElement;
      const ic = p.seated ? 'yoke' : p.cmd ? (p.cmd.kind === 'fix' ? s.emer(p.cmd.emer ?? -1)?.kind ?? 'check' : p.cmd.kind === 'calm' ? 'calm' : p.cmd.kind === 'masks' ? 'mask' : p.cmd.kind === 'follow' ? 'follow' : 'stay') : 'stay';
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

  /* ------------------------------ fumaça na cabine ------------------------------ */
  private smokeEl: HTMLElement | null = null;
  private smokeSig = '';
  private updateSmoke(dt: number): void {
    const s = this.host.sim;
    const me = s.players[s.me];
    if (!this.smokeEl) this.smokeEl = this.q('.voo-smoke');
    // véu na tela: quanto mais "dentro" da fumaça, mais cinza; tossindo, embaça e balança de leve
    const eye = me.seated ? 1.5 : me.crouch ? EYE_CROUCH : EYE_STAND;
    const bot = smokeBottom(me.seated || me.z < -1.2 ? s.smoke * 0.45 : s.smoke);
    const depth = Math.max(0, Math.min(1, (eye - bot) / 0.5));
    const cough = me.cough ?? 0;
    const op = me.seated && s.masks ? 0 : Math.min(0.85, depth * 0.35 + cough * 0.5);
    const el = this.smokeEl;
    el.style.opacity = op.toFixed(2);
    el.classList.toggle('cough', cough > 0.55);
    // tossida de tempos em tempos enquanto respira fumaça
    if (cough > 0.55 && !me.seated) {
      this.coughT -= dt;
      if (this.coughT <= 0) {
        this.coughT = 2 + Math.random() * 1.5;
        haptic('light');
      }
    } else this.coughT = 0.8;
    // botão de abaixar: só aparece com fumaça (ou já abaixado)
    const showC = !me.seated && (s.smoke > 0.1 || !!me.crouch);
    if (!me.seated && me.crouch && s.smoke < 0.03) s.setCrouch(me, false);
    const cb = this.q('[data-crouch]');
    const sig = (showC ? 1 : 0) + (me.crouch ? 2 : 0) + (cough > 0.55 && !me.crouch ? 4 : 0);
    if (sig !== +this.smokeSig) {
      this.smokeSig = String(sig);
      cb.classList.toggle('hide', !showC);
      cb.classList.toggle('on2', !!me.crouch);
      cb.classList.toggle('hot', cough > 0.55 && !me.crouch);
      const lb = me.crouch ? t('voo.a.standUp', 'Levantar') : t('voo.a.crouch', 'Abaixar');
      cb.innerHTML = `${vIcon(me.crouch ? 'stand' : 'crouch', 28)}<span>${lb}</span>`;
      cb.setAttribute('aria-label', lb);
    }
    // painel do piloto: máscaras e ventilar só quando servem
    const needMask = !s.masks && (s.smoke > 0.08 || s.active().some((e) => e.kind === 'smoke' || e.kind === 'pressure'));
    const mb = this.q('[data-masks]');
    const vb = this.q('[data-vent]');
    mb.classList.toggle('hide', !(me.seated && needMask));
    vb.classList.toggle('hide', !(me.seated && s.smoke > 0.08 && s.vent <= 0));
  }
  private coughT = 0.8;

  /* ------------------------------ manetes do porão: para que servem ------------------------------
   * Na 1ª vez que alguém chega perto (ou toca em "O que é?"): cartão só de ícones — manete → o que ela
   * enche/conserta — com uma mãozinha tocando no botão. Some sozinho. */
  private lvEl: HTMLDivElement | null = null;
  private lvT = 0;
  private lvSeen = false;
  private lvLast = -1;
  private lvPt = false;
  private updateLever(dt: number): void {
    const s = this.host.sim;
    const me = s.players[s.me];
    if (this.lvT > 0) {
      this.lvT -= dt;
      if (this.lvT <= 0 || me.seated || me.busy >= 0) this.hideLever();
    }
    // 1ª vez: a mãozinha aponta para o botão de ação ("O que é?") enquanto o cartão está aberto
    const wantPt = !!this.lvEl?.classList.contains('first') && this.ctx?.kind === 'lever';
    if (wantPt) (this.tutPoint = 'act'), (this.lvPt = true);
    else if (this.lvPt) (this.tutPoint = ''), (this.lvPt = false);
    // tocou em "O que é?"
    const li = s.leverInfo;
    if (li && li.t !== this.lvLast) {
      this.lvLast = li.t;
      this.showLever(li.k, false);
    }
    // 1ª vez perto das manetes do porão
    if (!this.lvSeen && !me.seated && me.z > 16.8) {
      this.lvSeen = true;
      let seen = false;
      try {
        seen = localStorage.getItem('bw-voo-levers') === '1';
        localStorage.setItem('bw-voo-levers', '1');
      } catch {
        /* */
      }
      if (!seen) this.showLever(-1, true);
    }
  }
  private showLever(focus: number, first: boolean): void {
    const s = this.host.sim;
    this.hideLever();
    const rows: [string, string, string][] = [
      ['pumpLever', 'fuel', 'leak'],
      ['crankLever', 'gear', 'gear'],
      ['valveWheel', 'pressure', 'pressure'],
    ];
    const busy = (k: string) => s.active().some((e) => e.kind === k);
    const d = document.createElement('div');
    d.className = 'voo-lever' + (first ? ' first' : '');
    d.innerHTML =
      rows
        .map(
          ([lv, eff, em], i) =>
            `<div class="row${focus === i ? ' on' : ''}${focus >= 0 && focus !== i ? ' dim' : ''}">${vIcon(lv, 34)}${vIcon('arrow', 18)}${vIcon(eff, 30)}<b class="${busy(em) ? 'need' : 'ok'}">${vIcon(busy(em) ? em : 'check', 20)}</b></div>`,
        )
        .join('') +
      (first ? `<i class="hand">${vIcon('hand', 34)}</i>` : '') +
      `<button class="x" data-lv aria-label="${t('voo.hg.exit', 'Sair')}">${vIcon('close', 22)}</button>`;
    this.el.appendChild(d);
    this.lvEl = d;
    this.lvT = first ? 7 : 4.5;
  }
  private hideLever(): void {
    this.lvEl?.remove();
    this.lvEl = null;
    this.lvT = 0;
  }

  /** "Como pilotar": 3 passos na primeira vez que alguém senta no manche */
  private maybeFlyTut(): void {
    let seen = false;
    try {
      seen = localStorage.getItem('bw-voo-flytut') === '1';
    } catch {
      /* */
    }
    if (seen || this.flyTutEl) return;
    const steps = [
      { ico: vIcon('yoke', 54), title: t('voo.ft.t1', 'O manche (lado esquerdo)'), txt: t('voo.ft.s1', 'Arraste para baixo: o nariz sobe. Para cima: o nariz desce. Para os lados: o avião inclina e faz a curva.') },
      { ico: vIcon('fuel', 54), title: t('voo.ft.t2', 'Potência (lado direito)'), txt: t('voo.ft.s2', 'Mais potência = mais velocidade. Devagar demais o avião perde sustentação (estol)!') },
      { ico: `<svg viewBox="0 0 48 48" width="54" height="54"><path d="M24 4L40 40L24 31L8 40Z" fill="#ff5cae" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/></svg>`, title: t('voo.ft.t3', 'Siga a seta rosa'), txt: t('voo.ft.s3', 'A seta rosa aponta para a pista. Na descida, baixe flapes e trem e toque o chão bem devagar.') },
    ];
    let i = 0;
    const d = document.createElement('div');
    d.className = 'voo-ftut';
    const render = () => {
      const st = steps[i];
      speak(st.title + '. ' + st.txt, { urgent: true });
      d.innerHTML = `<div class="card"><div class="dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div><div class="ic">${st.ico}</div><h3>${st.title}</h3><p>${st.txt}</p><button class="voo-btn ${i === steps.length - 1 ? 'green' : 'gold'}" data-n>${i === steps.length - 1 ? t('voo.ft.go', 'Voar!') : t('voo.ft.next', 'Próximo')}</button></div>`;
    };
    render();
    d.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('[data-n]')) return;
      i++;
      if (i < steps.length) return render();
      d.remove();
      this.flyTutEl = null;
      this.host.holdSim?.(false);
      try {
        localStorage.setItem('bw-voo-flytut', '1');
      } catch {
        /* */
      }
    });
    this.el.appendChild(d);
    this.flyTutEl = d;
    this.host.holdSim?.(true);
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

  /* ------------------------------ marcadores sem bagunça ------------------------------
   * Regras: nunca em cima de controles/painéis (retângulos de exclusão lidos ~3x/s), fora da tela
   * vão para a borda da área segura com seta, sobrepostos se empilham, perto somem/encolhem (o
   * contorno amarelo do objeto já mostra), sentado na cabine ficam no para-brisa (não no painel). */
  private excl: { l: number; t: number; r: number; b: number }[] = [];
  private exclW = 0;
  private wasModal = false;
  private exclH = 0;
  private exclT = 0;
  private mkR = 26;
  private placed: { x: number; y: number }[] = [];
  private refreshExcl(W: number, H: number): void {
    const er = this.el.getBoundingClientRect();
    const out: { l: number; t: number; r: number; b: number }[] = [];
    const add = (el: Element, pad = 6) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      out.push({ l: r.left - er.left - pad, t: r.top - er.top - pad, r: r.right - er.left + pad, b: r.bottom - er.top + pad });
    };
    this.el
      .querySelectorAll(
        '.voo-top .voo-btn,.voo-pill,.voo-bars,.voo-obj,.voo-mini,.voo-mate,.voo-acts .voo-act:not(.hide),.voo-thr,.voo-flyb .voo-btn:not(.hide),.voo-flytop .voo-btn,.voo-chud,.voo-trays,.voo-stickhint,.voo-menu,.voo-pfd',
      )
      .forEach((e) => add(e));
    // botões globais por cima do jogo (girar tela do hub, besouro do beta) e o joystick visível
    document.querySelectorAll('.gh-rot:not([hidden]),.beta-bug,.tc-joy.on .tc-ring,.tc-joy.idle .tc-ring,#nt-root .nt.on,.nt-big.on').forEach((e) => add(e, 8));
    const me = this.host.sim.players[this.host.sim.me];
    // sentado na cabine (1ª pessoa): o painel 3D com as telas e o manche fica livre
    if (me.seated && this.host.is3d && !this.host.extCam()) out.push({ l: 0, t: H * 0.6, r: W, b: H });
    this.excl = out;
    this.mkR = H <= 420 ? 22 : 26;
  }
  private inExcl(x: number, y: number, rad: number): number {
    for (let i = 0; i < this.excl.length; i++) {
      const e = this.excl[i];
      if (x + rad > e.l && x - rad < e.r && y + rad > e.t && y - rad < e.b) return i;
    }
    return -1;
  }
  /** estado suavizado de cada marcador na tela (mola criticamente amortecida, sem quicar) */
  private mkS = new WeakMap<HTMLElement, { x: number; y: number; vx: number; vy: number; edge: boolean; on: boolean }>();
  private mkDt = 1 / 60;
  /** SmoothDamp: segue o alvo sem passar dele; saltos grandes (trocou de lado) aparecem direto com fade */
  private smoothPos(d: HTMLElement, tx: number, ty: number, W: number): [number, number] {
    let st = this.mkS.get(d);
    if (!st || !st.on || Math.hypot(tx - st.x, ty - st.y) > W * 0.4) {
      st = { x: tx, y: ty, vx: 0, vy: 0, edge: st?.edge ?? false, on: true };
      this.mkS.set(d, st);
      d.classList.remove('pop');
      void d.offsetWidth;
      d.classList.add('pop');
      return [tx, ty];
    }
    const dt = Math.min(0.05, this.mkDt);
    const om = 2 / 0.09;
    const x = om * dt;
    const ex = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const step = (cur: number, v: number, tgt: number): [number, number] => {
      const ch = cur - tgt;
      const tmp = (v + om * ch) * dt;
      return [tgt + (ch + tmp) * ex, (v - om * tmp) * ex];
    };
    [st.x, st.vx] = step(st.x, st.vx, tx);
    [st.y, st.vy] = step(st.y, st.vy, ty);
    return [st.x, st.y];
  }
  /** marcador some (fora de uso): a próxima vez aparece direto no lugar, sem deslizar pela tela */
  private mkOff(d: HTMLElement): void {
    const st = this.mkS.get(d);
    if (st) st.on = false;
    d.style.display = 'none';
  }
  /**
   * Sentado (cabine ou câmera externa) as emergências NÃO são marcadores no mundo: ficam numa fileira
   * fixa no alto da tela (chips). Aparecem com o nome por alguns segundos e encolhem para só o ícone.
   * Assim nada "dança" quando o avião inclina.
   */
  private dockMode(me: { seated: boolean }): boolean {
    return this.host.is3d && (me.seated || this.host.extCam());
  }
  private dockMk(d: HTMLDivElement, i: number, n: number, W: number, born: number): void {
    const R = this.mkR;
    const gap = 8;
    const y = this.dockY;
    const x = W / 2 + (i - (n - 1) / 2) * (R * 2 + gap);
    const [sx, sy] = this.smoothPos(d, x, y, W);
    d.classList.add('dock');
    d.classList.remove('edge', 'near');
    // só o aviso mais novo mostra o nome (os rótulos dos vizinhos não se atropelam)
    d.classList.toggle('fresh', born >= this.dockNewest && performance.now() - born < 3200);
    const em = d.querySelector('em') as HTMLElement | null;
    if (em) em.style.display = 'none';
    d.style.display = '';
    d.style.transform = `translate(${sx}px,${sy}px)`;
  }
  private dockY = 30;
  private dockNewest = 0;
  /** topo da fileira fixa: logo abaixo da barra de cima (que pode ter 1 ou 2 andares conforme a largura) */
  private dockTopV = 0;
  private dockTopT = 0;
  private dockTop(W: number): number {
    const now = performance.now();
    if (now - this.dockTopT > 500 || !this.dockTopV) {
      this.dockTopT = now;
      const er = this.el.getBoundingClientRect();
      // a fileira fica no meio, entre o bloco da esquerda e o da direita: pega o de baixo da pílula de fase
      const ph = this.phase.getBoundingClientRect();
      const left = this.q('.voo-tlc').getBoundingClientRect();
      const right = this.q('.voo-right').getBoundingClientRect();
      const free = right.left - left.right;
      const need = (this.mkR * 2 + 8) * 3;
      // espaço no meio da barra: alinha com a pílula; senão, embaixo dos dois blocos
      this.dockTopV = free > need + 20 ? ph.top - er.top : Math.max(left.bottom, right.bottom) - er.top + 6;
      void W;
    }
    return this.dockTopV;
  }
  /** posiciona um marcador (emergência/objetivo/destino) */
  private placeMk(d: HTMLDivElement, x: number, y: number, z: number, W: number, H: number, me: { x: number; z: number; seated: boolean }): void {
    const h = this.host;
    h.project(x, y, z, this.pr);
    d.classList.remove('dock', 'fresh');
    const R = this.mkR;
    const lab = 18; // rótulo de distância embaixo
    const seatedFP = me.seated && h.is3d && !h.extCam();
    const S = { l: R + 8, t: 58 + R, r: W - R - 8, b: (seatedFP ? H * 0.6 : H - 30) - R - lab };
    let px = this.pr.x;
    let py = this.pr.y;
    // histerese: só volta para dentro da tela quando entrou de verdade (sem piscar na borda)
    const st = this.mkS.get(d);
    const m = st?.edge ? 14 : 0;
    let edge = this.pr.behind || px < S.l + m || px > S.r - m || py < S.t + m || py > S.b - m;
    if (!h.is3d) edge = px < S.l || px > S.r || py < S.t || py > S.b;
    if (st) st.edge = edge;
    const cx = W / 2;
    const cy = (S.t + S.b) / 2;
    const dx = px - cx;
    const dy = py - cy;
    if (edge) {
      // direção estável (a projeção já trata "atrás" pela direção no plano da câmera): vai para a borda nessa direção
      const k = Math.min((S.r - cx) / Math.max(1, Math.abs(dx)), (S.b - cy) / Math.max(1, Math.abs(dy)));
      px = cx + dx * k;
      py = cy + dy * k;
    }
    // nunca em cima de controles: empurra para fora do retângulo pelo lado mais perto (dentro da área segura)
    for (let it = 0; it < 4; it++) {
      const i = this.inExcl(px, py, R);
      if (i < 0) break;
      const e = this.excl[i];
      const opts: [number, number][] = [
        [e.l - R - 2, py],
        [e.r + R + 2, py],
        [px, e.t - R - 2],
        [px, e.b + R + lab + 2],
      ];
      let best: [number, number] | null = null;
      let bd = 1e9;
      for (const o of opts) {
        if (o[0] < S.l || o[0] > S.r || o[1] < S.t || o[1] > S.b) continue;
        const dd = Math.hypot(o[0] - px, o[1] - py);
        if (dd < bd) (bd = dd), (best = o);
      }
      if (!best) break;
      [px, py] = best;
    }
    // empilha os que se sobrepõem (coluna, na direção do centro)
    let dir = py > cy ? -1 : 1;
    const y0 = py;
    const side = px > W / 2 ? -1 : 1;
    for (let it = 0; it < 8; it++) {
      const hit = this.placed.find((q) => Math.abs(q.x - px) < R * 2 + 6 && Math.abs(q.y - py) < R * 2 + lab - 2);
      if (!hit) break;
      py = hit.y + dir * (R * 2 + lab);
      // saiu da área segura ou caiu num controle: empilha para o outro lado / para o lado
      if (py < S.t || py > S.b || this.inExcl(px, py, R) >= 0) {
        if (dir === (y0 > cy ? -1 : 1)) {
          dir = -dir;
          py = y0;
        } else {
          px += side * (R * 2 + 10);
          py = y0;
          dir = y0 > cy ? -1 : 1;
        }
      }
    }
    this.placed.push({ x: px, y: py });
    const blocked = this.inExcl(px, py, R * 0.6) >= 0;
    // perto: encolhe e some (o contorno amarelo do objeto já mostra onde é)
    const dist = Math.hypot(x - me.x, z - me.z);
    const near = !edge && !me.seated && dist < 3;
    if (blocked || (!edge && !me.seated && dist < 1.3)) return this.mkOff(d);
    const [sx, sy] = this.smoothPos(d, px, py, W);
    const em = d.querySelector('em') as HTMLElement | null;
    if (em) {
      if (edge) {
        em.style.display = '';
        // seta aponta do centro para onde o marcador está (posição suavizada: não gira aos trancos)
        em.style.transform = `rotate(${Math.atan2(sy - cy, sx - cx) + Math.PI / 2}rad)`;
      } else em.style.display = 'none';
    }
    d.classList.toggle('edge', edge);
    d.classList.toggle('near', near);
    d.style.display = '';
    d.style.transform = `translate(${sx}px,${sy}px)`;
    const sp = d.querySelector('span');
    const lbl = `${Math.round(dist)} m`;
    if (sp && sp.textContent !== lbl) sp.textContent = lbl;
  }

  private ctxIcon(c: Ctx): string {
    const s = this.host.sim;
    switch (c.kind) {
      case 'spray':
        return 'ext';
      case 'patch':
        return 'tape';
      case 'pump':
        return 'fuel';
      case 'rewire':
        return 'wrench';
      case 'valve':
        return 'pressure';
      case 'crank':
        return 'gear';
      case 'door':
        return 'door';
      case 'give':
      case 'hug':
        return 'calm';
      case 'sit':
        return 'yoke';
      case 'take':
        return c.target === 0 ? 'water' : 'snack';
      case 'pick':
        return s.item(c.target)?.kind ?? 'hand';
      case 'stow':
        return 'bag';
      case 'prep':
        return 'tray';
      case 'cart':
        return 'cart';
      case 'serve':
        return 'serve';
      case 'masks':
        return 'mask';
      case 'vent':
        return 'vent';
      case 'lever':
        return c.target === 0 ? 'pumpLever' : c.target === 1 ? 'crankLever' : 'valveWheel';
    }
    return 'hand';
  }

  private updatePoint(): void {
    const k = this.tutPoint;
    const tgt = k === 'act' ? this.act : k === 'stand' ? this.q('[data-stand]') : k === 'mate' ? (this.crewEl.querySelector('.voo-mate') as HTMLElement | null) : k === 'stick' ? (this.q('.voo-stickhint') as HTMLElement) : null;
    const r = tgt && tgt.offsetParent ? tgt.getBoundingClientRect() : null;
    if (!r || !r.width) {
      if (this.pointEl) this.pointEl.style.display = 'none';
      return;
    }
    if (!this.pointEl) {
      this.pointEl = document.createElement('div');
      this.pointEl.className = 'voo-point';
      this.pointEl.innerHTML = vIcon('hand', 46);
      this.el.appendChild(this.pointEl);
    }
    const er = this.el.getBoundingClientRect();
    this.pointEl.style.display = '';
    this.pointEl.style.left = r.left - er.left + r.width * 0.5 + 'px';
    this.pointEl.style.top = r.top - er.top + (k === 'mate' ? r.height + 4 : -50) + 'px';
    this.pointEl.classList.toggle('up', k === 'mate');
  }

  private updateMarkers(): void {
    const h = this.host;
    const s = h.sim;
    const me = s.players[s.me];
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const seen = new Set<number>();
    const box = this.q('.voo-mks');
    // janela modal (copa/minijogo/menu de ordens): sem marcadores por cima
    const modal = !!this.galley || !!this.miniGame;
    box.style.display = modal ? 'none' : '';
    if (modal !== this.wasModal) {
      this.wasModal = modal;
      document.body.classList.toggle('voo-modal', modal);
    }
    if (modal) return;
    this.exclT -= 1 / 60;
    if (this.exclT <= 0 || this.exclW !== W || this.exclH !== H) {
      this.exclT = 0.25;
      this.exclW = W;
      this.exclH = H;
      this.refreshExcl(W, H);
    }
    this.placed.length = 0;
    // prioridade: objetivo do tutorial, depois as emergências mais graves
    const ems = s
      .active()
      .filter((e) => e.kind !== 'turb')
      .sort((a, b) => b.sev - a.sev);
    const dock = this.dockMode(me);
    // fileira fixa logo abaixo da barra de cima (entre o bloco da esquerda e o minimapa)
    if (dock) this.dockY = this.dockTop(W) + this.mkR;
    // alvo do tutorial
    const tt = this.tutTarget;
    if (tt) {
      if (!this.tutMk) {
        this.tutMk = document.createElement('div');
        this.tutMk.className = 'voo-mk obj';
        this.tutMk.innerHTML = vIcon('star', 28) + '<span></span><em></em>';
        box.appendChild(this.tutMk);
      }
      if (dock) this.mkOff(this.tutMk);
      else this.placeMk(this.tutMk, tt.x, tt.y, tt.z, W, H, me);
    } else if (this.tutMk) {
      this.tutMk.remove();
      this.tutMk = null;
    }
    const dockN = Math.min(ems.length, 5);
    this.dockNewest = 0;
    for (const e of ems.slice(0, dockN)) this.dockNewest = Math.max(this.dockNewest, +(this.mk.get(e.id)?.dataset.born ?? performance.now()));
    ems.forEach((e, ei) => {
      seen.add(e.id);
      let d = this.mk.get(e.id);
      if (!d) {
        d = document.createElement('div');
        d.className = 'voo-mk';
        d.innerHTML = vIcon(e.kind, 36) + '<span></span><em></em><i class="prog"></i>';
        d.dataset.e = String(e.id);
        d.dataset.born = String(performance.now());
        box.appendChild(d);
        this.mk.set(e.id, d);
      }
      if (dock) {
        if (ei >= dockN) return this.mkOff(d);
        this.dockMk(d, ei, dockN, W, +(d.dataset.born ?? 0));
        const sp = d.querySelector('span');
        const nm = emerName(e.kind).replace('!', '');
        if (sp && sp.textContent !== nm) sp.textContent = nm;
      } else this.placeMk(d, e.x, e.y + 0.45, e.z, W, H, me);
      d.classList.toggle('mine', me.busy === e.id || me.actTarget === e.id);
      // anel de progresso (segurar para fechar/tapar, fogo diminuindo)
      const pr = e.kind === 'fire' ? Math.max(0, 1 - e.sev / 1.2) * (e.sev < 0.34 ? 1 : 0.4) : e.prog;
      (d.querySelector('.prog') as HTMLElement).style.background = pr > 0.02 ? `conic-gradient(#5ef08a ${pr * 360}deg, transparent 0)` : '';
    });
    for (const [id, d] of this.mk)
      if (!seen.has(id)) {
        d.remove();
        this.mk.delete(id);
      }
    // destino da ordem dada a um ajudante
    const now = performance.now();
    if (this.goMk) {
      if (now > this.goMk.until) {
        this.goMk.el.remove();
        this.goMk = null;
      } else if (dock) this.mkOff(this.goMk.el);
      else this.placeMk(this.goMk.el, this.goMk.x, this.goMk.y, this.goMk.z, W, H, me);
    }
    // contorno pulsante no objeto que dá para usar agora
    const c = !me.seated ? this.ctx : null;
    if (c && c.kind && h.is3d) {
      if (!this.aimEl) {
        this.aimEl = document.createElement('div');
        this.aimEl.className = 'voo-aim';
        box.appendChild(this.aimEl);
      }
      if (this.aimEl.dataset.i !== this.aimIco) {
        this.aimEl.dataset.i = this.aimIco;
        this.aimEl.innerHTML = vIcon(this.aimIco, 30);
      }
      h.project(c.x, c.y, c.z, this.pr);
      if (this.pr.behind || this.inExcl(this.pr.x, this.pr.y, 20) >= 0) this.mkOff(this.aimEl);
      else {
        const [ax, ay] = this.smoothPos(this.aimEl, this.pr.x, this.pr.y, W);
        this.aimEl.style.display = '';
        this.aimEl.style.transform = `translate(${ax}px,${ay}px)`;
      }
    } else if (this.aimEl) this.mkOff(this.aimEl);
    // medidor de calma em cima dos passageiros aflitos perto de mim
    const near = me.seated ? [] : s.pax.filter((q) => q.panic > 0.3 && Math.hypot(q.x - me.x, q.z - me.z) < 5).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z)).slice(0, 5);
    while (this.calmEls.length < near.length) {
      const d = document.createElement('div');
      d.className = 'voo-calm';
      d.innerHTML = `${vIcon('calm', 18)}<b><i></i></b>`;
      box.appendChild(d);
      this.calmEls.push(d);
    }
    this.calmEls.forEach((d, i) => {
      const q = near[i];
      if (!q) {
        d.style.display = 'none';
        return;
      }
      h.project(q.x, q.standing ? 1.5 : 1.25, q.z, this.pr);
      d.style.display = this.pr.behind || this.inExcl(this.pr.x, this.pr.y, 14) >= 0 ? 'none' : '';
      d.style.transform = `translate(${this.pr.x}px,${this.pr.y}px)`;
      const bar = d.querySelector('i') as HTMLElement;
      bar.style.width = Math.round((1 - q.panic) * 100) + '%';
      bar.style.background = q.panic > 0.7 ? '#ff4d6a' : q.panic > 0.5 ? '#ffb02e' : '#5ef08a';
    });
    // mãozinha do tutorial apontando para o botão certo
    this.updatePoint();
    // falas dos bots
    for (const [idx, d] of this.says) {
      const p = s.players[idx];
      if (!p || +(d.dataset.t ?? 0) < now) {
        d.style.display = 'none';
        continue;
      }
      h.project(p.x, p.seated ? 1.75 : 1.95, p.seated ? -2.9 : p.z, this.pr);
      d.style.display = this.pr.behind || this.inExcl(this.pr.x, this.pr.y - 14, 12) >= 0 ? 'none' : '';
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
    this.galley?.destroy();
    objective(null);
    clearNotify();
    resetNotifyTop();
    setNotifyAlign('left');
    document.body.classList.remove('voo-hud-on', 'voo-modal');
    this.el.remove();
  }
}
