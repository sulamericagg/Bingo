/* ============================================================
 *  ANOMALIAS — o TURNO (uma noite): memorizar → relógio 00:00→06:00,
 *  anomalias do diretor, foto (frustum + raio), monitor de câmeras,
 *  caderno, perigo, Bocudo caçando (o flash da foto espanta!),
 *  tarefas do mapa, queda de energia, amanhecer ou "Você foi pego!".
 *  Estado do jogo é determinístico pela semente (co-op host-autoritativo depois).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { tap } from '../../../core/haptics';
import { QualityGovernor, FpsLimiter, loadMode, settingsFor } from '../../../core/quality';
import { FpsControls } from '../../../ui/touch';
import type { AnomalyKind, InteractDef, ItemDef, MapBuild, RoomDef } from '../maps/types';
import { AnoAudio } from './audio';
import { DANGER_AFTER_SCARE, DANGER_REPORT, DIFF, MEMORIZE_SEC, type Diff, type DiffCfg, type NightResult } from './data';
import { Director, type Active, type DirSlot } from './director';
import { Hud } from './hud';
import { IC, drawItem, itemSvg } from './icons';
import { Bocudo, FACE_VARIANTS } from './models';
import { TaskBoard } from './tasks';
import { Rng, clamp } from './util';
import { say } from './voice';
import { EYE, PLAYER_R, World, slide, type Npc, type SlotInfo } from './world';

export interface ShiftOpts {
  root: HTMLElement;
  build: MapBuild;
  mapName: string;
  night: number;
  diff: Diff;
  seed: number;
  tier: 0 | 1 | 2 | 3;
  /** primeira vez: abre o caderno sozinho */
  tutorial: boolean;
  onEnd(r: NightResult, caught: boolean): void;
  onPause(): void;
}

type State = 'memorize' | 'play' | 'caught' | 'dawn' | 'over';

interface Hunt {
  m: Bocudo;
  pos: THREE.Vector3;
  t: number;
  flee: number;
  growlT: number;
  path: number[];
  pathT: number;
}

