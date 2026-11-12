/* ============================================================
 *  BLOOP PINK — abertura (≈33 s, pulável; toca em TODO save novo).
 *   1) rua: o Bloop vem pulando e para na frente de uma loja Bloop Pink linda;
 *      balão de pensamento "eu quero ter a minha!";
 *   2) casa: abre o notebook, entra no site da marca, toca "Quero ser franqueado!";
 *      carimbo APROVADO + confete;
 *   3) escurece → a loja dele: fachada quebrada e vazia (é ali que o jogo começa) + título.
 *  Usa a base de cinema (src/3d/cine) e o mesmo prédio/móveis/produtos do jogo.
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { gameFont } from '../../../i18n/font';
import { detectInitialTier } from '../../../core/quality';
import { Cine, clamp, ease, easeBack, easeOut, lerp, registerTheme, seg, TAU, Track3 } from '../../../3d/cine';
import { mySpec, npcSpec, PaperChar } from '../../../3d/paper';
import { MODES } from '../../../audio/music/player';
import { BRAND_NAME, BRAND_SITE, drawBrandLogo, PINK } from '../brand';
import { PRODUCTS } from '../catalog';
import { capOf } from '../data';
import { buildFurniture } from '../furniture';
import { ic } from '../icons';
import { Kit } from '../mats';
import { ProductField, type PlacedItem } from '../products';
import { Builder, rbox } from '../shapes';
import { RENOV0, Store3D } from '../store3d';
import { setTexQuality } from '../tex';

registerTheme({
  id: 'pinkIntro',
  name: 'Bloop Pink — Abertura (o sonho)',
  bpm: 108,
  root: 69,
  mode: MODES.major,
  prog: [0, 5, 3, 4],
  seed: 3131,
  db: 0.8,
  parts: [
    { role: 'pad', inst: 'padWarm', vol: 0.6, len: 16, st: { calm: 1, tension: 0.6, victory: 1 } },
    { role: 'arp', inst: 'musicbox', vol: 0.65, pat: 'x.x.x.x.x.x.x.x.', order: [0, 1, 2, 1], st: { calm: 1, victory: 1 } },
    { role: 'lead', inst: 'vibes', vol: 0.7, oct: 1, dens: 0.4, st: { calm: 1, victory: 1 } },
    { role: 'bass', inst: 'pluckBass', vol: 0.7, pat: 'x.......x.......', st: { calm: 1, victory: 1 } },
    { role: 'perc', inst: 'snap', vol: 0.45, pat: '....x.......x...', st: { calm: 1, victory: 1 } },
    { role: 'perc', inst: 'shaker', vol: 0.4, pat: '..x...x...x...x.', st: { calm: 0.8, victory: 1 } },
    { role: 'pad', inst: 'choir', vol: 0.5, len: 16, st: { victory: 1 } },
    { role: 'bell', inst: 'bell', vol: 0.45, oct: 2, len: 2, st: { victory: 1 } },
  ],
});

/* ------------------------------ roteiro (s) ------------------------------ */
const T_STOP = 6;
const T_THINK = 7.2;
const T_HOME = 12.6;
const T_SITE = 15.6;
const T_CLICK = 18.8;
const T_STAMP = 21.2;
const T_DARK = 24.4;
const T_SHOP = 25.6;
const T_TITLE = 27.2;
const T_END = 33;

