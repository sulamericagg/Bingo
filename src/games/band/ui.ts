/* ============================================================
 *  TELAS (DOM) da Bloop Banda: início, músicas, saguão online,
 *  HUD, pausa, resultados, visual (customização) e calibração.
 *  O Estúdio fica em studio.ts.
 * ============================================================ */
import { t, fmt } from '../../i18n';
import { addCoins } from '../../core/economy';
import { spend, canAfford } from '../../core/economy';
import { save } from '../../core/storage';
import { tap, success } from '../../core/haptics';
import { reportRun } from '../../hub/registry';
import { rewardedAvailable, showRewarded } from '../../services/ads';
import { openEmoteWheel } from '../../social/emotes';
import { skinById } from '../../game/skins';
import { esc } from '../../ui/dom';
import { icon } from '../../ui/icons';
import type { BandGame, BandSlot, RunResult } from './game';
import { bandIcon, type BandIcon } from './icons';
import { DIFFS, INSTRUMENTS, LANES, buildNotes, chartFor, diffName, hash32, instName, songTitle, styleName, type Difficulty, type Instrument, type RNote, type SongDef } from './model';
import { allSongs, isUnlocked, songById, catBand } from './songs';
import { bs, getBest, persistBand, recordBest, bestStarsAny } from './save';
import { catalog, cosName, owns, findCos, lookFor, instColors, INST_DEFAULT, type CosItem, type CosKind } from './cosmetics';
import { Highway, drawNote } from './highway';
import { BandNet } from './net';

type ScreenName = 'home' | 'select' | 'lobby' | 'hud' | 'pause' | 'custom' | 'calib' | 'studio' | 'results';

const INST_ICON: Record<Instrument, BandIcon> = { drums: 'drums', bass: 'bass', guitar: 'guitar', keys: 'keys', vocals: 'vocals' };
const TIER_LABEL = (tier: SongDef['tier']): string =>
  tier === 'free' ? t('band.tier.free', 'Grátis') : tier === 'pass' ? t('band.tier.pass', 'Passe') : tier === 'mega' ? t('band.tier.mega', 'MEGA') : t('band.tier.mine', 'Minhas');

function starsHtml(n: number, size = 14): string {
  let s = '<span class="bb-stars">';
  for (let i = 0; i < 5; i++) s += `<span class="${i < n ? 'on' : 'off'}">${bandIcon('star', size)}</span>`;
  return s + '</span>';
}

export class Screens {
  cur: ScreenName = 'home';
  private el: HTMLDivElement;
  private starBtn: HTMLButtonElement | null = null;
  private progEl: HTMLDivElement | null = null;
  private lastMeter = -1;
  private lastStarOn = false;
  private lastProg = -1;
  private filter = { q: '', style: '', tier: '' };
  private pickCb: ((s: SongDef) => void) | null = null;
  private lastSlots: BandSlot[] | null = null;
  net: BandNet | null = null;
  private lobbySong: SongDef | null = null;
  private lobbyDiff: Difficulty = 'facil';
  private lobbyTimer = 0;
  private customTab: CosKind = 'highway';
  private customInst: Instrument = 'guitar';
  private calibStop: (() => void) | null = null;
  private studioMod: { openStudio: (g: BandGame, el: HTMLElement, done: () => void) => () => void } | null = null;
  private studioClose: (() => void) | null = null;
  private toastT = 0;

  constructor(private g: BandGame) {
    this.el = g.ui;
  }

  refresh(): void {
    if (this.cur === 'select' || this.cur === 'home') this.show(this.cur);
  }

  show(name: ScreenName): void {
    this.calibStop?.();
    this.calibStop = null;
    if (name !== 'studio') {
      this.studioClose?.();
      this.studioClose = null;
    }
    if (name !== 'lobby' && name !== 'hud' && name !== 'pause' && name !== 'results' && name !== 'select') this.leaveNet();
    this.cur = name;
    this.starBtn = null;
    this.progEl = null;
    this.el.className = 'bb-ui bb-s-' + name;
    switch (name) {
      case 'home':
        return this.home();
      case 'select':
        return this.select();
      case 'lobby':
        return this.lobby();
      case 'hud':
        return this.hudScreen();
      case 'pause':
        return this.pauseScreen();
      case 'custom':
        return this.custom();
      case 'calib':
        return this.calib();
      case 'studio':
        void this.studio();
        return;
    }
  }

  private leaveNet(): void {
    if (this.lobbyTimer) clearInterval(this.lobbyTimer);
    this.lobbyTimer = 0;
    this.net?.leave();
    this.net = null;
  }

  toast(msg: string): void {
    let el = this.g.root.querySelector<HTMLDivElement>('.bb-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'bb-toast';
      this.g.root.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => el!.classList.remove('on'), 2200);
  }

  private top(title: string, back: () => void, extra = ''): string {
    setTimeout(() => {
      const b = this.el.querySelector<HTMLButtonElement>('.bb-back');
      if (b) b.onclick = () => {
        tap('light');
        back();
      };
    });
    return `<div class="bb-top"><button class="bb-btn bb-back" aria-label="${esc(t('band.back', 'Voltar'))}">${bandIcon('back', 24)}</button><h2>${esc(title)}</h2>${extra}</div>`;
  }

  /* ------------------------------ início ------------------------------ */

