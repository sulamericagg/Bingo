/**
 * PAINEL DO GRUPO: membros (pronto, líder, remover/tornar líder), convidar amigos, link/QR do grupo,
 * festa na casa do líder, chat do grupo (filtro do servidor; menores de 13 / modo seguro: só atalhos) e sair.
 */
import { bus } from '../core/events';
import { t } from '../i18n';
import { icon } from '../ui/icons';
import { getPlayer } from '../services/online';
import { cachedSocial, refreshFriendsNow } from '../services/home';
import { openSheet, popMenu, skinThumb, toast, type Sheet } from '../social/sheet';
import { canTypeFree, social } from '../social/store';
import { QUICK_PHRASES } from '../social/chat-ui';
import { msgText } from './lobby';
import {
  chatLog,
  createSquad,
  inviteToSquad,
  isLeader,
  kick,
  launchHouseParty,
  leaveSquad,
  promote,
  sayQuick,
  sayText,
  setReady,
  squad,
  squadLink,
  type SquadMsg,
} from './squad';

let sheet: Sheet | null = null;

function btn(label: string, ic: Parameters<typeof icon>[0] | null, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'sc-btn sm ' + cls;
  b.innerHTML = (ic ? icon(ic, { size: 18 }) : '') + '<span></span>';
  (b.lastElementChild as HTMLElement).textContent = label;
  return b;
}
function sec(title: string): HTMLElement {
  const h = document.createElement('div');
  h.className = 'fr-sec';
  h.textContent = title;
  return h;
}

