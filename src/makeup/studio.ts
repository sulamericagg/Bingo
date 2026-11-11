/* ============================================================
 *  ESTÚDIO DE MAQUIAGEM / PINTURA FACIAL (design próprio do Bloop).
 *
 *  Pinta no rosto de um Bloop (o mesmo look aparece no Cinema 2D,
 *  na textura do rosto 3D e — no jogador — no Crie seu Bloop).
 *  Pincéis: base, blush, sombra, batom, contorno, iluminador (grátis);
 *  glitter e pintura facial (estrelas, corações, listras) são Pro, assim
 *  como camadas além de FREE_LAYERS. Paleta + conta-gotas, tamanho e
 *  força, borracha, camadas (adicionar/esconder/ordem/opacidade),
 *  simetria, zonas inteligentes (lábios/olhos/bochechas/testa),
 *  luzes de prévia, antes/depois, looks salvos e foto.
 *
 *  Pintura ao vivo: o traço novo é desenhado só no trecho que mudou
 *  (cursor) num rascunho; a camada ativa é recomposta por quadro.
 * ============================================================ */
import './makeup.css';
import '../cinema/cinema.css';
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { drawAvatar, type AvatarData } from '../game/avatar';
import { SHAPES } from '../game/avatar-gfx';
import type { PlayerPose } from '../game/character';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { isPro, paywall } from '../cinema/gates';
import {
  BUILTIN_LOOKS,
  cloneLook,
  deleteLookPreset,
  emptyLook,
  EXTENT,
  FREE_LAYERS,
  lid,
  listLooks,
  lookIsEmpty,
  lookUsesPro,
  MAX_LAYERS,
  MAX_POINTS_STROKE,
  MAX_STROKES,
  PRO_BRUSHES,
  saveLookPreset,
  type BrushId,
  type MakeupLook,
  type Stroke,
  type ZoneId,
} from './format';
import { applyScratch, composeLayers, maxLookPx, newCursor, renderLayer, strokeScratch, unitCtx, zonePath, type Cursor } from './render';

export type Lighting = 'day' | 'ring' | 'studio' | 'salon';

export interface StudioOptions {
  avatar: AvatarData;
  look: MakeupLook | null | undefined;
  /** nome de quem está sendo maquiado (título) */
  name: string;
}

/* ---------------------------- catálogos ---------------------------- */
interface BrushItem {
  id: BrushId;
  glyph: string;
  name: () => string;
  color: string;
  size: number;
  power: number;
  zone?: ZoneId;
}
const BRUSHES: BrushItem[] = [
  { id: 'base', glyph: '🧴', name: () => t('mk.b.base', 'Base'), color: '#f2c9a8', size: 70, power: 45 },
  { id: 'blush', glyph: '🌸', name: () => t('mk.b.blush', 'Blush'), color: '#ff7a9a', size: 40, power: 55, zone: 'cheeks' },
  { id: 'shadow', glyph: '👁️', name: () => t('mk.b.shadow', 'Sombra'), color: '#9b6bff', size: 26, power: 65, zone: 'eyes' },
  { id: 'lips', glyph: '💋', name: () => t('mk.b.lips', 'Batom'), color: '#e0245e', size: 14, power: 80, zone: 'lips' },
  { id: 'contour', glyph: '🤎', name: () => t('mk.b.contour', 'Contorno'), color: '#8a5a3c', size: 34, power: 45 },
  { id: 'highlight', glyph: '✨', name: () => t('mk.b.highlight', 'Iluminador'), color: '#fff6e0', size: 22, power: 55 },
  { id: 'glitter', glyph: '🌟', name: () => t('mk.b.glitter', 'Glitter'), color: '#ffd93b', size: 30, power: 90 },
  { id: 'stars', glyph: '⭐', name: () => t('mk.b.stars', 'Estrelas'), color: '#ffd93b', size: 16, power: 100 },
  { id: 'hearts', glyph: '💖', name: () => t('mk.b.hearts', 'Corações'), color: '#ff5c8a', size: 16, power: 100 },
  { id: 'stripes', glyph: '〰️', name: () => t('mk.b.stripes', 'Listras'), color: '#3fc8ff', size: 8, power: 100 },
  { id: 'erase', glyph: '🧽', name: () => t('mk.b.erase', 'Borracha'), color: '#000000', size: 30, power: 100 },
];
const ZONES: { id: ZoneId; name: () => string }[] = [
  { id: 'free', name: () => t('mk.z.free', 'Livre') },
  { id: 'lips', name: () => t('mk.z.lips', 'Lábios') },
  { id: 'eyes', name: () => t('mk.z.eyes', 'Olhos') },
  { id: 'cheeks', name: () => t('mk.z.cheeks', 'Bochechas') },
  { id: 'forehead', name: () => t('mk.z.forehead', 'Testa') },
];
const LIGHTS: { id: Lighting; glyph: string; name: () => string }[] = [
  { id: 'day', glyph: '☀️', name: () => t('mk.l.day', 'Luz do dia') },
  { id: 'ring', glyph: '⭕', name: () => t('mk.l.ring', 'Luz de anel') },
  { id: 'studio', glyph: '🎬', name: () => t('mk.l.studio', 'Estúdio') },
  { id: 'salon', glyph: '💡', name: () => t('mk.l.salon', 'Salão') },
];
/** paleta: tons de pele, rosas, vermelhos, nudes, cores de festa */
const PALETTE = [
  '#fde2cf', '#f2c9a8', '#d9a07a', '#b97850', '#8a5a3c', '#5a3826',
  '#ffb3c7', '#ff7a9a', '#ff5c8a', '#e0245e', '#b0003a', '#7a1033',
  '#c98b7a', '#a0604f', '#e8a87c', '#ffd93b', '#ff8f3b', '#ff2e3a',
  '#9be15d', '#3ecf8e', '#3fc8ff', '#4f7dff', '#9b6bff', '#d77bff',
  '#ffffff', '#fff6e0', '#c9c9d6', '#5b5b6e', '#2b2440', '#000000',
];
const LOOK_NAMES: Record<string, () => string> = {
  natural: () => t('mk.look.natural', 'Natural'),
  festa: () => t('mk.look.festa', 'Festa'),
  brilho: () => t('mk.look.brilho', 'Brilho'),
  heroi: () => t('mk.look.heroi', 'Herói'),
  gatinho: () => t('mk.look.gatinho', 'Gatinho'),
};

