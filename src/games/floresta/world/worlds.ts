/* ============================================================
 *  MUNDO — vários mundos salvos (nome, semente, modo, tipo) e a
 *  tela de criação: semente, modo (Sobrevivência/Criativo/Pacífico),
 *  tipo (normal, plano, ilhas, ilhas flutuantes), relevo e biomas.
 *  Cada mundo fica numa chave própria do localStorage; só pedaços
 *  modificados (diffs) entram no save.
 * ============================================================ */
import { coverFor } from './covers';
import { t } from '../../../i18n';
import { WBIOMES } from './biomes';
import type { GenOpts } from './gen';
import type { GameMode } from './engine';
import { freshWorld, parseWorld, type WorldSave } from './wsave';
import { openStartMenu, SM_ICONS, type SmCard, type SmPage, type StartMenu } from '../../../ui/startmenu';
import { icon } from '../../../ui/icons';

export interface WorldMeta {
  id: string;
  name: string;
  seed: number;
  mode: GameMode;
  type: GenOpts['type'];
  created: number;
  at: number;
  kb: number;
}
const IDX = 'bw-mundo-idx';
const KEY = (id: string) => 'bw-mundo-w:' + id;

export function listWorlds(): WorldMeta[] {
  try {
    const a = JSON.parse(localStorage.getItem(IDX) || '[]');
    return Array.isArray(a) ? a.filter((m) => m && typeof m.id === 'string') : [];
  } catch {
    return [];
  }
}
function writeIdx(a: WorldMeta[]): void {
  try {
    localStorage.setItem(IDX, JSON.stringify(a));
  } catch {
    /* cheio */
  }
}
export function loadWorldById(id: string): WorldSave | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    return raw ? parseWorld(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
/** grava o mundo (e atualiza tamanho/último jogo no índice) */
export function saveWorldById(id: string, w: WorldSave): void {
  const keys = Object.keys(w.chunks);
  if (keys.length > 900) for (const k of keys.slice(0, keys.length - 900)) if (!w.chunks[k].e && !w.chunks[k].v) delete w.chunks[k];
  if (w.cells.length > 6000) w.cells.splice(0, w.cells.length - 6000);
  const s = JSON.stringify(w);
  try {
    localStorage.setItem(KEY(id), s);
  } catch {
    /* sem espaço */
  }
  const a = listWorlds();
  const m = a.find((x) => x.id === id);
  if (m) {
    m.at = Date.now();
    m.kb = Math.round(s.length / 1024);
    writeIdx(a);
  }
}
export function deleteWorld(id: string): void {
  try {
    localStorage.removeItem(KEY(id));
  } catch {
    /* */
  }
  writeIdx(listWorlds().filter((m) => m.id !== id));
}
export function createWorld(name: string, seed: number, mode: GameMode, gen: GenOpts): { meta: WorldMeta; save: WorldSave } {
  const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const save = freshWorld(seed);
  save.gen = gen;
  save.pets = mode === 'criativo' ? 0 : 3;
  save.solo = true;
  save.veh.owned = [];
  const meta: WorldMeta = { id, name, seed, mode, type: gen.type, created: Date.now(), at: Date.now(), kb: 0 };
  writeIdx([meta, ...listWorlds()]);
  saveWorldById(id, save);
  return { meta, save };
}
/** semente a partir de texto (números viram eles mesmos) */
export function seedOf(s: string): number {
  const v = s.trim();
  if (/^-?\d{1,9}$/.test(v)) return +v;
  let h = 2166136261;
  for (let i = 0; i < v.length; i++) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  return (h >>> 0) % 1e9;
}

const MODES: [GameMode, () => string, () => string][] = [
  ['sobrevivencia', () => t('mundo.mode.sobrevivencia', 'Sobrevivência'), () => t('mundo.mode.sobD', 'Vida, fome e bichos bravos à noite')],
  ['criativo', () => t('mundo.mode.criativo', 'Criativo'), () => t('mundo.mode.criD', 'Todos os itens, sem perigo')],
  ['pacifico', () => t('mundo.mode.pacifico', 'Pacífico'), () => t('mundo.mode.pacD', 'Sobrevivência sem bichos bravos')],
];
const TYPES: [GenOpts['type'], () => string][] = [
  ['normal', () => t('mundo.type.normal', 'Normal')],
  ['plano', () => t('mundo.type.plano', 'Plano')],
  ['ilhas', () => t('mundo.type.ilhas', 'Ilhas')],
  ['flutuantes', () => t('mundo.type.flutuantes', 'Ilhas Flutuantes')],
];
export const modeName = (m: GameMode) => MODES.find((x) => x[0] === m)?.[1]() ?? m;

const CSS = `
.mw-online{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:2px;min-height:78px;border:4px solid #2a0b5c;border-radius:18px;padding:8px 14px;color:#fff;font:inherit;text-align:left;cursor:pointer;background-size:cover;background-position:center;box-shadow:0 4px 0 #2a0b5c}
.mw-online b{font-size:20px;font-weight:900;text-shadow:0 2px 0 #2a0b5c}
.mw-online small{font-size:12px;font-weight:800;opacity:.92;max-width:62%}
.mw-list{display:flex;flex-direction:column;gap:6px;padding:4px 14px 12px;overflow-y:auto}
.mw-row{display:flex;align-items:center;gap:8px;background:#fff;border:3px solid #2a0b5c;border-radius:14px;padding:6px 8px}
.mw-row b{font-size:15px}
.mw-row small{display:block;font-size:11px;opacity:.75;font-weight:700}
.mw-row .sp{flex:1;min-width:0}
.mw-tag{font-size:10px;font-weight:900;padding:2px 7px;border-radius:8px;background:#ffd34a;color:#2a0b5c;margin-left:4px}
.mw-form{display:flex;flex-direction:column;gap:7px;padding:4px 14px 12px;overflow-y:auto}
.mw-form label{font-weight:800;font-size:12px;display:flex;flex-direction:column;gap:3px}
.mw-form input[type=text]{font:inherit;font-weight:700;border:3px solid #2a0b5c;border-radius:10px;padding:5px 8px;background:#fff;color:#2a0b5c}
.mw-chips{display:flex;flex-wrap:wrap;gap:4px}
.mw-chip{font:inherit;font-size:12px;font-weight:800;border:3px solid #2a0b5c;border-radius:12px;padding:3px 9px;background:#fff;color:#2a0b5c}
.mw-chip.on{background:#8a5cff;color:#fff}
.mw-chip.off{opacity:.45;text-decoration:line-through}
.mw-modes{display:flex;gap:6px}
.mw-mode{flex:1;font:inherit;border:3px solid #2a0b5c;border-radius:14px;background:#fff;color:#2a0b5c;padding:6px;text-align:left}
.mw-mode b{display:block;font-size:13px}
.mw-mode span{font-size:10.5px;font-weight:700;opacity:.8}
.mw-mode.on{background:#ffd34a}
.mw-row2{display:flex;gap:8px;align-items:center}
`;

export type WorldPick = { kind: 'world'; meta: WorldMeta; save: WorldSave; fresh: boolean } | { kind: 'classic' } | { kind: 'servers' } | null;

/** capa do mundo salvo (miniatura do espaço) */
function coverOf(w: WorldMeta): string {
  return coverFor(w.type === 'flutuantes' ? 'ceu' : w.mode === 'criativo' ? 'build' : 'sobrev', (w.seed % 97) + 1);
}
const MODE_ICON: Record<string, string> = {
  sobrevivencia: `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 5l15 6v11c0 10-6 17-15 21C15 39 9 32 9 22V11z" fill="#ff8a5c" stroke="#2a0b5c" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 15l3 7h7l-6 4 2 7-6-4-6 4 2-7-6-4h7z" fill="#fff6b0" stroke="#2a0b5c" stroke-width="2" stroke-linejoin="round"/></svg>`,
  criativo: `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M8 18l16-9 16 9v18l-16 9-16-9z" fill="#8fe06a" stroke="#2a0b5c" stroke-width="3.5" stroke-linejoin="round"/><path d="M8 18l16 9 16-9M24 27v18" fill="none" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><path d="M8 18l16-9 16 9-16 9z" fill="#c9ffb0"/><path d="M8 18l16-9 16 9-16 9z" fill="none" stroke="#2a0b5c" stroke-width="3" stroke-linejoin="round"/><path d="M36 4l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#ffd34a" stroke="#2a0b5c" stroke-width="1.6"/></svg>`,
  pacifico: `<svg viewBox="0 0 48 48" width="48" height="48"><path d="M24 41s-15-9-15-20a8 8 0 0115-4 8 8 0 0115 4c0 11-15 20-15 20z" fill="#ff8ab8" stroke="#2a0b5c" stroke-width="3.5" stroke-linejoin="round"/><ellipse cx="17" cy="18" rx="3.5" ry="2" fill="#fff" opacity=".7" transform="rotate(-30 17 18)"/></svg>`,
};
const TYPE_DRAW: Record<string, string> = { normal: 'sobrev', plano: 'build', ilhas: 'esconde', flutuantes: 'ceu' };

/** mostra os mundos salvos (como espaços de jogo) + "Servidores"; resolve com a escolha (ou null = voltar) */
/** `classic`: mostra o atalho para o mundo antigo dos Lenhadores (o Mundo Bloop não mostra: HUD antigo; o Lenhadores tem a carta própria no hub) */
export function pickWorld(root: HTMLElement, opts: { servers?: boolean; classic?: boolean; gameId?: string } = {}): Promise<WorldPick> {
  if (!document.getElementById('mw-css')) {
    const s = document.createElement('style');
    s.id = 'mw-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  return new Promise((resolve) => {
    let sm: StartMenu | null = null;
    const done = (v: WorldPick) => {
      sm?.destroy();
      sm = null;
      resolve(v);
    };
    let sel = 0;
    let mode: GameMode = 'sobrevivencia';
    let type: GenOpts['type'] = 'normal';
    let hk = 1;
    let name = '';
    let seedTxt = String(Math.floor(Math.random() * 1e9));
    const off = new Set<number>();
    const play = (w: WorldMeta) => {
      const save = loadWorldById(w.id);
      if (save) done({ kind: 'world', meta: w, save, fresh: false });
    };
    const create = () => {
      const seed = seedOf(seedTxt || '1');
      const nm = (name || t('mundo.defName', 'Meu Mundo {n}', { n: listWorlds().length + 1 })).slice(0, 24);
      const { meta, save } = createWorld(nm, seed, mode, { type, h: hk, off: [...off] });
      done({ kind: 'world', meta, save, fresh: true });
    };
    const advanced = (p: SmPage) => {
      const box = p.custom(document.createElement('div'));
      box.className = 'mw-form';
      box.innerHTML = `<div class="mw-row2"><label style="flex:1">${t('mundo.name', 'Nome')}<input type="text" maxlength="24" id="mw-name"></label>
          <label style="flex:1">${t('mundo.seed', 'Semente')}<input type="text" maxlength="24" id="mw-seed"></label></div>
          <label>${t('mundo.relief', 'Altura do relevo')}: <span id="mw-hv">${Math.round(hk * 100)}%</span><input type="range" id="mw-h" min="40" max="180" step="10" value="${Math.round(hk * 100)}"></label>
          <label>${t('mundo.biomes', 'Biomas (toque para ligar/desligar)')}<div class="mw-chips">${WBIOMES.map((b, i) => `<button class="mw-chip ${off.has(i) ? 'off' : 'on'}" data-bio="${i}">${b.name()}</button>`).join('')}</div></label>`;
      const ni = box.querySelector('#mw-name') as HTMLInputElement;
      const si = box.querySelector('#mw-seed') as HTMLInputElement;
      ni.value = name || t('mundo.defName', 'Meu Mundo {n}', { n: listWorlds().length + 1 });
      si.value = seedTxt;
      ni.addEventListener('input', () => (name = ni.value));
      si.addEventListener('input', () => (seedTxt = si.value));
      for (const i of [ni, si]) i.addEventListener('keydown', (e) => e.stopPropagation());
      const h = box.querySelector('#mw-h') as HTMLInputElement;
      h.addEventListener('input', () => {
        hk = +h.value / 100;
        (box.querySelector('#mw-hv') as HTMLElement).textContent = h.value + '%';
      });
      box.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-bio]');
        if (!b) return;
        const i = +b.dataset.bio!;
        if (off.has(i)) off.delete(i);
        else if (off.size < WBIOMES.length - 1) off.add(i);
        b.classList.toggle('off', off.has(i));
        b.classList.toggle('on', !off.has(i));
      });
    };
    const newWorld = (p: SmPage) => {
      p.cards(
        MODES.map(([k, nm, d]) => ({ id: k, icon: MODE_ICON[k], label: nm(), say: `${nm()}: ${d()}`, sel: mode === k, color: k === 'sobrevivencia' ? '#ffb38a' : k === 'criativo' ? '#a8f08a' : '#ffc0dc', onTap: () => ((mode = k), p.refresh()) })),
      );
      p.cards(
        TYPES.map(([k, nm]) => ({ id: k, art: ((src: string) => (x: CanvasRenderingContext2D, w: number, h: number) => drawCover(x, src, w, h))(coverFor(TYPE_DRAW[k] ?? 'sobrev', 3)), label: nm(), sel: type === k, onTap: () => ((type = k), p.refresh()) })),
        { cols: 4 },
      );
      p.play({ sub: t('mundo.newWorld', 'Novo mundo'), say: t('mundo.create', 'Criar e jogar'), onTap: create });
      p.link(t('mundo.more', 'Mais opções'), () => sm?.openSheet(advanced, t('mundo.more', 'Mais opções')));
    };
    const all = (p: SmPage) => {
      const ws = listWorlds();
      p.cards(
        ws.map((w) => ({ id: w.id, art: ((src: string) => (x: CanvasRenderingContext2D, ww: number, hh: number) => drawCover(x, src, ww, hh))(coverOf(w)), label: w.name, sub: modeName(w.mode), onTap: () => play(w) })),
        { size: 'wide' },
      );
      p.play({ label: t('mundo.newWorldS', 'NOVO'), sub: t('mundo.newWorld', 'Novo mundo'), icon: SM_ICONS.plus, onTap: () => sm?.push(newWorld, t('mundo.newWorld', 'Novo mundo')) });
    };
    sm = openStartMenu(root, {
      game: opts.gameId ?? 'mundo',
      onBack: () => done(null),
      build: (p) => {
        const ws = listWorlds()
          .slice()
          .sort((a, b) => b.at - a.at);
        const top = ws.slice(0, 3);
        const slots = [0, 1, 2].map((i) => top[i]);
        if (sel > 2) sel = 0;
        p.slots(
          slots.map((w) => (w ? { empty: false, id: w.id, name: w.name, progress: modeName(w.mode), last: w.at, thumb: coverOf(w) } : { empty: true })),
          {
            sel,
            newLabel: t('mundo.newWorld', 'Novo mundo'),
            nameIdeas: [
              { text: t('mundo.idea.1', 'Reino dos Blocos'), icon: icon('crown', { size: 20 }) },
              { text: t('mundo.idea.2', 'Ilha Secreta'), icon: icon('planet', { size: 20 }) },
              { text: t('mundo.idea.3', 'Castelo Gigante'), icon: icon('shield', { size: 20 }) },
              { text: t('mundo.idea.4', 'Vale Mágico'), icon: icon('sparkle', { size: 20 }) },
              { text: t('mundo.idea.5', 'Mundo Bloop'), icon: icon('heart', { size: 20 }) },
              { text: t('mundo.idea.6', 'Cidade dos Amigos'), icon: icon('home', { size: 20 }) },
              { text: t('mundo.idea.7', 'Floresta Encantada'), icon: icon('star', { size: 20 }) },
              { text: t('mundo.idea.8', 'Mina de Diamante'), icon: icon('gem', { size: 20 }) },
            ],
            onSelect: (i) => {
              sel = i;
              sm?.refresh();
            },
            onOpen: (i) => (slots[i] ? play(slots[i]!) : sm?.push(newWorld, t('mundo.newWorld', 'Novo mundo'))),
            onDelete: (i) => {
              const w = slots[i];
              if (w) deleteWorld(w.id);
              sm?.refresh();
            },
          },
        );
        const w = slots[sel];
        if (w) p.play({ tone: 'green', sub: w.name, onTap: () => play(w) });
        else p.play({ sub: t('mundo.newWorld', 'Novo mundo'), onTap: () => sm?.push(newWorld, t('mundo.newWorld', 'Novo mundo')) });
        if (opts.servers) p.servers({ sub: t('mundo.serversS', 'Online, PvP e minigames'), onTap: () => done({ kind: 'servers' }) });
        const more: SmCard[] = [];
        if (ws.length > 3) more.push({ icon: SM_ICONS.globe, label: t('mundo.allWorlds', 'Todos ({n})', { n: ws.length }), say: t('mundo.worlds', 'Meus Mundos'), onTap: () => sm?.push(all, t('mundo.worlds', 'Meus Mundos')) });
        if (opts.classic) more.push({ icon: SM_ICONS.play, label: t('mundo.classicS', 'Clássico'), say: t('mundo.classic', 'Mundo dos Lenhadores (clássico)'), onTap: () => done({ kind: 'classic' }) });
        if (more.length) p.cards(more, { size: 'small', cols: more.length });
      },
    });
  });
}

const coverImgs = new Map<string, HTMLImageElement>();
function drawCover(x: CanvasRenderingContext2D, src: string, w: number, h: number): boolean {
  let img = coverImgs.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    coverImgs.set(src, img);
  }
  if (!img.complete || !img.naturalWidth) return false;
  const k = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  x.drawImage(img, (w - img.naturalWidth * k) / 2, (h - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  return true;
}
