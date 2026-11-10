/* ============================================================
 *  MODO 3D DA CASA — ponto de entrada (chunk carregado sob demanda).
 *  Uso pelo 2D:  const { open3D } = await import('../home3d');  (ou lazy.ts)
 *  open3D({ design, mess, ownerId, editable, onChange, party?, partyMode? })
 *  Fluxo: (fallback se sem WebGL / aparelho Mínimo) → girar o telefone →
 *  carregando (geração procedural em passos) → 3D → Sair (volta retrato,
 *  chama onChange com design+mess atualizados).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../i18n';
import { pushBack } from '../core/back';
import { detectInitialTier } from '../core/quality';
import { tap } from '../core/haptics';
import { save } from '../core/storage';
import { openEmoteWheel, closeEmoteWheel } from '../social/emotes';
import { canUse, cloneDesign, cloneMess, FINISHES, PALETTE, roleFor, type Tool, type MessKind, type Finish } from './adapter';
import { Engine } from './engine';
import { Fps, type FpsTool } from './fps';
import { Aerial, roomName, roomPrice } from './aerial';
import { Decor } from './decor';
import { Party } from './party';
import { handColors } from './hand';
import { disposeSfx, sfx } from './sfx';
import { Actions, askLandscape, button, el, ensureCss, esc, fallback, FpsInput, ICON, isLandscape, Loading, lockTip, playsPortrait, removeCss, Toast, unlockOrientation } from './ui';
import { lockOrientation } from '../core/orientation';
import { bus } from '../core/events';
import { splatTexture } from './textures';
import type { Close3DResult, Open3DOpts } from './types';
import type { HomeDesign, MessItem } from '../home/api';
import { initActivities, type Activities } from './activities'; // [casa-ativ]

export type { Open3DOpts, Close3DResult, MessItem3D, RoomItem3D, Mode3D } from './types';

let openNow = false;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    const g = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    const ok = !!g;
    (g?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    return ok;
  } catch {
    return false;
  }
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export async function open3D(opts: Open3DOpts): Promise<Close3DResult> {
  if (openNow) return { design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: 'declined' };
  openNow = true;
  ensureCss();
  const root = el('div', 'h3');
  document.body.appendChild(root);
  // botão voltar do Android: fecha o 3D (ou o aviso/carregamento) em vez de fechar a casa 2D por baixo
  backAction = () => (root.querySelector<HTMLElement>('.h3-full [data-act="back"]') ?? root.querySelector<HTMLElement>('.h3-full button'))?.click();
  const onBack = () => {
    backAction();
    // ainda aberto (ex.: carregando): continua na pilha até o 3D realmente fechar
    setTimeout(() => {
      if (root.isConnected) popB = pushBack(onBack);
    }, 0);
  };
  let popB = pushBack(onBack);
  const finish = (r: Close3DResult): Close3DResult => {
    popB();
    backAction = () => {};
    root.remove();
    removeCss();
    unlockOrientation();
    openNow = false;
    opts.onClose?.(r);
    return r;
  };
  // 1) pode rodar?
  if (!webglAvailable()) {
    await fallback(root, t('home3d.fallback.title', 'Sem 3D neste aparelho'), t('home3d.fallback.webgl', 'Este aparelho não consegue mostrar o 3D. Sua casa continua linda no 2D!'), false);
    return finish({ design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: 'webgl' });
  }
  if (!opts.force && detectInitialTier() === 0) {
    const r = await fallback(root, t('home3d.fallback.title2', 'O 3D pode ficar lento'), t('home3d.fallback.weak', 'Seu aparelho está no modo Mínimo. O 3D pode travar um pouco.'), true);
    if (r === 'back') return finish({ design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: 'declined' });
  }
  // 2) gira para paisagem
  if (!(await askLandscape(root, !!opts.skipRotate))) return finish({ design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: 'declined' });
  try {
    return finish(await run(root, opts));
  } catch (err) {
    console.error('[home3d]', err);
    return finish({ design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: 'error' });
  }
}

let backAction: () => void = () => {};

class Abort3D extends Error {
  constructor(readonly reason: Close3DResult['reason']) {
    super('abort3d:' + reason);
  }
}

async function run(root: HTMLElement, opts: Open3DOpts): Promise<Close3DResult> {
  // carregamento com saída garantida: Voltar sempre visível + prazo de 12 s (antes: tela azul infinita)
  let aborted: Close3DResult['reason'] | null = null;
  let wake!: () => void;
  const abortP = new Promise<void>((r) => (wake = r));
  const abort = (why: Close3DResult['reason']) => {
    if (aborted) return;
    aborted = why;
    wake();
  };
  const loading = new Loading(root, () => abort('declined'));
  const watchdog = setTimeout(
    () =>
      loading.fail(
        t('home3d.slow.title', 'O 3D está demorando'),
        t('home3d.slow.text', 'Este aparelho está demorando para montar o 3D. Sua casa continua no 2D!'),
        () => abort('timeout'),
      ),
    12000,
  );
  const tick = async () => {
    await Promise.race([frame(), abortP, new Promise((r) => setTimeout(r, 250))]);
    if (aborted) throw new Abort3D(aborted);
  };
  let eng: Engine | null = null;
  const design = cloneDesign(opts.design);
  const mess = cloneMess(opts.mess);
  const editable = !!(opts.editable ?? opts.isOwner);
  const session = opts.party ?? opts.session ?? null;
  const role = opts.role ?? roleFor(design, editable, opts.viewerId);
  let party: Party | null = null;
  let hud!: HTMLElement;
  let input!: FpsInput;
  let acts!: Actions;
  let toast!: Toast;
  let fps!: Fps;
  let startRoom!: ReturnType<Engine['roomById']> & object;
  let build!: Aerial;
  let decor!: Decor;
  try {
    loading.set(0.04, t('home3d.load.start', 'Preparando o pincel mágico...'));
    await tick();
    const stage = el('div', 'h3-layer');
    root.insertBefore(stage, loading.box);
    eng = new Engine(stage, design, mess, { editable, role });
    // 3) geração procedural em passos
    const steps = eng.buildSteps();
    const total = design.rooms.length * 2 + 4;
    let i = 0;
    for (let s = steps.next(); !s.done; s = steps.next()) {
      i++;
      const [k, room] = String(s.value).split(':');
      const label =
        k === 'room'
          ? t('home3d.load.room', 'Levantando paredes: {room}', { room: roomName(room) })
          : k === 'items'
            ? t('home3d.load.items', 'Trazendo os móveis: {room}', { room: roomName(room) })
            : k === 'physics'
              ? t('home3d.load.physics', 'Ligando a gravidade...')
              : k === 'mess'
                ? t('home3d.load.mess', 'Espalhando a bagunça...')
                : t('home3d.load.shaders', 'Acendendo as luzes...');
      loading.set(i / total, label);
      await tick();
    }
    // 4) modos
    party = session || opts.partyMode ? new Party(eng, session, true, opts.viewerId ?? 'me', opts.skin ?? save.skin) : null;
    hud = el('div', 'h3-layer');
    root.appendChild(hud);
    input = new FpsInput(hud);
    acts = new Actions(hud);
    toast = new Toast(hud, true);
    fps = new Fps(eng, input, acts, party, handColors(opts.skin));
    startRoom = (eng.roomById(opts.room ?? (party ? 'party' : 'living')) ?? eng.rooms[0])!;
    fps.spawn(startRoom);
    decor = new Decor(eng, hud, (s) => toast.show(s), opts.shop);
    fps.decor = decor;
    input.onTap = (x, y) => (mode === 'fps' ? fps.screenTap(x, y) : undefined);
    build = new Aerial(eng, hud, decor);
    loading.set(1, t('home3d.load.done', 'Pronto!'));
    await tick();
  } catch (err) {
    clearTimeout(watchdog);
    try {
      party?.dispose();
      input?.dispose();
      eng?.dispose();
    } catch {
      /* */
    }
    if (err instanceof Abort3D) return { design: opts.design, mess: opts.mess, cleaned: 0, broken: 0, reason: err.reason };
    throw err;
  }
  clearTimeout(watchdog);
  loading.remove();

  /* ---------------- HUD ---------------- */
  const ret = el('div', 'h3-ret');
  const tgt = el('div', 'h3-tgt');
  const prog = el('div', 'h3-prog', '<i></i><b></b>');
  const top = el('div', 'h3-top');
  const exitB = button(t('home3d.exit', 'Sair'), 'exit');
  const title = el('div', 'h3-title');
  const tools = el('div', 'h3-tools');
  top.append(exitB, title, tools);
  const palRow = el('div', 'h3-row');
  palRow.style.display = 'none';
  const shot = el('canvas', '');
  shot.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity .4s';
  hud.prepend(shot);
  hud.append(ret, tgt, prog, top, palRow);
  let mode: 'fps' | 'build' = 'fps';
  let flying = false;
  const toolDefs: { id: FpsTool | 'build' | 'emote' | 'cleanup' | 'catalog'; label: string; icon: string; need?: Tool }[] = [
    { id: 'hand', label: t('home3d.tool.hand', 'Mão'), icon: 'hand' },
    { id: 'clean', label: t('home3d.tool.clean', 'Limpar'), icon: 'clean', need: 'clean' },
    { id: 'paint', label: t('home3d.tool.paint', 'Pintar'), icon: 'paint', need: 'paint' },
    { id: 'decor', label: t('home3d.tool.decorate', 'Decorar'), icon: 'sofa', need: 'decorate' },
    { id: 'build', label: t('home3d.tool.aerial', 'Vista aérea'), icon: 'aerial', need: 'decorate' },
  ];
  if (party) {
    toolDefs.push({ id: 'cleanup', label: t('home3d.party.cleanup', 'Hora de limpar!'), icon: 'party' });
    toolDefs.push({ id: 'emote', label: t('home3d.emote', 'Emote'), icon: 'emote' });
  }
  /** em pé ou na festa: só a ferramenta atual + menu pequeno (antes: 6–7 pílulas tapando o topo) */
  let menuOpen = false;
  const compact = () => mode === 'fps' && (!!party || hud.clientWidth < hud.clientHeight * 1.15 || hud.clientWidth < 620);
  const renderTools = () => {
    tools.innerHTML = '';
    const small = compact();
    top.classList.toggle('compact', small);
    let host: HTMLElement = tools;
    if (small) {
      const cur = toolDefs.find((d) => d.id === fps.tool) ?? toolDefs[0];
      const tb = button(cur.label, cur.icon);
      tb.classList.add('sel', 'h3-tcur');
      tb.insertAdjacentHTML('beforeend', `<i class="car">${menuOpen ? '▴' : '▾'}</i>`);
      tb.onclick = () => {
        sfx.click();
        menuOpen = !menuOpen;
        renderTools();
      };
      tools.appendChild(tb);
      if (!menuOpen) return;
      host = el('div', 'h3-tmenu');
      host.dataset.touchIgnore = '1';
      tools.appendChild(host);
    } else menuOpen = false;
    for (const d of toolDefs) {
      if (mode === 'build' && d.id !== 'build' && d.id !== 'decor') continue;
      const allowed = !d.need || canUse(role, d.need);
      const label = mode === 'build' && d.id === 'build' ? t('home3d.tool.walk', 'Andar') : mode === 'build' && d.id === 'decor' ? t('home3d.tool.catalog', 'Catálogo') : d.id === 'cleanup' && party?.phase === 'clean' ? t('home3d.party.fight', 'Guerra de comida!') : d.label;
      const b = button(label, d.id === 'build' && mode === 'build' ? 'eye' : d.icon);
      b.dataset.tool = d.id;
      if ((fps.tool === d.id && mode === 'fps') || (mode === 'build' && d.id === 'decor' && decor.drawerOpen)) b.classList.add('sel');
      if (!allowed) {
        b.classList.add('lock');
        b.insertAdjacentHTML('beforeend', `<span class="lk">${ICON.lock}</span>`);
        b.onclick = () => lockTip(hud, b, t('home3d.lock.role', 'O dono da casa não liberou isso para você'));
      } else
        b.onclick = () => {
          sfx.click();
          tap('light');
          menuOpen = false;
          if (flying) return;
          if (d.id === 'build') setMode(mode === 'build' ? 'fps' : 'build');
          else if (d.id === 'decor' && mode === 'build') decor.toggleCatalog();
          else if (d.id === 'emote')
            openEmoteWheel((code) => {
              myEmote = code;
              myEmoteT = 3;
              toast.show(t('home3d.emote.sent', 'Você mandou um emote!'));
              const mates = party ? [...party.mates.values()] : [];
              if (mates.length) setTimeout(() => party!.emote(mates[Math.floor(Math.random() * mates.length)], code === 'oi' ? 'oi' : 'joinha'), 700);
            }),
              fixWheelZ();
          else if (d.id === 'cleanup') {
            party!.setPhase(party!.phase === 'clean' ? 'fight' : 'clean');
            toast.show(party!.phase === 'clean' ? t('home3d.party.cleanTime', 'Todo mundo limpando!') : t('home3d.party.fightTime', 'Guerra de comida!'));
          } else {
            if (d.id === 'decor' && fps.tool === 'decor') decor.toggleCatalog();
            else if (d.id === 'decor') decor.openCatalog();
            fps.setTool(d.id as FpsTool);
            palRow.style.display = d.id === 'paint' ? '' : 'none';
            prog.style.display = d.id === 'paint' ? 'block' : 'none';
            if (d.id === 'paint') updateProg();
          }
          renderTools();
        };
      host.appendChild(b);
    }
  };
  // girou o aparelho: refaz o topo (compacto em pé) e, se não foi escolha do jogador, pede paisagem de novo
  let lastLock = 0;
  const onOrient = () => {
    renderTools();
    if (playsPortrait() || opts.skipRotate || isLandscape() || closed) return;
    const now = performance.now();
    if (now - lastLock < 1500) return;
    lastLock = now;
    void lockOrientation('landscape');
  };
  window.addEventListener('resize', onOrient);
  const offResume = bus.on('app-resume', () => setTimeout(onOrient, 300));
  const fixWheelZ = () => requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.sc-wheel').forEach((w) => (w.style.zIndex = '9500')));
  let myEmote = '';
  let myEmoteT = 0;
  // paleta de tintas (mesmo formato do 2D: "<corIdx>:<acabamento>")
  let paintIdx = 12;
  let paintFin: Finish = 'solid';
  const finName: Record<Finish, string> = {
    solid: t('home3d.fin.solid', 'Lisa'),
    gradient: t('home3d.fin.gradient', 'Degradê'),
    stripes: t('home3d.fin.stripes', 'Listras'),
    stars: t('home3d.fin.stars', 'Estrelas'),
    glitter: t('home3d.fin.glitter', 'Glitter'),
  };
  const setPaint = () => {
    fps.paintColor = paintIdx + ':' + paintFin;
    fps.setTool('paint');
  };
  for (const f of FINISHES) {
    const b = el('button', 'h3-chip' + (f === paintFin ? ' sel' : ''), esc(finName[f]));
    b.dataset.fin = f;
    b.onclick = () => {
      palRow.querySelectorAll('[data-fin]').forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel');
      paintFin = f;
      setPaint();
      sfx.click();
    };
    palRow.appendChild(b);
  }
  PALETTE.forEach((p, idx) => {
    const sw = el('div', 'h3-sw');
    sw.style.background = p;
    if (idx === paintIdx) sw.classList.add('sel');
    sw.onclick = () => {
      palRow.querySelectorAll('.h3-sw.sel').forEach((x) => x.classList.remove('sel'));
      sw.classList.add('sel');
      paintIdx = idx;
      setPaint();
      sfx.click();
    };
    palRow.appendChild(sw);
  });
  const updateProg = (room = eng.roomAt(eng.camera.position.x, eng.camera.position.z), p?: number) => {
    const v = p ?? (room ? eng.paintProgress(room) : 0);
    (prog.firstElementChild as HTMLElement).style.width = Math.round(v * 100) + '%';
    prog.querySelector('b')!.textContent = t('home3d.paint.progress', 'Pintura {p}%', { p: Math.round(v * 100) });
  };
  fps.onProgress = (r, p) => updateProg(r, p);
  fps.onToast = (s) => toast.show(s);
  /** móvel novo do catálogo nasce ~2 m à frente, no cômodo onde o jogador está */
  const fpsSpawn = () => {
    const cam = eng.camera;
    const room = eng.roomAt(cam.position.x, cam.position.z) ?? startRoom;
    const f = new THREE.Vector3();
    cam.getWorldDirection(f);
    f.y = 0;
    if (f.lengthSq() < 1e-6) f.set(0, 0, -1);
    f.normalize();
    const l = room.group.worldToLocal(cam.position.clone().addScaledVector(f, 2).setY(0));
    return { room, x: Math.max(0.6, Math.min(5.4, l.x)), z: Math.max(0.6, Math.min(4.2, l.z)), y: 1.4 };
  };
  build.onToast = (s) => toast.show(s);
  decor.onState = () => renderTools();
  decor.spawnAt = fpsSpawn;
  // ampliar a casa: só o dono; cobra moedas pela loja do 2D (sem loja = teste, grátis)
  if (editable)
    build.buyRoom = async (id, price) => {
      if (!opts.shop) return true;
      if (opts.shop.coins() < price) return false;
      return opts.shop.buy('room:' + id, { kind: 'coins', n: price });
    };
  build.onRoomAdded = () => {
    eng.changed = true;
    emit();
  };
  void roomPrice;
  if (party) {
    party.onToast = (s) => toast.show(s, 900);
    party.onHitMe = (k) => splatScreen(k);
  }
  fps.onLabel = (s) => {
    tgt.textContent = s;
    tgt.classList.toggle('on', !!s);
    ret.classList.toggle('hot', !!s);
  };
  fps.onCleaned = (n) => toast.show(t('home3d.toast.clean', 'Limpinho! ({n})', { n }), 900);
  // borrão de comida na tela (alguém acertou você)
  const splatScreen = (k: MessKind) => {
    const r = hud.getBoundingClientRect();
    shot.width = Math.round(r.width / 2);
    shot.height = Math.round(r.height / 2);
    const c = shot.getContext('2d')!;
    c.clearRect(0, 0, shot.width, shot.height);
    const img = splatTexture(k, Math.floor(Math.random() * 3)).image as HTMLCanvasElement;
    for (let j = 0; j < 3; j++) {
      const s = shot.height * (0.5 + Math.random() * 0.5);
      c.globalAlpha = 0.9;
      c.drawImage(img, Math.random() * (shot.width - s), Math.random() * (shot.height - s), s, s);
    }
    shot.style.transition = 'none';
    shot.style.opacity = '1';
    requestAnimationFrame(() => {
      shot.style.transition = 'opacity 2.2s ease-in 0.6s';
      shot.style.opacity = '0';
    });
    toast.show(t('home3d.party.gotHit', 'Splash! Te acertaram!'), 1000);
    tap('medium');
  };
  const setMode = (m: 'fps' | 'build', instant = false) => {
    decor.reset();
    if (m === 'build') {
      mode = m;
      const r = eng.roomAt(eng.camera.position.x, eng.camera.position.z) ?? startRoom;
      fps.setActive(false);
      build.enter(instant ? r : null);
      ret.style.display = tgt.style.display = 'none';
      acts.set([]);
      palRow.style.display = prog.style.display = 'none';
      if (eng.point) eng.point.position.set(r.center.x, 3.2, r.center.z);
    } else if (mode === 'build') {
      // voa de volta para o olho e só então devolve o controle
      flying = true;
      build.leave(fps.eyePose(), () => {
        flying = false;
        mode = 'fps';
        fps.setActive(true);
        decor.spawnAt = fpsSpawn;
        ret.style.display = tgt.style.display = '';
        if (fps.tool === 'paint') palRow.style.display = '';
        renderTools();
      });
    } else {
      mode = m;
      fps.setActive(true);
      ret.style.display = tgt.style.display = '';
      if (fps.tool === 'paint') palRow.style.display = '';
    }
    title.textContent = m === 'build' ? t('home3d.title.build', 'Montando a casa') : party ? t('home3d.title.party', 'Festa!') : editable ? t('home3d.title.mine', 'Minha casa') : opts.handle ? t('home3d.title.of', 'Casa de @{h}', { h: opts.handle }) : t('home3d.title.visit', 'Visitando');
    renderTools();
  };
  setMode(opts.mode === 'build' && canUse(role, 'decorate') ? 'build' : 'fps', true);
  maybeCoach(hud, editable && canUse(role, 'decorate'));

  /* [casa-ativ] vida em casa: cozinha livre, tarefas, preparar festa (src/home3d/activities) */
  let acts3: Activities | null = null;
  try {
    acts3 = initActivities({
      eng,
      fps,
      hud,
      partyActive: () => !!party,
      startParty: () => {
        if (party) return;
        party = new Party(eng, null, true, opts.viewerId ?? 'me', opts.skin ?? save.skin);
        (fps as unknown as { party: Party }).party = party;
        party.onToast = (s) => toast.show(s, 900);
        party.onHitMe = (k) => splatScreen(k);
        toolDefs.push({ id: 'cleanup', label: t('home3d.party.cleanup', 'Hora de limpar!'), icon: 'party' });
        toolDefs.push({ id: 'emote', label: t('home3d.emote', 'Emote'), icon: 'emote' });
        title.textContent = t('home3d.title.party', 'Festa!');
        renderTools();
      },
    });
  } catch (e) {
    console.warn('[home3d] activities', e);
  }

  /* ---------------- laço ---------------- */
  let raf = 0;
  let last = performance.now();
  let saveT = 0;
  let syncT = 0;
  const sent = new Map<string, string>();
  if (party) party.onDesign = (room) => sent.delete(room);
  let closed = false;
  const stats = { frames: 0, ms: 0, fps: 0, tier: eng.q.tier };
  const writeBack = (s: { design: HomeDesign; mess: MessItem[] }) => {
    // mesmos objetos que o 2D passou (S.design / S.mess)
    const d = opts.design as unknown as Record<string, unknown>;
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, JSON.parse(JSON.stringify(s.design)));
    opts.mess.splice(0, opts.mess.length, ...(JSON.parse(JSON.stringify(s.mess)) as MessItem[]));
  };
  const emit = () => {
    if (!eng.changed) return;
    eng.changed = false;
    const s = eng.snapshot();
    try {
      opts.onChange?.(s.design, s.mess);
    } catch (e) {
      console.warn('[home3d] onChange', e);
    }
  };
  let resolveExit!: (r: Close3DResult) => void;
  const done = new Promise<Close3DResult>((r) => (resolveExit = r));
  const close = (reason: Close3DResult['reason']) => {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(raf);
    fps.drop(false);
    decor.reset();
    const s = eng.snapshot();
    try {
      writeBack(s);
      opts.onChange?.(s.design, s.mess);
    } catch (e) {
      console.warn('[home3d] onChange', e);
    }
    if (!editable && eng.cleaned > 0) opts.onReward?.('clean', eng.cleaned);
    const res: Close3DResult = { design: s.design, mess: s.mess, cleaned: eng.cleaned, broken: eng.broken, reason };
    closeEmoteWheel();
    acts3?.dispose(); // [casa-ativ]
    fps.dispose();
    decor.dispose();
    build.dispose();
    party?.dispose();
    input.dispose();
    toast.dispose();
    eng.dispose();
    disposeSfx();
    window.removeEventListener('resize', onOrient);
    offResume?.();
    if (opts.debug) delete (window as unknown as { __home3d?: unknown }).__home3d;
    resolveExit(res);
  };
  exitB.onclick = () => {
    sfx.click();
    close('exit');
  };
  backAction = () => close('exit');
  eng.onContextLost = () => {
    cancelAnimationFrame(raf);
    void fallback(root, t('home3d.lost.title', 'O 3D cansou'), t('home3d.lost.text', 'O aparelho precisou pausar o 3D. Suas mudanças foram guardadas.'), false).then(() => close('error'));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') close('exit');
  };
  window.addEventListener('keydown', onKey);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    const ms = now - last;
    last = now;
    const dt = Math.min(1 / 20, ms / 1000);
    const w0 = performance.now();
    if (mode === 'fps' && !flying) fps.update(dt);
    else build.update(dt);
    decor.update(dt);
    acts3?.update(dt, mode === 'fps' && !flying); // [casa-ativ]
    party?.update(dt, fps.pos, eng.camera.position, () => {
      party?.sendState(fps.pos, fps.held?.food?.kind, myEmoteT > 0 ? myEmote : undefined);
    });
    if (myEmoteT > 0) myEmoteT -= dt;
    eng.step(dt);
    eng.render();
    eng.gov.sample(ms, performance.now() - w0);
    stats.frames++;
    stats.ms += ms;
    if (stats.ms > 1000) {
      stats.fps = Math.round((stats.frames * 1000) / stats.ms);
      stats.frames = 0;
      stats.ms = 0;
      stats.tier = eng.q.tier;
    }
    syncT += dt;
    if (syncT > 1 && session && canUse(role, 'decorate')) {
      syncT = 0;
      for (const r of eng.rooms) {
        const pr = eng.paintRecord(r);
        const sig = JSON.stringify(r.design.items) + JSON.stringify(pr);
        if (sent.get(r.id) !== sig) {
          if (sent.has(r.id)) party?.sendDesign(r.id, r.design.items, pr ?? undefined);
          sent.set(r.id, sig);
        }
      }
    }
    saveT += dt;
    if (saveT > 5) {
      saveT = 0;
      emit();
    }
  };
  raf = requestAnimationFrame(loop);
  if (opts.debug || location.search.includes('debug')) (window as unknown as { __home3d: unknown }).__home3d = { eng, fps, build, decor, party, stats, setMode, close, THREE, acts: acts3?.debugApi() }; // [casa-ativ] acts
  void esc;
  const res = await done;
  window.removeEventListener('keydown', onKey);
  return res;
}

