/* ============================================================
 *  BLOOP CINEMA — ESTÚDIO DE DUBLAGEM ("Dublar") + "Assistir".
 *
 *  O filme toca em tempo real; quando chega uma fala aparece um
 *  TELEPROMPTER gigante (as palavras acendem no ritmo da fala), a
 *  contagem 3-2-1, a boca do personagem mexe com a SUA voz e o
 *  microfone grava só aquela fala. Regravar por fala, ouvir, volume,
 *  efeitos de voz e "Dublar tudo de uma vez" (grava todas as falas
 *  em sequência assistindo o filme). Fala sem texto = improviso: a
 *  duração segue a gravação.
 *
 *  Durante a gravação o aparelho também tenta transformar a fala em
 *  texto (src/pet/talk/stt.ts) — vai junto para a moderação da TV.
 *
 *  PRIVACIDADE: as vozes ficam só no aparelho (IndexedDB) até a
 *  pessoa escolher "Enviar para a TV".
 * ============================================================ */
import { pushBack } from '../core/back';
import { detectInitialTier } from '../core/quality';
import { isNative } from '../core/platform';
import { t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { cancelListening, listen, stopListening, sttAvailable } from '../pet/talk/stt';
import { scanText } from '../../shared/moderation';
import { actx, loadClip, MicRecorder, Mixer, Playback, playSfx, preloadProjectClips, previewClip, rememberClip } from './audio';
import { applyLineAudio, textPace } from './board';
import { Renderer, setVoiceEnv, VOICE_RATE } from './engine';
import { clone, flatShots, type CastMember, type Line, type Project, type VoiceFxId } from './format';
import { VOICES } from './data';
import { actorThumbCopy as actorThumb } from './rig2d';
import { getClip, putClip } from './store';
import { uid } from './format';

/** Quem abriu a dublagem: o quadro (modo fácil) ou o editor avançado. */
export interface DubHost {
  project(): Project;
  /** muda o projeto (o host remonta/salva) */
  edit(fn: (p: Project) => void): void;
}

interface LineRef {
  line: Line;
  /** número da fala no filme (1..) */
  n: number;
  /** início/fim no filme (s) */
  start: number;
  end: number;
  shotStart: number;
  cast?: CastMember;
}

function filmLines(p: Project): LineRef[] {
  const out: LineRef[] = [];
  for (const r of flatShots(p))
    for (const l of r.shot.lines.slice().sort((a, b) => a.t - b.t))
      out.push({ line: l, n: out.length + 1, start: r.start + l.t, end: r.start + l.t + l.dur, shotStart: r.start, cast: p.cast.find((c) => c.id === l.cast) });
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const LIVE = 'live-dub';
const MAX_IMPROV = 12;

/* ---------------------------- palco (canvas + relógio) ---------------------------- */
class Stage {
  r: Renderer;
  T = 0;
  raf = 0;
  dead = false;
  /** relógio: 'pb' = segue o áudio (Playback); 'free' = performance.now(); 'hold' = parado */
  mode: 'pb' | 'free' | 'hold' = 'hold';
  private t0 = 0;
  private T0 = 0;
  /** limite do relógio livre (congela no fim da fala) */
  cap = Infinity;
  onFrame: ((T: number) => void) | null = null;

  constructor(
    readonly cv: HTMLCanvasElement,
    p: Project,
    readonly pb: Playback | null,
  ) {
    this.r = new Renderer(p);
    if (p.mode === '3d') void this.load3d();
    const loop = () => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      if (this.mode === 'pb' && this.pb) {
        const tt = this.pb.time();
        if (!Number.isNaN(tt)) this.T = Math.max(0, tt);
      } else if (this.mode === 'free') this.T = Math.min(this.cap, this.T0 + (performance.now() - this.t0) / 1000);
      this.onFrame?.(this.T);
      this.draw();
    };
    loop();
  }
  private async load3d(): Promise<void> {
    try {
      const m = await import('./scene3d');
      if (!this.dead) this.r.r3d = new m.Scene3D(detectInitialTier());
    } catch (e) {
      console.warn('[dub] 3D', e);
    }
  }
  setProject(p: Project): void {
    const r3d = this.r.r3d;
    this.r = new Renderer(p);
    this.r.r3d = r3d;
  }
  free(T: number, cap = Infinity): void {
    this.mode = 'free';
    this.T0 = T;
    this.T = T;
    this.t0 = performance.now();
    this.cap = cap;
  }
  hold(T: number): void {
    this.mode = 'hold';
    this.T = T;
  }
  draw(): void {
    const cv = this.cv;
    const w = cv.clientWidth || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.min(1280, Math.round(w * dpr));
    const H = Math.round((W * 9) / 16);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    const x = cv.getContext('2d');
    if (x) this.r.draw(x, W, H, Math.min(this.T, Math.max(0, this.r.duration() - 0.001)), { budget: 0.6, bgScale: 1 });
  }
  dispose(): void {
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.r.dispose();
  }
}

function getMixer(): Mixer | null {
  const c = actx();
  return c ? new Mixer(c) : null;
}

/* ---------------------------- Assistir ---------------------------- */
/** Player em tela cheia (botões grandes). Resolve ao fechar. */
export function watchFilm(host: HTMLElement, p: Project): Promise<void> {
  return new Promise((res) => {
    const el = document.createElement('div');
    el.className = 'dub-root watch';
    el.innerHTML = `<div class="dub-top"><button class="cin-btn cin-ico" data-w="x" aria-label="${t('cin.back', 'Voltar')}">←</button><b class="dub-title">▶ ${esc(p.title)}</b></div>
      <div class="dub-stage"><canvas></canvas></div>
      <div class="watch-bar"><button class="cin-btn pri dub-big" data-w="play">⏸ ${t('cin.dub.pause', 'Pausar')}</button><button class="cin-btn dub-big" data-w="again">↺ ${t('cin.dub.again', 'De novo')}</button></div>
      <div class="dub-prog"><i></i></div>`;
    host.appendChild(el);
    const m = getMixer();
    const pb = m ? new Playback(m) : null;
    const st = new Stage(el.querySelector('canvas')!, p, pb);
    const dur = st.r.duration();
    let playing = false;
    const btn = el.querySelector<HTMLElement>('[data-w="play"]')!;
    const bar = el.querySelector<HTMLElement>('.dub-prog i')!;
    const play = async (T: number) => {
      playing = true;
      btn.innerHTML = `⏸ ${t('cin.dub.pause', 'Pausar')}`;
      if (pb) {
        st.mode = 'pb';
        await pb.start(p, T, dur);
      } else st.free(T);
    };
    const pause = () => {
      playing = false;
      pb?.stop();
      st.hold(st.T);
      btn.innerHTML = `▶ ${t('cin.ed.play', 'Assistir')}`;
    };
    st.onFrame = (T) => {
      bar.style.width = `${Math.min(100, (T / Math.max(0.1, dur)) * 100)}%`;
      if (playing && T >= dur - 0.02) pause();
    };
    const close = () => {
      pause();
      st.dispose();
      m?.dispose();
      el.remove();
      pop();
      res();
    };
    const pop = pushBack(close);
    el.onclick = (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-w]')?.dataset.w;
      if (a === 'x') close();
      else if (a === 'play') {
        if (playing) pause();
        else void play(st.T >= dur - 0.05 ? 0 : st.T);
      } else if (a === 'again') {
        pause();
        void play(0);
      }
    };
    m?.setMix(p);
    void preloadProjectClips(p).then(() => play(0));
  });
}

