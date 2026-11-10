/* ============================================================
 *  CASA 3D · ATIVIDADES — controlador ("vida em casa" com física)
 *  Ganchos nos arquivos existentes (marcados [casa-ativ]):
 *   - index.ts: initActivities(...) depois de criar o Fps; update(dt)
 *     no laço; dispose() ao fechar.
 *   - fps.ts:   Fps.ext → buttons()/tap() deste módulo têm prioridade
 *     quando a ferramenta é a Mão; ext.busy evita a mão "abrir" por cima.
 *  Detalhes e lista de atividades: docs/CASA-ATIVIDADES.md
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { sfx } from '../sfx';
import type { Engine } from '../engine';
import type { Fps } from '../fps';
import type { Kind } from '../adapter';
import type { ActDef } from '../ui';
import type { Ctx, Spot } from './core';
import { BURNT, ING, ingName, madeName } from './data';
import { Dishes } from './dishes';
import { Kitchen } from './kitchen';
import { Chores } from './chores';
import { Extras } from './extras';
import { PartyPrep } from './partyprep';
import { disposeActModels } from './models';
import { Props, type Prop } from './props';
import { resetTaken } from './spots';
import { AS, bump, decayNeeds, flushAct, reward, saveAct } from './store';
import { ActUI } from './ui';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const EDIBLE_RAW = new Set(['tomate', 'cenoura', 'alface', 'banana', 'maca', 'morango', 'laranja', 'pao', 'queijo', 'milho', 'cebola', 'pimentao', 'chocolate']);

export interface ActOpts {
  eng: Engine;
  fps: Fps;
  hud: HTMLElement;
  /** "Começar festa": liga o fluxo de festa existente (party.ts) */
  startParty(): void;
  partyActive(): boolean;
}

type Aim = { kind: 'prop'; p: Prop; d: number } | { kind: 'spot'; s: Spot; d: number } | null;
type PoseReq = 'knife' | 'spoon' | 'sponge' | 'vacuum' | 'grab' | 'open';

export class Activities {
  readonly props: Props;
  readonly ui: ActUI;
  readonly ctx: Ctx;
  readonly dishes: Dishes;
  readonly kitchen: Kitchen;
  readonly chores: Chores;
  readonly extras: Extras;
  readonly party: PartyPrep;
  heldP: Prop | null = null;
  aim: Aim = null;
  private poseReq: PoseReq | null = null;
  private poseKeep = 0;
  private refreshT = 2.5;
  private needT = 0;
  private lowT = 30;
  private ray = new THREE.Raycaster();
  private visible = true;
  private disposed = false;

  constructor(readonly o: ActOpts) {
    const { eng, fps, hud } = o;
    resetTaken();
    this.props = new Props(eng);
    this.ui = new ActUI(hud);
    const self = this;
    this.ctx = {
      eng,
      fps,
      props: this.props,
      ui: this.ui,
      held: () => this.heldP,
      hand: (p) => this.hand(p),
      unhand: () => {
        const p = this.heldP;
        if (p) p.held = false;
        this.heldP = null;
        return p;
      },
      front: (dist = 0.6, up = 0) => {
        const cam = eng.camera;
        cam.getWorldDirection(V);
        V.y = 0;
        V.normalize();
        return cam.position.clone().addScaledVector(V, dist).add(V2.set(0, up, 0));
      },
      coin: (n) => reward(n),
      get music() {
        return self.extras.music;
      },
      pose: (p) => {
        this.poseReq = p;
        this.poseKeep = 0.15;
      },
      items: (k) => {
        const ks = (Array.isArray(k) ? k : [k]) as Kind[];
        return eng.items.filter((i) => ks.includes(i.kind));
      },
      startParty: () => o.startParty(),
      partyActive: () => o.partyActive(),
    };
    this.dishes = new Dishes(this.ctx);
    this.kitchen = new Kitchen(this.ctx, this.dishes);
    this.chores = new Chores(this.ctx);
    this.extras = new Extras(this.ctx);
    this.party = new PartyPrep(this.ctx);
    this.ui.onBook = () => {
      sfx.click();
      this.ui.openBook();
    };
    decayNeeds();
    this.ui.setNeeds();
    setTimeout(() => !this.disposed && this.ui.hint(t('act.hint.welcome', 'Dica: abra a geladeira e cozinhe do SEU jeito!'), 3200), 1500);
  }

