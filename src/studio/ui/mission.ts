/* ============================================================
 *  BLOOP STUDIO — Missão (criador de jogos): modelos prontos
 *  (corrida, parkour, coleta, sobrevivência), lista de objetivos,
 *  vidas, tempo, textos de vitória/derrota, pôr início/checkpoint/
 *  chegada/moeda/inimigo e "Testar daqui".
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { filterMessage } from '../../../shared/moderation';
import { newId, OBJECTIVES, type Creation, type Mission, type Objective, type ObjectiveKind, type PartRole, type PrimType, type Vec3 } from '../format';
import { B, kart } from '../starters';
import { localAuthor } from '../store-mock';
import type { Studio } from '../studio';
import { esc } from '../studio';
import { sicon } from './sicons';

export type TemplateId = 'race' | 'parkour' | 'collect' | 'survive';

const OBJ_ICON: Record<ObjectiveKind, string> = { reach: 'flag', collect: 'coin', defeat: 'sword', survive: 'timer', drive: 'car' };
export const objName = (k: ObjectiveKind): string =>
  ({
    reach: t('studio.obj.reach', 'Chegar ao ponto'),
    collect: t('studio.obj.collect', 'Coletar'),
    defeat: t('studio.obj.defeat', 'Derrotar'),
    survive: t('studio.obj.survive', 'Sobreviver'),
    drive: t('studio.obj.drive', 'Pilotar até'),
  })[k];

export const templateInfo = (): [TemplateId, string, string, string][] => [
  ['race', 'car', t('studio.tpl2.race', 'Corrida'), t('studio.tpl2.raceSub', 'kart, checkpoints e chegada')],
  ['parkour', 'up', t('studio.tpl2.parkour', 'Parkour'), t('studio.tpl2.parkourSub', 'pule de plataforma em plataforma')],
  ['collect', 'coin', t('studio.tpl2.collect', 'Coleta'), t('studio.tpl2.collectSub', 'pegue todas as moedas a tempo')],
  ['survive', 'timer', t('studio.tpl2.survive', 'Sobrevivência'), t('studio.tpl2.surviveSub', 'fuja dos inimigos por 45 s')],
];

/** cria um mapa novo a partir de um modelo (com missão pronta) */
export function makeTemplate(id: TemplateId): Creation {
  const me = localAuthor();
  const name = templateInfo().find((x) => x[0] === id)![2];
  const b = new B(newId(), 'map', name, 'flat');
  b.c.author = me.name;
  b.c.authorId = me.id;
  b.c.created = b.c.updated = Date.now();
  const white = b.m('#f4efff');
  const green = b.m('#4fd67a', 'neon');
  const yellow = b.m('#ffd34a');
  const purple = b.m('#8a5cff');
  const blue = b.m('#5ec8ff');
  const pink = b.m('#ff5cc8');
  const lava = b.m('#ff5a2e', 'neon');
  const gold = b.m('#ffd34a', 'metal');
  const red = b.m('#ff3a5a');
  const goal = (p: Vec3) => {
    b.add('box', p, [3, 0.12, 3], green, { role: 'goal', name: 'chegada' });
    b.add('cylinder', [p[0] - 1.3, p[1] + 1.5, p[2] - 1.2], [0.14, 3, 0.14], b.m('#c8ccd8', 'metal'), { phys: 'none' });
    b.add('box', [p[0] - 0.75, p[1] + 2.6, p[2] - 1.2], [1, 0.7, 0.05], yellow, { phys: 'none' });
  };
  const enemy = (p: Vec3) => {
    b.add('sphere', p, [1, 1, 1], red, { role: 'enemy', name: 'inimigo' });
  };
  let mission: Mission;
  if (id === 'race') {
    const k = kart();
    b.add('box', [0, 0.05, 6], [4, 0.1, 4], white, { role: 'spawn' });
    b.ref(k.id, [0, 0, 1]);
    b.c.deps = [k];
    // pista em "U" com muretas
    const wall = (p: Vec3, s: Vec3) => b.add('box', p, s, pink);
    wall([-5, 0.4, -20], [0.5, 0.8, 50]);
    wall([5, 0.4, -14], [0.5, 0.8, 38]);
    wall([15, 0.4, -14], [0.5, 0.8, 38]);
    wall([25, 0.4, -20], [0.5, 0.8, 50]);
    wall([10, 0.4, -45], [30.5, 0.8, 0.5]);
    for (let i = 0; i < 6; i++) b.add('box', [0, 0.02, -6 - i * 6], [9.5, 0.04, 0.6], i % 2 ? white : purple, { phys: 'none' });
    b.add('ramp', [0, 0.4, -26], [6, 0.8, 4], blue, { r: [0, 180, 0] });
    b.add('box', [10, 0.06, -40], [9, 0.12, 3], yellow, { role: 'checkpoint' });
    goal([20, 0.06, 4]);
    mission = { objectives: [{ k: 'drive' }], lives: 0, time: 90, win: 'Campeão da corrida!' };
  } else if (id === 'parkour') {
    b.add('box', [0, 0.05, -18], [24, 0.1, 50], lava, { role: 'hazard', name: 'lava' });
    b.add('box', [0, 0.5, 6], [6, 1, 6], white);
    b.add('cylinder', [0, 1.06, 6], [1.6, 0.12, 1.6], green, { role: 'spawn' });
    const pts: Vec3[] = [[0, 1, 0], [2, 1.5, -4], [-1, 2, -8], [1.5, 2.5, -12], [0, 3, -16.5]];
    pts.forEach((p, i) => b.add('box', [p[0], p[1] - 0.5, p[2]], [2.4, 1, 2.4], i % 2 ? blue : purple));
    b.add('box', [0, 2.5, -21], [5, 1, 5], white);
    b.add('box', [0, 3.06, -21], [2, 0.12, 2], yellow, { role: 'checkpoint' });
    b.add('cylinder', [-2, 3.5, -26], [2, 1, 2], purple);
    b.add('cylinder', [1.5, 4.2, -30], [2, 1, 2], blue);
    b.add('box', [0, 4.5, -35], [5, 1, 5], white);
    goal([0, 5.06, -35]);
    mission = { objectives: [{ k: 'reach' }], lives: 5, win: 'Mestre do parkour!' };
  } else if (id === 'collect') {
    b.add('cylinder', [0, 0.06, 0], [2, 0.12, 2], green, { role: 'spawn' });
    const spots: Vec3[] = [[6, 0.8, -4], [-6, 0.8, -6], [10, 2.3, -14], [-9, 0.8, -15], [0, 3.3, -20], [4, 0.8, 6], [-4, 0.8, 8], [14, 0.8, 2]];
    for (const [x, y, z] of spots) {
      if (y > 1) b.add('box', [x, (y - 0.8) / 2, z], [3, y - 0.8, 3], purple);
      b.add('cylinder', [x, y, z], [0.8, 0.14, 0.8], gold, { r: [90, 0, 0], role: 'collect', name: 'moeda' });
    }
    b.add('ramp', [10, 0.75, -9.5], [3, 1.5, 6], blue, { r: [0, 180, 0] });
    b.add('ramp', [0, 1.25, -15], [3, 2.5, 7], blue, { r: [0, 180, 0] });
    mission = { objectives: [{ k: 'collect' }], time: 60, win: 'Todas as moedas!' };
  } else {
    b.add('cylinder', [0, 0.06, 0], [2, 0.12, 2], green, { role: 'spawn' });
    b.add('box', [0, 0.5, -12], [4, 1, 4], purple);
    b.add('box', [-10, 1, 4], [3, 2, 3], blue);
    b.add('box', [9, 0.75, 6], [3, 1.5, 3], purple);
    b.add('ramp', [9, 0.75, 1.5], [3, 1.5, 6], blue);
    enemy([8, 0.5, -8]);
    enemy([-8, 0.5, -10]);
    enemy([0, 0.5, 12]);
    mission = { objectives: [{ k: 'survive', sec: 45 }], lives: 3, win: 'Você sobreviveu!' };
  }
  b.c.mission = mission;
  return b.c;
}