/* ---------------------------- Dublar ---------------------------- */
type RecMode = 'auto' | 'hold';
const MODE_KEY = 'bw-cin-dubmode';

export interface DubOpts {
  /** começa já gravando esta fala */
  line?: string;
  /** começa "Dublar tudo" */
  all?: boolean;
}

/** Abre o estúdio de dublagem. Resolve ao fechar. */
export function openDub(root: HTMLElement, host: DubHost, o: DubOpts = {}): Promise<void> {
  return new Promise((res) => new Dub(root, host, o, res));
}

class Dub {
  private el: HTMLElement;
  private m: Mixer | null;
  private pb: Playback | null;
  private st: Stage;
  private lines: LineRef[] = [];
  private busy = false;
  private stopReq = false;
  private stopNow: (() => void) | null = null;
  private holdDown = false;
  private holdWait: ((down: boolean) => void) | null = null;
  private mode: RecMode;
  private warn = new Map<string, string>();
  private stopPreview: (() => void) | null = null;
  private pop: () => void;
  private sel: string | null = null;

  constructor(
    root: HTMLElement,
    private host: DubHost,
    o: DubOpts,
    private done: () => void,
  ) {
    let mode: RecMode = 'auto';
    try {
      mode = localStorage.getItem(MODE_KEY) === 'hold' ? 'hold' : 'auto';
    } catch {
      /* */
    }
    this.mode = mode;
    this.m = getMixer();
    this.pb = this.m ? new Playback(this.m) : null;
    const p = host.project();
    this.el = document.createElement('div');
    this.el.className = 'dub-root';
    this.el.innerHTML = `
      <div class="dub-top"><button class="cin-btn cin-ico" data-d="x" aria-label="${t('cin.back', 'Voltar')}">←</button><b class="dub-title">🎙️ ${t('cin.dub.title', 'Dublar')}</b>
        <div class="dub-modes" role="group"><button class="cin-chip" data-d="mode" data-v="auto">⏱ ${t('cin.dub.auto', 'Automático')}</button><button class="cin-chip" data-d="mode" data-v="hold">✋ ${t('cin.dub.hold', 'Segurar')}</button></div></div>
      <div class="dub-stage"><canvas></canvas><div class="dub-count" hidden></div><div class="dub-rec" hidden>● REC</div></div>
      <div class="dub-prompt" hidden><div class="dub-who"></div><div class="dub-words"></div><div class="dub-bar"><i></i></div></div>
      <div class="dub-ctl" hidden><button class="cin-btn warn dub-big" data-d="stop">■ ${t('cin.dub.done', 'Pronto')}</button><button class="dub-hold" data-d="hold">🎙️<span>${t('cin.dub.holdBtn', 'Segure e fale')}</span></button><button class="cin-btn ghost" data-d="cancel">✕ ${t('cin.dub.cancel', 'Parar')}</button></div>
      <div class="dub-main">
        <p class="dub-tip">${t('cin.dub.tip', 'Escolha uma fala e aperte 🎙️. Quando aparecer 3-2-1, leia as palavras que acendem!')}</p>
        <div class="dub-lines"></div>
        <h5>🎚️ ${t('cin.dub.voices', 'Efeito de voz')}</h5><div class="dub-fx"></div>
        <h5>🔊 ${t('cin.dub.volume', 'Volume')}</h5>
        <label class="dub-vol">🗣️ <input type="range" min="0" max="1" step="0.05" data-vol="voice"></label>
        <label class="dub-vol">🎵 <input type="range" min="0" max="1" step="0.05" data-vol="music"></label>
      </div>
      <div class="dub-foot"><button class="cin-btn pri dub-big" data-d="all">🎬 ${t('cin.dub.all', 'Dublar tudo')}</button><button class="cin-btn ok dub-big" data-d="preview">▶ ${t('cin.dub.preview', 'Ver com as vozes')}</button></div>`;
    root.appendChild(this.el);
    this.st = new Stage(this.el.querySelector('.dub-stage canvas')!, p, this.pb);
    this.pop = pushBack(() => this.close(true));
    this.bind();
    this.refresh();
    const first = this.lines[0];
    this.sel = o.line ?? first?.line.id ?? null;
    this.showLine(this.sel);
    void preloadProjectClips(p);
    if (!this.lines.length) notify(t('cin.dub.noLines', 'Este filme ainda não tem falas. Crie uma fala na cena para dublar!'), { kind: 'warn' });
    else if (o.all) void this.run(this.lines.map((l) => l.line.id));
    else if (o.line && this.lines.some((l) => l.line.id === o.line)) void this.run([o.line]);
  }

