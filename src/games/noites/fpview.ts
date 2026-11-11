/* ============================================================
 *  NOITES — 1ª pessoa: o que está na mão (machado, lanterna,
 *  toras carregadas...) desenhado por cima da cena, com balanço
 *  ao andar, atraso ao virar, golpe com "trava" no impacto,
 *  arremesso e troca de item.
 * ============================================================ */
import * as THREE from 'three';
import { ITEM } from './data';
import { heldKind } from './items';
import { G, PB, glowMat, itemGeo, logGeo, toolMesh, vcMat } from './models';

export class FpView {
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  private hemi = new THREE.HemisphereLight('#ffffff', '#555566', 1);
  private dir = new THREE.DirectionalLight('#fff2d8', 0.8);
  private fire = new THREE.PointLight('#ff9a40', 0, 6, 1);
  /** ponto de apoio (move com balanço) */
  private rig = new THREE.Group();
  private hand = new THREE.Group();
  private heldK = '';
  private heldN = -1;
  private swingT = 0;
  private swingLen = 0.32;
  private throwT = 0;
  private equipT = 0;
  private stopT = 0;
  private bump = 0;
  private walk = 0;
  private swayX = 0;
  private swayY = 0;
  /** tremida de impacto (para a câmera principal ler) */
  shake = 0;
  visible = true;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(55, aspect, 0.05, 10);
    this.dir.position.set(0.5, 1, 0.6);
    this.scene.add(this.hemi, this.dir, this.fire, this.rig);
    this.rig.add(this.hand);
  }
  setAspect(a: number): void {
    this.cam.aspect = a;
    this.cam.updateProjectionMatrix();
  }
  /** golpe (machado/martelo) — hit = acertou algo (trava curtinha + tremida) */
  swing(hit: boolean, strong = 1): void {
    if (this.swingT > this.swingLen * 0.5) {
      // já no meio de um golpe: só guarda a força do impacto
      this.hitPend = hit ? strong : 0;
      return;
    }
    this.swingT = this.swingLen;
    this.hitPend = hit ? strong : 0;
  }
  private hitPend = 0;
  throwIt(): void {
    this.throwT = 0.35;
  }
  pickBump(): void {
    this.bump = 0.25;
  }
  /** onde a mão está no mundo (para o "voo até a mão") */
  handWorld(cam: THREE.Camera, out: THREE.Vector3): THREE.Vector3 {
    return out.set(0.25, -0.3, -0.6).applyMatrix4(cam.matrixWorld);
  }

  /** ponto do punho (pivô do golpe), em espaço da câmera */
  private base = new THREE.Vector3(0.27, -0.33, -0.6);
  private build(id: string | undefined, n: number): void {
    this.build0(id, n);
    // tudo relativo ao punho: o golpe gira em volta da mão, não da câmera
    const two = id === 'wood';
    this.base.set(two ? 0.03 : 0.32, two ? -0.3 : -0.3, two ? -0.72 : -0.62);
    for (const c of this.hand.children) c.position.sub(this.base);
  }
  private build0(id: string | undefined, n: number): void {
    this.hand.clear();
    this.heldK = id ?? '';
    this.heldN = n;
    if (!id) return;
    const k = heldKind(id);
    const d = ITEM[id];
    if (k === 'axe' || k === 'bonk' || k === 'lamp') {
      const t = k === 'axe' ? fpAxe(d.col) : toolMesh(k === 'bonk' ? 'hammer' : 'lamp', d.col);
      if (k === 'lamp') {
        t.rotation.set(0, Math.PI, 0);
        t.position.set(0.24, -0.26, -0.42);
        t.scale.setScalar(1.3);
        const lens = new THREE.Mesh(G.cyl12, glowMat('#fff6c0'));
        lens.scale.set(0.17, 0.02, 0.17);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0.24, -0.26, -0.75);
        this.hand.add(lens);
      } else {
        // cabo na mão, lâmina para cima-frente
        t.position.set(0.32, -0.44, -0.62);
        t.rotation.set(0.15, -0.4, 0.22);
        t.scale.setScalar(k === 'axe' ? 0.68 : 0.62);
      }
      this.hand.add(t);
      // mãozinha (bolinha) segurando
      const hm = new THREE.Mesh(G.sph, new THREE.MeshLambertMaterial({ color: '#ffd0a0' }));
      hm.scale.setScalar(0.13);
      hm.position.set(0.33, -0.31, -0.62);
      if (k === 'lamp') hm.position.set(0.24, -0.3, -0.36);
      this.hand.add(hm);
      return;
    }
    if (id === 'wood') {
      // toras nos braços, na frente (pilha visível de até 4)
      const g = new THREE.Group();
      const m = vcMat();
      for (let i = 0; i < Math.min(n, 4); i++) {
        const l = new THREE.Mesh(logGeo(), m);
        l.rotation.y = Math.PI / 2 + (i % 2 ? 0.08 : -0.06);
        l.position.set(i % 2 ? 0.14 : -0.14, Math.floor(i / 2) * 0.24 + (i % 2) * 0.03, 0);
        if (i === 3) l.position.set(0, 0.47, 0);
        g.add(l);
      }
      g.rotation.y = Math.PI / 2;
      g.rotation.z = 0.08;
      g.position.set(0.05, -0.36, -0.78);
      g.scale.setScalar(0.6);
      this.hand.add(g);
      const pb = new PB().add(G.sph, '#ffd0a0', -0.24, -0.36, -0.7, 0.13, 0.11, 0.13).add(G.sph, '#ffd0a0', 0.3, -0.36, -0.7, 0.13, 0.11, 0.13);
      this.hand.add(new THREE.Mesh(pb.geo(), vcMat()));
      return;
    }
    if (d?.place?.kind === 'torch') {
      const t = new THREE.Group();
      t.add(new THREE.Mesh(new PB().add(G.cyl, '#7a4a2a', 0, 0, 0, 0.07, 0.6, 0.07).add(G.cyl, '#5a3a20', 0, 0.3, 0, 0.11, 0.08, 0.11).geo(), vcMat()));
      const f = new THREE.Mesh(G.cone, glowMat('#ffb040'));
      f.scale.set(0.18, 0.32, 0.18);
      f.position.y = 0.48;
      f.name = 'flame';
      t.add(f);
      t.position.set(0.3, -0.38, -0.55);
      t.rotation.z = -0.15;
      this.hand.add(t);
      return;
    }
    // qualquer outra coisa: o modelinho na palma
    const m = new THREE.Mesh(itemGeo(id), vcMat());
    const big = id === 'pumpkin' || (d?.wear?.slots ?? 0) > 0;
    m.scale.setScalar(big ? 0.4 : 0.55);
    m.position.set(0.3, -0.3, -0.62);
    this.hand.add(m);
    const hm = new THREE.Mesh(G.sph, new THREE.MeshLambertMaterial({ color: '#ffd0a0' }));
    hm.scale.set(0.15, 0.07, 0.15);
    hm.position.set(0.3, -0.32, -0.62);
    this.hand.add(hm);
    if (n > 1 && id !== 'wood') {
      for (let i = 1; i < Math.min(n, 3); i++) {
        const c = m.clone();
        c.position.x += (i % 2 ? -0.08 : 0.08) * i;
        c.position.y += 0.06 * i;
        this.hand.add(c);
      }
    }
  }

  /** quadro: item na mão, quanto anda (m/s), quanto virou (rad) e luz ambiente */
  update(dt: number, id: string | undefined, n: number, speed: number, look: [number, number], light: { hemi: THREE.HemisphereLight; fire: number }): void {
    const want = id ?? '';
    const stackLook = id === 'wood' ? Math.min(n, 4) : Math.min(n, 3);
    if (want !== this.heldK || stackLook !== this.heldN) {
      if (want !== this.heldK) this.equipT = 0.28;
      this.build(id, stackLook);
    }
    this.hemi.intensity = light.hemi.intensity * 1.05 + 0.15;
    this.hemi.color.copy(light.hemi.color);
    this.hemi.groundColor.copy(light.hemi.groundColor);
    this.dir.intensity = 0.25 + light.hemi.intensity * 0.5;
    this.fire.intensity = light.fire * 2.5;
    this.fire.position.set(0, -0.2, -1.4);
    // trava no impacto
    const hdt = this.stopT > 0 ? 0 : dt;
    this.stopT = Math.max(0, this.stopT - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.walk += hdt * Math.min(speed, 6) * 1.9;
    const mv = Math.min(1, speed / 4);
    const bobX = Math.sin(this.walk) * 0.025 * mv;
    const bobY = -Math.abs(Math.cos(this.walk)) * 0.03 * mv + Math.sin(performance.now() / 700) * 0.004;
    // atraso ao virar (a mão "fica para trás")
    this.swayX += (-look[0] * 0.6 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (look[1] * 0.4 - this.swayY) * Math.min(1, dt * 10);
    this.swayX = Math.max(-0.08, Math.min(0.08, this.swayX));
    this.swayY = Math.max(-0.06, Math.min(0.06, this.swayY));
    const r = this.rig;
    r.position.set(bobX + this.swayX, bobY + this.swayY, 0);
    r.rotation.set(0, 0, 0);
    // trocar de item: sobe de baixo
    if (this.equipT > 0) {
      this.equipT = Math.max(0, this.equipT - dt);
      r.position.y -= (this.equipT / 0.28) * 0.35;
    }
    // golpe: levanta, desce rápido (pivô no punho)
    const h = this.hand;
    h.rotation.set(0, 0, 0);
    h.position.copy(this.base);
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - hdt);
      const k = 1 - this.swingT / this.swingLen;
      // impacto: trava curtinha + tremida
      if (k >= 0.42 && this.hitPend) {
        this.stopT = 0.06;
        this.shake = 0.1 * this.hitPend;
        this.hitPend = 0;
      }
      const ease = (a: number) => a * a * (3 - 2 * a);
      let px = 0, py = 0, pz = 0, rx = 0, rz = 0;
      if (k < 0.3) {
        // prepara: sobe e vai para trás
        const e = ease(k / 0.3);
        px = 0.04 * e;
        py = 0.1 * e;
        pz = 0.06 * e;
        rx = 0.7 * e;
        rz = -0.15 * e;
      } else if (k < 0.45) {
        // golpe: cruza para o centro e desce
        const e = (k - 0.3) / 0.15;
        px = 0.04 - 0.3 * e;
        py = 0.1 - 0.16 * e;
        pz = 0.06 - 0.2 * e;
        rx = 0.7 - 1.9 * e;
        rz = -0.15 + 0.75 * e;
      } else {
        // volta
        const e = ease((k - 0.45) / 0.55);
        px = -0.26 * (1 - e);
        py = -0.06 * (1 - e);
        pz = -0.14 * (1 - e);
        rx = -1.2 * (1 - e);
        rz = 0.6 * (1 - e);
      }
      h.position.x += px;
      h.position.y += py;
      h.position.z += pz;
      h.rotation.x = rx;
      h.rotation.z = rz;
    }
    if (this.throwT > 0) {
      this.throwT = Math.max(0, this.throwT - dt);
      const k = 1 - this.throwT / 0.35;
      h.position.z -= Math.sin(k * Math.PI) * 0.25;
      h.position.y += Math.sin(k * Math.PI) * 0.12;
      h.rotation.x = -Math.sin(k * Math.PI) * 0.5;
    }
    if (this.bump > 0) {
      this.bump = Math.max(0, this.bump - dt);
      h.position.y += Math.sin((this.bump / 0.25) * Math.PI) * 0.03;
    }
    const fl = h.getObjectByName('flame');
    if (fl) fl.scale.set(0.18, 0.32 + Math.sin(performance.now() / 60) * 0.04, 0.18);
  }

  render(r: THREE.WebGLRenderer): void {
    if (!this.visible || !this.heldK) return;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.scene, this.cam);
    r.autoClear = true;
  }
  dispose(): void {
    this.hand.clear();
  }
}

/** machado de 1ª pessoa: cabo comprido, cabeça de metal em cunha com fio claro */
function fpAxe(col: string): THREE.Object3D {
  const b = new PB();
  b.add(G.cyl, '#8a5228', 0, 0.28, 0, 0.055, 0.62, 0.055, 0, 0, 0, 0.3).add(G.cyl, '#5a3418', 0, 0.02, 0, 0.065, 0.1, 0.065);
  // cabeça: bloco escuro + lâmina (cor do machado) + fio brilhante
  b.add(G.box, '#4a4a58', 0.0, 0.56, 0, 0.09, 0.11, 0.07).add(G.box, col, 0.1, 0.56, 0, 0.14, 0.15, 0.035).add(G.box, '#f4f8ff', 0.18, 0.56, 0, 0.025, 0.19, 0.03);
  return new THREE.Mesh(b.geo(), vcMat());
}
