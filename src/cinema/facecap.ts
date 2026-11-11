/* ============================================================
 *  BLOOP CINEMA — "Gravar com o rosto" (opcional).
 *
 *  Usa o rastreador do Bloop Espelho (src/mirror/tracker.ts + rig.ts,
 *  só importados — nada do Espelho é alterado) para gravar a atuação
 *  do rosto ENQUANTO a pessoa fala a fala: piscar E/D, sobrancelhas,
 *  bocas (aberta, A, O, E, sorriso, bico) e cabeça (virar, inclinar,
 *  deitar), a 15–30 quadros/s conforme a qualidade do aparelho.
 *  Os quadros viram 1 byte por canal (FaceTake, ver facetake.ts).
 *
 *  Privacidade (igual ao Espelho): a câmera só liga depois do aviso,
 *  tudo roda no aparelho, nenhuma imagem é gravada ou enviada — só
 *  as curvas do rosto e a voz, dentro do projeto local.
 *
 *  Limite: usa o MESMO tempo diário grátis do Bloop Espelho
 *  (src/mirror/quota.ts, 3 min/dia, conta só o tempo GRAVANDO);
 *  Cinema Pro / Clube / Passe premium = sem limite.
 * ============================================================ */
import { pushBack } from '../core/back';
import { detectInitialTier } from '../core/quality';
import { fmtDec, t } from '../i18n';
import { notify } from '../ui/notify';
import { consumeMirror, flushMirror, fmtLeft, mirrorLeftMs, mirrorSave, mirrorUnlimited, setMirrorPref } from '../mirror/quota';
import { neutralRig, RigFilter, type Rig } from '../mirror/rig';
import type { FaceTracker } from '../mirror/tracker';
import { actx, MicRecorder, MAX_REC_SEC } from './audio';
import { VOICE_RATE } from './engine';
import { encodeTake, neutralFrame, sampleTake, takeDuration } from './facetake';
import type { CastMember, FaceFrame, FaceTake } from './format';
import { isPro, paywall } from './gates';
import { drawActor2D, restRig } from './rig2d';
import { sheet } from './sheets';

export interface FaceCapResult {
  blob: Blob;
  buf: AudioBuffer;
  env: Float32Array;
  take: FaceTake;
  cut: [number, number];
}

const DEBUG_FAKE = typeof location !== 'undefined' && /[?&]debug\b/.test(location.search) && /[?&]fakeface\b/.test(location.search);

/** Rig do Espelho → canais da captura (vogais derivadas da boca). */
export function rigToFrame(r: Rig, out: FaceFrame = neutralFrame()): FaceFrame {
  const jaw = r.jaw;
  out.bl = r.blinkL;
  out.br = r.blinkR;
  out.bwl = r.browL;
  out.bwr = r.browR;
  out.bwi = r.browInner;
  out.op = jaw;
  out.A = Math.max(0, jaw * (1 - r.round) * (1 - r.wide * 0.6));
  out.O = Math.min(1, r.round * Math.min(1, jaw * 2.2 + 0.2));
  out.E = r.wide;
  out.sm = (r.smileL + r.smileR) / 2;
  out.pk = r.round * (1 - Math.min(1, jaw * 1.6));
  out.yaw = Math.max(-0.6, Math.min(0.6, r.yaw));
  out.pit = Math.max(-0.6, Math.min(0.6, r.pitch));
  out.rol = Math.max(-0.6, Math.min(0.6, r.roll));
  out.lx = r.lookX;
  out.ly = r.lookY;
  return out;
}

/** Rosto falso para testes (?debug&fakeface): fala, pisca, vira a cabeça. */
function fakeRig(ts: number, out: Rig): void {
  const s = Math.sin;
  out.jaw = Math.max(0, s(ts * 9) * 0.5 + s(ts * 3.1) * 0.35);
  out.round = Math.max(0, s(ts * 1.3) * 0.8);
  out.wide = Math.max(0, -s(ts * 1.3) * 0.7);
  out.smileL = out.smileR = Math.max(0, s(ts * 0.7) * 0.9);
  const bk = ts % 2.4 < 0.15 ? 1 : 0;
  out.blinkL = bk;
  out.blinkR = ts % 5 > 4.6 ? 0 : bk;
  out.browL = s(ts * 1.1) * 0.8;
  out.browR = s(ts * 1.1 + 0.6) * 0.8;
  out.browInner = Math.max(0, s(ts * 0.9));
  out.yaw = s(ts * 0.8) * 0.4;
  out.pitch = s(ts * 0.6) * 0.2;
  out.roll = s(ts * 0.5 + 1) * 0.3;
  out.lookX = s(ts * 0.9) * 0.6;
  out.lookY = s(ts * 0.7) * 0.3;
}

