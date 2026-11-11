/* ============================================================
 *  BLOOP CINEMA — painéis do editor (abas): Cena, Elenco, Ator,
 *  Falas, Câmera, Efeitos, Som, Plano. Cada render() refaz o HTML
 *  do painel; eventos por delegação (data-a / data-k).
 * ============================================================ */
import { fmtDec, t } from '../i18n';
import { esc } from '../ui/dom';
import { notify } from '../ui/notify';
import { ownsPart, partName, partsOf, type Slot } from '../game/avatar';
import type { SongDef } from '../music/api';
import { BACKGROUNDS, BUBBLES, CAM3D, EXPRESSIONS, FX, FX_ON_ACTOR, POSES, SFX, SWATCHES, TRANSITIONS, VOICES, type Item } from './data';
import { evalActors, VOICE_RATE } from './engine';
import { clone, MAX_CAST, uid, type BubbleStyle, type Ease, type FxKind, type Line, type Project } from './format';
import { cleanText, isPro, paywall } from './gates';
import { actorThumb, clearThumbs } from './rig2d';
import { bgBitmap, BG_X0, BG_Y0 } from './bg2d';
import {
  addScene,
  addToShot,
  castById,
  cur,
  curShot,
  deleteActorKey,
  deleteShot,
  duplicateShot,
  editActorKey,
  editCamKey,
  moveShot,
  mutate,
  removeFromShot,
  S,
  trackOf,
  type Tab,
} from './state';
import { tutEvent } from './tutorial';
import { pickCast, recordSheet, confirm } from './sheets';
import { loadClip, previewClip, previewSong, rememberClip, songList, playSfx, actx, type Mixer } from './audio';
import { putClip } from './store';

export interface PanelCtx {
  host: HTMLElement;
  mixer: () => Mixer | null;
  setMode: (m: '2d' | '3d') => void;
  importStudio: () => void;
}

export const TABS: { id: Tab; label: () => string }[] = [
  { id: 'actor', label: () => t('cin.tab.actor', 'Ator') },
  { id: 'lines', label: () => t('cin.tab.lines', 'Falas') },
  { id: 'camera', label: () => t('cin.tab.camera', 'Câmera') },
  { id: 'fx', label: () => t('cin.tab.fx', 'Efeitos') },
  { id: 'shot', label: () => t('cin.tab.shot', 'Plano') },
  { id: 'scene', label: () => t('cin.tab.scene', 'Cenário') },
  { id: 'cast', label: () => t('cin.tab.cast', 'Elenco') },
  { id: 'sound', label: () => t('cin.tab.sound', 'Música') },
];

const proTag = (it: Item) => (it.pro && !isPro() ? '<b class="cin-pro">PRO</b>' : '');
const fmt1 = (n: number) => fmtDec(n);
const EASES: [Ease, () => string][] = [
  ['inout', () => t('cin.ease.inout', 'Suave')],
  ['linear', () => t('cin.ease.linear', 'Constante')],
  ['out', () => t('cin.ease.out', 'Freia')],
  ['back', () => t('cin.ease.back', 'Elástico')],
  ['bounce', () => t('cin.ease.bounce', 'Quique')],
  ['step', () => t('cin.ease.step', 'Pulo (corte)')],
];

function range(key: string, label: string, min: number, max: number, step: number, v: number, show = fmt1(v)): string {
  return `<label class="cin-field"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><output>${show}</output></label>`;
}
function chips<T extends string>(key: string, list: [T, string][], on: T | undefined): string {
  return `<div class="cin-chips">${list.map(([v, l]) => `<button class="cin-chip ${v === on ? 'on' : ''}" data-a="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
}

/** Itens Pro: avisa e devolve false se não pode. */
function canUse(it: Item | undefined): boolean {
  if (it?.pro && !isPro()) {
    paywall('item');
    return false;
  }
  return true;
}

/* ============================================================ */
export function renderPanel(c: PanelCtx): void {
  const h = c.host;
  h.onclick = h.oninput = h.onchange = null;
  const scroll = h.scrollTop;
  switch (S.tab) {
    case 'actor':
      actorPanel(c);
      break;
    case 'lines':
      linesPanel(c);
      break;
    case 'camera':
      cameraPanel(c);
      break;
    case 'fx':
      fxPanel(c);
      break;
    case 'shot':
      shotPanel(c);
      break;
    case 'scene':
      scenePanel(c);
      break;
    case 'cast':
      castPanel(c);
      break;
    case 'sound':
      void soundPanel(c);
      break;
  }
  h.scrollTop = scroll;
}

/* ---------------------------- ATOR ---------------------------- */
function actorSelector(): string {
  const shot = curShot();
  const inShot = new Set(shot.actors.map((a) => a.cast));
  return `<div class="cin-actorsel">${S.p.cast
    .map((c) => `<button data-a="pick" data-v="${c.id}" class="${c.id === S.sel ? 'on' : ''} ${inShot.has(c.id) ? '' : 'out'}" data-thumb="${c.id}"><span>${esc(c.name)}</span></button>`)
    .join('')}<button data-a="addcast">＋</button></div>`;
}
function fillThumbs(h: HTMLElement, px: number): void {
  h.querySelectorAll<HTMLElement>('[data-thumb]').forEach((b) => {
    const c = castById(b.dataset.thumb);
    if (c) b.prepend(actorThumb(c, px, 'stand', 'happy', 0.3, 'face'));
  });
}

function keyHere(castId: string): boolean {
  const { ref, local } = cur();
  return !!trackOf(ref.shot, castId)?.keys.some((k) => Math.abs(k.t - local) < 0.06);
}

