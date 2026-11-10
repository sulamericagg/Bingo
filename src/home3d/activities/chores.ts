/* ============================================================
 *  CASA 3D · ATIVIDADES — TAREFAS
 *  Regar plantas (com sede 1×/dia; regar demais = poça), arrumar a cama
 *  (e dormir), roupa suja → máquina de lavar (ela chacoalha e anda!) →
 *  roupa limpa → guardar no guarda-roupa. Lixo e louça ficam na cozinha.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../i18n';
import { sfx } from '../sfx';
import type { ItemRec } from '../engine';
import type { ActDef } from '../ui';
import { hitBox, itemHit, v3, type Ctx, type Spot } from './core';
import { clothGeo, messySheetGeo, washerGeo } from './models';
import type { Prop } from './props';
import { Fixture, freeSpot, Rig } from './spots';
import { AS, bump, saveAct, today } from './store';

const V = new THREE.Vector3();
const UPN = new THREE.Vector3(0, 1, 0);
const CLOTH_COLS = ['#3fa0ff', '#ff5c7a', '#ffc93d', '#4fd67a', '#c46bff'];

class Plant {
  key: string;
  drop: THREE.Mesh;
  water = 0;
  over = 0;
  spot: Spot;
  constructor(
    readonly c: Chores,
    readonly item: ItemRec,
  ) {
    this.key = item.room.id + '#' + item.room.design.items.indexOf(item.data);
    this.drop = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: '#46d9e6', toneMapped: false }));
    this.drop.scale.set(1, 1.35, 1);
    c.ctx.eng.scene.add(this.drop);
    this.spot = {
      id: 'plant',
      hit: (_r, tg) => itemHit(item, tg),
      label: () => (item.kind === 'cactus' ? t('home3d.furn.cactus', 'Cacto') : t('home3d.furn.plant', 'Planta')) + ' · ' + (this.thirsty ? t('act.lbl.thirsty', 'com sede') : t('act.lbl.happy', 'feliz')),
      acts: (h) => (h || item.state === 'broken' ? [] : [{ id: 'c-water', label: t('act.btn.water', 'REGAR'), icon: 'drop', size: 'big', hold: true }]),
      hold: (id, dt) => id === 'c-water' && this.pour(dt),
    };
  }
  get thirsty(): boolean {
    return AS.plants[this.key] !== today();
  }
  private pour(dt: number): void {
    const ctx = this.c.ctx;
    ctx.pose('grab');
    const cam = ctx.eng.camera;
    const top = V.copy(this.item.obj.position).setY(this.item.obj.position.y + this.item.dims.h * 0.9);
    if (Math.random() < dt * 30) {
      const o = cam.position.clone().add(cam.getWorldDirection(new THREE.Vector3()).multiplyScalar(0.35)).add(v3(0, -0.1, 0));
      const dir = top.clone().sub(o);
      const tt = 0.45;
      ctx.eng.emit(o.x, o.y, o.z, dir.x / tt, dir.y / tt + 9 * tt * 0.5, dir.z / tt, { tile: 0, color: '#6fd0ff', life: tt + 0.05, size: 0.03, grav: 9 });
    }
    if (Math.random() < dt * 4) sfx.bubble();
    if (this.thirsty) {
      this.water += dt;
      if (this.water > 1.4) {
        AS.plants[this.key] = today();
        saveAct();
        this.water = 0;
        this.over = 0;
        ctx.eng.burst(top.x, top.y, top.z, 14, 'spark', '#9dff7a', 1.4);
        sfx.sparkle();
        const got = ctx.coin(1);
        ctx.ui.hint(t('act.hint.watered', 'Plantinha feliz!') + (got ? ' +' + got : ''), 1500);
      }
    } else {
      this.over += dt;
      if (this.over > 2.5) {
        this.over = 0;
        ctx.props.splat('juice', this.item.obj.position.clone().add(v3(0.25, 0.01, 0.25)), UPN, 24);
        ctx.ui.hint(t('act.hint.drowned', 'Afogou a planta! Virou poça'), 1800, 1);
      }
    }
  }
  update(time: number): void {
    const vis = this.thirsty && this.item.obj.visible && this.item.state !== 'broken';
    this.drop.visible = vis;
    if (vis) this.drop.position.copy(this.item.obj.position).setY(this.item.obj.position.y + this.item.dims.h + 0.15 + Math.sin(time * 3 + this.item.homeP.x) * 0.04);
  }
  dispose(): void {
    this.c.ctx.eng.scene.remove(this.drop);
    this.drop.geometry.dispose();
    (this.drop.material as THREE.Material).dispose();
  }
}

class Bed {
  rig: Rig;
  sheet: THREE.Mesh;
  messy: boolean;
  private make = 0;
  spot: Spot;
  constructor(
    readonly c: Chores,
    readonly item: ItemRec,
  ) {
    this.rig = new Rig(c.ctx.eng, item);
    this.messy = AS.bedDay !== today();
    this.sheet = new THREE.Mesh(messySheetGeo(this.rig.w, this.rig.d, '#ffffff'), c.mat);
    this.sheet.position.set(0, item.kind === 'bunk' ? 0.5 : 0.5, 0.15);
    this.sheet.visible = this.messy;
    this.rig.root.add(this.sheet);
    this.spot = {
      id: 'bed',
      hit: (_r, tg) => itemHit(item, tg),
      label: () => t('home3d.furn.bed', 'Cama') + ' · ' + (this.messy ? t('act.lbl.messy', 'bagunçada') : t('act.lbl.neat', 'arrumada')),
      acts: (h) => {
        if (h) return [];
        const L: ActDef[] = [];
        if (this.messy) L.push({ id: 'c-bed', label: t('act.btn.makeBed', 'ARRUMAR CAMA'), icon: 'fix', size: 'big', hold: true });
        L.push({ id: 'c-sleep', label: t('act.btn.sleep', 'DORMIR'), icon: 'eye', size: L.length ? 'small' : 'big' });
        return L;
      },
      tap: (id) => (id === 'c-sleep' ? (this.sleep(), true) : false),
      hold: (id, dt) => id === 'c-bed' && this.makeStep(dt),
    };
  }
  private makeStep(dt: number): void {
    const ctx = this.c.ctx;
    ctx.pose('grab');
    ctx.fps.hand.scrub = 1;
    this.make += dt;
    this.sheet.scale.set(1, Math.max(0.2, 1 - this.make / 1.6), 1);
    if (Math.random() < dt * 6) sfx.whoosh();
    if (this.make >= 1.6) {
      this.make = 0;
      this.messy = false;
      this.sheet.visible = false;
      this.sheet.scale.set(1, 1, 1);
      const p = this.rig.world(0, 0.7, 0, V);
      ctx.eng.burst(p.x, p.y, p.z, 18, 'spark', '#ffe27a', 1.6);
      sfx.fix();
      let got = 0;
      if (AS.bedDay !== today()) {
        AS.bedDay = today();
        saveAct();
        got = ctx.coin(2);
      }
      ctx.ui.hint(t('act.hint.bedMade', 'Cama arrumadinha!') + (got ? ' +' + got : ''), 1500);
    }
  }
  private sleep(): void {
    const ctx = this.c.ctx;
    sfx.click();
    void ctx.ui.fade(t('act.sleep', 'Zzz... zzz...'), 2000).then(() => {
      bump('energy', 100);
      this.messy = true;
      this.sheet.visible = true;
      ctx.ui.hint(t('act.hint.slept', 'Que soneca! (a cama ficou bagunçada)'), 2200);
    });
  }
  update(): void {
    this.rig.follow();
  }
  dispose(): void {
    this.rig.dispose();
  }
}

class Washer {
  fx: Fixture;
  home: THREE.Vector3;
  load: Prop[] = [];
  run = 0;
  private drum: THREE.Mesh;
  spot: Spot;
  constructor(
    readonly c: Chores,
    fx: Fixture,
  ) {
    this.fx = fx;
    this.home = fx.root.position.clone();
    fx.root.add(new THREE.Mesh(washerGeo(), c.mat));
    this.drum = new THREE.Mesh(clothGeo(1, '#ff5c7a'), c.mat);
    this.drum.position.set(0, 0.4, 0.27);
    this.drum.rotation.x = Math.PI / 2;
    this.drum.scale.setScalar(0.8);
    this.drum.visible = false;
    fx.root.add(this.drum);
    const min = v3(-0.32, 0, -0.31),
      max = v3(0.32, 0.88, 0.32);
    this.spot = {
      id: 'washer',
      hit: (ray) => hitBox(ray, fx.root, min, max),
      label: () => t('act.lbl.washer', 'Máquina de lavar') + (this.run > 0 ? ' · ' + t('act.lbl.washing', 'lavando...') : this.load.length ? ' · ' + t('act.lbl.items', '{n} coisas', { n: this.load.length }) : ''),
      acts: (h) => (!h && this.load.length && this.run <= 0 ? [{ id: 'c-wash', label: t('act.btn.laundry', 'LAVAR ROUPA'), icon: 'rotate', size: 'big' }] : []),
      tap: (id) => (id === 'c-wash' ? (this.start(), true) : false),
      place: (p) => (p.kind === 'cloth' && !p.cloth?.clean && this.run <= 0 ? fx.world(0, 1.05, 0) : null),
      placeLabel: () => t('act.btn.inWasher', 'NA MÁQUINA'),
    };
  }
  private start(): void {
    this.run = 7;
    this.drum.visible = true;
    sfx.click();
    this.c.ctx.ui.hint(t('act.hint.washing', 'Tchuca-tchuca... (a máquina tá dançando!)'), 2000);
  }
  update(dt: number): void {
    const ctx = this.c.ctx;
    const c = this.fx.root.position;
    // roupa que cai por cima entra
    if (this.run <= 0)
      for (const p of ctx.props.list) {
        if (p.held || p.hidden || p.kind !== 'cloth' || p.cloth?.clean) continue;
        const o = p.obj.position;
        if (o.y > 0.8 && o.y < 1.4 && Math.hypot(o.x - c.x, o.z - c.z) < 0.35) {
          ctx.props.hide(p);
          this.load.push(p);
          sfx.drop();
          break;
        }
      }
    if (this.run > 0) {
      this.run -= dt;
      this.drum.rotation.z += dt * 18;
      // chacoalha e anda um pouquinho (caos controlado)
      const r = this.fx.root;
      r.position.x = this.home.x + Math.sin(ctx.eng.time * 37) * 0.012 + Math.sin(ctx.eng.time * 0.9) * 0.05;
      r.position.z = this.home.z + Math.cos(ctx.eng.time * 1.3) * 0.05;
      r.updateMatrixWorld(true);
      this.fx.body?.position.set(r.position.x, r.position.y, r.position.z);
      if (Math.random() < dt * 10) ctx.eng.burst(r.position.x + (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.6, r.position.z, 1, 'foam', '#ffffff', 0.6);
      if (Math.random() < dt * 5) sfx.bump();
      if (this.run <= 0) {
        this.drum.visible = false;
        r.position.copy(this.home);
        r.updateMatrixWorld(true);
        this.fx.body?.position.set(this.home.x, this.home.y, this.home.z);
        const n = Math.max(1, Math.ceil(this.load.length / 2));
        const cols = this.load.map((p) => p.cloth?.col ?? '#3fa0ff');
        for (const p of this.load) ctx.props.remove(p);
        this.load = [];
        for (let i = 0; i < n; i++) ctx.props.spawn('cloth', { cloth: 2, col: cols[i % cols.length] }, this.fx.world(0, 1.0 + i * 0.1, 0.25), this.fx.world(0, 0, 1.3).sub(this.fx.root.position).setY(1.5));
        sfx.catch();
        ctx.ui.hint(t('act.hint.laundryDone', 'Roupa limpinha! Guarde no guarda-roupa'), 2200, 1);
      }
    }
  }
  dispose(): void {
    for (const p of this.load) this.c.ctx.props.remove(p);
    this.fx.dispose();
  }
}

export class Chores {
  readonly mat: THREE.Material;
  plants: Plant[] = [];
  beds: Bed[] = [];
  washer: Washer | null = null;
  private wardrobes: { item: ItemRec; spot: Spot }[] = [];
  private tables: { item: ItemRec; spot: Spot }[] = [];
  private messT = 20;
  constructor(readonly ctx: Ctx) {
    this.mat = ctx.props.newMat();
    this.refresh(true);
  }
  refresh(first = false): void {
    const ctx = this.ctx;
    for (const p of [...this.plants]) if (!ctx.eng.items.includes(p.item)) (p.dispose(), this.plants.splice(this.plants.indexOf(p), 1));
    for (const it of ctx.items(['plant', 'cactus'])) if (!this.plants.some((p) => p.item === it)) this.plants.push(new Plant(this, it));
    for (const b of [...this.beds]) if (!b.rig.alive) (b.dispose(), this.beds.splice(this.beds.indexOf(b), 1));
    for (const it of ctx.items(['bed', 'bunk'])) if (!this.beds.some((b) => b.item === it)) this.beds.push(new Bed(this, it));
    this.wardrobes = this.wardrobes.filter((w) => ctx.eng.items.includes(w.item));
    for (const it of ctx.items(['wardrobe', 'toybox', 'bookcase'])) if (!this.wardrobes.some((w) => w.item === it)) this.wardrobes.push({ item: it, spot: this.wardrobeSpot(it) });
    this.tables = this.tables.filter((w) => ctx.eng.items.includes(w.item));
    for (const it of ctx.items(['table', 'partytable', 'desk', 'counter', 'stool'])) if (!this.tables.some((w) => w.item === it)) this.tables.push({ item: it, spot: this.tableSpot(it) });
    if (first) {
      const room = ctx.eng.roomById('bath') ?? ctx.eng.roomById('bedroom');
      const near = ctx.items(['bathtub', 'toilet', 'wardrobe']).find((i) => i.room === room)?.obj.position;
      const sp = room ? freeSpot(ctx.eng, room, 0.62, 0.6, near) : null;
      if (sp && room) this.washer = new Washer(this, new Fixture(ctx.eng, room, sp.p, sp.yaw, { w: 0.62, d: 0.6, h: 0.85 }));
      // roupa suja do dia espalhada no quarto
      if (AS.clothesDay !== today()) {
        AS.clothesDay = today();
        saveAct();
        const br = ctx.eng.roomById('bedroom') ?? ctx.eng.rooms[0];
        for (let i = 0; i < 3; i++) {
          const p = br.group.localToWorld(v3(1.2 + Math.random() * 3.5, 0.3 + i * 0.1, 2.8 + Math.random() * 1.3));
          ctx.props.spawn('cloth', { cloth: i % 2, col: CLOTH_COLS[(today() + i) % CLOTH_COLS.length] }, p);
        }
      }
    }
  }
  private wardrobeSpot(item: ItemRec): Spot {
    return {
      id: 'wardrobe',
      hit: (_r, tg) => itemHit(item, tg),
      label: () => t('home3d.furn.' + item.kind, item.info.name),
      acts: () => [],
      place: (p) => (p.kind === 'cloth' || p.kind === 'ing' ? item.obj.position.clone().setY(1) : null),
      placeLabel: () => t('act.btn.putAway', 'GUARDAR'),
    };
  }
  /** pôr a mesa: solta em cima do tampo onde a mira aponta */
  private tableSpot(item: ItemRec): Spot {
    const pt = new THREE.Vector3();
    return {
      id: 'table',
      hit: (_r, tg) => {
        const d = itemHit(item, tg);
        if (d !== null) pt.copy(tg.point);
        return d;
      },
      label: () => t('home3d.furn.' + item.kind, item.info.name),
      acts: () => [],
      place: () => {
        const l = item.obj.worldToLocal(pt.clone());
        l.x = Math.max(-item.dims.w / 2 + 0.15, Math.min(item.dims.w / 2 - 0.15, l.x));
        l.z = Math.max(-item.dims.d / 2 + 0.15, Math.min(item.dims.d / 2 - 0.15, l.z));
        l.y = item.dims.h + 0.06;
        return item.obj.localToWorld(l);
      },
      placeLabel: () => t('act.btn.onTable', 'NA MESA'),
    };
  }
  /** GUARDAR no guarda-roupa */
  putAway(p: Prop): boolean {
    const ctx = this.ctx;
    if (p.kind === 'cloth' && p.cloth?.clean) {
      ctx.props.remove(p, true);
      sfx.sparkle();
      const got = ctx.coin(2);
      bump('hyg', 4);
      ctx.ui.hint(t('act.hint.putAway', 'Roupa guardada!') + (got ? ' +' + got : ''), 1400);
      return true;
    }
    if (p.kind === 'cloth') ctx.ui.hint(t('act.hint.dirtyCloth', 'Eca, tá sujo! Lave na máquina primeiro'), 1800);
    else ctx.ui.hint(t('act.hint.wrongPlace', 'Isso não vai aí... ou vai? (não vai)'), 1600);
    sfx.boing();
    return false;
  }
  get spots(): Spot[] {
    const L: Spot[] = [];
    for (const p of this.plants) L.push(p.spot);
    for (const b of this.beds) L.push(b.spot);
    if (this.washer) L.push(this.washer.spot);
    for (const w of this.wardrobes) L.push(w.spot);
    for (const w of this.tables) L.push(w.spot);
    return L;
  }
  update(dt: number): void {
    const time = this.ctx.eng.time;
    for (const p of this.plants) p.update(time);
    for (const b of this.beds) b.update();
    this.washer?.update(dt);
    // lembrete discreto de sujeira no cômodo atual
    this.messT -= dt;
    if (this.messT <= 0) {
      this.messT = 40;
      const cam = this.ctx.eng.camera.position;
      const room = this.ctx.eng.roomAt(cam.x, cam.z);
      const n = this.ctx.eng.decals.filter((d) => d.room === room).length;
      if (n >= 3) this.ctx.ui.hint(t('act.hint.mess', 'Tem {n} sujeiras aqui — ferramenta Limpar!', { n }), 2600);
    }
  }
  dispose(): void {
    for (const p of this.plants) p.dispose();
    for (const b of this.beds) b.dispose();
    this.washer?.dispose();
  }
}
