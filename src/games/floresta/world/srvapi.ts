/* ============================================================
 *  SERVIDORES DO MUNDO — API do navegador (server/servers.ts) e o
 *  formulário "Criar servidor" do Bloop Studio. Leve (sem three.js):
 *  usado pelo navegador (browser.ts) e pelo Studio (Minhas publicações).
 * ============================================================ */
import { t } from '../../../i18n';
import { api, apiBase, me } from '../../../social/net';

export interface Peer {
  id: string;
  name: string;
  skin: string;
}
export interface Card {
  key: string;
  kind: 'official' | 'user' | 'studio';
  slot?: string;
  code?: string;
  name: string;
  mode: string;
  mini: string;
  pvp: boolean;
  n: number;
  max: number;
  friends: Peer[];
  th: string;
  owner?: string;
  mine?: boolean;
  status?: string;
  ugc?: string;
  friendsOnly?: boolean;
  goal?: string;
  at: number;
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** caminho relativo a /api (ex.: /servers/thumb?…) → URL completa */
export const apiUrl = (p: string) => (p ? apiBase() + '/api' + p : '');

export async function listServers(pid: string): Promise<Card[]> {
  const r = await api<{ cards: Card[] }>(`/servers/list?id=${encodeURIComponent(pid)}`);
  return Array.isArray(r.cards) ? r.cards : [];
}
export async function matchServer(pid: string, slot: string, avoid: string[] = []): Promise<string> {
  return (await api<{ code: string }>('/servers/match', { id: pid, slot, avoid })).code;
}
export interface PublishOpts {
  item: string;
  name: string;
  max: number;
  pvp: boolean;
  friendsOnly: boolean;
  goal: string;
}
export async function publishServer(o: PublishOpts): Promise<{ ok: boolean; code?: string; status?: string; error?: string }> {
  const who = await me();
  return api('/servers/publish', { id: who.id, ...o });
}
export async function unpublishServer(code: string): Promise<boolean> {
  const who = await me();
  return (await api<{ ok: boolean }>('/servers/unpublish', { id: who.id, code })).ok;
}

/** objetivos do servidor do Studio (o mapa continua com as regras dele) */
export const GOALS: [string, () => string][] = [
  ['', () => t('srv.goal.free', 'Livre')],
  ['coop', () => t('srv.goal.coop', 'Juntos')],
  ['race', () => t('srv.goal.race', 'Corrida')],
  ['collect', () => t('srv.goal.collect', 'Coleta')],
  ['survive', () => t('srv.goal.survive', 'Sobreviver')],
  ['pvp', () => t('srv.goal.pvp', 'Empurra-empurra')],
];

/** Abre o Bloop Studio já jogando o servidor publicado (`code`) com outras pessoas. */
export async function openStudioServer(s: { code: string; ugc: string; name: string; pvp?: boolean }): Promise<void> {
  const [reg, hub, st] = await Promise.all([import('../../../hub/registry'), import('../../../hub/hub'), import('../../../studio/register')]);
  const def = reg.listGames().find((g) => g.id === 'studio');
  if (!def) return;
  st.setPendingServer(s);
  hub.closeHost();
  await new Promise((r) => setTimeout(r, 60));
  await hub.launchGame(def);
}

/* ------------------------------ estilo (compartilhado) ------------------------------ */
const CSS = `
.sv-root{position:absolute;inset:0;z-index:30;display:flex;flex-direction:column;background:linear-gradient(160deg,#3b1c8c,#1d0e4a 60%,#140934);color:#fff;font-family:var(--font,'Fredoka',system-ui,sans-serif);pointer-events:auto;touch-action:pan-y;padding:calc(env(safe-area-inset-top,0px) + 6px) calc(env(safe-area-inset-right,0px) + 10px) 0 calc(env(safe-area-inset-left,0px) + 10px)}
.sv-top{display:flex;align-items:center;gap:8px;min-height:44px}
.sv-top h2{margin:0;font-size:20px;font-weight:900;white-space:nowrap;display:flex;align-items:center;gap:6px;text-shadow:0 2px 0 #2a0b5c}
.sv-ib{flex:none;width:42px;height:42px;border-radius:14px;border:none;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;cursor:pointer}
.sv-search{flex:1;min-width:80px;max-width:260px;height:38px;border-radius:19px;border:2px solid rgba(255,255,255,.2);background:rgba(0,0,0,.25);color:#fff;font:inherit;font-weight:700;font-size:14px;padding:0 12px 0 32px;outline:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='18' height='18'%3E%3Ccircle cx='10' cy='10' r='6' fill='none' stroke='%23fff' stroke-width='3' opacity='.7'/%3E%3Cpath d='M15 15l5 5' stroke='%23fff' stroke-width='3' stroke-linecap='round' opacity='.7'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:9px center}
.sv-search::placeholder{color:rgba(255,255,255,.55)}
.sv-sp{flex:1}
.sv-new{flex:none;height:40px;border:none;border-radius:14px;padding:0 14px;font:inherit;font-weight:900;font-size:14px;color:#3a1d00;background:linear-gradient(#ffe680,#ffb02e);box-shadow:0 4px 0 #a35a00;display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap}
.sv-tabs{display:flex;gap:6px;overflow-x:auto;padding:6px 0 4px;scrollbar-width:none;flex:none}
.sv-tabs::-webkit-scrollbar{display:none}
.sv-tab{flex:none;height:32px;border-radius:16px;border:2px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:inherit;font-weight:800;font-size:13px;padding:0 12px;display:flex;align-items:center;gap:5px;cursor:pointer;white-space:nowrap}
.sv-tab.on{background:#fff;color:#2a0b5c;border-color:#fff}
.sv-tab i{font-style:normal;background:#ff4f6a;color:#fff;border-radius:9px;padding:0 6px;font-size:11px}
.sv-body{flex:1;overflow-y:auto;overflow-x:hidden;padding:4px 0 calc(env(safe-area-inset-bottom,0px) + 10px);-webkit-overflow-scrolling:touch}
.sv-strip{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px}
.sv-strip:empty{display:none}
.sv-inv{display:flex;align-items:center;gap:8px;background:linear-gradient(#3ee07a,#17994a);border:none;border-radius:14px;padding:4px 10px 4px 4px;color:#fff;font:inherit;font-weight:800;font-size:13px;cursor:pointer;box-shadow:0 3px 0 #0c5a2a}
.sv-inv b{font-weight:900}
.sv-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:10px}
.sv-card{position:relative;border:none;padding:0;border-radius:16px;overflow:hidden;background:#2a1658;color:#fff;font:inherit;text-align:left;cursor:pointer;box-shadow:0 4px 0 rgba(0,0,0,.35);display:flex;flex-direction:column;transition:transform .12s}
.sv-card:active{transform:scale(.97)}
.sv-img{position:relative;width:100%;aspect-ratio:16/9;background:#1a0d3a center/cover no-repeat}
.sv-badge{position:absolute;left:6px;top:6px;border-radius:9px;padding:1px 7px;font-size:11px;font-weight:900;color:#fff;background:#8a5cff;box-shadow:0 2px 0 rgba(0,0,0,.3)}
.sv-badge.pvp{background:#ff4f6a}.sv-badge.mini{background:#ff9a2e}.sv-badge.surv{background:#17994a}.sv-badge.studio{background:#ff5cc8}.sv-badge.cria{background:#2a9be0}
.sv-cnt{position:absolute;right:6px;bottom:6px;border-radius:10px;padding:1px 7px 1px 5px;font-size:12px;font-weight:900;background:rgba(20,8,48,.8);display:flex;align-items:center;gap:4px}
.sv-dot{width:9px;height:9px;border-radius:50%;background:#9a92bf;flex:none}
.sv-dot.on{background:#3ee07a;box-shadow:0 0 6px #3ee07a}
.sv-fr{position:absolute;left:6px;bottom:6px;display:flex}
.sv-fr img{width:24px;height:24px;border-radius:50%;border:2px solid #3ee07a;background:#fff;margin-right:-6px}
.sv-meta{padding:5px 8px 7px;display:flex;flex-direction:column;gap:1px;min-height:44px}
.sv-meta b{font-size:14px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-meta small{font-size:11px;font-weight:700;opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sv-st{position:absolute;right:6px;top:6px;border-radius:9px;padding:1px 7px;font-size:11px;font-weight:900;background:#ffd34a;color:#3a1d00}
.sv-st.bad{background:#ff4f6a;color:#fff}
.sv-busy::after{content:attr(data-busy);position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(20,8,48,.72);font-weight:900;font-size:15px}
.sv-x{position:absolute;right:4px;top:30px;width:26px;height:26px;border-radius:50%;border:none;background:rgba(20,8,48,.75);color:#fff;font-weight:900;cursor:pointer}
.sv-empty{padding:26px 10px;text-align:center;font-weight:800;opacity:.8}
.sv-foot{display:flex;justify-content:center;gap:16px;padding:10px 0 2px}
.sv-link{border:none;background:none;color:rgba(255,255,255,.7);font:inherit;font-weight:800;font-size:12px;text-decoration:underline;cursor:pointer;padding:4px}
.sv-wait{display:flex;align-items:center;gap:8px;background:rgba(255,211,74,.16);border:2px solid #ffd34a;border-radius:14px;padding:6px 10px;margin-bottom:8px;font-weight:800;font-size:13px}
.sv-pop{position:absolute;inset:0;z-index:40;background:rgba(10,4,30,.66);display:flex;align-items:center;justify-content:center;padding:10px;pointer-events:auto;font-family:var(--font,'Fredoka',system-ui,sans-serif)}
.sv-sheet{background:linear-gradient(#fff9ec,#ffeccc);color:#2a0b5c;border:4px solid #2a0b5c;border-radius:22px;width:min(560px,100%);max-height:100%;overflow-y:auto;padding:10px 14px 14px;box-shadow:0 8px 0 rgba(42,11,92,.45)}
.sv-sheet h3{margin:0 0 8px;font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px}
.sv-sheet h3 .sv-ib{margin-left:auto;background:#ff4f6a;width:36px;height:36px}
.sv-sheet label{display:block;font-weight:800;font-size:13px;margin:6px 0 3px}
.sv-in{width:100%;box-sizing:border-box;height:40px;border-radius:12px;border:3px solid #2a0b5c;padding:0 10px;font:inherit;font-weight:800;font-size:15px;color:#2a0b5c;background:#fff}
.sv-chips{display:flex;gap:6px;flex-wrap:wrap}
.sv-chip{border:3px solid #2a0b5c;background:#fff;color:#2a0b5c;border-radius:12px;min-height:36px;padding:0 10px;font:inherit;font-weight:800;font-size:13px;cursor:pointer}
.sv-chip.on{background:#8a5cff;color:#fff}
.sv-go{width:100%;margin-top:10px;height:46px;border:none;border-radius:14px;font:inherit;font-weight:900;font-size:16px;color:#fff;background:linear-gradient(#3ee07a,#17994a);box-shadow:0 4px 0 #0c5a2a;cursor:pointer}
.sv-go.alt{background:linear-gradient(#8a5cff,#5326cc);box-shadow:0 4px 0 #2a0b5c}
.sv-go:disabled{opacity:.5}
.sv-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.sv-pick{display:flex;flex-direction:column;align-items:center;gap:4px;border:3px solid #2a0b5c;border-radius:16px;background:#fff;color:#2a0b5c;font:inherit;font-weight:900;font-size:14px;padding:8px;cursor:pointer;text-align:center}
.sv-pick img{width:100%;aspect-ratio:16/9;border-radius:10px;object-fit:cover}
.sv-pick small{font-weight:700;font-size:11px;opacity:.75}
.sv-row{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:2px dashed rgba(42,11,92,.15)}
.sv-row img{width:64px;aspect-ratio:16/9;border-radius:8px;object-fit:cover;background:#ddd}
.sv-row .sv-t{flex:1;min-width:0;font-weight:900;font-size:14px}
.sv-row .sv-t small{display:block;font-weight:700;font-size:11px;opacity:.7}
.sv-mini{border:none;border-radius:12px;min-height:34px;padding:0 10px;font:inherit;font-weight:900;font-size:13px;color:#fff;background:linear-gradient(#8a5cff,#5326cc);cursor:pointer}
.sv-note{font-size:12px;font-weight:700;opacity:.8;margin-top:6px}
.sv-err{color:#c21d3c;font-weight:900;font-size:13px;margin-top:6px}
`;
export function ensureSvCss(): void {
  if (document.getElementById('sv-css')) return;
  const s = document.createElement('style');
  s.id = 'sv-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * Formulário "Criar servidor" a partir de uma criação publicada na Loja (mapa do Bloop Studio).
 * Resolve com o código do servidor (ou null se fechou).
 */
export function studioServerForm(host: HTMLElement, item: { id: string; title: string; thumb?: string }): Promise<{ code: string; status: string } | null> {
  ensureSvCss();
  const pop = document.createElement('div');
  pop.className = 'sv-pop';
  host.appendChild(pop);
  let max = 8;
  let pvp = false;
  let fo = false;
  let goal = '';
  let err = '';
  let busy = false;
  return new Promise((resolve) => {
    const done = (v: { code: string; status: string } | null) => {
      pop.remove();
      resolve(v);
    };
    const render = () => {
      pop.innerHTML = `<div class="sv-sheet"><h3>${t('srv.fromStudio', 'Servidor do meu mapa')}<button class="sv-ib" data-x>✕</button></h3>
        <div class="sv-row">${item.thumb ? `<img src="${esc(item.thumb)}" alt="">` : ''}<div class="sv-t">${esc(item.title)}<small>${t('srv.fromStudioD', 'Seu mapa da Loja vira um servidor online. Ele aparece na lista quando a moderação aprovar.')}</small></div></div>
        <label>${t('srv.name', 'Nome do servidor')}</label><input class="sv-in" id="sv-name" maxlength="32" value="${esc(item.title)}">
        <label>${t('srv.max', 'Jogadores')}</label><div class="sv-chips">${[4, 8, 12].map((n) => `<button class="sv-chip ${max === n ? 'on' : ''}" data-max="${n}">${n}</button>`).join('')}</div>
        <label>${t('srv.goal', 'Regra')}</label><div class="sv-chips">${GOALS.map(([k, n]) => `<button class="sv-chip ${goal === k ? 'on' : ''}" data-goal="${k}">${n()}</button>`).join('')}</div>
        <div class="sv-chips" style="margin-top:8px"><button class="sv-chip ${pvp ? 'on' : ''}" data-pvp>⚔ ${t('srv.pvp', 'Empurrar (PvP)')}: ${pvp ? t('mundo.on', 'ligado') : t('mundo.off', 'desligado')}</button><button class="sv-chip ${fo ? 'on' : ''}" data-fo>👥 ${t('srv.friendsOnly', 'Só amigos')}</button></div>
        ${err ? `<div class="sv-err">${esc(err)}</div>` : ''}
        <button class="sv-go" data-go ${busy ? 'disabled' : ''}>${busy ? t('srv.publishing', 'Criando…') : t('srv.publish', 'Criar servidor')}</button></div>`;
    };
    pop.addEventListener('pointerdown', (e) => e.stopPropagation());
    pop.addEventListener('click', async (e) => {
      if (e.target === pop) return done(null);
      const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!b || busy) return;
      const d = b.dataset;
      const name = (pop.querySelector('#sv-name') as HTMLInputElement | null)?.value ?? item.title;
      if (d.x !== undefined) return done(null);
      if (d.max) max = +d.max;
      if (d.goal !== undefined) {
        goal = d.goal;
        if (goal === 'pvp') pvp = true;
      }
      if (d.pvp !== undefined) pvp = !pvp;
      if (d.fo !== undefined) fo = !fo;
      if (d.go !== undefined) {
        busy = true;
        err = '';
        render();
        try {
          const r = await publishServer({ item: item.id, name: name.trim(), max, pvp, friendsOnly: fo, goal });
          busy = false;
          if (r.ok && r.code) return done({ code: r.code, status: r.status ?? 'pending' });
          err = r.error === 'too_many' ? t('srv.tooMany', 'Você já tem 6 servidores. Tire um para criar outro.') : r.error === 'rejected' ? t('srv.rejected', 'Esse mapa não foi aprovado na Loja.') : t('srv.fail', 'Não deu para criar agora.');
        } catch (x) {
          busy = false;
          err = (x as Error).message || t('srv.fail', 'Não deu para criar agora.');
        }
        render();
        (pop.querySelector('#sv-name') as HTMLInputElement).value = name;
        return;
      }
      render();
      (pop.querySelector('#sv-name') as HTMLInputElement).value = name;
    });
    render();
  });
}
