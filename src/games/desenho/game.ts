/* ============================================================
 *  DESENHA E VIRA! — jogo (chunk sob demanda).
 *  Menu (sobre o ateliê 3D) → Ateliê (caixa de areia) | Desafios (20 fases) | Galeria.
 *  Tutorial guiado na 1ª vez: desenhar → escolher material → BUM! → brincar.
 * ============================================================ */
import * as THREE from 'three';
import { addCoins } from '../../core/economy';
import { success, tap } from '../../core/haptics';
import { sfx, disposeSfx } from '../../3d/common/sfx';
import { reportRun, type MiniGameHandle } from '../../hub/registry';
import { fmt, t } from '../../i18n';
import { clearNotify, notify, objective, resetNotifyTop, setNotifyTop } from '../../ui/notify';
import { ATELIER_MAP, Atelier } from './atelier';
import { Challenge, type ChallengeResult } from './challenge';
import { bumBurst, bumSound, cook, flash, liftPaper } from './cook';
import { DrawUI, matName } from './drawui';
import { Engine } from './engine';
import { dvIcon } from './icons';
import { LEVELS, levelIcon } from './levels';
import { renderThumb } from './paper';
import { addToGallery, dvSave, persistDv, totalStars } from './save';
import { cloneDrawing, emptyDrawing, parseShareCode, type Drawing, type Material } from './strokes';
import { injectDvCss } from './style';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export async function launch(root: HTMLElement, exit: () => void): Promise<MiniGameHandle> {
  injectDvCss();
  return new DesenhoGame(root, exit);
}

/** desenhos de exemplo (vitrine do menu na 1ª vez) */
function demoDrawings(): { d: Drawing; mat: Material; at: [number, number, number] }[] {
  const star = emptyDrawing();
  const pts: number[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? 80 : 190;
    pts.push(256 + Math.cos(a) * r, 266 + Math.sin(a) * r, 200);
  }
  star.strokes.push({ t: 'pen', c: 2, s: 2, m: false, p: pts }, { t: 'fill', c: 3, s: 0, m: false, p: [256, 266, 0] });
  const vase = emptyDrawing();
  vase.strokes.push({ t: 'pen', c: 6, s: 2, m: true, p: [256, 440, 200, 330, 430, 200, 380, 360, 200, 370, 260, 200, 320, 200, 200, 310, 140, 200, 340, 90, 200] });
  vase.strokes.push({ t: 'pen', c: 9, s: 2, m: false, p: [180, 300, 200, 220, 290, 200, 256, 300, 200, 290, 290, 200, 330, 300, 200] });
  const spring = emptyDrawing();
  const sp: number[] = [];
  for (let i = 0; i < 120; i++) {
    const a = i * 0.18;
    const r = 30 + i * 1.4;
    sp.push(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 180);
  }
  spring.strokes.push({ t: 'pen', c: 8, s: 2, m: false, p: sp });
  return [
    { d: star, mat: 'inflate', at: [-1.2, 1.2, -1.2] },
    { d: vase, mat: 'lathe', at: [1.0, 1.0, -0.8] },
    { d: spring, mat: 'tube', at: [0.1, 1.6, -2.2] },
  ];
}

class DesenhoGame implements MiniGameHandle {
  private el: HTMLDivElement;
  private eng: Engine;
  private layer: HTMLDivElement;
  private atelier: Atelier | null = null;
  private chal: Challenge | null = null;
  private drawUI: DrawUI | null = null;
  private ov: HTMLDivElement | null = null;
  private sv = dvSave();
  private tut = 0;
  private dead = false;
  private busy = false;

  constructor(
    root: HTMLElement,
    private exit: () => void,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'dv-root';
    root.appendChild(this.el);
    this.eng = new Engine(this.el);
    this.layer = document.createElement('div');
    this.layer.className = 'dv-layer';
    this.el.appendChild(this.layer);
    setNotifyTop(64);
    this.tut = this.sv.tut;
    this.menu();
    (window as unknown as { __dv?: unknown }).__dv = this;
  }

