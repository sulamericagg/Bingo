/* ============================================================
 *  POUSO FORÇADO — nuvens estilizadas "volumétricas": cachos de
 *  bolotas macias em billboard (uma só chamada de desenho, ordenadas
 *  de trás para frente de tempos em tempos), topo iluminado e base
 *  sombreada, somem suavemente quando a câmera chega perto (nada de
 *  polígono cortando a tela) e um véu branco quando o avião atravessa.
 *  Quantidade por nível de qualidade.
 * ============================================================ */
import * as THREE from 'three';
import { canvas } from '../../3d/common/tex';

const TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

interface Cluster {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  /** primeira bolota e quantidade */
  i0: number;
  n: number;
  /** nuvem de passagem (reciclada perto do avião) */
  near: boolean;
}

/** bolota macia com "couve-flor" na borda (alfa) e leve textura de detalhe (vermelho) */
function puffTexture(): THREE.CanvasTexture {
  const S = 128;
  const [cv, c] = canvas(S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  c.fillStyle = 'rgba(0,0,0,0)';
  c.fillRect(0, 0, S, S);
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(0.55, `rgba(240,240,240,${a * 0.75})`);
    g.addColorStop(1, 'rgba(230,230,230,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fill();
  };
  blob(64, 66, 44, 0.95);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + rnd() * 0.5;
    const d = 22 + rnd() * 12;
    blob(64 + Math.cos(a) * d, 66 + Math.sin(a) * d * 0.85, 18 + rnd() * 10, 0.75);
  }
  // detalhe: pontos levemente mais escuros (o shader usa o vermelho como sombreado fino)
  const img = c.getImageData(0, 0, S, S);
  const d = img.data;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const n = 0.86 + 0.14 * Math.sin(x * 0.21 + Math.sin(y * 0.17) * 2) * Math.sin(y * 0.19 + Math.cos(x * 0.13) * 2);
      d[i] = Math.round(255 * n);
      d[i + 1] = d[i + 2] = 255;
    }
  c.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

const VS = `
attribute vec3 offset;
attribute vec2 scl;
attribute float shade;
attribute float rot;
uniform float fogNear;
uniform float fogFar;
varying vec2 vUv;
varying float vA;
varying float vFog;
varying float vL;
void main(){
  vec4 mv = modelViewMatrix * vec4(offset, 1.0);
  float d = length(mv.xyz);
  float c = cos(rot), s = sin(rot);
  vec2 p = position.xy;
  vec2 pr = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  mv.xy += pr * scl;
  gl_Position = projectionMatrix * mv;
  vUv = uv;
  float r = max(scl.x, scl.y);
  // perto demais: some (sem cortar na câmera); o véu branco cobre a travessia
  vA = smoothstep(r * 0.3, r * 1.15, d);
  vFog = smoothstep(fogNear, fogFar, d);
  // topo iluminado, base na sombra (no espaço da tela, não gira com a bolota)
  vL = clamp(shade + p.y * 0.55, 0.0, 1.0);
}`;
const FS = `
uniform sampler2D map;
uniform vec3 lit;
uniform vec3 shadow;
uniform vec3 fogCol;
uniform float opacity;
varying vec2 vUv;
varying float vA;
varying float vFog;
varying float vL;
void main(){
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA * opacity;
  if (a < 0.01) discard;
  vec3 col = mix(shadow, lit, clamp(vL * t.r * 1.08, 0.0, 1.0));
  col = mix(col, fogCol, vFog * 0.85);
  gl_FragColor = vec4(col, a);
}`;

export class CloudField {
  readonly mesh: THREE.Mesh;
  /** véu branco em tela cheia (desenhado depois do mundo, antes da cabine) */
  readonly wash: THREE.Mesh;
  readonly washScene = new THREE.Scene();
  readonly washCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  /** 0..1: quanto o avião está dentro de uma nuvem */
  inside = 0;
  private cl: Cluster[] = [];
  /** bolotas: posição relativa ao centro do cacho + tamanho + sombra + giro */
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private ps: Float32Array;
  private psh: Float32Array;
  private prot: Float32Array;
  private owner: Int32Array;
  private order: Int32Array;
  private depth: Float32Array;
  private aOff: THREE.InstancedBufferAttribute;
  private aScl: THREE.InstancedBufferAttribute;
  private aSh: THREE.InstancedBufferAttribute;
  private aRot: THREE.InstancedBufferAttribute;
  private u: Record<string, THREE.IUniform>;
  private sortT = 0;
  private rnd: () => number;
  private N: number;

