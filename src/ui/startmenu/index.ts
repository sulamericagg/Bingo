/* ============================================================
 *  TELA DE INÍCIO PADRÃO DOS JOGOS (modelo: hangar do Pouso Forçado).
 *  Para crianças que ainda não leem: ícones grandes, rótulos de UMA linha,
 *  um botão JOGAR gigante, cartões ilustrados, carinhas de dificuldade,
 *  3 espaços de jogo salvo (como no Minecraft), "Com amigos" (grupo) e
 *  "Servidores" numa seção à parte. Voz lê o cartão tocado (se a narração
 *  estiver ligada). Retrato e paisagem; respeita as bordas seguras.
 *
 *    const m = openStartMenu(parent, {
 *      game: 'noites', onBack: exit,
 *      build: (p) => { p.faces(...); p.play({ onTap: start }); p.friends({ onTap: host }); },
 *    });
 *    m.refresh();  m.push(build, título);  m.back();  m.el.remove()  // ou m.destroy()
 * ============================================================ */
import { t } from '../../i18n';
import { audio } from '../../core/audio';
import { tap } from '../../core/haptics';
import { save as globalSave } from '../../core/storage';
import { pushBack } from '../../core/back';
import { listGames, type HubTheme } from '../../hub/registry';
import { drawPlayer, type PlayerPose } from '../../game/character';
import { SKINS } from '../../game/skins';
import { icon } from '../icons';
import { FRIENDS_SVG } from '../../party/duel-link';
import { faceSvg } from './faces';
import { smHush, smSay } from './voice';
import './startmenu.css';

export { faceSvg } from './faces';
export { smSay } from './voice';

/** desenho de palco/miniatura; devolver `false` = ainda não pronto (tenta de novo no próximo quadro) */
export type SmDraw = (x: CanvasRenderingContext2D, w: number, h: number, t: number) => void | boolean;
export interface SmBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TAU = Math.PI * 2;
const INK = '#2a0b5c';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/* ------------------------------ ícones da moldura ------------------------------ */
const SVG_X = `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`;
const SVG_BACK = `<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M15 4l-8 8 8 8" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_PLAY = `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M16 9c0-2.6 2.8-4.1 5-2.7l19 13c2 1.4 2 4.1 0 5.5l-19 13c-2.2 1.4-5-.1-5-2.7z" fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M19 13l13 8.6" stroke="#ffe680" stroke-width="3" stroke-linecap="round" opacity=".9"/></svg>`;
const SVG_PLUS = `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="rgba(255,255,255,.9)" stroke="${INK}" stroke-width="3.5"/><path d="M24 14v20M14 24h20" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></svg>`;
const SVG_TRASH = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M5 7h14l-1.2 13H6.2z" fill="#fff" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M3.5 7h17M9 7V4h6v3M10 11v6M14 11v6" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const SVG_OK = `<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const SVG_GLOBE = `<svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true"><circle cx="24" cy="24" r="19" fill="#7ad8ff" stroke="${INK}" stroke-width="3.5"/><path d="M12 14c5 2 6 6 3 9s0 7 4 8-1 7-3 8M30 7c-2 4 1 6 4 6s6 4 3 8-1 7 2 8" fill="#5ee08a" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><ellipse cx="17" cy="14" rx="5" ry="2.5" fill="#fff" opacity=".5" transform="rotate(-30 17 14)"/></svg>`;
const SVG_PENCIL = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z" fill="#ffd34a" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M13.8 6.8l3.4 3.4M4 20l4.6-1.2" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M5.2 15.4l3.4 3.4" stroke="#ff8ab8" stroke-width="2"/></svg>`;
export const SM_ICONS = { play: SVG_PLAY, plus: SVG_PLUS, trash: SVG_TRASH, globe: SVG_GLOBE, friends: FRIENDS_SVG };

/* ------------------------------ tipos ------------------------------ */
export interface SmCard {
  id?: string;
  /** ícone grande (HTML/SVG) */
  icon?: string;
  /** ou uma miniatura desenhada (animada se `live`) */
  art?: SmDraw;
  live?: boolean;
  /** rótulo de UMA linha */
  label: string;
  /** detalhe curtinho (ex.: "Fase 3", "+25") — opcional */
  sub?: string;
  /** frase lida em voz alta ao tocar (padrão: o rótulo) */
  say?: string;
  /** cor do fundo da ilustração */
  color?: string;
  /** selo no canto (ex.: "NOVO", "3") */
  badge?: string;
  /** trancado: mostra cadeado (+ HTML curto, ex.: "★ 5" — já escapado por quem chama) e treme ao tocar */
  lock?: boolean | string;
  sel?: boolean;
  disabled?: boolean;
  /** cartão de destaque (dourado) */
  hot?: boolean;
  onTap?: () => void;
}
export interface SmCardsOpts {
  /** 'big' (padrão): ilustração em cima · 'wide': ícone à esquerda, linha comprida · 'small': fileira compacta */
  size?: 'big' | 'wide' | 'small';
  /** colunas (padrão: automático) */
  cols?: number;
  /** rolar na horizontal quando não couber (fases/capítulos) */
  scroll?: boolean;
}
export interface SmSlot {
  /** vazio = "Novo" */
  empty: boolean;
  name?: string;
  /** id estável do save (quando a ordem dos espaços muda, ex.: mais recente primeiro): o nome personalizado segue o save */
  id?: string;
  /** "Dia 3", "Fase 12"... */
  progress?: string;
  progressIcon?: string;
  /** última vez jogado (ms) */
  last?: number;
  /** miniatura: dataURL, desenho ou ícone */
  thumb?: string | SmDraw;
  icon?: string;
  color?: string;
  /** carinha de dificuldade (0..3) no canto */
  diff?: number;
}
export interface SmSlotsOpts {
  /** espaço selecionado (o JOGAR usa este) */
  sel?: number;
  onSelect?(i: number): void;
  /** toque no espaço já selecionado (ou duplo toque): jogar */
  onOpen?(i: number): void;
  /** lixeira (com confirmação) */
  onDelete?(i: number): void;
  newLabel?: string;
  /** lápis de renomear no espaço selecionado (padrão: sim). O nome fica no aparelho (smSlotName). */
  rename?: boolean;
  /** separa os nomes por modo do jogo (ex.: 'shop' / 'factory') */
  key?: string;
  /** sugestões de nome (chips com ícone) na folha de renomear */
  nameIdeas?: SmNameIdea[];
}
export type SmNameIdea = string | { text: string; icon?: string };
export interface SmFace {
  id: string | number;
  /** 0 fácil · 1 normal · 2 difícil · 3 muito difícil */
  level: number;
  label: string;
  say?: string;
}
export interface SmPlayOpts {
  label?: string;
  sub?: string;
  icon?: string;
  say?: string;
  /** 'gold' (padrão) · 'green' (continuar) */
  tone?: 'gold' | 'green';
  onTap(): void;
}
export interface SmFriendsOpts {
  label?: string;
  say?: string;
  /** id do jogo: mostra "Fulano está jogando — ENTRAR" logo abaixo */
  game?: string;
  /** padrão: abre o painel do grupo (convidar amigos) */
  onTap?(): void;
}