function actorPanel(c: PanelCtx): void {
  const h = c.host;
  const { ref, local } = cur();
  const cast = castById(S.sel);
  const tr = trackOf(ref.shot, S.sel);
  let html = actorSelector();
  if (!S.p.cast.length) html += `<p class="cin-hint">${t('cin.actor.none', 'Seu filme ainda não tem elenco. Toque em ＋ para chamar alguém!')}</p>`;
  else if (!cast) html += `<p class="cin-hint">${t('cin.actor.pick', 'Toque num personagem na tela ou escolha acima.')}</p>`;
  else if (!tr) html += `<p class="cin-hint">${t('cin.actor.out', '{n} não está neste plano.', { n: esc(cast.name) })}</p><button class="cin-btn pri" data-a="enter">＋ ${t('cin.actor.enter', 'Colocar no plano')}</button>`;
  else {
    const ev = evalActors(S.p, ref, local).find((a) => a.cast.id === cast.id)!;
    const k = tr.keys.filter((x) => x.t <= local + 0.06).pop() ?? tr.keys[0];
    const here = keyHere(cast.id);
    html += `<div class="cin-row" style="margin:4px 0 2px"><span class="cin-hint cin-grow">${here ? '◆ ' + t('cin.actor.keyHere', 'Chave em {s} s', { s: fmt1(local) }) : '◇ ' + t('cin.actor.newKey', 'Mudar aqui cria uma chave em {s} s', { s: fmt1(local) })}</span>
      ${here && tr.keys.length > 1 ? `<button class="cin-btn sm" data-a="delkey">🗑 ${t('cin.actor.delKey', 'Chave')}</button>` : ''}
      <button class="cin-btn sm" data-a="leave">${t('cin.actor.leave', 'Sair do plano')}</button></div>`;
    html += `<h5>${t('cin.actor.expr', 'Expressão')}</h5><div class="cin-grid" data-g="expr">${EXPRESSIONS.map((e) => `<button class="cin-cell ${k.expr === e.id ? 'on' : ''}" data-a="expr" data-v="${e.id}" data-it="${e.id}">${proTag(e)}<span>${e.name}</span></button>`).join('')}</div>`;
    html += `<h5>${t('cin.actor.pose', 'Pose')}</h5><div class="cin-grid" data-g="pose">${POSES.map((p) => `<button class="cin-cell ${k.pose === p.id ? 'on' : ''}" data-a="pose" data-v="${p.id}" data-it="${p.id}">${proTag(p)}<span>${p.name}</span></button>`).join('')}</div>`;
    html += `<h5>${t('cin.actor.pos', 'Posição')}</h5>`;
    html += chips('face', [['-1', '← ' + t('cin.actor.left', 'Esquerda')], ['0', t('cin.actor.front', 'Frente')], ['1', t('cin.actor.right', 'Direita') + ' →']], String(k.face) as '-1' | '0' | '1');
    html += range('x', t('cin.actor.x', 'Lado'), -1, 17, 0.1, ev.x);
    html += range('z', t('cin.actor.z', 'Fundo/frente'), -3, 3, 0.1, ev.z);
    html += range('y', t('cin.actor.y', 'Altura'), 0, 5, 0.1, ev.y);
    html += `<h5>${t('cin.actor.ease', 'Jeito de chegar nesta chave')}</h5>` + chips('ease', EASES.map(([e, l]) => [e, l()]), k.ease);
    html += `<p class="cin-hint">${t('cin.actor.tip', 'Dica: arraste o personagem na tela para mover. Em outro instante, mova de novo: ele anda sozinho até lá!')}</p>`;
  }
  h.innerHTML = html;
  fillThumbs(h, 28);
  if (cast && tr) {
    h.querySelectorAll<HTMLElement>('[data-g="expr"] [data-it]').forEach((b) => b.prepend(actorThumb(cast, 46, 'stand', b.dataset.it as never, 0.3, 'face')));
    const curExpr = (tr.keys.filter((x) => x.t <= local + 0.06).pop() ?? tr.keys[0]).expr;
    h.querySelectorAll<HTMLElement>('[data-g="pose"] [data-it]').forEach((b) => b.prepend(actorThumb(cast, 46, b.dataset.it as never, curExpr, 0.45)));
  }
  h.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const v = b.dataset.v!;
    if (a === 'pick') {
      S.sel = v;
      if (!trackOf(curShot(), v)) addToShot(v);
      else mutate(() => {}, false);
      S.uiDirty = true;
    } else if (a === 'addcast') await addCast();
    else if (a === 'enter' && S.sel) addToShot(S.sel);
    else if (a === 'leave' && S.sel) removeFromShot(S.sel);
    else if (a === 'delkey' && S.sel) deleteActorKey(S.sel);
    else if (!S.sel) return;
    else if (a === 'expr') {
      if (!canUse(EXPRESSIONS.find((x) => x.id === v))) return;
      editActorKey(S.sel, { expr: v as never });
      tutEvent('expr');
    } else if (a === 'pose') {
      if (!canUse(POSES.find((x) => x.id === v))) return;
      editActorKey(S.sel, { pose: v as never });
    } else if (a === 'face') editActorKey(S.sel, { face: +v as -1 | 0 | 1 });
    else if (a === 'ease') editActorKey(S.sel, { ease: v as Ease });
  };
  h.oninput = (e) => {
    const i = e.target as HTMLInputElement;
    if (!i.dataset.k || !S.sel) return;
    (i.nextElementSibling as HTMLOutputElement).value = fmt1(+i.value);
    editActorKey(S.sel, { [i.dataset.k]: +i.value }, false);
  };
  h.onchange = (e) => {
    const i = e.target as HTMLInputElement;
    if (i.dataset.k && S.sel) editActorKey(S.sel, { [i.dataset.k]: +i.value }, true);
  };
}

export async function addCast(): Promise<void> {
  if (S.p.cast.length >= MAX_CAST) {
    notify(t('cin.cast.full', 'Máximo de 8 personagens por filme.'), { kind: 'warn' });
    return;
  }
  const c = await pickCast(S.p.cast.length);
  if (!c) return;
  mutate((p) => p.cast.push(c));
  S.sel = c.id;
  addToShot(c.id);
}

