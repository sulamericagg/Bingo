/* ============================================================
 *  MUNDO — camada de sobrevivência/criação ("Sandbox") sobre o
 *  mundo aberto: inventário + barra, criar, construir, comer,
 *  vida/fome/fôlego, dia e noite, bichos, baús, fornalhas, cultivos,
 *  trilhos e vagonetes. Implementa a MundoAPI para módulos de conteúdo.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import type { WorldGame } from './worldgame';
import { VDEFS } from './worldgame';
import { Bus, MODULES, type Entity, type GameMode, type MundoAPI, type MundoEvents, type Placeable } from './engine';
import { ITEM, ITEMS, RECIPES, TOOL_TIERS, itemName, type ItemDef, type Recipe } from './items';
import { Inventory, HOTBAR, type Stack } from './inv';
import { Hotbar, InvScreen } from './invui';
import { Builds, CROPS, PDEFS, ghostMesh, type Piece } from './build';
import { Spawner } from './mobs';
import { iconURL } from './itemicons';
import { MATS } from './vox';
import { Carts } from './rails';
import { tntModel } from './wmodels';
import { BLOCKS, BlockStore, BlockWorld, blockDef, blockForItem, blockIconURL, breakInfo, rollDrops } from './content/blocks';
import { WSPECIES } from './biomes';

const DAY = 720; // s por dia inteiro
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const NIGHT = new THREE.Color('#1a1848');
const DUSK = new THREE.Color('#ff9a6a');

const CSS = `
.ms-bars{position:absolute;left:calc(50% - 196px);bottom:calc(var(--edgeB,10px) + 50px);display:flex;gap:8px;pointer-events:none;z-index:6}
.ms-bar{display:flex;align-items:center;gap:3px;font-size:11px;font-weight:900;color:#fff;text-shadow:0 1px 0 #2a0b5c}
.ms-bar i{display:block;width:62px;height:9px;border-radius:5px;background:rgba(20,8,48,.55);border:2px solid #2a0b5c;overflow:hidden}
.ms-bar i b{display:block;height:100%;width:100%;transition:width .2s}
.ms-act{position:absolute;right:calc(var(--edgeR,12px) + 104px);bottom:calc(var(--edgeB,10px) + 122px);pointer-events:auto;min-height:40px;font-size:12px;padding:4px 12px;z-index:6}
.ms-stash{position:absolute;right:calc(var(--edgeR,12px) + 164px);bottom:calc(var(--edgeB,10px) + 122px);pointer-events:auto;min-height:40px;font-size:12px;padding:4px 10px;z-index:6}
.ms-rot{position:absolute;right:calc(var(--edgeR,12px) + 164px);bottom:calc(var(--edgeB,10px) + 62px);width:52px;height:52px;pointer-events:auto;z-index:6}
.ms-act.hide,.ms-stash.hide,.ms-rot.hide{display:none}
.ms-ko{position:absolute;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(40,10,60,.55);color:#fff;font-weight:900;font-size:26px;text-shadow:0 2px 0 #2a0b5c;pointer-events:none;flex-direction:column;gap:6px}
.ms-ko small{font-size:14px}
.ms-dmg{position:absolute;inset:0;pointer-events:none;z-index:4;box-shadow:inset 0 0 80px rgba(255,60,90,.0);transition:box-shadow .25s}
`;

export class Sandbox implements MundoAPI {
  inv = new Inventory();
  hp = 20;
  maxHp = 20;
  food = 20;
  stam = 10;
  dayT = 0.3;
  spawn: [number, number, number] | null = null;
  builds: Builds;
  carts: Carts;
  private ents: Entity[] = [];
  private eid = 1;
  private bus = new Bus();
  private hot: Hotbar;
  private scr: InvScreen | null = null;
  private spawner: Spawner;
  private bars: HTMLDivElement;
  private actBtn: HTMLButtonElement;
  private stashBtn: HTMLButtonElement;
  private rotBtn: HTMLButtonElement;
  private dmgEl: HTMLDivElement;
  private ghost: THREE.Mesh | null = null;
  private ghostId = '';
  private rot = 0;
  private useCd = 0;
  private eatT = 0;
  private aimPiece: Piece | null = null;
  private aimEnt: Entity | null = null;
  private handMesh: THREE.Mesh;
  private handTex = new Map<string, THREE.Texture>();
  private handId = '';
  private stars: THREE.Points;
  private nightWas = false;
  private koT = 0;
  private hurtFlash = 0;
  private placeables = new Map<string, Placeable>();
  private uiT = 0;
  private lastHeld = '';
  /** blocos de construção (macios se fundem no chão; duros chanfrados) */
  blocks: BlockWorld;
  private grav = 0;
  private dig: { x: number; y: number; z: number; t: number } | null = null;
  /** sessão online (servidores) */
  net: import('./net').NetSession | null = null;

  constructor(
    private g: WorldGame,
    _root: HTMLElement,
    readonly mode: GameMode,
  ) {
    if (!document.getElementById('ms-css')) {
      const s = document.createElement('style');
      s.id = 'ms-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.builds = new Builds(g.scene, g.world.solids, g.opts.tier >= 2 ? 4 : 2);
    this.blocks = new BlockWorld({ parent: g.scene, tier: g.opts.tier as 0 | 1 | 2 | 3, terrain: { density: (x: number, y: number, z: number) => g.world.vox.dens(x, y, z) } });
    // itens dos blocos (os que o catálogo ainda não tem)
    for (const b of BLOCKS) {
      if (!b.num || ITEM.has(b.item)) continue;
      const id = b.item;
      this.registerItem({ id, name: b.name, cat: 'const', stack: b.stack || 64, ic: { s: 'rock', c: '#a8a4b0' }, iconUrl: () => blockIconURL(blockForItem(id)?.id ?? id, 64) });
    }
    const solidAt = (x: number, y: number, z: number) => {
      const n = this.blocks.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      return n > 0 && blockDef(n).solid;
    };
    g.world.extraSolid = solidAt;
    g.world.extraFloor = (x, y, z) => {
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      for (let iy = Math.floor(y); iy > y - 4; iy--) {
        const n = this.blocks.getBlock(ix, iy, iz);
        if (n > 0 && blockDef(n).solid && iy + 1 <= y + 0.01) return iy + 1;
      }
      return -Infinity;
    };
    this.carts = new Carts(this);
    this.spawner = new Spawner(g.opts.tier <= 1 ? 6 : 10);
    const hudEl = g.hud.el;
    this.hot = new Hotbar(hudEl, this.inv, (i) => this.select(i), () => this.openInv());
    this.bars = document.createElement('div');
    this.bars.className = 'ms-bars';
    hudEl.appendChild(this.bars);
    const btn = (cls: string, html: string, f: () => void) => {
      const b = document.createElement('button');
      b.className = 'fl-btn ' + cls;
      b.innerHTML = html;
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        f();
      });
      hudEl.appendChild(b);
      return b;
    };
    this.actBtn = btn('green ms-act hide', '', () => this.interact());
    this.stashBtn = btn('wood ms-stash hide', '', () => this.stashLog());
    this.rotBtn = btn('round ms-rot hide', '⟳', () => {
      this.rot = (this.rot + 1) & 3;
      audio.click();
    });
    this.dmgEl = document.createElement('div');
    this.dmgEl.className = 'ms-dmg';
    hudEl.appendChild(this.dmgEl);
    // mão: o item segurado aparece como uma plaquinha com o ícone
    this.handMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.05, depthTest: false, fog: false, toneMapped: false }));
    this.handMesh.renderOrder = 12;
    this.handMesh.visible = false;
    g.camera.add(this.handMesh);
    // estrelas
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.9 + 0.1;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * 300;
      pos[i * 3 + 1] = Math.sin(e) * 300;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 300;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    g.scene.add(this.stars);
    // ganchos no jogo
    g.hurt = (n, why) => this.hurtPlayer(n, why);
    g.onMined = (counts, x, y, z) => this.mined(counts, x, y, z);
    g.onBoom = (x, y, z, r) => {
      for (const e of this.near(x, z, r * 1.6)) e.hit?.(8, 'boom', this);
      this.bus.emit('boom', x, y, z, r);
    };
    g.world.onLoad = (c) => this.bus.emit('chunkLoad', c);
    const ou = g.world.onUnload;
    g.world.onUnload = (c) => {
      ou?.(c);
      this.bus.emit('chunkUnload', c);
    };
    for (const m of MODULES) {
      try {
        m.install(this);
      } catch (e) {
        console.warn('[mundo] módulo', m.name, e);
      }
    }
    this.renderBars();
  }

  /* ============================ MundoAPI ============================ */
  get scene(): THREE.Scene {
    return this.g.scene;
  }
  get camera(): THREE.PerspectiveCamera {
    return this.g.camera;
  }
  get seed(): number {
    return this.g.save.seed;
  }
  get time(): number {
    return this.g.time;
  }
  get tier(): number {
    return this.g.opts.tier;
  }
  isNight(): boolean {
    return this.dayT < 0.23 || this.dayT > 0.77;
  }
  heightAt(x: number, z: number): number {
    return this.g.world.heightAt(x, z);
  }
  floorAt(x: number, y: number, z: number): number {
    return this.g.world.floorAt(x, y, z);
  }
  dens(x: number, y: number, z: number): number {
    const d = this.g.world.vox.dens(x, y, z);
    return d <= 0 && this.g.world.extraSolid?.(x, y, z) ? 0.5 : d;
  }
  matAt(x: number, y: number, z: number): number {
    return this.g.world.vox.matAt(x, y, z);
  }
  isWater(x: number, z: number): boolean {
    return this.g.world.isWater(x, z);
  }
  waterLevel(x: number, z: number): number {
    return this.g.world.waterLevel(x, z);
  }
  biomeAt(x: number, z: number): number {
    return this.g.world.biomeAt(x, z);
  }
  editTerrain(x: number, y: number, z: number, r: number, fill: number, maxHard = 99): number {
    return this.g.world.vox.edit(x, y, z, r, fill, maxHard, new Map());
  }
  rayTerrain(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, max: number): number {
    return this.g.world.vox.ray(ox, oy, oz, dx, dy, dz, max);
  }
  readonly player = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 20,
    maxHp: 20,
    driving: false,
  };
  hurtPlayer(n: number, why: string): void {
    if (this.mode === 'criativo' || this.koT > 0 || n <= 0) return;
    const def = this.inv.defense();
    const k = n * (1 - Math.min(0.75, def / 28));
    this.hp = Math.max(0, this.hp - k);
    this.hurtFlash = 0.5;
    this.g.shake = Math.max(this.g.shake, 0.25);
    tap('medium');
    audio.crack();
    if (def > 0) for (let i = 0; i < 4; i++) if (this.inv.armor.s[i] && Math.random() < 0.5) this.wearArmor(i);
    if (this.hp <= 0) this.ko(why);
    this.renderBars();
  }
  healPlayer(n: number): void {
    this.hp = Math.min(this.maxHp, this.hp + n);
    this.renderBars();
  }
  feedPlayer(n: number): void {
    this.food = Math.min(20, this.food + n);
    this.renderBars();
  }
  give(id: string, n = 1): number {
    const left = this.inv.give(id, n);
    if (left < n) {
      this.toast(`+${n - left} ${itemName(id)}`, 'good');
      audio.coin(2);
    }
    if (left > 0) this.toast(t('mundo.full', 'Mochila cheia!'), 'warn');
    return left;
  }
  take(id: string, n = 1): boolean {
    if (this.mode === 'criativo') return true;
    return this.inv.remove(id, n);
  }
  count(id: string): number {
    return this.inv.count(id);
  }
  held(): string {
    return this.inv.held()?.id ?? '';
  }
  registerItem(d: ItemDef): void {
    if (ITEM.has(d.id)) return;
    ITEMS.push(d);
    ITEM.set(d.id, d);
  }
  registerRecipe(r: Recipe): void {
    RECIPES.push(r);
  }
  registerPlaceable(id: string, p: Placeable): void {
    this.placeables.set(id, p);
  }
  addEntity(e: Entity): Entity {
    if (!e.id) e.id = this.eid++;
    this.ents.push(e);
    return e;
  }
  removeEntity(e: Entity): void {
    const i = this.ents.indexOf(e);
    if (i >= 0) {
      this.ents.splice(i, 1);
      e.dispose(this);
    }
  }
  entities(): readonly Entity[] {
    return this.ents;
  }
  near(x: number, z: number, r: number, out: Entity[] = []): Entity[] {
    out.length = 0;
    for (const e of this.ents) if ((e.x - x) ** 2 + (e.z - z) ** 2 < r * r) out.push(e);
    return out;
  }
  on<K extends keyof MundoEvents>(ev: K, f: MundoEvents[K]): () => void {
    return this.bus.on(ev, f);
  }
  emit<K extends keyof MundoEvents>(ev: K, ...a: Parameters<MundoEvents[K]>): void {
    this.bus.emit(ev, ...a);
  }
  toast(msg: string, kind: 'info' | 'good' | 'warn' = 'info'): void {
    this.g.hud.toast(msg, kind === 'good' ? 'gold' : kind === 'warn' ? 'warn' : '');
  }
  burst(n: number, x: number, y: number, z: number, color: string, speed: number): void {
    this.g.burst(n, x, y, z, color, speed);
  }
  sfx(name: 'click' | 'coin' | 'crack' | 'tick' | 'cash'): void {
    if (name === 'coin') audio.coin(2);
    else if (name === 'tick') audio.tick(1);
    else (audio as any)[name]?.();
  }

  /* ============================ início ============================ */

  /** kit inicial (depois da queda da nave) */
  starter(): void {
    this.inv.give('axe_madeira', 1);
    this.inv.give('pick_madeira', 1);
    this.inv.give('fruta', 6);
    this.inv.give('tocha', 6);
    this.inv.give('tabua', 8);
    if (this.mode === 'criativo') {
      this.inv.give('bancada', 1);
      this.inv.give('parede_madeira', 32);
      this.inv.give('piso_madeira', 32);
    }
  }

  select(i: number): void {
    this.inv.sel = i;
    audio.click();
    this.hot.refresh();
  }

  openInv(st?: Piece | null): void {
    if (this.scr) return;
    const g = this.g;
    g.hud.ctl.use = false;
    const p = st ?? null;
    const d = p ? PDEFS.get(p.id) : null;
    const near = p ? null : this.builds.stationNear(g.px, g.py, g.pz, 4);
    const station = d?.station ?? near?.st ?? 'mao';
    this.scr = new InvScreen(g.root, {
      inv: this.inv,
      station: d?.chest || d?.furnace ? 'mao' : station,
      chest: p?.chest ?? null,
      furnace: p?.furnace ?? null,
      creative: this.mode === 'criativo' && !p,
      title: p ? itemName(p.id) : undefined,
      onClose: () => {
        this.scr = null;
        this.hot.refresh();
        if (p?.chest) this.builds.onChange?.('upd', p);
      },
      onCraft: (r) => {
        audio.coin(3);
        tap('light');
        if (r.out.startsWith('kit_')) this.toast(t('mundo.kitHint', 'Segure o kit e toque em Usar para montar o veículo'), 'good');
      },
      onChange: () => this.hot.refresh(),
    });
  }

  /* ============================ por quadro ============================ */

  update(dt: number): void {
    const g = this.g;
    const P = this.player;
    P.x = g.px;
    P.y = g.py;
    P.z = g.pz;
    P.yaw = g.yaw;
    P.pitch = g.pitch;
    P.hp = this.hp;
    P.driving = g.driving >= 0;
    this.scr?.tick(dt);
    this.stepDay(dt);
    this.stepStats(dt);
    // entidades
    for (let i = this.ents.length - 1; i >= 0; i--) {
      const e = this.ents[i];
      let ok = true;
      try {
        ok = e.update(dt, this);
      } catch (err) {
        console.warn('[mundo] entidade', e.kind, err);
        ok = false;
      }
      if (!ok) {
        this.ents.splice(i, 1);
        e.dispose(this);
      }
    }
    if (!this.net || this.net.isHost) this.spawner.update(dt, this);
    this.net?.tick(dt);
    this.carts.update(dt);
    this.blocks.focus.set(g.px, g.py, g.pz);
    this.blocks.remesh();
    this.grav -= dt;
    if (this.grav <= 0) {
      this.grav = 0.15;
      this.blocks.tickGravity();
    }
    const dark = Math.max(1 - g.dayLight, g.under);
    this.builds.update(dt, g.px, g.py, g.pz, Math.min(1, dark * 1.3));
    if (g.driving < 0 && !this.carts.riding) this.aim(dt);
    else {
      this.hideGhost();
      this.actBtn.classList.add('hide');
    }
    this.uiT -= dt;
    if (this.uiT <= 0) {
      this.uiT = 0.1;
      this.hot.refresh(0.1);
      this.hot.show(g.driving < 0);
      this.stashBtn.classList.toggle('hide', !(g.aimLog || g.held) || g.driving >= 0);
      this.stashBtn.textContent = t('mundo.stash', 'Guardar tora');
    }
    this.poseHandItem();
    if (this.hurtFlash > 0) {
      this.hurtFlash = Math.max(0, this.hurtFlash - dt);
      this.dmgEl.style.boxShadow = `inset 0 0 90px rgba(255,60,90,${this.hurtFlash})`;
    }
    if (this.koT > 0) {
      this.koT -= dt;
      if (this.koT <= 0) this.respawn();
    }
    this.bus.emit('tick', dt);
  }

  private stepDay(dt: number): void {
    const g = this.g;
    this.dayT = (this.dayT + dt / DAY) % 1;
    // luz: dia cheio entre 0.28 e 0.72
    const s = Math.sin((this.dayT - 0.25) * Math.PI * 2); // -1 meia-noite, 1 meio-dia
    const day = Math.max(0, Math.min(1, s * 2.2 + 0.45));
    g.dayLight = 0.22 + day * 0.78;
    const night = this.isNight();
    if (night !== this.nightWas) {
      this.nightWas = night;
      this.toast(night ? t('mundo.night', 'Anoiteceu… cuidado com os bichos bravos!') : t('mundo.morning', 'Bom dia!'), night ? 'warn' : 'good');
      this.bus.emit('dayChange', night);
    }
    // céu e neblina
    const bg = g.scene.background as THREE.Color;
    const f = g.scene.fog as THREE.Fog;
    const dusk = Math.max(0, 1 - Math.abs(s) * 4) * 0.35;
    if (day < 1) {
      bg.lerp(NIGHT, (1 - day) * 0.9);
      f.color.lerp(NIGHT, (1 - day) * 0.9);
    }
    if (dusk > 0) {
      bg.lerp(DUSK, dusk);
      f.color.lerp(DUSK, dusk * 0.8);
    }
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - day * 1.6) * (1 - g.under);
    this.stars.position.copy(g.camera.position);
    // sol em órbita
    const a = (this.dayT - 0.25) * Math.PI * 2;
    g.sun.position.set(g.px + Math.cos(a) * 50, Math.max(5, Math.sin(a) * 70), g.pz + 18);
    g.sun.color.copy(_c.set(0xfff2d8).lerp(DUSK, dusk * 1.5));
  }

  private stepStats(dt: number): void {
    if (this.mode === 'criativo') return;
    const g = this.g;
    const moving = Math.hypot(g.hud.ctl.mx, g.hud.ctl.my) > 0.2;
    const hungerRate = (this.mode === 'pacifico' ? 0.006 : 0.012) + (moving ? 0.006 : 0);
    this.food = Math.max(0, this.food - dt * hungerRate);
    this.stam = Math.min(10, this.stam + dt * (moving ? 1.2 : 2.2));
    if (this.food > 14 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 0.35);
    else if (this.food <= 0) {
      this.hp = Math.max(this.mode === 'pacifico' ? 4 : 0, this.hp - dt * 0.25);
      if (this.hp <= 0) this.ko('fome');
    }
    if (this.mode === 'pacifico' && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + dt * 0.3);
    // afogamento: muito tempo com a cabeça dentro do aquífero
    this.barsT -= dt;
    if (this.barsT <= 0) {
      this.barsT = 0.3;
      this.renderBars();
    }
  }
  private barsT = 0;

  private renderBars(): void {
    if (this.mode === 'criativo') {
      this.bars.innerHTML = `<div class="ms-bar">✦ ${t('mundo.mode.criativo', 'Criativo')}</div>`;
      return;
    }
    const bar = (ic: string, v: number, mx: number, col: string) => `<div class="ms-bar">${ic}<i><b style="width:${Math.round((v / mx) * 100)}%;background:${col}"></b></i></div>`;
    const h = bar('❤', this.hp, this.maxHp, '#ff5a7a') + bar('🍞', this.food, 20, '#ffb02e') + bar('⚡', this.stam, 10, '#7ad0ff');
    if (h !== this.bars.innerHTML) this.bars.innerHTML = h;
  }

  private ko(why: string): void {
    if (this.koT > 0) return;
    this.koT = 2.4;
    const el = document.createElement('div');
    el.className = 'ms-ko';
    el.innerHTML = `${t('mundo.ko', 'Ops! Você desmaiou')}<small>${why === 'lava' ? t('mundo.koLava', 'Lava é quente demais!') : t('mundo.koWake', 'Acordando em casa…')}</small>`;
    this.g.root.appendChild(el);
    setTimeout(() => el.remove(), 2400);
    this.bus.emit('death');
  }
  private respawn(): void {
    const g = this.g;
    const s = this.spawn;
    const x = s ? s[0] : 0;
    const z = s ? s[2] : 30;
    g.teleport(x, z);
    g.py = s ? s[1] + 0.5 : g.world.floorAt(x, 200, z);
    g.vy = 0;
    this.hp = this.maxHp;
    this.food = Math.max(this.food, 12);
    this.renderBars();
  }

  private wearArmor(i: number): void {
    const st = this.inv.armor.s[i];
    if (!st) return;
    const dur = ITEM.get(st.id)?.dur ?? 100;
    st.d = (st.d ?? 0) + 1;
    if (st.d >= dur) {
      this.inv.armor.s[i] = null;
      this.toast(t('mundo.broke', '{i} quebrou!', { i: itemName(st.id) }), 'warn');
    }
  }

  /* ============================ mira e uso ============================ */

  private aim(dt: number): void {
    const g = this.g;
    const st = this.inv.held();
    const it = st ? ITEM.get(st.id) : undefined;
    const cp = g.camera.position;
    g.camera.getWorldDirection(_v);
    // peça e entidade na mira
    const pk = this.builds.pick(cp.x, cp.y, cp.z, _v.x, _v.y, _v.z, 4);
    this.aimPiece = pk ? pk.p : null;
    this.aimEnt = this.pickEnt(cp, _v, it?.tool === 'sword' ? 3.6 : 3);
    // botão de ação (abrir, deitar, colher, montar…)
    const lbl = this.actLabel();
    this.actBtn.classList.toggle('hide', !lbl);
    if (lbl && this.actBtn.textContent !== lbl) this.actBtn.textContent = lbl;
    // fantasma de construção
    const placeId = it?.place && PDEFS.has(it.place) ? it.place : '';
    if (placeId && !g.held) this.showGhost(placeId, cp, _v);
    else this.hideGhost();
    this.rotBtn.classList.toggle('hide', !placeId);
    // usar
    this.useCd -= dt;
    const c = g.hud.ctl;
    if (!c.use || g.held) {
      this.eatT = 0;
      return;
    }
    if (it?.food) {
      if (this.food >= 20 && this.mode !== 'criativo') return;
      this.eatT += dt;
      g.swing = Math.min(1, g.swing + dt * 3);
      if (this.eatT > 0.8) {
        this.eatT = 0;
        this.feedPlayer(it.food);
        this.healPlayer(it.food * 0.25);
        this.inv.useHeld();
        audio.coin(4);
        this.burst(6, g.px - Math.sin(g.yaw) * 0.5, g.py + 1.4, g.pz - Math.cos(g.yaw) * 0.5, it.ic.c, 2);
        this.toast(t('mundo.yum', 'Nham! {i}', { i: it.name() }), 'good');
      }
      return;
    }
    if (this.useCd > 0) return;
    this.use(it, st);
  }

  private pickEnt(o: THREE.Vector3, d: THREE.Vector3, max: number): Entity | null {
    let best: Entity | null = null;
    let bt = max;
    for (const e of this.ents) {
      const ex = e.x - o.x;
      const ey = e.y + e.h * 0.5 - o.y;
      const ez = e.z - o.z;
      const tt = ex * d.x + ey * d.y + ez * d.z;
      if (tt < 0 || tt > bt) continue;
      const qx = ex - d.x * tt;
      const qy = ey - d.y * tt;
      const qz = ez - d.z * tt;
      if (qx * qx + qy * qy + qz * qz < (e.r + 0.25) ** 2) {
        bt = tt;
        best = e;
      }
    }
    return best;
  }

  private actLabel(): string {
    const p = this.aimPiece;
    const e = this.aimEnt;
    if (e?.interact) return this.carts.label(e) ?? t('mundo.useIt', 'Usar');
    if (!p) return '';
    const d = PDEFS.get(p.id)!;
    if (this.held() === 'martelo') return t('mundo.dismantle', 'Desmontar');
    if (d.door) return p.open ? t('mundo.close', 'Fechar') : t('mundo.open', 'Abrir');
    if (d.chest) return t('mundo.open', 'Abrir');
    if (d.furnace) return t('mundo.cook', 'Cozinhar');
    if (d.station) return t('mundo.craft', 'Criar');
    if (d.bed) return t('mundo.sleep', 'Dormir');
    if (d.plot) {
      if (p.crop && p.grow! >= 1) return t('mundo.harvest', 'Colher');
      const h = ITEM.get(this.held());
      if (!p.crop && h?.crop) return t('mundo.plant', 'Plantar');
    }
    if (p.id === 'sino') return t('mundo.ring', 'Tocar');
    return '';
  }

  /** botão verde: abre baú/fornalha/estação, porta, cama, colher… */
  interact(): void {
    const p = this.aimPiece;
    const e = this.aimEnt;
    if (e?.interact) return e.interact(this);
    if (!p) return;
    const d = PDEFS.get(p.id)!;
    if (this.held() === 'martelo') return this.dismantle(p);
    if (d.door) {
      this.builds.toggleDoor(p);
      audio.click();
      return this.builds.onChange?.('upd', p);
    }
    if (d.chest || d.furnace || d.station) return this.openInv(p);
    if (d.bed) return this.sleep(p);
    if (d.plot) {
      if (p.crop && p.grow! >= 1) {
        for (const [id, n] of CROPS[p.crop].drop) this.give(id, n);
        this.builds.setCrop(p, '', 0);
        tap('light');
      } else if (!p.crop) {
        const h = ITEM.get(this.held());
        if (h?.crop && CROPS[h.crop]) {
          this.builds.setCrop(p, h.crop, 0);
          if (this.mode !== 'criativo') this.inv.useHeld();
          audio.click();
        }
      }
      return;
    }
    if (p.id === 'sino') {
      audio.cash();
      this.burst(8, p.x, p.y + 1.6, p.z, '#ffd34a', 2);
    }
  }

  private sleep(p: Piece): void {
    this.spawn = [p.x, p.y + 0.6, p.z];
    if (!this.isNight()) {
      this.toast(t('mundo.bedSet', 'Cama marcada como sua casa'), 'good');
      return;
    }
    this.dayT = 0.26;
    this.hp = this.maxHp;
    this.toast(t('mundo.slept', 'Zzz… bom dia! (casa marcada)'), 'good');
  }

  private dismantle(p: Piece): void {
    const it = ITEMS.find((i) => i.place === p.id);
    if (p.chest) for (const s of p.chest.s) if (s) this.inv.give(s.id, s.n, s.d);
    if (p.furnace) for (const s of [p.furnace.inp, p.furnace.fuel, p.furnace.out]) if (s) this.inv.give(s.id, s.n);
    this.builds.remove(p);
    this.builds.onChange?.('del', p);
    if (it && this.mode !== 'criativo') this.give(it.id, 1);
    this.burst(10, p.x, p.y + 0.5, p.z, it?.ic.c ?? '#d8a060', 3);
    this.inv.wear(1);
    audio.crack();
  }

  /** usar o item da mão (golpe, cavar, colocar, atirar…) */
  private use(it: ItemDef | undefined, st: Stack | null): void {
    const g = this.g;
    const kind = it?.tool;
    const tier = it?.tier ?? 0;
    const creative = this.mode === 'criativo';
    const tired = this.stam < 1 ? 1.6 : 1;
    // 1) bater em bicho na mira
    if (this.aimEnt && this.aimEnt.hit && !it?.place) {
      const dmg = it?.dmg ?? 1;
      this.useCd = (kind === 'sword' ? 0.45 : 0.55) * tired;
      g.swing = 1;
      this.aimEnt.hit(dmg, 'player', this);
      this.stam = Math.max(0, this.stam - 0.6);
      if (kind) this.wear();
      return;
    }
    // 1b) bloco na mira: quebrar com o tempo certo da ferramenta
    const cpos = g.camera.position;
    g.camera.getWorldDirection(_v);
    const bh = this.blocks.pick(cpos.x, cpos.y, cpos.z, _v.x, _v.y, _v.z, 5);
    const td = g.world.vox.ray(cpos.x, cpos.y, cpos.z, _v.x, _v.y, _v.z, 5);
    const blockFirst = bh && (td < 0 || bh.dist <= td + 0.05);
    const bplace = it && !it.place ? blockForItem(it.id) : null;
    if (bplace && (blockFirst || td >= 0)) {
      // colocar bloco: célula + normal (ou em cima do chão mirado)
      let bx: number, by: number, bz: number;
      if (blockFirst) {
        bx = bh!.x + bh!.nx;
        by = bh!.y + bh!.ny;
        bz = bh!.z + bh!.nz;
      } else {
        bx = Math.floor(cpos.x + _v.x * (td - 0.3));
        by = Math.floor(cpos.y + _v.y * (td - 0.3));
        bz = Math.floor(cpos.z + _v.z * (td - 0.3));
      }
      if (Math.abs(bx + 0.5 - g.px) < 0.9 && Math.abs(bz + 0.5 - g.pz) < 0.9 && by >= Math.floor(g.py) - 0 && by <= Math.floor(g.py + 1.8)) return;
      if (this.blocks.getBlock(bx, by, bz) || by > 126) return;
      this.useCd = 0.22;
      const rot = (Math.round(-g.yaw / (Math.PI / 2)) + 8) & 3;
      this.setBlock(bx, by, bz, bplace.num, rot);
      if (this.mode !== 'criativo') this.inv.useHeld();
      g.swing = 1;
      tap('light');
      audio.tick(2);
      return;
    }
    if (blockFirst && !it?.place) {
      const tool = kind === 'pick' || kind === 'axe' || kind === 'shovel' ? kind : 'mao';
      const bi = breakInfo(bh!.num, tool, creative ? 99 : tier);
      g.swing = 1;
      this.useCd = 0.25;
      if (!bi.can) {
        this.toast(t('mundo.tooHard', 'Duro demais! Precisa de uma picareta melhor'), 'warn');
        this.useCd = 0.6;
        return;
      }
      const d = this.dig && this.dig.x === bh!.x && this.dig.y === bh!.y && this.dig.z === bh!.z ? this.dig : (this.dig = { x: bh!.x, y: bh!.y, z: bh!.z, t: 0 });
      d.t += creative ? 99 : 0.25;
      const def = blockDef(bh!.num);
      this.burst(3, bh!.x + 0.5, bh!.y + 0.5, bh!.z + 0.5, '#d8c8b0', 2);
      audio.tick(0);
      if (d.t >= bi.seconds) {
        this.dig = null;
        this.setBlock(bh!.x, bh!.y, bh!.z, 0, 0);
        if (!creative && bi.drops) for (const dr of rollDrops(bh!.num)) this.give(dr.id, dr.n);
        this.burst(10, bh!.x + 0.5, bh!.y + 0.5, bh!.z + 0.5, '#c8b8a0', 3.5);
        if (kind) this.wear();
        void def;
      }
      return;
    }
    // 2) colocar peça / objeto
    if (it?.place && PDEFS.has(it.place)) {
      this.useCd = 0.25;
      this.place(it, st!);
      return;
    }
    // 3) kits de veículo
    if (it?.veh !== undefined) {
      this.useCd = 1;
      this.buildVehicle(it.veh);
      return;
    }
    // 4) dinamite
    if (st?.id === 'dinamite') {
      this.useCd = 1.2;
      const hit = g.aimPoint(5);
      const x = hit ? hit[0] : g.px - Math.sin(g.yaw) * 2;
      const z = hit ? hit[2] : g.pz - Math.cos(g.yaw) * 2;
      const y = hit ? hit[1] : g.world.floorAt(x, g.py + 1, z);
      const o = tntModel();
      o.scale.setScalar(1.6);
      o.position.set(x, y, z);
      g.scene.add(o);
      g.tnts.push({ o, x, y, z, t: 2.4 });
      if (!creative) this.inv.useHeld();
      this.toast(t('floresta.w.tntRun', 'Dinamite acesa! Afaste-se!'), 'warn');
      return;
    }
    // 5) estilingue / bumerangue: tiro reto
    if (kind === 'sling' || kind === 'boomerang') {
      this.useCd = kind === 'sling' ? 0.6 : 0.9;
      if (kind === 'sling' && !creative && !this.inv.remove('pedrinha', 1)) {
        this.toast(t('mundo.needPebble', 'Precisa de pedrinhas'), 'warn');
        return;
      }
      g.swing = 1;
      const cp = g.camera.position;
      g.camera.getWorldDirection(_v);
      const e = this.pickEnt(cp, _v, kind === 'sling' ? 28 : 20);
      const td = g.world.vox.ray(cp.x, cp.y, cp.z, _v.x, _v.y, _v.z, 28);
      for (let k = 1; k < 8; k++) this.burst(1, cp.x + _v.x * k * 2, cp.y + _v.y * k * 2, cp.z + _v.z * k * 2, kind === 'sling' ? '#b8b4c0' : '#ffb02e', 0.3);
      if (e && e.hit && (td < 0 || (e.x - cp.x) ** 2 + (e.z - cp.z) ** 2 < td * td)) e.hit(it!.dmg ?? 3, 'player', this);
      this.wear();
      audio.click();
      return;
    }
    // 6) bloco suave (terra, pedra, areia…): enche onde mira
    if (it?.fill !== undefined) {
      const hit = g.aimPoint(4.5);
      if (!hit) return;
      this.useCd = 0.3;
      g.camera.getWorldDirection(_v);
      const x = hit[0] - _v.x * 0.6;
      const y = hit[1] - _v.y * 0.6;
      const z = hit[2] - _v.z * 0.6;
      if (Math.hypot(x - g.px, z - g.pz) < 1.1 && y > g.py - 0.5 && y < g.py + 2) return; // não se enterra
      const n = g.world.vox.edit(x, y, z, 0.95, it.fill, 99, new Map());
      if (n > 0 && !creative) this.inv.useHeld();
      g.swing = 1;
      audio.tick(0);
      return;
    }
    // 7) enxada: vira canteiro no chão
    if (kind === 'hoe') {
      const hit = g.aimPoint(4);
      this.useCd = 0.5;
      g.swing = 1;
      if (!hit) return;
      const s = this.builds.snap('canteiro', hit[0], hit[1], hit[2], g.yaw, 0, null);
      const cx = Math.floor(hit[0] / 2) * 2 + 1;
      const cz = Math.floor(hit[2] / 2) * 2 + 1;
      if (!this.builds.occupied('canteiro', cx, s.y, cz, 0)) {
        const p = this.builds.add('canteiro', cx, g.world.floorAt(cx, hit[1] + 1, cz), cz, 0);
        if (p) this.builds.onChange?.('add', p);
        this.wear();
        audio.tick(1);
      }
      return;
    }
    // 8) ferramentas e mão: árvore ou terreno
    g.swing = 1;
    const tr = g.aimTree;
    if (tr && (kind === 'axe' || !kind || kind === 'sword' || kind === 'pick' || kind === 'shovel')) {
      this.useCd = 0.42 * tired;
      const dmg = kind === 'axe' ? it!.dmg! : kind ? 0.8 : 0.6;
      g.hitTree(tr, dmg, false);
      this.stam = Math.max(0, this.stam - 0.25);
      if (kind) this.wear();
      return;
    }
    if (kind === 'axe' || kind === 'sword') {
      this.useCd = 0.4;
      audio.click();
      return;
    }
    // cavar: picareta (dura) / pá (macia, rápida) / mão (só terra, devagar)
    const hard = creative ? 99 : kind === 'pick' ? tier : 0;
    const r = creative ? 1.6 : kind === 'pick' ? 0.95 + tier * 0.07 : kind === 'shovel' ? 1.15 + tier * 0.08 : 0.75;
    this.useCd = (kind === 'pick' ? 0.5 - tier * 0.025 : kind === 'shovel' ? 0.38 : 0.7) * tired;
    const counts = g.mineAim(r, hard, false);
    if (counts && counts.size) {
      this.stam = Math.max(0, this.stam - 0.35);
      if (kind) this.wear();
    }
  }

  /** muda um bloco (e avisa a rede) */
  setBlock(x: number, y: number, z: number, num: number, rot: number): void {
    this.blocks.setBlock(x, y, z, num, rot);
    this.blocksDirty = true;
    if (this.net && !this.net.applying) this.net.send({ t: 'op', op: { k: 'b', x, y, z, n: num, r: rot } });
  }
  blocksDirty = false;

  private wear(): void {
    const st = this.inv.held();
    if (this.mode === 'criativo' || !st) return;
    if (this.inv.wear(1)) {
      this.toast(t('mundo.broke', '{i} quebrou!', { i: itemName(st.id) }), 'warn');
      audio.crack();
    }
  }

  /** materiais minerados viram itens */
  private mined(counts: Map<number, number>, x: number, y: number, z: number): void {
    const acc = this.mineAcc;
    for (const [m, n] of counts) {
      const mi = MATS[m];
      if (!mi?.drop) continue;
      acc.set(m, (acc.get(m) ?? 0) + n);
      const k = Math.floor(acc.get(m)! / mi.per);
      if (k > 0) {
        acc.set(m, acc.get(m)! - k * mi.per);
        if (this.mode !== 'criativo') this.give(mi.drop, k);
      }
    }
    // às vezes acha uma pedrinha ou semente na terra
    if (counts.get(1) && Math.random() < 0.08 && this.mode !== 'criativo') this.give('semente', 1);
    this.bus.emit('mined', counts, x, y, z);
  }
  private mineAcc = new Map<number, number>();

  /** a tora na mira (ou na mão) vai para a mochila */
  stashLog(): void {
    const g = this.g;
    const l = g.held ?? g.aimLog;
    if (!l) return;
    const left = this.give('tora', 1);
    if (left) return;
    g.removeLog(l);
    void WSPECIES;
  }

  /* ============================ construção ============================ */

  private showGhost(id: string, cp: THREE.Vector3, dir: THREE.Vector3): void {
    const g = this.g;
    if (this.ghostId !== id) {
      this.hideGhost();
      this.ghost = ghostMesh(id);
      this.ghostId = id;
      if (this.ghost) g.scene.add(this.ghost);
    }
    const gm = this.ghost;
    if (!gm) return;
    const pos = this.placeSpot(id, cp, dir);
    if (!pos) {
      gm.visible = false;
      return;
    }
    gm.visible = true;
    gm.position.set(pos.x, pos.y, pos.z);
    gm.rotation.set(0, (pos.r * Math.PI) / 2, 0);
    const ok = !this.builds.occupied(id, pos.x, pos.y, pos.z, pos.r) && pos.y < 126;
    (gm.material as THREE.MeshBasicMaterial).color.setHex(ok ? 0x7aff8a : 0xff5a6a);
  }
  private hideGhost(): void {
    if (this.ghost) {
      this.g.scene.remove(this.ghost);
      this.ghost.geometry.dispose();
      (this.ghost.material as THREE.Material).dispose();
    }
    this.ghost = null;
    this.ghostId = '';
  }
  private placeSpot(id: string, cp: THREE.Vector3, dir: THREE.Vector3): { x: number; y: number; z: number; r: number } | null {
    const g = this.g;
    const td = g.world.vox.ray(cp.x, cp.y, cp.z, dir.x, dir.y, dir.z, 7);
    const pk = this.builds.pick(cp.x, cp.y, cp.z, dir.x, dir.y, dir.z, 7);
    let t0 = td;
    let hp: Piece | null = null;
    if (pk && (td < 0 || pk.t < td)) {
      t0 = pk.t;
      hp = pk.p;
    }
    if (t0 < 0) return null;
    const hx = cp.x + dir.x * t0;
    const hy = cp.y + dir.y * t0;
    const hz = cp.z + dir.z * t0;
    const s = this.builds.snap(id, hx, hy, hz, g.yaw, this.rot, hp);
    const d = PDEFS.get(id)!;
    if (d.rail) {
      // trilho: alinha com os vizinhos
      const nb = (dx: number, dz: number) => this.builds.pieces.some((p) => PDEFS.get(p.id)?.rail && Math.abs(p.x - s.x - dx) < 0.1 && Math.abs(p.z - s.z - dz) < 0.1 && Math.abs(p.y - s.y) < 1.6);
      if (nb(2, 0) || nb(-2, 0)) s.r = 1;
      else if (nb(0, 2) || nb(0, -2)) s.r = 0;
    }
    if (d.snap === 'free' && !hp) s.y = g.world.floorAt(s.x, hy + 0.6, s.z);
    if (d.snap === 'cell' && !hp && (id.startsWith('piso') || d.rail || d.plot)) s.y = Math.round(g.world.floorAt(s.x, hy + 0.6, s.z) * 4) / 4 + (id.startsWith('piso') ? 0.1 : 0);
    return s;
  }
  private place(it: ItemDef, st: Stack): void {
    const g = this.g;
    const id = it.place!;
    g.camera.getWorldDirection(_v);
    const s = this.placeSpot(id, g.camera.position, _v);
    if (!s) return;
    if (this.builds.occupied(id, s.x, s.y, s.z, s.r) || s.y >= 126) {
      audio.click();
      return;
    }
    // não constrói em cima de si mesmo
    const d = PDEFS.get(id)!;
    if (d.boxes.length && !d.floor && Math.abs(s.x - g.px) < 1 && Math.abs(s.z - g.pz) < 1 && s.y < g.py + 1.8 && s.y > g.py - 2.4) return;
    const ext = this.placeables.get(id);
    if (ext) {
      const e = ext.place(this, s.x, s.y, s.z, (s.r * Math.PI) / 2);
      if (e) this.addEntity(e);
    } else {
      const p = this.builds.add(id, s.x, s.y, s.z, s.r);
      if (!p) return;
      if (id === 'vagonete') this.carts.spawnOn(p);
      this.builds.onChange?.('add', p);
    }
    if (this.mode !== 'criativo') {
      st.n--;
      if (st.n <= 0) this.inv.s[this.inv.sel] = null;
    }
    g.swing = 1;
    tap('light');
    audio.tick(2);
    this.burst(5, s.x, s.y + 0.3, s.z, it.ic.c, 2);
  }

  private buildVehicle(k: number): void {
    const g = this.g;
    const v = g.vehs[k];
    if (!v) return;
    const fx = -Math.sin(g.yaw);
    const fz = -Math.cos(g.yaw);
    v.x = g.px + fx * 5;
    v.z = g.pz + fz * 5;
    v.y = g.world.floorAt(v.x, g.py + 3, v.z);
    v.yaw = g.yaw + Math.PI / 2;
    if (!g.save.veh.owned.includes(k)) g.save.veh.owned.push(k);
    g.applyOwned();
    if (this.mode !== 'criativo') this.inv.useHeld();
    this.burst(30, v.x, v.y + 1, v.z, '#ffd34a', 6);
    this.toast(t('mundo.vehReady', '{v} montado!', { v: VDEFS[k].name() }), 'good');
    audio.cash();
  }

  /* ============================ mão ============================ */

  private poseHandItem(): void {
    const g = this.g;
    const st = this.inv.held();
    const id = st?.id ?? '';
    const it = id ? ITEM.get(id) : undefined;
    // ferramentas com modelo 3D próprio: machado; o resto vira plaquinha com o ícone
    const useModel = !it || it.tool === 'axe';
    g.tool = useModel ? 0 : -1;
    for (let i = 0; i < g.tools.length; i++) g.tools[i].visible = useModel && !!it && i === 0 && g.driving < 0 && !g.held;
    if (useModel && it?.tool === 'axe') {
      // pinta o machado com a cor do nível
      const tc = TOOL_TIERS[(it.tier ?? 1) - 1]?.col;
      if (tc && this.lastHeld !== id) {
        g.tools[0].traverse((m) => {
          const mm = (m as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
          if (mm && (m as THREE.Mesh).isMesh && m.name !== 'handle' && mm.color && mm.color.getHex() !== 0x2a0b5c && mm.color.r > 0.6) mm.color.set(tc);
        });
      }
    }
    this.lastHeld = id;
    const show = !useModel && !!it && g.driving < 0 && !g.held;
    this.handMesh.visible = show;
    if (!show) return;
    if (this.handId !== id) {
      this.handId = id;
      let tx = this.handTex.get(id);
      if (!tx) {
        const img = new Image();
        img.src = iconURL(id);
        tx = new THREE.Texture(img);
        tx.colorSpace = THREE.SRGBColorSpace;
        img.onload = () => (tx!.needsUpdate = true);
        this.handTex.set(id, tx);
      }
      const m = this.handMesh.material as THREE.MeshBasicMaterial;
      m.map = tx;
      m.needsUpdate = true;
    }
    const s = g.swing;
    const arc = s > 0.6 ? (1 - s) / 0.4 : s / 0.6;
    const ax = Math.min(1, g.camera.aspect / 1.6);
    this.handMesh.position.set(0.12 + 0.24 * ax, -0.3 - arc * 0.08, -0.6);
    this.handMesh.rotation.set(-0.2 - arc * 0.9, -0.3, 0.2 + arc * 0.4);
  }

  /* ============================ save ============================ */

  toJSON(): Record<string, unknown> {
    const ext: Record<string, unknown> = {};
    this.bus.emit('save', ext);
    return {
      inv: this.inv.toJSON(),
      arm: this.inv.armor.toJSON(),
      sel: this.inv.sel,
      hp: Math.round(this.hp * 10) / 10,
      food: Math.round(this.food * 10) / 10,
      day: Math.round(this.dayT * 1000) / 1000,
      spawn: this.spawn,
      b: this.builds.toJSON(),
      carts: this.carts.toJSON(),
      blk: this.encodeBlocks(),
      ext,
    };
  }
  load(o: any): boolean {
    if (!o || typeof o !== 'object') return false;
    this.inv.load(o.inv);
    this.inv.armor.load(o.arm);
    this.inv.sel = Math.max(0, Math.min(HOTBAR - 1, +o.sel || 0));
    this.hp = Math.max(1, Math.min(this.maxHp, +o.hp || this.maxHp));
    this.food = Math.max(0, Math.min(20, +o.food || 20));
    this.dayT = typeof o.day === 'number' ? o.day % 1 : 0.3;
    this.spawn = Array.isArray(o.spawn) ? (o.spawn as [number, number, number]) : null;
    this.builds.load(o.b);
    this.carts.load(o.carts);
    if (o.blk) this.decodeBlocks(o.blk);
    if (o.ext) this.bus.emit('load', o.ext);
    this.hot.refresh();
    return true;
  }

  private encodeBlocks(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, c] of this.blocks.store.chunks) {
      const b = BlockStore.encode(c);
      if (!b) continue;
      let s = '';
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      out[k] = btoa(s);
    }
    return out;
  }
  private decodeBlocks(o: Record<string, string>): void {
    for (const k of Object.keys(o)) {
      const p = k.split(',').map(Number);
      if (p.length !== 3 || p.some((v) => !Number.isFinite(v))) continue;
      try {
        const s = atob(o[k]);
        const b = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
        this.blocks.loadChunk(p[0], p[1], p[2], b);
      } catch {
        /* */
      }
    }
  }

  dispose(): void {
    this.blocks.dispose();
    for (const e of this.ents) e.dispose(this);
    this.ents = [];
    this.builds.dispose();
    this.carts.dispose();
    this.hideGhost();
    this.scr?.el.remove();
    this.hot.destroy();
    this.g.scene.remove(this.stars);
    for (const tx of this.handTex.values()) tx.dispose();
  }
}