  constructor(tier: number, seed = 99) {
    let sd = seed;
    this.rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const r = this.rnd;
    const nFar = [16, 26, 38, 54][tier] ?? 26;
    const nNear = [3, 4, 6, 8][tier] ?? 4;
    const per = [9, 12, 16, 20][tier] ?? 12;
    const total = (nFar + nNear) * per;
    this.N = total;
    this.px = new Float32Array(total);
    this.py = new Float32Array(total);
    this.pz = new Float32Array(total);
    this.ps = new Float32Array(total);
    this.psh = new Float32Array(total);
    this.prot = new Float32Array(total);
    this.owner = new Int32Array(total);
    this.order = new Int32Array(total);
    this.depth = new Float32Array(total);
    let i0 = 0;
    for (let c = 0; c < nFar + nNear; c++) {
      const near = c >= nFar;
      const hi = !near && c % 7 === 0;
      const rx = hi ? 700 + r() * 600 : 260 + r() * 340;
      const ry = hi ? 60 + r() * 40 : 90 + r() * 90;
      const rz = rx * (0.6 + r() * 0.5);
      const cl: Cluster = {
        x: (r() * 2 - 1) * 26000,
        y: hi ? 3700 + r() * 500 : 1450 + r() * 450,
        z: -6000 + r() * 60000,
        rx,
        ry,
        rz,
        i0,
        n: per,
        near,
      };
      if (near) cl.y = -99999;
      this.cl.push(cl);
      this.fillPuffs(cl);
      i0 += per;
    }
    for (let i = 0; i < total; i++) this.order[i] = i;
    // geometria instanciada (um quadrado por bolota)
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.aOff = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    this.aScl = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2);
    this.aSh = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(total), 1);
    for (const a of [this.aOff, this.aScl, this.aSh, this.aRot]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('offset', this.aOff);
    g.setAttribute('scl', this.aScl);
    g.setAttribute('shade', this.aSh);
    g.setAttribute('rot', this.aRot);
    g.instanceCount = total;
    this.u = {
      map: { value: puffTexture() },
      lit: { value: new THREE.Color(1, 1, 1) },
      shadow: { value: new THREE.Color(0.72, 0.76, 0.88) },
      fogCol: { value: new THREE.Color(1, 0.9, 0.8) },
      fogNear: { value: 2500 },
      fogFar: { value: 70000 },
      opacity: { value: 0.92 },
    };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.writeAll();
    // véu
    this.wash = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.MeshBasicMaterial({ color: '#f6f2f4', transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }),
    );
    this.washScene.add(this.wash);
  }

  private fillPuffs(cl: Cluster): void {
    const r = this.rnd;
    for (let k = 0; k < cl.n; k++) {
      const i = cl.i0 + k;
      // dentro do elipsoide, base achatada (as bolotas de baixo ficam mais largas e na sombra)
      const a = r() * TAU;
      const rr = Math.sqrt(r()) * 0.8;
      const yy = (r() * 2 - 1) * 0.7;
      const x = Math.cos(a) * rr * cl.rx;
      const z = Math.sin(a) * rr * cl.rz;
      const y = (yy < -0.35 ? -0.35 + (yy + 0.35) * 0.2 : yy) * cl.ry;
      this.px[i] = x;
      this.py[i] = y;
      this.pz[i] = z;
      const edge = 1 - rr;
      this.ps[i] = (0.55 + r() * 0.45) * Math.max(cl.ry * 1.4, Math.min(cl.rx, cl.rz) * (0.45 + edge * 0.35));
      this.psh[i] = clamp(0.5 + (y / cl.ry) * 0.45 + (r() - 0.5) * 0.15, 0.05, 1);
      this.prot[i] = r() * TAU;
      this.owner[i] = this.cl.indexOf(cl) >= 0 ? this.cl.indexOf(cl) : this.cl.length;
    }
  }

  /** grava atributos na ordem atual (de trás para frente) */
  private writeAll(): void {
    const off = this.aOff.array as Float32Array;
    const scl = this.aScl.array as Float32Array;
    const sh = this.aSh.array as Float32Array;
    const rot = this.aRot.array as Float32Array;
    for (let j = 0; j < this.N; j++) {
      const i = this.order[j];
      const c = this.cl[this.owner[i]];
      off[j * 3] = c.x + this.px[i];
      off[j * 3 + 1] = c.y + this.py[i];
      off[j * 3 + 2] = c.z + this.pz[i];
      scl[j * 2] = this.ps[i] * 1.25;
      scl[j * 2 + 1] = this.ps[i];
      sh[j] = this.psh[i];
      rot[j] = this.prot[i];
    }
    this.aOff.needsUpdate = this.aScl.needsUpdate = this.aSh.needsUpdate = this.aRot.needsUpdate = true;
  }

  /** cores do céu (pôr do sol) e da neblina */
  setColors(lit: THREE.Color, shadow: THREE.Color, fog: THREE.Fog): void {
    (this.u.lit.value as THREE.Color).copy(lit).convertLinearToSRGB();
    (this.u.shadow.value as THREE.Color).copy(shadow).convertLinearToSRGB();
    (this.u.fogCol.value as THREE.Color).copy(fog.color).convertLinearToSRGB();
    this.u.fogNear.value = Math.max(fog.near, 1500);
    this.u.fogFar.value = Math.max(fog.far, 40000);
    (this.wash.material as THREE.MeshBasicMaterial).color.copy(lit).lerp(shadow, 0.25);
  }

  /**
   * Por quadro: recicla as nuvens de passagem à frente do avião, mede se a câmera está dentro
   * de alguma (véu branco) e reordena de tempos em tempos.
   */
  update(dt: number, cam: THREE.Vector3, plane: THREE.Vector3, hdg: number, air: boolean, t: number): number {
    const fx = Math.sin(hdg);
    const fz = -Math.cos(hdg);
    const r = this.rnd;
    let moved = false;
    for (const c of this.cl) {
      if (!c.near) continue;
      const dx = c.x - plane.x;
      const dz = c.z - plane.z;
      const ahead = dx * fx + dz * fz;
      if (air && (c.y < -9000 || ahead < -1400 || Math.hypot(dx, dz) > 5200)) {
        const first = c.y < -9000;
        const d = first ? 900 + r() * 3200 : 3000 + r() * 1800;
        // metade passa bem no caminho (atravessar a nuvem), o resto ao lado
        const side = (r() < 0.5 ? (r() * 2 - 1) * 120 : (r() * 2 - 1) * 1600);
        c.x = plane.x + fx * d - fz * side;
        c.z = plane.z + fz * d + fx * side;
        c.y = Math.max(220, plane.y + (r() * 2 - 1) * 140);
        moved = true;
      } else if (!air && c.y > -9000) {
        c.y = -99999;
        moved = true;
      }
    }
    // dentro?
    let inside = 0;
    for (const c of this.cl) {
      const dx = (cam.x - c.x) / c.rx;
      const dy = (cam.y - c.y) / (c.ry * 1.25);
      const dz = (cam.z - c.z) / c.rz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 1.1) inside = Math.max(inside, clamp((1.1 - d) / 0.45, 0, 1));
    }
    // entra rápido, sai um pouco mais devagar (sem piscar)
    this.inside += (inside - this.inside) * Math.min(1, dt * (inside > this.inside ? 5 : 2.5));
    const wm = this.wash.material as THREE.MaterialParameters & THREE.MeshBasicMaterial;
    wm.opacity = this.inside * (0.72 + 0.12 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1));
    this.wash.visible = wm.opacity > 0.01;
    // ordena de trás para frente a cada ~0,15 s (ou quando algo andou)
    this.sortT -= dt;
    if (this.sortT <= 0 || moved) {
      this.sortT = 0.15;
      for (let i = 0; i < this.N; i++) {
        const c = this.cl[this.owner[i]];
        const x = c.x + this.px[i] - cam.x;
        const y = c.y + this.py[i] - cam.y;
        const z = c.z + this.pz[i] - cam.z;
        this.depth[i] = x * x + y * y + z * z;
      }
      const dep = this.depth;
      const ord = Array.from(this.order).sort((a, b) => dep[b] - dep[a]);
      for (let i = 0; i < this.N; i++) this.order[i] = ord[i];
      this.writeAll();
    }
    return this.inside;
  }

  /** usada pela vista para fechar a neblina dentro das nuvens */
  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    (this.u.map.value as THREE.Texture).dispose();
    this.wash.geometry.dispose();
    (this.wash.material as THREE.Material).dispose();
  }
}
