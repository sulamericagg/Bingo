/* ============================================================
 *  CINE — curvas e trilhas de câmera (sem alocação no laço quente).
 *  Tempo em segundos. Todas as funções são puras.
 * ============================================================ */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** 0..1 dentro do intervalo [a, b] (fora: 0 ou 1) */
export const seg = (t: number, a: number, b: number): number => clamp((t - a) / Math.max(1e-6, b - a));
/** suave nas duas pontas (smoothstep) */
export const ease = (k: number): number => {
  k = clamp(k);
  return k * k * (3 - 2 * k);
};
/** mais suave ainda (smootherstep) — bom para gruas */
export const ease5 = (k: number): number => {
  k = clamp(k);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
export const easeOut = (k: number): number => 1 - Math.pow(1 - clamp(k), 3);
export const easeIn = (k: number): number => Math.pow(clamp(k), 3);
/** passa do ponto e volta (pulo/encaixe "boing") */
export const easeBack = (k: number, s = 1.7): number => {
  k = clamp(k) - 1;
  return k * k * ((s + 1) * k + s) + 1;
};
/** elástico curto (peças encaixando) */
export const easeElastic = (k: number): number => {
  k = clamp(k);
  if (k === 0 || k === 1) return k;
  return Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
/** sobe e desce 0→1→0 */
export const bump = (k: number): number => Math.sin(clamp(k) * Math.PI);
/** "pisca" entre 0 e 1 com chance (luz falhando), determinístico pelo tempo */
export function flicker(t: number, rate = 9, seed = 1): number {
  const a = Math.sin(t * rate + seed) * Math.sin(t * rate * 2.37 + seed * 3.1) * Math.sin(t * rate * 0.61 + seed * 7.7);
  return a > 0.18 ? 0 : 1;
}

export type Key3 = [t: number, x: number, y: number, z: number];

/**
 * Trilha de pontos 3D com tempo (Catmull-Rom centrípeta-ish, uniforme): passa por todos os
 * pontos, com velocidade suave. `ez` aplica uma curva ao tempo de cada trecho (padrão: linear
 * dentro da trilha inteira; use ease nas pontas com `smoothEnds`).
 */
export class Track3 {
  private k: Key3[];
  constructor(keys: Key3[], private smoothEnds = true) {
    this.k = keys.slice().sort((a, b) => a[0] - b[0]);
  }
  get t0(): number {
    return this.k[0][0];
  }
  get t1(): number {
    return this.k[this.k.length - 1][0];
  }
  at(t: number, out: THREE.Vector3): THREE.Vector3 {
    const k = this.k;
    if (k.length === 1 || t <= k[0][0]) return out.set(k[0][1], k[0][2], k[0][3]);
    const last = k[k.length - 1];
    if (t >= last[0]) return out.set(last[1], last[2], last[3]);
    // tempo global suavizado nas pontas (começa e termina parado)
    if (this.smoothEnds) {
      const g = (t - k[0][0]) / (last[0] - k[0][0]);
      t = k[0][0] + (last[0] - k[0][0]) * smoothEdge(g);
    }
    let i = 0;
    while (i < k.length - 2 && k[i + 1][0] <= t) i++;
    const p0 = k[Math.max(0, i - 1)];
    const p1 = k[i];
    const p2 = k[i + 1];
    const p3 = k[Math.min(k.length - 1, i + 2)];
    const u = clamp((t - p1[0]) / Math.max(1e-6, p2[0] - p1[0]));
    for (let c = 1; c <= 3; c++) {
      const v = cr(p0[c], p1[c], p2[c], p3[c], u);
      if (c === 1) out.x = v;
      else if (c === 2) out.y = v;
      else out.z = v;
    }
    return out;
  }
}
/** acelera no começo e freia no fim, mas é linear no meio (a câmera não "para" entre pontos) */
function smoothEdge(g: number): number {
  g = clamp(g);
  const e = 0.18;
  if (g < e) return (g * g) / (2 * e) / (1 - e);
  if (g > 1 - e) return 1 - ((1 - g) * (1 - g)) / (2 * e) / (1 - e);
  return (g - e / 2) / (1 - e);
}
function cr(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** câmera "na mão": tremidinha orgânica (ruído de senos), em metros/rad */
export function handheld(cam: THREE.Camera, t: number, amt = 1): void {
  cam.rotation.z += (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3) * 0.4) * 0.006 * amt;
  cam.rotateX((Math.sin(t * 1.3 + 1) * 0.5 + Math.sin(t * 3.1) * 0.2) * 0.004 * amt);
  cam.rotateY((Math.sin(t * 1.1 + 2) * 0.5 + Math.sin(t * 2.7 + 4) * 0.2) * 0.004 * amt);
}