/* ---------------------------- consentimento ---------------------------- */
function consent(): Promise<boolean> {
  if (mirrorSave().consent) return Promise.resolve(true);
  return new Promise((res) => {
    let ok = false;
    sheet(
      `<div class="fc-consent"><div class="fc-big">📷🎭</div>
       <h3>${t('cin.fc.title', 'Gravar com o rosto')}</h3>
       <p>${t('cin.fc.c.lead', 'Seu rosto mexe o personagem enquanto você fala a fala.')}</p>
       <ul>
         <li>🔒 ${t('cin.fc.c.b1', 'A câmera fica só no seu celular; nada é enviado.')}</li>
         <li>🎞️ ${t('cin.fc.c.b2', 'Nenhuma foto ou vídeo é guardado: só os movimentos do rosto e a sua voz, dentro do filme.')}</li>
         <li>✋ ${t('cin.fc.c.b3', 'A câmera desliga assim que você fecha esta tela.')}</li>
       </ul>
       <div class="cin-row c"><button class="cin-btn pri" data-a="ok">📷 ${t('cin.fc.c.ok', 'Ligar câmera')}</button><button class="cin-btn ghost" data-a="no">${t('cin.fc.c.no', 'Agora não')}</button></div></div>`,
      (a, _el, close) => {
        ok = a === 'ok';
        if (ok) setMirrorPref('consent', true);
        close();
      },
      () => res(ok),
    );
  });
}

/* ============================================================
 *  TELA DE CAPTURA
 * ============================================================ */

/** Abre a captura. Resolve com a gravação, um erro de câmera/microfone, ou null (desistiu). */
export async function faceCapture(cast: CastMember): Promise<FaceCapResult | 'denied' | 'nocam' | 'mic' | null> {
  const unlimited = isPro() || mirrorUnlimited();
  if (!unlimited && mirrorLeftMs() <= 0) {
    paywall('face');
    return null;
  }
  if (!(await consent())) return null;
  return new FaceCap(cast, unlimited).run();
}

type Phase = 'starting' | 'ready' | 'count' | 'rec' | 'review';

class FaceCap {
  private root!: HTMLElement;
  private cv!: HTMLCanvasElement;
  private video!: HTMLVideoElement;
  private small = document.createElement('canvas');
  private stream: MediaStream | null = null;
  private tracker: FaceTracker | null = null;
  private raw = neutralRig();
  private rig = neutralRig();
  private filter = new RigFilter();
  private frame = neutralFrame();
  private gotFace = false;
  private faceAt = 0;
  private lastDetect = 0;
  private phase: Phase = 'starting';
  private hz: number;
  private rec: MicRecorder | null = null;
  private frames: FaceFrame[] = [];
  private countT = 0;
  private result: FaceCapResult | null = null;
  private take: FaceTake | null = null;
  private cut: [number, number] = [0, 0];
  private only = false;
  private playing: { src: AudioBufferSourceNode; t0: number } | null = null;
  private raf = 0;
  private last = 0;
  private resolve!: (r: FaceCapResult | 'denied' | 'nocam' | 'mic' | null) => void;
  private popBack: () => void = () => {};
  private closed = false;
  private tier: number;

  constructor(
    private cast: CastMember,
    private unlimited: boolean,
  ) {
    let tier = 2;
    try {
      tier = detectInitialTier();
    } catch {
      /* */
    }
    this.tier = tier;
    this.hz = tier <= 0 ? 15 : tier === 1 ? 20 : 30;
  }

  run(): Promise<FaceCapResult | 'denied' | 'nocam' | 'mic' | null> {
    return new Promise((res) => {
      this.resolve = res;
      this.build();
      void this.start();
    });
  }

