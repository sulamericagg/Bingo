/**
 * Aba AMIGOS do painel Social (estilo "adicionar amigo" de jogos grandes):
 *   1. "Buscar @amigo" no topo — sugestões enquanto digita (GET /api/handles/search), cada uma com
 *      avatar, @, apelido, bolinha online e "Adicionar". O pedido vai SEMPRE pelo @ escolhido na lista.
 *   2. Meu @ — copiar, QR/compartilhar (link que abre esta tela com o @ preenchido), aparecer na busca.
 *   3. Convites recebidos (festa/casa/jogo) — Entrar / Ignorar.
 *   4. Pedidos — Aceitar / Recusar (+ bloquear/denunciar).
 *   5. Amigos — online primeiro; Convidar, Visitar casa, perfil, remover, bloquear, denunciar.
 * Segurança (13+): sem id/local/nome real na tela; busca não mostra bloqueados; denúncia vai para o painel.
 */
import type { FriendInfo, FriendInvite, HandleHit, InviteKind } from '../home/api';
import { t } from '../i18n';
import { icon } from '../ui/icons';
import { listGames } from '../hub/registry';
import { blockHandle, cachedSocial, homeApi, refreshFriendsNow } from '../services/home';
import { profile, syncPendingHandle } from '../services/profile';
import { getPlayer } from '../services/online';
import { isNative } from '../core/platform';
import { ONLINE } from '../config';
import { openProfile } from './profile';
import { openSheet, popMenu, skinThumb, toast } from './sheet';
import { setFriend, social, toggleList } from './store';

/* ---------------- ações externas (casa / jogos) ---------------- */

async function openHomeAt(o: { visit?: string; party?: string }): Promise<void> {
  const m = await import('../home/register');
  await m.openHome(o);
}
async function launchById(gameId: string): Promise<boolean> {
  const def = listGames().find((g) => g.id === gameId);
  if (!def) return false;
  const hub = await import('../hub/hub');
  await hub.launchGame(def);
  return true;
}

export function gameLabel(id?: string): string {
  // convite de duelo: "duel-<jogo>-<código>" (src/party/duel-link.ts)
  const d = /^duel-([a-z]{2,12})-/.exec(id ?? '') ?? /^j-(?:duel-)?([a-z]{2,12})-/.exec(id ?? '');
  if (d) id = d[1];
  return listGames().find((g) => g.id === id)?.name ?? id ?? '';
}

export function inviteText(inv: FriendInvite): string {
  const h = inv.from.handle || inv.from.name;
  if (inv.kind === 'party') return t('fr.inv.party', '@{h} te chamou para uma festa na casa!', { h });
  if (inv.kind === 'house') return t('fr.inv.house', '@{h} te chamou para visitar a casa!', { h });
  if (inv.kind === 'squad') return t('fr.inv.squad', '@{h} te chamou para o grupo!', { h });
  return t('fr.inv.game', '@{h} te chamou para jogar {g}!', { h, g: gameLabel(inv.game) });
}

/** Entrar no convite (fecha o painel antes). */
export async function acceptInvite(inv: FriendInvite, close?: () => void): Promise<void> {
  void homeApi.clearInvite?.(inv.from.id);
  close?.();
  if (inv.kind === 'squad') {
    const sq = await import('../party/squad');
    if (!inv.room || !(await sq.joinSquad(inv.room))) toast(t('sq.gone', 'Esse grupo não existe mais.'), 'warning');
  } else if (inv.kind === 'party') await openHomeAt({ visit: inv.from.id, party: inv.from.id });
  else if (inv.kind === 'house') await openHomeAt({ visit: inv.from.id });
  else if (inv.game?.startsWith('j-')) {
    // sala de um amigo (voo, noites, garimpo, mundo, duelo): entra direto, sem código
    const j = await import('../party/join');
    const r = j.parseJoinInvite(inv.game);
    if (!r || !(await j.openJoin(r))) toast(t('fr.inv.nogame', 'Esse jogo não está neste aparelho.'), 'warning');
  } else if (inv.game?.startsWith('duel-')) {
    const d = await import('../party/duel-link');
    const p = d.parseDuelInvite(inv.game);
    if (!p || !(await d.openDuel(p.game, p.code))) toast(t('fr.inv.nogame', 'Esse jogo não está neste aparelho.'), 'warning');
  } else if (!(inv.game && (await launchById(inv.game)))) toast(t('fr.inv.nogame', 'Esse jogo não está neste aparelho.'), 'warning');
}

