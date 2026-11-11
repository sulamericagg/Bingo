/* ============================================================
 *  ANOMALIAS (kit2) — materiais-padrão e peças comuns aos dois mapas:
 *  luminárias, sombras de contato, Bloops clientes, Sombrito, carros,
 *  postes, câmeras de segurança, lixeiras, plantas.
 * ============================================================ */
import * as THREE from 'three';
import { GeoBuilder } from '../../../../3d/common/geo';
import { MapCtx } from './ctx';
import { bloopGeo, sombritoGeo, type BloopPal, type Face, type Hat } from './chars';
import { blobTex, ceilingTex, glassTex, haloTex, plasterTex, steelTex, woodTex } from './tex';

/** materiais usados por todo mapa do kit */
export function stdMats(ctx: MapCtx): void {
  ctx.defMat('vc', {});
  ctx.defMat('glow', { glow: true });
  ctx.defMat('wall', { map: plasterTex(), uv: 0.5 });
  ctx.defMat('ceil', { map: ceilingTex(), uv: 1 / 0.6 });
  ctx.defMat('wood', { map: woodTex(), uv: 1.2 });
  ctx.defMat('steel', { map: steelTex(), uv: 1.5 });
  ctx.defMat('glass', { map: glassTex(), uv: 0.25, transparent: true, opacity: 0.4, order: 5, glow: true, side: THREE.DoubleSide });
  ctx.defMat('shadow', { map: blobTex(), glow: true, transparent: true, decal: true, order: 1, depthWrite: false, rawUv: true });
  ctx.defMat('halo', { map: haloTex(), glow: true, transparent: true, additive: true, order: 6, rawUv: true });
}

/** sombra de contato no chão (quadrado borrado) */
export function shadow(ctx: MapCtx, room: string, x: number, z: number, w: number, d: number, ry = 0, y = 0.006): void {
  const pg = new THREE.PlaneGeometry(w, d);
  pg.rotateX(-Math.PI / 2);
  // UV 0..1 (a textura é a sombra inteira) — GeoBuilder recalcula UV pelo mundo; refazemos depois
  const g = ctx.g(room, 'shadow');
  const ao = g.ao;
  g.ao = false;
  pg.rotateY(ry);
  pg.translate(x, y, z);
  g.geo(pg, '#ffffff');
  g.ao = ao;
}

/** halo aditivo (brilho em volta de lâmpadas / letreiros) — quad virado para (nx,nz) */
export function halo(ctx: MapCtx, room: string, x: number, y: number, z: number, w: number, h: number, col: string, ry = 0): void {
  const pg = new THREE.PlaneGeometry(w, h);
  pg.rotateY(ry);
  pg.translate(x, y, z);
  ctx.g(room, 'halo').geo(pg, col);
}

/**
 * Luminária de teto (placa que brilha) + ponto de luz assado.
 * kind 'panel' (placa 60×120), 'round' (spot embutido), 'tube' (calha de tubos)
 */
export function ceilLight(ctx: MapCtx, room: string, x: number, z: number, y = 3.2, kind: 'panel' | 'round' | 'tube' = 'panel', col = '#fff3dc', i = 1, reach = 7.5, lightRooms: string[] = [room], ry = 0): void {
  const v = ctx.g(room, 'vc');
  const gl = ctx.g(room, 'glow');
  if (kind === 'panel') {
    v.sharp(0.66, 0.04, 1.26, x, y - 0.04, z, '#d8d8d8', ry);
    gl.sharp(0.58, 0.01, 1.18, x, y - 0.05, z, col, ry);
  } else if (kind === 'round') {
    v.cyl(0.13, 0.13, 0.03, x, y - 0.03, z, '#d8d8d8', 14);
    gl.cyl(0.1, 0.1, 0.01, x, y - 0.035, z, col, 14);
  } else {
    v.sharp(0.22, 0.08, 1.5, x, y - 0.12, z, '#c8ccd2', ry);
    v.sharp(0.02, 0.12, 0.02, x, y - 0.12, z - 0.5, '#888', ry);
    v.sharp(0.02, 0.12, 0.02, x, y - 0.12, z + 0.5, '#888', ry);
    gl.cyl(0.03, 0.03, 1.4, x - 0.05, y - 0.15, z, col, 6, Math.PI / 2, 0, ry);
    gl.cyl(0.03, 0.03, 1.4, x + 0.05, y - 0.15, z, col, 6, Math.PI / 2, 0, ry);
  }
  ctx.light(lightRooms, x, y - 0.12, z, col, i, reach, 0.7, 0.1, true);
}

