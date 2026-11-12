/* ============================================================
 *  CAVA & FALA — ABERTURA (≈41 s, "Pular" sempre visível; base: src/3d/cine).
 *  Toca na primeira partida (sozinho) e pode ser revista pelo menu (playIntro).
 *   1. Um livro de histórias antigo, aberto na mesa sob a luz do abajur. A página está viva:
 *      uma vilinha feliz (casinhas, flores, Bloops dançando)... uma tempestade de areia e lama
 *      vem rolando e cobre tudo; sobram as dunas e a pontinha de um cata-vento.
 *   2. A câmera mergulha na página (clarão) → o mundo de verdade: um morro de terra em blocos
 *      ao amanhecer, com um telhado e um cata-vento aparecendo.
 *   3. O SEU Bloop de papel chega pulando com uma pá e um megafone.
 *   4. Cava, cava: os blocos pulam fora e a casinha aparece.
 *   5. Ele grita no megafone "TRAMPOLIM!" — ondas de som, confete, e a engenhoca se monta
 *      peça por peça (modelo do próprio jogo); o Bloop pula nela, altíssimo.
 *   6. Os moradores saem da casinha comemorando; grua revela mais telhados enterrados → título.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { detectInitialTier } from '../../../core/quality';
import { music, play } from '../../../audio';
import { MODES } from '../../../audio/music/player';
import { sfx } from '../../../3d/common/sfx';
import { icon } from '../../../ui/icons';
import { mySpec, PaperChar } from '../../../3d/paper';
import { Cine, bump, clamp, ease, ease5, easeBack, easeOut, glowTex, lerp, registerTheme, seg, TAU, type Stage3D } from '../../../3d/cine';
import { BloopModel } from '../bloop';
import { buildModel, gadgetById, noMods, type Built } from '../gadgets';

registerTheme({
  id: 'cavafalaIntro',
  name: 'Cava & Fala — Abertura (a vila soterrada)',
  bpm: 92,
  root: 60,
  mode: MODES.major,
  prog: [0, 5, 3, 4],
  seed: 8181,
  db: 0.4,
  parts: [
    { role: 'pad', inst: 'strings', vol: 0.65, len: 16, st: { calm: 1, tension: 1, victory: 1 } },
    { role: 'arp', inst: 'harp', vol: 0.75, oct: 0, pat: 'x.x.x.x.x.x.x.x.', order: [0, 1, 2, 3, 2, 1], st: { calm: 1, victory: 1 } },
    { role: 'lead', inst: 'musicbox', vol: 0.7, oct: 1, dens: 0.35, st: { calm: 1, victory: 0.7 } },
    { role: 'bass', inst: 'roundBass', vol: 0.75, pat: 'x.......x...o...', st: { calm: 0.8, tension: 1, victory: 1 } },
    { role: 'perc', inst: 'lowTom', vol: 0.6, pat: 'x..x..x.x..x..x.', st: { tension: 1 } },
    { role: 'drone', inst: 'padDark', vol: 0.7, len: 16, st: { tension: 1 } },
    { role: 'lead', inst: 'brass', vol: 0.6, oct: 0, dens: 0.4, st: { victory: 1 } },
    { role: 'perc', inst: 'clap', vol: 0.6, pat: '....x.......x...', st: { victory: 1 } },
    { role: 'perc', inst: 'shaker', vol: 0.5, pat: '..x...x...x...x.', st: { victory: 1 } },
    { role: 'bell', inst: 'bell', vol: 0.45, oct: 2, len: 4, st: { victory: 1 } },
  ],
});

/* ------------------------------ roteiro (s) ------------------------------ */
const T_STORM = 4.6;
const T_BURIED = 9.4;
const T_DIVE = 12.2;
const T_WORLD = 13.4;
const T_DIG = 19;
const T_SHOUT = 25.6;
const T_BUILD = 26.6;
const T_JUMP = 29.6;
const T_FOLK = 33;
const T_TITLE = 35.6;
const T_END = 41.5;

