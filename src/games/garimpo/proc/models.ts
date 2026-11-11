/* ============================================================
 *  GARIMPO BRUTO — beneficiamento: modelos 3D.
 *  Calha (sluice) de campo com riffles, tapete e água correndo; peças da lavadora que
 *  aparecem com as melhorias (grelha, calhas extras, mesa vibratória com a linha de ouro,
 *  sala do ouro com balança); tambor d'água; estaca do rejeito; placas (sprites) com
 *  números (recuperação %, gramas no rejeito).
 * ============================================================ */
import * as THREE from 'three';
import { Kit } from '../kit';
import { C, waterTexture } from '../models';

/** água que escorre (textura própria: o deslocamento é desta peça) */
export function runningWater(w: number, l: number): THREE.Mesh {
  const tx = waterTexture().clone();
  tx.needsUpdate = true;
  tx.repeat.set(1, Math.max(1, l / 2.5));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshPhongMaterial({ map: tx, color: 0xa6dcff, transparent: true, opacity: 0.78, shininess: 90, specular: 0xffffff, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

export interface SluiceMesh {
  root: THREE.Group;
  /** parte que inclina (gira em x no pé da cabeça) */
  tilt: THREE.Group;
  water: THREE.Mesh;
  /** concentrado no tapete (escala/opacidade com a carga) */
  conc: THREE.Mesh;
  /** terra na moega */
  heap: THREE.Mesh;
  legs: THREE.Object3D[];
}

/** calha de campo: 3,2 m, cabeça (moega) em z=+1.6, cauda em z=-1.6 */
export function buildSluice(): SluiceMesh {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.set(0, 0.95, 1.6);
  root.add(tilt);
  const k = new Kit({ y: -0.6, k: 0.4 });
  const L = 3.2;
  // fundo e laterais de chapa (metal escovado)
  k.use('shiny').rbox(0.74, 0.05, L, 0.02, C.steel, 0, -0.02, -L / 2);
  k.rbox(0.05, 0.26, L, 0.015, C.steel, 0.37, 0.1, -L / 2);
  k.rbox(0.05, 0.26, L, 0.015, C.steel, -0.37, 0.1, -L / 2);
  k.use('paint');
  // tapete verde (miner's moss) e riffles em degrau
  k.box(0.66, 0.03, L - 0.3, 0x2f6b3a, 0, 0.02, -L / 2 - 0.1);
  k.fine((kk) => {
    for (let i = 0; i < 12; i++) kk.box(0.66, 0.012, 0.04, 0x245a2d, 0, 0.04, -0.35 - i * 0.22);
  });
  for (let i = 0; i < 10; i++) {
    k.use('shiny').box(0.66, 0.07, 0.035, C.steelD, 0, 0.07, -0.45 - i * 0.25, -0.5);
  }
  k.use('paint');
  // moega de madeira na cabeça + defletor
  k.rbox(0.95, 0.06, 0.8, 0.02, C.woodL, 0, 0.32, 0.05, -0.25);
  k.rbox(0.06, 0.35, 0.8, 0.02, C.wood, 0.46, 0.45, 0.05);
  k.rbox(0.06, 0.35, 0.8, 0.02, C.wood, -0.46, 0.45, 0.05);
  k.rbox(0.95, 0.35, 0.06, 0.02, C.wood, 0, 0.45, 0.44);
  // grelha (punching plate) sobre a cabeça
  k.fine((kk) => {
    for (let i = 0; i < 6; i++) kk.box(0.9, 0.02, 0.025, C.dark, 0, 0.36, -0.25 + i * 0.1);
  });
  // alças
  for (const s of [1, -1]) k.box(0.04, 0.04, 0.4, C.yellowD, s * 0.42, 0.18, -L + 0.25);
  tilt.add(k.build());
  // água correndo
  const water = runningWater(0.64, L - 0.2);
  water.position.set(0, 0.075, -L / 2 - 0.05);
  tilt.add(water);
  // concentrado preto/dourado atrás dos riffles
  const conc = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.5), new THREE.MeshLambertMaterial({ color: 0x24201c, transparent: true, opacity: 0, depthWrite: false }));
  conc.rotation.x = -Math.PI / 2;
  conc.position.set(0, 0.06, -1.0);
  conc.renderOrder = 1;
  tilt.add(conc);
  const heap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x7a4a26 }));
  heap.position.set(0, 0.35, 0.05);
  heap.scale.set(1, 0.01, 1);
  tilt.add(heap);
  // pernas (ajustam com a inclinação)
  const legs: THREE.Object3D[] = [];
  const lk = new Kit({ y: 0.3, k: 0.5 });
  lk.box(0.08, 1, 0.08, C.wood, 0, -0.5, 0);
  const lg = lk.build();
  for (const s of [1, -1]) {
    const head = lg.clone();
    head.position.set(s * 0.36, 0.95, 1.5);
    root.add(head);
    const tail = lg.clone();
    tail.position.set(s * 0.36, 0.95, -1.5);
    root.add(tail);
    legs.push(tail);
  }
  root.traverse((o) => (o.castShadow = true));
  return { root, tilt, water, conc, heap, legs };
}

