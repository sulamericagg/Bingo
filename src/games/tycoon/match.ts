/* ============================================================
 *  FÁBRICA ESTELAR — partida versus (você + 3 bots/jogadores).
 * ============================================================ */
import { audio } from '../../core/audio';
import { addCoins } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { FpsLimiter, QualityGovernor } from '../../core/quality';
import { save } from '../../core/storage';
import { renderSkinPreview } from '../../game/preview';
import { SKINS, skinById } from '../../game/skins';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { showRewarded } from '../../services/ads';
import type { JoinPresence, PeerState, PresenceSession } from '../../services/presence-api';
import { icon } from '../../ui/icons';
import { botSpeed, botStep, makeBrain, type Brain } from './bots';
import { BOT_NAMES, COFRE, ITEMS, MATCH_SECONDS, PLACE_COINS, PLOT_COLORS, PLOT_H, PLOT_W, TURBO_BONUS, TURBO_INDEX } from './data';
import { fmtShort, FactoryView } from './render';
import { persistTycoon, tycoonSave } from './save';
import { clearStars, Plot, updateStars } from './sim';
import { ISLAND_PAD } from './sprites';

const GAP = 2.2;
const WORLD_W = PLOT_W * 2 + GAP;
const WORLD_H = PLOT_H * 2 + GAP;
/** dificuldades dos 3 bots por nível escolhido */
const DIFF_SETS = [
  [0, 0, 1],
  [0, 1, 1],
  [1, 2, 2],
];

export interface MatchOpts {
  diff: number;
  onExit(): void;
  onAgain(): void;
}

