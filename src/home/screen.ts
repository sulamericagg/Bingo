/* ============================================================
 *  CASA, PLANETA & AMIGOS — tela principal (carregada sob demanda).
 *  Vistas: planeta (casa vista do espaço) · cômodos · construtor · pintar fachada.
 * ============================================================ */
import './home.css';
import type { FriendInfo, HomeDesign, HomeRole, MessItem, PartySession } from './api';
import {
  EXTERIOR_FIELDS, FLOORS, FURN_CATS, FURNITURE, PALETTE, PLANET_FIELDS, ROOM_IDS, WALLS, colorCost, costOfField, countCombinations, floorName,
  furnById, hashStr, normalizeDesign, num, randomDesign, roomName, sciBig, surface, wallName, type Cost, type Field, type RoomId,
} from './catalog';
import { hicon, type HomeIcon } from './icons';
import { RoomScene, FOODS, TEMPLATES, drawFood, type CleanTool, type RoomHost } from './room';
import { planetSceneCanvas, drawHouse } from './render-planet';
import { RW, RH, drawFurn } from './render-room';
import { Painter, FINISHES, finishCost, finishName, type Finish, type PaintTool } from './paint';
import { getApi, loadMyHome, cacheHome, owns, grant, bump, stats, markDirtyPenalty, roleFor, can, sendDesign, open3D, isMock, type DesignEvent } from './service';
import { openFriends, openHandle, openPermissions, roleName, type SocialUi } from './social';
import { hsfx, partyMusic } from './sfx';
import { t, fmt } from '../i18n';
import { esc } from '../ui/dom';
import { installIconCss } from '../ui/icons';
import { bus } from '../core/events';
import { save } from '../core/storage';
import { addCoins as addCoinsRaw, spend } from '../core/economy';
import { dayNumber } from '../core/storage';

/* Teto diário das moedas da Casa (limpar/pintar/festa): sem isso dava para
 * sujar a própria casa na guerra de comida, limpar e repetir para sempre. */
const HOME_DAILY_COIN_CAP = 200;
const HOME_EARN_KEY = 'bw-home-earn';
function addCoins(n: number): number {
  let st = { d: 0, n: 0 };
  try {
    st = JSON.parse(localStorage.getItem(HOME_EARN_KEY) || '') || st;
  } catch {
    /* */
  }
  const today = dayNumber();
  if (st.d !== today) st = { d: today, n: 0 };
  const give = Math.max(0, Math.min(n, HOME_DAILY_COIN_CAP - st.n));
  if (give <= 0) return 0;
  st.n += give;
  try {
    localStorage.setItem(HOME_EARN_KEY, JSON.stringify(st));
  } catch {
    /* */
  }
  addCoinsRaw(give);
  return give;
}
import { showRewarded } from '../services/ads';
import { detectInitialTier, settingsFor } from '../core/quality';
import { openEmoteWheel } from '../social/emotes';
import { getPlayer } from '../services/online';
import { addStat } from '../pet/state';
import { makeCanvas, alpha, star } from './gfx';
import { installPass, passData, passThumb, refreshPass, openHomePass } from './pass-bridge';

type View = 'planet' | 'room' | 'build' | 'paintExt';
let root: HTMLElement | null = null;
let cv: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let W = 0,
  H = 0,
  dpr = 1;
let isOpen = false;
let raf = 0;
let last = 0;
let view: View = 'planet';
let fpsCap = 60;
let acc = 0;
let unsub: (() => void)[] = [];

const S = {
  ownerId: 'me',
  isOwner: true,
  name: '',
  design: normalizeDesign(null) as HomeDesign,
  mess: [] as MessItem[],
  role: 'build' as HomeRole,
  myId: 'me',
};
let scene: RoomScene;
let session: PartySession | null = null;
let undo: string[] = [];
let redo: string[] = [];
let lastSnap = '';
let saveT = 0;
let messT = 0;

const $ = (s: string) => root!.querySelector(s) as HTMLElement;

/* ============================================================
 *  API pública
 * ============================================================ */
export interface OpenOpts {
  tab?: 'home' | 'friends' | 'build' | 'rooms';
  visit?: string; // id do amigo
  party?: string; // host da festa
  room?: RoomId;
}
export function isHomeOpen(): boolean {
  return isOpen;
}
export async function openHome(o: OpenOpts = {}): Promise<void> {
  installIconCss();
  if (!root) build();
  isOpen = true;
  root!.classList.add('on');
  const tier = detectInitialTier();
  const qs = settingsFor(tier);
  fpsCap = qs.fpsCap;
  dpr = Math.min(qs.dprCap, window.devicePixelRatio || 1);
  S.myId = getPlayer()?.id ?? 'me';
  resize();
  window.addEventListener('resize', resize);
  installPass();
  unsub.push(
    bus.on('wallet', refreshWallet),
    bus.on('home-item-grant', () => {
      refreshPass();
      refreshBar();
    }),
  );
  refreshWallet();
  cancelAnimationFrame(raf);
  last = performance.now();
  raf = requestAnimationFrame(loop);
  await loadMine();
  const api = await getApi();
  const after = async () => {
    if (o.visit) await visit(o.visit, !!o.party);
    else if (o.party) await startParty(o.party);
    else if (o.tab === 'friends') showFriends();
    else if (o.tab === 'build') setView('build');
    else if (o.tab === 'rooms') enterRooms(o.room);
  };
  if (!api.myHandle() && !sessionStorage.getItem('hm-handle-skip')) {
    openHandle(ui, {
      first: true,
      done: (h) => {
        if (!h) sessionStorage.setItem('hm-handle-skip', '1');
        S.name = h ?? S.name;
        refreshTop();
        void after();
      },
    });
  } else await after();
}
export function closeHome(): boolean {
  if (!isOpen) return false;
  const sh = $('.hm-sheet');
  if (sh.classList.contains('on')) {
    ui.close();
    return true;
  }
  if (view === 'room' && scene.mode !== 'look') {
    finishMode();
    return true;
  }
  if (view !== 'planet') {
    if (view === 'build' || view === 'paintExt') flushSave();
    setView('planet');
    return true;
  }
  if (!S.isOwner) {
    void goHome();
    return true;
  }
  isOpen = false;
  leaveParty();
  flushSave();
  root!.classList.remove('on');
  cancelAnimationFrame(raf);
  unsub.forEach((u) => u());
  unsub = [];
  window.removeEventListener('resize', resize);
  bus.emit('home-closed');
  return true;
}

/* ============================================================
 *  DOM
 * ============================================================ */
function build(): void {
  root = document.createElement('div');
  root.className = 'hm-scr';
  root.innerHTML = `<canvas class="hm-cv"></canvas>
    <div class="hm-top"><button class="hm-btn hm-ibtn hm-back" aria-label="${esc(t('home.back', 'Voltar'))}">${hicon('back', 26)}</button><div class="hm-title"></div><div class="hm-wallet"><span class="hm-coins"></span><span class="hm-gems"></span></div></div>
    <div class="hm-rooms" hidden></div>
    <div class="hm-banner" hidden></div>
    <div class="hm-bar"></div>
    <div class="hm-sheet"></div>
    <div class="hm-toast"></div>`;
  document.body.appendChild(root);
  cv = $('.hm-cv') as HTMLCanvasElement;
  ctx = cv.getContext('2d', { alpha: false })!;
  $('.hm-back').addEventListener('click', () => {
    hsfx.click();
    closeHome();
  });
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pdown(e.clientX, e.clientY);
  });
  cv.addEventListener('pointermove', (e) => pmove(e.clientX, e.clientY));
  cv.addEventListener('pointerup', () => pup());
  cv.addEventListener('pointercancel', () => pup());
  scene = new RoomScene(roomHost());
}

const ui: SocialUi = {
  get sheet() {
    return $('.hm-sheet');
  },
  toast,
  close() {
    const sh = $('.hm-sheet');
    sh.classList.remove('on');
    sh.innerHTML = '';
  },
  visit(f: FriendInfo) {
    ui.close();
    void visit(f.id, false, f);
  },
  party(f: FriendInfo) {
    ui.close();
    void visit(f.id, true, f);
  },
};

