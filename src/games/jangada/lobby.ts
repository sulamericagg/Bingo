/* ============================================================
 *  JANGADA BLOOP — telas online, AMIGOS PRIMEIRO (componentes do grupo:
 *  src/party/friends-play.ts): "Fulano está jogando — ENTRAR", botão grande
 *  "Criar jangada e chamar amigos"; código só num link pequeno.
 *  A SALA: até 4 Bloops, "Chamar amigos" e ZARPAR (anfitrião).
 * ============================================================ */
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { diffName, type Diff } from './data';
import { jIcon } from './icons';
import { CODE_OK, MAX_PLAYERS, type JNet } from './net';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const PCOLS = ['#ffd34a', '#7fd8ff', '#ff8ab8', '#7ad86a'];

export interface StartOpts {
  create: () => void;
  join: (code: string) => void;
  back: () => void;
  click: () => void;
}
export function fillStart(el: HTMLElement, o: StartOpts): () => void {
  let dead = false;
  el.innerHTML = `<div class="ttl" style="font-size:28px">${jIcon('people', 40)}${esc(t('jangada.net.title', 'Jogar com amigos'))}</div>
    <div class="jg-fplay"></div>
    <div class="sub">${esc(t('jangada.net.createD', 'Todo mundo na mesma jangada: até 4 Bloops!'))}</div>
    <div class="jg-row"><button class="jg-b p" data-create style="font-size:19px;padding:12px 20px">${jIcon('people', 28)}${esc(t('jangada.net.createCall', 'Criar jangada e chamar amigos'))}</button></div>
    <button class="jg-b w" data-code style="min-height:36px;padding:6px 12px;font-size:13px">${esc(t('fp.code', 'Entrar com código / QR'))}</button>
    <form class="jg-row" data-f style="display:none"><input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2M" style="font:800 22px/1 Fredoka,system-ui;letter-spacing:4px;text-align:center;width:150px;padding:8px;border-radius:12px;border:0" aria-label="${esc(t('jangada.net.code', 'Código da sala'))}"/><button class="jg-b g" type="submit">${esc(t('jangada.net.join', 'Entrar'))}</button></form>
    <button class="jg-b w" data-back>${esc(t('jangada.back', 'Voltar'))}</button>`;
  void import('../../party/friends-play').then((f) => !dead && f.playingStrip(el.querySelector('.jg-fplay') as HTMLElement, 'jangada'));
  const form = el.querySelector('[data-f]') as HTMLFormElement;
  const inp = el.querySelector('input') as HTMLInputElement;
  inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
  inp.addEventListener('keydown', (e) => e.stopPropagation());
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = inp.value.toUpperCase();
    if (!CODE_OK.test(v)) {
      notify(t('jangada.net.badCode', 'Código com 5 letras, como K7Q2M'), { icon: 'warning', kind: 'bad' });
      return;
    }
    o.click();
    o.join(v);
  });
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    if (b.dataset.back !== undefined) {
      o.click();
      return o.back();
    }
    if (b.dataset.create !== undefined) {
      o.click();
      return o.create();
    }
    if (b.dataset.code !== undefined) {
      o.click();
      form.style.display = 'flex';
      b.remove();
      inp.focus();
    }
  });
  return () => {
    dead = true;
  };
}

export interface RoomOpts {
  net: JNet;
  party: boolean;
  diff: () => Diff;
  start: () => void;
  leave: () => void;
  callNow?: boolean;
  status?: () => string;
  click: () => void;
}
export interface RoomHandle {
  refresh(): void;
  dispose(): void;
}
export function fillRoom(el: HTMLElement, o: RoomOpts): RoomHandle {
  const net = o.net;
  let dead = false;
  el.innerHTML = `<div class="ttl" style="font-size:26px">${jIcon('found', 40)}${esc(o.party ? t('jangada.net.partyTitle', 'Grupo na jangada') : t('jangada.net.title', 'Jogar com amigos'))}</div>
    <div class="jg-card" style="min-width:min(420px,90vw)"><div data-cnt style="font:800 13px/1 Fredoka,system-ui;opacity:.7;margin-bottom:6px"></div><div data-pl style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div><div data-diff style="margin-top:8px;font:700 13px/1 Fredoka,system-ui"></div></div>
    <div class="jg-row" data-act></div>
    <button class="jg-b w" data-codepop style="min-height:34px;padding:5px 12px;font-size:13px">${esc(t('jangada.net.codeLink', 'Código {c}', { c: net.code }))}</button>`;
  const pl = el.querySelector('[data-pl]') as HTMLElement;
  const act = el.querySelector('[data-act]') as HTMLElement;
  const callFriends = () =>
    void Promise.all([import('../../party/friends-play'), import('../../party/join')]).then(([f, j]) =>
      f.openCallFriends({ game: 'jangada', j: j.joinStr('jangada', net.code), onCode: () => codePop() }),
    );
  const codePop = () => notify(t('jangada.net.codeIs', 'Código da sala: {c}', { c: net.code }), { icon: 'link', ms: 6000 });
  const refresh = () => {
    if (dead) return;
    const ps = net.peers;
    (el.querySelector('[data-cnt]') as HTMLElement).textContent = t('jangada.net.players', 'Na jangada ({n}/{m})', { n: ps.length, m: MAX_PLAYERS });
    let h = '';
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = ps[i];
      h += p
        ? `<div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:12px;background:#fff;box-shadow:inset 0 0 0 2px ${PCOLS[i]};font:700 14px/1.1 Fredoka,system-ui;min-width:0"><i style="flex:none;width:14px;height:14px;border-radius:50%;background:${PCOLS[i]}"></i><b style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.id === net.me.id ? t('jangada.net.you', '{n} (você)', { n: p.name }) : p.name)}</b>${p.id === net.hostId ? jIcon('star', 18) : ''}</div>`
        : `<div style="padding:6px 8px;border-radius:12px;background:#f0e8d8;opacity:.6;font:600 13px/1.1 Fredoka,system-ui">${esc(t('jangada.net.free', 'Vaga livre'))}</div>`;
    }
    pl.innerHTML = h;
    (el.querySelector('[data-diff]') as HTMLElement).innerHTML = `${jIcon('shark', 18)} ${esc(diffName(o.diff()))}`;
    const st = o.status?.() ?? '';
    const call = o.party ? '' : `<button class="jg-b p" data-call>${jIcon('people', 22)}${esc(t('jangada.net.call', 'Chamar amigos'))}</button>`;
    act.innerHTML = net.isHost && !o.party
      ? `<button class="jg-b w" data-leave>${esc(t('jangada.net.leave', 'Sair da sala'))}</button>${call}<button class="jg-b g" data-start style="font-size:19px">${jIcon('sail', 24)}${esc(t('jangada.net.play', 'ZARPAR!'))}</button>`
      : `<button class="jg-b w" data-leave>${esc(t('jangada.net.leave', 'Sair da sala'))}</button>${call}<span class="jg-cost">${esc(st || t('jangada.net.waitHost', 'Esperando o anfitrião zarpar…'))}</span>`;
  };
  refresh();
  el.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (!b || dead) return;
    o.click();
    if (b.dataset.leave !== undefined) return o.leave();
    if (b.dataset.start !== undefined) return o.start();
    if (b.dataset.call !== undefined) return callFriends();
    if (b.dataset.codepop !== undefined) return codePop();
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
