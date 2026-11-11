/* ============================================================
 *  CORREDOR — geometria do laço (estilo "saída 8", versão nossa).
 *
 *        NS (toco do próximo)        z
 *          |BC|                      ^ (−z = frente)
 *   EC--B--+  |                      |
 *   |  corredor (16 m)               |
 *   SC--A--AC                        +----> x
 *          |PS (toco do anterior)
 *
 *  Corredor x∈[-1.5,1.5], z∈[-16,0]. Passagens em "S" nas duas pontas:
 *  B = A + OFFSET (9, 0, −19). Seguir em frente: no meio de B → volta ao
 *  meio de A (translação, sem emenda). Voltar: no meio de A, andando para
 *  trás → gira 180° em torno do centro de A (a passagem é simétrica).
 *  Nos dois casos você chega ao corredor "novo" pelo mesmo canto.
 * ============================================================ */
import * as THREE from 'three';
import { signTex } from '../../maps/nightkit/tex';
import { Builder } from '../build';
import { canvasTex } from '../common';

export const HL = 16;
export const HW = 1.5;
export const OFFSET = { x: 9, z: -19 };
export const A_MID = { x: -4.5, z: 1.5 };
export const B_MID = { x: 4.5, z: -17.5 };

export interface Style {
  id: string;
  H: number;
  floor: THREE.Texture;
  floorTile: number;
  wall: THREE.Texture;
  wallTile: number;
  wainscot: THREE.Texture | null;
  wainH: number;
  ceil: string;
  trim: string;
  door: string;
  doorStyle: 'plain' | 'window' | 'wood' | 'metal';
  doorNums: string[];
  numBg: string;
  numFg: string;
  posters: THREE.Texture[];
  posterAlt: THREE.Texture[];
  posterSize: [number, number];
  posterFrame: string;
  lightCol: string;
  panelCol: string;
  fog: string;
  hemiSky: string;
  hemiGround: string;
  walker: string;
}

export interface Door {
  pivot: THREE.Group;
  panel: THREE.Mesh;
  num: THREE.Mesh;
  numMat: THREE.MeshBasicMaterial;
  dark: THREE.Mesh;
  side: -1 | 1;
  z: number;
  mat: THREE.MeshLambertMaterial;
  /** batentes + escuro (somem junto na anomalia "porta sumiu") */
  frame: THREE.Object3D[];
}
export interface Poster {
  m: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  tex: THREE.Texture;
  alt: THREE.Texture;
  frame: THREE.Mesh;
  side: -1 | 1;
  z: number;
}
export interface Lamp {
  panel: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  base: THREE.Color;
}

export interface Hall {
  b: Builder;
  root: THREE.Group;
  /** o que muda por anomalia fica aqui dentro (corredor principal) */
  hall: THREE.Group;
  ceiling: THREE.Group;
  lamps: Lamp[];
  lights: THREE.PointLight[];
  lightBase: number;
  doors: Door[];
  posters: Poster[];
  floorMat: THREE.MeshLambertMaterial;
  wallMat: THREE.MeshLambertMaterial;
  levelSign: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; draw(n: number, exit: boolean): void };
  arrow: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial };
  rules: THREE.Mesh;
  exitDoor: THREE.Group;
  props: Record<string, THREE.Object3D>;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  style: Style;
  /** marca d'água para pôr coisas extra (anomalias) */
  spare: THREE.Group;
  /** porta extra (anomalia) — não entra em doors */
  addDoor(side: -1 | 1, z: number, num: string): Door;
}

/** quad horizontal com UV no mundo */
function floorQuad(x0: number, z0: number, x1: number, z1: number, y: number, tile: number, down = false): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1];
  const uv = [x0 / tile, -z0 / tile, x1 / tile, -z0 / tile, x1 / tile, -z1 / tile, x0 / tile, -z1 / tile];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, down ? -1 : 1, 0, 0, down ? -1 : 1, 0, 0, down ? -1 : 1, 0, 0, down ? -1 : 1, 0], 3));
  // frente para cima: (0,1,2),(0,2,3) com z0 > z1
  const up = z0 > z1 === x1 > x0;
  g.setIndex(up !== down ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return g;
}
/** parede vertical de (x0,z0) a (x1,z1), frente para a esquerda do vetor (x1-x0, z1-z0) */
function wallQuad(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tile: number, u0 = 0): THREE.BufferGeometry {
  const L = Math.hypot(x1 - x0, z1 - z0);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y1, z0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([u0 / tile, y0 / tile, (u0 + L) / tile, y0 / tile, (u0 + L) / tile, y1 / tile, u0 / tile, y1 / tile], 2));
  const nx = -(z1 - z0) / L,
    nz = (x1 - x0) / L;
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

