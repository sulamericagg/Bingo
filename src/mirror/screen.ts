/* ============================================================
 *  BLOOP ESPELHO — tela (carregada sob demanda pelo painel 'espelho').
 *
 *  PRIVACIDADE (Google Play / público 13+):
 *   - câmera e microfone são processados SÓ no aparelho (MediaPipe local);
 *     nenhum quadro, áudio ou gravação é enviado a lugar nenhum;
 *   - nada é guardado, a não ser que o jogador toque em Salvar/Compartilhar;
 *   - explicação única antes do 1º uso, indicador "Câmera ligada" sempre
 *     visível com botão Desligar; tudo é desligado ao sair, ao minimizar
 *     o app ou quando o tempo grátis acaba.
 * ============================================================ */
import './mirror.css';
import { audio } from '../core/audio';
import { pushBack } from '../core/back';
import { bus } from '../core/events';
import { t } from '../i18n';
import { openClub, openPass } from '../pass/register';
import { rewardedAvailable, showRewarded } from '../services/ads';
import { icon } from '../ui/icons';
import { notify } from '../ui/notify';
import { canRecord, cleanupShared, MAX_REC_MS, Recorder, shareOrSave } from './media';
import { canAdBonus, consumeMirror, flushMirror, fmtLeft, grantAdBonus, mirrorLeftMs, mirrorSave, mirrorUnlimited, setDebugUnlimited, setMirrorPref } from './quota';
import { composeShot, drawFrame, mirrorAvatar, SCENES, STICKERS, type Expr, type FrameState, type SceneId, type StickerId } from './render';
import { approach, neutralRig, RIG_KEYS, RigFilter, type Rig } from './rig';
import type { FaceTracker } from './tracker';
import { FREE_VOICES, VOICES, type MouthFromVoice, type VoiceFx, type VoiceId } from './voice-fx';

const DEBUG = /[?&]debug\b/.test(location.search);

type Session = 'off' | 'starting' | 'on';
type Tab = 'voice' | 'scene' | 'sticker';

const voiceName = (v: VoiceId): string =>
  ({
    normal: t('mirror.v.normal', 'Normal'),
    fofo: t('mirror.v.fofo', 'Bloop fofo'),
    robo: t('mirror.v.robo', 'Robô'),
    gigante: t('mirror.v.gigante', 'Gigante'),
    eco: t('mirror.v.eco', 'Eco de caverna'),
    esquilo: t('mirror.v.esquilo', 'Esquilo'),
    alien: t('mirror.v.alien', 'Alien do rádio'),
    cantor: t('mirror.v.cantor', 'Cantor'),
  })[v];
const sceneName = (s: SceneId): string => ({ quarto: t('mirror.s.quarto', 'Quarto'), palco: t('mirror.s.palco', 'Palco'), espaco: t('mirror.s.espaco', 'Espaço') })[s];
const stickerName = (s: StickerId): string =>
  ({
    none: t('mirror.st.none', 'Nenhum'),
    oculos: t('mirror.st.oculos', 'Óculos'),
    coroa: t('mirror.st.coroa', 'Coroa'),
    laco: t('mirror.st.laco', 'Laço'),
    festa: t('mirror.st.festa', 'Chapéu de festa'),
    bigode: t('mirror.st.bigode', 'Bigode'),
    estrelas: t('mirror.st.estrelas', 'Estrelinhas'),
  })[s];

let root: HTMLElement | null = null;
let cv: HTMLCanvasElement;
let cx: CanvasRenderingContext2D;
let W = 540;
let H = 960;
let video: HTMLVideoElement;
let small: HTMLCanvasElement;
let smallX: CanvasRenderingContext2D;
let tier = 2;

let session: Session = 'off';
let camStream: MediaStream | null = null;
let micStream: MediaStream | null = null;
let tracker: FaceTracker | null = null;
let trackerFailed = false;
let fx: VoiceFx | null = null;
const rec = new Recorder();
let raf = 0;
let popBackFn: (() => void) | null = null;
let offs: (() => void)[] = [];
let sessionToken = 0;