  /* ---------- UI ---------- */
  private bind(): void {
    const e = this.el;
    e.addEventListener('click', (ev) => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-d]');
      if (!b) return;
      const a = b.dataset.d!;
      const id = b.dataset.id ?? '';
      if (a === 'x') this.close();
      else if (a === 'mode') {
        this.mode = b.dataset.v === 'hold' ? 'hold' : 'auto';
        try {
          localStorage.setItem(MODE_KEY, this.mode);
        } catch {
          /* */
        }
        this.renderModes();
      } else if (a === 'stop') this.stopNow?.();
      else if (a === 'cancel') {
        this.stopReq = true;
        this.stopNow?.();
        this.holdWait?.(false);
      } else if (this.busy) return;
      else if (a === 'rec') void this.run([id]);
      else if (a === 'all') void this.run(this.lines.map((l) => l.line.id));
      else if (a === 'preview') void this.previewFrom(0, Infinity);
      else if (a === 'hear') void this.hear(id);
      else if (a === 'del') {
        this.host.edit((p) => void applyLineAudio(p, id, null));
        this.warn.delete(id);
        this.refresh();
      } else if (a === 'pick') {
        this.sel = id;
        this.showLine(id);
        this.renderLines();
      } else if (a === 'fx') {
        const [cid, fx] = id.split('|');
        this.host.edit((p) => {
          const c = p.cast.find((x) => x.id === cid);
          if (c) c.voice = fx as VoiceFxId;
        });
        this.refresh();
        const l = this.lines.find((x) => x.line.cast === cid && x.line.audio);
        if (l) void this.hear(l.line.id);
      }
    });
    // segurar para falar
    const hold = e.querySelector<HTMLElement>('[data-d="hold"]')!;
    const down = (ev: PointerEvent) => {
      ev.preventDefault();
      this.holdDown = true;
      hold.classList.add('on');
      this.holdWait?.(true);
    };
    const up = () => {
      if (!this.holdDown) return;
      this.holdDown = false;
      hold.classList.remove('on');
      this.stopNow?.();
    };
    hold.addEventListener('pointerdown', down);
    hold.addEventListener('pointerup', up);
    hold.addEventListener('pointercancel', up);
    hold.addEventListener('pointerleave', up);
    e.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((r) => {
      r.oninput = () => {
        const v = +r.value;
        this.host.edit((p) => {
          if (r.dataset.vol === 'voice') p.mix.voice = v;
          else p.mix.music = v;
        });
        this.m?.setMix(this.host.project());
      };
    });
    this.renderModes();
  }

  private renderModes(): void {
    this.el.querySelectorAll<HTMLElement>('[data-d="mode"]').forEach((b) => b.classList.toggle('on', b.dataset.v === this.mode));
  }

  /** Recalcula as falas e redesenha a lista. */
  private refresh(): void {
    const p = this.host.project();
    this.lines = filmLines(p);
    this.st.setProject(p);
    this.renderLines();
    // efeitos de voz por personagem que fala
    const who = [...new Set(this.lines.map((l) => l.line.cast).filter(Boolean))] as string[];
    const fxHost = this.el.querySelector<HTMLElement>('.dub-fx')!;
    fxHost.innerHTML = who
      .map((cid) => {
        const c = p.cast.find((x) => x.id === cid);
        if (!c) return '';
        return `<div class="dub-fxrow"><span class="dub-face" data-face="${esc(cid)}"></span><div class="cin-chips">${VOICES.map((v) => `<button class="cin-chip ${c.voice === v.id ? 'on' : ''}" data-d="fx" data-id="${esc(cid)}|${v.id}">${v.glyph} ${esc(v.name)}</button>`).join('')}</div></div>`;
      })
      .join('');
    fxHost.querySelectorAll<HTMLElement>('[data-face]').forEach((s) => {
      const c = p.cast.find((x) => x.id === s.dataset.face);
      if (c) s.appendChild(actorThumb(c, 40, 'stand', 'happy', 0.3, 'face'));
    });
    const vv = this.el.querySelector<HTMLInputElement>('[data-vol="voice"]');
    const vm = this.el.querySelector<HTMLInputElement>('[data-vol="music"]');
    if (vv) vv.value = String(p.mix.voice);
    if (vm) vm.value = String(p.mix.music);
    this.m?.setMix(p);
  }

  private renderLines(): void {
    const host = this.el.querySelector<HTMLElement>('.dub-lines')!;
    host.innerHTML = this.lines
      .map((r) => {
        const l = r.line;
        const w = this.warn.get(l.id);
        return `<div class="dub-line ${l.id === this.sel ? 'sel' : ''} ${l.audio ? 'ok' : ''}" data-line="${esc(l.id)}">
          <button class="dub-lpick" data-d="pick" data-id="${esc(l.id)}"><span class="dub-face" data-face="${esc(l.cast ?? '')}">${l.cast ? '' : '📢'}</span><span class="dub-ltxt"><small>${t('cin.dub.lineN', 'Fala {n}', { n: r.n })} · ${esc(r.cast?.name ?? t('cin.easy.narrator', 'Narrador'))}</small>${l.text ? '“' + esc(l.text) + '”' : `<i>✨ ${t('cin.dub.improv', 'Improviso: fale o que quiser!')}</i>`}</span><span class="dub-st">${l.audio ? '✅' : '⚪'}</span></button>
          <div class="dub-lbtns"><button class="cin-btn pri sm" data-d="rec" data-id="${esc(l.id)}">🎙️ ${l.audio ? t('cin.dub.retake', 'Regravar') : t('cin.dub.rec', 'Gravar')}</button>${l.audio ? `<button class="cin-btn sm" data-d="hear" data-id="${esc(l.id)}">▶ ${t('cin.lines.hear', 'Ouvir')}</button><button class="cin-btn sm ghost" data-d="del" data-id="${esc(l.id)}" aria-label="${t('cin.lines.unrec', 'Tirar voz')}">🗑</button>` : ''}</div>
          ${w ? `<div class="dub-warn">${w}</div>` : ''}</div>`;
      })
      .join('');
    const p = this.host.project();
    host.querySelectorAll<HTMLElement>('.dub-line [data-face]').forEach((s) => {
      const c = p.cast.find((x) => x.id === s.dataset.face);
      if (c) s.appendChild(actorThumb(c, 40, 'stand', 'happy', 0.3, 'face'));
    });
    host.querySelector('.dub-line.sel')?.scrollIntoView({ block: 'nearest' });
  }

  /** Mostra o quadro da fala (parado) e o teleprompter com o texto. */
  private showLine(id: string | null): void {
    const r = this.lines.find((x) => x.line.id === id);
    if (!r) return;
    this.st.hold(r.start + 0.05);
    this.prompt(r, -1);
  }

  /** Teleprompter: k = progresso 0..1 da fala (−1 = só mostra). */
  private prompt(r: LineRef, k: number): void {
    const box = this.el.querySelector<HTMLElement>('.dub-prompt')!;
    box.hidden = false;
    box.classList.toggle('idle', k < 0);
    const who = box.querySelector<HTMLElement>('.dub-who')!;
    if (who.dataset.id !== r.line.id) {
      who.dataset.id = r.line.id;
      who.innerHTML = `<span class="dub-face"></span><b>${esc(r.cast?.name ?? t('cin.easy.narrator', 'Narrador'))}</b>`;
      if (r.cast) who.querySelector('.dub-face')!.appendChild(actorThumb(r.cast, 40, 'stand', 'happy', 0.3, 'face'));
      const words = r.line.text.trim().split(/\s+/).filter(Boolean);
      box.querySelector('.dub-words')!.innerHTML = words.length ? words.map((w) => `<span>${esc(w)}</span>`).join(' ') : `<em>✨ ${t('cin.dub.improvBig', 'Improvise! Fale o que quiser.')}</em>`;
    }
    const spans = box.querySelectorAll<HTMLElement>('.dub-words span');
    if (spans.length) {
      // peso de cada palavra = letras + 1 (palavras longas demoram mais)
      const wts = [...spans].map((s) => (s.textContent ?? '').length + 1);
      const tot = wts.reduce((a, b) => a + b, 0);
      let acc = 0;
      const pos = k < 0 ? -1 : k * tot;
      spans.forEach((s, i) => {
        const a0 = acc;
        acc += wts[i];
        s.classList.toggle('on', pos >= acc);
        s.classList.toggle('cur', pos >= a0 && pos < acc);
      });
    }
    box.querySelector<HTMLElement>('.dub-bar i')!.style.width = `${Math.max(0, Math.min(1, k)) * 100}%`;
  }

  /* ---------- tocar ---------- */
  private async hear(id: string): Promise<void> {
    const r = this.lines.find((x) => x.line.id === id);
    if (!r || !r.line.audio) return;
    this.sel = id;
    this.renderLines();
    // ouve vendo: toca o trecho da fala com o filme
    await this.previewFrom(Math.max(r.shotStart, r.start - 0.4), r.end + 0.4);
  }

  private async previewFrom(T0: number, T1: number): Promise<void> {
    if (this.busy) return;
    const p = this.host.project();
    const end = Math.min(T1, this.st.r.duration());
    this.busy = true;
    this.el.classList.add('busy');
    if (this.pb) {
      this.m?.setMuted(false);
      await this.pb.start(p, T0, this.st.r.duration());
      this.st.mode = 'pb';
    } else this.st.free(T0);
    await new Promise<void>((res) => {
      this.stopNow = () => res();
      const tick = () => {
        if (this.st.T >= end - 0.02 || this.stopReq) return res();
        const cur = this.lines.find((l) => this.st.T >= l.start && this.st.T < l.end);
        if (cur) this.prompt(cur, Math.min(1, (this.st.T - cur.start) / Math.max(0.3, cur.end - cur.start)));
        requestAnimationFrame(tick);
      };
      tick();
    });
    this.stopNow = null;
    this.pb?.stop();
    this.st.hold(this.st.T);
    this.busy = false;
    this.stopReq = false;
    this.el.classList.remove('busy');
  }

  /* ---------- gravar ---------- */
  /** Grava as falas em sequência (uma = "Gravar"; todas = "Dublar tudo"). */
  private async run(ids: string[]): Promise<void> {
    if (this.busy || !ids.length) return;
    if (!MicRecorder.supported()) {
      notify(t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      return;
    }
    this.busy = true;
    this.stopReq = false;
    this.el.classList.add('busy', 'recording');
    let prevEnd = -1;
    try {
      for (let i = 0; i < ids.length && !this.stopReq; i++) {
        const r = this.lines.find((x) => x.line.id === ids[i]);
        if (!r) continue;
        this.sel = r.line.id;
        this.renderLines();
        const ok = await this.recordLine(r, prevEnd, ids.length > 1);
        if (ok === 'error') break;
        const nr = this.lines.find((x) => x.line.id === ids[i]);
        prevEnd = nr ? nr.end : -1;
      }
    } finally {
      this.el.classList.remove('busy', 'recording');
      this.el.querySelector<HTMLElement>('.dub-ctl')!.hidden = true;
      this.el.querySelector<HTMLElement>('.dub-count')!.hidden = true;
      this.el.querySelector<HTMLElement>('.dub-rec')!.hidden = true;
      this.m?.setMuted(false);
      this.busy = false;
    }
    const last = this.lines.find((x) => x.line.id === ids[ids.length - 1]);
    if (!this.stopReq && last?.line.audio) {
      // prévia automática: uma fala = ouve a fala; tudo = assiste o filme todo com as vozes
      if (ids.length === 1) await this.hear(last.line.id);
      else {
        notify(t('cin.dub.allDone', 'Dublagem pronta! Veja como ficou.'), { kind: 'good', icon: 'check' });
        await this.previewFrom(0, Infinity);
      }
    }
    this.stopReq = false;
    this.showLine(this.sel);
  }

  /**
   * Uma fala: assiste um pedacinho antes → 3-2-1 → grava enquanto o filme anda e o teleprompter acende.
   * `prevEnd` = onde o filme parou (Dublar tudo: assiste o trecho entre as falas).
   */
  private async recordLine(r: LineRef, prevEnd: number, chain: boolean): Promise<'ok' | 'skip' | 'error'> {
    const base = this.host.project();
    // projeto da gravação: a fala fica "ao vivo" (boca segue o microfone) e sem fim
    const dp = clone(base);
    const env = new Float32Array(50 * (MAX_IMPROV + 3));
    setVoiceEnv(LIVE, { env, dur: MAX_IMPROV + 3 });
    let lineStart = r.start;
    let lineCap = Infinity;
    for (const fr of flatShots(dp)) {
      const l = fr.shot.lines.find((x) => x.id === r.line.id);
      if (!l) continue;
      l.audio = LIVE;
      delete l.cut;
      delete l.face;
      l.dur = MAX_IMPROV;
      fr.shot.dur = Math.max(fr.shot.dur, l.t + MAX_IMPROV + 0.4);
      lineStart = fr.start + l.t;
      lineCap = lineStart + MAX_IMPROV;
      // o rig da voz ao vivo usa velocidade 1
      const c = dp.cast.find((x) => x.id === l.cast);
      if (c) c.voice = c.voice === 'robot' || c.voice === 'echo' ? c.voice : 'normal';
    }
    this.st.setProject(dp);
    this.prompt(r, 0);
    // 1) assistir um pedacinho antes (com som)
    const pre = chain && prevEnd >= 0 ? Math.max(prevEnd, lineStart - 6) : Math.max(r.shotStart, lineStart - 1.4);
    if (lineStart - pre > 0.25 && this.pb) {
      this.m?.setMuted(false);
      await this.pb.start(dp, pre, this.st.r.duration());
      this.st.mode = 'pb';
      await new Promise<void>((res) => {
        const tick = () => (this.st.T >= lineStart - 0.03 || this.stopReq ? res() : requestAnimationFrame(tick));
        tick();
      });
      this.pb.stop();
    }
    this.st.hold(lineStart);
    if (this.stopReq) return 'skip';
    // 2) microfone + contagem (o microfone já abre na contagem; o começo é cortado depois)
    const rec = new MicRecorder();
    const err = await rec.start();
    if (err) {
      notify(err === 'denied' ? t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.') : t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      return 'error';
    }
    rec.onAutoStop = () => this.stopNow?.();
    const ctl = this.el.querySelector<HTMLElement>('.dub-ctl')!;
    const holdBtn = ctl.querySelector<HTMLElement>('[data-d="hold"]')!;
    const stopBtn = ctl.querySelector<HTMLElement>('[data-d="stop"]')!;
    ctl.hidden = false;
    holdBtn.hidden = this.mode !== 'hold';
    stopBtn.hidden = true;
    const count = this.el.querySelector<HTMLElement>('.dub-count')!;
    const c = this.m?.c;
    if (this.mode === 'auto') {
      for (const n of ['3', '2', '1']) {
        if (this.stopReq) break;
        count.hidden = false;
        count.textContent = n;
        count.classList.remove('pop');
        void count.offsetWidth;
        count.classList.add('pop');
        if (c && this.m) playSfx(c, this.m.sfx, 'pop', c.currentTime, 0.5, []);
        await sleep(650);
      }
    } else {
      count.hidden = false;
      count.textContent = '✋';
      count.classList.add('pop');
      if (!this.holdDown) await new Promise<void>((res) => (this.holdWait = () => res()));
      this.holdWait = null;
    }
    if (this.stopReq) {
      rec.cancel();
      count.hidden = true;
      return 'skip';
    }
    count.textContent = t('cin.dub.go', 'Fale!');
    count.classList.remove('pop');
    void count.offsetWidth;
    count.classList.add('pop', 'go');
    setTimeout(() => {
      count.hidden = true;
      count.classList.remove('go');
    }, 600);
    // 3) gravando: filme anda (mudo), teleprompter no ritmo da fala, boca segue a voz
    this.m?.setMuted(true);
    const goAt = rec.elapsed();
    this.el.querySelector<HTMLElement>('.dub-rec')!.hidden = false;
    stopBtn.hidden = this.mode === 'hold';
    const text = r.line.text.trim();
    const pace = text ? textPace(text) : 0;
    this.st.free(lineStart, lineCap);
    const stt = await startStt();
    let spoke = 0;
    let quiet = 0;
    await new Promise<void>((res) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        res();
      };
      this.stopNow = finish;
      const t0 = performance.now();
      const tick = () => {
        if (done) return;
        const el = (performance.now() - t0) / 1000;
        const lv = rec.level();
        const i = Math.floor(el * 50);
        if (i < env.length) for (let j = Math.max(0, i - 2); j <= i; j++) env[j] = Math.max(env[j], Math.min(1, lv * 1.5));
        if (lv > 0.12) (spoke += 1 / 60), (quiet = 0);
        else quiet += 1 / 60;
        this.prompt(r, text ? Math.min(1, el / pace) : Math.min(1, el / MAX_IMPROV));
        if (this.stopReq) return finish();
        if (this.mode === 'auto') {
          // texto: janela no ritmo da fala (+ folga); se ainda estiver falando, espera um pouquinho
          if (text && el > pace + 0.5 && (quiet > 0.35 || el > pace + 2.5)) return finish();
          // improviso: para sozinho depois de 1,2 s de silêncio (se já falou)
          if (!text && spoke > 0.3 && quiet > 1.2) return finish();
        }
        if (el > MAX_IMPROV) return finish();
        requestAnimationFrame(tick);
      };
      tick();
    });
    this.stopNow = null;
    this.el.querySelector<HTMLElement>('.dub-rec')!.hidden = true;
    ctl.hidden = true;
    this.st.hold(this.st.T);
    const out = await rec.stop();
    const tx = stt ? await stt() : undefined;
    this.m?.setMuted(false);
    if (this.stopReq && !out) return 'skip';
    if (!out) {
      notify(t('cin.dub.noVoice', 'Não ouvi sua voz. Chegue mais perto do microfone e tente de novo!'), { kind: 'warn' });
      return 'skip';
    }
    // 4) corta o começo (contagem) e o silêncio do fim
    const cut0 = Math.max(0, Math.min(out.buf.duration - 0.2, goAt - 0.06));
    let last = -1;
    for (let i = out.env.length - 1; i >= Math.floor(cut0 * 50); i--)
      if (out.env[i] > 0.1) {
        last = i;
        break;
      }
    if (last < 0) {
      notify(t('cin.dub.noVoice', 'Não ouvi sua voz. Chegue mais perto do microfone e tente de novo!'), { kind: 'warn' });
      return 'skip';
    }
    const cut1 = Math.min(out.buf.duration, Math.max(cut0 + 0.4, last / 50 + 0.3));
    const id = uid('clip');
    const p0 = this.host.project();
    await putClip({ id, pid: p0.id, blob: out.blob, dur: out.buf.duration, env: out.env, ...(tx !== undefined ? { tx } : {}) });
    rememberClip(id, out.buf, out.env);
    this.host.edit((p) => void applyLineAudio(p, r.line.id, { audio: id, cut: [Math.round(cut0 * 100) / 100, Math.round(cut1 * 100) / 100] }));
    // checagem local (o servidor confere de novo com a IA antes da TV)
    const sc = tx ? scanText(tx) : null;
    if (sc && (sc.level === 'bad' || sc.level === 'pii')) {
      this.warn.set(r.line.id, sc.level === 'pii' ? `⚠️ ${t('cin.dub.warnPii', 'Ops! Parece que tem um dado pessoal nessa fala (telefone, endereço, escola). Grave de novo sem isso.')}` : `⚠️ ${t('cin.dub.warnBad', 'Ops! Ouvi uma palavra que não pode na TV. Grave essa fala de novo!')}`);
    } else this.warn.delete(r.line.id);
    this.refresh();
    return 'ok';
  }

  private close(fromBack = false): void {
    this.stopReq = true;
    this.stopNow?.();
    this.holdWait?.(false);
    cancelListening();
    this.stopPreview?.();
    this.pb?.stop();
    this.st.dispose();
    this.m?.dispose();
    this.el.remove();
    if (!fromBack) this.pop();
    this.done();
  }
}