/** tambor d'água (bateia sem rio) */
export function buildBarrel(): THREE.Group {
  const k = new Kit({ y: 0.25, k: 0.4 });
  k.cyl(0.45, 0.42, 1.05, 0x2f7fbf, 0, 0.53, 0, 16);
  for (const y of [0.25, 0.8]) k.cyl(0.47, 0.47, 0.06, 0x24639a, 0, y, 0, 16);
  k.cyl(0.4, 0.4, 0.02, 0x3a8fb0, 0, 1.03, 0, 16);
  // bateia encostada e banquinho
  k.use('shiny').cyl(0.36, 0.08, 0.12, C.steel, 0.62, 0.32, 0.2, 14, 0, 0, 1.2).use('paint');
  k.rbox(0.5, 0.06, 0.4, 0.02, C.woodL, -0.7, 0.36, 0.1);
  for (const [x, z] of [
    [-0.9, -0.05],
    [-0.5, -0.05],
    [-0.9, 0.25],
    [-0.5, 0.25],
  ])
    k.box(0.05, 0.34, 0.05, C.wood, x, 0.17, z);
  const g = k.build();
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/* ---------------- peças da lavadora (no referencial de plant.root) ---------------- */
/** grelha (grizzly) pesada sobre a moega + pedras grandes rejeitadas ao lado */
export function buildGrizzly(): THREE.Group {
  const k = new Kit({ y: 0.4, k: 0.4 });
  k.rbox(4.6, 0.18, 0.2, 0.03, C.yellow, 0, 1.75, 8.0);
  k.rbox(4.6, 0.18, 0.2, 0.03, C.yellow, 0, 2.15, 4.0);
  for (let i = 0; i < 8; i++) k.use('shiny').rbox(0.14, 0.14, 4.3, 0.03, C.steelD, -1.92 + i * 0.55, 1.95, 6.0, 0.1).use('paint');
  // calha de pedras (oversize) e o monte
  k.rbox(1.2, 0.08, 1.6, 0.03, C.steelD, 2.9, 1.2, 7.4, 0, 0, -0.5);
  const g = k.build();
  const rk = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(0.28, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x8f877a, flatShading: true });
  const r = (s: number) => ((Math.sin(s * 91.7) * 43758.5) % 1 + 1) % 1;
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(geo, mat);
    const a = r(i) * Math.PI * 2;
    const d = r(i + 7) * 0.9;
    m.position.set(3.7 + Math.cos(a) * d, 0.15 + r(i + 3) * 0.25 * (1 - d), 7.6 + Math.sin(a) * d);
    m.scale.setScalar(0.6 + r(i + 11) * 0.8);
    m.rotation.set(r(i + 1) * 3, r(i + 2) * 3, 0);
    m.castShadow = true;
    rk.add(m);
  }
  g.add(rk);
  return g;
}