/* ------------------------------ Bloops ------------------------------ */

export interface BloopProp {
  mesh: THREE.Mesh;
  /** geometrias de rosto errado (já assadas no lugar) */
  faces: THREE.BufferGeometry[];
}
const FACE_SET: Face[] = ['bigmouth', 'cyclops', 'blank', 'manyeyes', 'spiral'];
/** cliente Bloop parado (malha única) com rostos alternativos prontos */
export function bloopProp(ctx: MapCtx, room: string, pal: BloopPal, x: number, y: number, z: number, ry: number, scale = 1.3, hat: Hat = '', pose: 'stand' | 'sit' = 'stand', faces: Face[] = FACE_SET): BloopProp {
  const seg = ctx.tier >= 2 ? 16 : ctx.tier === 1 ? 11 : 9;
  const geo = bloopGeo(pal, 'normal', hat, pose, seg);
  geo.scale(scale, scale, scale);
  const mesh = ctx.mesh(room, geo, 'vc', x, y, z, ry);
  const fl = faces.map((f) => {
    const g2 = bloopGeo(pal, f, hat, pose, seg);
    g2.scale(scale, scale, scale);
    return ctx.bakeAs(room, mesh, g2);
  });
  return { mesh, faces: fl };
}

let SOMB: { body: THREE.BufferGeometry; eyes: THREE.BufferGeometry } | null = null;
/** Sombrito (criatura de anomalia): grupo escondido até a anomalia ligar */
export function sombrito(ctx: MapCtx, room: string, x: number, y: number, z: number, ry = 0, scale = 1, parent: THREE.Object3D = ctx.roomGroup(room)): THREE.Group {
  if (!SOMB || !SOMB.body.getAttribute('position')) SOMB = sombritoGeo();
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  g.scale.setScalar(scale);
  parent.add(g);
  g.updateWorldMatrix(true, true);
  const body = SOMB.body.clone();
  const m = new THREE.Mesh(body, ctx.mat(room, 'vc'));
  g.add(m);
  ctx.bakeMesh(room, m);
  ctx.track(body);
  const eyes = new THREE.Mesh(SOMB.eyes, ctx.mat(room, 'glow'));
  g.add(eyes);
  g.visible = false;
  g.name = 'sombrito';
  return g;
}

/* ------------------------------ carros ------------------------------ */

