/**
 * CENTRAL DE AVISOS (sino com badge na barra de cima do hub): pedidos de amizade, convites (grupo, festa,
 * casa, jogo) e amigos que ficaram online. Guarda os últimos 30 no aparelho ('bw-notif').
 * Quem gera os avisos: src/social/friend-alerts.ts (pushNotif). Toque num aviso = abre o que ele chama.
 */
import { bus } from '../core/events';
import { t } from '../i18n';

export type NotifKind = 'request' | 'invite' | 'online' | 'squad';
export interface Notif {
  id: string;
  kind: NotifKind;
  text: string;
  at: number;
  read: boolean;
  /** convite: dados para "Entrar" */
  invite?: unknown;
}

const KEY = 'bw-notif';
let list: Notif[] = [];
try {
  const o = JSON.parse(localStorage.getItem(KEY) || '[]');
  if (Array.isArray(o)) list = o.slice(0, 30);
} catch {
  /* */
}
function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* */
  }
  refresh();
}

export const unreadCount = (): number => list.filter((n) => !n.read).length;

export function pushNotif(n: Omit<Notif, 'read' | 'at'> & { at?: number }): void {
  if (list.some((x) => x.id === n.id)) return;
  list.unshift({ ...n, at: n.at ?? Date.now(), read: false });
  list = list.slice(0, 30);
  persist();
  btn?.classList.remove('ring');
  void btn?.offsetWidth;
  btn?.classList.add('ring');
}

let btn: HTMLButtonElement | null = null;
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5-6.7V3.5a2 2 0 0 0-4 0v.8A7 7 0 0 0 5 11v5l-2 2v1h18v-1z"/></svg>';

function refresh(): void {
  if (!btn) return;
  const n = unreadCount();
  const b = btn.querySelector('.bl-badge') as HTMLElement;
  b.hidden = !n;
  b.textContent = n > 9 ? '9+' : String(n);
}

function ago(at: number): string {
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  return m < 60 ? t('bl.min', 'há {n} min', { n: m }) : t('bl.h', 'há {n} h', { n: Math.round(m / 60) });
}

async function openList(): Promise<void> {
  const { openSheet } = await import('../social/sheet');
  const { icon } = await import('../ui/icons');
  const s = openSheet(t('bl.title', 'Avisos'), 'mail', { small: true, id: 'bl-sheet' });
  const now = list.map((n) => ({ ...n }));
  for (const n of list) n.read = true;
  persist();
  s.body.classList.add('bl-list');
  if (!now.length) {
    s.body.innerHTML = `<div class="sc-empty">${icon('mail', { size: 48 })}</div>`;
    s.body.firstElementChild!.append(t('bl.empty', 'Nenhum aviso por enquanto.'));
    return;
  }
  for (const n of now) {
    const row = document.createElement('div');
    row.className = 'sc-row' + (n.read ? '' : ' unread');
    row.innerHTML = `${icon(n.kind === 'request' ? 'heart' : n.kind === 'online' ? 'user' : 'party', { size: 24 })}<div class="lbl"><span></span><small class="bl-ago"></small></div>`;
    (row.querySelector('.lbl span') as HTMLElement).textContent = n.text;
    (row.querySelector('.bl-ago') as HTMLElement).textContent = ago(n.at);
    const go = document.createElement('button');
    go.className = 'sc-btn sm ' + (n.invite ? 'green' : 'ghost');
    go.textContent = n.invite ? t('fr.join', 'Entrar') : t('bl.see', 'Ver');
    go.onclick = () => {
      s.close();
      bus.emit('notif-open', n);
    };
    row.appendChild(go);
    s.body.appendChild(row);
  }
}

/** Coloca o sino na barra de cima do hub (ao lado da engrenagem). */
export function mountBell(): void {
  if (btn) return;
  const gear = document.querySelector('#menu .hub-top .hub-gear');
  if (!gear) return;
  btn = document.createElement('button');
  btn.className = 'bl-btn';
  btn.setAttribute('aria-label', t('bl.title', 'Avisos'));
  btn.innerHTML = BELL + '<em class="bl-badge" hidden></em>';
  btn.onclick = () => void openList();
  gear.before(btn);
  refresh();
}
