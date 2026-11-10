/* ============================================================
 *  DESENHA E VIRA! — o ATELIÊ (caixa de areia em 1ª pessoa).
 *  Sala de artes com física: mire e pegue, jogue, empilhe, gire, aumente,
 *  pinte, duplique, apague, salve na galeria; carrinhos dirigíveis e
 *  desenhos que voam. A mão 2D é a mesma da Casa 3D.
 * ============================================================ */
import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { tap } from '../../core/haptics';
import { Hand, handColors } from '../../3d/common/hand';
import type { Particles } from '../../3d/common/particles';
import type { Q3 } from '../../3d/common/quality';
import { sfx } from '../../3d/common/sfx';
import { woodTex } from '../../3d/common/pbr';
import { t } from '../../i18n';
import { notify } from '../../ui/notify';
import { FpsControls, bindButton, type BoundButton } from '../../ui/touch';
import type { Built, Mapping } from './build';
import { bumParticles, codeOf, cook, landFx } from './cook';
import { Creation, type Recipe, type Shared } from './creation';
import { disposeObject, elasticOut, makeParticles, makeWorld, type Engine, type Stage } from './engine';
import { dvIcon } from './icons';
import { addToGallery, dvSave, persistDv } from './save';
import { parseShareCode } from './strokes';

export const ATELIER_MAP: Mapping = { s: 1.5 / 512, ox: -0.75, oy: 0.75 };
const ROOM = 6;
const TINTS = ['#ffffff', '#ffb3c7', '#9be8ff', '#c9ff9b', '#ffe08a', '#d7b3ff', '#ffa98a', '#8a8aa0'];

interface Prop {
  mesh: THREE.Mesh;
  body: CANNON.Body;
}
type Grab = { c: Creation; p?: undefined } | { c?: undefined; p: Prop };