type Tab = 'brush' | 'color' | 'layers' | 'looks';

/* ---------------------------- luzes de prévia ---------------------------- */
function drawBackdrop(x: CanvasRenderingContext2D, W: number, H: number, l: Lighting): void {
  const g = x.createLinearGradient(0, 0, 0, H);
  const c =
    l === 'day' ? ['#bfe6ff', '#fff3d6'] : l === 'ring' ? ['#2a2140', '#140e24'] : l === 'studio' ? ['#5d5a6e', '#26232f'] : ['#ffe2b8', '#d99a5a'];
  g.addColorStop(0, c[0]);
  g.addColorStop(1, c[1]);
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  if (l === 'salon') {
    // lâmpadas do espelho de camarim
    for (let i = 0; i < 7; i++) {
      const bx = (W * (i + 0.5)) / 7;
      for (const by of [H * 0.05, H * 0.95]) {
        const r = W * 0.06;
        const rg = x.createRadialGradient(bx, by, 0, bx, by, r);
        rg.addColorStop(0, 'rgba(255,250,220,1)');
        rg.addColorStop(0.35, 'rgba(255,220,150,.7)');
        rg.addColorStop(1, 'rgba(255,200,120,0)');
        x.fillStyle = rg;
        x.fillRect(bx - r, by - r, r * 2, r * 2);
      }
    }
  }
  if (l === 'ring') {
    // o anel de luz atrás da câmera (reflexo no fundo)
    x.strokeStyle = 'rgba(255,255,255,.08)';
    x.lineWidth = W * 0.05;
    x.beginPath();
    x.arc(W / 2, H * 0.48, W * 0.46, 0, Math.PI * 2);
    x.stroke();
  }
}

function drawLighting(x: CanvasRenderingContext2D, W: number, H: number, l: Lighting, cx: number, cy: number, R: number, ex: number, ey: number): void {
  x.save();
  if (l === 'day') {
    const g = x.createLinearGradient(0, cy - R, 0, cy + R);
    g.addColorStop(0, 'rgba(255,255,255,.35)');
    g.addColorStop(1, 'rgba(120,150,200,.25)');
    x.globalCompositeOperation = 'soft-light';
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  } else if (l === 'ring') {
    const g = x.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.4);
    g.addColorStop(0, 'rgba(255,255,255,.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.globalCompositeOperation = 'screen';
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    // reflexo do anel nos olhos
    x.globalCompositeOperation = 'source-over';
    x.strokeStyle = 'rgba(255,255,255,.9)';
    x.lineWidth = Math.max(1.5, R * 0.018);
    for (const sd of [-1, 1]) {
      x.beginPath();
      x.arc(cx + sd * ex + R * 0.02, cy + ey - R * 0.02, R * 0.055, 0, Math.PI * 2);
      x.stroke();
    }
  } else if (l === 'studio') {
    const g = x.createLinearGradient(cx - R * 1.2, 0, cx + R * 1.2, 0);
    g.addColorStop(0, 'rgba(255,240,215,.55)');
    g.addColorStop(0.5, 'rgba(128,128,128,0)');
    g.addColorStop(1, 'rgba(0,0,30,.55)');
    x.globalCompositeOperation = 'soft-light';
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
  } else {
    x.globalCompositeOperation = 'soft-light';
    x.fillStyle = 'rgba(255,170,70,.45)';
    x.fillRect(0, 0, W, H);
  }
  x.restore();
}

/* ============================================================
 *  ESTÚDIO
 * ============================================================ */

/**
 * Abre o estúdio. Resolve com o look novo (null = sem maquiagem) ou `undefined` se a
 * pessoa saiu sem salvar.
 */
