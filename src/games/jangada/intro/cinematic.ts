/* ============================================================
 *  JANGADA BLOOP — ABERTURA (≈45 s, "Pular" sempre visível; base: src/3d/cine).
 *  Toca na primeira "Nova jangada" e pode ser revista pelo menu (playIntro).
 *   1. Pôr do sol no mar: um cargueiro colorido (contêineres!) navega rumo ao sol; gaivotas.
 *   2. Na proa, o SEU Bloop de papel curte a viagem (travelling pela frente do navio).
 *   3. O céu fecha: tempestade, ondas grandes, chuva e raios (o mesmo mar/céu do jogo).
 *   4. Um raio, o navio aderna e afunda (desenho animado): contêineres caem e boiam, a
 *      tripulação desce no bote salva-vidas acenando (todo mundo a salvo) e o Bloop pula
 *      num caixote. O navio some com bolhas.
 *   5. "Horas depois..." — amanhecer: mar turquesa e calmo, o Bloop acorda numa jangadinha de
 *      4 pisos com um caixote e um gancho; uma gaivota pousa.
 *   6. Grua para trás e para cima: restos boiando, ilhas no horizonte, o Bloop joga o gancho
 *      → título "JANGADA BLOOP".
 *  Mar e céu: Ocean/Sky/skyAt do jogo (ondas de Gerstner, tempestade). Som: JAudio do jogo
 *  (músicas dia/tempestade, chuva, vento, trovões). Qualidade por nível (chuva, ondas, gaivotas).
 * ============================================================ */
import * as THREE from 'three';
import { t } from '../../../i18n';
import { detectInitialTier } from '../../../core/quality';
import { sfx } from '../../../audio';
import { mySpec, npcSpec, PaperChar } from '../../../3d/paper';
import { Cine, bump, clamp, ease, ease5, easeOut, glowTex, lerp, seg, TAU, type Stage3D } from '../../../3d/cine';
import { Ocean, Sky, skyAt, waveH, type SkyCols } from '../ocean';
import { box, clean, cone, cyl, debrisGeo, foundationGeo, merge, paint, sph, toolGeo } from '../models';
import { isleFarGeo } from '../models2';
import { JAudio } from '../audio';
import { jIcon } from '../icons';

/* ------------------------------ roteiro (s) ------------------------------ */
const T_BOW = 8;
const T_STORM = 14;
const T_SINK = 21;
const T_JUMP = 24.6;
const T_BLACK = 29;
const T_DAWN = 31.5;
const T_WIDE = 37;
const T_THROW = 38.2;
const T_TITLE = 39.6;
const T_END = 45.5;
const BOLTS = [16.3, 18.6, 20.4, 21.7, 26.4];

const ic = (n: string) => jIcon(n, 30);
const SUBS = [
  { t: 0.8, end: 7.6, icons: [ic('sun'), ic('sail')], text: () => t('jangada.i.s1', 'Um navio cargueiro cruza o oceano ao pôr do sol...') },
  { t: T_BOW + 0.5, end: T_STORM - 0.3, icons: [ic('heart'), ic('island')], text: () => t('jangada.i.s2', 'Você vai de carona, sonhando com ilhas distantes.') },
  { t: T_STORM + 0.6, end: T_SINK - 0.2, icons: [ic('storm'), ic('wind')], text: () => t('jangada.i.s3', 'Mas o céu escurece... vem aí uma tempestade!') },
  { t: T_SINK + 1.6, end: T_JUMP + 0.3, icons: [ic('canoe'), ic('people'), ic('heart')], text: () => t('jangada.i.s4', 'O navio vai afundar! A tripulação desce no bote salva-vidas...') },
  { t: T_JUMP + 0.5, end: T_BLACK, icons: [ic('found'), ic('jump')], text: () => t('jangada.i.s5', '...e você pula num caixote. Segura firme!') },
  { t: T_BLACK + 0.3, end: T_DAWN + 0.2, icons: [ic('moon'), ic('sun')], text: () => t('jangada.i.s6', 'Horas depois...') },
  { t: T_DAWN + 0.6, end: T_DAWN + 3.2, icons: [ic('sun')], text: () => t('jangada.i.s7', 'Amanhece. O mar ficou calminho e azul.') },
  { t: T_DAWN + 3.3, end: T_WIDE + 0.9, icons: [ic('found'), ic('hook')], text: () => t('jangada.i.s8', 'Você está numa jangadinha de 4 pisos... com um gancho!') },
  { t: T_WIDE + 1, end: T_TITLE + 1.6, icons: [ic('hook'), ic('wood'), ic('build')], text: () => t('jangada.i.s9', 'Pesque o que passa boiando e aumente sua jangada!') },
];

