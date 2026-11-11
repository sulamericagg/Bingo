/* ============================================================
 *  DESENHA E VIRA! — painel de desenho (ferramentas, paleta, pincéis,
 *  materiais com palpite automático, extras "veículo"/"voar" e o botão BUM!).
 *  'sheet'   = folha de papel sobre o ateliê 3D
 *  'overlay' = papel transparente por cima do cenário (desafios)
 * ============================================================ */
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { bindButton, type BoundButton } from '../../ui/touch/button';
import { analyze, type Analysis } from './analyze';
import { dvIcon } from './icons';
import { Paper } from './paper';
import { PALETTE, SIZES, type Material, type Tool } from './strokes';

export const MATS: Material[] = ['inflate', 'extrude', 'lathe', 'tube'];
export function matName(m: Material): string {
  return m === 'inflate' ? t('dv.mat.inflate', 'Balão') : m === 'extrude' ? t('dv.mat.extrude', 'Bloco') : m === 'lathe' ? t('dv.mat.lathe', 'Torno') : t('dv.mat.tube', 'Arame');
}
export function matHint(m: Material): string {
  return m === 'inflate'
    ? t('dv.mat.inflate.h', 'Infla como almofada')
    : m === 'extrude'
      ? t('dv.mat.extrude.h', 'Bloco grosso e firme')
      : m === 'lathe'
        ? t('dv.mat.lathe.h', 'Gira o traço: vaso, copo')
        : t('dv.mat.tube.h', 'Traço vira arame');
}

export const MESH_N = [40, 50, 60, 72];

export interface DrawUIOpts {
  mode: 'sheet' | 'overlay';
  w: number;
  h: number;
  k: number;
  tier: number;
  inkMax?: number;
  allowed?: Material[];
  /** desafio de veículo: o desenho sempre vira carrinho */
  vehicleOnly?: boolean;
}

export class DrawUI {
  readonly el: HTMLDivElement;
  readonly paper: Paper;
  private bumBtn: BoundButton | null = null;
  mat: Material = 'inflate';
  manual = false;
  an: Analysis | null = null;
  vehicle = false;
  fly = false;
  private offerVehicle = false;
  private offerFly = false;
  onBum: () => void = () => {};
  onClose: () => void = () => {};
  onChange: () => void = () => {};
  private timer = 0;
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private allowed: Material[];

  constructor(
    host: HTMLElement,
    private o: DrawUIOpts,
  ) {
    this.allowed = o.allowed ?? MATS;
    this.paper = new Paper({ w: o.w, h: o.h, k: o.k, inkMax: o.inkMax });
    this.el = document.createElement('div');
    this.el.className = 'dv-draw dv-' + o.mode;
    this.el.setAttribute('data-touch-ignore', '');
    const tools: [Tool | 'sym', string, string][] = [
      ['pen', 'pen', t('dv.tool.pen', 'Lápis')],
      ['erase', 'eraser', t('dv.tool.erase', 'Borracha')],
      ['fill', 'fill', t('dv.tool.fill', 'Balde')],
      ['sym', 'sym', t('dv.tool.sym', 'Espelho')],
    ];
    const palette = PALETTE.map((c, i) => `<button class="dv-sw${i === 0 ? ' on' : ''}" data-c="${i}" style="--c:${c}" aria-label="${c}"></button>`).join('');
    const sizes = SIZES.map((s, i) => `<button class="dv-sz${i === 1 ? ' on' : ''}" data-s="${i}" aria-label="${s}"><i style="width:${6 + i * 5}px;height:${6 + i * 5}px"></i></button>`).join('');
    const mats = this.allowed.map((m) => `<button class="dv-mat" data-m="${m}">${dvIcon(m, 26)}<b>${matName(m)}</b><small>${matHint(m)}</small><em>${t('dv.auto', 'auto')}</em></button>`).join('');
    this.el.innerHTML = `
      <div class="dv-rail">
        ${tools.map(([id, ic, lb]) => `<button class="dv-tb${id === 'pen' ? ' on' : ''}" data-t="${id}" aria-label="${lb}">${dvIcon(ic, 24)}<span>${lb}</span></button>`).join('')}
        <i class="dv-sep"></i>
        <button class="dv-tb" data-a="undo" aria-label="${t('dv.undo', 'Desfazer')}">${dvIcon('undo', 22)}</button>
        <button class="dv-tb" data-a="redo" aria-label="${t('dv.redo', 'Refazer')}">${dvIcon('redo', 22)}</button>
        <button class="dv-tb" data-a="clear" aria-label="${t('dv.clear', 'Limpar')}">${dvIcon('trash', 22)}</button>
      </div>
      <div class="dv-stage"><div class="dv-tipb" hidden></div><div class="dv-ink" hidden>${dvIcon('ink', 16)}<div class="dv-inkbar"><i></i></div></div></div>
      <div class="dv-side">
        <div class="dv-pal">${palette}</div>
        <div class="dv-sizes">${sizes}</div>
        <div class="dv-mats">${mats}</div>
        <div class="dv-extras">
          <button class="dv-chip" data-x="veh" hidden>${dvIcon('car', 18)}<span>${t('dv.x.vehicle', 'Virar veículo?')}</span></button>
          <button class="dv-chip" data-x="fly" hidden>${dvIcon('wing', 18)}<span>${t('dv.x.fly', 'Fazer voar')}</span></button>
        </div>
        <button class="dv-bum" disabled><span>${t('dv.bum', 'BUM!')}</span></button>
      </div>
      ${o.mode === 'sheet' ? `<button class="dv-x" aria-label="${t('dv.close', 'Fechar')}">${dvIcon('close', 22)}</button>` : ''}
      <div class="dv-finger" hidden></div>`;
    const stage = this.q<HTMLDivElement>('.dv-stage');
    stage.prepend(this.paper.el);
    host.appendChild(this.el);
    this.paper.onChange = () => this.changed();
    this.paper.onInkOut = () => {
      this.el.classList.remove('dv-inkout');
      void this.el.offsetWidth;
      this.el.classList.add('dv-inkout');
      tap('medium');
    };
    this.el.addEventListener('click', this.click);
    this.el.addEventListener('pointerdown', this.pdown);
    this.el.addEventListener('pointerup', this.pup);
    // BUM no toque (pointerdown): o click sintético às vezes some depois de um traço longo
    const bum = this.q<HTMLButtonElement>('.dv-bum');
    this.bumBtn = bindButton(bum, { onPress: () => !bum.disabled && this.onBum(), haptic: 'medium' });
    if (o.inkMax !== undefined && o.inkMax < Infinity) this.q<HTMLDivElement>('.dv-ink').hidden = false;
    this.layout();
    this.changed();
  }

