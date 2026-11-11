/* ============================================================
 *  CAVA & FALA — corpo composto das CRIAÇÕES (objeto falado).
 *  Física arcade estável: o objeto fica de pé (só gira em y), encosta
 *  no terreno/caixas por várias esferas de contato tiradas dos blocos
 *  de baixo; empuxo na água, voo com alvo de altura, atrito no chão.
 *  A inclinação (pitch/roll) é só visual, pela normal do chão.
 *  Sem efeitos/som (testável no Node).
 * ============================================================ */
import * as THREE from 'three';
import { pushBox, type OBox, type PhysWorld } from './phys';
import type { Voxels } from './voxel';

export interface Contact {
  x: number;
  y: number;
  z: number;
  r: number;
}
export interface CBody {
  p: THREE.Vector3;
  v: THREE.Vector3;
  yaw: number;
  wy: number;
  onGround: boolean;
  inWater: boolean;
  /** normal do chão (para inclinar o desenho) */
  gn: THREE.Vector3;
  contacts: Contact[];
  /** meia-altura (para água e voo) */
  h: number;
  /** força extra por passo (comportamentos preenchem) */
  f: THREE.Vector3;
  /** gravidade (0 = flutua no ar) */
  grav: number;
  /** quica ao bater (0..1) */
  bounce: number;
  /** flutua (empuxo) */
  buoy: boolean;
  /** caixas do próprio objeto (ignoradas na colisão dele) */
  own: Set<OBox>;
  /** última posição boa (contra NaN) */
  safe: THREE.Vector3;
  hitV: number;
}

/** esferas de contato: o bloco mais baixo de cada coluna (grade grossa) + 4 laterais */
export function contactsFrom(vx: Voxels): Contact[] {
  const cols = new Map<string, Contact>();
  const sx = vx.max[0] - vx.min[0],
    sz = vx.max[2] - vx.min[2];
  const cell = Math.max(vx.v * 2, Math.max(sx, sz) / 4);
  const r = Math.max(0.12, Math.min(0.45, vx.v * 0.9, cell * 0.45));
  for (const g of vx.groups) {
    // rodas e pernas contam (estão embaixo); hélices e asas não
    if (g.joint && (g.joint.type === 'spin' || (g.joint.type === 'hinge' && g.joint.axis === 'z'))) continue;
    for (const c of g.cells) {
      const x = c.x + g.pivot[0],
        y = c.y + g.pivot[1],
        z = c.z + g.pivot[2];
      const k = Math.floor(x / cell) + ',' + Math.floor(z / cell);
      const o = cols.get(k);
      const cy = y - vx.v / 2 + r;
      if (!o || cy < o.y) cols.set(k, { x, y: cy, z, r });
    }
  }
  let list = [...cols.values()];
  // só os que estão perto do fundo (senão o "teto" de uma coluna alta vira contato)
  const minY = Math.min(...list.map((c) => c.y));
  list = list.filter((c) => c.y < minY + Math.max(0.6, (vx.max[1] - vx.min[1]) * 0.35));
  if (list.length > 16) {
    list.sort((a, b) => a.y - b.y);
    list = list.slice(0, 16);
  }
  // laterais (meia altura) para bater em paredes
  const my = (vx.min[1] + vx.max[1]) / 2;
  const rr = Math.max(0.15, Math.min(sx, sz) * 0.3, 0.2);
  const cx = (vx.min[0] + vx.max[0]) / 2,
    cz = (vx.min[2] + vx.max[2]) / 2;
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ])
    list.push({ x: cx + dx * Math.max(0, sx / 2 - rr), y: Math.max(my, minY + rr), z: cz + dz * Math.max(0, sz / 2 - rr), r: rr });
  return list;
}

export function makeCBody(vx: Voxels, at: THREE.Vector3, yaw: number): CBody {
  return {
    p: at.clone(),
    v: new THREE.Vector3(),
    yaw,
    wy: 0,
    onGround: false,
    inWater: false,
    gn: new THREE.Vector3(0, 1, 0),
    contacts: contactsFrom(vx),
    h: (vx.max[1] - vx.min[1]) / 2,
    f: new THREE.Vector3(),
    grav: 1,
    bounce: 0,
    buoy: false,
    own: new Set(),
    safe: at.clone(),
    hitV: 0,
  };
}

const C = new THREE.Vector3();
const C0 = new THREE.Vector3();
const N = new THREE.Vector3();
const TN = new THREE.Vector3();
const ACC = new THREE.Vector3();