  private build(): void {
    const r = document.createElement('div');
    r.className = 'fc-root';
    r.innerHTML = `
      <div class="fc-top">
        <button class="cin-btn cin-ico" data-a="close" aria-label="${t('cin.fc.close', 'Fechar')}">✕</button>
        <b class="cin-grow">🎭 ${t('cin.fc.title', 'Gravar com o rosto')}</b>
        <span class="fc-left" ${this.unlimited ? 'hidden' : ''}></span>
      </div>
      <div class="fc-stage"><canvas class="fc-cv"></canvas><video class="fc-video" playsinline muted></video><div class="fc-count"></div><div class="fc-status"></div></div>
      <div class="fc-ctrl"></div>`;
    document.body.appendChild(r);
    this.root = r;
    this.cv = r.querySelector('.fc-cv')!;
    this.video = r.querySelector('.fc-video')!;
    this.popBack = pushBack(() => this.close(null));
    r.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (b) void this.action(b.dataset.a!);
    });
    r.addEventListener('input', (e) => {
      const i = e.target as HTMLInputElement;
      if (i.dataset.k === 'c0' || i.dataset.k === 'c1') {
        const v = +i.value;
        if (i.dataset.k === 'c0') this.cut[0] = Math.min(v, this.cut[1] - 0.3);
        else this.cut[1] = Math.max(v, this.cut[0] + 0.3);
        i.value = String(i.dataset.k === 'c0' ? this.cut[0] : this.cut[1]);
        const o = i.nextElementSibling as HTMLOutputElement;
        if (o) o.value = fmtDec(+i.value) + ' s';
      }
    });
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop);
      this.tick(ts);
    };
    this.raf = requestAnimationFrame(loop);
    (window as unknown as { __facecap?: unknown }).__facecap = location.search.includes('debug') ? this : undefined;
  }

  private async start(): Promise<void> {
    this.renderCtrl();
    if (DEBUG_FAKE) {
      this.phase = 'ready';
      this.renderCtrl();
      return;
    }
    const md = navigator.mediaDevices;
    try {
      if (!md?.getUserMedia) throw Object.assign(new Error('x'), { name: 'NotFoundError' });
      this.stream = await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } }, audio: false });
    } catch (e) {
      const n = (e as { name?: string })?.name ?? '';
      return this.close(n === 'NotAllowedError' || n === 'SecurityError' ? 'denied' : 'nocam');
    }
    if (this.closed) return this.stopCam();
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.setStatus(t('cin.fc.loading', 'Preparando o rastreamento do rosto...'));
    try {
      const mod = await import('../mirror/tracker');
      const tr = await mod.createFaceTracker();
      if (this.closed) return tr.close();
      this.tracker = tr;
    } catch (e) {
      console.warn('[cinema] rastreamento indisponível', e);
      return this.close('nocam');
    }
    this.phase = 'ready';
    this.renderCtrl();
  }

  private setStatus(s: string): void {
    const el = this.root.querySelector<HTMLElement>('.fc-status');
    if (el && el.textContent !== s) el.textContent = s;
  }

  /* ---------------------------- laço ---------------------------- */
  private tick(ts: number): void {
    const now = performance.now();
    const dt = Math.min(0.1, this.last ? (now - this.last) / 1000 : 1 / 60);
    this.last = now;
    // rastreamento
    if (this.phase !== 'review' && this.phase !== 'starting') {
      const interval = 1000 / this.hz;
      let got = false;
      if (DEBUG_FAKE) {
        fakeRig(ts / 1000, this.raw);
        got = true;
      } else if (this.tracker && this.video.readyState >= 2 && now - this.lastDetect >= interval) {
        this.lastDetect = now;
        const vw = this.video.videoWidth || 640;
        const vh = this.video.videoHeight || 480;
        const sw = this.tier <= 0 ? 224 : 288;
        const sh = Math.round((sw * vh) / vw);
        if (this.small.width !== sw || this.small.height !== sh) {
          this.small.width = sw;
          this.small.height = sh;
        }
        this.small.getContext('2d')!.drawImage(this.video, 0, 0, sw, sh);
        try {
          got = this.tracker.detect(this.small, now, this.raw);
        } catch (e) {
          console.warn('[cinema] detect', e);
        }
      }
      if (got) {
        this.faceAt = now;
        this.filter.apply(this.raw, this.rig, Math.max(dt, DEBUG_FAKE ? dt : interval / 1000));
      }
      this.gotFace = now - this.faceAt < 700;
      rigToFrame(this.rig, this.frame);
      if (this.phase === 'ready') this.setStatus(this.gotFace ? t('cin.fc.found', 'Rosto encontrado! Toque em Gravar e fale.') : t('cin.fc.search', 'Procurando seu rosto... olhe para a câmera.'));
    }
    // contagem 3-2-1
    if (this.phase === 'count') {
      const left = 3 - (now - this.countT) / 1000;
      const el = this.root.querySelector<HTMLElement>('.fc-count')!;
      el.textContent = left > 0 ? String(Math.ceil(left)) : '';
      if (left <= 0) void this.beginRec();
    }
    // gravando: amostra na taxa fixa
    if (this.phase === 'rec' && this.rec) {
      const el = this.rec.elapsed();
      const idx = Math.floor(el * this.hz);
      while (this.frames.length <= idx) this.frames.push({ ...this.frame });
      if (!this.unlimited) {
        consumeMirror(dt * 1000);
        if (mirrorLeftMs() <= 0) void this.stopRec();
      }
      this.setStatus(`● ${fmtDec(el)} s / ${MAX_REC_SEC} s`);
    }
    const lf = this.root.querySelector<HTMLElement>('.fc-left');
    if (lf && !this.unlimited) lf.textContent = '⏱ ' + t('cin.fc.left', '{t} hoje', { t: fmtLeft(mirrorLeftMs()) });
    this.draw(now);
  }

  private draw(now: number): void {
    const cv = this.cv;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(cv.clientWidth * dpr);
    const H = Math.round(cv.clientHeight * dpr);
    if (!W || !H) return;
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const x = cv.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a1a78');
    g.addColorStop(1, '#ff7ad6');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    let cap: FaceFrame | null = this.frame;
    if (this.phase === 'review' && this.take) {
      if (this.playing) {
        const c = actx();
        const rate = VOICE_RATE[this.cast.voice] ?? 1;
        const s = c ? this.cut[0] + (c.currentTime - this.playing.t0) * rate : 0;
        cap = sampleTake(this.take, Math.min(s, this.cut[1]));
      } else cap = sampleTake(this.take, this.cut[0]);
    }
    const h = Math.min(W, H) * 1.15;
    x.save();
    x.translate(W / 2, H * 0.5 + h * 0.62);
    if (this.cast.kind === 'avatar')
      drawActor2D(x, this.cast, h, { rig: restRig(), expr: 'neutral', talk: 0, t: now / 1000, face: 0, blink: 0, cap, capMouth: this.only && this.phase === 'review' });
    x.restore();
    if (this.phase === 'rec') {
      x.fillStyle = '#ff3d6e';
      x.beginPath();
      x.arc(W - 22 * dpr, 22 * dpr, 8 * dpr * (0.8 + Math.sin(now / 160) * 0.2), 0, Math.PI * 2);
      x.fill();
    }
  }

  /* ---------------------------- controles ---------------------------- */
  private renderCtrl(): void {
    const h = this.root.querySelector<HTMLElement>('.fc-ctrl')!;
    const p = this.phase;
    if (p === 'starting') h.innerHTML = `<p class="cin-hint">${t('cin.fc.starting', 'Ligando a câmera...')}</p>`;
    else if (p === 'ready')
      h.innerHTML = `<p class="cin-hint">${t('cin.fc.tip', 'Fale a fala olhando para a câmera. Seus olhos, sobrancelhas, boca e cabeça viram os do personagem.')}</p>
        <div class="cin-row c"><button class="cin-btn pri fc-recbtn" data-a="rec">● ${t('cin.fc.rec', 'Gravar')}</button></div>
        <p class="cin-hint c">🔒 ${t('cin.fc.privacy', 'Tudo fica no aparelho. Nenhuma imagem é guardada.')}</p>`;
    else if (p === 'count') h.innerHTML = `<div class="cin-row c"><button class="cin-btn ghost" data-a="cancelrec">${t('cin.cancel', 'Cancelar')}</button></div>`;
    else if (p === 'rec') h.innerHTML = `<div class="cin-row c"><button class="cin-btn warn fc-recbtn" data-a="stop">■ ${t('cin.rec.stop', 'Parar')}</button></div>`;
    else {
      const dur = this.take ? takeDuration(this.take) : 0;
      h.innerHTML = `
        <div class="cin-row c"><button class="cin-btn" data-a="play">${this.playing ? '■ ' + t('cin.fc.stopPlay', 'Parar') : '▶ ' + t('cin.fc.play', 'Ver a cena')}</button>
          <button class="cin-btn ${this.only ? 'ok' : ''}" data-a="only">👄 ${t('cin.fc.only', 'Só boca e cabeça')}</button></div>
        <label class="cin-field fc-trim"><span>✂️ ${t('cin.fc.from', 'Início')}</span><input type="range" min="0" max="${dur.toFixed(2)}" step="0.05" value="${this.cut[0]}" data-k="c0"><output>${fmtDec(this.cut[0])} s</output></label>
        <label class="cin-field fc-trim"><span>✂️ ${t('cin.fc.to', 'Fim')}</span><input type="range" min="0" max="${dur.toFixed(2)}" step="0.05" value="${this.cut[1]}" data-k="c1"><output>${fmtDec(this.cut[1])} s</output></label>
        <div class="cin-row c"><button class="cin-btn" data-a="retake">↺ ${t('cin.fc.retake', 'Regravar')}</button><button class="cin-btn pri" data-a="use">✓ ${t('cin.fc.use', 'Usar esta')}</button></div>`;
    }
  }

  private async action(a: string): Promise<void> {
    if (a === 'close') return this.close(null);
    if (a === 'rec' && this.phase === 'ready') {
      this.phase = 'count';
      this.countT = performance.now();
      this.renderCtrl();
    } else if (a === 'cancelrec' && this.phase === 'count') {
      this.phase = 'ready';
      this.root.querySelector<HTMLElement>('.fc-count')!.textContent = '';
      this.renderCtrl();
    } else if (a === 'stop') await this.stopRec();
    else if (a === 'play') this.togglePlay();
    else if (a === 'only') {
      this.only = !this.only;
      this.renderCtrl();
    } else if (a === 'retake') {
      this.stopPlay();
      this.take = null;
      this.result = null;
      this.phase = 'ready';
      this.filter.reset();
      this.renderCtrl();
    } else if (a === 'use' && this.result && this.take) {
      this.stopPlay();
      const take: FaceTake = this.only ? { ...this.take, only: 'mouth' } : this.take;
      const dur = this.result.buf.duration;
      const cut: [number, number] = [Math.max(0, this.cut[0]), Math.min(dur, this.cut[1])];
      this.close({ ...this.result, take, cut });
    }
  }

  private async beginRec(): Promise<void> {
    if (this.phase !== 'count') return;
    this.phase = 'rec';
    this.root.querySelector<HTMLElement>('.fc-count')!.textContent = '';
    this.frames = [];
    const rec = new MicRecorder();
    const err = await rec.start();
    if (err) {
      this.phase = 'ready';
      this.renderCtrl();
      if (err === 'denied') return this.close('mic');
      notify(t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      return;
    }
    this.rec = rec;
    rec.onAutoStop = () => void this.stopRec();
    this.renderCtrl();
  }

  private async stopRec(): Promise<void> {
    const rec = this.rec;
    if (!rec || this.phase !== 'rec') return;
    this.rec = null;
    this.phase = 'review';
    this.setStatus(t('cin.fc.saving', 'Preparando...'));
    this.renderCtrl();
    flushMirror();
    const r = await rec.stop();
    if (!r) {
      notify(t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      this.phase = 'ready';
      return this.renderCtrl();
    }
    const n = Math.max(2, Math.min(this.frames.length, Math.ceil(r.buf.duration * this.hz)));
    while (this.frames.length < n) this.frames.push({ ...this.frame });
    this.take = encodeTake(this.frames.slice(0, n), this.hz);
    this.result = { ...r, take: this.take, cut: [0, r.buf.duration] };
    this.cut = [0, Math.min(r.buf.duration, takeDuration(this.take))];
    this.setStatus(t('cin.fc.review', 'Confira: veja a cena, corte o começo/fim e use.'));
    this.renderCtrl();
    this.togglePlay();
  }

  private togglePlay(): void {
    if (this.playing) return this.stopPlay();
    const c = actx();
    if (!c || !this.result) return;
    void c.resume?.();
    const src = c.createBufferSource();
    src.buffer = this.result.buf;
    src.playbackRate.value = VOICE_RATE[this.cast.voice] ?? 1;
    src.connect(c.destination);
    const t0 = c.currentTime + 0.05;
    src.start(t0, this.cut[0], Math.max(0.05, this.cut[1] - this.cut[0]));
    src.onended = () => {
      if (this.playing?.src === src) {
        this.playing = null;
        this.renderCtrl();
      }
    };
    this.playing = { src, t0 };
    this.renderCtrl();
  }
  private stopPlay(): void {
    const p = this.playing;
    this.playing = null;
    try {
      p?.src.stop();
    } catch {
      /* */
    }
  }

  /* ---------------------------- fechar ---------------------------- */
  private stopCam(): void {
    this.stream?.getTracks().forEach((tr) => tr.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  private close(r: FaceCapResult | 'denied' | 'nocam' | 'mic' | null): void {
    if (this.closed) return;
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.stopPlay();
    this.rec?.cancel();
    this.rec = null;
    this.stopCam();
    this.tracker?.close();
    this.tracker = null;
    flushMirror();
    this.popBack();
    this.root.remove();
    (window as unknown as { __facecap?: unknown }).__facecap = undefined;
    this.resolve(r);
  }
}
