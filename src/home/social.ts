/* ============================================================
 *  @nome, amigos (lista/pedidos/adicionar) e permissões da casa.
 * ============================================================ */
import type { FriendInfo, HomeAccess, HomeDesign, HomeRole } from './api';
import { t } from '../i18n';
import { esc } from '../ui/dom';
import { hicon } from './icons';
import { getApi, DEFAULT_ACCESS, netState } from './service';
import { planetSceneCanvas } from './render-planet';
import { normalizeDesign } from './catalog';
import { drawPlayer, type PlayerPose } from '../game/character';
import { SKINS } from '../game/skins';
import { drawAvatar, type AvatarData } from '../game/avatar';
import { hsfx } from './sfx';

export interface SocialUi {
  sheet: HTMLElement;
  toast(msg: string): void;
  close(): void;
  visit(f: FriendInfo): void;
  party(f: FriendInfo): void;
}

function open(ui: SocialUi, html: string): HTMLElement {
  // todo painel tem um X (nunca fica uma janela sem saída)
  ui.sheet.innerHTML = `<div class="hm-card"><button class="hm-x" aria-label="${esc(t('home.close', 'Fechar'))}">${hicon('close', 20)}</button>${html}</div>`;
  (ui.sheet.querySelector('.hm-x') as HTMLElement).onclick = () => {
    hsfx.click();
    ui.close();
  };
  ui.sheet.classList.add('on');
  ui.sheet.onclick = (e) => {
    if (e.target === ui.sheet) ui.close();
  };
  return ui.sheet.firstElementChild as HTMLElement;
}

const pose: PlayerPose = { t: 0, blink: 0, lookX: 0.2, lookY: 0, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };
export function drawFace(cv: HTMLCanvasElement, skin: string, avatar?: unknown): void {
  const d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = 48 * d;
  const c = cv.getContext('2d')!;
  c.scale(d, d);
  c.translate(24, 27);
  if (skin === 'custom' && avatar) drawAvatar(c, avatar as AvatarData, 15, pose);
  else drawPlayer(c, SKINS.find((s) => s.id === skin && s.id !== 'custom') ?? SKINS[0], 15, pose);
}

/* ============================================================
 *  ESCOLHA SEU @
 * ============================================================ */
