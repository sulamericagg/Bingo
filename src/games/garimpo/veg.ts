/* ============================================================
 *  GARIMPO BRUTO — vegetação e decoração usando o módulo compartilhado src/3d/nature
 *  (árvores com vento e LOD, cartões de folhas, arbustos, samambaias, pedras,
 *  grama de lâminas na GPU e sombras de contato). Tudo instanciado.
 * ============================================================ */
import * as THREE from 'three';
import type { Tier } from '../../core/quality';
import { BlobShadows, GrassField, leafCardMat, natureBush, natureFern, natureLeafCards, natureMat, natureQ, natureRock, natureTree, windTime, type GrassSource } from '../../3d/nature';
import type { MapInfo } from './gen';
import { MAT_GRASS, V, type Terrain } from './terrain';

/** espécies por tipo do gerador: 0 copa larga, 1 açaizeiro, 2 emergente alta, 3 arbusto, 4 pedra, 5 samambaia */
function geoFor(kind: number, lod: 0 | 1): THREE.BufferGeometry {
  switch (kind) {
    case 0:
      return natureTree({ kind: 'broad', h: 8.5, trunk: '#6e4a2c', trunkDark: '#3e2614', leaf: '#4f9a35', leaf2: '#245a20', seed: 41, lod });
    case 1:
      return natureTree({ kind: 'palm', h: 9.5, trunk: '#8a7a5e', trunkDark: '#5a4a36', leaf: '#5aa83a', leaf2: '#2f6a24', seed: 42, lod });
    case 2:
      return natureTree({ kind: 'cloud', h: 13, trunk: '#7d6347', trunkDark: '#4a3826', leaf: '#3f8a30', leaf2: '#1f5222', seed: 43, lod });
    case 3:
      return natureBush(44, lod);
    case 4:
      return natureRock(45, '#6a8a3a', 0.35);
    default:
      return natureFern(46);
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

export class Vegetation {
  meshes: THREE.InstancedMesh[] = [];
  cards: (THREE.InstancedMesh | null)[] = [];
  /** por item do mapa: tipo, índice na malha, queima */
  ref: { kind: number; idx: number; burn: number }[] = [];
  private treeMat = natureMat({ amp: 0.0016, y0: 2, rustle: 0.03, wrap: 0.4 });
  private bushMat = natureMat({ amp: 0.004, y0: 0.2, rustle: 0.02, wrap: 0.4, tintGray: true });
  private rockMat = natureMat({ amp: 0, y0: 100, rustle: 0 });
  private cardMat = leafCardMat({ amp: 0.0016, y0: 2, rustle: 0.04, wrap: 0.45 });
  private grass: GrassField;
  private blobs: BlobShadows;
  private counts: number[] = [];
  /** matriz original de cada item (para esconder/mostrar árvores entre a câmera e o jogador) */
  private mats: Float32Array;
  private hidden = new Set<number>();
  private hideNow = new Set<number>();
  private trees: MapInfo['trees'];
  private gc = new Float32Array(4);

  constructor(
    private scene: THREE.Scene,
    map: MapInfo,
    private T: Terrain,
    tier: Tier,
  ) {
    const lod: 0 | 1 = tier <= 1 ? 1 : 0;
    this.trees = map.trees;
    this.mats = new Float32Array(map.trees.length * 16);
    const n = [0, 0, 0, 0, 0, 0];
    for (const t of map.trees) n[t.kind]++;
    for (let k = 0; k < 6; k++) {
      const geo = geoFor(k, lod);
      const mat = k === 3 || k === 5 ? this.bushMat : k === 4 ? this.rockMat : this.treeMat;
      const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n[k]));
      im.count = 0;
      im.castShadow = k <= 2;
      im.receiveShadow = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n[k]) * 3).fill(1), 3);
      scene.add(im);
      this.meshes.push(im);
      // cartões de folhas na borda das copas (Médio/Alto)
      const cg = k <= 2 && tier >= 2 ? natureLeafCards(geo, 8, k + 3) : null;
      if (cg) {
        const cm = new THREE.InstancedMesh(cg, this.cardMat, Math.max(1, n[k]));
        cm.count = 0;
        cm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n[k]) * 3).fill(1), 3);
        scene.add(cm);
        this.cards.push(cm);
      } else this.cards.push(null);
    }
    const nq = natureQ(tier);
    this.blobs = new BlobShadows(scene, 1024, nq.blobAlpha);
    this.blobs.begin();
    map.trees.forEach((t) => {
      const im = this.meshes[t.kind];
      const idx = im.count++;
      const y = T.heightAt(t.x, t.z);
      if (t.kind === 4) {
        T.normalAt(t.x, t.z, _p);
        _q.setFromUnitVectors(UP, _p).multiply(new THREE.Quaternion().setFromAxisAngle(UP, t.rot));
        _m.compose(_s.set(t.x, y - 0.25 * t.s, t.z), _q, _p.setScalar(t.s * 1.3));
      } else {
        _q.setFromAxisAngle(UP, t.rot);
        _m.compose(_p.set(t.x, y - 0.05, t.z), _q, _s.setScalar(t.s));
      }
      im.setMatrixAt(idx, _m);
      _m.toArray(this.mats, this.ref.length * 16);
      const cm = this.cards[t.kind];
      if (cm) {
        cm.setMatrixAt(cm.count++, _m);
      }
      // variação de tom por instância
      const v = 0.86 + ((idx * 37) % 23) / 80;
      if (t.kind === 3 || t.kind === 5) _c.setRGB(0.42 * v, 0.68 * v, 0.28 * v);
      else _c.setRGB(v, v, v);
      im.setColorAt(idx, _c);
      if (cm) cm.setColorAt(idx, _c);
      this.ref.push({ kind: t.kind, idx, burn: 0 });
      if (t.kind <= 2) this.blobs.push(t.x, y, t.z, 1.6 * t.s);
      else if (t.kind === 4) this.blobs.push(t.x, y, t.z, 0.9 * t.s);
    });
    this.blobs.end();
    for (let k = 0; k < 6; k++) {
      const im = this.meshes[k];
      im.instanceMatrix.needsUpdate = true;
      im.instanceColor!.needsUpdate = true;
      im.computeBoundingSphere();
      this.counts.push(im.count);
      const cm = this.cards[k];
      if (cm) {
        cm.instanceMatrix.needsUpdate = true;
        cm.instanceColor!.needsUpdate = true;
        cm.computeBoundingSphere();
      }
    }
    // grama de lâminas onde o chão é grama e não foi cavado
    const src: GrassSource = {
      height: (x, z) => T.heightAt(x, z),
      cell: (x, z, out) => {
        const k = T.idx(x, z);
        if (T.mat[k] !== MAT_GRASS) return 0;
        if (Math.abs(T.h[k] - T.h0[k]) > 0.04) return 0;
        if (map.lake && Math.hypot(x - map.lake.x, z - map.lake.z) < map.lake.r + 3) return 0;
        const tn = T.tint[k];
        out[0] = 0.07 * (1 + tn * 3);
        out[1] = 0.17 * (1 + tn * 2);
        out[2] = 0.03;
        out[3] = 0.75 + Math.max(0, tn) * 4;
        // menos grama perto das árvores e nas encostas
        const sl = Math.abs(T.h[k + 1] - T.h[k - 1]) + Math.abs(T.h[k + V] - T.h[k - V]);
        return Math.max(0, 0.95 - sl * 0.9);
      },
    };
    this.grass = new GrassField(scene, src, nq.grass, { width: 1.4, height: 0.9 });
    // escavação: refaz os canteiros tocados
    T.onEdit = (x0, z0, x1, z1) => this.grass.invalidate(x0, z0, x1, z1);
    this.setTier(tier);
  }

  /** pinta uma planta conforme a queima (0 = verde, 1 = carvão) */
  burn(n: number, b: number): void {
    const r = this.ref[n];
    if (!r || Math.abs(r.burn - b) < 0.05) return;
    r.burn = b;
    const im = this.meshes[r.kind];
    const k = 1 - b * 0.82;
    const base = r.kind === 3 || r.kind === 5 ? [0.42, 0.68, 0.28] : [1, 1, 1];
    _c.setRGB(base[0] * k + b * 0.12, base[1] * k, base[2] * k * (1 - b * 0.3));
    im.setColorAt(r.idx, _c);
    im.instanceColor!.needsUpdate = true;
    const cm = this.cards[r.kind];
    if (cm) {
      cm.setColorAt(r.idx, _c);
      cm.instanceColor!.needsUpdate = true;
    }
  }

  /**
   * Esconde as árvores que tapam a vista: perto do segmento câmera→alvo (a,b).
   * Chamar por quadro; só reescreve as instâncias que mudaram.
   */
  occlude(ax: number, az: number, bx: number, bz: number): void {
    const dx = bx - ax;
    const dz = bz - az;
    const L2 = dx * dx + dz * dz || 1;
    const now = this.hideNow;
    now.clear();
    const T = this.trees;
    for (let n = 0; n < T.length; n++) {
      const t = T[n];
      if (t.kind > 3) continue;
      let u = ((t.x - ax) * dx + (t.z - az) * dz) / L2;
      if (u < -0.1 || u > 0.92) continue;
      u = u < 0 ? 0 : u;
      const px = ax + dx * u - t.x;
      const pz = az + dz * u - t.z;
      const rr = t.kind === 3 ? 1.2 : 2.6 * t.s;
      if (px * px + pz * pz < rr * rr) now.add(n);
    }
    let dirty = false;
    for (const n of this.hidden)
      if (!now.has(n)) {
        this.setVis(n, true);
        dirty = true;
      }
    for (const n of now)
      if (!this.hidden.has(n)) {
        this.setVis(n, false);
        dirty = true;
      }
    if (dirty) {
      this.hidden.clear();
      for (const n of now) this.hidden.add(n);
    }
  }
  private setVis(n: number, on: boolean): void {
    const r = this.ref[n];
    const im = this.meshes[r.kind];
    if (on) _m.fromArray(this.mats, n * 16);
    else _m.makeScale(0, 0, 0);
    im.setMatrixAt(r.idx, _m);
    im.instanceMatrix.needsUpdate = true;
    const cm = this.cards[r.kind];
    if (cm) {
      cm.setMatrixAt(r.idx, _m);
      cm.instanceMatrix.needsUpdate = true;
    }
  }

  setTier(t: Tier): void {
    const tf = [0.5, 0.75, 1, 1][t];
    this.meshes.forEach((im, k) => {
      im.count = Math.round(this.counts[k] * (k >= 3 ? tf * tf : tf));
      im.castShadow = t >= 3 && k <= 2;
      const cm = this.cards[k];
      if (cm) cm.count = im.count;
    });
    const nq = natureQ(t);
    this.grass.setQuality(nq.grass);
    this.blobs.opacity = nq.blobAlpha;
  }

  update(time: number, cx: number, cy: number, cz: number, px: number, pz: number, pushR: number): void {
    windTime.value = time;
    this.grass.update(cx, cy, cz, px, pz, pushR);
    void this.gc;
  }

  dispose(): void {
    this.T.onEdit = null;
    for (const im of this.meshes) {
      this.scene.remove(im);
      im.geometry.dispose();
      im.dispose();
    }
    for (const cm of this.cards)
      if (cm) {
        this.scene.remove(cm);
        cm.geometry.dispose();
        cm.dispose();
      }
    this.grass.dispose();
    this.blobs.dispose();
  }
}
