/* ============================================================
 *  NIGHTKIT — luz "assada" nos vértices (zero custo por pixel).
 *  Cada lâmpada do cenário vira uma contribuição calculada UMA vez
 *  na montagem e gravada em dois atributos por vértice:
 *    bakeA = luzes principais (o núcleo apaga com setPower(false))
 *    bakeB = luzes noturnas (abajur, luz de tomada, lua) — sempre acesas
 *  O material é um Lambert comum (aceita a lanterna/luzes reais do núcleo,
 *  neblina, mapas) com 6 linhas de shader a mais. Malhas instanciadas
 *  recebem os mesmos atributos por instância (InstancedBufferAttribute).
 *  Cada luz só ilumina a caixa da sala dela (sem vazar pela parede).
 * ============================================================ */
import * as THREE from 'three';

export type LightGroup = 'main' | 'night';

export interface BakeLight {
  p: THREE.Vector3;
  c: THREE.Color;
  /** intensidade (1 ≈ lâmpada de teto clara a 1 m) */
  i: number;
  /** alcance (m) — a luz some suave até aqui */
  r: number;
  g: LightGroup;
  /** só ilumina vértices dentro desta caixa (sala) */
  box?: THREE.Box3;
  /** "luminária de teto": metade de baixo mais forte */
  down?: boolean;
  /** não ilumina dentro destas caixas (interiores, para a lua/postes de fora) */
  ex?: THREE.Box3[];
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _l = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _c = new THREE.Color();

export class Baker {
  readonly lights: BakeLight[] = [];
  /** 1 = energia ligada; o núcleo pisca/apaga via setPower */
  readonly power = { value: 1 };
  /** luz ambiente assada (grupo noturno) — preenchimento mínimo para nada ficar preto */
  ambient = new THREE.Color('#1a2038');
  /** ambiente extra quando a energia está ligada */
  ambientMain = new THREE.Color('#2a2630');
  private mats: THREE.Material[] = [];

  add(x: number, y: number, z: number, color: THREE.ColorRepresentation, i: number, r: number, g: LightGroup = 'main', box?: THREE.Box3, down = true): BakeLight {
    const L: BakeLight = { p: new THREE.Vector3(x, y, z), c: new THREE.Color(color), i, r, g, box, down };
    this.lights.push(L);
    return L;
  }

  /** Lambert com luz assada. Use em tudo que é cenário. */
  mat(o: THREE.MeshLambertMaterialParameters = {}): THREE.MeshLambertMaterial {
    const m = new THREE.MeshLambertMaterial(o);
    patch(m, this.power);
    this.mats.push(m);
    return m;
  }
  /** adapta um material Lambert já existente (natureza etc.) */
  adopt<T extends THREE.Material>(m: T): T {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey.bind(m);
    const pw = this.power;
    m.userData.bake = true;
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      inject(sh, pw);
    };
    m.customProgramCacheKey = () => prevKey() + '|bake1';
    return m;
  }

  /** calcula a luz de um ponto (p, n em mundo) para os dois grupos */
  private light(p: THREE.Vector3, n: THREE.Vector3, outA: THREE.Color, outB: THREE.Color): void {
    const up = Math.max(0, n.y) * 0.25 + 0.75;
    outA.copy(this.ambientMain).multiplyScalar(up);
    outB.copy(this.ambient).multiplyScalar(up);
    for (const L of this.lights) {
      if (L.box && !L.box.containsPoint(p)) continue;
      if (L.ex && L.ex.some((b) => b.containsPoint(p))) continue;
      let att: number;
      if (L.r <= 0) {
        // direcional (lua): sem queda com a distância; p = direção
        _l.copy(L.p).normalize();
        att = L.i;
      } else {
        _l.subVectors(L.p, p);
        const d = _l.length();
        if (d >= L.r) continue;
        _l.multiplyScalar(1 / Math.max(1e-4, d));
        const k = 1 - (d / L.r) * (d / L.r);
        att = (k * k * L.i) / (1 + d * d * 0.35);
      }
      // meio-Lambert: sombra própria suave (pelúcias, paredes curvas)
      const ndl = Math.max(0, (n.dot(_l) + 0.35) / 1.35);
      if (L.down && p.y > L.p.y - 0.05) att *= 0.6; // acima da luminária: só o rebote
      const out = L.g === 'main' ? outA : outB;
      out.r += L.c.r * att * ndl;
      out.g += L.c.g * att * ndl;
      out.b += L.c.b * att * ndl;
    }
  }

