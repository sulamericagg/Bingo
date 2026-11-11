/* ============================================================
 *  CENA DO CÔMODO — olhar, decorar (arrastar/girar/vários/duplicar),
 *  pintar, limpar e FESTA (bolo, guerra de comida, emotes).
 *  Camadas em cache: casca (parede+piso+pintura) + móveis parados + sujeira.
 *  O laço só desenha o que se mexe. Sem alocação por frame.
 * ============================================================ */
import type { HomeDesign, HomeRole, MessItem, PartyEvent, PartyPeer, PartySession, RoomDesign } from './api';
import { FURNITURE, furnById, mulberry, pal, type RoomId } from './catalog';
import { INK, TAU, alpha, circ, ell, fs, heartPath, makeCanvas, rr, star } from './gfx';
import { Painter, specFill, type PaintTool } from './paint';
import { RH, RW, WALL_Y, drawFurn, drawMess, drawRoomShell, itemBox } from './render-room';
import { hsfx } from './sfx';
import { NavGrid, type NavItem } from './nav';
import { can, type DesignEvent } from './service';
import { drawPlayer, type PlayerPose } from '../game/character';
import { SKINS, type Skin } from '../game/skins';
import { drawAvatar, type AvatarData } from '../game/avatar';
import { save } from '../core/storage';
import { drawEmoteBubble } from '../social/emotes';
import { t } from '../i18n';

export type RoomMode = 'look' | 'edit' | 'paint' | 'clean' | 'party';
export type CleanTool = 'sponge' | 'mop' | 'vacuum' | 'bag' | 'hand';
export type Item = RoomDesign['items'][number] & { rot?: number };

export interface RoomHost {
  design: HomeDesign;
  mess: MessItem[];
  myId: string;
  isOwner: boolean;
  role: HomeRole;
  session: PartySession | null;
  hiFx: boolean;
  /** design mudou (salvar/undo) */
  onDesign(room: string, kind: 'items' | 'paint'): void;
  onMess(change: 'add' | 'remove', m: MessItem, byMe: boolean): void;
  onSelect(n: number): void;
  onPaintProgress(p: number, done: boolean): void;
  onCake(slicesLeft: number): void;
  onCleanAll(): void;
  onPetTap(): void;
}

/* ---------------- partículas (pool fixo) ---------------- */
const PMAX = 220;
const px = new Float32Array(PMAX),
  py = new Float32Array(PMAX),
  pvx = new Float32Array(PMAX),
  pvy = new Float32Array(PMAX),
  pl = new Float32Array(PMAX),
  pm = new Float32Array(PMAX),
  ps = new Float32Array(PMAX);
const pk = new Uint8Array(PMAX); // 0 livre, 1 poeira, 2 brilho, 3 farelo, 4 confete, 5 gota
const pc = new Uint8Array(PMAX);
const PCOL = ['#ffffff', '#ff5c7a', '#ffc93d', '#4fd67a', '#46d9e6', '#c46bff', '#ff7ad9', '#c89a6a', '#ff8a3d', '#d5d0e8'];
let budget = 1;
function emit(kind: number, x: number, y: number, n: number, spd: number, life: number, size: number, col = -1): void {
  n = Math.max(1, Math.round(n * budget));
  for (let i = 0, j = 0; i < PMAX && j < n; i++) {
    if (pk[i]) continue;
    const a = Math.random() * TAU,
      s = spd * (0.3 + Math.random() * 0.7);
    pk[i] = kind;
    px[i] = x;
    py[i] = y;
    pvx[i] = Math.cos(a) * s;
    pvy[i] = Math.sin(a) * s - (kind === 1 ? 10 : kind === 3 || kind === 4 ? spd * 0.5 : 0);
    pl[i] = pm[i] = life * (0.6 + Math.random() * 0.4);
    ps[i] = size * (0.6 + Math.random() * 0.6);
    pc[i] = col >= 0 ? col : (Math.random() * PCOL.length) | 0;
    j++;
  }
}

/* ---------------- comida voando (pool) ---------------- */
export const FOODS = ['cake', 'pie', 'tomato', 'juice', 'frosting'] as const;
const FOOD_MESS: Record<string, MessItem['kind']> = { cake: 'cake', pie: 'pie', tomato: 'tomato', juice: 'juice', frosting: 'frosting' };
interface Proj {
  on: boolean;
  food: string;
  gx: number;
  gy: number;
  vx: number;
  vy: number;
  h: number;
  vh: number;
  from: string;
  resolve: boolean;
  spin: number;
}
const PROJ: Proj[] = Array.from({ length: 24 }, () => ({ on: false, food: 'cake', gx: 0, gy: 0, vx: 0, vy: 0, h: 0, vh: 0, from: '', resolve: false, spin: 0 }));
const GRAV = 620;

export function drawFood(c: CanvasRenderingContext2D, food: string, x: number, y: number, s: number, rot = 0): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.lineJoin = 'round';
  switch (food) {
    case 'cake':
      c.beginPath();
      c.moveTo(-s, s * 0.6);
      c.lineTo(s, s * 0.6);
      c.lineTo(0, -s * 0.8);
      c.closePath();
      fs(c, '#ffe0a3', 2);
      c.beginPath();
      c.moveTo(-s * 0.55, -s * 0.05);
      c.lineTo(s * 0.55, -s * 0.05);
      c.lineTo(0, -s * 0.8);
      c.closePath();
      fs(c, '#ff7ad9', 0);
      circ(c, 0, -s * 0.55, s * 0.2);
      fs(c, '#ff5c7a', 1.5);
      break;
    case 'pie':
      ell(c, 0, 0, s, s * 0.6);
      fs(c, '#c89a6a', 2);
      ell(c, 0, -s * 0.1, s * 0.75, s * 0.4);
      fs(c, '#ffe680');
      break;
    case 'tomato':
      circ(c, 0, 0, s * 0.8);
      fs(c, '#ff4f4f', 2);
      star(c, 0, -s * 0.7, s * 0.35, 5, 0.4);
      fs(c, '#4fd67a', 1);
      break;
    case 'juice':
      rr(c, -s * 0.5, -s * 0.8, s, s * 1.5, 3);
      fs(c, '#ff8a3d', 2);
      c.fillStyle = '#ffffff';
      c.fillRect(-s * 0.15, -s * 1.2, s * 0.12, s * 0.5);
      break;
    default:
      ell(c, 0, 0, s * 0.75, s * 0.85);
      fs(c, '#ff9ad9', 2);
      ell(c, -s * 0.25, -s * 0.3, s * 0.2, s * 0.12);
      fs(c, alpha('#ffffff', 0.7));
  }
  c.restore();
}

/* ---------------- personagens ---------------- */
/** quem anda pelo chão (convidado, eu, bichinho): segue um caminho que desvia de móveis/paredes */
interface Walker {
  x: number;
  y: number;
  /** destino final (já dentro do chão livre) */
  tx: number;
  ty: number;
  path: number[];
  pi: number;
  speed: number;
  face: number;
  /** precisa ser posto num lugar livre no próximo quadro */
  place: boolean;
}
type BotState = 'wander' | 'dance' | 'eat' | 'chat';
interface Char extends Walker {
  id: string;
  name: string;
  skin: Skin;
  avatar?: AvatarData;
  room: string;
  /** saindo pela porta (outro cômodo / saiu da festa) — some ao chegar */
  leaving: boolean;
  gone: boolean;
  ai: BotState;
  aiT: number;
  partner: string;
  frost: number; // carinha de glacê (s)
  frostCol: number;
  chew: number;
  emote: string;
  emoteT: number;
  bot: boolean;
  seen: number;
}
const skinOf = (id: string): Skin => SKINS.find((s) => s.id === id && s.id !== 'custom') ?? SKINS[0];
const pose: PlayerPose = { t: 0, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7 };

/* ---------------- modelos de cômodo ---------------- */
type Tpl = [string, number, number][];
export const TEMPLATES: { id: string; name: string; items: Partial<Record<RoomId, Tpl>> & { any: Tpl } }[] = [
  { id: 'cozy', name: 'Aconchegante', items: { any: [['rug1', 180, 380], ['sofa1', 120, 340], ['armchair1', 270, 345], ['fireplace0', 300, 300], ['floorlamp1', 40, 330], ['painting1', 110, 110], ['plant1', 210, 310], ['clock1', 290, 70]] } },
  { id: 'gamer', name: 'Gamer', items: { any: [['rug2', 180, 380], ['tv2', 180, 300], ['arcade0', 50, 320], ['arcade2', 320, 320], ['beanbag0', 130, 380], ['beanbag1', 240, 385], ['poster2', 90, 100], ['poster0', 270, 100], ['speaker2', 260, 310]] } },
  { id: 'party', name: 'Festa', items: { any: [['partytable0', 180, 330], ['balloons0', 40, 330], ['balloons1', 320, 330], ['speaker0', 90, 320], ['speaker0', 270, 320], ['garland0', 180, 40], ['discoball0', 180, 110], ['rug1', 180, 395]] } },
  {
    id: 'nature',
    name: 'Jardim',
    items: { any: [['plant0', 40, 330], ['plant2', 320, 330], ['cactus1', 110, 320], ['cactus0', 250, 320], ['aquarium1', 180, 315], ['window1', 90, 100], ['window1', 270, 100], ['rug0', 180, 390], ['beanbag2', 180, 400]] },
  },
];