export function buildHall(st: Style, props: (h: Hall) => void): Hall {
  const b = new Builder();
  const M = b.mats;
  const root = new THREE.Group();
  const hall = new THREE.Group();
  const ceiling = new THREE.Group();
  const spare = new THREE.Group();
  root.add(hall, spare);
  hall.add(ceiling);
  const H = st.H;
  const floorMat = M.own(new THREE.MeshLambertMaterial({ map: st.floor }));
  const wallMat = M.own(new THREE.MeshLambertMaterial({ map: st.wall }));
  const wainMat = st.wainscot ? M.own(new THREE.MeshLambertMaterial({ map: st.wainscot })) : null;
  const ceilMat = M.lam(st.ceil);
  const trimMat = M.lam(st.trim);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, p: THREE.Object3D = root) => {
    const o = new THREE.Mesh(g, m);
    p.add(o);
    b.geo('q' + o.uuid, () => g);
    return o;
  };
  /* ---------- pisos e tetos ---------- */
  const regions: [number, number, number, number, THREE.Object3D][] = [
    [-HW, 0, HW, -HL, hall], // corredor (o teto do corredor é do grupo "ceiling")
    [-HW, 3, HW, 0, root], // SC
    [-7.5, 3, -HW, 0, root], // A
    [-10.5, 3, -7.5, 0, root], // AC
    [-10.5, 11, -7.5, 3, root], // PS
    [-HW, -16, HW, -19, root], // EC
    [HW, -16, 7.5, -19, root], // B
    [7.5, -16, 10.5, -19, root], // BC
    [7.5, -19, 10.5, -27, root], // NS
  ];
  regions.forEach(([x0, z0, x1, z1, par], i) => {
    add(floorQuad(x0, z0, x1, z1, 0, st.floorTile), floorMat, par === hall ? hall : root);
    add(floorQuad(x0, z0, x1, z1, H, 1, true), ceilMat, i === 0 ? ceiling : root);
  });
  /* ---------- paredes (lista: x0,z0 → x1,z1 com frente para dentro) ---------- */
  const W: [number, number, number, number, boolean][] = [
    // corredor
    [-HW, 0, -HW, -HL, true],
    [HW, -HL, HW, 0, true],
    // SC
    [HW, 3, -HW, 3, false],
    [HW, 0, HW, 3, false],
    // A
    [-HW, 0, -7.5, 0, false],
    [-7.5, 3, -HW, 3, false],
    // AC
    [-7.5, 0, -10.5, 0, false],
    [-10.5, 0, -10.5, 3, false],
    // PS
    [-10.5, 3, -10.5, 11, false],
    [-7.5, 11, -7.5, 3, false],
    [-10.5, 11, -7.5, 11, false],
    // EC
    [-HW, -HL, -HW, -19, false],
    [-HW, -19, HW, -19, false],
    // B
    [HW, -16, 7.5, -16, false],
    [7.5, -19, HW, -19, false],
    // BC
    [10.5, -16, 7.5, -16, false],
    [10.5, -19, 10.5, -16, false],
    // NS
    [7.5, -19, 7.5, -27, false],
    [10.5, -27, 10.5, -19, false],
    [7.5, -27, 10.5, -27, false],
  ];
  // frente: a ordem dos pontos define o lado — conferimos pela posição do centro da região
  for (const [x0, z0, x1, z1, inHall] of W) {
    const par = inHall ? hall : root;
    // garante normal apontando para "dentro" (para longe da linha de fora mais próxima)
    const mx = (x0 + x1) / 2,
      mz = (z0 + z1) / 2;
    const L = Math.hypot(x1 - x0, z1 - z0);
    const nx = -(z1 - z0) / L,
      nz = (x1 - x0) / L;
    const inside = insideAny(mx + nx * 0.3, mz + nz * 0.3);
    const [ax, az, bx, bz] = inside ? [x0, z0, x1, z1] : [x1, z1, x0, z0];
    const y0 = wainMat ? st.wainH : 0;
    add(wallQuad(ax, az, bx, bz, y0, H, st.wallTile), wallMat, par);
    if (wainMat) add(wallQuad(ax, az, bx, bz, 0, st.wainH, st.wainH), wainMat, par);
    // rodapé / faixa
    const tx = (ax + bx) / 2 + (inside ? nx : -nx) * 0.015,
      tz = (az + bz) / 2 + (inside ? nz : -nz) * 0.015;
    const tr = new THREE.Mesh(b.boxG(L, 0.08, 0.03), trimMat);
    tr.position.set(tx, wainMat ? st.wainH : 0.04, tz);
    tr.rotation.y = Math.atan2(-(bz - az), bx - ax);
    par.add(tr);
    // colisor (caixa fina por fora)
    const ox = inside ? -nx : nx,
      oz = inside ? -nz : nz;
    b.colBox(Math.min(ax, bx) + ox * 0.15 - (ax === bx ? 0.15 : 0), Math.min(az, bz) + oz * 0.15 - (az === bz ? 0.15 : 0), Math.max(ax, bx) + ox * 0.15 + (ax === bx ? 0.15 : 0), Math.max(az, bz) + oz * 0.15 + (az === bz ? 0.15 : 0), 0, H);
  }
  /* ---------- luzes ---------- */
  const lamps: Lamp[] = [];
  const panelG = b.boxG(0.9, 0.05, 0.5);
  const panelAt = (x: number, z: number, par: THREE.Object3D) => {
    const mat = M.own(new THREE.MeshBasicMaterial({ color: st.panelCol }));
    const m = new THREE.Mesh(panelG, mat);
    m.position.set(x, H - 0.03, z);
    par.add(m);
    return { panel: m, mat, base: mat.color.clone() };
  };
  for (const z of [-2, -4.6, -7.2, -9.8, -12.4, -15]) lamps.push(panelAt(0, z, ceiling));
  for (const [x, z] of [
    [0, 1.5],
    [-4.5, 1.5],
    [-9, 1.5],
    [0, -17.5],
    [4.5, -17.5],
    [9, -17.5],
    [-9, 6],
    [9, -22.5],
  ])
    panelAt(x, z, root);
  const lights: THREE.PointLight[] = [];
  const lightBase = 5.5;
  for (const z of [-3, -8.6, -14]) {
    const l = new THREE.PointLight(st.lightCol, lightBase, 9, 1.6);
    l.position.set(0, H - 0.35, z);
    ceiling.add(l);
    lights.push(l);
  }
  for (const [x, z] of [
    [-4.5, 1.5],
    [4.5, -17.5],
  ]) {
    const l = new THREE.PointLight(st.lightCol, lightBase * 0.8, 8, 1.6);
    l.position.set(x, H - 0.35, z);
    root.add(l);
  }
  const hemi = new THREE.HemisphereLight(st.hemiSky, st.hemiGround, 1.0);
  root.add(hemi);
  /* ---------- portas ---------- */
  const doors: Door[] = [];
  const doorAt = (side: -1 | 1, z: number, numTxt: string): Door => {
    const x = side * HW;
    const pivot = new THREE.Group();
    // dobradiça na borda +z da porta (abre para dentro do corredor)
    pivot.position.set(x - side * 0.035, 0, z + 0.5);
    const mat = M.own(new THREE.MeshLambertMaterial({ color: st.door }));
    const panel = new THREE.Mesh(b.boxG(0.05, 2.1, 1.0), mat);
    panel.position.set(0, 1.05, -0.5);
    pivot.add(panel);
    const knob = new THREE.Mesh(b.boxG(0.08, 0.06, 0.06), M.lam('#d9b04a'));
    knob.position.set(-side * 0.04, 1.0, -0.88);
    pivot.add(knob);
    if (st.doorStyle === 'window') {
      const w = new THREE.Mesh(b.boxG(0.055, 0.32, 0.32), M.lam('#a8d8ff', 0.25));
      w.position.set(0, 1.55, -0.5);
      pivot.add(w);
    } else if (st.doorStyle === 'wood') {
      for (const yy of [0.55, 1.5]) {
        const pn = new THREE.Mesh(b.boxG(0.06, 0.6, 0.66), M.lam(shade(st.door, -0.12)));
        pn.position.set(0, yy, -0.5);
        pivot.add(pn);
      }
    } else if (st.doorStyle === 'metal') {
      const bar = new THREE.Mesh(b.boxG(0.08, 0.06, 0.8), M.lam('#c0c4cc'));
      bar.position.set(-side * 0.03, 1.0, -0.5);
      pivot.add(bar);
    }
    hall.add(pivot);
    // batente
    const fr = M.lam(st.trim);
    const frame: THREE.Object3D[] = [];
    for (const dz of [-0.04, 1.04]) {
      const j = new THREE.Mesh(b.boxG(0.08, 2.18, 0.08), fr);
      j.position.set(x - side * 0.02, 1.09, z + 0.5 - dz);
      hall.add(j);
      frame.push(j);
    }
    const top = new THREE.Mesh(b.boxG(0.08, 0.08, 1.16), fr);
    top.position.set(x - side * 0.02, 2.18, z);
    hall.add(top);
    frame.push(top);
    // escuro atrás da porta (aparece quando abre)
    const dark = new THREE.Mesh(b.planeG(0.98, 2.1), M.basic('#05040a'));
    dark.position.set(x - side * 0.004, 1.05, z);
    dark.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    hall.add(dark);
    // número
    const numMat = M.own(new THREE.MeshBasicMaterial({ map: signTex(numTxt, st.numBg, st.numFg, 128, 64) }));
    const num = new THREE.Mesh(b.planeG(0.34, 0.17), numMat);
    num.position.set(x - side * 0.03, 2.4, z);
    num.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    hall.add(num);
    frame.push(dark);
    return { pivot, panel, num, numMat, dark, side, z, mat, frame };
  };
  doors.push(doorAt(-1, -4.6, st.doorNums[0]), doorAt(1, -7.4, st.doorNums[1]), doorAt(-1, -10.4, st.doorNums[2]), doorAt(1, -13.0, st.doorNums[3]));
  /* ---------- cartazes ---------- */
  const posters: Poster[] = [];
  const [pw, ph] = st.posterSize;
  const posterAt = (side: -1 | 1, z: number, i: number) => {
    const x = side * HW;
    const ry = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    const frame = new THREE.Mesh(b.boxG(0.04, ph + 0.08, pw + 0.08), M.lam(st.posterFrame));
    frame.position.set(x - side * 0.02, 1.55, z);
    hall.add(frame);
    const mat = M.own(new THREE.MeshBasicMaterial({ map: st.posters[i % st.posters.length] }));
    const m = new THREE.Mesh(b.planeG(pw, ph), mat);
    m.position.set(x - side * 0.045, 1.55, z);
    m.rotation.y = ry;
    hall.add(m);
    posters.push({ m, mat, tex: st.posters[i % st.posters.length], alt: st.posterAlt[i % st.posterAlt.length], frame, side, z });
  };
  posterAt(1, -4.4, 0);
  posterAt(-1, -7.6, 1);
  posterAt(1, -10.4, 2);
  posterAt(-1, -13.2, 3);
  /* ---------- placa do nível (pendurada, de frente para quem entra) ---------- */
  const lvTex = b.own(canvasTex(256, 128, () => undefined)) as THREE.CanvasTexture;
  const lvMesh = new THREE.Mesh(b.planeG(1.1, 0.55), M.own(new THREE.MeshBasicMaterial({ map: lvTex })));
  lvMesh.position.set(0, H - 0.55, -2.6);
  ceiling.add(lvMesh);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(b.boxG(0.015, 0.3, 0.015), M.lam('#555'));
    w.position.set(s * 0.45, H - 0.15, -2.6);
    ceiling.add(w);
  }
  const drawLevel = (n: number, exit: boolean) => {
    const c = lvTex.image as HTMLCanvasElement;
    const x = c.getContext('2d')!;
    x.fillStyle = '#14141c';
    x.beginPath();
    x.roundRect(0, 0, 256, 128, 18);
    x.fill();
    x.strokeStyle = '#ffd34a';
    x.lineWidth = 6;
    x.beginPath();
    x.roundRect(6, 6, 244, 116, 14);
    x.stroke();
    x.fillStyle = exit ? '#3ee07a' : '#ffd34a';
    x.font = 'bold 74px Fredoka, Arial, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(exit ? '🚪' : String(n), 128, 54);
    for (let i = 0; i < 10; i++) {
      x.fillStyle = i < n ? '#ffd34a' : '#3a3a4a';
      x.beginPath();
      x.arc(38 + i * 20, 106, 6.5, 0, Math.PI * 2);
      x.fill();
    }
    lvTex.needsUpdate = true;
  };
  drawLevel(0, false);
  /* ---------- seta de saída (fim do corredor, aponta para B) ---------- */
  const arrowMat = M.own(new THREE.MeshBasicMaterial({ map: signTex('🚶 ➜', '#1fae5b', '#ffffff', 256, 96) }));
  const arrow = new THREE.Mesh(b.planeG(0.8, 0.3), arrowMat);
  arrow.position.set(0, H - 0.4, -15.4);
  ceiling.add(arrow);
  /* ---------- cartaz de regras (só no nível 0) ---------- */
  const rulesTex = b.own(
    canvasTex(256, 320, (x) => {
      x.fillStyle = '#fff8e0';
      x.fillRect(0, 0, 256, 320);
      x.strokeStyle = '#1d0b3a';
      x.lineWidth = 8;
      x.strokeRect(4, 4, 248, 312);
      x.font = 'bold 64px Fredoka, Arial, sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText('👀', 128, 52);
      x.fillStyle = '#1fae5b';
      x.fillRect(16, 100, 224, 92);
      x.fillStyle = '#ff4f6a';
      x.fillRect(16, 206, 224, 92);
      x.font = 'bold 54px Fredoka, Arial, sans-serif';
      x.fillStyle = '#fff';
      x.fillText('✓ ➜ ⬆', 128, 148);
      x.fillText('✗ ➜ ↩', 128, 254);
    }),
  );
  const rules = new THREE.Mesh(b.planeG(0.62, 0.78), M.own(new THREE.MeshBasicMaterial({ map: rulesTex })));
  rules.position.set(HW - 0.03, 1.55, -1.2);
  rules.rotation.y = -Math.PI / 2;
  hall.add(rules);
  /* ---------- porta de SAÍDA (nível 10) — na parede do fundo (EC) ---------- */
  const exitDoor = new THREE.Group();
  const outTex = b.own(
    canvasTex(128, 256, (x) => {
      const g = x.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, '#7fd4ff');
      g.addColorStop(0.62, '#d8f4ff');
      g.addColorStop(0.62, '#7be07a');
      g.addColorStop(1, '#3fae4a');
      x.fillStyle = g;
      x.fillRect(0, 0, 128, 256);
      x.fillStyle = '#ffe14a';
      x.beginPath();
      x.arc(88, 56, 22, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#ffffff';
      for (const [cx, cy] of [
        [30, 40],
        [50, 90],
      ]) {
        x.beginPath();
        x.arc(cx, cy, 10, 0, Math.PI * 2);
        x.arc(cx + 12, cy - 4, 12, 0, Math.PI * 2);
        x.arc(cx + 24, cy, 9, 0, Math.PI * 2);
        x.fill();
      }
    }),
  );
  const ed = new THREE.Mesh(b.planeG(1.2, 2.2), M.own(new THREE.MeshBasicMaterial({ map: outTex, fog: false })));
  ed.position.set(0, 1.1, 0.01);
  exitDoor.add(ed);
  const efr = M.lam('#1fae5b');
  for (const sx of [-0.66, 0.66]) {
    const j = new THREE.Mesh(b.boxG(0.12, 2.36, 0.14), efr);
    j.position.set(sx, 1.18, 0.05);
    exitDoor.add(j);
  }
  const etop = new THREE.Mesh(b.boxG(1.44, 0.14, 0.14), efr);
  etop.position.set(0, 2.3, 0.05);
  exitDoor.add(etop);
  const edSign = new THREE.Mesh(b.planeG(1.0, 0.36), M.basic('#ffffff', signTex('EXIT ➜ 🌞', '#1fae5b', '#ffffff', 256, 92)));
  edSign.position.set(0, 2.6, 0.06);
  exitDoor.add(edSign);
  const edL = new THREE.PointLight('#fff6c8', 6, 7, 1.5);
  edL.position.set(0, 1.4, 1.0);
  exitDoor.add(edL);
  exitDoor.position.set(0, 0, -18.95);
  exitDoor.visible = false;
  edL.intensity = 0;
  (exitDoor as THREE.Group & { light?: THREE.PointLight }).light = edL;
  root.add(exitDoor);

  const fog = new THREE.Fog(st.fog, 7, 26);
  const h: Hall = {
    b,
    root,
    hall,
    ceiling,
    lamps,
    lights,
    lightBase,
    doors,
    posters,
    floorMat,
    wallMat,
    levelSign: { mesh: lvMesh, tex: lvTex, draw: drawLevel },
    arrow: { mesh: arrow, mat: arrowMat },
    rules,
    exitDoor,
    props: {},
    hemi,
    fog,
    style: st,
    spare,
    addDoor: doorAt,
  };
  commonProps(h);
  props(h);
  return h;
}

