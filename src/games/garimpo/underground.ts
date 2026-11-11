/* ============================================================
 *  GARIMPO BRUTO — mina subterrânea (fim de jogo, cara).
 *  Escolha: o terreno de superfície é um campo de alturas (não faz túnel), então a mina
 *  é um NÍVEL À PARTE: grade de células de rocha (3 m), entrada pelo portal na encosta.
 *  Vista em 3ª pessoa DENTRO dos túneis: paredes de rocha com textura de pedra e AO
 *  (1 InstancedMesh com relevo), teto, escoras de madeira nos corredores, poças de luz
 *  das lâmpadas, veios de ouro brilhando na rocha. A rocha entre a câmera e o jogador
 *  some em pontilhado (nunca tapa a vista); a câmera não atravessa a rocha (braço-mola).
 *  - Picareta abre células (veios de ouro mais ricos mais fundo).
 *  - Trilhos (grade, toque para pôr), vagonetas que levam a carga até a moega da entrada.
 *  - Gerador + cabos acendem lâmpadas; mineiros-robô só trabalham com luz.
 *  - Moega + esteira sobem o minério para a baia na superfície (caminhão parado embaixo).
 * ============================================================ */
import * as THREE from 'three';
import { natureTexture } from '../../3d/nature';
import { buildWorker, BW, C, type WorkerParts } from './models';
// PAPER: o mineiro é o Bloop 2D do jogador (como na superfície)
import { mySpec, npcSpec, PaperChar, paperOn, type PaperSpec } from '../../3d/paper';
import { paperBodyColor } from '../../3d/paper/paperAvatar';
import { Kit } from './kit';
import type { Ctl } from './machines';
import { rng } from './gen';
// FPKIT: andar compartilhado (aceleração da Cozinha; colisão em grade com as células abertas)
import { FpController, fpTuning, GridCollider } from '../../3d/fpkit';

export const UG = 24;
export const CS = 3;
/** altura do túnel (teto) */
export const WALL_H = 3.2;
/** célula: 0 rocha, 1 aberta */
export interface UgSave {
  cells: string;
  rails: string;
  lamps: number[];
  gen: number;
  carts: number;
  bots: number;
}
export type Tool = 'none' | 'rail' | 'lamp' | 'gen';
export const UG_PRICE = { mine: 12000, rail: 40, lamp: 150, gen: 4000, cart: 1800, bot: 3000 };

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

interface Cart {
  mesh: THREE.Group;
  load: number;
  gold: number;
  path: number[];
  pi: number;
  st: 'load' | 'go' | 'back';
  t: number;
  x: number;
  z: number;
}
interface Bot {
  p: WorkerParts;
  paper: PaperChar | null;
  cell: number;
  t: number;
  /** caminho (células abertas) até a vaga de trabalho */
  path: number[];
  pi: number;
}

