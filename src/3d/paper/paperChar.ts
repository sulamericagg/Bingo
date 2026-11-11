/* ============================================================
 *  PAPER — personagem 2D de papel num mundo 3D (billboard).
 *
 *  Um quad por personagem, que gira só em volta de Y (fica em pé no
 *  chão) e inclina um pouco para trás quando a câmera está alta.
 *  A vista (frente, ¾, lado, ¾ costas, costas — espelhando o outro
 *  lado) sai do ângulo entre para onde o Bloop olha e a câmera.
 *  Material Lambert compartilhado por atlas (recebe sol, céu, fogueira
 *  e neblina como o resto da cena) + alphaTest (sem ordenar, sem
 *  briga com grama/árvores). Ferramenta = segundo quad preso na mão.
 *  Nada é alocado por frame.
 * ============================================================ */
import * as THREE from 'three';
import { buildPaperAtlas, drawToolCanvas, FEET_K, FR, FRAMES, paperBodyColor, R_K, specKey, TOOL_GRIP, VIEW_DEG, VIEWS, type PaperAtlas, type PaperSpec, type PaperTool } from './paperAvatar';

/* ------------------------------ cache de atlas ------------------------------ */
const ATLAS = new Map<string, PaperAtlas>();
interface AtlasGL {
  tex: THREE.CanvasTexture;
  mat: THREE.MeshLambertMaterial;
}
function atlasFor(spec: PaperSpec, C: number): PaperAtlas & AtlasGL {
  const key = specKey(spec, C);
  let a = ATLAS.get(key) as (PaperAtlas & AtlasGL) | undefined;
  if (a) return a;
  const base = buildPaperAtlas(spec, C);
  const tex = new THREE.CanvasTexture(base.canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  const mat = new THREE.MeshLambertMaterial({
    map: tex,
    alphaTest: 0.5,
    transparent: false,
    side: THREE.DoubleSide,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: tex,
    emissiveIntensity: 0.08,
  });
  a = Object.assign(base, { tex, mat });
  ATLAS.set(key, a);
  trim();
  return a;
}
/** libera atlas sem uso (mantém poucos para voltar rápido ao jogo) */
function trim(): void {
  if (ATLAS.size <= 10) return;
  for (const [k, a] of ATLAS) {
    if (a.refs > 0) continue;
    const g = a as PaperAtlas & AtlasGL;
    g.tex.dispose();
    g.mat.dispose();
    ATLAS.delete(k);
    if (ATLAS.size <= 8) break;
  }
}
/** gera o atlas antes (tela de carregamento), sem criar personagem */
export function prewarmPaper(spec: PaperSpec, C = 128): void {
  atlasFor(spec, C);
}

const TOOLS = new Map<string, { tex: THREE.CanvasTexture; mat: THREE.MeshLambertMaterial }>();
function toolMat(kind: PaperTool, col: string, hand: string): THREE.MeshLambertMaterial {
  const k = kind + col + hand;
  let t = TOOLS.get(k);
  if (!t) {
    const tex = new THREE.CanvasTexture(drawToolCanvas(kind, col, hand, 64));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const glow = kind === 'lamp' || kind === 'torch';
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: new THREE.Color('#ffffff'), emissiveMap: tex, emissiveIntensity: glow ? 0.8 : 0.16 });
    t = { tex, mat };
    TOOLS.set(k, t);
  }
  return t.mat;
}

let shadowTex: THREE.CanvasTexture | null = null;
let shadowMat: THREE.MeshBasicMaterial | null = null;
function softShadowMat(): THREE.MeshBasicMaterial {
  if (shadowMat) return shadowMat;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(20,10,30,0.55)');
  g.addColorStop(0.6, 'rgba(20,10,30,0.28)');
  g.addColorStop(1, 'rgba(20,10,30,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  return shadowMat;
}

/* ------------------------------ personagem ------------------------------ */
export interface PaperOpts {
  /** raio do corpo no mundo (o Bloop 3D de Noites tem ~0,5) */
  radius?: number;
  /** lado da célula do atlas (px). Jogador: 128; outros: 96 */
  cell?: number;
  /** sombra suave própria no chão */
  shadow?: boolean;
  /** inclinação máxima para trás com câmera alta (rad) */
  tilt?: number;
}
export interface PaperState {
  /** para onde o Bloop olha (rotação Y, frente = +Z local) */
  yaw: number;
  /** velocidade no chão (m/s) — anima os passos */
  speed: number;
  /** golpe 0..1 (machado/pá); < 0 = sem golpe */
  act: number;
  hurt?: boolean;
  happy?: boolean;
  /** desmaiado/dormindo: achata e fecha os olhos */
  faint?: boolean;
}

const _cam = new THREE.Vector3();
const _pos = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);
const VIEW_RAD = VIEW_DEG.map((d) => (d * Math.PI) / 180);

