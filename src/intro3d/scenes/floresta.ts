/* Lenhadores do Bosque: o Bloop dá machadadas, a árvore tomba com folhas voando e uma muda brota no lugar. */
import * as THREE from 'three';
import { PT } from '../../3d/common/particles';
import { type Kit, type Shot, outElastic, setInst } from '../kit';
import { Actor } from './util';

export function floresta(k: Kit): Shot {
  k.sky('#6ac8ff', '#e8ffd0', '#7ad86a', 300, 1.0);
  k.fog('#c8f0c0', 22, 70);
  const sun = k.lights('#eaffff', '#4a8a3a', '#fff2c8', [8, 14, 6], 1.1, 2.6);
  void sun;
  k.glow('#fff6c0', 40, 0.55).position.set(40, 40, -80);
  const ground = k.build('fl-ground', (b) => {
    b.cyl(30, 30, 0.3, 0, -0.3, 0, '#6ac85a', 32);
    // trilha
    for (let i = 0; i < 7; i++) b.cyl(0.5, 0.5, 0.04, 2 + i * 0.9, 0, 2.5 + i * 0.7, '#e8c890', 10);
    // pedras e flores
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4;
      const r = 3 + (i % 5) * 1.3;
      b.sph(0.08, Math.cos(a) * r, 0.1, Math.sin(a) * r + 1, ['#ff8ab8', '#ffd34a', '#ffffff'][i % 3], 1, 1, 1, 6);
    }
    b.sph(0.5, -3.5, 0, 2, '#9aa8a0', 1.3, 0.6, 1, 6);
    // toco do corte (fica depois que a árvore cai)
    b.cyl(0.42, 0.5, 0.45, 0, 0, 0, '#9a6a3a', 10);
    b.cyl(0.4, 0.4, 0.02, 0, 0.45, 0, '#f2d29a', 10);
  });
  k.mesh(ground, k.std({ flat: true }));
  // floresta ao redor (instanciada)
  const TN = k.hi ? 40 : 22;
  const trunkG = k.ownGeo(new THREE.CylinderGeometry(0.2, 0.28, 1.4, 6).translate(0, 0.7, 0));
  const crownG = k.ownGeo(new THREE.ConeGeometry(1.1, 2.6, 7).translate(0, 2.6, 0));
  const tr = new THREE.InstancedMesh(trunkG, k.solid('#8a5a32', { flat: true }), TN);
  const cr = new THREE.InstancedMesh(crownG, k.solid('#ffffff', { flat: true, rough: 0.9 }), TN);
  const C = new THREE.Color();
  let ti = 0;
  for (let n = 0; n < TN * 2 && ti < TN; n++) {
    const i = n;
    const a = i * 2.399 + 0.3;
    const r = 6 + (i % 7) * 2.6;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 4;
    if (z > 3 && Math.abs(x) < 6) continue;
    const s = 0.8 + ((i * 13) % 10) / 15;
    setInst(tr, ti, x, 0, z, 0, a, 0, s);
    setInst(cr, ti, x, 0, z, 0, a, 0, s);
    cr.setColorAt(ti, C.set(['#2f9a4a', '#3aae58', '#4fc06a', '#2a8a5a'][i % 4]));
    ti++;
  }
  tr.count = cr.count = ti;
  k.scene.add(tr, cr);
  // a árvore principal (pivô na base)
  const tree = new THREE.Group();
  const tg = k.build('fl-tree', (b) => {
    b.cyl(0.36, 0.44, 3.0, 0, 0.45, 0, '#9a6a3a', 9);
    b.sph(1.5, 0, 3.6, 0, '#3aae58', 1, 0.9, 1, 7);
    b.sph(1.1, 0.9, 4.4, 0.3, '#4fc06a', 1, 0.9, 1, 7);
    b.sph(1.0, -0.8, 4.5, -0.2, '#2f9a4a', 1, 0.9, 1, 7);
    b.sph(0.9, 0.1, 5.3, 0, '#5ad070', 1, 0.9, 1, 7);
    b.sph(0.14, 0.9, 3.6, 1.2, '#ff4a4a', 1, 1, 1, 6);
    b.sph(0.14, -0.7, 4.2, 1.0, '#ff4a4a', 1, 1, 1, 6);
  });
  const treeM = new THREE.Mesh(tg, k.std({ flat: true, rough: 0.85 }));
  treeM.position.y = -0.45;
  tree.add(treeM);
  tree.position.y = 0.45;
  k.scene.add(tree);
  // muda
  const sap = k.build('fl-sap', (b) => {
    b.cyl(0.05, 0.07, 0.6, 0, 0, 0, '#7a5a2a', 6);
    b.sph(0.32, 0, 0.75, 0, '#6ad04a', 1, 0.8, 1, 7);
    b.sph(0.22, 0.25, 0.6, 0, '#8ae05a', 1, 0.8, 1, 7);
  });
  const sapling = new THREE.Mesh(sap, k.std({ flat: true }));
  sapling.position.set(0, 0.46, 0);
  sapling.scale.setScalar(0.001);
  k.scene.add(sapling);
  // Bloop + machado
  const b = new Actor(k, 1.7, 'happy');
  const axe = new THREE.Group();
  const ag = k.build('fl-axe', (a) => {
    a.box(0.1, 1.2, 0.1, 0, -0.2, 0, '#c8945a');
    a.box(0.5, 0.36, 0.08, -0.22, 0.75, 0, '#c8d4e0');
    a.box(0.08, 0.38, 0.1, -0.45, 0.74, 0, '#ffffff');
  }, 1);
  const axeM = new THREE.Mesh(ag, k.std({ metal: 0.3, rough: 0.4 }));
  axe.add(axeM);
  k.scene.add(axe);
  const BX = 1.35;
  const CH = [0.45, 0.95, 1.45];
  const FALL0 = 1.7;
  const FALL1 = 2.45;
  const SAP = 2.75;
  const chopped = new Set<number>();
  let fell = false;
  let grew = false;
  const path = k.path([
    { t: 0, p: [3.2, 1.8, 4.6], l: [0.6, 1.3, 0], fov: 46 },
    { t: 1.5, p: [4.5, 3.2, 6.8], l: [0, 2.2, 0] },
    { t: 2.6, p: [2.5, 2.2, 6.2], l: [-0.6, 1.4, 0], fov: 50 },
    { t: 5.0, p: [2.2, 2.2, 5.6], l: [0.2, 1.4, 0], fov: 46 },
  ]);
  const cs = new THREE.Vector3();
  return {
    dur: 3.4,
    update(t) {
      // machadadas: balanço até cada CH
      let sw = 0;
      for (const c of CH) {
        const d = t - (c - 0.3);
        if (d > 0 && d < 0.45) sw = d < 0.3 ? (d / 0.3) * (d / 0.3) : 1 - (d - 0.3) / 0.15;
      }
      const ang = -0.6 + sw * 1.9;
      const hopy = t > FALL1 ? Math.max(0, Math.sin((t - FALL1) * 10)) * 0.5 * Math.exp(-(t - FALL1) * 1.5) : 0;
      b.at(BX, hopy, 0.35, sw > 0.9 ? -0.15 : 0.04 * Math.sin(t * 8), 0);
      axe.position.set(BX - 0.3, b.spr.position.y - 0.05, 0.6);
      axe.rotation.set(0, 0, t < FALL0 ? ang : -0.3);
      for (const c of CH) {
        if (t >= c && !chopped.has(c)) {
          chopped.add(c);
          k.fx.burst(0.35, 0.8, 0.2, 14, 'chunk', '#d8a868', 2.5);
          k.fxAdd.burst(0.35, 0.8, 0.2, 6, 'spark', '#ffffff', 2);
          k.shake(0.1);
          tree.rotation.z = 0.05;
        }
      }
      // árvore tomba para a esquerda (longe do Bloop)
      if (t < FALL0) tree.rotation.z = Math.max(0, tree.rotation.z - 0.01) * 0.9 + Math.sin(t * 40) * 0.006 * (t > CH[0] ? 1 : 0);
      else {
        const u = Math.min(1, (t - FALL0) / (FALL1 - FALL0));
        tree.rotation.z = (u * u) * (Math.PI / 2 - 0.05);
        if (u >= 1) tree.rotation.z = Math.PI / 2 - 0.05 + Math.sin((t - FALL1) * 18) * 0.04 * Math.exp(-(t - FALL1) * 5);
      }
      if (!fell && t >= FALL1) {
        fell = true;
        for (let i = 0; i < 4; i++) {
          cs.set(-1.5 - i * 1.1, 0.3, 0);
          k.fx.burst(cs.x, cs.y, cs.z, 8, 'poof', '#e8d8b0', 2.2);
        }
        k.fx.burst(-3.8, 1, 0, 40, 'chunk', '#4fc06a', 4);
        k.shake(0.4);
        k.flash(0.15);
      }
      // folhas caindo
      if (Math.random() < (t > FALL0 && t < FALL1 + 0.5 ? 1 : 0.25))
        k.fx.emit((Math.random() - 0.5) * 6 - (t > FALL0 ? 2 : 0), 4 + Math.random() * 2, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.6, -0.6, 0.3, { tile: PT.Chunk, color: Math.random() < 0.5 ? '#4fc06a' : '#8ae05a', life: 2.5, size: 0.14, drag: 0.5 });
      // muda brota
      if (t >= SAP) {
        const s = outElastic(Math.min(1, (t - SAP) / 0.8));
        sapling.scale.setScalar(Math.max(0.001, s));
        if (!grew) {
          grew = true;
          k.fxAdd.burst(0, 0.8, 0, 36, 'spark', '#fff6a0', 3);
        }
      }
      k.follow(path, t);
    },
    sting(s) {
      for (const c of CH) {
        s.noise(c, 0.12, 0.3, 1500, { q: 1.4 });
        s.tone(c, 220, 0.12, 'triangle', 0.15, { slide: 0.6 });
      }
      s.noise(FALL0, FALL1 - FALL0, 0.12, 400, { attack: 0.6, slide: 3 });
      s.boom(FALL1, 0.45);
      s.sparkle(SAP, 1046);
    },
  };
}