  /** grava bakeA/bakeB numa malha (posições no mundo atual) */
  bakeMesh(mesh: THREE.Mesh): void {
    const geo = mesh.geometry as THREE.BufferGeometry;
    mesh.updateWorldMatrix(true, false);
    const A = new THREE.Color();
    const B = new THREE.Color();
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const im = mesh as THREE.InstancedMesh;
      const n = im.count;
      const a = new Float32Array(Math.max(1, im.instanceMatrix.count) * 3);
      const b = new Float32Array(a.length);
      const m4 = new THREE.Matrix4();
      geo.computeBoundingBox();
      const cy = geo.boundingBox ? (geo.boundingBox.min.y + geo.boundingBox.max.y) * 0.5 : 0;
      for (let i = 0; i < n; i++) {
        im.getMatrixAt(i, m4);
        _p.set(0, cy, 0).applyMatrix4(m4).applyMatrix4(im.matrixWorld);
        _n.set(0, 1, 0);
        this.light(_p, _n, A, B);
        // instância: mistura de "de cima" e "de lado" (média grosseira)
        const tA = A.clone();
        const tB = B.clone();
        _n.set(0, 0.2, 1).normalize();
        this.light(_p, _n, A, B);
        a[i * 3] = (tA.r + A.r) * 0.5;
        a[i * 3 + 1] = (tA.g + A.g) * 0.5;
        a[i * 3 + 2] = (tA.b + A.b) * 0.5;
        b[i * 3] = (tB.r + B.r) * 0.5;
        b[i * 3 + 1] = (tB.g + B.g) * 0.5;
        b[i * 3 + 2] = (tB.b + B.b) * 0.5;
      }
      geo.setAttribute('bakeA', new THREE.InstancedBufferAttribute(a, 3));
      geo.setAttribute('bakeB', new THREE.InstancedBufferAttribute(b, 3));
      return;
    }
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    if (!pos || !nor) return;
    const a = new Float32Array(pos.count * 3);
    const b = new Float32Array(pos.count * 3);
    _m3.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      _p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      _n.fromBufferAttribute(nor, i).applyMatrix3(_m3).normalize();
      // empurra o ponto um tiquinho para fora (vértice no canto da parede cai na sala certa)
      _p.addScaledVector(_n, 0.02);
      this.light(_p, _n, A, B);
      a[i * 3] = A.r;
      a[i * 3 + 1] = A.g;
      a[i * 3 + 2] = A.b;
      b[i * 3] = B.r;
      b[i * 3 + 1] = B.g;
      b[i * 3 + 2] = B.b;
    }
    geo.setAttribute('bakeA', new THREE.BufferAttribute(a, 3));
    geo.setAttribute('bakeB', new THREE.BufferAttribute(b, 3));
  }

  /** assa todas as malhas com material "assado" debaixo de root */
  bakeAll(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || o.userData.noBake) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!mats.some((x) => x.userData.bake)) return;
      this.bakeMesh(m);
    });
  }

  /** cor média que um ponto recebe (para sprites/decalques combinarem) */
  sample(x: number, y: number, z: number): THREE.Color {
    const A = new THREE.Color();
    const B = new THREE.Color();
    this.light(_p.set(x, y, z), _n.set(0, 1, 0), A, B);
    return _c.copy(A).add(B).clone();
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
    this.mats.length = 0;
  }
}

function inject(sh: THREE.WebGLProgramParametersWithUniforms, pw: { value: number }): void {
  sh.uniforms.uPow = pw;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 bakeA;\nattribute vec3 bakeB;\nuniform float uPow;\nvarying vec3 vBake;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = bakeA * uPow + bakeB;');
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBake;')
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse += vBake * diffuseColor.rgb;');
}

function patch(m: THREE.Material, pw: { value: number }): void {
  m.userData.bake = true;
  m.onBeforeCompile = (sh) => inject(sh, pw);
  m.customProgramCacheKey = () => 'bake1';
}

/** cópia de um material assado (mesmo shader, outra cor/textura) — para anomalias de cor */
export function bakedClone<T extends THREE.Material>(m: T, pw: { value: number }): T {
  const c = m.clone() as T;
  patch(c, pw);
  return c;
}