export class PaperChar {
  /** posicione no chão (pés); NÃO gire — a direção vem de PaperState.yaw */
  readonly root = new THREE.Group();
  /** quad do corpo (filhos: rótulos etc. podem ir em root) */
  readonly body: THREE.Mesh;
  private pivot = new THREE.Group();
  private geo: THREE.PlaneGeometry;
  private uv: THREE.BufferAttribute;
  private atlas: PaperAtlas & AtlasGL;
  private tool: THREE.Mesh | null = null;
  private toolK = '';
  private hand: string;
  private shadow: THREE.Mesh | null = null;
  private walk = 0;
  private blinkT = 2 + Math.random() * 2;
  private view = 0;
  private frame = -1;
  private flip = false;
  private r: number;
  private size: number;
  private tilt: number;
  private flat = 1;
  /** vista e quadro atuais (para testes/depuração) */
  info = { view: 0, frame: 0, flip: false, rel: 0 };

  constructor(spec: PaperSpec, o: PaperOpts = {}) {
    this.r = o.radius ?? 0.5;
    this.tilt = o.tilt ?? 0.45;
    const C = o.cell ?? 96;
    this.atlas = atlasFor(spec, C);
    this.atlas.refs++;
    this.hand = paperBodyColor(spec);
    // célula inteira em unidades do mundo; origem do quad = linha dos pés
    this.size = this.r / R_K;
    const g = new THREE.PlaneGeometry(this.size, this.size);
    g.translate(0, this.size * (FEET_K - 0.5), 0);
    // normais inclinadas para cima: o sol e o céu iluminam como num boneco, não como uma parede
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.8, 0.6);
    this.geo = g;
    this.uv = g.getAttribute('uv') as THREE.BufferAttribute;
    this.body = new THREE.Mesh(g, this.atlas.mat);
    this.body.frustumCulled = true;
    this.pivot.add(this.body);
    this.pivot.rotation.order = 'YXZ';
    this.root.add(this.pivot);
    if (o.shadow) {
      this.shadow = new THREE.Mesh(SHADOW_GEO, softShadowMat());
      this.shadow.rotation.x = -Math.PI / 2;
      this.shadow.position.y = 0.02;
      this.shadow.scale.set(this.r * 2.1, this.r * 1.5, 1);
      this.shadow.renderOrder = -1;
      this.root.add(this.shadow);
    }
    this.setFrame(0, FR.idle, false);
  }

  /** troca o Bloop (ex.: o jogador editou o avatar) */
  setSpec(spec: PaperSpec): void {
    const C = this.atlas.C;
    const a = atlasFor(spec, C);
    if (a === this.atlas) return;
    this.atlas.refs--;
    this.atlas = a;
    a.refs++;
    this.body.material = a.mat;
    this.hand = paperBodyColor(spec);
    const k = this.toolK;
    this.toolK = '';
    if (k) {
      const [kind, col] = k.split('|');
      this.setTool(kind as PaperTool, col);
    }
  }

  /** ferramenta na mão (null = mãos livres) */
  setTool(kind: PaperTool | null, col = '#c8d0e0'): void {
    const k = kind ? kind + '|' + col : '';
    if (k === this.toolK) return;
    this.toolK = k;
    if (!kind) {
      if (this.tool) this.tool.visible = false;
      return;
    }
    if (!this.tool) {
      this.tool = new THREE.Mesh(TOOL_GEO, toolMat(kind, col, this.hand));
      this.tool.scale.setScalar(this.r * 1.9);
      this.pivot.add(this.tool);
    } else this.tool.material = toolMat(kind, col, this.hand);
    this.tool.visible = true;
  }

  private setFrame(view: number, frame: number, flip: boolean): void {
    if (view === this.view && frame === this.frame && flip === this.flip) return;
    this.view = view;
    this.frame = frame;
    this.flip = flip;
    const a = this.atlas;
    const pad = 0.5;
    let u0 = (frame * a.C + pad) / a.W;
    let u1 = ((frame + 1) * a.C - pad) / a.W;
    if (flip) [u0, u1] = [u1, u0];
    // linha 0 do atlas = topo do canvas (flipY padrão da textura)
    const v1 = 1 - (view * a.C + pad) / a.H;
    const v0 = 1 - ((view + 1) * a.C - pad) / a.H;
    // PlaneGeometry: (0,1) (1,1) (0,0) (1,0)
    const uv = this.uv;
    uv.setXY(0, u0, v1);
    uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0);
    uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    this.info.view = view;
    this.info.frame = frame;
    this.info.flip = flip;
  }

  /** chame 1× por frame depois de posicionar `root` */
  update(dt: number, cam: THREE.Camera, st: PaperState): void {
    const root = this.root;
    // o jogo pode ter girado root (código antigo do rig 3D): o billboard ignora
    root.updateMatrixWorld();
    _pos.setFromMatrixPosition(root.matrixWorld);
    root.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    const parentYaw = _e.y;
    cam.getWorldPosition(_cam);
    const dx = _cam.x - _pos.x;
    const dz = _cam.z - _pos.z;
    const camA = Math.atan2(dx, dz);
    const hd = Math.hypot(dx, dz);
    const pitch = Math.atan2(_cam.y - _pos.y - this.r, Math.max(0.1, hd));
    this.pivot.rotation.set(-Math.min(this.tilt, Math.max(0, pitch) * 0.6), camA - parentYaw, 0);
    // vista: ângulo da câmera medido a partir da frente do Bloop
    const rel = wrap(camA - st.yaw);
    const ar = Math.abs(rel);
    let v = 0;
    let best = 9;
    for (let i = 0; i < VIEWS; i++) {
      // histerese: a vista atual "segura" 6° a mais
      const d = Math.abs(ar - VIEW_RAD[i]) - (i === this.view ? 0.1 : 0);
      if (d < best) {
        best = d;
        v = i;
      }
    }
    const flip = rel < 0 && v !== 0 && v !== VIEWS - 1;
    // quadro
    let f: number = FR.idle;
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 2.5;
    if (st.faint || st.hurt) f = FR.hurt;
    else if (st.act >= 0) f = st.act < 0.45 ? FR.act : FR.act + 1;
    else if (st.speed > 0.4) {
      this.walk += dt * Math.min(st.speed, 7) * 1.9;
      f = FR.walk + (Math.floor(this.walk) & 3);
    } else if (st.happy) f = FR.happy;
    else if (this.blinkT < 0) f = FR.blink;
    this.setFrame(v, Math.min(FRAMES - 1, f), flip);
    this.info.rel = rel;
    // desmaio: achata (o quad, a partir dos pés)
    const tf = st.faint ? 0.55 : 1;
    this.flat += (tf - this.flat) * Math.min(1, dt * 10);
    this.body.scale.set(2 - this.flat, this.flat, 1);
    // ferramenta: mão no lado do corpo, projetada na vista atual
    const t = this.tool;
    if (t && t.visible) {
      const cp = Math.cos(rel);
      const sp = Math.sin(rel);
      const hx = -0.98;
      const hz = 0.25;
      const sx = hx * cp - hz * sp;
      const depth = hz * cp + hx * sp;
      const r = this.r;
      // golpe: ergue para trás e desce para a frente (a frente na tela depende da vista)
      const fwd = -Math.sign(sp || 1);
      let ang = 0.35;
      if (st.act >= 0) ang = st.act < 0.45 ? 0.35 + (st.act / 0.45) * 1.6 : 1.95 - ((st.act - 0.45) / 0.55) * 3.2;
      t.rotation.set(0, 0, ang * fwd * (Math.abs(sp) > 0.3 ? 1 : 0.6));
      t.position.set(sx * r, r * (0.78 + (st.faint ? -0.35 : 0)), depth >= 0 ? r * 0.12 : -r * 0.12);
    }
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.geo.dispose();
    this.atlas.refs--;
  }
}

/** quad da ferramenta: pivô na pegada */
const TOOL_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.5, 1);
  g.translate(0.5 * (0.5 - TOOL_GRIP[0]), 1 * (TOOL_GRIP[1] - 0.5), 0);
  const n = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 0.8, 0.6);
  return g;
})();
const SHADOW_GEO = new THREE.PlaneGeometry(1, 1);