/* ---------------- link / QR do meu @ ---------------- */

/** Link que abre o app/jogo na tela de amigos com o @ preenchido. */
export function handleLink(h: string): string {
  const base = isNative ? ONLINE.nativeApiBase : location.origin + location.pathname;
  return `${base.replace(/\/+$/, '')}/?amigo=${encodeURIComponent(h)}`;
}

async function openQr(h: string): Promise<void> {
  const s = openSheet(t('fr.qr.title', 'Meu @ em QR'), 'link', { small: true, id: 'fr-qr' });
  const link = handleLink(h);
  s.body.innerHTML = `<div class="fr-qr"><canvas></canvas><b>@${esc(h)}</b><p class="sc-note">${esc(t('fr.qr.hint', 'Seu amigo aponta a câmera e cai direto na tela de amigos com o seu @. Só mostre para quem você conhece!'))}</p><div class="fr-qr-acts"></div></div>`;
  const cv = s.body.querySelector('canvas')!;
  try {
    const { drawBloopQr } = await import('../ui/scan');
    await drawBloopQr(cv, link, 230);
  } catch {
    cv.replaceWith(Object.assign(document.createElement('p'), { textContent: link }));
  }
  const acts = s.body.querySelector('.fr-qr-acts')!;
  const share = btn(t('fr.share', 'Compartilhar'), 'mail', 'violet');
  share.onclick = async () => {
    const text = t('fr.share.text', 'Me adiciona no Bloop World: @{h}', { h });
    try {
      if (isNative) {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: 'Bloop World', text, url: link });
      } else if (navigator.share) await navigator.share({ title: 'Bloop World', text, url: link });
      else await copy(`${text} ${link}`);
    } catch {
      /* cancelado */
    }
  };
  const cp = btn(t('fr.copylink', 'Copiar link'), 'link', 'ghost');
  cp.onclick = () => void copy(link);
  acts.append(share, cp);
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('fr.copied', 'Copiado!'), 'check');
  } catch {
    toast(text, 'link', 5000);
  }
}

/* ---------------- helpers de DOM ---------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function btn(label: string, ic: Parameters<typeof icon>[0] | null, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'sc-btn sm ' + cls;
  b.innerHTML = (ic ? icon(ic, { size: 18 }) : '') + '<span></span>';
  (b.lastElementChild as HTMLElement).textContent = label;
  return b;
}

function person(p: { name: string; handle: string; skin: string; avatar?: unknown; online?: boolean }, sub?: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'sc-row fr-row';
  const av = document.createElement('div');
  av.className = 'fr-av';
  av.appendChild(skinThumb(p.skin, 40, p.avatar));
  if (p.online !== undefined) {
    const dot = document.createElement('i');
    dot.className = 'fr-dot' + (p.online ? ' on' : '');
    dot.title = p.online ? t('fr.online', 'online') : t('fr.offline', 'offline');
    av.appendChild(dot);
  }
  const lbl = document.createElement('div');
  lbl.className = 'lbl';
  lbl.innerHTML = '<span class="fr-h"></span><small></small>';
  (lbl.firstElementChild as HTMLElement).textContent = p.handle ? '@' + p.handle : p.name;
  (lbl.lastElementChild as HTMLElement).textContent = sub ?? p.name;
  const acts = document.createElement('div');
  acts.className = 'fr-acts';
  row.append(av, lbl, acts);
  return row;
}

function moreBtn(items: () => Parameters<typeof popMenu>[2]): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'sc-ibtn fr-more';
  b.setAttribute('aria-label', t('fr.more', 'Mais opções'));
  b.innerHTML = icon('gear', { size: 18 });
  b.onclick = (e) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    popMenu(r.left + r.width / 2, r.bottom + 4, items());
  };
  return b;
}

function section(title: string, n?: number): HTMLElement {
  const h = document.createElement('div');
  h.className = 'fr-sec';
  h.textContent = title;
  if (n) {
    const b = document.createElement('b');
    b.className = 'fr-count';
    b.textContent = String(n);
    h.appendChild(b);
  }
  return h;
}

/* ---------------- denúncia ---------------- */

