/* ============================================================
 *  BLOOP CINEMA — MODO FÁCIL (padrão para quem chega).
 *  Quadro de cenas: cada cena é um cartão grande com o fundo, os
 *  personagens em pé (arrastar para os lados = lugar; tocar = pose e
 *  rosto em grades de ícones grandes) e até 3 falas em balõezinhos.
 *  Botões grandes: "+ Cena", "Assistir", "Dublar", "Enviar".
 *  Sem linha do tempo: câmera e transições são automáticas (board.ts).
 *  O editor completo continua em "Modo avançado".
 * ============================================================ */
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { listen, stopListening, sttAvailable } from '../pet/talk/stt';
import { addChar, blankBoard, boardDetached, buildFromBoard, newBoardScene, STARTERS } from './board';
import { BACKGROUNDS, EXPRESSIONS, POSES } from './data';
import { Renderer } from './engine';
import { BOARD_MAX_CHARS, BOARD_MAX_LINES, BOARD_MAX_SCENES, clone, newShot, uid, type BoardChar, type BoardScene, type ExprId, type PoseId, type Project } from './format';
import { cleanText, isPro, maxSeconds, paywall } from './gates';
import { beatTrack, bgThumb, openMusicMakerFor } from './panels';
import { songList } from './audio';
import { actorThumbCopy as actorThumb } from './rig2d';
import { confirm, menu, pickCast, sheet } from './sheets';
import { saveProject } from './store';
import { projectDuration } from './format';

const TIP_KEY = 'bw-cin-easy-tips';

export interface EasyOpts {
  /** voltar para o início do Cinema */
  exit: () => void;
  /** abrir no editor avançado */
  advanced: (p: Project) => void;
  /** dicas do 1º uso */
  firstRun?: boolean;
}

/** Escolha do começo (1º uso e "Criar filme"): 3 histórias de 2 cenas ou do zero. */
export function pickStarter(): Promise<Project | null> {
  return new Promise((res) => {
    let out: Project | null = null;
    const s = sheet(
      `<h3>🎬 ${t('cin.easy.startQ', 'Como começa a sua história?')}</h3>
       <p class="cin-hint">${t('cin.easy.startSub', 'Escolha uma e mude tudo do seu jeito!')}</p>
       <div class="easy-starters">${STARTERS.map((st) => `<button class="easy-starter" data-a="st" data-v="${st.id}"><canvas width="320" height="180" data-st="${st.id}"></canvas><span>${st.emoji} ${esc(st.name)}</span></button>`).join('')}
       <button class="easy-starter blank" data-a="st" data-v="blank"><b>＋</b><span>✏️ ${t('cin.easy.blank', 'Do zero')}</span></button></div>`,
      (a, el, close) => {
        if (a !== 'st') return;
        const v = el.dataset.v!;
        out = v === 'blank' ? blankBoard() : (STARTERS.find((x) => x.id === v)?.build() ?? null);
        close();
      },
      () => res(out),
    );
    s.el.querySelectorAll<HTMLCanvasElement>('canvas[data-st]').forEach((cv) => {
      const p = STARTERS.find((x) => x.id === cv.dataset.st)!.build();
      try {
        const r = new Renderer(p);
        r.draw(cv.getContext('2d')!, cv.width, cv.height, Math.min(r.duration() - 0.1, 1.6), { budget: 0.3, bgScale: 0.8, noBubbles: true });
      } catch {
        /* */
      }
    });
  });
}

/** Projeto de 1 plano só com a cena (miniatura do cartão: todo mundo parado, câmera geral). */
function stillOf(p: Project, sc: BoardScene): Project {
  const q: Project = { ...p, board: undefined, story: undefined, music: null, scenes: [] };
  const sh = newShot(2);
  sh.actors = sc.chars.map((c) => ({ cast: c.cast, keys: [{ t: 0, x: c.x, y: 0, z: c.z, face: c.face || (c.x < 7.5 ? 1 : c.x > 8.5 ? -1 : 0), pose: c.pose, expr: c.expr, ease: 'inout' }] }));
  q.scenes = [{ id: sc.id, name: '', bg: sc.bg, light: sc.light, shots: [sh] }];
  return q;
}

export class EasyBoard {
  private el: HTMLElement;
  private saveT = 0;
  private renderers = new Map<string, Renderer>();
  private pop: () => void;
  private tipStep = 0;
  private dead = false;

