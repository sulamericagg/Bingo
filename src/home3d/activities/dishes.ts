/* ============================================================
 *  CASA 3D · ATIVIDADES — pratos: o que estiver em cima do prato vira
 *  um prato com nome (receita reconhecida ou nome engraçado), estrelas,
 *  moedas, livro de receitas; comer (fome) ou guardar pro bichinho.
 *  Depois de comer, a louça fica suja (vai pra pia).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { sfx } from '../sfx';
import type { ActDef } from '../ui';
import type { Ctx } from './core';
import { ING, judge, madeColor, petFoodFor, type Bit } from './data';
import type { Prop } from './props';
import { AS, bump, giveToPet, saveAct } from './store';

const C = new THREE.Color();
const C2 = new THREE.Color();

export class Dishes {
  /** partes de comida grudadas nos pratos (por uid do prato) */
  private parts = new Map<number, Prop[]>();
  constructor(readonly ctx: Ctx) {}

  isDish(p: Prop): boolean {
    return p.kind === 'plate' || p.kind === 'bowl' || p.kind === 'cup';
  }
  /** comidas soltas apoiadas em cima do prato */
  foodsOn(plate: Prop): Prop[] {
    const c = plate.obj.position;
    return this.ctx.props.list.filter((p) => {
      if (!this.ctx.props.isFood(p) || p.held || p.hidden) return false;
      const o = p.obj.position;
      const dy = o.y - c.y;
      return dy > -0.02 && dy < 0.3 && Math.hypot(o.x - c.x, o.z - c.z) < (plate.kind === 'plate' ? 0.15 : 0.1);
    });
  }
  /** liquid color = média dos miolos */
  mixColor(bits: Bit[], base = '#bfe6ff', k = 0.25): THREE.Color {
    C.setRGB(0, 0, 0);
    let n = 0;
    for (const b of bits) {
      C2.set(b.made ? madeColor(b.made) : (ING.get(b.ing)?.flesh ?? '#ffffff'));
      if (b.ing === 'laranja' || b.ing === 'morango' || b.ing === 'tomate' || b.ing === 'cenoura' || b.ing === 'chocolate') C2.set(ING.get(b.ing)!.skin);
      C.r += C2.r;
      C.g += C2.g;
      C.b += C2.b;
      n++;
    }
    if (!n) return C.set(base);
    C.multiplyScalar(1 / n);
    C.lerp(C2.set(base), k);
    return C;
  }
  /** prato embaixo de uma comida solta */
  plateUnder(f: Prop): Prop | null {
    if (!this.ctx.props.isFood(f)) return null;
    return this.ctx.props.list.find((p) => p.kind === 'plate' && !p.dish && !p.held && this.foodsOn(p).includes(f)) ?? null;
  }
  serve(plate: Prop): boolean {
    if (plate.kind !== 'plate' || plate.dish) return false;
    const foods = this.foodsOn(plate);
    if (!foods.length) return false;
    const bits = foods.map((f) => this.ctx.props.bit(f));
    // gruda a comida no prato (vira um objeto só, dá pra carregar)
    for (const f of foods) {
      if (f.body) this.ctx.eng.world.removeBody(f.body);
      f.body = null;
      const i = this.ctx.props.list.indexOf(f);
      if (i >= 0) this.ctx.props.list.splice(i, 1);
      plate.obj.attach(f.obj);
    }
    this.parts.set(plate.uid, foods);
    this.finish(plate, bits);
    return true;
  }
  /** tigela/copo já nascem prontos (sopa, suco) */
  fill(c: Prop, bits: Bit[]): void {
    if (c.liquid) {
      const col = this.mixColor(bits, c.kind === 'cup' ? '#ffffff' : '#c9a36a', c.kind === 'cup' ? 0.1 : 0.3);
      (c.liquid.material as THREE.MeshLambertMaterial).color.copy(col);
      c.liquid.visible = true;
    }
    this.finish(c, bits);
  }
  private finish(c: Prop, bits: Bit[]): void {
    const res = judge(bits);
    c.dish = { name: res.name, recipe: res.recipe?.id ?? null, stars: res.stars, bits };
    AS.dishes++;
    let sub: string;
    if (res.recipe) {
      const prev = AS.book[res.recipe.id];
      const first = !prev;
      AS.book[res.recipe.id] = { stars: Math.max(prev?.stars ?? 0, res.stars), n: (prev?.n ?? 0) + 1 };
      const got = this.ctx.coin((first ? 15 : 0) + res.stars * 2);
      sub = first ? t('act.dish.new', 'Receita nova no livro! +{c} moedas', { c: got }) : got ? t('act.dish.coins', '+{c} moedas', { c: got }) : t('act.dish.capped', 'Moedas da casa de hoje: completo');
      if (first) sfx.sparkle();
      else sfx.swish();
    } else {
      AS.funny++;
      const got = this.ctx.coin(res.stars);
      sub = t('act.dish.funny', 'Invenção maluca!') + (got ? ' +' + got : '');
      sfx.boing();
    }
    saveAct();
    bump('fun', 4);
    this.ctx.ui.showCard(res.name, res.stars, sub);
    const p = c.obj.position;
    this.ctx.eng.burst(p.x, p.y + 0.15, p.z, 14, 'spark', '#ffe27a', 1.6);
  }
  private clear(c: Prop): void {
    for (const f of this.parts.get(c.uid) ?? []) {
      c.obj.remove(f.obj);
      if (f.tint) f.tint.dispose();
    }
    this.parts.delete(c.uid);
    c.dish = null;
    if (c.liquid) c.liquid.visible = false;
    this.ctx.props.setDirty(c, 1);
  }
  eat(c: Prop): void {
    const d = c.dish;
    if (!d) return;
    const fps = this.ctx.fps;
    fps.hand.play('eat');
    sfx.eat();
    const p = c.obj.position;
    this.ctx.eng.burst(p.x, p.y + 0.08, p.z, 10, 'chunk', '#c89a6a', 1.2);
    bump('food', 12 + d.stars * 5);
    bump('fun', 3);
    const burnt = d.bits.some((b) => b.cook >= 1.6);
    this.ctx.ui.hint(burnt ? t('act.eat.burnt', 'Crocante... crocante DEMAIS!') : d.stars >= 4 ? t('act.eat.yum', 'Delícia!! Que chef!') : d.stars <= 1 ? t('act.eat.weird', 'Hmm... interessante.') : t('act.eat.ok', 'Hummm, bom!'), 1800);
    this.clear(c);
  }
  toPet(c: Prop): void {
    const d = c.dish;
    if (!d) return;
    const food = petFoodFor(d.bits, d.recipe);
    if (!giveToPet(food)) {
      this.ctx.ui.hint(t('act.pet.full', 'A despensa do bichinho já recebeu muito hoje'), 2000);
      return;
    }
    sfx.catch();
    this.ctx.ui.hint(t('act.pet.saved', 'Guardado na despensa do bichinho!'), 2000);
    this.clear(c);
  }
  /** botões quando mira um prato (não segurando nada) */
  aimActs(p: Prop): ActDef[] {
    const L: ActDef[] = [];
    if (this.plateUnder(p)) L.push({ id: 'd-serve', label: t('act.btn.serve', 'SERVIR'), icon: 'check', size: 'big' });
    if (p.dish) {
      L.push({ id: 'd-eat', label: t('act.btn.eat', 'COMER'), icon: 'eat', size: 'big' });
      L.push({ id: 'p-pick', label: t('home3d.act.pick', 'PEGAR'), icon: 'grab' });
      L.push({ id: 'd-pet', label: t('act.btn.pet', 'PRO BICHINHO'), icon: 'cake', size: 'small' });
    } else if (p.kind === 'plate' && this.foodsOn(p).length) {
      L.push({ id: 'd-serve', label: t('act.btn.serve', 'SERVIR'), icon: 'check', size: 'big' });
      L.push({ id: 'p-pick', label: t('home3d.act.pick', 'PEGAR'), icon: 'grab' });
    }
    return L;
  }
  heldActs(p: Prop): ActDef[] {
    if (!p.dish) return [];
    return [
      { id: 'd-eat', label: t('act.btn.eat', 'COMER'), icon: 'eat' },
      { id: 'd-pet', label: t('act.btn.pet', 'PRO BICHINHO'), icon: 'cake', size: 'small' },
    ];
  }
  tap(id: string, p: Prop | null): boolean {
    if (!p) return false;
    if (id === 'd-eat') return this.eat(p), true;
    if (id === 'd-pet') return this.toPet(p), true;
    if (id === 'd-serve') return this.serve(p.kind === 'plate' ? p : (this.plateUnder(p) ?? p)), true;
    return false;
  }
  label(p: Prop): string {
    if (p.dish) return p.dish.name + '  ' + '★'.repeat(p.dish.stars);
    const n = p.kind === 'plate' ? t('act.lbl.plate', 'Prato') : p.kind === 'bowl' ? t('act.lbl.bowl', 'Tigela') : t('act.lbl.cup', 'Copo');
    if (p.dirty > 0.02) return n + ' · ' + t('act.lbl.dirty', 'sujo');
    const k = p.kind === 'plate' ? this.foodsOn(p).length : 0;
    return k ? n + ' · ' + t('act.lbl.items', '{n} coisas', { n: k }) : n;
  }
  /** pratos que este prato tinha (quebrou ao bater forte com comida): espalha */
  spill(c: Prop): void {
    if (!c.dish) return;
    const p = c.obj.position.clone();
    const kind = c.kind === 'cup' ? 'juice' : c.kind === 'bowl' ? 'juice' : (ING.get(c.dish.bits[0]?.ing)?.splat ?? 'crumbs');
    this.ctx.props.splat(kind, p.setY(0.01), new THREE.Vector3(0, 1, 0), 30);
    this.ctx.ui.hint(t('act.dish.spill', 'Splash! Lá se foi o {n}...', { n: c.dish.name }), 1800);
    this.clear(c);
  }
  dispose(): void {
    this.parts.clear();
  }
}