function rngFrom(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function startMatch(root: HTMLElement, opts: MatchOpts, quality: QualityGovernor): MiniGameHandle {
  const el = document.createElement('div');
  el.className = 'ty-root';
  root.appendChild(el);
  const cv = document.createElement('canvas');
  cv.className = 'ty-cv';
  el.appendChild(cv);

  const rnd = rngFrom((Date.now() & 0xffffff) + 7);
  const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
  const skins = SKINS.filter((s) => s.id !== 'custom' && s.id !== save.skin);
  const pos = [
    [0, PLOT_H + GAP],
    [PLOT_W + GAP, PLOT_H + GAP],
    [0, 0],
    [PLOT_W + GAP, 0],
  ];
  clearStars();
  const plots: Plot[] = pos.map(([ox, oy], i) => {
    const me = i === 0;
    const p = new Plot(i, ox, oy, me ? t('tycoon.you', 'Você') : names[i], me ? save.skin || 'bloop' : skins[(rnd() * skins.length) | 0].id, PLOT_COLORS[i], me);
    return p;
  });
  const diffs = DIFF_SETS[Math.max(0, Math.min(2, opts.diff))];
  const brains: (Brain | null)[] = plots.map((_p, i) => (i === 0 ? null : makeBrain(diffs[i - 1], rnd)));
  plots.forEach((p, i) => {
    if (i) p.speed = botSpeed(diffs[i - 1]);
  });
  const me = plots[0];
  // depuração: ?debug&tyspeed=8&tybot (acelera e deixa um bot jogar por você)
  const qs = new URLSearchParams(location.search);
  const DEBUG = qs.has('debug');
  const SPEED = DEBUG ? Math.max(1, Math.min(20, Number(qs.get('tyspeed')) || 1)) : 1;
  const meBrain = DEBUG && qs.has('tybot') ? makeBrain(2, rnd) : null;

  const q = quality.settings;
  const view = new FactoryView(cv, { glows: q.glows, budget: q.particleBudget, fx: () => quality.settings });
  view.me = 0;
  const limiter = new FpsLimiter(q.fpsCap);

  /* ------------------------------ HUD ------------------------------ */
  const hud = document.createElement('div');
  hud.className = 'ty-hud';
  hud.innerHTML = `
    <div class="ty-top">
      <button class="ty-btn ty-ic" data-a="exit" aria-label="${t('tycoon.exit', 'Sair')}">${icon('home', { size: 26 })}</button>
      <div class="ty-pill ty-wallet">${icon('star', { size: 26 })}<span data-v="wallet">0</span></div>
      <div class="ty-pill ty-timer">${icon('clock', { size: 22 })}<span data-v="time">4:30</span></div>
      <button class="ty-btn ty-ic" data-a="view" aria-label="${t('tycoon.overview', 'Ver todas as fábricas')}">${icon('planet', { size: 26 })}</button>
    </div>
    <div class="ty-rank"></div>
    <div class="ty-hint"></div>
    <div class="ty-joy"><i></i></div>`;
  el.appendChild(hud);
  const $ = (s: string) => hud.querySelector(s) as HTMLElement;
  const wWallet = $('[data-v=wallet]');
  const wTime = $('[data-v=time]');
  const wTimer = $('.ty-timer');
  const wRank = $('.ty-rank');
  const wHint = $('.ty-hint');
  const joyEl = $('.ty-joy');
  const joyKnob = joyEl.firstElementChild as HTMLElement;
  wRank.innerHTML = plots
    .map(
      (p) =>
        `<div class="ty-row${p.isPlayer ? ' ty-me' : ''}" data-i="${p.idx}"><b></b><span class="ty-dot" style="background:${p.color}"></span><span class="ty-nm"></span><span data-s></span><i class="ty-bar"></i></div>`,
    )
    .join('');
  const rows = Array.from(wRank.children) as HTMLElement[];
  const rowName = rows.map((r) => r.querySelector('.ty-nm') as HTMLElement);
  const rowScore = rows.map((r) => r.querySelector('[data-s]') as HTMLElement);
  const rowPlace = rows.map((r) => r.querySelector('b') as HTMLElement);
  const rowBar = rows.map((r) => r.querySelector('.ty-bar') as HTMLElement);

  let overview = false;
  hud.querySelector('[data-a=exit]')!.addEventListener('click', () => {
    audio.click();
    destroy();
    opts.onExit();
  });
  hud.querySelector('[data-a=view]')!.addEventListener('click', () => {
    audio.click();
    overview = !overview;
  });

  /* ------------------------------ estado ------------------------------ */
  let phase: 'intro' | 'play' | 'end' | 'podium' = 'intro';
  let phaseT = 0;
  let timeLeft = MATCH_SECONDS;
  let elapsed = 0;
  let destroyed = false;
  let paused = false;
  let raf = 0;
  let last = performance.now();
  let hudT = 0;
  let lastCount = -1;
  let banner: HTMLElement | null = null;
  let winnerIdx = -1;

  const showBanner = (txt: string, ms = 1000) => {
    banner?.remove();
    const b = document.createElement('div');
    b.className = 'ty-banner';
    b.textContent = txt;
    el.appendChild(b);
    banner = b;
    window.setTimeout(() => {
      if (banner === b) {
        b.remove();
        banner = null;
      }
    }, ms);
  };

  /* ------------------------------ entrada ------------------------------ */
  let pid = -1;
  let downX = 0,
    downY = 0,
    joy = false;
  const rect = () => cv.getBoundingClientRect();
  cv.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (phase !== 'play' || pid !== -1) return;
    pid = e.pointerId;
    const r = rect();
    downX = e.clientX - r.left;
    downY = e.clientY - r.top;
    joy = false;
    cv.setPointerCapture?.(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    const r = rect();
    const dx = e.clientX - r.left - downX;
    const dy = e.clientY - r.top - downY;
    const d = Math.hypot(dx, dy);
    if (!joy && d > 14) {
      joy = true;
      joyEl.style.display = 'block';
      joyEl.style.left = downX + 'px';
      joyEl.style.top = downY + 'px';
    }
    if (joy) {
      const m = Math.min(1, d / 40);
      me.vx = (dx / (d || 1)) * m;
      me.vy = (dy / (d || 1)) * m;
      const k = Math.min(d, 34) / (d || 1);
      joyKnob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    }
  });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== pid) return;
    pid = -1;
    if (joy) {
      joy = false;
      me.vx = me.vy = 0;
      me.tx = me.cx;
      me.ty = me.cy;
      joyEl.style.display = 'none';
      joyKnob.style.transform = '';
      return;
    }
    const w = view.toWorld(downX, downY);
    me.tx = Math.min(7.7, Math.max(0.3, w.x - me.ox));
    me.ty = Math.min(9.75, Math.max(0.9, w.y - me.oy));
    // tocar no cofre = ir até ele
    if (Math.abs(me.tx - COFRE.x) < 0.8 && Math.abs(me.ty - COFRE.y) < 0.8) {
      me.tx = COFRE.x;
      me.ty = COFRE.y;
    }
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  /* ------------------------------ presença (online opcional) ------------------------------ */
  let session: PresenceSession | null = null;
  let sendT = 0;
  const peerSlot = new Map<string, number>();
  const lastPeerScore = new Float64Array(4);
  (async () => {
    try {
      const mods = import.meta.glob('../../services/presence.ts');
      const load = mods['../../services/presence.ts'];
      if (!load) return;
      const m = (await load().catch(() => null)) as { joinPresence?: JoinPresence } | null;
      if (!m?.joinPresence || destroyed) return;
      const s = await m.joinPresence('tycoon', { botsIfAlone: 0 });
      if (destroyed) {
        s.leave();
        return;
      }
      session = s;
      s.onPeers(onPeers);
    } catch {
      /* sem online: segue com bots */
    }
  })();
  function onPeers(peers: PeerState[]): void {
    if (phase === 'podium') return;
    const seen = new Set<string>();
    for (const pr of peers) {
      if (pr.bot) continue;
      seen.add(pr.id);
      let slot = peerSlot.get(pr.id);
      if (slot === undefined) {
        const used = new Set(peerSlot.values());
        slot = [3, 2, 1].find((k) => !used.has(k));
        if (slot === undefined) continue;
        peerSlot.set(pr.id, slot);
        const p = plots[slot];
        p.remote = true;
        p.name = String(pr.name || '').slice(0, 14) || t('tycoon.player', 'Jogador');
        p.skin = pr.skin && pr.skin !== 'custom' ? pr.skin : p.skin;
        view.rebuildFloors(plots);
        rowName[slot].textContent = p.name;
      }
      const p = plots[slot];
      const st = pr.s || {};
      if (typeof st.x === 'number') {
        p.tx = st.x;
        p.ty = st.y;
      }
      if (typeof st.m === 'number') {
        for (let i = 0; i < ITEMS.length; i++) if (!p.built[i] && Math.floor(st.m / 2 ** i) % 2 === 1) p.buildNow(i, elapsed, view);
      }
      if (typeof st.sc === 'number') {
        p.score = Math.max(p.score, st.sc);
        lastPeerScore[slot] = st.sc;
      }
      if (typeof st.w === 'number') p.wallet = st.w;
    }
    for (const [id, slot] of peerSlot) {
      if (seen.has(id)) continue;
      peerSlot.delete(id);
      plots[slot].remote = false; // o bot assume o lote de onde parou
    }
  }

  /* ------------------------------ layout ------------------------------ */
  let cssW = 0,
    cssH = 0;
  const resize = () => {
    cssW = el.clientWidth || window.innerWidth;
    cssH = el.clientHeight || window.innerHeight;
    view.resize(cssW, cssH, quality.settings.dprCap, 9.4, plots);
  };
  resize();
  window.addEventListener('resize', resize);
  const overviewZoom = () => Math.min(view.W / ((WORLD_W + ISLAND_PAD * 2 + 0.4) * view.S), (view.H * 0.8) / ((WORLD_H + 2.2) * view.S));
  view.zoom = overviewZoom();
  view.camX = WORLD_W / 2;
  view.camY = WORLD_H / 2;

  /* ------------------------------ ranking ------------------------------ */
  const order = [0, 1, 2, 3];
  function ranking(): number[] {
    order.sort((a, b) => {
      const fa = plots[a].finished ? 1 : 0;
      const fb = plots[b].finished ? 1 : 0;
      if (fa !== fb) return fb - fa;
      if (fa && fb) return plots[a].builtAt[TURBO_INDEX] - plots[b].builtAt[TURBO_INDEX];
      return plots[b].score - plots[a].score;
    });
    return order;
  }

  function updateHud(): void {
    wWallet.textContent = fmtShort(me.wallet);
    const s = Math.max(0, Math.ceil(timeLeft));
    wTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    wTimer.classList.toggle('ty-hurry', phase === 'play' && s <= 15);
    if (phase === 'play' && s <= 5 && s !== lastCount && s > 0) {
      lastCount = s;
      audio.click();
    }
    const ord = ranking();
    const top = Math.max(1, plots[ord[0]].score);
    ord.forEach((pi, place) => {
      const r = rows[pi];
      r.style.transform = `translateY(${(place - pi) * (r.offsetHeight + 3)}px)`;
      rowPlace[pi].textContent = String(place + 1);
      rowName[pi].textContent = plots[pi].name;
      rowScore[pi].textContent = fmtShort(plots[pi].score);
      rowBar[pi].style.width = `${(plots[pi].score / top) * 100}%`;
    });
    // dica contextual
    let hint = '';
    if (phase === 'play') {
      let cheapest = Infinity;
      for (let i = 0; i < ITEMS.length; i++) if (me.available(i)) cheapest = Math.min(cheapest, ITEMS[i].cost);
      if (elapsed < 6) hint = t('tycoon.hint.start', 'Toque no chão para andar. Pise nos botões verdes para construir!');
      else if (me.wallet < cheapest && me.bank >= Math.min(cheapest, 15) && me.bank >= 1)
        hint = t('tycoon.hint.cofre', 'Passe no cofre dourado para pegar suas estrelas!');
      else if (me.available(TURBO_INDEX)) hint = t('tycoon.hint.turbo', 'Junte estrelas e lance o Foguete TURBO para vencer!');
      else if (elapsed < 20) hint = t('tycoon.hint.build', 'Mais máquinas = mais estrelas. Construa a fábrica mais brilhante!');
    }
    if (wHint.textContent !== hint) wHint.textContent = hint;
    wHint.style.opacity = hint ? '1' : '0';
  }

  /* ------------------------------ laço ------------------------------ */
  function frame(nowMs: number): void {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);
    if (paused) {
      last = nowMs;
      return;
    }
    if (!limiter.shouldRender(nowMs)) return;
    const frameMs = nowMs - last;
    const dt = Math.max(0, Math.min(0.05, frameMs / 1000));
    last = nowMs;
    const t0 = performance.now();
    for (let k = 0; k < (phase === 'play' ? SPEED : 1); k++) step(dt);
    view.draw(plots, dt, elapsed);
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.2;
      updateHud();
    }
    if (!document.hidden) quality.sample(frameMs, performance.now() - t0);
  }

  function step(dt: number): void {
    phaseT += dt;
    if (phase === 'intro') {
      const k = Math.min(1, Math.max(0, (phaseT - 1.2) / 1.3));
      const e = k * k * (3 - 2 * k);
      const oz = overviewZoom();
      view.zoom = oz + (1 - oz) * e;
      view.camX = WORLD_W / 2 + (me.ox + me.cx - WORLD_W / 2) * e;
      view.camY = WORLD_H / 2 + (me.oy + me.cy - 1.2 - WORLD_H / 2) * e;
      const c = Math.ceil(3 - phaseT + 0.0);
      if (phaseT < 3 && String(c) !== banner?.textContent && phaseT > 0.1) {
        showBanner(String(c), 900);
        audio.click();
      }
      if (phaseT >= 3) {
        phase = 'play';
        phaseT = 0;
        showBanner(t('tycoon.go', 'Construa!'), 900);
        audio.perfect(3);
      }
      for (const p of plots) p.update(dt, elapsed, null, false);
      return;
    }
    if (phase === 'play') {
      elapsed += dt;
      timeLeft -= dt;
      if (meBrain) botStep(me, meBrain, dt, elapsed, view);
      else {
        me.stepWalker(dt, joy);
        me.update(dt, elapsed, view);
      }
      for (let i = 1; i < 4; i++) {
        const p = plots[i];
        if (p.remote) {
          p.stepWalker(dt, false);
          p.update(dt, elapsed, view);
        } else botStep(p, brains[i]!, dt, elapsed, view);
      }
      updateStars(plots, dt, view);
      // online: envia o estado ~5x/s
      sendT -= dt;
      if (session && sendT <= 0) {
        sendT = 0.2;
        session.send({ x: me.cx, y: me.cy, m: me.mask(), sc: Math.floor(me.score), w: Math.floor(me.wallet) });
      }
      const fin = plots.find((p) => p.finished);
      if (fin || timeLeft <= 0) {
        timeLeft = Math.max(0, timeLeft);
        winnerIdx = fin ? fin.idx : -1;
        phase = 'end';
        phaseT = 0;
        me.vx = me.vy = 0;
        joyEl.style.display = 'none';
        pid = -1;
        if (fin) {
          view.shake = 1;
          showBanner(fin === me ? t('tycoon.turboYou', 'TURBO! Você venceu!') : t('tycoon.turboOther', '{n} lançou o foguete!', { n: fin.name }), 2400);
        } else showBanner(t('tycoon.timeUp', 'Tempo!'), 2000);
        audio.unlock2();
        updateHud();
      }
      // câmera
      let tz = 1;
      let cx = me.ox + 4 + (me.cx - 4) * 0.25;
      let cy = me.oy + me.cy - 1.2;
      if (overview) {
        tz = overviewZoom();
        cx = WORLD_W / 2;
        cy = WORLD_H / 2;
      }
      const a = 1 - Math.exp(-dt * 6);
      view.zoom += (tz - view.zoom) * a;
      // limita a câmera ao mundo
      const hw = view.W / 2 / (view.S * view.zoom);
      const hh = view.H / 2 / (view.S * view.zoom);
      const minX = -ISLAND_PAD + hw;
      const maxX = WORLD_W + ISLAND_PAD - hw;
      cx = minX > maxX ? WORLD_W / 2 : Math.min(maxX, Math.max(minX, cx));
      const minY = -ISLAND_PAD - 1.5 + hh;
      const maxY = WORLD_H + 1.4 - hh;
      cy = minY > maxY ? WORLD_H / 2 : Math.min(maxY, Math.max(minY, cy));
      view.camX += (cx - view.camX) * a;
      view.camY += (cy - view.camY) * a;
      return;
    }
    if (phase === 'end') {
      for (const p of plots) p.update(dt, elapsed, null, false);
      updateStars(plots, dt, null);
      if (winnerIdx >= 0) {
        const w = plots[winnerIdx];
        const a = 1 - Math.exp(-dt * 3);
        view.camX += (w.ox + 4 - view.camX) * a;
        view.camY += (w.oy + 2 - view.camY) * a;
        if (phaseT > 0.4 && phaseT < 0.5) view.confetti(w.ox + 4, w.oy + 1, 50);
      }
      if (phaseT > 2.6) {
        phase = 'podium';
        showPodium();
      }
    }
  }

  /* ------------------------------ pódio ------------------------------ */
  function showPodium(): void {
    const ord = ranking().slice();
    const place = ord.indexOf(0) + 1;
    const won = place === 1;
    let coins = PLACE_COINS[place - 1] + (me.finished ? TURBO_BONUS : 0);
    addCoins(coins);
    const ts = tycoonSave();
    ts.matches++;
    if (won) ts.wins++;
    ts.best = Math.max(ts.best, Math.floor(me.score));
    persistTycoon();
    reportRun({
      game: 'tycoon',
      score: Math.floor(me.score),
      coins,
      durationSec: Math.round(elapsed),
      won,
      place,
      stats: { built: me.nBuilt, turbo: me.finished ? 1 : 0 },
    });
    session?.leave();
    session = null;
    if (won) success();
    else tap('medium');
    audio.cash();

    hud.style.display = 'none';
    const ov = document.createElement('div');
    ov.className = 'ty-ov';
    const title = won ? t('tycoon.win', 'Você venceu!') : t('tycoon.place', '{n}º lugar!', { n: place });
    ov.innerHTML = `
      <div class="ty-title">${title}</div>
      <div class="ty-sub">${t('tycoon.made', 'Sua fábrica produziu {n} estrelas!', { n: fmtShort(me.score) })}</div>
      <div class="ty-pod"></div>
      <div class="ty-list"></div>
      <div class="ty-reward">${icon('coin', { size: 32 })}<span data-v="coins">+${fmt(coins)}</span></div>
      <div class="ty-actions">
        <button class="ty-btn ty-pink" data-a="ad">${icon('video', { size: 22 })}${t('tycoon.double', 'Dobrar')}</button>
      </div>
      <div class="ty-actions">
        <button class="ty-btn" data-a="exit">${icon('home', { size: 22 })}${t('tycoon.exit', 'Sair')}</button>
        <button class="ty-btn ty-green" data-a="again">${icon('refresh', { size: 22 })}${t('tycoon.again', 'Jogar de novo')}</button>
      </div>`;
    const pod = ov.querySelector('.ty-pod') as HTMLElement;
    const heights = [150, 110, 80];
    const cols = ['linear-gradient(#fff3a0,#ffcf2e 50%,#e98f00)', 'linear-gradient(#ffffff,#dcd6f0 50%,#9b92bf)', 'linear-gradient(#ffd8a8,#ff9a2e 50%,#c45a10)'];
    const small = (el.clientHeight || 640) < 680;
    for (const pi of [1, 0, 2]) {
      const p = plots[ord[pi]];
      const st = document.createElement('div');
      st.className = 'ty-step';
      const cvs = renderSkinPreview(skinById(p.skin), small ? 70 : 90, 0.4, { backdrop: false, mood: pi === 0 ? 'happy' : 'idle' });
      st.appendChild(cvs);
      const b = document.createElement('div');
      b.className = 'ty-block';
      b.style.height = `${heights[pi] * (small ? 0.75 : 1)}px`;
      b.style.background = cols[pi];
      b.style.animationDelay = `${0.15 * (2 - pi)}s`;
      b.innerHTML = `<b>${pi + 1}</b><small></small>`;
      (b.querySelector('small') as HTMLElement).textContent = p.name;
      st.appendChild(b);
      pod.appendChild(st);
    }
    const list = ov.querySelector('.ty-list') as HTMLElement;
    ord.forEach((pi, k) => {
      const p = plots[pi];
      const r = document.createElement('div');
      r.className = 'ty-row' + (p.isPlayer ? ' ty-me' : '');
      r.innerHTML = `<b>${k + 1}</b><span class="ty-dot" style="background:${p.color}"></span><span class="ty-nm"></span><span>${p.finished ? icon('rocket', { size: 18 }) : ''}${fmtShort(p.score)}</span>`;
      (r.querySelector('.ty-nm') as HTMLElement).textContent = p.name;
      list.appendChild(r);
    });
    const adBtn = ov.querySelector('[data-a=ad]') as HTMLButtonElement;
    adBtn.addEventListener('click', async () => {
      adBtn.disabled = true;
      const ok = await showRewarded();
      if (ok && !destroyed) {
        addCoins(coins);
        coins *= 2;
        (ov.querySelector('[data-v=coins]') as HTMLElement).textContent = '+' + fmt(coins);
        audio.cash();
        adBtn.remove();
      } else adBtn.disabled = false;
    });
    ov.querySelector('[data-a=exit]')!.addEventListener('click', () => {
      audio.click();
      destroy();
      opts.onExit();
    });
    ov.querySelector('[data-a=again]')!.addEventListener('click', () => {
      audio.click();
      destroy();
      opts.onAgain();
    });
    el.appendChild(ov);
  }

  const onVis = () => {
    if (document.hidden) paused = true;
    else paused = false;
  };
  document.addEventListener('visibilitychange', onVis);

  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVis);
    session?.leave();
    session = null;
    view.clearFx();
    clearStars();
    el.remove();
  }

  updateHud();
  raf = requestAnimationFrame(frame);
  return {
    destroy,
    pause: () => (paused = true),
    resume: () => {
      paused = false;
      last = performance.now();
    },
  };
}

/** (debug) estado interno para testes */
export const __test = { WORLD_W, WORLD_H };