function reportMenu(target: { id?: string; handle?: string; name?: string }): void {
  const reasons: [string, string][] = [
    ['nome', t('fr.rep.name', 'Nome/@ ofensivo')],
    ['assedio', t('fr.rep.harass', 'Está me incomodando')],
    ['dados', t('fr.rep.pii', 'Pediu dados pessoais')],
    ['outro', t('fr.rep.other', 'Outro motivo')],
  ];
  popMenu(innerWidth / 2, innerHeight / 3, reasons.map(([code, label]) => ({
    label,
    icon: 'warning' as const,
    run: async () => {
      const ok = await homeApi.report?.(target, 'amigos:' + code);
      toast(ok ? t('fr.rep.ok', 'Denúncia enviada. Obrigado por avisar!') : t('friends.offline', 'Sem conexão. Tente de novo.'), ok ? 'shield' : 'refresh');
    },
  })));
}

async function blockById(f: { id: string; name: string; skin: string; handle?: string }): Promise<void> {
  toggleList('blocked', f.id, true);
  setFriend({ id: f.id, name: f.name, skin: f.skin }, false);
  await homeApi.blockPlayer?.(f.id, true).catch(() => false);
  toast(t('fr.blocked', '@{h} bloqueado. Ele não te acha mais nem manda pedidos.', { h: f.handle || f.name }), 'lock');
}

/* ============================================================
 *  RENDER
 * ============================================================ */

let prefill = '';
/** Abre a aba com o @ já digitado (link/QR). */
export function setFriendPrefill(h: string): void {
  prefill = h;
}

export interface FriendsTab {
  body: HTMLElement;
  /** fecha o painel social (antes de ir para a casa/jogo) */
  close: () => void;
  /** a aba ainda está visível? */
  alive: () => boolean;
}