/* ---------------- primeira vez no 3D: 3 dicas rápidas (puláveis) ---------------- */
const COACH_KEY = 'bw-h3-coach-v1';
function maybeCoach(hud: HTMLElement, canDeco: boolean): void {
  try {
    if (localStorage.getItem(COACH_KEY) && !location.search.includes('coach')) return;
  } catch {
    return;
  }
  const tips: [string, string, string][] = [
    ['hand', t('home3d.coach.t1', 'Andar e olhar'), t('home3d.coach.p1', 'Lado esquerdo da tela: andar. Arraste o resto da tela para olhar em volta.')],
    ...(canDeco
      ? ([
          ['sofa', t('home3d.coach.t2', 'Toque num móvel'), t('home3d.coach.p2', 'Toque em qualquer móvel (até no tapete!) para mover, girar, trocar a cor ou guardar.')],
          ['aerial', t('home3d.coach.t3', 'Catálogo e Vista aérea'), t('home3d.coach.p3', 'Em Decorar você pega móveis novos. Na Vista aérea dá para arrumar tudo de cima e ampliar a casa.')],
        ] as [string, string, string][])
      : []),
  ];
  let i = 0;
  const box = el('div', 'h3-coach');
  const card = el('div', 'cd');
  box.appendChild(card);
  hud.appendChild(box);
  const end = () => {
    box.remove();
    try {
      localStorage.setItem(COACH_KEY, '1');
    } catch {
      /* */
    }
  };
  const draw = () => {
    const [ic, h, p] = tips[i];
    card.innerHTML = `<div class="ic">${ICON[ic] ?? ''}</div><h3>${esc(h)}</h3><p>${esc(p)}</p><div class="dots">${tips.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>`;
    const row = el('div', 'rw');
    const skip = button(t('home3d.coach.skip', 'Pular'), 'x');
    skip.onclick = () => (sfx.click(), end());
    const next = button(i < tips.length - 1 ? t('home3d.coach.next', 'Próximo') : t('home3d.coach.go', 'Bora!'), 'check');
    next.classList.add('sel');
    next.onclick = () => {
      sfx.click();
      if (++i >= tips.length) end();
      else draw();
    };
    if (i < tips.length - 1) row.appendChild(skip);
    row.appendChild(next);
    card.appendChild(row);
  };
  draw();
}
