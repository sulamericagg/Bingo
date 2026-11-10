/* ============================================================
 *  CASA 3D · ATIVIDADES — PREPARAR A FESTA
 *  Balões (flutuam!), bandeirinhas e luzinhas penduradas onde você mira,
 *  mesa posta (pratos limpos em cima de uma mesa), bolo (do forno),
 *  música. "Começar festa" chama o fluxo de festa existente (party.ts).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { sfx } from '../sfx';
import type { ActDef } from '../ui';
import { v3, type Ctx } from './core';
import type { Prop } from './props';
import { bump } from './store';
import { esc } from '../ui';

const BAL_COLS = ['#ff5c7a', '#ffc93d', '#3fa0ff', '#4fd67a', '#c46bff', '#ff7ad9'];

export class PartyPrep {
  hung: THREE.Object3D[] = [];
  open = false;
  started = false;
  private sig = '';
  constructor(readonly ctx: Ctx) {
    ctx.ui.onParty = () => {
      this.open = !this.open;
      sfx.click();
      this.render(true);
    };
  }
  checks(): { id: string; label: string; ok: boolean }[] {
    const props = this.ctx.props;
    const balloons = props.list.filter((p) => p.kind === 'balloon').length;
    const tables = this.ctx.items(['table', 'partytable', 'desk']);
    const onTable = props.list.filter((p) => {
      if ((p.kind !== 'plate' && p.kind !== 'bowl' && p.kind !== 'cup') || p.held || p.racked || p.dirty > 0.05) return false;
      return tables.some((tb) => {
        const l = tb.obj.worldToLocal(p.obj.position.clone());
        return Math.abs(l.x) < tb.dims.w / 2 + 0.05 && Math.abs(l.z) < tb.dims.d / 2 + 0.05 && l.y > tb.dims.h - 0.1 && l.y < tb.dims.h + 0.3;
      });
    }).length;
    const cake = props.list.some((p) => p.made === 'cake' || p.made === 'choccake' || p.dish?.recipe === 'cake' || p.dish?.recipe === 'choccake');
    return [
      { id: 'bal', label: t('act.party.balloons', 'Balões ({n}/3)', { n: Math.min(3, balloons) }), ok: balloons >= 3 },
      { id: 'deco', label: t('act.party.deco', 'Enfeite na parede'), ok: this.hung.length > 0 },
      { id: 'table', label: t('act.party.table', 'Mesa posta ({n}/3)', { n: Math.min(3, onTable) }), ok: onTable >= 3 },
      { id: 'cake', label: t('act.party.cake', 'Bolo pronto'), ok: cake },
      { id: 'music', label: t('act.party.music', 'Música tocando'), ok: this.ctx.music.on },
    ];
  }
  render(force = false): void {
    const box = this.ctx.ui.partyBox;
    if (!this.open || this.started || this.ctx.partyActive()) {
      box.style.display = 'none';
      return;
    }
    const cs = this.checks();
    const sig = cs.map((c) => c.label + c.ok).join('|');
    if (!force && sig === this.sig) return;
    this.sig = sig;
    const n = cs.filter((c) => c.ok).length;
    box.style.display = '';
    box.innerHTML = `<b>${esc(t('act.party.title', 'Preparar a festa'))} ${n}/5</b>` + cs.map((c) => `<div class="${c.ok ? 'ok' : 'no'}">${esc(c.label)}</div>`).join('');
    const row = document.createElement('div');
    row.className = 'row';
    const mk = (label: string, fn: () => void, cls = '') => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onpointerdown = (e) => e.stopPropagation();
      b.onclick = (e) => (e.stopPropagation(), fn());
      return b;
    };
    row.append(mk(t('act.party.addBalloons', '+ Balões'), () => this.balloons()), mk(t('act.party.addBanner', '+ Bandeirinhas'), () => this.deco('banner')), mk(t('act.party.addLights', '+ Luzinhas'), () => this.deco('lights')));
    box.appendChild(row);
    const go = mk(t('act.party.start', 'Começar festa!'), () => this.start(), 'go');
    go.disabled = n < 3;
    if (n < 3) go.title = t('act.party.need', 'Complete 3 itens da lista');
    box.appendChild(go);
  }
  balloons(): void {
    const ctx = this.ctx;
    const all = ctx.props.list.filter((p) => p.kind === 'balloon');
    // limite: os mais velhos estouram
    for (const old of all.slice(0, Math.max(0, all.length - 9))) {
      ctx.eng.burst(old.obj.position.x, old.obj.position.y, old.obj.position.z, 10, 'spark', '#ffffff', 1.5);
      ctx.props.remove(old);
      sfx.pop();
    }
    for (let i = 0; i < 3; i++) {
      const p = ctx.front(0.9 + i * 0.15, 0.1);
      p.x += (i - 1) * 0.3;
      ctx.props.spawn('balloon', { col: BAL_COLS[Math.floor(Math.random() * BAL_COLS.length)] }, p, v3(0, 0.5, 0));
    }
    sfx.boing();
    bump('fun', 3);
    this.render(true);
  }
  deco(kind: 'banner' | 'lights'): void {
    const ctx = this.ctx;
    const p = ctx.props.spawn('deco', { deco: kind }, ctx.front(0.6, 0));
    ctx.hand(p);
    ctx.ui.hint(t('act.hint.hang', 'Mire numa parede e toque PENDURAR'), 2200, 1);
  }
  /** botões quando segura um enfeite */
  heldActs(h: Prop): ActDef[] {
    const tg = this.ctx.fps.target;
    if (h.kind === 'deco' && tg.type === 'wall' && tg.dist < 3.2) return [{ id: 'pp-hang', label: t('act.btn.hang', 'PENDURAR'), icon: 'check', size: 'big' }];
    return [];
  }
  tap(id: string, h: Prop | null): boolean {
    if (id !== 'pp-hang' || !h || h.kind !== 'deco') return false;
    const ctx = this.ctx;
    const tg = ctx.fps.target;
    if (tg.type !== 'wall' || !tg.wall) return false;
    const n = tg.wall.normal;
    ctx.unhand();
    // vira decoração fixa (sem corpo)
    const obj = h.obj;
    if (h.body) ctx.eng.world.removeBody(h.body);
    h.body = null;
    const i = ctx.props.list.indexOf(h);
    if (i >= 0) ctx.props.list.splice(i, 1);
    const y = Math.max(1.75, Math.min(2.45, tg.point.y));
    obj.position.copy(tg.point).setY(y).addScaledVector(n, 0.03);
    obj.lookAt(obj.position.clone().add(n));
    this.hung.push(obj);
    if (this.hung.length > 8) {
      const old = this.hung.shift()!;
      ctx.eng.scene.remove(old);
    }
    ctx.eng.burst(obj.position.x, obj.position.y, obj.position.z, 14, 'spark', '#ffe27a', 1.4);
    sfx.sparkle();
    bump('fun', 3);
    this.render(true);
    return true;
  }
  private start(): void {
    const ctx = this.ctx;
    if (this.checks().filter((c) => c.ok).length < 3) return;
    this.started = true;
    this.open = false;
    this.render(true);
    if (!ctx.music.on) ctx.music.start();
    ctx.startParty();
    const got = ctx.coin(10);
    ctx.ui.showCard(t('act.party.started', 'A festa começou!'), 0, got ? t('act.dish.coins', '+{c} moedas', { c: got }) : '', 2600);
    bump('fun', 25);
    sfx.sparkle();
  }
  update(): void {
    if (this.open) this.render();
  }
  dispose(): void {
    for (const o of this.hung) this.ctx.eng.scene.remove(o);
    this.hung = [];
  }
}