const raw: Rig = neutralRig();
const rig: Rig = neutralRig();
const filter = new RigFilter();
let debugFace: Rig | null = null;
const vm: MouthFromVoice = { open: 0, round: 0, wide: 0 };
let faceAt = 0;
let lastDetect = 0;
let detectMs = 0;
let lastDraw = 0;
let lastFrame = 0;
let t0 = 0;
let bounce = 0;
let bounceV = 0;
let prevLevel = 0;
let nextBlink = 0;
let blinkT = -1;
let lastUi = 0;
let tab: Tab = 'voice';
let lastShot: Blob | null = null;
let lastRec: Blob | null = null;
let msgKey = '';

const expr: Expr = { rig, open: 0, round: 0, wide: 0, sticker: 'none' };
const frame: FrameState = { t: 0, scene: 'quarto', expr, avatar: mirrorAvatar(), bounce: 0 };

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => root!.querySelector(sel) as T;

/* ============================== abrir / fechar ============================== */

export function isMirrorOpen(): boolean {
  return !!root;
}

export function openMirror(qualityTier = 2): void {
  if (root) return;
  tier = qualityTier;
  const m = mirrorSave();
  frame.scene = (SCENES as string[]).includes(m.scene) ? (m.scene as SceneId) : 'quarto';
  expr.sticker = (STICKERS as string[]).includes(m.sticker) ? (m.sticker as StickerId) : 'none';
  frame.avatar = mirrorAvatar();
  build();
  popBackFn = pushBack(() => closeMirror());
  void cleanupShared();
  audio.suspend(); // música do app não vaza para o microfone/gravação
  offs = [
    bus.on('club', onEntitlement),
    bus.on('pass', onEntitlement),
    bus.on('hpass', onEntitlement),
    bus.on('mpass', onEntitlement),
    bus.on('inventory', () => (frame.avatar = mirrorAvatar())),
  ];
  document.addEventListener('visibilitychange', onVis);
  t0 = performance.now();
  lastFrame = t0;
  raf = requestAnimationFrame(loop);
  refreshUi(true);
  if (DEBUG) installDebug();
  if (!m.consent) showConsent();
  else if (mirrorLeftMs() <= 0) showPaywall('time');
  else void startSession('cam');
}

export function closeMirror(): boolean {
  if (!root) return false;
  stopSession();
  cancelAnimationFrame(raf);
  tracker?.close();
  tracker = null;
  trackerFailed = false;
  for (const o of offs) o();
  offs = [];
  document.removeEventListener('visibilitychange', onVis);
  popBackFn?.();
  popBackFn = null;
  root.remove();
  root = null;
  lastShot = lastRec = null;
  flushMirror();
  void cleanupShared();
  audio.resume();
  return true;
}

function onVis(): void {
  // câmera/microfone NUNCA ficam ligados com o app em segundo plano
  if (document.hidden && session !== 'off') {
    stopSession();
    showMsg('paused', t('mirror.msg.paused', 'A câmera desligou quando você saiu. Toque em Ligar para continuar.'));
  }
}

function onEntitlement(): void {
  if (!root) return;
  refreshUi(true);
  if (mirrorUnlimited() && root.querySelector('.mr-pay')) {
    root.querySelector('.mr-pay')?.closest('.mr-sheet-bg')?.remove();
    notify(t('mirror.unlocked', 'Liberado: Espelho sem limite e todas as vozes!'), { icon: 'star', kind: 'good' });
  }
}

/* ============================== DOM ============================== */