export function openHandle(ui: SocialUi, opts: { first: boolean; done: (h: string | null) => void }): void {
  const card = open(
    ui,
    `<h2>${hicon('key', 30)} ${esc(opts.first ? t('home.handle.title', 'Escolha seu @') : t('home.handle.edit', 'Mudar seu @'))}</h2>
    <p>${esc(t('home.handle.why', 'É assim que seus amigos vão te achar para visitar sua casa e fazer festas.'))}</p>
    <label class="hm-handle"><b>@</b><input maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${esc(t('home.handle.ph', 'seu_nome'))}" /></label>
    <div class="hm-status"></div>
    <div class="hm-row wrap hm-sugs"></div>
    <div class="hm-rules"><ul>
      <li>${esc(t('home.handle.r1', 'De 3 a 16 letras: a-z, números, _ e .'))}</li>
      <li>${esc(t('home.handle.r2', 'Não use seu nome completo, telefone, escola ou endereço.'))}</li>
      <li>${esc(t('home.handle.r3', 'Invente algo divertido: bicho + cor, comida + número...'))}</li>
      <li>${esc(t('home.handle.r4', 'Palavras feias são bloqueadas.'))}</li>
    </ul></div>
    <div class="hm-row"><button class="hm-btn hm-later">${esc(opts.first ? t('home.handle.later', 'Agora não') : t('home.cancel', 'Cancelar'))}</button><span class="grow"></span><button class="hm-btn hm-go hm-claim" disabled>${hicon('check', 20)} ${esc(t('home.handle.claim', 'Quero esse!'))}</button></div>`,
  );
  const inp = card.querySelector('input') as HTMLInputElement;
  const box = card.querySelector('.hm-handle') as HTMLElement;
  const st = card.querySelector('.hm-status') as HTMLElement;
  const sugs = card.querySelector('.hm-sugs') as HTMLElement;
  const claim = card.querySelector('.hm-claim') as HTMLButtonElement;
  let timer = 0;
  let seq = 0;
  const setState = (k: '' | 'ok' | 'bad' | 'wait', msg: string) => {
    box.className = 'hm-handle' + (k === 'ok' ? ' ok' : k === 'bad' ? ' bad' : '');
    st.className = 'hm-status' + (k === 'ok' ? ' ok' : k === 'bad' ? ' bad' : '');
    st.innerHTML = (k === 'ok' ? hicon('check', 18) : k === 'bad' ? hicon('close', 16) : '') + esc(msg);
    claim.disabled = k !== 'ok';
  };
  const showSugs = (list: string[]) => {
    sugs.innerHTML = list.map((s) => `<button class="hm-chip" data-s="${esc(s)}">@${esc(s)}</button>`).join('');
  };
  const run = async () => {
    const v = inp.value.trim().toLowerCase();
    const my = ++seq;
    if (!v) return setState('', '');
    if (!/^[a-z0-9_.]*$/.test(v)) return setState('bad', t('home.handle.chars', 'Só letras sem acento, números, _ e .'));
    if (v.length < 3) return setState('', t('home.handle.short', 'Mais um pouquinho... (mínimo 3)'));
    setState('wait', t('home.handle.checking', 'Vendo se está livre...'));
    const api = await getApi();
    const r = await api.checkHandle(v);
    if (my !== seq) return;
    if (r.ok) {
      setState('ok', t('home.handle.free', '@{h} está livre!', { h: v }));
      showSugs([]);
    } else {
      const msg =
        r.reason === 'taken' ? t('home.handle.taken', 'Ops, @{h} já tem dono.', { h: v }) :
        r.reason === 'blocked' ? t('home.handle.blocked', 'Esse não pode. Tente outro!') :
        r.reason === 'network' ? t('home.handle.net2', 'Sem internet agora. Escolha seu @ depois — sua casa funciona offline!') :
        t('home.handle.invalid', 'Esse formato não vale.');
      setState('bad', msg);
      showSugs(r.suggestions ?? []);
    }
  };
  inp.addEventListener('input', () => {
    const clean = inp.value.toLowerCase().replace(/\s/g, '_').replace(/^@/, '');
    if (clean !== inp.value) inp.value = clean;
    clearTimeout(timer);
    timer = window.setTimeout(run, 380);
  });
  sugs.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-s]') as HTMLElement | null;
    if (!b) return;
    inp.value = b.dataset.s!;
    hsfx.click();
    run();
  });
  card.querySelector('.hm-later')!.addEventListener('click', () => {
    ui.close();
    opts.done(null);
  });
  claim.addEventListener('click', async () => {
    claim.disabled = true;
    const api = await getApi();
    const r = await api.claimHandle(inp.value.trim().toLowerCase());
    if (r.ok) {
      hsfx.done();
      ui.toast(t('home.handle.yours', 'Agora você é @{h}!', { h: inp.value.trim() }));
      ui.close();
      opts.done(inp.value.trim().toLowerCase());
    } else run();
  });
  getApi().then((a) => {
    const h = a.myHandle();
    if (h && !opts.first) {
      inp.value = h;
    }
  });
  setTimeout(() => inp.focus(), 250);
}

/* ============================================================
 *  AMIGOS
 * ============================================================ */