  /* ---------------- gancho do Fps ---------------- */
  /** a mão está ocupada por este módulo (o Fps não troca a pose) */
  get busy(): boolean {
    return !!this.heldP || this.poseKeep > 0;
  }
  private spots(): Spot[] {
    return [...this.kitchen.spots, ...this.chores.spots, ...this.extras.spots];
  }
  private computeAim(): void {
    const fps = this.o.fps;
    const cam = this.o.eng.camera;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    const ray = this.ray.ray;
    let best: Aim = null;
    for (const p of this.props.list) {
      if (p.held || p.hidden || p.racked) continue;
      V.copy(p.obj.position).sub(ray.origin);
      const tt = V.dot(ray.direction);
      if (tt < 0.15 || tt > 2.6) continue;
      const perp = V.addScaledVector(ray.direction, -tt).length();
      if (perp > p.r + 0.06 + tt * 0.015) continue;
      if (!best || tt < best.d) best = { kind: 'prop', p, d: tt };
    }
    // pratos no escorredor: mira a pia
    let bs: Aim = null;
    for (const s of this.spots()) {
      const d = s.hit(ray, fps.target);
      if (d !== null && (!bs || d < bs.d)) bs = { kind: 'spot', s, d };
    }
    if (bs && (!best || bs.d + 0.15 < best.d)) best = bs;
    // algo do Fps (parede, móvel leve) bem mais perto ganha
    if (best && fps.target.type !== 'none' && fps.target.dist + 0.25 < best.d && !(best.kind === 'spot' && fps.target.item)) best = null;
    this.aim = best;
  }
  private placeTarget(h: Prop): { at: THREE.Vector3; label: string; spot?: Spot } | null {
    const a = this.aim;
    if (!a) return null;
    if (a.kind === 'prop') {
      const p = a.p;
      if ((p.kind === 'plate' || p.kind === 'bowl') && !p.dish && this.props.isFood(h)) return { at: p.obj.position.clone().add(V.set(0, 0.12, 0)), label: t('act.btn.onPlate', 'NO PRATO') };
      return null;
    }
    const at = a.s.place?.(h);
    return at ? { at, label: a.s.placeLabel?.(h) ?? t('home3d.act.place', 'COLOCAR'), spot: a.s } : null;
  }
  buttons(): ActDef[] | null {
    const fps = this.o.fps;
    if (fps.tool !== 'hand' || fps.held || !this.visible) return null;
    const h = this.heldP;
    if (h) {
      const L: ActDef[] = [];
      const pl = this.placeTarget(h);
      if (pl) L.push({ id: 'a-place', label: pl.label, icon: 'check', size: 'big' });
      if (h.kind === 'ext') L.push({ id: 'a-spray', label: t('act.btn.spray', 'BORRIFAR'), icon: 'clean', size: 'big', hold: true });
      if (h.kind === 'bag') L.push({ id: 'a-out', label: t('act.btn.takeOut', 'LEVAR PRA FORA'), icon: 'exit', size: 'big' });
      L.push(...this.party.heldActs(h), ...this.dishes.heldActs(h));
      if (h.kind === 'ing' && (EDIBLE_RAW.has(h.ing) || h.cook >= 0.45)) L.push({ id: 'a-bite', label: t('act.btn.bite', 'MORDER'), icon: 'eat', size: 'small' });
      if (h.kind === 'made') L.push({ id: 'a-bite', label: t('act.btn.eat', 'COMER'), icon: 'eat', size: 'small' });
      L.push({ id: 'a-throw', label: t('home3d.act.throw', 'JOGAR'), icon: 'throw', size: 'big' });
      L.push({ id: 'a-drop', label: t('home3d.act.drop', 'SOLTAR'), icon: 'drop', size: 'small' });
      return norm(L);
    }
    const a = this.aim;
    if (!a) return null;
    if (a.kind === 'prop') {
      const p = a.p;
      const L: ActDef[] = [...this.dishes.aimActs(p), ...this.kitchen.aimActs(p)];
      if (!L.some((x) => x.id === 'p-pick')) L.push({ id: 'p-pick', label: t('home3d.act.pick', 'PEGAR'), icon: 'grab', size: 'big' });
      return norm(L);
    }
    const L = a.s.acts(null);
    return L.length ? norm(L) : null;
  }
  tap(id: string): boolean {
    if (!id.includes('-')) return false;
    const h = this.heldP;
    const a = this.aim;
    switch (id) {
      case 'a-place':
        if (h) this.placeHeld(h);
        return true;
      case 'a-throw':
        this.throwHeld();
        return true;
      case 'a-drop':
        this.dropHeld();
        return true;
      case 'a-out':
        if (h?.kind === 'bag') {
          this.heldP = null;
          this.props.remove(h, true);
          sfx.poof();
          const got = reward(3);
          bump('hyg', 5);
          this.ui.hint(t('act.hint.trashOut', 'Lixo lá fora! Casa cheirosa') + (got ? ' +' + got : ''), 1800);
        }
        return true;
      case 'a-bite':
        if (h) {
          this.o.fps.hand.play('eat');
          sfx.eat();
          bump('food', h.kind === 'made' ? 12 : 5);
          const yuck = h.cook >= BURNT || h.ing === 'cebola';
          this.ui.hint(yuck ? t('act.hint.yuck', 'Que careta!') : t('act.hint.crunch', 'Nhac!'), 1000);
          this.heldP = null;
          this.props.remove(h);
        }
        return true;
      case 'p-pick':
        if (a?.kind === 'prop') this.hand(a.p);
        return true;
    }
    if (id.startsWith('d-')) return this.dishes.tap(id, h ?? (a?.kind === 'prop' ? a.p : null));
    if (id.startsWith('pp-')) return this.party.tap(id, h);
    if (a?.kind === 'prop' && this.kitchen.aimTap(id, a.p)) return true;
    if (a?.kind === 'spot' && a.s.tap) return a.s.tap(id, h);
    return false;
  }

