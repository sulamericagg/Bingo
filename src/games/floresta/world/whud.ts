/* ============================================================
 *  MUNDO ABERTO — HUD e controles de toque.
 *  Disposição no padrão dos jogos de blocos no celular (arte nossa):
 *  - barra de 9 espaços centralizada embaixo (+ mochila no fim), vida à
 *    esquerda e fome à direita logo acima, energia fininha entre elas;
 *  - analógico flutuante embaixo à esquerda; PULAR embaixo à direita,
 *    longe da barra; botões de contexto empilhados acima do pulo;
 *  - topo mínimo: sair + moedas à esquerda, ajustes à direita; objetivo
 *    aparece 3–4 s e vira um ícone que se toca para ver de novo;
 *  - mira no centro (ponto/cruz com contorno escuro) que reage ao alvo,
 *    anel de progresso ao quebrar, marcador de acerto em bichos.
 *  Esquema de toque (padrão "Tocar"): TOCAR no mundo = usar/colocar o item
 *  da mão; SEGURAR no mundo = quebrar (com rachaduras). Opção "Botões":
 *  botões separados Quebrar / Colocar e a mira manda.
 * ============================================================ */
import { t } from '../../../i18n';
import { flIcon } from '../icons';
import { GEAR_SVG, openControls } from '../touchcfg';
import { controls, createJoystick, createLook, onControlsChange, surfaceOf, type Joystick, type LookDrag } from '../../../ui/touch';
import { clearNotify, notify, resetNotifyTop, setNotifyTop } from '../../../ui/notify';

const svg = (body: string, size = 30) => `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
const INK = '#2a0b5c';
export const WICONS = {
  shovel: svg(`<path d="M30 6l12 12-4 4-12-12z" fill="#a8743c" stroke="${INK}" stroke-width="3"/><path d="M26 16L12 30l-4 12 12-4 14-14z" fill="#c8d0e0" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  tnt: svg(`<rect x="8" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><rect x="19" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><rect x="30" y="16" width="9" height="26" rx="3" fill="#ff4f6a" stroke="${INK}" stroke-width="3"/><path d="M24 16C24 10 30 8 34 5" fill="none" stroke="${INK}" stroke-width="3"/><circle cx="36" cy="4" r="3" fill="#ffd34a"/>`),
  up: svg(`<path d="M24 8L42 30H32V40H16V30H6z" fill="#7aff8a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  down: svg(`<path d="M24 40L42 18H32V8H16V18H6z" fill="#ffd34a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  paw: svg(`<ellipse cx="24" cy="31" rx="11" ry="9" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="12" cy="18" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="20" cy="11" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="29" cy="11" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/><circle cx="37" cy="18" r="5" fill="#ffb347" stroke="${INK}" stroke-width="3"/>`),
  solo: svg(`<circle cx="24" cy="15" r="8" fill="#8ad8ff" stroke="${INK}" stroke-width="3"/><path d="M10 42c0-9 6-15 14-15s14 6 14 15z" fill="#8ad8ff" stroke="${INK}" stroke-width="3"/>`),
  arrow: svg(`<path d="M24 4L38 40L24 32L10 40z" fill="#ffd34a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`, 22),
  exitv: svg(`<path d="M20 8H8V40H20" fill="none" stroke="#fff" stroke-width="5"/><path d="M18 24H42M32 14L42 24L32 34" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>`),
  stay: svg(`<rect x="10" y="10" width="28" height="28" rx="6" fill="#ff8aa0" stroke="${INK}" stroke-width="3"/>`),
  pick: svg(`<path d="M8 16C16 6 32 6 40 16" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round"/><path d="M8 16C16 6 32 6 40 16" fill="none" stroke="#c8d0e0" stroke-width="4" stroke-linecap="round"/><path d="M24 10L24 44" stroke="${INK}" stroke-width="8" stroke-linecap="round"/><path d="M24 12L24 42" stroke="#c8904a" stroke-width="3.5" stroke-linecap="round"/>`),
  cube: svg(`<path d="M24 5L42 14V34L24 43L6 34V14z" fill="#8ad84a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M6 14L24 23L42 14M24 23V43" fill="none" stroke="${INK}" stroke-width="3"/><path d="M24 23L42 14V34L24 43z" fill="#6aa83a"/><path d="M6 14L24 23V43L6 34z" fill="#8a6440"/><path d="M24 5L42 14L24 23L6 14z" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`),
  flag: svg(`<path d="M12 6V44" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M13 8H38L32 16L38 24H13z" fill="#ffd34a" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`, 22),
};

export interface WControls {
  /** joystick: x direita, y para baixo (-1..1) */
  mx: number;
  my: number;
  /** pixels de olhar acumulados (o jogo consome) */
  lookDX: number;
  lookDY: number;
  /** modo clássico / dirigir: botão de ação segurado */
  use: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  /** sandbox: segurando para quebrar (dedo parado no mundo, botão Quebrar ou X) */
  brk: boolean;
  /** sandbox: toques de "usar/colocar" pendentes (o jogo consome) */
  taps: number;
}

export type WAct = 'ctl' | 'exit' | 'tool' | 'veh' | 'sell' | 'pets' | 'cmdChop' | 'cmdFetch' | 'cmdFollow' | 'solo' | 'cam' | 'grab' | 'inv' | 'rot' | 'menu';

