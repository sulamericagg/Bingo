/* ============================================================
 *  BLOOP BANDA — laço principal, partida (pista + banda), entrada,
 *  bots, julgamento de tempo, Modo Estrela, resultados.
 *  Telas DOM em ui.ts; Estúdio em studio.ts; online em net.ts.
 * ============================================================ */
import { bandIntro } from './intro';
import './band.css';
import { t, fmt } from '../../i18n';
import { gameFont } from '../../i18n/font';
import { save } from '../../core/storage';
import { QualityGovernor, type QualitySettings, type Tier } from '../../core/quality';
import { tap } from '../../core/haptics';
import type { MiniGameHandle } from '../../hub/registry';
import { SKINS, skinById, type Skin } from '../../game/skins';
import type { SongDef } from '../../music/api';
import { Highway, Hero } from './highway';
import { Stage, type Member } from './stage';
import { lookFor, instColors, setSeasonPalette, setMusicPass } from './cosmetics';
import {
  buildNotes,
  chartFor,
  INSTRUMENTS,
  J_GOOD,
  J_GREAT,
  J_MISS,
  J_NONE,
  J_PERFECT,
  J_POINTS,
  LANES,
  WINDOWS,
  type Difficulty,
  type Instrument,
  type Phrase,
  type RNote,
} from './model';
import { loadSongsModule, makePlayer, refreshCreations, type OwnedPlayer } from './songs';
import { bs, persistBand } from './save';
import type { BandNet } from './net';
import { Screens } from './ui';

const BOT_NAMES = ['Pipoca', 'Jujuba', 'Tico', 'Nina', 'Biscoito', 'Lulu', 'Zeca', 'Mimi', 'Tuca', 'Dudu', 'Pingo', 'Teca'];
const STAGE_ORDER: Instrument[] = ['guitar', 'drums', 'vocals', 'bass', 'keys'];
const LEAD = 2.6;

export interface BandSlot {
  inst: Instrument;
  name: string;
  skin: Skin;
  me?: boolean;
  remote?: string; // id do par online
  skill?: number;
}

interface BotSim {
  m: Member;
  notes: RNote[];
  ptr: number;
  skill: number;
  streak: number;
  cut: boolean;
  total: number;
  hits: number;
}

export interface RunResult {
  song: SongDef;
  inst: Instrument;
  diff: Difficulty;
  score: number;
  stars: number;
  acc: number;
  perfects: number;
  greats: number;
  goods: number;
  misses: number;
  maxCombo: number;
  place: number;
  members: { name: string; inst: Instrument; score: number; me: boolean }[];
  durationSec: number;
}

export class BandGame implements MiniGameHandle {
  root: HTMLElement;
  exitCb: () => void;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ui: HTMLDivElement;
  gov: QualityGovernor;
  q: QualitySettings;
  tier: Tier;
  w = 0;
  h = 0;
  dpr = 1;
  portrait = true;

  stage = new Stage();
  hw = new Highway();
  hero = new Hero();
  screens: Screens;

  actx: AudioContext | null = null;
  out: GainNode | null = null;
  player: OwnedPlayer | null = null;
  net: BandNet | null = null;

  // estado
  mode: 'menu' | 'play' = 'menu';
  members: Member[] = [];
  me: Member | null = null;
  song: SongDef | null = null;
  inst: Instrument = 'guitar';
  diff: Difficulty = 'facil';
  notes: RNote[] = [];
  phrases: Phrase[] = [];
  bots: BotSim[] = [];
  spb = 0.5;
  songT = -LEAD;
  startPerf = 0;
  audioOn = false;
  lastRaw = -99;
  rawPerf = 0;
  first = 0;
  next = 0;
  score = 0;
  combo = 0;
  maxCombo = 0;
  counts = [0, 0, 0, 0];
  sustainPts = 0;
  starMeter = 0;
  starOn = false;
  ended = false;
  paused = false;
  autoplay = false;
  /** pontos de base possíveis (para precisão) */
  private pops: { j: number; lane: number; t: number }[] = [];
  private popIdx = 0;
  private edgeL = -9;
  private edgeR = -9;
  private ptrLane = new Int8Array(16).fill(-1);
  private cut = false;
  private judgeTxt: string[] = [];
  private fontJ = '';
  private fontScore = '';
  private fontSmall = '';
  private fontBig = '';
  private scoreStr = '0';
  private shownScore = -1;
  private comboStr = '';
  private shownCombo = -1;
  private multStr = '';
  private countTxt = ['3', '2', '1', ''];
  private starTxt = '';
  private bannerT = -9;
  private raf = 0;
  private last = 0;
  private now = 0;
  private destroyed = false;
  private offs: (() => void)[] = [];
  private onEndCb: ((r: RunResult) => void) | null = null;