let tab: 'list' | 'req' | 'add' = 'list';
export async function openFriends(ui: SocialUi, myHandle: string | null, editHandle: () => void, botParty?: () => void): Promise<void> {
  const api = await getApi();
  const offlineBox = (msg: string) =>
    `<div class="hm-empty">${hicon('friends', 30)}<br>${esc(msg)}</div>${botParty ? `<div class="hm-row" style="justify-content:center"><button class="hm-btn hm-pink hm-botparty">${hicon('party', 18)} ${esc(t('home.friends.botparty', 'Festa com amigos-robô'))}</button></div>` : ''}`;
  const wireBot = (el: HTMLElement) => el.querySelector('.hm-botparty')?.addEventListener('click', () => botParty?.());
  const card = open(
    ui,
    `<h2>${hicon('friends', 30)} ${esc(t('home.friends.title', 'Amigos'))}</h2>
     <div class="hm-row"><small style="flex:1">${esc(t('home.friends.you', 'Seu @:'))} <b>${myHandle ? '@' + esc(myHandle) : '—'}</b></small><button class="hm-btn hm-edit" style="padding:4px 10px;font-size:13px">${esc(myHandle ? t('home.friends.change', 'Mudar') : t('home.friends.pick', 'Escolher @'))}</button></div>
     <div class="hm-tabs"><button data-t="list">${esc(t('home.friends.tab.list', 'Amigos'))}</button><button data-t="req">${esc(t('home.friends.tab.req', 'Pedidos'))}<b class="badge" hidden></b></button><button data-t="add">${esc(t('home.friends.tab.add', 'Adicionar'))}</button></div>
     <div class="hm-fbody"></div>`,
  );
  card.querySelector('.hm-edit')!.addEventListener('click', editHandle);
  const body = card.querySelector('.hm-fbody') as HTMLElement;
  const badge = card.querySelector('.badge') as HTMLElement;
  api.requests().then((r) => {
    badge.hidden = !r.length;
    badge.textContent = String(r.length);
  });
  const render = async () => {
    card.querySelectorAll('.hm-tabs button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === tab));
    body.innerHTML = `<div class="hm-empty">${esc(t('home.loading', 'Carregando...'))}</div>`;
    if (tab === 'list') {
      const list = (await api.friends()).slice();
      list.sort((a, b) => Number(b.online) - Number(a.online) || b.houseMess - a.houseMess);
      if (!list.length) {
        body.innerHTML =
          netState() === 'offline'
            ? offlineBox(t('home.friends.offline', 'Sem internet agora. Seus amigos aparecem aqui quando a conexão voltar. Enquanto isso, que tal uma festa com robôs?'))
            : !myHandle
              ? offlineBox(t('home.friends.nohandle', 'Escolha seu @ (botão acima) para seus amigos te acharem. Ou faça uma festa com robôs!'))
              : `<div class="hm-empty">${esc(t('home.friends.none', 'Você ainda não tem amigos aqui. Adicione pelo @!'))}</div>`;
        wireBot(body);
        return;
      }
      body.innerHTML = '';
      for (const f of list) body.appendChild(friendRow(ui, f));
    } else if (tab === 'req') {
      const reqs = await api.requests();
      badge.hidden = !reqs.length;
      badge.textContent = String(reqs.length);
      if (!reqs.length) {
        body.innerHTML = netState() === 'offline' ? offlineBox(t('home.friends.offline2', 'Sem internet agora. Os pedidos aparecem quando a conexão voltar.')) : `<div class="hm-empty">${esc(t('home.friends.noreq', 'Nenhum pedido agora.'))}</div>`;
        wireBot(body);
        return;
      }
      body.innerHTML = '';
      for (const r of reqs) {
        const row = document.createElement('div');
        row.className = 'hm-friend';
        row.innerHTML = `<div class="av-wrap"><canvas class="av"></canvas></div><div class="who"><b>${esc(r.from.name)}</b><small>@${esc(r.from.handle)}</small></div>
          <div class="acts"><button class="hm-btn hm-go" data-a="1">${hicon('check', 16)} ${esc(t('home.friends.accept', 'Aceitar'))}</button><button class="hm-btn" data-a="0">${esc(t('home.friends.decline', 'Recusar'))}</button></div>`;
        drawFace(row.querySelector('canvas')!, r.from.skin, r.from.avatar);
        row.querySelectorAll('[data-a]').forEach((b) =>
          b.addEventListener('click', async () => {
            const acc = (b as HTMLElement).dataset.a === '1';
            await api.respond(r.from.id, acc);
            if (acc) {
              hsfx.done();
              ui.toast(t('home.friends.nowfriends', 'Você e @{h} agora são amigos!', { h: r.from.handle }));
            }
            render();
          }),
        );
        body.appendChild(row);
      }
    } else {
      body.innerHTML = `<p>${esc(t('home.friends.addhint2', 'Digite o @ do seu amigo (aparecem os parecidos):'))}</p>
        <label class="hm-handle"><b>@</b><input maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
        <div class="hm-row" style="margin-top:8px"><span class="grow"></span><button class="hm-btn hm-blue hm-find">${hicon('search', 18)} ${esc(t('home.friends.search', 'Procurar'))}</button></div>
        <div class="hm-found" style="margin-top:10px"></div>
        <p style="font-size:12px;opacity:.8">${esc(t('home.friends.safe', 'Só adicione quem você conhece de verdade. Na festa ninguém escreve: só emotes!'))}</p>`;
      const inp = body.querySelector('input') as HTMLInputElement;
      const found = body.querySelector('.hm-found') as HTMLElement;
      let seq = 0;
      let timer = 0;
      const addRow = (f: { handle: string; name: string; skin: string; avatar?: unknown; online?: boolean; rel?: string | null }) => {
        const row = document.createElement('div');
        row.className = 'hm-friend';
        const done = f.rel === 'friend' || f.rel === 'sent';
        row.innerHTML = `<div class="av-wrap"><canvas class="av"></canvas>${f.online !== undefined ? `<i class="hm-dot ${f.online ? 'on' : ''}"></i>` : ''}</div><div class="who"><b>@${esc(f.handle)}</b><small>${esc(f.name)}</small></div><div class="acts"><button class="hm-btn hm-go" ${done ? 'disabled' : ''}>${hicon(done ? 'check' : 'plus', 16)} ${esc(f.rel === 'friend' ? t('fr.isfriend', 'Amigo') : f.rel === 'sent' ? t('fr.sent', 'Enviado') : t('home.friends.add', 'Adicionar'))}</button></div>`;
        drawFace(row.querySelector('canvas')!, f.skin, f.avatar);
        row.querySelector('button')!.addEventListener('click', async (e) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.disabled = true;
          const r = await api.addFriend('@' + f.handle);
          const msg =
            r === 'sent' ? t('home.friends.sent', 'Pedido enviado para @{h}!', { h: f.handle }) :
            r === 'already' ? t('home.friends.already', 'Vocês já são amigos!') :
            r === 'limit' ? t('home.friends.limit', 'Sua lista de amigos está cheia.') :
            r === 'not_found' ? t('home.friends.notfound2', 'Não encontrado.') : t('home.friends.net', 'Sem internet. Tente depois.');
          ui.toast(msg);
          if (r === 'sent') hsfx.done();
          else if (r !== 'already') b.disabled = false;
        });
        found.appendChild(row);
      };
      // busca enquanto digita (prefixo + parecidos); sem a busca no servidor, cai no @ exato
      const go = async () => {
        const h = inp.value.trim().toLowerCase().replace(/^@/, '');
        const my = ++seq;
        if (h.length < 2) return void (found.innerHTML = '');
        found.innerHTML = `<div class="hm-empty">${esc(t('home.friends.searching', 'Procurando...'))}</div>`;
        const hits = api.searchHandles ? await api.searchHandles(h) : null;
        if (my !== seq) return;
        if (Array.isArray(hits) && hits.length) {
          found.innerHTML = '';
          hits.forEach(addRow);
          return;
        }
        const f = h.length >= 3 && !Array.isArray(hits) ? await api.searchPlayer(h) : null;
        if (my !== seq) return;
        if (!f) {
          found.innerHTML =
            hits === 'rate' ? `<div class="hm-empty">${esc(t('fr.search.rate', 'Calma! Muitas buscas seguidas. Espere um pouquinho.'))}</div>` :
            netState() === 'offline' ? `<div class="hm-empty">${esc(t('home.friends.net', 'Sem internet. Tente depois.'))}</div>` : `<div class="hm-empty">${esc(t('home.friends.notfound', 'Ninguém com @{h}. Confira as letras!', { h }))}</div>`;
          return;
        }
        found.innerHTML = '';
        addRow(f);
      };
      body.querySelector('.hm-find')!.addEventListener('click', go);
      inp.addEventListener('keydown', (e) => e.key === 'Enter' && go());
      inp.addEventListener('input', () => {
        clearTimeout(timer);
        timer = window.setTimeout(go, 260);
      });
      inp.addEventListener('input', () => (inp.value = inp.value.toLowerCase().replace(/\s/g, '')));
    }
  };
  card.querySelectorAll('.hm-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = (b as HTMLElement).dataset.t as typeof tab;
      hsfx.click();
      render();
    }),
  );
  render();
}