/** carrinho fofo (frente = +Z), ~4 m. Faróis numa geometria "glow" e vidros numa "glass" à parte */
export function carGeo(col: string, kind: 'hatch' | 'van' | 'pickup' = 'hatch', tier = 1): { body: THREE.BufferGeometry; lights: THREE.BufferGeometry; glass: THREE.BufferGeometry } {
  const g = new GeoBuilder();
  g.bevel = tier >= 2 ? 2 : 1;
  const L = kind === 'van' ? 4.3 : 3.9;
  const W = 1.78;
  const dark = '#20232c';
  const gl = new GeoBuilder();
  gl.ao = false;
  // carroceria (até a linha da janela)
  g.box(W, 0.62, L, 0, 0.32, 0, col);
  g.box(W + 0.04, 0.16, L - 0.5, 0, 0.3, 0, dark); // faixa da saia
  const top = 0.94;
  if (kind === 'pickup') {
    g.box(W - 0.1, 0.12, 1.7, 0, top, 0.55, col);
    g.box(W - 0.02, 0.2, 1.7, 0, top, -1.05, col);
    g.box(W - 0.3, 0.06, 1.6, 0, top - 0.04, -1.05, '#2a2a30');
  }
  const cl = kind === 'van' ? 3.2 : kind === 'pickup' ? 1.6 : 2.2;
  const cz = kind === 'van' ? -0.25 : kind === 'pickup' ? 0.55 : -0.2;
  const ch = 0.6;
  // colunas e teto (cabine oca → dá para ver o motorista)
  for (const sx of [-1, 1])
    for (const fz of [-0.5, 0.5]) g.box(0.08, ch, 0.1, sx * (W / 2 - 0.1), top, cz + fz * (cl - 0.1), col);
  if (kind !== 'pickup') for (const sx of [-1, 1]) g.box(0.08, ch, 0.12, sx * (W / 2 - 0.1), top, cz - 0.15, col);
  g.box(W - 0.12, 0.08, cl, 0, top + ch, cz, col);
  // bancos e painel
  g.box(W - 0.4, 0.5, 0.45, 0, 0.5, cz - 0.05, '#3a3a44');
  g.box(W - 0.3, 0.18, 0.4, 0, 0.82, cz + cl / 2 - 0.25, '#2a2a30');
  g.cyl(0.14, 0.14, 0.03, -0.4, 0.95, cz + cl / 2 - 0.45, '#1a1a1e', 12, 1.1);
  // vidros
  gl.sharp(W - 0.2, ch, 0.02, 0, top, cz + cl / 2 - 0.02, '#2c3a52', 0, -0.25);
  gl.sharp(W - 0.2, ch, 0.02, 0, top, cz - cl / 2 + 0.02, '#2c3a52', 0, 0.2);
  if (kind === 'van') {
    // furgão: só a cabine da frente tem janela lateral; o baú é fechado
    const fl = 1.25;
    g.box(W - 0.12, ch, cl - fl, 0, top, cz - fl / 2, col);
    for (const sx of [-1, 1]) gl.sharp(0.02, ch - 0.02, fl - 0.15, sx * (W / 2 - 0.1), top, cz + cl / 2 - fl / 2, '#2c3a52');
  } else for (const sx of [-1, 1]) gl.sharp(0.02, ch - 0.02, cl - 0.2, sx * (W / 2 - 0.1), top, cz, '#2c3a52');
  // para-choques
  g.box(W - 0.1, 0.2, 0.16, 0, 0.26, L / 2 - 0.02, '#d8dade');
  g.box(W - 0.1, 0.2, 0.16, 0, 0.26, -L / 2 + 0.02, '#d8dade');
  g.box(0.5, 0.12, 0.04, 0, 0.42, -L / 2 - 0.02, '#f2f2f2'); // placa
  // rodas
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const wx = sx * (W / 2 - 0.12);
      const wz = sz * (L / 2 - 0.75);
      g.cyl(0.34, 0.34, 0.26, wx - sx * 0.13, 0.34, wz, '#1a1a1e', 14, 0, Math.PI / 2);
      g.cyl(0.2, 0.2, 0.27, wx - sx * 0.135, 0.34, wz, '#b8bcc6', 10, 0, Math.PI / 2);
    }
  // retrovisores
  for (const sx of [-1, 1]) g.box(0.14, 0.1, 0.12, sx * (W / 2 + 0.04), 0.92, cz + cl / 2 - 0.1, col);
  const l = new GeoBuilder();
  l.ao = false;
  for (const sx of [-1, 1]) {
    l.box(0.36, 0.16, 0.04, sx * 0.6, 0.48, L / 2 + 0.005, '#fff6d0');
    l.box(0.3, 0.14, 0.04, sx * 0.62, 0.5, -L / 2 - 0.005, '#ff3a3a');
  }
  return { body: g.build(), lights: l.build(), glass: gl.build() };
}
/** carro posicionado (corpo assado + faróis glow + vidros) */
export function car(ctx: MapCtx, room: string, col: string, x: number, z: number, ry: number, kind: 'hatch' | 'van' | 'pickup' = 'hatch', dynamic = true): THREE.Group {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  ctx.root.add(grp);
  grp.updateWorldMatrix(true, true);
  const c = carGeo(col, kind, ctx.tier);
  if (!dynamic) {
    // carro parado de cenário: tudo numa malha da camada da sala (vidro escuro opaco, faróis apagados)
    const g = ctx.g(room, 'vc');
    for (const [geo, tint] of [
      [c.body, ''],
      [c.lights, '#6a5a58'],
      [c.glass, '#3a4a60'],
    ] as [THREE.BufferGeometry, string][]) {
      geo.applyMatrix4(grp.matrixWorld);
      g.colored(geo, tint || undefined);
      geo.dispose();
    }
    shadow(ctx, room, x, z, Math.abs(Math.sin(ry)) > 0.5 ? 4.6 : 2.3, Math.abs(Math.sin(ry)) > 0.5 ? 2.3 : 4.6, 0, 0.003);
    ctx.root.remove(grp);
    return grp;
  }
  const b = new THREE.Mesh(c.body, ctx.mat(room, 'vc'));
  grp.add(b);
  ctx.bakeMesh(room, b);
  ctx.track(c.body);
  const l = new THREE.Mesh(c.lights, ctx.mat(room, 'glow'));
  grp.add(l);
  ctx.track(c.lights);
  const gm = new THREE.Mesh(c.glass, ctx.mat(room, 'glass'));
  gm.renderOrder = 5;
  grp.add(gm);
  ctx.track(c.glass);
  // sombra de contato (decalque próprio do grupo)
  const sh = new THREE.Mesh(ctx.track(shadowPlane(2.3, 4.6)), ctx.mat(room, 'shadow'));
  sh.position.y = 0.012;
  sh.renderOrder = 1;
  grp.add(sh);
  return grp;
}
let SHP: THREE.PlaneGeometry | null = null;
function shadowPlane(w: number, d: number): THREE.BufferGeometry {
  if (!SHP || !SHP.getAttribute('position')) {
    SHP = new THREE.PlaneGeometry(1, 1);
    SHP.rotateX(-Math.PI / 2);
    const n = SHP.getAttribute('position').count;
    SHP.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(1), 3));
  }
  const g = SHP.clone();
  g.scale(w, 1, d);
  return g;
}