  constructor(root: HTMLElement, exit: () => void) {
    this.root = root;
    this.exitCb = exit;
    root.classList.add('bb-root');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bb-canvas';
    root.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.ui = document.createElement('div');
    this.ui.className = 'bb-ui';
    root.appendChild(this.ui);
    this.gov = new QualityGovernor({ persist: false, emit: false, onChange: (tier, s) => this.applyQuality(tier, s) });
    this.tier = this.gov.tier;
    this.q = this.gov.settings;
    this.judgeTxt = [t('band.j.perfect', 'Perfeito!'), t('band.j.great', 'Ótimo!'), t('band.j.good', 'Bom'), t('band.j.miss', 'Errou')];
    this.starTxt = t('band.starMode', 'MODO ESTRELA!');
    for (let i = 0; i < 6; i++) this.pops.push({ j: 0, lane: 0, t: -9 });
    this.resize();
    const ro = () => this.resize();
    window.addEventListener('resize', ro);
    this.offs.push(() => window.removeEventListener('resize', ro));
    this.bindInput();
    this.screens = new Screens(this);
    this.setMenuBand();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.loadExtras();
    this.screens.show('home');
  }

  private async loadExtras(): Promise<void> {
    await loadSongsModule();
    refreshCreations();
    try {
      const mods = import.meta.glob('../../pass/register.ts');
      const load = Object.values(mods)[0];
      if (load) {
        const m = (await load()) as { currentTheme?: () => { palette: [string, string, string] } | null };
        setSeasonPalette(m.currentTheme?.()?.palette ?? null);
      }
    } catch {
      /* sem passe */
    }
    try {
      const mods = import.meta.glob('../../pass/music/index.ts');
      const load = Object.values(mods)[0];
      if (load) setMusicPass((await load()) as Parameters<typeof setMusicPass>[0]);
    } catch {
      setMusicPass(null);
    }
    if (!this.destroyed) this.screens.refresh();
  }

  /* ------------------------- áudio ------------------------- */

