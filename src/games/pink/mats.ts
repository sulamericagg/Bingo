/* ============================================================
 *  BLOOP PINK — materiais (PBR) com texturas procedurais e reflexo barato
 *  (RoomEnvironment pré-filtrado = "mapa de ambiente" de estúdio, sem câmera cúbica).
 *  Um Kit por cena: tudo que ele cria é liberado em dispose().
 * ============================================================ */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { aoStripCanvas, contactShadowCanvas, labelCanvas, makeTex, stainCanvas, type TexId, type TexSet } from './tex';

/** força geral do reflexo do ambiente (o RoomEnvironment é claro: vira luz de preenchimento) */
const ENVK = 0.55;

export class Kit {
  readonly tier: number;
  private texs = new Map<TexId, TexSet>();
  private mats = new Map<string, THREE.Material>();
  private extra: (THREE.Texture | THREE.Material)[] = [];
  env: THREE.Texture | null = null;

  constructor(tier: number) {
    this.tier = tier;
  }

  /** mapa de ambiente para reflexos (chame 1× com o renderizador) */
  makeEnv(r: THREE.WebGLRenderer): THREE.Texture {
    if (this.env) return this.env;
    const pm = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    this.env = pm.fromScene(room, 0.04).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
    pm.dispose();
    return this.env;
  }

  tex(id: TexId): TexSet {
    let t = this.texs.get(id);
    if (!t) {
      t = makeTex(id);
      this.texs.set(id, t);
    }
    return t;
  }

  /** material com textura; `rep` = metros por repetição no UV em metros (uv já em metros: 1 = 1 m) */
  surf(key: string, id: TexId, o: { color?: string; rough?: number; metal?: number; envK?: number; normalK?: number; uvMeters?: boolean } = {}): THREE.MeshStandardMaterial {
    const k = 'S:' + key;
    let m = this.mats.get(k) as THREE.MeshStandardMaterial | undefined;
    if (m) return m;
    const ts = this.tex(id);
    // texturas compartilhadas, mas cada material pode ter repetição diferente → clona a referência
    const rep = o.uvMeters === false ? 1 : 1 / ts.meters;
    const cl = (t: THREE.Texture | null) => {
      if (!t) return null;
      const c = t.clone();
      c.repeat.set(rep, rep);
      c.needsUpdate = true;
      this.extra.push(c);
      return c;
    };
    m = new THREE.MeshStandardMaterial({
      map: cl(ts.map),
      normalMap: this.tier >= 1 ? cl(ts.normal) : null,
      roughnessMap: cl(ts.rough),
      roughness: o.rough ?? 1,
      metalness: o.metal ?? 0,
      color: new THREE.Color(o.color ?? '#ffffff'),
      envMap: this.env,
      envMapIntensity: (o.envK ?? 0.6) * ENVK,
    });
    if (m.normalMap) m.normalScale.setScalar(o.normalK ?? 1);
    this.mats.set(k, m);
    return m;
  }

  /** material liso (plástico, laca, metal) */
  plain(key: string, color: string, rough = 0.45, metal = 0, o: { envK?: number; emissive?: string; ei?: number; transparent?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
    const k = 'P:' + key;
    let m = this.mats.get(k) as THREE.MeshStandardMaterial | undefined;
    if (m) return m;
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: rough,
      metalness: metal,
      envMap: this.env,
      envMapIntensity: (o.envK ?? 0.8) * ENVK,
      emissive: new THREE.Color(o.emissive ?? '#000000'),
      emissiveIntensity: o.ei ?? 1,
      transparent: !!o.transparent,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
    });
    if (o.transparent) m.depthWrite = false;
    this.mats.set(k, m);
    return m;
  }

  /** vidro de vitrine/frasco: transparente com reflexo forte */
  glass(key = 'glass', tint = '#dff4ff', opacity = 0.22): THREE.MeshStandardMaterial {
    const k = 'G:' + key;
    let m = this.mats.get(k) as THREE.MeshStandardMaterial | undefined;
    if (m) return m;
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(tint), roughness: 0.03, metalness: 0.1, transparent: true, opacity, envMap: this.env, envMapIntensity: 1.6 * ENVK, depthWrite: false, side: THREE.DoubleSide });
    this.mats.set(k, m);
    return m;
  }

  /** material de canvas (placas, telas, rótulos) */
  canvasMat(key: string, cv: HTMLCanvasElement, o: { emissive?: number; rough?: number; transparent?: boolean; basic?: boolean } = {}): THREE.Material {
    const k = 'C:' + key;
    let m = this.mats.get(k);
    if (m) return m;
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.extra.push(t);
    if (o.basic) m = new THREE.MeshBasicMaterial({ map: t, transparent: !!o.transparent, toneMapped: false });
    else
      m = new THREE.MeshStandardMaterial({
        map: t,
        roughness: o.rough ?? 0.5,
        envMap: this.env,
        envMapIntensity: 0.5 * ENVK,
        emissive: new THREE.Color(o.emissive ? '#ffffff' : '#000000'),
        emissiveMap: o.emissive ? t : null,
        emissiveIntensity: o.emissive ?? 0,
        transparent: !!o.transparent,
      });
    this.mats.set(k, m);
    return m;
  }

  /** sombra de contato (plano preto suave — AO assada sob móveis) */
  shadowMat(): THREE.MeshBasicMaterial {
    return this.canvasMat('contact', contactShadowCanvas(), { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
  }
  aoMat(): THREE.MeshBasicMaterial {
    const m = this.canvasMat('aostrip', aoStripCanvas(), { basic: true, transparent: true }) as THREE.MeshBasicMaterial;
    m.depthWrite = false;
    return m;
  }
  labelMat(): THREE.MeshStandardMaterial {
    return this.canvasMat('label', labelCanvas(), { rough: 0.4 }) as THREE.MeshStandardMaterial;
  }
  stainMat(kind: 'dirt' | 'spill' | 'glass' | 'mud', v: number): THREE.MeshStandardMaterial {
    const key = 'stain' + kind + v;
    const m = this.canvasMat(key, stainCanvas(kind, 100 + v * 17), { rough: kind === 'spill' ? 0.08 : 0.9, transparent: true }) as THREE.MeshStandardMaterial;
    m.depthWrite = false;
    m.polygonOffset = true;
    m.polygonOffsetFactor = -4;
    m.polygonOffsetUnits = -4;
    return m;
  }

  track<T extends THREE.Texture | THREE.Material>(x: T): T {
    this.extra.push(x);
    return x;
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const t of this.texs.values()) {
      t.map.dispose();
      t.normal?.dispose();
      t.rough?.dispose();
    }
    for (const e of this.extra) e.dispose();
    this.env?.dispose();
    this.mats.clear();
    this.texs.clear();
    this.extra = [];
  }
}