const IC = (n: string) => ic(n, 28);
const SUBS = [
  { t: 0.8, end: T_THINK - 0.2, icons: [IC('store'), IC('heart')], text: () => t('pink.i.s1', 'Passeando pela cidade, o Bloop viu uma loja linda...') },
  { t: T_THINK + 0.2, end: T_HOME - 0.4, icons: [IC('think')], text: () => t('pink.i.s2', 'Uau! Eu quero ter a minha!') },
  { t: T_HOME + 0.8, end: T_CLICK - 0.3, icons: [IC('laptop'), IC('house')], text: () => t('pink.i.s3', 'Em casa, abriu o notebook e entrou no site da marca.') },
  { t: T_CLICK - 0.2, end: T_STAMP - 0.1, icons: [IC('hand'), IC('heart')], text: () => t('pink.i.s4', '"Quero ser franqueado!"') },
  { t: T_STAMP + 0.2, end: T_DARK, icons: [IC('stamp'), IC('star')], text: () => t('pink.i.s5', 'Aprovado! Agora ele tem uma franquia!') },
  { t: T_SHOP + 0.3, end: T_END - 0.6, icons: [IC('paint'), IC('box')], text: () => t('pink.i.s6', 'A loja precisa de uma reforma... mãos à obra!') },
];