let toastT = 0;
function toast(msg: string, ic: HomeIcon = 'star'): void {
  const el = $('.hm-toast');
  el.innerHTML = hicon(ic, 22) + `<span>${esc(msg)}</span>`;
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = window.setTimeout(() => el.classList.remove('on'), 2400);
}
function refreshWallet(): void {
  if (!root) return;
  $('.hm-coins').innerHTML = hicon('coin', 18) + fmt(save.coins);
  $('.hm-gems').innerHTML = hicon('gem', 18) + fmt(save.gems);
}
function refreshTop(): void {
  const who = S.isOwner ? (S.name ? t('home.title.mine', 'Casa de @{h}', { h: S.name }) : t('home.title.mine0', 'Minha casa')) : t('home.title.friend', 'Casa de @{h}', { h: S.name });
  const sub = view === 'room' ? roomName(scene.room) : view === 'build' ? t('home.build', 'Construir') : view === 'paintExt' ? t('home.paintext', 'Pintar fachada') : session ? t('home.party', 'Festa!') : '';
  $('.hm-title').innerHTML = `${esc(who)}${sub ? `<small>${esc(sub)}${!S.isOwner ? ' · ' + esc(roleName(S.role)) : ''}</small>` : ''}`;
}
function resize(): void {
  W = window.innerWidth;
  H = window.innerHeight;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px';
  cv.style.height = H + 'px';
  layoutScene();
}
function barH(): number {
  return ($('.hm-bar') as HTMLElement).offsetHeight || 120;
}
function layoutScene(): void {
  if (!root) return;
  const top = view === 'room' ? 100 : 60;
  scene.layout(W, H, top, barH() + 4, dpr);
}

/* ============================================================
 *  estado da casa
 * ============================================================ */
function snapshot(): string {
  return JSON.stringify({ p: S.design.planet, e: S.design.exterior, r: S.design.rooms, pa: S.design.paint ?? null });
}
function restore(s: string): void {
  const o = JSON.parse(s);
  S.design.planet = o.p;
  S.design.exterior = o.e;
  S.design.rooms = o.r;
  S.design.paint = o.pa ?? undefined;
  lastSnap = s;
  scene.setRoom(scene.room);
  refreshBar();
}
function changed(): void {
  const now = snapshot();
  if (now === lastSnap) return;
  undo.push(lastSnap);
  if (undo.length > 60) undo.shift();
  redo = [];
  lastSnap = now;
  queueSave();
}
function doUndo(): void {
  const s = undo.pop();
  if (!s) return;
  redo.push(snapshot());
  restore(s);
  queueSave();
  hsfx.click();
}
function doRedo(): void {
  const s = redo.pop();
  if (!s) return;
  undo.push(snapshot());
  restore(s);
  queueSave();
  hsfx.click();
}
function queueSave(): void {
  clearTimeout(saveT);
  saveT = window.setTimeout(flushSave, 1500);
}
function flushSave(): void {
  clearTimeout(saveT);
  if (!S.isOwner) return;
  cacheHome(S.design, S.mess);
  void getApi().then((a) => a.saveDesign(S.design));
  try {
    const th = planetSceneCanvas(S.design, 128, 128, { R: 40, cy: 72, name: S.name });
    localStorage.setItem('bw-home-thumb', th.toDataURL('image/png'));
  } catch {
    /* */
  }
}
function persistMess(): void {
  clearTimeout(messT);
  messT = window.setTimeout(async () => {
    if (S.isOwner) cacheHome(S.design, S.mess);
    if (session?.online && session.hostId !== S.myId && session.hostId !== S.ownerId) return;
    const api = await getApi();
    await api.setMess(S.isOwner ? S.myId : S.ownerId, S.mess);
  }, 900);
}

async function loadMine(): Promise<void> {
  const st = await loadMyHome();
  const api = await getApi();
  S.ownerId = S.myId;
  S.isOwner = true;
  S.role = 'build';
  S.name = api.myHandle() ?? '';
  S.design = st.design;
  S.mess = st.mess;
  undo = [];
  redo = [];
  lastSnap = snapshot();
  scene.host.design = S.design;
  scene.host.mess = S.mess;
  scene.host.isOwner = true;
  scene.host.role = 'build';
  scene.setRoom('living');
  // casa suja deixa o bichinho um pouco tristinho (de leve, 1x por dia)
  if (S.mess.length >= 6 && markDirtyPenalty(Date.now())) addStat('fun', -4);
  setView('planet');
}
async function goHome(): Promise<void> {
  leaveParty();
  await loadMine();
}
async function visit(id: string, party: boolean, f?: FriendInfo): Promise<void> {
  leaveParty();
  const api = await getApi();
  toast(t('home.visit.going', 'Indo para a casa de @{h}...', { h: f?.handle ?? '' }), 'house');
  const st = await api.getHome(id);
  if (!st) {
    toast(t('home.visit.fail', 'Não deu para entrar agora. Tente de novo!'), 'close');
    return;
  }
  const d = normalizeDesign(st.design);
  d.access = st.design.access;
  d.paint = st.design.paint;
  if (d.access?.visits === 'nobody') {
    toast(t('home.visit.closed', 'Essa casa não está recebendo visitas agora.'), 'lock');
    return;
  }
  S.ownerId = id;
  S.isOwner = false;
  S.name = f?.handle ?? '';
  S.design = d;
  S.mess = st.mess.slice();
  S.role = roleFor(d, S.myId, false);
  undo = [];
  redo = [];
  lastSnap = snapshot();
  scene.host.design = S.design;
  scene.host.mess = S.mess;
  scene.host.isOwner = false;
  scene.host.role = S.role;
  scene.setRoom('living');
  if (party) await startParty(id);
  else setView('planet');
}

/* ============================================================
 *  host do cômodo
 * ============================================================ */
function roomHost(): RoomHost {
  return {
    design: S.design,
    mess: S.mess,
    myId: S.myId,
    isOwner: true,
    role: 'build',
    session: null,
    hiFx: true,
    onDesign(room, kind) {
      changed();
      if (session && !S.isOwner && can(S.role, 'decorate')) {
        const rd = S.design.rooms.find((r) => r.id === room);
        const e: DesignEvent = { t: 'design', by: S.myId, room, items: kind === 'items' ? rd?.items : undefined, paint: kind === 'paint' ? S.design.paint?.[room] : undefined };
        sendDesign(session, e);
      }
      if (kind === 'items') refreshSelBar();
    },
    onMess(change, m, byMe) {
      if (change === 'add' && byMe && session) session.event({ t: 'splat', mess: m });
      if (change === 'remove' && byMe) {
        session?.event({ t: 'clean', messId: m.id, by: S.myId });
        addCoins(S.isOwner ? 2 : 4);
        bump('cleaned');
        bus.emit('home-clean', { count: 1 });
      }
      persistMess();
      refreshMessUi();
    },
    onSelect() {
      refreshSelBar();
    },
    onPaintProgress(p, done) {
      const bar = root?.querySelector('.hm-pprog') as HTMLElement | null;
      if (bar) {
        (bar.firstElementChild as HTMLElement).style.width = Math.round(p * 100) + '%';
        (bar.lastElementChild as HTMLElement).textContent = Math.floor(p * 100) + '%';
      }
      if (done) {
        const res = scene.commitPaint();
        changed();
        if (session && !S.isOwner) sendDesign(session, { t: 'design', by: S.myId, room: scene.room, paint: res });
        toast(scene.painter.tape ? t('home.paint.perfect', 'Parede perfeita! Bordas lisinhas com a fita.') : t('home.paint.done', 'Parede pintada! Que lindo!'), 'sparkle' as HomeIcon);
        addCoins(scene.painter.tape ? 15 : 10);
        bus.emit('home-paint', { room: scene.room });
        if (!S.isOwner) bus.emit('home-visit-help', { kind: 'paint' });
      }
    },
    onCake(n) {
      if (n === 0) toast(t('home.party.cakegone', 'O bolo acabou! Hora da guerra de comida!'), 'cake');
    },
    onCleanAll() {
      if (scene.mode !== 'clean') return;
      hsfx.done();
      scene.confetti(180, 200);
      if (S.isOwner) {
        addCoins(20);
        toast(t('home.clean.allmine', 'Casa brilhando! +20 moedas'), 'sparkle' as HomeIcon);
      } else {
        addCoins(40);
        const n = bump('helper');
        bus.emit('home-visit-help', { kind: 'clean' });
        toast(t('home.clean.helper', 'Medalha Amigo Ajudante! Você já ajudou {n} vezes. +40', { n }), 'star');
      }
      refreshBar();
    },
    onPetTap() {
      hsfx.click();
      const map: Record<string, 'kitchen' | 'bath' | 'bed' | 'play'> = { kitchen: 'kitchen', bath: 'bath', bedroom: 'bed', living: 'play', party: 'play' };
      void import('../pet/register').then((m) => m.openPetScreen(map[scene.room]));
    },
  };
}

