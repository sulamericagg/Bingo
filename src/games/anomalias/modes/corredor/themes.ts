/* ============================================================
 *  CORREDOR — 4 temas: hospital, hotel, escola (creche) e metrô.
 *  Cada tema: texturas (canvas), cores, portas, cartazes (normal +
 *  versão estranha) e 6 objetos próprios (alvos das anomalias do tema).
 * ============================================================ */
import * as THREE from 'three';
import { drawingTex, evaMat, paintingTex, signTex, wainscot, wallpaper } from '../../maps/nightkit/tex';
import { NpcBloop } from '../../core/models';
import { canvasTex } from '../common';
import { HW, buildHall, shade, type Hall, type Style } from './hall';

import type { ThemeId } from '../meta';
export type { ThemeId } from '../meta';
export { THEMES, THEME_META } from '../meta';

/** texturas criadas aqui (o corredor descarta no fim; as do nightkit ficam no cache dele) */
let made: THREE.Texture[] = [];
const mkc = (w: number, h: number, d: (x: CanvasRenderingContext2D) => void) => mk(canvasTex(w, h, d));
const mk = <T extends THREE.Texture>(t: T): T => (made.push(t), t);
const tiled = (w: number, draw: (x: CanvasRenderingContext2D) => void) => {
  const t = mk(canvasTex(w, w, draw));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
};

function speckle(base: string, dots: string[], n = 500): THREE.CanvasTexture {
  return tiled(256, (x) => {
    x.fillStyle = base;
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < n; i++) {
      x.fillStyle = dots[i % dots.length];
      x.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    x.strokeStyle = 'rgba(0,0,0,.12)';
    x.lineWidth = 2;
    x.strokeRect(0, 0, 256, 256);
  });
}
function tiles(base: string, grout: string, n: number, accent?: string): THREE.CanvasTexture {
  return tiled(256, (x) => {
    x.fillStyle = grout;
    x.fillRect(0, 0, 256, 256);
    const s = 256 / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        x.fillStyle = accent && j === Math.floor(n / 2) ? accent : base;
        x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
        x.fillStyle = 'rgba(255,255,255,.18)';
        x.fillRect(i * s + 3, j * s + 3, s - 8, 3);
      }
  });
}
function carpet(a: string, b: string, c: string): THREE.CanvasTexture {
  return tiled(256, (x) => {
    x.fillStyle = a;
    x.fillRect(0, 0, 256, 256);
    x.strokeStyle = b;
    x.lineWidth = 6;
    for (const [cx, cy] of [
      [0, 0],
      [128, 128],
      [256, 0],
      [0, 256],
      [256, 256],
    ]) {
      x.beginPath();
      x.moveTo(cx, cy - 60);
      x.lineTo(cx + 60, cy);
      x.lineTo(cx, cy + 60);
      x.lineTo(cx - 60, cy);
      x.closePath();
      x.stroke();
      x.fillStyle = c;
      x.beginPath();
      x.arc(cx, cy, 12, 0, Math.PI * 2);
      x.fill();
    }
  });
}
/** anúncio do metrô (fundo + emoji grande + faixas) */
function adTex(bg: string, emoji: string, band: string, weird = false): THREE.CanvasTexture {
  return mkc(256, 192, (x) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, 256, 192);
    x.fillStyle = band;
    x.fillRect(0, 140, 256, 52);
    x.fillStyle = 'rgba(255,255,255,.3)';
    for (let i = 0; i < 6; i++) x.fillRect(16 + i * 40, 156, 24, 20);
    x.font = '96px "Noto Color Emoji", Fredoka, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(emoji, 128, 72);
    if (weird) {
      x.fillStyle = '#ffe14a';
      for (const ex of [104, 152]) {
        x.beginPath();
        x.arc(ex, 64, 9, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#1a0420';
      for (const ex of [104, 152]) x.fillRect(ex - 2, 56, 4, 16);
    }
  });
}
/** cartaz de hospital (pictograma amigável) */
function hospPoster(kind: number, weird = false): THREE.CanvasTexture {
  return mkc(192, 256, (x) => {
    x.fillStyle = ['#e6f7ff', '#fff1e6', '#eaffea', '#fff8d6'][kind];
    x.fillRect(0, 0, 192, 256);
    x.fillStyle = ['#3f8cff', '#ff7a59', '#3ebf6a', '#e0a400'][kind];
    x.fillRect(0, 0, 192, 40);
    x.font = '84px "Noto Color Emoji", sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(weird ? ['👁️', '🦷', '👀', '🌑'][kind] : ['🧼', '🍎', '💤', '🦷'][kind], 96, 132);
    x.fillStyle = 'rgba(0,0,0,.18)';
    for (let i = 0; i < 3; i++) x.fillRect(30, 200 + i * 14, 132 - i * 24, 7);
  });
}