/* ------------------------------ miudezas ------------------------------ */

/** câmera de segurança (domo/bala) — só visual, presa na parede/teto */
export function secCam(ctx: MapCtx, room: string, x: number, y: number, z: number, ry: number): void {
  const v = ctx.g(room, 'vc');
  const gl = ctx.g(room, 'glow');
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  v.box(0.08, 0.08, 0.08, x, y - 0.04, z, '#d8dade');
  v.box(0.14, 0.12, 0.28, x + fx * 0.14, y - 0.2, z + fz * 0.14, '#eef0f2', ry, 0.25);
  gl.sph(0.016, x + fx * 0.3, y - 0.17, z + fz * 0.3, '#ff2a2a', 1, 1, 1, 6);
}

/** vaso com planta (folhagem arredondada) */
export function plant(ctx: MapCtx, room: string, x: number, z: number, h = 1.1, pot = '#c86a3a'): void {
  const v = ctx.g(room, 'vc');
  v.lathe(
    [
      [0.0, 0],
      [0.17, 0],
      [0.22, 0.38],
      [0.24, 0.42],
      [0.0, 0.42],
    ],
    x,
    0,
    z,
    pot,
    14,
  );
  v.cyl(0.21, 0.21, 0.02, x, 0.4, z, '#4a3020', 12);
  const lv = ['#3f9a4a', '#58b85a', '#2f7a3a'];
  for (let i = 0; i < 7; i++) {
    const a = i * 2.4;
    const r = 0.12 + (i % 3) * 0.05;
    v.sph(0.2 + (i % 2) * 0.05, x + Math.cos(a) * r, 0.5 + h * 0.4 + (i % 3) * h * 0.15, z + Math.sin(a) * r, lv[i % 3], 1, 1.2, 1, 9);
  }
  ctx.boxAt(x, z, 0.5, 0.5);
}

/** lixeira com tampa vai-e-vem */
export function trashBin(g: GeoBuilder, x: number, z: number, col = '#3a7a5a', ry = 0): void {
  g.box(0.5, 0.95, 0.5, x, 0, z, col, ry);
  g.box(0.54, 0.08, 0.54, x, 0.95, z, '#2a2d34', ry);
  g.box(0.3, 0.12, 0.04, x, 0.82, z + 0.26, '#20232a', ry);
}

/** poste de luz da rua (cabeça virada para ry) + luz assada */
export function streetLamp(ctx: MapCtx, room: string, x: number, z: number, ry: number, h = 6, col = '#ffd59a', i = 1.4, reach = 14, rooms: string[] = [room]): void {
  const v = ctx.g(room, 'vc');
  const fx = Math.sin(ry);
  const fz = Math.cos(ry);
  v.cyl(0.08, 0.11, h, x, 0, z, '#5a5e66', 10);
  v.cyl(0.18, 0.2, 0.3, x, 0, z, '#4a4e56', 10);
  v.tube(
    [
      [x, h - 0.2, z],
      [x + fx * 0.4, h + 0.15, z + fz * 0.4],
      [x + fx * 1.1, h + 0.2, z + fz * 1.1],
    ],
    0.05,
    '#5a5e66',
    8,
    6,
  );
  v.box(0.36, 0.14, 0.6, x + fx * 1.25, h + 0.08, z + fz * 1.25, '#3a3e46', ry);
  ctx.g(room, 'glow').box(0.28, 0.02, 0.5, x + fx * 1.25, h + 0.06, z + fz * 1.25, col, ry);
  ctx.light(rooms, x + fx * 1.25, h - 0.3, z + fz * 1.25, col, i, reach, 1.2, 0.25, true);
  ctx.boxAt(x, z, 0.3, 0.3, 0, 4);
}
