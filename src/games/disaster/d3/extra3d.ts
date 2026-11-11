/* ============================================================
 *  MOTORES NOVOS DO 3D (docs/DISASTER-DESIGN.md §9) — mesmas regras do 2D (extra2d.ts) na ilha:
 *  gravidade maluca, buraco negro, abdução, lasers, pisão do gigante, onda de calor, incêndio,
 *  nevasca, gêiseres, fantasminhas, abelhas e bolas rolando. Malhas em pool (criadas uma vez),
 *  materiais baratos (Basic/aditivo) e partículas em Points com sprite macio.
 * ============================================================ */
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { t } from '../../../i18n';
import { audio } from '../../../core/audio';
import { tap } from '../../../core/haptics';
import type { DisasterId } from '../scenarios';
import type { Tune } from '../catalog';
import { ISLAND_R, GRAV, PH, type Disaster3D, type P3 } from './game3d';

const TAU = Math.PI * 2;

/* ------------------------------ texturas geradas ------------------------------ */

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t2 = new THREE.CanvasTexture(c);
  t2.colorSpace = THREE.SRGBColorSpace;
  return t2;
}
let softT: THREE.CanvasTexture | null = null;
export function softSprite(): THREE.CanvasTexture {
  if (softT) return softT;
  softT = canvasTex(64, 64, (x) => {
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
  });
  return softT;
}
let flameT: THREE.CanvasTexture | null = null;
export function flameSprite(): THREE.CanvasTexture {
  if (flameT) return flameT;
  flameT = canvasTex(64, 128, (x) => {
    const g = x.createRadialGradient(32, 92, 4, 32, 80, 60);
    g.addColorStop(0, 'rgba(255,250,200,1)');
    g.addColorStop(0.25, 'rgba(255,200,60,1)');
    g.addColorStop(0.55, 'rgba(255,110,20,.85)');
    g.addColorStop(1, 'rgba(200,40,0,0)');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(32, 2);
    x.bezierCurveTo(48, 40, 62, 70, 58, 98);
    x.bezierCurveTo(54, 124, 10, 124, 6, 98);
    x.bezierCurveTo(2, 70, 16, 40, 32, 2);
    x.fill();
  });
  return flameT;
}
let beeT: THREE.CanvasTexture | null = null;
function beeSprite(): THREE.CanvasTexture {
  if (beeT) return beeT;
  beeT = canvasTex(32, 32, (x) => {
    x.fillStyle = 'rgba(255,255,255,.85)';
    x.beginPath();
    x.ellipse(12, 9, 6, 8, -0.5, 0, TAU);
    x.ellipse(20, 9, 6, 8, 0.5, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.beginPath();
    x.ellipse(16, 19, 11, 8, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#ffd23f';
    x.beginPath();
    x.ellipse(16, 19, 9.5, 6.6, 0, 0, TAU);
    x.fill();
    x.fillStyle = '#2a0b5c';
    x.fillRect(13, 12.5, 2.4, 13);
    x.fillRect(18.5, 12.5, 2.4, 13);
  });
  return beeT;
}
function ballTex(kind: string): THREE.CanvasTexture {
  return canvasTex(256, 128, (x) => {
    if (kind === 'bowling') {
      const g = x.createLinearGradient(0, 0, 256, 128);
      g.addColorStop(0, '#5a5aff');
      g.addColorStop(0.5, '#2a22a8');
      g.addColorStop(1, '#7a3ad8');
      x.fillStyle = g;
      x.fillRect(0, 0, 256, 128);
      x.globalAlpha = 0.25;
      for (let i = 0; i < 30; i++) {
        x.fillStyle = i % 2 ? '#9ab0ff' : '#140c50';
        x.beginPath();
        x.ellipse(Math.random() * 256, Math.random() * 128, 20 + Math.random() * 30, 4 + Math.random() * 6, Math.random() * 3, 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
      x.fillStyle = '#0c0828';
      for (const [hx, hy] of [
        [118, 40],
        [138, 40],
        [128, 62],
      ]) {
        x.beginPath();
        x.arc(hx, hy, 7, 0, TAU);
        x.fill();
      }
    } else if (kind === 'snowball') {
      x.fillStyle = '#f4f8ff';
      x.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 260; i++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(170,200,240,.35)' : 'rgba(255,255,255,.8)';
        x.beginPath();
        x.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 6, 0, TAU);
        x.fill();
      }
    } else {
      x.fillStyle = '#8a7a68';
      x.fillRect(0, 0, 256, 128);
      for (let i = 0; i < 200; i++) {
        x.fillStyle = Math.random() < 0.5 ? 'rgba(60,46,36,.4)' : 'rgba(200,184,160,.35)';
        x.beginPath();
        x.arc(Math.random() * 256, Math.random() * 128, 2 + Math.random() * 10, 0, TAU);
        x.fill();
      }
    }
  });
}

/* ------------------------------ estado ------------------------------ */

interface Ufo {
  on: boolean;
  x: number;
  z: number;
  bx: number;
  bz: number;
  st: number;
  t: number;
  r: number;
  g: THREE.Group;
  beam: THREE.Mesh;
  ring: THREE.Mesh;
}
interface Laser {
  on: boolean;
  /** eixo de varredura: 0 = anda em x (linha ao longo de z), 1 = anda em z */
  ax: number;
  dir: number;
  pos: number;
  y: number;
  high: boolean;
  warn: number;
  life: number;
  m: THREE.Mesh;
}
interface Stomp {
  on: boolean;
  x: number;
  z: number;
  r: number;
  t: number;
  T: number;
  ring: number;
  max: number;
  after: number;
  tgt: number;
  foot: THREE.Group;
  shadow: THREE.Mesh;
  wave: THREE.Mesh;
}
interface Vent {
  x: number;
  z: number;
  warn: number;
  erupt: number;
  cd: number;
  base: THREE.Mesh;
  col: THREE.Mesh;
}
interface Chaser {
  on: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  tgt: number;
  t: number;
  fade: number;
  dash: number;
  bored: number;
  r: number;
  g: THREE.Object3D;
}
interface Camp {
  on: boolean;
  x: number;
  z: number;
  t: number;
  g: THREE.Group;
}
interface Ball {
  on: boolean;
  x: number;
  z: number;
  dx: number;
  dz: number;
  v: number;
  r: number;
  warn: number;
  m: THREE.Mesh;
  lane: THREE.Mesh;
}

/** casa (índice) em cima/dentro: utilitário */
export class Extra3D {
  g: Disaster3D;
  root = new THREE.Group();
  grav = { st: 0, t: 0, next: 0 };
  hole = { on: false, x: 0, z: 0, y: 13, st: 0, t: 0, next: 0, pull: 0, t2: 0, tg: -1 };
  holeG: THREE.Group;
  private holeDisk: THREE.Mesh;
  ufos: Ufo[] = [];
  lasers: Laser[] = [];
  stomps: Stomp[] = [];
  sun = { st: 0, t: 0, next: 0, k: 0 };
  fire = { x: 1e9, dir: 1, v: 0, band: 6, x2: 1e9, v2: 0, on2: false, at2: 0 };
  private fireG: THREE.InstancedMesh;
  private ashM: THREE.Mesh;
  private ash2M: THREE.Mesh;
  cold = { st: 0, t: 0, next: 0 };
  camps: Camp[] = [];
  vents: Vent[] = [];
  ghosts: Chaser[] = [];
  swarms: Chaser[] = [];
  balls: Ball[] = [];
  roofT: number[] = [];
  haunt: number[] = [];
  private dummy = new THREE.Object3D();
  private v3 = new THREE.Vector3();

  constructor(g: Disaster3D) {
    this.g = g;
    const add = <T extends THREE.Object3D>(o: T): T => {
      o.visible = false;
      this.root.add(o);
      return o;
    };
    // ---- buraco negro ----
    this.holeG = add(new THREE.Group());
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0x05010f }));
    this.holeG.add(core);
    const diskT = canvasTex(256, 256, (x) => {
      const gr = x.createRadialGradient(128, 128, 30, 128, 128, 128);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.28, 'rgba(255,230,255,1)');
      gr.addColorStop(0.45, 'rgba(190,120,255,.9)');
      gr.addColorStop(0.7, 'rgba(100,40,220,.45)');
      gr.addColorStop(1, 'rgba(40,10,120,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 256);
      x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 26; i++) {
        x.strokeStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.3})`;
        x.lineWidth = 2 + Math.random() * 5;
        x.beginPath();
        const r0 = 50 + Math.random() * 70;
        const a0 = Math.random() * TAU;
        x.arc(128, 128, r0, a0, a0 + 0.6 + Math.random());
        x.stroke();
      }
    });
    this.holeDisk = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshBasicMaterial({ map: diskT, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.holeDisk.rotation.x = -Math.PI / 2 + 0.8;
    this.holeG.add(this.holeDisk);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0x9a6aff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    halo.scale.setScalar(20);
    this.holeG.add(halo);
    // ---- discos voadores ----
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      prof.push(new THREE.Vector2(Math.sin(a) * 2.6 + 0.01, Math.cos(a) * 0.45));
    }
    const saucerG = new THREE.LatheGeometry(prof, 28);
    const saucerM = new THREE.MeshStandardMaterial({ color: 0xdfe6f4, metalness: 0.25, roughness: 0.3, emissive: 0x3a4a6a, emissiveIntensity: 0.35 });
    const domeM = new THREE.MeshStandardMaterial({ color: 0x8af0ff, transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.1, emissive: 0x2a8aa0, emissiveIntensity: 0.4 });
    const lightG = new THREE.SphereGeometry(0.16, 8, 6);
    for (let i = 0; i < 3; i++) {
      const gr = add(new THREE.Group());
      gr.visible = false;
      const s = new THREE.Mesh(saucerG, saucerM);
      gr.add(s);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 10, 0, TAU, 0, Math.PI / 2), domeM);
      dome.position.y = 0.3;
      gr.add(dome);
      const alien = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), new THREE.MeshStandardMaterial({ color: 0x7dff9a, roughness: 0.5 }));
      alien.position.y = 0.65;
      gr.add(alien);
      for (let k = 0; k < 10; k++) {
        const l = new THREE.Mesh(lightG, new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffe14d : 0xff5aa5 }));
        l.position.set(Math.cos((k / 10) * TAU) * 2.35, -0.05, Math.sin((k / 10) * TAU) * 2.35);
        gr.add(l);
      }
      const beamT = canvasTex(8, 128, (x) => {
        const gr = x.createLinearGradient(0, 0, 0, 128);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.15, 'rgba(255,255,255,.9)');
        gr.addColorStop(1, 'rgba(255,255,255,.25)');
        x.fillStyle = gr;
        x.fillRect(0, 0, 8, 128);
        for (let i = 0; i < 10; i++) {
          x.fillStyle = 'rgba(255,255,255,.35)';
          x.fillRect(0, Math.random() * 128, 8, 2);
        }
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.6, 1, 24, 1, true), new THREE.MeshBasicMaterial({ map: beamT, color: 0x6dff90, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      beam.visible = false;
      this.root.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.root.add(ring);
      this.ufos.push({ on: false, x: 0, z: 0, bx: 0, bz: 0, st: 0, t: 0, r: 2.6, g: gr, beam, ring });
    }
    // ---- lasers ----
    const lm = () => new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), lm()));
      const core2 = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.add(core2);
      this.lasers.push({ on: false, ax: 0, dir: 1, pos: 0, y: 0.35, high: false, warn: 0, life: 0, m });
    }
    // ---- pé do gigante ----
    const shoeM = new THREE.MeshStandardMaterial({ color: 0xff5a5a, roughness: 0.6 });
    const soleM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    const legM = new THREE.MeshStandardMaterial({ color: 0x3f5fbf, roughness: 0.8 });
    const laceM = new THREE.MeshStandardMaterial({ color: 0xffe14d, roughness: 0.6 });
    for (let i = 0; i < 4; i++) {
      const foot = add(new THREE.Group());
      const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shoeM);
      toe.scale.set(1.15, 0.75, 1.9);
      toe.position.set(0, 0.85, 0.6);
      foot.add(toe);
      const heel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.15, 1.6, 20), shoeM);
      heel.position.set(0, 0.95, -0.6);
      foot.add(heel);
      const sole = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.35, 4.4), soleM);
      sole.position.set(0, 0.18, 0.2);
      foot.add(sole);
      for (let k = 0; k < 3; k++) {
        const lace = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.18), laceM);
        lace.position.set(0, 1.55, 0.2 + k * 0.45);
        foot.add(lace);
      }
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.15, 40, 18), legM);
      leg.position.set(0, 21.5, -0.5);
      foot.add(leg);
      for (const o of foot.children) o.castShadow = true;
      const shadow = add(new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color: 0x1a0828, transparent: true, opacity: 0.5, depthWrite: false })));
      shadow.rotation.x = -Math.PI / 2;
      const wave = add(new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffecc8, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })));
      wave.rotation.x = -Math.PI / 2;
      this.stomps.push({ on: false, x: 0, z: 0, r: 3, t: 0, T: 1, ring: -1, max: 12, after: 0, tgt: -1, foot, shadow, wave });
    }
    // ---- incêndio: chamas instanciadas + chão queimado ----
    const fm = new THREE.MeshBasicMaterial({ map: flameSprite(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.92 });
    this.fireG = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.2, 2.4), fm, 110);
    this.fireG.visible = false;
    this.fireG.frustumCulled = false;
    this.root.add(this.fireG);
    const ashMat = new THREE.MeshBasicMaterial({ color: 0x241612, transparent: true, opacity: 0.78, depthWrite: false });
    this.ashM = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ashMat));
    this.ashM.rotation.x = -Math.PI / 2;
    this.ash2M = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ashMat));
    this.ash2M.rotation.x = -Math.PI / 2;
    // ---- fogueiras ----
    const logM = new THREE.MeshStandardMaterial({ color: 0x6a3e1f, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const cg = add(new THREE.Group());
      for (let k = 0; k < 3; k++) {
        const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.1, 6), logM);
        lg.rotation.z = Math.PI / 2;
        lg.rotation.y = (k / 3) * Math.PI;
        lg.position.y = 0.12;
        cg.add(lg);
      }
      const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameSprite(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      fl.scale.set(1.2, 2, 1);
      fl.position.y = 0.95;
      cg.add(fl);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softSprite(), color: 0xff9a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
      glow.scale.setScalar(5);
      glow.position.y = 0.8;
      cg.add(glow);
      const warmRing = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.2, 40), new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.6, depthWrite: false }));
      warmRing.rotation.x = -Math.PI / 2;
      warmRing.position.y = 0.04;
      cg.add(warmRing);
      this.camps.push({ on: false, x: 0, z: 0, t: 0, g: cg });
    }
    // ---- fantasminhas ----
    const ghostProf: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const y = 1 - i / 14;
      const r = i < 8 ? Math.sin((i / 8) * Math.PI * 0.5) * 0.6 : 0.6 + (i - 8) * 0.012;
      ghostProf.push(new THREE.Vector2(Math.max(0.001, r), y * 1.3 - 0.2));
    }
    const ghostG = new THREE.LatheGeometry(ghostProf, 18);
    const gpos = ghostG.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < gpos.count; i++) {
      const y = gpos.getY(i);
      if (y < 0) {
        const a = Math.atan2(gpos.getZ(i), gpos.getX(i));
        gpos.setY(i, y - 0.12 * (0.5 + 0.5 * Math.sin(a * 5)));
      }
    }
    ghostG.computeVertexNormals();
    const ghostM = new THREE.MeshStandardMaterial({ color: 0xf6f8ff, emissive: 0xb8c4ff, emissiveIntensity: 0.35, transparent: true, opacity: 0.88, roughness: 0.4, side: THREE.DoubleSide });
    const eyeM = new THREE.MeshBasicMaterial({ color: 0x2a0b5c });
    const blushM = new THREE.MeshBasicMaterial({ color: 0xff9ad5, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 6; i++) {
      const gg = add(new THREE.Group());
      gg.add(new THREE.Mesh(ghostG, ghostM.clone()));
      for (const s of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), eyeM);
        e.scale.set(1, 1.5, 0.6);
        e.position.set(s * 0.2, 0.62, 0.52);
        gg.add(e);
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), blushM);
        b.scale.set(1, 0.6, 0.4);
        b.position.set(s * 0.36, 0.45, 0.48);
        gg.add(b);
      }
      this.ghosts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tgt: -1, t: 0, fade: 0, dash: 0, bored: 0, r: 0.9, g: gg });
    }
    // ---- abelhas (enxame de sprites) ----
    for (let i = 0; i < 3; i++) {
      const n = 26;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const pts = add(new THREE.Points(geo, new THREE.PointsMaterial({ map: beeSprite(), size: 0.55, transparent: true, depthWrite: false, alphaTest: 0.2 })));
      pts.frustumCulled = false;
      this.swarms.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, tgt: -1, t: 0, fade: 0, dash: 0, bored: 0, r: 1.3, g: pts });
    }
    // ---- bolas rolando ----
    const laneM = new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.35, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const m = add(new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 })));
      m.castShadow = true;
      const lane = add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), laneM.clone()));
      lane.rotation.x = -Math.PI / 2;
      this.balls.push({ on: false, x: 0, z: 0, dx: 1, dz: 0, v: 8, r: 1, warn: 0, m, lane });
    }
    g.scene.add(this.root);
  }

  get tn(): Tune | undefined {
    return this.g.sc.tune;
  }
  private size(): number {
    return this.tn?.size ?? 1;
  }
  private rate(): number {
    return this.tn?.rate ?? 1;
  }

  reset(): void {
    this.grav.st = 0;
    this.hole.on = false;
    this.holeG.visible = false;
    for (const u of this.ufos) {
      u.on = false;
      u.g.visible = u.beam.visible = u.ring.visible = false;
    }
    for (const l of this.lasers) {
      l.on = false;
      l.m.visible = false;
    }
    for (const s of this.stomps) {
      s.on = false;
      s.foot.visible = s.shadow.visible = s.wave.visible = false;
    }
    this.sun.st = 0;
    this.sun.k = 0;
    this.fire.x = 1e9;
    this.fire.x2 = 1e9;
    this.fireG.visible = this.ashM.visible = this.ash2M.visible = false;
    this.cold.st = 0;
    for (const c of this.camps) {
      c.on = false;
      c.g.visible = false;
    }
    for (const v of this.vents) {
      this.root.remove(v.base, v.col);
    }
    this.vents.length = 0;
    for (const o of this.ghosts) {
      o.on = false;
      o.g.visible = false;
    }
    for (const o of this.swarms) {
      o.on = false;
      o.g.visible = false;
    }
    for (const b of this.balls) {
      b.on = false;
      b.m.visible = b.lane.visible = false;
    }
    this.roofT = this.g.houses.map(() => 0);
    this.haunt = this.g.houses.map(() => 0);
  }

  /* ------------------------------ consultas ------------------------------ */

  /** algo em cima da cabeça (teto/laje) ou dentro de casa */
  covered(p: P3): boolean {
    if (this.g.insideHouse(p)) return true;
    return this.g.rayBoxes(p.pos.x, p.pos.y + PH + 0.1, p.pos.z, 0, 14, 0) < 1;
  }
  /** na sombra (raio até o sol bloqueado) */
  shaded(p: P3): boolean {
    if (this.houseSafe(p, true)) return true;
    const s = this.g.sunDir;
    return this.g.rayBoxes(p.pos.x, p.pos.y + PH * 0.8, p.pos.z, s.x * 40, s.y * 40, s.z * 40) < 1;
  }
  private houseIdx(p: P3): number {
    const hs = this.g.houses;
    for (let i = 0; i < hs.length; i++) {
      const b = hs[i].inner;
      if (!hs[i].ripped && p.pos.x > b.x0 && p.pos.x < b.x1 && p.pos.z > b.z0 && p.pos.z < b.z1 && p.pos.y < b.y1 - 0.5) return i;
    }
    return -1;
  }
  private houseSafe(p: P3, heat = false): boolean {
    const i = this.houseIdx(p);
    if (i < 0) return false;
    return heat ? (this.roofT[i] ?? 0) >= 0 : (this.haunt[i] ?? 0) <= 0;
  }
  burningAt(x: number): boolean {
    const f = this.fire;
    if (f.x < 1e8 && (x - f.x) * -f.dir >= 0 && (x - f.x) * -f.dir < f.band) return true;
    if (f.x2 < 1e8 && (x - f.x2) * f.dir >= 0 && (x - f.x2) * f.dir < f.band) return true;
    return false;
  }
  ashAt(x: number): boolean {
    const f = this.fire;
    return (f.x < 1e8 && (x - f.x) * -f.dir >= f.band) || (f.x2 < 1e8 && (x - f.x2) * f.dir >= f.band);
  }
  gravK(p: P3): number {
    const base = this.tn?.grav ?? 1;
    const g = this.g;
    if (g.phase === 'disaster' && !p.climbing && !g.insideHouse(p)) {
      if (this.grav.st === 2) return -0.5;
      for (const u of this.ufos) if (u.on && u.st === 2 && Math.hypot(p.pos.x - u.bx, p.pos.z - u.bz) < u.r) return p.vel.y > 7 ? 0 : -0.8;
      const h = this.hole;
      if (h.on && h.st === 2) {
        const d = Math.hypot(h.x - p.pos.x, h.z - p.pos.z);
        if (d < 7) return -0.9 * (1 - d / 7) + 0.25 * (d / 7);
      }
    }
    return this.g.active.has('gravidade') ? base * 0.85 : base;
  }
  slipK(): number {
    return this.tn?.slip ?? 1;
  }

  /* ------------------------------ começo ------------------------------ */

  begin(d: DisasterId): void {
    const g = this.g;
    const I = g.I;
    const sz = this.size();
    const r = () => g.rng();
    switch (d) {
      case 'gravidade':
        this.grav.st = 0;
        this.grav.next = 4.5;
        break;
      case 'buraco':
        this.hole.on = true;
        this.hole.x = (r() - 0.5) * 16;
        this.hole.z = (r() - 0.5) * 16;
        this.hole.st = 0;
        this.hole.next = 3;
        this.holeG.visible = true;
        break;
      case 'abducao': {
        const n = this.tn?.mini ? 3 : 2;
        for (let i = 0; i < n; i++) this.ufoOn(this.ufos[i], (this.tn?.mini ? 2.0 : 2.8) * sz, i * 2.5);
        break;
      }
      case 'laser':
        g.timers.laser = 1.5;
        break;
      case 'pisao':
        g.timers.pisao = 1.2;
        break;
      case 'calor':
        this.sun.st = 0;
        this.sun.next = 3.5;
        break;
      case 'incendio': {
        const side = r() < 0.5 ? -1 : 1;
        const v = ((ISLAND_R * 2 + 14) / ((g.phaseDur || 46) * 0.82)) * (this.tn?.wind ? 1.2 : 1);
        this.fire.dir = -side;
        this.fire.x = side * (ISLAND_R + 6);
        this.fire.v = v;
        this.fire.band = 5 + 1.5 * I;
        this.fire.on2 = I >= 1.05 || !!this.tn?.giant;
        this.fire.at2 = (g.phaseDur || 46) * 0.42;
        this.fire.v2 = v * 1.1;
        this.fireG.visible = true;
        g.timers.ember = 3;
        break;
      }
      case 'nevasca':
        this.cold.st = 0;
        this.cold.next = 6;
        g.timers.camp = 0.5;
        g.setSnow(true);
        break;
      case 'geiser': {
        const n = Math.round((6 + 2 * I) * (this.tn?.mini ? 1.5 : 1));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + r() * 0.5;
          const rr = 6 + r() * (ISLAND_R - 10);
          this.addVent(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.timers.geiser = 1.4;
        break;
      }
      case 'fantasma': {
        const n = this.tn?.giant ? 1 : Math.round((1.1 + 0.9 * I) * (this.tn?.mini ? 1.8 : 1));
        for (let i = 0; i < Math.min(n, this.ghosts.length); i++) {
          const o = this.ghosts[i];
          o.on = true;
          const a = r() * TAU;
          o.x = Math.cos(a) * 20;
          o.z = Math.sin(a) * 20;
          o.y = 2.5;
          o.vx = o.vy = o.vz = 0;
          o.tgt = -1;
          o.t = 0;
          o.fade = 1.4 + i * 1.3;
          o.dash = 0;
          o.r = this.tn?.giant ? 1.6 : this.tn?.mini ? 0.6 : 0.9;
          o.g.scale.setScalar(o.r / 0.9);
          o.g.visible = true;
        }
        break;
      }
      case 'abelhas': {
        const n = this.tn?.mini ? 3 : 1;
        for (let i = 0; i < n; i++) this.swarmOn(this.swarms[i], i);
        g.timers.swarm2 = (g.phaseDur || 46) * 0.4;
        break;
      }
      case 'bolas':
        g.timers.bolas = 1.2;
        break;
      default:
        break;
    }
  }

  private ufoOn(u: Ufo, r: number, delay: number): void {
    const a = this.g.rng() * TAU;
    u.on = true;
    u.x = Math.cos(a) * (ISLAND_R + 8);
    u.z = Math.sin(a) * (ISLAND_R + 8);
    u.st = 0;
    u.t = 1.5 + delay;
    u.r = r;
    u.g.visible = true;
  }
  private swarmOn(o: Chaser, i: number): void {
    const a = this.g.rng() * TAU;
    o.on = true;
    o.x = Math.cos(a + i) * (ISLAND_R + 2);
    o.z = Math.sin(a + i) * (ISLAND_R + 2);
    o.y = 3;
    o.vx = o.vy = o.vz = 0;
    o.tgt = -1;
    o.t = 0;
    o.bored = 0;
    o.dash = 0;
    o.r = this.tn?.giant ? 2.0 : this.tn?.mini ? 0.9 : 1.3;
    (o.g as THREE.Points).material = (o.g as THREE.Points).material;
    ((o.g as THREE.Points).material as THREE.PointsMaterial).size = this.tn?.giant ? 0.9 : 0.55;
    o.g.visible = true;
  }
  private addVent(x: number, z: number): void {
    if (this.g.statics.some((b) => b.y1 > 0.05 && x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) return;
    const base = new THREE.Mesh(new THREE.RingGeometry(0.3, 1.0, 20), new THREE.MeshBasicMaterial({ color: 0x3a3040, transparent: true, opacity: 0.9, depthWrite: false }));
    base.rotation.x = -Math.PI / 2;
    base.position.set(x, 0.035, z);
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.0, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
    );
    col.position.set(x, 7, z);
    col.visible = false;
    this.root.add(base, col);
    this.vents.push({ x, z, warn: 0, erupt: 0, cd: 1 + this.g.rng() * 4, base, col });
  }

  /* ------------------------------ forças ------------------------------ */

  force(p: P3, dt: number): void {
    const g = this.g;
    if (g.phase !== 'disaster') return;
    const h = this.hole;
    if (h.on && !p.climbing && !g.insideHouse(p)) {
      const dx = h.x - p.pos.x;
      const dz = h.z - p.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const F = h.pull * Math.max(0, 1 - d / 40);
      p.pos.x += (dx / d) * F * 0.35 * dt;
      p.pos.z += (dz / d) * F * 0.35 * dt;
      p.vel.x += (dx / d) * F * dt;
      p.vel.z += (dz / d) * F * dt;
      if (d < 7 && h.st === 2 && p.onGround) p.vel.y = Math.max(p.vel.y, 1.5);
    }
    for (const u of this.ufos) {
      if (!u.on || u.st !== 2) continue;
      if (Math.hypot(p.pos.x - u.bx, p.pos.z - u.bz) < u.r && !g.insideHouse(p)) {
        if (p.onGround) p.vel.y = Math.max(p.vel.y, 1.5);
        p.vel.x += (u.bx - p.pos.x) * 2 * dt;
        p.vel.z += (u.bz - p.pos.z) * 2 * dt;
      }
    }
    if (this.cold.st === 2 && !g.insideHouse(p)) p.vel.x += g.windDir * 3.2 * dt * (p.onGround ? 0.6 : 1);
  }

  /** depois de mover: perigos dos motores novos */
  post(p: P3, dt: number): void {
    const g = this.g;
    if (!p.alive || g.phase !== 'disaster') return;
    const out = (msg?: string) => {
      g.knockOut(p);
      if (p.self && msg) g.hint(msg, 'alert');
    };
    if (p.pos.y > 15 && (this.grav.st === 2 || this.hole.on || this.ufos.some((u) => u.on && u.st === 2))) {
      out(this.ufos.some((u) => u.on) ? t('dz.out.ufo', 'Os alienígenas levaram você para passear!') : t('dz.out.float', 'Você flutuou para longe!'));
      return;
    }
    const h = this.hole;
    if (h.on && Math.hypot(p.pos.x - h.x, p.pos.y + 0.5 - h.y, p.pos.z - h.z) < 2.6) {
      out();
      return;
    }
    if (p.pos.y < 0.5 && this.burningAt(p.pos.x) && !g.insideHouse(p)) {
      p.burn += dt * 1.4;
      if (p.burn > 0.5) {
        out();
        return;
      }
    }
    if (g.active.has('calor')) {
      const hi = this.houseIdx(p);
      const cov = hi >= 0 ? this.roofT[hi] >= 0 : this.shaded(p) || p.swim;
      const k = this.sun.st === 2 ? 0.25 + 0.07 * g.I : 0.035;
      p.meter = cov ? Math.max(0, p.meter - dt * 0.3) : Math.min(1.05, p.meter + dt * k * (g.training ? 0.7 : 1));
    } else if (g.active.has('nevasca')) {
      let warm = g.insideHouse(p) ? 0.5 : 0;
      for (const c of this.camps) if (c.on && Math.hypot(p.pos.x - c.x, p.pos.z - c.z) < 2.6 && p.pos.y < 1.5) warm = 1;
      const k = (0.03 + 0.012 * g.I + (this.cold.st === 2 ? 0.07 : 0)) * (g.training ? 0.7 : 1);
      p.meter = warm >= 1 ? Math.max(0, p.meter - dt * 0.35) : Math.min(1.05, p.meter + dt * k * (warm > 0 ? 0.35 : 1));
    }
    if (p.meter >= 1) {
      out(g.active.has('calor') ? t('dz.out.heat', 'Ufa, que calor! Você derreteu como sorvete.') : t('dz.out.cold', 'Brrr! Você virou picolé.'));
      return;
    }
    for (const v of this.vents) {
      if (v.erupt > 0 && Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < 0.9 * this.size() + 0.3 && p.pos.y < 14) {
        out();
        return;
      }
    }
    for (const o of this.ghosts) {
      if (!o.on || o.fade > 0) continue;
      if (Math.hypot(p.pos.x - o.x, p.pos.y + 0.6 - o.y, p.pos.z - o.z) < o.r + 0.35 && !this.houseSafe(p)) {
        out(t('dz.out.ghost', 'Buu! Um fantasminha te pegou.'));
        return;
      }
    }
    for (const o of this.swarms) {
      if (!o.on) continue;
      if (Math.hypot(p.pos.x - o.x, p.pos.y + 0.6 - o.y, p.pos.z - o.z) < o.r * 0.7 + 0.35 && !g.insideHouse(p) && !p.swim) {
        out(t('dz.out.bees', 'Ai! As abelhas te alcançaram.'));
        return;
      }
    }
    for (const l of this.lasers) {
      if (!l.on || l.warn > 0) continue;
      const c = l.ax === 0 ? p.pos.x : p.pos.z;
      if (Math.abs(c - l.pos) < 0.32 && l.y > p.pos.y + 0.12 && l.y < p.pos.y + PH * 0.85 && !g.insideHouse(p)) {
        out();
        return;
      }
    }
    for (const s of this.stomps) {
      if (!s.on || s.ring < 0 || s.ring > s.max || !p.onGround || p.pos.y > 0.3) continue;
      const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
      if (d > s.r * 0.8 && Math.abs(d - s.ring) < 0.55) {
        out();
        return;
      }
    }
    for (const b of this.balls) {
      if (!b.on || b.warn > 0) continue;
      if (Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < b.r + 0.3 && p.pos.y < b.r * 2 - 0.3) {
        out();
        return;
      }
    }
  }

  /* ------------------------------ atualização ------------------------------ */

  update(dt: number, k: number): void {
    const g = this.g;
    const I = g.I;
    const A = g.active;
    const dis = g.phase === 'disaster';
    const r = () => g.rng();
    for (let i = 0; i < this.haunt.length; i++) if (this.haunt[i] > 0) this.haunt[i] -= dt;
    if (!dis) return;
    // ---- gravidade ----
    if (A.has('gravidade')) {
      const G = this.grav;
      G.t += dt;
      if (G.st === 0) {
        G.next -= dt * k;
        if (G.next <= 1.7 * g.tele) {
          G.st = 1;
          G.t = 0;
          g.alert3('gravidade', t('dz.al.float', 'A gravidade vai sumir! Fique embaixo de um teto!'), 1.7 * g.tele);
        }
      } else if (G.st === 1 && G.t >= 1.7 * g.tele) {
        G.st = 2;
        G.t = 0;
        for (const d of g.dyn) if (!d.heavy) {
          d.body.wakeUp();
          d.body.applyImpulse(new CANNON.Vec3(0, d.body.mass * 8, 0));
        }
      } else if (G.st === 2) {
        for (const d of g.dyn) if (!d.heavy && d.body.position.y < 14) d.body.applyForce(new CANNON.Vec3(0, d.body.mass * GRAV * 1.4, 0));
        if (G.t >= 2.4 + 0.7 * I) {
          G.st = 0;
          G.next = Math.max(5, 9.5 - 2 * g.heat) / this.rate();
          g.shake = Math.max(g.shake, 0.3);
        }
      }
    }
    // ---- buraco negro ----
    const h = this.hole;
    if (h.on) {
      h.t += dt;
      // vai atrás de alguém (troca de vez em quando): casas no caminho perdem o telhado
      h.t2 = (h.t2 ?? 0) - dt;
      if (h.t2 <= 0 || !g.players[h.tg]?.alive) {
        h.t2 = 6 + r() * 3;
        const p = g.pickTarget();
        h.tg = p ? g.players.indexOf(p) : -1;
      }
      const hp = g.players[h.tg];
      if (hp) {
        const dx = hp.pos.x - h.x;
        const dz = hp.pos.z - h.z;
        const d = Math.hypot(dx, dz) || 1;
        const sp = Math.min(1, d / 4) * (1.1 + 0.4 * I);
        h.x += (dx / d) * sp * dt;
        h.z += (dz / d) * sp * dt;
      }
      if (h.st === 0) {
        h.pull = 1;
        h.next -= dt * k;
        if (h.next <= 1.8 * g.tele) {
          h.st = 1;
          h.t = 0;
          g.alert3('buraco', t('dz.al.hole', 'O buraco negro vai puxar! Fuja do meio!'), 1.8 * g.tele);
        }
      } else if (h.st === 1) {
        h.pull = 2;
        if (h.t >= 1.8 * g.tele) {
          h.st = 2;
          h.t = 0;
        }
      } else {
        h.pull = (5.5 + 2.2 * I) * (this.tn?.mini ? 0.7 : 1);
        g.shake = Math.max(g.shake, 0.12);
        for (let i = 0; i < g.houses.length; i++) {
          const hs = g.houses[i];
          if (hs.ripped || Math.hypot(hs.x - h.x, hs.z - h.z) > 6) continue;
          this.roofT[i] = (this.roofT[i] ?? 0) + dt * I;
          if (this.roofT[i] > 2.6) g.ripRoof(i);
        }
        for (const d of g.dyn) {
          const b = d.body;
          const dx = h.x - b.position.x;
          const dz = h.z - b.position.z;
          const dd = Math.hypot(dx, dz);
          if (dd > 22) continue;
          b.wakeUp();
          const kf = b.mass * (d.heavy ? 4 : 10) * (1 - dd / 22);
          b.applyForce(new CANNON.Vec3((dx / (dd || 1)) * kf, dd < 7 ? b.mass * GRAV * 1.3 : 0, (dz / (dd || 1)) * kf));
        }
        if (h.t >= 4 + 1.2 * I) {
          h.st = 0;
          h.next = Math.max(4, 8 - 2 * g.heat) / this.rate();
        }
      }
      this.holeG.position.set(h.x, h.y, h.z);
      const sc = h.st === 2 ? 1.25 : h.st === 1 ? 1.05 : 0.85;
      this.holeG.scale.setScalar(this.holeG.scale.x + (sc - this.holeG.scale.x) * Math.min(1, dt * 3));
      this.holeDisk.rotation.z += dt * (h.st === 2 ? 3 : 1.2);
    }
    // ---- discos voadores ----
    for (const u of this.ufos) {
      if (!u.on) continue;
      u.t -= dt * k;
      const tg = this.ufoTarget(u);
      if (u.st === 0) {
        const tx = tg ? tg.pos.x + tg.vel.x * 0.5 : 0;
        const tz = tg ? tg.pos.z + tg.vel.z * 0.5 : 0;
        const dx = tx - u.x;
        const dz = tz - u.z;
        const d = Math.hypot(dx, dz) || 1;
        const sp = Math.min(1, d / 4) * (5 + 1.5 * I) * (this.tn?.turbo ? 1.2 : 1);
        u.x += (dx / d) * sp * dt;
        u.z += (dz / d) * sp * dt;
        if (u.t <= 0 && d < 5) {
          u.st = 1;
          u.t = 1.05 * g.tele;
          u.bx = tx;
          u.bz = tz;
          if (Math.hypot(u.x - g.me.pos.x, u.z - g.me.pos.z) < 20) audio.siren(0.8);
        }
      } else if (u.st === 1) {
        u.x += (u.bx - u.x) * Math.min(1, dt * 3);
        u.z += (u.bz - u.z) * Math.min(1, dt * 3);
        if (u.t <= 0) {
          u.st = 2;
          u.t = 2 + 0.4 * I;
        }
      } else {
        if (tg && !this.covered(tg)) {
          const dx = tg.pos.x - u.bx;
          const dz = tg.pos.z - u.bz;
          const d = Math.hypot(dx, dz) || 1;
          const sp = Math.min(1, d / 2) * (4.6 + 1.3 * I);
          u.bx += (dx / d) * sp * dt;
          u.bz += (dz / d) * sp * dt;
        }
        u.x += (u.bx - u.x) * Math.min(1, dt * 3);
        u.z += (u.bz - u.z) * Math.min(1, dt * 3);
        for (let i = 0; i < g.houses.length; i++) {
          const hs = g.houses[i];
          if (hs.ripped || Math.hypot(hs.x - u.bx, hs.z - u.bz) > u.r + 1.5) continue;
          this.roofT[i] = (this.roofT[i] ?? 0) + dt;
          if (this.roofT[i] > 1.5) g.ripRoof(i);
        }
        if (u.t <= 0) {
          u.st = 0;
          u.t = (2.1 - 0.7 * g.heat) / this.rate();
        }
      }
      const by = 11 + Math.sin(g.time * 2 + u.x) * 0.3;
      u.g.position.set(u.x, by, u.z);
      u.g.rotation.y += dt * 1.5;
      u.beam.visible = u.st >= 1;
      u.ring.visible = u.st >= 1;
      if (u.st >= 1) {
        const bm = u.beam.material as THREE.MeshBasicMaterial;
        bm.opacity = u.st === 2 ? 0.2 + 0.05 * Math.sin(g.time * 20) : 0.06 + 0.03 * Math.sin(g.time * 14);
        if (bm.map) bm.map.offset.y = (g.time * 0.6) % 1;
        const top = by - 0.4;
        u.beam.position.set((u.x + u.bx) / 2, top / 2, (u.z + u.bz) / 2);
        u.beam.scale.set(u.r, top, u.r);
        u.ring.position.set(u.bx, 0.05, u.bz);
        u.ring.scale.setScalar(u.r);
        (u.ring.material as THREE.MeshBasicMaterial).color.setHex(u.st === 2 ? 0x9dffb0 : Math.sin(g.time * 18) > 0 ? 0xff3355 : 0xffffff);
      }
    }
    if (A.has('abducao') && !this.ufos[2].on && g.heat > 0.4 && I >= 1.1 && !this.tn?.mini) {
      this.ufoOn(this.ufos[2], 2.8 * this.size(), 0.5);
      g.alert3('abducao', t('dz.al.ufo2', 'Outro disco voador!'), 1.6);
    }
    // ---- lasers ----
    if (A.has('laser')) {
      g.tick(
        'laser',
        dt * k,
        () => {
          const l = this.lasers.find((o) => !o.on);
          const p = g.pickTarget();
          if (!l || !p) return;
          l.on = true;
          l.high = r() < 0.38;
          const surf = p.onGround ? p.pos.y : g.topAt(p.pos.x, p.pos.z);
          l.y = surf + (l.high ? 1.45 : 0.38);
          l.ax = r() < 0.5 ? 0 : 1;
          l.dir = r() < 0.5 ? 1 : -1;
          l.pos = -l.dir * (ISLAND_R + 4);
          l.warn = 1.4 * g.tele;
          l.life = 0;
          l.m.visible = true;
          if (Math.hypot(p.pos.x - g.me.pos.x, p.pos.z - g.me.pos.z) < 20) audio.siren(0.5);
        },
        (2.4 - 0.8 * g.heat) / this.rate(),
      );
    }
    for (const l of this.lasers) {
      if (!l.on) continue;
      const len = ISLAND_R * 2 + 10;
      const lm = l.m.material as THREE.MeshBasicMaterial;
      if (l.warn > 0) {
        l.warn -= dt;
        lm.opacity = 0.25 + 0.25 * Math.sin(g.time * 22);
        l.m.scale.set(0.05, 0.05, len);
      } else {
        l.life += dt;
        l.pos += l.dir * (12 + 2 * I) * (this.tn?.turbo ? 1.15 : 1) * dt;
        lm.opacity = 0.85;
        l.m.scale.set(0.22, 0.22, len);
        if (Math.abs(l.pos) > ISLAND_R + 6 || l.life > 8) {
          l.on = false;
          l.m.visible = false;
        }
      }
      if (l.ax === 0) {
        l.m.position.set(l.pos, l.y, 0);
        l.m.rotation.y = 0;
      } else {
        l.m.position.set(0, l.y, l.pos);
        l.m.rotation.y = Math.PI / 2;
      }
    }
    // ---- pisão do gigante ----
    if (A.has('pisao')) {
      g.tick(
        'pisao',
        dt * k,
        () => {
          const s = this.stomps.find((o) => !o.on);
          const p = g.pickTarget();
          if (!s) return;
          s.on = true;
          s.r = (3.2 + 0.4 * I) * this.size();
          s.x = p ? p.pos.x + p.vel.x * 0.8 : (r() - 0.5) * 40;
          s.z = p ? p.pos.z + p.vel.z * 0.8 : (r() - 0.5) * 40;
          s.tgt = p ? g.players.indexOf(p) : -1;
          s.T = s.t = 1.9 * g.tele * (this.tn?.giant ? 1.15 : 1);
          s.ring = -1;
          s.max = (7 + 2 * I) * Math.sqrt(this.size());
          s.after = 0;
          s.foot.visible = s.shadow.visible = true;
          s.foot.scale.setScalar(s.r / 2.2);
          s.foot.rotation.y = r() * TAU;
        },
        (3.1 - 1.0 * g.heat) / this.rate(),
      );
    }
    for (const s of this.stomps) {
      if (!s.on) continue;
      if (s.t > 0) {
        if (s.t > s.T * 0.45 && s.tgt >= 0) {
          const p = g.players[s.tgt];
          if (p && p.alive) {
            const dx = p.pos.x - s.x;
            const dz = p.pos.z - s.z;
            const d = Math.hypot(dx, dz) || 1;
            const sp = Math.min(1, d / 1.5) * (3.6 + 1 * I);
            s.x += (dx / d) * sp * dt;
            s.z += (dz / d) * sp * dt;
          }
        }
        s.t -= dt;
        const kk = 1 - s.t / s.T;
        const fall = kk < 0.55 ? 1 : Math.pow(1 - (kk - 0.55) / 0.45, 2);
        s.foot.position.set(s.x, fall * 30, s.z);
        s.shadow.position.set(s.x, 0.05, s.z);
        s.shadow.scale.setScalar(s.r * (0.45 + 0.55 * kk));
        (s.shadow.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.4 * kk;
        if (s.t <= 0) this.stompHit(s);
        continue;
      }
      s.after += dt;
      if (s.ring >= 0) {
        s.ring += 12 * dt;
        s.wave.visible = s.ring < s.max;
        s.wave.position.set(s.x, 0.08, s.z);
        s.wave.scale.setScalar(Math.max(0.1, s.ring));
        (s.wave.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - s.ring / s.max);
      }
      s.foot.position.y = Math.max(0, s.after - 0.4) * 34;
      s.shadow.visible = false;
      if (s.after > 1.4) {
        s.on = false;
        s.foot.visible = s.wave.visible = false;
      }
    }
    // ---- calor ----
    if (A.has('calor')) {
      const S = this.sun;
      S.t += dt;
      S.k += ((S.st === 2 ? 1 : 0.25) - S.k) * Math.min(1, dt * 1.5);
      for (let i = 0; i < g.houses.length; i++) {
        if (this.roofT[i] < 0) {
          this.roofT[i] = Math.min(0, this.roofT[i] + dt);
          continue;
        }
        let occ = 0;
        for (const p of g.players) if (p.alive && this.houseIdx(p) === i) occ++;
        if (occ && S.st === 2) this.roofT[i] += dt * (0.6 + 0.25 * occ) * I;
        if (this.roofT[i] > 3) {
          this.roofT[i] = -(5 + 2 * I);
          if (this.houseIdx(g.me) === i) g.hint(t('dz.al.stuffy', 'A casa ficou abafada! Procure outra sombra.'), 'alert');
        }
      }
      if (S.st === 0) {
        S.next -= dt * k;
        if (S.next <= 2 * g.tele) {
          S.st = 1;
          S.t = 0;
          g.alert3('calor', t('dz.al.sun', 'Sol fortíssimo! Corra para a sombra!'), 2 * g.tele);
        }
      } else if (S.st === 1 && S.t >= 2 * g.tele) {
        S.st = 2;
        S.t = 0;
      } else if (S.st === 2 && S.t >= 3.6 + 0.8 * I) {
        S.st = 0;
        S.next = Math.max(3.5, 7.5 - 2.5 * g.heat) / this.rate();
      }
    }
    // ---- incêndio ----
    const F = this.fire;
    if (A.has('incendio')) {
      if (F.x < 1e8) F.x += F.dir * F.v * dt;
      if (F.on2 && g.phaseT >= F.at2) {
        F.on2 = false;
        F.x2 = -F.dir * (ISLAND_R + 6) * -1;
        F.x2 = F.dir > 0 ? ISLAND_R + 6 : -ISLAND_R - 6;
        g.alert3('incendio', t('dz.al.fire2', 'Fogo do outro lado também!'), 2);
      }
      if (F.x2 < 1e8) F.x2 -= F.dir * F.v2 * dt;
      // telhados pegam fogo; brasas no alto
      for (let i = 0; i < g.houses.length; i++) {
        const hs = g.houses[i];
        if (!this.burningAt(hs.x)) continue;
        this.roofT[i] = (this.roofT[i] ?? 0) + dt;
        if (this.roofT[i] > 2.2 && this.roofT[i] < 2.2 + dt * 1.5) {
          const fi = g.fires.find((o) => !o.on) ?? g.fires[0];
          fi.on = true;
          fi.x = hs.x;
          fi.z = hs.z;
          fi.r = 2.4;
          fi.t = 4 + I;
          fi.y = hs.h + 0.35;
          fi.mesh.visible = true;
        }
      }
      g.tick(
        'ember',
        dt * k,
        () => {
          let hi: P3 | null = null;
          for (const q of g.players) if (q.alive && q.pos.y > 1 && ((F.x < 1e8 && Math.abs(q.pos.x - F.x) < 14) || (F.x2 < 1e8 && Math.abs(q.pos.x - F.x2) < 14)) && (!hi || q.idle > hi.idle)) hi = q;
          if (hi && r() < 0.5) g.spawnStrikeAt('bomb', hi.pos.x, hi.pos.z);
          else g.spawnStrike('bomb');
        },
        (3.0 - 0.8 * g.heat) / this.rate(),
      );
      this.drawFire();
    }
    // ---- nevasca ----
    if (A.has('nevasca')) {
      const C = this.cold;
      C.t += dt;
      if (C.st === 0) {
        C.next -= dt * k;
        if (C.next <= 1.8 * g.tele) {
          C.st = 1;
          C.t = 0;
          g.windDir = r() < 0.5 ? -1 : 1;
          g.alert3('nevasca', t('dz.al.cold', 'Rajada gelada! Fique perto do fogo!'), 1.8 * g.tele);
        }
      } else if (C.st === 1 && C.t >= 1.8 * g.tele) {
        C.st = 2;
        C.t = 0;
        const on = this.camps.filter((c) => c.on);
        if (on.length > 1) on[Math.floor(r() * on.length)].t = 0.8;
      } else if (C.st === 2 && C.t >= 3 + I) {
        C.st = 0;
        C.next = Math.max(5, 9 - 2 * g.heat) / this.rate();
      }
      g.wind = C.st === 2 ? g.windDir * 2.4 : 0;
      g.tick(
        'camp',
        dt * k,
        () => {
          const c = this.camps.find((o) => !o.on);
          if (!c || this.camps.filter((o) => o.on).length >= 2) return;
          const s = g.openSpots[Math.floor(r() * g.openSpots.length)];
          c.on = true;
          c.x = s.x + (r() - 0.5) * 2;
          c.z = s.z + (r() - 0.5) * 2;
          c.t = (9 + 3 * r()) * (g.training ? 1.4 : 1);
          c.g.visible = true;
          c.g.position.set(c.x, 0, c.z);
          if (Math.hypot(c.x - g.me.pos.x, c.z - g.me.pos.z) < 40) g.hint(t('dz.al.camp', 'Uma fogueira acendeu! Vá se esquentar.'));
        },
        6.5 / this.rate(),
      );
    }
    for (const c of this.camps) {
      if (!c.on) continue;
      c.t -= dt;
      const fl = c.g.children[3] as THREE.Sprite;
      const s = Math.min(1, c.t / 1.5);
      fl.scale.set(1.2 * s * (0.9 + 0.1 * Math.sin(g.time * 13)), 2 * s, 1);
      if (c.t <= 0) {
        c.on = false;
        c.g.visible = false;
      }
    }
    // ---- gêiseres ----
    if (A.has('geiser') && this.vents.length) {
      g.tick(
        'geiser',
        dt * k,
        () => {
          const p = g.pickTarget();
          let best: Vent | null = null;
          let bd = 1e9;
          for (const v of this.vents) {
            if (v.warn > 0 || v.erupt > 0 || v.cd > 0) continue;
            const d = p ? Math.hypot(v.x - p.pos.x, v.z - p.pos.z) + r() * 8 : r() * 40;
            if (d < bd) {
              bd = d;
              best = v;
            }
          }
          if (p && p.idle > 2.5 && r() < 0.4 && this.vents.length < 16 && p.pos.y < 0.3) {
            this.addVent(p.pos.x + (r() - 0.5), p.pos.z + (r() - 0.5));
            best = this.vents[this.vents.length - 1];
          }
          if (!best) return;
          best.warn = 1.7 * g.tele;
        },
        (2.0 - 0.7 * g.heat) / this.rate(),
      );
    }
    for (const v of this.vents) {
      if (v.cd > 0) v.cd -= dt;
      const bm = v.base.material as THREE.MeshBasicMaterial;
      if (v.warn > 0) {
        v.warn -= dt;
        bm.color.setHex(Math.sin(g.time * 20) > 0 ? 0xff3355 : 0x9fe0ff);
        v.base.scale.setScalar(1 + 0.15 * Math.sin(g.time * 16));
        if (Math.random() < dt * 8 * this.g.q.particleBudget) g.puff(this.v3.set(v.x, 0.3, v.z), 1, 1.5);
        if (v.warn <= 0) {
          v.erupt = 1.5 + 0.3 * I;
          v.col.visible = true;
          if (Math.hypot(v.x - g.me.pos.x, v.z - g.me.pos.z) < 18) {
            audio.hit();
            tap('medium');
          }
          for (const d of g.dyn) if (!d.heavy && Math.hypot(d.body.position.x - v.x, d.body.position.z - v.z) < 1.5) {
            d.body.wakeUp();
            d.body.applyImpulse(new CANNON.Vec3(0, d.body.mass * 12, 0));
          }
        }
      } else if (v.erupt > 0) {
        v.erupt -= dt;
        bm.color.setHex(0x9fe0ff);
        const s = Math.min(1, (1.8 - v.erupt) * 5);
        v.col.scale.set(this.size() * (0.9 + 0.1 * Math.sin(g.time * 30)), s, this.size() * (0.9 + 0.1 * Math.cos(g.time * 27)));
        v.col.position.y = 7 * s;
        if (Math.random() < dt * 20 * this.g.q.particleBudget) g.puff(this.v3.set(v.x, 6 + Math.random() * 8, v.z), 1, 3);
        if (v.erupt <= 0) {
          v.cd = 2.5;
          v.col.visible = false;
        }
      } else {
        bm.color.setHex(0x3a3040);
        v.base.scale.setScalar(1);
      }
    }
    // ---- fantasminhas ----
    for (const o of this.ghosts) {
      if (!o.on) continue;
      const gm = (o.g.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
      if (o.fade > 0) {
        o.fade -= dt;
        gm.opacity = Math.max(0.1, 1 - o.fade / 1.4) * 0.6;
        o.g.position.set(o.x, o.y + Math.sin(g.time * 2) * 0.2, o.z);
        continue;
      }
      gm.opacity = 0.88;
      gm.emissive.setHex(o.dash < 0 ? 0xff5a7a : 0xb8c4ff);
      o.t -= dt;
      if (o.t <= 0 || o.tgt < 0 || !g.players[o.tgt]?.alive || this.houseSafe(g.players[o.tgt])) {
        o.t = 3 + r() * 2;
        o.tgt = this.nearest(o.x, o.z, true);
      }
      const p = o.tgt >= 0 ? g.players[o.tgt] : null;
      let tx = o.x + Math.sin(g.time * 0.7 + o.r) * 3;
      let tz = o.z + Math.cos(g.time * 0.6) * 3;
      let ty = 2.5;
      if (p) {
        tx = p.pos.x;
        tz = p.pos.z;
        ty = p.pos.y + 0.7;
      } else {
        let hi = -1;
        let bd = 1e9;
        for (let i = 0; i < g.houses.length; i++) {
          const hs = g.houses[i];
          if (hs.ripped || this.haunt[i] > 0) continue;
          const d = Math.hypot(hs.x - o.x, hs.z - o.z);
          if (d < bd) {
            bd = d;
            hi = i;
          }
        }
        if (hi >= 0) {
          tx = g.houses[hi].x;
          tz = g.houses[hi].z;
          ty = g.houses[hi].h + 1;
          if (bd < 2 && r() < dt * 0.2) {
            this.haunt[hi] = 5 + I;
            if (this.houseIdx(g.me) === hi) g.hint(t('dz.al.haunt', 'A casa foi assombrada! Saia correndo!'), 'alert');
          }
        }
      }
      if (o.dash <= 0 && p && r() < dt * 0.08 * I) o.dash = -g.tele;
      if (o.dash < 0) {
        o.dash += dt;
        if (o.dash >= 0) o.dash = 1;
      } else if (o.dash > 0) o.dash = Math.max(0, o.dash - dt);
      const sp = (2.2 + 0.5 * I + 0.8 * g.heat) * (o.dash > 0 ? 1.8 : o.dash < 0 ? 0.2 : 1) * (this.tn?.giant ? 0.8 : 1) * (this.tn?.turbo ? 1.15 : 1);
      this.chase(o, tx, ty, tz, sp, dt, 2.2);
      o.g.position.set(o.x, o.y + Math.sin(g.time * 3 + o.r) * 0.15, o.z);
      o.g.rotation.y = Math.atan2(o.vx, o.vz);
    }
    // ---- abelhas ----
    if (A.has('abelhas') && g.timers.swarm2 !== undefined) {
      g.timers.swarm2 -= dt;
      if (g.timers.swarm2 <= 0) {
        g.timers.swarm2 = 1e9;
        if ((I >= 1.05 || this.tn?.turbo) && !this.tn?.giant) {
          const o = this.swarms.find((s) => !s.on);
          if (o) {
            this.swarmOn(o, 1);
            g.alert3('abelhas', t('dz.al.bees2', 'Mais abelhas!'), 1.6);
          }
        }
      }
    }
    for (const o of this.swarms) {
      if (!o.on) continue;
      o.t -= dt;
      const cur = o.tgt >= 0 ? g.players[o.tgt] : null;
      const hidden = !!cur && (g.insideHouse(cur) || cur.swim);
      if (hidden) o.bored += dt;
      if (o.t <= 0 || !cur || !cur.alive || o.bored > 1.6) {
        o.t = 5 + r() * 2;
        o.bored = 0;
        o.tgt = this.nearest(o.x, o.z, false);
      }
      const p = o.tgt >= 0 ? g.players[o.tgt] : null;
      if (o.dash <= 0 && p && r() < dt * 0.15 * I) o.dash = -0.8 * g.tele;
      if (o.dash < 0) {
        o.dash += dt;
        if (o.dash >= 0) o.dash = 0.9;
      } else if (o.dash > 0) o.dash = Math.max(0, o.dash - dt);
      const tx = p && !hidden ? p.pos.x : o.x + Math.sin(g.time) * 2;
      const tz = p && !hidden ? p.pos.z : o.z + Math.cos(g.time) * 2;
      const ty = p && !hidden ? p.pos.y + 0.7 : 3;
      const sp = 4.2 * (0.92 + 0.12 * I + 0.15 * g.heat) * (o.dash > 0 ? 1.6 : o.dash < 0 ? 0.25 : 1) * (this.tn?.giant ? 0.85 : 1) * (this.tn?.turbo ? 1.15 : 1);
      this.chase(o, tx, ty, tz, sp, dt, 3);
      const pts = o.g as THREE.Points;
      const pa = (pts.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const n = pa.length / 3;
      for (let i = 0; i < n; i++) {
        const a = g.time * (3 + (i % 3)) + i * 2.4;
        const rr = o.r * (0.3 + ((i * 37) % 10) / 14);
        pa[i * 3] = o.x + Math.cos(a) * rr;
        pa[i * 3 + 1] = o.y + Math.sin(a * 1.3) * o.r * 0.5;
        pa[i * 3 + 2] = o.z + Math.sin(a) * rr;
      }
      pts.geometry.getAttribute('position').needsUpdate = true;
      ((pts.material as THREE.PointsMaterial).color as THREE.Color).setHex(o.dash < 0 ? 0xff8080 : 0xffffff);
    }
    // ---- bolas rolando ----
    if (A.has('bolas')) {
      g.tick(
        'bolas',
        dt * k,
        () => {
          const b = this.balls.find((o) => !o.on);
          if (!b) return;
          const p = g.pickTarget();
          const a = r() * TAU;
          let dx = Math.cos(a);
          let dz = Math.sin(a);
          let sx = -dx * (ISLAND_R + 2);
          let sz = -dz * (ISLAND_R + 2);
          if (p) {
            // a linha passa por quem foi escolhido
            sx = p.pos.x - dx * (ISLAND_R + 2);
            sz = p.pos.z - dz * (ISLAND_R + 2);
          }
          const l = Math.hypot(dx, dz);
          dx /= l;
          dz /= l;
          b.on = true;
          b.x = sx;
          b.z = sz;
          b.dx = dx;
          b.dz = dz;
          b.r = (1.05 + 0.05 * I) * this.size();
          b.v = (8 + 2 * I) * (this.tn?.speed ?? 1) * (this.tn?.turbo ? 1.15 : 1);
          b.warn = 1.4 * g.tele;
          const kind = this.tn?.ball ?? 'bowling';
          const mm = b.m.material as THREE.MeshStandardMaterial;
          if (!mm.map || mm.userData.k !== kind) {
            mm.map?.dispose();
            mm.map = ballTex(kind);
            mm.userData.k = kind;
            mm.needsUpdate = true;
          }
          b.m.scale.setScalar(b.r);
          b.m.visible = true;
          b.lane.visible = true;
          b.lane.position.set(sx + dx * (ISLAND_R + 2), 0.04, sz + dz * (ISLAND_R + 2));
          b.lane.scale.set(b.r * 2, (ISLAND_R + 2) * 2, 1);
          b.lane.rotation.z = -Math.atan2(dz, dx) + Math.PI / 2;
          b.m.position.set(sx, b.r, sz);
        },
        (2.4 - 0.8 * g.heat) / this.rate(),
      );
    }
    for (const b of this.balls) {
      if (!b.on) continue;
      const lm = b.lane.material as THREE.MeshBasicMaterial;
      if (b.warn > 0) {
        b.warn -= dt;
        lm.opacity = 0.2 + 0.2 * Math.sin(g.time * 16);
        b.m.position.y = b.r + Math.max(0, b.warn - 0.2) * 18;
        continue;
      }
      lm.opacity = 0.12;
      b.x += b.dx * b.v * dt;
      b.z += b.dz * b.v * dt;
      const top = g.topAt(b.x + b.dx * b.r, b.z + b.dz * b.r, b.r * 1.5);
      if (top > b.r * 1.2 && top < 50) {
        // bateu numa casa/morro: derruba o que está perto e quica para trás mais devagar
        for (const d of g.dyn) if (Math.hypot(d.body.position.x - b.x, d.body.position.z - b.z) < b.r + 1.5) {
          d.body.wakeUp();
          d.body.applyImpulse(new CANNON.Vec3(b.dx * d.body.mass * 8, d.body.mass * 4, b.dz * d.body.mass * 8));
        }
        b.dx = -b.dx;
        b.dz = -b.dz;
        b.v *= 0.7;
        g.puff(this.v3.set(b.x, 0.5, b.z), 6, 4);
        audio.crack();
      }
      for (const d of g.dyn) if (Math.hypot(d.body.position.x - b.x, d.body.position.z - b.z) < b.r + 0.6) {
        d.body.wakeUp();
        d.body.applyImpulse(new CANNON.Vec3(b.dx * d.body.mass * 6, d.body.mass * 3, b.dz * d.body.mass * 6));
      }
      b.m.position.set(b.x, b.r, b.z);
      b.m.rotation.x += (b.dz * b.v * dt) / b.r;
      b.m.rotation.z -= (b.dx * b.v * dt) / b.r;
      if (Math.hypot(b.x, b.z) > ISLAND_R + 6 || b.v < 2) {
        b.on = false;
        b.m.visible = b.lane.visible = false;
      }
    }
  }

  private chase(o: Chaser, tx: number, ty: number, tz: number, sp: number, dt: number, acc: number): void {
    const dx = tx - o.x;
    const dy = ty - o.y;
    const dz = tz - o.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    o.vx += ((dx / d) * sp - o.vx) * Math.min(1, dt * acc);
    o.vy += ((dy / d) * sp - o.vy) * Math.min(1, dt * acc);
    o.vz += ((dz / d) * sp - o.vz) * Math.min(1, dt * acc);
    o.x += o.vx * dt;
    o.y = Math.max(0.6, o.y + o.vy * dt);
    o.z += o.vz * dt;
  }

  private ufoTarget(u: Ufo): P3 | null {
    let best: P3 | null = null;
    let bs = -1e9;
    for (const p of this.g.players) {
      if (!p.alive) continue;
      const s = -Math.hypot(p.pos.x - u.x, p.pos.z - u.z) * 0.5 + p.idle * 4 + (this.covered(p) ? -20 : 0);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    return best;
  }
  private nearest(x: number, z: number, ghosts: boolean): number {
    const g = this.g;
    let best = -1;
    let bd = 1e9;
    for (let i = 0; i < g.players.length; i++) {
      const p = g.players[i];
      if (!p.alive) continue;
      if (ghosts ? this.houseSafe(p) : g.insideHouse(p)) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z) - p.idle * 1.5;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  private stompHit(s: Stomp): void {
    const g = this.g;
    s.ring = s.r * 0.6;
    s.after = 0;
    g.shake = Math.max(g.shake, 0.9);
    g.fpcam.addShake(0.9);
    if (Math.hypot(s.x - g.me.pos.x, s.z - g.me.pos.z) < 26) {
      audio.hit();
      tap('heavy');
    }
    g.puff(this.v3.set(s.x, 0.4, s.z), 14, 7);
    for (let i = 0; i < g.houses.length; i++) {
      const hs = g.houses[i];
      if (!hs.ripped && Math.hypot(hs.x - s.x, hs.z - s.z) < s.r + 1.5) g.ripRoof(i);
    }
    for (const d of g.dyn) {
      const dx = d.body.position.x - s.x;
      const dz = d.body.position.z - s.z;
      const dd = Math.hypot(dx, dz);
      if (dd < s.r * 2.2) {
        d.body.wakeUp();
        const kf = d.body.mass * (dd < s.r ? 10 : 5);
        d.body.applyImpulse(new CANNON.Vec3((dx / (dd || 1)) * kf, kf * 0.6, (dz / (dd || 1)) * kf));
      }
    }
    for (const p of g.players) if (p.alive && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r * 0.82) g.knockOut(p);
  }

  private drawFire(): void {
    const g = this.g;
    const F = this.fire;
    const fronts: [number, number][] = [];
    if (F.x < 1e8) fronts.push([F.x, -F.dir]);
    if (F.x2 < 1e8) fronts.push([F.x2, F.dir]);
    const n = this.fireG.count;
    let k = 0;
    const per = Math.floor(n / Math.max(1, fronts.length));
    const cam = g.camera;
    for (const [fx, back] of fronts) {
      for (let i = 0; i < per && k < n; i++) {
        const u = ((i * 0.618) % 1) * 2 - 1;
        const z = u * (ISLAND_R + 2);
        const along = ((i * 0.377) % 1) * F.band;
        const x = fx + back * along;
        const lead = 1 - along / F.band;
        const s = (0.5 + lead * 0.8) * (0.85 + 0.15 * Math.sin(g.time * 9 + i));
        this.dummy.position.set(x, s * 1.15, z);
        this.dummy.rotation.set(0, Math.atan2(cam.position.x - x, cam.position.z - z), 0);
        this.dummy.scale.set(s, s, s);
        this.dummy.updateMatrix();
        this.fireG.setMatrixAt(k++, this.dummy.matrix);
      }
    }
    for (; k < n; k++) {
      this.dummy.position.set(0, -50, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.fireG.setMatrixAt(k, this.dummy.matrix);
    }
    this.fireG.instanceMatrix.needsUpdate = true;
    // chão queimado atrás de cada frente
    const ash = (m: THREE.Mesh, fx: number, back: number) => {
      const x0 = fx + back * F.band;
      const x1 = back > 0 ? ISLAND_R + 8 : -ISLAND_R - 8;
      const w = Math.abs(x1 - x0);
      m.visible = (x1 - x0) * back > 0;
      m.position.set((x0 + x1) / 2, 0.03, 0);
      m.scale.set(w, ISLAND_R * 2 + 4, 1);
    };
    if (F.x < 1e8) ash(this.ashM, F.x, -F.dir);
    if (F.x2 < 1e8) ash(this.ash2M, F.x2, F.dir);
    if (Math.random() < 0.6 * g.q.particleBudget && fronts.length) {
      const [fx, back] = fronts[Math.floor(Math.random() * fronts.length)];
      g.puff(this.v3.set(fx + back * Math.random() * F.band, 2.5 + Math.random() * 2, (Math.random() - 0.5) * ISLAND_R * 2), 1, 2);
    }
  }

  /* ------------------------------ bots ------------------------------ */

  handles(d: DisasterId): boolean {
    return d === 'gravidade' || d === 'buraco' || d === 'abducao' || d === 'laser' || d === 'pisao' || d === 'calor' || d === 'incendio' || d === 'nevasca' || d === 'geiser' || d === 'fantasma' || d === 'abelhas' || d === 'bolas';
  }

  /** escolhe abrigo: casa (b.house = −2−i), fogueira, longe do perigo ou aberto */
  plan(p: P3, d: DisasterId): boolean {
    const g = this.g;
    const b = p.bot!;
    const r = () => g.rng();
    const house = (filter: (i: number) => boolean) => {
      const ok = g.houses.map((h, i) => (!h.ripped && filter(i) ? i : -1)).filter((i) => i >= 0);
      if (!ok.length) return false;
      ok.sort((a, c) => Math.hypot(g.houses[a].x - p.pos.x, g.houses[a].z - p.pos.z) - Math.hypot(g.houses[c].x - p.pos.x, g.houses[c].z - p.pos.z));
      const i = ok[Math.min(ok.length - 1, Math.floor(r() * r() * ok.length * (1.3 - b.skill)))];
      b.tx = g.houses[i].x;
      b.tz = g.houses[i].z;
      b.high = false;
      b.house = -2 - i;
      return true;
    };
    const open = () => {
      const s = g.openSpots[Math.floor(r() * g.openSpots.length)];
      b.tx = s.x;
      b.tz = s.z;
      b.high = false;
      b.house = -1;
    };
    switch (d) {
      case 'gravidade':
      case 'buraco':
      case 'abducao':
      case 'fantasma':
      case 'abelhas':
        if (!house((i) => (d === 'fantasma' ? this.haunt[i] <= 0 : true))) open();
        if (d === 'buraco') {
          // longe do buraco
          const hx = this.hole.x;
          const hz = this.hole.z;
          if (Math.hypot(b.tx - hx, b.tz - hz) < 10) open();
        }
        return true;
      case 'calor':
        if (!house((i) => this.roofT[i] >= 0)) open();
        return true;
      case 'nevasca': {
        let best: Camp | null = null;
        for (const c of this.camps) if (c.on && c.t > 3 && (!best || Math.hypot(c.x - p.pos.x, c.z - p.pos.z) < Math.hypot(best.x - p.pos.x, best.z - p.pos.z))) best = c;
        if (best && (p.meter > 0.3 || r() < 0.6)) {
          b.tx = best.x + (r() - 0.5);
          b.tz = best.z + (r() - 0.5);
          b.high = false;
          b.house = -1;
        } else if (!house(() => true)) open();
        return true;
      }
      case 'incendio': {
        const near = this.fire.x < 1e8 && Math.abs(p.pos.x - this.fire.x) < 10;
        if (near) return false; // sobe (padrão: lugar alto)
        open();
        if (this.burningAt(b.tx)) b.tx = -b.tx;
        return true;
      }
      default:
        open();
        return true;
    }
  }

  /** reação imediata: alvo de fuga e pulo */
  react(p: P3): { tx: number; tz: number; flee: boolean; jump: boolean } {
    const g = this.g;
    const sk = p.bot?.skill ?? 1;
    let tx = 0;
    let tz = 0;
    let flee = false;
    let jump = false;
    const away = (x: number, z: number, k = 4) => {
      const dx = p.pos.x - x;
      const dz = p.pos.z - z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.pos.x + (dx / d) * k;
      tz = p.pos.z + (dz / d) * k;
      flee = true;
    };
    for (const s of this.stomps) {
      if (!s.on) continue;
      if (s.t > 0 && Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.r + 1 && Math.random() < sk + 0.3) away(s.x, s.z);
      if (s.ring >= 0 && s.ring < s.max && p.onGround) {
        const d = Math.hypot(p.pos.x - s.x, p.pos.z - s.z);
        if (d > s.ring && d - s.ring < 1.6 + 1.4 * sk && Math.random() < 0.4 + sk * 0.6) jump = true;
      }
    }
    for (const v of this.vents) if ((v.warn > 0 || v.erupt > 0) && Math.hypot(p.pos.x - v.x, p.pos.z - v.z) < 2 && Math.random() < sk + 0.35) away(v.x, v.z, 3);
    for (const u of this.ufos) if (u.on && u.st > 0 && Math.hypot(p.pos.x - u.bx, p.pos.z - u.bz) < u.r + 1 && !this.covered(p) && Math.random() < sk + 0.2) away(u.bx, u.bz, 5);
    for (const o of this.ghosts) if (o.on && o.fade <= 0 && Math.hypot(o.x - p.pos.x, o.z - p.pos.z) < 4.5 && Math.random() < sk + 0.3) away(o.x, o.z, 5);
    for (const o of this.swarms) if (o.on && Math.hypot(o.x - p.pos.x, o.z - p.pos.z) < 4 && Math.random() < sk + 0.2) away(o.x, o.z, 5);
    for (const b of this.balls) {
      if (!b.on) continue;
      // distância à linha da bola
      const qx = p.pos.x - b.x;
      const qz = p.pos.z - b.z;
      const along = qx * b.dx + qz * b.dz;
      const side = qx * -b.dz + qz * b.dx;
      if (Math.abs(side) < b.r + 1.2 && along > 0) {
        if (along < 3 + 2 * sk && b.warn <= 0 && p.onGround && Math.random() < 0.3 + sk * 0.6) jump = true;
        else if (Math.random() < sk + 0.2) {
          tx = p.pos.x - b.dz * Math.sign(side || 1) * 4;
          tz = p.pos.z + b.dx * Math.sign(side || 1) * 4;
          flee = true;
        }
      }
    }
    for (const l of this.lasers) {
      if (!l.on || l.high || !p.onGround) continue;
      const c = l.ax === 0 ? p.pos.x : p.pos.z;
      const ahead = (c - l.pos) * l.dir;
      if (l.warn <= 0 && ahead > 0 && ahead < 1.2 + 1.6 * sk && Math.abs(p.pos.y + 0.38 - l.y) < 0.6 && Math.random() < 0.45 + sk * 0.55) jump = true;
    }
    if (g.active.has('incendio') && p.pos.y < 0.5 && (this.burningAt(p.pos.x) || (this.fire.x < 1e8 && Math.abs(p.pos.x - this.fire.x) < 3))) {
      tx = p.pos.x + this.fire.dir * 5;
      tz = p.pos.z;
      flee = true;
    }
    return { tx, tz, flee, jump };
  }

  /** alvo em tela fora da vista: posições das ameaças novas (setas na borda) */
  threats(add: (x: number, y: number, z: number, ic: string, urg: number) => void): void {
    const me = this.g.me;
    for (const s of this.stomps) if (s.on && s.t > 0) add(s.x, 0, s.z, 'pisao', 1 - s.t / s.T);
    for (const u of this.ufos) if (u.on && u.st > 0) add(u.bx, 0, u.bz, 'abducao', u.st === 2 ? 1 : 0.7);
    for (const o of this.ghosts) if (o.on && o.fade <= 0 && Math.hypot(o.x - me.pos.x, o.z - me.pos.z) < 14) add(o.x, o.y, o.z, 'fantasma', 0.8);
    for (const o of this.swarms) if (o.on && Math.hypot(o.x - me.pos.x, o.z - me.pos.z) < 16) add(o.x, o.y, o.z, 'abelhas', 0.85);
    for (const b of this.balls) if (b.on && Math.hypot(b.x - me.pos.x, b.z - me.pos.z) < 22) add(b.x, b.r, b.z, 'boliche', 0.8);
    for (const v of this.vents) if (v.warn > 0 && Math.hypot(v.x - me.pos.x, v.z - me.pos.z) < 10) add(v.x, 0, v.z, 'geiser', 0.9);
    if (this.hole.on) add(this.hole.x, this.hole.y, this.hole.z, 'buraco', this.hole.st === 2 ? 1 : 0.5);
  }

  /** onde a câmera das screenshots deve olhar */
  threatPos(): { x: number; z: number; y?: number } | null {
    for (const s of this.stomps) if (s.on) return { x: s.x, z: s.z, y: 6 };
    for (const u of this.ufos) if (u.on) return { x: u.x, z: u.z, y: 7 };
    if (this.hole.on) return { x: this.hole.x, z: this.hole.z, y: 10 };
    for (const o of this.ghosts) if (o.on && o.fade <= 0) return { x: o.x, z: o.z };
    for (const o of this.swarms) if (o.on) return { x: o.x, z: o.z };
    for (const b of this.balls) if (b.on) return { x: b.x, z: b.z };
    for (const v of this.vents) if (v.erupt > 0 || v.warn > 0) return { x: v.x, z: v.z };
    if (this.fire.x < 1e8) return { x: this.fire.x, z: this.g.me.pos.z };
    for (const l of this.lasers) if (l.on) return l.ax === 0 ? { x: l.pos, z: this.g.me.pos.z } : { x: this.g.me.pos.x, z: l.pos };
    return null;
  }
}