  /* ---------------- mão ---------------- */
  hand(p: Prop): void {
    if (this.heldP && this.heldP !== p) this.dropHeld();
    this.props.grab(p);
    this.heldP = p;
    this.o.fps.hand.play('grab');
    sfx.pick();
  }
  private holdPos(p: Prop, out: THREE.Vector3): THREE.Vector3 {
    const cam = this.o.eng.camera;
    switch (p.kind) {
      case 'plate':
      case 'bowl':
        out.set(0.04, -0.2, -0.5);
        break;
      case 'ext':
        out.set(0.2, -0.24, -0.45);
        break;
      case 'bag':
        out.set(0.2, -0.28, -0.55);
        break;
      case 'balloon':
        out.set(0.18, 0.02, -0.65);
        break;
      case 'deco':
        out.set(0, -0.05, -0.75);
        break;
      case 'cloth':
        out.set(0.12, -0.18, -0.45);
        break;
      default:
        out.set(0.16, -0.14, -0.42);
    }
    return out.applyQuaternion(cam.quaternion).add(cam.position);
  }
  private updateHeld(dt: number): void {
    const p = this.heldP;
    if (!p) return;
    if (!this.props.list.includes(p)) {
      this.heldP = null;
      return;
    }
    const cam = this.o.eng.camera;
    this.holdPos(p, V);
    p.obj.position.lerp(V, Math.min(1, dt * 22));
    if (p.kind === 'plate' || p.kind === 'bowl' || p.kind === 'cup' || p.kind === 'ext' || p.kind === 'bag' || p.kind === 'cloth') {
      Q.setFromAxisAngle(UP, this.o.fps.yaw);
      p.obj.quaternion.slerp(Q, Math.min(1, dt * 14));
    } else p.obj.quaternion.slerp(cam.quaternion, Math.min(1, dt * 14));
    if (p.body) {
      p.body.position.set(p.obj.position.x, p.obj.position.y, p.obj.position.z);
      p.body.quaternion.set(p.obj.quaternion.x, p.obj.quaternion.y, p.obj.quaternion.z, p.obj.quaternion.w);
    }
  }
  private throwHeld(): void {
    const p = this.heldP;
    if (!p) return;
    this.heldP = null;
    const fps = this.o.fps;
    const cam = this.o.eng.camera;
    cam.getWorldDirection(V);
    const s = p.kind === 'balloon' ? 3 : p.kind === 'bag' || p.kind === 'ext' ? 5 : 7.5;
    const vel = V.multiplyScalar(s).add(V2.set(fps.body.velocity.x, 2.2, fps.body.velocity.z));
    this.props.release(p, vel, 10);
    fps.hand.play('throw');
    sfx.throw();
    bump('fun', 0.5);
  }
  private dropHeld(): void {
    const p = this.heldP;
    if (!p) return;
    this.heldP = null;
    this.props.release(p, V.set(0, -0.3, 0), 1);
    this.o.fps.hand.play('grab');
    sfx.drop();
  }
  private placeHeld(h: Prop): void {
    const pl = this.placeTarget(h);
    if (!pl) return this.dropHeld();
    const sid = pl.spot?.id;
    if (sid === 'wardrobe') {
      if (this.chores.putAway(h)) this.heldP = null;
      return;
    }
    if (sid === 'fridge' || sid === 'stove') {
      this.heldP = null;
      h.held = false;
      if (this.kitchen.placed(sid, h, pl.at)) return;
    }
    this.heldP = null;
    h.obj.position.copy(pl.at);
    this.props.release(h, V.set(0, -0.4, 0), 0.5);
    this.o.fps.hand.play('grab');
    sfx.drop();
  }

