/* ============================================================
 *  GARIMPO — COMEÇO DO ZERO: o primeiro acampamento na beira do rio (lago).
 *  Calcula da semente (sempre igual) onde ficam: a barraca, a fogueira, a calha velha
 *  quebrada (com a cabeça na água), o píer do barco do comprador e o "cascalho bom"
 *  (bolsão raso de ouro para a primeira bateia). Monta os modelos na cena.
 *  Usado pelo jogo (start/camp.ts) e pela abertura (start/cinematic.ts).
 *  Não mexe no relevo (o save guarda só o que foi cavado): só soma teor em T.oreR.
 * ============================================================ */
import * as THREE from 'three';
import { npcSpec, PaperChar } from '../../../3d/paper';
import type { World } from '../world';
import { buildBrokenSluice, buildCampfire, buildPier, buildTent, iconSprite, type Campfire } from './models';
import { SI } from './icons';
import { CELL, N, V } from '../terrain';

export interface P3 {
  x: number;
  z: number;
  yaw: number;
}
export interface SiteLayout {
  /** ponto da margem (a água começa logo "atrás", em −f) */
  shore: { x: number; z: number };
  /** frente = da água para o acampamento; lado */
  f: [number, number];
  s: [number, number];
  tent: P3;
  fire: P3;
  sluice: P3;
  pier: P3;
  /** onde o Bloop nasce e onde se lava a bateia */
  spawn: P3;
  pan: { x: number; z: number };
  /** bolsão raso de ouro (primeiras pás) */
  placer: { x: number; z: number; r: number };
  /** bancada do carrinho de mão (constrói ali) */
  bench: P3;
  /** vendedor no píer (onde vende) */
  buyer: { x: number; z: number };
}

const yawOf = (dx: number, dz: number) => Math.atan2(dx, dz);

/** escolhe a margem do lago mais perto do acampamento que tenha chão firme e sem árvores */
export function siteLayout(w: World): SiteLayout {
  const m = w.map;
  const L = m.lake;
  const T = w.T;
  const a0 = Math.atan2(m.camp.x - L.x, m.camp.z - L.z);
  let best: SiteLayout | null = null;
  let bestScore = 1e9;
  for (let k = 0; k < 25; k++) {
    const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.13;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    // margem: primeiro ponto seco saindo do lago
    let rs = L.r + 6;
    for (let r = L.r - 6; r < L.r + 10; r += 0.25) {
      const x = L.x + fx * r;
      const z = L.z + fz * r;
      if (w.waterY(x, z) < T.heightAt(x, z) + 0.05) {
        rs = r;
        break;
      }
    }
    const sx = fz;
    const sz = -fx;
    const sh = { x: L.x + fx * rs, z: L.z + fz * rs };
    const at = (f: number, s: number) => ({ x: sh.x + fx * f + sx * s, z: sh.z + fz * f + sz * s });
    // pontos importantes livres de árvore e dentro do mapa; chão razoável
    const pts = [at(7, 3.5), at(5, 0.5), at(1, -9), at(4, 9), at(8, -1.5), at(3, 4)];
    let bad = 0;
    for (const p of pts) {
      if (p.x < 14 || p.z < 14 || p.x > 178 || p.z > 178) bad += 10;
      w.near(p.x, p.z, (c) => {
        if (Math.hypot(c.x - p.x, c.z - p.z) < c.r + 2.2) bad++;
      });
    }
    const t0 = at(7, 3.5);
    const hs = [at(5, 0), at(7, 3.5), at(8, -1.5), at(4, 9)].map((p) => T.heightAt(p.x, p.z));
    const slope = Math.max(...hs) - Math.min(...hs);
    const score = bad * 10 + slope * 3 + Math.abs(k) * 0.3 + Math.max(0, T.heightAt(t0.x, t0.z) - L.level - 3) * 2;
    if (score < bestScore) {
      bestScore = score;
      const face = (p: { x: number; z: number }, tx: number, tz: number): P3 => ({ x: p.x, z: p.z, yaw: yawOf(tx - p.x, tz - p.z) });
      const tent = at(7.5, 4);
      const fire = at(4.6, 0.8);
      const sl = at(0.9, -4);
      const pier = at(1.4, -10);
      const spawn = at(5.6, 3);
      best = {
        shore: sh,
        f: [fx, fz],
        s: [sx, sz],
        tent: face(tent, sh.x, sh.z),
        fire: { ...fire, yaw: 0 },
        // cabeça da calha (lado +yaw) virada para a água
        sluice: { ...sl, yaw: yawOf(-fx, -fz) },
        // píer entra na água (−z local = para a água)
        pier: { ...pier, yaw: yawOf(fx, fz) },
        spawn: face(spawn, sh.x + sx * 6, sh.z + sz * 6),
        pan: at(-0.4, 6.5),
        placer: { ...at(3.6, 8.5), r: 5.5 },
        bench: face(at(9.5, 0), sh.x, sh.z),
        buyer: at(2.2, -10),
      };
      if (bad === 0 && slope < 1.4) break;
    }
  }
  return best!;
}