function build(): void {
  root = document.createElement('div');
  root.className = 'mr-root';
  root.innerHTML = `
    <canvas class="mr-cv"></canvas>
    <div class="mr-top">
      <button class="mr-back" data-a="back" aria-label="${t('mirror.back', 'Voltar')}">${icon('close', { size: 24 })}</button>
      <div class="mr-cam off"><i class="mr-dot"></i><span></span><button data-a="cam"></button></div>
      <div class="mr-time"></div>
    </div>
    <video class="mr-pip" playsinline muted autoplay></video>
    <div class="mr-msg"></div>
    <div class="mr-loading">${t('mirror.loading', 'Preparando o espelho...')}</div>
    <div class="mr-bottom">
      <div class="mr-tabs">
        <button class="mr-tab" data-tab="voice">${t('mirror.tab.voice', 'Vozes')}</button>
        <button class="mr-tab" data-tab="scene">${t('mirror.tab.scene', 'Cenários')}</button>
        <button class="mr-tab" data-tab="sticker">${t('mirror.tab.sticker', 'Adesivos')}</button>
      </div>
      <div class="mr-chips"></div>
      <div class="mr-actions">
        <button class="mr-act" data-a="shot" aria-label="${t('mirror.photo', 'Foto')}">${icon('camera', { size: 32 })}</button>
        <button class="mr-rec" data-a="rec" aria-label="${t('mirror.record', 'Gravar vídeo')}"><svg class="ring" viewBox="0 0 76 76"><circle cx="38" cy="38" r="35" fill="none" stroke="#ff3d6e" stroke-width="4" stroke-dasharray="220" stroke-dashoffset="220"/></svg><i></i><b>0:00</b></button>
        <button class="mr-act" data-a="pip" aria-label="${t('mirror.preview', 'Ver câmera')}">${icon('user', { size: 30 })}</button>
      </div>
    </div>
    <div class="mr-flash"></div>`;
  document.body.appendChild(root);
  cv = $<HTMLCanvasElement>('.mr-cv');
  const base = tier <= 0 ? 360 : tier === 1 ? 432 : 540;
  const ar = Math.max(1.5, Math.min(2.3, window.innerHeight / Math.max(1, window.innerWidth)));
  W = base;
  H = Math.round((base * ar) / 2) * 2;
  cv.width = W;
  cv.height = H;
  cx = cv.getContext('2d')!;
  video = $<HTMLVideoElement>('.mr-pip');
  small = document.createElement('canvas');
  smallX = small.getContext('2d', { willReadFrequently: false })!;
  root.addEventListener('click', onClick);
}

function onClick(e: MouseEvent): void {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-a],[data-tab],[data-pick]');
  if (!el || !root) return;
  audio.unlock();
  if (el.dataset.tab) {
    tab = el.dataset.tab as Tab;
    refreshUi(true);
    return;
  }
  if (el.dataset.pick) return pick(el.dataset.pick);
  switch (el.dataset.a) {
    case 'back':
      closeMirror();
      break;
    case 'cam':
      if (session === 'off') void startSession('cam');
      else {
        stopSession();
        showMsg('off', t('mirror.msg.off', 'Câmera e microfone desligados.'));
      }
      break;
    case 'shot':
      void takeShot();
      break;
    case 'rec':
      toggleRec();
      break;
    case 'pip':
      video.classList.toggle('on');
      break;
  }
}

function pick(v: string): void {
  if (tab === 'voice') {
    const id = v as VoiceId;
    if (!voiceAllowed(id)) return showPaywall('voice');
    setMirrorPref('voice', id);
    fx?.setVoice(id);
    if (!fx) notify(t('mirror.voiceNoMic', 'Ligue o microfone para usar as vozes.'), { icon: 'sound' });
  } else if (tab === 'scene') {
    frame.scene = v as SceneId;
    setMirrorPref('scene', v);
  } else {
    expr.sticker = v as StickerId;
    setMirrorPref('sticker', v);
  }
  refreshUi(true);
}

const voiceAllowed = (v: VoiceId): boolean => mirrorUnlimited() || FREE_VOICES.includes(v);

