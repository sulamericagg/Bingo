/* ============================================================
 *  BLOOP STUDIO — materiais (plástico, metal, vidro, madeira, neon, borracha).
 *  Cache por (cor, acabamento, modo). Tiers 0–1 usam Lambert/Phong (baratos).
 * ============================================================ */
import * as THREE from 'three';
import type { Finish, Material } from '../format';

let rich = true; // MeshStandardMaterial
const cache = new Map<string, THREE.Material>();
let woodTex: THREE.Texture | null = null;

export function setMaterialQuality(standard: boolean): void {
  if (standard !== rich) disposeMaterials();
  rich = standard;
}

function wood(): THREE.Texture {
  if (woodTex) return woodTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#f4e6cf';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    const y = (i * 37) % 128;
    x.strokeStyle = `rgba(120,70,30,${0.08 + ((i * 13) % 7) / 50})`;
    x.lineWidth = 1 + ((i * 7) % 3);
    x.beginPath();
    x.moveTo(0, y);
    for (let k = 0; k <= 8; k++) x.lineTo(k * 16, y + Math.sin(k * 0.9 + i) * 3);
    x.stroke();
  }
  for (let p = 0; p < 4; p++) {
    x.fillStyle = 'rgba(90,50,20,.25)';
    x.fillRect(0, p * 32, 128, 1.5);
  }
  woodTex = new THREE.CanvasTexture(c);
  woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping;
  woodTex.colorSpace = THREE.SRGBColorSpace;
  return woodTex;
}

export interface MatOpts {
  /** fantasma (prévia de colocação / zona no editor) */
  ghost?: boolean;
  /** luz acesa (papel 'light' ligado) */
  lit?: boolean;
}

export function materialFor(m: Material, o: MatOpts = {}): THREE.Material {
  const key = `${m.c}|${m.k}|${o.ghost ? 1 : 0}${o.lit ? 1 : 0}|${rich ? 1 : 0}`;
  let mat = cache.get(key);
  if (mat) return mat;
  mat = make(m.c, m.k, o);
  cache.set(key, mat);
  return mat;
}

function make(hex: string, k: Finish, o: MatOpts): THREE.Material {
  const color = new THREE.Color(hex);
  let mat: THREE.Material;
  if (k === 'neon' || o.lit) {
    mat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(o.lit ? 1.25 : 1.1) });
  } else if (rich) {
    const s = new THREE.MeshStandardMaterial({ color });
    switch (k) {
      case 'metal':
        s.metalness = 0.85;
        s.roughness = 0.28;
        break;
      case 'glass':
        s.roughness = 0.05;
        s.metalness = 0.1;
        s.transparent = true;
        s.opacity = 0.38;
        s.depthWrite = false;
        break;
      case 'wood':
        s.map = wood();
        s.roughness = 0.75;
        break;
      case 'rubber':
        s.roughness = 0.95;
        break;
      default:
        s.roughness = 0.42;
    }
    mat = s;
  } else {
    if (k === 'metal' || k === 'glass') {
      const p = new THREE.MeshPhongMaterial({ color, shininess: k === 'metal' ? 90 : 120, specular: new THREE.Color(k === 'metal' ? 0xffffff : 0xcceeff) });
      if (k === 'glass') {
        p.transparent = true;
        p.opacity = 0.4;
        p.depthWrite = false;
      }
      mat = p;
    } else {
      const l = new THREE.MeshLambertMaterial({ color });
      if (k === 'wood') l.map = wood();
      mat = l;
    }
  }
  if (o.ghost) {
    mat.transparent = true;
    (mat as THREE.MeshBasicMaterial).opacity = 0.35;
    mat.depthWrite = false;
  }
  return mat;
}

/** contorno de seleção (cor única) */
let selMat: THREE.MeshBasicMaterial | null = null;
export function selectionMaterial(): THREE.MeshBasicMaterial {
  if (!selMat) selMat = new THREE.MeshBasicMaterial({ color: 0xffd34a, side: THREE.BackSide, transparent: true, opacity: 0.9, depthWrite: false });
  return selMat;
}

export function disposeMaterials(): void {
  for (const m of cache.values()) m.dispose();
  cache.clear();
  woodTex?.dispose();
  woodTex = null;
  selMat?.dispose();
  selMat = null;
}