/** soma o "cascalho bom" (raso e rico) em volta do bolsão — chamado em toda carga do save */
export function addPlacer(w: World, p: { x: number; z: number; r: number }, g = 62): void {
  const T = w.T;
  const R = p.r * 2;
  const i0 = Math.max(0, Math.floor((p.x - R) / CELL));
  const i1 = Math.min(N, Math.ceil((p.x + R) / CELL));
  const j0 = Math.max(0, Math.floor((p.z - R) / CELL));
  const j1 = Math.min(N, Math.ceil((p.z + R) / CELL));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * CELL - p.x, j * CELL - p.z) / p.r;
      const k = j * V + i;
      const v = g * Math.exp(-d * d * 1.4) * (0.85 + 0.3 * Math.sin(i * 1.7 + j * 2.3) * Math.sin(i * 0.6 - j * 1.1));
      if (v > T.oreR[k]) {
        T.oreR[k] = v;
        T.oreD[k] = 0.35;
      }
    }
}

/** modelos do primeiro acampamento (na cena) */
export class Site {
  readonly lay: SiteLayout;
  readonly group = new THREE.Group();
  readonly tent: THREE.Group;
  readonly fire: Campfire;
  readonly broken: THREE.Group;
  readonly pier: THREE.Group;
  readonly buyer: PaperChar;
  private tags: THREE.Sprite[] = [];
  private t = 0;
  /** círculos de colisão */
  readonly circles: { x: number; z: number; r: number }[] = [];

  constructor(
    w: World,
    tier: number,
    collide = true,
  ) {
    const lay = siteLayout(w);
    this.lay = lay;
    const T = w.T;
    const put = (o: THREE.Object3D, p: P3, dy = 0) => {
      o.position.set(p.x, T.heightAt(p.x, p.z) + dy, p.z);
      o.rotation.y = p.yaw;
      this.group.add(o);
    };
    this.tent = buildTent();
    put(this.tent, lay.tent, -0.05);
    this.fire = buildCampfire(tier);
    put(this.fire.root, lay.fire, -0.02);
    this.broken = buildBrokenSluice();
    put(this.broken, lay.sluice, -0.1);
    this.pier = buildPier();
    // o píer fica na altura da margem (as estacas entram na água)
    this.pier.position.set(lay.pier.x, Math.max(T.heightAt(lay.pier.x, lay.pier.z) - 0.15, w.map.lake.level + 0.1), lay.pier.z);
    this.pier.rotation.y = lay.pier.yaw + Math.PI;
    this.group.add(this.pier);
    // comprador de ouro (Bloop de chapéu) na mesinha do píer
    this.buyer = new PaperChar(npcSpec('#3a6a8a', '#e8c27a', { head: 'h_cap' }), { radius: 0.5, cell: 96, shadow: true });
    const bp = new THREE.Vector3(0.55, 0.66, -1.2);
    this.pier.updateMatrixWorld(true);
    this.pier.localToWorld(bp);
    this.buyer.root.position.copy(bp);
    this.group.add(this.buyer.root);
    // plaquinhas: comprador (moeda), barraca (cama), bolsão (pá)
    const tag = (svg: string, x: number, z: number, y: number, ring?: string) => {
      const sp = iconSprite(svg, ring);
      sp.position.set(x, T.heightAt(x, z) + y, z);
      this.group.add(sp);
      this.tags.push(sp);
      return sp;
    };
    tag(SI.sell, bp.x, bp.z, 2.6);
    tag(SI.tent, lay.tent.x, lay.tent.z, 2.9, '#9fd0ff');
    w.scene.add(this.group);
    if (collide) {
      const c = (x: number, z: number, r: number) => {
        const cc = { x, z, r };
        w.addCircle(cc);
        this.circles.push(cc);
      };
      c(lay.tent.x, lay.tent.z, 1.5);
      c(lay.fire.x, lay.fire.z, 0.7);
    }
  }
  /** testes/abertura: esconde as plaquinhas */
  showTags(on: boolean): void {
    for (const t of this.tags) t.visible = on;
  }
  update(dt: number, cam: THREE.Camera, night: number): void {
    this.t += dt;
    this.fire.update(this.t, night);
    const p = this.buyer.root.position;
    this.buyer.update(dt, cam, { yaw: Math.atan2(cam.position.x - p.x, cam.position.z - p.z), speed: 0, act: -1, happy: Math.sin(this.t * 0.7) > 0.6 });
  }
  dispose(): void {
    this.fire.dispose();
    this.buyer.dispose();
    this.group.removeFromParent();
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      if ((o as THREE.Sprite).isSprite) ((o as THREE.Sprite).material.map as THREE.Texture | null)?.dispose();
    });
    for (const c of this.circles) (c as { off?: boolean }).off = true;
  }
}