export function openSquadPanel(focus: 'invite' | 'chat' = 'invite'): void {
  sheet?.close();
  const s = openSheet(t('sq.title', 'Grupo'), 'party', { id: 'sq-panel' });
  sheet = s;
  const offs = [bus.on('squad', () => draw()), bus.on('squad-chat', () => drawChat())];
  s.onClose(() => {
    offs.forEach((o) => o());
    if (sheet === s) sheet = null;
  });
  let chatBox: HTMLElement | null = null;

  const draw = (): void => {
    const v = squad();
    const myId = getPlayer()?.id ?? '';
    s.body.innerHTML = '';
    if (!v) {
      const p = document.createElement('p');
      p.className = 'sq-hint';
      p.textContent = t('sq.intro', 'Monte um grupo de até 4 amigos: vocês aparecem juntos no saguão, conversam e entram no mesmo jogo quando o líder aperta JOGAR.');
      const c = btn(t('sq.create', 'Criar grupo'), 'party', 'violet wide');
      c.onclick = async () => {
        c.disabled = true;
        if (!(await createSquad())) {
          c.disabled = false;
          toast(t('friends.offline', 'Sem conexão. Tente de novo.'), 'refresh');
        }
      };
      // entrar num grupo pelo QR do amigo
      const sc = btn(t('scan.title', 'Escanear'), 'camera', 'ghost wide');
      sc.onclick = () => void scanGroup();
      s.body.append(p, c, sc);
      inviteList(s.body, null);
      return;
    }
    // membros
    const mem = document.createElement('div');
    mem.className = 'sq-members';
    for (const m of v.members) {
      const el = document.createElement('button');
      el.className = 'sq-m sc-av' + (m.on ? '' : ' off');
      el.style.background = 'none';
      el.appendChild(skinThumb(m.skin, 48, m.avatar));
      const b = document.createElement('b');
      b.textContent = m.id === myId ? t('sq.you', 'Você') : m.handle ? '@' + m.handle : m.name;
      el.appendChild(b);
      if (v.leader === m.id) el.insertAdjacentHTML('beforeend', '<i class="pl-crown">♛</i>');
      if (m.ready) el.insertAdjacentHTML('beforeend', '<i class="pl-ok">✓</i>');
      if (m.id !== myId && isLeader())
        el.onclick = () => {
          const r = el.getBoundingClientRect();
          popMenu(r.left + r.width / 2, r.bottom, [
            { label: t('sq.promote', 'Tornar líder'), icon: 'crown', run: () => promote(m.id) },
            { label: t('sq.kick', 'Tirar do grupo'), icon: 'close', danger: true, run: () => kick(m.id) },
          ]);
        };
      mem.appendChild(el);
    }
    s.body.appendChild(mem);
    // ações
    const acts = document.createElement('div');
    acts.className = 'sq-acts';
    const meM = v.members.find((m) => m.id === myId);
    const rd = btn(meM?.ready ? t('sq.ready', 'Pronto!') : t('sq.setready', 'Pronto?'), 'check', meM?.ready ? 'green' : 'ghost');
    rd.onclick = () => setReady(!meM?.ready);
    acts.appendChild(rd);
    if (isLeader()) {
      const hp = btn(t('sq.houseparty', 'Festa na minha casa'), 'party', 'violet');
      hp.onclick = () => {
        s.close();
        void launchHouseParty();
      };
      acts.appendChild(hp);
    }
    const link = btn(t('sq.link', 'Link/QR do grupo'), 'link', 'ghost');
    link.onclick = () => void openGroupQr();
    const out = btn(t('sq.leave', 'Sair do grupo'), 'close', 'ghost');
    out.onclick = () => {
      leaveSquad();
      s.close();
    };
    acts.append(link, out);
    s.body.appendChild(acts);
    const hint = document.createElement('p');
    hint.className = 'sq-hint';
    hint.textContent = isLeader()
      ? t('sq.hint.leader', 'Você é o líder: escolha um jogo e aperte JOGAR — o grupo entra junto.')
      : t('sq.hint.member', 'Quando o líder apertar JOGAR, você entra no mesmo jogo.');
    s.body.appendChild(hint);
    // chat
    s.body.appendChild(sec(t('sq.chat', 'Chat do grupo')));
    chatBox = document.createElement('div');
    chatBox.className = 'sq-chat';
    s.body.appendChild(chatBox);
    drawChat();
    const quick = document.createElement('div');
    quick.className = 'sq-quick';
    for (const q of QUICK_PHRASES) {
      const b = document.createElement('button');
      b.textContent = msgText({ id: '', from: '', name: '', q, at: 0 });
      b.onclick = () => sayQuick(q);
      quick.appendChild(b);
    }
    s.body.appendChild(quick);
    if (canTypeFree()) {
      const say = document.createElement('form');
      say.className = 'sq-say';
      say.innerHTML = `<input maxlength="80" autocomplete="off" enterkeyhint="send" />`;
      const inp = say.querySelector('input')!;
      inp.placeholder = t('sq.say', 'Mensagem para o grupo');
      const go = btn(t('sq.send', 'Enviar'), null, 'violet');
      say.appendChild(go);
      say.onsubmit = (e) => {
        e.preventDefault();
        const txt = inp.value.trim();
        if (!txt) return;
        sayText(txt);
        inp.value = '';
      };
      s.body.appendChild(say);
      if (focus === 'chat') setTimeout(() => inp.focus(), 200);
    } else {
      const n = document.createElement('p');
      n.className = 'sc-note';
      n.textContent = t('sq.safechat', 'Modo seguro: no grupo você conversa com os atalhos acima.');
      s.body.appendChild(n);
    }
    if (v.members.length < 4) inviteList(s.body, v.members.map((m) => m.id));
    if (focus === 'chat') chatBox.scrollIntoView({ block: 'center' });
  };

  const drawChat = (): void => {
    if (!chatBox) return;
    const myId = getPlayer()?.id ?? '';
    chatBox.innerHTML = '';
    if (!chatLog.length) {
      const e = document.createElement('div');
      e.className = 'sq-hint';
      e.textContent = t('sq.chat.empty', 'Diga oi para o grupo!');
      chatBox.appendChild(e);
    }
    for (const m of chatLog) chatBox.appendChild(line(m, myId));
    chatBox.scrollTop = chatBox.scrollHeight;
  };
  const line = (m: SquadMsg, myId: string): HTMLElement => {
    const el = document.createElement('div');
    el.className = 'sq-msg' + (m.from === myId ? ' mine' : '');
    const b = document.createElement('b');
    b.textContent = m.name + ':';
    el.append(b, document.createTextNode(msgText(m)));
    if (m.from !== myId)
      b.onclick = () => {
        const r = b.getBoundingClientRect();
        popMenu(r.left + 40, r.bottom, [
          { label: t('sq.mute', 'Silenciar no chat'), icon: 'sound', run: () => void import('../social/store').then((st) => st.toggleList('muted', m.from, true)) },
          { label: t('fr.report', 'Denunciar'), icon: 'warning', danger: true, run: () => void import('../services/home').then(async (h) => {
            const ok = await h.homeApi.report?.({ id: m.from, name: m.name }, 'grupo:' + (m.text ?? m.q ?? '').slice(0, 60));
            toast(ok ? t('fr.rep.ok', 'Denúncia enviada. Obrigado por avisar!') : t('friends.offline', 'Sem conexão. Tente de novo.'), ok ? 'shield' : 'refresh');
          }) },
        ]);
      };
    return el;
  };

  draw();
}

