/* ============================================================
 *  CAVA & FALA — telas online: "Jogar com amigos" (criar sala / entrar pelo
 *  código, QR ou convite) e a SALA (código + QR, quem está, chamar amigos
 *  online, modo escolhido pelo anfitrião, JOGAR).
 *  Usa os módulos compartilhados de QR/links (ui/scan.ts) e a lista de amigos.
 * ============================================================ */
import { sfx } from '../../3d/common/sfx';
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { api } from '../../social/net';
import { icon } from '../../ui/icons';
import { notify } from '../../ui/notify';
import { bloopLink, drawBloopQr, scanBloopLink } from '../../ui/scan';
import { THEMES, themeById, type ThemeId } from './data';
import { CODE_OK, MAX_PLAYERS, type CavaNet, type Me } from './net';
import { PCOLS } from './online';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CSS = `
.cf-on{justify-content:flex-start;gap:6px}
.cf-on h1{margin:0;font:800 22px/1.1 inherit;display:flex;align-items:center;gap:8px;text-shadow:0 2px 0 #2a0b5c}
.cf-on .cf-x{position:absolute;right:calc(var(--edge-r,12px) + 4px);top:calc(env(safe-area-inset-top,0px) + 8px);width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}
.cf-ocards{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;align-items:stretch}
.cf-ocard{width:min(300px,44vw);border-radius:18px;padding:12px;background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 2px rgba(255,255,255,.18);display:flex;flex-direction:column;gap:8px;align-items:center;text-align:center}
.cf-ocard b{font:800 17px/1.15 inherit}
.cf-ocard small{font:600 12px/1.3 inherit;opacity:.85}
.cf-ocard .cf-input{width:100%}
.cf-ocard input{text-transform:uppercase;letter-spacing:4px;text-align:center;font-size:22px!important;padding:8px!important}
.cf-note{font:600 12px/1.3 inherit;opacity:.8;text-align:center}
.cf-room{display:flex;gap:12px;align-items:stretch;justify-content:center;width:100%;max-width:820px;min-height:0}
.cf-rcode{flex:none;display:flex;flex-direction:column;align-items:center;gap:6px;background:rgba(255,255,255,.12);border-radius:18px;padding:10px;box-shadow:inset 0 0 0 2px rgba(255,255,255,.18)}
.cf-root .cf-rcode canvas{position:static;inset:auto;border-radius:12px;display:block}
.cf-rcode small{font:700 11px/1 inherit;opacity:.8}
.cf-code{display:flex;gap:3px}
.cf-code i{font:800 22px/1 inherit;font-style:normal;width:26px;height:32px;display:grid;place-items:center;background:#fff;color:#2a0b5c;border-radius:8px;box-shadow:0 3px 0 rgba(0,0,0,.3)}
.cf-rside{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;background:rgba(255,255,255,.08);border-radius:18px;padding:10px 12px;overflow:auto}
.cf-lbl{font:800 12px/1 inherit;opacity:.8;text-transform:uppercase;letter-spacing:.5px}
.cf-pl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.cf-p{display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:12px;background:rgba(20,8,48,.45);font:700 13.5px/1.1 inherit;min-width:0}
.cf-p i{flex:none;width:16px;height:16px;border-radius:50%;background:var(--c);box-shadow:0 0 0 2px #fff}
.cf-p b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-p em{flex:none;color:#ffd34a;display:flex}
.cf-p.me{box-shadow:inset 0 0 0 2px #ffd34a}
.cf-p.free{opacity:.55;font-weight:600}
.cf-p.free i{background:transparent;box-shadow:0 0 0 2px rgba(255,255,255,.5)}
.cf-rmode{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.cf-rmode .cf-town{min-height:36px;padding:4px 9px}
.cf-fr{display:flex;flex-direction:column;gap:4px}
.cf-f{display:flex;align-items:center;gap:6px;font:700 13px/1 inherit}
.cf-f b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cf-call{border:0;border-radius:10px;padding:6px 10px;font:800 12px/1 inherit;background:#ff4fa3;color:#fff;cursor:pointer;min-height:32px;display:inline-flex;align-items:center;gap:4px}
.cf-call.done{background:#2fb35a}
.cf-wait{font:700 14px/1.2 inherit;display:flex;align-items:center;gap:8px;background:rgba(20,8,48,.45);padding:10px 14px;border-radius:14px}
.cf-dots i{display:inline-block;width:7px;height:7px;margin:0 2px;border-radius:50%;background:#ffd34a;animation:cfdot 1s infinite alternate}
.cf-dots i:nth-child(2){animation-delay:.2s}.cf-dots i:nth-child(3){animation-delay:.4s}
@keyframes cfdot{to{opacity:.2;transform:translateY(-4px)}}
.cf-inv{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:14px;background:#fff;color:#2a0b5c;font:700 13px/1.2 inherit;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.cf-inv small{display:block;font-weight:600;opacity:.75}
@media (max-height:420px){.cf-on h1{font-size:19px}.cf-code i{font-size:19px;width:22px;height:28px}.cf-ocard{padding:9px}}
`;
let cssDone = false;
function css(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ------------------------------ convites ------------------------------ */
export interface CavaInvite {
  from: string;
  name: string;
  code: string;
  at: number;
}
/** consulta convites a cada ~6 s enquanto `alive()` */
export function pollInvites(me: () => Promise<Me | null>, cb: (inv: CavaInvite) => void, alive: () => boolean): void {
  const seen = new Set<string>();
  const tick = async () => {
    if (!alive()) return;
    try {
      const m = await me();
      if (m?.id) {
        const r = await api<{ invites: CavaInvite[] }>(`/cava/invites?id=${encodeURIComponent(m.id)}`);
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
function inviteCard(root: HTMLElement, inv: CavaInvite, onJoin: () => void): void {
  const d = document.createElement('div');
  d.className = 'cf-inv';
  d.innerHTML = `${icon('party', { size: 26 })}<span><b>${esc(inv.name)}</b><small>${esc(t('cavafala.net.invited', 'te chamou para cavar!'))}</small></span><button class="cf-btn g" data-go>${esc(t('cavafala.net.join', 'Entrar'))}</button>`;
  root.appendChild(d);
  tap('medium');
  sfx.sparkle();
  setTimeout(() => d.remove(), 30000);
  d.querySelector('[data-go]')!.addEventListener('click', () => {
    d.remove();
    onJoin();
  });
}

/* ------------------------------ criar / entrar ------------------------------ */
export interface StartOpts {
  me: () => Promise<Me | null>;
  create: () => void;
  join: (code: string) => void;
  back: () => void;
}
/** tela "Jogar com amigos": criar sala ou entrar numa */
export function fillStart(el: HTMLElement, o: StartOpts): () => void {
  css();
  let dead = false;
  el.classList.add('cf-on');
  el.innerHTML = `<button class="cf-x" data-back aria-label="${esc(t('cavafala.close', 'Fechar'))}">${icon('close', { size: 22 })}</button>
    <h1>${icon('party', { size: 28 })}${esc(t('cavafala.net.title', 'Jogar com amigos'))}</h1>
    <div class="cf-ocards">
      <div class="cf-ocard"><b>${esc(t('cavafala.net.create', 'Criar sala'))}</b><small>${esc(t('cavafala.net.createD', 'Você escolhe o modo e chama até 3 amigos. Vagas vazias viram bots na Arena.'))}</small><button class="cf-btn p" data-create>${icon('play', { size: 18 })}${esc(t('cavafala.net.createGo', 'Criar'))}</button></div>
      <div class="cf-ocard"><b>${esc(t('cavafala.net.joinTitle', 'Entrar na sala de um amigo'))}</b>
        <form class="cf-input" data-f><input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2M" aria-label="${esc(t('cavafala.net.code', 'Código da sala'))}"/><button class="cf-btn g" type="submit">${esc(t('cavafala.net.join', 'Entrar'))}</button></form>
        <button class="cf-btn w" data-scan type="button">${icon('camera', { size: 18 })}${esc(t('cavafala.net.scan', 'Escanear QR'))}</button>
      </div>
    </div>
    <div class="cf-note">${esc(t('cavafala.net.joinHint', 'Peça o código de 5 letras para quem criou a sala.'))}</div>
    <div class="cf-jinv"></div>`;
  const inp = el.querySelector('input') as HTMLInputElement;
  inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  el.querySelector('[data-f]')!.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inp.value.toUpperCase();
    if (!CODE_OK.test(v)) {
      notify(t('cavafala.net.badCode', 'Código com 5 letras, como K7Q2M'), { icon: 'warning', kind: 'bad' });
      return;
    }
    sfx.click();
    o.join(v);
  });
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    if (b.dataset.back !== undefined) {
      sfx.click();
      return o.back();
    }
    if (b.dataset.create !== undefined) {
      sfx.click();
      return o.create();
    }
    if (b.dataset.scan !== undefined) {
      sfx.click();
      const l = await scanBloopLink({ types: ['cava'], title: t('cavafala.net.scan', 'Escanear QR'), hint: t('cavafala.net.scanHint', 'Aponte para o QR da sala do amigo') });
      if (l && !dead) o.join(l.code);
    }
  });
  const box = el.querySelector('.cf-jinv') as HTMLElement;
  pollInvites(
    o.me,
    (inv) => inviteCard(box, inv, () => !dead && o.join(inv.code)),
    () => !dead && el.isConnected,
  );
  return () => {
    dead = true;
  };
}

/* ------------------------------ a sala ------------------------------ */
export type RoomMode = { mode: 'arena' | 'restore'; theme: ThemeId; bots: number };
export interface RoomOpts {
  net: CavaNet;
  party: boolean;
  /** escolha atual (anfitrião edita; convidado vê) */
  pick: () => RoomMode;
  setPick: (p: Partial<RoomMode>) => void;
  start: () => void;
  leave: () => void;
  /** texto de estado (ex.: "começando em 3...") */
  status?: () => string;
}
export interface RoomHandle {
  refresh(): void;
  dispose(): void;
}

export function fillRoom(el: HTMLElement, o: RoomOpts): RoomHandle {
  css();
  const net = o.net;
  const link = bloopLink('cava', net.code);
  let dead = false;
  const invited = new Set<string>();
  el.classList.add('cf-on');
  el.innerHTML = `<button class="cf-x" data-leave aria-label="${esc(t('cavafala.net.leave', 'Sair da sala'))}">${icon('close', { size: 22 })}</button>
    <h1>${icon('party', { size: 28 })}${esc(o.party ? t('cavafala.net.partyTitle', 'Grupo na Arena') : t('cavafala.net.title', 'Jogar com amigos'))}</h1>
    <div class="cf-room">
      <div class="cf-rcode"><canvas></canvas><small>${esc(t('cavafala.net.code', 'Código da sala'))}</small><div class="cf-code">${net.code
        .split('')
        .map((c) => `<i>${c}</i>`)
        .join('')}</div><button class="cf-btn w" data-share style="min-height:36px;padding:7px 12px;font-size:13px">${icon('link', { size: 16 })}${esc(t('cavafala.net.share', 'Mandar código'))}</button></div>
      <div class="cf-rside">
        <div class="cf-lbl" data-cnt></div>
        <div class="cf-pl"></div>
        <div class="cf-lbl">${esc(t('cavafala.net.mode', 'Modo'))}</div>
        <div class="cf-rmode"></div>
        ${net.isHost && !o.party ? `<div class="cf-lbl">${esc(t('cavafala.net.call', 'Chamar amigos'))}</div><div class="cf-fr"><div class="cf-note" style="text-align:left">${esc(t('cavafala.net.loading', 'Procurando amigos online…'))}</div></div>` : ''}
      </div>
    </div>
    <div class="cf-row" style="margin-top:2px" data-act></div>`;
  void drawBloopQr(el.querySelector('.cf-rcode canvas') as HTMLCanvasElement, link, 104).catch(() => {});
  const pl = el.querySelector('.cf-pl') as HTMLElement;
  const cnt = el.querySelector('[data-cnt]') as HTMLElement;
  const modeEl = el.querySelector('.cf-rmode') as HTMLElement;
  const act = el.querySelector('[data-act]') as HTMLElement;
  const refresh = () => {
    if (dead) return;
    const ps = net.peers;
    const pk = o.pick();
    cnt.textContent = t('cavafala.net.players', 'Na sala ({n}/{m})', { n: ps.length, m: MAX_PLAYERS });
    let h = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = ps[i];
      if (p)
        h += `<div class="cf-p${p.id === net.me.id ? ' me' : ''}"><i style="--c:${PCOLS[i]}"></i><b>${esc(p.id === net.me.id ? t('cavafala.net.you', '{n} (você)', { n: p.name }) : p.name)}</b>${p.id === net.hostId ? `<em title="${esc(t('cavafala.net.hostTag', 'anfitrião'))}">${icon('crown', { size: 16 })}</em>` : ''}</div>`;
      else h += `<div class="cf-p free"><i></i><b>${esc(pk.mode === 'arena' && i < ps.length + pk.bots ? t('cavafala.net.bot', 'Bot') : t('cavafala.net.free', 'Vaga livre'))}</b></div>`;
    }
    pl.innerHTML = h;
    // modo
    if (net.isHost && !o.party) {
      const free = MAX_PLAYERS - ps.length;
      modeEl.innerHTML =
        `<span class="cf-seg" data-seg="mode"><button data-v="arena" class="${pk.mode === 'arena' ? 'on' : ''}">${esc(t('cavafala.mode.arena', 'Arena Cava-Cava'))}</button><button data-v="restore" class="${pk.mode === 'restore' ? 'on' : ''}">${esc(t('cavafala.mode.restore', 'Restaurar a Vila'))}</button></span>` +
        (pk.mode === 'arena'
          ? `<span class="cf-lab">${esc(t('cavafala.net.bots', 'Bots'))}</span><span class="cf-seg" data-seg="bots">${Array.from({ length: free + 1 }, (_, k) => `<button data-v="${k}" class="${Math.min(pk.bots, free) === k ? 'on' : ''}">${k}</button>`).join('')}</span>`
          : THEMES.map((th) => `<button class="cf-town${pk.theme === th.id ? ' on' : ''}" data-town="${th.id}" style="--a:${th.card[0]};--b:${th.card[1]}"><b>${esc(th.name())}</b></button>`).join(''));
    } else {
      modeEl.innerHTML = `<span class="cf-chip" style="font-size:13px;padding:7px 11px">${esc(pk.mode === 'arena' ? t('cavafala.mode.arena', 'Arena Cava-Cava') : t('cavafala.mode.restore', 'Restaurar a Vila') + ' · ' + themeById(pk.theme).name())}</span>`;
    }
    const st = o.status?.() ?? '';
    if (net.isHost && !o.party)
      act.innerHTML = `<button class="cf-btn w" data-leave>${icon('home', { size: 18 })}${esc(t('cavafala.net.leave', 'Sair da sala'))}</button><button class="cf-btn g" data-start style="font-size:18px;padding:10px 22px">${icon('play', { size: 20 })}${esc(t('cavafala.net.play', 'JOGAR!'))}</button>`;
    else
      act.innerHTML = `<button class="cf-btn w" data-leave>${icon('home', { size: 18 })}${esc(t('cavafala.net.leave', 'Sair da sala'))}</button><span class="cf-wait"><span class="cf-dots"><i></i><i></i><i></i></span>${esc(st || t('cavafala.net.waitHost', 'Esperando o anfitrião começar…'))}</span>`;
  };
  refresh();
  // amigos online (anfitrião chama)
  const flist = el.querySelector('.cf-fr') as HTMLElement | null;
  const loadFriends = async () => {
    if (!flist) return;
    try {
      const { homeApi } = await import('../../services/home');
      const all = await homeApi.friends();
      if (dead) return;
      const on = all.filter((f) => f.online && !net.peers.some((p) => p.id === f.id)).slice(0, 8);
      if (!on.length) {
        flist.innerHTML = `<div class="cf-note" style="text-align:left">${esc(all.length ? t('cavafala.net.noneOnline', 'Nenhum amigo online agora. Mande o código!') : t('cavafala.net.noFriends', 'Sem amigos ainda. Mande o código ou mostre o QR!'))}</div>`;
        return;
      }
      flist.innerHTML = on
        .map((f) => `<div class="cf-f"><b>${esc(f.name || '@' + f.handle)}</b><button class="cf-call${invited.has(f.id) ? ' done' : ''}" data-call="${esc(f.id)}">${esc(invited.has(f.id) ? t('cavafala.net.called', 'Chamado') : t('cavafala.net.callOne', 'Chamar'))}</button></div>`)
        .join('');
    } catch {
      if (!dead) flist.innerHTML = `<div class="cf-note" style="text-align:left">${esc(t('cavafala.net.noFriends', 'Sem amigos ainda. Mande o código ou mostre o QR!'))}</div>`;
    }
  };
  void loadFriends();
  const fTimer = window.setInterval(() => void loadFriends(), 20000);
  const share = async () => {
    const txt = t('cavafala.net.shareTxt', 'Vem cavar comigo no Cava & Fala (Bloop World)! Código: {c}', { c: net.code });
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
      notify(t('cavafala.net.copied', 'Código copiado!'), { icon: 'check', kind: 'good' });
    } catch {
      notify(net.code, { icon: 'link' });
    }
  };
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    if (b.dataset.leave !== undefined) {
      sfx.click();
      return o.leave();
    }
    if (b.dataset.start !== undefined) {
      sfx.click();
      return o.start();
    }
    if (b.dataset.share !== undefined) {
      sfx.click();
      return void share();
    }
    if (b.dataset.town) {
      sfx.click();
      o.setPick({ theme: b.dataset.town as ThemeId });
      return refresh();
    }
    const seg = b.closest<HTMLElement>('[data-seg]');
    if (seg && b.dataset.v != null) {
      sfx.click();
      if (seg.dataset.seg === 'mode') o.setPick({ mode: b.dataset.v as 'arena' | 'restore' });
      if (seg.dataset.seg === 'bots') o.setPick({ bots: +b.dataset.v });
      return refresh();
    }
    if (b.dataset.call) {
      const id = b.dataset.call;
      if (invited.has(id)) return;
      sfx.click();
      invited.add(id);
      b.classList.add('done');
      b.textContent = t('cavafala.net.called', 'Chamado');
      try {
        await api('/cava/invite', { id: net.me.id, to: id, code: net.code, name: net.me.name });
      } catch {
        invited.delete(id);
        notify(t('cavafala.net.callFail', 'Não deu para chamar agora'), { icon: 'cloud-off', kind: 'bad' });
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