export function openMakeupStudio(o: StudioOptions): Promise<MakeupLook | null | undefined> {
  return new Promise((resolve) => new Studio(o, resolve));
}

class Studio {
  private root: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private look: MakeupLook;
  private orig: string;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private active = 0;
  private brush: BrushId = 'blush';
  private colors: Partial<Record<BrushId, string>> = {};
  private sizes: Partial<Record<BrushId, number>> = {};
  private powers: Partial<Record<BrushId, number>> = {};
  private zone: ZoneId = 'cheeks';
  private mirror = true;
  private light: Lighting = 'day';
  private before = false;
  private dropper = false;
  private tab: Tab = 'brush';
  /** textura do look (px por lado, conforme a qualidade) */
  private px: number;
  private layerCv: HTMLCanvasElement[] = [];
  private finalCv: HTMLCanvasElement;
  /** traço em andamento */
  private live: { st: Stroke; cur: Cursor; base: HTMLCanvasElement; scratch: HTMLCanvasElement; sx: number; sy: number; pid: number } | null = null;
  private dirty = true;
  private raf = 0;
  private avStudio: AvatarData;
  private pose: PlayerPose = { t: 0.3, blink: 0, lookX: 0, lookY: 0, sx: 1, sy: 1, mood: 'fly', lx: -0.5, ly: -0.8, still: true };
  private geo = { cx: 0, cy: 0, R: 1, fy: 0, W: 1, H: 1 };
  private popBack: () => void;
  private done = false;

  constructor(
    private o: StudioOptions,
    private resolve: (l: MakeupLook | null | undefined) => void,
  ) {
    this.look = o.look && o.look.layers.length ? cloneLook(o.look) : emptyLook(t('mk.layer', 'Camada {n}', { n: 1 }));
    this.orig = JSON.stringify(this.look);
    this.active = this.look.layers.length - 1;
    this.px = maxLookPx();
    this.finalCv = document.createElement('canvas');
    this.finalCv.width = this.finalCv.height = this.px;
    this.avStudio = { parts: { ...o.avatar.parts, head: 'h_none', back: 'k_none', aura: 'a_none' }, colors: { ...o.avatar.colors } };
    for (const b of BRUSHES) {
      this.colors[b.id] = b.color;
      this.sizes[b.id] = b.size;
      this.powers[b.id] = b.power;
    }
    this.root = document.createElement('div');
    this.root.className = 'mk-root';
    this.root.innerHTML = `
      <div class="mk-top">
        <button class="cin-btn cin-ico" data-a="close" aria-label="${t('mk.close', 'Fechar')}">←</button>
        <div class="mk-title">💄 ${t('mk.title', 'Maquiagem')} <small>${esc(o.name)}</small></div>
        <button class="cin-btn cin-ico" data-a="undo" aria-label="${t('mk.undo', 'Desfazer')}">↶</button>
        <button class="cin-btn cin-ico" data-a="redo" aria-label="${t('mk.redo', 'Refazer')}">↷</button>
        <button class="cin-btn pri" data-a="save">✓ ${t('mk.save', 'Pronto')}</button>
      </div>
      <div class="mk-stage">
        <canvas class="mk-cv"></canvas>
        <div class="mk-float l">
          <button class="mk-fb" data-a="mirror" aria-pressed="true" title="${t('mk.mirror', 'Simetria')}">⇋<span>${t('mk.mirror', 'Simetria')}</span></button>
          <button class="mk-fb" data-a="dropper" title="${t('mk.dropper', 'Conta-gotas')}">💧<span>${t('mk.dropper', 'Conta-gotas')}</span></button>
        </div>
        <div class="mk-float r">
          <button class="mk-fb" data-hold="before">◐<span>${t('mk.before', 'Antes')}</span></button>
          <button class="mk-fb" data-a="snap">📸<span>${t('mk.snap', 'Foto')}</span></button>
        </div>
        <div class="mk-lights">${LIGHTS.map((l) => `<button class="mk-chip" data-a="light" data-v="${l.id}">${l.glyph} ${l.name()}</button>`).join('')}</div>
      </div>
      <div class="mk-tabs">
        <button class="mk-tab" data-tab="brush">🖌️ ${t('mk.tab.brush', 'Pincéis')}</button>
        <button class="mk-tab" data-tab="color">🎨 ${t('mk.tab.color', 'Cores')}</button>
        <button class="mk-tab" data-tab="layers">🗂️ ${t('mk.tab.layers', 'Camadas')}</button>
        <button class="mk-tab" data-tab="looks">💾 ${t('mk.tab.looks', 'Looks')}</button>
      </div>
      <div class="mk-panel"></div>`;
    document.body.appendChild(this.root);
    this.cv = this.root.querySelector('.mk-cv')!;
    this.ctx = this.cv.getContext('2d', { willReadFrequently: false })!;
    this.rebuildLayers();
    this.bind();
    this.renderPanel();
    this.syncChrome();
    this.popBack = pushBack(() => void this.close(false));
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    loop();
    (window as unknown as { __makeup?: unknown }).__makeup = location.search.includes('debug') ? this : undefined;
  }