function refreshUi(full = false): void {
  if (!root) return;
  const camEl = $('.mr-cam');
  const camOn = session === 'on' && !!camStream;
  const micOn = session === 'on' && !!micStream;
  camEl.className = 'mr-cam ' + (camOn ? 'on' : micOn ? 'mic' : 'off');
  camEl.querySelector('span')!.textContent =
    session === 'starting'
      ? t('mirror.cam.starting', 'Ligando...')
      : camOn
        ? t('mirror.cam.on', 'Câmera ligada')
        : micOn
          ? t('mirror.cam.mic', 'Só microfone')
          : t('mirror.cam.off', 'Câmera desligada');
  camEl.querySelector('button')!.textContent = session === 'off' ? t('mirror.cam.start', 'Ligar') : t('mirror.cam.stop', 'Desligar');
  const tm = $('.mr-time');
  if (mirrorUnlimited()) {
    tm.className = 'mr-time vip';
    tm.innerHTML = `${icon('star', { size: 16 })}${t('mirror.unlimited', 'Sem limite')}`;
  } else {
    const left = mirrorLeftMs();
    tm.className = 'mr-time' + (left < 30_000 ? ' low' : '');
    tm.innerHTML = `${icon('clock', { size: 16 })}<span>${fmtLeft(left)}</span>`;
  }
  const recEl = $('.mr-rec');
  recEl.classList.toggle('on', rec.active);
  if (rec.active) {
    const el = performance.now() - rec.startedAt;
    recEl.querySelector('b')!.textContent = fmtLeft(el).replace(/^0:/, '0:');
    (recEl.querySelector('circle') as SVGCircleElement).style.strokeDashoffset = String(220 * (1 - Math.min(1, el / MAX_REC_MS)));
  } else (recEl.querySelector('circle') as SVGCircleElement).style.strokeDashoffset = '220';
  if (!full) return;
  root.querySelectorAll<HTMLElement>('.mr-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const m = mirrorSave();
  let html = '';
  if (tab === 'voice') {
    for (const v of VOICES) {
      const ok = voiceAllowed(v);
      html += `<button class="mr-chip${m.voice === v ? ' on' : ''}${ok ? '' : ' lock'}" data-pick="${v}">${icon(ok ? 'sound' : 'lock', { size: 16 })}${voiceName(v)}</button>`;
    }
  } else if (tab === 'scene') {
    for (const s of SCENES) html += `<button class="mr-chip${frame.scene === s ? ' on' : ''}" data-pick="${s}">${icon(s === 'espaco' ? 'planet' : s === 'palco' ? 'music' : 'home', { size: 16 })}${sceneName(s)}</button>`;
  } else {
    for (const s of STICKERS) html += `<button class="mr-chip${expr.sticker === s ? ' on' : ''}" data-pick="${s}">${s === 'none' ? '' : icon('sparkle', { size: 16 })}${stickerName(s)}</button>`;
  }
  $('.mr-chips').innerHTML = html;
}

function showMsg(key: string, text: string | null): void {
  if (!root) return;
  const el = $('.mr-msg');
  msgKey = text ? key : '';
  el.classList.toggle('on', !!text);
  if (text) el.textContent = text;
}

function sheet(cls: string, html: string): HTMLElement {
  const bg = document.createElement('div');
  bg.className = 'mr-sheet-bg';
  bg.innerHTML = `<div class="mr-card ${cls}">${html}</div>`;
  root!.appendChild(bg);
  return bg;
}

/* ============================== consentimento ============================== */

function showConsent(): void {
  const bg = sheet(
    'mr-consent',
    `${icon('camera', { size: 56 })}
    <h2>${t('mirror.title', 'Bloop Espelho')}</h2>
    <p class="lead">${t('mirror.consent.lead', 'A câmera fica só no seu celular; nada é enviado.')}</p>
    <ul>
      <li>${icon('smile')}<span>${t('mirror.consent.b1', 'Seu rosto vira o Bloop na hora, aqui mesmo no aparelho.')}</span></li>
      <li>${icon('lock')}<span>${t('mirror.consent.b2', 'Nenhuma foto, vídeo ou som é guardado, a não ser que você toque em Salvar.')}</span></li>
      <li>${icon('close')}<span>${t('mirror.consent.b3', 'Dá para desligar a câmera quando quiser, no botão lá em cima.')}</span></li>
    </ul>
    <button class="mr-btn main" data-c="cam">${icon('camera')}${t('mirror.consent.ok', 'Ligar câmera')}</button>
    <button class="mr-btn" data-c="mic">${icon('sound')}${t('mirror.consent.mic', 'Só microfone')}</button>
    <button class="mr-btn ghost" data-c="no">${t('mirror.consent.no', 'Agora não')}</button>`,
  );
  bg.addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c;
    if (!c) return;
    e.stopPropagation();
    bg.remove();
    if (c === 'no') return void closeMirror();
    setMirrorPref('consent', true);
    if (mirrorLeftMs() <= 0) return showPaywall('time');
    void startSession(c === 'cam' ? 'cam' : 'mic');
  });
}

