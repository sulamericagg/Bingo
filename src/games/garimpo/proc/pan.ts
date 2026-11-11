/* ============================================================
 *  GARIMPO BRUTO — PENEIRA + BATEIA (minijogo de toque, 2D por cima do jogo).
 *
 *  Como no garimpo de verdade (ouro ≈ 19× mais denso que a água, ~7× a areia comum):
 *   1. PENEIRA (classificar): sacudir derruba o fino na bateia; pedras grandes ficam e são
 *      jogadas fora com um peteleco — às vezes uma PEPITA aparece entre elas (toque!).
 *   2. BATEIA: pôr a terra → afundar na água (sobe a lama) → GIRAR (estratifica: o pesado
 *      desce para o fundo/centro, o leve sobe) → INCLINAR e lavar (a água leva o leve pelo
 *      lábio; inclinar demais derruba ouro — dá para ver as palhetas caindo) → repetir →
 *      sobra a AREIA PRETA (magnetita, ~5×) → giro bem devagar abre a areia preta e o OURO
 *      aparece brilhando → passar o dedo (o "chupa-ouro") leva o ouro para o frasco.
 *  Simulação 2D simples: cada grão tem posição no prato (disco unitário), velocidade e
 *  "camada" s (0 = fundo, 1 = topo). Girar leva s para o alvo de cada densidade; inclinar
 *  empurra tudo para o lábio com mobilidade que cai com a densidade e com a profundidade;
 *  só derrama quem está acima do corte da inclinação.
 *  Sem alocação por quadro (arrays tipados, sprites pré-desenhados em panart.ts).
 * ============================================================ */
import { t } from '../../../i18n';
import { sfx } from '../../../3d/common/sfx';
import { audio } from '../../../core/audio';
import { success, tap } from '../../../core/haptics';
import { speak } from '../../voo/voice';
import { PIC } from './icons';
import { bucketArt, causticTile, flakeSprite, glintSprite, grainSprite, handPath, nuggetSprite, panArt, riverBg, rng, rockSprite, sieveArt, vialArt, type Rnd } from './panart';

export type PanMode = 'full' | 'clean';
export interface PanResult {
  /** gramas no frasco */
  grams: number;
  /** gramas que caíram (vão para o rejeito) */
  lost: number;
  /** gramas que havia no material */
  total: number;
  /** pepita pega (g) */
  nug: number;
  stars: number;
  combo: number;
  cancelled: boolean;
}
export interface PanOpts {
  mode: PanMode;
  /** gramas de ouro fino no material */
  gold: number;
  /** pepita (g); 0 = nenhuma */
  nugget: number;
  diff: number;
  tier: number;
  /** começa pela peneira (só 'full') */
  sieve: boolean;
  combo: number;
  done(r: PanResult): void;
}

/* tipos de grão */
const RK = 0;
const GV = 1;
const SD = 2;
const BS = 3;
const AU = 4;
const NG = 5;
/** camada alvo depois de bem girado (0 fundo) e mobilidade na lavagem */
const TGT = [0.97, 0.9, 0.74, 0.24, 0.04, 0.02];
const MOB = [1.5, 1.25, 1.0, 0.36, 0.13, 0.05];
/** raio (no disco unitário) */
const RAD = [0.085, 0.045, 0.021, 0.015, 0.018, 0.055];
/** atrito/atração para o fundo (pesado corre para o centro do cone) */
const HEAVY = [0.1, 0.1, 0.05, 0.45, 1, 1];
const MAXP = 380;
const RIM = 0.93;

/* fases */
const P_SIEVE = 0;
const P_SCOOP = 1;
const P_DIP = 2;
const P_SWIRL = 3;
const P_WASH = 4;
const P_BLACK = 5;
const P_PICK = 6;
const P_DONE = 7;

/* estado do grão */
const A_DEAD = 0;
const A_IN = 1;
/** caindo da peneira para a bateia */
const A_FALL = 2;
/** derramando pelo lábio (ou peteleco da pedra) */
const A_SPILL = 3;
/** voando para o frasco */
const A_VIAL = 4;
/** no balde (antes de pôr na bateia) */
const A_BUCKET = 5;
/** já caiu na bateia (durante a peneira) */
const A_PAN = 6;

/** dificuldade: [fácil, normal, difícil, muito difícil] */
const GOLD_RES = [0.45, 0.22, 0.1, 0.04];
const STRAT_K = [1.9, 1.35, 1.1, 1.0];
const RED = [1.12, 0.98, 0.92, 0.88];
const LIGHT_DONE = [0.14, 0.08, 0.06, 0.05];
/** quanto o vermelho derruba tudo */
const OVER_K = [1.5, 4, 6, 7];