function insideAny(x: number, z: number): boolean {
  const R: [number, number, number, number][] = [
    [-HW, -HL, HW, 0],
    [-HW, 0, HW, 3],
    [-7.5, 0, -HW, 3],
    [-10.5, 0, -7.5, 3],
    [-10.5, 3, -7.5, 11],
    [-HW, -19, HW, -16],
    [HW, -19, 7.5, -16],
    [7.5, -19, 10.5, -16],
    [7.5, -27, 10.5, -19],
  ];
  return R.some(([a, b, c, d]) => x > a && x < c && z > b && z < d);
}

export function shade(hex: string, k: number): string {
  const c = new THREE.Color(hex);
  if (k < 0) c.multiplyScalar(1 + k);
  else c.lerp(new THREE.Color('#ffffff'), k);
  return '#' + c.getHexString();
}

/** coisas que todo corredor tem (alvo de anomalias genéricas) */
function commonProps(h: Hall): void {
  const b = h.b,
    M = b.mats,
    P = h.props,
    H = h.style.H;
  // extintor (parede esquerda)
  const ext = new THREE.Group();
  const cyl = new THREE.Mesh(b.geo('ext', () => new THREE.CylinderGeometry(0.09, 0.09, 0.45, 12)), M.own(new THREE.MeshLambertMaterial({ color: '#e0242c' })));
  cyl.position.y = 0.95;
  ext.add(cyl);
  const nz = new THREE.Mesh(b.boxG(0.05, 0.12, 0.05), M.lam('#222'));
  nz.position.set(0.04, 1.24, 0);
  ext.add(nz);
  const sg = new THREE.Mesh(b.planeG(0.22, 0.22), M.basic('#ffffff', signTex('🧯', '#e0242c', '#ffffff', 64, 64)));
  sg.position.set(0, 1.45, 0);
  sg.rotation.y = Math.PI / 2;
  ext.add(sg);
  ext.position.set(-HW + 0.12, 0, -6.2);
  h.hall.add(ext);
  P.extinguisher = ext;
  // relógio (parede direita, alto)
  const clock = new THREE.Group();
  const face = new THREE.Mesh(b.geo('clk', () => new THREE.CylinderGeometry(0.22, 0.22, 0.05, 24)), M.lam('#fffaf0'));
  face.rotation.z = Math.PI / 2;
  clock.add(face);
  const rim = new THREE.Mesh(b.geo('clkr', () => new THREE.TorusGeometry(0.22, 0.025, 6, 24)), M.lam('#2a2a3a'));
  rim.rotation.y = Math.PI / 2;
  clock.add(rim);
  const hand = (len: number, w: number) => {
    const p = new THREE.Group();
    const m = new THREE.Mesh(b.boxG(0.012, len, w), M.lam('#1d0b3a'));
    m.position.y = len / 2;
    p.add(m);
    p.position.x = -0.035;
    clock.add(p);
    return p;
  };
  const hh = hand(0.11, 0.025);
  const mh = hand(0.17, 0.016);
  hh.rotation.x = -1.1;
  mh.rotation.x = 0.4;
  clock.position.set(HW - 0.04, 2.25, -9.0);
  h.hall.add(clock);
  P.clock = clock;
  P.clockH = hh;
  P.clockM = mh;
  // câmera de segurança (teto, fim do corredor, à direita)
  const cam = new THREE.Group();
  const cb = new THREE.Mesh(b.boxG(0.14, 0.12, 0.3), M.lam('#e8e8ee'));
  cb.position.set(0, 0, 0.12);
  cam.add(cb);
  const lens = new THREE.Mesh(b.geo('lens', () => new THREE.CylinderGeometry(0.04, 0.04, 0.03, 10)), M.lam('#111'));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, 0.28);
  cam.add(lens);
  const led = new THREE.Mesh(b.boxG(0.025, 0.025, 0.02), M.own(new THREE.MeshBasicMaterial({ color: '#ff3b3b' })));
  led.position.set(0.04, 0.04, 0.27);
  cam.add(led);
  cam.position.set(HW - 0.25, H - 0.25, -15.2);
  cam.rotation.set(-0.35, 0.35, 0, 'YXZ');
  h.hall.add(cam);
  P.camera = cam;
  P.cameraLed = led;
  // grade de ventilação (teto)
  const vent = new THREE.Mesh(b.boxG(0.6, 0.03, 0.6), M.lam('#c8ccd4'));
  vent.position.set(-0.7, H - 0.015, -11.2);
  h.ceiling.add(vent);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(b.boxG(0.5, 0.02, 0.04), M.lam('#5a5e68'));
    s.position.set(0, -0.02, -0.22 + i * 0.11);
    vent.add(s);
  }
  P.vent = vent;
  // lixeira
  const bin = new THREE.Mesh(b.geo('bin', () => new THREE.CylinderGeometry(0.18, 0.15, 0.5, 14)), M.own(new THREE.MeshLambertMaterial({ color: '#3a7a5a' })));
  bin.position.set(-HW + 0.25, 0.25, -12.0);
  h.hall.add(bin);
  P.bin = bin;
  // placa "não corra" (pictograma)
  const noRun = new THREE.Mesh(b.planeG(0.36, 0.36), M.own(new THREE.MeshBasicMaterial({ map: pictoTex(false) })));
  noRun.position.set(-HW + 0.03, 1.75, -15.0);
  noRun.rotation.y = Math.PI / 2;
  h.hall.add(noRun);
  P.noRun = noRun;
  b.own((noRun.material as THREE.MeshBasicMaterial).map!);
}

