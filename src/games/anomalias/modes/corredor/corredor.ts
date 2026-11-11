/* ============================================================
 *  MODO CORREDOR — o corredor que se repete. Placa com o NÍVEL (0 → 10).
 *  Cada volta: tudo NORMAL ou UMA anomalia. Viu algo diferente? VOLTE.
 *  Tudo normal? SIGA EM FRENTE. Certo → nível +1; errado → nível 0.
 *  Nível 10 → porta de saída + festa. Andar com a sensação da Cozinha.
 *  Justiça (como o diretor do núcleo): a 1ª volta é sempre normal, a
 *  anomalia muda só quando ninguém está vendo (no meio da passagem),
 *  nunca repete até gastar o baralho, níveis baixos = anomalias óbvias.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../../i18n';
import { tap } from '../../../../core/haptics';
import { FpsLimiter, settingsFor, type Tier } from '../../../../core/quality';
import { FpsControls, bindButton, type BoundButton } from '../../../../ui/touch';
import { AnoAudio } from '../../core/audio';
import { IC } from '../../core/icons';
import { NpcBloop } from '../../core/models';
import { Rng, clamp, esc } from '../../core/util';
import { say } from '../../core/voice';
import { EYE_H, Walker, makeRenderer, snap, type ModeRun } from '../common';
import { MI, ModeUi } from '../ui';
import { ANOMS, applyWalker, poolFor, type ACtx, type Anom, type WalkerCfg } from './anomalies';
import { A_MID, B_MID, HL, HW, OFFSET, type Hall } from './hall';
import { THEME_META } from '../meta';
import { buildTheme, type ThemeId } from './themes';

export const GOAL = 10;

export interface CResult {
  theme: ThemeId;
  won: boolean;
  resets: number;
  loops: number;
  sec: number;
  best: number;
}
export interface CorredorOpts {
  root: HTMLElement;
  theme: ThemeId;
  seed: number;
  tier: Tier;
  finish(r: CResult): { stars: number; coins: number };
  progress(level: number): void;
  onPause(): void;
  onMenu(): void;
  onPlay(theme: ThemeId): void;
}

export { themeName } from '../meta';

const NORMAL_WALKER = (): WalkerCfg => ({ face: 'normal', mode: 'normal', scale: 1, twin: false, tint: null });

export class CorredorRun implements ModeRun {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(70, 1, 0.05, 40);
  readonly h: Hall;
  readonly ui: ModeUi;
  private ctl: FpsControls;
  private au = new AnoAudio();
  private me = new Walker();
  private limiter = new FpsLimiter(60);
  private ro: ResizeObserver;
  private rng: Rng;
  state: 'rules' | 'play' | 'win' | 'over' = 'rules';
  level = 0;
  best = 0;
  loops = 0;
  resets = 0;
  cur: Anom | null = null;
  private undo: (() => void) | null = null;
  private anims: ((dt: number, t: number) => void)[] = [];
  private tracked: { o: THREE.Object3D; own: boolean }[] = [];
  private texs: THREE.Texture[] = [];
  private loopT = 0;
  private seen = false;
  private deck: string[] = [];
  private streak = { anom: false, n: 0 };
  private wcfg: WalkerCfg = NORMAL_WALKER();
  private wk: NpcBloop;
  private wk2: NpcBloop;
  private wState: 'wait' | 'walk' | 'stop' | 'gone' = 'wait';
  private roll = { v: 0 };
  private hint = '';
  private paused = false;
  private dead = false;
  private raf = 0;
  private last = 0;
  private sec = 0;
  private btns: BoundButton[] = [];
  private exitBlock: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
  private winT = 0;
  /** forçar a próxima anomalia (debug) — null = normal, undefined = sorteio */
  forceNext: string | null | undefined = undefined;

  constructor(readonly o: CorredorOpts) {
    this.rng = new Rng(o.seed ^ 0xc0dd);
    this.r = makeRenderer(o.root, o.tier);
    this.limiter.cap = settingsFor(o.tier).fpsCap;
    this.h = buildTheme(o.theme);
    this.scene.add(this.h.root);
    this.scene.fog = this.h.fog;
    this.scene.background = new THREE.Color(this.h.style.fog);
    this.cam.rotation.order = 'YXZ';
    // Bloops que andam
    this.wk = new NpcBloop(this.h.style.walker, 'stand', 1, '');
    this.wk2 = new NpcBloop(this.h.style.walker, 'stand', 1, '');
    this.scene.add(this.wk.root, this.wk2.root);
    // bloqueio da passagem B no nível 10 (só a porta de saída)
    this.exitBlock = { min: { x: HW - 0.05, y: 0, z: -19 }, max: { x: HW + 0.3, y: 3, z: -16 } };
    // jogador começa no canto de entrada, olhando o corredor
    this.me.x = 0;
    this.me.z = 1.2;
    this.me.yaw = 0;
    this.ui = new ModeUi(o.root, 'co-hud');
    this.buildHud();
    this.ctl = new FpsControls(o.root, { joystick: { zoneWidth: 0.45, zoneTop: 0.25 }, look: { mouse: true } });
    this.ctl.show(false);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(o.root);
    this.resize();
    this.newLoop(null);
    if (location.search.includes('debug')) (window as unknown as { __cor: CorredorRun }).__cor = this;
  }

  /* ============================== ciclo ============================== */
  start(): void {
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (!this.limiter.shouldRender(now)) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.step(dt);
      this.r.render(this.scene, this.cam);
    };
    this.raf = requestAnimationFrame(loop);
    this.au.startHum();
    this.au.setHum(0.6);
    this.showRules();
  }
  get inMatch(): boolean {
    return this.state === 'play' || this.state === 'rules';
  }
  get panelOpen(): boolean {
    return this.ui.panelOpen;
  }
  pause(): void {
    this.paused = true;
    this.ctl.show(false);
    this.au.setHum(0);
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
    if (this.state === 'play' && !this.ui.panelOpen) this.ctl.show(true);
    this.au.setHum(0.6);
  }
  tick(n: number, dt = 1 / 30): void {
    for (let i = 0; i < n; i++) this.step(dt);
    this.r.render(this.scene, this.cam);
  }
  private resize(): void {
    const w = this.o.root.clientWidth || 1,
      h = this.o.root.clientHeight || 1;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  private step(dt: number): void {
    this.loopT += dt;
    if (this.state === 'play') this.sec += dt;
    const cols = this.level >= GOAL ? [...this.h.b.cols, this.exitBlock] : this.h.b.cols;
    const lock = this.state !== 'play' || this.ui.panelOpen;
    if (this.me.update(dt, lock ? null : this.ctl, cols)) this.au.step();
    if (this.state === 'play') this.checkTriggers();
    if (this.me.z < -2 && this.me.z > -HL && Math.abs(this.me.x) < HW) this.seen = true;
    for (const f of this.anims) f(dt, this.loopT);
    this.walkerStep(dt);
    // câmera (rolagem só dentro do corredor, para a anomalia "torto")
    const inHall = this.me.z < 0 && this.me.z > -HL;
    this.me.lastDt = dt;
    this.me.apply(this.cam, inHall ? this.roll.v : 0);
    if (this.state === 'win') {
      this.winT += dt;
      if (this.winT > 2.6) this.finish(true);
    }
  }

  /* ============================== laço ============================== */
  private checkTriggers(): void {
    const p = this.me;
    // seguir em frente: meio da passagem B
    if (p.x > B_MID.x && p.z < -16 && p.z > -19) {
      p.x -= OFFSET.x;
      p.z -= OFFSET.z;
      this.decide(true);
      return;
    }
    // voltar: meio da passagem A, andando para trás
    if (p.x < A_MID.x && p.z > 0 && p.z < 3) {
      p.x = 2 * A_MID.x - p.x;
      p.z = 2 * A_MID.z - p.z;
      p.yaw += Math.PI;
      p.vx = -p.vx;
      p.vz = -p.vz;
      if (this.seen) this.decide(false);
      else this.newLoop(this.cur ? this.cur.id : null, true);
      return;
    }
    // saída (nível 10)
    if (this.level >= GOAL && p.z < -17.2 && Math.abs(p.x) < 1.2) this.win();
  }

  /** decisão do jogador ao trocar de volta */
  private decide(forward: boolean): void {
    const hadAnom = !!this.cur;
    const ok = forward !== hadAnom;
    const missed = this.cur;
    const shot = this.hint;
    this.loops++;
    if (ok) {
      this.level = Math.min(GOAL, this.level + 1);
      if (this.level > this.best) {
        this.best = this.level;
        this.o.progress(this.level);
      }
      this.au.good();
      tap('light');
      this.chip(true);
      if (this.level === GOAL) say(t('cor.say.exit', 'Nível 10! A saída está logo ali!'), { urgent: true });
    } else {
      const was = this.level;
      this.level = 0;
      this.resets++;
      this.au.bad();
      tap('heavy');
      this.chip(false);
      this.missCard(forward, missed, shot, was);
    }
    this.newLoop(undefined);
  }

  /** monta a próxima volta (força: null = normal; string = id; undefined = sorteio) */
  newLoop(force: string | null | undefined, keep = false): void {
    // desfaz a anterior
    this.clearAnomaly();
    this.seen = false;
    this.loopT = 0;
    this.wcfg = NORMAL_WALKER();
    let pick: Anom | null = null;
    if (keep) pick = force ? (ANOMS.find((a) => a.id === force) ?? null) : null;
    else if (this.forceNext !== undefined) {
      pick = this.forceNext ? (ANOMS.find((a) => a.id === this.forceNext) ?? null) : null;
      this.forceNext = undefined;
    } else if (force !== undefined) pick = force ? (ANOMS.find((a) => a.id === force) ?? null) : null;
    else if (this.level >= GOAL) pick = null;
    else if (this.loops > 0 || this.level > 0) {
      // ~55% de anomalia; nunca 4 iguais seguidas (normal/anomalia)
      let anom = this.rng.next() < 0.55;
      if (this.streak.n >= 3) anom = !this.streak.anom;
      if (anom) pick = this.draw();
    }
    const isA = !!pick;
    if (isA === this.streak.anom) this.streak.n++;
    else this.streak = { anom: isA, n: 1 };
    this.cur = pick;
    if (pick) {
      const ctx = this.ctx();
      this.undo = pick.apply(ctx);
    }
    // placa / saída / regras
    const exit = this.level >= GOAL;
    this.h.levelSign.draw(this.level, exit);
    this.h.exitDoor.visible = exit;
    (this.h.exitDoor as THREE.Group & { light?: THREE.PointLight }).light!.intensity = exit ? 6 : 0;
    this.h.arrow.mesh.visible = !exit;
    this.h.rules.visible = this.level === 0;
    this.resetWalker();
    // foto da anomalia (dica se errar)
    this.hint = pick ? this.snapAt(pick.focus) : '';
    this.refreshHud();
  }

  private draw(): Anom | null {
    const pool = poolFor(this.o.theme, this.level);
    if (!pool.length) return null;
    let ids = this.deck.filter((id) => pool.some((a) => a.id === id));
    if (!ids.length) {
      ids = this.rng.shuffle(pool.map((a) => a.id));
      this.deck = ids.slice();
    }
    const id = ids[0];
    this.deck.splice(this.deck.indexOf(id), 1);
    return pool.find((a) => a.id === id) ?? null;
  }

  private ctx(): ACtx {
    return {
      h: this.h,
      au: this.au,
      walker: this.wcfg,
      anim: (f) => this.anims.push(f),
      me: () => ({ x: this.me.x, z: this.me.z }),
      roll: this.roll,
      track: <T extends THREE.Object3D>(o: T, own = true) => {
        this.tracked.push({ o, own });
        return o;
      },
      ownTex: <T extends THREE.Texture>(tx: T) => {
        this.texs.push(tx);
        return tx;
      },
    };
  }

  private clearAnomaly(): void {
    this.undo?.();
    this.undo = null;
    this.anims = [];
    for (const { o, own } of this.tracked) {
      o.removeFromParent();
      if (own)
        o.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
          }
        });
    }
    this.tracked = [];
    for (const tx of this.texs) tx.dispose();
    this.texs = [];
    this.roll.v = 0;
  }

  private snapAt(f: [number, number, number]): string {
    const c = new THREE.PerspectiveCamera(56, 1.5, 0.05, 40);
    c.position.set(f[0] * 0.25, 1.5, Math.min(0.5, f[2] + 3.4));
    c.lookAt(f[0], f[1], f[2]);
    return snap(this.r, this.scene, c, 240, 160, 0.82);
  }

  /* ============================== Bloop que anda ============================== */
  private resetWalker(): void {
    const w = this.wcfg;
    this.wState = w.mode === 'none' ? 'gone' : 'wait';
    for (const [m, dz] of [
      [this.wk, 0],
      [this.wk2, -1.1],
    ] as [NpcBloop, number][]) {
      m.root.position.set(-0.75 + (dz ? 0.55 : 0), 0, -15.2 + dz);
      m.root.rotation.y = w.mode === 'backwards' ? 0 : Math.PI;
      m.baseYaw = m.root.rotation.y;
      m.lookYaw = null;
      m.walking = 0;
      applyWalker(m, w);
    }
    this.wk.root.visible = w.mode !== 'none';
    this.wk2.root.visible = w.twin && w.mode !== 'none';
  }

  private walkerStep(dt: number): void {
    const w = this.wcfg;
    const ms = [this.wk, this.wk2];
    if (this.wState === 'wait' && this.me.z < -1.0 && this.state === 'play') this.wState = 'walk';
    const sp = w.mode === 'fast' ? 3.0 : 1.0;
    for (const m of ms) {
      if (!m.root.visible) continue;
      const p = m.root.position;
      if (this.wState === 'walk') {
        // desvia do jogador
        const ahead = this.me.z - p.z;
        let tx = m === this.wk2 ? -0.2 : -0.75;
        if (ahead > 0 && ahead < 3 && Math.abs(this.me.x - p.x) < 0.9) tx = this.me.x < 0 ? 0.75 : -0.75;
        p.x += (tx - p.x) * Math.min(1, dt * 2);
        p.z += sp * dt;
        m.walking = 1;
        if (w.mode === 'stare' && p.z > -8.6) {
          this.wState = 'stop';
          m.walking = 0;
        }
        if (p.z > 1.3) m.root.visible = false;
      } else if (this.wState === 'stop') {
        m.walking = 0;
        m.lookYaw = Math.atan2(-(this.me.x - p.x), -(this.me.z - p.z));
      }
      m.update(dt);
      if (this.wState === 'walk') m.root.rotation.y = m.baseYaw;
    }
  }

  /* ============================== feedback ============================== */
  private chip(ok: boolean): void {
    this.refreshHud();
    const el = this.ui.el.querySelector('.co-level') as HTMLElement;
    el.classList.remove('up', 'down');
    void el.offsetWidth;
    el.classList.add(ok ? 'up' : 'down');
    if (!ok) this.ui.shake();
  }

  private missCard(forward: boolean, missed: Anom | null, shot: string, was: number): void {
    this.o.root.querySelectorAll('.co-miss').forEach((e) => e.remove());
    const d = document.createElement('div');
    d.className = 'co-miss';
    d.setAttribute('data-touch-ignore', '');
    const txt = forward && missed ? t('cor.miss.anom', 'Tinha uma coisa diferente! Era para voltar.') : t('cor.miss.normal', 'Estava tudo normal! Era para seguir.');
    d.innerHTML = `<div class="hd"><i>${IC.cross()}</i><b>${was} ➜ 0</b></div>${shot && missed ? `<div class="pic"><img src="${shot}" alt=""><span class="ring"></span></div>` : `<div class="ok"><i>${MI.fwd()}</i></div>`}<div class="tx"><i>${forward && missed ? MI.uturn() : MI.fwd()}</i><span>${esc(txt)}</span></div>`;
    d.addEventListener('click', () => d.remove());
    this.ui.el.appendChild(d);
    say(txt, { urgent: true, cool: 800 });
    setTimeout(() => d.remove(), 4800);
  }

  private win(): void {
    if (this.state !== 'play') return;
    this.state = 'win';
    this.winT = 0;
    this.ctl.show(false);
    this.au.chime();
    this.au.good();
    tap('heavy');
    const c = document.createElement('div');
    c.className = 'co-confetti';
    c.innerHTML = Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 7) * 0.12}s;--c:${['#ffd34a', '#ff5c9a', '#3ee07a', '#5ad1ff', '#b36bff'][i % 5]}"></i>`).join('');
    this.ui.el.appendChild(c);
    const s = document.createElement('div');
    s.className = 'co-sun';
    this.ui.el.appendChild(s);
    say(t('cor.say.win', 'Você achou a saída! Parabéns!'), { urgent: true });
  }

  private finish(won: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over';
    this.ctl.show(false);
    const res: CResult = { theme: this.o.theme, won, resets: this.resets, loops: this.loops, sec: Math.round(this.sec), best: this.best };
    const { stars, coins } = this.o.finish(res);
    const p = this.ui.card(
      `<div class="ano-h" style="justify-content:center"><i>${MI.exit()}</i>${esc(t('cor.win', 'Você saiu do corredor!'))}</div>
<div class="stars">${[1, 2, 3].map((j) => `<i class="${j <= stars ? 'on' : ''}" style="animation-delay:${j * 0.15}s">${IC.star(j <= stars)}</i>`).join('')}</div>
<div class="stats"><span class="ano-stat"><i>${MI.fwd()}</i>${this.loops}</span><span class="ano-stat"><i>${IC.cross()}</i>${this.resets}</span><span class="ano-stat"><i>${IC.moon()}</i>${Math.floor(res.sec / 60)}:${String(res.sec % 60).padStart(2, '0')}</span><span class="ano-stat"><i><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="26" fill="#ffcf2e" stroke="#1d0b3a" stroke-width="4"/></svg></i>+${coins}</span></div>
<div class="btns"><button class="ano-b2 go" data-again><i>${IC.play()}</i>${esc(t('ano.again', 'Repetir'))}</button><button class="ano-b2" data-menu><i>${IC.book()}</i>${esc(t('ano.menu', 'Menu'))}</button></div>`,
      () => this.o.onMenu(),
      false,
    );
    p.querySelector('[data-again]')!.addEventListener('click', () => this.o.onPlay(this.o.theme));
    p.querySelector('[data-menu]')!.addEventListener('click', () => this.o.onMenu());
  }

  /* ============================== HUD ============================== */
  private buildHud(): void {
    const tm = THEME_META[this.o.theme];
    this.ui.el.innerHTML = `
<div class="ano-vig"></div>
<div class="co-level"><span class="th">${tm.icon}</span><b>0</b><span class="dots">${Array.from({ length: GOAL }, () => '<i></i>').join('')}</span></div>
<div class="ano-tr"><button class="ano-btn sm" data-k="help" aria-label="?">${MI.help()}</button><button class="ano-btn sm ano-pause" data-k="pause" aria-label="${esc(t('ano.pause', 'Pausa'))}">II</button></div>
<button class="ano-btn co-turn" data-k="turn" aria-label="${esc(t('cor.turn', 'Virar'))}">${MI.uturn()}</button>`;
    const bind = (k: string, f: () => void) => {
      const el = this.ui.el.querySelector<HTMLElement>(`[data-k="${k}"]`);
      if (el) this.btns.push(bindButton(el, { onPress: () => f() }));
    };
    bind('pause', () => this.o.onPause());
    bind('help', () => this.showRules());
    bind('turn', () => {
      if (this.state !== 'play') return;
      tap('light');
      this.me.turnLeft = this.me.turnLeft ? 0 : Math.PI;
    });
  }
  private refreshHud(): void {
    const el = this.ui.el.querySelector('.co-level');
    if (!el) return;
    el.querySelector('b')!.textContent = this.level >= GOAL ? '🚪' : String(this.level);
    el.querySelectorAll('.dots i').forEach((d, i) => d.classList.toggle('on', i < this.level));
  }

  showRules(): void {
    this.ctl.show(false);
    const p = this.ui.card(
      `<div class="ano-h" style="justify-content:center"><i>${MI.exit()}</i>${esc(t('cor.rules.title', 'Ache a saída!'))}</div>
<div class="co-rules">
<div class="rw"><span class="ic eye">${IC.eye()}</span><span>${esc(t('cor.rules.look', 'Ande e olhe tudo com atenção.'))}</span></div>
<div class="rw ok"><span class="ic">${IC.check()}</span><span class="ar">${MI.fwd()}</span><span>${esc(t('cor.rules.fwd', 'Tudo normal? Siga em FRENTE.'))}</span></div>
<div class="rw no"><span class="ic">${IC.bocudo()}</span><span class="ar">${MI.uturn()}</span><span>${esc(t('cor.rules.back', 'Algo diferente? VOLTE!'))}</span></div>
<div class="rw"><span class="lv">0 ➜ ${GOAL}</span><span class="ic">${MI.exit()}</span><span>${esc(t('cor.rules.goal', 'Chegue no 10 para sair. Errou? Volta pro 0.'))}</span></div>
</div>
<div class="btns"><button class="ano-b2 go" data-go><i>${IC.play()}</i>${esc(t('cor.rules.go', 'Entendi!'))}</button></div>`,
      () => {
        if (this.state === 'rules') this.state = 'play';
        if (this.state === 'play' && !this.paused) this.ctl.show(true);
      },
    );
    p.querySelector('[data-go]')!.addEventListener('click', () => this.ui.close());
    say(t('cor.say.rules', 'Tudo normal? Siga em frente. Algo diferente? Volte!'), { urgent: true, cool: 3000 });
  }

  /* ============================== debug ============================== */
  /** leva o jogador até a decisão (testes): 'fwd' / 'back' */
  debugGo(dir: 'fwd' | 'back'): void {
    this.seen = true;
    if (dir === 'fwd') {
      this.me.x = B_MID.x + 0.05;
      this.me.z = -17.5;
      this.me.yaw = -Math.PI / 2;
    } else {
      this.me.x = A_MID.x - 0.05;
      this.me.z = 1.5;
      this.me.yaw = Math.PI / 2;
    }
    this.checkTriggers();
  }
  /** câmera no começo do corredor olhando para o fundo */
  debugView(z = 0.4, yaw = 0, x = 0, pitch = 0): void {
    this.me.x = x;
    this.me.z = z;
    this.me.yaw = yaw;
    this.me.pitch = pitch;
    this.me.vx = this.me.vz = 0;
  }
  /** monta a volta com a anomalia e olha para ela (fotos de teste) */
  debugFrame(id: string | null, dist = 3.4): void {
    this.newLoop(id);
    const a = id ? ANOMS.find((x) => x.id === id) : null;
    const f = a?.focus ?? [0, 1.4, -8];
    const z = Math.min(0.6, f[2] + dist),
      x = Math.abs(f[0]) > 1 ? -f[0] * 0.3 : f[0] * 0.25;
    this.debugView(z, Math.atan2(-(f[0] - x), -(f[2] - z)), x, Math.atan2(f[1] - EYE_H, Math.hypot(f[0] - x, f[2] - z)));
  }
  setLevel(n: number): void {
    this.level = clamp(n, 0, GOAL);
    this.best = Math.max(this.best, this.level);
    this.h.levelSign.draw(this.level, this.level >= GOAL);
    this.refreshHud();
  }
  get anomalyIds(): string[] {
    return ANOMS.filter((a) => !a.theme || a.theme === this.o.theme).map((a) => a.id);
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clearAnomaly();
    for (const b of this.btns) b.destroy();
    this.ctl.dispose();
    this.ui.dispose();
    this.au.dispose();
    this.h.b.dispose();
    this.r.dispose();
    this.r.forceContextLoss();
    this.r.domElement.remove();
  }
}
