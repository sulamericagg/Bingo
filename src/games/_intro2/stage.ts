/* ============================================================
 *  ABERTURAS (lote 2) — palco 2D de cinema (mesma linguagem da abertura do Garimpo):
 *  barras de cinema, gradação de cor, legendas com ícones (+ narração só se ligada), título com
 *  brilho, "Pular" sempre visível, voltar = pular, música do tema do jogo e vinheta no título.
 *
 *  Tudo procedural num <canvas> 2D. Coordenadas da cena: origem no centro da tela, 1 unidade =
 *  1% do lado MENOR (a "área segura" é o quadrado [-50,50]²; desenhe fundos até ±120 para cobrir
 *  telas deitadas ou em pé). Qualidade: `st.q` (0,3..1) escala partículas; DPR limitado pelo nível.
 * ============================================================ */
import { t } from '../../i18n';
import { music } from '../../audio';
import { sfx } from '../../3d/common/sfx';
import { hush, speak } from '../voo/voice';
import { pushBack } from '../../core/back';
import { detectInitialTier } from '../../core/quality';
import { icon, type IconName } from '../../ui/icons';

export interface Sub {
  t: number;
  icons: IconName[];
  text: () => string;
}
export interface Cue {
  t: number;
  fn: () => void;
}
export interface FilmSpec {
  /** id (debug) */
  id: string;
  /** duração total (s) */
  dur: number;
  /** tema de música (src/audio/music/themes.ts); null = mantém o atual */
  music?: string | null;
  subs: Sub[];
  cues?: Cue[];
  /** título grande */
  title: () => string;
  /** frase pequena embaixo do título */
  tagline?: () => string;
  titleAt: number;
  /** cores do título: [claro, médio, escuro, contorno] */
  titleCols?: [string, string, string, string];
  /** gradação por cima do canvas (CSS background) */
  grade?: string;
  /** filtro CSS no canvas (ex.: 'saturate(1.15)') */
  filter?: string;
  /** cor do fundo (antes do 1º quadro) */
  bg?: string;
  /** a cena: desenha um quadro no instante `tt` */
  draw(st: Stage, tt: number, dt: number): void;
}