const svgI = (b: string) => `<svg viewBox="0 0 48 48" width="100%" height="100%" aria-hidden="true">${b}</svg>`;
const BOOK = svgI('<path d="M6 10c7-3 13-2 18 2 5-4 11-5 18-2v28c-7-3-13-2-18 2-5-4-11-5-18-2z" fill="#ff8a6a" stroke="#4a2410" stroke-width="3" stroke-linejoin="round"/><path d="M24 12v28" stroke="#4a2410" stroke-width="3"/><path d="M10 16c4-1 7-1 10 1M10 22c4-1 7-1 10 1M28 17c3-2 6-2 10-1M28 23c3-2 6-2 10-1" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>');
const SAND = svgI('<path d="M4 34c8-6 14 2 22-4s14-2 18-6v16H4z" fill="#e8b860" stroke="#6a3a10" stroke-width="3" stroke-linejoin="round"/><path d="M8 14c6-4 12 0 18-3M12 22c6-3 10 0 16-2M30 10c4-2 8 0 12-2" stroke="#a8743a" stroke-width="3" stroke-linecap="round" fill="none"/>');
const SHOVEL = svgI('<path d="M30 6l12 12-4 4-12-12z" fill="#8a5a2a" stroke="#3a2010" stroke-width="2.6"/><path d="M27 15l6 6-12 12c-4 4-11 6-14 3s-1-10 3-14z" fill="#b8c0d0" stroke="#3a3a4a" stroke-width="3" stroke-linejoin="round"/>');
const HOUSE = svgI('<path d="M8 24L24 10l16 14" fill="#e8504a" stroke="#5a1a10" stroke-width="3" stroke-linejoin="round"/><rect x="12" y="23" width="24" height="17" rx="2" fill="#ffe0b0" stroke="#5a2a10" stroke-width="3"/><rect x="20" y="29" width="8" height="11" fill="#8a5a2a"/>');
const ic = (h: string) => `<span style="display:block;width:28px;height:28px">${h}</span>`;
const ui = (n: Parameters<typeof icon>[0]) => icon(n, { size: 28 });
const SUBS = [
  { t: 0.8, end: T_STORM, icons: [ic(BOOK), ic(HOUSE)], text: () => t('cavafala.i.s1', 'Era uma vez uma vilinha muito, muito feliz...') },
  { t: T_STORM + 0.3, end: T_BURIED, icons: [ic(SAND)], text: () => t('cavafala.i.s2', 'Até que uma tempestade de areia e lama cobriu tudo!') },
  { t: T_BURIED + 0.2, end: T_WORLD, icons: [ic(HOUSE), ic(SAND)], text: () => t('cavafala.i.s3', 'A vila ficou escondida debaixo da terra por muito tempo...') },
  { t: T_WORLD + 1.4, end: T_DIG - 0.1, icons: [ic(SHOVEL), ui('megaphone')], text: () => t('cavafala.i.s4', 'Até hoje! Chega um Bloop com uma pá... e um megafone mágico.') },
  { t: T_DIG + 0.3, end: T_SHOUT - 0.1, icons: [ic(SHOVEL), ic(HOUSE)], text: () => t('cavafala.i.s5', 'Cava, cava, cava... olha! Uma casinha!') },
  { t: T_SHOUT, end: T_BUILD + 1.1, icons: [ui('megaphone')], text: () => t('cavafala.i.shout', 'TRAMPOLIM!') },
  { t: T_BUILD + 1.2, end: T_FOLK - 0.1, icons: [ui('mic'), ui('sparkle')], text: () => t('cavafala.i.s6', 'É só FALAR o que você quer criar... e a engenhoca aparece!') },
  { t: T_FOLK + 0.2, end: T_TITLE + 1.8, icons: [ui('heart'), ic(HOUSE)], text: () => t('cavafala.i.s7', 'Desenterre a vila e devolva a alegria aos moradores!') },
];

