/* ============================================================
 *  GARIMPO BRUTO — telas online: a sala (código, QR, quem está, chamar amigos)
 *  e "Entrar na sala de um amigo" (digitar o código, escanear o QR ou aceitar convite).
 *  Entrar no meio é livre: a sala fica aberta enquanto o anfitrião joga.
 * ============================================================ */
import { t } from '../../i18n';
import { tap } from '../../core/haptics';
import { sfx } from '../../3d/common/sfx';
import { notify } from '../../ui/notify';
import { api } from '../../social/net';
import { bloopLink, drawBloopQr, scanBloopLink } from '../../ui/scan';
import { speak } from '../voo/voice';
import { IC } from './icons';
import { CODE_OK, MAX_PLAYERS, type Me } from './net';
import { PCOL, type Peer } from './mp';
import { joinInvite, joinStr } from '../../party/join';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/* ------------------------------ convites ------------------------------ */
export interface GbInvite {
  from: string;
  name: string;
  code: string;
  at: number;
}
/** consulta convites a cada ~6 s enquanto `alive()` */
export function pollInvites(me: () => Promise<Me | null>, cb: (inv: GbInvite) => void, alive: () => boolean): void {
  const seen = new Set<string>();
  const tick = async () => {
    if (!alive()) return;
    try {
      const m = await me();
      if (m?.id) {
        const r = await api<{ invites: GbInvite[] }>(`/garimpo/invites?id=${encodeURIComponent(m.id)}`);
        for (const inv of r.invites ?? []) {
          const k = inv.from + inv.code + inv.at;
          if (seen.has(k) || !CODE_OK.test(inv.code)) continue;
          seen.add(k);
          if (alive()) cb(inv);
        }
      }
    } catch {
      /* sem rede: tenta depois */
    }
    if (alive()) setTimeout(tick, 6000);
  };
  setTimeout(tick, 800);
}
/** cartão "Fulano te chamou para garimpar" */
export function inviteCard(root: HTMLElement, inv: GbInvite, onJoin: () => void): void {
  const d = document.createElement('div');
  d.className = 'gb-inv';
  d.innerHTML = `${IC.friends}<span><b>${esc(inv.name)}</b><small>${esc(t('gb.mp.invited', 'te chamou para garimpar!'))}</small></span><button class="gb-btn" data-go>${IC.check}${esc(t('gb.mp.join', 'Entrar'))}</button><button class="gb-b gb-x2" data-x aria-label="x">${IC.close}</button>`;
  root.appendChild(d);
  speak(t('gb.mp.invitedV', '{n} te chamou para garimpar!', { n: inv.name }), { urgent: true });
  tap('medium');
  const kill = () => d.remove();
  setTimeout(kill, 30000);
  d.querySelector('[data-x]')!.addEventListener('click', kill);
  d.querySelector('[data-go]')!.addEventListener('click', () => {
    kill();
    onJoin();
  });
}

/* ------------------------------ a sala ------------------------------ */
export interface LobbyOpts {
  code: string;
  host: boolean;
  me: Me;
  players: () => Peer[];
  /** fechar a tela (volta a jogar) */
  close: () => void;
  /** convidado: sair da sala */
  leave?: () => void;
}
export interface LobbyHandle {
  refresh(): void;
  dispose(): void;
}

