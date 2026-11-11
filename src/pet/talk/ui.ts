/* ============================================================
 *  CONVERSAR com o bichinho — interface na Casa do Bloop.
 *   - botão "Conversar" (lado direito) abre a barra de conversa no lugar da bandeja;
 *   - segurar o microfone = falar (vira texto no aparelho); teclado = digitar;
 *   - o bichinho responde no balão + voz escolhida (seletor de vozes) + animação;
 *   - transcrição opcional (pequena, no alto); limite diário de IA → oferta de vídeo.
 * ============================================================ */
import { save } from '../../core/storage';
import { tap } from '../../core/haptics';
import { t } from '../../i18n';
import { rewardedAvailable, showRewarded } from '../../services/ads';
import { esc } from '../../ui/dom';
import { icon, type IconName } from '../../ui/icons';
import { AI_AD_BONUS, addAiBonus, aiLeft, ask, isPro, setTalkPref, talkPrefs } from './brain';
import { cancelListening, listen, stopListening, sttAvailable } from './stt';
import { PET_VOICES, speak, stopSpeaking, voiceById } from './tts';
import type { PetAction, PetEmotion, PetSnapshot, TalkTurn } from './types';

export interface TalkHost {
  root: HTMLElement;
  say(text: string, secs: number): void;
  react(emotion: PetEmotion, action?: PetAction): void;
  snapshot(): PetSnapshot;
  /** modo conversa ligado/desligado (a tela esconde a bandeja e o "Falar") */
  setActive(on: boolean): void;
  toast(msg: string, ico?: IconName): void;
  /** desliga o "repete o que você fala" (o microfone é um só) */
  stopRepeat(): void;
}

let host: TalkHost | null = null;
let active = false;
let busy = false;
let holding = false;
let capOffered = false;
const history: TalkTurn[] = [];

const q = <T extends HTMLElement = HTMLElement>(s: string) => host!.root.querySelector(s) as T;

const chatSvg = () =>
  `<svg class="ico" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><path d="M5 7.5C5 5.6 6.6 4 8.5 4h15C25.4 4 27 5.6 27 7.5v10c0 1.9-1.6 3.5-3.5 3.5H14l-6 5v-5h0.5C6.6 21 5 19.4 5 17.5z" fill="#fff" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><circle cx="11" cy="12.5" r="1.8" fill="currentColor"/><circle cx="16" cy="12.5" r="1.8" fill="currentColor"/><circle cx="21" cy="12.5" r="1.8" fill="currentColor"/></svg>`;
const micSvg = (s = 34) =>
  `<svg class="ico" viewBox="0 0 32 32" width="${s}" height="${s}" aria-hidden="true"><rect x="11" y="3" width="10" height="17" rx="5" fill="#fff" stroke="currentColor" stroke-width="2.4"/><path d="M7 15a9 9 0 0 0 18 0M16 24v5M11 29h10" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const kbdSvg = () =>
  `<svg class="ico" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><rect x="3" y="8" width="26" height="16" rx="3.5" fill="#fff" stroke="currentColor" stroke-width="2.4"/><path d="M8 13h2M13 13h2M18 13h2M23 13h1M8 18h1M11 19h10M23 18h1" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;
