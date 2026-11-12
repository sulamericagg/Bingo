/* ============================================================
 *  CINE — base compartilhada das ABERTURAS dos jogos (docs/INTROS.md).
 *
 *   const c = new Cine({ id: 'jangada', root, duration: 40, subs, title, music });
 *   const st = c.stage3d(tier);              // renderizador + cena + câmera (opcional; 2D usa c.canvas2d())
 *   c.onFrame = (t, dt) => { ...anima...; st.render(); };
 *   c.onDispose = () => { ...libera o que criou... };
 *   await c.play();                          // resolve ao acabar OU ao Pular / botão voltar
 *
 *  Cuida de: barras de cinema (entram/saem), vinheta de cor, legendas com ícones na hora
 *  certa (+ narração por speak(), que respeita a configuração de narração), título com brilho,
 *  clarões, fade de entrada/saída, botão "Pular" sempre visível, botão voltar do aparelho
 *  (pushBack) = pular, tema musical próprio (devolve o tema anterior no fim), ?debug:
 *  window.__cine = { seek(t), skip(), time } para testes.
 *  Tudo é liberado no fim: renderizador (forceContextLoss), geometrias, materiais e texturas.
 * ============================================================ */
import './cine.css';
import * as THREE from 'three';
import { t } from '../../i18n';
import { pushBack } from '../../core/back';
import { music } from '../../audio';
import { THEMES } from '../../audio/music/themes';
import type { StingId, Theme } from '../../audio/music/player';
import { hush, speak } from '../../games/voo/voice';
import { markIntroSeen } from './gate';

export interface CineSub {
  /** instante (s) em que a legenda entra (fica até a próxima ou até `end`) */
  t: number;
  /** some neste instante (opcional) */
  end?: number;
  /** HTML dos ícones (SVG do próprio jogo) */
  icons?: string[];
  text: () => string;
  /** não narrar esta legenda */
  mute?: boolean;
}
export interface CineTitle {
  text: () => string;
  /** frase pequena embaixo do título */
  tagline?: () => string;
  at: number;
  /** cores do degradê do título (claro, meio, escuro) + contorno */
  colors?: [string, string, string, string];
  /** posição vertical (CSS top) */
  top?: string;
  /** vinheta musical quando o título aparece */
  sting?: StingId | null;
}
export interface CineOpts {
  /** id do jogo (marca de "já viu" e testes) */
  id: string;
  /** onde montar (ocupa o elemento inteiro, por cima de tudo do jogo) */
  root: HTMLElement;
  duration: number;
  subs?: CineSub[];
  title?: CineTitle;
  /** tema de música da abertura (registre com registerTheme) */
  music?: string;
  /** cor da vinheta das bordas (rgba) */
  vignette?: string;
  /** filtro CSS no canvas (gradação de cor) */
  grade?: string;
  /** fundo dos círculos dos ícones */
  iconBg?: string;
}

const SKIP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5l9 7-9 7zM13 5l9 7-9 7z" fill="#fff"/></svg>';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let current: Cine | null = null;
/** botão voltar / sair do jogo durante uma abertura: pula a que estiver tocando */
export function skipCurrentIntro(): boolean {
  if (!current) return false;
  current.skip();
  return true;
}
export function introPlaying(): boolean {
  return !!current;
}

/** registra um tema musical (sem mexer em themes.ts — evita conflito entre jogos) */
export function registerTheme(th: Theme): void {
  if (!THEMES[th.id]) THEMES[th.id] = th;
}

/* ------------------------------ palco 3D ------------------------------ */
export interface Stage3D {
  r: THREE.WebGLRenderer;
  scene: THREE.Scene;
  cam: THREE.PerspectiveCamera;
  /** fov para paisagem (retrato abre mais) */
  fov: number;
  render(): void;
  /** tamanho atual (CSS px) */
  w: number;
  h: number;
}
export interface Canvas2D {
  cv: HTMLCanvasElement;
  x: CanvasRenderingContext2D;
  /** tamanho (CSS px) e escala */
  w: number;
  h: number;
  dpr: number;
}

export class Cine {
  readonly o: CineOpts;
  readonly el: HTMLDivElement;
  /** camada livre para DOM do jogo (livro, polaroide...), entre a imagem e as legendas */
  readonly layer: HTMLDivElement;
  time = 0;
  onFrame: (t: number, dt: number) => void = () => {};
  onDispose: () => void = () => {};
  private raf = 0;
  private last = 0;
  private ended = false;
  private done: () => void = () => {};
  private subI = -1;
  private titleOn = false;
  private popBack: (() => void) | null = null;
  private prevTheme: string | null = null;
  private st: Stage3D | null = null;
  private c2: Canvas2D | null = null;
  private flashK = 0;
  private flashCol = '#fff';
  private subEl: HTMLElement;
  private flashEl: HTMLElement;
  private fadeEl: HTMLElement;
  private titleEl: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;