/** um passo da física do corpo composto */
export function stepCBody(w: PhysWorld, b: CBody, dt: number): void {
  const sp = b.v.length() * dt;
  const n = Math.min(5, Math.max(1, Math.ceil(sp / 0.25)));
  const h = dt / n;
  b.hitV = 0;
  const wasGround = b.onGround;
  b.onGround = false;
  let gnN = 0;
  ACC.set(0, 0, 0);
  for (let s = 0; s < n; s++) {
    b.v.y -= w.gravity * b.grav * h;
    b.v.addScaledVector(b.f, h);
    b.inWater = b.p.y + b.h * 0.3 < w.waterY;
    if (b.inWater) {
      if (b.buoy) b.v.y += (w.gravity * 1.25 + (w.waterY - (b.p.y + b.h * 0.3)) * 8) * h;
      else b.v.y += w.gravity * 0.6 * h;
      b.v.multiplyScalar(Math.max(0, 1 - 1.8 * h));
    }
    b.p.addScaledVector(b.v, h);
    b.yaw += b.wy * h;
    const cy = Math.cos(b.yaw),
      sy = Math.sin(b.yaw);
    for (const c of b.contacts) {
      // local → mundo (só yaw)
      C.set(b.p.x + c.x * cy + c.z * sy, b.p.y + c.y, b.p.z - c.x * sy + c.z * cy);
      C0.copy(C);
      for (let it = 0; it < 2; it++) {
        const d = w.terrain.sample(C.x, C.y, C.z);
        const pen = d + c.r;
        if (pen <= 0) break;
        w.terrain.normal(C.x, C.y, C.z, TN);
        C.addScaledVector(TN, Math.min(pen, 0.5));
        const vn = b.v.dot(TN);
        if (vn < 0) {
          b.hitV = Math.max(b.hitV, -vn);
          b.v.addScaledVector(TN, -vn * (1 + b.bounce));
        }
        if (TN.y > 0.45) {
          b.onGround = true;
          ACC.add(TN);
          gnN++;
        }
      }
      for (const bx of w.boxes) {
        if (!bx.active || b.own.has(bx)) continue;
        const pen = pushBox(bx, C, c.r, N);
        if (pen > 0) {
          const vn = b.v.dot(N);
          if (vn < 0) {
            b.hitV = Math.max(b.hitV, -vn);
            b.v.addScaledVector(N, -vn * (1 + b.bounce * 0.5));
          }
          if (N.y > 0.5) {
            b.onGround = true;
            ACC.add(N);
            gnN++;
          }
        }
      }
      // a correção do contato move o corpo todo (no máx. 0,5 m por passo)
      const dx = C.x - C0.x,
        dy = C.y - C0.y,
        dz = C.z - C0.z;
      if (dx || dy || dz) {
        const l = Math.hypot(dx, dy, dz);
        const k = l > 0.5 ? 0.5 / l : 1;
        b.p.x += dx * k;
        b.p.y += dy * k;
        b.p.z += dz * k;
      }
    }
    if (w.bounds) {
      const B = w.bounds;
      if (b.p.x < B.x0) (b.p.x = B.x0), (b.v.x = Math.max(0, b.v.x));
      if (b.p.x > B.x1) (b.p.x = B.x1), (b.v.x = Math.min(0, b.v.x));
      if (b.p.z < B.z0) (b.p.z = B.z0), (b.v.z = Math.max(0, b.v.z));
      if (b.p.z > B.z1) (b.p.z = B.z1), (b.v.z = Math.min(0, b.v.z));
    }
  }
  if (gnN) b.gn.copy(ACC).normalize();
  else if (!b.onGround) b.gn.lerp(N.set(0, 1, 0), Math.min(1, dt * 2));
  // atrito no chão
  if (b.onGround) {
    const k = Math.max(0, 1 - 5 * dt);
    b.v.x *= k;
    b.v.z *= k;
    b.wy *= Math.max(0, 1 - 6 * dt);
  } else b.wy *= Math.max(0, 1 - 1.5 * dt);
  // "gruda" no chão ao descer rampas
  if (!b.onGround && wasGround && b.v.y <= 0.3 && b.grav > 0) b.onGround = true;
  // limites de segurança
  const vl = b.v.length();
  if (vl > 32) b.v.multiplyScalar(32 / vl);
  if (!Number.isFinite(b.p.x + b.p.y + b.p.z + b.v.x + b.v.y + b.v.z + b.yaw)) {
    b.p.copy(b.safe);
    b.v.set(0, 0, 0);
    b.yaw = 0;
    b.wy = 0;
  } else if (b.onGround) b.safe.copy(b.p);
}