/* ------------------------------ página viva do livro ------------------------------ */
const PW = 1024;
const PH = 512;
function drawPage(x: CanvasRenderingContext2D, tt: number): void {
  const storm = ease(seg(tt, T_STORM, T_STORM + 2.6));
  const bury = ease(seg(tt, T_STORM + 1.2, T_BURIED));
  // papel
  const pg = x.createLinearGradient(0, 0, PW, 0);
  pg.addColorStop(0, '#e8d4a8');
  pg.addColorStop(0.47, '#fbf0d4');
  pg.addColorStop(0.5, '#d8c090');
  pg.addColorStop(0.53, '#fbf0d4');
  pg.addColorStop(1, '#e8d4a8');
  x.fillStyle = pg;
  x.fillRect(0, 0, PW, PH);
  // moldura da ilustração (aquarela)
  const L = 46;
  const T = 56;
  const W = PW - 92;
  const H = PH - 112;
  x.save();
  x.beginPath();
  x.roundRect(L, T, W, H, 18);
  x.clip();
  // céu: azul → amarelado da tempestade
  const sky = x.createLinearGradient(0, T, 0, T + H);
  sky.addColorStop(0, mixHex('#7ac8ff', '#c8964a', storm));
  sky.addColorStop(1, mixHex('#e8f6ff', '#e8c070', storm));
  x.fillStyle = sky;
  x.fillRect(L, T, W, H);
  // sol
  x.globalAlpha = 1 - storm * 0.8;
  x.fillStyle = '#ffd34a';
  x.beginPath();
  x.arc(L + W * 0.82, T + 70, 34, 0, TAU);
  x.fill();
  x.strokeStyle = '#ffd34a';
  x.lineWidth = 5;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + tt * 0.4;
    x.beginPath();
    x.moveTo(L + W * 0.82 + Math.cos(a) * 44, T + 70 + Math.sin(a) * 44);
    x.lineTo(L + W * 0.82 + Math.cos(a) * 56, T + 70 + Math.sin(a) * 56);
    x.stroke();
  }
  x.globalAlpha = 1;
  // morros verdes
  const gy = T + H * 0.72;
  x.fillStyle = mixHex('#7ad06a', '#b89a5a', storm * 0.8);
  x.beginPath();
  x.moveTo(L, gy + 20);
  for (let i = 0; i <= 20; i++) x.lineTo(L + (W * i) / 20, gy + Math.sin(i * 0.9) * 10);
  x.lineTo(L + W, T + H);
  x.lineTo(L, T + H);
  x.fill();
  // casinhas
  const houses: [number, string, string][] = [
    [0.12, '#ffb0c8', '#e8504a'],
    [0.27, '#ffe08a', '#3a7bd5'],
    [0.43, '#b0e8ff', '#e8504a'],
    [0.62, '#d8f0a0', '#a05aff'],
    [0.77, '#ffd0a0', '#3aa86a'],
  ];
  for (const [fx, wall, roof] of houses) {
    const hx = L + W * fx;
    const hy = gy + Math.sin(fx * 18) * 6;
    x.fillStyle = wall;
    x.strokeStyle = '#4a2a10';
    x.lineWidth = 4;
    x.beginPath();
    x.rect(hx - 34, hy - 56, 68, 56);
    x.fill();
    x.stroke();
    x.fillStyle = roof;
    x.beginPath();
    x.moveTo(hx - 44, hy - 54);
    x.lineTo(hx, hy - 96);
    x.lineTo(hx + 44, hy - 54);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = '#8a5a2a';
    x.fillRect(hx - 9, hy - 26, 18, 26);
    x.fillStyle = '#7ad8ff';
    x.fillRect(hx + 12, hy - 44, 14, 14);
  }
  // flores
  for (let i = 0; i < 18; i++) {
    const fx = L + 20 + ((i * 53) % (W - 40));
    const fy = gy + 22 + ((i * 29) % 50);
    x.fillStyle = ['#ff5a8a', '#ffd34a', '#ffffff', '#b05aff'][i % 4];
    x.beginPath();
    x.arc(fx, fy, 6, 0, TAU);
    x.fill();
  }
  // Bloops dançando (somem quando a areia chega)
  const dance = 1 - storm;
  if (dance > 0.02) {
    x.globalAlpha = dance;
    const cols = ['#ff7ac8', '#5ec8ff', '#ffd34a', '#7ad86a', '#b07aff', '#ff9a4a'];
    for (let i = 0; i < 6; i++) {
      const bx = L + W * (0.18 + i * 0.13);
      const by = gy + 52 - Math.abs(Math.sin(tt * 4 + i)) * 22;
      x.fillStyle = cols[i];
      x.strokeStyle = '#3a1a40';
      x.lineWidth = 3;
      x.beginPath();
      x.ellipse(bx, by, 22, 20, 0, 0, TAU);
      x.fill();
      x.stroke();
      x.fillStyle = '#fff';
      x.beginPath();
      x.arc(bx - 7, by - 4, 5, 0, TAU);
      x.arc(bx + 7, by - 4, 5, 0, TAU);
      x.fill();
      x.fillStyle = '#222';
      x.beginPath();
      x.arc(bx - 6, by - 3, 2.4, 0, TAU);
      x.arc(bx + 8, by - 3, 2.4, 0, TAU);
      x.fill();
      x.strokeStyle = '#3a1a40';
      x.beginPath();
      x.arc(bx, by + 4, 6, 0.2, Math.PI - 0.2);
      x.stroke();
    }
    // notinhas
    x.fillStyle = '#5a3a8a';
    x.font = '700 30px sans-serif';
    for (let i = 0; i < 4; i++) x.fillText('♪', L + W * (0.22 + i * 0.18) + Math.sin(tt * 2 + i) * 8, gy - 4 - ((tt * 30 + i * 25) % 70));
    x.globalAlpha = 1;
  }
  // tempestade: nuvem de areia girando que entra pela esquerda
  if (storm > 0) {
    const front = L - 300 + (W + 600) * ease(seg(tt, T_STORM, T_BURIED - 0.6));
    for (let i = 0; i < 26; i++) {
      const a = tt * (1.5 + (i % 4) * 0.4) + i;
      const cx = front - (i % 7) * 70 + Math.cos(a) * 26;
      const cy = T + 60 + ((i * 37) % (H - 80)) + Math.sin(a) * 18;
      x.fillStyle = `rgba(${170 + (i % 3) * 20},${120 + (i % 4) * 14},${60 + (i % 2) * 20},${0.55 * storm})`;
      x.beginPath();
      x.arc(cx, cy, 34 + (i % 5) * 10, 0, TAU);
      x.fill();
    }
    // redemoinhos (traços)
    x.strokeStyle = `rgba(120,70,30,${0.5 * storm})`;
    x.lineWidth = 4;
    for (let i = 0; i < 8; i++) {
      const cx = front - i * 90;
      const cy = T + 90 + ((i * 61) % (H - 140));
      x.beginPath();
      x.arc(cx, cy, 22 + (i % 3) * 8, tt * 3 + i, tt * 3 + i + 4.2);
      x.stroke();
    }
  }
  // duna subindo e cobrindo a vila (sobra um cata-vento)
  if (bury > 0) {
    const top = lerp(T + H + 10, gy - 70, bury);
    x.fillStyle = '#e0b060';
    x.strokeStyle = '#8a5a20';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(L, T + H);
    for (let i = 0; i <= 24; i++) x.lineTo(L + (W * i) / 24, top + Math.sin(i * 0.7 + 1) * 22 + Math.sin(i * 2.1) * 6);
    x.lineTo(L + W, T + H);
    x.closePath();
    x.fill();
    x.stroke();
    x.fillStyle = 'rgba(160,100,40,.35)';
    for (let i = 0; i < 12; i++) {
      x.beginPath();
      x.ellipse(L + 60 + i * 80, top + 40 + (i % 3) * 30, 30, 6, 0, 0, TAU);
      x.fill();
    }
    // cata-vento e pontinha de telhado
    const vx = L + W * 0.43;
    const vy = top + Math.sin(0.43 * 24 * 0.7 + 1) * 22 - 4;
    x.fillStyle = '#e8504a';
    x.beginPath();
    x.moveTo(vx - 18, vy + 6);
    x.lineTo(vx, vy - 14);
    x.lineTo(vx + 18, vy + 6);
    x.fill();
    x.strokeStyle = '#4a2a10';
    x.beginPath();
    x.moveTo(vx, vy - 14);
    x.lineTo(vx, vy - 46);
    x.stroke();
    x.save();
    x.translate(vx, vy - 46);
    x.rotate(tt * 2);
    x.fillStyle = '#ffd34a';
    for (let i = 0; i < 4; i++) {
      x.rotate(Math.PI / 2);
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(16, -6);
      x.lineTo(16, 6);
      x.fill();
    }
    x.restore();
  }
  x.restore();
  // título da história
  x.fillStyle = '#6a3a14';
  x.font = `700 30px Fredoka, 'Comic Sans MS', cursive`;
  x.textAlign = 'center';
  x.fillText(t('cavafala.i.book', 'A Vila Soterrada'), PW * 0.25, 40);
  x.font = `600 24px Fredoka, 'Comic Sans MS', cursive`;
  x.fillText('~ ✦ ~', PW * 0.75, 40);
  // sombra da dobra do meio
  const cg = x.createLinearGradient(PW / 2 - 40, 0, PW / 2 + 40, 0);
  cg.addColorStop(0, 'rgba(90,60,20,0)');
  cg.addColorStop(0.5, 'rgba(90,60,20,.35)');
  cg.addColorStop(1, 'rgba(90,60,20,0)');
  x.fillStyle = cg;
  x.fillRect(PW / 2 - 40, 0, 80, PH);
}
const _ca = new THREE.Color();
const _cb = new THREE.Color();
function mixHex(a: string, b: string, k: number): string {
  return '#' + _ca.set(a).lerp(_cb.set(b), clamp(k)).getHexString();
}