/* ------------------------------ tela do notebook ------------------------------ */
function drawScreen(x: CanvasRenderingContext2D, W: number, H: number, tt: number): void {
  // tt: tempo desde que a cena da casa começou
  x.fillStyle = '#fff7fb';
  x.fillRect(0, 0, W, H);
  const boot = seg(tt, 0.6, 2.4);
  if (tt < 2.6) {
    x.fillStyle = '#1c1820';
    x.fillRect(0, 0, W, H);
    x.globalAlpha = boot;
    drawBrandLogo(x, W / 2, H / 2, H * 0.16, { light: true });
    x.globalAlpha = 1;
    return;
  }
  // navegador
  x.fillStyle = '#f1e8ee';
  x.fillRect(0, 0, W, H * 0.09);
  x.fillStyle = '#fff';
  x.beginPath();
  x.roundRect(W * 0.12, H * 0.018, W * 0.76, H * 0.055, H * 0.027);
  x.fill();
  x.fillStyle = '#7a5a6a';
  x.font = gameFont(600, Math.round(H * 0.035));
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  const url = BRAND_SITE;
  const typed = Math.floor(clamp((tt - 2.6) / 0.8) * url.length);
  x.fillText(url.slice(0, typed), W * 0.15, H * 0.046);
  // site
  const top = H * 0.09;
  const g = x.createLinearGradient(0, top, 0, H);
  g.addColorStop(0, '#ffd3e6');
  g.addColorStop(1, '#fff7fb');
  x.fillStyle = g;
  x.fillRect(0, top, W, H - top);
  drawBrandLogo(x, W * 0.24, top + H * 0.08, H * 0.08);
  x.fillStyle = PINK.wine;
  x.textAlign = 'center';
  x.font = gameFont(700, Math.round(H * 0.065));
  x.fillText(t('pink.i.site', 'Seja um franqueado!'), W / 2, top + H * 0.22);
  // produtos de vitrine
  const cols = ['#ff8cc0', '#c3a6ff', '#ffd34a', '#8fdcff', '#ff5fa2'];
  for (let i = 0; i < 5; i++) {
    const px = W * (0.2 + i * 0.15);
    const bob = Math.sin(tt * 3 + i) * H * 0.008;
    x.fillStyle = cols[i];
    x.beginPath();
    x.roundRect(px - W * 0.035, top + H * 0.32 + bob, W * 0.07, H * 0.16, W * 0.015);
    x.fill();
    x.fillStyle = '#fff';
    x.fillRect(px - W * 0.018, top + H * 0.28 + bob, W * 0.036, H * 0.05);
  }
  // botão grande
  const bx = W / 2;
  const by = top + H * 0.66;
  const press = tt > T_CLICK - T_HOME && tt < T_CLICK - T_HOME + 0.25 ? 0.94 : 1;
  const bw = W * 0.56 * press;
  const bh = H * 0.13 * press;
  const pulse = 1 + Math.sin(tt * 6) * 0.02;
  x.save();
  x.translate(bx, by);
  x.scale(pulse, pulse);
  x.fillStyle = '#b03a74';
  x.beginPath();
  x.roundRect(-bw / 2, -bh / 2 + H * 0.012, bw, bh, bh / 2);
  x.fill();
  x.fillStyle = tt > T_CLICK - T_HOME ? '#3ac48a' : PINK.rose;
  x.beginPath();
  x.roundRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
  x.fill();
  x.fillStyle = '#fff';
  x.font = gameFont(700, Math.round(H * 0.05));
  x.fillText(t('pink.i.button', 'Quero ser franqueado!'), 0, 0);
  x.restore();
  // depois do clique: carregando → formulário ok
  const after = tt - (T_CLICK - T_HOME);
  if (after > 0.3) {
    x.fillStyle = 'rgba(255,247,251,.94)';
    x.fillRect(0, top, W, H - top);
    if (after < 1.6) {
      x.strokeStyle = PINK.rose;
      x.lineWidth = H * 0.02;
      x.beginPath();
      x.arc(W / 2, H * 0.5, H * 0.08, after * 8, after * 8 + 4.2);
      x.stroke();
    } else {
      const rows = [t('pink.i.f1', 'Nome do franqueado'), t('pink.i.f2', 'Cidade da loja'), t('pink.i.f3', 'Treinamento')];
      rows.forEach((r, i) => {
        const y = top + H * (0.2 + i * 0.13);
        x.fillStyle = '#fff';
        x.beginPath();
        x.roundRect(W * 0.2, y - H * 0.045, W * 0.6, H * 0.09, H * 0.02);
        x.fill();
        x.fillStyle = '#7a5a6a';
        x.textAlign = 'left';
        x.font = gameFont(600, Math.round(H * 0.04));
        x.fillText(r, W * 0.23, y);
        if (after > 1.8 + i * 0.25) {
          x.fillStyle = '#3ac48a';
          x.font = gameFont(700, Math.round(H * 0.06));
          x.fillText('✓', W * 0.74, y);
        }
      });
    }
  }
  // carimbo
  const st = tt - (T_STAMP - T_HOME);
  if (st > 0) {
    const k = easeBack(clamp(st / 0.45));
    const s = lerp(3, 1, k);
    x.save();
    x.translate(W / 2, H * 0.56);
    x.rotate(-0.18);
    x.scale(s, s);
    x.globalAlpha = clamp(st / 0.2);
    x.strokeStyle = '#e8336f';
    x.lineWidth = H * 0.02;
    x.beginPath();
    x.roundRect(-W * 0.32, -H * 0.13, W * 0.64, H * 0.26, H * 0.04);
    x.stroke();
    x.fillStyle = '#e8336f';
    x.textAlign = 'center';
    x.font = gameFont(700, Math.round(H * 0.1));
    x.fillText(t('pink.i.approved', 'APROVADO!'), 0, -H * 0.02);
    x.font = gameFont(600, Math.round(H * 0.04));
    x.fillText(t('pink.i.franchisee', 'Franqueado oficial {b}', { b: BRAND_NAME }), 0, H * 0.075);
    x.restore();
    // confete na tela
    for (let i = 0; i < 40; i++) {
      const cx = ((i * 97) % W) + Math.sin(st * 2 + i) * 10;
      const cy = ((st * (120 + (i % 7) * 30) + i * 37) % H);
      x.fillStyle = ['#ff5fa2', '#ffd34a', '#8fdcff', '#c3a6ff', '#5ee08a'][i % 5];
      x.fillRect(cx, cy, 6, 9);
    }
  }
  // cursor
  const c0 = [W * 0.86, H * 0.9];
  const c1 = [bx + W * 0.06, by + H * 0.02];
  const mk = ease(seg(tt, T_SITE - T_HOME + 0.6, T_CLICK - T_HOME - 0.2));
  const mx = lerp(c0[0], c1[0], mk);
  const my = lerp(c0[1], c1[1], mk);
  if (after < 0.3) {
    x.fillStyle = '#fff';
    x.strokeStyle = '#2a1a2a';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(mx, my);
    x.lineTo(mx, my + H * 0.08);
    x.lineTo(mx + H * 0.022, my + H * 0.062);
    x.lineTo(mx + H * 0.05, my + H * 0.06);
    x.closePath();
    x.fill();
    x.stroke();
  }
}