function friendRow(ui: SocialUi, f: FriendInfo): HTMLElement {
  const row = document.createElement('div');
  row.className = 'hm-friend';
  const ago = f.online ? t('home.friends.online', 'online agora') : t('home.friends.away', 'visto há {h} h', { h: Math.max(1, Math.round((Date.now() - f.lastSeen) / 3600_000)) });
  row.innerHTML = `<div class="av-wrap"><canvas class="av"></canvas><i class="hm-dot ${f.online ? 'on' : ''}"></i></div>
    <div class="who"><b>${esc(f.name)}</b><small>@${esc(f.handle)} · ${esc(ago)}</small>
    ${f.houseMess > 0.15 ? `<div class="hm-messbar">${hicon('sponge', 16)} ${esc(t('home.friends.mess', 'A casa de @{h} está uma bagunça! Ajude a limpar', { h: f.handle }))}</div>` : ''}</div>
    <canvas class="th"></canvas>
    <div class="acts"><button class="hm-btn hm-blue" data-a="v">${hicon('house', 16)} ${esc(t('home.friends.visit', 'Visitar casa'))}</button><button class="hm-btn hm-pink" data-a="p">${hicon('party', 16)} ${esc(t('home.friends.party', 'Festa'))}</button></div>`;
  drawFace(row.querySelector('canvas.av')!, f.skin, f.avatar);
  const th = row.querySelector('canvas.th') as HTMLCanvasElement;
  th.width = th.height = 108;
  getApi()
    .then((a) => a.getHome(f.id))
    .then((h) => {
      if (!h) return;
      const src = planetSceneCanvas(normalizeDesign(h.design), 108, 108, { R: 34, cy: 62, name: f.handle, mess: Math.min(1, h.mess.length / 14) });
      th.getContext('2d')!.drawImage(src, 0, 0);
    });
  row.querySelector('[data-a="v"]')!.addEventListener('click', () => ui.visit(f));
  row.querySelector('[data-a="p"]')!.addEventListener('click', () => ui.party(f));
  return row;
}

