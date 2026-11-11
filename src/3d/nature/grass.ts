/* ============================================================
 *  NATUREZA — grama de lâminas na GPU.
 *  O chão em volta da câmera é dividido em "canteiros" (P×P m);
 *  cada canteiro é UMA malha (uma chamada de desenho) com milhares de
 *  lâminas. A CPU só grava a raiz, a cor e 4 bytes aleatórios por
 *  lâmina quando o canteiro entra no raio (≤ 1 por quadro, buffers
 *  reaproveitados: nada é alocado no laço). Forma, curvatura, vento,
 *  empurrão do jogador e a rarefação com a distância são calculados
 *  no vertex shader. A normal é a do chão: a grama acende igual ao
 *  terreno e a raiz tem a mesma cor dele (some na emenda).
 * ============================================================ */
import * as THREE from 'three';
import { windTime } from './wind';

export interface GrassQ {
  /** lâminas por m² (densidade máxima, perto) */
  density: number;
  /** distância (m) onde a grama termina */
  dist: number;
  /** 1 = lâmina de 1 triângulo; 2 = 3 triângulos curvados */
  segs: 1 | 2;
  /** largura da base (m) */
  width: number;
  /** multiplica a altura */
  height: number;
}

export interface GrassSource {
  /** altura exata do chão (as raízes ficam 2 cm abaixo) */
  height(x: number, z: number): number;
  /**
   * Amostra da grade (1 m): devolve a densidade 0..1 (0 = sem grama: água, pedra, caminho, construção)
   * e escreve em out a cor da raiz (linear) [r,g,b] e o multiplicador de altura [3].
   */
  cell(x: number, z: number, out: Float32Array): number;
}

const P = 16; // tamanho do canteiro (m)
const G = P + 1; // pontos da grade por lado

interface Patch {
  ix: number;
  iz: number;
  key: number;
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  pos: Float32Array;
  col: Uint8Array;
  bl: Uint8Array;
  dirty: boolean;
}

const keyOf = (ix: number, iz: number) => (ix + 32768) * 65536 + (iz + 32768);

export class GrassField {
  readonly mat: THREE.MeshLambertMaterial;
  readonly uniforms = {
    uCam: { value: new THREE.Vector3() },
    uPush: { value: new THREE.Vector3(0, 0, -1e5) },
    uGrass: { value: new THREE.Vector4(20, 10, 0.08, 1) },
    uWind: { value: new THREE.Vector2(0.18, 0.1) },
    /** cor da raiz e da ponta (multiplicadores da cor do chão) */
    uGrassC: { value: new THREE.Vector2(0.78, 1.32) },
  };
  private q: GrassQ | null;
  private map = new Map<number, Patch>();
  private active: Patch[] = [];
  private pool: Patch[] = [];
  private cap = 0;
  private vpb = 5;
  private ipb = 9;
  private index: THREE.BufferAttribute | null = null;
  private shape: THREE.BufferAttribute | null = null;
  private grid = new Float32Array(G * G * 5);
  private tmp = new Float32Array(4);
  private group = new THREE.Group();
  /** canteiros montados (estatística) */
  built = 0;