const CSS = `
.i2-root{position:absolute;inset:0;z-index:95;overflow:hidden;pointer-events:auto;touch-action:none;font-family:var(--font,'Fredoka',system-ui,sans-serif);transition:opacity .5s;user-select:none;-webkit-user-select:none}
.i2-root.out{opacity:0}
.i2-root>canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.i2-grade{position:absolute;inset:0;pointer-events:none}
.i2-vig{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 46%,rgba(0,0,0,0) 55%,rgba(20,6,30,.38) 100%)}
.i2-bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .9s cubic-bezier(.3,.8,.3,1);pointer-events:none}
.i2-root.bars .i2-bar{height:8.5%}
.i2-bar.t{top:0}.i2-bar.b{bottom:0}
.i2-sub{position:absolute;left:50%;bottom:calc(8.5% + 8px + var(--safe-bot,0px));transform:translate(-50%,8px);display:flex;align-items:center;gap:10px;width:max-content;max-width:min(760px,92%);padding:5px 16px 5px 7px;border-radius:22px;background:rgba(24,10,40,.62);color:#fff;font-weight:700;font-size:clamp(14px,1.6vw + 7px,20px);line-height:1.2;text-shadow:0 2px 3px rgba(0,0,0,.7);opacity:0;transition:opacity .45s,transform .45s;pointer-events:none}
.i2-sub.on{opacity:1;transform:translate(-50%,0)}
.i2-ic{display:flex;gap:4px;flex:0 0 auto}
.i2-ic svg{width:32px;height:32px;padding:3px;border-radius:50%;background:#fff6d8;box-sizing:border-box}
.i2-title{position:absolute;left:0;right:0;top:calc(8.5% + 50px);display:flex;flex-direction:column;align-items:center;gap:2px;opacity:0;transform:scale(.7);transition:opacity .7s,transform 1.2s cubic-bezier(.2,1.5,.4,1);pointer-events:none;text-align:center;padding:0 12px}
.i2-title.on{opacity:1;transform:scale(1)}
.i2-title b{position:relative;display:block;font-weight:800;font-size:clamp(32px,7.5vmax,86px);line-height:1.02;letter-spacing:.03em;color:var(--i2-c1);background:linear-gradient(180deg,var(--i2-c0) 0%,var(--i2-c1) 48%,var(--i2-c2) 74%,var(--i2-c1) 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;filter:drop-shadow(0 4px 0 var(--i2-c3)) drop-shadow(0 9px 14px rgba(0,0,0,.5))}
.i2-title.long b{font-size:clamp(26px,5.4vmax,66px)}
.i2-title b::after{content:attr(data-t);position:absolute;inset:0;background:linear-gradient(110deg,transparent 40%,rgba(255,255,255,.95) 50%,transparent 60%);background-size:250% 100%;background-position:130% 0;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.i2-title.on b::after{animation:i2-glint 2.2s .5s ease-in-out 2}
@keyframes i2-glint{to{background-position:-30% 0}}
.i2-title small{display:block;font-weight:700;font-size:clamp(13px,1.4vmax + 6px,22px);color:#fff;text-shadow:0 2px 0 var(--i2-c3),0 3px 8px rgba(0,0,0,.6);opacity:0;transform:translateY(6px);transition:opacity .6s .9s,transform .6s .9s}
.i2-title.on small{opacity:1;transform:none}
.i2-title i{position:absolute;left:66%;top:-6%;width:34px;height:34px;opacity:0;background:radial-gradient(circle,#fff 0 12%,rgba(255,255,255,0) 13%),conic-gradient(from 0deg,transparent 0 40deg,#fff 45deg,transparent 50deg 130deg,#fff 135deg,transparent 140deg 220deg,#fff 225deg,transparent 230deg 310deg,#fff 315deg,transparent 320deg);border-radius:50%}
.i2-title.on i{animation:i2-star 2.2s 1s ease-out 2}
@keyframes i2-star{0%{opacity:0;transform:scale(.2) rotate(0)}30%{opacity:1;transform:scale(1.3) rotate(60deg)}100%{opacity:0;transform:scale(.4) rotate(140deg)}}
.i2-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.i2-fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .8s;pointer-events:none}
.i2-fade.on{opacity:1}
.i2-skip{position:absolute;right:calc(var(--edge-r,10px) + 6px);top:calc(8.5% + 8px + var(--safe-top,0px));display:flex;align-items:center;gap:6px;min-height:44px;padding:6px 14px;border-radius:22px;border:2px solid rgba(255,255,255,.75);background:rgba(24,10,40,.55);color:#fff;font:700 15px var(--font,'Fredoka',sans-serif);cursor:pointer;z-index:2}
.i2-skip:active{transform:scale(.95)}
.i2-skip svg{width:18px;height:18px}
@media (orientation:portrait){.i2-title{top:12%}.i2-root.bars .i2-bar{height:6%}.i2-sub{bottom:calc(6% + 10px + var(--safe-bot,0px))}.i2-skip{top:calc(6% + 8px + var(--safe-top,0px))}}
`;
let styled = false;

const SKIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l9 7-9 7zM13 5l9 7-9 7z" fill="#fff"/></svg>';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export class Stage {
  readonly x: CanvasRenderingContext2D;
  readonly el: HTMLDivElement;
  readonly cv: HTMLCanvasElement;
  readonly tier: number;
  /** escala de partículas pelo nível (0,3..1) */
  readonly q: number;
  /** tamanho em px CSS */
  W = 1;
  H = 1;
  /** px por unidade da cena (1% do lado menor) */
  u = 1;
  /** metade da área visível em unidades da cena */
  hw = 50;
  hh = 50;
  /** retrato (em pé) */
  tall = false;
  private dpr = 1;
  private spec: FilmSpec;
  private raf = 0;
  private last = 0;
  time = 0;
  /** testes: congela o tempo (seek desenha um quadro) */
  hold = false;
  private ended = false;
  private done: () => void = () => {};
  private subI = -1;
  private cueI = 0;
  private titled = false;
  private popBack: () => void = () => {};
  private prevTheme: string | null;
  private flashK = 0;
  private ro: ResizeObserver | null = null;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.finish();
    }
  };

  constructor(parent: HTMLElement, spec: FilmSpec) {
    if (!styled) {
      styled = true;
      const s = document.createElement('style');
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.spec = spec;
    this.tier = detectInitialTier();
    this.q = [0.35, 0.55, 0.8, 1][this.tier] ?? 0.8;
    this.prevTheme = music.theme;
    const el = document.createElement('div');
    el.className = 'i2-root';
    el.dataset.intro = spec.id;
    el.style.background = spec.bg ?? '#000';
    const tc = spec.titleCols ?? ['#fff6c0', '#ffd84a', '#e89a10', '#7a3a10'];
    tc.forEach((c, i) => el.style.setProperty(`--i2-c${i}`, c));
    const title = esc(spec.title().toUpperCase());
    el.innerHTML = `<canvas></canvas><div class="i2-grade"></div><div class="i2-vig"></div>
      <div class="i2-title${title.length > 14 ? ' long' : ''}"><b data-t="${title}">${title}</b>${spec.tagline ? `<small>${esc(spec.tagline())}</small>` : ''}<i></i></div>
      <div class="i2-bar t"></div><div class="i2-bar b"></div>
      <div class="i2-sub"><span class="i2-ic"></span><span class="i2-tx"></span></div>
      <div class="i2-flash"></div><div class="i2-fade on"></div>
      <button class="i2-skip" data-touch-ignore>${esc(t('intro2.skip', 'Pular'))}${SKIP_SVG}</button>`;
    if (spec.grade) (el.querySelector('.i2-grade') as HTMLElement).style.background = spec.grade;
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    if (spec.filter) this.cv.style.filter = spec.filter;
    this.x = this.cv.getContext('2d', { alpha: false })!;
    // a posição do pai (o jogo) precisa conter o absolute
    if (parent === document.body) el.style.position = 'fixed';
    parent.appendChild(el);
    el.querySelector('.i2-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      sfx.click();
      this.finish();
    });
    // toques não vazam para o jogo por baixo
    for (const ev of ['pointerdown', 'pointerup', 'touchstart', 'click', 'wheel'])
      el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    this.popBack = pushBack(() => this.finish());
    window.addEventListener('keydown', this.onKey, true);
    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(el);
    }
    if (typeof navigator !== 'undefined' && (navigator.webdriver || location.search.includes('debug')))
      (window as unknown as { __intro2: Stage }).__intro2 = this;
  }

  private resize(): void {
    const W = this.el.clientWidth || 1;
    const H = this.el.clientHeight || 1;
    const cap = [1, 1.25, 1.6, 2][this.tier] ?? 1.5;
    this.dpr = Math.min(cap, window.devicePixelRatio || 1);
    this.W = W;
    this.H = H;
    this.u = Math.min(W, H) / 100;
    this.hw = W / 2 / this.u;
    this.hh = H / 2 / this.u;
    this.tall = H > W * 1.05;
    this.cv.width = Math.max(1, Math.round(W * this.dpr));
    this.cv.height = Math.max(1, Math.round(H * this.dpr));
  }

  run(): Promise<void> {
    return new Promise((res) => {
      this.done = res;
      if (this.spec.music) music.play(this.spec.music, 1.2);
      this.last = performance.now();
      this.render(0);
      this.raf = requestAnimationFrame(this.loop);
      window.setTimeout(() => {
        this.el.querySelector('.i2-fade')?.classList.remove('on');
        this.el.classList.add('bars');
      }, 50);
    });
  }

  /** testes: vai para um instante e desenha */
  seek(tt: number): void {
    this.time = tt;
    this.subI = -1;
    this.cueI = this.spec.cues?.findIndex((c) => c.t > tt) ?? 0;
    if (this.cueI < 0) this.cueI = this.spec.cues?.length ?? 0;
    this.titled = tt >= this.spec.titleAt;
    this.render(0);
  }

  private loop = (now: number): void => {
    if (this.ended) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.hold) return;
    this.time += dt;
    this.render(dt);
    if (this.time >= this.spec.dur) this.finish();
  };

  /** clarão branco (0..1) — a cena pode pedir num instante */
  flash(k: number): void {
    this.flashK = Math.max(this.flashK, k);
  }

  private render(dt: number): void {
    const sp = this.spec;
    const tt = this.time;
    const x = this.x;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.save();
    x.translate(this.W / 2, this.H / 2);
    x.scale(this.u, this.u);
    try {
      sp.draw(this, tt, dt);
    } catch (e) {
      console.warn('[intro2] quadro', sp.id, e);
      x.restore();
      this.finish();
      return;
    }
    x.restore();
    // pistas de som
    const cues = sp.cues ?? [];
    while (this.cueI < cues.length && tt >= cues[this.cueI].t) {
      if (dt > 0) {
        try {
          cues[this.cueI].fn();
        } catch {
          /* som */
        }
      }
      this.cueI++;
    }
    // legendas
    let si = -1;
    for (let i = 0; i < sp.subs.length; i++) if (tt >= sp.subs[i].t) si = i;
    if (si !== this.subI) {
      this.subI = si;
      const sub = this.el.querySelector('.i2-sub') as HTMLElement;
      if (si >= 0) {
        const s = sp.subs[si];
        const tx = s.text();
        (sub.querySelector('.i2-ic') as HTMLElement).innerHTML = s.icons.map((k) => icon(k)).join('');
        (sub.querySelector('.i2-tx') as HTMLElement).textContent = tx;
        sub.classList.remove('on');
        void sub.offsetWidth;
        sub.classList.add('on');
        if (dt > 0) speak(tx, { urgent: true });
      } else sub.classList.remove('on');
    }
    const ti = tt >= sp.titleAt;
    this.el.querySelector('.i2-title')!.classList.toggle('on', ti);
    if (ti && !this.titled) {
      this.titled = true;
      if (dt > 0) {
        music.sting('title');
        music.setState('victory');
        sfx.sparkle();
      }
    }
    // clarão e fade final
    const fl = this.el.querySelector('.i2-flash') as HTMLElement;
    fl.style.opacity = (this.flashK * this.flashK).toFixed(3);
    this.flashK = Math.max(0, this.flashK - dt * 2.2);
    this.el.querySelector('.i2-fade')!.classList.toggle('on', tt > sp.dur - 0.8);
  }

  finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    hush();
    this.popBack();
    window.removeEventListener('keydown', this.onKey, true);
    this.ro?.disconnect();
    music.setState('calm');
    if (this.spec.music && this.prevTheme !== this.spec.music) music.play(this.prevTheme, 1);
    const w = window as unknown as { __intro2?: Stage };
    if (w.__intro2 === this) delete w.__intro2;
    this.el.classList.add('out');
    const el = this.el;
    window.setTimeout(() => {
      el.remove();
      this.cv.width = this.cv.height = 1;
    }, 480);
    this.done();
  }
}

/** toca um filme sobre `parent` (resolve ao terminar ou pular) */
export function playFilm(parent: HTMLElement, spec: FilmSpec): Promise<void> {
  return new Stage(parent, spec).run();
}
