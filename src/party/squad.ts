/**
 * GRUPO (party de até 4) — sessão do app. Servidor: server/squad.ts (WebSocket /api/squad/<id>).
 * Estado e eventos pelo bus:
 *   'squad'        (SquadView | null)    mudou membros/líder/pronto (null = sem grupo)
 *   'squad-chat'   (SquadMsg)            mensagem nova no chat do grupo
 *   'squad-emote'  ({ from, code })      emote de alguém (balão no saguão)
 * O grupo fica salvo no aparelho (reabrir o app reconecta enquanto o grupo existir no servidor).
 */
import { bus } from '../core/events';
import { t } from '../i18n';
import { notify } from '../ui/notify';
import { isNative } from '../core/platform';
import { ONLINE } from '../config';
import { apiBase, me, wsUrl } from '../social/net';
import { social } from '../social/store';
import { profile } from '../services/profile';
import { clearPartyRoom, partyGame, partyLaunch } from './contract';

export interface SquadMember {
  id: string;
  name: string;
  handle: string;
  skin: string;
  avatar?: unknown;
  ready: boolean;
  on: boolean;
}
export interface SquadView {
  id: string;
  code: string;
  leader: string;
  members: SquadMember[];
  you: string;
}
export interface SquadMsg {
  id: string;
  from: string;
  name: string;
  text?: string;
  q?: string;
  at: number;
}

const KEY = 'bw-squad';
let view: SquadView | null = null;
let ws: WebSocket | null = null;
let saved: { sid: string; code: string } | null = null;
let retry = 0;
let retryTimer = 0;
let hbTimer = 0;
let closing = false;
let pulling = false;
export const chatLog: SquadMsg[] = [];

try {
  const o = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (o && typeof o.sid === 'string') saved = o;
} catch {
  /* */
}
function persist(): void {
  try {
    if (saved) localStorage.setItem(KEY, JSON.stringify(saved));
    else localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export const squad = (): SquadView | null => view;
export const inSquad = (): boolean => !!view;
export const isLeader = (): boolean => !!view && view.leader === view.you;
export const squadSize = (): number => view?.members.length ?? 0;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${apiBase()}/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

function setView(v: SquadView | null): void {
  view = v;
  bus.emit('squad', v);
}

/** Cria um grupo (você vira o líder) e conecta. */
export async function createSquad(): Promise<boolean> {
  if (view) return true;
  const p = await me();
  if (!p.id) return false;
  const r = await post<{ squad: string; code: string }>('/squad/create', { id: p.id });
  if (!r) return false;
  return connect(r.squad, r.code);
}

/** Entra no grupo (convite ou link/QR com o código). */
export async function joinSquad(sid: string, code = ''): Promise<boolean> {
  if (view?.id === sid) return true;
  if (view) leaveSquad();
  return connect(sid, code);
}

function connect(sid: string, code: string): Promise<boolean> {
  closing = false;
  clearTimeout(retryTimer);
  saved = { sid, code };
  persist();
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (!done) (done = true), resolve(ok);
    };
    me().then((p) => {
      if (!p.id) return finish(false);
      let sock: WebSocket;
      try {
        sock = new WebSocket(wsUrl('/squad/' + sid));
      } catch {
        return finish(false);
      }
      ws?.close();
      ws = sock;
      const timer = setTimeout(() => finish(false), 7000);
      sock.onopen = () => {
        const h = profile.handleStatus === 'ok' ? profile.handle : '';
        sock.send(JSON.stringify({ t: 'hello', id: p.id, name: p.name, skin: p.skin, ...(p.avatar ? { avatar: p.avatar } : {}), handle: h, code }));
        clearInterval(hbTimer);
        hbTimer = window.setInterval(() => sock.readyState === 1 && sock.send('{"t":"hb"}'), 30_000);
      };
      sock.onmessage = (e) => {
        let m: any;
        try {
          m = JSON.parse(String(e.data));
        } catch {
          return;
        }
        if (m.t === 'state') {
          clearTimeout(timer);
          retry = 0;
          setView({ ...m.s, you: view?.you ?? m.you ?? p.id });
          finish(true);
        } else if (m.t === 'hist') {
          chatLog.length = 0;
          chatLog.push(...(m.msgs as SquadMsg[]).filter((x) => !social.muted.includes(x.from) && !social.blocked.includes(x.from)));
          bus.emit('squad-chat', null);
        } else if (m.t === 'chat') {
          const msg = m.m as SquadMsg;
          if (social.muted.includes(msg.from) || social.blocked.includes(msg.from)) return;
          chatLog.push(msg);
          if (chatLog.length > 40) chatLog.shift();
          bus.emit('squad-chat', msg);
        } else if (m.t === 'emote') bus.emit('squad-emote', { from: m.from, code: m.code });
        else if (m.t === 'launch') void onLaunch(m.game, m.room, m.by);
        else if (m.t === 'reject') notify(rejectText(m.reason), { icon: 'warning', kind: 'warn' });
        else if (m.t === 'kicked') {
          notify(t('sq.kicked', 'Você saiu do grupo.'), { icon: 'user' });
          drop();
        } else if (m.t === 'error') {
          clearTimeout(timer);
          notify(m.code === 'full' ? t('sq.full', 'Esse grupo está cheio (máx. 4).') : t('sq.gone', 'Esse grupo não existe mais.'), { icon: 'warning', kind: 'warn' });
          drop();
          finish(false);
        }
      };
      sock.onclose = () => {
        clearTimeout(timer);
        if (ws !== sock) return;
        ws = null;
        clearInterval(hbTimer);
        finish(false);
        if (closing || !saved) return;
        // caiu a conexão: tenta de novo (o servidor guarda o lugar por 2 min)
        retryTimer = window.setTimeout(() => saved && void connect(saved.sid, saved.code), Math.min(20_000, 1500 * 2 ** retry++));
      };
    });
  });
}