/* ------------------------------ modelos 3D ------------------------------ */
function houseModel(): THREE.Group {
  const g = new THREE.Group();
  const m = (c: string) => new THREE.MeshLambertMaterial({ color: c });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 2.4, 3), m('#ffe0b0'));
  walls.position.y = 1.2;
  g.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.5, 1.6, 4), m('#e8504a'));
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.06), m('#8a5a2a'));
  door.position.set(0, 0.7, 1.52);
  g.add(door);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.06), m('#7ad8ff'));
    w.position.set(s * 0.95, 1.55, 1.52);
    g.add(w);
  }
  const ch = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), m('#b0603a'));
  ch.position.set(0.7, 3.4, -0.5);
  g.add(ch);
  // cata-vento
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 6), m('#4a2a10'));
  pole.position.y = 4.4;
  g.add(pole);
  const vane = new THREE.Group();
  vane.position.y = 5.0;
  vane.name = 'vane';
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.16), m('#ffd34a'));
    b.position.x = 0.25;
    const p = new THREE.Group();
    p.rotation.y = (i * Math.PI) / 2;
    p.add(b);
    vane.add(p);
  }
  g.add(vane);
  return g;
}
function megaphoneModel(): THREE.Group {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.07, 0.42, 14, 1, true), new THREE.MeshLambertMaterial({ color: '#ff4f6a', side: THREE.DoubleSide, emissive: new THREE.Color('#401020') }));
  cone.rotation.z = -Math.PI / 2;
  g.add(cone);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 16), new THREE.MeshLambertMaterial({ color: '#ffd34a' }));
  rim.rotation.y = Math.PI / 2;
  rim.position.x = 0.21;
  g.add(rim);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), new THREE.MeshLambertMaterial({ color: '#3a2a5a' }));
  h.position.set(-0.08, -0.12, 0);
  g.add(h);
  return g;
}

/** blocos do chão (instâncias): terreno em degraus + o morro em cima da casinha */
interface Blocks {
  mesh: THREE.InstancedMesh;
  /** índices dos blocos que cobrem a casinha (ordem de escavação: de cima para baixo) */
  dig: { i: number; m: THREE.Matrix4; at: number }[];
}
const PIT = { x0: -2, x1: 2, z0: -2, z1: 2, y0: -4, y1: 0 };

class CavaIntro {
  private c: Cine;
  private tier: number;
  private st: Stage3D;
  private hemi = new THREE.HemisphereLight('#ffe8d0', '#7a5a3a', 1.3);
  private sun = new THREE.DirectionalLight('#ffd8a8', 1.8);
  private lampL = new THREE.PointLight('#ffc070', 30, 12, 1.5);
  private book = new THREE.Group();
  private pageCv: HTMLCanvasElement;
  private pageX: CanvasRenderingContext2D;
  private pageT: THREE.CanvasTexture;
  private pageEvery: number;
  private pageLast = -1;
  private world = new THREE.Group();
  private blocks: Blocks;
  private house: THREE.Group;
  private hero: PaperChar;
  private mega: THREE.Group;
  private gadget: Built;
  private folk: BloopModel[] = [];
  private bits: { m: THREE.Mesh; v: THREE.Vector3; t0: number }[] = [];
  private bitI = 0;
  private rings: THREE.Mesh[] = [];
  private confetti: THREE.Points;
  private confV: Float32Array;
  private glowT: THREE.CanvasTexture;
  private cues = new Set<string>();
  private nextDig = 0;