export interface SmPage {
  readonly menu: StartMenu;
  /** redesenha esta página (ou a folha) com o estado novo */
  refresh(): void;
  label(text: string, iconHtml?: string): void;
  cards(items: SmCard[], o?: SmCardsOpts): HTMLElement;
  slots(slots: SmSlot[], o?: SmSlotsOpts): HTMLElement;
  faces(items: SmFace[], value: string | number, onPick: (id: string | number) => void, label?: string): HTMLElement;
  play(o: SmPlayOpts): HTMLButtonElement;
  friends(o?: SmFriendsOpts): HTMLButtonElement;
  /** cartão "Servidores" (abre a seção à parte) */
  servers(o: { label?: string; sub?: string; onTap(): void }): HTMLButtonElement;
  toggle(o: { icon?: string; label: string; value: boolean; say?: string; onChange(v: boolean): void }): HTMLElement;
  /** linha pequena de texto clicável (ex.: "Entrar com código / QR") */
  link(label: string, onTap: () => void): HTMLButtonElement;
  /** dica de UMA linha */
  hint(text: string, iconHtml?: string): HTMLElement;
  custom(el: HTMLElement | string): HTMLElement;
}

export interface SmSpec {
  /** id do jogo no hub: tema, nome e vitrine */
  game: string;
  title?: string;
  sub?: string;
  theme?: Partial<HubTheme>;
  /** desenho do palco; padrão: vitrine do jogo numa janela + fundo do tema */
  stage?: SmDraw | false;
  /** palco em tela cheia (o desenho recebe a caixa do palco) — ex.: hangar do avião */
  backdrop?: (x: CanvasRenderingContext2D, W: number, H: number, t: number, box: SmBox) => void;
  /** janela "vazada": mostra o que o jogo já desenha por baixo (ex.: o ateliê 3D) no lugar da vitrine */
  seeThrough?: boolean;
  /** palco feito de DOM (ex.: uma cena 3D pequena): fica numa janela com moldura no lugar da vitrine */
  stageEl?: HTMLElement;
  /** seu Bloop acenando no canto do palco (padrão: sim) */
  mascot?: boolean;
  chips?: { icon: string; text: string }[];
  /** frase de boas-vindas (voz) */
  welcome?: string;
  /** botão X (raiz). Sem isto, o X não aparece. */
  onBack?: () => void;
  /** engrenagem: abre uma folha montada com o mesmo construtor */
  settings?: (p: SmPage) => void;
  onSettings?: () => void;
  build: (p: SmPage) => void;
  className?: string;
  /** aparelho fraco: menos partículas e DPR menor */
  weak?: boolean;
}

export interface StartMenu {
  el: HTMLElement;
  refresh(): void;
  push(build: (p: SmPage) => void, title?: string): void;
  pop(): void;
  /** voltar (Android): fecha confirmação/folha/subpágina; na raiz chama onBack. */
  back(): void;
  depth(): number;
  openSheet(build: (p: SmPage) => void, title?: string): void;
  closeSheet(): void;
  confirm(o: { text: string; icon?: string; thumb?: string | SmDraw; yes?: string; danger?: boolean }): Promise<boolean>;
  setChips(chips: { icon: string; text: string }[]): void;
  setTitle(title: string, sub?: string): void;
  destroy(): void;
}

/* ------------------------------ util ------------------------------ */
/** "Hoje", "Ontem", "3 dias" */
export function smWhen(ms?: number): string {
  if (!ms) return '';
  const d0 = new Date();
  d0.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.ceil((d0.getTime() - ms) / 86400000));
  if (days <= 0) return t('sm.today', 'Hoje');
  if (days === 1) return t('sm.yesterday', 'Ontem');
  return t('sm.daysAgo', '{n} dias', { n: days });
}

const skinOf = (id: string) => SKINS.find((k) => k.id === id && k.id !== 'custom') ?? SKINS[0];

/** desenha o Bloop do jogador (centro do corpo em cx,cy) */
export function smDrawBloop(x: CanvasRenderingContext2D, cx: number, cy: number, R: number, time: number, wave = 0): void {
  const pose: PlayerPose = { t: time, blink: time % 3.4 < 0.12 ? 1 : 0, lookX: 0.12, lookY: 0.08, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: false };
  const sk = skinOf(globalSave.skin);
  x.save();
  x.translate(cx, cy);
  try {
    drawPlayer(x, sk, R, pose);
  } catch {
    x.fillStyle = '#ff8ad8';
    x.beginPath();
    x.arc(0, 0, R, 0, TAU);
    x.fill();
  }
  if (wave > 0) {
    x.translate(R * 0.82, -R * 0.05);
    x.rotate(-0.9 + Math.sin(time * 7) * 0.45 * wave);
    x.fillStyle = sk.light;
    x.strokeStyle = INK;
    x.lineWidth = Math.max(1.5, R * 0.09);
    x.beginPath();
    x.ellipse(R * 0.28, 0, R * 0.32, R * 0.16, 0, 0, TAU);
    x.fill();
    x.stroke();
  }
  x.restore();
}

