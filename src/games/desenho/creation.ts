/* ============================================================
 *  DESENHA E VIRA! — uma criação viva no mundo: malha + corpo físico
 *  (+ rodas com dobradiças motorizadas, se for veículo).
 *  Duplicatas dividem a geometria (contagem de referências).
 * ============================================================ */
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { densityOf, type Built } from './build';
import { massFor, partsToBody, rebuildShapes } from './physics';
import type { Drawing, Material } from './strokes';

export interface Recipe {
  d: Drawing;
  mat: Material;
  vehicle: boolean;
  fly: boolean;
}

export interface Shared {
  built: Built;
  refs: number;
}

export interface CreationOpts {
  world: CANNON.World;
  scene: THREE.Scene;
  pos: THREE.Vector3;
  quat?: THREE.Quaternion;
  plane2d?: boolean;
  shadows?: boolean;
  matDef: CANNON.Material;
  matBouncy: CANNON.Material;
  scale?: number;
  /** teto da massa (kg) — o ateliê limita para arremessos; os desafios usam massa real */
  maxMass?: number;
}

interface WheelRt {
  mesh: THREE.Mesh;
  body: CANNON.Body;
  hinge: CANNON.HingeConstraint;
  side: number;
  local: CANNON.Vec3;
}

let NEXT = 1;

export class Creation {
  readonly id = NEXT++;
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  readonly body: CANNON.Body;
  readonly material: THREE.Material;
  wheels: WheelRt[] = [];
  scale: number;
  /** 0..1 animação do BUM (crescendo); 1 = solto no mundo */
  grow = 1;
  spawned = false;
  tint = '#ffffff';
  /** veículo/voador ligados */
  flying = false;
  private sh: Shared;
  private o: CreationOpts;
  private wheelGeo: THREE.CylinderGeometry | null = null;
  private wheelMats: THREE.Material[] = [];
  /** quique de chegada (som/vibração uma vez) */
  landed = false;
  onLand: (v: number) => void = () => {};

