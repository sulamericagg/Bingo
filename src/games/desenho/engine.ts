/* ============================================================
 *  DESENHA E VIRA! — motor: renderer único, laço, qualidade, partículas,
 *  mundo físico e o "tique" das criações. Cada modo (Ateliê, Desafios)
 *  é um Stage que o motor desenha.
 * ============================================================ */
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { QualityGovernor, detectInitialTier, loadMode, type Tier } from '../../core/quality';
import { Particles } from '../../3d/common/particles';
import { q3For, type Q3 } from '../../3d/common/quality';
import { roomEnv } from '../../3d/common/pbr';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
  dispose(): void;
  /** opcional: chamado quando a qualidade muda */
  quality?(q: Q3): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly gov: QualityGovernor;
  q: Q3;
  stage: Stage | null = null;
  private raf = 0;
  private last = 0;
  private paused = false;
  private ro: ResizeObserver;
  w = 1;
  h = 1;
  /** tremida de câmera (s) */
  shake = 0;
  onFrame: (dt: number) => void = () => {};
  /** painel por cima da cena: desenha raramente (poupa bateria e CPU para o traço) */
  idle = false;
  private skip = 0;

  constructor(private host: HTMLElement) {
    this.gov = new QualityGovernor({ initial: detectInitialTier(), mode: loadMode(), emit: false, persist: false, onChange: (t) => this.applyTier(t) });
    this.q = q3For(this.gov.tier);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dv-gl';
    host.appendChild(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.q.tier >= 2, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyTier(this.gov.tier);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  env(): THREE.Texture | null {
    return this.q.standard ? roomEnv(this.renderer) : null;
  }

  private applyTier(t: Tier): void {
    this.q = q3For(t);
    this.renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, this.q.pr * 1.25)));
    this.renderer.shadowMap.enabled = this.q.shadows;
    this.stage?.quality?.(this.q);
    this.resize();
  }

  resize(): void {
    const r = this.host.getBoundingClientRect();
    this.w = Math.max(1, Math.round(r.width));
    this.h = Math.max(1, Math.round(r.height));
    this.renderer.setSize(this.w, this.h, false);
    if (this.stage) {
      this.stage.camera.aspect = this.w / this.h;
      this.stage.camera.updateProjectionMatrix();
    }
  }

  setStage(s: Stage | null): void {
    if (this.stage && this.stage !== s) this.stage.dispose();
    this.stage = s;
    this.resize();
  }

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.last = performance.now();
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.paused || document.hidden) {
      this.last = now;
      return;
    }
    const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    const t0 = performance.now();
    const st = this.stage;
    if (!st) return;
    if (this.idle && this.skip++ % 10 !== 0) return;
    st.update(dt);
    this.onFrame(dt);
    const cam = st.camera;
    let sx = 0,
      sy = 0;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const k = this.shake * 0.08;
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
      cam.position.x += sx;
      cam.position.y += sy;
    }
    this.renderer.render(st.scene, cam);
    cam.position.x -= sx;
    cam.position.y -= sy;
    this.gov.sample(dt * 1000, performance.now() - t0);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.stage?.dispose();
    this.stage = null;
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.canvas.remove();
  }
}

/** mundo físico padrão do jogo */
export function makeWorld(): { world: CANNON.World; mats: { def: CANNON.Material; bouncy: CANNON.Material; ground: CANNON.Material; slick: CANNON.Material } } {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  (world.solver as CANNON.GSSolver).iterations = 12;
  const def = new CANNON.Material('def');
  const bouncy = new CANNON.Material('bouncy');
  const ground = new CANNON.Material('ground');
  const slick = new CANNON.Material('slick');
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.2;
  world.addContactMaterial(new CANNON.ContactMaterial(bouncy, ground, { friction: 0.5, restitution: 0.6 }));
  world.addContactMaterial(new CANNON.ContactMaterial(bouncy, def, { friction: 0.5, restitution: 0.5 }));
  world.addContactMaterial(new CANNON.ContactMaterial(def, ground, { friction: 0.55, restitution: 0.22 }));
  world.addContactMaterial(new CANNON.ContactMaterial(slick, ground, { friction: 0.02, restitution: 0.3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(slick, def, { friction: 0.05, restitution: 0.3 }));
  world.addContactMaterial(new CANNON.ContactMaterial(slick, bouncy, { friction: 0.05, restitution: 0.5 }));
  return { world, mats: { def, bouncy, ground, slick } };
}

export function makeParticles(scene: THREE.Scene, q: Q3, max = 500): Particles {
  const p = new Particles(max, true);
  p.budget = q.particles;
  p.floorY = -100;
  scene.add(p.obj);
  return p;
}

/** easing elástico (crescer com "boing") */
export function elasticOut(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -9 * t) * Math.sin(((t - 0.075) * (2 * Math.PI)) / 0.32) + 1;
}

export function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}
