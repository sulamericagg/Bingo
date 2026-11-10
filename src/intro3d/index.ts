/* ============================================================
 *  INTRO 3D DOS JOGOS (módulo carregado sob demanda pelo hub)
 *
 *  playIntro(el, opts): toca a cena do jogo (4–6 s; versão curta 1,5 s nas
 *  próximas vezes), termina no cartão de título com as cores do jogo e
 *  dissolve (íris) revelando o jogo por baixo. Toque = pular.
 *  Nível Mínimo ou WebGL indisponível → cartão 2D animado (sem 3D).
 *  Orçamento: ≤ 60 chamadas de desenho e ≤ 120k triângulos por cena no Alto.
 * ============================================================ */
import * as THREE from 'three';
import type { HubTheme } from '../hub/registry';
import { t } from '../i18n';
import { Kit, type SceneFn, type Shot } from './kit';
import { Bloom } from './post';
import { Sting } from './sting';
import { SCENES } from './scenes';
import { card2d } from './card2d';
import { CSS } from './style';

export interface IntroOpts {
  id: string;
  name: string;
  tagline: string;
  theme: HubTheme;
  tier: number;
  short: boolean;
}

/** conteúdo animado por baixo do título (3D ou 2D) */
export interface Painter {
  /** τ = tempo da intro; dt = passo */
  frame(tau: number, dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
  /** pede flash/tremor/cor de fundo */
  flash?(): [number, string];
}

let styled = false;

/** Toca a intro em `el` (que cobre o jogo). Resolve ao terminar ou ao pular. */
export function playIntro(el: HTMLElement, o: IntroOpts): Promise<void> {
  if (!styled) {
    styled = true;
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const th = o.theme;
  el.classList.add('i3-root');
  el.style.setProperty('--i3-a', th.accent);
  el.style.setProperty('--i3-b', th.accent2);
  el.style.setProperty('--i3-t0', th.title[0]);
  el.style.setProperty('--i3-t1', th.title[1]);
  el.style.setProperty('--i3-bg0', th.bg[0]);
  el.style.setProperty('--i3-bg1', th.bg[1]);
  el.innerHTML = '';
  const cv = document.createElement('canvas');
  cv.className = 'i3-cv';
  const flash = document.createElement('div');
  flash.className = 'i3-flash';
  const card = titleCard(o);
  const skip = document.createElement('div');
  skip.className = 'i3-skip';
  skip.textContent = t('intro3d.skip', 'Toque para pular');
  el.append(cv, flash, card, skip);

  const sceneFn: SceneFn | undefined = SCENES[o.id];
  let painter: Painter | null = null;
  let shot: Shot | null = null;
  let sting: Sting | null = null;
  // linha do tempo (segundos da intro)
  let off = 0;
  let titleIn = 0;
  let dissIn = 0;
  let end = 0;

  if (sceneFn && o.tier > 0) {
    try {
      const p = make3d(cv, o, sceneFn);
      painter = p.painter;
      shot = p.shot;
    } catch (e) {
      console.warn('[intro3d] sem 3D', e);
      painter = null;
    }
  }
  if (painter && shot) {
    const A = shot.dur;
    if (o.short) {
      off = Math.max(0, A - 0.75);
      titleIn = 0.12;
      dissIn = 1.0;
      end = 1.5;
    } else {
      off = 0;
      titleIn = A - 0.45;
      dissIn = A + 0.85;
      end = A + 1.4;
    }
    sting = new Sting(off);
    shot.sting?.(sting);
    sting.titleHit(off + titleIn + 0.05, 523.25);
  } else {
    // 2D: cartão animado
    painter = card2d(cv, o);
    const full = !o.short;
    titleIn = full ? 0.45 : 0.1;
    dissIn = full ? 2.0 : 1.0;
    end = full ? 2.6 : 1.5;
    sting = new Sting(0);
    sting.whoosh(0, 0.4, 0.18, 500, 4);
    sting.titleHit(titleIn + 0.05, 523.25);
  }

  return new Promise<void>((resolve) => {
    let tau = 0;
    let raf = 0;
    let last = performance.now();
    let titled = false;
    let finished = false;
    let skipped = -1;
    let skipWall = 0;
    const wall0 = performance.now();
    const resize = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      painter!.resize(w, h);
    };
    resize();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(el);
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      el.removeEventListener('pointerdown', onTap);
      try {
        painter!.dispose();
      } catch (e) {
        console.warn('[intro3d] dispose', e);
      }
      w.__i3frame = undefined;
      resolve();
    };
    const onTap = (e: Event) => {
      e.preventDefault();
      if (skipped >= 0 || tau >= dissIn) return;
      skipped = tau;
      skipWall = performance.now();
      sting?.stop();
      // pula direto para a dissolução (rápida)
      if (!titled) card.classList.add('in', 'fast');
      titled = true;
      dissIn = tau;
      end = tau + 0.38;
    };
    el.addEventListener('pointerdown', onTap);

    const step = (dt: number) => {
      if (finished) return;
      if (!el.isConnected) return finish(); // o host fechou (Voltar)
      tau += dt;
      painter!.frame(off + tau, dt);
      const fl = painter!.flash?.();
      if (fl) {
        flash.style.opacity = String(fl[0]);
        if (fl[0] > 0.01) flash.style.background = fl[1];
      }
      if (!titled && tau >= titleIn) {
        titled = true;
        card.classList.add('in');
      }
      skip.style.opacity = tau > 0.25 && tau < dissIn ? '1' : '0';
      if (tau >= dissIn) {
        const k = Math.min(1, (tau - dissIn) / (end - dissIn));
        const e = k * k * (3 - 2 * k);
        const r = e * 118 - 14;
        const m = `radial-gradient(circle at 50% 50%, transparent ${r}%, #000 ${r + 14}%)`;
        el.style.webkitMaskImage = m;
        el.style.maskImage = m;
        card.style.transform = `scale(${1 + e * 0.35})`;
        card.style.opacity = String(1 - e);
      }
      if (tau >= end) finish();
    };

    // modo manual (captura de quadros nos testes): window.__i3frame(dt)
    const w = window as unknown as { __i3manual?: boolean; __i3frame?: (dt: number) => boolean };
    if (w.__i3manual) {
      w.__i3frame = (dt: number) => {
        step(dt);
        return finished;
      };
      return;
    }
    const loop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      step(dt);
      // aparelho lento (dt preso em 50 ms): o relógio de parede garante que pular/terminar não demora
      if (!finished && ((skipWall && now - skipWall > 450) || now - wall0 > (end + 2.5) * 1000)) finish();
      if (!finished) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame((n) => {
      last = n;
      loop(n);
    });
  });
}