/* ============================================================
 *  vistas e barras
 * ============================================================ */
function setView(v: View): void {
  view = v;
  ($('.hm-rooms') as HTMLElement).hidden = v !== 'room';
  if (v === 'room') renderRoomTabs();
  refreshBar();
  refreshTop();
}
function enterRooms(r?: RoomId): void {
  scene.setRoom(r ?? scene.room);
  scene.setMode(session ? 'party' : 'look');
  setView('room');
}
function btn(ic: HomeIcon, label: string, cls = '', attrs = ''): string {
  return `<button class="hm-btn hm-act ${cls}" ${attrs}>${hicon(ic, 26)}<span>${esc(label)}</span></button>`;
}
function refreshBar(): void {
  const bar = $('.hm-bar');
  bar.className = 'hm-bar';
  const ban = $('.hm-banner');
  ban.hidden = true;
  if (view === 'planet') {
    const mine = S.isOwner;
    const messN = S.mess.length;
    if (messN >= 3) {
      ban.hidden = false;
      ban.innerHTML = hicon('sponge', 22) + esc(mine ? t('home.mess.mine', 'Sua casa está bagunçada ({n} sujeiras). Limpe para o bichinho ficar feliz!', { n: messN }) : t('home.mess.friend', 'A casa de @{h} está uma bagunça! Ajude a limpar e ganhe moedas.', { h: S.name }));
    }
    const combos = sciBig(countCombinations().total);
    bar.innerHTML = `<div class="hm-row wrap">
      ${btn('sofa', t('home.enter', 'Entrar'), 'hm-blue', 'data-a="enter"')}
      ${mine || can(S.role, 'build') ? btn('build', t('home.build', 'Construir'), 'hm-gold', 'data-a="build"') : ''}
      ${!mine && messN && can(S.role, 'clean') ? btn('sponge', t('home.help', 'Ajudar a limpar'), 'hm-gold', 'data-a="clean"') : ''}
      ${btn('party', t('home.party', 'Festa!'), 'hm-pink', 'data-a="party"')}
      ${mine ? btn('friends', t('home.friends', 'Amigos'), '', 'data-a="friends"') : btn('house', t('home.myhouse', 'Minha casa'), '', 'data-a="home"')}
      ${mine ? btn('lock', t('home.perm', 'Permissões'), '', 'data-a="perm"') : ''}
      ${btn('cube', t('home.3d', 'Entrar em 3D'), '', 'data-a="3d"')}
    </div>${mine ? `<div class="hm-combo">${esc(t('home.combos', 'Mais de {n} casas diferentes possíveis', { n: combos }))}</div>` : ''}`;
  } else if (view === 'room') roomBar(bar);
  else if (view === 'build') buildBar(bar);
  else if (view === 'paintExt') paintExtBar(bar);
  bar.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('[data-a]') as HTMLElement | null;
    if (!b) return;
    hsfx.click();
    action(b.dataset.a!, b);
  };
  requestAnimationFrame(layoutScene);
}