/** Lista de amigos com "Chamar" (online primeiro). */
function inviteList(body: HTMLElement, members: string[] | null): void {
  body.appendChild(sec(t('sq.invitefriends', 'Chamar amigos')));
  const box = document.createElement('div');
  body.appendChild(box);
  const fill = () => {
    const fr = cachedSocial().friends.filter((f) => !members?.includes(f.id)).sort((a, b) => Number(b.online) - Number(a.online));
    box.innerHTML = '';
    if (!fr.length) {
      const e = document.createElement('p');
      e.className = 'sq-hint';
      e.textContent = t('sq.nofriends', 'Adicione amigos pelo @ (Social > Amigos) ou mande o link do grupo.');
      box.appendChild(e);
      return;
    }
    for (const f of fr.slice(0, 30)) {
      const row = document.createElement('div');
      row.className = 'sc-row fr-row';
      row.innerHTML = `<div class="fr-av"><i class="fr-dot ${f.online ? 'on' : ''}"></i></div><div class="lbl"><span class="fr-h"></span><small></small></div><div class="fr-acts"></div>`;
      row.querySelector('.fr-av')!.prepend(skinThumb(f.skin, 40, f.avatar));
      (row.querySelector('.fr-h') as HTMLElement).textContent = '@' + f.handle;
      (row.querySelector('small') as HTMLElement).textContent = f.name + (f.online ? ' · ' + t('fr.online', 'online') : '');
      const b = btn(t('sq.call', 'Chamar'), 'party', f.online ? 'violet' : 'ghost');
      b.onclick = async () => {
        b.disabled = true;
        const r = await inviteToSquad(f.id);
        const msg: Record<string, string> = {
          sent: t('fr.inv.sent', 'Convite enviado para @{h}!', { h: f.handle }),
          wait: t('fr.inv.wait', 'Você acabou de convidar. Espere um pouquinho.'),
          off: t('sq.inv.off', '@{h} não está aceitando convites agora.', { h: f.handle }),
          full: t('sq.full', 'Esse grupo está cheio (máx. 4).'),
          already: t('sq.already', '@{h} já está no grupo.', { h: f.handle }),
          not_friend: t('fr.inv.nf', 'Vocês precisam ser amigos.'),
          network: t('friends.offline', 'Sem conexão. Tente de novo.'),
        };
        toast(msg[r] ?? msg.network, r === 'sent' ? 'party' : 'warning');
        if (r !== 'sent') b.disabled = false;
      };
      row.querySelector('.fr-acts')!.appendChild(b);
      box.appendChild(row);
    }
  };
  fill();
  void refreshFriendsNow().then(() => box.isConnected && fill());
}

/** lê o QR do grupo de um amigo e entra (aceita também QR de sala/amigo e leva para o lugar certo) */
async function scanGroup(): Promise<void> {
  const { scanBloopLink } = await import('../ui/scan');
  const l = await scanBloopLink({ title: t('scan.title', 'Escanear'), hint: t('sq.scan.hint', 'Aponte para o QR do grupo do seu amigo') });
  if (!l) return;
  const { openBloopLink } = await import('../ui/links');
  await openBloopLink(l);
}

async function openGroupQr(): Promise<void> {
  const link = squadLink();
  if (!link) return;
  const s = openSheet(t('sq.qr.title', 'Entrar no grupo'), 'link', { small: true, id: 'sq-qr' });
  s.body.innerHTML = `<div class="fr-qr"><canvas></canvas><p class="sc-note"></p><div class="fr-qr-acts"></div></div>`;
  (s.body.querySelector('.sc-note') as HTMLElement).textContent = t('sq.qr.hint', 'Quem escanear entra direto no seu grupo. Mande só para amigos!');
  try {
    const { drawBloopQr } = await import('../ui/scan');
    await drawBloopQr(s.body.querySelector('canvas')!, link, 230);
  } catch {
    /* sem QR: fica o link */
  }
  const cp = btn(t('fr.copylink', 'Copiar link'), 'link', 'violet');
  cp.onclick = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast(t('fr.copied', 'Copiado!'), 'check');
    } catch {
      toast(link, 'link', 5000);
    }
  };
  s.body.querySelector('.fr-qr-acts')!.appendChild(cp);
}

/** Atalho usado pela lista de amigos ("Convidar" → "Chamar para o grupo"). */
export async function inviteFriendToSquad(id: string, handle: string): Promise<void> {
  const r = await inviteToSquad(id);
  toast(r === 'sent' ? t('fr.inv.sent', 'Convite enviado para @{h}!', { h: handle }) : r === 'off' ? t('sq.inv.off', '@{h} não está aceitando convites agora.', { h: handle }) : t('friends.offline', 'Sem conexão. Tente de novo.'), r === 'sent' ? 'party' : 'warning');
}
export const socialMuted = (): string[] => social.muted;