  constructor(
    root: HTMLElement,
    public p: Project,
    private o: EasyOpts,
  ) {
    if (!p.board) throw new Error('sem quadro');
    this.el = root;
    this.el.classList.add('cin-easy');
    let seen = 0;
    try {
      seen = Number(localStorage.getItem(TIP_KEY) ?? 0);
    } catch {
      /* */
    }
    this.tipStep = o.firstRun || !seen ? 0 : 99;
    this.pop = pushBack(() => void this.leave(true));
    this.render();
  }

  private get b() {
    return this.p.board!;
  }

  /* ---------- salvar / montar ---------- */
  private changed(rebuild = true): void {
    if (rebuild) buildFromBoard(this.p);
    if (projectDuration(this.p) > maxSeconds() + 0.01) paywall('time');
    clearTimeout(this.saveT);
    this.saveT = window.setTimeout(() => void saveProject(this.p), 500);
  }
  async flush(): Promise<void> {
    clearTimeout(this.saveT);
    await saveProject(this.p, this.thumb());
  }
  private thumb(): string {
    try {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 144;
      const r = new Renderer(this.p);
      r.draw(cv.getContext('2d')!, 256, 144, Math.min(r.duration() * 0.3, 2.5), { budget: 0.3, bgScale: 0.8 });
      return cv.toDataURL('image/jpeg', 0.72);
    } catch {
      return '';
    }
  }