/** material que some em pontilhado perto do segmento câmera→jogador (rocha não tapa a vista) */
function fadeMat<M extends THREE.Material>(m: M, u: { uCam: { value: THREE.Vector3 }; uTgt: { value: THREE.Vector3 } }): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCam = u.uCam;
    sh.uniforms.uTgt = u.uTgt;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFadeWp;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 fwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        fwp = instanceMatrix * fwp;
        #endif
        vFadeWp = (modelMatrix * fwp).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uCam;\nuniform vec3 uTgt;\nvarying vec3 vFadeWp;').replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      {
        vec3 ab = uTgt - uCam;
        float tt = clamp(dot(vFadeWp - uCam, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
        float dd = length(vFadeWp - (uCam + ab * tt));
        float fd = (1.0 - smoothstep(0.45, 0.85, dd)) * smoothstep(0.02, 0.1, tt) * (1.0 - smoothstep(0.82, 0.95, tt));
        // pontilhado ordenado (Bayer 4x4): some limpo, sem chiado
        vec2 bq = mod(floor(gl_FragCoord.xy), 4.0);
        float by = mod(bq.x + bq.y * 4.0 + floor(bq.x / 2.0) * 5.0 + floor(bq.y / 2.0) * 7.0, 16.0) / 16.0;
        if (fd > 0.0 && by < fd * 0.92) discard;
      }`,
    );
  };
  m.customProgramCacheKey = () => 'gb-ug-fade';
  return m;
}

/** bloco de rocha com relevo nas faces (bordas fixas: blocos vizinhos fecham sem fresta), UV em metros e AO no pé e no teto */
function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(CS, WALL_H, CS, 8, 6, 8);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  const col = new Float32Array(pos.count * 3);
  const h2 = WALL_H / 2;
  const c2 = CS / 2;
  const n3 = (x: number, y: number, z: number) => Math.sin(x * 2.1 + Math.sin(z * 1.7)) * Math.cos(y * 2.6 + x * 0.6) + 0.5 * Math.sin(z * 3.3 + y * 1.9) * Math.sin(x * 3.7);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i);
    const y = pos.getY(i);
    let z = pos.getZ(i);
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    if (Math.abs(ny) < 0.5) {
      // face lateral: relevo para fora/dentro, zero nas bordas da face
      const along = Math.abs(nx) > 0.5 ? z : x;
      const e = Math.min(1, (c2 - Math.abs(along)) / 0.7) * Math.min(1, (h2 - Math.abs(y)) / 0.6);
      const d = n3(x + z, y, along) * 0.2 * e;
      x += nx * d;
      z += nz * d;
      pos.setXYZ(i, x, y, z);
      uv.setXY(i, (along + c2) / 1.6, (y + h2) / 1.6);
    } else uv.setXY(i, (x + c2) / 1.6, (z + c2) / 1.6);
    // AO: escurece perto do chão e do teto
    const yy = y + h2;
    const k = Math.min(1, 0.45 + yy * 0.55) * Math.min(1, 0.55 + (WALL_H - yy) * 0.6);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Underground {
  readonly scene = new THREE.Scene();
  readonly cells = new Uint8Array(UG * UG);
  readonly rail = new Uint8Array(UG * UG);
  /** teor (g/m³) de cada célula */
  readonly grade = new Float32Array(UG * UG);
  /** golpes já dados em cada célula */
  private hits = new Uint8Array(UG * UG);
  lamps: number[] = [];
  gen = -1;
  carts: Cart[] = [];
  bots: Bot[] = [];
  readonly entrance = (UG >> 1) + 0 * UG;
  private walls: THREE.InstancedMesh;
  private floor: THREE.Mesh;
  private ceil: THREE.Mesh;
  private beams: THREE.InstancedMesh;
  private nuggets: THREE.InstancedMesh;
  private pools: THREE.InstancedMesh;
  private lampLights: THREE.PointLight[] = [];
  /** câmera e alvo (para a rocha entre os dois sumir) */
  readonly fadeU = { uCam: { value: new THREE.Vector3() }, uTgt: { value: new THREE.Vector3() } };
  private time = 0;
  private railMesh: THREE.InstancedMesh;
  private lampMesh: THREE.InstancedMesh;
  private genMesh: THREE.Group;
  private cables: THREE.LineSegments;
  private ghost: THREE.Mesh;
  private amb: THREE.HemisphereLight;
  private plight: THREE.PointLight;
  readonly worker: WorkerParts;
  /** PAPER: Bloop 2D do jogador (null = boneco 3D) */
  private paper: PaperChar | null = null;
  /** câmera (vira os personagens de papel) */
  cam: THREE.Camera | null = null;
  /** 1ª pessoa (esconde o Bloop) e controle "tanque" (x gira, y anda) */
  fp = false;
  tank = false;
  readonly pos = new THREE.Vector3();
  yaw = 0;
  /** FPKIT: corpo do mineiro (piso plano; rocha = células fechadas) */
  readonly body = new FpController(fpTuning('survival', { speed: 3.2, jumpV: 0, gravity: 0, radius: 0.5 }), new GridCollider(1, (x, z) => this.open(this.cellAt(x, z))));
  private walk = 0;
  private swing = -1;
  cargo = { vol: 0, gold: 0, cap: 0.2 };
  /** andando agora (a câmera volta para trás) */
  moving = false;
  /** recebido pela moega (sobe para a baia da superfície) */
  onHopper: ((vol: number, gold: number) => void) | null = null;
  tool: Tool = 'none';
  ghostCell = -1;

  constructor(seed: number) {
    const r = rng(seed * 31 + 7);
    // veios: 3 faixas diagonais + bolsões, mais ricos ao fundo (z alto)
    const veins = [0, 1, 2].map(() => ({ a: r() * Math.PI, o: r() * UG, w: 1.2 + r() * 1.5, g: 60 + r() * 90 }));
    for (let j = 0; j < UG; j++)
      for (let i = 0; i < UG; i++) {
        let g = 4 + (j / UG) * 18;
        for (const v of veins) {
          const d = Math.abs(i * Math.cos(v.a) + j * Math.sin(v.a) - v.o);
          if (d < v.w) g += v.g * (1 - d / v.w) * (0.4 + (j / UG) * 0.9);
        }
        this.grade[j * UG + i] = g * (0.7 + r() * 0.6);
      }
    // entrada + corredor inicial
    for (let j = 0; j < 4; j++) this.cells[j * UG + (UG >> 1)] = 1;
    this.cells[1 * UG + (UG >> 1) - 1] = 1;
    this.cells[1 * UG + (UG >> 1) + 1] = 1;
    const stone = natureTexture('stone');
    const gravel = natureTexture('gravel');
    this.walls = new THREE.InstancedMesh(rockGeometry(), fadeMat(new THREE.MeshLambertMaterial({ map: stone, vertexColors: true }), this.fadeU), UG * UG);
    this.walls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(UG * UG * 3), 3);
    this.walls.frustumCulled = false;
    this.scene.add(this.walls);
    // piso com AO (escuro junto da rocha), refeito no rebuild
    const FS = UG * 4;
    const fg = new THREE.PlaneGeometry(UG * CS, UG * CS, FS, FS).rotateX(-Math.PI / 2);
    const uv = fg.attributes.uv.array as Float32Array;
    for (let i = 0; i < uv.length; i++) uv[i] *= UG * 1.4;
    fg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(fg.attributes.position.count * 3).fill(1), 3));
    this.floor = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ map: gravel, color: 0xb8a088, vertexColors: true }));
    this.floor.position.set((UG * CS) / 2 - CS / 2, 0, (UG * CS) / 2 - CS / 2);
    this.scene.add(this.floor);
    // teto (rocha escura, virado para baixo)
    const cg = new THREE.PlaneGeometry(UG * CS, UG * CS).rotateX(Math.PI / 2);
    const cuv = cg.attributes.uv.array as Float32Array;
    for (let i = 0; i < cuv.length; i++) cuv[i] *= UG * 1.8;
    this.ceil = new THREE.Mesh(cg, new THREE.MeshLambertMaterial({ map: stone, color: 0x6a5c50 }));
    this.ceil.position.set((UG * CS) / 2 - CS / 2, WALL_H, (UG * CS) / 2 - CS / 2);
    this.scene.add(this.ceil);
    // escoras de madeira (pórtico: 2 esteios + chapéu) nos trechos retos de corredor
    const bk = new Kit({ y: 0.4, k: 0.35 });
    for (const sx of [1, -1]) bk.rbox(0.26, WALL_H - 0.05, 0.26, 0.04, C.wood, sx * 1.28, (WALL_H - 0.05) / 2, 0);
    bk.rbox(3.0, 0.3, 0.32, 0.05, C.woodL, 0, WALL_H - 0.2, 0);
    for (const sx of [1, -1]) bk.box(0.5, 0.12, 0.2, C.wood, sx * 1.0, WALL_H - 0.42, 0, 0, 0, sx * 0.7);
    this.beams = new THREE.InstancedMesh(bk.geometry(), fadeMat(new THREE.MeshLambertMaterial({ vertexColors: true }), this.fadeU), UG * UG);
    this.beams.count = 0;
    this.beams.frustumCulled = false;
    this.scene.add(this.beams);
    // pepitas brilhando nas faces de rocha rica
    this.nuggets = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.085, 0), new THREE.MeshLambertMaterial({ color: 0xffd347, emissive: 0x9a6a08, flatShading: true }), 900);
    this.nuggets.count = 0;
    this.nuggets.frustumCulled = false;
    this.scene.add(this.nuggets);
    // poças de luz no chão embaixo das lâmpadas
    const pc = document.createElement('canvas');
    pc.width = pc.height = 64;
    const px = pc.getContext('2d')!;
    const gr = px.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,214,140,0.85)');
    gr.addColorStop(0.45, 'rgba(255,190,110,0.32)');
    gr.addColorStop(1, 'rgba(255,170,90,0)');
    px.fillStyle = gr;
    px.fillRect(0, 0, 64, 64);
    const ptex = new THREE.CanvasTexture(pc);
    ptex.colorSpace = THREE.SRGBColorSpace;
    this.pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ptex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), 64);
    this.pools.count = 0;
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 2;
    this.scene.add(this.pools);
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 11, 1.7);
      this.lampLights.push(l);
      this.scene.add(l);
    }
    // trilho: dormentes + 2 barras (uma peça por célula; reto ao longo de z ou x pelo vizinho)
    const rk = new Kit();
    for (let i = 0; i < 4; i++) rk.box(1.3, 0.1, 0.22, C.wood, 0, 0.05, -1.1 + i * 0.75);
    rk.use('shiny').box(0.08, 0.1, CS, C.steel, 0.42, 0.14, 0).box(0.08, 0.1, CS, C.steel, -0.42, 0.14, 0);
    this.railMesh = new THREE.InstancedMesh(rk.geometry(), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 60 }), UG * UG);
    this.railMesh.count = 0;
    this.railMesh.frustumCulled = false;
    this.scene.add(this.railMesh);
    const lk = new Kit();
    lk.box(0.12, 2.0, 0.12, C.wood, 0, 1.0, 0);
    lk.box(0.7, 0.1, 0.12, C.wood, 0.3, 1.95, 0);
    lk.use('glow').ball(0.18, C.light, 0.6, 1.75, 0);
    this.lampMesh = new THREE.InstancedMesh(lk.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), 64);
    this.lampMesh.count = 0;
    this.lampMesh.frustumCulled = false;
    this.scene.add(this.lampMesh);
    const gk = new Kit({ y: 0.3, k: 0.4 });
    gk.rbox(1.6, 1.0, 1.0, 0.08, C.yellow, 0, 0.6, 0);
    gk.rbox(1.62, 0.12, 1.02, 0.04, C.dark, 0, 1.12, 0);
    gk.cyl(0.25, 0.25, 0.5, C.dark, 0.5, 0.9, 0.55, 10, Math.PI / 2);
    gk.use('shiny').cyl(0.05, 0.05, 0.6, C.chrome, -0.6, 1.4, -0.3);
    gk.decal('warn', 0.4, 0.4, 0, 0.7, 0.51);
    gk.decal('logo', 0.9, 0.45, 0.81, 0.65, 0, Math.PI / 2);
    this.genMesh = gk.build();
    this.genMesh.visible = false;
    this.scene.add(this.genMesh);
    this.cables = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111111 }));
    this.cables.frustumCulled = false;
    this.scene.add(this.cables);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(CS * 0.96, 0.2, CS * 0.96), new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.45, depthWrite: false }));
    this.ghost.visible = false;
    this.scene.add(this.ghost);
    // moega da entrada + esteira subindo
    const hk = new Kit({ y: 0.4, k: 0.5 });
    hk.rbox(2.4, 0.2, 2.4, 0.05, C.steelD, 0, 1.0, 0);
    for (const [x, z] of [[1.1, 1.1], [-1.1, 1.1], [1.1, -1.1], [-1.1, -1.1]]) hk.box(0.15, 1.0, 0.15, C.steelD, x, 0.5, z);
    hk.rbox(2.4, 0.9, 0.12, 0.03, C.yellowD, 0, 1.5, 1.15).rbox(2.4, 0.9, 0.12, 0.03, C.yellowD, 0, 1.5, -1.15).rbox(0.12, 0.9, 2.4, 0.03, C.yellowD, 1.15, 1.5, 0).rbox(0.12, 0.9, 2.4, 0.03, C.yellowD, -1.15, 1.5, 0);
    hk.decal('hazard', 2.3, 0.25, 0, 1.5, 1.22);
    hk.rbox(1.0, 0.15, 7, 0.04, C.black, 0, 3.4, -4.2, -0.5);
    for (let i = 0; i < 3; i++) hk.box(0.14, 2 + i * 1.2, 0.14, C.yellowD, 0, 1 + i * 0.6, -1.8 - i * 1.8);
    const hop = hk.build();
    hop.position.set(this.cx(this.entrance), 0, this.cz(this.entrance));
    this.scene.add(hop);
    // luz: escura sem gerador
    this.amb = new THREE.HemisphereLight(0xc8d0ff, 0x3a2a1a, 0.6);
    this.plight = new THREE.PointLight(0xffe2a8, 30, 14, 1.6);
    this.scene.add(this.amb, this.plight);
    this.scene.background = new THREE.Color(0x0d0907);
    this.scene.fog = new THREE.Fog(0x0d0907, 18, 46);
    this.worker = buildWorker(0x6a6a6a);
    this.paper = paperize(this.worker, mySpec(), 128);
    // carrinho na frente, pegadores nas mãos (chão da mina é plano)
    const bw = this.worker.barrow;
    bw.position.set(0, 0, 0.42 - BW.grip.z);
    bw.rotation.x = Math.atan2(0.62 - BW.wheelR, -BW.grip.z) - Math.atan2(BW.grip.y - BW.wheelR, -BW.grip.z);
    const hm = new THREE.MeshLambertMaterial({ color: this.paper ? paperBodyColor(mySpec()) : '#e0a77a' });
    for (const sx of [1, -1]) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hm);
      h.position.set(sx * BW.gripX, BW.grip.y + 0.035, BW.grip.z + 0.03);
      bw.add(h);
    }
    this.worker.root.add(bw);
    this.scene.add(this.worker.root);
    this.rebuild();
  }

  cx(k: number): number {
    return (k % UG) * CS;
  }
  cz(k: number): number {
    return Math.floor(k / UG) * CS;
  }
  cellAt(x: number, z: number): number {
    const i = Math.round(x / CS);
    const j = Math.round(z / CS);
    if (i < 0 || j < 0 || i >= UG || j >= UG) return -1;
    return j * UG + i;
  }
  open(k: number): boolean {
    return k >= 0 && this.cells[k] === 1;
  }
  get powered(): boolean {
    return this.gen >= 0;
  }

  /** refaz paredes, trilhos, lâmpadas e cabos */
  rebuild(): void {
    let n = 0;
    for (let k = 0; k < UG * UG; k++) {
      if (this.cells[k]) continue;
      const i = k % UG;
      const j = (k / UG) | 0;
      void i;
      void j;
      // giro de 90° por célula: o relevo não se repete igual em toda parede
      _q.setFromAxisAngle(_v.set(0, 1, 0), ((k * 7 + (k >> 3)) % 4) * (Math.PI / 2));
      _m.compose(_v.set(this.cx(k), WALL_H / 2, this.cz(k)), _q, _s.set(1, 1, 1));
      this.walls.setMatrixAt(n, _m);
      // veio rico: rocha puxando para o dourado; variação leve célula a célula
      const g = this.grade[k];
      const f = Math.min(1, Math.max(0, (g - 25) / 90));
      const vr = 0.9 + ((k * 2654435761) % 1000) / 1000 * 0.2;
      _c.setRGB((0.5 + f * 0.5) * vr, (0.42 + f * 0.34) * vr, (0.36 - f * 0.12) * vr);
      this.walls.setColorAt(n, _c);
      n++;
    }
    this.walls.count = n;
    this.walls.instanceMatrix.needsUpdate = true;
    this.walls.instanceColor!.needsUpdate = true;
    this.rebuildCave();
    let r = 0;
    for (let k = 0; k < UG * UG; k++) {
      if (!this.rail[k]) continue;
      const horiz = (this.rail[k - 1] || this.rail[k + 1]) && !(this.rail[k - UG] || this.rail[k + UG]);
      _q.setFromAxisAngle(_v.set(0, 1, 0), horiz ? Math.PI / 2 : 0);
      _m.compose(_v.set(this.cx(k), 0, this.cz(k)), _q, _s.set(1, 1, 1));
      this.railMesh.setMatrixAt(r++, _m);
    }
    this.railMesh.count = r;
    this.railMesh.instanceMatrix.needsUpdate = true;
    this.lamps.forEach((k, i) => {
      _m.makeTranslation(this.cx(k) - CS * 0.4, 0, this.cz(k) - CS * 0.4);
      this.lampMesh.setMatrixAt(i, _m);
    });
    this.lampMesh.count = this.lamps.length;
    this.lampMesh.instanceMatrix.needsUpdate = true;
    this.lampMesh.visible = true;
    (this.lampMesh.material as THREE.MeshBasicMaterial).color.setScalar(this.powered ? 1 : 0.25);
    this.genMesh.visible = this.gen >= 0;
    if (this.gen >= 0) this.genMesh.position.set(this.cx(this.gen), 0, this.cz(this.gen));
    // cabos: do gerador até cada lâmpada, presos no teto e seguindo os túneis (nunca atravessam a rocha)
    const pts: number[] = [];
    if (this.gen >= 0) {
      const cy = WALL_H - 0.1;
      const seg = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => pts.push(x0, y0, z0, x1, y1, z1);
      const gx = this.cx(this.gen) - 0.6;
      const gz = this.cz(this.gen) - 0.3;
      seg(gx, 1.35, gz, gx, cy, gz);
      for (const k of this.lamps) {
        const path = this.openPath(this.gen, k);
        if (!path) continue;
        let px = gx;
        let pz = gz;
        for (let q = 1; q < path.length; q++) {
          const x = this.cx(path[q]) - 0.6;
          const z = this.cz(path[q]) - 0.3;
          seg(px, cy, pz, x, cy, z);
          px = x;
          pz = z;
        }
        const lx = this.cx(k) - CS * 0.4 + 0.6;
        const lz = this.cz(k) - CS * 0.4;
        seg(px, cy, pz, lx, cy, lz);
        seg(lx, cy, lz, lx, 1.95, lz);
      }
    }
    this.cables.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.amb.intensity = this.powered ? 1.1 + Math.min(0.8, this.lamps.length / 8) : 0.55;
    // poças de luz (só com gerador)
    this.lamps.forEach((k, i) => {
      _m.makeTranslation(this.cx(k) - CS * 0.15, 0.03, this.cz(k) - CS * 0.15);
      this.pools.setMatrixAt(i, _m);
    });
    this.pools.count = this.powered ? this.lamps.length : 0;
    this.pools.instanceMatrix.needsUpdate = true;
  }

  /** escoras, pepitas e AO do piso (depende só das células abertas) */
  private rebuildCave(): void {
    const rock = (i: number, j: number) => i < 0 || j < 0 || i >= UG || j >= UG || !this.cells[j * UG + i];
    // escoras: corredor reto (aberto à frente/atrás, rocha dos dois lados), uma sim outra não
    let b = 0;
    for (let k = 0; k < UG * UG; k++) {
      if (!this.cells[k]) continue;
      const i = k % UG;
      const j = (k / UG) | 0;
      const alongZ = rock(i - 1, j) && rock(i + 1, j);
      const alongX = rock(i, j - 1) && rock(i, j + 1);
      if (!alongZ && !alongX) continue;
      if ((alongZ ? j : i) % 2) continue;
      _q.setFromAxisAngle(_v.set(0, 1, 0), alongZ ? 0 : Math.PI / 2);
      _m.compose(_v.set(this.cx(k), 0, this.cz(k)), _q, _s.set(1, 1, 1));
      this.beams.setMatrixAt(b++, _m);
    }
    this.beams.count = b;
    this.beams.instanceMatrix.needsUpdate = true;
    // pepitas: nas faces de rocha rica voltadas para um espaço aberto
    let n = 0;
    const r = rng(77);
    for (let k = 0; k < UG * UG && n < 900; k++) {
      if (this.cells[k] || this.grade[k] < 40) continue;
      const i = k % UG;
      const j = (k / UG) | 0;
      const many = Math.min(6, Math.floor((this.grade[k] - 30) / 16));
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (rock(i + di, j + dj)) continue;
        for (let q = 0; q < many && n < 900; q++) {
          const a = (r() - 0.5) * CS * 0.8;
          const y = 0.4 + r() * (WALL_H - 0.9);
          const x = this.cx(k) + di * (CS / 2 + 0.02) + (dj ? a : 0);
          const z = this.cz(k) + dj * (CS / 2 + 0.02) + (di ? a : 0);
          _q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3));
          const sc = 0.6 + r() * 0.9;
          _m.compose(_v.set(x, y, z), _q, _s.set(sc, sc * 0.8, sc));
          this.nuggets.setMatrixAt(n++, _m);
        }
      }
    }
    this.nuggets.count = n;
    this.nuggets.instanceMatrix.needsUpdate = true;
    // AO do piso: escurece perto da rocha (cantos mais ainda)
    const fg = this.floor.geometry;
    const fp = fg.attributes.position;
    const fc = fg.attributes.color as THREE.BufferAttribute;
    const ox = this.floor.position.x;
    const oz = this.floor.position.z;
    for (let v = 0; v < fp.count; v++) {
      const x = fp.getX(v) + ox;
      const z = fp.getZ(v) + oz;
      let near = 9;
      const ci = Math.round(x / CS);
      const cj = Math.round(z / CS);
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = ci + di;
          const jj = cj + dj;
          if (!rock(ii, jj)) continue;
          // distância até a caixa da célula de rocha
          const dx = Math.max(0, Math.abs(x - ii * CS) - CS / 2);
          const dz = Math.max(0, Math.abs(z - jj * CS) - CS / 2);
          near = Math.min(near, Math.hypot(dx, dz));
        }
      const k = 0.42 + 0.58 * Math.min(1, near / 1.3);
      fc.setXYZ(v, k, k, k * 0.96);
    }
    fc.needsUpdate = true;
  }

  /** câmera e jogador (a rocha entre os dois some) */
  setView(cam: THREE.Vector3, tgt: THREE.Vector3): void {
    this.fadeU.uCam.value.copy(cam);
    this.fadeU.uTgt.value.copy(tgt);
    // mineiros-robô e vagonetas entre a câmera e o jogador somem (não tapam a vista)
    const ax = tgt.x - cam.x;
    const az = tgt.z - cam.z;
    const L2 = ax * ax + az * az || 1;
    const block = (o: THREE.Object3D) => {
      const t = ((o.position.x - cam.x) * ax + (o.position.z - cam.z) * az) / L2;
      if (t <= 0 || t >= 0.85) return false;
      return Math.hypot(cam.x + ax * t - o.position.x, cam.z + az * t - o.position.z) < 1.1;
    };
    for (const b of this.bots) b.p.root.visible = !block(b.p.root);
    for (const c of this.carts) c.mesh.visible = !block(c.mesh);
  }
  /** a câmera não entra na rocha: encurta o braço até o último ponto livre */
  armClamp(fx: number, fz: number, tx: number, tz: number): number {
    const L = Math.hypot(tx - fx, tz - fz);
    const n = Math.max(1, Math.ceil(L / 0.15));
    const pad = 0.45;
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const x = fx + (tx - fx) * t;
      const z = fz + (tz - fz) * t;
      const ok = this.open(this.cellAt(x + pad, z)) && this.open(this.cellAt(x - pad, z)) && this.open(this.cellAt(x, z + pad)) && this.open(this.cellAt(x, z - pad));
      if (!ok) return Math.max(0, (s - 1) / n);
    }
    return 1;
  }

  /** caminho em trilho (BFS) da célula a até a entrada */
  railPath(a: number): number[] | null {
    const prev = new Int32Array(UG * UG).fill(-2);
    const q = [a];
    prev[a] = -1;
    while (q.length) {
      const k = q.shift()!;
      if (k === this.entrance || (Math.abs(k - this.entrance) === UG && this.rail[k])) {
        const out: number[] = [];
        for (let c = k; c !== -1; c = prev[c]) out.unshift(c);
        return out;
      }
      for (const d of [1, -1, UG, -UG]) {
        const n = k + d;
        if (n < 0 || n >= UG * UG || prev[n] !== -2) continue;
        if (Math.abs(d) === 1 && Math.floor(n / UG) !== Math.floor(k / UG)) continue;
        if (!this.rail[n] && n !== this.entrance) continue;
        prev[n] = k;
        q.push(n);
      }
    }
    return null;
  }

  /** ponta do trilho mais longe da entrada (onde a vagoneta carrega) */
  railEnd(): number {
    let best = -1;
    let bd = -1;
    for (let k = 0; k < UG * UG; k++) {
      if (!this.rail[k]) continue;
      const p = this.railPath(k);
      if (p && p.length > bd) {
        bd = p.length;
        best = k;
      }
    }
    return best;
  }

  /** coloca a ferramenta numa célula (true = colocou) */
  place(k: number): boolean {
    if (!this.open(k) || k === this.entrance) return false;
    if (this.tool === 'rail') {
      if (this.rail[k]) return false;
      this.rail[k] = 1;
    } else if (this.tool === 'lamp') {
      if (this.lamps.includes(k) || this.lamps.length >= 64) return false;
      this.lamps.push(k);
    } else if (this.tool === 'gen') {
      if (this.gen >= 0) return false;
      this.gen = k;
    } else return false;
    this.rebuild();
    return true;
  }
  canPlace(k: number): boolean {
    if (!this.open(k) || k === this.entrance) return false;
    if (this.tool === 'rail') return !this.rail[k];
    if (this.tool === 'lamp') return !this.lamps.includes(k);
    if (this.tool === 'gen') return this.gen < 0;
    return false;
  }
  showGhost(k: number): void {
    this.ghostCell = k;
    this.ghost.visible = k >= 0 && this.tool !== 'none';
    if (!this.ghost.visible) return;
    this.ghost.position.set(this.cx(k), 0.12, this.cz(k));
    (this.ghost.material as THREE.MeshBasicMaterial).color.setHex(this.canPlace(k) ? 0x44ff66 : 0xff4433);
  }

  addCart(): void {
    const k = new Kit({ y: 0.2, k: 0.6 });
    k.rbox(1.2, 0.7, 1.6, 0.08, C.steelD, 0, 0.75, 0);
    k.rbox(1.05, 0.08, 1.45, 0.03, C.dark, 0, 1.06, 0);
    for (const [x, z] of [[0.45, 0.55], [-0.45, 0.55], [0.45, -0.55], [-0.45, -0.55]]) k.cylX(0.18, 0.1, C.dark, x, 0.28, z, 10);
    k.decal('num2', 0.4, 0.4, 0, 0.75, 0.81);
    const g = k.build();
    const heap = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 6), new THREE.MeshLambertMaterial({ color: 0x7a5a3a }));
    heap.scale.set(0.9, 0.35, 1.2);
    heap.position.y = 1.05;
    heap.name = 'heap';
    heap.visible = false;
    g.add(heap);
    this.scene.add(g);
    this.carts.push({ mesh: g, load: 0, gold: 0, path: [], pi: 0, st: 'load', t: 0, x: this.cx(this.entrance), z: this.cz(this.entrance) });
  }
  addBot(): void {
    const p = buildWorker(0x3f7a3f);
    p.shovel.visible = true;
    const paper = paperize(p, npcSpec('#3f7a3f', '#ffd34a', { head: 'h_cap', eyes: 'e_big' }), 80);
    paper?.setTool('pick', '#9aa4b4');
    p.root.position.set(this.cx(this.entrance) + 1, 0, this.cz(this.entrance) + 1.5);
    this.scene.add(p.root);
    this.bots.push({ p, paper, cell: -1, t: Math.random(), path: [], pi: 0 });
  }

  /** golpe de picareta na célula k: depois de 3 golpes ela abre e dá minério */
  hit(k: number): { vol: number; gold: number } | null {
    if (k < 0 || this.cells[k]) return null;
    const i = k % UG;
    if (i === 0 || i === UG - 1 || k >= UG * (UG - 1)) return null; // borda é rocha firme
    this.hits[k]++;
    if (this.hits[k] < 3) return { vol: 0, gold: 0 };
    this.cells[k] = 1;
    this.rebuild();
    const vol = 0.6;
    return { vol, gold: vol * this.grade[k] };
  }

  enterAt(): void {
    // dois passos para dentro: a câmera (atrás) fica entre a moega e o mineiro
    this.pos.set(this.cx(this.entrance), 0, this.cz(this.entrance) + CS * 2);
    this.body.place(this.pos.x, this.pos.z, 0);
    this.yaw = 0;
  }

  /** um quadro: jogador (ctl), vagonetas e robôs */
  step(dt: number, ctl: Ctl | null, camYaw: number, say: (s: string) => void): void {
    const w = this.worker;
    this.moving = false;
    const b = this.body;
    if (Math.abs(b.x - this.pos.x) + Math.abs(b.z - this.pos.z) > 0.5) b.place(this.pos.x, this.pos.z, 0);
    let fwd = 0;
    let side = 0;
    if (ctl && this.swing < 0) {
      const mx = Math.abs(ctl.mx) > 0.08 ? ctl.mx : 0;
      const my = Math.abs(ctl.my) > 0.08 ? ctl.my : 0;
      if (this.fp) {
        // 1ª pessoa: o jogo gira o corpo com a câmera; direcional = frente/lado
        fwd = -my;
        side = mx;
        if (fwd < 0) fwd *= 0.7;
      } else if (this.tank) {
        // de frente: x gira, y anda (para trás devagar)
        if (mx) this.yaw -= mx * Math.abs(mx) * dt * 2.4;
        fwd = -my;
        if (fwd < 0) fwd *= 0.5;
      } else {
        const mag = Math.min(1, Math.hypot(mx, my));
        if (mag > 0) {
          const a = camYaw + Math.atan2(-mx, -my);
          let d = a - this.yaw;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          this.yaw += d * Math.min(1, dt * 10);
          fwd = mag * Math.max(0.3, Math.cos(d));
        }
      }
    }
    b.steer(dt, side, fwd, this.yaw + Math.PI);
    b.move(dt);
    this.pos.set(b.x, 0, b.z);
    const sp = Math.hypot(b.vx, b.vz);
    this.moving = sp > 0.4;
    this.walk += sp * dt * 3;
    w.root.position.copy(this.pos);
    w.root.rotation.y = this.yaw;
    const sw = Math.sin(this.walk) * 0.5;
    w.legL.rotation.x = sw;
    w.legR.rotation.x = -sw;
    // picareta
    if (ctl && ctl.act && this.swing < 0) this.swing = 0;
    if (this.swing >= 0) {
      this.swing += dt / 0.5;
      w.shovel.visible = true;
      w.shovel.rotation.x = -1.2 + Math.sin(this.swing * Math.PI) * 1.6;
      w.armR.rotation.x = -1.6 + Math.sin(this.swing * Math.PI) * 1.2;
      if (this.swing >= 0.5 && this.swing - dt / 0.5 < 0.5) {
        const k = this.cellAt(this.pos.x + Math.sin(this.yaw) * 1.9, this.pos.z + Math.cos(this.yaw) * 1.9);
        if (this.cargo.vol >= this.cargo.cap - 1e-3) say('full');
        else {
          const got = this.hit(k);
          if (got && got.vol > 0) {
            const v = Math.min(got.vol, this.cargo.cap - this.cargo.vol);
            this.cargo.vol += v;
            this.cargo.gold += (got.gold * v) / got.vol;
            say('ore');
          } else if (got) say('hit');
        }
      }
      if (this.swing >= 1) {
        this.swing = -1;
        w.shovel.visible = false;
      }
    }
    w.heap.visible = this.cargo.vol > 0.01;
    w.heap.scale.set(1, 0.4 + (this.cargo.vol / this.cargo.cap) * 0.8, 1);
    // PAPER
    const pc = this.paper;
    if (pc && this.cam) {
      pc.root.visible = !this.fp;
      w.shovel.visible = this.fp && this.swing >= 0;
      pc.setTool(this.swing >= 0 ? 'pick' : null, '#9aa4b4');
      if (!this.fp) pc.update(dt, this.cam, { yaw: this.yaw, speed: this.moving ? 3 : 0, act: this.swing, lean: this.moving ? 0.1 : 0 });
    }
    // despejar: moega da entrada ou vagoneta perto
    if (ctl && ctl.act2 && this.cargo.vol > 0) {
      const hx = this.cx(this.entrance);
      const hz = this.cz(this.entrance);
      if (Math.hypot(this.pos.x - hx, this.pos.z - hz) < 3.2) {
        this.onHopper?.(this.cargo.vol, this.cargo.gold);
        this.cargo.vol = this.cargo.gold = 0;
        say('dump');
      } else {
        const c = this.carts.find((c) => Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 2.6);
        if (c) {
          c.load += this.cargo.vol;
          c.gold += this.cargo.gold;
          this.cargo.vol = this.cargo.gold = 0;
          say('dump');
        }
      }
    }
    // lanterna do capacete + as 4 lâmpadas mais perto (com gerador)
    this.time += dt;
    this.plight.position.set(this.pos.x + Math.sin(this.yaw) * 0.8, 2.3, this.pos.z + Math.cos(this.yaw) * 0.8);
    this.plight.intensity = this.powered ? 14 : 22;
    const near = this.powered ? [...this.lamps].sort((a, b) => Math.hypot(this.cx(a) - this.pos.x, this.cz(a) - this.pos.z) - Math.hypot(this.cx(b) - this.pos.x, this.cz(b) - this.pos.z)) : [];
    this.lampLights.forEach((l, i) => {
      const k = near[i];
      if (k === undefined) {
        l.intensity = 0;
        return;
      }
      l.position.set(this.cx(k) - CS * 0.4 + 0.6, 1.7, this.cz(k) - CS * 0.4);
      l.intensity = 16 * (0.95 + Math.sin(this.time * 7 + k) * 0.05);
    });
    // veios brilham devagar
    const nm = this.nuggets.material as THREE.MeshLambertMaterial;
    nm.emissiveIntensity = 0.75 + Math.sin(this.time * 2.2) * 0.25;
    this.stepCarts(dt);
    this.stepBots(dt);
  }

  private stepCarts(dt: number): void {
    const end = this.carts.length ? this.railEnd() : -1;
    for (const c of this.carts) {
      const heap = c.mesh.getObjectByName('heap')!;
      heap.visible = c.load > 0.05;
      if (end < 0) {
        c.mesh.position.set(c.x, 0, c.z);
        continue;
      }
      if (c.st === 'load') {
        // parada na ponta do trilho até encher
        const px = this.cx(end);
        const pz = this.cz(end);
        c.x += (px - c.x) * Math.min(1, dt * 2);
        c.z += (pz - c.z) * Math.min(1, dt * 2);
        c.t += dt;
        if (c.load >= 1.6 || (c.t > 50 && c.load > 0.2)) {
          const p = this.railPath(end);
          if (p) {
            c.path = p;
            c.pi = 0;
            c.st = 'go';
          }
        }
      } else {
        const tgt = c.path[c.pi];
        const tx = this.cx(tgt);
        const tz = this.cz(tgt);
        const dx = tx - c.x;
        const dz = tz - c.z;
        const d = Math.hypot(dx, dz);
        const sp = 2.6 * dt;
        if (d <= sp) {
          c.x = tx;
          c.z = tz;
          if (c.st === 'go') {
            if (++c.pi >= c.path.length) {
              this.onHopper?.(c.load, c.gold);
              c.load = c.gold = 0;
              c.st = 'back';
              c.path.reverse();
              c.pi = 0;
            }
          } else if (++c.pi >= c.path.length) {
            c.st = 'load';
            c.t = 0;
          }
        } else {
          c.x += (dx / d) * sp;
          c.z += (dz / d) * sp;
          c.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      c.mesh.position.set(c.x, 0, c.z);
    }
  }

  private stepBots(dt: number): void {
    const end = this.carts.length ? this.railEnd() : -1;
    this.bots.forEach((b, i) => {
      const p = b.p;
      // sem luz não trabalham: ficam na entrada
      const base = end >= 0 ? end : this.entrance;
      if (!this.powered) {
        p.root.position.set(this.cx(this.entrance) + 1.5 + i * 0.8, 0, this.cz(this.entrance) + 1.5);
        if (b.paper && this.cam) b.paper.update(dt, this.cam, { yaw: p.root.rotation.y, speed: 0, act: -1 });
        return;
      }
      // escolhe uma rocha encostada no espaço aberto perto da ponta do trilho
      if (b.cell < 0 || this.cells[b.cell]) {
        let best = -1;
        let bd = 1e9;
        for (let k = 0; k < UG * UG; k++) {
          if (this.cells[k]) continue;
          const kx = k % UG;
          if (kx === 0 || kx === UG - 1 || k >= UG * (UG - 1)) continue;
          const nb = [k - 1, k + 1, k - UG, k + UG].find((n) => n >= 0 && n < UG * UG && this.cells[n] && Math.abs((n % UG) - kx) <= 1);
          if (nb === undefined) continue;
          const d = Math.hypot(this.cx(k) - this.cx(base), this.cz(k) - this.cz(base)) + i * 2.5 * ((k * 7) % 3);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
        b.cell = best;
      }
      if (b.cell < 0) return;
      const nb = [b.cell - 1, b.cell + 1, b.cell - UG, b.cell + UG].find((n) => this.open(n) && Math.abs((n % UG) - (b.cell % UG)) <= 1) ?? this.entrance;
      const root = p.root;
      // caminho pela grade de células ABERTAS (nunca atravessa rocha)
      if (!b.path.length || b.path[b.path.length - 1] !== nb) {
        const from = this.nearestOpen(root.position.x, root.position.z);
        b.path = this.openPath(from, nb) ?? [];
        b.pi = 0;
        if (!b.path.length) {
          b.cell = -1;
          return;
        }
      }
      // ponto de trabalho: dentro da célula aberta, encostado na face da rocha
      const last = b.pi >= b.path.length - 1;
      const tgt = b.path[Math.min(b.pi, b.path.length - 1)];
      const sx = last ? this.cx(nb) + (this.cx(b.cell) - this.cx(nb)) * 0.3 : this.cx(tgt);
      const sz = last ? this.cz(nb) + (this.cz(b.cell) - this.cz(nb)) * 0.3 : this.cz(tgt);
      const dx = sx - root.position.x;
      const dz = sz - root.position.z;
      const d = Math.hypot(dx, dz);
      if (d > (last ? 0.12 : 0.35)) {
        root.position.x += (dx / d) * Math.min(d, 2.5 * dt);
        root.position.z += (dz / d) * Math.min(d, 2.5 * dt);
        root.rotation.y = Math.atan2(dx, dz);
        b.t += dt;
        const sw = Math.sin(b.t * 9) * 0.5;
        p.legL.rotation.x = sw;
        p.legR.rotation.x = -sw;
        if (b.paper && this.cam) b.paper.update(dt, this.cam, { yaw: root.rotation.y, speed: 2.5, act: -1 });
        return;
      }
      if (!last) {
        b.pi++;
        return;
      }
      p.legL.rotation.x = p.legR.rotation.x = 0;
      root.rotation.y = Math.atan2(this.cx(b.cell) - root.position.x, this.cz(b.cell) - root.position.z);
      b.t += dt;
      p.shovel.rotation.x = -1.2 + Math.max(0, Math.sin(b.t * 5)) * 1.5;
      p.armR.rotation.x = -1.6 + Math.max(0, Math.sin(b.t * 5)) * 1.2;
      if (b.paper && this.cam) b.paper.update(dt, this.cam, { yaw: root.rotation.y, speed: 0, act: (b.t * 0.8) % 1 });
      if (b.t > 4) {
        b.t = 0;
        const got = this.hit(b.cell);
        if (got && got.vol > 0) {
          // joga na vagoneta parada (ou direto na moega se não houver trilho)
          const cart = this.carts.find((c) => c.st === 'load');
          if (cart) {
            cart.load += got.vol;
            cart.gold += got.gold;
          } else if (end < 0) this.onHopper?.(got.vol * 0.5, got.gold * 0.5);
        }
      }
    });
  }

  /** célula aberta mais perto de (x,z) */
  nearestOpen(x: number, z: number): number {
    const k = this.cellAt(x, z);
    if (this.open(k)) return k;
    let best = this.entrance;
    let bd = 1e9;
    for (let q = 0; q < UG * UG; q++) {
      if (!this.cells[q]) continue;
      const d = Math.hypot(this.cx(q) - x, this.cz(q) - z);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }
  /** BFS em células abertas (4 vizinhos) de a até b */
  openPath(a: number, b: number): number[] | null {
    if (!this.open(a) || !this.open(b)) return null;
    const prev = new Int32Array(UG * UG).fill(-2);
    const q = [a];
    prev[a] = -1;
    for (let h = 0; h < q.length; h++) {
      const k = q[h];
      if (k === b) {
        const out: number[] = [];
        for (let c = k; c !== -1; c = prev[c]) out.unshift(c);
        return out;
      }
      const i = k % UG;
      for (const n of [i < UG - 1 ? k + 1 : -1, i > 0 ? k - 1 : -1, k + UG, k - UG]) {
        if (n < 0 || n >= UG * UG || prev[n] !== -2 || !this.cells[n]) continue;
        prev[n] = k;
        q.push(n);
      }
    }
    return null;
  }

  save(): UgSave {
    return { cells: b64(this.cells), rails: b64(this.rail), lamps: [...this.lamps], gen: this.gen, carts: this.carts.length, bots: this.bots.length };
  }
  load(s: UgSave): void {
    unb64(s.cells, this.cells);
    unb64(s.rails, this.rail);
    this.lamps = [...(s.lamps || [])];
    this.gen = s.gen ?? -1;
    for (let i = 0; i < (s.carts || 0); i++) this.addCart();
    for (let i = 0; i < (s.bots || 0); i++) this.addBot();
    this.rebuild();
  }
  dispose(): void {
    this.paper?.dispose();
    for (const b of this.bots) b.paper?.dispose();
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  }
}

/** PAPER: troca o boneco 3D pelo Bloop 2D (o carrinho e a picareta 3D continuam) */
function paperize(p: WorkerParts, spec: PaperSpec, cell: number): PaperChar | null {
  if (!paperOn('garimpo')) return null;
  const pc = new PaperChar(spec, { radius: 0.6, cell, shadow: true });
  for (const c of p.root.children) if (c !== p.barrow) c.visible = false;
  p.root.add(pc.root);
  return pc;
}

function b64(a: Uint8Array): string {
  let s = '';
  for (let i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
  return btoa(s);
}
function unb64(s: string, out: Uint8Array): void {
  try {
    const b = atob(s || '');
    for (let i = 0; i < b.length && i < out.length; i++) out[i] = b.charCodeAt(i);
  } catch {
    /* save velho */
  }
}
