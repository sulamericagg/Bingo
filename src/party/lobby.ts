/**
 * SAGUÃO DO GRUPO no hub: os Bloops do grupo (com as roupas/avatares de cada um) em pé logo abaixo do
 * carrossel de jogos — etiqueta com @, ✓ de pronto, coroa do líder, balão de chat/emote e um "+" para chamar.
 * É uma camada própria (#pl-lobby) inserida entre os pontinhos do carrossel e a barra inferior do hub;
 * o hub.ts não sabe dela (só o hub.css de flex: o palco do carrossel encolhe ~70 px).
 *   - tocar no SEU boneco → roda de emotes (todos veem o balão)
 *   - tocar em outro → perfil / silenciar / denunciar (+ tornar líder / remover, se você é o líder)
 *   - "+" → painel do grupo (convidar amigos, link/QR, chat)
 */
import { bus } from '../core/events';
import { save } from '../core/storage';
import { t } from '../i18n';
import { drawPlayer, type PlayerPose } from '../game/character';
import { drawAvatar, type AvatarData } from '../game/avatar';
import { SKINS } from '../game/skins';
import { getPlayer } from '../services/online';
import { displayName } from '../services/leaderboard';
import { profile } from '../services/profile';
import { social } from '../social/store';
import { chatLog, isLeader, kick, promote, sendEmote, setReady, squad, type SquadMember, type SquadMsg } from './squad';
import './party.css';

const pose: PlayerPose = { t: 0, blink: 0, lookX: 0.15, lookY: 0.1, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true };

function drawBloop(cv: HTMLCanvasElement, skin: string, avatar?: unknown): void {
  const d = Math.min(2, window.devicePixelRatio || 1);
  cv.width = cv.height = 64 * d;
  const c = cv.getContext('2d')!;
  c.scale(d, d);
  c.translate(32, 36);
  try {
    if (skin === 'custom' && avatar && typeof avatar === 'object') drawAvatar(c, avatar as AvatarData, 21, pose);
    else drawPlayer(c, SKINS.find((s) => s.id === skin && s.id !== 'custom') ?? SKINS[0], 21, pose);
  } catch {
    /* skin desconhecida */
  }
}

let root: HTMLElement | null = null;
const bubbles = new Map<string, { el: HTMLElement; timer: number }>();

function quickText(code: string): string {
  const L: Record<string, string> = {
    oi: t('quick.oi', 'Oi, pessoal!'),
    boa: t('quick.boa', 'Mandou bem!'),
    gg: t('quick.gg', 'Boa partida!'),
    vamos: t('quick.vamos', 'Vamos jogar?'),
    uau: t('quick.uau', 'Uau!'),
    joinha: t('quick.joinha', 'Joinha!'),
    rindo: t('quick.rindo', 'Haha!'),
    coracao: t('quick.coracao', 'Amei!'),
    obrigado: t('quick.obrigado', 'Obrigado!'),
    denovo: t('quick.denovo', 'De novo?'),
    quase: t('quick.quase', 'Foi quase!'),
    tchau: t('quick.tchau', 'Tchau!'),
  };
  return L[code] ?? code;
}
export const msgText = (m: SquadMsg): string => (m.q ? quickText(m.q) : (m.text ?? ''));

function showBubble(id: string, fill: (el: HTMLElement) => void, ms: number): void {
  const slot = root?.querySelector<HTMLElement>(`.pl-slot[data-id="${CSS.escape(id)}"]`);
  const el = slot?.querySelector<HTMLElement>('.pl-bub');
  if (!slot || !el) return;
  const prev = bubbles.get(id);
  if (prev) clearTimeout(prev.timer);
  el.innerHTML = '';
  fill(el);
  el.classList.add('on');
  bubbles.set(id, { el, timer: window.setTimeout(() => el.classList.remove('on'), ms) });
}

function memberMenu(m: SquadMember, at: HTMLElement): void {
  void import('../social/sheet').then(({ popMenu, toast }) => {
    const r = at.getBoundingClientRect();
    const muted = social.muted.includes(m.id);
    const items: Parameters<typeof popMenu>[2] = [
      { label: t('fr.profile', 'Ver perfil'), icon: 'user', run: () => void import('../social/profile').then((p) => p.openProfile(m.id, { name: m.name, skin: m.skin })) },
    ];
    if (isLeader()) {
      items.push({ label: t('sq.promote', 'Tornar líder'), icon: 'crown', run: () => promote(m.id) });
      items.push({ label: t('sq.kick', 'Tirar do grupo'), icon: 'close', danger: true, run: () => kick(m.id) });
    }
    items.push({
      label: muted ? t('sq.unmute', 'Ouvir de novo') : t('sq.mute', 'Silenciar no chat'),
      icon: 'sound',
      run: () => void import('../social/store').then((s) => {
        s.toggleList('muted', m.id, !muted);
        toast(muted ? t('sq.unmuted', 'Você vai ver as mensagens de novo.') : t('sq.muted', 'Silenciado: você não vê mais as mensagens.'), 'check');
      }),
    });
    items.push({
      label: t('fr.report', 'Denunciar'),
      icon: 'warning',
      danger: true,
      run: () => void import('../services/home').then(async (h) => {
        const last = [...chatLog].reverse().find((x) => x.from === m.id);
        const ok = await h.homeApi.report?.({ id: m.id, name: m.name }, 'grupo' + (last?.text ? ':' + last.text.slice(0, 60) : ''));
        toast(ok ? t('fr.rep.ok', 'Denúncia enviada. Obrigado por avisar!') : t('friends.offline', 'Sem conexão. Tente de novo.'), ok ? 'shield' : 'refresh');
      }),
    });
    popMenu(r.left + r.width / 2, r.top - 8, items);
  });
}

