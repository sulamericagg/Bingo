/* ============================================================
 *  COZINHA MALUCA — entrada do jogo (chunk sob demanda).
 *  Fluxo: escolher gráficos (2D/3D) → restaurante (saguão) →
 *  turno (dia) → resultado → melhorias → próximo dia … (infinito).
 * ============================================================ */
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { tap } from '../../core/haptics';
import { QualityGovernor, detectInitialTier, type QualitySettings } from '../../core/quality';
import { save } from '../../core/storage';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { showRewarded, rewardedAvailable } from '../../services/ads';
import type { PeerState } from '../../services/presence-api';
import { openEmoteWheel, closeEmoteWheel } from '../../social/emotes';
import { icon } from '../../ui/icons';
import { charSprite } from './art';
import { Brain } from './bots';
import { HIRE_COST, MAX_CREW, PACKS, RECIPES, ROLES, UPGRADES, dayParams, roleDesc, roleName, specialName, themeName, type Role, type Special, type Theme } from './data';
import { czIcon } from './icons';
import { Net, type HostCfg } from './net';
import { Render2D } from './render2d';
import { czSave, persistCz } from './save';
import { FX, IK, Sim, mulberry, type Player } from './sim';
import { injectCzCss } from './style';

export interface Renderer {
  me: Player | null;
  setSim(sim: Sim, decor: number): void;
  resize(w: number, h: number, dpr: number, topPad: number, botPad: number): void;
  draw(time: number, dt: number, q: QualitySettings): void;
  onFx(e: { t: FX; x: number; y: number; v: number }): void;
  destroy(): void;
}