/* ------------------------------ casa ------------------------------ */
function buildHome(kit: Kit): { g: THREE.Group; lid: THREE.Group; screen: THREE.CanvasTexture; cv: HTMLCanvasElement } {
  const g = new THREE.Group();
  const b = new Builder();
  const floor = kit.surf('homeFloor', 'wood', { rough: 1, envK: 0.6 });
  const wall = kit.surf('homeWall', 'plaster', { color: '#e8dcf6', rough: 1, envK: 0.3 });
  b.addW(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), floor, 0, 0, 0);
  b.addW(new THREE.BoxGeometry(8, 3, 0.2), wall, 0, 1.5, -2.2);
  b.addW(new THREE.BoxGeometry(0.2, 3, 8), wall, -3, 1.5, 0);
  // janela com céu
  const sky = document.createElement('canvas');
  sky.width = 256;
  sky.height = 256;
  const sx = sky.getContext('2d')!;
  const sg = sx.createLinearGradient(0, 0, 0, 256);
  sg.addColorStop(0, '#ff9ab8');
  sg.addColorStop(0.6, '#ffd0a8');
  sg.addColorStop(1, '#ffe8c8');
  sx.fillStyle = sg;
  sx.fillRect(0, 0, 256, 256);
  sx.fillStyle = '#c87a9a';
  for (let i = 0; i < 6; i++) sx.fillRect(i * 44, 170 - (i % 3) * 30, 38, 120);
  b.add(new THREE.PlaneGeometry(1.6, 1.3), kit.canvasMat('homeSky', sky, { emissive: 0.8 }), 1.6, 1.75, -2.09);
  const frame = kit.plain('homeFrame', '#ffffff', 0.4);
  b.add(rbox(1.75, 0.08, 0.1, 0.02, 1), frame, 1.6, 2.42, -2.06);
  b.add(rbox(1.75, 0.08, 0.1, 0.02, 1), frame, 1.6, 1.08, -2.06);
  b.add(rbox(0.08, 1.4, 0.1, 0.02, 1), frame, 0.75, 1.75, -2.06);
  b.add(rbox(0.08, 1.4, 0.1, 0.02, 1), frame, 2.45, 1.75, -2.06);
  b.add(rbox(0.05, 1.3, 0.06, 0.01, 1), frame, 1.6, 1.75, -2.05);
  // escrivaninha
  const deskW = kit.surf('deskWood', 'woodLight', { rough: 0.9 });
  b.add(rbox(1.6, 0.05, 0.75, 0.02, 2), deskW, 0, 0.76, -1.6);
  for (const dx of [-0.74, 0.74]) b.add(rbox(0.05, 0.74, 0.7, 0.01, 1), kit.plain('deskLeg', '#f4f0ec', 0.4), dx, 0.37, -1.6);
  // luminária, planta, caneca, quadro com coração
  b.add(new THREE.CylinderGeometry(0.08, 0.1, 0.02, 16), kit.plain('lampBase', PINK.rose, 0.4), -0.6, 0.79, -1.8);
  b.add(new THREE.CylinderGeometry(0.01, 0.01, 0.4, 6), kit.plain('lampArm', '#eee', 0.3, 0.8), -0.6, 0.99, -1.8);
  b.add(new THREE.ConeGeometry(0.12, 0.14, 16, 1, true), kit.plain('lampShade', '#ffd3e6', 0.6, 0, { emissive: '#ffe0c8', ei: 0.5, side: THREE.DoubleSide }), -0.55, 1.2, -1.75);
  b.add(new THREE.CylinderGeometry(0.035, 0.03, 0.09, 14), kit.plain('mug', '#c3a6ff', 0.4), 0.55, 0.83, -1.45);
  const heart = document.createElement('canvas');
  heart.width = heart.height = 128;
  const hx = heart.getContext('2d')!;
  hx.fillStyle = '#fff';
  hx.fillRect(0, 0, 128, 128);
  hx.fillStyle = PINK.rose;
  hx.font = '90px sans-serif';
  hx.textAlign = 'center';
  hx.fillText('♥', 64, 100);
  b.add(rbox(0.5, 0.5, 0.03, 0.01, 1), kit.plain('picFrame', '#d6ad6a', 0.3, 1), -1.6, 1.8, -2.08);
  b.add(new THREE.PlaneGeometry(0.42, 0.42), kit.canvasMat('heartPic', heart), -1.6, 1.8, -2.06);
  g.add(b.build());
  const plant = buildFurniture(kit, 'plant').group;
  plant.position.set(-2.4, 0, -1.6);
  g.add(plant);
  const rug = buildFurniture(kit, 'rug').group;
  rug.position.set(0, 0, -0.4);
  g.add(rug);
  // notebook: base + tampa (gira) com tela de canvas
  const lap = new THREE.Group();
  lap.position.set(0, 0.785, -1.55);
  const body = kit.plain('lapBody', '#e8e2ea', 0.3, 0.6);
  const base = new THREE.Mesh(rbox(0.5, 0.02, 0.34, 0.01, 2), body);
  base.position.y = 0.01;
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.17).rotateX(-Math.PI / 2), kit.plain('lapKeys', '#3a3540', 0.6));
  keys.position.set(0, 0.021, -0.04);
  lap.add(base, keys);
  const lid = new THREE.Group();
  lid.position.set(0, 0.02, -0.17);
  const lidM = new THREE.Mesh(rbox(0.5, 0.33, 0.012, 0.01, 2), body);
  lidM.position.set(0, 0.165, 0);
  const cv = document.createElement('canvas');
  cv.width = 640;
  cv.height = 400;
  const screen = new THREE.CanvasTexture(cv);
  screen.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.29), new THREE.MeshBasicMaterial({ map: screen, toneMapped: false }));
  scr.position.set(0, 0.165, 0.0065);
  lid.add(lidM, scr);
  lap.add(lid);
  g.add(lap);
  return { g, lid, screen, cv };
}

