/* ============================================================
 *  FESTA EM 3D: bolo na mesa, comidas para a guerra de comida,
 *  amigos (PartySession) ou amigos-robô locais como billboards 2D,
 *  emotes em balões, e faxina cooperativa depois.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import type { HomeDesign, MessItem, PartyEvent, PartyPeer, PartySession } from '../home/api';
import { SKINS, skinById } from '../game/skins';
import { drawPlayer } from '../game/character';
import { drawEmoteBubble, EMOTE_CODES, EMOTE_DURATION } from '../social/emotes';
import { gameFont } from '../i18n/font';
import { t } from '../i18n';
import { floorXYToLocal, localToFloorXY, ROOM_D, ROOM_W, WALL_T, type MessKind } from './adapter';
import { G, hashN, type DecalRec, type Engine, type RoomRec } from './engine';
import { buildCake, buildFood, FOOD_MESS, type FoodKind } from './models';
import { blobTexture, canvas, INK, splatTexture, track } from './textures';
import { sfx } from './sfx';
import type { MessItem3D } from './types';

export interface Food {
  kind: FoodKind;
  obj: THREE.Group;
  body: CANNON.Body | null;
  state: 'table' | 'held' | 'flying' | 'ghost';
  /** quem jogou (id) */
  by: string;
  life: number;
  /** projétil só visual (evento remoto): não cria sujeira */
  visual?: boolean;
  slot: number;
}
interface Mate {
  id: string;
  name: string;
  skin: string;
  bot: boolean;
  sprite: THREE.Sprite;
  shadow: THREE.Mesh;
  tag: THREE.Sprite;
  frost: THREE.Sprite;
  frostT: number;
  body: CANNON.Body | null;
  pos: THREE.Vector3;
  goal: THREE.Vector3;
  state: 'wander' | 'getFood' | 'aim' | 'clean' | 'idle';
  timer: number;
  holding: Food | null;
  emote: string;
  emoteT: number;
  bubble: THREE.Sprite | null;
  bubbleCx: CanvasRenderingContext2D | null;
  bubbleTex: THREE.CanvasTexture | null;
  cleanTarget: DecalRec | null;
  walk: number;
  room: string;
}

const FOOD_KINDS: FoodKind[] = ['pie', 'tomato', 'cupcake', 'juice', 'pie', 'cupcake'];
const BOT_NAMES = [
  ['home3d.bot.1', 'Bolinha'],
  ['home3d.bot.2', 'Pipoca'],
  ['home3d.bot.3', 'Faísca'],
];
const V = new THREE.Vector3();
type HomeItems = HomeDesign['rooms'][number]['items'];

export class Party {
  foods: Food[] = [];
  mates = new Map<string, Mate>();
  cake: { obj: THREE.Group; slices: number; pos: THREE.Vector3 } | null = null;
  room: RoomRec;
  tableTop = new THREE.Vector3();
  tableSize = new THREE.Vector2(1.2, 0.6);
  phase: 'fight' | 'clean' = 'fight';
  private texCache = new Map<string, THREE.Texture>();
  private owned: THREE.Material[] = [];
  private sendT = 0;
  private splatQueue: { f: Food; p: THREE.Vector3; n: THREE.Vector3 }[] = [];
  private foodMat: THREE.Material;
  private spawnT = 0;
  private hitMe = 0;
  /** chamado quando comida acerta o jogador (borrão na tela) */
  onHitMe?: (kind: MessKind) => void;
  onToast?: (s: string) => void;
  myId: string;
  private elapsed = 0;