/** duas calhas extras ao lado da calha original (x = -2.55) */
export function buildRuns(): { root: THREE.Group; waters: THREE.Mesh[] } {
  const root = new THREE.Group();
  const waters: THREE.Mesh[] = [];
  for (const x of [-3.85, -5.15]) {
    const k = new Kit({ y: 0.3, k: 0.4 });
    k.use('shiny').rbox(1.25, 0.22, 5.2, 0.03, C.steel, x, 0.75, -0.5, 0.12).use('paint');
    k.box(1.1, 0.04, 5.0, 0x2f5a34, x, 0.85, -0.5, 0.12);
    k.fine((kk) => {
      for (let i = 0; i < 12; i++) kk.box(1.08, 0.06, 0.04, C.dark, x, 0.88 + 0.6 - i * 0.12 * 0.5, 1.6 - i * 0.4);
    });
    for (const z of [-2.6, 1.6]) for (const s of [0.55, -0.55]) k.box(0.1, z > 0 ? 1.2 : 0.6, 0.1, C.yellowD, x + s, z > 0 ? 0.6 : 0.3, z);
    // distribuidor (caixa que divide a água)
    k.rbox(1.3, 0.3, 0.4, 0.03, C.steelD, x, 1.55, 2.2);
    root.add(k.build());
    const w = runningWater(1.0, 5.0);
    w.rotation.x = -Math.PI / 2 + 0.12;
    w.position.set(x, 0.9, -0.5);
    root.add(w);
    waters.push(w);
  }
  // cano distribuidor da calha original até as novas
  const pk = new Kit();
  pk.cylX(0.1, 3.6, C.dark, -3.85, 1.75, 2.3, 8);
  root.add(pk.build());
  root.traverse((o) => (o.castShadow = true));
  return { root, waters };
}

/** mesa vibratória: deque inclinado com a linha de ouro; `deck` sacode */
export function buildShaker(): { root: THREE.Group; deck: THREE.Group; water: THREE.Mesh } {
  const root = new THREE.Group();
  const k = new Kit({ y: 0.3, k: 0.4 });
  // base e motor
  k.rbox(2.6, 0.5, 1.4, 0.05, C.teal, 0, 0.3, 0);
  k.rbox(0.6, 0.45, 0.5, 0.05, C.dark, 1.55, 0.6, 0.2);
  k.cylX(0.18, 0.4, C.steelD, 1.55, 0.6, -0.15, 10);
  root.add(k.build());
  const deck = new THREE.Group();
  deck.position.set(0, 0.85, 0);
  deck.rotation.z = 0.06;
  const dk = new Kit();
  dk.rbox(2.5, 0.08, 1.5, 0.02, 0xe9eef1, 0, 0, 0);
  // estrias (riffles finos em diagonal)
  dk.fine((kk) => {
    for (let i = 0; i < 9; i++) kk.box(2.0 - i * 0.12, 0.02, 0.025, 0xb8c2c8, 0.12 + i * 0.06, 0.05, -0.6 + i * 0.13);
  });
  // a famosa linha de ouro (diagonal) e a faixa de areia preta abaixo
  dk.use('glow').box(1.8, 0.014, 0.09, 0xffd23a, 0.1, 0.062, -0.05, 0, 0.35).use('paint');
  dk.box(1.7, 0.01, 0.16, 0x2a2622, 0.2, 0.055, 0.2, 0, 0.35);
  dk.box(1.7, 0.01, 0.2, 0x9a8a72, 0.3, 0.05, 0.48, 0, 0.32);
  // calha de alimentação e potes
  dk.rbox(0.22, 0.14, 1.5, 0.02, C.steel, -1.3, 0.1, 0);
  deck.add(dk.build());
  const water = runningWater(2.3, 1.3);
  water.position.set(0, 0.066, 0);
  (water.material as THREE.MeshPhongMaterial).opacity = 0.35;
  deck.add(water);
  root.add(deck);
  const pk = new Kit();
  pk.use('shiny').cyl(0.22, 0.2, 0.3, 0xffcf2e, 1.0, 0.15, -1.0, 12).use('paint');
  pk.cyl(0.22, 0.2, 0.3, C.dark, 0.2, 0.15, -1.05, 12);
  root.add(pk.build());
  root.traverse((o) => (o.castShadow = true));
  return { root, deck, water };
}

