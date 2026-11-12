/* ============================================================
 *  PINTOU, GANHOU! — jogo (chunk sob demanda)
 *  Fluxo: menu → (duelo | treino | desafio do dia) → para cada item:
 *    memorizar (item nas cores reais) → pintar (seletor) → revelar
 *  → fim do set → fim da partida (pódio, moedas, XP) → menu.
 *  Duelo: você (+ até 4 amigos no mesmo aparelho, passando o celular)
 *  contra robôs com atraso e erro conforme a dificuldade. Total ≤ 5.
 * ============================================================ */
import { audio } from '../../core/audio';
import { addCoins } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { QualityGovernor } from '../../core/quality';
import { dayNumber } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { icon } from '../../ui/icons';
import { accuracy, deltaE2000, hashStr, hexToRgb, hsvHex, mulberry, rgbToHsv, rgbToLab, type HSV } from './color';
import { CATS, ITEMS, catName, hueDist, itemName, pickRound, type Item } from './items';
import { Picker } from './picker';
import { addRecord, corSave, levelOf, persistCor, type CorRecord } from './save';
import { drawItem } from './shapes';
import { injectPgCss } from './style';
import { openStartMenu, type SmCard, type SmPage } from '../../ui/startmenu';
import { freshDuel, takeDuel, type DuelEntry } from '../../party/duel-link';
import type { DuelCtl } from '../../party/duel';

type Mode = 'duel' | 'practice' | 'daily';
type Phase = 'idle' | 'handoff' | 'show' | 'pick' | 'reveal';

interface Player {
  name: string;
  color: string;
  bot: number; // -1 = humano; 0..3 = nível do robô
  setScore: number;
  setsWon: number;
  total: number;
  perfects: number;
  streak: number;
  bestStreak: number;
  // rodada atual
  pick: string;
  acc: number;
  done: boolean;
  lockAt: number;
}