  layout(): void {
    if (this.o.mode !== 'sheet') return;
    // folha quadrada que cabe entre as colunas
    const r = this.el.getBoundingClientRect();
    const land = r.width >= r.height;
    let side: number;
    if (land) side = Math.min(r.height - 20, r.width - 360);
    else {
      // retrato: o papel fica com o que sobra depois das ferramentas (o BUM nunca sai da tela)
      const cs = getComputedStyle(this.el);
      const gap = parseFloat(cs.rowGap) || 8;
      const used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + this.q<HTMLElement>('.dv-rail').offsetHeight + this.q<HTMLElement>('.dv-side').offsetHeight + gap * 2 + 8;
      side = Math.min(r.width - 20, r.height - used);
    }
    this.paper.el.style.width = this.paper.el.style.height = Math.max(180, Math.floor(side)) + 'px';
  }

  // botões respondem ao soltar o dedo (pointerup): o click sintético do toque às vezes some
  // logo depois de um traço longo no papel; o click que vier depois é ignorado
  private downBtn: HTMLButtonElement | null = null;
  private lastUp = 0;
  private pdown = (e: PointerEvent): void => {
    this.downBtn = (e.target as HTMLElement).closest('button');
  };
  private pup = (e: PointerEvent): void => {
    const b = (e.target as HTMLElement).closest('button');
    const d = this.downBtn;
    this.downBtn = null;
    if (!b || b !== d || b.disabled || b.classList.contains('dv-bum')) return;
    this.lastUp = performance.now();
    this.press(b);
  };
  private click = (e: MouseEvent): void => {
    const b = (e.target as HTMLElement).closest('button');
    if (!b || b.classList.contains('dv-bum')) return;
    if (performance.now() - this.lastUp < 700) return;
    this.press(b);
  };
  private press(b: HTMLButtonElement): void {
    tap('light');
    if (b.dataset.t) {
      const id = b.dataset.t;
      if (id === 'sym') {
        this.paper.setSym(!this.paper.sym);
        b.classList.toggle('on', this.paper.sym);
        return;
      }
      this.paper.tool = id as Tool;
      this.el.querySelectorAll('.dv-tb[data-t]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.t === id || ((x as HTMLElement).dataset.t === 'sym' && this.paper.sym)));
      return;
    }
    if (b.dataset.a === 'undo') this.paper.undo();
    else if (b.dataset.a === 'redo') this.paper.redoOne();
    else if (b.dataset.a === 'clear') {
      this.paper.clear();
      this.manual = false;
      this.vehicle = this.fly = false;
    } else if (b.dataset.c) {
      this.paper.color = +b.dataset.c;
      if (this.paper.tool === 'erase') this.selectTool('pen');
      this.el.querySelectorAll('.dv-sw').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.dataset.s) {
      this.paper.size = +b.dataset.s;
      this.el.querySelectorAll('.dv-sz').forEach((x) => x.classList.toggle('on', x === b));
    } else if (b.dataset.m) {
      this.mat = b.dataset.m as Material;
      this.manual = true;
      this.renderMats();
    } else if (b.dataset.x === 'veh') {
      this.vehicle = !this.vehicle;
      if (this.vehicle) this.fly = false;
      this.renderMats();
    } else if (b.dataset.x === 'fly') {
      this.fly = !this.fly;
      if (this.fly) this.vehicle = false;
      this.renderMats();
    } else if (b.classList.contains('dv-x')) this.onClose();
  };

  selectTool(id: Tool): void {
    this.paper.tool = id;
    this.el.querySelectorAll('.dv-tb[data-t]').forEach((x) => {
      const d = (x as HTMLElement).dataset.t;
      x.classList.toggle('on', d === id || (d === 'sym' && this.paper.sym));
    });
  }

  private changed(): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.reanalyze(), 90);
    this.q<HTMLButtonElement>('.dv-bum').disabled = this.paper.empty;
    (this.q<HTMLButtonElement>('[data-a="undo"]')).disabled = !this.paper.canUndo;
    (this.q<HTMLButtonElement>('[data-a="redo"]')).disabled = !this.paper.canRedo;
    const ink = this.q<HTMLDivElement>('.dv-ink');
    if (!ink.hidden) {
      const f = Math.max(0, 1 - this.paper.ink / (this.o.inkMax || 1));
      (ink.querySelector('i') as HTMLElement).style.width = (f * 100).toFixed(1) + '%';
      ink.classList.toggle('low', f < 0.2);
    }
    this.onChange();
  }

  reanalyze(): Analysis | null {
    clearTimeout(this.timer);
    this.an = this.paper.empty ? null : analyze(this.paper.drawing, this.paper.art, this.paper.k, MESH_N[this.o.tier] ?? 56);
    const an = this.an;
    if (!this.manual && an) this.mat = this.allowed.includes(an.auto) ? an.auto : this.allowed.includes('inflate') && an.enclosed > 0.15 ? 'inflate' : this.allowed[0];
    this.offerVehicle = !!an && (an.wheels.length >= 2 || !!this.o.vehicleOnly);
    this.offerFly = !!an && an.wings && !this.o.vehicleOnly && this.o.mode === 'sheet';
    if (!this.offerVehicle) this.vehicle = false;
    if (!this.offerFly) this.fly = false;
    if (this.o.vehicleOnly) this.vehicle = true;
    this.renderMats();
    return an;
  }

  private renderMats(): void {
    const an = this.an;
    this.el.querySelectorAll<HTMLButtonElement>('.dv-mat').forEach((b) => {
      const m = b.dataset.m as Material;
      b.classList.toggle('on', m === this.mat);
      b.classList.toggle('auto', !!an && !this.manual && m === this.mat);
      b.disabled = !an || (m === 'lathe' && !an.lathe) || ((m === 'inflate' || m === 'extrude') && an.area < 6);
    });
    const v = this.q<HTMLButtonElement>('[data-x="veh"]');
    const f = this.q<HTMLButtonElement>('[data-x="fly"]');
    v.hidden = !this.offerVehicle || !!this.o.vehicleOnly;
    f.hidden = !this.offerFly;
    v.classList.toggle('on', this.vehicle);
    f.classList.toggle('on', this.fly);
    this.el.classList.toggle('dv-hasx', !v.hidden || !f.hidden);
  }

  /** dedinho animado indicando o próximo passo do tutorial */
  point(what: 'paper' | 'mat' | 'bum' | null): void {
    const fi = this.q<HTMLDivElement>('.dv-finger');
    this.el.querySelectorAll('.dv-pulse').forEach((x) => x.classList.remove('dv-pulse'));
    if (!what) {
      fi.hidden = true;
      return;
    }
    const target = what === 'paper' ? this.paper.el : what === 'mat' ? this.q<HTMLElement>('.dv-mats') : this.q<HTMLElement>('.dv-bum');
    target.classList.add('dv-pulse');
    fi.hidden = false;
    fi.className = 'dv-finger dv-f-' + what;
    const r = target.getBoundingClientRect();
    const R = this.el.getBoundingClientRect();
    fi.style.left = r.left - R.left + r.width * (what === 'paper' ? 0.42 : 0.5) + 'px';
    fi.style.top = r.top - R.top + r.height * (what === 'paper' ? 0.42 : 0.6) + 'px';
  }

  /** balão de dica do tutorial (em cima do papel) */
  tip(text: string | null): void {
    const b = this.q<HTMLDivElement>('.dv-tipb');
    b.hidden = !text;
    if (text) {
      b.textContent = text;
      b.classList.remove('pop');
      void b.offsetWidth;
      b.classList.add('pop');
    }
  }

  show(on: boolean): void {
    this.el.classList.toggle('dv-hide', !on);
    this.paper.enabled = on;
    if (on) requestAnimationFrame(() => this.layout());
  }

  destroy(): void {
    this.bumBtn?.destroy();
    clearTimeout(this.timer);
    this.el.remove();
  }
}
