/* ============================================================
 *  MUNDO — NAVEGADOR DE SERVIDORES (estilo Minecraft/Roblox).
 *  Cartões com foto (do anfitrião, ≤30 KB; ou capa desenhada), selo do
 *  modo, jogadores/máx., bolinha online e os amigos que estão dentro.
 *  UM TOQUE = ENTRA. Abas: Em alta · Amigos · Minigames · PvP ·
 *  Criados por jogadores · Meus mundos. Busca. "Criar servidor":
 *  mundo online (modo/tipo/PvP) ou um mapa do Bloop Studio publicado.
 *  Código / QR só como link pequeno no rodapé.
 *  Grupo (docs/PARTY.md): o líder escolhe → os outros seguem sozinhos.
 * ============================================================ */
import { t } from '../../../i18n';
import { api, me } from '../../../social/net';
import { bus } from '../../../core/events';
import { tap } from '../../../core/haptics';
import { pushBack } from '../../../core/back';
import { notify } from '../../../ui/notify';
import type { GameMode } from './engine';
import type { GenOpts } from './gen';
import type { WorldGame, WorldOpts } from './worldgame';
import { joinWorld, lastWorlds, MCODE_OK, newCode, type Mini, type Who } from './net';
import { modeName } from './worlds';
import { coverFor } from './covers';
import { apiUrl, ensureSvCss, esc, listServers, matchServer, openStudioServer, studioServerForm, unpublishServer, type Card } from './srvapi';

type Tab = 'hot' | 'friends' | 'minis' | 'pvp' | 'players' | 'mine';
const TABS: [Tab, string, () => string][] = [
  ['hot', '🔥', () => t('srv.tab.hot', 'Em alta')],
  ['friends', '👥', () => t('srv.tab.friends', 'Amigos')],
  ['minis', '🎯', () => t('srv.tab.minis', 'Minigames')],
  ['pvp', '⚔', () => t('srv.tab.pvp', 'PvP')],
  ['players', '🛠', () => t('srv.tab.players', 'Criados por jogadores')],
  ['mine', '🏠', () => t('srv.tab.mine', 'Meus mundos')],
];
const MINI_SLOTS = new Set(['obby', 'spleef', 'esconde', 'build']);
const TAB_KEY = 'bw-srv-tab';
const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** selo do modo do cartão */
function badge(c: Card): [string, string] {
  if (c.kind === 'studio') return ['studio', 'Bloop Studio'];
  if (c.slot === 'pvp' || c.mini === 'pvp') return ['pvp', t('srv.b.pvp', 'PvP')];
  if (c.slot && MINI_SLOTS.has(c.slot)) return ['mini', t('srv.b.mini', 'Minigame')];
  if (c.slot === 'ceu' || c.mini === 'ceu') return ['pvp', t('srv.b.ceu', 'PvP no céu')];
  if (c.mini) return ['mini', t('srv.b.mini', 'Minigame')];
  if (c.mode === 'criativo') return ['cria', modeName('criativo')];
  return ['surv', c.pvp ? t('srv.b.survPvp', 'Sobrevivência + PvP') : modeName((c.mode as GameMode) || 'sobrevivencia')];
}
/** nome traduzido dos oficiais */
function cardName(c: Card): string {
  if (c.kind !== 'official') return c.name;
  const N: Record<string, () => string> = {
    sobrev: () => t('srv.o.sobrev', 'Sobrevivência co-op'),
    pvp: () => t('mundo.mini.pvp', 'PvP Arena'),
    ceu: () => t('mundo.mini.ceu', 'Ilhas no Céu'),
    obby: () => t('mundo.mini.obby', 'Corrida de Obstáculos'),
    spleef: () => t('mundo.mini.spleef', 'Spleef de Blocos'),
    esconde: () => t('mundo.mini.esconde', 'Esconde-Esconde'),
    build: () => t('mundo.mini.build', 'Construção'),
  };
  return N[c.slot ?? '']?.() ?? c.name;
}
function cardSub(c: Card): string {
  if (c.kind === 'official') {
    const D: Record<string, () => string> = {
      sobrev: () => t('srv.d.sobrev', 'Construa e sobreviva juntos'),
      pvp: () => t('srv.d.pvp', 'Empurre os outros do disco!'),
      ceu: () => t('srv.d.ceu', 'Último de pé nas ilhas vence'),
      obby: () => t('srv.d.obby', 'Pule até o bloco de ouro'),
      spleef: () => t('srv.d.spleef', 'Quebre o chão dos outros'),
      esconde: () => t('srv.d.esconde', 'Um procura, todos se escondem'),
      build: () => t('srv.d.build', 'Tema, tempo e votação'),
    };
    return t('srv.official', 'Oficial') + ' · ' + (D[c.slot ?? '']?.() ?? '');
  }
  return c.owner ? t('srv.by', 'de {n}', { n: c.owner }) : c.code ?? '';
}
/** foto do servidor (com a capa desenhada embaixo, se a foto não carregar) */
function cover(c: Card): string {
  const art = coverArt(c);
  return c.th ? `${apiUrl(c.th)}'),url('${art}` : art;
}
function coverArt(c: Card): string {
  if (c.kind === 'official') return coverFor(c.slot ?? 'sobrev');
  if (c.kind === 'studio') return coverFor('studio', c.code?.charCodeAt(1) ?? 1);
  return coverFor(c.mini === 'pvp' || c.mini === 'spleef' || c.mini === 'obby' || c.mini === 'esconde' || c.mini === 'ceu' ? c.mini : 'sobrev', c.code?.charCodeAt(2) ?? 2);
}