const WALK = 2.7;
const TINTS = ['#ff5a5a', '#45d16b', '#4d7bff', '#ffcf2e'];
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class Shift {
  readonly world: World;
  readonly hud: Hud;
  readonly ctl: FpsControls;
  readonly au = new AnoAudio();
  readonly dir: Director;
  readonly tasks: TaskBoard;
  readonly cfg: DiffCfg;
  private rng: Rng;
  state: State = 'memorize';
  /** tempo do turno (s, depois de memorizar) */
  t = 0;
  private memT = MEMORIZE_SEC;
  danger = 0;
  private hunt: Hunt | null = null;
  private yaw: number;
  private pitch = -0.05;
  readonly pos: { x: number; z: number };
  private stepAcc = 0;
  private bob = 0;
  photo = false;
  private photoCd = 0;
  private fov: number;
  monIdx = -1;
  private monCams: { room: RoomDef; k: number }[] = [];
  shots = new Map<string, string>();
  private live = new Map<number, Active>();
  private peekers = new Map<number, Bocudo>();
  private soundT = new Map<number, number>();
  private bubbles = new Map<InteractDef, THREE.Sprite>();
  private poofs: { s: THREE.Sprite; t: number }[] = [];
  private poofTex: THREE.Texture;
  private hold: { def: InteractDef; t: number; sec: number } | null = null;
  private near: InteractDef | null = null;
  private outages: number[] = [];
  private powerOffT = 0;
  private flickT = 0;
  private hudT = 0;
  private catchT = 0;
  private dawnT = 0;
  private paused = false;
  private raf = 0;
  private last = 0;
  private dead = false;
  private gov: QualityGovernor;
  private limiter = new FpsLimiter(60);
  private ro: ResizeObserver;
  private arrow: HTMLDivElement;
  private items: Map<string, ItemDef>;
  private stats = { reported: 0, missed: 0, wrong: 0 };
  private keys = new Set<string>();
  private offs: (() => void)[] = [];
  /** fps medido (debug / relatório) */
  fps = 0;
  private fpsAcc = { n: 0, t: 0 };
  /** câmera fixa para testes (debug) */
  camOverride: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  constructor(readonly o: ShiftOpts) {
    this.cfg = DIFF[o.diff];
    this.rng = new Rng(o.seed ^ 0x9e3779b9);
    const b = o.build;
    this.items = new Map((b.items ?? []).map((i) => [i.id, i]));
    this.world = new World(o.root, b, o.tier);
    this.fov = this.world.baseFov;
    this.pos = { x: b.spawn.pos.x, z: b.spawn.pos.z };
    this.yaw = b.spawn.yaw;
    const slots: DirSlot[] = b.slots.map((s) => ({ id: s.id, room: s.room, kinds: s.kinds, variants: s.variants ?? 1, minNight: s.minNight ?? 1 }));
    this.dir = new Director(slots, o.night, o.diff, o.seed);
    this.tasks = new TaskBoard(b, new Rng(o.seed ^ 0x51ed27), this.dir.cfg.tasks);
    this.dir.taskRooms = this.tasks.rooms;
    // quedas de energia (determinísticas)
    for (let i = 0; i < this.dir.cfg.outages; i++) this.outages.push(this.cfg.shiftSec * this.rng.range(0.35, 0.75));
    for (const r of b.rooms) r.cams.forEach((_, k) => this.monCams.push({ room: r, k }));
    this.poofTex = poofTexture();
    // pedidos (balões)
    for (const tk of this.tasks.tasks) if (tk.want) this.addBubble(tk.def, tk.want);
    // HUD + controles
    this.hud = new Hud(o.root, {
      camera: () => this.setPhoto(true),
      lower: () => this.setPhoto(false),
      shutter: () => this.snap(),
      monitor: () => this.openMonitor(),
      notebook: () => this.openNotebook(),
      pause: () => o.onPause(),
      use: (d) => this.useBtn(d),
      skipMemorize: () => this.beginShift(),
    });
    this.ctl = new FpsControls(o.root, { joystick: { zoneWidth: 0.42, zoneTop: 0.28 }, look: { mouse: true } });
    this.arrow = document.createElement('div');
    this.arrow.className = 'ano-arrow';
    this.arrow.innerHTML = `<svg viewBox="0 0 64 64"><path d="M32 60 L8 30 H22 V4 H42 V30 H56 Z" fill="#ffd34a" stroke="#1d0b3a" stroke-width="4" stroke-linejoin="round"/></svg>`;
    this.arrow.style.display = 'none';
    this.hud.el.appendChild(this.arrow);
    // qualidade
    this.gov = new QualityGovernor({
      initial: o.tier,
      mode: loadMode(),
      emit: false,
      persist: false,
      onChange: (tier) => {
        this.world.setTier(tier);
        this.limiter.cap = settingsFor(tier).fpsCap;
      },
      onResScale: (k) => this.world.setResScale(k),
      minResScale: 0.7,
    });
    this.limiter.cap = settingsFor(this.gov.tier).fpsCap;
    this.ro = new ResizeObserver(() => this.world.resize());
    this.ro.observe(o.root);
    const kd = (e: KeyboardEvent) => this.onKey(e, true);
    const ku = (e: KeyboardEvent) => this.onKey(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    this.offs.push(() => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    });
    // fotos de referência (tudo normal agora)
    this.updateCamera(0);
    this.world.scene.updateMatrixWorld(true);
    this.shots = this.world.snapshots();
    this.hud.setClock(0, o.night);
    this.hud.memorize(this.memT);
    this.hud.glow('book', true);
    this.refreshHud(true);
    this.au.startHum();
    this.hud.toast(t('ano.tip.memo', 'Seu turno vai começar. Ande e memorize as salas!'), '👀');
    say(t('ano.say.memo', 'Olhe tudo com calma e lembre como as salas são!'), { urgent: true });
    if (o.tutorial) setTimeout(() => !this.dead && this.state === 'memorize' && !this.hud.panelOpen && this.openNotebook(), 1600);
  }

  /* ============================== laço ============================== */
  start(): void {
    this.last = performance.now();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      if (!this.limiter.shouldRender(now)) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const t0 = performance.now();
      if (!this.paused) this.step(dt);
      this.world.render();
      this.gov.sample(dt * 1000, performance.now() - t0);
      this.fpsAcc.n++;
      this.fpsAcc.t += dt;
      if (this.fpsAcc.t >= 1) {
        this.fps = this.fpsAcc.n / this.fpsAcc.t;
        this.fpsAcc = { n: 0, t: 0 };
      }
    };
    this.raf = requestAnimationFrame(loop);
  }
  pause(): void {
    this.paused = true;
    this.ctl.show(false);
    this.au.setHum(0);
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
    if (!this.hud.panelOpen && this.monIdx < 0 && (this.state === 'play' || this.state === 'memorize')) this.ctl.show(true);
    this.au.setHum(1);
  }
  get inMatch(): boolean {
    return this.state === 'play' || this.state === 'memorize';
  }

  /** avança N quadros (testes) */
  tick(n: number, dt = 1 / 30): void {
    for (let i = 0; i < n; i++) this.step(dt);
    this.world.render();
  }

  private step(dt: number): void {
    const playing = this.state === 'play' || this.state === 'memorize';
    if (playing) this.control(dt);
    if (this.state === 'memorize') {
      this.memT -= dt;
      if (this.memT <= 0) this.beginShift();
    } else if (this.state === 'play') this.playStep(dt);
    else if (this.state === 'caught') this.caughtStep(dt);
    else if (this.state === 'dawn') {
      this.dawnT += dt;
      if (this.dawnT > 3.2) this.finish(false);
    }
    // NPCs
    for (const n of this.world.npcs) this.npcStep(n, dt);
    for (const [, p] of this.peekers) {
      p.update(dt);
      const c = this.world.cam.position;
      p.root.rotation.y = Math.atan2(-(c.x - p.root.position.x), -(c.z - p.root.position.z));
    }
    this.o.build.update?.(dt);
    this.updatePoofs(dt);
    this.updateCamera(dt);
    this.updateBubbles();
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.12;
      this.refreshHud(false);
    }
  }

  /* ============================== jogador ============================== */
  private onKey(e: KeyboardEvent, down: boolean): void {
    if (down) this.keys.add(e.code);
    else this.keys.delete(e.code);
    if (!down || e.repeat || this.paused) return;
    if (e.code === 'KeyF' || e.code === 'Space') this.photo ? this.snap() : this.setPhoto(true);
    else if (e.code === 'KeyQ') this.setPhoto(false);
    else if (e.code === 'KeyE') this.useBtn(true);
    else if (e.code === 'KeyM') this.monIdx >= 0 ? this.hud.closePanel() : this.openMonitor();
    else if (e.code === 'KeyN') this.hud.panelOpen ? this.hud.closePanel() : this.openNotebook();
    if (e.code === 'KeyE') setTimeout(() => this.useBtn(false), 0);
  }

  private control(dt: number): void {
    if (this.hud.panelOpen || this.monIdx >= 0) return;
    const [ly, lp] = this.ctl.consumeLook(dt);
    const sens = this.photo ? 0.6 : 1;
    this.yaw -= ly * sens;
    this.pitch = clamp(this.pitch - lp * sens, -1.25, 1.2);
    if (this.keys.has('KeyJ')) this.yaw += dt * 2;
    if (this.keys.has('KeyL')) this.yaw -= dt * 2;
    const [rx, fy] = this.ctl.dir();
    const sp = WALK * (this.photo ? 0.55 : 1);
    const sx = -Math.sin(this.yaw),
      sz = -Math.cos(this.yaw);
    const dx = (sx * fy + Math.cos(this.yaw) * rx) * sp * dt;
    const dz = (sz * fy - Math.sin(this.yaw) * rx) * sp * dt;
    const ox = this.pos.x,
      oz = this.pos.z;
    this.pos.x += dx;
    this.pos.z += dz;
    slide(this.pos, PLAYER_R, this.world.colliders);
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.bob += moved * 6.5;
    this.stepAcc += moved;
    if (this.stepAcc > 0.62) {
      this.stepAcc = 0;
      this.au.step();
    }
  }

  private updateCamera(dt: number): void {
    const c = this.world.cam;
    const targetFov = this.photo ? 52 : this.world.baseFov;
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 10);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
    if (this.camOverride) {
      c.position.copy(this.camOverride.pos);
      c.lookAt(this.camOverride.look);
      c.updateMatrixWorld();
      return;
    }
    let sx = 0,
      sy = 0;
    if (this.state === 'caught') {
      const k = Math.max(0, 1 - Math.abs(this.catchT - 0.75) * 2);
      sx = (Math.random() - 0.5) * 0.12 * k;
      sy = (Math.random() - 0.5) * 0.12 * k;
    }
    c.position.set(this.pos.x + sx, EYE + Math.sin(this.bob) * 0.035 + sy, this.pos.z);
    c.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    c.updateMatrixWorld();
  }

  get room(): RoomDef | null {
    return this.world.roomAt(this.pos.x, this.pos.z);
  }

  /* ============================== turno ============================== */
  beginShift(): void {
    if (this.state !== 'memorize') return;
    this.state = 'play';
    this.hud.memorize(null);
    this.hud.glow('book', false);
    this.dir.start(0);
    this.hud.toast(t('ano.tip.start', 'O turno começou! Ache o que mudou e tire FOTO.'), IC.camera());
    say(t('ano.say.start', 'O turno começou! Se algo mudar, tire uma foto!'), { urgent: true });
    tap('medium');
  }

  private playStep(dt: number): void {
    this.t += dt;
    const T = this.cfg.shiftSec;
    if (this.t >= T) return this.dawn();
    // diretor
    const evs = this.dir.update(this.t, (i) => this.canPlace(i));
    for (const e of evs) {
      if (e.type === 'spawn') this.applyAnomaly(e.a, true);
      else {
        this.applyAnomaly(e.a, false);
        this.stats.missed++;
        this.addDanger(this.cfg.dangerMiss);
        this.au.missed();
        this.hud.toast(t('ano.missed', 'Uma anomalia escapou... o Bocudo ficou mais perto!'), IC.bocudo(), true);
        this.hud.shake();
      }
    }
    // perigo contínuo
    this.addDanger(this.cfg.dangerPerSec * this.dir.active.length * dt);
    // dicas
    if (this.cfg.hintAfter > 0)
      for (const a of this.dir.active) {
        if (a.hinted || this.t - a.at < this.cfg.hintAfter) continue;
        a.hinted = true;
        const r = this.o.build.rooms.find((x) => x.id === this.o.build.slots[a.slot].room);
        if (r) {
          this.hud.toast(t('ano.hint', 'Algo mudou em: {room}', { room: r.name }), r.icon ?? '❓');
          this.au.whisper(this.panTo(this.world.anchorOf(this.world.slots[a.slot], _v)));
        }
      }
    this.hud.alert('mon', this.dir.active.some((a) => a.hinted));
    // sons de anomalia
    for (const a of this.dir.active) if (a.kind === 'sound') this.soundStep(a, dt);
    // energia
    for (let i = 0; i < this.outages.length; i++)
      if (this.t >= this.outages[i]) {
        this.outages.splice(i--, 1);
        this.outage(14);
      }
    if (this.powerOffT > 0) {
      this.powerOffT -= dt;
      if (this.powerOffT <= 0) this.power(true, true);
    } else if (this.danger > 65 || this.hunt) {
      this.flickT -= dt;
      if (this.flickT <= 0) {
        this.flickT = this.rng.range(2, 6) * (this.hunt ? 0.4 : 1);
        this.o.build.setPower(false);
        this.au.flicker();
        setTimeout(() => this.powerOffT <= 0 && !this.dead && this.o.build.setPower(true), 90);
      }
    }
    // caçada
    if (this.hunt) this.huntStep(dt);
    else if (this.danger >= 100) this.startHunt();
    this.au.heart(dt, this.hunt ? 1 : clamp((this.danger - 55) / 45, 0, 1));
    this.interactStep(dt);
    this.photoCd -= dt;
  }

  private addDanger(d: number): void {
    this.danger = clamp(this.danger + d, 0, 100);
  }

  /** o diretor só cria anomalia onde ninguém está olhando */
  private canPlace(i: number): boolean {
    const si = this.world.slots[i];
    const p = this.world.anchorOf(si, _v);
    const cam = this.world.cam;
    if (Math.hypot(p.x - cam.position.x, p.z - cam.position.z) < 2.5) return false;
    if (this.world.seenBy(cam, p, 30, 1.25)) return false;
    if (this.monIdx >= 0) {
      const mc = this.world.monitorCam();
      if (this.world.seenBy(mc, p, 30, 1.2)) return false;
    }
    return true;
  }

  private applyAnomaly(a: Active, on: boolean): void {
    const si = this.world.slots[a.slot];
    if (on) this.live.set(a.id, a);
    else this.live.delete(a.id);
    try {
      si.slot.apply(a.kind, on, a.variant);
    } catch (e) {
      console.warn('[anomalias] apply', si.slot.id, e);
    }
    if (si.npc) this.npcAnomaly(si, a.kind, on, a.variant);
    if (a.kind === 'creature') {
      if (on) {
        const m = new Bocudo();
        m.root.scale.setScalar(0.42);
        m.open = 0.7;
        const p = si.anchor0;
        m.root.position.set(p.x, 0, p.z);
        this.world.scene.add(m.root);
        this.peekers.set(a.id, m);
      } else {
        const m = this.peekers.get(a.id);
        if (m) {
          m.root.removeFromParent();
          this.peekers.delete(a.id);
        }
      }
    }
    if (a.kind === 'sound') this.soundT.set(a.id, 1);
  }

  private npcAnomaly(si: SlotInfo, kind: AnomalyKind, on: boolean, v: number): void {
    const n = this.world.npcs.find((x) => x.model === si.npc);
    if (!n) return;
    const m = n.model;
    switch (kind) {
      case 'face':
        m.setFace(on ? FACE_VARIANTS[v % FACE_VARIANTS.length] : 'normal');
        break;
      case 'move':
        n.follow = on && v % 2 === 1 && m.pose === 'stand';
        if (!on) {
          m.lookYaw = null;
          n.pos.copy(n.home);
          m.root.position.copy(n.home);
          m.root.rotation.y = n.homeYaw;
          m.walking = 0;
        } else m.lookYaw = n.homeYaw;
        break;
      case 'scale':
        m.root.scale.setScalar(m.size * (on ? (v % 2 ? 0.6 : 1.55) : 1));
        break;
      case 'color':
        m.setTint(on ? TINTS[v % TINTS.length] : null);
        break;
      case 'missing':
        m.root.visible = !on;
        break;
      default:
        break;
    }
    // 'move' liga o olhar contínuo (npcStep)
    (n as Npc & { watching?: boolean }).watching = on && kind === 'move';
  }

  private npcStep(n: Npc & { watching?: boolean }, dt: number): void {
    const m = n.model;
    if (n.watching) {
      const c = this.world.cam.position;
      m.lookYaw = Math.atan2(-(c.x - n.pos.x), -(c.z - n.pos.z));
      if (n.follow && this.state === 'play') {
        _w.set(n.pos.x, 1, n.pos.z);
        const seen = this.world.seenBy(this.world.cam, _w, 30, 1.1);
        const d = Math.hypot(c.x - n.pos.x, c.z - n.pos.z);
        if (!seen && d > 1.6) {
          const k = (0.9 * dt) / d;
          n.pos.x += (c.x - n.pos.x) * k;
          n.pos.z += (c.z - n.pos.z) * k;
          slide(n.pos, 0.35, this.world.colliders);
          n.pos.y = 0;
          m.walking = 1;
        } else m.walking = Math.max(0, m.walking - dt * 4);
        m.root.position.copy(n.pos);
      }
    }
    m.update(dt);
  }

  private soundStep(a: Active, dt: number): void {
    const left = (this.soundT.get(a.id) ?? 0) - dt;
    if (left > 0) return void this.soundT.set(a.id, left);
    this.soundT.set(a.id, this.rng.range(4, 6.5));
    const p = this.world.anchorOf(this.world.slots[a.slot], _v);
    const d = p.distanceTo(this.world.cam.position);
    if (d > 18) return;
    this.au.eerie(a.variant, this.panTo(p), clamp(1.15 - d / 16, 0.15, 1));
  }

  private panTo(p: THREE.Vector3): number {
    const c = this.world.cam;
    _w.subVectors(p, c.position).normalize();
    // direita da câmera
    return clamp(_w.x * Math.cos(this.yaw) - _w.z * Math.sin(this.yaw), -1, 1) * 0.9;
  }

  /* ============================== energia ============================== */
  private power(on: boolean, sound = false): void {
    this.o.build.setPower(on);
    this.world.setHemi((this.o.build.env?.ambient ?? 1.15) * (on ? 1 : 0.45));
    this.au.setHum(on ? 1 : 0.15);
    if (sound) on ? this.au.powerUp() : this.au.powerDown();
  }
  outage(sec: number): void {
    this.powerOffT = sec;
    this.power(false, true);
    this.hud.toast(t('ano.outage', 'Acabou a luz! A lanterna ainda funciona.'), '🔦', true);
    say(t('ano.say.outage', 'Acabou a luz!'), { urgent: true });
  }

  /* ============================== foto ============================== */
  setPhoto(on: boolean): void {
    if (on && !(this.state === 'play' || this.state === 'memorize')) return;
    if (this.photo === on) return;
    this.photo = on;
    this.hud.setPhoto(on);
    if (on) {
      this.au.raise();
      this.hud.glow('cam', false);
    }
  }

  /** dispara: anomalia no quadro + visível (frustum + raio) → registrada */
  snap(): void {
    if (!this.photo || this.photoCd > 0 || this.paused) return;
    this.photoCd = 1.1;
    this.au.shutter();
    this.hud.flash();
    tap('medium');
    // render + miniatura no mesmo quadro (sem preserveDrawingBuffer)
    this.updateCamera(0);
    this.world.render();
    const thumb = this.world.grab(192, 120);
    if (this.state === 'memorize') {
      this.hud.polaroid(thumb, false);
      this.hud.toast(t('ano.notYet', 'O turno ainda não começou: só memorize!'), '👀');
      return;
    }
    if (this.state !== 'play') return;
    const cam = this.world.cam;
    // Bocudo no quadro: o flash espanta!
    if (this.hunt && this.hunt.flee <= 0) {
      _v.copy(this.hunt.pos).setY(1.1);
      if (this.world.seenBy(cam, _v, 14, 0.9)) {
        this.hud.polaroid(thumb, true);
        this.scare();
        return;
      }
    }
    let best: Active | null = null;
    let bestD = Infinity;
    for (const a of this.dir.active) {
      const si = this.world.slots[a.slot];
      const p = a.kind === 'creature' && this.peekers.get(a.id) ? this.peekers.get(a.id)!.root.getWorldPosition(_v).setY(0.4) : this.world.anchorOf(si, _v);
      if (!this.world.seenBy(cam, p, 14, 0.86)) continue;
      // mais perto do centro do visor ganha
      _w.copy(p).project(cam);
      const d = Math.hypot(_w.x, _w.y);
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) {
      const a = best;
      this.dir.resolve(a.id, this.t);
      this.stats.reported++;
      this.addDanger(DANGER_REPORT);
      this.hud.polaroid(thumb, true);
      this.hud.stamp(true, t('ano.reported', 'Anomalia registrada!'));
      this.au.good();
      say(t('ano.say.good', 'Muito bem!'), { cool: 8000 });
      const si = this.world.slots[a.slot];
      const at = this.world.anchorOf(si, new THREE.Vector3());
      setTimeout(() => {
        if (this.dead) return;
        this.applyAnomaly(a, false);
        this.poof(at);
      }, 650);
    } else {
      this.stats.wrong++;
      this.addDanger(this.cfg.dangerWrong);
      this.hud.polaroid(thumb, false);
      this.hud.stamp(false, t('ano.nothing', 'Nada estranho aqui...'));
      this.au.bad();
    }
  }

  private poof(at: THREE.Vector3): void {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.poofTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.position.copy(at);
    s.scale.setScalar(0.3);
    this.world.scene.add(s);
    this.poofs.push({ s, t: 0 });
  }
  private updatePoofs(dt: number): void {
    for (let i = this.poofs.length - 1; i >= 0; i--) {
      const p = this.poofs[i];
      p.t += dt;
      const k = p.t / 0.6;
      p.s.scale.setScalar(0.3 + k * 1.6);
      (p.s.material as THREE.SpriteMaterial).opacity = 1 - k;
      if (k >= 1) {
        p.s.removeFromParent();
        p.s.material.dispose();
        this.poofs.splice(i, 1);
      }
    }
  }

  /* ============================== monitor / caderno ============================== */
  openMonitor(): void {
    if (!(this.state === 'play' || this.state === 'memorize') || !this.monCams.length) return;
    this.setPhoto(false);
    this.ctl.show(false);
    this.au.click();
    this.au.staticOn(true);
    const alertRooms = new Set(this.dir.active.filter((a) => a.hinted).map((a) => this.o.build.slots[a.slot].room));
    const start = this.monIdx >= 0 ? this.monIdx : Math.max(0, this.monCams.findIndex((c) => c.room.id !== this.room?.id));
    this.hud.setMonitorMode(true);
    this.hud.monitor(
      this.monCams,
      start,
      (r) => r.name,
      (id) => this.shots.get(id),
      (i) => {
        this.monIdx = i;
        const c = this.monCams[i];
        const cam = c.room.cams[c.k];
        this.world.monitorOn = cam;
        this.world.monNoise = 0.55;
        this.world.monDirty();
        setTimeout(() => (this.world.monNoise = 0.08), 140);
        this.au.click();
      },
      () => {
        this.world.monitorOn = null;
        this.monIdx = -1;
        this.au.staticOn(false);
        this.hud.setMonitorMode(false);
        if (!this.paused && this.inMatch) this.ctl.show(true);
      },
      alertRooms,
    );
    this.hud.alert('mon', false);
  }
  openNotebook(focus?: string): void {
    if (!(this.state === 'play' || this.state === 'memorize')) return;
    this.setPhoto(false);
    this.ctl.show(false);
    this.au.click();
    this.hud.glow('book', false);
    this.hud.notebook(this.o.build.rooms, this.shots, (r) => r.name, () => !this.paused && this.inMatch && this.monIdx < 0 && this.ctl.show(true), focus);
  }

  /* ============================== tarefas ============================== */
  private addBubble(def: InteractDef, want: string): void {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d')!;
    x.fillStyle = '#fff';
    x.strokeStyle = '#1d0b3a';
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(8, 6, 112, 96, 28);
    x.moveTo(52, 100);
    x.lineTo(64, 122);
    x.lineTo(76, 100);
    x.fill();
    x.stroke();
    x.fillStyle = '#fff';
    x.fillRect(50, 96, 28, 8);
    drawItem(x, this.items.get(want), 64, 54, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    const b = new THREE.Box3().setFromObject(def.object);
    const c = b.isEmpty() ? def.object.getWorldPosition(new THREE.Vector3()) : b.getCenter(new THREE.Vector3());
    s.position.set(c.x, (b.isEmpty() ? c.y : b.max.y) + 0.45, c.z);
    s.scale.setScalar(0.42);
    s.renderOrder = 5;
    this.world.scene.add(s);
    this.bubbles.set(def, s);
  }
  private updateBubbles(): void {
    const c = this.world.cam.position;
    const tt = performance.now() / 1000;
    for (const [, s] of this.bubbles) {
      const d = s.position.distanceTo(c);
      s.visible = d < 11 && this.monIdx < 0;
      s.scale.setScalar(0.42 + Math.sin(tt * 3) * 0.02);
    }
  }

  private interactStep(dt: number): void {
    // a interação mais perto, de frente
    const c = this.world.cam;
    c.getWorldDirection(_fwd);
    let best: InteractDef | null = null;
    let bd = Infinity;
    if (!this.photo && !this.hud.panelOpen && this.monIdx < 0)
      for (const d of this.tasks.usable()) {
        const dx = d.at.x - this.pos.x,
          dz = d.at.z - this.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 1.5) continue;
        d.object.getWorldPosition(_v);
        _w.subVectors(_v, c.position).setY(0).normalize();
        const face = _w.x * _fwd.x + _w.z * _fwd.z;
        if (face < 0.1 && dist > 0.6) continue;
        const score = dist - face;
        if (score < bd) {
          bd = score;
          best = d;
        }
      }
    this.near = best;
    if (this.hold) {
      if (this.hold.def !== best) this.hold = null;
      else {
        this.hold.t += dt;
        if (this.hold.t >= this.hold.sec) {
          const d = this.hold.def;
          this.hold = null;
          this.finishTask(d, true);
        }
      }
    }
    if (!best) this.hud.setUse(null);
    else {
      const a = this.tasks.action(best);
      const icon = best.gives?.length ? (best.icon ?? '🧰') : a.type === 'none' && best.wants?.length ? (best.icon ?? '❓') : (best.icon ?? '✋');
      this.hud.setUse(icon, a.type === 'none', this.hold ? this.hold.t / this.hold.sec : 0);
    }
    this.arrowStep();
  }

  private useBtn(down: boolean): void {
    if (!down) {
      this.hold = null;
      return;
    }
    const d = this.near;
    if (!d || this.state !== 'play' && this.state !== 'memorize') return;
    if (this.state === 'memorize') {
      this.hud.toast(t('ano.notYetTask', 'Primeiro memorize: as tarefas começam com o turno.'), '👀');
      return;
    }
    const a = this.tasks.action(d);
    const tk = this.tasks.taskOf(d);
    if (a.type === 'tap') this.finishTask(d, true);
    else if (a.type === 'hold') this.hold = { def: d, t: 0, sec: a.sec };
    else if (a.type === 'choose') {
      const opts = a.options.map((id) => this.items.get(id)).filter((x): x is ItemDef => !!x);
      const want = this.cfg.taskArrows ? this.neededItem() : null;
      this.ctl.show(false);
      this.au.click();
      this.hud.choose(
        opts,
        (id) => {
          if (a.answer && id !== a.answer) {
            this.au.bad();
            this.tasks.complete(d, false, id);
            return false;
          }
          if (a.answer) this.finishTask(d, true, id);
          else {
            this.tasks.carrying = id;
            this.au.pick();
            this.hud.toast(t('ano.carry', 'Leve até quem pediu!'), '🫴');
          }
          return true;
        },
        t('ano.pickOne', 'Escolha um'),
        d.icon ?? '🧰',
        want ? this.items.get(want) : null,
      );
      // ao fechar, volta o controle
      const iv = setInterval(() => {
        if (this.dead || !this.hud.panelOpen) {
          clearInterval(iv);
          if (!this.dead && this.monIdx < 0 && this.inMatch && !this.paused) this.ctl.show(true);
        }
      }, 150);
    } else if (tk?.want) {
      const it = this.items.get(tk.want);
      if (this.tasks.carrying && this.tasks.carrying !== tk.want) {
        this.au.bad();
        this.hud.toast(t('ano.wrongItem', 'Não é esse! Precisa deste:'), it ? itemSvg(it) : '❓', true);
        this.tasks.carrying = null;
      } else this.hud.toast(t('ano.needItem', 'Precisa deste item:'), it ? itemSvg(it) : '❓');
    }
  }

  /** item que alguma tarefa pendente pede (para dica) */
  private neededItem(): string | null {
    const tk = this.tasks.tasks.find((x) => !x.done && x.want);
    return tk?.want ?? null;
  }

  private finishTask(d: InteractDef, ok: boolean, picked?: string): void {
    this.tasks.complete(d, ok, picked);
    if (!ok) return;
    const b = this.bubbles.get(d);
    if (b) {
      b.removeFromParent();
      (b.material as THREE.SpriteMaterial).map?.dispose();
      b.material.dispose();
      this.bubbles.delete(d);
    }
    this.au.taskDone();
    tap('light');
    this.hud.stamp(true, t('ano.taskDone', 'Tarefa feita!'));
    this.poof(d.object.getWorldPosition(new THREE.Vector3()).setY(1.2));
    this.dir.taskRooms = this.tasks.rooms;
    if (this.tasks.doneCount === this.tasks.tasks.length) this.hud.toast(t('ano.allTasks', 'Todas as tarefas feitas! Continue de olho.'), '⭐');
  }

  /** seta (fácil): aponta a próxima tarefa / o armário quando precisa de item */
  private arrowStep(): void {
    if (!this.cfg.taskArrows || this.state !== 'play' || this.photo || this.monIdx >= 0) {
      this.arrow.style.display = 'none';
      return;
    }
    let target: InteractDef | null = null;
    const carrying = this.tasks.carrying;
    const pend = this.tasks.tasks.filter((x) => !x.done);
    if (!pend.length) {
      this.arrow.style.display = 'none';
      return;
    }
    const wantTask = carrying ? pend.find((x) => x.want === carrying) : null;
    if (wantTask) target = wantTask.def;
    else {
      // mais perto (as que pedem item levam ao armário se ainda não tem)
      let bd = Infinity;
      for (const tk of pend) {
        let d: InteractDef = tk.def;
        if (tk.want && !carrying && this.tasks.sources[0]) d = this.tasks.sources[0];
        const dist = Math.hypot(d.at.x - this.pos.x, d.at.z - this.pos.z);
        if (dist < bd) {
          bd = dist;
          target = d;
        }
      }
    }
    if (!target || target === this.near) {
      this.arrow.style.display = 'none';
      return;
    }
    const b = new THREE.Box3().setFromObject(target.object);
    const p = b.isEmpty() ? target.object.getWorldPosition(_v) : _v.set((b.min.x + b.max.x) / 2, b.max.y + 0.5, (b.min.z + b.max.z) / 2);
    const cam = this.world.cam;
    cam.getWorldDirection(_fwd);
    _w.subVectors(p, cam.position);
    const behind = _w.dot(_fwd) < 0;
    _w.copy(p).project(cam);
    let x = _w.x,
      y = _w.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const W = this.o.root.clientWidth,
      H = this.o.root.clientHeight;
    const on = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    this.arrow.style.display = 'block';
    if (on) {
      const bounce = Math.sin(performance.now() / 160) * 6;
      this.arrow.style.transform = `translate(${((x + 1) / 2) * W}px, ${((1 - y) / 2) * H - 26 + bounce}px)`;
    } else {
      const k = 0.82 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      const ex = clamp(x * k, -0.8, 0.8),
        ey = clamp(y * k, -0.55, 0.3);
      const ang = Math.atan2(-ey, ex) - Math.PI / 2;
      this.arrow.style.transform = `translate(${((ex + 1) / 2) * W}px, ${((1 - ey) / 2) * H}px) rotate(${ang}rad)`;
    }
  }

  /* ============================== Bocudo ============================== */
  private startHunt(): void {
    const m = new Bocudo();
    const spawn = this.farSpawn();
    m.root.position.copy(spawn);
    this.world.scene.add(m.root);
    this.hunt = { m, pos: spawn.clone(), t: 0, flee: 0, growlT: 2, path: [], pathT: 0 };
    this.au.alarm();
    this.au.growl(this.panTo(spawn));
    this.hud.toast(t('ano.hunt', 'O Bocudo acordou! Fuja ou tire FOTO dele!'), IC.bocudo(), true);
    this.hud.glow('cam', true);
    say(t('ano.say.hunt', 'O Bocudo está vindo! Tire uma foto dele!'), { urgent: true });
    tap('heavy');
  }
  private farSpawn(): THREE.Vector3 {
    const b = this.o.build;
    const pts = b.creatureSpawns?.length ? b.creatureSpawns : b.rooms.map((r) => ({ x: (r.min.x + r.max.x) / 2, y: 0, z: (r.min.z + r.max.z) / 2 }));
    let best = pts[0],
      bd = -1;
    for (const p of pts) {
      const d = Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
      if (d > bd) {
        bd = d;
        best = p;
      }
    }
    return new THREE.Vector3(best.x, 0, best.z);
  }
  private scare(): void {
    const h = this.hunt;
    if (!h) return;
    h.flee = 1.4;
    this.au.squeal();
    this.hud.stamp(true, t('ano.scared', 'O flash espantou o Bocudo!'));
    this.danger = DANGER_AFTER_SCARE;
    this.hud.glow('cam', false);
  }
  private huntStep(dt: number): void {
    const h = this.hunt!;
    h.t += dt;
    const m = h.m;
    if (h.flee > 0) {
      h.flee -= dt;
      _w.set(h.pos.x - this.pos.x, 0, h.pos.z - this.pos.z).normalize();
      h.pos.addScaledVector(_w, dt * 4);
      m.root.scale.setScalar(Math.max(0.01, h.flee / 1.4));
      m.open = 1;
      m.walking = 1;
      m.root.position.copy(h.pos);
      m.update(dt);
      if (h.flee <= 0) this.endHunt();
      return;
    }
    if (h.t > 45) {
      this.danger = 70;
      this.hud.toast(t('ano.gaveUp', 'Ufa! O Bocudo cansou e foi embora.'), '😮‍💨');
      return this.endHunt();
    }
    // anda até o jogador (grafo de caminhada quando há parede no meio)
    const target = this.huntTarget(h, dt);
    const dx = target.x - h.pos.x,
      dz = target.z - h.pos.z;
    const d = Math.hypot(dx, dz);
    const sp = this.cfg.creatureSpeed * Math.min(1, 0.4 + h.t / 3);
    if (d > 0.01) {
      h.pos.x += (dx / d) * sp * dt;
      h.pos.z += (dz / d) * sp * dt;
      slide(h.pos, 0.42, this.world.colliders);
      m.root.rotation.y = Math.atan2(-dx, -dz);
    }
    m.walking = 1;
    m.open = 0.45 + Math.sin(h.t * 5) * 0.15;
    m.root.position.set(h.pos.x, 0, h.pos.z);
    m.update(dt);
    h.growlT -= dt;
    if (h.growlT <= 0) {
      h.growlT = 3.5;
      this.au.growl(this.panTo(h.pos));
    }
    if (Math.hypot(this.pos.x - h.pos.x, this.pos.z - h.pos.z) < 1.05) this.caught();
  }
  private huntTarget(h: Hunt, dt: number): { x: number; z: number } {
    const me = new THREE.Vector3(this.pos.x, 1, this.pos.z);
    const from = new THREE.Vector3(h.pos.x, 1, h.pos.z);
    const nav = this.o.build.nav;
    if (!nav || !nav.nodes.length || !this.world.occluded(from, me)) {
      h.path = [];
      return this.pos;
    }
    h.pathT -= dt;
    if (h.pathT <= 0 || !h.path.length) {
      h.pathT = 0.8;
      h.path = navPath(nav, h.pos, this.pos, this.world);
    }
    while (h.path.length) {
      const n = nav.nodes[h.path[0]];
      if (Math.hypot(n.x - h.pos.x, n.z - h.pos.z) < 0.5) h.path.shift();
      else return n;
    }
    return this.pos;
  }
  private endHunt(): void {
    if (!this.hunt) return;
    this.hunt.m.root.removeFromParent();
    this.hunt = null;
    this.hud.glow('cam', false);
  }

  /** NHAC! (sem violência: bocão, tremida, mordida de desenho e tela preta) */
  caught(): void {
    if (this.state !== 'play') return;
    this.state = 'caught';
    this.catchT = 0;
    this.setPhoto(false);
    this.hud.closePanel();
    this.ctl.show(false);
    this.hud.setUse(null);
    this.arrow.style.display = 'none';
    if (!this.hunt) {
      const m = new Bocudo();
      this.world.scene.add(m.root);
      this.hunt = { m, pos: new THREE.Vector3(), t: 0, flee: 0, growlT: 9, path: [], pathT: 0 };
    }
    // vira para o bicho
    const h = this.hunt;
    this.yaw = Math.atan2(-(h.pos.x - this.pos.x), -(h.pos.z - this.pos.z));
    if (!isFinite(this.yaw)) this.yaw = 0;
    this.pitch = 0.05;
    this.au.growl(0);
    tap('heavy');
  }
  private caughtStep(dt: number): void {
    this.catchT += dt;
    const h = this.hunt!;
    const k = Math.min(1, this.catchT / 0.7);
    const dist = 2.4 - 1.25 * k * k;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    h.pos.set(this.pos.x + fx * dist, 0, this.pos.z + fz * dist);
    h.m.root.position.set(h.pos.x, 0.25 * k, h.pos.z);
    this.pitch = -0.05 - 0.12 * k;
    h.m.root.rotation.y = this.yaw + Math.PI;
    h.m.root.scale.setScalar(1 + 0.25 * k);
    h.m.open = 0.4 + 0.6 * k;
    h.m.walking = 0;
    h.m.update(dt);
    if (this.catchT >= 0.7 && this.catchT - dt < 0.7) {
      this.au.chomp();
      this.hud.shake();
      tap('heavy');
    }
    if (this.catchT > 1.0 && this.catchT - dt <= 1.0) this.finish(true);
  }

  /* ============================== fim ============================== */
  private dawn(): void {
    this.state = 'dawn';
    this.dawnT = 0;
    this.setPhoto(false);
    this.hud.closePanel();
    this.ctl.show(false);
    this.hud.setClock(360, this.o.night);
    this.hud.setUse(null);
    this.arrow.style.display = 'none';
    for (const a of this.dir.clear()) this.applyAnomaly(a, false);
    this.endHunt();
    this.power(true);
    this.au.chime();
    const d = document.createElement('div');
    d.className = 'ano-dawn';
    this.o.root.appendChild(d);
    requestAnimationFrame(() => d.classList.add('on'));
    this.hud.stamp(true, t('ano.dawn', '6:00! Turno completo!'));
    say(t('ano.say.dawn', 'Seis horas! Você conseguiu!'), { urgent: true });
  }

  private finish(caught: boolean): void {
    if (this.state === 'over') return;
    this.state = 'over';
    const r: NightResult = {
      map: this.o.build.id,
      night: this.o.night,
      diff: this.o.diff,
      reported: this.stats.reported,
      missed: this.stats.missed + (caught ? this.dir.active.length : 0),
      wrong: this.stats.wrong,
      tasksDone: this.tasks.doneCount,
      tasksTotal: this.tasks.tasks.length,
      survived: !caught,
      sec: Math.round(this.t),
    };
    this.o.onEnd(r, caught);
  }

  /* ============================== HUD ============================== */
  private refreshHud(force: boolean): void {
    const min = this.state === 'memorize' ? 0 : Math.min(360, (this.t / this.cfg.shiftSec) * 360);
    this.hud.setClock(min, this.o.night);
    if (this.state === 'memorize') this.hud.memorize(this.memT);
    this.hud.setDanger(this.danger / 100, !!this.hunt);
    this.hud.setTasks(this.tasks.tasks.map((x) => ({ icon: x.def.icon ?? '✋', done: x.done, item: x.want ? this.items.get(x.want) : undefined })));
    this.hud.setCarry(this.tasks.carrying ? (this.items.get(this.tasks.carrying) ?? null) : null);
    void force;
  }

  /* ============================== debug ============================== */
  /** força uma anomalia (testes): devolve o Active */
  debugSpawn(slotId?: string, kind?: AnomalyKind, variant?: number): Active | null {
    const a = this.dir.forceSpawn(this.t, (i) => this.canPlace(i), slotId, kind, variant);
    if (a) this.applyAnomaly(a, true);
    return a;
  }
  /** coloca o jogador olhando para um ponto */
  debugLook(x: number, z: number, tx: number, ty: number, tz: number): void {
    this.pos.x = x;
    this.pos.z = z;
    const dx = tx - x,
      dz = tz - z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(ty - EYE, Math.hypot(dx, dz));
    this.updateCamera(0);
  }
  debugTime(sec: number): void {
    this.t = sec;
  }
  debugDanger(v: number): void {
    this.danger = v;
  }
  get slotsInfo(): SlotInfo[] {
    return this.world.slots;
  }
  get statsNow(): typeof this.stats {
    return this.stats;
  }

  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    for (const f of this.offs) f();
    this.ctl.dispose();
    this.hud.dispose();
    this.au.dispose();
    this.poofTex.dispose();
    for (const [, s] of this.bubbles) {
      (s.material as THREE.SpriteMaterial).map?.dispose();
      s.material.dispose();
    }
    this.world.dispose();
  }
}