function drop(): void {
  closing = true;
  saved = null;
  persist();
  clearInterval(hbTimer);
  try {
    ws?.close();
  } catch {
    /* */
  }
  ws = null;
  chatLog.length = 0;
  clearPartyRoom();
  setView(null);
}

export function leaveSquad(): void {
  try {
    ws?.send('{"t":"leave"}');
  } catch {
    /* */
  }
  drop();
}

const send = (m: unknown): void => {
  if (ws?.readyState === 1) ws.send(JSON.stringify(m));
};
export const setReady = (on: boolean): void => send({ t: 'ready', on });
export const sayText = (text: string): void => send({ t: 'chat', text });
export const sayQuick = (code: string): void => send({ t: 'quick', code });
export const sendEmote = (code: string): void => send({ t: 'emote', code });
export const kick = (id: string): void => send({ t: 'kick', id });
export const promote = (id: string): void => send({ t: 'promote', id });

function rejectText(r: string): string {
  if (r === 'rate') return t('chat.r.rate', 'Calma! Espere um pouquinho antes de mandar outra mensagem.');
  if (r === 'muted') return t('chat.r.muted', 'Você está silenciado no chat por um tempo.');
  if (r === 'pii') return t('chat.r.pii', 'Para sua segurança, não compartilhe contatos, links, endereços ou dados pessoais.');
  return t('chat.r.bad', 'Ops! Vamos manter o chat gentil para todo mundo.');
}

/** Convida um amigo (cria o grupo se ainda não existir). */
export async function inviteToSquad(friendId: string): Promise<'sent' | 'not_friend' | 'off' | 'wait' | 'full' | 'already' | 'network'> {
  if (!view && !(await createSquad())) return 'network';
  const p = await me();
  const r = await post<{ result: string }>('/squad/invite', { id: p.id, squad: view!.id, to: friendId });
  if (!r) return 'network';
  return (['sent', 'not_friend', 'off', 'wait', 'full', 'already'].includes(r.result) ? r.result : 'not_friend') as 'sent';
}