const STAGES: (keyof typeof PIC)[] = ['sieve', 'pan', 'tilt', 'vial'];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class PanGame {
  private el: HTMLDivElement;
  private cv: HTMLCanvasElement;
  private x: CanvasRenderingContext2D;
  private o: PanOpts;
  private r: Rnd;
  private W = 1;
  private H = 1;
  private k = 1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private dead = false;
  /* layout */
  private pcx = 0;
  private pcy = 0;
  private R = 100;
  private vx0 = 0;
  private vy0 = 0;
  private vw = 40;
  private vh = 120;
  private bkx = 0;
  private bky = 0;
  private bkR = 40;
  /* arte */
  private bg!: HTMLCanvasElement;
  private caus!: HTMLCanvasElement;
  private pan!: { bowl: HTMLCanvasElement; rim: HTMLCanvasElement };
  private sieve!: { mesh: HTMLCanvasElement; frame: HTMLCanvasElement };
  private vial!: { back: HTMLCanvasElement; front: HTMLCanvasElement };
  private bucket!: HTMLCanvasElement;
  private spr: HTMLCanvasElement[][] = [];
  private glint!: HTMLCanvasElement;
  private glintW!: HTMLCanvasElement;
  private bed!: HTMLCanvasElement;
  private hand = handPath();
  /* grãos (SoA) */
  private n = 0;
  private px = new Float32Array(MAXP);
  private py = new Float32Array(MAXP);
  private pvx = new Float32Array(MAXP);
  private pvy = new Float32Array(MAXP);
  private ps = new Float32Array(MAXP);
  private pst = new Float32Array(MAXP);
  private pt = new Uint8Array(MAXP);
  private pa = new Uint8Array(MAXP);
  private pv = new Uint8Array(MAXP);
  private pval = new Float32Array(MAXP);
  /** animação de voo (tela): posição, velocidade, tempo, origem */
  private fx = new Float32Array(MAXP);
  private fy = new Float32Array(MAXP);
  private fvx = new Float32Array(MAXP);
  private fvy = new Float32Array(MAXP);
  private ft = new Float32Array(MAXP);
  private ord = new Int16Array(MAXP);
  private cnt = new Int16Array(10);
  private gHead = new Int16Array(196);
  private gNext = new Int16Array(MAXP);
  /* fase e entrada */
  private ph = P_SIEVE;
  private phT = 0;
  private down = false;
  private pid = -1;
  private dx0 = 0;
  private dy0 = 0;
  private mx = 0;
  private my = 0;
  private lastA = 0;
  private haveA = false;
  private downT = 0;
  private moved = 0;
  private grab = -1;
  private idle = 0;
  private omega = 0;
  private wVel = 0;
  private wAng = 0;
  private tilt = 0;
  private tiltIn = 0;
  private slosh = 0;
  private sloshV = 0;
  private sub = 0;
  private murk = 0;
  private prog = 0;
  private spillT = 0;
  private cycleSpill = 0;
  private nLight0 = 1;
  private nFine0 = 1;
  /* peneira */
  private sox = 0;
  private soy = 0;
  private sovx = 0;
  private sovy = 0;
  private shake = 0;
  private sieveOut = 0;
  /* tilt do aparelho */
  private useTilt = false;
  private tx = 0;
  private ty = 0;
  private tAng = 0;
  private tHave = false;
  private tLast = 0;
  /* placar */
  private got = 0;
  private lost = 0;
  private nugGot = 0;
  private total = 0;
  private lostFlash = 0;
  private wowT = 0;
  private wowTxt = '';
  private said = new Set<string>();
  private swishT = 0;
  private clinkT = 0;
  private autoT = 0;
  private lostSaid = 0;
  /** depois da revelação, só um toque novo pega ouro (quem ainda gira não chupa sem querer) */
  private pickArm = false;
  private vialG: CanvasGradient | null = null;
  private stageEls: HTMLElement[] = [];
  private gaugeKey = -1;
  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  constructor(
    root: HTMLElement,
    o: PanOpts,
  ) {
    this.o = o;
    this.r = rng((Math.random() * 1e9) | 0);
    const el = document.createElement('div');
    el.className = 'gbp-pan';
    el.setAttribute('data-touch-ignore', '');
    const btn = (cls: string, ic: keyof typeof PIC) => `<button class="gbp-b ${cls}">${PIC[ic]}</button>`;
    el.innerHTML = `<canvas></canvas>
      <div class="gbp-ptop">${btn('gbp-x', 'close')}<div class="gbp-stages">${STAGES.map((s) => `<i data-st="${s}">${PIC[s]}</i>`).join('<b></b>')}</div><span class="gbp-sp"></span>${btn('gbp-tilt', 'tilt')}${btn('gbp-skip', 'skip')}</div>
      <div class="gbp-res" hidden></div>`;
    root.appendChild(el);
    this.el = el;
    this.cv = el.querySelector('canvas')!;
    this.x = this.cv.getContext('2d', { alpha: false })!;
    this.stageEls = [...el.querySelectorAll<HTMLElement>('[data-st]')];
    if (!o.sieve || o.mode === 'clean') (el.querySelector('[data-st="sieve"]') as HTMLElement).classList.add('off');
    el.querySelector('.gbp-x')!.addEventListener('click', () => this.close());
    el.querySelector('.gbp-tilt')!.addEventListener('click', () => this.toggleTilt());
    el.querySelector('.gbp-skip')!.addEventListener('click', () => {
      if (this.ph === P_SIEVE) this.endSieve(true);
    });
    this.cv.addEventListener('pointerdown', this.pDown);
    this.cv.addEventListener('pointermove', this.pMove);
    this.cv.addEventListener('pointerup', this.pUp);
    this.cv.addEventListener('pointercancel', this.pUp);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.layout);
    this.layout();
    this.setup();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ============================== montagem ============================== */
  private layout = (): void => {
    const W = this.el.clientWidth || window.innerWidth;
    const H = this.el.clientHeight || window.innerHeight;
    const k = Math.min(window.devicePixelRatio || 1, this.o.tier >= 2 ? 1.5 : 1);
    this.W = W;
    this.H = H;
    this.k = k;
    this.cv.width = Math.round(W * k);
    this.cv.height = Math.round(H * k);
    this.R = Math.min(H * 0.4, W * 0.25);
    this.pcx = W * 0.55;
    this.pcy = H * 0.56;
    this.vw = clamp(H * 0.13, 38, 70);
    this.vh = this.vw * 2.6;
    this.vx0 = Math.max(18, W * 0.05);
    this.vy0 = H * 0.24;
    this.bkR = H * 0.13;
    this.bkx = this.vx0 + this.vw + this.bkR + W * 0.04;
    this.bky = H - this.bkR - 14;
    const r = rng(4242);
    this.bg = riverBg(W, H, r);
    this.caus = causticTile(256, r);
    this.pan = panArt(this.R);
    this.sieve = sieveArt(this.R * 0.98);
    this.vial = vialArt(this.vw, this.vh);
    this.vialG = null;
    // leito de sedimento (dá corpo ao monte de terra na bateia)
    {
      const S = Math.ceil(this.R * 1.6);
      const c = document.createElement('canvas');
      c.width = c.height = S;
      const x = c.getContext('2d')!;
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      g.addColorStop(0, 'rgba(120,88,52,.95)');
      g.addColorStop(0.55, 'rgba(110,80,48,.75)');
      g.addColorStop(1, 'rgba(100,72,44,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, S, S);
      const rr = rng(5);
      for (let i = 0; i < 900; i++) {
        const a = rr() * Math.PI * 2;
        const d = Math.sqrt(rr()) * S * 0.45;
        x.fillStyle = rr() < 0.5 ? 'rgba(60,40,20,.35)' : 'rgba(220,190,140,.3)';
        x.fillRect(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.5, 1.5);
      }
      this.bed = c;
    }
    this.bucket = bucketArt(this.bkR, this.o.mode === 'clean' ? '#2b2622' : '#7a5332');
    if (!this.spr.length) this.sprites();
  };

  private sprites(): void {
    const r = rng(9001);
    const R = this.R;
    const big = this.o.diff === 0 ? 1.25 : 1;
    const v = (n: number, f: () => HTMLCanvasElement) => Array.from({ length: n }, f);
    this.spr[RK] = v(6, () => rockSprite(r, R * RAD[RK] * 2 * (0.85 + r() * 0.3), [128 + r() * 30, 104 + r() * 25, 82 + r() * 20], 0.6));
    this.spr[GV] = v(8, () => rockSprite(r, R * RAD[GV] * 2 * (0.8 + r() * 0.4), [140 + r() * 40, 115 + r() * 30, 80 + r() * 25], 0.4));
    this.spr[SD] = v(6, () => grainSprite(Math.max(3, R * RAD[SD] * 2 * (0.8 + r() * 0.5)), [180 + r() * 40, 150 + r() * 30, 100 + r() * 30], 0.3));
    this.spr[BS] = v(4, () => grainSprite(Math.max(3, R * RAD[BS] * 2 * (0.8 + r() * 0.4)), [28 + r() * 15, 28 + r() * 15, 34 + r() * 15], 0.9));
    this.spr[AU] = v(8, () => flakeSprite(r, Math.max(5, R * RAD[AU] * 3 * big * (0.8 + r() * 0.5))));
    this.spr[NG] = v(2, () => nuggetSprite(r, R * RAD[NG] * 2.2));
    this.glint = glintSprite(Math.round(R * 0.16));
    this.glintW = glintSprite(Math.round(R * 0.1), false);
  }

  /** cria os grãos do material: na peneira (full+sieve) ou no balde */
  private setup(): void {
    const o = this.o;
    const r = this.r;
    const clean = o.mode === 'clean';
    const nRock = clean ? 0 : 9;
    const nGv = clean ? 0 : 40;
    const nSd = clean ? 40 : 165;
    const nBs = clean ? 95 : 64;
    const unit = o.diff === 0 ? 0.07 : 0.11;
    const nAu = Math.round(clamp(o.gold / unit, o.gold > 0.01 ? 6 : 0, 46));
    this.total = o.gold + o.nugget;
    let i = 0;
    const add = (t: number, val = 0) => {
      if (i >= MAXP) return;
      this.pt[i] = t;
      this.pv[i] = (r() * this.spr[t].length) | 0;
      this.pval[i] = val;
      this.ps[i] = r();
      this.pst[i] = clamp(TGT[t] + (r() - 0.5) * 0.12, 0, 1);
      this.pvx[i] = this.pvy[i] = 0;
      i++;
    };
    for (let k = 0; k < nRock; k++) add(RK);
    for (let k = 0; k < nGv; k++) add(GV);
    for (let k = 0; k < nSd; k++) add(SD);
    for (let k = 0; k < nBs; k++) add(BS);
    // palhetas: valores que somam o ouro fino
    let sum = 0;
    const i0 = i;
    for (let k = 0; k < nAu; k++) {
      const w = 0.5 + r();
      add(AU, w);
      sum += w;
    }
    for (let k = i0; k < i; k++) this.pval[k] = (this.pval[k] / (sum || 1)) * o.gold;
    if (o.nugget > 0) add(NG, o.nugget);
    this.n = i;
    this.nLight0 = nRock + nGv + nSd;
    if (o.mode === 'full' && o.sieve) {
      // tudo na peneira, misturado
      this.ph = P_SIEVE;
      for (let k = 0; k < this.n; k++) {
        const a = r() * Math.PI * 2;
        const d = Math.sqrt(r()) * 0.8;
        this.px[k] = Math.cos(a) * d;
        this.py[k] = Math.sin(a) * d;
        this.pa[k] = A_IN;
      }
      let f = 0;
      for (let k = 0; k < this.n; k++) if (this.pt[k] !== RK && this.pt[k] !== NG) f++;
      this.nFine0 = Math.max(1, f);
      this.voice('sieve', t('gb.pan.v.sieve', 'Sacuda a peneira! Jogue as pedras fora.'));
    } else {
      this.ph = P_SCOOP;
      for (let k = 0; k < this.n; k++) this.pa[k] = A_BUCKET;
      this.voice('scoop', t('gb.pan.v.scoop', 'Ponha a terra na bateia.'));
    }
    this.stageUi();
  }

  /* ============================== laço ============================== */
  private loop = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(1 / 30, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.phT += dt;
    this.step(dt);
    this.draw();
  };

  private step(dt: number): void {
    if (!this.down) this.idle += dt;
    this.tiltSensor(dt);
    // giro: entrada → velocidade da água
    this.omega *= Math.exp(-dt * (this.down || this.useTilt ? 1.5 : 3.5));
    this.wVel += (this.omega * 0.9 - this.wVel) * Math.min(1, dt * 3);
    this.wAng += this.wVel * dt;
    // inclinação com mola (solta → volta)
    const tgt = this.ph === P_WASH ? this.tiltIn : 0;
    this.tilt += (tgt - this.tilt) * Math.min(1, dt * (tgt > this.tilt ? 6 : 4));
    // água balançando (onda)
    this.sloshV += (-this.slosh * 40 - this.sloshV * 4 + (tgt - this.tilt) * 30) * dt;
    this.slosh += this.sloshV * dt;
    this.lostFlash = Math.max(0, this.lostFlash - dt * 1.6);
    this.wowT = Math.max(0, this.wowT - dt);
    this.swishT -= dt;
    this.clinkT -= dt;
    if (this.ph === P_SIEVE) this.stepSieve(dt);
    else if (this.ph >= P_DIP && this.ph <= P_BLACK) this.stepPan(dt);
    this.stepFly(dt);
    this.phase(dt);
  }

  /* ---------------- peneira ---------------- */
  private stepSieve(dt: number): void {
    // peneira volta ao centro (mola); energia = velocidade
    if (!this.down || this.grab >= 0) {
      this.sovx += (-this.sox * 60 - this.sovx * 9) * dt;
      this.sovy += (-this.soy * 60 - this.sovy * 9) * dt;
      this.sox += this.sovx * dt;
      this.soy += this.sovy * dt;
    }
    if (this.down && this.grab < 0) {
      // dedo parado: a peneira para
      this.sovx *= Math.exp(-dt * 6);
      this.sovy *= Math.exp(-dt * 6);
    }
    const sp = Math.hypot(this.sovx, this.sovy) / this.R;
    this.shake += (Math.min(3, sp) - this.shake) * Math.min(1, dt * 6);
    const e = this.shake;
    const r = this.r;
    let fines = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const t = this.pt[i];
      if (i === this.grab) continue;
      // tremida: grãos chacoalham com a peneira
      if (e > 0.15) {
        this.px[i] += (r() - 0.5) * e * 0.02;
        this.py[i] += (r() - 0.5) * e * 0.02;
      }
      const d = Math.hypot(this.px[i], this.py[i]);
      const lim = 0.9 - RAD[t];
      if (d > lim) {
        this.px[i] *= lim / d;
        this.py[i] *= lim / d;
      }
      if (t === RK || t === NG) continue;
      fines++;
      // fino passa pela tela com a sacudida
      if (e > 0.25 && r() < dt * (e - 0.2) * (t === GV ? 1.2 : 2.6)) {
        this.pa[i] = A_FALL;
        this.ft[i] = 0;
      }
    }
    this.sieveOut = 1 - fines / this.nFine0;
    if (e > 0.6 && this.swishT <= 0) {
      this.swishT = 0.22;
      sfx.scrub();
    }
  }

  private endSieve(skip: boolean): void {
    if (this.ph !== P_SIEVE) return;
    // o que sobrou cai (fino) ou vai junto para a bateia (pedras, se pulou)
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] === A_PAN) {
        this.pa[i] = A_IN;
        continue;
      }
      if (this.pa[i] !== A_IN && this.pa[i] !== A_FALL) continue;
      const t = this.pt[i];
      if ((t === RK || t === NG) && !skip) {
        // pedras viram a peneira (fora); pepita esquecida ainda vai para a bateia
        if (t === RK) {
          this.flick(i, (this.px[i] || 0.1) * 6, -3);
          continue;
        }
      }
      this.pa[i] = A_IN;
      this.toPan(i);
    }
    this.ph = P_DIP;
    this.phT = 0;
    this.idle = 0;
    sfx.splat();
    this.voice('dip', t('gb.pan.v.dip', 'Afunde a bateia na água.'));
    this.stageUi();
  }

  /** grão passa a morar na bateia (posição espalhada em monte) */
  private toPan(i: number): void {
    const a = this.r() * Math.PI * 2;
    const d = Math.sqrt(this.r()) * 0.55;
    this.px[i] = Math.cos(a) * d;
    this.py[i] = Math.sin(a) * d;
    this.ps[i] = this.r();
    this.pvx[i] = this.pvy[i] = 0;
  }

  /* ---------------- bateia ---------------- */
  private stepPan(dt: number): void {
    const ph = this.ph;
    const diff = this.o.diff;
    const sub = this.sub;
    const swirlE = Math.min(1.6, Math.abs(this.wVel) / 3);
    const tl = this.tilt;
    const washing = ph === P_WASH && tl > 0.15 && sub > 0.9;
    const sCut = 1.08 - (tl - 0.15) * 1.05;
    const sk = STRAT_K[diff];
    const black = ph === P_BLACK;
    const gentle = black && Math.abs(this.wVel) > 0.4 && Math.abs(this.wVel) < 5.5;
    // grade para separação
    this.gHead.fill(-1);
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const gx = clamp(((this.px[i] + 1) * 7) | 0, 0, 13);
      const gy = clamp(((this.py[i] + 1) * 7) | 0, 0, 13);
      const c = gy * 14 + gx;
      this.gNext[i] = this.gHead[c];
      this.gHead[c] = i;
    }
    let spilled = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const t = this.pt[i];
      let x = this.px[i];
      let y = this.py[i];
      let vx = this.pvx[i];
      let vy = this.pvy[i];
      const s = this.ps[i];
      const rd = Math.hypot(x, y) + 1e-4;
      const hv = HEAVY[t];
      // estratificação: girando, cada um vai para sua camada (o pesado afunda)
      let st = this.pst[i];
      if (black && t === BS) st = 0.5;
      this.ps[i] = s + (st - s) * Math.min(1, dt * sk * (swirlE * 0.6 + (sub > 0.5 ? 0.03 : 0)));
      // lavar fluidiza: o leve que ficou embaixo mistura um pouco
      if (washing && t <= SD) this.ps[i] += (0.55 - this.ps[i]) * dt * 0.12 * tl;
      // cone: o pesado escorrega para o centro; o leve flutua
      const kb = (0.25 + hv * 1.6) * sub * (1 - Math.min(0.7, tl * 0.45));
      let ax = -x * kb;
      let ay = -y * kb;
      // água girando arrasta (mais o leve, mais quem está em cima)
      const couple = (0.25 + 0.75 * this.ps[i]) * (1 - hv * 0.75);
      const txn = -y / rd;
      const tyn = x / rd;
      const vt = vx * txn + vy * tyn;
      const want = this.wVel * rd * 0.42 * couple;
      ax += txn * (want - vt) * 3.2;
      ay += tyn * (want - vt) * 3.2;
      // força centrífuga empurra o leve para fora
      const cf = ((vt * vt) / rd) * 0.14 * (1 - hv * 0.8);
      ax += (x / rd) * cf;
      ay += (y / rd) * cf;
      // areia preta: no giro final abre para fora (meia-lua), o ouro fica no fundo
      if (black && t === BS && gentle) {
        // meia-lua: anel em ~0,6 puxado para o lado de trás (longe do lábio)
        const want2 = 0.6;
        ax += (x / rd) * (want2 - rd) * 3;
        ay += (y / rd) * (want2 - rd) * 3;
        const ta = Math.atan2(y, x);
        let da = 2.4 - ta;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        ax += txn * da * 0.9;
        ay += tyn * da * 0.9;
      }
      if (black && t >= AU) {
        // o ouro fica no fundo, mas sem amontoar no centro
        ax += x * kb * 0.85;
        ay += y * kb * 0.85;
      }
      if (black && t === SD) {
        ax += (x / rd) * 1.2;
        ay += (y / rd) * 1.2;
      }
      // inclinação: tudo escorrega para o lábio (+x), conforme a mobilidade
      if (tl > 0.02) {
        let m = MOB[t] * (0.15 + 0.85 * this.ps[i]);
        if (t >= AU) m *= 1 - GOLD_RES[diff];
        // passou do vermelho: tudo escorrega (o ouro também)
        const over = tl - RED[diff];
        if (over > 0) m += over * OVER_K[diff];
        ax += tl * 3.2 * m;
        ay -= y * tl * 0.6 * m;
      }
      // sem água: quase nada se mexe
      const damp = sub > 0.5 ? 2.4 + hv * 4 : 12;
      vx = (vx + ax * dt) * Math.exp(-dt * damp);
      vy = (vy + ay * dt) * Math.exp(-dt * damp);
      x += vx * dt;
      y += vy * dt;
      // lábio / parede
      const r2 = Math.hypot(x, y);
      const lim = RIM - RAD[t] * 0.6;
      if (r2 > lim) {
        let se = this.ps[i];
        if (t >= AU) se -= GOLD_RES[diff];
        if (washing && x > 0.55 && Math.abs(y) < 0.72 && se > sCut) {
          this.spill(i);
          spilled++;
          continue;
        }
        x *= lim / r2;
        y *= lim / r2;
        const vn = (vx * x + vy * y) / lim;
        if (vn > 0) {
          vx -= (vn * x) / lim;
          vy -= (vn * y) / lim;
        }
      }
      this.px[i] = x;
      this.py[i] = y;
      this.pvx[i] = vx;
      this.pvy[i] = vy;
    }
    // separação (só entre vizinhos da mesma camada)
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const gx = clamp(((this.px[i] + 1) * 7) | 0, 0, 13);
      const gy = clamp(((this.py[i] + 1) * 7) | 0, 0, 13);
      const ri = RAD[this.pt[i]];
      for (let oy = -1; oy <= 1; oy++) {
        const cy = gy + oy;
        if (cy < 0 || cy > 13) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const cx = gx + ox;
          if (cx < 0 || cx > 13) continue;
          for (let j = this.gHead[cy * 14 + cx]; j >= 0; j = this.gNext[j]) {
            if (j <= i || this.pa[j] !== A_IN) continue;
            if (Math.abs(this.ps[i] - this.ps[j]) > 0.3) continue;
            const ddx = this.px[j] - this.px[i];
            const ddy = this.py[j] - this.py[i];
            const want = (ri + RAD[this.pt[j]]) * (this.pt[i] >= AU && this.pt[j] >= AU ? 1.6 : 0.85);
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 >= want * want || d2 < 1e-9) continue;
            const d = Math.sqrt(d2);
            const push = (want - d) * 0.5;
            const mi = ri * ri;
            const mj = RAD[this.pt[j]] * RAD[this.pt[j]];
            const wi = mj / (mi + mj);
            const nx = ddx / d;
            const ny = ddy / d;
            this.px[i] -= nx * push * wi;
            this.py[i] -= ny * push * wi;
            this.px[j] += nx * push * (1 - wi);
            this.py[j] += ny * push * (1 - wi);
          }
        }
      }
    }
    if (spilled) {
      this.spillT = 0;
      this.cycleSpill += spilled;
    } else this.spillT += dt;
    // lama sai com a troca de água
    if (washing) this.murk = Math.max(0, this.murk - dt * 0.35 * tl);
    if (this.swishT <= 0 && Math.abs(this.wVel) > 2) {
      this.swishT = clamp(0.5 - Math.abs(this.wVel) * 0.03, 0.18, 0.45);
      sfx.water();
    }
    if (washing && this.swishT <= 0) {
      this.swishT = 0.3;
      sfx.water();
    }
  }

  private spill(i: number): void {
    const ty = this.pt[i];
    this.pa[i] = A_SPILL;
    this.ft[i] = 0;
    const [sx, sy] = this.toScreen(this.px[i], this.py[i]);
    this.fx[i] = sx;
    this.fy[i] = sy;
    this.fvx[i] = this.R * (1.2 + this.r() * 0.8);
    this.fvy[i] = (this.r() - 0.5) * this.R * 0.6;
    if (ty >= AU) {
      this.lost += this.pval[i];
      this.lostFlash = 1;
      if (this.clinkT <= 0) {
        this.clinkT = 0.25;
        sfx.drop();
        tap('medium');
      }
      if (this.lostSaid <= this.time) {
        this.lostSaid = this.time + 6;
        this.voice('lost', ty === NG ? t('gb.pan.v.lostNug', 'Não! A pepita caiu! Incline devagar.') : t('gb.pan.v.lost', 'Opa! Devagar, o ouro caiu!'), true);
      }
    }
  }

  /** pedra jogada para fora (peteleco) */
  private flick(i: number, vx: number, vy: number): void {
    const [sx, sy] = this.ph === P_SIEVE ? this.toSieve(this.px[i], this.py[i]) : this.toScreen(this.px[i], this.py[i]);
    this.pa[i] = A_SPILL;
    this.ft[i] = 0;
    this.fx[i] = sx;
    this.fy[i] = sy;
    this.fvx[i] = vx * this.R * 0.5;
    this.fvy[i] = vy * this.R * 0.5;
    sfx.thunk();
  }

  /** voos (tela): caindo da peneira, derramando, peteleco, indo ao frasco, balde → bateia */
  private stepFly(dt: number): void {
    const R = this.R;
    for (let i = 0; i < this.n; i++) {
      const a = this.pa[i];
      if (a === A_FALL) {
        this.ft[i] += dt * 2.4;
        if (this.ft[i] >= 1) {
          this.pa[i] = this.ph === P_SIEVE ? A_PAN : A_IN;
          // cai onde estava, um pouco espalhado
          this.px[i] = clamp(this.px[i] * 0.85 + (this.r() - 0.5) * 0.1, -0.8, 0.8);
          this.py[i] = clamp(this.py[i] * 0.85 + (this.r() - 0.5) * 0.1, -0.8, 0.8);
          this.ps[i] = this.r();
        }
      } else if (a === A_SPILL) {
        this.ft[i] += dt;
        this.fx[i] += this.fvx[i] * dt;
        this.fy[i] += this.fvy[i] * dt;
        this.fvy[i] += R * 1.2 * dt;
        if (this.ft[i] > 1.2) this.pa[i] = A_DEAD;
      } else if (a === A_VIAL) {
        this.ft[i] += dt * 1.9;
        if (this.ft[i] >= 1) {
          this.pa[i] = A_DEAD;
          this.got += this.pval[i];
          if (this.pt[i] === NG) this.nugGot += this.pval[i];
          if (this.clinkT <= 0) {
            this.clinkT = 0.07;
            sfx.pick();
            tap('light');
          }
        }
      } else if (a === A_BUCKET && this.ft[i] !== 0) {
        // balde → bateia
        this.ft[i] += dt * 1.8;
        if (this.ft[i] >= 1) {
          this.pa[i] = A_IN;
          this.toPan(i);
        }
      }
    }
  }

  /* ---------------- fases ---------------- */
  private phase(dt: number): void {
    const ph = this.ph;
    const diff = this.o.diff;
    if (ph === P_SIEVE) {
      let rocks = 0;
      for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && (this.pt[i] === RK || this.pt[i] === NG)) rocks++;
      if (this.sieveOut > 0.9) {
        // fino quase todo passou: o resto cai; pedras para fora
        for (let i = 0; i < this.n; i++)
          if (this.pa[i] === A_IN && this.pt[i] !== RK && this.pt[i] !== NG) {
            this.pa[i] = A_FALL;
            this.ft[i] = 0;
          }
        if (rocks) this.voice('rocks', t('gb.pan.v.rocks', 'Toque nas pedras para jogar fora!'));
        let falling = 0;
        for (let i = 0; i < this.n; i++) if (this.pa[i] === A_FALL) falling++;
        if (!rocks && !falling) {
          this.autoT += dt;
          if (this.autoT > 0.4) this.endSieve(false);
        } else if (rocks) {
          this.autoT += dt;
          // criança que não acha as pedras: vira a peneira sozinha depois de um tempo
          if (this.autoT > 9) this.endSieve(false);
        }
      }
      return;
    }
    if (ph === P_SCOOP) {
      let left = 0;
      for (let i = 0; i < this.n; i++) if (this.pa[i] === A_BUCKET) left++;
      if (!left) {
        this.ph = P_DIP;
        this.phT = 0;
        this.voice('dip', t('gb.pan.v.dip', 'Afunde a bateia na água.'));
        this.stageUi();
      }
      return;
    }
    if (ph === P_DIP) {
      if (this.sub > 0 && this.sub < 1) {
        this.sub = Math.min(1, this.sub + dt * 1.6);
        if (this.sub >= 1) {
          this.ph = P_SWIRL;
          this.phT = 0;
          this.prog = 0;
          this.voice('swirl', t('gb.pan.v.swirl', 'Gire, gire! O ouro é pesado e afunda.'));
          this.stageUi();
        }
      }
      return;
    }
    // métricas
    let light = 0;
    let strat = 0;
    let nn = 0;
    let gold = 0;
    let bsIn = 0;
    let bsN = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const t = this.pt[i];
      if (t <= SD) light++;
      if (t >= AU) gold++;
      if (t === BS) {
        bsN++;
        if (Math.hypot(this.px[i], this.py[i]) < 0.42) bsIn++;
      }
      if (t !== BS || ph !== P_BLACK) {
        strat += 1 - Math.min(1, Math.abs(this.ps[i] - this.pst[i]) / 0.55);
        nn++;
      }
    }
    strat = nn ? strat / nn : 1;
    const lightK = light / this.nLight0;
    if (ph === P_SWIRL) {
      this.prog += (clamp((strat - 0.45) / 0.45, 0, 1) - this.prog) * Math.min(1, dt * 4);
      if (this.prog > 0.97 || (strat > 0.9 && (lightK < LIGHT_DONE[diff] || light <= 4))) {
        if (lightK < LIGHT_DONE[diff] || light <= 4) return this.toBlack();
        this.ph = P_WASH;
        this.phT = 0;
        this.cycleSpill = 0;
        this.spillT = 0;
        sfx.ding();
        tap('light');
        this.voice('wash', t('gb.pan.v.wash', 'Incline devagar para a água levar as pedrinhas.'));
        this.stageUi();
      }
    } else if (ph === P_WASH) {
      if ((lightK < LIGHT_DONE[diff] || light <= 4) && this.tilt < 0.3) return this.toBlack();
      // nada mais sai nesta inclinação: soltou → girar de novo
      if (this.tiltIn < 0.08 && this.tilt < 0.12 && this.phT > 0.8 && (this.cycleSpill > 0 || this.phT > 4) && this.spillT > 0.6) {
        this.ph = P_SWIRL;
        this.phT = 0;
        this.prog = 0;
        this.voice('again', t('gb.pan.v.again', 'Muito bem! Gire de novo.'));
        this.stageUi();
      }
      this.gauge();
    } else if (ph === P_BLACK) {
      const w = Math.abs(this.wVel);
      const ok = w > 0.4 && w < 5.5;
      if (ok) this.prog = Math.min(1, this.prog + dt * (this.o.mode === 'clean' ? 0.3 : 0.26) * (diff === 0 ? 1.4 : 1));
      if (w > 7) {
        this.prog = Math.max(0, this.prog - dt * 0.25);
        this.voice('slow', t('gb.pan.v.slow', 'Mais devagar!'));
        this.wowTxt = '';
      }
      this.murk = Math.max(0, this.murk - dt * 0.4);
      if (this.prog >= 1 || (bsN > 0 && bsIn / bsN < 0.05 && this.prog > 0.5)) this.reveal();
    } else if (ph === P_PICK) {
      if (!gold) {
        let flying = 0;
        for (let i = 0; i < this.n; i++) if (this.pa[i] === A_VIAL) flying++;
        if (!flying) this.finish();
        return;
      }
      this.autoT += this.down ? 0 : dt;
      // ninguém pegou por um tempo: o frasco chupa o resto sozinho
      if (this.autoT > 9) for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && this.pt[i] >= AU) this.toVial(i);
    }
  }

  private toBlack(): void {
    // o leve que sobrou escorre sozinho (sem perder ouro)
    for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && this.pt[i] <= SD) this.spill(i);
    this.ph = P_BLACK;
    this.phT = 0;
    this.prog = 0;
    this.tiltIn = 0;
    sfx.ding();
    this.voice('black', t('gb.pan.v.black', 'Agora bem devagar... a areia preta sai do caminho.'));
    this.stageUi();
  }

  private reveal(): void {
    // ouro espalhado num rastro curto no fundo (como na bateia de verdade), areia preta de lado
    const r = this.r;
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const t = this.pt[i];
      if (t >= AU) {
        const u = r();
        const a = -0.6 + u * 1.5 + (r() - 0.5) * 0.5;
        const d = 0.06 + u * 0.4 + r() * 0.08;
        this.px[i] = Math.cos(a) * d - 0.05;
        this.py[i] = Math.sin(a) * d * 0.8;
        this.pvx[i] = this.pvy[i] = 0;
        this.ps[i] = 0.9;
      } else if (t === BS) this.ps[i] = 0.2;
    }
    this.ph = P_PICK;
    this.phT = 0;
    this.autoT = 0;
    this.murk = 0;
    this.wowTxt = t('gb.pan.wow', 'Uau!');
    this.wowT = 1.6;
    sfx.sparkle();
    audio.coin(3);
    success();
    let g = 0;
    for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && this.pt[i] >= AU) g++;
    if (g) this.voice('reveal', t('gb.pan.v.reveal', 'Uau! Olha o ouro brilhando! Passe o dedo nele.'), true);
    this.stageUi();
  }

  private toVial(i: number): void {
    const [sx, sy] = this.toScreen(this.px[i], this.py[i]);
    this.pa[i] = A_VIAL;
    this.ft[i] = 0;
    this.fx[i] = sx;
    this.fy[i] = sy;
    this.autoT = 0;
    if (this.pt[i] === NG) {
      this.wowTxt = t('gb.pan.nugget', 'PEPITA!');
      this.wowT = 1.8;
      sfx.sparkle();
      audio.coin(4);
      success();
    }
  }

  private finish(): void {
    if (this.ph === P_DONE) return;
    this.ph = P_DONE;
    // o que ainda estiver voando/no prato conta
    for (let i = 0; i < this.n; i++) if ((this.pa[i] === A_IN || this.pa[i] === A_VIAL) && this.pt[i] >= AU) this.got += this.pval[i];
    const tot = Math.max(1e-6, this.total);
    const rec = this.total > 0.001 ? this.got / tot : 1;
    const stars = rec >= 0.95 ? 3 : rec >= 0.82 ? 2 : 1;
    const combo = this.lost < 0.001 && this.total > 0.001 ? this.o.combo + 1 : 0;
    const res: PanResult = { grams: this.got, lost: Math.max(0, this.total - this.got), total: this.total, nug: this.nugGot, stars, combo, cancelled: false };
    const box = this.el.querySelector('.gbp-res') as HTMLElement;
    const g = this.got < 10 ? this.got.toFixed(2).replace('.', ',') : Math.round(this.got).toString();
    box.innerHTML = `<div class="gbp-card"><div class="gbp-vial">${PIC.vial}</div><b>+${g} g</b>
      <div class="gbp-stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? 'on' : ''}">${PIC.star}</i>`).join('')}</div>
      <div class="gbp-rec"><span>${Math.round(rec * 100)}%</span>${combo >= 2 ? `<em>${PIC.flame}×${combo}</em>` : ''}</div>
      <button class="gbp-b gbp-ok">${PIC.ok}</button></div>`;
    box.hidden = false;
    this.voice('done', stars === 3 ? t('gb.pan.v.perfect', 'Bateia perfeita!') : t('gb.pan.v.done', 'Ouro no frasco!'), true);
    if (stars === 3) sfx.yay();
    else sfx.catch();
    box.querySelector('.gbp-ok')!.addEventListener('click', () => {
      sfx.click();
      this.dispose();
      this.o.done(res);
    });
  }

  /** fechar no meio: devolve o material (o ouro que caiu já foi) */
  close(): void {
    if (this.dead) return;
    if (this.ph === P_DONE) {
      (this.el.querySelector('.gbp-ok') as HTMLElement | null)?.click();
      return;
    }
    if (this.ph === P_PICK) {
      for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && this.pt[i] >= AU) this.toVial(i);
      this.finish();
      return;
    }
    sfx.click();
    this.dispose();
    this.o.done({ grams: 0, lost: this.lost, total: this.total, nug: this.nugGot, stars: 0, combo: this.o.combo, cancelled: true });
  }

  private gauge(): void {
    const key = this.tilt > RED[this.o.diff] ? 2 : this.tilt > 0.3 ? 1 : 0;
    if (key === this.gaugeKey) return;
    this.gaugeKey = key;
    if (key === 2) tap('light');
  }

  /* ============================== entrada ============================== */
  private pDown = (e: PointerEvent): void => {
    if (this.pid >= 0 && e.pointerId !== this.pid) return;
    this.pid = e.pointerId;
    this.cv.setPointerCapture?.(e.pointerId);
    const p = this.local(e);
    this.down = true;
    this.idle = 0;
    this.dx0 = this.mx = p[0];
    this.dy0 = this.my = p[1];
    this.downT = this.time;
    this.moved = 0;
    this.haveA = false;
    this.grab = -1;
    const ph = this.ph;
    if (ph === P_SIEVE) {
      const i = this.hit(p[0], p[1], true);
      if (i >= 0) this.grab = i;
    } else if (ph === P_SCOOP) {
      this.pour();
    } else if (ph === P_DIP && this.sub === 0) {
      // toque também afunda (criança pequena)
    } else if (ph === P_PICK) {
      this.pickArm = true;
      this.suck(p[0], p[1]);
    }
  };
  private pMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid || !this.down) return;
    const p = this.local(e);
    const dx = p[0] - this.mx;
    const dy = p[1] - this.my;
    const dt = 1 / 60;
    this.moved += Math.hypot(dx, dy);
    this.mx = p[0];
    this.my = p[1];
    this.idle = 0;
    const ph = this.ph;
    if (ph === P_SIEVE) {
      if (this.grab >= 0) {
        const [ux, uy] = this.fromSieve(p[0], p[1]);
        this.px[this.grab] = ux;
        this.py[this.grab] = uy;
      } else {
        const lim = this.R * 0.16;
        const nx = clamp(this.sox + dx, -lim, lim);
        const ny = clamp(this.soy + dy * 0.6, -lim, lim);
        this.sovx = this.sovx * 0.5 + ((nx - this.sox) / dt) * 0.5;
        this.sovy = this.sovy * 0.5 + ((ny - this.soy) / dt) * 0.5;
        this.sox = nx;
        this.soy = ny;
      }
    } else if (ph === P_DIP) {
      if (p[1] - this.dy0 > this.R * 0.25 && this.sub === 0) this.dip();
    } else if (ph === P_SWIRL || ph === P_BLACK) {
      const a = Math.atan2(p[1] - this.pcy, p[0] - this.pcx);
      const d = Math.hypot(p[0] - this.pcx, p[1] - this.pcy);
      if (d > this.R * 0.12) {
        if (this.haveA) {
          let da = a - this.lastA;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          const w = clamp(da / dt, -14, 14);
          this.omega += (w - this.omega) * 0.25;
        }
        this.lastA = a;
        this.haveA = true;
      }
    } else if (ph === P_WASH) {
      this.tiltIn = clamp((p[0] - this.dx0) / (this.R * 0.9), 0, 1.3);
    } else if (ph === P_PICK && this.pickArm) this.suck(p[0], p[1]);
  };
  private pUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.pid) return;
    this.pid = -1;
    this.down = false;
    const p = this.local(e);
    const ph = this.ph;
    const quick = this.time - this.downT < 0.35 && this.moved < 14;
    if (ph === P_SIEVE && this.grab >= 0) {
      const i = this.grab;
      this.grab = -1;
      const t = this.pt[i];
      const [sx, sy] = this.toSieve(this.px[i], this.py[i]);
      const out = Math.hypot(this.px[i], this.py[i]) > 0.95;
      if (t === NG) {
        if (quick || Math.hypot(sx - (this.vx0 + this.vw / 2), sy - (this.vy0 + this.vh / 2)) < this.vw * 1.5 || out) this.grabNugget(i);
      } else if (quick) {
        // toque: peteleco para fora (na direção do toque a partir do centro)
        const ax = this.px[i] || 0.2;
        const ay = this.py[i] || -0.2;
        const d = Math.hypot(ax, ay) || 1;
        this.flick(i, (ax / d) * 7, (ay / d) * 7 - 2);
      } else if (out) this.flick(i, (this.px[i] > 0 ? 1 : -1) * 5, -2);
      else {
        const d = Math.hypot(this.px[i], this.py[i]);
        if (d > 0.85) {
          this.px[i] *= 0.85 / d;
          this.py[i] *= 0.85 / d;
        }
      }
      return;
    }
    if (ph === P_DIP && this.sub === 0 && quick) this.dip();
    if (ph === P_WASH) this.tiltIn = 0;
    if ((ph === P_SWIRL || ph === P_WASH) && quick) {
      // toque numa pedra: tira com a mão
      const i = this.hit(p[0], p[1], false);
      if (i >= 0 && this.pt[i] === RK) this.flick(i, 4, -2);
    }
    if (ph === P_PICK && quick) {
      const i = this.hit(p[0], p[1], false);
      if (i >= 0 && this.pt[i] >= AU) this.toVial(i);
    }
  };

  private grabNugget(i: number): void {
    const [sx, sy] = this.toSieve(this.px[i], this.py[i]);
    this.pa[i] = A_VIAL;
    this.ft[i] = 0;
    this.fx[i] = sx;
    this.fy[i] = sy;
    this.wowTxt = t('gb.pan.nugget', 'PEPITA!');
    this.wowT = 2;
    sfx.sparkle();
    audio.coin(4);
    success();
    this.voice('nug', t('gb.pan.v.nug', 'Uau! Uma pepita! Direto para o frasco!'), true);
  }

  private pour(): void {
    let k = 0;
    for (let i = 0; i < this.n; i++)
      if (this.pa[i] === A_BUCKET && this.ft[i] === 0) {
        this.ft[i] = -0.0001 - (k++ % 40) * 0.012;
      }
    if (k) {
      sfx.splat();
      tap('light');
    }
  }
  private dip(): void {
    this.sub = 0.01;
    this.murk = this.o.mode === 'clean' ? 0.45 : 0.9;
    sfx.splash();
    tap('medium');
  }
  /** chupa-ouro: grãos de ouro perto do dedo vão para o frasco */
  private suck(x: number, y: number): void {
    const rr = Math.max(26, this.R * 0.16);
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN || this.pt[i] < AU) continue;
      const [sx, sy] = this.toScreen(this.px[i], this.py[i]);
      if (Math.hypot(sx - x, sy - y) < rr + (this.pt[i] === NG ? this.R * 0.05 : 0)) this.toVial(i);
    }
  }
  private hit(x: number, y: number, sieve: boolean): number {
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN) continue;
      const t = this.pt[i];
      if (sieve ? t !== RK && t !== NG : t !== RK && t < AU) continue;
      const [sx, sy] = sieve ? this.toSieve(this.px[i], this.py[i]) : this.toScreen(this.px[i], this.py[i]);
      const d = Math.hypot(sx - x, sy - y);
      const lim = sieve ? Math.max(12, RAD[t] * this.R * 1.15) : Math.max(24, RAD[t] * this.R * 1.6);
      if (d < lim && d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  /* ---------------- inclinar o aparelho (opção) ---------------- */
  private onOri = (e: DeviceOrientationEvent): void => {
    if (e.beta === null || e.gamma === null) return;
    const ang = (screen.orientation?.angle ?? 0) | 0;
    let a = e.gamma / 30;
    let b = e.beta / 30;
    if (ang === 90) [a, b] = [b, -a];
    else if (ang === 270 || ang === -90) [a, b] = [-b, a];
    this.tx = clamp(a, -1.5, 1.5);
    this.ty = clamp(b - 1, -1.5, 1.5);
    this.tHave = true;
    this.tLast = this.time;
  };
  private toggleTilt(): void {
    this.useTilt = !this.useTilt;
    sfx.click();
    this.el.querySelector('.gbp-tilt')!.classList.toggle('on', this.useTilt);
    if (this.useTilt) {
      const D = globalThis.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> } | undefined;
      const go = () => window.addEventListener('deviceorientation', this.onOri);
      if (D?.requestPermission) D.requestPermission().then((s) => s === 'granted' && go()).catch(() => {});
      else go();
      this.tLast = this.time;
    } else window.removeEventListener('deviceorientation', this.onOri);
  }
  private tiltSensor(dt: number): void {
    if (!this.useTilt) return;
    if (!this.tHave) {
      if (this.time - this.tLast > 1.5) {
        // sem sensor
        this.toggleTilt();
      }
      return;
    }
    const m = Math.hypot(this.tx, this.ty);
    const ph = this.ph;
    if ((ph === P_SWIRL || ph === P_BLACK) && m > 0.18) {
      const a = Math.atan2(this.ty, this.tx);
      let da = a - this.tAng;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      this.omega += (clamp(da / Math.max(dt, 1e-3), -14, 14) - this.omega) * 0.15;
      this.tAng = a;
      this.idle = 0;
    } else if (ph === P_WASH) {
      this.tiltIn = clamp(this.tx * 1.1, 0, 1.3);
      if (this.tiltIn > 0.1) this.idle = 0;
    } else if (ph === P_SIEVE) {
      const e = Math.abs(this.tx - this.tAng) / Math.max(dt, 1e-3);
      this.tAng = this.tx;
      if (e > 3) this.sovx += clamp(e, 0, 20) * this.R * 0.05 * (this.r() < 0.5 ? -1 : 1);
    } else if (ph === P_DIP && this.ty > 0.6 && this.sub === 0) this.dip();
  }

  /* ============================== desenho ============================== */
  private toScreen(ux: number, uy: number): [number, number] {
    const R = this.R * RIM;
    _p[0] = this.pcx + this.tilt * this.R * 0.06 + ux * R * (1 - this.tilt * 0.05);
    _p[1] = this.pcy + uy * R;
    return _p;
  }
  private toSieve(ux: number, uy: number): [number, number] {
    const R = this.R * 0.98;
    _p[0] = this.pcx - this.R * 0.05 + this.sox + ux * R;
    _p[1] = this.pcy - this.R * 0.08 + this.soy + uy * R - this.sieveLift();
    return _p;
  }
  private fromSieve(x: number, y: number): [number, number] {
    const R = this.R * 0.98;
    _p[0] = clamp((x - (this.pcx - this.R * 0.05 + this.sox)) / R, -1.2, 1.2);
    _p[1] = clamp((y - (this.pcy - this.R * 0.08 + this.soy)) / R, -1.2, 1.2);
    return _p;
  }
  private sieveLift(): number {
    return this.ph === P_SIEVE ? 0 : Math.min(1, this.phT * 2) * this.H;
  }
  private local(e: PointerEvent): [number, number] {
    const b = this.cv.getBoundingClientRect();
    _q[0] = e.clientX - b.left;
    _q[1] = e.clientY - b.top;
    return _q;
  }

  private draw(): void {
    const x = this.x;
    const k = this.k;
    const W = this.W;
    const H = this.H;
    const R = this.R;
    x.setTransform(k, 0, 0, k, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.drawImage(this.bg, 0, 0, W, H);
    // cáusticas (duas camadas andando com a correnteza)
    x.globalCompositeOperation = 'lighter';
    const T = this.time;
    for (let L = 0; L < 2; L++) {
      x.globalAlpha = L ? 0.05 : 0.075;
      const sc = L ? 1.6 : 1;
      const s = 256 * sc;
      const ox = ((T * (L ? 18 : 30)) % s) - s;
      const oy = ((T * (L ? 7 : -5)) % s) - s;
      for (let yy = oy; yy < H; yy += s) for (let xx = ox; xx < W; xx += s) x.drawImage(this.caus, xx, yy, s, s);
    }
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    // fios de correnteza
    x.strokeStyle = 'rgba(230,250,255,.16)';
    x.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const yy = ((i * 97) % H) + Math.sin(T * 0.7 + i) * 6;
      const xx = ((T * 60 + i * 173) % (W + 200)) - 100;
      x.beginPath();
      x.moveTo(xx, yy);
      x.quadraticCurveTo(xx + 40, yy - 6, xx + 90, yy);
      x.stroke();
    }
    this.drawBucket();
    this.drawPan();
    if (this.ph === P_SIEVE || (this.ph === P_DIP && this.phT < 0.6 && this.o.sieve && this.o.mode === 'full')) this.drawSieve();
    this.drawFly();
    this.drawVial();
    this.drawUi();
    // aviso vermelho: ouro caindo
    if (this.lostFlash > 0) {
      x.globalAlpha = this.lostFlash * 0.35;
      x.strokeStyle = '#ff3a2a';
      x.lineWidth = 14;
      x.strokeRect(7, 7, W - 14, H - 14);
      x.globalAlpha = 1;
    }
    void R;
  }

  private drawBucket(): void {
    if (this.ph !== P_SCOOP) return;
    const x = this.x;
    const b = this.bucket;
    x.drawImage(b, this.bkx - b.width / 2, this.bky - b.height / 2);
  }

  private drawPan(): void {
    const x = this.x;
    const R = this.R;
    const tl = this.tilt;
    const cx = this.pcx + tl * R * 0.06;
    const cy = this.pcy;
    const b = this.pan.bowl;
    const sq = 1 - tl * 0.05;
    x.save();
    x.translate(cx, cy);
    x.scale(sq, 1);
    x.drawImage(b, -b.width / 2, -b.height / 2);
    x.restore();
    const ph = this.ph;
    const sub = this.sub;
    // dentro do prato
    x.save();
    x.beginPath();
    x.ellipse(cx, cy, R * 0.955 * sq, R * 0.955, 0, 0, Math.PI * 2);
    x.clip();
    if (sub > 0) {
      // água com a superfície puxando para o lábio quando inclina
      const off = (tl * 0.25 + this.slosh * 0.08) * R;
      x.globalAlpha = 0.28 * sub;
      x.fillStyle = '#3d93a8';
      x.beginPath();
      x.ellipse(cx + off, cy, R * (1 - tl * 0.18), R, 0, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
    }
    // ordena por camada (fundo primeiro)
    const n = this.n;
    this.cnt.fill(0);
    for (let i = 0; i < n; i++) {
      const a = this.pa[i];
      if (a !== A_IN && a !== A_FALL && a !== A_PAN) continue;
      if (ph === P_SIEVE && a === A_IN) continue;
      this.cnt[Math.min(9, (this.ps[i] * 10) | 0)]++;
    }
    for (let b2 = 1; b2 < 10; b2++) this.cnt[b2] += this.cnt[b2 - 1];
    // leito: centro de massa do material leve, tamanho pela quantidade
    {
      let lx = 0;
      let ly = 0;
      let ln = 0;
      for (let i = 0; i < n; i++)
        if ((this.pa[i] === A_IN || this.pa[i] === A_PAN) && this.pt[i] <= BS && (ph !== P_SIEVE || this.pa[i] === A_PAN)) {
          lx += this.px[i];
          ly += this.py[i];
          ln++;
        }
      if (ln > 4) {
        const k2 = Math.min(1, ln / 200);
        this.toScreen(lx / ln, ly / ln);
        const bs = R * (0.7 + 0.9 * k2) * (1 - this.tilt * 0.15);
        x.globalAlpha = 0.25 + k2 * 0.6;
        x.drawImage(this.bed, _p[0] - bs / 2, _p[1] - bs / 2, bs, bs);
        x.globalAlpha = 1;
      }
    }
    let tot = 0;
    for (let i = n - 1; i >= 0; i--) {
      const a = this.pa[i];
      if (a !== A_IN && a !== A_FALL && a !== A_PAN) continue;
      if (ph === P_SIEVE && a === A_IN) continue;
      const bk = Math.min(9, (this.ps[i] * 10) | 0);
      this.ord[--this.cnt[bk]] = i;
      tot++;
    }
    const murk = this.murk * sub;
    let drewMurk = false;
    const glints = ph >= P_BLACK || ph === P_SWIRL || ph === P_WASH;
    for (let q = 0; q < tot; q++) {
      const i = this.ord[q];
      if (!drewMurk && this.ps[i] >= 0.5) {
        drewMurk = true;
        if (murk > 0.01) {
          x.globalAlpha = Math.min(0.62, murk * 0.68);
          x.fillStyle = '#7d6040';
          x.fillRect(cx - R, cy - R, R * 2, R * 2);
          x.globalAlpha = 1;
        }
      }
      const t = this.pt[i];
      let sx: number;
      let sy: number;
      let sc = 1;
      if (this.pa[i] === A_FALL) {
        // caindo da peneira: começa em cima (posição da peneira) e encolhe
        const f = this.ft[i];
        const [ax, ay] = this.toSieve(this.px[i], this.py[i]);
        const [bx, by] = this.toScreen(this.px[i] * 0.85, this.py[i] * 0.85);
        sx = ax + (bx - ax) * f;
        sy = ay + (by - ay) * f + Math.sin(f * Math.PI) * R * 0.05;
        sc = 1 - f * 0.25;
      } else {
        this.toScreen(this.px[i], this.py[i]);
        sx = _p[0];
        sy = _p[1];
      }
      const sp = this.spr[t][this.pv[i]];
      // mais fundo = um pouco mais escuro (água por cima)
      x.globalAlpha = sub > 0 ? 0.72 + this.ps[i] * 0.28 : 1;
      // ouro ainda sujo de barro no começo: aparece de verdade só no fim (a revelação)
      if (t >= AU && ph < P_PICK) x.globalAlpha *= t === NG ? 0.8 : ph === P_BLACK ? 0.35 + this.prog * 0.65 : 0.3;
      x.drawImage(sp, sx - (sp.width * sc) / 2, sy - (sp.height * sc) / 2, sp.width * sc, sp.height * sc);
    }
    x.globalAlpha = 1;
    if (!drewMurk && murk > 0.01) {
      x.globalAlpha = Math.min(0.62, murk * 0.68);
      x.fillStyle = '#7d6040';
      x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.globalAlpha = 1;
    }
    if (murk > 0.01) {
      x.globalAlpha = murk * 0.2;
      x.fillStyle = '#8a6a44';
      x.fillRect(cx - R, cy - R, R * 2, R * 2);
      x.globalAlpha = 1;
    }
    // brilhos do ouro descoberto (pisca)
    if (glints) {
      x.globalCompositeOperation = 'lighter';
      const gs = this.glint;
      const reveal = ph >= P_PICK ? 1 : ph === P_BLACK ? this.prog * 0.6 : 0.25;
      for (let i = 0; i < n; i++) {
        if (this.pa[i] !== A_IN || this.pt[i] < AU) continue;
        const cover = Math.max(0, this.ps[i] < 0.5 ? murk : 0);
        const ph2 = Math.sin(this.time * (3 + (i % 5)) + i * 1.7);
        const a = (ph2 * 0.5 + 0.5) ** 14 * reveal * (1 - cover);
        if (a < 0.03) continue;
        this.toScreen(this.px[i], this.py[i]);
        const sx = _p[0];
        const sy = _p[1];
        const s = (this.pt[i] === NG ? 1.4 : 0.6) * (0.6 + a * 0.6);
        x.globalAlpha = Math.min(1, a * 1.2);
        x.drawImage(gs, sx - (gs.width * s) / 2, sy - (gs.height * s) / 2, gs.width * s, gs.height * s);
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
    if (sub > 0) {
      // riscos do redemoinho
      const w = Math.min(1, Math.abs(this.wVel) / 6);
      if (w > 0.05) {
        x.strokeStyle = 'rgba(235,250,255,.5)';
        x.lineCap = 'round';
        for (let j = 0; j < 7; j++) {
          const rr = R * (0.25 + j * 0.1);
          const a0 = this.wAng * (1.1 - j * 0.07) + j * 2.1;
          x.globalAlpha = w * (0.25 + (j % 3) * 0.12);
          x.lineWidth = 1.5 + (j % 2);
          x.beginPath();
          x.arc(cx, cy, rr, a0, a0 + 0.9 + w * 0.8);
          x.stroke();
        }
        x.globalAlpha = 1;
      }
      // reflexo do céu na água (mexe com a onda)
      x.globalAlpha = 0.16 * sub;
      x.fillStyle = '#ffffff';
      x.beginPath();
      x.ellipse(cx - R * 0.32 + this.slosh * R * 0.1, cy - R * 0.4, R * 0.36, R * 0.12, -0.5, 0, Math.PI * 2);
      x.fill();
      x.globalAlpha = 1;
      // cáustica dentro do prato
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = 0.07 * sub;
      const s = 256;
      const oo = (this.time * 14) % s;
      x.drawImage(this.caus, cx - R - oo, cy - R - oo * 0.5, s * 1.4, s * 1.4);
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
    x.restore();
    // aro por cima
    const rim = this.pan.rim;
    x.save();
    x.translate(cx, cy);
    x.scale(sq, 1);
    x.drawImage(rim, -rim.width / 2, -rim.height / 2);
    x.restore();
    // água derramando pelo lábio (à direita)
    if (ph === P_WASH && tl > 0.15 && sub > 0.9) {
      const f = Math.min(1, (tl - 0.15) * 1.5);
      x.strokeStyle = 'rgba(205,240,255,.55)';
      x.lineCap = 'round';
      for (let j = 0; j < 6; j++) {
        const a = -0.55 + j * 0.22;
        const sx = cx + Math.cos(a) * R * sq;
        const sy = cy + Math.sin(a) * R;
        x.globalAlpha = f * (0.45 + 0.3 * Math.sin(this.time * 9 + j));
        x.lineWidth = 3 + f * 4;
        x.beginPath();
        x.moveTo(sx - R * 0.06, sy);
        x.quadraticCurveTo(sx + R * 0.15, sy + R * 0.02, sx + R * (0.2 + f * 0.25), sy + R * (0.05 + j * 0.01));
        x.stroke();
      }
      // espuma
      x.fillStyle = '#ffffff';
      for (let j = 0; j < 14; j++) {
        const u = (this.time * 1.7 + j * 0.37) % 1;
        const a = -0.6 + ((j * 0.618) % 1) * 1.2;
        x.globalAlpha = f * (1 - u) * 0.8;
        x.beginPath();
        x.arc(cx + Math.cos(a) * R + u * R * 0.45, cy + Math.sin(a) * R * (1 - u * 0.2) + u * u * R * 0.2, 1.5 + (j % 3), 0, Math.PI * 2);
        x.fill();
      }
      x.globalAlpha = 1;
    }
  }

  private drawSieve(): void {
    const x = this.x;
    const R = this.R;
    const lift = this.sieveLift();
    const cx = this.pcx - R * 0.05 + this.sox;
    const cy = this.pcy - R * 0.08 + this.soy - lift;
    const m = this.sieve.mesh;
    x.drawImage(m, cx - m.width / 2, cy - m.height / 2);
    // grãos na peneira (fino, depois pedras por cima)
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < this.n; i++) {
        if (this.pa[i] !== A_IN) continue;
        const t = this.pt[i];
        const big = t === RK || t === NG;
        if (big !== (pass === 1)) continue;
        this.toSieve(this.px[i], this.py[i]);
        const sx = _p[0];
        const sy = _p[1];
        const sp = this.spr[t][this.pv[i]];
        const sc = i === this.grab ? 1.25 : 1;
        x.drawImage(sp, sx - (sp.width * sc) / 2, sy - (sp.height * sc) / 2, sp.width * sc, sp.height * sc);
        if (t === NG) {
          // pepita pisca forte (chama o olho)
          x.globalCompositeOperation = 'lighter';
          const a = 0.5 + 0.5 * Math.sin(this.time * 5);
          const g = this.glint;
          x.globalAlpha = 0.5 + a * 0.5;
          const s = 1.4 + a * 0.6;
          x.drawImage(g, sx - (g.width * s) / 2 + sp.width * 0.15, sy - (g.height * s) / 2 - sp.height * 0.15, g.width * s, g.height * s);
          x.globalAlpha = 1;
          x.globalCompositeOperation = 'source-over';
        }
      }
    const f = this.sieve.frame;
    x.drawImage(f, cx - f.width / 2, cy - f.height / 2);
  }

  private drawFly(): void {
    const x = this.x;
    const vx = this.vx0 + this.vw / 2;
    const vy = this.vy0 + this.vh * 0.7;
    for (let i = 0; i < this.n; i++) {
      const a = this.pa[i];
      const t = this.pt[i];
      const sp = this.spr[t][this.pv[i]];
      if (a === A_SPILL) {
        const f = this.ft[i];
        x.globalAlpha = Math.max(0, 1 - f / 1.2);
        const s = 1 - f * 0.4;
        x.drawImage(sp, this.fx[i] - (sp.width * s) / 2, this.fy[i] - (sp.height * s) / 2, sp.width * s, sp.height * s);
        if (t >= AU) {
          // ouro perdido: anel vermelho
          x.strokeStyle = '#ff3a2a';
          x.lineWidth = 2;
          x.beginPath();
          x.arc(this.fx[i], this.fy[i], 6 + f * 14, 0, Math.PI * 2);
          x.stroke();
        }
      } else if (a === A_VIAL) {
        const f = this.ft[i];
        const e = f * f * (3 - 2 * f);
        const sx = this.fx[i] + (vx - this.fx[i]) * e;
        const sy = this.fy[i] + (vy - this.fy[i]) * e - Math.sin(f * Math.PI) * this.R * 0.45;
        const s = (t === NG ? 1.4 : 1.2) * (1 - f * 0.4);
        x.globalAlpha = 1;
        x.drawImage(sp, sx - (sp.width * s) / 2, sy - (sp.height * s) / 2, sp.width * s, sp.height * s);
        x.globalCompositeOperation = 'lighter';
        const g = this.glintW;
        x.globalAlpha = 0.7;
        x.drawImage(g, sx - g.width / 2, sy - g.height / 2);
        x.globalCompositeOperation = 'source-over';
      } else if (a === A_BUCKET) {
        const f = this.ft[i];
        if (f <= 0) {
          // ainda no balde: monte de terra/concentrado dentro
          const an = i * 2.399;
          const d = Math.sqrt((i % 23) / 23) * this.bkR * 0.62;
          x.globalAlpha = t >= AU ? 0.3 : 1;
          x.drawImage(sp, this.bkx + Math.cos(an) * d - sp.width / 2, this.bky + Math.sin(an) * d - sp.height / 2);
          continue;
        }
        const ff = Math.min(1, f);
        const [bx, by] = this.toScreen(this.px[i] * 0.5, this.py[i] * 0.5);
        const sx = this.bkx + (bx - this.bkx) * ff + (this.pv[i] - 3) * 3;
        const sy = this.bky + (by - this.bky) * ff - Math.sin(ff * Math.PI) * this.R * 0.5;
        x.globalAlpha = 1;
        x.drawImage(sp, sx - sp.width / 2, sy - sp.height / 2);
      }
    }
    x.globalAlpha = 1;
  }

  private drawVial(): void {
    const x = this.x;
    const v = this.vial;
    const X = this.vx0;
    const Y = this.vy0;
    x.drawImage(v.back, X, Y);
    // ouro no fundo do frasco (cresce com os gramas; escala por log para caber)
    const g = this.got;
    if (g > 0.001) {
      const lvl = clamp(Math.log10(1 + g * 3) / 2.2, 0.05, 0.62);
      const h = this.vh * lvl;
      const by = Y + this.vh * 0.96;
      if (!this.vialG) {
        const gg = x.createLinearGradient(X, Y + this.vh * 0.3, X + this.vw, by);
        gg.addColorStop(0, '#fff2a0');
        gg.addColorStop(0.5, '#f5c21c');
        gg.addColorStop(1, '#a86f00');
        this.vialG = gg;
      }
      x.fillStyle = this.vialG;
      x.beginPath();
      x.roundRect(X + this.vw * 0.12, by - h, this.vw * 0.76, h, Math.min(h / 2, this.vw * 0.3));
      x.fill();
      x.globalCompositeOperation = 'lighter';
      const gl = this.glintW;
      for (let j = 0; j < 3; j++) {
        const a = Math.max(0, Math.sin(this.time * 2.3 + j * 2.1));
        x.globalAlpha = a * a * 0.9;
        x.drawImage(gl, X + this.vw * (0.25 + j * 0.22) - gl.width / 2, by - h * (0.3 + j * 0.2) - gl.height / 2);
      }
      x.globalAlpha = 1;
      x.globalCompositeOperation = 'source-over';
    }
    x.drawImage(v.front, X, Y);
    // gramas
    x.font = '800 18px Fredoka, system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'top';
    x.lineWidth = 4;
    x.strokeStyle = 'rgba(40,20,0,.85)';
    const txt = g < 10 ? g.toFixed(2).replace('.', ',') + ' g' : Math.round(g) + ' g';
    x.strokeText(txt, X + this.vw / 2, Y + this.vh + 6);
    x.fillStyle = '#ffd23a';
    x.fillText(txt, X + this.vw / 2, Y + this.vh + 6);
  }

  private drawUi(): void {
    const x = this.x;
    const R = this.R;
    const ph = this.ph;
    const cx = this.pcx;
    const cy = this.pcy;
    // anel de progresso (girar / giro final / peneira)
    if (ph === P_SWIRL || ph === P_BLACK || ph === P_SIEVE) {
      const p = ph === P_SIEVE ? this.sieveOut : this.prog;
      const rr = R * 1.1;
      x.lineCap = 'round';
      x.strokeStyle = 'rgba(0,0,0,.35)';
      x.lineWidth = 9;
      x.beginPath();
      x.arc(cx, cy, rr, 0, Math.PI * 2);
      x.stroke();
      x.strokeStyle = ph === P_BLACK ? '#ffd23a' : '#7fe0ff';
      x.lineWidth = 6;
      x.beginPath();
      x.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(p, 0, 1));
      x.stroke();
    }
    // medidor da inclinação: verde (bom), amarelo, vermelho (o ouro cai)
    if (ph === P_WASH) {
      const gx = cx + R * 1.28;
      const top = cy - R * 0.8;
      const hh = R * 1.6;
      const red = RED[this.o.diff];
      x.lineCap = 'butt';
      x.lineWidth = 14;
      this.seg(gx, top, hh, 0, 0.3, 'rgba(255,255,255,.35)');
      this.seg(gx, top, hh, 0.3, red - 0.1, '#3fcf5a');
      this.seg(gx, top, hh, red - 0.1, red, '#ffc21a');
      this.seg(gx, top, hh, red, 1.3, '#ff3a2a');
      const ny = top + hh - (Math.min(1.3, this.tilt) / 1.3) * hh;
      x.fillStyle = '#ffffff';
      x.strokeStyle = 'rgba(0,0,0,.6)';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(gx - 16, ny);
      x.lineTo(gx - 4, ny - 8);
      x.lineTo(gx - 4, ny + 8);
      x.closePath();
      x.fill();
      x.stroke();
    }
    // "Uau!"
    if (this.wowT > 0 && this.wowTxt) {
      const a = Math.min(1, this.wowT * 2);
      const s = 1 + (1 - Math.min(1, (2 - this.wowT) * 4)) * 0.6;
      x.save();
      x.globalAlpha = a;
      x.translate(cx, cy - R * 0.55);
      x.scale(s, s);
      x.font = '900 40px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.lineWidth = 7;
      x.strokeStyle = '#6b3500';
      x.strokeText(this.wowTxt, 0, 0);
      x.fillStyle = '#ffe14a';
      x.fillText(this.wowTxt, 0, 0);
      x.restore();
    }
    // mãozinha do tutorial
    if (this.idle > (this.phT < 3 ? 0.5 : 1.8) && ph !== P_DONE) this.drawHand();
  }

  private seg(gx: number, top: number, hh: number, a: number, b: number, c: string): void {
    const x = this.x;
    x.strokeStyle = c;
    x.beginPath();
    x.moveTo(gx, top + hh - (a / 1.3) * hh);
    x.lineTo(gx, top + hh - (b / 1.3) * hh);
    x.stroke();
  }

  private drawHand(): void {
    const x = this.x;
    const R = this.R;
    const ph = this.ph;
    const T = this.time;
    let hx = this.pcx;
    let hy = this.pcy;
    let press = true;
    if (ph === P_SIEVE) {
      if (this.sieveOut > 0.9) {
        // aponta uma pedra (ou a pepita)
        let best = -1;
        for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && (this.pt[i] === NG || (this.pt[i] === RK && best < 0))) best = i;
        if (best >= 0) {
          const [sx, sy] = this.toSieve(this.px[best], this.py[best]);
          hx = sx;
          hy = sy;
          press = (T * 1.5) % 1 < 0.4;
        }
      } else {
        hx = this.pcx + Math.sin(T * 7) * R * 0.3;
        hy = this.pcy + R * 0.25;
      }
    } else if (ph === P_SCOOP) {
      const f = (T * 0.7) % 1;
      hx = this.bkx + (this.pcx - this.bkx) * f;
      hy = this.bky + (this.pcy - this.bky) * f - Math.sin(f * Math.PI) * R * 0.3;
    } else if (ph === P_DIP) {
      const f = (T * 0.8) % 1;
      hy = this.pcy - R * 0.3 + f * R * 0.6;
    } else if (ph === P_SWIRL || ph === P_BLACK) {
      const rr = ph === P_BLACK ? R * 0.35 : R * 0.6;
      const a = T * (ph === P_BLACK ? 2.2 : 5);
      hx = this.pcx + Math.cos(a) * rr;
      hy = this.pcy + Math.sin(a) * rr;
    } else if (ph === P_WASH) {
      const f = Math.min(1, ((T * 0.6) % 1) * 1.6);
      hx = this.pcx + f * R * 0.65;
      hy = this.pcy + R * 0.2;
    } else if (ph === P_PICK) {
      let best = -1;
      for (let i = 0; i < this.n; i++) if (this.pa[i] === A_IN && this.pt[i] >= AU) best = i;
      if (best < 0) return;
      const [sx, sy] = this.toScreen(this.px[best], this.py[best]);
      const f = (T * 0.8) % 1;
      hx = sx + Math.sin(f * Math.PI * 2) * R * 0.08;
      hy = sy + Math.cos(f * Math.PI * 2) * R * 0.05;
    }
    // trilha (círculo ou seta) e a mão
    x.save();
    x.translate(hx, hy);
    const s = (Math.min(this.W, this.H) / 390) * 0.95 * (press ? 0.92 : 1);
    x.scale(s, s);
    x.rotate(-0.35);
    x.fillStyle = 'rgba(0,0,0,.3)';
    x.translate(3, 4);
    x.fill(this.hand);
    x.translate(-3, -4);
    x.fillStyle = '#fff3e0';
    x.strokeStyle = '#4a2a10';
    x.lineWidth = 3;
    x.fill(this.hand);
    x.stroke(this.hand);
    x.restore();
    if (press) {
      x.strokeStyle = 'rgba(255,255,255,.8)';
      x.lineWidth = 3;
      x.beginPath();
      x.arc(hx, hy, 10 + ((T * 3) % 1) * 12, 0, Math.PI * 2);
      x.stroke();
    }
  }

  private stageUi(): void {
    const ph = this.ph;
    const cur = ph === P_SIEVE ? 0 : ph <= P_SWIRL ? 1 : ph === P_WASH ? 2 : 3;
    this.stageEls.forEach((e, i) => {
      e.classList.toggle('on', i === cur);
      e.classList.toggle('done', i < cur);
    });
    (this.el.querySelector('.gbp-skip') as HTMLElement).hidden = ph !== P_SIEVE;
  }

  private voice(key: string, text: string, again = false): void {
    if (this.said.has(key) && !again) return;
    this.said.add(key);
    speak(text, { gap: 900 });
  }

  dispose(): void {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.layout);
    window.removeEventListener('deviceorientation', this.onOri);
    this.el.remove();
  }

  /** testes (Playwright): posições na tela de um tipo de grão (0 pedra … 4 ouro, 5 pepita) */
  where(type: number): number[][] {
    const out: number[][] = [];
    for (let i = 0; i < this.n; i++) {
      if (this.pa[i] !== A_IN || this.pt[i] !== type) continue;
      const p = this.ph === P_SIEVE ? this.toSieve(this.px[i], this.py[i]) : this.toScreen(this.px[i], this.py[i]);
      out.push([Math.round(p[0]), Math.round(p[1])]);
    }
    return out;
  }
  layoutInfo(): number[] {
    return [this.pcx, this.pcy, this.R];
  }
  /** testes (Playwright): estado resumido */
  info(): Record<string, number> {
    let au = 0;
    let light = 0;
    for (let i = 0; i < this.n; i++)
      if (this.pa[i] === A_IN) {
        if (this.pt[i] >= AU) au++;
        if (this.pt[i] <= SD) light++;
      }
    return { ph: this.ph, prog: this.prog, tilt: this.tilt, got: this.got, lost: this.lost, total: this.total, au, light, sieve: this.sieveOut, sub: this.sub, murk: this.murk };
  }
}

const _p: [number, number] = [0, 0];
const _q: [number, number] = [0, 0];
