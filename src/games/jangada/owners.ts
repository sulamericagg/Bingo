/* ============================================================
 *  JANGADA BLOOP — donos das ilhas (facções originais, fofas):
 *   - AMIGOS (Reino dos Caranguejos, Colônia dos Pinguins): o chefe
 *     acena e troca coisas (e dá um pedido que revela ilhas no mapa);
 *     os cidadãos passeiam.
 *   - TERRITORIAIS (Tribo dos Macacos, Lagartos de Fogo, Piratas
 *     Fantasmas): rondam o baú raro. Se virem você ("!"), correm e dão
 *     uma "bonkada" (dano pequeno + empurrão). Dá para:
 *       · ESGUEIRAR (agachado eles só enxergam bem de perto),
 *       · DISTRAIR (jogue uma comida: eles vão comer),
 *       · VENCER (lança/arpão: ficam tontos com estrelinhas, sem sangue).
 *     Piratas fantasmas fogem da luz da lanterna.
 *  Simulação local em cada aparelho (só o resultado — baú aberto — é
 *  sincronizado pelo anfitrião).
 * ============================================================ */
import * as THREE from 'three';
import { FACTIONS, type Faction } from './biomes';
import type { Island } from './island';
import { alertMark, dizzyStars, npcModel, type NpcModel } from './models2';