function action(a: string, b: HTMLElement): void {
  switch (a) {
    case 'enter':
      enterRooms();
      break;
    case 'build':
      setView('build');
      break;
    case 'clean':
      enterRooms(firstMessRoom());
      scene.setMode('clean');
      refreshBar();
      break;
    case 'party':
      void startParty(S.ownerId);
      break;
    case 'friends':
      showFriends();
      break;
    case 'home':
      void goHome();
      break;
    case 'perm':
      void openPermissions(ui, S.design, (acc) => {
        S.design.access = acc;
        flushSave();
        toast(t('home.perm.saved', 'Permissões salvas!'), 'lock');
      });
      break;
    case '3d':
      void open3D({ design: S.design, mess: S.mess, ownerId: S.ownerId, isOwner: S.isOwner, role: S.role, session, room: scene.room, handle: S.name }).then((ok) => {
        if (!ok) return toast(t('home.3d.soon', 'O modo 3D chega em breve!'), 'cube');
        // o 3D escreve as mudanças de volta em S.design/S.mess: redesenha e salva (antes: edições do 3D se perdiam)
        if (!root) return;
        scene.host.design = S.design;
        scene.host.mess = S.mess;
        scene.setRoom(scene.room);
        changed();
        persistMess();
        refreshMessUi();
        refreshBar();
      });
      break;
    case 'mode':
      scene.setMode(b.dataset.m as 'edit');
      refreshBar();
      break;
    case 'done':
      finishMode();
      break;
    case 'undo':
      doUndo();
      break;
    case 'redo':
      doRedo();
      break;
    case 'leave':
      leaveParty(true);
      setView(view);
      scene.setMode('look');
      refreshBar();
      break;
    case 'emote':
      openEmoteWheel((code) => {
        scene.emoteOf(S.myId, code);
        session?.event({ t: 'chat', by: S.myId, code });
      });
      break;
    case 'food':
      scene.pickFood(b.dataset.f!);
      root!.querySelectorAll('[data-a="food"]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.f === scene.holding));
      break;
    case 'ctool':
      scene.cleanTool = b.dataset.t as CleanTool;
      root!.querySelectorAll('[data-a="ctool"]').forEach((x) => x.classList.toggle('on', x === b));
      break;
    case 'ptool':
      scene.paintTool = b.dataset.t as PaintTool;
      root!.querySelectorAll('[data-a="ptool"]').forEach((x) => x.classList.toggle('on', x === b));
      break;
    case 'tape':
      scene.painter.tape = !scene.painter.tape;
      if (extPainter) extPainter.tape = scene.painter.tape;
      b.classList.toggle('on', scene.painter.tape);
      break;
    case 'pcol':
      void pickPaint(Number(b.dataset.c), undefined);
      break;
    case 'pfin':
      void pickPaint(undefined, b.dataset.f as Finish);
      break;
    case 'multi':
      scene.multi = !scene.multi;
      b.classList.toggle('on', scene.multi);
      break;
    case 'flip':
      scene.forSel((it) => (it.flip = !it.flip));
      break;
    case 'upl':
      scene.forSel((it) => (it.layer = Math.min(5, (it.layer ?? 0) + 1)));
      break;
    case 'dnl':
      scene.forSel((it) => (it.layer = Math.max(-5, (it.layer ?? 0) - 1)));
      break;
    case 'rotz':
      scene.forSel((it) => ((it as { rot?: number }).rot = 0));
      break;
    case 'dup':
      scene.duplicate();
      break;
    case 'del':
      scene.removeSel();
      break;
    case 'icol':
      scene.forSel((it) => (it.color = PALETTE[Number(b.dataset.c)]));
      break;
    case 'cat':
      furnCat = b.dataset.c!;
      refreshBar();
      break;
    case 'add':
      void buyThen('furn:' + b.dataset.id, furnById(b.dataset.id!)!.cost, () => {
        scene.addItem(b.dataset.id!);
        bus.emit('home-build', { item: b.dataset.id });
      });
      break;
    case 'tpl':
      scene.applyTemplate(b.dataset.id!);
      break;
    case 'surf':
      surfTab = b.dataset.s as 'items';
      refreshBar();
      break;
    case 'floor':
    case 'wall': {
      const rd = scene.rd;
      const [k, c] = surface(a === 'floor' ? rd.floor : rd.wall);
      const nk = b.dataset.k ?? k;
      const nc = b.dataset.c !== undefined ? Number(b.dataset.c) : c;
      const key = b.dataset.c !== undefined ? 'pcol:' + nc : `${a}:${nk}`;
      const cost: Cost = b.dataset.c !== undefined ? colorCost(nc) : (a === 'floor' ? FLOORS : WALLS).indexOf(nk as never) < 4 ? { kind: 'free' } : { kind: 'coins', n: 80 };
      void buyThen(key, cost, () => {
        if (a === 'floor') rd.floor = `${nk}:${nc}`;
        else {
          rd.wall = `${nk}:${nc}`;
          if (S.design.paint?.[scene.room]) delete S.design.paint[scene.room];
        }
        scene.setRoom(scene.room);
        scene.host.onDesign(scene.room, 'items');
        refreshBar();
      });
      break;
    }
    case 'sect':
      buildSect = b.dataset.s as 'planet';
      buildGroup = '';
      refreshBar();
      break;
    case 'grp':
      buildGroup = b.dataset.g!;
      refreshBar();
      break;
    case 'opt':
      void chooseOpt(b.dataset.f!, Number(b.dataset.i));
      break;
    case 'rand':
      surprise();
      break;
    case 'save':
      flushSave();
      hsfx.done();
      toast(t('home.saved', 'Casa salva!'), 'save');
      break;
    case 'paintext':
      startPaintExt();
      break;
    case 'pass':
      openHomePass();
      break;
    case 'passlock':
      hsfx.error();
      toast(t('home.pass.locked', 'Exclusivo do Passe da Casa! Ganhe subindo de nível.'), 'lock');
      break;
    case 'psurf': {
      const spec = b.dataset.spec!;
      const rd = scene.rd;
      if (spec.includes(':') && passData().surfaces.find((x) => x.spec === spec)?.type === 'floor') rd.floor = spec;
      else {
        rd.wall = spec;
        if (S.design.paint?.[scene.room]) delete S.design.paint[scene.room];
      }
      scene.setRoom(scene.room);
      scene.host.onDesign(scene.room, 'items');
      bus.emit('home-build', { item: spec });
      refreshBar();
      break;
    }
    case 'ppass': {
      const P = view === 'paintExt' ? extPainter! : scene.painter;
      if (P.covered && view === 'room') {
        scene.commitPaint();
        changed();
      }
      P.setPaint(P.colorIdx, P.finish, b.dataset.id!);
      if (view === 'paintExt') rebuildExt();
      scene.invalidateItems();
      refreshBar();
      break;
    }
    case 'pext': {
      const rec = (buildSect === 'planet' ? S.design.planet : S.design.exterior) as Record<string, string | number>;
      rec[b.dataset.f!] = Number(b.dataset.i);
      rec[b.dataset.f! + 'P'] = b.dataset.id!;
      hsfx.place();
      bus.emit('home-build', { item: b.dataset.id });
      changed();
      buildBar($('.hm-bar'));
      pop = 1;
      break;
    }
    case 'kit': {
      const k = passData().kits.find((x) => x.id === b.dataset.id);
      if (!k?.item.kit) break;
      const list = k.item.kit.items.filter((id) => furnById(id));
      if (k.item.kit.room !== scene.room) scene.setRoom(k.item.kit.room);
      scene.rd.items = list.map((id, i) => {
        const d = furnById(id)!;
        return { id, x: 50 + ((i * 70) % 280), y: d.wall ? 100 : 330 + (i % 2) * 40 };
      });
      scene.confetti(180, 200);
      hsfx.done();
      scene.invalidate();
      scene.host.onDesign(scene.room, 'items');
      bus.emit('home-build', { item: k.id });
      renderRoomTabs();
      break;
    }
  }
}

function finishMode(): void {
  if (scene.mode === 'paint') {
    scene.commitPaint();
    changed();
  }
  scene.setMode(session ? 'party' : 'look');
  refreshBar();
  flushSave();
}
function firstMessRoom(): RoomId {
  return (S.mess.find((m) => !m.moved)?.room ?? S.mess[0]?.room ?? 'living') as RoomId;
}
function renderRoomTabs(): void {
  const el = $('.hm-rooms');
  el.innerHTML = ROOM_IDS.map((r) => `<button data-r="${r}" class="${r === scene.room ? 'on' : ''}">${esc(roomName(r))}${S.mess.some((m) => m.room === r) ? '<i class="dot"></i>' : ''}</button>`).join('');
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
    if (!b) return;
    hsfx.click();
    if (scene.mode === 'paint') {
      scene.commitPaint();
      changed();
    }
    scene.setRoom(b.dataset.r as RoomId);
    renderRoomTabs();
    refreshBar();
    refreshTop();
  };
}
function refreshMessUi(): void {
  if (view === 'room') {
    renderRoomTabs();
    const n = root!.querySelector('.hm-messn');
    if (n) n.textContent = t('home.clean.left', 'Faltam {n}', { n: scene.messCountHere() });
  }
}