/** sala do ouro: casinha de alvenaria com porta de ferro, janela e balança na bancada */
export function buildGoldRoom(): THREE.Group {
  const k = new Kit({ y: 0.4, k: 0.3 });
  k.rbox(3.2, 0.2, 3.0, 0.04, C.concrete, 0, 0.1, 0);
  k.rbox(3.0, 2.4, 2.8, 0.05, 0xe7dcc4, 0, 1.3, 0);
  k.rbox(3.5, 0.18, 3.3, 0.05, C.teal, 0, 2.6, 0, 0.06);
  k.rbox(0.95, 1.85, 0.08, 0.03, C.steelD, 0.6, 1.12, 1.42);
  k.fine((kk) => {
    for (let i = 0; i < 5; i++) kk.box(0.06, 1.7, 0.03, C.dark, 0.25 + i * 0.18, 1.12, 1.47);
  });
  k.box(0.9, 0.6, 0.06, C.glassL, -0.75, 1.55, 1.42);
  k.fine((kk) => {
    for (let i = 0; i < 4; i++) kk.box(0.04, 0.6, 0.04, C.dark, -1.1 + i * 0.23, 1.55, 1.46);
  });
  k.decal('gold', 1.0, 0.5, 0, 2.2, 1.45);
  // balança na janela (bancada)
  k.rbox(1.0, 0.08, 0.5, 0.02, C.woodL, -0.75, 1.05, 1.62);
  k.use('shiny').box(0.06, 0.4, 0.06, C.chrome, -0.75, 1.3, 1.62).box(0.6, 0.04, 0.04, C.chrome, -0.75, 1.5, 1.62);
  k.cyl(0.13, 0.1, 0.04, 0xffcf2e, -1.05, 1.35, 1.62, 12).cyl(0.13, 0.1, 0.04, C.chrome, -0.45, 1.38, 1.62, 12).use('paint');
  // luz vermelha de segurança
  k.use('glow').ball(0.09, C.redL, 1.35, 2.4, 1.45).use('paint');
  const g = k.build();
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** estaca do rejeito (bandeirinha cinza) */
export function buildStake(): THREE.Group {
  const k = new Kit();
  k.box(0.08, 1.6, 0.08, C.wood, 0, 0.8, 0);
  k.box(0.6, 0.4, 0.03, 0x9a9488, 0.32, 1.35, 0);
  k.box(0.6, 0.08, 0.035, C.yellow, 0.32, 1.2, 0);
  return k.build();
}

/** placa flutuante com ícone + texto (canvas → sprite); redesenha só quando o texto muda */
export class Badge {
  readonly sprite: THREE.Sprite;
  private cv = document.createElement('canvas');
  private tex: THREE.CanvasTexture;
  private key = '';
  constructor(
    private kind: 'gold' | 'tail',
    w = 1.6,
  ) {
    this.cv.width = 256;
    this.cv.height = 96;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.sprite.scale.set(w, w * 0.375, 1);
    this.sprite.renderOrder = 15;
  }
  set(text: string): void {
    if (text === this.key) return;
    this.key = text;
    const x = this.cv.getContext('2d')!;
    x.clearRect(0, 0, 256, 96);
    x.font = '800 46px Fredoka, system-ui, sans-serif';
    const tw = Math.min(170, x.measureText(text).width);
    const W = tw + 96;
    const x0 = 128 - W / 2;
    x.fillStyle = this.kind === 'gold' ? 'rgba(40,24,6,.82)' : 'rgba(40,40,40,.78)';
    x.beginPath();
    x.roundRect(x0, 10, W, 76, 38);
    x.fill();
    x.lineWidth = 5;
    x.strokeStyle = this.kind === 'gold' ? '#ffcf2e' : '#c9c3b6';
    x.stroke();
    // ícone
    const ix = x0 + 40;
    if (this.kind === 'gold') {
      x.fillStyle = '#ffcf2e';
      x.strokeStyle = '#9a6400';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(ix - 22, 64);
      x.lineTo(ix - 14, 34);
      x.lineTo(ix + 14, 34);
      x.lineTo(ix + 22, 64);
      x.closePath();
      x.fill();
      x.stroke();
    } else {
      x.fillStyle = '#9a9488';
      x.strokeStyle = '#fff';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(ix - 24, 66);
      x.quadraticCurveTo(ix, 18, ix + 24, 66);
      x.closePath();
      x.fill();
      x.stroke();
      x.fillStyle = '#ffcf2e';
      x.beginPath();
      x.arc(ix + 6, 54, 5, 0, Math.PI * 2);
      x.fill();
    }
    x.fillStyle = '#fff';
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    x.fillText(text, x0 + 72, 50, 170);
    this.tex.needsUpdate = true;
  }
  dispose(): void {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
