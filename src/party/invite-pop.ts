/**
 * CONVITE NA HORA: quando um amigo chama (grupo, jogo, duelo, festa), aparece um cartão grande por cima
 * de tudo com a foto/nome de quem chamou e ACEITAR / Recusar (som + vibração). Dentro de um jogo vira uma
 * faixa compacta no topo com "Aceitar". Chamado por social/friend-alerts.ts assim que o convite chega
 * (o servidor manda um "toque" pelo WebSocket /api/friends/live).
 */
import { t } from '../i18n';
import { audio } from '../core/audio';
import { tap } from '../core/haptics';
import type { FriendInvite } from '../home/api';
import './party.css';

const shown = new Set<string>();
let queue: FriendInvite[] = [];
let open: HTMLElement | null = null;

function chime(): void {
  try {
    audio.unlock();
    audio.perfect(2);
    setTimeout(() => audio.coin(3), 160);
  } catch {
    /* */
  }
  tap('heavy');
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {
    /* */
  }
}

export function showInvitePop(inv: FriendInvite): void {
  const k = inv.from.id + ':' + inv.at;
  if (shown.has(k)) return;
  shown.add(k);
  queue.push(inv);
  if (!open) next();
}

function next(): void {
  const inv = queue.shift();
  if (!inv) return;
  void render(inv);
}

async function render(inv: FriendInvite): Promise<void> {
  const [ui, sheet, home] = await Promise.all([import('../social/friends-ui'), import('../social/sheet'), import('../services/home')]);
  const inGame = document.querySelector('.game-host.on') !== null;
  const el = document.createElement('div');
  el.className = 'ip-pop' + (inGame ? ' ip-mini' : '');
  el.setAttribute('role', 'alertdialog');
  const who = inv.from.handle ? '@' + inv.from.handle : inv.from.name;
  const what =
    inv.kind === 'squad'
      ? t('ip.squad', 'te chamou para o grupo!')
      : inv.kind === 'party'
        ? t('ip.party', 'te chamou para uma festa na casa!')
        : inv.kind === 'house'
          ? t('ip.house', 'te chamou para visitar a casa!')
          : t('ip.game', 'te chamou para jogar {g}!', { g: ui.gameLabel(inv.game) });
  el.innerHTML = `<div class="ip-card"><div class="ip-ava"></div><div class="ip-txt"><b></b><span></span></div>
    <div class="ip-acts"><button class="ip-no" aria-label="${t('ip.no', 'Recusar')}">${inGame ? '✕' : t('ip.no', 'Recusar')}</button><button class="ip-yes">✓ ${t('ip.yes', 'ACEITAR')}</button></div></div>`;
  el.querySelector('.ip-ava')!.appendChild(sheet.skinThumb(inv.from.skin, inGame ? 40 : 72, inv.from.avatar));
  (el.querySelector('.ip-txt b') as HTMLElement).textContent = who;
  (el.querySelector('.ip-txt span') as HTMLElement).textContent = what;
  document.body.appendChild(el);
  open = el;
  chime();
  const close = () => {
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
    if (open === el) open = null;
    setTimeout(next, 250);
  };
  // some sozinho depois de 25 s (continua no Correio e no sino)
  const timer = window.setTimeout(close, 25_000);
  el.querySelector('.ip-yes')!.addEventListener('click', () => {
    close();
    void ui.acceptInvite(inv);
  });
  el.querySelector('.ip-no')!.addEventListener('click', () => {
    close();
    void home.homeApi.clearInvite?.(inv.from.id);
  });
}

/** Fecha o cartão aberto (ex.: entrou no grupo por outro caminho). */
export function dismissInvitePops(): void {
  queue = [];
  open?.remove();
  open = null;
}
