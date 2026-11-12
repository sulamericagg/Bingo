/* ============================================================
 *  NOITES DO ACAMPAMENTO — ABERTURA (≈43 s, "Pular" sempre visível; base: src/3d/cine).
 *  Toca na primeira partida nova (sozinho) e pode ser revista pelo menu (playIntro).
 *   1. Fim de tarde dourado: o ônibus amarelo da colônia de férias pela estrada entre
 *      morros e árvores; notinhas musicais saem das janelas (todo mundo cantando).
 *   2. Bem pertinho das janelas: o SEU Bloop de papel e os amigos pulando e cantando.
 *   3. Entardecer: o ônibus chega na clareira da floresta (barracas, troncos, fogueira apagada);
 *      a turma desce pulando. A monitora espera com uma tocha.
 *   4. A monitora acende a fogueira (labaredas, faíscas, luz quente): "Não deixe o fogo apagar!"
 *   5. Noite: estrelas, a turma em volta do fogo; a câmera vai devagar até as árvores
 *      escuras... olhinhos brilhando piscam (as Sombrinhas, fofas-assustadoras).
 *   6. O Bloop ergue a lanterna: os olhinhos se escondem (elas têm medo da luz!).
 *   7. Grua subindo da fogueira até o céu estrelado com a lua → título.
 *  Tudo procedural (árvores do módulo de natureza, modelos do jogo), qualidade por nível.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { detectInitialTier } from '../../../core/quality';
import { music } from '../../../audio';
import { MODES } from '../../../audio/music/player';
import { sfx } from '../../../3d/common/sfx';
import { natureMat, natureTick } from '../../../3d/nature';
import { mySpec, npcSpec, PaperChar } from '../../../3d/paper';
import { Cine, bump, clamp, ease, ease5, glowTex, lerp, registerTheme, seg, TAU, type Stage3D } from '../../../3d/cine';
import { G, PB, fireBaseGeo, shadowBodyGeo, treeGeo, vcMat } from '../models';
import type { TK } from '../world';
import { ic as nIc } from '../icons';

registerTheme({
  id: 'noitesIntro',
  name: 'Noites — Abertura (a viagem)',
  bpm: 100,
  root: 62,
  mode: MODES.major,
  prog: [0, 4, 5, 3],
  seed: 7071,
  db: 0.4,
  parts: [
    { role: 'pad', inst: 'padWarm', vol: 0.7, len: 16, st: { calm: 1, tension: 0.4, victory: 1 } },
    { role: 'arp', inst: 'guitar', vol: 0.8, pat: 'x.x.x.x.x.x.x.x.', order: [0, 1, 2, 1], st: { calm: 1, victory: 1 } },
    { role: 'lead', inst: 'flute', vol: 0.75, oct: 1, dens: 0.45, st: { calm: 1, victory: 1 } },
    { role: 'bass', inst: 'roundBass', vol: 0.8, pat: 'x.......x.......', st: { calm: 1, tension: 0.6, victory: 1 } },
    { role: 'perc', inst: 'clap', vol: 0.5, pat: '....x.......x...', st: { calm: 1, victory: 1 } },
    { role: 'perc', inst: 'shaker', vol: 0.5, pat: '..x...x...x...x.', st: { calm: 0.8, victory: 1 } },
    { role: 'drone', inst: 'padDark', vol: 0.8, len: 32, st: { tension: 1 } },
    { role: 'arp', inst: 'kalimba', vol: 0.6, pat: 'x.....x.....x...', order: [0, 2, 1], st: { tension: 1 } },
    { role: 'perc', inst: 'lowTom', vol: 0.45, pat: 'x.......x.......', st: { tension: 1 } },
    { role: 'pad', inst: 'choir', vol: 0.55, len: 16, st: { victory: 1 } },
    { role: 'bell', inst: 'musicbox', vol: 0.5, oct: 2, len: 2, st: { victory: 1 } },
  ],
});

/* ------------------------------ roteiro (s) ------------------------------ */
const T_WIN = 6.5;
const T_ARRIVE = 12;
const T_LIGHT = 19;
const T_NIGHT = 25.5;
const T_LAMP = 31.5;
const T_UP = 35;
const T_TITLE = 37.2;
const T_END = 43;
/** ônibus: estrada em x, para em x = STOP */
const STOP = 44;
const CAMP = new THREE.Vector3(52, 0, -11);

const ic = (n: string, c = '') => nIc(n, 28, c);
const SUBS = [
  { t: 0.8, end: T_WIN - 0.2, icons: [ic('sun'), ic('car')], text: () => t('noites.i.s1', 'Férias! O ônibus da colônia vai pela estrada...') },
  { t: T_WIN + 0.3, end: T_ARRIVE - 0.2, icons: [ic('people'), ic('heart')], text: () => t('noites.i.s2', '...e a turma toda vai cantando: lá vem o acampamento!') },
  { t: T_ARRIVE + 1.2, end: T_LIGHT - 0.2, icons: [ic('tent'), ic('moon')], text: () => t('noites.i.s3', 'Chegamos! A floresta fica linda ao entardecer.') },
  { t: T_LIGHT + 1.4, end: T_NIGHT - 0.2, icons: [ic('fire'), ic('timer')], text: () => t('noites.i.s4', 'Monitora: "Esta é a nossa fogueira. Não deixe o fogo apagar!"') },
  { t: T_NIGHT + 1.6, end: T_LAMP - 0.1, icons: [ic('moon'), ic('shadow', '#5a3a9a')], text: () => t('noites.i.s5', 'Mas, à noite... tem olhinhos espiando entre as árvores!') },
  { t: T_LAMP + 0.2, end: T_TITLE + 1.2, icons: [ic('lantern'), ic('shadow', '#5a3a9a')], text: () => t('noites.i.s6', 'As Sombrinhas têm medo da luz! Fique pertinho do fogo.') },
];