function hospitalStyle(): Style {
  return {
    id: 'hospital',
    H: 2.8,
    floor: speckle('#d7e3df', ['#9fb4ae', '#ffffff', '#7a9690']),
    floorTile: 1.6,
    wall: tiled(128, (x) => {
      x.fillStyle = '#e8f6f1';
      x.fillRect(0, 0, 128, 128);
    }),
    wallTile: 2,
    wainscot: tiled(128, (x) => {
      x.fillStyle = '#7fd0b8';
      x.fillRect(0, 0, 128, 128);
      x.fillStyle = '#6cbfa6';
      x.fillRect(0, 100, 128, 28);
    }),
    wainH: 1.0,
    ceil: '#f2f5f7',
    trim: '#5aa592',
    door: '#9fd0ff',
    doorStyle: 'window',
    doorNums: ['101', '102', '103', '104'],
    numBg: '#ffffff',
    numFg: '#1d4a8a',
    posters: [0, 1, 2, 3].map((i) => hospPoster(i)),
    posterAlt: [0, 1, 2, 3].map((i) => hospPoster(i, true)),
    posterSize: [0.48, 0.64],
    posterFrame: '#ffffff',
    lightCol: '#eef6ff',
    panelCol: '#f4fbff',
    fog: '#0b1416',
    hemiSky: '#cfe6ff',
    hemiGround: '#40504c',
    walker: '#ff8fb0',
  };
}
function hotelStyle(): Style {
  return {
    id: 'hotel',
    H: 2.7,
    floor: carpet('#8a1f2c', '#c79a2a', '#e8c25a'),
    floorTile: 1.8,
    wall: wallpaper('stripes', '#e8d6a8', '#d9c28e', '#efe0b8'),
    wallTile: 1.4,
    wainscot: tiled(128, (x) => {
      x.fillStyle = '#5a3420';
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = '#7a4a2e';
      x.lineWidth = 6;
      x.strokeRect(14, 14, 100, 100);
    }),
    wainH: 0.9,
    ceil: '#efe6d2',
    trim: '#4a2a18',
    door: '#6b3a1e',
    doorStyle: 'wood',
    doorNums: ['201', '203', '205', '207'],
    numBg: '#c79a2a',
    numFg: '#2a1408',
    posters: (['lake', 'mountain', 'portrait', 'boat'] as const).map((k) => paintingTex(k)),
    posterAlt: (['lakeMonster', 'mountainRed', 'portraitEyes', 'boatEmpty'] as const).map((k) => paintingTex(k)),
    posterSize: [0.7, 0.52],
    posterFrame: '#c79a2a',
    lightCol: '#ffd9a0',
    panelCol: '#ffe8bf',
    fog: '#140c08',
    hemiSky: '#ffe2b8',
    hemiGround: '#4a2a20',
    walker: '#7dc2ff',
  };
}
function escolaStyle(): Style {
  return {
    id: 'escola',
    H: 2.8,
    floor: evaMat(),
    floorTile: 2.0,
    wall: wallpaper('balloons', '#cfe9ff', '#ff8fb0', '#ffd34a'),
    wallTile: 1.3,
    wainscot: wainscot(),
    wainH: 0.85,
    ceil: '#ffffff',
    trim: '#ff9a2e',
    door: '#ffcf2e',
    doorStyle: 'window',
    doorNums: ['🐻', '🐰', '🐸', '🦁'],
    numBg: '#ffffff',
    numFg: '#1d0b3a',
    posters: (['sun', 'family', 'rainbow', 'rocket'] as const).map((k) => drawingTex(k)),
    posterAlt: (['sunSad', 'creepyFamily', 'eyes', 'creature'] as const).map((k) => drawingTex(k)),
    posterSize: [0.62, 0.46],
    posterFrame: '#ff5c9a',
    lightCol: '#fff6e0',
    panelCol: '#fffbe8',
    fog: '#0e0c18',
    hemiSky: '#e8eeff',
    hemiGround: '#5a4a60',
    walker: '#53d36b',
  };
}
function metroStyle(): Style {
  return {
    id: 'metro',
    H: 3.0,
    floor: tiles('#8f949c', '#6a6e76', 4),
    floorTile: 2.0,
    wall: tiles('#f4f4f0', '#c8c8c0', 8),
    wallTile: 1.2,
    wainscot: tiles('#2f7bd9', '#22589c', 8),
    wainH: 0.6,
    ceil: '#5a5e66',
    trim: '#22589c',
    door: '#9aa2ad',
    doorStyle: 'metal',
    doorNums: ['A', 'B', 'C', 'D'],
    numBg: '#ffd34a',
    numFg: '#1d0b3a',
    posters: [adTex('#ff5c9a', '🍦', '#ffffff'), adTex('#5ad1ff', '🚀', '#1d4a8a'), adTex('#3ee07a', '🎧', '#145a2a'), adTex('#ffd34a', '🍕', '#a04a00')],
    posterAlt: [adTex('#4b2a7a', '🍦', '#1d0b3a', true), adTex('#1d1d2a', '🌑', '#3a0a14'), adTex('#3ee07a', '👁️', '#145a2a'), adTex('#ffd34a', '🦷', '#a04a00')],
    posterSize: [0.9, 0.68],
    posterFrame: '#c0c4cc',
    lightCol: '#e6fff6',
    panelCol: '#e8fff8',
    fog: '#0c1014',
    hemiSky: '#d8e8f0',
    hemiGround: '#3a4048',
    walker: '#ffcf2e',
  };
}