/* ------------------------------ modelos ------------------------------ */
const CONT = ['#e8503a', '#2f7fd8', '#f2b632', '#3aa86a', '#e87a2a', '#8a5ad8', '#d83a6a', '#20b0b0'];
/** largura do casco (meia) em x (proa afinada em -x), na altura y */
function halfBeam(x: number, y: number): number {
  let w = 3;
  if (x < -5) {
    const u = clamp((-5 - x) / 7);
    w *= 1 - Math.pow(u, 1.7) * 0.94;
  }
  if (x > 10) w *= 1 - ((x - 10) / 2) * 0.12;
  if (y < 0) w *= 1 - clamp(-y / 1.8) * 0.28;
  return w;
}
/** tosamento da proa: quanto o casco sobe em (x, y) — contínuo em y (as faixas do casco se encaixam) */
function sheer(x: number, y: number): number {
  const u = clamp((-6 - x) / 6);
  return u * u * 0.9 * clamp((y + 1.7) / 3.75);
}
/** faixa do casco entre y0 e y1 (afinada pela função acima) */
function hullBand(y0: number, y1: number, col: string): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(24, y1 - y0, 2, 24, 2, 1);
  g.translate(0, (y0 + y1) / 2, 0);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const s = Math.sign(p.getZ(i));
    p.setZ(i, s * halfBeam(x, y));
    // proa sobe um pouco (tosamento) — função só de (x, y): faixas vizinhas seguem juntas (sem faces sobrepostas = sem z-fighting)
    p.setY(i, y + sheer(x, y));
  }
  g.computeVertexNormals();
  return clean(paint(g, col, 0.03));
}
/* ---- texturas procedurais do navio (canvas; cinza/branco: a cor vem da cor do vértice) ---- */
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void, aniso = 4): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}
let prng = 99;
const pr = () => ((prng = (prng * 16807) % 2147483647) / 2147483647);
/** contêiner: metade esquerda = chapa corrugada (com moldura, ferrugem e sujeira); metade direita = portas com barras */
function containerTex(): THREE.CanvasTexture {
  return canvasTex(512, 256, (x) => {
    x.fillStyle = '#f2f2f2';
    x.fillRect(0, 0, 512, 256);
    // corrugado: faixas verticais claro/escuro com degradê (parece ondulado)
    for (let i = 0; i < 256; i += 10) {
      const g = x.createLinearGradient(i, 0, i + 10, 0);
      g.addColorStop(0, '#d0d0d0');
      g.addColorStop(0.35, '#ffffff');
      g.addColorStop(0.7, '#e6e6e6');
      g.addColorStop(1, '#bcbcbc');
      x.fillStyle = g;
      x.fillRect(i, 0, 10, 256);
    }
    // portas: dois painéis, 4 barras de trava com alças, dobradiças
    x.fillStyle = '#e8e8e8';
    x.fillRect(256, 0, 256, 256);
    for (let i = 256; i < 512; i += 16) {
      x.fillStyle = i % 32 ? '#f4f4f4' : '#dadada';
      x.fillRect(i, 0, 16, 256);
    }
    x.fillStyle = '#6a6a6a';
    x.fillRect(382, 10, 4, 236);
    for (const bx of [300, 352, 414, 466]) {
      x.fillStyle = '#5a5a5a';
      x.fillRect(bx, 8, 6, 240);
      x.fillStyle = '#7a7a7a';
      for (const by of [40, 128, 216]) x.fillRect(bx - 4, by, 14, 6);
      x.fillStyle = '#4a4a4a';
      x.fillRect(bx + 6, 120, 18, 8);
    }
    for (const hy of [30, 120, 210]) {
      x.fillStyle = '#6a6a6a';
      x.fillRect(258, hy, 10, 16);
      x.fillRect(502, hy, 10, 16);
    }
    // moldura (chanfro escuro + filete claro) nas duas metades
    for (const ox of [0, 256]) {
      x.strokeStyle = 'rgba(40,40,40,.75)';
      x.lineWidth = 10;
      x.strokeRect(ox + 5, 5, 246, 246);
      x.strokeStyle = 'rgba(255,255,255,.55)';
      x.lineWidth = 3;
      x.strokeRect(ox + 12, 12, 232, 232);
    }
    // ferrugem e sujeira (escorrendo de cima)
    for (let i = 0; i < 26; i++) {
      const rx = pr() * 512;
      const len = 30 + pr() * 120;
      const g = x.createLinearGradient(0, 8, 0, 8 + len);
      g.addColorStop(0, 'rgba(120,60,20,.55)');
      g.addColorStop(1, 'rgba(120,60,20,0)');
      x.fillStyle = g;
      x.fillRect(rx, 8, 2 + pr() * 4, len);
    }
    for (let i = 0; i < 70; i++) {
      x.fillStyle = `rgba(${pr() < 0.5 ? '110,70,40' : '60,60,60'},${0.08 + pr() * 0.18})`;
      x.beginPath();
      x.arc(pr() * 512, 200 + pr() * 56, 3 + pr() * 9, 0, 6.28);
      x.fill();
    }
  });
}
/** casco: chapas (emendas), escorridos de ferrugem e linha d'água suja */
function hullTex(): THREE.CanvasTexture {
  return canvasTex(1024, 128, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 1024, 128);
    x.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 1024; i += 43) x.fillRect(i, 0, 2, 128);
    x.fillRect(0, 63, 1024, 2);
    for (let i = 0; i < 40; i++) {
      const rx = pr() * 1024;
      const len = 30 + pr() * 90;
      const g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(150,70,25,.7)');
      g.addColorStop(1, 'rgba(150,70,25,0)');
      x.fillStyle = g;
      x.fillRect(rx, 0, 2 + pr() * 5, len);
    }
    const g = x.createLinearGradient(0, 96, 0, 128);
    g.addColorStop(0, 'rgba(60,70,40,0)');
    g.addColorStop(1, 'rgba(60,70,40,.35)');
    x.fillStyle = g;
    x.fillRect(0, 96, 1024, 32);
  });
}
/** superestrutura: fileiras de janelas com caixilho (a faixa da direita fica lisa: tetos).
 *  Devolve também o mapa de brilho (só as janelas acesas: brilham na tempestade). */