function titleCard(o: IntroOpts): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'i3-title';
  const glow = document.createElement('div');
  glow.className = 'i3-halo';
  const h = document.createElement('h1');
  let i = 0;
  for (const word of o.name.split(' ')) {
    const w = document.createElement('span');
    w.className = 'i3-w';
    for (const ch of word) {
      const s = document.createElement('span');
      s.className = 'i3-l';
      s.textContent = ch;
      s.style.animationDelay = `${i * 0.028}s`;
      i++;
      w.appendChild(s);
    }
    h.appendChild(w);
    h.appendChild(document.createTextNode(' '));
  }
  const p = document.createElement('p');
  p.textContent = o.tagline;
  const shine = document.createElement('i');
  shine.className = 'i3-shine';
  wrap.append(glow, h, p, shine);
  return wrap;
}

/* ------------------------------ 3D ------------------------------ */
function make3d(cv: HTMLCanvasElement, o: IntroOpts, fn: SceneFn): { painter: Painter; shot: Shot } {
  const tier = o.tier;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: tier >= 2 && tier < 3, powerPreference: 'high-performance', alpha: false, stencil: false });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  let pr = Math.min(dpr, [0.6, 0.85, 1.15, 1.5][tier] ?? 1);
  r.setPixelRatio(pr);
  const kit = new Kit(tier, o.theme);
  const shot = fn(kit);
  const bloom = tier >= 3 ? new Bloom(r) : null;
  let W = 1;
  let H = 1;
  const applySize = () => {
    r.setPixelRatio(pr);
    r.setSize(W, H, false);
    bloom?.setSize(r.domElement.width, r.domElement.height);
  };
  // aquece shaders antes do relógio andar (sem engasgo no 1º quadro)
  r.compile(kit.scene, kit.cam);
  // governador simples: se os primeiros quadros passam de ~22 ms, reduz a resolução
  let acc = 0;
  let nf = 0;
  let drops = 0;
  let prevT = -1;
  let flashA = 0;
  const painter: Painter = {
    resize(w, h) {
      W = Math.max(1, w);
      H = Math.max(1, h);
      kit.aspect = W / H;
      kit.cam.aspect = W / H;
      kit.cam.updateProjectionMatrix();
      applySize();
    },
    frame(st, dt) {
      if (prevT < 0) {
        // versão curta: simula a cena até o ponto de entrada (sem desenhar)
        const s0 = st - dt;
        for (let x = 0; x < s0 - 1e-4; x += 1 / 30) {
          shot.update(x, 1 / 30);
          kit.fx.update(1 / 30, kit.cam.fov, r.domElement.height);
          kit.fxAdd.update(1 / 30, kit.cam.fov, r.domElement.height);
        }
        kit.flashAmt = 0;
      }
      prevT = st;
      kit.shakeAmt *= Math.pow(0.02, dt);
      if (kit.shakeAmt < 0.002) kit.shakeAmt = 0;
      shot.update(st, dt);
      kit.fx.update(dt, kit.cam.fov, r.domElement.height);
      kit.fxAdd.update(dt, kit.cam.fov, r.domElement.height);
      flashA = kit.flashAmt;
      kit.flashAmt *= Math.pow(0.004, dt);
      // governador ANTES de desenhar (redimensionar limpa o canvas)
      if (drops < 2 && dt > 0) {
        acc += dt;
        nf++;
        if (nf === 20) {
          if (acc / nf > 0.022 && pr > 0.55) {
            pr *= 0.78;
            drops++;
            applySize();
          }
          acc = 0;
          nf = 0;
        }
      }
      if (bloom) bloom.render(kit.scene, kit.cam);
      else r.render(kit.scene, kit.cam);
    },
    flash: () => [flashA, kit.flashCol],
    dispose() {
      kit.dispose();
      bloom?.dispose();
      r.dispose();
      r.forceContextLoss();
    },
  };
  return { painter, shot };
}