/** Link/QR do grupo (qualquer um com o link entra; o líder pode remover). */
export function squadLink(): string | null {
  if (!view) return null;
  const base = isNative ? ONLINE.nativeApiBase : location.origin + location.pathname;
  return `${base.replace(/\/+$/, '')}/?grupo=${view.id}.${view.code}`;
}
export function squadFromLink(url: string): { sid: string; code: string } | null {
  try {
    const g = new URL(url).searchParams.get('grupo') ?? '';
    const m = /^([a-z0-9]{8,16})\.([a-z0-9]{4,12})$/.exec(g);
    return m ? { sid: m[1], code: m[2] } : null;
  } catch {
    return null;
  }
}

/* ---------------- jogar junto ---------------- */

let roomSeq = 0;
/** O líder abriu um jogo: leva o grupo junto (chamado pelo bus 'game-launch'). */
function onLeaderLaunch(gameId: string): void {
  if (pulling || !view || !isLeader() || view.members.filter((m) => m.on).length < 2) return;
  const room = `${view.id}-${Date.now().toString(36)}${roomSeq++}`;
  partyLaunch(gameId, room);
  send({ t: 'launch', game: gameId, room });
}
/** Leva o grupo para a festa na casa do líder. */
export async function launchHouseParty(): Promise<void> {
  if (!view) return;
  const host = view.leader;
  if (isLeader()) {
    // a casa precisa existir no servidor para os amigos entrarem (casa nova só fica no aparelho até salvar)
    try {
      const p = await me();
      const r = await fetch(`${apiBase()}/api/home/${p.id}?id=${p.id}`);
      if (r.status === 404) {
        const [{ homeApi }, { starterDesign }] = await Promise.all([import('../services/home'), import('../home/catalog')]);
        const mine = await homeApi.getHome();
        await homeApi.saveDesign(mine?.design ?? starterDesign());
      }
    } catch {
      /* offline: a festa abre só com robôs */
    }
    send({ t: 'launch', game: 'casa', room: `${view.id}-casa` });
  }
  void import('../home/register').then((m) => m.openHome({ party: host }));
}

async function onLaunch(game: string, room: string, by: string): Promise<void> {
  const leader = view?.members.find((m) => m.id === by);
  const who = leader?.handle ? '@' + leader.handle : (leader?.name ?? '');
  if (game === 'casa') {
    notify(t('sq.go.house', '{w} chamou o grupo para a festa na casa!', { w: who }), { icon: 'party', kind: 'good' });
    const m = await import('../home/register');
    await m.openHome({ visit: by, party: by });
    return;
  }
  const pg = partyGame(game);
  const { listGames } = await import('../hub/registry');
  const def = listGames().find((g) => g.id === game);
  if (!pg && game !== 'race') {
    notify(t('sq.solo', 'Esse jogo ainda é solo — {w} está jogando {g}.', { w: who, g: def?.name ?? game }), { icon: 'user', ms: 4500 });
    return;
  }
  notify(t('sq.go', '{w} chamou o grupo para jogar!', { w: who }), { icon: 'rocket', kind: 'good' });
  partyLaunch(game, room);
  pulling = true;
  try {
    if (pg?.join) await pg.join(room);
    else if (game === 'race') {
      const hub = await import('../hub/hub');
      hub.closeHost();
      document.getElementById('btn-race')?.click();
    } else if (def) {
      const hub = await import('../hub/hub');
      hub.closeHost();
      await hub.launchGame(def);
    }
  } finally {
    pulling = false;
  }
}

let started = false;
/** Liga o grupo (reconecta o grupo salvo; o líder leva o grupo ao abrir jogos). */
export function initSquad(): void {
  if (started) return;
  started = true;
  bus.on('game-launch', (id: string) => onLeaderLaunch(id));
  if (saved) setTimeout(() => saved && void connect(saved.sid, saved.code), 2500);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && saved && !ws) void connect(saved.sid, saved.code);
  });
}