/* ------------------------------ preferências do mundo ------------------------------ */
export interface WorldPrefs {
  /** 'tap' = tocar coloca / segurar quebra · 'btn' = botões Quebrar e Colocar */
  scheme: 'tap' | 'btn';
  /** tamanho da mira 1..3 */
  xs: number;
  /** estilo da mira */
  xst: 'cross' | 'dot';
}
const PKEY = 'bw-mundo-touch';
export function worldPrefs(): WorldPrefs {
  const d: WorldPrefs = { scheme: 'tap', xs: 2, xst: 'cross' };
  try {
    const o = JSON.parse(localStorage.getItem(PKEY) || '{}');
    if (o.scheme === 'btn' || o.scheme === 'tap') d.scheme = o.scheme;
    if (o.xs >= 1 && o.xs <= 3) d.xs = o.xs | 0;
    if (o.xst === 'dot' || o.xst === 'cross') d.xst = o.xst;
  } catch {
    /* */
  }
  return d;
}
function savePrefs(p: WorldPrefs): void {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
  } catch {
    /* */
  }
}

const CSS = `
.fl-root .fw-hud{position:absolute;inset:0;z-index:5;pointer-events:none;
  --edgeL:max(env(safe-area-inset-left,0px),var(--safe-left,0px),12px);--edgeR:max(env(safe-area-inset-right,0px),var(--safe-right,0px),12px);
  --edgeB:max(var(--safe-bot,env(safe-area-inset-bottom,0px)),8px);--edgeT:max(env(safe-area-inset-top,0px),6px);
  --slot:clamp(30px,min(10.6vh,4.6vw),46px)}
@media (orientation:landscape){.fl-root .fw-hud{--edgeL:max(env(safe-area-inset-left,0px),var(--safe-left,0px),28px);--edgeR:max(env(safe-area-inset-right,0px),var(--safe-right,0px),28px)}}
.fl-root .fw-hud *{box-sizing:border-box}
.fw-hud .hide{display:none!important}
.fw-top{position:absolute;left:var(--edgeL);right:var(--edgeR);top:var(--edgeT);display:flex;gap:5px;align-items:center;pointer-events:none}
.fw-top .fl-pill{min-height:28px;font-size:12.5px;padding:2px 8px 2px 3px;pointer-events:none}
.fw-top .fl-btn.round{width:34px;height:34px;box-shadow:0 3px 0 #2a0b5c}
.fw-top .fl-pill:has(> span:empty){display:none}
.fw-left{display:flex;gap:5px;align-items:center;min-width:0;pointer-events:none}
.fw-right{margin-left:auto;display:flex;gap:5px}
.fw-biome{padding-left:8px!important;font-size:11.5px!important;opacity:.9}
.fw-nav i{display:flex;transition:transform .2s}
.fw-hud.fw-sandbox .fw-biome,.fw-hud.fw-sandbox .fw-nav,.fw-hud.fw-sandbox .fw-carry{display:none}
/* objetivo: abre por alguns segundos e vira um ícone (toque para ver de novo) */
.fw-obj{pointer-events:auto;display:flex;align-items:center;gap:5px;height:30px;border-radius:999px;background:rgba(20,8,48,.62);border:2px solid rgba(255,211,74,.75);color:#fff;font:700 12px/1.15 inherit;padding:0 10px 0 4px;max-width:min(52vw,360px);transition:max-width .3s,padding .3s;overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent}
.fw-obj span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:opacity .2s}
.fw-obj.mini{max-width:30px;padding:0 0 0 2px}
.fw-obj.mini span{opacity:0}
.fw-obj.new{animation:fwPulse .9s 2}
@keyframes fwPulse{50%{box-shadow:0 0 0 4px rgba(255,211,74,.55)}}
/* banner de minijogo do servidor: mesmo comportamento */
.mg-ban.fw-col{cursor:pointer;transition:max-width .3s}
.mg-ban.fw-col.mini{max-width:44px;padding:4px 8px;overflow:hidden}
.mg-ban.fw-col.mini>span{display:none}
.mg-ban.fw-col .fw-colic{display:none}
.mg-ban.fw-col.mini .fw-colic{display:flex}
.fw-cmd{position:absolute;right:var(--edgeR);top:calc(var(--edgeT) + 42px);display:none;flex-direction:column;gap:6px;align-items:stretch;background:rgba(20,8,48,.55);padding:6px;border-radius:14px;max-width:62vw;pointer-events:auto}
.fw-cmd.show{display:flex}
.fw-cmd .fl-btn{min-height:34px;font-size:13px;padding:4px 10px;justify-content:flex-start}
/* grupo de botões: canto inferior direito. PULAR rente ao canto (nunca na barra de itens);
   botões de contexto empilhados ACIMA dele; esquema "Botões": Quebrar acima do pulo, Colocar à esquerda */
.fw-btns{position:absolute;right:var(--edgeR);bottom:var(--edgeB);width:0;height:0;pointer-events:none;--jump:clamp(50px,calc(var(--slot)*1.45),64px)}
.fw-btns>*{position:absolute;pointer-events:auto}
.fw-btns .fl-btn.round{width:50px;height:50px}
.fw-jump{right:0;bottom:0;width:var(--jump)!important;height:var(--jump)!important;background:rgba(255,255,255,.2)!important;border:2.5px solid rgba(255,255,255,.7)!important;box-shadow:0 3px 8px rgba(0,0,0,.25)!important}
.fw-jump.on{background:rgba(255,255,255,.45)!important}
.fw-ctx{right:0;bottom:calc(var(--jump) + 10px);display:flex;flex-direction:column-reverse;align-items:flex-end;gap:6px;pointer-events:none}
.fw-ctx>*{pointer-events:auto;position:static!important}
.fw-ctx .fl-btn{min-height:38px;font-size:12px;padding:3px 11px;white-space:nowrap}
.fw-ctx .fl-btn.round{width:46px;height:46px;min-height:0;padding:0}
.fw-use{right:0;bottom:calc(var(--jump) + 10px);width:78px;height:78px;border-radius:50%;border:none;font:inherit;color:#3a1a00;font-weight:800;font-size:11px;background:radial-gradient(circle at 40% 35%,#fff3a8,#ffb02e 75%);box-shadow:0 4px 0 #8a4a00,0 6px 12px rgba(0,0,0,.3);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;touch-action:none;-webkit-tap-highlight-color:transparent}
.fw-use span{display:flex}
.fw-use.on{transform:translateY(3px);box-shadow:0 1px 0 #8a4a00}
.fw-tool{right:calc(var(--jump) + 10px);bottom:4px}
.fw-up{right:calc(var(--jump) + 10px);bottom:60px}
.fw-down{right:calc(var(--jump) + 10px);bottom:4px}
.fw-grab{flex-direction:column;gap:0}
.fw-grab b{font-size:9px;line-height:1}
/* botões Quebrar / Colocar (esquema "Botões") */
.fw-brk,.fw-put{border-radius:50%;border:2.5px solid rgba(255,255,255,.7);display:flex;flex-direction:column;align-items:center;justify-content:center;font:800 10px/1 inherit;color:#fff;text-shadow:0 1px 0 ${INK};touch-action:none;-webkit-tap-highlight-color:transparent;padding:0;gap:1px}
.fw-brk{right:0;bottom:calc(var(--jump) + 10px);width:var(--jump);height:var(--jump);background:rgba(255,90,110,.6)}
.fw-put{right:calc(var(--jump) + 10px);bottom:0;width:calc(var(--jump) * .9);height:calc(var(--jump) * .9);background:rgba(90,200,120,.6)}
.fw-brk.on,.fw-put.on{filter:brightness(1.3);transform:scale(.94)}
.fw-hud.fw-btnmode .fw-ctx{bottom:calc(var(--jump) * 2 + 20px)}
.fw-hud:not(.fw-btnmode) .fw-brk,.fw-hud:not(.fw-btnmode) .fw-put,.fw-hud:not(.fw-sandbox) .fw-brk,.fw-hud:not(.fw-sandbox) .fw-put{display:none}
/* modo blocos: nada do modo clássico (ferramenta fixa, ajudantes, vender, botão de usar) */
.fw-hud.fw-sandbox .fw-use,.fw-hud.fw-sandbox .fw-tool,.fw-hud.fw-sandbox .fw-up,.fw-hud.fw-sandbox .fw-down,.fw-hud.fw-sandbox .fw-pets,.fw-hud.fw-sandbox .fw-sell,.fw-hud.fw-sandbox .fw-cmd{display:none!important}
.fw-hud:not(.fw-sandbox) .fw-ctx{bottom:calc(var(--jump) + 98px)}
.fw-hud.lefty .fw-btns{right:auto;left:var(--edgeL)}
.fw-hud.lefty .fw-btns>*{right:auto!important;left:0}
.fw-hud.lefty .fw-ctx{align-items:flex-start}
.fw-hud.lefty .fw-tool,.fw-hud.lefty .fw-up,.fw-hud.lefty .fw-down,.fw-hud.lefty .fw-put{left:calc(var(--jump) + 10px)!important}
/* mira */
.fw-xh{position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;--xs:1;--xc:#fff}
.fw-xh i{position:absolute;left:0;top:0;background:var(--xc);border-radius:2px;box-shadow:0 0 0 1.5px rgba(20,8,48,.85);transition:transform .12s,background .12s}
.fw-xh .h{width:calc(16px*var(--xs));height:calc(2.5px*var(--xs));transform:translate(-50%,-50%)}
.fw-xh .v{width:calc(2.5px*var(--xs));height:calc(16px*var(--xs));transform:translate(-50%,-50%)}
.fw-xh .d{width:calc(5px*var(--xs));height:calc(5px*var(--xs));border-radius:50%;transform:translate(-50%,-50%);display:none}
.fw-xh.dot .h,.fw-xh.dot .v{display:none}
.fw-xh.dot .d{display:block}
.fw-xh.tgt{--xc:#ffe68a}
.fw-xh.tgt .h,.fw-xh.tgt .v{transform:translate(-50%,-50%) scale(1.25)}
.fw-xh.tgt .d{transform:translate(-50%,-50%) scale(1.5)}
.fw-xh.mob{--xc:#ff8aa0}
.fw-xh.mob .h{transform:translate(-50%,-50%) rotate(45deg) scale(1.2)}
.fw-xh.mob .v{transform:translate(-50%,-50%) rotate(45deg) scale(1.2)}
.fw-xh svg{position:absolute;left:0;top:0;transform:translate(-50%,-50%) rotate(-90deg);overflow:visible}
.fw-xh svg circle{fill:none;stroke-width:4}
.fw-xh .bg{stroke:rgba(20,8,48,.55)}
.fw-xh .fg{stroke:#fff;stroke-linecap:round}
.fw-xh.hit b{position:absolute;left:0;top:0;width:calc(26px*var(--xs));height:calc(26px*var(--xs));transform:translate(-50%,-50%);animation:fwHit .25s forwards}
.fw-xh b{display:none}
.fw-xh.hit b{display:block}
.fw-xh b::before,.fw-xh b::after{content:'';position:absolute;left:50%;top:50%;width:100%;height:3px;background:#fff;box-shadow:0 0 0 1px rgba(20,8,48,.8);transform:translate(-50%,-50%) rotate(45deg);clip-path:polygon(0 0,32% 0,32% 100%,0 100%,0 0,100% 0,100% 100%,68% 100%,68% 0)}
.fw-xh b::after{transform:translate(-50%,-50%) rotate(-45deg)}
@keyframes fwHit{0%{opacity:1;transform:translate(-50%,-50%) scale(.7)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.25)}}
.fw-opts{display:flex;flex-direction:column;gap:5px;padding:4px 0 8px;border-bottom:1px solid rgba(255,255,255,.2);margin-bottom:4px}
.fw-opts .row{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.fw-opts .row>b{min-width:74px;font-size:12px}
.fw-opts button{font:700 11.5px inherit;color:#fff;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.3);border-radius:9px;padding:4px 8px;cursor:pointer}
.fw-opts button.on{background:#8a5cff;border-color:#ffd34a}
@media (orientation:portrait){
  .fw-cmd{top:calc(var(--edgeT) + 86px)}
  .fl-root .fw-hud{--slot:clamp(30px,8.6vw,42px)}
}
`;