export type NpcSt = 'idle' | 'walk' | 'patrol' | 'alert' | 'chase' | 'eat' | 'dizzy' | 'home' | 'wave';
export interface Npc {
  id: number;
  f: Faction;
  chief: boolean;
  m: NpcModel;
  x: number;
  z: number;
  y: number;
  yaw: number;
  st: NpcSt;
  t: number;
  hx: number;
  hz: number;
  tx: number;
  tz: number;
  hp: number;
  bonkT: number;
  ph: number;
  mark: THREE.Mesh;
  stars: THREE.Group;
  food: THREE.Mesh | null;
}
export interface OwnerCtx {
  /** jogador (mundo) */
  px: number;
  py: number;
  pz: number;
  sneak: boolean;
  swim: boolean;
  /** lanterna acesa na mão (luz) */
  light: boolean;
  night: number;
  /** guarda bateu no jogador */
  bonk(dmg: number, fromX: number, fromZ: number): void;
  /** guarda viu o jogador (som/aviso) */
  seen(n: Npc): void;
  /** fala/sons */
  voice(n: Npc, kind: 'hi' | 'alert' | 'bonk' | 'eat' | 'dizzy'): void;
}
const angTo = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export class Owners {
  readonly npcs: Npc[] = [];
  readonly faction: Faction;
  readonly friendly: boolean;
  private time = 0;
  private alertT = 0;
  constructor(
    private isl: Island,
    dizzyMult = 1,
  ) {
    this.faction = isl.def.owner;
    this.friendly = this.faction === 'crab' || this.faction === 'penguin';
    void dizzyMult;
    if (this.faction === 'none') return;
    let id = 1;
    for (const [i, [x, z]] of isl.ownerSpots.entries()) {
      const chief = this.friendly && i === 0;
      const m = npcModel(this.faction, chief);
      const mark = alertMark();
      mark.position.y = 2.1;
      mark.visible = false;
      m.root.add(mark);
      const stars = dizzyStars();
      stars.position.y = this.faction === 'penguin' ? 1.7 : 1.55;
      stars.visible = false;
      m.root.add(stars);
      const y = isl.hLocal(x, z);
      const n: Npc = { id: id++, f: this.faction, chief, m, x, z, y, yaw: Math.random() * 6.28, st: this.friendly ? (chief ? 'idle' : 'walk') : 'patrol', t: Math.random() * 3, hx: x, hz: z, tx: x, tz: z, hp: 3, bonkT: 0, ph: Math.random() * 6.28, mark, stars, food: null };
      m.root.position.set(x, y, z);
      isl.group.add(m.root);
      this.npcs.push(n);
    }
  }
  get chief(): Npc | null {
    return this.npcs.find((n) => n.chief) ?? null;
  }
  get name(): string {
    return this.faction === 'none' ? '' : FACTIONS[this.faction].n();
  }
  /** algum guarda alerta/perseguindo? */
  get danger(): boolean {
    return this.npcs.some((n) => n.st === 'alert' || n.st === 'chase');
  }
  update(dt: number, c: OwnerCtx): void {
    this.time += dt;
    const isl = this.isl;
    const plx = c.px - isl.x;
    const plz = c.pz - isl.z;
    const onLand = !c.swim;
    if (this.alertT > 0) this.alertT -= dt;
    for (const n of this.npcs) {
      n.t -= dt;
      if (n.bonkT > 0) n.bonkT -= dt;
      const dx = plx - n.x;
      const dz = plz - n.z;
      const dP = Math.hypot(dx, dz);
      let speed = 0;
      const goTo = (tx: number, tz: number, v: number) => {
        const ddx = tx - n.x;
        const ddz = tz - n.z;
        const d = Math.hypot(ddx, ddz);
        if (d > 0.05) {
          const a = Math.atan2(ddx, ddz);
          n.yaw += angTo(n.yaw, a) * Math.min(1, dt * 6);
          const s = Math.min(d, v * dt);
          const nx = n.x + Math.sin(n.yaw) * s;
          const nz = n.z + Math.cos(n.yaw) * s;
          // não entra no mar fundo nem nas paredes
          if (isl.hLocal(nx, nz) > -0.3 && !isl.blocks(nx + isl.x, nz + isl.z, 0.3)) {
            n.x = nx;
            n.z = nz;
          }
          speed = v;
        }
        return d;
      };
      if (this.friendly) {
        if (n.chief) {
          // acena quando você chega
          if (dP < 7 && onLand) {
            n.yaw += angTo(n.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 4);
            if (n.st !== 'wave') {
              n.st = 'wave';
              n.t = 2;
              c.voice(n, 'hi');
            }
          } else if (n.st === 'wave' && n.t <= 0) n.st = 'idle';
        } else {
          if (n.t <= 0) {
            n.t = 2 + Math.random() * 4;
            const a = Math.random() * 6.28;
            n.tx = n.hx + Math.cos(a) * 3;
            n.tz = n.hz + Math.sin(a) * 3;
          }
          goTo(n.tx, n.tz, 0.7);
        }
      } else {
        // territoriais
        const g = isl.guard;
        const gx = g ? g.x : n.hx;
        const gz = g ? g.z : n.hz;
        const fromChest = Math.hypot(plx - gx, plz - gz);
        const facing = Math.cos(angTo(n.yaw, Math.atan2(dx, dz)));
        let sight = (c.sneak ? 3.2 : 9) * (1 - c.night * 0.35);
        if (this.faction === 'pirate' && c.light && dP < 9) {
          // a luz espanta os piratas fantasmas
          if (n.st !== 'dizzy') {
            n.st = 'dizzy';
            n.t = 25;
            c.voice(n, 'dizzy');
          }
          sight = 0;
        }
        const sees = onLand && dP < sight && (facing > 0.2 || dP < 2.2);
        switch (n.st) {
          case 'patrol': {
            if (n.t <= 0) {
              n.t = 2.5 + Math.random() * 3;
              const a = Math.random() * 6.28;
              n.tx = gx + Math.cos(a) * 2.8;
              n.tz = gz + Math.sin(a) * 2.8;
            }
            goTo(n.tx, n.tz, 0.9);
            if (sees) {
              n.st = 'alert';
              n.t = 0.55;
              c.seen(n);
              c.voice(n, 'alert');
              // avisa os outros
              for (const o of this.npcs) if (o !== n && o.st === 'patrol' && Math.hypot(o.x - n.x, o.z - n.z) < 8) {
                o.st = 'alert';
                o.t = 0.8;
              }
            }
            break;
          }
          case 'alert':
            n.yaw += angTo(n.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
            if (n.t <= 0) {
              n.st = 'chase';
              n.t = 9;
            }
            break;
          case 'chase': {
            const d = goTo(plx, plz, this.faction === 'lizard' ? 3.1 : 2.7);
            if (d < 1.0 && n.bonkT <= 0 && onLand) {
              n.bonkT = 1.3;
              c.voice(n, 'bonk');
              c.bonk(this.faction === 'pirate' ? 6 : 4, n.x + isl.x, n.z + isl.z);
            }
            if (n.t <= 0 || fromChest > 15 || !onLand) {
              n.st = 'home';
              n.t = 6;
            }
            break;
          }
          case 'home': {
            const d = goTo(n.hx, n.hz, 1.6);
            if (sees && n.t < 4) {
              n.st = 'alert';
              n.t = 0.4;
            } else if (d < 0.4 || n.t <= 0) {
              n.st = 'patrol';
              n.t = 1;
            }
            break;
          }
          case 'eat':
            if (goTo(n.tx, n.tz, 1.8) < 0.9 && n.food) n.food.scale.setScalar(Math.max(0.01, n.food.scale.x - dt * 0.06));
            if (n.t <= 0) {
              if (n.food) {
                n.food.removeFromParent();
                n.food = null;
              }
              n.st = 'home';
              n.t = 6;
            }
            break;
          case 'dizzy':
            if (n.t <= 0) {
              n.st = 'home';
              n.t = 5;
              n.hp = 3;
            }
            break;
        }
      }
      // visual
      const m = n.m;
      n.y += (isl.hLocal(n.x, n.z) - n.y) * Math.min(1, dt * 10);
      const ghost = this.faction === 'pirate';
      m.root.position.set(n.x, n.y + (ghost ? 0.35 + Math.sin(this.time * 2 + n.ph) * 0.12 : 0), n.z);
      m.root.rotation.y = n.yaw;
      const w = this.time * (speed > 1.5 ? 14 : 8) + n.ph;
      const mv = speed > 0.1 ? 1 : 0;
      m.body.position.y = Math.abs(Math.sin(w)) * 0.05 * mv;
      for (let i = 0; i < m.legs.length; i++) m.legs[i].rotation.x = Math.sin(w + (i % 2) * Math.PI) * 0.6 * mv;
      const dizzy = n.st === 'dizzy';
      if (n.st === 'wave') {
        m.armR.rotation.z = -2.2 + Math.sin(this.time * 9) * 0.4;
        m.armL.rotation.z = 0;
      } else if (n.st === 'chase' || n.st === 'alert') {
        m.armR.rotation.x = -1.4 + Math.sin(this.time * 12) * 0.6;
        m.armL.rotation.x = -1.4 - Math.sin(this.time * 12) * 0.6;
      } else if (n.st === 'eat') {
        m.armR.rotation.x = -1.2 + Math.sin(this.time * 10) * 0.3;
        m.armL.rotation.x = -1.2;
      } else {
        m.armR.rotation.set(Math.sin(w) * 0.4 * mv + Math.sin(this.time * 1.5 + n.ph) * 0.12, 0, 0);
        m.armL.rotation.set(-Math.sin(w) * 0.4 * mv - Math.sin(this.time * 1.5 + n.ph) * 0.12, 0, 0);
      }
      if (m.head) m.head.rotation.z = dizzy ? Math.sin(this.time * 4) * 0.25 : 0;
      m.root.rotation.z = dizzy ? Math.sin(this.time * 3 + n.ph) * 0.12 : 0;
      n.mark.visible = n.st === 'alert' || n.st === 'chase';
      n.mark.rotation.y = this.time * 3;
      n.stars.visible = dizzy;
      n.stars.rotation.y = this.time * 4;
    }
  }
  /** npc na mira (raio a partir do olho, mundo) */
  aim(o: THREE.Vector3, d: THREE.Vector3, maxD: number): Npc | null {
    let best: Npc | null = null;
    let bd = maxD;
    const p = new THREE.Vector3();
    for (const n of this.npcs) {
      p.set(n.x + this.isl.x, n.y + 0.8, n.z + this.isl.z).sub(o);
      const along = p.dot(d);
      if (along < 0 || along > bd) continue;
      const perp = p.addScaledVector(d, -along).length();
      if (perp < 0.75) {
        bd = along;
        best = n;
      }
    }
    return best;
  }
  /** levou uma lançada: true = ficou tonto */
  strike(n: Npc, dmg: number, fromX: number, fromZ: number): boolean {
    if (this.friendly || n.st === 'dizzy') return false;
    n.hp -= dmg;
    // empurrãozinho
    const a = Math.atan2(n.x + this.isl.x - fromX, n.z + this.isl.z - fromZ);
    n.x += Math.sin(a) * 0.6;
    n.z += Math.cos(a) * 0.6;
    if (n.hp <= 0) {
      n.st = 'dizzy';
      n.t = 40;
      return true;
    }
    if (n.st === 'patrol' || n.st === 'home') {
      n.st = 'chase';
      n.t = 8;
    }
    return false;
  }
  /** jogou comida perto: vai comer (distraído) */
  bait(wx: number, wz: number, mesh: THREE.Mesh): number {
    const lx = wx - this.isl.x;
    const lz = wz - this.isl.z;
    mesh.position.set(lx, this.isl.hLocal(lx, lz) + 0.1, lz);
    this.isl.group.add(mesh);
    let n = 0;
    for (const g of this.npcs) {
      if (g.st === 'dizzy' || this.friendly) continue;
      if (Math.hypot(g.x - lx, g.z - lz) > 14) continue;
      if (g.food) g.food.removeFromParent();
      g.food = n === 0 ? mesh : null;
      const a = (n / 3) * Math.PI * 2;
      g.tx = lx + Math.cos(a) * 0.7;
      g.tz = lz + Math.sin(a) * 0.7;
      g.st = 'eat';
      g.t = 14;
      n++;
    }
    if (!n) setTimeout(() => mesh.removeFromParent(), 8000);
    return n;
  }
  dispose(): void {
    for (const n of this.npcs) {
      n.m.root.removeFromParent();
      n.m.root.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      for (const m of n.m.mats) m.dispose();
    }
  }
}