export function buildTheme(id: ThemeId): Hall {
  made = [];
  const st = id === 'hospital' ? hospitalStyle() : id === 'hotel' ? hotelStyle() : id === 'escola' ? escolaStyle() : metroStyle();
  const h = buildHall(st, (hh) => themeProps(id, hh));
  for (const t of made) h.b.own(t);
  made = [];
  return h;
}

/** 6 objetos próprios de cada tema (props[...]) */
function themeProps(id: ThemeId, h: Hall): void {
  const b = h.b,
    M = b.mats,
    P = h.props,
    G = h.hall,
    H = h.style.H;
  const box = (p: THREE.Object3D, w: number, hh: number, d: number, x: number, y: number, z: number, col: string | THREE.Material) => b.box(p, w, hh, d, x, y, z, typeof col === 'string' ? M.lam(col) : col);
  const group = (x: number, z: number, ry = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    G.add(g);
    return g;
  };
  const sign = (txt: string, bg: string, fg: string, x: number, y: number, z: number, ry: number, w = 0.5, hh = 0.25) => {
    const m = b.plane(G, w, hh, x, y, z, M.own(new THREE.MeshBasicMaterial({ map: signTex(txt, bg, fg, 256, Math.round((256 * hh) / w)) })), ry);
    return m;
  };
  // banco comum (todos)
  const bench = group(HW - 0.28, -3.6);
  box(bench, 0.42, 0.06, 1.3, 0, 0.45, 0, id === 'hotel' ? '#8a1f2c' : id === 'metro' ? '#c0c4cc' : '#ff9a2e');
  for (const dz of [-0.55, 0.55]) box(bench, 0.36, 0.42, 0.06, 0, 0.21, dz, '#4a4a58');
  box(bench, 0.06, 0.4, 1.3, 0.2, 0.7, 0, id === 'hotel' ? '#8a1f2c' : id === 'metro' ? '#c0c4cc' : '#ff9a2e');
  P.bench = bench;
  // planta comum (todos)
  const plant = group(HW - 0.3, -15.2);
  box(plant, 0.36, 0.42, 0.36, 0, 0.21, 0, '#e07a5f');
  const leaf = new THREE.Mesh(b.geo('leafI', () => new THREE.IcosahedronGeometry(0.36, 0)), M.own(new THREE.MeshLambertMaterial({ color: '#3fae6a' })));
  leaf.position.y = 0.72;
  leaf.scale.set(1, 1.5, 1);
  plant.add(leaf);
  P.plant = plant;
  P.plantLeaf = leaf;

  if (id === 'hospital') {
    // cadeira de rodas
    const wc = group(-HW + 0.45, -8.8, Math.PI / 2);
    box(wc, 0.5, 0.06, 0.5, 0, 0.5, 0, '#3f7bff');
    box(wc, 0.5, 0.5, 0.06, 0, 0.78, 0.25, '#3f7bff');
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(b.geo('wheel', () => new THREE.TorusGeometry(0.28, 0.03, 6, 18)), M.lam('#2a2a3a'));
      w.rotation.y = Math.PI / 2;
      w.position.set(s * 0.29, 0.3, 0.05);
      wc.add(w);
    }
    P.wheelchair = wc;
    // maca com lençol
    const gu = group(HW - 0.45, -11.6);
    box(gu, 0.6, 0.08, 1.8, 0, 0.75, 0, '#c8ccd4');
    for (const dz of [-0.8, 0.8]) box(gu, 0.5, 0.72, 0.05, 0, 0.36, dz, '#8a8e96');
    box(gu, 0.62, 0.06, 1.7, 0, 0.82, 0, '#ffffff');
    const lump = new THREE.Mesh(b.geo('lump', () => new THREE.SphereGeometry(0.3, 12, 8)), M.lam('#ffffff'));
    lump.position.set(0, 0.86, -0.3);
    lump.scale.set(1, 0.35, 1.6);
    lump.visible = false;
    gu.add(lump);
    P.gurney = gu;
    P.gurneyLump = lump;
    // suporte de soro
    const iv = group(-HW + 0.35, -14.0);
    box(iv, 0.04, 1.8, 0.04, 0, 0.9, 0, '#c8ccd4');
    box(iv, 0.4, 0.04, 0.04, 0, 1.8, 0, '#c8ccd4');
    box(iv, 0.14, 0.24, 0.06, 0.12, 1.62, 0, M.own(new THREE.MeshLambertMaterial({ color: '#bfeaff' })));
    P.iv = iv;
    // placa da cruz
    const cross = sign('✚', '#ffffff', '#e0242c', 0, H - 0.35, -9.5, 0, 0.36, 0.36);
    P.crossSign = cross;
    // raio-x (normal: Bloop)
    const xray = canvasTex(160, 200, (x) => {
      x.fillStyle = '#0a1420';
      x.fillRect(0, 0, 160, 200);
      x.strokeStyle = '#cfe8ff';
      x.lineWidth = 5;
      x.beginPath();
      x.arc(80, 90, 50, 0, Math.PI * 2);
      x.stroke();
      x.beginPath();
      x.arc(62, 78, 9, 0, Math.PI * 2);
      x.arc(98, 78, 9, 0, Math.PI * 2);
      x.stroke();
    });
    const xrayW = canvasTex(160, 200, (x) => {
      x.fillStyle = '#200a14';
      x.fillRect(0, 0, 160, 200);
      x.strokeStyle = '#ffb0c0';
      x.lineWidth = 5;
      x.beginPath();
      x.arc(80, 104, 58, 0, Math.PI * 2);
      x.stroke();
      x.fillStyle = '#ffe14a';
      for (const ex of [58, 102]) {
        x.beginPath();
        x.arc(ex, 82, 11, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#ffb0c0';
      x.beginPath();
      x.ellipse(80, 126, 34, 20, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#200a14';
      x.beginPath();
      x.ellipse(80, 126, 28, 15, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      for (const dx of [-14, 14]) {
        x.beginPath();
        x.moveTo(80 + dx - 7, 112);
        x.lineTo(80 + dx, 128);
        x.lineTo(80 + dx + 7, 112);
        x.fill();
      }
    });
    b.own(xray);
    b.own(xrayW);
    const xm = b.plane(G, 0.4, 0.5, -HW + 0.03, 1.6, -2.9, M.own(new THREE.MeshBasicMaterial({ map: xray })), Math.PI / 2);
    P.xray = xm;
    (xm.userData as { alt: THREE.Texture }).alt = xrayW;
  } else if (id === 'hotel') {
    // carrinho de serviço
    const cart = group(-HW + 0.4, -8.6);
    box(cart, 0.5, 0.05, 0.9, 0, 0.8, 0, '#ffffff');
    box(cart, 0.5, 0.05, 0.9, 0, 0.3, 0, '#c79a2a');
    for (const dz of [-0.4, 0.4]) for (const dx of [-0.22, 0.22]) box(cart, 0.03, 0.8, 0.03, dx, 0.4, dz, '#c79a2a');
    const cloche = new THREE.Mesh(b.geo('cloche', () => new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2)), M.lam('#d8dce4'));
    cloche.position.set(0, 0.83, 0.15);
    cart.add(cloche);
    P.cart = cart;
    P.cloche = cloche;
    // arandelas (luminárias de parede)
    const sconces: THREE.Mesh[] = [];
    for (const z of [-3.2, -6.0, -9.0, -11.8, -14.4]) {
      const s = z === -6.0 || z === -11.8 ? 1 : -1;
      const m = new THREE.Mesh(b.geo('sconce', () => new THREE.ConeGeometry(0.12, 0.2, 10, 1, true)), M.own(new THREE.MeshBasicMaterial({ color: '#ffe0a0' })));
      m.position.set(s * (HW - 0.1), 1.9, z);
      m.rotation.x = Math.PI;
      G.add(m);
      sconces.push(m);
    }
    P.sconce = sconces[2];
    // vaso de flores
    const vase = group(HW - 0.3, -12.2);
    box(vase, 0.36, 0.7, 0.36, 0, 0.35, 0, '#2a1408');
    const fl = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(b.geo('flw', () => new THREE.SphereGeometry(0.07, 8, 6)), M.own(new THREE.MeshLambertMaterial({ color: '#ff5c9a' })));
      f.position.set(Math.cos(i) * 0.1, 0.95 + (i % 2) * 0.08, Math.sin(i) * 0.1);
      fl.add(f);
    }
    vase.add(fl);
    P.vase = vase;
    P.flowers = fl;
    // plaquinhas "não perturbe" nas maçanetas
    const dnd = canvasTex(64, 128, (x) => {
      x.fillStyle = '#ffd34a';
      x.fillRect(0, 0, 64, 128);
      x.font = '40px "Noto Color Emoji", sans-serif';
      x.textAlign = 'center';
      x.fillText('😴', 32, 70);
    });
    b.own(dnd);
    const dm = b.plane(G, 0.12, 0.24, -HW + 0.08, 0.86, -4.02, M.own(new THREE.MeshBasicMaterial({ map: dnd })), Math.PI / 2);
    P.dnd = dm;
    // quadro grande central (retrato)
    const big = b.plane(G, 0.6, 0.75, HW - 0.04, 1.6, -15.0 + 0.0, M.own(new THREE.MeshBasicMaterial({ map: paintingTex('moose') })), -Math.PI / 2);
    P.bigPainting = big;
    (big.userData as { alt: THREE.Texture }).alt = paintingTex('forestEyes');
    // tapete/carpete alternativo
    P.carpetAlt = new THREE.Object3D();
    (P.carpetAlt.userData as { tex: THREE.Texture }).tex = carpet('#1f4a8a', '#c79a2a', '#e8c25a');
    b.own((P.carpetAlt.userData as { tex: THREE.Texture }).tex);
  } else if (id === 'escola') {
    // armários (lockers)
    const lockers = group(-HW + 0.22, -8.6);
    const doorsL: THREE.Mesh[] = [];
    for (let i = 0; i < 4; i++) {
      box(lockers, 0.4, 1.7, 0.42, 0, 0.85, -0.66 + i * 0.44, i % 2 ? '#3f7bff' : '#5ad1ff');
      const d = box(lockers, 0.03, 1.6, 0.38, 0.22, 0.85, -0.66 + i * 0.44, i % 2 ? '#2f63d9' : '#3fb8e8');
      doorsL.push(d);
    }
    P.lockers = lockers;
    P.lockerDoor = doorsL[2];
    // mochilas no gancho
    const bag = new THREE.Mesh(b.boxG(0.3, 0.36, 0.16), M.own(new THREE.MeshLambertMaterial({ color: '#ff5c9a' })));
    bag.position.set(HW - 0.1, 1.3, -11.8);
    G.add(bag);
    P.backpack = bag;
    const hook = b.box(G, 0.08, 0.04, 0.04, HW - 0.04, 1.52, -11.8, M.lam('#888'));
    P.hook = hook;
    // bola
    const ball = new THREE.Mesh(b.geo('ball', () => new THREE.SphereGeometry(0.16, 14, 10)), M.lam('#ff4f4f'));
    ball.position.set(-HW + 0.4, 0.16, -13.6);
    G.add(ball);
    P.ball = ball;
    // cadeirinhas empilhadas
    const chairs = group(HW - 0.35, -6.4);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Group();
      box(c, 0.36, 0.04, 0.36, 0, 0.36, 0, ['#ff9a2e', '#3ee07a', '#5ad1ff'][i]);
      box(c, 0.36, 0.34, 0.04, 0, 0.55, 0.16, ['#ff9a2e', '#3ee07a', '#5ad1ff'][i]);
      for (const dx of [-0.15, 0.15]) for (const dz of [-0.15, 0.15]) box(c, 0.03, 0.36, 0.03, dx, 0.18, dz, '#666');
      c.position.y = i * 0.12;
      chairs.add(c);
    }
    P.chairs = chairs;
    // varal de desenhos (normal / estranho)
    const strip = group(0, -10.0);
    const drawings: THREE.Mesh[] = [];
    (['flower', 'fish', 'sun'] as const).forEach((k, i) => {
      const m = b.plane(strip, 0.36, 0.28, -0.45 + i * 0.45, H - 0.5, 0, M.own(new THREE.MeshBasicMaterial({ map: drawingTex(k), side: THREE.DoubleSide })));
      m.rotation.z = (i - 1) * 0.08;
      drawings.push(m);
    });
    box(strip, 1.6, 0.01, 0.01, 0, H - 0.34, 0, '#ffffff');
    P.drawings = strip;
    (strip.userData as { alts: THREE.Texture[]; ms: THREE.Mesh[] }).alts = (['eyes', 'creature', 'sunSad'] as const).map((k) => drawingTex(k));
    (strip.userData as { alts: THREE.Texture[]; ms: THREE.Mesh[] }).ms = drawings;
    // placa da sala com bichinhos
    P.classSign = sign('🖍️ 🎨 ✂️', '#ffffff', '#1d0b3a', HW - 0.03, 2.35, -15.6 + 0.5, -Math.PI / 2, 0.6, 0.22);
  } else {
    // pilares
    const pillars: THREE.Mesh[] = [];
    for (const z of [-5.8, -11.0]) for (const s of [-1, 1]) pillars.push(box(G, 0.3, H, 0.3, s * (HW - 0.15), H / 2, z, '#d8d8d0'));
    P.pillar = pillars[1];
    // máquina de vender
    const vm = group(HW - 0.32, -9.0);
    box(vm, 0.6, 1.8, 0.8, 0, 0.9, 0, '#e03a4a');
    const glass = box(vm, 0.03, 1.0, 0.6, -0.31, 1.15, 0, M.own(new THREE.MeshBasicMaterial({ color: '#bfeaff' })));
    for (let i = 0; i < 9; i++) box(vm, 0.04, 0.12, 0.1, -0.33, 0.85 + Math.floor(i / 3) * 0.3, -0.2 + (i % 3) * 0.2, ['#ffd34a', '#3ee07a', '#5ad1ff'][i % 3]);
    P.vending = vm;
    P.vendingGlass = glass;
    // faixa amarela tátil
    const strip = new THREE.Mesh(b.planeG(0.3, 16), M.lam('#ffd400'));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(-0.75, 0.006, -8);
    G.add(strip);
    P.tactile = strip;
    // mapa da linha
    const mapT = canvasTex(320, 128, (x) => {
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, 320, 128);
      x.strokeStyle = '#2f7bd9';
      x.lineWidth = 10;
      x.beginPath();
      x.moveTo(20, 64);
      x.lineTo(300, 64);
      x.stroke();
      for (let i = 0; i < 6; i++) {
        x.fillStyle = '#fff';
        x.strokeStyle = '#1d0b3a';
        x.lineWidth = 4;
        x.beginPath();
        x.arc(30 + i * 52, 64, 11, 0, Math.PI * 2);
        x.fill();
        x.stroke();
      }
    });
    const mapW = canvasTex(320, 128, (x) => {
      x.fillStyle = '#ffffff';
      x.fillRect(0, 0, 320, 128);
      x.strokeStyle = '#e0242c';
      x.lineWidth = 10;
      x.beginPath();
      x.moveTo(20, 64);
      x.lineTo(160, 64);
      x.lineTo(160, 120);
      x.stroke();
      for (let i = 0; i < 3; i++) {
        x.fillStyle = '#fff';
        x.strokeStyle = '#1d0b3a';
        x.lineWidth = 4;
        x.beginPath();
        x.arc(30 + i * 52, 64, 11, 0, Math.PI * 2);
        x.fill();
        x.stroke();
      }
      x.fillStyle = '#4b2a7a';
      x.beginPath();
      x.arc(160, 112, 14, 0, Math.PI * 2);
      x.fill();
    });
    b.own(mapT);
    b.own(mapW);
    const mp = b.plane(G, 1.0, 0.4, -HW + 0.03, 1.7, -3.2, M.own(new THREE.MeshBasicMaterial({ map: mapT })), Math.PI / 2);
    P.lineMap = mp;
    (mp.userData as { alt: THREE.Texture }).alt = mapW;
    // catraca no fim (só decoração)
    const tg = group(-0.9, -15.6);
    box(tg, 0.3, 1.0, 0.5, 0, 0.5, 0, '#9aa2ad');
    const arm = box(tg, 0.6, 0.04, 0.04, 0.4, 0.85, 0, '#c0c4cc');
    P.turnstile = tg;
    P.turnArm = arm;
    // relógio digital do metrô (placa)
    P.depart = sign('🚇 2 min', '#1d1d2a', '#ffd34a', HW - 0.03, 2.4, -6.8, -Math.PI / 2, 0.6, 0.2);
  }
}

/** Bloop que anda pelo corredor (toda volta tem um; anomalias mexem nele) */
export function makeWalker(color: string): NpcBloop {
  return new NpcBloop(color, 'stand', 1, '');
}
export { shade };
