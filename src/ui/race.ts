/**
 * Interface da Corrida Orbital (multiplayer) e do Ranking global.
 * Tudo aqui é independente de src/ui/ui.ts: cria as próprias telas dentro de #ui,
 * esconde/mostra o menu e trata o toque durante a corrida.
 *
 * Integração: main.ts chama `initRace(game)` uma vez, depois de criar a UI.
 * Botões no menu: #btn-race (Corrida) e #btn-ranking (Ranking).
 */
import './race.css';
import { audio } from '../core/audio';
import { addCoins, addGems } from '../core/economy';
import { bus } from '../core/events';
import * as haptics from '../core/haptics';
import { save } from '../core/storage';
import type { Game, RaceProgress } from '../game/game';
import { renderSkinPreview } from '../game/preview';
import { skinById } from '../game/skins';
import { hideBanner, showBanner } from '../services/ads';
import { displayName, ensurePlayer, fetchLeaderboard, initLeaderboard, type LbResponse, type LbScope } from '../services/leaderboard';
import { joinRace, RACE, rewardForPlace, type RacePlayerInfo, type RaceResult, type RaceSession, type StandingRow } from '../services/multiplayer';
import { hydrateIcons, icon } from './icons';

/** Cores das etiquetas por vaga (0..4). */
const SLOT_COLORS = ['#ff5cc8', '#5ef0ff', '#ffcf2e', '#3ee07a', '#b48cff'];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const ordinal = (n: number) => `${n}º`;
const fmtTime = (s: number) => {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

type Phase = 'off' | 'lobby' | 'countdown' | 'race' | 'dead' | 'wait' | 'results';

class RaceUI {
  private root!: HTMLElement;
  private rank!: HTMLElement;
  private phase: Phase = 'off';
  private session: RaceSession | null = null;
  private players: RacePlayerInfo[] = [];
  private you = 0;
  private durationSec = RACE.durationSec;
  private raceT = 0;
  private raceStartLocal = 0;
  private rows: StandingRow[] = [];
  private alive = new Map<number, boolean>();
  private sendTimer = 0;
  private frame = 0;
  private lastProgress: RaceProgress | null = null;
  private rewarded = false;
  private debug = location.search.includes('debug');
  private rkScope: LbScope = 'all';
  private rkCache: Partial<Record<LbScope, LbResponse | null>> = {};

  constructor(private game: Game) {
    this.build();
    this.bind();
  }

  /* ============================== DOM ============================== */

  private build(): void {
    const ui = document.getElementById('ui') ?? document.body;
    this.root = document.createElement('section');
    this.root.id = 'race';
    this.root.className = 'screen race-screen';
    this.root.innerHTML = `
      <div class="rc-hud hidden">
        <div class="rc-top">
          <div class="pill rc-timer">${icon('clock', { size: 22 })}<span id="rc-time">1:00</span></div>
          <div class="rc-score" id="rc-score">0</div>
          <button class="icon-btn rc-quit" id="rc-quit" aria-label="Sair da corrida">${icon('close')}</button>
        </div>
        <ol class="rc-board" id="rc-board"></ol>
        <div class="rc-feed" id="rc-feed"></div>
        <div class="rc-net hidden" id="rc-net">offline</div>
      </div>
      <div class="rc-count hidden" id="rc-count"></div>
      <div class="rc-panel rc-lobby panel hidden" id="rc-lobby">
        <div class="rc-head">
          <span class="plate plate-violet rc-head-ico">${icon('rocket')}</span>
          <div><h2>CORRIDA ORBITAL</h2><p class="muted">5 jogadores · ${RACE.durationSec} segundos</p></div>
        </div>
        <div class="rc-searching" id="rc-searching"><span class="rc-dots"><i></i><i></i><i></i></span><span id="rc-status">Procurando jogadores…</span></div>
        <ul class="rc-slots" id="rc-slots"></ul>
        <div class="rc-prizes">
          <div><b>1º</b>${icon('coin', { size: 18 })}100 ${icon('gem', { size: 18 })}5</div>
          <div><b>2º</b>${icon('coin', { size: 18 })}60</div>
          <div><b>3º</b>${icon('coin', { size: 18 })}40</div>
          <div><b>4º-5º</b>${icon('coin', { size: 18 })}20</div>
        </div>
        <p class="muted rc-tip">Pule de planeta em planeta. Quem fizer mais pontos em ${RACE.durationSec}s vence. Caiu, acabou!</p>
        <button class="btn btn-ghost" id="rc-cancel">Cancelar</button>
      </div>
      <div class="rc-panel rc-dead panel hidden" id="rc-dead">
        <h2>VOCÊ CAIU!</h2>
        <div class="rc-dead-place" id="rc-dead-place">—</div>
        <p class="muted" id="rc-dead-msg">Aguardando o fim da corrida…</p>
      </div>
      <div class="rc-panel rc-results panel hidden" id="rc-results"></div>`;
    ui.appendChild(this.root);

    this.rank = document.createElement('section');
    this.rank.id = 'ranking';
    this.rank.className = 'screen rk-screen';
    this.rank.innerHTML = `
      <div class="panel big rk-panel">
        <header class="panel-head">
          <h2>${icon('trophy')} RANKING</h2>
          <button class="icon-btn close" id="rk-close" aria-label="Fechar">${icon('close')}</button>
        </header>
        <nav class="rk-tabs" id="rk-tabs">
          <button data-scope="all" class="active">${icon('crown', { size: 22 })}Geral</button>
          <button data-scope="week">${icon('calendar', { size: 22 })}Semana</button>
        </nav>
        <div class="rk-body" id="rk-body"></div>
        <div class="rk-me" id="rk-me"></div>
      </div>`;
    ui.appendChild(this.rank);
    hydrateIcons(this.root);
    hydrateIcons(this.rank);
  }

  private $<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T;
  }

  private bind(): void {
    document.getElementById('btn-race')?.addEventListener('click', () => this.open());
    document.getElementById('btn-ranking')?.addEventListener('click', () => this.openRanking());
    this.$('rc-cancel').onclick = () => this.exit();
    this.$('rc-quit').onclick = (e) => {
      e.stopPropagation();
      this.exit();
    };
    this.$('rk-close').onclick = () => this.closeRanking();
    this.rank.addEventListener('click', (e) => {
      if (e.target === this.rank) this.closeRanking();
    });
    this.$('rk-tabs').addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-scope]');
      if (b) this.loadRanking(b.dataset.scope as LbScope);
    });

    // toque durante a corrida (a UI principal só trata o toque no HUD dela)
    this.game.canvas.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'race') return;
      e.preventDefault();
      audio.unlock();
      this.game.input();
    });
    // captura: impede que Espaço no "menu" inicie uma partida normal durante a corrida
    window.addEventListener(
      'keydown',
      (e) => {
        if (this.phase === 'off' || (e.code !== 'Space' && e.code !== 'ArrowUp' && e.code !== 'Escape')) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.code === 'Escape') {
          if (this.phase === 'lobby' || this.phase === 'results') this.exit();
          return;
        }
        if (this.phase === 'race') this.game.input();
      },
      true,
    );
    document.addEventListener(
      'keydown',
      (e) => {
        if (e.code === 'Escape' && this.rank.classList.contains('on')) {
          e.stopImmediatePropagation();
          this.closeRanking();
        }
      },
      true,
    );

    bus.on('race-dead', (p: RaceProgress) => this.onMeDead(p));
  }

  /* ============================== fluxo ============================== */

  open(): void {
    if (this.phase !== 'off') return;
    audio.unlock();
    this.closeRanking();
    document.getElementById('menu')?.classList.remove('on');
    hideBanner();
    this.root.classList.add('on');
    this.showOnly('rc-lobby');
    this.phase = 'lobby';
    this.players = [];
    this.rows = [];
    this.alive.clear();
    this.rewarded = false;
    this.renderSlots([], RACE.lobbyWaitMs);
    this.$('rc-status').textContent = 'Procurando jogadores…';
    ensurePlayer(1500).then((p) => {
      if (this.phase !== 'lobby' || this.session) return;
      this.startSession(p.id, p.name);
    });
  }

  private startSession(id: string, name: string): void {
    this.session = joinRace(
      { id, name, skin: save.skin, debug: this.debug },
      {
        onLobby: (players, ms) => this.onLobby(players, ms),
        onStart: (s) => this.onStart(s.seed, s.countdownMs, s.durationSec, s.players, s.you),
        onTick: (t, rows) => this.onTick(t, rows),
        onEnd: (r) => this.onEnd(r),
        onMode: (online) => this.$('rc-net').classList.toggle('hidden', online || !this.debug),
      },
    );
  }

  /** Volta para o menu (cancela/desiste). */
  exit(): void {
    if (this.phase === 'off') return;
    this.session?.leave();
    this.session = null;
    this.phase = 'off';
    clearInterval(this.sendTimer);
    cancelAnimationFrame(this.frame);
    this.root.classList.remove('on');
    this.$('rc-count').classList.add('hidden');
    this.game.exitRace();
    document.getElementById('menu')?.classList.add('on');
    showBanner();
    bus.emit('race-exit');
  }

  private again(): void {
    this.exit();
    this.open();
  }

  private showOnly(id: string | null): void {
    for (const k of ['rc-lobby', 'rc-dead', 'rc-results']) this.$(k).classList.toggle('hidden', k !== id);
  }

  /* ---------------- sala de espera ---------------- */

  private onLobby(players: RacePlayerInfo[], startsInMs: number): void {
    if (this.phase !== 'lobby') return;
    const before = this.players.length;
    this.players = players;
    this.renderSlots(players, startsInMs);
    if (players.length > before && before > 0) {
      audio.click();
      haptics.tap('light');
    }
    this.$('rc-status').textContent = players.length >= RACE.players ? 'Sala completa!' : 'Procurando jogadores…';
  }

  private renderSlots(players: RacePlayerInfo[], _ms: number): void {
    const ul = this.$('rc-slots');
    const me = this.session?.mySlot ?? 0;
    const sorted = [...players].sort((a, b) => (a.slot === me ? -1 : b.slot === me ? 1 : a.slot - b.slot));
    ul.innerHTML = '';
    for (let i = 0; i < RACE.players; i++) {
      const p = sorted[i];
      const li = document.createElement('li');
      if (!p) {
        li.className = 'rc-slot empty';
        li.innerHTML = `<span class="rc-av"></span><span class="rc-name">Aguardando…</span>`;
      } else {
        li.className = 'rc-slot' + (p.slot === me ? ' me' : '');
        li.style.setProperty('--c', SLOT_COLORS[p.slot % SLOT_COLORS.length]);
        li.innerHTML = `<span class="rc-av"></span><span class="rc-name">${esc(p.name)}</span>${p.slot === me ? '<em class="rc-tag">VOCÊ</em>' : ''}${p.bot ? '<em class="rc-tag bot">BOT</em>' : ''}${icon('check', { size: 22 })}`;
        li.querySelector('.rc-av')!.appendChild(renderSkinPreview(skinById(p.skin), 40, 0.4, { backdrop: false }));
      }
      ul.appendChild(li);
    }
  }

  /* ---------------- largada ---------------- */

  private onStart(seed: number, countdownMs: number, durationSec: number, players: RacePlayerInfo[], you: number): void {
    if (this.phase !== 'lobby') return;
    this.players = players;
    this.you = you;
    this.durationSec = durationSec;
    this.renderSlots(players, 0);
    this.$('rc-status').textContent = 'Preparar…';
    this.phase = 'countdown';
    for (const p of players) this.alive.set(p.slot, true);
    this.game.startRace({
      seed,
      durationSec,
      opponents: players.filter((p) => p.slot !== you).map((p) => ({ slot: p.slot, name: p.name, skin: p.skin, color: SLOT_COLORS[p.slot % SLOT_COLORS.length] })),
    });
    // mostra a sala completa por um instante e passa para o HUD com a contagem
    window.setTimeout(() => {
      if (this.phase !== 'countdown') return;
      this.showOnly(null);
      this.root.querySelector('.rc-hud')!.classList.remove('hidden');
      this.$('rc-time').textContent = fmtTime(durationSec);
      this.$('rc-score').textContent = '0';
      this.rows = players.map((p) => [p.slot, 0, 0, 1, 0]);
      this.renderBoard();
    }, 700);
    const go = performance.now() + countdownMs;
    const steps = [3, 2, 1];
    const el = this.$('rc-count');
    let shown = -1;
    const tick = () => {
      if (this.phase !== 'countdown') return;
      const left = go - performance.now();
      const n = left > 3000 ? -1 : left > 2000 ? 0 : left > 1000 ? 1 : left > 0 ? 2 : 3;
      if (n !== shown && n >= 0) {
        shown = n;
        el.classList.remove('hidden', 'pop');
        void el.offsetWidth;
        el.textContent = n < 3 ? String(steps[n]) : 'JÁ!';
        el.classList.toggle('go', n === 3);
        el.classList.add('pop');
        if (n < 3) {
          audio.click();
          haptics.tap('light');
        } else {
          audio.perfect(1);
          haptics.tap('medium');
        }
      }
      if (left <= 0) return this.go();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private go(): void {
    this.phase = 'race';
    this.game.raceGo();
    this.raceStartLocal = performance.now();
    window.setTimeout(() => this.$('rc-count').classList.add('hidden'), 650);
    clearInterval(this.sendTimer);
    this.sendTimer = window.setInterval(() => this.sendProgress(), 160);
    const loop = () => {
      if (this.phase === 'off' || this.phase === 'results') return;
      const p = this.game.raceProgress;
      this.$('rc-score').textContent = String(p.score);
      // relógio local (o servidor manda o oficial a cada tick)
      const t = Math.max(this.raceT, (performance.now() - this.raceStartLocal) / 1000);
      const left = this.durationSec - t;
      const tm = this.$('rc-time');
      tm.textContent = fmtTime(left);
      tm.parentElement!.classList.toggle('hurry', left <= 10);
      if (left <= 0 && this.phase === 'race') this.timeUp();
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private sendProgress(): void {
    if (!this.session) return;
    const p = this.game.raceProgress;
    this.lastProgress = p;
    this.session.sendState(p.score, p.p, p.alive && this.phase !== 'dead');
  }

  private timeUp(): void {
    this.phase = 'wait';
    this.game.raceStop();
    this.sendProgress();
    const el = this.$('rc-count');
    el.textContent = 'TEMPO!';
    el.classList.remove('hidden', 'pop', 'go');
    void el.offsetWidth;
    el.classList.add('pop', 'go');
    audio.unlock2();
  }

  /* ---------------- durante a corrida ---------------- */

  private onTick(t: number, rows: StandingRow[]): void {
    if (this.phase === 'off' || this.phase === 'results' || this.phase === 'lobby') return;
    this.raceT = t;
    // nosso placar local é mais recente que o do servidor
    const p = this.game.raceProgress;
    this.rows = rows.map((r) => (r[0] === this.you ? [r[0], Math.max(r[1], p.score), p.p, this.phase === 'dead' ? 0 : r[3], r[4]] : r));
    // quedas
    for (const r of rows) {
      if (r[0] === this.you) continue;
      const was = this.alive.get(r[0]);
      if (was && !r[3]) this.feed(`${this.nameOf(r[0])} caiu!`, r[0]);
      this.alive.set(r[0], !!r[3]);
    }
    this.game.setGhosts(rows.filter((r) => r[0] !== this.you).map((r) => ({ slot: r[0], p: r[2], alive: !!r[3] })));
    this.renderBoard();
    if (this.phase === 'dead') this.updateDeadPanel();
  }

  private nameOf(slot: number): string {
    return this.players.find((p) => p.slot === slot)?.name ?? '???';
  }

  private sortedRows(): StandingRow[] {
    return [...this.rows].sort((a, b) => b[1] - a[1] || b[4] - a[4] || a[0] - b[0]);
  }

  private renderBoard(): void {
    const ol = this.$('rc-board');
    const rows = this.sortedRows();
    ol.innerHTML = rows
      .map((r, i) => {
        const pl = this.players.find((p) => p.slot === r[0]);
        const me = r[0] === this.you;
        const c = SLOT_COLORS[r[0] % SLOT_COLORS.length];
        return `<li class="${me ? 'me' : ''}${r[3] ? '' : ' out'}" style="--c:${c}"><b>${i + 1}</b><i></i><span>${esc(me ? 'Você' : (pl?.name ?? '?'))}${this.debug && pl?.bot ? ' <small>bot</small>' : ''}</span><em>${r[3] ? r[1] : icon('close', { size: 14 }) + r[1]}</em></li>`;
      })
      .join('');
  }

  private feed(text: string, slot: number): void {
    const host = this.$('rc-feed');
    const el = document.createElement('div');
    el.className = 'rc-feed-item';
    el.style.setProperty('--c', SLOT_COLORS[slot % SLOT_COLORS.length]);
    el.innerHTML = `${icon('asteroid', { size: 18 })}<span>${esc(text)}</span>`;
    host.appendChild(el);
    while (host.children.length > 3) host.firstElementChild!.remove();
    window.setTimeout(() => el.remove(), 2600);
  }

  private onMeDead(p: RaceProgress): void {
    if (this.phase !== 'race') return;
    this.phase = 'dead';
    this.lastProgress = p;
    this.sendProgress();
    this.showOnly('rc-dead');
    this.updateDeadPanel();
  }

  private updateDeadPanel(): void {
    const rows = this.sortedRows();
    const i = rows.findIndex((r) => r[0] === this.you);
    const left = rows.filter((r) => r[3] && r[0] !== this.you).length;
    this.$('rc-dead-place').innerHTML = `${ordinal(i + 1)} <small>lugar por enquanto</small>`;
    this.$('rc-dead-msg').textContent = left ? `${left} ainda na corrida… aguarde o resultado` : 'Calculando o resultado…';
  }

  /* ---------------- resultado ---------------- */

  private onEnd(results: RaceResult[]): void {
    if (this.phase === 'off' || this.phase === 'results') return;
    this.phase = 'results';
    clearInterval(this.sendTimer);
    cancelAnimationFrame(this.frame);
    this.game.raceStop(true);
    this.$('rc-count').classList.add('hidden');
    const mine = results.find((r) => r.slot === this.you);
    const prog = this.lastProgress ?? this.game.raceProgress;
    // prêmio por colocação + moedas/gemas coletadas na corrida
    const place = mine?.place ?? results.length;
    const rw = rewardForPlace(place);
    const coins = rw.coins + prog.coins;
    const gems = rw.gems + prog.gems;
    if (!this.rewarded) {
      this.rewarded = true;
      addCoins(coins);
      if (gems) addGems(gems);
    }
    if (place === 1) {
      audio.unlock2();
      haptics.success();
    } else audio.cash();

    const title = place === 1 ? 'VITÓRIA!' : place <= 3 ? `${ordinal(place)} LUGAR!` : `${ordinal(place)} LUGAR`;
    const podium = [results[1], results[0], results[2]]
      .map((r, k) => {
        if (!r) return '<div class="rc-pod empty"></div>';
        const pos = [2, 1, 3][k];
        return `<div class="rc-pod p${pos}${r.slot === this.you ? ' me' : ''}"><div class="rc-pod-av" data-skin="${esc(r.skin)}"></div><div class="rc-pod-name">${esc(r.slot === this.you ? 'Você' : r.name)}</div><div class="rc-pod-score">${r.score}</div><div class="rc-pod-base"><b>${pos}</b></div></div>`;
      })
      .join('');
    const list = results
      .map(
        (r) =>
          `<li class="${r.slot === this.you ? 'me' : ''}" style="--c:${SLOT_COLORS[r.slot % SLOT_COLORS.length]}"><b>${ordinal(r.place)}</b><span>${esc(r.slot === this.you ? 'Você' : r.name)}${this.debug && r.bot ? ' <small>bot</small>' : ''}</span><em>${r.score}</em><small class="rc-res-rw">+${r.coins}${icon('coin', { size: 16 })}${r.gems ? ` +${r.gems}${icon('gem', { size: 16 })}` : ''}</small></li>`,
      )
      .join('');
    const el = this.$('rc-results');
    el.innerHTML = `
      <h2 class="rc-res-title ${place === 1 ? 'win' : ''}">${place === 1 ? icon('crown', { size: 34 }) : ''}${title}</h2>
      <div class="rc-podium">${podium}</div>
      <ol class="rc-res-list">${list}</ol>
      <div class="rc-reward">
        <span>Você ganhou</span>
        <b>+${coins}${icon('coin', { size: 26 })}</b>${gems ? `<b>+${gems}${icon('gem', { size: 26 })}</b>` : ''}
      </div>
      ${prog.coins || prog.gems ? `<p class="muted rc-reward-note">${ordinal(place)} lugar: ${rw.coins} moedas${rw.gems ? ` + ${rw.gems} gemas` : ''} · coletadas: ${prog.coins}${prog.gems ? ` + ${prog.gems} gemas` : ''}</p>` : ''}
      <button class="btn btn-play small" id="rc-again">JOGAR DE NOVO</button>
      <div class="rc-row">
        <button class="btn btn-ghost" id="rc-home">${icon('home')} Menu</button>
        <button class="btn btn-ghost" id="rc-rank">${icon('trophy')} Ranking</button>
      </div>`;
    el.querySelectorAll<HTMLElement>('[data-skin]').forEach((d) => d.appendChild(renderSkinPreview(skinById(d.dataset.skin!), 64, 0.4)));
    this.$('rc-again').onclick = () => this.again();
    this.$('rc-home').onclick = () => this.exit();
    this.$('rc-rank').onclick = () => this.openRanking();
    this.root.querySelector('.rc-hud')!.classList.add('hidden');
    this.showOnly('rc-results');
    bus.emit('race-result', { place, coins, gems, results });
  }

  /* ============================== Ranking ============================== */

  openRanking(): void {
    this.rank.classList.add('on');
    this.rkCache = {};
    this.loadRanking(this.rkScope);
  }

  closeRanking(): void {
    this.rank.classList.remove('on');
  }

  private async loadRanking(scope: LbScope): Promise<void> {
    this.rkScope = scope;
    this.rank.querySelectorAll<HTMLElement>('[data-scope]').forEach((b) => b.classList.toggle('active', b.dataset.scope === scope));
    const body = this.$('rk-body');
    const meEl = this.$('rk-me');
    if (!(scope in this.rkCache)) {
      body.innerHTML = `<div class="rk-loading"><span class="rc-dots"><i></i><i></i><i></i></span>Carregando…</div>`;
      meEl.innerHTML = '';
      this.rkCache[scope] = await fetchLeaderboard(scope);
      if (this.rkScope !== scope) return;
    }
    const d = this.rkCache[scope];
    if (!d) {
      body.innerHTML = `<div class="rk-empty">${icon('planet', { size: 64 })}<b>Sem conexão</b><span>O ranking precisa de internet. Seu recorde: <b>${save.best}</b></span><button class="btn btn-ghost" id="rk-retry">${icon('refresh')} Tentar de novo</button></div>`;
      meEl.innerHTML = '';
      this.$('rk-retry').onclick = () => {
        delete this.rkCache[scope];
        this.loadRanking(scope);
      };
      return;
    }
    if (!d.entries.length) {
      body.innerHTML = `<div class="rk-empty">${icon('trophy', { size: 64 })}<b>Ninguém aqui ainda</b><span>Jogue uma partida e seja o primeiro${scope === 'week' ? ' da semana' : ''}!</span></div>`;
    } else {
      const top = d.entries.slice(0, 3);
      const pod = [top[1], top[0], top[2]]
        .map((r, k) => {
          if (!r) return '<div class="rc-pod empty"></div>';
          const pos = [2, 1, 3][k];
          return `<div class="rc-pod p${pos}${r.me ? ' me' : ''}"><div class="rc-pod-av" data-skin="${esc(r.skin)}"></div><div class="rc-pod-name">${esc(r.me ? 'Você' : r.name)}</div><div class="rc-pod-score">${r.score}</div><div class="rc-pod-base"><b>${pos}</b></div></div>`;
        })
        .join('');
      const rest = d.entries
        .slice(3)
        .map((r) => `<li class="${r.me ? 'me' : ''}"><b>${r.rank}</b><span>${esc(r.name)}${r.me ? ' <em class="rc-tag">VOCÊ</em>' : ''}</span><em>${r.score}</em></li>`)
        .join('');
      body.innerHTML = `<div class="rc-podium rk-podium">${pod}</div>${rest ? `<ol class="rk-list">${rest}</ol>` : ''}<p class="muted rk-note">${scope === 'week' ? `Semana ${esc(d.week.split('-W')[1] ?? '')} · zera toda segunda-feira` : 'Melhor pontuação de cada jogador'}</p>`;
      body.querySelectorAll<HTMLElement>('[data-skin]').forEach((el) => el.appendChild(renderSkinPreview(skinById(el.dataset.skin!), 60, 0.4)));
    }
    // linha "Você" fixa embaixo
    const me = d.me;
    const name = esc(displayName());
    meEl.innerHTML = me
      ? `<div class="rk-me-row"><b>${me.rank}º</b><span class="rk-me-av"></span><span class="rk-me-name">${name}<small>Sua posição</small></span><em>${me.score}</em></div>`
      : `<div class="rk-me-row out"><b>—</b><span class="rk-me-av"></span><span class="rk-me-name">${name}<small>${save.best > 0 ? `Recorde ${save.best} · ainda fora do top` : 'Jogue para entrar no ranking!'}</small></span><em></em></div>`;
    meEl.querySelector('.rk-me-av')!.appendChild(renderSkinPreview(skinById(me?.skin ?? save.skin), 34, 0.4, { backdrop: false }));
  }
}

let instance: RaceUI | null = null;

/** Liga a Corrida Orbital e o Ranking (chamar uma vez, depois de criar a UI). */
export function initRace(game: Game): void {
  if (instance) return;
  initLeaderboard();
  instance = new RaceUI(game);
  if (location.search.includes('debug')) (window as unknown as { __race: RaceUI }).__race = instance;
}