  /* ---------------------------- camadas ---------------------------- */
  private rebuildLayers(): void {
    this.layerCv = this.look.layers.map((L, i) => {
      const c = this.layerCv[i] ?? document.createElement('canvas');
      c.width = c.height = this.px;
      renderLayer(c, L);
      return c;
    });
    this.active = Math.max(0, Math.min(this.active, this.look.layers.length - 1));
    this.compose();
  }
  private compose(): void {
    composeLayers(this.finalCv, this.look.layers, this.layerCv);
    this.dirty = true;
  }

  /* ---------------------------- desfazer ---------------------------- */
  private snapshot(): void {
    this.undoStack.push(JSON.stringify(this.look));
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
    this.syncChrome();
  }
  private undo(redo = false): void {
    const from = redo ? this.redoStack : this.undoStack;
    const to = redo ? this.undoStack : this.redoStack;
    const s = from.pop();
    if (!s) return;
    to.push(JSON.stringify(this.look));
    this.look = JSON.parse(s) as MakeupLook;
    this.rebuildLayers();
    this.renderPanel();
    this.syncChrome();
  }

  /* ---------------------------- desenho da prévia ---------------------------- */
  private frame(): void {
    const cv = this.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(cv.clientWidth * dpr);
    const bh = Math.round(cv.clientHeight * dpr);
    if (bw && bh && (cv.width !== bw || cv.height !== bh)) {
      cv.width = bw;
      cv.height = bh;
      this.dirty = true;
    }
    if (!this.dirty || !bw) return;
    this.dirty = false;
    this.paint(this.ctx, cv.width, cv.height, this.before, false);
  }

  /** Desenha rosto + look + luz. `full` = com chapéu/costas (foto). */
  private paint(x: CanvasRenderingContext2D, W: number, H: number, before: boolean, full: boolean): void {
    const sh = SHAPES[this.o.avatar.parts.body] ?? SHAPES.b_blob;
    const R = Math.min(W * 0.4, H * 0.36);
    const fy = sh.fy;
    const cx = W / 2;
    const cy = H * 0.5 - fy * R + R * 0.1;
    this.geo = { cx, cy, R, fy, W, H };
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    drawBackdrop(x, W, H, this.light);
    x.save();
    x.translate(cx, cy);
    const fin = this.finalCv;
    const overlay = before
      ? null
      : (c: CanvasRenderingContext2D, r: number, f: number) => {
          const size = r * (EXTENT * 2) / 100;
          c.drawImage(fin, -size / 2, f * r - size / 2, size, size);
        };
    drawAvatar(x, full ? this.o.avatar : this.avStudio, R, this.pose, overlay);
    x.restore();
    const ex = R * 0.33 * Math.min(1.15, Math.max(0.9, sh.side));
    drawLighting(x, W, H, this.light, cx, cy, R, ex, R * (fy - 0.1));
    // guia da zona inteligente (só no estúdio, enquanto não pinta)
    if (!full && !before && this.zone !== 'free' && !this.live && this.brush !== 'erase') {
      x.save();
      x.translate(cx, cy + fy * R);
      x.scale(R / 100, R / 100);
      zonePath(x, this.zone);
      x.setLineDash([6, 6]);
      x.lineWidth = 2.2 / (R / 100);
      x.strokeStyle = 'rgba(255,255,255,.75)';
      x.stroke();
      x.restore();
    }
    if (before && !full) {
      x.fillStyle = 'rgba(20,6,50,.7)';
      x.font = `700 ${Math.round(W * 0.045)}px system-ui,sans-serif`;
      x.textAlign = 'center';
      x.fillText(t('mk.beforeTag', 'ANTES'), W / 2, H * 0.08);
    }
  }

  /* ---------------------------- pintura ---------------------------- */
  private toFace(ev: PointerEvent): [number, number] {
    const r = this.cv.getBoundingClientRect();
    const k = this.cv.width / r.width;
    const px = (ev.clientX - r.left) * k;
    const py = (ev.clientY - r.top) * k;
    const { cx, cy, R, fy } = this.geo;
    return [((px - cx) / R) * 100, ((py - cy) / R - fy) * 100];
  }

  private pickColor(ev: PointerEvent): void {
    const r = this.cv.getBoundingClientRect();
    const k = this.cv.width / r.width;
    const d = this.ctx.getImageData(Math.round((ev.clientX - r.left) * k), Math.round((ev.clientY - r.top) * k), 1, 1).data;
    const hex = '#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    this.colors[this.brush === 'erase' ? 'blush' : this.brush] = hex;
    this.dropper = false;
    notify(t('mk.picked', 'Cor escolhida!'), { kind: 'good', icon: 'check' });
    this.syncChrome();
    if (this.tab === 'color' || this.tab === 'brush') this.renderPanel();
  }

  private canUse(b: BrushId): boolean {
    if (PRO_BRUSHES.has(b) && !isPro()) {
      paywall('item');
      return false;
    }
    return true;
  }

