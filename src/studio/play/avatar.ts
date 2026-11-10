/* ============================================================
 *  BLOOP STUDIO — o Bloop em 3D (bolinha fofa com olhos), nas cores do
 *  personagem do jogador. Animação de andar (quique + achatar) e piscar.
 * ============================================================ */
import * as THREE from 'three';
import { handColors } from '../../3d/common/hand';

export class BloopAvatar {
  readonly root = new THREE.Group();
  private body: THREE.Mesh;
  private eyes = new THREE.Group();
  private feet: THREE.Mesh[] = [];
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private t = 0;
  private blink = 2;

  constructor(standard: boolean) {
    const col = handColors();
    const M = (c: string, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      const m = standard ? new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...o }) : new THREE.MeshLambertMaterial({ color: c });
      this.mats.push(m);
      return m;
    };
    const G = <T extends THREE.BufferGeometry>(g: T) => (this.geos.push(g), g);
    this.body = new THREE.Mesh(G(new THREE.SphereGeometry(0.48, 24, 18)), M(col.light));
    this.body.castShadow = true;
    const belly = new THREE.Mesh(G(new THREE.SphereGeometry(0.34, 18, 12)), M(col.belly));
    belly.position.set(0, -0.08, -0.2);
    belly.scale.set(1, 0.9, 0.6);
    this.body.add(belly);
    const white = M('#ffffff');
    const ink = new THREE.MeshBasicMaterial({ color: '#2a1140' });
    this.mats.push(ink);
    for (const x of [-0.16, 0.16]) {
      const e = new THREE.Mesh(G(new THREE.SphereGeometry(0.13, 14, 10)), white);
      e.position.set(x, 0.12, -0.38);
      e.scale.set(1, 1.15, 0.6);
      const p = new THREE.Mesh(G(new THREE.SphereGeometry(0.065, 10, 8)), ink);
      p.position.set(0, 0.01, -0.09);
      e.add(p);
      this.eyes.add(e);
    }
    this.body.add(this.eyes);
    const cheek = M('#ff8fb8');
    for (const x of [-0.3, 0.3]) {
      const c = new THREE.Mesh(G(new THREE.SphereGeometry(0.06, 8, 6)), cheek);
      c.position.set(x, -0.04, -0.37);
      c.scale.set(1, 0.6, 0.4);
      this.body.add(c);
    }
    const footM = M(col.dark);
    for (const x of [-0.18, 0.18]) {
      const f = new THREE.Mesh(G(new THREE.SphereGeometry(0.13, 10, 8)), footM);
      f.scale.set(1, 0.6, 1.3);
      f.position.set(x, -0.44, -0.05);
      f.castShadow = true;
      this.feet.push(f);
      this.root.add(f);
    }
    this.root.add(this.body);
  }

  /** speed: m/s no chão; air: no ar; seated: sentado num veículo */
  animate(dt: number, speed: number, air: boolean, seated: boolean): void {
    this.t += dt * (2 + Math.min(speed, 8) * 1.4);
    const bob = seated ? 0 : air ? 0 : Math.abs(Math.sin(this.t * 2)) * Math.min(1, speed / 3) * 0.08;
    const sq = air ? 1.08 : 1 - bob * 0.6;
    this.body.position.y = bob;
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.feet.forEach((f, i) => {
      f.visible = !seated;
      f.position.z = -0.05 + (speed > 0.3 && !air ? Math.sin(this.t * 2 + i * Math.PI) * 0.12 : 0);
    });
    this.blink -= dt;
    const closed = this.blink < 0.12;
    this.eyes.scale.y = closed ? 0.15 : 1;
    if (this.blink < 0) this.blink = 2 + Math.random() * 3;
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