  /* ----------------------------- ateliê (também fundo do menu) ----------------------------- */
  private ensureAtelier(): Atelier {
    if (this.atelier) return this.atelier;
    this.chal = null;
    this.layer.innerHTML = '';
    const a = new Atelier(this.eng, this.layer);
    this.atelier = a;
    this.eng.setStage(a);
    a.onExit = () => this.menu();
    a.onDraw = () => this.openDraw();
    a.onGallery = () => this.gallery();
    a.onGrab = () => this.tutStep(4);
    if (!a.creations.length) {
      for (const demo of demoDrawings()) {
        const r = cook(demo.d, demo.mat, { tier: this.eng.q.tier, map: ATELIER_MAP });
        if (r) a.spawnBuilt({ d: demo.d, mat: demo.mat, vehicle: false, fly: false }, r.built, { at: new THREE.Vector3(...demo.at), instant: true });
      }
    }
    return a;
  }

  private closeOv(): void {
    this.ov?.remove();
    this.ov = null;
  }
  private overlay(cls: string, html: string): HTMLDivElement {
    this.closeOv();
    const o = document.createElement('div');
    o.className = 'dv-ov ' + cls;
    o.setAttribute('data-touch-ignore', '');
    o.innerHTML = html;
    this.el.appendChild(o);
    this.ov = o;
    o.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) {
        tap('light');
        sfx.click();
      }
    });
    return o;
  }

  menu(): void {
    this.closeDraw();
    if (this.chal) {
      this.eng.setStage(null);
      this.chal = null;
      this.atelier = null;
    }
    const a = this.ensureAtelier();
    a.setMenuMode(true);
    objective(null);
    const stars = totalStars();
    const o = this.overlay(
      'dv-menu',
      `<button class="dv-btn dv-ic dv-m-exit" aria-label="${t('dv.back', 'Voltar')}">${dvIcon('back', 24)}</button>
      <div class="dv-logo"><span>${t('dv.logo1', 'Desenha')}</span><span class="dv-logo-e">${t('dv.logo2', 'e Vira!')}</span></div>
      <div class="dv-tag">${t('dv.tagline2', 'Seu desenho vira um objeto 3D de verdade!')}</div>
      <div class="dv-mbtns">
        <button class="dv-mode dv-m1" data-go="atelier"><i>${dvIcon('draw', 34)}</i><b>${t('dv.atelier', 'Ateliê')}</b><small>${t('dv.atelier.d', 'Desenhe, faça BUM! e brinque')}</small></button>
        <button class="dv-mode dv-m2" data-go="chal"><i>${dvIcon('flag', 34)}</i><b>${t('dv.chal', 'Desafios')}</b><small>${dvIcon('star', 14)} ${fmt(stars)}/${LEVELS.length * 3}</small></button>
        <button class="dv-mode dv-m3" data-go="gal"><i>${dvIcon('gallery', 34)}</i><b>${t('dv.gallery', 'Galeria')}</b><small>${t('dv.gallery.d', '{n} criações', { n: this.sv.gallery.length })}</small></button>
      </div>`,
    );
    o.querySelector('.dv-m-exit')!.addEventListener('click', () => this.exit());
    o.querySelectorAll<HTMLButtonElement>('[data-go]').forEach((b) =>
      b.addEventListener('click', () => {
        const g = b.dataset.go;
        if (g === 'atelier') this.enterAtelier();
        else if (g === 'chal') this.levelSelect();
        else this.gallery();
      }),
    );
  }

  private enterAtelier(): void {
    this.closeOv();
    const a = this.ensureAtelier();
    a.setMenuMode(false);
    if (this.tut < 4) {
      this.tut = 0;
      setTimeout(() => this.openDraw(), 250);
    } else notify(t('dv.hint.atelier', 'Toque em Desenhar para criar algo novo!'), { icon: 'pencil' });
  }

  /* ----------------------------- folha de desenho (ateliê) ----------------------------- */
  private openDraw(load?: Drawing): void {
    const a = this.ensureAtelier();
    if (this.drawUI) {
      this.drawUI.show(true);
    } else {
      const ui = new DrawUI(this.layer, { mode: 'sheet', w: 512, h: 512, k: Math.min(2, Math.max(1.25, window.devicePixelRatio || 1)), tier: this.eng.q.tier });
      ui.onBum = () => void this.atelierBum();
      ui.onClose = () => this.closeDraw();
      ui.onChange = () => {
        if (this.tut === 0 && !ui.paper.empty) this.tutStep(1);
      };
      this.drawUI = ui;
      const mo = ui.el.querySelector('.dv-mats')!;
      mo.addEventListener('click', () => this.tut === 1 && this.tutStep(2));
    }
    if (load) this.drawUI.paper.load(load);
    a.setDrawing(true);
    objective(null);
    if (this.tut < 3) this.tutStep(this.tut);
    else {
      this.drawUI.point(null);
      this.drawUI.tip(null);
    }
  }
  private closeDraw(): void {
    if (!this.drawUI) return;
    this.drawUI.show(false);
    this.drawUI.point(null);
    this.atelier?.setDrawing(false);
    if (this.tut === 3 && this.sv.tut < 4) objective(t('dv.tut.3', 'Mire na criação e toque Pegar'), { icon: 'hand-tap' });
    else objective(null);
  }

  private tutStep(n: number): void {
    if (this.sv.tut >= 4) return;
    const ui = this.drawUI;
    this.tut = n;
    if (n === 0) {
      ui?.tip(t('dv.tut.0', 'Desenhe qualquer coisa com o dedo!'));
      ui?.point('paper');
    } else if (n === 1) {
      ui?.tip(t('dv.tut.1', 'Escolha o material (ou deixe no automático)'));
      ui?.point('mat');
      setTimeout(() => this.tut === 1 && this.tutStep(2), 3200);
    } else if (n === 2) {
      ui?.tip(t('dv.tut.2', 'Agora aperte BUM!'));
      ui?.point('bum');
    } else if (n === 3) {
      ui?.point(null);
      ui?.tip(null);
      objective(t('dv.tut.3', 'Mire na criação e toque Pegar'), { icon: 'hand-tap' });
      setTimeout(() => notify(t('dv.tut.3b', 'Ande com o joystick e arraste para olhar'), { icon: 'hand-tap' }), 1200);
    } else if (n === 4) {
      objective(null);
      notify(t('dv.tut.done', 'Isso! Jogue, empilhe, pinte… o ateliê é seu!'), { icon: 'party', kind: 'good' });
      this.sv.tut = 4;
      persistDv();
    }
  }

  private async atelierBum(): Promise<void> {
    const ui = this.drawUI;
    const a = this.atelier;
    if (!ui || !a || this.busy || ui.paper.empty) return;
    this.busy = true;
    const an = ui.reanalyze();
    const d = cloneDrawing(ui.paper.drawing);
    const r = an ? cook(d, ui.mat, { tier: this.eng.q.tier, map: ATELIER_MAP, vehicle: ui.vehicle, art: ui.paper.art, k: ui.paper.k, an }) : null;
    if (!r) {
      this.busy = false;
      notify(t('dv.tooSmall', 'Desenhe um pouco maior!'), { icon: 'warning' });
      return;
    }
    const recipe = { d, mat: r.built.mat, vehicle: ui.vehicle && r.built.wheels.length > 0, fly: ui.fly };
    const pr = ui.paper.el.getBoundingClientRect();
    const hr = this.el.getBoundingClientRect();
    bumSound();
    bumBurst(this.el, pr.left - hr.left + pr.width / 2, pr.top - hr.top + pr.height / 2, r.built.colors);
    ui.point(null);
    await liftPaper(ui.paper.el);
    if (this.dead) return;
    flash(this.el);
    ui.paper.clear();
    ui.manual = false;
    ui.vehicle = ui.fly = false;
    this.closeDraw();
    const c = a.spawnBuilt(recipe, r.built);
    this.sv.bums++;
    persistDv();
    this.busy = false;
    const mn = matName(r.built.mat);
    setTimeout(() => {
      if (recipe.vehicle) notify(t('dv.isVehicle', 'Virou um veículo! Mire e toque Dirigir'), { icon: 'car', kind: 'good' });
      else if (recipe.fly) notify(t('dv.isFly', 'Ele voa! Mire e toque Pilotar'), { icon: 'rocket', kind: 'good' });
      else notify(t('dv.made', '{m} pronto!', { m: mn }), { icon: 'sparkle', kind: 'good' });
    }, 700);
    void c;
    if (this.tut < 4) this.tutStep(3);
  }

  /* ----------------------------- galeria ----------------------------- */
  private gallery(): void {
    const a = this.ensureAtelier();
    const items = this.sv.gallery;
    const o = this.overlay(
      'dv-gal dv-dim',
      `<div class="dv-ovtop"><button class="dv-btn dv-ic dv-g-back">${dvIcon('back', 24)}</button><h2>${t('dv.gallery', 'Galeria')}</h2><div class="dv-grow"></div>
        <div class="dv-import"><input class="dv-code-in" placeholder="${t('dv.code.ph', 'Cole um código DV1-…')}" /><button class="dv-btn dv-g-imp">${dvIcon('import', 20)}<span>${t('dv.code.open', 'Abrir')}</span></button></div></div>
      ${items.length ? '<div class="dv-grid"></div>' : `<div class="dv-empty">${dvIcon('gallery', 48)}<p>${t('dv.gallery.empty', 'Nada aqui ainda. No ateliê, mire numa criação e toque Salvar!')}</p></div>`}
      <div class="dv-codebox" hidden><input readonly class="dv-code-out" /><button class="dv-btn dv-gold dv-g-copy">${dvIcon('copy', 20)}<span>${t('dv.code.copy', 'Copiar')}</span></button></div>`,
    );
    const grid = o.querySelector('.dv-grid');
    for (const it of items) {
      const dec = parseShareCode(it.code);
      if (!dec || !grid) continue;
      const card = document.createElement('div');
      card.className = 'dv-card';
      const th = renderThumb(dec.d, 120);
      th.className = 'dv-thumb';
      card.appendChild(th);
      const tags = [matName(dec.mat), dec.flags & 1 ? t('dv.tag.veh', 'veículo') : '', dec.flags & 2 ? t('dv.tag.fly', 'voa') : ''].filter(Boolean).join(' · ');
      card.insertAdjacentHTML(
        'beforeend',
        `<small>${esc(tags)}</small><div class="dv-cardb">
          <button class="dv-mini dv-go" data-a="put" aria-label="${t('dv.g.put', 'Colocar')}">${dvIcon('play', 18)}</button>
          <button class="dv-mini" data-a="edit" aria-label="${t('dv.g.edit', 'Editar')}">${dvIcon('pen', 18)}</button>
          <button class="dv-mini" data-a="share" aria-label="${t('dv.g.share', 'Código')}">${dvIcon('share', 18)}</button>
          <button class="dv-mini dv-red" data-a="del" aria-label="${t('dv.ctx.del', 'Apagar')}">${dvIcon('trash', 18)}</button></div>`,
      );
      card.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest('button');
        if (!b) return;
        const act = b.dataset.a;
        if (act === 'put') {
          this.closeOv();
          a.setMenuMode(false);
          this.placeDecoded(dec.d, dec.mat, !!(dec.flags & 1), !!(dec.flags & 2));
        } else if (act === 'edit') {
          this.closeOv();
          a.setMenuMode(false);
          this.openDraw(dec.d);
          if (this.drawUI) {
            this.drawUI.mat = dec.mat;
            this.drawUI.manual = true;
            this.drawUI.reanalyze();
          }
        } else if (act === 'share') {
          const box = o.querySelector<HTMLDivElement>('.dv-codebox')!;
          box.hidden = false;
          const inp = box.querySelector<HTMLInputElement>('.dv-code-out')!;
          inp.value = it.code;
          inp.select();
        } else if (act === 'del') {
          this.sv.gallery = this.sv.gallery.filter((g) => g !== it);
          persistDv();
          card.remove();
        }
      });
      grid.appendChild(card);
    }
    o.querySelector('.dv-g-back')!.addEventListener('click', () => (a.menuMode ? this.menu() : this.closeOv()));
    o.querySelector('.dv-g-copy')!.addEventListener('click', () => {
      const inp = o.querySelector<HTMLInputElement>('.dv-code-out')!;
      inp.select();
      const ok = () => notify(t('dv.code.copied', 'Código copiado! Mande para um amigo.'), { icon: 'link', kind: 'good' });
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(inp.value).then(ok, () => document.execCommand?.('copy') && ok());
      else if (document.execCommand?.('copy')) ok();
    });
    o.querySelector('.dv-g-imp')!.addEventListener('click', () => {
      const v = o.querySelector<HTMLInputElement>('.dv-code-in')!.value;
      const dec = parseShareCode(v);
      if (!dec) {
        notify(t('dv.code.bad', 'Código inválido'), { icon: 'warning', kind: 'bad' });
        return;
      }
      addToGallery(v.trim());
      this.closeOv();
      a.setMenuMode(false);
      this.placeDecoded(dec.d, dec.mat, !!(dec.flags & 1), !!(dec.flags & 2));
    });
  }

  private placeDecoded(d: Drawing, mat: Material, vehicle: boolean, fly: boolean): void {
    const a = this.ensureAtelier();
    const r = cook(d, mat, { tier: this.eng.q.tier, map: ATELIER_MAP, vehicle });
    if (!r) return;
    a.spawnBuilt({ d, mat: r.built.mat, vehicle: vehicle && r.built.wheels.length > 0, fly }, r.built);
    bumSound();
  }

  /* ----------------------------- desafios ----------------------------- */
  private levelSelect(): void {
    if (this.chal) {
      this.eng.setStage(null);
      this.chal = null;
      this.atelier = null;
      this.ensureAtelier().setMenuMode(true);
    }
    this.closeDraw();
    objective(null);
    const st = this.sv.stars;
    const cards = LEVELS.map((lv, i) => {
      const s = st[lv.id] ?? 0;
      const open = i < 3 || (st[LEVELS[i - 1].id] ?? 0) > 0;
      return `<button class="dv-lv${open ? '' : ' dv-locked'}${s ? ' dv-done' : ''}" data-i="${i}" ${open ? '' : 'disabled'}>
        <b>${i + 1}</b>${dvIcon(open ? levelIcon(lv.kind) : 'lock', 26)}<span>${esc(lv.name())}</span>
        <em>${[0, 1, 2].map((k) => `<i class="${k < s ? 'on' : ''}">${dvIcon('star', 14)}</i>`).join('')}</em></button>`;
    }).join('');
    const o = this.overlay(
      'dv-sel dv-dim',
      `<div class="dv-ovtop"><button class="dv-btn dv-ic dv-s-back">${dvIcon('back', 24)}</button><h2>${t('dv.chal', 'Desafios')}</h2><div class="dv-grow"></div><div class="dv-pill">${dvIcon('star', 16)} ${fmt(totalStars())}/${LEVELS.length * 3}</div></div>
      <div class="dv-lvgrid">${cards}</div>`,
    );
    o.querySelector('.dv-s-back')!.addEventListener('click', () => this.menu());
    o.querySelectorAll<HTMLButtonElement>('.dv-lv').forEach((b) => b.addEventListener('click', () => this.playLevel(+b.dataset.i!)));
  }

  playLevel(i: number): void {
    this.closeOv();
    this.closeDraw();
    this.drawUI?.destroy();
    this.drawUI = null;
    this.atelier = null;
    this.eng.setStage(null);
    this.layer.innerHTML = '';
    const lv = LEVELS[i];
    const c = new Challenge(this.eng, this.layer, lv, i);
    this.chal = c;
    this.eng.setStage(c);
    c.onExit = () => this.levelSelect();
    c.onRestart = () => this.playLevel(i);
    c.onWin = (r) => setTimeout(() => !this.dead && this.chal === c && this.results(i, r), 1100);
    c.onFail = () => setTimeout(() => !this.dead && this.chal === c && this.failed(i), 700);
  }

  private results(i: number, r: ChallengeResult): void {
    const lv = LEVELS[i];
    const prev = this.sv.stars[lv.id] ?? 0;
    const gained = Math.max(0, r.stars - prev);
    const coins = gained * 10;
    if (r.stars > prev) this.sv.stars[lv.id] = r.stars;
    this.sv.bestInk[lv.id] = Math.min(this.sv.bestInk[lv.id] ?? 1e9, +r.ink.toFixed(2));
    persistDv();
    if (coins) addCoins(coins);
    reportRun({ game: 'desenho', score: r.stars * 100 + Math.max(0, Math.round((lv.ink - r.ink) * 10)), coins, durationSec: Math.round(r.time), won: true, stats: { stars: r.stars, level: i + 1 } });
    success();
    const next = i + 1 < LEVELS.length;
    const o = this.overlay(
      'dv-res dv-dim',
      `<div class="dv-rcard">
        <h2>${t('dv.win', 'Conseguiu!')}</h2>
        <div class="dv-bigstars">${[0, 1, 2].map((k) => `<i class="${k < r.stars ? 'on' : ''}" style="animation-delay:${0.15 + k * 0.22}s">${dvIcon('star', 54)}</i>`).join('')}</div>
        <div class="dv-rrows">
          <div class="${r.ink <= lv.par ? 'ok' : ''}">${dvIcon('ink', 18)}<span>${t('dv.r.ink', 'Tinta')}: ${r.ink.toFixed(1)} m</span><small>${t('dv.r.par', 'meta')} ${lv.par} m</small></div>
          <div class="${r.time <= lv.time ? 'ok' : ''}">${dvIcon('clock', 18)}<span>${t('dv.r.time', 'Tempo')}: ${Math.round(r.time)} s</span><small>${t('dv.r.par', 'meta')} ${lv.time} s</small></div>
        </div>
        ${coins ? `<div class="dv-coins">+${coins} ${t('dv.coins', 'moedas')}</div>` : ''}
        <div class="dv-row">
          <button class="dv-btn dv-ghost dv-r-menu">${dvIcon('gallery', 20)}<span>${t('dv.levels', 'Fases')}</span></button>
          <button class="dv-btn dv-ghost dv-r-again">${dvIcon('restart', 20)}<span>${t('dv.again', 'De novo')}</span></button>
          ${next ? `<button class="dv-btn dv-gold dv-r-next">${dvIcon('next', 20)}<span>${t('dv.next', 'Próxima')}</span></button>` : ''}
        </div></div>`,
    );
    o.querySelector('.dv-r-menu')!.addEventListener('click', () => this.levelSelect());
    o.querySelector('.dv-r-again')!.addEventListener('click', () => this.playLevel(i));
    o.querySelector('.dv-r-next')?.addEventListener('click', () => this.playLevel(i + 1));
  }

  private failed(i: number): void {
    const o = this.overlay(
      'dv-res dv-fail',
      `<div class="dv-rcard dv-small"><h2>${t('dv.fail', 'Quase!')}</h2><p>${t('dv.fail.d', 'Tente outro desenho ou outro material.')}</p>
        <div class="dv-row"><button class="dv-btn dv-ghost dv-r-menu">${dvIcon('gallery', 20)}<span>${t('dv.levels', 'Fases')}</span></button>
        <button class="dv-btn dv-gold dv-r-again">${dvIcon('restart', 20)}<span>${t('dv.retry', 'Tentar de novo')}</span></button></div></div>`,
    );
    o.querySelector('.dv-r-menu')!.addEventListener('click', () => this.levelSelect());
    o.querySelector('.dv-r-again')!.addEventListener('click', () => this.playLevel(i));
  }

  /* ----------------------------- ciclo de vida ----------------------------- */
  pause(): void {
    this.eng.pause();
  }
  resume(): void {
    this.eng.resume();
  }
  destroy(): void {
    if (this.dead) return;
    this.dead = true;
    objective(null);
    clearNotify();
    resetNotifyTop();
    this.drawUI?.destroy();
    this.eng.destroy();
    disposeSfx();
    this.el.remove();
  }
}