function cabinTex(): { map: THREE.CanvasTexture; glow: THREE.CanvasTexture } {
  const lit: [number, number][] = [];
  const map = canvasTex(256, 256, (x) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = 'rgba(0,0,0,.08)';
    for (let r = 0; r < 4; r++) x.fillRect(0, r * 56 + 50, 224, 3);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 5; c++) {
        const wx = 14 + c * 42;
        const wy = 18 + r * 56;
        x.fillStyle = '#5a6070';
        x.fillRect(wx - 3, wy - 3, 30, 26);
        const on = pr() < 0.6;
        if (on) lit.push([wx, wy]);
        x.fillStyle = on ? '#ffe2a0' : '#2a3a52';
        x.fillRect(wx, wy, 24, 20);
        x.fillStyle = 'rgba(255,255,255,.35)';
        x.fillRect(wx + 2, wy + 2, 6, 16);
      }
  });
  const glow = canvasTex(256, 256, (x) => {
    x.fillStyle = '#000000';
    x.fillRect(0, 0, 256, 256);
    x.fillStyle = '#c89a50';
    for (const [wx, wy] of lit) x.fillRect(wx, wy, 24, 20);
  });
  return { map, glow };
}
/** remapeia o u das faces de uma BoxGeometry (ordem: +x, −x, +y, −y, +z, −z) para [u0, u1] */
function boxU(g: THREE.BufferGeometry, faces: [number, number][]): THREE.BufferGeometry {
  const uv = g.getAttribute('uv');
  const per = uv.count / 6;
  for (let f = 0; f < 6; f++) {
    const [u0, u1] = faces[f];
    for (let i = f * per; i < (f + 1) * per; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
  }
  return g;
}
/** altura de cada contêiner empilhado (maior que a nervura de 1,15: pilhas não se sobrepõem) */
const STACK = 1.18;
function shipModel(tier: number): { ship: THREE.Group; loose: THREE.Mesh[]; windows: THREE.Mesh; lifeboat: THREE.Group; mastTip: THREE.Vector3 } {
  const ship = new THREE.Group();
  const L: THREE.BufferGeometry[] = [];
  // casco com textura (chapas, ferrugem, linha d'água); superestrutura com janelas
  const H: THREE.BufferGeometry[] = [hullBand(-1.7, 0.1, '#c8402e'), hullBand(0.1, 0.36, '#f4f2ea'), hullBand(0.36, 1.75, '#3a5a8e'), hullBand(1.75, 2.05, '#f4f2ea')];
  const K: THREE.BufferGeometry[] = [];
  // convés
  // (o topo do convés fica 6 cm acima da faixa branca: antes era coplanar e piscava)
  const dk = new THREE.BoxGeometry(24, 0.1, 2, 24, 1, 1);
  const dp = dk.getAttribute('position');
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i);
    const u = clamp((-6 - x) / 6);
    dp.setZ(i, Math.sign(dp.getZ(i)) * (halfBeam(x, 2) - 0.12));
    dp.setY(i, dp.getY(i) + 2.06 + u * u * 0.9);
  }
  dk.computeVertexNormals();
  L.push(clean(paint(dk, '#4f7a62', 0.02)));
  // ponte de comando (popa) + chaminé + mastro
  const cab = (w: number, h: number, d: number, x: number, y: number) => K.push(clean(paint(boxU(new THREE.BoxGeometry(w, h, d).translate(x, y, 0), [[0, 0.875], [0, 0.875], [0.9, 1], [0.9, 1], [0, 0.875], [0, 0.875]]), '#f4f2ea', 0.02)));
  cab(4, 4.2, 5, 9, 4.1);
  cab(3, 1.2, 4, 9.3, 6.8);
  // corrimão das asas da ponte + boias
  for (const sz of [-1, 1]) {
    L.push(box(1, 0.05, 0.05, '#ffffff', 7.6, 6.75, sz * 3.25, 0, 0, 0, 0));
    for (const px of [7.15, 7.6, 8.05]) L.push(box(0.05, 0.5, 0.05, '#ffffff', px, 6.5, sz * 3.25, 0, 0, 0, 0));
    L.push(clean(paint(new THREE.TorusGeometry(0.22, 0.06, 6, 12), '#ff6a2a', 0)).rotateY(Math.PI / 2).translate(6.95, 3.4, sz * 1.6));
  }
  L.push(box(1, 0.25, 6.6, '#e8e4da', 7.6, 6.15, 0, 0, 0, 0, 0));
  L.push(cyl(0.75, 0.85, 2.6, '#d84a2e', 10.6, 7.9, 0, 0, 0, 0, 12));
  L.push(cyl(0.82, 0.82, 0.4, '#f4f2ea', 10.6, 8.2, 0, 0, 0, 0, 12));
  L.push(cyl(0.785, 0.785, 0.35, '#2a2a32', 10.6, 9.15, 0, 0, 0, 0, 12));
  L.push(cyl(0.06, 0.08, 3.2, '#e8e4da', -10.2, 4.4, 0, 0, 0, 0, 6));
  L.push(box(0.08, 0.08, 1.6, '#e8e4da', -10.2, 5.4, 0, 0, 0, 0, 0));
  L.push(cyl(0.05, 0.06, 2.4, '#e8e4da', 9.3, 8.6, 0, 0, 0, 0, 6));
  // guindastes do convés
  for (const x of [-4.2, 1.6]) {
    L.push(cyl(0.22, 0.26, 3.6, '#f2b632', x, 3.8, -2.4, 0, 0, 0, 8));
    L.push(cyl(0.1, 0.12, 5, '#f2b632', x + 1.6, 5.2, -1.4, 0.5, 0, -1.0, 6));
  }
  // corrimão da proa
  for (let i = 0; i < 9; i++) {
    const x = -11.4 + i * 0.7;
    const z = halfBeam(x, 2) - 0.15;
    const u = clamp((-6 - x) / 6);
    for (const s of [-1, 1]) L.push(cyl(0.035, 0.035, 0.6, '#f4f2ea', x, 2.35 + u * u * 0.9, s * z, 0, 0, 0, 4));
  }
  // contêineres (empilhados; os do topo soltam no naufrágio)
  const loose: THREE.Mesh[] = [];
  const contMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: containerTex() });
  const C: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const looseG: THREE.BufferGeometry[] = [];
  for (let ix = 0; ix < 6; ix++)
    for (let iz = 0; iz < 4; iz++) {
      const x = -7.6 + ix * 2.35;
      const z = -1.8 + iz * 1.2;
      const hN = 1 + Math.floor(rnd() * (ix === 0 ? 2 : 3));
      for (let h = 0; h < hN; h++) {
        const col = CONT[Math.floor(rnd() * CONT.length)];
        const top = h === hN - 1 && (iz === 0 || iz === 3) && h >= 1;
        // corpo com chapa corrugada/portas (textura) + 8 cantoneiras saltadas 2 cm (sem nervuras finas: tremiam de longe)
        const body = boxU(new THREE.BoxGeometry(2.2, 1.1, 1.1), [[0.5, 1], [0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5], [0, 0.5]]);
        const parts = [clean(paint(body, col, 0.18))];
        for (const cx of [-1.07, 1.07]) for (const cy of [-0.53, 0.53]) for (const cz of [-0.53, 0.53]) parts.push(box(0.1, 0.1, 0.1, col, cx, cy, cz, 0, 0, 0, 0.4));
        for (const cx of [-1.07, 1.07]) for (const cz of [-0.53, 0.53]) parts.push(box(0.08, 1.16, 0.08, col, cx, 0, cz, 0, 0, 0, 0.35));
        const g = merge(parts);
        if (top && loose.length < 6) {
          const m = new THREE.Mesh(g, contMat);
          m.position.set(x, 2.66 + h * STACK, z);
          m.userData.home = m.position.clone();
          loose.push(m);
          ship.add(m);
          looseG.push(g);
        } else C.push(g.translate(x, 2.66 + h * STACK, z));
      }
    }
  const hull = new THREE.Mesh(merge(L), new THREE.MeshLambertMaterial({ vertexColors: true }));
  ship.add(hull);
  ship.add(new THREE.Mesh(merge(C), contMat));
  ship.add(new THREE.Mesh(merge(H), new THREE.MeshLambertMaterial({ vertexColors: true, map: hullTex() })));
  const ct = cabinTex();
  ship.add(new THREE.Mesh(merge(K), new THREE.MeshLambertMaterial({ vertexColors: true, map: ct.map, emissive: '#ffffff', emissiveMap: ct.glow })));
  // janelas acesas (sempre brilham: lindo na tempestade)
  const W: THREE.BufferGeometry[] = [];
  // janelas saltadas 6 cm das paredes (4 cm piscavam em GPU com depth de 16 bits)
  // passadiço: faixa larga de vidro na frente da ponte (as outras janelas vêm da textura, com brilho próprio)
  W.push(box(0.06, 0.34, 3.4, '#ffd890', 7.77, 7.0, 0, 0, 0, 0, 0));
  W.push(sph(0.14, '#fff2c0', -10.2, 6.05, 0));
  const windows = new THREE.Mesh(merge(W), new THREE.MeshBasicMaterial({ vertexColors: true }));
  ship.add(windows);
  // bote salva-vidas (laranja) pendurado no costado
  const lifeboat = new THREE.Group();
  const lb = merge([
    sph(1, '#ff7a1a', 0, 0, 0, 1.5, 0.42, 0.62, 12),
    box(2.2, 0.16, 0.96, '#ffffff', 0, 0.22, 0, 0, 0, 0, 0),
    box(0.9, 0.5, 0.9, '#ff7a1a', 0.8, 0.45, 0, 0, 0, 0, 0),
  ]);
  lifeboat.add(new THREE.Mesh(lb, new THREE.MeshLambertMaterial({ vertexColors: true })));
  lifeboat.position.set(5, 3.4, 3.4);
  ship.add(lifeboat);
  void tier;
  return { ship, loose, windows, lifeboat, mastTip: new THREE.Vector3(-10.2, 6.1, 0) };
}
function crateGeo(): THREE.BufferGeometry {
  const L = [box(0.9, 0.9, 0.9, '#d8a060', 0, 0.45, 0, 0, 0, 0, 0.05)];
  for (const s of [-1, 1]) {
    L.push(box(0.94, 0.12, 0.94, '#a8703a', 0, 0.45 + s * 0.36, 0, 0, 0, 0, 0));
    L.push(box(0.12, 0.94, 0.94, '#a8703a', s * 0.36, 0.45, 0, 0, 0, 0, 0));
  }
  L.push(box(0.92, 0.1, 0.92, '#b8804a', 0, 0.45, 0, 0, 0, Math.PI / 4, 0));
  return merge(L);
}
interface Gull {
  g: THREE.Group;
  wl: THREE.Object3D;
  wr: THREE.Object3D;
  ph: number;
}
function gullModel(mat: THREE.Material): Gull {
  const g = new THREE.Group();
  const body = merge([sph(0.22, '#ffffff', 0, 0, 0, 1.6, 0.85, 0.85, 8), sph(0.13, '#ffffff', 0.32, 0.1, 0, 1, 1, 1, 8), cone(0.04, 0.16, '#ffa020', 0.47, 0.09, 0, 0, 0, -Math.PI / 2, 5), sph(0.025, '#202020', 0.38, 0.15, 0.08), sph(0.025, '#202020', 0.38, 0.15, -0.08), box(0.2, 0.04, 0.16, '#d8dce4', -0.36, 0.02, 0)]);
  g.add(new THREE.Mesh(body, mat));
  const wingG = merge([box(0.28, 0.03, 0.5, '#eef0f4', 0, 0, 0.25), box(0.22, 0.03, 0.28, '#3a3a44', -0.03, 0, 0.62)]);
  const wl = new THREE.Group();
  const wr = new THREE.Group();
  wl.add(new THREE.Mesh(wingG, mat));
  const m2 = new THREE.Mesh(wingG, mat);
  m2.scale.z = -1;
  wr.add(m2);
  wl.position.set(0, 0.06, 0.08);
  wr.position.set(0, 0.06, -0.08);
  g.add(wl, wr);
  return { g, wl, wr, ph: Math.random() * TAU };
}
/** raio: zigue-zague em tiras (aditivo) */
function boltGeo(from: THREE.Vector3, to: THREE.Vector3): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [from.clone()];
  const n = 12;
  for (let i = 1; i < n; i++) {
    const k = i / n;
    pts.push(from.clone().lerp(to, k).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6)));
  }
  pts.push(to.clone());
  const L: THREE.BufferGeometry[] = [];
  const add = (a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    const g = new THREE.BoxGeometry(w, a.distanceTo(b), w);
    const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(1, 0, 0));
    g.rotateX(Math.PI / 2);
    g.applyMatrix4(m);
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    L.push(clean(paint(g, '#ffffff')));
  };
  for (let i = 0; i < pts.length - 1; i++) add(pts[i], pts[i + 1], 0.45);
  // galhinho
  const j = 4 + Math.floor(Math.random() * 4);
  const br = pts[j].clone().add(new THREE.Vector3(5 + Math.random() * 4, -8, (Math.random() - 0.5) * 6));
  add(pts[j], br, 0.25);
  return merge(L);
}

