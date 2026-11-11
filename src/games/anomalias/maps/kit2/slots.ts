/* ============================================================
 *  ANOMALIAS (kit2) — fábricas de pontos de anomalia reutilizáveis
 *  (cliente Bloop, luz da sala, porta, criatura em vários lugares,
 *  objeto genérico com cor alternativa).
 * ============================================================ */
import * as THREE from 'three';
import type { GeoBuilder } from '../../../../3d/common/geo';
import { A, addSlot, anim, buzz, type ApplyFn, type MapCtx } from './ctx';
import { bloopGeo, BLOOP_PALS, type BloopPal, type Hat } from './chars';
import { bloopProp, sombrito } from './props';
import type { AnomalyKind } from '../types';

type Fns = Partial<Record<AnomalyKind, ApplyFn>>;

/** cliente Bloop parado: rosto, cor, sumir, virar, tamanho (+ extras que o mapa passar) */
export function bloopSlot(
  ctx: MapCtx,
  id: string,
  room: string,
  pal: BloopPal,
  at: [number, number, number, number],
  o: { scale?: number; hat?: Hat; pose?: 'stand' | 'sit'; kinds?: AnomalyKind[]; move?: [number, number, number, number?][]; extra?: Fns } = {},
): THREE.Mesh {
  const sc = o.scale ?? 1.3;
  const pose = o.pose ?? 'stand';
  const b = bloopProp(ctx, room, pal, at[0], at[1], at[2], at[3], sc, o.hat ?? '', pose);
  const cols = BLOOP_PALS.filter((p) => p !== pal)
    .slice(0, 3)
    .map((p, i) => {
      const alt: BloopPal = i === 2 ? { light: '#3a3a44', dark: '#1a1a20', belly: '#6a6a74' } : p;
      const g = bloopGeo(alt, 'normal', o.hat ?? '', pose, ctx.tier >= 2 ? 16 : 12);
      g.scale(sc, sc, sc);
      return ctx.bakeAs(room, b.mesh, g);
    });
  const all: Fns = {
    face: A.geo(b.mesh, b.faces),
    color: A.geo(b.mesh, cols),
    missing: A.hide(b.mesh),
    rotate: A.rot(b.mesh, [
      [0, Math.PI, 0],
      [0, Math.PI / 2, 0],
      [0, -Math.PI / 2, 0],
    ]),
    scale: A.scale(b.mesh, [1.55, 0.55, 1.9]),
    ...(o.move ? { move: A.move(b.mesh, o.move) } : {}),
    ...(o.extra ?? {}),
  };
  const ks = o.kinds ?? (Object.keys(all) as AnomalyKind[]);
  const fns: Fns = {};
  for (const k of ks) if (all[k]) fns[k] = all[k];
  addSlot(ctx, id, room, b.mesh, fns, 5);
  return b.mesh;
}

/** luz da sala: 0 pisca · 1 avermelhada · 2 quase apagada · 3 esverdeada */
export function roomLightFn(ctx: MapCtx, room: string): ApplyFn {
  return (on, v) => {
    if (!on) return ctx.setRoomLight(room, 1, '#ffffff', 0);
    const i = v % 4;
    if (i === 0) ctx.setRoomLight(room, 1, '#ffffff', 1);
    else if (i === 1) ctx.setRoomLight(room, 0.9, '#ff8a8a', 0);
    else if (i === 2) ctx.setRoomLight(room, 0.32, '#c8d0ff', 0);
    else ctx.setRoomLight(room, 0.95, '#a8ffb8', 0);
  };
}

/** Sombritos escondidos em vários lugares (cada variação mostra um) */
export function creatures(ctx: MapCtx, room: string, spots: [number, number, number, number, number?][]): THREE.Group[] {
  return spots.map(([x, y, z, ry, s]) => sombrito(ctx, room, x, y, z, ry, s ?? 1));
}

/** objeto com geometria em cores alternativas: build(g, pal) → variações já assadas no lugar */
export function colorVariants<P>(ctx: MapCtx, room: string, m: THREE.Mesh, key: string, pals: P[], build: (g: GeoBuilder, p: P) => void): THREE.BufferGeometry[] {
  return pals.map((p) => {
    const g = ctx.gb(key);
    g.ao = false;
    build(g, p);
    return ctx.bakeAs(room, m, g.build());
  });
}

/** objeto girando sozinho / balançando / flutuando (anomalia animada) */
export const motion = {
  spin(ctx: MapCtx, o: THREE.Object3D, speed = 2): ApplyFn {
    return anim(ctx, o, (oo, t) => (oo.rotation.y += t * speed));
  },
  swing(ctx: MapCtx, o: THREE.Object3D, amp = 0.35, axis: 'x' | 'z' = 'z'): ApplyFn {
    return anim(ctx, o, (oo, t) => (oo.rotation[axis] += Math.sin(t * 2.2) * amp));
  },
  float(ctx: MapCtx, o: THREE.Object3D, h = 0.45): ApplyFn {
    return anim(ctx, o, (oo, t, v) => {
      oo.position.y += h * (1 + v * 0.8) + Math.sin(t * 1.6) * 0.06;
      oo.rotation.y += t * 0.3;
    });
  },
  bounce(ctx: MapCtx, o: THREE.Object3D, h = 0.12): ApplyFn {
    return anim(ctx, o, (oo, t) => {
      oo.position.y += Math.abs(Math.sin(t * 5)) * h;
      oo.rotation.z += Math.sin(t * 5) * 0.12;
    });
  },
  buzz,
};