export class Atelier implements Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(66, 1, 0.05, 80);
  readonly world: CANNON.World;
  private mats: ReturnType<typeof makeWorld>['mats'];
  readonly particles: Particles;
  private hand: Hand;
  private ctrl: FpsControls;
  creations: Creation[] = [];
  private props: Prop[] = [];
  private yaw = 0;
  private pitch = -0.3;
  private pos = new THREE.Vector3(0, 1.55, 3.6);
  private held: Grab | null = null;
  private holdDist = 1.6;
  private target: Grab | null = null;
  private ray = new THREE.Raycaster();
  /** fundo do menu: câmera girando sozinha */
  menuMode = true;
  private orbitT = 0;
  pilot: Creation | null = null;
  private flyUp = 0;
  private hud: HTMLDivElement;
  private btnMain!: BoundButton;
  private btnThrow!: BoundButton;
  private btns: BoundButton[] = [];
  private sun: THREE.DirectionalLight;
  private growing: { c: Creation; t: number; dur: number; vel: THREE.Vector3; yaw: number }[] = [];
  private homes = new Map<number, THREE.Vector3>();
  private timeAcc = 0;
  onDraw: () => void = () => {};
  onGallery: () => void = () => {};
  onExit: () => void = () => {};
  onGrab: () => void = () => {};

  constructor(
    private eng: Engine,
    layer: HTMLElement,
  ) {
    const W = makeWorld();
    this.world = W.world;
    this.mats = W.mats;
    this.scene.background = new THREE.Color('#bfe6ff');
    this.scene.fog = new THREE.Fog('#f6e9ff', 14, 30);
    const env = eng.env();
    if (env) {
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.45;
    }
    const hemi = new THREE.HemisphereLight('#fff6ec', '#c9b4a0', eng.q.standard ? 1.0 : 1.6);
    this.sun = new THREE.DirectionalLight('#fff0dc', eng.q.standard ? 2.0 : 1.3);
    this.sun.position.set(3.5, 7, 4);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = eng.q.shadows;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -7;
    sc.right = sc.top = 7;
    sc.far = 20;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    // luz de preenchimento vinda da câmera: o desenho na frente das criações sempre aparece bem
    const fill = new THREE.DirectionalLight('#ffffff', eng.q.standard ? 0.7 : 0.55);
    fill.position.set(0.3, 0.5, 1);
    fill.target.position.set(0, 0, -1);
    this.camera.add(fill, fill.target);
    this.scene.add(hemi, this.sun, this.sun.target, this.camera);
    this.buildRoom();
    this.particles = makeParticles(this.scene, eng.q);
    this.hand = new Hand(this.camera, handColors());
    this.hand.visible = false;
    this.ctrl = new FpsControls(layer, { joystick: { zoneTop: 0.3 } });
    this.ctrl.show(false);
    this.hud = document.createElement('div');
    this.hud.className = 'dv-hud';
    this.hud.innerHTML = `
      <div class="dv-top">
        <button class="dv-btn dv-ic dv-h-back" aria-label="${t('dv.back', 'Voltar')}">${dvIcon('back', 24)}</button>
        <div class="dv-grow"></div>
        <button class="dv-btn dv-ghost dv-h-gal">${dvIcon('gallery', 22)}<span>${t('dv.gallery', 'Galeria')}</span></button>
        <button class="dv-btn dv-gold dv-h-draw">${dvIcon('draw', 24)}<span>${t('dv.draw', 'Desenhar')}</span></button>
      </div>
      <div class="dv-ret"></div>
      <div class="dv-tname"></div>
      <div class="dv-ctx">
        <button class="dv-cb" data-k="rot" aria-label="${t('dv.ctx.rot', 'Girar')}">${dvIcon('rotate', 22)}<span>${t('dv.ctx.rot', 'Girar')}</span></button>
        <button class="dv-cb" data-k="big" aria-label="${t('dv.ctx.big', 'Maior')}">${dvIcon('plus', 22)}<span>${t('dv.ctx.big', 'Maior')}</span></button>
        <button class="dv-cb" data-k="small" aria-label="${t('dv.ctx.small', 'Menor')}">${dvIcon('minus', 22)}<span>${t('dv.ctx.small', 'Menor')}</span></button>
        <button class="dv-cb" data-k="paint" aria-label="${t('dv.ctx.paint', 'Pintar')}">${dvIcon('paint', 22)}<span>${t('dv.ctx.paint', 'Pintar')}</span></button>
        <button class="dv-cb" data-k="dup" aria-label="${t('dv.ctx.dup', 'Duplicar')}">${dvIcon('copy', 22)}<span>${t('dv.ctx.dup', 'Duplicar')}</span></button>
        <button class="dv-cb" data-k="save" aria-label="${t('dv.ctx.save', 'Salvar')}">${dvIcon('save', 22)}<span>${t('dv.ctx.save', 'Salvar')}</span></button>
        <button class="dv-cb dv-red" data-k="del" aria-label="${t('dv.ctx.del', 'Apagar')}">${dvIcon('trash', 22)}<span>${t('dv.ctx.del', 'Apagar')}</span></button>
        <button class="dv-cb dv-go" data-k="drive" aria-label="${t('dv.ctx.drive', 'Dirigir')}">${dvIcon('car', 22)}<span>${t('dv.ctx.drive', 'Dirigir')}</span></button>
        <button class="dv-cb dv-go" data-k="fly" aria-label="${t('dv.ctx.fly', 'Pilotar')}">${dvIcon('wing', 22)}<span>${t('dv.ctx.fly', 'Pilotar')}</span></button>
      </div>
      <div class="dv-acts">
        <button class="dv-act dv-throw">${dvIcon('throw', 30)}<span>${t('dv.throw', 'Jogar')}</span></button>
        <button class="dv-act dv-main">${dvIcon('hand', 34)}<span>${t('dv.grab', 'Pegar')}</span></button>
      </div>
      <div class="dv-pilotbar">
        <button class="dv-btn dv-ghost dv-p-exit">${dvIcon('exit', 22)}<span>${t('dv.pilot.exit', 'Sair')}</span></button>
        <button class="dv-act dv-p-up">${dvIcon('up', 28)}</button>
        <button class="dv-act dv-p-down">${dvIcon('down', 28)}</button>
      </div>`;
    layer.appendChild(this.hud);
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.btns.push(
      bindButton(q('.dv-h-back'), { onPress: () => this.onExit() }),
      bindButton(q('.dv-h-draw'), { onPress: () => this.onDraw(), haptic: 'medium' }),
      bindButton(q('.dv-h-gal'), { onPress: () => this.onGallery() }),
      bindButton(q('.dv-p-exit'), { onPress: () => this.endPilot() }),
      bindButton(q('.dv-p-up'), { onPress: () => (this.flyUp = 1), onRelease: () => (this.flyUp = 0) }),
      bindButton(q('.dv-p-down'), { onPress: () => (this.flyUp = -1), onRelease: () => (this.flyUp = 0) }),
    );
    this.btnMain = bindButton(q('.dv-main'), { onPress: () => this.mainAction(), haptic: 'medium' });
    this.btnThrow = bindButton(q('.dv-throw'), { onPress: () => this.throwHeld(), haptic: 'heavy' });
    this.hud.querySelectorAll<HTMLButtonElement>('.dv-cb').forEach((b) => this.btns.push(bindButton(b, { onPress: () => this.ctx(b.dataset.k!) })));
    this.setMenuMode(true);
    this.restoreRoom();
  }

  /* ----------------------------- cenário ----------------------------- */
  private buildRoom(): void {
    const q = this.eng.q;
    const std = q.standard;
    const M = (o: { color?: string; map?: THREE.Texture; rough?: number; emissive?: string }) =>
      std ? new THREE.MeshStandardMaterial({ color: o.color ?? '#fff', map: o.map ?? null, roughness: o.rough ?? 0.8, emissive: o.emissive ?? '#000' }) : new THREE.MeshLambertMaterial({ color: o.color ?? '#fff', map: o.map ?? null, emissive: o.emissive ?? '#000' });
    // chão de madeira
    const wt = woodTex(q.tier >= 2 ? 512 : 256, 6);
    const fmap = wt.map.clone();
    fmap.wrapS = fmap.wrapT = THREE.RepeatWrapping;
    fmap.repeat.set(3, 3);
    fmap.needsUpdate = true;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), M({ color: '#e8c39a', map: fmap, rough: 0.7 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    // tapete redondo de faixas
    const rugC = document.createElement('canvas');
    rugC.width = rugC.height = 256;
    const rx = rugC.getContext('2d')!;
    const cols = ['#ff6fc8', '#ffd93d', '#22c3c9', '#8a5cff', '#8be04e', '#ff9a2e'];
    for (let i = 0; i < 6; i++) {
      rx.fillStyle = cols[i];
      rx.beginPath();
      rx.arc(128, 128, 128 - i * 20, 0, 7);
      rx.fill();
    }
    const rugT = new THREE.CanvasTexture(rugC);
    rugT.colorSpace = THREE.SRGBColorSpace;
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), M({ map: rugT, rough: 1 }));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, 0.005, -0.5);
    rug.receiveShadow = true;
    this.scene.add(rug);
    // paredes
    const H = 4;
    const wallCols = ['#ffe3d1', '#e7defd', '#d8f1ff', '#e7defd'];
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, H), M({ color: wallCols[i], rough: 0.95 }));
      const a = (i * Math.PI) / 2;
      w.position.set(-Math.sin(a) * ROOM, H / 2, -Math.cos(a) * ROOM);
      w.rotation.y = a;
      w.receiveShadow = true;
      this.scene.add(w);
      // rodapé
      const b = new THREE.Mesh(new THREE.BoxGeometry(ROOM * 2, 0.22, 0.05), M({ color: '#ffffff', rough: 0.6 }));
      b.position.copy(w.position).setY(0.11);
      b.position.addScaledVector(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), 0.03);
      b.rotation.y = a;
      this.scene.add(b);
    }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2), M({ color: '#fffaf2' }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = H;
    this.scene.add(ceil);
    // janelão com céu
    const sky = document.createElement('canvas');
    sky.width = 256;
    sky.height = 128;
    const sx = sky.getContext('2d')!;
    const g = sx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#5fb8ff');
    g.addColorStop(1, '#d9f3ff');
    sx.fillStyle = g;
    sx.fillRect(0, 0, 256, 128);
    sx.fillStyle = '#ffffff';
    for (const [cx, cy, r] of [[50, 40, 16], [70, 36, 20], [92, 42, 14], [180, 70, 18], [200, 64, 22], [222, 72, 14]]) {
      sx.beginPath();
      sx.arc(cx, cy, r, 0, 7);
      sx.fill();
    }
    sx.fillStyle = '#7ad86a';
    sx.beginPath();
    sx.moveTo(0, 128);
    for (let i = 0; i <= 16; i++) sx.lineTo(i * 16, 104 - Math.sin(i * 0.8) * 8);
    sx.lineTo(256, 128);
    sx.fill();
    const skyT = new THREE.CanvasTexture(sky);
    skyT.colorSpace = THREE.SRGBColorSpace;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.1), new THREE.MeshBasicMaterial({ map: skyT, toneMapped: false }));
    win.position.set(0, 2.2, -ROOM + 0.02);
    this.scene.add(win);
    const frameM = M({ color: '#ffffff', rough: 0.5 });
    for (const [w, h, x, y] of [[4.6, 0.12, 0, 3.25], [4.6, 0.12, 0, 1.15], [0.12, 2.2, -2.25, 2.2], [0.12, 2.2, 2.25, 2.2], [0.08, 2.1, 0, 2.2], [4.4, 0.06, 0, 2.2]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), frameM);
      f.position.set(x, y, -ROOM + 0.05);
      this.scene.add(f);
    }
    // mural de desenhos (parede esquerda)
    const cork = document.createElement('canvas');
    cork.width = 512;
    cork.height = 256;
    const cx = cork.getContext('2d')!;
    cx.fillStyle = '#c99a62';
    cx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 400; i++) {
      cx.fillStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 30},30,.25)`;
      cx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }
    const doodles: [number, number, number, string][] = [
      [20, 20, -0.06, '#ff4d5e'],
      [140, 30, 0.05, '#3d7cf0'],
      [270, 16, -0.03, '#2fbf71'],
      [390, 34, 0.07, '#8a5cff'],
      [80, 140, 0.04, '#ff9a2e'],
      [230, 136, -0.05, '#ff6fc8'],
      [370, 150, 0.03, '#22c3c9'],
    ];
    doodles.forEach(([x, y, r, c], i) => {
      cx.save();
      cx.translate(x + 50, y + 45);
      cx.rotate(r);
      cx.fillStyle = '#fffaf0';
      cx.fillRect(-50, -45, 100, 90);
      cx.strokeStyle = c;
      cx.lineWidth = 5;
      cx.lineCap = 'round';
      cx.beginPath();
      if (i % 4 === 0) {
        for (let k = 0; k <= 10; k++) {
          const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = k % 2 ? 14 : 32;
          cx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
      } else if (i % 4 === 1) {
        cx.arc(0, 0, 28, 0, 7);
        cx.moveTo(-10, -6);
        cx.arc(-10, -6, 2, 0, 7);
        cx.moveTo(14, -6);
        cx.arc(10, -6, 2, 0, 7);
        cx.moveTo(-14, 8);
        cx.quadraticCurveTo(0, 22, 14, 8);
      } else if (i % 4 === 2) {
        cx.moveTo(-34, 14);
        cx.lineTo(-30, -4);
        cx.lineTo(-12, -6);
        cx.lineTo(-4, -22);
        cx.lineTo(18, -22);
        cx.lineTo(28, -6);
        cx.lineTo(36, 0);
        cx.lineTo(36, 14);
        cx.closePath();
        cx.moveTo(-14, 18);
        cx.arc(-18, 18, 8, 0, 7);
        cx.moveTo(26, 18);
        cx.arc(22, 18, 8, 0, 7);
      } else {
        for (let k = 0; k < 40; k++) {
          const a = k * 0.45;
          cx.lineTo(Math.cos(a) * k * 0.8, Math.sin(a) * k * 0.8);
        }
      }
      cx.stroke();
      cx.fillStyle = '#ff4d5e';
      cx.beginPath();
      cx.arc(0, -40, 4, 0, 7);
      cx.fill();
      cx.restore();
    });
    const corkT = new THREE.CanvasTexture(cork);
    corkT.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 0.06), [frameM, frameM, frameM, frameM, M({ map: corkT, rough: 0.95 }), frameM]);
    board.position.set(-ROOM + 0.04, 2.1, -0.5);
    board.rotation.y = Math.PI / 2;
    this.scene.add(board);
    // lápis gigante encostado (parede direita)
    const pencil = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 6), M({ color: '#ffd93d', rough: 0.5 }));
    const wood = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), M({ color: '#f3c99a' }));
    wood.position.y = -1.51;
    wood.rotation.x = Math.PI;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 6), M({ color: '#2a1e3a' }));
    tip.position.y = -1.65;
    tip.rotation.x = Math.PI;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12), M({ color: '#c0c4d6', rough: 0.3 }));
    ring.position.y = 1.36;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.24, 12), M({ color: '#ff8fb0' }));
    eraser.position.y = 1.55;
    pencil.add(body, wood, tip, ring, eraser);
    pencil.traverse((o) => ((o as THREE.Mesh).castShadow = this.eng.q.shadows));
    pencil.position.set(ROOM - 0.5, 1.6, -2.5);
    pencil.rotation.z = Math.PI + 0.18;
    this.scene.add(pencil);
    // mesa baixa
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.1), M({ color: '#ffffff', rough: 0.5 }));
    tableTop.position.set(3.6, 0.62, 2.2);
    tableTop.castShadow = tableTop.receiveShadow = this.eng.q.shadows;
    this.scene.add(tableTop);
    for (const [dx, dz] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8), M({ color: '#ff6fc8' }));
      leg.position.set(3.6 + dx, 0.3, 2.2 + dz);
      this.scene.add(leg);
    }
    // física estática
    const ground = new CANNON.Body({ mass: 0, material: this.mats.ground });
    ground.addShape(new CANNON.Plane());
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    for (let i = 0; i < 4; i++) {
      const w = new CANNON.Body({ mass: 0, material: this.mats.ground });
      w.addShape(new CANNON.Box(new CANNON.Vec3(ROOM, 4, 0.5)));
      const a = (i * Math.PI) / 2;
      w.position.set(-Math.sin(a) * (ROOM + 0.5), 4, -Math.cos(a) * (ROOM + 0.5));
      w.quaternion.setFromEuler(0, a, 0);
      this.world.addBody(w);
    }
    const tb = new CANNON.Body({ mass: 0, material: this.mats.ground });
    tb.addShape(new CANNON.Box(new CANNON.Vec3(1.2, 0.33, 0.55)));
    tb.position.set(3.6, 0.34, 2.2);
    this.world.addBody(tb);
    // brinquedos: blocos com letras e bolas
    const letters = ['B', 'L', 'O', 'P'];
    const bcols = ['#ff4d5e', '#3d7cf0', '#ffd93d', '#2fbf71'];
    letters.forEach((L, i) => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const x = c.getContext('2d')!;
      x.fillStyle = bcols[i];
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = 'rgba(255,255,255,.9)';
      x.fillRect(8, 8, 112, 112);
      x.fillStyle = bcols[i];
      x.font = '700 92px Fredoka, system-ui, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(L, 64, 70);
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const s = 0.36;
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), M({ map: tx, rough: 0.6 }));
      m.castShadow = m.receiveShadow = this.eng.q.shadows;
      const b = new CANNON.Body({ mass: 1.2, material: this.mats.def });
      b.addShape(new CANNON.Box(new CANNON.Vec3(s / 2, s / 2, s / 2)));
      b.position.set(-2.6 + (i % 2) * 0.4, s / 2 + Math.floor(i / 2) * s, -2.2 + (i % 2) * 0.05);
      b.quaternion.setFromEuler(0, i * 0.2, 0);
      b.allowSleep = true;
      this.addProp(m, b);
    });
    for (let i = 0; i < 2; i++) {
      const r = 0.2;
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 64;
      const x = c.getContext('2d')!;
      for (let k = 0; k < 6; k++) {
        x.fillStyle = ['#ff6fc8', '#ffffff', '#22c3c9', '#ffffff', '#ffd93d', '#ffffff'][k];
        x.fillRect((k * 128) / 6, 0, 128 / 6 + 1, 64);
      }
      const tx = new THREE.CanvasTexture(c);
      tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), M({ map: tx, rough: 0.35 }));
      m.castShadow = this.eng.q.shadows;
      const b = new CANNON.Body({ mass: 0.4, material: this.mats.bouncy });
      b.addShape(new CANNON.Sphere(r));
      b.position.set(2 + i * 0.6, r, -1.5 - i);
      b.linearDamping = 0.15;
      b.angularDamping = 0.3;
      b.allowSleep = true;
      this.addProp(m, b);
    }
  }
  private addProp(m: THREE.Mesh, b: CANNON.Body): void {
    this.scene.add(m);
    this.world.addBody(b);
    const p = { mesh: m, body: b };
    m.userData.prop = p;
    this.props.push(p);
  }

  /* ----------------------------- modos de câmera ----------------------------- */
  setMenuMode(on: boolean): void {
    this.menuMode = on;
    this.hud.classList.toggle('dv-off', on);
    this.ctrl.show(!on && !this.drawOpen);
    this.hand.visible = !on && !this.drawOpen && !this.pilot;
    if (!on) {
      this.camera.position.copy(this.pos);
    }
  }
  private drawOpen = false;
  /** painel de desenho aberto por cima: some o HUD e os controles */
  setDrawing(open: boolean): void {
    this.drawOpen = open;
    this.eng.idle = open;
    this.hud.classList.toggle('dv-off', open || this.menuMode);
    this.ctrl.show(!open && !this.menuMode);
    this.hand.visible = !open && !this.menuMode && !this.pilot;
    if (open) this.release(false);
  }

  /* ----------------------------- criações ----------------------------- */
  maxCreations(): number {
    return Math.max(6, Math.min(18, this.eng.q.maxBodies));
  }

  /** BUM! — a criação nasce na frente da câmera e cresce com elástico */
  spawnBuilt(recipe: Recipe, built: Built | Shared, o: { at?: THREE.Vector3; quat?: THREE.Quaternion; scale?: number; tint?: string; instant?: boolean } = {}): Creation {
    while (this.creations.length >= this.maxCreations()) this.removeCreation(this.creations[0], true);
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const bb = 'refs' in built ? built.built : built;
    const size = Math.max(bb.size.x, bb.size.y, bb.size.z);
    const at = o.at ?? this.camera.position.clone().addScaledVector(fwd, 1.7 + size * 0.6).setY(Math.max(1.0, size * 0.6 + 0.25));
    at.x = Math.max(-ROOM + 0.6, Math.min(ROOM - 0.6, at.x));
    at.z = Math.max(-ROOM + 0.6, Math.min(ROOM - 0.6, at.z));
    const quat = o.quat ?? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const c = new Creation(recipe, built, { world: this.world, scene: this.scene, pos: at, quat, shadows: this.eng.q.shadows, matDef: this.mats.def, matBouncy: this.mats.bouncy, scale: o.scale });
    if (o.tint) c.setTint(o.tint);
    c.onLand = (v) => landFx(this.particles, c.mesh.position.clone().setY(0.05), v);
    this.creations.push(c);
    if (recipe.fly) this.homes.set(c.id, at.clone().setY(Math.max(1.6, at.y + 0.4)));
    if (o.instant) {
      c.spawn();
      c.landed = true;
    } else {
      c.grow = 0;
      this.growing.push({ c, t: 0, dur: 0.75, vel: new THREE.Vector3(0, -0.5, 0), yaw: this.yaw });
      bumParticles(this.particles, at, Math.max(0.6, size), bb.colors);
      this.eng.shake = 0.35;
    }
    return c;
  }

  /** posição na tela (px) de um ponto do mundo */
  screenOf(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.eng.w, (-v.y * 0.5 + 0.5) * this.eng.h];
  }

  removeCreation(c: Creation, poof = true): void {
    if (this.held?.c === c) this.held = null;
    if (this.pilot === c) this.endPilot();
    if (poof) {
      this.particles.burst(c.mesh.position.x, c.mesh.position.y, c.mesh.position.z, 16, 'poof', '#ffffff', 1.4);
      sfx.pop();
    }
    c.remove();
    this.creations = this.creations.filter((x) => x !== c);
    this.growing = this.growing.filter((g) => g.c !== c);
    this.homes.delete(c.id);
  }

  /* ----------------------------- ações ----------------------------- */
  private mainAction(): void {
    if (this.held) {
      this.release(true);
      return;
    }
    const tg = this.target;
    if (!tg) return;
    this.held = tg;
    const b = tg.c ? tg.c.body : tg.p.body;
    this.holdDist = Math.max(1.2, Math.min(2.6, this.camera.position.distanceTo(new THREE.Vector3(b.position.x, b.position.y, b.position.z))));
    if (tg.c) {
      const s = tg.c.built.size;
      this.holdDist = Math.max(this.holdDist, Math.max(s.x, s.y, s.z) * tg.c.scale * 0.7 + 0.7);
    }
    b.wakeUp();
    this.hand.play('grab');
    sfx.pick();
    this.onGrab();
  }
  private release(drop: boolean): void {
    if (!this.held) return;
    this.held = null;
    if (drop) sfx.drop();
  }
  private throwHeld(): void {
    const h = this.held;
    if (!h) return;
    const b = h.c ? h.c.body : h.p.body;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const k = Math.min(12, 30 / Math.sqrt(b.mass + 0.3));
    b.velocity.set(dir.x * k, dir.y * k + 2.2, dir.z * k);
    b.angularVelocity.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    this.held = null;
    this.hand.play('throw');
    sfx.throw();
  }

  private ctx(k: string): void {
    const g = this.held ?? this.target;
    const c = g?.c;
    if (!c) return;
    const b = c.body;
    if (k === 'rot') {
      const q = new CANNON.Quaternion().setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 4);
      b.quaternion.copy(q.mult(b.quaternion));
      b.angularVelocity.setZero();
      b.wakeUp();
      sfx.click();
    } else if (k === 'big' || k === 'small') {
      const s = c.scale * (k === 'big' ? 1.25 : 0.8);
      c.setScale(s);
      if (c.recipe.fly) this.homes.get(c.id)?.setY(Math.max(1.6, (this.homes.get(c.id)?.y ?? 1.6)));
      sfx.boing();
      this.particles.burst(b.position.x, b.position.y, b.position.z, 8, 'spark', '#ffffff', 1);
    } else if (k === 'paint') {
      const i = (TINTS.indexOf(c.tint) + 1) % TINTS.length;
      c.setTint(TINTS[i]);
      sfx.paint();
      this.particles.burst(b.position.x, b.position.y, b.position.z, 12, 'foam', TINTS[i] === '#ffffff' ? '#ffd93d' : TINTS[i], 1.2);
    } else if (k === 'dup') {
      const p = new THREE.Vector3(b.position.x, b.position.y, b.position.z).add(new THREE.Vector3(0.3, 0.6 + c.built.size.y * c.scale, 0.1));
      const d = this.spawnBuilt(c.recipe, c.shared, { at: p, quat: new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w), scale: c.scale, tint: c.tint });
      void d;
      sfx.pop();
    } else if (k === 'save') {
      const it = addToGallery(codeOf(c.recipe.d, c.recipe.mat, c.recipe.vehicle, c.recipe.fly));
      notify(it ? t('dv.saved', 'Salvo na galeria!') : t('dv.savedAlready', 'Já está na galeria'), { icon: 'star', kind: it ? 'good' : 'info' });
      if (it) sfx.sparkle();
    } else if (k === 'del') {
      this.removeCreation(c, true);
      tap('medium');
    } else if (k === 'drive' || k === 'fly') this.startPilot(c);
  }

  startPilot(c: Creation): void {
    this.release(false);
    this.pilot = c;
    c.body.wakeUp();
    this.hand.visible = false;
    this.hud.classList.add('dv-piloting', c.isVehicle ? 'dv-pv' : 'dv-pf');
    notify(c.isVehicle ? t('dv.pilot.drive', 'Joystick para dirigir!') : t('dv.pilot.fly', 'Joystick para voar · setas sobem e descem'), { icon: c.isVehicle ? 'car' : 'rocket' });
    sfx.swish();
  }
  endPilot(): void {
    const c = this.pilot;
    if (!c) return;
    if (c.isVehicle) c.drive(0, 0);
    this.pilot = null;
    this.hud.classList.remove('dv-piloting', 'dv-pv', 'dv-pf');
    this.hand.visible = !this.menuMode && !this.drawOpen;
    // volta a câmera para trás do veículo, olhando para ele
    const p = c.body.position;
    this.pos.set(p.x + Math.sin(this.camYaw) * 2.6, 1.55, p.z + Math.cos(this.camYaw) * 2.6);
    this.clampPos();
    this.yaw = this.camYaw;
    this.pitch = -0.25;
  }
  private camYaw = 0;

  private clampPos(): void {
    this.pos.x = Math.max(-ROOM + 0.4, Math.min(ROOM - 0.4, this.pos.x));
    this.pos.z = Math.max(-ROOM + 0.4, Math.min(ROOM - 0.4, this.pos.z));
  }

  /* ----------------------------- quadro ----------------------------- */
  update(dt: number): void {
    // física (passo fixo)
    this.timeAcc += dt;
    // forças: voadores pairam, veículo pilotado anda
    const g = 9.82;
    const [jx, jy] = this.ctrl.dir();
    for (const c of this.creations) {
      if (!c.spawned) continue;
      if (c.recipe.fly && this.held?.c !== c) {
        const home = this.homes.get(c.id);
        if (!home) continue;
        const b = c.body;
        const tm = performance.now() / 1000 + c.id;
        if (this.pilot === c) {
          const sp = 3.2 * dt;
          const fx = Math.sin(this.camYaw) * -jy + Math.cos(this.camYaw) * jx;
          const fz = Math.cos(this.camYaw) * -jy - Math.sin(this.camYaw) * jx;
          home.x = Math.max(-ROOM + 0.8, Math.min(ROOM - 0.8, home.x + fx * sp));
          home.z = Math.max(-ROOM + 0.8, Math.min(ROOM - 0.8, home.z + fz * sp));
          home.y = Math.max(0.8, Math.min(3.4, home.y + this.flyUp * 1.6 * dt));
        } else {
          home.x += Math.sin(tm * 0.37) * 0.25 * dt;
          home.z += Math.cos(tm * 0.29) * 0.25 * dt;
        }
        const ty = home.y + Math.sin(tm * 2.1) * 0.12;
        const m = b.mass;
        b.applyForce(new CANNON.Vec3((home.x - b.position.x) * m * 6 - b.velocity.x * m * 2.4, m * g + (ty - b.position.y) * m * 14 - b.velocity.y * m * 3.2, (home.z - b.position.z) * m * 6 - b.velocity.z * m * 2.4));
        // fica de pé e encara a direção do voo
        const q = b.quaternion;
        const up = q.vmult(new CANNON.Vec3(0, 1, 0));
        b.angularVelocity.x += up.z * 6 * dt - b.angularVelocity.x * 2.5 * dt;
        b.angularVelocity.z += -up.x * 6 * dt - b.angularVelocity.z * 2.5 * dt;
        b.angularVelocity.y *= 1 - 1.5 * dt;
        b.wakeUp();
      }
      if (c.isVehicle) {
        if (this.pilot === c) c.drive(jy, jx);
      }
    }
    // segurando: mola até o ponto na frente da câmera
    if (this.held) {
      const b = this.held.c ? this.held.c.body : this.held.p.body;
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      const tp = this.camera.position.clone().addScaledVector(dir, this.holdDist);
      tp.y = Math.max(0.25, tp.y);
      const k = 12;
      b.velocity.set((tp.x - b.position.x) * k, (tp.y - b.position.y) * k, (tp.z - b.position.z) * k);
      b.angularVelocity.scale(0.85, b.angularVelocity);
      b.wakeUp();
    }
    this.world.step(1 / 60, dt, 3);
    // BUM: crescer com elástico, depois soltar no mundo
    for (const gr of this.growing) {
      gr.t += dt;
      const k = Math.min(1, gr.t / gr.dur);
      gr.c.grow = k;
      gr.c.body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), gr.yaw + (1 - k) * (1 - k) * 3.2);
      if (k >= 1) gr.c.spawn(gr.vel);
    }
    this.growing = this.growing.filter((g2) => g2.c.grow < 1);
    for (const c of this.creations) {
      const flap = c.recipe.fly && c.spawned ? 1 + Math.sin(performance.now() / 90 + c.id) * 0.05 : 1;
      c.sync(c.spawned ? 1 : Math.max(0.02, elasticOut(c.grow)));
      if (flap !== 1) c.mesh.scale.x *= flap;
      // caiu fora? volta para o meio
      if (c.body.position.y < -4) {
        c.body.position.set(0, 2, 0);
        c.body.velocity.setZero();
      }
    }
    for (const p of this.props) {
      p.mesh.position.set(p.body.position.x, p.body.position.y, p.body.position.z);
      p.mesh.quaternion.set(p.body.quaternion.x, p.body.quaternion.y, p.body.quaternion.z, p.body.quaternion.w);
      if (p.body.position.y < -4) p.body.position.set(0, 2, 0);
    }
    // câmera
    const cam = this.camera;
    if (this.menuMode) {
      this.orbitT += dt * 0.12;
      cam.position.set(Math.sin(this.orbitT) * 3.8, 2.0, Math.cos(this.orbitT) * 3.8);
      cam.lookAt(0, 0.8, -0.3);
    } else if (this.pilot) {
      const c = this.pilot;
      const [ly, lp] = this.ctrl.consumeLook(dt);
      const p = c.body.position;
      if (c.isVehicle) {
        const f = c.body.quaternion.vmult(new CANNON.Vec3(1, 0, 0));
        const want = Math.atan2(-f.x, -f.z);
        let d = want - this.camYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.camYaw += d * Math.min(1, dt * 3) - ly;
      } else this.camYaw -= ly + jx * dt * 0.0;
      this.pitch = Math.max(-0.9, Math.min(0.3, this.pitch - lp));
      const size = Math.max(c.built.size.x, c.built.size.y) * c.scale;
      const dist = 2.4 + size * 1.4;
      const tp = new THREE.Vector3(p.x + Math.sin(this.camYaw) * dist, p.y + 1.0 + size * 0.5, p.z + Math.cos(this.camYaw) * dist);
      tp.x = Math.max(-ROOM + 0.3, Math.min(ROOM - 0.3, tp.x));
      tp.z = Math.max(-ROOM + 0.3, Math.min(ROOM - 0.3, tp.z));
      tp.y = Math.min(3.8, tp.y);
      cam.position.lerp(tp, Math.min(1, dt * 5));
      cam.lookAt(p.x, p.y + 0.2, p.z);
    } else {
      const [ly, lp] = this.ctrl.consumeLook(dt);
      this.yaw -= ly;
      this.pitch = Math.max(-1.3, Math.min(1.2, this.pitch - lp));
      const sp = 3.0;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.pos.x += (fx * jy + -fz * jx) * sp * dt;
      this.pos.z += (fz * jy + fx * jx) * sp * dt;
      this.clampPos();
      cam.position.copy(this.pos);
      cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
      this.camYaw = this.yaw;
      this.hand.update(dt, Math.hypot(jx, jy), ly, lp);
      this.pickTarget();
    }
    this.particles.update(dt, cam.fov, this.eng.h);
  }

  private pickTarget(): void {
    let tg: Grab | null = null;
    if (!this.held && !this.drawOpen) {
      this.ray.setFromCamera(new THREE.Vector2(0, 0), this.camera);
      this.ray.far = 6;
      const objs: THREE.Object3D[] = [];
      for (const c of this.creations) if (c.spawned) objs.push(c.mesh, ...c.wheels.map((w) => w.mesh));
      for (const p of this.props) objs.push(p.mesh);
      const hit = this.ray.intersectObjects(objs, false)[0];
      if (hit) {
        const o = hit.object;
        if (o.userData.creation) tg = { c: o.userData.creation as Creation };
        else if (o.userData.prop) tg = { p: o.userData.prop as Prop };
      }
    }
    this.target = tg;
    const g = this.held ?? tg;
    this.hud.classList.toggle('dv-aim', !!tg);
    this.hud.classList.toggle('dv-holding', !!this.held);
    this.hud.classList.toggle('dv-hasc', !!g?.c);
    this.hud.classList.toggle('dv-isveh', !!g?.c?.isVehicle);
    this.hud.classList.toggle('dv-isfly', !!g?.c?.recipe.fly);
    const main = this.btnMain.el.querySelector('span')!;
    const want = this.held ? t('dv.drop', 'Soltar') : t('dv.grab', 'Pegar');
    if (main.textContent !== want) main.textContent = want;
    this.hand.setPose(this.held ? 'grab' : 'open');
  }

  quality(q: Q3): void {
    this.sun.castShadow = q.shadows;
    this.particles.budget = q.particles;
  }

  /* ----------------------------- guardar / restaurar a sala ----------------------------- */
  saveRoom(): void {
    const s = dvSave();
    s.room = this.creations
      .filter((c) => c.spawned)
      .slice(-10)
      .map((c) => {
        const p = c.body.position;
        const q = c.body.quaternion;
        return { code: codeOf(c.recipe.d, c.recipe.mat, c.recipe.vehicle, c.recipe.fly), p: [+p.x.toFixed(3), +Math.max(0.3, p.y).toFixed(3), +p.z.toFixed(3)], q: [+q.x.toFixed(4), +q.y.toFixed(4), +q.z.toFixed(4), +q.w.toFixed(4)], s: +c.scale.toFixed(3), tint: c.tint };
      });
    persistDv();
  }
  private restoreRoom(): void {
    const items = dvSave().room;
    for (const it of items) {
      const dec = parseShareCode(it.code);
      if (!dec) continue;
      const rec: Recipe = { d: dec.d, mat: dec.mat, vehicle: !!(dec.flags & 1), fly: !!(dec.flags & 2) };
      const r = cook(dec.d, dec.mat, { tier: this.eng.q.tier, map: ATELIER_MAP, vehicle: rec.vehicle });
      if (!r) continue;
      this.spawnBuilt(rec, r.built, { at: new THREE.Vector3(...it.p), quat: new THREE.Quaternion(...it.q), scale: it.s, tint: it.tint, instant: true });
    }
  }

  dispose(): void {
    this.saveRoom();
    for (const c of this.creations) c.remove();
    this.creations = [];
    this.btns.forEach((b) => b.destroy());
    this.btnMain.destroy();
    this.btnThrow.destroy();
    this.ctrl.dispose();
    this.hand.dispose();
    this.particles.dispose();
    this.hud.remove();
    disposeObject(this.scene);
  }
}