/* ============================================================ */
export class RoomScene {
  room: RoomId = 'living';
  mode: RoomMode = 'look';
  // layout
  s = 1;
  ox = 0;
  oy = 0;
  // cache
  private shell: HTMLCanvasElement | null = null;
  private stat: HTMLCanvasElement | null = null;
  private messCv: HTMLCanvasElement | null = null;
  private dirtyShell = true;
  private dirtyStat = true;
  private dirtyMess = true;
  private dpr = 1;
  // edição
  sel: number[] = [];
  multi = false;
  private drag: { kind: 'move' | 'rot' | 'fling' | 'scrub' | 'paint' | 'walk' | 'putback'; sx: number; sy: number; lx: number; ly: number; orig: number[]; moved: boolean; t0: number } | null = null;
  private bounce = new Map<number, number>();
  // pintura
  painter: Painter;
  paintTool: PaintTool = 'roller';
  // limpeza
  cleanTool: CleanTool = 'sponge';
  private hp = new Map<string, number>();
  private moveMess: MessItem | null = null;
  // festa
  chars: Char[] = [];
  me: Char;
  holding: string | null = null;
  cakeSlices = 8;
  /** chão andável (paredes + pegada dos móveis), refeito quando os móveis mudam */
  nav = new NavGrid();
  private navItems: NavItem[] = [];
  pet: Walker = { x: 300, y: 395, tx: 300, ty: 395, path: [], pi: 0, speed: 55, face: 0, place: true };
  private petT = 0;
  private enterRoom = false;
  private peersSeen = false;
  private time = 0;
  private sendT = 0;
  private aimX = 0;
  private aimY = 0;

  constructor(public host: RoomHost) {
    this.painter = new Painter(0, 0, RW, WALL_Y - 8);
    this.me = this.mkChar(host.myId, save.skin === 'custom' ? 'bloop' : save.skin, t('home.you', 'Você'), false, save.skin === 'custom' ? (save.avatar as unknown as AvatarData) : undefined);
    this.me.x = 180;
    this.me.y = 380;
    this.me.speed = 150;
  }
  private mkChar(id: string, skin: string, name: string, bot: boolean, avatar?: AvatarData): Char {
    return {
      id, name, skin: skinOf(skin), avatar, x: 180, y: 360, tx: 180, ty: 360, path: [], pi: 0, speed: bot ? 70 : 170, face: 0, place: true,
      room: '', leaving: false, gone: false, ai: 'wander', aiT: Math.random() * 1.5, partner: '',
      frost: 0, frostCol: 0, chew: 0, emote: '', emoteT: 0, bot, seen: 0,
    };
  }

  get rd(): RoomDesign {
    return this.host.design.rooms.find((r) => r.id === this.room)!;
  }
  get items(): Item[] {
    return this.rd.items as Item[];
  }
  setRoom(r: RoomId): void {
    if (r !== this.room) this.enterRoom = true;
    this.room = r;
    this.sel = [];
    this.loadPaint();
    this.invalidate();
  }
  invalidate(): void {
    this.dirtyShell = this.dirtyStat = this.dirtyMess = true;
  }
  invalidateItems(): void {
    this.dirtyStat = true;
  }
  invalidateMess(): void {
    this.dirtyMess = true;
  }
  setMode(m: RoomMode): void {
    this.mode = m;
    if (m !== 'edit') this.sel = [];
    if (m === 'paint') this.loadPaint();
    this.drag = null;
    this.invalidate();
  }
  layout(W: number, H: number, top: number, bottom: number, dpr: number): void {
    const avail = H - top - bottom;
    this.s = Math.min(W / RW, avail / RH);
    this.ox = (W - RW * this.s) / 2;
    this.oy = top + (avail - RH * this.s) / 2;
    if (dpr !== this.dpr) this.dpr = dpr;
    this.invalidate();
  }
  toL(x: number, y: number): [number, number] {
    return [(x - this.ox) / this.s, (y - this.oy) / this.s];
  }

  /* ---------- pintura salva ---------- */
  private loadPaint(): void {
    const p = this.host.design.paint?.[this.room];
    this.painter.decode(p?.strokes);
  }