  constructor(o: CineOpts) {
    this.o = o;
    const el = document.createElement('div');
    el.className = 'cine-root';
    el.dataset.cine = o.id;
    if (o.vignette) el.style.setProperty('--cine-vig', o.vignette);
    if (o.iconBg) el.style.setProperty('--cine-icbg', o.iconBg);
    const ti = o.title;
    const tt = ti ? esc(ti.text()) : '';
    el.innerHTML = `<div class="cine-layer"></div><div class="cine-flash"></div><div class="cine-vig"></div>
      <div class="cine-bar t"></div><div class="cine-bar b"></div>
      ${ti ? `<div class="cine-title"><b data-t="${tt}">${tt}</b>${ti.tagline ? `<small>${esc(ti.tagline())}</small>` : ''}<i></i></div>` : ''}
      <div class="cine-sub"><span class="cine-ic"></span><span class="cine-tx"></span></div>
      <div class="cine-fade"></div>
      <button class="cine-skip" data-touch-ignore>${esc(t('cine.skip', 'Pular'))}${SKIP_SVG}</button>`;
    this.el = el;
    this.layer = el.querySelector('.cine-layer') as HTMLDivElement;
    this.subEl = el.querySelector('.cine-sub') as HTMLElement;
    this.flashEl = el.querySelector('.cine-flash') as HTMLElement;
    this.fadeEl = el.querySelector('.cine-fade') as HTMLElement;
    this.titleEl = el.querySelector('.cine-title');
    if (ti && this.titleEl) {
      const [a, b, c, d] = ti.colors ?? ['#fff6c0', '#ffd84a', '#e89a10', '#7a3a10'];
      const s = this.titleEl.style;
      s.setProperty('--ct-a', a);
      s.setProperty('--ct-b', b);
      s.setProperty('--ct-c', c);
      s.setProperty('--ct-edge', d);
      if (ti.top) s.setProperty('--cine-ty', ti.top);
    }
    el.querySelector('.cine-skip')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.skip();
    });
    // nada passa para o jogo por baixo
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'wheel']) el.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
    o.root.appendChild(el);
  }

  /** renderizador + cena + câmera, já dentro da abertura; liberado no fim */
  stage3d(tier: number, o: { fov?: number; far?: number; near?: number; shadows?: boolean } = {}): Stage3D {
    const cv = document.createElement('canvas');
    cv.className = 'cine-cv';
    if (this.o.grade) cv.style.filter = this.o.grade;
    this.el.insertBefore(cv, this.el.firstChild);
    const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2, powerPreference: 'high-performance', stencil: false });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, [0.75, 0.9, 1.1, 1.5][tier] ?? 1));
    if (o.shadows && tier >= 2) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    const scene = new THREE.Scene();
    const fov = o.fov ?? 50;
    const cam = new THREE.PerspectiveCamera(fov, 1, o.near ?? 0.1, o.far ?? 1500);
    const st: Stage3D = {
      r,
      scene,
      cam,
      fov,
      w: 1,
      h: 1,
      render: () => r.render(scene, cam),
    };
    this.st = st;
    this.resize();
    return st;
  }
  /** canvas 2D nítido (dpr), liberado no fim */
  canvas2d(): Canvas2D {
    const cv = document.createElement('canvas');
    cv.className = 'cine-cv';
    if (this.o.grade) cv.style.filter = this.o.grade;
    this.el.insertBefore(cv, this.el.firstChild);
    this.c2 = { cv, x: cv.getContext('2d', { alpha: false })!, w: 1, h: 1, dpr: 1 };
    this.resize();
    return this.c2;
  }
  private resize(): void {
    const W = this.el.clientWidth || this.o.root.clientWidth || window.innerWidth || 1;
    const H = this.el.clientHeight || this.o.root.clientHeight || window.innerHeight || 1;
    const st = this.st;
    if (st && (st.w !== W || st.h !== H)) {
      st.w = W;
      st.h = H;
      st.r.setSize(W, H, false);
      st.cam.aspect = W / H;
      // retrato: abre o campo de visão para caber a cena
      st.cam.fov = W / H < 1.2 ? Math.min(80, st.fov * 1.35) : st.fov;
      st.cam.updateProjectionMatrix();
    }
    const c = this.c2;
    if (c) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.w !== W || c.h !== H || c.dpr !== dpr) {
        c.w = W;
        c.h = H;
        c.dpr = dpr;
        c.cv.width = Math.round(W * dpr);
        c.cv.height = Math.round(H * dpr);
      }
    }
  }

  /** clarão (0..1) desta imagem; some sozinho */
  flash(k: number, color = '#fff'): void {
    if (k > this.flashK) {
      this.flashK = k;
      this.flashCol = color;
    }
  }
  /** escurece tudo (transições entre cenas) */
  fade(on: boolean): void {
    this.fadeEl.classList.toggle('off', !on);
  }
  /** troca a cor da vinheta (ex.: noite → amanhecer) */
  vignette(rgba: string): void {
    this.el.style.setProperty('--cine-vig', rgba);
  }

  play(): Promise<void> {
    current = this;
    this.prevTheme = music.theme;
    if (this.o.music) music.play(this.o.music, 1.2);
    this.popBack = pushBack(() => {
      this.popBack = null;
      this.skip();
    });
    if (location.search.includes('debug'))
      (window as unknown as { __cine: unknown }).__cine = {
        id: this.o.id,
        seek: (v: number) => (this.time = v),
        skip: () => this.skip(),
        get time() {
          return current?.time ?? -1;
        },
        get playing() {
          return !!current;
        },
      };
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.el);
    }
    return new Promise((res) => {
      this.done = res;
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
      window.setTimeout(() => {
        if (!this.ended) {
          this.fadeEl.classList.add('off');
          this.el.classList.add('bars');
        }
      }, 60);
    });
  }

  private loop = (now: number): void => {
    if (this.ended) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.resize();
    try {
      this.onFrame(this.time, dt);
    } catch (e) {
      console.warn('[cine]', e);
      this.finish();
      return;
    }
    this.overlays(dt);
    if (this.time >= this.o.duration) this.finish();
  };

  private overlays(dt: number): void {
    const tt = this.time;
    const subs = this.o.subs ?? [];
    let si = -1;
    for (let i = 0; i < subs.length; i++) if (tt >= subs[i].t && (subs[i].end === undefined || tt < subs[i].end!)) si = i;
    if (si !== this.subI) {
      this.subI = si;
      const el = this.subEl;
      if (si >= 0) {
        const s = subs[si];
        const tx = s.text();
        const ic = s.icons ?? [];
        (el.querySelector('.cine-ic') as HTMLElement).innerHTML = ic.map((h) => `<span>${h}</span>`).join('');
        el.classList.toggle('noic', !ic.length);
        (el.querySelector('.cine-tx') as HTMLElement).textContent = tx;
        el.classList.remove('on');
        void el.offsetWidth;
        el.classList.add('on');
        if (!s.mute) speak(tx, { urgent: true });
      } else el.classList.remove('on');
    }
    const ti = this.o.title;
    if (ti && this.titleEl) {
      const on = tt >= ti.at;
      if (on !== this.titleOn) {
        this.titleOn = on;
        this.titleEl.classList.toggle('on', on);
        if (on && ti.sting !== null) music.sting(ti.sting ?? 'title');
      }
    }
    // clarão decai rápido
    if (this.flashK > 0.002) {
      this.flashEl.style.background = this.flashCol;
      this.flashEl.style.opacity = this.flashK.toFixed(3);
      this.flashK *= Math.exp(-dt * 7);
    } else if (this.flashEl.style.opacity !== '0') this.flashEl.style.opacity = '0';
    // fade final
    if (tt > this.o.duration - 0.9) this.fadeEl.classList.remove('off');
  }

  skip(): void {
    this.finish();
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.ro?.disconnect();
    this.popBack?.();
    this.popBack = null;
    hush();
    markIntroSeen(this.o.id);
    try {
      this.onDispose();
    } catch (e) {
      console.warn('[cine] dispose', e);
    }
    const st = this.st;
    if (st) {
      disposeTree(st.scene);
      st.r.dispose();
      st.r.forceContextLoss();
      this.st = null;
    }
    this.c2 = null;
    this.el.classList.remove('bars');
    this.el.classList.add('out');
    window.setTimeout(() => this.el.remove(), 480);
    if (this.o.music) music.play(this.prevTheme, 1.2);
    if (current === this) current = null;
    this.done();
  }
}

/** libera geometrias, materiais e texturas de uma árvore (pula o que já foi liberado) */
export function disposeTree(root: THREE.Object3D): void {
  const mats = new Set<THREE.Material>();
  const geos = new Set<THREE.BufferGeometry>();
  root.traverse((ob) => {
    const m = ob as THREE.Mesh;
    if (m.geometry) geos.add(m.geometry);
    const mm = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mm)) mm.forEach((x) => mats.add(x));
    else if (mm) mats.add(mm);
  });
  for (const g of geos) g.dispose();
  for (const m of mats) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    const u = (m as THREE.ShaderMaterial).uniforms;
    if (u) for (const k in u) if (u[k]?.value instanceof THREE.Texture) (u[k].value as THREE.Texture).dispose();
    m.dispose();
  }
}

/** textura de brilho redondo (halos, faíscas, olhos no escuro) */
export function glowTex(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
