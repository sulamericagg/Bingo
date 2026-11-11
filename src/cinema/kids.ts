/* ============================================================
 *  BLOOP CINEMA — "Criar história" (modo simples, para crianças).
 *  3 passos: 1) personagens  2) lugar  3) o que acontece (fale ou
 *  escreva). Cada fala tem UM botão de microfone gigante: segura para
 *  falar, solta para parar, toca de volta sozinho, "Refazer".
 *  Sai um StorySpec (shared/story.ts) que vira o filme (storybuild.ts).
 * ============================================================ */
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { STORY_LIMITS, type StoryBeat, type StoryExpr, type StorySpec } from '../../shared/story';
import { actx, clipBuffer, MicRecorder, rememberClip } from './audio';
import { BACKGROUNDS, PRESETS } from './data';
import { VOICE_RATE } from './engine';
import { uid, type CastMember } from './format';
import { bgThumb } from './panels';
import { castFromRef } from './storybuild';
import { putClip } from './store';
import { actorThumb } from './rig2d';
import { cleanText, isPro, paywall } from './gates';
import { dictate, dictating, stopDictation } from './dictate';

export interface WizardResult {
  spec: StorySpec;
  cast: CastMember[];
}

const MOODS: [StoryExpr, string][] = [
  ['happy', '😊'],
  ['laughing', '😆'],
  ['sad', '😢'],
  ['surprised', '😮'],
  ['angry', '😠'],
  ['scared', '😱'],
  ['love', '😍'],
  ['thinking', '🤔'],
];
const MAX_KID_CAST = 3;
const MAX_KID_BEATS = STORY_LIMITS.beats * 2;

interface Opts {
  /** id do projeto (as gravações ficam ligadas a ele) */
  pid: string;
  /** re-edição: roteiro e elenco atuais */
  spec?: StorySpec;
  cast?: CastMember[];
  host: HTMLElement;
}

/** Abre o assistente. null = desistiu. */
export function storyWizard(o: Opts): Promise<WizardResult | null> {
  return new Promise((res) => new Wizard(o, res));
}

class Wizard {
  private el: HTMLElement;
  private step: 1 | 2 | 3;
  private refs: string[] = [];
  private cast: CastMember[] = [];
  private bg = 'park';
  private beats: StoryBeat[] = [];
  private title = '';
  private pop: () => void;
  private rec: { m: MicRecorder; i: number; up: boolean; started: boolean } | null = null;
  private playSrc: AudioBufferSourceNode | null = null;
  private candidates: CastMember[];