/** pictograma: Bloop andando (normal) ou o Bocudo (anomalia) */
export function pictoTex(weird: boolean): THREE.CanvasTexture {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = '#ffffff';
    x.beginPath();
    x.arc(64, 64, 60, 0, Math.PI * 2);
    x.fill();
    x.strokeStyle = '#2a5bd7';
    x.lineWidth = 10;
    x.stroke();
    x.fillStyle = weird ? '#4b2a7a' : '#2a5bd7';
    x.beginPath();
    x.arc(64, 60, 26, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = '#fff';
    if (weird) {
      x.fillStyle = '#ffe14a';
      x.beginPath();
      x.arc(54, 50, 5, 0, Math.PI * 2);
      x.arc(74, 50, 5, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#33061a';
      x.beginPath();
      x.ellipse(64, 70, 16, 10, 0, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#fff';
      x.beginPath();
      x.moveTo(56, 62);
      x.lineTo(59, 70);
      x.lineTo(62, 62);
      x.moveTo(66, 62);
      x.lineTo(69, 70);
      x.lineTo(72, 62);
      x.fill();
    } else {
      x.beginPath();
      x.arc(56, 54, 5, 0, Math.PI * 2);
      x.arc(72, 54, 5, 0, Math.PI * 2);
      x.fill();
      x.fillStyle = '#2a5bd7';
      x.fillRect(46, 84, 10, 22);
      x.fillRect(72, 84, 10, 22);
    }
  });
}