  private begin(ev: PointerEvent): void {
    if (this.live) return;
    if (this.dropper) return this.pickColor(ev);
    const L = this.look.layers[this.active];
    if (!L) return;
    if (!this.canUse(this.brush)) return;
    const total = this.look.layers.reduce((n, l) => n + l.st.length, 0);
    if (total >= MAX_STROKES) {
      notify(t('mk.full', 'Este look já tem traços demais. Apague uma camada ou comece outro.'), { kind: 'warn' });
      return;
    }
    if (L.h) {
      L.h = undefined;
      this.compose();
      this.renderPanel();
    }
    this.snapshot();
    const [fx, fyv] = this.toFace(ev);
    const st: Stroke = {
      b: this.brush,
      c: this.colors[this.brush] ?? '#ff5c8a',
      s: this.sizes[this.brush] ?? 20,
      a: this.powers[this.brush] ?? 60,
      z: this.zone !== 'free' && this.brush !== 'erase' ? this.zone : undefined,
      m: this.mirror ? 1 : undefined,
      p: [Math.round(fx), Math.round(fyv)],
    };
    L.st.push(st);
    const base = document.createElement('canvas');
    base.width = base.height = this.px;
    base.getContext('2d')!.drawImage(this.layerCv[this.active], 0, 0);
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = this.px;
    this.live = { st, cur: newCursor(), base, scratch, sx: fx, sy: fyv, pid: ev.pointerId };
    this.cv.setPointerCapture?.(ev.pointerId);
    this.extend();
  }

  private move(ev: PointerEvent): void {
    const lv = this.live;
    if (!lv || ev.pointerId !== lv.pid) return;
    const evs = (ev.getCoalescedEvents?.() ?? []).length ? ev.getCoalescedEvents() : [ev];
    const minD = Math.max(1, lv.st.s * 0.08);
    for (const e of evs) {
      const [fx, fyv] = this.toFace(e);
      // pincel "preguiçoso": suaviza o tremido do dedo
      lv.sx += (fx - lv.sx) * 0.55;
      lv.sy += (fyv - lv.sy) * 0.55;
      const p = lv.st.p;
      const lx = p[p.length - 2];
      const ly = p[p.length - 1];
      if (Math.hypot(lv.sx - lx, lv.sy - ly) < minD) continue;
      if (p.length >= MAX_POINTS_STROKE * 2) break;
      p.push(Math.max(-EXTENT, Math.min(EXTENT, Math.round(lv.sx))), Math.max(-EXTENT, Math.min(EXTENT, Math.round(lv.sy))));
    }
    this.extend();
  }

  private extend(): void {
    const lv = this.live!;
    strokeScratch(unitCtx(lv.scratch), lv.st, lv.cur);
    const lc = this.layerCv[this.active];
    const x = lc.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'copy';
    x.drawImage(lv.base, 0, 0);
    x.globalCompositeOperation = 'source-over';
    applyScratch(x, lv.scratch, lv.st);
    this.compose();
  }

  private end(ev: PointerEvent): void {
    const lv = this.live;
    if (!lv || ev.pointerId !== lv.pid) return;
    this.live = null;
    this.dirty = true;
    this.syncChrome();
  }