  constructor(
    private o: Opts,
    private done: (r: WizardResult | null) => void,
  ) {
    this.candidates = [castFromRef('you'), ...PRESETS.map((p) => castFromRef(p.id))];
    if (o.spec && o.cast) {
      this.cast = o.cast.slice();
      this.refs = o.spec.cast.map((c) => c.ref);
      this.bg = o.spec.scenes[0]?.bg ?? 'park';
      this.beats = o.spec.scenes.flatMap((s) => s.beats.map((b) => ({ ...b })));
      this.title = o.spec.title;
      this.step = 3;
    } else this.step = 1;
    this.el = document.createElement('div');
    this.el.className = 'kid-root';
    o.host.appendChild(this.el);
    this.pop = pushBack(() => this.back());
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-k]');
      if (b) this.act(b.dataset.k!, b);
    });
    this.el.addEventListener('change', (e) => {
      const i = e.target as HTMLTextAreaElement;
      if (i.dataset.t !== undefined) {
        const b = this.beats[+i.dataset.t];
        if (b) {
          b.text = cleanText(i.value, STORY_LIMITS.text);
          i.value = b.text;
        }
      }
    });
    this.el.addEventListener('input', (e) => {
      const i = e.target as HTMLTextAreaElement;
      if (i.dataset.t !== undefined) {
        const b = this.beats[+i.dataset.t];
        if (b) b.text = i.value.slice(0, STORY_LIMITS.text);
        this.syncGo();
      }
    });
    this.bindMic();
    this.render();
  }

  /* ---------------------------- navegação ---------------------------- */
  private back(): void {
    if (this.step === 1 || (this.o.spec && this.step === 3)) return this.finish(null);
    this.step = (this.step - 1) as 1 | 2;
    this.pop = pushBack(() => this.back());
    this.render();
  }
  private finish(r: WizardResult | null): void {
    this.stopPlay();
    stopDictation();
    this.rec?.m.cancel();
    this.pop();
    this.el.remove();
    this.done(r);
  }

  /* ---------------------------- ditado: falar e virar texto ---------------------------- */
  private async dictateBeat(i: number, btn: HTMLElement): Promise<void> {
    if (dictating()) return stopDictation();
    const ta = this.el.querySelector<HTMLTextAreaElement>(`textarea[data-t="${i}"]`);
    const b = this.beats[i];
    if (!ta || !b) return;
    this.stopPlay();
    const before = ta.value.trim();
    const lvl = btn.querySelector<HTMLElement>('.kid-lvl')!;
    btn.classList.add('on');
    btn.querySelector('small')!.textContent = t('cin.dict.listening', 'Ouvindo...');
    ta.placeholder = t('cin.dict.speak', 'Pode falar! Estou escrevendo...');
    const put = (s: string) => {
      ta.value = ((before ? before + ' ' : '') + s).slice(0, STORY_LIMITS.text);
      b.text = ta.value;
    };
    const r = await dictate({ onText: put, onLevel: (v) => lvl.style.setProperty('--l', v.toFixed(2)) });
    btn.classList.remove('on');
    btn.querySelector('small')!.textContent = t('cin.dict.abc', 'Abc');
    if ('text' in r) {
      put(r.text);
      b.text = cleanText(ta.value, STORY_LIMITS.text);
      ta.value = b.text;
    } else if (r.error === 'denied') notify(t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.'), { kind: 'warn', icon: 'warning' });
    else if (r.error === 'unsupported') {
      notify(t('cin.easy.noStt', 'Este aparelho não transforma voz em texto. Escreva com o teclado!'), { kind: 'warn' });
      ta.focus();
    } else if (r.error !== 'busy') notify(t('cin.magic.noHear', 'Não ouvi direito. Tente de novo ou escreva!'), { icon: 'sound' });
    this.syncGo();
  }

  private act(k: string, b: HTMLElement): void {
    const v = b.dataset.v ?? '';
    const i = +(b.dataset.i ?? -1);
    if (k === 'dict') return void this.dictateBeat(i, b);
    if (dictating()) stopDictation();
    switch (k) {
      case 'back':
        this.pop();
        return this.back();
      case 'char': {
        const j = this.refs.indexOf(v);
        if (j >= 0) {
          this.refs.splice(j, 1);
          this.cast.splice(j, 1);
        } else if (this.refs.length < MAX_KID_CAST) {
          this.refs.push(v);
          const c = this.candidates.find((x) => this.refOf(x) === v)!;
          this.cast.push(c);
        } else notify(t('cin.kid.max3', 'Até 3 personagens. Toque num escolhido para trocar.'), { kind: 'warn' });
        return this.render();
      }
      case 'place': {
        const it = BACKGROUNDS.find((x) => x.id === v);
        if (it?.pro && !isPro()) return paywall('item');
        this.bg = v;
        this.step = 3;
        this.ensureBeats();
        return this.render();
      }
      case 'next':
        if (this.step === 1 && this.refs.length) this.step = 2;
        else if (this.step === 2) {
          this.step = 3;
          this.ensureBeats();
        }
        return this.render();
      case 'who': {
        const bt = this.beats[i];
        if (!bt) return;
        bt.who = bt.who + 1 >= this.cast.length ? -1 : bt.who + 1;
        return this.render();
      }
      case 'mood': {
        const bt = this.beats[i];
        if (bt) bt.expr = bt.expr === v ? undefined : (v as StoryExpr);
        return this.render();
      }
      case 'add':
        if (this.beats.length >= MAX_KID_BEATS) return;
        this.beats.push({ who: this.beats.length ? (this.beats[this.beats.length - 1].who + 1) % Math.max(1, this.cast.length) : 0, text: '', expr: 'happy' });
        this.render();
        this.el.querySelector('.kid-beat:last-of-type')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      case 'del':
        this.beats.splice(i, 1);
        return this.render();
      case 'hear':
        return this.playBeat(i);
      case 'redo': {
        const bt = this.beats[i];
        if (bt) delete bt.audio;
        return this.render();
      }
      case 'go':
        return this.make();
    }
  }

  private refOf(c: CastMember): string {
    return this.candidates[0] === c ? 'you' : PRESETS[this.candidates.indexOf(c) - 1]?.id ?? 'pipoca';
  }

  private ensureBeats(): void {
    if (this.beats.length) return;
    this.beats = this.cast.map((_, i) => ({ who: i, text: '', expr: i === 0 ? 'happy' : 'surprised' }));
  }

  private make(): void {
    const beats = this.beats.filter((b) => b.text.trim() || b.audio);
    if (!beats.length) return void notify(t('cin.kid.needLine', 'Escreva ou grave pelo menos uma fala!'), { kind: 'warn' });
    beats.forEach((b) => (b.text = cleanText(b.text, STORY_LIMITS.text)));
    const scenes: StorySpec['scenes'] = [];
    for (let k = 0; k < beats.length; k += STORY_LIMITS.beats) scenes.push({ bg: this.bg as StorySpec['scenes'][number]['bg'], light: 'day', beats: beats.slice(k, k + STORY_LIMITS.beats) });
    const spec: StorySpec = {
      title: this.title || t('cin.kid.titleOf', 'A história de {n}', { n: this.cast[0]?.name ?? 'Bloop' }),
      cast: this.refs.map((r, i) => ({ ref: r as StorySpec['cast'][number]['ref'], name: this.cast[i].name })),
      scenes,
      song: this.o.spec?.song,
    };
    this.finish({ spec, cast: this.cast });
  }

  /* ---------------------------- tela ---------------------------- */
  private render(): void {
    const s = this.step;
    const dots = [1, 2, 3].map((n) => `<i class="${n === s ? 'on' : n < s ? 'ok' : ''}">${n < s ? '✓' : n}</i>`).join('');
    const head = (title: string) =>
      `<div class="kid-top"><button class="cin-btn cin-ico" data-k="back" aria-label="${t('cin.back', 'Voltar')}">←</button><div class="kid-dots">${dots}</div></div><h2 class="kid-h">${title}</h2>`;
    let html = '';
    if (s === 1) {
      html += head(t('cin.kid.s1', 'Quem está na história?'));
      html += `<p class="kid-sub">${t('cin.kid.s1sub', 'Toque em até 3 personagens.')}</p><div class="kid-grid chars">`;
      this.candidates.forEach((c) => {
        const r = this.refOf(c);
        const n = this.refs.indexOf(r);
        html += `<button class="kid-card ${n >= 0 ? 'on' : ''}" data-k="char" data-v="${r}"><span class="th" data-th="${r}"></span><b>${esc(c.name)}</b>${n >= 0 ? `<em>${n + 1}</em>` : ''}</button>`;
      });
      html += `</div><div class="kid-foot"><button class="cin-btn pri kid-big" data-k="next" ${this.refs.length ? '' : 'disabled'}>${t('cin.kid.next', 'Próximo')} ➜</button></div>`;
    } else if (s === 2) {
      html += head(t('cin.kid.s2', 'Onde acontece?'));
      html += `<div class="kid-grid places">${BACKGROUNDS.map((b) => `<button class="kid-card place ${b.id === this.bg ? 'on' : ''}" data-k="place" data-v="${b.id}"><span class="bgth" data-bg="${b.id}"></span><b>${b.glyph} ${b.name}${b.pro && !isPro() ? ' <span class="cin-pro">PRO</span>' : ''}</b></button>`).join('')}</div>`;
    } else {
      html += head(t('cin.kid.s3', 'O que acontece?'));
      html += `<p class="kid-sub">${t('cin.kid.s3sub', 'Segure o microfone e fale, ou escreva. Toque no personagem para trocar quem fala.')}</p><div class="kid-beats">`;
      this.beats.forEach((b, i) => {
        const who = b.who >= 0 ? this.cast[b.who] : null;
        const recOn = this.rec?.i === i;
        html += `<div class="kid-beat">
          <button class="kid-who" data-k="who" data-i="${i}" aria-label="${t('cin.kid.who', 'Quem fala')}"><span class="th" data-beat="${i}">${who ? '' : '📜'}</span><small>${who ? esc(who.name) : t('cin.kid.narrator', 'Narrador')}</small></button>
          <div class="kid-bubble">
            <div class="kid-say"><textarea rows="2" maxlength="${STORY_LIMITS.text}" data-t="${i}" placeholder="${who ? t('cin.kid.ph', 'O que {n} fala?', { n: esc(who.name) }) : t('cin.kid.phN', 'O que acontece?')}">${esc(b.text)}</textarea>
              <button class="kid-dict" data-k="dict" data-i="${i}" aria-label="${t('cin.dict.btn', 'Falar e virar texto')}"><b>🎤</b><small>${t('cin.dict.abc', 'Abc')}</small><i class="kid-lvl"></i></button></div>
            <div class="kid-moods">${MOODS.map(([e, g]) => `<button class="${b.expr === e ? 'on' : ''}" data-k="mood" data-i="${i}" data-v="${e}">${g}</button>`).join('')}</div>
            <div class="kid-mic-row">
              ${
                b.audio
                  ? `<button class="cin-btn ok" data-k="hear" data-i="${i}">▶ ${t('cin.kid.hear', 'Ouvir')}</button><button class="cin-btn" data-k="redo" data-i="${i}">↺ ${t('cin.kid.redo', 'Refazer')}</button>`
                  : `<button class="kid-mic ${recOn ? 'rec' : ''}" data-mic="${i}">🎤<span>${recOn ? t('cin.kid.release', 'Solte para parar') : t('cin.kid.hold', 'Segure para falar')}</span></button>`
              }
            </div>
          </div>
          <button class="kid-x" data-k="del" data-i="${i}" aria-label="${t('cin.del', 'Apagar')}">✕</button>
        </div>`;
      });
      html += `</div>${this.beats.length < MAX_KID_BEATS ? `<button class="cin-btn kid-add" data-k="add">＋ ${t('cin.kid.add', 'Mais uma fala')}</button>` : ''}
        <div class="kid-foot"><button class="cin-btn pri kid-big" data-k="go">🎬 ${t('cin.kid.go', 'Fazer o filme!')}</button></div>`;
    }
    this.el.innerHTML = html;
    this.el.querySelectorAll<HTMLElement>('[data-th]').forEach((sp) => {
      const c = this.candidates.find((x) => this.refOf(x) === sp.dataset.th);
      if (c) sp.appendChild(actorThumb(c, 76, 'wave', 'happy'));
    });
    this.el.querySelectorAll<HTMLElement>('[data-beat]').forEach((sp) => {
      const b = this.beats[+sp.dataset.beat!];
      const c = b && b.who >= 0 ? this.cast[b.who] : null;
      if (c) sp.appendChild(actorThumb(c, 56, 'stand', (b.expr as never) ?? 'happy', 0.35, 'face'));
    });
    this.el.querySelectorAll<HTMLElement>('[data-bg]').forEach((sp) => {
      const cv = bgThumb(sp.dataset.bg!, 'day');
      const c2 = document.createElement('canvas');
      c2.width = cv.width;
      c2.height = cv.height;
      c2.getContext('2d')!.drawImage(cv, 0, 0);
      sp.appendChild(c2);
    });
    this.syncGo();
  }

  private syncGo(): void {
    const go = this.el.querySelector<HTMLButtonElement>('[data-k="go"]');
    if (go) go.classList.toggle('dim', !this.beats.some((b) => b.text.trim() || b.audio));
  }

  /* ---------------------------- microfone: segurar para falar ---------------------------- */
  private bindMic(): void {
    this.el.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-mic]');
      if (!b || this.rec) return;
      e.preventDefault();
      try {
        b.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
      void this.micDown(+b.dataset.mic!, b);
    });
    const up = () => {
      if (this.rec) void this.micUp();
    };
    this.el.addEventListener('pointerup', up);
    this.el.addEventListener('pointercancel', up);
    // impede o menu de "segurar" do Android em cima do botão
    this.el.addEventListener('contextmenu', (e) => {
      if ((e.target as HTMLElement).closest('[data-mic]')) e.preventDefault();
    });
  }

  private async micDown(i: number, btn: HTMLElement): Promise<void> {
    this.stopPlay();
    const m = new MicRecorder();
    const r = { m, i, up: false, started: false };
    this.rec = r;
    btn.classList.add('rec');
    btn.querySelector('span')!.textContent = t('cin.kid.release', 'Solte para parar');
    const err = await m.start();
    if (this.rec !== r) return;
    if (err) {
      this.rec = null;
      this.render();
      notify(err === 'denied' ? t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.') : t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      return;
    }
    r.started = true;
    m.onAutoStop = () => void this.micUp();
    if (r.up) void this.micUp();
  }

  private async micUp(): Promise<void> {
    const r = this.rec;
    if (!r) return;
    if (!r.started) {
      r.up = true;
      return;
    }
    this.rec = null;
    const short = r.m.elapsed() < 0.45;
    const res = await r.m.stop();
    if (short || !res || res.buf.duration < 0.4) {
      notify(t('cin.kid.holdTip', 'Segure o botão enquanto fala, e solte no final!'), { icon: 'sound' });
      return this.render();
    }
    const id = uid('clip');
    await putClip({ id, pid: this.o.pid, blob: res.blob, dur: res.buf.duration, env: res.env });
    rememberClip(id, res.buf, res.env);
    const b = this.beats[r.i];
    if (b) b.audio = id;
    this.render();
    this.syncGo();
    this.playBeat(r.i);
  }

  private playBeat(i: number): void {
    this.stopPlay();
    const b = this.beats[i];
    const buf = b?.audio ? clipBuffer(b.audio) : undefined;
    const c = actx();
    if (!buf || !c) return;
    void c.resume?.();
    const s = c.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = VOICE_RATE[(b.who >= 0 ? this.cast[b.who]?.voice : 'normal') ?? 'normal'] ?? 1;
    s.connect(c.destination);
    s.start();
    this.playSrc = s;
  }
  private stopPlay(): void {
    try {
      this.playSrc?.stop();
    } catch {
      /* */
    }
    this.playSrc = null;
  }
}