  ensureAudio(): AudioContext | null {
    if (this.actx) {
      if (this.actx.state === 'suspended') this.actx.resume().catch(() => {});
      return this.actx;
    }
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC({ latencyHint: 'interactive' });
      const out = ctx.createGain();
      out.gain.value = save.music === false && save.sound === false ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      out.connect(comp).connect(ctx.destination);
      this.actx = ctx;
      this.out = out;
    } catch {
      this.actx = null;
    }
    return this.actx;
  }

  /* ------------------------- tamanho ------------------------- */

  private applyQuality(tier: Tier, s: QualitySettings): void {
    this.tier = tier;
    this.q = s;
    this.resize();
  }

  resize(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.w = w;
    this.h = h;
    this.portrait = h >= w;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.q.dprCap);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const u = Math.min(w, h);
    this.fontJ = gameFont(700, Math.round(u * 0.065));
    this.fontScore = gameFont(700, Math.round(u * 0.062));
    this.fontSmall = gameFont(700, Math.round(u * 0.04));
    this.fontBig = gameFont(700, Math.round(u * 0.2));
    this.layout();
  }

  layout(): void {
    const { w, h } = this;
    const L = this.mode === 'play' ? LANES[this.diff] : 5;
    if (this.mode === 'menu') {
      this.stage.layout(0, 0, w, h * (this.portrait ? 0.5 : 1), this.dpr);
      this.stage.layoutMembers(this.members, 0, this.portrait ? 1 : 0.5);
      return;
    }
    if (this.portrait) {
      this.stage.layout(0, 0, w, h * 0.35, this.dpr);
      this.stage.layoutMembers(this.members, 0);
      const wb = Math.min(w * 0.84, h * 0.6);
      this.setupHighway(w / 2, h * 0.3, h * 0.83, wb, wb * 0.36, L);
    } else {
      this.stage.layout(0, 0, w, h, this.dpr);
      const wb = Math.min(w * 0.44, h * 1.05);
      this.stage.layoutMembers(this.members, wb * 1.05);
      this.setupHighway(w / 2, h * 0.12, h * 0.82, wb, wb * 0.34, L);
    }
  }

  private setupHighway(cx: number, fy: number, hy: number, wb: number, wt: number, L: number): void {
    const look = lookFor(this.inst);
    this.hw.setup(cx, fy, hy, wb, wt, L, this.dpr, this.inst, look.hw, look.shape, look.line);
    this.hw.look = this.diff === 'facil' ? 2.0 : this.diff === 'medio' ? 1.7 : this.diff === 'dificil' ? 1.45 : 1.25;
    this.stage.fx = look.fx;
  }

  /* ------------------------- banda ------------------------- */

  makeMember(s: BandSlot): Member {
    return {
      inst: s.inst,
      skin: s.skin,
      name: s.name,
      me: !!s.me,
      bot: !s.me && !s.remote,
      remote: !!s.remote,
      pid: s.remote ?? '',
      col: instColors(s.inst),
      hitT: -9,
      missT: -9,
      combo: 0,
      score: 0,
      star: false,
      emote: '',
      emoteT: 0,
      spr: null,
      sprOops: null,
      sprR: 0,
      x: 0,
      y: 0,
      R: 20,
      ops: t('band.oops', 'ops!'),
    };
  }

  mySkin(): Skin {
    return save.skin === 'custom' ? skinById('custom') : skinById(save.skin);
  }

  /** banda de solo: você + 3 bots */
  soloSlots(inst: Instrument): BandSlot[] {
    const pool = SKINS.filter((s) => s.id !== 'custom');
    const pref: Instrument[] = ['drums', 'bass', 'guitar', 'vocals', 'keys'];
    const others = pref.filter((i) => i !== inst).slice(0, 3);
    const off = Math.floor(Math.random() * BOT_NAMES.length);
    const slots: BandSlot[] = [{ inst, name: t('band.you', 'Você'), skin: this.mySkin(), me: true }];
    others.forEach((i, k) => slots.push({ inst: i, name: BOT_NAMES[(off + k) % BOT_NAMES.length], skin: pool[(off * 3 + k * 5) % pool.length], skill: 0.86 + Math.random() * 0.1 }));
    return slots;
  }

  setMenuBand(): void {
    this.members = this.soloSlots(bs.inst).map((s) => this.makeMember(s));
    this.sortMembers();
    this.layout();
  }

  setBandPreview(slots: BandSlot[]): void {
    if (this.mode !== 'menu') return;
    this.members = slots.map((s) => this.makeMember(s));
    this.sortMembers();
    this.layout();
  }

  private sortMembers(): void {
    this.members.sort((a, b) => STAGE_ORDER.indexOf(a.inst) - STAGE_ORDER.indexOf(b.inst));
    this.me = this.members.find((m) => m.me) ?? null;
  }

  /* ------------------------- partida ------------------------- */

  /**
   * Começa uma música. startEpochMs (opcional) = horário combinado (Date.now) em que
   * a música começa (multiplayer); sem ele, contagem local.
   */
  startSong(song: SongDef, inst: Instrument, diff: Difficulty, slots: BandSlot[], opts: { startEpochMs?: number; net?: BandNet | null; onEnd?: (r: RunResult) => void } = {}): void {
    // abertura (1ª música sozinho): src/games/band/intro
    if (!opts.net && opts.startEpochMs === undefined && bandIntro.due()) {
      void bandIntro.once(this.root).then(() => {
        if (this.root.isConnected) this.startSong(song, inst, diff, slots, opts);
      });
      return;
    }
    const ctx = this.ensureAudio();
    this.stopPlayer();
    this.song = song;
    this.inst = inst;
    this.diff = diff;
    this.net = opts.net ?? null;
    this.onEndCb = opts.onEnd ?? null;
    this.spb = 60 / song.bpm;
    const L = LANES[diff];
    const built = buildNotes(chartFor(song, inst, diff), song.bpm, L);
    this.notes = built.notes;
    this.phrases = built.phrases;
    this.members = slots.map((s) => this.makeMember(s));
    this.sortMembers();
    this.bots = [];
    for (const m of this.members) {
      if (!m.bot) continue;
      const slot = slots.find((s) => s.name === m.name && s.inst === m.inst);
      const bn = buildNotes(chartFor(song, m.inst, diff), song.bpm, L).notes;
      this.bots.push({ m, notes: bn, ptr: 0, skill: slot?.skill ?? 0.9, streak: 0, cut: false, total: 0, hits: 0 });
    }
    this.mode = 'play';
    this.stage.setStage(song.stage);
    this.layout();
    this.first = 0;
    this.next = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts.fill(0);
    this.sustainPts = 0;
    this.starMeter = 0;
    this.starOn = false;
    this.ended = false;
    this.paused = false;
    this.cut = false;
    this.audioOn = false;
    this.lastRaw = -99;
    this.hw.press.fill(0);
    this.hw.flash.fill(0);
    this.hw.held.fill(0);
    this.hero.reset(Math.floor(L / 2));
    for (const p of this.pops) p.t = -9;
    const nowS = performance.now() / 1000;
    const lead = opts.startEpochMs ? Math.max(0.5, (opts.startEpochMs - Date.now()) / 1000) : LEAD;
    this.startPerf = nowS + lead;
    this.songT = -lead;
    if (ctx && this.out) {
      this.player = makePlayer(song, ctx, this.out);
      this.player.onEnd(() => {
        /* o fim é decidido pelo relógio + notas */
      });
    }
    this.screens.show('hud');
    bs.plays++;
    persistBand();
  }

  private stopPlayer(): void {
    if (this.player) {
      try {
        this.player.stop();
        this.player.dispose?.();
      } catch {
        /* */
      }
    }
    this.player = null;
  }

  /** tocando uma música agora (para o "Sair do jogo?" do hub) */
  inMatch(): boolean {
    return this.mode === 'play' && !this.ended;
  }

  quitSong(): void {
    this.stopPlayer();
    this.mode = 'menu';
    this.paused = false;
    if (this.actx?.state === 'suspended') this.actx.resume().catch(() => {});
    this.setMenuBand();
  }

  /**
   * Pausa. Sem `card` (voltar do hub / app em segundo plano) não mostra o cartão próprio: o hub já
   * mostra "Sair do jogo?" e os dois apareciam um atrás do outro. O botão de pausa do HUD usa o cartão.
   */
  pause(card = false): void {
    if (this.paused && !card && this.mode === 'play') {
      this.screens.show('hud');
      return;
    }
    if (this.mode !== 'play' || this.paused || this.ended || this.net) return;
    this.paused = true;
    this.actx?.suspend().catch(() => {});
    if (card) this.screens.show('pause');
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.actx?.resume().catch(() => {});
    this.lastRaw = -99;
    this.screens.show('hud');
  }

  /* ------------------------- entrada ------------------------- */

  private bindInput(): void {
    const c = this.canvas;
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.pointer(e, true);
    };
    const up = (e: PointerEvent) => this.pointer(e, false);
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    const kd = (e: KeyboardEvent) => this.key(e, true);
    const ku = (e: KeyboardEvent) => this.key(e, false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const vis = () => {
      if (document.hidden) this.pause();
    };
    document.addEventListener('visibilitychange', vis);
    this.offs.push(() => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('visibilitychange', vis);
    });
  }

  private pointer(e: PointerEvent, down: boolean): void {
    if (this.mode !== 'play' || this.paused || this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const slot = e.pointerId & 15;
    if (!down) {
      const l = this.ptrLane[slot];
      this.ptrLane[slot] = -1;
      if (l >= 0) this.release(l);
      return;
    }
    if (py < this.hw.fy - 10) return;
    const half = this.hw.wb / 2;
    if (px < this.hw.cx - half) return this.edge(0);
    if (px > this.hw.cx + half) return this.edge(1);
    const lane = this.hw.laneAt(px);
    this.ptrLane[slot] = lane;
    this.pressLane(lane);
  }

  private keyLane: Record<string, number> = { a: 0, s: 1, d: 2, f: 3, g: 4, h: 0, j: 1, k: 2, l: 3, ';': 4, '1': 0, '2': 1, '3': 2, '4': 3, '5': 4 };
  private keyHeld = new Set<string>();

  private key(e: KeyboardEvent, down: boolean): void {
    if (this.mode !== 'play') return;
    const k = e.key.toLowerCase();
    // Escape = voltar do hub (mostra "Sair do jogo?")
    if (k === 'escape') return;
    if (k === ' ' && down) {
      this.activateStar();
      e.preventDefault();
      return;
    }
    const lane = this.keyLane[k];
    if (lane == null || lane >= this.hw.L) return;
    e.preventDefault();
    if (down) {
      if (this.keyHeld.has(k)) return;
      this.keyHeld.add(k);
      this.pressLane(lane);
    } else {
      this.keyHeld.delete(k);
      this.release(lane);
    }
  }

  private edge(side: number): void {
    const n = this.now;
    if (side === 0) this.edgeL = n;
    else this.edgeR = n;
    if (Math.abs(this.edgeL - this.edgeR) < 0.35) this.activateStar();
  }

  /** tempo da música agora (entre quadros), já com a calibração */
  private tapTime(): number {
    const extra = performance.now() / 1000 - this.now;
    return this.songT + Math.min(0.05, Math.max(0, extra)) - bs.calib / 1000;
  }

  pressLane(lane: number): void {
    if (this.mode !== 'play' || this.paused || this.ended) return;
    const tt = this.tapTime();
    this.hw.press[lane] = 1;
    this.hero.pressT = this.now;
    this.hero.pressLane = lane;
    // acha a nota mais próxima nessa lane
    let best = -1;
    let bd = 9;
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > tt + WINDOWS[this.diff].good) break;
      if (n.j !== J_NONE || n.lane !== lane) continue;
      const d = Math.abs(n.t - tt);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0 && bd <= WINDOWS[this.diff].good) {
      const w = WINDOWS[this.diff];
      const j = bd <= w.perfect ? J_PERFECT : bd <= w.great ? J_GREAT : J_GOOD;
      this.hit(this.notes[best], j);
    }
    // pula até a tecla se estiver longe (e não houver pulo planejado)
    if (Math.abs(this.hero.to - lane) > 0.01 && (this.hero.h1 < this.songT || this.hero.h1 - this.songT > 0.2)) this.hero.hop(lane, this.songT, this.songT + 0.09);
    if (!this.autoplay) tap('light');
  }

  release(lane: number): void {
    for (let i = this.first; i < this.notes.length && this.notes[i].t <= this.songT + 0.2; i++) {
      const n = this.notes[i];
      if (n.lane === lane && n.hold) {
        n.hold = false;
        this.hw.held[lane] = 0;
      }
    }
  }

  activateStar(): void {
    if (this.mode !== 'play' || this.starOn || this.starMeter < 0.5) return;
    this.starOn = true;
    this.bannerT = this.now;
    this.stage.flash = 1;
    if (this.me) this.me.star = true;
    this.stage.burst(this.w * 0.5, this.stage.floorY, 30, this.q.particleBudget);
    tap('medium');
    this.screens.hudStar(this.starMeter, true);
    this.net?.setStar(true);
  }

  /* ------------------------- julgamento ------------------------- */

  private mult(): number {
    return Math.min(4, 1 + Math.floor(this.combo / 10));
  }

  private hit(n: RNote, j: number): void {
    n.j = j;
    this.counts[j]++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    this.score += J_POINTS[j] * this.mult() * (this.starOn ? 2 : 1);
    this.hw.flash[n.lane] = 1;
    if (n.end > n.t + 0.01) {
      n.hold = true;
      n.sus = n.t;
      this.hw.held[n.lane] = 1;
    }
    if (j === J_PERFECT) this.hero.happyT = this.now;
    this.pop(j, n.lane);
    const me = this.me;
    if (me) {
      me.hitT = this.now;
      me.combo = this.combo;
    }
    if (this.cut) {
      this.cut = false;
      this.player?.setTrackGain(this.inst, 1);
    }
    const ph = this.phrases[n.ph];
    if (ph) {
      if (j !== J_PERFECT) ph.perfect = false;
      if (ph.star && !ph.failed) {
        let done = true;
        for (let i = ph.first; i <= ph.last; i++)
          if (this.notes[i].j === J_NONE) {
            done = false;
            break;
          }
        if (done) {
          this.starMeter = Math.min(1, this.starMeter + (ph.perfect ? 0.34 : 0.25));
          this.screens.hudStar(this.starMeter, this.starOn);
          ph.failed = true; // não conta de novo
        }
      }
    }
    this.net?.report(this.score, this.combo, 1, 0);
  }

  private miss(n: RNote): void {
    n.j = J_MISS;
    this.counts[J_MISS]++;
    this.combo = 0;
    this.pop(J_MISS, n.lane);
    const ph = this.phrases[n.ph];
    if (ph) {
      ph.failed = true;
      for (let i = ph.first; i <= ph.last; i++) this.notes[i].star = false;
    }
    this.hero.missT = this.now;
    if (this.me) {
      this.me.missT = this.now;
      this.me.combo = 0;
    }
    if (!this.cut) {
      this.cut = true;
      this.player?.setTrackGain(this.inst, 0.25);
    }
    this.player?.miss(this.inst);
    this.net?.report(this.score, 0, 0, 1);
  }

  private pop(j: number, lane: number): void {
    const p = this.pops[this.popIdx];
    this.popIdx = (this.popIdx + 1) % this.pops.length;
    p.j = j;
    p.lane = lane;
    p.t = this.now;
  }

  /* ------------------------- laço ------------------------- */

  private loop = (ts: number): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    if (this.q.fpsCap === 30 && ts - this.last < 30) return;
    this.last = ts;
    this.now = ts / 1000;
    const t0 = performance.now();
    if (this.mode === 'play' && !this.paused) this.update(dt);
    this.render(dt);
    this.gov.sample(dt * 1000, performance.now() - t0);
  };

  private update(dt: number): void {
    // relógio: perf antes do início; depois o relógio do áudio (suavizado)
    const nowS = this.now;
    if (!this.audioOn) {
      this.songT = nowS - this.startPerf;
      if (this.songT >= -0.06 && this.player) {
        this.player.start(0);
        this.audioOn = true;
        this.lastRaw = -99;
      } else if (!this.player && this.songT >= 0) this.audioOn = true;
    } else if (this.player) {
      const raw = this.player.time();
      if (raw !== this.lastRaw) {
        this.lastRaw = raw;
        this.rawPerf = nowS;
      }
      const est = this.lastRaw + (nowS - this.rawPerf);
      const pred = this.songT + dt;
      const err = est - pred;
      this.songT = Math.abs(err) > 0.12 ? est : pred + err * 0.15;
    } else this.songT += dt;
    const st = this.songT;
    // autoplay (teste/vitrine)
    if (this.autoplay) {
      for (let i = this.next; i < this.notes.length; i++) {
        const n = this.notes[i];
        if (n.t > st + bs.calib / 1000) break;
        if (n.j === J_NONE) this.pressLane(n.lane);
      }
      for (let i = this.first; i < this.notes.length && this.notes[i].t < st; i++) {
        const n = this.notes[i];
        if (n.hold && st >= n.end) this.release(n.lane);
      }
    }
    // erros por passar da janela
    while (this.next < this.notes.length) {
      const n = this.notes[this.next];
      if (n.j !== J_NONE) {
        this.next++;
        continue;
      }
      if (n.t < st - bs.calib / 1000 - WINDOWS[this.diff].good) {
        this.miss(n);
        this.next++;
      } else break;
    }
    // sustain
    let sliding = false;
    for (let i = this.first; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t > st) break;
      if (!n.hold) continue;
      const until = Math.min(st, n.end);
      const pts = (until - n.sus) / this.spb * 25 * this.mult() * (this.starOn ? 2 : 1);
      this.sustainPts += pts;
      this.score += pts;
      n.sus = until;
      if (st >= n.end) {
        n.hold = false;
        this.hw.held[n.lane] = 0;
      } else if (Math.abs(n.lane - this.hero.to) < 0.01) {
        sliding = true;
      }
    }
    this.hero.slide = sliding;
    while (this.first < this.notes.length && this.notes[this.first].end < st - 0.5 && !this.notes[this.first].hold) this.first++;
    // herói: pula para a próxima nota para pousar no tempo certo
    for (let i = this.next; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.j !== J_NONE) continue;
      const lead = Math.min(0.34, this.spb * 0.85);
      if (n.t - st < lead && n.t > st && !sliding) this.hero.hop(n.lane, Math.max(st, n.t - lead), n.t);
      break;
    }
    this.hero.update(st, dt);
    // Modo Estrela
    if (this.starOn) {
      this.starMeter -= dt / (this.spb * 32);
      if (this.starMeter <= 0) {
        this.starMeter = 0;
        this.starOn = false;
        if (this.me) this.me.star = false;
        this.net?.setStar(false);
      }
      this.screens.hudStar(this.starMeter, this.starOn);
    }
    // bots
    for (const b of this.bots) {
      while (b.ptr < b.notes.length && b.notes[b.ptr].t <= st) {
        b.total++;
        let p = b.skill;
        if (b.streak > 0) p -= 0.35;
        const ok = Math.random() < p;
        const m = b.m;
        if (ok) {
          b.streak = 0;
          b.hits++;
          m.hitT = this.now;
          m.combo++;
          m.score += 70 * Math.min(4, 1 + Math.floor(m.combo / 10));
          if (b.cut) {
            b.cut = false;
            this.player?.setTrackGain(m.inst, 1);
          }
        } else {
          b.streak++;
          m.missT = this.now;
          m.combo = 0;
          if (!b.cut) {
            b.cut = true;
            this.player?.setTrackGain(m.inst, 0.25);
          }
          this.player?.miss(m.inst);
        }
        b.ptr++;
      }
    }
    // remotos
    this.net?.tickPlay(this);
    // HUD
    if (this.me) this.me.score = Math.round(this.score);
    this.screens.hudProgress(st / (this.song?.durationSec || 1));
    // fim
    const lastNote = this.notes.length ? this.notes[this.notes.length - 1].end : 0;
    const endT = Math.max(lastNote + 1.2, (this.song?.durationSec ?? 0) + 0.6);
    if (!this.ended && st > endT) this.finish();
  }

  private finish(): void {
    this.ended = true;
    this.stopPlayer();
    const total = this.notes.length || 1;
    const acc = (this.counts[0] * 1 + this.counts[1] * 0.8 + this.counts[2] * 0.5) / total;
    const stars = acc >= 0.95 ? 5 : acc >= 0.85 ? 4 : acc >= 0.7 ? 3 : acc >= 0.5 ? 2 : acc >= 0.25 ? 1 : 0;
    const ms = this.members.map((m) => ({ name: m.name, inst: m.inst, score: m.me ? Math.round(this.score) : m.score, me: m.me }));
    const sorted = ms.slice().sort((a, b) => b.score - a.score);
    const place = sorted.findIndex((m) => m.me) + 1;
    const r: RunResult = {
      song: this.song!,
      inst: this.inst,
      diff: this.diff,
      score: Math.round(this.score),
      stars,
      acc,
      perfects: this.counts[0],
      greats: this.counts[1],
      goods: this.counts[2],
      misses: this.counts[3],
      maxCombo: this.maxCombo,
      place: place || 1,
      members: ms,
      durationSec: this.song?.durationSec ?? 0,
    };
    this.net?.finished(r.score);
    if (this.onEndCb) this.onEndCb(r);
    else this.screens.results(r);
  }

  /* ------------------------- desenho ------------------------- */

  private render(dt: number): void {
    const x = this.ctx;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const now = this.now;
    if (this.mode === 'menu') {
      x.fillStyle = '#120a2e';
      x.fillRect(0, 0, this.w, this.h);
      const beat = now * (100 / 60);
      // na tela de menu a banda "passa o som": acertos no tempo
      for (let i = 0; i < this.members.length; i++) {
        const m = this.members[i];
        if (Math.floor(beat + i * 0.25) !== Math.floor(beat + i * 0.25 - dt * (100 / 60))) m.hitT = now;
      }
      this.stage.draw(x, now, beat, this.members, false, 0.4, this.q, dt);
      if (this.portrait) {
        const g = this.stage.rh;
        x.fillStyle = '#120a2e';
        x.fillRect(0, g, this.w, this.h - g);
      }
      return;
    }
    const st = this.songT;
    const beat = st / this.spb;
    x.fillStyle = '#0c0620';
    x.fillRect(0, 0, this.w, this.h);
    this.stage.draw(x, now, beat, this.members, this.starOn, Math.min(1, this.combo / 30), this.q, dt);
    if (this.portrait) {
      // chão abaixo do palco
      const g0 = this.stage.rh;
      x.fillStyle = '#140a30';
      x.fillRect(0, g0, this.w, this.h - g0);
    }
    this.hw.draw(x, st, this.spb, this.notes, this.first, this.starOn, now, dt, this.q.glows);
    this.hero.draw(x, this.hw, this.me?.skin ?? this.mySkin(), st, now);
    this.drawHud(x, st, now);
  }

  private drawHud(x: CanvasRenderingContext2D, st: number, now: number): void {
    const hw = this.hw;
    x.textAlign = 'center';
    x.lineJoin = 'round';
    // pop-ups de julgamento
    hw.proj(0);
    const lw = (hw.phw * 2) / hw.L;
    x.font = this.fontJ;
    for (const p of this.pops) {
      const k = (now - p.t) / 0.55;
      if (k < 0 || k > 1) continue;
      const px = hw.laneX(p.lane, hw.phw);
      const py = hw.py - lw * 1.15 - k * lw * 0.5;
      x.globalAlpha = 1 - k * k;
      x.lineWidth = 5;
      x.strokeStyle = '#2a0b5c';
      x.strokeText(this.judgeTxt[p.j], px, py);
      x.fillStyle = p.j === J_PERFECT ? '#ffe14d' : p.j === J_GREAT ? '#7dffb0' : p.j === J_GOOD ? '#8fd8ff' : '#ff7a8a';
      x.fillText(this.judgeTxt[p.j], px, py);
    }
    x.globalAlpha = 1;
    // placar
    const sc = Math.round(this.score);
    if (sc !== this.shownScore) {
      this.shownScore = sc;
      this.scoreStr = fmt(sc);
    }
    if (this.combo !== this.shownCombo) {
      this.shownCombo = this.combo;
      this.comboStr = this.combo >= 5 ? t('band.combo', '{n} seguidas', { n: this.combo }) : '';
      this.multStr = 'x' + this.mult() * (this.starOn ? 2 : 1);
    }
    const sy = this.portrait ? this.stage.rh + 4 : this.h * 0.06;
    const sx = this.portrait ? 14 : this.w * 0.5 - hw.wb * 0.5 - 12;
    x.textAlign = this.portrait ? 'left' : 'right';
    x.font = this.fontScore;
    x.lineWidth = 5;
    x.strokeStyle = '#2a0b5c';
    x.strokeText(this.scoreStr, sx, sy + 26);
    x.fillStyle = '#fff';
    x.fillText(this.scoreStr, sx, sy + 26);
    x.font = this.fontSmall;
    const m = this.mult() * (this.starOn ? 2 : 1);
    if (m > 1 || this.starOn) {
      x.strokeText(this.multStr, sx, sy + 48);
      x.fillStyle = this.starOn ? '#ffd84a' : '#7dffb0';
      x.fillText(this.multStr, sx, sy + 48);
    }
    if (this.comboStr) {
      x.textAlign = 'center';
      x.strokeText(this.comboStr, hw.cx, hw.py + lw * 0.62);
      x.fillStyle = '#ffe9a8';
      x.fillText(this.comboStr, hw.cx, hw.py + lw * 0.62);
    }
    // contagem
    if (st < 0) {
      const k = Math.ceil(-st / this.spb);
      if (k <= 3 && k >= 1) {
        x.font = this.fontBig;
        x.textAlign = 'center';
        const f = 1 - (-st / this.spb - (k - 1));
        x.globalAlpha = Math.min(1, 0.4 + f);
        x.lineWidth = 8;
        x.strokeText(this.countTxt[3 - k], this.w / 2, this.h * 0.55);
        x.fillStyle = '#ffe14d';
        x.fillText(this.countTxt[3 - k], this.w / 2, this.h * 0.55);
        x.globalAlpha = 1;
      }
    }
    // faixa do Modo Estrela
    const bk = (now - this.bannerT) / 1.4;
    if (bk >= 0 && bk < 1) {
      x.font = this.fontJ;
      x.textAlign = 'center';
      x.globalAlpha = bk < 0.8 ? 1 : (1 - bk) * 5;
      x.lineWidth = 6;
      x.strokeStyle = '#2a0b5c';
      const yy = this.h * 0.5 - (1 - Math.min(1, bk * 5)) * 30;
      x.strokeText(this.starTxt, this.w / 2, yy);
      x.fillStyle = '#ffd84a';
      x.fillText(this.starTxt, this.w / 2, yy);
      x.globalAlpha = 1;
    }
  }

  /* ------------------------- saída ------------------------- */

  exit(): void {
    this.destroy();
    this.exitCb();
  }

  pauseHandle(): void {
    this.pause();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.stopPlayer();
    this.net?.leave();
    this.net = null;
    this.screens.destroy();
    for (const f of this.offs) f();
    try {
      this.actx?.close();
    } catch {
      /* */
    }
    this.root.classList.remove('bb-root');
    this.root.innerHTML = '';
  }
}

export { INSTRUMENTS };