/**
 * Navegador de servidores. Resolve com o jogo montado (ou null = voltar).
 * `party`: aberto pelo grupo (o líder escolhe; os outros seguem). `gameId`: id do jogo no hub.
 */
export async function serverBrowser(root: HTMLElement, opts: WorldOpts, party: { code: string; host: boolean } | undefined, gameId: string): Promise<WorldGame | null> {
  ensureSvCss();
  const el = document.createElement('div');
  el.className = 'sv-root';
  root.appendChild(el);
  let who: Who | null = null;
  try {
    who = await me();
  } catch {
    who = null;
  }
  let tab: Tab = 'hot';
  try {
    const s = localStorage.getItem(TAB_KEY) as Tab | null;
    if (s && TABS.some((x) => x[0] === s)) tab = s;
  } catch {
    /* */
  }
  let q = '';
  let cards: Card[] = [];
  let loaded = false;
  let offline = !who;
  let busy = '';
  let waitLeader = false;
  const invites: { from: string; name: string; code: string; world: string }[] = [];
  const sq = await import('../../../party/squad').catch(() => null);
  const leader = () => !!sq && sq.inSquad() && sq.isLeader();

  el.innerHTML = `<div class="sv-top">
      <button class="sv-ib" data-back aria-label="${esc(t('srv.back', 'Voltar'))}">‹</button>
      <h2>🌐 ${t('mundo.servers', 'Servidores')}</h2>
      <input class="sv-search" type="search" maxlength="24" placeholder="${esc(t('srv.search', 'Buscar'))}" aria-label="${esc(t('srv.search', 'Buscar'))}">
      <span class="sv-sp"></span>
      <button class="sv-new" data-new>＋ ${t('srv.create', 'Criar servidor')}</button>
    </div>
    <div class="sv-tabs"></div>
    <div class="sv-body"><div class="sv-wait" hidden></div><div class="sv-strip"></div><div class="sv-playing"></div><div class="sv-grid"></div><div class="sv-foot"><button class="sv-link" data-code>${t('srv.codeLink', 'Entrar com código / QR')}</button></div></div>`;
  const tabsEl = el.querySelector('.sv-tabs') as HTMLElement;
  const grid = el.querySelector('.sv-grid') as HTMLElement;
  const strip = el.querySelector('.sv-strip') as HTMLElement;
  const waitEl = el.querySelector('.sv-wait') as HTMLElement;
  const search = el.querySelector('.sv-search') as HTMLInputElement;
  // amigos com sala aberta: "Fulano está jogando — ENTRAR" (src/party/friends-play.ts)
  void import('../../../party/friends-play').then((f) => f.playingStrip(el.querySelector('.sv-playing') as HTMLElement, gameId));

  const visible = (): Card[] => {
    const nq = norm(q.trim());
    let l = cards.filter((c) => !nq || norm(cardName(c)).includes(nq) || norm(c.owner ?? '').includes(nq) || (c.code ?? '').toLowerCase() === nq);
    if (tab === 'hot') l = l.filter((c) => c.kind === 'official' || (c.kind === 'studio' && c.status === 'approved') || c.friends.length || c.n > 0);
    else if (tab === 'friends') l = l.filter((c) => c.friends.length || (c.kind === 'user' && !c.mine));
    else if (tab === 'minis') l = l.filter((c) => (c.kind === 'official' && MINI_SLOTS.has(c.slot ?? '')) || (c.kind !== 'official' && !!c.mini && c.mini !== 'pvp') || (c.kind === 'studio' && ['race', 'collect', 'survive'].includes(c.goal ?? '')));
    else if (tab === 'pvp') l = l.filter((c) => c.pvp);
    else if (tab === 'players') l = l.filter((c) => c.kind === 'studio' || (c.kind === 'user' && !c.mine));
    else l = l.filter((c) => c.mine);
    // amigos dentro primeiro, depois mais cheios; oficiais vazios na ordem da lista
    return l.slice().sort((a, b) => b.friends.length - a.friends.length || Math.min(b.n, b.max - 1) - Math.min(a.n, a.max - 1));
  };
  const renderTabs = () => {
    const fr = cards.filter((c) => c.friends.length).length;
    tabsEl.innerHTML = TABS.map(([k, ic, n]) => `<button class="sv-tab ${tab === k ? 'on' : ''}" data-tab="${k}">${ic} ${esc(n())}${k === 'friends' && fr ? ` <i>${fr}</i>` : ''}</button>`).join('');
  };
  const cardHtml = (c: Card): string => {
    const [bc, bt] = badge(c);
    const live = c.kind === 'official' || c.n > 0;
    const st = c.mine && c.kind === 'studio' && c.status !== 'approved' ? `<span class="sv-st ${c.status === 'rejected' || c.status === 'hidden' ? 'bad' : ''}">${c.status === 'rejected' || c.status === 'hidden' ? t('studio.rev.bad', 'Recusada') : t('studio.rev.wait', 'Em análise')}</span>` : c.friendsOnly ? `<span class="sv-st">👥</span>` : '';
    return `<button class="sv-card${busy === c.key ? ' sv-busy' : ''}" data-busy="${esc(t('srv.joining', 'Entrando…'))}" data-key="${esc(c.key)}">
      <div class="sv-img" style="background-image:url('${cover(c)}')"><span class="sv-badge ${bc}">${esc(bt)}</span>${st}
        <span class="sv-fr" data-fr="${esc(c.key)}"></span>
        <span class="sv-cnt"><span class="sv-dot ${live ? 'on' : ''}"></span>${c.n}/${c.max}</span></div>
      <div class="sv-meta"><b>${esc(cardName(c))}</b><small>${esc(cardSub(c))}</small></div>
      ${c.mine && c.kind === 'studio' ? `<span class="sv-x" data-unpub="${esc(c.code ?? '')}" role="button" aria-label="${esc(t('srv.remove', 'Tirar'))}">✕</span>` : ''}
    </button>`;
  };
  let sheetMod: typeof import('../../../social/sheet') | null = null;
  void import('../../../social/sheet').then((m) => {
    sheetMod = m;
    renderGrid();
  });
  const renderGrid = () => {
    const l = visible();
    const local = tab === 'mine' ? lastWorlds().filter((w) => !cards.some((c) => c.code === w.code)) : [];
    if (!loaded && !offline) grid.innerHTML = `<div class="sv-empty">${t('srv.loading', 'Carregando servidores…')}</div>`;
    else if (offline && !cards.length) grid.innerHTML = `<div class="sv-empty">${t('mundo.net.offline', 'Sem internet agora — os servidores precisam de conexão.')}</div>`;
    else if (!l.length && !local.length)
      grid.innerHTML = `<div class="sv-empty">${
        tab === 'friends' ? t('srv.noFriends', 'Nenhum amigo jogando agora. Chame alguém!') : tab === 'mine' ? t('srv.noMine', 'Você ainda não tem servidores. Toque em Criar servidor!') : tab === 'players' ? t('srv.noPlayers', 'Nenhum servidor de jogador por aqui ainda. Publique o seu no Bloop Studio!') : t('srv.none', 'Nada encontrado.')
      }</div>`;
    else
      grid.innerHTML =
        l.map(cardHtml).join('') +
        local
          .map(
            (w) => `<button class="sv-card" data-busy="${esc(t('srv.joining', 'Entrando…'))}" data-key="${w.code}" data-local="${w.code}"><div class="sv-img" style="background-image:url('${coverFor(w.mini || 'sobrev', w.code.charCodeAt(0))}')"><span class="sv-badge surv">${esc(w.mini ? t('srv.b.mini', 'Minigame') : t('srv.b.world', 'Mundo'))}</span><span class="sv-cnt"><span class="sv-dot"></span>0/8</span></div><div class="sv-meta"><b>${esc(w.name)}</b><small>${w.code}</small></div></button>`,
          )
          .join('');
    // fotinhos dos amigos dentro
    if (sheetMod)
      for (const c of l) {
        if (!c.friends.length) continue;
        const f = grid.querySelector(`[data-fr="${CSS.escape(c.key)}"]`);
        if (!f) continue;
        for (const p of c.friends.slice(0, 4)) {
          const img = sheetMod.skinThumb(p.skin || 'bloop', 24);
          img.title = p.name;
          f.appendChild(img);
        }
      }
  };
  const renderStrip = () => {
    strip.innerHTML = invites.map((i) => `<button class="sv-inv" data-inv="${i.code}"><span class="sv-dot on" style="margin-left:6px"></span><span><b>${esc(i.name)}</b> ${esc(t('mundo.net.invitedYou', 'chamou você para'))} ${esc(i.world)}</span></button>`).join('');
  };
  const renderAll = () => {
    renderTabs();
    renderStrip();
    renderGrid();
  };

  /* ---------------- dados ---------------- */
  const refresh = async () => {
    if (!who) return;
    try {
      cards = await listServers(who.id);
      loaded = true;
      offline = false;
    } catch {
      offline = !cards.length;
      loaded = true;
    }
    if (!busy) renderAll();
  };
  const pollInv = async () => {
    if (!who) return;
    try {
      const r = await api<{ invites: { from: string; name: string; code: string; world: string }[] }>(`/mundo/invites?id=${encodeURIComponent(who.id)}`);
      const fresh = (r.invites ?? []).filter((i) => MCODE_OK.test(i.code) && !invites.some((x) => x.code === i.code));
      if (fresh.length) {
        invites.push(...fresh);
        renderStrip();
      }
    } catch {
      /* */
    }
  };

  return new Promise<WorldGame | null>((resolve) => {
    let closed = false;
    const timers = [window.setInterval(() => void refresh(), 10_000), window.setInterval(() => void pollInv(), 6000)];
    let offFocus: (() => void) | null = null;
    const popBack = pushBack(() => finish(null));
    const finish = (g: WorldGame | null) => {
      if (closed) return;
      closed = true;
      timers.forEach(clearInterval);
      offFocus?.();
      popBack();
      el.remove();
      resolve(g);
    };

    /** entra num código; trata erros; true = entrou */
    const enter = async (code: string, key: string, create: Record<string, unknown> | null = null): Promise<string> => {
      if (!who || closed) return 'busy';
      const r = await joinWorld(root, opts, who, code, create, gameId);
      if (typeof r === 'string') return r;
      if ('studio' in r) {
        finish(null);
        void openStudioServer(r.studio);
        return 'ok';
      }
      // grupo: o líder levou todo mundo para cá
      if (leader()) sq!.sendFocus(gameId, { srv: code });
      void key;
      finish(r);
      return 'ok';
    };
    const failMsg = (r: string) =>
      r === 'no_world' ? t('mundo.net.noWorld', 'Esse mundo não existe (confira o código)') : r === 'full' ? t('srv.full', 'Servidor cheio') : r === 'kicked' ? t('mundo.net.kicked', 'O anfitrião tirou você do mundo') : r === 'friends_only' ? t('srv.friendsOnlyErr', 'Esse servidor é só para amigos do criador') : t('mundo.net.fail', 'Não deu para conectar agora');
    const tapCard = async (c: Card | null, code: string) => {
      if (busy || !who) return;
      tap('light');
      busy = c?.key ?? code;
      renderGrid();
      let r = 'fail';
      try {
        if (c?.kind === 'official' && c.slot) {
          // oficial: o diretório escolhe a instância (mais cheia com lugar; abre outra se todas lotarem)
          const avoid: string[] = [];
          for (let i = 0; i < 3; i++) {
            const cd = await matchServer(who.id, c.slot, avoid);
            r = await enter(cd, busy);
            if (r !== 'full') break;
            avoid.push(cd);
          }
        } else if (c?.kind === 'studio' && c.code && c.ugc) {
          finish(null);
          void openStudioServer({ code: c.code, ugc: c.ugc, name: c.name, pvp: c.pvp });
          return;
        } else r = await enter(code, busy);
      } catch {
        r = 'fail';
      }
      if (r === 'ok') return;
      busy = '';
      renderAll();
      notify(failMsg(r), { icon: 'warning', kind: 'warn' });
    };

    /* ---------------- criar ---------------- */
    const createSheet = () => {
      const pop = document.createElement('div');
      pop.className = 'sv-pop';
      el.appendChild(pop);
      const back = pushBack(() => pop.remove());
      const close = () => (back(), pop.remove());
      let mode: GameMode = 'sobrevivencia';
      let type: GenOpts['type'] = 'normal';
      let pvp = false;
      let mini: Mini = '';
      const main = () => {
        pop.innerHTML = `<div class="sv-sheet"><h3>＋ ${t('srv.create', 'Criar servidor')}<button class="sv-ib" data-x>✕</button></h3>
          <div class="sv-two"><button class="sv-pick" data-world><img src="${coverFor('build')}" alt="">${t('srv.newWorld', 'Mundo online')}<small>${t('srv.newWorldD', 'Seu mundo de blocos, até 8 amigos')}</small></button>
          <button class="sv-pick" data-studio><img src="${coverFor('studio', 3)}" alt="">${t('srv.newStudio', 'Do Bloop Studio')}<small>${t('srv.newStudioD', 'Seu mapa publicado vira servidor')}</small></button></div></div>`;
      };
      const world = () => {
        const chip = (on: boolean, attr: string, txt: string) => `<button class="sv-chip ${on ? 'on' : ''}" ${attr}>${txt}</button>`;
        pop.innerHTML = `<div class="sv-sheet"><h3>${t('srv.newWorld', 'Mundo online')}<button class="sv-ib" data-x>✕</button></h3>
          <label>${t('mundo.mode', 'Modo')}</label><div class="sv-chips">${(['sobrevivencia', 'criativo', 'pacifico'] as GameMode[]).map((k) => chip(mode === k && !mini, `data-mode="${k}"`, modeName(k))).join('')}</div>
          <label>${t('srv.world', 'Mundo')}</label><div class="sv-chips">${(['normal', 'plano', 'ilhas', 'flutuantes'] as GenOpts['type'][]).map((k) => chip(type === k && !mini, `data-type="${k}"`, { normal: t('mundo.type.normal', 'Normal'), plano: t('mundo.type.plano', 'Plano'), ilhas: t('mundo.type.ilhas', 'Ilhas'), flutuantes: t('mundo.type.flutuantes', 'Ilhas Flutuantes') }[k])).join('')}${chip(pvp, 'data-pvp', '⚔ PvP')}</div>
          <label>${t('mundo.minis', 'Minijogos')}</label><div class="sv-chips">${(['obby', 'spleef', 'esconde', 'pvp', 'ceu', 'corrida'] as Exclude<Mini, ''>[]).map((k) => chip(mini === k, `data-mini="${k}"`, ({ obby: t('mundo.mini.obby', 'Corrida de Obstáculos'), spleef: t('mundo.mini.spleef', 'Spleef de Blocos'), esconde: t('mundo.mini.esconde', 'Esconde-Esconde'), pvp: t('mundo.mini.pvp', 'PvP Arena'), ceu: t('mundo.mini.ceu', 'Ilhas no Céu'), corrida: t('mundo.mini.build', 'Construção') } as Record<string, string>)[k])).join('')}</div>
          <div class="sv-note">${t('srv.friendsSee', 'Seus amigos veem seu servidor na aba Amigos e entram com um toque.')}</div>
          <button class="sv-go" data-make>${t('mundo.net.create', 'Criar e chamar amigos')}</button></div>`;
      };
      const studio = async () => {
        pop.innerHTML = `<div class="sv-sheet"><h3>${t('srv.newStudio', 'Do Bloop Studio')}<button class="sv-ib" data-x>✕</button></h3><div class="sv-list">${t('srv.loading', 'Carregando servidores…')}</div>
          <button class="sv-go alt" data-openstudio>${t('srv.openStudio', 'Abrir o Bloop Studio')}</button></div>`;
        const list = pop.querySelector('.sv-list') as HTMLElement;
        try {
          const r = await api<{ items: { id: string; name: string; kind: string; thumb?: string; review?: string; game?: { title: string } }[] }>(`/ugc/mine?type=criacao&pid=${encodeURIComponent(who!.id)}`);
          const maps = (r.items ?? []).filter((i) => i.kind === 'map');
          list.innerHTML = maps.length
            ? maps
                .map((m) => {
                  const st = !m.review || m.review === 'approved' ? '' : m.review === 'rejected' || m.review === 'needs-changes' ? t('studio.rev.bad', 'Recusada') : t('studio.rev.wait', 'Em análise');
                  const th = m.thumb ? (m.thumb.startsWith('/api/') ? apiUrl(m.thumb.slice(4)) : m.thumb) : '';
                  return `<div class="sv-row">${th ? `<img src="${esc(th)}" alt="">` : ''}<div class="sv-t">${esc(m.game?.title ?? m.name)}${st ? `<small>${esc(st)}</small>` : ''}</div><button class="sv-mini" data-pub="${esc(m.id)}" data-title="${esc(m.game?.title ?? m.name)}" data-th="${esc(th)}">${t('srv.publish', 'Criar servidor')}</button></div>`;
                })
                .join('')
            : `<div class="sv-note">${t('srv.noMaps', 'Publique um mapa na Loja do Bloop Studio primeiro. Depois ele pode virar servidor aqui.')}</div>`;
        } catch {
          list.innerHTML = `<div class="sv-err">${t('mundo.net.fail', 'Não deu para conectar agora')}</div>`;
        }
      };
      pop.addEventListener('pointerdown', (e) => e.stopPropagation());
      pop.addEventListener('click', async (e) => {
        if (e.target === pop) return close();
        const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (!b) return;
        const d = b.dataset;
        if (d.x !== undefined) return close();
        if (d.world !== undefined) return world();
        if (d.studio !== undefined) return void studio();
        if (d.openstudio !== undefined) {
          close();
          finish(null);
          const [reg, hub] = await Promise.all([import('../../../hub/registry'), import('../../../hub/hub')]);
          const def = reg.listGames().find((g) => g.id === 'studio');
          if (def) {
            hub.closeHost();
            await new Promise((r) => setTimeout(r, 60));
            await hub.launchGame(def);
          }
          return;
        }
        if (d.mode) (mode = d.mode as GameMode), (mini = '');
        if (d.type) (type = d.type as GenOpts['type']), (mini = '');
        if (d.pvp !== undefined) pvp = !pvp;
        if (d.mini) mini = mini === d.mini ? '' : (d.mini as Mini);
        if (d.mode || d.type || d.pvp !== undefined || d.mini) return world();
        if (d.make !== undefined) {
          close();
          const code = newCode();
          const k = mini;
          const create = k
            ? { name: t('srv.miniOf', '{m} de {n}', { m: ({ obby: t('mundo.mini.obby', 'Corrida de Obstáculos'), spleef: t('mundo.mini.spleef', 'Spleef de Blocos'), esconde: t('mundo.mini.esconde', 'Esconde-Esconde'), pvp: t('mundo.mini.pvp', 'PvP Arena'), ceu: t('mundo.mini.ceu', 'Ilhas no Céu'), corrida: t('mundo.mini.build', 'Construção') } as Record<string, string>)[k], n: who?.name ?? 'Bloop' }), seed: Math.floor(Math.random() * 1e9), gen: { type: k === 'ceu' ? 'flutuantes' : k === 'esconde' ? 'normal' : 'plano', h: 1, off: [] }, mode: k === 'corrida' ? 'criativo' : k === 'ceu' ? 'sobrevivencia' : 'pacifico', pvp: k === 'ceu' || k === 'pvp', mini: k }
            : { name: t('mundo.net.worldOf', 'Mundo de {n}', { n: who?.name ?? 'Bloop' }), seed: Math.floor(Math.random() * 1e9), gen: { type, h: 1, off: [] }, mode, pvp };
          busy = code;
          renderGrid();
          const r = await enter(code, code, create).catch(() => 'fail');
          if (r !== 'ok') {
            busy = '';
            renderAll();
            notify(failMsg(r), { icon: 'warning', kind: 'warn' });
          }
          return;
        }
        if (d.pub) {
          const res = await studioServerForm(el, { id: d.pub, title: d.title ?? '', thumb: d.th || undefined });
          if (!res) return;
          close();
          notify(res.status === 'approved' ? t('srv.pubOk', 'Servidor criado! Já aparece na lista.') : t('srv.pubWait', 'Servidor criado! Ele aparece para todos quando a moderação aprovar.'), { icon: 'party', kind: 'good' });
          tab = 'mine';
          void refresh();
        }
      });
      main();
    };

    /* ---------------- código / QR (secundário) ---------------- */
    const codeSheet = () => {
      const pop = document.createElement('div');
      pop.className = 'sv-pop';
      el.appendChild(pop);
      const back = pushBack(() => pop.remove());
      const close = () => (back(), pop.remove());
      pop.innerHTML = `<div class="sv-sheet"><h3>${t('srv.codeLink', 'Entrar com código / QR')}<button class="sv-ib" data-x>✕</button></h3>
        <label>${t('mundo.net.code', 'Código do mundo')}</label><input class="sv-in" id="sv-code" maxlength="6" placeholder="ABC234" style="text-transform:uppercase;letter-spacing:.15em">
        <div class="sv-err" hidden></div>
        <div class="sv-two"><button class="sv-go alt" data-scan>📷 ${t('srv.scan', 'Ler QR')}</button><button class="sv-go" data-enter>${t('mundo.net.join', 'Entrar')}</button></div></div>`;
      const err = pop.querySelector('.sv-err') as HTMLElement;
      const go = (c: string) => {
        if (!MCODE_OK.test(c)) {
          err.hidden = false;
          err.textContent = t('mundo.net.badCode', 'O código tem 6 letras/números');
          return;
        }
        close();
        void tapCard(cards.find((x) => x.code === c) ?? null, c);
      };
      pop.addEventListener('pointerdown', (e) => e.stopPropagation());
      pop.addEventListener('click', async (e) => {
        if (e.target === pop) return close();
        const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
        if (!b) return;
        if (b.dataset.x !== undefined) return close();
        if (b.dataset.enter !== undefined) return go(((pop.querySelector('#sv-code') as HTMLInputElement).value || '').toUpperCase().trim());
        if (b.dataset.scan !== undefined) {
          const s = await import('../../../ui/scan');
          const txt = await s.openScanner({ accept: (x) => /[A-HJ-NP-Z2-9]{6}/i.test(x) });
          const m = txt ? /(?:mundo[=/])?([A-HJ-NP-Z2-9]{6})(?![A-Z0-9])/i.exec(txt) : null;
          if (m) go(m[1].toUpperCase());
        }
      });
    };

    /* ---------------- eventos ---------------- */
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    search.addEventListener('input', () => {
      q = search.value;
      renderGrid();
    });
    el.addEventListener('click', (e) => {
      const tg = e.target as HTMLElement;
      const un = tg.closest('[data-unpub]') as HTMLElement | null;
      if (un) {
        e.stopPropagation();
        void unpublishServer(un.dataset.unpub!).then(() => refresh());
        return;
      }
      const b = tg.closest('button') as HTMLButtonElement | null;
      if (!b) return;
      const d = b.dataset;
      if (d.back !== undefined) return finish(null);
      if (d.new !== undefined) {
        if (!who) return notify(t('mundo.net.offline', 'Sem internet agora — os servidores precisam de conexão.'), { icon: 'cloud-off' });
        return createSheet();
      }
      if (d.code !== undefined) return codeSheet();
      if (d.tab) {
        tab = d.tab as Tab;
        try {
          localStorage.setItem(TAB_KEY, tab);
        } catch {
          /* */
        }
        tap('light');
        return renderAll();
      }
      if (d.inv) return void tapCard(null, d.inv);
      if (d.local) return void tapCard(null, d.local);
      if (d.key) {
        const c = cards.find((x) => x.key === d.key);
        if (c) void tapCard(c, c.code ?? '');
      }
    });

    /* ---------------- grupo: o líder escolhe, os outros seguem ---------------- */
    const followTo = (code: string) => {
      if (closed || !MCODE_OK.test(code) || busy) return;
      waitEl.hidden = false;
      waitEl.textContent = t('mundo.net.followLeader', 'Seguindo o líder do grupo…');
      void tapCard(cards.find((x) => x.code === code) ?? null, code);
    };
    offFocus = bus.on('squad-focus', (f: { game?: string; cfg?: Record<string, string | number> }) => {
      if (!sq?.inSquad() || sq.isLeader()) return;
      const code = String(f.cfg?.srv ?? '');
      if (code) followTo(code);
    });
    if (party && who) {
      void (async () => {
        // o líder já está num servidor? (estado do grupo guarda o último foco)
        const v = sq?.squad() as { cfg?: Record<string, string | number> } | null | undefined;
        const cur = String(v?.cfg?.srv ?? '');
        if (!party.host && MCODE_OK.test(cur)) return followTo(cur);
        // link/convite direto (código de verdade) ou mundo do grupo já aberto
        const r = await enter(party.code, party.code).catch(() => 'fail');
        if (r === 'ok') return;
        if (!party.host) {
          waitLeader = true;
          waitEl.hidden = false;
          waitEl.textContent = '♛ ' + t('srv.waitLeader', 'Esperando o líder escolher um servidor… você entra junto!');
        } else {
          waitEl.hidden = false;
          waitEl.textContent = '♛ ' + t('srv.youLead', 'Você é o líder: escolha um servidor e o grupo entra junto!');
        }
      })();
    }
    void waitLeader;

    renderAll();
    void refresh();
    void pollInv();
    if (location.search.includes('debug'))
      (window as unknown as { __srv: unknown }).__srv = {
        cards: () => cards,
        tap: (key: string) => {
          const c = cards.find((x) => x.key === key);
          return c ? tapCard(c, c.code ?? '') : tapCard(null, key);
        },
        refresh,
      };
  });
}