  constructor(
    readonly recipe: Recipe,
    built: Built | Shared,
    o: CreationOpts,
  ) {
    this.sh = 'refs' in built ? built : { built, refs: 0 };
    this.sh.refs++;
    this.o = o;
    const b = this.sh.built;
    this.scale = o.scale ?? 1;
    this.material = b.material.clone();
    this.mesh = new THREE.Mesh(b.geo, this.material);
    this.mesh.castShadow = !!o.shadows;
    this.mesh.receiveShadow = !!o.shadows;
    this.mesh.userData.creation = this;
    this.group.add(this.mesh);
    // veículo nunca quica (balão-carro empinava ao cair)
    this.body = partsToBody(b.parts, this.scale, this.mass(), b.mat === 'inflate' && !b.wheels.length ? o.matBouncy : o.matDef);
    this.body.position.set(o.pos.x, o.pos.y, o.pos.z);
    if (o.quat) this.body.quaternion.set(o.quat.x, o.quat.y, o.quat.z, o.quat.w);
    if (o.plane2d) {
      this.body.linearFactor.set(1, 1, 0);
      this.body.angularFactor.set(0, 0, 1);
      this.body.angularDamping = 0.3;
    }
    this.body.addEventListener('collide', (e: { contact: CANNON.ContactEquation }) => {
      if (this.landed || !this.spawned) return;
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 0.4) {
        this.landed = true;
        this.onLand(v);
      }
    });
    if (b.wheels.length) {
      this.body.angularDamping = 0.6; // carrinho não empina à toa
      this.makeWheels();
    }
    o.scene.add(this.group);
    this.sync();
  }

  get built(): Built {
    return this.sh.built;
  }
  get shared(): Shared {
    return this.sh;
  }
  get isVehicle(): boolean {
    return this.wheels.length > 0;
  }

  mass(): number {
    const b = this.sh.built;
    // veículos: chassi mais leve (o motor das rodas dá conta)
    return massFor(b.volume, densityOf(b.mat) * (b.wheels.length ? 0.35 : 1), this.scale, this.o?.maxMass ?? 40);
  }

  private makeWheels(): void {
    const b = this.sh.built;
    const seg = 22;
    for (const w of b.wheels) {
      for (const side of [1, -1]) {
        const g = new THREE.CylinderGeometry(w.r, w.r, w.w, seg, 1);
        g.rotateX(Math.PI / 2);
        const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(w.color).multiplyScalar(0.55), roughness: 0.9 });
        const capMat = new THREE.MeshStandardMaterial({ map: w.tex, roughness: 0.7 });
        this.wheelMats.push(sideMat, capMat);
        const m = new THREE.Mesh(g, [sideMat, capMat, capMat]);
        m.castShadow = !!this.o.shadows;
        this.group.add(m);
        const wb = new CANNON.Body({ mass: Math.max(0.2, this.mass() * 0.08), material: this.o.matDef });
        wb.addShape(new CANNON.Sphere(w.r * this.scale));
        wb.angularDamping = 0.05;
        wb.allowSleep = true;
        if (this.o.plane2d) {
          wb.linearFactor.set(1, 1, 0);
          wb.angularFactor.set(0, 0, 1);
        }
        const local = new CANNON.Vec3(w.x * this.scale, w.y * this.scale, side * w.track * this.scale);
        const hinge = new CANNON.HingeConstraint(this.body, wb, { pivotA: local, axisA: new CANNON.Vec3(0, 0, 1), pivotB: new CANNON.Vec3(), axisB: new CANNON.Vec3(0, 0, 1), collideConnected: false, maxForce: 1e6 });
        this.wheels.push({ mesh: m, body: wb, hinge, side, local });
        m.userData.creation = this;
      }
    }
    this.placeWheels();
  }
  private placeWheels(): void {
    for (const w of this.wheels) {
      const p = this.body.quaternion.vmult(w.local).vadd(this.body.position);
      w.body.position.copy(p);
      w.body.quaternion.copy(this.body.quaternion);
      w.body.velocity.copy(this.body.velocity);
    }
  }

  /** põe o corpo no mundo (fim do BUM) */
  spawn(vel?: THREE.Vector3): void {
    if (this.spawned) return;
    this.spawned = true;
    this.grow = 1;
    this.o.world.addBody(this.body);
    if (vel) this.body.velocity.set(vel.x, vel.y, vel.z);
    this.placeWheels();
    for (const w of this.wheels) {
      this.o.world.addBody(w.body);
      this.o.world.addConstraint(w.hinge);
      w.hinge.enableMotor();
      w.hinge.setMotorSpeed(0);
      w.hinge.setMotorMaxForce(this.mass() * 6);
    }
  }

  /** acelerador −1..1 e direção −1..1 (diferencial: tanque) */
  drive(throttle: number, steer: number): void {
    const top = 14;
    for (const w of this.wheels) {
      // (o motor da dobradiça gira B em relação a A no sentido oposto ao eixo: + anda para +x)
      const sp = throttle * top - w.side * steer * top * 0.7;
      w.hinge.setMotorSpeed(sp);
      w.hinge.setMotorMaxForce(Math.abs(throttle) + Math.abs(steer) > 0.05 ? this.mass() * 5 : this.mass() * 2.5);
      w.body.wakeUp();
    }
    if (Math.abs(throttle) + Math.abs(steer) > 0.05) this.body.wakeUp();
  }

  /** fica de pé (a cada sub-passo): o torque de reação do motor empinava o carrinho até capotar */
  upright(h: number, k = 40): void {
    const av = this.body.angularVelocity;
    const up = this.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0));
    if (up.y < -0.3) return; // de ponta-cabeça: deixa o jogador desvirar
    av.x += (-up.z * k - av.x * 7) * h;
    av.z += (up.x * k - av.z * 7) * h;
  }

  setScale(s: number): void {
    s = Math.max(0.35, Math.min(3, s));
    if (Math.abs(s - this.scale) < 1e-3) return;
    const k = s / this.scale;
    this.scale = s;
    rebuildShapes(this.body, this.sh.built.parts, s, this.mass());
    for (const w of this.wheels) {
      w.local.scale(k, w.local);
      (w.hinge.pivotA as CANNON.Vec3).copy(w.local);
      (w.body.shapes[0] as CANNON.Sphere).radius *= k;
      (w.body.shapes[0] as CANNON.Sphere).updateBoundingSphereRadius();
      w.body.updateMassProperties();
      w.mesh.scale.setScalar(s);
    }
    this.placeWheels();
    this.body.wakeUp();
  }

  setTint(hex: string): void {
    this.tint = hex;
    (this.material as THREE.MeshStandardMaterial).color.set(hex);
  }

  /** copia física → malha; durante o BUM aplica a escala elástica */
  sync(growScale = 1): void {
    const p = this.body.position;
    const q = this.body.quaternion;
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.quaternion.set(q.x, q.y, q.z, q.w);
    this.mesh.scale.setScalar(this.scale * growScale);
    if (!this.spawned) this.placeWheels();
    for (const w of this.wheels) {
      if (this.spawned) {
        w.mesh.position.set(w.body.position.x, w.body.position.y, w.body.position.z);
        w.mesh.quaternion.set(w.body.quaternion.x, w.body.quaternion.y, w.body.quaternion.z, w.body.quaternion.w);
      } else {
        const lp = new THREE.Vector3(w.local.x, w.local.y, w.local.z).multiplyScalar(growScale).applyQuaternion(this.mesh.quaternion).add(this.mesh.position);
        w.mesh.position.copy(lp);
        w.mesh.quaternion.copy(this.mesh.quaternion);
      }
      w.mesh.scale.setScalar(this.scale * growScale);
    }
  }

  /** velocidade (para som/efeitos) */
  speed(): number {
    return this.body.velocity.length();
  }

  /** caixa no mundo (aprox.) */
  worldBox(out = new THREE.Box3()): THREE.Box3 {
    this.mesh.updateMatrixWorld();
    out.setFromObject(this.mesh);
    for (const w of this.wheels) out.expandByObject(w.mesh);
    return out;
  }

  remove(): void {
    const W = this.o.world;
    for (const w of this.wheels) {
      W.removeConstraint(w.hinge);
      W.removeBody(w.body);
      w.mesh.geometry.dispose();
    }
    this.wheelMats.forEach((m) => m.dispose());
    this.wheelGeo?.dispose();
    W.removeBody(this.body);
    this.group.removeFromParent();
    this.material.dispose();
    if (--this.sh.refs <= 0) this.sh.built.dispose();
  }
}