  /* ---------------- laço ---------------- */
  update(dt: number, active: boolean): void {
    const fps = this.o.fps;
    if (active !== this.visible) {
      this.visible = active;
      this.ui.setVisible(active);
      if (!active) this.dropHeld();
    }
    this.props.update(dt);
    this.kitchen.update(dt);
    this.chores.update(dt);
    this.extras.update(dt);
    this.party.update();
    this.ui.update(dt);
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 2.5;
      this.kitchen.refresh();
      this.chores.refresh();
      this.extras.refresh();
    }
    this.needT -= dt;
    if (this.needT <= 0) {
      this.needT = 5;
      decayNeeds();
      this.ui.setNeeds();
      saveAct();
      this.lowT -= 5;
      if (this.lowT <= 0) {
        this.lowT = 75;
        const n = AS.needs;
        if (n.food < 25) this.ui.hint(t('act.need.hungry', 'Barriga roncando... que tal cozinhar algo?'), 2600);
        else if (n.hyg < 25) this.ui.hint(t('act.need.dirty', 'Hora de um banho!'), 2600);
        else if (n.energy < 20) this.ui.hint(t('act.need.tired', 'Bocejo... uma soneca na cama?'), 2600);
        else if (n.fun < 25) this.ui.hint(t('act.need.bored', 'Tédio! Liga a TV ou joga umas coisas por aí'), 2600);
      }
    }
    this.handleImpacts();
    if (!active) return;
    this.computeAim();
    this.updateHeld(dt);
    // botões de segurar
    const helds = fps.acts.held;
    if (helds.size) {
      for (const id of helds) {
        if (!id.includes('-')) continue;
        if (id === 'a-spray') {
          if (this.heldP?.kind === 'ext') this.kitchen.spray(dt);
          continue;
        }
        const a = this.aim;
        if (a?.kind === 'spot') a.s.hold?.(id, dt, this.heldP);
        else if (a?.kind === 'prop') this.kitchen.aimHold(id, dt);
      }
    }
    // pose da mão
    this.poseKeep -= dt;
    if (this.poseKeep > 0 && this.poseReq) fps.hand.setPose(this.poseReq);
    else if (this.heldP) fps.hand.setPose('grab');
    else if (this.poseKeep <= 0 && this.poseReq) {
      this.poseReq = null;
      fps.hand.setPose('open');
    }
    // rótulo do alvo
    if (fps.tool === 'hand' && !fps.held) {
      const lbl = this.label();
      if (lbl) fps.onLabel?.(lbl);
    }
  }
  private label(): string {
    const a = this.aim;
    if (!a) return '';
    if (a.kind === 'spot') return a.s.label();
    const p = a.p;
    if (this.dishes.isDish(p)) return this.dishes.label(p);
    if (p.kind === 'ext') return t('act.lbl.ext', 'Extintor');
    if (p.kind === 'bag') return t('act.lbl.bag', 'Saco de lixo');
    if (p.kind === 'balloon') return t('act.lbl.balloon', 'Balão');
    if (p.kind === 'deco') return p.deco === 'lights' ? t('act.lbl.lights', 'Luzinhas') : t('act.lbl.banner', 'Bandeirinhas');
    if (p.kind === 'cloth') return p.cloth?.clean ? t('act.lbl.clean', 'Roupa limpa') : t('act.lbl.dirtyCloth', 'Roupa suja');
    const name = p.made ? madeName(p.made) : ingName(p.ing);
    const st = p.cook >= BURNT ? t('act.st.burnt', 'queimado') : p.cook >= 1 ? t('act.st.done', 'no ponto') : p.cook >= 0.45 ? t('act.st.cooking', 'cozinhando') : p.made ? '' : t('act.st.raw', 'cru');
    const cut = p.cut >= 2 ? t('act.st.minced', 'picadinho') : p.cut === 1 ? t('act.st.sliced', 'fatiado') : '';
    return [name, cut, st].filter(Boolean).join(' · ') + (p.garden ? ' ✿' : '');
  }
  private handleImpacts(): void {
    const props = this.props;
    for (const im of props.impacts) {
      const p = im.p;
      if (!props.list.includes(p) || p.held || p.hidden) continue;
      if (p.kind === 'ing') {
        const d = ING.get(p.ing);
        if (im.hard && im.v > 4.5 && d?.squishy && p.cut === 0) {
          props.splat(d.splat, im.point, im.normal, 26);
          this.o.eng.burst(im.point.x, im.point.y + 0.05, im.point.z, 10, 'chunk', d.flesh, 2);
          props.remove(p);
          sfx.splat();
          this.ui.hint(t('act.hint.splat', 'SPLAT!'), 700);
          bump('fun', 1);
          continue;
        }
        if (im.hard && im.v > 7.5 && d) {
          props.splat(d.splat, im.point, im.normal, 18);
          sfx.splat();
          continue;
        }
        props.thud(im.v);
      } else if (p.dish && im.v > 5.5) this.dishes.spill(p);
      else if (p.kind === 'balloon' && im.v > 7) {
        this.o.eng.burst(p.obj.position.x, p.obj.position.y, p.obj.position.z, 14, 'spark', '#ffffff', 1.8);
        props.remove(p);
        sfx.pop();
      } else props.thud(im.v);
    }
    props.impacts.length = 0;
  }
  /* ---------------- testes / depuração ---------------- */
  debugApi(): Record<string, unknown> {
    return {
      act: this,
      spawn: (ing: string, toHand = true) => {
        const p = this.props.spawn('ing', { ing }, this.ctx.front(0.5, -0.1));
        if (toHand) this.hand(p);
        return p;
      },
      state: () => ({ props: this.props.list.length, held: this.heldP?.ing || this.heldP?.kind || null, aim: this.aim?.kind === 'spot' ? this.aim.s.id : this.aim?.kind === 'prop' ? this.aim.p.kind + ':' + (this.aim.p.ing || this.aim.p.made) : null, book: Object.keys(AS.book), needs: AS.needs }),
    };
  }
  dispose(): void {
    this.disposed = true;
    flushAct();
    this.party.dispose();
    this.extras.dispose();
    this.chores.dispose();
    this.kitchen.dispose();
    this.dishes.dispose();
    this.props.dispose();
    this.ui.dispose();
    disposeActModels();
  }
}
/** só um botão grande (o primeiro) */
function norm(L: ActDef[]): ActDef[] {
  let big = false;
  const out = L.map((a) => {
    if (a.size === 'big') {
      if (big) return { ...a, size: undefined };
      big = true;
    }
    return a;
  });
  if (!big && out.length) out[0] = { ...out[0], size: 'big' };
  // o grande primeiro (fica embaixo, perto do polegar)
  return out.sort((a, b) => (b.size === 'big' ? 1 : 0) - (a.size === 'big' ? 1 : 0));
}

export function initActivities(o: ActOpts): Activities {
  const a = new Activities(o);
  (o.fps as unknown as { ext: unknown }).ext = a;
  return a;
}
