/* ============================================================
 *  BLOOP PINK — entrada do jogo (chunk sob demanda).
 *  Tela de início padrão: modo (Minha Loja · Fábrica · Mercadinho em breve),
 *  3 espaços salvos por modo, JOGAR. Save novo → abertura de cinema (pulável).
 *  Pausa pelo botão/voltar. Moedas do app no fim de cada dia (reportRun).
 * ============================================================ */
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { detectInitialTier, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { clearNotify, notify, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { openStartMenu, smDrawBloop, type SmDraw, type SmPage } from '../../ui/startmenu';
import { enterGame } from '../../audio';
import { BRAND_NAME, drawBrandLogo } from './brand';
import { money } from './catalog';
import { ic } from './icons';
import { dropSlot, getFactory, getShop, newFactory, newShop, putFactory, putShop, selSlot, setSel, slots, type FactorySave, type Mode, type ShopSave } from './save';
import { injectCss } from './style';
import './audio';
import type { Shop } from './shop';
import type { Factory } from './factory';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
/** a abertura toca em todo save novo; nunca com ?intro=0 nem em navegador automatizado (salvo ?intro=1) */
function introAllowed(): boolean {
  const q = location.search;
  if (/[?&]intro=0/.test(q)) return false;
  if (/[?&]intro=1/.test(q)) return true;
  if (navigator.webdriver) return false;
  try {
    return localStorage.getItem('bw-intro') !== '0';
  } catch {
    return true;
  }
}

let mode: Mode = 'shop';

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectCss();
  enterGame('pink');
  const el = document.createElement('div');
  el.className = 'pk-root';
  root.appendChild(el);
  let game: Shop | Factory | null = null;
  let slot = 0;
  let popBack: (() => void) | null = null;
  let dead = false;
  let menuEl: HTMLElement | null = null;
  let runStart = performance.now();
  const forced = /[?&]pktier=(\d)/.exec(location.search);
  const tier: Tier = forced ? (Math.min(3, +forced[1]) as Tier) : detectInitialTier();
  setNotifyTop(54);

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const saveGame = () => {
    const g = game;
    if (!g) return;
    if (mode === 'shop') putShop(slot, (g as Shop).toSave());
    else putFactory(slot, (g as Factory).toSave());
  };
  const endGame = () => {
    if (game) {
      saveGame();
      game.dispose();
      game = null;
    }
    clearNotify();
  };
  const quit = () => {
    endGame();
    setBack(null);
    exit();
  };

  /* ------------------------------ menu ------------------------------ */
  function menu(): void {
    endGame();
    menuEl?.remove();
    audio.applySettings();
    enterGame('pink');
    const sm = openStartMenu(el, {
      game: 'pink',
      onBack: quit,
      build: (p: SmPage) => {
        p.cards(
          [
            { id: 'shop', icon: ic('store', 56), label: t('pink.mode.shop', 'Minha Loja'), color: '#ffd3e6', sel: mode === 'shop', onTap: () => ((mode = 'shop'), sm.refresh()) },
            { id: 'factory', icon: ic('factory', 56), label: t('pink.mode.factory', 'Fábrica'), color: '#e3d6ff', sel: mode === 'factory', onTap: () => ((mode = 'factory'), sm.refresh()) },
            { id: 'grocery', icon: ic('grocery', 56), label: t('pink.mode.grocery', 'Mercadinho'), color: '#d9f5c8', badge: t('pink.soon', 'em breve'), lock: true, disabled: true },
          ],
          { size: 'small' },
        );
        const list = slots(mode);
        const cur = selSlot(mode);
        slot = cur;
        p.slots(
          list.map((s, i) => {
            const d = s.data as (ShopSave & FactorySave) | null;
            return {
              empty: !d,
              name: d ? (mode === 'shop' ? t('pink.slot', 'Loja {n}', { n: i + 1 }) : t('pink.slotF', 'Fábrica {n}', { n: i + 1 })) : undefined,
              progress: d ? `${t('pink.dayShort', 'Dia {n}', { n: d.day })} · ★${d.lvl}` : undefined,
              progressIcon: ic('sun', 16),
              last: s.last,
              thumb: d ? slotThumb(mode, d.lvl, d.money) : undefined,
              color: mode === 'shop' ? '#ffc6de' : '#d6c6ff',
            };
          }),
          {
            sel: cur,
            newLabel: mode === 'shop' ? t('pink.newShop', 'Nova loja') : t('pink.newFactory', 'Nova fábrica'),
            onSelect: (i) => {
              setSel(mode, i);
              sm.refresh();
            },
            onOpen: (i) => {
              setSel(mode, i);
              void start(i, !list[i].data);
            },
            onDelete: (i) => {
              dropSlot(mode, i);
              sm.refresh();
            },
          },
        );
        const has = !!list[cur]?.data;
        const d = list[cur]?.data as (ShopSave & FactorySave) | null;
        if (has && d) p.play({ label: t('pink.cont', 'Continuar'), sub: `${t('pink.dayShort', 'Dia {n}', { n: d.day })} · ★${d.lvl}`, tone: 'green', onTap: () => void start(cur, false) });
        else p.play({ say: mode === 'shop' ? t('pink.newShop', 'Nova loja') : t('pink.newFactory', 'Nova fábrica'), onTap: () => void start(cur, true) });
      },
    });
    menuEl = sm.el;
    setBack(() => sm.back());
  }

  function slotThumb(m: Mode, lvl: number, cash: number): SmDraw {
    return (x, w, h, time) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, m === 'shop' ? '#ffe3ef' : '#ece4ff');
      g.addColorStop(1, '#ffffff');
      x.fillStyle = g;
      x.fillRect(0, 0, w, h);
      drawBrandLogo(x, w / 2, h * 0.22, h * 0.17);
      x.fillStyle = '#b03a74';
      x.font = `700 ${Math.round(h * 0.12)}px sans-serif`;
      x.textAlign = 'center';
      x.fillText(`★${lvl} · ${money(cash)}`, w / 2, h * 0.92);
      smDrawBloop(x, w / 2, h * 0.58 + Math.sin(time * 3) * 2, h * 0.16, time, 1);
    };
  }

  function loading(): { el: HTMLDivElement; set(v: number): void } {
    const l = document.createElement('div');
    l.className = 'pk-ov';
    l.style.background = 'linear-gradient(#ffe3ef,#ffc6de)';
    l.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;font-weight:800;color:#b03a74"><canvas width="360" height="80" style="width:270px;height:60px"></canvas><div>${esc(t('pink.loading', 'Arrumando a loja…'))}</div><div style="width:200px;height:10px;border-radius:5px;background:#fff;overflow:hidden"><b style="display:block;height:100%;width:0;background:#ff5fa2;transition:width .2s"></b></div></div>`;
    el.appendChild(l);
    const cv = l.querySelector('canvas') as HTMLCanvasElement;
    drawBrandLogo(cv.getContext('2d')!, 180, 40, 56);
    return { el: l, set: (v) => ((l.querySelector('b') as HTMLElement).style.width = Math.round(v * 100) + '%') };
  }

  async function start(i: number, fresh: boolean): Promise<void> {
    if (!webglOk()) {
      notify(t('pink.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    slot = i;
    setSel(mode, i);
    if (fresh && introAllowed()) {
      menuEl?.remove();
      menuEl = null;
      setBack(null);
      try {
        const m = await import('./intro/cinematic');
        await m.playIntro(el);
      } catch (e) {
        console.warn('[pink] intro', e);
      }
      if (dead) return;
    }
    endGame();
    menuEl?.remove();
    menuEl = null;
    const ld = loading();
    ld.set(0.2);
    await frame();
    await frame();
    if (dead) return;
    try {
      if (mode === 'shop') {
        const sv = fresh ? newShop() : getShop(i) ?? newShop();
        if (fresh) putShop(i, sv);
        const { Shop } = await import('./shop');
        ld.set(0.5);
        await frame();
        game = new Shop({
          root: el,
          tier,
          save: sv,
          onPause: pause,
          onSave: (s) => putShop(slot, s),
          onCoins: (n) => {
            addCoins(n);
            reportRun({ game: 'pink', score: Math.round(sv.money), coins: n, durationSec: Math.round((performance.now() - runStart) / 1000), won: true, stats: { day: sv.day, level: sv.lvl, customers: sv.totalCust } });
            runStart = performance.now();
          },
        });
      } else {
        const sv = fresh ? newFactory() : getFactory(i) ?? newFactory();
        if (fresh) putFactory(i, sv);
        const { Factory } = await import('./factory');
        ld.set(0.5);
        await frame();
        game = new Factory({
          root: el,
          tier,
          save: sv,
          onPause: pause,
          onSave: (s) => putFactory(slot, s),
          onCoins: (n) => {
            addCoins(n);
            reportRun({ game: 'pink', score: sv.shipped, coins: n, durationSec: Math.round((performance.now() - runStart) / 1000), won: true, stats: { day: sv.day, level: sv.lvl, shipped: sv.shipped } });
            runStart = performance.now();
          },
        });
      }
    } catch (e) {
      console.error('[pink]', e);
      ld.el.remove();
      notify(t('pink.err', 'Ops! Não deu para abrir a loja.'), { kind: 'bad' });
      menu();
      return;
    }
    ld.set(1);
    await frame();
    ld.el.remove();
    runStart = performance.now();
    setBack(onBack);
  }

  function onBack(): void {
    if (game?.back()) return;
    pause();
  }

  /* ------------------------------ pausa ------------------------------ */
  function pause(): void {
    const g = game;
    if (!g) return;
    if (g.hud.overlay) {
      g.hud.closePanel();
      g.setPaused(false);
      return;
    }
    g.setPaused(true);
    const d = g.hud.panel(`
      <h2>${ic('pause', 30)}${esc(t('pink.paused', 'Pausa'))}</h2>
      <div style="font-weight:700">${esc(BRAND_NAME)} · ${esc(mode === 'shop' ? t('pink.mode.shop', 'Minha Loja') : t('pink.mode.factory', 'Fábrica'))}</div>
      <div class="pk-row">
        <button class="pk-b g" data-a="go">${ic('check', 22)}${esc(t('pink.resume', 'Continuar'))}</button>
        <button class="pk-b w" data-a="cam">${ic('house', 22)}${esc(t('pink.cam', 'Câmera'))}</button>
        <button class="pk-b w" data-a="menu">${ic('store', 22)}${esc(t('pink.menu', 'Menu'))}</button>
        <button class="pk-b o" data-a="exit">${ic('close', 22)}${esc(t('pink.saveExit', 'Salvar e sair'))}</button>
      </div>`);
    const close = () => {
      g.hud.closePanel();
      g.setPaused(false);
      setBack(onBack);
    };
    d.querySelector('[data-a=go]')!.addEventListener('click', close);
    d.querySelector('[data-a=cam]')!.addEventListener('click', () => {
      g.e.camv.cycle();
      close();
    });
    d.querySelector('[data-a=menu]')!.addEventListener('click', () => {
      g.hud.closePanel();
      menu();
    });
    d.querySelector('[data-a=exit]')!.addEventListener('click', quit);
    setBack(close);
  }

  if (location.search.includes('debug'))
    (window as unknown as Record<string, unknown>).__pinkGame = {
      start: (m: Mode, i = 0, fresh = true) => {
        mode = m;
        return start(i, fresh);
      },
      menu,
      pause,
      game: () => game,
    };

  menu();
  return {
    destroy() {
      dead = true;
      endGame();
      menuEl?.remove();
      setBack(null);
      resetNotifyTop();
      clearNotify();
      el.remove();
      audio.applySettings();
    },
    pause() {
      if (game && !game.e.paused) pause();
    },
    resume() {
      /* continua pela tela de pausa */
    },
    inMatch() {
      return !!game;
    },
  };
}
