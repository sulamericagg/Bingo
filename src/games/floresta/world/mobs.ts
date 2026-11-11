/* ============================================================
 *  MUNDO — bichos originais do Bloop World (fofos; alguns bravos
 *  à noite ou nas cavernas). Sem sangue: ao perder, viram fumaça
 *  com estrelinhas. Uma malha mesclada por bicho (1 draw call),
 *  animação por escala/rotação; IA simples (vagar, fugir, perseguir).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { geoms as G, mat4, mergeParts } from '../fps/models';
import type { Entity, MundoAPI } from './engine';

type Pt = { g: THREE.BufferGeometry; c: string; m: THREE.Matrix4; ao?: number };
const S = (x: number, y: number, z: number, r: number, c: string, sy = 1, sx = 1): Pt => ({ g: G.ico, c, m: mat4(x, y, z, r * sx, r * sy, r), ao: 0.25 });
const SPH = new THREE.SphereGeometry(1, 10, 7);
const O = (x: number, y: number, z: number, r: number, c: string, sy = 1, sx = 1): Pt => ({ g: SPH, c, m: mat4(x, y, z, r * sx, r * sy, r), ao: 0.3 });
const eyes = (y: number, z: number, d: number, r = 0.07): Pt[] => [O(-d, y, z, r * 1.5, '#ffffff'), O(d, y, z, r * 1.5, '#ffffff'), O(-d, y, z + r, r * 0.8, '#2a0b5c'), O(d, y, z + r, r * 0.8, '#2a0b5c')];

export interface MobDef {
  kind: string;
  name: () => string;
  hp: number;
  speed: number;
  hostile: boolean;
  dmg: number;
  r: number;
  h: number;
  /** voa / pula */
  move: 'walk' | 'hop' | 'float';
  drops: [string, number, number][];
  model: () => THREE.BufferGeometry;
}
export const MOBS: MobDef[] = [
  {
    kind: 'fofolhudo', name: () => t('mundo.mob.fofolhudo', 'Fofolhudo'), hp: 8, speed: 1.6, hostile: false, dmg: 0, r: 0.6, h: 1.1, move: 'walk',
    drops: [['la', 1, 3], ['folha', 1, 2]],
    model: () => mergeParts([O(0, 0.65, 0, 0.55, '#bff09a', 0.8, 0.9), S(0.25, 0.95, 0.15, 0.3, '#8ad86a'), S(-0.3, 0.9, -0.1, 0.32, '#9ae07a'), O(0, 0.75, 0.48, 0.28, '#fff6e0'), ...eyes(0.82, 0.68, 0.1), ...[-1, 1].flatMap((sx) => [O(sx * 0.25, 0.15, 0.25, 0.1, '#8a6440', 1.4), O(sx * 0.25, 0.15, -0.25, 0.1, '#8a6440', 1.4)])]),
  },
  {
    kind: 'pipoco', name: () => t('mundo.mob.pipoco', 'Pipoco'), hp: 4, speed: 2.4, hostile: false, dmg: 0, r: 0.35, h: 0.7, move: 'hop',
    drops: [['pena', 1, 2], ['ovo', 0, 1]],
    model: () => mergeParts([O(0, 0.38, 0, 0.36, '#ffd34a'), O(0, 0.42, 0.33, 0.09, '#ff8a3a', 0.6, 1.4), O(-0.32, 0.4, 0, 0.12, '#ffb02e', 0.5, 0.6), O(0.32, 0.4, 0, 0.12, '#ffb02e', 0.5, 0.6), O(0, 0.78, -0.05, 0.08, '#ff4f6a', 1.6), ...eyes(0.5, 0.28, 0.12, 0.05)]),
  },
  {
    kind: 'muguinho', name: () => t('mundo.mob.muguinho', 'Muguinho'), hp: 6, speed: 1.8, hostile: false, dmg: 0, r: 0.45, h: 0.9, move: 'walk',
    drops: [['cogumelo', 1, 3]],
    model: () => mergeParts([O(0, 0.35, 0, 0.35, '#fff0d8', 0.9), O(0, 0.72, 0, 0.5, '#ff5a6a', 0.45), O(0.2, 0.86, 0.15, 0.08, '#ffffff'), O(-0.18, 0.84, -0.12, 0.07, '#ffffff'), ...eyes(0.42, 0.3, 0.1, 0.05)]),
  },
  {
    kind: 'cascudo', name: () => t('mundo.mob.cascudo', 'Cascudo'), hp: 14, speed: 0.8, hostile: false, dmg: 0, r: 0.7, h: 0.8, move: 'walk',
    drops: [['casca', 1, 2]],
    model: () => mergeParts([O(0, 0.45, 0, 0.7, '#5aa86a', 0.55), O(0, 0.5, 0, 0.5, '#8ad89a', 0.6), O(0, 0.35, 0.7, 0.24, '#bff09a'), ...eyes(0.42, 0.85, 0.1, 0.05), ...[-1, 1].flatMap((sx) => [O(sx * 0.45, 0.15, 0.35, 0.14, '#bff09a'), O(sx * 0.45, 0.15, -0.35, 0.14, '#bff09a')])]),
  },
  {
    kind: 'gosmento', name: () => t('mundo.mob.gosmento', 'Gosmento'), hp: 8, speed: 2.6, hostile: true, dmg: 2, r: 0.55, h: 1, move: 'hop',
    drops: [['gosma', 1, 3]],
    model: () => mergeParts([O(0, 0.5, 0, 0.6, '#5ae07a', 0.8), O(0.2, 0.75, 0.3, 0.12, '#bfffc8'), O(-0.12, 0.95, 0.12, 0.08, '#bfffc8'), ...eyes(0.65, 0.48, 0.18, 0.07), O(0, 0.4, 0.55, 0.12, '#2a0b5c', 0.4, 1.8)]),
  },
  {
    kind: 'sombrinha', name: () => t('mundo.mob.sombrinha', 'Sombrinha'), hp: 6, speed: 3, hostile: true, dmg: 2, r: 0.5, h: 1, move: 'float',
    drops: [['po_sombra', 1, 2]],
    model: () => mergeParts([O(0, 0.6, 0, 0.5, '#3a2a6a'), O(0.3, 0.45, -0.2, 0.3, '#4a3a8a'), O(-0.3, 0.45, -0.2, 0.3, '#4a3a8a'), O(-0.15, 0.7, 0.42, 0.11, '#ffd34a'), O(0.15, 0.7, 0.42, 0.11, '#ffd34a')]),
  },
  {
    kind: 'pedregulho', name: () => t('mundo.mob.pedregulho', 'Pedregulho'), hp: 22, speed: 1.4, hostile: true, dmg: 4, r: 0.8, h: 1.7, move: 'walk',
    drops: [['pedra', 2, 5], ['min_ferro', 0, 2], ['cristal', 0, 1]],
    model: () => mergeParts([S(0, 0.95, 0, 0.7, '#7a7686', 1.1), S(0.75, 0.85, 0, 0.3, '#8a8696'), S(-0.75, 0.85, 0, 0.3, '#8a8696'), S(0.3, 0.25, 0, 0.28, '#6a6678'), S(-0.3, 0.25, 0, 0.28, '#6a6678'), S(0, 1.65, 0, 0.18, '#7af0ff', 1.6), O(-0.2, 1.1, 0.62, 0.09, '#7af0ff'), O(0.2, 1.1, 0.62, 0.09, '#7af0ff')]),
  },
  {
    kind: 'espinhoso', name: () => t('mundo.mob.espinhoso', 'Espinhoso'), hp: 10, speed: 2.2, hostile: true, dmg: 3, r: 0.6, h: 1.1, move: 'walk',
    drops: [['espinho', 1, 3], ['fibra', 0, 2]],
    model: () => {
      const p: Pt[] = [O(0, 0.6, 0, 0.55, '#4aa85a')];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        p.push({ g: G.cone, c: '#ffe08a', m: mat4(Math.cos(a) * 0.55, 0.6 + Math.sin(i * 1.7) * 0.25, Math.sin(a) * 0.55, 0.08, 0.3, 0.08, Math.sin(a) * 1.4, 0, -Math.cos(a) * 1.4) });
      }
      p.push(O(0, 1.12, 0, 0.12, '#ff7ab0'), ...eyes(0.7, 0.48, 0.15, 0.06));
      return mergeParts(p);
    },
  },
];
export const MOB = new Map(MOBS.map((m) => [m.kind, m]));
const GEO = new Map<string, THREE.BufferGeometry>();
let MAT: THREE.MeshLambertMaterial | null = null;