  constructor(
    readonly eng: Engine,
    readonly session: PartySession | null,
    readonly active: boolean,
    myId: string,
    readonly mySkin: string,
  ) {
    this.myId = myId;
    this.room = eng.roomById('party') ?? eng.rooms[0];
    this.foodMat = eng.matSolid;
    if (active) this.setupTable();
    if (session) {
      session.onPeers((peers) => this.onPeers(peers));
      session.onEvent((e) => this.onEvent(e));
    } else if (active) {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const skin = SKINS[(3 + i * 7) % SKINS.length].id;
        const [k, pt] = BOT_NAMES[i];
        const m = this.addMate('bot' + i, t(k, pt), skin, true);
        const p = this.randomSpot();
        m.pos.copy(p);
        m.body?.position.set(p.x, 0.3, p.z);
      }
    }
    eng.onMessAdded = (m) => this.session?.event({ t: 'splat', mess: m });
    eng.onMessCleaned = (m) => this.session?.event({ t: 'clean', messId: m.id, by: this.myId });
  }

  /* ---------------- mesa, bolo, comidas ---------------- */
  private setupTable(): void {
    const eng = this.eng;
    let table = eng.items.find((i) => i.room === this.room && i.kind === 'partytable') ?? eng.items.find((i) => i.room === this.room && (i.kind === 'table' || i.kind === 'desk' || i.kind === 'counter'));
    if (!table) {
      const data = { id: 'partytable0', x: 180, y: 330 };
      this.room.design.items.push(data);
      table = eng.addItem(this.room, data);
      // mesa de festa provisória: não salva no design (visita)
      if (!eng.editable) this.room.design.items.pop();
    }
    this.tableTop.copy(table.homeP);
    this.tableTop.y = table.dims.h;
    const yaw = new THREE.Euler().setFromQuaternion(table.homeQ, 'YXZ').y;
    this.tableSize.set(table.dims.w, table.dims.d);
    this.tableYaw = yaw;
    const parts = buildCake(8, eng.q.seg);
    const cake = eng.makeObj(parts);
    cake.position.copy(this.tableTop);
    this.eng.scene.add(cake);
    cake.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.userData = { type: 'cake' };
        eng.pickables.push(o);
      }
    });
    this.cake = { obj: cake, slices: 8, pos: cake.position.clone() };
    for (let i = 0; i < 8; i++) this.spawnFood(i);
  }
  private tableYaw = 0;
  private slotPos(slot: number): THREE.Vector3 {
    const n = 8;
    const side = slot < n / 2 ? -1 : 1;
    const k = slot % (n / 2);
    const lx = (k / (n / 2 - 1) - 0.5) * (this.tableSize.x - 0.3);
    const lz = side * (this.tableSize.y / 2 - 0.14);
    return V.set(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.tableYaw).add(this.tableTop).clone();
  }
  private spawnFood(slot: number, kind?: FoodKind): Food {
    const k = kind ?? FOOD_KINDS[(slot + Math.floor(this.elapsed)) % FOOD_KINDS.length];
    const parts = buildFood(k, this.eng.q.seg);
    const obj = new THREE.Group();
    const m = new THREE.Mesh(parts.solid!, this.foodMat);
    m.castShadow = this.eng.q.shadows;
    obj.add(m);
    obj.position.copy(this.slotPos(slot));
    obj.scale.setScalar(0.01);
    this.eng.scene.add(obj);
    const f: Food = { kind: k, obj, body: null, state: 'table', by: '', life: 0, slot };
    m.userData = { type: 'food', food: f };
    this.eng.pickables.push(m);
    this.foods.push(f);
    return f;
  }
  tableFoods(): Food[] {
    return this.foods.filter((f) => f.state === 'table');
  }
  /** pega uma comida (jogador ou robô) */
  take(f: Food, by: string): Food {
    f.state = 'held';
    f.by = by;
    this.unpick(f);
    if (f.slot >= 0) {
      const slot = f.slot;
      f.slot = -1;
      setTimeout(() => {
        if (this.disposed) return;
        if (!this.foods.some((x) => x.slot === slot && x.state === 'table')) this.spawnFood(slot);
      }, 2500);
    }
    return f;
  }
  /** fatia do bolo vira comida na mão */
  takeSlice(by: string): Food | null {
    if (!this.cake || this.cake.slices <= 0) return null;
    this.setSlices(this.cake.slices - 1, true);
    const f = this.spawnFood(-1, 'cake');
    f.obj.scale.setScalar(1);
    return this.take(f, by);
  }
  eat(by: string): boolean {
    if (!this.cake || this.cake.slices <= 0) return false;
    this.setSlices(this.cake.slices - 1, true);
    this.session?.event({ t: 'eat', by, food: 'cake' });
    this.eng.burst(this.cake.pos.x, this.cake.pos.y + 0.3, this.cake.pos.z, 10, 'chunk', '#ffe0a3', 1.2);
    return true;
  }
  private setSlices(n: number, broadcast: boolean): void {
    if (!this.cake) return;
    this.cake.slices = n;
    const old = this.cake.obj;
    this.eng.pickables = this.eng.pickables.filter((o) => !old.children.includes(o));
    this.eng.scene.remove(old);
    if (n <= 0) {
      // bolo acabou: volta inteiro depois de um tempinho
      setTimeout(() => !this.disposed && this.setSlices(8, true), 9000);
    }
    const obj = this.eng.makeObj(buildCake(n, this.eng.q.seg));
    obj.position.copy(this.cake.pos);
    this.eng.scene.add(obj);
    obj.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.userData = { type: 'cake' };
        this.eng.pickables.push(o);
      }
    });
    this.cake.obj = obj;
    if (broadcast) this.session?.event({ t: 'cake', slices: n });
  }
  private unpick(f: Food): void {
    for (const c of f.obj.children) {
      const i = this.eng.pickables.indexOf(c);
      if (i >= 0) this.eng.pickables.splice(i, 1);
    }
  }
  /** lança a comida com física */
  launch(f: Food, from: THREE.Vector3, vel: THREE.Vector3, visual = false): void {
    f.state = 'flying';
    f.visual = visual;
    f.life = 0;
    f.obj.position.copy(from);
    f.obj.scale.setScalar(1);
    if (!f.obj.parent) this.eng.scene.add(f.obj);
    const b = new CANNON.Body({
      mass: 0.3,
      shape: new CANNON.Sphere(0.07),
      collisionFilterGroup: G.FOOD,
      collisionFilterMask: G.STATIC | G.ITEM,
      linearDamping: 0.01,
    });
    b.position.set(from.x, from.y, from.z);
    b.velocity.set(vel.x, vel.y, vel.z);
    b.angularVelocity.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    b.addEventListener('collide', (e: { contact: CANNON.ContactEquation; body: CANNON.Body }) => {
      if (f.state !== 'flying' || f.life < 0.03) return;
      const c = e.contact;
      const n = new THREE.Vector3(c.ni.x, c.ni.y, c.ni.z);
      if (c.bi === b) n.negate();
      const p = new THREE.Vector3(b.position.x, b.position.y, b.position.z).addScaledVector(n, -0.07);
      // bateu num móvel leve: empurra
      const other = e.body as CANNON.Body & { item?: unknown };
      if (other.type === CANNON.Body.DYNAMIC) other.wakeUp();
      this.splatQueue.push({ f, p, n });
    });
    this.eng.world.addBody(b);
    f.body = b;
    sfx.throw();
  }
  private splatFood(f: Food, p: THREE.Vector3, n: THREE.Vector3): void {
    if (f.state !== 'flying') return;
    this.removeFood(f);
    const kind = FOOD_MESS[f.kind] as MessKind;
    this.eng.burst(p.x, p.y, p.z, 12, 'chunk', splatColor(kind), 2);
    sfx.splat();
    if (!f.visual) this.eng.splatAt(kind, p, n, 22 + Math.random() * 10);
  }
  removeFood(f: Food): void {
    f.state = 'ghost';
    if (f.body) this.eng.world.removeBody(f.body);
    f.body = null;
    this.unpick(f);
    this.eng.scene.remove(f.obj);
    const i = this.foods.indexOf(f);
    if (i >= 0) this.foods.splice(i, 1);
  }

  /* ---------------- amigos (billboards) ---------------- */
  private skinTex(skin: string): THREE.Texture {
    let tx = this.texCache.get(skin);
    if (tx) return tx;
    const [cv, c] = canvas(160, 170);
    c.translate(80, 92);
    try {
      drawPlayer(c, skinById(skin), 56, { t: 0, blink: 0, lookX: 0, lookY: 0.2, sx: 1, sy: 1, mood: 'happy', lx: -0.5, ly: -0.7, still: true });
    } catch {
      c.fillStyle = '#ff7ad9';
      c.beginPath();
      c.arc(0, 0, 56, 0, 7);
      c.fill();
    }
    tx = track(new THREE.CanvasTexture(cv));
    tx.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(skin, tx);
    return tx;
  }
  private nameTex(name: string): THREE.Texture {
    const key = 'n:' + name;
    let tx = this.texCache.get(key);
    if (tx) return tx;
    const [cv, c] = canvas(256, 56);
    c.font = gameFont(700, 30);
    const w = Math.min(240, c.measureText(name).width + 28);
    c.fillStyle = 'rgba(42,11,92,0.8)';
    c.beginPath();
    c.roundRect(128 - w / 2, 6, w, 44, 22);
    c.fill();
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(name, 128, 29, 220);
    tx = track(new THREE.CanvasTexture(cv));
    tx.colorSpace = THREE.SRGBColorSpace;
    this.texCache.set(key, tx);
    return tx;
  }
  private addMate(id: string, name: string, skin: string, bot: boolean): Mate {
    const mat = new THREE.SpriteMaterial({ map: this.skinTex(skin), transparent: true, alphaTest: 0.1 });
    const tagMat = new THREE.SpriteMaterial({ map: this.nameTex(name), transparent: true, depthWrite: false });
    const frostMat = new THREE.SpriteMaterial({ map: splatTexture('frosting', hashN(id)), transparent: true, depthWrite: false, opacity: 0 });
    this.owned.push(mat, tagMat, frostMat);
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 0.85, 1);
    const tag = new THREE.Sprite(tagMat);
    tag.scale.set(0.5, 0.11, 1);
    const frost = new THREE.Sprite(frostMat);
    frost.scale.set(0.42, 0.42, 1);
    const shadow = new THREE.Mesh(this.eng.planeGeo, this.eng.matShadow);
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(0.6, 0.6, 1);
    this.eng.scene.add(sprite, tag, frost, shadow);
    let body: CANNON.Body | null = null;
    if (bot) {
      body = new CANNON.Body({ mass: 4, shape: new CANNON.Sphere(0.28), fixedRotation: true, collisionFilterGroup: G.BOT, collisionFilterMask: G.STATIC | G.ITEM | G.PLAYER | G.BOT, linearDamping: 0 });
      body.allowSleep = false;
      this.eng.world.addBody(body);
    }
    const m: Mate = {
      id, name, skin, bot, sprite, shadow, tag, frost, frostT: 0, body,
      pos: this.room.center.clone(), goal: this.room.center.clone(), state: 'wander', timer: 1 + Math.random() * 2,
      holding: null, emote: '', emoteT: 0, bubble: null, bubbleCx: null, bubbleTex: null, cleanTarget: null, walk: Math.random() * 6, room: this.room.id,
    };
    sprite.userData = { type: 'mate', mate: m };
    this.eng.pickables.push(sprite);
    this.mates.set(id, m);
    return m;
  }
  private removeMate(m: Mate): void {
    this.eng.scene.remove(m.sprite, m.tag, m.frost, m.shadow);
    if (m.bubble) this.eng.scene.remove(m.bubble);
    if (m.body) this.eng.world.removeBody(m.body);
    const i = this.eng.pickables.indexOf(m.sprite);
    if (i >= 0) this.eng.pickables.splice(i, 1);
    this.mates.delete(m.id);
  }
  emote(m: Mate, code: string): void {
    m.emote = code;
    m.emoteT = 0;
    if (!m.bubble) {
      const [cv, cx] = canvas(256, 128);
      const tex = track(new THREE.CanvasTexture(cv));
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false });
      this.owned.push(mat);
      m.bubble = new THREE.Sprite(mat);
      m.bubble.scale.set(0.9, 0.45, 1);
      m.bubble.renderOrder = 20;
      m.bubbleCx = cx;
      m.bubbleTex = tex;
      this.eng.scene.add(m.bubble);
    }
    m.bubble.visible = true;
  }
  private randomSpot(): THREE.Vector3 {
    const lx = WALL_T + 0.5 + Math.random() * (ROOM_W - 2 * WALL_T - 1),
      lz = WALL_T + 0.5 + Math.random() * (ROOM_D - 2 * WALL_T - 1);
    return this.room.group.localToWorld(new THREE.Vector3(lx, 0, lz));
  }

  /* ---------------- rede ---------------- */
  private onPeers(peers: PartyPeer[]): void {
    const seen = new Set<string>();
    for (const p of peers) {
      if (p.id === this.myId) continue;
      seen.add(p.id);
      let m = this.mates.get(p.id);
      if (!m) m = this.addMate(p.id, p.name || p.handle || '?', p.skin, false);
      const room = this.eng.roomById(p.room) ?? this.room;
      const loc = floorXYToLocal(p.x, p.y);
      m.goal.copy(room.group.localToWorld(new THREE.Vector3(loc.x, 0, loc.z)));
      m.room = room.id;
      if (p.emote && p.emote !== m.emote) this.emote(m, p.emote);
    }
    for (const m of [...this.mates.values()]) if (!m.bot && !seen.has(m.id)) this.removeMate(m);
  }
  private onEvent(e: PartyEvent): void {
    const x = e as PartyEvent & { p3?: number[]; v3?: number[] };
    const de = e as unknown as { t: string; by: string; room: string; items?: HomeItems; paint?: { wall: string; strokes?: string } };
    if (de.t === 'design') {
      if (de.by === this.myId) return;
      const r = this.eng.roomById(de.room);
      if (!r) return;
      if (de.items) {
        r.design.items = de.items;
        this.eng.rebuildRoomItems(r);
      }
      if (de.paint) {
        this.eng.design.paint = { ...(this.eng.design.paint ?? {}), [de.room]: de.paint };
        this.eng.reloadPaint(r);
      }
      this.onDesign?.(de.room);
      return;
    }
    switch (e.t) {
      case 'throw': {
        if (e.from === this.myId) return;
        const from = x.p3 ? new THREE.Vector3(x.p3[0], x.p3[1], x.p3[2]) : this.mates.get(e.from)?.pos.clone().setY(0.8) ?? this.room.center.clone().setY(1);
        let vel: THREE.Vector3;
        if (x.v3) vel = new THREE.Vector3(x.v3[0], x.v3[1], x.v3[2]);
        else {
          const dir = new THREE.Vector3(e.vx, 0, e.vy).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.room.rotY);
          vel = dir.normalize().multiplyScalar(6).setY(2.5);
        }
        const kind = (['pie', 'tomato', 'cupcake', 'juice', 'cake'] as FoodKind[]).includes(e.food as FoodKind) ? (e.food as FoodKind) : 'pie';
        const f = this.spawnFood(-1, kind);
        this.unpick(f);
        this.launch(f, from, vel, true);
        f.by = e.from;
        break;
      }
      case 'splat': {
        if (this.eng.decalById(e.mess.id)) return;
        this.eng.addDecal(e.mess as MessItem3D, true);
        break;
      }
      case 'clean': {
        const d = this.eng.decalById(e.messId);
        if (d) {
          this.eng.burst(d.mesh.position.x, d.mesh.position.y + 0.05, d.mesh.position.z, 10, 'spark', '#bff7ff', 1.4);
          this.eng.removeDecal(d, false);
        }
        break;
      }
      case 'eat': {
        const m = this.mates.get(e.by);
        if (m) this.emote(m, 'uau');
        break;
      }
      case 'cake':
        if (this.cake && e.slices !== this.cake.slices) this.setSlices(e.slices, false);
        break;
      case 'chat': {
        const m = this.mates.get(e.by);
        if (m) this.emote(m, e.code);
        break;
      }
    }
  }
  /** estado local → festa (~8 Hz) */
  sendState(pos: THREE.Vector3, holding: string | undefined, emote: string | undefined): void {
    if (!this.session) return;
    const room = this.eng.roomAt(pos.x, pos.z) ?? this.room;
    const loc = room.group.worldToLocal(pos.clone());
    const xy = localToFloorXY(loc.x, loc.z);
    this.session.send({ x: xy.x, y: xy.y, room: room.id, holding, emote });
  }
  /** co-decoração (mesmo evento do 2D: src/home/service.ts DesignEvent) */
  sendDesign(room: string, items: unknown[], paint?: { wall: string; strokes?: string }): void {
    if (!this.session) return;
    this.session.event({ t: 'design', by: this.myId, room, items, paint } as unknown as PartyEvent);
  }
  onDesign?: (room: string) => void;
  /** jogador local jogou comida */
  sendThrow(f: Food, from: THREE.Vector3, vel: THREE.Vector3): void {
    if (!this.session) return;
    const e = { t: 'throw' as const, from: this.myId, food: f.kind, x: 0, y: 0, vx: vel.x, vy: vel.z, p3: [from.x, from.y, from.z], v3: [vel.x, vel.y, vel.z] };
    this.session.event(e);
  }

  /* ---------------- laço ---------------- */
  update(dt: number, me: THREE.Vector3, camPos: THREE.Vector3, sendState: () => void): void {
    this.elapsed += dt;
    // fila de impactos (fora do passo da física)
    for (const s of this.splatQueue) this.splatFood(s.f, s.p, s.n);
    this.splatQueue.length = 0;
    // comida voando
    for (const f of [...this.foods]) {
      if (f.state === 'table') {
        if (f.obj.scale.x < 1) f.obj.scale.setScalar(Math.min(1, f.obj.scale.x + dt * 3));
        continue;
      }
      if (f.state !== 'flying' || !f.body) continue;
      f.life += dt;
      f.obj.position.set(f.body.position.x, f.body.position.y, f.body.position.z);
      f.obj.quaternion.set(f.body.quaternion.x, f.body.quaternion.y, f.body.quaternion.z, f.body.quaternion.w);
      if (f.life > 4) this.removeFood(f);
      // acertou alguém?
      for (const m of this.mates.values()) {
        if (f.by === m.id) continue;
        V.copy(m.pos).setY(0.45);
        if (f.obj.position.distanceToSquared(V) < 0.16) {
          m.frostT = 6;
          (m.frost.material as THREE.SpriteMaterial).map = splatTexture(FOOD_MESS[f.kind] as MessKind, hashN(m.id + f.life));
          this.emote(m, Math.random() < 0.5 ? 'rindo' : 'uau');
          this.eng.burst(V.x, V.y, V.z, 10, 'chunk', splatColor(FOOD_MESS[f.kind] as MessKind), 1.6);
          sfx.splat();
          this.removeFood(f);
          if (f.by === this.myId) this.onToast?.(t('home3d.party.hit', 'Na mosca!'));
          break;
        }
      }
      if (f.state === 'flying' && f.by !== this.myId && f.obj.position.distanceToSquared(camPos) < 0.3) {
        this.removeFood(f);
        this.hitMe = 0.4;
        sfx.splat();
        this.onHitMe?.(FOOD_MESS[f.kind] as MessKind);
      }
    }
    // amigos
    for (const m of this.mates.values()) this.updateMate(m, dt, me);
    // rede
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 0.125;
      sendState();
    }
    if (this.active && !this.session) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = 1;
        for (let s = 0; s < 8; s++) if (!this.foods.some((f) => f.slot === s)) this.spawnFood(s);
      }
    }
  }
  private updateMate(m: Mate, dt: number, me: THREE.Vector3): void {
    if (m.bot) this.botBrain(m, dt, me);
    if (m.body) {
      const dx = m.goal.x - m.body.position.x,
        dz = m.goal.z - m.body.position.z;
      const d = Math.hypot(dx, dz);
      const sp = m.state === 'clean' ? 1.6 : 1.9;
      const tvx = d > 0.15 ? (dx / d) * sp : 0,
        tvz = d > 0.15 ? (dz / d) * sp : 0;
      m.body.velocity.x += (tvx - m.body.velocity.x) * Math.min(1, dt * 8);
      m.body.velocity.z += (tvz - m.body.velocity.z) * Math.min(1, dt * 8);
      m.pos.set(m.body.position.x, 0, m.body.position.z);
    } else {
      m.pos.lerp(m.goal, Math.min(1, dt * 6));
    }
    const moving = m.body ? Math.hypot(m.body.velocity.x, m.body.velocity.z) > 0.3 : m.pos.distanceToSquared(m.goal) > 0.01;
    m.walk += dt * (moving ? 11 : 2.5);
    const hop = moving ? Math.abs(Math.sin(m.walk)) * 0.09 : Math.sin(m.walk) * 0.01;
    const sq = moving ? 1 + Math.sin(m.walk * 2) * 0.05 : 1 + Math.sin(m.walk) * 0.02;
    m.sprite.position.set(m.pos.x, 0.43 + hop, m.pos.z);
    m.sprite.scale.set(0.8 / sq, 0.85 * sq, 1);
    m.shadow.position.set(m.pos.x, 0.008, m.pos.z);
    m.shadow.scale.setScalar(0.62 - hop);
    m.tag.position.set(m.pos.x, 0.98 + hop, m.pos.z);
    m.frost.position.set(m.pos.x, 0.5 + hop, m.pos.z);
    if (m.frostT > 0) {
      m.frostT -= dt;
      (m.frost.material as THREE.SpriteMaterial).opacity = Math.min(1, m.frostT);
    }
    if (m.holding) {
      m.holding.obj.position.set(m.pos.x + 0.25, 0.55 + hop, m.pos.z);
    }
    if (m.bubble && m.bubbleCx && m.bubbleTex) {
      m.emoteT += dt;
      if (m.emoteT > EMOTE_DURATION) {
        m.bubble.visible = false;
        m.emote = '';
      } else {
        const c = m.bubbleCx;
        c.clearRect(0, 0, 256, 128);
        drawEmoteBubble(c, m.emote, 128, 120, 1.6, m.emoteT);
        m.bubbleTex.needsUpdate = true;
        m.bubble.position.set(m.pos.x, 1.3 + hop, m.pos.z);
      }
    }
  }
  private botBrain(m: Mate, dt: number, me: THREE.Vector3): void {
    m.timer -= dt;
    const near = (p: THREE.Vector3, r: number) => Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < r;
    if (this.phase === 'clean') {
      if (m.holding) (this.removeFood(m.holding), (m.holding = null));
      if (!m.cleanTarget || !this.eng.decals.includes(m.cleanTarget)) {
        // sujeira mais próxima (no chão) no mesmo cômodo
        let best: DecalRec | null = null,
          bd = 1e9;
        for (const d of this.eng.decals) {
          if (d.room !== this.room) continue;
          if ([...this.mates.values()].some((o) => o !== m && o.cleanTarget === d)) continue;
          const dd = d.mesh.position.distanceToSquared(m.pos);
          if (dd < bd) (bd = dd), (best = d);
        }
        m.cleanTarget = best;
        if (!best) {
          m.state = 'wander';
          if (m.timer <= 0) (m.goal.copy(this.randomSpot()), (m.timer = 2 + Math.random() * 2));
          return;
        }
      }
      m.state = 'clean';
      const d = m.cleanTarget!;
      m.goal.set(d.mesh.position.x, 0, d.mesh.position.z);
      if (near(d.mesh.position, 0.7)) {
        m.goal.copy(m.pos);
        d.dirt -= dt * 0.35;
        d.mat.opacity = Math.max(0, d.dirt);
        if (Math.random() < dt * 8) this.eng.burst(d.mesh.position.x, d.mesh.position.y + 0.05, d.mesh.position.z, 2, 'foam', '#ffffff', 0.5);
        if (d.dirt <= 0) {
          this.eng.burst(d.mesh.position.x, d.mesh.position.y + 0.1, d.mesh.position.z, 10, 'spark', '#bff7ff', 1.4);
          this.eng.removeDecal(d, false);
          this.session?.event({ t: 'clean', messId: d.m.id, by: m.id });
          m.cleanTarget = null;
          if (Math.random() < 0.4) this.emote(m, 'joinha');
        }
      }
      return;
    }
    switch (m.state) {
      case 'wander':
      case 'idle':
        if (m.timer <= 0) {
          if (!m.holding && Math.random() < 0.65 && this.tableFoods().length) {
            m.state = 'getFood';
            m.goal.copy(this.tableTop).setY(0);
            m.timer = 6;
          } else {
            m.goal.copy(this.randomSpot());
            m.timer = 1.5 + Math.random() * 2.5;
            if (Math.random() < 0.15) this.emote(m, EMOTE_CODES[Math.floor(Math.random() * EMOTE_CODES.length)]);
          }
        }
        break;
      case 'getFood': {
        const list = this.tableFoods();
        if (!list.length || m.timer <= 0) {
          m.state = 'wander';
          m.timer = 0.5;
          break;
        }
        // vai até o lado da mesa mais perto
        const f = list.reduce((a, b) => (a.obj.position.distanceToSquared(m.pos) < b.obj.position.distanceToSquared(m.pos) ? a : b));
        m.goal.set(f.obj.position.x, 0, f.obj.position.z);
        if (near(f.obj.position, 0.9)) {
          m.holding = this.take(f, m.id);
          m.state = 'aim';
          m.timer = 0.8 + Math.random() * 0.8;
          // escolhe alvo: jogador ou outro robô
          const others = [...this.mates.values()].filter((o) => o !== m);
          m.cleanTarget = null;
          (m as Mate & { aimAt?: THREE.Vector3 | Mate }).aimAt = Math.random() < 0.55 || !others.length ? me : others[Math.floor(Math.random() * others.length)];
          m.goal.copy(this.randomSpot());
        }
        break;
      }
      case 'aim': {
        if (m.timer <= 0 && m.holding) {
          const tgt = (m as Mate & { aimAt?: THREE.Vector3 | Mate }).aimAt;
          const tp = tgt instanceof THREE.Vector3 ? tgt.clone().setY(0.95) : (tgt?.pos.clone().setY(0.45) ?? me.clone());
          const from = m.pos.clone().setY(0.7);
          const T = 0.75;
          const vel = new THREE.Vector3((tp.x - from.x) / T + (Math.random() - 0.5) * 0.8, (tp.y - from.y + 0.5 * 14 * T * T) / T, (tp.z - from.z) / T + (Math.random() - 0.5) * 0.8);
          const f = m.holding;
          m.holding = null;
          this.launch(f, from, vel, !!this.session);
          f.by = m.id;
          m.state = 'wander';
          m.timer = 1 + Math.random() * 2;
        }
        break;
      }
    }
  }
  setPhase(p: 'fight' | 'clean'): void {
    this.phase = p;
    for (const m of this.mates.values()) {
      m.state = 'wander';
      m.timer = Math.random();
      if (p === 'clean') this.emote(m, 'vamos');
    }
  }
  hitFlash(): number {
    return this.hitMe;
  }
  private disposed = false;
  dispose(): void {
    this.disposed = true;
    this.session?.leave();
    for (const m of this.owned) m.dispose();
    for (const m of [...this.mates.values()]) this.removeMate(m);
  }
}
export function splatColor(k: MessKind): string {
  return k === 'tomato' ? '#ff5c4a' : k === 'juice' ? '#ff8a3d' : k === 'pie' ? '#c46bff' : k === 'frosting' ? '#ffb3c7' : k === 'mud' ? '#8a5a3c' : '#ffe0a3';
}
export { blobTexture, INK };
export type { MessItem };