/** dedo no mundo: olhar (arrasto) + tocar (usar/colocar) + segurar (quebrar) */
class TapHold {
  readonly priority = 1;
  pid = -1;
  private x0 = 0;
  private y0 = 0;
  private t0 = 0;
  private moved = false;
  holding = false;
  enabled = true;
  constructor(
    readonly surface: HTMLElement,
    private look: LookDrag,
    private onTap: () => void,
    private tapMode: () => boolean,
  ) {
    surfaceOf(surface).add(this);
  }
  wants(e: PointerEvent): boolean {
    if (!this.enabled || this.pid >= 0) return false;
    if (e.pointerType === 'mouse' && e.button === 2) {
      // mouse: botão direito = usar/colocar
      this.onTap();
      return false;
    }
    return true;
  }
  down(e: PointerEvent, x: number, y: number): void {
    this.pid = e.pointerId;
    this.x0 = x;
    this.y0 = y;
    // hora do evento (não a do processamento): quadro lento não transforma toque em "segurar"
    this.t0 = e.timeStamp || performance.now();
    this.moved = false;
    this.holding = false;
    this.look.down(e, x, y);
  }
  move(e: PointerEvent, x: number, y: number): void {
    if (e.pointerId !== this.pid) return;
    this.look.move(e, x, y);
    if (!this.holding && Math.hypot(x - this.x0, y - this.y0) > 14) this.moved = true;
  }
  up(e: PointerEvent | null): void {
    if (this.pid < 0) return;
    this.look.up(e);
    const quick = (e?.timeStamp || performance.now()) - this.t0 < 320;
    if (e && e.type === 'pointerup' && !this.moved && !this.holding && quick && this.tapMode()) this.onTap();
    this.pid = -1;
    this.holding = false;
  }
  /** chame por quadro: dedo parado ≥ 0,28 s vira "segurar" (continua mesmo se mexer depois) */
  poll(): boolean {
    if (this.pid < 0 || !this.tapMode()) return false;
    if (!this.holding && !this.moved && performance.now() - this.t0 > 280) this.holding = true;
    return this.holding;
  }
  destroy(): void {
    surfaceOf(this.surface).remove(this);
  }
}