/* ------------------------------ modelos ------------------------------ */
function busModel(): { g: THREE.Group; wheels: THREE.Mesh[]; seats: THREE.Vector3[]; head: THREE.Mesh } {
  const g = new THREE.Group();
  const Y = '#ffc21a';
  const b = new PB();
  // carroceria: parte de baixo, colunas entre as janelas, teto arredondado
  b.add(G.box, Y, 0, 0.95, 0, 6.2, 1.1, 2.3);
  b.add(G.box, '#1a1a22', 0, 1.42, 0, 6.24, 0.08, 2.34);
  b.add(G.box, '#1a1a22', 0, 0.72, 0, 6.24, 0.06, 2.34);
  for (let i = 0; i <= 5; i++) b.add(G.box, Y, -2.9 + i * 1.16, 1.95, 0, 0.18, 1.0, 2.3);
  b.add(G.box, Y, 0, 2.5, 0, 6.2, 0.14, 2.3);
  b.add(G.cyl12, Y, 0, 2.55, 0, 2.3, 6.2, 0.5, 0, 0, Math.PI / 2);
  b.add(G.box, '#f4f4f0', 0, 2.82, 0, 5.4, 0.08, 1.6);
  // frente (capô) e para-choques
  b.add(G.box, Y, 3.75, 0.85, 0, 1.3, 0.9, 2.2);
  b.add(G.box, '#2a2a30', 4.45, 0.45, 0, 0.16, 0.3, 2.3);
  b.add(G.box, '#2a2a30', -3.15, 0.45, 0, 0.16, 0.3, 2.3);
  b.add(G.box, '#dfe4ec', 4.42, 0.9, 0, 0.06, 0.4, 1.5);
  // placa de PARE e espelhos
  b.add(G.cyl12, '#e83a3a', -1.6, 1.15, 1.22, 0.42, 0.04, 0.42, Math.PI / 2, 0, 0);
  b.add(G.box, '#2a2a30', 3.3, 1.9, 1.3, 0.06, 0.4, 0.22);
  b.add(G.box, '#2a2a30', 3.3, 1.9, -1.3, 0.06, 0.4, 0.22);
  // bandeirinha da colônia no teto
  b.add(G.cyl, '#8a8a90', -2.6, 3.3, 0, 0.04, 1.2, 0.04);
  b.add(G.box, '#3fae5a', -2.95, 3.65, 0, 0.7, 0.4, 0.03);
  const body = new THREE.Mesh(b.geo(), vcMat());
  g.add(body);
  // vidros (sem tampar a turma)
  const glass = new THREE.MeshBasicMaterial({ color: '#bfe6ff', transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const gl = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.92, 2.28), glass);
  gl.position.set(0, 1.95, 0);
  g.add(gl);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.9), glass);
  ws.position.set(3.1, 1.9, 0);
  ws.rotation.y = Math.PI / 2;
  g.add(ws);
  // faróis
  const head = new THREE.Mesh(new PB().add(G.sph, '#fff6c0', 4.5, 0.85, 0.75, 0.22, 0.22, 0.1).add(G.sph, '#fff6c0', 4.5, 0.85, -0.75, 0.22, 0.22, 0.1).geo(), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  g.add(head);
  // rodas
  const wg = new PB().add(G.cyl12, '#1c1c22', 0, 0, 0, 0.9, 0.36, 0.9, Math.PI / 2).add(G.cyl12, '#b8bcc8', 0, 0, 0, 0.42, 0.38, 0.42, Math.PI / 2).geo();
  const wm = vcMat();
  const wheels: THREE.Mesh[] = [];
  for (const [x, z] of [
    [2.9, 1.05],
    [2.9, -1.05],
    [-1.9, 1.05],
    [-1.9, -1.05],
  ]) {
    const w = new THREE.Mesh(wg, wm);
    w.position.set(x, 0.45, z);
    g.add(w);
    wheels.push(w);
  }
  // assentos da turma (janela do lado da câmera, +z)
  const seats = [-2.3, -1.15, 0, 1.15, 2.2].map((x) => new THREE.Vector3(x, 1.1, 0.55));
  return { g, wheels, seats, head };
}
function tentGeo(col: string, col2: string): THREE.BufferGeometry {
  const s = new THREE.Shape([new THREE.Vector2(-1.1, 0), new THREE.Vector2(1.1, 0), new THREE.Vector2(0, 1.5)]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 2, bevelEnabled: false });
  g.translate(0, 0, -1);
  const b = new PB().add(g, col, 0, 0, 0, 1, 1, 1);
  b.add(G.box, col2, 0, 0.55, 1.01, 0.7, 1.0, 0.02);
  b.add(G.cyl, '#6a3f22', 0, 0.85, 1.1, 0.05, 1.8, 0.05);
  g.dispose();
  return b.geo();
}
function logSeatGeo(): THREE.BufferGeometry {
  return new PB().add(G.cyl12, '#7a4a2a', 0, 0.28, 0, 0.56, 2.0, 0.56, 0, 0, Math.PI / 2).add(G.cyl12, '#f3d9a8', 1.0, 0.28, 0, 0.5, 0.02, 0.5, 0, 0, Math.PI / 2).add(G.cyl12, '#f3d9a8', -1.0, 0.28, 0, 0.5, 0.02, 0.5, 0, 0, Math.PI / 2).geo();
}
function hillsGeo(): THREE.BufferGeometry {
  const b = new PB();
  let s = 3;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + r() * 0.2;
    const d = 150 + r() * 60;
    const w = 40 + r() * 40;
    b.add(G.sph, i % 3 ? '#4f8a4a' : '#3f7a48', Math.cos(a) * d, -6, Math.sin(a) * d, w, 22 + r() * 30, w * 0.8, 0, a, 0, 0.5);
  }
  return b.geo();
}
function noteTex(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.strokeStyle = '#2a0b5c';
  x.lineWidth = 4;
  x.font = '900 52px sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.strokeText('♪', 32, 34);
  x.fillText('♪', 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** paletas do céu e da luz */
const LOOK = {
  gold: { top: '#5a9ae0', bot: '#ffd8a0', sun: '#ffd8a0', sunI: 1.9, hemi: '#ffe8c8', hemiI: 1.25, fog: '#f2c890' },
  dusk: { top: '#3a2a7a', bot: '#ff8a62', sun: '#ff9a60', sunI: 1.0, hemi: '#d8a0c0', hemiI: 0.85, fog: '#a86a7a' },
  night: { top: '#070b26', bot: '#1c2458', sun: '#8aa0ff', sunI: 0.32, hemi: '#5a6ac0', hemiI: 0.42, fog: '#141a40' },
};
type Look = (typeof LOOK)['gold'];
const _a = new THREE.Color();
const _b = new THREE.Color();
const mixC = (out: THREE.Color, a: string, b: string, k: number) => out.copy(_a.set(a)).lerp(_b.set(b), k);

class NoitesIntro {
  private c: Cine;
  private tier: number;
  private st: Stage3D;
  private hemi = new THREE.HemisphereLight('#ffe8c8', '#3a5a2a', 1.2);
  private sun = new THREE.DirectionalLight('#ffd8a0', 1.8);
  private fireL = new THREE.PointLight('#ff9a40', 0, 26, 1.3);
  private lampL = new THREE.PointLight('#fff2c0', 0, 9, 1.4);
  private skyU = { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(1, 0.1, 0).normalize() }, sunC: { value: new THREE.Color() } };
  private stars: THREE.Points;
  private moon: THREE.Mesh;
  private bus: ReturnType<typeof busModel>;
  private kids: PaperChar[] = [];
  private hero: PaperChar;
  private boss: PaperChar;
  private flames: THREE.Mesh[] = [];
  private embers: THREE.Sprite[] = [];
  private notes: THREE.Sprite[] = [];
  private glowT: THREE.CanvasTexture;
  private noteT: THREE.CanvasTexture;
  private fireGlow: THREE.Sprite;
  private shadows: { g: THREE.Group; eyes: THREE.Mesh[]; p: THREE.Vector3; ph: number }[] = [];
  private fireflies: THREE.Points | null = null;
  private beam: THREE.Mesh;
  private cues = new Set<string>();

  constructor(root: HTMLElement) {
    this.tier = detectInitialTier();
    this.c = new Cine({
      id: 'noites',
      root,
      duration: T_END,
      music: 'noitesIntro',
      subs: SUBS,
      vignette: 'rgba(30,10,40,.5)',
      grade: 'saturate(1.12) contrast(1.05)',
      iconBg: '#fff1d6',
      title: {
        at: T_TITLE,
        text: () => t('noites.name', 'Noites do Acampamento').toUpperCase(),
        tagline: () => t('noites.i.tag', 'Junte lenha, cuide da turma e mantenha o fogo aceso!'),
        colors: ['#fff6c0', '#ffc84a', '#ff7a1a', '#3a1250'],
        top: '14%',
      },
    });
    const st = this.c.stage3d(this.tier, { fov: 50, far: 600 });
    this.st = st;
    const S = st.scene;
    S.fog = new THREE.Fog('#f2c890', 40, 230);
    S.add(this.hemi, this.sun, this.sun.target, this.fireL, this.lampL);
    // céu
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 24, 14),
      new THREE.ShaderMaterial({
        uniforms: this.skyU,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader:
          'uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunC; varying vec3 vD; void main(){ float h = vD.y; vec3 c = mix(bot, top, smoothstep(-0.05, 0.55, h)); float s = max(dot(vD, normalize(sunDir)), 0.0); c += sunC * (pow(s, 40.0) * 0.9 + pow(s, 5.0) * 0.25); gl_FragColor = vec4(c, 1.0); }',
      }),
    );
    sky.renderOrder = -10;
    sky.name = 'sky';
    S.add(sky);
    const sp: number[] = [];
    const NS = [250, 400, 600, 800][this.tier] ?? 400;
    for (let i = 0; i < NS; i++) {
      const a = Math.random() * TAU;
      const e = 0.08 + Math.random() * 1.4;
      sp.push(Math.cos(a) * Math.cos(e) * 380, Math.sin(e) * 380, Math.sin(a) * Math.cos(e) * 380);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#fff8e0', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    S.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ color: '#f4f2ff', fog: false, transparent: true, opacity: 0 }));
    S.add(this.moon);
    // chão: grama com estrada de terra e a clareira
    const gg = new THREE.PlaneGeometry(500, 500, 100, 100).rotateX(-Math.PI / 2);
    const pa = gg.getAttribute('position');
    const col: number[] = [];
    const cg = new THREE.Color();
    for (let i = 0; i < pa.count; i++) {
      const x = pa.getX(i);
      const z = pa.getZ(i);
      const road = Math.abs(z) < 3.2 && x < STOP + 6 ? 1 : 0;
      const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
      const clear = dc < 9 ? 1 - dc / 9 : 0;
      const n = Math.sin(x * 0.31) * Math.sin(z * 0.27) * 0.5 + Math.sin(x * 0.07 + z * 0.11) * 0.5;
      cg.set(n > 0.2 ? '#5aa04a' : '#4a9040').lerp(_a.set('#b08a5a'), Math.max(road * 0.9, clear * 0.85));
      col.push(cg.r, cg.g, cg.b);
      pa.setY(i, Math.max(0, Math.hypot(x, z) - 120) * 0.08);
    }
    gg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    gg.computeVertexNormals();
    S.add(new THREE.Mesh(gg, vcMat()));
    S.add(new THREE.Mesh(hillsGeo(), vcMat()));
    // árvores (instâncias): ao longo da estrada e em volta da clareira
    const tm = natureMat({ amp: 0.004, y0: 1, rustle: 0.03, wrap: 0.45 });
    const per: THREE.Matrix4[][] = [[], [], [], []];
    let s = 11;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const NT = [140, 220, 320, 420][this.tier] ?? 220;
    const q = new THREE.Quaternion();
    for (let i = 0; i < NT * 3 && per.reduce((a, l) => a + l.length, 0) < NT; i++) {
      const x = -90 + r() * 180;
      const z = -70 + r() * 140;
      if (Math.abs(z) < 6.5 && x < STOP + 8) continue;
      const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
      if (dc < 12.5) continue;
      if (Math.hypot(x - STOP, z) < 9) continue;
      const near = dc < 30;
      const k = near ? (r() < 0.6 ? 1 : r() < 0.5 ? 2 : 0) : r() < 0.45 ? 0 : r() < 0.5 ? 1 : 3;
      const sc = 0.85 + r() * 0.6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * TAU);
      per[k].push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc * (0.9 + r() * 0.3), sc)));
    }
    per.forEach((list, k) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(treeGeo(k as TK, this.tier === 0 ? 1 : 0), tm, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.frustumCulled = false;
      S.add(im);
    });
    // acampamento
    const fire = new THREE.Mesh(fireBaseGeo(true, false), vcMat());
    fire.position.copy(CAMP);
    S.add(fire);
    const fm = ['#ff5a1a', '#ffb030', '#fff3a0'].map((c, i) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: [0.85, 0.9, 0.95][i], blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 8), fm[i]);
      f.visible = false;
      S.add(f);
      this.flames.push(f);
    }
    this.glowT = glowTex();
    this.fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowT, color: '#ff9a40', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.fireGlow.position.copy(CAMP).setY(1.2);
    this.fireGlow.scale.setScalar(9);
    S.add(this.fireGlow);
    const NE = [10, 16, 26, 34][this.tier] ?? 16;
    for (let i = 0; i < NE; i++) {
      const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowT, color: '#ffc060', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      e.userData.ph = Math.random();
      e.userData.a = Math.random() * TAU;
      S.add(e);
      this.embers.push(e);
    }
    const tents: [number, number, number, string, string][] = [
      [-6.5, -3.5, 0.9, '#ff6a8a', '#ffd34a'],
      [-2.5, -7, 0.2, '#4aa8ff', '#ffffff'],
      [4.8, -6, -0.5, '#ffb02e', '#7a3a10'],
      [7, 1.5, -1.2, '#7ad86a', '#2a6a2a'],
    ];
    for (const [x, z, ry, a, b] of tents) {
      const m = new THREE.Mesh(tentGeo(a, b), vcMat());
      m.position.set(CAMP.x + x, 0, CAMP.z + z);
      m.rotation.y = ry + Math.atan2(-x, -z);
      S.add(m);
    }
    for (let i = 0; i < 3; i++) {
      const a = 0.6 + i * 1.9;
      const m = new THREE.Mesh(logSeatGeo(), vcMat());
      m.position.set(CAMP.x + Math.cos(a) * 3.1, 0, CAMP.z + Math.sin(a) * 3.1);
      m.rotation.y = -a + Math.PI / 2;
      S.add(m);
    }
    // ônibus
    this.bus = busModel();
    S.add(this.bus.g);
    // turma (o SEU Bloop + amigos) e a monitora
    this.hero = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    S.add(this.hero.root);
    const friends: [string, string, Record<string, string>][] = [
      ['#8ad8ff', '#3a8aff', { head: 'h_beanie', eyes: 'e_big' }],
      ['#ffb0d8', '#ff5aa8', { head: 'h_bow', face: 'f_freckles' }],
      ['#ffd34a', '#ff8a3a', { head: 'h_cap', eyes: 'e_star' }],
      ['#9ae07a', '#3aa84a', { head: 'h_cat', mouth: 'mo_cat' }],
    ];
    for (const [a, b, p] of friends) {
      const ch = new PaperChar(npcSpec(a, b, p), { radius: 0.38, cell: 96, shadow: true });
      S.add(ch.root);
      this.kids.push(ch);
    }
    this.boss = new PaperChar(npcSpec('#3fae5a', '#ffd34a', { head: 'h_cap', mouth: 'mo_grin', back: 'k_backpack', face: 'f_glasses' }), { radius: 0.55, cell: 128, shadow: true });
    this.boss.setTool('torch', '#ffb040');
    S.add(this.boss.root);
    // notinhas
    this.noteT = noteTex();
    const NN = [6, 8, 12, 14][this.tier] ?? 8;
    for (let i = 0; i < NN; i++) {
      const n = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.noteT, color: ['#ffffff', '#ffe066', '#ff9ad8', '#9ae8ff'][i % 4], transparent: true, opacity: 0, depthWrite: false }));
      n.userData = { ph: i / NN, seat: i % 5 };
      S.add(n);
      this.notes.push(n);
    }
    // Sombrinhas: corpo escuro + olhos que brilham, atrás das árvores
    const body = shadowBodyGeo(false);
    const bm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.85 });
    const em = new THREE.MeshBasicMaterial({ color: '#fff27a', fog: false });
    const pm = new THREE.MeshBasicMaterial({ color: '#1a0a2a', fog: false });
    const eyeG = new THREE.SphereGeometry(0.14, 10, 8);
    const spots: [number, number, number][] = [
      [-0.35, 14.5, 0.35],
      [0.15, 15.5, 0.6],
      [0.55, 14, 0.15],
    ];
    for (const [ang, R, hy] of spots) {
      const g = new THREE.Group();
      const bmesh = new THREE.Mesh(body, bm);
      bmesh.scale.setScalar(0.9);
      g.add(bmesh);
      const eyes: THREE.Mesh[] = [];
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(eyeG, em);
        e.position.set(sx * 0.17, 0.62, 0.42);
        e.scale.set(1, 1.25, 0.6);
        const p = new THREE.Mesh(eyeG, pm);
        p.scale.setScalar(0.45);
        p.position.set(0, -0.02, 0.09);
        e.add(p);
        g.add(e);
        eyes.push(e);
      }
      const base = Math.atan2(CAMP.z - 30, CAMP.x - 30);
      const a = base + ang;
      const p = new THREE.Vector3(CAMP.x + Math.cos(a) * R, hy, CAMP.z + Math.sin(a) * R);
      g.position.copy(p);
      g.lookAt(CAMP.x, hy, CAMP.z);
      g.visible = false;
      S.add(g);
      this.shadows.push({ g, eyes, p, ph: ang * 3 });
    }
    // vaga-lumes (noite)
    if (this.tier >= 1) {
      const n = [0, 30, 50, 70][this.tier];
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const an = Math.random() * TAU;
        const rr = 6 + Math.random() * 14;
        a.set([CAMP.x + Math.cos(an) * rr, 0.6 + Math.random() * 2.5, CAMP.z + Math.sin(an) * rr], i * 3);
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.fireflies = new THREE.Points(fg, new THREE.PointsMaterial({ color: '#d8ff7a', size: 3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
      S.add(this.fireflies);
    }
    this.beam = new THREE.Mesh(
      new THREE.ConeGeometry(1, 1, 18, 1, true).translate(0, -0.5, 0).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff6c0', transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    );
    this.beam.visible = false;
    S.add(this.beam);
    this.c.onFrame = (tt, dt) => this.frame(tt, dt);
    this.c.onDispose = () => this.dispose();
    if (location.search.includes('debug')) (window as unknown as { __intro: unknown }).__intro = this;
  }

  play(): Promise<void> {
    return this.c.play();
  }
  private cue(id: string, fn: () => void): void {
    if (this.cues.has(id)) return;
    this.cues.add(id);
    fn();
  }
  /** x do ônibus no tempo tt (freia até parar em STOP) */
  private busX(tt: number): number {
    const v = 7.5;
    const tb = T_ARRIVE + 1.6;
    if (tt < tb - 2) return STOP - v * (tb - 1 - tt);
    const k = clamp((tt - (tb - 2)) / 2);
    return STOP - v * 1 + v * (k - (k * k) / 2) * 2;
  }

  private frame(tt: number, dt: number): void {
    const st = this.st;
    const cam = st.cam;
    natureTick(dt);
    // ---------------- luz / céu ----------------
    const kDusk = ease(seg(tt, T_ARRIVE - 2, T_LIGHT + 2));
    const kNight = ease(seg(tt, T_LIGHT + 2, T_NIGHT + 1.5));
    const L1: Look = LOOK.gold;
    const L2: Look = LOOK.dusk;
    const L3: Look = LOOK.night;
    const pick = (k: keyof Look) => (kNight > 0 ? [L2[k], L3[k], kNight] : [L1[k], L2[k], kDusk]) as [string, string, number];
    const mc = (key: keyof Look, out: THREE.Color) => {
      const [a, b, k] = pick(key);
      return mixC(out, a, b, k);
    };
    mc('top', this.skyU.top.value);
    mc('bot', this.skyU.bot.value);
    mc('sun', this.skyU.sunC.value).multiplyScalar(1 - kNight);
    mc('sun', this.sun.color);
    mc('hemi', this.hemi.color);
    const fog = st.scene.fog as THREE.Fog;
    mc('fog', fog.color);
    fog.near = lerp(40, 25, kNight);
    fog.far = lerp(230, 110, kNight);
    st.r.setClearColor(fog.color);
    const num = (k: 'sunI' | 'hemiI') => (kNight > 0 ? lerp(L2[k], L3[k], kNight) : lerp(L1[k], L2[k], kDusk));
    this.sun.intensity = num('sunI');
    this.hemi.intensity = num('hemiI');
    this.hemi.groundColor.set(kNight > 0.5 ? '#141a30' : '#3a5a2a');
    // sol baixo no oeste (+x) descendo; lua no leste
    const sunA = lerp(0.2, -0.06, kDusk);
    this.skyU.sunDir.value.set(Math.cos(sunA) * 0.9, Math.sin(sunA), -0.42).normalize();
    this.sun.position.set(cam.position.x + 60, 40 * Math.max(0.15, Math.sin(sunA) + 0.25), cam.position.z - 30);
    this.sun.target.position.copy(cam.position).setY(0);
    (this.stars.material as THREE.PointsMaterial).opacity = kNight;
    this.stars.position.copy(cam.position);
    this.moon.position.set(cam.position.x + 190, cam.position.y + 130, cam.position.z - 150);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = kNight;
    // ---------------- ônibus ----------------
    const bx = this.busX(tt);
    const moving = tt < T_ARRIVE + 1.5;
    const bounce = moving ? Math.abs(Math.sin(tt * 7)) * 0.04 : 0;
    this.bus.g.position.set(bx, bounce, 0);
    this.bus.g.rotation.z = moving ? Math.sin(tt * 3.3) * 0.012 : 0;
    const spd = moving ? 7.5 * (1 - seg(tt, T_ARRIVE - 0.4, T_ARRIVE + 1.6)) : 0;
    for (const w of this.bus.wheels) w.rotation.z -= (spd * dt) / 0.45;
    this.bus.g.updateMatrixWorld();
    // ---------------- turma ----------------
    const out = tt >= T_ARRIVE + 2;
    const kids = [this.hero, ...this.kids];
    // lugares em volta do fogo (na noite: de frente para o fogo)
    const ring = (i: number, R = 3.0) => {
      const a = Math.PI + 0.35 + i * 0.6;
      return new THREE.Vector3(CAMP.x + Math.cos(a) * R, 0, CAMP.z + Math.sin(a) * R);
    };
    const door = new THREE.Vector3(1.8, 0, -1.6).applyMatrix4(this.bus.g.matrixWorld).setY(0);
    kids.forEach((ch, i) => {
      const p = new THREE.Vector3();
      let yaw = Math.PI / 2;
      let speed = 0;
      let happy = false;
      let act = -1;
      if (!out) {
        // na janela: pulando e cantando
        p.copy(this.bus.seats[i]).applyMatrix4(this.bus.g.matrixWorld);
        p.y += Math.abs(Math.sin(tt * 6 + i * 1.7)) * 0.16;
        yaw = 0.25 * Math.sin(tt * 2 + i);
        happy = true;
      } else {
        // descem um atrás do outro e correm até os troncos
        const t0 = T_ARRIVE + 2 + i * 0.55;
        const k = seg(tt, t0, t0 + 3.2);
        const goal = ring(i);
        if (tt < t0) p.copy(this.bus.seats[i]).applyMatrix4(this.bus.g.matrixWorld);
        else {
          p.copy(door).lerp(goal, ease(k));
          if (k < 0.15) p.y += bump(k / 0.15) * 0.5;
          speed = k < 1 ? 3 : 0;
          yaw = Math.atan2(goal.x - door.x, goal.z - door.z);
        }
        if (k >= 1) {
          yaw = Math.atan2(CAMP.x - p.x, CAMP.z - p.z);
          happy = tt > T_LIGHT + 0.6 && tt < T_NIGHT;
          if (happy) p.y += Math.abs(Math.sin(tt * 5 + i)) * 0.12;
        }
        // o herói pega a lanterna e mostra para as árvores
        if (i === 0 && tt >= T_LAMP - 1.4) {
          // dá uns passos para as árvores e ergue a lanterna
          const s1 = this.shadows[1].p;
          const d = new THREE.Vector3(s1.x - p.x, 0, s1.z - p.z).normalize();
          const kw = seg(tt, T_LAMP - 1.4, T_LAMP - 0.2);
          p.addScaledVector(d, ease(kw) * 3.4);
          speed = kw < 1 ? 2 : 0;
          yaw = Math.atan2(d.x, d.z);
          act = -1;
          happy = tt > T_LAMP + 1.6;
        }
      }
      ch.root.position.copy(p);
      ch.update(dt, cam, { yaw, speed, act, happy });
    });
    this.hero.setTool(tt >= T_LAMP - 0.4 ? 'lamp' : null, '#ffe680');
    // monitora: espera na clareira com a tocha; acende o fogo
    const bp = new THREE.Vector3(CAMP.x - 1.3, 0, CAMP.z + 1.7);
    let bAct = -1;
    if (tt >= T_LIGHT && tt < T_LIGHT + 0.7) bAct = (tt - T_LIGHT) / 0.7;
    this.boss.root.position.copy(bp);
    this.boss.update(dt, cam, { yaw: tt < T_LIGHT + 0.8 ? Math.atan2(CAMP.x - bp.x, CAMP.z - bp.z) : Math.atan2(cam.position.x - bp.x, cam.position.z - bp.z), speed: 0, act: bAct, happy: tt > T_LIGHT + 1 && tt < T_NIGHT });
    // ---------------- fogo ----------------
    const lit = ease(seg(tt, T_LIGHT + 0.5, T_LIGHT + 1.6));
    const fs = lit * (1 + bump(seg(tt, T_LIGHT + 0.5, T_LIGHT + 1.4)) * 0.6);
    this.flames.forEach((f, i) => {
      f.visible = lit > 0.01;
      const w = [1, 0.7, 0.4][i];
      const h = [1.8, 1.4, 0.9][i] * Math.pow(Math.max(0.001, fs), 0.65) * (1 + Math.sin(tt * (9 + i * 3) + i) * 0.12);
      f.scale.set(w * fs, h, w * fs);
      f.position.set(CAMP.x + Math.sin(tt * 3 + i) * 0.05, h / 2 + 0.15, CAMP.z + Math.cos(tt * 2.6 + i) * 0.05);
      f.rotation.y = tt * (0.6 + i * 0.4);
    });
    const flick = 1 + Math.sin(tt * 13) * 0.08 + Math.sin(tt * 7.3) * 0.06;
    this.fireL.position.copy(CAMP).setY(1.6);
    this.fireL.intensity = lit * (2.2 + kNight * 2.5) * flick;
    (this.fireGlow.material as THREE.SpriteMaterial).opacity = lit * (0.25 + kNight * 0.45) * flick;
    for (const e of this.embers) {
      const u = (e.userData.ph + tt * 0.45) % 1;
      e.position.set(CAMP.x + Math.cos(e.userData.a + u * 3) * (0.2 + u * 0.6), 0.6 + u * 4.5, CAMP.z + Math.sin(e.userData.a + u * 3) * (0.2 + u * 0.6));
      e.scale.setScalar(0.18 * (1 - u) + 0.04);
      (e.material as THREE.SpriteMaterial).opacity = lit * (1 - u) * 0.95;
    }
    if (tt >= T_LIGHT + 0.5) this.cue('whoosh', () => {
      sfx.ignite();
      sfx.fire();
      this.c.flash(0.25, '#ffb060');
    });
    // ---------------- lanterna e Sombrinhas ----------------
    const lampOn = tt >= T_LAMP;
    this.lampL.intensity = lampOn ? 2.4 : 0;
    // feixe da lanterna (cone aditivo) apontando para as árvores
    this.beam.visible = lampOn && tt < T_UP;
    if (this.beam.visible) {
      const from = this.hero.root.position.clone().add(new THREE.Vector3(0, 0.75, 0));
      const to = this.shadows[1].p.clone().setY(0.6);
      this.beam.position.copy(from);
      this.beam.lookAt(to);
      const len = Math.min(9, from.distanceTo(to));
      const k = ease(seg(tt, T_LAMP, T_LAMP + 0.3));
      this.beam.scale.set(1.5 * k, 1.5 * k, len);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 * k * (0.9 + Math.sin(tt * 20) * 0.1);
    }
    this.lampL.position.copy(this.hero.root.position).add(new THREE.Vector3(0, 1, 0)).lerp(this.shadows[1].p, 0.25);
    this.shadows.forEach((sh, i) => {
      const t0 = T_NIGHT + 2.6 + i * 0.7;
      sh.g.visible = tt >= t0 - 0.3 && tt < T_LAMP + 2.4;
      if (!sh.g.visible) return;
      // espiam de trás da árvore (um passo de lado) e piscam
      const peek = ease(seg(tt, t0, t0 + 0.8)) * (1 - ease(seg(tt, T_LAMP + 0.2 + i * 0.15, T_LAMP + 0.9 + i * 0.15)));
      const side = new THREE.Vector3(Math.sin(sh.ph), 0, Math.cos(sh.ph)).multiplyScalar((1 - peek) * 0.9);
      sh.g.position.copy(sh.p).add(side);
      sh.g.position.y = sh.p.y + Math.sin(tt * 2 + i) * 0.08 - (1 - peek) * 0.4;
      const blink = (tt * 0.9 + i * 0.37) % 1 > 0.94 ? 0.15 : 1;
      const surprised = tt >= T_LAMP ? 1.35 : 1;
      for (const e of sh.eyes) e.scale.set(surprised, 1.25 * blink * peek * surprised + 0.001, 0.6);
    });
    if (tt >= T_NIGHT + 2.6) this.cue('eyes', () => music.setState('tension'));
    if (tt >= T_LAMP) this.cue('lamp', () => sfx.click());
    if (tt >= T_LAMP + 0.6) this.cue('poof', () => {
      music.setState('calm');
      sfx.poof();
    });
    if (tt >= T_TITLE - 0.4) this.cue('vic', () => music.setState('victory'));
    // vaga-lumes
    if (this.fireflies) {
      (this.fireflies.material as THREE.PointsMaterial).opacity = kNight * (0.6 + Math.sin(tt * 3) * 0.3);
      this.fireflies.rotation.y = Math.sin(tt * 0.1) * 0.05;
    }
    // notinhas saindo das janelas
    this.notes.forEach((n, i) => {
      const on = tt < T_ARRIVE + 1.5;
      const u = (n.userData.ph + tt * 0.5) % 1;
      const seat = this.bus.seats[n.userData.seat].clone().applyMatrix4(this.bus.g.matrixWorld);
      n.position.set(seat.x - u * 1.6 + Math.sin(tt * 4 + i) * 0.15, seat.y + 1.0 + u * 1.3, seat.z + 1.0 + u * 0.5);
      n.scale.setScalar(0.5 + bump(u) * 0.2);
      (n.material as THREE.SpriteMaterial).opacity = on ? bump(u) : 0;
    });
    // ---------------- câmera (planos) ----------------
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (tt < T_WIN) {
      // 1. travelling lateral do ônibus na estrada, câmera alta descendo
      const k = ease5(seg(tt, 0, T_WIN));
      pos.set(bx + lerp(14, 3, k), lerp(9, 2.6, k), lerp(20, 10.5, k));
      look.set(bx + lerp(-4, 0.5, k), lerp(0, 1.6, k), 0);
    } else if (tt < T_ARRIVE) {
      // 2. pertinho das janelas (a turma cantando)
      const k = ease(seg(tt, T_WIN, T_ARRIVE));
      pos.set(bx + lerp(-2.2, 1.6, k), 2.2, 4.1);
      look.set(bx + lerp(-1.4, 0.4, k), 1.95, 0.4);
    } else if (tt < T_LIGHT) {
      // 3. chegada: plano aberto da clareira, a turma descendo
      const k = ease(seg(tt, T_ARRIVE, T_LIGHT));
      pos.set(lerp(35, 41, k), lerp(7, 3.2, k), lerp(-17, -17.5, k));
      look.set(lerp(46, 51, k), lerp(1.2, 1, k), lerp(-3, -9.5, k));
    } else if (tt < T_NIGHT) {
      // 4. a monitora acende o fogo (meio plano baixo)
      const k = ease(seg(tt, T_LIGHT, T_NIGHT));
      const bpp = this.boss.root.position;
      pos.set(CAMP.x + lerp(2.4, 3.2, k), lerp(1.4, 1.9, k), CAMP.z + lerp(5.4, 6.6, k));
      look.set(lerp(bpp.x + 0.3, CAMP.x, k), lerp(1.1, 1.0, k), lerp(bpp.z - 0.3, CAMP.z - 0.6, k));
    } else if (tt < T_LAMP) {
      // 5. noite: por trás da turma, avançando devagar para as árvores escuras
      const k = ease(seg(tt, T_NIGHT, T_LAMP));
      const s1 = this.shadows[1].p;
      const dir = new THREE.Vector3(s1.x - CAMP.x, 0, s1.z - CAMP.z).normalize();
      pos.copy(CAMP).addScaledVector(dir, lerp(-6, 4.5, k)).add(new THREE.Vector3(-dir.z * 2.6, 0, dir.x * 2.6));
      pos.y = lerp(2.6, 1.4, k);
      look.copy(CAMP).addScaledVector(dir, lerp(6, 14, k));
      look.y = lerp(0.8, 0.9, k);
    } else if (tt < T_UP) {
      // 6. o Bloop com a lanterna, de frente; as Sombrinhas fogem lá atrás
      const k = ease(seg(tt, T_LAMP, T_UP));
      const hp = this.hero.root.position;
      const s1 = this.shadows[1].p;
      const dir = new THREE.Vector3(s1.x - hp.x, 0, s1.z - hp.z).normalize();
      const side = new THREE.Vector3(dir.z, 0, -dir.x);
      pos.copy(hp).addScaledVector(dir, -lerp(2.3, 2.7, k)).addScaledVector(side, 0.7);
      pos.y = lerp(1.75, 1.9, k);
      look.copy(hp).addScaledVector(dir, 7);
      look.y = 0.1;
    } else {
      // 7. grua: da fogueira até o céu estrelado
      const k = ease5(seg(tt, T_UP, T_END - 0.4));
      pos.set(CAMP.x - lerp(5, 14, k), lerp(2, 7.5, k), CAMP.z + lerp(5, 14, k));
      look.set(CAMP.x + lerp(0, 2, k), lerp(1, 5.5, k), CAMP.z + lerp(0, -2, k));
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.rotation.z += Math.sin(tt * 0.8) * 0.004;
    st.render();
  }

  private dispose(): void {
    this.hero.dispose();
    this.boss.dispose();
    for (const k of this.kids) k.dispose();
    this.glowT.dispose();
    this.noteT.dispose();
  }
}

/** toca a abertura por cima de `root` (resolve no fim, ao Pular ou no voltar) */
export function playIntro(root: HTMLElement): Promise<void> {
  return new NoitesIntro(root).play();
}
