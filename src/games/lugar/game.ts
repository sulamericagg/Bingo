/* ============================================================
 *  BLOOP NO LUGAR — jogo (chunk sob demanda)
 *  Telas: início → (trilha de fases | desafio do dia | zen) → partida → vitória/sem corações.
 *  Regras: um Bloop por linha, coluna e cor; Bloops não se encostam (nem na diagonal).
 *  Fases da trilha e do dia são conferidas com a solução única: Bloop no lugar errado custa
 *  um coração. No Zen não há corações: conflitos só ficam destacados.
 * ============================================================ */
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { QualityGovernor } from '../../core/quality';
import { dayNumber, persist as persistGlobal, save as globalSave } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { clubActive, maybeInterstitial, rewardedAvailable, showRewarded } from '../../services/ads';
import { icon } from '../../ui/icons';
import { notify } from '../../ui/notify';
import { AUTO, BLOOP, Board, EMPTY, MARK } from './board';
import { Logic, QQ, XX, nextStep, generate, hash32, type Puzzle, type Step } from './engine';
import { hintReveal, hintText, hintTitle, hintWrongBloop, hintWrongX, type HintKind } from './hints';
import { CHAPTERS, LEVELS, PER_CHAPTER, chapterSize, dailyPuzzle, levelPuzzle } from './levels';
import { REGION_COLORS } from './palette';
import { FREE_HINTS, hintsLeft, lugarSave, persistLugar, spendHint, starCount, totalStars, type LugarSave } from './save';
import { sfx } from './sfx';
import { injectLugarCss } from './style';

type Mode = 'level' | 'daily' | 'zen';

const DEBUG = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search);
const DEBUG_PRO = DEBUG && /[?&]lugarpro\b/.test(location.search);

const tierName = (k: number): string =>
  [t('lugar.d0', 'Fácil'), t('lugar.d1', 'Médio'), t('lugar.d2', 'Difícil'), t('lugar.d3', 'Expert'), t('lugar.d4', 'Mestre')][k] ?? '';
const TIER_COL = ['#3ee07a', '#5ec8ff', '#ffb02e', '#ff5c8a', '#b56bff'];

const chapterName = (ch: number): string =>
  [
    t('lugar.ch0', 'Quintal'),
    t('lugar.ch1', 'Jardim'),
    t('lugar.ch2', 'Praia'),
    t('lugar.ch3', 'Bosque'),
    t('lugar.ch4', 'Doceria'),
    t('lugar.ch5', 'Montanha'),
    t('lugar.ch6', 'Lagoa'),
    t('lugar.ch7', 'Feira'),
    t('lugar.ch8', 'Nuvens'),
    t('lugar.ch9', 'Recife'),
    t('lugar.ch10', 'Deserto'),
    t('lugar.ch11', 'Galáxia'),
  ][ch % 12];

const mmss = (s: number): string => {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** tempo "rapidinho" para a 3ª estrela */
const parTime = (p: Puzzle): number => Math.round(p.n * p.n * 1.5 + p.rating.tier * p.n * 6 + 20);

function isPro(): boolean {
  if (DEBUG_PRO) return true;
  if (clubActive()) return true;
  return false;
}
/** assinaturas/passes premium (carregados sob demanda; sem travar a abertura) */
let proCache = false;
function refreshPro(): void {
  Promise.all([import('../../pass/state'), import('../../pass/mstate'), import('../../pass/home/state')])
    .then(([a, b, c]) => {
      try {
        proCache = a.isPremium() || b.musicPremium() || c.homePremium();
      } catch {
        proCache = false;
      }
    })
    .catch(() => {});
}
const pro = (): boolean => isPro() || proCache;

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectLugarCss();
  refreshPro();
  return new LugarGame(root, exit);
}

interface HintState {
  kind: HintKind;
  step: Step | null;
  cell: number;
}

class LugarGame implements MiniGameHandle {
  private el: HTMLDivElement;
  private sv: LugarSave = lugarSave();
  private gov = new QualityGovernor({ emit: false, persist: false });
  private dead = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private offs: (() => void)[] = [];
  private popBack: (() => void) | null = null;
  // partida
  private mode: Mode = 'level';
  private idx = 0;
  private day = 0;
  private pz: Puzzle | null = null;
  private L0: Logic | null = null;
  private zones: number[][] = [];
  private cells = new Uint8Array(0);
  private hearts = 3;
  private mistakes = 0;
  private hintsUsed = 0;
  private time = 0;
  private running = false;
  private won = false;
  private undoS: Uint8Array[] = [];
  private redoS: Uint8Array[] = [];
  private lastTap: { c: number; t: number; before: Uint8Array; beforeV: number } | null = null;
  private paint: 'x' | 'erase' = 'x';
  private painted = 0;
  private hint: HintState | null = null;
  private regionsDone = new Set<number>();
  private board: Board | null = null;
  private saveT = 0;
  private lastSec = -1;
  private ui: { timer?: HTMLElement; hearts?: HTMLElement; undo?: HTMLButtonElement; redo?: HTMLButtonElement; hintBadge?: HTMLElement; stage?: HTMLElement; hintCard?: HTMLElement } = {};