function poofTexture(): THREE.Texture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const x = cv.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,240,170,.9)');
  g.addColorStop(0.75, 'rgba(255,200,255,.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    x.fillStyle = '#fff';
    x.beginPath();
    x.arc(32 + Math.cos(a) * 24, 32 + Math.sin(a) * 24, 3, 0, Math.PI * 2);
    x.fill();
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

/** BFS no grafo de caminhada: nó mais perto do bicho → nó mais perto do jogador (com visão) */
function navPath(nav: NonNullable<MapBuild['nav']>, from: { x: number; z: number }, to: { x: number; z: number }, w: World): number[] {
  const near = (p: { x: number; z: number }) => {
    let bi = 0,
      bd = Infinity;
    const a = new THREE.Vector3(p.x, 1, p.z);
    const b = new THREE.Vector3();
    nav.nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z);
      const pen = w.occluded(a, b.set(n.x, 1, n.z)) ? 50 : 0;
      if (d + pen < bd) {
        bd = d + pen;
        bi = i;
      }
    });
    return bi;
  };
  const s = near(from),
    g = near(to);
  const adj: number[][] = nav.nodes.map(() => []);
  for (const [a, b] of nav.links) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const prev = new Array(nav.nodes.length).fill(-1);
  const seen = new Set([s]);
  const q = [s];
  while (q.length) {
    const c = q.shift()!;
    if (c === g) break;
    for (const n of adj[c])
      if (!seen.has(n)) {
        seen.add(n);
        prev[n] = c;
        q.push(n);
      }
  }
  const path: number[] = [];
  for (let c = g; c !== -1 && c !== s; c = prev[c]) path.unshift(c);
  path.unshift(s);
  return path;
}
