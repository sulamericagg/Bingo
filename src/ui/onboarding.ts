/**
 * ONBOARDING (1ª abertura, logo depois da abertura do estúdio e antes do hub):
 *   apelido (moderado localmente com as regras do chat) → @nome (com checagem online ou
 *   "pendente" offline) → escolha rápida de Bloop (opcional). "Depois" pula tudo e dá um
 *   apelido divertido gerado.
 *
 * openProfileEditor() reaproveita o mesmo formulário em Ajustes (trocar apelido e @).
 * Enquanto está aberto, o hub fica "ocupado" (.ob-root) — nenhum pop-up automático
 * (anúncio da temporada, banner, ofertas) aparece por cima.
 */
import './onboarding.css';
import { audio } from '../core/audio';
import { pushBack } from '../core/back';
import { unlockSkin } from '../core/economy';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { persist, save } from '../core/storage';
import { renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import { t } from '../i18n';
import { getPlayer } from '../services/online';
import {
  applyNick,
  checkHandleOnline,
  checkNick,
  claimHandle,
  cleanHandleInput,
  funName,
  handleLocalIssue,
  localSuggestions,
  nickIssueText,
  profile,
  saveProfile,
} from '../services/profile';
import { icon } from './icons';

const QUICK_SKINS = ['bloop', 'mint', 'sunny'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface FormOpts {
  mode: 'first' | 'edit';
  onSkin?: () => void;
}

/** Já fez (ou pulou) o onboarding? */
export const onboardingDone = (): boolean => profile.onboarded;

/** Mostra o onboarding se for a 1ª vez. Resolve quando a pessoa termina ou pula. */
export function runOnboarding(onSkin?: () => void): Promise<void> {
  if (profile.onboarded) return Promise.resolve();
  if (/[?&](noob|skipob)\b/.test(location.search)) return Promise.resolve();
  return openForm({ mode: 'first', onSkin });
}

/** Ajustes → editar apelido e @nome. */
export function openProfileEditor(): Promise<void> {
  return openForm({ mode: 'edit' });
}

function currentNick(): string {
  if (profile.nick) return profile.nick;
  const n = getPlayer()?.name ?? '';
  return /^Bloop#\d+$/.test(n) ? '' : n;
}

function openForm(o: FormOpts): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector('.ob-root')) return resolve();
    const first = o.mode === 'first';
    const root = document.createElement('div');
    root.className = 'ob-root' + (first ? ' ob-first' : ' ob-edit');
    const placeholder = funName();
    let handleTouched = !!profile.handle;
    let chosenSkin = save.skin;
    let checkTimer = 0;
    let checkSeq = 0;
    let busy = false;

    root.innerHTML = `
      <div class="ob-card" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        ${first ? `<div class="ob-hello">${icon('party', { size: 40 })}</div>` : `<button class="icon-btn close ob-x" aria-label="${esc(t('common.close', 'Fechar'))}">${icon('close')}</button>`}
        <h2 id="ob-title">${first ? t('ob.title', 'Como você quer ser chamado?') : t('ob.editTitle', 'Seu perfil')}</h2>
        ${first ? `<p class="ob-sub">${t('ob.sub', 'Esse é o nome que seus amigos vão ver no Bloop World.')}</p>` : ''}
        <label class="ob-label" for="ob-nick">${t('ob.nickLabel', 'Apelido')}</label>
        <div class="ob-field">
          <input id="ob-nick" maxlength="20" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="${esc(placeholder)}" value="${esc(currentNick())}" />
          <button class="ob-dice" type="button" aria-label="${esc(t('ob.dice', 'Sortear um nome'))}">${icon('refresh', { size: 26 })}</button>
        </div>
        <div class="ob-msg" id="ob-nick-msg"></div>

        <label class="ob-label" for="ob-handle">${t('ob.handleLabel', 'Seu @ (para amigos te acharem)')}</label>
        <div class="ob-field ob-at"><b>@</b>
          <input id="ob-handle" maxlength="16" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="${esc(t('ob.handlePh', 'seu_nome'))}" value="${esc(profile.handle)}" />
        </div>
        <div class="ob-msg" id="ob-handle-msg"></div>
        <div class="ob-sugs" id="ob-sugs"></div>
        <p class="ob-rules">${t('ob.rules', '3 a 16 caracteres: letras, números, _ e . — nada de telefone, rede social ou nome completo.')}</p>

        ${
          first
            ? `<div class="ob-label">${t('ob.skinLabel', 'Escolha seu Bloop (opcional)')}</div>
        <div class="ob-skins" id="ob-skins">${QUICK_SKINS.map((id) => `<button class="ob-skin${id === chosenSkin ? ' on' : ''}" data-skin="${id}" aria-label="${esc(skinById(id).name)}"></button>`).join('')}</div>`
            : ''
        }
        <button class="btn btn-green ob-go" id="ob-go">${first ? t('ob.go', 'Bora jogar!') : t('ob.save', 'Salvar')}</button>
        <button class="link ob-later" id="ob-later">${first ? t('ob.later', 'Depois') : t('common.cancel', 'Cancelar')}</button>
      </div>`;
    document.body.appendChild(root);

    const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T;
    const nickIn = $<HTMLInputElement>('#ob-nick');
    const handleIn = $<HTMLInputElement>('#ob-handle');
    const nickMsg = $('#ob-nick-msg');
    const handleMsg = $('#ob-handle-msg');
    const sugs = $('#ob-sugs');

    // Bloops (previews)
    root.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) => {
      try {
        b.appendChild(renderSkinPreview(skinById(b.dataset.skin!), 64));
      } catch {
        /* sem preview */
      }
      const nm = document.createElement('small');
      nm.textContent = skinById(b.dataset.skin!).name;
      b.appendChild(nm);
      b.onclick = () => {
        haptics.tap('light');
        audio.click();
        chosenSkin = b.dataset.skin!;
        root.querySelectorAll('.ob-skin').forEach((x) => x.classList.toggle('on', x === b));
      };
    });

    const setMsg = (el: HTMLElement, text: string, kind: 'ok' | 'bad' | 'info' | '' = '') => {
      el.textContent = text;
      el.className = 'ob-msg' + (kind ? ' ' + kind : '');
    };

    const showSugs = (list: string[]) => {
      sugs.innerHTML = '';
      for (const s of list.slice(0, 4)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ob-sug';
        b.textContent = '@' + s;
        b.onclick = () => {
          handleIn.value = s;
          handleTouched = true;
          haptics.tap('light');
          onHandle();
        };
        sugs.appendChild(b);
      }
    };

    const nickValue = () => nickIn.value.replace(/\s+/g, ' ').trim();

    const onNick = () => {
      const v = nickValue();
      const p = v ? checkNick(v) : null;
      setMsg(nickMsg, p ? nickIssueText(p) : '', p ? 'bad' : '');
      if (!handleTouched) {
        const base = v || nickIn.placeholder;
        const s = localSuggestions(base, 4);
        if (!handleIn.value || !handleTouched) handleIn.value = s[0] ?? '';
        showSugs(s.slice(1));
        onHandle(false);
      }
    };

    const onHandle = (fromUser = true) => {
      if (fromUser) handleTouched = true;
      const clean = cleanHandleInput(handleIn.value);
      if (clean !== handleIn.value) handleIn.value = clean;
      clearTimeout(checkTimer);
      const seq = ++checkSeq;
      if (!clean) {
        setMsg(handleMsg, first ? t('ob.handleOptional', 'Pode escolher depois, se quiser.') : '', 'info');
        return;
      }
      if (profile.handleStatus === 'ok' && clean === profile.handle) {
        setMsg(handleMsg, t('ob.handleYours', 'Esse @ já é seu.'), 'ok');
        return;
      }
      const local = handleLocalIssue(clean);
      if (local) {
        setMsg(handleMsg, local === 'invalid' ? t('ob.handleInvalid', 'Use 3 a 16 caracteres (a-z, 0-9, _ e .).') : t('ob.handleBlocked', 'Esse @ não pode. Tente outro!'), 'bad');
        if (local === 'blocked') showSugs(localSuggestions(nickValue() || nickIn.placeholder));
        return;
      }
      setMsg(handleMsg, t('ob.checking', 'Verificando…'), 'info');
      checkTimer = window.setTimeout(async () => {
        const r = await checkHandleOnline(clean);
        if (seq !== checkSeq || !root.isConnected) return;
        if (r.kind === 'ok') {
          setMsg(handleMsg, t('ob.free', '@{h} está livre!', { h: clean }), 'ok');
          showSugs([]);
        } else if (r.kind === 'offline') setMsg(handleMsg, t('ob.offline', 'Sem internet agora — vamos confirmar quando estiver online.'), 'info');
        else {
          setMsg(handleMsg, r.kind === 'taken' ? t('ob.taken', '@{h} já tem dono. Que tal um destes?', { h: clean }) : t('ob.handleBlocked', 'Esse @ não pode. Tente outro!'), 'bad');
          showSugs(r.suggestions.length ? r.suggestions : localSuggestions(clean));
        }
      }, 450);
    };

    nickIn.addEventListener('input', onNick);
    handleIn.addEventListener('input', () => onHandle(true));
    $('.ob-dice')?.addEventListener('click', () => {
      haptics.tap('light');
      audio.click();
      nickIn.value = funName();
      onNick();
    });
    for (const inp of [nickIn, handleIn])
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (inp === nickIn ? handleIn : $('#ob-go')).focus();
        }
      });

    let popBack = () => {};
    const close = () => {
      clearTimeout(checkTimer);
      popBack();
      root.classList.add('out');
      setTimeout(() => root.remove(), 220);
      if (first) {
        profile.onboarded = true;
        saveProfile();
        bus.emit('onboarding-done');
      }
      bus.emit('profile');
      resolve();
    };
    // Android voltar: no 1º acesso equivale a "Depois"; em Ajustes fecha
    const onBack = () => (first ? skip() : close());
    popBack = pushBack(onBack);

    const applySkin = () => {
      if (!first || chosenSkin === save.skin) return;
      unlockSkin(chosenSkin); // presente de boas-vindas (só o escolhido)
      save.skin = chosenSkin;
      persist();
      o.onSkin?.();
      bus.emit('cosmetics');
    };

    const skip = () => {
      if (first) {
        const n = nickValue();
        applyNick(n && !checkNick(n) ? n : currentNick() || nickIn.placeholder);
      }
      close();
    };

    const go = async () => {
      if (busy) return;
      let n = nickValue();
      if (!n) n = nickIn.placeholder;
      const p = checkNick(n);
      if (p) {
        setMsg(nickMsg, nickIssueText(p), 'bad');
        nickIn.focus();
        haptics.tap('heavy');
        return;
      }
      const h = cleanHandleInput(handleIn.value);
      const goBtn = $<HTMLButtonElement>('#ob-go');
      if (h && !(profile.handleStatus === 'ok' && h === profile.handle)) {
        const local = handleLocalIssue(h);
        if (local) {
          onHandle();
          handleIn.focus();
          haptics.tap('heavy');
          return;
        }
        busy = true;
        goBtn.disabled = true;
        setMsg(handleMsg, t('ob.saving', 'Guardando seu @…'), 'info');
        const r = await claimHandle(h);
        busy = false;
        goBtn.disabled = false;
        if (r === 'locked') {
          setMsg(handleMsg, t('ob.handleLocked', 'Seu @ continua @{h} (dá para trocar 1x a cada 30 dias).', { h: profile.handle }), 'bad');
          handleIn.value = profile.handle;
          return;
        }
        if (r === 'taken' || r === 'blocked' || r === 'invalid') {
          setMsg(handleMsg, r === 'taken' ? t('ob.taken', '@{h} já tem dono. Que tal um destes?', { h }) : t('ob.handleBlocked', 'Esse @ não pode. Tente outro!'), 'bad');
          showSugs(localSuggestions(h));
          handleIn.focus();
          return;
        }
        if (r === 'pending') bus.emit('toast', t('ob.pendingToast', 'Seu @ fica guardado e confirmamos quando você estiver online.'));
      }
      haptics.tap('medium');
      audio.click();
      applyNick(n);
      applySkin();
      close();
    };

    $('#ob-go').onclick = () => void go();
    $('#ob-later').onclick = () => skip();
    $('.ob-x')?.addEventListener('click', () => close());

    onNick();
    if (profile.handle) onHandle(false);
    requestAnimationFrame(() => root.classList.add('on'));
    if (!first) setTimeout(() => nickIn.focus(), 250);
  });
}