/** peça com papel no ponto que a câmera mira */
function addRole(s: Studio, role: PartRole): void {
  const ed = s.editor;
  const spec: Record<string, [PrimType, Vec3, string, Vec3?]> = {
    spawn: ['cylinder', [1.6, 0.12, 1.6], '#4fd67a'],
    checkpoint: ['box', [2, 0.12, 2], '#ffd34a'],
    goal: ['box', [3, 0.12, 3], '#4fd67a'],
    collect: ['cylinder', [0.8, 0.14, 0.8], '#ffd34a', [90, 0, 0]],
    enemy: ['sphere', [1, 1, 1], '#ff3a5a'],
    hazard: ['box', [2, 0.1, 2], '#ff5a2e'],
  };
  const [prim, size, color, rot] = spec[role];
  if (role === 'spawn') {
    const old = ed.doc.parts.filter((p) => p.role === 'spawn').map((p) => p.id);
    if (old.length) {
      ed.select(old);
      ed.remove();
    }
  }
  const id = ed.addPrim(prim);
  if (id == null) return;
  ed.change('role', () => {
    const p = ed.part(id)!;
    const y0 = p.p[1] - (p.s?.[1] ?? 1) / 2;
    p.s = [...size];
    p.p = [p.p[0], Math.round((y0 + (rot ? 0.6 : size[1] / 2)) * 1000) / 1000, p.p[2]];
    if (rot) p.r = [...rot];
    p.role = role;
    if (role === 'collect') p.phys = 'none';
  });
  ed.setMaterial([id], { c: color, k: role === 'collect' ? 'metal' : role === 'hazard' || role === 'goal' ? 'neon' : 'plastic' });
}

