/**
 * Kit de montagem do gerador do OBJETO FALADO (determinístico, sem IA).
 * Peças com "slot" de cor (a/b/c = cores do tema) e etiqueta (body/wheel/wing/head/deco...),
 * que o compositor usa para trocar casco, pintar, encaixar acessórios.
 */
import type { Axis, ColorName, JointType, ObjMat, ObjPart, Shape, V3 } from '../cavaspec';

export type Slot = 'a' | 'b' | 'c' | ColorName;
export type Tag = 'body' | 'head' | 'leg' | 'arm' | 'wheel' | 'wing' | 'tail' | 'eye' | 'deco' | 'prop' | 'sail' | 'roof' | 'wall' | 'deck' | 'seat' | 'light' | 'leaf' | 'base';

export interface GPart {
  shape: Shape;
  size: V3;
  pos: V3;
  rot: V3;
  col: Slot;
  mat: ObjMat;
  tag: Tag;
  joint?: { type: JointType; axis: Axis; speed: number; swing: number; pivot?: V3 };
}

/** gerador pseudo-aleatório determinístico (mulberry32) */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const r2 = (v: number) => Math.round(v * 1000) / 1000;
const mk = (shape: Shape, size: V3, pos: V3, col: Slot, tag: Tag, rot: V3 = [0, 0, 0], mat: ObjMat = 'plastic'): GPart => ({
  shape,
  size: size.map(r2) as V3,
  pos: pos.map(r2) as V3,
  rot,
  col,
  mat,
  tag,
});

/* primitivas: tamanho = caixa (largura x, altura y, profundidade z); frente = +z */
export const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'body', rot?: V3, mat?: ObjMat) => mk('box', [w, h, d], [x, y, z], col, tag, rot, mat);
export const ball = (w: number, h: number, d: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'body', rot?: V3, mat?: ObjMat) => mk('sphere', [w, h, d], [x, y, z], col, tag, rot, mat);
export const cyl = (dia: number, h: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'body', rot?: V3, mat?: ObjMat, dz?: number) => mk('cylinder', [dia, h, dz ?? dia], [x, y, z], col, tag, rot, mat);
export const cone = (dia: number, h: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'deco', rot?: V3, mat?: ObjMat) => mk('cone', [dia, h, dia], [x, y, z], col, tag, rot, mat);
export const cap = (dia: number, h: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'body', rot?: V3, mat?: ObjMat) => mk('capsule', [dia, h, dia], [x, y, z], col, tag, rot, mat);
export const ring = (dia: number, tube: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'deco', rot?: V3, mat?: ObjMat) => mk('torus', [dia, tube, dia], [x, y, z], col, tag, rot, mat);
export const wedge = (w: number, h: number, d: number, x: number, y: number, z: number, col: Slot = 'a', tag: Tag = 'body', rot?: V3, mat?: ObjMat) => mk('wedge', [w, h, d], [x, y, z], col, tag, rot, mat);

export function joint(p: GPart, type: JointType, axis: Axis, speed: number, swing = 0, pivot?: V3): GPart {
  p.joint = { type, axis, speed, swing, ...(pivot ? { pivot } : {}) };
  return p;
}
export function mat(p: GPart, m: ObjMat): GPart {
  p.mat = m;
  return p;
}