/** miniatura a partir de uma função antiga que pinta num <canvas> de tamanho fixo (pintada uma vez) */
export function smCanvasArt(paint: (c: HTMLCanvasElement) => void, w = 320, h = 180): SmDraw {
  let c: HTMLCanvasElement | null = null;
  return (x, W, H) => {
    if (!c) {
      c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      try {
        paint(c);
      } catch {
        /* */
      }
    }
    const k = Math.max(W / w, H / h);
    x.drawImage(c, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k);
  };
}
/** ícone 2D / 3D padrão (quadrado plano / cubo) */
export const SM_VIEW_ICON = {
  '2d': `<svg viewBox="0 0 48 48" width="48" height="48"><rect x="8" y="8" width="32" height="32" rx="6" fill="#7ad8ff" stroke="#2a0b5c" stroke-width="3.5"/><path d="M8 30l10-9 8 7 6-5 8 7" fill="none" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><circle cx="31" cy="17" r="4" fill="#ffd34a" stroke="#2a0b5c" stroke-width="2.5"/></svg>`,
  '3d': `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 5l17 9v20l-17 9-17-9V14z" fill="#b08cff" stroke="#2a0b5c" stroke-width="3.5" stroke-linejoin="round"/><path d="M7 14l17 9 17-9" fill="#d9c8ff" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><path d="M24 23v20" stroke="#2a0b5c" stroke-width="3"/><path d="M7 14l17-9 17 9-17 9z" fill="#e8dcff" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/></svg>`,
};

function rr(x: CanvasRenderingContext2D, X: number, Y: number, W: number, H: number, r: number): void {
  x.beginPath();
  x.roundRect(X, Y, W, H, Math.min(r, W / 2, H / 2));
}

function hexA(c: string, a: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(c.trim());
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** vitrine padrão: bolhas nas cores do tema + ícone do jogo */
function fallbackShowcase(theme: HubTheme): SmDraw {
  return (x, w, h, time) => {
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, theme.bg[0]);
    g.addColorStop(1, theme.bg[1]);
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    for (let i = 0; i < 12; i++) {
      const k = (((i * 0.37 + time * 0.05 * (1 + (i % 3) * 0.3)) % 1) + 1) % 1;
      x.fillStyle = hexA(i % 2 ? theme.accent : theme.accent2, 0.25);
      x.beginPath();
      x.arc(((i * 0.618) % 1) * w, h * (1.1 - k * 1.2), h * (0.04 + (i % 4) * 0.02), 0, TAU);
      x.fill();
    }
    smDrawBloop(x, w / 2, h * 0.55 + Math.sin(time * 2) * h * 0.02, Math.min(w, h) * 0.22, time, 1);
  };
}

/* ------------------------------ nomes dos espaços salvos ------------------------------ */
/** nome personalizado de um espaço salvo: localStorage['bw-slotnames'] = { "jogo|modo|i": "nome" } (ou "#id") */
const NAMES_KEY = 'bw-slotnames';
export const SM_NAME_MAX = 18;
const nameId = (game: string, key: string | undefined, i: number | string) => `${game}|${key ?? ''}|${typeof i === 'string' ? '#' + i : i}`;
function readNames(): Record<string, string> {
  try {
    const o = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '{}');
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}
function writeNames(o: Record<string, string>): void {
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(o));
  } catch {
    /* sem espaço / bloqueado */
  }
}
/** limpa o texto digitado: uma linha, sem controles, no máximo SM_NAME_MAX letras */
export function smCleanName(s: string): string {
  // eslint-disable-next-line no-control-regex
  return Array.from(s.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim())
    .slice(0, SM_NAME_MAX)
    .join('')
    .trim();
}
/** nome que a criança deu ao espaço (ou null) — os jogos podem mostrar no jogo */
export function smSlotName(game: string, i: number | string, key?: string): string | null {
  const v = readNames()[nameId(game, key, i)];
  return typeof v === 'string' && v ? v : null;
}
export function smSetSlotName(game: string, i: number | string, name: string | null, key?: string): void {
  const o = readNames();
  const id = nameId(game, key, i);
  const v = name ? smCleanName(name) : '';
  if (v) o[id] = v;
  else if (id in o) delete o[id];
  else return;
  writeNames(o);
}
const DEFAULT_IDEAS = (): SmNameIdea[] => [
  { text: t('sm.idea.1', 'Meu Favorito'), icon: icon('heart', { size: 20 }) },
  { text: t('sm.idea.2', 'Super Aventura'), icon: icon('rocket', { size: 20 }) },
  { text: t('sm.idea.3', 'Jogo Campeão'), icon: icon('trophy', { size: 20 }) },
  { text: t('sm.idea.4', 'Mundo Mágico'), icon: icon('sparkle', { size: 20 }) },
  { text: t('sm.idea.5', 'Missão Secreta'), icon: icon('target', { size: 20 }) },
  { text: t('sm.idea.6', 'Tesouro Brilhante'), icon: icon('gem', { size: 20 }) },
  { text: t('sm.idea.7', 'Festa Bloop'), icon: icon('party', { size: 20 }) },
  { text: t('sm.idea.8', 'Rei da Diversão'), icon: icon('crown', { size: 20 }) },
];