export function renderMissionPanel(
  s: Studio,
  _body: HTMLElement,
  h: (html: string) => HTMLElement,
  on: (el: HTMLElement, sel: string, fn: (b: HTMLElement) => void) => void,
  rerender: () => void,
): void {
  const ed = s.editor;
  const d = ed.doc;
  const m = d.mission;
  // modelos
  const tp = h(`<div><h4>${t('studio.mis.templates', 'Começar de um modelo')}</h4><div class="bs-tpls">${templateInfo()
    .map(([id, ic, nm, sub]) => `<button class="bs-tpl" data-tp="${id}">${sicon(ic, 26)}<b>${nm}</b><small>${sub}</small></button>`)
    .join('')}</div></div>`);
  on(tp, '[data-tp]', (b) => {
    const go = async () => {
      if (s.dirty) await s.save(true);
      const c = makeTemplate(b.dataset.tp as TemplateId);
      await s.openDoc(c);
      s.dirty = true;
      notify(t('studio.mis.tplReady', 'Modelo pronto! Aperte Testar ou mude o que quiser'), { icon: 'check', kind: 'good' });
      rerender();
    };
    if (d.parts.length) s.panels.confirm(t('studio.mis.tplQ', 'Abrir o modelo num mapa novo? O seu fica salvo.'), () => void go());
    else void go();
  });
  if (!m) {
    h(`<p class="bs-hint bs-callout">${t('studio.mis.hint', 'Uma missão diz o que o jogador precisa fazer para vencer: chegar, coletar, derrotar, sobreviver ou pilotar.')}</p>`);
    const nb = h(`<button class="bs-btn bs-wide bs-accent">${sicon('mission', 18)}${t('studio.mis.create', 'Criar missão do zero')}</button>`);
    nb.addEventListener('click', () => {
      ed.change('mission', () => (d.mission = { objectives: [{ k: d.parts.some((p) => p.role === 'goal') ? 'reach' : 'collect' }] }));
      rerender();
    });
  } else {
    const change = (fn: (m: Mission) => void) => ed.change('mission', () => fn(d.mission!));
    const pn = (id?: number) => (id == null ? t('studio.mis.anyGoal', 'qualquer chegada') : esc(ed.part(id)?.name || '#' + id));
    const list = h(`<div><h4>${t('studio.mis.objectives', 'Objetivos')}</h4><div class="bs-list">${m.objectives
      .map((o, i) => {
        const val = o.k === 'collect' || o.k === 'defeat' ? (o.n ? String(o.n) : t('studio.mis.all', 'todos')) : o.k === 'survive' ? `${o.sec ?? 30} s` : pn(o.part);
        const step = o.k === 'collect' || o.k === 'defeat' || o.k === 'survive';
        return `<div class="bs-li bs-obj" data-i="${i}"><span>${sicon(OBJ_ICON[o.k], 18)}<b>${objName(o.k)}</b> · ${val}</span>
          ${step ? '<button class="bs-mini" data-d="-1">−</button><button class="bs-mini" data-d="1">+</button>' : '<button class="bs-mini" data-pk>' + sicon('tap', 16) + '</button>'}
          <button class="bs-mini" data-rm>${sicon('trash', 16)}</button></div>`;
      })
      .join('')}</div>
      <div class="bs-chips bs-addact">${OBJECTIVES.map((k) => `<button class="bs-chip" data-ok="${k}">+ ${objName(k)}</button>`).join('')}</div></div>`);
    on(list, 'button', async (b) => {
      if (b.dataset.ok) {
        if (m.objectives.length >= 8) return;
        const o: Objective = { k: b.dataset.ok as ObjectiveKind };
        if (o.k === 'survive') o.sec = 30;
        change((mm) => mm.objectives.push(o));
        if ((o.k === 'reach' || o.k === 'drive') && !d.parts.some((p) => p.role === 'goal')) notify(t('studio.mis.needGoal', 'Ponha uma Chegada (botão abaixo) ou escolha uma peça'), { icon: 'warning', kind: 'warn' });
        if (o.k === 'defeat' && !d.parts.some((p) => p.role === 'enemy')) notify(t('studio.mis.needEnemy', 'Ponha inimigos (botão abaixo)'), { icon: 'warning', kind: 'warn' });
        if (o.k === 'collect' && !d.parts.some((p) => p.role === 'collect')) notify(t('studio.mis.needCoin', 'Ponha moedas (botão abaixo)'), { icon: 'warning', kind: 'warn' });
        return rerender();
      }
      const i = Number(b.closest<HTMLElement>('[data-i]')?.dataset.i);
      if (!Number.isFinite(i)) return;
      if (b.hasAttribute('data-rm')) change((mm) => mm.objectives.splice(i, 1));
      else if (b.dataset.d) {
        const dir = Number(b.dataset.d);
        change((mm) => {
          const o = mm.objectives[i];
          if (o.k === 'survive') o.sec = Math.max(5, Math.min(600, (o.sec ?? 30) + dir * 5));
          else {
            const nv = (o.n ?? 0) + dir;
            if (nv <= 0) delete o.n;
            else o.n = Math.min(999, nv);
          }
        });
      } else if (b.hasAttribute('data-pk')) {
        const id = await s.panels.pick(t('studio.mis.pickPart', 'Toque na peça de chegada'));
        change((mm) => {
          if (id == null) delete mm.objectives[i].part;
          else mm.objectives[i].part = id;
        });
      }
      rerender();
    });
    const opts = h(`<div class="bs-mopts">
      <div class="bs-seg"><button data-or="all" class="${m.order !== 'seq' ? 'on' : ''}">${t('studio.mis.any', 'Qualquer ordem')}</button><button data-or="seq" class="${m.order === 'seq' ? 'on' : ''}">${t('studio.mis.seq', 'Um de cada vez')}</button></div>
      <div class="bs-steprow"><span>${sicon('heartl', 18)}${t('studio.mis.lives', 'Vidas')}</span><button class="bs-mini" data-lv="-1">−</button><b>${m.lives ? m.lives : '∞'}</b><button class="bs-mini" data-lv="1">+</button></div>
      <div class="bs-steprow"><span>${sicon('timer', 18)}${t('studio.mis.time', 'Tempo limite')}</span><button class="bs-mini" data-tm="-1">−</button><b>${m.time ? m.time + ' s' : t('studio.mis.noTime', 'sem')}</b><button class="bs-mini" data-tm="1">+</button></div>
      <label class="bs-field">${t('studio.mis.winText', 'Texto da vitória')}<input maxlength="60" data-tx="win" value="${esc(m.win ?? '')}" placeholder="${t('studio.end.win', 'Você venceu!')}"></label>
      <label class="bs-field">${t('studio.mis.loseText', 'Texto da derrota')}<input maxlength="60" data-tx="lose" value="${esc(m.lose ?? '')}" placeholder="${t('studio.end.lose', 'Não foi dessa vez!')}"></label></div>`);
    on(opts, 'button', (b) => {
      if (b.dataset.or) change((mm) => (b.dataset.or === 'seq' ? (mm.order = 'seq') : delete mm.order));
      else if (b.dataset.lv) change((mm) => (mm.lives = Math.max(0, Math.min(99, (mm.lives ?? 0) + Number(b.dataset.lv)))));
      else if (b.dataset.tm) change((mm) => (mm.time = Math.max(0, Math.min(3600, (mm.time ?? 0) + Number(b.dataset.tm) * 15))));
      rerender();
    });
    opts.querySelectorAll<HTMLInputElement>('input[data-tx]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const k = inp.dataset.tx as 'win' | 'lose';
        const v = inp.value.trim().slice(0, 60);
        if (v && !filterMessage(v).ok) {
          notify(t('studio.badText', 'Esse texto não pode — tente outras palavras'), { icon: 'warning', kind: 'warn' });
          inp.value = m[k] ?? '';
          return;
        }
        change((mm) => (v ? (mm[k] = v) : delete mm[k]));
      }),
    );
    const del = h(`<button class="bs-btn">${sicon('trash', 16)}${t('studio.mis.remove', 'Tirar a missão')}</button>`);
    del.addEventListener('click', () => {
      ed.change('mission', () => delete d.mission);
      rerender();
    });
  }
  // pôr peças especiais + testar daqui
  const put = h(`<div><h4>${t('studio.mis.put', 'Pôr no mapa (onde a câmera mira)')}</h4><div class="bs-chips">
    <button class="bs-chip" data-r="spawn">${sicon('play', 14)} ${t('studio.role.spawn', 'Início')}</button>
    <button class="bs-chip" data-r="checkpoint">${sicon('flag', 14)} ${t('studio.role.checkpoint', 'Checkpoint')}</button>
    <button class="bs-chip" data-r="goal">${sicon('flag', 14)} ${t('studio.role.goal', 'Chegada')}</button>
    <button class="bs-chip" data-r="collect">${sicon('coin', 14)} ${t('studio.mis.coin', 'Moeda')}</button>
    <button class="bs-chip" data-r="enemy">${sicon('sword', 14)} ${t('studio.role.enemy', 'Inimigo')}</button>
    <button class="bs-chip" data-r="hazard">${sicon('report', 14)} ${t('studio.role.hazard', 'Perigo')}</button></div></div>`);
  on(put, '[data-r]', (b) => {
    addRole(s, b.dataset.r as PartRole);
    rerender();
  });
  const here = h(`<button class="bs-btn bs-wide">${sicon('target', 18)}${t('studio.mis.testHere', 'Testar daqui (onde a câmera mira)')}</button>`);
  here.addEventListener('click', () => {
    const p = ed.cam.target.clone();
    void s.startPlay(d, undefined, new THREE.Vector3(p.x, p.y, p.z));
  });
  // avisos
  const warn: string[] = [];
  if (m) {
    if (m.objectives.some((o) => (o.k === 'reach' || o.k === 'drive') && o.part == null) && !d.parts.some((p) => p.role === 'goal')) warn.push(t('studio.mis.wGoal', 'Falta uma Chegada.'));
    if (m.objectives.some((o) => o.k === 'collect') && !d.parts.some((p) => p.role === 'collect')) warn.push(t('studio.mis.wCoin', 'Falta pôr moedas.'));
    if (m.objectives.some((o) => o.k === 'defeat') && !d.parts.some((p) => p.role === 'enemy')) warn.push(t('studio.mis.wEnemy', 'Falta pôr inimigos.'));
    if (m.objectives.some((o) => o.k === 'drive') && !d.parts.some((p) => p.t === 'ref' || p.role === 'seat')) warn.push(t('studio.mis.wCar', 'Falta um veículo para pilotar (Adicionar → Da Loja).'));
    if (!m.objectives.length) warn.push(t('studio.mis.wNone', 'Adicione pelo menos um objetivo.'));
  }
  if (warn.length) h(`<p class="bs-hint bs-callout bs-warn">${warn.join(' ')}</p>`);
}
