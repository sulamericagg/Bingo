/* ============================================================
 *  BLOOP STUDIO — painéis (gaveta à direita), menu radial e paywall.
 *  Adicionar · Pintar · Caneta · Mecânica · Fichas · Camadas · Mundo ·
 *  Minhas criações · Loja · Publicar · Info.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { filterMessage } from '../../../shared/moderation';
import { notify } from '../../ui/notify';
import { openClub, openPass } from '../../pass/register';
import { FINISHES, PRIMS, SOUNDS, deserialize, hashCreation, jsonBytes, serialize, validate, type Action, type ActionKind, type Creation, type Finish, type JointKind, type LogicRule, type PartRole, type PrimType, type TriggerKind } from '../format';
import { deleteMine, listMine, loadMine, markPublished, remember, type LibEntry } from '../library';
import { isPro, jointLimit, publishLimit, type ProFeature, FREE } from '../pro';
import { STORE_CATEGORIES, type StoreCategory, type StoreListing, type StoreSort } from '../store-api';
import { store, localAuthor } from '../store-mock';
import { starterName } from '../starters';
import type { Studio } from '../studio';
import { esc } from '../studio';
import { sicon } from './sicons';
import { MAT_COLORS, type Brush } from '../world/field';
import { BlocksEditor } from './blocks';
import { renderMissionPanel } from './mission';
import { openWorldSheet } from './worldsheet';
import { GAME_TAGS } from '../store-api';
import { linkFor, MAX_INLINE, shareUrl } from '../share';

export type PanelId = 'add' | 'paint' | 'pen' | 'mech' | 'logic' | 'layers' | 'world' | 'library' | 'store' | 'info' | 'publish' | 'terrain' | 'mission';

const COLORS = ['#ff5cc8', '#ff4f6a', '#ff9a2e', '#ffd34a', '#4fd67a', '#2ec4a0', '#5ec8ff', '#3f6aff', '#8a5cff', '#c8a8ff', '#ffffff', '#c8ccd8', '#6a6a7a', '#2e2440', '#a8742e', '#f0d494'];

const primName = (p: PrimType): string =>
  ({
    box: t('studio.prim.box', 'Cubo'),
    sphere: t('studio.prim.sphere', 'Bola'),
    cylinder: t('studio.prim.cylinder', 'Cilindro'),
    cone: t('studio.prim.cone', 'Cone'),
    wedge: t('studio.prim.wedge', 'Cunha'),
    torus: t('studio.prim.torus', 'Rosca'),
    capsule: t('studio.prim.capsule', 'Cápsula'),
    ramp: t('studio.prim.ramp', 'Rampa'),
    arch: t('studio.prim.arch', 'Arco'),
    pipe: t('studio.prim.pipe', 'Cano'),
  })[p];

const finishName = (f: Finish): string =>
  ({
    plastic: t('studio.fin.plastic', 'Plástico'),
    metal: t('studio.fin.metal', 'Metal'),
    glass: t('studio.fin.glass', 'Vidro'),
    wood: t('studio.fin.wood', 'Madeira'),
    neon: t('studio.fin.neon', 'Neon'),
    rubber: t('studio.fin.rubber', 'Borracha'),
  })[f];

export const roleName = (r: PartRole): string =>
  ({
    seat: t('studio.role.seat', 'Assento'),
    wheel: t('studio.role.wheel', 'Roda'),
    thruster: t('studio.role.thruster', 'Propulsor'),
    enemy: t('studio.role.enemy', 'Inimigo'),
    spawn: t('studio.role.spawn', 'Início'),
    checkpoint: t('studio.role.checkpoint', 'Checkpoint'),
    goal: t('studio.role.goal', 'Chegada'),
    button: t('studio.role.button', 'Botão'),
    zone: t('studio.role.zone', 'Zona'),
    light: t('studio.role.light', 'Luz'),
    hazard: t('studio.role.hazard', 'Perigo'),
    collect: t('studio.role.collect', 'Coletável'),
  })[r];

const catName = (c: StoreCategory): string =>
  ({
    vehicles: t('studio.cat.vehicles', 'Veículos'),
    buildings: t('studio.cat.buildings', 'Construções'),
    nature: t('studio.cat.nature', 'Natureza'),
    gadgets: t('studio.cat.gadgets', 'Engenhocas'),
    furniture: t('studio.cat.furniture', 'Móveis'),
    maps: t('studio.cat.maps', 'Mapas'),
    art: t('studio.cat.art', 'Arte'),
  })[c];

const trigName = (k: TriggerKind): string =>
  ({ button: t('studio.trig.button', 'Botão apertado'), zone: t('studio.trig.zone', 'Entrou na zona'), timer: t('studio.trig.timer', 'A cada X segundos'), start: t('studio.trig.start', 'Ao começar') })[k];

const actName = (k: ActionKind): string =>
  ({
    door: t('studio.actk.door', 'Abrir porta'),
    move: t('studio.actk.move', 'Mover peça'),
    light: t('studio.actk.light', 'Acender luz'),
    teleport: t('studio.actk.teleport', 'Teletransportar'),
    spawn: t('studio.actk.spawn', 'Criar cópia'),
    sound: t('studio.actk.sound', 'Tocar som'),
    score: t('studio.actk.score', 'Dar pontos'),
    motor: t('studio.actk.motor', 'Liga/desliga motor'),
    win: t('studio.actk.win', 'Vencer'),
  })[k];

const tagName = (g: string): string =>
  ({
    corrida: t('studio.tag.race', 'Corrida'),
    obstaculos: t('studio.tag.obby', 'Obstáculos'),
    fisica: t('studio.tag.physics', 'Física'),
    captura: t('studio.tag.ctf', 'Captura'),
    enigma: t('studio.tag.puzzle', 'Enigma'),
    festa: t('studio.tag.party', 'Festa'),
    aventura: t('studio.tag.adventure', 'Aventura'),
    coleta: t('studio.tag.collect', 'Coleta'),
  })[g] ?? g;

const kindName = (k: Creation['kind']): string => (k === 'map' ? t('studio.kind.map', 'Mapa') : k === 'vehicle' ? t('studio.kind.vehicle', 'Veículo') : t('studio.kind.object', 'Objeto'));

export class Panels {
  current: PanelId | null = null;
  private el: HTMLElement;
  private body: HTMLElement;
  private title: HTMLElement;
  private radialEl: HTMLElement | null = null;
  private sheet: HTMLElement | null = null;
  private storeQ: { sort: StoreSort; category?: StoreCategory; section: 'games' | 'creations'; tag?: string; fav?: boolean } = { sort: 'trending', section: 'games' };
  private detail: StoreListing | null = null;
  private editRule: number | null = null;
  private pickBanner: HTMLElement;
  private logicTab: 'blocks' | 'rules' = 'blocks';
  private blocks: BlocksEditor;

  constructor(private s: Studio) {
    this.el = document.createElement('div');
    this.el.className = 'bs-panel';
    this.el.setAttribute('data-touch-ignore', '');
    this.el.innerHTML = `<div class="bs-ph"><b></b><button class="bs-ib bs-pclose">${sicon('close', 20)}</button></div><div class="bs-pb"></div>`;
    this.title = this.el.querySelector('.bs-ph b')!;
    this.body = this.el.querySelector('.bs-pb')!;
    this.el.querySelector('.bs-pclose')!.addEventListener('click', () => this.closeAll());
    s.ui.appendChild(this.el);
    this.pickBanner = document.createElement('div');
    this.pickBanner.className = 'bs-pick';
    this.pickBanner.hidden = true;
    s.ui.appendChild(this.pickBanner);
    this.blocks = new BlocksEditor({ ed: s.editor, pick: (m) => this.pick(m), rerender: () => this.render(), sheet: (h) => this.openSheet(h), closeSheet: () => this.closeSheet() });
  }

  /* --------------------------------- básico --------------------------------- */

  open(id: PanelId): void {
    this.current = id;
    this.el.classList.add('on');
    this.el.dataset.p = id;
    this.s.el.classList.toggle('wide', ['logic', 'store', 'library', 'publish', 'info'].includes(id));
    if (id !== 'store') this.detail = null;
    this.render();
    this.s.refreshChrome();
  }
  toggle(id: PanelId): void {
    if (this.current === id) this.closeAll();
    else this.open(id);
  }
  closeAll(): void {
    if (this.current === 'terrain' && this.s.editor.tool === 'terrain') this.s.editor.setTool('move');
    this.current = null;
    this.el.classList.remove('on');
    this.s.el.classList.remove('wide');
    this.closeRadial();
    this.s.editor.cancelPick();
    this.s.refreshChrome();
  }
  closeTop(): boolean {
    if (this.sheet) {
      this.closeSheet();
      return true;
    }
    if (this.radialEl) {
      this.closeRadial();
      return true;
    }
    if (this.current) {
      this.closeAll();
      return true;
    }
    return false;
  }
  /** re-desenha o painel aberto quando a seleção/doc muda (só os que dependem disso) */
  refresh(): void {
    if (!this.current) return;
    if (['mech', 'layers', 'info', 'paint', 'world', 'mission'].includes(this.current) || (this.current === 'logic' && !this.s.editor.picking)) this.render();
  }

  private render(): void {
    const id = this.current;
    if (!id) return;
    const T: Record<PanelId, () => string> = {
      add: () => t('studio.tool.add', 'Adicionar'),
      paint: () => t('studio.tool.paint', 'Pintar'),
      pen: () => t('studio.tool.pen', 'Caneta 3D'),
      mech: () => t('studio.tool.mech', 'Mecânica'),
      logic: () => t('studio.tool.logic', 'Lógica'),
      layers: () => t('studio.tool.layers', 'Camadas'),
      world: () => t('studio.tool.world', 'Mundo'),
      library: () => t('studio.library', 'Minhas criações'),
      store: () => t('studio.storeTitle', 'Loja de Criações'),
      info: () => t('studio.info', 'Sobre a criação'),
      publish: () => t('studio.publish', 'Publicar'),
      terrain: () => t('studio.tool.terrain', 'Terreno'),
      mission: () => t('studio.tool.mission', 'Missão'),
    };
    this.title.textContent = T[id]();
    const scroll = this.body.scrollTop;
    this.body.innerHTML = '';
    switch (id) {
      case 'add':
        this.renderAdd();
        break;
      case 'paint':
      case 'pen':
        this.renderPaint(id === 'pen');
        break;
      case 'mech':
        this.renderMech();
        break;
      case 'logic':
        this.renderLogic();
        break;
      case 'layers':
        this.renderLayers();
        break;
      case 'world':
        this.renderWorld();
        break;
      case 'library':
        void this.renderLibrary();
        break;
      case 'store':
        void this.renderStore();
        break;
      case 'info':
        this.renderInfo();
        break;
      case 'publish':
        void this.renderPublish();
        break;
      case 'terrain':
        this.renderTerrain();
        break;
      case 'mission':
        this.renderMission();
        break;
    }
    this.body.scrollTop = scroll;
  }

  private h(html: string): HTMLElement {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    const el = d.firstElementChild as HTMLElement;
    this.body.appendChild(el);
    return el;
  }
  private on(el: HTMLElement, sel: string, fn: (b: HTMLElement) => void): void {
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(sel);
      if (b && el.contains(b) && !(b as HTMLButtonElement).disabled) fn(b);
    });
  }

  /* -------------------------------- adicionar -------------------------------- */

  private renderAdd(): void {
    const g = this.h(`<div class="bs-grid">${PRIMS.map((p) => `<button class="bs-cell" data-p="${p}">${sicon(p, 30)}<span>${primName(p)}</span></button>`).join('')}</div>`);
    this.on(g, '[data-p]', (b) => {
      this.s.editor.addPrim(b.dataset.p as PrimType);
    });
    const ex = this.h(`<div class="bs-row2">
      <button class="bs-btn" data-x="mine">${sicon('folder', 18)}${t('studio.addMine', 'Das minhas criações')}</button>
      <button class="bs-btn" data-x="store">${sicon('store', 18)}${t('studio.addStore', 'Da Loja')}</button></div>`);
    this.on(ex, '[data-x]', (b) => this.open(b.dataset.x === 'mine' ? 'library' : 'store'));
    this.h(`<p class="bs-hint">${t('studio.addHint', 'A peça aparece onde a câmera mira. Toque nela para mover, girar ou mudar o tamanho.')}</p>`);
  }

  /* --------------------------------- pintar --------------------------------- */

  private renderPaint(pen: boolean): void {
    const ed = this.s.editor;
    const sw = this.h(`<div class="bs-swatches">${COLORS.map((c) => `<button class="bs-sw${ed.paint.c === c ? ' on' : ''}" data-c="${c}" style="--c:${c}"></button>`).join('')}<label class="bs-sw bs-swpick" style="--c:${ed.paint.c}"><input type="color" value="${ed.paint.c}"></label></div>`);
    this.on(sw, '[data-c]', (b) => {
      ed.paint.c = b.dataset.c!;
      this.applyPaintToSel(pen);
      this.render();
    });
    const inp = sw.querySelector('input')!;
    inp.addEventListener('change', () => {
      ed.paint.c = inp.value.toLowerCase();
      this.applyPaintToSel(pen);
      this.render();
    });
    const fin = this.h(`<div class="bs-chips">${FINISHES.map((f) => `<button class="bs-chip${ed.paint.k === f ? ' on' : ''}" data-f="${f}"><i class="bs-fin bs-fin-${f}" style="--c:${ed.paint.c}"></i>${finishName(f)}</button>`).join('')}</div>`);
    this.on(fin, '[data-f]', (b) => {
      ed.paint.k = b.dataset.f as Finish;
      this.applyPaintToSel(pen);
      this.render();
    });
    if (pen) {
      const sl = this.h(`<div class="bs-sliders">
        <label>${t('studio.penWidth', 'Espessura')}<input type="range" min="0.02" max="0.4" step="0.01" value="${ed.penWidth}" data-k="w"><b>${Math.round(ed.penWidth * 100)} cm</b></label>
        <label>${t('studio.penDepth', 'Distância')}<input type="range" min="1" max="15" step="0.5" value="${ed.penDepth}" data-k="d"><b>${ed.penDepth} m</b></label></div>`);
      sl.querySelectorAll<HTMLInputElement>('input').forEach((i) =>
        i.addEventListener('input', () => {
          if (i.dataset.k === 'w') ed.penWidth = Number(i.value);
          else ed.penDepth = Number(i.value);
          i.nextElementSibling!.textContent = i.dataset.k === 'w' ? Math.round(ed.penWidth * 100) + ' cm' : ed.penDepth + ' m';
        }),
      );
      this.h(`<p class="bs-hint">${t('studio.penHint', 'Arraste um dedo para desenhar um tubo no ar, num plano na frente da câmera. Use a distância para desenhar mais longe.')}</p>`);
    } else {
      this.h(`<p class="bs-hint">${t('studio.paintHint', 'Toque nas peças para pintar. Com peças selecionadas, a cor vale para elas na hora.')}</p>`);
    }
  }
  private applyPaintToSel(pen: boolean): void {
    const ed = this.s.editor;
    if (!pen && ed.sel.size) ed.setMaterial([...ed.sel], ed.paint);
  }

  /* -------------------------------- mecânica -------------------------------- */

  private renderMech(): void {
    const ed = this.s.editor;
    const sel = ed.selected();
    const doc = ed.doc;
    if (!sel.length) this.h(`<p class="bs-hint bs-callout">${t('studio.mechSelect', 'Selecione uma peça para dar física, papel ou junta.')}</p>`);
    else {
      const ph = sel[0].phys ?? 'static';
      const p = this.h(`<div><h4>${t('studio.physics', 'Física')}</h4><div class="bs-seg">
        <button data-ph="static" class="${ph === 'static' ? 'on' : ''}">${t('studio.phys.static', 'Parada')}</button>
        <button data-ph="dynamic" class="${ph === 'dynamic' ? 'on' : ''}">${t('studio.phys.dynamic', 'Cai e rola')}</button>
        <button data-ph="none" class="${ph === 'none' ? 'on' : ''}">${t('studio.phys.none', 'Fantasma')}</button></div></div>`);
      this.on(p, '[data-ph]', (b) => ed.setPhys(b.dataset.ph as 'static'));
      const role = sel[0].role;
      const roles: PartRole[] = ['seat', 'wheel', 'thruster', 'spawn', 'checkpoint', 'goal', 'button', 'zone', 'light', 'hazard', 'collect', 'enemy'];
      const r = this.h(`<div><h4>${t('studio.roleTitle', 'Papel ao jogar')}</h4><div class="bs-chips">
        <button class="bs-chip${!role ? ' on' : ''}" data-r="">${t('studio.role.none', 'Nenhum')}</button>
        ${roles.map((x) => `<button class="bs-chip${role === x ? ' on' : ''}" data-r="${x}">${roleName(x)}</button>`).join('')}</div></div>`);
      this.on(r, '[data-r]', (b) => {
        ed.setRole((b.dataset.r || null) as PartRole | null);
        if (b.dataset.r === 'seat' || b.dataset.r === 'wheel') this.maybeVehicle();
      });
      const hid = sel.every((x) => x.hide);
      const hb = this.h(`<label class="bs-toggle"><input type="checkbox" ${hid ? 'checked' : ''}> ${t('studio.mold', 'Molde: escondido ao jogar (para "Criar cópia")')}</label>`);
      hb.querySelector('input')!.addEventListener('change', (e) => ed.setHidden((e.target as HTMLInputElement).checked));
      if (sel.length === 1 && (sel[0].t === 'box' || sel[0].t === 'wedge')) {
        const kit = this.h(`<button class="bs-btn bs-wide bs-accent bs-kit">${sicon('mech', 18)}${t('studio.wheelKit', 'Kit carro: 4 rodas + assento')}</button>`);
        kit.addEventListener('click', () => this.wheelKit());
      }
      // juntas
      const n = doc.joints.length;
      const lim = jointLimit();
      const j = this.h(`<div><h4>${t('studio.joints', 'Juntas e motores')} <small>${isPro() ? n : `${n}/${FREE.joints}`}</small></h4>
        <p class="bs-hint">${sel.length > 1 ? t('studio.jointTwo', 'Liga a 1ª peça selecionada à 2ª.') : t('studio.jointWorld', 'Liga a peça ao mundo (fica presa no lugar).')}</p>
        <div class="bs-seg" data-g="ax"><button data-ax="0">X</button><button data-ax="1" class="on">Y</button><button data-ax="2">Z</button></div>
        <label class="bs-toggle"><input type="checkbox" data-m checked> ${t('studio.withMotor', 'Com motor')}</label>
        <div class="bs-row3"><button class="bs-btn" data-j="hinge">${t('studio.joint.hinge', 'Dobradiça')}</button><button class="bs-btn" data-j="slider">${t('studio.joint.slider', 'Trilho')}</button><button class="bs-btn" data-j="fixed">${t('studio.joint.fixed', 'Colar')}</button></div></div>`);
      let ax: 0 | 1 | 2 = 1;
      this.on(j, '[data-ax]', (b) => {
        ax = Number(b.dataset.ax) as 0 | 1 | 2;
        j.querySelectorAll('[data-ax]').forEach((x) => x.classList.toggle('on', x === b));
      });
      this.on(j, '[data-j]', (b) => {
        if (doc.joints.length >= lim) return this.paywall('joints');
        const motor = (j.querySelector('[data-m]') as HTMLInputElement).checked;
        const jj = ed.addJoint(b.dataset.j as JointKind, ax, motor);
        if (jj) notify(t('studio.jointAdded', 'Junta criada! Aperte Testar para ver'), { icon: 'check', kind: 'good' });
      });
    }
    if (doc.joints.length) {
      const list = this.h(`<div class="bs-list">${doc.joints
        .map((j) => {
          const nm = j.k === 'hinge' ? t('studio.joint.hinge', 'Dobradiça') : j.k === 'slider' ? t('studio.joint.slider', 'Trilho') : t('studio.joint.fixed', 'Colar');
          return `<div class="bs-li" data-id="${j.id}"><span>${nm} · #${j.a}${j.b ? ' ↔ #' + j.b : ''}</span>
          ${j.k !== 'fixed' ? `<button class="bs-mini${j.motor ? ' on' : ''}" data-mo>${t('studio.motor', 'Motor')}${j.motor ? ' ' + j.motor.speed.toFixed(1) : ''}</button><button class="bs-mini" data-sp="-1">−</button><button class="bs-mini" data-sp="1">+</button>` : ''}
          <button class="bs-mini" data-del>${sicon('trash', 16)}</button></div>`;
        })
        .join('')}</div>`);
      this.on(list, 'button', (b) => {
        const id = Number(b.closest<HTMLElement>('[data-id]')!.dataset.id);
        if (b.hasAttribute('data-del')) ed.removeJoint(id);
        else if (b.hasAttribute('data-mo'))
          ed.updateJoint(id, (j) => {
            if (j.motor) delete j.motor;
            else j.motor = { speed: j.k === 'slider' ? 1 : 2, force: 500 };
          });
        else if (b.dataset.sp)
          ed.updateJoint(id, (j) => {
            j.motor = j.motor ?? { speed: 0, force: 500 };
            j.motor.speed = Math.round((j.motor.speed + Number(b.dataset.sp) * 0.5) * 10) / 10;
          });
      });
    }
  }

  private maybeVehicle(): void {
    const d = this.s.editor.doc;
    if (d.kind === 'object' && d.parts.some((p) => p.role === 'seat') && d.parts.some((p) => p.role === 'wheel')) {
      this.s.editor.change('kind', () => (d.kind = 'vehicle'));
      notify(t('studio.isVehicle', 'Virou um veículo! Teste e dirija'), { icon: 'car', kind: 'good' });
    }
  }

  /** chassi selecionado → 4 rodas nas quinas + assento em cima */
  wheelKit(): void {
    const ed = this.s.editor;
    const ch = ed.selected()[0];
    if (!ch || !ed.doc) return;
    if (!this.s.canAdd(5)) return;
    const s = ch.s ?? [1, 1, 1];
    const r = Math.max(0.25, Math.min(0.55, s[1] * 0.45));
    ed.change('kit', () => {
      // chassi acima do chão: a base fica na altura do eixo das rodas (não arrasta)
      const lift = Math.max(0, r + 0.05 - (ch.p[1] - s[1] / 2));
      ch.p = [ch.p[0], Math.round((ch.p[1] + lift) * 1000) / 1000, ch.p[2]];
      let id = ed.doc.parts.reduce((m, p) => Math.max(m, p.id), 0) + 1;
      const tire = ed.materialIndex({ c: '#2e2440', k: 'rubber' });
      const yb = ch.p[1] - s[1] / 2;
      void yb;
      for (const x of [-1, 1])
        for (const z of [-1, 1])
          ed.doc.parts.push({ id: id++, t: 'cylinder', p: [ch.p[0] + x * (s[0] / 2 + 0.2), r, ch.p[2] + z * (s[2] / 2 - r * 0.9)], s: [r * 2, 0.32, r * 2], r: [0, 0, 90], m: tire, role: 'wheel' });
      ed.doc.parts.push({ id: id++, t: 'box', p: [ch.p[0], ch.p[1] + s[1] / 2 + 0.12, ch.p[2] + s[2] * 0.15], s: [0.7, 0.2, 0.7], m: ed.materialIndex({ c: '#f4efff', k: 'plastic' }) || undefined, role: 'seat' });
      if (ed.doc.kind === 'object') ed.doc.kind = 'vehicle';
    });
    notify(t('studio.kitDone', 'Pronto! Aperte Testar e chegue perto do assento'), { icon: 'car', kind: 'good' });
  }

  /* --------------------------------- fichas --------------------------------- */

  private renderLogic(): void {
    const tabs = this.h(`<div class="bs-seg"><button data-lt="blocks" class="${this.logicTab === 'blocks' ? 'on' : ''}">${t('studio.blocks', 'Blocos')}</button><button data-lt="rules" class="${this.logicTab === 'rules' ? 'on' : ''}">${t('studio.rules', 'Fichas simples')}</button></div>`);
    this.on(tabs, '[data-lt]', (b) => {
      this.logicTab = b.dataset.lt as 'blocks';
      this.render();
    });
    if (this.logicTab === 'blocks') return this.blocks.render(this.body);
    const ed = this.s.editor;
    const rules = ed.doc.logic;
    const pn = (id?: number) => {
      if (id == null) return '—';
      const p = ed.part(id);
      return p ? `${p.name || primName((p.t === 'stroke' || p.t === 'ref' ? 'box' : p.t) as PrimType)} #${id}` : '?';
    };
    const add = this.h(`<button class="bs-btn bs-wide bs-accent">${sicon('plus', 18)}${t('studio.newRule', 'Nova ficha')}</button>`);
    add.addEventListener('click', () => {
      const id = rules.reduce((m, r) => Math.max(m, r.id), 0) + 1;
      const sel = ed.selected();
      const btn = sel.find((p) => p.role === 'button');
      const rule: LogicRule = btn ? { id, on: { k: 'button', part: btn.id }, do: [] } : { id, on: { k: 'start' }, do: [] };
      this.editRule = id;
      this.pendingRule = rule;
      this.render();
    });
    if (!rules.length && !this.pendingRule) this.h(`<p class="bs-hint bs-callout">${t('studio.logicHint', 'Fichas fazem coisas acontecerem: QUANDO apertar um botão → ABRIR uma porta, acender luz, dar pontos… Dica: marque uma peça como Botão em Mecânica.')}</p>`);
    const all = this.pendingRule && !rules.find((r) => r.id === this.pendingRule!.id) ? [...rules, this.pendingRule] : rules;
    for (const r of all) {
      const open = this.editRule === r.id;
      const card = this.h(`<div class="bs-card${open ? ' open' : ''}" data-id="${r.id}">
        <div class="bs-when"><b>${t('studio.when', 'QUANDO')}</b> ${trigName(r.on.k)}${r.on.part != null ? ' · ' + esc(pn(r.on.part)) : ''}${r.on.k === 'timer' ? ` · ${r.on.sec ?? 3}s` : ''}</div>
        <div class="bs-do">${r.do.map((a) => `<span class="bs-act">${actName(a.k)}${a.part != null ? ' · ' + esc(pn(a.part)) : ''}${a.snd ? ' · ' + a.snd : ''}${a.n != null ? ' · ' + a.n : ''}</span>`).join('') || `<i>${t('studio.noActions', 'sem ações ainda')}</i>`}</div>
      </div>`);
      if (!open) {
        card.addEventListener('click', () => {
          this.editRule = r.id;
          this.pendingRule = null;
          this.render();
        });
        continue;
      }
      // editor da ficha
      const work: LogicRule = JSON.parse(JSON.stringify(r));
      const commit = () => {
        if (!work.do.length) {
          this.pendingRule = work;
          this.render();
          return;
        }
        const next = ed.doc.logic.filter((x) => x.id !== work.id);
        next.push(work);
        next.sort((a, b) => a.id - b.id);
        this.pendingRule = null;
        ed.setLogic(next);
      };
      const trig = document.createElement('div');
      trig.innerHTML = `<div class="bs-chips">${(['button', 'zone', 'timer', 'start'] as TriggerKind[]).map((k) => `<button class="bs-chip${work.on.k === k ? ' on' : ''}" data-tk="${k}">${trigName(k)}</button>`).join('')}</div>
        ${work.on.k === 'button' || work.on.k === 'zone' ? `<button class="bs-btn" data-pick="on">${sicon('tap', 16)}${t('studio.pickPart', 'Escolher peça')}: ${esc(pn(work.on.part))}</button>` : ''}
        ${work.on.k === 'timer' ? `<div class="bs-step"><button data-sec="-1">−</button><b>${work.on.sec ?? 3}s</b><button data-sec="1">+</button></div>` : ''}
        <h4>${t('studio.then', 'ENTÃO')}</h4>
        <div class="bs-list">${work.do
          .map(
            (a, i) => `<div class="bs-li" data-i="${i}"><span>${actName(a.k)}${a.part != null ? ' · ' + esc(pn(a.part)) : ''}${a.joint != null ? ' · #' + a.joint : ''}${a.snd ? ' · ' + a.snd : ''}${a.n != null ? ' · ' + a.n : ''}</span>
            ${a.k === 'sound' ? `<button class="bs-mini" data-snd>${t('studio.change', 'Trocar')}</button>` : ''}
            ${a.k === 'score' ? `<button class="bs-mini" data-n="-5">−</button><button class="bs-mini" data-n="5">+</button>` : ''}
            <button class="bs-mini" data-rm>${sicon('trash', 16)}</button></div>`,
          )
          .join('')}</div>
        <div class="bs-chips bs-addact">${(['door', 'move', 'light', 'sound', 'score', 'teleport', 'spawn', 'motor', 'win'] as ActionKind[]).map((k) => `<button class="bs-chip" data-ak="${k}">+ ${actName(k)}</button>`).join('')}</div>
        <div class="bs-row2"><button class="bs-btn bs-accent" data-ok>${t('studio.done', 'Pronto')}</button><button class="bs-btn" data-delrule>${sicon('trash', 16)}${t('studio.del', 'Apagar')}</button></div>`;
      card.appendChild(trig);
      this.on(trig, 'button', async (b) => {
        if (b.dataset.tk) {
          work.on = { k: b.dataset.tk as TriggerKind };
          if (work.on.k === 'timer') work.on.sec = 3;
          this.pendingRule = work;
          ed.setLogic(ed.doc.logic.filter((x) => x.id !== work.id).concat(work.do.length && (work.on.k === 'timer' || work.on.k === 'start') ? [work] : []));
          this.render();
        } else if (b.dataset.pick) {
          const id = await this.pick(t('studio.pickOn', 'Toque na peça do gatilho'));
          if (id != null) {
            work.on.part = id;
            if (work.on.k === 'button' && ed.part(id)?.role !== 'button') {
              ed.select([id]);
              ed.setRole('button');
            }
            if (work.on.k === 'zone' && ed.part(id)?.role !== 'zone') {
              ed.select([id]);
              ed.setRole('zone');
            }
          }
          this.pendingRule = work;
          commit();
        } else if (b.dataset.sec) {
          work.on.sec = Math.max(1, (work.on.sec ?? 3) + Number(b.dataset.sec));
          commit();
        } else if (b.dataset.ak) {
          const k = b.dataset.ak as ActionKind;
          const a: Action = { k };
          if (k === 'door' || k === 'move' || k === 'light' || k === 'teleport' || k === 'spawn') {
            const id = await this.pick(t('studio.pickTarget', 'Toque na peça que vai {a}', { a: actName(k).toLowerCase() }));
            if (id == null) return this.render();
            a.part = id;
            if (k === 'move') a.d = [0, 2, 0];
          }
          if (k === 'sound') a.snd = 'ding';
          if (k === 'score') a.n = 10;
          if (k === 'motor') {
            const j = ed.doc.joints.find((x) => x.motor) ?? ed.doc.joints[0];
            if (!j) return notify(t('studio.needJoint', 'Crie uma junta com motor em Mecânica primeiro'), { icon: 'warning', kind: 'warn' });
            a.joint = j.id;
          }
          work.do.push(a);
          this.pendingRule = work;
          commit();
        } else if (b.hasAttribute('data-rm')) {
          work.do.splice(Number(b.closest<HTMLElement>('[data-i]')!.dataset.i), 1);
          this.pendingRule = work;
          commit();
        } else if (b.hasAttribute('data-snd')) {
          const i = Number(b.closest<HTMLElement>('[data-i]')!.dataset.i);
          const cur = work.do[i].snd ?? 'ding';
          work.do[i].snd = SOUNDS[(SOUNDS.indexOf(cur) + 1) % SOUNDS.length];
          commit();
        } else if (b.dataset.n) {
          const i = Number(b.closest<HTMLElement>('[data-i]')!.dataset.i);
          work.do[i].n = (work.do[i].n ?? 0) + Number(b.dataset.n);
          commit();
        } else if (b.hasAttribute('data-ok')) {
          this.editRule = null;
          if (work.do.length) commit();
          this.pendingRule = null;
          this.render();
        } else if (b.hasAttribute('data-delrule')) {
          this.editRule = null;
          this.pendingRule = null;
          ed.setLogic(ed.doc.logic.filter((x) => x.id !== work.id));
          this.render();
        }
      });
    }
  }
  private pendingRule: LogicRule | null = null;

  /** banner "toque numa peça" + espera a escolha */
  async pick(msg: string): Promise<number | null> {
    const b = this.pickBanner;
    b.innerHTML = `<span>${msg}</span><button>${t('studio.cancel', 'Cancelar')}</button>`;
    b.hidden = false;
    this.el.classList.add('picking');
    b.querySelector('button')!.onclick = () => this.s.editor.cancelPick();
    const id = await this.s.editor.pickPart();
    b.hidden = true;
    // o toque que escolheu a peça ainda gera um "click" logo depois: o painel só volta a
    // receber toques um pouco depois (senão o clique fantasma aperta o botão que estiver ali)
    setTimeout(() => this.el.classList.remove('picking'), 400);
    return id;
  }

  /* --------------------------------- camadas --------------------------------- */

  private renderLayers(): void {
    const ed = this.s.editor;
    const lv = this.h(`<div class="bs-layers">${[0, 1, 2, 3, 4, 5, 6, 7].map((l) => `<button class="bs-lay${ed.layersHidden.has(l) ? '' : ' on'}" data-l="${l}">${sicon(ed.layersHidden.has(l) ? 'eyeoff' : 'eye', 14)}${l + 1}</button>`).join('')}</div>`);
    this.on(lv, '[data-l]', (b) => {
      ed.toggleLayerVisible(Number(b.dataset.l));
      this.render();
    });
    const sel = ed.selected();
    if (sel.length === 1) {
      const p = sel[0];
      const nm = this.h(`<div class="bs-rename"><input maxlength="32" placeholder="${t('studio.partName', 'Nome da peça')}" value="${esc(p.name ?? '')}"><button class="bs-mini" data-lay>${t('studio.layer', 'Camada')} ${(p.layer ?? 0) + 1}</button></div>`);
      const inp = nm.querySelector('input')!;
      inp.addEventListener('change', () => {
        const f = filterMessage(inp.value);
        if (inp.value && (!f.ok || f.filtered)) return notify(t('studio.badName', 'Escolha outro nome'), { icon: 'warning', kind: 'warn' });
        ed.rename(p.id, inp.value.trim());
      });
      nm.querySelector('[data-lay]')!.addEventListener('click', () => ed.setLayer([p.id], ((p.layer ?? 0) + 1) % 8));
    } else if (sel.length > 1) {
      const gb = this.h(`<div class="bs-row2"><button class="bs-btn" data-g="g">${sicon('group', 18)}${t('studio.group', 'Agrupar')}</button><button class="bs-btn" data-g="u">${sicon('ungroup', 18)}${t('studio.ungroup', 'Desagrupar')}</button></div>`);
      this.on(gb, '[data-g]', (b) => (b.dataset.g === 'g' ? ed.group_() : ed.ungroup()));
    }
    // lista em árvore: grupos e peças soltas
    const parts = ed.doc.parts;
    const groups = new Map<number, typeof parts>();
    const loose: typeof parts = [];
    for (const p of parts) {
      if (p.g) {
        if (!groups.has(p.g)) groups.set(p.g, []);
        groups.get(p.g)!.push(p);
      } else loose.push(p);
    }
    const icon = (p: (typeof parts)[0]) => sicon(p.t === 'stroke' ? 'pen' : p.t === 'ref' ? 'folder' : p.t, 16);
    const row = (p: (typeof parts)[0], ind = false) =>
      `<button class="bs-tree${ed.sel.has(p.id) ? ' on' : ''}${ind ? ' ind' : ''}" data-id="${p.id}">${icon(p)}<span>${esc(p.name || (p.t === 'stroke' ? t('studio.tool.pen', 'Caneta 3D') : p.t === 'ref' ? t('studio.imported', 'Importada') : primName(p.t)))}</span><small>${p.role ? roleName(p.role) + ' · ' : ''}#${p.id} · ${(p.layer ?? 0) + 1}</small></button>`;
    let html = '';
    for (const [g, ps] of groups) html += `<div class="bs-tgroup" data-g="${g}">${sicon('group', 16)} ${t('studio.groupN', 'Grupo {n}', { n: g })} <small>${ps.length}</small></div>` + ps.slice(0, 200).map((p) => row(p, true)).join('');
    html += loose.slice(0, 400).map((p) => row(p)).join('');
    const list = this.h(`<div class="bs-treelist">${html || `<p class="bs-hint">${t('studio.empty', 'Nada aqui ainda — use Adicionar.')}</p>`}</div>`);
    this.on(list, '[data-id],[data-g]', (b) => {
      if (b.dataset.id) ed.select([Number(b.dataset.id)], ed.multi);
      else {
        const ids = parts.filter((p) => p.g === Number(b.dataset.g)).map((p) => p.id);
        ed.select(ids.slice(0, 1));
      }
      this.render();
    });
  }

  /* --------------------------------- terreno --------------------------------- */

  private renderTerrain(): void {
    const s = this.s;
    const sc = s.sculptor;
    if (s.world.kind !== 'flat') {
      this.h(`<p class="bs-hint bs-callout">${t('studio.terr.needFlat', 'O relevo é esculpido no mundo Plano. No Infinito, use “Personalizar mundo”.')}</p>`);
      const b = this.h(`<button class="bs-btn bs-wide bs-accent">${sicon('terrain', 18)}${t('studio.terr.useFlat', 'Usar o mundo Plano')}</button>`);
      b.addEventListener('click', () => {
        s.editor.change('world', () => (s.editor.doc.worldKind = 'flat'));
        s.syncWorld();
        this.render();
      });
      return;
    }
    const B: [Brush, string, string][] = [
      ['raise', 'raise', t('studio.terr.raise', 'Subir')],
      ['lower', 'lower', t('studio.terr.lower', 'Baixar')],
      ['smooth', 'smooth', t('studio.terr.smooth', 'Suavizar')],
      ['flatten', 'flatten', t('studio.terr.flatten', 'Aplainar')],
      ['level', 'level', t('studio.terr.level', 'Nivelar')],
      ['ramp', 'slope', t('studio.terr.ramp', 'Rampa')],
      ['paint', 'paint', t('studio.terr.paint', 'Pintar chão')],
      ['water', 'water', t('studio.terr.water', 'Rio')],
      ['lake', 'lake', t('studio.terr.lake', 'Lago')],
    ];
    const g = this.h(`<div class="bs-grid bs-tgrid">${B.map(([id, ic, nm]) => `<button class="bs-cell${sc.brush === id ? ' on' : ''}" data-b="${id}">${sicon(ic, 26)}<span>${nm}</span></button>`).join('')}</div>`);
    this.on(g, '[data-b]', (b) => {
      sc.brush = b.dataset.b as Brush;
      s.editor.setTool('terrain');
      this.render();
    });
    const HINT: Record<Brush, () => string> = {
      raise: () => t('studio.terr.hRaise', 'Passe o dedo para fazer morros. Segure parado para subir mais.'),
      lower: () => t('studio.terr.hLower', 'Passe o dedo para cavar buracos e vales.'),
      smooth: () => t('studio.terr.hSmooth', 'Deixa o chão mais redondinho, sem pontas.'),
      flatten: () => t('studio.terr.hFlatten', 'Deixa tudo na altura de onde você começou a passar o dedo.'),
      level: () => t('studio.terr.hLevel', 'Deixa o chão exatamente na altura escolhida abaixo.'),
      ramp: () => t('studio.terr.hRamp', 'Arraste de onde a rampa começa até onde ela termina. Ela sobe a altura escolhida.'),
      paint: () => t('studio.terr.hPaint', 'Escolha o chão e passe o dedo para pintar.'),
      water: () => t('studio.terr.hWater', 'Desenhe um rio: o chão afunda um pouco e enche de água.'),
      lake: () => t('studio.terr.hLake', 'Toque para cavar um lago. Toque num lago para tirar.'),
    };
    this.h(`<p class="bs-hint bs-callout">${HINT[sc.brush]()}</p>`);
    if (sc.brush === 'paint') {
      const M: [number, string, string][] = [
        [0, MAT_COLORS.grass, t('studio.terr.m.grass', 'Grama')],
        [1, MAT_COLORS.sand, t('studio.terr.m.sand', 'Areia')],
        [2, MAT_COLORS.snow, t('studio.terr.m.snow', 'Neve')],
        [3, MAT_COLORS.rock, t('studio.terr.m.rock', 'Pedra')],
        [4, MAT_COLORS.dirt, t('studio.terr.m.dirt', 'Terra')],
      ];
      const m = this.h(`<div class="bs-chips">${M.map(([i, c, nm]) => `<button class="bs-chip${sc.mat === i ? ' on' : ''}" data-m="${i}"><i class="bs-dot" style="background:${c}"></i>${nm}</button>`).join('')}</div>`);
      this.on(m, '[data-m]', (b) => {
        sc.mat = Number(b.dataset.m);
        this.render();
      });
    }
    const sl = this.h(`<div class="bs-sliders">
      <label>${t('studio.terr.size', 'Tamanho')}<input type="range" min="1" max="16" step="0.5" value="${sc.size}" data-k="size"><b>${sc.size} m</b></label>
      ${sc.brush === 'paint' || sc.brush === 'lake' ? '' : `<label>${t('studio.terr.force', 'Força')}<input type="range" min="0.1" max="1" step="0.05" value="${sc.strength}" data-k="strength"><b>${Math.round(sc.strength * 100)}%</b></label>`}
      ${sc.brush === 'level' || sc.brush === 'ramp' ? `<label>${t('studio.terr.height', 'Altura')}<input type="range" min="-10" max="20" step="0.5" value="${sc.level}" data-k="level"><b>${sc.level} m</b></label>` : ''}</div>`);
    sl.querySelectorAll<HTMLInputElement>('input').forEach((inp) =>
      inp.addEventListener('input', () => {
        const k = inp.dataset.k as 'size' | 'strength' | 'level';
        sc[k] = Number(inp.value);
        const b = inp.parentElement!.querySelector('b')!;
        b.textContent = k === 'strength' ? Math.round(sc.strength * 100) + '%' : inp.value + ' m';
      }),
    );
    const row = this.h(`<div class="bs-row2"><button class="bs-btn" data-x="top">${sicon('topview', 18)}${t('studio.terr.top', 'Vista de cima')}</button><button class="bs-btn" data-x="reset">${sicon('trash', 18)}${t('studio.terr.reset', 'Aplainar tudo')}</button></div>`);
    this.on(row, '[data-x]', (b) => {
      if (b.dataset.x === 'top') {
        const c = s.editor.cam;
        c.pitch = 1.4;
        c.dist = Math.max(c.dist, 40);
      } else
        this.confirm(t('studio.terr.resetQ', 'Deixar o chão todo plano de novo?'), () => {
          s.editor.change('terrain', () => delete s.editor.doc.terrain);
        });
    });
    this.h(`<p class="bs-hint">${t('studio.terr.tip', '1 dedo pincela · 2 dedos movem a câmera · Desfazer volta cada traço.')}</p>`);
  }

  /* ---------------------------------- mundo ---------------------------------- */

  worldSheet(): void {
    openWorldSheet(this.s, (h) => this.openSheet(h), () => this.closeSheet());
  }

  private renderMission(): void {
    renderMissionPanel(this.s, this.body, (h) => this.h(h), (el, sel, fn) => this.on(el, sel, fn), () => this.render());
  }

  private renderWorld(): void {
    const ed = this.s.editor;
    const d = ed.doc;
    const wk = d.worldKind ?? 'void';
    const k = this.h(`<div><h4>${t('studio.kindTitle', 'Tipo de criação')}</h4><div class="bs-seg">
      ${(['object', 'vehicle', 'map'] as const).map((x) => `<button data-k="${x}" class="${d.kind === x ? 'on' : ''}">${kindName(x)}</button>`).join('')}</div></div>`);
    this.on(k, '[data-k]', (b) => ed.change('kind', () => (d.kind = b.dataset.k as Creation['kind'])));
    const w = this.h(`<div><h4>${t('studio.worldTitle', 'Mundo')}</h4><div class="bs-worlds">
      <button data-w="infinite" class="bs-wcard w-inf${wk === 'infinite' ? ' on' : ''}"><b>${t('studio.world.infinite', 'Infinito')}</b><small>${t('studio.world.infiniteSub', 'terreno sem fim, árvores e biomas')}</small></button>
      <button data-w="flat" class="bs-wcard w-flat${wk === 'flat' ? ' on' : ''}"><b>${t('studio.world.flat', 'Plano')}</b><small>${t('studio.world.flatSub', 'chão enorme e liso')}</small></button>
      <button data-w="void" class="bs-wcard w-void${wk === 'void' ? ' on' : ''}"><b>${t('studio.world.void', 'Vazio')}</b><small>${t('studio.world.voidSub', 'vitrine num pedestal')}</small></button></div></div>`);
    this.on(w, '[data-w]', (b) => {
      const was = d.worldKind;
      ed.change('world', () => (d.worldKind = b.dataset.w as Creation['worldKind']));
      if (!d.seed) d.seed = 1;
      this.s.syncWorld();
      if (d.worldKind === 'infinite' && was !== 'infinite') this.worldSheet();
    });
    if (wk === 'infinite') {
      const cu = this.h(`<button class="bs-btn bs-wide bs-accent">${sicon('sliders', 18)}${t('studio.wg.title', 'Personalizar mundo')}</button>`);
      cu.addEventListener('click', () => this.worldSheet());
      const sd = this.h(`<button class="bs-btn bs-wide">${sicon('refresh', 18)}${t('studio.newSeed', 'Outro terreno (semente {n})', { n: d.seed ?? 1 })}</button>`);
      sd.addEventListener('click', () => {
        ed.change('world', () => (d.seed = (Math.random() * 1e6) | 0));
        this.s.syncWorld();
      });
    }
    this.h(`<p class="bs-hint">${t('studio.worldHint', 'A área de construção perto do centro é sempre plana. Aperte Testar para andar e dirigir nesse mundo.')}</p>`);
  }

  /* ----------------------------- minhas criações ----------------------------- */

  private async renderLibrary(): Promise<void> {
    const gd = this.h(`<button class="bs-btn bs-wide bs-accent bs-guidebtn">${sicon('mech', 20)}<span><b>${t('studio.guide.title', 'Monte um carro')}</b><small>${t('studio.guide.sub', 'passo a passo, em 5 passos')}</small></span></button>`);
    gd.addEventListener('click', async () => {
      if (this.s.dirty) await this.s.save(true);
      this.s.guide.start();
    });
    const nw = this.h(`<div><h4>${t('studio.newTitle', 'Nova criação')}</h4><div class="bs-row3">
      <button class="bs-new" data-n="object">${sicon('box', 28)}<b>${kindName('object')}</b></button>
      <button class="bs-new" data-n="vehicle">${sicon('mech', 28)}<b>${kindName('vehicle')}</b></button>
      <button class="bs-new" data-n="map">${sicon('mapadd', 28)}<b>${kindName('map')}</b></button></div></div>`);
    this.on(nw, '[data-n]', async (b) => {
      if (this.s.dirty) await this.s.save(true);
      this.s.newDoc(b.dataset.n as Creation['kind']);
      this.closeAll();
    });
    const items = await listMine();
    if (this.current !== 'library') return;
    const cur = this.s.editor.doc;
    const list = this.h(`<div class="bs-cards">${items
      .map(
        (e) => `<div class="bs-lib${e.id === cur.id ? ' cur' : ''}" data-id="${e.id}">
        <div class="bs-thumb" style="${e.thumb ? `background-image:url(${e.thumb})` : ''}"></div>
        <div class="bs-meta"><b>${esc(e.name)}</b><small>${kindName(e.kind)} · ${e.parts} · ${new Date(e.updated).toLocaleDateString()}</small></div>
        <div class="bs-acts">
          <button class="bs-mini" data-a="open">${t('studio.open', 'Abrir')}</button>
          ${cur.kind === 'map' && e.id !== cur.id ? `<button class="bs-mini" data-a="insert">${t('studio.insert', 'Pôr no mapa')}</button>` : ''}
          <button class="bs-mini" data-a="del">${sicon('trash', 14)}</button></div></div>`,
      )
      .join('') || `<p class="bs-hint">${t('studio.libEmpty', 'Suas criações salvas aparecem aqui.')}</p>`}</div>`);
    this.on(list, '[data-a]', async (b) => {
      const id = b.closest<HTMLElement>('[data-id]')!.dataset.id!;
      const a = b.dataset.a;
      if (a === 'open') {
        if (this.s.dirty) await this.s.save(true);
        const c = await loadMine(id);
        if (c) await this.s.openDoc(c);
        this.closeAll();
      } else if (a === 'insert') {
        const c = await loadMine(id);
        if (!c) return;
        remember(c);
        this.s.editor.addRef(c.id, new THREE.Vector3());
        notify(t('studio.inserted', '“{n}” no seu mapa', { n: c.name }), { icon: 'check', kind: 'good' });
      } else if (a === 'del') {
        this.confirm(t('studio.delConfirm', 'Apagar esta criação para sempre?'), async () => {
          await deleteMine(id);
          if (id === cur.id) this.s.newDoc(cur.kind);
          this.render();
        });
      }
    });
    void this.refreshAfter(list);
  }
  private async refreshAfter(_el: HTMLElement): Promise<void> {
    void _el;
  }

  /* ---------------------------------- loja ---------------------------------- */

  private async renderStore(): Promise<void> {
    if (this.detail) return this.renderDetail(this.detail);
    const q = this.storeQ;
    const games = q.section === 'games';
    const sec = this.h(`<div class="bs-seg bs-secs"><button data-sec="games" class="${games ? 'on' : ''}">${sicon('play', 16)}${t('studio.games', 'Jogos da Comunidade')}</button><button data-sec="creations" class="${!games ? 'on' : ''}">${sicon('box', 16)}${t('studio.creations', 'Criações')}</button></div>`);
    this.on(sec, '[data-sec]', (b) => {
      this.storeQ = { sort: 'trending', section: b.dataset.sec as 'games' };
      this.render();
    });
    const top = this.h(`<div>
      <div class="bs-seg">${(['trending', 'new', 'top'] as StoreSort[]).map((x) => `<button data-sort="${x}" class="${q.sort === x ? 'on' : ''}">${x === 'trending' ? t('studio.sort.trending', 'Em alta') : x === 'new' ? t('studio.sort.new', 'Novos') : t('studio.sort.top', 'Mais curtidos')}</button>`).join('')}</div>
      ${games
        ? `<div class="bs-chips bs-cats"><button class="bs-chip${!q.tag && !q.fav ? ' on' : ''}" data-tag="">${t('studio.cat.all', 'Tudo')}</button><button class="bs-chip${q.fav ? ' on' : ''}" data-fav>★ ${t('studio.favs', 'Favoritos')}</button>${GAME_TAGS.map((g) => `<button class="bs-chip${q.tag === g ? ' on' : ''}" data-tag="${g}">${tagName(g)}</button>`).join('')}</div>`
        : `<div class="bs-chips bs-cats"><button class="bs-chip${!q.category ? ' on' : ''}" data-cat="">${t('studio.cat.all', 'Tudo')}</button>${STORE_CATEGORIES.filter((c) => c !== 'maps').map((c) => `<button class="bs-chip${q.category === c ? ' on' : ''}" data-cat="${c}">${catName(c)}</button>`).join('')}</div>`}
      <div class="bs-row2"><button class="bs-btn bs-accent" data-pub>${sicon('upload', 18)}${t('studio.publishThis', 'Publicar a minha')}</button><button class="bs-btn" data-mine>${sicon('user', 18)}${t('studio.myPubs', 'Minhas publicações')}</button></div></div>`);
    this.on(top, 'button', (b) => {
      if (b.dataset.sort) this.storeQ.sort = b.dataset.sort as StoreSort;
      else if (b.dataset.cat !== undefined) this.storeQ.category = (b.dataset.cat || undefined) as StoreCategory | undefined;
      else if (b.dataset.tag !== undefined) {
        this.storeQ.tag = b.dataset.tag || undefined;
        this.storeQ.fav = false;
      } else if (b.hasAttribute('data-fav')) {
        this.storeQ.fav = !this.storeQ.fav;
        this.storeQ.tag = undefined;
      }
      else if (b.hasAttribute('data-pub')) return this.open('publish');
      else if (b.hasAttribute('data-mine')) return void this.renderMine();
      this.render();
    });
    const page = await store().browse({ sort: q.sort, category: games ? undefined : q.category, section: q.section, tag: q.tag, favorites: q.fav, limit: 40 });
    if (this.current !== 'store' || this.detail) return;
    const grid = this.h(`<div class="bs-shop">${page.items.map((l) => this.cardHtml(l)).join('') || `<p class="bs-hint">${t('studio.storeEmpty', 'Nada nesta categoria ainda.')}</p>`}</div>`);
    this.on(grid, '[data-id]', (b) => {
      const l = page.items.find((x) => x.id === b.dataset.id);
      if (l) {
        this.detail = l;
        this.render();
      }
    });
    // miniaturas das criações iniciais: geradas na hora (uma vez)
    void this.fillThumbs(grid, page.items);
  }

  private thumbCache = new Map<string, string>();
  private async fillThumbs(grid: HTMLElement, items: StoreListing[]): Promise<void> {
    for (const l of items) {
      if (l.thumb) continue;
      let url = this.thumbCache.get(l.id);
      if (!url) {
        const r = await store().get(l.id);
        if (!r || this.current !== 'store') return;
        if (r.creation.deps) for (const d of r.creation.deps) remember(d);
        url = this.s.thumb(r.creation);
        this.thumbCache.set(l.id, url);
      }
      const el = grid.querySelector<HTMLElement>(`[data-id="${l.id}"] .bs-thumb`);
      if (el) el.style.backgroundImage = `url(${url})`;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private cardHtml(l: StoreListing): string {
    const th = l.game?.thumbs[0] ?? l.thumb ?? this.thumbCache.get(l.id);
    if (l.game)
      return `<button class="bs-item bs-gitem" data-id="${l.id}"><div class="bs-thumb" style="${th ? `background-image:url(${th})` : ''}"><i class="bs-tag">${sicon('play', 10)} ${l.plays}</i></div>
      <b>${esc(l.official ? starterName(l.id, l.game.title) : l.game.title)}</b><small>${esc(l.author.name)} · ♥ ${l.likes} · ★ ${l.favorites ?? 0}</small></button>`;
    return `<button class="bs-item" data-id="${l.id}"><div class="bs-thumb" style="${th ? `background-image:url(${th})` : ''}">${l.kind === 'map' ? `<i class="bs-tag">${kindName('map')}</i>` : l.kind === 'vehicle' ? `<i class="bs-tag v">${kindName('vehicle')}</i>` : ''}</div>
      <b>${esc(l.official ? starterName(l.id, l.name) : l.name)}</b><small>${esc(l.author.name)} · ♥ ${l.likes}</small></button>`;
  }

  private async renderDetail(l: StoreListing): Promise<void> {
    const back = this.h(`<button class="bs-btn">${sicon('back', 16)}${t('studio.back', 'Voltar')}</button>`);
    back.addEventListener('click', () => {
      this.detail = null;
      this.render();
    });
    const th = l.game?.thumbs[0] ?? l.thumb ?? this.thumbCache.get(l.id);
    const name = l.official ? starterName(l.id, l.game?.title ?? l.name) : l.game?.title ?? l.name;
    const isMap = this.s.editor.doc.kind === 'map';
    const shots = l.game?.thumbs.length ? l.game.thumbs : th ? [th] : [];
    const board = l.game ? await store().leaderboard(l.id) : [];
    const d = this.h(`<div class="bs-detail">
      <div class="bs-shots">${shots.map((u) => `<div class="bs-thumb big" style="background-image:url(${u})"></div>`).join('') || '<div class="bs-thumb big"></div>'}</div>
      <h3>${esc(name)}</h3>
      ${l.game ? `<p class="bs-gdesc">${esc(l.game.desc)}</p><div class="bs-chips">${l.game.tags.map((g) => `<span class="bs-gtag">${tagName(g)}</span>`).join('')}<span class="bs-gtag p">${t('studio.maxPlayers', 'até {n} jogadores', { n: l.game.maxPlayers })}</span></div>` : ''}
      <p class="bs-by">${t('studio.by', 'por')} <b>${esc(l.author.name)}</b>${l.official ? ' ✓' : ''} · ${kindName(l.kind)} · ${l.parts} ${t('studio.partsWord', 'peças')}</p>
      <p class="bs-stats">♥ ${l.likes} · ${t('studio.uses', '{n} usos', { n: l.uses })}${l.kind === 'map' ? ' · ' + t('studio.plays', '{n} partidas', { n: l.plays }) : ''}</p>
      <div class="bs-row2">
        ${l.kind === 'map' ? `<button class="bs-btn bs-accent" data-a="play">${sicon('play', 18)}${t('studio.playMap', 'Jogar mapa')}</button>` : `<button class="bs-btn bs-accent" data-a="use">${sicon('mapadd', 18)}${isMap ? t('studio.useInMap', 'Usar no meu mapa') : t('studio.useInNewMap', 'Usar num mapa novo')}</button>`}
        <button class="bs-btn${l.liked ? ' on' : ''}" data-a="like">${sicon('heart', 18)}${l.liked ? t('studio.liked', 'Curtido') : t('studio.like', 'Curtir')}</button>
      </div>
      <div class="bs-row2">
        <button class="bs-btn${l.fav ? ' on' : ''}" data-a="fav">${sicon('fly', 18)}${l.fav ? t('studio.faved', 'Favorito') : t('studio.fav', 'Favoritar')}</button>
        <button class="bs-btn" data-a="share">${sicon('link', 18)}${t('studio.share', 'Compartilhar')}</button>
      </div>
      ${l.game ? `<div class="bs-board"><h4>${sicon('flag', 14)} ${t('studio.board', 'Placar')}</h4>${board.length ? board.slice(0, 5).map((e, i) => `<div class="bs-li${e.me ? ' me' : ''}"><b>${i + 1}º</b><span>${esc(e.name)}</span><small>★ ${e.score} · ${e.timeSec}s</small></div>`).join('') : `<p class="bs-hint">${t('studio.boardEmpty', 'Ninguém no placar ainda — seja o primeiro!')}</p>`}</div>` : ''}
      <div class="bs-row2">
        ${l.kind !== 'map' ? `<button class="bs-btn" data-a="test">${sicon('play', 18)}${t('studio.tryIt', 'Experimentar')}</button>` : ''}
        <button class="bs-btn" data-a="remix">${sicon('remix', 18)}${t('studio.remix', 'Copiar e editar')}</button>
      </div>
      <div class="bs-ugc">
        <button class="bs-link" data-a="report">${sicon('report', 16)}${t('studio.report', 'Denunciar')}</button>
        ${l.official || l.author.id === localAuthor().id ? '' : `<button class="bs-link" data-a="hide">${sicon('eyeoff', 16)}${t('studio.hideAuthor', 'Ocultar autor')}</button>`}
      </div></div>`);
    this.on(d, '[data-a]', async (b) => {
      const a = b.dataset.a;
      if (a === 'like') {
        l.liked = !l.liked;
        l.likes = await store().like(l.id, l.liked);
        this.render();
        return;
      }
      if (a === 'report') return this.reportSheet(l);
      if (a === 'fav') {
        l.fav = !l.fav;
        l.favorites = await store().favorite(l.id, l.fav);
        this.render();
        return;
      }
      if (a === 'share') {
        const r = await shareUrl(linkFor({ id: l.id }), name);
        if (r === 'copied') notify(t('studio.linkCopied', 'Link copiado!'), { icon: 'link', kind: 'good' });
        return;
      }
      if (a === 'hide') {
        this.confirm(t('studio.hideConfirm', 'Ocultar tudo de {n}? Você pode desfazer depois em Minhas publicações.', { n: l.author.name }), async () => {
          await store().hideAuthor(l.author.id);
          this.detail = null;
          notify(t('studio.hidden', 'Autor ocultado'), { icon: 'check' });
          this.render();
        });
        return;
      }
      const r = await store().get(l.id);
      if (!r) return notify(t('studio.offline', 'Não deu para baixar agora'), { icon: 'cloud-off', kind: 'warn' });
      const c = r.creation;
      remember(c);
      if (c.deps) for (const x of c.deps) remember(x);
      if (a === 'play') {
        this.closeAll();
        void this.s.playStoreMap(c);
      } else if (a === 'test') {
        this.closeAll();
        void this.s.playStoreMap({ ...c, worldKind: c.kind === 'vehicle' ? 'infinite' : c.worldKind ?? 'flat' });
      } else if (a === 'use') {
        if (!isMap) {
          if (this.s.dirty) await this.s.save(true);
          this.s.newDoc('map');
        }
        const id = this.s.editor.addRef(c.id, new THREE.Vector3());
        if (id != null) {
          const rec = await store().recordUse(c.id, 'place');
          void rec;
          notify(t('studio.placed', '“{n}” no seu mapa! O criador ganha moedas com isso', { n: c.name }), { icon: 'coin', kind: 'good' });
          this.closeAll();
        }
      } else if (a === 'remix') {
        if (this.s.dirty) await this.s.save(true);
        const me = localAuthor();
        const copy: Creation = { ...JSON.parse(JSON.stringify(c)), id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), author: me.name, authorId: me.id, from: c.id, thumbnail: undefined };
        await this.s.openDoc(copy);
        this.closeAll();
        notify(t('studio.remixed', 'Cópia sua — edite à vontade!'), { icon: 'pencil', kind: 'good' });
      }
    });
  }

  private reportSheet(l: StoreListing): void {
    const reasons: [string, string][] = [
      ['offensive', t('studio.rep.offensive', 'Ofensivo ou feio')],
      ['scary', t('studio.rep.scary', 'Assustador / impróprio')],
      ['copy', t('studio.rep.copy', 'Copiou de alguém')],
      ['spam', t('studio.rep.spam', 'Spam')],
      ['other', t('studio.rep.other', 'Outro motivo')],
    ];
    const s = this.openSheet(`<h3>${t('studio.reportTitle', 'Denunciar “{n}”', { n: esc(l.name) })}</h3>
      <p>${t('studio.reportSub', 'A equipe vai olhar. Ela some da sua loja agora.')}</p>
      <div class="bs-col">${reasons.map(([k, v]) => `<button class="bs-btn" data-r="${k}">${v}</button>`).join('')}</div>
      <button class="bs-link" data-close>${t('studio.cancel', 'Cancelar')}</button>`);
    this.on(s, '[data-r]', async (b) => {
      await store().report(l.id, b.dataset.r as 'other');
      this.closeSheet();
      this.detail = null;
      notify(t('studio.reported', 'Obrigado! Denúncia enviada'), { icon: 'check', kind: 'good' });
      this.render();
    });
  }

  private async renderMine(): Promise<void> {
    this.body.innerHTML = '';
    const back = this.h(`<button class="bs-btn">${sicon('back', 16)}${t('studio.back', 'Voltar')}</button>`);
    back.addEventListener('click', () => this.render());
    const [mine, earn, hidden] = await Promise.all([store().mine(), store().earnings(), store().hiddenAuthors()]);
    this.h(`<div class="bs-earn"><b>${t('studio.earnTitle', 'Moedas de criador')}</b><span>${t('studio.earnText', 'Quando outras pessoas usam ou jogam suas criações, você ganha moedas do jogo (nunca dinheiro). A receber: {n}', { n: earn.pending })}</span></div>`);
    const list = this.h(`<div class="bs-cards">${mine.map((l) => `<div class="bs-lib" data-id="${l.id}"><div class="bs-thumb" style="${l.thumb ? `background-image:url(${l.thumb})` : ''}"></div><div class="bs-meta"><b>${esc(l.name)}</b><small>♥ ${l.likes} · ${t('studio.uses', '{n} usos', { n: l.uses })}</small></div><div class="bs-acts"><button class="bs-mini" data-un>${t('studio.unpublish', 'Tirar da loja')}</button></div></div>`).join('') || `<p class="bs-hint">${t('studio.noPubs', 'Você ainda não publicou nada.')}</p>`}</div>`);
    this.on(list, '[data-un]', async (b) => {
      await store().unpublish(b.closest<HTMLElement>('[data-id]')!.dataset.id!);
      void this.renderMine();
    });
    if (hidden.length) {
      const h = this.h(`<div><h4>${t('studio.hiddenAuthors', 'Autores ocultos')}</h4>${hidden.map((a) => `<div class="bs-li"><span>${esc(a)}</span><button class="bs-mini" data-show="${esc(a)}">${t('studio.show', 'Mostrar')}</button></div>`).join('')}</div>`);
      this.on(h, '[data-show]', async (b) => {
        await store().unhideAuthor(b.dataset.show!);
        void this.renderMine();
      });
    }
  }

  /* --------------------------------- publicar --------------------------------- */

  private async renderPublish(): Promise<void> {
    const doc = this.s.editor.doc;
    const today = await store().publishedToday();
    const lim = publishLimit();
    const cat: StoreCategory = doc.kind === 'map' ? 'maps' : doc.kind === 'vehicle' ? 'vehicles' : 'gadgets';
    let chosen: StoreCategory = cat;
    const th = this.s.thumb();
    const f = this.h(`<div class="bs-pubf">
      <div class="bs-thumb big" style="background-image:url(${th})"></div>
      <label>${t('studio.fieldName', 'Nome')}<input maxlength="32" value="${esc(doc.name)}"></label>
      <div class="bs-chips">${STORE_CATEGORIES.map((c) => `<button class="bs-chip${c === cat ? ' on' : ''}" data-cat="${c}">${catName(c)}</button>`).join('')}</div>
      ${doc.kind === 'map' ? `<label class="bs-toggle"><input type="checkbox" data-game ${doc.game || doc.scripts?.length ? 'checked' : ''}> ${t('studio.asGame', 'Publicar como Jogo da Comunidade')}</label>
      <div class="bs-gform" ${doc.game || doc.scripts?.length ? '' : 'hidden'}>
        <label>${t('studio.gameTitle', 'Título do jogo')}<input data-gt maxlength="32" value="${esc(doc.game?.title ?? doc.name)}"></label>
        <label>${t('studio.gameDesc', 'Como jogar')}<textarea data-gd maxlength="200" rows="3">${esc(doc.game?.desc ?? '')}</textarea></label>
        <div class="bs-chips">${GAME_TAGS.map((g) => `<button class="bs-chip${doc.game?.tags.includes(g) ? ' on' : ''}" data-gtag="${g}">${tagName(g)}</button>`).join('')}</div>
        <div class="bs-step"><span>${t('studio.players', 'Jogadores')}</span><button data-mp="-1">−</button><b data-mpv>${doc.game?.maxPlayers ?? 4}</b><button data-mp="1">+</button></div>
        <div class="bs-shots small">${this.s.thumbs3().map((u) => `<div class="bs-thumb" style="background-image:url(${u})"></div>`).join('')}</div>
        <p class="bs-hint">${t('studio.reviewHint', 'As 3 fotos são tiradas do seu mapa. Jogos passam por uma revisão de segurança antes de aparecer para todos.')}</p>
      </div>` : ''}
      <p class="bs-hint">${t('studio.pubRules', 'Grátis. Todo mundo poderá ver, jogar e usar no mapa deles — e você ganha moedas quando usarem. Nada de dados pessoais no nome. Hoje: {a}/{b}', { a: today, b: lim })}</p>
      <button class="bs-btn bs-accent bs-wide" data-go>${sicon('upload', 18)}${t('studio.publishNow', 'Publicar na Loja')}</button></div>`);
    this.on(f, '[data-cat]', (b) => {
      chosen = b.dataset.cat as StoreCategory;
      f.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('on', x === b));
    });
    const gtags = new Set(doc.game?.tags ?? []);
    let mp = doc.game?.maxPlayers ?? 4;
    f.querySelector('[data-game]')?.addEventListener('change', (e) => {
      (f.querySelector('.bs-gform') as HTMLElement).hidden = !(e.target as HTMLInputElement).checked;
    });
    this.on(f, '[data-gtag]', (b) => {
      const g = b.dataset.gtag!;
      if (gtags.has(g)) gtags.delete(g);
      else if (gtags.size < 5) gtags.add(g);
      b.classList.toggle('on', gtags.has(g));
    });
    this.on(f, '[data-mp]', (b) => {
      mp = Math.max(1, Math.min(16, mp + Number(b.dataset.mp)));
      f.querySelector('[data-mpv]')!.textContent = String(mp);
    });
    f.querySelector('[data-go]')!.addEventListener('click', async () => {
      const name = (f.querySelector('input') as HTMLInputElement).value.trim();
      const fm = filterMessage(name);
      if (!name || !fm.ok || fm.filtered) return notify(t('studio.badName', 'Escolha outro nome'), { icon: 'warning', kind: 'warn' });
      if (today >= lim && !isPro()) return this.paywall('publish');
      if (name !== doc.name) this.s.editor.change('rename', () => (doc.name = name));
      const asGame = !!(f.querySelector('[data-game]') as HTMLInputElement | null)?.checked;
      if (asGame) {
        const title = (f.querySelector('[data-gt]') as HTMLInputElement).value.trim();
        const desc = (f.querySelector('[data-gd]') as HTMLTextAreaElement).value.trim();
        const bad = (x: string) => !!x && (!filterMessage(x).ok || filterMessage(x).filtered);
        if (!title || bad(title) || bad(desc)) return notify(t('studio.badName', 'Escolha outro nome'), { icon: 'warning', kind: 'warn' });
        this.s.editor.change('game', () => (doc.game = { title, desc, tags: [...gtags], maxPlayers: mp }));
      }
      doc.thumbnail = th;
      await this.s.save(true);
      const full = (await loadMine(doc.id)) ?? doc;
      if (asGame) {
        const tk = await store().submitForReview(full, this.s.thumbs3(), lim);
        if ('error' in tk) return tk.error === 'daily-limit' && !isPro() ? this.paywall('publish') : notify(t('studio.pubFail', 'Não deu para publicar'), { icon: 'warning', kind: 'warn' });
        await markPublished(doc.id, tk.id);
        notify(tk.status === 'approved' ? t('studio.gamePublished', 'Seu jogo está nos Jogos da Comunidade!') : t('studio.gamePending', 'Enviado para revisão — avisamos quando aprovar'), { icon: 'party', kind: 'good' });
        this.storeQ = { sort: 'new', section: 'games' };
        this.open('store');
        return;
      }
      const r = await store().publish(full, chosen, lim);
      if (!r.ok) {
        if (r.error === 'daily-limit') return isPro() ? notify(t('studio.dailyLimit', 'Limite de publicações de hoje'), { icon: 'clock', kind: 'warn' }) : this.paywall('publish');
        return notify(r.error === 'name' ? t('studio.badName', 'Escolha outro nome') : r.error === 'empty' ? t('studio.emptyPub', 'Coloque algumas peças antes') : t('studio.pubFail', 'Não deu para publicar'), { icon: 'warning', kind: 'warn' });
      }
      await markPublished(doc.id, r.listing.id);
      notify(t('studio.published', 'Publicado na Loja de Criações!'), { icon: 'party', kind: 'good' });
      this.storeQ = { sort: 'new', section: 'creations' };
      this.open('store');
    });
  }

  /* ----------------------------------- info ----------------------------------- */

  private renderInfo(): void {
    const ed = this.s.editor;
    const d = ed.doc;
    const f = this.h(`<div class="bs-pubf">
      <label>${t('studio.fieldName', 'Nome')}<input maxlength="32" value="${esc(d.name)}"></label>
      <p class="bs-stats">${kindName(d.kind)} · ${d.parts.length} ${t('studio.partsWord', 'peças')} · ${d.joints.length} ${t('studio.jointsWord', 'juntas')} · ${d.logic.length} ${t('studio.rulesWord', 'fichas')}<br>${Math.round(jsonBytes(d) / 1024)} KB · hash ${hashCreation(d)}</p>
      <div class="bs-row2"><button class="bs-btn" data-a="copy">${sicon('copy', 18)}${t('studio.copyCode', 'Copiar código')}</button><button class="bs-btn" data-a="paste">${sicon('paste', 18)}${t('studio.pasteCode', 'Colar código')}</button></div>
      <div class="bs-row2"><button class="bs-btn" data-a="share">${sicon('link', 18)}${t('studio.share', 'Compartilhar')}</button><button class="bs-btn bs-accent" data-a="pub">${sicon('upload', 18)}${t('studio.publish', 'Publicar')}</button></div></div>`);
    const inp = f.querySelector('input')!;
    inp.addEventListener('change', () => {
      const v = inp.value.trim();
      const fm = filterMessage(v);
      if (!v || !fm.ok || fm.filtered) {
        inp.value = d.name;
        return notify(t('studio.badName', 'Escolha outro nome'), { icon: 'warning', kind: 'warn' });
      }
      ed.change('rename', () => (d.name = v));
    });
    this.on(f, '[data-a]', async (b) => {
      const a = b.dataset.a;
      if (a === 'pub') return this.open('publish');
      if (a === 'share') return this.share();
      if (a === 'copy') {
        const { thumbnail: _t, ...rest } = d;
        void _t;
        const code = await serialize(rest);
        try {
          await navigator.clipboard.writeText(code);
          notify(t('studio.codeCopied', 'Código copiado ({n} letras)', { n: code.length }), { icon: 'check', kind: 'good' });
        } catch {
          notify(t('studio.codeFail', 'Não deu para copiar'), { icon: 'warning', kind: 'warn' });
        }
      } else if (a === 'paste') {
        let txt = '';
        try {
          txt = await navigator.clipboard.readText();
        } catch {
          /* */
        }
        try {
          const r = await deserialize(txt);
          if (!r.creation) throw new Error('x');
          const me = localAuthor();
          const c = { ...r.creation, id: 'c_' + Date.now().toString(36), from: r.creation.id, author: me.name, authorId: me.id };
          await this.s.openDoc(validate(c).creation!);
          notify(t('studio.codeLoaded', 'Criação carregada do código'), { icon: 'check', kind: 'good' });
          this.closeAll();
        } catch {
          notify(t('studio.codeBad', 'Esse código não é de uma criação'), { icon: 'warning', kind: 'warn' });
        }
      }
    });
  }

  /** link: publicada → #/studio/p/<id>; pequena → código embutido; grande → pede para publicar */
  async share(): Promise<void> {
    const d = this.s.editor.doc;
    const mine = (await store().mine()).find((l) => l.id === d.id);
    let url: string | null = null;
    if (mine) url = linkFor({ id: mine.id });
    else {
      const { thumbnail: _t, ...rest } = d;
      void _t;
      const code = await serialize(rest);
      if (code.length <= MAX_INLINE) url = linkFor({ code });
    }
    if (!url) {
      this.confirm(t('studio.shareBig', 'Essa criação é grande demais para caber no link. Publicar na Loja para compartilhar?'), () => this.open('publish'));
      return;
    }
    const r = await shareUrl(url, d.game?.title ?? d.name);
    if (r === 'copied') notify(t('studio.linkCopied', 'Link copiado!'), { icon: 'link', kind: 'good' });
    else if (r === 'fail') notify(t('studio.codeFail', 'Não deu para copiar'), { icon: 'warning', kind: 'warn' });
    (window as unknown as { __lastShare?: string }).__lastShare = url;
  }

  /* --------------------------------- radial --------------------------------- */

  radial(x: number, y: number): void {
    this.closeRadial();
    const ed = this.s.editor;
    if (!ed.sel.size && !ed.hasClip) return;
    const items: [string, string, () => void][] = [];
    if (ed.sel.size) {
      items.push(['dup', t('studio.dup', 'Duplicar'), () => ed.duplicate()]);
      items.push(['trash', t('studio.del', 'Apagar'), () => ed.remove()]);
      items.push(['copy', t('studio.copy', 'Copiar'), () => notify(t('studio.copied', '{n} copiada(s)', { n: ed.copy() }), { icon: 'check', key: 'copy' })]);
      items.push(['paint', t('studio.tool.paint', 'Pintar'), () => ed.setMaterial([...ed.sel], ed.paint)]);
      if (ed.sel.size > 1) items.push(ed.isGrouped() ? ['ungroup', t('studio.ungroup', 'Desagrupar'), () => ed.ungroup()] : ['group', t('studio.group', 'Agrupar'), () => ed.group_()]);
      items.push(['phys', t('studio.physics', 'Física'), () => this.open('mech')]);
      items.push(['rotate', t('studio.tool.rotate', 'Girar'), () => this.s.onTool('rotate')]);
      items.push(['scale', t('studio.tool.scale', 'Tamanho'), () => this.s.onTool('scale')]);
    }
    if (ed.hasClip) items.push(['paste', t('studio.paste', 'Colar'), () => ed.paste()]);
    const r = this.s.el.getBoundingClientRect();
    const R = 74;
    const cx = Math.max(R + 34, Math.min(r.width - R - 34, x - r.left));
    const cy = Math.max(R + 40, Math.min(r.height - R - 30, y - r.top));
    const el = document.createElement('div');
    el.className = 'bs-radial';
    el.setAttribute('data-touch-ignore', '');
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    el.innerHTML =
      `<button class="bs-rc" data-i="-1">${sicon('close', 18)}</button>` +
      items
        .map(([ic, label], i) => {
          const a = -Math.PI / 2 + (i / items.length) * Math.PI * 2;
          return `<button class="bs-ri" data-i="${i}" style="--x:${Math.cos(a) * R}px;--y:${Math.sin(a) * R}px">${sicon(ic, 20)}<span>${label}</span></button>`;
        })
        .join('');
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      const i = Number(b?.dataset.i ?? -1);
      this.closeRadial();
      if (i >= 0) items[i][2]();
    });
    const bg = document.createElement('div');
    bg.className = 'bs-radial-bg';
    bg.addEventListener('pointerdown', () => this.closeRadial());
    this.s.ui.append(bg, el);
    this.radialEl = el;
    requestAnimationFrame(() => el.classList.add('on'));
  }
  private closeRadial(): void {
    if (!this.radialEl) return;
    this.radialEl.remove();
    this.s.ui.querySelector('.bs-radial-bg')?.remove();
    this.radialEl = null;
  }

  /* --------------------------------- folhas --------------------------------- */

  private openSheet(html: string): HTMLElement {
    this.closeSheet();
    const bg = document.createElement('div');
    bg.className = 'bs-sheet-bg';
    bg.setAttribute('data-touch-ignore', '');
    bg.innerHTML = `<div class="bs-sheet">${html}</div>`;
    bg.addEventListener('click', (e) => {
      if (e.target === bg || (e.target as HTMLElement).closest('[data-close]')) this.closeSheet();
    });
    this.s.ui.appendChild(bg);
    this.sheet = bg;
    requestAnimationFrame(() => bg.classList.add('on'));
    return bg.querySelector('.bs-sheet')!;
  }
  private closeSheet(): void {
    this.sheet?.remove();
    this.sheet = null;
  }

  confirm(msg: string, yes: () => void): void {
    const s = this.openSheet(`<p class="bs-q">${esc(msg)}</p><div class="bs-row2"><button class="bs-btn bs-accent" data-y>${t('studio.yes', 'Sim')}</button><button class="bs-btn" data-close>${t('studio.no', 'Não')}</button></div>`);
    s.querySelector('[data-y]')!.addEventListener('click', () => {
      this.closeSheet();
      yes();
    });
  }

  /** paywall amigável das Ferramentas Pro (leva ao Clube/Passe que já existem) */
  paywall(f: ProFeature): void {
    const F: Record<ProFeature, string> = {
      logic: t('studio.pro.logic', 'Fichas de lógica (botões, portas, pontos…)'),
      joints: t('studio.pro.joints', 'Mais de {n} juntas e motores', { n: FREE.joints }),
      pen: t('studio.pro.pen', 'Caneta 3D — desenhe no ar'),
      maps: t('studio.pro.maps', 'Mais de {n} mapas salvos', { n: FREE.maps }),
      parts: t('studio.pro.parts', 'Muito mais peças por criação'),
      publish: t('studio.pro.publish', 'Publicar mais de {n} por dia', { n: FREE.publishPerDay }),
    };
    const order: ProFeature[] = [f, ...(['logic', 'pen', 'joints', 'maps', 'parts', 'publish'] as ProFeature[]).filter((x) => x !== f)];
    const s = this.openSheet(`<div class="bs-pw">
      <div class="bs-pwart">${sicon('pro', 40)}</div>
      <h3>${t('studio.pro.title', 'Ferramentas Pro')}</h3>
      <p>${t('studio.pro.sub', 'Vem com o Clube Bloop ou com qualquer Passe da temporada. As ferramentas básicas continuam grátis!')}</p>
      <ul>${order.map((x, i) => `<li class="${i === 0 ? 'hi' : ''}">${sicon('check', 16)}${F[x]}</li>`).join('')}</ul>
      <div class="bs-row2"><button class="bs-btn bs-accent" data-c="club">${t('studio.pro.club', 'Ver o Clube Bloop')}</button><button class="bs-btn" data-c="pass">${t('studio.pro.pass', 'Ver o Passe')}</button></div>
      <button class="bs-link" data-close>${t('studio.pro.later', 'Agora não')}</button></div>`);
    this.on(s, '[data-c]', (b) => {
      this.closeSheet();
      if (b.dataset.c === 'club') openClub();
      else openPass();
    });
  }

  dispose(): void {
    this.closeRadial();
    this.closeSheet();
    this.el.remove();
    this.pickBanner.remove();
  }
}

export type { LibEntry };