  constructor(
    root: HTMLElement,
    private exitFn: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'lg-root';
    root.appendChild(this.el);
    const onResize = () => this.layout();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    if (DEBUG) (window as unknown as { __lugar: unknown }).__lugar = this;
    this.home();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ============================== utilidades ============================== */
  private clear(): HTMLDivElement {
    this.board?.destroy();
    this.board = null;
    this.ui = {};
    this.closeBack();
    this.el.innerHTML = '';
    const d = document.createElement('div');
    this.el.appendChild(d);
    return d;
  }
  private ov(cls = ''): HTMLDivElement {
    const d = this.clear();
    d.className = 'lg-ov ' + cls;
    return d;
  }
  private bind(root: ParentNode, sel: string, fn: (b: HTMLElement) => void, haptic = true): void {
    root.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.unlock();
        audio.click();
        if (haptic) tap('light');
        fn(b);
      }),
    );
  }
  private closeBack(): void {
    this.popBack?.();
    this.popBack = null;
  }
  private logo(big = true): string {
    const word = t('lugar.name', 'Bloop no Lugar');
    const cols = ['#ff9ec4', '#ffe066', '#8fd6ff', '#9be8b4', '#c6a8ff', '#ffb47a'];
    let i = 0;
    return `<div class="lg-logo${big ? '' : ' sm'}">${[...word].map((ch) => (ch === ' ' ? '<i> </i>' : `<span style="color:${cols[i % cols.length]};animation-delay:${(i++ * 0.07).toFixed(2)}s">${ch}</span>`)).join('')}</div>`;
  }
  private bloopImg(R: number, mood: 'idle' | 'happy' | 'dead', lookY = 0): HTMLCanvasElement {
    const c = Board.bigBloop(R * Math.min(2, window.devicePixelRatio || 1), mood, lookY);
    c.style.width = c.style.height = `${(c.width / Math.min(2, window.devicePixelRatio || 1)).toFixed(0)}px`;
    return c;
  }

  /* ============================== início ============================== */
  private home(): void {
    this.running = false;
    const d = this.ov('lg-home');
    const s = this.sv;
    const next = Math.min(LEVELS - 1, s.unlocked);
    const today = dayNumber();
    const dailyDone = s.dailyDay === today;
    const streak = s.dailyDay >= today - 1 ? s.dailyStreak : 0;
    const resume = s.prog && s.prog.key === 'L' + next;
    d.innerHTML = `
      <div class="lg-hero"></div>
      ${this.logo()}
      <div class="lg-sub">${t('lugar.tagline', 'Um Bloop por linha, coluna e cor. E nada de encostar!')}</div>
      <div class="lg-stats">
        <span class="lg-pill">${icon('star', { size: 18 })}${fmt(totalStars())}</span>
        <span class="lg-pill">${icon('check', { size: 18 })}${fmt(s.solved)}</span>
        <span class="lg-pill">${icon('fire', { size: 18 })}${streak}</span>
      </div>
      <button class="lg-btn lg-green lg-big lg-play-btn" data-a="play">${icon('play', { size: 28 })}<span><b>${resume ? t('lugar.continue', 'Continuar') : t('lugar.play', 'Jogar')}</b><small>${t('lugar.levelN', 'Fase {n}', { n: next + 1 })} · ${chapterSize(Math.floor(next / PER_CHAPTER))}×${chapterSize(Math.floor(next / PER_CHAPTER))}</small></span></button>
      <div class="lg-modes">
        <button class="lg-mode lg-m1" data-a="daily"><span class="lg-mi">${icon('calendar', { size: 30 })}</span><span><b>${t('lugar.daily', 'Desafio do dia')}</b><small>${dailyDone ? t('lugar.dailyDone', 'Feito! {t} · volte amanhã', { t: mmss(s.dailyTime) }) : t('lugar.dailyD', 'O mesmo para todo mundo hoje')}</small></span></button>
        <button class="lg-mode lg-m2" data-a="zen"><span class="lg-mi">${icon('sparkle', { size: 30 })}</span><span><b>${t('lugar.zen', 'Zen')}</b><small>${t('lugar.zenD', 'Sem corações, sem pressa')}</small></span></button>
      </div>
      <div class="lg-row">
        <button class="lg-btn lg-grow" data-a="map">${icon('target', { size: 20 })}${t('lugar.map', 'Fases')}</button>
        <button class="lg-btn lg-grow" data-a="how">${icon('lamp', { size: 20 })}${t('lugar.how', 'Como jogar')}</button>
        <button class="lg-btn lg-ic" data-a="settings" aria-label="${t('lugar.settings', 'Ajustes')}">${icon('gear', { size: 22 })}</button>
      </div>
      <button class="lg-btn lg-ghost" data-a="exit">${icon('home', { size: 20 })}${t('lugar.exit', 'Sair')}</button>`;
    const hero = d.querySelector('.lg-hero')!;
    hero.appendChild(this.bloopImg(34, 'happy'));
    this.bind(d, '[data-a=play]', () => this.startLevel(next));
    this.bind(d, '[data-a=daily]', () => this.startDaily());
    this.bind(d, '[data-a=zen]', () => this.zenPicker());
    this.bind(d, '[data-a=map]', () => this.map(Math.floor(next / PER_CHAPTER)));
    this.bind(d, '[data-a=how]', () => this.howTo(() => this.home()));
    this.bind(d, '[data-a=settings]', () => this.settings(() => this.home()));
    this.bind(d, '[data-a=exit]', () => this.exitFn());
  }

  /* ============================== mapa ============================== */
  private map(ch: number): void {
    this.running = false;
    ch = Math.max(0, Math.min(CHAPTERS - 1, ch));
    const d = this.ov('lg-mapov');
    const s = this.sv;
    const n = chapterSize(ch);
    const first = ch * PER_CHAPTER;
    let chStars = 0;
    for (let i = first; i < first + PER_CHAPTER; i++) chStars += starCount(s.stars[i] ?? 0);
    const nodes: string[] = [];
    for (let j = 0; j < PER_CHAPTER; j++) {
      const i = first + j;
      const m = s.stars[i] ?? 0;
      const done = !!(m & 8);
      const cur = i === s.unlocked;
      const locked = i > s.unlocked;
      const row = Math.floor(j / 4);
      const col = row % 2 ? 3 - (j % 4) : j % 4;
      const st = [1, 2, 4].map((b) => `<i class="${m & b ? 'on' : ''}"></i>`).join('');
      nodes.push(
        `<button class="lg-node${done ? ' done' : ''}${cur ? ' cur' : ''}${locked ? ' locked' : ''}" style="grid-row:${row + 1};grid-column:${col + 1}" data-l="${i}" ${locked ? 'aria-disabled="true"' : ''}><b>${locked ? icon('lock', { size: 20 }) : i + 1}</b>${done ? `<span class="lg-nstars">${st}</span>` : ''}</button>`,
      );
    }
    d.innerHTML = `
      <div class="lg-maphead">
        <button class="lg-btn lg-ic" data-a="back" aria-label="${t('lugar.back', 'Voltar')}">${icon('home', { size: 22 })}</button>
        <div class="lg-chtitle"><b>${chapterName(ch)}</b><small>${t('lugar.chapterN', 'Capítulo {n}', { n: ch + 1 })} · ${n}×${n} · ${icon('star', { size: 14 })}${chStars}/${PER_CHAPTER * 3}</small></div>
        <span class="lg-btn lg-ic lg-ghostic"></span>
      </div>
      <div class="lg-mapwrap" style="--chc:${REGION_COLORS[ch % 12].fill};--chd:${REGION_COLORS[ch % 12].deep}">
        <div class="lg-map">${nodes.join('')}</div>
      </div>
      <div class="lg-row lg-chnav">
        <button class="lg-btn lg-grow" data-a="prev" ${ch === 0 ? 'disabled' : ''}>‹ ${t('lugar.prevCh', 'Anterior')}</button>
        <span class="lg-pill">${ch + 1}/${CHAPTERS}</span>
        <button class="lg-btn lg-grow" data-a="next" ${ch === CHAPTERS - 1 ? 'disabled' : ''}>${t('lugar.nextCh', 'Próximo')} ›</button>
      </div>`;
    this.bind(d, '[data-a=back]', () => this.home());
    this.bind(d, '[data-a=prev]', () => this.map(ch - 1));
    this.bind(d, '[data-a=next]', () => this.map(ch + 1));
    this.bind(d, '[data-l]', (b) => {
      const i = +b.dataset.l!;
      if (i > s.unlocked) {
        notify(t('lugar.lockedMsg', 'Termine a fase {n} para liberar esta.', { n: s.unlocked + 1 }), { icon: 'lock' });
        return;
      }
      this.startLevel(i);
    });
    this.popBack = pushBack(() => this.home());
    d.querySelector('.lg-node.cur')?.scrollIntoView({ block: 'center' });
  }

  /* ============================== modos ============================== */
  private startLevel(i: number): void {
    if (!this.sv.tutorial && i === 0) {
      this.sv.tutorial = true;
      persistLugar();
      this.howTo(() => this.startLevel(0), true);
      return;
    }
    this.loading(() => {
      this.mode = 'level';
      this.idx = i;
      this.begin(levelPuzzle(i), 'L' + i);
    });
  }
  private startDaily(): void {
    this.loading(() => {
      this.mode = 'daily';
      this.day = dayNumber();
      this.begin(dailyPuzzle(this.day), 'D' + this.day);
    });
  }
  private zenPicker(): void {
    const d = this.ov('lg-center');
    const s = this.sv;
    const render = () => {
      d.innerHTML = `
        <div class="lg-card">
          <div class="lg-ctitle">${icon('sparkle', { size: 26 })}${t('lugar.zen', 'Zen')}</div>
          <p class="lg-p">${t('lugar.zenInfo', 'Tabuleiros novinhos sem fim. Sem corações e sem relógio: os erros só ficam destacados. Dicas à vontade!')}</p>
          <div class="lg-lbl">${t('lugar.size', 'Tamanho')}</div>
          <div class="lg-sizes">${[5, 6, 7, 8, 9, 10, 11, 12].map((k) => `<button data-n="${k}" class="${s.zenSize === k ? 'on' : ''}">${k}×${k}</button>`).join('')}</div>
          <button class="lg-btn lg-green lg-big" data-a="go">${icon('play', { size: 24 })}${t('lugar.start', 'Começar')}</button>
          <button class="lg-btn lg-ghost" data-a="back">${t('lugar.back', 'Voltar')}</button>
        </div>`;
      this.bind(d, '[data-n]', (b) => {
        s.zenSize = +b.dataset.n!;
        persistLugar();
        render();
      });
      this.bind(d, '[data-a=go]', () => this.startZen());
      this.bind(d, '[data-a=back]', () => this.home());
    };
    render();
    this.popBack = pushBack(() => this.home());
  }
  private startZen(): void {
    const n = this.sv.zenSize;
    const resume = this.sv.prog && this.sv.prog.key.startsWith(`Z${n}-`) ? this.sv.prog.key : null;
    const seed = resume ? +resume.split('-')[1] : (hash32(Date.now() & 0x7fffffff, n) % 900000) + 1;
    this.loading(() => {
      this.mode = 'zen';
      this.begin(generate(n, seed), `Z${n}-${seed}`);
    });
  }
  /** tela "preparando" (tabuleiros grandes levam um instante para gerar) */
  private loading(fn: () => void): void {
    const d = this.ov('lg-center');
    d.innerHTML = `<div class="lg-loading"><i></i><i></i><i></i></div><div class="lg-sub">${t('lugar.loading', 'Arrumando os cantinhos…')}</div>`;
    setTimeout(() => {
      if (this.dead) return;
      try {
        fn();
      } catch (e) {
        console.warn('[lugar]', e);
        notify(t('lugar.genFail', 'Não deu para montar esse tabuleiro. Tente de novo!'), { kind: 'bad' });
        this.home();
      }
    }, 40);
  }

  /* ============================== partida ============================== */
  private key = '';
  private begin(p: Puzzle, key: string): void {
    this.pz = p;
    this.key = key;
    this.L0 = new Logic(p.n, p.reg);
    this.zones = [];
    for (let c = 0; c < p.n * p.n; c++) this.zones.push(this.L0.zone(c));
    const pr = this.sv.prog && this.sv.prog.key === key && this.sv.prog.cells.length === p.n * p.n ? this.sv.prog : null;
    this.cells = pr ? Uint8Array.from(pr.cells) : new Uint8Array(p.n * p.n);
    this.hearts = pr ? pr.hearts : 3;
    this.mistakes = pr ? pr.mistakes : 0;
    this.hintsUsed = pr ? pr.hints : 0;
    this.time = pr ? pr.time : 0;
    this.undoS = [];
    this.redoS = [];
    this.hint = null;
    this.won = false;
    this.regionsDone.clear();
    for (let c = 0; c < this.cells.length; c++) if (this.cells[c] === BLOOP) this.regionsDone.add(p.reg[c]);
    this.playScreen();
    this.running = true;
    if (this.hearts <= 0 && this.mode !== 'zen' && !this.infinite()) this.outOfHearts();
  }
  private infinite(): boolean {
    return this.sv.infinite && pro();
  }

  private playScreen(): void {
    const p = this.pz!;
    const d = this.clear();
    d.className = 'lg-play';
    const title =
      this.mode === 'level' ? t('lugar.levelN', 'Fase {n}', { n: this.idx + 1 }) : this.mode === 'daily' ? t('lugar.daily', 'Desafio do dia') : t('lugar.zen', 'Zen');
    d.innerHTML = `
      <div class="lg-top">
        <button class="lg-btn lg-ic" data-a="menu" aria-label="${t('lugar.back', 'Voltar')}">${icon('pause', { size: 22 })}</button>
        <div class="lg-ttl"><b>${title}</b><small><i class="lg-dot" style="background:${TIER_COL[p.rating.tier]}"></i>${tierName(p.rating.tier)} · ${p.n}×${p.n}</small></div>
        <div class="lg-timer">${icon('clock', { size: 18 })}<span>0:00</span></div>
      </div>
      <div class="lg-hearts"></div>
      <div class="lg-stage"></div>
      <div class="lg-hintcard" hidden></div>
      <div class="lg-tools">
        <button class="lg-tool" data-a="undo"><span>${undoSvg()}</span><small>${t('lugar.undo', 'Desfazer')}</small></button>
        <button class="lg-tool" data-a="redo"><span style="transform:scaleX(-1)">${undoSvg()}</span><small>${t('lugar.redo', 'Refazer')}</small></button>
        <button class="lg-tool lg-hinttool" data-a="hint"><span>${icon('lamp', { size: 30 })}<em class="lg-badge"></em></span><small>${t('lugar.hint', 'Dica')}</small></button>
        <button class="lg-tool" data-a="clear"><span>${icon('refresh', { size: 28 })}</span><small>${t('lugar.clear', 'Limpar')}</small></button>
        <button class="lg-tool" data-a="settings"><span>${icon('gear', { size: 28 })}</span><small>${t('lugar.settings', 'Ajustes')}</small></button>
      </div>`;
    this.ui.timer = d.querySelector('.lg-timer span') as HTMLElement;
    this.ui.hearts = d.querySelector('.lg-hearts') as HTMLElement;
    this.ui.undo = d.querySelector('[data-a=undo]') as HTMLButtonElement;
    this.ui.redo = d.querySelector('[data-a=redo]') as HTMLButtonElement;
    this.ui.hintBadge = d.querySelector('.lg-badge') as HTMLElement;
    this.ui.stage = d.querySelector('.lg-stage') as HTMLElement;
    this.ui.hintCard = d.querySelector('.lg-hintcard') as HTMLElement;
    if (this.mode === 'zen') (d.querySelector('.lg-timer') as HTMLElement).classList.add('zen');
    const b = new Board({
      press: () => {},
      tap: (c) => this.onTap(c),
      hold: (c) => this.onHold(c),
      dragStart: (c) => this.onDragStart(c),
      dragCell: (c) => this.onDragCell(c),
      dragEnd: () => this.onDragEnd(),
    });
    b.patterns = this.sv.patterns;
    b.setPuzzle(p.n, p.reg, this.cells);
    this.board = b;
    this.ui.stage.appendChild(b.canvas);
    this.bind(d, '[data-a=menu]', () => this.pauseMenu());
    const tb = (sel: string, fn: () => void) =>
      d.querySelector<HTMLElement>(sel)!.addEventListener('click', () => {
        audio.unlock();
        tap('light');
        fn();
      });
    tb('[data-a=undo]', () => this.undo());
    tb('[data-a=redo]', () => this.redo());
    tb('[data-a=hint]', () => this.askHint());
    tb('[data-a=clear]', () => this.confirmClear());
    tb('[data-a=settings]', () => this.settings(() => this.backToPlay(), true));
    this.renderHearts();
    this.updateTools();
    this.layout();
    this.afterChange(false);
    this.playBack();
  }
  /** voltar do Android durante a partida abre a pausa (e continua valendo depois) */
  private playBack(): void {
    this.closeBack();
    this.popBack = pushBack(() => {
      this.popBack = null;
      this.playBack();
      this.pauseMenu();
    });
  }
  private backToPlay(): void {
    // volta da tela de ajustes sem recriar a partida
    this.el.querySelectorAll('.lg-sheet').forEach((x) => x.remove());
    this.running = !this.won;
    if (this.board) {
      this.board.patterns = this.sv.patterns;
      this.board.setPuzzle(this.pz!.n, this.pz!.reg, this.cells);
    }
    this.applyAutoX();
    this.afterChange(false);
    this.playBack();
  }

  private layout(): void {
    const st = this.ui.stage;
    if (!st || !this.board) return;
    const w = st.clientWidth;
    const h = st.clientHeight;
    const size = Math.floor(Math.max(160, Math.min(w, h, 760)));
    this.board.resize(size, this.gov.settings.dprCap);
  }

  private renderHearts(lost = -1): void {
    const el = this.ui.hearts;
    if (!el) return;
    if (this.mode === 'zen') {
      el.innerHTML = `<span class="lg-zen">${icon('sparkle', { size: 18 })}${t('lugar.zenTag', 'Modo Zen · sem corações')}</span>`;
      return;
    }
    if (this.infinite()) {
      el.innerHTML = `<span class="lg-heart">${icon('heart', { size: 30 })}</span><b class="lg-inf">∞</b>`;
      return;
    }
    el.innerHTML = [0, 1, 2].map((i) => `<span class="lg-heart${i >= this.hearts ? ' off' : ''}${i === lost ? ' lost' : ''}">${icon('heart', { size: 30 })}</span>`).join('');
  }
  private updateTools(): void {
    if (this.ui.undo) this.ui.undo.disabled = !this.undoS.length;
    if (this.ui.redo) this.ui.redo.disabled = !this.redoS.length;
    if (this.ui.hintBadge) {
      const free = this.mode === 'zen' || pro();
      const k = hintsLeft();
      this.ui.hintBadge.textContent = free ? '∞' : k > 0 ? String(k) : '+';
      this.ui.hintBadge.classList.toggle('ad', !free && k <= 0);
    }
  }

  /* ------------------------------ ações nas casas ------------------------------ */
  private snap(): void {
    this.undoS.push(this.cells.slice());
    if (this.undoS.length > 300) this.undoS.shift();
    this.redoS.length = 0;
  }
  private onTap(c: number): void {
    if (!this.running) return;
    const v = this.cells[c];
    const now = performance.now();
    if (this.sv.input === 'cycle') {
      if (v === EMPTY) this.markCell(c);
      else if (v === MARK || v === AUTO) this.placeBloop(c);
      else this.removeBloop(c);
      return;
    }
    // modo "toque = X, toque duplo = Bloop"
    const lt = this.lastTap;
    if (lt && lt.c === c && now - lt.t < 340) {
      this.lastTap = null;
      // desfaz o 1º toque e faz a ação do toque duplo
      if (this.undoS.length && lt.before && this.cells.some((x, i) => x !== lt.before[i])) {
        this.cells.set(lt.before);
        this.undoS.pop();
      }
      if (lt.beforeV === BLOOP) this.removeBloop(c);
      else this.placeBloop(c);
      return;
    }
    this.lastTap = { c, t: now, before: this.cells.slice(), beforeV: v };
    if (v === EMPTY) this.markCell(c);
    else if (v === MARK || v === AUTO) this.unmarkCell(c);
    // tocar num Bloop uma vez não faz nada (toque duplo tira)
  }
  private onHold(c: number): void {
    if (!this.running) return;
    if (this.cells[c] === BLOOP) return;
    this.placeBloop(c);
  }
  private onDragStart(c: number): boolean {
    if (!this.running) return false;
    const v = this.cells[c];
    if (v === BLOOP) return false;
    this.lastTap = null;
    this.paint = v === MARK ? 'erase' : 'x';
    this.painted = 0;
    this.snap();
    this.paintCell(c);
    return true;
  }
  private onDragCell(c: number): void {
    this.paintCell(c);
  }
  private paintCell(c: number): void {
    const v = this.cells[c];
    if (this.paint === 'x' && (v === EMPTY || v === AUTO)) {
      this.cells[c] = MARK;
      this.board?.mark(c);
      sfx.mark(this.painted);
      if (this.painted++ % 2 === 0) tap('light');
    } else if (this.paint === 'erase' && v === MARK) {
      this.cells[c] = EMPTY;
      sfx.unmark();
      this.painted++;
    }
    this.board && (this.board.dirty = true);
  }
  private onDragEnd(): void {
    if (!this.painted) this.undoS.pop();
    this.applyAutoX();
    this.afterChange();
  }
  private markCell(c: number): void {
    this.snap();
    this.cells[c] = MARK;
    this.board?.mark(c);
    sfx.mark();
    tap('light');
    this.afterChange();
  }
  private unmarkCell(c: number): void {
    this.snap();
    this.cells[c] = EMPTY;
    sfx.unmark();
    this.applyAutoX();
    this.afterChange();
  }
  private placeBloop(c: number, trusted = false): void {
    const p = this.pz!;
    const n = p.n;
    if (!trusted && this.mode !== 'zen' && p.sol[Math.floor(c / n)] !== c % n) {
      // lugar errado: coração a menos, o Bloop fica tonto e vira X
      this.snap();
      this.cells[c] = MARK;
      this.board?.wrong(c);
      this.mistakes++;
      sfx.wrong();
      tap('heavy');
      const inf = this.infinite();
      if (!inf) this.hearts = Math.max(0, this.hearts - 1);
      this.renderHearts(inf ? -1 : this.hearts);
      notify(this.hearts > 0 || inf ? t('lugar.wrong', 'Aí não mora Bloop!') : t('lugar.wrongLast', 'Ih, acabaram os corações…'), { kind: 'bad', icon: 'heart', key: 'lg-wrong' });
      this.afterChange();
      if (!inf && this.hearts <= 0) {
        this.running = false;
        setTimeout(() => !this.dead && this.outOfHearts(), 950);
      }
      return;
    }
    this.snap();
    this.cells[c] = BLOOP;
    let k = 0;
    for (const v of this.cells) if (v === BLOOP) k++;
    this.board?.pop(c);
    sfx.pop(k - 1);
    tap('medium');
    this.applyAutoX();
    const g = p.reg[c];
    if (!this.regionsDone.has(g)) {
      this.regionsDone.add(g);
      setTimeout(() => {
        if (this.dead || this.cells[c] !== BLOOP) return;
        this.board?.regionDone(g);
        sfx.region(k);
      }, 160);
    }
    this.afterChange();
    this.checkWin();
  }
  private removeBloop(c: number): void {
    this.snap();
    this.cells[c] = EMPTY;
    this.regionsDone.delete(this.pz!.reg[c]);
    sfx.remove();
    tap('light');
    this.applyAutoX();
    this.afterChange();
  }
  /** X automáticos: aparecem em volta dos Bloops e somem quando o Bloop sai */
  private applyAutoX(): void {
    const cov = new Uint8Array(this.cells.length);
    for (let c = 0; c < this.cells.length; c++) if (this.cells[c] === BLOOP) for (const d of this.zones[c]) cov[d] = 1;
    for (let c = 0; c < this.cells.length; c++) {
      if (this.cells[c] === AUTO && (!cov[c] || !this.sv.autoX)) this.cells[c] = EMPTY;
      else if (this.cells[c] === EMPTY && cov[c] && this.sv.autoX) {
        this.cells[c] = AUTO;
        this.board?.mark(c);
      }
    }
    if (this.board) this.board.dirty = true;
  }
  private afterChange(saveIt = true): void {
    const p = this.pz;
    const b = this.board;
    if (!p || !b) return;
    const n = p.n;
    // conflitos: Bloops que se atacam + filas/cores todas riscadas sem Bloop
    const conf = new Set<number>();
    const qs: number[] = [];
    for (let c = 0; c < this.cells.length; c++) if (this.cells[c] === BLOOP) qs.push(c);
    for (let i = 0; i < qs.length; i++)
      for (let j = i + 1; j < qs.length; j++)
        if (this.zones[qs[i]].includes(qs[j])) {
          conf.add(qs[i]);
          conf.add(qs[j]);
        }
    const dead: number[] = [];
    const L = this.L0!;
    for (let u = 0; u < 3 * n; u++) {
      let ok = false;
      for (const c of L.units[u])
        if (this.cells[c] === EMPTY || this.cells[c] === BLOOP) {
          ok = true;
          break;
        }
      if (!ok) dead.push(u);
    }
    b.conflictCells = conf;
    b.deadUnits = dead;
    b.dirty = true;
    if (this.hint && saveIt) this.closeHint();
    this.updateTools();
    if (saveIt) this.queueSave();
  }
  private queueSave(): void {
    clearTimeout(this.saveT);
    this.saveT = window.setTimeout(() => this.saveProgress(), 600);
  }
  private saveProgress(): void {
    if (!this.pz || this.won) return;
    this.sv.prog = { key: this.key, cells: [...this.cells], hearts: this.hearts, time: Math.round(this.time), hints: this.hintsUsed, mistakes: this.mistakes };
    persistLugar();
  }

  private undo(): void {
    if (!this.running || !this.undoS.length) return;
    this.redoS.push(this.cells.slice());
    this.cells.set(this.undoS.pop()!);
    this.syncRegions();
    sfx.undo();
    this.applyAutoX();
    this.afterChange();
  }
  private redo(): void {
    if (!this.running || !this.redoS.length) return;
    this.undoS.push(this.cells.slice());
    this.cells.set(this.redoS.pop()!);
    this.syncRegions();
    sfx.undo();
    this.applyAutoX();
    this.afterChange();
    this.checkWin();
  }
  private syncRegions(): void {
    this.regionsDone.clear();
    for (let c = 0; c < this.cells.length; c++) if (this.cells[c] === BLOOP) this.regionsDone.add(this.pz!.reg[c]);
  }
  private confirmClear(): void {
    if (!this.running) return;
    if (!this.cells.some((v) => v !== EMPTY)) return;
    this.sheet(
      `<div class="lg-ctitle">${icon('refresh', { size: 24 })}${t('lugar.clearQ', 'Limpar o tabuleiro?')}</div>
       <p class="lg-p">${t('lugar.clearInfo', 'Tira todos os X e Bloops. Os corações e o tempo continuam como estão.')}</p>
       <div class="lg-row"><button class="lg-btn lg-grow lg-ghost" data-a="no">${t('lugar.cancel', 'Cancelar')}</button><button class="lg-btn lg-grow lg-pink" data-a="yes">${t('lugar.clear', 'Limpar')}</button></div>`,
      (s, close) => {
        this.bind(s, '[data-a=no]', close);
        this.bind(s, '[data-a=yes]', () => {
          close();
          this.snap();
          this.cells.fill(EMPTY);
          this.regionsDone.clear();
          this.afterChange();
        });
      },
    );
  }

  private checkWin(): void {
    const p = this.pz!;
    let k = 0;
    for (const v of this.cells) if (v === BLOOP) k++;
    if (k !== p.n || this.board!.conflictCells.size) return;
    this.win();
  }

  /* ------------------------------ dicas ------------------------------ */
  private askHint(): void {
    if (!this.running) return;
    if (this.hint) {
      this.closeHint();
      return;
    }
    const free = this.mode === 'zen' || pro();
    if (!free && hintsLeft() <= 0) {
      this.noHintsSheet();
      return;
    }
    const h = this.computeHint();
    if (!free) spendHint();
    this.hintsUsed++;
    this.showHint(h);
    this.updateTools();
    this.queueSave();
  }
  private computeHint(): HintState {
    const p = this.pz!;
    const n = p.n;
    const solCell = (c: number) => p.sol[Math.floor(c / n)] === c % n;
    for (let c = 0; c < this.cells.length; c++) if (this.cells[c] === BLOOP && !solCell(c)) return { kind: 'wrongBloop', step: null, cell: c };
    for (let c = 0; c < this.cells.length; c++) if ((this.cells[c] === MARK || this.cells[c] === AUTO) && solCell(c)) return { kind: 'wrongX', step: null, cell: c };
    const st = new Uint8Array(this.cells.length);
    for (let c = 0; c < st.length; c++) st[c] = this.cells[c] === BLOOP ? QQ : this.cells[c] === EMPTY ? 0 : XX;
    const L = new Logic(n, p.reg, st, this.L0!.units);
    const s = nextStep(L);
    if (s) return { kind: s.tech, step: s, cell: s.place ?? s.cell ?? -1 };
    const c = p.sol.map((k, r) => r * n + k).find((c) => this.cells[c] !== BLOOP) ?? 0;
    return { kind: 'reveal', step: null, cell: c };
  }
  private showHint(h: HintState): void {
    const p = this.pz!;
    const card = this.ui.hintCard!;
    const b = this.board!;
    this.hint = h;
    let text = '';
    if (h.step) {
      text = hintText(h.step, p.n);
      b.hint = { focus: h.step.focus, elim: h.step.elim, place: h.step.place ?? -1, cell: h.step.tech === 'touch' || h.step.tech === 'trial' ? (h.step.cell ?? -1) : -1 };
    } else if (h.kind === 'wrongX') {
      text = hintWrongX();
      b.hint = { focus: [h.cell], elim: [], place: -1, cell: h.cell };
    } else if (h.kind === 'wrongBloop') {
      text = hintWrongBloop();
      b.hint = { focus: [h.cell], elim: [], place: -1, cell: h.cell };
    } else {
      text = hintReveal();
      b.hint = { focus: [h.cell], elim: [], place: h.cell, cell: -1 };
    }
    b.dirty = true;
    card.innerHTML = `
      <div class="lg-hhead"><span class="lg-hico">${icon('lamp', { size: 26 })}</span><b>${hintTitle(h.kind)}</b><button class="lg-x" data-a="close" aria-label="${t('lugar.close', 'Fechar')}">${icon('close', { size: 16 })}</button></div>
      <p>${text}</p>
      <div class="lg-row"><button class="lg-btn lg-gold lg-grow" data-a="apply">${icon('check', { size: 20 })}${h.kind === 'wrongX' ? t('lugar.hApplyX', 'Tirar o X') : h.kind === 'wrongBloop' ? t('lugar.hApplyB', 'Tirar o Bloop') : t('lugar.hApply', 'Faz pra mim')}</button><button class="lg-btn lg-ghost" data-a="ok">${t('lugar.hOk', 'Entendi')}</button></div>`;
    card.hidden = false;
    card.classList.remove('in');
    void card.offsetWidth;
    card.classList.add('in');
    sfx.hint();
    this.bind(card, '[data-a=close]', () => this.closeHint());
    this.bind(card, '[data-a=ok]', () => this.closeHint());
    this.bind(card, '[data-a=apply]', () => this.applyHint());
  }
  private closeHint(): void {
    this.hint = null;
    if (this.board) {
      this.board.hint = null;
      this.board.dirty = true;
    }
    if (this.ui.hintCard) this.ui.hintCard.hidden = true;
  }
  private applyHint(): void {
    const h = this.hint;
    if (!h || !this.running) return;
    this.closeHint();
    if (h.kind === 'wrongX') {
      this.unmarkCell(h.cell);
      return;
    }
    if (h.kind === 'wrongBloop') {
      this.removeBloop(h.cell);
      return;
    }
    if (h.step?.place !== undefined || h.kind === 'reveal') {
      this.placeBloop(h.step?.place ?? h.cell, true);
      return;
    }
    if (!h.step) return;
    this.snap();
    let i = 0;
    for (const c of h.step.elim)
      if (this.cells[c] === EMPTY || this.cells[c] === AUTO) {
        this.cells[c] = MARK;
        this.board?.mark(c);
        i++;
      }
    sfx.mark(i);
    this.afterChange();
  }
  private noHintsSheet(): void {
    const can = rewardedAvailable();
    this.sheet(
      `<div class="lg-ctitle">${icon('lamp', { size: 26 })}${t('lugar.noHints', 'Acabaram as dicas de hoje')}</div>
       <p class="lg-p">${t('lugar.noHintsInfo', 'Você ganha {n} dicas grátis por dia. Assista a um vídeo curtinho para ganhar mais 2 agora!', { n: FREE_HINTS })}</p>
       <button class="lg-btn lg-gold lg-big" data-a="ad" ${can ? '' : 'disabled'}>${icon('video', { size: 24 })}${t('lugar.hintAd', '+2 dicas')}</button>
       <button class="lg-btn lg-ghost" data-a="no">${t('lugar.notNow', 'Agora não')}</button>`,
      (s, close) => {
        this.bind(s, '[data-a=no]', close);
        this.bind(s, '[data-a=ad]', async () => {
          const ok = await showRewarded();
          if (this.dead) return;
          close();
          if (ok) {
            this.sv.hintBonus += 2;
            persistLugar();
            this.updateTools();
            sfx.heartBack();
            notify(t('lugar.hintsGot', '+2 dicas!'), { kind: 'good', icon: 'lamp' });
          } else notify(t('lugar.adFail', 'O vídeo não está disponível agora.'), { kind: 'warn', icon: 'video' });
        });
      },
    );
  }

  /* ------------------------------ folhas (pop-ups sobre a partida) ------------------------------ */
  private sheet(html: string, wire: (s: HTMLElement, close: () => void) => void): void {
    this.el.querySelectorAll('.lg-sheet').forEach((x) => x.remove());
    const wasRunning = this.running;
    this.running = false;
    const s = document.createElement('div');
    s.className = 'lg-sheet';
    s.innerHTML = `<div class="lg-card">${html}</div>`;
    this.el.appendChild(s);
    let pop: (() => void) | null = null;
    const close = () => {
      pop?.();
      pop = null;
      s.remove();
      if (wasRunning && !this.won) this.running = true;
    };
    pop = pushBack(close);
    s.addEventListener('click', (e) => e.target === s && close());
    wire(s, close);
  }

  private pauseMenu(): void {
    if (this.won || !this.pz) return;
    const back = this.mode === 'level' ? t('lugar.toMap', 'Mapa de fases') : t('lugar.toMenu', 'Menu');
    this.sheet(
      `<div class="lg-ctitle">${icon('pause', { size: 24 })}${t('lugar.paused', 'Pausa')}</div>
       <div class="lg-pstats"><span>${icon('clock', { size: 18 })}${mmss(this.time)}</span><span>${icon('lamp', { size: 18 })}${this.hintsUsed}</span><span>${icon('heart', { size: 18 })}${this.mistakes}</span></div>
       <button class="lg-btn lg-green lg-big" data-a="go">${icon('play', { size: 24 })}${t('lugar.resume', 'Continuar')}</button>
       <button class="lg-btn" data-a="restart">${icon('refresh', { size: 20 })}${t('lugar.restart', 'Recomeçar')}</button>
       <button class="lg-btn lg-ghost" data-a="out">${icon('home', { size: 20 })}${back}</button>`,
      (s, close) => {
        this.bind(s, '[data-a=go]', close);
        this.bind(s, '[data-a=restart]', () => {
          close();
          this.restart();
        });
        this.bind(s, '[data-a=out]', () => {
          close();
          this.saveProgress();
          this.leave();
        });
      },
    );
  }
  private leave(): void {
    this.running = false;
    if (this.mode === 'level') this.map(Math.floor(this.idx / PER_CHAPTER));
    else this.home();
  }
  private restart(): void {
    if (!this.pz) return;
    this.sv.prog = null;
    persistLugar();
    this.begin(this.pz, this.key);
  }

  /* ------------------------------ sem corações ------------------------------ */
  private outOfHearts(): void {
    this.running = false;
    sfx.sad();
    const can = rewardedAvailable();
    const ov = document.createElement('div');
    ov.className = 'lg-ov lg-dim lg-center lg-sad';
    ov.innerHTML = `
      <div class="lg-card lg-sadcard">
        <div class="lg-sadart"><div class="lg-cloud"><i></i><i></i><i></i></div><div class="lg-sadbloop"></div><span class="lg-tear"></span><span class="lg-tear r"></span></div>
        <div class="lg-ctitle">${t('lugar.outTitle', 'Ficou sem corações!')}</div>
        <p class="lg-p">${t('lugar.outInfo', 'O Bloop ficou tristinho… Mas dá para continuar de onde parou!')}</p>
        <button class="lg-btn lg-gold lg-big" data-a="ad" ${can ? '' : 'disabled'}>${icon('video', { size: 24 })}${t('lugar.getHearts', 'Ganhar 3 corações')}</button>
        <button class="lg-btn lg-pink" data-a="restart">${icon('refresh', { size: 20 })}${t('lugar.restart', 'Recomeçar')}</button>
        <button class="lg-btn lg-ghost" data-a="out">${this.mode === 'level' ? t('lugar.toMap', 'Mapa de fases') : t('lugar.toMenu', 'Menu')}</button>
      </div>`;
    ov.querySelector('.lg-sadbloop')!.appendChild(this.bloopImg(44, 'idle', 0.8));
    this.el.appendChild(ov);
    const close = () => {
      pop();
      ov.remove();
    };
    const pop = pushBack(() => {
      close();
      this.leave();
    });
    this.bind(ov, '[data-a=ad]', async () => {
      const ok = await showRewarded();
      if (this.dead) return;
      if (ok) {
        close();
        this.hearts = 3;
        this.running = true;
        this.renderHearts();
        sfx.heartBack();
        success();
        notify(t('lugar.heartsBack', '+3 corações! Bora!'), { kind: 'good', icon: 'heart' });
        this.queueSave();
      } else notify(t('lugar.adFail', 'O vídeo não está disponível agora.'), { kind: 'warn', icon: 'video' });
    });
    this.bind(ov, '[data-a=restart]', () => {
      close();
      this.restart();
    });
    this.bind(ov, '[data-a=out]', () => {
      close();
      this.sv.prog = null;
      persistLugar();
      this.leave();
    });
  }

  /* ------------------------------ vitória ------------------------------ */
  private win(): void {
    const p = this.pz!;
    this.running = false;
    this.won = true;
    this.closeHint();
    this.board?.win();
    sfx.win();
    success();
    const s = this.sv;
    const time = Math.round(this.time);
    const par = parTime(p);
    let mask = 8;
    if (this.mistakes === 0) mask |= 1;
    if (this.hintsUsed === 0) mask |= 2;
    if (time <= par) mask |= 4;
    const stars = starCount(mask);
    let coins = 0;
    let streakNow = 0;
    let first = false;
    if (this.mode === 'level') {
      const prev = s.stars[this.idx] ?? 0;
      first = !(prev & 8);
      s.stars[this.idx] = prev | mask;
      s.times[this.idx] = s.times[this.idx] ? Math.min(s.times[this.idx], time) : time;
      if (this.idx >= s.unlocked) s.unlocked = Math.min(LEVELS - 1, this.idx + 1);
      if (first) s.solved++;
      coins = first ? 5 + p.n + p.rating.tier * 4 + stars * 3 : 1 + stars;
    } else if (this.mode === 'daily') {
      const today = this.day;
      if (s.dailyDay !== today) {
        s.dailyStreak = s.dailyDay === today - 1 ? s.dailyStreak + 1 : 1;
        s.dailyBestStreak = Math.max(s.dailyBestStreak, s.dailyStreak);
        s.dailyDay = today;
        s.dailyTime = time;
        coins = (10 + p.n + stars * 4) * 2 + Math.min(7, s.dailyStreak) * 3;
        first = true;
      } else s.dailyTime = Math.min(s.dailyTime || time, time);
      streakNow = s.dailyStreak;
    } else {
      s.zenSolved++;
      coins = 2 + Math.floor(p.n / 2);
    }
    s.prog = null;
    persistLugar();
    if (coins > 0) addCoins(coins);
    reportRun({
      game: 'lugar',
      score: p.n * p.n * 10 + stars * 50 + p.rating.tier * 100,
      coins,
      durationSec: time,
      won: true,
      stats: { size: p.n, stars, hints: this.hintsUsed, mistakes: this.mistakes, tier: p.rating.tier, level: this.mode === 'level' ? this.idx + 1 : 0 },
    });
    setTimeout(() => !this.dead && this.winCard(mask, time, par, coins, streakNow, first), 1500);
  }

  private winCard(mask: number, time: number, par: number, coins: number, streak: number, first: boolean): void {
    const p = this.pz!;
    const ov = document.createElement('div');
    ov.className = 'lg-ov lg-winov';
    const starRow = [
      [1, t('lugar.sNoMistake', 'Sem erros')],
      [2, t('lugar.sNoHint', 'Sem dicas')],
      [4, t('lugar.sFast', 'Até {t}', { t: mmss(par) })],
    ]
      .map(([b, lbl], i) => `<div class="lg-star${mask & (b as number) ? ' on' : ''}" style="animation-delay:${0.25 + i * 0.28}s"><span>${icon('star', { size: 44 })}</span><small>${lbl}</small></div>`)
      .join('');
    const title = [t('lugar.win0', 'Cada Bloop no seu canto!'), t('lugar.win1', 'Mandou bem!'), t('lugar.win2', 'Que cabeça!'), t('lugar.win3', 'Perfeito!')][starCount(mask)];
    const isLevel = this.mode === 'level';
    const hasNext = isLevel && this.idx + 1 < LEVELS;
    ov.innerHTML = `
      <div class="lg-card lg-wincard">
        <div class="lg-wintitle">${title}</div>
        ${this.mode !== 'zen' ? `<div class="lg-stars">${starRow}</div>` : ''}
        <div class="lg-pstats"><span>${icon('clock', { size: 18 })}${mmss(time)}</span>${coins ? `<span class="lg-coins">${icon('coin', { size: 20 })}+${coins}</span>` : ''}${streak ? `<span>${icon('fire', { size: 18 })}${t('lugar.streak', '{n} dias seguidos', { n: streak })}</span>` : ''}</div>
        ${this.mode === 'daily' && !first ? `<p class="lg-p">${t('lugar.dailyAgain', 'Você já tinha feito o de hoje — esse foi só pela diversão!')}</p>` : ''}
        ${hasNext ? `<button class="lg-btn lg-green lg-big" data-a="next">${icon('play', { size: 24 })}${t('lugar.nextLevel', 'Próxima fase')}</button>` : ''}
        ${this.mode === 'zen' ? `<button class="lg-btn lg-green lg-big" data-a="zen">${icon('sparkle', { size: 24 })}${t('lugar.another', 'Outro tabuleiro')}</button>` : ''}
        <div class="lg-row">
          ${isLevel && starCount(mask) < 3 ? `<button class="lg-btn lg-grow" data-a="again">${icon('refresh', { size: 20 })}${t('lugar.again', 'De novo')}</button>` : ''}
          <button class="lg-btn lg-grow lg-ghost" data-a="out">${isLevel ? t('lugar.toMap', 'Mapa de fases') : t('lugar.toMenu', 'Menu')}</button>
        </div>
      </div>`;
    this.el.appendChild(ov);
    if (this.mode !== 'zen')
      [1, 2, 4].forEach((b, i) => {
        if (mask & b) setTimeout(() => !this.dead && (sfx.star(i), tap('light')), 250 + i * 280);
      });
    const go = (fn: () => void) => {
      ov.remove();
      fn();
    };
    this.bind(ov, '[data-a=next]', () =>
      go(() => {
        void maybeInterstitial();
        this.startLevel(this.idx + 1);
      }),
    );
    this.bind(ov, '[data-a=zen]', () => go(() => this.startZen()));
    this.bind(ov, '[data-a=again]', () => go(() => this.begin(p, this.key)));
    this.bind(ov, '[data-a=out]', () =>
      go(() => {
        void maybeInterstitial();
        this.leave();
      }),
    );
  }

  /* ============================== ajustes ============================== */
  private settings(onBack: () => void, overGame = false): void {
    const s = this.sv;
    const isPro = pro();
    const html = () => `
      <div class="lg-ctitle">${icon('gear', { size: 24 })}${t('lugar.settings', 'Ajustes')}</div>
      <div class="lg-lbl">${t('lugar.inputMode', 'Toque')}</div>
      <div class="lg-seg lg-seg2">
        <button data-i="cycle" class="${s.input === 'cycle' ? 'on' : ''}"><b>${t('lugar.inCycle', 'Toque alterna')}</b><small>${t('lugar.inCycleD', 'vazio → X → Bloop')}</small></button>
        <button data-i="double" class="${s.input === 'double' ? 'on' : ''}"><b>${t('lugar.inDouble', 'Toque duplo')}</b><small>${t('lugar.inDoubleD', 'toque = X · duplo = Bloop')}</small></button>
      </div>
      <p class="lg-tip">${t('lugar.dragTip', 'Arraste o dedo para riscar várias casas. Segure uma casa para pôr um Bloop direto.')}</p>
      ${tog('autoX', s.autoX, t('lugar.autoX', 'X automático'), t('lugar.autoXD', 'Ao pôr um Bloop, risca as casas que ele elimina'))}
      ${tog('patterns', s.patterns, t('lugar.patterns', 'Padrões nas cores'), t('lugar.patternsD', 'Desenhos em cada região (ajuda no daltonismo)'))}
      ${tog('infinite', s.infinite && isPro, t('lugar.infinite', 'Corações infinitos'), isPro ? t('lugar.infiniteD', 'Do Clube Bloop e Passes premium') : t('lugar.infiniteLock', 'Exclusivo do Clube Bloop e Passes premium'), !isPro)}
      ${tog('sound', globalSave.sound, t('lugar.sound', 'Sons'), '')}
      ${tog('haptics', globalSave.haptics, t('lugar.haptics', 'Vibração'), '')}
      <button class="lg-btn lg-green lg-big" data-a="done">${icon('check', { size: 22 })}${t('lugar.done', 'Pronto')}</button>`;
    const wire = (root: HTMLElement, close: () => void) => {
      const rerender = () => {
        const card = root.querySelector('.lg-card') as HTMLElement;
        card.innerHTML = html();
        wireIn(card);
      };
      const wireIn = (card: HTMLElement) => {
        this.bind(card, '[data-i]', (b) => {
          s.input = b.dataset.i as LugarSave['input'];
          persistLugar();
          rerender();
        });
        this.bind(card, '[data-t]', (b) => {
          const k = b.dataset.t!;
          if (k === 'autoX') s.autoX = !s.autoX;
          else if (k === 'patterns') s.patterns = !s.patterns;
          else if (k === 'infinite') {
            if (!isPro) {
              notify(t('lugar.infiniteLock', 'Exclusivo do Clube Bloop e Passes premium'), { icon: 'lock' });
              return;
            }
            s.infinite = !s.infinite;
          } else if (k === 'sound') {
            globalSave.sound = !globalSave.sound;
            audio.applySettings();
            persistGlobal();
          } else if (k === 'haptics') {
            globalSave.haptics = !globalSave.haptics;
            persistGlobal();
          }
          persistLugar();
          rerender();
        });
        this.bind(card, '[data-a=done]', close);
      };
      wireIn(root.querySelector('.lg-card') as HTMLElement);
    };
    if (overGame) {
      this.sheet(html(), (sh, close) =>
        wire(sh, () => {
          close();
          onBack();
        }),
      );
      return;
    }
    const d = this.ov('lg-center');
    d.innerHTML = `<div class="lg-card">${html()}</div>`;
    wire(d, onBack);
    this.popBack = pushBack(onBack);
  }

  /* ============================== como jogar ============================== */
  private howTo(onDone: () => void, first = false): void {
    const d = this.ov('lg-howov');
    const p = levelPuzzle(0);
    d.innerHTML = `
      ${this.logo(false)}
      <div class="lg-card lg-how">
        <div class="lg-howboard"></div>
        <ol class="lg-rules">
          <li><b>1</b><span>${t('lugar.r1', 'Cada <em>linha</em> e cada <em>coluna</em> tem exatamente um Bloop.')}</span></li>
          <li><b>2</b><span>${t('lugar.r2', 'Cada <em>cor</em> também tem exatamente um Bloop.')}</span></li>
          <li><b>3</b><span>${t('lugar.r3', 'Bloops gostam de espaço: <em>nunca se encostam</em>, nem na diagonal.')}</span></li>
        </ol>
        <div class="lg-ctrls">
          <span>${t('lugar.c1', 'Toque: vazio → X → Bloop')}</span>
          <span>${t('lugar.c2', 'Arraste: risca várias casas')}</span>
          <span>${t('lugar.c3', 'Segure: põe um Bloop')}</span>
        </div>
        <p class="lg-tip">${t('lugar.howHearts', 'Bloop no lugar errado custa um coração. Travou? Peça uma dica: ela explica o próximo passo.')}</p>
        <button class="lg-btn lg-green lg-big" data-a="ok">${first ? icon('play', { size: 24 }) + t('lugar.letsGo', 'Bora!') : t('lugar.gotIt', 'Entendi!')}</button>
      </div>`;
    const host = d.querySelector('.lg-howboard') as HTMLElement;
    const cells = new Uint8Array(p.n * p.n);
    p.sol.forEach((k, r) => (cells[r * p.n + k] = BLOOP));
    const b = new Board({ tap: () => {}, hold: () => {}, dragStart: () => false, dragCell: () => {}, dragEnd: () => {} });
    b.patterns = this.sv.patterns;
    b.setPuzzle(p.n, p.reg, cells);
    host.appendChild(b.canvas);
    this.board = b;
    requestAnimationFrame(() => {
      b.resize(Math.min(220, host.clientWidth || 200), this.gov.settings.dprCap);
      p.sol.forEach((k, r) => setTimeout(() => !this.dead && this.board === b && b.pop(r * p.n + k), 250 + r * 160));
    });
    this.bind(d, '[data-a=ok]', onDone);
    this.popBack = pushBack(onDone);
  }

  /* ============================== loop ============================== */
  private loop = (now: number): void => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    if (this.gov.settings.fpsCap === 30 && dt < 1 / 40) return;
    this.last = now;
    if (this.paused) return;
    if (this.running && this.pz && this.mode !== 'zen') {
      this.time += dt;
      const sec = Math.floor(this.time);
      if (sec !== this.lastSec && this.ui.timer) {
        this.lastSec = sec;
        this.ui.timer.textContent = mmss(sec);
      }
    } else if (this.ui.timer && this.mode === 'zen' && this.lastSec !== -2) {
      this.lastSec = -2;
      this.ui.timer.textContent = '∞';
    }
    const b = this.board;
    if (b) {
      b.fancy = this.gov.tier >= 1;
      const w0 = performance.now();
      if (b.frame(dt)) this.gov.sample(dt * 1000, performance.now() - w0);
    }
  };

  /* ============================== handle ============================== */
  inMatch(): boolean {
    return !!this.pz && this.running && !this.won && !!this.ui.stage;
  }
  pause(): void {
    this.paused = true;
    this.saveProgress();
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }
  destroy(): void {
    if (this.ui.stage && !this.won) this.saveProgress();
    this.dead = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.saveT);
    this.board?.destroy();
    this.closeBack();
    for (const f of this.offs) f();
    persistLugar();
    this.el.remove();
    if (DEBUG) delete (window as unknown as { __lugar?: unknown }).__lugar;
  }
}

function tog(k: string, on: boolean, label: string, sub: string, locked = false): string {
  return `<button class="lg-tog${on ? ' on' : ''}${locked ? ' locked' : ''}" data-t="${k}"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>${locked ? icon('lock', { size: 22 }) : '<i></i>'}</button>`;
}
function undoSvg(): string {
  return `<svg viewBox="0 0 48 48" width="30" height="30" aria-hidden="true"><path d="M18 12L8 22L18 32" fill="none" stroke="#1d0b48" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22H28C35 22 40 27 40 33C40 37 38 40 35 41" fill="none" stroke="#1d0b48" stroke-width="9" stroke-linecap="round"/><path d="M18 12L8 22L18 32" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22H28C35 22 40 27 40 33C40 37 38 40 35 41" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/></svg>`;
}