class JangadaIntro {
  private c: Cine;
  private tier: number;
  private st: Stage3D;
  private sky: Sky;
  private ocean: Ocean;
  private sc: SkyCols = skyAt(0.72, 0);
  private hemi = new THREE.HemisphereLight('#ffd8b0', '#2a5a7a', 1.2);
  private sun = new THREE.DirectionalLight('#ffd0a0', 1.5);
  private ship: ReturnType<typeof shipModel>;
  private hero: PaperChar;
  private crew: PaperChar[] = [];
  private crate: THREE.Mesh;
  private raft: THREE.Group;
  private hook: THREE.Mesh;
  private line: THREE.Line;
  private gulls: Gull[] = [];
  private lander: Gull;
  private debris: { m: THREE.Mesh; x: number; z: number; ph: number }[] = [];
  private isles = new THREE.Group();
  private rain: THREE.LineSegments | null = null;
  private bolt: THREE.Mesh | null = null;
  private boltMat = new THREE.MeshBasicMaterial({ color: '#e8f2ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private boltI = 0;
  private boltT = -9;
  private splashes: THREE.Sprite[] = [];
  private glow: THREE.CanvasTexture;
  private au = new JAudio();
  private song = '';
  private cues = new Set<string>();
  private v = new THREE.Vector3();
  private look = new THREE.Vector3();
  private crateP = new THREE.Vector3();
  private tmpC = new THREE.Color();

  constructor(root: HTMLElement) {
    this.tier = detectInitialTier();
    this.c = new Cine({
      id: 'jangada',
      root,
      duration: T_END,
      subs: SUBS,
      vignette: 'rgba(40,20,10,.42)',
      grade: 'saturate(1.12) contrast(1.04)',
      iconBg: '#fff6dc',
      title: {
        at: T_TITLE,
        text: () => t('jangada.name', 'Jangada Bloop').toUpperCase(),
        tagline: () => t('jangada.i.tag', 'Pesque, construa e explore o mar!'),
        colors: ['#ffffff', '#ffe066', '#ff9a2e', '#0a3a6a'],
        sting: null,
      },
    });
    // near 0,25 (era 0,1): 2,5× mais precisão de profundidade no navio (sem tremedeira)
    const st = this.c.stage3d(this.tier, { fov: 50, near: 0.25, far: 1400 });
    this.st = st;
    const S = st.scene;
    S.fog = new THREE.FogExp2('#ffb58e', 0.004);
    S.add(this.hemi, this.sun, this.sun.target);
    this.sky = new Sky(this.tier);
    S.add(this.sky.group);
    this.ocean = new Ocean(this.tier, this.sky.cloudTex);
    // sem ilhas perto (o padrão do Vector4 tem w = 1: "ilha" de raio 0 na origem escurece o mar)
    this.ocean.setIsles([]);
    S.add(this.ocean.mesh);
    // navio
    this.ship = shipModel(this.tier);
    S.add(this.ship.ship);
    // herói e tripulação
    this.hero = new PaperChar(mySpec(), { radius: 0.42, cell: 128, shadow: true });
    S.add(this.hero.root);
    const cols: [string, string, Partial<Record<'head' | 'mouth' | 'face', string>>][] = [
      ['#ff8a3a', '#ffd34a', { head: 'h_cap', mouth: 'mo_mustache' }],
      ['#5ec8ff', '#ffffff', { head: 'h_beanie' }],
      ['#7ad86a', '#ffd34a', { head: 'h_bow' }],
    ];
    for (const [a, b, p] of cols) {
      const ch = new PaperChar(npcSpec(a, b, p), { radius: 0.3, cell: 96 });
      this.ship.lifeboat.add(ch.root);
      this.crew.push(ch);
    }
    this.crew.forEach((ch, i) => ch.root.position.set(-0.7 + i * 0.55, 0.3, 0));
    // caixote do naufrágio
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.crate = new THREE.Mesh(crateGeo(), vc);
    this.crate.visible = false;
    S.add(this.crate);
    // jangadinha do amanhecer: 4 pisos (como o jogo começa), o caixote e o gancho
    this.raft = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(foundationGeo(i + 1), vc);
      m.position.set((i % 2 ? 0.75 : -0.75), -0.32, i < 2 ? -0.75 : 0.75);
      this.raft.add(m);
    }
    const cr2 = new THREE.Mesh(crateGeo(), vc);
    cr2.position.set(0.85, 0, -0.75);
    cr2.rotation.y = 0.35;
    cr2.scale.setScalar(0.8);
    this.raft.add(cr2);
    this.raft.visible = false;
    S.add(this.raft);
    this.hook = new THREE.Mesh(toolGeo('hook')!, vc);
    this.hook.scale.setScalar(1.3);
    S.add(this.hook);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(17 * 3), 3));
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: '#fff3c8' }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    S.add(this.line);
    // restos boiando perto da jangada (o que se pesca no jogo)
    const kinds = ['plank', 'barrel', 'plastic', 'leaf', 'plank', 'barrel', 'plastic', 'plank'] as const;
    const nd = [4, 6, 8, 8][this.tier] ?? 6;
    for (let i = 0; i < nd; i++) {
      const a = 0.4 + i * 0.75;
      const r = 5 + (i % 3) * 3.2 + i * 0.6;
      const m = new THREE.Mesh(debrisGeo(kinds[i % kinds.length]), vc);
      this.debris.push({ m, x: Math.cos(a) * r + 4, z: Math.sin(a) * r * 0.8, ph: i * 1.3 });
      m.visible = false;
      S.add(m);
    }
    // o barril que o gancho pega no fim: bem na frente
    if (this.debris[1]) {
      this.debris[1].x = 7.5;
      this.debris[1].z = -1.2;
    }
    // ilhas no horizonte (lado do nascer do sol)
    const isl: [number, number, number, number, 'tropical' | 'rocky' | 'jungle'][] = [
      [210, -110, 22, 5, 'tropical'],
      [260, -10, 34, 8, 'jungle'],
      [190, 70, 16, 4, 'rocky'],
    ];
    for (const [x, z, r, pk, b] of isl) {
      const m = new THREE.Mesh(isleFarGeo(r, pk, b, b === 'rocky' ? '#7a8a6a' : '#3aa84e', '#f2deb0'), vc);
      m.position.set(x, -0.3, z);
      this.isles.add(m);
    }
    this.isles.visible = false;
    S.add(this.isles);
    // gaivotas
    const gm = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const ng = [2, 3, 4, 5][this.tier] ?? 3;
    for (let i = 0; i < ng; i++) {
      const gl = gullModel(gm);
      S.add(gl.g);
      this.gulls.push(gl);
    }
    this.lander = gullModel(gm);
    this.lander.g.visible = false;
    S.add(this.lander.g);
    // respingos
    this.glow = glowTex();
    const nsp = [10, 14, 20, 24][this.tier] ?? 14;
    for (let i = 0; i < nsp; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: true }));
      sp.visible = false;
      sp.userData = { t0: -9, x: 0, y: 0, z: 0, s: 1 };
      this.splashes.push(sp);
      S.add(sp);
    }
    this.c.onFrame = (tt, dt) => this.frame(tt, dt);
    this.c.onDispose = () => this.dispose();
    if (location.search.includes('debug')) (window as unknown as { __intro: unknown }).__intro = this;
  }

  play(): Promise<void> {
    this.au.start();
    return this.c.play();
  }

  /* ------------------------------ tempo → mundo ------------------------------ */
  /** posição x do navio (vai para -x, rumo ao pôr do sol; diminui na tempestade) */
  private shipX(tt: number): number {
    return 34 - 1.4 * Math.min(tt, T_SINK) - 0.35 * Math.max(0, tt - T_SINK);
  }
  private amp(tt: number): number {
    if (tt >= T_BLACK) return 0.55;
    return lerp(0.9, 2.5, ease(seg(tt, T_STORM, T_STORM + 4))) - ease(seg(tt, T_JUMP + 1.5, T_BLACK)) * 0.6;
  }
  private storm(tt: number): number {
    if (tt >= T_BLACK) return 0;
    return ease(seg(tt, T_STORM - 0.5, T_STORM + 3.5)) * (1 - 0.35 * seg(tt, T_JUMP + 2, T_BLACK));
  }
  private tod(tt: number): number {
    if (tt >= T_BLACK) return lerp(0.03, 0.085, ease(seg(tt, T_DAWN, T_END - 2)));
    return lerp(0.715, 0.775, seg(tt, 0, T_BLACK));
  }
  private h(x: number, z: number, tt: number): number {
    return waveH(x, z, tt, this.amp(tt), 0, 0);
  }
  private cue(id: string, fn: () => void): void {
    if (this.cues.has(id)) return;
    this.cues.add(id);
    fn();
  }
  private splash(x: number, y: number, z: number, s: number, tt: number): void {
    const sp = this.splashes.find((p) => tt - p.userData.t0 > 1.2) ?? this.splashes[0];
    sp.userData = { t0: tt, x, y, z, s };
    sp.visible = true;
  }

  /* ------------------------------ quadro ------------------------------ */
  private frame(tt: number, dt: number): void {
    const st = this.st;
    const cam = st.cam;
    const dawn = tt >= T_BLACK;
    const storm = this.storm(tt);
    const amp = this.amp(tt);
    // ---------------- navio: flutua nas ondas, aderna e afunda ----------------
    const S = this.ship.ship;
    const sx = this.shipX(tt);
    S.visible = !dawn && tt < T_BLACK - 0.2;
    const hb = this.h(sx - 10, 0, tt);
    const hs = this.h(sx + 10, 0, tt);
    const hp = this.h(sx, -3, tt);
    const hsb = this.h(sx, 3, tt);
    const sinkK = ease(seg(tt, T_SINK + 1.8, T_BLACK - 0.5));
    const listK = ease(seg(tt, T_SINK, T_SINK + 2.5));
    S.position.set(sx, (hb + hs) * 0.5 * 0.8 - sinkK * 11 - listK * 0.4, 0);
    S.rotation.set(Math.atan2(hsb - hp, 6) * 0.7 + listK * 0.16 + Math.sin(tt * 1.7) * 0.02 * storm, 0, Math.atan2(hs - hb, 20) * 0.7 + sinkK * 0.62 + listK * 0.05, 'XYZ');
    S.updateMatrixWorld(true);
    this.ship.windows.visible = sinkK < 0.7;
    // contêineres soltos: escorregam e caem no mar, depois boiam
    for (let i = 0; i < this.ship.loose.length; i++) {
      const m = this.ship.loose[i];
      const t0 = T_SINK + 0.8 + i * 0.45;
      if (tt < t0) {
        if (m.parent !== S) S.add(m);
        m.position.copy(m.userData.home);
        m.rotation.set(0, 0, 0);
        continue;
      }
      if (m.parent === S) {
        // solta para o mundo na posição atual
        m.updateMatrixWorld();
        m.matrixWorld.decompose(m.position, m.quaternion, m.scale);
        m.userData.w0 = m.position.clone();
        m.userData.side = m.userData.home.z > 0 ? 1 : -1;
        st.scene.add(m);
      }
      const k = tt - t0;
      const w0 = m.userData.w0 as THREE.Vector3;
      const side = m.userData.side as number;
      const fx = w0.x - k * 0.6;
      const fz = w0.z + side * Math.min(k, 1.2) * 4;
      const fall = w0.y - 4.9 * k * k;
      const water = this.h(fx, fz, tt) - 0.15;
      if (fall > water) {
        m.position.set(fx, fall, fz);
        m.rotation.set(side * k * 1.6, 0, k * 0.4);
      } else {
        if (!m.userData.sp) {
          m.userData.sp = 1;
          this.splash(fx, water + 0.5, fz, 4, tt);
          sfx.play('jangada.splashL', { db: -4 });
        }
        m.position.set(fx, water + Math.sin(tt * 1.6 + i) * 0.05, fz);
        m.rotation.set(side * 1.2 + Math.sin(tt + i) * 0.1, 0, 0.3 + Math.sin(tt * 1.3 + i) * 0.08);
      }
      m.visible = !dawn;
    }
    // bote salva-vidas: desce pelo costado e vai embora com a tripulação acenando
    const lb = this.ship.lifeboat;
    const lbDown = seg(tt, T_SINK + 1.2, T_SINK + 2.6);
    if (tt < T_SINK + 2.6) {
      if (lb.parent !== S) S.add(lb);
      lb.position.set(5, 3.4 - ease(lbDown) * 1.2, 3.4 + ease(lbDown) * 0.6);
      lb.rotation.set(0, 0, 0);
    } else {
      if (lb.parent === S) {
        lb.updateMatrixWorld();
        lb.matrixWorld.decompose(lb.position, lb.quaternion, lb.scale);
        lb.userData.w0 = lb.position.clone();
        st.scene.add(lb);
        this.splash(lb.position.x, lb.position.y, lb.position.z, 2.5, tt);
      }
      const k = tt - (T_SINK + 2.6);
      const w0 = lb.userData.w0 as THREE.Vector3;
      const x = w0.x + k * 1.5;
      const z = w0.z + 2 + k * 2.6;
      lb.position.set(x, lerp(w0.y, this.h(x, z, tt) + 0.2, clamp(k * 2)), z);
      lb.rotation.set(Math.sin(tt * 2.1) * 0.12, -0.9, Math.sin(tt * 1.7) * 0.08);
      lb.visible = !dawn;
    }
    lb.updateMatrixWorld(true);
    // ---------------- herói ----------------
    const hero = this.hero;
    const bowL = this.v.set(-9.6, 2.85, 0);
    const bowW = bowL.clone().applyMatrix4(S.matrixWorld);
    const crateAt = this.crateP.set(this.shipX(T_JUMP) - 13.2, 0, 4.6);
    const cH = this.h(crateAt.x, crateAt.z, tt);
    this.crate.visible = tt >= T_SINK && !dawn;
    this.crate.position.set(crateAt.x, cH - 0.42, crateAt.z);
    this.crate.rotation.set(Math.sin(tt * 1.9) * 0.18 * (amp / 2), 0.6, Math.cos(tt * 1.5) * 0.16 * (amp / 2));
    const hpos = new THREE.Vector3();
    let yaw = -Math.PI / 2;
    let happy = false;
    let hurt = false;
    let faint = false;
    let act = -1;
    if (!dawn) {
      if (tt < T_JUMP) {
        hpos.copy(bowW);
        happy = tt >= T_BOW && tt < T_STORM + 1;
        hurt = tt >= T_STORM + 2;
        yaw = tt < T_STORM ? -Math.PI / 2 : tt < T_SINK ? -Math.PI / 2 + 0.6 : 0.9;
      } else {
        const k = seg(tt, T_JUMP, T_JUMP + 1.1);
        const top = this.v.copy(this.crate.position).add(new THREE.Vector3(0, 0.88, 0));
        if (k < 1) {
          hpos.copy(bowW).lerp(top, easeOut(k));
          hpos.y += bump(k) * 2.6;
        } else hpos.copy(top);
        yaw = 0.4;
        hurt = k < 1;
        if (k >= 1) this.cue('land', () => this.splash(top.x, top.y - 0.6, top.z, 2, tt));
      }
    } else {
      // jangadinha
      const rh = this.h(0, 0, tt);
      this.raft.position.set(0, rh * 0.8, 0);
      this.raft.rotation.set(Math.sin(tt * 1.1) * 0.03, 0.15, Math.cos(tt * 0.9) * 0.03);
      hpos.set(-0.5, rh * 0.8, 0.3);
      faint = tt < T_DAWN + 1.4;
      happy = !faint && tt < T_DAWN + 4.5;
      yaw = tt < T_WIDE ? 0.9 : Math.PI / 2;
      if (tt >= T_THROW && tt < T_THROW + 0.45) act = (tt - T_THROW) / 0.45;
      if (tt >= T_TITLE) happy = true;
    }
    this.raft.visible = dawn;
    if (happy) hpos.y += Math.abs(Math.sin(tt * 4.2)) * 0.16;
    hero.root.position.copy(hpos);
    // ---------------- câmera (planos) ----------------
    const pos = new THREE.Vector3();
    const look = this.look;
    let hand = 0;
    if (tt < T_BOW) {
      // 1. grua descendo ao lado do navio, o sol atrás dele
      const k = ease5(seg(tt, 0, T_BOW));
      pos.set(sx + lerp(34, 6, k), lerp(20, 4.2, k), lerp(34, 21, k));
      look.set(sx + lerp(-14, -6, k), lerp(0, 3, k), lerp(-8, -2, k));
    } else if (tt < T_STORM) {
      // 2. pela frente da proa: travelling até o Bloop
      const k = ease(seg(tt, T_BOW, T_STORM));
      pos.copy(new THREE.Vector3(lerp(-17, -13.2, k), lerp(4.6, 3.5, k), lerp(6, 2.4, k)).applyMatrix4(S.matrixWorld));
      look.copy(bowW).add(new THREE.Vector3(1.2, 0.5 - k * 0.2, 0));
      hand = 0.3;
    } else if (tt < T_SINK) {
      // 3. tempestade: plano largo baixo, balançando
      const k = ease(seg(tt, T_STORM, T_SINK));
      pos.set(sx + lerp(4, -2, k), lerp(7, 3.6, k) + this.h(sx, 26, tt) * 0.5, lerp(32, 24, k));
      look.set(sx - 1, 3 + k, 0);
      hand = 1 + storm;
    } else if (tt < T_JUMP - 1.2) {
      // 4a. close no Bloop agarrado na proa
      const k = ease(seg(tt, T_SINK, T_JUMP - 1.2));
      pos.copy(new THREE.Vector3(lerp(-15, -14, k), 4.2, lerp(4, 5.2, k)).applyMatrix4(S.matrixWorld));
      look.copy(bowW).add(new THREE.Vector3(0, 0.6, 0));
      hand = 2.2;
    } else if (tt < T_JUMP + 1.4) {
      // 4b. largo: o navio inclinando, o bote saindo e o pulo
      const k = ease(seg(tt, T_JUMP - 1.2, T_JUMP + 1.4));
      pos.set(sx - 14 + k * 2, 3.5 + this.h(sx - 14, 20, tt) * 0.4, 21 - k * 3);
      look.set(lerp(sx - 6, crateAt.x + 2, k), 1.6, lerp(0, crateAt.z, k));
      hand = 1.6;
    } else if (tt < T_BLACK) {
      // 4c. o Bloop no caixote, o navio sumindo atrás
      const k = ease(seg(tt, T_JUMP + 1.4, T_BLACK));
      pos.set(crateAt.x - lerp(3.6, 4.4, k), cH + lerp(1.4, 1.9, k), crateAt.z + lerp(5.6, 7, k));
      look.set(crateAt.x + 4, cH + 1.2, crateAt.z - 4);
      hand = 1.4;
    } else if (tt < T_DAWN) {
      pos.set(-6, 1.6, 6);
      look.set(0, 0.5, 0);
    } else if (tt < T_WIDE) {
      // 5. amanhecer: dolly baixo em volta da jangadinha
      const k = ease(seg(tt, T_DAWN, T_WIDE));
      const a = lerp(2.2, 1.35, k);
      const R = lerp(4.2, 3.4, k);
      pos.set(Math.cos(a) * R, lerp(1.5, 1.8, k), Math.sin(a) * R);
      look.set(-0.2, 0.45 + k * 0.1, 0);
      hand = 0.25;
    } else {
      // 6. grua para trás e para cima, revelando o mar, os restos e as ilhas
      const k = ease5(seg(tt, T_WIDE, T_END - 0.6));
      pos.set(lerp(-3.6, -6.4, k), lerp(1.8, 3.2, k), lerp(2.2, 3.2, k));
      look.set(lerp(1, 12, k), lerp(0.6, 1.1, k), lerp(0, -2.2, k));
      hand = 0.15;
    }
    cam.position.copy(pos);
    // nunca debaixo d'água
    const wc = this.h(pos.x, pos.z, tt);
    if (cam.position.y < wc + 0.6) cam.position.y = wc + 0.6;
    cam.up.set(0, 1, 0);
    cam.lookAt(look);
    if (hand > 0) {
      cam.rotation.z += Math.sin(tt * 0.9) * 0.012 * hand;
      cam.rotateX(Math.sin(tt * 1.3 + 1) * 0.006 * hand);
    }
    cam.updateMatrixWorld();
    // ---------------- céu, luz, mar ----------------
    const c = (this.sc = skyAt(this.tod(tt), storm, this.sc));
    // amanhecer: mar turquesa e transparente (raso de cartão-postal)
    if (dawn) {
      const k = ease(seg(tt, T_DAWN, T_WIDE));
      c.deep.lerp(this.tmpC.set('#0e7fa8'), 0.5 + k * 0.3);
      c.shallow.lerp(this.tmpC.set('#3ee0d0'), 0.6);
    }
    const bolt = this.boltLight(tt);
    this.hemi.color.copy(c.amb);
    this.hemi.groundColor.set(dawn ? '#2a8aa8' : '#1a3a5a');
    this.hemi.intensity = c.ambI + bolt * 2.4;
    const ld = c.night > 0.5 ? c.moon : c.dir;
    this.sun.position.set(cam.position.x + ld.x * 40, Math.max(4, ld.y * 40), cam.position.z + ld.z * 40);
    this.sun.target.position.set(cam.position.x, 0, cam.position.z);
    this.sun.color.copy(c.sun);
    this.sun.intensity = (c.night > 0.5 ? 0.35 : c.sunI) + bolt * 1.5;
    const fog = st.scene.fog as THREE.FogExp2;
    fog.color.copy(c.fog);
    fog.density = dawn ? 0.0022 : 0.003 + storm * 0.011;
    st.r.setClearColor(fog.color);
    this.ocean.update(cam, tt, amp, 0, 0, c, fog.density, storm, fog.color);
    const ou = this.ocean.mat.uniforms;
    if (dawn) ou.uRaft.value.set(-1.5, -1.5, 1.5, 1.5);
    else ou.uRaft.value.set(sx - 11, -2.6, sx + 11, 2.6);
    // esteira atrás do navio; espuma onde ele afunda
    this.ocean.setWake(
      dawn
        ? []
        : [
            [sx + 13, 0, 3.5, 0.9 * (1 - sinkK)],
            [sx + 18, 0, 4.5, 0.6 * (1 - sinkK)],
            [sx + 24, 0, 5, 0.35 * (1 - sinkK)],
            [sx - 2, 0, 9, sinkK * 1.1],
          ],
    );
    this.sky.update(cam, tt, dt, c, storm);
    this.isles.visible = dawn;
    // ---------------- vida ----------------
    hero.update(dt, cam, { yaw, speed: 0, act, happy, hurt, faint });
    for (let i = 0; i < this.crew.length; i++) this.crew[i].update(dt, cam, { yaw: Math.atan2(cam.position.x - lb.position.x, cam.position.z - lb.position.z), speed: 0, act: -1, happy: tt > T_SINK + 2.6, hurt: false });
    this.crew.forEach((ch, i) => (ch.root.position.y = 0.3 + (tt > T_SINK + 2.6 ? Math.abs(Math.sin(tt * 5 + i * 1.3)) * 0.15 : 0)));
    this.updateGulls(tt, dt, sx, dawn);
    this.updateHook(tt, dawn);
    for (const d of this.debris) {
      d.m.visible = dawn;
      if (!dawn) continue;
      const y = this.h(d.x, d.z, tt);
      d.m.position.set(d.x - (tt - T_DAWN) * 0.12, y - 0.08, d.z);
      d.m.rotation.set(Math.sin(tt * 1.2 + d.ph) * 0.12, d.ph + tt * 0.05, Math.cos(tt + d.ph) * 0.1);
    }
    this.updateRain(dt, storm);
    this.updateSplashes(tt);
    // bolhas onde o navio sumiu
    if (sinkK > 0.75 && !dawn && Math.random() < dt * 14) this.splash(sx - 4 + (Math.random() - 0.5) * 10, this.h(sx, 0, tt) + 0.2, (Math.random() - 0.5) * 6, 1 + Math.random() * 1.6, tt);
    // ---------------- som ----------------
    const song = tt < T_STORM - 1 ? 'day' : tt < T_BLACK ? 'storm' : tt < T_DAWN ? 'off' : 'day';
    if (song !== this.song) {
      this.song = song;
      this.au.setSong(song as 'day' | 'storm' | 'off');
    }
    this.au.storm = storm;
    this.au.night = dawn ? 0 : clamp((this.tod(tt) - 0.74) * 20);
    if (tt >= T_SINK + 0.4) this.cue('creak', () => sfx.play('jangada.creak', { db: 6 }));
    if (tt >= T_JUMP) this.cue('jump', () => sfx.play('jangada.jump'));
    if (tt >= T_JUMP + 1.1) this.cue('splash', () => sfx.play('jangada.splashL'));
    if (tt >= T_DAWN + 0.2) this.cue('dawn', () => this.au.dawn());
    if (tt >= T_DAWN + 1.5) this.cue('wake', () => sfx.play('jangada.ahh'));
    if (tt >= T_THROW) this.cue('throw', () => this.au.throwHook(0.8));
    if (tt >= T_THROW + 1) this.cue('plop', () => this.au.splash(null, 0.4));
    if (tt >= T_TITLE) this.cue('title', () => this.au.fanfare());
    st.render();
  }

  /** raios: clarão, tira de luz e trovão (intensidade extra da luz 0..1) */
  private boltLight(tt: number): number {
    while (this.boltI < BOLTS.length && tt >= BOLTS[this.boltI]) {
      const big = this.boltI === 3;
      this.boltT = BOLTS[this.boltI];
      this.boltI++;
      const S = this.ship.ship;
      const cam = this.st.cam;
      // longe, de lado, para dentro da cena
      const fwd = new THREE.Vector3();
      cam.getWorldDirection(fwd);
      const to = big ? this.ship.mastTip.clone().applyMatrix4(S.matrixWorld) : cam.position.clone().addScaledVector(fwd, 70).add(new THREE.Vector3((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 20));
      if (!big) to.y = 0;
      const from = to.clone().add(new THREE.Vector3((Math.random() - 0.5) * 20, big ? 50 : 70, (Math.random() - 0.5) * 10));
      if (this.bolt) {
        this.bolt.geometry.dispose();
        this.bolt.removeFromParent();
      }
      this.bolt = new THREE.Mesh(boltGeo(from, to), this.boltMat);
      this.bolt.frustumCulled = false;
      this.st.scene.add(this.bolt);
      this.c.flash(big ? 0.85 : 0.5, '#dfe8ff');
      this.au.thunder(big ? 0 : 180);
      if (big) sfx.play('jangada.crack', { db: 4 });
    }
    const k = tt - this.boltT;
    const on = k >= 0 && k < 0.5 ? (k < 0.08 ? 1 : k < 0.14 ? 0.2 : k < 0.24 ? 0.8 : Math.max(0, 1 - (k - 0.24) * 4)) : 0;
    if (this.bolt) {
      this.bolt.visible = on > 0.05;
      this.boltMat.opacity = on;
    }
    return on;
  }

  private updateGulls(tt: number, dt: number, sx: number, dawn: boolean): void {
    const on = tt < T_STORM + 1 || dawn;
    for (let i = 0; i < this.gulls.length; i++) {
      const g = this.gulls[i];
      g.g.visible = on;
      if (!on) continue;
      g.ph += dt * 7;
      const f = Math.sin(g.ph) * 0.6;
      g.wl.rotation.x = -f;
      g.wr.rotation.x = f;
      const a = tt * 0.25 + i * (TAU / this.gulls.length);
      const cx = dawn ? 6 : sx - 4;
      const R = dawn ? 9 + i * 2 : 12 + i * 3;
      g.g.position.set(cx + Math.cos(a) * R, (dawn ? 6 : 10) + Math.sin(tt * 0.7 + i) * 1.2, Math.sin(a) * R * 0.7);
      g.g.rotation.set(0, -a - Math.PI, Math.sin(a) * 0.25);
    }
    // a gaivota que pousa no caixote da jangadinha
    const L = this.lander;
    const t0 = T_DAWN + 2.2;
    L.g.visible = dawn && tt > t0 - 3;
    if (!L.g.visible) return;
    this.raft.updateMatrixWorld();
    const perch = new THREE.Vector3(0.85, 0.74, -0.75).applyMatrix4(this.raft.matrixWorld);
    const k = seg(tt, t0 - 3, t0);
    const from = new THREE.Vector3(12, 6, -6);
    L.g.position.copy(from).lerp(perch, ease(k));
    L.g.position.y += bump(k) * 0.8;
    const dir = k < 1 ? perch.clone().sub(from) : new THREE.Vector3(-1, 0, 0.8);
    L.g.lookAt(L.g.position.x + dir.x, L.g.position.y, L.g.position.z + dir.z);
    L.g.rotateY(-Math.PI / 2);
    L.ph += dt * (k < 1 ? 9 : 0);
    const flap = k < 1 ? Math.sin(L.ph) * 0.7 : tt > T_TITLE && tt < T_TITLE + 1.5 ? Math.sin(tt * 18) * 0.4 : -0.25;
    L.wl.rotation.x = -flap;
    L.wr.rotation.x = flap;
    if (k >= 1) this.cue('gull', () => sfx.play('jangada.gull', { db: -2 }));
  }

  /** gancho: no chão da jangada; no fim, voa até um barril e a corda estica */
  private updateHook(tt: number, dawn: boolean): void {
    this.hook.visible = dawn;
    this.line.visible = false;
    if (!dawn) return;
    this.raft.updateMatrixWorld();
    const rest = new THREE.Vector3(-0.1, 0.12, 0.85).applyMatrix4(this.raft.matrixWorld);
    const hand = this.hero.root.position.clone().add(new THREE.Vector3(0.2, 0.7, 0));
    const tgt = this.debris[1] ?? this.debris[0];
    if (tt < T_THROW - 0.4) {
      this.hook.position.copy(rest);
      this.hook.rotation.set(Math.PI / 2, 0, 0.6);
      return;
    }
    const goal = tgt.m.position.clone().add(new THREE.Vector3(0, 0.25, 0));
    const k = seg(tt, T_THROW, T_THROW + 1);
    if (tt < T_THROW) {
      this.hook.position.copy(hand);
      this.hook.rotation.set(0, 0, 0.4);
    } else {
      this.hook.position.copy(hand).lerp(goal, k);
      this.hook.position.y += bump(k) * 2.4;
      this.hook.rotation.set(0, 0, -k * 2.4);
    }
    // corda (curva caída)
    const a = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= 16; i++) {
      const u = i / 16;
      const p = hand.clone().lerp(this.hook.position, u);
      p.y -= Math.sin(u * Math.PI) * (k < 1 ? 0.1 : 0.35);
      a.setXYZ(i, p.x, p.y, p.z);
    }
    a.needsUpdate = true;
    this.line.visible = true;
  }

  private updateRain(dt: number, storm: number): void {
    const on = storm > 0.3 && this.tier >= 1;
    if (!on) {
      if (this.rain) this.rain.visible = false;
      return;
    }
    if (!this.rain) {
      const n = this.tier >= 2 ? 520 : 260;
      const g = new THREE.BufferGeometry();
      const a = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) {
        const x = (Math.random() - 0.5) * 34;
        const y = Math.random() * 18;
        const z = (Math.random() - 0.5) * 34;
        a.set([x, y, z, x + 0.18, y - 0.8, z], i * 6);
      }
      g.setAttribute('position', new THREE.BufferAttribute(a, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#cfe0ff', transparent: true, opacity: 0.5, fog: false }));
      this.rain.frustumCulled = false;
      this.st.scene.add(this.rain);
    }
    this.rain.visible = true;
    const pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const fall = dt * 22;
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= fall;
      arr[i + 4] -= fall;
      arr[i] += fall * 0.2;
      arr[i + 3] += fall * 0.2;
      if (arr[i + 1] < -2) {
        arr[i + 1] += 20;
        arr[i + 4] += 20;
        arr[i] -= 4;
        arr[i + 3] -= 4;
      }
      if (arr[i] > 17) {
        arr[i] -= 34;
        arr[i + 3] -= 34;
      }
    }
    pos.needsUpdate = true;
    const cp = this.st.cam.position;
    this.rain.position.set(cp.x, cp.y - 7, cp.z);
    (this.rain.material as THREE.LineBasicMaterial).opacity = (storm - 0.3) * 0.75;
  }

  private updateSplashes(tt: number): void {
    for (const sp of this.splashes) {
      const u = sp.userData as { t0: number; x: number; y: number; z: number; s: number };
      const k = (tt - u.t0) / 1.1;
      if (k < 0 || k > 1) {
        sp.visible = false;
        continue;
      }
      sp.visible = true;
      sp.position.set(u.x, u.y + easeOut(k) * u.s * 0.35, u.z);
      sp.scale.set(u.s * (0.4 + easeOut(k) * 0.8), u.s * (0.7 + easeOut(k) * 0.9), 1);
      (sp.material as THREE.SpriteMaterial).opacity = (1 - k) * (1 - k) * 0.55;
    }
  }

  private dispose(): void {
    this.au.setSong('off');
    this.au.stop();
    this.hero.dispose();
    for (const ch of this.crew) ch.dispose();
    this.ocean.dispose();
    this.sky.dispose();
    this.bolt?.geometry.dispose();
    this.boltMat.dispose();
    this.glow.dispose();
  }
}

/** toca a abertura por cima de `root` (resolve no fim, ao Pular ou no voltar) */
export function playIntro(root: HTMLElement): Promise<void> {
  return new JangadaIntro(root).play();
}
