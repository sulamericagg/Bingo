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
import { detectInitialTier } from '../core/quality';
import { tap } from '../core/haptics';
import { save } from '../core/storage';
import { openEmoteWheel, closeEmoteWheel } from '../social/emotes';
import { canUse, cloneDesign, cloneMess, FINISHES, PALETTE, roleFor, type Tool, type MessKind, type Finish } from './adapter';
import { Engine } from './engine';
import { Fps, type FpsTool } from './fps';
import { Build, roomName } from './build';
import { Party } from './party';
import { handColors } from './hand';
import { disposeSfx, sfx } from './sfx';
import { Actions, askLandscape, button, el, ensureCss, esc, fallback, FpsInput, ICON, Loading, lockTip, removeCss, Toast, unlockOrientation } from './ui';
import { splatTexture } from './textures';
import type { Close3DResult, Open3DOpts } from './types';
import type { HomeDesign, MessItem } from '../home/api';

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
  const finish = (r: Close3DResult): Close3DResult => {
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

async function run(root: HTMLElement, opts: Open3DOpts): Promise<Close3DResult> {
  const loading = new Loading(root);
  loading.set(0.04, t('home3d.load.start', 'Preparando o pincel mágico...'));
  await frame();
  const design = cloneDesign(opts.design);
  const mess = cloneMess(opts.mess);
  const editable = !!(opts.editable ?? opts.isOwner);
  const session = opts.party ?? opts.session ?? null;
  const role = opts.role ?? roleFor(design, editable, opts.viewerId);
  const stage = el('div', 'h3-layer');
  root.insertBefore(stage, loading.box);
  const eng = new Engine(stage, design, mess, { editable, role });
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
    await frame();
  }
  // 4) modos
  const party = session || opts.partyMode ? new Party(eng, session, true, opts.viewerId ?? 'me', opts.skin ?? save.skin) : null;
  const hud = el('div', 'h3-layer');
  root.appendChild(hud);
  const input = new FpsInput(hud);
  const acts = new Actions(hud);
  const toast = new Toast(hud);
  const fps = new Fps(eng, input, acts, party, handColors(opts.skin));
  const startRoom = eng.roomById(opts.room ?? (party ? 'party' : 'living')) ?? eng.rooms[0];
  fps.spawn(startRoom);
  const build = new Build(eng, hud, startRoom);
  loading.set(1, t('home3d.load.done', 'Pronto!'));
  await frame();
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
  const toolDefs: { id: FpsTool | 'build' | 'emote' | 'cleanup'; label: string; icon: string; need?: Tool }[] = [
    { id: 'hand', label: t('home3d.tool.hand', 'Mão'), icon: 'hand' },
    { id: 'clean', label: t('home3d.tool.clean', 'Limpar'), icon: 'clean', need: 'clean' },
    { id: 'paint', label: t('home3d.tool.paint', 'Pintar'), icon: 'paint', need: 'paint' },
    { id: 'decor', label: t('home3d.tool.decor', 'Mover'), icon: 'grab', need: 'decorate' },
    { id: 'build', label: t('home3d.tool.build', 'De cima'), icon: 'build', need: 'decorate' },
  ];
  if (party) {
    toolDefs.push({ id: 'cleanup', label: t('home3d.party.cleanup', 'Hora de limpar!'), icon: 'party' });
    toolDefs.push({ id: 'emote', label: t('home3d.emote', 'Emote'), icon: 'emote' });
  }
  const renderTools = () => {
    tools.innerHTML = '';
    for (const d of toolDefs) {
      if (mode === 'build' && d.id !== 'build') continue;
      const allowed = !d.need || canUse(role, d.need);
      const b = button(d.id === 'build' && mode === 'build' ? t('home3d.tool.walk', 'Andar') : d.id === 'cleanup' && party?.phase === 'clean' ? t('home3d.party.fight', 'Guerra de comida!') : d.label, d.id === 'build' && mode === 'build' ? 'eye' : d.icon);
      if (fps.tool === d.id && mode === 'fps') b.classList.add('sel');
      if (!allowed) {
        b.classList.add('lock');
        b.insertAdjacentHTML('beforeend', `<span class="lk">${ICON.lock}</span>`);
        b.onclick = () => lockTip(hud, b, t('home3d.lock.role', 'O dono da casa não liberou isso para você'));
      } else
        b.onclick = () => {
          sfx.click();
          tap('light');
          if (d.id === 'build') setMode(mode === 'build' ? 'fps' : 'build');
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
            fps.setTool(d.id as FpsTool);
            palRow.style.display = d.id === 'paint' ? '' : 'none';
            prog.style.display = d.id === 'paint' ? 'block' : 'none';
            if (d.id === 'paint') updateProg();
          }
          renderTools();
        };
      tools.appendChild(b);
    }
  };
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
  build.onToast = (s) => toast.show(s);
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
  const setMode = (m: 'fps' | 'build') => {
    mode = m;
    if (m === 'build') {
      const r = eng.roomAt(eng.camera.position.x, eng.camera.position.z) ?? startRoom;
      fps.setActive(false);
      build.enter(r);
      ret.style.display = tgt.style.display = 'none';
      acts.set([]);
      palRow.style.display = prog.style.display = 'none';
      if (eng.point) eng.point.position.set(r.center.x, 3.2, r.center.z);
    } else {
      build.exit();
      fps.setActive(true);
      ret.style.display = tgt.style.display = '';
      if (fps.tool === 'paint') palRow.style.display = '';
    }
    title.textContent = m === 'build' ? t('home3d.title.build', 'Montando a casa') : party ? t('home3d.title.party', 'Festa!') : editable ? t('home3d.title.mine', 'Minha casa') : opts.handle ? t('home3d.title.of', 'Casa de @{h}', { h: opts.handle }) : t('home3d.title.visit', 'Visitando');
    renderTools();
  };
  setMode(opts.mode === 'build' && canUse(role, 'decorate') ? 'build' : 'fps');

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
    if (build.ghost) build.exit();
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
    fps.dispose();
    build.dispose();
    party?.dispose();
    input.dispose();
    eng.dispose();
    disposeSfx();
    if (opts.debug) delete (window as unknown as { __home3d?: unknown }).__home3d;
    resolveExit(res);
  };
  exitB.onclick = () => {
    sfx.click();
    close('exit');
  };
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
    if (mode === 'fps') fps.update(dt);
    else build.update(dt);
    party?.update(dt, fps.pos, eng.camera.position, () => {
      party.sendState(fps.pos, fps.held?.food?.kind, myEmoteT > 0 ? myEmote : undefined);
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
  if (opts.debug) (window as unknown as { __home3d: unknown }).__home3d = { eng, fps, build, party, stats, setMode, close, THREE };
  void esc;
  const res = await done;
  window.removeEventListener('keydown', onKey);
  return res;
}