/** monta a sala dentro de `el` (uma tela .gb-scr já criada pelo jogo) */
export function fillLobby(el: HTMLElement, o: LobbyOpts): LobbyHandle {
  const link = bloopLink('garimpo', o.code);
  let dead = false;
  const invited = new Set<string>();
  el.classList.add('gb-lobby');
  el.innerHTML = `<button class="gb-b gb-x" data-x>${IC.close}</button>
    <h1>${IC.friends}${esc(t('gb.mp.title', 'Garimpar com amigos'))}</h1>
    <div class="gb-lob">
      <div class="gb-lcode">
        <canvas></canvas>
        <div><small>${esc(t('gb.mp.code', 'Código da sala'))}</small><b>${o.code
          .split('')
          .map((c) => `<i>${c}</i>`)
          .join('')}</b>
        <button class="gb-btn ghost sm" data-share>${IC.share}${esc(t('gb.mp.share', 'Mandar código'))}</button></div>
      </div>
      <div class="gb-lside">
        <div class="gb-lbl">${esc(t('gb.mp.players', 'No garimpo ({n}/{m})', { n: 1, m: MAX_PLAYERS }))}</div>
        <div class="gb-lpl"></div>
        ${o.host ? `<div class="gb-lbl">${esc(t('gb.mp.call', 'Chamar amigos'))}</div><div class="gb-lfr"><div class="gb-note">${esc(t('gb.mp.loading', 'Procurando amigos online…'))}</div></div>` : ''}
      </div>
    </div>
    <div class="gb-row">${o.host ? '' : `<button class="gb-btn red" data-leave>${IC.home}${esc(t('gb.mp.leave', 'Sair da sala'))}</button>`}<button class="gb-btn" data-x>${IC.play}${esc(t('gb.mp.play', 'Jogar!'))}</button></div>`;
  void drawBloopQr(el.querySelector('.gb-lcode canvas') as HTMLCanvasElement, link, 116).catch(() => {});
  const pl = el.querySelector('.gb-lpl') as HTMLElement;
  const lbl = el.querySelector('.gb-lside .gb-lbl') as HTMLElement;
  const refresh = () => {
    const ps = o.players();
    lbl.textContent = t('gb.mp.players', 'No garimpo ({n}/{m})', { n: ps.length, m: MAX_PLAYERS });
    let h = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = ps.find((x) => x.slot === i);
      h += p
        ? `<div class="gb-lp${p.id === o.me.id ? ' me' : ''}"><i style="background:${hex(PCOL[i])}"></i><b>${esc(p.name)}</b>${i === 0 ? `<em title="${esc(t('gb.mp.hostTag', 'anfitrião'))}">${IC.star}</em>` : ''}</div>`
        : `<div class="gb-lp free"><i></i><b>${esc(t('gb.mp.free', 'Vaga livre'))}</b></div>`;
    }
    pl.innerHTML = h;
  };
  refresh();
  // amigos online (só o anfitrião chama)
  const flist = el.querySelector('.gb-lfr') as HTMLElement | null;
  const loadFriends = async () => {
    if (!flist) return;
    try {
      const { homeApi } = await import('../../services/home');
      const all = await homeApi.friends();
      if (dead) return;
      const on = all.filter((f) => f.online).slice(0, 10);
      if (!on.length) {
        flist.innerHTML = `<div class="gb-note">${esc(all.length ? t('gb.mp.noneOnline', 'Nenhum amigo online agora. Mande o código!') : t('gb.mp.noFriends', 'Sem amigos ainda. Mande o código ou mostre o QR!'))}</div>`;
        return;
      }
      flist.innerHTML = on
        .map(
          (f) =>
            `<div class="gb-lf"><b>${esc(f.name || '@' + f.handle)}</b><button class="gb-call ${invited.has(f.id) ? 'done' : ''}" data-call="${esc(f.id)}">${invited.has(f.id) ? IC.check + esc(t('gb.mp.called', 'Chamado')) : IC.friends + esc(t('gb.mp.callOne', 'Chamar'))}</button></div>`,
        )
        .join('');
    } catch {
      if (!dead) flist.innerHTML = `<div class="gb-note">${esc(t('gb.mp.noFriends', 'Sem amigos ainda. Mande o código ou mostre o QR!'))}</div>`;
    }
  };
  void loadFriends();
  const fTimer = window.setInterval(() => void loadFriends(), 20000);
  const share = async () => {
    const txt = t('gb.mp.shareTxt', 'Vem garimpar comigo no Garimpo Bruto (Bloop World)! Código: {c}', { c: o.code });
    try {
      if (navigator.share) {
        await navigator.share({ text: txt, url: link });
        return;
      }
    } catch {
      /* cancelou */
    }
    try {
      await navigator.clipboard.writeText(txt + ' ' + link);
      notify(t('gb.mp.copied', 'Código copiado!'), { icon: 'check', kind: 'good' });
    } catch {
      notify(o.code, { icon: 'link' });
    }
  };
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    sfx.click();
    if (b.dataset.x !== undefined) return o.close();
    if (b.dataset.leave !== undefined) return o.leave?.();
    if (b.dataset.share !== undefined) return void share();
    if (b.dataset.call) {
      const id = b.dataset.call;
      if (invited.has(id)) return;
      invited.add(id);
      b.classList.add('done');
      b.innerHTML = IC.check + esc(t('gb.mp.called', 'Chamado'));
      try {
        // convite pelo sistema de amigos: aparece NA HORA em qualquer tela e entra direto (src/party/invite-pop.ts)
        await api('/friends/invite', { id: o.me.id, to: id, kind: 'game', game: joinInvite(joinStr('garimpo', o.code)) });
        void api('/garimpo/invite', { id: o.me.id, to: id, code: o.code, name: o.me.name }).catch(() => {});
      } catch {
        invited.delete(id);
        notify(t('gb.mp.callFail', 'Não deu para chamar agora'), { icon: 'cloud-off', kind: 'bad' });
        void loadFriends();
      }
    }
  });
  return {
    refresh,
    dispose: () => {
      dead = true;
      clearInterval(fTimer);
    },
  };
}