  constructor(root: HTMLElement) {
    this.tier = detectInitialTier();
    this.pageEvery = this.tier <= 1 ? 1 / 12 : 1 / 24;
    this.c = new Cine({
      id: 'cavafala',
      root,
      duration: T_END,
      music: 'cavafalaIntro',
      subs: SUBS,
      vignette: 'rgba(60,30,10,.45)',
      grade: 'saturate(1.12) contrast(1.04)',
      iconBg: '#fff3d6',
      title: {
        at: T_TITLE,
        text: () => t('cavafala.name', 'Cava & Fala').toUpperCase(),
        tagline: () => t('cavafala.i.tag', 'Cave, fale e salve a vila!'),
        colors: ['#fffbe0', '#ffd34a', '#ff8a3a', '#5a2a10'],
        top: '12%',
      },
    });
    const st = this.c.stage3d(this.tier, { fov: 46, far: 400 });
    this.st = st;
    const S = st.scene;
    S.fog = new THREE.Fog('#ffd8b0', 40, 160);
    S.add(this.hemi, this.sun, this.sun.target, this.lampL);
    this.glowT = glowTex();
    /* ---------------- o livro na mesa ---------------- */
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 10).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: '#7a4a2a' }),
    );
    this.book.add(table);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.24, 3.6), new THREE.MeshLambertMaterial({ color: '#8a2a3a' }));
    cover.position.y = 0.12;
    this.book.add(cover);
    const block = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.18, 3.4), new THREE.MeshLambertMaterial({ color: '#f4e4c0' }));
    block.position.y = 0.3;
    this.book.add(block);
    this.pageCv = document.createElement('canvas');
    this.pageCv.width = this.tier <= 1 ? 768 : PW;
    this.pageCv.height = this.tier <= 1 ? 384 : PH;
    this.pageX = this.pageCv.getContext('2d')!;
    if (this.tier <= 1) this.pageX.scale(768 / PW, 384 / PH);
    this.pageT = new THREE.CanvasTexture(this.pageCv);
    this.pageT.colorSpace = THREE.SRGBColorSpace;
    this.pageT.anisotropy = 4;
    // páginas levemente curvas (como um livro aberto)
    const pg = new THREE.PlaneGeometry(6.2, 3.3, 32, 1).rotateX(-Math.PI / 2);
    const pp = pg.getAttribute('position');
    for (let i = 0; i < pp.count; i++) {
      const u = Math.abs(pp.getX(i)) / 3.1;
      pp.setY(i, 0.42 + Math.sin(u * Math.PI) * 0.12 - (u < 0.04 ? 0.06 : 0));
    }
    pg.computeVertexNormals();
    this.book.add(new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ map: this.pageT, emissive: new THREE.Color('#ffffff'), emissiveMap: this.pageT, emissiveIntensity: 0.25 })));
    // abajur, xícara e lápis
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.6, 14), new THREE.MeshLambertMaterial({ color: '#5ec8ff' }));
    cup.position.set(4.4, 0.3, 1.3);
    this.book.add(cup);
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), new THREE.MeshLambertMaterial({ color: '#ffd34a' }));
    pencil.rotation.set(0, 0.6, Math.PI / 2);
    pencil.position.set(-4.2, 0.07, 1.6);
    this.book.add(pencil);
    this.book.position.set(0, -200, 0);
    S.add(this.book);
    this.lampL.position.set(-3, -200 + 4.5, -2);
    /* ---------------- o mundo de verdade ---------------- */
    S.add(this.world);
    this.blocks = this.buildBlocks();
    this.world.add(this.blocks.mesh);
    this.house = houseModel();
    this.house.position.set(0, PIT.y0, 0);
    this.world.add(this.house);
    // outros telhados ainda enterrados nas dunas (para a grua do final)
    for (const [x, z, c] of [
      [-11, -7, '#3a7bd5'],
      [9, -10, '#a05aff'],
      [-6, -14, '#3aa86a'],
      [13, -2, '#ff8a3a'],
    ] as [number, number, string][]) {
      const r = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.3, 4), new THREE.MeshLambertMaterial({ color: c }));
      r.rotation.y = Math.PI / 4;
      const r0 = Math.hypot(x, z * 1.2);
      r.position.set(x, Math.max(0, Math.min(5, Math.round((r0 - 8.5) * 0.45))) + 0.3, z);
      this.world.add(r);
    }
    // céu (degradê do amanhecer)
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 20, 12),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying float h; void main(){ vec3 c = mix(vec3(1.0,0.86,0.66), vec3(0.42,0.72,1.0), smoothstep(0.0, 0.5, h)); gl_FragColor = vec4(c, 1.0); }',
      }),
    );
    sky.renderOrder = -10;
    this.world.add(sky);
    this.hero = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    this.hero.setTool('shovel', '#c8d0e0');
    this.world.add(this.hero.root);
    this.mega = megaphoneModel();
    this.world.add(this.mega);
    // a engenhoca do jogo (trampolim) — peças aparecem uma a uma
    this.gadget = buildModel(gadgetById('trampolim')!, noMods());
    this.gadget.group.position.set(4.2, 0, 1.2);
    this.gadget.group.scale.setScalar(1.5);
    this.world.add(this.gadget.group);
    for (const p of this.gadget.parts) p.userData.s0 = p.scale.x;
    // moradores (modelos do próprio jogo)
    const cols: [string, '' | 'cap' | 'beanie' | 'straw' | 'bow'][] = [
      ['#ff7ac8', 'bow'],
      ['#5ec8ff', 'cap'],
      ['#ffd34a', 'straw'],
      ['#7ad86a', 'beanie'],
    ];
    for (const [c, h] of cols) {
      const b = new BloopModel(c, 0.9, h);
      b.root.visible = false;
      this.world.add(b.root);
      this.folk.push(b);
    }
    // torrões de terra voando
    const bitG = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const bitM = new THREE.MeshLambertMaterial({ color: '#a8743a' });
    const nb = [10, 16, 24, 30][this.tier] ?? 16;
    for (let i = 0; i < nb; i++) {
      const m = new THREE.Mesh(bitG, bitM);
      m.visible = false;
      this.world.add(m);
      this.bits.push({ m, v: new THREE.Vector3(), t0: -9 });
    }
    // ondas de som do megafone
    const ringM = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 28), ringM.clone());
      this.world.add(r);
      this.rings.push(r);
    }
    // confete
    const NC = [60, 100, 160, 220][this.tier] ?? 100;
    const cp = new Float32Array(NC * 3);
    const cc = new Float32Array(NC * 3);
    this.confV = new Float32Array(NC * 3);
    const pal = ['#ff4f6a', '#ffd34a', '#5ec8ff', '#7ad86a', '#b05aff', '#ffffff'].map((h) => new THREE.Color(h));
    for (let i = 0; i < NC; i++) {
      const c = pal[i % pal.length];
      cc.set([c.r, c.g, c.b], i * 3);
      cp.set([0, -50, 0], i * 3);
    }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(cp, 3));
    cg.setAttribute('color', new THREE.BufferAttribute(cc, 3));
    this.confetti = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true }));
    this.confetti.frustumCulled = false;
    this.world.add(this.confetti);
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

  /** terreno em blocos (dunas em degraus) com o buraco da casinha cheio de terra */
  private buildBlocks(): Blocks {
    const R = [14, 18, 22, 24][this.tier] ?? 18;
    const cells: { x: number; y: number; z: number; c: THREE.Color; pit: boolean }[] = [];
    const sand = new THREE.Color('#e8b860');
    const sand2 = new THREE.Color('#e2b05a');
    const dirt = new THREE.Color('#a8743a');
    const grass = new THREE.Color('#7ac85a');
    const hgt = (x: number, z: number) => {
      const r = Math.hypot(x, z * 1.2);
      if (r < 8.5) return 0;
      return Math.max(0, Math.min(5, Math.round((r - 8.5) * 0.45 + Math.sin(x * 0.5 + 1) * 0.8 + Math.cos(z * 0.45) * 0.7)));
    };
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        if (Math.hypot(x, z) > R) continue;
        const inPit = x >= PIT.x0 && x <= PIT.x1 && z >= PIT.z0 && z <= PIT.z1;
        const top = inPit ? 0 : hgt(x, z);
        const near = Math.hypot(x, z) < 7;
        const ys: number[] = [top];
        if (inPit) for (let y = PIT.y0; y < 0; y++) ys.push(y);
        else if (near) ys.push(top - 1);
        for (const y of ys) {
          const c = y === top && !inPit && (x * 7 + z * 13) % 9 === 0 ? grass : y < top || (inPit && y < 0) ? dirt : (x + z) % 2 ? sand : sand2;
          cells.push({ x, y, z, c, pit: inPit });
        }
      }
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#ffffff' }), cells.length);
    const dig: Blocks['dig'] = [];
    const m = new THREE.Matrix4();
    cells.forEach((cl, i) => {
      m.makeTranslation(cl.x, cl.y - 0.5, cl.z);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, cl.c);
      if (cl.pit && cl.y > PIT.y0) dig.push({ i, m: m.clone(), at: 0 });
    });
    // escava de cima para baixo, de perto da câmera para longe (frente da casinha aparece primeiro)
    dig.sort((a, b) => {
      const pa = new THREE.Vector3().setFromMatrixPosition(a.m);
      const pb = new THREE.Vector3().setFromMatrixPosition(b.m);
      return pb.y - pa.y || pb.z - pa.z || pa.x - pb.x;
    });
    dig.forEach((d, k) => (d.at = T_DIG + 0.4 + (k / dig.length) * (T_SHOUT - T_DIG - 1.2)));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return { mesh, dig };
  }

  private frame(tt: number, dt: number): void {
    const st = this.st;
    const cam = st.cam;
    const inBook = tt < T_WORLD;
    this.book.visible = inBook;
    this.world.visible = !inBook;
    const pos = new THREE.Vector3();
    const look = new THREE.Vector3();
    if (inBook) {
      // ---------------- livro ----------------
      if (tt - this.pageLast >= this.pageEvery || tt < this.pageLast) {
        this.pageLast = tt;
        drawPage(this.pageX, tt);
        this.pageT.needsUpdate = true;
      }
      const B = this.book.position;
      const fog = st.scene.fog as THREE.Fog;
      fog.color.set('#2a1810');
      fog.near = 10;
      fog.far = 40;
      st.r.setClearColor('#2a1810');
      this.hemi.color.set('#ffe0c0');
      this.hemi.groundColor.set('#3a2010');
      this.hemi.intensity = 0.9;
      this.sun.intensity = 0.6;
      this.sun.position.set(-3, B.y + 8, 4);
      this.sun.target.position.copy(B);
      this.lampL.intensity = 30;
      const k = ease(seg(tt, 0, T_DIVE));
      const dive = easeOut(seg(tt, T_DIVE, T_WORLD));
      pos.set(lerp(-0.6, 0.4, k), B.y + lerp(6.2, 4.4, k) - dive * 3.7, lerp(4.6, 2.9, k) - dive * 2.3);
      look.set(lerp(0, 0.4, k) + dive * 0.2, B.y + 0.4, lerp(-0.3, -0.1, k));
      if (tt >= T_DIVE + 0.6) this.cue('dive', () => {
        this.c.flash(1, '#fff6e0');
        sfx.whoosh();
      });
      if (tt >= T_STORM + 0.2) this.cue('storm', () => {
        music.setState('tension');
        sfx.whoosh();
      });
    } else {
      // ---------------- mundo ----------------
      if (tt >= T_WORLD) this.cue('calm', () => music.setState('calm'));
      const fog = st.scene.fog as THREE.Fog;
      fog.color.set('#ffd8b0');
      fog.near = 40;
      fog.far = 160;
      st.r.setClearColor('#ffcf9a');
      this.lampL.intensity = 0;
      this.hemi.color.set('#ffe8d0');
      this.hemi.groundColor.set('#8a6a40');
      this.hemi.intensity = 1.35;
      this.sun.intensity = 1.9;
      this.sun.position.set(-12, 14, 10);
      this.sun.target.position.set(0, 0, 0);
      this.updateWorld(tt, dt);
      if (tt < T_DIG) {
        // chega pulando: travelling baixo, a pontinha do telhado no meio da areia
        const k = ease(seg(tt, T_WORLD, T_DIG));
        pos.set(lerp(-4.5, 0.5, k), lerp(1.6, 2.6, k), lerp(9.5, 8.6, k));
        look.set(lerp(-3.5, -0.4, k), lerp(0.9, 0.6, k), lerp(2.2, 1.2, k));
      } else if (tt < T_SHOUT) {
        // escavando: do alto, vendo a casinha aparecer no buraco
        const k = ease(seg(tt, T_DIG, T_SHOUT));
        pos.set(lerp(5.2, 4.4, k), lerp(5.6, 4.8, k), lerp(8.4, 7.6, k));
        look.set(lerp(-0.4, 0, k), lerp(-0.4, -1.2, k), lerp(1.2, 0.6, k));
      } else if (tt < T_FOLK) {
        // o grito + a engenhoca + o pulo
        const k = ease(seg(tt, T_SHOUT, T_FOLK));
        const jump = seg(tt, T_JUMP, T_JUMP + 1.5);
        pos.set(lerp(0.2, 1.0, k), lerp(2.3, 3.6, k), lerp(8.6, 11.5, k));
        look.set(lerp(1.0, 2.6, k), lerp(1.1, 1.6, k) + ease(jump) * 1.6, lerp(1.9, 1.4, k));
      } else {
        // moradores saem; grua para trás e para cima (mais telhados enterrados lá longe)
        const k = ease5(seg(tt, T_FOLK, T_END - 0.4));
        pos.set(lerp(0.6, 1.5, k), lerp(3.4, 12, k), lerp(10.5, 21, k));
        look.set(lerp(0.2, 0, k), lerp(0.4, 1.0, k), lerp(1.6, -4, k));
      }
    }
    cam.position.copy(pos);
    cam.lookAt(look);
    cam.rotation.z += Math.sin(tt * 0.7) * 0.004;
    if (!inBook) this.hero.update(dt, cam, this.heroState(tt));
    st.render();
  }

  private heroState(tt: number): { yaw: number; speed: number; act: number; happy: boolean } {
    let yaw = Math.PI / 2;
    let speed = 0;
    let act = -1;
    let happy = false;
    const h = this.hero.root.position;
    if (tt < T_DIG) {
      const k = seg(tt, T_WORLD + 0.4, T_DIG - 0.6);
      h.set(lerp(-7, -1.2, ease(k)), Math.abs(Math.sin(tt * 7)) * 0.35 * (k < 1 ? 1 : 0), lerp(2.6, 2.6, k));
      speed = k > 0 && k < 1 ? 2.6 : 0;
      yaw = k < 1 ? Math.PI / 2 : 0.6;
      happy = k >= 1;
    } else if (tt < T_SHOUT) {
      h.set(-1.2, 0, 2.6);
      act = (tt * 1.6) % 1;
      yaw = 2.4;
    } else {
      // grita, depois corre e pula no trampolim
      const g = this.gadget.group.position;
      const top = 0.95 * 1.5;
      if (tt < T_JUMP - 0.6) {
        h.set(-1.2, 0, 2.6);
        yaw = Math.atan2(g.x - h.x, g.z - h.z);
        happy = tt > T_BUILD + 1.4;
      } else if (tt < T_JUMP) {
        const k = seg(tt, T_JUMP - 0.6, T_JUMP);
        h.set(lerp(-1.2, g.x, k), bump(k) * 1.4 + k * top, lerp(2.6, g.z, k));
        yaw = Math.atan2(g.x + 1.2, g.z - 2.6);
        speed = 3;
      } else {
        // pulos cada vez mais altos
        const u = tt - T_JUMP;
        const per = 0.9;
        const n = Math.floor(u / per);
        const ph = (u % per) / per;
        const hgt = Math.min(5, 1.6 + n * 1.3);
        h.set(g.x, top + Math.sin(ph * Math.PI) * hgt, g.z);
        yaw = 0.3;
        happy = true;
        if (ph < 0.08) this.cue('boing' + n, () => sfx.boing());
      }
    }
    return { yaw, speed, act, happy };
  }

  private updateWorld(tt: number, dt: number): void {
    // escavação: cada bloco pula para fora e some
    const bm = this.blocks.mesh;
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let changed = false;
    for (const d of this.blocks.dig) {
      const k = seg(tt, d.at, d.at + 0.35);
      if (k <= 0) {
        if (d.m !== undefined) bm.setMatrixAt(d.i, d.m);
        continue;
      }
      p.setFromMatrixPosition(d.m);
      const s = 1 - easeOut(k);
      m.compose(p.clone().add(new THREE.Vector3(0, bump(k) * 0.6, 0)), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      bm.setMatrixAt(d.i, m);
      changed = true;
      if (tt >= d.at && tt < d.at + dt * 1.5 + 0.02 && tt >= this.nextDig) {
        this.nextDig = tt + 0.12;
        this.throwBit(p, tt);
        sfx.scrub();
      }
    }
    if (changed || tt < T_DIG + 0.5) bm.instanceMatrix.needsUpdate = true;
    // torrões
    for (const b of this.bits) {
      const u = tt - b.t0;
      if (u < 0 || u > 1.4) {
        b.m.visible = false;
        continue;
      }
      b.m.visible = true;
      b.m.position.addScaledVector(b.v, dt);
      b.v.y -= 9.8 * dt;
      b.m.rotation.x += dt * 6;
      b.m.rotation.z += dt * 4;
    }
    // casinha: cata-vento girando
    const vane = this.house.getObjectByName('vane');
    if (vane) vane.rotation.y = tt * 2.2;
    // megafone: na mão esquerda; sobe na hora do grito
    const h = this.hero.root.position;
    const up = ease(seg(tt, T_SHOUT - 0.5, T_SHOUT)) * (1 - ease(seg(tt, T_BUILD + 1.4, T_BUILD + 2)));
    this.mega.visible = tt < T_JUMP - 0.6;
    this.mega.position.set(h.x + lerp(-0.35, 0.3, up), h.y + lerp(0.5, 0.95, up), h.z + lerp(0.15, 0.25, up));
    const g = this.gadget.group.position;
    this.mega.rotation.set(0, -Math.atan2(g.z - h.z, g.x - h.x) * up + (1 - up) * -0.4, lerp(-0.9, 0.25, up));
    // ondas de som
    this.rings.forEach((r, i) => {
      const u = (tt - T_SHOUT - i * 0.22) / 0.9;
      const on = u > 0 && u < 1 && tt < T_BUILD + 0.8;
      r.visible = on;
      if (!on) return;
      r.position.copy(this.mega.position).add(new THREE.Vector3(Math.cos(-this.mega.rotation.y), 0, Math.sin(-this.mega.rotation.y)).multiplyScalar(0.4 + u * 2.6));
      r.rotation.set(0, Math.PI / 2 - this.mega.rotation.y, 0);
      r.scale.setScalar(0.5 + u * 1.6);
      (r.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.8;
    });
    if (tt >= T_SHOUT) this.cue('shout', () => sfx.whoosh());
    // a engenhoca se monta (peças com "boing"), confete
    const parts = this.gadget.parts;
    parts.forEach((pt, i) => {
      const k = seg(tt, T_BUILD + i * 0.12, T_BUILD + i * 0.12 + 0.5);
      const s = (pt.userData.s0 as number) * (k <= 0 ? 0.0001 : easeBack(k, 2.2));
      pt.scale.setScalar(Math.max(0.0001, s));
      pt.visible = k > 0;
    });
    if (tt >= T_BUILD) this.cue('build', () => {
      play('gadget');
      sfx.sparkle();
      music.setState('victory');
      this.burstConfetti(g.clone().add(new THREE.Vector3(0, 1.4, 0)));
    });
    for (const sp of this.gadget.spinners) sp.o.rotation[sp.ax] += dt * 4;
    this.updateConfetti(dt);
    // moradores: saem da porta da casinha pulando e comemoram
    this.folk.forEach((f, i) => {
      const t0 = T_FOLK + i * 0.5;
      const k = seg(tt, t0, t0 + 1.4);
      f.root.visible = tt >= t0;
      if (!f.root.visible) return;
      const door = new THREE.Vector3(0, PIT.y0, 1.6);
      const goal = new THREE.Vector3(-2.4 + i * 1.5, 0, 3.6 + (i % 2) * 0.6);
      f.root.position.copy(door).lerp(goal, easeOut(k));
      f.root.position.y = lerp(PIT.y0, 0, ease(k)) + bump(k) * 1.4;
      f.root.rotation.y = Math.PI + Math.atan2(this.st.cam.position.x - f.root.position.x, this.st.cam.position.z - f.root.position.z);
      f.cheer = k >= 1 ? 1 : 0;
      f.update(dt, k < 1 ? 2 : 0, k < 1);
      if (k >= 1) this.cue('yay' + i, () => sfx.yay());
    });
  }

  private throwBit(p: THREE.Vector3, tt: number): void {
    const b = this.bits[this.bitI++ % this.bits.length];
    b.t0 = tt;
    b.m.position.copy(p).setY(p.y + 0.6);
    b.v.set((Math.random() - 0.5) * 3 + 1.5, 4 + Math.random() * 2, (Math.random() - 0.5) * 3 + 1);
  }
  private burstConfetti(at: THREE.Vector3): void {
    const a = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      a.setXYZ(i, at.x, at.y, at.z);
      const an = Math.random() * TAU;
      const sp = 2 + Math.random() * 4;
      this.confV.set([Math.cos(an) * sp, 4 + Math.random() * 5, Math.sin(an) * sp], i * 3);
    }
    a.needsUpdate = true;
  }
  private updateConfetti(dt: number): void {
    const a = this.confetti.geometry.getAttribute('position') as THREE.BufferAttribute;
    const v = this.confV;
    for (let i = 0; i < a.count; i++) {
      if (a.getY(i) < -20) continue;
      v[i * 3 + 1] -= 6 * dt;
      v[i * 3] *= 0.985;
      v[i * 3 + 2] *= 0.985;
      a.setXYZ(i, a.getX(i) + v[i * 3] * dt, Math.max(0.05, a.getY(i) + Math.max(-1.6, v[i * 3 + 1]) * dt), a.getZ(i) + v[i * 3 + 2] * dt);
    }
    a.needsUpdate = true;
  }

  private dispose(): void {
    this.hero.dispose();
    // modelos do jogo (geometrias/materiais em cache): só tirar da cena
    this.gadget.group.removeFromParent();
    for (const f of this.folk) f.root.removeFromParent();
    this.pageT.dispose();
    this.glowT.dispose();
  }
}

/** toca a abertura por cima de `root` (resolve no fim, ao Pular ou no voltar) */
export function playIntro(root: HTMLElement): Promise<void> {
  return new CavaIntro(root).play();
}