/** Fala → texto durante a gravação (melhor esforço). No Android o reconhecedor nativo disputaria o microfone. */
async function startStt(): Promise<(() => Promise<string | undefined>) | null> {
  const fake = typeof (window as unknown as { __bloopFakeStt?: unknown }).__bloopFakeStt === 'string';
  if (isNative && !fake) return null;
  if (!(await sttAvailable().catch(() => false))) return null;
  const p = listen({});
  return async () => {
    stopListening();
    const r = await Promise.race([p, sleep(1800).then(() => null)]);
    if (!r) cancelListening();
    return r && 'text' in r ? r.text.slice(0, 500) : undefined;
  };
}

/** Ouve uma gravação isolada (lista do quadro). */
export async function hearLine(p: Project, lineId: string): Promise<void> {
  for (const s of p.scenes)
    for (const h of s.shots) {
      const l = h.lines.find((x) => x.id === lineId);
      if (!l?.audio) continue;
      const m = getMixer();
      if (!m) return;
      m.setMix(p);
      await loadClip(l.audio);
      const fx = p.cast.find((c) => c.id === l.cast)?.voice ?? 'normal';
      previewClip(m, l.audio, fx, l.cut);
      void VOICE_RATE;
      return;
    }
}

/** O que o aparelho entendeu de uma gravação (para mostrar no quadro). */
export async function clipTranscript(id: string): Promise<string | undefined> {
  return (await getClip(id))?.tx;
}