export class Mob implements Entity {
  id = 0;
  kind: string;
  x: number;
  y: number;
  z: number;
  r: number;
  h: number;
  hp: number;
  hostile: boolean;
  private d: MobDef;
  private mesh: THREE.Mesh;
  private yaw = Math.random() * Math.PI * 2;
  private tYaw = this.yaw;
  private vy = 0;
  private st: 'wander' | 'idle' | 'flee' | 'chase' = 'idle';
  private stT = 0;
  private atkT = 0;
  private hurtT = 0;
  private anim = Math.random() * 10;
  private kx = 0;
  private kz = 0;
  dead = false;
  constructor(api: MundoAPI, kind: string, x: number, y: number, z: number) {
    const d = MOB.get(kind)!;
    this.d = d;
    this.kind = 'mob:' + kind;
    this.x = x;
    this.y = y;
    this.z = z;
    this.r = d.r;
    this.h = d.h;
    this.hp = d.hp;
    this.hostile = d.hostile;
    let g = GEO.get(kind);
    if (!g) GEO.set(kind, (g = d.model()));
    MAT ??= new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(g, MAT);
    this.mesh.castShadow = api.tier >= 3;
    api.scene.add(this.mesh);
  }

  update(dt: number, api: MundoAPI): boolean {
    if (this.dead) return false;
    const P = api.player;
    const dx = P.x - this.x;
    const dz = P.z - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 70) return false; // longe demais: some
    this.stT -= dt;
    this.atkT -= dt;
    this.anim += dt;
    // decide
    if (this.hostile && api.mode !== 'pacifico' && dist < 16 && Math.abs(P.y - this.y) < 6 && !P.driving) this.st = 'chase';
    else if (this.st === 'chase') this.st = 'wander';
    if (this.stT <= 0 && this.st !== 'chase') {
      this.st = this.st === 'flee' ? 'wander' : Math.random() < 0.55 ? 'wander' : 'idle';
      this.stT = 2 + Math.random() * 4;
      this.tYaw = Math.random() * Math.PI * 2;
    }
    let sp = 0;
    if (this.st === 'wander') sp = this.d.speed * 0.5;
    else if (this.st === 'flee') {
      sp = this.d.speed * 1.5;
      this.tYaw = Math.atan2(-dx, -dz);
    } else if (this.st === 'chase') {
      sp = dist > this.r + 0.9 ? this.d.speed : 0;
      this.tYaw = Math.atan2(dx, dz);
      if (dist < this.r + 1.2 && this.atkT <= 0 && Math.abs(P.y - this.y) < 2) {
        this.atkT = 1.3;
        api.hurtPlayer(this.d.dmg, this.d.kind);
      }
    }
    let da = this.tYaw - this.yaw;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.yaw += da * Math.min(1, dt * 5);
    const hop = this.d.move === 'hop';
    const air = this.y > api.floorAt(this.x, this.y + 0.5, this.z) + 0.05;
    if (hop && sp > 0 && !air && this.vy <= 0) this.vy = 4.5 + Math.random();
    const mv = hop && !air ? 0 : sp;
    let nx = this.x + Math.sin(this.yaw) * mv * dt + this.kx * dt;
    let nz = this.z + Math.cos(this.yaw) * mv * dt + this.kz * dt;
    this.kx *= 1 - Math.min(1, dt * 5);
    this.kz *= 1 - Math.min(1, dt * 5);
    // parede ou água: vira
    if (api.dens(nx, this.y + this.h * 0.6, nz) > 0 || (this.d.move !== 'float' && api.isWater(nx, nz) && !this.hostile)) {
      nx = this.x;
      nz = this.z;
      this.tYaw += Math.PI * (0.5 + Math.random());
    }
    this.x = nx;
    this.z = nz;
    if (this.d.move === 'float') {
      const f = api.floorAt(this.x, this.y + 1, this.z);
      const ty = Math.max(f + 0.8, this.st === 'chase' ? P.y + 0.6 : f + 1.2) + Math.sin(this.anim * 2) * 0.2;
      this.y += (ty - this.y) * Math.min(1, dt * 2);
    } else {
      const f = api.floorAt(this.x, this.y + 0.6, this.z);
      this.vy -= 20 * dt;
      this.y += this.vy * dt;
      if (this.y <= f) {
        this.y = f;
        this.vy = 0;
      }
      const wl = api.waterLevel(this.x, this.z);
      if (this.y < wl - 0.4) {
        this.y = wl - 0.4;
        this.vy = 0;
      }
    }
    // pose
    this.hurtT = Math.max(0, this.hurtT - dt);
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    m.rotation.set(0, this.yaw, this.hurtT > 0 ? Math.sin(this.hurtT * 40) * 0.2 : 0);
    const sq = hop ? 1 + Math.max(-0.2, Math.min(0.25, this.vy * 0.05)) : 1 + Math.sin(this.anim * (sp > 0 ? 10 : 2)) * (sp > 0 ? 0.06 : 0.02);
    m.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    return true;
  }

  hit(dmg: number, from: string, api: MundoAPI): void {
    if (this.dead) return;
    this.hp -= dmg;
    this.hurtT = 0.35;
    const P = api.player;
    const dx = this.x - P.x;
    const dz = this.z - P.z;
    const d = Math.hypot(dx, dz) || 1;
    this.kx = (dx / d) * 7;
    this.kz = (dz / d) * 7;
    if (this.d.move !== 'float') this.vy = 4;
    if (!this.hostile) {
      this.st = 'flee';
      this.stT = 4;
    }
    api.burst(5, this.x, this.y + this.h * 0.6, this.z, '#ffffff', 3);
    api.sfx('tick');
    if (this.hp <= 0) {
      this.dead = true;
      api.burst(14, this.x, this.y + this.h * 0.5, this.z, '#e8e0ff', 4);
      api.burst(8, this.x, this.y + this.h * 0.7, this.z, '#ffd34a', 5);
      if (from === 'player' || from === 'boom')
        for (const [id, a, b] of this.d.drops) {
          const n = a + Math.floor(Math.random() * (b - a + 1));
          if (n > 0) api.give(id, n);
        }
      api.sfx('coin');
    }
  }

  save(): Record<string, unknown> | null {
    return null;
  }
  dispose(api: MundoAPI): void {
    api.scene.remove(this.mesh);
  }
}

