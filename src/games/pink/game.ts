/* ============================================================
 *  BLOOP PINK — entrada do jogo (chunk sob demanda).
 *  Tela de início padrão: modo (Minha Loja · Fábrica · Mercadinho em breve),
 *  3 espaços salvos por modo, JOGAR. Save novo → abertura de cinema (pulável).
 *  Pausa pelo botão/voltar. Moedas do app no fim de cada dia (reportRun).
 *  Com amigos / grupo (coop.ts): sala de até 4 Bloops; o líder escolhe a loja
 *  (o save dele manda) e todos entram nela. "Fulano está jogando — ENTRAR".
 * ============================================================ */
import { audio } from '../../core/audio';
import { pushBack } from '../../core/back';
import { addCoins } from '../../core/economy';
import { detectInitialTier, type Tier } from '../../core/quality';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { t } from '../../i18n';
import { clearNotify, notify, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { openStartMenu, smDrawBloop, smSlotName, type SmDraw, type SmPage, type StartMenu } from '../../ui/startmenu';
import { icon } from '../../ui/icons';
import { me as socialMe } from '../../social/net';
import { displayName } from '../../services/leaderboard';
import { consumePartySeat, partySeat } from '../../party/contract';
import { joinStr, reportPlaying, stopPlaying } from '../../party/join';
import { CODE_ALPHA, CODE_OK, MAX_PLAYERS, createNet, newCode, type JNet, type Me, type NetEvent } from '../jangada/net';
import { PINK_NET_PATH } from './coop';
import { enterGame } from '../../audio';
import { BRAND_NAME, drawBrandLogo, setBrandMode } from './brand';
import { money } from './catalog';
import { ic } from './icons';
import { dropSlot, getFactory, getShop, newFactory, newGrocery, newShop, putFactory, putShop, selSlot, setSel, slots, type FactorySave, type Mode, type ShopSave } from './save';
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

  /* ------------------------------ grupo ------------------------------ */
  interface Online {
    net: JNet;
    party: boolean;
    sm: StartMenu | null;
    offs: (() => void)[];
  }
  let online: Online | null = null;
  let meP: Promise<Me> | null = null;
  const myself = (): Promise<Me> =>
    (meP ??= socialMe()
      .then((m) => ({ id: m.id, name: m.name || displayName() || 'Bloop', skin: m.skin }))
      .catch((e) => {
        meP = null;
        throw e;
      }));
  /** nome do espaço: o que a criança escolheu (lápis) ou "Loja 2" */
  const defName = (m: Mode, i: number) => (m === 'shop' ? t('pink.slot', 'Loja {n}', { n: i + 1 }) : m === 'grocery' ? t('pink.slotG', 'Mercadinho {n}', { n: i + 1 }) : t('pink.slotF', 'Fábrica {n}', { n: i + 1 }));
  const newLbl = (m: Mode) => (m === 'shop' ? t('pink.newShop', 'Nova loja') : m === 'grocery' ? t('pink.newGrocery', 'Novo mercadinho') : t('pink.newFactory', 'Nova fábrica'));
  const isStore = (m: Mode) => m === 'shop' || m === 'grocery';
  const slotLabel = (m: Mode, i: number) => smSlotName('pink', i, m) ?? defName(m, i);

  const setBack = (fn: (() => void) | null) => {
    popBack?.();
    popBack = fn ? pushBack(fn) : null;
  };
  const saveGame = () => {
    const g = game;
    if (!g) return;
    if (isStore(mode) && (g as Shop).guest) return;
    if (isStore(mode)) putShop(slot, (g as Shop).toSave(), mode as 'shop' | 'grocery');
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
    leaveOnline();
    endGame();
    setBack(null);
    exit();
  };

  /* ------------------------------ menu ------------------------------ */
  function menu(): void {
    leaveOnline();
    endGame();
    setBrandMode('beauty');
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
            { id: 'grocery', icon: ic('grocery', 56), label: t('pink.mode.grocery', 'Mercadinho'), color: '#d9f5c8', sel: mode === 'grocery', onTap: () => ((mode = 'grocery'), sm.refresh()) },
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
              name: d ? defName(mode, i) : undefined,
              progress: d ? `${t('pink.dayShort', 'Dia {n}', { n: d.day })} · ★${d.lvl}` : undefined,
              progressIcon: ic('sun', 16),
              last: s.last,
              thumb: d ? slotThumb(mode, d.lvl, d.money) : undefined,
              color: mode === 'shop' ? '#ffc6de' : mode === 'grocery' ? '#c8f0b0' : '#d6c6ff',
            };
          }),
          {
            sel: cur,
            newLabel: newLbl(mode),
            key: mode,
            nameIdeas: nameIdeas(mode),
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
        else p.play({ say: newLbl(mode), onTap: () => void start(cur, true) });
        // com amigos: a Minha Loja recebe até 4 Bloops (a Fábrica ainda é solo)
        p.friends({
          game: 'pink',
          say: t('pink.net.friendsSay', 'Abrir a loja com amigos'),
          onTap: () => {
            mode = 'shop';
            void connect(newCode(), 'create', false, true);
          },
        });
        p.link(t('fp.code', 'Entrar com código / QR'), () => sm.push(codePage, t('fp.code', 'Entrar com código / QR')));
      },
    });
    menuEl = sm.el;
    setBack(() => sm.back());
  }

  function nameIdeas(m: Mode) {
    if (m === 'grocery')
      return [
        { text: t('pink.ideaG.1', 'Mercadinho da Vila'), icon: ic('grocery', 20) },
        { text: t('pink.ideaG.2', 'Hortifruti Feliz'), icon: ic('apple', 20) },
        { text: t('pink.ideaG.3', 'Empório Bloop'), icon: ic('bread', 20) },
        { text: t('pink.ideaG.4', 'Açougue Top'), icon: ic('meat', 20) },
        { text: t('pink.ideaG.5', 'Mercado da Esquina'), icon: ic('store', 20) },
        { text: t('pink.ideaG.6', 'Super Fresquinho'), icon: ic('carrot', 20) },
        { text: t('pink.ideaG.7', 'Cantinho do Pão'), icon: ic('bread', 20) },
        { text: t('pink.ideaG.8', 'Mercado dos Sonhos'), icon: ic('star', 20) },
      ];
    return m === 'shop'
      ? [
          { text: t('pink.idea.1', 'Minha Loja Linda'), icon: ic('heart', 20) },
          { text: t('pink.idea.2', 'Loja da Princesa'), icon: ic('sparkle', 20) },
          { text: t('pink.idea.3', 'Cantinho Rosa'), icon: ic('flowers', 20) },
          { text: t('pink.idea.4', 'Beleza Total'), icon: ic('lips', 20) },
          { text: t('pink.idea.5', 'Brilho e Glamour'), icon: ic('star', 20) },
          { text: t('pink.idea.6', 'Perfumaria Mágica'), icon: ic('perfume', 20) },
          { text: t('pink.idea.7', 'Unhas Fofas'), icon: ic('nails', 20) },
          { text: t('pink.idea.8', 'Loja dos Sonhos'), icon: ic('gift', 20) },
        ]
      : [
          { text: t('pink.ideaF.1', 'Fábrica Turbo'), icon: ic('truck', 20) },
          { text: t('pink.ideaF.2', 'Fábrica Rosa'), icon: ic('heart', 20) },
          { text: t('pink.ideaF.3', 'Entrega Rápida'), icon: ic('run', 20) },
          { text: t('pink.ideaF.4', 'Super Fábrica'), icon: ic('star', 20) },
          { text: t('pink.ideaF.5', 'Caixas Mágicas'), icon: ic('box', 20) },
          { text: t('pink.ideaF.6', 'Robôs Amigos'), icon: ic('robot', 20) },
          { text: t('pink.ideaF.7', 'Central de Presentes'), icon: ic('gift', 20) },
          { text: t('pink.ideaF.8', 'Fábrica dos Sonhos'), icon: ic('sparkle', 20) },
        ];
  }

  /** "Entrar com código": 5 letras, como K7Q2M */
  function codePage(p: SmPage): void {
    const f = document.createElement('form');
    f.className = 'pk-codef';
    f.innerHTML = `<input maxlength="5" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="K7Q2M" aria-label="${esc(t('pink.net.codeL', 'Código da sala'))}"><button class="pk-b g" type="submit">${ic('check', 22)}${esc(t('pink.net.join', 'Entrar'))}</button>`;
    const inp = f.querySelector('input') as HTMLInputElement;
    inp.addEventListener('input', () => (inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, '')));
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = inp.value.toUpperCase();
      if (!CODE_OK.test(v)) {
        notify(t('pink.net.badCode', 'Código com 5 letras, como K7Q2M'), { icon: 'warning', kind: 'bad' });
        return;
      }
      audio.click();
      mode = 'shop';
      void connect(v, 'join', false);
    });
    p.hint(t('pink.net.codeHint', 'Peça o código para quem abriu a loja'), ic('people', 22));
    p.custom(f);
  }

  function slotThumb(m: Mode, lvl: number, cash: number): SmDraw {
    return (x, w, h, time) => {
      const g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, m === 'shop' ? '#ffe3ef' : m === 'grocery' ? '#dff5d0' : '#ece4ff');
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

  async function start(i: number, fresh: boolean, net: JNet | null = null, guestSave: ShopSave | null = null): Promise<void> {
    if (!webglOk()) {
      notify(t('pink.noGl', 'Este aparelho não tem 3D (WebGL).'), { kind: 'bad' });
      return;
    }
    if (net) mode = 'shop';
    slot = i;
    if (!guestSave) setSel(mode, i);
    if (fresh && introAllowed() && !net && mode === 'shop') {
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
      const cat = await import('./catalog');
      const gro = mode === 'grocery' || guestSave?.kind === 'grocery';
      cat.useCatalog(gro ? 'grocery' : 'beauty');
      (await import('./brand')).setBrandMode(gro ? 'grocery' : 'beauty');
      if (isStore(mode)) {
        const gm = mode as 'shop' | 'grocery';
        const mk = () => (gm === 'grocery' ? newGrocery() : newShop());
        const sv = guestSave ?? (fresh ? mk() : getShop(i, gm) ?? mk());
        if (fresh && !guestSave) putShop(i, sv, gm);
        const { Shop } = await import('./shop');
        ld.set(0.5);
        await frame();
        game = new Shop({
          root: el,
          tier,
          save: sv,
          onPause: pause,
          onSave: (s) => !guestSave && putShop(slot, s, gm),
          onCoins: (n) => {
            addCoins(n);
            reportRun({ game: 'pink', score: Math.round(sv.money), coins: n, durationSec: Math.round((performance.now() - runStart) / 1000), won: true, stats: { day: sv.day, level: sv.lvl, customers: sv.totalCust } });
            runStart = performance.now();
          },
          net: net ? { net, host: !guestSave } : null,
          name: smSlotName('pink', i, gm) ?? undefined,
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
          onReload: () => void start(slot, false),
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
    // em grupo a loja não para (os outros continuam): a pausa só abre o painel
    const guest = isStore(mode) && (g as Shop).guest;
    if (!online) g.setPaused(true);
    const d = g.hud.panel(`
      <h2>${ic('pause', 30)}${esc(t('pink.paused', 'Pausa'))}</h2>
      <div style="font-weight:700">${esc(BRAND_NAME)} · ${esc(guest ? t('pink.net.guestOf', 'Loja de {n}', { n: hostName() }) : slotLabel(mode, slot))}${online ? ` · ${ic('people', 18)} ${online.net.peers.length}` : ''}</div>
      <div class="pk-row">
        <button class="pk-b g" data-a="go">${ic('check', 22)}${esc(t('pink.resume', 'Continuar'))}</button>
        <button class="pk-b w" data-a="cam">${ic('house', 22)}${esc(t('pink.cam', 'Câmera'))}</button>
        ${guest ? '' : `<button class="pk-b w" data-a="menu">${ic('store', 22)}${esc(online ? t('pink.net.room', 'Sala') : t('pink.menu', 'Menu'))}</button>`}
        <button class="pk-b o" data-a="exit">${ic('close', 22)}${esc(guest ? t('pink.net.leave', 'Sair da loja') : t('pink.saveExit', 'Salvar e sair'))}</button>
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
    d.querySelector('[data-a=menu]')?.addEventListener('click', () => {
      g.hud.closePanel();
      if (online) backToRoom();
      else menu();
    });
    d.querySelector('[data-a=exit]')!.addEventListener('click', () => (guest ? menu() : quit()));
    setBack(close);
  }

  /* ------------------------------ online (coop.ts) ------------------------------ */
  const hostName = () => online?.net.peers.find((p) => p.id === online!.net.hostId)?.name ?? 'Bloop';
  const PCOLS = ['#ffd34a', '#7fd8ff', '#ff8ab8', '#7ad86a'];
  function leaveOnline(): void {
    const o = online;
    if (!o) return;
    online = null;
    stopPlaying();
    for (const f of o.offs) f();
    if (o.net.isHost) o.net.send({ t: 'end' });
    o.net.close();
  }
  /** tela "Conectando…" (enquanto o relé responde) */
  function connecting(code: string): StartMenu {
    endGame();
    menuEl?.remove();
    const sm = openStartMenu(el, {
      game: 'pink',
      title: t('pink.net.title', 'Loja com amigos'),
      onBack: () => menu(),
      build: (p) => {
        p.hint(t('pink.net.connecting', 'Conectando...'), ic('clock', 22));
        p.hint(t('pink.net.codeIs', 'Código da sala: {c}', { c: code }), ic('people', 22));
      },
    });
    menuEl = sm.el;
    setBack(() => sm.back());
    return sm;
  }
  async function connect(code: string, how: 'create' | 'join', party: boolean, callNow = false, retryUntil = 0): Promise<void> {
    leaveOnline();
    const sm = connecting(code);
    let net: JNet | null = null;
    for (;;) {
      try {
        const m = await myself();
        net = await createNet(code, how, m, 9000, PINK_NET_PATH);
        break;
      } catch (e) {
        if (menuEl !== sm.el || dead) return;
        const why = (e as Error)?.message ?? '';
        // grupo: o líder ainda está abrindo a sala → tenta de novo
        if (why === 'no_room' && retryUntil > Date.now()) {
          await new Promise((r) => setTimeout(r, 1500));
          if (menuEl !== sm.el || dead) return;
          continue;
        }
        const msg =
          why === 'no_room' || why === 'bad_code'
            ? t('pink.net.noRoom', 'Não achei essa loja. Confira o código!')
            : why === 'full'
              ? t('pink.net.full', 'A loja está cheia (4 Bloops).')
              : why === 'taken'
                ? t('pink.net.taken', 'Esse código já está em uso. Tente de novo.')
                : t('pink.net.offline', 'Sem conexão com o servidor agora.');
        notify(msg, { icon: 'cloud-off', kind: 'bad', ms: 3600 });
        menu();
        return;
      }
    }
    if (menuEl !== sm.el || dead) {
      net.close();
      return;
    }
    const o: Online = { net, party, sm: null, offs: [] };
    online = o;
    const nt = net;
    reportPlaying('pink', nt.code);
    o.offs.push(
      nt.onEvent((from, e) => {
        if (online !== o || from !== nt.hostId || nt.isHost) return;
        if (e.t === 'init' && !game && e.s && typeof e.s === 'object') void startGuest(e);
        else if (e.t === 'end') {
          notify(t('pink.net.closed', '{n} fechou a loja. Esperando abrir de novo…', { n: hostName() }), { icon: 'user', ms: 3200 });
          if (game) showLobby();
        }
      }),
    );
    o.offs.push(
      nt.onRoster((why, id) => {
        if (online !== o) return;
        const p = nt.peers.find((x) => x.id === id);
        if (why === 'join') {
          audio.click();
          notify(t('pink.net.joined', '{n} entrou na loja!', { n: p?.name ?? 'Bloop' }), { icon: 'user', kind: 'good' });
        } else if (why === 'leave') notify(t('pink.net.left', 'Um amigo saiu da loja'), { icon: 'user' });
        else if (why === 'host' && nt.isHost && (!game || (game as Shop).guest)) {
          // o dono saiu: a loja era dele — volta para o menu
          notify(t('pink.net.hostLeft', 'O dono da loja saiu. Até a próxima!'), { icon: 'user', kind: 'bad', ms: 3600 });
          menu();
          return;
        }
        o.sm?.refresh();
      }),
    );
    nt.onClose(() => {
      if (online !== o) return;
      online = null;
      stopPlaying();
      for (const f of o.offs) f();
      notify(t('pink.net.lost', 'A conexão com a loja caiu.'), { icon: 'cloud-off', kind: 'bad' });
      menu();
    });
    showLobby();
    if (callNow && nt.isHost) callFriends();
  }
  function callFriends(): void {
    const o = online;
    if (!o) return;
    const code = o.net.code;
    void import('../../party/friends-play').then((f) => f.openCallFriends({ game: 'pink', j: joinStr('pink', code), onCode: () => notify(t('pink.net.codeIs', 'Código da sala: {c}', { c: code }), { icon: 'link', ms: 6000 }) }));
  }
  /** a sala: quem está na loja (♛ = dono), o líder escolhe a loja e abre; os outros esperam */
  function showLobby(): void {
    const o = online;
    if (!o) return menu();
    endGame();
    menuEl?.remove();
    const net = o.net;
    const sm = openStartMenu(el, {
      game: 'pink',
      title: o.party ? t('pink.net.partyTitle', 'Loja do grupo') : t('pink.net.title', 'Loja com amigos'),
      onBack: () => menu(),
      build: (p) => {
        const ps = net.peers;
        p.label(t('pink.net.players', 'Na loja ({n}/{m})', { n: ps.length, m: MAX_PLAYERS }), ic('people', 22));
        let h = '';
        for (let i = 0; i < MAX_PLAYERS; i++) {
          const q = ps[i];
          h += q
            ? `<div class="pk-lp${q.id === net.hostId ? ' lead' : ''}"><i style="background:${PCOLS[i]}"></i><b>${esc(q.id === net.me.id ? t('pink.net.you', '{n} (você)', { n: q.name }) : q.name)}</b>${q.id === net.hostId ? icon('crown', { size: 22 }) : ''}</div>`
            : `<div class="pk-lp free"><i></i><b>${esc(t('pink.net.free', 'Vaga livre'))}</b></div>`;
        }
        p.custom(`<div class="pk-lps">${h}</div>`);
        if (net.isHost) {
          // o líder escolhe qual das 3 lojas dele abrir (o save dele manda)
          const list = slots('shop');
          const cur = selSlot('shop');
          p.slots(
            list.map((sl, i) => {
              const d = sl.data as ShopSave | null;
              return {
                empty: !d,
                name: d ? t('pink.slot', 'Loja {n}', { n: i + 1 }) : undefined,
                progress: d ? `${t('pink.dayShort', 'Dia {n}', { n: d.day })} · ★${d.lvl}` : undefined,
                progressIcon: ic('sun', 16),
                last: sl.last,
                thumb: d ? slotThumb('shop', d.lvl, d.money) : undefined,
                color: '#ffc6de',
              };
            }),
            { sel: cur, newLabel: t('pink.newShop', 'Nova loja'), key: 'shop', nameIdeas: nameIdeas('shop'), onSelect: (i) => (setSel('shop', i), sm.refresh()), onOpen: (i) => (setSel('shop', i), hostStart()) },
          );
          const d = list[cur]?.data as ShopSave | null;
          p.play({ label: t('pink.net.open', 'Abrir a loja'), sub: d ? `${slotLabel('shop', cur)} · ${t('pink.dayShort', 'Dia {n}', { n: d.day })}` : t('pink.newShop', 'Nova loja'), tone: d ? 'green' : 'gold', onTap: hostStart });
          if (!o.party) p.friends({ label: t('pink.net.call', 'Chamar amigos'), onTap: callFriends });
        } else p.hint(t('pink.net.waitHost', 'Esperando {n} abrir a loja…', { n: hostName() }), ic('clock', 22));
        p.link(t('pink.net.codeIs', 'Código da sala: {c}', { c: net.code }), () => notify(t('pink.net.codeIs', 'Código da sala: {c}', { c: net.code }), { icon: 'link', ms: 6000 }));
      },
    });
    o.sm = sm;
    menuEl = sm.el;
    setBack(() => sm.back());
    // convidado: se a loja já está aberta, o dono manda a loja de novo
    if (!net.isHost) net.send({ t: 'want' });
  }
  function hostStart(): void {
    const o = online;
    if (!o || !o.net.isHost) return;
    mode = 'shop';
    const i = selSlot('shop');
    o.sm = null;
    void start(i, !getShop(i), o.net);
  }
  /** pausa → Sala: o dono salva e volta para a sala (os amigos esperam lá) */
  function backToRoom(): void {
    const o = online;
    if (!o) return menu();
    if (o.net.isHost) o.net.send({ t: 'end' });
    showLobby();
  }
  let joining = false;
  async function startGuest(e: NetEvent): Promise<void> {
    const o = online;
    if (!o || joining) return;
    const sv = { ...newShop(), ...(e.s as Partial<ShopSave>) } as ShopSave;
    o.sm = null;
    joining = true;
    try {
      await start(0, false, o.net, sv);
    } finally {
      joining = false;
    }
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
      create: () => connect(newCode(), 'create', false),
      join: (code: string) => connect(code, 'join', false),
      host: () => hostStart(),
      online: () => online && { code: online.net.code, host: online.net.isHost, peers: online.net.peers.map((p) => p.name), inGame: !!game },
    };

  // grupo: o líder abre a sala (código do grupo) e escolhe a loja; os outros entram e esperam
  const seat = partySeat('pink');
  if (seat) consumePartySeat('pink');
  if (seat?.direct) {
    mode = 'shop';
    void connect(seat.code(5, CODE_ALPHA), 'join', false);
  } else if (seat) {
    mode = 'shop';
    void connect(seat.code(5, CODE_ALPHA), seat.host ? 'create' : 'join', true, false, seat.host ? 0 : Date.now() + 25_000);
  } else menu();
  return {
    destroy() {
      dead = true;
      leaveOnline();
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