const qs = new URLSearchParams(location.search);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    (g?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return !!g;
  } catch {
    return false;
  }
}

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectCzCss();
  const el = document.createElement('div');
  el.className = 'cz-root';
  root.appendChild(el);
  const sv = czSave();
  if (!sv.staff.length && !sv.days) {
    sv.staff = ['cook']; // primeiro ajudante é grátis
    persistCz();
  }
  const gov = new QualityGovernor({ emit: false, persist: false });
  let dead = false;
  let raf = 0;
  let popBack: (() => void) | null = null;
  let mode: '2d' | '3d' = sv.mode === '3d' ? '3d' : '2d';
  const net = new Net();
  let netCode = sv.code || '';
  let onShift: boolean[] = sv.staff.map(() => true);
  let hostGo = 0;
  let cleanup: (() => void) | null = null;

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const clear = () => {
    cleanup?.();
    cleanup = null;
    cancelAnimationFrame(raf);
    el.innerHTML = '';
    closeEmoteWheel();
  };
  const ov = (center = false): HTMLDivElement => {
    const d = document.createElement('div');
    d.className = 'cz-ov' + (center ? ' cz-center' : '');
    el.appendChild(d);
    return d;
  };
  const bind = (root2: HTMLElement, sel: string, fn: (b: HTMLElement) => void) =>
    root2.querySelectorAll<HTMLElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        audio.click();
        fn(b);
      }),
    );

  /* ======================= 1) escolher gráficos ======================= */
  function chooser(): void {
    clear();
    const tier = detectInitialTier();
    const gl = webglOk();
    const d = ov(true);
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.name', 'Cozinha Maluca')}</div>
      <div class="cz-sub">${t('cozinha.choose', 'Como você quer ver a cozinha?')}</div>
      <div class="cz-modes">
        <button class="cz-mode${sv.mode === '2d' ? ' cz-last' : ''}" data-m="2d"><b>2D</b>${czIcon('flat', 54)}<span>${t('cozinha.mode2d', 'Desenhado')}</span><small>${t('cozinha.mode2dD', 'Leve e rápido, roda em qualquer celular')}</small></button>
        <button class="cz-mode cz-3d${sv.mode === '3d' ? ' cz-last' : ''}" data-m="3d"><b>3D</b>${czIcon('cube', 54)}<span>${t('cozinha.mode3d', 'Modelado')}</span><small>${!gl ? t('cozinha.no3dShort', 'Indisponível neste aparelho') : tier <= 1 ? t('cozinha.mode3dWeak', 'Pode ficar lento neste aparelho') : t('cozinha.mode3dD', 'Tudo em 3D, com luz e física. Melhor em celulares fortes')}</small></button>
      </div>
      <button class="cz-btn" data-a="exit">${icon('home', { size: 22 })}${t('cozinha.exit', 'Sair')}</button>`;
    bind(d, '[data-m]', (b) => {
      audio.unlock();
      const m = b.dataset.m as '2d' | '3d';
      if (m === '3d' && !gl) {
        banner(t('cozinha.no3d', '3D não disponível neste aparelho. Abrindo em 2D.'));
        mode = '2d';
      } else mode = m;
      sv.mode = mode;
      persistCz();
      lobby();
    });
    bind(d, '[data-a=exit]', () => quit());
    setBack(() => quit());
  }

  function banner(txt: string, sub = '', ms = 1800): void {
    const b = document.createElement('div');
    b.className = 'cz-banner';
    b.innerHTML = esc(txt) + (sub ? `<small>${esc(sub)}</small>` : '');
    el.appendChild(b);
    setTimeout(() => b.remove(), ms);
  }

  /* ======================= 2) restaurante (saguão) ======================= */
  function crewList(): Role[] {
    const humans = net.online ? net.humans.length : 0;
    const out: Role[] = [];
    sv.staff.forEach((r, i) => {
      if (onShift[i] && out.length + 1 + humans < MAX_CREW) out.push(r);
    });
    return out;
  }
  function wage(n: number): number {
    return n * (6 + sv.day * 2);
  }
  function hostCfg(): HostCfg {
    return { day: sv.day, seed: (sv.day * 7919 + sv.days * 31) >>> 0, crew: 1 + crewList().length + (net.online ? net.humans.length : 0), ups: sv.ups, packs: sv.packs, portrait: window.innerHeight > window.innerWidth, go: hostGo };
  }

  function lobby(): void {
    clear();
    const d = ov();
    const p = dayParams(sv.day, sv.ups);
    const sim = new Sim({ day: sv.day, seed: hostCfg().seed, ups: sv.ups, packs: sv.packs, crew: 1 + crewList().length, portrait: window.innerHeight > window.innerWidth });
    const crew = crewList();
    const isClient = net.online && !net.isHost();
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.name', 'Cozinha Maluca')}</div>
      <div class="cz-row"><span class="cz-pill">${czIcon('hat', 22)}${t('cozinha.day', 'Dia {n}', { n: sv.day })}</span><span class="cz-pill">${icon('coin', { size: 20 })}${fmt(sv.cash)}</span>${sv.bestDay ? `<span class="cz-pill">${icon('trophy', { size: 20 })}${sv.bestDay}</span>` : ''}</div>
      <div class="cz-card">
        <div class="cz-sub" style="margin:0 auto">${themeName(sim.theme)} · ${t('cozinha.goal', 'Meta: {a}', { a: fmt(p.goal[0]) })}</div>
        <div class="cz-note">${t('cozinha.menuToday', 'Cardápio de hoje')}</div>
        <div class="cz-menu-list">${sim.menu.map((r) => `<span>${esc(RECIPES[r].name())}</span>`).join('')}</div>
        <div class="cz-note">${t('cozinha.crew', 'Equipe')} (${1 + crew.length + (net.online ? net.humans.length : 0)}/${MAX_CREW})</div>
        <div class="cz-crew" data-crew></div>
        ${crew.length ? `<div class="cz-note">${t('cozinha.wage', 'Salário dos ajudantes: {n}', { n: wage(crew.length) })}</div>` : ''}
        ${isClient ? `<div class="cz-sub">${t('cozinha.waitingHost', 'Esperando o anfitrião abrir o restaurante...')}</div>` : `<button class="cz-btn cz-green cz-big" data-a="open">${icon('play', { size: 26 })}${t('cozinha.open', 'Abrir restaurante')}</button>`}
        <div class="cz-row">
          <button class="cz-btn cz-gold cz-grow" data-a="shop">${czIcon('cart', 22)}${t('cozinha.shop', 'Melhorias')}</button>
          <button class="cz-btn cz-pink cz-grow" data-a="friends">${czIcon('friends', 22)}${t('cozinha.friends', 'Com amigos')}</button>
        </div>
        <div class="cz-row">
          <button class="cz-btn cz-grow" data-a="gfx">${mode === '3d' ? czIcon('cube', 20) : czIcon('flat', 20)}${t('cozinha.graphics', 'Gráficos')}: ${mode.toUpperCase()}</button>
          <button class="cz-btn cz-grow" data-a="exit">${icon('home', { size: 20 })}${t('cozinha.exit', 'Sair')}</button>
        </div>
        ${net.online ? `<div class="cz-note">${t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length })}${netCode ? ' · #' + esc(netCode) : ''}</div>` : ''}
      </div>`;
    // equipe (slots com retrato)
    const crewEl = d.querySelector<HTMLElement>('[data-crew]')!;
    const slot = (skin: string, role: Role, label: string, on: boolean, idx: number) => {
      const s = document.createElement('div');
      s.className = 'cz-slot' + (on ? ' cz-on' : '');
      const c = charSprite(skin, role, 88);
      const cc = document.createElement('canvas');
      cc.width = 88;
      cc.height = 110;
      cc.getContext('2d')!.drawImage(c, 0, 0);
      s.appendChild(cc);
      s.insertAdjacentHTML('beforeend', `<span>${esc(label)}</span>`);
      if (idx >= 0)
        s.addEventListener('click', () => {
          audio.click();
          onShift[idx] = !onShift[idx];
          lobby();
        });
      crewEl.appendChild(s);
    };
    slot(save.skin, 'cook', t('cozinha.you', 'Você'), true, -1);
    for (const h of net.online ? net.humans : []) slot(h.skin === 'custom' ? 'bloop' : h.skin, 'cook', h.name, true, -1);
    sv.staff.forEach((r, i) => slot(BOT_SKINS[i % BOT_SKINS.length], r, roleName(r) + (onShift[i] ? '' : ' (' + t('cozinha.off', 'folga') + ')'), !!onShift[i], i));
    bind(d, '[data-a=open]', () => {
      hostGo++;
      startDay(hostCfg(), false);
    });
    bind(d, '[data-a=shop]', () => shop('up'));
    bind(d, '[data-a=friends]', () => friends());
    bind(d, '[data-a=gfx]', () => chooser());
    bind(d, '[data-a=exit]', () => quit());
    setBack(() => chooser());
    // online: mantém presença viva e segue o host
    let last = performance.now();
    const tick = (ms: number) => {
      raf = requestAnimationFrame(tick);
      const dt = (ms - last) / 1000;
      last = ms;
      if (!net.ses) return;
      net.sendLobby(net.isHost() ? hostCfg() : null, dt);
      const hs = net.hostState;
      if (hs && !net.isHost()) {
        const cfg = Net.readCfg(hs);
        if (cfg && cfg.go !== lastSeenGo && hs.T !== undefined) {
          lastSeenGo = cfg.go;
          startDay(cfg, true);
        }
      }
    };
    raf = requestAnimationFrame(tick);
    net.onChange = () => {
      // atualiza a contagem sem recriar a tela a cada pacote
      const n = d.querySelector('.cz-note:last-child');
      if (n && net.online) n.textContent = t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) + (netCode ? ' · #' + netCode : '');
    };
  }
  let lastSeenGo = -1;

  function friends(): void {
    clear();
    const d = ov(true);
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.friends', 'Com amigos')}</div>
      <div class="cz-sub">${t('cozinha.codeHint', 'Amigos com o mesmo código cozinham juntos (até 5). Sem código, você entra na cozinha aberta.')}</div>
      <div class="cz-card">
        <input class="cz-input" maxlength="6" inputmode="numeric" placeholder="1234" value="${esc(netCode)}" aria-label="${t('cozinha.code', 'Código da cozinha')}">
        <button class="cz-btn cz-green cz-big" data-a="go">${czIcon('friends', 24)}${t('cozinha.connect', 'Entrar')}</button>
        <div class="cz-note" data-st>${net.online ? t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) : ''}</div>
        <button class="cz-btn" data-a="back">${t('cozinha.back', 'Voltar')}</button>
      </div>`;
    const inp = d.querySelector('input')!;
    bind(d, '[data-a=go]', async () => {
      netCode = inp.value.replace(/[^0-9a-z]/gi, '').slice(0, 6);
      sv.code = netCode;
      persistCz();
      const stEl = d.querySelector('[data-st]')!;
      stEl.textContent = '...';
      net.ses?.leave();
      net.ses = null;
      net.closed = false;
      const ok = await net.connect(netCode);
      if (dead) return;
      stEl.textContent = ok ? t('cozinha.online', 'Online: {n} amigos', { n: net.humans.length }) : t('cozinha.offline', 'Sem internet: só ajudantes robôs');
      if (ok) setTimeout(() => !dead && lobby(), 600);
    });
    bind(d, '[data-a=back]', () => lobby());
    setBack(() => lobby());
  }

  /* ======================= 3) loja / melhorias ======================= */
  function shop(tab: 'up' | 'rec' | 'staff'): void {
    clear();
    const d = ov();
    const head = `<div class="cz-title">${t('cozinha.shop', 'Melhorias')}</div>
      <span class="cz-pill">${icon('coin', { size: 20 })}${fmt(sv.cash)}</span>
      <div class="cz-tabs">
        <button class="cz-btn${tab === 'up' ? ' cz-on' : ''}" data-t="up">${czIcon('pot', 18)}${t('cozinha.upgrades', 'Cozinha')}</button>
        <button class="cz-btn${tab === 'rec' ? ' cz-on' : ''}" data-t="rec">${czIcon('book', 18)}${t('cozinha.recipes', 'Receitas')}</button>
        <button class="cz-btn${tab === 'staff' ? ' cz-on' : ''}" data-t="staff">${czIcon('robot', 18)}${t('cozinha.staff', 'Ajudantes')}</button>
      </div>`;
    let body = '';
    if (tab === 'up') {
      for (const u of UPGRADES) {
        const lv = sv.ups[u.id];
        const cost = Math.round(u.cost(lv));
        const max = lv >= u.max;
        body += `<div class="cz-item"><div class="cz-grow"><b>${esc(u.name())}</b><small>${esc(u.desc())}</small><div class="cz-lv">${Array.from({ length: u.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
          <button class="cz-btn cz-gold" data-u="${u.id}" ${max || sv.cash < cost ? 'disabled' : ''}>${max ? t('cozinha.max', 'Máximo') : icon('coin', { size: 18 }) + fmt(cost)}</button></div>`;
      }
    } else if (tab === 'rec') {
      PACKS.forEach((p, i) => {
        const owned = sv.packs.includes(i);
        const locked = sv.day < p.minDay;
        const list = RECIPES.filter((r) => r.pack === i)
          .map((r) => esc(r.name()))
          .join(', ');
        body += `<div class="cz-item"><div class="cz-grow"><b>${esc(p.name())}</b><small>${list}</small></div>
          ${owned ? `<span class="cz-pill">${icon('check', { size: 18 })}</span>` : locked ? `<span class="cz-pill">${icon('lock', { size: 18 })}${t('cozinha.locked', 'Dia {n}', { n: p.minDay })}</span>` : `<button class="cz-btn cz-gold" data-p="${i}" ${sv.cash < p.cost ? 'disabled' : ''}>${icon('coin', { size: 18 })}${fmt(p.cost)}</button>`}</div>`;
      });
    } else {
      body += `<div class="cz-note">${t('cozinha.staffNote', 'Ajudantes robôs trabalham com você (e com seus amigos). Toque neles no restaurante para dar folga.')}</div>`;
      for (const r of ROLES) {
        const have = sv.staff.filter((x) => x === r).length;
        const cost = HIRE_COST(sv.staff.length);
        const full = sv.staff.length >= MAX_CREW - 1;
        body += `<div class="cz-item"><canvas width="66" height="82" data-r="${r}" style="width:44px;height:55px"></canvas><div class="cz-grow"><b>${esc(roleName(r))}${have ? ' x' + have : ''}</b><small>${esc(roleDesc(r))}</small></div>
          <button class="cz-btn cz-gold" data-h="${r}" ${full || sv.cash < cost ? 'disabled' : ''}>${full ? t('cozinha.max', 'Máximo') : icon('coin', { size: 18 }) + fmt(cost)}</button></div>`;
      }
    }
    d.innerHTML = head + `<div class="cz-card">${body}</div><button class="cz-btn cz-big" style="width:min(380px,94vw)" data-a="back">${t('cozinha.back', 'Voltar')}</button>`;
    d.querySelectorAll<HTMLCanvasElement>('canvas[data-r]').forEach((c) => c.getContext('2d')!.drawImage(charSprite('mint', c.dataset.r as Role, 66), 0, 0));
    bind(d, '[data-t]', (b) => shop(b.dataset.t as 'up' | 'rec' | 'staff'));
    bind(d, '[data-u]', (b) => {
      const u = UPGRADES.find((x) => x.id === b.dataset.u)!;
      const cost = Math.round(u.cost(sv.ups[u.id]));
      if (sv.cash < cost || sv.ups[u.id] >= u.max) return;
      sv.cash -= cost;
      sv.ups[u.id]++;
      persistCz();
      audio.cash();
      tap('medium');
      shop('up');
    });
    bind(d, '[data-p]', (b) => {
      const i = Number(b.dataset.p);
      if (sv.cash < PACKS[i].cost) return;
      sv.cash -= PACKS[i].cost;
      sv.packs.push(i);
      persistCz();
      audio.cash();
      shop('rec');
    });
    bind(d, '[data-h]', (b) => {
      const cost = HIRE_COST(sv.staff.length);
      if (sv.cash < cost || sv.staff.length >= MAX_CREW - 1) return;
      sv.cash -= cost;
      sv.staff.push(b.dataset.h as Role);
      onShift.push(true);
      persistCz();
      audio.cash();
      shop('staff');
    });
    bind(d, '[data-a=back]', () => lobby());
    setBack(() => lobby());
  }

  /* ======================= 4) o turno ======================= */
  async function startDay(cfg: HostCfg, client: boolean): Promise<void> {
    clear();
    net.onChange = null;
    const opts = { day: cfg.day, seed: cfg.seed, ups: cfg.ups, packs: cfg.packs, crew: cfg.crew, portrait: cfg.portrait, client } as ConstructorParameters<typeof Sim>[0];
    const forceTheme = qs.get('cztheme') as Theme | null;
    const forceEv = qs.get('czev') as Special | null;
    if (forceTheme) opts.theme = forceTheme;
    if (forceEv) opts.special = forceEv;
    const sim = new Sim(opts);
    const me = sim.addPlayer(1, save.skin === 'custom' ? t('cozinha.you', 'Você') : t('cozinha.you', 'Você'), save.skin, false, 'cook');
    me.hid = net.h;
    const brains: Brain[] = [];
    const remotes = new Map<number, Player>();
    const lastPick = new Map<number, number>();
    const others = new Map<string, Player>();
    if (!client) {
      if (net.online) for (const h of net.humans) {
        const p = sim.addPlayer(100 + remotes.size, h.name, h.skin === 'custom' ? 'bloop' : h.skin, false, 'cook', true);
        p.hid = h.s.h ?? 0;
        remotes.set(p.hid, p);
      }
      const crew = crewList();
      const nbots = Number(qs.get('czbots') ?? -1);
      const roles: Role[] = nbots >= 0 ? (['cook', 'chopper', 'washer', 'server', 'cook'] as Role[]).slice(0, nbots) : crew;
      roles.forEach((r, i) => {
        const p = sim.addPlayer(10 + i, roleName(r), BOT_SKINS[i % BOT_SKINS.length], true, r);
        brains.push(new Brain(sim, p, mulberry(cfg.seed + i * 977)));
      });
      if (qs.has('czauto')) brains.push(new Brain(sim, me, mulberry(5)));
    } else {
      sim.clientPick = () => net.notePick();
    }
    // depuração/screenshots: turno curto e incêndio forçado
    const dlen = Number(qs.get('czlen') ?? 0);
    if (dlen > 0) (sim.p as { len: number }).len = dlen;
    if (qs.has('czfire')) {
      const pans = sim.st.filter((s) => (s.fx || s.fy) && (s.k === 'pan' || s.k === 'pot' || s.k === 'counter'));
      setTimeout(() => pans.slice(0, 2).forEach((s) => sim.ignite(s)), 4000);
    }
    const mkBot = (i: number, role: Role) => sim.addPlayer(10 + i, roleName(role), BOT_SKINS[i % BOT_SKINS.length], true, role, true);
    const mkHuman = (p: PeerState) => sim.addPlayer(200 + others.size, p.name, p.skin === 'custom' ? 'bloop' : p.skin, false, 'cook', true);

    // canvas + renderizador
    const cv = document.createElement('canvas');
    cv.className = 'cz-cv';
    el.appendChild(cv);
    let rend: Renderer;
    if (mode === '3d') {
      try {
        const m = await import('./render3d');
        if (dead) return;
        rend = await m.createRender3D(el, cv, sim, sv.ups.decor);
      } catch (err) {
        console.warn('[cozinha] 3D falhou', err);
        mode = '2d';
        sv.mode = '2d';
        persistCz();
        banner(t('cozinha.no3d', '3D não disponível neste aparelho. Abrindo em 2D.'));
        const r2 = new Render2D(cv);
        rend = Object.assign(r2, {}) as unknown as Renderer;
      }
    } else rend = new Render2D(cv) as unknown as Renderer;
    rend.me = me;
    rend.setSim(sim, cfg.ups.decor);

    // HUD
    const hud = document.createElement('div');
    hud.className = 'cz-hud';
    hud.innerHTML = `
      <div class="cz-top">
        <button class="cz-btn cz-ic" data-a="pause">${icon('pause', { size: 24 })}</button>
        <span class="cz-pill">${czIcon('hat', 20)}<span data-day></span></span>
        <span class="cz-pill" data-clock>${icon('clock', { size: 20 })}<span></span></span>
        <span class="cz-sp"></span>
        <span class="cz-pill">${icon('coin', { size: 20 })}<span data-cash>0</span></span>
        <button class="cz-btn cz-ic" data-a="emote">${icon('smile', { size: 24 })}</button>
      </div>
      <div class="cz-joy" style="display:none"><i></i></div>
      <div class="cz-acts">
        <button class="cz-act cz-pick" data-b="pick">${czIcon('hand', 34)}<small data-pl>${t('cozinha.pick', 'Pegar')}</small></button>
        <button class="cz-act cz-do" data-b="act">${czIcon('knife', 46)}<small data-al>${t('cozinha.act', 'Ação')}</small></button>
      </div>`;
    el.appendChild(hud);
    const dayEl = hud.querySelector<HTMLElement>('[data-day]')!;
    const clockPill = hud.querySelector<HTMLElement>('[data-clock]')!;
    const clockEl = clockPill.querySelector<HTMLElement>('span')!;
    const cashEl = hud.querySelector<HTMLElement>('[data-cash]')!;
    const joy = hud.querySelector<HTMLElement>('.cz-joy')!;
    const knob = joy.querySelector<HTMLElement>('i')!;
    const actBtn = hud.querySelector<HTMLElement>('[data-b=act]')!;
    const pickBtn = hud.querySelector<HTMLElement>('[data-b=pick]')!;
    const actLabel = hud.querySelector<HTMLElement>('[data-al]')!;
    const pickLabel = hud.querySelector<HTMLElement>('[data-pl]')!;
    dayEl.textContent = t('cozinha.day', 'Dia {n}', { n: cfg.day });

    // tamanho
    const portraitNow = () => window.innerHeight >= window.innerWidth;
    const fit = () => {
      const w = el.clientWidth || window.innerWidth;
      const h = el.clientHeight || window.innerHeight;
      const dpr = Math.min(gov.settings.dprCap, window.devicePixelRatio || 1);
      rend.resize(w, h, dpr, 52, portraitNow() ? 150 : 8);
    };
    fit();
    window.addEventListener('resize', fit);

    // entrada: joystick (metade esquerda) + botões
    const keys = new Set<string>();
    let joyId = -1;
    let jx0 = 0;
    let jy0 = 0;
    let jmx = 0;
    let jmy = 0;
    let actTouch = false;
    let pickPress = false;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      if (joyId >= 0 || e.clientX > el.clientWidth * 0.6) return;
      joyId = e.pointerId;
      jx0 = e.clientX;
      jy0 = e.clientY;
      jmx = jmy = 0;
      joy.style.display = 'block';
      joy.style.left = jx0 + 'px';
      joy.style.top = jy0 + 'px';
      knob.style.transform = '';
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== joyId) return;
      const dx = e.clientX - jx0;
      const dy = e.clientY - jy0;
      const d = Math.hypot(dx, dy);
      const R = 46;
      const k = d > R ? R / d : 1;
      jmx = (dx * k) / R;
      jmy = (dy * k) / R;
      knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== joyId) return;
      joyId = -1;
      jmx = jmy = 0;
      joy.style.display = 'none';
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    const press = (b: HTMLElement, on: boolean) => b.classList.toggle('cz-down', on);
    actBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      actTouch = true;
      press(actBtn, true);
      tap('light');
    });
    const actOff = () => {
      actTouch = false;
      press(actBtn, false);
    };
    actBtn.addEventListener('pointerup', actOff);
    actBtn.addEventListener('pointerleave', actOff);
    actBtn.addEventListener('pointercancel', actOff);
    pickBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pickPress = true;
      press(pickBtn, true);
      tap('light');
    });
    pickBtn.addEventListener('pointerup', () => press(pickBtn, false));
    pickBtn.addEventListener('pointercancel', () => press(pickBtn, false));
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === 'Space' || e.code === 'KeyK') pickPress = true;
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    const blur = () => {
      keys.clear();
      actTouch = false;
      joyId = -1;
      jmx = jmy = 0;
      joy.style.display = 'none';
      if (!client && !net.online) paused = true;
    };
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', blur);

    let paused = false;
    let pauseEl: HTMLElement | null = null;
    const togglePause = (on: boolean) => {
      paused = on && !(net.online && net.humans.length);
      if (on && !pauseEl) {
        pauseEl = document.createElement('div');
        pauseEl.className = 'cz-pause';
        pauseEl.innerHTML = `<div class="cz-title">${t('cozinha.pause', 'Pausado')}</div>
          <button class="cz-btn cz-green cz-big" style="width:240px" data-a="resume">${icon('play', { size: 24 })}${t('cozinha.resume', 'Continuar')}</button>
          <button class="cz-btn cz-big" style="width:240px" data-a="quitday">${t('cozinha.quitDay', 'Encerrar o dia')}</button>`;
        el.appendChild(pauseEl);
        bind(pauseEl, '[data-a=resume]', () => togglePause(false));
        bind(pauseEl, '[data-a=quitday]', () => {
          sim.ended = true;
          togglePause(false);
        });
      } else if (!on && pauseEl) {
        pauseEl.remove();
        pauseEl = null;
        paused = false;
      }
    };
    bind(hud, '[data-a=pause]', () => togglePause(!pauseEl));
    bind(hud, '[data-a=emote]', () =>
      openEmoteWheel((code) => {
        me.emote = code;
        me.emoteT = 3;
        net.emote(code);
      }),
    );
    setBack(() => togglePause(!pauseEl));

    cleanup = () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', blur);
      rend.destroy();
    };

    // contagem
    banner(t('cozinha.day', 'Dia {n}', { n: cfg.day }), sim.theme !== 'classic' ? themeName(sim.theme) : t('cozinha.tip1', 'Pegue ingredientes, prepare e monte no prato!'), 2200);
    let countdown = qs.has('czfast') ? 0 : 2.2;
    let last = performance.now();
    let clockShown = -1;
    let cashShown = -1;
    let actShown = '';
    let endT = 0;
    const startMs = performance.now();
    const fps = { lim: 0 };
    const loop = (ms: number) => {
      raf = requestAnimationFrame(loop);
      const q = gov.settings;
      if (q.fpsCap === 30 && ms - fps.lim < 31) return;
      const frameMs = ms - last;
      fps.lim = ms;
      let dt = frameMs / 1000;
      last = ms;
      if (dt > 0.1) dt = 0.1;
      const w0 = performance.now();
      // entrada
      let mx = jmx;
      let my = jmy;
      if (keys.has('ArrowLeft') || keys.has('KeyA')) mx -= 1;
      if (keys.has('ArrowRight') || keys.has('KeyD')) mx += 1;
      if (keys.has('ArrowUp') || keys.has('KeyW')) my -= 1;
      if (keys.has('ArrowDown') || keys.has('KeyS')) my += 1;
      if (!qs.has('czauto')) {
        me.in.mx = mx;
        me.in.my = my;
        me.in.pick = pickPress;
        me.in.act = actTouch || keys.has('KeyJ') || keys.has('KeyE');
      }
      pickPress = false;
      if (!paused && countdown <= 0) {
        if (client) net.applyHost(sim, me, others, mkBot, mkHuman);
        else if (net.online) net.applyRemotes(sim, remotes, lastPick);
        for (const b of brains) b.update(dt);
        sim.step(dt);
        net.sendGame(sim, me, cfg, dt);
      } else if (countdown > 0 && !paused) countdown -= dt;
      // efeitos/sons
      sim.drainFx((e) => {
        rend.onFx(e);
        switch (e.t) {
          case FX.Serve:
            audio.cash();
            tap('medium');
            break;
          case FX.Wrong:
          case FX.Expire:
            audio.fail();
            break;
          case FX.Fire:
            audio.hit();
            tap('heavy');
            break;
          case FX.Done:
            audio.coin(2);
            break;
          case FX.Pick:
          case FX.Place:
            audio.tick(e.v ? 2 : 0);
            break;
          case FX.Chop:
            audio.tick(1);
            break;
          case FX.Order:
            audio.click();
            break;
          case FX.Event:
            banner(specialName(sim.special), '', 2200);
            audio.siren(1.6);
            break;
        }
      });
      rend.draw(ms / 1000, paused ? 0 : dt, q);
      // HUD barato (só muda texto quando muda)
      const left = Math.max(0, Math.ceil(sim.p.len - sim.time));
      if (left !== clockShown) {
        clockShown = left;
        clockEl.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
        clockPill.classList.toggle('cz-hurry', left <= 15);
      }
      if (sim.cash !== cashShown) {
        cashShown = sim.cash;
        cashEl.textContent = fmt(sim.cash);
      }
      const ctxAct = contextAct(sim, me);
      if (ctxAct !== actShown) {
        actShown = ctxAct;
        actLabel.textContent = ctxAct === 'chop' ? t('cozinha.chop', 'Picar') : ctxAct === 'wash' ? t('cozinha.wash', 'Lavar') : ctxAct === 'spray' ? t('cozinha.spray', 'Apagar') : t('cozinha.act', 'Ação');
        actBtn.classList.toggle('cz-off', !ctxAct);
        actBtn.innerHTML = czIcon(ctxAct === 'wash' ? 'plate' : ctxAct === 'spray' ? 'ext' : 'knife', 46) + actLabel.outerHTML;
        pickLabel.textContent = me.hold ? t('cozinha.drop', 'Soltar') : t('cozinha.pick', 'Pegar');
      }
      const pl = me.hold ? t('cozinha.drop', 'Soltar') : t('cozinha.pick', 'Pegar');
      if (pickLabel.textContent !== pl) pickLabel.textContent = pl;
      gov.sample(frameMs, performance.now() - w0);
      if (sim.ended) {
        endT += dt;
        if (endT === dt) banner(t('cozinha.timeUp', 'Fim do turno!'), '', 1600);
        if (endT > 1.4 || qs.has('czfast')) {
          cancelAnimationFrame(raf);
          results(sim, client, (performance.now() - startMs) / 1000);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __cz?: unknown }).__cz = { sim, me, brains };
  }

  function contextAct(sim: Sim, me: Player): '' | 'chop' | 'wash' | 'spray' {
    if (me.hold?.k === IK.Ext) return 'spray';
    if (me.hold) return '';
    if (me.target < 0) return '';
    const s = sim.st[me.target];
    if (s.k === 'board' && s.item && sim.nextProc(s.item) === 'chop') return 'chop';
    if (s.k === 'sink' && s.n > 0) return 'wash';
    return '';
  }

  /* ======================= 5) resultado ======================= */
  function results(sim: Sim, client: boolean, dur: number): void {
    clear();
    const stars = sim.stars();
    const helpers = sim.players.filter((p) => p.bot && !p.remote).length;
    const w = client ? 0 : Math.min(wage(helpers), Math.floor(sim.cash * 0.4));
    const net$ = Math.max(0, sim.cash - w);
    const coins = Math.max(3, Math.round(sim.cash / 8) + stars * 5);
    const rec = sim.day > sv.bestDay || net$ > sv.bestCash;
    if (!client) {
      sv.cash += net$;
      sv.stars[sim.day] = Math.max(sv.stars[sim.day] ?? 0, stars);
      sv.day = sim.day + 1; // infinito: sempre avança
    }
    sv.days++;
    sv.dishes += sim.served;
    sv.bestDay = Math.max(sv.bestDay, sim.day);
    sv.bestCash = Math.max(sv.bestCash, net$);
    persistCz();
    addCoins(coins);
    reportRun({ game: 'cozinha', score: sim.cash, coins, durationSec: Math.round(dur), won: stars > 0, stats: { dishes: sim.served, days: 1, stars, fires: sim.fires } });
    const d = ov(true);
    const starHtml = [0, 1, 2].map((i) => `<span style="animation-delay:${0.2 + i * 0.25}s;${i < stars ? '' : 'filter:grayscale(1) brightness(.6)'}">${icon('star', { size: 54 })}</span>`).join('');
    d.innerHTML = `
      <div class="cz-title">${t('cozinha.results', 'Fim do dia {n}', { n: sim.day })}</div>
      <div class="cz-stars">${starHtml}</div>
      ${rec ? `<div class="cz-sub" style="color:#ffe14a;font-weight:700">${t('cozinha.record', 'Novo recorde!')}</div>` : ''}
      <div class="cz-card">
        <div class="cz-stat"><span>${t('cozinha.served', 'Pratos servidos')}</span><b>${sim.served}</b></div>
        <div class="cz-stat"><span>${t('cozinha.tips', 'Gorjetas')}</span><b>${fmt(sim.tips)}</b></div>
        <div class="cz-stat"><span>${t('cozinha.missed', 'Clientes que foram embora')}</span><b>${sim.missed}</b></div>
        <div class="cz-stat"><span>${t('cozinha.fires', 'Incêndios')}</span><b>${sim.fires}</b></div>
        ${w ? `<div class="cz-stat"><span>${t('cozinha.wages', 'Salários')}</span><b>-${fmt(w)}</b></div>` : ''}
        <div class="cz-stat"><span>${t('cozinha.earned', 'Caixa do dia')}</span><b>${icon('coin', { size: 18 })}${fmt(net$)}</b></div>
        <div class="cz-stat"><span>${t('cozinha.coins', 'Moedas ganhas')}</span><b>${icon('coins', { size: 18 })}${fmt(coins)}</b></div>
        ${rewardedAvailable() ? `<button class="cz-btn cz-pink" data-a="ad">${icon('video', { size: 22 })}${t('cozinha.double', 'Dobrar moedas com vídeo')}</button>` : ''}
        <button class="cz-btn cz-green cz-big" data-a="next">${icon('play', { size: 24 })}${t('cozinha.next', 'Próximo dia')}</button>
        <button class="cz-btn cz-gold" data-a="shop">${czIcon('cart', 22)}${t('cozinha.shop', 'Melhorias')}</button>
      </div>`;
    audio.record();
    bind(d, '[data-a=ad]', async (b) => {
      b.setAttribute('disabled', '');
      if (await showRewarded()) {
        addCoins(coins);
        audio.cash();
        b.innerHTML = icon('check', { size: 22 }) + '+' + fmt(coins);
      } else b.removeAttribute('disabled');
    });
    bind(d, '[data-a=next]', () => lobby());
    bind(d, '[data-a=shop]', () => shop('up'));
    setBack(() => lobby());
  }

  function quit(): void {
    handle.destroy();
    exit();
  }

  const handle: MiniGameHandle = {
    destroy() {
      if (dead) return;
      dead = true;
      clear();
      setBack(null);
      net.leave();
      el.remove();
    },
    pause() {
      cancelAnimationFrame(raf);
    },
    resume() {
      /* a tela atual recomeça no próximo toque; o turno fica pausado */
    },
  };

  // atalhos de depuração/screenshots: ?czmode=2d|3d&czday=N&czscreen=shop|results|lobby
  const fm = qs.get('czmode');
  const fd = Number(qs.get('czday') ?? 0);
  if (fd > 0) {
    sv.day = fd;
    sv.packs = PACKS.map((_, i) => i).filter((i) => PACKS[i].minDay <= fd);
    if (qs.has('czrich')) sv.cash = Math.max(sv.cash, 5000);
  }
  if (fm === '2d' || fm === '3d') {
    mode = fm;
    const scr = qs.get('czscreen');
    if (scr === 'shop') shop((qs.get('cztab') as 'up' | 'rec' | 'staff') ?? 'up');
    else if (scr === 'lobby') lobby();
    else {
      hostGo++;
      void startDay(hostCfg(), false);
    }
  } else chooser();
  return handle;
}

const BOT_SKINS = ['mint', 'sunny', 'capy', 'ocean', 'kitty'];