/* ------------------------------ abertura ------------------------------ */
export function openStartMenu(parent: HTMLElement, spec: SmSpec): StartMenu {
  const def = listGames().find((g) => g.id === spec.game);
  const theme: HubTheme = {
    bg: spec.theme?.bg ?? def?.theme.bg ?? ['#6a3fb8', '#1d0f4a'],
    accent: spec.theme?.accent ?? def?.theme.accent ?? '#ff5cae',
    accent2: spec.theme?.accent2 ?? def?.theme.accent2 ?? '#ffd34a',
    title: spec.theme?.title ?? def?.theme.title ?? ['#fff6d6', '#ffd34a'],
  };
  const show: SmDraw | null = spec.stage === false ? null : (spec.stage ?? def?.drawShowcase ?? fallbackShowcase(theme));
  const weak = !!spec.weak || (navigator.hardwareConcurrency || 4) <= 2;

  const el = document.createElement('div');
  el.className = 'sm sm-root' + (spec.className ? ' ' + spec.className : '');
  el.dataset.game = spec.game;
  if (spec.seeThrough) el.style.background = 'transparent';
  el.style.setProperty('--sm-bg1', theme.bg[0]);
  el.style.setProperty('--sm-bg2', theme.bg[1]);
  el.style.setProperty('--sm-acc', theme.accent);
  el.style.setProperty('--sm-acc2', theme.accent2);
  el.style.setProperty('--sm-t1', theme.title[0]);
  el.style.setProperty('--sm-t2', theme.title[1]);
  el.innerHTML = `<canvas class="sm-cv"></canvas>
    <div class="sm-ui">
      <header class="sm-top">
        <button class="sm-icb sm-x" aria-label="${esc(t('sm.exit', 'Sair'))}">${SVG_X}</button>
        <div class="sm-ttl"><b></b><small></small></div>
        <div class="sm-chips"></div>
        <button class="sm-icb sm-gear" aria-label="${esc(t('sm.settings', 'Ajustes'))}">${icon('gear', { size: 30 })}</button>
      </header>
      <div class="sm-stage"></div>
      <div class="sm-panel"><div class="sm-body"></div></div>
    </div>`;
  parent.appendChild(el);
  const cv = el.querySelector('.sm-cv') as HTMLCanvasElement;
  const stageEl = el.querySelector('.sm-stage') as HTMLElement;
  if (spec.stageEl) {
    const f = document.createElement('div');
    f.className = 'sm-stagewin';
    f.appendChild(spec.stageEl);
    stageEl.appendChild(f);
  }
  const panel = el.querySelector('.sm-panel') as HTMLElement;
  const body = el.querySelector('.sm-body') as HTMLElement;
  const xBtn = el.querySelector('.sm-x') as HTMLButtonElement;
  const gear = el.querySelector('.sm-gear') as HTMLButtonElement;
  const ttl = el.querySelector('.sm-ttl') as HTMLElement;
  gear.hidden = !spec.settings && !spec.onSettings;

  const setTitle = (title: string, sub?: string) => {
    (ttl.querySelector('b') as HTMLElement).textContent = title;
    const s = ttl.querySelector('small') as HTMLElement;
    s.textContent = sub ?? '';
    s.hidden = !sub;
  };
  setTitle(spec.title ?? def?.name ?? '', spec.sub);
  const setChips = (chips: { icon: string; text: string }[]) => {
    (el.querySelector('.sm-chips') as HTMLElement).innerHTML = chips.map((c) => `<span>${c.icon}<b>${esc(c.text)}</b></span>`).join('');
  };
  setChips(spec.chips ?? []);

  /* ---------- páginas ---------- */
  const stack: { build: (p: SmPage) => void; title?: string; pop?: () => void }[] = [{ build: spec.build }];
  let arts: { cv: HTMLCanvasElement; draw: SmDraw; live: boolean; drawn: boolean }[] = [];
  let sheet: { el: HTMLElement; build: (p: SmPage) => void; arts: typeof arts; pop: () => void } | null = null;
  let dialog: { el: HTMLElement; done: (v: boolean) => void; pop: () => void } | null = null;
  let dead = false;

  const fx = (say?: string) => {
    audio.unlock();
    audio.click();
    tap('light');
    if (say) smSay(say);
  };
  const shake = (b: HTMLElement) => {
    b.classList.remove('sm-shake');
    void b.offsetWidth;
    b.classList.add('sm-shake');
    tap('medium');
  };

  function makePage(host: HTMLElement, artList: typeof arts, rerender: () => void): SmPage {
    const addArt = (c: HTMLCanvasElement, draw: SmDraw, live: boolean) => artList.push({ cv: c, draw, live, drawn: false });
    const thumbInto = (wrap: HTMLElement, th: string | SmDraw | undefined, ic?: string, live = false) => {
      if (typeof th === 'function') {
        const c = document.createElement('canvas');
        wrap.appendChild(c);
        addArt(c, th, live);
      } else if (typeof th === 'string' && th) {
        const img = document.createElement('img');
        img.src = th;
        img.alt = '';
        img.draggable = false;
        wrap.appendChild(img);
      } else if (ic) wrap.insertAdjacentHTML('beforeend', ic);
    };
    const page: SmPage = {
      menu: api,
      refresh: () => rerender(),
      label(text, iconHtml) {
        host.insertAdjacentHTML('beforeend', `<div class="sm-lbl">${iconHtml ?? ''}<span>${esc(text)}</span></div>`);
      },
      cards(items, o = {}) {
        const size = o.size ?? 'big';
        const box = document.createElement('div');
        box.className = `sm-cards sm-${size}${o.scroll ? ' sm-scroll' : ''}`;
        const n = o.cols ?? (size === 'wide' ? 1 : Math.min(items.length, size === 'small' ? 4 : 3));
        box.style.setProperty('--n', String(n));
        box.classList.add('sm-n' + Math.min(5, n));
        for (const it of items) {
          const b = document.createElement('button');
          b.className = 'sm-card' + (it.sel ? ' sel' : '') + (it.lock ? ' lock' : '') + (it.hot ? ' hot' : '');
          if (it.id) b.dataset.id = it.id;
          b.disabled = !!it.disabled;
          b.setAttribute('aria-label', it.label || it.say || '');
          if (it.sel !== undefined) b.setAttribute('aria-pressed', String(!!it.sel));
          const art = document.createElement('span');
          art.className = 'sm-art';
          if (it.color) art.style.setProperty('--c', it.color);
          thumbInto(art, it.art, it.icon, !!it.live);
          b.appendChild(art);
          b.insertAdjacentHTML(
            'beforeend',
            `<span class="sm-txt"><b>${esc(it.label)}</b>${it.sub ? ` <small>${esc(it.sub)}</small>` : ''}</span>${it.badge ? `<em class="sm-badge">${esc(it.badge)}</em>` : ''}${
              it.lock ? `<em class="sm-lock">${icon('lock', { size: 16 })}${typeof it.lock === 'string' ? it.lock : ''}</em>` : ''
            }`,
          );
          b.addEventListener('click', () => {
            if (it.lock) {
              fx(it.say ?? it.label);
              return shake(b);
            }
            fx(it.say ?? it.label);
            it.onTap?.();
          });
          box.appendChild(b);
        }
        host.appendChild(box);
        if (o.scroll) {
          const s = box.querySelector('.sel') as HTMLElement | null;
          if (s)
            requestAnimationFrame(() => {
              const br = box.getBoundingClientRect();
              const sr = s.getBoundingClientRect();
              box.scrollLeft += sr.left + sr.width / 2 - (br.left + br.width / 2);
            });
        }
        return box;
      },
      slots(slots, o = {}) {
        const box = document.createElement('div');
        box.className = 'sm-slots';
        box.style.setProperty('--n', String(slots.length));
        slots.forEach((s, i) => {
          const b = document.createElement('div');
          b.className = 'sm-slot' + (s.empty ? ' empty' : '') + (o.sel === i ? ' sel' : '');
          b.setAttribute('role', 'button');
          b.tabIndex = 0;
          // espaço vazio: o nome antigo (apagado ou save novo) não vale mais
          const nid = s.id ?? i;
          if (s.empty) smSetSlotName(spec.game, i, null, o.key);
          const custom = s.empty ? null : smSlotName(spec.game, nid, o.key);
          const label = s.empty ? (o.newLabel ?? t('sm.new', 'Novo')) : (custom ?? s.name ?? t('sm.slotN', 'Jogo {n}', { n: i + 1 }));
          b.setAttribute('aria-label', label);
          const th = document.createElement('span');
          th.className = 'sm-thumb';
          if (s.color) th.style.setProperty('--c', s.color);
          if (s.empty) th.insertAdjacentHTML('beforeend', SVG_PLUS);
          else thumbInto(th, s.thumb, s.icon);
          if (!s.empty && s.diff !== undefined) th.insertAdjacentHTML('beforeend', `<i class="sm-sdiff">${faceSvg(s.diff, 26)}</i>`);
          th.insertAdjacentHTML('beforeend', `<i class="sm-snum">${i + 1}</i>`);
          b.appendChild(th);
          b.insertAdjacentHTML(
            'beforeend',
            `<span class="sm-stxt"><b${Array.from(label).length > 11 ? ' class="sm-long"' : ''}>${esc(label)}</b>${
              s.empty ? '' : ` <small>${s.progressIcon ?? ''}${esc(s.progress ?? '')}</small>${s.last ? `<i>${icon('clock', { size: 12 })}${esc(smWhen(s.last))}</i>` : ''}`
            }</span>`,
          );
          if (!s.empty && o.onDelete && o.sel === i) {
            const del = document.createElement('button');
            del.className = 'sm-del';
            del.setAttribute('aria-label', t('sm.delete', 'Apagar'));
            del.innerHTML = SVG_TRASH;
            del.addEventListener('click', (e) => {
              e.stopPropagation();
              fx(t('sm.delete.say', 'Apagar este jogo?'));
              void api.confirm({ text: t('sm.delete.q', 'Apagar {n}?', { n: label }), thumb: typeof s.thumb === 'function' || typeof s.thumb === 'string' ? s.thumb : undefined, icon: s.icon, yes: t('sm.delete', 'Apagar'), danger: true }).then((ok) => {
                if (!ok) return;
                smSetSlotName(spec.game, nid, null, o.key);
                o.onDelete!(i);
              });
            });
            b.appendChild(del);
          }
          if (!s.empty && o.sel === i && o.rename !== false) {
            const ren = document.createElement('button');
            ren.className = 'sm-ren' + (o.onDelete ? '' : ' solo');
            ren.setAttribute('aria-label', t('sm.rename', 'Mudar o nome'));
            ren.innerHTML = SVG_PENCIL;
            ren.addEventListener('click', (e) => {
              e.stopPropagation();
              fx(t('sm.rename.say', 'Que nome você quer?'));
              void renameDlg({ cur: custom ?? '', ph: s.name ?? t('sm.slotN', 'Jogo {n}', { n: i + 1 }), ideas: o.nameIdeas ?? DEFAULT_IDEAS(), thumb: s.thumb, icon: s.icon }).then((v) => {
                if (v === null) return;
                smSetSlotName(spec.game, nid, v, o.key);
                if (v) smSay(v);
                rerender();
              });
            });
            b.appendChild(ren);
          }
          let lastTap = 0;
          const act = () => {
            const now = performance.now();
            const again = o.sel === i || now - lastTap < 400;
            lastTap = now;
            fx(s.empty ? (o.newLabel ?? t('sm.new.say', 'Novo jogo')) : label);
            if (again && o.onOpen) return o.onOpen(i);
            if (o.onSelect) o.onSelect(i);
            else o.onOpen?.(i);
          };
          b.addEventListener('click', act);
          b.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              act();
            }
          });
          box.appendChild(b);
        });
        host.appendChild(box);
        return box;
      },
      faces(items, value, onPick, label) {
        if (label) page.label(label);
        const box = document.createElement('div');
        box.className = 'sm-faces';
        box.setAttribute('role', 'radiogroup');
        box.style.setProperty('--n', String(items.length));
        for (const f of items) {
          const b = document.createElement('button');
          const on = f.id === value;
          b.className = 'sm-face' + (on ? ' sel' : '') + ` l${f.level}`;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(on));
          b.setAttribute('aria-label', f.label);
          b.innerHTML = `${faceSvg(f.level, 54)}<b>${esc(f.label)}</b>`;
          b.addEventListener('click', () => {
            fx(f.say ?? f.label);
            box.querySelectorAll('.sm-face').forEach((q) => {
              q.classList.toggle('sel', q === b);
              q.setAttribute('aria-checked', String(q === b));
            });
            onPick(f.id);
          });
          box.appendChild(b);
        }
        host.appendChild(box);
        return box;
      },
      play(o) {
        const b = document.createElement('button');
        b.className = 'sm-play' + (o.tone === 'green' ? ' green' : '');
        const label = o.label ?? t('sm.play', 'JOGAR');
        b.innerHTML = `<span class="sm-playi">${o.icon ?? SVG_PLAY}</span><span class="sm-playt"><b>${esc(label)}</b>${o.sub ? ` <small>${esc(o.sub)}</small>` : ''}</span>`;
        b.addEventListener('click', () => {
          fx(o.say ?? label);
          o.onTap();
        });
        host.appendChild(b);
        return b;
      },
      friends(o = {}) {
        const b = document.createElement('button');
        b.className = 'sm-friends';
        const label = o.label ?? t('sm.friends', 'Com amigos');
        b.innerHTML = `<span class="sm-fri">${FRIENDS_SVG}</span><b>${esc(label)}</b>`;
        b.addEventListener('click', () => {
          fx(o.say ?? t('sm.friends.say', 'Jogar com amigos'));
          if (o.onTap) o.onTap();
          else void import('../../party/panel').then((p) => p.openSquadPanel('invite'));
        });
        host.appendChild(b);
        if (o.game) {
          const strip = document.createElement('div');
          strip.className = 'sm-playing';
          strip.hidden = true;
          host.appendChild(strip);
          const g = o.game;
          void import('../../party/friends-play').then((f) => strip.isConnected && f.playingStrip(strip, g));
        }
        return b;
      },
      servers(o) {
        const b = document.createElement('button');
        b.className = 'sm-servers';
        const label = o.label ?? t('sm.servers', 'Servidores');
        b.innerHTML = `<span class="sm-srvi">${SVG_GLOBE}</span><span class="sm-txt"><b>${esc(label)}</b>${o.sub ? ` <small>${esc(o.sub)}</small>` : ''}</span><span class="sm-go">${SVG_BACK}</span>`;
        b.addEventListener('click', () => {
          fx(label);
          o.onTap();
        });
        host.appendChild(b);
        return b;
      },
      toggle(o) {
        const b = document.createElement('button');
        b.className = 'sm-tog' + (o.value ? ' on' : '');
        b.setAttribute('role', 'switch');
        b.setAttribute('aria-checked', String(o.value));
        b.innerHTML = `${o.icon ?? ''}<b>${esc(o.label)}</b><i class="sm-sw"><i></i></i>`;
        let v = o.value;
        b.addEventListener('click', () => {
          v = !v;
          fx(o.say ?? o.label);
          b.classList.toggle('on', v);
          b.setAttribute('aria-checked', String(v));
          o.onChange(v);
        });
        host.appendChild(b);
        return b;
      },
      link(label, onTap) {
        const b = document.createElement('button');
        b.className = 'sm-link';
        b.textContent = label;
        b.addEventListener('click', () => {
          fx();
          onTap();
        });
        host.appendChild(b);
        return b;
      },
      hint(text, iconHtml) {
        const d = document.createElement('div');
        d.className = 'sm-hint';
        d.innerHTML = `${iconHtml ?? ''}<span>${esc(text)}</span>`;
        host.appendChild(d);
        return d;
      },
      custom(c) {
        let n: HTMLElement;
        if (typeof c === 'string') {
          n = document.createElement('div');
          n.innerHTML = c;
        } else n = c;
        host.appendChild(n);
        return n;
      },
    };
    return page;
  }

  const render = () => {
    if (dead) return;
    const top = stack[stack.length - 1];
    const keep = panel.scrollTop;
    body.innerHTML = '';
    arts = [];
    if (stack.length > 1) {
      const h = document.createElement('div');
      h.className = 'sm-sub';
      h.innerHTML = `<b>${esc(top.title ?? '')}</b>`;
      body.appendChild(h);
    }
    const page = makePage(body, arts, render);
    try {
      top.build(page);
    } catch (e) {
      console.warn('[startmenu]', spec.game, e);
    }
    el.classList.toggle('sm-deep', stack.length > 1);
    xBtn.innerHTML = stack.length > 1 ? SVG_BACK : SVG_X;
    xBtn.setAttribute('aria-label', stack.length > 1 ? t('sm.back', 'Voltar') : t('sm.exit', 'Sair'));
    xBtn.hidden = stack.length === 1 && !spec.onBack;
    panel.scrollTop = keep;
    drawArts(time, true);
  };

  /* ---------- folha de ajustes ---------- */
  const renderSheet = () => {
    if (!sheet) return;
    const host = sheet.el.querySelector('.sm-sheetbody') as HTMLElement;
    host.innerHTML = '';
    sheet.arts = [];
    try {
      sheet.build(makePage(host, sheet.arts, renderSheet));
    } catch (e) {
      console.warn('[startmenu] sheet', e);
    }
    for (const a of sheet.arts) paintArt(a, time);
  };
  const closeSheet = () => {
    if (!sheet) return;
    const s = sheet;
    sheet = null;
    s.pop();
    s.el.classList.remove('in');
    setTimeout(() => s.el.remove(), 260);
    render();
  };
  const openSheet = (build: (p: SmPage) => void, title?: string) => {
    if (sheet) closeSheet();
    const w = document.createElement('div');
    w.className = 'sm-sheetwrap';
    w.innerHTML = `<div class="sm-sheet" role="dialog" aria-label="${esc(title ?? t('sm.settings', 'Ajustes'))}"><div class="sm-grab"></div>
      <h3>${icon('gear', { size: 26 })}<span>${esc(title ?? t('sm.settings', 'Ajustes'))}</span><button class="sm-ok" aria-label="${esc(t('sm.done', 'Pronto'))}">${SVG_OK}</button></h3>
      <div class="sm-sheetbody"></div></div>`;
    el.appendChild(w);
    sheet = { el: w, build, arts: [], pop: pushBack(() => closeSheet()) };
    renderSheet();
    requestAnimationFrame(() => w.classList.add('in'));
    w.addEventListener('click', (e) => {
      const tg = e.target as HTMLElement;
      if (tg === w || tg.closest('.sm-ok')) {
        fx();
        closeSheet();
      }
    });
  };

  /* ---------- renomear espaço salvo ---------- */
  /** folha "qual o nome?" — resolve o nome novo ('' = voltar ao nome padrão) ou null (cancelou) */
  const renameDlg = (o: { cur: string; ph: string; ideas: SmNameIdea[]; thumb?: string | SmDraw; icon?: string }): Promise<string | null> =>
    new Promise<string | null>((resolve) => {
      dialog?.done(false);
      const d = document.createElement('div');
      d.className = 'sm-dlg sm-rendlg';
      const chips = o.ideas
        .slice(0, 8)
        .map((it) => (typeof it === 'string' ? { text: it, icon: '' } : { text: it.text, icon: it.icon ?? '' }))
        .map((it) => `<button class="sm-idea" data-v="${esc(smCleanName(it.text))}">${it.icon}<span>${esc(smCleanName(it.text))}</span></button>`)
        .join('');
      d.innerHTML = `<div class="sm-dlgcard sm-rencard" role="dialog" aria-label="${esc(t('sm.rename', 'Mudar o nome'))}">
        <div class="sm-renhd"><span class="sm-renart"></span><b>${esc(t('sm.rename.q', 'Qual o nome?'))}</b></div>
        <div class="sm-renin"><input type="text" maxlength="${SM_NAME_MAX}" enterkeyhint="done" autocomplete="off" spellcheck="false" aria-label="${esc(t('sm.rename', 'Mudar o nome'))}"><button class="sm-renclr" aria-label="${esc(t('sm.rename.clear', 'Apagar o texto'))}">${SVG_X}</button></div>
        <div class="sm-ideas">${chips}</div>
        <div class="sm-dlgbtns"><button class="sm-no" aria-label="${esc(t('sm.no', 'Não'))}">${SVG_X}</button><button class="sm-yes" aria-label="${esc(t('sm.done', 'Pronto'))}">${SVG_OK}</button></div></div>`;
      const art = d.querySelector('.sm-renart') as HTMLElement;
      if (typeof o.thumb === 'function') {
        const c = document.createElement('canvas');
        art.appendChild(c);
        requestAnimationFrame(() => paintArt({ cv: c, draw: o.thumb as SmDraw, live: false, drawn: false }, time));
      } else if (o.thumb) art.innerHTML = `<img src="${esc(o.thumb)}" alt="">`;
      else if (o.icon) art.innerHTML = o.icon;
      else art.innerHTML = SVG_PENCIL;
      const inp = d.querySelector('input') as HTMLInputElement;
      inp.value = o.cur;
      inp.placeholder = o.ph;
      const mark = () => d.querySelectorAll<HTMLElement>('.sm-idea').forEach((b) => b.classList.toggle('sel', b.dataset.v === smCleanName(inp.value)));
      mark();
      inp.addEventListener('input', () => {
        if (Array.from(inp.value).length > SM_NAME_MAX) inp.value = Array.from(inp.value).slice(0, SM_NAME_MAX).join('');
        mark();
      });
      el.appendChild(d);
      requestAnimationFrame(() => d.classList.add('in'));
      // em tela de toque o teclado só abre se a criança tocar no campo (as sugestões já bastam); no PC, foco direto
      if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => inp.isConnected && inp.focus(), 60);
      let fin: (v: string | null) => void = () => {};
      const done = (v: boolean) => fin(v ? smCleanName(inp.value) : null);
      fin = (v) => {
        if (!dialog || dialog.el !== d) return;
        dialog.pop();
        dialog = null;
        inp.blur();
        d.remove();
        resolve(v);
      };
      dialog = { el: d, done, pop: pushBack(() => done(false)) };
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          fx();
          done(true);
        } else if (e.key === 'Escape') done(false);
      });
      d.addEventListener('click', (e) => {
        const tg = e.target as HTMLElement;
        const idea = tg.closest('.sm-idea') as HTMLElement | null;
        if (idea) {
          inp.value = idea.dataset.v ?? '';
          fx(inp.value);
          mark();
          return;
        }
        if (tg.closest('.sm-renclr')) {
          fx();
          inp.value = '';
          mark();
          inp.focus();
        } else if (tg.closest('.sm-yes')) {
          fx();
          done(true);
        } else if (tg === d || tg.closest('.sm-no')) {
          fx();
          done(false);
        }
      });
    });

  /* ---------- confirmação ---------- */
  const confirm: StartMenu['confirm'] = (o) =>
    new Promise<boolean>((resolve) => {
      dialog?.done(false);
      const d = document.createElement('div');
      d.className = 'sm-dlg';
      d.innerHTML = `<div class="sm-dlgcard"><span class="sm-dlgart"></span><b>${esc(o.text)}</b><div class="sm-dlgbtns"><button class="sm-no" aria-label="${esc(t('sm.no', 'Não'))}">${SVG_X}</button><button class="sm-yes${o.danger ? ' danger' : ''}" aria-label="${esc(o.yes ?? t('sm.yes', 'Sim'))}">${o.danger ? SVG_TRASH.replace('width="20" height="20"', 'width="34" height="34"') : SVG_OK}</button></div></div>`;
      const art = d.querySelector('.sm-dlgart') as HTMLElement;
      if (typeof o.thumb === 'function') {
        const c = document.createElement('canvas');
        art.appendChild(c);
        requestAnimationFrame(() => paintArt({ cv: c, draw: o.thumb as SmDraw, live: false, drawn: false }, time));
      } else if (o.thumb) art.innerHTML = `<img src="${esc(o.thumb)}" alt="">`;
      else if (o.icon) art.innerHTML = o.icon;
      else art.remove();
      el.appendChild(d);
      smSay(o.text);
      requestAnimationFrame(() => d.classList.add('in'));
      const done = (v: boolean) => {
        if (!dialog || dialog.el !== d) return;
        dialog.pop();
        dialog = null;
        d.remove();
        resolve(v);
      };
      dialog = { el: d, done, pop: pushBack(() => done(false)) };
      d.addEventListener('click', (e) => {
        const tg = e.target as HTMLElement;
        if (tg.closest('.sm-yes')) {
          fx();
          done(true);
        } else if (tg === d || tg.closest('.sm-no')) {
          fx();
          done(false);
        }
      });
    });

  /* ---------- navegação ---------- */
  const pop = () => {
    if (stack.length <= 1) return;
    const top = stack.pop()!;
    top.pop?.();
    render();
  };
  const push = (build: (p: SmPage) => void, title?: string) => {
    const entry: (typeof stack)[number] = { build, title };
    entry.pop = pushBack(() => {
      // voltar do sistema: tira esta página (o pop já saiu da pilha global)
      const i = stack.indexOf(entry);
      if (i > 0) {
        stack.splice(i);
        render();
      }
    });
    stack.push(entry);
    panel.scrollTop = 0;
    render();
  };
  const back = () => {
    if (dialog) return dialog.done(false);
    if (sheet) return closeSheet();
    if (stack.length > 1) return pop();
    spec.onBack?.();
  };
  xBtn.addEventListener('click', () => {
    fx(stack.length > 1 ? t('sm.back', 'Voltar') : t('sm.exit', 'Sair'));
    back();
  });
  gear.addEventListener('click', () => {
    fx(t('sm.settings', 'Ajustes'));
    if (spec.settings) openSheet(spec.settings);
    else spec.onSettings?.();
  });

  /* ---------- desenho ---------- */
  const x = cv.getContext('2d');
  const dprCap = weak ? 1.25 : 2;
  let W = 0;
  let H = 0;
  let dpr = 1;
  const resize = () => {
    dpr = Math.min(dprCap, window.devicePixelRatio || 1);
    W = el.clientWidth;
    H = el.clientHeight;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
  };
  const bubbles = Array.from({ length: weak ? 10 : 22 }, (_, i) => ({ x: (i * 0.618) % 1, y: (i * 0.377) % 1, s: 0.5 + ((i * 7) % 5) / 4, p: i }));
  let time = 0;
  let raf = 0;
  let last = performance.now();
  let artT = 0;

  function paintArt(a: (typeof arts)[number], tm: number): void {
    const r = a.cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * d);
    const h = Math.round(r.height * d);
    if (a.cv.width !== w || a.cv.height !== h) {
      a.cv.width = w;
      a.cv.height = h;
    }
    const c = a.cv.getContext('2d');
    if (!c) return;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, r.width, r.height);
    let ok: void | boolean = true;
    try {
      ok = a.draw(c, r.width, r.height, tm);
    } catch {
      /* miniatura com erro: fica vazia */
    }
    a.drawn = ok !== false;
  }
  function drawArts(tm: number, all = false): void {
    for (const a of arts) if (all || a.live || !a.drawn) paintArt(a, tm);
    if (sheet) for (const a of sheet.arts) if (a.live || !a.drawn) paintArt(a, tm);
  }

  const drawBg = (c: CanvasRenderingContext2D, box: SmBox) => {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg[1]);
    g.addColorStop(0.45, theme.bg[0]);
    g.addColorStop(1, theme.bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    // raios de luz vindos de cima
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const lx = box.x + box.w * ((i + 0.5) / 3);
      const a = 0.07 + 0.03 * Math.sin(time * 1.3 + i * 2);
      const cg = c.createLinearGradient(0, 0, 0, box.y + box.h);
      cg.addColorStop(0, `rgba(255,240,210,${a})`);
      cg.addColorStop(1, 'rgba(255,240,210,0)');
      c.fillStyle = cg;
      c.beginPath();
      c.moveTo(lx - 12, 0);
      c.lineTo(lx + 12, 0);
      c.lineTo(lx + box.w * 0.25, box.y + box.h);
      c.lineTo(lx - box.w * 0.25, box.y + box.h);
      c.fill();
    }
    // bolhas
    for (const b of bubbles) {
      const bx = ((b.x + Math.sin(time * 0.3 + b.p) * 0.02) % 1) * W;
      const by = ((((b.y - time * 0.012 * b.s) % 1) + 1) % 1) * H;
      c.fillStyle = hexA(b.p % 2 ? theme.accent : theme.accent2, 0.1 + 0.06 * Math.sin(time + b.p));
      c.beginPath();
      c.arc(bx, by, 3 + b.s * 5, 0, TAU);
      c.fill();
    }
    c.restore();
    // brilho atrás da janela
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const rg = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(box.w, box.h) * 0.75);
    rg.addColorStop(0, hexA(theme.accent2, 0.35));
    rg.addColorStop(1, hexA(theme.accent2, 0));
    c.fillStyle = rg;
    c.fillRect(0, 0, W, H);
  };

  const drawWindow = (c: CanvasRenderingContext2D, box: SmBox) => {
    if ((!show && !spec.seeThrough) || spec.stageEl || box.w < 40 || box.h < 40) return;
    // janela com proporção agradável (nem fina demais, nem larga demais)
    let w = box.w;
    let h = box.h;
    const maxAR = 2.1;
    if (w / h > maxAR) w = h * maxAR;
    const X = box.x + (box.w - w) / 2;
    const Y = box.y + (box.h - h) / 2;
    const R = Math.min(28, h * 0.14);
    // sombra
    c.fillStyle = 'rgba(20,6,50,.4)';
    rr(c, X + 2, Y + 8, w, h, R);
    c.fill();
    c.save();
    rr(c, X, Y, w, h, R);
    c.clip();
    if (spec.seeThrough || !show) c.clearRect(X, Y, w, h);
    else {
      c.translate(X, Y);
      try {
        show(c, w, h, time);
      } catch (e) {
        console.warn('[startmenu] vitrine', spec.game, e);
      }
    }
    c.restore();
    // brilho de vidro
    c.save();
    rr(c, X, Y, w, h, R);
    c.clip();
    const gl = c.createLinearGradient(X, Y, X + w * 0.4, Y + h);
    gl.addColorStop(0, 'rgba(255,255,255,.18)');
    gl.addColorStop(0.35, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(X, Y, w, h);
    c.restore();
    // moldura: tinta + borda colorida
    c.lineWidth = 7;
    c.strokeStyle = INK;
    rr(c, X, Y, w, h, R);
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = theme.accent2;
    rr(c, X + 4.5, Y + 4.5, w - 9, h - 9, Math.max(4, R - 4));
    c.stroke();
    // seu Bloop acenando no canto
    if (spec.mascot !== false && h > 110) {
      const Rb = Math.max(14, Math.min(30, h * 0.11));
      const bx = X + w - Rb * 1.5;
      const hop = Math.abs(Math.sin(time * 2.4)) * Rb * 0.18;
      const fy = Y + h - Rb * 0.55;
      c.fillStyle = 'rgba(20,6,50,.35)';
      c.beginPath();
      c.ellipse(bx, fy + Rb * 0.55, Rb * 0.85, Rb * 0.2, 0, 0, TAU);
      c.fill();
      smDrawBloop(c, bx, fy - Rb * 0.45 - hop, Rb, time, 1);
    }
  };

  const frame = (now: number) => {
    if (dead) return;
    if (!el.isConnected) {
      teardown();
      return;
    }
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;
    // palco a ~30 qps (20 em aparelho fraco): é enfeite, não precisa de 60
    if (now - last < (weak ? 48 : 31)) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    if (!x) return;
    if (el.clientWidth !== W || el.clientHeight !== H) resize();
    const sb = stageEl.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const box: SmBox = { x: sb.left - er.left, y: sb.top - er.top, w: sb.width, h: sb.height };
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (spec.backdrop) {
      try {
        spec.backdrop(x, W, H, time, box);
      } catch (e) {
        console.warn('[startmenu] palco', spec.game, e);
      }
    } else {
      drawBg(x, box);
      drawWindow(x, box);
    }
    artT += dt;
    if (artT > 1 / 15) {
      artT = 0;
      drawArts(time);
    }
  };

  const teardown = () => {
    if (dead) return;
    dead = true;
    cancelAnimationFrame(raf);
    sheet?.pop();
    dialog?.pop();
    for (const s of stack) s.pop?.();
    smHush();
  };

  const api: StartMenu = {
    el,
    refresh: render,
    push,
    pop,
    back,
    depth: () => stack.length + (sheet ? 1 : 0) + (dialog ? 1 : 0),
    openSheet,
    closeSheet,
    confirm,
    setChips,
    setTitle,
    destroy() {
      teardown();
      el.remove();
    },
  };

  resize();
  render();
  raf = requestAnimationFrame(frame);
  requestAnimationFrame(() => el.classList.add('in'));
  // boas-vindas faladas (só com a narração ligada): nome do jogo + "toque em JOGAR"
  const hello = spec.welcome ?? `${spec.title ?? def?.name ?? ''}! ${t('sm.welcome', 'Toque no botão amarelo para jogar.')}`;
  setTimeout(() => !dead && smSay(hello, false), 400);
  return api;
}