  /* ---------------------------- interface ---------------------------- */
  private bind(): void {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.begin(e);
    });
    cv.addEventListener('pointermove', (e) => this.move(e));
    cv.addEventListener('pointerup', (e) => this.end(e));
    cv.addEventListener('pointercancel', (e) => this.end(e));
    const hold = this.root.querySelector<HTMLElement>('[data-hold="before"]')!;
    const setB = (v: boolean) => {
      this.before = v;
      hold.classList.toggle('on', v);
      this.dirty = true;
    };
    hold.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setB(true);
    });
    for (const k of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(k, () => setB(false));
    this.root.addEventListener('click', (e) => {
      const tg = e.target as HTMLElement;
      const tab = tg.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (tab) {
        this.tab = tab;
        this.renderPanel();
        this.syncChrome();
        return;
      }
      const b = tg.closest<HTMLElement>('[data-a]');
      if (!b) return;
      void this.action(b.dataset.a!, b);
    });
    this.root.addEventListener('input', (e) => {
      const i = e.target as HTMLInputElement;
      const k = i.dataset.k;
      if (k === 'size') this.sizes[this.brush] = +i.value;
      else if (k === 'power') this.powers[this.brush] = +i.value;
      else if (k === 'color') {
        this.colors[this.brush === 'erase' ? 'blush' : this.brush] = i.value;
        this.syncChrome();
      } else if (k === 'lo') {
        const L = this.look.layers[+i.dataset.i!];
        if (L) {
          L.o = +i.value;
          this.compose();
        }
      }
      const out = i.nextElementSibling as HTMLOutputElement | null;
      if (out && out.tagName === 'OUTPUT') out.value = i.value;
    });
    this.root.addEventListener('change', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.dataset.k === 'lo') this.syncChrome();
      if (i.dataset.k === 'color') this.renderPanel();
    });
  }

  private async action(a: string, b: HTMLElement): Promise<void> {
    const v = b.dataset.v ?? '';
    const i = +(b.dataset.i ?? -1);
    switch (a) {
      case 'close':
        return void this.close(false);
      case 'save':
        return void this.close(true);
      case 'undo':
        return this.undo();
      case 'redo':
        return this.undo(true);
      case 'mirror':
        this.mirror = !this.mirror;
        break;
      case 'dropper':
        this.dropper = !this.dropper;
        if (this.dropper) notify(t('mk.dropTip', 'Toque no rosto para pegar uma cor.'), { icon: 'star' });
        break;
      case 'light':
        this.light = v as Lighting;
        this.dirty = true;
        break;
      case 'snap':
        return this.snap();
      case 'brush':
        if (!this.canUse(v as BrushId)) return;
        this.brush = v as BrushId;
        {
          const def = BRUSHES.find((x) => x.id === v);
          if (def?.zone) this.zone = def.zone;
          else if (v !== 'erase') this.zone = 'free';
        }
        this.dropper = false;
        this.renderPanel();
        this.dirty = true;
        break;
      case 'zone':
        this.zone = v as ZoneId;
        this.renderPanel();
        this.dirty = true;
        break;
      case 'sw':
        this.colors[this.brush === 'erase' ? 'blush' : this.brush] = v;
        if (this.brush === 'erase') this.brush = 'blush';
        this.renderPanel();
        break;
      case 'lsel':
        this.active = i;
        this.renderPanel();
        break;
      case 'lhide': {
        const L = this.look.layers[i];
        if (!L) return;
        this.snapshot();
        L.h = L.h ? undefined : 1;
        this.compose();
        this.renderPanel();
        break;
      }
      case 'lup':
      case 'ldown': {
        const j = a === 'lup' ? i + 1 : i - 1;
        const ls = this.look.layers;
        if (j < 0 || j >= ls.length) return;
        this.snapshot();
        [ls[i], ls[j]] = [ls[j], ls[i]];
        [this.layerCv[i], this.layerCv[j]] = [this.layerCv[j], this.layerCv[i]];
        if (this.active === i) this.active = j;
        else if (this.active === j) this.active = i;
        this.compose();
        this.renderPanel();
        break;
      }
      case 'ldel': {
        if (this.look.layers.length <= 1) {
          this.snapshot();
          this.look.layers[0].st = [];
          this.rebuildLayers();
        } else {
          this.snapshot();
          this.look.layers.splice(i, 1);
          this.layerCv.splice(i, 1);
          this.active = Math.min(this.active, this.look.layers.length - 1);
          this.compose();
        }
        this.renderPanel();
        break;
      }
      case 'ladd': {
        if (this.look.layers.length >= MAX_LAYERS) return;
        if (this.look.layers.length >= FREE_LAYERS && !isPro()) return paywall('item');
        this.snapshot();
        this.look.layers.push({ id: lid(), name: t('mk.layer', 'Camada {n}', { n: this.look.layers.length + 1 }), o: 100, st: [] });
        const c = document.createElement('canvas');
        c.width = c.height = this.px;
        this.layerCv.push(c);
        this.active = this.look.layers.length - 1;
        this.compose();
        this.renderPanel();
        break;
      }
      case 'apply': {
        const bl = BUILTIN_LOOKS.find((x) => x.id === v);
        const sv = listLooks().find((x) => x.id === v);
        const lk = bl?.look ?? sv?.look;
        if (!lk) return;
        if ((bl?.pro || lookUsesPro(lk)) && !isPro()) return paywall('item');
        this.snapshot();
        this.look = cloneLook(lk);
        this.active = this.look.layers.length - 1;
        this.rebuildLayers();
        this.renderPanel();
        break;
      }
      case 'lookdel':
        deleteLookPreset(v);
        this.renderPanel();
        break;
      case 'lookSave': {
        const inp = this.root.querySelector<HTMLInputElement>('[data-k="lookName"]');
        const name = (inp?.value || '').trim() || t('mk.myLook', 'Meu look');
        if (lookIsEmpty(this.look)) return void notify(t('mk.emptyLook', 'Pinte alguma coisa primeiro!'), { kind: 'warn' });
        const { maskLongText } = await import('../../shared/moderation');
        const ok = saveLookPreset(maskLongText(name, 24).text, this.look, this.thumb());
        notify(ok ? t('mk.saved', 'Look salvo!') : t('mk.saveFail', 'Sem espaço para salvar mais looks.'), { kind: ok ? 'good' : 'warn', icon: ok ? 'check' : 'warning' });
        this.renderPanel();
        break;
      }
      case 'clear':
        if (lookIsEmpty(this.look)) return;
        this.snapshot();
        this.look = emptyLook(t('mk.layer', 'Camada {n}', { n: 1 }));
        this.active = 0;
        this.rebuildLayers();
        this.renderPanel();
        break;
    }
    this.syncChrome();
  }

  private syncChrome(): void {
    const r = this.root;
    r.querySelector('[data-a="mirror"]')?.classList.toggle('on', this.mirror);
    r.querySelector('[data-a="mirror"]')?.setAttribute('aria-pressed', String(this.mirror));
    r.querySelector('[data-a="dropper"]')?.classList.toggle('on', this.dropper);
    r.querySelectorAll<HTMLElement>('[data-a="light"]').forEach((b) => b.classList.toggle('on', b.dataset.v === this.light));
    r.querySelectorAll<HTMLElement>('.mk-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    (r.querySelector('[data-a="undo"]') as HTMLButtonElement).disabled = !this.undoStack.length;
    (r.querySelector('[data-a="redo"]') as HTMLButtonElement).disabled = !this.redoStack.length;
    this.cv.classList.toggle('drop', this.dropper);
    const sw = r.querySelector<HTMLElement>('.mk-cur');
    if (sw) sw.style.background = this.colors[this.brush === 'erase' ? 'blush' : this.brush] ?? '#fff';
  }

  private renderPanel(): void {
    const h = this.root.querySelector<HTMLElement>('.mk-panel')!;
    const pro = isPro();
    const tag = (b: BrushId) => (PRO_BRUSHES.has(b) && !pro ? '<b class="cin-pro">PRO</b>' : '');
    const colorOf = this.colors[this.brush === 'erase' ? 'blush' : this.brush] ?? '#ff5c8a';
    let html = '';
    if (this.tab === 'brush') {
      html += `<div class="mk-brushes">${BRUSHES.map((b) => `<button class="mk-brush ${b.id === this.brush ? 'on' : ''}" data-a="brush" data-v="${b.id}"><i style="--c:${b.id === 'erase' ? '#fff' : this.colors[b.id]}">${b.glyph}</i><span>${b.name()}${tag(b.id)}</span></button>`).join('')}</div>`;
      html += `<h5>${t('mk.zone', 'Zona inteligente')}</h5><div class="mk-chips">${ZONES.map((z) => `<button class="mk-chip ${z.id === this.zone ? 'on' : ''}" data-a="zone" data-v="${z.id}">${z.name()}</button>`).join('')}</div>`;
      html += `<label class="mk-range"><span>${t('mk.size', 'Tamanho')}</span><input type="range" min="2" max="120" step="1" value="${this.sizes[this.brush]}" data-k="size"><output>${this.sizes[this.brush]}</output></label>`;
      html += `<label class="mk-range"><span>${t('mk.power', 'Força')}</span><input type="range" min="5" max="100" step="1" value="${this.powers[this.brush]}" data-k="power"><output>${this.powers[this.brush]}</output></label>`;
    } else if (this.tab === 'color') {
      html += `<div class="mk-row"><span class="mk-cur" style="background:${colorOf}"></span><label class="cin-btn sm mk-pickbtn">🎨 ${t('mk.custom', 'Outra cor')}<input type="color" value="${colorOf}" data-k="color"></label><button class="cin-btn sm ${this.dropper ? 'ok' : ''}" data-a="dropper">💧 ${t('mk.dropper', 'Conta-gotas')}</button></div>`;
      html += `<div class="mk-palette">${PALETTE.map((c) => `<button class="mk-sw ${c === colorOf ? 'on' : ''}" style="background:${c}" data-a="sw" data-v="${c}" aria-label="${c}"></button>`).join('')}</div>`;
    } else if (this.tab === 'layers') {
      const ls = this.look.layers;
      html += `<div class="mk-layers">`;
      for (let i = ls.length - 1; i >= 0; i--) {
        const L = ls[i];
        html += `<div class="mk-layer ${i === this.active ? 'on' : ''}">
          <button class="mk-lname" data-a="lsel" data-i="${i}">${i === this.active ? '🖌️ ' : ''}${esc(L.name || t('mk.layer', 'Camada {n}', { n: i + 1 }))} <small>${L.st.length}</small></button>
          <button class="cin-btn sm" data-a="lhide" data-i="${i}" aria-label="${t('mk.hide', 'Esconder')}">${L.h ? '🙈' : '👁️'}</button>
          <button class="cin-btn sm" data-a="lup" data-i="${i}" ${i === ls.length - 1 ? 'disabled' : ''} aria-label="${t('mk.up', 'Subir')}">▲</button>
          <button class="cin-btn sm" data-a="ldown" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${t('mk.down', 'Descer')}">▼</button>
          <button class="cin-btn sm warn" data-a="ldel" data-i="${i}" aria-label="${t('mk.delLayer', 'Apagar camada')}">🗑</button>
          <label class="mk-range sm"><span>${t('mk.opacity', 'Opacidade')}</span><input type="range" min="0" max="100" value="${L.o}" data-k="lo" data-i="${i}"><output>${L.o}</output></label>
        </div>`;
      }
      html += `</div><button class="cin-btn pri" data-a="ladd" ${ls.length >= MAX_LAYERS ? 'disabled' : ''}>＋ ${t('mk.addLayer', 'Nova camada')}${ls.length >= FREE_LAYERS && !pro ? '<b class="cin-pro">PRO</b>' : ''}</button>
        <p class="cin-hint">${t('mk.layersTip', 'Pinte cada parte numa camada para ajustar depois. Grátis: {n} camadas.', { n: FREE_LAYERS })}</p>`;
    } else {
      html += `<h5>${t('mk.ready', 'Looks prontos')}</h5><div class="mk-looks">${BUILTIN_LOOKS.map((l) => `<button class="mk-look" data-a="apply" data-v="${l.id}"><canvas data-th="${l.id}" width="72" height="72"></canvas><span>${(LOOK_NAMES[l.id] ?? (() => l.id))()}${l.pro && !pro ? '<b class="cin-pro">PRO</b>' : ''}</span></button>`).join('')}</div>`;
      const saved = listLooks();
      html += `<h5>${t('mk.mine', 'Meus looks')}</h5>`;
      html += saved.length
        ? `<div class="mk-looks">${saved.map((l) => `<div class="mk-look"><button data-a="apply" data-v="${l.id}"><img src="${l.thumb}" alt=""><span>${esc(l.name)}</span></button><button class="mk-x" data-a="lookdel" data-v="${l.id}" aria-label="${t('mk.delLook', 'Apagar look')}">✕</button></div>`).join('')}</div>`
        : `<p class="cin-hint">${t('mk.noneSaved', 'Salve seus looks favoritos para usar em outros personagens.')}</p>`;
      html += `<div class="mk-row"><input class="cin-input mk-name" maxlength="24" data-k="lookName" placeholder="${t('mk.lookName', 'Nome do look')}"><button class="cin-btn sm ok" data-a="lookSave">💾 ${t('mk.saveLook', 'Salvar look')}</button></div>`;
      html += `<div class="mk-row"><button class="cin-btn sm warn" data-a="clear">🧽 ${t('mk.clear', 'Limpar tudo')}</button></div>`;
    }
    h.innerHTML = html;
    if (this.tab === 'looks') {
      h.querySelectorAll<HTMLCanvasElement>('canvas[data-th]').forEach((c) => {
        const bl = BUILTIN_LOOKS.find((x) => x.id === c.dataset.th);
        if (bl) this.thumbInto(c, bl.look);
      });
    }
  }

  /* ---------------------------- miniaturas e foto ---------------------------- */
  private thumbInto(c: HTMLCanvasElement, look: MakeupLook): void {
    const x = c.getContext('2d')!;
    const W = c.width;
    const sh = SHAPES[this.o.avatar.parts.body] ?? SHAPES.b_blob;
    const R = W * 0.42;
    x.clearRect(0, 0, W, W);
    x.save();
    x.translate(W / 2, W * 0.5 - sh.fy * R + R * 0.08);
    const tmpL = document.createElement('canvas');
    tmpL.width = tmpL.height = 128;
    const cvs = look.layers.map((L) => {
      const k = document.createElement('canvas');
      k.width = k.height = 128;
      renderLayer(k, L);
      return k;
    });
    composeLayers(tmpL, look.layers, cvs);
    drawAvatar(x, this.avStudio, R, this.pose, (cx, r, f) => {
      const size = (r * EXTENT * 2) / 100;
      cx.drawImage(tmpL, -size / 2, f * r - size / 2, size, size);
    });
    x.restore();
  }

  private thumb(): string {
    const c = document.createElement('canvas');
    c.width = c.height = 80;
    this.thumbInto(c, this.look);
    try {
      const w = c.toDataURL('image/webp', 0.8);
      return w.startsWith('data:image/webp') ? w : c.toDataURL('image/png');
    } catch {
      return '';
    }
  }

  private async snap(): Promise<void> {
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const x = c.getContext('2d')!;
    this.paint(x, 1024, 1024, false, true);
    x.font = '700 30px system-ui,sans-serif';
    x.textAlign = 'right';
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.strokeStyle = 'rgba(20,6,50,.5)';
    x.lineWidth = 4;
    x.strokeText('Bloop World', 1000, 1000);
    x.fillText('Bloop World', 1000, 1000);
    this.dirty = true;
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    (window as unknown as { __makeupSnap?: Blob }).__makeupSnap = blob;
    const { shareFile } = await import('../cinema/export');
    const r = await shareFile(blob);
    if (r === 'error') notify(t('cin.ex.shareFail', 'Não deu para compartilhar. Tente de novo.'), { kind: 'warn' });
  }

  /* ---------------------------- sair ---------------------------- */
  private async close(save: boolean): Promise<void> {
    if (this.done) return;
    this.popBack();
    if (!save && JSON.stringify(this.look) !== this.orig) {
      const { confirm } = await import('../cinema/sheets');
      if (!(await confirm(t('mk.discardQ', 'Sair sem salvar a maquiagem?'), t('mk.discard', 'Sair sem salvar')))) {
        this.popBack = pushBack(() => void this.close(false));
        return;
      }
    }
    this.done = true;
    cancelAnimationFrame(this.raf);
    this.popBack();
    this.root.remove();
    (window as unknown as { __makeup?: unknown }).__makeup = undefined;
    if (!save || JSON.stringify(this.look) === this.orig) return this.resolve(undefined);
    this.resolve(lookIsEmpty(this.look) ? null : cloneLook(this.look));
  }

}