/* ============================== paywall ============================== */

function showPaywall(why: 'time' | 'voice'): void {
  if (!root || root.querySelector('.mr-pay')) return;
  const adOk = why === 'time' && canAdBonus() && rewardedAvailable();
  const bg = sheet(
    'mr-pay',
    `${icon(why === 'time' ? 'clock' : 'sound', { size: 52 })}
    <h2>${why === 'time' ? t('mirror.pay.timeTitle', 'Seu tempo de hoje acabou!') : t('mirror.pay.voiceTitle', 'Voz especial')}</h2>
    <p>${t('mirror.pay.text', 'Assine o Clube Bloop ou tenha um Passe para usar sem limite')}${why === 'voice' ? ' ' + t('mirror.pay.voiceExtra', 'e liberar todas as vozes.') : '.'}</p>
    <button class="mr-btn main" data-p="club">${icon('crown')}${t('mirror.pay.club', 'Clube Bloop')}</button>
    <button class="mr-btn gold" data-p="pass">${icon('star')}${t('mirror.pay.pass', 'Ver o Passe')}</button>
    ${adOk ? `<button class="mr-btn" data-p="ad">${icon('video')}${t('mirror.pay.ad', 'Ver um vídeo: +2 min')}</button>` : ''}
    <button class="mr-btn ghost" data-p="no">${t('mirror.pay.later', 'Agora não')}</button>
    ${why === 'time' ? `<small>${t('mirror.pay.tomorrow', 'Amanhã tem mais 3 minutos grátis.')}</small>` : ''}`,
  );
  bg.addEventListener('click', async (e) => {
    const p = (e.target as HTMLElement).closest<HTMLElement>('[data-p]')?.dataset.p;
    if (!p) return;
    e.stopPropagation();
    if (p === 'club') openClub();
    else if (p === 'pass') openPass('rewards');
    else if (p === 'ad') {
      const ok = await showRewarded();
      if (ok) {
        grantAdBonus();
        bg.remove();
        notify(t('mirror.adOk', '+2 minutos de Espelho!'), { icon: 'clock', kind: 'good' });
        refreshUi(true);
        if (session === 'off') void startSession('cam');
      } else notify(t('mirror.adFail', 'O vídeo não carregou agora. Tente mais tarde.'), { icon: 'warning', kind: 'warn' });
    } else bg.remove();
  });
}

/* ============================== sessão (câmera + microfone) ============================== */

function errName(e: unknown): string {
  return (e as { name?: string })?.name ?? 'Error';
}