  private home(): void {
    this.g.setMenuBand();
    this.el.innerHTML = `
      ${this.top('', () => this.g.exit())}
      <div class="bb-home">
        <div class="bb-logo"><span>${esc(t('band.name', 'Bloop Banda'))}</span><small>${esc(t('band.tagline', 'Monte sua banda e toque no ritmo!'))}</small></div>
        <div class="bb-menu">
          <button class="bb-big bb-play" data-a="select">${bandIcon('play', 34)}<span>${esc(t('band.play', 'Tocar'))}</span></button>
          <button class="bb-big" data-a="lobby">${bandIcon('band', 30)}<span>${esc(t('band.online', 'Banda com amigos'))}</span></button>
          <button class="bb-big" data-a="studio">${bandIcon('mixer', 30)}<span>${esc(t('band.studio', 'Estúdio'))}</span></button>
          <div class="bb-row2">
            <button class="bb-mid" data-a="custom">${bandIcon('brush', 24)}<span>${esc(t('band.custom', 'Visual'))}</span></button>
            <button class="bb-mid" data-a="calib">${bandIcon('metronome', 24)}<span>${esc(t('band.calib', 'Calibrar'))}</span></button>
          </div>
        </div>
      </div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach((b) => {
      b.onclick = () => {
        tap('light');
        this.g.ensureAudio();
        this.pickCb = null;
        this.show(b.dataset.a as ScreenName);
      };
    });
  }

  /* ------------------------------ músicas ------------------------------ */

  private density = new Map<string, number>();
  private io: IntersectionObserver | null = null;
  private rating(s: SongDef, inst: Instrument, d: Difficulty): number {
    const k = s.id + inst + d;
    let v = this.density.get(k);
    if (v == null) {
      const n = chartFor(s, inst, d).length;
      const nps = n / Math.max(10, s.durationSec);
      v = Math.max(1, Math.min(5, Math.round(nps * 1.4)));
      this.density.set(k, v);
    }
    return v;
  }

  private select(): void {
    const songs = allSongs();
    const styles = [...new Set(songs.map((s) => s.style))];
    const tiers: SongDef['tier'][] = ['free', 'pass', 'mega', 'creator'];
    const picking = !!this.pickCb;
    this.el.innerHTML = `
      ${this.top(picking ? t('band.pickSong', 'Escolha a música da banda') : t('band.songs', 'Músicas'), () => (picking ? this.show('lobby') : this.show('home')))}
      <div class="bb-sel">
        <div class="bb-insts">${INSTRUMENTS.map((i) => `<button class="bb-inst ${i === bs.inst ? 'on' : ''}" data-i="${i}" aria-label="${esc(instName(i))}">${bandIcon(INST_ICON[i], 30)}<span>${esc(instName(i))}</span></button>`).join('')}</div>
        <div class="bb-chips bb-diffs">${DIFFS.map((d) => `<button class="bb-chip ${d === bs.diff ? 'on' : ''}" data-d="${d}">${esc(diffName(d))} <small>${LANES[d]}</small></button>`).join('')}</div>
        <div class="bb-search">${bandIcon('search', 20)}<input type="search" placeholder="${esc(t('band.search', 'Buscar música ou banda'))}" value="${esc(this.filter.q)}"/></div>
        <div class="bb-chips bb-scroll bb-styles"><button class="bb-chip ${!this.filter.style ? 'on' : ''}" data-st="">${esc(t('band.all', 'Todos'))}</button>${styles.map((s) => `<button class="bb-chip ${this.filter.style === s ? 'on' : ''}" data-st="${esc(s)}">${esc(styleName(s))}</button>`).join('')}</div>
        <div class="bb-chips bb-scroll bb-tiers"><button class="bb-chip ${!this.filter.tier ? 'on' : ''}" data-tr="">${esc(t('band.allTiers', 'Todas'))}</button>${tiers.map((tr) => `<button class="bb-chip bb-t-${tr} ${this.filter.tier === tr ? 'on' : ''}" data-tr="${tr}">${esc(TIER_LABEL(tr))}</button>`).join('')}</div>
        <div class="bb-list"></div>
      </div>`;
    const list = this.el.querySelector<HTMLDivElement>('.bb-list')!;
    const render = () => {
      const q = this.filter.q.trim().toLowerCase();
      const items = songs.filter(
        (s) => (!q || songTitle(s).toLowerCase().includes(q) || s.band.toLowerCase().includes(q)) && (!this.filter.style || s.style === this.filter.style) && (!this.filter.tier || s.tier === this.filter.tier),
      );
      if (!items.length) {
        list.innerHTML = `<div class="bb-empty">${esc(t('band.noSongs', 'Nenhuma música aqui ainda.'))}</div>`;
        return;
      }
      list.innerHTML = items
        .map((s) => {
          const lock = !isUnlocked(s);
          const best = getBest(s.id, bs.inst, bs.diff);
          const dif = INSTRUMENTS.map((i) => `<span class="bb-dif ${i === bs.inst ? 'me' : ''}" title="${esc(instName(i))}">${bandIcon(INST_ICON[i], 14)}<i data-i="${i}" style="--n:${this.density.get(s.id + i + bs.diff) ?? 0}"></i></span>`).join('');
          const mins = Math.floor(s.durationSec / 60);
          const secs = String(Math.round(s.durationSec % 60)).padStart(2, '0');
          return `<button class="bb-song ${lock ? 'locked' : ''}" data-id="${esc(s.id)}">
            <span class="bb-badge bb-t-${s.tier}">${esc(TIER_LABEL(s.tier))}</span>
            <span class="bb-sinfo"><b>${esc(songTitle(s))}</b><small>${esc(catBand(s))} · ${esc(styleName(s.style))} · ${s.bpm} BPM · ${mins}:${secs}</small><span class="bb-difs">${dif}</span></span>
            <span class="bb-sbest">${lock ? `${bandIcon('lock', 26)}<small>${s.season != null ? esc(t('band.season', 'Temporada {n}', { n: s.season + 1 })) : esc(TIER_LABEL(s.tier))}</small>` : `${starsHtml(best?.st ?? 0, 13)}<small>${best ? fmt(best.s) : '—'}</small>`}</span>
          </button>`;
        })
        .join('');
      // dificuldade por instrumento: só calcula para os cards visíveis (charts são compostos sob demanda)
      this.io?.disconnect();
      this.io = new IntersectionObserver(
        (ents) => {
          for (const en of ents) {
            if (!en.isIntersecting) continue;
            const card = en.target as HTMLElement;
            this.io?.unobserve(card);
            const s = songById(card.dataset.id!);
            if (!s) continue;
            setTimeout(() => card.querySelectorAll<HTMLElement>('.bb-dif i').forEach((el) => el.style.setProperty('--n', String(this.rating(s, el.dataset.i as Instrument, bs.diff)))), 0);
          }
        },
        { root: list },
      );
      list.querySelectorAll('.bb-song').forEach((c) => this.io!.observe(c));
    };
    render();
    list.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.bb-song');
      if (!b) return;
      const s = songById(b.dataset.id!);
      if (!s) return;
      tap('light');
      if (!isUnlocked(s)) {
        this.toast(s.tier === 'pass' && s.season != null ? t('band.lockedPass', 'Desbloqueie no Passe da Temporada {n}', { n: s.season + 1 }) : t('band.lockedMega', 'Música MEGA: desbloqueie com o Clube Bloop ou o Passe'));
        return;
      }
      if (this.pickCb) {
        const cb = this.pickCb;
        this.pickCb = null;
        cb(s);
        return;
      }
      this.playSolo(s);
    };
    const inp = this.el.querySelector<HTMLInputElement>('input')!;
    inp.oninput = () => {
      this.filter.q = inp.value;
      render();
    };
    this.el.querySelectorAll<HTMLButtonElement>('.bb-inst').forEach(
      (b) =>
        (b.onclick = () => {
          bs.inst = b.dataset.i as Instrument;
          persistBand();
          tap('light');
          this.el.querySelectorAll('.bb-inst').forEach((x) => x.classList.toggle('on', x === b));
          this.g.setMenuBand();
          render();
        }),
    );
    const chipGroup = (sel: string, attr: string, apply: (v: string) => void) =>
      this.el.querySelectorAll<HTMLButtonElement>(sel).forEach(
        (b) =>
          (b.onclick = () => {
            apply(b.getAttribute(attr) ?? '');
            tap('light');
            this.el.querySelectorAll(sel).forEach((x) => x.classList.toggle('on', x === b));
            render();
          }),
      );
    chipGroup('.bb-diffs .bb-chip', 'data-d', (v) => {
      bs.diff = v as Difficulty;
      persistBand();
    });
    chipGroup('.bb-styles .bb-chip', 'data-st', (v) => (this.filter.style = v));
    chipGroup('.bb-tiers .bb-chip', 'data-tr', (v) => (this.filter.tier = v));
  }

  playSolo(s: SongDef, inst: Instrument = bs.inst, diff: Difficulty = bs.diff): void {
    const slots = this.g.soloSlots(inst);
    this.lastSlots = slots;
    this.g.startSong(s, inst, diff, slots);
  }

  /* ------------------------------ HUD ------------------------------ */

  private hudScreen(): void {
    const multi = !!this.g.net;
    this.el.innerHTML = `
      <div class="bb-prog"><div></div></div>
      ${multi ? '' : `<button class="bb-btn bb-pause" aria-label="${esc(t('band.pause', 'Pausar'))}">${icon('pause', { size: 24 })}</button>`}
      ${multi ? `<button class="bb-btn bb-emote" aria-label="${esc(t('band.emote', 'Atalhos'))}">${bandIcon('emote', 26)}</button>` : ''}
      <button class="bb-starbtn" aria-label="${esc(t('band.starBtn', 'Ativar Modo Estrela'))}">${bandIcon('star', 34)}<span class="bb-starlbl">${esc(t('band.starShort', 'Estrela'))}</span></button>`;
    this.starBtn = this.el.querySelector('.bb-starbtn');
    this.progEl = this.el.querySelector('.bb-prog > div');
    this.lastMeter = -1;
    this.lastProg = -1;
    this.hudStar(this.g.starMeter, this.g.starOn);
    this.starBtn!.onpointerdown = (e) => {
      e.stopPropagation();
      this.g.activateStar();
    };
    const p = this.el.querySelector<HTMLButtonElement>('.bb-pause');
    if (p) p.onclick = () => this.g.pause(true);
    const em = this.el.querySelector<HTMLButtonElement>('.bb-emote');
    if (em)
      em.onclick = () =>
        openEmoteWheel((code) => {
          this.g.net?.emote(code);
          if (this.g.me) {
            this.g.me.emote = code;
            this.g.me.emoteT = performance.now() / 1000;
          }
        });
  }

  hudStar(meter: number, on: boolean): void {
    if (!this.starBtn) return;
    const m = Math.round(meter * 50) / 50;
    if (m === this.lastMeter && on === this.lastStarOn) return;
    this.lastMeter = m;
    this.lastStarOn = on;
    this.starBtn.style.setProperty('--m', String(m));
    this.starBtn.classList.toggle('ready', m >= 0.5 && !on);
    this.starBtn.classList.toggle('active', on);
  }

  hudProgress(f: number): void {
    if (!this.progEl) return;
    const v = Math.round(Math.max(0, Math.min(1, f)) * 200) / 200;
    if (v === this.lastProg) return;
    this.lastProg = v;
    this.progEl.style.transform = `scaleX(${v})`;
  }

  /* ------------------------------ pausa ------------------------------ */

  private pauseScreen(): void {
    this.el.innerHTML = `<div class="bb-modal"><h2>${esc(t('band.paused', 'Pausado'))}</h2>
      <button class="bb-big bb-play" data-a="resume">${bandIcon('play', 28)}<span>${esc(t('band.resume', 'Continuar'))}</span></button>
      <button class="bb-mid" data-a="restart">${icon('refresh', { size: 22 })}<span>${esc(t('band.restart', 'Recomeçar'))}</span></button>
      <button class="bb-mid" data-a="quit">${bandIcon('back', 22)}<span>${esc(t('band.quit', 'Sair da música'))}</span></button></div>`;
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const a = b.dataset.a;
          if (a === 'resume') this.g.resume();
          else if (a === 'restart') {
            this.g.resume();
            if (this.g.song) this.g.startSong(this.g.song, this.g.inst, this.g.diff, this.lastSlots ?? this.g.soloSlots(this.g.inst));
          } else {
            this.g.quitSong();
            this.show('select');
          }
        }),
    );
  }

  /* ------------------------------ resultados ------------------------------ */

  results(r: RunResult, multi = false): void {
    this.cur = 'results';
    this.el.className = 'bb-ui bb-s-results';
    const record = recordBest(r.song.id, r.inst, r.diff, r.score, r.stars);
    let coins = Math.max(2, Math.round(r.score / 500) + r.stars * 6 + (multi ? 10 : 0));
    if (r.song.tier === 'creator') coins = Math.round(coins * 0.5);
    addCoins(coins);
    reportRun({ game: 'band', score: r.score, coins, durationSec: r.durationSec, place: r.place, won: r.place === 1, stats: { perfects: r.perfects, notes: r.perfects + r.greats + r.goods, maxCombo: r.maxCombo, stars: r.stars } });
    if (r.stars >= 4) success();
    const sorted = r.members.slice().sort((a, b) => b.score - a.score);
    const ordinal = (n: number) => t('band.place', '{n}º', { n });
    this.el.innerHTML = `<div class="bb-modal bb-res">
      <div class="bb-res-title">${esc(songTitle(r.song))}<small>${esc(instName(r.inst))} · ${esc(diffName(r.diff))}</small></div>
      <div class="bb-res-stars">${starsHtml(r.stars, 44)}</div>
      ${record ? `<div class="bb-record">${esc(t('band.record', 'Novo recorde!'))}</div>` : ''}
      <div class="bb-res-score">${fmt(r.score)}</div>
      <div class="bb-res-grid">
        <div><b>${r.perfects}</b><small>${esc(t('band.j.perfectN', 'Perfeitos'))}</small></div>
        <div><b>${r.greats + r.goods}</b><small>${esc(t('band.j.otherN', 'Ótimos/Bons'))}</small></div>
        <div><b>${r.misses}</b><small>${esc(t('band.j.missN', 'Erros'))}</small></div>
        <div><b>${r.maxCombo}</b><small>${esc(t('band.maxCombo', 'Combo máx.'))}</small></div>
        <div><b>${Math.round(r.acc * 100)}%</b><small>${esc(t('band.acc', 'Precisão'))}</small></div>
        <div><b>${ordinal(r.place)}</b><small>${esc(t('band.inBand', 'na banda'))}</small></div>
      </div>
      <div class="bb-res-band">${sorted.map((m, i) => `<span class="${m.me ? 'me' : ''}">${ordinal(i + 1)} ${bandIcon(INST_ICON[m.inst], 16)} ${esc(m.name)} <b>${fmt(m.score)}</b></span>`).join('')}</div>
      <div class="bb-coins">${icon('coin', { size: 26 })}<b>+${coins}</b></div>
      ${rewardedAvailable() ? `<button class="bb-mid bb-double">${icon('video', { size: 22 })}<span>${esc(t('band.double', 'Dobrar moedas'))}</span></button>` : ''}
      <div class="bb-res-actions">
        <button class="bb-big bb-play" data-a="again">${icon('refresh', { size: 26 })}<span>${esc(multi ? t('band.toLobby', 'Voltar ao saguão') : t('band.again', 'De novo'))}</span></button>
        <button class="bb-mid" data-a="songs">${bandIcon('note', 22)}<span>${esc(t('band.songs', 'Músicas'))}</span></button>
      </div></div>`;
    const dbl = this.el.querySelector<HTMLButtonElement>('.bb-double');
    if (dbl)
      dbl.onclick = async () => {
        dbl.disabled = true;
        if (await showRewarded()) {
          addCoins(coins);
          dbl.innerHTML = `${icon('check', { size: 22 })}<span>+${coins}</span>`;
        } else dbl.disabled = false;
      };
    this.el.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          if (b.dataset.a === 'again') {
            if (multi) {
              this.g.quitSong();
              this.net?.backToLobby();
              this.show('lobby');
            } else this.playSolo(r.song, r.inst, r.diff);
          } else {
            this.g.quitSong();
            this.show('select');
          }
        }),
    );
  }

  /* ------------------------------ saguão online ------------------------------ */

  private lobby(): void {
    if (!this.net) {
      this.net = new BandNet();
      this.net.st.in = INSTRUMENTS.indexOf(bs.inst);
      this.net.onChange(() => {
        if (this.cur === 'lobby') this.renderLobby();
      });
      this.net.join();
      this.lobbyTimer = window.setInterval(() => {
        if (this.cur === 'lobby') this.renderLobby();
      }, 1000);
    }
    if (!this.lobbySong) this.lobbySong = allSongs().find((s) => isUnlocked(s) && s.tier === 'free') ?? allSongs()[0] ?? null;
    this.el.innerHTML = `${this.top(t('band.online', 'Banda com amigos'), () => this.show('home'))}<div class="bb-lobby"></div>`;
    this.renderLobby();
  }

  /** slots da banda: você + amigos + bots nas vagas livres (até 4) */
  lobbySlots(): BandSlot[] {
    const net = this.net!;
    const me: BandSlot = { inst: INSTRUMENTS[net.st.in], name: t('band.you', 'Você'), skin: this.g.mySkin(), me: true };
    const slots: BandSlot[] = [me];
    for (const p of net.lobbyPeers()) {
      const inst = INSTRUMENTS[p.s.in ?? 0];
      if (slots.some((s) => s.inst === inst)) continue;
      slots.push({ inst, name: p.name, skin: skinById(p.skin === 'custom' ? 'bloop' : p.skin), remote: p.id });
    }
    const bots = this.g.soloSlots(me.inst).filter((s) => !s.me && !slots.some((x) => x.inst === s.inst));
    for (const b of bots) if (slots.length < 4) slots.push(b);
    return slots;
  }

  private renderLobby(): void {
    const box = this.el.querySelector<HTMLDivElement>('.bb-lobby');
    const net = this.net;
    if (!box || !net) return;
    if (net.fixConflict()) net.setInst(INSTRUMENTS[net.st.in]);
    const host = net.isHost();
    const hp = net.host();
    // segue a música do anfitrião
    if (!host && hp) {
      const s = allSongs().find((x) => hash32(x.id) === (hp.s.so ?? -1));
      if (s) this.lobbySong = s;
      this.lobbyDiff = DIFFS[hp.s.df ?? 0] ?? 'facil';
      // anfitrião começou?
      if (hp.s.ph === 1 && (hp.s.at ?? 0) > Date.now() - 1500 && net.st.rd && this.lobbySong) return this.startLobby(hp.s.at!);
    }
    if (host && this.lobbySong) net.setSong(hash32(this.lobbySong.id), DIFFS.indexOf(this.lobbyDiff));
    const slots = this.lobbySlots();
    if (!this.lastSlotsKey || this.lastSlotsKey !== slots.map((s) => s.inst + s.name).join()) {
      this.lastSlotsKey = slots.map((s) => s.inst + s.name).join();
      this.g.setBandPreview(slots);
    }
    const peers = net.lobbyPeers();
    const nowS = performance.now() / 1000;
    for (const p of peers) {
      const m = this.g.members.find((x) => x.pid === p.id);
      if (m && p.emote && m.emote !== p.emote) {
        m.emote = p.emote;
        m.emoteT = nowS;
      }
    }
    const allReady = peers.every((p) => (p.s.rd ?? 0) > 0);
    const status = !net.ses ? t('band.connecting', 'Procurando amigos…') : net.online ? (peers.length ? t('band.friendsIn', '{n} amigo(s) na sala', { n: peers.length }) : t('band.waiting', 'Esperando amigos… (bots completam a banda)')) : t('band.offline', 'Sem internet: sua banda toca com bots');
    const s = this.lobbySong;
    box.innerHTML = `
      <div class="bb-status ${net.online ? 'on' : ''}">${esc(status)}</div>
      <div class="bb-slots">${slots
        .map((sl) => {
          const p = sl.remote ? peers.find((q) => q.id === sl.remote) : null;
          const ready = sl.me ? net.st.rd > 0 : p ? (p.s.rd ?? 0) > 0 : true;
          return `<div class="bb-slot ${sl.me ? 'me' : ''} ${ready ? 'ready' : ''}">${bandIcon(INST_ICON[sl.inst], 30)}<b>${esc(sl.name)}</b><small>${esc(instName(sl.inst))}${!sl.me && !sl.remote ? ' · ' + esc(t('band.bot', 'bot')) : ''}</small>${ready ? `<i>${icon('check', { size: 18 })}</i>` : ''}</div>`;
        })
        .join('')}</div>
      <div class="bb-lab">${esc(t('band.yourInst', 'Seu instrumento'))}</div>
      <div class="bb-insts">${INSTRUMENTS.map((i) => {
        const taken = net.takenBy(i);
        return `<button class="bb-inst ${INSTRUMENTS[net.st.in] === i ? 'on' : ''}" data-i="${i}" ${taken ? 'disabled' : ''}>${bandIcon(INST_ICON[i], 28)}<span>${esc(taken ? taken.name : instName(i))}</span></button>`;
      }).join('')}</div>
      <div class="bb-lab">${esc(host ? t('band.songHost', 'Música (você escolhe)') : t('band.songGuest', 'Música (o anfitrião escolhe)'))}</div>
      <div class="bb-lsong">${s ? `<b>${esc(songTitle(s))}</b><small>${esc(catBand(s))} · ${esc(diffName(this.lobbyDiff))}</small>` : '—'}${host ? `<button class="bb-chip" data-a="pick">${esc(t('band.change', 'Trocar'))}</button>` : ''}</div>
      ${host ? `<div class="bb-chips bb-diffs">${DIFFS.map((d) => `<button class="bb-chip ${d === this.lobbyDiff ? 'on' : ''}" data-d="${d}">${esc(diffName(d))}</button>`).join('')}</div>` : ''}
      <div class="bb-lactions">
        <button class="bb-mid" data-a="emote">${bandIcon('emote', 24)}<span>${esc(t('band.emote', 'Atalhos'))}</span></button>
        ${host ? `<button class="bb-big bb-play" data-a="start" ${allReady ? '' : 'disabled'}>${bandIcon('play', 28)}<span>${esc(peers.length ? t('band.startBand', 'Começar show') : t('band.startBots', 'Tocar com bots'))}</span></button>` : `<button class="bb-big ${net.st.rd ? 'bb-ok' : 'bb-play'}" data-a="ready">${icon('check', { size: 26 })}<span>${esc(net.st.rd ? t('band.readyOn', 'Pronto!') : t('band.ready', 'Estou pronto'))}</span></button>`}
      </div>`;
    box.querySelectorAll<HTMLButtonElement>('.bb-inst').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          net.setInst(b.dataset.i as Instrument);
          bs.inst = b.dataset.i as Instrument;
          persistBand();
          this.renderLobby();
        }),
    );
    box.querySelectorAll<HTMLButtonElement>('.bb-diffs .bb-chip').forEach(
      (b) =>
        (b.onclick = () => {
          this.lobbyDiff = b.dataset.d as Difficulty;
          this.renderLobby();
        }),
    );
    box.querySelectorAll<HTMLButtonElement>('[data-a]').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          const a = b.dataset.a;
          if (a === 'pick') {
            this.pickCb = (song) => {
              this.lobbySong = song;
              this.show('lobby');
            };
            this.show('select');
          } else if (a === 'ready') {
            net.setReady(!net.st.rd);
            this.renderLobby();
          } else if (a === 'emote') {
            openEmoteWheel((code) => {
              net.emote(code);
              const m = this.g.members.find((x) => x.me);
              if (m) {
                m.emote = code;
                m.emoteT = performance.now() / 1000;
              }
            });
          } else if (a === 'start' && this.lobbySong) {
            net.setReady(true);
            const at = Date.now() + 4000;
            net.scheduleStart(at);
            this.startLobby(at);
          }
        }),
    );
  }
  private lastSlotsKey = '';

  private startLobby(at: number): void {
    const net = this.net!;
    const song = this.lobbySong!;
    const slots = this.lobbySlots();
    net.beginPlay(at);
    this.lastSlotsKey = '';
    this.g.startSong(song, INSTRUMENTS[net.st.in], this.lobbyDiff, slots, {
      startEpochMs: at,
      net,
      onEnd: (r) => this.results(r, true),
    });
  }

  /* ------------------------------ visual ------------------------------ */

  private custom(): void {
    const tabs: [CosKind, string, BandIcon][] = [
      ['highway', t('band.cos.tab.highway', 'Pista'), 'highway'],
      ['note', t('band.cos.tab.note', 'Notas'), 'note'],
      ['line', t('band.cos.tab.line', 'Teclas'), 'keys'],
      ['inst', t('band.cos.tab.inst', 'Pintura'), 'guitar'],
      ['fx', t('band.cos.tab.fx', 'Palco'), 'star'],
    ];
    const kind = this.customTab;
    const items = catalog(kind).filter((c) => !c.inst || c.inst === this.customInst);
    const eqId = kind === 'highway' ? bs.eq.highway : kind === 'note' ? bs.eq.note : kind === 'line' ? bs.eq.line : kind === 'fx' ? bs.eq.fx : (bs.eq.inst[this.customInst] ?? 'padrao');
    this.el.innerHTML = `
      ${this.top(t('band.custom', 'Visual'), () => this.show('home'), `<span class="bb-wallet">${icon('coin', { size: 18 })}${fmt(save.coins)} ${icon('gem', { size: 18 })}${fmt(save.gems)}</span>`)}
      <div class="bb-cus">
        <canvas class="bb-preview"></canvas>
        <div class="bb-tabs">${tabs.map(([k, l, ic]) => `<button class="bb-tab ${k === kind ? 'on' : ''}" data-k="${k}">${bandIcon(ic, 20)}<span>${esc(l)}</span></button>`).join('')}</div>
        ${kind === 'inst' || kind === 'highway' || kind === 'note' ? `<div class="bb-insts small">${INSTRUMENTS.map((i) => `<button class="bb-inst ${i === this.customInst ? 'on' : ''}" data-i="${i}">${bandIcon(INST_ICON[i], 22)}</button>`).join('')}</div>` : ''}
        <div class="bb-grid">${items
          .map((c) => {
            const own = owns(c);
            const price = c.price?.coins ? `${icon('coin', { size: 16 })}${fmt(c.price.coins)}` : c.price?.gems ? `${icon('gem', { size: 16 })}${fmt(c.price.gems)}` : '';
            return `<button class="bb-item ${c.id === eqId ? 'eq' : ''} ${own ? '' : 'locked'}" data-id="${esc(c.id)}"><canvas data-prev="${esc(c.id)}"></canvas><b>${esc(cosName(c))}</b><small>${c.id === eqId ? esc(t('band.equipped', 'Equipado')) : own ? esc(t('band.equip', 'Equipar')) : c.pass ? esc(t('band.fromPass', 'Do Passe')) : price}</small></button>`;
          })
          .join('')}</div>
      </div>`;
    // pré-visualizações
    this.drawPreview();
    this.el.querySelectorAll<HTMLCanvasElement>('canvas[data-prev]').forEach((cv) => {
      const c = items.find((i) => i.id === cv.dataset.prev);
      if (c) this.itemPreview(cv, c);
    });
    this.el.querySelectorAll<HTMLButtonElement>('.bb-tab').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          this.customTab = b.dataset.k as CosKind;
          this.show('custom');
        }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('.bb-insts .bb-inst').forEach(
      (b) =>
        (b.onclick = () => {
          tap('light');
          this.customInst = b.dataset.i as Instrument;
          this.show('custom');
        }),
    );
    this.el.querySelectorAll<HTMLButtonElement>('.bb-item').forEach(
      (b) =>
        (b.onclick = () => {
          const c = items.find((i) => i.id === b.dataset.id)!;
          if (!owns(c)) {
            if (c.pass) return this.toast(t('band.passItem', 'Este visual vem do Passe da temporada.'));
            if (!c.price || !canAfford(c.price as { coins?: number; gems?: number })) return this.toast(t('band.noMoney', 'Moedas/gemas insuficientes'));
            if (!spend(c.price as { coins?: number; gems?: number })) return;
            bs.owned.push(`band-${c.kind}-${c.id}`);
            success();
          }
          tap('light');
          if (kind === 'highway') bs.eq.highway = c.id;
          else if (kind === 'note') bs.eq.note = c.id;
          else if (kind === 'line') bs.eq.line = c.id;
          else if (kind === 'fx') bs.eq.fx = c.id;
          else bs.eq.inst[this.customInst] = c.id;
          persistBand();
          this.g.setMenuBand();
          this.show('custom');
        }),
    );
  }

  /** pista em miniatura com o visual atual (para o instrumento escolhido) */
  private drawPreview(): void {
    const cv = this.el.querySelector<HTMLCanvasElement>('.bb-preview');
    if (!cv) return;
    const W = Math.min(380, this.g.w - 32);
    const H = 150;
    const d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * d;
    cv.height = H * d;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const x = cv.getContext('2d')!;
    x.scale(d, d);
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1a0f40');
    g.addColorStop(1, '#2a1660');
    x.fillStyle = g;
    x.fillRect(0, 0, W, H);
    const inst = this.customInst;
    const hw = new Highway();
    const look = lookFor(inst);
    hw.setup(W / 2, 12, H - 30, W * 0.7, W * 0.26, 5, d, inst, look.hw, look.shape, look.line);
    hw.look = 1.6;
    const notes: RNote[] = buildNotes(
      [
        { b: 0.4, lane: 0 },
        { b: 1, lane: 2, len: 1.5 },
        { b: 1.7, lane: 4 },
        { b: 2.4, lane: 1 },
        { b: 3, lane: 3 },
      ],
      120,
      5,
    ).notes;
    notes[0].star = true;
    hw.draw(x, 0, 0.5, notes, 0, false, 0.5, 0, true);
    const ic = instColors(inst);
    x.fillStyle = ic[0];
    x.strokeStyle = '#2a0b5c';
    x.lineWidth = 3;
    x.beginPath();
    x.roundRect(10, H - 40, 34, 28, 8);
    x.fill();
    x.stroke();
    x.fillStyle = ic[1];
    x.beginPath();
    x.arc(27, H - 26, 6, 0, Math.PI * 2);
    x.fill();
  }

  private itemPreview(cv: HTMLCanvasElement, c: CosItem): void {
    const W = 92;
    const H = 58;
    const d = Math.min(2, window.devicePixelRatio || 1);
    cv.width = W * d;
    cv.height = H * d;
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    const x = cv.getContext('2d')!;
    x.scale(d, d);
    x.fillStyle = '#1a0f40';
    x.fillRect(0, 0, W, H);
    const kind = c.kind;
    if (kind === 'highway' || kind === 'line') {
      const ID = INST_DEFAULT;
      const hwItem = kind === 'highway' ? (c.id === 'auto' ? findCos('highway', ID[this.customInst].highway) : c) : findCos('highway', ID[this.customInst].highway);
      const hw = new Highway();
      hw.setup(W / 2, 2, H - 14, W * 0.8, W * 0.3, 4, d, this.customInst, hwItem, 'gem', c.line ?? 'teclas');
      hw.draw(x, 0, 0.5, [], 0, false, 0.4, 0, true);
    } else if (kind === 'note') {
      const shape = c.id === 'auto' ? INST_DEFAULT[this.customInst].note : c.shape;
      x.save();
      x.translate(W / 2, H / 2);
      drawNote(x, (shape ?? 'gem') as never, 30, '#ff5fa2', false, this.customInst);
      x.restore();
    } else if (kind === 'inst') {
      const col = c.c.length >= 2 ? c.c : INST_DEFAULT[this.customInst].c;
      x.fillStyle = col[0];
      x.strokeStyle = '#2a0b5c';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(W / 2, H / 2, 26, 18, -0.3, 0, Math.PI * 2);
      x.fill();
      x.stroke();
      x.fillStyle = col[1];
      x.beginPath();
      x.arc(W / 2, H / 2, 7, 0, Math.PI * 2);
      x.fill();
    } else {
      const cols = ['#ff5fa2', '#ffd23f', '#5ef0ff', '#9be15d', '#c77dff'];
      for (let i = 0; i < 14; i++) {
        x.fillStyle = cols[i % 5];
        const px = 8 + ((i * 37) % 76);
        const py = 8 + ((i * 23) % 42);
        if (c.fx === 'bolhas') {
          x.strokeStyle = '#d8f6ff';
          x.lineWidth = 1.5;
          x.beginPath();
          x.arc(px, py, 3 + (i % 3), 0, Math.PI * 2);
          x.stroke();
        } else if (c.fx === 'fogos') {
          x.strokeStyle = cols[i % 5];
          x.lineWidth = 2;
          x.beginPath();
          x.moveTo(W / 2, H / 2);
          x.lineTo(px, py);
          x.stroke();
        } else x.fillRect(px, py, 5, c.fx === 'confete' ? 3 : 5);
      }
    }
  }

  /* ------------------------------ calibração ------------------------------ */

  private calib(): void {
    const ctx = this.g.ensureAudio();
    this.el.innerHTML = `
      ${this.top(t('band.calib', 'Calibrar'), () => this.show('home'))}
      <div class="bb-calib">
        <p>${esc(t('band.calibHelp', 'Toque no círculo junto com cada batida que você OUVIR.'))}</p>
        <button class="bb-pulse" aria-label="${esc(t('band.tapHere', 'Toque aqui'))}"><span>${esc(t('band.tapHere', 'Toque aqui'))}</span></button>
        <div class="bb-cval"></div>
        <div class="bb-crow">
          <button class="bb-chip" data-d="-5">−5 ms</button>
          <button class="bb-mid" data-a="again">${icon('refresh', { size: 20 })}<span>${esc(t('band.calibAgain', 'Medir de novo'))}</span></button>
          <button class="bb-chip" data-d="5">+5 ms</button>
        </div>
      </div>`;
    const val = this.el.querySelector<HTMLDivElement>('.bb-cval')!;
    const pulse = this.el.querySelector<HTMLButtonElement>('.bb-pulse')!;
    const showVal = (extra = '') => (val.innerHTML = `${esc(t('band.calibVal', 'Ajuste: {n} ms', { n: (bs.calib > 0 ? '+' : '') + bs.calib }))}${extra ? `<small>${esc(extra)}</small>` : ''}`);
    showVal();
    let beats: number[] = [];
    let taps: number[] = [];
    let raf = 0;
    let timer = 0;
    const period = 0.6;
    const run = () => {
      cancelAnimationFrame(raf);
      beats = [];
      taps = [];
      if (!ctx) return;
      const c0 = ctx.currentTime + 0.5;
      const p0 = performance.now() + 500;
      for (let i = 0; i < 16; i++) {
        const tt = c0 + i * period;
        const o = ctx.createOscillator();
        const gn = ctx.createGain();
        o.frequency.value = i % 4 === 0 ? 1320 : 880;
        gn.gain.setValueAtTime(0.0001, tt);
        gn.gain.exponentialRampToValueAtTime(0.5, tt + 0.003);
        gn.gain.exponentialRampToValueAtTime(0.0001, tt + 0.08);
        o.connect(gn).connect(this.g.out ?? ctx.destination);
        o.start(tt);
        o.stop(tt + 0.1);
        beats.push(p0 + i * period * 1000);
      }
      const anim = () => {
        const now = performance.now();
        let k = 0;
        for (const b of beats) if (now >= b && now - b < 200) k = 1 - (now - b) / 200;
        pulse.style.setProperty('--k', k.toFixed(2));
        if (now < beats[beats.length - 1] + 800) raf = requestAnimationFrame(anim);
        else finish();
      };
      raf = requestAnimationFrame(anim);
    };
    const finish = () => {
      if (taps.length < 5) return showVal(t('band.calibFew', 'Poucos toques: tente de novo'));
      const offs = taps
        .map((tp) => {
          let best = 1e9;
          for (const b of beats) if (Math.abs(tp - b) < Math.abs(best)) best = tp - b;
          return best;
        })
        .filter((v) => Math.abs(v) < 300)
        .sort((a, b) => a - b);
      if (offs.length < 4) return showVal(t('band.calibFew', 'Poucos toques: tente de novo'));
      bs.calib = Math.round(offs[Math.floor(offs.length / 2)]);
      persistBand();
      success();
      showVal(t('band.calibSaved', 'Salvo!'));
    };
    pulse.onpointerdown = (e) => {
      e.preventDefault();
      taps.push(performance.now());
      pulse.classList.remove('tap');
      void pulse.offsetWidth;
      pulse.classList.add('tap');
    };
    this.el.querySelectorAll<HTMLButtonElement>('[data-d]').forEach(
      (b) =>
        (b.onclick = () => {
          bs.calib = Math.max(-250, Math.min(250, bs.calib + Number(b.dataset.d)));
          persistBand();
          showVal();
        }),
    );
    this.el.querySelector<HTMLButtonElement>('[data-a="again"]')!.onclick = run;
    timer = window.setTimeout(run, 300);
    this.calibStop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }

  /* ------------------------------ estúdio ------------------------------ */

  private async studio(): Promise<void> {
    this.el.innerHTML = '';
    if (!this.studioMod) this.studioMod = await import('./studio');
    if (this.cur !== 'studio') return;
    this.studioClose = this.studioMod.openStudio(this.g, this.el, () => this.show('home'));
  }

  destroy(): void {
    this.io?.disconnect();
    this.calibStop?.();
    this.studioClose?.();
    this.leaveNet();
    clearTimeout(this.toastT);
  }
}

export { bestStarsAny };