/* ---------------- barra do cômodo ---------------- */
let furnCat = 'seat';
let surfTab: 'items' | 'floor' | 'wall' | 'tpl' = 'items';
function priceTag(key: string, c: Cost): string {
  if (c.kind === 'free' || owns(key)) return '';
  if (c.kind === 'coins') return `<span class="price">${hicon('coin', 13)}${c.n}</span>`;
  if (c.kind === 'gems') return `<span class="price">${hicon('gem', 13)}${c.n}</span>`;
  if (c.kind === 'video') return `<span class="price">${hicon('video', 14)}</span>`;
  return `<span class="price">${hicon('lock', 13)}${esc(c.kind === 'pass' ? t('home.pass', 'Passe') : t('home.event', 'Evento'))}</span>`;
}
const thumbCache = new Map<string, string>();
function furnThumb(id: string): string {
  let u = thumbCache.get(id);
  if (u) return u;
  const d = furnById(id)!;
  const [c2, x] = makeCanvas(120, 104);
  const s = Math.min(100 / d.w, 88 / d.h, 1.6);
  x.translate(60, d.wall ? 52 : 96);
  x.scale(s, s);
  drawFurn(x, d);
  u = c2.toDataURL();
  thumbCache.set(id, u);
  return u;
}
function roomBar(bar: HTMLElement): void {
  const m = scene.mode;
  if (m === 'look') {
    const messN = scene.messCountHere();
    bar.innerHTML = `<div class="hm-row wrap">
      ${scene.canDo('decorate') ? btn('sofa', t('home.decorate', 'Decorar'), 'hm-blue', 'data-a="mode" data-m="edit"') : ''}
      ${scene.canDo('decorate') ? btn('roller', t('home.paint', 'Pintar'), 'hm-pink', 'data-a="mode" data-m="paint"') : ''}
      ${scene.canDo('clean') ? btn('sponge', messN ? t('home.clean.n', 'Limpar ({n})', { n: messN }) : t('home.clean', 'Limpar'), messN ? 'hm-gold' : '', 'data-a="mode" data-m="clean"') : ''}
      ${btn('party', t('home.party', 'Festa!'), 'hm-pink', 'data-a="party"')}
      ${btn('cube', t('home.3d', 'Entrar em 3D'), '', 'data-a="3d"')}
    </div>`;
  } else if (m === 'party') {
    bar.className = 'hm-bar panel';
    bar.innerHTML = `<div class="hm-row"><b class="grow">${esc(t('home.party.hint', 'Toque no bolo para comer. Pegue comida e puxe para trás para jogar!'))}</b></div>
      <div class="hm-row scroll">${FOODS.map((f) => `<button class="hm-btn hm-furn ${scene.holding === f ? 'on' : ''}" data-a="food" data-f="${f}"><canvas data-food="${f}" width="60" height="52"></canvas>${esc(foodName(f))}</button>`).join('')}</div>
      <div class="hm-row">${btn('emote', t('home.emote', 'Emotes'), 'hm-gold', 'data-a="emote"')}${scene.canDo('clean') ? btn('sponge', t('home.clean', 'Limpar'), '', 'data-a="mode" data-m="clean"') : ''}${btn('cube', t('home.3d', 'Entrar em 3D'), '', 'data-a="3d"')}<span class="grow"></span>${btn('back', t('home.party.leave', 'Sair da festa'), '', 'data-a="leave"')}</div>`;
    bar.querySelectorAll('canvas[data-food]').forEach((c) => {
      const x = (c as HTMLCanvasElement).getContext('2d')!;
      drawFood(x, (c as HTMLElement).dataset.food!, 30, 28, 16);
    });
  } else if (m === 'clean') {
    bar.className = 'hm-bar panel';
    const tools: [CleanTool, HomeIcon, string][] = [
      ['sponge', 'sponge', t('home.tool.sponge', 'Esponja')],
      ['mop', 'mop', t('home.tool.mop', 'Rodo')],
      ['vacuum', 'vacuum', t('home.tool.vacuum', 'Aspirador')],
      ['bag', 'bag', t('home.tool.bag', 'Saco de lixo')],
      ['hand', 'hand', t('home.tool.hand', 'Arrumar')],
    ];
    bar.innerHTML = `<div class="hm-row"><b class="grow hm-messn">${esc(t('home.clean.left', 'Faltam {n}', { n: scene.messCountHere() }))}</b><small>${esc(t('home.clean.tip', 'Esfregue! A ferramenta certa limpa mais rápido.'))}</small></div>
      <div class="hm-row scroll">${tools.map(([id, ic, l]) => `<button class="hm-btn hm-act ${scene.cleanTool === id ? 'on' : ''}" data-a="ctool" data-t="${id}">${hicon(ic, 28)}<span>${esc(l)}</span></button>`).join('')}</div>
      <div class="hm-row"><span class="grow"></span><button class="hm-btn hm-go" data-a="done">${hicon('check', 20)} ${esc(t('home.done', 'Pronto'))}</button></div>`;
  } else if (m === 'paint') {
    bar.className = 'hm-bar panel';
    paintPanel(bar, false);
  } else if (m === 'edit') {
    bar.className = 'hm-bar panel';
    editPanel(bar);
  }
}
function foodName(f: string): string {
  return ({ cake: t('home.food.cake', 'Bolo'), pie: t('home.food.pie', 'Torta'), tomato: t('home.food.tomato', 'Tomate'), juice: t('home.food.juice', 'Suco'), frosting: t('home.food.frosting', 'Balão de glacê') } as Record<string, string>)[f] ?? f;
}

function paintPanel(bar: HTMLElement, ext: boolean): void {
  const P = ext ? extPainter! : scene.painter;
  const tools: [PaintTool, HomeIcon, string][] = [
    ['roller', 'roller', t('home.ptool.roller', 'Rolo')],
    ['brush', 'brush', t('home.ptool.brush', 'Pincel')],
    ['spray', 'spray', t('home.ptool.spray', 'Spray')],
  ];
  const cov = P.coverage();
  bar.innerHTML = `<div class="hm-row"><div class="hm-prog hm-pprog"><i style="width:${Math.round(cov * 100)}%"></i><b>${Math.floor(cov * 100)}%</b></div><button class="hm-btn ${P.tape ? 'on' : ''}" data-a="tape">${hicon('tape', 20)} ${esc(t('home.paint.tape', 'Fita'))}</button></div>
    <div class="hm-row">${tools.map(([id, ic, l]) => `<button class="hm-btn hm-act ${scene.paintTool === id ? 'on' : ''}" data-a="ptool" data-t="${id}">${hicon(ic, 26)}<span>${esc(l)}</span></button>`).join('')}</div>
    <div class="hm-row scroll">${PALETTE.map((c, i) => `<button class="hm-sw ${P.colorIdx === i ? 'on' : ''}" style="background:${c}" data-a="pcol" data-c="${i}" aria-label="${c}">${colorCost(i).kind !== 'free' && !owns('pcol:' + i) ? `<span class="lk">${hicon('lock', 14)}</span>` : ''}</button>`).join('')}</div>
    <div class="hm-row scroll">${FINISHES.map((f) => `<button class="hm-opt ${P.finish === f && !P.passId ? 'on' : ''}" data-a="pfin" data-f="${f}">${esc(finishName(f))}${priceTag('fin:' + f, finishCost(f))}</button>`).join('')}${passData()
      .paints.map((x) => `<button class="hm-opt ${P.passId === x.id ? 'on' : ''} ${x.owned ? '' : 'locked'}" data-a="${x.owned ? 'ppass' : 'passlock'}" data-id="${x.id}"><img src="${passThumb(x.item, 30)}" width="30" height="30" alt=""><span class="price">${x.owned ? '' : hicon('lock', 12)}${esc(t('home.pass', 'Passe'))}</span></button>`)
      .join('')}</div>
    <div class="hm-row"><small class="grow">${esc(t('home.paint.tip', 'Pinte a parede inteira até 100%!'))}</small><button class="hm-btn hm-go" data-a="${ext ? 'build' : 'done'}">${hicon('check', 20)} ${esc(t('home.done', 'Pronto'))}</button></div>`;
}
async function pickPaint(c?: number, f?: Finish): Promise<void> {
  const P = view === 'paintExt' ? extPainter! : scene.painter;
  if (c !== undefined && !(await acquire('pcol:' + c, colorCost(c)))) return;
  if (f && !(await acquire('fin:' + f, finishCost(f)))) return;
  if (P.covered && ((c !== undefined && c !== P.colorIdx) || (f && f !== P.finish))) {
    if (view === 'room') {
      scene.commitPaint();
      changed();
    }
  }
  P.setPaint(c ?? P.colorIdx, f ?? P.finish);
  if (view === 'paintExt') rebuildExt();
  scene.invalidateItems();
  refreshBar();
}