async function startSession(mode: 'cam' | 'mic'): Promise<void> {
  if (!root || session !== 'off') return;
  if (mirrorLeftMs() <= 0) return showPaywall('time');
  const token = ++sessionToken;
  session = 'starting';
  showMsg('', null);
  refreshUi();
  const md = navigator.mediaDevices;
  let camErr = '';
  let micErr = '';
  // pedidos SEPARADOS: no Android o WebView nega tudo se uma das permissões for negada
  if (mode === 'cam') {
    try {
      if (!md?.getUserMedia) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
      camStream = await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    } catch (e) {
      camErr = errName(e);
      camStream = null;
    }
  }
  if (!stillWanted(token)) return;
  try {
    if (!md?.getUserMedia) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
    micStream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
  } catch (e) {
    micErr = errName(e);
    micStream = null;
  }
  if (!stillWanted(token)) return;

  if (camStream) {
    video.srcObject = camStream;
    video.classList.add('on');
    await video.play().catch(() => {});
    if (!tracker && !trackerFailed) {
      $('.mr-loading').classList.add('on');
      try {
        const mod = await import('./tracker');
        const tr = await mod.createFaceTracker();
        if (!root) tr.close();
        else tracker = tr;
      } catch (e) {
        console.warn('[espelho] rastreamento indisponível', e);
        trackerFailed = true;
      }
      root?.querySelector('.mr-loading')?.classList.remove('on');
      if (!stillWanted(token)) return;
    }
    if (!tracker) {
      // sem modelo: a câmera não serve para nada → desliga já
      camStream.getTracks().forEach((tr) => tr.stop());
      camStream = null;
      video.srcObject = null;
      video.classList.remove('on');
      camErr = 'model';
    }
  }
  if (micStream) {
    const { VoiceFx } = await import('./voice-fx');
    if (!stillWanted(token)) return;
    fx = new VoiceFx(micStream);
    const v = mirrorSave().voice as VoiceId;
    fx.setVoice(VOICES.includes(v) && voiceAllowed(v) ? v : 'normal');
    await fx.resume();
  }
  if (!camStream && !micStream) {
    session = 'off';
    const denied = camErr === 'NotAllowedError' || micErr === 'NotAllowedError' || camErr === 'SecurityError';
    showMsg(
      'none',
      denied
        ? t('mirror.err.denied', 'Sem permissão de câmera e microfone. Dá para permitir nas configurações do aparelho.')
        : t('mirror.err.none', 'Não achamos câmera nem microfone neste aparelho.'),
    );
    refreshUi(true);
    return;
  }
  session = 'on';
  filter.reset();
  faceAt = 0;
  if (mode === 'cam' && !camStream) {
    showMsg(
      'cam',
      camErr === 'model'
        ? t('mirror.err.model', 'Não deu para ler o rosto neste aparelho: o Bloop segue só a sua voz.')
        : camErr === 'NotAllowedError' || camErr === 'SecurityError'
          ? t('mirror.err.camDenied', 'Câmera bloqueada: o Bloop segue só a sua voz. Dá para permitir nas configurações do aparelho.')
          : t('mirror.err.noCam', 'Sem câmera aqui: o Bloop segue só a sua voz.'),
    );
  } else if (!micStream) showMsg('mic', t('mirror.err.mic', 'Microfone desligado: as vozes e o som dos vídeos não funcionam.'));
  refreshUi(true);
}

function stillWanted(token: number): boolean {
  if (root && token === sessionToken && !document.hidden) return true;
  // fechou a tela ou minimizou enquanto o Android pedia permissão: solta tudo
  camStream?.getTracks().forEach((tr) => tr.stop());
  micStream?.getTracks().forEach((tr) => tr.stop());
  camStream = micStream = null;
  if (token === sessionToken) session = 'off';
  root?.querySelector('.mr-loading')?.classList.remove('on');
  return false;
}

function stopSession(): void {
  sessionToken++;
  if (rec.active) rec.stop();
  camStream?.getTracks().forEach((tr) => tr.stop());
  micStream?.getTracks().forEach((tr) => tr.stop());
  camStream = micStream = null;
  if (video) {
    video.srcObject = null;
    video.classList.remove('on');
  }
  fx?.dispose();
  fx = null;
  session = 'off';
  flushMirror();
  root?.querySelector('.mr-loading')?.classList.remove('on');
  refreshUi();
}

