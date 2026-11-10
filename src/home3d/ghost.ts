/* ============================================================
 *  FANTASMA DE POSICIONAMENTO: cópia translúcida do MODELO de verdade
 *  (não uma caixa) + contorno da pegada no chão. Branco/verde quando cabe,
 *  vermelho só quando não cabe mesmo. Movimento suavizado (lerp).
 * ============================================================ */
import * as THREE from 'three';
import { dimsOf, halfExt, itemColor, KINDS, kindOf, quarterOf } from './adapter';
import { buildModel } from './models';
import { hashN, type Engine, type RoomRec } from './engine';

const OK_COL = new THREE.Color('#7dffb0');
const BAD_COL = new THREE.Color('#ff5a6a');
const UP = new THREE.Vector3(0, 1, 0);

export class Ghost {
  readonly group = new THREE.Group();
  private model = new THREE.Group();
  private foot: THREE.Mesh;
  private ring: THREE.Mesh;
  private matSolid: THREE.MeshLambertMaterial;
  private matFace = new Map<THREE.Texture, THREE.MeshBasicMaterial>();
  private matFoot = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.16, depthWrite: false });
  private matRing = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false });
  private goalP = new THREE.Vector3();
  private goalQ = new THREE.Quaternion();
  private first = true;
  valid = true;
  wall = false;
  private t = 0;

  constructor(readonly eng: Engine) {
    this.matSolid = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.74, depthWrite: false, emissive: OK_COL.clone(), emissiveIntensity: 0.2 });
    this.foot = new THREE.Mesh(eng.planeGeo, this.matFoot);
    this.foot.rotation.x = -Math.PI / 2;
    this.foot.renderOrder = 4;
    this.ring = new THREE.Mesh(new THREE.BufferGeometry(), this.matRing);
    this.ring.renderOrder = 5;
    this.group.add(this.model, this.foot, this.ring);
    this.group.visible = false;
    eng.scene.add(this.group);
  }

  /** monta a cópia do modelo de um item (id do catálogo + cor) */
  setItem(data: { id: string; color?: string; r3?: number; flip?: boolean }, roomId: string): void {
    const { kind, v } = kindOf(data.id);
    for (const c of [...this.model.children]) this.model.remove(c);
    const parts = buildModel(kind, v, itemColor(data), this.eng.q.seg, hashN(data.id + roomId + (data as { x?: number }).x));
    const obj = this.eng.makeObj(parts);
    for (const c of [...obj.children]) {
      const m = c as THREE.Mesh;
      const old = m.material as THREE.Material & { map?: THREE.Texture | null; vertexColors?: boolean };
      if (old.map) {
        let fm = this.matFace.get(old.map);
        if (!fm) this.matFace.set(old.map, (fm = new THREE.MeshBasicMaterial({ map: old.map, transparent: true, opacity: 0.74, depthWrite: false, toneMapped: false })));
        m.material = fm;
      } else m.material = this.matSolid;
      m.castShadow = m.receiveShadow = false;
      m.renderOrder = 6;
      this.model.add(m);
    }
    this.wall = !!KINDS[kind].wall;
    this.setFoot(kind, v, quarterOf(data));
    this.first = true;
  }
  /** contorno retangular da pegada (anel fino) */
  setFoot(kind: ReturnType<typeof kindOf>['kind'], v: number, q: number): void {
    const info = KINDS[kind];
    const show = !info.wall && !info.ceil;
    this.foot.visible = this.ring.visible = show;
    if (!show) return;
    // em coordenadas do modelo (antes do giro): largura w em x, profundidade d em z
    const dm = dimsOf(kind, v);
    void halfExt;
    void q;
    const hx = dm.w / 2 + 0.04,
      hz = dm.d / 2 + 0.04,
      t = 0.035;
    const s = new THREE.Shape([new THREE.Vector2(-hx, -hz), new THREE.Vector2(hx, -hz), new THREE.Vector2(hx, hz), new THREE.Vector2(-hx, hz)]);
    s.holes.push(new THREE.Path([new THREE.Vector2(-hx + t, -hz + t), new THREE.Vector2(-hx + t, hz - t), new THREE.Vector2(hx - t, hz - t), new THREE.Vector2(hx - t, -hz + t)]));
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    this.ring.geometry.dispose();
    this.ring.geometry = g;
    this.ring.position.y = 0.02;
    this.foot.scale.set(hx * 2, hz * 2, 1);
    this.foot.position.y = 0.015;
  }
  /** alvo em coordenadas locais do cômodo */
  setGoal(room: RoomRec, x: number, y: number, z: number, yaw: number, valid: boolean): void {
    room.group.localToWorld(this.goalP.set(x, y, z));
    this.goalQ.setFromAxisAngle(UP, yaw + room.rotY);
    this.group.visible = true;
    if (this.first) {
      this.group.position.copy(this.goalP);
      this.group.quaternion.copy(this.goalQ);
      this.first = false;
    }
    this.setValid(valid);
  }
  setValid(v: boolean): void {
    this.valid = v;
    const c = v ? OK_COL : BAD_COL;
    this.matSolid.emissive.copy(c);
    this.matSolid.emissiveIntensity = v ? 0.2 : 0.55;
    this.matFoot.color.copy(v ? OK_COL : BAD_COL);
    this.matRing.color.set(v ? '#ffffff' : '#ff5a6a');
  }
  snap(): void {
    this.group.position.copy(this.goalP);
    this.group.quaternion.copy(this.goalQ);
  }
  get pos(): THREE.Vector3 {
    return this.group.position;
  }
  update(dt: number): void {
    if (!this.group.visible) return;
    this.t += dt;
    const k = 1 - Math.exp(-dt * 16);
    this.group.position.lerp(this.goalP, k);
    this.group.quaternion.slerp(this.goalQ, 1 - Math.exp(-dt * 14));
    // respiração leve: dá pra ver que está "na mão"
    this.model.position.y = this.wall ? 0 : 0.03 + Math.sin(this.t * 5) * 0.015;
    this.matRing.opacity = 0.7 + Math.sin(this.t * 6) * 0.25;
  }
  hide(): void {
    this.group.visible = false;
    this.first = true;
  }
  dispose(): void {
    this.eng.scene.remove(this.group);
    this.ring.geometry.dispose();
    this.matSolid.dispose();
    this.matFoot.dispose();
    this.matRing.dispose();
    for (const m of this.matFace.values()) m.dispose();
  }
}