function editPanel(bar: HTMLElement): void {
  const sel = scene.sel.length;
  const tabs = `<div class="hm-row scroll">${(['items', 'floor', 'wall', 'tpl'] as const).map((k) => `<button class="hm-chip ${surfTab === k ? 'on' : ''}" data-a="surf" data-s="${k}">${esc(k === 'items' ? t('home.ed.items', 'Móveis') : k === 'floor' ? t('home.ed.floor', 'Piso') : k === 'wall' ? t('home.ed.wall', 'Papel de parede') : t('home.ed.tpl', 'Modelos'))}</button>`).join('')}</div>`;
  const tools = `<div class="hm-row"><button class="hm-btn hm-ibtn" data-a="undo" ${undo.length ? '' : 'disabled'}>${hicon('undo', 24)}</button><button class="hm-btn hm-ibtn" data-a="redo" ${redo.length ? '' : 'disabled'}>${hicon('redo', 24)}</button><button class="hm-btn hm-ibtn ${scene.multi ? 'on' : ''}" data-a="multi" aria-label="${esc(t('home.ed.multi', 'Vários'))}">${hicon('multi', 24)}</button><span class="grow"></span><button class="hm-btn hm-go" data-a="done">${hicon('check', 20)} ${esc(t('home.done', 'Pronto'))}</button></div>`;
  let body = '';
  if (sel) {
    body = `<div class="hm-row"><b class="grow">${esc(sel > 1 ? t('home.ed.nsel', '{n} itens', { n: sel }) : furnById(scene.items[scene.sel[0]]?.id ?? '')?.name() ?? '')}</b>
      <button class="hm-btn hm-ibtn" data-a="flip">${hicon('flip', 24)}</button><button class="hm-btn hm-ibtn" data-a="rotz">${hicon('rotate', 24)}</button><button class="hm-btn hm-ibtn" data-a="upl">${hicon('up', 22)}</button><button class="hm-btn hm-ibtn" data-a="dnl">${hicon('down', 22)}</button><button class="hm-btn hm-ibtn" data-a="dup">${hicon('copy', 24)}</button><button class="hm-btn hm-ibtn" data-a="del">${hicon('trash', 24)}</button></div>
      <div class="hm-row scroll">${PALETTE.map((c, i) => `<button class="hm-sw" style="background:${c}" data-a="icol" data-c="${i}"></button>`).join('')}</div>`;
  } else if (surfTab === 'items') {
    const cat = FURN_CATS.find((c) => c.id === furnCat) ?? FURN_CATS[0];
    const pass = furnCat === 'pass';
    const items = pass
      ? passData().furniture.map(({ def, owned }) => `<button class="hm-furn ${owned ? '' : 'locked'}" data-a="${owned ? 'add' : 'passlock'}" data-id="${def.id}"><img src="${passThumb(def.pass, 52)}" width="60" height="52" alt="">${esc(def.name())}${owned ? '' : `<span class="price">${hicon('lock', 13)}${esc(t('home.pass', 'Passe'))}</span>`}</button>`).join('') +
        `<button class="hm-furn hm-gold" data-a="pass">${hicon('star', 40)}${esc(t('home.pass.open', 'Ver Passe da Casa'))}</button>`
      : FURNITURE.filter((f) => cat.kinds.includes(f.kind)).map((f) => `<button class="hm-furn" data-a="add" data-id="${f.id}"><img src="${furnThumb(f.id)}" width="60" height="52" alt="">${esc(f.name())}${priceTag('furn:' + f.id, f.cost)}</button>`).join('');
    body = `<div class="hm-row scroll">${FURN_CATS.map((c) => `<button class="hm-chip ${c.id === furnCat ? 'on' : ''}" data-a="cat" data-c="${c.id}">${esc(c.label())}</button>`).join('')}<button class="hm-chip ${pass ? 'on' : ''}" data-a="cat" data-c="pass">${esc(t('home.pass.name', 'Passe da Casa'))}</button></div>
      <div class="hm-row scroll">${items}</div>`;
  } else if (surfTab === 'floor' || surfTab === 'wall') {
    const isF = surfTab === 'floor';
    const [k, c] = surface(isF ? scene.rd.floor : scene.rd.wall);
    const list = isF ? FLOORS : WALLS;
    body = `<div class="hm-row scroll">${list.map((id, i) => `<button class="hm-opt ${id === k ? 'on' : ''}" data-a="${surfTab}" data-k="${id}">${esc(isF ? floorName(id) : wallName(id))}${priceTag(`${surfTab}:${id}`, i < 4 ? { kind: 'free' } : { kind: 'coins', n: 80 })}</button>`).join('')}</div>
      <div class="hm-row scroll">${PALETTE.map((col, i) => `<button class="hm-sw ${i === c ? 'on' : ''}" style="background:${col}" data-a="${surfTab}" data-c="${i}">${colorCost(i).kind !== 'free' && !owns('pcol:' + i) ? `<span class="lk">${hicon('lock', 14)}</span>` : ''}</button>`).join('')}</div>
      <div class="hm-row scroll">${passData()
        .surfaces.filter((x) => x.type === surfTab)
        .map((x) => `<button class="hm-opt ${x.owned ? '' : 'locked'}" data-a="${x.owned ? 'psurf' : 'passlock'}" data-spec="${esc(x.spec)}"><img src="${passThumb(x.item, 36)}" width="36" height="36" alt=""><span class="price">${x.owned ? '' : hicon('lock', 12)}${esc(t('home.pass', 'Passe'))}</span></button>`)
        .join('')}</div>`;
  } else {
    body = `<div class="hm-row scroll">${TEMPLATES.map((tp) => `<button class="hm-opt" data-a="tpl" data-id="${tp.id}">${hicon('template', 26)}${esc(t('home.tpl.' + tp.id, tp.name))}</button>`).join('')}${passData()
      .kits.map((k) => `<button class="hm-opt ${k.owned ? '' : 'locked'}" data-a="${k.owned ? 'kit' : 'passlock'}" data-id="${k.id}"><img src="${passThumb(k.item, 32)}" width="32" height="32" alt="">${esc(k.item.name)}${k.owned ? '' : `<span class="price">${hicon('lock', 12)}${esc(t('home.pass', 'Passe'))}</span>`}</button>`)
      .join('')}</div><small>${esc(t('home.tpl.tip', 'Um modelo troca os móveis deste cômodo (dá para desfazer).'))}</small>`;
  }
  bar.innerHTML = (sel ? '' : tabs) + body + tools;
}
function refreshSelBar(): void {
  if (view === 'room' && scene.mode === 'edit') {
    editPanel($('.hm-bar'));
  }
}

/* ---------------- compras ---------------- */
async function acquire(key: string, cost: Cost): Promise<boolean> {
  if (cost.kind === 'free' || owns(key)) return true;
  if (cost.kind === 'pass' || cost.kind === 'event') {
    toast(cost.kind === 'pass' ? t('home.buy.pass', 'Exclusivo do Passe! Desbloqueie no Passe.') : t('home.buy.event', 'Exclusivo de evento especial!'), 'lock');
    hsfx.error();
    return false;
  }
  if (cost.kind === 'video') {
    const ok = await confirmBuy(t('home.buy.video', 'Assistir um vídeo para liberar?'), 'video');
    if (!ok) return false;
    if (await showRewarded()) {
      grant(key);
      hsfx.done();
      return true;
    }
    toast(t('home.buy.novideo', 'Vídeo indisponível agora.'), 'video');
    return false;
  }
  const price = cost.kind === 'coins' ? { coins: cost.n } : { gems: cost.n };
  const ok = await confirmBuy(cost.kind === 'coins' ? t('home.buy.coins', 'Liberar por {n} moedas?', { n: cost.n }) : t('home.buy.gems', 'Liberar por {n} gemas?', { n: cost.n }), cost.kind === 'coins' ? 'coin' : 'gem');
  if (!ok) return false;
  if (!spend(price)) {
    toast(t('home.buy.poor', 'Ainda não dá. Jogue para ganhar mais!'), 'coin');
    hsfx.error();
    return false;
  }
  grant(key);
  hsfx.coin();
  return true;
}
async function buyThen(key: string, cost: Cost, fn: () => void): Promise<void> {
  if (await acquire(key, cost)) {
    fn();
    if (cost.kind !== 'free') refreshBar();
  }
}
function confirmBuy(msg: string, ic: HomeIcon): Promise<boolean> {
  return new Promise((res) => {
    const sh = $('.hm-sheet');
    sh.innerHTML = `<div class="hm-card"><h2>${hicon(ic, 28)} ${esc(msg)}</h2><div class="hm-row"><button class="hm-btn" data-n>${esc(t('home.cancel', 'Cancelar'))}</button><span class="grow"></span><button class="hm-btn hm-go" data-y>${hicon('check', 20)} ${esc(t('home.buy.yes', 'Liberar'))}</button></div></div>`;
    sh.classList.add('on');
    const done = (v: boolean) => {
      ui.close();
      res(v);
    };
    sh.onclick = (e) => {
      const tg = e.target as HTMLElement;
      if (tg === sh || tg.closest('[data-n]')) done(false);
      else if (tg.closest('[data-y]')) done(true);
    };
  });
}

