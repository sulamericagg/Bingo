/* ============================================================
 *  PRIMEIRA PESSOA: andar (joystick/WASD), olhar (arrastar), mão 2D,
 *  mira central + botões grandes: PEGAR / JOGAR / CHUTAR / QUEBRAR /
 *  LIMPAR / ARRUMAR / COMER / PINTAR / MOVER (decorar com a mão).
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { t } from '../i18n';
import { canUse, itemColor, KINDS, newMessId, parsePaintSpec, placeToXY, ROOM_D, ROOM_W, WALL_T, type MessKind } from './adapter';
import { G, type DecalRec, type Engine, type ItemRec, type RoomRec, type WallRec } from './engine';
import { Hand, type HandColors } from './hand';
import { splatColor, type Food, type Party } from './party';
import { sfx } from './sfx';
import { Actions, FpsInput, type ActDef } from './ui';
import type { MessItem3D } from './types';

export type FpsTool = 'hand' | 'clean' | 'paint' | 'decor';
export interface Target {
  type: 'item' | 'decal' | 'food' | 'cake' | 'wall' | 'mate' | 'floor' | 'none';
  item?: ItemRec;
  decal?: DecalRec;
  food?: Food;
  wall?: WallRec;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  uv?: THREE.Vector2;
  dist: number;
}
const EYE = 1.02;
const RAD = 0.27;
const SPEED = 2.7;
const UP = new THREE.Vector3(0, 1, 0);
const V = new THREE.Vector3();
const V2 = new THREE.Vector3();
const AIM_M = new THREE.Matrix4();
const AIM_R = new THREE.Ray();
const AIM_B = new THREE.Box3();
const AIM_P = new THREE.Vector3();

export class Fps {
  yaw = 0;
  pitch = -0.08;
  body: CANNON.Body;
  hand: Hand;
  tool: FpsTool = 'hand';
  held: { item?: ItemRec; food?: Food } | null = null;
  target: Target = { type: 'none', point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 99 };
  /** tinta no formato do 2D: '<corIdx>:<acabamento>' */
  paintColor = '12:solid';
  private ray = new THREE.Raycaster();
  private vel = new THREE.Vector2();
  private bob = 0;
  private stepT = 0;
  private fxT = 0;
  private paintT = 0;
  private decorRot = 0;
  private decorValid = true;
  private lastLook: [number, number] = [0, 0];
  active = true;
  /** callbacks para a sessão */
  onToast?: (s: string) => void;
  onProgress?: (room: RoomRec | null, p: number) => void;
  onLabel?: (s: string) => void;
  onCleaned?: (n: number) => void;

  constructor(
    readonly eng: Engine,
    readonly input: FpsInput,
    readonly acts: Actions,
    readonly party: Party | null,
    colors: HandColors,
  ) {
    const playerMat = new CANNON.Material('player');
    eng.world.addContactMaterial(new CANNON.ContactMaterial(playerMat, eng.bodyMat, { friction: 0, restitution: 0 }));
    this.body = new CANNON.Body({
      mass: 6,
      shape: new CANNON.Sphere(RAD),
      fixedRotation: true,
      material: playerMat,
      collisionFilterGroup: G.PLAYER,
      collisionFilterMask: G.STATIC | G.ITEM | G.BOT,
      linearDamping: 0,
    });
    this.body.allowSleep = false;
    eng.world.addBody(this.body);
    eng.scene.add(eng.camera);
    this.hand = new Hand(eng.camera, colors);
    this.ray.far = 3.2;
    acts.onTap = (id) => this.tap(id);
  }

  spawn(room: RoomRec): void {
    // lugar livre mais perto da frente do cômodo
    let best = new THREE.Vector3(ROOM_W / 2, 0, ROOM_D - 1),
      bs = -1e9;
    const items = this.eng.items.filter((i) => i.room === room && !i.info.wall && !i.info.flat && !i.info.ceil);
    for (let x = 0.7; x <= ROOM_W - 0.7; x += 0.35)
      for (let z = 1.2; z <= ROOM_D - 0.5; z += 0.3) {
        const w = room.group.localToWorld(new THREE.Vector3(x, 0, z));
        let clear = 9;
        for (const it of items) {
          const d = Math.hypot(it.homeP.x - w.x, it.homeP.z - w.z) - Math.max(it.dims.w, it.dims.d) / 2;
          clear = Math.min(clear, d);
        }
        const score = Math.min(clear, 0.9) * 4 + z * 0.4 - Math.abs(x - ROOM_W / 2) * 0.3;
        if (score > bs) (bs = score), best.set(x, 0, z);
      }
    const p = room.group.localToWorld(best);
    this.body.position.set(p.x, RAD + 0.02, p.z);
    this.body.velocity.setZero();
    const c = room.center;
    this.yaw = Math.atan2(-(c.x - p.x), -(c.z - p.z));
    if (Math.hypot(c.x - p.x, c.z - p.z) < 0.5) this.yaw = room.rotY;
    this.pitch = -0.12;
  }
  get pos(): THREE.Vector3 {
    return V2.set(this.body.position.x, 0, this.body.position.z);
  }
  setActive(on: boolean): void {
    this.active = on;
    this.hand.visible = on;
    this.input.show(on);
    if (!on) this.drop(false);
  }
  setTool(tl: FpsTool): void {
    if (this.held && tl !== 'hand' && tl !== 'decor') this.drop(false);
    this.tool = tl;
    this.updatePose();
  }
  private updatePose(): void {
    const tl = this.tool;
    if (tl === 'paint') this.hand.setPose('roller', parsePaintSpec(this.paintColor)?.col ?? '#ff9ad5');
    else if (tl === 'clean') this.hand.setPose(this.target.decal?.vacuum ? 'vacuum' : 'sponge');
    else if (tl === 'decor') this.hand.setPose(this.held ? 'grab' : 'build');
    else this.hand.setPose(this.held ? 'grab' : 'open');
  }

  /* ---------------- mira ---------------- */
  private aim(): void {
    const cam = this.eng.camera;
    this.ray.setFromCamera(new THREE.Vector2(0, 0), cam);
    const hits = this.ray.intersectObjects(this.eng.pickables, false);
    const tg = this.target;
    tg.type = 'none';
    tg.item = tg.decal = tg.food = tg.wall = undefined;
    tg.dist = 99;
    for (const h of hits) {
      const ud = h.object.userData;
      if (!ud?.type) continue;
      if (this.held?.item && ud.item === this.held.item) continue;
      if (this.held?.food && ud.food === this.held.food) continue;
      if (ud.type === 'item' && (ud.item as ItemRec).info.flat) {
        // tapete: deixa passar para sujeira por cima
        continue;
      }
      // sujeira tem prioridade se estiver quase no mesmo ponto
      tg.type = ud.type;
      tg.item = ud.item;
      tg.decal = ud.decal;
      tg.food = ud.food;
      tg.wall = ud.wall;
      tg.point.copy(h.point);
      tg.dist = h.distance;
      if (h.face) tg.normal.copy(h.face.normal).transformDirection(h.object.matrixWorld);
      tg.uv = h.uv?.clone();
      if (ud.type === 'wall') {
        // procura decal logo atrás/à frente na parede
        const dh = hits.find((x) => x.object.userData?.type === 'decal' && Math.abs(x.distance - h.distance) < 0.06);
        if (dh) {
          tg.type = 'decal';
          tg.decal = dh.object.userData.decal;
        }
      }
      break;
    }
    // sujeira no chão: o raio do chão não é "pickable"; testa decals perto do chão
    if (tg.type === 'none' || tg.type === 'wall') {
      const dh = hits.find((x) => x.object.userData?.type === 'decal');
      if (dh && (tg.type === 'none' || dh.distance < tg.dist + 0.05)) {
        tg.type = 'decal';
        tg.decal = dh.object.userData.decal;
        tg.point.copy(dh.point);
        tg.dist = dh.distance;
      }
    }
    if (tg.type === 'mate') tg.type = 'none';
    // mira assistida: caixa do móvel inteira conta (pernas finas, vãos de cadeira)
    if (tg.type === 'none' || tg.type === 'wall') {
      const ray = this.ray.ray;
      let best: ItemRec | null = null,
        bd = Math.min(tg.dist, 2.6);
      for (const it of this.eng.items) {
        if (it.info.flat || it.info.wall || it === this.held?.item || !it.obj.visible) continue;
        if (it.obj.position.distanceToSquared(this.eng.camera.position) > 12) continue;
        AIM_M.copy(it.obj.matrixWorld).invert();
        AIM_R.copy(ray).applyMatrix4(AIM_M);
        AIM_B.min.set(-it.dims.w / 2, 0, -it.dims.d / 2);
        AIM_B.max.set(it.dims.w / 2, it.dims.h, it.dims.d / 2);
        if (AIM_R.intersectBox(AIM_B, AIM_P)) {
          AIM_P.applyMatrix4(it.obj.matrixWorld);
          const d = AIM_P.distanceTo(ray.origin);
          if (d < bd) (bd = d), (best = it);
        }
      }
      if (best) {
        tg.type = 'item';
        tg.item = best;
        tg.wall = undefined;
        tg.dist = bd;
        tg.point.copy(ray.origin).addScaledVector(ray.direction, bd);
      }
    }
  }

  /* ---------------- botões ---------------- */
  private buttons(): ActDef[] {
    const tg = this.target;
    const role = this.eng.role;
    const L: ActDef[] = [];
    const it = tg.item;
    if (this.tool === 'paint') {
      L.push({ id: 'paint', label: t('home3d.act.paint', 'PINTAR'), icon: 'paint', size: 'big', hold: true });
      return L;
    }
    if (this.tool === 'decor') {
      if (this.held?.item) {
        L.push({ id: 'place', label: t('home3d.act.place', 'COLOCAR'), icon: 'check', size: 'big' });
        L.push({ id: 'rot', label: t('home3d.act.rotate', 'GIRAR'), icon: 'rotate' });
        L.push({ id: 'cancel', label: t('home3d.act.cancel', 'VOLTAR'), icon: 'exit', size: 'small' });
      } else if (it && !it.info.wall && !it.info.ceil && it.state !== 'broken') L.push({ id: 'move', label: t('home3d.act.move', 'MOVER'), icon: 'grab', size: 'big' });
      return L;
    }
    if (this.held) {
      L.push({ id: 'throw', label: t('home3d.act.throw', 'JOGAR'), icon: 'throw', size: 'big' });
      L.push({ id: 'drop', label: t('home3d.act.drop', 'SOLTAR'), icon: 'drop', size: 'small' });
      return L;
    }
    if (tg.type === 'decal' && canUse(role, 'clean')) {
      L.push({ id: 'clean', label: t('home3d.act.clean', 'LIMPAR'), icon: 'clean', size: 'big', hold: true });
      return L;
    }
    if (this.tool === 'clean') {
      if (it && (it.state === 'moved' || it.state === 'broken') && canUse(role, 'clean')) L.push({ id: 'fix', label: t('home3d.act.fix', 'ARRUMAR'), icon: 'fix', size: 'big' });
      else L.push({ id: 'clean', label: t('home3d.act.clean', 'LIMPAR'), icon: 'clean', size: 'big', hold: true });
      return L;
    }
    if (tg.type === 'food') L.push({ id: 'pick', label: t('home3d.act.pick', 'PEGAR'), icon: 'grab', size: 'big' });
    else if (tg.type === 'cake') {
      L.push({ id: 'eat', label: t('home3d.act.eat', 'COMER'), icon: 'eat', size: 'big' });
      L.push({ id: 'slice', label: t('home3d.act.slice', 'PEGAR FATIA'), icon: 'grab' });
    } else if (it && tg.dist < 2.6) {
      if ((it.state === 'moved' || it.state === 'broken') && canUse(role, 'clean')) L.push({ id: 'fix', label: t('home3d.act.fix', 'ARRUMAR'), icon: 'fix', size: 'big' });
      if (it.state !== 'broken') {
        if (it.info.light) L.push({ id: 'pick', label: t('home3d.act.pick', 'PEGAR'), icon: 'grab', size: L.length ? undefined : 'big' });
        if (!it.info.wall && !it.info.ceil && !it.info.flat) L.push({ id: 'kick', label: it.info.light ? t('home3d.act.kick', 'CHUTAR') : t('home3d.act.push', 'EMPURRAR'), icon: 'kick', size: 'small' });
        if (it.info.fragile && this.eng.editable) L.push({ id: 'break', label: t('home3d.act.break', 'QUEBRAR'), icon: 'break', size: 'small' });
      }
    }
    return L;
  }
  private tap(id: string): void {
    const tg = this.target;
    switch (id) {
      case 'pick':
        if (tg.food && this.party) this.holdFood(this.party.take(tg.food, this.party.myId));
        else if (tg.item) this.pickItem(tg.item);
        break;
      case 'slice': {
        const f = this.party?.takeSlice(this.party.myId);
        if (f) this.holdFood(f);
        break;
      }
      case 'eat':
        if (this.party?.eat(this.party.myId)) {
          this.hand.play('eat');
          sfx.eat();
          this.onToast?.(t('home3d.party.yum', 'Hummm!'));
        }
        break;
      case 'throw':
        this.throwHeld();
        break;
      case 'drop':
        this.drop(true);
        break;
      case 'kick':
        if (tg.item) this.kick(tg.item);
        break;
      case 'break':
        if (tg.item) this.breakItem(tg.item);
        break;
      case 'fix':
        if (tg.item) {
          this.eng.startFix(tg.item);
          this.hand.play('fix');
          sfx.fix();
          this.onToast?.(t('home3d.toast.fixed', 'Arrumado!'));
        }
        break;
      case 'move':
        if (tg.item && canUse(this.eng.role, 'decorate')) this.pickItem(tg.item, true);
        break;
      case 'rot':
        this.decorRot = (this.decorRot + 1) % 4;
        sfx.click();
        break;
      case 'place':
        this.placeDecor();
        break;
      case 'cancel':
        if (this.held?.item) {
          const it = this.held.item;
          this.held = null;
          this.eng.homeItem(it);
          it.body && (it.body.collisionResponse = true);
          this.tintItem(it, null);
          this.updatePose();
        }
        break;
    }
  }

  /* ---------------- pegar / jogar ---------------- */
  private holdFood(f: Food): void {
    this.held = { food: f };
    this.hand.play('grab');
    sfx.pick();
    this.updatePose();
  }
  private pickItem(it: ItemRec, decor = false): void {
    if (!decor && !it.info.light) return;
    if (it.state === 'broken') return;
    this.held = { item: it };
    if (it.body) {
      it.body.type = CANNON.Body.KINEMATIC;
      it.body.collisionResponse = false;
      it.body.wakeUp();
    }
    it.state = 'held';
    this.decorRot = Math.round(((new THREE.Euler().setFromQuaternion(it.obj.quaternion, 'YXZ').y - it.room.rotY) / (Math.PI / 2)) % 4 + 4) % 4;
    this.hand.play('grab');
    sfx.pick();
    this.updatePose();
  }
  private holdPos(out: THREE.Vector3, it?: ItemRec): THREE.Vector3 {
    const cam = this.eng.camera;
    const dist = it ? 0.7 + Math.max(it.dims.w, it.dims.d) * 0.6 : 0.45;
    cam.getWorldDirection(AIM_P);
    out.copy(cam.position).addScaledVector(AIM_P, dist);
    if (it) out.y = Math.max(0.05, Math.min(out.y - it.dims.h * 0.35, 1.9 - it.dims.h));
    else out.addScaledVector(UP, -0.12);
    return out;
  }
  private updateHeld(dt: number): void {
    if (!this.held) return;
    const cam = this.eng.camera;
    if (this.held.food) {
      const f = this.held.food;
      // comida aparece "na mão"
      V.set(0.16, -0.12, -0.42).applyQuaternion(cam.quaternion).add(cam.position);
      f.obj.position.lerp(V, Math.min(1, dt * 20));
      f.obj.quaternion.copy(cam.quaternion);
      f.obj.scale.setScalar(1);
      return;
    }
    const it = this.held.item!;
    if (this.tool === 'decor') {
      // fantasma no chão onde a mira aponta (encaixe 10 cm)
      const room = it.room;
      cam.getWorldDirection(V);
      const o = cam.position;
      let tt = V.y < -0.05 ? -o.y / V.y : 2.2;
      tt = Math.max(0.8, Math.min(3.2, tt));
      const p = V2.copy(o).addScaledVector(V, tt);
      const loc = room.group.worldToLocal(p.clone());
      const half = this.decorRot % 2 ? it.dims.d / 2 : it.dims.w / 2;
      const halfz = this.decorRot % 2 ? it.dims.w / 2 : it.dims.d / 2;
      loc.x = Math.round(loc.x * 10) / 10;
      loc.z = Math.round(loc.z * 10) / 10;
      const inside = loc.x - half > WALL_T && loc.x + half < ROOM_W - WALL_T && loc.z - halfz > WALL_T && loc.z + halfz < ROOM_D - WALL_T;
      loc.x = Math.max(WALL_T + half, Math.min(ROOM_W - WALL_T - half, loc.x));
      loc.z = Math.max(WALL_T + halfz, Math.min(ROOM_D - WALL_T - halfz, loc.z));
      const w = room.group.localToWorld(loc.clone().setY(0));
      it.obj.position.lerp(w, Math.min(1, dt * 18));
      const q = new THREE.Quaternion().setFromAxisAngle(UP, (this.decorRot * Math.PI) / 2 + room.rotY);
      it.obj.quaternion.slerp(q, Math.min(1, dt * 14));
      // colide com outros móveis do cômodo?
      let ok = inside;
      for (const o2 of this.eng.items) {
        if (o2 === it || o2.room !== room || o2.info.wall || o2.info.flat || o2.info.ceil || o2.state === 'broken') continue;
        const ol = room.group.worldToLocal(o2.obj.position.clone());
        const oy = Math.round(((new THREE.Euler().setFromQuaternion(o2.obj.quaternion, 'YXZ').y - room.rotY) / (Math.PI / 2)) % 2 + 2) % 2;
        const ohx = oy ? o2.dims.d / 2 : o2.dims.w / 2,
          ohz = oy ? o2.dims.w / 2 : o2.dims.d / 2;
        if (Math.abs(ol.x - loc.x) < ohx + half - 0.02 && Math.abs(ol.z - loc.z) < ohz + halfz - 0.02) {
          ok = false;
          break;
        }
      }
      this.decorValid = ok;
      this.tintItem(it, ok ? '#7dff9a' : '#ff6a6a');
      (this as unknown as { decorLoc: THREE.Vector3 }).decorLoc = loc;
      return;
    }
    this.holdPos(V, it);
    // mantém dentro do cômodo atual
    const room = this.eng.roomAt(this.body.position.x, this.body.position.z);
    if (room) {
      const l = room.group.worldToLocal(V.clone());
      const r = Math.max(it.dims.w, it.dims.d) / 2 + WALL_T + 0.02;
      l.x = Math.max(r, Math.min(ROOM_W - r, l.x));
      l.z = Math.max(r, Math.min(ROOM_D - r, l.z));
      V.copy(room.group.localToWorld(l));
    }
    it.obj.position.lerp(V, Math.min(1, dt * 16));
    const q = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw + Math.sin(this.eng.time * 2) * 0.05);
    it.obj.quaternion.slerp(q, Math.min(1, dt * 10));
    if (it.body) this.eng.syncBodyFromObj(it);
  }
  private tinted = new Map<ItemRec, THREE.Material>();
  private tintItem(it: ItemRec, col: string | null): void {
    if (!it.solid) return;
    if (col === null) {
      const m = this.tinted.get(it);
      if (m) {
        (it.solid.material as THREE.Material).dispose();
        it.solid.material = m;
        this.tinted.delete(it);
      }
      return;
    }
    if (!this.tinted.has(it)) {
      this.tinted.set(it, it.solid.material as THREE.Material);
      it.solid.material = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, transparent: true, opacity: 0.8 });
    }
    (it.solid.material as THREE.MeshLambertMaterial).emissive.set(col);
    (it.solid.material as THREE.MeshLambertMaterial).color.set(col);
  }
  private placeDecor(): void {
    const it = this.held?.item;
    if (!it) return;
    if (!this.decorValid) {
      sfx.thud();
      this.onToast?.(t('home3d.toast.noSpace', 'Não cabe aqui'));
      return;
    }
    const loc = (this as unknown as { decorLoc: THREE.Vector3 }).decorLoc;
    const xy = placeToXY(it.kind, { x: loc.x, y: 0, z: loc.z });
    // mess que apontava para este item precisa seguir a nova posição
    for (const m of this.eng.mess) if (m.moved && m.moved.itemId === it.data.id && m.moved.ox === it.data.x && m.moved.oy === it.data.y) (m.moved.ox = xy.x), (m.moved.oy = xy.y);
    it.data.x = xy.x;
    it.data.y = xy.y;
    it.data.r3 = this.decorRot;
    it.data.flip = this.decorRot === 2;
    this.tintItem(it, null);
    this.held = null;
    if (it.body) it.body.collisionResponse = true;
    this.eng.rehome(it);
    it.fromMess = false;
    this.eng.changed = true;
    this.eng.burst(it.obj.position.x, 0.1, it.obj.position.z, 12, 'poof', '#ffffff', 1.2);
    sfx.drop();
    this.updatePose();
  }
  private throwHeld(): void {
    const cam = this.eng.camera;
    cam.getWorldDirection(V);
    const h = this.held;
    if (!h) return;
    this.held = null;
    this.hand.play('throw');
    if (h.food && this.party) {
      const from = cam.position.clone().addScaledVector(V, 0.35).add(new THREE.Vector3(0, -0.08, 0));
      const vel = V.clone().multiplyScalar(8.5).add(new THREE.Vector3(0, 2.2, 0)).add(new THREE.Vector3(this.body.velocity.x, 0, this.body.velocity.z));
      this.party.launch(h.food, from, vel);
      h.food.by = this.party.myId;
      this.party.sendThrow(h.food, from, vel);
    } else if (h.item) {
      const it = h.item;
      if (it.body) {
        it.body.type = CANNON.Body.DYNAMIC;
        it.body.collisionResponse = true;
        it.body.mass = Math.max(1, it.dims.w * it.dims.d * it.dims.h * 30);
        it.body.updateMassProperties();
        const s = 6.5 / Math.sqrt(Math.max(1, it.body.mass / 3));
        it.body.velocity.set(V.x * s, V.y * s + 2.6, V.z * s);
        it.body.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        it.body.wakeUp();
      }
      it.state = 'moved';
      sfx.throw();
    }
    this.updatePose();
  }
  drop(gentle: boolean): void {
    const h = this.held;
    if (!h) return;
    this.held = null;
    if (h.food && this.party) {
      const from = h.food.obj.position.clone();
      this.party.launch(h.food, from, new THREE.Vector3(0, gentle ? -0.5 : 0, 0), false);
    } else if (h.item) {
      const it = h.item;
      this.tintItem(it, null);
      if (this.tool === 'decor') this.eng.homeItem(it);
      else if (it.body) {
        it.body.type = CANNON.Body.DYNAMIC;
        it.body.collisionResponse = true;
        it.body.mass = Math.max(1, it.dims.w * it.dims.d * it.dims.h * 30);
        it.body.updateMassProperties();
        it.body.velocity.set(this.body.velocity.x, 0, this.body.velocity.z);
        it.body.wakeUp();
        it.state = 'moved';
      }
      if (it.body) it.body.collisionResponse = true;
      sfx.drop();
    }
    this.updatePose();
  }
  private kick(it: ItemRec): void {
    this.hand.play('kick');
    const cam = this.eng.camera;
    cam.getWorldDirection(V);
    V.y = 0;
    V.normalize();
    if (it.body && it.body.type === CANNON.Body.DYNAMIC) {
      const s = 5 / Math.sqrt(Math.max(1, it.body.mass / 3));
      it.body.wakeUp();
      it.body.velocity.set(V.x * s, 2.2, V.z * s);
      it.body.angularVelocity.set(V.z * 6, (Math.random() - 0.5) * 4, -V.x * 6);
      it.state = 'moved';
      sfx.kick();
    } else {
      // pesado: só balança
      sfx.thud();
      it.obj.rotateZ(0.04);
      setTimeout(() => it.state === 'home' && it.obj.quaternion.copy(it.homeQ), 120);
    }
    this.eng.burst(this.target.point.x, this.target.point.y, this.target.point.z, 6, 'poof', '#ffffff', 0.8);
  }
  private pieces: { m: THREE.Mesh; b: CANNON.Body; life: number }[] = [];
  private breakItem(it: ItemRec): void {
    this.hand.play('break');
    const c = it.obj.position.clone().add(new THREE.Vector3(0, it.dims.h / 2, 0));
    if (this.held?.item === it) this.held = null;
    // pedacinhos de desenho animado voando
    const col = itemColor(it.data);
    const mats = [this.eng.pieceMat(col), this.eng.pieceMat(it.kind === 'plant' || it.kind === 'cactus' ? '#4fd67a' : '#fffaf0'), this.eng.pieceMat('#ffd84a')];
    for (let i = 0; i < 9; i++) {
      const s = 0.07 + Math.random() * 0.08;
      const m = new THREE.Mesh(this.eng.boxGeo(), mats[i % 3]);
      m.scale.setScalar(s);
      this.eng.scene.add(m);
      const b = new CANNON.Body({ mass: 0.2, shape: new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)), collisionFilterGroup: G.DEBRIS, collisionFilterMask: G.STATIC | G.ITEM });
      b.position.set(c.x + (Math.random() - 0.5) * it.dims.w * 0.6, c.y + (Math.random() - 0.5) * it.dims.h * 0.5, c.z + (Math.random() - 0.5) * it.dims.d * 0.6);
      b.velocity.set((Math.random() - 0.5) * 5, 2 + Math.random() * 3, (Math.random() - 0.5) * 5);
      b.angularVelocity.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.eng.world.addBody(b);
      this.pieces.push({ m, b, life: 2.2 + Math.random() * 0.6 });
    }
    this.eng.burst(c.x, c.y, c.z, 22, 'poof', '#ffffff', 1.8);
    this.eng.burst(c.x, c.y, c.z, 16, 'spark', '#ffe27a', 3);
    sfx.poof();
    this.eng.setBroken(it, true);
    if (it.kind === 'balloons') {
      // balões estouram em confete (sujeira de aspirar)
      sfx.pop();
      const room = it.room;
      const loc = room.group.worldToLocal(it.homeP.clone());
      const m: MessItem3D = { id: newMessId(), kind: 'balloon-pop', room: room.id, x: Math.round(loc.x * 60), y: 0, r: 30 };
      const xy = placeToXY('chair', loc);
      m.y = xy.y;
      this.eng.addDecal(m, true);
    }
    this.onToast?.(t('home3d.toast.poof', 'Pou!'));
  }

  /* ---------------- limpar / pintar ---------------- */
  private cleanStep(dt: number, d: DecalRec): void {
    const size = d.mesh.scale.x;
    d.dirt -= dt * (1.1 / Math.max(0.45, size));
    d.mat.opacity = Math.max(0, Math.pow(Math.max(0, d.dirt), 0.7));
    this.fxT -= dt;
    const p = this.target.point;
    if (this.fxT <= 0) {
      this.fxT = 0.05;
      if (d.vacuum) {
        // partículas sugadas em direção à mão
        const cam = this.eng.camera;
        V.copy(cam.position).sub(p).normalize().multiplyScalar(2.5);
        this.eng.emit(p.x + (Math.random() - 0.5) * size * 0.5, p.y + 0.02, p.z + (Math.random() - 0.5) * size * 0.5, V.x, V.y, V.z, { tile: 3, color: splatColor(d.m.kind as MessKind), life: 0.35, size: 0.03 });
        if (Math.random() < 0.3) sfx.vacuum();
      } else {
        this.eng.burst(p.x + (Math.random() - 0.5) * size * 0.4, p.y + 0.02, p.z + (Math.random() - 0.5) * size * 0.4, 2, 'foam', '#ffffff', 0.6);
        if (Math.random() < 0.25) sfx.squeak();
        else if (Math.random() < 0.2) sfx.scrub();
      }
    }
    if (d.dirt <= 0) {
      this.eng.burst(d.mesh.position.x, d.mesh.position.y + 0.08, d.mesh.position.z, 16, 'spark', '#bff7ff', 1.6);
      this.eng.removeDecal(d, true);
      sfx.clean();
      this.onCleaned?.(this.eng.cleaned);
    }
  }
  private paintStep(dt: number): void {
    const w = this.target.wall;
    if (!w || !this.target.uv || this.target.dist > 3.4) return;
    this.paintT -= dt;
    if (this.paintT > 0) return;
    this.paintT = 1 / 30;
    const uv = this.target.uv;
    const fresh = this.eng.paintAt(w, uv.x, uv.y, 0.42, this.paintColor);
    if (fresh && Math.random() < 0.35) sfx.paint();
    if (Math.random() < 0.3) {
      const p = this.target.point;
      this.eng.emit(p.x, p.y, p.z, w.normal.x * 0.4, -0.3, w.normal.z * 0.4, { tile: 3, color: parsePaintSpec(this.paintColor)?.col ?? '#ff9ad5', life: 0.5, size: 0.025, grav: 6 });
    }
    const room = w.room;
    const prog = this.eng.paintProgress(room);
    this.onProgress?.(room, prog);
    if (prog >= 0.9) {
      this.eng.finishPaint(room);
      this.onProgress?.(room, 1);
      sfx.sparkle();
      this.onToast?.(t('home3d.toast.painted', 'Parede novinha!'), );
      for (const ww of room.walls) {
        for (let i = 0; i < 6; i++) {
          const c = room.group.localToWorld(new THREE.Vector3(Math.random() * ROOM_W, 0.4 + Math.random() * 2, Math.random() * ROOM_D));
          this.eng.burst(c.x, c.y, c.z, 4, 'spark', '#fff4a0', 1.2);
        }
        void ww;
      }
    }
  }

  /* ---------------- laço ---------------- */
  update(dt: number): void {
    if (!this.active) return;
    const [lx, ly] = this.input.consumeLook();
    this.yaw -= lx;
    this.pitch = Math.max(-1.25, Math.min(1.2, this.pitch - ly));
    this.lastLook = [lx, ly];
    // movimento com aceleração suave
    const [mx, my] = this.input.dir();
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw),
      rz = -Math.sin(this.yaw);
    const tvx = (fx * my + rx * mx) * SPEED,
      tvz = (fz * my + rz * mx) * SPEED;
    const k = Math.min(1, dt * (mx || my ? 10 : 14));
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.y += (tvz - this.vel.y) * k;
    this.body.velocity.x = this.vel.x;
    this.body.velocity.z = this.vel.y;
    if (this.body.position.y > RAD + 0.05) this.body.velocity.y -= 0;
    const speed = Math.hypot(this.vel.x, this.vel.y) / SPEED;
    this.bob += dt * 9 * speed;
    const bobY = Math.sin(this.bob * 2) * 0.022 * speed;
    const bobX = Math.cos(this.bob) * 0.012 * speed;
    if (speed > 0.3) {
      this.stepT -= dt * speed;
      if (this.stepT <= 0) {
        this.stepT = 0.36;
        sfx.step();
      }
    }
    const cam = this.eng.camera;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch, this.yaw, -bobX * 0.4);
    cam.position.set(this.body.position.x + rx * bobX, this.body.position.y - RAD + EYE + bobY, this.body.position.z + rz * bobX);
    cam.updateMatrixWorld();
    // luz quente segue o cômodo atual
    const room = this.eng.roomAt(cam.position.x, cam.position.z);
    if (room && this.eng.point) this.eng.point.position.lerp(V.set(room.center.x, 2.3, room.center.z), Math.min(1, dt * 3));
    this.aim();
    this.updateHeld(dt);
    // limpar / pintar segurando
    const holdClean = this.acts.held.has('clean');
    const holdPaint = this.acts.held.has('paint') || (this.tool === 'paint' && this.input.key('Space'));
    let scrub = 0;
    if ((holdClean || (this.tool === 'clean' && this.input.key('Space'))) && this.target.decal && this.target.dist < 2.8) {
      this.cleanStep(dt, this.target.decal);
      scrub = 1;
      if (this.tool !== 'clean') this.hand.setPose(this.target.decal.vacuum ? 'vacuum' : 'sponge');
    } else if (holdPaint && this.tool === 'paint') {
      this.paintStep(dt);
      scrub = 0.7;
    } else if (this.tool === 'hand' && !this.held) this.hand.setPose('open');
    else if (this.tool === 'clean') this.updatePose();
    this.hand.scrub += (scrub - this.hand.scrub) * Math.min(1, dt * 12);
    this.hand.update(dt, speed, this.lastLook[0], this.lastLook[1]);
    // peças quebradas somem
    for (const p of [...this.pieces]) {
      p.life -= dt;
      p.m.position.set(p.b.position.x, p.b.position.y, p.b.position.z);
      p.m.quaternion.set(p.b.quaternion.x, p.b.quaternion.y, p.b.quaternion.z, p.b.quaternion.w);
      if (p.life < 0.4) p.m.scale.multiplyScalar(Math.max(0.01, 1 - dt * 6));
      if (p.life <= 0) {
        this.eng.burst(p.m.position.x, p.m.position.y, p.m.position.z, 2, 'poof', '#ffffff', 0.4);
        this.eng.scene.remove(p.m);
        this.eng.world.removeBody(p.b);
        this.pieces.splice(this.pieces.indexOf(p), 1);
      }
    }
    // HUD
    this.acts.set(this.buttons());
    const tg = this.target;
    let label = '';
    if (tg.type === 'item' && tg.item && tg.dist < 3) label = t('home3d.furn.' + tg.item.kind, KINDS[tg.item.kind].name) + (tg.item.state === 'broken' ? ' · ' + t('home3d.state.broken', 'quebrado') : tg.item.state === 'moved' ? ' · ' + t('home3d.state.moved', 'fora do lugar') : '');
    else if (tg.type === 'decal' && tg.decal) label = t('home3d.mess.' + tg.decal.m.kind, messName(tg.decal.m.kind as MessKind));
    else if (tg.type === 'food' && tg.food) label = t('home3d.food.' + tg.food.kind, foodName(tg.food.kind));
    else if (tg.type === 'cake') label = t('home3d.food.bigcake', 'Bolo da festa') + (this.party?.cake ? ` (${this.party.cake.slices}/8)` : '');
    this.onLabel?.(label);
  }
  /** espalha comida/sujeira no próprio jogador: devolve true se tinha algo na mão */
  dispose(): void {
    for (const p of this.pieces) this.eng.scene.remove(p.m);
    for (const [it, m] of this.tinted) {
      (it.solid!.material as THREE.Material).dispose();
      it.solid!.material = m;
    }
    this.hand.dispose();
  }
}
export function messName(k: MessKind): string {
  return ({ cake: 'Bolo no chão', frosting: 'Cobertura', juice: 'Suco derramado', crumbs: 'Migalhas', confetti: 'Confete', tomato: 'Tomate', pie: 'Torta', 'balloon-pop': 'Balão estourado', mud: 'Lama' } as Record<string, string>)[k] ?? k;
}
export function foodName(k: string): string {
  return ({ cake: 'Fatia de bolo', pie: 'Torta', tomato: 'Tomate', juice: 'Suco', cupcake: 'Bolinho' } as Record<string, string>)[k] ?? k;
}