export class WorldHud {
  el: HTMLDivElement;
  ctl: WControls = { mx: 0, my: 0, lookDX: 0, lookDY: 0, use: false, up: false, down: false, jump: false, brk: false, taps: 0 };
  onHotkey: ((i: number) => void) | null = null;
  prefs = worldPrefs();
  private q = <T extends HTMLElement>(s: string) => this.el.querySelector(s) as T;
  private offs: (() => void)[] = [];
  private last: Record<string, string> = {};
  keys = new Set<string>();
  /** botão Quebrar segurado (esquema "Botões") */
  private brkBtn = false;
  private xh: HTMLDivElement;
  private ring: SVGCircleElement;
  private objEl: HTMLDivElement;
  private objT = 0;
  /** pilha de botões de contexto acima do PULAR (outros módulos põem botões aqui) */
  ctxEl!: HTMLDivElement;

  constructor(
    private root: HTMLElement,
    private onAct: (a: WAct) => void,
  ) {
    if (!document.getElementById('fw-css')) {
      const s = document.createElement('style');
      s.id = 'fw-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const el = document.createElement('div');
    el.className = 'fw-hud';
    el.innerHTML = `
      <div class="fw-xh"><i class="h"></i><i class="v"></i><i class="d"></i><b></b><svg width="34" height="34" viewBox="0 0 34 34"><circle class="bg" cx="17" cy="17" r="14" style="display:none"/><circle class="fg" cx="17" cy="17" r="14" stroke-dasharray="0 88"/></svg></div>
      <div class="fw-top">
        <div class="fw-left">
        <button class="fl-btn round red" data-tap="exit" aria-label="${t('floresta.exit', 'Sair')}">${flIcon('close', 20)}</button>
        <div class="fl-pill">${flIcon('acorn', 20)}<span data-v="coins">0</span></div>
        <div class="fl-pill fw-carry">${flIcon('log', 20)}<span data-v="carry">0</span></div>
        <div class="fl-pill fw-biome"><span data-v="biome"></span></div>
        <div class="fl-pill fw-nav"><i data-v="arrow">${WICONS.arrow}</i><span data-v="camp"></span></div>
        <div class="fw-obj mini hide" data-touch-ignore="1" role="button">${WICONS.flag}<span data-v="obj"></span></div>
        </div>
        <div class="fw-right">
          <button class="fl-btn round" data-tap="ctl" aria-label="${t('floresta.ctl.title', 'Controles')}">${GEAR_SVG(20)}</button>
          <button class="fl-btn round fw-pets" data-tap="pets" aria-label="${t('floresta.w.pets', 'Ajudantes')}">${WICONS.paw}</button>
        </div>
      </div>
      <div class="fw-cmd">
        <button class="fl-btn green" data-tap="cmdChop">${flIcon('axe', 22)}<span>${t('floresta.w.cmdChop', 'Cortar ali')}</span></button>
        <button class="fl-btn green" data-tap="cmdFetch">${flIcon('log', 22)}<span>${t('floresta.w.cmdFetch', 'Buscar toras')}</span></button>
        <button class="fl-btn" data-tap="cmdFollow"><span data-v="follow">${t('floresta.w.cmdStay', 'Ficar')}</span></button>
        <button class="fl-btn wood" data-tap="solo">${WICONS.solo}<span data-v="solo">${t('floresta.w.solo', 'Jogar sozinho (sem ajudantes)')}</span></button>
      </div>
      <div class="fw-btns">
        <div class="fw-ctx">
          <button class="fl-btn fw-veh hide" data-tap="veh"><span data-v="veh"></span></button>
          <button class="fl-btn gold fw-sell hide" data-tap="sell">${flIcon('sell', 22)}<span>${t('floresta.w.sell', 'Vender')}</span></button>
          <button class="fl-btn round fw-grab hide" data-tap="grab" aria-label="${t('mundo.grab', 'Pegar')}">${flIcon('log', 24)}<b data-v="grab"></b></button>
        </div>
        <button class="fl-btn round fw-tool" data-tap="tool" aria-label="${t('floresta.w.tool', 'Ferramenta')}"><span data-v="tool"></span></button>
        <button class="fl-btn round fw-up hide" data-hold="up">${WICONS.up}</button>
        <button class="fl-btn round fw-down hide" data-hold="down">${WICONS.down}</button>
        <button class="fw-use" data-hold="use"><span data-v="useI"></span><b data-v="use"></b></button>
        <button class="fw-brk" data-hold="brk" aria-label="${t('mundo.break', 'Quebrar')}">${WICONS.pick.replace('width="30" height="30"', 'width="26" height="26"')}<span>${t('mundo.break', 'Quebrar')}</span></button>
        <button class="fw-put" data-put="1" aria-label="${t('mundo.place', 'Colocar')}">${WICONS.cube.replace('width="30" height="30"', 'width="24" height="24"')}<span>${t('mundo.place', 'Colocar')}</span></button>
        <button class="fl-btn round fw-jump" data-hold="jump" aria-label="${t('mundo.jump', 'Pular')}">${WICONS.up}</button>
      </div>`;
    root.appendChild(el);
    this.el = el;
    this.xh = el.querySelector('.fw-xh') as HTMLDivElement;
    this.ring = el.querySelector('.fw-xh .fg') as SVGCircleElement;
    this.objEl = el.querySelector('.fw-obj') as HTMLDivElement;
    this.ctxEl = el.querySelector('.fw-ctx') as HTMLDivElement;
    this.objEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.expandObj(!this.objEl.classList.contains('mini') ? 0 : 4);
    });
    this.bindTouch(root);
    this.bindButtons();
    this.bindKeys();
    this.applyPrefs();
    const top = this.q('.fw-top');
    const setTop = () => setNotifyTop(top.getBoundingClientRect().bottom + 4);
    setTop();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(setTop);
      ro.observe(top);
      this.offs.push(() => ro.disconnect());
    }
  }

  private on<K extends keyof HTMLElementEventMap>(t: EventTarget, ev: K, f: (e: HTMLElementEventMap[K]) => void, opt?: AddEventListenerOptions): void {
    t.addEventListener(ev, f as EventListener, opt);
    this.offs.push(() => t.removeEventListener(ev, f as EventListener, opt));
  }

  private tapHold: TapHold | null = null;
  private bindTouch(root: HTMLElement): void {
    // controles compartilhados (src/ui/touch): analógico flutuante + arrastar para olhar (+ tocar/segurar)
    // analógico em descanso nunca encosta na barra de itens (centralizada embaixo)
    this.joyC = createJoystick(root, {
      zoneTop: 0.18,
      homeMax: () => {
        const hb = root.querySelector('.mi-hot .mi-row9');
        if (!hb || !this.sandbox) return Infinity;
        const r = hb.getBoundingClientRect();
        const rr = root.getBoundingClientRect();
        return controls.lefty ? rr.right - r.right : r.left - rr.left;
      },
    });
    this.lookC = createLook(root, { zone: () => false });
    this.tapHold = new TapHold(
      root,
      this.lookC,
      () => {
        this.ctl.taps++;
      },
      () => this.sandbox && this.prefs.scheme === 'tap',
    );
    // canhoto: analógico à direita, botões espelhados à esquerda
    const lefty = () => this.el.classList.toggle('lefty', controls.lefty);
    lefty();
    this.offs.push(onControlsChange(lefty));
    this.offs.push(() => {
      this.joyC?.destroy();
      this.lookC?.destroy();
      this.tapHold?.destroy();
    });
    this.on(window, 'blur', () => {
      this.ctl.use = this.ctl.up = this.ctl.down = this.ctl.jump = this.ctl.brk = false;
      this.brkBtn = false;
      this.keys.clear();
    });
    this.on(root, 'contextmenu', (e) => e.preventDefault());
  }
  private joyC: Joystick | null = null;
  private lookC: LookDrag | null = null;
  /** modo sandbox (survival.ts liga) */
  sandbox = false;
  /** a barra de itens apareceu/mudou: reposiciona o analógico em descanso */
  relayout(): void {
    this.joyC?.refresh();
  }
  /** liga/desliga o analógico e o olhar deste HUD (veículo com HUD próprio, telas por cima) */
  setControls(on: boolean): void {
    this.joyC?.setEnabled(on);
    this.lookC?.setEnabled(on);
    if (this.tapHold) {
      this.tapHold.enabled = on;
      if (!on) this.tapHold.up(null);
    }
    if (!on) {
      this.ctl.mx = this.ctl.my = 0;
      this.ctl.brk = this.ctl.use = this.ctl.jump = false;
      this.ctl.taps = 0;
    }
  }
  /** chame 1x por quadro: atualiza mx/my e devolve [dYaw, dPitch] (rad) */
  poll(dt: number): [number, number] {
    const j = this.joyC?.read();
    if (j && (j.active || j.mag > 0.001)) {
      this.ctl.mx = j.x;
      this.ctl.my = j.y;
    } else if (!this.keys.size) {
      this.ctl.mx = this.ctl.my = 0;
    }
    this.ctl.brk = this.brkBtn || !!this.tapHold?.poll() || this.keys.has('x') || this.keys.has('enter') || this.mouseBrk;
    const l = this.lookC ? this.lookC.consume(dt) : [0, 0];
    // teclado (setas) somam ao olhar
    const kx = this.ctl.lookDX * 0.0055;
    const ky = this.ctl.lookDY * 0.0055;
    this.ctl.lookDX = this.ctl.lookDY = 0;
    if (this.objT > 0) {
      this.objT -= dt;
      if (this.objT <= 0) this.objEl.classList.add('mini');
    }
    for (const c of this.cols) {
      if (c.t > 0) {
        c.t -= dt;
        if (c.t <= 0) c.el.classList.add('mini');
      }
    }
    return [l[0] + kx, l[1] + ky];
  }
  private mouseBrk = false;
  /** quantos analógicos de toque estão visíveis (depuração: tem que ser ≤ 1) */
  static liveJoysticks(): number {
    return Array.from(document.querySelectorAll<HTMLElement>('.tc-joy')).filter((e) => e.style.display !== 'none' && e.offsetParent !== null).length;
  }

  private bindButtons(): void {
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-tap]'))) {
      let id = -1;
      let x0 = 0;
      let y0 = 0;
      let t0 = 0;
      let moved = false;
      this.on(b, 'pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        id = e.pointerId;
        x0 = e.clientX;
        y0 = e.clientY;
        t0 = performance.now();
        moved = false;
        b.setPointerCapture?.(e.pointerId);
        b.classList.add('on');
      });
      this.on(b, 'pointermove', (e) => {
        if (e.pointerId === id && Math.hypot(e.clientX - x0, e.clientY - y0) > 14) {
          moved = true;
          b.classList.remove('on');
        }
      });
      const end = (e: PointerEvent, ok: boolean) => {
        if (e.pointerId !== id) return;
        id = -1;
        b.classList.remove('on');
        if (!ok || moved || performance.now() - t0 > 900) return;
        const r = b.getBoundingClientRect();
        if (e.clientX < r.left - 6 || e.clientX > r.right + 6 || e.clientY < r.top - 6 || e.clientY > r.bottom + 6) return;
        if (b.dataset.tap === 'ctl') openControls(this.el, undefined, this.sandbox ? this.optsPanel() : undefined);
        else this.onAct(b.dataset.tap as WAct);
      };
      this.on(b, 'pointerup', (e) => end(e, true));
      this.on(b, 'pointercancel', (e) => end(e, false));
      this.on(b, 'click', (e) => e.stopPropagation());
    }
    for (const b of Array.from(this.el.querySelectorAll<HTMLElement>('[data-hold]'))) {
      const k = b.dataset.hold as 'use' | 'up' | 'down' | 'jump' | 'brk';
      let id = -1;
      const set = (v: boolean) => {
        if (k === 'brk') this.brkBtn = v;
        else this.ctl[k] = v;
      };
      this.on(b, 'pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        id = e.pointerId;
        b.setPointerCapture?.(e.pointerId);
        set(true);
        b.classList.add('on');
      });
      const up = (e: PointerEvent) => {
        if (e.pointerId !== id) return;
        id = -1;
        set(false);
        b.classList.remove('on');
      };
      this.on(b, 'pointerup', up);
      this.on(b, 'pointercancel', up);
      this.on(b, 'lostpointercapture', up);
    }
    const put = this.q('[data-put]');
    this.on(put, 'pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      put.classList.add('on');
      this.ctl.taps++;
    });
    const off = () => put.classList.remove('on');
    this.on(put, 'pointerup', off);
    this.on(put, 'pointercancel', off);
    // mouse (computador): segurar o botão esquerdo no mundo = quebrar
    this.on(this.root, 'pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0 && !(e.target as HTMLElement).closest('button,.mi-hot,.fl-ctlpanel,.mi-ov')) this.mouseBrkT = window.setTimeout(() => (this.mouseBrk = true), 250);
    });
    this.on(window, 'pointerup', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(this.mouseBrkT);
      this.mouseBrk = false;
    });
  }
  private mouseBrkT = 0;

  private bindKeys(): void {
    const sync = () => {
      const k = this.keys;
      this.ctl.mx = (k.has('d') ? 1 : 0) - (k.has('a') ? 1 : 0);
      this.ctl.my = (k.has('s') ? 1 : 0) - (k.has('w') ? 1 : 0);
      this.ctl.use = k.has('x') || k.has('enter');
      this.ctl.jump = k.has(' ');
      this.ctl.up = k.has('r');
      this.ctl.down = k.has('f');
    };
    this.on(window, 'keydown', (e) => {
      const k = e.key.toLowerCase();
      if (e.repeat) return;
      if (k === 'e') this.onAct('veh');
      else if (k === 'q') this.onAct('tool');
      else if (k === 'v') this.onAct('sell');
      else if (k === 'g') this.onAct('grab');
      else if (k === 'c') this.ctl.taps++;
      else if (k === 'i' || k === 'tab') {
        e.preventDefault();
        this.onAct('inv');
      } else if (k >= '1' && k <= '9') this.onHotkey?.(+k - 1);
      else if (k === 'arrowleft') this.ctl.lookDX -= 60;
      else if (k === 'arrowright') this.ctl.lookDX += 60;
      else if (k === 'arrowup') this.ctl.lookDY -= 40;
      else if (k === 'arrowdown') this.ctl.lookDY += 40;
      this.keys.add(k);
      sync();
    });
    this.on(window, 'keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
      sync();
    });
  }

  /* ------------------------------ preferências ------------------------------ */
  applyPrefs(): void {
    const p = this.prefs;
    this.el.classList.toggle('fw-btnmode', p.scheme === 'btn');
    this.xh.classList.toggle('dot', p.xst === 'dot');
    this.xh.style.setProperty('--xs', String([0.8, 1, 1.35][p.xs - 1]));
  }
  private optsPanel(): HTMLElement {
    const d = document.createElement('div');
    d.className = 'fw-opts';
    const draw = () => {
      const p = this.prefs;
      const b = (k: string, v: string, lbl: string, on: boolean) => `<button data-k="${k}" data-val="${v}" class="${on ? 'on' : ''}">${lbl}</button>`;
      d.innerHTML = `<div class="row"><b>${t('mundo.opt.scheme', 'Quebrar/colocar')}</b>${b('scheme', 'tap', t('mundo.opt.tap', 'Tocar e segurar'), p.scheme === 'tap')}${b('scheme', 'btn', t('mundo.opt.btn', 'Botões'), p.scheme === 'btn')}</div>
        <div class="row"><b>${t('mundo.opt.xh', 'Mira')}</b>${b('xst', 'cross', t('mundo.opt.cross', 'Cruz'), p.xst === 'cross')}${b('xst', 'dot', t('mundo.opt.dot', 'Ponto'), p.xst === 'dot')}${b('xs', '1', t('mundo.opt.s', 'P'), p.xs === 1)}${b('xs', '2', t('mundo.opt.m', 'M'), p.xs === 2)}${b('xs', '3', t('mundo.opt.l', 'G'), p.xs === 3)}</div>`;
    };
    draw();
    d.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!el?.dataset.k) return;
      const p = this.prefs as unknown as Record<string, unknown>;
      p[el.dataset.k] = el.dataset.k === 'xs' ? +el.dataset.val! : el.dataset.val;
      savePrefs(this.prefs);
      this.applyPrefs();
      draw();
    });
    return d;
  }

  /* ------------------------------ mira ------------------------------ */
  /** estado da mira: '' nada · 'tgt' bloco/objeto · 'mob' bicho; prog 0..1 = anel de quebrar */
  crosshair(state: '' | 'tgt' | 'mob', prog: number): void {
    const k = state + ':' + Math.round(prog * 40);
    if (this.last.xh === k) return;
    this.last.xh = k;
    this.xh.classList.toggle('tgt', state === 'tgt');
    this.xh.classList.toggle('mob', state === 'mob');
    const c = 2 * Math.PI * 14;
    const bg = this.ring.previousElementSibling as SVGCircleElement;
    bg.style.display = prog > 0 ? '' : 'none';
    this.ring.setAttribute('stroke-dasharray', `${(prog * c).toFixed(1)} ${c.toFixed(1)}`);
  }
  crosshairVisible(on: boolean): void {
    this.xh.style.display = on ? '' : 'none';
  }
  /** marcador de acerto (bicho/jogador) */
  hitMark(): void {
    this.xh.classList.remove('hit');
    void this.xh.offsetWidth;
    this.xh.classList.add('hit');
    clearTimeout(this.hitT);
    this.hitT = window.setTimeout(() => this.xh.classList.remove('hit'), 260);
  }
  private hitT = 0;

  /** só mexe no DOM quando muda */
  set(k: string, v: string, html = false): void {
    if (this.last[k] === v) return;
    this.last[k] = v;
    const e = this.q(`[data-v="${k}"]`);
    if (!e) return;
    if (html) e.innerHTML = v;
    else e.textContent = v;
  }
  show(sel: string, on: boolean): void {
    const k = 'show:' + sel;
    const v = on ? '1' : '0';
    if (this.last[k] === v) return;
    this.last[k] = v;
    this.q(sel)?.classList.toggle('hide', !on);
  }
  arrow(rad: number): void {
    const e = this.q('[data-v="arrow"]');
    if (e) e.style.transform = `rotate(${rad}rad)`;
  }
  /** botão de convidar amigos (online) */
  addNet(f: () => void): void {
    const b = document.createElement('button');
    b.className = 'fl-btn round';
    b.style.pointerEvents = 'auto';
    b.setAttribute('aria-label', t('mundo.net.invite', 'Chamar amigos'));
    b.innerHTML = '<svg viewBox="0 0 48 48" width="22" height="22"><circle cx="18" cy="16" r="7" fill="#8ad8ff" stroke="#2a0b5c" stroke-width="3"/><path d="M5 40c0-8 6-13 13-13s13 5 13 13z" fill="#8ad8ff" stroke="#2a0b5c" stroke-width="3"/><path d="M36 14v14M29 21h14" stroke="#7aff8a" stroke-width="5" stroke-linecap="round"/></svg>';
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      f();
    });
    this.q('.fw-right').prepend(b);
  }
  cmdOpen(on?: boolean): boolean {
    const c = this.q('.fw-cmd');
    c.classList.toggle('show', on);
    return c.classList.contains('show');
  }

  toast(msg: string, kind = ''): void {
    notify(msg, { kind: kind === 'gold' || kind === 'biome' ? 'good' : kind === 'warn' ? 'warn' : 'info' });
  }
  /** objetivo atual: aparece aberto por ~3,5 s e vira um ícone (toque abre de novo); null esconde */
  goal(text: string | null): void {
    if (!text) {
      this.objEl.classList.add('hide');
      this.last.obj = '';
      return;
    }
    this.objEl.classList.remove('hide');
    if (this.last.obj === text) return;
    this.set('obj', text);
    this.objEl.setAttribute('aria-label', text);
    this.expandObj(3.6);
    this.objEl.classList.remove('new');
    void this.objEl.offsetWidth;
    this.objEl.classList.add('new');
  }
  private expandObj(sec: number): void {
    if (sec <= 0) {
      this.objT = 0;
      this.objEl.classList.add('mini');
      return;
    }
    this.objEl.classList.remove('mini');
    this.objT = sec;
  }
  private cols: { el: HTMLElement; t: number }[] = [];
  /**
   * Gancho para painéis de outros módulos (ex.: banner de minijogo do servidor): o painel abre
   * por ~3,5 s sempre que o texto muda e depois encolhe para um ícone; tocar abre de novo.
   * Botões dentro dele continuam funcionando.
   */
  collapsible(el: HTMLElement): void {
    const c = { el, t: 3.6 };
    this.cols.push(c);
    el.classList.add('fw-col');
    const ic = document.createElement('i');
    ic.className = 'fw-colic';
    ic.innerHTML = WICONS.flag;
    let lastTxt = '';
    const ensureIc = () => {
      if (!el.contains(ic)) el.prepend(ic);
      const s = el.querySelector(':scope > span')?.textContent ?? '';
      // só o texto (sem o cronômetro) decide se reabre
      const key = s.replace(/\d+\s*s/g, '');
      if (key !== lastTxt) {
        lastTxt = key;
        el.classList.remove('mini');
        c.t = 3.6;
      }
    };
    const mo = new MutationObserver(ensureIc);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    ensureIc();
    el.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (el.classList.contains('mini')) {
        el.classList.remove('mini');
        c.t = 4;
      } else {
        el.classList.add('mini');
        c.t = 0;
      }
    });
    this.offs.push(() => mo.disconnect());
  }

  destroy(): void {
    for (const f of this.offs) f();
    clearNotify();
    resetNotifyTop();
    this.el.remove();
  }
}
