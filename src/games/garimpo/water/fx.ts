/* ============================================================
 *  GARIMPO BRUTO — espetáculo da enchente:
 *  - árvores/arbustos que a correnteza pega caem (somem da vegetação, chuva de folhas, viram
 *    troncos boiando);
 *  - entulho (troncos e pedras) levado pela água, boiando/rolando com a velocidade da simulação;
 *  - ronco grave (ruído marrom filtrado) e tremor de câmera conforme a força da água por perto;
 *  - câmera de cinema quando a barragem rompe: mostra a brecha, segue a frente da onda pelo riacho
 *    até o lago (árvores no caminho somem como na câmera normal). Toque para pular.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { LeafBurst } from '../../../3d/nature';
import type { World } from '../world';
import type { DamInfo } from './dam';
import { TN, TS, WCS, WN, type WaterSim } from './sim';

const MAXD = 48;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();

export class FloodFx {
  readonly leaves: LeafBurst;
  private logs: THREE.InstancedMesh;
  private rocks: THREE.InstancedMesh;
  // entulho: x, y, z, vx, vz, giro, vida, tipo (0 tronco, 1 pedra)
  private D = new Float32Array(MAXD * 8);
  private n = 0;
  /** árvores por ladrilho da simulação (para achar quem a água pega) */
  private treesAt: number[][] = [];
  readonly felled = new Set<number>();
  /** derrubadas desde o último retrato de rede */
  readonly fellNew: number[] = [];
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private src: AudioBufferSourceNode | null = null;
  rumbleK = 0;
  private shake = 0;
  // cinema
  private cine: { t: number; phase: number; cam: THREE.Vector3; tgt: THREE.Vector3; front: number; el: HTMLDivElement } | null = null;

  constructor(
    private w: World,
    private sim: WaterSim,
    private dam: DamInfo,
    private root: HTMLElement,
  ) {
    this.leaves = new LeafBurst(w.scene, 160);
    this.leaves.ground = (x, z) => Math.max(w.T.heightAt(x, z), sim.surfaceAt(x, z));
    const lg = new THREE.CylinderGeometry(0.17, 0.2, 2.4, 6).rotateZ(Math.PI / 2);
    this.logs = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0x6b4a2c }), MAXD);
    const rg = new THREE.IcosahedronGeometry(0.32, 0);
    this.rocks = new THREE.InstancedMesh(rg, new THREE.MeshLambertMaterial({ color: 0x7a6a5c, flatShading: true }), MAXD);
    for (const im of [this.logs, this.rocks]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      w.scene.add(im);
    }
    for (let i = 0; i < TN * TN; i++) this.treesAt.push([]);
    w.map.trees.forEach((tr, i) => {
      if (tr.kind === 4) return;
      const ti = Math.min(TN - 1, Math.floor(tr.x / WCS / TS));
      const tj = Math.min(TN - 1, Math.floor(tr.z / WCS / TS));
      this.treesAt[tj * TN + ti].push(i);
    });
  }

  /* ---------------- árvores derrubadas ---------------- */
  /** a cada ~0,25 s: plantas em água funda e rápida caem */
  knock(): void {
    const s = this.sim;
    const trees = this.w.map.trees;
    for (let t = 0; t < TN * TN; t++) {
      if (!s.awake[t] || !s.wetT[t] || s.hotV[t] < 0.8) continue;
      const list = this.treesAt[t];
      for (let q = list.length - 1; q >= 0; q--) {
        const n = list[q];
        const tr = trees[n];
        const k = s.cellOf(tr.x, tr.z);
        const d = s.d[k];
        const sp = Math.hypot(s.ux[k], s.uz[k]);
        const big = tr.kind <= 2;
        if (big ? d > 0.45 && sp * d > 0.9 : d > 0.18 && sp > 0.9) {
          list.splice(q, 1);
          this.fell(n, true);
          this.fellNew.push(n);
        }
      }
    }
  }
  /** derruba a planta n (fx = folhas e tronco boiando) */
  fell(n: number, fx: boolean): void {
    if (this.felled.has(n)) return;
    this.felled.add(n);
    const tr = this.w.map.trees[n];
    if (!tr) return;
    this.w.veg?.fell(n);
    // tira o círculo de colisão
    this.w.near(tr.x, tr.z, (c) => {
      if (c.tree === n || (Math.abs(c.x - tr.x) < 0.01 && Math.abs(c.z - tr.z) < 0.01)) c.r = 0;
    });
    if (!fx) return;
    const y = this.w.T.heightAt(tr.x, tr.z);
    const big = tr.kind <= 2;
    this.leaves.emit(big ? 28 : 10, tr.x, y + (big ? 5.5 : 0.8) * tr.s, tr.z, big ? 2.5 : 0.8, tr.kind === 1 ? '#5aa83a' : '#4f9a35', big ? 3 : 2);
    if (big) {
      this.spawn(tr.x, tr.z, 0);
      if (tr.s > 1) this.spawn(tr.x + 0.8, tr.z - 0.6, 0);
    }
  }

  /* ---------------- entulho ---------------- */
  spawn(x: number, z: number, kind: 0 | 1): void {
    let i = this.n;
    if (i >= MAXD) {
      // recicla o mais velho
      let old = 0;
      for (let j = 1; j < MAXD; j++) if (this.D[j * 8 + 6] < this.D[old * 8 + 6]) old = j;
      i = old;
    } else this.n++;
    const o = i * 8;
    this.D[o] = x;
    this.D[o + 1] = this.w.T.heightAt(x, z);
    this.D[o + 2] = z;
    this.D[o + 3] = 0;
    this.D[o + 4] = 0;
    this.D[o + 5] = Math.random() * 6.28;
    this.D[o + 6] = kind === 0 ? 70 : 35;
    this.D[o + 7] = kind;
  }
  private updDebris(dt: number, time: number): void {
    const s = this.sim;
    const T = this.w.T;
    let nl = 0;
    let nr = 0;
    for (let i = 0; i < this.n; i++) {
      const o = i * 8;
      const D = this.D;
      D[o + 6] -= dt;
      if (D[o + 6] <= 0) continue;
      const x = D[o];
      const z = D[o + 2];
      const k = s.cellOf(x, z);
      const d = s.d[k];
      const kind = D[o + 7];
      const g = T.heightAt(x, z);
      let ux = 0;
      let uz = 0;
      if (kind === 0 ? d > 0.18 : d > 0.3 && Math.hypot(s.ux[k], s.uz[k]) > 1.6) {
        const f = kind === 0 ? 0.85 : 0.55;
        ux = s.ux[k] * f;
        uz = s.uz[k] * f;
      }
      const a = Math.min(1, dt * (kind === 0 ? 1.8 : 3));
      D[o + 3] += (ux - D[o + 3]) * a;
      D[o + 4] += (uz - D[o + 4]) * a;
      D[o] = Math.max(4, Math.min(188, x + D[o + 3] * dt));
      D[o + 2] = Math.max(4, Math.min(188, z + D[o + 4] * dt));
      const sp = Math.hypot(D[o + 3], D[o + 4]);
      let y: number;
      if (kind === 0) {
        y = d > 0.18 ? s.b[k] + d - 0.06 + Math.sin(time * 2.3 + i) * 0.05 : g + 0.15;
        if (sp > 0.2) D[o + 5] += (Math.atan2(D[o + 3], D[o + 4]) + Math.PI / 2 - D[o + 5]) * Math.min(1, dt * 1.5);
      } else {
        y = g + 0.22;
        D[o + 5] += sp * dt * 2;
      }
      D[o + 1] += (Math.max(y, g + 0.1) - D[o + 1]) * Math.min(1, dt * 6);
      const life = D[o + 6];
      const sc = Math.min(1, life / 2);
      if (kind === 0) {
        _q.setFromEuler(_e.set(Math.sin(time + i) * 0.08, D[o + 5], 0));
        _m.compose(_p.set(D[o], D[o + 1], D[o + 2]), _q, _s.set(sc, sc, sc));
        this.logs.setMatrixAt(nl++, _m);
      } else {
        _q.setFromEuler(_e.set(D[o + 5], D[o + 5] * 0.7, 0));
        _m.compose(_p.set(D[o], D[o + 1], D[o + 2]), _q, _s.set(sc, sc * 0.8, sc));
        this.rocks.setMatrixAt(nr++, _m);
      }
    }
    // compacta (mortos saem)
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.D[i * 8 + 6] <= 0) continue;
      if (w !== i) this.D.copyWithin(w * 8, i * 8, i * 8 + 8);
      w++;
    }
    this.n = w;
    this.logs.count = nl;
    this.rocks.count = nr;
    this.logs.instanceMatrix.needsUpdate = nl > 0;
    this.rocks.instanceMatrix.needsUpdate = nr > 0;
  }

  /* ---------------- ronco ---------------- */
  private rumble(k: number): void {
    this.rumbleK += (k - this.rumbleK) * 0.08;
    const o = audio.fxOut();
    if (!o) return;
    if (!this.ctx && this.rumbleK > 0.03) {
      const ctx = o.ctx;
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const ch = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
        ch[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g).connect(o.out);
      src.start();
      this.ctx = ctx;
      this.gain = g;
      this.src = src;
    }
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(Math.min(0.9, this.rumbleK * 0.9), this.ctx.currentTime, 0.25);
  }

  /** por quadro */
  update(dt: number, time: number, cam: THREE.Vector3): void {
    this.leaves.update(dt, 0.5);
    this.updDebris(dt, time);
    // força da água perto da câmera: maior velocidade × proximidade
    const s = this.sim;
    let k = 0;
    for (let t = 0; t < TN * TN; t++) {
      if (!s.awake[t] || s.hotV[t] < 1.8) continue;
      const c = s.hot[t];
      if (c < 0) continue;
      const dx = ((c % WN) + 0.5) * WCS - cam.x;
      const dz = (((c / WN) | 0) + 0.5) * WCS - cam.z;
      const near = Math.max(0, 1 - Math.hypot(dx, dz) / 90);
      k = Math.max(k, Math.min(1, (s.hotV[t] - 1.8) / 4) * near);
    }
    this.rumble(this.cine ? Math.max(k, 0.6) : k);
    this.shake = this.rumbleK;
  }

  /* ---------------- câmera ---------------- */
  startCine(): void {
    if (this.cine) return;
    const el = document.createElement('div');
    el.className = 'gbw-cine';
    el.setAttribute('data-touch-ignore', '');
    el.innerHTML = `<i></i><i></i><span>${t('gb.w.skip', 'Toque para pular')}</span>`;
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.endCine();
    });
    this.root.appendChild(el);
    this.cine = { t: 0, phase: 0, cam: new THREE.Vector3(), tgt: new THREE.Vector3(), front: 0, el };
  }
  endCine(): void {
    this.cine?.el.remove();
    this.cine = null;
  }
  get inCine(): boolean {
    return !!this.cine;
  }
  /** aplica cinema/tremor depois da câmera do jogo (gancho em game.camera) */
  camFx(cam: THREE.PerspectiveCamera, dt: number): void {
    const c = this.cine;
    if (c) {
      c.t += dt;
      const D = this.dam;
      const T = this.w.T;
      const vx = -D.uz;
      const vz = D.ux;
      const cr = D.creek;
      const wantC = _p;
      const wantT = _t;
      if (c.phase === 0) {
        // a brecha de frente, girando devagar
        const bx = D.x + D.ux * (D.A + 4);
        const bz = D.z + D.uz * (D.A + 4);
        const a = 0.5 - c.t * 0.06;
        wantT.set(bx, D.crest - 2, bz);
        wantC.set(bx + D.ux * 16 * Math.cos(a) + vx * 16 * Math.sin(a), D.crest + 6, bz + D.uz * 16 * Math.cos(a) + vz * 16 * Math.sin(a));
        if (c.t > 4.5) c.phase = 1;
      } else if (c.phase === 1) {
        // segue a frente da onda pelo riacho
        let fi = 0;
        for (let i = cr.length - 1; i >= 0; i--)
          if (this.sim.depthAt(cr[i].x, cr[i].z) > 0.06) {
            fi = i;
            break;
          }
        c.front += (Math.max(c.front, fi) - c.front) * Math.min(1, dt * 1.5);
        const f = cr[Math.min(cr.length - 1, Math.round(c.front))];
        const b = cr[Math.max(0, Math.round(c.front) - 20)];
        wantT.set(f.x, T.heightAt(f.x, f.z) + 1, f.z);
        wantC.set(b.x + vx * 13, Math.max(T.heightAt(b.x, b.z), T.heightAt(f.x, f.z)) + 17, b.z + vz * 13);
        if (c.front >= cr.length - 4 || c.t > 16) {
          c.phase = 2;
          c.t = 0;
        }
      } else {
        const L = this.w.map.lake;
        const e = cr[cr.length - 1] ?? { x: L.x, z: L.z };
        wantT.set(L.x, L.level, L.z);
        wantC.set(e.x + (e.x - L.x) * 0.6 + vx * 6, L.level + 14, e.z + (e.z - L.z) * 0.6 + vz * 6);
        if (c.t > 4) {
          this.endCine();
          return;
        }
      }
      wantC.y = Math.max(wantC.y, T.heightAt(wantC.x, wantC.z) + 4);
      if (c.cam.lengthSq() === 0) {
        c.cam.copy(wantC);
        c.tgt.copy(wantT);
      }
      const k = Math.min(1, dt * (c.phase === 1 ? 1.6 : 1.2));
      c.cam.lerp(wantC, k);
      c.tgt.lerp(wantT, k);
      cam.position.copy(c.cam);
      cam.lookAt(c.tgt);
      // árvores entre a câmera e o alvo somem (igual à câmera do jogo)
      this.w.veg?.occlude(c.cam.x, c.cam.z, c.tgt.x, c.tgt.z, 6);
    }
    if (this.shake > 0.03) {
      const a = this.shake * 0.12;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
      cam.position.z += (Math.random() - 0.5) * a;
    }
  }

  dispose(): void {
    this.endCine();
    this.leaves.dispose();
    for (const im of [this.logs, this.rocks]) {
      this.w.scene.remove(im);
      im.geometry.dispose();
      (im.material as THREE.Material).dispose();
    }
    try {
      this.src?.stop();
    } catch {
      /* */
    }
    this.gain?.disconnect();
  }
}
