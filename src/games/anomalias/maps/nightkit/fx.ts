/* ============================================================
 *  NIGHTKIT — efeitos de anomalia reutilizáveis. Cada função devolve um
 *  "handler" (on:boolean) => void que liga a variação e, ao desligar,
 *  volta EXATAMENTE ao estado guardado no momento em que foi criado.
 *  Crie os handlers DEPOIS de posicionar o objeto.
 * ============================================================ */
import * as THREE from 'three';
import { bakedClone } from './bake';
import type { MapKit } from './kit';

export type H = (on: boolean) => void;

/** desloca/gira (em relação à pose original) */
export function moveBy(o: THREE.Object3D, dx: number, dy: number, dz: number, ry = 0, rx = 0, rz = 0): H {
  const p = o.position.clone();
  const r = o.rotation.clone();
  return (on) => {
    o.position.copy(p);
    o.rotation.copy(r);
    if (on) {
      o.position.x += dx;
      o.position.y += dy;
      o.position.z += dz;
      o.rotation.x += rx;
      o.rotation.y += ry;
      o.rotation.z += rz;
    }
  };
}
/** pose absoluta (posição/rotação local) */
export function poseAt(o: THREE.Object3D, x: number, y: number, z: number, ry?: number, rx = 0, rz = 0): H {
  const p = o.position.clone();
  const r = o.rotation.clone();
  return (on) => {
    if (on) {
      o.position.set(x, y, z);
      o.rotation.set(rx, ry ?? r.y, rz);
    } else {
      o.position.copy(p);
      o.rotation.copy(r);
    }
  };
}
export function rotBy(o: THREE.Object3D, rx: number, ry: number, rz: number): H {
  return moveBy(o, 0, 0, 0, ry, rx, rz);
}
export function hide(o: THREE.Object3D): H {
  const v = o.visible;
  return (on) => (o.visible = on ? false : v);
}
/** mostra um objeto que fica escondido (cópia a mais, criatura, silhueta) */
export function show(o: THREE.Object3D): H {
  o.visible = false;
  return (on) => (o.visible = on);
}
/** troca A por B (B nasce escondido) */
export function swap(a: THREE.Object3D, b: THREE.Object3D): H {
  b.visible = false;
  return (on) => {
    a.visible = !on;
    b.visible = on;
  };
}
export function scaleBy(o: THREE.Object3D, sx: number, sy = sx, sz = sx): H {
  const s = o.scale.clone();
  return (on) => {
    o.scale.copy(s);
    if (on) o.scale.multiply(new THREE.Vector3(sx, sy, sz));
  };
}
/** vários handlers juntos */
export function all(...hs: H[]): H {
  return (on) => {
    for (const h of hs) h(on);
  };
}

const tintCache = new WeakMap<THREE.Material, Map<string, THREE.Material>>();
/** tinge todas as malhas do objeto (material clonado, mesmo shader: sem recompilar) */
export function tint(k: MapKit, o: THREE.Object3D, color: THREE.ColorRepresentation, only?: (m: THREE.Mesh) => boolean): H {
  const meshes: THREE.Mesh[] = [];
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && !Array.isArray(m.material) && (!only || only(m))) meshes.push(m);
  });
  const orig = meshes.map((m) => m.material as THREE.Material);
  const key = new THREE.Color(color).getHexString();
  const alt = orig.map((m) => {
    let mm = tintCache.get(m);
    if (!mm) tintCache.set(m, (mm = new Map()));
    let c = mm.get(key);
    if (!c) {
      c = m.userData.bake ? bakedClone(m, k.baker.power) : m.clone();
      const cm = c as THREE.MeshLambertMaterial;
      if (cm.color) cm.color.set(color);
      mm.set(key, c);
    }
    return c;
  });
  return (on) => meshes.forEach((m, i) => (m.material = on ? alt[i] : orig[i]));
}
/** troca o material de uma malha */
export function matSwap(m: THREE.Mesh, alt: THREE.Material): H {
  const o = m.material;
  return (on) => (m.material = on ? alt : o);
}
/** troca a textura (map) de um material (o quadro mudou) */
export function texSwap(mat: THREE.Material, t: THREE.Texture): H {
  const mm = mat as THREE.MeshLambertMaterial;
  const o = mm.map;
  return (on) => {
    mm.map = on ? t : o;
  };
}
/** anima enquanto ligado (piscar, girar ao contrário, balançar) */
export function animate(k: MapKit, f: (dt: number, t: number) => void, reset?: () => void): H {
  let off: (() => void) | null = null;
  return (on) => {
    if (on && !off) off = k.anim(f);
    else if (!on && off) {
      off();
      off = null;
      reset?.();
    }
  };
}
/** pisca (visible) um objeto — lâmpada falhando */
export function flicker(k: MapKit, objs: THREE.Object3D[], speed = 1): H {
  const v = objs.map((o) => o.visible);
  return animate(
    k,
    (_dt, t) => {
      const s = Math.sin(t * 23 * speed) + Math.sin(t * 7.3 * speed + 1) + Math.sin(t * 2.1 * speed);
      const on = s > -0.6;
      for (const o of objs) o.visible = on;
    },
    () => objs.forEach((o, i) => (o.visible = v[i])),
  );
}