const BOTS = [
  { name: 'Pincel', color: '#ff5e8a' },
  { name: 'Aquarela', color: '#3ac0e8' },
  { name: 'Guache', color: '#ffd166' },
  { name: 'Nanquim', color: '#b388ff' },
  { name: 'Pastel', color: '#6dff8a' },
  { name: 'Giz', color: '#ff9a3d' },
];
const HUMAN_COLORS = ['#ffffff', '#2fb7b0', '#ff7a45', '#c9a0ff', '#9be15d'];
/** erro dos robôs por nível: desvio de matiz (graus), saturação, brilho e chance de "branco" */
const BOT_ERR = [
  { h: 13, s: 0.11, v: 0.1, blunder: 0.1 },
  { h: 7.5, s: 0.065, v: 0.06, blunder: 0.06 },
  { h: 4.2, s: 0.04, v: 0.036, blunder: 0.03 },
  { h: 2.4, s: 0.022, v: 0.02, blunder: 0.01 },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (n: number) => n.toFixed(1).replace('.', t('cor.decimal', ','));
const lvName = (l: number) => [t('cor.lv0', 'Fácil'), t('cor.lv1', 'Médio'), t('cor.lv2', 'Difícil'), t('cor.lv3', 'Mestre')][l] ?? '';
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/* ----------------------------- descrição da cor (dicas acessíveis) ----------------------------- */
function hueWord(h: number): string {
  const names: [number, string][] = [
    [12, t('cor.hue.red', 'vermelho')],
    [38, t('cor.hue.orange', 'laranja')],
    [64, t('cor.hue.yellow', 'amarelo')],
    [90, t('cor.hue.lime', 'verde-limão')],
    [160, t('cor.hue.green', 'verde')],
    [195, t('cor.hue.cyan', 'ciano')],
    [255, t('cor.hue.blue', 'azul')],
    [285, t('cor.hue.purple', 'roxo')],
    [345, t('cor.hue.pink', 'rosa')],
    [361, t('cor.hue.red', 'vermelho')],
  ];
  return names.find(([lim]) => h < lim)![1];
}
function describe(hex: string): string {
  const [L, a, b] = rgbToLab(hexToRgb(hex));
  const C = Math.hypot(a, b);
  const hsv = rgbToHsv(hexToRgb(hex));
  let base: string;
  if (C < 7) base = L > 90 ? t('cor.hue.white', 'branco') : L < 18 ? t('cor.hue.black', 'preto') : t('cor.hue.gray', 'cinza');
  else if (hsv.h >= 12 && hsv.h < 50 && L < 52) base = t('cor.hue.brown', 'marrom');
  else base = hueWord(hsv.h);
  const parts = [base];
  if (C >= 7) parts.push(C > 60 ? t('cor.d.vivid', 'bem vivo') : C < 25 ? t('cor.d.muted', 'apagado') : t('cor.d.mid', 'médio'));
  parts.push(L > 78 ? t('cor.d.light', 'claro') : L < 35 ? t('cor.d.dark', 'escuro') : t('cor.d.midL', 'meio-termo'));
  return parts.join(' · ');
}
/** dica do que faltou (relativa ao alvo) */
function feedback(target: string, pick: string): string {
  const [L1, a1, b1] = rgbToLab(hexToRgb(target));
  const [L2, a2, b2] = rgbToLab(hexToRgb(pick));
  const dE = deltaE2000(hexToRgb(target), hexToRgb(pick));
  if (dE < 2.2) return t('cor.fb.spot', 'Na mosca!');
  const out: string[] = [];
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const h1 = rgbToHsv(hexToRgb(target)).h;
  const h2 = rgbToHsv(hexToRgb(pick)).h;
  if (C1 > 12 && C2 > 8 && hueDist(h1, h2) > 9) out.push(t('cor.fb.hue', 'puxava mais pro {h}', { h: hueWord(h1) }));
  if (L1 - L2 > 4) out.push(t('cor.fb.lighter', 'era mais clara'));
  else if (L2 - L1 > 4) out.push(t('cor.fb.darker', 'era mais escura'));
  if (C1 - C2 > 6) out.push(t('cor.fb.vivid', 'era mais viva'));
  else if (C2 - C1 > 6) out.push(t('cor.fb.muted', 'era mais suave'));
  if (!out.length) return t('cor.fb.close', 'Quase lá!');
  const s = out.slice(0, 2).join(', ');
  return s[0].toUpperCase() + s.slice(1);
}

function botPick(target: string, level: number, diff: number, rng: () => number): string {
  const e = BOT_ERR[clamp(level, 0, 3)];
  const g = () => (rng() + rng() + rng() + rng() - 2) * 1.73; // ~N(0,1)
  let k = 1 + diff * 0.22;
  if (rng() < e.blunder) k *= 3;
  const hsv = rgbToHsv(hexToRgb(target));
  const hk = hsv.s < 0.12 ? 0.3 : 1;
  const out: HSV = {
    h: (hsv.h + g() * e.h * k * hk + 360) % 360,
    s: clamp(hsv.s + g() * e.s * k, 0, 1),
    v: clamp(hsv.v + g() * e.v * k, 0, 1),
  };
  return hsvHex(out);
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectPgCss();
  return new CorGame(root, exit);
}

class CorGame implements MiniGameHandle {
  private el: HTMLDivElement;
  private sv = corSave();
  private gov = new QualityGovernor({ emit: false, persist: false });
  private dead = false;
  private paused = false;
  private raf = 0;
  private last = 0;
  private offs: (() => void)[] = [];
  // partida
  private mode: Mode = 'duel';
  private players: Player[] = [];
  private humans: number[] = [];
  private turn = 0; // índice em humans
  private items: Item[] = [];
  private idx = 0;
  private setNo = 0;
  private setsToWin = 1;
  private maxSets = 1;
  private level = 1;
  private rng: () => number = Math.random;
  private phase: Phase = 'idle';
  private phaseT = 0;
  private phaseDur = 0;
  private revealT0 = 0;
  private official = true;
  private t0 = 0;
  private recent = new Set<number>();
  // DOM de jogo
  private picker: Picker | null = null;
  private stage: HTMLCanvasElement | null = null;
  private sx: CanvasRenderingContext2D | null = null;
  private sw = 0;
  private sh = 0;
  private dpr = 1;
  private bar: HTMLElement | null = null;
  private lastSec = -1;
  // confete
  private cf: HTMLCanvasElement;
  private cfx: CanvasRenderingContext2D;
  private parts: { x: number; y: number; vx: number; vy: number; r: number; vr: number; c: string; w: number; life: number }[] = [];
  private cfRaf = 0;

  // duelo online (src/party/duel.ts): mesmos itens para todos, placar ao vivo e pódio
  private duel: DuelCtl | null = null;

  constructor(
    private root: HTMLElement,
    private exitFn: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'pg-root';
    root.appendChild(this.el);
    this.cf = document.createElement('canvas');
    this.cf.className = 'pg-confetti';
    this.cfx = this.cf.getContext('2d')!;
    const onResize = () => this.layout();
    window.addEventListener('resize', onResize);
    this.offs.push(() => window.removeEventListener('resize', onResize));
    this.layout();
    this.menu();
    const d = takeDuel('cor');
    if (d) void this.onlineDuel(d);
  }

  /* ============================== duelo online ============================== */
  private async onlineDuel(entry: DuelEntry): Promise<void> {
    const D = await import('../../party/duel');
    if (this.dead) return;
    this.duel?.leave();
    this.duel = D.startDuel({
      game: 'cor',
      root: this.root,
      title: t('cor.name', 'Pintou, Ganhou!'),
      rank: 'score',
      limitSec: 200,
      entry,
      fmt: (n) => fmt(n),
      start: (seed) => {
        this.mode = 'practice';
        this.level = 2;
        this.players = [this.mkPlayer(t('cor.you', 'Você'), HUMAN_COLORS[0], -1)];
        this.maxSets = this.setsToWin = 1;
        this.rng = mulberry(seed);
        this.official = false;
        this.recent.clear();
        this.begin(7);
      },
      stop: () => this.menu(),
      exit: () => {
        this.duel = null;
        this.menu();
      },
    });
  }

  /* ============================== utilidades ============================== */
  private clear(): HTMLDivElement {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.picker?.destroy();
    this.picker = null;
    this.stage = null;
    this.sx = null;
    this.phase = 'idle';
    this.el.innerHTML = '';
    this.el.appendChild(this.cf);
    const d = document.createElement('div');
    this.el.appendChild(d);
    return d;
  }
  private ov(cls = ''): HTMLDivElement {
    const d = this.clear();
    d.className = 'pg-ov ' + cls;
    return d;
  }
  private bind(root: ParentNode, sel: string, fn: (b: HTMLElement) => void): void {
    root.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        tap('light');
        fn(b);
      }),
    );
  }
  private toast(txt: string): void {
    this.el.querySelectorAll('.pg-toast').forEach((x) => x.remove());
    const d = document.createElement('div');
    d.className = 'pg-toast';
    d.textContent = txt;
    this.el.appendChild(d);
    setTimeout(() => d.remove(), 2000);
  }
  private save(): void {
    persistCor();
  }
  /* ============================== menu ============================== */
  private menu(): void {
    const d = this.clear();
    d.style.cssText = 'position:absolute;inset:0';
    const s = this.sv;
    const L = levelOf(s.xp);
    const today = dayNumber();
    const dailyDone = s.dailyDay === today;
    const itemArt = (it: Item | undefined) => (x: CanvasRenderingContext2D, w: number, h: number) => {
      if (it) drawItem(x, it.shape, it.hex, it.sec, w / 2, h / 2, Math.min(w, h) * 0.86);
    };
    const sm = openStartMenu(d, {
      game: 'cor',
      chips: [
        { icon: icon('star', { size: 20 }), text: t('cor.level', 'Nível {n}', { n: L.lv }) },
        { icon: icon('trophy', { size: 20 }), text: String(s.wins) },
      ],
      onBack: () => this.exitFn(),
      settings: (p) => {
        p.toggle({ icon: icon('paint', { size: 30 }), label: t('cor.hints', 'Dicas em texto'), say: t('cor.hintsD', 'Descreve a cor (ajuda para daltonismo)'), value: s.hints, onChange: (v) => {
          s.hints = v;
          this.save();
        } });
      },
      build: (p) => {
        p.cards([
          { id: 'duel', icon: icon('crown', { size: 54 }), label: t('cor.duel', 'Duelo'), say: t('cor.duelD', 'Contra robôs e amigos no mesmo celular (até 5)'), color: '#ffd0e0', onTap: () => sm.push((q) => this.duelPage(q), t('cor.duel', 'Duelo')) },
          { id: 'practice', icon: icon('paint', { size: 54 }), label: t('cor.practice', 'Treino'), say: t('cor.practiceD', 'Sozinho, escolha a categoria e o ritmo'), color: '#c4f0ff', onTap: () => sm.push((q) => this.practicePage(q), t('cor.practice', 'Treino')) },
          { id: 'daily', icon: icon('calendar', { size: 54 }), label: t('cor.dailyS', 'Do dia'), say: t('cor.dailyD', '10 itens iguais para todo mundo. Vale uma vez por dia!'), sub: dailyDone ? `✓ ${fmt(s.dailyScore)}` : '', color: '#fff0a0', onTap: () => this.startDaily() },
        ]);
        p.play({ sub: `${t('cor.duel', 'Duelo')} · ${lvName(s.level)}`, onTap: () => {
          this.save();
          this.startDuel();
        } });
        p.friends({ label: t('duel.menuS', 'Duelo com amigos'), say: t('cor.onlineD', 'Mesmas cores para todos, cada um no seu celular'), onTap: () => void this.onlineDuel(freshDuel('cor')) });
        p.cards(
          [
            { id: 'album', art: itemArt(ITEMS[3]), label: t('cor.album', 'Álbum'), color: '#ffe6c8', onTap: () => this.album() },
            { id: 'rec', icon: icon('trophy', { size: 36 }), label: t('cor.records', 'Recordes'), color: '#fff0a0', onTap: () => this.records() },
          ],
          { size: 'small', cols: 2 },
        );
      },
    });
  }

  private duelPage(p: SmPage): void {
    const s = this.sv;
    s.humans = clamp(s.humans, 1, 5);
    s.bots = clamp(s.bots, 0, 5 - s.humans);
    if (s.humans + s.bots < 2) s.bots = 1;
    const re = () => {
      this.save();
      p.refresh();
    };
    p.label(t('cor.humansS', 'Pessoas'), icon('user', { size: 20 }));
    p.cards(
      [1, 2, 3, 4, 5].map((n) => ({ id: 'h' + n, icon: `<span class="sm-emoji">${n}</span>`, color: '#ffd0e0', label: '', say: t('cor.humans', 'Pessoas (passa o celular)') + ' ' + n, sel: s.humans === n, onTap: () => {
        s.humans = n;
        if (s.humans + s.bots > 5) s.bots = 5 - n;
        if (s.humans + s.bots < 2) s.bots = 1;
        re();
      } })),
      { size: 'small', cols: 5 },
    );
    p.label(t('cor.bots', 'Robôs'), icon('rocket', { size: 20 }));
    p.cards(
      [0, 1, 2, 3, 4].map((n) => ({ id: 'b' + n, icon: `<span class="sm-emoji">${n}</span>`, color: '#c4f0ff', label: '', say: t('cor.bots', 'Robôs') + ' ' + n, sel: s.bots === n, disabled: n + s.humans > 5 || n + s.humans < 2, onTap: () => {
        s.bots = n;
        re();
      } })),
      { size: 'small', cols: 5 },
    );
    p.faces([0, 1, 2, 3].map((l) => ({ id: l, level: l, label: lvName(l) })), s.level, (v) => {
      s.level = +v;
      this.save();
    });
    p.cards(
      [
        ...[5, 7, 10].map((n) => ({ id: 'i' + n, icon: `<span class="sm-emoji">${n}</span>`, label: '', color: '#fff0a0', say: t('cor.itemsPerSet', 'Itens por set') + ' ' + n, sel: s.items === n, onTap: () => ((s.items = n), re()) })),
        ...[1, 3, 5].map((n) => ({ id: 's' + n, icon: `<span class="sm-emoji">×${n}</span>`, label: '', color: '#d8f8c0', say: n === 1 ? t('cor.oneSet', '1 set') : n === 3 ? t('cor.bo3', 'Melhor de 3') : t('cor.bo5', 'Melhor de 5'), sel: s.sets === n, onTap: () => ((s.sets = n), re()) })),
      ],
      { size: 'small', cols: 6 },
    );
    p.play({ say: t('cor.start', 'Começar'), onTap: () => {
      this.save();
      this.startDuel();
    } });
  }

  private practicePage(p: SmPage): void {
    const s = this.sv;
    const re = () => {
      this.save();
      p.refresh();
    };
    const first = (id: string) => ITEMS.find((it) => it.cat.id === id);
    p.cards(
      [
        { id: 'all', art: ((x: CanvasRenderingContext2D, w: number, h: number) => {
          for (let k = 0; k < 3; k++) {
            const it = ITEMS[(k * 37) % ITEMS.length];
            drawItem(x, it.shape, it.hex, it.sec, w * (0.3 + k * 0.2), h * 0.55, Math.min(w, h) * 0.6);
          }
        }) as SmCard['art'], label: t('cor.allCats', 'Tudo misturado'), sub: String(ITEMS.length), color: '#fff0a0', sel: s.cat === '', onTap: () => ((s.cat = ''), re()) },
        ...CATS.map((c) => ({ id: c.id, art: ((it: Item | undefined) => (x: CanvasRenderingContext2D, w: number, h: number) => {
          if (it) drawItem(x, it.shape, it.hex, it.sec, w / 2, h / 2, Math.min(w, h) * 0.86);
        })(first(c.id)), label: catName(c), sub: String(c.n), color: '#e8f4ff', sel: s.cat === c.id, onTap: () => ((s.cat = c.id), re()) })),
      ],
      { scroll: true },
    );
    p.toggle({ icon: icon('target', { size: 30 }), label: t('cor.showTarget', 'Alvo visível'), say: t('cor.showTargetD', 'O item fica na tela enquanto você pinta'), value: s.showTarget, onChange: (v) => ((s.showTarget = v), this.save()) });
    p.toggle({ icon: icon('clock', { size: 30 }), label: t('cor.noTimer', 'Sem cronômetro'), say: t('cor.noTimerD', 'Pinte com calma'), value: s.noTimer, onChange: (v) => ((s.noTimer = v), this.save()) });
    p.play({ say: t('cor.start', 'Começar'), onTap: () => {
      this.save();
      this.startPractice();
    } });
  }

  /* ============================== início das partidas ============================== */
  private mkPlayer(name: string, color: string, bot: number): Player {
    return { name, color, bot, setScore: 0, setsWon: 0, total: 0, perfects: 0, streak: 0, bestStreak: 0, pick: '', acc: 0, done: false, lockAt: 0 };
  }

  private startDuel(): void {
    const s = this.sv;
    this.mode = 'duel';
    this.level = s.level;
    this.players = [];
    for (let i = 0; i < s.humans; i++) this.players.push(this.mkPlayer(s.humans === 1 ? t('cor.you', 'Você') : t('cor.player', 'Jogador {n}', { n: i + 1 }), HUMAN_COLORS[i], -1));
    const off = Math.floor(Math.random() * BOTS.length);
    for (let i = 0; i < s.bots; i++) {
      const b = BOTS[(off + i) % BOTS.length];
      this.players.push(this.mkPlayer(b.name, b.color, s.level));
    }
    this.maxSets = s.sets;
    this.setsToWin = Math.ceil(s.sets / 2);
    this.rng = mulberry((Math.random() * 2 ** 31) | 0);
    this.official = true;
    this.begin(s.items);
  }

  private startPractice(): void {
    this.mode = 'practice';
    this.level = 1;
    this.players = [this.mkPlayer(t('cor.you', 'Você'), HUMAN_COLORS[0], -1)];
    this.maxSets = this.setsToWin = 1;
    this.rng = mulberry((Math.random() * 2 ** 31) | 0);
    this.official = true;
    this.begin(10);
  }

  private startDaily(): void {
    const today = dayNumber();
    this.mode = 'daily';
    this.level = 2;
    this.official = this.sv.dailyDay !== today;
    if (!this.official) this.toast(t('cor.dailyAgain', 'Já valeu hoje — este é só treino'));
    this.players = [this.mkPlayer(t('cor.you', 'Você'), HUMAN_COLORS[0], -1)];
    this.maxSets = this.setsToWin = 1;
    this.rng = mulberry(hashStr('pintou-' + today));
    this.begin(10);
  }

  private begin(n: number): void {
    this.setNo = 0;
    this.t0 = performance.now();
    this.humans = this.players.map((p, i) => (p.bot < 0 ? i : -1)).filter((i) => i >= 0);
    this.newSet(n);
  }

  private newSet(n: number): void {
    this.setNo++;
    for (const p of this.players) p.setScore = 0;
    const s = this.sv;
    const opts = { level: this.mode === 'duel' ? Math.min(3, this.level + (this.setNo - 1) * 0.5) : this.level, cat: this.mode === 'practice' ? s.cat || undefined : undefined, avoid: this.mode === 'daily' ? undefined : this.recent };
    this.items = pickRound(this.rng, n, opts);
    for (const it of this.items) this.recent.add(it.idx);
    if (this.recent.size > 400) this.recent.clear();
    this.idx = 0;
    this.buildPlay();
    this.startItem();
  }

  /* ============================== tela de jogo ============================== */
  private buildPlay(): void {
    const d = this.clear();
    d.className = 'pg-play';
    d.innerHTML = `
      <div class="pg-left">
        <div class="pg-top">
          <button class="pg-btn pg-ic pg-ghost" data-a="quit" aria-label="${t('cor.exit', 'Sair')}">${icon('close', { size: 20 })}</button>
          <span class="pg-pill" data-r></span>
          <div class="pg-tbar"><i></i></div>
          <span class="pg-pill" data-sc></span>
        </div>
        <div class="pg-players"></div>
        <div class="pg-stage"><canvas></canvas><div class="pg-phase"></div><div class="pg-hint"></div><div class="pg-iname"></div></div>
      </div>
      <div class="pg-dock"></div>`;
    this.stage = d.querySelector('.pg-stage canvas');
    this.sx = this.stage!.getContext('2d');
    this.bar = d.querySelector('.pg-tbar');
    this.picker = new Picker(this.gov.settings.dprCap);
    this.picker.onChange = () => {
      if (this.phase === 'pick') this.drawStage();
    };
    d.querySelector('.pg-dock')!.appendChild(this.picker.el);
    this.picker.act.innerHTML = `<button class="pg-btn pg-gold pg-ready" data-a="ready">${icon('check', { size: 22 })}${t('cor.ready', 'Pronto!')}</button>`;
    this.bind(d, '[data-a=ready]', () => this.submitHuman());
    this.bind(d, '[data-a=quit]', () => this.quitConfirm());
    this.layout();
    this.loopStart();
  }

  private quitConfirm(): void {
    this.paused = true;
    const q = document.createElement('div');
    q.className = 'pg-ov pg-dim pg-center';
    q.innerHTML = `<div class="pg-card" style="align-items:center;text-align:center"><div class="pg-hand">${t('cor.quitQ', 'Sair da partida?')}</div><div class="pg-sub">${t('cor.quitD', 'O progresso desta partida será perdido.')}</div>
      <div class="pg-row" style="width:100%"><button class="pg-btn pg-grow" data-a="no">${t('cor.keep', 'Continuar')}</button><button class="pg-btn pg-pink pg-grow" data-a="yes">${t('cor.leave', 'Sair')}</button></div></div>`;
    this.el.appendChild(q);
    this.bind(q, '[data-a=no]', () => {
      q.remove();
      this.paused = false;
    });
    this.bind(q, '[data-a=yes]', () => {
      this.paused = false;
      this.duel?.leave();
      this.duel = null;
      this.menu();
    });
  }

  private layout(): void {
    const W = this.el.clientWidth || window.innerWidth;
    const H = this.el.clientHeight || window.innerHeight;
    const land = W > H * 1.05;
    this.el.classList.toggle('pg-land', land);
    if (this.picker) {
      const size = land ? Math.min(H - 24, W * 0.37, 340) : Math.min(W - 16 - 10 - 132, H * 0.33, 320);
      this.picker.resize(size);
    }
    this.fitStage();
  }

  private fitStage(): void {
    const c = this.stage;
    if (!c) return;
    const r = c.parentElement!.getBoundingClientRect();
    this.dpr = Math.min(this.gov.settings.dprCap, window.devicePixelRatio || 1);
    const w = Math.max(10, Math.round(r.width));
    const h = Math.max(10, Math.round(r.height));
    if (w !== this.sw || h !== this.sh || c.width !== Math.round(w * this.dpr)) {
      this.sw = w;
      this.sh = h;
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.drawStage();
  }

  private renderPlayers(): void {
    const box = this.el.querySelector('.pg-players') as HTMLElement | null;
    if (!box) return;
    const solo = this.players.length === 1;
    box.style.display = solo ? 'none' : '';
    const me = this.humans[this.turn];
    box.innerHTML = this.players
      .map((p, i) => `<div class="pg-pl${i === me && this.phase !== 'reveal' ? ' me' : ''}${p.done && this.phase === 'pick' ? ' done' : ''}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><em>${Math.round(p.setScore)}${this.maxSets > 1 ? ` · ${p.setsWon}` : ''}</em></div>`)
      .join('');
    const r = this.el.querySelector('[data-r]');
    if (r) r.textContent = `${this.idx + 1}/${this.items.length}${this.maxSets > 1 ? ' · ' + t('cor.setN', 'Set {n}', { n: this.setNo }) : ''}`;
    const sc = this.el.querySelector('[data-sc]');
    if (sc) {
      const p = this.players[this.humans[Math.min(this.turn, this.humans.length - 1)]];
      sc.innerHTML = `${icon('star', { size: 16 })}${fmt(Math.round(p.setScore))}`;
    }
  }

  private setPhaseLabel(txt: string, mem = false): void {
    const b = this.el.querySelector('.pg-phase') as HTMLElement | null;
    if (!b) return;
    b.textContent = txt;
    b.classList.toggle('pg-mem', mem);
    b.style.display = txt ? '' : 'none';
  }
  private setName(it: Item | null, hidden = false): void {
    const n = this.el.querySelector('.pg-iname') as HTMLElement | null;
    if (!n) return;
    n.innerHTML = it ? `<small>${esc(catName(it.cat))}</small>${hidden ? '?' : esc(itemName(it))}` : '';
  }
  private setHint(txt: string): void {
    const h = this.el.querySelector('.pg-hint') as HTMLElement | null;
    if (h) h.textContent = txt;
  }

  /* ============================== rodada ============================== */
  private get item(): Item {
    return this.items[this.idx];
  }
  private memTime(): number {
    if (this.mode === 'practice' && this.sv.showTarget) return 0.6;
    return Math.max(1.5, 3.4 - this.idx * 0.18 - this.level * 0.3 - (this.setNo - 1) * 0.15);
  }
  private pickTime(): number {
    if (this.mode === 'practice' && this.sv.noTimer) return Infinity;
    return Math.max(5.5, 12 - this.idx * 0.55 - this.level * 0.8 - (this.setNo - 1) * 0.4);
  }

  private startItem(): void {
    for (const p of this.players) {
      p.done = false;
      p.pick = '';
      p.acc = 0;
    }
    this.turn = 0;
    // robôs decidem já (o momento em que "travam" aparece durante o pintar)
    const pt = this.pickTime();
    const span = isFinite(pt) ? pt : 9;
    for (const p of this.players)
      if (p.bot >= 0) {
        p.pick = botPick(this.item.hex, p.bot, this.item.diff, this.rng);
        p.lockAt = span * (0.3 + this.rng() * 0.55) * (1 - p.bot * 0.08);
      }
    this.nextHuman();
  }

  private nextHuman(): void {
    if (this.humans.length > 1) this.handoff();
    else this.showPhase();
  }

  private handoff(): void {
    this.phase = 'handoff';
    const p = this.players[this.humans[this.turn]];
    this.renderPlayers();
    this.setName(null);
    this.setHint('');
    this.setPhaseLabel('');
    this.drawStage();
    const q = document.createElement('div');
    q.className = 'pg-ov pg-dim pg-center';
    q.innerHTML = `<div class="pg-card" style="align-items:center;text-align:center"><i style="width:54px;height:54px;border-radius:50%;background:${p.color};border:4px solid #fff;display:block"></i>
      <div class="pg-hand">${t('cor.turnOf', 'Vez de {name}', { name: esc(p.name) })}</div><div class="pg-sub">${t('cor.passPhone', 'Passe o celular. Os outros não podem espiar!')}</div>
      <button class="pg-btn pg-green pg-big" data-a="go">${t('cor.imReady', 'Estou pronto')}</button></div>`;
    this.el.appendChild(q);
    this.bind(q, '[data-a=go]', () => {
      q.remove();
      this.showPhase();
    });
  }

  private showPhase(): void {
    this.phase = 'show';
    this.phaseT = 0;
    this.phaseDur = this.memTime();
    this.lastSec = -1;
    const dock = this.el.querySelector('.pg-dock') as HTMLElement;
    dock.innerHTML = '';
    dock.appendChild(this.picker!.el);
    this.picker!.setLocked(true);
    const r = this.rng;
    this.picker!.set({ h: r() * 360, s: 0.35 + r() * 0.3, v: 0.45 + r() * 0.3 });
    this.picker!.touched = false;
    this.renderPlayers();
    this.setPhaseLabel(t('cor.memorize', 'Memorize!'), true);
    this.setName(this.item);
    this.setHint('');
    this.layout();
    audio.jump(this.idx);
  }

  private pickPhase(): void {
    this.phase = 'pick';
    this.phaseT = 0;
    this.phaseDur = this.pickTime();
    this.lastSec = -1;
    this.picker!.setLocked(false);
    this.setPhaseLabel(t('cor.paint', 'Pinte!'));
    this.setName(this.item, false);
    this.setHint(this.sv.hints ? t('cor.hint', 'Dica: {d}', { d: describe(this.item.hex) }) : '');
    this.renderPlayers();
    this.drawStage();
    audio.land(0);
  }

  private submitHuman(): void {
    if (this.phase !== 'pick') return;
    const i = this.humans[this.turn];
    const p = this.players[i];
    p.pick = this.picker!.hex;
    p.done = true;
    this.picker!.setLocked(true);
    tap('medium');
    if (this.turn < this.humans.length - 1) {
      this.turn++;
      this.nextHuman();
      return;
    }
    // robôs que ainda não travaram terminam agora
    for (const b of this.players) b.done = true;
    this.reveal();
  }

  /* ============================== revelação ============================== */
  private reveal(): void {
    this.phase = 'reveal';
    this.revealT0 = performance.now();
    const it = this.item;
    const s = this.sv;
    for (const p of this.players) {
      p.acc = accuracy(it.hex, p.pick || '#808080');
      p.setScore += p.acc;
      p.total += p.acc;
      if (p.acc >= 95) p.perfects++;
      p.streak = p.acc >= 90 ? p.streak + 1 : 0;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
    }
    if (!s.seen.includes(it.idx)) s.seen.push(it.idx);
    const me = this.players[this.humans[0]];
    const mine = this.humans.map((i) => this.players[i]);
    const best = Math.max(...mine.map((p) => p.acc));
    s.picks += mine.length;
    for (const p of mine) if (p.acc >= 95) s.perfects++;
    let newBest = false;
    if (best > s.bestAcc) {
      newBest = s.bestAcc > 0 && best >= 90;
      s.bestAcc = best;
    }
    for (const p of mine) s.bestStreak = Math.max(s.bestStreak, p.bestStreak);
    this.save();
    this.duel?.progress(Math.round(me.total), (this.idx + 1) / this.items.length);

    this.setPhaseLabel('');
    this.setHint('');
    this.setName(it);
    this.renderPlayers();
    // DOM da revelação no palco
    const stage = this.el.querySelector('.pg-stage') as HTMLElement;
    stage.querySelectorAll('.pg-rev,.pg-revside').forEach((x) => x.remove());
    const solo = this.humans.length === 1;
    const showP = solo ? me : this.players.filter((p) => p.bot < 0).sort((a, b) => b.acc - a.acc)[0];
    const dE = deltaE2000(hexToRgb(it.hex), hexToRgb(showP.pick));
    const stars = showP.acc >= 95 ? 3 : showP.acc >= 90 ? 2 : showP.acc >= 80 ? 1 : 0;
    stage.insertAdjacentHTML(
      'beforeend',
      `<div class="pg-revside" style="left:8px">${solo ? t('cor.yours', 'Sua cor') : esc(showP.name)}</div><div class="pg-revside" style="right:8px">${t('cor.real', 'Cor real')}</div>
       <div class="pg-rev"><div class="pg-pct"><span data-p>0</span><small>%</small></div><div class="pg-de">ΔE ${dE.toFixed(1).replace('.', t('cor.decimal', ','))}</div>
       <div class="pg-stars">${[0, 1, 2].map((k) => `<i class="${k < stars ? '' : 'off'}" style="animation-delay:${0.55 + k * 0.15}s">★</i>`).join('')}</div>
       <div class="pg-fb">${esc(feedback(it.hex, showP.pick))}</div></div>`,
    );
    // contagem do %
    const span = stage.querySelector('[data-p]') as HTMLElement;
    const target = showP.acc;
    const t0 = performance.now() + 380;
    let ticks = 0;
    const count = () => {
      if (this.dead || !span.isConnected) return;
      const k = clamp((performance.now() - t0) / 700, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      span.textContent = pct(target * e);
      const tk = Math.floor(e * 12);
      if (tk > ticks) {
        ticks = tk;
        audio.tick(tk);
      }
      if (k < 1) requestAnimationFrame(count);
      else this.revealSfx(showP.acc, newBest);
    };
    requestAnimationFrame(count);

    // painel de ranking no lugar do seletor
    const dock = this.el.querySelector('.pg-dock') as HTMLElement;
    const hgt = dock.offsetHeight;
    this.picker!.el.remove();
    const panel = document.createElement('div');
    panel.className = 'pg-card';
    panel.style.minHeight = Math.min(hgt, 400) + 'px';
    panel.style.justifyContent = 'center';
    const order = [...this.players].sort((a, b) => b.acc - a.acc);
    const lastItem = this.idx >= this.items.length - 1;
    panel.innerHTML = `
      <div class="pg-rank">${order
        .map((p) => `<div class="${p.bot < 0 ? 'me' : ''}"><i style="background:${p.pick}"></i><span>${esc(p.name)}</span><em>${p.streak >= 3 ? icon('fire', { size: 14 }) + p.streak : ''}</em><b>${pct(p.acc)}%</b></div>`)
        .join('')}</div>
      <button class="pg-btn pg-gold pg-big" data-a="next">${lastItem ? t('cor.results', 'Ver resultado') : t('cor.next', 'Próximo')}${icon('play', { size: 22 })}</button>`;
    dock.innerHTML = '';
    dock.appendChild(panel);
    this.bind(panel, '[data-a=next]', () => this.advance());
    // toasts de sequência
    for (const p of mine) if (p.streak === 3 || p.streak === 5 || p.streak === 8) setTimeout(() => this.toast(t('cor.streak', '{name}: {n} seguidas acima de 90%!', { name: p.name, n: p.streak })), 1300);
    this.drawStage();
  }

  private revealSfx(acc: number, newBest: boolean): void {
    if (acc >= 98) {
      audio.record();
      success();
      this.confetti(110);
      this.toast(t('cor.perfect', 'PERFEITO!'));
    } else if (acc >= 95) {
      audio.perfect(2);
      success();
      this.confetti(40);
    } else if (acc >= 90) audio.coin(3);
    else if (acc >= 75) audio.land(1);
    else audio.fail();
    if (newBest) setTimeout(() => this.toast(t('cor.newBest', 'Nova melhor precisão: {n}%', { n: pct(acc) })), 900);
  }

  private advance(): void {
    if (this.idx < this.items.length - 1) {
      this.idx++;
      this.startItem();
      return;
    }
    this.endSet();
  }

  /* ============================== fim de set / partida ============================== */
  private endSet(): void {
    const order = [...this.players].sort((a, b) => b.setScore - a.setScore);
    const top = order[0];
    const tie = order.length > 1 && Math.abs(order[1].setScore - top.setScore) < 0.05;
    if (this.mode === 'duel' && !tie) top.setsWon++;
    const champ = this.players.find((p) => p.setsWon >= this.setsToWin);
    const last = this.mode !== 'duel' || !!champ || this.setNo >= this.maxSets;
    if (last) return this.endMatch();
    const d = this.ov('pg-dim pg-center');
    d.innerHTML = `
      <div class="pg-hand">${t('cor.setEnd', 'Fim do set {n}', { n: this.setNo })}</div>
      <div class="pg-sub">${tie ? t('cor.setTie', 'Empate! Ninguém leva o set.') : t('cor.setWin', '{name} venceu o set!', { name: esc(top.name) })}</div>
      <div class="pg-card"><div class="pg-rank">${order
        .map((p) => `<div class="${p.bot < 0 ? 'me' : ''}"><i style="background:${p.color}"></i><span>${esc(p.name)}</span><em>${t('cor.setsWon', '{n} sets', { n: p.setsWon })}</em><b>${fmt(Math.round(p.setScore))}</b></div>`)
        .join('')}</div>
      <button class="pg-btn pg-gold pg-big" data-a="go">${t('cor.nextSet', 'Próximo set')}${icon('play', { size: 22 })}</button></div>`;
    if (top.bot < 0 && !tie) audio.unlock2();
    this.bind(d, '[data-a=go]', () => this.newSet(this.items.length));
  }

  private endMatch(): void {
    const s = this.sv;
    const mode = this.mode;
    const order = [...this.players].sort((a, b) => (mode === 'duel' ? b.setsWon - a.setsWon || b.total - a.total : b.total - a.total));
    const humans = this.players.filter((p) => p.bot < 0);
    const lead = humans.slice().sort((a, b) => b.total - a.total)[0];
    const place = order.indexOf(lead) + 1;
    const won = mode === 'duel' ? place === 1 : true;
    const n = this.items.length * this.setNo;
    const avg = lead.total / Math.max(1, n);
    const perfects = humans.reduce((a, p) => a + p.perfects, 0);
    // recompensas (moedas: 1 crédito por partida; XP local)
    let coins = Math.round(avg / 10) + perfects * 2;
    if (mode === 'duel') coins += won ? 15 + this.level * 5 + (this.players.length - 1) * 2 : 4;
    if (mode === 'daily') coins = this.official ? coins * 2 + 10 : Math.round(coins / 2);
    const xp = Math.round(humans.reduce((a, p) => a + p.total, 0) / 10) + (won && mode === 'duel' ? 30 : 0);
    const lvBefore = levelOf(s.xp).lv;
    s.xp += xp;
    s.games++;
    if (mode === 'duel' && won) s.wins++;
    let dailyMsg = '';
    if (mode === 'daily' && this.official) {
      const today = dayNumber();
      s.dailyStreak = s.dailyDay === today - 1 ? s.dailyStreak + 1 : 1;
      s.dailyDay = today;
      s.dailyScore = Math.round(lead.total);
      s.dailyBest = Math.max(s.dailyBest, s.dailyScore);
      dailyMsg = t('cor.dailyStreak', 'Dias seguidos no desafio: {n}', { n: s.dailyStreak });
    }
    const score = Math.round(lead.total);
    this.duel?.finish(score);
    let recPos = -1;
    if (this.official) {
      const rec: CorRecord = { score, mode, day: dayNumber() };
      recPos = addRecord(rec);
    }
    this.save();
    if (coins > 0) addCoins(coins);
    reportRun({ game: 'cor', score, coins, durationSec: Math.round((performance.now() - this.t0) / 1000), won, place, stats: { perfects, items: n, avg: Math.round(avg) } });
    const lvAfter = levelOf(s.xp).lv;

    const d = this.ov('pg-dim');
    const podium = order.slice(0, 3);
    const hs = [110, 140, 90];
    const pos = podium.length >= 2 ? [1, 0, 2] : [0];
    const title =
      mode === 'duel' ? (won ? t('cor.youWin', 'Vitória!') : t('cor.winnerIs', '{name} venceu!', { name: esc(order[0].name) })) : mode === 'daily' ? t('cor.daily', 'Desafio do dia') : t('cor.practiceEnd', 'Treino concluído!');
    d.innerHTML = `
      <div class="pg-logo" style="font-size:34px"><span style="color:${won ? '#ffd166' : '#fff'}">${title}</span></div>
      ${
        mode === 'duel' && this.players.length > 1
          ? `<div class="pg-podium">${pos
              .filter((i) => podium[i])
              .map((i) => {
                const p = podium[i];
                return `<div style="height:${hs[i === 0 ? 1 : i === 1 ? 0 : 2]}px;background:${['#ffd166', '#cfd6e6', '#e0a070'][i]};color:#2a0b5c;animation-delay:${0.15 * i}s"><i style="background:${p.color}"></i><b>${i + 1}º</b><span>${esc(p.name)}</span></div>`;
              })
              .join('')}</div>`
          : `<div class="pg-pct" style="font-size:64px">${fmt(score)}<small> ${t('cor.pts', 'pts')}</small></div>`
      }
      <div class="pg-card">
        <div class="pg-rank">${order
          .map((p) => `<div class="${p.bot < 0 ? 'me' : ''}"><i style="background:${p.color}"></i><span>${esc(p.name)}${p.bot >= 0 ? ` <em>${lvName(p.bot)}</em>` : ''}</span><em>${mode === 'duel' && this.maxSets > 1 ? t('cor.setsWon', '{n} sets', { n: p.setsWon }) + ' · ' : ''}${t('cor.avg', 'média {n}%', { n: pct(p.total / n) })}</em><b>${fmt(Math.round(p.total))}</b></div>`)
          .join('')}</div>
        <div class="pg-row">
          <span class="pg-pill">${icon('coin', { size: 20 })}+${coins}</span>
          <span class="pg-pill">${icon('star', { size: 20 })}+${xp} XP</span>
          ${perfects ? `<span class="pg-pill">${icon('sparkle', { size: 20 })}${t('cor.perfects', '{n} acima de 95%', { n: perfects })}</span>` : ''}
        </div>
        ${dailyMsg ? `<div class="pg-sub" style="margin:0 auto">${dailyMsg}</div>` : ''}
        ${recPos >= 0 && recPos < 3 ? `<div class="pg-sub" style="margin:0 auto;color:#ffd166">${t('cor.recPos', 'Entrou no seu top 3 de recordes!')}</div>` : ''}
        <button class="pg-btn pg-green pg-big" data-a="again">${icon('refresh', { size: 24 })}${mode === 'daily' ? t('cor.trainMore', 'Treinar') : t('cor.again', 'Jogar de novo')}</button>
        <button class="pg-btn" data-a="menu">${t('cor.menu', 'Menu')}</button>
      </div>`;
    if (won) {
      audio.cash();
      this.confetti(mode === 'duel' ? 140 : 60);
    } else audio.fail();
    if (lvAfter > lvBefore) setTimeout(() => this.toast(t('cor.levelUp', 'Subiu para o nível {n}!', { n: lvAfter })), 700);
    this.bind(d, '[data-a=again]', () => (mode === 'duel' ? this.startDuel() : this.startPractice()));
    this.bind(d, '[data-a=menu]', () => this.menu());
  }

  /* ============================== álbum e recordes ============================== */
  private album(): void {
    const d = this.ov();
    const s = this.sv;
    let cat = CATS[0].id;
    const seen = new Set(s.seen);
    const render = () => {
      const c = CATS.find((x) => x.id === cat)!;
      const list = ITEMS.filter((it) => it.cat === c);
      const got = list.filter((it) => seen.has(it.idx)).length;
      d.innerHTML = `
        <div class="pg-logo" style="font-size:30px"><span style="color:#ffd166">${t('cor.album', 'Álbum')}</span></div>
        <div class="pg-sub">${t('cor.albumD', 'Itens que você já pintou: {a} de {b}', { a: s.seen.length, b: ITEMS.length })}</div>
        <div class="pg-chips" style="max-width:560px">${CATS.map((x) => `<button data-c="${x.id}" class="${x.id === cat ? 'on' : ''}">${esc(catName(x))}</button>`).join('')}</div>
        <div class="pg-lbl">${esc(catName(c))} · ${got}/${list.length}</div>
        <canvas class="pg-album"></canvas>
        <button class="pg-btn pg-ghost" data-a="back">${t('cor.back', 'Voltar')}</button>`;
      d.querySelector<HTMLElement>('.pg-chips .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
      const cv = d.querySelector('canvas') as HTMLCanvasElement;
      const W = Math.min(560, d.clientWidth - 28);
      const cols = W > 420 ? 6 : 4;
      const cell = W / cols;
      const rows = Math.ceil(list.length / cols);
      const dpr = Math.min(this.gov.settings.dprCap, window.devicePixelRatio || 1);
      cv.style.width = W + 'px';
      cv.style.height = rows * cell + 'px';
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(rows * cell * dpr);
      const x = cv.getContext('2d')!;
      x.scale(dpr, dpr);
      x.textAlign = 'center';
      x.font = `700 ${Math.round(cell * 0.11)}px Fredoka, system-ui, sans-serif`;
      list.forEach((it, i) => {
        const cx = (i % cols) * cell + cell / 2;
        const cy = Math.floor(i / cols) * cell + cell * 0.42;
        const ok = seen.has(it.idx);
        if (ok) drawItem(x, it.shape, it.hex, it.sec, cx, cy, cell * 0.66);
        else {
          x.save();
          x.globalAlpha = 0.35;
          drawItem(x, it.shape, '#8a86a0', '#8a86a0', cx, cy, cell * 0.66);
          x.restore();
        }
        x.fillStyle = '#2b2140';
        const nm = ok ? itemName(it) : '?';
        x.fillText(nm.length > 16 ? nm.slice(0, 15) + '…' : nm, cx, cy + cell * 0.47);
      });
      this.bind(d, '[data-c]', (b) => ((cat = b.dataset.c!), render()));
      this.bind(d, '[data-a=back]', () => this.menu());
    };
    render();
  }

  private records(): void {
    const d = this.ov();
    const s = this.sv;
    const mName = (m: string) => (m === 'duel' ? t('cor.duel', 'Duelo') : m === 'daily' ? t('cor.daily', 'Desafio do dia') : t('cor.practice', 'Treino'));
    const date = (day: number) => new Date(day * 86400000).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
    d.innerHTML = `
      <div class="pg-logo" style="font-size:30px"><span style="color:#ffd166">${t('cor.records', 'Recordes')}</span></div>
      <div class="pg-card">
        <div class="pg-lb">${s.records.length ? s.records.map((r, i) => `<div><b>${i + 1}º</b><span>${fmt(r.score)} ${t('cor.pts', 'pts')}</span><em>${mName(r.mode)} · ${date(r.day)}</em></div>`).join('') : `<div class="pg-sub">${t('cor.noRecords', 'Jogue uma partida para aparecer aqui!')}</div>`}</div>
        <div class="pg-row">
          <span class="pg-pill">${icon('target', { size: 18 })}${t('cor.bestAcc', 'Melhor precisão')}: ${s.bestAcc ? pct(s.bestAcc) + '%' : '—'}</span>
          <span class="pg-pill">${icon('sparkle', { size: 18 })}${t('cor.perfectsTotal', '95%+: {n}', { n: s.perfects })}</span>
          <span class="pg-pill">${icon('fire', { size: 18 })}${t('cor.bestStreak', 'Maior sequência: {n}', { n: s.bestStreak })}</span>
          <span class="pg-pill">${icon('calendar', { size: 18 })}${t('cor.dailyBest', 'Melhor desafio: {n}', { n: fmt(s.dailyBest) })}</span>
        </div>
      </div>
      <button class="pg-btn pg-ghost" data-a="back">${t('cor.back', 'Voltar')}</button>`;
    this.bind(d, '[data-a=back]', () => this.menu());
  }

  /* ============================== laço e desenho ============================== */
  private loopStart(): void {
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    const step = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(step);
      const q = this.gov.settings;
      const frameMs = now - this.last;
      if (q.fpsCap === 30 && frameMs < 30) return;
      this.last = now;
      const dt = Math.min(0.1, frameMs / 1000);
      const w0 = performance.now();
      if (!this.paused) this.tick(dt);
      this.gov.sample(frameMs, performance.now() - w0);
    };
    this.raf = requestAnimationFrame(step);
  }

  private tick(dt: number): void {
    if (this.phase === 'show' || this.phase === 'pick') {
      this.phaseT += dt;
      const left = this.phaseDur - this.phaseT;
      if (this.bar) {
        const f = isFinite(this.phaseDur) ? clamp(left / this.phaseDur, 0, 1) : 1;
        (this.bar.firstElementChild as HTMLElement).style.transform = `scaleX(${f})`;
        this.bar.classList.toggle('pg-hurry', this.phase === 'pick' && left < 3);
      }
      if (this.phase === 'pick') {
        // robôs travando
        let changed = false;
        for (const p of this.players)
          if (p.bot >= 0 && !p.done && this.phaseT >= p.lockAt) {
            p.done = true;
            changed = true;
          }
        if (changed) {
          this.renderPlayers();
          audio.tick(2);
        }
        if (isFinite(left) && left < 3.2) {
          const sec = Math.ceil(left);
          if (sec !== this.lastSec && sec >= 0) {
            this.lastSec = sec;
            audio.tick(14 - sec);
            tap('light');
          }
        }
        if (left <= 0) this.submitHuman();
      } else {
        this.drawStage();
        if (left <= 0) this.pickPhase();
      }
    } else if (this.phase === 'reveal' && performance.now() - this.revealT0 < 600) this.drawStage();
  }

  private drawStage(): void {
    const x = this.sx;
    if (!x || !this.stage) return;
    const W = this.sw;
    const H = this.sh;
    x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    x.fillStyle = '#c9c7cf';
    x.fillRect(0, 0, W, H);
    const it = this.items[this.idx];
    if (!it) return;
    const top = 30;
    const bottom = 46;
    const size = Math.min(W * 0.78, H - top - bottom);
    const cy = top + (H - top - bottom) / 2;
    if (this.phase === 'show') {
      const k = clamp(this.phaseT / 0.25, 0, 1);
      const pop = k < 1 ? 0.6 + 0.4 * (1 - Math.pow(1 - k, 3)) + Math.sin(k * Math.PI) * 0.08 : 1 + Math.sin(this.phaseT * 3) * 0.015;
      drawItem(x, it.shape, it.hex, it.sec, W / 2, cy, size * pop);
    } else if (this.phase === 'pick' && this.picker) {
      const col = this.picker.hex;
      if (this.mode === 'practice' && this.sv.showTarget) {
        const sz = Math.min(W * 0.46, H - top - bottom);
        drawItem(x, it.shape, it.hex, it.sec, W * 0.27, cy, sz);
        drawItem(x, it.shape, col, col, W * 0.73, cy, sz);
      } else drawItem(x, it.shape, col, col, W / 2, cy, size);
    } else if (this.phase === 'reveal') {
      const me = this.humans.length === 1 ? this.players[this.humans[0]] : this.players.filter((p) => p.bot < 0).sort((a, b) => b.acc - a.acc)[0];
      const k = clamp((performance.now() - this.revealT0) / 450, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const off = (1 - e) * (W / 2);
      x.fillStyle = me.pick;
      x.fillRect(-off, 0, W / 2 + 1, H);
      x.fillStyle = it.hex;
      x.fillRect(W / 2 + off, 0, W / 2, H);
      // os itens pequenos nas duas metades, cada um na sua cor (com contorno)
      const sm = Math.min(W * 0.26, H * 0.32);
      x.save();
      x.globalAlpha = e;
      drawItem(x, it.shape, me.pick, me.pick, W * 0.17, H - sm * 0.5 - 30, sm);
      drawItem(x, it.shape, it.hex, it.sec, W * 0.83, H - sm * 0.5 - 30, sm);
      x.restore();
      x.fillStyle = '#1d0b48';
      x.fillRect(W / 2 - 1.5, 0, 3, H * e);
    }
  }

  /* ============================== confete ============================== */
  private confetti(n: number): void {
    const q = this.gov.settings;
    n = Math.round(n * Math.max(0.3, q.particleBudget));
    const W = this.el.clientWidth;
    const H = this.el.clientHeight;
    const dpr = Math.min(q.dprCap, window.devicePixelRatio || 1);
    if (this.cf.width !== Math.round(W * dpr)) {
      this.cf.width = Math.round(W * dpr);
      this.cf.height = Math.round(H * dpr);
    }
    const cols = ['#ff4f8b', '#4fc3ff', '#ffe14f', '#6dff8a', '#b388ff', '#ff9a3d'];
    for (let i = 0; i < n; i++)
      this.parts.push({ x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 700, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: cols[i % cols.length], w: 6 + Math.random() * 6, life: 1.6 + Math.random() * 0.8 });
    if (!this.cfRaf) {
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const x = this.cfx;
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, W, H);
        this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
        for (const p of this.parts) {
          p.vy += 1100 * dt;
          p.vx *= 1 - 1.6 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.r += p.vr * dt;
          x.save();
          x.translate(p.x, p.y);
          x.rotate(p.r);
          x.globalAlpha = Math.min(1, p.life * 2);
          x.fillStyle = p.c;
          x.fillRect(-p.w / 2, -p.w * 0.3, p.w, p.w * 0.6 * Math.abs(Math.cos(p.r * 2)) + 1);
          x.restore();
        }
        if (this.parts.length && !this.dead) this.cfRaf = requestAnimationFrame(step);
        else {
          this.cfRaf = 0;
          x.clearRect(0, 0, W, H);
        }
      };
      this.cfRaf = requestAnimationFrame(step);
    }
  }

  /* ============================== handle ============================== */
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
    this.last = performance.now();
  }
  destroy(): void {
    this.dead = true;
    this.duel?.leave();
    cancelAnimationFrame(this.raf);
    cancelAnimationFrame(this.cfRaf);
    this.picker?.destroy();
    for (const f of this.offs) f();
    this.save();
    this.el.remove();
  }
}
