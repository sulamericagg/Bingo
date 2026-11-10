/* ============================================================
 *  Construtor de geometria estática MESCLADA com cor por vértice.
 *  Um cenário inteiro (bancadas, paredes, fogões...) vira poucas malhas
 *  (uma por material): poucas chamadas de desenho mesmo em celular fraco.
 *  - caixas com BISEL (cantos arredondados) — nada de "blocos"
 *  - torno (lathe) para panelas, pratos, potes, lâmpadas
 *  - tubos para alças, torneiras e canos
 *  - UV projetado no mundo (1 unidade = 1 m) para texturas que repetem
 *  - oclusão "assada" na cor do vértice (escurece perto do chão)
 * ============================================================ */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const TC = new THREE.Color();

export class GeoBuilder {
  private list: THREE.BufferGeometry[] = [];
  /** escurece a base das peças (oclusão "assada") */
  ao = true;
  /** segmentos do bisel das caixas (0 = caixa reta) */
  bevel = 2;
  /** menor dimensão para ganhar bisel (peças menores ficam retas: economiza triângulos) */
  minBevel = 0.012;
  /** escala do UV projetado (repetições por metro) */
  uvScale = 1;
  /** variação de cor aleatória por peça (0..1) — quebra a uniformidade */
  jitter = 0;
  private seed = 1;
  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  private push(g: THREE.BufferGeometry, col: string, x: number, y: number, z: number, rx: number, ry: number, rz: number, grad = 0): this {
    if (rx) g.rotateX(rx);
    if (rz) g.rotateZ(rz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const ng = g.index ? g.toNonIndexed() : g;
    if (ng !== g) g.dispose();
    if (!ng.getAttribute('normal')) ng.computeVertexNormals();
    const pos = ng.getAttribute('position');
    const nor = ng.getAttribute('normal');
    const n = pos.count;
    // UV projetado na face dominante (triplanar "barato")
    const uv = new Float32Array(n * 2);
    const us = this.uvScale;
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nor.getX(i));
      const ay = Math.abs(nor.getY(i));
      const az = Math.abs(nor.getZ(i));
      if (ay >= ax && ay >= az) (uv[i * 2] = pos.getX(i) * us), (uv[i * 2 + 1] = pos.getZ(i) * us);
      else if (ax >= az) (uv[i * 2] = pos.getZ(i) * us), (uv[i * 2 + 1] = pos.getY(i) * us);
      else (uv[i * 2] = pos.getX(i) * us), (uv[i * 2 + 1] = pos.getY(i) * us);
    }
    ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const c = new Float32Array(n * 3);
    TC.set(col).convertSRGBToLinear();
    if (this.jitter) {
      const j = (this.rnd() - 0.5) * this.jitter;
      TC.multiplyScalar(1 + j);
    }
    let y0 = Infinity;
    let y1 = -Infinity;
    if (grad) for (let i = 0; i < n; i++) (y0 = Math.min(y0, pos.getY(i))), (y1 = Math.max(y1, pos.getY(i)));
    for (let i = 0; i < n; i++) {
      let k = this.ao ? 0.7 + 0.3 * Math.min(1, Math.max(0, pos.getY(i) / 0.35)) : 1;
      // faces viradas para baixo recebem menos luz ambiente
      if (this.ao && nor.getY(i) < -0.5) k *= 0.8;
      if (grad) k *= 1 - grad + grad * ((pos.getY(i) - y0) / Math.max(1e-4, y1 - y0));
      c[i * 3] = TC.r * k;
      c[i * 3 + 1] = TC.g * k;
      c[i * 3 + 2] = TC.b * k;
    }
    ng.setAttribute('color', new THREE.BufferAttribute(c, 3));
    this.list.push(ng);
    return this;
  }
  /** caixa (bisel automático) com (x,y,z) = centro da BASE */
  box(w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0, rx = 0, rz = 0): this {
    const m = Math.min(w, h, d);
    let g: THREE.BufferGeometry;
    if (this.bevel > 0 && m >= this.minBevel) {
      const r = Math.min(0.03, m * 0.24);
      g = new RoundedBoxGeometry(w, h, d, m < 0.05 ? 1 : this.bevel, r);
    } else g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.push(g, col, x, y, z, rx, ry, rz);
  }
  /** caixa de cantos vivos (paredes, pisos, peças finas) */
  sharp(w: number, h: number, d: number, x: number, y: number, z: number, col: string, ry = 0, rx = 0, rz = 0): this {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    return this.push(g, col, x, y, z, rx, ry, rz);
  }
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, col: string, seg = 12, rx = 0, rz = 0, ry = 0): this {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(0, h / 2, 0);
    return this.push(g, col, x, y, z, rx, ry, rz);
  }
  /** cilindro com as bordas arredondadas (torno) — botões, tampas, potes */
  rcyl(r: number, h: number, x: number, y: number, z: number, col: string, seg = 16, bev = 0.2, rx = 0, rz = 0, ry = 0): this {
    const b = Math.min(r, h) * bev;
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(r - b, 0), new THREE.Vector2(r - b * 0.3, b * 0.3), new THREE.Vector2(r, b), new THREE.Vector2(r, h - b), new THREE.Vector2(r - b * 0.3, h - b * 0.3), new THREE.Vector2(r - b, h), new THREE.Vector2(0, h)];
    return this.push(new THREE.LatheGeometry(pts, seg), col, x, y, z, rx, ry, rz);
  }
  sph(r: number, x: number, y: number, z: number, col: string, sx = 1, sy = 1, sz = 1, seg = 10): this {
    const g = new THREE.SphereGeometry(r, seg, Math.max(5, Math.round(seg * 0.7)));
    g.scale(sx, sy, sz);
    return this.push(g, col, x, y, z, 0, 0, 0);
  }
  torus(r: number, tube: number, x: number, y: number, z: number, col: string, rx = Math.PI / 2, seg = 18, ry = 0, arc = Math.PI * 2): this {
    const g = new THREE.TorusGeometry(r, tube, 6, seg, arc);
    return this.push(g, col, x, y, z, rx, ry, 0);
  }
  /** sólido de revolução: perfil [raio, altura][] (de baixo para cima) */
  lathe(profile: [number, number][], x: number, y: number, z: number, col: string, seg = 16, rx = 0, rz = 0, ry = 0, grad = 0): this {
    const g = new THREE.LatheGeometry(
      profile.map(([r, h]) => new THREE.Vector2(r, h)),
      seg,
    );
    return this.push(g, col, x, y, z, rx, ry, rz, grad);
  }
  /** tubo ao longo de pontos (alças, torneiras, canos, galhos) */
  tube(pts: [number, number, number][], r: number, col: string, seg = 12, radial = 6, closed = false): this {
    const curve = new THREE.CatmullRomCurve3(pts.map(([a, b, c]) => new THREE.Vector3(a, b, c)));
    return this.push(new THREE.TubeGeometry(curve, seg, r, radial, closed), col, 0, 0, 0, 0, 0, 0);
  }
  /** tronco de pirâmide de base retangular (exaustor, funil, lixeira) */
  frustum(wb: number, db: number, wt: number, dt: number, h: number, x: number, y: number, z: number, col: string, ry = 0): this {
    const g = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, 1, 4, 1, false, Math.PI / 4);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const top = p.getY(i) > 0;
      p.setXYZ(i, p.getX(i) * (top ? wt : wb), (p.getY(i) + 0.5) * h, p.getZ(i) * (top ? dt : db));
    }
    g.computeVertexNormals();
    return this.push(g, col, x, y, z, 0, ry, 0);
  }
  /** geometria qualquer (já na origem) */
  geo(g: THREE.BufferGeometry, col: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): this {
    return this.push(g, col, x, y, z, rx, ry, rz);
  }
  get empty(): boolean {
    return !this.list.length;
  }
  /** mescla tudo (e libera as peças) */
  build(): THREE.BufferGeometry {
    const g = this.list.length ? mergeGeometries(this.list, false)! : new THREE.BufferGeometry();
    for (const p of this.list) p.dispose();
    this.list = [];
    g.computeBoundingSphere();
    return g;
  }
}
