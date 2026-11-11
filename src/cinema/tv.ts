/* ============================================================
 *  TV BLOOP — canal ao vivo com os filmes aprovados do Bloop Cinema.
 *
 *  O servidor (TvChannel) diz o que está passando e QUANDO começou no
 *  relógio dele; cada aparelho baixa o projeto (JSON + vozes) e desenha
 *  o filme localmente com o player do Cinema, pulando para o mesmo
 *  segundo — todo mundo vê a mesma cena ao mesmo tempo. Sem vídeo.
 *
 *  Filmes oficiais do Estúdio Bloop (tv-official.ts) vêm do catálogo
 *  embutido (nada é baixado), passam intercalados com os das crianças e
 *  têm "Remixar" (abre uma cópia no Cinema). Sem internet a TV segue
 *  com uma grade local só dos oficiais. A música do hub pausa aqui.
 *
 *  Também: "Gostei" (1 por conta), denunciar, "A seguir" e o envio
 *  ("Enviar para a TV", com as regras) chamado pelo exportar do Cinema.
 * ============================================================ */
import './cinema.css';
import { pushBack } from '../core/back';
import { t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { TV, type TvAiReject, type TvNow, type TvSlot } from '../../shared/ugc';
import { actx, envelopeOf, Mixer, Playback, rememberClip } from './audio';
import { Renderer } from './engine';
import { parseProject, projectDuration, type Project } from './format';
import { menu, sheet } from './sheets';
import { music } from '../audio';
import { GENRE_UI, isOfficialId, loadOfficial, localSlot, OFFICIAL_AUTHOR, officialProject, requestRemix, thumbUrl, type OfficialEntry } from './tv-official';
import { fetchFilm, fetchNow, myFilms, report, submitFilm, vote, voted, type SubmitError } from './tv-net';

const fmtClock = (s: number) => {
  s = Math.max(0, Math.round(s));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

interface Loaded {
  id: string;
  p: Project;
  r: Renderer;
}

function b64ToBuf(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

class TvPlayer {
  readonly el: HTMLElement;
  private cv: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private alive = true;
  private offset = 0;
  private grid: TvNow | null = null;
  private films = new Map<string, Promise<Loaded | null>>();
  private ready: Loaded | null = null;
  private mixer: Mixer | null = null;
  private pb: Playback | null = null;
  /** slot (id@start) cujo áudio está tocando */
  private audioSlot = '';
  private lastDriftCheck = 0;
  private polling: ReturnType<typeof setTimeout> | null = null;
  private infoKey = '';
  private myVote = new Map<string, boolean>();
  private offline = false;
  private popBack: () => void;

  constructor(private onClose?: () => void) {
    this.el = document.createElement('div');
    this.el.className = 'tv-root';
    this.el.innerHTML = `
      <div class="tv-top">
        <button class="cin-btn cin-ico" data-a="close" aria-label="${t('cin.back', 'Voltar')}">←</button>
        <div class="tv-brand">📺 ${t('tv.name', 'TV Bloop')} <span class="tv-live">● ${t('tv.live', 'AO VIVO')}</span></div>
        <button class="cin-btn sm" data-a="all">🎞️ ${t('tv.all', 'Todos')}</button>
        <button class="cin-btn sm" data-a="mine">${t('tv.myFilms', 'Meus envios')}</button>
      </div>
      <div class="tv-stage"><canvas></canvas><div class="tv-over" hidden></div><button class="tv-sound" data-a="sound" hidden>🔊 ${t('tv.sound', 'Tocar com som')}</button></div>
      <div class="tv-info">
        <div class="tv-now"><small>${t('tv.nowPlaying', 'Agora passando')}</small><b data-r="title">—</b><span data-r="by"></span></div>
        <div class="tv-acts">
          <button class="cin-btn ok" data-a="remix" hidden>🎨 ${t('tv.remix', 'Remixar')}</button>
          <button class="cin-btn pri" data-a="vote">👍 <span data-r="vote">${t('tv.like', 'Gostei')}</span></button>
          <button class="cin-btn ghost sm" data-a="report">🚩 ${t('tv.report', 'Denunciar')}</button>
        </div>
      </div>
      <div class="tv-next"><h4>${t('tv.upNext', 'A seguir')}</h4><div data-r="next"></div></div>
      <p class="tv-foot">${t('tv.foot2', 'Filmes do Estúdio Bloop e dos jogadores (revisados pela equipe). Todo mundo assiste junto, ao mesmo tempo.')}</p>`;
    document.body.appendChild(this.el);
    this.cv = this.el.querySelector('canvas')!;
    this.ctx = this.cv.getContext('2d', { alpha: false })!;
    this.popBack = pushBack(() => this.close(true));
    this.el.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'close') this.close();
      else if (a === 'sound') void this.enableSound();
      else if (a === 'vote') void this.doVote();
      else if (a === 'report') void this.doReport();
      else if (a === 'mine') void showMyFilms();
      else if (a === 'remix') void this.remix(this.grid?.cur?.id);
      else if (a === 'all') void this.catalog();
    });
    window.addEventListener('resize', this.resize);
    this.resize();
    void this.poll();
    this.loop();
    (window as unknown as { __tv?: TvPlayer }).__tv = this;
    music.pause();
  }

  /** Remixar: fecha a TV e abre uma cópia do filme oficial no Cinema. */
  private async remix(id?: string): Promise<void> {
    if (!id || !isOfficialId(id)) return;
    this.close();
    await requestRemix(id);
  }

  /** Catálogo do Estúdio Bloop: todos os filmes oficiais (miniatura, gênero, duração) → Remixar. */
  private async catalog(): Promise<void> {
    let films: OfficialEntry[];
    try {
      films = await loadOfficial();
    } catch {
      return;
    }
    const genres = [...new Set(films.map((f) => f.genre))];
    const card = (f: OfficialEntry) =>
      `<button class="tv-cat-it" data-a="pick" data-v="${f.id}" data-g="${f.genre}"><img loading="lazy" src="${thumbUrl(f.id)}" alt=""><b>${esc(f.title)}</b><small>${GENRE_UI[f.genre][0]} ${f.mode === '3d' ? '3D · ' : ''}${fmtClock(f.dur)}</small></button>`;
    const s = sheet(
      `<h3>🎞️ ${t('tv.studio', 'Estúdio Bloop')}</h3>
       <p class="cin-hint">${t('tv.studioSub', 'Filmes oficiais que passam na TV. Toque em um para remixar no seu Cinema!')}</p>
       <div class="tv-cat-gs"><button class="cin-chip on" data-a="g" data-v="">${t('tv.g.all', 'Todos')}</button>${genres.map((g) => `<button class="cin-chip" data-a="g" data-v="${g}">${GENRE_UI[g][0]} ${GENRE_UI[g][1]()}</button>`).join('')}</div>
       <div class="tv-cat">${films.map(card).join('')}</div>
       <button class="cin-btn ghost" data-a="x" style="width:100%;margin-top:10px">${t('cin.close', 'Fechar')}</button>`,
      async (a, el, close) => {
        if (a === 'x') return close();
        if (a === 'g') {
          s.el.querySelectorAll<HTMLElement>('[data-a="g"]').forEach((b) => b.classList.toggle('on', b === el));
          s.el.querySelectorAll<HTMLElement>('.tv-cat-it').forEach((b) => (b.hidden = !!el.dataset.v && b.dataset.g !== el.dataset.v));
          return;
        }
        if (a === 'pick') {
          const f = films.find((x) => x.id === el.dataset.v);
          if (!f) return;
          const r = await menu(f.title, [['remix', '🎨 ' + t('tv.remix', 'Remixar'), 'pri']]);
          if (r === 'remix') {
            close();
            void this.remix(f.id);
          }
        }
      },
    );
    s.el.classList.add('tv-cat-sheet');
  }

  /** Grade local (sem internet): só os filmes oficiais, mesma sequência em todos os aparelhos. */
  private async offlineGrid(): Promise<TvNow | null> {
    try {
      const films = await loadOfficial();
      const sl = localSlot(films, Date.now());
      if (!sl) return null;
      const slot = (x: { id: string; title: string; start: number; dur: number }): TvSlot => ({ ...x, author: OFFICIAL_AUTHOR, votes: 0, official: true });
      return { now: Date.now(), cur: slot(sl), next: sl.next.map(slot), films: films.length };
    } catch {
      return null;
    }
  }

  private resize = (): void => {
    const st = this.el.querySelector<HTMLElement>('.tv-stage')!;
    const w = st.clientWidth || 360;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.min(1280, Math.round(w * dpr));
    const H = Math.round((W * 9) / 16);
    if (this.cv.width !== W || this.cv.height !== H) {
      this.cv.width = W;
      this.cv.height = H;
    }
  };

  /** relógio do servidor (ms) */
  private sNow(): number {
    return Date.now() + this.offset;
  }

  private async poll(): Promise<void> {
    if (this.polling) clearTimeout(this.polling);
    this.polling = null;
    if (!this.alive) return;
    let wait = 15_000;
    try {
      const r = await fetchNow();
      this.offset = r.offset;
      this.grid = r.now;
      this.offline = false;
      const cur = r.now.cur;
      if (cur) {
        void this.load(cur.id);
        if (r.now.next[0]) void this.load(r.now.next[0].id);
        // acorda logo depois do fim do filme atual
        wait = Math.max(1500, Math.min(wait, cur.start + cur.dur - this.sNow() + 600));
      }
    } catch {
      this.offline = true;
      wait = 8000;
      // sem internet: a TV continua com os filmes do Estúdio Bloop (grade local)
      const g = await this.offlineGrid();
      if (g && this.alive) {
        this.offset = 0;
        this.grid = g;
        if (g.cur) {
          void this.load(g.cur.id);
          wait = Math.max(1500, Math.min(20_000, g.cur.start + g.cur.dur - Date.now() + 600));
        }
      }
    }
    this.renderInfo(true);
    if (this.alive) this.polling = setTimeout(() => void this.poll(), wait);
  }

  /** Baixa o filme, decodifica as vozes e prepara o Renderer (cache de alguns filmes). */
  private load(id: string): Promise<Loaded | null> {
    let pr = this.films.get(id);
    if (pr) return pr;
    pr = (async () => {
      try {
        if (isOfficialId(id)) {
          // Estúdio Bloop: do catálogo embutido (sem rede, sem vozes gravadas)
          const p = parseProject(officialProject(await loadOfficial(), id));
          if (!p) return null;
          const r = new Renderer(p);
          if (p.mode === '3d') {
            try {
              const m = await import('./scene3d');
              r.r3d = new m.Scene3D(1);
            } catch {
              p.mode = '2d';
            }
          }
          return { id, p, r };
        }
        const f = await fetchFilm(id);
        const p = parseProject(f.payload.project);
        if (!p) return null;
        p.title = f.title;
        const c = actx();
        // vozes: ids próprios do filme (não colidem com os clipes do aparelho)
        const map = new Map<string, string>();
        for (const [k, clip] of Object.entries(f.payload.clips ?? {})) {
          const nid = `tv:${id}:${k}`;
          map.set(k, nid);
          if (!c) continue;
          try {
            const buf = await c.decodeAudioData(b64ToBuf(clip.b64));
            rememberClip(nid, buf, envelopeOf(buf));
          } catch {
            map.delete(k);
          }
        }
        for (const s of p.scenes) for (const h of s.shots) for (const l of h.lines) if (l.audio) l.audio = map.get(l.audio);
        const r = new Renderer(p);
        if (p.mode === '3d') {
          try {
            const m = await import('./scene3d');
            r.r3d = new m.Scene3D(1);
          } catch {
            p.mode = '2d';
          }
        }
        return { id, p, r };
      } catch {
        this.films.delete(id);
        return null;
      }
    })();
    this.films.set(id, pr);
    // guarda só os 4 mais recentes
    if (this.films.size > 4) {
      const old = this.films.keys().next().value as string;
      if (old !== id) void this.films.get(old)?.then((l) => l?.r.dispose());
      this.films.delete(old);
    }
    void pr.then((l) => {
      if (l && this.grid?.cur?.id === id) this.ready = l;
    });
    return pr;
  }

  private ensureAudio(): Mixer | null {
    if (this.mixer) return this.mixer;
    const c = actx();
    if (!c) return null;
    this.mixer = new Mixer(c);
    this.pb = new Playback(this.mixer);
    return this.mixer;
  }

  private async enableSound(): Promise<void> {
    const c = actx();
    try {
      await c?.resume();
    } catch {
      /* */
    }
    this.audioSlot = '';
    this.el.querySelector<HTMLElement>('.tv-sound')!.hidden = true;
  }

  private slotKey(s: TvSlot): string {
    return `${s.id}@${s.start}`;
  }

  /** Mantém o áudio no mesmo segundo que a grade (reinicia se escorregar > 0,35 s). */
  private syncAudio(cur: TvSlot, T: number, l: Loaded): void {
    const c = actx();
    if (!c) return;
    const soundBtn = this.el.querySelector<HTMLElement>('.tv-sound')!;
    if (c.state !== 'running') {
      soundBtn.hidden = false;
      return;
    }
    soundBtn.hidden = true;
    const m = this.ensureAudio();
    if (!m || !this.pb) return;
    const key = this.slotKey(cur);
    const dur = cur.dur / 1000;
    const now = performance.now();
    if (this.audioSlot !== key) {
      this.audioSlot = key;
      this.lastDriftCheck = now;
      void this.pb.start(l.p, T, dur);
      return;
    }
    if (now - this.lastDriftCheck > 2000) {
      this.lastDriftCheck = now;
      const at = this.pb.time();
      if (!Number.isNaN(at) && Math.abs(at - T) > 0.35) void this.pb.start(l.p, T, dur);
    }
  }

  private stopAudio(): void {
    if (this.audioSlot) this.pb?.stop();
    this.audioSlot = '';
  }

  private loop = (): void => {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    const W = this.cv.width;
    const H = this.cv.height;
    const x = this.ctx;
    const over = this.el.querySelector<HTMLElement>('.tv-over')!;
    const cur = this.grid?.cur ?? null;
    const now = this.sNow();
    if (cur && now >= cur.start + cur.dur) {
      // acabou: a grade já tem o próximo
      const nx = this.grid!.next[0];
      if (nx) this.grid = { ...this.grid!, cur: nx, next: this.grid!.next.slice(1) };
      else this.grid = { ...this.grid!, cur: null };
      void this.poll();
      this.stopAudio();
      this.ready = null;
      if (this.grid.cur) void this.load(this.grid.cur.id).then((l) => (this.ready = l));
      this.renderInfo(true);
      return;
    }
    if (!cur) {
      this.stopAudio();
      this.card(x, W, H, '📺', this.offline ? t('tv.offline', 'Sem conexão com a TV. Tentando de novo...') : this.grid ? t('tv.empty', 'Nenhum filme no ar ainda. Envie o seu pelo Bloop Cinema!') : t('tv.tuning', 'Sintonizando...'));
      over.hidden = true;
      return;
    }
    const T = (now - cur.start) / 1000;
    if (T < 0) {
      // intervalo entre filmes (vinheta)
      this.stopAudio();
      this.card(x, W, H, '🎬', t('tv.soon', 'A seguir: {n}', { n: cur.title }) + ` — ${fmtClock(-T)}`);
      over.hidden = true;
      return;
    }
    if (this.ready?.id !== cur.id) {
      this.card(x, W, H, '⏳', t('tv.loading', 'Carregando o filme...'));
      return;
    }
    const l = this.ready;
    l.r.draw(x, W, H, Math.min(T, l.r.duration() - 0.001), { watermark: true, budget: 0.6, bgScale: 1 });
    this.syncAudio(cur, T, l);
    // tempo restante
    over.hidden = false;
    over.textContent = `${fmtClock(T)} / ${fmtClock(cur.dur / 1000)}`;
  };

  private card(x: CanvasRenderingContext2D, W: number, H: number, ico: string, msg: string): void {
    const g = x.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#2a0b5c');
    g.addColorStop(1, '#ff5cc8');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${Math.round(H * 0.18)}px sans-serif`;
    x.fillText(ico, W / 2, H * 0.4);
    x.font = `600 ${Math.round(H * 0.055)}px Fredoka, sans-serif`;
    x.fillText(msg, W / 2, H * 0.66, W * 0.9);
  }

  private renderInfo(force = false): void {
    const g = this.grid;
    const cur = g?.cur ?? null;
    const key = `${cur?.id}|${cur?.votes}|${g?.next.map((n) => n.id).join(',')}|${this.myVote.get(cur?.id ?? '')}`;
    if (!force && key === this.infoKey) return;
    this.infoKey = key;
    const $ = (r: string) => this.el.querySelector<HTMLElement>(`[data-r="${r}"]`)!;
    $('title').textContent = cur ? cur.title : '—';
    $('by').textContent = cur ? (cur.official ? '⭐ ' : '') + t('tv.by', 'por {a}', { a: cur.author }) : '';
    this.el.querySelector<HTMLElement>('[data-a="remix"]')!.hidden = !cur?.official;
    this.el.querySelector<HTMLElement>('[data-a="report"]')!.hidden = !!cur?.official;
    const mine = cur ? this.myVote.get(cur.id) : false;
    $('vote').textContent = `${mine ? t('tv.liked', 'Você gostou') : t('tv.like', 'Gostei')}${cur ? ' · ' + cur.votes : ''}`;
    this.el.querySelector<HTMLButtonElement>('[data-a="vote"]')!.disabled = !cur || !!mine;
    this.el.querySelector<HTMLButtonElement>('[data-a="report"]')!.disabled = !cur;
    const now = this.sNow();
    $('next').innerHTML = g?.next.length
      ? g.next.map((n) => `<div class="tv-nx">${n.official ? `<img class="tv-nx-th" loading="lazy" src="${thumbUrl(n.id)}" alt="">` : '<span class="tv-nx-th kid">🎬</span>'}<div><b>${esc(n.title)}</b><small>${esc(n.author)} · ${t('tv.in', 'em {t}', { t: fmtClock((n.start - now) / 1000) })} · ${fmtClock(n.dur / 1000)}</small></div></div>`).join('')
      : `<p class="cin-hint">${t('tv.noNext', 'A grade aparece aqui quando houver mais filmes.')}</p>`;
    if (cur && !this.myVote.has(cur.id) && !this.offline) {
      this.myVote.set(cur.id, false);
      void voted(cur.id)
        .then((v) => {
          this.myVote.set(cur.id, v);
          this.renderInfo(true);
        })
        .catch(() => {});
    }
  }

  private async doVote(): Promise<void> {
    const cur = this.grid?.cur;
    if (!cur) return;
    try {
      const r = await vote(cur.id);
      this.myVote.set(cur.id, true);
      cur.votes = r.votes;
      notify(t('tv.voted', 'Valeu! Os filmes mais curtidos passam mais vezes.'), { kind: 'good', icon: 'check' });
    } catch (e) {
      const code = (e as { code?: string }).code;
      notify(code === 'self' ? t('tv.selfVote', 'Esse filme é seu! Peça para os amigos votarem.') : t('tv.voteFail', 'Não deu para votar agora.'), { kind: 'warn' });
    }
    this.renderInfo(true);
  }

  private async doReport(): Promise<void> {
    const cur = this.grid?.cur;
    if (!cur) return;
    const a = await menu(t('tv.reportQ', 'Denunciar “{n}”', { n: cur.title }), [
      ['offensive', t('studio.rep.offensive', 'Ofensivo ou feio')],
      ['scary', t('studio.rep.scary', 'Assustador / impróprio')],
      ['copy', t('studio.rep.copy', 'Copiou de alguém')],
      ['spam', t('studio.rep.spam', 'Spam')],
      ['other', t('studio.rep.other', 'Outro motivo')],
    ]);
    if (!a) return;
    try {
      await report(cur.id, a);
      notify(t('studio.reported', 'Obrigado! Denúncia enviada'), { kind: 'good', icon: 'check' });
    } catch {
      notify(t('tv.voteFail', 'Não deu para votar agora.'), { kind: 'warn' });
    }
  }

  close(fromBack = false): void {
    if (!this.alive) return;
    this.alive = false;
    if (!fromBack) this.popBack();
    cancelAnimationFrame(this.raf);
    if (this.polling) clearTimeout(this.polling);
    window.removeEventListener('resize', this.resize);
    this.pb?.stop();
    this.mixer?.dispose();
    for (const p of this.films.values()) void p.then((l) => l?.r.dispose());
    this.el.remove();
    music.resume();
    delete (window as unknown as { __tv?: TvPlayer }).__tv;
    this.onClose?.();
  }
}

let open: TvPlayer | null = null;

/** Abre a TV Bloop em tela cheia (hub ou início do Cinema). */
export function openTv(onClose?: () => void): void {
  if (open) return;
  open = new TvPlayer(() => {
    open = null;
    onClose?.();
  });
}

/** Meus envios para a TV (com o estado da revisão). */
export async function showMyFilms(): Promise<void> {
  let list: Awaited<ReturnType<typeof myFilms>> = [];
  try {
    list = await myFilms();
  } catch {
    notify(t('tv.offline', 'Sem conexão com a TV. Tentando de novo...'), { kind: 'warn' });
    return;
  }
  const st = (r?: string, why?: string) =>
    r === 'approved' ? `<i class="tv-rev ok">${t('tv.rev.ok', 'No ar')}</i>` : r === 'rejected' ? `<i class="tv-rev bad">${t('tv.rev.bad', 'Recusado')}${why ? ': ' + esc(why) : ''}</i>` : `<i class="tv-rev wait">${t('studio.rev.wait', 'Em análise')}</i>`;
  sheet(
    `<h3>📺 ${t('tv.myFilms', 'Meus envios')}</h3>${list.length ? `<div class="tv-mine">${list.map((f) => `<div><b>${esc(f.name)}</b>${st(f.review, f.reviewReason)}</div>`).join('')}</div>` : `<p class="cin-hint">${t('tv.noMine', 'Você ainda não enviou filmes. No Cinema, abra um filme e toque em Exportar → Enviar para a TV.')}</p>`}
     <button class="cin-btn ghost" data-a="x" style="width:100%;margin-top:10px">${t('cin.close', 'Fechar')}</button>`,
    (_a, _el, close) => close(),
  );
}

const ERR: Record<SubmitError, () => string> = {
  offline: () => t('tv.err.offline', 'Sem conexão. Tente de novo com internet.'),
  'too-big': () => t('tv.err.big', 'O filme ficou grande demais (máx. 3 MB com as vozes). Grave falas mais curtas.'),
  'too-long': () => t('tv.err.long', 'Filmes para a TV podem ter até 5 minutos.'),
  name: () => t('tv.err.name', 'Troque o título: ele tem palavra feia ou dado pessoal.'),
  empty: () => t('tv.err.empty', 'O filme é curto demais.'),
  'daily-limit': () => t('tv.err.limit', 'Você já enviou 3 filmes hoje. Amanhã tem mais!'),
  banned: () => t('tv.err.banned', 'Sua conta não pode enviar filmes.'),
  invalid: () => t('tv.err.invalid', 'Não deu para enviar este filme.'),
  rate: () => t('tv.err.rate', 'Calma! Espere um pouco antes de enviar de novo.'),
  ai: () => t('tv.err.ai', 'A IA achou algo que não pode na TV.'),
};

/** Motivo gentil da recusa automática (IA), apontando a fala. */
function aiWhy(a: TvAiReject): string {
  const n = a.lines.map((l) => l.n).join(', ') || '?';
  switch (a.why) {
    case 'voice-bad':
      return t('tv.ai.voiceBad', 'Tem uma palavra que não pode na TV na fala {n}. Regrave essa fala!', { n });
    case 'voice-pii':
      return t('tv.ai.voicePii', 'Na fala {n} parece ter um dado pessoal (telefone, endereço, escola ou rede social). Regrave sem isso!', { n });
    case 'text-bad':
      return t('tv.ai.textBad', 'Tem uma palavra que não pode na TV no balão da fala {n}. Troque o texto!', { n });
    case 'text-pii':
      return t('tv.ai.textPii', 'O balão da fala {n} parece ter um dado pessoal. Troque o texto!', { n });
    default:
      return t('tv.ai.other', 'A IA achou algo que não pode na TV na fala {n}. Regrave ou troque essa fala!', { n });
  }
}

/** "Enviar para a TV": regras claras → fotos → envio. Chamado pelo Exportar do Cinema. */
export function sendToTvSheet(p: Project, r: Renderer, o: { onFix?: (lineId: string) => void } = {}): void {
  const dur = projectDuration(p);
  const s = sheet(
    `<h3>📺 ${t('tv.send', 'Enviar para a TV Bloop')}</h3>
     <p class="cin-hint">${t('tv.sendInfo', '“{n}” · {d}. Se a equipe aprovar, ele passa na TV para todo mundo assistir junto — e a cada 10 “Gostei” você ganha moedas no Correio.', { n: esc(p.title), d: fmtClock(dur) })}</p>
     <div class="tv-rules"><b>${t('tv.rules', 'Regras da TV')}</b><ul>
       <li>${t('tv.rule1', 'Nada de palavrões, ofensas, sustos pesados ou conteúdo impróprio.')}</li>
       <li>${t('tv.rule2', 'Nada de dados pessoais: nome completo, telefone, endereço, escola, redes sociais.')}</li>
       <li>${t('tv.rule3ai', 'Suas vozes vão junto: uma IA confere as palavras e depois a equipe ouve antes de aprovar.')}</li>
       <li>${t('tv.rule4', 'Até {m} min e 3 MB; até {n} filmes por dia. Votos falsos não contam.', { m: TV.maxDurSec / 60, n: TV.maxFilmsPerDay })}</li>
       <li>${t('tv.rule5', 'Filmes denunciados saem do ar até nova revisão. Quem quebrar as regras perde o acesso.')}</li>
     </ul></div>
     <label class="tv-agree"><input type="checkbox" data-r="agree"> ${t('tv.agree', 'Li as regras e o filme é meu')}</label>
     <div class="cin-progress" hidden><i></i></div>
     <div class="cin-menu" style="margin-top:12px"><button class="cin-btn pri" data-a="go" disabled>📺 ${t('tv.sendBtn', 'Enviar para revisão')}</button><button class="cin-btn ghost" data-a="x">${t('cin.cancel', 'Cancelar')}</button></div>`,
    async (a, el, close) => {
      if (a === 'x') return close();
      if (a === 'fix') {
        close();
        o.onFix?.(el.dataset.v!);
        return;
      }
      if (a !== 'go') return;
      const go = s.el.querySelector<HTMLButtonElement>('[data-a="go"]')!;
      go.disabled = true;
      const bar = s.el.querySelector<HTMLElement>('.cin-progress')!;
      bar.hidden = false;
      // 3 fotos do filme (começo, meio, fim)
      const thumbs: string[] = [];
      for (const k of [0.15, 0.5, 0.85]) {
        const cv = document.createElement('canvas');
        cv.width = 256;
        cv.height = 144;
        try {
          r.draw(cv.getContext('2d')!, 256, 144, Math.min(r.duration() - 0.05, r.duration() * k), { budget: 0.3, bgScale: 0.8 });
          thumbs.push(cv.toDataURL('image/jpeg', 0.7));
        } catch {
          /* */
        }
      }
      const res = await submitFilm(p, thumbs, (k) => (bar.querySelector('i')!.style.width = `${Math.round(k * 100)}%`));
      if (res.ok) {
        close();
        notify(t('tv.sent', 'Enviado! Seu filme está “Em análise”. Acompanhe em TV Bloop → Meus envios.'), { kind: 'good', icon: 'check' });
      } else if (res.error === 'ai' && res.ai) {
        // recusa automática: mostra o motivo e a fala, com o atalho para regravar
        const ai = res.ai;
        s.el.innerHTML = `<div class="tv-ai"><div class="tv-ai-ico">🙊</div>
          <h3>${t('tv.ai.title', 'Quase lá!')}</h3>
          <p>${esc(aiWhy(ai))}</p>
          <ul class="tv-ai-lines">${ai.lines.map((l) => `<li><b>${t('tv.ai.line', 'Fala {n}', { n: l.n })}</b> ${l.text ? '“' + esc(l.text) + '”' : '🎙️'}</li>`).join('')}</ul>
          <p class="cin-hint">${t('tv.ai.how', 'Uma IA ouve as vozes antes da TV para manter tudo legal para todo mundo. Corrija e envie de novo — não gasta seus envios do dia.')}</p>
          <div class="cin-menu">${o.onFix && ai.lines[0] ? `<button class="cin-btn pri" data-a="fix" data-v="${esc(ai.lines[0].id)}">${ai.why.startsWith('text') ? '✏️ ' + t('tv.ai.fixText', 'Trocar a fala {n}', { n: ai.lines[0].n }) : '🎙️ ' + t('tv.ai.fixVoice', 'Regravar a fala {n}', { n: ai.lines[0].n })}</button>` : ''}<button class="cin-btn ghost" data-a="x">${t('cin.ok', 'OK')}</button></div></div>`;
      } else {
        go.disabled = false;
        bar.hidden = true;
        notify(ERR[res.error](), { kind: 'warn' });
      }
    },
  );
  s.el.querySelector<HTMLInputElement>('[data-r="agree"]')!.addEventListener('change', (e) => {
    s.el.querySelector<HTMLButtonElement>('[data-a="go"]')!.disabled = !(e.target as HTMLInputElement).checked;
  });
}