  /* ---------- tela ---------- */
  private render(): void {
    const n = this.b.scenes.length;
    this.el.innerHTML = `
      <div class="cin-top">
        <button class="cin-btn cin-ico" data-e="back" aria-label="${t('cin.back', 'Voltar')}">←</button>
        <input class="cin-title" maxlength="60" value="${esc(this.p.title)}" aria-label="${t('cin.ed.titleL', 'Título do filme')}">
        <button class="cin-btn sm ghost easy-adv" data-e="adv">🛠️ ${t('cin.easy.adv', 'Avançado')}</button>
      </div>
      <div class="easy-tip" ${this.tip() ? '' : 'hidden'}><span>${this.tip()}</span><button data-e="tipx" aria-label="${t('cin.easy.tipClose', 'Fechar dica')}">✕</button></div>
      <div class="easy-list">${this.b.scenes.map((sc, i) => this.card(sc, i)).join('')}
        ${n < BOARD_MAX_SCENES ? `<button class="easy-addscene" data-e="addscene">＋ ${t('cin.easy.addScene', 'Cena')}</button>` : ''}
      </div>
      <div class="easy-bar">
        <button class="easy-big add" data-e="addscene"><b>＋</b>${t('cin.easy.addScene', 'Cena')}</button>
        <button class="easy-big watch" data-e="watch"><b>▶</b>${t('cin.kid.watch', 'Assistir')}</button>
        <button class="easy-big dub" data-e="dub"><b>🎙️</b>${t('cin.easy.dub', 'Dublar')}</button>
        <button class="easy-big music" data-e="music"><b>🎵</b>${t('cin.easy.music', 'Música')}</button>
        <button class="easy-big send" data-e="send"><b>📺</b>${t('cin.easy.send', 'Enviar')}</button>
      </div>`;
    this.el.querySelectorAll<HTMLElement>('.easy-card').forEach((c) => this.fillCard(c));
    const title = this.el.querySelector<HTMLInputElement>('.cin-title')!;
    title.onchange = () => {
      const v = cleanText(title.value, 60).trim() || this.p.title;
      title.value = v;
      this.p.title = v;
      this.changed(false);
    };
    this.el.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-e]');
      if (!b) return;
      void this.act(b.dataset.e!, b);
    };
  }

  private tip(): string {
    const tips = [
      t('cin.easy.tip1', '👆 Arraste os personagens para os lados. Toque num personagem para escolher a pose e o rosto.'),
      t('cin.easy.tip2', '💬 Toque numa fala para escrever (ou falar 🎤). Deixe em branco para improvisar na dublagem!'),
      t('cin.easy.tip3', '▶ Aperte Assistir para ver seu filme. Depois 🎙️ Dublar para pôr a sua voz!'),
    ];
    return tips[this.tipStep] ?? '';
  }
  private nextTip(): void {
    if (this.tipStep >= 99) return;
    this.tipStep++;
    const tip = this.el.querySelector<HTMLElement>('.easy-tip');
    const txt = this.tip();
    if (!txt) {
      this.tipStep = 99;
      try {
        localStorage.setItem(TIP_KEY, '1');
      } catch {
        /* */
      }
    }
    if (tip) {
      tip.hidden = !txt;
      tip.querySelector('span')!.textContent = txt;
    }
  }

  private card(sc: BoardScene, i: number): string {
    const bg = BACKGROUNDS.find((x) => x.id === sc.bg);
    const lines = sc.lines
      .map((l) => {
        const c = this.p.cast.find((x) => x.id === l.cast);
        return `<button class="easy-chip ${l.audio ? 'dub' : ''}" data-e="line" data-sc="${sc.id}" data-id="${l.id}"><span class="easy-face" data-face="${esc(l.cast ?? '')}">${c ? '' : '📢'}</span><span class="easy-say">${l.text ? esc(l.text) : `<i>✨ ${t('cin.easy.improv', 'improviso')}</i>`}</span>${l.audio ? '<em>🎙️</em>' : ''}</button>`;
      })
      .join('');
    return `<section class="easy-card" data-sc="${sc.id}">
      <div class="easy-head"><b class="easy-num">${i + 1}</b><span class="easy-name">${t('cin.ed.scene', 'Cena {n}', { n: i + 1 })} · ${esc(bg?.name ?? '')}</span>
        <button class="easy-hbtn" data-e="bg" data-sc="${sc.id}">🖼️<small>${t('cin.easy.place', 'Lugar')}</small></button>
        <button class="easy-hbtn" data-e="addc" data-sc="${sc.id}" ${sc.chars.length >= BOARD_MAX_CHARS ? 'disabled' : ''}>🧑‍🤝‍🧑<small>${t('cin.easy.who', 'Quem')}</small></button>
        <button class="easy-hbtn" data-e="more" data-sc="${sc.id}" aria-label="${t('cin.home.more', 'Opções')}">⋮</button></div>
      <div class="easy-stage"><canvas data-sc="${sc.id}"></canvas>${sc.chars.length ? `<span class="easy-drag">↔ ${t('cin.easy.drag', 'arraste')}</span>` : `<span class="easy-empty">${t('cin.easy.noChars', 'Toque em 🧑‍🤝‍🧑 Quem para chamar personagens')}</span>`}</div>
      <div class="easy-lines">${lines}${sc.lines.length < BOARD_MAX_LINES ? `<button class="easy-chip add" data-e="addline" data-sc="${sc.id}">＋ ${t('cin.lines.add', 'Fala')}</button>` : ''}</div>
    </section>`;
  }

  private sceneById(id: string | undefined): BoardScene | undefined {
    return this.b.scenes.find((s) => s.id === id);
  }

  /** Desenha o cartão e liga o arrastar dos personagens. */
  private fillCard(card: HTMLElement): void {
    const sc = this.sceneById(card.dataset.sc);
    if (!sc) return;
    card.querySelectorAll<HTMLElement>('[data-face]').forEach((s) => {
      const c = this.p.cast.find((x) => x.id === s.dataset.face);
      if (c) s.appendChild(actorThumb(c, 34, 'stand', 'happy', 0.3, 'face'));
    });
    const cv = card.querySelector<HTMLCanvasElement>('canvas')!;
    this.drawCard(sc, cv);
    let drag: { cast: string; pid: number; x0: number; sx: number; moved: boolean; ppu: number } | null = null;
    cv.addEventListener('pointerdown', (e) => {
      const r = this.renderers.get(sc.id);
      if (!r) return;
      const rc = cv.getBoundingClientRect();
      const px = ((e.clientX - rc.left) / rc.width) * cv.width;
      const py = ((e.clientY - rc.top) / rc.height) * cv.height;
      const hit = r.hit(px, py);
      if (!hit) return;
      const ch = sc.chars.find((c) => c.cast === hit);
      if (!ch) return;
      drag = { cast: hit, pid: e.pointerId, x0: e.clientX, sx: ch.x, moved: false, ppu: rc.width / 16 };
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* */
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved && Math.abs(dx) < 8) return;
      drag.moved = true;
      const ch = sc.chars.find((c) => c.cast === drag!.cast);
      if (!ch) return;
      ch.x = Math.round(Math.max(0.6, Math.min(15.4, drag.sx + dx / drag.ppu)) * 20) / 20;
      this.drawCard(sc, cv);
    });
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pid) return;
      const d = drag;
      drag = null;
      if (d.moved) {
        this.changed();
        if (this.tipStep === 0) this.nextTip();
      } else void this.charSheet(sc, d.cast);
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', (e) => {
      if (drag && e.pointerId === drag.pid) {
        if (drag.moved) this.changed();
        drag = null;
      }
    });
  }

  private drawCard(sc: BoardScene, cv: HTMLCanvasElement): void {
    const w = cv.clientWidth || 340;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.min(960, Math.round(w * dpr));
    const H = Math.round((W * 9) / 16);
    if (cv.width !== W || cv.height !== H) {
      cv.width = W;
      cv.height = H;
    }
    let r = this.renderers.get(sc.id);
    const q = stillOf(this.p, sc);
    if (!r) {
      r = new Renderer(q);
      this.renderers.set(sc.id, r);
    } else r.setProject(q);
    try {
      r.draw(cv.getContext('2d')!, W, H, 0.9, { budget: 0.3, bgScale: 1, noBubbles: true });
    } catch (e) {
      console.warn('[easy] card', e);
    }
  }

  private redrawCard(id: string): void {
    const sc = this.sceneById(id);
    const old = this.el.querySelector<HTMLElement>(`.easy-card[data-sc="${id}"]`);
    if (!sc || !old) return this.render();
    const i = this.b.scenes.indexOf(sc);
    const tmp = document.createElement('div');
    tmp.innerHTML = this.card(sc, i);
    const neu = tmp.firstElementChild as HTMLElement;
    old.replaceWith(neu);
    this.fillCard(neu);
  }

  /* ---------- música do filme ---------- */
  private async musicMenu(): Promise<void> {
    const cur = this.p.music;
    const a = await menu(t('cin.easy.musicQ', 'Música do filme'), [
      ['make', '🎹 ' + (cur?.beat ? t('cin.mm.edit', 'Editar minha música') : t('cin.mm.title', 'Criar música')), 'pri'],
      ['song', '🎵 ' + t('cin.easy.musicPick', 'Escolher uma pronta')],
      ['none', '🔇 ' + t('cin.music.none', 'Sem música')],
    ]);
    if (a === 'make') {
      const pat = await openMusicMakerFor(cur?.beat);
      if (pat && !this.dead) {
        this.p.music = beatTrack(pat, cur?.vol ?? 0.6);
        this.changed(false);
        notify(t('cin.mm.saved', 'Música salva no filme! Aperte Assistir para ouvir.'), { kind: 'good', icon: 'check' });
      }
    } else if (a === 'song') {
      const list = await songList();
      const id = await menu(t('cin.easy.musicPick', 'Escolher uma pronta'), list.map((s) => [s.id, `${cur?.song === s.id && !cur.beat ? '✓ ' : ''}🎵 ${esc(s.title)}`] as [string, string]));
      if (id) {
        this.p.music = { song: id, offset: 8, vol: cur?.vol ?? 0.5 };
        this.changed(false);
      }
    } else if (a === 'none') {
      this.p.music = null;
      this.changed(false);
    }
  }

  /* ---------- ações ---------- */
  private async act(a: string, el: HTMLElement): Promise<void> {
    const sc = this.sceneById(el.dataset.sc);
    if (a === 'back') return void this.leave();
    if (a === 'tipx') {
      this.tipStep = 98;
      return this.nextTip();
    }
    if (a === 'adv') return void this.goAdvanced();
    if (a === 'addscene') return this.addScene();
    if (a === 'watch') {
      if (this.tipStep <= 2) this.tipStep = 2;
      this.nextTip();
      await this.flush();
      const { watchFilm } = await import('./dub');
      return watchFilm(this.el, this.p);
    }
    if (a === 'dub') return this.dub();
    if (a === 'music') return this.musicMenu();
    if (a === 'send') return this.send();
    if (!sc) return;
    if (a === 'bg') return this.bgSheet(sc);
    if (a === 'addc') return this.addCharSheet(sc);
    if (a === 'more') return this.sceneMenu(sc);
    if (a === 'line' || a === 'addline') return this.lineSheet(sc, a === 'line' ? el.dataset.id! : null);
  }

  private addScene(): void {
    if (this.b.scenes.length >= BOARD_MAX_SCENES) return;
    const last = this.b.scenes[this.b.scenes.length - 1];
    const sc = newBoardScene(this.p, last);
    this.b.scenes.push(sc);
    this.changed();
    this.render();
    this.el.querySelector(`.easy-card[data-sc="${sc.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  private sceneMenu(sc: BoardScene): void {
    const i = this.b.scenes.indexOf(sc);
    void menu(t('cin.ed.scene', 'Cena {n}', { n: i + 1 }), [
      ['dup', '⧉ ' + t('cin.easy.dupScene', 'Duplicar cena')],
      ...(i > 0 ? ([['up', '⬆️ ' + t('cin.easy.up', 'Mover para cima')]] as [string, string][]) : []),
      ...(i < this.b.scenes.length - 1 ? ([['down', '⬇️ ' + t('cin.easy.down', 'Mover para baixo')]] as [string, string][]) : []),
      ...(this.b.scenes.length > 1 ? ([['del', '🗑 ' + t('cin.easy.delScene', 'Apagar cena'), 'warn']] as [string, string, string][]) : []),
    ]).then(async (a) => {
      if (a === 'dup' && this.b.scenes.length < BOARD_MAX_SCENES) {
        const c = clone(sc);
        c.id = uid('sc');
        c.lines.forEach((l) => {
          l.id = uid('ln');
          delete l.audio;
          delete l.cut;
        });
        this.b.scenes.splice(i + 1, 0, c);
      } else if (a === 'up' || a === 'down') {
        const j = a === 'up' ? i - 1 : i + 1;
        this.b.scenes.splice(i, 1);
        this.b.scenes.splice(j, 0, sc);
      } else if (a === 'del') {
        if (!(await confirm(t('cin.easy.delQ', 'Apagar a cena {n}?', { n: i + 1 }), t('cin.del', 'Apagar')))) return;
        this.b.scenes.splice(i, 1);
      } else return;
      this.changed();
      this.render();
    });
  }

  private bgSheet(sc: BoardScene): void {
    const s = sheet(
      `<h3>🖼️ ${t('cin.easy.whereQ', 'Onde acontece?')}</h3>
       <div class="cin-grid wide">${BACKGROUNDS.map((b) => `<button class="cin-cell bg ${sc.bg === b.id ? 'on' : ''}" data-a="bg" data-v="${b.id}"><canvas width="160" height="90" data-bg="${b.id}"></canvas>${b.pro && !isPro() ? '<span class="cin-pro">PRO</span>' : ''}<span>${b.glyph} ${esc(b.name)}</span></button>`).join('')}</div>
       <h5>${t('cin.scene.light', 'Luz')}</h5>
       <div class="cin-chips">${(['day', 'dusk', 'night'] as const).map((l) => `<button class="cin-chip ${sc.light === l ? 'on' : ''}" data-a="light" data-v="${l}">${l === 'day' ? '☀️ ' + t('cin.scene.day', 'Dia') : l === 'dusk' ? '🌇 ' + t('cin.scene.dusk', 'Entardecer') : '🌙 ' + t('cin.scene.night', 'Noite')}</button>`).join('')}</div>
       <button class="cin-btn pri" data-a="ok" style="width:100%;margin-top:12px">✓ ${t('cin.easy.done', 'Pronto')}</button>`,
      (a, el, close) => {
        if (a === 'ok') return close();
        if (a === 'bg') {
          const b = BACKGROUNDS.find((x) => x.id === el.dataset.v);
          if (!b) return;
          if (b.pro && !isPro()) return paywall('item');
          sc.bg = b.id;
        } else if (a === 'light') sc.light = el.dataset.v as BoardScene['light'];
        s.el.querySelectorAll<HTMLElement>(`[data-a="${a}"]`).forEach((x) => x.classList.toggle('on', x === el));
        s.el.querySelectorAll<HTMLCanvasElement>('canvas[data-bg]').forEach((cv) => cv.getContext('2d')!.drawImage(bgThumb(cv.dataset.bg!, sc.light), 0, 0));
        this.changed();
        this.redrawCard(sc.id);
      },
    );
    s.el.querySelectorAll<HTMLCanvasElement>('canvas[data-bg]').forEach((cv) => cv.getContext('2d')!.drawImage(bgThumb(cv.dataset.bg!, sc.light), 0, 0));
  }

  private addCharSheet(sc: BoardScene): void {
    const others = this.p.cast.filter((c) => !sc.chars.some((x) => x.cast === c.id));
    const s = sheet(
      `<h3>🧑‍🤝‍🧑 ${t('cin.easy.whoQ', 'Quem está nesta cena?')}</h3>
       <div class="easy-who">${sc.chars
         .map((c) => `<button class="easy-pick on" data-a="rm" data-v="${c.cast}"><span data-face="${c.cast}"></span><small>${esc(this.p.cast.find((x) => x.id === c.cast)?.name ?? '')}</small><em>✕</em></button>`)
         .join('')}${others.map((c) => `<button class="easy-pick" data-a="add" data-v="${c.id}"><span data-face="${c.id}"></span><small>${esc(c.name)}</small><em>＋</em></button>`).join('')}
         <button class="easy-pick new" data-a="new"><span>✨</span><small>${t('cin.easy.newChar', 'Outro')}</small><em>＋</em></button></div>
       <button class="cin-btn pri" data-a="ok" style="width:100%;margin-top:12px">✓ ${t('cin.easy.done', 'Pronto')}</button>`,
      async (a, el, close) => {
        if (a === 'ok') return close();
        if (a === 'rm') {
          sc.chars = sc.chars.filter((c) => c.cast !== el.dataset.v);
          sc.lines.forEach((l) => l.cast === el.dataset.v && delete l.cast);
        } else if (a === 'add') {
          if (!addChar(sc, el.dataset.v!)) return notify(t('cin.easy.full', 'Cabem até {n} personagens por cena.', { n: BOARD_MAX_CHARS }), { kind: 'warn' });
        } else if (a === 'new') {
          close();
          const c = await pickCast(this.p.cast.length);
          if (!c) return;
          this.p.cast.push(c);
          addChar(sc, c.id);
          this.changed();
          this.redrawCard(sc.id);
          return;
        }
        close();
        this.changed();
        this.redrawCard(sc.id);
        this.addCharSheet(sc);
      },
    );
    s.el.querySelectorAll<HTMLElement>('[data-face]').forEach((x) => {
      const c = this.p.cast.find((y) => y.id === x.dataset.face);
      if (c) x.appendChild(actorThumb(c, 56, 'stand', 'happy'));
    });
  }

  /** Personagem: olhar para, perto/longe, rosto e pose (grades de ícones grandes). */
  private charSheet(sc: BoardScene, castId: string): void {
    const ch = sc.chars.find((c) => c.cast === castId);
    const c = this.p.cast.find((x) => x.id === castId);
    if (!ch || !c) return;
    const pro = isPro();
    const s = sheet(
      `<h3 class="easy-ch"><span data-me></span>${esc(c.name)}</h3>
       <div class="cin-chips easy-look">
         <button class="cin-chip ${ch.face === -1 ? 'on' : ''}" data-a="face" data-v="-1">⬅️ ${t('cin.easy.lookL', 'Esquerda')}</button>
         <button class="cin-chip ${ch.face === 0 ? 'on' : ''}" data-a="face" data-v="0">🙂 ${t('cin.easy.lookAuto', 'Automático')}</button>
         <button class="cin-chip ${ch.face === 1 ? 'on' : ''}" data-a="face" data-v="1">➡️ ${t('cin.easy.lookR', 'Direita')}</button>
         <button class="cin-chip ${ch.z > 0.5 ? 'on' : ''}" data-a="near">🔍 ${t('cin.easy.near', 'Mais perto')}</button>
       </div>
       <h5>😀 ${t('cin.easy.faceQ', 'Rosto')}</h5>
       <div class="easy-grid">${EXPRESSIONS.map((e) => `<button class="easy-ico ${ch.expr === e.id ? 'on' : ''}" data-a="expr" data-v="${e.id}"><span data-ex="${e.id}"></span><small>${esc(e.name)}</small>${e.pro && !pro ? '<i class="cin-pro">PRO</i>' : ''}</button>`).join('')}</div>
       <h5>🤸 ${t('cin.easy.poseQ', 'Pose')}</h5>
       <div class="easy-grid">${POSES.map((e) => `<button class="easy-ico ${ch.pose === e.id ? 'on' : ''}" data-a="pose" data-v="${e.id}"><span data-po="${e.id}"></span><small>${esc(e.name)}</small>${e.pro && !pro ? '<i class="cin-pro">PRO</i>' : ''}</button>`).join('')}</div>
       <div class="cin-row" style="margin-top:12px"><button class="cin-btn warn" data-a="rm">🚪 ${t('cin.easy.leave', 'Sair da cena')}</button><button class="cin-btn pri cin-grow" data-a="ok">✓ ${t('cin.easy.done', 'Pronto')}</button></div>`,
      (a, el, close) => {
        if (a === 'ok') return close();
        if (a === 'rm') {
          sc.chars = sc.chars.filter((x) => x !== ch);
          sc.lines.forEach((l) => l.cast === castId && delete l.cast);
          close();
        } else if (a === 'face') ch.face = Number(el.dataset.v) as -1 | 0 | 1;
        else if (a === 'near') ch.z = ch.z > 0.5 ? 0 : 1.6;
        else if (a === 'expr' || a === 'pose') {
          const it = (a === 'expr' ? EXPRESSIONS : POSES).find((x) => x.id === el.dataset.v);
          if (!it) return;
          if (it.pro && !isPro()) return paywall('item');
          if (a === 'expr') ch.expr = it.id as ExprId;
          else ch.pose = it.id as PoseId;
          if (this.tipStep === 0) this.nextTip();
        }
        if (a === 'near') el.classList.toggle('on', ch.z > 0.5);
        else s.el.querySelectorAll<HTMLElement>(`[data-a="${a}"]`).forEach((x) => x.classList.toggle('on', x === el));
        this.changed();
        this.redrawCard(sc.id);
      },
    );
    s.el.querySelector('[data-me]')?.appendChild(actorThumb(c, 40, 'stand', ch.expr, 0.3, 'face'));
    s.el.querySelectorAll<HTMLElement>('[data-ex]').forEach((x) => x.appendChild(actorThumb(c, 52, 'stand', x.dataset.ex as ExprId, 0.3, 'face')));
    s.el.querySelectorAll<HTMLElement>('[data-po]').forEach((x) => x.appendChild(actorThumb(c, 60, x.dataset.po as PoseId, 'happy', 0.45)));
  }

  /** Fala: quem fala (rostos grandes ou narrador), texto (ou falar 🎤), apagar. */
  private lineSheet(sc: BoardScene, id: string | null): void {
    if (!id && sc.lines.length >= BOARD_MAX_LINES) return;
    const prev = id ? sc.lines.find((l) => l.id === id) : undefined;
    const lastWho = sc.lines[sc.lines.length - 1]?.cast;
    const auto = sc.chars.find((c) => c.cast !== lastWho)?.cast ?? sc.chars[0]?.cast;
    const l = prev ?? { id: uid('ln'), cast: auto, text: '' };
    let who = l.cast;
    const chars: BoardChar[] = sc.chars;
    const s = sheet(
      `<h3>💬 ${prev ? t('cin.easy.editLine', 'Fala') : t('cin.easy.newLine', 'Nova fala')}</h3>
       <h5>${t('cin.easy.whoTalks', 'Quem fala?')}</h5>
       <div class="easy-who">${chars.map((c) => `<button class="easy-pick ${who === c.cast ? 'on' : ''}" data-a="who" data-v="${c.cast}"><span data-face="${c.cast}"></span><small>${esc(this.p.cast.find((x) => x.id === c.cast)?.name ?? '')}</small></button>`).join('')}
         <button class="easy-pick ${!who ? 'on' : ''}" data-a="who" data-v=""><span>📢</span><small>${t('cin.easy.narrator', 'Narrador')}</small></button></div>
       <h5>${t('cin.easy.sayQ', 'O que diz?')}</h5>
       <div class="easy-say-box"><textarea maxlength="90" rows="2" placeholder="${t('cin.easy.sayPh', 'Escreva aqui... ou deixe em branco para improvisar na dublagem')}">${esc(l.text)}</textarea>
         <button class="easy-mic" data-a="mic" aria-label="${t('cin.easy.dictate', 'Falar o texto')}">🎤</button></div>
       ${l.audio ? `<p class="cin-hint">🎙️ ${t('cin.easy.hasVoice', 'Esta fala já tem a sua voz. Para trocar, use Dublar.')}</p>` : ''}
       <div class="cin-row" style="margin-top:12px">${prev ? `<button class="cin-btn warn" data-a="del">🗑 ${t('cin.del', 'Apagar')}</button>` : ''}${prev ? `<button class="cin-btn" data-a="dubit">🎙️ ${t('cin.easy.dubThis', 'Dublar')}</button>` : ''}<button class="cin-btn pri cin-grow" data-a="ok">✓ ${t('cin.easy.done', 'Pronto')}</button></div>`,
      async (a, el, close) => {
        if (a === 'who') {
          who = el.dataset.v || undefined;
          s.el.querySelectorAll<HTMLElement>('[data-a="who"]').forEach((x) => x.classList.toggle('on', x === el));
        } else if (a === 'mic') {
          const ta = s.el.querySelector<HTMLTextAreaElement>('textarea')!;
          if (el.classList.contains('rec')) return stopListening();
          if (!(await sttAvailable())) return notify(t('cin.easy.noStt', 'Este aparelho não transforma voz em texto. Escreva com o teclado!'), { kind: 'warn' });
          el.classList.add('rec');
          const r = await listen({ onPartial: (x) => (ta.value = x.slice(0, 90)) });
          el.classList.remove('rec');
          if ('text' in r) ta.value = r.text.slice(0, 90);
        } else if (a === 'del') {
          sc.lines = sc.lines.filter((x) => x.id !== l.id);
          close();
          this.changed();
          this.redrawCard(sc.id);
        } else if (a === 'ok' || a === 'dubit') {
          const text = cleanText(s.el.querySelector<HTMLTextAreaElement>('textarea')!.value, 90).trim();
          const changedText = text !== l.text;
          l.text = text;
          l.cast = who;
          if (!prev) sc.lines.push(l);
          close();
          this.changed();
          this.redrawCard(sc.id);
          if (this.tipStep === 1) this.nextTip();
          if (a === 'dubit') await this.dub(l.id);
          else if (changedText && l.audio) notify(t('cin.easy.redub', 'Mudou o texto? Grave a voz de novo em 🎙️ Dublar.'), { kind: 'info' });
        }
      },
    );
    s.el.querySelectorAll<HTMLElement>('[data-face]').forEach((x) => {
      const c = this.p.cast.find((y) => y.id === x.dataset.face);
      if (c) x.appendChild(actorThumb(c, 48, 'stand', 'happy', 0.3, 'face'));
    });
    if (!prev) setTimeout(() => s.el.querySelector<HTMLTextAreaElement>('textarea')?.focus(), 250);
  }

  /* ---------- dublar / enviar / avançado ---------- */
  async dub(line?: string): Promise<void> {
    await this.flush();
    const { openDub } = await import('./dub');
    await openDub(this.el, { project: () => this.p, edit: (fn) => (fn(this.p), this.changed(false)) }, { line });
    if (this.dead) return;
    await this.flush();
    this.render();
  }

  private async send(): Promise<void> {
    await this.flush();
    const lines = this.b.scenes.reduce((n, s) => n + s.lines.length, 0);
    if (!lines) notify(t('cin.easy.sendTip', 'Dica: filmes com falas e vozes fazem mais sucesso na TV!'), { kind: 'info' });
    const m = await import('./tv');
    m.sendToTvSheet(this.p, new Renderer(this.p), {
      onFix: (lineId) => {
        // balão: abre a fala; voz: abre a dublagem já nela
        const sc = this.b.scenes.find((s) => s.lines.some((l) => l.id === lineId));
        if (!sc) return;
        this.el.querySelector(`.easy-card[data-sc="${sc.id}"]`)?.scrollIntoView({ block: 'center' });
        void this.dub(lineId);
      },
    });
  }

  private async goAdvanced(): Promise<void> {
    const ok = await confirm(t('cin.easy.advQ', 'O modo avançado tem linha do tempo, câmera e efeitos. Abrir?'), '🛠️ ' + t('cin.easy.advGo', 'Abrir modo avançado'));
    if (!ok) return;
    await this.flush();
    this.close();
    this.o.advanced(this.p);
  }

  private async leave(fromBack = false): Promise<void> {
    await this.flush();
    this.close(fromBack);
    this.o.exit();
  }

  close(fromBack = false): void {
    if (this.dead) return;
    this.dead = true;
    if (!fromBack) this.pop();
    this.el.classList.remove('cin-easy');
    this.el.onclick = null;
    this.renderers.forEach((r) => r.dispose());
    this.renderers.clear();
  }
}

/** Voltar do avançado para o fácil: remonta do quadro (avisa se o avançado mudou coisas). */
export async function backToEasy(p: Project): Promise<boolean> {
  if (!p.board) return false;
  if (boardDetached(p) && !(await confirm(t('cin.easy.backQ', 'Voltar ao modo fácil desfaz o que você mudou no modo avançado. Continuar?'), t('cin.easy.backGo', 'Voltar ao fácil')))) return false;
  buildFromBoard(p);
  return true;
}
