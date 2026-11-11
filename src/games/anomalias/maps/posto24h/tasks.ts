/* ============================================================
 *  POSTO 24h — tarefas do turno: abastecer (bico da cor certa),
 *  repor prateleira, caixa, café, passar pano, lixo.
 *  setState(...) muda o visual; o núcleo faz o minijogo.
 * ============================================================ */
import * as THREE from 'three';
import type { MapCtx } from '../kit2/ctx';
import { bloopProp, car } from '../kit2/props';
import { BLOOP_PALS } from '../kit2/chars';
import { cup3 } from '../kit2/food';
import { atmScreen } from './art';
import { GONDOLAS, LEVELS, RESTOCK, productRow, PRODUCT_COLS } from './store';
import { NOZZLE, PUMPS } from './outside';

function addTask(ctx: MapCtx, id: string, room: string, kind: string, object: THREE.Object3D, at: [number, number], setState?: (s: string) => void): void {
  object.userData.task = id;
  ctx.interacts.push({ id, room, kind, object, at: { x: at[0], y: 0, z: at[1] }, setState });
}

export function buildTasks(ctx: MapCtx): void {
  // ---------------------------------------------------------------- bombas (2): carro chega, bico da cor certa
  const pumpJobs: [number, number, number, number, string, number][] = [
    // [bomba, lado (−1 oeste/+1 leste), carroX, carroZ, cor, paleta]
    [2, -1, 1.15, -12.4, '#3a6ad8', 0],
    [1, -1, -6.0, -9.2, '#e8e4dc', 3],
  ];
  pumpJobs.forEach(([pi, side, cx, cz, col, pal], i) => {
    const [px, pz] = PUMPS[pi];
    const g = new THREE.Group();
    g.position.set(px + side * 0.45, 0.68, pz);
    ctx.roomGroup('patio').add(g);
    // os 3 bicos (realce: o núcleo destaca o certo)
    const nz = ctx.gb('vc');
    nz.ao = false;
    NOZZLE.forEach((c, k) => {
      nz.box(0.05, 0.05, 0.16, 0, 0.04, -0.15 + k * 0.15, c);
      nz.cyl(0.012, 0.012, 0.12, side * 0.05, 0.0, -0.15 + k * 0.15, '#c8ccd2', 6, 0, Math.PI / 2);
    });
    ctx.mesh('patio', nz, 'vc', 0, 0, 0, 0, g);
    const carG = car(ctx, 'patio', col, cx, cz, Math.PI, i ? 'van' : 'hatch', true);
    const drv = bloopProp(ctx, 'patio', BLOOP_PALS[pal], cx - 0.4, 0.42, cz - 0.3, Math.PI, 0.95, i ? 'cap' : '', 'sit');
    carG.attach(drv.mesh);
    drv.mesh.userData.faces = drv.faces;
    ctx.refs.set('pumpCar' + i, carG);
    ctx.refs.set('pumpDriver' + i, drv.mesh);
    // mangueira esticada até o carro (abastecendo)
    const hose = new THREE.Group();
    ctx.roomGroup('patio').add(hose);
    const hg = ctx.gb('vc');
    hg.tube(
      [
        [px + side * 0.2, 2.05, pz],
        [px + side * 0.9, 1.3, pz + 0.2],
        [cx + 0.95 * -side, 0.85, cz + 1.0],
      ],
      0.022,
      '#1a1a1e',
      14,
      5,
    );
    ctx.mesh('patio', hg, 'vc', 0, 0, 0, 0, hose);
    hose.visible = false;
    ctx.box(cx - 1, cz - 2, cx + 1, cz + 2, 0, 1.7);
    addTask(ctx, 'bomba' + (i + 1), 'patio', 'pump', g, [px + side * 0.85, pz], (s) => {
      carG.visible = s !== 'empty';
      hose.visible = s === 'fueling';
    });
  });

  // ---------------------------------------------------------------- repor prateleira
  {
    const [gi, side, lv, z0, z1] = RESTOCK;
    const gx = GONDOLAS[gi];
    const items = ctx.gb('vc');
    items.ao = false;
    productRow(items, 2, gx + side * 0.33, LEVELS[lv], z0, z1, ['#3aa0ff', '#3aa0ff', '#5ad06a']);
    productRow(items, 2, gx + side * 0.21, LEVELS[lv], z0, z1, ['#3aa0ff', '#5ad06a', '#3aa0ff']);
    const row = ctx.mesh('loja', items, 'vc');
    row.visible = false;
    // carrinho com caixa no fim do corredor
    const cart = ctx.gb('vc');
    cart.box(0.6, 0.05, 0.9, 0, 0.2, 0, '#5a6468');
    for (const s of [-1, 1]) for (const t of [-1, 1]) cart.cyl(0.05, 0.05, 0.04, s * 0.25, 0.04, t * 0.38, '#2a2a30', 8, 0, Math.PI / 2);
    cart.cyl(0.015, 0.015, 0.8, 0, 0.25, -0.44, '#5a6468', 6, -0.15);
    cart.box(0.5, 0.36, 0.5, 0, 0.25, 0.1, '#c89a6a');
    cart.box(0.52, 0.02, 0.2, 0, 0.6, -0.05, '#b8885a', 0, -0.6);
    const cm = ctx.mesh('loja', cart, 'vc', -5.5, 0, 13.3, 0.2);
    ctx.boxAt(-5.5, 13.3, 0.7, 1.0, 0, 1);
    const bottles = ctx.gb('vc');
    bottles.ao = false;
    for (let i = 0; i < 6; i++) bottles.cyl(0.03, 0.04, 0.24, -0.15 + (i % 3) * 0.15, 0.6, -0.05 + Math.floor(i / 3) * 0.15, PRODUCT_COLS[2], 8);
    const bm = ctx.mesh('loja', bottles, 'vc', 0, 0, 0, 0, cm);
    addTask(ctx, 'repor', 'loja', 'restock', row, [gx + side * 1.0, (z0 + z1) / 2], (s) => {
      const full = s === 'full';
      row.visible = full;
      bm.visible = !full;
    });
  }

  // ---------------------------------------------------------------- caixa
  {
    const g = new THREE.Group();
    g.position.set(1.0, 1.025, 5.0);
    g.rotation.y = Math.PI / 2; // frente (+Z local) para o funcionário (+X)
    ctx.roomGroup('loja').add(g);
    const b = ctx.gb('vc');
    b.box(0.42, 0.1, 0.4, 0, 0, 0, '#2a2a32');
    b.box(0.4, 0.06, 0.3, 0, 0.1, 0.02, '#3a3a44', 0, -0.12);
    for (let k = 0; k < 12; k++) b.box(0.05, 0.015, 0.04, -0.12 + (k % 4) * 0.08, 0.15, 0.1 - Math.floor(k / 4) * 0.06, k === 11 ? '#3ad06a' : '#d8d8e0', 0, -0.12);
    b.cyl(0.03, 0.03, 0.22, 0, 0.08, -0.06, '#2a2a32', 8);
    b.box(0.38, 0.28, 0.05, 0, 0.27, -0.06, '#1a1a20', 0, -0.22);
    b.box(0.2, 0.16, 0.03, 0, 0.18, -0.2, '#1a1a20');
    // leitor de código e maquininha de cartão
    b.box(0.1, 0.06, 0.16, 0.32, 0, 0.05, '#2a2a30');
    b.box(0.08, 0.03, 0.14, 0.3, 0.0, -0.22, '#3a3a44');
    ctx.mesh('loja', b, 'vc', 0, 0, 0, 0, g);
    const staff = ctx.picture('loja', atmScreen(), 0.33, 0.23, 0, 0.41, -0.02, 0, true, g);
    staff.rotation.x = -0.22;
    const cust = ctx.picture('loja', atmScreen(), 0.17, 0.13, 0, 0.26, -0.218, Math.PI, true, g);
    ctx.refs.set('register', g);
    ctx.refs.set('regCust', cust);
    addTask(ctx, 'caixa', 'loja', 'register', g, [2.05, 5.0]);
  }

  // ---------------------------------------------------------------- máquina de café
  {
    const g = new THREE.Group();
    g.position.set(-9.62, 1.0, 8.55);
    g.rotation.y = Math.PI / 2;
    ctx.roomGroup('loja').add(g);
    const b = ctx.gb('vc');
    b.box(0.7, 0.75, 0.5, 0, 0, -0.02, '#2a2a30');
    b.box(0.72, 0.1, 0.52, 0, 0.75, -0.02, '#c8302a');
    b.box(0.5, 0.06, 0.2, 0, 0.0, 0.2, '#8a8e98');
    for (let k = 0; k < 3; k++) b.cyl(0.02, 0.02, 0.05, -0.15 + k * 0.15, 0.32, 0.18, '#c8ccd2', 8);
    b.box(0.55, 0.12, 0.02, 0, 0.5, 0.24, '#1a1a20');
    ctx.mesh('loja', b, 'vc', 0, 0, 0, 0, g);
    ctx.g('loja', 'glow').box(0.02, 0.09, 0.5, -9.62 + 0.255, 1.51, 8.55, '#7affc8');
    const cg = ctx.gb('vc');
    cg.ao = false;
    cup3(cg, 0, 0, 0, 1.0, '#f2f0ea', '#6a3a1a');
    const cup = ctx.mesh('loja', cg, 'vc', 0, 0.06, 0.17, 0, g);
    cup.visible = false;
    const stream = new THREE.Mesh(ctx.track(new THREE.CylinderGeometry(0.006, 0.006, 0.18, 5)), new THREE.MeshBasicMaterial({ color: '#4a2410' }));
    ctx.adopt('loja', stream.material as THREE.Material, true, new THREE.Color('#4a2410'));
    stream.position.set(0, 0.22, 0.18);
    stream.visible = false;
    g.add(stream);
    ctx.refs.set('coffee', g);
    ctx.refs.set('coffeeCup', cup);
    ctx.refs.set('coffeeStream', stream);
    addTask(ctx, 'cafe', 'loja', 'coffee', g, [-8.6, 8.55], (s) => {
      cup.visible = s !== 'idle';
      stream.visible = s === 'brewing';
    });
  }

  // ---------------------------------------------------------------- passar pano (refrigerante no corredor)
  {
    const g = new THREE.Group();
    g.position.set(-2.9, 0, 10.4);
    ctx.roomGroup('loja').add(g);
    const pg = new THREE.CircleGeometry(0.5, 18);
    pg.rotateX(-Math.PI / 2);
    pg.scale(0.8, 1, 1.2);
    const n = pg.getAttribute('position').count;
    const c = new THREE.Color('#ff8a2a');
    pg.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => [c.r, c.g, c.b][i % 3]), 3));
    const pm = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    ctx.adopt('loja', pm);
    const puddle = new THREE.Mesh(ctx.track(pg), pm);
    puddle.position.y = 0.004;
    puddle.renderOrder = 2;
    g.add(puddle);
    ctx.bakeMesh('loja', puddle);
    const bt = ctx.gb('vc');
    bt.cyl(0.04, 0.04, 0.26, 0, 0.04, 0, '#ff8a2a', 10, 0, Math.PI / 2);
    const bottle = ctx.mesh('loja', bt, 'vc', 0.35, 0, 0.3, 0.6, g);
    const sg = ctx.gb('vc');
    sg.box(0.32, 0.6, 0.03, 0, 0, 0.09, '#ffd23a', 0, -0.28);
    sg.box(0.32, 0.6, 0.03, 0, 0, -0.09, '#ffd23a', 0, 0.28);
    const signM = ctx.mesh('loja', sg, 'vc', 0, 0, -0.85, 0, g);
    ctx.refs.set('spill', g);
    addTask(ctx, 'pano', 'loja', 'mop', g, [-2.9, 9.3], (s) => {
      const dirty = s !== 'clean';
      puddle.visible = dirty;
      bottle.visible = dirty;
      signM.visible = dirty;
    });
  }

  // ---------------------------------------------------------------- lixo (lixeira da calçada)
  {
    const g = new THREE.Group();
    g.position.set(-6.2, 0.11, 0.7);
    ctx.roomGroup('patio').add(g);
    const b = ctx.gb('vc');
    b.box(0.55, 0.95, 0.55, 0, 0, 0, '#2a6ad8');
    b.box(0.6, 0.08, 0.6, 0, 0.95, 0, '#1a3a8a');
    b.box(0.3, 0.12, 0.04, 0, 0.82, -0.29, '#10204a');
    ctx.mesh('patio', b, 'vc', 0, 0, 0, 0, g);
    ctx.boxAt(-6.2, 0.7, 0.6, 0.6);
    const fl = ctx.gb('vc');
    fl.sph(0.3, 0, 1.08, 0, '#2a2a30', 1, 0.6, 1, 10);
    fl.box(0.12, 0.02, 0.2, 0.45, -0.1, -0.3, '#f2f2f2', 0.4);
    fl.cyl(0.04, 0.04, 0.14, -0.4, -0.1, -0.35, '#e8423a', 8, 0, Math.PI / 2);
    fl.box(0.16, 0.02, 0.1, -0.2, -0.1, -0.55, '#ffd23a', 1.2);
    const full = ctx.mesh('patio', fl, 'vc', 0, 0, 0, 0, g);
    addTask(ctx, 'lixo', 'patio', 'trash', g, [-6.2, -0.1], (s) => (full.visible = s !== 'empty'));
  }
}
