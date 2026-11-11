/**
 * "JUNTOS" — modo mínimo do grupo para jogos de criar/explorar sem placar (Caça Bloop, Bloop Studio,
 * Bloop Cinema): quando o líder abre um desses, todo mundo abre o mesmo jogo e aparece uma faixa com
 * quem do grupo está ali, com emotes ao vivo (relé de presença na sala do grupo). Sem mexer nos jogos.
 * Carregado sob demanda pelo squad quando o jogo abre com a sala do grupo.
 */
import { t } from '../i18n';
import type { PeerState, PresenceSession } from '../services/presence-api';
import { partyRoomFor } from './contract';
import './duel.css';

const EMOTES = ['oi', 'joinha', 'uau', 'coracao', 'rindo', 'vamos'];
let cur: { game: string; el: HTMLElement; ses: PresenceSession | null; off: () => void } | null = null;

export async function mountTogether(game: string): Promise<void> {
  unmountTogether();
  const room = partyRoomFor(game);
  const host = document.querySelector('.game-host');
  if (!room || !host) return;
  const el = document.createElement('div');
  el.className = 'tg-strip';
  el.innerHTML = `<div class="tg-ppl"></div><button class="tg-emo" aria-label="${t('tg.emote', 'Mandar emote')}"></button>`;
  host.appendChild(el);
  const state = { game, el, ses: null as PresenceSession | null, off: () => {} };
  cur = state;
  const [{ joinPresence }, sheet] = await Promise.all([import('../services/presence'), import('../social/sheet')]);
  if (cur !== state) return;
  let ei = 0;
  const btn = el.querySelector('.tg-emo') as HTMLButtonElement;
  btn.appendChild(sheet.emoteThumb(EMOTES[0], 30));
  const ppl = el.querySelector('.tg-ppl') as HTMLElement;
  const render = (peers: readonly PeerState[]) => {
    ppl.innerHTML = '';
    const list = [{ id: 'me', name: t('duel.you', 'Você'), skin: '', emote: mine } as PeerState & { emote?: string }, ...peers.filter((p) => !p.bot)];
    for (const p of list) {
      const d = document.createElement('div');
      d.className = 'tg-p';
      if (p.id !== 'me') d.appendChild(sheet.skinThumb(p.skin === 'custom' ? 'bloop' : p.skin, 30, p.avatar));
      else d.classList.add('me');
      const b = document.createElement('b');
      b.textContent = p.name;
      d.appendChild(b);
      if (p.emote) {
        const e = document.createElement('i');
        e.className = 'tg-bub';
        e.appendChild(sheet.emoteThumb(p.emote, 26));
        d.appendChild(e);
      }
      ppl.appendChild(d);
    }
  };
  let mine = '';
  let last: readonly PeerState[] = [];
  render([]);
  try {
    const ses = await joinPresence(game, { botsIfAlone: 0 });
    if (cur !== state) return ses.leave();
    state.ses = ses;
    ses.onPeers((p) => {
      last = p.slice();
      render(last);
    });
  } catch {
    /* sem rede: só a faixa */
  }
  btn.onclick = () => {
    const code = EMOTES[ei];
    ei = (ei + 1) % EMOTES.length;
    btn.innerHTML = '';
    btn.appendChild(sheet.emoteThumb(EMOTES[ei], 30));
    state.ses?.emote(code);
    mine = code;
    render(last);
    setTimeout(() => {
      if (mine === code) (mine = ''), render(last);
    }, 2600);
  };
}

export function unmountTogether(): void {
  if (!cur) return;
  cur.ses?.leave();
  cur.el.remove();
  cur.off();
  cur = null;
}