  /* ---------- caches ---------- */
  private ensure(): void {
    const k = this.s * this.dpr;
    const w = Math.ceil(RW * k),
      h = Math.ceil(RH * k);
    if (this.dirtyShell || !this.shell) {
      const [cv, c] = this.shell && this.shell.width === w && this.shell.height === h ? [this.shell, this.shell.getContext('2d')!] : makeCanvas(w, h);
      c.setTransform(k, 0, 0, k, 0, 0);
      c.clearRect(0, 0, RW, RH);
      drawRoomShell(c, this.rd);
      const base = specFill(c, this.host.design.paint?.[this.room]?.wall ?? '', WALL_Y - 8);
      if (base) {
        c.fillStyle = base;
        c.fillRect(0, 0, RW, WALL_Y - 8);
      }
      this.shell = cv;
      this.dirtyShell = false;
      this.dirtyStat = true;
    }
    if (this.dirtyStat || !this.stat) {
      const [cv, c] = this.stat && this.stat.width === w && this.stat.height === h ? [this.stat, this.stat.getContext('2d')!] : makeCanvas(w, h);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      c.drawImage(this.shell!, 0, 0);
      c.setTransform(k, 0, 0, k, 0, 0);
      if (this.mode !== 'paint' || this.painter.covered) c.drawImage(this.painter.canvas, this.painter.rx, this.painter.ry, this.painter.rw, this.painter.rh);
      this.drawItemsTo(c, true);
      this.stat = cv;
      this.dirtyStat = false;
    }
    if (this.dirtyMess || !this.messCv) {
      const [cv, c] = this.messCv && this.messCv.width === w && this.messCv.height === h ? [this.messCv, this.messCv.getContext('2d')!] : makeCanvas(w, h);
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, w, h);
      c.setTransform(k, 0, 0, k, 0, 0);
      for (const m of this.host.mess) if (m.room === this.room && !m.moved) drawMess(c, m, this.hp.get(m.id) ?? 1);
      this.messCv = cv;
      this.dirtyMess = false;
    }
  }
  private isLive(i: number): boolean {
    return this.sel.includes(i) || this.bounce.has(i) || this.movedIdx(i) !== null;
  }
  private movedIdx(i: number): MessItem | null {
    for (const m of this.host.mess) if (m.room === this.room && m.moved && m.moved.itemId === String(i)) return m;
    return null;
  }
  private order: number[] = [];
  private drawItemsTo(c: CanvasRenderingContext2D, staticOnly: boolean): void {
    const it = this.items;
    const o = this.order;
    o.length = 0;
    for (let i = 0; i < it.length; i++) if (staticOnly ? !this.isLive(i) : this.isLive(i)) o.push(i);
    o.sort((a, b) => {
      const da = furnById(it[a].id),
        db = furnById(it[b].id);
      const ka = da?.flat ? -2 : da?.wall ? -1 : 0,
        kb = db?.flat ? -2 : db?.wall ? -1 : 0;
      return ka - kb || (it[a].layer ?? 0) - (it[b].layer ?? 0) || it[a].y - it[b].y;
    });
    for (const i of o) {
      const d = furnById(it[i].id);
      if (!d) continue;
      const mv = this.movedIdx(i);
      c.save();
      c.translate(mv ? mv.x : it[i].x, mv ? mv.y : it[i].y);
      const b = this.bounce.get(i);
      if (b !== undefined && b < 0) {
        c.restore();
        continue;
      }
      if (b !== undefined) {
        const q = 1 + Math.sin(b * 14) * Math.exp(-b * 6) * 0.18;
        c.scale(2 - q, q);
      }
      const rot = (it[i].rot ?? 0) + (mv ? (mv.rot ?? 0) : 0);
      if (rot) c.rotate(rot);
      drawFurn(c, d, it[i].color, it[i].flip);
      c.restore();
    }
  }

  /* ---------- desenho ---------- */
  draw(c: CanvasRenderingContext2D, dt: number, t: number): void {
    this.time = t;
    this.ensure();
    const k = this.s;
    c.drawImage(this.stat!, this.ox, this.oy, RW * k, RH * k);
    c.save();
    c.translate(this.ox, this.oy);
    c.scale(k, k);
    if (this.mode === 'paint') this.drawPaintUi(c);
    this.drawItemsTo(c, false);
    if (this.mode === 'edit') this.drawSelection(c);
    if (this.dirtyMess) this.ensure();
    c.restore();
    c.drawImage(this.messCv!, this.ox, this.oy, RW * k, RH * k);
    c.save();
    c.translate(this.ox, this.oy);
    c.scale(k, k);
    if (this.mode === 'clean') this.drawCleanHints(c, t);
    this.drawCake(c);
    this.stepChars(dt);
    this.drawWalkers(c, t);
    this.stepProj(c, dt);
    this.stepParticles(c, dt);
    if (this.drag?.kind === 'fling' && this.holding) this.drawAim(c);
    // bounces
    for (const [i, b] of this.bounce) {
      if (b > 0.8) {
        this.bounce.delete(i);
        this.dirtyStat = true;
      } else this.bounce.set(i, b + dt);
    }
    c.restore();
    if (this.host.session) {
      this.sendT += dt;
      if (this.sendT > 0.125) {
        this.sendT = 0;
        this.host.session.send({ x: Math.round(this.me.x), y: Math.round(this.me.y), room: this.room, holding: this.holding ?? undefined });
      }
    }
  }

  private drawSelection(c: CanvasRenderingContext2D): void {
    for (const i of this.sel) {
      const it = this.items[i];
      if (!it) continue;
      const [x, y, w, h] = itemBox(it);
      c.save();
      c.setLineDash([6, 5]);
      c.lineDashOffset = -this.time * 20;
      c.strokeStyle = '#ffffff';
      c.lineWidth = 3;
      rr(c, x - 6, y - 6, w + 12, h + 12, 8);
      c.stroke();
      c.strokeStyle = '#8a5cff';
      c.lineWidth = 1.5;
      c.stroke();
      c.restore();
      if (this.sel.length === 1) {
        // alça de giro
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(x + w / 2, y - 6);
        c.lineTo(x + w / 2, y - 22);
        c.stroke();
        circ(c, x + w / 2, y - 30, 10);
        fs(c, '#fff27a', 2);
        c.beginPath();
        c.arc(x + w / 2, y - 30, 5, -2.5, 1.5);
        c.lineWidth = 2;
        c.stroke();
      }
    }
  }

  private drawPaintUi(c: CanvasRenderingContext2D): void {
    const p = this.painter;
    if (p.tape) {
      c.fillStyle = alpha('#5ea8ff', 0.85);
      c.fillRect(0, 0, RW, 5);
      c.fillRect(0, WALL_Y - 13, RW, 5);
      c.fillRect(0, 0, 5, WALL_Y - 8);
      c.fillRect(RW - 5, 0, 5, WALL_Y - 8);
    }
    if (this.drag?.kind === 'paint') {
      const x = this.aimX,
        y = this.aimY;
      c.save();
      c.globalAlpha = 0.9;
      if (this.paintTool === 'roller') {
        rr(c, x - 22, y - 15, 44, 30, 8);
        fs(c, pal(p.colorIdx), 2.5);
        c.strokeStyle = INK;
        c.lineWidth = 3;
        c.beginPath();
        c.moveTo(x + 22, y);
        c.lineTo(x + 30, y);
        c.lineTo(x + 30, y + 30);
        c.lineTo(x + 6, y + 40);
        c.lineTo(x + 6, y + 60);
        c.stroke();
      } else if (this.paintTool === 'brush') {
        circ(c, x, y, 12);
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.stroke();
      } else {
        circ(c, x, y, 22);
        c.strokeStyle = alpha(INK, 0.5);
        c.setLineDash([4, 4]);
        c.stroke();
        c.setLineDash([]);
      }
      c.restore();
    }
  }

  private drawCleanHints(c: CanvasRenderingContext2D, t: number): void {
    for (const m of this.host.mess) {
      if (m.room !== this.room) continue;
      if (m.moved) {
        // fantasma onde o móvel deveria estar
        const it = this.items[Number(m.moved.itemId)];
        const d = it && furnById(it.id);
        if (!d) continue;
        c.save();
        c.globalAlpha = 0.25 + Math.sin(t * 4) * 0.1;
        c.translate(m.moved.ox, m.moved.oy);
        drawFurn(c, d, '#ffffff');
        c.restore();
      } else {
        const a = 0.35 + Math.sin(t * 5 + m.x) * 0.25;
        star(c, m.x + m.r * 0.9, m.y - m.r * 0.6, 4, 4, 0.4);
        c.fillStyle = alpha('#ffffff', a);
        c.fill();
      }
    }
  }

  /* ---------- bolo ---------- */
  /** índice da mesa do bolo (-1 = sem mesa) */
  private cakeTable(): number {
    if (this.mode !== 'party') return -1;
    const it = this.items;
    let best = -1;
    for (let i = 0; i < it.length; i++) {
      const k = furnById(it[i].id)?.kind;
      if (k === 'partytable') return i;
      if (k === 'table' && best < 0) best = i;
    }
    return best;
  }
  private cakePos(): [number, number] | null {
    if (this.mode !== 'party') return null;
    const t = this.cakeTable();
    if (t < 0) return [180, 300];
    const it = this.items[t];
    const d = furnById(it.id)!;
    return [it.x, it.y - d.h];
  }
  private drawCake(c: CanvasRenderingContext2D): void {
    const p = this.cakePos();
    if (!p) return;
    const [x, y] = p;
    ell(c, x, y - 2, 34, 7);
    fs(c, '#ffffff', 2);
    if (this.cakeSlices <= 0) return;
    // bolo com fatias que somem
    const frac = this.cakeSlices / 8;
    c.save();
    c.beginPath();
    c.moveTo(x, y - 20);
    c.arc(x, y - 20, 50, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    c.closePath();
    c.clip();
    rr(c, x - 28, y - 40, 56, 36, 10);
    fs(c, '#ffe0a3', 2.5);
    rr(c, x - 28, y - 44, 56, 16, 8);
    fs(c, '#ff7ad9', 2);
    for (let i = 0; i < 5; i++) {
      circ(c, x - 22 + i * 11, y - 28 + (i % 2) * 3, 3.5);
      fs(c, '#ff7ad9');
    }
    c.restore();
    for (let i = 0; i < 3; i++) {
      if (i / 3 > frac) continue;
      rr(c, x - 12 + i * 10, y - 58, 4, 14, 2);
      fs(c, ['#5ef0ff', '#ffc93d', '#ff5c7a'][i], 1.2);
      const f = Math.sin(this.time * 12 + i) * 1.5;
      ell(c, x - 10 + i * 10, y - 62, 2.5, 4 + f * 0.3);
      fs(c, '#ffc93d');
    }
  }

  /* ---------- bichinho mora aqui ---------- */
  petVisible(): boolean {
    if (this.room !== 'living' && this.room !== 'bedroom' && this.mode !== 'party') return false;
    return this.host.isOwner && this.mode !== 'paint' && this.mode !== 'edit';
  }
  private thinkPet(dt: number): void {
    const p = this.pet;
    this.petT -= dt;
    if (this.petT > 0 || p.pi < p.path.length) return;
    this.petT = 2.5 + Math.random() * 3.5;
    if (this.mode === 'party' && Math.random() < 0.6) {
      // na festa: fica perto de você (ou dançando perto da caixa de som)
      const sp = this.spotOf('speaker');
      const [x, y] = sp && Math.random() < 0.4 ? this.nav.randomSpot(Math.random, sp.x, sp.y + 30, 45) : this.nav.randomSpot(Math.random, this.me.x + (Math.random() < 0.5 ? -34 : 34), this.me.y + 6, 24);
      this.goTo(p, x, y);
    } else {
      const [x, y] = this.nav.randomSpot(Math.random, p.x, p.y, 80);
      this.goTo(p, x, y);
    }
  }
  private drawPetAt(c: CanvasRenderingContext2D, t: number): void {
    const p = this.pet;
    const moving = p.pi < p.path.length;
    const y = p.y - (moving || this.mode === 'party' ? Math.abs(Math.sin(t * (this.mode === 'party' ? 6 : 8))) * 6 : 0);
    ell(c, p.x, p.y + 2, 14, 4);
    c.fillStyle = alpha(INK, 0.2);
    c.fill();
    c.save();
    c.translate(p.x, y - 13);
    pose.t = t;
    pose.mood = 'happy';
    pose.sx = pose.sy = 1;
    pose.lookX = moving ? p.face : Math.sin(t * 0.7);
    pose.lookY = 0;
    pose.blink = (t % 3.3) < 0.12 ? 1 : 0;
    drawPlayer(c, skinOf(save.skin === 'custom' ? 'bloop' : save.skin), 13, pose);
    c.restore();
    if ((t * 0.5) % 4 < 1.2) {
      heartPath(c, p.x + 12, y - 36 - ((t * 0.5) % 4) * 6, 5);
      fs(c, '#ff5c7a', 1.5);
    }
  }

  /* ---------- andar pelo chão (sem atravessar parede nem móvel) ---------- */
  /** grade do chão a partir dos móveis ATUAIS (inclusive os derrubados na guerra de comida) */
  private syncNav(): void {
    const it = this.items;
    const arr = this.navItems;
    while (arr.length < it.length) arr.push({ id: '', x: 0, y: 0 });
    arr.length = it.length;
    for (let i = 0; i < it.length; i++) {
      const mv = this.movedIdx(i);
      arr[i].id = it[i].id;
      arr[i].x = mv ? mv.x : it[i].x;
      arr[i].y = mv ? mv.y : it[i].y;
    }
    if (!this.nav.update(arr)) return;
    // móveis mudaram: quem ficou "dentro" de um móvel sai para o lugar livre mais perto; caminhos refeitos
    const fix = (w: Walker) => {
      if (!this.nav.free(w.x, w.y)) w.place = true;
      else if (w.pi < w.path.length) this.goTo(w, w.tx, w.ty);
    };
    fix(this.me);
    fix(this.pet);
    for (const ch of this.chars) fix(ch);
  }
  /** caminha até (x,y) — o destino é ajustado para o chão livre mais perto */
  goTo(w: Walker, x: number, y: number): void {
    const [gx, gy] = this.nav.nearestFree(x, y);
    w.tx = gx;
    w.ty = gy;
    w.pi = 0;
    if (!this.nav.path(w.x, w.y, gx, gy, w.path)) {
      w.path.length = 0;
      w.tx = w.x;
      w.ty = w.y;
    }
  }
  private placeWalker(w: Walker, x = w.x, y = w.y): void {
    const [fx, fy] = this.nav.nearestFree(x, y);
    w.x = w.tx = fx;
    w.y = w.ty = fy;
    w.path.length = 0;
    w.pi = 0;
    w.place = false;
  }
  private stepWalker(w: Walker, dt: number): void {
    if (w.place) this.placeWalker(w);
    let step = w.speed * dt;
    while (step > 0 && w.pi < w.path.length) {
      const nx = w.path[w.pi],
        ny = w.path[w.pi + 1];
      const dx = nx - w.x,
        dy = ny - w.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.5) w.face = Math.sign(dx);
      let px: number, py: number;
      if (d <= step) {
        px = nx;
        py = ny;
        step -= d;
        w.pi += 2;
      } else {
        px = w.x + (dx / d) * step;
        py = w.y + (dy / d) * step;
        step = 0;
      }
      if (!this.nav.free(px, py)) {
        // algo apareceu no caminho: recalcula na próxima
        this.goTo(w, w.tx, w.ty);
        return;
      }
      w.x = px;
      w.y = py;
    }
  }
  /** afasta dois convidados encostados (só se o novo lugar continuar livre) */
  private separate(a: Walker, b: Walker): void {
    const dx = b.x - a.x,
      dy = (b.y - a.y) * 1.6;
    const d = Math.hypot(dx, dy);
    if (d >= 30 || d < 0.01) return;
    const push = (30 - d) * 0.2;
    const ux = dx / d,
      uy = dy / d / 1.6;
    if (this.nav.free(b.x + ux * push, b.y + uy * push)) (b.x += ux * push), (b.y += uy * push);
    if (this.nav.free(a.x - ux * push, a.y - uy * push)) (a.x -= ux * push), (a.y -= uy * push);
  }
  private spotOf(kind: string): { x: number; y: number; w: number } | null {
    let found: { x: number; y: number; w: number } | null = null;
    let n = 0;
    for (const b of this.nav.base) if (b.kind === kind && Math.random() * ++n < 1) found = b;
    return found;
  }

  /** lugar livre E sem ninguém em cima (destino de outro convidado a < 30 u): tenta em volta */
  private roomy(x: number, y: number, self: Walker): [number, number] {
    let [px, py] = this.nav.nearestFree(x, y);
    for (let k = 0; k < 10; k++) {
      if (!this.crowded(px, py, self)) break;
      [px, py] = this.nav.randomSpot(Math.random, x, y, 30 + k * 8);
    }
    return [px, py];
  }
  private bumped(self: Walker): boolean {
    const near = (w: Walker) => w !== self && Math.hypot(w.x - self.x, (w.y - self.y) * 1.6) < 30;
    if (near(this.me) || (this.petVisible() && near(this.pet))) return true;
    for (const ch of this.chars) if (near(ch)) return true;
    return false;
  }
  private crowded(x: number, y: number, self: Walker): boolean {
    const near = (w: Walker) => w !== self && Math.hypot(w.tx - x, (w.ty - y) * 1.6) < 38;
    if (near(this.me) || (this.petVisible() && near(this.pet))) return true;
    for (const ch of this.chars) if (near(ch)) return true;
    return false;
  }

  /* ---------- convidados robôs: dançar, comer na mesa, conversar em dupla ---------- */
  private thinkBot(ch: Char, dt: number): void {
    ch.aiT -= dt;
    const arrived = ch.pi >= ch.path.length;
    if (arrived && ch.ai === 'dance' && Math.random() < dt * 0.4) ch.emote ||= ((ch.emoteT = 0), 'uau');
    if (arrived && ch.ai === 'eat' && ch.chew <= 0 && Math.random() < dt * 0.5) ch.chew = 1.2;
    if (arrived && ch.ai === 'chat') {
      const o = this.chars.find((q) => q.id === ch.partner);
      if (o) ch.face = Math.sign(o.x - ch.x) || ch.face;
      if (!ch.emote && Math.random() < dt * 0.35) {
        ch.emote = ['oi', 'rindo', 'coracao', 'joinha'][(Math.random() * 4) | 0];
        ch.emoteT = 0;
      }
    }
    if (arrived && ch.ai !== 'chat' && this.bumped(ch)) {
      // chegou e tem alguém em cima: dá um passinho para o lado
      this.goTo(ch, ...this.roomy(ch.x + (Math.random() - 0.5) * 60, ch.y + (Math.random() - 0.5) * 30, ch));
    }
    if (ch.aiT > 0) return;
    // escolhe o próximo "programa"
    if (ch.ai === 'chat') {
      const o = this.chars.find((q) => q.id === ch.partner);
      if (o && o.partner === ch.id) o.partner = '';
    }
    ch.partner = '';
    ch.aiT = 4 + Math.random() * 4;
    const r = Math.random();
    const speaker = this.spotOf('speaker');
    const table = this.spotOf('partytable') ?? this.spotOf('table') ?? this.spotOf('counter');
    if (r < 0.28 && speaker) {
      ch.ai = 'dance';
      const [x, y] = this.nav.randomSpot(Math.random, speaker.x, speaker.y + 34, 50);
      this.goTo(ch, ...this.roomy(x, y, ch));
    } else if (r < 0.5 && table) {
      ch.ai = 'eat';
      // de frente para a mesa (logo abaixo da borda da frente)
      this.goTo(ch, ...this.roomy(table.x + (Math.random() - 0.5) * table.w * 0.8, table.y + 16, ch));
    } else if (r < 0.75) {
      const o = this.chars.find((q) => q !== ch && q.bot && !q.leaving && !q.partner && q.room === ch.room);
      const [ax, ay] = o ? this.roomy(...this.nav.randomSpot(Math.random), ch) : [0, 0];
      let side = ax > 180 ? -1 : 1;
      let [bx, by] = this.nav.nearestFree(ax + side * 38, ay);
      if (Math.abs(bx - ax) < 28) {
        side = -side;
        [bx, by] = this.nav.nearestFree(ax + side * 38, ay);
      }
      if (o && Math.abs(bx - ax) >= 28 && Math.abs(by - ay) < 14) {
        ch.ai = o.ai = 'chat';
        ch.partner = o.id;
        o.partner = ch.id;
        o.aiT = ch.aiT;
        this.goTo(ch, ax, ay);
        this.goTo(o, bx, by);
      } else {
        ch.ai = 'wander';
        this.goTo(ch, ...this.roomy(...this.nav.randomSpot(Math.random), ch));
      }
    } else {
      ch.ai = 'wander';
      this.goTo(ch, ...this.roomy(...this.nav.randomSpot(Math.random), ch));
    }
  }

  /* ---------- personagens ---------- */
  setPeers(peers: PartyPeer[]): void {
    const now = this.time;
    const first = !this.peersSeen;
    this.peersSeen = true;
    for (const p of peers) {
      if (p.id === this.host.myId) continue;
      // robôs acompanham você; gente de verdade só aparece no cômodo em que está
      const here = !!p.bot || !p.room || p.room === this.room;
      let ch = this.chars.find((c) => c.id === p.id);
      if (!ch) {
        if (!here) continue;
        ch = this.mkChar(p.id, p.skin, p.name, !!p.bot, p.skin === 'custom' ? (p.avatar as AvatarData) : undefined);
        if (first || p.bot) {
          ch.x = p.x;
          ch.y = p.y;
        } else {
          // chegou depois: entra pela porta
          const [dx, dy] = this.nav.door(p.x < 180 ? -1 : 1);
          ch.x = dx;
          ch.y = dy;
        }
        ch.place = true;
        this.chars.push(ch);
      }
      ch.room = p.room ?? '';
      ch.seen = now;
      if (!here) {
        if (!ch.leaving) this.leave(ch, p.x);
      } else if (!ch.bot) {
        ch.leaving = false;
        // humano: o (x,y) dele é o destino; aqui o caminho desvia dos móveis
        if (Math.abs(p.x - ch.tx) + Math.abs(p.y - ch.ty) > 6) {
          if (ch.place) this.placeWalker(ch);
          this.goTo(ch, p.x, p.y);
        }
      }
      if (p.emote && p.emote !== ch.emote) {
        ch.emote = p.emote;
        ch.emoteT = 0;
      }
    }
    // saiu da festa: vai até a porta e some (robôs somem na hora)
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const ch = this.chars[i];
      if (peers.some((p) => p.id === ch.id)) continue;
      if (ch.bot) this.chars.splice(i, 1);
      else if (!ch.leaving) this.leave(ch, ch.x);
    }
  }
  private leave(ch: Char, hintX: number): void {
    ch.leaving = true;
    const [dx, dy] = this.nav.door(hintX < 180 ? -1 : 1);
    this.goTo(ch, dx, dy);
  }
  emoteOf(id: string, code: string): void {
    const ch = id === this.host.myId ? this.me : this.chars.find((c) => c.id === id);
    if (ch) {
      ch.emote = code;
      ch.emoteT = 0;
    }
  }
  private stepChars(dt: number): void {
    const party = this.mode === 'party' || !!this.host.session;
    const pet = this.petVisible();
    if (!party && !pet) return;
    this.syncNav();
    if (this.enterRoom) {
      // trocou de cômodo: você entra pela porta da esquerda e os robôs vêm atrás
      this.enterRoom = false;
      const [dx, dy] = this.nav.door(-1);
      this.placeWalker(this.me, dx, dy);
      this.goTo(this.me, dx + 50, dy);
      this.chars.forEach((ch, i) => {
        if (!ch.bot) return;
        this.placeWalker(ch, dx, dy + ((i % 3) - 1) * 18);
        ch.aiT = 0.3 + i * 0.4;
      });
      this.pet.place = true;
    }
    if (pet) {
      this.thinkPet(dt);
      this.stepWalker(this.pet, dt);
    }
    if (!party) return;
    this.tickChar(this.me, dt);
    for (let i = this.chars.length - 1; i >= 0; i--) {
      const ch = this.chars[i];
      if (ch.bot && !ch.leaving) this.thinkBot(ch, dt);
      this.tickChar(ch, dt);
      if (ch.leaving && ch.pi >= ch.path.length) this.chars.splice(i, 1);
    }
    const all = this.chars;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) if (all[i].partner !== all[j].id) this.separate(all[i], all[j]);
      this.separate(this.me, all[i]);
    }
  }
  private tickChar(ch: Char, dt: number): void {
    this.stepWalker(ch, dt);
    if (ch.frost > 0) ch.frost -= dt;
    if (ch.chew > 0) ch.chew -= dt;
    if (ch.emote) {
      ch.emoteT += dt;
      if (ch.emoteT > 3) ch.emote = '';
    }
  }
  /* ---------- desenho em ordem de profundidade (y): convidados, bichinho e os móveis que ficam NA FRENTE deles ---------- */
  private dq: { y: number; k: 0 | 1 | 2; i: number; ch: Char | null }[] = Array.from({ length: 48 }, () => ({ y: 0, k: 0 as 0 | 1 | 2, i: 0, ch: null }));
  private dqn = 0;
  private dqSort = (a: { y: number }, b: { y: number }): number => a.y - b.y;
  private pushDq(y: number, k: 0 | 1 | 2, i: number, ch: Char | null): void {
    if (this.dqn >= this.dq.length) return;
    const e = this.dq[this.dqn++];
    e.y = y;
    e.k = k;
    e.i = i;
    e.ch = ch;
  }
  private overlapsWalker(x0: number, y0: number, x1: number, y1: number, baseY: number, w: Walker, r: number): boolean {
    return w.y < baseY && w.x + r > x0 && w.x - r < x1 && w.y + 4 > y0 && w.y - r * 2.6 < y1;
  }
  private drawWalkers(c: CanvasRenderingContext2D, t: number): void {
    const party = this.mode === 'party' || !!this.host.session;
    const pet = this.petVisible();
    if (!party && !pet) return;
    this.dqn = 0;
    if (party) {
      this.pushDq(this.me.y, 0, 0, this.me);
      for (const ch of this.chars) this.pushDq(ch.y, 0, 0, ch);
    }
    if (pet) this.pushDq(this.pet.y, 1, 0, null);
    // móveis de chão que tampam alguém (quem está atrás deles): redesenha por cima, na ordem certa
    const it = this.items;
    const nw = this.dqn;
    for (let i = 0; i < it.length; i++) {
      const d = furnById(it[i].id);
      if (!d || d.wall || d.flat || this.bounce.has(i)) continue;
      const mv = this.movedIdx(i);
      const ix = mv ? mv.x : it[i].x,
        iy = mv ? mv.y : it[i].y;
      const x0 = ix - d.w / 2,
        x1 = ix + d.w / 2,
        y0 = iy - d.h - 70; // cake/balões em cima
      let hit = false;
      for (let k = 0; k < nw && !hit; k++) {
        const e = this.dq[k];
        hit = e.k === 1 ? this.overlapsWalker(x0, y0, x1, iy, iy, this.pet, 14) : this.overlapsWalker(x0, y0, x1, iy, iy, e.ch!, 24);
      }
      if (hit) this.pushDq(iy + 0.01, 2, i, null);
    }
    const q = this.dq;
    // ordena só a parte usada (insertion sort: poucos itens, sem alocar)
    for (let a = 1; a < this.dqn; a++) {
      const e = q[a];
      let b = a - 1;
      while (b >= 0 && this.dqSort(q[b], e) > 0) {
        q[b + 1] = q[b];
        b--;
      }
      q[b + 1] = e;
    }
    const cakeIdx = this.cakeTable();
    for (let n = 0; n < this.dqn; n++) {
      const e = q[n];
      if (e.k === 0) this.drawChar(c, e.ch!, t, e.ch === this.me);
      else if (e.k === 1) this.drawPetAt(c, t);
      else {
        const i = e.i;
        const d = furnById(it[i].id)!;
        const mv = this.movedIdx(i);
        c.save();
        c.translate(mv ? mv.x : it[i].x, mv ? mv.y : it[i].y);
        const rot = (it[i].rot ?? 0) + (mv ? (mv.rot ?? 0) : 0);
        if (rot) c.rotate(rot);
        drawFurn(c, d, it[i].color, it[i].flip);
        c.restore();
        if (i === cakeIdx) this.drawCake(c);
      }
    }
    for (let n = 0; n < this.dqn; n++) if (q[n].k === 0) this.drawCharTags(c, q[n].ch!, q[n].ch === this.me);
  }
  private drawChar(c: CanvasRenderingContext2D, ch: Char, t: number, mine: boolean): void {
    const R = 20;
    ell(c, ch.x, ch.y, R * 0.9, R * 0.3);
    c.fillStyle = alpha(INK, 0.22);
    c.fill();
    const walking = ch.pi < ch.path.length;
    const dancing = !walking && ch.bot && ch.ai === 'dance';
    c.save();
    c.translate(ch.x, ch.y - R * 1.05 - (walking ? Math.abs(Math.sin(t * 12)) * 4 : dancing ? Math.abs(Math.sin(t * 8 + ch.x)) * 7 : 0));
    if (dancing) c.rotate(Math.sin(t * 8 + ch.x) * 0.12);
    pose.t = t + ch.x * 0.01;
    pose.mood = ch.frost > 0 ? 'idle' : 'happy';
    pose.blink = ch.frost > 0 ? 1 : (t + ch.y) % 3.1 < 0.12 ? 1 : 0;
    pose.lookX = ch.face * 0.8;
    pose.lookY = 0;
    const chew = ch.chew > 0 ? Math.sin(t * 30) * 0.08 : 0;
    pose.sx = 1 + chew;
    pose.sy = 1 - chew;
    if (ch.avatar) drawAvatar(c, ch.avatar, R, pose);
    else drawPlayer(c, ch.skin, R, pose);
    if (ch.frost > 0) {
      const r = mulberry(ch.frostCol + 3);
      c.globalAlpha = Math.min(1, ch.frost);
      c.fillStyle = ['#ff9ad9', '#ffffff', '#ff4f4f', '#ffe680', '#ff8a3d'][ch.frostCol % 5];
      for (let i = 0; i < 6; i++) {
        circ(c, (r() - 0.5) * R * 1.2, (r() - 0.6) * R * 0.9, R * (0.18 + r() * 0.22));
        c.fill();
      }
      c.globalAlpha = 1;
    }
    if (ch.chew > 0 && Math.random() < 0.3) emit(3, ch.x, ch.y - R, 1, 60, 0.5, 3, 7);
    c.restore();
    // mão segurando comida
    if (mine && this.holding) drawFood(c, this.holding, ch.x + R, ch.y - R * 1.2, 9, Math.sin(t * 3) * 0.2);
  }
  /** nome e balão por último (móvel na frente não corta o nome) */
  private drawCharTags(c: CanvasRenderingContext2D, ch: Char, mine: boolean): void {
    const R = 20;
    c.font = '700 11px Fredoka, system-ui, sans-serif';
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = '#ffffff';
    const label = mine ? '' : ch.name;
    if (label) {
      c.strokeText(label, ch.x, ch.y + 14);
      c.fillStyle = INK;
      c.fillText(label, ch.x, ch.y + 14);
    }
    if (ch.emote) drawEmoteBubble(c, ch.emote, ch.x, ch.y - R * 2.6, 0.55, ch.emoteT);
  }

  /* ---------- comida voando ---------- */
  throwFood(from: string, food: string, x: number, y: number, vx: number, vy: number, resolve: boolean, vh?: number): void {
    const p = PROJ.find((q) => !q.on);
    if (!p) return;
    p.on = true;
    p.food = food;
    p.gx = x;
    p.gy = y + 30;
    p.h = 30;
    p.vx = vx;
    p.vy = vy;
    p.vh = vh ?? 260;
    p.from = from;
    p.resolve = resolve;
    p.spin = (Math.random() - 0.5) * 12;
    hsfx.whoosh();
  }
  private stepProj(c: CanvasRenderingContext2D, dt: number): void {
    for (const p of PROJ) {
      if (!p.on) continue;
      p.gx += p.vx * dt;
      p.gy += p.vy * dt;
      p.h += p.vh * dt;
      p.vh -= GRAV * dt;
      const sx = p.gx,
        sy = p.gy - p.h;
      // sombra
      if (p.gy > WALL_Y) {
        ell(c, p.gx, p.gy, 7, 2.5);
        c.fillStyle = alpha(INK, 0.18);
        c.fill();
      }
      drawFood(c, p.food, sx, sy, 10, this.time * p.spin);
      if (this.host.hiFx) emit(2, sx, sy, 0.3, 10, 0.3, 2, 0);
      // colisões
      let hit: 'floor' | 'wall' | 'char' | 'furn' | null = null;
      let hx = sx,
        hy = sy;
      if (p.gy < WALL_Y + 6 || p.gx < 4 || p.gx > RW - 4) {
        hit = 'wall';
        hx = Math.max(14, Math.min(RW - 14, sx));
        hy = Math.max(16, Math.min(WALL_Y - 20, sy));
      } else if (p.h <= 0) {
        hit = 'floor';
        hy = p.gy;
      } else {
        for (const ch of this.chars) if (ch.id !== p.from && this.hitChar(ch, p)) hit = 'char';
        if (!hit && this.me.id !== p.from && this.hitChar(this.me, p)) hit = 'char';
        if (!hit) {
          const it = this.items;
          for (let i = 0; i < it.length; i++) {
            const d = furnById(it[i].id);
            if (!d || d.wall || d.flat) continue;
            if (Math.abs(p.gx - it[i].x) < d.w / 2 && Math.abs(p.gy - it[i].y) < 16 && p.h < d.h) {
              hit = 'furn';
              if (p.resolve && d.w < 70 && Math.random() < 0.5 && !this.movedIdx(i)) this.knock(i, p.vx);
              break;
            }
          }
        }
      }
      if (!hit) continue;
      p.on = false;
      hsfx.splat();
      emit(5, hx, hy, 10, 120, 0.5, 4, p.food === 'tomato' ? 1 : p.food === 'juice' ? 8 : 6);
      if (hit === 'char') continue;
      if (p.resolve) {
        const m: MessItem = { id: 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), kind: FOOD_MESS[p.food] ?? 'frosting', room: this.room, x: Math.round(hx), y: Math.round(hy), r: 12 + Math.round(Math.random() * 10), rot: Math.round(Math.random() * 60) / 10 };
        this.host.mess.push(m);
        this.dirtyMess = true;
        this.host.onMess('add', m, true);
        if (Math.random() < 0.35) {
          const crumbs: MessItem = { ...m, id: m.id + 'c', kind: Math.random() < 0.5 ? 'crumbs' : 'confetti', y: Math.max(WALL_Y + 20, m.y + 20), r: 18 };
          this.host.mess.push(crumbs);
          this.host.onMess('add', crumbs, true);
        }
      }
    }
  }
  private hitChar(ch: Char, p: Proj): boolean {
    if (Math.abs(p.gx - ch.x) < 18 && Math.abs(p.gy - ch.y) < 14 && p.h < 50) {
      ch.frost = 4;
      ch.frostCol = FOODS.indexOf(p.food as (typeof FOODS)[number]) + 1;
      return true;
    }
    return false;
  }
  private knock(i: number, vx: number): void {
    const it = this.items[i];
    const nx = Math.max(30, Math.min(RW - 30, it.x + Math.sign(vx || 1) * (30 + Math.random() * 30)));
    const m: MessItem = { id: 'k' + Date.now().toString(36) + i, kind: 'mud', room: this.room, x: Math.round(nx), y: Math.round(it.y + 6), r: 1, rot: (Math.random() < 0.5 ? -1 : 1) * 0.35, moved: { itemId: String(i), ox: it.x, oy: it.y } };
    this.host.mess.push(m);
    this.host.onMess('add', m, true);
    this.dirtyStat = true;
    emit(1, nx, it.y, 8, 60, 0.6, 7, 9);
  }
  private drawAim(c: CanvasRenderingContext2D): void {
    const d = this.drag!;
    const [vx, vy, vh] = this.flingVel(d.sx - d.lx, d.sy - d.ly);
    let gx = this.me.x,
      gy = this.me.y,
      h = 30,
      v = vh;
    c.fillStyle = alpha('#ffffff', 0.85);
    for (let i = 0; i < 14; i++) {
      const dt = 0.06;
      gx += vx * dt;
      gy += vy * dt;
      h += v * dt;
      v -= GRAV * dt;
      if (h < 0) break;
      circ(c, gx, gy - h, 3 - i * 0.12);
      c.fill();
    }
  }
  /** arrasto (puxar para trás, estilo estilingue) → velocidade */
  private flingVel(dx: number, dy: number): [number, number, number] {
    const k = 3.2;
    return [dx * k, dy * k * 1.2, 160 + Math.min(240, Math.hypot(dx, dy) * 2)];
  }

  /* ---------- partículas ---------- */
  sparkleAt(x: number, y: number, n = 14): void {
    emit(2, x, y, n, 140, 0.8, 5);
  }
  confetti(x: number, y: number): void {
    emit(4, x, y, 40, 220, 1.4, 5);
  }
  private stepParticles(c: CanvasRenderingContext2D, dt: number): void {
    for (let i = 0; i < PMAX; i++) {
      const k = pk[i];
      if (!k) continue;
      pl[i] -= dt;
      if (pl[i] <= 0) {
        pk[i] = 0;
        continue;
      }
      px[i] += pvx[i] * dt;
      py[i] += pvy[i] * dt;
      if (k === 3 || k === 4 || k === 5) pvy[i] += 400 * dt;
      else pvy[i] *= 0.96;
      pvx[i] *= 0.97;
      const a = pl[i] / pm[i];
      c.globalAlpha = a;
      c.fillStyle = PCOL[pc[i]];
      if (k === 2) {
        star(c, px[i], py[i], ps[i] * (0.5 + a * 0.5), 4, 0.35);
        c.fill();
      } else if (k === 1) {
        circ(c, px[i], py[i], ps[i] * (1.6 - a));
        c.fillStyle = alpha('#d5d0e8', 0.7);
        c.fill();
      } else c.fillRect(px[i] - ps[i] / 2, py[i] - ps[i] / 2, ps[i], ps[i] * (k === 4 ? 0.6 : 1));
    }
    c.globalAlpha = 1;
  }

  /* ============================================================
   *  ENTRADA
   * ============================================================ */
  down(x: number, y: number): void {
    const [lx, ly] = this.toL(x, y);
    const d = (this.drag = { kind: 'walk' as 'walk' | 'move' | 'rot' | 'fling' | 'scrub' | 'paint' | 'putback', sx: lx, sy: ly, lx, ly, orig: [] as number[], moved: false, t0: this.time });
    this.aimX = lx;
    this.aimY = ly;
    if (this.mode === 'edit') {
      // alça de giro?
      if (this.sel.length === 1) {
        const [bx, by, bw] = itemBox(this.items[this.sel[0]]);
        if (Math.hypot(lx - (bx + bw / 2), ly - (by - 30)) < 18) {
          d.kind = 'rot';
          return;
        }
      }
      const hit = this.pick(lx, ly);
      if (hit >= 0) {
        if (this.multi) {
          if (!this.sel.includes(hit)) this.sel.push(hit);
        } else if (!this.sel.includes(hit)) this.sel = [hit];
        d.kind = 'move';
        d.orig = this.sel.flatMap((i) => [this.items[i].x, this.items[i].y]);
        hsfx.pick();
        this.dirtyStat = true;
      } else {
        if (!this.multi) this.sel = [];
        this.dirtyStat = true;
      }
      this.host.onSelect(this.sel.length);
    } else if (this.mode === 'paint') {
      if (ly < WALL_Y - 8) {
        d.kind = 'paint';
        this.paintAt(lx, ly);
      }
    } else if (this.mode === 'clean') {
      if (this.cleanTool === 'hand') {
        const m = this.host.mess.find((q) => q.room === this.room && q.moved && Math.hypot(q.x - lx, q.y - 20 - ly) < 45);
        if (m) {
          d.kind = 'putback';
          this.moveMess = m;
          return;
        }
      }
      d.kind = 'scrub';
      this.scrub(lx, ly);
    } else if (this.mode === 'party') {
      if (this.holding) d.kind = 'fling';
      else {
        const cp = this.cakePos();
        if (cp && this.cakeSlices > 0 && Math.hypot(lx - cp[0], ly - (cp[1] - 25)) < 40) {
          this.eatCake();
          this.drag = null;
          return;
        }
      }
    } else if (this.mode === 'look') {
      if (this.petVisible() && Math.hypot(lx - this.pet.x, ly - (this.pet.y - 12)) < 30) {
        this.host.onPetTap();
        this.drag = null;
      }
    }
  }
  move(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    const [lx, ly] = this.toL(x, y);
    const ddx = lx - d.sx,
      ddy = ly - d.sy;
    if (Math.hypot(ddx, ddy) > 4) d.moved = true;
    d.lx = lx;
    d.ly = ly;
    this.aimX = lx;
    this.aimY = ly;
    if (d.kind === 'move') {
      for (let k = 0; k < this.sel.length; k++) {
        const it = this.items[this.sel[k]];
        const def = furnById(it.id)!;
        let nx = Math.round((d.orig[k * 2] + ddx) / 5) * 5;
        let ny = Math.round((d.orig[k * 2 + 1] + ddy) / 5) * 5;
        nx = Math.max(def.w / 4, Math.min(RW - def.w / 4, nx));
        ny = def.wall ? Math.max(def.h / 2, Math.min(WALL_Y - def.h / 2 - 4, ny)) : Math.max(WALL_Y + 20, Math.min(RH - 2, ny));
        it.x = nx;
        it.y = ny;
      }
    } else if (d.kind === 'rot') {
      const it = this.items[this.sel[0]];
      const [bx, by, bw, bh] = itemBox(it);
      const a = Math.atan2(ly - (by + bh / 2), lx - (bx + bw / 2)) + Math.PI / 2;
      const snap = Math.PI / 12;
      it.rot = Math.round(a / snap) * snap;
      if (Math.abs(it.rot) < 0.01) it.rot = 0;
    } else if (d.kind === 'paint') this.paintAt(lx, ly);
    else if (d.kind === 'scrub') this.scrub(lx, ly);
    else if (d.kind === 'putback' && this.moveMess) {
      this.moveMess.x = lx;
      this.moveMess.y = ly + 20;
      this.dirtyStat = true;
    }
  }
  up(): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (d.kind === 'move' && d.moved) {
      for (const i of this.sel) {
        this.bounce.set(i, 0);
        const it = this.items[i];
        emit(1, it.x - 15, it.y, 5, 50, 0.6, 7, 9);
        emit(1, it.x + 15, it.y, 5, 50, 0.6, 7, 9);
      }
      hsfx.place();
      this.host.onDesign(this.room, 'items');
    } else if (d.kind === 'rot') {
      hsfx.place();
      this.host.onDesign(this.room, 'items');
    } else if (d.kind === 'paint') {
      this.dirtyStat = true;
      this.host.onDesign(this.room, 'paint');
    } else if (d.kind === 'putback' && this.moveMess) {
      const m = this.moveMess;
      this.moveMess = null;
      if (m.moved && Math.hypot(m.x - m.moved.ox, m.y - m.moved.oy) < 40) {
        this.removeMess(m, true);
        hsfx.place();
        this.sparkleAt(m.moved.ox, m.moved.oy - 20);
      }
    } else if (d.kind === 'fling' && this.holding) {
      const dx = d.sx - d.lx,
        dy = d.sy - d.ly;
      if (Math.hypot(dx, dy) > 14) {
        const [vx, vy, vh] = this.flingVel(dx, dy);
        this.throwFood(this.host.myId, this.holding, this.me.x, this.me.y - 30, vx, vy, true, vh);
        this.host.session?.event({ t: 'throw', from: this.host.myId, food: this.holding, x: Math.round(this.me.x), y: Math.round(this.me.y - 30), vx: Math.round(vx), vy: Math.round(vy) });
        this.holding = null;
      } else {
        this.walkTo(d.lx, d.ly);
      }
    } else if (d.kind === 'walk' && (this.mode === 'party' || this.host.session)) this.walkTo(d.lx, d.ly);
  }
  private walkTo(lx: number, ly: number): void {
    // toque em cima de um móvel/na parede: vai até o ponto livre mais perto, dando a volta
    this.goTo(this.me, lx, ly);
  }
  private pick(lx: number, ly: number): number {
    let best = -1;
    let bestY = -1;
    const it = this.items;
    for (let i = 0; i < it.length; i++) {
      const [x, y, w, h] = itemBox(it[i]);
      if (lx >= x - 4 && lx <= x + w + 4 && ly >= y - 4 && ly <= y + h + 4) {
        const d = furnById(it[i].id)!;
        const pri = (d.flat ? 0 : d.wall ? 1000 : 2000) + it[i].y + (it[i].layer ?? 0) * 500;
        if (pri > bestY) {
          bestY = pri;
          best = i;
        }
      }
    }
    return best;
  }

  /* ---------- pintar ---------- */
  private paintAt(lx: number, ly: number): void {
    const p = this.painter;
    if (p.coverage() >= 1) return;
    const n = p.stamp(lx, ly, this.paintTool);
    this.dirtyStat = true;
    const cov = p.coverage();
    hsfx.paint(cov);
    if (n && Math.random() < 0.4) emit(5, lx, ly, 2, 60, 0.4, 3, pcIndex(pal(p.colorIdx)));
    if (cov >= 0.97) {
      p.fillAll();
      hsfx.done();
      for (let i = 0; i < 6; i++) this.sparkleAt(30 + i * 60, 40 + (i % 2) * 100, 10);
      this.host.onPaintProgress(1, true);
    } else this.host.onPaintProgress(cov, false);
  }
  /** grava pintura completa como base e zera o progresso */
  commitPaint(): { wall: string; strokes?: string } {
    const p = this.painter;
    const prev = this.host.design.paint?.[this.room]?.wall ?? '';
    const res = p.coverage() >= 1 ? { wall: p.spec() } : { wall: prev, strokes: p.covered ? p.strokes() : undefined };
    this.host.design.paint = { ...(this.host.design.paint ?? {}), [this.room]: res };
    if (p.coverage() >= 1) {
      p.clear();
      this.dirtyShell = true;
    }
    return res;
  }

  /* ---------- limpar ---------- */
  private scrub(lx: number, ly: number): void {
    const tool = this.cleanTool;
    for (const m of this.host.mess) {
      if (m.room !== this.room || m.moved) continue;
      if (Math.hypot(m.x - lx, (m.y - ly) * (m.y > WALL_Y ? 1.6 : 1)) > m.r + 18) continue;
      const right =
        tool === 'sponge' ? m.y < WALL_Y || m.kind === 'frosting' || m.kind === 'cake' || m.kind === 'pie' :
        tool === 'mop' ? m.y > WALL_Y && (m.kind === 'juice' || m.kind === 'mud' || m.kind === 'tomato' || m.kind === 'frosting' || m.kind === 'cake' || m.kind === 'pie') :
        tool === 'vacuum' ? m.kind === 'crumbs' || m.kind === 'confetti' :
        tool === 'bag' ? m.kind === 'balloon-pop' || m.kind === 'confetti' || m.kind === 'crumbs' : false;
      const hp = (this.hp.get(m.id) ?? 1) - (right ? 0.06 : 0.02);
      hsfx.scrub();
      if (Math.random() < 0.5) emit(tool === 'vacuum' ? 1 : 5, lx, ly, 2, 40, 0.4, tool === 'vacuum' ? 4 : 3, tool === 'vacuum' ? 9 : 4);
      if (hp <= 0) {
        this.hp.delete(m.id);
        this.removeMess(m, true);
        return;
      }
      this.hp.set(m.id, hp);
      this.dirtyMess = true;
      return;
    }
  }
  removeMess(m: MessItem, byMe: boolean): void {
    const i = this.host.mess.indexOf(m);
    if (i < 0) return;
    this.host.mess.splice(i, 1);
    this.dirtyMess = true;
    this.dirtyStat = true;
    if (m.room === this.room) {
      this.sparkleAt(m.x, m.y, byMe ? 16 : 8);
      if (byMe) hsfx.sparkle();
    }
    this.host.onMess('remove', m, byMe);
    if (!this.host.mess.length) this.host.onCleanAll();
  }
  messCountHere(): number {
    let n = 0;
    for (const m of this.host.mess) if (m.room === this.room) n++;
    return n;
  }

  /* ---------- festa ---------- */
  pickFood(f: string): void {
    this.holding = this.holding === f ? null : f;
    hsfx.pick();
  }
  eatCake(by = this.host.myId, remote = false): void {
    if (this.cakeSlices <= 0) return;
    this.cakeSlices--;
    const ch = by === this.host.myId ? this.me : this.chars.find((c) => c.id === by);
    if (ch) ch.chew = 1.6;
    if (ch && ch !== this.me && ch.bot && ch.ai !== 'eat') {
      // robô comeu: vai até a mesa do bolo (de frente para ela)
      const ti = this.cakeTable();
      const tb = ti >= 0 ? this.items[ti] : null;
      if (tb) {
        if (ch.partner) {
          const o = this.chars.find((q) => q.id === ch.partner);
          if (o) o.partner = '';
          ch.partner = '';
        }
        ch.ai = 'eat';
        ch.aiT = 4 + Math.random() * 3;
        this.goTo(ch, ...this.roomy(tb.x + (Math.random() - 0.5) * 80, tb.y + 16, ch));
      }
    }
    const cp = this.cakePos();
    if (cp) emit(3, cp[0], cp[1] - 30, 10, 80, 0.7, 3, 7);
    hsfx.chomp();
    if (!remote) {
      this.host.session?.event({ t: 'eat', by: this.host.myId, food: 'cake' });
      this.host.session?.event({ t: 'cake', slices: this.cakeSlices });
      this.holding = 'cake';
    }
    this.host.onCake(this.cakeSlices);
  }
  /** evento vindo da sessão */
  onEvent(e: PartyEvent, botsLocal: boolean): void {
    if (e.t === 'throw' && e.from !== this.host.myId) {
      const ch = this.chars.find((c) => c.id === e.from);
      if (ch?.bot) {
        // robô: a sessão não sabe onde ele está de verdade — sai da mão dele, mirando no mesmo alvo
        const T = 0.9;
        const tx = e.x + e.vx * T,
          ty = e.y + e.vy * T;
        const x = ch.x,
          y = ch.y - 30;
        ch.face = Math.sign(tx - x) || ch.face;
        this.throwFood(e.from, e.food, x, y, (tx - x) / T, (ty - y) / T, botsLocal);
      } else if (!ch || !ch.leaving) this.throwFood(e.from, e.food, e.x, e.y, e.vx, e.vy, false);
    } else if (e.t === 'splat') {
      if (!this.host.mess.find((m) => m.id === e.mess.id)) {
        this.host.mess.push(e.mess);
        this.host.onMess('add', e.mess, false);
        this.dirtyMess = true;
        this.dirtyStat = true;
      }
    } else if (e.t === 'clean') {
      const m = this.host.mess.find((q) => q.id === e.messId);
      if (m) this.removeMess(m, false);
    } else if (e.t === 'eat' && e.by !== this.host.myId) this.eatCake(e.by, true);
    else if (e.t === 'cake') this.cakeSlices = Math.min(this.cakeSlices, e.slices);
    else if (e.t === 'chat') this.emoteOf(e.by, e.code);
    else if ((e as unknown as DesignEvent).t === 'design') {
      const de = e as unknown as DesignEvent;
      if (de.by === this.host.myId) return;
      const rd = this.host.design.rooms.find((r) => r.id === de.room);
      if (rd && de.items) rd.items = de.items;
      if (de.paint) this.host.design.paint = { ...(this.host.design.paint ?? {}), [de.room]: de.paint };
      if (de.room === this.room) {
        if (de.paint) this.loadPaint();
        this.invalidate();
      }
      this.host.onDesign(de.room, de.paint ? 'paint' : 'items');
    }
  }
  canDo(need: HomeRole): boolean {
    return can(this.host.role, need);
  }

  /* ---------- edição (botões) ---------- */
  addItem(id: string): void {
    const d = furnById(id);
    if (!d) return;
    const it: Item = { id, x: 180 + (Math.random() - 0.5) * 60, y: d.wall ? 110 : 340 + (Math.random() - 0.5) * 30 };
    this.items.push(it);
    const i = this.items.length - 1;
    this.sel = [i];
    this.bounce.set(i, 0);
    emit(1, it.x, it.y, 10, 70, 0.7, 8, 9);
    hsfx.place();
    this.dirtyStat = true;
    this.host.onSelect(1);
    this.host.onDesign(this.room, 'items');
  }
  forSel(fn: (it: Item, i: number) => void): void {
    for (const i of this.sel) if (this.items[i]) fn(this.items[i], i);
    this.dirtyStat = true;
    this.host.onDesign(this.room, 'items');
  }
  duplicate(): void {
    const n0 = this.items.length;
    for (const i of this.sel) {
      const it = this.items[i];
      this.items.push({ ...it, x: Math.min(RW - 20, it.x + 25), y: Math.min(RH - 4, it.y + (furnById(it.id)?.wall ? 10 : 12)) });
    }
    this.sel = this.sel.map((_, k) => n0 + k);
    for (const i of this.sel) this.bounce.set(i, 0);
    hsfx.place();
    this.dirtyStat = true;
    this.host.onDesign(this.room, 'items');
  }
  removeSel(): void {
    const set = new Set(this.sel);
    for (const i of this.sel) {
      const it = this.items[i];
      emit(1, it.x, it.y - 10, 10, 90, 0.6, 8, 9);
    }
    this.rd.items = this.items.filter((_, i) => !set.has(i));
    this.sel = [];
    this.host.onSelect(0);
    hsfx.splat();
    this.dirtyStat = true;
    this.host.onDesign(this.room, 'items');
  }
  applyTemplate(id: string): void {
    const tp = TEMPLATES.find((x) => x.id === id);
    if (!tp) return;
    const list = tp.items[this.room] ?? tp.items.any;
    this.rd.items = list.filter(([fid]) => furnById(fid)).map(([fid, x, y]) => ({ id: fid, x, y }));
    this.sel = [];
    this.rd.items.forEach((_, i) => this.bounce.set(i, -i * 0.06));
    this.confetti(180, 200);
    hsfx.done();
    this.dirtyStat = true;
    this.host.onDesign(this.room, 'items');
  }
}
function pcIndex(hex: string): number {
  const i = PCOL.indexOf(hex);
  return i >= 0 ? i : 1;
}
export const ALL_FURN = FURNITURE;