/** quem nasce onde (bioma, noite/dia, profundidade) */
export class Spawner {
  private t = 0;
  private list: Entity[] = [];
  constructor(private cap: number) {}
  update(dt: number, api: MundoAPI): void {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    const mobs = api.entities().filter((e) => e.kind.startsWith('mob:'));
    if (mobs.length >= this.cap) return;
    const P = api.player;
    const a = Math.random() * Math.PI * 2;
    const r = 18 + Math.random() * 22;
    const x = P.x + Math.cos(a) * r;
    const z = P.z + Math.sin(a) * r;
    const surf = api.heightAt(x, z);
    const under = P.y < api.heightAt(P.x, P.z) - 6;
    let kind = '';
    let y = surf;
    if (under) {
      // caverna: procura ar perto da altura do jogador
      const yy = P.y + (Math.random() - 0.5) * 6;
      if (api.dens(x, yy + 0.5, z) > 0 || api.dens(x, yy + 1.5, z) > 0) return;
      y = api.floorAt(x, yy + 0.5, z);
      if (yy - y > 6) return;
      if (api.mode === 'pacifico') kind = Math.random() < 0.5 ? 'muguinho' : '';
      else kind = P.y < -28 && Math.random() < 0.45 ? 'pedregulho' : 'sombrinha';
    } else {
      if (api.isWater(x, z)) return;
      const b = api.biomeAt(x, z);
      const night = api.isNight();
      if (night && api.mode !== 'pacifico') kind = b === 8 || b === 6 ? 'espinhoso' : 'gosmento';
      else {
        const opts = b === 4 ? ['muguinho', 'muguinho', 'pipoco'] : b === 7 || b === 2 ? ['cascudo', 'pipoco', 'muguinho'] : b === 1 || b === 10 ? ['fofolhudo', 'fofolhudo', 'pipoco'] : ['fofolhudo', 'pipoco', 'pipoco', 'cascudo'];
        kind = opts[Math.floor(Math.random() * opts.length)];
      }
    }
    if (!kind) return;
    const n = MOB.get(kind)!.hostile ? 1 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) api.addEntity(new Mob(api, kind, x + i * 1.2, y, z + i * 0.8));
    void this.list;
  }
}
