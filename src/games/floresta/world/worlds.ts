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

/** mostra a lista de mundos; resolve com a escolha (ou null = voltar) */
export function pickWorld(root: HTMLElement, opts: { servers?: boolean } = {}): Promise<WorldPick> {
  if (!document.getElementById('mw-css')) {
    const s = document.createElement('style');
    s.id = 'mw-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'fl-modal';
    root.appendChild(m);
    const done = (v: WorldPick) => {
      m.remove();
      resolve(v);
    };
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    const list = () => {
      const ws = listWorlds();
      const rows = ws
        .map(
          (w) => `<div class="mw-row"><div class="sp"><b>${esc(w.name)}</b><span class="mw-tag">${modeName(w.mode)}</span><small>${TYPES.find((x) => x[0] === w.type)?.[1]() ?? ''} · ${t('mundo.seed', 'Semente')} ${w.seed} · ${new Date(w.at).toLocaleDateString()} · ${w.kb} KB</small></div>
          <button class="fl-btn red round" data-del="${w.id}" aria-label="${t('mundo.del', 'Apagar')}" style="width:36px;height:36px">✕</button><button class="fl-btn green" data-play="${w.id}">${t('mundo.play', 'Jogar')}</button></div>`,
        )
        .join('');
      m.innerHTML = `<div class="fl-card"><h2><span>${t('mundo.worlds', 'Meus Mundos')}</span><button class="fl-btn round red" data-x="1">✕</button></h2>
        <div class="mw-list">
          ${opts.servers ? `<button class="mw-online" data-srv="1" style="background-image:linear-gradient(90deg,rgba(42,11,92,.92) 30%,rgba(42,11,92,.15)),url('${coverFor('pvp')}')"><b>🌐 ${t('mundo.playOnline', 'Jogar online')}</b><small>${t('mundo.playOnlineD', 'Servidores com amigos, PvP e minigames — toque e entre!')}</small></button>` : ''}
          <div class="mw-row2"><button class="fl-btn gold" data-new="1" style="flex:1">+ ${t('mundo.newWorld', 'Novo mundo')}</button></div>
          ${rows || `<div style="font-weight:700;opacity:.7;padding:6px">${t('mundo.noWorlds', 'Nenhum mundo ainda — crie o primeiro!')}</div>`}
          <button class="fl-btn wood" data-classic="1">${t('mundo.classic', 'Mundo dos Lenhadores (clássico)')}</button>
        </div></div>`;
    };
    let mode: GameMode = 'sobrevivencia';
    let type: GenOpts['type'] = 'normal';
    let hk = 1;
    const off = new Set<number>();
    const form = () => {
      const n = listWorlds().length + 1;
      m.innerHTML = `<div class="fl-card"><h2><span>${t('mundo.newWorld', 'Novo mundo')}</span><button class="fl-btn round red" data-back="1">✕</button></h2>
        <div class="mw-form">
          <div class="mw-row2"><label style="flex:1">${t('mundo.name', 'Nome')}<input type="text" maxlength="24" id="mw-name" value="${esc(t('mundo.defName', 'Meu Mundo {n}', { n }))}"></label>
          <label style="flex:1">${t('mundo.seed', 'Semente')}<input type="text" maxlength="24" id="mw-seed" value="${Math.floor(Math.random() * 1e9)}"></label></div>
          <div class="mw-modes">${MODES.map(([k, nm, d]) => `<button class="mw-mode ${mode === k ? 'on' : ''}" data-mode="${k}"><b>${nm()}</b><span>${d()}</span></button>`).join('')}</div>
          <label>${t('mundo.type', 'Tipo de mundo')}<div class="mw-chips">${TYPES.map(([k, nm]) => `<button class="mw-chip ${type === k ? 'on' : ''}" data-type="${k}">${nm()}</button>`).join('')}</div></label>
          <label>${t('mundo.relief', 'Altura do relevo')}: <span id="mw-hv">${Math.round(hk * 100)}%</span><input type="range" id="mw-h" min="40" max="180" step="10" value="${Math.round(hk * 100)}"></label>
          <label>${t('mundo.biomes', 'Biomas (toque para ligar/desligar)')}<div class="mw-chips">${WBIOMES.map((b, i) => `<button class="mw-chip ${off.has(i) ? 'off' : 'on'}" data-bio="${i}">${b.name()}</button>`).join('')}</div></label>
          <button class="fl-btn green" data-create="1">${t('mundo.create', 'Criar e jogar')}</button>
        </div></div>`;
      const h = m.querySelector('#mw-h') as HTMLInputElement;
      h.addEventListener('input', () => {
        hk = +h.value / 100;
        (m.querySelector('#mw-hv') as HTMLElement).textContent = h.value + '%';
      });
    };
    m.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!el) return;
      const d = el.dataset;
      if (d.x) return done(null);
      if (d.classic) return done({ kind: 'classic' });
      if (d.srv) return done({ kind: 'servers' });
      if (d.new) return form();
      if (d.back) return list();
      if (d.del) {
        if (el.dataset.sure) {
          deleteWorld(d.del);
          return list();
        }
        el.dataset.sure = '1';
        el.textContent = '?';
        el.style.width = 'auto';
        return;
      }
      if (d.play) {
        const meta = listWorlds().find((w) => w.id === d.play);
        const save = meta ? loadWorldById(meta.id) : null;
        if (meta && save) return done({ kind: 'world', meta, save, fresh: false });
        return;
      }
      const name = (m.querySelector('#mw-name') as HTMLInputElement | null)?.value;
      if (d.mode) mode = d.mode as GameMode;
      if (d.type) type = d.type as GenOpts['type'];
      if (d.bio) {
        const i = +d.bio;
        if (off.has(i)) off.delete(i);
        else if (off.size < WBIOMES.length - 1) off.add(i);
      }
      if (d.mode || d.type || d.bio) {
        const nm = name;
        const sd = (m.querySelector('#mw-seed') as HTMLInputElement).value;
        form();
        (m.querySelector('#mw-name') as HTMLInputElement).value = nm ?? '';
        (m.querySelector('#mw-seed') as HTMLInputElement).value = sd;
        return;
      }
      if (d.create) {
        const seed = seedOf((m.querySelector('#mw-seed') as HTMLInputElement).value || '1');
        const { meta, save } = createWorld((name || 'Mundo').slice(0, 24), seed, mode, { type, h: hk, off: [...off] });
        return done({ kind: 'world', meta, save, fresh: true });
      }
    });
    list();
  });
}