/* ---------------- construtor (planeta + fachada) ---------------- */
let buildSect: 'planet' | 'exterior' = 'planet';
let buildGroup = '';
const GROUP_NAMES: Record<string, () => string> = {
  shape: () => t('home.grp.shape', 'Formato'), ground: () => t('home.grp.ground', 'Chão'), sky: () => t('home.grp.sky', 'Céu'), nature: () => t('home.grp.nature', 'Natureza'), decor: () => t('home.grp.decor', 'Enfeites'),
  base: () => t('home.grp.base', 'Base'), walls: () => t('home.grp.walls', 'Paredes'), roof: () => t('home.grp.roof', 'Telhado'), door: () => t('home.grp.door', 'Porta'), windows: () => t('home.grp.windows', 'Janelas'), extras: () => t('home.grp.extras', 'Extras'), yard: () => t('home.grp.yard', 'Quintal'),
};
function buildBar(bar: HTMLElement): void {
  bar.className = 'hm-bar panel';
  const fields = buildSect === 'planet' ? PLANET_FIELDS : EXTERIOR_FIELDS;
  const groups = [...new Set(fields.map((f) => f.group))];
  if (!groups.includes(buildGroup)) buildGroup = groups[0];
  const rec = (buildSect === 'planet' ? S.design.planet : S.design.exterior) as Record<string, string | number>;
  const rows = fields
    .filter((f) => f.group === buildGroup)
    .map((f) => {
      const cur = num(rec, f.key);
      const key = (i: number) => `${buildSect}.${f.key}${f.color ? '#' : ''}:${i}`;
      const items = f.color
        ? PALETTE.map((c, i) => `<button class="hm-sw ${i === cur ? 'on' : ''}" style="background:${c}" data-a="opt" data-f="${f.key}" data-i="${i}">${colorCost(i).kind !== 'free' && !owns(key(i)) ? `<span class="lk">${hicon('lock', 14)}</span>` : ''}</button>`).join('')
        : f.options!.map((o, i) => `<button class="hm-opt ${i === cur ? 'on' : ''}" data-a="opt" data-f="${f.key}" data-i="${i}">${esc(o())}${priceTag(key(i), costOfField(f, i))}</button>`).join('');
      const extra = passData()
        .exterior.filter((x) => x.section === buildSect && x.field === f.key)
        .map((x) => `<button class="hm-opt ${rec[f.key + 'P'] === x.id ? 'on' : ''} ${x.owned ? '' : 'locked'}" data-a="${x.owned ? 'pext' : 'passlock'}" data-f="${f.key}" data-i="${x.base}" data-id="${x.id}"><img src="${passThumb(x.item, 30)}" width="30" height="30" alt="">${esc(x.item.name)}<span class="price">${x.owned ? '' : hicon('lock', 12)}${esc(t('home.pass', 'Passe'))}</span></button>`)
        .join('');
      return `<div class="hm-lbl">${esc(f.label())}</div><div class="hm-row scroll">${items}${extra}</div>`;
    })
    .join('');
  bar.innerHTML = `<div class="hm-row"><button class="hm-chip ${buildSect === 'planet' ? 'on' : ''}" data-a="sect" data-s="planet">${hicon('planet', 18)}</button><button class="hm-chip ${buildSect === 'exterior' ? 'on' : ''}" data-a="sect" data-s="exterior">${hicon('house', 18)}</button>
      <div class="hm-row scroll grow" style="padding:0">${groups.map((g) => `<button class="hm-chip ${g === buildGroup ? 'on' : ''}" data-a="grp" data-g="${g}">${esc(GROUP_NAMES[g]?.() ?? g)}</button>`).join('')}</div></div>
    <div class="hm-scrollv">${rows}</div>
    <div class="hm-row"><button class="hm-btn hm-ibtn" data-a="undo" ${undo.length ? '' : 'disabled'}>${hicon('undo', 24)}</button><button class="hm-btn hm-ibtn" data-a="redo" ${redo.length ? '' : 'disabled'}>${hicon('redo', 24)}</button>
      <button class="hm-btn" data-a="rand">${hicon('dice', 22)} ${esc(t('home.surprise', 'Surpreenda-me'))}</button>${buildSect === 'exterior' ? `<button class="hm-btn hm-pink hm-ibtn" data-a="paintext" aria-label="${esc(t('home.paintext', 'Pintar fachada'))}">${hicon('roller', 24)}</button>` : ''}<span class="grow"></span><button class="hm-btn hm-go" data-a="save">${hicon('save', 20)}</button></div>`;
}
async function chooseOpt(key: string, i: number): Promise<void> {
  const fields: Field[] = buildSect === 'planet' ? PLANET_FIELDS : EXTERIOR_FIELDS;
  const f = fields.find((x) => x.key === key)!;
  const okey = `${buildSect}.${f.key}${f.color ? '#' : ''}:${i}`;
  if (!(await acquire(okey, costOfField(f, i)))) return;
  const rec = (buildSect === 'planet' ? S.design.planet : S.design.exterior) as Record<string, string | number>;
  rec[key] = i;
  delete rec[key + 'P'];
  hsfx.place();
  bus.emit('home-build', { item: okey });
  changed();
  buildBar($('.hm-bar'));
  pop = 1;
}
function surprise(): void {
  const own = (k: string, i: number) => {
    const [sect, rest] = k.split('.');
    const fk = rest.replace('#', '');
    const f = (sect === 'planet' ? PLANET_FIELDS : EXTERIOR_FIELDS).find((x) => x.key === fk)!;
    return costOfField(f, i).kind === 'free' || owns(`${k}:${i}`);
  };
  const d = randomDesign((Math.random() * 1e9) | 0, own, S.design.rooms);
  S.design.planet = d.planet;
  S.design.exterior = d.exterior;
  hsfx.done();
  changed();
  buildBar($('.hm-bar'));
  pop = 1;
}
let pop = 0;

/* ---------------- pintar fachada ---------------- */
let extPainter: Painter | null = null;
let extA: HTMLCanvasElement | null = null;
let extB: HTMLCanvasElement | null = null;
let extComp: HTMLCanvasElement | null = null;
const EXT_S = 2.1;
function extRect(): [number, number, number, number] {
  const floors = num(S.design.exterior, 'floors') + 1;
  const found = num(S.design.exterior, 'found');
  const lift = found === 3 ? 10 : found === 1 ? 12 : 0;
  const h = floors * 46 * EXT_S;
  return [180 - 50 * EXT_S, 360 - lift * EXT_S - h, 100 * EXT_S, h];
}
function startPaintExt(): void {
  const [x, y, w, h] = extRect();
  extPainter = new Painter(x, y, w, h);
  extPainter.tape = scene.painter.tape;
  extPainter.setPaint((num(S.design.exterior, 'wcol') + 5) % PALETTE.length, 'solid');
  view = 'paintExt';
  rebuildExt();
  refreshBar();
  refreshTop();
}
function houseCanvas(ext: Record<string, string | number>): HTMLCanvasElement {
  const [c2, x] = makeCanvas(RW * 2, RH * 2);
  x.scale(2, 2);
  x.translate(180, 360);
  x.scale(EXT_S, EXT_S);
  drawHouse(x, ext, S.name, 400, 0);
  return c2;
}
function rebuildExt(): void {
  const P = extPainter!;
  extA = houseCanvas(S.design.exterior);
  extB = houseCanvas({ ...S.design.exterior, wcol: P.colorIdx, wfin: FINISHES.indexOf(P.finish) });
  compExt();
}
function compExt(): void {
  const P = extPainter!;
  const [c2, x] = extComp && extComp.width === RW * 2 ? [extComp, extComp.getContext('2d')!] : makeCanvas(RW * 2, RH * 2);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, RW * 2, RH * 2);
  x.drawImage(P.canvas, P.rx * 2, P.ry * 2, P.rw * 2, P.rh * 2);
  x.globalCompositeOperation = 'source-in';
  x.drawImage(extB!, 0, 0);
  x.globalCompositeOperation = 'source-over';
  extComp = c2;
}
let extDrag = false;
function paintExtAt(lx: number, ly: number): void {
  const P = extPainter!;
  if (P.coverage() >= 1) return;
  const [x, y, w, h] = [P.rx, P.ry, P.rw, P.rh];
  if (lx < x - 10 || lx > x + w + 10 || ly < y - 10 || ly > y + h + 10) return;
  P.stamp(lx, ly, scene.paintTool);
  const cov = P.coverage();
  hsfx.paint(cov);
  if (cov >= 0.97) {
    P.fillAll();
    hsfx.done();
    S.design.exterior.wcol = P.colorIdx;
    S.design.exterior.wfin = FINISHES.indexOf(P.finish);
    S.design.paint = { ...(S.design.paint ?? {}), exterior: { wall: P.spec() } };
    changed();
    addCoins(P.tape ? 15 : 10);
    bus.emit('home-paint', { room: 'exterior' });
    toast(t('home.paint.house', 'Fachada novinha! +{n}', { n: P.tape ? 15 : 10 }), 'roller');
    scene.confetti(180, y + 20);
    rebuildExt();
  }
  compExt();
  const bar = root!.querySelector('.hm-pprog') as HTMLElement | null;
  if (bar) {
    (bar.firstElementChild as HTMLElement).style.width = Math.round(P.coverage() * 100) + '%';
    (bar.lastElementChild as HTMLElement).textContent = Math.floor(P.coverage() * 100) + '%';
  }
}
function paintExtBar(bar: HTMLElement): void {
  bar.className = 'hm-bar panel';
  paintPanel(bar, true);
}

