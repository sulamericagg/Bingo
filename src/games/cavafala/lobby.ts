/* ============================================================
 *  CAVA & FALA — telas online, AMIGOS PRIMEIRO (componentes do grupo: src/party/friends-play.ts):
 *   - "Jogar com amigos": "Fulano está jogando — ENTRAR", botão grande "Criar sala e chamar amigos";
 *     "Entrar com código / QR" é só um link pequeno.
 *   - a SALA: quem está (4 lugares; vagas viram bots na Arena), modo do anfitrião, "Chamar amigos"
 *     (convite na hora, sem código) e JOGAR. O código/QR fica num link pequeno no rodapé.
 * ============================================================ */
import { sfx } from '../../3d/common/sfx';
import { t } from '../../i18n';
import { icon } from '../../ui/icons';
import { notify } from '../../ui/notify';
import { bloopLink, drawBloopQr, scanBloopLink } from '../../ui/scan';
import { THEMES, themeById, type ThemeId } from './data';
import { CODE_OK, MAX_PLAYERS, type CavaNet } from './net';
import { PCOLS } from './online';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const CSS = `
.cf-on{justify-content:flex-start;gap:6px}
.cf-big{font-size:18px!important;padding:14px 22px!important;min-height:56px!important}
.cf-link{border:0;background:none;color:#fff;opacity:.8;font:700 13px/1 inherit;text-decoration:underline;cursor:pointer;padding:8px;min-height:36px}
.cf-codepop{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(16,6,40,.6)}
.cf-root .cf-codepop canvas{position:static;inset:auto;border-radius:12px;display:block}
.cf-codepop>div{background:#fff;color:#2a0b5c;border-radius:20px;padding:14px;display:flex;gap:14px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.4)}
.cf-codepop small{font:700 12px/1 inherit;opacity:.7}
.cf-codepop .cf-code i{box-shadow:0 3px 0 #c8b8ff;background:#f3eeff}
.cf-jform{display:none;width:min(320px,80vw)}
.cf-jform.on{display:flex}
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

/* ------------------------------ criar / entrar ------------------------------ */
export interface StartOpts {
  create: () => void;
  join: (code: string) => void;
  back: () => void;
}
/** tela "Jogar com amigos": amigos jogando (ENTRAR) + criar sala; código/QR é secundário */
export function fillStart(el: HTMLElement, o: StartOpts): () => void {
  css();
  let dead = false;
  el.classList.add('cf-on');
  el.innerHTML = `<button class="cf-x" data-back aria-label="${esc(t('cavafala.close', 'Fechar'))}">${icon('close', { size: 22 })}</button>
    <h1>${icon('party', { size: 28 })}${esc(t('cavafala.net.title', 'Jogar com amigos'))}</h1>
    <div class="cf-fplay"></div>
    <div class="cf-sub">${esc(t('cavafala.net.createD', 'Você escolhe o modo e chama até 3 amigos. Vagas vazias viram bots na Arena.'))}</div>
    <button class="cf-btn p cf-big" data-create>${icon('party', { size: 24 })}${esc(t('cavafala.net.createCall', 'Criar sala e chamar amigos'))}</button>
    <button class="cf-link" data-code type="button">${esc(t('fp.code', 'Entrar com código / QR'))}</button>
    <form class="cf-input cf-jform" data-f><input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2M" aria-label="${esc(t('cavafala.net.code', 'Código da sala'))}"/><button class="cf-btn g" type="submit">${esc(t('cavafala.net.join', 'Entrar'))}</button><button class="cf-btn w" data-scan type="button" aria-label="${esc(t('cavafala.net.scan', 'Escanear QR'))}">${icon('camera', { size: 18 })}</button></form>`;
  void import('../../party/friends-play').then((f) => !dead && f.playingStrip(el.querySelector('.cf-fplay') as HTMLElement, 'cavafala'));
  const form = el.querySelector('[data-f]') as HTMLFormElement;
  const inp = el.querySelector('input') as HTMLInputElement;
  inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  form.addEventListener('submit', (e) => {
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
    if (b.dataset.code !== undefined) {
      sfx.click();
      form.classList.add('on');
      b.remove();
      inp.focus();
      return;
    }
    if (b.dataset.scan !== undefined) {
      sfx.click();
      const l = await scanBloopLink({ types: ['cava'], title: t('cavafala.net.scan', 'Escanear QR'), hint: t('cavafala.net.scanHint', 'Aponte para o QR da sala do amigo') });
      if (l && !dead) o.join(l.code);
    }
  });
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
  /** chamar amigos já ao abrir (quem criou a sala pelo botão "Criar sala e chamar amigos") */
  callNow?: boolean;
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
  el.classList.add('cf-on');
  el.innerHTML = `<button class="cf-x" data-leave aria-label="${esc(t('cavafala.net.leave', 'Sair da sala'))}">${icon('close', { size: 22 })}</button>
    <h1>${icon('party', { size: 28 })}${esc(o.party ? t('cavafala.net.partyTitle', 'Grupo na Arena') : t('cavafala.net.title', 'Jogar com amigos'))}</h1>
    <div class="cf-room"><div class="cf-rside">
      <div class="cf-lbl" data-cnt></div>
      <div class="cf-pl"></div>
      <div class="cf-lbl">${esc(t('cavafala.net.mode', 'Modo'))}</div>
      <div class="cf-rmode"></div>
    </div></div>
    <div class="cf-row" style="margin-top:2px" data-act></div>
    <button class="cf-link" data-codepop>${esc(t('cavafala.net.codeLink', 'Código {c} · QR', { c: net.code }))}</button>`;
  const pl = el.querySelector('.cf-pl') as HTMLElement;
  const cnt = el.querySelector('[data-cnt]') as HTMLElement;
  const modeEl = el.querySelector('.cf-rmode') as HTMLElement;
  const act = el.querySelector('[data-act]') as HTMLElement;
  const callFriends = () =>
    void Promise.all([import('../../party/friends-play'), import('../../party/join')]).then(([f, j]) =>
      f.openCallFriends({ game: 'cavafala', j: j.joinStr('cavafala', net.code), onCode: codePop }),
    );
  /** código + QR (para quem ainda não é amigo) */
  const codePop = () => {
    el.querySelector('.cf-codepop')?.remove();
    const d = document.createElement('div');
    d.className = 'cf-codepop';
    d.innerHTML = `<div><canvas></canvas><div style="display:flex;flex-direction:column;gap:8px;align-items:center"><small>${esc(t('cavafala.net.code', 'Código da sala'))}</small><div class="cf-code">${net.code
      .split('')
      .map((c) => `<i>${c}</i>`)
      .join('')}</div><button class="cf-btn" data-share>${icon('link', { size: 16 })}${esc(t('cavafala.net.share', 'Mandar código'))}</button><button class="cf-btn w" data-close>${esc(t('cavafala.close', 'Fechar'))}</button></div></div>`;
    el.appendChild(d);
    void drawBloopQr(d.querySelector('canvas') as HTMLCanvasElement, link, 140).catch(() => {});
    d.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (e.target === d || b?.dataset.close !== undefined) d.remove();
      else if (b?.dataset.share !== undefined) void share();
    });
  };
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
    const call = o.party ? '' : `<button class="cf-btn p" data-call>${icon('party', { size: 20 })}${esc(t('cavafala.net.call', 'Chamar amigos'))}</button>`;
    if (net.isHost && !o.party)
      act.innerHTML = `<button class="cf-btn w" data-leave>${icon('home', { size: 18 })}${esc(t('cavafala.net.leave', 'Sair da sala'))}</button>${call}<button class="cf-btn g" data-start style="font-size:18px;padding:10px 22px">${icon('play', { size: 20 })}${esc(t('cavafala.net.play', 'JOGAR!'))}</button>`;
    else
      act.innerHTML = `<button class="cf-btn w" data-leave>${icon('home', { size: 18 })}${esc(t('cavafala.net.leave', 'Sair da sala'))}</button>${call}<span class="cf-wait"><span class="cf-dots"><i></i><i></i><i></i></span>${esc(st || t('cavafala.net.waitHost', 'Esperando o anfitrião começar…'))}</span>`;
  };
  refresh();
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
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead || b.closest('.cf-codepop')) return;
    if (b.dataset.leave !== undefined) {
      sfx.click();
      return o.leave();
    }
    if (b.dataset.start !== undefined) {
      sfx.click();
      return o.start();
    }
    if (b.dataset.call !== undefined) {
      sfx.click();
      return callFriends();
    }
    if (b.dataset.codepop !== undefined) {
      sfx.click();
      return codePop();
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
  });
  if (o.callNow) callFriends();
  return {
    refresh,
    dispose: () => {
      dead = true;
      document.querySelector('.fp-pop')?.remove();
    },
  };
}