/* ============================================================
 *  PERMISSÕES
 * ============================================================ */
const ROLES: HomeRole[] = ['view', 'clean', 'decorate', 'build'];
export const roleName = (r: HomeRole): string =>
  r === 'view' ? t('home.role.view', 'Só visitar') : r === 'clean' ? t('home.role.clean', 'Limpar') : r === 'decorate' ? t('home.role.decorate', 'Decorar') : t('home.role.build', 'Construir');

export async function openPermissions(ui: SocialUi, design: HomeDesign, onSave: (a: HomeAccess) => void): Promise<void> {
  const api = await getApi();
  const acc: HomeAccess = JSON.parse(JSON.stringify(design.access ?? DEFAULT_ACCESS));
  const seg = (cur: HomeRole, attr: string) => `<div class="hm-seg" ${attr}>${ROLES.map((r) => `<button data-r="${r}" class="${r === cur ? 'on' : ''}">${esc(roleName(r))}</button>`).join('')}</div>`;
  const card = open(
    ui,
    `<h2>${hicon('lock', 28)} ${esc(t('home.perm.title', 'Permissões da casa'))}</h2>
     <p>${esc(t('home.perm.desc', 'Escolha o que cada amigo pode fazer quando visitar sua casa.'))}</p>
     <div class="hm-row"><b style="flex:1">${esc(t('home.perm.visits', 'Visitas'))}</b><div class="hm-seg hm-vis"><button data-v="friends" class="${acc.visits === 'friends' ? 'on' : ''}">${esc(t('home.perm.friends', 'Amigos'))}</button><button data-v="nobody" class="${acc.visits === 'nobody' ? 'on' : ''}">${esc(t('home.perm.nobody', 'Ninguém'))}</button></div></div>
     <p class="hm-lbl">${esc(t('home.perm.default', 'Padrão para todos os amigos'))}</p>${seg(acc.defaultRole, 'data-def')}
     <p class="hm-lbl" style="margin-top:10px">${esc(t('home.perm.each', 'Por amigo'))}</p><div class="hm-plist"><div class="hm-empty">${esc(t('home.loading', 'Carregando...'))}</div></div>
     <ul class="hm-rules" style="list-style:none;padding:8px 10px">
       <li><b>${esc(roleName('view'))}:</b> ${esc(t('home.perm.h.view', 'entra, come bolo e faz festa'))}</li>
       <li><b>${esc(roleName('clean'))}:</b> ${esc(t('home.perm.h.clean', 'também ajuda a limpar a bagunça'))}</li>
       <li><b>${esc(roleName('decorate'))}:</b> ${esc(t('home.perm.h.decorate', 'também mexe nos móveis e pinta paredes'))}</li>
       <li><b>${esc(roleName('build'))}:</b> ${esc(t('home.perm.h.build', 'também muda a casa e o planeta'))}</li></ul>
     <div class="hm-row"><span class="grow"></span><button class="hm-btn hm-go hm-psave">${hicon('save', 18)} ${esc(t('home.save', 'Salvar'))}</button></div>`,
  );
  const wire = (root: Element, fn: (r: HomeRole) => void) =>
    root.querySelectorAll('[data-r]').forEach((b) =>
      b.addEventListener('click', () => {
        root.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b));
        hsfx.click();
        fn((b as HTMLElement).dataset.r as HomeRole);
      }),
    );
  wire(card.querySelector('[data-def]')!, (r) => (acc.defaultRole = r));
  card.querySelectorAll('.hm-vis [data-v]').forEach((b) =>
    b.addEventListener('click', () => {
      card.querySelectorAll('.hm-vis [data-v]').forEach((x) => x.classList.toggle('on', x === b));
      acc.visits = (b as HTMLElement).dataset.v as HomeAccess['visits'];
    }),
  );
  const list = card.querySelector('.hm-plist') as HTMLElement;
  const fr = await api.friends();
  list.innerHTML = fr.length ? '' : `<div class="hm-empty">${esc(t('home.friends.none', 'Você ainda não tem amigos aqui. Adicione pelo @!'))}</div>`;
  for (const f of fr) {
    const row = document.createElement('div');
    row.className = 'hm-friend';
    row.style.flexWrap = 'wrap';
    row.innerHTML = `<div class="av-wrap"><canvas class="av"></canvas></div><div class="who"><b>${esc(f.name)}</b><small>@${esc(f.handle)}</small></div>${seg(acc.roles[f.id] ?? acc.defaultRole, '')}`;
    drawFace(row.querySelector('canvas')!, f.skin, f.avatar);
    wire(row.querySelector('.hm-seg')!, (r) => (acc.roles[f.id] = r));
    list.appendChild(row);
  }
  card.querySelector('.hm-psave')!.addEventListener('click', () => {
    onSave(acc);
    hsfx.done();
    ui.close();
  });
}