function openPanel(): void {
  void import('./panel').then((p) => p.openSquadPanel());
}

function render(): void {
  if (!root) return;
  const v = squad();
  const myId = getPlayer()?.id ?? '';
  const slots = root.querySelector('.pl-slots') as HTMLElement;
  slots.innerHTML = '';
  const members: SquadMember[] = v
    ? [...v.members].sort((a, b) => Number(b.id === myId) - Number(a.id === myId))
    : [{ id: myId, name: displayName(), handle: profile.handleStatus === 'ok' ? profile.handle : '', skin: save.skin, ...(save.skin === 'custom' ? { avatar: save.avatar } : {}), ready: false, on: true }];
  for (const m of members) {
    const el = document.createElement('button');
    el.className = 'pl-slot' + (m.id === myId ? ' me' : '') + (m.on ? '' : ' off') + (m.ready ? ' ready' : '') + (v && v.leader === m.id ? ' leader' : '');
    el.dataset.id = m.id;
    el.setAttribute('aria-label', m.handle ? '@' + m.handle : m.name);
    el.innerHTML = `<span class="pl-bub"></span><span class="pl-fig"><canvas></canvas></span><b class="pl-tag"></b>${v && v.leader === m.id ? '<i class="pl-crown">♛</i>' : ''}${m.ready ? '<i class="pl-ok">✓</i>' : ''}`;
    (el.querySelector('.pl-tag') as HTMLElement).textContent = m.id === myId ? t('sq.you', 'Você') : m.handle ? '@' + m.handle : m.name;
    drawBloop(el.querySelector('canvas')!, m.id === myId ? save.skin : m.skin, m.id === myId ? (save.skin === 'custom' ? save.avatar : undefined) : m.avatar);
    el.style.setProperty('--d', String(Math.random() * 1.6));
    el.onclick = () => {
      if (m.id === myId) void import('../social/emotes').then((e) => e.openEmoteWheel((code) => (v ? sendEmote(code) : showEmote(myId, code))));
      else memberMenu(m, el);
    };
    slots.appendChild(el);
  }
  const free = v ? 4 - v.members.length : 1;
  for (let i = 0; i < free; i++) {
    const add = document.createElement('button');
    add.className = 'pl-slot pl-add';
    add.innerHTML = `<span class="pl-plus">+</span><b class="pl-tag"></b>`;
    (add.querySelector('.pl-tag') as HTMLElement).textContent = v ? t('sq.invite', 'Convidar') : t('sq.playwith', 'Jogar com amigos');
    add.onclick = openPanel;
    slots.appendChild(add);
    if (!v) break;
  }
  root.classList.toggle('solo', !v);
  const side = root.querySelector('.pl-side') as HTMLElement;
  side.hidden = !v;
  if (v) {
    const meM = v.members.find((m) => m.id === myId);
    const rd = side.querySelector('.pl-readybtn') as HTMLButtonElement;
    rd.classList.toggle('on', !!meM?.ready);
    rd.textContent = meM?.ready ? '✓ ' + t('sq.ready', 'Pronto!') : t('sq.setready', 'Pronto?');
    const n = v.members.filter((m) => m.ready).length;
    (side.querySelector('.pl-count') as HTMLElement).textContent = `${n}/${v.members.length}`;
  }
}

function showEmote(id: string, code: string): void {
  void import('../social/sheet').then(({ emoteThumb }) => showBubble(id, (el) => el.appendChild(emoteThumb(code, 30)), 2600));
}

/** Monta o saguão no hub (uma vez). */
export function mountLobby(): void {
  if (root) return;
  const menu = document.getElementById('menu');
  const nav = document.getElementById('hub-nav');
  if (!menu || !nav) return;
  root = document.createElement('div');
  root.id = 'pl-lobby';
  root.className = 'pl-lobby';
  root.innerHTML = `<div class="pl-slots"></div><div class="pl-side" hidden><button class="pl-readybtn"></button><span class="pl-count"></span><button class="pl-chatbtn" aria-label="Chat"><svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 5h16v10H9l-4 4v-4H4z" fill="currentColor"/></svg><em class="pl-unread" hidden></em></button></div>`;
  menu.insertBefore(root, nav);
  const side = root.querySelector('.pl-side') as HTMLElement;
  side.querySelector('.pl-readybtn')!.addEventListener('click', () => {
    const v = squad();
    const meM = v?.members.find((m) => m.id === v.you);
    setReady(!meM?.ready);
  });
  side.querySelector('.pl-chatbtn')!.addEventListener('click', () => {
    unread = 0;
    (side.querySelector('.pl-unread') as HTMLElement).hidden = true;
    void import('./panel').then((p) => p.openSquadPanel('chat'));
  });
  render();
  bus.on('squad', render);
  bus.on('player', render);
  bus.on('profile', render);
  bus.on('squad-emote', (e: { from: string; code: string }) => showEmote(e.from, e.code));
  bus.on('squad-chat', (m: SquadMsg | null) => {
    if (!m) return;
    showBubble(m.from, (el) => (el.textContent = msgText(m)), 4200);
    if (m.from !== squad()?.you && !document.querySelector('#sq-panel')) {
      unread++;
      const u = side.querySelector('.pl-unread') as HTMLElement;
      u.hidden = false;
      u.textContent = String(unread);
    }
  });
}
let unread = 0;
