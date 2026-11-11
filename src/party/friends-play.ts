/**
 * COMPONENTE COMPARTILHADO "JOGAR COM AMIGOS" — o caminho principal de todo menu online (sem códigos):
 *   - playingStrip(el, jogo): "Fulano está jogando — ENTRAR" para amigos com sala aberta desse jogo
 *   - openCallFriends({ jogo, j }): lista de amigos (bolinha online) com "Chamar" em um toque → o amigo recebe
 *     o convite NA HORA (party/invite-pop.ts) e cai direto na sala. "Entrar com código / QR" fica pequeno no rodapé.
 * Usado pelos jogos com sala própria (voo, noites, garimpo, mundo) e pelo duelo.
 */
import { t } from '../i18n';
import { notify } from '../ui/notify';
import { FRIENDS_SVG } from './duel-link';
import { joinInvite, openJoin, parseJoin } from './join';
import type { FriendInfo } from '../home/api';
import './party.css';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function friends(refresh = false): Promise<FriendInfo[]> {
  const h = await import('../services/home');
  if (refresh) await h.refreshFriendsNow().catch(() => false);
  return h.cachedSocial().friends;
}
const playingHere = (f: FriendInfo, game: string) => {
  const r = parseJoin(f.playing);
  return !!r && (r.game === game || r.duel === game);
};

/**
 * Faixa "Fulano está jogando — Entrar" (some sozinha quando não há ninguém). Atualiza a cada 20 s
 * enquanto `el` estiver na tela.
 */
export function playingStrip(el: HTMLElement, game: string): void {
  el.classList.add('fp-strip');
  const fill = async (refresh: boolean) => {
    const list = (await friends(refresh)).filter((f) => f.online && playingHere(f, game)).slice(0, 3);
    if (!el.isConnected && refresh) return;
    const sheet = await import('../social/sheet');
    el.innerHTML = '';
    el.hidden = !list.length;
    for (const f of list) {
      const row = document.createElement('button');
      row.className = 'fp-play';
      row.innerHTML = `<span class="fp-ava"></span><span class="fp-txt"><b></b><small>${esc(t('fp.playing', 'está jogando agora'))}</small></span><span class="fp-go">${esc(t('fp.enter', 'ENTRAR'))}</span>`;
      row.querySelector('.fp-ava')!.appendChild(sheet.skinThumb(f.skin, 40, f.avatar));
      (row.querySelector('b') as HTMLElement).textContent = f.handle ? '@' + f.handle : f.name;
      row.onclick = () => {
        const r = parseJoin(f.playing);
        if (r) void openJoin(r);
      };
      el.appendChild(row);
    }
  };
  void fill(false);
  void fill(true);
  const timer = window.setInterval(() => (el.isConnected ? void fill(true) : clearInterval(timer)), 20_000);
}

export interface CallOpts {
  game: string;
  /** sala para onde o convite leva ("<jogo>.<CÓDIGO>"); sem ela, o botão só mostra quem está jogando */
  j?: string;
  /** "Entrar com código / QR" (pequeno, para quem ainda não é amigo) */
  onCode?: () => void;
  /** onde montar (padrão: body) */
  root?: HTMLElement;
}
/** Lista de amigos com "Chamar" (um toque) e "Entrar" para quem já está jogando. */
export async function openCallFriends(o: CallOpts): Promise<void> {
  const [sheet, net] = await Promise.all([import('../social/sheet'), import('../social/net')]);
  document.querySelector('.fp-pop')?.remove();
  const d = document.createElement('div');
  d.className = 'fp-pop';
  d.innerHTML = `<div class="fp-card"><header><b>${FRIENDS_SVG}${esc(t('fp.call', 'Chamar amigos'))}</b><button class="fp-x" aria-label="${esc(t('duel.exit', 'Sair'))}">✕</button></header>
    <div class="fp-list"><i class="fp-spin"></i></div>
    ${o.onCode ? `<button class="fp-code">${esc(t('fp.code', 'Entrar com código / QR'))}</button>` : ''}</div>`;
  (o.root ?? document.body).appendChild(d);
  const close = () => d.remove();
  d.addEventListener('click', (e) => {
    if (e.target === d || (e.target as HTMLElement).closest('.fp-x')) close();
  });
  d.querySelector('.fp-code')?.addEventListener('click', () => {
    close();
    o.onCode?.();
  });
  const list = d.querySelector('.fp-list') as HTMLElement;
  const fill = (fr: FriendInfo[]) => {
    const sorted = fr.slice().sort((a, b) => Number(playingHere(b, o.game)) - Number(playingHere(a, o.game)) || Number(b.online) - Number(a.online));
    list.innerHTML = sorted.length ? '' : `<p class="fp-empty">${esc(t('fp.none', 'Você ainda não tem amigos no Bloop World. Adicione pelo @ em Social → Amigos.'))}</p>`;
    for (const f of sorted.slice(0, 20)) {
      const here = f.online && playingHere(f, o.game);
      const row = document.createElement('div');
      row.className = 'fp-row' + (f.online ? ' on' : '');
      row.innerHTML = `<span class="fp-ava"><i class="fp-dot"></i></span><span class="fp-txt"><b></b><small></small></span>`;
      row.querySelector('.fp-ava')!.prepend(sheet.skinThumb(f.skin, 40, f.avatar));
      (row.querySelector('b') as HTMLElement).textContent = f.handle ? '@' + f.handle : f.name;
      (row.querySelector('small') as HTMLElement).textContent = here ? t('fp.playing', 'está jogando agora') : f.online ? t('fr.online', 'online') : t('fp.off', 'offline');
      const b = document.createElement('button');
      if (here) {
        b.className = 'fp-btn go';
        b.textContent = t('fp.enter', 'ENTRAR');
        b.onclick = () => {
          close();
          const r = parseJoin(f.playing);
          if (r) void openJoin(r);
        };
      } else if (o.j) {
        b.className = 'fp-btn' + (f.online ? '' : ' ghost');
        b.textContent = t('sq.call', 'Chamar');
        b.onclick = async () => {
          b.disabled = true;
          try {
            const p = await net.me();
            const r = await net.api<{ result: string }>('/friends/invite', { id: p.id, to: f.id, kind: 'game', game: joinInvite(o.j!) });
            notify(r.result === 'sent' ? t('fr.inv.sent', 'Convite enviado para @{h}!', { h: f.handle || f.name }) : r.result === 'wait' ? t('fr.inv.wait', 'Você acabou de convidar. Espere um pouquinho.') : t('fr.inv.nf', 'Vocês precisam ser amigos.'), { icon: r.result === 'sent' ? 'party' : 'warning' });
            if (r.result === 'sent') b.textContent = '✓';
            else b.disabled = false;
          } catch {
            b.disabled = false;
            notify(t('friends.offline', 'Sem conexão. Tente de novo.'), { icon: 'cloud-off' });
          }
        };
      } else continue;
      row.appendChild(b);
      list.appendChild(row);
    }
  };
  fill(await friends(false));
  void friends(true).then((f) => d.isConnected && fill(f));
}