/* ------------------------------ entrar ------------------------------ */
export interface JoinOpts {
  me: () => Promise<Me | null>;
  join: (code: string) => void;
  back: () => void;
}
/** tela "Entrar na sala de um amigo" dentro de `el` */
export function fillJoin(el: HTMLElement, o: JoinOpts): () => void {
  let dead = false;
  el.classList.add('gb-join');
  el.innerHTML = `<h1>${IC.friends}${esc(t('gb.mp.joinTitle', 'Entrar na sala de um amigo'))}</h1>
    <form class="gb-jrow" data-f><input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2M" aria-label="${esc(t('gb.mp.code', 'Código da sala'))}"/><button class="gb-btn" type="submit">${IC.play}${esc(t('gb.mp.join', 'Entrar'))}</button></form>
    <div class="gb-row"><button class="gb-btn ghost" data-scan type="button">${IC.qr}${esc(t('gb.mp.scan', 'Escanear QR'))}</button><button class="gb-btn ghost" data-back type="button">${esc(t('gb.back', 'Voltar'))}</button></div>
    <div class="gb-note">${esc(t('gb.mp.joinHint', 'Peça o código de 5 letras para quem criou a sala.'))}</div>
    <div class="gb-jinv"></div>`;
  const inp = el.querySelector('input') as HTMLInputElement;
  inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  el.querySelector('[data-f]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inp.value.toUpperCase();
    if (!CODE_OK.test(v)) {
      notify(t('gb.mp.badCode', 'Código com 5 letras, como K7Q2M'), { icon: 'warning', kind: 'bad' });
      return;
    }
    o.join(v);
  });
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    if (b.dataset.back !== undefined) {
      sfx.click();
      return o.back();
    }
    if (b.dataset.scan !== undefined) {
      sfx.click();
      const l = await scanBloopLink({ types: ['garimpo'], title: t('gb.mp.scan', 'Escanear QR'), hint: t('gb.mp.scanHint', 'Aponte para o QR da sala do amigo') });
      if (l && !dead) o.join(l.code);
    }
  });
  const box = el.querySelector('.gb-jinv') as HTMLElement;
  pollInvites(
    o.me,
    (inv) => inviteCard(box, inv, () => !dead && o.join(inv.code)),
    () => !dead && el.isConnected,
  );
  return () => {
    dead = true;
  };
}