/* ---------------------------- FALAS ---------------------------- */
function linesPanel(c: PanelCtx): void {
  const h = c.host;
  const { ref, local } = cur();
  const shot = ref.shot;
  const lines = shot.lines.slice().sort((a, b) => a.t - b.t);
  const speakers = shot.actors.map((a) => castById(a.cast)).filter(Boolean) as NonNullable<ReturnType<typeof castById>>[];
  let html = `<div class="cin-row"><button class="cin-btn pri sm" data-a="add" data-v="speech">＋ ${t('cin.lines.add', 'Fala')}</button><button class="cin-btn sm" data-a="add" data-v="narration">＋ ${t('cin.lines.narr', 'Narração')}</button><button class="cin-btn sm" data-a="add" data-v="subtitle">＋ ${t('cin.lines.sub', 'Legenda')}</button></div>`;
  if (!lines.length) html += `<p class="cin-hint">${t('cin.lines.empty', 'Nenhuma fala neste plano ainda. A fala entra no instante da agulha vermelha.')}</p>`;
  html += '<div class="cin-list" style="margin-top:8px">';
  for (const l of lines) {
    const st = BUBBLES.find((b) => b.id === l.style);
    html += `<div class="cin-item ${l.id === S.selLine ? 'on' : ''}" data-line="${l.id}">
      <div class="cin-row">
        <select class="cin-input" style="width:auto;min-height:34px;padding:4px 6px" data-k="cast" data-id="${l.id}">
          <option value="">${t('cin.lines.nobody', '— ninguém —')}</option>
          ${speakers.map((s) => `<option value="${s.id}" ${s.id === l.cast ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
        <span class="cin-hint cin-grow">${st?.glyph ?? ''} ${fmt1(l.t)}s → ${fmt1(l.t + l.dur)}s</span>
        <button class="cin-btn sm warn" data-a="del" data-id="${l.id}" aria-label="${t('cin.del', 'Apagar')}">🗑</button>
      </div>
      <input class="cin-input" maxlength="140" data-k="text" data-id="${l.id}" value="${esc(l.text)}" placeholder="${t('cin.lines.ph', 'Escreva a fala...')}">
      <div class="cin-chips">${BUBBLES.map((b) => `<button class="cin-chip ${b.id === l.style ? 'on' : ''}" data-a="style" data-id="${l.id}" data-v="${b.id}">${b.glyph} ${b.name}</button>`).join('')}</div>
      ${range('t:' + l.id, t('cin.lines.start', 'Começa'), 0, Math.max(0.1, shot.dur - 0.3), 0.1, l.t)}
      ${range('dur:' + l.id, t('cin.lines.dur', 'Duração'), 0.5, 12, 0.1, l.dur)}
      <div class="cin-row">
        <button class="cin-btn sm" data-a="rec" data-id="${l.id}">🎙 ${l.audio ? t('cin.lines.rerec', 'Regravar') : t('cin.lines.rec', 'Gravar voz')}</button>
        ${castById(l.cast)?.kind === 'avatar' ? `<button class="cin-btn sm ${l.face ? 'ok' : ''}" data-a="facerec" data-id="${l.id}">🎭 ${l.face ? t('cin.lines.refacerec', 'Regravar com o rosto') : t('cin.lines.facerec', 'Gravar com o rosto')}</button>` : ''}
        ${l.audio ? `<button class="cin-btn sm" data-a="hear" data-id="${l.id}">▶ ${t('cin.lines.hear', 'Ouvir')}</button><button class="cin-btn sm ghost" data-a="unrec" data-id="${l.id}">✕ ${t('cin.lines.unrec', 'Tirar voz')}</button>` : ''}
      </div>
      ${l.face ? faceRow(l) : ''}
    </div>`;
  }
  html += '</div>';
  h.innerHTML = html;
  const sel = h.querySelector<HTMLElement>('.cin-item.on');
  if (sel) requestAnimationFrame(() => sel.scrollIntoView({ block: 'nearest' }));
  const find = (id?: string) => shot.lines.find((x) => x.id === id);
  h.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const l = find(b.dataset.id);
    if (a === 'add') {
      const style = b.dataset.v as BubbleStyle;
      const who = style === 'speech' ? (S.sel && trackOf(shot, S.sel) ? S.sel : shot.actors[0]?.cast) : undefined;
      const nl: Line = { id: uid('ln'), t: Math.min(Math.round(local * 10) / 10, Math.max(0, shot.dur - 0.5)), dur: 2.2, cast: who, text: '', style };
      mutate(() => {
        shot.lines.push(nl);
        if (nl.t + nl.dur > shot.dur) shot.dur = Math.min(60, Math.ceil((nl.t + nl.dur) * 10) / 10);
      });
      S.selLine = nl.id;
      S.uiDirty = true;
      requestAnimationFrame(() => h.querySelector<HTMLInputElement>(`input[data-id="${nl.id}"][data-k="text"]`)?.focus());
    } else if (!l) return;
    else if (a === 'del') mutate(() => (shot.lines = shot.lines.filter((x) => x !== l)));
    else if (a === 'style') mutate(() => (l.style = b.dataset.v as BubbleStyle));
    else if (a === 'unrec')
      mutate(() => {
        delete l.audio;
        delete l.face;
        delete l.cut;
      });
    else if (a === 'unface') mutate(() => delete l.face);
    else if (a === 'faceonly' && l.face) mutate(() => (l.face = { ...l.face!, only: l.face!.only ? undefined : 'mouth' }));
    else if (a === 'facerec') {
      const who = castById(l.cast);
      if (!who || who.kind !== 'avatar') return;
      const m = c.mixer();
      m?.setMuted(true);
      const { faceCapture } = await import('./facecap');
      const r = await faceCapture(who);
      m?.setMuted(false);
      if (r === 'denied') notify(t('cin.fc.denied', 'Sem permissão da câmera. Libere nas configurações do aparelho.'), { kind: 'warn', icon: 'warning' });
      else if (r === 'mic') notify(t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.'), { kind: 'warn', icon: 'warning' });
      else if (r === 'nocam') notify(t('cin.fc.nocam', 'Não deu para usar a câmera neste aparelho. Você ainda pode gravar só a voz.'), { kind: 'warn', icon: 'warning' });
      else if (r && typeof r === 'object') {
        const id = uid('clip');
        await putClip({ id, pid: S.p.id, blob: r.blob, dur: r.buf.duration, env: r.env });
        rememberClip(id, r.buf, r.env);
        const rate = VOICE_RATE[who.voice] ?? 1;
        const need = (r.cut[1] - r.cut[0]) / rate + 0.15;
        mutate(() => {
          l.audio = id;
          l.face = r.take;
          l.cut = r.cut[0] > 0.01 || r.cut[1] < r.buf.duration - 0.01 ? r.cut : undefined;
          l.dur = Math.max(0.5, Math.round(need * 10) / 10);
          if (l.t + l.dur > shot.dur) shot.dur = Math.min(60, Math.ceil((l.t + l.dur + 0.3) * 10) / 10);
        });
        notify(t('cin.fc.ok', 'Rosto e voz gravados! O personagem atua igual a você.'), { kind: 'good', icon: 'check' });
      }
    }
    else if (a === 'hear' && l.audio) {
      const m = c.mixer();
      await loadClip(l.audio);
      if (m) previewClip(m, l.audio, castById(l.cast)?.voice ?? 'normal', l.cut);
    } else if (a === 'rec') {
      const m = c.mixer();
      m?.setMuted(true);
      const r = await recordSheet();
      m?.setMuted(false);
      if (r === 'denied') notify(t('cin.rec.denied', 'Sem permissão do microfone. Libere nas configurações do aparelho.'), { kind: 'warn', icon: 'warning' });
      else if (r === 'unsupported' || r === 'failed') notify(t('cin.rec.fail', 'Não deu para gravar neste aparelho.'), { kind: 'warn', icon: 'warning' });
      else if (r && typeof r === 'object') {
        const id = uid('clip');
        await putClip({ id, pid: S.p.id, blob: r.blob, dur: r.buf.duration, env: r.env });
        rememberClip(id, r.buf, r.env);
        const rate = VOICE_RATE[castById(l.cast)?.voice ?? 'normal'] ?? 1;
        const need = r.buf.duration / rate + 0.15;
        mutate(() => {
          l.audio = id;
          delete l.face;
          delete l.cut;
          l.dur = Math.max(0.5, Math.round(need * 10) / 10);
          if (l.t + l.dur > shot.dur) shot.dur = Math.min(60, Math.ceil((l.t + l.dur + 0.3) * 10) / 10);
        });
        notify(t('cin.rec.ok', 'Voz gravada! A boca mexe sozinha.'), { kind: 'good', icon: 'check' });
      }
    }
  };
  h.oninput = (e) => {
    const i = e.target as HTMLInputElement;
    const k = i.dataset.k;
    if (!k) return;
    if (k === 'text') {
      const l = find(i.dataset.id);
      if (l) mutate(() => (l.text = i.value.slice(0, 140)), false);
      return;
    }
    const [f, id] = k.split(':');
    const l = find(id);
    if (!l) return;
    (i.nextElementSibling as HTMLOutputElement).value = fmt1(+i.value);
    mutate(() => ((l as unknown as Record<string, number>)[f] = +i.value), false);
  };
  h.onchange = (e) => {
    const i = e.target as HTMLInputElement & HTMLSelectElement;
    const k = i.dataset.k;
    if (!k) return;
    if (k === 'text' || k === 'cast') {
      const l = find(i.dataset.id);
      if (!l) return;
      if (k === 'text') {
        const clean = cleanText(i.value);
        i.value = clean;
        mutate(() => (l.text = clean));
        if (clean.trim()) tutEvent('line');
      } else mutate(() => (l.cast = i.value || undefined));
      return;
    }
    const [f, id] = k.split(':');
    const l = find(id);
    if (!l) return;
    mutate(() => {
      (l as unknown as Record<string, number>)[f] = +i.value;
      if (l.t + l.dur > shot.dur) shot.dur = Math.min(60, Math.ceil((l.t + l.dur) * 10) / 10);
    });
  };
}

/* ---------------------------- CÂMERA ---------------------------- */
function cameraPanel(c: PanelCtx): void {
  const h = c.host;
  const { ref, local } = cur();
  const keys = ref.shot.cam;
  const k = keys.filter((x) => x.t <= local + 0.06).pop() ?? keys[0];
  const here = keys.some((x) => Math.abs(x.t - local) < 0.06);
  const actors = ref.shot.actors.map((a) => castById(a.cast)).filter(Boolean) as NonNullable<ReturnType<typeof castById>>[];
  const opts = (sel?: string) => `<option value="">${t('cin.cam.nofocus', '— ninguém —')}</option>` + actors.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
  let html = `<div class="cin-row"><span class="cin-hint cin-grow">${here ? '◆ ' + t('cin.actor.keyHere', 'Chave em {s} s', { s: fmt1(local) }) : '◇ ' + t('cin.actor.newKey', 'Mudar aqui cria uma chave em {s} s', { s: fmt1(local) })}</span>${here && keys.length > 1 ? `<button class="cin-btn sm" data-a="delkey">🗑 ${t('cin.actor.delKey', 'Chave')}</button>` : ''}</div>`;
  if (S.p.mode === '3d') {
    html += `<h5>${t('cin.cam.shot', 'Tipo de câmera')}</h5><div class="cin-grid">${CAM3D.map((p) => `<button class="cin-cell ${k.p3 === p.id ? 'on' : ''}" data-a="p3" data-v="${p.id}"><span class="g">${p.glyph}</span><span>${p.name}</span></button>`).join('')}</div>`;
    html += `<label class="cin-field"><span>${t('cin.cam.focus', 'Foco')}</span><select class="cin-input" data-k="focus">${opts(k.focus)}</select></label>`;
    if (k.p3 === 'ots') html += `<label class="cin-field"><span>${t('cin.cam.shoulder', 'Ombro de')}</span><select class="cin-input" data-k="focus2">${opts(k.focus2)}</select></label>`;
    html += range('zoom', t('cin.cam.zoom', 'Zoom'), 0.5, 2.5, 0.05, k.zoom);
    html += range('yaw', t('cin.cam.yaw', 'Giro'), -60, 60, 1, k.yaw ?? 0, String(k.yaw ?? 0) + '°');
    html += range('x', t('cin.cam.pan', 'Deslizar'), 2, 14, 0.1, k.x);
  } else {
    html += `<h5>${t('cin.cam.presets', 'Enquadramento')}</h5><div class="cin-chips">
      <button class="cin-chip" data-a="pre" data-v="wide">🎬 ${t('cin.cam.wide', 'Geral')}</button>
      <button class="cin-chip" data-a="pre" data-v="med">🧍 ${t('cin.cam.medium', 'Médio')}</button>
      <button class="cin-chip" data-a="pre" data-v="close">🔎 ${t('cin.cam.closeup', 'Close')}</button>
      <button class="cin-chip" data-a="pre" data-v="two">👥 ${t('cin.cam.two', 'Dois juntos')}</button>
      <button class="cin-chip" data-a="pre" data-v="left">⬅️ ${t('cin.cam.left', 'Esquerda')}</button>
      <button class="cin-chip" data-a="pre" data-v="right">➡️ ${t('cin.cam.right', 'Direita')}</button></div>`;
    html += `<label class="cin-field"><span>${t('cin.cam.follow', 'Seguir')}</span><select class="cin-input" data-k="focus">${opts(k.focus)}</select></label>`;
    html += range('zoom', t('cin.cam.zoom', 'Zoom'), 0.85, 4, 0.05, k.zoom);
    if (!k.focus) {
      html += range('x', t('cin.cam.panx', 'Para os lados'), 0, 16, 0.1, k.x);
      html += range('y', t('cin.cam.pany', 'Cima/baixo'), 1, 8, 0.1, k.y);
    }
  }
  html += `<h5>${t('cin.cam.move', 'Movimento até esta chave')}</h5>` + chips('ease', EASES.map(([e, l]) => [e, l()]), k.ease);
  html += `<p class="cin-hint">${t('cin.cam.tip', 'Crie duas chaves em instantes diferentes para a câmera se mover (zoom, panorâmica...).')}</p>`;
  h.innerHTML = html;
  h.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const v = b.dataset.v!;
    if (a === 'delkey') {
      const i = keys.findIndex((x) => Math.abs(x.t - local) < 0.06);
      if (i >= 0 && keys.length > 1) mutate(() => keys.splice(i, 1));
    } else if (a === 'p3') {
      const ch: Record<string, unknown> = { p3: v };
      if ((v === 'closeup' || v === 'ots' || v === 'dolly') && !k.focus) ch.focus = S.sel ?? actors[0]?.id;
      if (v === 'ots' && !k.focus2) ch.focus2 = actors.find((x) => x.id !== (ch.focus ?? k.focus))?.id;
      editCamKey(ch);
    } else if (a === 'ease') editCamKey({ ease: v as Ease });
    else if (a === 'pre') {
      const ev = evalActors(S.p, ref, local);
      const me = ev.find((x) => x.cast.id === S.sel) ?? ev[0];
      if (v === 'wide') editCamKey({ x: 8, y: 4.5, zoom: 1, focus: '' });
      else if (v === 'med' && me) editCamKey({ focus: me.cast.id, zoom: 1.6, x: 8 });
      else if (v === 'close' && me) editCamKey({ focus: me.cast.id, zoom: 2.7, x: 8 });
      else if (v === 'two' && ev.length >= 2) {
        const a2 = ev.slice().sort((p, q) => Math.abs(p.x - (me?.x ?? 8)) - Math.abs(q.x - (me?.x ?? 8)));
        const mid = (a2[0].x + a2[1].x) / 2;
        const span = Math.abs(a2[0].x - a2[1].x) + 4;
        editCamKey({ focus: '', x: mid, y: 5, zoom: Math.max(1, Math.min(2.4, 16 / span)) });
      } else if (v === 'left') editCamKey({ focus: '', x: 4.5, y: 5, zoom: 1.6 });
      else if (v === 'right') editCamKey({ focus: '', x: 11.5, y: 5, zoom: 1.6 });
    }
  };
  h.oninput = (e) => {
    const i = e.target as HTMLInputElement;
    if (!i.dataset.k || i.tagName === 'SELECT') return;
    (i.nextElementSibling as HTMLOutputElement).value = i.dataset.k === 'yaw' ? i.value + '°' : fmt1(+i.value);
    editCamKey({ [i.dataset.k]: +i.value }, false);
  };
  h.onchange = (e) => {
    const i = e.target as HTMLInputElement;
    if (!i.dataset.k) return;
    if (i.tagName === 'SELECT') editCamKey({ [i.dataset.k]: i.value });
    else editCamKey({ [i.dataset.k]: +i.value });
  };
}

/* ---------------------------- EFEITOS ---------------------------- */
function fxPanel(c: PanelCtx): void {
  const h = c.host;
  const { ref, local } = cur();
  const shot = ref.shot;
  let html = `<h5>${t('cin.fx.visual', 'Efeitos na tela')} <span class="cin-hint">(${t('cin.fx.at', 'entram em {s} s', { s: fmt1(local) })})</span></h5>`;
  html += `<div class="cin-grid">${FX.map((f) => `<button class="cin-cell" data-a="fx" data-v="${f.id}">${proTag(f)}<span class="g">${f.glyph}</span><span>${f.name}</span></button>`).join('')}</div>`;
  if (shot.fx.length) {
    html += '<div class="cin-list" style="margin-top:8px">';
    for (const f of shot.fx) {
      const it = FX.find((x) => x.id === f.kind);
      const who = castById(f.cast);
      html += `<div class="cin-item"><div class="cin-row"><b class="cin-grow">${it?.glyph ?? ''} ${it?.name ?? f.kind}${who ? ' · ' + esc(who.name) : ''}</b><button class="cin-btn sm warn" data-a="delfx" data-id="${f.id}">🗑</button></div>
        ${range('t:' + f.id, t('cin.lines.start', 'Começa'), 0, Math.max(0.1, shot.dur - 0.1), 0.1, f.t)}
        ${range('dur:' + f.id, t('cin.lines.dur', 'Duração'), 0.2, Math.max(0.3, shot.dur), 0.1, f.dur)}</div>`;
    }
    html += '</div>';
  }
  html += `<h5>${t('cin.fx.sounds', 'Efeitos sonoros')}</h5><div class="cin-grid">${SFX.map((f) => `<button class="cin-cell" data-a="sfx" data-v="${f.id}"><span class="g">${f.glyph}</span><span>${f.name}</span></button>`).join('')}</div>`;
  if (shot.sfx.length) {
    html += '<div class="cin-list" style="margin-top:8px">';
    for (const f of shot.sfx) {
      const it = SFX.find((x) => x.id === f.sfx);
      html += `<div class="cin-item"><div class="cin-row"><b class="cin-grow">${it?.glyph ?? ''} ${it?.name ?? f.sfx}</b><button class="cin-btn sm" data-a="hear" data-v="${f.sfx}">▶</button><button class="cin-btn sm warn" data-a="delsfx" data-id="${f.id}">🗑</button></div>
        ${range('st:' + f.id, t('cin.lines.start', 'Começa'), 0, Math.max(0.1, shot.dur - 0.1), 0.1, f.t)}
        ${range('vol:' + f.id, t('cin.fx.vol', 'Volume'), 0, 1, 0.05, f.vol, Math.round(f.vol * 100) + '%')}</div>`;
    }
    html += '</div>';
  }
  h.innerHTML = html;
  const hear = (id: string) => {
    const m = c.mixer();
    const ac = actx();
    if (m && ac) playSfx(ac, m.sfx, id, ac.currentTime + 0.02, 0.9, []);
  };
  h.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const v = b.dataset.v!;
    if (a === 'fx') {
      const it = FX.find((x) => x.id === v);
      if (!canUse(it)) return;
      const kind = v as FxKind;
      const dur = kind === 'shake' || kind === 'flash' ? 0.6 : kind === 'poof' ? 1 : kind === 'rain' || kind === 'snow' || kind === 'confetti' ? Math.max(1, shot.dur - local) : 2;
      const who = FX_ON_ACTOR.has(kind) && S.sel && trackOf(shot, S.sel) ? S.sel : undefined;
      mutate(() => shot.fx.push({ id: uid('fx'), t: Math.round(local * 10) / 10, dur: Math.round(dur * 10) / 10, kind, cast: who }));
      notify(`${it?.glyph ?? ''} ${it?.name ?? ''}${who ? ' · ' + castById(who)?.name : ''}`, { ms: 1500 });
    } else if (a === 'sfx') {
      mutate(() => shot.sfx.push({ id: uid('sf'), t: Math.round(local * 10) / 10, sfx: v, vol: 0.9 }));
      hear(v);
    } else if (a === 'hear') hear(v);
    else if (a === 'delfx') mutate(() => (shot.fx = shot.fx.filter((f) => f.id !== b.dataset.id)));
    else if (a === 'delsfx') mutate(() => (shot.sfx = shot.sfx.filter((f) => f.id !== b.dataset.id)));
  };
  const apply = (i: HTMLInputElement, commit: boolean) => {
    const [f, id] = (i.dataset.k ?? '').split(':');
    if (!id) return;
    const fx = shot.fx.find((x) => x.id === id);
    const sf = shot.sfx.find((x) => x.id === id);
    (i.nextElementSibling as HTMLOutputElement).value = f === 'vol' ? Math.round(+i.value * 100) + '%' : fmt1(+i.value);
    mutate(() => {
      if (fx && (f === 't' || f === 'dur')) fx[f] = +i.value;
      if (sf && f === 'st') sf.t = +i.value;
      if (sf && f === 'vol') sf.vol = +i.value;
    }, commit);
  };
  h.oninput = (e) => apply(e.target as HTMLInputElement, false);
  h.onchange = (e) => apply(e.target as HTMLInputElement, true);
}

/* ---------------------------- PLANO ---------------------------- */
function shotPanel(c: PanelCtx): void {
  const h = c.host;
  const { ref } = cur();
  const shot = ref.shot;
  let html = `<h5>${t('cin.shot.title', 'Plano {n}', { n: ref.gi + 1 })}</h5>`;
  html += range('dur', t('cin.shot.dur', 'Duração'), 0.5, 20, 0.1, shot.dur, fmt1(shot.dur) + ' s');
  html += `<h5>${t('cin.shot.trans', 'Transição de entrada')}</h5><div class="cin-chips">${TRANSITIONS.map((x) => `<button class="cin-chip ${shot.transition.kind === x.id ? 'on' : ''}" data-a="tr" data-v="${x.id}">${x.glyph} ${x.name}</button>`).join('')}</div>`;
  if (shot.transition.kind !== 'cut') html += range('trdur', t('cin.shot.trdur', 'Tempo'), 0.2, 2, 0.1, shot.transition.dur, fmt1(shot.transition.dur) + ' s');
  html += `<h5>${t('cin.shot.actions', 'Ações')}</h5><div class="cin-row">
    <button class="cin-btn sm" data-a="dup">⧉ ${t('cin.shot.dup', 'Duplicar')}</button>
    <button class="cin-btn sm" data-a="left">◀ ${t('cin.shot.left', 'Mover')}</button>
    <button class="cin-btn sm" data-a="right">${t('cin.shot.right', 'Mover')} ▶</button>
    <button class="cin-btn sm warn" data-a="del">🗑 ${t('cin.shot.del', 'Apagar plano')}</button></div>`;
  html += `<p class="cin-hint" style="margin-top:10px">${t('cin.shot.tip', 'Um plano é um pedaço do filme com uma câmera. Vários planos formam uma cena.')}</p>`;
  h.innerHTML = html;
  h.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'tr') mutate(() => (shot.transition = { kind: b.dataset.v as never, dur: shot.transition.dur || 0.5 }));
    else if (a === 'dup') duplicateShot();
    else if (a === 'left') moveShot(-1);
    else if (a === 'right') moveShot(1);
    else if (a === 'del' && (await confirm(t('cin.shot.delQ', 'Apagar este plano?'), t('cin.del', 'Apagar')))) deleteShot();
  };
  const apply = (i: HTMLInputElement, commit: boolean) => {
    (i.nextElementSibling as HTMLOutputElement).value = fmt1(+i.value) + ' s';
    if (i.dataset.k === 'dur') mutate(() => (shot.dur = +i.value), commit);
    else if (i.dataset.k === 'trdur') mutate(() => (shot.transition.dur = +i.value), commit);
  };
  h.oninput = (e) => apply(e.target as HTMLInputElement, false);
  h.onchange = (e) => apply(e.target as HTMLInputElement, true);
}

/* ---------------------------- CENÁRIO ---------------------------- */
const bgThumbs = new Map<string, HTMLCanvasElement>();
export function bgThumb(id: string, light: string): HTMLCanvasElement {
  const k = id + light;
  let cv = bgThumbs.get(k);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = 160;
  cv.height = 90;
  const bm = bgBitmap(id, light, 20);
  const ppu = bm.width / 20;
  cv.getContext('2d')!.drawImage(bm, (0 - BG_X0) * ppu, (0 - BG_Y0) * ppu, 16 * ppu, 9 * ppu, 0, 0, 160, 90);
  bgThumbs.set(k, cv);
  return cv;
}

function scenePanel(c: PanelCtx): void {
  const h = c.host;
  const { ref } = cur();
  const sc = ref.scene;
  let html = `<h5>${t('cin.scene.mode', 'Estilo do filme')}</h5>` + chips('mode', [['2d', '✏️ 2D'], ['3d', '🧊 3D' + (isPro() ? '' : ' ★')]], S.p.mode);
  html += `<h5>${t('cin.scene.bg', 'Cenário desta cena')}</h5><div class="cin-grid wide">${BACKGROUNDS.map((b) => `<button class="cin-cell bg ${sc.bg === b.id ? 'on' : ''}" data-a="bg" data-v="${b.id}" data-bg="${b.id}">${proTag(b)}<span>${b.name}</span></button>`).join('')}</div>`;
  html += `<h5>${t('cin.scene.light', 'Luz')}</h5>` + chips('light', [['day', '☀️ ' + t('cin.scene.day', 'Dia')], ['dusk', '🌇 ' + t('cin.scene.dusk', 'Entardecer')], ['night', '🌙 ' + t('cin.scene.night', 'Noite')]], sc.light);
  html += `<h5>${t('cin.scene.new', 'Nova cena')}</h5><p class="cin-hint">${t('cin.scene.newTip', 'Uma cena nova começa com um plano vazio, depois desta.')}</p><button class="cin-btn sm" data-a="newscene">＋ ${t('cin.scene.add', 'Nova cena')}</button>`;
  if (S.p.mode === '3d') {
    html += `<h5>${t('cin.scene.studio', 'Cenário do Bloop Studio')}</h5><p class="cin-hint">${sc.studio ? t('cin.scene.studioOn', 'Usando: {n}', { n: esc(sc.studio.name) }) : t('cin.scene.studioTip', 'Use um mapa ou objeto que você criou no Bloop Studio como cenário 3D.')}</p>
      <div class="cin-row"><button class="cin-btn sm" data-a="studio">📂 ${t('cin.scene.import', 'Importar criação')}</button>${sc.studio ? `<button class="cin-btn sm ghost" data-a="nostudio">✕ ${t('cin.scene.remove', 'Remover')}</button>` : ''}</div>`;
  }
  h.innerHTML = html;
  h.querySelectorAll<HTMLElement>('[data-bg]').forEach((b) => b.prepend(bgThumb(b.dataset.bg!, 'day')));
  h.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const v = b.dataset.v!;
    if (a === 'mode') c.setMode(v as '2d' | '3d');
    else if (a === 'bg') {
      if (!canUse(BACKGROUNDS.find((x) => x.id === v))) return;
      mutate(() => (sc.bg = v));
    } else if (a === 'light') mutate(() => (sc.light = v as never));
    else if (a === 'newscene') addScene(sc.bg);
    else if (a === 'studio') c.importStudio();
    else if (a === 'nostudio') mutate(() => delete sc.studio);
  };
}

/** Linha de opções da captura de rosto de uma fala. */
function faceRow(l: Line): string {
  const sec = l.face ? fmt1(l.face.n / l.face.hz) : '';
  return `<div class="cin-row"><span class="cin-hint cin-grow">🎭 ${t('cin.lines.faceInfo', 'Rosto gravado ({s} s)', { s: sec })}</span>
    <button class="cin-btn sm ${l.face?.only ? 'ok' : ''}" data-a="faceonly" data-id="${l.id}">👄 ${t('cin.fc.only', 'Só boca e cabeça')}</button>
    <button class="cin-btn sm ghost" data-a="unface" data-id="${l.id}">✕ ${t('cin.lines.unface', 'Tirar rosto')}</button></div>`;
}

/* ---------------------------- ELENCO ---------------------------- */
let editing: string | null = null;
const OUTFIT: Slot[] = ['head', 'face', 'eyes', 'mouth', 'back', 'body', 'pattern'];
function castPanel(c: PanelCtx): void {
  const h = c.host;
  const shot = curShot();
  let html = `<div class="cin-list">`;
  for (const m of S.p.cast) {
    const inShot = !!trackOf(shot, m.id);
    html += `<div class="cin-castrow" data-thumb="${m.id}"><span class="nm">${esc(m.name)}</span>
      <button class="cin-btn sm ${inShot ? 'ok' : ''}" data-a="toggle" data-id="${m.id}">${inShot ? '✓ ' + t('cin.cast.inShot', 'No plano') : '＋ ' + t('cin.cast.toShot', 'Pôr no plano')}</button>
      <button class="cin-btn sm" data-a="edit" data-id="${m.id}">✎</button></div>`;
    if (editing === m.id) html += castEditor(m.id);
  }
  html += `</div><button class="cin-btn pri" style="margin-top:10px" data-a="add" ${S.p.cast.length >= MAX_CAST ? 'disabled' : ''}>＋ ${t('cin.cast.add', 'Adicionar personagem')} (${S.p.cast.length}/${MAX_CAST})</button>`;
  h.innerHTML = html;
  h.querySelectorAll<HTMLElement>('.cin-castrow[data-thumb]').forEach((b) => {
    const m = castById(b.dataset.thumb);
    if (m) b.prepend(actorThumb(m, 48, 'stand', 'happy'));
  });
  h.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    const m = castById(b.dataset.id);
    if (a === 'add') return addCast();
    if (!m) return;
    if (a === 'toggle') {
      if (trackOf(shot, m.id)) removeFromShot(m.id);
      else {
        S.sel = m.id;
        addToShot(m.id);
      }
    } else if (a === 'edit') {
      editing = editing === m.id ? null : m.id;
      S.uiDirty = true;
      mutate(() => {}, false);
    } else if (a === 'col' && m.avatar) {
      const which = b.dataset.w as 'primary' | 'secondary';
      mutate(() => (m.avatar!.colors[which] = b.dataset.v!));
      clearThumbs();
    } else if (a === 'part' && m.avatar) {
      mutate(() => (m.avatar!.parts[b.dataset.w as Slot] = b.dataset.v!));
      clearThumbs();
    } else if (a === 'voice') {
      mutate(() => (m.voice = b.dataset.v as never));
    } else if (a === 'makeup' && m.avatar) {
      const { openMakeupStudio } = await import('../makeup/studio');
      const look = await openMakeupStudio({ avatar: m.avatar, look: m.makeup, name: m.name });
      if (look !== undefined) {
        mutate(() => (look ? (m.makeup = look) : delete m.makeup));
        clearThumbs();
      }
    } else if (a === 'unmakeup') {
      mutate(() => delete m.makeup);
      clearThumbs();
    } else if (a === 'remove' && (await confirm(t('cin.cast.removeQ', 'Tirar {n} do filme inteiro?', { n: m.name }), t('cin.del', 'Apagar')))) {
      mutate((p: Project) => {
        p.cast = p.cast.filter((x) => x.id !== m.id);
        for (const s of p.scenes)
          for (const sh of s.shots) {
            sh.actors = sh.actors.filter((x) => x.cast !== m.id);
            sh.lines.forEach((l) => l.cast === m.id && (l.cast = undefined));
            sh.fx.forEach((f) => f.cast === m.id && (f.cast = undefined));
          }
      });
      if (S.sel === m.id) S.sel = S.p.cast[0]?.id ?? null;
    } else if (a === 'copy') {
      if (S.p.cast.length >= MAX_CAST) return;
      const cp = clone(m);
      cp.id = uid('c');
      cp.name = (m.name + ' 2').slice(0, 14);
      mutate((p) => p.cast.push(cp));
    }
  };
  h.onchange = (e) => {
    const i = e.target as HTMLInputElement;
    const m = castById(i.dataset.id);
    if (!m) return;
    if (i.dataset.k === 'name') {
      const n = cleanText(i.value, 14).trim() || m.name;
      i.value = n;
      mutate(() => (m.name = n));
    } else if (i.dataset.k === 'size') {
      mutate(() => (m.size = +i.value));
      clearThumbs();
    }
  };
}

function castEditor(id: string): string {
  const m = castById(id)!;
  let html = `<div class="cin-item"><label class="cin-field"><span>${t('cin.cast.name', 'Nome')}</span><input class="cin-input" maxlength="14" data-k="name" data-id="${id}" value="${esc(m.name)}"></label>`;
  if (m.avatar) {
    for (const w of ['primary', 'secondary'] as const)
      html += `<h5>${w === 'primary' ? t('cin.cast.color1', 'Cor') : t('cin.cast.color2', 'Cor 2')}</h5><div class="cin-swatches">${SWATCHES.map((s) => `<button class="cin-sw ${m.avatar!.colors[w] === s ? 'on' : ''}" style="background:${s}" data-a="col" data-w="${w}" data-v="${s}" data-id="${id}" aria-label="${s}"></button>`).join('')}</div>`;
    html += `<div class="cin-row" style="margin-top:8px"><button class="cin-btn pri sm" data-a="makeup" data-id="${id}">💄 ${m.makeup ? t('cin.cast.makeupEdit', 'Editar maquiagem') : t('cin.cast.makeup', 'Maquiagem')}</button>${m.makeup ? `<button class="cin-btn sm ghost" data-a="unmakeup" data-id="${id}">🧽 ${t('cin.cast.makeupOff', 'Tirar maquiagem')}</button>` : ''}</div>`;
    html += `<h5>${t('cin.cast.outfit', 'Roupa e acessórios')}</h5><p class="cin-hint">${t('cin.cast.outfitTip', 'Peças que você já tem no Crie seu Bloop.')}</p>`;
    for (const slot of OUTFIT) {
      const curP = m.avatar.parts[slot];
      const list = partsOf(slot).filter((p) => ownsPart(p.id) || p.id === curP);
      if (list.length < 2) continue;
      html += `<div class="cin-chips" style="margin:4px 0">${list.map((p) => `<button class="cin-chip ${p.id === curP ? 'on' : ''}" data-a="part" data-w="${slot}" data-v="${p.id}" data-id="${id}">${esc(partName(p))}</button>`).join('')}</div>`;
    }
  }
  html += `<h5>${t('cin.cast.voice', 'Voz gravada')}</h5><div class="cin-chips">${VOICES.map((v) => `<button class="cin-chip ${m.voice === v.id ? 'on' : ''}" data-a="voice" data-v="${v.id}" data-id="${id}">${v.glyph} ${v.name}</button>`).join('')}</div>`;
  html += `<label class="cin-field"><span>${t('cin.cast.size', 'Tamanho')}</span><input type="range" min="0.7" max="1.3" step="0.05" value="${m.size ?? 1}" data-k="size" data-id="${id}"><output></output></label>`;
  html += `<div class="cin-row"><button class="cin-btn sm" data-a="copy" data-id="${id}">⧉ ${t('cin.cast.copy', 'Duplicar')}</button><button class="cin-btn sm warn" data-a="remove" data-id="${id}">🗑 ${t('cin.cast.remove', 'Tirar do filme')}</button></div></div>`;
  return html;
}

/* ---------------------------- MÚSICA ---------------------------- */
let songs: SongDef[] | null = null;
let stopPrev: (() => void) | null = null;
async function soundPanel(c: PanelCtx): Promise<void> {
  const h = c.host;
  if (!songs) {
    h.innerHTML = `<p class="cin-hint">${t('cin.loading', 'Carregando...')}</p>`;
    songs = await songList();
    if (S.tab !== 'sound') return;
  }
  const mus = S.p.music;
  let html = `<h5>${t('cin.music.title', 'Música de fundo')}</h5><p class="cin-hint">${t('cin.music.tip', 'Músicas originais do Bloop World.')}</p><div class="cin-list">`;
  html += `<div class="cin-castrow ${!mus ? 'on' : ''}"><span class="nm">🔇 ${t('cin.music.none', 'Sem música')}</span><button class="cin-btn sm ${!mus ? 'ok' : ''}" data-a="pick" data-v="">${!mus ? '✓' : t('cin.music.use', 'Usar')}</button></div>`;
  for (const s of songs) {
    const on = mus?.song === s.id;
    html += `<div class="cin-castrow"><span class="nm">🎵 ${esc(s.title)} <small class="cin-hint">· ${esc(s.band)}</small></span><button class="cin-btn sm" data-a="hear" data-v="${s.id}">▶</button><button class="cin-btn sm ${on ? 'ok' : ''}" data-a="pick" data-v="${s.id}">${on ? '✓' : t('cin.music.use', 'Usar')}</button></div>`;
  }
  html += '</div>';
  html += `<h5>${t('cin.music.mix', 'Volumes')}</h5>`;
  if (mus) html += range('offset', t('cin.music.offset', 'Começar em'), 0, 90, 1, mus.offset, mus.offset + ' s');
  html += range('music', t('cin.music.vMusic', 'Música'), 0, 1, 0.05, S.p.mix.music, Math.round(S.p.mix.music * 100) + '%');
  html += range('voice', t('cin.music.vVoice', 'Vozes'), 0, 1, 0.05, S.p.mix.voice, Math.round(S.p.mix.voice * 100) + '%');
  html += range('sfx', t('cin.music.vSfx', 'Efeitos'), 0, 1, 0.05, S.p.mix.sfx, Math.round(S.p.mix.sfx * 100) + '%');
  h.innerHTML = html;
  h.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (!b) return;
    const v = b.dataset.v!;
    if (b.dataset.a === 'pick') {
      stopPrev?.();
      mutate((p) => (p.music = v ? { song: v, offset: p.music?.offset ?? 8, vol: p.music?.vol ?? 0.6 } : null));
    } else if (b.dataset.a === 'hear') {
      stopPrev?.();
      const m = c.mixer();
      if (m) {
        m.setMix(S.p);
        stopPrev = await previewSong(m, v, mus?.song === v ? mus.offset : 8);
      }
    }
  };
  const apply = (i: HTMLInputElement, commit: boolean) => {
    const k = i.dataset.k!;
    (i.nextElementSibling as HTMLOutputElement).value = k === 'offset' ? i.value + ' s' : Math.round(+i.value * 100) + '%';
    mutate((p) => {
      if (k === 'offset' && p.music) p.music.offset = +i.value;
      else if (k === 'music' || k === 'voice' || k === 'sfx') p.mix[k] = +i.value;
    }, commit);
    c.mixer()?.setMix(S.p);
  };
  h.oninput = (e) => apply(e.target as HTMLInputElement, false);
  h.onchange = (e) => apply(e.target as HTMLInputElement, true);
}

export function stopPanelAudio(): void {
  stopPrev?.();
  stopPrev = null;
}