/** dois olhos fofos (branco + pupila) virados para +z */
export function eyes(y: number, z: number, gap: number, r: number, x0 = 0, look = 1): GPart[] {
  const o: GPart[] = [];
  for (const s of [-1, 1]) {
    o.push(ball(r, r, r * 0.7, x0 + s * gap, y, z, 'white', 'eye'));
    o.push(ball(r * 0.55, r * 0.55, r * 0.4, x0 + s * gap, y + r * 0.05, z + r * 0.3 * look, 'black', 'eye'));
  }
  return o;
}
/** roda com eixo em x (gira junto com o movimento) */
export function wheel(x: number, y: number, z: number, dia: number, w = 0.3, col: Slot = 'black', hub: Slot = 'silver'): GPart[] {
  return [joint(cyl(dia, w, x, y, z, col, 'wheel', [0, 0, 90], 'rubber'), 'wheel', 'x', 1), joint(cyl(dia * 0.45, w + 0.04, x, y, z, hub, 'wheel', [0, 0, 90], 'metal'), 'wheel', 'x', 1)];
}
/** hélice (gira em y por padrão) */
export function rotor(x: number, y: number, z: number, span: number, col: Slot = 'gray', axis: Axis = 'y'): GPart[] {
  const rot: V3 = axis === 'y' ? [0, 0, 0] : axis === 'z' ? [90, 0, 0] : [0, 0, 90];
  const a = joint(box(span, 0.06, span * 0.14, x, y, z, col, 'prop', rot), 'spin', axis, 2.5);
  const b = joint(box(span * 0.14, 0.06, span, x, y, z, col, 'prop', rot), 'spin', axis, 2.5);
  if (axis === 'z') {
    a.size = [span, span * 0.14, 0.06];
    a.rot = [0, 0, 0];
    b.size = [span * 0.14, span, 0.06];
    b.rot = [0, 0, 0];
  }
  return [a, b, cyl(span * 0.16, 0.14, x, y, z, 'c', 'prop', rot)];
}
/** asa que bate (articulada no ombro) */
export function wing(side: number, x: number, y: number, z: number, span: number, chord: number, col: Slot, speed = 1.6, swing = 28): GPart {
  const p = ball(span, chord * 0.18, chord, x + side * span * 0.5, y, z, col, 'wing');
  return joint(p, 'hinge', 'z', speed * side, swing, [x, y, z]);
}

export function bboxOf(parts: GPart[]): { min: V3; max: V3 } {
  const min: V3 = [Infinity, Infinity, Infinity];
  const max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const p of parts) {
    const rotated = p.rot.some((r) => Math.abs(r % 180) > 1);
    let h: V3 = [p.size[0] / 2, p.size[1] / 2, p.size[2] / 2];
    if (rotated) {
      if (p.rot.every((r) => Math.abs(r % 90) < 1)) {
        let [a, b, c] = h;
        if (Math.round(p.rot[0] / 90) % 2) [b, c] = [c, b];
        if (Math.round(p.rot[1] / 90) % 2) [a, c] = [c, a];
        if (Math.round(p.rot[2] / 90) % 2) [a, b] = [b, a];
        h = [a, b, c];
      } else {
        const m = Math.hypot(...h) * 0.8;
        h = [Math.max(h[0], m * 0.7), Math.max(h[1], m * 0.7), Math.max(h[2], m * 0.7)];
      }
    }
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p.pos[i] - h[i]);
      max[i] = Math.max(max[i], p.pos[i] + h[i]);
    }
  }
  return { min, max };
}

/** move/escala uma lista de peças (s = escala por eixo) */
export function xform(parts: GPart[], s: V3, t: V3): GPart[] {
  for (const p of parts) {
    p.pos = [r2(p.pos[0] * s[0] + t[0]), r2(p.pos[1] * s[1] + t[1]), r2(p.pos[2] * s[2] + t[2])];
    // tamanho: escala no eixo local aproximado (rotação de 90° troca eixos)
    let k: V3 = s;
    if (p.rot.some((r) => Math.abs(r % 180) > 1) && p.rot.every((r) => Math.abs(r % 90) < 1)) {
      let [a, b, c] = s;
      if (Math.round(p.rot[0] / 90) % 2) [b, c] = [c, b];
      if (Math.round(p.rot[1] / 90) % 2) [a, c] = [c, a];
      if (Math.round(p.rot[2] / 90) % 2) [a, b] = [b, a];
      k = [a, b, c];
    } else if (p.rot.some((r) => Math.abs(r % 180) > 1)) {
      const u = Math.cbrt(s[0] * s[1] * s[2]);
      k = [u, u, u];
    }
    p.size = [r2(p.size[0] * k[0]), r2(p.size[1] * k[1]), r2(p.size[2] * k[2])];
    if (p.joint?.pivot) p.joint.pivot = [r2(p.joint.pivot[0] * s[0] + t[0]), r2(p.joint.pivot[1] * s[1] + t[1]), r2(p.joint.pivot[2] * s[2] + t[2])];
  }
  return parts;
}

export function toObjParts(parts: GPart[], colors: [ColorName, ColorName, ColorName]): ObjPart[] {
  return parts.map((p) => {
    const color: ColorName = p.col === 'a' ? colors[0] : p.col === 'b' ? colors[1] : p.col === 'c' ? colors[2] : p.col;
    const o: ObjPart = { shape: p.shape, size: p.size, pos: p.pos, rot: p.rot, color, mat: p.mat };
    if (p.joint) o.joint = { ...p.joint };
    return o;
  });
}