/* ============================================================
 *  festa
 * ============================================================ */
async function startParty(hostId: string): Promise<void> {
  leaveParty();
  const api = await getApi();
  toast(t('home.party.joining', 'Preparando a festa...'), 'party');
  const s = await api.joinParty(hostId === 'me' ? S.myId : hostId, { botsIfAlone: 3 });
  session = s;
  scene.host.session = s;
  scene.chars = [];
  scene.cakeSlices = 8;
  const botsLocal = !s.online || s.hostId === S.myId;
  s.onPeers((p) => scene.setPeers(p));
  s.onEvent((e) => scene.onEvent(e, botsLocal));
  partyMusic(true);
  if (S.isOwner) bus.emit('party-host', { guests: 0 });
  else bus.emit('party-join', { hostId });
  scene.setRoom('party');
  scene.setMode('party');
  setView('room');
  toast(s.online ? t('home.party.on', 'Festa online! Só emotes, sem chat.') : t('home.party.bots', 'Festa com amigos-robô! (offline)'), 'party');
  if (isMock()) console.info('[casa] festa local (mock)');
}
function leaveParty(reward = false): void {
  if (!session) return;
  session.leave();
  session = null;
  scene.host.session = null;
  scene.chars = [];
  scene.holding = null;
  partyMusic(false);
  persistMess();
  if (reward) {
    bump('parties');
    bus.emit('pet-care', { action: 'party' });
    addStat('fun', 12);
    addCoins(10);
    toast(t('home.party.bye', 'Que festa! Seu bichinho ficou feliz. +10'), 'party');
  }
}

/* ============================================================
 *  entrada (canvas)
 * ============================================================ */
function toExtL(x: number, y: number): [number, number] {
  return scene.toL(x, y);
}
function pdown(x: number, y: number): void {
  if (view === 'room') scene.down(x, y);
  else if (view === 'paintExt') {
    extDrag = true;
    const [lx, ly] = toExtL(x, y);
    paintExtAt(lx, ly);
  } else if (view === 'planet') {
    // tocar na casa = entrar
    if (Math.abs(x - W / 2) < W * 0.2 && y > H * 0.15 && y < H * 0.55) {
      hsfx.click();
      enterRooms();
    }
  }
}
function pmove(x: number, y: number): void {
  if (view === 'room') scene.move(x, y);
  else if (view === 'paintExt' && extDrag) {
    const [lx, ly] = toExtL(x, y);
    paintExtAt(lx, ly);
  }
}
function pup(): void {
  if (view === 'room') scene.up();
  extDrag = false;
}

/* ============================================================
 *  laço
 * ============================================================ */
function loop(now: number): void {
  raf = requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (fpsCap === 30) {
    acc += dt;
    if (acc < 1 / 31) return;
  }
  const step = fpsCap === 30 ? Math.min(0.066, acc) : dt;
  acc = 0;
  const tt = now / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (view === 'planet' || view === 'build') {
    const top = view === 'build' ? 50 : 60;
    const bottom = view === 'build' ? barH() : barH() + 30;
    const ah = Math.max(160, H - top - bottom);
    const R = Math.min(W * 0.33, ah * 0.27);
    const img = planetSceneCanvas(S.design, Math.round(W * dpr), Math.round(H * dpr), { R: R * dpr, cy: (top + ah * 0.63) * dpr, name: S.name, mess: Math.min(1, S.mess.length / 12) });
    ctx.drawImage(img, 0, 0, W, H);
    if (pop > 0) {
      pop = Math.max(0, pop - step * 2.5);
      ctx.fillStyle = alpha('#ffffff', pop * 0.35);
      ctx.fillRect(0, 0, W, H);
    }
    // estrelinhas piscando (posições fixas, sem alocação)
    for (let i = 0; i < 6; i++) {
      const a = 0.5 + 0.5 * Math.sin(tt * 2 + i * 1.7);
      star(ctx, ((i * 97) % 100) / 100 * W, (((i * 53) % 40) / 100) * H + 70, 2 + a * 3, 4, 0.3);
      ctx.fillStyle = alpha('#ffffff', a * 0.9);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = '#1a0d40';
    ctx.fillRect(0, 0, W, H);
    if (view === 'room') scene.draw(ctx, step, tt);
    else if (view === 'paintExt' && extA) {
      const k = scene.s;
      ctx.save();
      ctx.translate(scene.ox, scene.oy);
      ctx.scale(k, k);
      const g = ctx.createLinearGradient(0, 0, 0, RH);
      g.addColorStop(0, '#9fe6ff');
      g.addColorStop(1, '#d8f6ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, RW, RH);
      ctx.fillStyle = '#4fd67a';
      ctx.fillRect(0, 360, RW, RH - 360);
      ctx.drawImage(extA, 0, 0, RW, RH);
      if (extComp) ctx.drawImage(extComp, 0, 0, RW, RH);
      const P = extPainter!;
      if (P.tape) {
        ctx.fillStyle = alpha('#5ea8ff', 0.8);
        ctx.fillRect(P.rx - 3, P.ry - 3, P.rw + 6, 5);
        ctx.fillRect(P.rx - 3, P.ry + P.rh - 2, P.rw + 6, 5);
        ctx.fillRect(P.rx - 3, P.ry, 5, P.rh);
        ctx.fillRect(P.rx + P.rw - 2, P.ry, 5, P.rh);
      }
      ctx.restore();
    }
  }
}

/* ---------------- abrir amigos ---------------- */
function showFriends(): void {
  void getApi().then((api) => {
    const h = api.myHandle();
    if (!h) {
      openHandle(ui, {
        first: true,
        done: (nh) => {
          if (nh) {
            S.name = nh;
            refreshTop();
            showFriends();
          }
        },
      });
      return;
    }
    void openFriends(ui, h, () =>
      openHandle(ui, {
        first: false,
        done: (nh) => {
          if (nh) S.name = nh;
          refreshTop();
          showFriends();
        },
      }),
    );
  });
}
export function openHandleEditor(): void {
  void openHome({}).then(() =>
    openHandle(ui, {
      first: false,
      done: (h) => {
        if (h) {
          S.name = h;
          refreshTop();
        }
      },
    }),
  );
}

/* ---------------- debug (dev page) ---------------- */
export const __homeDebug = {
  S: () => S,
  scene: () => scene,
  setView,
  enterRooms,
  startParty,
  visit,
  action,
  combos: () => countCombinations(),
  stats,
  hash: hashStr,
  paintExt: () => startPaintExt(),
  extPaint: (lx: number, ly: number) => paintExtAt(lx, ly),
  refreshBar,
  ui,
};