export function renderFriendsTab(ctx: FriendsTab): void {
  const { body } = ctx;
  body.innerHTML = '';
  body.classList.add('fr-body');
  void syncPendingHandle();

  /* ---------- 1. busca ---------- */
  const search = document.createElement('div');
  search.className = 'fr-search';
  search.innerHTML = `<div class="fr-srow"><label class="fr-field">${icon('target', { size: 20 })}<b>@</b><input type="search" maxlength="20" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="search" /></label><button class="fr-scan" type="button">${icon('camera', { size: 24 })}<span></span></button></div><div class="fr-sugs" role="listbox"></div>`;
  const scanB = search.querySelector('.fr-scan') as HTMLButtonElement;
  (scanB.lastElementChild as HTMLElement).textContent = t('scan.title', 'Escanear');
  scanB.setAttribute('aria-label', t('fr.scan.aria', 'Escanear o QR do @ de um amigo'));
  const inp = search.querySelector('input')!;
  inp.placeholder = t('fr.search.ph', 'Buscar @amigo');
  inp.setAttribute('aria-label', t('fr.search.ph', 'Buscar @amigo'));
  const sugs = search.querySelector('.fr-sugs') as HTMLElement;
  body.appendChild(search);

  let timer = 0;
  let seq = 0;
  const hint = (msg: string) => {
    sugs.innerHTML = `<div class="fr-hint"></div>`;
    (sugs.firstElementChild as HTMLElement).textContent = msg;
  };
  const runSearch = async () => {
    const q = inp.value.trim().replace(/^@+/, '');
    const my = ++seq;
    if (q.length < 2) {
      sugs.innerHTML = '';
      return;
    }
    hint(t('fr.search.wait', 'Procurando...'));
    const res = await homeApi.searchHandles!(q);
    if (my !== seq || !ctx.alive()) return;
    if (res === null) return hint(t('fr.search.net', 'Sem internet agora. Tente de novo daqui a pouco.'));
    if (res === 'rate') return hint(t('fr.search.rate', 'Calma! Muitas buscas seguidas. Espere um pouquinho.'));
    if (!res.length) return hint(t('fr.search.none', 'Ninguém com esse @. Confira as letras!'));
    sugs.innerHTML = '';
    for (const hit of res) sugs.appendChild(hitRow(hit));
  };
  const hitRow = (hit: HandleHit): HTMLElement => {
    const row = person(hit, hit.name + (hit.online ? ' · ' + t('fr.online', 'online') : ''));
    row.classList.add('fr-hit');
    const acts = row.querySelector('.fr-acts')!;
    const b =
      hit.rel === 'friend'
        ? btn(t('fr.isfriend', 'Amigo'), 'check', 'ghost')
        : hit.rel === 'sent'
          ? btn(t('fr.sent', 'Enviado'), 'clock', 'ghost')
          : hit.rel === 'received'
            ? btn(t('fr.accept', 'Aceitar'), 'check', 'green')
            : btn(t('fr.add', 'Adicionar'), 'heart', 'green');
    b.classList.add('fr-addbtn');
    b.disabled = hit.rel === 'friend' || hit.rel === 'sent';
    b.onclick = async () => {
      b.disabled = true;
      const r = await homeApi.addFriend('@' + hit.handle);
      const msg: Record<typeof r, string> = {
        sent: t('fr.sentto', 'Pedido enviado para @{h}!', { h: hit.handle }),
        already: t('friends.already', 'Vocês já são amigos!'),
        not_found: t('fr.notfound', 'Não deu para achar @{h} agora.', { h: hit.handle }),
        limit: t('friends.limit', 'Limite de pedidos/amigos atingido. Tente amanhã.'),
        network: t('friends.offline', 'Sem conexão. Tente de novo.'),
      };
      toast(msg[r], r === 'sent' || r === 'already' ? 'heart' : 'warning');
      if (r === 'sent') hit.rel = 'sent';
      else if (r === 'already') hit.rel = 'friend';
      else b.disabled = false;
      if (r === 'sent' || r === 'already') {
        row.replaceWith(hitRow(hit));
        if (r === 'already') void refreshFriendsNow().then(() => ctx.alive() && renderLists());
      }
    };
    acts.append(
      b,
      moreBtn(() => [
        { label: t('fr.block', 'Bloquear'), icon: 'lock', danger: true, run: async () => {
          const ok = await blockHandle(hit.handle);
          toast(ok ? t('fr.blocked', '@{h} bloqueado. Ele não te acha mais nem manda pedidos.', { h: hit.handle }) : t('friends.offline', 'Sem conexão. Tente de novo.'), ok ? 'lock' : 'refresh');
          if (ok) row.remove();
        } },
        { label: t('fr.report', 'Denunciar'), icon: 'warning', danger: true, run: () => reportMenu({ handle: hit.handle, name: hit.name }) },
      ]),
    );
    return row;
  };
  inp.addEventListener('input', () => {
    const clean = inp.value.replace(/^@+/, '');
    if (clean !== inp.value) inp.value = clean;
    clearTimeout(timer);
    timer = window.setTimeout(runSearch, 260);
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(timer);
      void runSearch();
    }
  });
  // QR do @ de um amigo (ou de um grupo/sala): lê com a câmera aqui mesmo
  scanB.onclick = async () => {
    const { scanBloopLink } = await import('../ui/scan');
    const l = await scanBloopLink({ title: t('scan.title', 'Escanear'), hint: t('fr.scan.hint', 'Aponte para o QR do @ do seu amigo') });
    if (!l || !ctx.alive()) return;
    if (l.type === 'amigo') {
      inp.value = l.code;
      clearTimeout(timer);
      void runSearch();
      return;
    }
    ctx.close();
    void import('../ui/links').then((m) => m.openBloopLink(l));
  };

  /* ---------- 2. meu @ ---------- */
  const mine = document.createElement('div');
  mine.className = 'fr-mine';
  body.appendChild(mine);
  const renderMine = () => {
    const server = homeApi.myHandle();
    const h = server || (profile.handleStatus === 'ok' ? profile.handle : '');
    mine.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'fr-mine-top';
    const lbl = document.createElement('div');
    lbl.className = 'fr-mine-h';
    lbl.innerHTML = `<small></small><b></b>`;
    (lbl.firstElementChild as HTMLElement).textContent = t('fr.mine', 'Meu @');
    const pending = !server && profile.handle && profile.handleStatus === 'pending';
    (lbl.lastElementChild as HTMLElement).textContent = h ? '@' + h : pending ? '@' + profile.handle + ' · ' + t('fr.mine.pending', 'confirmando...') : '—';
    top.appendChild(lbl);
    if (h) {
      const cp = btn(t('fr.copy', 'Copiar'), 'link', 'ghost');
      cp.onclick = () => void copy('@' + h);
      const qr = btn(t('fr.qr', 'QR'), 'camera', 'violet');
      qr.onclick = () => void openQr(h);
      top.append(cp, qr);
    } else {
      const pick = btn(t('fr.pick', 'Escolher meu @'), 'pencil', 'gold');
      pick.onclick = () => void import('../ui/onboarding').then((m) => m.openProfileEditor()).then(() => ctx.alive() && renderMine());
      top.appendChild(pick);
    }
    mine.appendChild(top);
    if (h && homeApi.discoverable) {
      const row = document.createElement('label');
      row.className = 'fr-switch';
      row.innerHTML = `<span></span><span class="sc-switch"><input type="checkbox"><span></span></span>`;
      (row.firstElementChild as HTMLElement).textContent = t('fr.discoverable', 'Aparecer na busca de @');
      const cb = row.querySelector('input')!;
      cb.checked = homeApi.discoverable();
      cb.onchange = async () => {
        if (!(await homeApi.setDiscoverable!(cb.checked))) {
          cb.checked = !cb.checked;
          toast(t('friends.offline', 'Sem conexão. Tente de novo.'), 'refresh');
        }
      };
      mine.appendChild(row);
    }
    if (homeApi.invitesFrom) {
      // segurança: quem pode te convidar (festa, casa, jogo, grupo)
      const row = document.createElement('label');
      row.className = 'fr-switch';
      row.innerHTML = `<span></span><select class="fr-sel"></select>`;
      (row.firstElementChild as HTMLElement).textContent = t('fr.invfrom', 'Aceitar convites de');
      const sel = row.querySelector('select')!;
      for (const [v, l] of [['friends', t('fr.invfrom.friends', 'Amigos')], ['nobody', t('fr.invfrom.nobody', 'Ninguém')]] as const) sel.add(new Option(l, v));
      sel.value = homeApi.invitesFrom();
      sel.onchange = async () => {
        if (!(await homeApi.setInvitesFrom!(sel.value as 'friends' | 'nobody'))) {
          sel.value = homeApi.invitesFrom!();
          toast(t('friends.offline', 'Sem conexão. Tente de novo.'), 'refresh');
        }
      };
      mine.appendChild(row);
    }
  };
  renderMine();

  /* ---------- 3-5. convites, pedidos, amigos ---------- */
  const lists = document.createElement('div');
  body.appendChild(lists);
  const renderLists = () => {
    if (!ctx.alive()) return;
    const { friends, requests, invites } = cachedSocial();
    lists.innerHTML = '';
    if (invites.length) {
      lists.appendChild(section(t('fr.sec.invites', 'Convites'), invites.length));
      for (const inv of invites) {
        const row = person({ ...inv.from, online: true }, inviteText(inv));
        row.classList.add('fr-invite');
        const go = btn(t('fr.join', 'Entrar'), 'play', 'green');
        go.onclick = () => void acceptInvite(inv, ctx.close);
        const no = btn(t('fr.ignore', 'Ignorar'), null, 'ghost');
        no.onclick = async () => {
          await homeApi.clearInvite?.(inv.from.id);
          renderLists();
        };
        row.querySelector('.fr-acts')!.append(go, no);
        lists.appendChild(row);
      }
    }
    if (requests.length) {
      lists.appendChild(section(t('fr.sec.requests', 'Pedidos de amizade'), requests.length));
      for (const r of requests) {
        const row = person(r.from, t('fr.wants', '{n} quer ser seu amigo', { n: r.from.name }));
        const yes = btn(t('fr.accept', 'Aceitar'), 'check', 'green');
        const no = btn(t('fr.decline', 'Recusar'), null, 'ghost');
        const answer = async (acc: boolean) => {
          yes.disabled = no.disabled = true;
          const ok = await homeApi.respond(r.from.id, acc);
          if (!ok) {
            yes.disabled = no.disabled = false;
            return toast(t('friends.offline', 'Sem conexão. Tente de novo.'), 'refresh');
          }
          if (acc) toast(t('home.friends.nowfriends', 'Você e @{h} agora são amigos!', { h: r.from.handle }), 'heart');
          await refreshFriendsNow();
          renderLists();
        };
        yes.onclick = () => void answer(true);
        no.onclick = () => void answer(false);
        row.querySelector('.fr-acts')!.append(
          yes,
          no,
          moreBtn(() => [
            { label: t('fr.block', 'Bloquear'), icon: 'lock', danger: true, run: () => void blockById(r.from).then(() => refreshFriendsNow()).then(renderLists) },
            { label: t('fr.report', 'Denunciar'), icon: 'warning', danger: true, run: () => reportMenu({ id: r.from.id, name: r.from.name }) },
          ]),
        );
        lists.appendChild(row);
      }
    }
    const sorted = friends.slice().sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeen - a.lastSeen);
    const on = sorted.filter((f) => f.online).length;
    lists.appendChild(section(t('fr.sec.friends', 'Amigos ({on} online)', { on }) ));
    if (!sorted.length) {
      const e = document.createElement('div');
      e.className = 'sc-empty fr-empty';
      e.innerHTML = icon('heart', { size: 44 });
      e.append(t('fr.empty', 'Busque o @ do seu amigo lá em cima e toque em Adicionar.'));
      lists.appendChild(e);
    }
    for (const f of sorted) lists.appendChild(friendRow(f));
    const note = document.createElement('p');
    note.className = 'sc-note';
    note.textContent = t('fr.safe', 'Só adicione quem você conhece de verdade. Nunca conte seu nome completo, escola ou onde mora.');
    lists.appendChild(note);
  };

  const friendRow = (f: FriendInfo): HTMLElement => {
    const ago = f.online
      ? t('fr.online.now', 'online agora')
      : f.lastSeen
        ? t('fr.seen', 'visto há {h} h', { h: Math.max(1, Math.round((Date.now() - f.lastSeen) / 3600_000)) })
        : t('fr.offline', 'offline');
    const row = person(f, `${f.name} · ${ago}`);
    const inv = btn(t('fr.invite', 'Convidar'), 'party', f.online ? 'violet' : 'ghost');
    inv.onclick = (e) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      popMenu(r.left + r.width / 2, r.bottom + 4, inviteOptions(f));
    };
    const visit = btn(t('fr.visit', 'Visitar casa'), 'home', 'ghost');
    visit.onclick = () => {
      ctx.close();
      void openHomeAt({ visit: f.id });
    };
    row.querySelector('.fr-acts')!.append(
      inv,
      visit,
      moreBtn(() => [
        { label: t('fr.profile', 'Ver perfil'), icon: 'user', run: () => openProfile(f.id, { name: f.name, skin: f.skin }) },
        { label: t('fr.remove', 'Desfazer amizade'), icon: 'close', run: async () => {
          if (await homeApi.removeFriend(f.id)) renderLists();
          else toast(t('friends.offline', 'Sem conexão. Tente de novo.'), 'refresh');
        } },
        { label: t('fr.block', 'Bloquear'), icon: 'lock', danger: true, run: () => void blockById(f).then(() => refreshFriendsNow()).then(renderLists) },
        { label: t('fr.report', 'Denunciar'), icon: 'warning', danger: true, run: () => reportMenu({ id: f.id, name: f.name }) },
      ]),
    );
    return row;
  };

  const inviteOptions = (f: FriendInfo): Parameters<typeof popMenu>[2] => {
    const send = async (kind: InviteKind, game?: string) => {
      const r = (await homeApi.invite?.(f.id, kind, game)) ?? 'network';
      const msg = {
        sent: t('fr.inv.sent', 'Convite enviado para @{h}!', { h: f.handle }),
        wait: t('fr.inv.wait', 'Você acabou de convidar. Espere um pouquinho.'),
        not_friend: t('fr.inv.nf', 'Vocês precisam ser amigos.'),
        network: t('friends.offline', 'Sem conexão. Tente de novo.'),
      }[r];
      toast(msg, r === 'sent' ? 'party' : 'warning');
      return r === 'sent';
    };
    const items: Parameters<typeof popMenu>[2] = [
      { label: t('fr.inv.o.squad', 'Chamar para o grupo'), icon: 'user', run: () => void import('../party/panel').then((p) => p.inviteFriendToSquad(f.id, f.handle)) },
      { label: t('fr.inv.o.party', 'Festa na minha casa'), icon: 'party', run: async () => {
        if (await send('party')) {
          ctx.close();
          void openHomeAt({ party: getPlayer()?.id ?? '' });
        }
      } },
      { label: t('fr.inv.o.house', 'Visitar minha casa'), icon: 'home', run: () => void send('house') },
    ];
    for (const extra of inviteProviders) items.push(...extra(f));
    return items;
  };

  renderLists();
  void refreshFriendsNow().then(() => {
    if (!ctx.alive()) return;
    renderMine();
    renderLists();
  });
  if (prefill) {
    inp.value = prefill.replace(/^@+/, '');
    prefill = '';
    void runSearch();
  }
}

/** Outros módulos (ex.: grupo/party) acrescentam opções no "Convidar" de cada amigo. */
type InviteProvider = (f: FriendInfo) => Parameters<typeof popMenu>[2];
const inviteProviders: InviteProvider[] = [];
export function addInviteOption(p: InviteProvider): void {
  inviteProviders.push(p);
}

/** Usado pela lista do perfil antigo: mantém "social.friends" coerente. */
export const friendCount = (): number => social.friends.length;
