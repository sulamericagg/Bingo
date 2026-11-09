/**
 * Painel SOCIAL: Chat (global + por jogo), Amigos e Ajustes do chat.
 * Chat kid-safe: filtro no servidor, denúncia, silenciar/bloquear local, modo seguro
 * (só atalhos rápidos — obrigatório para menores de 13), chat pode ser desligado.
 */
import { listGames } from '../hub/registry';
import { t } from '../i18n';
import { icon } from '../ui/icons';
import { getPlayer } from '../services/online';
import { tap } from '../core/haptics';
import { homeApi } from '../services/home';
import { api, me, wsUrl } from './net';
import { openProfile } from './profile';
import { emoteThumb, openSheet, popMenu, skinThumb, toast, type Sheet } from './sheet';
import { canTypeFree, isHidden, persistSocial, setAgeGroup, social, toggleList } from './store';

export const QUICK_PHRASES = ['oi', 'boa', 'gg', 'vamos', 'uau', 'joinha', 'rindo', 'coracao', 'obrigado', 'denovo', 'quase', 'tchau'] as const;
const QUICK_ICON: Record<string, string> = { obrigado: 'coracao', denovo: 'vamos', quase: 'uau', tchau: 'oi' };

export function quickLabel(code: string): string {
  const L: Record<string, () => string> = {
    oi: () => t('quick.oi', 'Oi, pessoal!'),
    boa: () => t('quick.boa', 'Mandou bem!'),
    gg: () => t('quick.gg', 'Boa partida!'),
    vamos: () => t('quick.vamos', 'Vamos jogar?'),
    uau: () => t('quick.uau', 'Uau!'),
    joinha: () => t('quick.joinha', 'Joinha!'),
    rindo: () => t('quick.rindo', 'Haha!'),
    coracao: () => t('quick.coracao', 'Amei!'),
    obrigado: () => t('quick.obrigado', 'Obrigado!'),
    denovo: () => t('quick.denovo', 'De novo?'),
    quase: () => t('quick.quase', 'Foi quase!'),
    tchau: () => t('quick.tchau', 'Tchau!'),
  };
  return L[code]?.() ?? code;
}

function reasonText(reason: string): string {
  switch (reason) {
    case 'pii':
      return t('chat.r.pii', 'Para sua segurança, não compartilhe contatos, links, endereços ou dados pessoais.');
    case 'bad':
      return t('chat.r.bad', 'Ops! Vamos manter o chat gentil para todo mundo.');
    case 'rate':
      return t('chat.r.rate', 'Calma! Espere um pouquinho antes de mandar outra mensagem.');
    case 'muted':
      return t('chat.r.muted', 'Você está silenciado no chat por um tempo.');
    case 'banned':
      return t('chat.r.banned', 'Seu acesso ao chat foi bloqueado.');
    case 'long':
      return t('chat.r.long', 'Mensagem muito longa (máx. 80 letras).');
  }
  return t('chat.r.generic', 'Não foi possível enviar.');
}

interface Msg {
  id: string;
  pid: string;
  name: string;
  skin: string;
  t: number;
  text?: string;
  q?: string;
}

type Tab = 'chat' | 'friends' | 'settings';
let state: { sheet: Sheet; tab: Tab; room: string; ws: WebSocket | null; list: HTMLDivElement | null; online: HTMLElement | null } | null = null;

export function openSocialPanel(tab: Tab = 'chat', room = 'global'): void {
  closeSocialPanel();
  const sheet = openSheet(t('social.title', 'Social'), 'user', { id: 'sc-social' });
  const tabs = document.createElement('div');
  tabs.className = 'sc-tabs';
  sheet.head.after(tabs);
  state = { sheet, tab, room, ws: null, list: null, online: null };
  sheet.onClose(() => {
    disconnect();
    state = null;
  });
  const T: [Tab, string][] = [
    ['chat', t('social.tab.chat', 'Chat')],
    ['friends', t('social.tab.friends', 'Amigos')],
    ['settings', t('social.tab.settings', 'Ajustes')],
  ];
  for (const [id, label] of T) {
    const b = document.createElement('button');
    b.className = 'sc-tab';
    b.textContent = label;
    b.dataset.tab = id;
    b.onclick = () => show(id);
    tabs.appendChild(b);
  }
  show(tab);
}