/* ------------------------------ abertura ------------------------------ */
export async function playIntro(root: HTMLElement): Promise<void> {
  const tier = detectInitialTier();
  setTexQuality(Math.min(tier, 2));
  const c = new Cine({
    id: 'pink',
    root,
    duration: T_END,
    music: 'pinkIntro',
    vignette: 'rgba(80,10,50,.35)',
    grade: 'saturate(1.08)',
    iconBg: 'rgba(255,95,162,.85)',
    subs: SUBS,
    title: { at: T_TITLE, text: () => BRAND_NAME.toUpperCase(), tagline: () => t('pink.tagline', 'Monte sua loja de beleza, atenda clientes e cresça a franquia!'), colors: ['#fff6fa', '#ffb3d1', '#ff5fa2', '#7a1f4f'], top: '30%' },
  });
  const st = c.stage3d(tier, { fov: 46, far: 200 });
  const { r, scene, cam } = st;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.95;
  r.outputColorSpace = THREE.SRGBColorSpace;
  const kit = new Kit(tier);
  kit.makeEnv(r);
  scene.background = new THREE.Color('#cde9ff');
  scene.fog = new THREE.Fog('#e0f0ff', 40, 140);
  const hemi = new THREE.HemisphereLight('#fff4f8', '#8a7a80', 0.6);
  const sun = new THREE.DirectionalLight('#fff0dc', 1.8);
  sun.position.set(-8, 14, 12);
  scene.add(hemi, sun, new THREE.AmbientLight('#ffffff', 0.08));

  // ---------- 1) a loja dos sonhos ----------
  const street = new THREE.Group();
  scene.add(street);
  const store = new Store3D(kit);
  store.apply({ walls: true, paint: 'blush', window: true, door: true, floor: 'marble', sign: 'neon', light: 3, exp: 0 });
  street.add(store.root);
  const field = new ProductField(kit, false);
  street.add(field.group);
  const furn: { k: Parameters<typeof buildFurniture>[1]; x: number; z: number; r: number }[] = [
    { k: 'shelfLux', x: -4.72, z: -2.6, r: 1 },
    { k: 'shelfLux', x: -4.72, z: -3.9, r: 1 },
    { k: 'shelfLux', x: 4.72, z: -2.6, r: 3 },
    { k: 'shelfLux', x: 4.72, z: -3.9, r: 3 },
    { k: 'tableRound', x: -2.4, z: -2.4, r: 0 },
    { k: 'tableRound', x: 2.4, z: -2.4, r: 0 },
    { k: 'testMakeup', x: 0, z: -11.2, r: 0 },
    { k: 'balloons', x: 0, z: -6, r: 0 },
    { k: 'plant', x: -4.3, z: -0.7, r: 0 },
    { k: 'plant', x: 4.3, z: -0.7, r: 0 },
  ];
  const items: PlacedItem[] = [];
  const prods = PRODUCTS.filter((p) => p.tier >= 2);
  let pi = 0;
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  for (const f of furn) {
    const m = buildFurniture(kit, f.k);
    m.group.position.set(f.x, 0, f.z);
    m.group.rotation.y = (f.r * Math.PI) / 2;
    street.add(m.group);
    m.group.updateMatrixWorld(true);
    for (const sp of m.slots) {
      const p = prods[pi++ % prods.length];
      const n = Math.min(capOf(p.shape), 6);
      const base = new THREE.Vector3(sp.x, sp.y, sp.z).applyMatrix4(m.group.matrixWorld);
      const yaw = (f.r * Math.PI) / 2 + (sp.face > 0 ? 0 : Math.PI);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      for (let i = 0; i < n; i++) {
        const lx = (i % 3 - 1) * 0.09;
        const lz = 0.1 - Math.floor(i / 3) * 0.1;
        const pos = new THREE.Vector3(base.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), base.y, base.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
        items.push({ p, m: new THREE.Matrix4().compose(pos, q, one) });
      }
    }
  }
  field.rebuild(items);
  // vitrine: Bloops clientes lá dentro (enfeite)
  const bloop = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
  street.add(bloop.root);
  const extras: PaperChar[] = [];
  const npc = npcSpec;
  for (const [col, x, z] of [['#c3a6ff', -2.0, -3.4], ['#8fdcff', 1.6, -3.6], ['#ffd34a', 3.1, 2.2]] as [string, number, number][]) {
    const ch = new PaperChar(npc(col, '#ffffff', { head: 'h_bow' as never }), { radius: 0.38, cell: 96, shadow: true });
    ch.root.position.set(x, 0, z);
    street.add(ch.root);
    extras.push(ch);
  }

  // ---------- 2) casa ----------
  const home = buildHome(kit);
  home.g.position.set(60, 0, 0);
  home.g.visible = false;
  scene.add(home.g);
  const hl = new THREE.PointLight('#ffe2c8', 6, 6, 1.5);
  hl.position.set(60.4, 2.2, -0.6);
  home.g.add(hl);
  hl.position.set(0.4, 2.2, -0.6);
  const sx = home.cv.getContext('2d')!;
  // confete 3D
  const conf: { m: THREE.Mesh; v: THREE.Vector3; w: THREE.Vector3 }[] = [];
  const confG = new THREE.PlaneGeometry(0.025, 0.04);
  const confMats = ['#ff5fa2', '#ffd34a', '#8fdcff', '#c3a6ff', '#5ee08a'].map((col) => new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));

  // bubble de pensamento (DOM)
  const think = document.createElement('div');
  think.style.cssText = 'position:absolute;left:0;top:0;transform:translate(-20%,-100%) scale(0);transform-origin:10% 100%;transition:transform .45s cubic-bezier(.3,1.6,.5,1);background:#fff;border-radius:40px;padding:12px 20px;font-weight:800;font-size:clamp(16px,2.6vw,26px);color:#b03a74;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;gap:8px;white-space:nowrap';
  think.innerHTML = `${ic('store', 40)}<span>${t('pink.i.want', 'Eu quero ter a minha!')}</span>${ic('heart', 32)}<i style="position:absolute;left:8%;bottom:-18px;width:18px;height:18px;border-radius:50%;background:#fff"></i><i style="position:absolute;left:2%;bottom:-34px;width:10px;height:10px;border-radius:50%;background:#fff"></i>`;
  c.layer.appendChild(think);

  const camT1 = new Track3([
    [0, -8.5, 1.0, 7.4],
    [T_STOP, -2.8, 1.25, 6.4],
    [T_THINK + 1, 1.0, 1.6, 7.6],
    [T_HOME, 0.6, 1.9, 7.0],
  ]);
  const lookT1 = new Track3([
    [0, -6, 0.6, 2.4],
    [T_STOP, -0.6, 1.0, 1.6],
    [T_THINK + 1, 0, 2.7, -0.5],
    [T_HOME, 0, 3.1, -1],
  ]);
  const camT2 = new Track3([
    [T_HOME, 61.5, 1.55, 1.3],
    [T_SITE, 60.95, 1.35, 0.4],
    [T_CLICK, 60.5, 1.2, -0.55],
    [T_STAMP, 60.95, 1.35, 0.45],
    [T_DARK, 61.4, 1.5, 1.2],
  ]);
  const camT3 = new Track3([
    [T_SHOP, 1.6, 1.1, 9.5],
    [T_END, 0.2, 1.6, 4.6],
  ]);
  const v = new THREE.Vector3();
  const l = new THREE.Vector3();
  let switched = false;
  let homeOn = false;
  let jumped = false;

  c.onFrame = (tt, dt) => {
    // cortes
    if (tt >= T_HOME - 0.4 && tt < T_HOME) c.fade(true);
    if (tt >= T_HOME && !homeOn) {
      homeOn = true;
      street.visible = false;
      home.g.visible = true;
      scene.background = new THREE.Color('#2a1a2a');
      c.fade(false);
    }
    if (tt >= T_DARK && tt < T_SHOP) c.fade(true);
    if (tt >= T_SHOP && !switched) {
      switched = true;
      home.g.visible = false;
      street.visible = true;
      store.apply(RENOV0);
      field.group.visible = false;
      for (const ch of extras) ch.setVisible(false);
      for (const f of street.children) if (f.userData.kind) f.visible = false;
      scene.background = new THREE.Color('#d8c8c8');
      sun.color.set('#ffd6b0');
      hemi.intensity = 0.45;
      c.fade(false);
    }
    // ----- cena 1 -----
    if (tt < T_HOME) {
      const k = ease(seg(tt, 0.2, T_STOP));
      const bx = lerp(-7.5, 0.2, k);
      const hop = tt < T_STOP ? Math.abs(Math.sin(tt * 5.2)) * 0.28 : tt > T_THINK + 0.6 ? Math.abs(Math.sin((tt - T_THINK) * 7)) * 0.22 * (1 - seg(tt, T_THINK + 2.5, T_THINK + 3.2)) : 0;
      bloop.root.position.set(bx, hop, 2.3);
      const yaw = tt < T_STOP ? Math.PI / 2 : lerp(Math.PI / 2, Math.PI, ease(seg(tt, T_STOP, T_STOP + 0.6)));
      bloop.update(dt, cam, { yaw, speed: tt < T_STOP ? 2.4 : 0, act: -1, happy: tt > T_THINK });
      for (const [i, ch] of extras.entries()) ch.update(dt, cam, { yaw: i === 2 ? -Math.PI / 2 : Math.sin(tt + i) * 0.6, speed: 0, act: -1, happy: true });
      camT1.at(tt, v);
      lookT1.at(tt, l);
      cam.position.copy(v);
      cam.lookAt(l);
      store.update(dt, tt, Math.hypot(bx, 2.3) < 1.5, 0);
      // balão de pensamento
      const on = tt > T_THINK && tt < T_HOME - 0.6;
      if (on) {
        const p = new THREE.Vector3(bx + 0.25, 1.15, 2.3).project(cam);
        think.style.left = ((p.x * 0.5 + 0.5) * st.w).toFixed(0) + 'px';
        think.style.top = ((-p.y * 0.5 + 0.5) * st.h).toFixed(0) + 'px';
      }
      think.style.transform = `translate(-10%,-100%) scale(${on ? 1 : 0})`;
    } else think.style.transform = 'translate(-10%,-100%) scale(0)';
    // ----- cena 2 -----
    if (tt >= T_HOME && tt < T_SHOP) {
      const ht = tt - T_HOME;
      home.lid.rotation.x = lerp(-Math.PI / 2 + 0.05, 0.25, easeOut(seg(ht, 0.2, 1.2)));
      drawScreen(sx, home.cv.width, home.cv.height, ht);
      home.screen.needsUpdate = true;
      camT2.at(tt, v);
      cam.position.copy(v);
      // olha o Bloop + notebook juntos; no clique chega perto da tela; no carimbo abre de novo
      const kz = ease(seg(tt, T_SITE, T_CLICK)) * (1 - ease(seg(tt, T_STAMP - 0.4, T_STAMP + 0.6)));
      cam.lookAt(lerp(59.8, 60, kz), lerp(0.8, 0.98, kz), lerp(-1.35, -1.72, kz));
      // o Bloop sentado olhando o notebook (de costas para a câmera); pula no carimbo
      const jump = tt > T_STAMP ? Math.abs(Math.sin((tt - T_STAMP) * 6)) * 0.25 : 0;
      bloop.root.position.set(59.45, jump, -1.05);
      if (bloop.root.parent !== scene) scene.add(bloop.root);
      bloop.update(dt, cam, { yaw: 2.35, speed: 0, act: tt > T_CLICK - 0.3 && tt < T_CLICK + 0.2 ? 0.5 : -1, happy: tt > T_STAMP });
      if (tt > T_STAMP && !jumped) {
        jumped = true;
        c.flash(0.6, '#ffe0f0');
        for (let i = 0; i < 90; i++) {
          const m = new THREE.Mesh(confG, confMats[i % confMats.length]);
          m.position.set(60 + (Math.random() - 0.5) * 0.6, 1.0, -1.5 + (Math.random() - 0.5) * 0.4);
          scene.add(m);
          conf.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 2.6, 2 + Math.random() * 2.2, (Math.random() - 0.3) * 2), w: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9) });
        }
      }
    }
    for (const p of conf) {
      p.v.y -= 4.5 * dt;
      p.v.multiplyScalar(1 - dt * 0.9);
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.01) p.m.position.y = 0.01;
      p.m.rotation.x += p.w.x * dt;
      p.m.rotation.y += p.w.y * dt;
    }
    // ----- cena 3: a loja dele, quebrada -----
    if (tt >= T_SHOP) {
      if (bloop.root.parent !== street) street.add(bloop.root);
      bloop.root.position.set(0.25, 0, 2.6);
      bloop.update(dt, cam, { yaw: Math.PI, speed: 0, act: -1, happy: true });
      camT3.at(tt, v);
      cam.position.copy(v);
      cam.lookAt(0, 2.1, -1);
      store.update(dt, tt, false, 0);
      if (tt > T_END - 1) c.fade(true);
    }
    st.render();
  };
  c.onDispose = () => {
    think.remove();
    bloop.dispose();
    for (const ch of extras) ch.dispose();
    field.dispose();
    store.dispose();
    confG.dispose();
    for (const m of confMats) m.dispose();
    home.screen.dispose();
    kit.dispose();
  };
  void TAU;
  void rbox;
  // pré-compila os shaders (sem tela preta longa no 1º quadro)
  try {
    home.g.visible = true;
    r.compile(scene, cam);
    home.g.visible = false;
  } catch {
    /* */
  }
  await c.play();
}