const logSvg = () =>
  `<svg class="ico" viewBox="0 0 32 32" width="24" height="24" aria-hidden="true"><rect x="6" y="4" width="20" height="24" rx="3" fill="#fff" stroke="currentColor" stroke-width="2.4"/><path d="M11 11h10M11 16h10M11 21h6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

/** Monta a interface dentro da tela do bichinho (uma vez). */
export function mountTalk(h: TalkHost): void {
  host = h;
  const r = h.root;
  r.insertAdjacentHTML(
    'beforeend',
    `<button class="pet-talk-btn" aria-label="${esc(t('pet.talk.btn', 'Conversar'))}">${chatSvg()}<span>${esc(t('pet.talk.btn', 'Conversar'))}</span></button>
    <div class="pet-talk-log" aria-live="polite"></div>
    <div class="pet-talk">
      <div class="pet-talk-me"></div>
      <form class="pet-talk-type"><input type="text" maxlength="200" enterkeyhint="send" autocomplete="off" placeholder="${esc(t('pet.talk.ph', 'Escreva para o seu bichinho...'))}"><button class="pet-btn pet-big" type="submit">${esc(t('pet.talk.send', 'Enviar'))}</button></form>
      <div class="pet-talk-row">
        <button class="pet-talk-ic pet-talk-kbd" aria-label="${esc(t('pet.talk.kbd', 'Digitar'))}">${kbdSvg()}</button>
        <button class="pet-talk-ic pet-talk-voice" aria-label="${esc(t('pet.talk.voices', 'Vozes'))}"><b></b></button>
        <button class="pet-talk-hold" aria-label="${esc(t('pet.talk.hold', 'Segure para falar'))}">${micSvg()}<span>${esc(t('pet.talk.hold', 'Segure para falar'))}</span></button>
        <button class="pet-talk-ic pet-talk-tr" aria-label="${esc(t('pet.talk.transcript', 'Conversa escrita'))}">${logSvg()}</button>
        <button class="pet-talk-ic pet-talk-x" aria-label="${esc(t('pet.talk.close', 'Fechar conversa'))}">${icon('close', { size: 22 })}</button>
      </div>
      <small class="pet-talk-quota"></small>
    </div>
    <div class="pet-modal pet-voices"><div class="pet-card"></div></div>
    <div class="pet-modal pet-aicap"><div class="pet-card"></div></div>
    <div class="pet-modal pet-tintro"><div class="pet-card"></div></div>`,
  );
  q('.pet-talk-btn').addEventListener('click', () => {
    tap('light');
    if (!talkPrefs().intro) showIntro();
    else setActive(true);
  });
  q('.pet-talk-x').addEventListener('click', () => setActive(false));
  q('.pet-talk-kbd').addEventListener('click', () => toggleKeyboard());
  q('.pet-talk-voice').addEventListener('click', () => openVoices());
  q('.pet-talk-tr').addEventListener('click', () => {
    setTalkPref('transcript', !talkPrefs().transcript);
    refresh();
  });
  q<HTMLFormElement>('.pet-talk-type').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = q<HTMLInputElement>('.pet-talk-type input');
    const v = inp.value.trim();
    if (!v) return;
    inp.value = '';
    void send(v);
  });
  const hold = q('.pet-talk-hold');
  hold.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    hold.setPointerCapture?.(e.pointerId);
    void startHold();
  });
  const up = () => {
    if (!holding) return;
    holding = false;
    hold.classList.remove('on');
    stopListening();
  };
  hold.addEventListener('pointerup', up);
  hold.addEventListener('pointercancel', up);
  hold.addEventListener('contextmenu', (e) => e.preventDefault());
  if (location.search.includes('debug')) (window as any).__bloopTalk = { send, history, open: () => setActive(true), prefs: talkPrefs };
}

export function talkActive(): boolean {
  return active;
}

/** Posição do botão Conversar (mesma altura do "Falar"). */
export function layoutTalk(btnTop: number): void {
  if (!host) return;
  q('.pet-talk-btn').style.top = `${btnTop}px`;
}

export function setActive(on: boolean): void {
  if (!host) return;
  active = on;
  host.root.classList.toggle('talking', on);
  host.setActive(on);
  if (on) {
    host.stopRepeat();
    if (!history.length) host.say(t('pet.talk.hello', 'Oba, vamos conversar! Segura o microfone e fala comigo!'), 4.5);
    void sttAvailable().then((ok) => {
      if (!ok && active) toggleKeyboard(true);
    });
  } else {
    cancelListening();
    stopSpeaking();
    holding = false;
    toggleKeyboard(false);
  }
  refresh();
}

/** Fecha tudo ao sair da tela. */
export function closeTalk(): void {
  if (active) setActive(false);
}

function toggleKeyboard(force?: boolean): void {
  const f = q('.pet-talk-type');
  const on = force ?? !f.classList.contains('on');
  f.classList.toggle('on', on);
  if (on) setTimeout(() => q<HTMLInputElement>('.pet-talk-type input').focus(), 30);
}

function refresh(): void {
  if (!host) return;
  const p = talkPrefs();
  const v = voiceById(p.voice);
  q('.pet-talk-voice b').textContent = v.icon;
  q('.pet-talk-voice').title = v.name();
  const left = aiLeft();
  q('.pet-talk-quota').textContent = p.aiOff
    ? t('pet.talk.offline', 'Modo offline (sem internet)')
    : left === Infinity
      ? t('pet.talk.unlimited', 'Pro: conversas ilimitadas')
      : t('pet.talk.left', '{n} conversas inteligentes hoje', { n: left });
  q('.pet-talk-tr').classList.toggle('on', p.transcript);
  const log = q('.pet-talk-log');
  const trOn = active && p.transcript && history.length > 0;
  log.classList.toggle('on', trOn);
  host.root.classList.toggle('tr-on', trOn);
  log.innerHTML = history
    .slice(-12)
    .map((h) => `<p class="${h.role}">${esc(h.text)}</p>`)
    .join('');
  log.scrollTop = log.scrollHeight;
}

function showMe(text: string, partial = false): void {
  const el = q('.pet-talk-me');
  el.textContent = text;
  el.classList.toggle('on', !!text);
  el.classList.toggle('partial', partial);
}

async function startHold(): Promise<void> {
  if (busy || holding) return;
  holding = true;
  stopSpeaking();
  q('.pet-talk-hold').classList.add('on');
  host!.react('calm');
  showMe('…', true);
  const r = await listen({ onPartial: (s) => showMe(s, true) });
  holding = false;
  q('.pet-talk-hold').classList.remove('on');
  if ('text' in r) {
    void send(r.text);
    return;
  }
  showMe('');
  if (r.error === 'unsupported') {
    host!.toast(t('pet.talk.nostt', 'Aqui não dá para ouvir a voz. Use o teclado!'), 'warning');
    toggleKeyboard(true);
  } else if (r.error === 'denied') host!.toast(t('pet.voice.denied', 'Sem permissão do microfone. Dá para liberar nas configurações do aparelho.'), 'warning');
  else if (r.error === 'nomatch') host!.say(t('pet.talk.nomatch', 'Hã? Não ouvi direitinho. Fala de novo?'), 3);
  else host!.toast(t('pet.voice.failed', 'Não consegui abrir o microfone agora.'), 'warning');
}

/** Manda uma fala para o bichinho e mostra/toca a resposta. */
export async function send(text: string): Promise<string> {
  if (!host || busy) return '';
  text = text.replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return '';
  busy = true;
  showMe(text);
  host.root.classList.add('thinking');
  host.say('…', 8);
  const snap = host.snapshot();
  const prev = history.slice();
  history.push({ role: 'user', text });
  refresh();
  try {
    const r = await ask(text, snap, prev);
    history.push({ role: 'pet', text: r.reply });
    while (history.length > 16) history.shift();
    host.root.classList.remove('thinking');
    host.root.dataset.src = r.source;
    const secs = Math.min(10, 2.5 + r.reply.length * 0.065);
    host.say(r.reply, secs);
    host.react(r.emotion, r.action);
    refresh();
    const sp = speak(r.reply, talkPrefs().voice, { muted: !save.sound });
    if (r.capped && !capOffered) {
      capOffered = true;
      setTimeout(showCap, 600);
    }
    await sp;
    return r.reply;
  } finally {
    host.root.classList.remove('thinking');
    busy = false;
    setTimeout(() => !busy && !holding && showMe(''), 2500);
  }
}

/* ------------------------------ seletor de vozes ------------------------------ */

function openVoices(): void {
  const m = q('.pet-voices');
  const card = m.querySelector('.pet-card')!;
  const pro = isPro();
  const cur = talkPrefs().voice;
  card.innerHTML = `<h3>${esc(t('pet.talk.voicesTitle', 'Escolha a voz do seu bichinho'))}</h3>
    <div class="pet-vgrid">${PET_VOICES.map((v) => {
      const locked = v.pro && !pro;
      return `<button class="pet-vopt${v.id === cur ? ' sel' : ''}${locked ? ' locked' : ''}" data-v="${v.id}"><i>${v.icon}</i><span>${esc(v.name())}</span>${locked ? `<em>${icon('lock', { size: 14 })}Pro</em>` : ''}</button>`;
    }).join('')}</div>
    <p class="pet-hint">${esc(pro ? t('pet.talk.voicesPro', 'Todas as vozes liberadas!') : t('pet.talk.voicesFree', '3 vozes grátis. Clube Bloop ou passe premium libera todas!'))}</p>
    <div class="pet-row"><button class="pet-btn pet-big pet-vok">${icon('check', { size: 22 })}${esc(t('pet.talk.ok', 'Pronto'))}</button></div>`;
  card.querySelectorAll<HTMLElement>('.pet-vopt').forEach((b) =>
    b.addEventListener('click', () => {
      const v = voiceById(b.dataset.v!);
      if (v.pro && !isPro()) {
        host!.toast(t('pet.talk.voiceLocked', 'Voz exclusiva do Clube Bloop e do passe premium.'), 'lock');
        void speak(t('pet.talk.preview', 'Oi! Eu sou o seu bichinho!'), v.id, { muted: !save.sound });
        return;
      }
      setTalkPref('voice', v.id);
      card.querySelectorAll('.pet-vopt').forEach((x) => x.classList.toggle('sel', x === b));
      refresh();
      void speak(t('pet.talk.preview', 'Oi! Eu sou o seu bichinho!'), v.id, { muted: !save.sound });
    }),
  );
  card.querySelector('.pet-vok')!.addEventListener('click', () => m.classList.remove('on'));
  m.classList.add('on');
}

/* ------------------------------ limite diário → vídeo ------------------------------ */

function showCap(): void {
  const m = q('.pet-aicap');
  const card = m.querySelector('.pet-card')!;
  card.innerHTML = `<h3>${esc(t('pet.talk.capTitle', 'Ufa, falei muito hoje!'))}</h3>
    <p>${esc(t('pet.talk.capText', 'As conversas inteligentes de hoje acabaram. Continuo conversando no modo simples, ou você pode assistir um vídeo para ganhar mais {n}!', { n: AI_AD_BONUS }))}</p>
    <div class="pet-row"><button class="pet-btn pet-no">${esc(t('pet.talk.capNo', 'Modo simples'))}</button>
    <button class="pet-btn pet-big pet-yes">${icon('play', { size: 22 })}${esc(t('pet.talk.capAd', 'Assistir vídeo +{n}', { n: AI_AD_BONUS }))}</button></div>`;
  card.querySelector('.pet-no')!.addEventListener('click', () => m.classList.remove('on'));
  const yes = card.querySelector<HTMLButtonElement>('.pet-yes')!;
  if (!rewardedAvailable()) yes.disabled = true;
  yes.addEventListener('click', async () => {
    yes.disabled = true;
    const ok = await showRewarded();
    m.classList.remove('on');
    if (ok) {
      addAiBonus();
      capOffered = false;
      refresh();
      host!.toast(t('pet.talk.capThanks', '+{n} conversas inteligentes!', { n: AI_AD_BONUS }), 'star');
    } else host!.toast(t('pet.talk.capFail', 'O vídeo não carregou. Tente de novo mais tarde.'), 'warning');
  });
  m.classList.add('on');
}

/* ------------------------------ primeira vez (privacidade) ------------------------------ */

function showIntro(): void {
  const m = q('.pet-tintro');
  const card = m.querySelector('.pet-card')!;
  card.innerHTML = `<h3>${esc(t('pet.talk.introTitle', 'Converse com seu bichinho!'))}</h3>
    <p>${esc(t('pet.talk.introText', 'Segure o microfone e fale, ou toque no teclado para escrever. Ele entende e responde com a voz que você escolher!'))}</p>
    <p class="pet-priv">${icon('shield', { size: 22 })}<span>${esc(
      t(
        'pet.talk.privacy',
        'Sua voz vira texto no próprio aparelho e não é gravada. Só o texto vai para o servidor para o bichinho responder, e nada fica guardado. Nunca conte seu nome completo, endereço, escola ou telefone.',
      ),
    )}</span></p>
    <div class="pet-row"><button class="pet-btn pet-big pet-yes">${icon('check', { size: 22 })}${esc(t('pet.voice.yes', 'Vamos!'))}</button></div>`;
  card.querySelector('.pet-yes')!.addEventListener('click', () => {
    setTalkPref('intro', true);
    m.classList.remove('on');
    setActive(true);
  });
  m.classList.add('on');
}