  constructor(
    parent: THREE.Object3D,
    private src: GrassSource,
    q: GrassQ | null,
    /** ajuste do jogo: câmera alta pede lâminas mais largas */
    private look: { width?: number; height?: number; contrast?: number } = {},
  ) {
    this.group.name = 'grass';
    parent.add(this.group);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const U = this.uniforms;
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uWindT = windTime;
      sh.uniforms.uCam = U.uCam;
      sh.uniforms.uPush = U.uPush;
      sh.uniforms.uGrass = U.uGrass;
      sh.uniforms.uWind = U.uWind;
      sh.uniforms.uGrassC = U.uGrassC;
      sh.vertexShader = sh.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uWindT;
uniform vec3 uCam;
uniform vec3 uPush;
uniform vec4 uGrass;
uniform vec2 uWind;
uniform vec2 uGrassC;
attribute vec4 aBlade;
attribute vec2 aShape;`,
        )
        .replace(
          '#include <color_vertex>',
          `vColor = color * mix(uGrassC.x, uGrassC.y, aShape.x) + vec3(0.06, 0.055, 0.0) * aShape.x * aShape.x;`,
        )
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace(
          '#include <begin_vertex>',
          `vec3 root = position;
float dCam = length(root.xz - uCam.xz);
// rarefação: perto todas as lâminas; perto do fim só as de rank baixo, que encolhem até sumir
float dens = 1.0 - smoothstep(uGrass.y, uGrass.x, dCam);
float vis = clamp((dens - aBlade.z) * 7.0, 0.0, 1.0);
float hh = (0.22 + aBlade.y * 0.55) * uGrass.w * vis;
float ang = aBlade.x * 6.2831853;
vec2 dir = vec2(cos(ang), sin(ang));
vec2 perp = vec2(-dir.y, dir.x);
float t = aShape.x;
float side = aShape.y * 2.0 - 1.0;
float w = uGrass.z * (1.0 - t * 0.92) * (0.35 + 0.65 * vis);
float ph = root.x * 0.21 + root.z * 0.17;
float gust = 0.5 + 0.5 * sin(uWindT * 0.6 + root.x * 0.045 + root.z * 0.03);
float sway = sin(uWindT * 2.2 + ph * 2.0) * 0.55 + sin(uWindT * 3.6 + ph * 3.3) * 0.2;
vec2 bend = uWind * (0.55 + sway) * (0.5 + gust) + dir * (aBlade.w - 0.5) * 0.7;
vec2 dp = root.xz - uPush.xy;
float pd = length(dp) + 1e-4;
bend += dp / pd * smoothstep(uPush.z, 0.0, pd) * 1.2;
float tb = t * t;
float bl = min(1.0, length(bend));
vec3 transformed = root + vec3(perp.x * side * w + bend.x * tb * hh, hh * t * (1.0 - 0.35 * bl * tb), perp.y * side * w + bend.y * tb * hh);`,
        );
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    };
    this.mat.customProgramCacheKey = () => 'natureGrass2';
    const ct = look.contrast ?? 1;
    this.uniforms.uGrassC.value.set(1 - 0.22 * ct, 1 + 0.32 * ct);
    this.q = null;
    this.setQuality(q);
  }

  get quality(): GrassQ | null {
    return this.q;
  }

  /** troca a qualidade (refaz os canteiros aos poucos) */
  setQuality(q: GrassQ | null): void {
    const same = q && this.q && q.density === this.q.density && q.segs === this.q.segs;
    this.q = q;
    if (q) {
      const u = this.uniforms.uGrass.value;
      u.set(q.dist, q.dist * 0.45, q.width * (this.look.width ?? 1), q.height * (this.look.height ?? 1));
    }
    if (same) return;
    for (const p of this.active) this.freePatch(p, true);
    for (const p of this.pool) this.freePatch(p, true);
    this.active.length = 0;
    this.pool.length = 0;
    this.map.clear();
    this.index = null;
    this.shape = null;
    if (!q) {
      this.cap = 0;
      return;
    }
    this.vpb = q.segs === 1 ? 3 : 5;
    this.ipb = q.segs === 1 ? 3 : 9;
    this.cap = Math.min(Math.floor(65535 / this.vpb), Math.ceil(q.density * P * P));
    const idx = new Uint16Array(this.cap * this.ipb);
    const shp = new Uint8Array(this.cap * this.vpb * 2);
    for (let b = 0; b < this.cap; b++) {
      const v = b * this.vpb;
      const i = b * this.ipb;
      if (q.segs === 1) {
        idx[i] = v;
        idx[i + 1] = v + 1;
        idx[i + 2] = v + 2;
        shp.set([0, 0, 0, 255, 255, 128], v * 2);
      } else {
        idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2, v + 2, v + 3, v + 4], i);
        shp.set([0, 0, 0, 255, 128, 0, 128, 255, 255, 128], v * 2);
      }
    }
    this.index = new THREE.BufferAttribute(idx, 1);
    this.shape = new THREE.BufferAttribute(shp, 2, true);
  }

  /** marca para refazer os canteiros que tocam o retângulo (escavação, construção) */
  invalidate(x0: number, z0: number, x1: number, z1: number): void {
    for (const p of this.active) {
      const px = p.ix * P;
      const pz = p.iz * P;
      if (px <= x1 && px + P >= x0 && pz <= z1 && pz + P >= z0) p.dirty = true;
    }
  }
  invalidateAll(): void {
    for (const p of this.active) p.dirty = true;
  }

  /**
   * Chamar por quadro com a posição da câmera (e do jogador, para amassar a grama).
   * Monta no máximo um canteiro por quadro (o mais perto primeiro).
   */
  update(cx: number, cy: number, cz: number, px = 0, pz = 0, pushR = 0): void {
    this.uniforms.uCam.value.set(cx, cy, cz);
    this.uniforms.uPush.value.set(px, pz, pushR);
    const q = this.q;
    this.group.visible = !!q;
    if (!q) return;
    const reach = q.dist + P * 0.72;
    // libera os distantes
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      const d = Math.hypot(p.ix * P + P / 2 - cx, p.iz * P + P / 2 - cz);
      if (d > reach + P) {
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.map.delete(p.key);
        this.group.remove(p.mesh);
        this.pool.push(p);
      }
    }
    // o mais perto que falta (ou sujo)
    const cix = Math.floor(cx / P);
    const ciz = Math.floor(cz / P);
    const r = Math.ceil(reach / P);
    let bx = 0;
    let bz = 0;
    let bd = 1e9;
    let bp: Patch | null = null;
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const ix = cix + dx;
        const iz = ciz + dz;
        const d = Math.hypot(ix * P + P / 2 - cx, iz * P + P / 2 - cz);
        if (d > reach || d >= bd) continue;
        const p = this.map.get(keyOf(ix, iz));
        if (p && !p.dirty) continue;
        bd = d;
        bx = ix;
        bz = iz;
        bp = p ?? null;
      }
    if (bd < 1e9) this.build(bx, bz, bp);
  }

  private build(ix: number, iz: number, p: Patch | null): void {
    if (!p) {
      p = this.pool.pop() ?? this.makePatch();
      p.ix = ix;
      p.iz = iz;
      p.key = keyOf(ix, iz);
      this.map.set(p.key, p);
      this.active.push(p);
      this.group.add(p.mesh);
    }
    p.dirty = false;
    this.fill(p);
    this.built++;
  }

  private makePatch(): Patch {
    const nv = this.cap * this.vpb;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nv * 3);
    const col = new Uint8Array(nv * 3);
    const bl = new Uint8Array(nv * 4);
    const pa = new THREE.BufferAttribute(pos, 3);
    const ca = new THREE.BufferAttribute(col, 3, true);
    const ba = new THREE.BufferAttribute(bl, 4, true);
    geo.setAttribute('position', pa);
    geo.setAttribute('color', ca);
    geo.setAttribute('aBlade', ba);
    geo.setAttribute('aShape', this.shape!);
    geo.setIndex(this.index);
    geo.boundingSphere = new THREE.Sphere();
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return { ix: 0, iz: 0, key: 0, mesh, geo, pos, col, bl, dirty: false };
  }

  private freePatch(p: Patch, dispose: boolean): void {
    this.group.remove(p.mesh);
    if (dispose) p.geo.dispose();
  }

  /** preenche o canteiro (determinístico pela posição: refazer dá as mesmas lâminas) */
  private fill(p: Patch): void {
    const x0 = p.ix * P;
    const z0 = p.iz * P;
    const g = this.grid;
    const tmp = this.tmp;
    let any = false;
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const o = (j * G + i) * 5;
        tmp[3] = 1;
        const k = this.src.cell(x0 + i, z0 + j, tmp);
        g[o] = k;
        g[o + 1] = tmp[0];
        g[o + 2] = tmp[1];
        g[o + 3] = tmp[2];
        g[o + 4] = tmp[3];
        if (k > 0) any = true;
      }
    let n = 0;
    let ymin = 1e9;
    let ymax = -1e9;
    if (any) {
      // gerador simples por canteiro
      let s = (Math.imul(p.ix, 73856093) ^ Math.imul(p.iz, 19349663)) | 0;
      const rnd = () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const vpb = this.vpb;
      const pos = p.pos;
      const col = p.col;
      const bl = p.bl;
      for (let b = 0; b < this.cap; b++) {
        const fx = rnd() * P;
        const fz = rnd() * P;
        const acc = rnd();
        const a0 = rnd();
        const a1 = rnd();
        const a2 = rnd();
        const a3 = rnd();
        const i = Math.min(P - 1, fx | 0);
        const j = Math.min(P - 1, fz | 0);
        const tx = fx - i;
        const tz = fz - j;
        const o00 = (j * G + i) * 5;
        const o10 = o00 + 5;
        const o01 = o00 + G * 5;
        const o11 = o01 + 5;
        const w00 = (1 - tx) * (1 - tz);
        const w10 = tx * (1 - tz);
        const w01 = (1 - tx) * tz;
        const w11 = tx * tz;
        // sem grama se algum canto for "proibido" (borda limpa em água/caminho)
        if (g[o00] <= 0 || g[o10] <= 0 || g[o01] <= 0 || g[o11] <= 0) {
          if (g[o00] + g[o10] + g[o01] + g[o11] <= 0) continue;
          const kmin = Math.min(g[o00], g[o10], g[o01], g[o11]);
          if (kmin <= 0 && acc > 0.15) continue;
        }
        const k = g[o00] * w00 + g[o10] * w10 + g[o01] * w01 + g[o11] * w11;
        if (acc > k) continue;
        const x = x0 + fx;
        const z = z0 + fz;
        const y = this.src.height(x, z) - 0.02;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
        const cr = g[o00 + 1] * w00 + g[o10 + 1] * w10 + g[o01 + 1] * w01 + g[o11 + 1] * w11;
        const cg = g[o00 + 2] * w00 + g[o10 + 2] * w10 + g[o01 + 2] * w01 + g[o11 + 2] * w11;
        const cb = g[o00 + 3] * w00 + g[o10 + 3] * w10 + g[o01 + 3] * w01 + g[o11 + 3] * w11;
        const hm = g[o00 + 4] * w00 + g[o10 + 4] * w10 + g[o01 + 4] * w01 + g[o11 + 4] * w11;
        // pequena variação de tom por lâmina
        const tone = 0.9 + a3 * 0.2;
        const R = Math.min(255, cr * tone * 255) | 0;
        const Gc = Math.min(255, cg * tone * 255) | 0;
        const B = Math.min(255, cb * tone * 255) | 0;
        const hB = Math.min(255, a1 * hm * 200) | 0;
        for (let v = 0; v < vpb; v++) {
          const vi = n * vpb + v;
          pos[vi * 3] = x;
          pos[vi * 3 + 1] = y;
          pos[vi * 3 + 2] = z;
          col[vi * 3] = R;
          col[vi * 3 + 1] = Gc;
          col[vi * 3 + 2] = B;
          bl[vi * 4] = (a0 * 255) | 0;
          bl[vi * 4 + 1] = hB;
          bl[vi * 4 + 2] = (a2 * 255) | 0;
          bl[vi * 4 + 3] = ((a3 * 0.6 + 0.2) * 255) | 0;
        }
        n++;
      }
    }
    const geo = p.geo;
    geo.setDrawRange(0, n * this.ipb);
    p.mesh.visible = n > 0;
    if (n > 0) {
      for (const k of ['position', 'color', 'aBlade'] as const) {
        const a = geo.getAttribute(k) as THREE.BufferAttribute;
        a.clearUpdateRanges();
        a.addUpdateRange(0, n * this.vpb * a.itemSize);
        a.needsUpdate = true;
      }
      const hy = (ymax - ymin) / 2;
      geo.boundingSphere!.center.set(x0 + P / 2, ymin + hy + 0.4, z0 + P / 2);
      geo.boundingSphere!.radius = Math.hypot(P * 0.71, hy + 1);
    }
  }

  dispose(): void {
    for (const p of this.active) this.freePatch(p, true);
    for (const p of this.pool) this.freePatch(p, true);
    this.active.length = 0;
    this.pool.length = 0;
    this.map.clear();
    this.group.parent?.remove(this.group);
    this.mat.dispose();
  }
}