/* ============================== laço ============================== */

function loop(now: number): void {
  if (!root) return;
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const ts = (now - t0) / 1000;

  if (session === 'on') {
    consumeMirror(dt * 1000);
    if (mirrorLeftMs() <= 0) {
      stopSession();
      showPaywall('time');
    }
  }

  // rastreamento (quadro reduzido, ~12–24 por segundo conforme a qualidade)
  const hz = tier <= 0 ? 12 : tier === 1 ? 18 : 24;
  const interval = Math.max(1000 / hz, detectMs * 1.5);
  let gotFace = false;
  if (debugFace) {
    Object.assign(raw, debugFace);
    gotFace = true;
  } else if (tracker && camStream && video.readyState >= 2 && now - lastDetect >= interval) {
    lastDetect = now;
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const sw = tier <= 0 ? 224 : 288;
    const sh = Math.round((sw * vh) / vw);
    if (small.width !== sw || small.height !== sh) {
      small.width = sw;
      small.height = sh;
    }
    smallX.drawImage(video, 0, 0, sw, sh);
    const a = performance.now();
    try {
      gotFace = tracker.detect(small, now, raw);
    } catch (e) {
      console.warn('[espelho] detect', e);
    }
    detectMs = detectMs * 0.8 + (performance.now() - a) * 0.2;
  }
  if (gotFace) {
    faceAt = now;
    filter.apply(raw, rig, debugFace ? dt : Math.max(dt, interval / 1000));
  } else if (now - faceAt > 600) {
    // sem rosto: volta ao neutro, pisca sozinho e balança de leve (modo só microfone fica vivo)
    for (const k of RIG_KEYS) rig[k] = approach(rig[k], 0, 5, dt);
    rig.yaw = Math.sin(ts * 0.6) * 0.12;
    rig.roll = Math.sin(ts * 0.8 + 1) * 0.06;
    if (ts > nextBlink) {
      blinkT = ts;
      nextBlink = ts + 2.5 + Math.random() * 3;
    }
    const b = blinkT >= 0 ? Math.max(0, 1 - Math.abs(ts - blinkT - 0.08) / 0.08) : 0;
    rig.blinkL = rig.blinkR = b;
    filter.reset();
  }
  if (camStream && tracker && session === 'on') {
    if (now - faceAt > 2500) {
      if (!msgKey) showMsg('face', t('mirror.msg.face', 'Mostre seu rosto para a câmera, com o rosto bem iluminado.'));
    } else if (msgKey === 'face') showMsg('', null);
  }

  // voz → boca
  const level = fx ? fx.poll(vm) : ((vm.open *= 0.8), (vm.round *= 0.8), (vm.wide *= 0.8), 0);
  const faceLive = now - faceAt < 600;
  expr.open = Math.max(rig.jaw, vm.open * (faceLive ? 0.55 : 1));
  expr.round = Math.max(rig.round, faceLive ? 0 : vm.round);
  expr.wide = Math.max(rig.wide, faceLive ? 0 : vm.wide);
  // pulinho ao falar (mola)
  if (level - prevLevel > 0.22) bounceV += 3.2;
  prevLevel = level;
  bounceV += (-bounce * 140 - bounceV * 14) * dt;
  bounce += bounceV * dt;
  frame.bounce = Math.max(-0.4, Math.min(0.6, bounce));

  const drawEvery = tier <= 0 ? 1000 / 24 : 1000 / 30;
  if (now - lastDraw >= drawEvery - 2) {
    lastDraw = now;
    frame.t = ts;
    drawFrame(cx, W, H, frame);
  }
  if (now - lastUi > 250) {
    lastUi = now;
    refreshUi();
  }
}

/* ============================== foto / vídeo ============================== */