export function closeSocialPanel(): void {
  state?.sheet.close();
}

function show(tab: Tab): void {
  if (!state) return;
  state.tab = tab;
  state.sheet.root.querySelectorAll<HTMLElement>('.sc-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  state.sheet.sheet.querySelector('.sc-compose')?.remove();
  disconnect();
  if (tab === 'chat') showChat();
  else if (tab === 'friends') showFriends();
  else showSettings();
}

/* ---------------- chat ---------------- */

function showChat(): void {
  const s = state!;
  const body = s.sheet.body;
  body.innerHTML = '';
  if (social.ageGroup === null) return showAgeGate();
  if (!social.chatOn) {
    body.innerHTML = `<div class="sc-empty">${icon('lock', { size: 56 })}${t('chat.off', 'O chat está desligado.')}<br><br></div>`;
    const b = document.createElement('button');
    b.className = 'sc-btn';
    b.textContent = t('chat.turnon', 'Abrir ajustes');
    b.onclick = () => show('settings');
    body.firstElementChild!.appendChild(b);
    return;
  }
  // salas: global + jogos registrados
  const rooms = document.createElement('div');
  rooms.className = 'sc-tabs';
  rooms.style.padding = '0 0 8px';
  const games = listGames();
  const list: [string, string][] = [['global', t('chat.room.global', 'Geral')], ...games.map((g) => [`game-${g.id}`, g.name] as [string, string])];
  if (!games.length) list.push(['game-orbit', 'Bloop Orbit']);
  for (const [id, label] of list) {
    const b = document.createElement('button');
    b.className = 'sc-tab' + (id === s.room ? ' on' : '');
    b.textContent = label;
    b.onclick = () => {
      s.room = id;
      show('chat');
    };
    rooms.appendChild(b);
  }
  const online = document.createElement('div');
  online.className = 'sc-online';
  online.style.margin = '0 0 6px 2px';
  online.textContent = t('chat.connecting', 'Conectando...');
  const msgs = document.createElement('div');
  msgs.className = 'sc-chat';
  body.append(rooms, online, msgs);
  s.list = msgs;
  s.online = online;

  // compositor
  const comp = document.createElement('div');
  comp.className = 'sc-compose';
  const quick = document.createElement('div');
  quick.className = 'sc-quick-row';
  for (const code of QUICK_PHRASES) {
    const c = document.createElement('button');
    c.className = 'sc-chip';
    c.append(emoteThumb(QUICK_ICON[code] ?? code, 22), document.createTextNode(quickLabel(code)));
    c.onclick = () => sendRaw({ type: 'quick', code });
    quick.appendChild(c);
  }
  comp.appendChild(quick);
  if (canTypeFree()) {
    const row = document.createElement('form');
    row.className = 'sc-input-row';
    row.innerHTML = `<input class="sc-input" maxlength="80" autocomplete="off" enterkeyhint="send"><span class="sc-count">0/80</span><button class="sc-btn sm" type="submit" aria-label="${t('chat.send', 'Enviar')}">${icon('arrow-up', { size: 20 })}</button>`;
    const inp = row.querySelector('input')!;
    inp.placeholder = t('chat.placeholder', 'Escreva com gentileza...');
    const cnt = row.querySelector('.sc-count')!;
    inp.oninput = () => (cnt.textContent = `${[...inp.value].length}/80`);
    row.onsubmit = (e) => {
      e.preventDefault();
      const text = inp.value.trim();
      if (!text) return;
      if (sendRaw({ type: 'say', text })) {
        inp.value = '';
        cnt.textContent = '0/80';
      }
    };
    comp.appendChild(row);
  } else {
    const note = document.createElement('div');
    note.className = 'sc-note';
    note.style.margin = '0';
    note.textContent = t('chat.safenote', 'Modo seguro: converse usando os atalhos rápidos.');
    comp.appendChild(note);
  }
  s.sheet.sheet.appendChild(comp);
  connect(s.room);
}

function sys(text: string): void {
  const l = state?.list;
  if (!l) return;
  const d = document.createElement('div');
  d.className = 'sc-sys';
  d.textContent = text;
  l.appendChild(d);
  scrollEnd();
}

function scrollEnd(): void {
  const b = state?.sheet.body;
  if (b) b.scrollTop = b.scrollHeight;
}

function sendRaw(o: object): boolean {
  const ws = state?.ws;
  if (!ws || ws.readyState !== 1) {
    toast(t('chat.offline', 'Sem conexão com o chat agora.'), 'cloud-off');
    return false;
  }
  tap('light');
  ws.send(JSON.stringify(o));
  return true;
}

function disconnect(): void {
  const ws = state?.ws;
  if (state) state.ws = null;
  try {
    ws?.close(1000, 'bye');
  } catch {
    /* */
  }
}

async function connect(room: string): Promise<void> {
  const s = state;
  if (!s) return;
  const ident = await me().catch(() => null);
  if (state !== s || s.room !== room || s.tab !== 'chat') return;
  if (!ident?.id) {
    s.online!.textContent = t('chat.noid', 'Conecte-se à internet para usar o chat.');
    return;
  }
  let ws: WebSocket;
  try {
    ws = new WebSocket(wsUrl('/chat/' + room));
  } catch {
    s.online!.textContent = t('chat.offline', 'Sem conexão com o chat agora.');
    return;
  }
  s.ws = ws;
  ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', id: ident.id, name: ident.name, skin: ident.skin }));
  ws.onmessage = (ev) => {
    if (state?.ws !== ws) return;
    let m: any;
    try {
      m = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (m.type === 'hist') {
      s.list!.innerHTML = '';
      sys(t('chat.rules', 'Seja gentil. Nunca compartilhe telefone, endereço, escola ou redes sociais.'));
      for (const x of m.msgs) addMsg(x);
      setOnline(m.online);
    } else if (m.type === 'msg') addMsg(m.m);
    else if (m.type === 'online') setOnline(m.n);
    else if (m.type === 'del') for (const id of m.ids) s.list?.querySelector(`[data-id="${CSS.escape(id)}"]`)?.remove();
    else if (m.type === 'reject') {
      sys(reasonText(m.reason));
      if (m.reason === 'pii' || m.reason === 'bad') tap('medium');
    }
  };
  ws.onclose = () => {
    if (state?.ws === ws) {
      state.ws = null;
      if (s.online) s.online.textContent = t('chat.offline', 'Sem conexão com o chat agora.');
    }
  };
  ws.onerror = () => {};
}

function setOnline(n: number): void {
  if (state?.online) state.online.textContent = t('chat.online', '{n} online', { n });
}

function addMsg(m: Msg): void {
  const l = state?.list;
  if (!l || isHidden(m.pid)) return;
  if (!m.q && !canTypeFree()) return; // modo seguro: só atalhos
  const mine = m.pid === getPlayer()?.id;
  const row = document.createElement('div');
  row.className = 'sc-msg' + (mine ? ' mine' : '');
  row.dataset.id = m.id;
  row.dataset.pid = m.pid;
  const av = document.createElement('button');
  av.className = 'sc-av';
  av.setAttribute('aria-label', t('chat.viewprofile', 'Ver perfil'));
  av.appendChild(skinThumb(m.skin, 36));
  av.onclick = () => openProfile(m.pid, { name: m.name, skin: m.skin });
  const bub = document.createElement('div');
  bub.className = 'sc-bub';
  const nm = document.createElement('button');
  nm.className = 'sc-name';
  nm.textContent = m.name;
  nm.onclick = av.onclick;
  const tx = document.createElement('div');
  tx.className = 'sc-text';
  if (m.q) {
    tx.innerHTML = '<span class="sc-quick-tag"></span>';
    tx.firstElementChild!.append(emoteThumb(QUICK_ICON[m.q] ?? m.q, 24), document.createTextNode(quickLabel(m.q)));
  } else tx.textContent = m.text ?? '';
  bub.append(nm, tx);
  if (!mine) {
    const more = document.createElement('button');
    more.className = 'sc-more';
    more.textContent = '...';
    more.setAttribute('aria-label', t('chat.options', 'Opções'));
    more.onclick = (e) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      popMenu(r.left, r.bottom + 4, [
        { label: t('chat.m.profile', 'Ver perfil'), icon: 'user', run: () => openProfile(m.pid, { name: m.name, skin: m.skin }) },
        { label: t('chat.m.mute', 'Silenciar'), icon: 'sound', run: () => hideUser(m, 'muted') },
        { label: t('chat.m.block', 'Bloquear'), icon: 'lock', run: () => hideUser(m, 'blocked') },
        { label: t('chat.m.report', 'Denunciar'), icon: 'warning', danger: true, run: () => report(m) },
      ]);
    };
    bub.appendChild(more);
  }
  row.append(av, bub);
  l.appendChild(row);
  while (l.childElementCount > 80) l.firstElementChild!.remove();
  scrollEnd();
}

function hideUser(m: Msg, list: 'muted' | 'blocked'): void {
  toggleList(list, m.pid, true);
  state?.list?.querySelectorAll('.sc-msg').forEach((el) => {
    if ((el as HTMLElement).dataset.pid === m.pid) el.remove();
  });
  toast(list === 'muted' ? t('chat.muted', '{name} foi silenciado.', { name: m.name }) : t('chat.blocked', '{name} foi bloqueado.', { name: m.name }), list === 'muted' ? 'sound' : 'lock');
}

function report(m: Msg): void {
  const s = openSheet(t('report.title', 'Denunciar'), 'warning', { small: true, id: 'sc-report' });
  s.body.innerHTML = `<p class="sc-note" style="font-size:15px;margin-top:0"></p>`;
  (s.body.firstElementChild as HTMLElement).textContent = t('report.why', 'O que aconteceu com a mensagem de {name}?', { name: m.name });
  const reasons: [string, string][] = [
    ['ofensa', t('report.r.offense', 'Foi grosseiro ou ofensivo')],
    ['dados', t('report.r.personal', 'Pediu ou passou dados pessoais')],
    ['spam', t('report.r.spam', 'Spam ou propaganda')],
    ['outro', t('report.r.other', 'Outra coisa')],
  ];
  for (const [id, label] of reasons) {
    const b = document.createElement('button');
    b.className = 'sc-btn ghost wide';
    b.style.marginBottom = '8px';
    b.textContent = label;
    b.onclick = async () => {
      b.disabled = true;
      const reporter = getPlayer()?.id ?? '';
      try {
        await api('/chat/report', { reporter, pid: m.pid, name: m.name, text: m.text ?? quickLabel(m.q ?? ''), room: state?.room ?? 'global', msgId: m.id, reason: id });
        toast(t('report.thanks', 'Obrigado! Nossa equipe vai olhar. Você não verá mais esse jogador.'), 'check', 3500);
      } catch {
        toast(t('report.fail', 'Não deu para enviar agora, mas o jogador foi silenciado.'), 'cloud-off');
      }
      toggleList('muted', m.pid, true);
      s.close();
      if (state?.tab === 'chat') show('chat');
    };
    s.body.appendChild(b);
  }
}

function showAgeGate(): void {
  const body = state!.sheet.body;
  body.innerHTML = `<div class="sc-age">${icon('user', { size: 64 })}<h3></h3><p></p></div>`;
  body.querySelector('h3')!.textContent = t('age.title', 'Antes de conversar');
  body.querySelector('p')!.textContent = t('age.text', 'Quantos anos você tem? Menores de 13 anos usam o Modo seguro, só com atalhos rápidos.');
  const opts: ['under13' | 'teen', string][] = [
    ['under13', t('age.under13', 'Tenho menos de 13 anos')],
    ['teen', t('age.teen', 'Tenho 13 anos ou mais')],
  ];
  for (const [g, label] of opts) {
    const b = document.createElement('button');
    b.className = 'sc-btn wide ' + (g === 'teen' ? 'violet' : '');
    b.textContent = label;
    b.onclick = () => {
      setAgeGroup(g);
      show('chat');
    };
    body.firstElementChild!.appendChild(b);
  }
}

/* ---------------- amigos ---------------- */

let friendsSynced = 0;
function showFriends(): void {
  // lista do servidor (amigos de verdade); re-renderiza quando chegar
  if (Date.now() - friendsSynced > 30_000) {
    friendsSynced = Date.now();
    homeApi
      .friends()
      .then(() => {
        if (state?.tab === 'friends' && document.body.contains(state.sheet.body)) showFriends();
      })
      .catch(() => {});
  }
  const body = state!.sheet.body;
  body.innerHTML = '';
  const mine = document.createElement('button');
  mine.className = 'sc-btn violet wide';
  mine.style.marginBottom = '12px';
  mine.innerHTML = icon('user', { size: 22 }) + t('friends.myprofile', 'Meu perfil');
  mine.onclick = () => openProfile();
  body.appendChild(mine);
  if (!social.friends.length) {
    const e = document.createElement('div');
    e.className = 'sc-empty';
    e.innerHTML = icon('heart', { size: 56 });
    e.append(t('friends.empty2', 'Adicione amigos pelo @nome ou tocando em quem jogou com você.'));
    body.appendChild(e);
    return;
  }
  for (const f of social.friends) {
    const row = document.createElement('div');
    row.className = 'sc-row';
    const av = document.createElement('button');
    av.className = 'sc-av';
    av.appendChild(skinThumb(f.skin, 36));
    const lbl = document.createElement('div');
    lbl.className = 'lbl';
    lbl.textContent = f.name;
    const open = () => openProfile(f.id, { name: f.name, skin: f.skin });
    av.onclick = open;
    lbl.onclick = open;
    row.append(av, lbl);
    body.appendChild(row);
  }
}

/* ---------------- ajustes ---------------- */

function sw(label: string, sub: string, on: boolean, disabled: boolean, set: (v: boolean) => void): HTMLElement {
  const row = document.createElement('label');
  row.className = 'sc-row';
  row.innerHTML = `<div class="lbl"><span></span><small></small></div><span class="sc-switch"><input type="checkbox"><span></span></span>`;
  row.querySelector('.lbl > span')!.textContent = label;
  row.querySelector('small')!.textContent = sub;
  const inp = row.querySelector('input')!;
  inp.checked = on;
  inp.disabled = disabled;
  inp.onchange = () => set(inp.checked);
  return row;
}

function showSettings(): void {
  const body = state!.sheet.body;
  body.innerHTML = '';
  const kid = social.ageGroup === 'under13';
  body.append(
    sw(t('set.chat', 'Chat'), t('set.chat.sub', 'Mostrar e enviar mensagens.'), social.chatOn, false, (v) => {
      social.chatOn = v;
      persistSocial();
    }),
    sw(
      t('set.safe', 'Modo seguro'),
      kid ? t('set.safe.kid', 'Obrigatório para menores de 13 anos: só atalhos rápidos.') : t('set.safe.sub', 'Só atalhos rápidos, sem texto livre.'),
      social.safeMode || kid,
      kid,
      (v) => {
        social.safeMode = v;
        persistSocial();
      },
    ),
  );
  const n = social.muted.length + social.blocked.length;
  const row = document.createElement('div');
  row.className = 'sc-row';
  row.innerHTML = `<div class="lbl"><span></span><small></small></div>`;
  row.querySelector('.lbl > span')!.textContent = t('set.hidden', 'Silenciados e bloqueados');
  row.querySelector('small')!.textContent = t('set.hidden.n', '{n} jogador(es)', { n });
  if (n) {
    const b = document.createElement('button');
    b.className = 'sc-btn sm ghost';
    b.textContent = t('set.clear', 'Limpar');
    b.onclick = () => {
      social.muted = [];
      social.blocked = [];
      persistSocial();
      showSettings();
    };
    row.appendChild(b);
  }
  body.appendChild(row);
  const age = document.createElement('button');
  age.className = 'sc-btn sm ghost';
  age.textContent = t('set.age', 'Mudar faixa de idade');
  age.onclick = () => {
    social.ageGroup = null;
    persistSocial();
    show('chat');
  };
  const note = document.createElement('p');
  note.className = 'sc-note';
  note.textContent = t('set.note', 'Mensagens passam por um filtro automático. Telefones, e-mails, links, endereços e redes sociais são bloqueados. Denúncias são vistas pela equipe.');
  body.append(age, note);
}