async function takeShot(): Promise<void> {
  if (!root) return;
  const fl = $('.mr-flash');
  fl.classList.remove('go');
  void fl.offsetWidth;
  fl.classList.add('go');
  audio.click();
  const blob = await composeShot(cv);
  if (!blob) return void notify(t('mirror.shotFail', 'Não deu para tirar a foto.'), { icon: 'warning', kind: 'bad' });
  lastShot = blob;
  showResult(blob, 'photo');
}

function toggleRec(): void {
  if (rec.active) return rec.stop();
  if (!canRecord()) return void notify(t('mirror.recUnsupported', 'Este aparelho não consegue gravar vídeo aqui. Tire uma foto!'), { icon: 'warning', kind: 'warn' });
  if (session !== 'on') {
    if (mirrorLeftMs() <= 0) return showPaywall('time');
    return void notify(t('mirror.recNeedCam', 'Ligue a câmera ou o microfone para gravar.'), { icon: 'camera' });
  }
  const ok = rec.start(cv, fx?.track ?? null, (blob) => {
    refreshUi();
    if (!blob || !root) return;
    lastRec = blob;
    showResult(blob, 'video');
  });
  if (!ok) notify(t('mirror.recFail', 'Não deu para começar a gravar.'), { icon: 'warning', kind: 'bad' });
  refreshUi();
}

function showResult(blob: Blob, kind: 'photo' | 'video'): void {
  if (!root) return;
  root.querySelector('.mr-res')?.closest('.mr-sheet-bg')?.remove();
  const url = URL.createObjectURL(blob);
  const media = kind === 'photo' ? `<img class="mr-prev" src="${url}" alt="">` : `<video class="mr-prev" src="${url}" playsinline controls autoplay loop></video>`;
  const bg = sheet(
    'mr-res',
    `${media}
    <button class="mr-btn main" data-r="share">${icon('link')}${t('mirror.save', 'Salvar / Compartilhar')}</button>
    <button class="mr-btn ghost" data-r="no">${t('mirror.discard', 'Descartar')}</button>
    <small>${t('mirror.saveNote', 'Só fica guardado se você salvar.')}</small>`,
  );
  const done = () => {
    bg.querySelector('video')?.pause();
    bg.remove();
    URL.revokeObjectURL(url);
  };
  bg.addEventListener('click', async (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('[data-r]')?.dataset.r;
    if (!r) return;
    e.stopPropagation();
    if (r === 'no') return done();
    const res = await shareOrSave(blob);
    if (res === 'error') notify(t('mirror.shareFail', 'Não deu para salvar agora.'), { icon: 'warning', kind: 'bad' });
    else if (res === 'downloaded') notify(t('mirror.saved', 'Arquivo salvo!'), { icon: 'check', kind: 'good' });
    if (res === 'shared' || res === 'downloaded') done();
  });
}

/* ============================== depuração (?debug) ============================== */

function installDebug(): void {
  (window as unknown as { __mirror: unknown }).__mirror = {
    setFace(p: Partial<Rig>) {
      debugFace = { ...neutralRig(), ...p };
    },
    clearFace() {
      debugFace = null;
    },
    setUnlimited(v: boolean | null) {
      setDebugUnlimited(v);
      onEntitlement();
    },
    burn(ms: number) {
      consumeMirror(ms);
    },
    state: () => ({
      session,
      cam: !!camStream,
      mic: !!micStream,
      tracker: tracker?.delegate ?? (trackerFailed ? 'failed' : null),
      faceLive: performance.now() - faceAt < 600,
      leftMs: mirrorLeftMs(),
      unlimited: mirrorUnlimited(),
      recording: rec.active,
      mime: rec.mime,
      voice: fx?.voice ?? null,
      msg: msgKey,
      rig: { ...rig },
      lastShot: lastShot ? { type: lastShot.type, size: lastShot.size } : null,
      lastRec: lastRec ? { type: lastRec.type, size: lastRec.size } : null,
    }),
  };
}
